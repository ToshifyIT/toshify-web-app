-- Homologación de campos Leads -> Conductores
-- Agrega en conductores las columnas que hoy existen en leads y faltan en conductores,
-- para poder visualizarlas y que se copien al convertir un lead en conductor.
-- NO borra ni modifica datos existentes. Idempotente (IF NOT EXISTS).

-- Dirección de contacto de emergencia (leads.direccion_emergencia)
ALTER TABLE public.conductores
  ADD COLUMN IF NOT EXISTS direccion_emergencia text;

-- Experiencia previa del conductor (leads.experiencia_previa)
ALTER TABLE public.conductores
  ADD COLUMN IF NOT EXISTS experiencia_previa text;

-- Nota: parentesco_emergencia y url_documentacion ya existen en conductores,
-- por eso no se agregan acá.
