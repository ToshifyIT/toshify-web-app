// src/modules/onboarding/distribucion-mapa-v2/ubicacion.ts
//
// Deriva PAÍS y CIUDAD del texto de la dirección.
//
// Por qué así y no de otra forma:
// El mapa ubica a la gente con latitud y longitud, que son sólo números: el
// nombre de la ciudad que se ve en el mapa viene pintado dentro de la imagen
// que manda Google, no es un dato que la app tenga. Traducir coordenadas a
// nombres es reverse geocoding, que cuesta una llamada por persona.
//
// Pero el campo `direccion` de leads y conductores YA es el `formatted_address`
// que devolvió Google cuando se geocodificó, y ese texto trae la localidad y la
// provincia. Leerlo de ahí es gratis, instantáneo y no requiere migrar nada.
//
// Limitación conocida y aceptada: es un parseo de texto, así que no resuelve el
// 100%. Lo que no se puede determinar queda en null y la UI lo agrupa como
// "Sin dato", de modo que el operador VE cuántos son y nadie desaparece del
// mapa en silencio. Si ese número resulta alto, el próximo paso es guardar
// país/ciudad en columnas propias al momento de geocodificar (sale gratis:
// Google ya devuelve `address_components` y hoy se descartan).

/** Etiqueta única para lo que no se pudo determinar. */
export const SIN_UBICACION = 'Sin dato'

/**
 * Países que pueden aparecer como último segmento. Se compara normalizado
 * (sin acentos ni mayúsculas), por eso las claves van en minúscula sin tildes.
 */
const PAISES: Record<string, string> = {
  argentina: 'Argentina',
  uruguay: 'Uruguay',
  chile: 'Chile',
  paraguay: 'Paraguay',
  bolivia: 'Bolivia',
  brasil: 'Brasil',
  brazil: 'Brasil',
  peru: 'Perú',
  colombia: 'Colombia',
  mexico: 'México',
}

/**
 * Provincias argentinas tal como las escribe Google, con sus variantes. El
 * valor es el nombre normalizado que se muestra.
 */
const PROVINCIAS_AR: Record<string, string> = {
  'buenos aires': 'Buenos Aires',
  'provincia de buenos aires': 'Buenos Aires',
  catamarca: 'Catamarca',
  chaco: 'Chaco',
  chubut: 'Chubut',
  cordoba: 'Córdoba',
  corrientes: 'Corrientes',
  'entre rios': 'Entre Ríos',
  formosa: 'Formosa',
  jujuy: 'Jujuy',
  'la pampa': 'La Pampa',
  'la rioja': 'La Rioja',
  mendoza: 'Mendoza',
  misiones: 'Misiones',
  neuquen: 'Neuquén',
  'rio negro': 'Río Negro',
  salta: 'Salta',
  'san juan': 'San Juan',
  'san luis': 'San Luis',
  'santa cruz': 'Santa Cruz',
  'santa fe': 'Santa Fe',
  'santiago del estero': 'Santiago del Estero',
  'tierra del fuego': 'Tierra del Fuego',
  tucuman: 'Tucumán',
}

/**
 * Variantes con las que Google escribe la Ciudad de Buenos Aires. Es el único
 * caso donde provincia y ciudad son la misma cosa.
 */
const CABA_VARIANTES = new Set([
  'caba',
  'capital federal',
  'cdad. autonoma de buenos aires',
  'cdad autonoma de buenos aires',
  'ciudad autonoma de buenos aires',
  'ciudad de buenos aires',
  'buenos aires cf',
])

const CABA_LABEL = 'Ciudad Autónoma de Buenos Aires'

/** Minúsculas, sin acentos y con espacios colapsados, para comparar. */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Saca el código postal del principio de un segmento. Google los escribe de
 * varias formas y todas aparecen en los datos:
 *   "B1611JFQ Don Torcuato"  CPA completo (letra + 4 dígitos + 3 letras)
 *   "C1417 CABA"             CPA corto (letra + 4 dígitos)
 *   "1708 Morón"             postal argentino viejo (4 dígitos)
 *   "11000 Montevideo"       postal de 5 dígitos (Uruguay y otros)
 *
 * El orden del alternador importa: primero las formas más largas, si no el
 * motor corta de menos y deja restos pegados al nombre de la ciudad.
 */
function quitarCodigoPostal(segmento: string): string {
  return segmento
    .replace(/^(?:[A-Za-z]\d{4}[A-Za-z]{3}|[A-Za-z]\d{4}|\d{4,5})\s+/, '')
    .trim()
}

/** Un segmento que parece una calle con altura, no una ciudad. */
function pareceCalle(segmento: string): boolean {
  return /\d/.test(segmento)
}

export interface UbicacionDerivada {
  pais: string | null
  ciudad: string | null
}

/**
 * País y ciudad a partir del `formatted_address`.
 *
 * "Ciudad" es el nivel que la gente usa al hablar: el partido en provincia de
 * Buenos Aires (Tigre, Morón), el municipio o localidad en el resto del país, y
 * CABA como una sola unidad.
 *
 * Ejemplos:
 *   "Urquiza 913, B1611JFQ Don Torcuato, Provincia de Buenos Aires"
 *     → { pais: 'Argentina', ciudad: 'Don Torcuato' }
 *   "Av. Belgrano 1234, C1092AAQ Cdad. Autónoma de Buenos Aires, Argentina"
 *     → { pais: 'Argentina', ciudad: 'Ciudad Autónoma de Buenos Aires' }
 */
export function derivarUbicacion(direccion: string | null | undefined): UbicacionDerivada {
  if (!direccion || !direccion.trim()) return { pais: null, ciudad: null }

  const segmentos = direccion
    .split(',')
    .map((s) => quitarCodigoPostal(s.trim()))
    .filter((s) => s.length > 0)

  if (segmentos.length === 0) return { pais: null, ciudad: null }

  let pais: string | null = null
  let restantes = [...segmentos]

  // 1. ¿El último segmento es un país?
  const ultimo = normalizar(restantes[restantes.length - 1])
  if (PAISES[ultimo]) {
    pais = PAISES[ultimo]
    restantes = restantes.slice(0, -1)
  }

  if (restantes.length === 0) return { pais, ciudad: null }

  // 2. ¿El siguiente es una provincia argentina o CABA? Si lo es, el país
  //    queda determinado aunque no viniera escrito.
  const penultimo = normalizar(restantes[restantes.length - 1])

  if (CABA_VARIANTES.has(penultimo)) {
    // CABA es provincia y ciudad a la vez: se resuelve acá y no se busca más.
    return { pais: pais || 'Argentina', ciudad: CABA_LABEL }
  }

  if (PROVINCIAS_AR[penultimo]) {
    pais = pais || 'Argentina'
    restantes = restantes.slice(0, -1)
  }

  if (restantes.length === 0) return { pais, ciudad: null }

  // 3. Lo que quedó al final es la ciudad. Con un solo segmento hay que
  //    descartar el caso "sólo la calle", que no dice nada de la ciudad.
  const candidato = restantes[restantes.length - 1]
  if (restantes.length === 1 && pareceCalle(candidato)) {
    return { pais, ciudad: null }
  }

  return { pais, ciudad: candidato }
}
