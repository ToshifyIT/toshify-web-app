-- =====================================================
-- FIX: Función crear_pedido_inventario - Recibe TEXT y parsea a JSON
-- =====================================================

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
