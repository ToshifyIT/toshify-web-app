-- Script para agregar el submenú "Asignaciones Activas" al menú de Asignaciones
-- Este submenú mostrará únicamente las asignaciones en estado activo

-- Primero, obtener el ID del menú "asignaciones"
DO $$
DECLARE
  menu_asignaciones_id UUID;
  max_order_index INT;
BEGIN
  -- Obtener el ID del menú asignaciones
  SELECT id INTO menu_asignaciones_id
  FROM menus
  WHERE name = 'asignaciones'
  LIMIT 1;

  -- Si no existe el menú, salir
  IF menu_asignaciones_id IS NULL THEN
    RAISE EXCEPTION 'El menú "asignaciones" no existe. Por favor créalo primero.';
  END IF;

  -- Obtener el último order_index de los submenús de asignaciones
  SELECT COALESCE(MAX(order_index), 0) INTO max_order_index
  FROM submenus
  WHERE menu_id = menu_asignaciones_id;

  -- Insertar el nuevo submenú
  INSERT INTO submenus (menu_id, name, label, path, icon, order_index, is_active, created_at, updated_at)
  VALUES (
    menu_asignaciones_id,
    'asignaciones-activas',
    'Asignaciones Activas',
    '/asignaciones-activas',
    'CheckCircle',
    max_order_index + 1,
    true,
    NOW(),
    NOW()
  )
  ON CONFLICT (name)
  DO UPDATE SET
    label = EXCLUDED.label,
    path = EXCLUDED.path,
    icon = EXCLUDED.icon,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

  RAISE NOTICE 'Submenú "Asignaciones Activas" creado/actualizado exitosamente';
END $$;

-- Comentario explicativo
COMMENT ON TABLE submenus IS 'Tabla de submenús del sistema - incluye "Asignaciones Activas" para visualizar asignaciones en estado activo';
