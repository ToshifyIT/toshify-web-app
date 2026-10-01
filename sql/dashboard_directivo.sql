-- =====================================================
-- RPC: get_dashboard_directivo  (v2: período semanal, zonas y perfil)
-- Indicadores del Dashboard Directivo (Reportes > Dashboard Directivo).
-- Todo el cálculo se hace en la base: el navegador recibe un JSON chico.
--
-- Solo lectura (STABLE, SECURITY INVOKER): respeta las políticas RLS del
-- usuario que la llama. No crea, modifica ni borra datos.
--
-- PERÍODO
--   [p_desde, p_hasta] (el frontend usa semanas lunes a domingo). p_hasta se
--   recorta a hoy. Cada indicador de flujo se calcula también para el período
--   anterior (mismo largo, desplazado en semanas completas) para la variación.
--   Default: últimas 4 semanas.
--
-- CONDUCTORES: períodos de actividad
--   - Alta: fecha_contratacion; si falta, fecha del primer turno; si tampoco
--     hay, created_at (esas altas se informan como estimadas).
--   - Bajas y reactivaciones: conductores_historial_bajas
--       baja         -> fecha_terminacion_nueva (o fecha del registro)
--       reactivacion -> fecha del registro
--   - Sin historial: baja en fecha_terminacion; activos con
--     fecha_reincorpoaracion > fecha_terminacion: baja + reactivación.
--   - Si el estado actual no coincide con el último evento del historial,
--     se agrega el evento que falta.
--   - Baja sin fecha_terminacion: se ESTIMA con el último cambio a BAJA en
--     historial_conductores, el último fin de asignación o updated_at.
--   - Consistencia: ningún evento antes del alta ni después de hoy; un
--     conductor no ACTIVO nunca queda con un período abierto.
--
-- FOTO ACTUAL: "en la calle" = estado ACTIVO con asignación vigente; "en
--   espera" = estado ACTIVO sin asignación vigente (en la calle + en espera =
--   activos). conductores_activos (por estado) se
--   mantiene en el JSON como referencia.
--
-- PRIMER TURNO: primera asignación no cancelada con inicio <= hoy.
--
-- CAÍDAS: personas con una programación o asignación cancelada en el período
--   que nunca tuvieron primer turno, con el motivo cargado al cancelar.
--
-- CAMINO A LA CALLE: total = mediana de días de lead a primer turno; el
--   reparto entre captación y entrega usa la suma de días de cada etapa sobre
--   la misma población, para que las dos etapas sumen el total.
--
-- LEADS: ingreso = created_at en hora Argentina (columna "Creación" del
--   módulo Leads). Lead y conductor se unen por DNI (solo dígitos).
--
-- ZONAS (helper dashboard_directivo_zona, misma lógica que zonaUtils.ts):
--   Conductor: campo zona -> coordenadas de la dirección -> texto de la
--     dirección -> zona de su última asignación -> 'Sin dato'.
--   Lead: campo zona -> coordenadas -> texto de la dirección -> 'Sin dato'.
--
-- PERFIL (últimos 12 meses, independiente del período elegido)
--   Solo atributos operativos: zona, turno del primer turno, fuente del lead,
--   pauta/campaña y rango de edad. No se usan nacionalidad ni estado civil.
--   - Retención: conductores que cumplieron 12 semanas desde su primer turno
--     en los últimos 12 meses; % que seguía activo en ese momento.
--   - Conversión: leads creados en los últimos 12 meses; % que llegó a un
--     primer turno.
--
-- Uso desde frontend:
--   supabase.rpc('get_dashboard_directivo', { p_sede_id, p_desde, p_hasta })
--   (p_hoy: fecha de corte opcional, solo para pruebas)
--
-- Para quitarla:
--   DROP FUNCTION IF EXISTS get_dashboard_directivo(uuid, date, date, date);
--   DROP FUNCTION IF EXISTS dashboard_directivo_zona(text, double precision, double precision, text);
-- Si se usa el entorno demo (esquema demo), crearla también en ese esquema.
-- =====================================================

-- ─────────────────────────────────────────────────────
-- Helper: zona normalizada (CABA / Norte / Sur / Oeste / GBA / otra).
-- Orden: campo zona -> coordenadas -> texto de la dirección. Devuelve NULL si
-- no se puede inferir. Replica src/utils/zonaUtils.ts (inferZona).
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION dashboard_directivo_zona(
  p_zona text,
  p_lat double precision,
  p_lng double precision,
  p_direccion text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $f$
  SELECT COALESCE(
    -- 1. Campo zona cargado
    (SELECT CASE
       WHEN z = '' THEN NULL
       WHEN UPPER(z) = 'CABA' THEN 'CABA'
       WHEN UPPER(z) = 'GBA' THEN 'GBA'
       WHEN LOWER(z) IN ('gba norte', 'norte', 'zona norte') THEN 'Norte'
       WHEN LOWER(z) IN ('gba sur', 'sur', 'zona sur') THEN 'Sur'
       WHEN LOWER(z) IN ('gba oeste', 'oeste', 'zona oeste') THEN 'Oeste'
       ELSE initcap(z)
     END
     FROM (SELECT btrim(regexp_replace(COALESCE(p_zona, ''), '\s+', ' ', 'g')) AS z) t),
    -- 2. Coordenadas (inferZonaFromCoords)
    CASE
      WHEN p_lat IS NULL OR p_lng IS NULL THEN NULL
      WHEN p_lat BETWEEN -34.71 AND -34.53 AND p_lng BETWEEN -58.53 AND -58.33 THEN 'CABA'
      WHEN NOT (p_lat BETWEEN -35.0 AND -34.3 AND p_lng BETWEEN -59.0 AND -58.0) THEN NULL
      WHEN p_lat > -34.53 AND p_lng BETWEEN -58.7 AND -58.3 THEN 'Norte'
      WHEN p_lat < -34.65 AND p_lng BETWEEN -58.5 AND -58.2 THEN 'Sur'
      WHEN p_lng < -58.53 THEN 'Oeste'
      WHEN p_lat > -34.60 THEN 'Norte'
      WHEN p_lat < -34.65 THEN 'Sur'
      ELSE 'GBA'
    END,
    -- 3. Texto de la dirección (inferZonaFromAddress)
    (SELECT CASE
       WHEN d = '' THEN NULL
       WHEN d ~ '(zona norte|san isidro|vicente l[oó]pez|san fernando|tigre|pilar|escobar|campana|z[aá]rate|muñiz|san miguel|jos[eé] c\. paz|malvinas argentinas)' THEN 'Norte'
       WHEN d ~ '(zona sur|lan[uú]s|avellaneda|quilmes|berazategui|lomas de zamora|almirante brown|florencio varela)' THEN 'Sur'
       WHEN d ~ '(zona oeste|mor[oó]n|merlo|moreno|la matanza|ituzaing[oó]|hurlingham|tres de febrero|san mart[ií]n)' THEN 'Oeste'
       WHEN d ~ '(^|[^a-z0-9])c[0-9]{4}([a-z]{3})?([^a-z0-9]|$)'  -- código postal de CABA (C1043 o C1043AAZ)
         OR d ~ '(caba|c\.a\.b\.a|c a b a|ciudad aut[oó]noma|cdad\.? aut[oó]noma|buenos aires city|capital federal|palermo|recoleta|microcentro|san nicol[aá]s|balvanera|caballito|villa crespo|belgrano|almagro|flores|boedo|barracas|la boca|san telmo|puerto madero|retiro|monserrat|constituci[oó]n|n[uú]ñez|colegiales|chacarita|villa urquiza|villa del parque|villa pueyrred[oó]n|villa devoto|saavedra|coghlan|parque chas|agronom[ií]a|paternal|villa ort[uú]zar|villa general mitre|villa santa rita|villa real|villa luro|liniers|mataderos|parque avellaneda|parque chacabuco|parque patricios|nueva pompeya|villa soldati|villa riachuelo|villa lugano)' THEN 'CABA'
       WHEN d ~ '(gba|gran buenos aires)' THEN 'GBA'
       ELSE NULL
     END
     FROM (SELECT LOWER(COALESCE(p_direccion, '')) AS d) t)
  )
$f$;

GRANT EXECUTE ON FUNCTION dashboard_directivo_zona(text, double precision, double precision, text) TO authenticated;

-- Versión anterior (otra firma): se elimina para evitar ambigüedad en la API.
DROP FUNCTION IF EXISTS get_dashboard_directivo(uuid, date, integer);

CREATE OR REPLACE FUNCTION get_dashboard_directivo(
  p_sede_id uuid DEFAULT NULL,
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL,
  p_hoy date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
WITH
h AS (
  SELECT COALESCE(p_hoy, (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date) AS hoy
),
p AS (
  SELECT
    h.hoy,
    LEAST(COALESCE(p_hasta, h.hoy), h.hoy) AS hasta,
    LEAST(
      COALESCE(p_desde, date_trunc('week', h.hoy)::date - 21),
      LEAST(COALESCE(p_hasta, h.hoy), h.hoy)
    ) AS desde
  FROM h
),
rangos AS (
  SELECT 'actual'::text AS rango, desde, hasta FROM p
  UNION ALL
  -- Período anterior: mismo largo, desplazado en semanas completas (compara los
  -- mismos días de la semana: p. ej. lunes a miércoles contra lunes a miércoles).
  SELECT 'anterior',
         desde - (CEIL((hasta - desde + 1) / 7.0) * 7)::int,
         hasta - (CEIL((hasta - desde + 1) / 7.0) * 7)::int
  FROM p
),

-- ───────────── Conductores ─────────────
cond_base AS (
  SELECT
    c.id,
    c.fecha_contratacion,
    c.fecha_nacimiento,
    (c.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS creado,
    UPPER(COALESCE(ce.codigo, '')) = 'ACTIVO' AS es_activo,
    c.fecha_terminacion,
    c.fecha_reincorpoaracion,
    (c.updated_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS actualizado,
    regexp_replace(COALESCE(c.numero_dni, ''), '\D', '', 'g') AS dni,
    dashboard_directivo_zona(c.zona, c.direccion_lat::double precision, c.direccion_lng::double precision, c.direccion) AS zona_legajo
  FROM conductores c
  LEFT JOIN conductores_estados ce ON ce.id = c.estado_id
  WHERE p_sede_id IS NULL OR c.sede_id = p_sede_id
),

turnos_validos AS (
  SELECT
    ac.conductor_id AS id,
    (COALESCE(ac.fecha_inicio, a.fecha_inicio_real, a.fecha_inicio)
      AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS fecha,
    LOWER(COALESCE(NULLIF(ac.horario, ''), a.horario, '')) AS horario
  FROM asignaciones_conductores ac
  JOIN asignaciones a ON a.id = ac.asignacion_id
  JOIN cond_base cb ON cb.id = ac.conductor_id
  CROSS JOIN h
  WHERE COALESCE(ac.estado, '') <> 'cancelado'
    AND COALESCE(a.estado, '') <> 'cancelada'
    AND COALESCE(ac.fecha_inicio, a.fecha_inicio_real, a.fecha_inicio) IS NOT NULL
    AND (COALESCE(ac.fecha_inicio, a.fecha_inicio_real, a.fecha_inicio)
         AT TIME ZONE 'America/Argentina/Buenos_Aires')::date <= h.hoy
),
primer_turno AS (
  SELECT DISTINCT ON (id) id, fecha, horario
  FROM turnos_validos
  ORDER BY id, fecha
),

fb_hist AS (
  SELECT hc.conductor_id AS id,
         MAX((hc.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date) AS fecha
  FROM historial_conductores hc
  JOIN cond_base cb ON cb.id = hc.conductor_id
  WHERE UPPER(COALESCE(hc.estado_nuevo, '')) = 'BAJA'
  GROUP BY hc.conductor_id
),
fb_asig AS (
  SELECT ac.conductor_id AS id,
         MAX((ac.fecha_fin AT TIME ZONE 'America/Argentina/Buenos_Aires')::date) AS fecha
  FROM asignaciones_conductores ac
  JOIN cond_base cb ON cb.id = ac.conductor_id
  WHERE ac.fecha_fin IS NOT NULL
  GROUP BY ac.conductor_id
),

-- Zona de la última asignación (respaldo cuando el legajo no tiene zona ni dirección útil)
ult_asig_zona AS (
  SELECT DISTINCT ON (ac.conductor_id)
         ac.conductor_id AS id,
         dashboard_directivo_zona(a.zona, NULL, NULL, NULL) AS zona
  FROM asignaciones_conductores ac
  JOIN asignaciones a ON a.id = ac.asignacion_id
  JOIN cond_base cb ON cb.id = ac.conductor_id
  WHERE btrim(COALESCE(a.zona, '')) <> ''
    AND COALESCE(ac.estado, '') <> 'cancelado'
    AND COALESCE(a.estado, '') <> 'cancelada'
  ORDER BY ac.conductor_id, COALESCE(ac.fecha_inicio, a.fecha_inicio_real, a.fecha_inicio) DESC NULLS LAST
),

-- Conductores EN LA CALLE (foto actual): estado ACTIVO y con una asignación
-- vigente, sin importar cuándo empezó (mismo criterio que el módulo
-- Conductores). Estado ACTIVO sin asignación vigente = "en espera".
en_la_calle AS (
  SELECT DISTINCT ac.conductor_id AS id
  FROM asignaciones_conductores ac
  JOIN asignaciones a ON a.id = ac.asignacion_id
  JOIN cond_base cb ON cb.id = ac.conductor_id
  WHERE cb.es_activo
    AND a.estado IN ('activo', 'activa')
    AND ac.estado IN ('asignado', 'activo')
),

cond AS (
  SELECT
    cb.*,
    LEAST(COALESCE(cb.fecha_contratacion, pt.fecha, cb.creado), h.hoy) AS alta,
    cb.fecha_contratacion IS NULL AS alta_estimada,
    COALESCE(fh.fecha, fa.fecha, cb.actualizado) AS baja_estimada,
    pt.fecha AS primer_turno,
    CASE
      WHEN pt.horario IN ('diurno', 'd') THEN 'Diurno'
      WHEN pt.horario IN ('nocturno', 'n') THEN 'Nocturno'
      WHEN pt.horario IN ('todo_dia', 'a_cargo', 'cargo') THEN 'A cargo'
      ELSE 'Sin dato'
    END AS turno,
    COALESCE(cb.zona_legajo, uz.zona, 'Sin dato') AS zona
  FROM cond_base cb
  CROSS JOIN h
  LEFT JOIN primer_turno pt ON pt.id = cb.id
  LEFT JOIN fb_hist fh ON fh.id = cb.id
  LEFT JOIN fb_asig fa ON fa.id = cb.id
  LEFT JOIN ult_asig_zona uz ON uz.id = cb.id
),

hist AS (
  SELECT
    hb.conductor_id AS id,
    CASE WHEN hb.tipo_evento = 'baja' THEN 'cierra' ELSE 'abre' END AS tipo,
    CASE WHEN hb.tipo_evento = 'baja'
      THEN COALESCE(hb.fecha_terminacion_nueva, (hb.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date)
      ELSE (hb.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
    END AS fecha,
    hb.created_at AS orden,
    FALSE AS estimada
  FROM conductores_historial_bajas hb
  JOIN cond ON cond.id = hb.conductor_id
  WHERE hb.tipo_evento IN ('baja', 'reactivacion')
),
ultimo_hist AS (
  SELECT DISTINCT ON (id) id, tipo, fecha
  FROM hist
  ORDER BY id, fecha DESC, orden DESC
),

eventos_crudos AS (
  SELECT id, 'abre'::text AS tipo, alta AS fecha, '-infinity'::timestamptz AS orden, FALSE AS estimada
  FROM cond

  UNION ALL
  SELECT id, tipo, fecha, orden, estimada FROM hist

  UNION ALL
  SELECT c.id, 'cierra', COALESCE(c.fecha_terminacion, c.baja_estimada, c.alta),
         'epoch'::timestamptz, c.fecha_terminacion IS NULL
  FROM cond c
  WHERE NOT c.es_activo
    AND NOT EXISTS (SELECT 1 FROM hist WHERE hist.id = c.id)

  UNION ALL
  SELECT c.id, 'cierra', c.fecha_terminacion, 'epoch'::timestamptz, FALSE
  FROM cond c
  WHERE c.es_activo
    AND c.fecha_terminacion IS NOT NULL
    AND c.fecha_reincorpoaracion > c.fecha_terminacion
    AND NOT EXISTS (SELECT 1 FROM hist WHERE hist.id = c.id)
  UNION ALL
  SELECT c.id, 'abre', c.fecha_reincorpoaracion, 'epoch'::timestamptz + interval '1 second', FALSE
  FROM cond c
  WHERE c.es_activo
    AND c.fecha_terminacion IS NOT NULL
    AND c.fecha_reincorpoaracion > c.fecha_terminacion
    AND NOT EXISTS (SELECT 1 FROM hist WHERE hist.id = c.id)

  UNION ALL
  SELECT c.id, 'cierra',
         CASE WHEN c.fecha_terminacion >= u.fecha THEN c.fecha_terminacion
              ELSE GREATEST(COALESCE(c.baja_estimada, u.fecha), u.fecha) END,
         'infinity'::timestamptz,
         NOT COALESCE(c.fecha_terminacion >= u.fecha, FALSE)
  FROM cond c
  JOIN ultimo_hist u ON u.id = c.id
  WHERE NOT c.es_activo AND u.tipo = 'abre'

  UNION ALL
  SELECT c.id, 'abre',
         CASE WHEN c.fecha_reincorpoaracion >= u.fecha THEN c.fecha_reincorpoaracion
              ELSE GREATEST(COALESCE(c.actualizado, u.fecha), u.fecha) END,
         'infinity'::timestamptz,
         FALSE
  FROM cond c
  JOIN ultimo_hist u ON u.id = c.id
  WHERE c.es_activo AND u.tipo = 'cierra'
),
eventos AS (
  SELECT e.id, e.tipo, LEAST(GREATEST(e.fecha, c.alta), h.hoy) AS fecha, e.orden, e.estimada
  FROM eventos_crudos e
  JOIN cond c ON c.id = e.id
  CROSS JOIN h
  WHERE e.fecha IS NOT NULL
),
eventos_ord AS (
  SELECT id, tipo, fecha, orden, estimada,
         LAG(tipo) OVER (PARTITION BY id ORDER BY fecha, orden) AS tipo_prev
  FROM eventos
),
cambios AS (
  SELECT id, tipo, fecha, orden, estimada
  FROM eventos_ord
  WHERE tipo_prev IS DISTINCT FROM tipo
    AND NOT (tipo_prev IS NULL AND tipo = 'cierra')
),
cambios_sig AS (
  SELECT id, tipo, fecha,
         LEAD(fecha) OVER w AS fecha_sig,
         LEAD(estimada) OVER w AS estimada_sig
  FROM cambios
  WINDOW w AS (PARTITION BY id ORDER BY fecha, orden)
),
periodos_crudos AS (
  SELECT id, fecha AS inicio, fecha_sig AS fin,
         COALESCE(estimada_sig, FALSE) AS fin_estimado,
         ROW_NUMBER() OVER (PARTITION BY id ORDER BY fecha) AS n
  FROM cambios_sig
  WHERE tipo = 'abre'
),
periodos AS (
  SELECT pc.id, pc.inicio, pc.n,
         CASE WHEN pc.fin IS NULL AND NOT c.es_activo
              THEN LEAST(GREATEST(COALESCE(c.fecha_terminacion, c.baja_estimada, pc.inicio), pc.inicio), h.hoy)
              ELSE pc.fin END AS fin,
         CASE WHEN pc.fin IS NULL AND NOT c.es_activo
              THEN c.fecha_terminacion IS NULL
              ELSE pc.fin_estimado END AS fin_estimado
  FROM periodos_crudos pc
  JOIN cond c ON c.id = pc.id
  CROSS JOIN h
),

-- Tiempo efectivamente activo al momento de cada baja
bajas AS (
  SELECT pe.id, pe.fin, pe.fin_estimado,
         (SELECT SUM(LEAST(COALESCE(p2.fin, pe.fin), pe.fin) - p2.inicio)
            FROM periodos p2
           WHERE p2.id = pe.id AND p2.inicio <= pe.fin) AS dias_activos
  FROM periodos pe
  WHERE pe.fin IS NOT NULL
),
antiguedad_activos AS (
  SELECT c.id,
         (SELECT SUM(COALESCE(pe.fin, h.hoy) - pe.inicio)
            FROM periodos pe
           WHERE pe.id = c.id) AS dias_activos
  FROM cond c
  CROSS JOIN h
  WHERE c.es_activo
),

-- ───────────── Leads ─────────────
leads_all AS MATERIALIZED (
  SELECT
    (l.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS ingreso,
    l.created_at,
    regexp_replace(COALESCE(l.dni, ''), '\D', '', 'g') AS dni,
    l.acepta_oferta,
    l.fecha_convertido,
    l.sede_id,
    l.edad,
    NULLIF(TRIM(l.estado_de_lead), '') AS estado,
    (LOWER(COALESCE(l.proceso, '')) = 'convertido'
      OR l.fecha_convertido IS NOT NULL
      OR LOWER(TRIM(COALESCE(l.estado_de_lead, ''))) = 'conductor') AS convertido,
    CASE
      WHEN btrim(COALESCE(l.fuente_de_lead, '')) = '' THEN 'Sin dato'
      WHEN UPPER(l.fuente_de_lead) LIKE '%SELLIUM%' THEN 'Sellium'
      ELSE initcap(btrim(l.fuente_de_lead))
    END AS fuente,
    COALESCE(NULLIF(btrim(l.fuente_pauta), ''), NULLIF(btrim(l.utm_campaign), ''), 'Sin dato') AS pauta,
    COALESCE(
      dashboard_directivo_zona(
        l.zona,
        COALESCE(l.latitud, l.direccion_latitud)::double precision,
        COALESCE(l.longitud, l.direccion_longitud)::double precision,
        l.direccion),
      'Sin dato') AS zona
  FROM leads l
  WHERE l.created_at IS NOT NULL
),
cond_dni AS (
  SELECT dni, MAX(primer_turno) AS primer_turno
  FROM cond
  WHERE dni <> '' AND primer_turno IS NOT NULL
  GROUP BY dni
),
leads_v AS (
  SELECT la.*,
         (la.dni <> '' AND cd.primer_turno IS NOT NULL AND cd.primer_turno >= la.ingreso) AS con_turno,
         CASE
           WHEN la.edad IS NULL THEN 'Sin dato'
           WHEN la.edad < 25 THEN 'Hasta 24'
           WHEN la.edad < 30 THEN '25 a 29'
           WHEN la.edad < 40 THEN '30 a 39'
           WHEN la.edad < 50 THEN '40 a 49'
           ELSE '50 o más'
         END AS rango_edad
  FROM leads_all la
  LEFT JOIN cond_dni cd ON cd.dni = la.dni
  WHERE p_sede_id IS NULL OR la.sede_id = p_sede_id
),

-- Conductores con primer turno, con su último lead previo (por DNI)
cond_lead AS (
  SELECT DISTINCT ON (c.id)
         c.id, c.primer_turno, c.zona, c.turno,
         CASE
           WHEN c.fecha_nacimiento IS NULL THEN 'Sin dato'
           WHEN date_part('year', age(c.primer_turno, c.fecha_nacimiento)) < 25 THEN 'Hasta 24'
           WHEN date_part('year', age(c.primer_turno, c.fecha_nacimiento)) < 30 THEN '25 a 29'
           WHEN date_part('year', age(c.primer_turno, c.fecha_nacimiento)) < 40 THEN '30 a 39'
           WHEN date_part('year', age(c.primer_turno, c.fecha_nacimiento)) < 50 THEN '40 a 49'
           ELSE '50 o más'
         END AS rango_edad,
         la.ingreso, la.fecha_convertido,
         COALESCE(la.fuente, 'Sin lead') AS fuente,
         COALESCE(la.pauta, 'Sin lead') AS pauta
  FROM cond c
  LEFT JOIN leads_all la
    ON c.dni <> ''
   AND la.dni = c.dni
   AND la.ingreso <= c.primer_turno
  WHERE c.primer_turno IS NOT NULL
  ORDER BY c.id, la.created_at DESC NULLS LAST
),

-- ───────────── Métricas por rango (actual y anterior) ─────────────
hitos AS (
  SELECT unnest(ARRAY[4, 8, 12, 26]) AS semanas
),
ret_rango AS (
  SELECT r.rango, hi.semanas,
         COUNT(cl.id) AS base,
         COUNT(cl.id) FILTER (WHERE EXISTS (
           SELECT 1 FROM periodos pe
           WHERE pe.id = cl.id
             AND pe.inicio <= cl.primer_turno + hi.semanas * 7
             AND (pe.fin IS NULL OR pe.fin > cl.primer_turno + hi.semanas * 7)
         )) AS retenidos
  FROM rangos r
  CROSS JOIN hitos hi
  LEFT JOIN cond_lead cl
    ON cl.primer_turno + hi.semanas * 7 BETWEEN r.desde AND r.hasta
  GROUP BY r.rango, hi.semanas
),
-- ───────────── Programados que no llegaron a la calle ─────────────
-- Personas con una programación o asignación cancelada que NUNCA tuvieron un
-- primer turno (hasta hoy). Tres orígenes:
--   1. Programación cancelada/eliminada en Programaciones (motivo_eliminacion).
--   2. Asignación programada cancelada en Entrega (motivo en notas: "[CANCELADA] Motivo: ...").
--   3. Turno cancelado dentro de una asignación (ej.: no confirmó al activar); sin motivo.
-- Se une por DNI (solo dígitos). Una persona cuenta una vez por período, con el
-- motivo de su última cancelación.
caidas_eventos AS (
  SELECT regexp_replace(COALESCE(x.dni_raw, ''), '\D', '', 'g') AS dni, x.fecha, x.motivo
  FROM (
    SELECT (COALESCE(po.eliminado_at, po.updated_at) AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS fecha,
           po.motivo_eliminacion AS motivo,
           unnest(ARRAY[po.conductor_dni, po.conductor_diurno_dni, po.conductor_nocturno_dni]) AS dni_raw
    FROM programaciones_onboarding po
    WHERE (po.estado = 'cancelado' OR po.eliminado IS TRUE)
      AND (p_sede_id IS NULL OR po.sede_id = p_sede_id)
  ) x
  UNION ALL
  SELECT regexp_replace(COALESCE(c.numero_dni, ''), '\D', '', 'g'),
         (a.updated_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
         (regexp_match(COALESCE(a.notas, ''), '.*\[CANCELADA\] Motivo:\s*([^\n]*)'))[1]
  FROM asignaciones a
  JOIN asignaciones_conductores ac ON ac.asignacion_id = a.id
  JOIN conductores c ON c.id = ac.conductor_id
  WHERE a.estado = 'cancelada'
    AND (p_sede_id IS NULL OR a.sede_id = p_sede_id)
  UNION ALL
  SELECT regexp_replace(COALESCE(c.numero_dni, ''), '\D', '', 'g'),
         (ac.fecha_fin AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
         NULL
  FROM asignaciones_conductores ac
  JOIN asignaciones a ON a.id = ac.asignacion_id
  JOIN conductores c ON c.id = ac.conductor_id
  WHERE ac.estado = 'cancelado'
    AND COALESCE(a.estado, '') <> 'cancelada'
    AND ac.fecha_fin IS NOT NULL
    AND (p_sede_id IS NULL OR a.sede_id = p_sede_id)
),
caidas_rango AS (
  -- Última cancelación de cada persona dentro de cada período
  SELECT DISTINCT ON (r.rango, ce.dni)
         r.rango, ce.dni,
         CASE
           WHEN btrim(COALESCE(ce.motivo, '')) = '' THEN 'Sin motivo cargado'
           ELSE upper(left(m.txt, 1)) || lower(substr(m.txt, 2))
         END AS motivo
  FROM caidas_eventos ce
  JOIN rangos r ON ce.fecha BETWEEN r.desde AND r.hasta
  CROSS JOIN LATERAL (
    SELECT regexp_replace(btrim(regexp_replace(COALESCE(ce.motivo, ''), '\s+', ' ', 'g')), '[.\s]+$', '') AS txt
  ) m
  WHERE ce.dni <> ''
    AND NOT EXISTS (SELECT 1 FROM cond c WHERE c.dni = ce.dni AND c.primer_turno IS NOT NULL)
  ORDER BY r.rango, ce.dni, ce.fecha DESC
),

metricas AS (
  SELECT
    r.rango, r.desde, r.hasta,
    (SELECT COUNT(*) FROM periodos pe WHERE pe.n = 1 AND pe.inicio BETWEEN r.desde AND r.hasta) AS altas,
    (SELECT COUNT(*) FROM periodos pe WHERE pe.n > 1 AND pe.inicio BETWEEN r.desde AND r.hasta) AS reactivaciones,
    (SELECT COUNT(*) FROM periodos pe WHERE pe.fin BETWEEN r.desde AND r.hasta) AS bajas,
    (SELECT COUNT(*) FROM periodos pe WHERE pe.fin BETWEEN r.desde AND r.hasta AND pe.fin_estimado) AS bajas_estimadas,
    (SELECT COUNT(DISTINCT pe.id) FROM periodos pe
      WHERE pe.inicio <= r.desde - 1 AND (pe.fin IS NULL OR pe.fin > r.desde - 1)) AS activos_inicio,
    (SELECT COUNT(DISTINCT pe.id) FROM periodos pe
      WHERE pe.inicio <= r.hasta AND (pe.fin IS NULL OR pe.fin > r.hasta)) AS activos_fin,
    (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY b.dias_activos / 7.0)
       FROM bajas b WHERE b.fin BETWEEN r.desde AND r.hasta AND b.dias_activos IS NOT NULL) AS permanencia_mediana_semanas,
    (SELECT COUNT(*) FROM leads_v lv WHERE lv.ingreso BETWEEN r.desde AND r.hasta) AS leads,
    (SELECT COUNT(*) FROM leads_v lv WHERE lv.ingreso BETWEEN r.desde AND r.hasta AND (lv.acepta_oferta IS TRUE OR lv.convertido)) AS aceptan_oferta,
    (SELECT COUNT(*) FROM leads_v lv WHERE lv.ingreso BETWEEN r.desde AND r.hasta AND lv.convertido) AS convertidos,
    (SELECT COUNT(*) FROM leads_v lv WHERE lv.ingreso BETWEEN r.desde AND r.hasta AND lv.con_turno) AS con_primer_turno,
    (SELECT COUNT(*) FROM leads_v lv WHERE lv.ingreso BETWEEN r.desde AND r.hasta AND NOT lv.convertido
        AND LOWER(lv.estado) IN ('descartado', 'no le interesa', 'no cumple edad', 'no apto - hireflix')) AS cerrados_sin_conversion,
    (SELECT COUNT(*) FROM cond_lead cl WHERE cl.primer_turno BETWEEN r.desde AND r.hasta) AS conductores_nuevos,
    (SELECT COUNT(*) FROM cond_lead cl WHERE cl.primer_turno BETWEEN r.desde AND r.hasta AND cl.ingreso IS NOT NULL) AS nuevos_con_lead,
    (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY cl.primer_turno - cl.ingreso)
       FROM cond_lead cl WHERE cl.primer_turno BETWEEN r.desde AND r.hasta AND cl.ingreso IS NOT NULL) AS dias_a_la_calle_mediana,
    (SELECT percentile_cont(0.9) WITHIN GROUP (ORDER BY cl.primer_turno - cl.ingreso)
       FROM cond_lead cl WHERE cl.primer_turno BETWEEN r.desde AND r.hasta AND cl.ingreso IS NOT NULL) AS dias_a_la_calle_p90,
    (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY cl.fecha_convertido::date - cl.ingreso)
       FROM cond_lead cl WHERE cl.primer_turno BETWEEN r.desde AND r.hasta AND cl.ingreso IS NOT NULL
        AND cl.fecha_convertido IS NOT NULL AND cl.fecha_convertido::date >= cl.ingreso) AS dias_lead_a_conversion_mediana,
    (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY cl.primer_turno - cl.fecha_convertido::date)
       FROM cond_lead cl WHERE cl.primer_turno BETWEEN r.desde AND r.hasta
        AND cl.fecha_convertido IS NOT NULL AND cl.primer_turno >= cl.fecha_convertido::date) AS dias_conversion_a_turno_mediana,
    -- Reparto del camino a la calle entre etapas, sobre UNA misma población
    -- (nuevos con lead y fecha de conversión). La fecha de conversión se acota
    -- a [ingreso, primer turno] para que las dos etapas sumen el total exacto.
    (SELECT COUNT(*) FROM cond_lead cl WHERE cl.primer_turno BETWEEN r.desde AND r.hasta
        AND cl.ingreso IS NOT NULL AND cl.fecha_convertido IS NOT NULL) AS nuevos_con_desglose,
    (SELECT COALESCE(SUM(LEAST(GREATEST(cl.fecha_convertido::date, cl.ingreso), cl.primer_turno) - cl.ingreso), 0)
       FROM cond_lead cl WHERE cl.primer_turno BETWEEN r.desde AND r.hasta
        AND cl.ingreso IS NOT NULL AND cl.fecha_convertido IS NOT NULL) AS dias_captacion_suma,
    (SELECT COALESCE(SUM(cl.primer_turno - LEAST(GREATEST(cl.fecha_convertido::date, cl.ingreso), cl.primer_turno)), 0)
       FROM cond_lead cl WHERE cl.primer_turno BETWEEN r.desde AND r.hasta
        AND cl.ingreso IS NOT NULL AND cl.fecha_convertido IS NOT NULL) AS dias_entrega_suma,
    (SELECT COUNT(*) FROM caidas_rango cr WHERE cr.rango = r.rango) AS caidas
  FROM rangos r
),

-- ───────────── Serie semanal (lunes a domingo) del período ─────────────
semanas AS (
  SELECT s::date AS semana, LEAST(s::date + 6, (SELECT hoy FROM h)) AS corte
  FROM generate_series(
    date_trunc('week', (SELECT desde FROM p)),
    date_trunc('week', (SELECT hasta FROM p)),
    interval '1 week'
  ) AS s
),
serie AS (
  SELECT
    se.semana,
    (SELECT COUNT(*) FROM periodos pe WHERE pe.n = 1 AND pe.inicio BETWEEN se.semana AND se.semana + 6) AS altas,
    (SELECT COUNT(*) FROM periodos pe JOIN cond c ON c.id = pe.id
      WHERE pe.n = 1 AND c.alta_estimada AND pe.inicio BETWEEN se.semana AND se.semana + 6) AS altas_estimadas,
    (SELECT COUNT(*) FROM periodos pe WHERE pe.n > 1 AND pe.inicio BETWEEN se.semana AND se.semana + 6) AS reactivaciones,
    (SELECT COUNT(*) FROM periodos pe WHERE pe.fin BETWEEN se.semana AND se.semana + 6) AS bajas,
    (SELECT COUNT(*) FROM periodos pe WHERE pe.fin BETWEEN se.semana AND se.semana + 6 AND pe.fin_estimado) AS bajas_estimadas,
    (SELECT COUNT(DISTINCT pe.id) FROM periodos pe
      WHERE pe.inicio <= se.corte AND (pe.fin IS NULL OR pe.fin > se.corte)) AS activos_fin,
    (SELECT COUNT(*) FROM leads_v lv WHERE lv.ingreso BETWEEN se.semana AND se.semana + 6) AS leads,
    (SELECT COUNT(*) FROM cond_lead cl WHERE cl.primer_turno BETWEEN se.semana AND se.semana + 6) AS nuevos_en_la_calle
  FROM semanas se
),

-- ───────────── Zonas (período actual + activos hoy) ─────────────
zonas AS (
  SELECT zona,
         SUM(leads) AS leads,
         SUM(con_turno) AS leads_con_turno,
         SUM(nuevos) AS nuevos_en_la_calle,
         SUM(activos) AS activos_hoy
  FROM (
    SELECT lv.zona, 1 AS leads, CASE WHEN lv.con_turno THEN 1 ELSE 0 END AS con_turno, 0 AS nuevos, 0 AS activos
    FROM leads_v lv, p WHERE lv.ingreso BETWEEN p.desde AND p.hasta
    UNION ALL
    SELECT cl.zona, 0, 0, 1, 0
    FROM cond_lead cl, p WHERE cl.primer_turno BETWEEN p.desde AND p.hasta
    UNION ALL
    SELECT c.zona, 0, 0, 0, 1
    FROM cond c JOIN en_la_calle e ON e.id = c.id
  ) z
  GROUP BY zona
),

-- ───────────── Perfil (últimos 12 meses) ─────────────
perfil_cond AS (
  SELECT cl.*,
         EXISTS (
           SELECT 1 FROM periodos pe
           WHERE pe.id = cl.id
             AND pe.inicio <= cl.primer_turno + 84
             AND (pe.fin IS NULL OR pe.fin > cl.primer_turno + 84)
         ) AS retenido_12
  FROM cond_lead cl, h
  WHERE cl.primer_turno + 84 > h.hoy - 365
    AND cl.primer_turno + 84 <= h.hoy
),
perfil_retencion AS (
  SELECT dimension, valor, COUNT(*) AS base, COUNT(*) FILTER (WHERE retenido_12) AS retenidos
  FROM (
    SELECT 'Zona'::text AS dimension, zona AS valor, retenido_12 FROM perfil_cond
    UNION ALL SELECT 'Turno', turno, retenido_12 FROM perfil_cond
    UNION ALL SELECT 'Fuente del lead', fuente, retenido_12 FROM perfil_cond
    UNION ALL SELECT 'Pauta / campaña', pauta, retenido_12 FROM perfil_cond
    UNION ALL SELECT 'Edad', rango_edad, retenido_12 FROM perfil_cond
  ) x
  GROUP BY dimension, valor
),
perfil_leads AS (
  SELECT lv.* FROM leads_v lv, h
  WHERE lv.ingreso > h.hoy - 365 AND lv.ingreso <= h.hoy
),
perfil_conversion AS (
  SELECT dimension, valor, COUNT(*) AS leads, COUNT(*) FILTER (WHERE con_turno) AS con_turno
  FROM (
    SELECT 'Zona'::text AS dimension, zona AS valor, con_turno FROM perfil_leads
    UNION ALL SELECT 'Fuente del lead', fuente, con_turno FROM perfil_leads
    UNION ALL SELECT 'Pauta / campaña', pauta, con_turno FROM perfil_leads
    UNION ALL SELECT 'Edad', rango_edad, con_turno FROM perfil_leads
  ) x
  GROUP BY dimension, valor
),

-- ───────────── Flota hoy (mismas reglas que Estado de Flota) ─────────────
veh AS (
  SELECT v.id,
         UPPER(COALESCE(ve.codigo, '')) AS codigo,
         btrim(regexp_replace(translate(lower(COALESCE(ve.descripcion, '')), 'áéíóúüñ', 'aeiouun'), '\s+', ' ', 'g')) AS descr
  FROM vehiculos v
  LEFT JOIN vehiculos_estados ve ON ve.id = v.estado_id
  WHERE v.deleted_at IS NULL
    AND (p_sede_id IS NULL OR v.sede_id = p_sede_id)
),
veh_flota AS (
  SELECT * FROM veh
  WHERE descr = 'en uso'
     OR descr LIKE 'pkg on%'
     OR (descr LIKE '%pkg off%' AND descr LIKE '%base%')
     OR (descr LIKE '%pkg off%' AND descr LIKE '%franc%')
     OR (descr LIKE '%taller%' AND descr LIKE '%mecanic%')
     OR (descr LIKE '%taller%' AND (descr LIKE '%chapa%' OR descr LIKE '%pintura%'))
     OR descr LIKE '%retenido%'
     OR descr LIKE '%comisar%'
),
asig_activas AS (
  SELECT a.id, a.vehiculo_id, a.horario
  FROM asignaciones a
  WHERE a.estado IN ('activo', 'activa')
    AND (p_sede_id IS NULL OR a.sede_id = p_sede_id)
),
asig_turno AS (
  SELECT a.id,
         EXISTS (SELECT 1 FROM asignaciones_conductores ac
                 WHERE ac.asignacion_id = a.id
                   AND ac.horario IN ('diurno', 'DIURNO', 'D')
                   AND COALESCE(ac.estado, '') NOT IN ('cancelado', 'completado', 'finalizado')) AS tiene_d,
         EXISTS (SELECT 1 FROM asignaciones_conductores ac
                 WHERE ac.asignacion_id = a.id
                   AND ac.horario IN ('nocturno', 'NOCTURNO', 'N')
                   AND COALESCE(ac.estado, '') NOT IN ('cancelado', 'completado', 'finalizado')) AS tiene_n
  FROM asig_activas a
  WHERE a.horario = 'turno'
),
flota AS (
  SELECT
    (SELECT COUNT(*) FROM veh_flota) AS total_flota,
    (SELECT COUNT(DISTINCT vehiculo_id) FROM asig_activas WHERE vehiculo_id IS NOT NULL) AS vehiculos_activos,
    (SELECT COUNT(*) FROM veh WHERE codigo = 'EN_USO') AS en_uso,
    (SELECT COUNT(*) FROM veh v
      WHERE v.codigo = 'PKG_ON_BASE'
        AND NOT EXISTS (SELECT 1 FROM asig_activas a WHERE a.vehiculo_id = v.id)) AS pkg_on_sin_asignacion,
    (SELECT COUNT(*) FILTER (WHERE NOT tiene_d) + COUNT(*) FILTER (WHERE NOT tiene_n) FROM asig_turno) AS vacantes
)

SELECT jsonb_build_object(
  'hoy', (SELECT hoy FROM h),
  'desde', (SELECT desde FROM p),
  'hasta', (SELECT hasta FROM p),
  'generado_en', now(),

  'hoy_snapshot', jsonb_build_object(
    'conductores_activos', (SELECT COUNT(*) FROM cond WHERE es_activo),
    'conductores_en_la_calle', (SELECT COUNT(*) FROM en_la_calle),
    'conductores_en_espera', (SELECT COUNT(*) FROM cond c
                              WHERE c.es_activo AND NOT EXISTS (SELECT 1 FROM en_la_calle e WHERE e.id = c.id)),
    'antiguedad_mediana_semanas',
      (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY dias_activos / 7.0)
         FROM antiguedad_activos WHERE dias_activos IS NOT NULL),
    'total_flota', f.total_flota,
    'en_uso', f.en_uso,
    'turnos_totales', (f.vehiculos_activos + f.pkg_on_sin_asignacion) * 2,
    'turnos_disponibles', f.vacantes + f.pkg_on_sin_asignacion * 2,
    'ocupacion', CASE WHEN (f.vehiculos_activos + f.pkg_on_sin_asignacion) > 0
      THEN ((f.vehiculos_activos + f.pkg_on_sin_asignacion) * 2 - (f.vacantes + f.pkg_on_sin_asignacion * 2))::numeric
           / ((f.vehiculos_activos + f.pkg_on_sin_asignacion) * 2)
      END,
    'operatividad', CASE WHEN f.total_flota > 0 THEN f.en_uso::numeric / f.total_flota END
  ),

  'periodo', (
    SELECT jsonb_object_agg(m.rango, jsonb_build_object(
      'desde', m.desde,
      'hasta', m.hasta,
      'altas', m.altas,
      'reactivaciones', m.reactivaciones,
      'bajas', m.bajas,
      'bajas_estimadas', m.bajas_estimadas,
      'activos_inicio', m.activos_inicio,
      'activos_fin', m.activos_fin,
      'permanencia_mediana_semanas', m.permanencia_mediana_semanas,
      'leads', m.leads,
      'aceptan_oferta', m.aceptan_oferta,
      'convertidos', m.convertidos,
      'con_primer_turno', m.con_primer_turno,
      'cerrados_sin_conversion', m.cerrados_sin_conversion,
      'conductores_nuevos', m.conductores_nuevos,
      'nuevos_con_lead', m.nuevos_con_lead,
      'dias_a_la_calle_mediana', m.dias_a_la_calle_mediana,
      'dias_a_la_calle_p90', m.dias_a_la_calle_p90,
      'dias_lead_a_conversion_mediana', m.dias_lead_a_conversion_mediana,
      'dias_conversion_a_turno_mediana', m.dias_conversion_a_turno_mediana,
      'nuevos_con_desglose', m.nuevos_con_desglose,
      'dias_captacion_suma', m.dias_captacion_suma,
      'dias_entrega_suma', m.dias_entrega_suma,
      'caidas', m.caidas,
      'retencion', (
        SELECT jsonb_agg(jsonb_build_object('semanas', rr.semanas, 'base', rr.base, 'retenidos', rr.retenidos)
                         ORDER BY rr.semanas)
        FROM ret_rango rr WHERE rr.rango = m.rango
      )
    ))
    FROM metricas m
  ),

  -- Motivos de los programados que no llegaron a la calle (período actual, top 5 + otros)
  'motivos_caidas', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('motivo', y.motivo, 'cantidad', y.cantidad)
                              ORDER BY y.orden, y.cantidad DESC, y.motivo), '[]'::jsonb)
    FROM (
      SELECT CASE WHEN rn <= 5 THEN motivo ELSE 'Otros motivos' END AS motivo,
             SUM(cantidad) AS cantidad,
             MIN(CASE WHEN rn <= 5 THEN 0 ELSE 1 END) AS orden
      FROM (
        SELECT motivo, COUNT(*) AS cantidad,
               ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC, motivo) AS rn
        FROM caidas_rango WHERE rango = 'actual'
        GROUP BY motivo
      ) t
      GROUP BY 1
    ) y
  ),

  'motivos_cierre', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('motivo', x.estado, 'cantidad', x.cantidad)
                              ORDER BY x.cantidad DESC, x.estado), '[]'::jsonb)
    FROM (
      SELECT lv.estado, COUNT(*) AS cantidad
      FROM leads_v lv, p
      WHERE lv.ingreso BETWEEN p.desde AND p.hasta
        AND NOT lv.convertido
        AND LOWER(lv.estado) IN ('descartado', 'no le interesa', 'no cumple edad', 'no apto - hireflix')
      GROUP BY lv.estado
      ORDER BY COUNT(*) DESC
      LIMIT 5
    ) x
  ),

  'serie_semanal', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'semana', s.semana,
      'altas', s.altas,
      'altas_estimadas', s.altas_estimadas,
      'reactivaciones', s.reactivaciones,
      'bajas', s.bajas,
      'bajas_estimadas', s.bajas_estimadas,
      'activos_fin', s.activos_fin,
      'leads', s.leads,
      'nuevos_en_la_calle', s.nuevos_en_la_calle
    ) ORDER BY s.semana), '[]'::jsonb)
    FROM serie s
  ),

  'zonas', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'zona', z.zona,
      'leads', z.leads,
      'leads_con_turno', z.leads_con_turno,
      'nuevos_en_la_calle', z.nuevos_en_la_calle,
      'activos_hoy', z.activos_hoy
    ) ORDER BY z.leads DESC, z.activos_hoy DESC, z.zona), '[]'::jsonb)
    FROM zonas z
  ),

  'perfil_retencion', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'dimension', pr.dimension, 'valor', pr.valor, 'base', pr.base, 'retenidos', pr.retenidos
    ) ORDER BY pr.dimension, pr.base DESC), '[]'::jsonb)
    FROM perfil_retencion pr
  ),

  'perfil_conversion', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'dimension', pc.dimension, 'valor', pc.valor, 'leads', pc.leads, 'con_turno', pc.con_turno
    ) ORDER BY pc.dimension, pc.leads DESC), '[]'::jsonb)
    FROM perfil_conversion pc
  )
)
FROM flota f;
$$;

GRANT EXECUTE ON FUNCTION get_dashboard_directivo(uuid, date, date, date) TO authenticated;
