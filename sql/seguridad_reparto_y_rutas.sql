-- sql/seguridad_reparto_y_rutas.sql — 2026-11-05
-- Ajustes de seguridad antes del pase (revisión del 05/11). NO cambia datos: sólo
-- redefine funciones y permisos. Se puede ejecutar más de una vez.
--  1. repartir_guias_vehiculos: sólo administradores (o el editor SQL, sin usuario).
--     Antes cualquier usuario logueado podía llamarla y rehacer los responsables.
--  2. aplicar_reparto_guias_turnos / plan_reparto_guias_turnos: ya no se pueden
--     llamar desde la web (sólo las usa repartir_guias_vehiculos).
--  3. Funciones del tope diario de Google: sin acceso anónimo, y una devolución
--     no puede bajar más de 500 del contador del día.
-- Los mismos cambios ya están en vehiculos_guia_reparto_turnos.sql y
-- parejas_lead_rutas.sql (para cuando se vuelvan a crear desde cero).

BEGIN;

CREATE OR REPLACE FUNCTION repartir_guias_vehiculos(p_sede_id uuid DEFAULT NULL, p_rehacer boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v record;
  v_total int := 0;
BEGIN
  -- Sólo administradores (o el editor SQL de Supabase, sin usuario logueado)
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM user_profiles up JOIN roles r ON r.id = up.role_id
    WHERE up.id = auth.uid() AND r.name = 'admin'
  ) THEN
    RAISE EXCEPTION 'Sólo un administrador puede repartir los responsables';
  END IF;

  IF p_rehacer THEN
    FOR v IN
      SELECT DISTINCT ve.sede_id
      FROM vehiculos ve
      WHERE ve.deleted_at IS NULL AND ve.sede_id IS NOT NULL
        AND (p_sede_id IS NULL OR ve.sede_id = p_sede_id)
        AND vehiculo_es_operativo(ve.estado_id)
    LOOP
      v_total := v_total + aplicar_reparto_guias_turnos(v.sede_id);
    END LOOP;
    RETURN v_total;
  END IF;

  PERFORM set_config('toshify.repartiendo_guias', 'on', true);
  FOR v IN
    SELECT ve.id, ve.sede_id
    FROM vehiculos ve
    WHERE ve.deleted_at IS NULL
      AND ve.guia_responsable IS NULL
      AND (p_sede_id IS NULL OR ve.sede_id = p_sede_id)
      AND vehiculo_es_operativo(ve.estado_id)
    ORDER BY ve.id
  LOOP
    UPDATE vehiculos SET guia_responsable = elegir_guia_vehiculo(v.id, v.sede_id) WHERE id = v.id;
    v_total := v_total + 1;
  END LOOP;
  PERFORM set_config('toshify.repartiendo_guias', 'off', true);
  RETURN v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION repartir_guias_vehiculos(uuid, boolean) TO authenticated;
REVOKE EXECUTE ON FUNCTION repartir_guias_vehiculos(uuid, boolean) FROM PUBLIC, anon;
-- Funciones internas: sólo las llama repartir_guias_vehiculos (no desde la web)
REVOKE EXECUTE ON FUNCTION aplicar_reparto_guias_turnos(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION plan_reparto_guias_turnos(uuid) FROM PUBLIC, anon, authenticated;

-- Devuelve una reserva que no se usó (por ejemplo, si Google rechazó el pedido).
CREATE OR REPLACE FUNCTION public.devolver_mediciones_rutas(p_cantidad integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  -- Tope por llamada: una devolución es de un solo lead (como mucho unos cientos de
  -- tramos). Evita que una llamada suelta deje el contador del día en cero.
  UPDATE rutas_consumo_diario
     SET elementos = greatest(0, elementos - least(500, greatest(0, coalesce(p_cantidad, 0))))
   WHERE dia = (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
$$;


REVOKE EXECUTE ON FUNCTION public.tomar_leads_para_rutas(uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reservar_mediciones_rutas(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.devolver_mediciones_rutas(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devolver_mediciones_rutas(integer) TO authenticated;

COMMIT;
