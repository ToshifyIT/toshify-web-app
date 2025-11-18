-- Corregir la ruta del submenú "Menú por Usuario"

UPDATE submenus
SET route = '/administracion/menu-por-usuario'
WHERE name = 'menu-por-usuario';

-- Verificar el cambio
SELECT id, name, label, route, is_active
FROM submenus
WHERE name = 'menu-por-usuario';
