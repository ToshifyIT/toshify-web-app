-- ============================================
-- Agregar campo drive_folder_id a vehiculos
-- Para almacenar el ID de la carpeta de Google Drive
-- ============================================

-- 1. Agregar columna para el ID de carpeta de Drive
ALTER TABLE public.vehiculos
ADD COLUMN IF NOT EXISTS drive_folder_id VARCHAR(255);

-- 2. Agregar columna para la URL de la carpeta de Drive
ALTER TABLE public.vehiculos
ADD COLUMN IF NOT EXISTS drive_folder_url TEXT;

-- 3. Comentarios descriptivos
COMMENT ON COLUMN public.vehiculos.drive_folder_id IS
'ID de la carpeta en Google Drive donde se almacenan los documentos del vehículo';

COMMENT ON COLUMN public.vehiculos.drive_folder_url IS
'URL directa a la carpeta en Google Drive para acceso rápido';

-- 4. Crear índice para búsquedas
CREATE INDEX IF NOT EXISTS idx_vehiculos_drive_folder
ON public.vehiculos(drive_folder_id)
WHERE drive_folder_id IS NOT NULL;
