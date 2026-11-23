-- =====================================================
-- Leads: el capitán pasa a quien trabaja el lead (2026-11-23)
-- =====================================================
-- Marina y Manuel ya no están (sus leads siguen mostrándolos). Los capitanes activos
-- son Ali Verenzuela, Carla Noguera y Eunice D'Urso (src/modules/leads/guias.ts).
--
-- Regla: cuando un capitán activo cambia el estado o carga datos de un lead que no
-- tiene capitán, o que tiene uno que ya no está (Marina, Manuel u otro), el lead pasa
-- a ser de ese capitán.
--
-- No cambia nada cuando:
--   - el lead ya tiene un capitán activo (no se le "roba" el lead a otro capitán);
--   - quien edita no es uno de los tres capitanes (administradores, data entry, etc.);
--   - en la misma edición se eligió el capitán a mano;
--   - el cambio es automático: ubicación en el mapa, zona, edad, consulta al BCRA,
--     datos de actividad de WhatsApp o fecha de actualización;
--   - lo hace el servidor (cargas de Sellium, sincronizaciones): no hay usuario.
--
-- Los leads viejos de Marina y Manuel no se reasignan de una vez: no queda registro de
-- quién cambió cada estado. Pasan al capitán que los vuelva a trabajar.
-- Idempotente (se puede correr más de una vez).

CREATE OR REPLACE FUNCTION leads_capitan_por_actividad()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Columnas que se actualizan solas: cambiarlas no es "trabajar" el lead
  v_automaticas text[] := ARRAY[
    'updated_at', 'zona', 'edad', 'latitud', 'longitud',
    'direccion_latitud', 'direccion_longitud', 'direccion_geocode_estado', 'direccion_geocode_fecha',
    'bcra', 'bcra_cheques', 'bcra_consultado_at', 'bcra_cuil', 'bcra_cuil_origen', 'bcra_detalle',
    'bcra_deuda_total', 'bcra_error', 'bcra_intentos', 'bcra_nivel', 'bcra_nivel_motivo',
    'bcra_nombre', 'bcra_resumen', 'bcra_situacion',
    'ultima_actividad', 'last_contacted', 'last_heard_from', 'last_seen',
    'entrevistador_asignado'
  ];
  v_actual text := lower(btrim(coalesce(NEW.entrevistador_asignado, '')));
  v_nombre text;
  v_usuario text;
  v_capitan text;
BEGIN
  -- Sin usuario (servidor, service role): no se toca
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  -- El capitán se eligió a mano en esta misma edición
  IF NEW.entrevistador_asignado IS DISTINCT FROM OLD.entrevistador_asignado THEN
    RETURN NEW;
  END IF;
  -- Ya tiene un capitán activo
  IF split_part(v_actual, ' ', 1) IN ('ali', 'carla', 'eunice') THEN
    RETURN NEW;
  END IF;
  -- Solo cuenta si cambió algo además de lo automático
  IF (to_jsonb(NEW) - v_automaticas) = (to_jsonb(OLD) - v_automaticas) THEN
    RETURN NEW;
  END IF;

  -- ¿Quien edita es un capitán activo? Por el nombre del perfil o por el usuario del email
  SELECT lower(translate(btrim(coalesce(full_name, '')), 'áéíóúÁÉÍÓÚ''', 'aeiouaeiou')),
         lower(split_part(coalesce(email, ''), '@', 1))
    INTO v_nombre, v_usuario
    FROM user_profiles WHERE id = auth.uid();

  v_capitan := CASE
    WHEN v_nombre LIKE 'ali verenzuela%' OR v_usuario LIKE 'ali.verenzuela%' THEN 'Ali Verenzuela'
    WHEN v_nombre LIKE 'carla noguera%' OR v_usuario LIKE 'carla.n%' THEN 'Carla Noguera'
    WHEN v_nombre LIKE 'eunice%urso%' OR v_usuario LIKE 'eunice.d%' THEN 'Eunice D''Urso'
    ELSE NULL
  END;

  IF v_capitan IS NOT NULL THEN
    NEW.entrevistador_asignado := v_capitan;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_capitan_por_actividad ON leads;
CREATE TRIGGER trg_leads_capitan_por_actividad
  BEFORE UPDATE ON leads
  FOR EACH ROW
  EXECUTE FUNCTION leads_capitan_por_actividad();

-- Para revisar cuántos leads siguen con un capitán que ya no está:
-- SELECT entrevistador_asignado, count(*) FROM leads
-- WHERE split_part(lower(btrim(coalesce(entrevistador_asignado, ''))), ' ', 1) NOT IN ('ali', 'carla', 'eunice')
-- GROUP BY 1 ORDER BY 2 DESC;
