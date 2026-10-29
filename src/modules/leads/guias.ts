// src/modules/leads/guias.ts
//
// Nombre homologado de los guías (columna Guía = leads.entrevistador_asignado).
// Mismas equivalencias que sql/homologar_guias_leads.sql, para que la carga
// masiva guarde el guía igual que como quedó la base:
//   Ali, Camila, Sara, Ali Verenzuela -> Ali Verenzuela
//   Carla, Carla Noguera              -> Carla Noguera
//   Eunice, Eunice D'Urso             -> Eunice D'Urso
// Cualquier otro valor (p. ej. Manuel, Marina) se deja tal cual.

import { normalizarTexto } from '../../utils/sedeMatch'

const GUIA_HOMOLOGADA: Record<string, string> = {
  'ali': 'Ali Verenzuela',
  'camila': 'Ali Verenzuela',
  'sara': 'Ali Verenzuela',
  'ali verenzuela': 'Ali Verenzuela',
  'carla': 'Carla Noguera',
  'carla noguera': 'Carla Noguera',
  'eunice': "Eunice D'Urso",
  "eunice d'urso": "Eunice D'Urso",
}

/**
 * Guías que ya no están activos (pedido 2026-10-22). Los leads que los tienen los
 * siguen mostrando, pero no se ofrecen para asignar ni para filtrar en el mapa.
 */
const GUIAS_INACTIVOS: ReadonlySet<string> = new Set(['manuel', 'marina'])

/** false si el guía está dado de baja (ver GUIAS_INACTIVOS). */
export function esGuiaActivo(nombre: string | null | undefined): boolean {
  return !GUIAS_INACTIVOS.has(normalizarTexto(nombre))
}

/** Guía con su nombre homologado; si no está en la lista, el valor tal cual (sin espacios de más). */
export function homologarGuia(valor: string | null | undefined): string | null {
  const limpio = (valor || '').replace(/\s+/g, ' ').trim()
  if (!limpio) return null
  return GUIA_HOMOLOGADA[normalizarTexto(limpio)] ?? limpio
}

/** Guías válidos para el conductor (primer nombre, sin acentos). */
const GUIAS_CONDUCTOR: ReadonlySet<string> = new Set(['ali', 'manuel', 'marina', 'carla', 'eunice'])

/**
 * Guía que queda en conductores.guia al convertir un lead: el guía del lead
 * (leads.entrevistador_asignado) si es Ali, Manuel, Marina, Carla o Eunice; si no
 * tiene o es otro valor, el usuario que hizo la conversión.
 * Mismo criterio que sql/conductores_guia.sql (carga de los conductores que ya existen).
 */
export function guiaParaConductor(guiaLead: string | null | undefined, usuarioConversion: string | null | undefined): string | null {
  const guia = homologarGuia(guiaLead)
  if (guia && GUIAS_CONDUCTOR.has(normalizarTexto(guia).split(' ')[0])) return guia
  const usuario = (usuarioConversion || '').replace(/\s+/g, ' ').trim()
  return usuario && normalizarTexto(usuario) !== 'sistema' ? usuario : null
}
