-- sql/leads_indice_listado.sql
-- Índice para el listado de Leads (2026-11-04).
--
-- La pantalla trae todos los leads de a 1000, ordenados por fecha de creación (más
-- nuevos primero) y desempatando por id, filtrando por sede. Sin un índice con ese
-- orden, la base ordena los ~12.000 leads en cada página: las últimas páginas tardan
-- casi 1 s cada una. Con el índice las recorre en orden.
--
-- Se puede correr más de una vez. CONCURRENTLY no bloquea la tabla mientras se crea
-- (por eso va fuera de una transacción: correrlo solo, no dentro de BEGIN/COMMIT).

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_listado
  ON leads (created_at DESC, id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_sede_listado
  ON leads (sede_id, created_at DESC, id);
