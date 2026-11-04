// src/modules/leads/monotributo.ts
// `leads.monotributo` es texto libre: en la base conviven "Sí", "Si" y "No" (y algún
// "tiene monotributo" viejo). Se compara siempre normalizado, sin tildes.
//
// Regla de carga (2026-11-04):
//   - Monotributo = Si → DNI y CUIT obligatorios.
//   - Monotributo = No → solo DNI, y el motivo por el que se permite ingresar sin
//     monotributo (leads.motivo_sin_monotributo, se copia al conductor al convertir).

export type EstadoMonotributo = 'si' | 'no' | null

export function estadoMonotributo(valor?: string | null): EstadoMonotributo {
  const v = (valor || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (v === 'si' || v === 'tiene monotributo') return 'si'
  if (v === 'no') return 'no'
  return null
}

/** Campos que faltan según la regla de monotributo (etiquetas para mostrar). */
export function faltantesMonotributo(lead: {
  monotributo?: string | null
  cuit?: string | null
  motivo_sin_monotributo?: string | null
}): string[] {
  const estado = estadoMonotributo(lead.monotributo)
  if (estado === null) return ['Monotributo (sí o no)']
  if (estado === 'si' && !lead.cuit?.trim()) return ['CUIT']
  if (estado === 'no' && !lead.motivo_sin_monotributo?.trim()) return ['Motivo sin monotributo']
  return []
}
