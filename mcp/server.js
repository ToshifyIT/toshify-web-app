/**
 * Toshify MCP Server
 * Model Context Protocol server para que chatbots accedan a datos de leads.
 * Transporte: Streamable HTTP con SSE fallback
 * Autenticacion: API key estatica via header x-api-key
 */

import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.MCP_PORT || 3002;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// =====================================================
// Supabase helper
// =====================================================

async function supabaseRequest(path, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase error (${res.status}): ${body}`);
  }

  return res;
}

// =====================================================
// API Key validation
// =====================================================

async function validateApiKey(apiKey) {
  if (!apiKey) return null;

  try {
    const res = await supabaseRequest(
      `api_keys?api_key=eq.${encodeURIComponent(apiKey)}&is_active=eq.true&select=id,name,permissions`
    );
    const data = await res.json();
    if (!data.length) return null;

    // Update last_used_at
    supabaseRequest(`api_keys?id=eq.${data[0].id}`, {
      method: 'PATCH',
      body: JSON.stringify({ last_used_at: new Date().toISOString() }),
    }).catch(() => {}); // fire and forget

    return data[0];
  } catch {
    return null;
  }
}

function hasPermission(apiKeyData, permission) {
  if (!apiKeyData?.permissions) return false;
  return apiKeyData.permissions.includes(permission);
}

// =====================================================
// Campos permitidos para actualizar leads
// =====================================================

const UPDATABLE_FIELDS = [
  'Estado de Lead',
  'Agente asignado',
  'Entrevistador asignado',
  'Especialista Onboarding',
  'Administrativo Asignado',
  'Dataentry Asignado',
  'Agente logistico asignado',
  'Guia asignado',
  'Asistente Virtual',
  'Nombre Completo',
  'Apellido',
  'Primer nombre',
  'Email',
  'Phone',
  'WhatsApp number',
  'DNI',
  'Edad',
  'Direccion',
  'City',
  'Region',
  'Country',
  'Zona',
  'Sede',
  'Turno',
  'Patente',
  'Compañero',
  'Tipo',
  'Licencia',
  'Monotributo',
  'Experiencia previa',
  'Acepta oferta',
  'Antecedentes penales',
  'Tiempo de antiguedad',
  'Fase de Preguntas',
  'Documentos pendientes',
  'Causal de cierre',
  'Contacto de emergencia',
  'Link facturacion',
  'Ayuda Entrevista',
  'Código Referido',
  'Año de auto',
  'Km de auto',
  'Marca y modelo de vehículo',
  'Fuente de lead',
  'Cerrado timeout wpp',
];

const UPDATABLE_SET = new Set(UPDATABLE_FIELDS);

// =====================================================
// Create MCP Server with tools
// =====================================================

function createMcpServer(apiKeyData) {
  const server = new McpServer({
    name: 'toshify-leads',
    version: '1.0.0',
  });

  // ----- Tool: buscar_leads -----
  if (hasPermission(apiKeyData, 'leads:read')) {
    server.tool(
      'buscar_leads',
      'Buscar leads por nombre, DNI, email, estado, sede u otros filtros. Devuelve una lista paginada.',
      {
        search: z.string().optional().describe('Buscar en Nombre Completo, Email o DNI'),
        estado: z.string().optional().describe('Filtrar por Estado de Lead (ej: Nuevo, Contactado, En proceso)'),
        agente: z.string().optional().describe('Filtrar por Agente asignado'),
        sede: z.string().optional().describe('Filtrar por Sede (ej: Buenos Aires, Córdoba)'),
        desde: z.string().optional().describe('Fecha creacion desde (ISO 8601, ej: 2025-01-01)'),
        hasta: z.string().optional().describe('Fecha creacion hasta (ISO 8601)'),
        page: z.number().optional().default(1).describe('Numero de pagina (default: 1)'),
        limit: z.number().optional().default(20).describe('Cantidad por pagina (default: 20, max: 100)'),
      },
      async (params) => {
        try {
          const page = Math.max(1, params.page || 1);
          const limit = Math.min(100, Math.max(1, params.limit || 20));
          const offset = (page - 1) * limit;

          const filters = [];
          if (params.estado) filters.push(`"Estado de Lead"=eq.${encodeURIComponent(params.estado)}`);
          if (params.agente) filters.push(`"Agente asignado"=eq.${encodeURIComponent(params.agente)}`);
          if (params.sede) filters.push(`"Sede"=eq.${encodeURIComponent(params.sede)}`);
          if (params.desde) filters.push(`"Fecha creación"=gte.${encodeURIComponent(params.desde)}`);
          if (params.hasta) filters.push(`"Fecha creación"=lte.${encodeURIComponent(params.hasta)}`);
          if (params.search) {
            const s = encodeURIComponent(params.search);
            filters.push(`or=("Nombre Completo".ilike.*${s}*,"Email".ilike.*${s}*,"DNI".ilike.*${s}*)`);
          }

          const filterStr = filters.length ? `&${filters.join('&')}` : '';
          const path = `leads?select=id,"Nombre Completo","Email","Phone","DNI","Estado de Lead","Sede","Agente asignado","Fecha creación","Fase de Preguntas"&order="Fecha creación".desc&offset=${offset}&limit=${limit}${filterStr}`;

          const res = await supabaseRequest(path, {
            headers: { 'Prefer': 'count=exact' },
          });

          const data = await res.json();
          const total = parseInt(res.headers.get('content-range')?.split('/')[1]) || data.length;

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
                leads: data,
              }, null, 2),
            }],
          };
        } catch (error) {
          return {
            content: [{ type: 'text', text: `Error buscando leads: ${error.message}` }],
            isError: true,
          };
        }
      }
    );

    // ----- Tool: obtener_lead -----
    server.tool(
      'obtener_lead',
      'Obtener todos los datos de un lead por su ID (UUID). Devuelve toda la informacion del lead.',
      {
        id: z.string().uuid().describe('ID del lead (UUID)'),
      },
      async ({ id }) => {
        try {
          const res = await supabaseRequest(`leads?id=eq.${id}&select=*`);
          const data = await res.json();

          if (!data.length) {
            return {
              content: [{ type: 'text', text: `Lead con ID ${id} no encontrado.` }],
              isError: true,
            };
          }

          return {
            content: [{ type: 'text', text: JSON.stringify(data[0], null, 2) }],
          };
        } catch (error) {
          return {
            content: [{ type: 'text', text: `Error obteniendo lead: ${error.message}` }],
            isError: true,
          };
        }
      }
    );
  }

  // ----- Tool: crear_lead -----
  if (hasPermission(apiKeyData, 'leads:create')) {
    server.tool(
      'crear_lead',
      'Crear un nuevo lead. Devuelve el lead creado con su ID.',
      {
        campos: z.record(z.string(), z.any()).describe('Objeto con los campos del lead. Ej: { "Nombre Completo": "Juan Perez", "Email": "juan@mail.com", "Sede": "Buenos Aires" }'),
      },
      async ({ campos }) => {
        try {
          // Filtrar solo campos permitidos
          const allowed = {};
          const rejected = [];

          for (const [key, value] of Object.entries(campos)) {
            if (UPDATABLE_SET.has(key)) {
              allowed[key] = value;
            } else {
              rejected.push(key);
            }
          }

          if (Object.keys(allowed).length === 0) {
            return {
              content: [{
                type: 'text',
                text: `Ningun campo valido para crear lead. Campos rechazados: ${rejected.join(', ')}. Campos permitidos: ${UPDATABLE_FIELDS.join(', ')}`,
              }],
              isError: true,
            };
          }

          const res = await supabaseRequest('leads', {
            method: 'POST',
            headers: { 'Prefer': 'return=representation' },
            body: JSON.stringify(allowed),
          });

          const data = await res.json();

          const result = {
            mensaje: 'Lead creado exitosamente',
            lead: data[0],
          };

          if (rejected.length > 0) {
            result.camposRechazados = rejected;
          }

          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        } catch (error) {
          return {
            content: [{ type: 'text', text: `Error creando lead: ${error.message}` }],
            isError: true,
          };
        }
      }
    );
  }

  // ----- Tool: actualizar_lead -----
  if (hasPermission(apiKeyData, 'leads:update')) {
    server.tool(
      'actualizar_lead',
      `Actualizar campos de un lead existente. Campos actualizables: ${UPDATABLE_FIELDS.join(', ')}`,
      {
        id: z.string().uuid().describe('ID del lead (UUID)'),
        campos: z.record(z.string(), z.any()).describe('Objeto con los campos a actualizar. Ej: { "Estado de Lead": "Contactado", "Sede": "Córdoba" }'),
      },
      async ({ id, campos }) => {
        try {
          // Validar campos
          const updates = {};
          const rejected = [];

          for (const [key, value] of Object.entries(campos)) {
            if (UPDATABLE_SET.has(key)) {
              updates[key] = value;
            } else {
              rejected.push(key);
            }
          }

          if (Object.keys(updates).length === 0) {
            return {
              content: [{
                type: 'text',
                text: `Ningun campo valido para actualizar. Campos rechazados: ${rejected.join(', ')}. Campos permitidos: ${UPDATABLE_FIELDS.join(', ')}`,
              }],
              isError: true,
            };
          }

          // Verificar que existe
          const checkRes = await supabaseRequest(`leads?id=eq.${id}&select=id`);
          const existing = await checkRes.json();
          if (!existing.length) {
            return {
              content: [{ type: 'text', text: `Lead con ID ${id} no encontrado.` }],
              isError: true,
            };
          }

          // Actualizar
          const updateRes = await supabaseRequest(`leads?id=eq.${id}`, {
            method: 'PATCH',
            headers: { 'Prefer': 'return=representation' },
            body: JSON.stringify(updates),
          });

          const updatedData = await updateRes.json();

          const result = {
            mensaje: 'Lead actualizado exitosamente',
            camposActualizados: Object.keys(updates),
            lead: updatedData[0],
          };

          if (rejected.length > 0) {
            result.camposRechazados = rejected;
          }

          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        } catch (error) {
          return {
            content: [{ type: 'text', text: `Error actualizando lead: ${error.message}` }],
            isError: true,
          };
        }
      }
    );
  }

  // ----- Tool: eliminar_lead -----
  if (hasPermission(apiKeyData, 'leads:delete')) {
    server.tool(
      'eliminar_lead',
      'Eliminar un lead por su ID (UUID). Esta accion es irreversible.',
      {
        id: z.string().uuid().describe('ID del lead (UUID)'),
      },
      async ({ id }) => {
        try {
          // Verificar que existe
          const checkRes = await supabaseRequest(`leads?id=eq.${id}&select=id,"Nombre Completo"`);
          const existing = await checkRes.json();
          if (!existing.length) {
            return {
              content: [{ type: 'text', text: `Lead con ID ${id} no encontrado.` }],
              isError: true,
            };
          }

          await supabaseRequest(`leads?id=eq.${id}`, {
            method: 'DELETE',
          });

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                mensaje: 'Lead eliminado exitosamente',
                id,
                nombre: existing[0]['Nombre Completo'],
              }, null, 2),
            }],
          };
        } catch (error) {
          return {
            content: [{ type: 'text', text: `Error eliminando lead: ${error.message}` }],
            isError: true,
          };
        }
      }
    );
  }

  // ----- Tool: buscar_hireflix -----
  if (hasPermission(apiKeyData, 'hireflix:read')) {
    server.tool(
      'buscar_hireflix',
      'Buscar registros historicos de Hireflix (entrevistas). Filtrar por nombre, email o fecha.',
      {
        search: z.string().optional().describe('Buscar en nombre o email'),
        desde: z.string().optional().describe('Fecha desde (ISO 8601)'),
        hasta: z.string().optional().describe('Fecha hasta (ISO 8601)'),
        page: z.number().optional().default(1).describe('Numero de pagina'),
        limit: z.number().optional().default(20).describe('Cantidad por pagina (max 100)'),
      },
      async (params) => {
        try {
          const page = Math.max(1, params.page || 1);
          const limit = Math.min(100, Math.max(1, params.limit || 20));
          const offset = (page - 1) * limit;

          const filters = [];
          if (params.desde) filters.push(`fecha=gte.${encodeURIComponent(params.desde)}`);
          if (params.hasta) filters.push(`fecha=lte.${encodeURIComponent(params.hasta)}`);
          if (params.search) {
            const s = encodeURIComponent(params.search);
            filters.push(`or=(nombre.ilike.*${s}*,email.ilike.*${s}*)`);
          }

          const filterStr = filters.length ? `&${filters.join('&')}` : '';
          const path = `hireflix_historico?select=*&order=fecha.desc&offset=${offset}&limit=${limit}${filterStr}`;

          const res = await supabaseRequest(path, {
            headers: { 'Prefer': 'count=exact' },
          });

          const data = await res.json();
          const total = parseInt(res.headers.get('content-range')?.split('/')[1]) || data.length;

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
                registros: data,
              }, null, 2),
            }],
          };
        } catch (error) {
          return {
            content: [{ type: 'text', text: `Error buscando hireflix: ${error.message}` }],
            isError: true,
          };
        }
      }
    );
  }

  // ----- Tool: obtener_hireflix -----
  if (hasPermission(apiKeyData, 'hireflix:read')) {
    server.tool(
      'obtener_hireflix',
      'Obtener todos los datos de un registro Hireflix por su ID (UUID).',
      {
        id: z.string().uuid().describe('ID del registro Hireflix (UUID)'),
      },
      async ({ id }) => {
        try {
          const res = await supabaseRequest(`hireflix_historico?id=eq.${id}&select=*`);
          const data = await res.json();

          if (!data.length) {
            return {
              content: [{ type: 'text', text: `Registro Hireflix con ID ${id} no encontrado.` }],
              isError: true,
            };
          }

          return {
            content: [{ type: 'text', text: JSON.stringify(data[0], null, 2) }],
          };
        } catch (error) {
          return {
            content: [{ type: 'text', text: `Error obteniendo registro Hireflix: ${error.message}` }],
            isError: true,
          };
        }
      }
    );
  }

  // ----- Tool: crear_hireflix -----
  if (hasPermission(apiKeyData, 'hireflix:create')) {
    server.tool(
      'crear_hireflix',
      'Crear un nuevo registro en hireflix_historico. Campos: nombre, email, fecha.',
      {
        nombre: z.string().optional().describe('Nombre del candidato'),
        email: z.string().optional().describe('Email del candidato'),
        fecha: z.string().optional().describe('Fecha de la entrevista (ISO 8601)'),
      },
      async (params) => {
        try {
          const body = {};
          if (params.nombre) body.nombre = params.nombre;
          if (params.email) body.email = params.email;
          if (params.fecha) body.fecha = params.fecha;

          if (Object.keys(body).length === 0) {
            return {
              content: [{ type: 'text', text: 'Debes proporcionar al menos un campo: nombre, email o fecha.' }],
              isError: true,
            };
          }

          const res = await supabaseRequest('hireflix_historico', {
            method: 'POST',
            headers: { 'Prefer': 'return=representation' },
            body: JSON.stringify(body),
          });

          const data = await res.json();

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                mensaje: 'Registro Hireflix creado exitosamente',
                registro: data[0],
              }, null, 2),
            }],
          };
        } catch (error) {
          return {
            content: [{ type: 'text', text: `Error creando registro Hireflix: ${error.message}` }],
            isError: true,
          };
        }
      }
    );
  }

  // ----- Tool: actualizar_hireflix -----
  if (hasPermission(apiKeyData, 'hireflix:update')) {
    server.tool(
      'actualizar_hireflix',
      'Actualizar un registro existente en hireflix_historico. Campos actualizables: nombre, email, fecha.',
      {
        id: z.string().uuid().describe('ID del registro Hireflix (UUID)'),
        campos: z.record(z.string(), z.any()).describe('Campos a actualizar. Ej: { "nombre": "Maria Lopez", "email": "maria@mail.com" }'),
      },
      async ({ id, campos }) => {
        try {
          const HIREFLIX_FIELDS = new Set(['nombre', 'email', 'fecha']);
          const updates = {};
          const rejected = [];

          for (const [key, value] of Object.entries(campos)) {
            if (HIREFLIX_FIELDS.has(key)) {
              updates[key] = value;
            } else {
              rejected.push(key);
            }
          }

          if (Object.keys(updates).length === 0) {
            return {
              content: [{
                type: 'text',
                text: `Ningun campo valido para actualizar. Campos rechazados: ${rejected.join(', ')}. Campos permitidos: nombre, email, fecha`,
              }],
              isError: true,
            };
          }

          // Verificar que existe
          const checkRes = await supabaseRequest(`hireflix_historico?id=eq.${id}&select=id`);
          const existing = await checkRes.json();
          if (!existing.length) {
            return {
              content: [{ type: 'text', text: `Registro Hireflix con ID ${id} no encontrado.` }],
              isError: true,
            };
          }

          const updateRes = await supabaseRequest(`hireflix_historico?id=eq.${id}`, {
            method: 'PATCH',
            headers: { 'Prefer': 'return=representation' },
            body: JSON.stringify(updates),
          });

          const updatedData = await updateRes.json();

          const result = {
            mensaje: 'Registro Hireflix actualizado exitosamente',
            camposActualizados: Object.keys(updates),
            registro: updatedData[0],
          };

          if (rejected.length > 0) {
            result.camposRechazados = rejected;
          }

          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        } catch (error) {
          return {
            content: [{ type: 'text', text: `Error actualizando registro Hireflix: ${error.message}` }],
            isError: true,
          };
        }
      }
    );
  }

  // ----- Tool: eliminar_hireflix -----
  if (hasPermission(apiKeyData, 'hireflix:delete')) {
    server.tool(
      'eliminar_hireflix',
      'Eliminar un registro de hireflix_historico por su ID (UUID). Esta accion es irreversible.',
      {
        id: z.string().uuid().describe('ID del registro Hireflix (UUID)'),
      },
      async ({ id }) => {
        try {
          // Verificar que existe
          const checkRes = await supabaseRequest(`hireflix_historico?id=eq.${id}&select=id,nombre`);
          const existing = await checkRes.json();
          if (!existing.length) {
            return {
              content: [{ type: 'text', text: `Registro Hireflix con ID ${id} no encontrado.` }],
              isError: true,
            };
          }

          await supabaseRequest(`hireflix_historico?id=eq.${id}`, {
            method: 'DELETE',
          });

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                mensaje: 'Registro Hireflix eliminado exitosamente',
                id,
                nombre: existing[0].nombre,
              }, null, 2),
            }],
          };
        } catch (error) {
          return {
            content: [{ type: 'text', text: `Error eliminando registro Hireflix: ${error.message}` }],
            isError: true,
          };
        }
      }
    );
  }

  return server;
}

// =====================================================
// Express + SSE Transport
// =====================================================

const app = express();

// IMPORTANTE: NO usar express.json() globalmente
// porque consume el body stream antes de que SSEServerTransport.handlePostMessage pueda leerlo.
// Solo usar en rutas que lo necesiten explicitamente.

// Docs page
app.get('/docs', (req, res) => {
  res.sendFile(join(__dirname, 'docs.html'));
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'toshify-mcp', version: '1.0.0' });
});

// Store active transports
const transports = {};

// SSE endpoint - client connects here for streaming
app.get('/sse', async (req, res) => {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  const apiKeyData = await validateApiKey(apiKey);

  if (!apiKeyData) {
    return res.status(401).json({ error: 'API key invalida o inactiva' });
  }

  console.log(`[MCP] Nueva conexion SSE de: ${apiKeyData.name}`);

  const transport = new SSEServerTransport('/messages', res);
  const sessionId = transport.sessionId;
  transports[sessionId] = { transport, apiKeyData };

  const server = createMcpServer(apiKeyData);

  res.on('close', () => {
    console.log(`[MCP] Conexion cerrada: ${apiKeyData.name} (${sessionId})`);
    delete transports[sessionId];
  });

  await server.connect(transport);
});

// Messages endpoint - client sends messages here
app.post('/messages', async (req, res) => {
  const sessionId = req.query.sessionId;

  if (!sessionId || !transports[sessionId]) {
    return res.status(400).json({ error: 'Session invalida. Conectate primero a /sse' });
  }

  await transports[sessionId].transport.handlePostMessage(req, res);
});

// =====================================================
// Start server
// =====================================================

app.listen(PORT, () => {
  console.log(`Toshify MCP Server running on port ${PORT}`);
  console.log(`  SSE endpoint: http://localhost:${PORT}/sse`);
  console.log(`  Health check: http://localhost:${PORT}/health`);
});
