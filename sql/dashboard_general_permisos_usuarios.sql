-- =====================================================
-- Dashboard General: permiso de ver para usuarios puntuales
-- =====================================================
-- Ventas, logística, administración logística, siniestros y administración de
-- facturación: Karen, Carla, Ali, Eunice, Gandhy, Erik, Eugenia, Sara y Josué.
-- Se busca por el primer nombre, activos. Correr primero el paso 1 y revisar la
-- lista: si sale alguien de más (o falta alguien), ajustar el paso 2.

-- 1. Revisar a quiénes encuentra
SELECT u.id, u.full_name, u.email, r.name AS rol
FROM user_profiles u
LEFT JOIN roles r ON r.id = u.role_id
WHERE u.is_active IS DISTINCT FROM false
  AND lower(translate(split_part(btrim(u.full_name), ' ', 1), 'áéíóú', 'aeiou'))
      IN ('karen', 'carla', 'ali', 'eunice', 'gandhy', 'erik', 'eugenia', 'sara', 'josue')
ORDER BY u.full_name;

-- 2. Darles permiso de ver Dashboard General
INSERT INTO user_submenu_permissions (user_id, submenu_id, can_view, can_create, can_edit, can_delete)
SELECT u.id, s.id, true, false, false, false
FROM user_profiles u
CROSS JOIN (SELECT id FROM submenus WHERE name = 'dashboard-general') s
WHERE u.is_active IS DISTINCT FROM false
  AND lower(translate(split_part(btrim(u.full_name), ' ', 1), 'áéíóú', 'aeiou'))
      IN ('karen', 'carla', 'ali', 'eunice', 'gandhy', 'erik', 'eugenia', 'sara', 'josue')
ON CONFLICT (user_id, submenu_id) DO UPDATE SET can_view = true;

-- 3. Comprobar
SELECT u.full_name, u.email, p.can_view
FROM user_submenu_permissions p
JOIN user_profiles u ON u.id = p.user_id
JOIN submenus s ON s.id = p.submenu_id
WHERE s.name = 'dashboard-general'
ORDER BY u.full_name;
