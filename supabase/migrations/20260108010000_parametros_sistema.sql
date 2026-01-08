-- =====================================================
-- MIGRACIÓN: TABLA PARAMETROS_SISTEMA
-- Fecha: 2026-01-08
-- Descripción: Tabla de parámetros configurables del sistema
-- Soporta múltiples tipos de datos (number, string, boolean, json, date)
-- NOTA: Los precios y valores de facturación están en conceptos_nomina
-- Esta tabla es para configuraciones generales del sistema
-- =====================================================

-- =====================================================
-- 1. CREAR TABLA: parametros_sistema
-- =====================================================
CREATE TABLE IF NOT EXISTS parametros_sistema (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Categorización
  modulo varchar(50) NOT NULL,         -- 'facturacion', 'flota', 'wialon', etc.
  clave varchar(100) NOT NULL,         -- Identificador único dentro del módulo

  -- Valor y tipo
  tipo varchar(20) NOT NULL CHECK (tipo IN ('number', 'string', 'boolean', 'json', 'date')),
  valor text NOT NULL,                 -- Valor almacenado como TEXT, se parsea según tipo

  -- Metadata
  descripcion text,                    -- Descripción del parámetro
  unidad varchar(20),                  -- Unidad de medida (%, días, km, etc.)
  valor_minimo numeric,                -- Validación: valor mínimo (solo para number)
  valor_maximo numeric,                -- Validación: valor máximo (solo para number)

  -- Estado
  activo boolean DEFAULT true,

  -- Auditoría
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),

  -- Restricción de unicidad
  UNIQUE(modulo, clave)
);

COMMENT ON TABLE parametros_sistema IS 'Parámetros configurables del sistema por módulo. Los precios están en conceptos_nomina.';

-- Índices
CREATE INDEX IF NOT EXISTS idx_parametros_sistema_modulo ON parametros_sistema(modulo);
CREATE INDEX IF NOT EXISTS idx_parametros_sistema_activo ON parametros_sistema(activo);

-- =====================================================
-- 2. HABILITAR RLS
-- =====================================================
ALTER TABLE parametros_sistema ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "parametros_sistema_select" ON parametros_sistema FOR SELECT TO authenticated USING (true);
CREATE POLICY "parametros_sistema_insert" ON parametros_sistema FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "parametros_sistema_update" ON parametros_sistema FOR UPDATE TO authenticated USING (true);
CREATE POLICY "parametros_sistema_delete" ON parametros_sistema FOR DELETE TO authenticated USING (true);

-- =====================================================
-- 3. FUNCIONES HELPER
-- =====================================================

-- Obtener parámetro como texto
CREATE OR REPLACE FUNCTION obtener_parametro(
  p_modulo varchar,
  p_clave varchar,
  p_default text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_valor text;
BEGIN
  SELECT valor INTO v_valor
  FROM parametros_sistema
  WHERE modulo = p_modulo
    AND clave = p_clave
    AND activo = true;

  RETURN COALESCE(v_valor, p_default);
END;
$$;

-- Obtener parámetro como número
CREATE OR REPLACE FUNCTION obtener_parametro_number(
  p_modulo varchar,
  p_clave varchar,
  p_default numeric DEFAULT 0
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_valor text;
BEGIN
  SELECT valor INTO v_valor
  FROM parametros_sistema
  WHERE modulo = p_modulo
    AND clave = p_clave
    AND activo = true
    AND tipo = 'number';

  RETURN COALESCE(v_valor::numeric, p_default);
END;
$$;

-- Obtener parámetro como boolean
CREATE OR REPLACE FUNCTION obtener_parametro_boolean(
  p_modulo varchar,
  p_clave varchar,
  p_default boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_valor text;
BEGIN
  SELECT valor INTO v_valor
  FROM parametros_sistema
  WHERE modulo = p_modulo
    AND clave = p_clave
    AND activo = true
    AND tipo = 'boolean';

  IF v_valor IS NULL THEN
    RETURN p_default;
  END IF;

  RETURN v_valor = 'true';
END;
$$;

-- Obtener parámetro como JSON
CREATE OR REPLACE FUNCTION obtener_parametro_json(
  p_modulo varchar,
  p_clave varchar,
  p_default jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_valor text;
BEGIN
  SELECT valor INTO v_valor
  FROM parametros_sistema
  WHERE modulo = p_modulo
    AND clave = p_clave
    AND activo = true
    AND tipo = 'json';

  IF v_valor IS NULL THEN
    RETURN p_default;
  END IF;

  RETURN v_valor::jsonb;
END;
$$;

-- =====================================================
-- FIN DE LA MIGRACIÓN
-- =====================================================
