// src/modules/leads/licenciaLead.ts
// Licencia del lead (regla 2026-11-11, Cyber Toshi Promo):
//   - "¿Tiene licencia?" (leads.licencia, 'Si' / 'No'). En la base conviven "Sí" y "Si":
//     se compara siempre normalizado.
//   - Si tiene: Nro, Vencimiento y Categoría (única: B1, D1 u Otros). Con "Otros" se
//     escribe el detalle en categoria_licencia_otra.
//   - Fechas de obtención, cada una en su campo para saber cuándo tuvo B1 y cuándo D1
//     (pedido 2026-11-11):
//       · B1    → fecha_licencia_b1 obligatoria.
//       · D1    → fecha_licencia_d1 obligatoria; fecha_licencia_b1 opcional (si se conoce).
//       · Otros → fecha_categoria_licencia (fecha general) obligatoria.
//     fecha_categoria_licencia siempre queda con la fecha de la categoría actual.
//   - Si no tiene: esos campos se guardan vacíos.
//   - categorias_licencia (selección múltiple) queda como histórico: no se edita más.
//
// La usan el formulario de Leads, el modal de conversión de Onboarding y la conversión.

import type { CategoriaLicenciaLead } from '../../types/leads.types'

export const CATEGORIAS_LICENCIA_LEAD: CategoriaLicenciaLead[] = ['B1', 'D1', 'Otros']

export type EstadoLicencia = 'si' | 'no' | null

export function estadoLicencia(valor?: string | null): EstadoLicencia {
  const v = (valor || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (v === 'si') return 'si'
  if (v === 'no') return 'no'
  return null
}

/** 'Si' / 'No' / '' para el selector "¿Tiene licencia?". */
export function licenciaSiNo(valor?: string | null): 'Si' | 'No' | '' {
  const estado = estadoLicencia(valor)
  return estado === 'si' ? 'Si' : estado === 'no' ? 'No' : ''
}

interface LicenciaLead {
  licencia?: string | null
  numero_licencia?: string | null
  vencimiento_licencia?: string | null
  categoria_licencia?: string | null
  categoria_licencia_otra?: string | null
  fecha_categoria_licencia?: string | null
  fecha_licencia_b1?: string | null
  fecha_licencia_d1?: string | null
}

/** Etiquetas de las fechas (las usa también Conductores para marcar el campo). */
export const FALTA_FECHA_B1 = 'Fecha de obtención B1'
export const FALTA_FECHA_D1 = 'Fecha de obtención D1'
export const FALTA_FECHA_OTROS = 'Fecha de obtención de la categoría'

/** Campos de licencia que faltan (etiquetas para mostrar). */
export function faltantesLicencia(lead: LicenciaLead): string[] {
  const estado = estadoLicencia(lead.licencia)
  if (estado === null) return ['¿Tiene licencia?']
  if (estado === 'no') return []
  const faltan: string[] = []
  if (!lead.numero_licencia?.trim()) faltan.push('Nro. licencia')
  if (!lead.vencimiento_licencia) faltan.push('Vencimiento licencia')
  if (!lead.categoria_licencia) faltan.push('Categoría de licencia')
  else if (lead.categoria_licencia === 'Otros' && !lead.categoria_licencia_otra?.trim()) faltan.push('Detalle de la licencia (Otros)')
  if (lead.categoria_licencia === 'B1' && !lead.fecha_licencia_b1) faltan.push(FALTA_FECHA_B1)
  if (lead.categoria_licencia === 'D1' && !lead.fecha_licencia_d1) faltan.push(FALTA_FECHA_D1)
  if (lead.categoria_licencia === 'Otros' && !lead.fecha_categoria_licencia) faltan.push(FALTA_FECHA_OTROS)
  return faltan
}

/** Valor de `leads.d1` según la categoría (lo usa el Dashboard de Marketing). */
export function d1DesdeCategoria(categoria?: string | null, otra?: string | null): 'Si' | 'No' | null {
  if (categoria === 'D1') return 'Si'
  if (categoria === 'B1') return 'No'
  if (categoria === 'Otros') return /\bD\s*1\b/i.test(otra || '') ? 'Si' : 'No'
  return null
}

/**
 * Fechas coherentes con la categoría (muta `f`): con B1 no hay fecha D1, y
 * fecha_categoria_licencia toma la fecha de la categoría actual (con Otros es la que
 * se cargó). Con Otros las fechas B1 / D1 que hubiera se conservan.
 */
export function ajustarFechasLicencia(f: Record<string, unknown>): void {
  if (f.categoria_licencia === 'B1') {
    f.fecha_licencia_d1 = null
    f.fecha_categoria_licencia = f.fecha_licencia_b1 || null
  } else if (f.categoria_licencia === 'D1') {
    f.fecha_categoria_licencia = f.fecha_licencia_d1 || null
  }
}

/**
 * Deja coherentes los campos de licencia antes de guardar (muta `fields`):
 * licencia normalizada a 'Si' / 'No', sin licencia → campos vacíos, el detalle de
 * "Otros" solo con Otros y `d1` sincronizado con la categoría.
 * No toca categorias_licencia (histórico).
 */
export function normalizarLicenciaAlGuardar(fields: Record<string, unknown>): void {
  const estado = estadoLicencia(fields.licencia as string | null)
  fields.licencia = estado === 'si' ? 'Si' : estado === 'no' ? 'No' : null
  if (estado === 'no') {
    fields.numero_licencia = null
    fields.vencimiento_licencia = null
    fields.categoria_licencia = null
    fields.categoria_licencia_otra = null
    fields.fecha_categoria_licencia = null
    fields.fecha_licencia_b1 = null
    fields.fecha_licencia_d1 = null
    fields.d1 = 'No'
    return
  }
  if (fields.categoria_licencia !== 'Otros') fields.categoria_licencia_otra = null
  ajustarFechasLicencia(fields)
  const d1 = d1DesdeCategoria(fields.categoria_licencia as string | null, fields.categoria_licencia_otra as string | null)
  if (d1) fields.d1 = d1
}

/**
 * Códigos del catálogo licencias_categorias que corresponden a la categoría del lead,
 * para pasarlos al conductor. Con "Otros" se toman los códigos que aparezcan en el
 * texto (ej. "D3" o "B2 y D2.1"); el texto completo se conserva en el lead.
 */
export function codigosCategoriaParaConductor(
  categoria: string | null | undefined,
  otra: string | null | undefined,
  codigosCatalogo: string[],
): string[] {
  if (categoria === 'B1' || categoria === 'D1') return [categoria]
  if (categoria !== 'Otros' || !otra?.trim()) return []
  const tokens = new Set(otra.toUpperCase().split(/[\s,;/]+/).filter(Boolean))
  return codigosCatalogo.filter(c => tokens.has(c.toUpperCase()))
}

/**
 * Categoría a partir de un texto libre de licencia (ej. la columna "LICENCIA - CLASES"
 * del Excel: "B1 D1", "D1", "A1.4, B1", "D3"). Regla: si aparece D1 → D1 (aunque
 * también tenga B1); si no y aparece B1 → B1; cualquier otra clase → Otros con el texto.
 * Devuelve null si el texto no dice la categoría ("Si", "No", vacío).
 */
export function categoriaDesdeTexto(
  texto: string | null | undefined,
): { categoria: CategoriaLicenciaLead; otra: string | null } | null {
  const t = (texto || '').trim()
  if (!t) return null
  const tokens = t.toUpperCase().split(/[\s,;/.-]+/).filter(Boolean)
  // "D1" también aparece como "D.1": se unen letra y número sueltos
  const clases = new Set(tokens.map((tok, i) => (/^[A-E]$/.test(tok) && /^\d/.test(tokens[i + 1] || '') ? tok + tokens[i + 1] : tok)))
  if (clases.has('D1')) return { categoria: 'D1', otra: null }
  if (clases.has('B1')) return { categoria: 'B1', otra: null }
  if (!/\b[A-E]\s*\d/i.test(t)) return null
  return { categoria: 'Otros', otra: t }
}

/**
 * Clases de licencia de una persona: el histórico (códigos o descripciones
 * "Licencia categoría X") + la categoría actual (con "Otros", los códigos del texto).
 */
export function clasesDeLicencia(
  historico: (string | null | undefined)[],
  categoria: string | null | undefined,
  otra: string | null | undefined,
): string[] {
  const clases = new Set<string>()
  for (const h of historico) {
    const codigo = (h || '').replace(/^Licencia categor[ií]a\s*/i, '').trim().toUpperCase()
    if (codigo) clases.add(codigo)
  }
  if (categoria === 'B1' || categoria === 'D1') clases.add(categoria)
  if (categoria === 'Otros') {
    for (const t of (otra || '').toUpperCase().split(/[\s,;/]+/)) if (/^[A-E]\d/.test(t)) clases.add(t)
  }
  return [...clases].sort()
}

/**
 * Avisos para revisar la licencia (pedido 2026-11-11):
 *   - Tiene profesional D2 / D2.1 / D3 / D4 pero no D1.
 *   - Tiene otras clases pero no B1 (ni D1).
 * No bloquean el guardado: son para que alguien lo verifique.
 */
export function alertasLicencia(clases: string[]): string[] {
  const set = new Set(clases.map(c => c.toUpperCase()))
  const alertas: string[] = []
  const profesionales = [...set].filter(c => /^D[2-4]/.test(c))
  if (profesionales.length > 0 && !set.has('D1')) {
    alertas.push(`Tiene ${profesionales.join(', ')}, pero no tiene D1, revisar`)
  }
  const otras = [...set].filter(c => c !== 'B1' && c !== 'D1')
  if (otras.length > 0 && !set.has('B1') && !set.has('D1')) {
    alertas.push(`Tiene ${otras.join(', ')}, pero no tiene B1, revisar`)
  }
  return alertas
}
