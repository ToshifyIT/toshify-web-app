-- Relevamiento (SOLO LECTURA: no cambia nada).
-- Correr en Supabase > SQL Editor y pasarle a Claude el resultado completo
-- (botón de copiar o exportar CSV). Sirve para:
--   1) confirmar qué es la tabla "multas" del reporte de discrepancias;
--   2) ver cómo están hoy las tablas, vistas y funciones del inventario para pasarlo a por sede.

-- 1) Multas: ¿existe la tabla "multas"? ¿cuántas filas tiene y qué columnas?
SELECT 'multas' AS tipo, t.nombre,
       CASE WHEN to_regclass('public.' || t.nombre) IS NULL THEN 'NO EXISTE'
            ELSE 'existe · columnas: ' || (
              SELECT string_agg(column_name || ' ' || data_type, ', ' ORDER BY ordinal_position)
              FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = t.nombre)
       END AS definicion
FROM (VALUES ('multas'), ('multas_historico')) AS t(nombre)

UNION ALL

-- 2) Columnas de las tablas del inventario
SELECT 'tabla', c.table_name,
       string_agg(c.column_name || ' ' || c.data_type, ', ' ORDER BY c.ordinal_position)
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name IN ('inventario', 'movimientos', 'pedidos_inventario', 'pedido_items', 'pedido_seguimiento')
GROUP BY c.table_name

UNION ALL

-- 3) Definición de las vistas del inventario
SELECT 'vista', v.viewname, pg_get_viewdef(('public.' || v.viewname)::regclass, true)
FROM pg_views v
WHERE v.schemaname = 'public'
  AND v.viewname IN ('v_stock_productos', 'v_entradas_en_transito', 'v_pedidos_en_transito', 'v_movimientos_pendientes')

UNION ALL

-- 4) Funciones que leen o escriben el inventario o los movimientos
SELECT 'funcion', p.proname, pg_get_functiondef(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (p.prosrc ILIKE '%inventario%' OR p.prosrc ILIKE '%movimientos%' OR p.prosrc ILIKE '%pedidos_inventario%')

UNION ALL

-- 5) Triggers sobre esas tablas
SELECT 'trigger', tg.tgname || ' ON ' || c.relname, pg_get_triggerdef(tg.oid)
FROM pg_trigger tg
JOIN pg_class c ON c.oid = tg.tgrelid
WHERE NOT tg.tgisinternal
  AND c.relname IN ('inventario', 'movimientos', 'pedidos_inventario', 'pedido_items')

ORDER BY 1, 2;

-- Para ver de dónde salen los datos de la tabla "multas" (si existe y tiene filas):
-- SELECT count(*) AS filas, min(created_at) AS desde, max(created_at) AS hasta FROM multas;
