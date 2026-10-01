-- =====================================================
-- RPC: get_dashboard_marketing
-- Indicadores del Dashboard Marketing (Reportes > Dashboard Marketing): rendimiento
-- de la captación de conductores, para revisar junto con la agencia que hace la pauta.
--
-- Solo lectura (STABLE, SECURITY INVOKER): respeta las políticas RLS del usuario
-- que la llama. No crea, modifica ni borra datos. Devuelve solo datos agregados
-- (sin nombres, teléfonos ni DNI).
--
-- Requiere dashboard_directivo_zona (sql/dashboard_directivo.sql), ya instalada
-- con el Dashboard Directivo.
--
-- PERÍODO: [p_desde, p_hasta] (semanas lunes a domingo); p_hasta se recorta a hoy.
--   También se calcula el período anterior (mismo largo) para las variaciones.
--
-- LEADS DEL PERÍODO: created_at en hora Argentina (columna "Creación" de Leads).
--
-- ORIGEN DEL LEAD (segmento):
--   Pauta redes : tiene canal o link de anuncio (fuente_pauta / id_fuente) o la
--                 fuente es Sellium, Intercom o una red social.
--   Web         : formulario del sitio (orgánico).
--   Referidos / Otras fuentes / Sin fuente.
--   Canal (solo pauta): Facebook, Instagram, TikTok, Estado; si no se puede
--   identificar: 'Sin canal identificado'.
--
-- EMBUDO (leads creados en el período, según su estado actual; sigue el flujo
-- del chatbot). Un lead descartado no suma en las etapas posteriores.
--   1 Leads
--   2 Pasaron filtros   cobertura y edad ("Edad aprobada" / "Zona aprobada" o más)
--   3 Acepta oferta     "Acepta oferta" o más
--   4 Envió video introducción  "Video recibido", Hireflix (incl. "Apto - Hireflix") o más
--   5 Documentación     "Apto - Hireflix", "Documentos pendientes/enviados" o más
--   6 Entrevista        "Convocatoria Inducción" o más
--   7 Aptos             "Apto Inducción" o más
--   8 Convertidos       pasaron a conductor
--   9 Recibieron auto   conductores nuevos (ver abajo)
--
-- CONDUCTORES NUEVOS (por creación del lead, como todo el dashboard): leads creados
--   en el período que ya recibieron su primer auto (primera asignación no cancelada,
--   posterior al ingreso del lead), aunque el auto haya llegado después del período.
--   Una persona con varios leads en el rango cuenta una vez (en su último lead).
--   Conversión = conductores nuevos / leads del período.
--   FUERA DE RANGO: recibieron su primer auto en el período pero su lead es anterior:
--   se informan aparte porque no corresponden a la pauta del rango filtrado.
--
-- PERFIL DEL LEAD (solo leads que llegaron a "Propuesta enviada" o más: antes de
-- esa etapa el chatbot todavía no preguntó licencia, monotributo ni experiencia):
--   No cumple : menor de 21, licencia "No" o experiencia "No".
--   Cumple    : 21 o más, licencia D1, monotributo y experiencia manejando.
--   Medio     : 21 o más con parte de los requisitos.
--   Sin datos : no alcanza la información para clasificarlo.
--   (Edad: campo edad; si falta, haber pasado los filtros cuenta como 21 o más.)
--
-- MOTIVO DE DESCARTE: estado del lead + texto de la causal de cierre (campo
--   causal_de_cierre o la línea "Causal de cierre:" que deja la carga de Sellium).
--
-- Uso: supabase.rpc('get_dashboard_marketing', { p_sede_id, p_desde, p_hasta })
-- Para quitarla: DROP FUNCTION IF EXISTS get_dashboard_marketing(uuid, date, date, date);
-- =====================================================

CREATE OR REPLACE FUNCTION get_dashboard_marketing(
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
  SELECT 'anterior',
         desde - (CEIL((hasta - desde + 1) / 7.0) * 7)::int,
         hasta - (CEIL((hasta - desde + 1) / 7.0) * 7)::int
  FROM p
),

-- ───────────── Leads (todos los usados: período, anterior y origen de conductores) ─────────────
leads_base AS (
  SELECT
    l.id,
    l.created_at,
    (l.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS ingreso,
    regexp_replace(COALESCE(l.dni, ''), '\D', '', 'g') AS dni,
    translate(LOWER(btrim(COALESCE(l.estado_de_lead, ''))), 'áéíóú', 'aeiou') AS estado,
    (LOWER(COALESCE(l.proceso, '')) IN ('convertido', 'conductor')
      OR l.fecha_convertido IS NOT NULL
      OR LOWER(btrim(COALESCE(l.estado_de_lead, ''))) = 'conductor') AS convertido,
    l.edad,
    btrim(COALESCE(l.d1, '')) AS d1,
    btrim(COALESCE(l.licencia, '')) AS licencia,
    COALESCE(l.categorias_licencia::text, '') AS categorias,
    btrim(COALESCE(l.monotributo, '')) AS monotributo,
    btrim(COALESCE(l.experiencia_previa, '')) AS exp_previa,
    btrim(COALESCE(l.experiencia_manejo, '')) AS exp_manejo,
    btrim(COALESCE(l.fuente_de_lead, '')) AS fuente,
    btrim(COALESCE(l.fuente_pauta, '')) AS fuente_pauta,
    btrim(COALESCE(l.id_fuente, '')) AS id_fuente,
    COALESCE(l.cerrado_timeout_wpp, false) AS timeout_wpp,
    NULLIF(btrim(regexp_replace(COALESCE(
      NULLIF(btrim(l.causal_de_cierre), ''),
      substring(COALESCE(l.observaciones, '') FROM 'Causal de cierre:\s*([^\n]+)'),
      NULLIF(btrim(l.motivo_desinteres), ''),
      ''), '\s+', ' ', 'g')), '') AS causal,
    dashboard_directivo_zona(
      l.zona,
      COALESCE(l.latitud, l.direccion_latitud)::double precision,
      COALESCE(l.longitud, l.direccion_longitud)::double precision,
      l.direccion) AS zona
  FROM leads l
  WHERE l.created_at IS NOT NULL
    AND (p_sede_id IS NULL OR l.sede_id = p_sede_id)
),
leads_n AS (
  SELECT
    lb.*,
    CASE lb.estado
      WHEN 'inicio conversacion' THEN 0
      WHEN 'contactado sellium' THEN 1
      WHEN 'edad aprobada' THEN 1.1
      WHEN 'zona aprobada' THEN 1.2
      WHEN 'propuesta enviada' THEN 1.3
      WHEN 'acepta oferta' THEN 1.5
      WHEN 'video recibido' THEN 2
      WHEN 'pendiente - hireflix' THEN 2
      WHEN 'ayuda - hireflix' THEN 3
      WHEN 'apto - hireflix' THEN 4
      WHEN 'documentos enviados' THEN 5
      WHEN 'documentos pendientes' THEN 5
      WHEN 'convocatoria induccion' THEN 6
      WHEN 'apto induccion' THEN 7
      WHEN 'conductor' THEN 8
      ELSE NULL
    END AS nivel_estado,
    ((lb.estado IN ('descartado', 'no le interesa', 'no cumple edad', 'no apto - hireflix', 'auto del pueblo')
      OR lb.timeout_wpp) AND NOT lb.convertido) AS descartado,
    CASE
      WHEN lb.fuente_pauta <> '' OR lb.id_fuente <> ''
        OR lb.fuente ~* '(sellium|intercom|facebook|instagram|tiktok|meta|whatsapp|pauta|redes)' THEN 'Pauta redes'
      WHEN lb.fuente ~* '(web|p[aá]gina|portal|formulario)' THEN 'Web'
      WHEN lb.fuente ~* 'referid' THEN 'Referidos'
      WHEN lb.fuente = '' THEN 'Sin fuente'
      ELSE 'Otras fuentes'
    END AS segmento,
    COALESCE(
      NULLIF(lb.fuente_pauta, ''),
      CASE
        WHEN lb.fuente ~* 'facebook' THEN 'Facebook'
        WHEN lb.fuente ~* 'instagram' THEN 'Instagram'
        WHEN lb.fuente ~* 'tiktok' THEN 'TikTok'
      END,
      'Sin canal identificado') AS canal,
    (lb.d1 ~* '^s[ií]' OR lb.categorias ~* 'D1') AS tiene_d1,
    (lb.d1 ~* '^s[ií]' OR lb.licencia ~* '^s[ií]'
      OR lb.categorias !~ '^\s*(\{\}|\[\]|null)?\s*$') AS tiene_licencia,
    (lb.licencia ~* '^no\M') AS sin_licencia,
    (lb.monotributo ~* '^s[ií]') AS tiene_monotributo,
    (lb.exp_previa ~* '^s[ií]'
      OR (lb.exp_manejo <> '' AND lb.exp_manejo !~* '^(no|sin|0|ninguna|nada)\M')) AS tiene_experiencia,
    (lb.exp_manejo ~* '^(no|sin|0|ninguna|nada)\M') AS sin_experiencia
  FROM leads_base lb
),

-- ───────────── Primer auto de cada conductor ─────────────
cond_base AS (
  SELECT
    c.id,
    regexp_replace(COALESCE(c.numero_dni, ''), '\D', '', 'g') AS dni,
    COALESCE(dashboard_directivo_zona(c.zona, c.direccion_lat::double precision, c.direccion_lng::double precision, c.direccion), 'Sin dato') AS zona_ficha
  FROM conductores c
  WHERE p_sede_id IS NULL OR c.sede_id = p_sede_id
),
turnos AS (
  SELECT
    ac.conductor_id AS id,
    (COALESCE(ac.fecha_inicio, a.fecha_inicio_real, a.fecha_inicio) AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS fecha,
    LOWER(COALESCE(NULLIF(ac.horario, ''), a.horario, '')) AS horario,
    COALESCE(dashboard_directivo_zona(a.zona, NULL, NULL, NULL), 'Sin dato') AS zona_auto
  FROM asignaciones_conductores ac
  JOIN asignaciones a ON a.id = ac.asignacion_id
  JOIN cond_base cb ON cb.id = ac.conductor_id
  CROSS JOIN h
  WHERE COALESCE(ac.estado, '') <> 'cancelado'
    AND COALESCE(a.estado, '') <> 'cancelada'
    AND COALESCE(ac.fecha_inicio, a.fecha_inicio_real, a.fecha_inicio) IS NOT NULL
    AND (COALESCE(ac.fecha_inicio, a.fecha_inicio_real, a.fecha_inicio) AT TIME ZONE 'America/Argentina/Buenos_Aires')::date <= h.hoy
),
primer_turno AS (
  SELECT DISTINCT ON (t.id) t.id, cb.dni, cb.zona_ficha, t.fecha, t.horario, t.zona_auto
  FROM turnos t
  JOIN cond_base cb ON cb.id = t.id
  ORDER BY t.id, t.fecha
),
-- Primer auto por DNI (una persona puede tener más de un registro de conductor)
primer_auto_dni AS (
  SELECT DISTINCT ON (dni) dni, fecha AS primer_turno, horario, zona_ficha
  FROM primer_turno
  WHERE dni <> ''
  ORDER BY dni, fecha
),

-- ───────────── Leads del período con etapas, perfil y motivo ─────────────
leads_v AS (
  SELECT
    r.rango,
    ln.id, ln.dni, ln.ingreso, ln.segmento, ln.canal, ln.id_fuente, ln.descartado, ln.causal, ln.estado, ln.edad,
    COALESCE(ln.zona, 'Sin dato') AS zona,
    (ln.zona IS NULL) AS sin_zona,
    (NOT ln.descartado AND COALESCE(ln.nivel_estado, 0) >= 1.1) OR ln.convertido AS filtros,
    (NOT ln.descartado AND COALESCE(ln.nivel_estado, 0) >= 1.5) OR ln.convertido AS acepta,
    (NOT ln.descartado AND COALESCE(ln.nivel_estado, 0) >= 2) OR ln.convertido AS video,
    (NOT ln.descartado AND COALESCE(ln.nivel_estado, 0) >= 4) OR ln.convertido AS documentacion,
    (NOT ln.descartado AND COALESCE(ln.nivel_estado, 0) >= 6) OR ln.convertido AS entrevista,
    (NOT ln.descartado AND COALESCE(ln.nivel_estado, 0) >= 7) OR ln.convertido AS apto,
    (ln.convertido OR ln.nivel_estado = 8) AS convertido,
    -- Conductor nuevo: recibió su primer auto después de entrar como lead. Si la misma
    -- persona (DNI) tiene varios leads en el rango, cuenta solo en el último.
    (ln.dni <> '' AND pad.primer_turno IS NOT NULL AND pad.primer_turno >= ln.ingreso
      AND ROW_NUMBER() OVER (PARTITION BY r.rango, ln.dni ORDER BY ln.created_at DESC) = 1) AS con_auto,
    pad.primer_turno, pad.horario AS horario_auto, pad.zona_ficha,
    -- Calificable: llegó a la propuesta (el chatbot ya preguntó licencia, monotributo y experiencia)
    (COALESCE(ln.nivel_estado, 0) >= 1.3 OR ln.convertido
      OR (ln.descartado AND (ln.tiene_licencia OR ln.tiene_monotributo OR ln.tiene_experiencia OR ln.sin_licencia OR ln.sin_experiencia))) AS calificable,
    CASE
      WHEN (ln.edad IS NOT NULL AND ln.edad < 21) OR ln.estado = 'no cumple edad'
        OR ln.sin_licencia OR ln.sin_experiencia THEN 'No cumple'
      WHEN (COALESCE(ln.edad >= 21, false) OR (ln.edad IS NULL AND (COALESCE(ln.nivel_estado, 0) >= 1.1 OR ln.convertido)))
        AND ln.tiene_d1 AND ln.tiene_monotributo AND ln.tiene_experiencia THEN 'Cumple'
      WHEN (COALESCE(ln.edad >= 21, false) OR (ln.edad IS NULL AND (COALESCE(ln.nivel_estado, 0) >= 1.1 OR ln.convertido)))
        AND (ln.tiene_licencia OR ln.tiene_monotributo OR ln.tiene_experiencia) THEN 'Medio'
      ELSE 'Sin datos'
    END AS perfil,
    CASE
      WHEN NOT ln.descartado THEN NULL
      WHEN ln.estado = 'no cumple edad' OR ln.causal ~* '(edad|menor de|años|\mage\M|underage)' THEN 'Edad'
      WHEN ln.estado = 'auto del pueblo' OR ln.causal ~* '(auto propio|veh[ií]culo propio|tiene auto|own car)' THEN 'Tiene auto propio'
      WHEN ln.estado = 'no apto - hireflix' THEN 'No calificó'
      WHEN ln.causal ~* '(zona|distancia|lejos|ubicaci|cobertura|fuera de|location|distance|coverage|area)' THEN 'Zona / sin cobertura'
      WHEN ln.causal ~* '(licen|registro|\md1\M)' THEN 'Licencia'
      WHEN ln.causal ~* 'monotribut' THEN 'Monotributo'
      WHEN ln.causal ~* '(precio|caro|alquiler|tarifa|plata|dinero|cost|ganan|price|expensive)' THEN 'Precio / ganancia'
      WHEN ln.causal ~* '(disagree|desacuerdo|condici|no (me )?conviene|oferta|acuerdo|requisito)' THEN 'Desacuerdo con la oferta'
      WHEN ln.causal ~* '(turno|horario|schedule|shift)' THEN 'Turno / horario'
      WHEN ln.timeout_wpp OR ln.causal ~* '(no respond|sin respuesta|inactiv|abandon|timeout|no contest|no response|unresponsive)' THEN 'No respondió'
      WHEN ln.causal ~* '(antecedente|document|papeles)' THEN 'Documentación / antecedentes'
      WHEN ln.estado = 'no le interesa' OR ln.causal ~* '(interes|no quiere|desist|not interested)' THEN 'No le interesa'
      WHEN ln.causal IS NULL THEN 'Sin motivo cargado'
      ELSE 'Otro'
    END AS motivo
  FROM leads_n ln
  JOIN rangos r ON ln.ingreso BETWEEN r.desde AND r.hasta
  LEFT JOIN primer_auto_dni pad ON pad.dni = ln.dni
),
leads_act AS (
  SELECT * FROM leads_v WHERE rango = 'actual'
),

-- Conductores nuevos FUERA DE RANGO: recibieron su primer auto en el período pero su
-- lead es anterior al período (no corresponden a la pauta del rango filtrado).
fuera_de_rango AS (
  SELECT DISTINCT ON (pa.dni) pa.dni, ln.segmento
  FROM primer_auto_dni pa
  CROSS JOIN p
  JOIN leads_n ln ON ln.dni = pa.dni AND ln.ingreso <= pa.primer_turno
  WHERE pa.primer_turno BETWEEN p.desde AND p.hasta
    AND NOT EXISTS (
      SELECT 1 FROM leads_n l2
      WHERE l2.dni = pa.dni AND l2.ingreso BETWEEN p.desde AND p.hasta AND l2.ingreso <= pa.primer_turno
    )
  ORDER BY pa.dni, ln.created_at DESC
),

-- Rendimiento por grupo (canal / anuncio / zona), sobre los leads del período
rend_canal AS (
  SELECT canal, COUNT(*) AS leads,
         COUNT(*) FILTER (WHERE calificable) AS calificables,
         COUNT(*) FILTER (WHERE calificable AND perfil = 'Cumple') AS cumple,
         COUNT(*) FILTER (WHERE acepta) AS acepta,
         COUNT(*) FILTER (WHERE documentacion) AS documentacion,
         COUNT(*) FILTER (WHERE apto) AS aptos,
         COUNT(*) FILTER (WHERE con_auto) AS nuevos
  FROM leads_act WHERE segmento = 'Pauta redes' GROUP BY canal
),
rend_anuncio AS (
  SELECT id_fuente AS anuncio, MIN(canal) AS canal, COUNT(*) AS leads,
         COUNT(*) FILTER (WHERE calificable) AS calificables,
         COUNT(*) FILTER (WHERE calificable AND perfil = 'Cumple') AS cumple,
         COUNT(*) FILTER (WHERE acepta) AS acepta,
         COUNT(*) FILTER (WHERE documentacion) AS documentacion,
         COUNT(*) FILTER (WHERE apto) AS aptos,
         COUNT(*) FILTER (WHERE con_auto) AS nuevos
  FROM leads_act WHERE segmento = 'Pauta redes' AND id_fuente <> '' GROUP BY id_fuente
),
rend_zona AS (
  SELECT segmento, zona, COUNT(*) AS leads,
         COUNT(*) FILTER (WHERE acepta) AS acepta,
         COUNT(*) FILTER (WHERE documentacion) AS documentacion,
         COUNT(*) FILTER (WHERE apto) AS aptos,
         COUNT(*) FILTER (WHERE descartado) AS descartados,
         COUNT(*) FILTER (WHERE motivo = 'Zona / sin cobertura') AS descartados_zona,
         COUNT(*) FILTER (WHERE con_auto) AS nuevos
  FROM leads_act GROUP BY segmento, zona
)

SELECT jsonb_build_object(
  'periodo', (
    SELECT jsonb_build_object(
      'hoy', p.hoy, 'desde', p.desde, 'hasta', p.hasta,
      'anterior', (SELECT jsonb_build_object('desde', desde, 'hasta', hasta) FROM rangos WHERE rango = 'anterior'))
    FROM p
  ),

  'embudo', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'rango', x.rango, 'segmento', x.segmento, 'leads', x.leads, 'filtros', x.filtros,
      'acepta', x.acepta, 'video', x.video, 'documentacion', x.documentacion,
      'entrevista', x.entrevista, 'aptos', x.aptos, 'convertidos', x.convertidos,
      'con_auto', x.con_auto, 'nuevos', x.con_auto, 'descartados', x.descartados,
      'calificables', x.calificables)
      ORDER BY x.rango, x.segmento), '[]'::jsonb)
    FROM (
      SELECT rango, segmento, COUNT(*) AS leads,
             COUNT(*) FILTER (WHERE filtros) AS filtros,
             COUNT(*) FILTER (WHERE acepta) AS acepta,
             COUNT(*) FILTER (WHERE video) AS video,
             COUNT(*) FILTER (WHERE documentacion) AS documentacion,
             COUNT(*) FILTER (WHERE entrevista) AS entrevista,
             COUNT(*) FILTER (WHERE apto) AS aptos,
             COUNT(*) FILTER (WHERE convertido) AS convertidos,
             COUNT(*) FILTER (WHERE con_auto) AS con_auto,
             COUNT(*) FILTER (WHERE descartado) AS descartados,
             COUNT(*) FILTER (WHERE calificable) AS calificables
      FROM leads_v
      GROUP BY rango, segmento
    ) x
  ),

  'calidad', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('segmento', segmento, 'canal', canal, 'perfil', perfil, 'cantidad', cantidad)
      ORDER BY segmento, canal, perfil), '[]'::jsonb)
    FROM (SELECT segmento, canal, perfil, COUNT(*) AS cantidad FROM leads_act WHERE calificable GROUP BY segmento, canal, perfil) x
  ),

  'canales', (
    SELECT COALESCE(jsonb_agg(to_jsonb(rc) ORDER BY rc.leads DESC, rc.canal), '[]'::jsonb) FROM rend_canal rc
  ),

  'anuncios', (
    SELECT COALESCE(jsonb_agg(to_jsonb(ra) ORDER BY ra.leads DESC, ra.nuevos DESC, ra.anuncio), '[]'::jsonb)
    FROM (SELECT * FROM rend_anuncio ORDER BY leads DESC, nuevos DESC, anuncio LIMIT 30) ra
  ),

  'zonas', (
    SELECT COALESCE(jsonb_agg(to_jsonb(rz) ORDER BY rz.segmento, rz.leads DESC, rz.zona), '[]'::jsonb) FROM rend_zona rz
  ),

  'descartes', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('segmento', segmento, 'motivo', motivo, 'cantidad', cantidad)
      ORDER BY segmento, cantidad DESC, motivo), '[]'::jsonb)
    FROM (SELECT segmento, motivo, COUNT(*) AS cantidad FROM leads_act WHERE descartado GROUP BY segmento, motivo) x
  ),

  'causales', (
    -- Textos de causal más frecuentes (tal cual vienen), para revisar la clasificación
    SELECT COALESCE(jsonb_agg(jsonb_build_object('segmento', segmento, 'causal', causal, 'motivo', motivo, 'cantidad', cantidad)
      ORDER BY segmento, cantidad DESC, causal), '[]'::jsonb)
    FROM (
      SELECT segmento, causal, motivo, cantidad,
             ROW_NUMBER() OVER (PARTITION BY segmento ORDER BY cantidad DESC, causal) AS rn
      FROM (
        SELECT segmento, LEFT(causal, 120) AS causal, MIN(motivo) AS motivo, COUNT(*) AS cantidad
        FROM leads_act
        WHERE descartado AND causal IS NOT NULL
        GROUP BY segmento, LEFT(causal, 120)
      ) c
    ) x
    WHERE rn <= 10
  ),

  'control', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'segmento', segmento, 'leads', leads, 'sin_zona', sin_zona, 'sin_canal', sin_canal,
      'con_link_posible', con_link_posible, 'sin_anuncio', sin_anuncio, 'sin_edad', sin_edad,
      'calificables', calificables, 'perfil_sin_datos', perfil_sin_datos)
      ORDER BY segmento), '[]'::jsonb)
    FROM (
      SELECT segmento, COUNT(*) AS leads,
             COUNT(*) FILTER (WHERE sin_zona) AS sin_zona,
             COUNT(*) FILTER (WHERE canal = 'Sin canal identificado') AS sin_canal,
             -- El link del anuncio se carga desde el 30/09/2026
             COUNT(*) FILTER (WHERE ingreso >= DATE '2026-09-30') AS con_link_posible,
             COUNT(*) FILTER (WHERE ingreso >= DATE '2026-09-30' AND id_fuente = '') AS sin_anuncio,
             COUNT(*) FILTER (WHERE edad IS NULL) AS sin_edad,
             COUNT(*) FILTER (WHERE calificable) AS calificables,
             COUNT(*) FILTER (WHERE calificable AND perfil = 'Sin datos') AS perfil_sin_datos
      FROM leads_act
      GROUP BY segmento
    ) x
  ),

  'nuevos_conductores', jsonb_build_object(
    'total', (SELECT COUNT(*) FROM leads_act WHERE con_auto),
    'total_anterior', (SELECT COUNT(*) FROM leads_v WHERE rango = 'anterior' AND con_auto),
    'dias_mediana', (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY primer_turno - ingreso) FROM leads_act WHERE con_auto),
    'dias_mediana_segmento', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('segmento', segmento, 'mediana', mediana)), '[]'::jsonb)
      FROM (
        SELECT segmento, percentile_cont(0.5) WITHIN GROUP (ORDER BY primer_turno - ingreso) AS mediana
        FROM leads_act WHERE con_auto GROUP BY segmento
      ) x
    ),
    'por_zona', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('segmento', segmento, 'zona', zona, 'cantidad', cantidad) ORDER BY cantidad DESC, zona), '[]'::jsonb)
      FROM (SELECT segmento, COALESCE(zona_ficha, zona) AS zona, COUNT(*) AS cantidad FROM leads_act WHERE con_auto GROUP BY segmento, COALESCE(zona_ficha, zona)) x
    ),
    'por_segmento', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('segmento', segmento, 'cantidad', cantidad) ORDER BY cantidad DESC, segmento), '[]'::jsonb)
      FROM (SELECT segmento, COUNT(*) AS cantidad FROM leads_act WHERE con_auto GROUP BY segmento) x
    ),
    'turnos', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('segmento', segmento, 'diurno', diurno, 'nocturno', nocturno, 'cargo', cargo) ORDER BY segmento), '[]'::jsonb)
      FROM (
        SELECT segmento,
               COUNT(*) FILTER (WHERE horario_auto IN ('diurno', 'd')) AS diurno,
               COUNT(*) FILTER (WHERE horario_auto IN ('nocturno', 'n')) AS nocturno,
               COUNT(*) FILTER (WHERE horario_auto NOT IN ('diurno', 'd', 'nocturno', 'n')) AS cargo
        FROM leads_act
        WHERE con_auto
        GROUP BY segmento
      ) x
    ),
    'fuera_de_rango', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('segmento', segmento, 'cantidad', cantidad) ORDER BY cantidad DESC, segmento), '[]'::jsonb)
      FROM (SELECT segmento, COUNT(*) AS cantidad FROM fuera_de_rango GROUP BY segmento) x
    )
  )
)
$$;

GRANT EXECUTE ON FUNCTION get_dashboard_marketing(uuid, date, date, date) TO authenticated;
