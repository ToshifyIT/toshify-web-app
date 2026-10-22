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

/** Guía con su nombre homologado; si no está en la lista, el valor tal cual (sin espacios de más). */
export function homologarGuia(valor: string | null | undefined): string | null {
  const limpio = (valor || '').replace(/\s+/g, ' ').trim()
  if (!limpio) return null
  return GUIA_HOMOLOGADA[normalizarTexto(limpio)] ?? limpio
}
