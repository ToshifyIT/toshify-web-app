/**
 * Toshify MCP Server
 * Model Context Protocol server para que chatbots accedan a datos de leads.
 * Transporte: Streamable HTTP en /mcp (claude.ai, Claude Desktop) y SSE en /sse (legacy)
 * Autenticacion en /mcp:
 *   - login por persona (OAuth, lib/oauth.js): cada uno entra con su cuenta de Toshibase y
 *     ve las mismas tablas que en el sistema (lib/accesoUsuario.js);
 *   - API key (header x-api-key, Authorization: Bearer o ?apiKey=) para integraciones.
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
import { requiereUsuario } from './lib/accesoUsuario.js';
import { registrarConsultaMcp } from './lib/audit.js';
import oauthRouter, { esTokenOAuth, validarTokenOAuth, headerLogin } from './lib/oauth.js';
import { CATALOGO } from './lib/catalogoDatos.js';
import {
  ErrorDatos, OPERADORES, PERIODOS, LIMITE_DEFAULT, LIMITE_MAX, MAX_FILAS_AGRUPAR, MAX_DESCRIBIR,
  listarDatasets, modulos, describirDatasets, consultar, contar, reportesVisibles, consultarReporte,
  tieneAccesoADatos,
} from './lib/datos.js';
import leadsRouter from './routes/leads.js';
import vehiculosRouter from './routes/vehiculos.js';
import conductoresRouter from './routes/conductores.js';
import asignacionesRouter from './routes/asignaciones.js';
import flotaRouter from './routes/flota.js';
import keysRouter from './routes/keys.js';
import leadsCrearRouter from './routes/leadsCrear.js';
import { cargarTablasAuto } from './lib/tablasAuto.js';

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

/** Columnas que devuelve obtener_lead: las mismas del dataset leads del catalogo. */
const COLUMNAS_LEAD = Object.keys(CATALOGO.leads.columnas).join(',');

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
      'Obtener los datos de un lead por su ID (UUID). Devuelve los campos del dataset leads del catalogo (sin CBU, antecedentes, contactos de emergencia, BCRA ni documentos).',
      {
        id: z.string().uuid().describe('ID del lead (UUID)'),
      },
      async ({ id }) => {
        try {
          // Nunca select=*: solo las columnas permitidas del catalogo (ver COLUMNAS_EXCLUIDAS).
          const res = await supabaseRequest(`leads?id=eq.${id}&select=${COLUMNAS_LEAD}`);
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

          const res = await supabaseRequest(`leads?select=${COLUMNAS_LEAD}`, {
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
          const updateRes = await supabaseRequest(`leads?id=eq.${id}&select=${COLUMNAS_LEAD}`, {
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

  // =====================================================
  // Datos (solo lectura) — permiso datos:read (operación) y/o administracion:read
  // (facturación, usuarios, roles). Catálogo en lib/catalogoDatos.js; consultas en
  // lib/datos.js, que solo deja ver los datasets de los permisos de la key.
  // =====================================================
  if (tieneAccesoADatos(apiKeyData.permissions)) {
    const permisos = apiKeyData.permissions;
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
      `Lista los conjuntos de datos de Toshify que se pueden consultar, con su módulo y descripción. Empezá por acá. Módulos: ${modulos(permisos).join(', ')}. Solo lectura.`,
      { modulo: z.string().optional().describe('Filtrar por módulo') },
      async (params) => {
        try {
          return responder('listar_datos', params, { datasets: listarDatasets(params.modulo, permisos) });
        } catch (error) {
          return fallar('listar_datos', params, error);
        }
      }
    );

    server.tool(
      'describir_datos',
      `Muestra los campos y su tipo (texto, numero, fecha, booleano, id, json) de uno o varios conjuntos de datos en una sola llamada (hasta ${MAX_DESCRIBIR}). Pedí juntos todos los que vayas a usar en la pregunta en vez de llamar una vez por cada uno.`,
      {
        datasets: z.array(z.string()).optional().describe('Nombres de los conjuntos de datos (ver listar_datos)'),
        dataset: z.string().optional().describe('Un solo conjunto de datos (alternativa a datasets)'),
      },
      async (params) => {
        try {
          const nombres = [...(params.datasets || []), ...(params.dataset ? [params.dataset] : [])];
          return responder('describir_datos', params, describirDatasets(nombres, permisos));
        } catch (error) {
          return fallar('describir_datos', params, error);
        }
      }
    );

    server.tool(
      'consultar_datos',
      `Devuelve registros de un conjunto de datos, con filtros, orden y paginación (máximo ${LIMITE_MAX} por página). Incluye el total de registros que cumplen los filtros. Los campos que terminan en _id se cruzan con el id de otro conjunto (por ejemplo conductor_id con conductores, vehiculo_id con vehiculos). Si la fila tiene sede_id, también trae sede_nombre. Las patentes de prueba (PRUEBA…, PRUB…, PRB…) se excluyen solas. Solo lectura.`,
      {
        dataset: z.string().describe('Nombre del conjunto de datos'),
        campos: z.array(z.string()).optional().describe('Campos a devolver (por defecto todos)'),
        filtros: esquemaFiltros,
        orden: z.string().optional().describe('Campo por el que ordenar'),
        descendente: z.boolean().optional().describe('Orden descendente (default false)'),
        limite: z.number().optional().describe(`Registros por página (default ${LIMITE_DEFAULT}, máximo ${LIMITE_MAX})`),
        pagina: z.number().optional().describe('Página (default 1)'),
        incluir_pruebas: z.boolean().optional().describe('Incluir las patentes de prueba (default false)'),
      },
      async (params) => {
        try {
          return responder('consultar_datos', params, await consultar(params, permisos));
        } catch (error) {
          return fallar('consultar_datos', params, error);
        }
      }
    );

    server.tool(
      'contar_datos',
      `Cuenta registros de un conjunto de datos que cumplen los filtros. Con agrupar_por devuelve la cantidad por cada valor de ese campo; si el campo es una fecha se puede agrupar por día, mes o año (periodo). Con sumar (un campo numérico, por ejemplo un importe) devuelve además la suma y el promedio, en total o por grupo: no hace falta traer las filas para sumarlas. Para agrupar o sumar se recorren hasta ${MAX_FILAS_AGRUPAR} registros. Excluye las patentes de prueba. Ideal para indicadores. Solo lectura.`,
      {
        dataset: z.string().describe('Nombre del conjunto de datos'),
        filtros: esquemaFiltros,
        agrupar_por: z.string().optional().describe('Campo por el que agrupar'),
        periodo: z.enum(PERIODOS).optional().describe('Si agrupar_por es una fecha: dia, mes o anio'),
        sumar: z.string().optional().describe('Campo numérico a sumar y promediar'),
        incluir_pruebas: z.boolean().optional().describe('Incluir las patentes de prueba (default false)'),
      },
      async (params) => {
        try {
          return responder('contar_datos', params, await contar(params, permisos));
        } catch (error) {
          return fallar('contar_datos', params, error);
        }
      }
    );

    // Reportes: funciones RPC de una lista fija (lib/datos.js REPORTES), por GET.
    const reportes = reportesVisibles(permisos);
    if (reportes.length) {
      server.tool(
        'consultar_reporte',
        `Devuelve un dashboard ya calculado, igual que en la app. Reportes: ${reportes.map((r) => `${r.reporte} (${r.descripcion})`).join(' | ')}. Fechas AAAA-MM-DD; sin sede_id es el total de todas las sedes. Solo lectura.`,
        {
          reporte: z.enum(reportes.map((r) => r.reporte)).describe('Reporte a consultar'),
          desde: z.string().optional().describe('Inicio del período (AAAA-MM-DD)'),
          hasta: z.string().optional().describe('Fin del período (AAAA-MM-DD)'),
          hoy: z.string().optional().describe('Fecha de referencia "hoy" (AAAA-MM-DD, default hoy)'),
          sede_id: z.string().optional().describe('Id de la sede (ver el dataset sedes); vacío = todas'),
        },
        async (params) => {
          try {
            return responder('consultar_reporte', params, await consultarReporte(params, permisos));
          } catch (error) {
            return fallar('consultar_reporte', params, error);
          }
        }
      );
    }
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

// Login por persona (OAuth): /.well-known/*, /oauth/register, /oauth/authorize, /oauth/token
app.use(oauthRouter);

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
  if (requiereUsuario(apiKeyData.permisosKey)) {
    return res.status(403).json({ error: 'Esta API key es para el conector de Claude: usar /mcp e iniciar sesión' });
  }

  console.log(`[MCP] Nueva conexion SSE de: ${apiKeyData.name}`);

  const transport = new SSEServerTransport('/messages', res);
  const sessionId = transport.sessionId;
  transports[sessionId] = { transport, apiKey, apiKeyData };

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

  const sesion = transports[sessionId];
  if (!sessionId || !sesion) {
    return res.status(400).json({ error: 'Session invalida. Conectate primero a /sse' });
  }

  // La key se vuelve a validar en cada mensaje, igual que en /mcp: si la
  // desactivaron, la borraron o le cambiaron los permisos desde la app, la sesion
  // se corta y el cliente se reconecta con las herramientas que le corresponden.
  const actual = await validateApiKey(sesion.apiKey);
  const mismosPermisos = actual &&
    [...(actual.permissions || [])].sort().join(',') === [...(sesion.apiKeyData.permissions || [])].sort().join(',');
  if (!mismosPermisos) {
    console.log(`[MCP] Sesion SSE cortada (${actual ? 'cambiaron los permisos' : 'key inactiva'}): ${sesion.apiKeyData.name}`);
    delete transports[sessionId];
    sesion.transport.close().catch(() => {});
    return res.status(401).json({
      error: actual
        ? 'Cambiaron los permisos de la API key. Volvé a conectarte a /sse.'
        : 'API key invalida o inactiva',
    });
  }

  await sesion.transport.handlePostMessage(req, res);
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

/** Token OAuth (Authorization: Bearer) y API key (x-api-key o ?apiKey=) por separado. */
function credencialesDeRequest(req) {
  const bearer = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1];
  const token = esTokenOAuth(bearer) ? bearer : null;
  const apiKey = req.headers['x-api-key'] || (token ? null : bearer) || req.query.apiKey || null;
  return { token, apiKey: apiKey ? String(apiKey) : null };
}

function errorJsonRpc(res, status, message) {
  res.status(status).json({ jsonrpc: '2.0', error: { code: -32000, message }, id: null });
}

// express.json() solo en esta ruta: a nivel global rompe /messages (ver arriba).
app.post('/mcp', mcpLimiter, express.json({ limit: '1mb' }), async (req, res) => {
  const { token, apiKey } = credencialesDeRequest(req);

  // Sin nada: 401 con el header que le indica a Claude dónde iniciar sesión
  if (!token && !apiKey) {
    res.set('WWW-Authenticate', headerLogin(req));
    return errorJsonRpc(res, 401, 'Falta iniciar sesión');
  }

  // El conector de Claude siempre lleva la API key en la URL (la configura el
  // administrador de Claude Teams). Sin key no se entra, aunque la persona inicie sesión.
  if (!apiKey) {
    return errorJsonRpc(res, 403, 'Falta la API key en la URL del conector. Pedile al administrador la URL del conector de Toshify.');
  }
  const keyData = await validateApiKey(apiKey);
  if (!keyData) return errorJsonRpc(res, 401, 'API key invalida o inactiva');

  let apiKeyData;
  if (token) {
    // Persona: ve los módulos de la key que su usuario de Toshibase también tiene
    apiKeyData = await validarTokenOAuth(token, keyData);
    if (!apiKeyData) {
      // Vencido, revocado o la persona ya no tiene acceso: Claude renueva o pide login
      res.set('WWW-Authenticate', headerLogin(req, 'invalid_token'));
      return errorJsonRpc(res, 401, 'Sesión vencida o sin acceso. Volvé a conectar el conector.');
    }
  } else if (requiereUsuario(keyData.permisosKey)) {
    // Key del conector de Claude sin sesión: se pide el login de Toshibase
    res.set('WWW-Authenticate', headerLogin(req));
    return errorJsonRpc(res, 401, 'Iniciá sesión con tu usuario de Toshibase');
  } else {
    apiKeyData = keyData; // integración: la key sola
  }

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

// Tablas de pantallas nuevas que no están en el catálogo (lib/tablasAuto.js)
const tablasAuto = await cargarTablasAuto();

app.listen(PORT, () => {
  console.log(`Toshify MCP Server running on port ${PORT}`);
  console.log(`  Datasets automáticos: ${tablasAuto.join(', ') || 'ninguno'}`);
  console.log(`  MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`  SSE endpoint: http://localhost:${PORT}/sse`);
  console.log(`  Health check: http://localhost:${PORT}/health`);
});
