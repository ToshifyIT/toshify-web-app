-- ============================================
-- Agregar campo drive_folder_id a conductores
-- Para almacenar el ID de la carpeta de Google Drive
-- ============================================

-- 1. Agregar columna para el ID de carpeta de Drive
ALTER TABLE public.conductores
ADD COLUMN IF NOT EXISTS drive_folder_id VARCHAR(255);

-- 2. Comentario descriptivo
COMMENT ON COLUMN public.conductores.drive_folder_id IS
'ID de la carpeta en Google Drive donde se almacenan los documentos del conductor';

-- 3. Crear índice para búsquedas
CREATE INDEX IF NOT EXISTS idx_conductores_drive_folder
ON public.conductores(drive_folder_id)
WHERE drive_folder_id IS NOT NULL;
