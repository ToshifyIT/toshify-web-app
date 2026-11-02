-- =====================================================
-- Cuentas de Cabify por sede y grupo de flota (ITCODE-432)
-- =====================================================
-- Cada grupo de flota tiene su propia cuenta de Cabify, y cada cuenta trabaja para
-- una sede. El sync (toshify-sync) lee las cuentas ACTIVAS de esta tabla en cada
-- corrida: agregar una flota o una sede nueva = agregar una fila (y su clave en el
-- servidor), sin tocar código. Desactivar = activa = false (no se borra nada).
--
-- Las contraseñas NO se guardan acá: env_usuario / env_password son los NOMBRES de
-- las variables del servidor (env.sh de /opt/toshify-sync) donde están los valores.
-- Se puede correr más de una vez.

CREATE TABLE IF NOT EXISTS public.cabify_cuentas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,            -- se guarda en cabify_historico.cuenta_cabify
  nombre text NOT NULL,
  grupo_flota_id uuid REFERENCES public.grupos_flota(id),
  sede_id uuid NOT NULL REFERENCES public.sedes(id),
  tabla_destino text NOT NULL DEFAULT 'cabify_historico'
    CHECK (tabla_destino IN ('cabify_historico', 'cabify_historico_bariloche')),
  env_usuario text NOT NULL,
  env_password text NOT NULL,
  orden integer NOT NULL DEFAULT 1,       -- si un conductor está en dos cuentas, gana la de orden mayor
  activa boolean NOT NULL DEFAULT true,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cabify_cuentas IS
  'Cuentas de Cabify por sede y grupo de flota. El sync de toshify-sync recorre las activas.';

-- Cuentas actuales
INSERT INTO public.cabify_cuentas (codigo, nombre, grupo_flota_id, sede_id, tabla_destino, env_usuario, env_password, orden, activa, notas)
VALUES
  ('CG', 'Cabify Grupo CG',
   (SELECT id FROM public.grupos_flota WHERE codigo = 'grupo_cg'),
   '80587298-b799-4a98-87a9-2f74890da443', 'cabify_historico',
   'CABIFY_USERNAME', 'CABIFY_PASSWORD', 1, true, 'Usuario admin.log2@toshify.com.ar'),
  ('44dreams', 'Cabify 44 Dreams',
   (SELECT id FROM public.grupos_flota WHERE codigo = '44_dreams'),
   '80587298-b799-4a98-87a9-2f74890da443', 'cabify_historico',
   'CABIFY_USERNAME_44', 'CABIFY_PASSWORD_44', 2, true, NULL),
  ('BARI', 'Cabify Bariloche',
   NULL,
   'f37193f7-5805-4d87-820d-c4521824860e', 'cabify_historico_bariloche',
   'CABIFY_USERNAME_BARI', 'CABIFY_PASSWORD_BARI', 1, false,
   'Desactivada 2026-11-02: la sede Bariloche no tiene flota. Se conserva para reactivarla.')
ON CONFLICT (codigo) DO NOTHING;

-- Permisos: todos los usuarios con sesión pueden ver; solo admin modifica.
ALTER TABLE public.cabify_cuentas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cabify_cuentas_select ON public.cabify_cuentas;
CREATE POLICY cabify_cuentas_select ON public.cabify_cuentas
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS cabify_cuentas_admin ON public.cabify_cuentas;
CREATE POLICY cabify_cuentas_admin ON public.cabify_cuentas
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles up JOIN public.roles r ON r.id = up.role_id
                 WHERE up.id = auth.uid() AND r.name = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up JOIN public.roles r ON r.id = up.role_id
                      WHERE up.id = auth.uid() AND r.name = 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cabify_cuentas TO authenticated;
GRANT ALL ON public.cabify_cuentas TO service_role;

-- Columna con la cuenta en las tablas de viajes (ya agregada el 2026-11-02)
ALTER TABLE public.cabify_historico ADD COLUMN IF NOT EXISTS cuenta_cabify text;
ALTER TABLE public.cabify_historico_bariloche ADD COLUMN IF NOT EXISTS cuenta_cabify text;

NOTIFY pgrst, 'reload schema';
