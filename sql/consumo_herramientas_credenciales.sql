-- =====================================================
-- Consumo herramientas: baúl de credenciales cifradas (2026-11-17)
-- =====================================================
-- Correr DESPUÉS de sql/consumo_herramientas.sql. Idempotente.
--
-- Las contraseñas se cifran EN EL NAVEGADOR (AES-GCM 256, clave derivada con
-- PBKDF2-SHA256 de la "clave del baúl") antes de llegar acá. La base solo guarda
-- texto cifrado: ni un admin de Supabase ni la service role pueden leerlas.
-- La clave del baúl NO se guarda en ningún lado; si se olvida, hay que volver a
-- cargar las contraseñas.
--
-- Quién puede ver/editar credenciales: rol admin + los usuarios cargados en
-- herramientas_baul_miembros (además de tener permiso de ver el submenú).
-- Cada vez que alguien ve, copia o cambia una credencial queda registrado.

BEGIN;

-- 1) Configuración del baúl (una sola fila): sal, iteraciones y un verificador
--    (un texto conocido cifrado) para saber si la clave ingresada es correcta.
CREATE TABLE IF NOT EXISTS herramientas_baul (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  sal TEXT NOT NULL,
  iteraciones INTEGER NOT NULL CHECK (iteraciones >= 100000),
  verificador TEXT NOT NULL,
  verificador_iv TEXT NOT NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  creado_por UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Quién tiene acceso al baúl (además de los admin)
CREATE TABLE IF NOT EXISTS herramientas_baul_miembros (
  user_id UUID PRIMARY KEY REFERENCES user_profiles(id) ON DELETE CASCADE,
  agregado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3) Credenciales: usuario en claro, contraseña / 2FA / notas cifrados
CREATE TABLE IF NOT EXISTS herramientas_credenciales (
  herramienta_id UUID PRIMARY KEY REFERENCES herramientas(id) ON DELETE CASCADE,
  usuario TEXT,
  password_cifrada TEXT,
  password_iv TEXT,
  totp_cifrado TEXT,
  totp_iv TEXT,
  notas_cifradas TEXT,
  notas_iv TEXT,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_por UUID REFERENCES user_profiles(id) ON DELETE SET NULL
);

-- 4) Registro de accesos
CREATE TABLE IF NOT EXISTS herramientas_credenciales_accesos (
  id BIGSERIAL PRIMARY KEY,
  herramienta_id UUID REFERENCES herramientas(id) ON DELETE CASCADE,
  user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  accion TEXT NOT NULL CHECK (accion IN ('ver', 'copiar', 'editar', 'crear_baul')),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS herramientas_credenciales_accesos_herr_idx
  ON herramientas_credenciales_accesos (herramienta_id, creado_en DESC);

-- ¿El usuario actual puede usar el baúl?
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
  RETURN EXISTS (
    SELECT 1 FROM user_profiles up JOIN roles r ON r.id = up.role_id
    WHERE up.id = auth.uid() AND r.name = 'admin'
  ) OR EXISTS (
    SELECT 1 FROM herramientas_baul_miembros m WHERE m.user_id = auth.uid()
  );
END;
$$;
GRANT EXECUTE ON FUNCTION herramientas_puede_credenciales() TO authenticated;

-- RLS
ALTER TABLE herramientas_baul ENABLE ROW LEVEL SECURITY;
ALTER TABLE herramientas_baul_miembros ENABLE ROW LEVEL SECURITY;
ALTER TABLE herramientas_credenciales ENABLE ROW LEVEL SECURITY;
ALTER TABLE herramientas_credenciales_accesos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS herramientas_baul_select ON herramientas_baul;
CREATE POLICY herramientas_baul_select ON herramientas_baul FOR SELECT TO authenticated
  USING (herramientas_puede_credenciales());
DROP POLICY IF EXISTS herramientas_baul_insert ON herramientas_baul;
CREATE POLICY herramientas_baul_insert ON herramientas_baul FOR INSERT TO authenticated
  WITH CHECK (herramientas_puede_credenciales());
DROP POLICY IF EXISTS herramientas_baul_update ON herramientas_baul;
CREATE POLICY herramientas_baul_update ON herramientas_baul FOR UPDATE TO authenticated
  USING (herramientas_puede_credenciales()) WITH CHECK (herramientas_puede_credenciales());

-- Miembros: los ve quien usa el baúl; los administra solo un admin
DROP POLICY IF EXISTS herramientas_baul_miembros_select ON herramientas_baul_miembros;
CREATE POLICY herramientas_baul_miembros_select ON herramientas_baul_miembros FOR SELECT TO authenticated
  USING (herramientas_puede_credenciales());
DROP POLICY IF EXISTS herramientas_baul_miembros_admin ON herramientas_baul_miembros;
CREATE POLICY herramientas_baul_miembros_admin ON herramientas_baul_miembros FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles up JOIN roles r ON r.id = up.role_id WHERE up.id = auth.uid() AND r.name = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles up JOIN roles r ON r.id = up.role_id WHERE up.id = auth.uid() AND r.name = 'admin'));

DROP POLICY IF EXISTS herramientas_credenciales_select ON herramientas_credenciales;
CREATE POLICY herramientas_credenciales_select ON herramientas_credenciales FOR SELECT TO authenticated
  USING (herramientas_puede_credenciales());
DROP POLICY IF EXISTS herramientas_credenciales_insert ON herramientas_credenciales;
CREATE POLICY herramientas_credenciales_insert ON herramientas_credenciales FOR INSERT TO authenticated
  WITH CHECK (herramientas_puede_credenciales());
DROP POLICY IF EXISTS herramientas_credenciales_update ON herramientas_credenciales;
CREATE POLICY herramientas_credenciales_update ON herramientas_credenciales FOR UPDATE TO authenticated
  USING (herramientas_puede_credenciales()) WITH CHECK (herramientas_puede_credenciales());
DROP POLICY IF EXISTS herramientas_credenciales_delete ON herramientas_credenciales;
CREATE POLICY herramientas_credenciales_delete ON herramientas_credenciales FOR DELETE TO authenticated
  USING (herramientas_puede_credenciales());

-- Registro: cada uno inserta solo a su nombre; nadie edita ni borra
DROP POLICY IF EXISTS herramientas_credenciales_accesos_select ON herramientas_credenciales_accesos;
CREATE POLICY herramientas_credenciales_accesos_select ON herramientas_credenciales_accesos FOR SELECT TO authenticated
  USING (herramientas_puede_credenciales());
DROP POLICY IF EXISTS herramientas_credenciales_accesos_insert ON herramientas_credenciales_accesos;
CREATE POLICY herramientas_credenciales_accesos_insert ON herramientas_credenciales_accesos FOR INSERT TO authenticated
  WITH CHECK (herramientas_puede_credenciales() AND user_id = auth.uid());

REVOKE ALL ON herramientas_baul, herramientas_baul_miembros, herramientas_credenciales,
  herramientas_credenciales_accesos FROM anon;

COMMIT;

-- Para dar acceso al baúl a alguien que no es admin (por email):
-- INSERT INTO herramientas_baul_miembros (user_id)
--   SELECT id FROM user_profiles WHERE email = 'karen@toshify.com.ar'
--   ON CONFLICT DO NOTHING;
--
-- Para revisar:
-- SELECT u.email, m.agregado_en FROM herramientas_baul_miembros m JOIN user_profiles u ON u.id = m.user_id;
-- SELECT a.creado_en, h.nombre, u.email, a.accion FROM herramientas_credenciales_accesos a
--   LEFT JOIN herramientas h ON h.id = a.herramienta_id LEFT JOIN user_profiles u ON u.id = a.user_id
--   ORDER BY a.creado_en DESC LIMIT 50;
