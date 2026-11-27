/**
 * Contacto de emergencia: obligatorio para pasar un lead a conductor y en la
 * ficha del conductor (nombre, teléfono, parentesco y dirección).
 *
 * El nombre vive en dos columnas del lead: `datos_de_emergencia` (la que edita
 * el formulario) y `contacto_de_emergencia` (la de los leads más viejos). La
 * conversión toma la primera que tenga dato, igual que este chequeo.
 */

/** Opciones del selector de parentesco (lead y conductor). */
export const PARENTESCOS_EMERGENCIA: Array<{ value: string; label: string }> = [
  { value: 'Padre/Madre', label: 'Padre/Madre' },
  { value: 'Hermano/a', label: 'Hermano/a' },
  { value: 'Cónyuge', label: 'Cónyuge' },
  { value: 'Hijo/a', label: 'Hijo/a' },
  { value: 'Abuelo/a', label: 'Abuelo/a' },
  { value: 'Amigo/a', label: 'Amigo/a' },
  { value: 'Compadre', label: 'Compadre' },
  { value: 'Comadre', label: 'Comadre' },
  { value: 'Concubino/a', label: 'Concubino/a' },
  { value: 'Conviviente', label: 'Conviviente' },
  { value: 'Cuñado/a', label: 'Cuñado/a' },
  { value: 'Ex Esposo/a', label: 'Ex Esposo/a' },
  { value: 'Padrastro', label: 'Padrastro' },
  { value: 'Madrastra', label: 'Madrastra' },
  { value: 'Primo/a', label: 'Primo/a' },
  { value: 'Vecino/a', label: 'Vecino/a' },
  { value: 'Tío/a', label: 'Tío/a' },
  { value: 'Otro', label: 'Otro' },
]

const lleno = (v?: string | null) => !!v?.trim()

/** Nombre del contacto de emergencia de un lead (cualquiera de las dos columnas). */
export function nombreContactoEmergenciaLead(lead: {
  datos_de_emergencia?: string | null
  contacto_de_emergencia?: string | null
}): string {
  return (lead.datos_de_emergencia?.trim() || lead.contacto_de_emergencia?.trim() || '')
}

/** Etiquetas de los datos de emergencia que le faltan a un lead. */
export function faltantesEmergenciaLead(lead: {
  datos_de_emergencia?: string | null
  contacto_de_emergencia?: string | null
  telefono_emergencia?: string | null
  parentesco_emergencia?: string | null
  direccion_emergencia?: string | null
}): string[] {
  const faltan: string[] = []
  if (!nombreContactoEmergenciaLead(lead)) faltan.push('Nombre contacto emergencia')
  if (!lleno(lead.telefono_emergencia)) faltan.push('Teléfono emergencia')
  if (!lleno(lead.parentesco_emergencia)) faltan.push('Parentesco emergencia')
  if (!lleno(lead.direccion_emergencia)) faltan.push('Dirección emergencia')
  return faltan
}

/** Errores por campo del contacto de emergencia de un conductor (vacío = completo). */
export function erroresEmergenciaConductor(c: {
  contacto_emergencia?: string | null
  telefono_emergencia?: string | null
  parentesco_emergencia?: string | null
  direccion_emergencia?: string | null
}): Record<string, string> {
  const e: Record<string, string> = {}
  if (!lleno(c.contacto_emergencia)) e.contacto_emergencia = 'Requerido'
  if (!lleno(c.telefono_emergencia)) e.telefono_emergencia = 'Requerido'
  if (!lleno(c.parentesco_emergencia)) e.parentesco_emergencia = 'Requerido'
  if (!lleno(c.direccion_emergencia)) e.direccion_emergencia = 'Requerido'
  return e
}
