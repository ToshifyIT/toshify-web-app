-- sql/conductores_notas_cobranza.sql
-- Bitácora de cobranza de cada conductor (2026-11-18, reunión con Gandhy).
--
-- Igual que la bitácora de vehículos (sql/vehiculos_notas.sql): cada nota es una fila
-- con fecha y quién la escribió; solo se agregan, no se editan ni se borran desde la app.
-- La ven los cobradores en el detalle del conductor (pestaña Cobranza) antes de llamar.
--
-- origen: 'app' (cargada en la bitácora) o 'carga_inicial' (Excel de observaciones
-- por conductor que manda Gandhy, cargado de una vez).
--
-- Se puede correr más de una vez.

BEGIN;

CREATE TABLE IF NOT EXISTS public.conductores_notas_cobranza (
  id             bigserial   PRIMARY KEY,
  conductor_id   uuid        NOT NULL REFERENCES public.conductores(id) ON DELETE CASCADE,
  nota           text        NOT NULL CHECK (length(trim(nota)) > 0),
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid        DEFAULT auth.uid(),
  usuario_nombre text,
  origen         text        NOT NULL DEFAULT 'app'
);

CREATE INDEX IF NOT EXISTS conductores_notas_cobranza_conductor
  ON public.conductores_notas_cobranza (conductor_id, created_at DESC);

ALTER TABLE public.conductores_notas_cobranza ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conductores_notas_cobranza_select ON public.conductores_notas_cobranza;
CREATE POLICY conductores_notas_cobranza_select ON public.conductores_notas_cobranza
  FOR SELECT TO authenticated USING (true);

-- Solo agregar, y a nombre propio
DROP POLICY IF EXISTS conductores_notas_cobranza_insert ON public.conductores_notas_cobranza;
CREATE POLICY conductores_notas_cobranza_insert ON public.conductores_notas_cobranza
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

-- Completa el nombre de quien escribe
CREATE OR REPLACE FUNCTION trg_conductores_notas_cobranza_nombre()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.usuario_nombre IS NULL AND NEW.created_by IS NOT NULL THEN
    SELECT full_name INTO NEW.usuario_nombre FROM user_profiles WHERE id = NEW.created_by;
  END IF;
  NEW.nota := trim(NEW.nota);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS conductores_notas_cobranza_nombre ON public.conductores_notas_cobranza;
CREATE TRIGGER conductores_notas_cobranza_nombre
  BEFORE INSERT ON public.conductores_notas_cobranza
  FOR EACH ROW EXECUTE FUNCTION trg_conductores_notas_cobranza_nombre();

COMMIT;

NOTIFY pgrst, 'reload schema';
