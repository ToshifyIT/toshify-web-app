// src/utils/sedeMatch.ts
/**
 * Inferencia de la SEDE de un lead a partir de los campos de ubicacion.
 *
 * POR QUE EXISTE
 * Los leads que entran por el chatbot traen en `sede` la respuesta textual del
 * candidato, no un valor del catalogo: "Estoy en ciudadela, buenos aires",
 * "vivo en el bolson", "zona oeste". La logica anterior solo buscaba las
 * palabras "bariloche" / "brc" / "patagonia" en `sede` + `zona`, e ignoraba
 * `direccion`, `city` y `region`, que es donde suele estar el dato bueno.
 *
 * COMO DECIDE
 *   1. Si algun campo de ubicacion menciona una localidad de la zona de
 *      Bariloche  ->  sede Bariloche.
 *   2. En cualquier otro caso  ->  Buenos Aires (default explicito de negocio:
 *      ningun lead queda sin sede, porque un lead sin sede_id no se ve en el
 *      modulo).
 *
 * Agregar una sede nueva es agregar una entrada a REGLAS: no hay que tocar la
 * logica. Buenos Aires no necesita reglas porque es el default.
 */

export interface SedeRef {
  id: string
  nombre: string
  codigo?: string | null
  es_principal?: boolean
}

/** Campos de `leads` que pueden contener una pista de ubicacion. */
export interface CamposUbicacionLead {
  sede?: string | null
  zona?: string | null
  direccion?: string | null
  city?: string | null
  region?: string | null
}

/** minusculas, sin acentos, espacios colapsados. */
export function normalizarTexto(v: string | null | undefined): string {
  return (v || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Regex de palabra completa a partir de una lista de terminos. */
function construirRegex(terminos: string[]): RegExp {
  return new RegExp(`\\b(${terminos.map(escaparRegex).join('|')})\\b`)
}

interface ReglaSede {
  /** Identifica a que fila del catalogo `sedes` corresponde esta regla. */
  coincideCatalogo: RegExp
  /**
   * Localidades y referencias inequivocas. Se buscan en TODOS los campos de
   * ubicacion, incluida `direccion`.
   */
  localidades: string[]
  /**
   * Provincias. Solo se buscan en campos ESTRUCTURADOS (city / region), nunca
   * en `direccion`: "Rio Negro" y "Neuquen" tambien son nombres de calle en el
   * AMBA, y matchearlos en una direccion mandaria leads porteños a Bariloche.
   */
  provincias?: string[]
}

const REGLAS: ReglaSede[] = [
  {
    coincideCatalogo: /bariloche|brc|patagonia/,
    localidades: [
      'bariloche', 'brc', 'san carlos de bariloche',
      'dina huapi', 'el bolson', 'bolson',
      'villa la angostura', 'la angostura',
      'llao llao', 'cipolletti', 'patagonia',
    ],
    provincias: ['rio negro', 'neuquen'],
  },
  // Buenos Aires: no lleva reglas. Es el default cuando nada matchea.
]

/** Ubica en el catalogo la sede que corresponde a una regla. */
function buscarEnCatalogo(sedes: SedeRef[], patron: RegExp): SedeRef | undefined {
  return sedes.find(s => patron.test(normalizarTexto(`${s.nombre || ''} ${s.codigo || ''}`)))
}

/** La sede que se usa cuando ninguna regla matchea: Buenos Aires, o la principal. */
export function sedePorDefecto(sedes: SedeRef[]): SedeRef | null {
  if (!sedes.length) return null
  const principal = sedes.find(s => s.es_principal) || sedes[0]
  const buenosAires = buscarEnCatalogo(sedes, /buenos aires|bs ?as|caba|capital federal/)
  return buenosAires || principal || null
}

/**
 * Devuelve la sede que corresponde al lead. Nunca devuelve null si `sedes`
 * tiene al menos una fila: lo que no se reconoce cae en la sede por defecto.
 */
export function inferirSedeDeLead(lead: CamposUbicacionLead, sedes: SedeRef[]): SedeRef | null {
  if (!sedes.length) return null

  // Texto libre: todo lo que pueda mencionar una localidad.
  const libre = normalizarTexto(
    [lead.sede, lead.zona, lead.direccion, lead.city, lead.region].filter(Boolean).join(' ')
  )
  // Estructurado: lo que viene de un formulario o del geo de Intercom, donde una
  // provincia si es una provincia y no el nombre de una calle.
  const estructurado = normalizarTexto([lead.city, lead.region].filter(Boolean).join(' '))

  for (const regla of REGLAS) {
    const matcheaLocalidad = regla.localidades.length > 0 &&
      construirRegex(regla.localidades).test(libre)
    const matcheaProvincia = !!regla.provincias?.length &&
      construirRegex(regla.provincias).test(estructurado)

    if (matcheaLocalidad || matcheaProvincia) {
      const sede = buscarEnCatalogo(sedes, regla.coincideCatalogo)
      if (sede) return sede
      // La sede de la regla no existe en el catalogo: no inventamos, cae al default.
      break
    }
  }

  return sedePorDefecto(sedes)
}
