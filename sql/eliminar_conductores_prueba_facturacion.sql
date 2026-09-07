-- ===========================================================================
-- Sacar los conductores de PRUEBA de la facturacion (todos los periodos)
--
-- Conductores objetivo (UUID fijos, verificados con el PASO 0 del 03/09/2026):
--   CARLOS PRUEBA  DNI 90000003  1a07154e-6ec5-4dba-94a0-e194de5da1f0
--   MARIO  PRUEBA  DNI 90000002  cc07370f-2107-4354-bd10-088a5f19bee4
--   DIEGO  PRUEBA  DNI 90000001  5ea6c313-585a-4aae-ac8a-0910a2ebfdfd
--
-- Se usan UUID y NO un filtro por nombre: el LIKE '%PRUEBA%' es fragil y podria
-- alcanzar a un conductor real con ese texto en el nombre o el apellido.
--
-- Alcance: TODOS los periodos donde aparezcan (semanas 35, 36 y 37 de 2026 al
-- momento de escribir esto; el script no filtra por periodo, asi que tambien
-- cubre cualquier otro que se haya generado despues).
--
-- Orden de borrado: primero facturacion_detalle, despues facturacion_conductores.
-- Es el mismo orden que usa "Recalcular" en ReporteFacturacionTab.
--
-- Este borrado NO se deshace con un rollback despues del COMMIT.
-- ===========================================================================

SET search_path = public;


-- ---------------------------------------------------------------------------
-- Tipos verificados contra information_schema (no asumidos):
--   conductores.id ........................................... uuid
--   facturacion_conductores.id / conductor_id / periodo_id ... uuid
--   facturacion_detalle.facturacion_id ....................... uuid
--   periodos_facturacion.semana / anio ....................... integer
--   pagos_conductores.referencia_id .......................... TEXT (no uuid)
--
-- Por eso el unico cast necesario es f.id::text en la consulta de pagos.
-- Los DELETE comparan uuid con uuid y no requieren cast.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- PASO 0 - VERIFICACION PREVIA (solo lectura)
-- ===========================================================================

-- 0a. Que se va a borrar exactamente.
--     Esperado al 03/09/2026: 7 facturaciones y 13 lineas de detalle.
SELECT c.nombres, c.apellidos, c.numero_dni,
       p.semana, p.anio, p.estado AS estado_periodo,
       f.id AS facturacion_id,
       f.subtotal_neto,
       (SELECT count(*) FROM facturacion_detalle d WHERE d.facturacion_id = f.id) AS lineas_detalle
FROM facturacion_conductores f
JOIN conductores c          ON c.id = f.conductor_id
JOIN periodos_facturacion p ON p.id = f.periodo_id
WHERE f.conductor_id IN (
  '1a07154e-6ec5-4dba-94a0-e194de5da1f0',   -- CARLOS PRUEBA
  'cc07370f-2107-4354-bd10-088a5f19bee4',   -- MARIO PRUEBA
  '5ea6c313-585a-4aae-ac8a-0910a2ebfdfd'    -- DIEGO PRUEBA
)
ORDER BY p.anio DESC, p.semana DESC, c.nombres;

-- 0b. Pagos asociados. Tiene que devolver CERO filas.
--     Si devuelve algo, PARA: quedarian pagos apuntando a facturaciones borradas.
SELECT pg.referencia_id, pg.monto, pg.fecha_pago, pg.conductor_id
FROM pagos_conductores pg
WHERE pg.tipo_cobro = 'facturacion_semanal'
  AND pg.referencia_id IN (
    SELECT f.id::text
    FROM facturacion_conductores f
    WHERE f.conductor_id IN (
      '1a07154e-6ec5-4dba-94a0-e194de5da1f0',
      'cc07370f-2107-4354-bd10-088a5f19bee4',
      '5ea6c313-585a-4aae-ac8a-0910a2ebfdfd'
    )
  );


-- ===========================================================================
-- PASO 1 - BORRADO (transaccion unica)
-- ===========================================================================
-- Seleccionar del BEGIN al COMMIT y ejecutar junto.

BEGIN;

-- 1a. Lineas de detalle. Esperado: 13 filas.
DELETE FROM facturacion_detalle d
USING facturacion_conductores f
WHERE d.facturacion_id = f.id
  AND f.conductor_id IN (
    '1a07154e-6ec5-4dba-94a0-e194de5da1f0',
    'cc07370f-2107-4354-bd10-088a5f19bee4',
    '5ea6c313-585a-4aae-ac8a-0910a2ebfdfd'
  );

-- 1b. Cabeceras de facturacion. Esperado: 7 filas.
DELETE FROM facturacion_conductores f
WHERE f.conductor_id IN (
  '1a07154e-6ec5-4dba-94a0-e194de5da1f0',
  'cc07370f-2107-4354-bd10-088a5f19bee4',
  '5ea6c313-585a-4aae-ac8a-0910a2ebfdfd'
)
RETURNING f.id, f.conductor_id, f.periodo_id, f.subtotal_neto;

-- Si el RETURNING no devuelve 7 filas, ejecutar ROLLBACK en vez de COMMIT.

COMMIT;


-- ===========================================================================
-- PASO 2 - VERIFICACION FINAL (solo lectura)
-- ===========================================================================

-- 2a. No debe devolver ninguna fila.
SELECT c.nombres, c.apellidos, p.semana, p.anio, f.id
FROM facturacion_conductores f
JOIN conductores c          ON c.id = f.conductor_id
JOIN periodos_facturacion p ON p.id = f.periodo_id
WHERE f.conductor_id IN (
  '1a07154e-6ec5-4dba-94a0-e194de5da1f0',
  'cc07370f-2107-4354-bd10-088a5f19bee4',
  '5ea6c313-585a-4aae-ac8a-0910a2ebfdfd'
);

-- 2b. Detalle huerfano en toda la tabla. Debe dar 0.
SELECT count(*) AS detalles_huerfanos
FROM facturacion_detalle d
LEFT JOIN facturacion_conductores f ON f.id = d.facturacion_id
WHERE f.id IS NULL;


-- ===========================================================================
-- IMPORTANTE - ESTO PUEDE VOLVER
-- ===========================================================================
-- La facturacion se REGENERA desde las asignaciones: "Recalcular" vuelve a
-- crear estas filas si los conductores siguen teniendo una asignacion activa
-- que se solapa con la semana (vehiculo de prueba PRB001).
--
-- La semana 37 esta ABIERTA, asi que es la primera candidata a regenerarse.
--
-- Para que no vuelvan hay que cortar el origen: finalizar la asignacion de
-- prueba o dar de baja a los conductores. Esta consulta muestra que asignaciones
-- los mantienen vivos:
--
-- SELECT a.id, a.codigo, a.estado, a.fecha_inicio, a.fecha_fin,
--        v.patente, ac.conductor_id, ac.estado AS estado_conductor
-- FROM asignaciones_conductores ac
-- JOIN asignaciones a ON a.id = ac.asignacion_id
-- LEFT JOIN vehiculos v ON v.id = a.vehiculo_id
-- WHERE ac.conductor_id IN (
--   '1a07154e-6ec5-4dba-94a0-e194de5da1f0',
--   'cc07370f-2107-4354-bd10-088a5f19bee4',
--   '5ea6c313-585a-4aae-ac8a-0910a2ebfdfd'
-- );
