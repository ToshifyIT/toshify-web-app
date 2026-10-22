-- sql/sede_pruebas_migracion.sql
-- Sede "Pruebas" (solo admin) y traslado de los datos de prueba (2026-10-22).
--
-- Qué hace:
--   * Agrega sedes.solo_admin y crea la sede Pruebas (codigo PRUEBAS) con solo_admin = true.
--   * Mueve a Pruebas: 5 conductores, 5 vehículos y 5 leads de prueba, y todo lo que
--     cuelga de ellos y tiene sede_id (programaciones, documentos, historiales,
--     facturación + su detalle, etc.), además de las visitas con su DNI o patente.
--   * NO copia configuración: zonas restringidas y sus tipos no dependen de la sede
--     (ya se ven en Pruebas); visitas (atendedores/motivos) y períodos de facturación
--     quedan sin copiar por ahora.
--   * Filas "mixtas" (p. ej. una programación con vehículo de prueba y conductor real)
--     NO se mueven: quedan listadas en sede_pruebas_mixtos_20261022 para revisarlas.
--   * Guarda la sede anterior de cada fila movida en sede_pruebas_respaldo_20261022
--     (paso 4 la restaura).
--
-- Orden: PASO 1 (revisar) -> PASO 2 (migrar) -> PASO 3 (verificar).
-- Correr cada paso por separado.

-- ============================================================
-- PASO 1 - VISTA PREVIA (solo lectura)
-- ============================================================

-- 1a) Leads de prueba (se identifican por teléfono). Tienen que salir exactamente estos 5:
--     FRNA PRUEBAWEB, MARIA PRUEBA, TUKI TUKI, GENESIS PRETELL, MARIA FLORES.
SELECT id, nombre_completo, dni, phone, whatsapp_number, sede, sede_id, created_at
FROM leads
WHERE regexp_replace(coalesce(phone, ''), '\D', '', 'g')
        IN ('5491173152942', '5491141166995', '531234567', '51992638509', '5491185186557')
   OR regexp_replace(coalesce(whatsapp_number, ''), '\D', '', 'g')
        IN ('5491173152942', '5491141166995', '531234567', '51992638509', '5491185186557')
ORDER BY nombre_completo;

-- 1b) Visitas que se moverían (DNI de conductores/leads de prueba o patente de vehículos de prueba).
WITH dnis AS (
  SELECT regexp_replace(numero_dni, '\D', '', 'g') AS dni FROM conductores
  WHERE id IN ('1a07154e-6ec5-4dba-94a0-e194de5da1f0', '5ea6c313-585a-4aae-ac8a-0910a2ebfdfd',
               '49f48af7-2395-4f60-a785-a7f46f8ea3d8', 'c4759813-a422-4f4a-943c-dcb3e0cb04a9',
               'cc07370f-2107-4354-bd10-088a5f19bee4')
  UNION
  SELECT regexp_replace(dni, '\D', '', 'g') FROM leads
  WHERE regexp_replace(coalesce(phone, ''), '\D', '', 'g')
          IN ('5491173152942', '5491141166995', '531234567', '51992638509', '5491185186557')
     OR regexp_replace(coalesce(whatsapp_number, ''), '\D', '', 'g')
          IN ('5491173152942', '5491141166995', '531234567', '51992638509', '5491185186557')
), patentes AS (
  SELECT upper(replace(patente, ' ', '')) AS patente FROM vehiculos
  WHERE id IN ('e0ea0a40-3cbb-43b4-8c20-d36ff271df36', 'e8d43229-0d07-4218-9bbf-3b2b7c5d808e',
               '43006eee-3615-400c-90c8-a9a4254a21b8', 'c8237126-ca9c-4215-ade2-f1c58b1a3b7a',
               '593e68e6-ce0e-43dc-830b-620556607d9f')
)
SELECT v.id, v.fecha_hora, v.nombre_visitante, v.dni_visitante, v.patente, v.estado
FROM visitas v
WHERE (nullif(regexp_replace(coalesce(v.dni_visitante, ''), '\D', '', 'g'), '') IN (SELECT dni FROM dnis WHERE dni <> ''))
   OR (nullif(upper(replace(coalesce(v.patente, ''), ' ', '')), '') IN (SELECT patente FROM patentes))
ORDER BY v.fecha_hora;


-- ============================================================
-- PASO 2 - MIGRACIÓN (todo o nada: si algo falla no cambia nada)
-- ============================================================
DO $$
DECLARE
  v_pruebas   uuid;
  v_conds     text[] := ARRAY['1a07154e-6ec5-4dba-94a0-e194de5da1f0', '5ea6c313-585a-4aae-ac8a-0910a2ebfdfd',
                              '49f48af7-2395-4f60-a785-a7f46f8ea3d8', 'c4759813-a422-4f4a-943c-dcb3e0cb04a9',
                              'cc07370f-2107-4354-bd10-088a5f19bee4'];
  v_vehs      text[] := ARRAY['e0ea0a40-3cbb-43b4-8c20-d36ff271df36', 'e8d43229-0d07-4218-9bbf-3b2b7c5d808e',
                              '43006eee-3615-400c-90c8-a9a4254a21b8', 'c8237126-ca9c-4215-ade2-f1c58b1a3b7a',
                              '593e68e6-ce0e-43dc-830b-620556607d9f'];
  v_tels      text[] := ARRAY['5491173152942', '5491141166995', '531234567', '51992638509', '5491185186557'];
  v_n         int;
  r           record;
  v_any       text;
  v_all       text;
  v_cols_sede text;
BEGIN
  IF EXISTS (SELECT 1 FROM sedes WHERE codigo = 'PRUEBAS') THEN
    RAISE EXCEPTION 'La sede PRUEBAS ya existe: la migración ya se corrió.';
  END IF;
  IF to_regclass('public.sede_pruebas_respaldo_20261022') IS NOT NULL THEN
    RAISE EXCEPTION 'Ya existe sede_pruebas_respaldo_20261022: la migración ya se corrió.';
  END IF;

  -- Registros de prueba (ids como texto para comparar con cualquier tipo de columna)
  CREATE TEMP TABLE _prueba_ids (tabla text, id text) ON COMMIT DROP;
  INSERT INTO _prueba_ids SELECT 'conductores', id::text FROM conductores WHERE id::text = ANY (v_conds);
  INSERT INTO _prueba_ids SELECT 'vehiculos',   id::text FROM vehiculos   WHERE id::text = ANY (v_vehs);
  INSERT INTO _prueba_ids
    SELECT 'leads', id::text FROM leads
    WHERE regexp_replace(coalesce(phone, ''), '\D', '', 'g') = ANY (v_tels)
       OR regexp_replace(coalesce(whatsapp_number, ''), '\D', '', 'g') = ANY (v_tels);

  -- Control: tienen que ser exactamente 5 + 5 + 5
  IF (SELECT count(*) FROM _prueba_ids WHERE tabla = 'conductores') <> 5
     OR (SELECT count(*) FROM _prueba_ids WHERE tabla = 'vehiculos') <> 5
     OR (SELECT count(*) FROM _prueba_ids WHERE tabla = 'leads') <> 5 THEN
    RAISE EXCEPTION 'Cantidad inesperada de registros de prueba: conductores %, vehiculos %, leads % (se esperaban 5/5/5). No se cambió nada.',
      (SELECT count(*) FROM _prueba_ids WHERE tabla = 'conductores'),
      (SELECT count(*) FROM _prueba_ids WHERE tabla = 'vehiculos'),
      (SELECT count(*) FROM _prueba_ids WHERE tabla = 'leads');
  END IF;

  -- Sede Pruebas, visible solo para admin
  ALTER TABLE sedes ADD COLUMN IF NOT EXISTS solo_admin boolean NOT NULL DEFAULT false;
  -- El resto de los datos obligatorios de la sede (ciudad, país, etc.) se copian de Buenos Aires
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO v_cols_sede
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'sedes'
    AND column_name NOT IN ('id', 'nombre', 'codigo', 'es_principal', 'activa', 'solo_admin', 'created_at', 'updated_at')
    AND is_generated = 'NEVER' AND is_identity = 'NO';
  IF NOT EXISTS (SELECT 1 FROM sedes WHERE codigo = 'BSAS') THEN
    RAISE EXCEPTION 'No se encontró la sede Buenos Aires (codigo BSAS).';
  END IF;
  EXECUTE format(
    'INSERT INTO sedes (nombre, codigo, es_principal, activa, solo_admin%1$s) '
    || 'SELECT %2$L, %3$L, false, true, true%1$s FROM sedes WHERE codigo = %4$L RETURNING id',
    CASE WHEN v_cols_sede IS NULL THEN '' ELSE ', ' || v_cols_sede END,
    'Pruebas', 'PRUEBAS', 'BSAS')
  INTO v_pruebas;

  -- Respaldo de la sede anterior de cada fila movida, y filas mixtas no movidas
  CREATE TABLE public.sede_pruebas_respaldo_20261022 (
    tabla               text NOT NULL,
    fila_id             text NOT NULL,
    sede_id_anterior    uuid,
    sede_texto_anterior text,
    movido_at           timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE public.sede_pruebas_mixtos_20261022 (
    tabla   text NOT NULL,
    fila_id text NOT NULL
  );

  -- 1) Registros base
  INSERT INTO sede_pruebas_respaldo_20261022 (tabla, fila_id, sede_id_anterior)
    SELECT 'conductores', id::text, sede_id FROM conductores WHERE id::text IN (SELECT id FROM _prueba_ids WHERE tabla = 'conductores');
  UPDATE conductores SET sede_id = v_pruebas WHERE id::text IN (SELECT id FROM _prueba_ids WHERE tabla = 'conductores');

  INSERT INTO sede_pruebas_respaldo_20261022 (tabla, fila_id, sede_id_anterior)
    SELECT 'vehiculos', id::text, sede_id FROM vehiculos WHERE id::text IN (SELECT id FROM _prueba_ids WHERE tabla = 'vehiculos');
  UPDATE vehiculos SET sede_id = v_pruebas WHERE id::text IN (SELECT id FROM _prueba_ids WHERE tabla = 'vehiculos');

  -- leads también guarda la sede en texto (`sede`): se actualiza para que la
  -- sincronización del módulo Leads no la "corrija" de vuelta a Buenos Aires.
  INSERT INTO sede_pruebas_respaldo_20261022 (tabla, fila_id, sede_id_anterior, sede_texto_anterior)
    SELECT 'leads', id::text, sede_id, sede FROM leads WHERE id::text IN (SELECT id FROM _prueba_ids WHERE tabla = 'leads');
  UPDATE leads SET sede_id = v_pruebas, sede = 'Pruebas' WHERE id::text IN (SELECT id FROM _prueba_ids WHERE tabla = 'leads');

  -- 2) Todo lo que cuelga de conductores/vehículos/leads y tiene sede_id.
  --    Se mueve la fila solo si TODAS sus referencias a conductores/vehículos/leads
  --    son de prueba (o vacías). Si mezcla prueba con datos reales, queda en "mixtos".
  FOR r IN
    SELECT tc.relname AS tabla, array_agg(DISTINCT a.attname::text) AS cols
    FROM pg_constraint k
    JOIN pg_class tc     ON tc.oid = k.conrelid
    JOIN pg_class tr     ON tr.oid = k.confrelid
    JOIN pg_namespace ns ON ns.oid = tc.relnamespace
    JOIN pg_attribute a  ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
    WHERE k.contype = 'f'
      AND ns.nspname = 'public'
      AND tr.relname IN ('conductores', 'vehiculos', 'leads')
      AND array_length(k.conkey, 1) = 1
      AND tc.relname NOT IN ('conductores', 'vehiculos', 'leads')
      AND tc.relkind = 'r'
      AND EXISTS (SELECT 1 FROM information_schema.columns ic
                  WHERE ic.table_schema = 'public' AND ic.table_name = tc.relname AND ic.column_name = 'sede_id')
      AND EXISTS (SELECT 1 FROM information_schema.columns ic
                  WHERE ic.table_schema = 'public' AND ic.table_name = tc.relname AND ic.column_name = 'id')
    GROUP BY tc.relname
  LOOP
    SELECT string_agg(format('%I::text IN (SELECT id FROM _prueba_ids)', c), ' OR '),
           string_agg(format('(%I IS NULL OR %I::text IN (SELECT id FROM _prueba_ids))', c, c), ' AND ')
      INTO v_any, v_all
    FROM unnest(r.cols) AS c;

    EXECUTE format('INSERT INTO sede_pruebas_mixtos_20261022 (tabla, fila_id) SELECT %L, id::text FROM %I WHERE (%s) AND NOT (%s)',
                   r.tabla, r.tabla, v_any, v_all);

    EXECUTE format('INSERT INTO sede_pruebas_respaldo_20261022 (tabla, fila_id, sede_id_anterior) SELECT %L, id::text, sede_id FROM %I WHERE (%s) AND (%s) AND sede_id IS DISTINCT FROM $1',
                   r.tabla, r.tabla, v_any, v_all) USING v_pruebas;
    EXECUTE format('UPDATE %I SET sede_id = $1 WHERE (%s) AND (%s) AND sede_id IS DISTINCT FROM $1',
                   r.tabla, v_any, v_all) USING v_pruebas;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n > 0 THEN RAISE NOTICE '% -> % filas movidas', r.tabla, v_n; END IF;
  END LOOP;

  -- 3) Detalle de facturación de las facturas movidas
  INSERT INTO sede_pruebas_respaldo_20261022 (tabla, fila_id, sede_id_anterior)
    SELECT 'facturacion_detalle', d.id::text, d.sede_id FROM facturacion_detalle d
    WHERE d.facturacion_id::text IN (SELECT fila_id FROM sede_pruebas_respaldo_20261022 WHERE tabla = 'facturacion_conductores')
      AND d.sede_id IS DISTINCT FROM v_pruebas;
  UPDATE facturacion_detalle SET sede_id = v_pruebas
  WHERE facturacion_id::text IN (SELECT fila_id FROM sede_pruebas_respaldo_20261022 WHERE tabla = 'facturacion_conductores')
    AND sede_id IS DISTINCT FROM v_pruebas;

  -- 4) Visitas (sin FK): por DNI de conductores/leads de prueba o patente de vehículos de prueba
  CREATE TEMP TABLE _prueba_dnis ON COMMIT DROP AS
    SELECT regexp_replace(numero_dni, '\D', '', 'g') AS dni FROM conductores
    WHERE id::text IN (SELECT id FROM _prueba_ids WHERE tabla = 'conductores')
    UNION
    SELECT regexp_replace(dni, '\D', '', 'g') FROM leads
    WHERE id::text IN (SELECT id FROM _prueba_ids WHERE tabla = 'leads');
  DELETE FROM _prueba_dnis WHERE dni IS NULL OR dni = '';

  CREATE TEMP TABLE _prueba_patentes ON COMMIT DROP AS
    SELECT upper(replace(patente, ' ', '')) AS patente FROM vehiculos
    WHERE id::text IN (SELECT id FROM _prueba_ids WHERE tabla = 'vehiculos');

  INSERT INTO sede_pruebas_respaldo_20261022 (tabla, fila_id, sede_id_anterior)
    SELECT 'visitas', v.id::text, v.sede_id FROM visitas v
    WHERE (regexp_replace(coalesce(v.dni_visitante, ''), '\D', '', 'g') IN (SELECT dni FROM _prueba_dnis)
        OR upper(replace(coalesce(v.patente, ''), ' ', '')) IN (SELECT patente FROM _prueba_patentes))
      AND v.sede_id IS DISTINCT FROM v_pruebas;
  UPDATE visitas v SET sede_id = v_pruebas
  WHERE (regexp_replace(coalesce(v.dni_visitante, ''), '\D', '', 'g') IN (SELECT dni FROM _prueba_dnis)
      OR upper(replace(coalesce(v.patente, ''), ' ', '')) IN (SELECT patente FROM _prueba_patentes))
    AND v.sede_id IS DISTINCT FROM v_pruebas;

  RAISE NOTICE 'Sede Pruebas: %', v_pruebas;
END $$;


-- ============================================================
-- PASO 3 - VERIFICACIÓN
-- ============================================================

-- 3a) Qué se movió, por tabla
SELECT tabla, count(*) AS filas_movidas
FROM sede_pruebas_respaldo_20261022
GROUP BY tabla
ORDER BY tabla;

-- 3b) Filas mixtas que NO se movieron (revisarlas a mano). Vacío = ninguna.
SELECT tabla, count(*) AS filas, array_agg(fila_id) AS ids
FROM sede_pruebas_mixtos_20261022
GROUP BY tabla;

-- 3c) Nueva sede
SELECT id, nombre, codigo, es_principal, activa, solo_admin FROM sedes ORDER BY es_principal DESC, nombre;


-- ============================================================
-- PASO 4 - REVERTIR (solo si hace falta deshacer)
-- ============================================================
-- DO $$
-- DECLARE r record;
-- BEGIN
--   FOR r IN SELECT DISTINCT tabla FROM sede_pruebas_respaldo_20261022 LOOP
--     IF r.tabla = 'leads' THEN
--       UPDATE leads l SET sede_id = b.sede_id_anterior, sede = b.sede_texto_anterior
--       FROM sede_pruebas_respaldo_20261022 b
--       WHERE b.tabla = 'leads' AND l.id::text = b.fila_id;
--     ELSE
--       EXECUTE format('UPDATE %I t SET sede_id = b.sede_id_anterior FROM sede_pruebas_respaldo_20261022 b WHERE b.tabla = %L AND t.id::text = b.fila_id',
--                      r.tabla, r.tabla);
--     END IF;
--   END LOOP;
--   -- Falla si después se cargó algo nuevo en la sede Pruebas (en ese caso, desactivarla: activa = false).
--   DELETE FROM sedes WHERE codigo = 'PRUEBAS';
--   DROP TABLE sede_pruebas_respaldo_20261022;
--   DROP TABLE sede_pruebas_mixtos_20261022;
-- END $$;
