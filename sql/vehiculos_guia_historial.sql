-- sql/vehiculos_guia_historial.sql
-- Historial del gestor (guía responsable) de cada vehículo (2026-11-05).
--
-- Para el tablero "Control de gestores": la ocupación y el churn de semanas pasadas
-- se le tienen que cargar al gestor que tenía el auto EN ESE MOMENTO, no al de hoy.
-- vehiculos.guia_responsable solo guarda el valor actual; acá queda cada período.
--
-- Cada fila es un período: el auto tuvo a `guia` desde `desde` hasta `hasta`
-- (hasta NULL = sigue hoy). Un auto sin responsable (taller, robo, baja) no tiene
-- período abierto. Lo llena un trigger, así que registra todos los cambios: a mano
-- desde Vehículos, los del reparto y los automáticos al cambiar de estado.
--
-- Lo de antes no se puede recuperar: el historial arranca cuando se corre este
-- archivo, con el gestor que cada auto tiene hoy. Para fechas anteriores,
-- guia_vehiculo_en() devuelve el primer gestor registrado del auto.
--
-- Se puede correr más de una vez. Necesita sql/vehiculos_guia_responsable.sql.

CREATE TABLE IF NOT EXISTS public.vehiculos_guia_historial (
  id           bigserial   PRIMARY KEY,
  vehiculo_id  uuid        NOT NULL REFERENCES public.vehiculos(id) ON DELETE CASCADE,
  guia         text        NOT NULL,
  desde        timestamptz NOT NULL DEFAULT now(),
  hasta        timestamptz,
  -- Quién hizo el cambio (NULL si fue automático, por ejemplo desde el reparto)
  cambiado_por uuid        DEFAULT auth.uid(),
  CHECK (hasta IS NULL OR hasta >= desde)
);

-- Un solo período abierto por vehículo
CREATE UNIQUE INDEX IF NOT EXISTS vehiculos_guia_historial_abierto
  ON public.vehiculos_guia_historial (vehiculo_id) WHERE hasta IS NULL;
CREATE INDEX IF NOT EXISTS vehiculos_guia_historial_vehiculo
  ON public.vehiculos_guia_historial (vehiculo_id, desde);
CREATE INDEX IF NOT EXISTS vehiculos_guia_historial_guia
  ON public.vehiculos_guia_historial (guia, desde);

ALTER TABLE public.vehiculos_guia_historial ENABLE ROW LEVEL SECURITY;
-- Solo lectura desde la app: escribe únicamente el trigger
DROP POLICY IF EXISTS vehiculos_guia_historial_select ON public.vehiculos_guia_historial;
CREATE POLICY vehiculos_guia_historial_select ON public.vehiculos_guia_historial
  FOR SELECT TO authenticated USING (true);

-- Trigger AFTER: corre después de trg_vehiculos_guia_responsable (BEFORE), así
-- registra el gestor que de verdad quedó guardado.
CREATE OR REPLACE FUNCTION trg_vehiculos_guia_historial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.guia_responsable IS NOT DISTINCT FROM OLD.guia_responsable THEN
    RETURN NULL;
  END IF;

  -- Cierra el período anterior
  UPDATE vehiculos_guia_historial
     SET hasta = now()
   WHERE vehiculo_id = NEW.id AND hasta IS NULL;

  -- Abre el nuevo (si quedó sin responsable, no hay período abierto)
  IF NEW.guia_responsable IS NOT NULL THEN
    INSERT INTO vehiculos_guia_historial (vehiculo_id, guia, desde)
    VALUES (NEW.id, NEW.guia_responsable, now());
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS vehiculos_guia_historial ON public.vehiculos;
CREATE TRIGGER vehiculos_guia_historial
  AFTER INSERT OR UPDATE OF guia_responsable ON public.vehiculos
  FOR EACH ROW EXECUTE FUNCTION trg_vehiculos_guia_historial();

-- Gestor de un vehículo en un momento dado.
--  * El período que contiene ese momento.
--  * Antes de que empezara el historial: el primer gestor registrado del auto.
--  * NULL si en ese momento no tenía responsable (taller, robo...) o nunca tuvo.
CREATE OR REPLACE FUNCTION guia_vehiculo_en(p_vehiculo_id uuid, p_momento timestamptz)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT h.guia FROM vehiculos_guia_historial h
      WHERE h.vehiculo_id = p_vehiculo_id
        AND h.desde <= p_momento
        AND (h.hasta IS NULL OR h.hasta > p_momento)
      ORDER BY h.desde DESC
      LIMIT 1),
    (SELECT h.guia FROM vehiculos_guia_historial h
      WHERE h.vehiculo_id = p_vehiculo_id
        AND h.desde > p_momento
        AND NOT EXISTS (SELECT 1 FROM vehiculos_guia_historial h0
                         WHERE h0.vehiculo_id = p_vehiculo_id AND h0.desde <= p_momento)
      ORDER BY h.desde
      LIMIT 1)
  )
$$;

GRANT EXECUTE ON FUNCTION guia_vehiculo_en(uuid, timestamptz) TO authenticated;

-- Punto de partida: el gestor que cada auto tiene hoy (solo los que todavía no
-- tienen período abierto, para poder correr el archivo de nuevo sin duplicar).
INSERT INTO vehiculos_guia_historial (vehiculo_id, guia, desde, cambiado_por)
SELECT v.id, v.guia_responsable, now(), NULL
FROM vehiculos v
WHERE v.guia_responsable IS NOT NULL
  AND v.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM vehiculos_guia_historial h
    WHERE h.vehiculo_id = v.id AND h.hasta IS NULL
  );

-- Para revisar:
-- SELECT guia, count(*) AS autos FROM vehiculos_guia_historial WHERE hasta IS NULL GROUP BY 1 ORDER BY 1;
-- SELECT v.patente, h.guia, h.desde, h.hasta
--   FROM vehiculos_guia_historial h JOIN vehiculos v ON v.id = h.vehiculo_id
--  ORDER BY v.patente, h.desde;
