-- =====================================================
-- Administración › Consumo herramientas (2026-11-17)
-- =====================================================
-- Reemplaza la planilla "Consumo Herramientas": suscripciones pagas de IT, cuánto
-- se paga, cuándo vence cada cobro, si ya se pagó y la factura de cada pago.
--
-- 1) herramientas: inventario (una fila por plataforma / plan).
-- 2) herramientas_pagos: un pago por herramienta y período ('2026-11' mensual,
--    '2026' anual). Los genera herramientas_generar_pagos() (mensuales y anuales);
--    los "Por uso" se cargan a mano desde la pantalla.
-- 3) Storage privado 'herramientas-facturas' para la factura de cada pago.
-- 4) Permisos: ver = can_view del submenú; cargar / editar / marcar pagado =
--    can_edit. Los admin, todo. Al crear el submenú solo lo ven los admin.
-- 5) Tarea diaria en la base (pg_cron) que genera los pagos y marca vencidos.
-- 6) Registro del script de alertas (servidor) en cron_jobs para que aparezca en
--    Configuración › Integraciones & Tokens.
-- 7) Datos iniciales (11 herramientas; Contabo DEV ya no se usa, solo queda PRD). Razón social y CUIT quedan vacíos a
--    propósito: la alerta los marca hasta confirmar cada uno desde la pantalla.
--
-- NUNCA se guardan contraseñas ni números completos de tarjeta (solo los últimos 4).
-- Ejecutar en el SQL Editor de Supabase. Idempotente (se puede correr más de una vez).

BEGIN;

-- ─────────────────────────────────────────────────────
-- 1) Inventario
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS herramientas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  uso TEXT,
  plan TEXT,
  monto NUMERIC(14, 2),
  moneda TEXT CHECK (moneda IN ('USD', 'ARS', 'EUR')),
  periodicidad TEXT CHECK (periodicidad IN ('Mensual', 'Anual', 'Por uso', 'Gratis')),
  -- Mensual / Por uso: día del mes en que cobran
  dia_cobro SMALLINT CHECK (dia_cobro BETWEEN 1 AND 31),
  -- Anual (ej. dominios): próxima fecha de vencimiento
  fecha_vencimiento DATE,
  cuenta_acceso TEXT,
  url_facturacion TEXT,
  responsable TEXT,
  razon_social_facturada TEXT,
  cuit_facturado TEXT,
  -- Solo los últimos 4 dígitos de la tarjeta cargada
  tarjeta_ultimos4 TEXT CHECK (tarjeta_ultimos4 ~ '^[0-9]{4}$'),
  envio_facturas TEXT NOT NULL DEFAULT 'Pendiente revisar'
    CHECK (envio_facturas IN ('Automático configurado', 'Descarga manual', 'Pendiente revisar')),
  acceso_melody BOOLEAN NOT NULL DEFAULT false,
  estado TEXT NOT NULL DEFAULT 'Activa' CHECK (estado IN ('Activa', 'Dada de baja')),
  fecha_baja DATE,
  notas TEXT,
  creado_por UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_herramientas_estado ON herramientas(estado);

-- ─────────────────────────────────────────────────────
-- 2) Pagos
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS herramientas_pagos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  herramienta_id UUID NOT NULL REFERENCES herramientas(id) ON DELETE CASCADE,
  -- '2026-11' (mensual / por uso) o '2026' (anual)
  periodo TEXT NOT NULL,
  fecha_vencimiento DATE,
  monto NUMERIC(14, 2),
  moneda TEXT CHECK (moneda IN ('USD', 'ARS', 'EUR')),
  estado TEXT NOT NULL DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente', 'Pagado', 'Vencido', 'N/A')),
  fecha_pago DATE,
  -- Ruta en el bucket 'herramientas-facturas'
  factura_path TEXT,
  factura_nombre TEXT,
  observaciones TEXT,
  pagado_por UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  pagado_en TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (herramienta_id, periodo)
);

CREATE INDEX IF NOT EXISTS idx_herr_pagos_venc ON herramientas_pagos(fecha_vencimiento);
CREATE INDEX IF NOT EXISTS idx_herr_pagos_estado ON herramientas_pagos(estado);

-- updated_at automático
CREATE OR REPLACE FUNCTION herramientas_tocar_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS herramientas_updated_at ON herramientas;
CREATE TRIGGER herramientas_updated_at BEFORE UPDATE ON herramientas
  FOR EACH ROW EXECUTE FUNCTION herramientas_tocar_updated_at();
DROP TRIGGER IF EXISTS herramientas_pagos_updated_at ON herramientas_pagos;
CREATE TRIGGER herramientas_pagos_updated_at BEFORE UPDATE ON herramientas_pagos
  FOR EACH ROW EXECUTE FUNCTION herramientas_tocar_updated_at();

-- ─────────────────────────────────────────────────────
-- 4) Permisos: helper por submenú 'consumo-herramientas'
--    p_accion = 'ver' (can_view) | 'editar' (can_edit)
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION herramientas_puede(p_accion text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ok boolean := false;
  v_editar boolean := (p_accion = 'editar');
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  -- Admin por rol
  SELECT EXISTS (
    SELECT 1 FROM user_profiles up JOIN roles r ON r.id = up.role_id
    WHERE up.id = auth.uid() AND r.name = 'admin'
  ) INTO v_ok;
  IF v_ok THEN RETURN true; END IF;

  -- Permiso del submenú por rol
  SELECT EXISTS (
    SELECT 1
    FROM user_profiles up
    JOIN role_submenu_permissions rsp ON rsp.role_id = up.role_id
    JOIN submenus s ON s.id = rsp.submenu_id
    WHERE up.id = auth.uid() AND s.name = 'consumo-herramientas'
      AND (CASE WHEN v_editar THEN rsp.can_edit ELSE rsp.can_view END)
  ) INTO v_ok;
  IF v_ok THEN RETURN true; END IF;

  -- Permiso por usuario (si la tabla existe)
  IF to_regclass('public.user_submenu_permissions') IS NOT NULL THEN
    EXECUTE format('
      SELECT EXISTS (
        SELECT 1 FROM user_submenu_permissions usp
        JOIN submenus s ON s.id = usp.submenu_id
        WHERE usp.user_id = $1 AND s.name = ''consumo-herramientas'' AND usp.%I
      )', CASE WHEN v_editar THEN 'can_edit' ELSE 'can_view' END)
      INTO v_ok USING auth.uid();
  END IF;
  RETURN COALESCE(v_ok, false);
END;
$$;

REVOKE ALL ON FUNCTION herramientas_puede(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION herramientas_puede(text) TO authenticated;

ALTER TABLE herramientas ENABLE ROW LEVEL SECURITY;
ALTER TABLE herramientas_pagos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS herramientas_select ON herramientas;
CREATE POLICY herramientas_select ON herramientas FOR SELECT TO authenticated
  USING (herramientas_puede('ver'));
DROP POLICY IF EXISTS herramientas_insert ON herramientas;
CREATE POLICY herramientas_insert ON herramientas FOR INSERT TO authenticated
  WITH CHECK (herramientas_puede('editar'));
DROP POLICY IF EXISTS herramientas_update ON herramientas;
CREATE POLICY herramientas_update ON herramientas FOR UPDATE TO authenticated
  USING (herramientas_puede('editar')) WITH CHECK (herramientas_puede('editar'));
DROP POLICY IF EXISTS herramientas_delete ON herramientas;
CREATE POLICY herramientas_delete ON herramientas FOR DELETE TO authenticated
  USING (herramientas_puede('editar'));

DROP POLICY IF EXISTS herramientas_pagos_select ON herramientas_pagos;
CREATE POLICY herramientas_pagos_select ON herramientas_pagos FOR SELECT TO authenticated
  USING (herramientas_puede('ver'));
DROP POLICY IF EXISTS herramientas_pagos_insert ON herramientas_pagos;
CREATE POLICY herramientas_pagos_insert ON herramientas_pagos FOR INSERT TO authenticated
  WITH CHECK (herramientas_puede('editar'));
DROP POLICY IF EXISTS herramientas_pagos_update ON herramientas_pagos;
CREATE POLICY herramientas_pagos_update ON herramientas_pagos FOR UPDATE TO authenticated
  USING (herramientas_puede('editar')) WITH CHECK (herramientas_puede('editar'));
DROP POLICY IF EXISTS herramientas_pagos_delete ON herramientas_pagos;
CREATE POLICY herramientas_pagos_delete ON herramientas_pagos FOR DELETE TO authenticated
  USING (herramientas_puede('editar'));

REVOKE ALL ON herramientas, herramientas_pagos FROM anon;

-- ─────────────────────────────────────────────────────
-- 3) Storage privado para las facturas
-- ─────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('herramientas-facturas', 'herramientas-facturas', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS herramientas_facturas_select ON storage.objects;
CREATE POLICY herramientas_facturas_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'herramientas-facturas' AND herramientas_puede('ver'));
DROP POLICY IF EXISTS herramientas_facturas_insert ON storage.objects;
CREATE POLICY herramientas_facturas_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'herramientas-facturas' AND herramientas_puede('editar'));
DROP POLICY IF EXISTS herramientas_facturas_update ON storage.objects;
CREATE POLICY herramientas_facturas_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'herramientas-facturas' AND herramientas_puede('editar'));
DROP POLICY IF EXISTS herramientas_facturas_delete ON storage.objects;
CREATE POLICY herramientas_facturas_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'herramientas-facturas' AND herramientas_puede('editar'));

-- ─────────────────────────────────────────────────────
-- 2b) Generación de pagos
--   Mensual: un pago por mes con vencimiento en su día de cobro (si el mes es
--            más corto, el último día).
--   Anual:   un pago en el mes de su fecha de vencimiento (período = año).
--   Por uso / Gratis: no se generan (Por uso se carga a mano).
--   Además pasa a 'Vencido' los pendientes con fecha ya pasada.
--   Genera el mes pedido y el siguiente (para avisar a fin de mes lo que vence
--   a principio del otro). Se puede ejecutar varias veces: no duplica.
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION herramientas_generar_pagos(p_mes date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hoy date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  v_mes date;
  v_ultimo date;
  v_creados integer := 0;
  v_n integer;
BEGIN
  -- Desde la web solo quien puede ver el módulo; pg_cron / service role sin usuario
  IF auth.uid() IS NOT NULL AND NOT herramientas_puede('ver') THEN
    RAISE EXCEPTION 'Sin permiso para Consumo herramientas';
  END IF;

  FOR v_mes IN
    SELECT generate_series(date_trunc('month', COALESCE(p_mes, v_hoy))::date,
                           (date_trunc('month', COALESCE(p_mes, v_hoy)) + interval '1 month')::date,
                           interval '1 month')::date
  LOOP
    v_ultimo := (v_mes + interval '1 month - 1 day')::date;

    -- Mensuales
    INSERT INTO herramientas_pagos (herramienta_id, periodo, fecha_vencimiento, monto, moneda, estado)
    SELECT h.id, to_char(v_mes, 'YYYY-MM'),
           CASE WHEN h.dia_cobro IS NULL THEN NULL
                ELSE LEAST(v_mes + (h.dia_cobro - 1), v_ultimo) END,
           h.monto, h.moneda, 'Pendiente'
    FROM herramientas h
    WHERE h.estado = 'Activa' AND h.periodicidad = 'Mensual'
      -- No se generan cobros con vencimiento anterior al alta de la herramienta
      AND LEAST(v_mes + (COALESCE(h.dia_cobro, 31) - 1), v_ultimo)
          >= (h.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
    ON CONFLICT (herramienta_id, periodo) DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_creados := v_creados + v_n;

    -- Anuales que vencen en este mes
    INSERT INTO herramientas_pagos (herramienta_id, periodo, fecha_vencimiento, monto, moneda, estado)
    SELECT h.id, to_char(v_mes, 'YYYY'),
           LEAST(make_date(extract(year FROM v_mes)::int, extract(month FROM h.fecha_vencimiento)::int, 1)
                 + (extract(day FROM h.fecha_vencimiento)::int - 1), v_ultimo),
           h.monto, h.moneda, 'Pendiente'
    FROM herramientas h
    WHERE h.estado = 'Activa' AND h.periodicidad = 'Anual'
      AND h.fecha_vencimiento IS NOT NULL
      AND extract(month FROM h.fecha_vencimiento) = extract(month FROM v_mes)
    ON CONFLICT (herramienta_id, periodo) DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_creados := v_creados + v_n;
  END LOOP;

  -- Vencidos: pendientes con fecha ya pasada
  UPDATE herramientas_pagos
  SET estado = 'Vencido'
  WHERE estado = 'Pendiente' AND fecha_vencimiento IS NOT NULL AND fecha_vencimiento < v_hoy;

  RETURN v_creados;
END;
$$;

REVOKE ALL ON FUNCTION herramientas_generar_pagos(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION herramientas_generar_pagos(date) TO authenticated;

-- ─────────────────────────────────────────────────────
-- Menú: Administración › Consumo herramientas (después de Facturación).
-- El name DEBE coincidir con el submenuName de HomePage.tsx.
-- ─────────────────────────────────────────────────────
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
    RAISE EXCEPTION 'No existe el submenú facturacion (referencia para ubicar Consumo herramientas en Administración).';
  END IF;

  SELECT id INTO v_id FROM submenus WHERE name = 'consumo-herramientas' LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO submenus (name, label, route, menu_id, parent_id, level, order_index, is_active)
    VALUES ('consumo-herramientas', 'Consumo herramientas', '/administracion/consumo-herramientas',
            v_menu_id, v_parent_id, v_level, v_order + 1, true);
  ELSE
    UPDATE submenus
    SET label = 'Consumo herramientas', route = '/administracion/consumo-herramientas',
        menu_id = v_menu_id, parent_id = v_parent_id, level = v_level, is_active = true
    WHERE id = v_id;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────
-- 7) Datos iniciales (solo las que no existen por nombre). Contabo DEV no va: solo queda PRD.
-- ─────────────────────────────────────────────────────
INSERT INTO herramientas (nombre, uso, plan, monto, moneda, periodicidad, dia_cobro, envio_facturas)
SELECT v.nombre, v.uso, v.plan, v.monto, v.moneda, v.periodicidad, v.dia_cobro, 'Pendiente revisar'
FROM (VALUES
  ('Google Workspace', 'Correo y Drive', 'Business Standard', 571.78::numeric, 'USD', 'Mensual', 5::smallint),
  ('Google Cloud (APIs)', 'API Gemini, Maps y bot', NULL, 50, 'USD', 'Por uso', 4),
  ('Contabo PRD', 'Servidor y BD sistema interno PRD', NULL, 11.98, 'USD', 'Mensual', 28),
  ('Slack', 'Comunicación interna', 'Pro + IA', 105, 'USD', 'Mensual', 12),
  ('Anticaptcha API', 'API del bot de multas (recarga manual)', NULL, NULL, 'USD', 'Por uso', NULL),
  ('DocuSeal', 'Firma digital de contratos', NULL, NULL, NULL, NULL, NULL),
  ('2Chat', 'Llamadas a conductores', NULL, NULL, NULL, NULL, NULL),
  ('Sellium (Vantegrate)', 'Atención de leads y clientes', NULL, NULL, NULL, NULL, NULL),
  ('Donweb – toshify.com.ar', 'Dominio', NULL, 20900, 'ARS', 'Anual', NULL),
  ('Donweb – toshify.online', 'Dominio', NULL, 41560, 'ARS', 'Anual', NULL),
  ('Donweb – toshify.store', 'Dominio', NULL, 36490, 'ARS', 'Anual', NULL)
) AS v(nombre, uso, plan, monto, moneda, periodicidad, dia_cobro)
WHERE NOT EXISTS (SELECT 1 FROM herramientas h WHERE h.nombre = v.nombre);

-- Pagos del mes en curso y el siguiente
SELECT herramientas_generar_pagos();

-- ─────────────────────────────────────────────────────
-- 6) Registro del script de alertas (servidor) en Integraciones & Tokens.
--    estado-cron.sh lo marca activo cuando aparece en el crontab
--    (clave: carpeta/main.py).
-- ─────────────────────────────────────────────────────
INSERT INTO cron_jobs (nombre, descripcion, schedule, comando, tipo, integracion, activo, metadata)
SELECT 'Alertas de herramientas',
       'Todos los días a las 9 avisa por correo (y Slack si está configurado) los cobros de herramientas que vencen en los próximos días, los pagos vencidos sin marcar y las herramientas activas sin facturación a GRUPO CG SAS o sin tarjeta cargada. Destinatarios y días en las variables HERRAMIENTAS_ALERTAS_*.',
       '0 9 * * *', 'alertas-herramientas/main.py', 'script', 'sistema', false,
       '{"ubicacion": "servidor"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM cron_jobs WHERE tipo = 'script' AND comando = 'alertas-herramientas/main.py');

UPDATE cron_jobs
SET descripcion = 'Todos los días a las 9 avisa por correo (y Slack si está configurado) los cobros de herramientas que vencen en los próximos días, los pagos vencidos sin marcar y las herramientas activas sin facturación a GRUPO CG SAS o sin tarjeta cargada. Destinatarios y días en las variables HERRAMIENTAS_ALERTAS_*.',
    nombre = 'Alertas de herramientas', updated_at = now()
WHERE tipo = 'script' AND comando = 'alertas-herramientas/main.py';

COMMIT;

-- ─────────────────────────────────────────────────────
-- 5) Tarea diaria en la base: genera los pagos y marca vencidos (03:05 Argentina).
--    Va fuera de la transacción: requiere la extensión pg_cron (ejecutar como
--    supabase_admin). Si pg_cron no está, se puede omitir: la pantalla también
--    genera los pagos al abrir cada mes.
-- ─────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'herramientas-pagos';
    PERFORM cron.schedule('herramientas-pagos', '5 6 * * *', 'SELECT public.herramientas_generar_pagos()');
  END IF;
END $$;

-- Para revisar:
-- SELECT nombre, periodicidad, monto, moneda, dia_cobro FROM herramientas ORDER BY nombre;
-- SELECT h.nombre, p.periodo, p.fecha_vencimiento, p.estado FROM herramientas_pagos p
--   JOIN herramientas h ON h.id = p.herramienta_id ORDER BY p.fecha_vencimiento;
