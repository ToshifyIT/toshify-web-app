-- Script para agregar el menú de Productos
DO $$
DECLARE
  v_menu_id uuid;
BEGIN
  -- Insertar el menú principal de Productos
  INSERT INTO public.menus (name, label, icon, route, order_index, is_active)
  VALUES ('productos', 'Productos', 'Package', '/productos', 4, true)
  ON CONFLICT (name) DO UPDATE
  SET label = EXCLUDED.label,
      icon = EXCLUDED.icon,
      route = EXCLUDED.route,
      order_index = EXCLUDED.order_index,
      is_active = EXCLUDED.is_active
  RETURNING id INTO v_menu_id;

  RAISE NOTICE 'Menú de Productos creado/actualizado con ID: %', v_menu_id;

END $$;

-- Asignar permisos al rol de admin (si existe)
DO $$
DECLARE
  v_admin_role_id uuid;
  v_menu_id uuid;
BEGIN
  -- Obtener el ID del rol admin (buscar por nombre ya que no hay campo 'codigo')
  SELECT id INTO v_admin_role_id
  FROM public.roles
  WHERE UPPER(name) = 'ADMIN' OR UPPER(name) = 'ADMINISTRADOR'
  LIMIT 1;

  -- Obtener el ID del menú productos
  SELECT id INTO v_menu_id
  FROM public.menus
  WHERE name = 'productos'
  LIMIT 1;

  -- Si existe el rol admin y el menú, asignar permisos
  IF v_admin_role_id IS NOT NULL AND v_menu_id IS NOT NULL THEN
    -- Insertar permiso de visualización
    INSERT INTO public.role_menu_permissions (menu_id, role_id, can_view, can_create, can_edit, can_delete)
    VALUES (v_menu_id, v_admin_role_id, true, true, true, true)
    ON CONFLICT (menu_id, role_id) DO UPDATE
    SET can_view = true,
        can_create = true,
        can_edit = true,
        can_delete = true;

    RAISE NOTICE 'Permisos asignados al rol ADMIN para el menú de Productos';
  ELSE
    RAISE NOTICE 'No se pudieron asignar permisos automáticamente. Asignar manualmente desde el panel de administración.';
  END IF;
END $$;
