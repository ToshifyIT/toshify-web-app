-- =====================================================
-- Inventario: confirmar ingresos manuales por seguimiento
-- =====================================================
-- La vista de "Ingresos por confirmar" muestra entradas aprobadas, pero
-- el RPC anterior buscaba entradas pendientes. Al confirmar, tampoco dejaba
-- una marca para sacar el ingreso de la vista.
--
-- Regla funcional:
-- - Un ingreso manual aprobado queda visible hasta confirmar recepción.
-- - Confirmación total: suma stock disponible y cierra el pendiente.
-- - Confirmación parcial: suma lo recibido y deja visible solo el saldo.

BEGIN;

CREATE OR REPLACE FUNCTION public.confirmar_recepcion_entrada(
  p_movimiento_id uuid,
  p_usuario_id uuid,
  p_cantidad_recibida integer DEFAULT NULL::integer
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_movimiento RECORD;
  v_cantidad_final INTEGER;
  v_saldo_pendiente INTEGER;
  v_inventario_id UUID;
BEGIN
  SELECT m.*, prod.nombre AS producto_nombre
  INTO v_movimiento
  FROM movimientos m
  JOIN productos prod ON prod.id = m.producto_id
  WHERE m.id = p_movimiento_id
    AND m.tipo_movimiento = 'entrada'
    AND m.estado_aprobacion = 'aprobado'
    AND m.pedido_id IS NULL
    AND m.estado_destino IS DISTINCT FROM 'disponible';

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Movimiento no encontrado o ya procesado');
  END IF;

  v_cantidad_final := COALESCE(p_cantidad_recibida, v_movimiento.cantidad);

  IF v_cantidad_final <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'La cantidad recibida debe ser mayor a 0');
  END IF;

  IF v_cantidad_final > v_movimiento.cantidad THEN
    RETURN json_build_object(
      'success', false,
      'error', 'La cantidad recibida no puede superar el saldo pendiente'
    );
  END IF;

  SELECT id INTO v_inventario_id
  FROM inventario
  WHERE producto_id = v_movimiento.producto_id
    AND proveedor_id = v_movimiento.proveedor_id
    AND estado = 'disponible'
    AND asignado_a_conductor_id IS NULL
    AND asignado_a_vehiculo_id IS NULL
  LIMIT 1;

  IF v_inventario_id IS NULL THEN
    INSERT INTO inventario (producto_id, proveedor_id, cantidad, estado)
    VALUES (v_movimiento.producto_id, v_movimiento.proveedor_id, v_cantidad_final, 'disponible')
    RETURNING id INTO v_inventario_id;
  ELSE
    UPDATE inventario
    SET cantidad = cantidad + v_cantidad_final,
        updated_at = NOW()
    WHERE id = v_inventario_id;
  END IF;

  v_saldo_pendiente := v_movimiento.cantidad - v_cantidad_final;

  IF v_saldo_pendiente > 0 THEN
    UPDATE movimientos
    SET cantidad = v_saldo_pendiente,
        usuario_aprobador_id = p_usuario_id,
        fecha_aprobacion = NOW(),
        observaciones = COALESCE(observaciones, '') ||
          ' | Recepción parcial: ingresaron ' || v_cantidad_final ||
          ' de ' || v_movimiento.cantidad || ' unidades'
    WHERE id = p_movimiento_id;

    RETURN json_build_object(
      'success', true,
      'mensaje', 'Recepción parcial confirmada. ' || v_cantidad_final ||
        ' unidades de "' || v_movimiento.producto_nombre ||
        '" ingresaron al stock. Quedan ' || v_saldo_pendiente || ' por recibir.'
    );
  END IF;

  UPDATE movimientos
  SET estado_destino = 'disponible',
      usuario_aprobador_id = p_usuario_id,
      fecha_aprobacion = NOW(),
      observaciones = COALESCE(observaciones, '') || ' | Recepción confirmada'
  WHERE id = p_movimiento_id;

  RETURN json_build_object(
    'success', true,
    'mensaje', 'Recepción confirmada. ' || v_cantidad_final ||
      ' unidades de "' || v_movimiento.producto_nombre || '" agregadas al stock.'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$function$;

CREATE OR REPLACE VIEW public.v_entradas_en_transito AS
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
  u.full_name AS usuario_registro,
  m.estado_aprobacion,
  m.fecha_aprobacion,
  aprobador.full_name AS aprobador_nombre
FROM movimientos m
JOIN productos prod ON prod.id = m.producto_id
LEFT JOIN proveedores prov ON prov.id = m.proveedor_id
LEFT JOIN user_profiles u ON u.id = m.usuario_id
LEFT JOIN user_profiles aprobador ON aprobador.id = m.usuario_aprobador_id
WHERE m.tipo_movimiento::text = 'entrada'::text
  AND m.estado_aprobacion::text = 'aprobado'::text
  AND m.pedido_id IS NULL
  AND m.estado_destino IS DISTINCT FROM 'disponible'
ORDER BY m.created_at DESC;

COMMIT;
