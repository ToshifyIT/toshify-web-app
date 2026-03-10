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

## Desarrollo local

```bash
npm run dev:mcp
```

Levanta el MCP server en `http://localhost:3002`.
