-- =====================================================
-- Integraciones: menú reorganizado (2026-11-27)
-- =====================================================
--   Integraciones
--     ├ GPS            (antes "Integraciones GPS"; mismos submenús)
--     ├ APP Viajes     (grupo nuevo: solo abre/cierra)
--     │   ├ Cabify     (antes "Integración Cabify")  /integraciones/cabify
--     │   └ DiDi       (antes "Integración DiDi")    /integraciones/didi
--     └ 2Chat          (sin cambios)
--   (los demás que haya en Integraciones, como Cresium o Alegra, quedan después)
--
-- Solo cambia textos (label), orden y jerarquía. Los names (clave de permisos de
-- los ProtectedRoute) y las rutas de Cabify y DiDi no cambian: nadie pierde acceso.
-- El grupo "APP Viajes" no necesita permiso propio: el menú muestra el grupo
-- contenedor de los submenús que el rol sí puede ver (PermissionsContext).
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.

BEGIN;

DO $$
DECLARE
  v_menu_id uuid;
  v_gps_id uuid;
  v_grupo_id uuid;
  v_cabify_id uuid;
  v_didi_id uuid;
  v_twochat_id uuid;
BEGIN
  SELECT id INTO v_menu_id FROM menus WHERE name = 'integraciones' LIMIT 1;
  IF v_menu_id IS NULL THEN
    RAISE EXCEPTION 'No existe el menú integraciones.';
  END IF;

  -- GPS = el grupo que contiene a Control exceso de velocidad
  SELECT parent_id INTO v_gps_id FROM submenus WHERE name = 'ctrl-exceso-vel' LIMIT 1;
  SELECT id INTO v_cabify_id FROM submenus WHERE name = 'cabify' LIMIT 1;
  SELECT id INTO v_didi_id FROM submenus WHERE name = 'didi' LIMIT 1;
  SELECT id INTO v_twochat_id FROM submenus WHERE name = 'twochat' LIMIT 1;
  IF v_gps_id IS NULL OR v_cabify_id IS NULL OR v_didi_id IS NULL THEN
    RAISE EXCEPTION 'Falta el grupo GPS o el submenú cabify o didi.';
  END IF;

  -- Grupo "APP Viajes" (su ruta redirige a Cabify en HomePage.tsx)
  SELECT id INTO v_grupo_id FROM submenus WHERE name = 'app-viajes' LIMIT 1;
  IF v_grupo_id IS NULL THEN
    INSERT INTO submenus (name, label, route, menu_id, parent_id, level, order_index, is_active)
    VALUES ('app-viajes', 'APP Viajes', '/integraciones/app-viajes', v_menu_id, NULL, 1, 2, true)
    RETURNING id INTO v_grupo_id;
  ELSE
    UPDATE submenus
    SET label = 'APP Viajes', route = '/integraciones/app-viajes', menu_id = v_menu_id,
        parent_id = NULL, level = 1, is_active = true
    WHERE id = v_grupo_id;
  END IF;

  -- Cabify y DiDi pasan dentro de APP Viajes
  UPDATE submenus
  SET label = 'Cabify', menu_id = v_menu_id, parent_id = v_grupo_id, level = 2, order_index = 1
  WHERE id = v_cabify_id;
  UPDATE submenus
  SET label = 'DiDi', menu_id = v_menu_id, parent_id = v_grupo_id, level = 2, order_index = 2
  WHERE id = v_didi_id;

  -- GPS: solo el texto
  UPDATE submenus SET label = 'GPS' WHERE id = v_gps_id;

  -- Orden del primer nivel: GPS, APP Viajes, 2Chat y luego el resto en su orden actual
  UPDATE submenus SET order_index = 1 WHERE id = v_gps_id;
  UPDATE submenus SET order_index = 2 WHERE id = v_grupo_id;
  IF v_twochat_id IS NOT NULL THEN
    UPDATE submenus SET order_index = 3 WHERE id = v_twochat_id;
  END IF;
  WITH resto AS (
    SELECT id, row_number() OVER (ORDER BY order_index, label) AS n
    FROM submenus
    WHERE menu_id = v_menu_id AND parent_id IS NULL
      AND id NOT IN (v_gps_id, v_grupo_id, COALESCE(v_twochat_id, v_gps_id))
  )
  UPDATE submenus s SET order_index = 3 + r.n FROM resto r WHERE r.id = s.id;
END $$;

COMMIT;

-- Comprobar
SELECT COALESCE(p.label, '—') AS grupo, s.label, s.name, s.route, s.level, s.order_index
FROM submenus s
JOIN menus m ON m.id = s.menu_id
LEFT JOIN submenus p ON p.id = s.parent_id
WHERE m.name = 'integraciones' AND s.is_active
ORDER BY COALESCE(p.order_index, s.order_index), s.parent_id NULLS FIRST, s.order_index;

-- Volver atrás (Cabify y DiDi al primer nivel con sus nombres anteriores):
-- UPDATE submenus SET label = 'Integraciones GPS'
--   WHERE id = (SELECT parent_id FROM submenus WHERE name = 'ctrl-exceso-vel' LIMIT 1);
-- UPDATE submenus SET label = 'Integración Cabify', parent_id = NULL, level = 1, order_index = 2 WHERE name = 'cabify';
-- UPDATE submenus SET label = 'Integración DiDi', parent_id = NULL, level = 1, order_index = 4 WHERE name = 'didi';
-- UPDATE submenus SET order_index = 3 WHERE name = 'twochat';
-- UPDATE submenus SET is_active = false WHERE name = 'app-viajes';
