-- Tabla para almacenar documentos generados desde el wizard de Programación
-- Cada registro representa un documento (.docx y .pdf) generado para un conductor

CREATE TABLE IF NOT EXISTS documentos_generados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  programacion_id UUID REFERENCES programaciones_onboarding(id) ON DELETE SET NULL,
  conductor_id UUID REFERENCES conductores(id) ON DELETE SET NULL,
  tipo_documento TEXT NOT NULL,          -- 'carta_oferta' | 'anexo'
  plantilla_usada TEXT NOT NULL,         -- 'cartaOfertaTurno', 'actualizacionTurno', etc.
  turno TEXT,                            -- 'diurno' | 'nocturno' | null (para a_cargo)
  url_docx TEXT,
  url_pdf TEXT,
  drive_folder_url TEXT,
  drive_folder_id TEXT,
  estado TEXT NOT NULL DEFAULT 'generado', -- 'generado' | 'error' | 'eliminado'
  error_detalle TEXT,
  sede_id UUID,
  created_by UUID,
  created_by_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_documentos_generados_programacion
  ON documentos_generados(programacion_id);
CREATE INDEX IF NOT EXISTS idx_documentos_generados_conductor
  ON documentos_generados(conductor_id);
CREATE INDEX IF NOT EXISTS idx_documentos_generados_created
  ON documentos_generados(created_at DESC);

-- RLS
ALTER TABLE documentos_generados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "documentos_generados_select" ON documentos_generados
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "documentos_generados_insert" ON documentos_generados
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "documentos_generados_update" ON documentos_generados
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
