// src/types/programacionPrecarga.types.ts
//
// Payload que viaja desde "Distribucion en mapa v2" hacia "Programaciones v2"
// cuando el operador toca "Programar entrega" sobre un par sugerido.
//
// Vive en `types/` y no dentro de alguno de los dos modulos para que ninguno
// dependa del otro: el mapa arma el objeto, programaciones lo consume, y el
// contrato queda en un tercer lugar neutral.
//
// IMPORTANTE: el payload tiene que ser serializable (nada de clases, funciones
// ni Date). Viaja de dos maneras:
//  - en la MISMA pestania, por `location.state` de react-router;
//  - a una pestania NUEVA, por localStorage con un id en el query string,
//    porque `location.state` no cruza un window.open.

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


// ---------------------------------------------------------------------------
// Traspaso a una pestania nueva
// ---------------------------------------------------------------------------
//
// "Programar entrega" abre Programaciones v2 en otra pestania para no perder el
// trabajo del mapa. `location.state` no sobrevive a un window.open, asi que el
// par se deja en localStorage bajo un id de un solo uso que viaja en la URL.
//
// Se usa localStorage y no sessionStorage porque la copia de sessionStorage a
// la pestania nueva depende de como se abrio y no es confiable.
//
// La entrada se borra apenas se lee y, por las dudas, vence a los 5 minutos:
// lleva nombres y DNIs, no tiene por que quedar ahi.

const PREFIJO_PRECARGA = 'toshify.precargaParMapa.'
const TTL_PRECARGA_MS = 5 * 60 * 1000

/**
 * Ultimo traspaso leido, en memoria.
 *
 * React en modo estricto monta el efecto, lo desmonta y lo vuelve a montar.
 * Como `tomarPrecargaPar` BORRA la entrada al leerla, la segunda corrida
 * encontraba localStorage vacio y dejaba el par en null: el wizard se abria sin
 * precargar nada. Recordando el ultimo id leido, la segunda corrida devuelve lo
 * mismo que la primera.
 */
let ultimoTraspaso: { id: string; par: PrecargaParMapa } | null = null

/** Borra los traspasos vencidos o corruptos que hayan quedado dando vueltas. */
function limpiarPrecargasVencidas(): void {
  try {
    const ahora = Date.now()
    const aBorrar: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const clave = localStorage.key(i)
      if (!clave || !clave.startsWith(PREFIJO_PRECARGA)) continue
      try {
        const dato = JSON.parse(localStorage.getItem(clave) || '{}') as { ts?: number }
        if (!dato?.ts || ahora - dato.ts > TTL_PRECARGA_MS) aBorrar.push(clave)
      } catch {
        aBorrar.push(clave)
      }
    }
    aBorrar.forEach((c) => localStorage.removeItem(c))
  } catch {
    /* sin localStorage no hay nada que limpiar */
  }
}

/**
 * Deja el par listo para que lo tome otra pestania.
 * Devuelve el id que hay que poner en la URL, o null si no se pudo guardar
 * (modo privado, cuota llena): ahi el llamador cae a navegar en la misma
 * pestania, que no necesita storage.
 */
export function guardarPrecargaPar(par: PrecargaParMapa): string | null {
  try {
    limpiarPrecargasVencidas()
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    localStorage.setItem(PREFIJO_PRECARGA + id, JSON.stringify({ ts: Date.now(), par }))
    return id
  } catch {
    return null
  }
}

/**
 * Lee el par guardado y lo BORRA en el mismo acto: es de un solo uso, para que
 * un refresh de la pestania nueva no vuelva a abrir el wizard con el mismo par.
 */
export function tomarPrecargaPar(id: string): PrecargaParMapa | null {
  // Segunda corrida del mismo efecto (modo estricto): la entrada ya se borro,
  // pero el par sigue siendo el mismo.
  if (ultimoTraspaso?.id === id) return ultimoTraspaso.par
  try {
    const clave = PREFIJO_PRECARGA + id
    const crudo = localStorage.getItem(clave)
    localStorage.removeItem(clave)
    if (!crudo) return null
    const dato = JSON.parse(crudo) as { ts?: number; par?: PrecargaParMapa }
    if (!dato?.par || !dato.ts || Date.now() - dato.ts > TTL_PRECARGA_MS) return null
    ultimoTraspaso = { id, par: dato.par }
    return dato.par
  } catch {
    return null
  }
}
