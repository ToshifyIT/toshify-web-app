// src/modules/leads/leadMotivos.ts
//
// Clasificación de causal_de_cierre en un motivo legible. Vive fuera de
// LeadDetailView porque la consume también LeadsModule (export a Excel) y un
// archivo de componentes no puede exportar funciones sueltas sin romper el fast
// refresh (react-refresh/only-export-components). Misma convención que
// leadEstadoColors.ts.

/** Clasifica causal_de_cierre en motivo legible (solo para "No le interesa") */
export function clasificarMotivoDesinteres(causal: string | null | undefined): string {
  if (!causal) return 'Otro'
  const t = causal.toLowerCase()
  if (/price|precio|caro|costoso|plata|alcanza|expensive|cost|dinero|pagar|cobr|tarifa|alquiler/.test(t)) return 'Precio de alquiler'
  if (/disagreement|condicion|turno|conviene|oferta|acuerdo|horario|regla|requisito|policy|condition|schedule/.test(t)) return 'Desacuerdo con oferta'
  return 'Otro'
}
