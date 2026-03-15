# Guía de Prueba - Toshify MCP Server

## Datos de conexión

- **SSE Endpoint**: `https://mcp.toshify.com.ar/sse`
- **Messages Endpoint**: `https://mcp.toshify.com.ar/messages`
- **Docs**: `https://mcp.toshify.com.ar/docs`
- **API Key**: `cd4adf4b0ca3fca0574ae6ceb27840aceb561316600accc22ace1d9a79361539` (nombre: "prueba")

---

## Paso 1: Conectar via SSE

Abrir conexión SSE persistente. El server devuelve un `sessionId` que se usa en todos los mensajes posteriores.

```bash
curl -s -N "https://mcp.toshify.com.ar/sse?apiKey=cd4adf4b0ca3fca0574ae6ceb27840aceb561316600accc22ace1d9a79361539" --max-time 30
```

**Respuesta esperada:**
```
event: endpoint
data: /messages?sessionId=6bc20261-aa6f-44a6-b870-22b375083e38
```

> La conexión SSE debe mantenerse abierta. Las respuestas a los POST llegan por este stream.

---

## Paso 2: Inicializar sesión MCP

Enviar `initialize` usando el `sessionId` obtenido en el paso anterior.

```bash
curl -s -X POST "https://mcp.toshify.com.ar/messages?sessionId=6bc20261-aa6f-44a6-b870-22b375083e38" \
  -H "Content-Type: application/json" \
  -H "x-api-key: cd4adf4b0ca3fca0574ae6ceb27840aceb561316600accc22ace1d9a79361539" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": { "name": "test", "version": "1.0" }
    }
  }'
```

**Respuesta en el stream SSE:**
```json
{
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": { "tools": { "listChanged": true } },
    "serverInfo": { "name": "toshify-leads", "version": "1.0.0" }
  },
  "jsonrpc": "2.0",
  "id": 1
}
```

---

## Paso 3: Listar herramientas disponibles

```bash
curl -s -X POST "https://mcp.toshify.com.ar/messages?sessionId=6bc20261-aa6f-44a6-b870-22b375083e38" \
  -H "Content-Type: application/json" \
  -H "x-api-key: cd4adf4b0ca3fca0574ae6ceb27840aceb561316600accc22ace1d9a79361539" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list",
    "params": {}
  }'
```

**Herramientas disponibles (según permisos de la API key):**

| Herramienta | Permiso | Descripción |
|-------------|---------|-------------|
| `buscar_leads` | leads:read | Buscar leads por nombre, DNI, email, estado, sede |
| `obtener_lead` | leads:read | Obtener todos los datos de un lead por ID |
| `crear_lead` | leads:create | Crear un nuevo lead |
| `actualizar_lead` | leads:update | Actualizar campos de un lead |
| `eliminar_lead` | leads:delete | Eliminar un lead (irreversible) |
| `buscar_hireflix` | hireflix:read | Buscar registros de entrevistas Hireflix |
| `obtener_hireflix` | hireflix:read | Obtener registro Hireflix por ID |
| `crear_hireflix` | hireflix:create | Crear registro Hireflix |
| `actualizar_hireflix` | hireflix:update | Actualizar registro Hireflix |
| `eliminar_hireflix` | hireflix:delete | Eliminar registro Hireflix (irreversible) |

---

## Paso 4: Llamar una herramienta

### Ejemplo: Buscar leads

```bash
curl -s -X POST "https://mcp.toshify.com.ar/messages?sessionId=6bc20261-aa6f-44a6-b870-22b375083e38" \
  -H "Content-Type: application/json" \
  -H "x-api-key: cd4adf4b0ca3fca0574ae6ceb27840aceb561316600accc22ace1d9a79361539" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "buscar_leads",
      "arguments": { "limit": 3 }
    }
  }'
```

### Ejemplo: Buscar leads por nombre

```bash
curl -s -X POST "https://mcp.toshify.com.ar/messages?sessionId=6bc20261-aa6f-44a6-b870-22b375083e38" \
  -H "Content-Type: application/json" \
  -H "x-api-key: cd4adf4b0ca3fca0574ae6ceb27840aceb561316600accc22ace1d9a79361539" \
  -d '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "tools/call",
    "params": {
      "name": "buscar_leads",
      "arguments": { "search": "Juan", "limit": 5 }
    }
  }'
```

### Ejemplo: Buscar leads por estado y sede

```bash
curl -s -X POST "https://mcp.toshify.com.ar/messages?sessionId=6bc20261-aa6f-44a6-b870-22b375083e38" \
  -H "Content-Type: application/json" \
  -H "x-api-key: cd4adf4b0ca3fca0574ae6ceb27840aceb561316600accc22ace1d9a79361539" \
  -d '{
    "jsonrpc": "2.0",
    "id": 5,
    "method": "tools/call",
    "params": {
      "name": "buscar_leads",
      "arguments": { "estado": "Nuevo", "sede": "Buenos Aires" }
    }
  }'
```

### Ejemplo: Buscar registros Hireflix

```bash
curl -s -X POST "https://mcp.toshify.com.ar/messages?sessionId=6bc20261-aa6f-44a6-b870-22b375083e38" \
  -H "Content-Type: application/json" \
  -H "x-api-key: cd4adf4b0ca3fca0574ae6ceb27840aceb561316600accc22ace1d9a79361539" \
  -d '{
    "jsonrpc": "2.0",
    "id": 6,
    "method": "tools/call",
    "params": {
      "name": "buscar_hireflix",
      "arguments": { "limit": 5 }
    }
  }'
```

---

## Script completo de prueba (copiar y pegar)

```bash
#!/bin/bash
API_KEY="cd4adf4b0ca3fca0574ae6ceb27840aceb561316600accc22ace1d9a79361539"
BASE_URL="https://mcp.toshify.com.ar"

# 1. Abrir SSE en background y capturar sessionId
curl -s -N "$BASE_URL/sse?apiKey=$API_KEY" --max-time 20 > /tmp/mcp_sse.txt 2>&1 &
SSE_PID=$!
sleep 2

SESSION_ID=$(grep "sessionId=" /tmp/mcp_sse.txt | head -1 | sed 's/.*sessionId=//')
echo "Session ID: $SESSION_ID"

# 2. Inicializar
curl -s -X POST "$BASE_URL/messages?sessionId=$SESSION_ID" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
echo ""
sleep 2

# 3. Listar herramientas
curl -s -X POST "$BASE_URL/messages?sessionId=$SESSION_ID" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
echo ""
sleep 2

# 4. Buscar leads
curl -s -X POST "$BASE_URL/messages?sessionId=$SESSION_ID" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"buscar_leads","arguments":{"limit":3}}}'
echo ""
sleep 3

# 5. Ver respuestas del stream SSE
echo "--- Respuestas SSE ---"
cat /tmp/mcp_sse.txt

kill $SSE_PID 2>/dev/null
```

---

## Configurar en un cliente MCP (chatbot)

Para conectar un chatbot o cliente MCP, usar esta configuración:

```json
{
  "mcpServers": {
    "toshify": {
      "url": "https://mcp.toshify.com.ar/sse?apiKey=cd4adf4b0ca3fca0574ae6ceb27840aceb561316600accc22ace1d9a79361539"
    }
  }
}
```

---

## Resultados de la prueba (14/03/2026)

| Paso | Resultado |
|------|-----------|
| Conexión SSE | OK - Session ID asignado |
| Initialize | OK - Server `toshify-leads` v1.0.0 |
| tools/list | OK - 10 herramientas disponibles |
| buscar_leads | OK - Accepted, respuesta via SSE |

**Estado: MCP Server funcionando correctamente.**
