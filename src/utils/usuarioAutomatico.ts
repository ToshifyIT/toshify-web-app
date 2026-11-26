// src/utils/usuarioAutomatico.ts
// Nombre con el que se muestra lo que hace el sistema solo (por ejemplo, el cruce de las
// transferencias de Cresium): R2DT, el asistente de automatizaciones de Toshify.
// Pedido 2026-11-26. Los movimientos viejos quedaron guardados como "Automático" o
// "Automático (Cresium)": se muestran también como R2DT.

export const USUARIO_AUTOMATICO = 'R2DT'

/** Nombre del usuario para mostrar: los automáticos salen como R2DT. */
export function usuarioVisible(nombre: string | null | undefined, sinNombre = 'Sistema'): string {
  const n = String(nombre || '').trim()
  if (!n) return sinNombre
  return /^autom[aá]tico\b/i.test(n) ? USUARIO_AUTOMATICO : n
}
