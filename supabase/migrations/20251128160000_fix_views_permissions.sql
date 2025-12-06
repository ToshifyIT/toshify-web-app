-- =====================================================
-- MIGRACIÓN: Permisos para vistas de inventario
-- Fecha: 2025-11-28
-- =====================================================

-- Otorgar permisos de lectura a las vistas para usuarios autenticados
GRANT SELECT ON v_pedidos_en_transito TO authenticated;
GRANT SELECT ON v_movimientos_pendientes TO authenticated;

-- Habilitar RLS en las nuevas tablas
ALTER TABLE pedidos_inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedido_items ENABLE ROW LEVEL SECURITY;

-- Políticas para pedidos_inventario
DROP POLICY IF EXISTS "Users can view all pedidos" ON pedidos_inventario;
CREATE POLICY "Users can view all pedidos" ON pedidos_inventario
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can insert pedidos" ON pedidos_inventario;
CREATE POLICY "Users can insert pedidos" ON pedidos_inventario
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update pedidos" ON pedidos_inventario;
CREATE POLICY "Users can update pedidos" ON pedidos_inventario
  FOR UPDATE TO authenticated USING (true);

-- Políticas para pedido_items
DROP POLICY IF EXISTS "Users can view all pedido_items" ON pedido_items;
CREATE POLICY "Users can view all pedido_items" ON pedido_items
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can insert pedido_items" ON pedido_items;
CREATE POLICY "Users can insert pedido_items" ON pedido_items
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update pedido_items" ON pedido_items;
CREATE POLICY "Users can update pedido_items" ON pedido_items
  FOR UPDATE TO authenticated USING (true);
