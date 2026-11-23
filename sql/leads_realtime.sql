-- =====================================================
-- Leads en tiempo real (2026-11-23)
-- =====================================================
-- Agrega la tabla leads a la publicación supabase_realtime para que la pantalla
-- Leads reciba los altas y cambios (Sellium, formulario web, otros usuarios) sin
-- tocar Actualizar. Ver LeadsModule.tsx, efecto "Tiempo real".
--
-- No cambia REPLICA IDENTITY: la app solo usa el id del evento y vuelve a pedir
-- la fila con sus propios filtros (sede y RLS), así que no hace falta FULL.
--
-- Se puede ejecutar más de una vez.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename  = 'leads'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
      RAISE NOTICE 'OK: leads agregada a supabase_realtime';
    ELSE
      RAISE NOTICE 'OK: leads ya estaba en supabase_realtime';
    END IF;
  ELSE
    RAISE NOTICE 'AVISO: no existe la publicación supabase_realtime';
  END IF;
END $$;

-- Verificación: debe devolver una fila.
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND tablename = 'leads';
