-- =====================================================================
-- Recálculo de facturación en un solo paso + cuotas fraccionadas facturadas
-- =====================================================================
-- Problemas que resuelve:
--
--   F7. El recálculo borraba toda la facturación del período ANTES de calcular
--       y la volvía a guardar conductor por conductor. Si algo fallaba en el
--       medio (corte de red, pestaña cerrada, error de la base) la semana
--       quedaba vacía o a medias. Ahora la app calcula todo en memoria y al
--       final llama a reemplazar_facturacion_periodo(), que en UNA transacción:
--       verifica el candado, resetea lo aplicado al período, borra la
--       facturación vieja, inserta la nueva y marca lo aplicado. Si algo
--       falla, no cambia nada.
--
--   F6b. Una cuota de cobro fraccionado que no se llegaba a pagar quedaba sin
--       marcar y el recálculo de la semana siguiente la volvía a incluir
--       (además, lo que faltaba ya había pasado al saldo). Ahora cada cuota
--       guarda en qué período se facturó (periodo_facturado_id) y solo se
--       incluye en ese período. "aplicado" sigue significando "pagada".
--
-- Ejecutar ANTES de publicar la versión de la app que usa la función.
-- Es idempotente: se puede correr más de una vez.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Marca de cuota facturada
-- ---------------------------------------------------------------------
ALTER TABLE cobros_fraccionados
  ADD COLUMN IF NOT EXISTS periodo_facturado_id uuid
    REFERENCES periodos_facturacion(id) ON DELETE SET NULL;

COMMENT ON COLUMN cobros_fraccionados.periodo_facturado_id IS
  'Período en el que se facturó la cuota. Una cuota se incluye solo en ese período (no se repite la semana siguiente si no se pagó: lo que falta viaja por el saldo). No indica que esté pagada: eso es aplicado.';

CREATE INDEX IF NOT EXISTS idx_cobros_fraccionados_periodo_facturado
  ON cobros_fraccionados (periodo_facturado_id);

-- Backfill: cada cuota ya facturada queda en el PRIMER período en que se facturó.
-- Las que se repitieron en más de un período dejan de repetirse desde ahora.
UPDATE cobros_fraccionados c
SET periodo_facturado_id = primera.periodo_id
FROM (
  SELECT DISTINCT ON (d.referencia_id)
         d.referencia_id,
         fc.periodo_id
  FROM facturacion_detalle d
  JOIN facturacion_conductores fc ON fc.id = d.facturacion_id
  JOIN periodos_facturacion p ON p.id = fc.periodo_id
  WHERE d.referencia_tipo = 'cobro_fraccionado'
    AND d.referencia_id IS NOT NULL
  ORDER BY d.referencia_id, p.fecha_inicio ASC
) primera
WHERE c.id::text = primera.referencia_id::text
  AND c.periodo_facturado_id IS NULL;

-- ---------------------------------------------------------------------
-- 2. Inserta filas JSON en una tabla, solo con las columnas que existen.
--    Las columnas que no vienen en el JSON toman su valor por defecto.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._insertar_filas_json(p_tabla text, p_filas jsonb)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_cols text;
  v_count integer;
BEGIN
  IF p_filas IS NULL OR jsonb_typeof(p_filas) <> 'array' OR jsonb_array_length(p_filas) = 0 THEN
    RETURN 0;
  END IF;

  SELECT string_agg(quote_ident(k), ', ')
  INTO v_cols
  FROM (
    SELECT DISTINCT jsonb_object_keys(e) AS k
    FROM jsonb_array_elements(p_filas) e
  ) claves
  WHERE k IN (
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = p_tabla
  );

  IF v_cols IS NULL THEN
    RAISE EXCEPTION 'Sin columnas válidas para %', p_tabla;
  END IF;

  EXECUTE format(
    'INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_recordset(NULL::public.%I, $1)',
    p_tabla, v_cols, v_cols, p_tabla
  ) USING p_filas;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------
-- 3. Reemplaza la facturación de un período en una sola transacción
-- ---------------------------------------------------------------------
-- p_facturaciones: filas de facturacion_conductores (con id ya generado)
-- p_detalles:      filas de facturacion_detalle (facturacion_id = id de arriba)
-- p_ticket_ids:    tickets_favor aplicados en esta facturación
-- p_exceso_ids:    excesos_kilometraje aplicados en esta facturación
-- p_cobro_ids:     cuotas de cobros_fraccionados facturadas en este período
-- Devuelve la cantidad de facturaciones guardadas.
CREATE OR REPLACE FUNCTION public.reemplazar_facturacion_periodo(
  p_periodo_id   uuid,
  p_lock_token   uuid,
  p_facturaciones jsonb,
  p_detalles     jsonb,
  p_ticket_ids   text[],
  p_exceso_ids   text[],
  p_cobro_ids    text[]
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_token uuid;
  v_guardadas integer;
BEGIN
  -- El candado tiene que seguir siendo nuestro (si venció y lo tomó otro, no se toca nada)
  SELECT lock_token INTO v_token
  FROM periodos_facturacion
  WHERE id = p_periodo_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El período % no existe', p_periodo_id;
  END IF;
  IF v_token IS DISTINCT FROM p_lock_token THEN
    RAISE EXCEPTION 'candado_perdido: otra ejecución tomó el período';
  END IF;

  -- Resetear lo que estaba aplicado a este período
  UPDATE tickets_favor
  SET estado = 'aprobado', periodo_aplicado_id = NULL, fecha_aplicacion = NULL
  WHERE periodo_aplicado_id = p_periodo_id;

  UPDATE excesos_kilometraje
  SET aplicado = false, fecha_aplicacion = NULL
  WHERE periodo_id = p_periodo_id;

  UPDATE cobros_fraccionados
  SET periodo_facturado_id = NULL
  WHERE periodo_facturado_id = p_periodo_id;

  -- Borrar la facturación vieja del período
  DELETE FROM facturacion_detalle
  WHERE facturacion_id IN (SELECT id FROM facturacion_conductores WHERE periodo_id = p_periodo_id);

  DELETE FROM facturacion_conductores WHERE periodo_id = p_periodo_id;

  -- Insertar la nueva
  v_guardadas := public._insertar_filas_json('facturacion_conductores', p_facturaciones);
  PERFORM public._insertar_filas_json('facturacion_detalle', p_detalles);

  -- Marcar lo aplicado en esta facturación
  IF p_ticket_ids IS NOT NULL AND array_length(p_ticket_ids, 1) > 0 THEN
    UPDATE tickets_favor
    SET estado = 'aplicado', periodo_aplicado_id = p_periodo_id, fecha_aplicacion = now()
    WHERE id::text = ANY (p_ticket_ids);
  END IF;

  IF p_exceso_ids IS NOT NULL AND array_length(p_exceso_ids, 1) > 0 THEN
    UPDATE excesos_kilometraje
    SET aplicado = true, fecha_aplicacion = now(), periodo_id = p_periodo_id
    WHERE id::text = ANY (p_exceso_ids);
  END IF;

  IF p_cobro_ids IS NOT NULL AND array_length(p_cobro_ids, 1) > 0 THEN
    UPDATE cobros_fraccionados
    SET periodo_facturado_id = p_periodo_id
    WHERE id::text = ANY (p_cobro_ids);
  END IF;

  RETURN v_guardadas;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reemplazar_facturacion_periodo(uuid, uuid, jsonb, jsonb, text[], text[], text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public._insertar_filas_json(text, jsonb) TO authenticated;

COMMIT;

-- Para que PostgREST vea la función nueva sin reiniciar
NOTIFY pgrst, 'reload schema';
