/**
 * Swagger / OpenAPI 3.0 spec para la API externa de Toshify
 * Autenticacion via Supabase Auth - Solo usuarios con rol "Api"
 */

const swaggerSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Toshify API Externa',
    version: '1.0.0',
    description: `API para acceder y gestionar los datos de Leads y Hireflix Historico.

## Autenticacion
1. Hacer POST a \`/auth/login\` con email y password del usuario con rol **Api**
2. Copiar el \`token\` de la respuesta
3. Click en el boton **Authorize** y pegar el token
4. Todos los endpoints de datos requieren el token

## Roles permitidos
- **Api** - Lectura de leads y hireflix_historico + actualizacion de leads
- **admin** - Acceso completo

## Rate Limits
- Login: max 10 intentos cada 15 minutos
- Datos: max 200 requests cada 15 minutos`,
    contact: {
      name: 'Toshify',
    },
  },
  servers: [
    {
      url: '/api/v1',
      description: 'API v1',
    },
  ],
  tags: [
    { name: 'Auth', description: 'Autenticacion - Login con email/password y refresh de token' },
    { name: 'Leads', description: 'Lectura y actualizacion de leads' },
    { name: 'Hireflix Historico', description: 'Lectura de la tabla de hireflix historico (solo lectura)' },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Token JWT de Supabase obtenido en /auth/login',
      },
    },
    schemas: {
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'api-user@toshify.com.ar' },
          password: { type: 'string', example: 'MiPassword123' },
        },
      },
      LoginResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          token: { type: 'string', description: 'JWT de acceso - usar en header Authorization', example: 'eyJhbGciOiJIUzI1NiIs...' },
          refreshToken: { type: 'string', description: 'Token para renovar la sesion sin re-login', example: 'v1.MjAyNS0wNy0x...' },
          expiresIn: { type: 'integer', description: 'Segundos hasta que expire el token', example: 3600 },
          expiresAt: { type: 'integer', description: 'Timestamp UNIX de expiracion', example: 1720000000 },
          user: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              email: { type: 'string', format: 'email', example: 'api-user@toshify.com.ar' },
              fullName: { type: 'string', example: 'API User' },
              role: { type: 'string', example: 'Api' },
            },
          },
        },
      },
      RefreshRequest: {
        type: 'object',
        required: ['refreshToken'],
        properties: {
          refreshToken: { type: 'string', description: 'Refresh token obtenido en el login', example: 'v1.MjAyNS0wNy0x...' },
        },
      },
      RefreshResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIs...' },
          refreshToken: { type: 'string', example: 'v1.MjAyNS0wNy0x...' },
          expiresIn: { type: 'integer', example: 3600 },
          expiresAt: { type: 'integer', example: 1720000000 },
        },
      },
      Pagination: {
        type: 'object',
        properties: {
          page: { type: 'integer', example: 1 },
          limit: { type: 'integer', example: 50 },
          total: { type: 'integer', example: 1250 },
          totalPages: { type: 'integer', example: 25 },
          hasNext: { type: 'boolean', example: true },
          hasPrev: { type: 'boolean', example: false },
        },
      },
      Lead: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          'Nombre Completo': { type: 'string', example: 'Juan Perez' },
          'Apellido': { type: 'string', example: 'Perez' },
          'Email': { type: 'string', format: 'email', example: 'juan@email.com' },
          'Phone': { type: 'string', example: '+5491112345678' },
          'User ID': { type: 'string', format: 'uuid', nullable: true },
          'Fecha creación': { type: 'string', format: 'date-time' },
          'Last seen': { type: 'string', format: 'date-time', nullable: true },
          'Last contacted': { type: 'string', format: 'date-time', nullable: true },
          'Last heard from': { type: 'string', format: 'date-time', nullable: true },
          'Country': { type: 'string', example: 'Argentina' },
          'Region': { type: 'string', example: 'Buenos Aires' },
          'City': { type: 'string', example: 'CABA' },
          'Timezone': { type: 'string', example: 'America/Argentina/Buenos_Aires' },
          'Sede': { type: 'string', example: 'Buenos Aires' },
          'UTM Campaign': { type: 'string', nullable: true },
          'UTM Content': { type: 'string', nullable: true },
          'UTM Medium': { type: 'string', nullable: true },
          'UTM Source': { type: 'string', nullable: true },
          'UTM Term': { type: 'string', nullable: true },
          'WhatsApp number': { type: 'string', nullable: true },
          'Estado de Lead': { type: 'string', example: 'Nuevo' },
          'Agente asignado': { type: 'string', nullable: true },
          'Entrevistador asignado': { type: 'string', nullable: true },
          'Patente': { type: 'string', nullable: true },
          'Turno': { type: 'string', nullable: true },
          'Compañero': { type: 'string', nullable: true },
          'Direccion': { type: 'string', nullable: true },
          'Tiempo de antiguedad': { type: 'string', nullable: true },
          'Tipo': { type: 'string', nullable: true },
          'DNI': { type: 'string', example: '12345678' },
          'Primer nombre': { type: 'string', example: 'Juan' },
          'Ultima Actividad': { type: 'string', format: 'date-time', nullable: true },
          'Especialista Onboarding': { type: 'string', nullable: true },
          'Edad': { type: 'integer', nullable: true, example: 28 },
          'Zona': { type: 'string', nullable: true },
          'Fuente de lead': { type: 'string', nullable: true },
          'Licencia': { type: 'string', nullable: true },
          'Monotributo': { type: 'string', nullable: true },
          'Experiencia previa': { type: 'string', nullable: true },
          'Acepta oferta': { type: 'boolean', nullable: true },
          'Antecedentes penales': { type: 'string', nullable: true },
          'Administrativo Asignado': { type: 'string', nullable: true },
          'Dataentry Asignado': { type: 'string', nullable: true },
          'Agente logistico asignado': { type: 'string', nullable: true },
          'Fecha carga': { type: 'string', format: 'date-time', nullable: true },
          'Fase de Preguntas': { type: 'string', nullable: true },
          'Asistente Virtual': { type: 'string', nullable: true },
          'Documentos pendientes': { type: 'string', nullable: true },
          'Cerrado timeout wpp': { type: 'boolean', nullable: true },
          'Guia asignado': { type: 'string', nullable: true },
          'Causal de cierre': { type: 'string', nullable: true },
          'Contacto de emergencia': { type: 'string', nullable: true },
          'Link facturacion': { type: 'string', nullable: true },
          'Ayuda Entrevista': { type: 'string', nullable: true },
          'Código Referido': { type: 'string', nullable: true },
          'Año de auto': { type: 'string', nullable: true },
          'Km de auto': { type: 'string', nullable: true },
          'Marca y modelo de vehículo': { type: 'string', nullable: true },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
        },
      },
      LeadUpdate: {
        type: 'object',
        description: 'Campos actualizables de un lead. Enviar solo los campos que se quieren modificar.',
        properties: {
          'Estado de Lead': { type: 'string', example: 'Contactado' },
          'Agente asignado': { type: 'string', nullable: true },
          'Entrevistador asignado': { type: 'string', nullable: true },
          'Especialista Onboarding': { type: 'string', nullable: true },
          'Administrativo Asignado': { type: 'string', nullable: true },
          'Dataentry Asignado': { type: 'string', nullable: true },
          'Agente logistico asignado': { type: 'string', nullable: true },
          'Guia asignado': { type: 'string', nullable: true },
          'Asistente Virtual': { type: 'string', nullable: true },
          'Nombre Completo': { type: 'string', example: 'Juan Perez' },
          'Apellido': { type: 'string', example: 'Perez' },
          'Primer nombre': { type: 'string', example: 'Juan' },
          'Email': { type: 'string', format: 'email' },
          'Phone': { type: 'string', example: '+5491112345678' },
          'WhatsApp number': { type: 'string', nullable: true },
          'DNI': { type: 'string', example: '12345678' },
          'Edad': { type: 'integer', nullable: true, example: 28 },
          'Direccion': { type: 'string', nullable: true },
          'City': { type: 'string', nullable: true },
          'Region': { type: 'string', nullable: true },
          'Country': { type: 'string', nullable: true },
          'Zona': { type: 'string', nullable: true },
          'Sede': { type: 'string', example: 'Buenos Aires' },
          'Turno': { type: 'string', nullable: true },
          'Patente': { type: 'string', nullable: true },
          'Compañero': { type: 'string', nullable: true },
          'Tipo': { type: 'string', nullable: true },
          'Licencia': { type: 'string', nullable: true },
          'Monotributo': { type: 'string', nullable: true },
          'Experiencia previa': { type: 'string', nullable: true },
          'Acepta oferta': { type: 'boolean', nullable: true },
          'Antecedentes penales': { type: 'string', nullable: true },
          'Tiempo de antiguedad': { type: 'string', nullable: true },
          'Fase de Preguntas': { type: 'string', nullable: true },
          'Documentos pendientes': { type: 'string', nullable: true },
          'Causal de cierre': { type: 'string', nullable: true },
          'Contacto de emergencia': { type: 'string', nullable: true },
          'Link facturacion': { type: 'string', nullable: true },
          'Ayuda Entrevista': { type: 'string', nullable: true },
          'Código Referido': { type: 'string', nullable: true },
          'Año de auto': { type: 'string', nullable: true },
          'Km de auto': { type: 'string', nullable: true },
          'Marca y modelo de vehículo': { type: 'string', nullable: true },
          'Fuente de lead': { type: 'string', nullable: true },
          'Cerrado timeout wpp': { type: 'boolean', nullable: true },
        },
      },
      HireflixHistorico: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          nombre: { type: 'string', example: 'Maria Lopez' },
          email: { type: 'string', format: 'email', example: 'maria@email.com' },
          fecha: { type: 'string', format: 'date-time' },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
        },
      },
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          message: { type: 'string' },
        },
      },
    },
  },
  paths: {
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Iniciar sesion',
        description: 'Autenticarse con email y password. Solo usuarios con rol **Api** o **admin** pueden acceder. Devuelve un token JWT y un refresh token.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LoginRequest' },
            },
          },
        },
        responses: {
          200: {
            description: 'Login exitoso',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/LoginResponse' },
              },
            },
          },
          400: {
            description: 'Datos incompletos (falta email o password)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          401: {
            description: 'Email o contraseña incorrectos',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          403: {
            description: 'El usuario no tiene rol "Api" - acceso denegado',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          429: {
            description: 'Demasiados intentos de login (max 10 cada 15 min)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Renovar token',
        description: 'Renueva el token de acceso usando el refresh token, sin necesidad de enviar email/password de nuevo.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RefreshRequest' },
            },
          },
        },
        responses: {
          200: {
            description: 'Token renovado exitosamente',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RefreshResponse' },
              },
            },
          },
          400: {
            description: 'Falta refreshToken',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          401: {
            description: 'Refresh token invalido o expirado',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/leads': {
      get: {
        tags: ['Leads'],
        summary: 'Listar leads',
        description: 'Obtiene la lista de leads con paginacion y filtros opcionales. Requiere rol **Api** o **admin**.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 }, description: 'Numero de pagina' },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 500 }, description: 'Cantidad por pagina (max 500)' },
          { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Buscar en Nombre Completo, Email o DNI' },
          { name: 'estado', in: 'query', schema: { type: 'string' }, description: 'Filtrar por Estado de Lead' },
          { name: 'agente', in: 'query', schema: { type: 'string' }, description: 'Filtrar por Agente asignado' },
          { name: 'sede', in: 'query', schema: { type: 'string' }, description: 'Filtrar por Sede' },
          { name: 'desde', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'Fecha creacion desde (ISO 8601)' },
          { name: 'hasta', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'Fecha creacion hasta (ISO 8601)' },
          { name: 'order', in: 'query', schema: { type: 'string', default: 'Fecha creación' }, description: 'Campo para ordenar' },
          { name: 'dir', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' }, description: 'Direccion del orden' },
        ],
        responses: {
          200: {
            description: 'Lista de leads',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: { type: 'array', items: { $ref: '#/components/schemas/Lead' } },
                    pagination: { $ref: '#/components/schemas/Pagination' },
                  },
                },
              },
            },
          },
          401: {
            description: 'No autorizado / Token invalido o expirado',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          403: {
            description: 'Rol no permitido',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          429: {
            description: 'Demasiadas solicitudes (max 200 cada 15 min)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/leads/{id}': {
      get: {
        tags: ['Leads'],
        summary: 'Obtener un lead por ID',
        description: 'Obtiene los datos completos de un lead especifico.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: 'ID del lead (UUID)' },
        ],
        responses: {
          200: {
            description: 'Datos del lead',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: { $ref: '#/components/schemas/Lead' },
                  },
                },
              },
            },
          },
          401: { description: 'No autorizado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          403: { description: 'Rol no permitido', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          404: { description: 'Lead no encontrado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      patch: {
        tags: ['Leads'],
        summary: 'Actualizar un lead',
        description: `Actualiza campos de un lead existente. Solo se pueden modificar campos permitidos.
Enviar un JSON con los campos a actualizar. Los campos no permitidos seran rechazados pero no impiden la actualizacion de los demas.

**Campos actualizables:** Estado de Lead, Agente asignado, Entrevistador asignado, Especialista Onboarding, Administrativo Asignado, Dataentry Asignado, Agente logistico asignado, Guia asignado, Asistente Virtual, Nombre Completo, Apellido, Primer nombre, Email, Phone, WhatsApp number, DNI, Edad, Direccion, City, Region, Country, Zona, Sede, Turno, Patente, Compañero, Tipo, Licencia, Monotributo, Experiencia previa, Acepta oferta, Antecedentes penales, Tiempo de antiguedad, Fase de Preguntas, Documentos pendientes, Causal de cierre, Contacto de emergencia, Link facturacion, Ayuda Entrevista, Código Referido, Año de auto, Km de auto, Marca y modelo de vehículo, Fuente de lead, Cerrado timeout wpp.`,
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: 'ID del lead (UUID)' },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LeadUpdate' },
              examples: {
                cambiarEstado: {
                  summary: 'Cambiar estado del lead',
                  value: { 'Estado de Lead': 'Contactado' },
                },
                completarDatos: {
                  summary: 'Completar datos del lead',
                  value: {
                    'Nombre Completo': 'Juan Perez',
                    'DNI': '12345678',
                    'Phone': '+5491112345678',
                    'Sede': 'Buenos Aires',
                    'Estado de Lead': 'En proceso',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Lead actualizado exitosamente',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { $ref: '#/components/schemas/Lead' },
                    updatedFields: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Campos que fueron actualizados',
                      example: ['Estado de Lead', 'Sede'],
                    },
                    rejectedFields: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Campos enviados que no son actualizables (solo aparece si hubo rechazados)',
                    },
                  },
                },
              },
            },
          },
          400: {
            description: 'Body vacio o ningun campo valido',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          401: { description: 'No autorizado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          403: { description: 'Rol no permitido', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          404: { description: 'Lead no encontrado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/hireflix-historico': {
      get: {
        tags: ['Hireflix Historico'],
        summary: 'Listar registros de Hireflix',
        description: 'Obtiene la lista de registros historicos de Hireflix con paginacion y filtros opcionales.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 }, description: 'Numero de pagina' },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 500 }, description: 'Cantidad por pagina (max 500)' },
          { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Buscar en nombre o email' },
          { name: 'desde', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'Fecha desde (ISO 8601)' },
          { name: 'hasta', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'Fecha hasta (ISO 8601)' },
          { name: 'order', in: 'query', schema: { type: 'string', default: 'fecha' }, description: 'Campo para ordenar' },
          { name: 'dir', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' }, description: 'Direccion del orden' },
        ],
        responses: {
          200: {
            description: 'Lista de registros',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: { type: 'array', items: { $ref: '#/components/schemas/HireflixHistorico' } },
                    pagination: { $ref: '#/components/schemas/Pagination' },
                  },
                },
              },
            },
          },
          401: { description: 'No autorizado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          403: { description: 'Rol no permitido', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          429: { description: 'Demasiadas solicitudes', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/hireflix-historico/{id}': {
      get: {
        tags: ['Hireflix Historico'],
        summary: 'Obtener un registro por ID',
        description: 'Obtiene los datos completos de un registro historico de Hireflix.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: 'ID del registro (UUID)' },
        ],
        responses: {
          200: {
            description: 'Datos del registro',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: { $ref: '#/components/schemas/HireflixHistorico' },
                  },
                },
              },
            },
          },
          401: { description: 'No autorizado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          403: { description: 'Rol no permitido', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          404: { description: 'Registro no encontrado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
  },
};

export default swaggerSpec;
