-- =====================================================
-- Inventario: separar Seguimiento del flujo de Pedidos
-- =====================================================
-- Crea submenús reales bajo Logística > Movimientos:
-- 1) Registrar movimiento: formulario actual de movimientos.
-- 2) Seguimiento: ingresos por confirmar, aprobaciones y procesados.
--
-- También copia permisos desde el submenú actual "inventario-movimientos"
-- y crea tabs propias para el nuevo control.

BEGIN;

DO $$
DECLARE
  v_movimientos_id uuid;
  v_movimientos_menu_id uuid;
  v_movimientos_level integer;
  v_registrar_id uuid;
  v_control_id uuid;
  v_ingresos_tab_id uuid;
  v_aprobaciones_tab_id uuid;
  v_procesados_tab_id uuid;
  v_source_ingresos_tab_id uuid;
  v_source_aprobaciones_tab_id uuid;
  v_source_procesados_tab_id uuid;
BEGIN
  SELECT id, menu_id, COALESCE(level, 1)
  INTO v_movimientos_id, v_movimientos_menu_id, v_movimientos_level
  FROM submenus
  WHERE name = 'inventario-movimientos'
  LIMIT 1;

  IF v_movimientos_id IS NULL THEN
    RAISE EXCEPTION 'No existe el submenú inventario-movimientos. Crear/validar primero el menú de inventario.';
  END IF;

  SELECT id
  INTO v_registrar_id
  FROM submenus
  WHERE name = 'inventario-movimientos-registrar'
  LIMIT 1;

  IF v_registrar_id IS NULL THEN
    INSERT INTO submenus (
      name,
      label,
      route,
      menu_id,
      parent_id,
      level,
      order_index,
      is_active
    )
    VALUES (
      'inventario-movimientos-registrar',
      'Registrar movimiento',
      '/logistica/inventario/movimientos',
      v_movimientos_menu_id,
      v_movimientos_id,
      v_movimientos_level + 1,
      1,
      true
    )
    RETURNING id INTO v_registrar_id;
  ELSE
    UPDATE submenus
    SET
      label = 'Registrar movimiento',
      route = '/logistica/inventario/movimientos',
      menu_id = v_movimientos_menu_id,
      parent_id = v_movimientos_id,
      level = v_movimientos_level + 1,
      order_index = 1,
      is_active = true
    WHERE id = v_registrar_id;
  END IF;

  SELECT id
  INTO v_control_id
  FROM submenus
  WHERE name = 'inventario-control-movimientos'
  LIMIT 1;

  IF v_control_id IS NULL THEN
    INSERT INTO submenus (
      name,
      label,
      route,
      menu_id,
      parent_id,
      level,
      order_index,
      is_active
    )
    VALUES (
      'inventario-control-movimientos',
      'Seguimiento',
      '/logistica/inventario/control-movimientos',
      v_movimientos_menu_id,
      v_movimientos_id,
      v_movimientos_level + 1,
      2,
      true
    )
    RETURNING id INTO v_control_id;
  ELSE
    UPDATE submenus
    SET
      label = 'Seguimiento',
      route = '/logistica/inventario/control-movimientos',
      menu_id = v_movimientos_menu_id,
      parent_id = v_movimientos_id,
      level = v_movimientos_level + 1,
      order_index = 2,
      is_active = true
    WHERE id = v_control_id;
  END IF;

  INSERT INTO role_submenu_permissions (
    role_id,
    submenu_id,
    can_view,
    can_create,
    can_edit,
    can_delete
  )
  SELECT
    role_id,
    v_registrar_id,
    can_view,
    can_create,
    can_edit,
    can_delete
  FROM role_submenu_permissions
  WHERE submenu_id = v_movimientos_id
  ON CONFLICT (role_id, submenu_id) DO UPDATE SET
    can_view = EXCLUDED.can_view,
    can_create = EXCLUDED.can_create,
    can_edit = EXCLUDED.can_edit,
    can_delete = EXCLUDED.can_delete;

  INSERT INTO role_submenu_permissions (
    role_id,
    submenu_id,
    can_view,
    can_create,
    can_edit,
    can_delete
  )
  SELECT
    role_id,
    v_control_id,
    can_view,
    can_create,
    can_edit,
    can_delete
  FROM role_submenu_permissions
  WHERE submenu_id = v_movimientos_id
  ON CONFLICT (role_id, submenu_id) DO UPDATE SET
    can_view = EXCLUDED.can_view,
    can_create = EXCLUDED.can_create,
    can_edit = EXCLUDED.can_edit,
    can_delete = EXCLUDED.can_delete;

  IF to_regclass('public.user_submenu_permissions') IS NOT NULL THEN
    EXECUTE '
      INSERT INTO user_submenu_permissions (
        user_id,
        submenu_id,
        can_view,
        can_create,
        can_edit,
        can_delete
      )
      SELECT
        user_id,
        $1,
        can_view,
        can_create,
        can_edit,
        can_delete
      FROM user_submenu_permissions
      WHERE submenu_id = $2
      ON CONFLICT (user_id, submenu_id) DO UPDATE SET
        can_view = EXCLUDED.can_view,
        can_create = EXCLUDED.can_create,
        can_edit = EXCLUDED.can_edit,
        can_delete = EXCLUDED.can_delete
    ' USING v_registrar_id, v_movimientos_id;

    EXECUTE '
      INSERT INTO user_submenu_permissions (
        user_id,
        submenu_id,
        can_view,
        can_create,
        can_edit,
        can_delete
      )
      SELECT
        user_id,
        $1,
        can_view,
        can_create,
        can_edit,
        can_delete
      FROM user_submenu_permissions
      WHERE submenu_id = $2
      ON CONFLICT (user_id, submenu_id) DO UPDATE SET
        can_view = EXCLUDED.can_view,
        can_create = EXCLUDED.can_create,
        can_edit = EXCLUDED.can_edit,
        can_delete = EXCLUDED.can_delete
    ' USING v_control_id, v_movimientos_id;
  END IF;

  SELECT id
  INTO v_ingresos_tab_id
  FROM tabs
  WHERE name = 'inventario-control-movimientos:ingresos'
  LIMIT 1;

  IF v_ingresos_tab_id IS NULL THEN
    INSERT INTO tabs (name, label, submenu_id, order_index, is_active)
    VALUES (
      'inventario-control-movimientos:ingresos',
      'Ingresos por confirmar',
      v_control_id,
      1,
      true
    )
    RETURNING id INTO v_ingresos_tab_id;
  ELSE
    UPDATE tabs
    SET label = 'Ingresos por confirmar', submenu_id = v_control_id, order_index = 1, is_active = true
    WHERE id = v_ingresos_tab_id;
  END IF;

  SELECT id
  INTO v_aprobaciones_tab_id
  FROM tabs
  WHERE name = 'inventario-control-movimientos:aprobaciones'
  LIMIT 1;

  IF v_aprobaciones_tab_id IS NULL THEN
    INSERT INTO tabs (name, label, submenu_id, order_index, is_active)
    VALUES (
      'inventario-control-movimientos:aprobaciones',
      'Aprobaciones internas',
      v_control_id,
      2,
      true
    )
    RETURNING id INTO v_aprobaciones_tab_id;
  ELSE
    UPDATE tabs
    SET label = 'Aprobaciones internas', submenu_id = v_control_id, order_index = 2, is_active = true
    WHERE id = v_aprobaciones_tab_id;
  END IF;

  SELECT id
  INTO v_procesados_tab_id
  FROM tabs
  WHERE name = 'inventario-control-movimientos:procesados'
  LIMIT 1;

  IF v_procesados_tab_id IS NULL THEN
    INSERT INTO tabs (name, label, submenu_id, order_index, is_active)
    VALUES (
      'inventario-control-movimientos:procesados',
      'Movimientos procesados',
      v_control_id,
      3,
      true
    )
    RETURNING id INTO v_procesados_tab_id;
  ELSE
    UPDATE tabs
    SET label = 'Movimientos procesados', submenu_id = v_control_id, order_index = 3, is_active = true
    WHERE id = v_procesados_tab_id;
  END IF;

  SELECT id INTO v_source_ingresos_tab_id FROM tabs WHERE name = 'inventario-pedidos:entradas' LIMIT 1;
  SELECT id INTO v_source_aprobaciones_tab_id FROM tabs WHERE name = 'inventario-pedidos:pendientes' LIMIT 1;
  SELECT id INTO v_source_procesados_tab_id FROM tabs WHERE name = 'inventario-pedidos:historico' LIMIT 1;

  IF v_source_ingresos_tab_id IS NOT NULL THEN
    INSERT INTO role_tab_permissions (role_id, tab_id, can_view, can_create, can_edit, can_delete)
    SELECT role_id, v_ingresos_tab_id, can_view, can_create, can_edit, can_delete
    FROM role_tab_permissions
    WHERE tab_id = v_source_ingresos_tab_id
    ON CONFLICT (role_id, tab_id) DO UPDATE SET
      can_view = EXCLUDED.can_view,
      can_create = EXCLUDED.can_create,
      can_edit = EXCLUDED.can_edit,
      can_delete = EXCLUDED.can_delete;
  END IF;

  IF v_source_aprobaciones_tab_id IS NOT NULL THEN
    INSERT INTO role_tab_permissions (role_id, tab_id, can_view, can_create, can_edit, can_delete)
    SELECT role_id, v_aprobaciones_tab_id, can_view, can_create, can_edit, can_delete
    FROM role_tab_permissions
    WHERE tab_id = v_source_aprobaciones_tab_id
    ON CONFLICT (role_id, tab_id) DO UPDATE SET
      can_view = EXCLUDED.can_view,
      can_create = EXCLUDED.can_create,
      can_edit = EXCLUDED.can_edit,
      can_delete = EXCLUDED.can_delete;
  END IF;

  IF v_source_procesados_tab_id IS NOT NULL THEN
    INSERT INTO role_tab_permissions (role_id, tab_id, can_view, can_create, can_edit, can_delete)
    SELECT role_id, v_procesados_tab_id, can_view, can_create, can_edit, can_delete
    FROM role_tab_permissions
    WHERE tab_id = v_source_procesados_tab_id
    ON CONFLICT (role_id, tab_id) DO UPDATE SET
      can_view = EXCLUDED.can_view,
      can_create = EXCLUDED.can_create,
      can_edit = EXCLUDED.can_edit,
      can_delete = EXCLUDED.can_delete;
  END IF;

  INSERT INTO role_tab_permissions (role_id, tab_id, can_view, can_create, can_edit, can_delete)
  SELECT role_id, v_ingresos_tab_id, can_view, can_create, can_edit, can_delete
  FROM role_submenu_permissions
  WHERE submenu_id = v_control_id
    AND NOT EXISTS (SELECT 1 FROM role_tab_permissions WHERE tab_id = v_ingresos_tab_id)
  ON CONFLICT (role_id, tab_id) DO NOTHING;

  INSERT INTO role_tab_permissions (role_id, tab_id, can_view, can_create, can_edit, can_delete)
  SELECT role_id, v_aprobaciones_tab_id, can_view, can_create, can_edit, can_delete
  FROM role_submenu_permissions
  WHERE submenu_id = v_control_id
    AND NOT EXISTS (SELECT 1 FROM role_tab_permissions WHERE tab_id = v_aprobaciones_tab_id)
  ON CONFLICT (role_id, tab_id) DO NOTHING;

  INSERT INTO role_tab_permissions (role_id, tab_id, can_view, can_create, can_edit, can_delete)
  SELECT role_id, v_procesados_tab_id, can_view, can_create, can_edit, can_delete
  FROM role_submenu_permissions
  WHERE submenu_id = v_control_id
    AND NOT EXISTS (SELECT 1 FROM role_tab_permissions WHERE tab_id = v_procesados_tab_id)
  ON CONFLICT (role_id, tab_id) DO NOTHING;

  IF to_regclass('public.user_tab_permissions') IS NOT NULL THEN
    IF v_source_ingresos_tab_id IS NOT NULL THEN
      EXECUTE '
        INSERT INTO user_tab_permissions (user_id, tab_id, can_view, can_create, can_edit, can_delete)
        SELECT user_id, $1, can_view, can_create, can_edit, can_delete
        FROM user_tab_permissions
        WHERE tab_id = $2
        ON CONFLICT (user_id, tab_id) DO UPDATE SET
          can_view = EXCLUDED.can_view,
          can_create = EXCLUDED.can_create,
          can_edit = EXCLUDED.can_edit,
          can_delete = EXCLUDED.can_delete
      ' USING v_ingresos_tab_id, v_source_ingresos_tab_id;
    END IF;

    IF v_source_aprobaciones_tab_id IS NOT NULL THEN
      EXECUTE '
        INSERT INTO user_tab_permissions (user_id, tab_id, can_view, can_create, can_edit, can_delete)
        SELECT user_id, $1, can_view, can_create, can_edit, can_delete
        FROM user_tab_permissions
        WHERE tab_id = $2
        ON CONFLICT (user_id, tab_id) DO UPDATE SET
          can_view = EXCLUDED.can_view,
          can_create = EXCLUDED.can_create,
          can_edit = EXCLUDED.can_edit,
          can_delete = EXCLUDED.can_delete
      ' USING v_aprobaciones_tab_id, v_source_aprobaciones_tab_id;
    END IF;

    IF v_source_procesados_tab_id IS NOT NULL THEN
      EXECUTE '
        INSERT INTO user_tab_permissions (user_id, tab_id, can_view, can_create, can_edit, can_delete)
        SELECT user_id, $1, can_view, can_create, can_edit, can_delete
        FROM user_tab_permissions
        WHERE tab_id = $2
        ON CONFLICT (user_id, tab_id) DO UPDATE SET
          can_view = EXCLUDED.can_view,
          can_create = EXCLUDED.can_create,
          can_edit = EXCLUDED.can_edit,
          can_delete = EXCLUDED.can_delete
      ' USING v_procesados_tab_id, v_source_procesados_tab_id;
    END IF;
  END IF;
END $$;

COMMIT;
