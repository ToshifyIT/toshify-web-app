-- =====================================================
-- MCP: vistas listas para las preguntas más frecuentes
-- =====================================================
-- Las usa el catálogo de datos del MCP (mcp/lib/catalogoDatos.js), permiso datos:read:
--   v_multas_historico      multas con el importe como número (importe_numero)
--   v_estado_flota_hoy      cada vehículo con su estado, desde cuándo y taller
--   v_vencimientos_proximos vencimientos vencidos o de los próximos 60 días, sin
--                           vehículos devueltos ni jubilados
--   v_leads_semanales       leads por semana, fuente y sede, con su conversión a conductor
--
-- Todas excluyen las patentes de prueba (PRUEBA987, PRUB99999, PRB001…), igual que la
-- pantalla de Vencimientos. Fechas de "hoy" en hora de Argentina.
--
-- security_invoker: la vista respeta el RLS de las tablas de abajo (sin eso se leería
-- con los permisos del dueño). Solo lectura: no se puede escribir a través de ellas.
--
-- Ejecutar en el SQL Editor de Supabase ANTES de publicar el MCP. Idempotente.

BEGIN;

-- Importe en texto ("$175.962,00" o "$ 342150.00") a número. NULL si no se entiende.
-- Con coma: la coma es el decimal y los puntos son miles. Sin coma: el punto es el decimal.
CREATE OR REPLACE FUNCTION public.mcp_importe_a_numero(p_texto text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN s ~ '^-?[0-9]+(\.[0-9]+)?$' THEN s::numeric END
  FROM (
    SELECT CASE
      WHEN p_texto LIKE '%,%'
        THEN replace(replace(regexp_replace(p_texto, '[^0-9,.-]', '', 'g'), '.', ''), ',', '.')
      ELSE regexp_replace(p_texto, '[^0-9.-]', '', 'g')
    END AS s
  ) x
$$;

-- ── Multas con importe numérico (sin drive_url, como el catálogo) ──
CREATE OR REPLACE VIEW public.v_multas_historico
WITH (security_invoker = true) AS
SELECT
  m.id, m.created_at, m.patente, m.fecha_infraccion,
  m.importe, public.mcp_importe_a_numero(m.importe) AS importe_numero,
  m.importe_descuento, public.mcp_importe_a_numero(m.importe_descuento) AS importe_descuento_numero,
  m.fecha_vencimiento_descuento,
  m.lugar, m.lugar_detalle, m.detalle, m.infraccion, m.fecha_anotacion,
  m.conductor_responsable, m.observaciones, m.ibutton, m.origen_actualizacion, m.pagado,
  m.sede_id, s.nombre AS sede_nombre,
  m.deleted_at, m.deleted_reason, m.desestimada_at, m.desestimada_motivo,
  m.updated_at, m.multa_origen_id
FROM public.multas_historico m
LEFT JOIN public.sedes s ON s.id = m.sede_id
WHERE m.patente IS NULL OR m.patente !~* '^\s*(PRUEB|PRUB|PRB)';

-- ── Estado de flota de hoy ──
-- estado_desde: inicio del estado actual según vehiculos_estado_historial.
-- grupo: en_uso | pkg_on | pkg_off | taller | retenido, o NULL si está fuera de flota
-- (jubilado, devuelto, robo, destrucción), igual que los KPIs (kpi_estado_bucket).
CREATE OR REPLACE VIEW public.v_estado_flota_hoy
WITH (security_invoker = true) AS
SELECT
  v.id AS vehiculo_id, v.patente, v.marca, v.modelo, v.anio, v.grupo_flota, v.kilometraje_actual,
  v.sede_id, s.nombre AS sede_nombre,
  e.codigo AS estado_codigo, e.descripcion AS estado,
  public.kpi_estado_bucket(e.codigo) AS grupo,
  public.kpi_estado_bucket(e.codigo) IS NOT NULL AS en_flota,
  h.desde AS estado_desde,
  ((now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
    - (h.desde AT TIME ZONE 'America/Argentina/Buenos_Aires')::date) AS dias_en_estado,
  e.codigo LIKE 'TALLER%' AS en_taller,
  CASE WHEN e.codigo LIKE 'TALLER%' THEN e.descripcion END AS taller,
  h.motivo AS motivo_estado
FROM public.vehiculos v
LEFT JOIN public.vehiculos_estados e ON e.id = v.estado_id
LEFT JOIN public.sedes s ON s.id = v.sede_id
LEFT JOIN LATERAL (
  SELECT eh.desde, eh.motivo
  FROM public.vehiculos_estado_historial eh
  WHERE eh.vehiculo_id = v.id AND eh.hasta IS NULL
  ORDER BY eh.desde DESC
  LIMIT 1
) h ON true
WHERE v.deleted_at IS NULL
  AND (v.patente IS NULL OR v.patente !~* '^\s*(PRUEB|PRUB|PRB)');

-- ── Vencimientos próximos ──
-- Sale de la tabla vencimientos (la de la pantalla Vehículos > Vencimientos). Vencidos y
-- los que vencen en los próximos 60 días; dias_restantes negativo = vencido.
CREATE OR REPLACE VIEW public.v_vencimientos_proximos
WITH (security_invoker = true) AS
SELECT
  vc.id, vc.patente, vc.documento, vc.fecha_vencimiento,
  (vc.fecha_vencimiento - (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date) AS dias_restantes,
  vc.prioridad, vc.solicitado, vc.fecha_iniciar_gestion, vc.observacion,
  v.id AS vehiculo_id, v.marca, v.modelo,
  v.sede_id, s.nombre AS sede_nombre,
  e.codigo AS estado_vehiculo_codigo, e.descripcion AS estado_vehiculo
FROM public.vencimientos vc
LEFT JOIN public.vehiculos v
  ON v.deleted_at IS NULL
  AND upper(replace(v.patente, ' ', '')) = upper(replace(vc.patente, ' ', ''))
LEFT JOIN public.vehiculos_estados e ON e.id = v.estado_id
LEFT JOIN public.sedes s ON s.id = v.sede_id
WHERE vc.fecha_vencimiento IS NOT NULL
  AND vc.fecha_vencimiento <= (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date + 60
  AND COALESCE(e.codigo, '') NOT IN ('JUBILADO', 'DEVUELTO_PROVEEDOR')
  AND (vc.patente IS NULL OR vc.patente !~* '^\s*(PRUEB|PRUB|PRB)');

-- ── Leads por semana ──
-- semana: lunes de la semana de fecha_creacion (hora de Argentina).
-- convertidos: el lead tiene fecha_convertido o un conductor que salió de él
-- (conductores.lead_origen_id).
CREATE OR REPLACE VIEW public.v_leads_semanales
WITH (security_invoker = true) AS
SELECT
  date_trunc('week', l.fecha_creacion AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS semana,
  COALESCE(NULLIF(trim(l.fuente_de_lead), ''), '(sin fuente)') AS fuente,
  l.sede_id, s.nombre AS sede_nombre,
  count(*) AS leads,
  count(*) FILTER (WHERE l.fecha_convertido IS NOT NULL OR c.lead_id IS NOT NULL) AS convertidos,
  round(100.0 * count(*) FILTER (WHERE l.fecha_convertido IS NOT NULL OR c.lead_id IS NOT NULL)
    / count(*), 1) AS conversion_pct
FROM public.leads l
LEFT JOIN (
  SELECT DISTINCT lead_origen_id AS lead_id
  FROM public.conductores
  WHERE lead_origen_id IS NOT NULL
) c ON c.lead_id = l.id
LEFT JOIN public.sedes s ON s.id = l.sede_id
WHERE l.fecha_creacion IS NOT NULL
GROUP BY 1, 2, 3, 4;

-- Solo el backend (service_role) y usuarios logueados; nunca anónimos
REVOKE ALL ON public.v_multas_historico, public.v_estado_flota_hoy,
  public.v_vencimientos_proximos, public.v_leads_semanales FROM anon;
GRANT SELECT ON public.v_multas_historico, public.v_estado_flota_hoy,
  public.v_vencimientos_proximos, public.v_leads_semanales TO authenticated, service_role;

COMMIT;

-- Control: importes que no se pudieron convertir (debería dar 0 o casi)
SELECT importe, count(*) FROM public.v_multas_historico
WHERE importe IS NOT NULL AND importe_numero IS NULL
GROUP BY importe;
