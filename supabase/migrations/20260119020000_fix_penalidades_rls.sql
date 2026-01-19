-- Arreglar RLS de penalidades para permitir SELECT a usuarios autenticados
DROP POLICY IF EXISTS "penalidades_select" ON penalidades;
DROP POLICY IF EXISTS "penalidades_select_auth" ON penalidades;

CREATE POLICY "penalidades_select_auth" ON penalidades 
  FOR SELECT 
  USING (true);

-- También para penalidades_cuotas
DROP POLICY IF EXISTS "penalidades_cuotas_select" ON penalidades_cuotas;
DROP POLICY IF EXISTS "penalidades_cuotas_select_auth" ON penalidades_cuotas;

CREATE POLICY "penalidades_cuotas_select_auth" ON penalidades_cuotas 
  FOR SELECT 
  USING (true);
