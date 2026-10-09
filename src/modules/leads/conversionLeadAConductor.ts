// src/modules/leads/conversionLeadAConductor.ts
//
// Conversion de un LEAD en CONDUCTOR.
//
// Vivia dentro de LeadsModule como funcion privada del componente. Se extrajo
// tal cual para poder reusarla desde el envio a entrega de una programacion,
// donde un turno puede estar ocupado por un lead que hay que convertir antes.
//
// La logica es la misma; lo unico que cambio es de donde vienen las
// dependencias: antes eran estado del componente (catalogos, perfil, sede) y
// ahora se pasan por parametro. La presentacion (dialogos de confirmacion,
// avisos de exito y de error) NO esta aca: queda en quien la llama, porque
// cada pantalla la muestra a su manera.

import { supabase } from '../../lib/supabase'
import { createLeadDriveFolder } from '../../services/driveService'
import { inferZona, inferZonaFromCoords } from '../../utils/zonaUtils'
import { cargarGoogleMaps, ubicacionDeComponentes, ubicacionDesdeCoordenadas } from '../../utils/ubicacionGoogle'
import type { UbicacionDireccion } from '../../utils/ubicacionGoogle'
import type { Lead } from '../../types/leads.types'

/**
 * Tope para la geocodificacion. Es una llamada a Google que puede quedarse sin
 * contestar; si eso pasa se sigue sin coordenadas en vez de colgar la pantalla.
 */
const TIMEOUT_GEOCODING_MS = 8000

/**
 * País y ciudad de un punto, para cuando el lead trae coordenadas pero no
 * ubicación (leads ubicados antes de que existieran esos campos). Si Google
 * falla devuelve null y la conversión sigue: no se bloquea por esto.
 */
async function calcularUbicacionDesdeCoordenadas(lat: number, lng: number): Promise<UbicacionDireccion | null> {
  try {
    await cargarGoogleMaps()
    const resultado = await ubicacionDesdeCoordenadas(lat, lng)
    return resultado.ok ? resultado.ubicacion : null
  } catch {
    console.warn('[Lead -> Conductor] No se pudo calcular país/ciudad desde coordenadas.')
    return null
  }
}

/** Fila de cualquiera de los catalogos que resuelve `matchCatalogo`. */
export interface OpcionCatalogo {
  id: string
  codigo: string
  descripcion: string
}

export interface CatalogosConversion {
  estadosLicencia: OpcionCatalogo[]
  tiposLicencia: OpcionCatalogo[]
  nacionalidades: OpcionCatalogo[]
  estadosCiviles: OpcionCatalogo[]
  categoriasLicencia: OpcionCatalogo[]
}

export interface ParametrosConversion {
  lead: Lead
  catalogos: CatalogosConversion
  /** Nombre que queda registrado en `leads.usuario`. */
  usuario: string
  /** Sede a usar cuando el lead no trae la suya. */
  sedeFallbackId?: string | null
  /**
   * Conductor duplicado ya resuelto por quien llama. Se pasa cuando la
   * pantalla necesita saber ANTES si va a fusionar o a crear, para mostrar un
   * dialogo u otro. `undefined` = que lo busque esta funcion.
   */
  conductorExistente?: Record<string, unknown> | null
}

export interface ResultadoConversion {
  conductorId: string
  /** true = se completaron los campos vacios de un conductor que ya existia. */
  esFusion: boolean
}

/** Match flexible: compara lowercase e intenta coincidencia parcial */
function matchCatalogo(
  catalogo: OpcionCatalogo[],
  texto: string | null | undefined,
  nombreCampo?: string
): string | null {
  if (!texto || catalogo.length === 0) return null
  const t = texto.trim().toLowerCase()
  // Primero buscar coincidencia exacta (case-insensitive)
  const exacto = catalogo.find(c => c.descripcion.toLowerCase() === t)
  if (exacto) return exacto.id
  // Luego buscar si el texto contiene la descripcion o viceversa
  const parcial = catalogo.find(c =>
    t.includes(c.descripcion.toLowerCase()) || c.descripcion.toLowerCase().includes(t)
  )
  if (parcial) return parcial.id
  // Ultimo intento: comparar por codigo
  const porCodigo = catalogo.find(c => c.codigo.toLowerCase() === t)
  if (porCodigo) return porCodigo.id
  // Sin equivalente en el catalogo: se avisa para que el valor no se pierda
  // en silencio al convertir el lead (caso historico: "EN CONCUBINATO" del
  // lead no existia como "Conviviente" en estados_civiles).
  console.warn(
    `[Lead -> Conductor] Sin equivalente${nombreCampo ? ` en el catalogo de ${nombreCampo}` : ''} para el valor "${texto}". El campo queda vacio.`
  )
  return null
}

const parseMonotributo = (valor?: string | null): boolean => {
  const v = (valor || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return v === 'si' || v === 'tiene monotributo'
}

export interface OpcionesValidacion {
  /**
   * Exigir el link de Drive cargado a mano. Por defecto SI, que es el criterio
   * historico del boton "Convertir" del modulo Leads.
   *
   * Se pone en false cuando quien convierte prefiere que la carpeta se genere
   * sola: si `url_folder` viene vacio, la conversion la crea y la guarda tanto
   * en el lead como en el conductor.
   */
  exigirLinkDrive?: boolean
}

/**
 * Campos que exige la conversion. Devuelve las ETIQUETAS de los que faltan;
 * vacio = el lead se puede convertir.
 */
export function validarCamposConversion(lead: Lead, opciones: OpcionesValidacion = {}): string[] {
  const { exigirLinkDrive = true } = opciones
    // Validar todos los campos obligatorios para conductores
    const camposFaltantes: string[] = []
    if (!lead.nombre_completo?.trim()) camposFaltantes.push('Nombre completo')
    if (!lead.dni?.trim()) camposFaltantes.push('DNI')
    if (!lead.cuit?.trim()) camposFaltantes.push('CUIT')
    if (!lead.fecha_de_nacimiento) camposFaltantes.push('Fecha de nacimiento')
    if (!lead.nacionalidad?.trim()) camposFaltantes.push('Nacionalidad')
    if (!lead.estado_civil?.trim()) camposFaltantes.push('Estado civil')
    if (!lead.sede_id && !lead.sede) camposFaltantes.push('Sede')
    if (!lead.phone?.trim()) camposFaltantes.push('Teléfono')
    if (!lead.email?.trim()) camposFaltantes.push('Email')
    if (!lead.direccion?.trim()) camposFaltantes.push('Dirección')
    if (!lead.numero_licencia?.trim()) camposFaltantes.push('Nro. Licencia')
    if (!lead.categorias_licencia || lead.categorias_licencia.length === 0) camposFaltantes.push('Categorías de licencia')
    if (!lead.vencimiento_licencia) camposFaltantes.push('Vencimiento de licencia')
    if (!lead.experiencia_previa?.trim()) camposFaltantes.push('Experiencia previa')
    if (!lead.cochera?.trim()) camposFaltantes.push('Cochera')
    if (exigirLinkDrive && !lead.url_folder?.trim()) camposFaltantes.push('Link de Documentación (Drive)')
  return camposFaltantes
}

/**
 * Busca un conductor que ya represente a esta persona, comparando DNI y CUIT
 * sin espacios ni guiones (el DNI tambien puede venir dentro del CUIT).
 */
export async function buscarConductorExistente(lead: Lead): Promise<Record<string, unknown> | null> {
    // Verificar si ya existe un conductor con el mismo DNI o CUIT
    // Normalizamos quitando espacios y guiones para comparar correctamente
    const normalizarDoc = (val: string) => val.replace(/[\s-]/g, '')
    let conductorExistente: Record<string, unknown> | null = null

    const dniLimpio = lead.dni?.trim() ? normalizarDoc(lead.dni.trim()) : ''
    const cuitLimpio = lead.cuit?.trim() ? normalizarDoc(lead.cuit.trim()) : ''

    if (dniLimpio || cuitLimpio) {
      // Traer candidatos que contengan los digitos del DNI o CUIT
      let query = supabase.from('conductores').select('*')
      if (dniLimpio && cuitLimpio) {
        query = query.or(`numero_dni.ilike.%${dniLimpio}%,numero_cuit.ilike.%${dniLimpio}%,numero_dni.ilike.%${cuitLimpio}%,numero_cuit.ilike.%${cuitLimpio}%`)
      } else if (dniLimpio) {
        query = query.or(`numero_dni.ilike.%${dniLimpio}%,numero_cuit.ilike.%${dniLimpio}%`)
      } else {
        query = query.or(`numero_dni.ilike.%${cuitLimpio}%,numero_cuit.ilike.%${cuitLimpio}%`)
      }
      const { data: candidatos } = await query.limit(10)

      if (candidatos && candidatos.length > 0) {
        // Comparar normalizado para encontrar match exacto
        // DNI match directo, o DNI contenido dentro del CUIT (CUIT = prefijo + DNI + digito verificador)
        conductorExistente = candidatos.find((c: Record<string, unknown>) => {
          const cDni = normalizarDoc(String(c.numero_dni || ''))
          const cCuit = normalizarDoc(String(c.numero_cuit || ''))
          if (dniLimpio && (cDni === dniLimpio || cCuit.includes(dniLimpio))) return true
          if (cuitLimpio && (cCuit === cuitLimpio || cDni === cuitLimpio)) return true
          return false
        }) || null
      }
    }

  return conductorExistente
}

/**
 * Convierte el lead en conductor, o fusiona sus datos con el conductor que ya
 * exista con ese documento. Devuelve el id del conductor resultante.
 *
 * NO valida: llamar antes a `validarCamposConversion`.
 * NO es transaccional: si falla despues de crear el conductor, el lead queda
 * sin marcar como convertido (se conserva el comportamiento original).
 */
export async function convertirLeadAConductor(
  params: ParametrosConversion
): Promise<ResultadoConversion> {
  const { lead, catalogos, usuario, sedeFallbackId } = params
  const { estadosLicencia, tiposLicencia, nacionalidades, estadosCiviles, categoriasLicencia } = catalogos

  const conductorExistente =
    params.conductorExistente !== undefined
      ? params.conductorExistente
      : await buscarConductorExistente(lead)
  const esFusion = !!conductorExistente


    const parts = (lead.nombre_completo || '').trim().split(' ')
    const nombres = parts.slice(0, Math.ceil(parts.length / 2)).join(' ')
    const apellidos = parts.slice(Math.ceil(parts.length / 2)).join(' ')

    let turnoMapped = 'SIN_PREFERENCIA'
    const turnoLead = (lead.turno || '').toLowerCase()
    if (turnoLead.includes('diurno')) turnoMapped = 'DIURNO'
    else if (turnoLead.includes('nocturno')) turnoMapped = 'NOCTURNO'
    else if (turnoLead.includes('cargo')) turnoMapped = 'A_CARGO'

    // Resolver textos a IDs usando match flexible
    const licenciaEstadoId = matchCatalogo(estadosLicencia, lead.estado_licencia, 'estado de licencia')
    const licenciaTipoId = matchCatalogo(tiposLicencia, lead.tipo_licencia, 'tipo de licencia')
    const nacionalidadId = matchCatalogo(nacionalidades, lead.nacionalidad, 'nacionalidad')
    const estadoCivilId = matchCatalogo(estadosCiviles, lead.estado_civil, 'estado civil')

    // Recalcular zona desde coordenadas o geocodificando la dirección
    let zonaCalculada = ''
    let latFinal = lead.latitud ?? null
    let lngFinal = lead.longitud ?? null
    // País y ciudad: se copian del lead (salieron de Google al ubicarlo). Si
    // acá se geocodifica de nuevo, se toman de esa misma respuesta.
    let paisFinal: string | null = latFinal != null && lngFinal != null ? (lead.direccion_pais ?? null) : null
    let ciudadFinal: string | null = latFinal != null && lngFinal != null ? (lead.direccion_ciudad ?? null) : null

    if (latFinal != null && lngFinal != null) {
      zonaCalculada = inferZona(lead.direccion || '', latFinal, lngFinal)
    } else if (lead.direccion?.trim()) {
      try {
        const geocoder = new google.maps.Geocoder()
        // Con tope de tiempo A PROPOSITO: si la API de Google esta caida, sin
        // cuota o con la clave restringida, el callback de geocode() puede no
        // llamarse NUNCA. Sin este tope la promesa no se resuelve jamas y toda
        // la conversion queda colgada sin error ni forma de salir.
        const geoResult = await new Promise<{ lat: number; lng: number; address: string; pais: string | null; ciudad: string | null } | null>((resolve) => {
          const timeout = setTimeout(() => {
            console.warn('[Lead -> Conductor] Geocoding sin respuesta: se sigue sin coordenadas.')
            resolve(null)
          }, TIMEOUT_GEOCODING_MS)

          geocoder.geocode({ address: lead.direccion!, region: 'AR' }, (results, status) => {
            clearTimeout(timeout)
            if (status === 'OK' && results && results[0]) {
              resolve({
                lat: results[0].geometry.location.lat(),
                lng: results[0].geometry.location.lng(),
                address: results[0].formatted_address,
                ...ubicacionDeComponentes(results[0].address_components),
              })
            } else {
              resolve(null)
            }
          })
        })
        if (geoResult) {
          latFinal = geoResult.lat
          lngFinal = geoResult.lng
          paisFinal = geoResult.pais
          ciudadFinal = geoResult.ciudad
          zonaCalculada = inferZonaFromCoords(geoResult.lat, geoResult.lng)
        }
      } catch {
        zonaCalculada = inferZona(lead.direccion || '')
      }
    }

    // Hay punto pero el lead no traía país/ciudad: se calculan desde ese punto
    // (que salió de geocodificar su dirección).
    if (latFinal != null && lngFinal != null && (!paisFinal || !ciudadFinal)) {
      const ubicacion = await calcularUbicacionDesdeCoordenadas(latFinal, lngFinal)
      if (ubicacion) {
        paisFinal = paisFinal || ubicacion.pais
        ciudadFinal = ciudadFinal || ubicacion.ciudad
      }
    }

    if (!zonaCalculada) zonaCalculada = lead.zona || ''

    // Datos del lead mapeados a campos de conductor
    const leadMappedData: Record<string, unknown> = {
      nombres: (nombres || lead.primer_nombre || '').toUpperCase(),
      apellidos: (apellidos || lead.apellido || '').toUpperCase(),
      numero_dni: lead.dni || '',
      numero_cuit: lead.cuit || '',
      telefono_contacto: lead.phone || '',
      email: lead.email || '',
      direccion: lead.direccion || '',
      zona: zonaCalculada,
      preferencia_turno: turnoMapped,
      licencia_vencimiento: lead.vencimiento_licencia || null,
      numero_licencia: lead.numero_licencia || '',
      licencia_estado_id: licenciaEstadoId,
      licencia_tipo_id: licenciaTipoId,
      nacionalidad_id: nacionalidadId,
      estado_civil_id: estadoCivilId,
      cbu: lead.cbu || '',
      monotributo: parseMonotributo(lead.monotributo),
      fecha_nacimiento: lead.fecha_de_nacimiento || null,
      direccion_lat: latFinal,
      direccion_lng: lngFinal,
      direccion_pais: paisFinal,
      direccion_ciudad: ciudadFinal,
      sede_id: lead.sede_id || sedeFallbackId || null,
      url_documentacion: lead.url_folder || null,
      intercom_id: lead.id_lead || null,
      id_conversation: lead.id_conversation || null,
      contacto_emergencia: lead.contacto_de_emergencia || lead.datos_de_emergencia || null,
      telefono_emergencia: lead.telefono_emergencia || null,
      parentesco_emergencia: lead.parentesco_emergencia || null,
      direccion_emergencia: lead.direccion_emergencia || null,
      experiencia_previa: lead.experiencia_previa || null,
      observaciones: lead.observaciones || null,
      cochera_propia: lead.cochera?.toLowerCase() === 'si' || lead.cochera?.toLowerCase() === 'sí' || false,
      antecedentes_penales: lead.antecedentes_penales ?? false,
    }

    let conductorId: string

    if (esFusion && conductorExistente) {
      // FUSION: solo actualizar campos vacios/nulos del conductor existente
      conductorId = conductorExistente.id as string
      const updateData: Record<string, unknown> = {}

      // Campos que no se deben pisar en fusion (estado, motivo_baja, etc)
      const camposExcluidos = ['estado_id', 'motivo_baja', 'fecha_terminacion', 'fecha_reincorpoaracion']

      for (const [key, leadValue] of Object.entries(leadMappedData)) {
        if (camposExcluidos.includes(key)) continue
        const existingValue = conductorExistente[key]
        // Solo llenar si el conductor tiene el campo vacio/nulo
        const isEmpty = existingValue === null || existingValue === undefined || existingValue === '' || existingValue === 0
        const leadHasValue = leadValue !== null && leadValue !== undefined && leadValue !== ''
        if (isEmpty && leadHasValue) {
          updateData[key] = leadValue
        }
      }

      // País/ciudad describen el punto del LEAD: solo se copian si en esta fusión
      // también se copian sus coordenadas. Si el conductor ya tenía su propio
      // punto y le falta país/ciudad, se calculan desde ESE punto.
      if (!('direccion_lat' in updateData)) {
        delete updateData.direccion_pais
        delete updateData.direccion_ciudad
        const latConductor = conductorExistente.direccion_lat
        const lngConductor = conductorExistente.direccion_lng
        const faltaUbicacion = !conductorExistente.direccion_pais || !conductorExistente.direccion_ciudad
        if (typeof latConductor === 'number' && typeof lngConductor === 'number' && faltaUbicacion) {
          const ubicacion = await calcularUbicacionDesdeCoordenadas(latConductor, lngConductor)
          if (ubicacion?.pais && !conductorExistente.direccion_pais) updateData.direccion_pais = ubicacion.pais
          if (ubicacion?.ciudad && !conductorExistente.direccion_ciudad) updateData.direccion_ciudad = ubicacion.ciudad
        }
      }

      if (Object.keys(updateData).length > 0) {
        const { error: errUpdate } = await supabase
          .from('conductores')
          .update(updateData)
          .eq('id', conductorId)
        if (errUpdate) throw errUpdate
      }
    } else {
      // CREACION: flujo normal de insert
      const { data: estados } = await supabase
        .from('conductores_estados')
        .select('id')
        .eq('codigo', 'ACTIVO')
        .limit(1)
      const estadoId = estados?.[0]?.id

      if (!estadoId) {
        throw new Error('No se encontró el estado ACTIVO para conductores. Verifique la tabla conductores_estados.')
      }

      const conductorData: Record<string, unknown> = { ...leadMappedData, estado_id: estadoId }

      // Filtrar campos vacíos (salvo requeridos)
      Object.keys(conductorData).forEach(key => {
        const v = conductorData[key]
        if (v === '' || v === null || v === undefined) {
          if (!['numero_licencia', 'estado_id', 'nombres', 'apellidos', 'numero_dni'].includes(key)) {
            delete conductorData[key]
          }
        }
      })

      const { data: createdConductor, error: errCond } = await supabase
        .from('conductores')
        .insert(conductorData)
        .select('id')
        .single()

      if (errCond) throw errCond
      conductorId = createdConductor.id
    }

    // Buscar o crear carpeta en Drive
    let folderUrl = lead.url_folder?.trim() || null
    if (conductorId) {
      if (!folderUrl) {
        const nombreCompleto = (lead.nombre_completo || '').trim()
        if (nombreCompleto) {
          const driveResult = await createLeadDriveFolder(lead.id, nombreCompleto)
          if (driveResult.success && driveResult.folderUrl) {
            folderUrl = driveResult.folderUrl
            await supabase.from('leads').update({ url_folder: folderUrl }).eq('id', lead.id)
          }
        }
      }
      // Solo guardar URL si el conductor no tiene una
      if (folderUrl) {
        const existingUrl = esFusion ? (conductorExistente?.url_documentacion || conductorExistente?.drive_folder_url) : null
        if (!existingUrl) {
          await supabase.from('conductores').update({ url_documentacion: folderUrl }).eq('id', conductorId)
        }
      }
    }

    // Insertar categorías de licencia (sin duplicar)
    if (conductorId && lead.categorias_licencia?.length && categoriasLicencia.length > 0) {
      // Obtener categorias que ya tiene el conductor
      const { data: categoriasExistentes } = await (supabase as any)
        .from('conductores_licencias_categorias')
        .select('licencia_categoria_id')
        .eq('conductor_id', conductorId)
      const idsExistentes = new Set((categoriasExistentes || []).map((c: { licencia_categoria_id: string }) => c.licencia_categoria_id))

      const categoriasRelacion: Array<{ conductor_id: string; licencia_categoria_id: string }> = []
      for (const desc of lead.categorias_licencia) {
        const cat = categoriasLicencia.find(c => c.descripcion === desc)
        if (cat && !idsExistentes.has(cat.id)) {
          categoriasRelacion.push({ conductor_id: conductorId, licencia_categoria_id: cat.id })
        }
      }
      if (categoriasRelacion.length > 0) {
        await (supabase as any).from('conductores_licencias_categorias').insert(categoriasRelacion)
      }
    }

    await supabase.from('leads').update({
      proceso: 'Convertido',
      estado_de_lead: 'Conductor',
      fecha_convertido: new Date().toLocaleString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }).replace(' ', 'T'),
      usuario: usuario || 'Sistema',
    }).eq('id', lead.id)

  return { conductorId, esFusion }
}
