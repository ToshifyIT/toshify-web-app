-- =====================================================================
-- Unificar la ubicacion de leads en latitud / longitud (2026-10-05)
-- ---------------------------------------------------------------------
-- Desde este cambio, latitud/longitud es la UNICA ubicacion oficial del
-- lead. direccion_latitud/direccion_longitud dejan de usarse en el modulo
-- Leads pero NO se borran (quedan como respaldo).
--
-- Que hace este script:
--   1. Respalda las coordenadas actuales de todos los leads.
--   2. Copia direccion_* -> latitud/longitud SOLO donde latitud esta vacia
--      (~342 leads al 2026-10-05). No pisa ningun valor existente y no
--      consulta a Google.
--   3. En los leads cuya latitud NO coincide con direccion_*, limpia
--      direccion_geocode_estado: ese estado describia al punto calculado
--      desde la direccion, no al punto de latitud (que vino de otra fuente).
--      Sin esto, el detalle mostraria "Ubicacion aproximada" sobre un punto
--      que no salio de Google.
--
-- ORDEN DE DESPLIEGUE: correr este script ANTES de desplegar el frontend.
-- Si el frontend sale primero, esos ~342 leads quedan sin mapa en el modulo
-- Leads hasta que se corra el script.
--
-- Ejecutar por bloques en el SQL Editor de Supabase.
-- =====================================================================


-- ---------------------------------------------------------------------
-- BLOQUE 1 · Respaldo (una sola vez)
-- ---------------------------------------------------------------------
create table if not exists leads_coordenadas_respaldo_20261005 as
select
  id,
  latitud,
  longitud,
  direccion_latitud,
  direccion_longitud,
  direccion_geocode_estado,
  direccion_geocode_fecha,
  now() as respaldado_en
from leads;

-- Debe coincidir con el total de leads.
select
  (select count(*) from leads)                               as total_leads,
  (select count(*) from leads_coordenadas_respaldo_20261005) as total_respaldo;


-- ---------------------------------------------------------------------
-- BLOQUE 2 · Vista previa (solo lectura)
-- ---------------------------------------------------------------------
select
  count(*) filter (
    where (latitud is null or longitud is null)
      and direccion_latitud is not null and direccion_longitud is not null
  ) as a_copiar,
  count(*) filter (
    where latitud is not null and longitud is not null
      and direccion_latitud is not null and direccion_longitud is not null
      and (abs(latitud - direccion_latitud) > 0.0001
        or abs(longitud - direccion_longitud) > 0.0001)
      and direccion_geocode_estado is not null
  ) as estado_a_limpiar
from leads;


-- ---------------------------------------------------------------------
-- BLOQUE 3 · Migracion
-- ---------------------------------------------------------------------
begin;

-- 3.1 Completar latitud/longitud vacias con el punto calculado desde la direccion.
update leads
set latitud  = direccion_latitud,
    longitud = direccion_longitud
where (latitud is null or longitud is null)
  and direccion_latitud is not null
  and direccion_longitud is not null;

-- 3.2 Donde latitud vino de otra fuente (difiere > ~10 m del calculado),
--     el estado del geocoding no describe a ese punto: se limpia.
--     El boton "Coordenadas" (admin) permite recalcularlos desde la direccion.
update leads
set direccion_geocode_estado = null
where latitud is not null and longitud is not null
  and direccion_latitud is not null and direccion_longitud is not null
  and (abs(latitud - direccion_latitud) > 0.0001
    or abs(longitud - direccion_longitud) > 0.0001)
  and direccion_geocode_estado is not null;

commit;


-- ---------------------------------------------------------------------
-- BLOQUE 4 · Verificacion (solo lectura)
-- ---------------------------------------------------------------------
-- Esperado: solo_direccion = 0.
select
  count(*) filter (where latitud is not null)                                    as con_latitud,
  count(*) filter (where latitud is null and direccion_latitud is not null)      as solo_direccion,
  count(*) filter (where direccion is not null and btrim(direccion) <> ''
                     and latitud is null)                                         as con_direccion_sin_coordenadas
from leads;


-- ---------------------------------------------------------------------
-- ROLLBACK (solo si hace falta volver atras)
-- ---------------------------------------------------------------------
-- update leads l
-- set latitud                  = r.latitud,
--     longitud                 = r.longitud,
--     direccion_geocode_estado = r.direccion_geocode_estado
-- from leads_coordenadas_respaldo_20261005 r
-- where r.id = l.id;
