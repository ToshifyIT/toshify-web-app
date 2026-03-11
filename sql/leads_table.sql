-- SQL para crear tabla de Leads en Supabase
-- Ejecutar en el SQL Editor de Supabase
-- NOTA: Los nombres de columna usan comillas dobles para preservar
--       espacios, mayusculas y tildes tal como fueron definidos.

-- =====================================================
-- TABLA: leads
-- Almacena los leads/prospectos del sistema
-- =====================================================

CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "Nombre Completo" VARCHAR(200),
  "Apellido" VARCHAR(100),
  "Email" VARCHAR(255),
  "Phone" VARCHAR(50),
  "User ID" UUID,
  "Fecha creación" TIMESTAMPTZ DEFAULT NOW(),
  "Last seen" TIMESTAMPTZ,
  "Last contacted" TIMESTAMPTZ,
  "Last heard from" TIMESTAMPTZ,
  "Country" VARCHAR(100),
  "Region" VARCHAR(100),
  "City" VARCHAR(100),
  "Timezone" VARCHAR(100),
  "Sede" VARCHAR(100),
  "UTM Campaign" VARCHAR(255),
  "UTM Content" VARCHAR(255),
  "UTM Medium" VARCHAR(255),
  "UTM Source" VARCHAR(255),
  "UTM Term" VARCHAR(255),
  "WhatsApp number" VARCHAR(50),
  "Estado de Lead" VARCHAR(100),
  "Agente asignado" VARCHAR(200),
  "Entrevistador asignado" VARCHAR(200),
  "Patente" VARCHAR(20),
  "Turno" VARCHAR(50),
  "Compañero" VARCHAR(200),
  "Direccion" TEXT,
  "Tiempo de antiguedad" VARCHAR(100),
  "Tipo" VARCHAR(100),
  "DNI" VARCHAR(20),
  "Primer nombre" VARCHAR(100),
  "Ultima Actividad" TIMESTAMPTZ,
  "Especialista Onboarding" VARCHAR(200),
  "Edad" INTEGER,
  "Zona" VARCHAR(100),
  "Fuente de lead" VARCHAR(255),
  "Licencia" VARCHAR(100),
  "Monotributo" VARCHAR(100),
  "Experiencia previa" VARCHAR(255),
  "Acepta oferta" BOOLEAN,
  "Antecedentes penales" VARCHAR(100),
  "Administrativo Asignado" VARCHAR(200),
  "Dataentry Asignado" VARCHAR(200),
  "Agente logistico asignado" VARCHAR(200),
  "Fecha carga" TIMESTAMPTZ,
  "Fase de Preguntas" VARCHAR(100),
  "Asistente Virtual" VARCHAR(200),
  "Documentos pendientes" TEXT,
  "Cerrado timeout wpp" BOOLEAN DEFAULT false,
  "Guia asignado" VARCHAR(200),
  "Causal de cierre" VARCHAR(255),
  "Contacto de emergencia" VARCHAR(255),
  "Link facturacion" VARCHAR(500),
  "Ayuda Entrevista" VARCHAR(255),
  "Código Referido" VARCHAR(100),
  "Año de auto" VARCHAR(10),
  "Km de auto" VARCHAR(50),
  "Marca y modelo de vehículo" VARCHAR(200),

  -- Campos de sistema
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- INDICES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_leads_estado ON leads("Estado de Lead");
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads("Email");
CREATE INDEX IF NOT EXISTS idx_leads_dni ON leads("DNI");
CREATE INDEX IF NOT EXISTS idx_leads_agente ON leads("Agente asignado");
CREATE INDEX IF NOT EXISTS idx_leads_fecha_creacion ON leads("Fecha creación");
CREATE INDEX IF NOT EXISTS idx_leads_user_id ON leads("User ID");
CREATE INDEX IF NOT EXISTS idx_leads_sede ON leads("Sede");
CREATE INDEX IF NOT EXISTS idx_leads_fase ON leads("Fase de Preguntas");

-- =====================================================
-- TRIGGER: updated_at automatico
-- =====================================================

CREATE OR REPLACE FUNCTION update_leads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS leads_updated_at ON leads;
CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW
  EXECUTE FUNCTION update_leads_updated_at();

-- =====================================================
-- RLS (Row Level Security) Policies
-- =====================================================

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leads_select" ON leads;
CREATE POLICY "leads_select" ON leads
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "leads_insert" ON leads;
CREATE POLICY "leads_insert" ON leads
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "leads_update" ON leads;
CREATE POLICY "leads_update" ON leads
  FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "leads_delete" ON leads;
CREATE POLICY "leads_delete" ON leads
  FOR DELETE TO authenticated USING (true);
