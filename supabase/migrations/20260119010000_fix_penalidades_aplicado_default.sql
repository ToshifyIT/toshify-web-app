-- Fix: Asegurar que penalidades.aplicado tenga default FALSE
-- y corregir penalidades que fueron creadas desde incidencias pero quedaron como aplicado=true

-- 1. Asegurar el default correcto
ALTER TABLE penalidades ALTER COLUMN aplicado SET DEFAULT false;

-- 2. Corregir penalidades que:
--    - Tienen incidencia_id (fueron creadas desde el botón $)
--    - Tienen aplicado = true
--    - NO tienen fecha_aplicacion (nunca fueron realmente aplicadas en facturación)
--    - NO tienen semana_aplicacion (nunca fueron asignadas a un período)
UPDATE penalidades
SET aplicado = false
WHERE incidencia_id IS NOT NULL
  AND aplicado = true
  AND fecha_aplicacion IS NULL
  AND semana_aplicacion IS NULL;

-- Comentario para tracking
COMMENT ON COLUMN penalidades.aplicado IS 'false = pendiente de aplicar en facturación, true = ya aplicado a un período';
