# Propuesta Funcional - Modulo de Logistica

Fecha: 2026-05-31

## 1. Resumen ejecutivo

El modulo de Logistica ya tiene una base funcional solida para operar inventario: catalogo de productos, proveedores, tablero de stock, movimientos, pedidos en transito, aprobaciones, asignaciones activas e historial. El sistema no esta en una etapa inicial; ya contiene los bloques principales de un circuito logistico real.

La oportunidad principal no es crear mas pantallas aisladas, sino convertir el modulo en una herramienta operativa diaria. Hoy el modulo permite registrar y consultar, pero todavia no prioriza suficientemente el trabajo, no transforma alertas en acciones, no cierra completamente los ciclos de reposicion, custodia, dano/perdida y proveedor, y no expone indicadores de gestion que permitan controlar el proceso de punta a punta.

La propuesta recomendada es evolucionar el modulo hacia un "cockpit operativo de logistica": una vista y flujos que indiquen que hay que hacer hoy, que esta atrasado, que falta reponer, que movimientos requieren aprobacion, que herramientas estan retenidas, que pedidos estan vencidos y donde hay riesgo de quiebre de stock.

## 2. Alcance analizado

Se revisaron las pages y modulos existentes asociados al menu de Logistica:

- `/logistica/inventario/dashboard`: `InventarioDashboardPage` / `InventarioDashboardModule`
- `/logistica/proveedores`: `ProveedoresPage` / `ProveedoresModule`
- `/logistica/productos`: `ProductosPage` / `ProductosModule`
- `/logistica/inventario/asignaciones-activas`: `AsignacionesActivasPage` / `AsignacionesActivasModule`
- `/logistica/inventario/movimientos`: `MovimientosPage` / `MovimientosModule`
- `/logistica/inventario/pedidos`: `PedidosPage` / `PedidosUnificadoModule`
- `/logistica/inventario/historial`: `HistorialMovimientosPage` / `HistorialMovimientosModule`

Tambien existen pages/modulos historicos o separados:

- `AprobacionesPendientesPage` / `AprobacionesPendientesModule`
- `PedidosTransitoPage` / `PedidosTransitoModule`

Actualmente el flujo activo tiende a concentrarse en `PedidosUnificadoModule`, que combina entradas en transito, pedidos, aprobaciones pendientes e historico. Esto es positivo, pero conviene ordenar formalmente que queda vigente y que queda como legado para evitar duplicidad funcional.

## 3. Funcionamiento actual del modulo

### 3.1 Dashboard de inventario

El dashboard consulta la vista `v_stock_productos` y la combina con datos de `productos` para obtener stock minimo, alerta de reposicion, categoria y unidad de medida. Muestra tarjetas por categoria y tarjetas por estado de stock:

- Productos
- Disponible
- En uso
- En transito
- Danado
- Perdido

Tambien muestra una tabla con codigo, producto, unidad, tipo, total, disponible, en uso, en transito, danado y perdido. Hay senal visual cuando el disponible esta por debajo del stock minimo.

Lectura funcional: es una buena vista de control, pero hoy es principalmente descriptiva. El usuario ve numeros, pero el sistema no arma automaticamente una lista de acciones o prioridades.

### 3.2 Productos

La page de Productos funciona como catalogo maestro. Permite crear, editar, ver y eliminar productos si los permisos lo permiten. Cada producto maneja:

- Codigo
- Nombre
- Descripcion
- Unidad de medida
- Estado
- Categoria
- Tipo: repuesto o herramienta
- Retornable derivado del tipo
- Proveedor textual
- Observacion
- Stock minimo
- Alerta de reposicion

Tambien valida que no se eliminen productos con inventario o pedidos asociados.

Lectura funcional: el catalogo soporta la operacion basica, pero todavia no modela completamente la relacion producto-proveedor, precios, lead time, proveedor preferido o reglas de reposicion accionables.

### 3.3 Proveedores

La page de Proveedores permite crear, editar, visualizar, desactivar y reactivar proveedores. Maneja:

- Razon social
- Tipo y numero de documento
- Telefono
- Email
- Direccion
- Informacion de pago
- Observaciones
- Categoria
- Estado activo/inactivo

Lectura funcional: es un maestro administrativo correcto, pero todavia no esta conectado a performance operativa: tiempos de entrega, productos que provee, condiciones comerciales, cumplimiento, discrepancias o historial de pedidos.

### 3.4 Movimientos

La page de Movimientos es el punto principal de operacion. Maneja cuatro tipos:

- Entrada
- Salida
- Uso de herramienta / asignacion
- Devolucion

Las entradas quedan en transito y luego deben confirmarse desde Pedidos. Las salidas, asignaciones y devoluciones se insertan como movimientos pendientes de aprobacion. Hay modo simple y modo lote para entradas, y modo lote para salidas.

Validaciones actuales importantes:

- Entrada requiere proveedor.
- Entrada en lote requiere al menos un producto y numero de pedido.
- Salida requiere motivo.
- Si la salida es consumo en servicio, requiere categoria de servicio.
- Asignacion solo permite herramientas retornables.
- Asignacion requiere vehiculo, categoria de servicio y proveedor.
- Devolucion requiere vehiculo y estado de retorno.
- Si la devolucion es danada o perdida, requiere observaciones.
- Salida/asignacion validan stock disponible.

Lectura funcional: es la parte mas rica del modulo. Ya existe separacion entre movimiento y aprobacion, lo cual es sano. La oportunidad esta en hacerlo mas guiado, con menos carga manual, mejor contexto, escaneo/codigos, evidencia y enlaces directos desde otras pantallas.

### 3.5 Pedidos, recepciones y aprobaciones

La page de Pedidos unificada concentra cuatro tabs:

- Entradas
- Pedidos
- Pendientes
- Historico

Permite confirmar recepciones parciales o totales. Para movimientos pendientes, usuarios con rol encargado, admin o supervisor pueden aprobar/rechazar, siempre que ademas tengan permiso de edicion sobre el submenu correspondiente.

Lectura funcional: la unificacion es buena porque reduce dispersion. Sin embargo, faltan SLA, vencimientos, prioridad, motivos de discrepancia, aprobacion masiva y una mejor separacion conceptual entre recepcionar mercaderia y aprobar consumos/salidas.

### 3.6 Asignaciones activas

Muestra herramientas en uso asignadas a vehiculos. La tabla permite ver vehiculo, codigo, herramienta, cantidad y fecha de asignacion.

Lectura funcional: sirve para saber que herramientas estan en campo, pero no para gestionar activamente la custodia. Falta antiguedad, responsable, estado esperado, accion directa de devolucion, alertas de retencion y trazabilidad por vehiculo/conductor.

### 3.7 Historial de movimientos

Muestra los ultimos movimientos, con filtros por tipo, producto, vehiculo y usuario. Consulta los ultimos 100 registros.

Lectura funcional: sirve para consulta rapida, pero no alcanza como auditoria operativa. Falta rango de fechas, exportacion, trazabilidad completa por producto/vehiculo/proveedor, y relacion clara con aprobaciones, recepciones o discrepancias.

## 4. Fortalezas actuales

1. El modulo ya separa maestros, operacion, aprobacion y consulta.
2. Existen permisos por submenu, lo que permite controlar acciones sensibles.
3. Las salidas/asignaciones/devoluciones requieren aprobacion, reduciendo riesgo de ajuste indebido de stock.
4. Las entradas pasan por transito antes de quedar disponibles, lo cual representa bien el proceso fisico.
5. Hay soporte para recepcion parcial.
6. Hay modo lote para entradas y salidas.
7. La vista de stock ya distingue disponible, en uso, en transito, danado y perdido.
8. Existen umbrales de stock minimo y alerta de reposicion en productos.
9. El sistema usa RPC para operaciones criticas de stock, lo cual ayuda a centralizar consistencia.
10. La estructura visual respeta el estilo del sistema y usa componentes de tabla/filtros ya conocidos por los usuarios.

## 5. Brechas funcionales y operativas

### 5.1 El dashboard muestra informacion, pero no prioriza trabajo

Actualmente el usuario puede ver stock y estados, pero no hay una bandeja operativa clara con:

- Productos bajo minimo.
- Pedidos vencidos.
- Entradas pendientes de recepcion.
- Movimientos pendientes de aprobacion.
- Herramientas en uso por demasiados dias.
- Dañados/perdidos sin resolucion.

Impacto: el usuario debe navegar y filtrar manualmente para descubrir que debe atender.

### 5.2 Los umbrales de reposicion no generan una accion

`stock_minimo` y `alerta_reposicion` existen, y el dashboard marca visualmente bajo stock. Pero no hay flujo para crear una solicitud o pedido sugerido desde esa alerta.

Impacto: el sistema advierte, pero no cierra el ciclo de reposicion.

### 5.3 Falta consistencia de stock por sede/deposito

Movimientos filtra vehiculos por sede, pero la carga de stock disponible y el dashboard no muestran una aplicacion clara del contexto de sede. Si la operacion es multi-sede, esto puede producir decisiones incorrectas.

Impacto: un usuario podria creer que hay stock disponible cuando ese stock pertenece a otra sede o deposito.

### 5.4 Faltan estados de vencimiento/SLA en pedidos

Los pedidos tienen fecha estimada de llegada, pero no se explota como semaforo operativo:

- Vence hoy.
- Vencido.
- Sin fecha estimada.
- Recepcion parcial atrasada.

Impacto: la recepcion no se ordena por urgencia.

### 5.5 La recepcion parcial no captura causa de diferencia

El sistema permite recibir menos cantidad, pero no aparece un flujo formal para documentar motivo de discrepancia, evidencia o accion posterior.

Impacto: se pierde informacion para reclamar al proveedor o ajustar la compra.

### 5.6 La gestion de herramientas asignadas no cierra el ciclo de custodia

Asignaciones activas muestra herramientas en uso, pero no permite operar desde ahi:

- Devolver directamente.
- Marcar dano/perdida.
- Ver antiguedad de asignacion.
- Identificar responsable.
- Alertar herramientas retenidas.

Impacto: se consulta la custodia, pero no se gestiona activamente.

### 5.7 Dañados y perdidos quedan como estados, no como casos a resolver

El dashboard cuenta danados y perdidos, pero falta un flujo de resolucion:

- Reparar.
- Descartar.
- Recuperar.
- Reponer.
- Cobrar.
- Asociar a responsable/vehiculo/servicio.

Impacto: esos estados pueden acumularse sin cierre operativo ni contable.

### 5.8 Proveedores no tienen performance ni matriz producto-proveedor

El maestro de proveedores no permite saber:

- Que productos entrega cada proveedor.
- Lead time promedio.
- Ultimo precio.
- Cumplimiento de entregas.
- Discrepancias historicas.
- Proveedor preferido por producto.

Impacto: compras y reposicion dependen de conocimiento externo al sistema.

### 5.9 Historial limitado para auditoria

El historial carga los ultimos 100 movimientos. No hay filtros por rango de fechas ni exportacion operativa.

Impacto: sirve para revisar lo reciente, pero no para auditoria, conciliacion o investigacion de diferencias.

### 5.10 Hay modulos/paginas duplicadas o historicas

Existen `PedidosTransitoModule` y `AprobacionesPendientesModule` como piezas separadas, pero el flujo activo usa `PedidosUnificadoModule`.

Impacto: puede generar confusion tecnica y funcional si se mantienen rutas, permisos o codigo legado sin una decision clara.

## 6. Propuesta funcional objetivo

### 6.1 Vision

Convertir Logistica en un modulo de control operativo integral, donde cada usuario pueda responder rapidamente:

- Que tengo que hacer hoy.
- Que esta atrasado.
- Que falta comprar.
- Que tengo retenido en vehiculos.
- Que salidas/devoluciones esperan aprobacion.
- Que stock esta en riesgo.
- Que proveedores estan fallando.
- Que casos estan sin cerrar.

### 6.2 Principios de diseno funcional

1. Menos busqueda manual, mas accion sugerida.
2. Cada alerta debe tener una accion siguiente.
3. Cada movimiento debe tener trazabilidad completa.
4. Cada stock debe pertenecer claramente a una sede/deposito.
5. Las aprobaciones deben ser checkpoints, no cuellos de botella.
6. La custodia de herramientas debe tener ciclo completo: asignar, usar, devolver, resolver.
7. Proveedores deben medirse por cumplimiento, no solo registrarse.

## 7. Modelo operativo propuesto

### 7.1 Roles funcionales

**Operador de deposito**

- Registra entradas y salidas.
- Recepciona pedidos.
- Asigna y recibe herramientas.
- Gestiona discrepancias fisicas.

**Encargado / supervisor**

- Aprueba movimientos.
- Prioriza pendientes.
- Resuelve diferencias, danados y perdidos.
- Controla SLA de pedidos y herramientas retenidas.

**Compras / administracion**

- Gestiona proveedores.
- Genera pedidos de reposicion.
- Revisa costos, lead time y cumplimiento.

**Gerencia / control**

- Revisa KPIs.
- Audita movimientos.
- Detecta quiebres, perdidas, danos y compras urgentes.

### 7.2 Flujo futuro recomendado

#### Ciclo de reposicion

1. El dashboard detecta producto bajo minimo.
2. El sistema calcula cantidad sugerida.
3. El usuario revisa proveedor recomendado.
4. Se genera pedido de reposicion.
5. El pedido entra en estado en transito.
6. Recepcion confirma cantidad real.
7. Si hay diferencia, se abre discrepancia.
8. Stock pasa a disponible.

#### Ciclo de salida/consumo

1. Operador registra salida por producto, vehiculo y categoria de servicio.
2. Sistema valida stock por sede/deposito.
3. Movimiento queda pendiente.
4. Encargado aprueba o rechaza.
5. Si aprueba, descuenta stock y queda trazabilidad.
6. Si rechaza, se registra motivo y se notifica/expone en historico.

#### Ciclo de herramientas

1. Operador asigna herramienta a vehiculo.
2. Encargado aprueba.
3. Herramienta queda en custodia.
4. Dashboard alerta herramientas antiguas o retenidas.
5. Desde asignaciones activas se registra devolucion.
6. Devolucion define estado: operativa, danada, perdida.
7. Danada/perdida abre caso de resolucion.
8. Caso se cierra con accion: reparar, descartar, cobrar, recuperar o reponer.

#### Ciclo de proveedor

1. Proveedor queda asociado a productos.
2. Cada pedido registra fecha esperada y real.
3. Cada recepcion registra diferencias.
4. El sistema calcula cumplimiento.
5. Compras usa esa informacion para elegir proveedor recomendado.

## 8. Recomendaciones por page

### 8.1 Dashboard Inventario

Agregar una seccion superior llamada "Acciones pendientes" con tarjetas accionables:

- Reponer ahora.
- Pedidos vencidos.
- Por recepcionar.
- Pendiente aprobacion.
- Herramientas retenidas.
- Dañados/perdidos sin resolver.

Agregar filtros combinables por:

- Sede/deposito.
- Categoria.
- Estado de stock.
- Criticidad.
- Proveedor.

Agregar columna o filtro "criticidad":

- Sin stock.
- Bajo minimo.
- Bajo alerta.
- Normal.

Accion esperada: desde un producto bajo minimo, permitir "Crear pedido sugerido".

### 8.2 Productos

Mantener el catalogo actual, pero agregar:

- Proveedor preferido.
- Proveedores alternativos.
- Stock objetivo.
- Cantidad sugerida de reposicion.
- Costo estimado / ultimo precio.
- Producto activo/inactivo si no existe formalmente.
- Indicador "requiere serie" para herramientas relevantes.
- Codigo QR/barra imprimible.

Accion esperada: desde producto, ver stock por sede, historial, proveedores y pedidos abiertos.

### 8.3 Proveedores

Evolucionar de maestro administrativo a ficha operativa:

- Productos asociados.
- Lead time promedio.
- Pedidos abiertos.
- Cumplimiento de fecha.
- Discrepancias.
- Ultimo pedido.
- Contacto operativo.
- Condiciones de pago.

Accion esperada: desde proveedor, crear pedido o ver performance.

### 8.4 Movimientos

Simplificar el formulario en pasos:

1. Tipo de movimiento.
2. Producto(s).
3. Origen/destino.
4. Justificacion/evidencia.
5. Revision.

Agregar ayudas operativas:

- Stock visible por sede/proveedor antes de registrar.
- Validacion de cantidad contra stock de la sede.
- Busqueda por codigo/QR.
- Adjuntar foto/remito.
- Reutilizar ultimo proveedor o proveedor preferido.
- Ver movimientos recientes del producto seleccionado.

Accion esperada: reducir errores de carga y tiempo de registro.

### 8.5 Pedidos

Separar visualmente tres bandejas dentro de la page unificada:

- Recepcion.
- Aprobaciones.
- Historico.

Agregar:

- SLA por fecha estimada.
- Semaforo vencido/a tiempo/sin fecha.
- Recepcion masiva por pedido.
- Motivo de recepcion parcial.
- Discrepancia de pedido.
- Comentarios de seguimiento.
- Exportacion de pendientes.

Accion esperada: que el encargado vea y procese pendientes por prioridad.

### 8.6 Asignaciones activas

Convertir la vista en tablero de custodia:

- Dias en uso.
- Responsable / conductor asociado si aplica.
- Categoria de servicio.
- Estado esperado.
- Accion directa: registrar devolucion.
- Accion directa: marcar perdida/danada.
- Filtro "retenidas mas de X dias".

Accion esperada: cerrar el ciclo de herramientas sin tener que ir manualmente a Movimientos.

### 8.7 Historial

Ampliar a auditoria:

- Rango de fechas.
- Exportar visible.
- Filtro por sede/deposito.
- Filtro por aprobador.
- Filtro por estado de aprobacion.
- Ver detalle completo del movimiento.
- Enlace al pedido o aprobacion relacionada.

Accion esperada: permitir conciliacion, auditoria y seguimiento de reclamos.

## 9. Priorizacion recomendada

### P0 - Alto impacto operativo

1. Dashboard operativo con acciones pendientes.
2. Stock por sede/deposito en dashboard, movimientos, pedidos e historial.
3. Reposicion sugerida desde productos bajo minimo.
4. SLA y semaforo de pedidos en transito.
5. Accion directa de devolucion desde Asignaciones Activas.
6. Motivo/evidencia para recepciones parciales.

### P1 - Mejora fuerte de control

1. Matriz producto-proveedor.
2. Performance de proveedores.
3. Aprobacion masiva con revision por lote.
4. Historial con rango de fechas y exportacion.
5. Flujo de resolucion para danados/perdidos.
6. QR/codigo de barras para productos y herramientas.

### P2 - Evolucion avanzada

1. Inventario fisico/ciclico.
2. Modo mobile para deposito.
3. Costos por vehiculo/servicio.
4. Prediccion de reposicion.
5. Integracion con compras/facturas.
6. Serializacion individual de herramientas criticas.

## 10. Roadmap sugerido

### Fase 0 - Orden funcional y datos base

Duracion estimada: 1 semana.

- Confirmar si el stock debe ser global, por sede o por deposito.
- Definir si `PedidosTransitoModule` y `AprobacionesPendientesModule` quedan como legado.
- Validar permisos por rol: operador, encargado, supervisor, admin.
- Revisar vistas/RPC actuales para asegurar consistencia de stock.

### Fase 1 - Cockpit operativo

Duracion estimada: 1 a 2 sprints.

- Agregar acciones pendientes al dashboard.
- Agregar filtros de criticidad.
- Agregar tarjetas accionables para bajo stock, vencidos y pendientes.
- Mostrar conteos por sede/deposito.
- Enlazar cada alerta con su accion correspondiente.

### Fase 2 - Reposicion y recepcion

Duracion estimada: 1 a 2 sprints.

- Crear pedido sugerido desde bajo stock.
- Agregar proveedor recomendado.
- Agregar SLA de pedidos.
- Capturar motivo de recepcion parcial.
- Registrar discrepancias de recepcion.

### Fase 3 - Custodia y resolucion

Duracion estimada: 1 a 2 sprints.

- Agregar dias en uso en asignaciones activas.
- Registrar devolucion desde la misma pantalla.
- Crear flujo de resolucion para danados/perdidos.
- Asociar responsable, vehiculo y motivo.

### Fase 4 - Auditoria y performance

Duracion estimada: 1 sprint.

- Historial con fechas y exportacion.
- Performance de proveedores.
- KPIs operativos.
- Reportes de quiebre, perdida y rotacion.

## 11. KPIs sugeridos

### KPIs operativos

- Productos bajo stock minimo.
- Productos sin stock disponible.
- Pedidos vencidos.
- Tiempo promedio desde entrada hasta stock disponible.
- Tiempo promedio de aprobacion de movimientos.
- Movimientos pendientes por tipo.
- Herramientas en uso por mas de X dias.
- Dañados/perdidos sin resolver.
- Diferencias de recepcion por proveedor.

### KPIs de gestion

- Tasa de quiebre de stock.
- Compras urgentes evitables.
- Cumplimiento de proveedores.
- Rotacion de repuestos.
- Utilizacion de herramientas.
- Perdidas por categoria.
- Costo logistico asociado a vehiculos/servicios.

## 12. Criterios de aceptacion para una primera version

La primera version de mejora deberia considerarse completa si:

1. Un encargado puede entrar al dashboard y ver claramente que requiere accion hoy.
2. Un producto bajo minimo permite iniciar un pedido sugerido.
3. Los pedidos vencidos se identifican sin filtrar manualmente.
4. Una recepcion parcial obliga a registrar motivo.
5. Las herramientas asignadas muestran antiguedad y permiten iniciar devolucion.
6. El stock mostrado respeta el contexto definido de sede/deposito.
7. El historial permite buscar por rango de fechas y exportar.
8. No se elimina ni cambia funcionalidad actual que ya opera.

## 13. Riesgos y consideraciones

### Riesgos funcionales

- Si no se define bien sede/deposito, la visibilidad de stock puede seguir siendo confusa.
- Si se agregan demasiados pasos al registro de movimientos, la operacion se puede volver lenta.
- Si las aprobaciones no tienen priorizacion, seguiran siendo cuello de botella.
- Si danados/perdidos no tienen cierre, el dashboard seguira acumulando estados sin accion.

### Consideraciones tecnicas

- Mantener las operaciones criticas de stock en RPC o funciones centralizadas.
- Evitar duplicar logica entre modulos legacy y unificado.
- Reutilizar `DataTable`, filtros y patrones visuales existentes.
- No cambiar estilos globales ni estructura visual sin necesidad.
- Preservar permisos actuales y extenderlos con granularidad cuando haga falta.

## 14. Preguntas abiertas

1. El stock debe ser global, por sede, por deposito o por ambos?
2. Existen depositos fisicos dentro de una misma sede?
3. Las herramientas deben identificarse por unidad/serie o solo por cantidad?
4. Quien debe aprobar salidas, asignaciones y devoluciones: el mismo rol o roles distintos?
5. Las salidas por consumo deben asociarse siempre a vehiculo/servicio?
6. Los danados/perdidos deben generar cobro a conductor, costo interno o reclamo a proveedor?
7. Se necesita adjuntar remitos/fotos en recepcion y devolucion?
8. Compras necesita precios y presupuestos dentro de este modulo?
9. El historial debe servir para auditoria formal o solo consulta operativa?
10. Que SLA operativo se espera para recepcion y aprobaciones?

## 15. Recomendacion final

La recomendacion es no reconstruir el modulo. La base existente es aprovechable y debe evolucionar en capas.

El primer salto de valor esta en transformar el dashboard y pedidos en una bandeja de trabajo priorizada. Luego, cerrar el ciclo de reposicion y custodia. Finalmente, fortalecer proveedores, auditoria y KPIs.

En terminos practicos, el modulo deberia pasar de "registro de inventario" a "gestion operativa de logistica". Ese cambio no requiere romper lo existente: requiere conectar mejor los datos que ya existen, exponer alertas accionables y cerrar los ciclos que hoy quedan abiertos.

