-- =====================================================
-- Integraciones > 2Chat como grupo con dos submenús
-- =====================================================
--   Integraciones
--     └ 2Chat                    (grupo: solo abre/cierra, no navega)
--         ├ Control de llamadas  /integraciones/2chat/llamadas
--         └ Contactos            /integraciones/2chat/contactos
--
-- Usa el submenú 'twochat' que creó sql/twochat_integracion.sql como grupo y
-- le cuelga los dos hijos. Los names DEBEN coincidir con el submenuName de los
-- ProtectedRoute en HomePage.tsx ('twochat-llamadas' y 'twochat-contactos').
--
-- Al crearlos solo los ven los admin; para otros roles darles permiso desde
-- Administración > Menú por rol.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.

BEGIN;

DO $$
DECLARE
  v_padre_id uuid;
  v_menu_id uuid;
  v_level integer;
  v_hijo_id uuid;
BEGIN
  SELECT id, menu_id, COALESCE(level, 1)
  INTO v_padre_id, v_menu_id, v_level
  FROM submenus
  WHERE name = 'twochat'
  LIMIT 1;

  IF v_padre_id IS NULL THEN
    RAISE EXCEPTION 'No existe el submenú twochat. Correr antes sql/twochat_integracion.sql.';
  END IF;

  -- El grupo mantiene su ruta base (redirige a Control de llamadas)
  UPDATE submenus
  SET label = '2Chat', route = '/integraciones/2chat', is_active = true
  WHERE id = v_padre_id;

  -- Control de llamadas
  SELECT id INTO v_hijo_id FROM submenus WHERE name = 'twochat-llamadas' LIMIT 1;
  IF v_hijo_id IS NULL THEN
    INSERT INTO submenus (name, label, route, menu_id, parent_id, level, order_index, is_active)
    VALUES ('twochat-llamadas', 'Control de llamadas', '/integraciones/2chat/llamadas',
            v_menu_id, v_padre_id, v_level + 1, 1, true);
  ELSE
    UPDATE submenus
    SET label = 'Control de llamadas', route = '/integraciones/2chat/llamadas',
        menu_id = v_menu_id, parent_id = v_padre_id, level = v_level + 1,
        order_index = 1, is_active = true
    WHERE id = v_hijo_id;
  END IF;

  -- Contactos
  v_hijo_id := NULL;
  SELECT id INTO v_hijo_id FROM submenus WHERE name = 'twochat-contactos' LIMIT 1;
  IF v_hijo_id IS NULL THEN
    INSERT INTO submenus (name, label, route, menu_id, parent_id, level, order_index, is_active)
    VALUES ('twochat-contactos', 'Contactos', '/integraciones/2chat/contactos',
            v_menu_id, v_padre_id, v_level + 1, 2, true);
  ELSE
    UPDATE submenus
    SET label = 'Contactos', route = '/integraciones/2chat/contactos',
        menu_id = v_menu_id, parent_id = v_padre_id, level = v_level + 1,
        order_index = 2, is_active = true
    WHERE id = v_hijo_id;
  END IF;
END $$;

COMMIT;
