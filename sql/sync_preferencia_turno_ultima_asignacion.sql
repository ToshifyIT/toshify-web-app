-- =====================================================
-- preferencia_turno = turno de la ÚLTIMA asignación
-- =====================================================
--
-- Regla de negocio:
--   La preferencia de turno que se carga a mano en el alta del conductor vale
--   hasta que recibe su primera asignación. A partir de ahí, cada asignación
--   nueva (o cambio de horario sobre la vigente) pisa `conductores.preferencia_turno`
--   con el turno de esa asignación. El campo pasa a significar "último turno real".
--
-- Por qué en base y no en el frontend:
--   Hoy hay 5 puntos que crean o cambian asignaciones (AsignacionesModule x2,
--   AssignmentWizard, ProgramacionModule x3). Un trigger los cubre a todos, y
--   también a cualquier alta por script o SQL directo.
--
-- Mapeo:
--   asignaciones_conductores.horario  ->  conductores.preferencia_turno
--   diurno                            ->  DIURNO
--   nocturno                          ->  NOCTURNO
--   todo_dia                          ->  A_CARGO
--
-- Si la fila del conductor no trae horario, se usa el de la asignación
-- (mismo fallback que hace la grilla de Conductores).
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente: se puede correr de nuevo.

-- -----------------------------------------------------
-- 1) Función
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION sync_preferencia_turno_desde_asignacion()
RETURNS TRIGGER AS $$
DECLARE
  v_horario text;
  v_pref    text;
BEGIN
  -- Sólo asignaciones vigentes: una cancelada o completada no pisa nada.
  IF NEW.conductor_id IS NULL
     OR lower(coalesce(NEW.estado, '')) NOT IN ('asignado', 'activo') THEN
    RETURN NEW;
  END IF;

  -- "Última" de verdad: si el conductor tiene otra asignación vigente MÁS NUEVA
  -- que esta fila, esta no manda (cubre el caso de editar una fila vieja).
  IF EXISTS (
    SELECT 1
      FROM asignaciones_conductores ac
     WHERE ac.conductor_id = NEW.conductor_id
       AND ac.id <> NEW.id
       AND lower(coalesce(ac.estado, '')) IN ('asignado', 'activo')
       AND coalesce(ac.fecha_asignacion, '-infinity'::timestamptz)
           > coalesce(NEW.fecha_asignacion, '-infinity'::timestamptz)
  ) THEN
    RETURN NEW;
  END IF;

  -- Horario de la fila del conductor; si viene vacío, el de la asignación.
  v_horario := lower(nullif(trim(NEW.horario), ''));
  IF v_horario IS NULL THEN
    SELECT lower(nullif(trim(a.horario), ''))
      INTO v_horario
      FROM asignaciones a
     WHERE a.id = NEW.asignacion_id;
  END IF;

  v_pref := CASE v_horario
    WHEN 'diurno'   THEN 'DIURNO'
    WHEN 'nocturno' THEN 'NOCTURNO'
    WHEN 'todo_dia' THEN 'A_CARGO'
    ELSE NULL
  END;

  IF v_pref IS NULL THEN
    RETURN NEW; -- horario desconocido: no tocar la preferencia
  END IF;

  UPDATE conductores
     SET preferencia_turno = v_pref,
         updated_at        = now()
   WHERE id = NEW.conductor_id
     AND preferencia_turno IS DISTINCT FROM v_pref; -- no escribir si ya está

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION sync_preferencia_turno_desde_asignacion() IS
  'Al crear/cambiar una asignación vigente, pisa conductores.preferencia_turno con el turno de esa asignación (último turno real).';

-- SECURITY DEFINER: el UPDATE sobre conductores corre con los permisos del dueño
-- de la función, así el trigger funciona aunque el usuario que crea la
-- asignación no tenga permiso de escritura sobre conductores por RLS.

-- -----------------------------------------------------
-- 2) Trigger
-- -----------------------------------------------------
-- AFTER: la fila ya está persistida cuando se consulta "la más nueva".
-- INSERT: asignación nueva.
-- UPDATE OF horario, estado: cambio de turno en la vigente (regularización), o
-- una fila que pasa a activa.
DROP TRIGGER IF EXISTS trg_sync_preferencia_turno ON asignaciones_conductores;
CREATE TRIGGER trg_sync_preferencia_turno
  AFTER INSERT OR UPDATE OF horario, estado ON asignaciones_conductores
  FOR EACH ROW
  EXECUTE FUNCTION sync_preferencia_turno_desde_asignacion();

-- -----------------------------------------------------
-- 3) Backfill (UNA sola vez) — conductores que YA tienen asignaciones
-- -----------------------------------------------------
-- El trigger actúa de acá en adelante. Para que los que ya pasaron por una
-- asignación queden con su último turno, correr el UPDATE de abajo.
--
-- Criterio: la asignación más reciente del conductor que NO esté cancelada
-- (una cancelada nunca ocurrió; una completada sí fue su último turno).
--
-- 3a) PREVIEW — ver qué cambiaría, sin escribir nada:
/*
WITH ultima AS (
  SELECT DISTINCT ON (ac.conductor_id)
         ac.conductor_id,
         lower(coalesce(nullif(trim(ac.horario), ''), a.horario)) AS horario,
         ac.fecha_asignacion
    FROM asignaciones_conductores ac
    JOIN asignaciones a ON a.id = ac.asignacion_id
   WHERE ac.conductor_id IS NOT NULL
     AND lower(coalesce(ac.estado, '')) <> 'cancelado'
   ORDER BY ac.conductor_id, ac.fecha_asignacion DESC NULLS LAST
)
SELECT c.apellidos, c.nombres, c.numero_dni,
       c.preferencia_turno AS actual,
       CASE u.horario WHEN 'diurno' THEN 'DIURNO' WHEN 'nocturno' THEN 'NOCTURNO' WHEN 'todo_dia' THEN 'A_CARGO' END AS nueva,
       u.fecha_asignacion
  FROM conductores c
  JOIN ultima u ON u.conductor_id = c.id
 WHERE u.horario IN ('diurno', 'nocturno', 'todo_dia')
   AND c.preferencia_turno IS DISTINCT FROM
       CASE u.horario WHEN 'diurno' THEN 'DIURNO' WHEN 'nocturno' THEN 'NOCTURNO' WHEN 'todo_dia' THEN 'A_CARGO' END
 ORDER BY c.apellidos, c.nombres;
*/

-- 3b) APLICAR — descomentar y correr una vez, después de revisar el preview:
/*
WITH ultima AS (
  SELECT DISTINCT ON (ac.conductor_id)
         ac.conductor_id,
         lower(coalesce(nullif(trim(ac.horario), ''), a.horario)) AS horario
    FROM asignaciones_conductores ac
    JOIN asignaciones a ON a.id = ac.asignacion_id
   WHERE ac.conductor_id IS NOT NULL
     AND lower(coalesce(ac.estado, '')) <> 'cancelado'
   ORDER BY ac.conductor_id, ac.fecha_asignacion DESC NULLS LAST
)
UPDATE conductores c
   SET preferencia_turno = CASE u.horario WHEN 'diurno' THEN 'DIURNO' WHEN 'nocturno' THEN 'NOCTURNO' WHEN 'todo_dia' THEN 'A_CARGO' END,
       updated_at        = now()
  FROM ultima u
 WHERE c.id = u.conductor_id
   AND u.horario IN ('diurno', 'nocturno', 'todo_dia')
   AND c.preferencia_turno IS DISTINCT FROM
       CASE u.horario WHEN 'diurno' THEN 'DIURNO' WHEN 'nocturno' THEN 'NOCTURNO' WHEN 'todo_dia' THEN 'A_CARGO' END;
*/

-- -----------------------------------------------------
-- Verificación rápida después de instalar
-- -----------------------------------------------------
-- SELECT tgname, tgenabled FROM pg_trigger WHERE tgname = 'trg_sync_preferencia_turno';
