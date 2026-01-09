-- =====================================================
-- SCRIPT DE CREACIÓN - MÓDULO DE FACTURACIÓN
-- Ejecutar este script COMPLETO en Supabase SQL Editor
-- Fecha: 2026-01-07
-- =====================================================

-- 1. PERÍODOS DE FACTURACIÓN
CREATE TABLE IF NOT EXISTS periodos_facturacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  semana integer NOT NULL,
  anio integer NOT NULL,
  fecha_inicio date NOT NULL,
  fecha_fin date NOT NULL,
  estado varchar(20) DEFAULT 'abierto' CHECK (estado IN ('abierto', 'cerrado', 'procesando')),
  fecha_cierre timestamp with time zone,
  total_conductores integer DEFAULT 0,
  total_cargos numeric DEFAULT 0,
  total_descuentos numeric DEFAULT 0,
  total_neto numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  created_by_name text,
  cerrado_por uuid REFERENCES auth.users(id),
  cerrado_por_name text,
  UNIQUE(semana, anio)
);

CREATE INDEX IF NOT EXISTS idx_periodos_facturacion_semana_anio ON periodos_facturacion(semana, anio);
CREATE INDEX IF NOT EXISTS idx_periodos_facturacion_estado ON periodos_facturacion(estado);

-- 2. FACTURACIÓN POR CONDUCTOR
CREATE TABLE IF NOT EXISTS facturacion_conductores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_id uuid NOT NULL REFERENCES periodos_facturacion(id) ON DELETE CASCADE,
  conductor_id uuid NOT NULL REFERENCES conductores(id),
  conductor_nombre varchar(255),
  conductor_dni varchar(20),
  conductor_cuit varchar(20),
  vehiculo_id uuid REFERENCES vehiculos(id),
  vehiculo_patente varchar(20),
  tipo_alquiler varchar(10) NOT NULL CHECK (tipo_alquiler IN ('CARGO', 'TURNO')),
  turnos_base integer DEFAULT 7,
  turnos_cobrados numeric NOT NULL DEFAULT 7,
  factor_proporcional numeric DEFAULT 1.0,
  subtotal_alquiler numeric DEFAULT 0,
  subtotal_garantia numeric DEFAULT 0,
  subtotal_cargos numeric DEFAULT 0,
  subtotal_descuentos numeric DEFAULT 0,
  subtotal_neto numeric DEFAULT 0,
  saldo_anterior numeric DEFAULT 0,
  dias_mora integer DEFAULT 0,
  monto_mora numeric DEFAULT 0,
  total_a_pagar numeric DEFAULT 0,
  estado varchar(20) DEFAULT 'borrador' CHECK (estado IN ('borrador', 'calculado', 'cerrado', 'pagado')),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(periodo_id, conductor_id)
);

CREATE INDEX IF NOT EXISTS idx_facturacion_conductores_periodo ON facturacion_conductores(periodo_id);
CREATE INDEX IF NOT EXISTS idx_facturacion_conductores_conductor ON facturacion_conductores(conductor_id);

-- 3. DETALLE DE FACTURACIÓN
CREATE TABLE IF NOT EXISTS facturacion_detalle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facturacion_id uuid NOT NULL REFERENCES facturacion_conductores(id) ON DELETE CASCADE,
  concepto_id uuid REFERENCES conceptos_nomina(id),
  concepto_codigo varchar(20) NOT NULL,
  concepto_descripcion varchar(255) NOT NULL,
  cantidad numeric DEFAULT 1,
  precio_unitario numeric NOT NULL,
  subtotal numeric NOT NULL,
  iva_porcentaje numeric DEFAULT 0,
  iva_monto numeric DEFAULT 0,
  total numeric NOT NULL,
  es_descuento boolean DEFAULT false,
  descripcion text,
  referencia_id uuid,
  referencia_tipo varchar(50),
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_facturacion_detalle_facturacion ON facturacion_detalle(facturacion_id);

-- 4. GARANTÍAS DE CONDUCTORES
CREATE TABLE IF NOT EXISTS garantias_conductores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conductor_id uuid NOT NULL REFERENCES conductores(id) UNIQUE,
  conductor_nombre varchar(255),
  conductor_dni varchar(20),
  conductor_cuit varchar(20),
  tipo_alquiler varchar(10) NOT NULL CHECK (tipo_alquiler IN ('CARGO', 'TURNO')),
  monto_total numeric NOT NULL,
  monto_cuota_semanal numeric DEFAULT 50000,
  cuotas_totales integer NOT NULL,
  cuotas_pagadas integer DEFAULT 0,
  monto_pagado numeric DEFAULT 0,
  estado varchar(20) DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_curso', 'completada', 'cancelada', 'suspendida')),
  fecha_inicio date,
  fecha_completada date,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  created_by_name text
);

CREATE INDEX IF NOT EXISTS idx_garantias_conductores_conductor ON garantias_conductores(conductor_id);
CREATE INDEX IF NOT EXISTS idx_garantias_conductores_estado ON garantias_conductores(estado);

-- 5. PAGOS DE GARANTÍA
CREATE TABLE IF NOT EXISTS garantias_pagos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  garantia_id uuid NOT NULL REFERENCES garantias_conductores(id) ON DELETE CASCADE,
  conductor_id uuid REFERENCES conductores(id),
  numero_cuota integer NOT NULL,
  monto numeric NOT NULL,
  fecha_pago timestamp with time zone DEFAULT now(),
  referencia varchar(255),
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_garantias_pagos_garantia ON garantias_pagos(garantia_id);

-- 6. SALDOS DE CONDUCTORES
CREATE TABLE IF NOT EXISTS saldos_conductores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conductor_id uuid NOT NULL REFERENCES conductores(id) UNIQUE,
  conductor_nombre varchar(255),
  conductor_dni varchar(20),
  conductor_cuit varchar(20),
  saldo_actual numeric DEFAULT 0,
  dias_mora integer DEFAULT 0,
  monto_mora_acumulada numeric DEFAULT 0,
  ultima_actualizacion timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saldos_conductores_conductor ON saldos_conductores(conductor_id);

-- 7. ABONOS DE CONDUCTORES
CREATE TABLE IF NOT EXISTS abonos_conductores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conductor_id uuid NOT NULL REFERENCES conductores(id),
  tipo varchar(10) NOT NULL CHECK (tipo IN ('abono', 'cargo')),
  monto numeric NOT NULL CHECK (monto > 0),
  concepto varchar(255) NOT NULL,
  referencia varchar(255),
  fecha_abono timestamp with time zone DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  created_by_name text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_abonos_conductores_conductor ON abonos_conductores(conductor_id);

-- 8. TICKETS A FAVOR
CREATE TABLE IF NOT EXISTS tickets_favor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conductor_id uuid NOT NULL REFERENCES conductores(id),
  conductor_nombre varchar(255),
  conductor_dni varchar(20),
  tipo varchar(30) NOT NULL CHECK (tipo IN (
    'BONO_5_VENTAS',
    'BONO_EVENTO',
    'TICKET_PEAJE',
    'COMISION_REFERIDO',
    'REPARACION_CONDUCTOR'
  )),
  descripcion text,
  monto numeric NOT NULL CHECK (monto > 0),
  comprobante_url text,
  estado varchar(20) DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobado', 'rechazado', 'aplicado')),
  fecha_solicitud timestamp with time zone DEFAULT now(),
  fecha_aprobacion timestamp with time zone,
  fecha_aplicacion timestamp with time zone,
  motivo_rechazo text,
  periodo_aplicado_id uuid REFERENCES periodos_facturacion(id),
  created_by uuid REFERENCES auth.users(id),
  created_by_name text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tickets_favor_conductor ON tickets_favor(conductor_id);
CREATE INDEX IF NOT EXISTS idx_tickets_favor_estado ON tickets_favor(estado);

-- 9. EXCESOS DE KILOMETRAJE
CREATE TABLE IF NOT EXISTS excesos_kilometraje (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conductor_id uuid NOT NULL REFERENCES conductores(id),
  vehiculo_id uuid REFERENCES vehiculos(id),
  periodo_id uuid NOT NULL REFERENCES periodos_facturacion(id),
  km_recorridos numeric NOT NULL,
  km_base numeric DEFAULT 1800,
  km_exceso numeric NOT NULL,
  rango varchar(20) NOT NULL,
  porcentaje numeric NOT NULL,
  valor_alquiler numeric NOT NULL,
  monto_base numeric NOT NULL,
  iva_porcentaje numeric DEFAULT 21,
  iva_monto numeric NOT NULL,
  monto_total numeric NOT NULL,
  aplicado boolean DEFAULT false,
  fecha_aplicacion date,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(conductor_id, periodo_id)
);

CREATE INDEX IF NOT EXISTS idx_excesos_km_periodo ON excesos_kilometraje(periodo_id);

-- 10. HABILITAR RLS
ALTER TABLE periodos_facturacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturacion_conductores ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturacion_detalle ENABLE ROW LEVEL SECURITY;
ALTER TABLE garantias_conductores ENABLE ROW LEVEL SECURITY;
ALTER TABLE garantias_pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE saldos_conductores ENABLE ROW LEVEL SECURITY;
ALTER TABLE abonos_conductores ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets_favor ENABLE ROW LEVEL SECURITY;
ALTER TABLE excesos_kilometraje ENABLE ROW LEVEL SECURITY;

-- 11. POLÍTICAS RLS (acceso para usuarios autenticados)
DO $$
DECLARE
  tables text[] := ARRAY[
    'periodos_facturacion',
    'facturacion_conductores',
    'facturacion_detalle',
    'garantias_conductores',
    'garantias_pagos',
    'saldos_conductores',
    'abonos_conductores',
    'tickets_favor',
    'excesos_kilometraje'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    -- Drop existing policies if they exist
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_insert ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_update ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_delete ON %I', t, t);

    -- Create new policies
    EXECUTE format('CREATE POLICY %I_select ON %I FOR SELECT TO authenticated USING (true)', t, t);
    EXECUTE format('CREATE POLICY %I_insert ON %I FOR INSERT TO authenticated WITH CHECK (true)', t, t);
    EXECUTE format('CREATE POLICY %I_update ON %I FOR UPDATE TO authenticated USING (true)', t, t);
    EXECUTE format('CREATE POLICY %I_delete ON %I FOR DELETE TO authenticated USING (true)', t, t);
  END LOOP;
END $$;

-- =====================================================
-- FIN DEL SCRIPT - Las tablas están creadas
-- =====================================================
SELECT 'TABLAS DE FACTURACIÓN CREADAS EXITOSAMENTE' AS resultado;
