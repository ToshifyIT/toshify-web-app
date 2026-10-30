-- "Actualizar desde Geotab" en todas las semanas (2026-10-29)
--
-- 1. Permiso de geotab_resync_solicitudes: se quitan las condiciones de "período de
--    facturación cerrado" y "hasta 63 días atrás". Queda: pedido propio, pendiente y de
--    una semana ya empezada.
-- 2. Trigger trg_geotab_resync_multas: además de sincronizar las multas, deja en
--    resumen->'excesos_afectados' las incidencias de exceso de km de esa semana y sede
--    cuyo conductor tuvo viajes que cambiaron de conductor (resumen->'conductores_afectados').
--    Esos cobros no se recalculan: se listan para revisarlos a mano.
--
-- El runner (/root/GeoTab-Pro/geotab_resync_runner.py) se ajusta aparte: deja de rechazar
-- las semanas con el período cerrado.
--
-- Rollback del permiso: volver a crear la política con las dos condiciones quitadas
-- (ver sql/geotab_resync_semana.sql en el servidor / historial).
--
-- Ejecutar como supabase_admin.

BEGIN;

DROP POLICY IF EXISTS "geotab_resync insert" ON geotab_resync_solicitudes;
CREATE POLICY "geotab_resync insert" ON geotab_resync_solicitudes
  FOR INSERT TO authenticated
  WITH CHECK (
    estado = 'pendiente'
    AND solicitado_por = auth.uid()
    AND desde <= (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
  );

CREATE OR REPLACE FUNCTION public.trg_geotab_resync_multas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.estado = 'terminado' AND OLD.estado IS DISTINCT FROM 'terminado' THEN
    BEGIN
      NEW.resumen := coalesce(NEW.resumen, '{}'::jsonb)
        || jsonb_build_object('multas', public.sincronizar_multas_geotab(NEW.desde, NEW.hasta, NEW.sede_id));
    EXCEPTION WHEN others THEN
      NEW.resumen := coalesce(NEW.resumen, '{}'::jsonb)
        || jsonb_build_object('multas', jsonb_build_object('error', SQLERRM));
    END;

    -- Cobros de exceso de km de la semana cuyo conductor tuvo viajes reasignados.
    BEGIN
      NEW.resumen := NEW.resumen || jsonb_build_object('excesos_afectados', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
                 'conductor', trim(c.nombres || ' ' || c.apellidos),
                 'patente', i.vehiculo_patente,
                 'km_exceso', i.km_exceso,
                 'monto', i.monto) ORDER BY c.apellidos), '[]'::jsonb)
        FROM incidencias i
        JOIN conductores c ON c.id = i.conductor_id
        WHERE i.tipo_cobro_descuento_id = (
                SELECT id FROM tipos_cobro_descuento WHERE nombre = 'Exceso de kilometraje' LIMIT 1)
          AND i.semana = NEW.semana
          AND i.fecha BETWEEN NEW.desde AND NEW.hasta + 60
          AND (i.sede_id = NEW.sede_id OR i.sede_id IS NULL)
          AND upper(translate(regexp_replace(trim(c.nombres || ' ' || c.apellidos), '\s+', ' ', 'g'),
                              'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN'))
              IN (SELECT upper(translate(regexp_replace(trim(x), '\s+', ' ', 'g'),
                                         'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN'))
                  FROM jsonb_array_elements_text(coalesce(NEW.resumen->'conductores_afectados', '[]'::jsonb)) x)
      ));
    EXCEPTION WHEN others THEN
      NEW.resumen := NEW.resumen || jsonb_build_object('excesos_afectados_error', SQLERRM);
    END;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_geotab_resync_multas() FROM public, anon, authenticated;

SELECT polname, pg_get_expr(polwithcheck, polrelid) AS condicion
FROM pg_policy WHERE polrelid = 'geotab_resync_solicitudes'::regclass AND polname = 'geotab_resync insert';

COMMIT;
