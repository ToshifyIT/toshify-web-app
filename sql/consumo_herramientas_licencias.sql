-- =====================================================
-- Consumo herramientas: cantidad de licencias por herramienta (2026-11-17)
-- =====================================================
-- Correr DESPUÉS de sql/consumo_herramientas.sql. Idempotente.
-- licencias: cuántos usuarios / licencias / agentes se pagan hoy.
-- licencias_incluidas: cuántas trae el plan (para ver si se pagan extras).

ALTER TABLE herramientas ADD COLUMN IF NOT EXISTS licencias INTEGER CHECK (licencias >= 0);
ALTER TABLE herramientas ADD COLUMN IF NOT EXISTS licencias_incluidas INTEGER CHECK (licencias_incluidas >= 0);

-- Valores relevados en cada plataforma el 17/11/2026
UPDATE herramientas SET licencias = 12 WHERE nombre = 'Slack' AND licencias IS NULL;              -- 12 usuarios pagos (plan Pro)
UPDATE herramientas SET licencias = 15 WHERE nombre = 'Google Workspace' AND licencias IS NULL;   -- 15 licencias Business Standard (plan flexible)
UPDATE herramientas SET licencias = 1 WHERE nombre = 'DocuSeal' AND licencias IS NULL;            -- 1 usuario (Josué Caride)
UPDATE herramientas SET licencias = 4, licencias_incluidas = 3
  WHERE nombre = '2Chat' AND licencias IS NULL;                                                  -- 3 activos + 1 invitación pendiente; el plan incluye 3

-- Para revisar:
-- SELECT nombre, licencias, licencias_incluidas FROM herramientas ORDER BY nombre;
