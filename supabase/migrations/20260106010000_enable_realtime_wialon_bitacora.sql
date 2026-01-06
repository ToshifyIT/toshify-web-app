-- ============================================
-- MIGRACIÓN: Habilitar Realtime para wialon_bitacora
-- Fecha: 2026-01-06
-- Descripción: Agrega la tabla wialon_bitacora a la publicación de realtime
--              para que las suscripciones en el frontend funcionen correctamente
-- ============================================

-- Habilitar realtime para wialon_bitacora (si no está habilitado)
DO $$
BEGIN
  -- Verificar si la tabla ya está en la publicación
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND tablename = 'wialon_bitacora'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE wialon_bitacora;
    RAISE NOTICE 'wialon_bitacora agregada a supabase_realtime';
  ELSE
    RAISE NOTICE 'wialon_bitacora ya está en supabase_realtime';
  END IF;
END $$;

-- También habilitar para wialon_bitacora_sync_log (para mostrar estado de sync)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND tablename = 'wialon_bitacora_sync_log'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE wialon_bitacora_sync_log;
    RAISE NOTICE 'wialon_bitacora_sync_log agregada a supabase_realtime';
  ELSE
    RAISE NOTICE 'wialon_bitacora_sync_log ya está en supabase_realtime';
  END IF;
END $$;
