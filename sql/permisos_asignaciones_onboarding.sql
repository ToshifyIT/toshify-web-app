-- Quita el permiso de ELIMINAR en Asignaciones al rol onboarding (y a los usuarios
-- onboarding que lo tengan como excepción). Desde el cambio de ITCODE-427 ese permiso
-- habilita crear asignaciones manuales, regularizar y borrar.
-- Correr en el SQL Editor de Supabase. Se puede correr más de una vez.

-- Rol onboarding: menú y submenú "asignaciones"
UPDATE role_submenu_permissions rsp
SET can_delete = false
FROM roles r, submenus s
WHERE rsp.role_id = r.id AND rsp.submenu_id = s.id
  AND r.name = 'onboarding' AND s.name = 'asignaciones' AND rsp.can_delete;

UPDATE role_menu_permissions rmp
SET can_delete = false
FROM roles r, menus m
WHERE rmp.role_id = r.id AND rmp.menu_id = m.id
  AND r.name = 'onboarding' AND m.name = 'asignaciones' AND rmp.can_delete;

-- Excepciones por usuario (si las hay) de usuarios con rol onboarding
UPDATE user_submenu_permissions usp
SET can_delete = false
FROM user_profiles up, roles r, submenus s
WHERE usp.user_id = up.id AND up.role_id = r.id AND usp.submenu_id = s.id
  AND r.name = 'onboarding' AND s.name = 'asignaciones' AND usp.can_delete;

UPDATE user_menu_permissions ump
SET can_delete = false
FROM user_profiles up, roles r, menus m
WHERE ump.user_id = up.id AND up.role_id = r.id AND ump.menu_id = m.id
  AND r.name = 'onboarding' AND m.name = 'asignaciones' AND ump.can_delete;

-- Comprobación: no tiene que devolver ningún usuario onboarding
SELECT up.email, r.name AS rol, p.menu_name, p.can_delete
FROM user_profiles up
JOIN roles r ON r.id = up.role_id
CROSS JOIN LATERAL get_user_permissions(up.id) p
WHERE p.menu_name = 'asignaciones' AND p.can_delete AND r.name = 'onboarding';
