-- =====================================================================
-- Distribución en mapa: carga inicial en dos consultas
-- =====================================================================
-- Problema: al abrir Distribución en mapa la app hacía unos 97 pedidos a
-- Supabase y la lista tardaba ~4,5 s en aparecer (Buenos Aires, 23/11/2026).
-- Los conductores se armaban en cadena: conductores -> última asignación de
-- cada uno (en tandas de 100 ids) -> TODA la tabla asignaciones_conductores
-- página por página (para saber la asignación activa y el compañero) ->
-- turno que tenían como lead (otra vez en tandas de 100 DNI). Los leads se
-- pedían en páginas de 1000, esperando la primera para saber el total.
--
-- Con estas dos funciones la app hace un solo pedido para los conductores
-- (con su asignación activa, compañeros, último horario y turno de lead) y
-- uno solo para los leads. Devuelven lo mismo que antes armaba la app: el
-- cálculo de la pantalla no cambia.
--
-- Son de solo lectura y corren con los permisos de quien las llama (no son
-- SECURITY DEFINER): cada usuario sigue viendo solo lo que ya podía ver.
--
-- Ejecutar en Supabase > SQL Editor ANTES de publicar la versión de la app
-- que las usa. Sin las funciones instaladas la pantalla sigue andando por el
-- camino anterior (más lento) y avisa que falta correr este archivo.
-- Es idempotente: se puede correr más de una vez.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Conductores
--   p_sedes            sedes a mostrar (NULL = sin filtro de sede)
--   p_sede_asignacion  sede de la asignación activa (NULL = cualquiera);
--                      es la sede elegida, o NULL con "Todas las sedes"
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mapa_conductores(
  p_sedes uuid[] DEFAULT NULL,
  p_sede_asignacion uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH cond AS (
    SELECT c.*
    FROM conductores c
    WHERE p_sedes IS NULL OR c.sede_id = ANY (p_sedes)
  ),
  -- Filas de asignación activas: mismo criterio que la columna Asignación de
  -- Conductores (fila asignado/activo, asignación activa, con vehículo).
  activas AS (
    SELECT
      ac.id AS fila_id,
      ac.conductor_id,
      a.id AS asignacion_id,
      NULLIF(lower(COALESCE(a.horario, '')), '') AS horario_asignacion,
      NULLIF(lower(COALESCE(ac.horario, '')), '') AS horario_conductor,
      NULLIF(v.patente, '') AS patente,
      COALESCE(NULLIF(ac.tipo_tarifa, ''), NULLIF(a.tipo_tarifa, ''), 'antigua') AS tarifa
    FROM asignaciones_conductores ac
    JOIN asignaciones a ON a.id = ac.asignacion_id
    JOIN vehiculos v ON v.id = a.vehiculo_id
    WHERE ac.conductor_id IS NOT NULL
      AND lower(COALESCE(ac.estado, '')) IN ('asignado', 'activo')
      AND lower(COALESCE(a.estado, '')) IN ('activo', 'activa')
      AND (p_sede_asignacion IS NULL OR a.sede_id IS NULL OR a.sede_id = p_sede_asignacion)
  ),
  -- Quién ocupa cada turno de cada asignación (para el compañero).
  ocupacion AS (
    SELECT
      asignacion_id,
      COALESCE(array_agg(DISTINCT conductor_id) FILTER (WHERE horario_conductor = 'diurno'), '{}') AS diurno,
      COALESCE(array_agg(DISTINCT conductor_id) FILTER (WHERE horario_conductor = 'nocturno'), '{}') AS nocturno
    FROM activas
    GROUP BY asignacion_id
  ),
  -- Una asignación activa por conductor: la primera fila por id, como antes.
  asig AS (
    SELECT DISTINCT ON (x.conductor_id)
      x.conductor_id,
      jsonb_build_object(
        'asignacion_id', x.asignacion_id,
        'horario_asignacion', x.horario_asignacion,
        'horario_conductor', x.horario_conductor,
        'patente', x.patente,
        'tarifa', x.tarifa,
        'diurno', to_jsonb(o.diurno),
        'nocturno', to_jsonb(o.nocturno)
      ) AS datos
    FROM activas x
    JOIN ocupacion o ON o.asignacion_id = x.asignacion_id
    ORDER BY x.conductor_id, x.fila_id
  ),
  -- Horario de la última asignación (cualquier estado y sede). Mismo orden que
  -- antes: fecha_asignacion descendente, las filas sin fecha primero.
  ultimo AS (
    SELECT DISTINCT ON (ac.conductor_id)
      ac.conductor_id,
      NULLIF(ac.horario, '') AS horario
    FROM asignaciones_conductores ac
    JOIN cond ON cond.id = ac.conductor_id
    ORDER BY ac.conductor_id, ac.fecha_asignacion DESC
  ),
  -- Turno que tenía como lead (respaldo cuando no hay otro dato).
  turno_lead AS (
    SELECT DISTINCT ON (l.dni)
      l.dni,
      l.turno
    FROM leads l
    WHERE l.dni IN (SELECT numero_dni FROM cond WHERE numero_dni IS NOT NULL AND numero_dni <> '')
      AND l.turno IS NOT NULL AND l.turno <> ''
    ORDER BY l.dni
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'nombres', c.nombres,
        'apellidos', c.apellidos,
        'numero_dni', c.numero_dni,
        'preferencia_turno', c.preferencia_turno,
        'zona', c.zona,
        'direccion', c.direccion,
        'direccion_lat', c.direccion_lat,
        'direccion_lng', c.direccion_lng,
        'direccion_pais', c.direccion_pais,
        'direccion_ciudad', c.direccion_ciudad,
        'estado_id', c.estado_id,
        'fecha_nacimiento', c.fecha_nacimiento,
        'numero_licencia', c.numero_licencia,
        'licencia_vencimiento', c.licencia_vencimiento,
        'experiencia_previa', c.experiencia_previa,
        'antecedentes_penales', c.antecedentes_penales,
        'telefono_contacto', c.telefono_contacto,
        'fecha_contratacion', c.fecha_contratacion,
        'created_at', c.created_at,
        'conductores_estados', CASE WHEN e.id IS NULL THEN NULL
          ELSE jsonb_build_object('codigo', e.codigo, 'descripcion', e.descripcion) END,
        'ultimo_horario', u.horario,
        'asignacion_activa', asig.datos,
        'turno_lead', tl.turno
      )
      ORDER BY c.created_at DESC NULLS LAST, c.id
    ),
    '[]'::jsonb
  )
  FROM cond c
  LEFT JOIN conductores_estados e ON e.id = c.estado_id
  LEFT JOIN ultimo u ON u.conductor_id = c.id
  LEFT JOIN asig ON asig.conductor_id = c.id
  LEFT JOIN turno_lead tl ON tl.dni = c.numero_dni;
$$;

-- ---------------------------------------------------------------------
-- Leads
--   p_sedes      sedes a mostrar (NULL = sin filtro de sede)
--   p_excluidos  estados que no entran al mapa (los leads sin estado sí)
-- ---------------------------------------------------------------------
-- Devuelve las filas como listas de valores, con los nombres de las columnas
-- una sola vez en 'columnas' (en el mismo orden). Con ~11.000 leads, repetir
-- los 23 nombres en cada fila casi duplicaba el tamaño de la respuesta y el
-- tiempo de armarla. Es json (no jsonb) por la misma razón: se arma más rápido.
DROP FUNCTION IF EXISTS public.mapa_leads(uuid[], text[]);
CREATE FUNCTION public.mapa_leads(
  p_sedes uuid[] DEFAULT NULL,
  p_excluidos text[] DEFAULT '{}'
) RETURNS json
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT json_build_object(
    'columnas', json_build_array(
      'id', 'nombre_completo', 'primer_nombre', 'apellido', 'dni', 'estado_de_lead', 'turno', 'zona', 'direccion', 'direccion_pais', 'direccion_ciudad', 'latitud', 'longitud', 'edad', 'licencia', 'vencimiento_licencia', 'experiencia_previa', 'experiencia_manejo', 'antecedentes_penales', 'phone', 'tiempo_de_antiguedad', 'created_at', 'entrevistador_asignado'
    ),
    'filas', COALESCE(
      json_agg(
        json_build_array(
          l.id, l.nombre_completo, l.primer_nombre, l.apellido, l.dni, l.estado_de_lead, l.turno, l.zona, l.direccion, l.direccion_pais, l.direccion_ciudad, l.latitud, l.longitud, l.edad, l.licencia, l.vencimiento_licencia, l.experiencia_previa, l.experiencia_manejo, l.antecedentes_penales, l.phone, l.tiempo_de_antiguedad, l.created_at, l.entrevistador_asignado
        )
        ORDER BY l.created_at DESC NULLS LAST, l.id
      ),
      '[]'::json
    )
  )
  FROM leads l
  WHERE (p_sedes IS NULL OR l.sede_id = ANY (p_sedes))
    AND (l.estado_de_lead IS NULL OR NOT (l.estado_de_lead = ANY (COALESCE(p_excluidos, '{}'))));
$$;

GRANT EXECUTE ON FUNCTION public.mapa_conductores(uuid[], uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mapa_leads(uuid[], text[]) TO authenticated;

COMMIT;

-- Recargar el esquema de la API para que la app vea las funciones enseguida.
NOTIFY pgrst, 'reload schema';
