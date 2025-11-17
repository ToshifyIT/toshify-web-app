-- Función para procesar movimientos de inventario
-- Esta función maneja todas las operaciones de inventario con transacciones atómicas

CREATE OR REPLACE FUNCTION procesar_movimiento_inventario(
  p_producto_id uuid,
  p_tipo_movimiento varchar,
  p_cantidad numeric,
  p_conductor_destino_id uuid DEFAULT NULL,
  p_vehiculo_destino_id uuid DEFAULT NULL,
  p_estado_destino varchar DEFAULT 'disponible',
  p_usuario_id uuid DEFAULT NULL,
  p_observaciones text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_producto RECORD;
  v_inventario_disponible RECORD;
  v_inventario_en_uso RECORD;
  v_es_retornable boolean;
  v_movimiento_id uuid;
BEGIN
  -- Obtener información del producto
  SELECT es_retornable INTO v_es_retornable
  FROM productos
  WHERE id = p_producto_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto no encontrado';
  END IF;

  -- ENTRADA: Incrementar stock disponible
  IF p_tipo_movimiento = 'entrada' THEN
    -- Buscar o crear registro de inventario disponible
    INSERT INTO inventario (producto_id, estado, cantidad)
    VALUES (p_producto_id, 'disponible', p_cantidad)
    ON CONFLICT (producto_id, estado)
    WHERE asignado_a_conductor_id IS NULL AND asignado_a_vehiculo_id IS NULL
    DO UPDATE SET
      cantidad = inventario.cantidad + p_cantidad,
      updated_at = now();

    -- Registrar movimiento
    INSERT INTO movimientos (
      producto_id, tipo_movimiento, cantidad,
      estado_destino, usuario_id, observaciones
    ) VALUES (
      p_producto_id, 'entrada', p_cantidad,
      'disponible', p_usuario_id, p_observaciones
    ) RETURNING id INTO v_movimiento_id;

  -- SALIDA: Reducir stock disponible (consumo de repuestos)
  ELSIF p_tipo_movimiento = 'salida' THEN
    -- Verificar stock disponible
    SELECT * INTO v_inventario_disponible
    FROM inventario
    WHERE producto_id = p_producto_id
      AND estado = 'disponible'
      AND asignado_a_conductor_id IS NULL
      AND asignado_a_vehiculo_id IS NULL;

    IF NOT FOUND OR v_inventario_disponible.cantidad < p_cantidad THEN
      RAISE EXCEPTION 'Stock insuficiente. Disponible: %', COALESCE(v_inventario_disponible.cantidad, 0);
    END IF;

    -- Reducir cantidad disponible
    UPDATE inventario
    SET cantidad = cantidad - p_cantidad,
        updated_at = now()
    WHERE id = v_inventario_disponible.id;

    -- Eliminar registro si cantidad llega a 0
    DELETE FROM inventario
    WHERE id = v_inventario_disponible.id AND cantidad = 0;

    -- Registrar movimiento
    INSERT INTO movimientos (
      producto_id, tipo_movimiento, cantidad,
      estado_origen, usuario_id, observaciones
    ) VALUES (
      p_producto_id, 'salida', p_cantidad,
      'disponible', p_usuario_id, p_observaciones
    ) RETURNING id INTO v_movimiento_id;

  -- ASIGNACIÓN: Dar herramienta a conductor/vehículo
  ELSIF p_tipo_movimiento = 'asignacion' THEN
    -- Validar que sea retornable
    IF NOT v_es_retornable THEN
      RAISE EXCEPTION 'Solo las herramientas (retornables) pueden ser asignadas';
    END IF;

    IF p_conductor_destino_id IS NULL AND p_vehiculo_destino_id IS NULL THEN
      RAISE EXCEPTION 'Debe especificar un conductor o vehículo para la asignación';
    END IF;

    -- Verificar stock disponible
    SELECT * INTO v_inventario_disponible
    FROM inventario
    WHERE producto_id = p_producto_id
      AND estado = 'disponible'
      AND asignado_a_conductor_id IS NULL
      AND asignado_a_vehiculo_id IS NULL;

    IF NOT FOUND OR v_inventario_disponible.cantidad < p_cantidad THEN
      RAISE EXCEPTION 'Stock insuficiente para asignar. Disponible: %', COALESCE(v_inventario_disponible.cantidad, 0);
    END IF;

    -- Reducir stock disponible
    UPDATE inventario
    SET cantidad = cantidad - p_cantidad,
        updated_at = now()
    WHERE id = v_inventario_disponible.id;

    -- Crear o actualizar registro en_uso con asignación
    INSERT INTO inventario (
      producto_id, estado, cantidad,
      asignado_a_conductor_id, asignado_a_vehiculo_id
    ) VALUES (
      p_producto_id, 'en_uso', p_cantidad,
      p_conductor_destino_id, p_vehiculo_destino_id
    )
    ON CONFLICT (producto_id, estado, asignado_a_conductor_id, asignado_a_vehiculo_id)
    DO UPDATE SET
      cantidad = inventario.cantidad + p_cantidad,
      updated_at = now();

    -- Eliminar registro disponible si cantidad es 0
    DELETE FROM inventario
    WHERE id = v_inventario_disponible.id AND cantidad = 0;

    -- Registrar movimiento
    INSERT INTO movimientos (
      producto_id, tipo_movimiento, cantidad,
      estado_origen, estado_destino,
      conductor_destino_id, vehiculo_destino_id,
      usuario_id, observaciones
    ) VALUES (
      p_producto_id, 'asignacion', p_cantidad,
      'disponible', 'en_uso',
      p_conductor_destino_id, p_vehiculo_destino_id,
      p_usuario_id, p_observaciones
    ) RETURNING id INTO v_movimiento_id;

  -- DEVOLUCIÓN: Retornar herramienta de conductor/vehículo
  ELSIF p_tipo_movimiento = 'devolucion' THEN
    -- Validar que sea retornable
    IF NOT v_es_retornable THEN
      RAISE EXCEPTION 'Solo las herramientas pueden ser devueltas';
    END IF;

    IF p_conductor_destino_id IS NULL AND p_vehiculo_destino_id IS NULL THEN
      RAISE EXCEPTION 'Debe especificar el conductor o vehículo que devuelve';
    END IF;

    -- Buscar inventario en_uso
    SELECT * INTO v_inventario_en_uso
    FROM inventario
    WHERE producto_id = p_producto_id
      AND estado = 'en_uso'
      AND (
        (p_conductor_destino_id IS NOT NULL AND asignado_a_conductor_id = p_conductor_destino_id)
        OR
        (p_vehiculo_destino_id IS NOT NULL AND asignado_a_vehiculo_id = p_vehiculo_destino_id)
      );

    IF NOT FOUND OR v_inventario_en_uso.cantidad < p_cantidad THEN
      RAISE EXCEPTION 'Cantidad en uso insuficiente. En uso: %', COALESCE(v_inventario_en_uso.cantidad, 0);
    END IF;

    -- Reducir cantidad en_uso
    UPDATE inventario
    SET cantidad = cantidad - p_cantidad,
        updated_at = now()
    WHERE id = v_inventario_en_uso.id;

    -- Incrementar cantidad en estado destino
    INSERT INTO inventario (producto_id, estado, cantidad)
    VALUES (p_producto_id, p_estado_destino, p_cantidad)
    ON CONFLICT (producto_id, estado)
    WHERE asignado_a_conductor_id IS NULL AND asignado_a_vehiculo_id IS NULL
    DO UPDATE SET
      cantidad = inventario.cantidad + p_cantidad,
      updated_at = now();

    -- Eliminar registro en_uso si cantidad es 0
    DELETE FROM inventario
    WHERE id = v_inventario_en_uso.id AND cantidad = 0;

    -- Registrar movimiento
    INSERT INTO movimientos (
      producto_id, tipo_movimiento, cantidad,
      estado_origen, estado_destino,
      conductor_origen_id, vehiculo_origen_id,
      usuario_id, observaciones
    ) VALUES (
      p_producto_id, 'devolucion', p_cantidad,
      'en_uso', p_estado_destino,
      p_conductor_destino_id, p_vehiculo_destino_id,
      p_usuario_id, p_observaciones
    ) RETURNING id INTO v_movimiento_id;

  -- DAÑO: Marcar producto como dañado
  ELSIF p_tipo_movimiento = 'daño' THEN
    -- Buscar inventario disponible
    SELECT * INTO v_inventario_disponible
    FROM inventario
    WHERE producto_id = p_producto_id
      AND estado = 'disponible'
      AND asignado_a_conductor_id IS NULL
      AND asignado_a_vehiculo_id IS NULL;

    IF NOT FOUND OR v_inventario_disponible.cantidad < p_cantidad THEN
      RAISE EXCEPTION 'Cantidad disponible insuficiente. Disponible: %', COALESCE(v_inventario_disponible.cantidad, 0);
    END IF;

    -- Reducir disponible
    UPDATE inventario
    SET cantidad = cantidad - p_cantidad,
        updated_at = now()
    WHERE id = v_inventario_disponible.id;

    -- Incrementar dañado
    INSERT INTO inventario (producto_id, estado, cantidad)
    VALUES (p_producto_id, 'dañado', p_cantidad)
    ON CONFLICT (producto_id, estado)
    WHERE asignado_a_conductor_id IS NULL AND asignado_a_vehiculo_id IS NULL
    DO UPDATE SET
      cantidad = inventario.cantidad + p_cantidad,
      updated_at = now();

    -- Eliminar registro disponible si cantidad es 0
    DELETE FROM inventario
    WHERE id = v_inventario_disponible.id AND cantidad = 0;

    -- Registrar movimiento
    INSERT INTO movimientos (
      producto_id, tipo_movimiento, cantidad,
      estado_origen, estado_destino,
      usuario_id, observaciones
    ) VALUES (
      p_producto_id, 'daño', p_cantidad,
      'disponible', 'dañado',
      p_usuario_id, p_observaciones
    ) RETURNING id INTO v_movimiento_id;

  -- PERDIDA: Marcar producto como perdido
  ELSIF p_tipo_movimiento = 'perdida' THEN
    -- Buscar inventario disponible
    SELECT * INTO v_inventario_disponible
    FROM inventario
    WHERE producto_id = p_producto_id
      AND estado = 'disponible'
      AND asignado_a_conductor_id IS NULL
      AND asignado_a_vehiculo_id IS NULL;

    IF NOT FOUND OR v_inventario_disponible.cantidad < p_cantidad THEN
      RAISE EXCEPTION 'Cantidad disponible insuficiente. Disponible: %', COALESCE(v_inventario_disponible.cantidad, 0);
    END IF;

    -- Reducir disponible
    UPDATE inventario
    SET cantidad = cantidad - p_cantidad,
        updated_at = now()
    WHERE id = v_inventario_disponible.id;

    -- Incrementar perdido
    INSERT INTO inventario (producto_id, estado, cantidad)
    VALUES (p_producto_id, 'perdido', p_cantidad)
    ON CONFLICT (producto_id, estado)
    WHERE asignado_a_conductor_id IS NULL AND asignado_a_vehiculo_id IS NULL
    DO UPDATE SET
      cantidad = inventario.cantidad + p_cantidad,
      updated_at = now();

    -- Eliminar registro disponible si cantidad es 0
    DELETE FROM inventario
    WHERE id = v_inventario_disponible.id AND cantidad = 0;

    -- Registrar movimiento
    INSERT INTO movimientos (
      producto_id, tipo_movimiento, cantidad,
      estado_origen, estado_destino,
      usuario_id, observaciones
    ) VALUES (
      p_producto_id, 'perdida', p_cantidad,
      'disponible', 'perdido',
      p_usuario_id, p_observaciones
    ) RETURNING id INTO v_movimiento_id;

  ELSE
    RAISE EXCEPTION 'Tipo de movimiento no válido: %', p_tipo_movimiento;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'movimiento_id', v_movimiento_id,
    'message', 'Movimiento procesado correctamente'
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$;
