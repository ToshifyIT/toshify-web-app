# Toshify MCP Server

Servidor MCP (Model Context Protocol) para conectar chatbots y asistentes de IA.

## Conexion

**URL MCP (Streamable HTTP):** `https://mcp.toshify.com.ar/mcp` — la que usan claude.ai,
Claude Desktop y los clientes actuales.

**URL SSE (legacy):** `https://mcp.toshify.com.ar/sse` — transporte deprecado del protocolo.
Se mantiene para los clientes que ya lo usan; claude.ai no conecta por aca (devuelve 404 al
verificar el conector).

**Documentacion:** `https://mcp.toshify.com.ar/docs`

## Autenticacion

Dos formas, segun quien se conecta:

### Personas: login con la cuenta de Toshibase (OAuth)

Para el conector de Claude (claude.ai, Claude Teams, Desktop, Claude Code). Cada persona
inicia sesion con su cuenta de Toshibase (Google o correo y contraseña) y el MCP le
muestra las tablas de las pantallas que tiene habilitadas en Menu por rol / Menu por
usuario, **dentro de los modulos tildados en la API key "Para Claude"** que va en la URL
del conector (ver "Modulos de cada key" abajo). Solo lectura. Sin la key no se entra.

- `lib/oauth.js`: servidor de autorizacion OAuth 2.1 (registro dinamico, PKCE S256,
  permiso de acceso de 1 hora y renovacion de 30 dias con rotacion). Endpoints:
  `/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server`,
  `/oauth/register`, `/oauth/authorize`, `/oauth/token`.
- `lib/accesoUsuario.js`: permisos de la persona con la misma logica que la app (rol admin
  ve todo; el resto, menus y submenus con `can_view` de `get_user_permissions`). Se
  recalculan cada 2 minutos: desactivar a alguien o sacarle una pantalla rige enseguida.
- `lib/pantallasDatos.js`: que pantallas usan cada dataset. **Generado** desde el codigo
  de la app con `node mcp/generadores/generarPantallasDatos.mjs` (volver a correrlo cuando
  cambien las pantallas o el catalogo). Facturacion solo con la pantalla de Facturacion.
- Cada consulta queda en `api_request_log` con `user_id` y `user_email`.

Requisitos: `sql/mcp_oauth.sql`; variables `VITE_SUPABASE_ANON_KEY` (para la pantalla de
login) y opcional `MCP_PUBLIC_URL`; en Supabase Auth > URL Configuration, agregar
`https://mcp.toshify.com.ar/oauth/authorize**` a las Redirect URLs (vuelta del login con
Google).

### Integraciones: API key

Para sistemas (API REST para terceros, automatismos). Las API keys se generan desde la app
de Toshify en **Administracion > Integraciones > MCP**.

Enviar la API key de una de estas formas:
- Header: `x-api-key: TU_API_KEY`
- Header: `Authorization: Bearer TU_API_KEY` (solo `/mcp`)
- Query param: `/mcp?apiKey=TU_API_KEY` o `/sse?apiKey=TU_API_KEY`

### Módulos de cada key y conector de Claude

Al crear o editar una key, la lista "Módulos" muestra los módulos y submódulos activos del
menú de Toshibase (los mismos de Menú por rol): uno nuevo aparece solo, sin tildar. Se
guardan como `menu:<nombre>` / `submenu:<nombre>` en `api_keys.permissions`
(`lib/accesoUsuario.js`). Siempre solo lectura.

- **Para Claude** (`mcp:usuario`): el administrador de Claude Teams agrega el conector con
  `https://mcp.toshify.com.ar/mcp?apiKey=LA_KEY`. Cada persona inicia sesión con su usuario
  de Toshibase y ve los módulos tildados en la key **que su usuario también tiene**. En ese
  camino no hay herramientas que escriban. La key sola no sirve: sin sesión, /mcp pide el
  login; /sse y la API REST la rechazan.
- **Sin key no se entra:** un token de login sin la key en la URL recibe 403.
- **Integraciones** (key sin `mcp:usuario`): la key sola ve los módulos tildados más sus
  permisos especiales de siempre (`datos:read`, `administracion:read`, `leads:*`, `*:api`).

### Tablas de módulos nuevos (automáticas)

`Dockerfile.mcp` corre `generadores/generarPantallasDatos.mjs` en cada publicación. Si
una pantalla usa una tabla que no está en el catálogo, entra sola como dataset automático
(`PANTALLAS_POR_TABLA_AUTO`): al arrancar, `lib/tablasAuto.js` lee sus columnas de la base
y saca las sensibles. No entran las de `lib/tablasFueraMcp.js` (las que se dejaron afuera a
propósito y los nombres de usuarios, permisos, keys, logs, etc.) ni las de pantallas solo
admin. Las automáticas no van con `datos:read`: solo con su módulo tildado en la key. Para describirla mejor o elegir columnas, agregarla al catálogo.

## Conectarlo a Claude

- **claude.ai / Claude Teams / Desktop:** el administrador va a Configuracion > Conectores >
  Agregar conector personalizado, URL `https://mcp.toshify.com.ar/mcp?apiKey=LA_KEY` (una key
  "Para Claude"). Al conectar se abre el login de Toshify; cada persona entra con su cuenta.
- **Claude Code:** `claude mcp add --transport http toshify "https://mcp.toshify.com.ar/mcp?apiKey=LA_KEY"`
  y despues `/mcp` para iniciar sesion.
- Con API key (integraciones): `https://mcp.toshify.com.ar/mcp?apiKey=TU_API_KEY`.

`/mcp` funciona sin sesion: cada request crea y cierra su propio servidor, no guarda estado
en memoria. Rate limit: 120 requests por minuto por key o sesion.

## Configuracion del cliente

```json
{
  "mcpServers": {
    "toshify-leads": {
      "url": "https://mcp.toshify.com.ar/mcp?apiKey=TU_API_KEY"
    }
  }
}
```

## Herramientas

| Herramienta | Permiso | Descripcion |
|-------------|---------|-------------|
| `buscar_leads` | leads:read | Buscar leads por nombre, DNI, email, estado, sede |
| `obtener_lead` | leads:read | Ver un lead por ID (solo las columnas del dataset `leads` del catalogo) |
| `actualizar_lead` | leads:update | Actualizar estado y datos de un lead |
| `listar_datos` | datos:read o administracion:read | Conjuntos de datos disponibles para la key (modulo y descripcion) |
| `describir_datos` | datos:read o administracion:read | Campos y tipos de uno o varios conjuntos de datos (hasta 15 por llamada) |
| `consultar_datos` | datos:read o administracion:read | Registros con filtros, orden y paginacion (max 200 por pagina); agrega `sede_nombre` |
| `contar_datos` | datos:read o administracion:read | Totales, cantidades agrupadas por campo o por dia/mes/anio, y suma/promedio de un campo numerico (`sumar`) |
| `consultar_reporte` | datos:read (Directivo, Marketing) / administracion:read (KPI's) | Dashboards calculados por RPC de una lista fija, por GET (transaccion de solo lectura) |

### Datos de operacion (`datos:read`)

Solo lectura sobre ~110 conjuntos de datos de operacion (conductores, vehiculos con
titulares y ofertas de locacion sin datos personales, asignaciones, leads, onboarding,
incidencias y penalidades, siniestros, multas y telepase, inventario, visitas, guias,
Cabify, telemetria, indicadores, integraciones —2Chat, Cresium, Alegra, Cabify efectivo— y
reportes). Incluye vistas listas de `sql/mcp_vistas.sql`: `v_estado_flota_hoy`,
`v_vencimientos_proximos`, `v_leads_semanales` y `v_multas_historico` (importe numerico).
Las patentes de prueba (PRUEBA…, PRUB…, PRB…) se excluyen solas salvo `incluir_pruebas`. El
catalogo es fijo en el servidor (`lib/catalogoDatos.js`): el cliente no puede leer
otra tabla ni otra columna, y nunca puede escribir.

Quedan afuera la facturacion (va con `administracion:read`), todo lo de
Parametros, usuarios/roles/permisos/menus/keys/logs/cron/prompts, respaldos y
temporales, y las columnas sensibles (ver `COLUMNAS_EXCLUIDAS`).

### Administracion (`administracion:read`)

Mismas herramientas, sobre los datasets del catalogo marcados con
`permiso: 'administracion:read'`: facturacion (periodos, facturas por conductor y
detalle, saldos, pagos, abonos, garantias, cobros fraccionados, tickets,
promociones, conceptos). Suma las columnas de facturacion de `kpi_diario` y
`kpi_forecast` (`columnasPorPermiso`) y el reporte `dashboard_kpis`. Solo lectura. Una key ve solo los datasets de sus
permisos: los demas responden como si no existieran.

Los permisos se pueden editar desde la app (lapiz en cada key) y rigen en el
proximo pedido: /mcp y la API REST validan la key en cada request, y en /sse se
revalida en cada mensaje y la sesion se corta si cambiaron los permisos.
Los errores de la base no se le muestran al cliente. Cada llamada queda en
`api_request_log` con endpoint `mcp/<herramienta>`.

## Permisos

Cada API key tiene permisos granulares:

| Permiso | Que permite |
|---------|-------------|
| `leads:read` | Buscar y ver leads |
| `leads:update` | Actualizar campos de leads |

| `leads:api` | Consumir la API REST de leads (solo lectura) |

---

# Obtener la API key

El consumidor externo recibe UNA vez un **usuario y contrasena**. Con eso pide
su API key, y de ahi en mas la usa para consultar los datos.

```bash
curl -u "TU_USUARIO:TU_CONTRASENA" https://mcp.toshify.com.ar/api/v1/keys
```

```json
{
  "data": {
    "usuario": "softech",
    "api_key": "3f7a9c...",
    "permisos": ["leads:api","vehiculos:api","conductores:api","asignaciones:api","flota:api"],
    "solo_lectura": true,
    "generada_ahora": true,
    "uso": "Enviá esta key en el header x-api-key en cada request a /api/v1/*"
  }
}
```

Es un **GET**: la primera llamada genera la key, y todas las siguientes
devuelven exactamente la misma. Llamarlo dos veces no crea dos keys ni invalida
la que ya este en uso (`generada_ahora` indica si fue la primera vez). Se puede
reintentar sin riesgo.

Las credenciales van en el header `Authorization` (HTTP Basic), nunca en la URL.
En Postman: pestana **Authorization** → tipo **Basic Auth**.

La key generada es **siempre de solo lectura**, con los cinco permisos GET. El
consumidor no elige su alcance.

## Y despues

```bash
curl -H "x-api-key: 3f7a9c..." https://mcp.toshify.com.ar/api/v1/vehiculos
```

## Limites

- **10 requests por minuto** en este endpoint. Es el unico que pide contrasena,
  y el limite existe para que probar contrasenas no sea viable
- Un usuario inexistente y una contrasena incorrecta devuelven el mismo error,
  para que no se puedan enumerar usuarios validos

## Del lado de Toshify

Alta de un consumidor (ver `sql/api_users_auth.sql`):

```sql
SELECT api_user_crear('nombre-del-tercero', 'contrasena-larga-y-aleatoria');
```

Su key la genera el mismo, en su primer GET.

Rotarle la key (desactiva la anterior y emite una nueva):

```sql
SELECT api_user_rotar_key('nombre-del-tercero');
```

Cortarle todo el acceso, incluidas sus keys:

```sql
UPDATE api_users SET is_active = false WHERE username = 'nombre-del-tercero';
```

Las contrasenas se hashean con bcrypt dentro de Postgres (pgcrypto) y se
verifican con una funcion `SECURITY DEFINER`: el hash nunca sale de la base.
Es el mismo patron que usa el Portal Conductor.

---

# API REST de Leads (para terceros)

Ademas del MCP, el servicio expone una API REST de **solo lectura** pensada para
integraciones que no hablan MCP (backends, ETLs, sistemas de terceros).

**Base URL:** `https://mcp.toshify.com.ar/api/v1`

## Autenticacion

Header `x-api-key` con una key que tenga el permiso `leads:api`.

A diferencia del MCP, la API REST **no** acepta la key por query param: los
query strings quedan escritos en los logs de acceso del proxy.

```bash
curl -H "x-api-key: TU_API_KEY" \
  "https://mcp.toshify.com.ar/api/v1/leads?sede=Buenos%20Aires&limit=50"
```

## Endpoints

### `GET /api/v1/leads`

| Parametro | Tipo | Descripcion |
|-----------|------|-------------|
| `estado` | string | Filtra por `estado_de_lead` (exacto) |
| `sede` | string | Filtra por sede (exacto) |
| `desde` | fecha ISO | `fecha_creacion` >= |
| `hasta` | fecha ISO | `fecha_creacion` <= |
| `search` | string | Busca en nombre, email y DNI |
| `page` | int | Pagina, default 1 |
| `limit` | int | Por pagina, default 20, **max 100**. Ver `limit=all` mas abajo |

Respuesta:

```json
{
  "data": [ { "id": "...", "nombre_completo": "...", "..." : "..." } ],
  "pagination": { "page": 1, "limit": 20, "total": 350, "total_pages": 18 }
}
```

### `GET /api/v1/leads/:id`

Devuelve `{ "data": { ... } }` o 404. El `id` debe ser un UUID.

## Campos expuestos

La API devuelve **solo** estos campos. La lista es fija en el servidor
(`mcp/routes/leads.js`, constante `CAMPOS_PUBLICOS`); el cliente no puede pedir
otras columnas.

```
id, nombre_completo, dni, email, phone, whatsapp_number,
direccion, edad, estado_de_lead, sede, fecha_creacion
```

La tabla `leads` contiene ademas datos que **no se exponen** y no deben
agregarse sin una decision explicita: `cbu`, `bcra`, `antecedentes_penales`,
coordenadas del domicilio, contacto de emergencia y
`observaciones` (texto libre).

### `GET /api/v1/vehiculos` y `/vehiculos/:id`

Permiso `vehiculos:api`. Filtros: `patente`, `marca`, `grupo_flota`, `gnc` (true/false), `search` (patente/marca/modelo).

Campos: id, patente, provisoria, marca, modelo, anio, color, categoria, tipo_vehiculo,
tipo_combustible, gnc, telepase, cobertura, grupo_flota, lugar_radicacion,
kilometraje_actual, vencimiento_seguro, vto_vtv_*, vto_gnc_*, vto_matafuego_*,
fecha_ulti_inspeccion, fecha_prox_inspeccion, `vehiculos_estados{codigo,descripcion}`, `sedes{nombre}`.

Los vehiculos dados de baja (`deleted_at`) no se devuelven nunca.

### `GET /api/v1/conductores` y `/conductores/:id`

Permiso `conductores:api`. Filtros: `dni`, `zona`, `turno`, `search` (nombre/apellido/DNI/email).

Campos: id, nombres, apellidos, numero_dni, numero_cuit, numero_licencia,
licencia_vencimiento, email, telefono_contacto, direccion, zona, preferencia_turno,
fecha_contratacion, fuente_pauta, id_fuente, `conductores_estados{codigo,descripcion}`, `sedes{nombre}`.

### `GET /api/v1/asignaciones` y `/asignaciones/:id`

Permiso `asignaciones:api`. Filtros: `estado`, `horario`, `modalidad`, `vehiculo_id`,
`conductor_id`, `desde`, `hasta` (sobre `fecha_inicio`).

Campos: id, codigo, vehiculo_id, conductor_id, estado, horario, modalidad, tipo_tarifa,
zona, fecha_inicio, fecha_fin, fecha_inicio_real, fecha_fin_real, fecha_programada,
control_completado, mas los embeds `vehiculos{patente,marca,modelo}`,
`conductores{nombres,apellidos,numero_dni}` y `sedes{nombre}`.

### `GET /api/v1/estado-flota`

Permiso `flota:api`. Toda la flota con su estado y, si la tiene, su asignacion activa.
Filtros: `sede`, `grupo_flota`, `search`, `asignado=true` (solo vehiculos con conductor).

Cada item trae los datos del vehiculo mas `asignacion_activa`, que es `null` o un objeto
con `{id, estado, horario, modalidad, tipo_tarifa, fecha_inicio, conductor}`.

## Que NO devuelve ninguna de estas APIs

Las whitelists son fijas en el servidor (constante `CAMPOS` de cada archivo en
`mcp/routes/`). El cliente no puede pedir otras columnas. Quedan explicitamente afuera:

- **conductores:** `portal_password_hash` y `portal_must_change_password` (credenciales
  del Portal Conductor), `cbu`, `antecedentes_penales`, `antecedentes_transito`,
  `fecha_nacimiento`, los cuatro campos de contacto de emergencia, `direccion_lat`/`lng`,
  `observaciones`, `experiencia_previa`, `motivo_baja`, `monotributo`,
  `estado_facturacion` y todas las URLs de documentacion.
- **vehiculos:** `numero_motor`, `numero_chasis`, `seguro_numero`, `titular`,
  `gps_uss`/`tipo_gps`/`traccar`, `notas` y las URLs de Drive.
- **asignaciones:** `notas`, `observaciones`, `motivo_cancelacion` y los campos
  `created_by`/`created_by_name`/`updated_by`.
- **leads:** ver la lista en la seccion de leads.

Agregar un campo a cualquiera de esas listas es una decision deliberada, no un ajuste.

## Traer el dataset completo: `limit=all`

Cualquier listado acepta `?limit=all` y devuelve **todos** los registros que
matchean, sin paginar:

```bash
curl -H "x-api-key: TU_KEY" "https://mcp.toshify.com.ar/api/v1/vehiculos?limit=all"
```

El servidor los trae de a 1000 contra la base y los va escribiendo en la
respuesta a medida que llegan, en vez de armar el array entero en memoria. El
consumo de RAM es constante sin importar el tamano del resultado.

El envelope es el mismo, con `limit: "all"` y un campo extra `devueltos`:

```json
{
  "data": [ ... ],
  "pagination": { "page": 1, "limit": "all", "total": 854, "total_pages": 1, "devueltos": 854 }
}
```

Tambien viaja el header `X-Total-Count`.

**Techo:** 50.000 registros por export. Si el resultado lo supera, devuelve 400
`too_many_rows` y hay que acotar con filtros (`desde`/`hasta`) o paginar. No es
una restriccion de negocio: es lo que evita que una sola request deje sin
memoria al contenedor, que tambien sirve el MCP.

**Si falla un lote intermedio:** como la respuesta ya empezo a escribirse, el
status HTTP no se puede cambiar. En ese caso el JSON cierra igual pero
`pagination` trae un campo `error` y `devueltos` es menor que `total`.
**Comparar siempre `devueltos` contra `total` antes de dar por buena la carga.**

Para sincronizaciones periodicas sigue siendo preferible `desde`/`hasta`:
mueve menos datos y no depende del techo.

## Limites y errores

Rate limit: **60 requests por minuto** por API key.

| Codigo | Significado |
|--------|-------------|
| 400 | Parametros invalidos (fecha mal formada, id no UUID) o `too_many_rows` en un export |
| 401 | Falta el header `x-api-key`, o la key es invalida / esta desactivada |
| 403 | La key existe pero no tiene el permiso `leads:api` |
| 404 | El lead no existe |
| 429 | Se excedio el rate limit |
| 500 | Error del servidor |

## Auditoria

Cada request queda registrada en la tabla `api_request_log` (key, endpoint,
filtros, status, filas devueltas, IP). Ver `sql/api_request_log_table.sql`.

Para cortarle el acceso a un tercero: desactivar su key en
**Administracion > Integraciones**. Es inmediato y no requiere deploy.

---

## Desarrollo local

```bash
npm run dev:mcp
```

Levanta el MCP server (y la API REST) en `http://localhost:3002`.

## Estructura

```
mcp/
├── server.js        # Arranque, transporte MCP/SSE, montaje de rutas
├── lib/
│   ├── supabase.js  # Cliente PostgREST con service_role
│   ├── auth.js      # validateApiKey, hasPermission, middleware requireApiKey
│   └── audit.js     # Log fire-and-forget a api_request_log
└── routes/
    └── leads.js     # API REST de leads
```

## Deploy

El contenedor MCP (`Dockerfile.mcp`) **no se despliega por el pipeline de CI**:
hay que redesplegarlo manualmente en Dokploy. Mergear a `main` solo actualiza
la app principal.
