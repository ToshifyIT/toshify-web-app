-- Sistema de Auditoría para Toshify
-- Ejecutar en Supabase SQL Editor

-- Tabla principal de auditoría
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tabla character varying NOT NULL,
  registro_id uuid,
  accion character varying NOT NULL CHECK (accion IN ('INSERT', 'UPDATE', 'DELETE')),
  datos_anteriores jsonb,
  datos_nuevos jsonb,
  campos_modificados text[],
  usuario_id uuid,
  usuario_nombre character varying,
  usuario_email character varying,
  ip_address character varying,
  user_agent text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT audit_log_pkey PRIMARY KEY (id)
);

-- Índices para mejor rendimiento
CREATE INDEX IF NOT EXISTS idx_audit_log_tabla ON public.audit_log(tabla);
CREATE INDEX IF NOT EXISTS idx_audit_log_registro_id ON public.audit_log(registro_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_usuario_id ON public.audit_log(usuario_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_accion ON public.audit_log(accion);

-- Función genérica para registrar auditoría
CREATE OR REPLACE FUNCTION public.audit_trigger_func()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_data jsonb;
  new_data jsonb;
  changed_fields text[];
  current_user_id uuid;
  current_user_name text;
  current_user_email text;
  key_name text;
  record_id uuid;
BEGIN
  -- Obtener información del usuario actual desde la sesión de Supabase
  BEGIN
    current_user_id := auth.uid();
    SELECT full_name, email INTO current_user_name, current_user_email
    FROM public.user_profiles WHERE id = current_user_id;
  EXCEPTION WHEN OTHERS THEN
    current_user_id := NULL;
    current_user_name := 'Sistema';
    current_user_email := NULL;
  END;

  -- Determinar la acción y preparar los datos
  IF TG_OP = 'INSERT' THEN
    new_data := to_jsonb(NEW);
    old_data := NULL;
    record_id := NEW.id;
    changed_fields := NULL;

  ELSIF TG_OP = 'UPDATE' THEN
    old_data := to_jsonb(OLD);
    new_data := to_jsonb(NEW);
    record_id := NEW.id;

    -- Detectar campos modificados
    changed_fields := ARRAY(
      SELECT key
      FROM jsonb_each(old_data) AS o(key, value)
      WHERE NOT EXISTS (
        SELECT 1 FROM jsonb_each(new_data) AS n(key, value)
        WHERE n.key = o.key AND n.value = o.value
      )
      AND o.key NOT IN ('updated_at', 'updated_by')
    );

    -- Si no hay cambios reales, no registrar
    IF array_length(changed_fields, 1) IS NULL OR array_length(changed_fields, 1) = 0 THEN
      RETURN NEW;
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    old_data := to_jsonb(OLD);
    new_data := NULL;
    record_id := OLD.id;
    changed_fields := NULL;
  END IF;

  -- Insertar registro de auditoría
  INSERT INTO public.audit_log (
    tabla,
    registro_id,
    accion,
    datos_anteriores,
    datos_nuevos,
    campos_modificados,
    usuario_id,
    usuario_nombre,
    usuario_email
  ) VALUES (
    TG_TABLE_NAME,
    record_id,
    TG_OP,
    old_data,
    new_data,
    changed_fields,
    current_user_id,
    current_user_name,
    current_user_email
  );

  -- Retornar el registro apropiado
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- Crear triggers para las tablas principales
-- CONDUCTORES
DROP TRIGGER IF EXISTS audit_conductores ON public.conductores;
CREATE TRIGGER audit_conductores
  AFTER INSERT OR UPDATE OR DELETE ON public.conductores
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- VEHICULOS
DROP TRIGGER IF EXISTS audit_vehiculos ON public.vehiculos;
CREATE TRIGGER audit_vehiculos
  AFTER INSERT OR UPDATE OR DELETE ON public.vehiculos
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- ASIGNACIONES
DROP TRIGGER IF EXISTS audit_asignaciones ON public.asignaciones;
CREATE TRIGGER audit_asignaciones
  AFTER INSERT OR UPDATE OR DELETE ON public.asignaciones
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- INCIDENCIAS
DROP TRIGGER IF EXISTS audit_incidencias ON public.incidencias;
CREATE TRIGGER audit_incidencias
  AFTER INSERT OR UPDATE OR DELETE ON public.incidencias
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- PENALIDADES
DROP TRIGGER IF EXISTS audit_penalidades ON public.penalidades;
CREATE TRIGGER audit_penalidades
  AFTER INSERT OR UPDATE OR DELETE ON public.penalidades
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- SINIESTROS
DROP TRIGGER IF EXISTS audit_siniestros ON public.siniestros;
CREATE TRIGGER audit_siniestros
  AFTER INSERT OR UPDATE OR DELETE ON public.siniestros
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- PRODUCTOS
DROP TRIGGER IF EXISTS audit_productos ON public.productos;
CREATE TRIGGER audit_productos
  AFTER INSERT OR UPDATE OR DELETE ON public.productos
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- INVENTARIO
DROP TRIGGER IF EXISTS audit_inventario ON public.inventario;
CREATE TRIGGER audit_inventario
  AFTER INSERT OR UPDATE OR DELETE ON public.inventario
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- MOVIMIENTOS
DROP TRIGGER IF EXISTS audit_movimientos ON public.movimientos;
CREATE TRIGGER audit_movimientos
  AFTER INSERT OR UPDATE OR DELETE ON public.movimientos
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- FACTURACION_CONDUCTORES
DROP TRIGGER IF EXISTS audit_facturacion_conductores ON public.facturacion_conductores;
CREATE TRIGGER audit_facturacion_conductores
  AFTER INSERT OR UPDATE OR DELETE ON public.facturacion_conductores
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- GARANTIAS_CONDUCTORES
DROP TRIGGER IF EXISTS audit_garantias_conductores ON public.garantias_conductores;
CREATE TRIGGER audit_garantias_conductores
  AFTER INSERT OR UPDATE OR DELETE ON public.garantias_conductores
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- CONCEPTOS_NOMINA
DROP TRIGGER IF EXISTS audit_conceptos_nomina ON public.conceptos_nomina;
CREATE TRIGGER audit_conceptos_nomina
  AFTER INSERT OR UPDATE OR DELETE ON public.conceptos_nomina
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- PERIODOS_FACTURACION
DROP TRIGGER IF EXISTS audit_periodos_facturacion ON public.periodos_facturacion;
CREATE TRIGGER audit_periodos_facturacion
  AFTER INSERT OR UPDATE OR DELETE ON public.periodos_facturacion
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- USER_PROFILES
DROP TRIGGER IF EXISTS audit_user_profiles ON public.user_profiles;
CREATE TRIGGER audit_user_profiles
  AFTER INSERT OR UPDATE OR DELETE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- ROLES
DROP TRIGGER IF EXISTS audit_roles ON public.roles;
CREATE TRIGGER audit_roles
  AFTER INSERT OR UPDATE OR DELETE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- PROVEEDORES
DROP TRIGGER IF EXISTS audit_proveedores ON public.proveedores;
CREATE TRIGGER audit_proveedores
  AFTER INSERT OR UPDATE OR DELETE ON public.proveedores
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- ABONOS_CONDUCTORES
DROP TRIGGER IF EXISTS audit_abonos_conductores ON public.abonos_conductores;
CREATE TRIGGER audit_abonos_conductores
  AFTER INSERT OR UPDATE OR DELETE ON public.abonos_conductores
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- TICKETS_FAVOR
DROP TRIGGER IF EXISTS audit_tickets_favor ON public.tickets_favor;
CREATE TRIGGER audit_tickets_favor
  AFTER INSERT OR UPDATE OR DELETE ON public.tickets_favor
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- Dar permisos de lectura a usuarios autenticados
GRANT SELECT ON public.audit_log TO authenticated;

-- Comentario de la tabla
COMMENT ON TABLE public.audit_log IS 'Registro de auditoría de cambios en las tablas principales del sistema';
