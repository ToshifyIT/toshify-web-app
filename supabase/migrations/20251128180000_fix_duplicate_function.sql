-- =====================================================
-- FIX: Eliminar función duplicada y crear vista para tránsito
-- Fecha: 2025-11-28
-- =====================================================

-- Eliminar TODAS las versiones de la función crear_pedido_inventario
DROP FUNCTION IF EXISTS crear_pedido_inventario(VARCHAR, UUID, DATE, TEXT, UUID, JSON);
DROP FUNCTION IF EXISTS crear_pedido_inventario(VARCHAR, UUID, DATE, TEXT, UUID, TEXT);

-- Recrear la función con parámetro TEXT (para evitar ambigüedad)
CREATE OR REPLACE FUNCTION crear_pedido_inventario(
  p_numero_pedido VARCHAR(100),
  p_proveedor_id UUID,
  p_fecha_estimada DATE,
  p_observaciones TEXT,
  p_usuario_id UUID,
  p_items TEXT -- Array de {producto_id, cantidad} como string JSON
)
RETURNS JSON AS $$
DECLARE
  v_pedido_id UUID;
  v_item JSON;
  v_items_json JSON;
BEGIN
  -- Parsear el string a JSON
  v_items_json := p_items::JSON;

  -- Crear pedido
  INSERT INTO pedidos_inventario (numero_pedido, proveedor_id, fecha_estimada_llegada, observaciones, usuario_registro_id)
  VALUES (p_numero_pedido, p_proveedor_id, p_fecha_estimada, p_observaciones, p_usuario_id)
  RETURNING id INTO v_pedido_id;

  -- Crear items del pedido
  FOR v_item IN SELECT * FROM json_array_elements(v_items_json)
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
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- Vista para entradas en tránsito (entradas simples pendientes de confirmar)
-- Usa las tablas reales: movimientos, productos, user_profiles
-- =====================================================
DROP VIEW IF EXISTS v_entradas_en_transito;
CREATE VIEW v_entradas_en_transito AS
SELECT
  m.id,
  m.producto_id,
  prod.codigo AS producto_codigo,
  prod.nombre AS producto_nombre,
  prod.tipo AS producto_tipo,
  m.cantidad,
  m.proveedor_id,
  prov.razon_social AS proveedor_nombre,
  m.observaciones,
  m.created_at,
  u.full_name AS usuario_registro
FROM movimientos m
JOIN productos prod ON prod.id = m.producto_id
LEFT JOIN proveedores prov ON prov.id = m.proveedor_id
LEFT JOIN user_profiles u ON u.id = m.usuario_id
WHERE m.tipo_movimiento = 'entrada'
  AND m.estado_aprobacion = 'pendiente'
  AND m.pedido_id IS NULL -- Solo entradas simples, no las de pedidos
ORDER BY m.created_at DESC;

GRANT SELECT ON v_entradas_en_transito TO authenticated;

-- =====================================================
-- Actualizar función procesar_movimiento_inventario
-- ENTRADA: siempre va a estado 'pendiente' (en tránsito)
-- SALIDA, ASIGNACIÓN, DEVOLUCIÓN: se ejecutan directo (aprobado)
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
  v_estado_final VARCHAR(50);
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

  -- ===== ENTRADA: SIEMPRE va a "pendiente" (en tránsito) =====
  IF p_tipo_movimiento = 'entrada' THEN
    IF p_proveedor_id IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Proveedor requerido para entrada');
    END IF;

    -- Registrar movimiento en estado PENDIENTE (en tránsito)
    INSERT INTO movimientos (
      producto_id, tipo_movimiento, cantidad, proveedor_id,
      usuario_id, observaciones, estado_aprobacion
    )
    VALUES (
      p_producto_id, 'entrada', p_cantidad, p_proveedor_id,
      p_usuario_id, p_observaciones, 'pendiente'  -- SIEMPRE pendiente
    )
    RETURNING id INTO v_movimiento_id;

    RETURN json_build_object(
      'success', true,
      'movimiento_id', v_movimiento_id,
      'mensaje', 'Entrada registrada en tránsito. Confirma la recepción desde "Pedidos en Tránsito" para agregar al stock.'
    );

  -- ===== SALIDA: Se ejecuta directo =====
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

    -- Registrar movimiento como APROBADO
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
      'movimiento_id', v_movimiento_id,
      'mensaje', 'Salida procesada correctamente'
    );

  -- ===== ASIGNACIÓN (USO de herramienta): Se ejecuta directo =====
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

    -- Registrar movimiento como APROBADO
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
      'movimiento_id', v_movimiento_id,
      'mensaje', 'Asignación procesada correctamente'
    );

  -- ===== DEVOLUCIÓN: Se ejecuta directo =====
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

    -- Registrar movimiento como APROBADO
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
      'movimiento_id', v_movimiento_id,
      'mensaje', 'Devolución procesada correctamente'
    );

  ELSE
    RETURN json_build_object('success', false, 'error', 'Tipo de movimiento no válido');
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- Función para confirmar recepción de entrada en tránsito
-- =====================================================
CREATE OR REPLACE FUNCTION confirmar_recepcion_entrada(
  p_movimiento_id UUID,
  p_usuario_id UUID,
  p_cantidad_recibida INTEGER DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_movimiento RECORD;
  v_cantidad_final INTEGER;
  v_inventario_id UUID;
BEGIN
  -- Obtener el movimiento
  SELECT m.*, prod.nombre as producto_nombre
  INTO v_movimiento
  FROM movimientos m
  JOIN productos prod ON prod.id = m.producto_id
  WHERE m.id = p_movimiento_id
    AND m.tipo_movimiento = 'entrada'
    AND m.estado_aprobacion = 'pendiente';

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Movimiento no encontrado o ya procesado');
  END IF;

  -- Determinar cantidad a recibir
  v_cantidad_final := COALESCE(p_cantidad_recibida, v_movimiento.cantidad);

  -- Buscar o crear registro en inventario
  SELECT id INTO v_inventario_id
  FROM inventario
  WHERE producto_id = v_movimiento.producto_id
    AND proveedor_id = v_movimiento.proveedor_id
    AND estado = 'disponible'
    AND asignado_a_vehiculo_id IS NULL
  LIMIT 1;

  IF v_inventario_id IS NULL THEN
    INSERT INTO inventario (producto_id, proveedor_id, cantidad, estado)
    VALUES (v_movimiento.producto_id, v_movimiento.proveedor_id, v_cantidad_final, 'disponible')
    RETURNING id INTO v_inventario_id;
  ELSE
    UPDATE inventario
    SET cantidad = cantidad + v_cantidad_final, updated_at = NOW()
    WHERE id = v_inventario_id;
  END IF;

  -- Marcar el movimiento como aprobado/confirmado
  UPDATE movimientos
  SET estado_aprobacion = 'aprobado',
      usuario_aprobador_id = p_usuario_id,
      fecha_aprobacion = NOW(),
      observaciones = COALESCE(observaciones, '') ||
        CASE WHEN v_cantidad_final != v_movimiento.cantidad
          THEN ' | Recibido: ' || v_cantidad_final || ' de ' || v_movimiento.cantidad || ' unidades'
          ELSE ''
        END
  WHERE id = p_movimiento_id;

  RETURN json_build_object(
    'success', true,
    'mensaje', 'Recepción confirmada. ' || v_cantidad_final || ' unidades de "' || v_movimiento.producto_nombre || '" agregadas al stock.'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
