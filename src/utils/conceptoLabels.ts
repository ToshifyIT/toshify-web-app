// src/utils/conceptoLabels.ts
//
// Etiqueta legible de un concepto de facturacion a partir de su codigo y su
// descripcion guardada. Extraido de PortalPage para poder reusarlo desde el
// panel de conductores sin duplicar la regla: el portal es la fuente de verdad
// de como se le muestran los conceptos al conductor, y el panel interno tiene
// que mostrar exactamente lo mismo. Si esto cambia, cambia en las dos vistas.

/** Minimo que necesita getConceptoLabel de una fila de facturacion_detalle. */
export interface ConceptoFacturable {
  concepto_codigo: string
  concepto_descripcion?: string | null
}

// Mapeo de códigos de concepto a descripciones legibles
export const CONCEPTO_LABELS: Record<string, string> = {
  P001: 'Alquiler Turno Diurno',
  P002: 'Alquiler a Cargo',
  P003: 'Cuota de Garantía',
  P004: 'Descuento a Favor',
  P005: 'Peajes',
  P006: 'Exceso de KM',
  P007: 'Penalidades',
  P008: 'Multas de Tránsito',
  P009: 'Mora',
  P010: 'Repuestos/Daños',
  P011: 'Publicidad Cabify',
  P012: 'Publicidad Tablet',
  P013: 'Alquiler Turno Nocturno',
  P014: 'Alquiler Turno Diurno Sin GNC',
  P015: 'Alquiler Turno Nocturno Sin GNC',
  P016: 'Alquiler a Cargo Sin GNC',
}

/** Siempre mostrar el label del concepto para códigos conocidos.
 *  Si la descripción aporta info adicional (cuota, plan de pagos), se agrega. */
export function getConceptoLabel(item: ConceptoFacturable): string {
  const desc = item.concepto_descripcion?.trim()
  const baseLabel = CONCEPTO_LABELS[item.concepto_codigo]

  // Si no tenemos label para este código, usar la descripción tal cual
  if (!baseLabel) return desc || item.concepto_codigo

  // P003 = Cuota de Garantía: mostrar solo el label base
  if (item.concepto_codigo === 'P003') {
    return baseLabel
  }

  // P010 = Plan de Pagos: agregar descripción si es informativa (ej: "valor de multas 678.733,50")
  if (item.concepto_codigo === 'P010' && desc && !/^\d+([,.]\d+)?$/.test(desc)) {
    return `${baseLabel} - ${desc}`
  }

  // P004 = Tickets: mostrar detalle descriptivo, eliminando prefijo redundante "Ticket:"
  if (item.concepto_codigo === 'P004') {
    if (desc) {
      // Quitar prefijo "Ticket:" o "Ticket: " para no repetir
      const cleanDesc = desc.replace(/^Ticket:\s*/i, '').trim()
      if (cleanDesc && cleanDesc !== baseLabel) return `${baseLabel} (${cleanDesc})`
    }
    return baseLabel
  }

  // Para códigos con descripción informativa (fechas, detalles), agregar entre paréntesis
  // Ej: P005 "29/01/2026 al 01/02/2026" → "Peajes (29/01/2026 al 01/02/2026)"
  if (desc && desc !== baseLabel && !/^\d+([,.]\d+)?$/.test(desc)) {
    return `${baseLabel} (${desc})`
  }

  return baseLabel
}
