-- Agregar submenú de Auditoría dentro de Administración
-- Ejecutar en Supabase SQL Editor

-- Primero obtener el ID del menú de Administración
DO $$
DECLARE
  v_admin_menu_id uuid;
  v_auditoria_submenu_id uuid;
BEGIN
  -- Buscar el menú de Administración
  SELECT id INTO v_admin_menu_id FROM public.menus WHERE name = 'administracion' LIMIT 1;

  IF v_admin_menu_id IS NULL THEN
    RAISE NOTICE 'No se encontró el menú de Administración';
    RETURN;
  END IF;

  -- Verificar si ya existe el submenú de auditoría
  SELECT id INTO v_auditoria_submenu_id FROM public.submenus WHERE name = 'auditoria' LIMIT 1;

  IF v_auditoria_submenu_id IS NOT NULL THEN
    RAISE NOTICE 'El submenú de Auditoría ya existe';
    RETURN;
  END IF;

  -- Insertar el submenú de Auditoría
  INSERT INTO public.submenus (menu_id, name, label, route, order_index, level, is_active)
  VALUES (v_admin_menu_id, 'auditoria', 'Auditoría', '/auditoria', 60, 1, true)
  RETURNING id INTO v_auditoria_submenu_id;

  RAISE NOTICE 'Submenú de Auditoría creado con ID: %', v_auditoria_submenu_id;

  -- Dar permisos al rol admin
  INSERT INTO public.role_submenu_permissions (role_id, submenu_id, can_view, can_create, can_edit, can_delete)
  SELECT r.id, v_auditoria_submenu_id, true, false, false, false
  FROM public.roles r WHERE r.name = 'admin'
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Permisos asignados al rol admin';

END $$;
