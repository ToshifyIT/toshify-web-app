# Auditoría: todo el sistema filtrado por sede (2026-11-23)

Regla: cada vista, indicador, dashboard y reporte muestra solo los datos de la sede elegida.
Con "Todas las sedes" se ven las sedes reales, sin Pruebas. Solo los parámetros compartidos
(catálogos, conceptos, promociones, zonas, grupos de flota, menús) quedan sin filtro.

## Cómo se revisó

Un escaneo del código encontró 1311 consultas `.from('tabla')`. Quedaron 260 lecturas de listas
que no mencionaban la sede, y se revisaron una por una. La mayoría estaban bien:
- buscan por id, DNI o patente puntual;
- cruzan con una lista que ya viene filtrada;
- miran todas las sedes a propósito para encontrar duplicados (DNI, titular, lead);
- leen parámetros compartidos.

El patrón que más se repetía era `if (sedeId) query.eq('sede_id', sedeId)`. Con
"Todas las sedes" no filtraba nada y entraban los datos de Pruebas. Se cambió a
`aplicarFiltroSede`, que con "Todas" deja solo las sedes reales.

## Arreglado

### Indicadores y dashboards
- `src/hooks/useBajasConductoresStats.ts`, `usePermanenciaStats.ts`, `useVehiculosStats.ts`, `useIncidenciasSplitStats.ts`, `useIncobrabilidadStats.ts`, `useFacturadoCobradoData.ts`, `useCobroTeoricoData.ts`: KPIs de bajas, permanencia, vehículos nuevos, incidencias, incobrabilidad, facturado/cobrado y cobro teórico.
- `src/modules/dashboard/components/CobroTeoricoVsReal.tsx`, `FacturadoVsCobrado.tsx`, `PermanenciaChart.tsx`, `ZonesAssignmentsChart.tsx`: gráficos del dashboard.
- `src/pages/parametros/RiesgoBcraPage.tsx`: el conteo de leads verde/amarillo/rojo ahora es de la sede elegida. Los umbrales siguen compartidos.

### Rendimiento de capitanes (Control de gestores)
- `src/modules/reportes/control-gestores/contactoCapitanesService.ts` y `ControlGestoresModule.tsx`:
  - las conversiones de leads filtran por `leads.sede_id`;
  - las llamadas y los mensajes de 2Chat se cuentan solo cuando el conductor o el lead es de la sede;
  - las llamadas a números que no son conductor ni lead (columna "Otros") no tienen sede y siguen sumando en todas.

### Facturación
- `ReporteFacturacionTab.tsx`:
  - email y monotributo por DNI, que define si la factura es A o B;
  - emails de la vista previa de Cabify;
  - detalle del RIT, que ahora filtra en la base por período (además evita el tope de 1000 filas);
  - cuota de garantía en el RIT y en la sincronización del RIT.
- `ExcesosKmTab.tsx`: el modal "Registrar exceso" ofrecía conductores de Pruebas.
- `GarantiasTab.tsx`: contactos de los Excel, que cruzan por DNI.
- `TicketsFavorTab.tsx`: "Aplicar ticket" listaba también los períodos de Pruebas.

### Multas pagadas según semanas cerradas
Había un error real: si se cerraba una semana en Pruebas, las multas de Buenos Aires de esa semana figuraban como pagadas. Se arregló en:
- `src/modules/multas-telepase/MultasModule.tsx`;
- `src/modules/conductores/panel/conductorDetalleService.ts` (ficha del conductor);
- `src/modules/conductores/panel/conductoresPanelService.ts` (panel);
- `src/modules/portal/PortalPage.tsx` (portal del conductor).

### Otros
- `src/modules/incidencias/IncidenciasModule.tsx`: al reasignar la semana de una penalidad, el recálculo buscaba el período sin sede y podía fallar o tomar el de otra sede. Ahora usa la sede de la penalidad.
- `src/components/AssignmentWizard.tsx`: vehículos y conductores del asistente de asignación.
- `src/components/ui/DiscrepancyReportModal.tsx`: conductores y vehículos del reporte de discrepancias.
- `src/modules/guias/GuiasModule.tsx`: tabla de conductores del guía con "Todas".
- `src/modules/onboarding/programacion-v2/components/ProgramacionAssignmentWizardV2.tsx`: las parejas sugeridas venían de todas las sedes.
- `src/modules/vehiculos/VehicleManagement.tsx`, `titulares/TitularesModule.tsx`, `oferta-locacion/OfertaLocacionListModule.tsx`: titulares y ofertas con "Todas". Los registros sin sede se siguen viendo.
- `src/modules/visitas/components/VisitasFormModal.tsx`: una cita de Pruebas disparaba el aviso de "posible cita duplicada" en Buenos Aires.
- `src/modules/inventario/MovimientosModule.tsx`: vehículos con inventario asignado (devolución).

### "Todas las sedes" en servicios que solo reciben `sedeId`
- `src/utils/sedesReales.ts` (nuevo): `realesSiTodas(sedeId)` y `filtrarSede(q, sedeId, reales)`. Con una sede elegida, filtran por esa sede. Con "Todas", filtran por las sedes reales, con el mismo criterio que `aplicarFiltroSede`.
- Usan este filtro:
  - el panel de conductores (`conductoresPanelService.ts`: conductores, guía, períodos cerrados, asignación actual y km de Geotab);
  - alertas de mantenimiento (`alertasService.ts`);
  - combustible (`combustibleService.ts`: resumen y llenados de la sede);
  - visitas (`visitasService.ts`: agenda y anfitriones).
- Facturación (`ReporteFacturacionTab.tsx`): cada sede tiene su propio período, así que con "Todas" se usa la sede del usuario. Esto vale para el período de la semana, la semana anterior y la lista de semanas. Antes, con "Todas", el `.single()` fallaba o la lista de semanas salía repetida.

## Pendiente (necesita una decisión o SQL)

1. **Inventario por sede (decidido: cada sede tiene su depósito)**: correr `sql/inventario_por_sede.sql`.
   - Agrega `sede_id` a `inventario`, `movimientos` y `pedidos_inventario`.
   - El stock y los pedidos que ya existen pasan a Buenos Aires. Lo asignado a un vehículo queda en la sede del vehículo.
   - Las funciones de movimientos, aprobación, recepción y pedidos buscan y mueven stock solo dentro de la sede.
   - Lo que toca un vehículo queda siempre en la sede del vehículo.
   - Las vistas exponen `sede_id`. `v_stock_productos` da una fila por producto y sede.
   - Las pantallas de inventario, productos y proveedores ya filtran y graban la sede. El helper `src/modules/inventario/stockPorSede.ts` suma el stock por producto cuando se ve "Todas".
   - El SQL y el frontend tienen que salir juntos.
2. **Tabla `multas`**: confirmado que no existe. El reporte de discrepancias ahora usa `multas_historico` filtrado por sede.
3. **Llamadas "Otros" de 2Chat**: los números que no son conductor ni lead no tienen sede. Para separarlos, `twochat_llamadas` y `twochat_mensajes` necesitarían su propio `sede_id`. Por ahora no hace falta.

## Bien sin filtro (a propósito)
- Búsquedas de duplicados de DNI, CUIT, titular y lead: miran todas las sedes para no crear dos veces a la misma persona.
- Parámetros compartidos: zonas restringidas, grupos de flota, catálogos, promociones, conceptos, rangos de seguimiento.
- Mapeos globales: `cabify_dni_mapeo`, movimientos de Cresium (son por empresa y se cruzan por CUIT).
- `cabify_historico` no tiene sede, pero todas sus lecturas son por DNI de conductores que ya están filtrados.

## Verificación
- `npx tsc -p tsconfig.app.json --noEmit`: sin errores.
- `npx eslint` en los archivos tocados: sin errores. Quedan solo advertencias de antes.
- No se probó en la app. Para probar: cargar datos en Pruebas y mirar en Buenos Aires y en "Todas" los indicadores, el dashboard, Control de gestores, Multas y Facturación.
