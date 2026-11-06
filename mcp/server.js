/**
 * Toshify MCP Server
 * Model Context Protocol server para que chatbots accedan a datos de leads.
 * Transporte: Streamable HTTP en /mcp (claude.ai, Claude Desktop) y SSE en /sse (legacy)
 * Autenticacion: API key estatica via header x-api-key o query ?apiKey=
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { supabaseRequest } from './lib/supabase.js';
import { validateApiKey, hasPermission } from './lib/auth.js';
import { registrarConsultaMcp } from './lib/audit.js';
import {
  ErrorDatos, OPERADORES, PERIODOS, LIMITE_DEFAULT, LIMITE_MAX, MAX_FILAS_AGRUPAR,
  listarDatasets, modulos, describirDataset, consultar, contar,
} from './lib/datos.js';
import leadsRouter from './routes/leads.js';
import vehiculosRouter from './routes/vehiculos.js';
import conductoresRouter from './routes/conductores.js';
import asignacionesRouter from './routes/asignaciones.js';
import flotaRouter from './routes/flota.js';
import keysRouter from './routes/keys.js';
import leadsCrearRouter from './routes/leadsCrear.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.MCP_PORT || 3002;

// =====================================================
// Campos de la tabla leads (nombres reales en BD, snake_case)
// =====================================================

const UPDATABLE_FIELDS = [
  'estado_de_lead',
  'agente_asignado',
  'entrevistador_asignado',
  'especialista_onboarding',
  'administrativo_asignado',
  'dataentry_asignado',
  'agente_logistico_asignado',
  'guia_asignado',
  'asistente_virtual',
  'nombre_completo',
  'apellido',
  'primer_nombre',
  'email',
  'phone',
  'whatsapp_number',
  'dni',
  'edad',
  'direccion',
  'city',
  'region',
  'country',
  'zona',
  'sede',
  'turno',
  'patente',
  'companero',
  'tipo',
  'licencia',
  'monotributo',
  'experiencia_previa',
  'acepta_oferta',
  'antecedentes_penales',
  'tiempo_de_antiguedad',
  'fase_de_preguntas',
  'documentos_pendientes',
  'causal_de_cierre',
  'contacto_de_emergencia',
  'link_facturacion',
  'ayuda_entrevista',
  'codigo_referido',
  'anio_de_auto',
  'km_de_auto',
  'marca_y_modelo_de_vehiculo',
  'fuente_de_lead',
  'cerrado_timeout_wpp',
];

const UPDATABLE_SET = new Set(UPDATABLE_FIELDS);

// =====================================================
// Helpers de normalización de campos
// =====================================================

/**
 * Normaliza el valor del campo `licencia` del lead.
 * Regla: solo se permite 'Si', 'No' o null.
 * - null/empty/undefined → null
 * - 'NO' / 'NÓ' / 'FALSE' / '0' (cualquier capitalización) → 'No'
 * - Cualquier otro valor con contenido → 'Si'
 *   (la presencia de texto/categoría implica que tiene licencia)
 */
function normalizarLicencia(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'boolean') return value ? 'Si' : 'No';
  const s = String(value).trim();
  if (!s) return null;
  const upper = s.toUpperCase();
  if (upper === 'NO' || upper === 'NÓ' || upper === 'FALSE' || upper === '0') return 'No';
  return 'Si';
}

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
        search: z.string().optional().describe('Buscar en nombre_completo, email o dni'),
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
          if (params.estado) filters.push(`estado_de_lead=eq.${encodeURIComponent(params.estado)}`);
          if (params.agente) filters.push(`agente_asignado=eq.${encodeURIComponent(params.agente)}`);
          if (params.sede) filters.push(`sede=eq.${encodeURIComponent(params.sede)}`);
          if (params.desde) filters.push(`fecha_creacion=gte.${encodeURIComponent(params.desde)}`);
          if (params.hasta) filters.push(`fecha_creacion=lte.${encodeURIComponent(params.hasta)}`);
          if (params.search) {
            const s = encodeURIComponent(params.search);
            filters.push(`or=(nombre_completo.ilike.*${s}*,email.ilike.*${s}*,dni.ilike.*${s}*)`);
          }

          const filterStr = filters.length ? `&${filters.join('&')}` : '';
          const path = `leads?select=id,nombre_completo,email,phone,dni,estado_de_lead,sede,agente_asignado,fecha_creacion,fase_de_preguntas&order=fecha_creacion.desc&offset=${offset}&limit=${limit}${filterStr}`;

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
        campos: z.record(z.string(), z.any()).describe('Objeto con los campos del lead. Ej: { "nombre_completo": "Juan Perez", "email": "juan@mail.com", "sede": "Buenos Aires" }'),
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

          // Normalizar licencia para que solo entre 'Si' / 'No' / null
          if ('licencia' in allowed) {
            allowed.licencia = normalizarLicencia(allowed.licencia);
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
        campos: z.record(z.string(), z.any()).describe('Objeto con los campos a actualizar. Ej: { "estado_de_lead": "Contactado", "sede": "Cordoba" }'),
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

          // Normalizar licencia para que solo entre 'Si' / 'No' / null
          if ('licencia' in updates) {
            updates.licencia = normalizarLicencia(updates.licencia);
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
          const checkRes = await supabaseRequest(`leads?id=eq.${id}&select=id,nombre_completo`);
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
                nombre: existing[0].nombre_completo,
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

  // =====================================================
  // Datos de operación (solo lectura) — permiso datos:read
  // Catálogo en lib/catalogoDatos.js; consultas en lib/datos.js.
  // =====================================================
  if (hasPermission(apiKeyData, 'datos:read')) {
    const responder = (herramienta, params, resultado) => {
      registrarConsultaMcp({ apiKeyData, herramienta, params, status: 200, filas: resultado.filas?.length ?? resultado.grupos?.length ?? null });
      return { content: [{ type: 'text', text: JSON.stringify(resultado, null, 2) }] };
    };
    const fallar = (herramienta, params, error) => {
      const mensaje = error instanceof ErrorDatos ? error.message : 'No se pudo completar la consulta.';
      if (!(error instanceof ErrorDatos)) console.error(`[MCP ${herramienta}]`, error);
      registrarConsultaMcp({ apiKeyData, herramienta, params, status: 400, filas: null });
      return { content: [{ type: 'text', text: mensaje }], isError: true };
    };
    const esquemaFiltros = z.array(z.object({
      campo: z.string().describe('Nombre del campo (ver describir_datos)'),
      operador: z.enum(OPERADORES).describe('igual, distinto, mayor, mayor_igual, menor, menor_igual, contiene (texto parcial), en (lista), es_nulo'),
      valor: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]).optional()
        .describe('Valor a comparar. Fechas en formato AAAA-MM-DD. Para "en", una lista. Para "es_nulo", true o false'),
    })).optional().describe('Condiciones que deben cumplirse todas (Y)');

    server.tool(
      'listar_datos',
      `Lista los conjuntos de datos de operación de Toshify que se pueden consultar, con su módulo y descripción. Empezá por acá. Módulos: ${modulos().join(', ')}. Solo lectura.`,
      { modulo: z.string().optional().describe('Filtrar por módulo') },
      async (params) => {
        try {
          return responder('listar_datos', params, { datasets: listarDatasets(params.modulo) });
        } catch (error) {
          return fallar('listar_datos', params, error);
        }
      }
    );

    server.tool(
      'describir_datos',
      'Muestra los campos de un conjunto de datos y su tipo (texto, numero, fecha, booleano, id, json). Usalo antes de consultar para saber qué campos filtrar.',
      { dataset: z.string().describe('Nombre del conjunto de datos (ver listar_datos)') },
      async (params) => {
        try {
          return responder('describir_datos', params, describirDataset(params.dataset));
        } catch (error) {
          return fallar('describir_datos', params, error);
        }
      }
    );

    server.tool(
      'consultar_datos',
      `Devuelve registros de un conjunto de datos, con filtros, orden y paginación (máximo ${LIMITE_MAX} por página). Incluye el total de registros que cumplen los filtros. Los campos que terminan en _id se cruzan con el id de otro conjunto (por ejemplo conductor_id con conductores, vehiculo_id con vehiculos, sede_id con sedes). Solo lectura.`,
      {
        dataset: z.string().describe('Nombre del conjunto de datos'),
        campos: z.array(z.string()).optional().describe('Campos a devolver (por defecto todos)'),
        filtros: esquemaFiltros,
        orden: z.string().optional().describe('Campo por el que ordenar'),
        descendente: z.boolean().optional().describe('Orden descendente (default false)'),
        limite: z.number().optional().describe(`Registros por página (default ${LIMITE_DEFAULT}, máximo ${LIMITE_MAX})`),
        pagina: z.number().optional().describe('Página (default 1)'),
      },
      async (params) => {
        try {
          return responder('consultar_datos', params, await consultar(params));
        } catch (error) {
          return fallar('consultar_datos', params, error);
        }
      }
    );

    server.tool(
      'contar_datos',
      `Cuenta registros de un conjunto de datos que cumplen los filtros. Con agrupar_por devuelve la cantidad por cada valor de ese campo; si el campo es una fecha se puede agrupar por día, mes o año (periodo). Para agrupar se recorren hasta ${MAX_FILAS_AGRUPAR} registros. Ideal para indicadores. Solo lectura.`,
      {
        dataset: z.string().describe('Nombre del conjunto de datos'),
        filtros: esquemaFiltros,
        agrupar_por: z.string().optional().describe('Campo por el que agrupar'),
        periodo: z.enum(PERIODOS).optional().describe('Si agrupar_por es una fecha: dia, mes o anio'),
      },
      async (params) => {
        try {
          return responder('contar_datos', params, await contar(params));
        } catch (error) {
          return fallar('contar_datos', params, error);
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

// =====================================================
// API REST publica (solo lectura) para terceros
// =====================================================
// Montada en el mismo servicio que el MCP porque aca ya viven la validacion de
// API keys y el acceso con service_role. Las herramientas MCP no se tocan.

// El rate limit va ANTES de autenticar a proposito: asi una key invalida
// tampoco puede martillar el endpoint probando valores.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => String(req.headers['x-api-key'] || 'sin-key'),
  validate: { keyGeneratorIpFallback: false },
  message: { error: 'rate_limited', message: 'Demasiadas requests. Limite: 60 por minuto.' },
});

// Self-service de API keys. Va SIN apiLimiter a proposito: se autentica con
// usuario y contrasena (no con x-api-key), asi que el limiter de lectura no
// puede distinguir quien llama. Trae su propio rate limit, mas estricto.
app.use('/api/v1', keysRouter);

// Alta de leads. Limite propio y mas bajo que el de lectura: es el unico
// endpoint que escribe en la base, asi que no comparte cupo con los GET.
const escrituraLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => String(req.headers['x-api-key'] || 'sin-key'),
  validate: { keyGeneratorIpFallback: false },
  message: { error: 'rate_limited', message: 'Demasiadas altas. Limite: 20 por minuto.' },
});

app.use('/api/v1', apiLimiter, leadsRouter);
app.use('/api/v1', escrituraLimiter, leadsCrearRouter);
app.use('/api/v1', apiLimiter, vehiculosRouter);
app.use('/api/v1', apiLimiter, conductoresRouter);
app.use('/api/v1', apiLimiter, asignacionesRouter);
app.use('/api/v1', apiLimiter, flotaRouter);

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
// Streamable HTTP (/mcp) - transporte actual del protocolo
// =====================================================
// claude.ai y Claude Desktop ya no conectan por /sse (SSE esta deprecado): al
// verificar el conector hacen POST a la URL y con /sse reciben 404. /mcp es el
// mismo servidor, con las mismas herramientas y permisos; /sse queda para los
// clientes que ya lo usan.
//
// Modo sin sesion: cada POST crea su servidor y su transporte y los cierra al
// terminar. No guarda estado en memoria, asi que sobrevive a reinicios del
// contenedor y no depende de que todas las requests caigan en la misma instancia.

const mcpLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => String(apiKeyDeRequest(req) || 'sin-key'),
  validate: { keyGeneratorIpFallback: false },
  message: { jsonrpc: '2.0', error: { code: -32000, message: 'Demasiadas requests. Limite: 120 por minuto.' }, id: null },
});

// La key se acepta por header x-api-key, Authorization: Bearer o query ?apiKey=
// (claude.ai solo deja configurar la URL del conector, sin headers propios).
function apiKeyDeRequest(req) {
  const bearer = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  return req.headers['x-api-key'] || bearer?.[1] || req.query.apiKey;
}

function errorJsonRpc(res, status, message) {
  res.status(status).json({ jsonrpc: '2.0', error: { code: -32000, message }, id: null });
}

// express.json() solo en esta ruta: a nivel global rompe /messages (ver arriba).
app.post('/mcp', mcpLimiter, express.json({ limit: '1mb' }), async (req, res) => {
  const apiKeyData = await validateApiKey(apiKeyDeRequest(req));
  if (!apiKeyData) return errorJsonRpc(res, 401, 'API key invalida o inactiva');

  const server = createMcpServer(apiKeyData);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => {
    transport.close();
    server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('[MCP] Error en /mcp:', error);
    if (!res.headersSent) errorJsonRpc(res, 500, 'Error interno del servidor');
  }
});

// Sin sesion no hay stream de notificaciones (GET) ni sesion que cerrar (DELETE).
app.get('/mcp', (req, res) => errorJsonRpc(res, 405, 'Metodo no permitido'));
app.delete('/mcp', (req, res) => errorJsonRpc(res, 405, 'Metodo no permitido'));

// =====================================================
// Start server
// =====================================================

app.listen(PORT, () => {
  console.log(`Toshify MCP Server running on port ${PORT}`);
  console.log(`  MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`  SSE endpoint: http://localhost:${PORT}/sse`);
  console.log(`  Health check: http://localhost:${PORT}/health`);
});
