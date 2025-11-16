-- Script para agregar el menú de Productos
DO $$
DECLARE
  v_menu_id uuid;
BEGIN
  -- Insertar el menú principal de Productos
  INSERT INTO public.menus (nombre, descripcion, icono, ruta, orden, activo)
  VALUES ('productos', 'Gestión de Productos', 'Package', '/productos', 4, true)
  ON CONFLICT (nombre) DO UPDATE
  SET descripcion = EXCLUDED.descripcion,
      icono = EXCLUDED.icono,
      ruta = EXCLUDED.ruta,
      orden = EXCLUDED.orden,
      activo = EXCLUDED.activo
  RETURNING id INTO v_menu_id;

  RAISE NOTICE 'Menú de Productos creado/actualizado con ID: %', v_menu_id;

END $$;

-- Asignar permisos al rol de admin (si existe)
DO $$
DECLARE
  v_admin_rol_id uuid;
  v_menu_id uuid;
BEGIN
  -- Obtener el ID del rol admin
  SELECT id INTO v_admin_rol_id
  FROM public.roles
  WHERE codigo = 'ADMIN'
  LIMIT 1;

  -- Obtener el ID del menú productos
  SELECT id INTO v_menu_id
  FROM public.menus
  WHERE nombre = 'productos'
  LIMIT 1;

  -- Si existe el rol admin y el menú, asignar permisos
  IF v_admin_rol_id IS NOT NULL AND v_menu_id IS NOT NULL THEN
    -- Insertar permiso de visualización
    INSERT INTO public.menus_roles (menu_id, rol_id, puede_ver, puede_crear, puede_editar, puede_eliminar)
    VALUES (v_menu_id, v_admin_rol_id, true, true, true, true)
    ON CONFLICT (menu_id, rol_id) DO UPDATE
    SET puede_ver = true,
        puede_crear = true,
        puede_editar = true,
        puede_eliminar = true;

    RAISE NOTICE 'Permisos asignados al rol ADMIN para el menú de Productos';
  ELSE
    RAISE NOTICE 'No se pudieron asignar permisos automáticamente. Asignar manualmente desde el panel de administración.';
  END IF;
END $$;
