-- sql/rendimiento_agentes_quitar.sql
-- Quita el submenú Reportes > "Rendimiento de agentes" (2026-11-05): el módulo se
-- sacó de la app (lo reemplaza Reportes > Control de gestores). Los permisos del
-- submenú se borran con él. Se puede correr más de una vez.
--
-- El código quedó en el historial de git (commit 7a4e117a) por si se quiere volver.

DELETE FROM role_submenu_permissions
WHERE submenu_id IN (SELECT id FROM submenus WHERE name = 'rendimiento-agentes');

DO $$
BEGIN
  IF to_regclass('public.user_submenu_permissions') IS NOT NULL THEN
    DELETE FROM user_submenu_permissions
    WHERE submenu_id IN (SELECT id FROM submenus WHERE name = 'rendimiento-agentes');
  END IF;
END $$;

DELETE FROM submenus WHERE name = 'rendimiento-agentes';

-- Comprobar (no debe devolver filas)
SELECT id, name FROM submenus WHERE name = 'rendimiento-agentes';
