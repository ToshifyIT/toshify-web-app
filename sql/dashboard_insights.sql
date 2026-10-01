-- =====================================================
-- Tabla: dashboard_insights
-- Guarda el análisis con IA ("Dónde actuar") del Dashboard Directivo para no
-- volver a llamar al modelo en cada apertura: como máximo una generación por
-- semana, sede y período. La escribe y la lee SOLO el servidor de Toshibase
-- (server-insights-directivo.js, ruta /api/insights-directivo) con la
-- service role key.
--
-- RLS activado y sin políticas: ningún usuario accede directo desde el
-- frontend. No modifica ninguna tabla existente.
--
-- Para quitarla:
--   DROP TABLE IF EXISTS dashboard_insights;
-- =====================================================

CREATE TABLE IF NOT EXISTS public.dashboard_insights (
  sede_key text NOT NULL,          -- id de sede o 'todas'
  desde date NOT NULL,
  hasta date NOT NULL,
  semana date NOT NULL,            -- lunes de la semana en que se generó
  insights jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [] = intento fallido (se reintenta a las 6 h)
  modelo text,
  motivo text,                     -- motivo del fallo, si lo hubo
  generado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dashboard_insights_pkey PRIMARY KEY (sede_key, desde, hasta, semana)
);

ALTER TABLE public.dashboard_insights ENABLE ROW LEVEL SECURITY;
