// src/modules/leads/nombreLead.ts
// Nombres y apellidos del lead por separado (columnas primer_nombre y apellido), igual
// que en conductores (nombres / apellidos). nombre_completo se sigue guardando, armado
// con los dos, porque lo usa toda la app (listas, búsquedas, Sellium, 2Chat).

/**
 * Separa un nombre completo cuando el lead no tiene los campos cargados.
 * Es una suposición para precargar el formulario (siempre editable):
 * 1 palabra → solo nombre; 2 → nombre + apellido; 3 → dos nombres + apellido;
 * 4 o más → dos nombres + el resto como apellidos.
 */
export function separarNombreCompleto(completo: string | null | undefined): { nombres: string; apellidos: string } {
  const p = String(completo || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  if (p.length <= 1) return { nombres: p[0] || '', apellidos: '' }
  if (p.length === 2) return { nombres: p[0], apellidos: p[1] }
  if (p.length === 3) return { nombres: `${p[0]} ${p[1]}`, apellidos: p[2] }
  return { nombres: `${p[0]} ${p[1]}`, apellidos: p.slice(2).join(' ') }
}

/** Nombres y apellidos del lead: los campos propios o, si faltan, la separación sugerida */
export function nombresDelLead(lead: { primer_nombre?: string | null; apellido?: string | null; nombre_completo?: string | null }) {
  const nombres = (lead.primer_nombre || '').trim()
  const apellidos = (lead.apellido || '').trim()
  if (nombres && apellidos) return { nombres, apellidos }
  const sugerido = separarNombreCompleto(lead.nombre_completo)
  return { nombres: nombres || sugerido.nombres, apellidos: apellidos || sugerido.apellidos }
}

export function unirNombre(nombres: string | null | undefined, apellidos: string | null | undefined): string {
  return `${(nombres || '').trim()} ${(apellidos || '').trim()}`.replace(/\s+/g, ' ').trim()
}
