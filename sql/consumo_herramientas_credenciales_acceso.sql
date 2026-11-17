-- =====================================================
-- Consumo herramientas: acceso al baúl solo para 4 personas (2026-11-17)
-- =====================================================
-- Correr DESPUÉS de sql/consumo_herramientas_credenciales.sql. Idempotente.
--
-- Las credenciales las ven SOLO los miembros del baúl (ya no alcanza con ser
-- admin): María Flores, Karen Torres, Sara Guarin, Josué Caride y el usuario admin@.
-- Un admin puede seguir agregando o quitando miembros, pero no ve las
-- credenciales salvo que sea miembro.
-- Además Karen, Sara y Josué reciben acceso al submenú Consumo herramientas
-- (ver, crear y editar; sin borrar) para poder abrir el módulo.

BEGIN;

CREATE OR REPLACE FUNCTION herramientas_puede_credenciales()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT herramientas_puede('ver') THEN
    RETURN false;
  END IF;
  RETURN EXISTS (SELECT 1 FROM herramientas_baul_miembros m WHERE m.user_id = auth.uid());
END;
$$;

-- Miembros del baúl
INSERT INTO herramientas_baul_miembros (user_id) VALUES
  ('50f87f00-82bc-418f-98d3-74f02c0c0c57'),  -- María Flores (techspec@)
  ('bd44de51-1197-48f5-809d-d6c6048a8e30'),  -- Karen Torres (coord.admin@)
  ('9310b225-553a-4c7b-886e-1df389f47bd2'),  -- Sara Guarin (coo@)
  ('386eaa01-ff79-48fb-a8ab-4c85f8224604')   -- Josué Caride (ceo@)
ON CONFLICT (user_id) DO NOTHING;

-- Usuario administrador general (admin@)
INSERT INTO herramientas_baul_miembros (user_id)
SELECT id FROM user_profiles WHERE email = 'admin@toshify.com.ar'
ON CONFLICT (user_id) DO NOTHING;

-- Acceso al submenú para Karen, Sara y Josué (María ya entra como admin)
INSERT INTO user_submenu_permissions (user_id, submenu_id, can_view, can_create, can_edit, can_delete)
SELECT u.id, s.id, true, true, true, false
FROM (VALUES
  ('bd44de51-1197-48f5-809d-d6c6048a8e30'::uuid),
  ('9310b225-553a-4c7b-886e-1df389f47bd2'::uuid),
  ('386eaa01-ff79-48fb-a8ab-4c85f8224604'::uuid)
) AS u(id)
CROSS JOIN submenus s
WHERE s.name = 'consumo-herramientas'
  AND NOT EXISTS (
    SELECT 1 FROM user_submenu_permissions x WHERE x.user_id = u.id AND x.submenu_id = s.id
  );

-- Acceso al menú padre (Administración), si todavía no lo tienen
INSERT INTO user_menu_permissions (user_id, menu_id, can_view, can_create, can_edit, can_delete)
SELECT u.id, s.menu_id, true, false, false, false
FROM (VALUES
  ('bd44de51-1197-48f5-809d-d6c6048a8e30'::uuid),
  ('9310b225-553a-4c7b-886e-1df389f47bd2'::uuid),
  ('386eaa01-ff79-48fb-a8ab-4c85f8224604'::uuid)
) AS u(id)
CROSS JOIN submenus s
WHERE s.name = 'consumo-herramientas'
  AND NOT EXISTS (
    SELECT 1 FROM user_menu_permissions x WHERE x.user_id = u.id AND x.menu_id = s.menu_id
  );

COMMIT;

-- Para revisar:
-- SELECT u.full_name, u.email FROM herramientas_baul_miembros m JOIN user_profiles u ON u.id = m.user_id;
