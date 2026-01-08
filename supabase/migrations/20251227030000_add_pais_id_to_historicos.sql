-- ============================================
-- MIGRACIÓN: Agregar pais_id a tablas de históricos
-- Fecha: 2024-12-27
-- Descripción: Agrega pais_id a tablas grandes (cabify, uss, wialon)
-- NOTA: Esta migración puede tardar varios minutos por el volumen de datos
-- ============================================

DO $$
DECLARE
  arg_pais_id UUID;
  batch_size INT := 50000;
  affected_rows INT;
BEGIN
  -- Obtener ID de Argentina
  SELECT id INTO arg_pais_id FROM paises WHERE codigo = 'ARG';

  -- ==========================================
  -- CABIFY_HISTORICO (~17K filas)
  -- ==========================================
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cabify_historico' AND column_name = 'pais_id') THEN
    ALTER TABLE cabify_historico ADD COLUMN pais_id UUID REFERENCES paises(id);
    UPDATE cabify_historico SET pais_id = arg_pais_id WHERE pais_id IS NULL;
    RAISE NOTICE 'cabify_historico actualizado';
  END IF;

  -- ==========================================
  -- CABIFY_SYNC_LOG
  -- ==========================================
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cabify_sync_log' AND column_name = 'pais_id') THEN
    ALTER TABLE cabify_sync_log ADD COLUMN pais_id UUID REFERENCES paises(id);
    UPDATE cabify_sync_log SET pais_id = arg_pais_id WHERE pais_id IS NULL;
  END IF;

  -- ==========================================
  -- CABIFY_SYNC_STATUS
  -- ==========================================
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cabify_sync_status' AND column_name = 'pais_id') THEN
    ALTER TABLE cabify_sync_status ADD COLUMN pais_id UUID REFERENCES paises(id);
    UPDATE cabify_sync_status SET pais_id = arg_pais_id WHERE pais_id IS NULL;
  END IF;

  -- ==========================================
  -- WIALON_BITACORA (~1.5K filas)
  -- ==========================================
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wialon_bitacora' AND column_name = 'pais_id') THEN
    ALTER TABLE wialon_bitacora ADD COLUMN pais_id UUID REFERENCES paises(id);
    UPDATE wialon_bitacora SET pais_id = arg_pais_id WHERE pais_id IS NULL;
  END IF;

  -- ==========================================
  -- WIALON_BITACORA_SYNC_LOG
  -- ==========================================
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wialon_bitacora_sync_log' AND column_name = 'pais_id') THEN
    ALTER TABLE wialon_bitacora_sync_log ADD COLUMN pais_id UUID REFERENCES paises(id);
    UPDATE wialon_bitacora_sync_log SET pais_id = arg_pais_id WHERE pais_id IS NULL;
  END IF;

  -- ==========================================
  -- USS_SYNC_LOG
  -- ==========================================
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'uss_sync_log' AND column_name = 'pais_id') THEN
    ALTER TABLE uss_sync_log ADD COLUMN pais_id UUID REFERENCES paises(id);
    UPDATE uss_sync_log SET pais_id = arg_pais_id WHERE pais_id IS NULL;
  END IF;

  -- ==========================================
  -- USS_SYNC_STATUS
  -- ==========================================
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'uss_sync_status' AND column_name = 'pais_id') THEN
    ALTER TABLE uss_sync_status ADD COLUMN pais_id UUID REFERENCES paises(id);
    UPDATE uss_sync_status SET pais_id = arg_pais_id WHERE pais_id IS NULL;
  END IF;

  -- ==========================================
  -- USS_HISTORICO (~237K filas) - UPDATE EN BATCHES
  -- ==========================================
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'uss_historico' AND column_name = 'pais_id') THEN
    ALTER TABLE uss_historico ADD COLUMN pais_id UUID REFERENCES paises(id);

    LOOP
      UPDATE uss_historico
      SET pais_id = arg_pais_id
      WHERE id IN (
        SELECT id FROM uss_historico WHERE pais_id IS NULL LIMIT batch_size
      );

      GET DIAGNOSTICS affected_rows = ROW_COUNT;
      RAISE NOTICE 'uss_historico: % filas actualizadas', affected_rows;

      EXIT WHEN affected_rows < batch_size;
    END LOOP;
  END IF;

  -- ==========================================
  -- USS_EXCESOS_VELOCIDAD (~462K filas) - UPDATE EN BATCHES
  -- ==========================================
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'uss_excesos_velocidad' AND column_name = 'pais_id') THEN
    ALTER TABLE uss_excesos_velocidad ADD COLUMN pais_id UUID REFERENCES paises(id);

    LOOP
      UPDATE uss_excesos_velocidad
      SET pais_id = arg_pais_id
      WHERE id IN (
        SELECT id FROM uss_excesos_velocidad WHERE pais_id IS NULL LIMIT batch_size
      );

      GET DIAGNOSTICS affected_rows = ROW_COUNT;
      RAISE NOTICE 'uss_excesos_velocidad: % filas actualizadas', affected_rows;

      EXIT WHEN affected_rows < batch_size;
    END LOOP;
  END IF;

END $$;

-- ==========================================
-- ÍNDICES PARA HISTÓRICOS (críticos para performance)
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_cabify_historico_pais ON cabify_historico(pais_id);
CREATE INDEX IF NOT EXISTS idx_cabify_historico_pais_fecha ON cabify_historico(pais_id, fecha_inicio);

CREATE INDEX IF NOT EXISTS idx_uss_historico_pais ON uss_historico(pais_id);

CREATE INDEX IF NOT EXISTS idx_uss_excesos_pais ON uss_excesos_velocidad(pais_id);
CREATE INDEX IF NOT EXISTS idx_uss_excesos_pais_fecha ON uss_excesos_velocidad(pais_id, fecha_evento);

CREATE INDEX IF NOT EXISTS idx_wialon_bitacora_pais ON wialon_bitacora(pais_id);
CREATE INDEX IF NOT EXISTS idx_wialon_bitacora_pais_fecha ON wialon_bitacora(pais_id, fecha_turno);

COMMENT ON COLUMN cabify_historico.pais_id IS 'País de la operación Cabify';
COMMENT ON COLUMN uss_historico.pais_id IS 'País del registro USS';
COMMENT ON COLUMN uss_excesos_velocidad.pais_id IS 'País del evento de exceso';
COMMENT ON COLUMN wialon_bitacora.pais_id IS 'País del registro Wialon';
