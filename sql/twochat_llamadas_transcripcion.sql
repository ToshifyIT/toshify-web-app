-- =====================================================
-- 2Chat › Control de llamadas: transcripción, buzón de voz y calidad con Gemini (2026-11-17)
-- =====================================================
-- Correr DESPUÉS de sql/twochat_llamadas.sql. Idempotente.
-- 2Chat no transcribe ni distingue el buzón de voz (el operador "atiende" y la
-- marca como atendida). El servidor (server-2chat.js) le pasa a Gemini Flash-Lite
-- (GEMINI_API_KEY) cada llamada atendida con grabación y guarda acá lo que devuelve.

ALTER TABLE twochat_llamadas ADD COLUMN IF NOT EXISTS transcripcion TEXT;
ALTER TABLE twochat_llamadas ADD COLUMN IF NOT EXISTS resumen TEXT;

-- Qué pasó realmente: conversacion · buzon_de_voz · sin_conversacion (cortó, silencio, número equivocado)
ALTER TABLE twochat_llamadas ADD COLUMN IF NOT EXISTS tipo_atencion TEXT
  CHECK (tipo_atencion IN ('conversacion', 'buzon_de_voz', 'sin_conversacion'));

-- Calidad (solo conversaciones): nota general 1 a 5 y el detalle por criterio
-- { presentacion, indagacion, claridad, objeciones, cierre, motivo } (criterios 1 a 5, null si no aplica)
ALTER TABLE twochat_llamadas ADD COLUMN IF NOT EXISTS calificacion SMALLINT
  CHECK (calificacion BETWEEN 1 AND 5);
ALTER TABLE twochat_llamadas ADD COLUMN IF NOT EXISTS calificacion_detalle JSONB;

-- Cómo terminó: interesado · agendado · volver_a_llamar · no_interesado · informativa · otro
ALTER TABLE twochat_llamadas ADD COLUMN IF NOT EXISTS resultado_conversacion TEXT;
ALTER TABLE twochat_llamadas ADD COLUMN IF NOT EXISTS proximo_paso TEXT;

-- Control del proceso. null = pendiente · 'ok' · 'error' (se reintenta hasta 3 veces)
ALTER TABLE twochat_llamadas ADD COLUMN IF NOT EXISTS transcripcion_estado TEXT
  CHECK (transcripcion_estado IN ('ok', 'error'));
ALTER TABLE twochat_llamadas ADD COLUMN IF NOT EXISTS transcripcion_intentos SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE twochat_llamadas ADD COLUMN IF NOT EXISTS transcripcion_en TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS twochat_llamadas_transcripcion_pend_idx
  ON twochat_llamadas (fecha DESC)
  WHERE transcripcion_estado IS DISTINCT FROM 'ok' AND resultado = 'atendida' AND grabacion IS NOT NULL;

-- Para revisar:
-- SELECT tipo_atencion, count(*), round(avg(calificacion), 2) FROM twochat_llamadas GROUP BY 1;
