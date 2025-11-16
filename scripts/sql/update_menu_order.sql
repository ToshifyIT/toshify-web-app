-- Script para actualizar el orden de los menús
-- Fecha: 2025-11-16
-- Descripción: Reorganiza los menús principales según el nuevo orden establecido

-- Actualizar orden de menús principales
UPDATE menus SET order_index = 0, updated_at = NOW() WHERE name = 'asignaciones';
UPDATE menus SET order_index = 1, updated_at = NOW() WHERE name = 'conductores';
UPDATE menus SET order_index = 2, updated_at = NOW() WHERE name = 'vehiculos';
UPDATE menus SET order_index = 3, updated_at = NOW() WHERE name = 'incidencias';
UPDATE menus SET order_index = 4, updated_at = NOW() WHERE name = 'siniestros';
UPDATE menus SET order_index = 5, updated_at = NOW() WHERE name = 'reportes';
UPDATE menus SET order_index = 6, updated_at = NOW() WHERE name = 'integraciones';
UPDATE menus SET order_index = 7, updated_at = NOW() WHERE name = 'administracion';

-- Verificar los cambios
SELECT name, label, order_index
FROM menus
ORDER BY order_index;
