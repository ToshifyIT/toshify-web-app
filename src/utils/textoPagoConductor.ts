// src/utils/textoPagoConductor.ts
// Cómo se le muestra un pago al conductor en su factura: Facturación (detalle), Seguimiento
// de conductores (detalle de la semana) y Mi espacio (pantalla y PDF). Pedido 2026-11-26:
// solo el tipo de pago y la fecha ("Transferencia bancaria 25/11"), sin quién lo envió ni a
// qué cuenta entró (Grupo CG, 44 Dreams): al conductor no le sirve y el nombre puede ser de
// otra persona (un familiar, un tercero).
//
// Se reconoce por la referencia guardada en el kardex (control_saldos.referencia):
//   · transferencias: "Transferencia bancaria...", "Pago B1 · ... | Cresium ...";
//   · efectivo: "Pago en efectivo...", "Pago en efectivo - B1 | ...", "Pago B1 · ... | Carga manual".
// El resto de los movimientos (Cabify, DiDi, cuotas, ajustes) se muestran como siempre.

export type ClasePagoConductor = 'Transferencia bancaria' | 'Pago en efectivo'

/** Tipos del kardex que son pagos del conductor (los demás no se tocan). */
const TIPOS_PAGO = new Set(['pago_manual', 'pago_efectivo', 'pago'])

/**
 * "Transferencia bancaria" o "Pago en efectivo" si el pago es de esa clase; null si no (se
 * muestra con su etiqueta y referencia de siempre). `tipo` es control_saldos.tipo_movimiento
 * (null cuando la vista no lo tiene: se mira solo la referencia).
 */
export function clasePagoConductor(tipo: string | null | undefined, referencia: string | null | undefined): ClasePagoConductor | null {
  if (tipo && !TIPOS_PAGO.has(tipo)) return null
  const ref = String(referencia || '')
  if (/transferencia/i.test(ref) || (/^Pago B1\b/i.test(ref) && /Cresium/i.test(ref))) return 'Transferencia bancaria'
  if (/efectivo/i.test(ref) || /^Pago B1\b/i.test(ref) || tipo === 'pago_efectivo') return 'Pago en efectivo'
  return null
}

/**
 * Texto del pago sin la fecha: "Transferencia bancaria", "Pago en efectivo" o, para los
 * demás, "<etiqueta del tipo> · <referencia>".
 */
export function textoPagoConductor(
  tipo: string | null | undefined,
  referencia: string | null | undefined,
  etiqueta: string,
): string {
  const clase = clasePagoConductor(tipo, referencia)
  if (clase) return clase
  return referencia ? `${etiqueta} · ${referencia}` : etiqueta
}

/** dd/mm de una fecha (yyyy-MM-dd o timestamp), en hora Argentina. */
export function diaMesPago(fecha: string | null | undefined): string {
  if (!fecha) return ''
  const d = fecha.length <= 10 ? new Date(`${fecha}T12:00:00-03:00`) : new Date(fecha)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })
}
