# Toshify MCP Server

Servidor MCP (Model Context Protocol) para que chatbots y asistentes de IA accedan a datos de **leads** y **hireflix_historico**.

## Acceso restringido

Este servidor solo tiene acceso a:
- **leads** - Lectura y actualizacion
- **hireflix_historico** - Solo lectura

No tiene acceso a ninguna otra tabla del sistema (conductores, vehiculos, facturacion, etc).

## Autenticacion

Se usa una **API key estatica** que se genera en la tabla `api_keys` de Supabase.

Cada chatbot/integracion tiene su propia API key con permisos granulares:
- `leads:read` - Buscar y ver leads
- `leads:update` - Actualizar campos de leads
- `hireflix:read` - Buscar registros de Hireflix

## Setup inicial

### 1. Crear la tabla api_keys

Ejecutar el SQL en el editor de Supabase:

```sql
-- Copiar el contenido de /sql/api_keys_table.sql y ejecutar
```

### 2. Obtener la API key generada

```sql
SELECT name, api_key FROM api_keys;
```

Copiar el valor de `api_key` - ese es el token que usa el chatbot.

### 3. Variables de entorno requeridas

```env
VITE_SUPABASE_URL=https://supabase.toshify.com.ar
SUPABASE_SERVICE_ROLE_KEY=eyJ...
MCP_PORT=3002
```

### 4. Correr localmente

```bash
npm run dev:mcp
```

El server arranca en `http://localhost:3002`.

## Endpoints

| Ruta | Metodo | Descripcion |
|------|--------|-------------|
| `/health` | GET | Health check |
| `/sse` | GET | Conexion SSE (requiere header `x-api-key` o query param `?apiKey=`) |
| `/messages` | POST | Envio de mensajes MCP (requiere `?sessionId=`) |

## Herramientas disponibles (Tools)

### buscar_leads
Buscar leads por nombre, DNI, email, estado, sede u otros filtros.

**Parametros:**
| Parametro | Tipo | Requerido | Descripcion |
|-----------|------|-----------|-------------|
| search | string | No | Buscar en Nombre Completo, Email o DNI |
| estado | string | No | Filtrar por Estado de Lead |
| agente | string | No | Filtrar por Agente asignado |
| sede | string | No | Filtrar por Sede |
| desde | string | No | Fecha desde (ISO 8601) |
| hasta | string | No | Fecha hasta (ISO 8601) |
| page | number | No | Pagina (default: 1) |
| limit | number | No | Cantidad por pagina (default: 20, max: 100) |

**Ejemplo de uso por el chatbot:**
```
buscar_leads({ search: "Juan Perez" })
buscar_leads({ estado: "Nuevo", sede: "Buenos Aires" })
buscar_leads({ desde: "2025-01-01", hasta: "2025-12-31" })
```

### obtener_lead
Obtener todos los datos de un lead por su ID.

**Parametros:**
| Parametro | Tipo | Requerido | Descripcion |
|-----------|------|-----------|-------------|
| id | string (UUID) | Si | ID del lead |

### actualizar_lead
Actualizar campos de un lead existente.

**Parametros:**
| Parametro | Tipo | Requerido | Descripcion |
|-----------|------|-----------|-------------|
| id | string (UUID) | Si | ID del lead |
| campos | object | Si | Campos a actualizar |

**Campos actualizables:**
- Estado de Lead
- Agente asignado, Entrevistador asignado, Especialista Onboarding
- Administrativo Asignado, Dataentry Asignado, Agente logistico asignado
- Guia asignado, Asistente Virtual
- Nombre Completo, Apellido, Primer nombre
- Email, Phone, WhatsApp number
- DNI, Edad, Direccion, City, Region, Country, Zona
- Sede, Turno, Patente, Tipo
- Licencia, Monotributo, Experiencia previa, Acepta oferta
- Antecedentes penales, Tiempo de antiguedad
- Fase de Preguntas, Documentos pendientes
- Causal de cierre, Contacto de emergencia
- Link facturacion, Ayuda Entrevista
- Codigo Referido, Ano de auto, Km de auto, Marca y modelo de vehiculo
- Fuente de lead, Cerrado timeout wpp

**Ejemplo:**
```
actualizar_lead({
  id: "550e8400-e29b-41d4-a716-446655440000",
  campos: {
    "Estado de Lead": "Contactado",
    "Sede": "Cordoba"
  }
})
```

### buscar_hireflix
Buscar registros historicos de Hireflix (entrevistas).

**Parametros:**
| Parametro | Tipo | Requerido | Descripcion |
|-----------|------|-----------|-------------|
| search | string | No | Buscar en nombre o email |
| desde | string | No | Fecha desde (ISO 8601) |
| hasta | string | No | Fecha hasta (ISO 8601) |
| page | number | No | Pagina (default: 1) |
| limit | number | No | Cantidad por pagina (max: 100) |

## Conectar un chatbot

### Desde cualquier cliente MCP compatible

Configurar el servidor MCP con:
- **URL:** `https://<tu-dominio>/sse`
- **Header:** `x-api-key: <tu-api-key>`

### Ejemplo de configuracion para Claude Desktop

```json
{
  "mcpServers": {
    "toshify-leads": {
      "url": "https://<tu-dominio>/sse?apiKey=<tu-api-key>"
    }
  }
}
```

## Gestion de API Keys

### Crear una nueva API key

```sql
INSERT INTO api_keys (name, api_key, permissions)
VALUES (
  'Mi Chatbot',
  encode(gen_random_bytes(32), 'hex'),
  '["leads:read", "leads:update", "hireflix:read"]'::jsonb
);
```

### Solo lectura (sin actualizar leads)

```sql
INSERT INTO api_keys (name, api_key, permissions)
VALUES (
  'Chatbot Solo Lectura',
  encode(gen_random_bytes(32), 'hex'),
  '["leads:read", "hireflix:read"]'::jsonb
);
```

### Desactivar una API key

```sql
UPDATE api_keys SET is_active = false WHERE name = 'Mi Chatbot';
```

### Ver todas las keys

```sql
SELECT name, api_key, is_active, permissions, last_used_at FROM api_keys;
```

## Deploy

El MCP Server se deploya como un servicio separado en Dokploy usando `mcp/Dockerfile`.

Puerto por defecto: **3002**

Variables de entorno requeridas en Dokploy:
- `VITE_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MCP_PORT` (default: 3002)
