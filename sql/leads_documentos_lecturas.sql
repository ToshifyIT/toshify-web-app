-- =====================================================
-- Bot documentos de leads: control de lectura de archivos
-- =====================================================
-- Una fila por archivo de Drive (carpetas de Sellium Docs) que el bot ya leyó.
-- El bot (scripts/leads-documentos/leer-documentos.ts, en el servidor) la usa para
-- no volver a leer, ni pagar a Gemini, lo que ya leyó: un archivo se vuelve a leer
-- solo si cambió en Drive, si falló o si quedó pospuesto por el presupuesto.
--
-- fuente:
--   'python'    leído con Python (sin costo)
--   'gemini'    leído con Gemini (tokens_* y costo_usd de esa lectura)
--   'repetido'  copia de un documento que otro archivo ya leyó bien: no se mandó a Gemini
--   'pospuesto' Python no pudo y no había presupuesto de Gemini: se lee otro día
--   'error'     la lectura falló: se reintenta en la próxima corrida
--   'anterior'  leído antes de existir esta tabla (no se sabe si con Python o Gemini)
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.

BEGIN;

CREATE TABLE IF NOT EXISTS leads_documentos_lecturas (
  -- id del archivo en Google Drive
  archivo_id TEXT PRIMARY KEY,
  carpeta_id TEXT NOT NULL,
  carpeta_nombre TEXT,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  nombre TEXT NOT NULL,
  -- modifiedTime de Drive tal cual (si cambia, el archivo se vuelve a leer)
  drive_modificado TEXT NOT NULL,
  fuente TEXT NOT NULL CHECK (fuente IN ('python', 'gemini', 'repetido', 'pospuesto', 'error', 'anterior')),
  -- dni_frente, licencia_dorso, antecedentes, certificado_domicilio, otro...
  tipo TEXT,
  -- Datos extraídos del documento
  resultado JSONB,
  error TEXT,
  -- Tipo de documento del que es copia (fuente 'repetido')
  repetido_de TEXT,
  -- Día en que se pospuso (fuente 'pospuesto')
  pospuesto_dia DATE,
  -- Gasto de la última lectura con Gemini (la salida incluye el razonamiento)
  tokens_entrada INTEGER NOT NULL DEFAULT 0,
  tokens_salida INTEGER NOT NULL DEFAULT 0,
  costo_usd NUMERIC(12, 6) NOT NULL DEFAULT 0,
  leido_en TIMESTAMPTZ,
  -- Corridas de prueba (carpeta "Sellium Docs PRUEBAS")
  prueba BOOLEAN NOT NULL DEFAULT false,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_documentos_lecturas_carpeta ON leads_documentos_lecturas(carpeta_id);
CREATE INDEX IF NOT EXISTS idx_leads_documentos_lecturas_lead ON leads_documentos_lecturas(lead_id);
CREATE INDEX IF NOT EXISTS idx_leads_documentos_lecturas_fuente_fecha ON leads_documentos_lecturas(fuente, leido_en DESC);

ALTER TABLE leads_documentos_lecturas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leads_documentos_lecturas_select_autenticados" ON leads_documentos_lecturas;
CREATE POLICY "leads_documentos_lecturas_select_autenticados"
  ON leads_documentos_lecturas FOR SELECT
  TO authenticated
  USING (true);

-- Sin políticas de escritura: solo la service role (el bot) escribe.

COMMIT;

-- Que la API de Supabase (PostgREST) vea la tabla nueva sin reiniciar
NOTIFY pgrst, 'reload schema';
