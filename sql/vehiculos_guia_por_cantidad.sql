-- sql/vehiculos_guia_por_cantidad.sql
-- Responsable de los autos que entran: la guía con MENOS VEHÍCULOS (2026-11-06).
--
-- Pedido de Operaciones: el reparto ya está hecho; de acá en adelante, cada auto
-- nuevo o que vuelve a estar activo (PKG ON / EN USO, por ejemplo al salir de
-- taller) va a la guía que tiene menos autos en su sede, sin importar los turnos.
-- Ejemplo: Ali 15, Eunice 14 → va para Eunice.
--
-- Empates (misma cantidad de autos): primero la guía de los conductores del auto,
-- después la que tiene menos turnos por llenar, después por nombre.
--
-- Solo reemplaza elegir_guia_vehiculo (la usa el trigger de vehiculos). No mueve
-- ningún auto que ya tenga responsable. El botón "Repartir responsables" se quitó de
-- Vehículos; repartir_guias_vehiculos sigue en la base por si hace falta desde SQL.
-- Reemplaza la versión de sql/vehiculos_guia_reparto_turnos.sql (PASO 3).
-- Se puede correr más de una vez.

CREATE OR REPLACE FUNCTION elegir_guia_vehiculo(p_vehiculo_id uuid, p_sede_id uuid)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT g.guia
  FROM unnest(guias_responsables_activos()) AS g(guia)
  CROSS JOIN LATERAL (
    SELECT count(*) AS autos, coalesce(sum(t.libres_d + t.libres_n), 0) AS por_llenar
    FROM vehiculos v
    CROSS JOIN LATERAL vehiculo_turnos_libres(v.id) t
    WHERE v.deleted_at IS NULL
      AND v.id <> p_vehiculo_id
      AND v.guia_responsable = g.guia
      AND v.sede_id IS NOT DISTINCT FROM p_sede_id
      AND vehiculo_es_operativo(v.estado_id)
  ) c
  ORDER BY c.autos,
           (g.guia = ANY (vehiculo_guias_conductores(p_vehiculo_id))) DESC,
           c.por_llenar,
           g.guia
  LIMIT 1
$$;

-- Comprobar: cuántos autos tiene cada guía por sede y a quién iría el próximo
SELECT s.codigo AS sede, v.guia_responsable, count(*) AS autos
FROM vehiculos v
JOIN sedes s ON s.id = v.sede_id
WHERE v.deleted_at IS NULL AND vehiculo_es_operativo(v.estado_id)
GROUP BY 1, 2 ORDER BY 1, 2;

SELECT s.codigo AS sede,
       elegir_guia_vehiculo('00000000-0000-0000-0000-000000000000'::uuid, s.id) AS proximo_auto_va_a
FROM sedes s
ORDER BY 1;
