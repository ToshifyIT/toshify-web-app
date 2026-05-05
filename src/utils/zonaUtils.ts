// src/utils/zonaUtils.ts
// Infiere la zona geográfica a partir de coordenadas o texto (Argentina / Buenos Aires)

const CABA_CP_REGEX = /\bc\d{4}\b/

const CABA_KEYWORDS = [
  'caba', 'c.a.b.a', 'c a b a',
  'ciudad autónoma', 'ciudad autonoma',
  'cdad. autónoma', 'cdad autónoma', 'cdad. autonoma', 'cdad autonoma',
  'buenos aires city', 'capital federal',
  'palermo', 'recoleta', 'microcentro', 'san nicolás', 'san nicolas',
  'balvanera', 'caballito', 'villa crespo', 'belgrano', 'almagro',
  'flores', 'boedo', 'barracas', 'la boca', 'san telmo', 'puerto madero',
  'retiro', 'monserrat', 'constitución', 'constitucion', 'núñez', 'nunez',
  'colegiales', 'chacarita', 'villa urquiza', 'villa del parque',
  'villa pueyrredón', 'villa pueyrredon', 'villa devoto', 'saavedra',
  'coghlan', 'parque chas', 'agronomía', 'agronomia', 'paternal',
  'villa ortúzar', 'villa ortuzar', 'villa general mitre', 'villa santa rita',
  'villa real', 'villa luro', 'liniers', 'mataderos', 'parque avellaneda',
  'parque chacabuco', 'parque patricios', 'nueva pompeya', 'villa soldati',
  'villa riachuelo', 'villa lugano',
]

const NORTE_KEYWORDS = [
  'zona norte', 'san isidro', 'vicente lópez', 'vicente lopez',
  'san fernando', 'tigre', 'pilar', 'escobar', 'campana',
  'zárate', 'zarate', 'muñiz', 'san miguel', 'josé c. paz', 'jose c. paz',
  'malvinas argentinas',
]

const SUR_KEYWORDS = [
  'zona sur', 'lanús', 'lanus', 'avellaneda', 'quilmes',
  'berazategui', 'lomas de zamora', 'almirante brown', 'florencio varela',
]

const OESTE_KEYWORDS = [
  'zona oeste', 'morón', 'moron', 'merlo', 'moreno', 'la matanza',
  'ituzaingó', 'ituzaingo', 'hurlingham', 'tres de febrero',
  'san martín', 'san martin',
]

/**
 * Infiere zona a partir de coordenadas (lat/lng).
 * CABA: lat entre -34.71 y -34.53, lng entre -58.53 y -58.33
 */
export function inferZonaFromCoords(lat: number, lng: number): string {
  const inCaba =
    lat >= -34.71 && lat <= -34.53 &&
    lng >= -58.53 && lng <= -58.33

  if (inCaba) return 'CABA'

  const inAmba =
    lat >= -35.0 && lat <= -34.3 &&
    lng >= -59.0 && lng <= -58.0

  if (!inAmba) return ''

  if (lat > -34.53 && lng >= -58.7 && lng <= -58.3) return 'Norte'
  if (lat < -34.65 && lng >= -58.5 && lng <= -58.2) return 'Sur'
  if (lng < -58.53) return 'Oeste'
  if (lat > -34.60) return 'Norte'
  if (lat < -34.65) return 'Sur'

  return 'GBA'
}

/**
 * Infiere zona a partir del texto de una dirección (keywords).
 */
function inferZonaFromAddress(address: string): string {
  if (!address) return ''
  const lower = address.toLowerCase()

  if (NORTE_KEYWORDS.some(k => lower.includes(k))) return 'Norte'
  if (SUR_KEYWORDS.some(k => lower.includes(k))) return 'Sur'
  if (OESTE_KEYWORDS.some(k => lower.includes(k))) return 'Oeste'

  const isCaba = CABA_CP_REGEX.test(lower) || CABA_KEYWORDS.some(k => lower.includes(k))
  if (isCaba) return 'CABA'

  if (lower.includes('gba') || lower.includes('gran buenos aires')) return 'GBA'

  return ''
}

/**
 * Infiere zona: coordenadas primero (más preciso), texto como fallback.
 */
export function inferZona(address: string, lat?: number, lng?: number): string {
  if (lat != null && lng != null) {
    const zona = inferZonaFromCoords(lat, lng)
    if (zona) return zona
  }
  return inferZonaFromAddress(address)
}
