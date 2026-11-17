-- =====================================================
-- MCP: quitar los permisos de Hireflix de las API keys
-- =====================================================
-- Las herramientas de Hireflix se sacaron del MCP (buscar, obtener, crear, actualizar y
-- eliminar). Este script borra hireflix:read, hireflix:create, hireflix:update y
-- hireflix:delete de las keys que los tengan. El resto de los permisos no se toca.
-- api_keys.permissions es jsonb (un array de textos).
--
-- No borra la tabla hireflix_historico (queda fuera de alcance).
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente: se puede correr de nuevo.

-- Antes: keys que tienen algún permiso de Hireflix
SELECT name, permissions
FROM public.api_keys
WHERE permissions ?| ARRAY['hireflix:read', 'hireflix:create', 'hireflix:update', 'hireflix:delete'];

UPDATE public.api_keys
SET permissions = COALESCE((
  SELECT jsonb_agg(p ORDER BY n)
  FROM jsonb_array_elements_text(permissions) WITH ORDINALITY AS t(p, n)
  WHERE p NOT IN ('hireflix:read', 'hireflix:create', 'hireflix:update', 'hireflix:delete')
), '[]'::jsonb)
WHERE permissions ?| ARRAY['hireflix:read', 'hireflix:create', 'hireflix:update', 'hireflix:delete'];

-- Después: tiene que dar 0 filas
SELECT name, permissions
FROM public.api_keys
WHERE permissions ?| ARRAY['hireflix:read', 'hireflix:create', 'hireflix:update', 'hireflix:delete'];
