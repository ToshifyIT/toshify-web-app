-- Corrige la variante usada por la app:
-- aprobar_rechazar_movimiento(p_movimiento_id, p_accion, p_usuario_id, p_motivo_rechazo)
--
-- Problemas corregidos:
-- 1. Asignacion usaba ON CONFLICT sin constraint unico en inventario.
-- 2. Salida/asignacion podian quedar aprobadas logicamente antes de validar stock.
-- 3. Devolucion operativa no recuperaba el proveedor real desde el inventario en uso.

CREATE OR REPLACE FUNCTION public.aprobar_rechazar_movimiento(
  p_movimiento_id uuid,
  p_accion character varying,
  p_usuario_id uuid,
  p_motivo_rechazo text DEFAULT NULL::text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_movimiento RECORD;
  v_inventario_id UUID;
  v_stock_actual INTEGER;
  v_proveedor_id UUID;
BEGIN
  SELECT * INTO v_movimiento
  FROM movimientos
  WHERE id = p_movimiento_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Movimiento no encontrado');
  END IF;

  IF v_movimiento.estado_aprobacion != 'pendiente' THEN
    RETURN json_build_object('success', false, 'error', 'El movimiento ya fue procesado');
  END IF;

  IF p_accion = 'rechazar' THEN
    UPDATE movimientos
    SET
      estado_aprobacion = 'rechazado',
      usuario_aprobador_id = p_usuario_id,
      fecha_aprobacion = NOW(),
      motivo_rechazo = p_motivo_rechazo
    WHERE id = p_movimiento_id;

    RETURN json_build_object('success', true, 'mensaje', 'Movimiento rechazado');
  END IF;

  IF p_accion != 'aprobar' THEN
    RETURN json_build_object('success', false, 'error', 'Accion no valida');
  END IF;

  -- ===== SALIDA =====
  IF v_movimiento.tipo_movimiento = 'salida' THEN
    SELECT id, cantidad INTO v_inventario_id, v_stock_actual
    FROM inventario
    WHERE producto_id = v_movimiento.producto_id
      AND proveedor_id = v_movimiento.proveedor_id
      AND estado = 'disponible'
      AND asignado_a_vehiculo_id IS NULL
      AND cantidad >= v_movimiento.cantidad
    ORDER BY cantidad DESC
    LIMIT 1;

    IF v_inventario_id IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Stock insuficiente para aprobar');
    END IF;

    UPDATE inventario
    SET cantidad = cantidad - v_movimiento.cantidad,
        updated_at = NOW()
    WHERE id = v_inventario_id;

    DELETE FROM inventario WHERE id = v_inventario_id AND cantidad <= 0;

  -- ===== ASIGNACION =====
  ELSIF v_movimiento.tipo_movimiento = 'asignacion' THEN
    SELECT id, cantidad INTO v_inventario_id, v_stock_actual
    FROM inventario
    WHERE producto_id = v_movimiento.producto_id
      AND proveedor_id = v_movimiento.proveedor_id
      AND estado = 'disponible'
      AND asignado_a_vehiculo_id IS NULL
      AND cantidad >= v_movimiento.cantidad
    ORDER BY cantidad DESC
    LIMIT 1;

    IF v_inventario_id IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Stock insuficiente para asignar');
    END IF;

    UPDATE inventario
    SET cantidad = cantidad - v_movimiento.cantidad,
        updated_at = NOW()
    WHERE id = v_inventario_id;

    DELETE FROM inventario WHERE id = v_inventario_id AND cantidad <= 0;

    SELECT id INTO v_inventario_id
    FROM inventario
    WHERE producto_id = v_movimiento.producto_id
      AND proveedor_id = v_movimiento.proveedor_id
      AND estado = 'en_uso'
      AND asignado_a_vehiculo_id = v_movimiento.vehiculo_destino_id
    LIMIT 1;

    IF v_inventario_id IS NULL THEN
      INSERT INTO inventario (
        producto_id,
        proveedor_id,
        cantidad,
        estado,
        asignado_a_vehiculo_id
      )
      VALUES (
        v_movimiento.producto_id,
        v_movimiento.proveedor_id,
        v_movimiento.cantidad,
        'en_uso',
        v_movimiento.vehiculo_destino_id
      );
    ELSE
      UPDATE inventario
      SET cantidad = cantidad + v_movimiento.cantidad,
          updated_at = NOW()
      WHERE id = v_inventario_id;
    END IF;

  -- ===== DEVOLUCION =====
  ELSIF v_movimiento.tipo_movimiento = 'devolucion' THEN
    SELECT id, cantidad, proveedor_id
    INTO v_inventario_id, v_stock_actual, v_proveedor_id
    FROM inventario
    WHERE producto_id = v_movimiento.producto_id
      AND estado = 'en_uso'
      AND asignado_a_vehiculo_id = v_movimiento.vehiculo_origen_id
      AND cantidad >= v_movimiento.cantidad
    ORDER BY cantidad DESC
    LIMIT 1;

    IF v_inventario_id IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'No hay suficientes items en uso para devolver');
    END IF;

    UPDATE inventario
    SET cantidad = cantidad - v_movimiento.cantidad,
        updated_at = NOW()
    WHERE id = v_inventario_id;

    DELETE FROM inventario WHERE id = v_inventario_id AND cantidad <= 0;

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
        UPDATE inventario
        SET cantidad = cantidad + v_movimiento.cantidad,
            updated_at = NOW()
        WHERE id = v_inventario_id;
      END IF;
    END IF;
  END IF;

  UPDATE movimientos
  SET
    estado_aprobacion = 'aprobado',
    usuario_aprobador_id = p_usuario_id,
    fecha_aprobacion = NOW()
  WHERE id = p_movimiento_id;

  RETURN json_build_object('success', true, 'mensaje', 'Movimiento aprobado y ejecutado');
END;
$function$;
