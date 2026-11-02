// src/modules/facturacion/utils/cuentaCabify.ts
// Qué cuenta de Cabify usar cuando un conductor tiene más de una.
//
// Pasa (ej. Piturro): Cabify mantiene la cuenta vieja y la nueva, y las dos se
// sincronizan todos los días. Antes quedaba "el último registro" que devolviera la
// consulta (sin orden), así que el botón de efectivo a veces apuntaba a la cuenta
// que no se usa: mostraba un estado que no era y el cambio fallaba o no servía.
//
// Regla, en este orden:
//   1. La cuenta con actividad (viajes u horas conectadas) más reciente.
//   2. La que trae el DNI real del conductor (no un hash CABIFY_ ni match por nombre).
//   3. La que tiene el registro más reciente.
// Lo usan la carga del reporte y la Vista Previa.

export interface CuentaCabify {
  cabify_driver_id: string
  cabify_company_id: string | null
  permiso_efectivo: string | null   // del registro más reciente de esa cuenta
  ultimoRegistro: string            // fecha_inicio más reciente
  ultimaActividad: string | null    // fecha_inicio más reciente con viajes u horas
  dniCoincide: boolean
}

interface RegistroCabify {
  cabify_driver_id?: string | null
  cabify_company_id?: string | null
  permiso_efectivo?: string | null
  fecha_inicio?: string | null
  viajes_finalizados?: number | string | null
  horas_conectadas?: number | string | null
}

/** Cuentas por conductor: clave del conductor (DNI normalizado) → driver_id → cuenta. */
export type CuentasCabifyPorConductor = Map<string, Map<string, CuentaCabify>>

/** Suma un registro de Cabify a las cuentas del conductor `clave`. */
export function acumularCuentaCabify(
  cuentas: CuentasCabifyPorConductor,
  clave: string,
  registro: RegistroCabify,
  dniCoincide: boolean,
): void {
  const driverId = registro.cabify_driver_id
  if (!driverId) return
  const fecha = registro.fecha_inicio || ''
  const tuvoActividad = (Number(registro.viajes_finalizados) || 0) > 0 || (Number(registro.horas_conectadas) || 0) > 0

  let delConductor = cuentas.get(clave)
  if (!delConductor) {
    delConductor = new Map()
    cuentas.set(clave, delConductor)
  }
  const cuenta = delConductor.get(driverId)
  if (!cuenta) {
    delConductor.set(driverId, {
      cabify_driver_id: driverId,
      cabify_company_id: registro.cabify_company_id || null,
      permiso_efectivo: registro.permiso_efectivo || null,
      ultimoRegistro: fecha,
      ultimaActividad: tuvoActividad ? fecha : null,
      dniCoincide,
    })
    return
  }
  if (fecha > cuenta.ultimoRegistro) {
    cuenta.ultimoRegistro = fecha
    cuenta.permiso_efectivo = registro.permiso_efectivo || null
    cuenta.cabify_company_id = registro.cabify_company_id || cuenta.cabify_company_id
  }
  if (tuvoActividad && fecha > (cuenta.ultimaActividad || '')) cuenta.ultimaActividad = fecha
  if (dniCoincide) cuenta.dniCoincide = true
}

/** La cuenta a usar para el conductor (ver regla arriba), o null si no tiene. */
export function elegirCuentaCabify(cuentas: Map<string, CuentaCabify> | undefined): CuentaCabify | null {
  if (!cuentas || cuentas.size === 0) return null
  let mejor: CuentaCabify | null = null
  for (const c of cuentas.values()) {
    if (!mejor) { mejor = c; continue }
    const actC = c.ultimaActividad || ''
    const actM = mejor.ultimaActividad || ''
    if (actC !== actM) { if (actC > actM) mejor = c; continue }
    if (c.dniCoincide !== mejor.dniCoincide) { if (c.dniCoincide) mejor = c; continue }
    if (c.ultimoRegistro > mejor.ultimoRegistro) mejor = c
  }
  return mejor
}
