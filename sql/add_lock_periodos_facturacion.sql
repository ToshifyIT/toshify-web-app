-- =====================================================================
-- Candado de recálculo para periodos_facturacion
-- =====================================================================
-- Problema que resuelve:
--   El estado 'procesando' funcionaba como un candado sin dueño, sin
--   vencimiento y sin llave. Si la pestaña del navegador que lo tomaba
--   moría (F5, cierre, suspensión del equipo, corte de red), el período
--   quedaba trabado para siempre y el botón Recalcular se auto-bloqueaba.
--
--   Además, dos personas podían recalcular el mismo período a la vez y
--   corromperlo, porque el recálculo borra toda la facturación antes de
--   regenerarla.
--
-- Qué agrega:
--   - procesando_desde  : antigüedad del candado -> permite vencerlo (TTL 10 min)
--   - procesando_por    : quién lo tomó -> se muestra a quien espera
--   - lock_token        : llave de la ejecución -> evita que un proceso
--                         zombie libere o pise la corrida de otro
--   - procesando_actual : progreso compartido (conductor N)
--   - procesando_total  : progreso compartido (total de conductores)
--
-- Todas las columnas son NULLABLE y aditivas: el código anterior a este
-- cambio las ignora sin romperse.
--
-- Ejecutar como una sola transacción.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Columnas del candado (idempotente)
-- ---------------------------------------------------------------------
ALTER TABLE periodos_facturacion
  ADD COLUMN IF NOT EXISTS procesando_desde  timestamptz,
  ADD COLUMN IF NOT EXISTS procesando_por    text,
  ADD COLUMN IF NOT EXISTS lock_token        uuid,
  ADD COLUMN IF NOT EXISTS procesando_actual integer,
  ADD COLUMN IF NOT EXISTS procesando_total  integer;

COMMENT ON COLUMN periodos_facturacion.procesando_desde  IS 'Momento en que se tomó el candado de recálculo. Se refresca por heartbeat cada 10 conductores. Un candado con más de 10 minutos se considera huérfano.';
COMMENT ON COLUMN periodos_facturacion.procesando_por    IS 'Nombre del usuario que tomó el candado de recálculo.';
COMMENT ON COLUMN periodos_facturacion.lock_token        IS 'Llave de la ejecución en curso (fencing token). Toda liberación exige coincidencia para evitar que un proceso zombie pise a otro.';
COMMENT ON COLUMN periodos_facturacion.procesando_actual IS 'Progreso del recálculo: conductor en curso.';
COMMENT ON COLUMN periodos_facturacion.procesando_total  IS 'Progreso del recálculo: total de conductores a procesar.';

-- ---------------------------------------------------------------------
-- 2. Índice para buscar candados vencidos
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_periodos_facturacion_procesando
  ON periodos_facturacion (procesando_desde)
  WHERE estado = 'procesando';

-- ---------------------------------------------------------------------
-- 3. Liberar los candados huérfanos que ya existen
-- ---------------------------------------------------------------------
UPDATE periodos_facturacion
SET estado            = 'abierto',
    procesando_desde  = NULL,
    procesando_por    = NULL,
    lock_token        = NULL,
    procesando_actual = NULL,
    procesando_total  = NULL,
    updated_at        = now()
WHERE estado = 'procesando';

COMMIT;


-- =====================================================================
-- 4. Realtime (fuera de la transacción anterior)
-- =====================================================================
-- Necesario para que quien espera vea el progreso del otro en vivo y
-- para que su pantalla se destrabe sola al terminar el recálculo.
-- Si la publicación no existe en esta instancia self-hosted, este bloque
-- no falla: la app cae automáticamente a polling cada 5 segundos.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename  = 'periodos_facturacion'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.periodos_facturacion;
      RAISE NOTICE 'OK: periodos_facturacion agregada a supabase_realtime';
    ELSE
      RAISE NOTICE 'OK: periodos_facturacion ya estaba en supabase_realtime';
    END IF;
  ELSE
    RAISE NOTICE 'AVISO: no existe la publicación supabase_realtime; la app usará polling cada 5 s';
  END IF;

  -- Requerido para que los payloads de realtime traigan el registro completo
  ALTER TABLE public.periodos_facturacion REPLICA IDENTITY FULL;
  RAISE NOTICE 'OK: REPLICA IDENTITY FULL aplicada';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'AVISO: el rol actual no puede modificar la publicación (se necesita postgres/superuser).';
    RAISE NOTICE '       No es bloqueante: la app detecta que realtime no responde y usa polling cada 5 s.';
  WHEN OTHERS THEN
    RAISE NOTICE 'AVISO: no se pudo configurar realtime (%). La app usará polling cada 5 s.', SQLERRM;
END $$;


-- =====================================================================
-- VERIFICACIÓN (ejecutar después; deben dar los resultados indicados)
-- =====================================================================

-- 1) Deben aparecer las 5 columnas, todas nullable = YES
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'periodos_facturacion'
  AND column_name IN ('procesando_desde','procesando_por','lock_token',
                      'procesando_actual','procesando_total')
ORDER BY column_name;

-- 2) No debe quedar ningún período trabado (0 filas)
SELECT id, semana, anio, estado, procesando_por, procesando_desde
FROM periodos_facturacion
WHERE estado = 'procesando';

-- 3) Realtime: debe devolver 1 fila si quedó habilitado (0 = la app usa polling)
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename = 'periodos_facturacion';


-- =====================================================================
-- CONSULTA ÚTIL PARA EL DÍA A DÍA
-- =====================================================================
-- Ver candados activos y su antigüedad. Más de 10 minutos = huérfano
-- (la app lo libera sola, no hace falta correr nada a mano).
--
-- SELECT semana, anio, procesando_por,
--        round(EXTRACT(EPOCH FROM (now() - procesando_desde)) / 60) AS minutos,
--        procesando_actual || '/' || procesando_total AS progreso
-- FROM periodos_facturacion
-- WHERE estado = 'procesando'
-- ORDER BY procesando_desde;


-- =====================================================================
-- ROLLBACK (solo si hiciera falta revertir)
-- =====================================================================
-- ALTER PUBLICATION supabase_realtime DROP TABLE public.periodos_facturacion;
-- DROP INDEX IF EXISTS idx_periodos_facturacion_procesando;
-- ALTER TABLE periodos_facturacion
--   DROP COLUMN IF EXISTS procesando_desde,
--   DROP COLUMN IF EXISTS procesando_por,
--   DROP COLUMN IF EXISTS lock_token,
--   DROP COLUMN IF EXISTS procesando_actual,
--   DROP COLUMN IF EXISTS procesando_total;
