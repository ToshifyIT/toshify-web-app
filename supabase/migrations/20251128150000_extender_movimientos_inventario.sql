-- =====================================================
-- MIGRACIÓN: Extensión del módulo de Movimientos de Inventario
-- Fecha: 2025-11-28
-- =====================================================

-- 1. TABLA: pedidos_inventario (para lotes/pedidos en tránsito)
-- =====================================================
CREATE TABLE IF NOT EXISTS pedidos_inventario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_pedido VARCHAR(100) NOT NULL UNIQUE,
  proveedor_id UUID NOT NULL REFERENCES proveedores(id),
  fecha_pedido TIMESTAMPTZ DEFAULT NOW(),
  fecha_estimada_llegada DATE,
  estado VARCHAR(50) DEFAULT 'en_transito' CHECK (estado IN ('en_transito', 'recibido_parcial', 'recibido_completo', 'cancelado')),
  observaciones TEXT,
  usuario_registro_id UUID REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TABLA: pedido_items (productos dentro de un pedido)
-- =====================================================
CREATE TABLE IF NOT EXISTS pedido_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL REFERENCES pedidos_inventario(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES productos(id),
  cantidad_pedida INTEGER NOT NULL CHECK (cantidad_pedida > 0),
  cantidad_recibida INTEGER DEFAULT 0 CHECK (cantidad_recibida >= 0),
  estado VARCHAR(50) DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'recibido_parcial', 'recibido_completo')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(pedido_id, producto_id)
);

-- 3. NUEVAS COLUMNAS en tabla movimientos
-- =====================================================
DO $$
BEGIN
  -- Motivo de salida (venta, consumo, dañado, perdido)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'movimientos' AND column_name = 'motivo_salida') THEN
    ALTER TABLE movimientos ADD COLUMN motivo_salida VARCHAR(50) CHECK (motivo_salida IN ('venta', 'consumo_servicio', 'dañado', 'perdido'));
  END IF;

  -- Servicio vinculado
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'movimientos' AND column_name = 'servicio_id') THEN
    ALTER TABLE movimientos ADD COLUMN servicio_id UUID;
  END IF;

  -- Pedido vinculado (para trazabilidad)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'movimientos' AND column_name = 'pedido_id') THEN
    ALTER TABLE movimientos ADD COLUMN pedido_id UUID REFERENCES pedidos_inventario(id);
  END IF;

  -- Estado de aprobación
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'movimientos' AND column_name = 'estado_aprobacion') THEN
    ALTER TABLE movimientos ADD COLUMN estado_aprobacion VARCHAR(50) DEFAULT 'aprobado' CHECK (estado_aprobacion IN ('pendiente', 'aprobado', 'rechazado'));
  END IF;

  -- Usuario que aprobó/rechazó
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'movimientos' AND column_name = 'usuario_aprobador_id') THEN
    ALTER TABLE movimientos ADD COLUMN usuario_aprobador_id UUID REFERENCES user_profiles(id);
  END IF;

  -- Fecha de aprobación/rechazo
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'movimientos' AND column_name = 'fecha_aprobacion') THEN
    ALTER TABLE movimientos ADD COLUMN fecha_aprobacion TIMESTAMPTZ;
  END IF;

  -- Motivo de rechazo
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'movimientos' AND column_name = 'motivo_rechazo') THEN
    ALTER TABLE movimientos ADD COLUMN motivo_rechazo TEXT;
  END IF;

  -- Estado de retorno para devoluciones (operativa, dañada, perdida)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'movimientos' AND column_name = 'estado_retorno') THEN
    ALTER TABLE movimientos ADD COLUMN estado_retorno VARCHAR(50) CHECK (estado_retorno IN ('operativa', 'dañada', 'perdida'));
  END IF;
END $$;

-- 4. NUEVA COLUMNA en tabla inventario para estado en_transito
-- =====================================================
DO $$
BEGIN
  -- Actualizar constraint de estado si existe
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventario' AND column_name = 'estado') THEN
    ALTER TABLE inventario DROP CONSTRAINT IF EXISTS inventario_estado_check;
    ALTER TABLE inventario ADD CONSTRAINT inventario_estado_check
      CHECK (estado IN ('disponible', 'en_uso', 'dañado', 'perdido', 'en_transito'));
  END IF;
END $$;

-- 5. FUNCIÓN: Procesar movimiento de inventario (extendida)
-- =====================================================
CREATE OR REPLACE FUNCTION procesar_movimiento_inventario(
  p_producto_id UUID,
  p_tipo_movimiento VARCHAR(50),
  p_cantidad INTEGER,
  p_proveedor_id UUID DEFAULT NULL,
  p_conductor_destino_id UUID DEFAULT NULL,
  p_vehiculo_destino_id UUID DEFAULT NULL,
  p_estado_destino VARCHAR(50) DEFAULT 'disponible',
  p_usuario_id UUID DEFAULT NULL,
  p_observaciones TEXT DEFAULT NULL,
  p_motivo_salida VARCHAR(50) DEFAULT NULL,
  p_servicio_id UUID DEFAULT NULL,
  p_estado_aprobacion VARCHAR(50) DEFAULT 'aprobado',
  p_estado_retorno VARCHAR(50) DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_inventario_id UUID;
  v_stock_actual INTEGER;
  v_movimiento_id UUID;
  v_producto_tipo VARCHAR(50);
  v_es_retornable BOOLEAN;
BEGIN
  -- Validar cantidad
  IF p_cantidad <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'La cantidad debe ser mayor a 0');
  END IF;

  -- Obtener info del producto
  SELECT tipo, es_retornable INTO v_producto_tipo, v_es_retornable
  FROM productos WHERE id = p_producto_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Producto no encontrado');
  END IF;

  -- Si el movimiento requiere aprobación (pendiente), solo registrar sin afectar stock
  IF p_estado_aprobacion = 'pendiente' THEN
    INSERT INTO movimientos (
      producto_id, tipo_movimiento, cantidad, proveedor_id,
      conductor_destino_id, vehiculo_destino_id, estado_destino,
      usuario_id, observaciones, motivo_salida, servicio_id,
      estado_aprobacion, estado_retorno, vehiculo_origen_id
    )
    VALUES (
      p_producto_id, p_tipo_movimiento, p_cantidad, p_proveedor_id,
      p_conductor_destino_id, p_vehiculo_destino_id, p_estado_destino,
      p_usuario_id, p_observaciones, p_motivo_salida, p_servicio_id,
      'pendiente', p_estado_retorno,
      CASE WHEN p_tipo_movimiento = 'devolucion' THEN p_vehiculo_destino_id ELSE NULL END
    )
    RETURNING id INTO v_movimiento_id;

    RETURN json_build_object(
      'success', true,
      'movimiento_id', v_movimiento_id,
      'mensaje', 'Movimiento registrado y pendiente de aprobación'
    );
  END IF;

  -- ===== ENTRADA =====
  IF p_tipo_movimiento = 'entrada' THEN
    IF p_proveedor_id IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Proveedor requerido para entrada');
    END IF;

    -- Buscar o crear registro en inventario
    SELECT id INTO v_inventario_id
    FROM inventario
    WHERE producto_id = p_producto_id
      AND proveedor_id = p_proveedor_id
      AND estado = 'disponible'
      AND asignado_a_vehiculo_id IS NULL
    LIMIT 1;

    IF v_inventario_id IS NULL THEN
      INSERT INTO inventario (producto_id, proveedor_id, cantidad, estado)
      VALUES (p_producto_id, p_proveedor_id, p_cantidad, 'disponible')
      RETURNING id INTO v_inventario_id;
    ELSE
      UPDATE inventario
      SET cantidad = cantidad + p_cantidad, updated_at = NOW()
      WHERE id = v_inventario_id;
    END IF;

    -- Registrar movimiento
    INSERT INTO movimientos (
      producto_id, tipo_movimiento, cantidad, proveedor_id,
      usuario_id, observaciones, estado_aprobacion
    )
    VALUES (
      p_producto_id, 'entrada', p_cantidad, p_proveedor_id,
      p_usuario_id, p_observaciones, 'aprobado'
    )
    RETURNING id INTO v_movimiento_id;

    RETURN json_build_object(
      'success', true,
      'movimiento_id', v_movimiento_id,
      'inventario_id', v_inventario_id
    );

  -- ===== SALIDA =====
  ELSIF p_tipo_movimiento = 'salida' THEN
    IF p_proveedor_id IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Proveedor requerido para salida');
    END IF;

    -- Verificar stock
    SELECT id, cantidad INTO v_inventario_id, v_stock_actual
    FROM inventario
    WHERE producto_id = p_producto_id
      AND proveedor_id = p_proveedor_id
      AND estado = 'disponible'
      AND asignado_a_vehiculo_id IS NULL
    LIMIT 1;

    IF v_inventario_id IS NULL OR v_stock_actual < p_cantidad THEN
      RETURN json_build_object('success', false, 'error', 'Stock insuficiente');
    END IF;

    -- Reducir stock
    UPDATE inventario
    SET cantidad = cantidad - p_cantidad, updated_at = NOW()
    WHERE id = v_inventario_id;

    -- Eliminar si llega a 0
    DELETE FROM inventario WHERE id = v_inventario_id AND cantidad <= 0;

    -- Registrar movimiento
    INSERT INTO movimientos (
      producto_id, tipo_movimiento, cantidad, proveedor_id,
      vehiculo_destino_id, usuario_id, observaciones,
      motivo_salida, servicio_id, estado_aprobacion
    )
    VALUES (
      p_producto_id, 'salida', p_cantidad, p_proveedor_id,
      p_vehiculo_destino_id, p_usuario_id, p_observaciones,
      p_motivo_salida, p_servicio_id, 'aprobado'
    )
    RETURNING id INTO v_movimiento_id;

    RETURN json_build_object(
      'success', true,
      'movimiento_id', v_movimiento_id
    );

  -- ===== ASIGNACIÓN (USO de herramienta) =====
  ELSIF p_tipo_movimiento = 'asignacion' THEN
    IF NOT v_es_retornable THEN
      RETURN json_build_object('success', false, 'error', 'Solo herramientas pueden ser asignadas');
    END IF;

    IF p_vehiculo_destino_id IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Vehículo requerido para asignación');
    END IF;

    IF p_proveedor_id IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Proveedor requerido para asignación');
    END IF;

    -- Verificar stock disponible
    SELECT id, cantidad INTO v_inventario_id, v_stock_actual
    FROM inventario
    WHERE producto_id = p_producto_id
      AND proveedor_id = p_proveedor_id
      AND estado = 'disponible'
      AND asignado_a_vehiculo_id IS NULL
    LIMIT 1;

    IF v_inventario_id IS NULL OR v_stock_actual < p_cantidad THEN
      RETURN json_build_object('success', false, 'error', 'Stock insuficiente');
    END IF;

    -- Reducir de disponible
    UPDATE inventario
    SET cantidad = cantidad - p_cantidad, updated_at = NOW()
    WHERE id = v_inventario_id;

    DELETE FROM inventario WHERE id = v_inventario_id AND cantidad <= 0;

    -- Buscar o crear registro en_uso para ese vehículo
    SELECT id INTO v_inventario_id
    FROM inventario
    WHERE producto_id = p_producto_id
      AND proveedor_id = p_proveedor_id
      AND estado = 'en_uso'
      AND asignado_a_vehiculo_id = p_vehiculo_destino_id
    LIMIT 1;

    IF v_inventario_id IS NULL THEN
      INSERT INTO inventario (producto_id, proveedor_id, cantidad, estado, asignado_a_vehiculo_id)
      VALUES (p_producto_id, p_proveedor_id, p_cantidad, 'en_uso', p_vehiculo_destino_id);
    ELSE
      UPDATE inventario
      SET cantidad = cantidad + p_cantidad, updated_at = NOW()
      WHERE id = v_inventario_id;
    END IF;

    -- Registrar movimiento
    INSERT INTO movimientos (
      producto_id, tipo_movimiento, cantidad, proveedor_id,
      vehiculo_destino_id, usuario_id, observaciones,
      servicio_id, estado_aprobacion
    )
    VALUES (
      p_producto_id, 'asignacion', p_cantidad, p_proveedor_id,
      p_vehiculo_destino_id, p_usuario_id, p_observaciones,
      p_servicio_id, 'aprobado'
    )
    RETURNING id INTO v_movimiento_id;

    RETURN json_build_object(
      'success', true,
      'movimiento_id', v_movimiento_id
    );

  -- ===== DEVOLUCIÓN =====
  ELSIF p_tipo_movimiento = 'devolucion' THEN
    IF NOT v_es_retornable THEN
      RETURN json_build_object('success', false, 'error', 'Solo herramientas pueden ser devueltas');
    END IF;

    IF p_vehiculo_destino_id IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Vehículo origen requerido');
    END IF;

    IF p_estado_retorno IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Estado de retorno requerido');
    END IF;

    -- Buscar inventario en_uso del vehículo
    SELECT id, cantidad, proveedor_id INTO v_inventario_id, v_stock_actual, p_proveedor_id
    FROM inventario
    WHERE producto_id = p_producto_id
      AND estado = 'en_uso'
      AND asignado_a_vehiculo_id = p_vehiculo_destino_id
      AND cantidad >= p_cantidad
    LIMIT 1;

    IF v_inventario_id IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'No hay suficientes items en uso en este vehículo');
    END IF;

    -- Reducir de en_uso
    UPDATE inventario
    SET cantidad = cantidad - p_cantidad, updated_at = NOW()
    WHERE id = v_inventario_id;

    DELETE FROM inventario WHERE id = v_inventario_id AND cantidad <= 0;

    -- Si es operativa, regresa a disponible
    IF p_estado_retorno = 'operativa' THEN
      SELECT id INTO v_inventario_id
      FROM inventario
      WHERE producto_id = p_producto_id
        AND proveedor_id = p_proveedor_id
        AND estado = 'disponible'
        AND asignado_a_vehiculo_id IS NULL
      LIMIT 1;

      IF v_inventario_id IS NULL THEN
        INSERT INTO inventario (producto_id, proveedor_id, cantidad, estado)
        VALUES (p_producto_id, p_proveedor_id, p_cantidad, 'disponible');
      ELSE
        UPDATE inventario
        SET cantidad = cantidad + p_cantidad, updated_at = NOW()
        WHERE id = v_inventario_id;
      END IF;
    END IF;
    -- Si es dañada o perdida, el stock ya se redujo y no se repone

    -- Registrar movimiento
    INSERT INTO movimientos (
      producto_id, tipo_movimiento, cantidad, proveedor_id,
      vehiculo_origen_id, usuario_id, observaciones,
      estado_retorno, estado_aprobacion
    )
    VALUES (
      p_producto_id, 'devolucion', p_cantidad, p_proveedor_id,
      p_vehiculo_destino_id, p_usuario_id, p_observaciones,
      p_estado_retorno, 'aprobado'
    )
    RETURNING id INTO v_movimiento_id;

    RETURN json_build_object(
      'success', true,
      'movimiento_id', v_movimiento_id
    );

  ELSE
    RETURN json_build_object('success', false, 'error', 'Tipo de movimiento no válido');
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. FUNCIÓN: Procesar recepción de pedido (parcial o completa)
-- =====================================================
CREATE OR REPLACE FUNCTION procesar_recepcion_pedido(
  p_pedido_item_id UUID,
  p_cantidad_recibida INTEGER,
  p_usuario_id UUID
)
RETURNS JSON AS $$
DECLARE
  v_pedido_item RECORD;
  v_pedido RECORD;
  v_inventario_id UUID;
  v_cantidad_pendiente INTEGER;
  v_items_pendientes INTEGER;
BEGIN
  -- Obtener item del pedido
  SELECT pi.*, p.numero_pedido, p.proveedor_id
  INTO v_pedido_item
  FROM pedido_items pi
  JOIN pedidos_inventario p ON p.id = pi.pedido_id
  WHERE pi.id = p_pedido_item_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Item de pedido no encontrado');
  END IF;

  -- Calcular cantidad pendiente
  v_cantidad_pendiente := v_pedido_item.cantidad_pedida - v_pedido_item.cantidad_recibida;

  IF p_cantidad_recibida > v_cantidad_pendiente THEN
    RETURN json_build_object('success', false, 'error', 'Cantidad a recibir excede la cantidad pendiente');
  END IF;

  IF p_cantidad_recibida <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'La cantidad debe ser mayor a 0');
  END IF;

  -- Actualizar cantidad recibida en el item
  UPDATE pedido_items
  SET
    cantidad_recibida = cantidad_recibida + p_cantidad_recibida,
    estado = CASE
      WHEN cantidad_recibida + p_cantidad_recibida >= cantidad_pedida THEN 'recibido_completo'
      ELSE 'recibido_parcial'
    END,
    updated_at = NOW()
  WHERE id = p_pedido_item_id;

  -- Buscar o crear registro de inventario
  SELECT id INTO v_inventario_id
  FROM inventario
  WHERE producto_id = v_pedido_item.producto_id
    AND proveedor_id = v_pedido_item.proveedor_id
    AND estado = 'disponible'
    AND asignado_a_vehiculo_id IS NULL
  LIMIT 1;

  IF v_inventario_id IS NULL THEN
    -- Crear nuevo registro de inventario
    INSERT INTO inventario (producto_id, proveedor_id, cantidad, estado)
    VALUES (v_pedido_item.producto_id, v_pedido_item.proveedor_id, p_cantidad_recibida, 'disponible')
    RETURNING id INTO v_inventario_id;
  ELSE
    -- Actualizar cantidad existente
    UPDATE inventario
    SET cantidad = cantidad + p_cantidad_recibida
    WHERE id = v_inventario_id;
  END IF;

  -- Registrar movimiento de entrada
  INSERT INTO movimientos (
    tipo_movimiento,
    producto_id,
    cantidad,
    proveedor_id,
    estado_destino,
    usuario_id,
    pedido_id,
    observaciones,
    estado_aprobacion
  )
  VALUES (
    'entrada',
    v_pedido_item.producto_id,
    p_cantidad_recibida,
    v_pedido_item.proveedor_id,
    'disponible',
    p_usuario_id,
    v_pedido_item.pedido_id,
    'Recepción de pedido ' || v_pedido_item.numero_pedido,
    'aprobado'  -- Las recepciones no requieren aprobación
  );

  -- Verificar si todos los items del pedido están completos
  SELECT COUNT(*) INTO v_items_pendientes
  FROM pedido_items
  WHERE pedido_id = v_pedido_item.pedido_id
    AND estado != 'recibido_completo';

  -- Actualizar estado del pedido
  UPDATE pedidos_inventario
  SET
    estado = CASE
      WHEN v_items_pendientes = 0 THEN 'recibido_completo'
      ELSE 'recibido_parcial'
    END,
    updated_at = NOW()
  WHERE id = v_pedido_item.pedido_id;

  RETURN json_build_object(
    'success', true,
    'mensaje', 'Recepción procesada correctamente',
    'cantidad_recibida', p_cantidad_recibida,
    'items_pendientes', v_items_pendientes
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. FUNCIÓN: Aprobar o rechazar movimiento
-- =====================================================
CREATE OR REPLACE FUNCTION aprobar_rechazar_movimiento(
  p_movimiento_id UUID,
  p_aprobador_id UUID,
  p_aprobado BOOLEAN,
  p_motivo_rechazo TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_movimiento RECORD;
  v_inventario_id UUID;
  v_stock_actual INTEGER;
  v_proveedor_id UUID;
BEGIN
  -- Obtener movimiento
  SELECT * INTO v_movimiento
  FROM movimientos
  WHERE id = p_movimiento_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Movimiento no encontrado');
  END IF;

  IF v_movimiento.estado_aprobacion != 'pendiente' THEN
    RETURN json_build_object('success', false, 'error', 'El movimiento ya fue procesado');
  END IF;

  IF NOT p_aprobado THEN
    -- Rechazar movimiento
    UPDATE movimientos
    SET
      estado_aprobacion = 'rechazado',
      usuario_aprobador_id = p_aprobador_id,
      fecha_aprobacion = NOW(),
      motivo_rechazo = p_motivo_rechazo
    WHERE id = p_movimiento_id;

    RETURN json_build_object('success', true, 'mensaje', 'Movimiento rechazado');
  END IF;

  -- Aprobar y ejecutar el movimiento según el tipo
  UPDATE movimientos
  SET
    estado_aprobacion = 'aprobado',
    usuario_aprobador_id = p_aprobador_id,
    fecha_aprobacion = NOW()
  WHERE id = p_movimiento_id;

  -- ===== SALIDA =====
  IF v_movimiento.tipo_movimiento = 'salida' THEN
    SELECT id, cantidad INTO v_inventario_id, v_stock_actual
    FROM inventario
    WHERE producto_id = v_movimiento.producto_id
      AND proveedor_id = v_movimiento.proveedor_id
      AND estado = 'disponible'
      AND asignado_a_vehiculo_id IS NULL
      AND cantidad >= v_movimiento.cantidad
    LIMIT 1;

    IF v_inventario_id IS NULL THEN
      -- Revertir aprobación
      UPDATE movimientos SET estado_aprobacion = 'pendiente', usuario_aprobador_id = NULL, fecha_aprobacion = NULL WHERE id = p_movimiento_id;
      RETURN json_build_object('success', false, 'error', 'Stock insuficiente para aprobar');
    END IF;

    UPDATE inventario SET cantidad = cantidad - v_movimiento.cantidad WHERE id = v_inventario_id;
    DELETE FROM inventario WHERE id = v_inventario_id AND cantidad <= 0;

  -- ===== ASIGNACIÓN (USO) =====
  ELSIF v_movimiento.tipo_movimiento = 'asignacion' THEN
    SELECT id, cantidad INTO v_inventario_id, v_stock_actual
    FROM inventario
    WHERE producto_id = v_movimiento.producto_id
      AND proveedor_id = v_movimiento.proveedor_id
      AND estado = 'disponible'
      AND asignado_a_vehiculo_id IS NULL
      AND cantidad >= v_movimiento.cantidad
    LIMIT 1;

    IF v_inventario_id IS NULL THEN
      UPDATE movimientos SET estado_aprobacion = 'pendiente', usuario_aprobador_id = NULL, fecha_aprobacion = NULL WHERE id = p_movimiento_id;
      RETURN json_build_object('success', false, 'error', 'Stock insuficiente para asignar');
    END IF;

    -- Reducir de disponible
    UPDATE inventario SET cantidad = cantidad - v_movimiento.cantidad WHERE id = v_inventario_id;
    DELETE FROM inventario WHERE id = v_inventario_id AND cantidad <= 0;

    -- Buscar o crear registro en_uso
    SELECT id INTO v_inventario_id
    FROM inventario
    WHERE producto_id = v_movimiento.producto_id
      AND proveedor_id = v_movimiento.proveedor_id
      AND estado = 'en_uso'
      AND asignado_a_vehiculo_id = v_movimiento.vehiculo_destino_id
    LIMIT 1;

    IF v_inventario_id IS NULL THEN
      INSERT INTO inventario (producto_id, proveedor_id, cantidad, estado, asignado_a_vehiculo_id)
      VALUES (v_movimiento.producto_id, v_movimiento.proveedor_id, v_movimiento.cantidad, 'en_uso', v_movimiento.vehiculo_destino_id);
    ELSE
      UPDATE inventario SET cantidad = cantidad + v_movimiento.cantidad WHERE id = v_inventario_id;
    END IF;

  -- ===== DEVOLUCIÓN =====
  ELSIF v_movimiento.tipo_movimiento = 'devolucion' THEN
    -- Buscar inventario en uso
    SELECT id, cantidad, proveedor_id INTO v_inventario_id, v_stock_actual, v_proveedor_id
    FROM inventario
    WHERE producto_id = v_movimiento.producto_id
      AND estado = 'en_uso'
      AND asignado_a_vehiculo_id = v_movimiento.vehiculo_origen_id
      AND cantidad >= v_movimiento.cantidad
    LIMIT 1;

    IF v_inventario_id IS NULL THEN
      UPDATE movimientos SET estado_aprobacion = 'pendiente', usuario_aprobador_id = NULL, fecha_aprobacion = NULL WHERE id = p_movimiento_id;
      RETURN json_build_object('success', false, 'error', 'No hay suficientes items en uso para devolver');
    END IF;

    -- Reducir de en_uso
    UPDATE inventario SET cantidad = cantidad - v_movimiento.cantidad WHERE id = v_inventario_id;
    DELETE FROM inventario WHERE id = v_inventario_id AND cantidad <= 0;

    -- Si es operativa, regresa a disponible
    IF v_movimiento.estado_retorno = 'operativa' THEN
      SELECT id INTO v_inventario_id
      FROM inventario
      WHERE producto_id = v_movimiento.producto_id
        AND proveedor_id = v_proveedor_id
        AND estado = 'disponible'
        AND asignado_a_vehiculo_id IS NULL
      LIMIT 1;

      IF v_inventario_id IS NULL THEN
        INSERT INTO inventario (producto_id, proveedor_id, cantidad, estado)
        VALUES (v_movimiento.producto_id, v_proveedor_id, v_movimiento.cantidad, 'disponible');
      ELSE
        UPDATE inventario SET cantidad = cantidad + v_movimiento.cantidad WHERE id = v_inventario_id;
      END IF;
    END IF;
    -- Si es dañada o perdida, el stock no se repone (ya se redujo de en_uso)
  END IF;

  RETURN json_build_object('success', true, 'mensaje', 'Movimiento aprobado y ejecutado');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. FUNCIÓN: Crear pedido con múltiples items
-- =====================================================
CREATE OR REPLACE FUNCTION crear_pedido_inventario(
  p_numero_pedido VARCHAR(100),
  p_proveedor_id UUID,
  p_fecha_estimada DATE,
  p_observaciones TEXT,
  p_usuario_id UUID,
  p_items JSON -- Array de {producto_id, cantidad}
)
RETURNS JSON AS $$
DECLARE
  v_pedido_id UUID;
  v_item JSON;
BEGIN
  -- Crear pedido
  INSERT INTO pedidos_inventario (numero_pedido, proveedor_id, fecha_estimada_llegada, observaciones, usuario_registro_id)
  VALUES (p_numero_pedido, p_proveedor_id, p_fecha_estimada, p_observaciones, p_usuario_id)
  RETURNING id INTO v_pedido_id;

  -- Crear items del pedido
  FOR v_item IN SELECT * FROM json_array_elements(p_items)
  LOOP
    INSERT INTO pedido_items (pedido_id, producto_id, cantidad_pedida)
    VALUES (
      v_pedido_id,
      (v_item->>'producto_id')::UUID,
      (v_item->>'cantidad')::INTEGER
    );
  END LOOP;

  RETURN json_build_object(
    'success', true,
    'pedido_id', v_pedido_id,
    'numero_pedido', p_numero_pedido
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. VISTA: Pedidos en tránsito con detalle
-- =====================================================
CREATE OR REPLACE VIEW v_pedidos_en_transito AS
SELECT
  p.id AS pedido_id,
  p.numero_pedido,
  p.fecha_pedido,
  p.fecha_estimada_llegada,
  p.estado AS estado_pedido,
  p.observaciones,
  prov.razon_social AS proveedor_nombre,
  pi.id AS item_id,
  pi.producto_id,
  prod.codigo AS producto_codigo,
  prod.nombre AS producto_nombre,
  pi.cantidad_pedida,
  pi.cantidad_recibida,
  (pi.cantidad_pedida - pi.cantidad_recibida) AS cantidad_pendiente,
  pi.estado AS estado_item,
  u.full_name AS usuario_registro
FROM pedidos_inventario p
JOIN proveedores prov ON prov.id = p.proveedor_id
JOIN pedido_items pi ON pi.pedido_id = p.id
JOIN productos prod ON prod.id = pi.producto_id
LEFT JOIN user_profiles u ON u.id = p.usuario_registro_id
WHERE p.estado IN ('en_transito', 'recibido_parcial')
ORDER BY p.fecha_pedido DESC, prod.nombre;

-- 10. VISTA: Movimientos pendientes de aprobación
-- =====================================================
CREATE OR REPLACE VIEW v_movimientos_pendientes AS
SELECT
  m.id,
  m.tipo_movimiento AS tipo,
  m.cantidad,
  m.motivo_salida,
  m.observaciones,
  m.created_at,
  m.estado_retorno,
  m.producto_id,
  prod.nombre AS producto_nombre,
  prod.tipo AS producto_tipo,
  m.proveedor_id,
  prov.razon_social AS proveedor_nombre,
  COALESCE(m.vehiculo_destino_id, m.vehiculo_origen_id) AS vehiculo_id,
  v.patente AS vehiculo_patente,
  m.servicio_id,
  m.usuario_id AS usuario_registrador_id,
  u.full_name AS usuario_registrador_nombre
FROM movimientos m
JOIN productos prod ON prod.id = m.producto_id
LEFT JOIN proveedores prov ON prov.id = m.proveedor_id
LEFT JOIN vehiculos v ON v.id = COALESCE(m.vehiculo_destino_id, m.vehiculo_origen_id)
LEFT JOIN user_profiles u ON u.id = m.usuario_id
WHERE m.estado_aprobacion = 'pendiente'
ORDER BY m.created_at ASC;

-- 11. ÍNDICES para optimizar consultas
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_movimientos_estado_aprobacion ON movimientos(estado_aprobacion);
CREATE INDEX IF NOT EXISTS idx_movimientos_pedido_id ON movimientos(pedido_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_estado ON pedidos_inventario(estado);
CREATE INDEX IF NOT EXISTS idx_pedido_items_pedido ON pedido_items(pedido_id);
CREATE INDEX IF NOT EXISTS idx_inventario_estado ON inventario(estado);

-- 12. COMENTARIOS para documentación
-- =====================================================
COMMENT ON TABLE pedidos_inventario IS 'Pedidos/lotes de productos en tránsito desde proveedores';
COMMENT ON TABLE pedido_items IS 'Items individuales dentro de un pedido de inventario';
COMMENT ON COLUMN movimientos.estado_aprobacion IS 'Estado del flujo de aprobación: pendiente, aprobado, rechazado';
COMMENT ON COLUMN movimientos.motivo_salida IS 'Razón de la salida: venta, consumo_servicio, dañado, perdido';
COMMENT ON COLUMN movimientos.estado_retorno IS 'Estado de herramienta devuelta: operativa, dañada, perdida';
