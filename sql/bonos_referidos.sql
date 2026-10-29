-- Bonos a embajadores por referidos (2026-10-27)
--
-- Cuando un conductor referido (conductores.referido = true, embajador_id cargado)
-- cumple un hito, se le paga al EMBAJADOR un bono de $35.000 con una incidencia
-- a favor "Comisión referidos" ya aplicada (penalidad aplicado = true) en la semana
-- del hito, para que entre sola en su facturación.
--
-- Hitos (cada uno se paga una sola vez por referido):
--   7  -> el referido completa 7 días seguidos de asignación.
--   35 -> el referido completa 35 días seguidos de asignación (incluye los 7).
--
-- Reglas acordadas:
--   * Días seguidos = asignaciones (activas o finalizadas, sin las canceladas) unidas
--     en una racha; cambiar de auto o de asignación no corta. Más de 1 día sin
--     asignación corta la racha y el conteo vuelve a cero.
--   * Sin pagos para atrás: solo hitos cumplidos desde FECHA_ACTIVACION.
--   * El embajador tiene que estar ACTIVO y haber tenido alguna asignación. Si no
--     cumple el día que se procesa el hito, el bono se pierde (queda 'descartado'
--     en la tabla de control y no se reintenta).
--   * Semana: la del hito; si ese período de facturación de la sede del embajador
--     está cerrado, la siguiente semana abierta.
--   * Patente / turno: los de la asignación activa del embajador (vacío / 'Turno'
--     si no tiene). Área 'Administración' y registrado por 'R2D2', igual que las
--     incidencias que ya genera R2D2.
--
-- Corre todos los días por pg_cron (job 'bonos-referidos'). La tabla
-- bonos_referidos (unique referido + hito) evita pagar dos veces.

BEGIN;

CREATE TABLE IF NOT EXISTS public.bonos_referidos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referido_id   uuid NOT NULL REFERENCES public.conductores(id) ON DELETE CASCADE,
  embajador_id  uuid NOT NULL REFERENCES public.conductores(id) ON DELETE CASCADE,
  hito          smallint NOT NULL CHECK (hito IN (7, 35)),
  fecha_hito    date NOT NULL,
  racha_desde   date NOT NULL,
  estado        text NOT NULL CHECK (estado IN ('creado', 'descartado')),
  motivo        text,
  monto         numeric(12,2),
  semana        smallint,
  anio          smallint,
  incidencia_id uuid REFERENCES public.incidencias(id) ON DELETE SET NULL,
  penalidad_id  uuid REFERENCES public.penalidades(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (referido_id, hito)
);

CREATE INDEX IF NOT EXISTS idx_bonos_referidos_embajador ON public.bonos_referidos(embajador_id);

ALTER TABLE public.bonos_referidos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bonos_referidos_select ON public.bonos_referidos;
CREATE POLICY bonos_referidos_select ON public.bonos_referidos
  FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.bonos_referidos TO authenticated;

CREATE OR REPLACE FUNCTION public.procesar_bonos_referidos()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  FECHA_ACTIVACION constant date := DATE '2026-10-27';
  MONTO_BONO       constant numeric := 35000;
  TZ               constant text := 'America/Argentina/Buenos_Aires';

  hoy        date := (now() AT TIME ZONE TZ)::date;
  v_tipo_id  uuid;
  v_estado_id uuid;
  r          record;
  p          record;
  emb        record;
  asig       record;
  racha_ini  date;
  racha_fin  date;
  hito7_fecha date;
  hito7_desde date;
  hito35_fecha date;
  hito35_desde date;
  h          int;
  f_hito     date;
  f_desde    date;
  lunes      date;
  intento    int;
  v_semana   int;
  v_anio     int;
  v_turno    text;
  v_desc     text;
  v_inc_id   uuid;
  v_pen_id   uuid;
  v_motivo   text;
  resultado  jsonb := '[]'::jsonb;
BEGIN
  SELECT id INTO v_tipo_id FROM tipos_cobro_descuento WHERE codigo = 'COMISION_REFERIDOS' LIMIT 1;
  IF v_tipo_id IS NULL THEN
    RAISE EXCEPTION 'No existe el tipo de cobro COMISION_REFERIDOS';
  END IF;
  SELECT id INTO v_estado_id FROM incidencias_estados WHERE codigo = 'PENDIENTE' LIMIT 1;

  FOR r IN
    SELECT c.id, c.embajador_id,
           trim(regexp_replace(coalesce(c.nombres, '') || ' ' || coalesce(c.apellidos, ''), '\s+', ' ', 'g')) AS nombre
    FROM conductores c
    WHERE c.referido = true
      AND c.embajador_id IS NOT NULL
      AND c.embajador_id <> c.id
      -- ya tiene los dos hitos procesados: nada que hacer
      AND (SELECT count(*) FROM bonos_referidos b WHERE b.referido_id = c.id) < 2
  LOOP
    -- Rachas de días seguidos del referido (más de 1 día sin asignación corta).
    racha_ini := NULL; racha_fin := NULL;
    hito7_fecha := NULL; hito35_fecha := NULL;
    FOR p IN
      SELECT (ac.fecha_inicio AT TIME ZONE TZ)::date AS ini,
             CASE WHEN a.estado = 'activa' AND ac.fecha_fin IS NULL THEN hoy
                  ELSE least(hoy, (coalesce(ac.fecha_fin, a.fecha_fin, now()) AT TIME ZONE TZ)::date)
             END AS fin
      FROM asignaciones_conductores ac
      JOIN asignaciones a ON a.id = ac.asignacion_id
      WHERE ac.conductor_id = r.id
        AND a.estado IN ('activa', 'finalizada')
        AND coalesce(ac.estado, '') <> 'cancelado'
        AND ac.fecha_inicio IS NOT NULL
        AND (ac.fecha_inicio AT TIME ZONE TZ)::date <= hoy
      ORDER BY 1, 2
    LOOP
      IF racha_ini IS NULL THEN
        racha_ini := p.ini; racha_fin := p.fin;
      ELSIF p.ini <= racha_fin + 2 THEN          -- hueco de 0 o 1 día: sigue la racha
        racha_fin := greatest(racha_fin, p.fin);
      ELSE
        racha_ini := p.ini; racha_fin := p.fin;  -- se cortó: empieza otra
      END IF;
      -- Primer momento en que alguna racha llega a 7 / 35 días
      IF hito7_fecha IS NULL AND racha_fin - racha_ini + 1 >= 7 THEN
        hito7_fecha := racha_ini + 6; hito7_desde := racha_ini;
      END IF;
      IF hito35_fecha IS NULL AND racha_fin - racha_ini + 1 >= 35 THEN
        hito35_fecha := racha_ini + 34; hito35_desde := racha_ini;
      END IF;
    END LOOP;

    FOREACH h IN ARRAY ARRAY[7, 35] LOOP
      IF h = 7 THEN f_hito := hito7_fecha; f_desde := hito7_desde;
      ELSE f_hito := hito35_fecha; f_desde := hito35_desde; END IF;

      CONTINUE WHEN f_hito IS NULL;                       -- todavía no lo cumplió
      CONTINUE WHEN f_hito < FECHA_ACTIVACION;            -- sin pagos para atrás
      CONTINUE WHEN EXISTS (SELECT 1 FROM bonos_referidos b WHERE b.referido_id = r.id AND b.hito = h);

      -- Condiciones del embajador
      SELECT c.id, c.sede_id, ce.codigo AS estado,
             trim(regexp_replace(coalesce(c.nombres, '') || ' ' || coalesce(c.apellidos, ''), '\s+', ' ', 'g')) AS nombre,
             EXISTS (
               SELECT 1 FROM asignaciones_conductores ac
               JOIN asignaciones a ON a.id = ac.asignacion_id
               WHERE ac.conductor_id = c.id
                 AND a.estado IN ('activa', 'finalizada')
                 AND coalesce(ac.estado, '') <> 'cancelado'
                 AND ac.fecha_inicio IS NOT NULL
                 AND ac.fecha_inicio <= now()
             ) AS tuvo_asignacion
      INTO emb
      FROM conductores c
      LEFT JOIN conductores_estados ce ON ce.id = c.estado_id
      WHERE c.id = r.embajador_id;

      v_motivo := NULL;
      IF emb.id IS NULL THEN
        v_motivo := 'El embajador no existe';
      ELSIF upper(coalesce(emb.estado, '')) <> 'ACTIVO' THEN
        v_motivo := 'Embajador no activo (' || coalesce(emb.estado, 'sin estado') || ')';
      ELSIF NOT emb.tuvo_asignacion THEN
        v_motivo := 'Embajador sin asignaciones previas';
      END IF;

      IF v_motivo IS NOT NULL THEN
        INSERT INTO bonos_referidos (referido_id, embajador_id, hito, fecha_hito, racha_desde, estado, motivo)
        VALUES (r.id, r.embajador_id, h, f_hito, f_desde, 'descartado', v_motivo);
        resultado := resultado || jsonb_build_object(
          'referido', r.nombre, 'hito', h, 'fecha_hito', f_hito, 'estado', 'descartado', 'motivo', v_motivo);
        CONTINUE;
      END IF;

      -- Semana: la del hito o, si está cerrada para la sede del embajador, la siguiente abierta.
      lunes := date_trunc('week', f_hito)::date;
      intento := 0;
      WHILE intento < 12 AND EXISTS (
        SELECT 1 FROM periodos_facturacion pf
        WHERE pf.fecha_inicio = lunes AND pf.estado = 'cerrado'
          AND (emb.sede_id IS NULL OR pf.sede_id = emb.sede_id)
      ) LOOP
        lunes := lunes + 7; intento := intento + 1;
      END LOOP;
      v_semana := extract(week FROM lunes)::int;
      v_anio := extract(isoyear FROM lunes)::int;

      -- Patente y turno de la asignación activa del embajador
      SELECT a.vehiculo_id, v.patente, a.modalidad, ac.horario
      INTO asig
      FROM asignaciones a
      JOIN asignaciones_conductores ac ON ac.asignacion_id = a.id
      LEFT JOIN vehiculos v ON v.id = a.vehiculo_id
      WHERE ac.conductor_id = emb.id AND a.estado = 'activa'
        AND coalesce(ac.estado, '') <> 'cancelado'
      ORDER BY ac.fecha_inicio DESC NULLS LAST
      LIMIT 1;

      v_turno := CASE
        WHEN asig.modalidad = 'a_cargo' OR asig.horario = 'todo_dia' THEN 'A cargo'
        WHEN asig.horario = 'nocturno' THEN 'Nocturno'
        WHEN asig.horario = 'diurno' THEN 'Diurno'
        ELSE 'Turno'
      END;

      v_desc := format('Comisión referidos: %s cumplió %s días seguidos (desde %s). Bono automático al embajador %s.',
                       r.nombre, h, to_char(f_desde, 'DD/MM/YYYY'), emb.nombre);

      INSERT INTO incidencias (
        vehiculo_id, conductor_id, estado_id, sede_id, semana, fecha, turno, area, descripcion,
        registrado_por, conductor_nombre, vehiculo_patente, tipo, tipo_cobro_descuento_id, monto,
        created_by_name
      ) VALUES (
        asig.vehiculo_id, emb.id, v_estado_id, emb.sede_id, v_semana, greatest(f_hito, lunes), v_turno, 'Administración', v_desc,
        'R2D2', emb.nombre, asig.patente, 'cobro', v_tipo_id, MONTO_BONO,
        'R2D2'
      ) RETURNING id INTO v_inc_id;

      INSERT INTO penalidades (
        incidencia_id, vehiculo_id, conductor_id, tipo_cobro_descuento_id, semana, fecha, turno,
        area_responsable, detalle, monto, observaciones, aplicado, fecha_aplicacion,
        conductor_nombre, vehiculo_patente, created_by_name, fraccionado,
        semana_aplicacion, anio_aplicacion, rechazado, sede_id
      ) VALUES (
        v_inc_id, asig.vehiculo_id, emb.id, v_tipo_id, v_semana, greatest(f_hito, lunes), v_turno,
        'ADMINISTRACION', 'Comisión referidos', MONTO_BONO, v_desc, true, hoy,
        emb.nombre, asig.patente, 'R2D2', false,
        v_semana, v_anio, false, emb.sede_id
      ) RETURNING id INTO v_pen_id;

      INSERT INTO bonos_referidos (referido_id, embajador_id, hito, fecha_hito, racha_desde, estado,
                                   monto, semana, anio, incidencia_id, penalidad_id)
      VALUES (r.id, emb.id, h, f_hito, f_desde, 'creado', MONTO_BONO, v_semana, v_anio, v_inc_id, v_pen_id);

      resultado := resultado || jsonb_build_object(
        'referido', r.nombre, 'embajador', emb.nombre, 'hito', h, 'fecha_hito', f_hito,
        'semana', v_semana, 'anio', v_anio, 'estado', 'creado');
    END LOOP;
  END LOOP;

  RETURN resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.procesar_bonos_referidos() FROM PUBLIC, anon, authenticated;

-- Todos los días a las 06:00 AR (09:00 UTC)
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'bonos-referidos';
SELECT cron.schedule('bonos-referidos', '0 9 * * *', 'SELECT public.procesar_bonos_referidos()');

COMMIT;
