-- ============================================
-- Agregar campo drive_folder_url a conductores
-- Para acceso directo a la carpeta de Google Drive
-- ============================================

-- 1. Agregar columna para la URL de carpeta de Drive
ALTER TABLE public.conductores
ADD COLUMN IF NOT EXISTS drive_folder_url TEXT;

-- 2. Comentario descriptivo
COMMENT ON COLUMN public.conductores.drive_folder_url IS
'URL directa a la carpeta en Google Drive para acceso rápido';
