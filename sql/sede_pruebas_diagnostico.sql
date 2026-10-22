-- sql/sede_pruebas_diagnostico.sql
-- SOLO LECTURA. Diagnóstico previo para crear la sede "Pruebas" (2026-10-22).
-- Correr cada bloque por separado en Supabase y pasar los resultados.

-- 1) Sedes actuales
SELECT id, nombre, codigo, es_principal, activa
FROM sedes
ORDER BY es_principal DESC, nombre;

-- 2) Tablas que dependen de la sede (tienen sede_id) y cuántas filas tiene Buenos Aires en cada una.
--    Las de pocas filas suelen ser configuración (lo que habría que replicar);
--    las de muchas, datos operativos (no se replican).
WITH bsas AS (
  SELECT id FROM sedes WHERE nombre ILIKE 'buenos aires%' ORDER BY es_principal DESC LIMIT 1
)
SELECT
  c.table_name AS tabla,
  (xpath('/row/n/text()', query_to_xml(
     format('SELECT count(*) AS n FROM public.%I WHERE sede_id = %L', c.table_name, (SELECT id FROM bsas)),
     false, true, '')))[1]::text::int AS filas_bsas,
  (xpath('/row/n/text()', query_to_xml(
     format('SELECT count(*) AS n FROM public.%I', c.table_name),
     false, true, '')))[1]::text::int AS filas_total,
  c.is_nullable AS sede_id_admite_null
FROM information_schema.columns c
JOIN information_schema.tables t
  ON t.table_schema = c.table_schema AND t.table_name = c.table_name
WHERE c.table_schema = 'public'
  AND c.column_name = 'sede_id'
  AND t.table_type = 'BASE TABLE'
ORDER BY filas_bsas, tabla;

-- 3) Candidatos de prueba (revisar que sean todos y solo esos)
SELECT 'conductor' AS tipo, c.id, trim(c.nombres || ' ' || c.apellidos) AS nombre,
       c.numero_dni AS dato, s.nombre AS sede, c.created_at
FROM conductores c
LEFT JOIN sedes s ON s.id = c.sede_id
WHERE c.nombres ILIKE '%prueba%' OR c.apellidos ILIKE '%prueba%'
UNION ALL
SELECT 'vehiculo', v.id, v.patente, trim(v.marca || ' ' || v.modelo), s.nombre, v.created_at
FROM vehiculos v
LEFT JOIN sedes s ON s.id = v.sede_id
WHERE v.patente ILIKE 'PRB%' OR v.modelo ILIKE '%prueba%'
ORDER BY tipo, nombre;

-- 4) Registros que cuelgan de esos conductores/vehículos (asignaciones, garantías, saldos, etc.)
--    Recorre todas las FK que apuntan a conductores(id) o vehiculos(id) y cuenta las filas
--    que referencian a los candidatos del bloque 3. Indica también si esa tabla tiene sede_id.
WITH fks AS (
  SELECT
    tc.relname AS tabla,
    a.attname  AS columna,
    tr.relname AS referencia
  FROM pg_constraint k
  JOIN pg_class tc ON tc.oid = k.conrelid
  JOIN pg_class tr ON tr.oid = k.confrelid
  JOIN pg_namespace n ON n.oid = tc.relnamespace
  JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
  WHERE k.contype = 'f'
    AND n.nspname = 'public'
    AND tr.relname IN ('conductores', 'vehiculos')
    AND array_length(k.conkey, 1) = 1
)
SELECT
  f.tabla, f.columna, f.referencia,
  (xpath('/row/n/text()', query_to_xml(
     format('SELECT count(*) AS n FROM public.%I WHERE %I IN (SELECT id FROM (%s) x)',
            f.tabla, f.columna,
            'SELECT id FROM conductores WHERE nombres ILIKE ''%prueba%'' OR apellidos ILIKE ''%prueba%'' '
            || 'UNION ALL SELECT id FROM vehiculos WHERE patente ILIKE ''PRB%'' OR modelo ILIKE ''%prueba%'''),
     false, true, '')))[1]::text::int AS filas_de_prueba,
  EXISTS (
    SELECT 1 FROM information_schema.columns ic
    WHERE ic.table_schema = 'public' AND ic.table_name = f.tabla AND ic.column_name = 'sede_id'
  ) AS tiene_sede_id
FROM fks f
ORDER BY filas_de_prueba DESC, f.tabla;

-- 5) Funciones de la base que leen conductores/vehículos/asignaciones
--    (pueden procesar todas las sedes sin filtrar, p. ej. facturación o saldos).
SELECT p.proname AS funcion,
       p.prosecdef AS security_definer,
       (p.prosrc ILIKE '%sede_id%') AS menciona_sede
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (p.prosrc ILIKE '%conductores%' OR p.prosrc ILIKE '%vehiculos%' OR p.prosrc ILIKE '%asignaciones%')
ORDER BY menciona_sede, funcion;

-- 6) Tareas programadas (si usan pg_cron). Si da error "relation cron.job does not exist", ignorar.
SELECT jobid, jobname, schedule, command, active
FROM cron.job
ORDER BY jobid;
