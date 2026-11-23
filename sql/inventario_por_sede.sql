-- =====================================================================
-- INVENTARIO POR SEDE (2026-11-23)
-- Cada sede tiene su propio stock, sus movimientos y sus pedidos.
-- Lo que ya existe queda en Buenos Aires (sede principal), salvo lo que está
-- asignado a un vehículo: eso queda en la sede del vehículo.
--
-- Correr TODO junto en Supabase > SQL Editor (va en una transacción: si algo
-- falla no queda a medias). Es seguro volver a correrlo.
-- Después de correrlo, subir el frontend que manda la sede (mismo PR).
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- 1. Columnas sede_id
-- ---------------------------------------------------------------------
ALTER TABLE inventario         ADD COLUMN IF NOT EXISTS sede_id uuid REFERENCES sedes(id);
ALTER TABLE movimientos        ADD COLUMN IF NOT EXISTS sede_id uuid REFERENCES sedes(id);
ALTER TABLE pedidos_inventario ADD COLUMN IF NOT EXISTS sede_id uuid REFERENCES sedes(id);

CREATE INDEX IF NOT EXISTS idx_inventario_sede         ON inventario(sede_id);
CREATE INDEX IF NOT EXISTS idx_inventario_sede_prod    ON inventario(sede_id, producto_id, estado);
CREATE INDEX IF NOT EXISTS idx_movimientos_sede        ON movimientos(sede_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_inventario_sede ON pedidos_inventario(sede_id);

-- Sede principal (Buenos Aires): la de respaldo cuando no hay otra forma de saberla
CREATE OR REPLACE FUNCTION public.sede_principal_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT id FROM sedes WHERE es_principal = true ORDER BY nombre LIMIT 1
$$;

-- ---------------------------------------------------------------------
-- 2. Rellenar lo que ya existe
-- ---------------------------------------------------------------------
-- Inventario asignado a un vehículo: sede del vehículo. El resto: Buenos Aires.
UPDATE inventario i
SET sede_id = v.sede_id
FROM vehiculos v
WHERE i.sede_id IS NULL AND i.asignado_a_vehiculo_id = v.id AND v.sede_id IS NOT NULL;

UPDATE inventario SET sede_id = sede_principal_id() WHERE sede_id IS NULL;

-- Pedidos: Buenos Aires.
UPDATE pedidos_inventario SET sede_id = sede_principal_id() WHERE sede_id IS NULL;

-- Movimientos: sede del vehículo, si no la del pedido, si no Buenos Aires.
UPDATE movimientos m
SET sede_id = v.sede_id
FROM vehiculos v
WHERE m.sede_id IS NULL
  AND v.id = COALESCE(m.vehiculo_destino_id, m.vehiculo_origen_id)
  AND v.sede_id IS NOT NULL;

UPDATE movimientos m
SET sede_id = p.sede_id
FROM pedidos_inventario p
WHERE m.sede_id IS NULL AND m.pedido_id = p.id;

UPDATE movimientos SET sede_id = sede_principal_id() WHERE sede_id IS NULL;

-- ---------------------------------------------------------------------
-- 3. Red de seguridad: si algo inserta sin sede, se completa sola
--    (vehículo > pedido > sede del usuario > Buenos Aires)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.inventario_completar_sede()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_sede_vehiculo uuid;
BEGIN
  -- Lo que toca un vehículo va siempre en la sede del vehículo
  IF TG_TABLE_NAME = 'movimientos' AND COALESCE(NEW.vehiculo_destino_id, NEW.vehiculo_origen_id) IS NOT NULL THEN
    SELECT sede_id INTO v_sede_vehiculo FROM vehiculos
    WHERE id = COALESCE(NEW.vehiculo_destino_id, NEW.vehiculo_origen_id);
  ELSIF TG_TABLE_NAME = 'inventario' AND NEW.asignado_a_vehiculo_id IS NOT NULL THEN
    SELECT sede_id INTO v_sede_vehiculo FROM vehiculos WHERE id = NEW.asignado_a_vehiculo_id;
  END IF;
  IF v_sede_vehiculo IS NOT NULL THEN
    NEW.sede_id := v_sede_vehiculo;
    RETURN NEW;
  END IF;

  IF NEW.sede_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'inventario' THEN
    IF NEW.asignado_a_vehiculo_id IS NOT NULL THEN
      SELECT sede_id INTO NEW.sede_id FROM vehiculos WHERE id = NEW.asignado_a_vehiculo_id;
    END IF;

  ELSIF TG_TABLE_NAME = 'movimientos' THEN
    IF COALESCE(NEW.vehiculo_destino_id, NEW.vehiculo_origen_id) IS NOT NULL THEN
      SELECT sede_id INTO NEW.sede_id FROM vehiculos
      WHERE id = COALESCE(NEW.vehiculo_destino_id, NEW.vehiculo_origen_id);
    END IF;
    IF NEW.sede_id IS NULL AND NEW.pedido_id IS NOT NULL THEN
      SELECT sede_id INTO NEW.sede_id FROM pedidos_inventario WHERE id = NEW.pedido_id;
    END IF;
    IF NEW.sede_id IS NULL AND NEW.usuario_id IS NOT NULL THEN
      SELECT sede_id INTO NEW.sede_id FROM user_profiles WHERE id = NEW.usuario_id;
    END IF;

  ELSIF TG_TABLE_NAME = 'pedidos_inventario' THEN
    IF NEW.usuario_registro_id IS NOT NULL THEN
      SELECT sede_id INTO NEW.sede_id FROM user_profiles WHERE id = NEW.usuario_registro_id;
    END IF;
  END IF;

  IF NEW.sede_id IS NULL THEN
    NEW.sede_id := sede_principal_id();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inventario_completar_sede ON inventario;
CREATE TRIGGER trg_inventario_completar_sede BEFORE INSERT ON inventario
  FOR EACH ROW EXECUTE FUNCTION inventario_completar_sede();

DROP TRIGGER IF EXISTS trg_movimientos_completar_sede ON movimientos;
CREATE TRIGGER trg_movimientos_completar_sede BEFORE INSERT ON movimientos
  FOR EACH ROW EXECUTE FUNCTION inventario_completar_sede();

DROP TRIGGER IF EXISTS trg_pedidos_inventario_completar_sede ON pedidos_inventario;
CREATE TRIGGER trg_pedidos_inventario_completar_sede BEFORE INSERT ON pedidos_inventario
  FOR EACH ROW EXECUTE FUNCTION inventario_completar_sede();

-- ---------------------------------------------------------------------
-- 4. Funciones: el stock se busca y se mueve SOLO dentro de la sede
-- ---------------------------------------------------------------------

-- 4a. procesar_movimiento_inventario (la que usa la pantalla Movimientos).
--     Se agrega p_sede_id al final. Se borra la versión anterior con la misma
--     firma para que no queden dos.
DROP FUNCTION IF EXISTS public.procesar_movimiento_inventario(
  uuid, character varying, integer, uuid, uuid, uuid, character varying, uuid, text,
  character varying, uuid, character varying, character varying);

CREATE OR REPLACE FUNCTION public.procesar_movimiento_inventario(
  p_producto_id uuid,
  p_tipo_movimiento character varying,
  p_cantidad integer,
  p_proveedor_id uuid DEFAULT NULL::uuid,
  p_conductor_destino_id uuid DEFAULT NULL::uuid,
  p_vehiculo_destino_id uuid DEFAULT NULL::uuid,
  p_estado_destino character varying DEFAULT 'disponible'::character varying,
  p_usuario_id uuid DEFAULT NULL::uuid,
  p_observaciones text DEFAULT NULL::text,
  p_motivo_salida character varying DEFAULT NULL::character varying,
  p_servicio_id uuid DEFAULT NULL::uuid,
  p_estado_aprobacion character varying DEFAULT 'aprobado'::character varying,
  p_estado_retorno character varying DEFAULT NULL::character varying,
  p_sede_id uuid DEFAULT NULL::uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inventario_id UUID;
  v_stock_actual INTEGER;
  v_movimiento_id UUID;
  v_producto_tipo VARCHAR(50);
  v_es_retornable BOOLEAN;
  v_sede UUID;
BEGIN
  IF p_cantidad <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'La cantidad debe ser mayor a 0');
  END IF;

  SELECT tipo, es_retornable INTO v_producto_tipo, v_es_retornable
  FROM productos WHERE id = p_producto_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Producto no encontrado');
  END IF;

  -- Sede del movimiento: si hay vehículo, la del vehículo (su stock está ahí);
  -- si no, la elegida en pantalla; si no, Buenos Aires
  v_sede := COALESCE(
    (SELECT sede_id FROM vehiculos WHERE id = p_vehiculo_destino_id),
    p_sede_id,
    sede_principal_id());

  -- ===== ENTRADA: siempre en tránsito (pendiente) =====
  IF p_tipo_movimiento = 'entrada' THEN
    IF p_proveedor_id IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Proveedor requerido para entrada');
    END IF;

    INSERT INTO movimientos (producto_id, tipo_movimiento, cantidad, proveedor_id,
      usuario_id, observaciones, estado_aprobacion, sede_id)
    VALUES (p_producto_id, 'entrada', p_cantidad, p_proveedor_id,
      p_usuario_id, p_observaciones, 'pendiente', v_sede)
    RETURNING id INTO v_movimiento_id;

    RETURN json_build_object('success', true, 'movimiento_id', v_movimiento_id,
      'mensaje', 'Entrada registrada en tránsito. Confirma la recepción desde "Pedidos en Tránsito" para agregar al stock.');

  -- ===== SALIDA =====
  ELSIF p_tipo_movimiento = 'salida' THEN
    IF p_proveedor_id IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Proveedor requerido para salida');
    END IF;

    SELECT id, cantidad INTO v_inventario_id, v_stock_actual
    FROM inventario
    WHERE producto_id = p_producto_id AND proveedor_id = p_proveedor_id
      AND estado = 'disponible' AND asignado_a_vehiculo_id IS NULL
      AND sede_id = v_sede
    LIMIT 1;

    IF v_inventario_id IS NULL OR v_stock_actual < p_cantidad THEN
      RETURN json_build_object('success', false, 'error', 'Stock insuficiente en esta sede');
    END IF;

    UPDATE inventario SET cantidad = cantidad - p_cantidad, updated_at = NOW() WHERE id = v_inventario_id;
    DELETE FROM inventario WHERE id = v_inventario_id AND cantidad <= 0;

    INSERT INTO movimientos (producto_id, tipo_movimiento, cantidad, proveedor_id,
      vehiculo_destino_id, usuario_id, observaciones, motivo_salida, servicio_id, estado_aprobacion, sede_id)
    VALUES (p_producto_id, 'salida', p_cantidad, p_proveedor_id,
      p_vehiculo_destino_id, p_usuario_id, p_observaciones, p_motivo_salida, p_servicio_id, 'aprobado', v_sede)
    RETURNING id INTO v_movimiento_id;

    RETURN json_build_object('success', true, 'movimiento_id', v_movimiento_id,
      'mensaje', 'Salida procesada correctamente');

  -- ===== ASIGNACIÓN (uso de herramienta) =====
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

    SELECT id, cantidad INTO v_inventario_id, v_stock_actual
    FROM inventario
    WHERE producto_id = p_producto_id AND proveedor_id = p_proveedor_id
      AND estado = 'disponible' AND asignado_a_vehiculo_id IS NULL
      AND sede_id = v_sede
    LIMIT 1;

    IF v_inventario_id IS NULL OR v_stock_actual < p_cantidad THEN
      RETURN json_build_object('success', false, 'error', 'Stock insuficiente en esta sede');
    END IF;

    UPDATE inventario SET cantidad = cantidad - p_cantidad, updated_at = NOW() WHERE id = v_inventario_id;
    DELETE FROM inventario WHERE id = v_inventario_id AND cantidad <= 0;

    SELECT id INTO v_inventario_id
    FROM inventario
    WHERE producto_id = p_producto_id AND proveedor_id = p_proveedor_id
      AND estado = 'en_uso' AND asignado_a_vehiculo_id = p_vehiculo_destino_id
      AND sede_id = v_sede
    LIMIT 1;

    IF v_inventario_id IS NULL THEN
      INSERT INTO inventario (producto_id, proveedor_id, cantidad, estado, asignado_a_vehiculo_id, sede_id)
      VALUES (p_producto_id, p_proveedor_id, p_cantidad, 'en_uso', p_vehiculo_destino_id, v_sede);
    ELSE
      UPDATE inventario SET cantidad = cantidad + p_cantidad, updated_at = NOW() WHERE id = v_inventario_id;
    END IF;

    INSERT INTO movimientos (producto_id, tipo_movimiento, cantidad, proveedor_id,
      vehiculo_destino_id, usuario_id, observaciones, servicio_id, estado_aprobacion, sede_id)
    VALUES (p_producto_id, 'asignacion', p_cantidad, p_proveedor_id,
      p_vehiculo_destino_id, p_usuario_id, p_observaciones, p_servicio_id, 'aprobado', v_sede)
    RETURNING id INTO v_movimiento_id;

    RETURN json_build_object('success', true, 'movimiento_id', v_movimiento_id,
      'mensaje', 'Asignación procesada correctamente');

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

    SELECT id, cantidad, proveedor_id INTO v_inventario_id, v_stock_actual, p_proveedor_id
    FROM inventario
    WHERE producto_id = p_producto_id AND estado = 'en_uso'
      AND asignado_a_vehiculo_id = p_vehiculo_destino_id
      AND cantidad >= p_cantidad
      AND sede_id = v_sede
    LIMIT 1;

    IF v_inventario_id IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'No hay suficientes items en uso en este vehículo');
    END IF;

    UPDATE inventario SET cantidad = cantidad - p_cantidad, updated_at = NOW() WHERE id = v_inventario_id;
    DELETE FROM inventario WHERE id = v_inventario_id AND cantidad <= 0;

    IF p_estado_retorno = 'operativa' THEN
      SELECT id INTO v_inventario_id
      FROM inventario
      WHERE producto_id = p_producto_id AND proveedor_id = p_proveedor_id
        AND estado = 'disponible' AND asignado_a_vehiculo_id IS NULL
        AND sede_id = v_sede
      LIMIT 1;

      IF v_inventario_id IS NULL THEN
        INSERT INTO inventario (producto_id, proveedor_id, cantidad, estado, sede_id)
        VALUES (p_producto_id, p_proveedor_id, p_cantidad, 'disponible', v_sede);
      ELSE
        UPDATE inventario SET cantidad = cantidad + p_cantidad, updated_at = NOW() WHERE id = v_inventario_id;
      END IF;
    END IF;

    INSERT INTO movimientos (producto_id, tipo_movimiento, cantidad, proveedor_id,
      vehiculo_origen_id, usuario_id, observaciones, estado_retorno, estado_aprobacion, sede_id)
    VALUES (p_producto_id, 'devolucion', p_cantidad, p_proveedor_id,
      p_vehiculo_destino_id, p_usuario_id, p_observaciones, p_estado_retorno, 'aprobado', v_sede)
    RETURNING id INTO v_movimiento_id;

    RETURN json_build_object('success', true, 'movimiento_id', v_movimiento_id,
      'mensaje', 'Devolución procesada correctamente');

  ELSE
    RETURN json_build_object('success', false, 'error', 'Tipo de movimiento no válido');
  END IF;
END;
$function$;

-- 4b. aprobar_rechazar_movimiento (la versión con p_accion, que usa Pedidos).
--     Misma firma: el stock se busca en la sede del movimiento.
CREATE OR REPLACE FUNCTION public.aprobar_rechazar_movimiento(
  p_movimiento_id uuid, p_accion character varying, p_usuario_id uuid, p_motivo_rechazo text DEFAULT NULL::text)
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
  v_sede UUID;
BEGIN
  SELECT * INTO v_movimiento FROM movimientos WHERE id = p_movimiento_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Movimiento no encontrado');
  END IF;
  IF v_movimiento.estado_aprobacion != 'pendiente' THEN
    RETURN json_build_object('success', false, 'error', 'El movimiento ya fue procesado');
  END IF;

  IF p_accion = 'rechazar' THEN
    UPDATE movimientos
    SET estado_aprobacion = 'rechazado', usuario_aprobador_id = p_usuario_id,
        fecha_aprobacion = NOW(), motivo_rechazo = p_motivo_rechazo
    WHERE id = p_movimiento_id;
    RETURN json_build_object('success', true, 'mensaje', 'Movimiento rechazado');
  END IF;

  IF p_accion != 'aprobar' THEN
    RETURN json_build_object('success', false, 'error', 'Accion no valida');
  END IF;

  v_sede := COALESCE(v_movimiento.sede_id, sede_principal_id());

  -- ===== SALIDA =====
  IF v_movimiento.tipo_movimiento = 'salida' THEN
    SELECT id, cantidad INTO v_inventario_id, v_stock_actual
    FROM inventario
    WHERE producto_id = v_movimiento.producto_id AND proveedor_id = v_movimiento.proveedor_id
      AND estado = 'disponible' AND asignado_a_vehiculo_id IS NULL
      AND cantidad >= v_movimiento.cantidad
      AND sede_id = v_sede
    ORDER BY cantidad DESC
    LIMIT 1;

    IF v_inventario_id IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Stock insuficiente en esta sede para aprobar');
    END IF;

    UPDATE inventario SET cantidad = cantidad - v_movimiento.cantidad, updated_at = NOW() WHERE id = v_inventario_id;
    DELETE FROM inventario WHERE id = v_inventario_id AND cantidad <= 0;

  -- ===== ASIGNACIÓN =====
  ELSIF v_movimiento.tipo_movimiento = 'asignacion' THEN
    SELECT id, cantidad INTO v_inventario_id, v_stock_actual
    FROM inventario
    WHERE producto_id = v_movimiento.producto_id AND proveedor_id = v_movimiento.proveedor_id
      AND estado = 'disponible' AND asignado_a_vehiculo_id IS NULL
      AND cantidad >= v_movimiento.cantidad
      AND sede_id = v_sede
    ORDER BY cantidad DESC
    LIMIT 1;

    IF v_inventario_id IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Stock insuficiente en esta sede para asignar');
    END IF;

    UPDATE inventario SET cantidad = cantidad - v_movimiento.cantidad, updated_at = NOW() WHERE id = v_inventario_id;
    DELETE FROM inventario WHERE id = v_inventario_id AND cantidad <= 0;

    SELECT id INTO v_inventario_id
    FROM inventario
    WHERE producto_id = v_movimiento.producto_id AND proveedor_id = v_movimiento.proveedor_id
      AND estado = 'en_uso' AND asignado_a_vehiculo_id = v_movimiento.vehiculo_destino_id
      AND sede_id = v_sede
    LIMIT 1;

    IF v_inventario_id IS NULL THEN
      INSERT INTO inventario (producto_id, proveedor_id, cantidad, estado, asignado_a_vehiculo_id, sede_id)
      VALUES (v_movimiento.producto_id, v_movimiento.proveedor_id, v_movimiento.cantidad, 'en_uso',
              v_movimiento.vehiculo_destino_id, v_sede);
    ELSE
      UPDATE inventario SET cantidad = cantidad + v_movimiento.cantidad, updated_at = NOW() WHERE id = v_inventario_id;
    END IF;

  -- ===== DEVOLUCIÓN =====
  ELSIF v_movimiento.tipo_movimiento = 'devolucion' THEN
    SELECT id, cantidad, proveedor_id INTO v_inventario_id, v_stock_actual, v_proveedor_id
    FROM inventario
    WHERE producto_id = v_movimiento.producto_id AND estado = 'en_uso'
      AND asignado_a_vehiculo_id = v_movimiento.vehiculo_origen_id
      AND cantidad >= v_movimiento.cantidad
      AND sede_id = v_sede
    ORDER BY cantidad DESC
    LIMIT 1;

    IF v_inventario_id IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'No hay suficientes items en uso para devolver');
    END IF;

    UPDATE inventario SET cantidad = cantidad - v_movimiento.cantidad, updated_at = NOW() WHERE id = v_inventario_id;
    DELETE FROM inventario WHERE id = v_inventario_id AND cantidad <= 0;

    IF v_movimiento.estado_retorno = 'operativa' THEN
      SELECT id INTO v_inventario_id
      FROM inventario
      WHERE producto_id = v_movimiento.producto_id AND proveedor_id = v_proveedor_id
        AND estado = 'disponible' AND asignado_a_vehiculo_id IS NULL
        AND sede_id = v_sede
      LIMIT 1;

      IF v_inventario_id IS NULL THEN
        INSERT INTO inventario (producto_id, proveedor_id, cantidad, estado, sede_id)
        VALUES (v_movimiento.producto_id, v_proveedor_id, v_movimiento.cantidad, 'disponible', v_sede);
      ELSE
        UPDATE inventario SET cantidad = cantidad + v_movimiento.cantidad, updated_at = NOW() WHERE id = v_inventario_id;
      END IF;
    END IF;
  END IF;

  UPDATE movimientos
  SET estado_aprobacion = 'aprobado', usuario_aprobador_id = p_usuario_id, fecha_aprobacion = NOW()
  WHERE id = p_movimiento_id;

  RETURN json_build_object('success', true, 'mensaje', 'Movimiento aprobado y ejecutado');
END;
$function$;

-- 4c. confirmar_recepcion_entrada: el stock entra en la sede del movimiento.
CREATE OR REPLACE FUNCTION public.confirmar_recepcion_entrada(
  p_movimiento_id uuid, p_usuario_id uuid, p_cantidad_recibida integer DEFAULT NULL::integer)
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
  v_sede UUID;
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

  v_sede := COALESCE(v_movimiento.sede_id, sede_principal_id());
  v_cantidad_final := COALESCE(p_cantidad_recibida, v_movimiento.cantidad);

  IF v_cantidad_final <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'La cantidad recibida debe ser mayor a 0');
  END IF;
  IF v_cantidad_final > v_movimiento.cantidad THEN
    RETURN json_build_object('success', false, 'error', 'La cantidad recibida no puede superar el saldo pendiente');
  END IF;

  SELECT id INTO v_inventario_id
  FROM inventario
  WHERE producto_id = v_movimiento.producto_id AND proveedor_id = v_movimiento.proveedor_id
    AND estado = 'disponible' AND asignado_a_conductor_id IS NULL AND asignado_a_vehiculo_id IS NULL
    AND sede_id = v_sede
  LIMIT 1;

  IF v_inventario_id IS NULL THEN
    INSERT INTO inventario (producto_id, proveedor_id, cantidad, estado, sede_id)
    VALUES (v_movimiento.producto_id, v_movimiento.proveedor_id, v_cantidad_final, 'disponible', v_sede)
    RETURNING id INTO v_inventario_id;
  ELSE
    UPDATE inventario SET cantidad = cantidad + v_cantidad_final, updated_at = NOW() WHERE id = v_inventario_id;
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

    RETURN json_build_object('success', true,
      'mensaje', 'Recepción parcial confirmada. ' || v_cantidad_final ||
        ' unidades de "' || v_movimiento.producto_nombre ||
        '" ingresaron al stock. Quedan ' || v_saldo_pendiente || ' por recibir.');
  END IF;

  UPDATE movimientos
  SET estado_destino = 'disponible', usuario_aprobador_id = p_usuario_id, fecha_aprobacion = NOW(),
      observaciones = COALESCE(observaciones, '') || ' | Recepción confirmada'
  WHERE id = p_movimiento_id;

  RETURN json_build_object('success', true,
    'mensaje', 'Recepción confirmada. ' || v_cantidad_final ||
      ' unidades de "' || v_movimiento.producto_nombre || '" agregadas al stock.');
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$function$;

-- 4d. crear_pedido_inventario: el pedido queda en la sede elegida (p_sede_id al final).
DROP FUNCTION IF EXISTS public.crear_pedido_inventario(character varying, uuid, date, text, uuid, text);

CREATE OR REPLACE FUNCTION public.crear_pedido_inventario(
  p_numero_pedido character varying, p_proveedor_id uuid, p_fecha_estimada date,
  p_observaciones text, p_usuario_id uuid, p_items text, p_sede_id uuid DEFAULT NULL::uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pedido_id UUID;
  v_item JSON;
  v_items_json JSON;
BEGIN
  v_items_json := p_items::JSON;

  INSERT INTO pedidos_inventario (numero_pedido, proveedor_id, fecha_estimada_llegada, observaciones,
    usuario_registro_id, sede_id)
  VALUES (p_numero_pedido, p_proveedor_id, p_fecha_estimada, p_observaciones, p_usuario_id, p_sede_id)
  RETURNING id INTO v_pedido_id;   -- si p_sede_id viene NULL, el trigger la completa

  FOR v_item IN SELECT * FROM json_array_elements(v_items_json)
  LOOP
    INSERT INTO pedido_items (pedido_id, producto_id, cantidad_pedida)
    VALUES (v_pedido_id, (v_item->>'producto_id')::UUID, (v_item->>'cantidad')::INTEGER);
  END LOOP;

  RETURN json_build_object('success', true, 'pedido_id', v_pedido_id, 'numero_pedido', p_numero_pedido);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$function$;

-- 4e. procesar_recepcion_pedido: el stock entra en la sede del pedido. Misma firma.
CREATE OR REPLACE FUNCTION public.procesar_recepcion_pedido(
  p_pedido_item_id uuid, p_cantidad_recibida integer, p_usuario_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pedido_item RECORD;
  v_inventario_id UUID;
  v_objetivo INTEGER;
  v_cantidad_pendiente INTEGER;
  v_items_pendientes INTEGER;
  v_producto_nombre TEXT;
  v_sede UUID;
BEGIN
  SELECT pi.*, p.numero_pedido, p.proveedor_id, p.sede_id AS pedido_sede_id
  INTO v_pedido_item
  FROM pedido_items pi
  JOIN pedidos_inventario p ON p.id = pi.pedido_id
  WHERE pi.id = p_pedido_item_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Item de pedido no encontrado');
  END IF;

  v_sede := COALESCE(v_pedido_item.pedido_sede_id, sede_principal_id());
  v_objetivo := COALESCE(v_pedido_item.cantidad_confirmada, v_pedido_item.cantidad_pedida);

  IF v_pedido_item.estado_confirmacion = 'rechazado' OR v_objetivo = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Item rechazado por el proveedor, no se puede recibir');
  END IF;

  v_cantidad_pendiente := v_objetivo - v_pedido_item.cantidad_recibida;

  IF p_cantidad_recibida > v_cantidad_pendiente THEN
    RETURN json_build_object('success', false, 'error',
      'Cantidad a recibir excede lo confirmado pendiente (' || v_cantidad_pendiente || ')');
  END IF;
  IF p_cantidad_recibida <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'La cantidad debe ser mayor a 0');
  END IF;

  UPDATE pedido_items
  SET cantidad_recibida = cantidad_recibida + p_cantidad_recibida,
      estado = CASE WHEN cantidad_recibida + p_cantidad_recibida >= v_objetivo
                    THEN 'recibido_completo' ELSE 'recibido_parcial' END,
      updated_at = NOW()
  WHERE id = p_pedido_item_id;

  SELECT id INTO v_inventario_id
  FROM inventario
  WHERE producto_id = v_pedido_item.producto_id AND proveedor_id = v_pedido_item.proveedor_id
    AND estado = 'disponible' AND asignado_a_vehiculo_id IS NULL
    AND sede_id = v_sede
  LIMIT 1;

  IF v_inventario_id IS NULL THEN
    INSERT INTO inventario (producto_id, proveedor_id, cantidad, estado, sede_id)
    VALUES (v_pedido_item.producto_id, v_pedido_item.proveedor_id, p_cantidad_recibida, 'disponible', v_sede)
    RETURNING id INTO v_inventario_id;
  ELSE
    UPDATE inventario SET cantidad = cantidad + p_cantidad_recibida WHERE id = v_inventario_id;
  END IF;

  INSERT INTO movimientos (tipo_movimiento, producto_id, cantidad, proveedor_id, estado_destino,
    usuario_id, pedido_id, observaciones, estado_aprobacion, sede_id)
  VALUES ('entrada', v_pedido_item.producto_id, p_cantidad_recibida, v_pedido_item.proveedor_id, 'disponible',
    p_usuario_id, v_pedido_item.pedido_id, 'Recepcion de pedido ' || v_pedido_item.numero_pedido, 'aprobado', v_sede);

  SELECT COUNT(*) INTO v_items_pendientes
  FROM pedido_items
  WHERE pedido_id = v_pedido_item.pedido_id
    AND estado != 'recibido_completo'
    AND estado_confirmacion != 'rechazado';

  UPDATE pedidos_inventario
  SET estado = CASE WHEN v_items_pendientes = 0 THEN 'recibido_completo' ELSE 'recibido_parcial' END,
      updated_at = NOW()
  WHERE id = v_pedido_item.pedido_id;

  SELECT nombre INTO v_producto_nombre FROM productos WHERE id = v_pedido_item.producto_id;
  INSERT INTO pedido_seguimiento (pedido_id, evento, descripcion, datos, usuario_id)
  VALUES (v_pedido_item.pedido_id, 'recepcion',
    'Entrada al stock: ' || p_cantidad_recibida || ' u. de "' || COALESCE(v_producto_nombre,'') || '" (movimiento entrada aprobado)',
    jsonb_build_object('producto_id', v_pedido_item.producto_id, 'cantidad', p_cantidad_recibida,
                       'item_id', p_pedido_item_id, 'objetivo', v_objetivo),
    p_usuario_id);

  RETURN json_build_object('success', true, 'mensaje', 'Recepcion procesada correctamente',
    'cantidad_recibida', p_cantidad_recibida, 'items_pendientes', v_items_pendientes);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$function$;

-- ---------------------------------------------------------------------
-- 5. Vistas con sede_id (al final, para no romper a quien ya las usa)
-- ---------------------------------------------------------------------
-- Stock: una fila por producto y sede (todas las sedes activas, aunque no tengan
-- stock, para que el producto aparezca en 0). Con "Todas" el frontend suma por producto.
DROP VIEW IF EXISTS public.v_stock_productos;
CREATE VIEW public.v_stock_productos AS
SELECT p.id,
    p.codigo,
    p.nombre,
    p.es_retornable,
    c.nombre AS categoria,
    COALESCE(sum(CASE WHEN i.estado::text = ANY (ARRAY['disponible', 'en_uso', 'dañado']) THEN i.cantidad ELSE 0 END), 0) AS stock_total,
    COALESCE(sum(CASE WHEN i.estado::text = 'disponible' THEN i.cantidad ELSE 0 END), 0) AS disponible,
    COALESCE(sum(CASE WHEN i.estado::text = 'en_uso' THEN i.cantidad ELSE 0 END), 0) AS en_uso,
    COALESCE(sum(CASE WHEN i.estado::text = 'dañado' THEN i.cantidad ELSE 0 END), 0) AS "dañado",
    COALESCE(sum(CASE WHEN i.estado::text = 'perdido' THEN i.cantidad ELSE 0 END), 0) AS perdido,
    s.id AS sede_id
FROM productos p
CROSS JOIN sedes s
LEFT JOIN inventario i ON i.producto_id = p.id AND i.sede_id = s.id
LEFT JOIN categorias c ON p.categoria_id = c.id
WHERE s.activa = true
GROUP BY p.id, p.codigo, p.nombre, p.es_retornable, c.nombre, s.id;

CREATE OR REPLACE VIEW public.v_entradas_en_transito AS
SELECT m.id,
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
    aprobador.full_name AS aprobador_nombre,
    m.sede_id
FROM movimientos m
JOIN productos prod ON prod.id = m.producto_id
LEFT JOIN proveedores prov ON prov.id = m.proveedor_id
LEFT JOIN user_profiles u ON u.id = m.usuario_id
LEFT JOIN user_profiles aprobador ON aprobador.id = m.usuario_aprobador_id
WHERE m.tipo_movimiento::text = 'entrada' AND m.estado_aprobacion::text = 'aprobado'
  AND m.pedido_id IS NULL AND m.estado_destino::text IS DISTINCT FROM 'disponible'
ORDER BY m.created_at DESC;

CREATE OR REPLACE VIEW public.v_movimientos_pendientes AS
SELECT m.id,
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
    u.full_name AS usuario_registrador_nombre,
    m.sede_id
FROM movimientos m
JOIN productos prod ON prod.id = m.producto_id
LEFT JOIN proveedores prov ON prov.id = m.proveedor_id
LEFT JOIN vehiculos v ON v.id = COALESCE(m.vehiculo_destino_id, m.vehiculo_origen_id)
LEFT JOIN user_profiles u ON u.id = m.usuario_id
WHERE m.estado_aprobacion::text = 'pendiente'
ORDER BY m.created_at;

CREATE OR REPLACE VIEW public.v_pedidos_en_transito AS
SELECT p.id AS pedido_id,
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
    pi.cantidad_pedida - pi.cantidad_recibida AS cantidad_pendiente,
    pi.estado AS estado_item,
    u.full_name AS usuario_registro,
    p.estado_respuesta,
    p.fecha_respuesta,
    p.fecha_comprometida,
    pi.cantidad_confirmada,
    pi.estado_confirmacion,
    pi.fecha_estimada_item,
    pi.precio_unitario,
    p.sede_id
FROM pedidos_inventario p
JOIN proveedores prov ON prov.id = p.proveedor_id
JOIN pedido_items pi ON pi.pedido_id = p.id
JOIN productos prod ON prod.id = pi.producto_id
LEFT JOIN user_profiles u ON u.id = p.usuario_registro_id
WHERE p.estado::text = ANY (ARRAY['en_transito', 'recibido_parcial'])
ORDER BY p.fecha_pedido DESC, prod.nombre;

-- Permisos de las vistas (se recrearon)
GRANT SELECT ON public.v_stock_productos, public.v_entradas_en_transito,
  public.v_movimientos_pendientes, public.v_pedidos_en_transito TO authenticated;

COMMIT;

-- Verificación rápida (opcional):
-- SELECT s.nombre, count(*) AS filas, sum(i.cantidad) AS unidades
-- FROM inventario i JOIN sedes s ON s.id = i.sede_id GROUP BY s.nombre;
