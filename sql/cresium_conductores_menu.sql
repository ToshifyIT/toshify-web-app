-- =====================================================
-- Administración > Cresium conductores (2026-11-25)
-- =====================================================
-- Submenú nuevo debajo de Facturación: movimientos de Cresium (44 Dreams y
-- Grupo CG) cruzados con los conductores por CUIT/CUIL, DNI o CBU, y consulta
-- por CBU. Solo lee cresium_movimientos y conductores: no crea tablas.
-- El name DEBE coincidir con el submenuName de HomePage.tsx ('cresium-conductores').
-- Al crearlo solo lo ven los admin; a los demás se les da en Administración > Menú por rol.
-- Idempotente: se puede correr de nuevo.

DO $$
DECLARE
  v_menu_id uuid;
  v_parent_id uuid;
  v_level integer;
  v_order integer;
  v_id uuid;
BEGIN
  SELECT menu_id, parent_id, COALESCE(level, 1), COALESCE(order_index, 0)
  INTO v_menu_id, v_parent_id, v_level, v_order
  FROM submenus WHERE name = 'facturacion' LIMIT 1;

  IF v_menu_id IS NULL THEN
    RAISE EXCEPTION 'No existe el submenú facturacion (referencia para ubicar Cresium conductores en Administración).';
  END IF;

  SELECT id INTO v_id FROM submenus WHERE name = 'cresium-conductores' LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO submenus (name, label, route, menu_id, parent_id, level, order_index, is_active)
    VALUES ('cresium-conductores', 'Cresium conductores', '/administracion/cresium-conductores',
            v_menu_id, v_parent_id, v_level, v_order + 1, true);
  ELSE
    UPDATE submenus
    SET label = 'Cresium conductores', route = '/administracion/cresium-conductores',
        menu_id = v_menu_id, parent_id = v_parent_id, level = v_level, is_active = true
    WHERE id = v_id;
  END IF;
END $$;
