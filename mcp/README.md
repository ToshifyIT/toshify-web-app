# Toshify MCP Server

Servidor MCP (Model Context Protocol) para conectar chatbots y asistentes de IA.

## Conexion

**URL SSE:** `https://mcp.toshify.com.ar/sse`

**Documentacion:** `https://mcp.toshify.com.ar/docs`

## Autenticacion

Se requiere una **API key** para conectarse. Las API keys se generan desde la app de Toshify en **Administracion > Integraciones > MCP**.

Enviar la API key de una de estas formas:
- Header: `x-api-key: TU_API_KEY`
- Query param: `/sse?apiKey=TU_API_KEY`

## Configuracion del cliente

```json
{
  "mcpServers": {
    "toshify-leads": {
      "url": "https://mcp.toshify.com.ar/sse?apiKey=TU_API_KEY"
    }
  }
}
```

## Herramientas

| Herramienta | Permiso | Descripcion |
|-------------|---------|-------------|
| `buscar_leads` | leads:read | Buscar leads por nombre, DNI, email, estado, sede |
| `obtener_lead` | leads:read | Ver todos los datos de un lead por ID |
| `actualizar_lead` | leads:update | Actualizar estado y datos de un lead |
| `buscar_hireflix` | hireflix:read | Buscar registros historicos de Hireflix |

## Permisos

Cada API key tiene permisos granulares:

| Permiso | Que permite |
|---------|-------------|
| `leads:read` | Buscar y ver leads |
| `leads:update` | Actualizar campos de leads |
| `hireflix:read` | Buscar registros de Hireflix |

| `leads:api` | Consumir la API REST de leads (solo lectura) |

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
| `limit` | int | Por pagina, default 20, **max 100** |

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
coordenadas del domicilio, contacto de emergencia, evaluaciones de Hireflix y
`observaciones` (texto libre).

## Limites y errores

Rate limit: **60 requests por minuto** por API key.

| Codigo | Significado |
|--------|-------------|
| 400 | Parametros invalidos (fecha mal formada, id no UUID) |
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
