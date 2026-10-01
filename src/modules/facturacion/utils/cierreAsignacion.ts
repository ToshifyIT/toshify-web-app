// src/modules/facturacion/utils/cierreAsignacion.ts
// Cobro del día en que un vehículo sale de servicio (hora Argentina).
//
// Aplica SOLO a los cierres hechos desde Vehículos al cambiar el estado del auto (taller,
// siniestro, destrucción, etc.). Esos cierres dejan en la asignación la nota
// NOTA_CIERRE_VEHICULO. Devoluciones, cambios de vehículo y bajas de conductor siguen
// como siempre.
//
// Desde CIERRE_VIGENCIA_DESDE, el día del cierre:
//   - NOCTURNO: no se cobra (no tiene auto para su turno). Si recibe otro auto ese mismo
//               día, se cobra completo: la regla de empalme ya le asigna el día a la
//               asignación nueva.
//   - DIURNO:   cierre antes de la hora de corte (18:00) → se descuenta medio turno;
//               a la hora de corte o después → se cobra completo. Con o sin reemplazo.
//   - A CARGO:  se descuenta medio turno, a cualquier hora, con o sin reemplazo.
//
// No modifica el descuento por hora de entrega.
// La usan los tres cálculos de días de Facturación (Vista Previa, Recálculo y Desglose de
// días). Si se cambia acá, cambia en los tres.

const ARG_TZ = 'America/Argentina/Buenos_Aires'

/** Cierres con fecha (Argentina) anterior a esta no cambian: se cobran como siempre. */
export const CIERRE_VIGENCIA_DESDE = '2026-10-01'

/** Prefijo de la nota que deja Vehículos al finalizar asignaciones por cambio de estado. */
export const NOTA_CIERRE_VEHICULO = '[FINALIZADA] Cambio de estado a'

export const CIERRE_DEFAULTS = {
  /** Hora (0-23, Argentina): cierres del diurno ANTES de esta hora tienen descuento. */
  horaCorteDiurno: 18,
  /** Turnos descontados al diurno si el cierre es antes de la hora de corte. */
  descuentoDiurno: 0.5,
  /** Turnos descontados al conductor a cargo. */
  descuentoCargo: 0.5,
}

export interface ParamsCierre {
  horaCorteDiurno: number
  descuentoDiurno: number
  descuentoCargo: number
}

export interface CierreAsignacion {
  /** Fecha del cierre en Argentina, yyyy-MM-dd */
  fecha: string
  /** Hora del cierre en Argentina, HH:mm */
  hora: string
  /** Hora del cierre en Argentina, 0-23 */
  horaNum: number
}

const fechaFmt = new Intl.DateTimeFormat('en-CA', { timeZone: ARG_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
const horaFmt = new Intl.DateTimeFormat('en-GB', { timeZone: ARG_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/**
 * Timestamp del cierre efectivo: el más temprano entre el del conductor y el de la
 * asignación (mismo criterio que el conteo de días, que usa el menor de los dos).
 */
export function timestampCierre(finConductor: string | null | undefined, finAsignacion: string | null | undefined): string | null {
  const a = finConductor || null
  const b = finAsignacion || null
  if (a && b) return new Date(a).getTime() <= new Date(b).getTime() ? a : b
  return a || b
}

/**
 * Fecha y hora del cierre si la asignación la cerró Vehículos por cambio de estado desde
 * la fecha de vigencia; si no, null.
 */
export function evaluarCierre(
  timestamp: string | null | undefined,
  notasAsignacion: string | null | undefined,
): CierreAsignacion | null {
  if (!timestamp || !(notasAsignacion || '').includes(NOTA_CIERRE_VEHICULO)) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(timestamp)) return null
  const d = new Date(timestamp)
  if (Number.isNaN(d.getTime())) return null
  const fecha = fechaFmt.format(d)
  if (fecha < CIERRE_VIGENCIA_DESDE) return null
  const hora = horaFmt.format(d)
  return { fecha, hora, horaNum: Number.parseInt(hora.slice(0, 2), 10) }
}

/** Turnos a descontar el día del cierre (diurno y a cargo). El nocturno se resuelve sin cobrar el día. */
export function descuentoCierre(
  modalidad: 'TURNO_DIURNO' | 'TURNO_NOCTURNO' | 'CARGO',
  cierre: CierreAsignacion,
  params: ParamsCierre,
): number {
  if (modalidad === 'CARGO') return Math.max(0, params.descuentoCargo)
  if (modalidad === 'TURNO_DIURNO') return cierre.horaNum < params.horaCorteDiurno ? Math.max(0, params.descuentoDiurno) : 0
  return 0
}
