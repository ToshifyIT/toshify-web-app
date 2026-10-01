// src/types/programacionPrecarga.types.ts
//
// Payload que viaja desde "Distribucion en mapa v2" hacia "Programaciones v2"
// cuando el operador toca "Programar entrega" sobre un par sugerido.
//
// Vive en `types/` y no dentro de alguno de los dos modulos para que ninguno
// dependa del otro: el mapa arma el objeto, programaciones lo consume, y el
// contrato queda en un tercer lugar neutral.
//
// IMPORTANTE: este payload viaja por `location.state` de react-router, asi que
// tiene que ser serializable (nada de clases, funciones ni Date).

/** Que es la persona en el momento de armar el par. */
export type TipoPersonaPrecarga = 'conductor' | 'lead'

/** Turno efectivo tal como lo calcula el mapa v2 (ver distribucion-mapa-v2/types.ts). */
export type TurnoPrecarga = 'DIURNO' | 'NOCTURNO' | 'SIN_PREFERENCIA'

/** Un miembro del par, con lo minimo para llenar un slot sin volver a la BD. */
export interface PersonaPrecargaPar {
  id: string
  tipo: TipoPersonaPrecarga
  nombre: string
  dni: string | null
  zona: string | null
  turno: TurnoPrecarga
  /**
   * Patente de la asignacion activa, si la hay. Es solo informativa: el
   * vehiculo real (su id) se resuelve contra la BD en el wizard, porque la
   * patente del mapa sale de una lectura cacheada.
   */
  patenteAsignacion: string | null
}

/** El par completo, tal como lo sugirio el mapa. */
export interface PrecargaParMapa {
  a: PersonaPrecargaPar
  b: PersonaPrecargaPar
  /** Minutos de viaje entre ambos. Alimenta `distancia_diurno/nocturno`. */
  tiempoMinutos: number | null
}

/**
 * Decide quien va a Diurno y quien a Nocturno a partir del turno efectivo.
 *
 * Regla: si alguno tiene preferencia definida y el otro no la contradice, esa
 * preferencia manda. En cualquier otro caso (los dos iguales, los dos sin
 * preferencia) queda `a` en diurno, que es el orden en que el mapa los listo.
 * Siempre es editable a mano despues.
 */
export function repartirTurnosDelPar(
  a: PersonaPrecargaPar,
  b: PersonaPrecargaPar
): { diurno: PersonaPrecargaPar; nocturno: PersonaPrecargaPar } {
  if (a.turno === 'NOCTURNO' && b.turno !== 'NOCTURNO') return { diurno: b, nocturno: a }
  if (b.turno === 'DIURNO' && a.turno !== 'DIURNO') return { diurno: b, nocturno: a }
  return { diurno: a, nocturno: b }
}
