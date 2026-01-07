-- =====================================================
-- MIGRACIÓN: MÓDULO DE FACTURACIÓN
-- Fecha: 2026-01-07
-- Descripción: Crea las tablas necesarias para el módulo de facturación
-- IMPORTANTE: NO modifica tablas existentes (conceptos_nomina se mantiene)
-- =====================================================

-- =====================================================
-- 1. CREAR TABLA: periodos_facturacion
-- =====================================================
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

COMMENT ON TABLE periodos_facturacion IS 'Períodos semanales de facturación (lunes a domingo)';

-- Índices para periodos_facturacion
CREATE INDEX IF NOT EXISTS idx_periodos_facturacion_semana_anio ON periodos_facturacion(semana, anio);
CREATE INDEX IF NOT EXISTS idx_periodos_facturacion_estado ON periodos_facturacion(estado);
CREATE INDEX IF NOT EXISTS idx_periodos_facturacion_fechas ON periodos_facturacion(fecha_inicio, fecha_fin);

-- =====================================================
-- 2. CREAR TABLA: facturacion_conductores
-- =====================================================
CREATE TABLE IF NOT EXISTS facturacion_conductores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_id uuid NOT NULL REFERENCES periodos_facturacion(id) ON DELETE CASCADE,
  conductor_id uuid NOT NULL REFERENCES conductores(id),

  -- Identificación
  conductor_nombre varchar(255),
  conductor_dni varchar(20),
  conductor_cuit varchar(20),
  vehiculo_id uuid REFERENCES vehiculos(id),
  vehiculo_patente varchar(20),

  -- Tipo de alquiler
  tipo_alquiler varchar(10) NOT NULL CHECK (tipo_alquiler IN ('CARGO', 'TURNO')),

  -- Turnos
  turnos_base integer DEFAULT 7,
  turnos_cobrados numeric NOT NULL DEFAULT 7,
  factor_proporcional numeric DEFAULT 1.0,

  -- Totales
  subtotal_alquiler numeric DEFAULT 0,
  subtotal_garantia numeric DEFAULT 0,
  subtotal_cargos numeric DEFAULT 0,
  subtotal_descuentos numeric DEFAULT 0,
  subtotal_neto numeric DEFAULT 0,

  -- Saldos y mora
  saldo_anterior numeric DEFAULT 0,
  dias_mora integer DEFAULT 0,
  monto_mora numeric DEFAULT 0,

  -- Total final
  total_a_pagar numeric DEFAULT 0,

  -- Estado
  estado varchar(20) DEFAULT 'borrador' CHECK (estado IN ('borrador', 'calculado', 'cerrado', 'pagado')),

  -- Auditoría
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),

  UNIQUE(periodo_id, conductor_id)
);

COMMENT ON TABLE facturacion_conductores IS 'Facturación semanal por conductor';

-- Índices para facturacion_conductores
CREATE INDEX IF NOT EXISTS idx_facturacion_conductores_periodo ON facturacion_conductores(periodo_id);
CREATE INDEX IF NOT EXISTS idx_facturacion_conductores_conductor ON facturacion_conductores(conductor_id);
CREATE INDEX IF NOT EXISTS idx_facturacion_conductores_estado ON facturacion_conductores(estado);
CREATE INDEX IF NOT EXISTS idx_facturacion_conductores_tipo ON facturacion_conductores(tipo_alquiler);

-- =====================================================
-- 3. CREAR TABLA: facturacion_detalle
-- =====================================================
CREATE TABLE IF NOT EXISTS facturacion_detalle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facturacion_id uuid NOT NULL REFERENCES facturacion_conductores(id) ON DELETE CASCADE,
  concepto_id uuid REFERENCES conceptos_nomina(id), -- Referencia a tabla existente

  -- Información del concepto
  concepto_codigo varchar(20) NOT NULL,
  concepto_descripcion varchar(255) NOT NULL,

  -- Cálculo
  cantidad numeric DEFAULT 1,
  precio_unitario numeric NOT NULL,
  subtotal numeric NOT NULL,
  iva_porcentaje numeric DEFAULT 0,
  iva_monto numeric DEFAULT 0,
  total numeric NOT NULL,

  -- Tipo
  es_descuento boolean DEFAULT false,

  -- Descripción adicional
  descripcion text,

  -- Referencia a origen (penalidad, siniestro, ticket, etc.)
  referencia_id uuid,
  referencia_tipo varchar(50), -- 'penalidad', 'siniestro', 'ticket_favor', 'telepeaje', 'exceso_km'

  -- Auditoría
  created_at timestamp with time zone DEFAULT now()
);

COMMENT ON TABLE facturacion_detalle IS 'Detalle de líneas de facturación por conductor';

-- Índices para facturacion_detalle
CREATE INDEX IF NOT EXISTS idx_facturacion_detalle_facturacion ON facturacion_detalle(facturacion_id);
CREATE INDEX IF NOT EXISTS idx_facturacion_detalle_concepto ON facturacion_detalle(concepto_id);
CREATE INDEX IF NOT EXISTS idx_facturacion_detalle_referencia ON facturacion_detalle(referencia_tipo, referencia_id);

-- =====================================================
-- 4. CREAR TABLA: garantias_conductores
-- =====================================================
CREATE TABLE IF NOT EXISTS garantias_conductores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conductor_id uuid NOT NULL REFERENCES conductores(id) UNIQUE,

  -- Información del conductor (denormalizada para reportes)
  conductor_nombre varchar(255),
  conductor_dni varchar(20),
  conductor_cuit varchar(20),

  -- Tipo y montos
  tipo_alquiler varchar(10) NOT NULL CHECK (tipo_alquiler IN ('CARGO', 'TURNO')),
  monto_total numeric NOT NULL, -- 1,000,000 para CARGO, 800,000 para TURNO
  monto_cuota_semanal numeric DEFAULT 50000,

  -- Cuotas
  cuotas_totales integer NOT NULL, -- 20 para CARGO, 16 para TURNO (puede extenderse)
  cuotas_pagadas integer DEFAULT 0,

  -- Montos
  monto_pagado numeric DEFAULT 0,

  -- Estado: pendiente, en_curso, completada, cancelada, suspendida
  estado varchar(20) DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_curso', 'completada', 'cancelada', 'suspendida')),

  -- Fechas
  fecha_inicio date,
  fecha_completada date,

  -- Auditoría
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  created_by_name text
);

COMMENT ON TABLE garantias_conductores IS 'Registro de garantías por conductor con tracking de cuotas';

-- Índices para garantias_conductores
CREATE INDEX IF NOT EXISTS idx_garantias_conductores_conductor ON garantias_conductores(conductor_id);
CREATE INDEX IF NOT EXISTS idx_garantias_conductores_estado ON garantias_conductores(estado);
CREATE INDEX IF NOT EXISTS idx_garantias_conductores_tipo ON garantias_conductores(tipo_alquiler);

-- =====================================================
-- 5. CREAR TABLA: garantias_pagos
-- =====================================================
CREATE TABLE IF NOT EXISTS garantias_pagos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  garantia_id uuid NOT NULL REFERENCES garantias_conductores(id) ON DELETE CASCADE,
  conductor_id uuid REFERENCES conductores(id),

  -- Cuota
  numero_cuota integer NOT NULL,

  -- Montos
  monto numeric NOT NULL,

  -- Fecha y referencia
  fecha_pago timestamp with time zone DEFAULT now(),
  referencia varchar(255),

  -- Auditoría
  created_at timestamp with time zone DEFAULT now()
);

COMMENT ON TABLE garantias_pagos IS 'Historial de pagos de garantía';

-- Índices para garantias_pagos
CREATE INDEX IF NOT EXISTS idx_garantias_pagos_garantia ON garantias_pagos(garantia_id);
CREATE INDEX IF NOT EXISTS idx_garantias_pagos_conductor ON garantias_pagos(conductor_id);

-- =====================================================
-- 6. CREAR TABLA: saldos_conductores
-- =====================================================
CREATE TABLE IF NOT EXISTS saldos_conductores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conductor_id uuid NOT NULL REFERENCES conductores(id) UNIQUE,

  -- Información del conductor (denormalizada)
  conductor_nombre varchar(255),
  conductor_dni varchar(20),
  conductor_cuit varchar(20),

  -- Saldo actual (positivo = a favor, negativo = deuda)
  saldo_actual numeric DEFAULT 0,

  -- Mora
  dias_mora integer DEFAULT 0,
  monto_mora_acumulada numeric DEFAULT 0,

  -- Última actualización
  ultima_actualizacion timestamp with time zone DEFAULT now(),

  -- Auditoría
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

COMMENT ON TABLE saldos_conductores IS 'Saldo actual por conductor con cálculo de mora';

-- Índices para saldos_conductores
CREATE INDEX IF NOT EXISTS idx_saldos_conductores_conductor ON saldos_conductores(conductor_id);
CREATE INDEX IF NOT EXISTS idx_saldos_conductores_saldo ON saldos_conductores(saldo_actual);

-- =====================================================
-- 7. CREAR TABLA: abonos_conductores
-- =====================================================
CREATE TABLE IF NOT EXISTS abonos_conductores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conductor_id uuid NOT NULL REFERENCES conductores(id),

  -- Tipo de movimiento: abono (suma a favor) o cargo (suma deuda)
  tipo varchar(10) NOT NULL CHECK (tipo IN ('abono', 'cargo')),

  -- Monto (siempre positivo, el tipo determina si suma o resta)
  monto numeric NOT NULL CHECK (monto > 0),

  -- Concepto y referencia
  concepto varchar(255) NOT NULL,
  referencia varchar(255),

  -- Fecha del movimiento
  fecha_abono timestamp with time zone DEFAULT now(),

  -- Auditoría
  created_by uuid REFERENCES auth.users(id),
  created_by_name text,
  created_at timestamp with time zone DEFAULT now()
);

COMMENT ON TABLE abonos_conductores IS 'Registro de movimientos de saldo (abonos y cargos)';

-- Índices para abonos_conductores
CREATE INDEX IF NOT EXISTS idx_abonos_conductores_conductor ON abonos_conductores(conductor_id);
CREATE INDEX IF NOT EXISTS idx_abonos_conductores_tipo ON abonos_conductores(tipo);
CREATE INDEX IF NOT EXISTS idx_abonos_conductores_fecha ON abonos_conductores(fecha_abono);

-- =====================================================
-- 8. CREAR TABLA: tickets_favor
-- =====================================================
CREATE TABLE IF NOT EXISTS tickets_favor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conductor_id uuid NOT NULL REFERENCES conductores(id),

  -- Información del conductor (denormalizada)
  conductor_nombre varchar(255),
  conductor_dni varchar(20),

  -- Tipo de ticket
  tipo varchar(30) NOT NULL CHECK (tipo IN (
    'BONO_5_VENTAS',
    'BONO_EVENTO',
    'TICKET_PEAJE',
    'COMISION_REFERIDO',
    'REPARACION_CONDUCTOR'
  )),

  -- Información
  descripcion text,
  monto numeric NOT NULL CHECK (monto > 0),

  -- Comprobante
  comprobante_url text,

  -- Estado del workflow: pendiente -> aprobado/rechazado -> aplicado
  estado varchar(20) DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobado', 'rechazado', 'aplicado')),

  -- Fechas de workflow
  fecha_solicitud timestamp with time zone DEFAULT now(),
  fecha_aprobacion timestamp with time zone,
  fecha_aplicacion timestamp with time zone,

  -- Si fue rechazado
  motivo_rechazo text,

  -- Período donde se aplicó
  periodo_aplicado_id uuid REFERENCES periodos_facturacion(id),

  -- Auditoría
  created_by uuid REFERENCES auth.users(id),
  created_by_name text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

COMMENT ON TABLE tickets_favor IS 'Tickets a favor del conductor (P004) - descuentos en facturación';

-- Índices para tickets_favor
CREATE INDEX IF NOT EXISTS idx_tickets_favor_conductor ON tickets_favor(conductor_id);
CREATE INDEX IF NOT EXISTS idx_tickets_favor_tipo ON tickets_favor(tipo);
CREATE INDEX IF NOT EXISTS idx_tickets_favor_estado ON tickets_favor(estado);
CREATE INDEX IF NOT EXISTS idx_tickets_favor_periodo ON tickets_favor(periodo_aplicado_id);

-- =====================================================
-- 9. CREAR TABLA: excesos_kilometraje
-- =====================================================
CREATE TABLE IF NOT EXISTS excesos_kilometraje (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conductor_id uuid NOT NULL REFERENCES conductores(id),
  vehiculo_id uuid REFERENCES vehiculos(id),
  periodo_id uuid NOT NULL REFERENCES periodos_facturacion(id),

  -- Kilometraje
  km_recorridos numeric NOT NULL,
  km_base numeric DEFAULT 1800,
  km_exceso numeric NOT NULL,

  -- Cálculo
  rango varchar(20) NOT NULL, -- '1-50', '50-100', '100-150', '150-200', '>200'
  porcentaje numeric NOT NULL, -- 15, 20, 25, 35
  valor_alquiler numeric NOT NULL, -- valor del alquiler semanal usado como base

  -- Montos
  monto_base numeric NOT NULL,
  iva_porcentaje numeric DEFAULT 21,
  iva_monto numeric NOT NULL,
  monto_total numeric NOT NULL,

  -- Estado
  aplicado boolean DEFAULT false,
  fecha_aplicacion date,

  -- Auditoría
  created_at timestamp with time zone DEFAULT now(),

  UNIQUE(conductor_id, periodo_id)
);

COMMENT ON TABLE excesos_kilometraje IS 'Cálculo de exceso de kilometraje semanal (P006)';

-- Índices para excesos_kilometraje
CREATE INDEX IF NOT EXISTS idx_excesos_km_conductor ON excesos_kilometraje(conductor_id);
CREATE INDEX IF NOT EXISTS idx_excesos_km_periodo ON excesos_kilometraje(periodo_id);
CREATE INDEX IF NOT EXISTS idx_excesos_km_aplicado ON excesos_kilometraje(aplicado);

-- =====================================================
-- 10. AGREGAR COLUMNA periodo_id a penalidades (si no existe)
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'penalidades' AND column_name = 'periodo_id'
  ) THEN
    ALTER TABLE penalidades ADD COLUMN periodo_id uuid REFERENCES periodos_facturacion(id);
  END IF;
END $$;

-- =====================================================
-- 11. HABILITAR RLS EN TODAS LAS TABLAS NUEVAS
-- =====================================================
ALTER TABLE periodos_facturacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturacion_conductores ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturacion_detalle ENABLE ROW LEVEL SECURITY;
ALTER TABLE garantias_conductores ENABLE ROW LEVEL SECURITY;
ALTER TABLE garantias_pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE saldos_conductores ENABLE ROW LEVEL SECURITY;
ALTER TABLE abonos_conductores ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets_favor ENABLE ROW LEVEL SECURITY;
ALTER TABLE excesos_kilometraje ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 12. CREAR POLÍTICAS RLS BÁSICAS (todos los usuarios autenticados)
-- =====================================================

-- Políticas para periodos_facturacion
CREATE POLICY "periodos_facturacion_select" ON periodos_facturacion FOR SELECT TO authenticated USING (true);
CREATE POLICY "periodos_facturacion_insert" ON periodos_facturacion FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "periodos_facturacion_update" ON periodos_facturacion FOR UPDATE TO authenticated USING (true);
CREATE POLICY "periodos_facturacion_delete" ON periodos_facturacion FOR DELETE TO authenticated USING (true);

-- Políticas para facturacion_conductores
CREATE POLICY "facturacion_conductores_select" ON facturacion_conductores FOR SELECT TO authenticated USING (true);
CREATE POLICY "facturacion_conductores_insert" ON facturacion_conductores FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "facturacion_conductores_update" ON facturacion_conductores FOR UPDATE TO authenticated USING (true);
CREATE POLICY "facturacion_conductores_delete" ON facturacion_conductores FOR DELETE TO authenticated USING (true);

-- Políticas para facturacion_detalle
CREATE POLICY "facturacion_detalle_select" ON facturacion_detalle FOR SELECT TO authenticated USING (true);
CREATE POLICY "facturacion_detalle_insert" ON facturacion_detalle FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "facturacion_detalle_update" ON facturacion_detalle FOR UPDATE TO authenticated USING (true);
CREATE POLICY "facturacion_detalle_delete" ON facturacion_detalle FOR DELETE TO authenticated USING (true);

-- Políticas para garantias_conductores
CREATE POLICY "garantias_conductores_select" ON garantias_conductores FOR SELECT TO authenticated USING (true);
CREATE POLICY "garantias_conductores_insert" ON garantias_conductores FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "garantias_conductores_update" ON garantias_conductores FOR UPDATE TO authenticated USING (true);
CREATE POLICY "garantias_conductores_delete" ON garantias_conductores FOR DELETE TO authenticated USING (true);

-- Políticas para garantias_pagos
CREATE POLICY "garantias_pagos_select" ON garantias_pagos FOR SELECT TO authenticated USING (true);
CREATE POLICY "garantias_pagos_insert" ON garantias_pagos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "garantias_pagos_update" ON garantias_pagos FOR UPDATE TO authenticated USING (true);
CREATE POLICY "garantias_pagos_delete" ON garantias_pagos FOR DELETE TO authenticated USING (true);

-- Políticas para saldos_conductores
CREATE POLICY "saldos_conductores_select" ON saldos_conductores FOR SELECT TO authenticated USING (true);
CREATE POLICY "saldos_conductores_insert" ON saldos_conductores FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "saldos_conductores_update" ON saldos_conductores FOR UPDATE TO authenticated USING (true);
CREATE POLICY "saldos_conductores_delete" ON saldos_conductores FOR DELETE TO authenticated USING (true);

-- Políticas para abonos_conductores
CREATE POLICY "abonos_conductores_select" ON abonos_conductores FOR SELECT TO authenticated USING (true);
CREATE POLICY "abonos_conductores_insert" ON abonos_conductores FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "abonos_conductores_update" ON abonos_conductores FOR UPDATE TO authenticated USING (true);
CREATE POLICY "abonos_conductores_delete" ON abonos_conductores FOR DELETE TO authenticated USING (true);

-- Políticas para tickets_favor
CREATE POLICY "tickets_favor_select" ON tickets_favor FOR SELECT TO authenticated USING (true);
CREATE POLICY "tickets_favor_insert" ON tickets_favor FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tickets_favor_update" ON tickets_favor FOR UPDATE TO authenticated USING (true);
CREATE POLICY "tickets_favor_delete" ON tickets_favor FOR DELETE TO authenticated USING (true);

-- Políticas para excesos_kilometraje
CREATE POLICY "excesos_kilometraje_select" ON excesos_kilometraje FOR SELECT TO authenticated USING (true);
CREATE POLICY "excesos_kilometraje_insert" ON excesos_kilometraje FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "excesos_kilometraje_update" ON excesos_kilometraje FOR UPDATE TO authenticated USING (true);
CREATE POLICY "excesos_kilometraje_delete" ON excesos_kilometraje FOR DELETE TO authenticated USING (true);

-- =====================================================
-- FIN DE LA MIGRACIÓN
-- =====================================================
