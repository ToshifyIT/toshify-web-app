/**
 * API REST publica: alta de Leads.
 *
 *   POST /api/v1/leads  -> crea un lead
 *
 * Autenticacion: header x-api-key con permiso `leads:create:api`.
 *
 * ES EL UNICO ENDPOINT DE ESCRITURA de la API publica y vive en un archivo
 * aparte a proposito: `routes/leads.js` sigue siendo solo lectura, asi que para
 * auditar que puede escribir un tercero alcanza con leer este archivo.
 *
 * Corre con la service_role key (bypasea RLS). Todo el control vive aca:
 *   - CAMPOS_ACEPTADOS es fijo. Cualquier otro campo del body devuelve 400 en
 *     vez de ignorarse: si el tercero cree que mando un dato y nunca se guardo,
 *     tiene que enterarse en el momento.
 *   - Los campos de proceso (estado_de_lead, proceso, los *_asignado) NO se
 *     aceptan: los fija la API. Si el consumidor pudiera elegir el estado,
 *     podria crear un lead directamente en 'Conductor' y saltearse todo el
 *     onboarding.
 *   - Los datos sensibles (cbu, bcra, antecedentes_*, observaciones) no estan
 *     en la lista: no se reciben ni se escriben.
 *
 * CONTEXTO DEL ESQUEMA (verificado contra la base el 2026-09-26):
 * la tabla `leads` no tiene NINGUN NOT NULL fuera de `id`, ni un solo indice
 * UNIQUE. La unica FK es sede_id -> sedes(id). O sea: la base acepta un lead
 * vacio y acepta DNIs repetidos. Toda la obligatoriedad y la deduplicacion son
 * responsabilidad de este archivo.
 */

import express from 'express';
import { supabaseRequest } from '../lib/supabase.js';
import { requireApiKey } from '../lib/auth.js';
import { registrarRequest } from '../lib/audit.js';

const router = express.Router();

// Estado inicial del pipeline (indice 0 de ESTADO_ORDEN en LeadsModule).
const ESTADO_INICIAL = 'Inicio conversación';

/**
 * Campos de texto aceptados, con su tope de largo.
 *
 * Es lista blanca de ENTRADA, distinta de la lista blanca de SALIDA que usa
 * routes/leads.js: lo que un tercero puede escribir no es lo mismo que lo que
 * puede leer.
 */
const CAMPOS_TEXTO = {
  nombre_completo: 150,
  sede: 100,
  phone: 50,
  whatsapp_number: 50,
  email: 150,
  cuit: 20,
  nacionalidad: 60,
  estado_civil: 40,
  direccion: 255,
  zona: 80,
  city: 80,
  region: 80,
  country: 80,
  turno: 40,
  disponibilidad: 80,
  experiencia_previa: 255,
  codigo_referido: 60,
  utm_source: 120,
  utm_medium: 120,
  utm_campaign: 120,
  utm_content: 120,
  utm_term: 120,
};

// dni, edad y fecha_de_nacimiento tienen validacion propia. `sede` entra por
// CAMPOS_TEXTO (limpieza y tope de largo) y ademas se resuelve contra el
// catalogo mas abajo: si no esta en CAMPOS_TEXTO, valores.sede nunca se llena
// y el lead se rechaza siempre por "sede es obligatoria".
// Campos de Si/No. Se aceptan las variantes habituales y se guardan siempre
// como 'Si' o 'No' (ver siNo).
const CAMPOS_SI_NO = ['licencia', 'monotributo'];

const CAMPOS_ACEPTADOS = new Set([
  ...Object.keys(CAMPOS_TEXTO),
  ...CAMPOS_SI_NO,
  'dni',
  'edad',
  'fecha_de_nacimiento',
]);

// Campos que se devuelven en el 201. Subconjunto de la whitelist de lectura.
const CAMPOS_RESPUESTA = 'id,nombre_completo,dni,email,phone,whatsapp_number,sede,estado_de_lead,fecha_creacion';

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** minusculas, sin acentos, espacios colapsados. Para comparar nombres de sede. */
function normalizar(v) {
  return String(v || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Normaliza un campo de Si/No al unico par de valores que entiende la app.
 *
 * `licencia` y `monotributo` se guardan en la base como texto 'Si' / 'No', y
 * la app compara contra eso (calcularEstadoLead mira licencia === 'Si';
 * parseMonotributo compara el texto normalizado contra 'si'). Un tercero que
 * mande true, "SI" o "yes" dejaria un valor que ningun lado sabe leer, asi que
 * se traduce aca. Misma regla que normalizarLicencia en mcp/server.js.
 */
function siNo(valor) {
  if (typeof valor === 'boolean') return valor ? 'Si' : 'No';
  const v = String(valor).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (['no', 'false', '0', 'n'].includes(v)) return 'No';
  if (['si', 'yes', 'true', '1', 's'].includes(v)) return 'Si';
  return null; // valor no reconocido: lo rechaza el validador
}

/**
 * Valida el body y devuelve los valores ya normalizados.
 *
 * No toca la base: las validaciones que necesitan consulta (sede, duplicado)
 * se resuelven despues, para no pegarle a Supabase si el body ya viene mal.
 */
function validar(body) {
  const errores = [];
  const valores = {};

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      errores: ['El body debe ser un objeto JSON, y el header Content-Type debe ser application/json'],
      valores,
      dniCrudo: '',
    };
  }

  const desconocidos = Object.keys(body).filter((k) => !CAMPOS_ACEPTADOS.has(k));
  if (desconocidos.length) {
    errores.push(`Campos no aceptados: ${desconocidos.join(', ')}`);
  }

  // ---- Campos de texto ----
  for (const [campo, largoMax] of Object.entries(CAMPOS_TEXTO)) {
    const bruto = body[campo];
    if (bruto === undefined || bruto === null) continue;
    if (typeof bruto !== 'string') {
      errores.push(`${campo} debe ser texto`);
      continue;
    }
    const limpio = bruto.trim();
    if (!limpio) continue; // string vacio = campo no informado
    if (limpio.length > largoMax) {
      errores.push(`${campo} supera los ${largoMax} caracteres`);
      continue;
    }
    valores[campo] = limpio;
  }

  // ---- nombre_completo (obligatorio) ----
  if (!valores.nombre_completo) {
    errores.push('nombre_completo es obligatorio');
  } else if (valores.nombre_completo.length < 3) {
    errores.push('nombre_completo debe tener al menos 3 caracteres');
  }

  // ---- email (opcional, pero si viene tiene que ser valido) ----
  if (valores.email && !RE_EMAIL.test(valores.email)) {
    errores.push('email no tiene un formato valido');
  }

  // ---- Contacto: al menos uno ----
  if (!valores.phone && !valores.whatsapp_number) {
    errores.push('hay que enviar phone o whatsapp_number (al menos uno)');
  }

  // ---- dni (obligatorio) ----
  // Se guarda normalizado a solo digitos. En la base conviven 372 DNIs de solo
  // digitos y 1 con formato, asi que normalizar no rompe nada y deja de generar
  // variantes nuevas.
  const dniCrudo = body.dni === undefined || body.dni === null ? '' : String(body.dni).trim();
  const dniDigitos = dniCrudo.replace(/\D/g, '');
  if (!dniDigitos) {
    errores.push('dni es obligatorio');
  } else if (dniDigitos.length < 7 || dniDigitos.length > 11) {
    errores.push('dni debe tener entre 7 y 11 digitos');
  } else {
    valores.dni = dniDigitos;
  }

  // ---- sede (obligatoria) ----
  // Aca solo se valida que venga; el nombre se resuelve contra el catalogo.
  if (!valores.sede) {
    errores.push('sede es obligatoria');
  }

  // ---- Campos de Si/No (opcionales) ----
  for (const campo of CAMPOS_SI_NO) {
    const bruto = body[campo];
    if (bruto === undefined || bruto === null || bruto === '') continue;
    const v = siNo(bruto);
    if (v === null) {
      errores.push(`${campo} debe ser "Si" o "No"`);
    } else {
      valores[campo] = v;
    }
  }

  // ---- edad (opcional) ----
  if (body.edad !== undefined && body.edad !== null && body.edad !== '') {
    const n = Number(body.edad);
    if (!Number.isInteger(n) || n < 1 || n > 120) {
      errores.push('edad debe ser un numero entero entre 1 y 120');
    } else {
      valores.edad = n;
    }
  }

  // ---- fecha_de_nacimiento (opcional) ----
  if (body.fecha_de_nacimiento !== undefined && body.fecha_de_nacimiento !== null && body.fecha_de_nacimiento !== '') {
    const f = String(body.fecha_de_nacimiento).trim();
    const d = new Date(`${f}T00:00:00Z`);
    if (!RE_FECHA.test(f) || Number.isNaN(d.getTime())) {
      errores.push('fecha_de_nacimiento debe ser una fecha YYYY-MM-DD');
    } else {
      valores.fecha_de_nacimiento = f;
    }
  }

  return { errores, valores, dniCrudo };
}

/**
 * Resuelve el nombre de sede contra el catalogo.
 *
 * Se traen todas las sedes activas y se compara en memoria en vez de filtrar en
 * PostgREST: son un puñado de filas, evita tener que escapar el input dentro de
 * un `ilike`, y permite devolverle al consumidor la lista de valores validos
 * cuando se equivoca.
 */
async function resolverSede(nombre) {
  const resp = await supabaseRequest('sedes?select=id,nombre,codigo&activa=eq.true&order=nombre');
  const sedes = await resp.json();
  const buscado = normalizar(nombre);
  const match = sedes.find(
    (s) => normalizar(s.nombre) === buscado || normalizar(s.codigo) === buscado
  );
  return { sede: match || null, validas: sedes.map((s) => s.nombre) };
}

/**
 * Busca un lead existente con el mismo DNI.
 *
 * Global, no por sede: un DNI es una persona, y si ya esta cargado en otra sede
 * sigue siendo el mismo candidato.
 *
 * Se consulta la forma normalizada y, si difiere, la que mando el consumidor,
 * para alcanzar tambien los DNIs historicos guardados con puntos.
 *
 * OJO: esto es un chequeo previo, no un constraint. Entre la consulta y el
 * INSERT hay una ventana en la que dos requests simultaneas con el mismo DNI
 * pasan las dos. No se cierra con un indice UNIQUE porque la carga masiva de
 * Excel ofrece "Subir y duplicar" a proposito, y un indice unico romperia esa
 * funcionalidad.
 */
async function buscarDuplicado(dniDigitos, dniCrudo) {
  const variantes = new Set([dniDigitos]);
  const crudoSeguro = dniCrudo.replace(/[^0-9.\-\s]/g, '').trim();
  if (crudoSeguro && crudoSeguro !== dniDigitos) variantes.add(crudoSeguro);

  const lista = [...variantes].map((v) => encodeURIComponent(`"${v}"`)).join(',');
  const resp = await supabaseRequest(
    `leads?dni=in.(${lista})&select=id,estado_de_lead,fecha_creacion&order=fecha_creacion.asc&limit=1`
  );
  const data = await resp.json();
  return data.length ? data[0] : null;
}

// ---------------------------------------------------------
// POST /api/v1/leads
// ---------------------------------------------------------
// express.json() va montado SOLO en esta ruta: a nivel global rompe el
// SSEServerTransport del MCP, que necesita leer el body stream el mismo.
router.post(
  '/leads',
  express.json({ limit: '32kb' }),
  requireApiKey('leads:create:api'),
  async (req, res) => {
    const auditar = (status, filas) => registrarRequest({
      apiKeyData: req.apiKeyData, req, status, filas,
    });

    const { errores, valores, dniCrudo } = validar(req.body);

    if (errores.length) {
      auditar(400, 0);
      return res.status(400).json({
        error: 'validation_error',
        message: 'El lead no se creo: hay campos invalidos o faltantes',
        campos: errores,
      });
    }

    try {
      // 1) Sede: sin sede_id el lead queda invisible en el modulo de Leads,
      //    que filtra por esa FK. Por eso se resuelve antes de insertar y no
      //    se acepta un lead sin ella.
      const { sede, validas } = await resolverSede(valores.sede);
      if (!sede) {
        auditar(400, 0);
        return res.status(400).json({
          error: 'validation_error',
          message: `La sede "${valores.sede}" no existe en el catalogo`,
          campos: ['sede no coincide con ninguna sede activa'],
          sedes_validas: validas,
        });
      }

      // 2) Duplicado por DNI.
      const existente = await buscarDuplicado(valores.dni, dniCrudo);
      if (existente) {
        auditar(409, 0);
        return res.status(409).json({
          error: 'duplicate',
          message: 'Ya existe un lead con ese DNI. No se creo ningun registro.',
          lead: existente,
        });
      }

      // 3) Alta. Los campos de proceso los fija la API, nunca el consumidor.
      const fila = {
        ...valores,
        sede: sede.nombre,
        sede_id: sede.id,
        estado_de_lead: ESTADO_INICIAL,
        fuente_de_lead: `API:${req.apiKeyData?.name || 'desconocido'}`,
      };

      const resp = await supabaseRequest(`leads?select=${CAMPOS_RESPUESTA}`, {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(fila),
      });

      const data = await resp.json();

      auditar(201, 1);
      return res.status(201).json({ data: data[0] });
    } catch (error) {
      console.error('[API/leads POST] Error:', error.message);
      auditar(500, 0);
      return res.status(500).json({ error: 'internal_error', message: 'Error creando el lead' });
    }
  }
);

// JSON mal formado: sin esto Express responde un 400 en HTML, que para un
// consumidor que parsea JSON es peor que el error original.
router.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: 'validation_error',
      message: 'El body no es JSON valido',
      campos: [err.message],
    });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'payload_too_large',
      message: 'El body supera el maximo de 32kb',
    });
  }
  return next(err);
});

export default router;
