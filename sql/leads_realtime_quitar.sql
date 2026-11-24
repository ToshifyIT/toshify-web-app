-- =====================================================
-- Sacar leads de Realtime (2026-11-25)
-- =====================================================
-- Deshace sql/leads_realtime.sql. Desde que leads se agregó a la publicación
-- supabase_realtime (23/11), Realtime revisa cada cambio de un lead (Sellium, BCRA,
-- geolocalización, capitanes) contra cada pantalla suscrita, y cada pantalla de Leads
-- abierta vuelve a pedir los leads que cambiaron. pg_stat_statements: Realtime es lo
-- que más tiempo de base consume (160.000 s) y las recargas de leads lo siguen
-- (53.000 llamadas de 0,4 a 0,6 s). Resultado: toda la app lenta.
--
-- La pantalla Leads sigue funcionando: los cambios se ven con Actualizar o al recargar.
-- Se puede ejecutar más de una vez. Para volver atrás: sql/leads_realtime.sql.

-- Antes: qué tablas transmite Realtime
SELECT 'antes' AS momento, tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' ORDER BY tablename;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'leads'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.leads;
    RAISE NOTICE 'OK: leads sacada de supabase_realtime';
  ELSE
    RAISE NOTICE 'OK: leads ya no estaba en supabase_realtime';
  END IF;
END $$;

-- Después
SELECT 'despues' AS momento, tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' ORDER BY tablename;
