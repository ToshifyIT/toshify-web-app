// =====================================================================
// CANDADO DE RECÁLCULO DE PERÍODOS
// =====================================================================
// El estado 'procesando' de periodos_facturacion actúa como candado, pero
// quien lo toma es un proceso que vive en el navegador. Si esa pestaña
// muere (F5, cierre, suspensión del equipo, corte de red) nadie lo libera.
//
// Por eso el candado tiene:
//   - dueño      (procesando_por)     -> se le muestra a quien espera
//   - antigüedad (procesando_desde)   -> permite vencerlo pasado el TTL
//   - llave      (lock_token)         -> impide que un proceso zombie
//                                        libere o pise la corrida de otro
//
// Ver sql/add_lock_periodos_facturacion.sql
// =====================================================================

/** Un candado más viejo que esto se considera huérfano y puede tomarse. */
export const LOCK_TTL_MINUTOS = 10

/** Cada cuántos conductores se refresca el heartbeat + progreso. */
export const HEARTBEAT_CADA = 10

export interface PeriodoConLock {
  estado?: string
  procesando_desde?: string | null
  procesando_por?: string | null
  lock_token?: string | null
  procesando_actual?: number | null
  procesando_total?: number | null
}

/**
 * Momento a partir del cual un candado se considera vencido.
 * Se usa en el `.or()` de la adquisición: `procesando_desde.lt.<este valor>`.
 */
export function lockVencidoAntesDe(): string {
  return new Date(Date.now() - LOCK_TTL_MINUTOS * 60_000).toISOString()
}

/** Minutos transcurridos desde que se tomó el candado. */
export function minutosDesde(iso?: string | null): number {
  if (!iso) return Number.POSITIVE_INFINITY
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY
  return (Date.now() - t) / 60_000
}

/** El período tiene un candado tomado y todavía vigente. */
export function lockVigente(p?: PeriodoConLock | null): boolean {
  return !!p && p.estado === 'procesando' && minutosDesde(p.procesando_desde) <= LOCK_TTL_MINUTOS
}

/** El período quedó marcado como procesando por una ejecución muerta. */
export function lockHuerfano(p?: PeriodoConLock | null): boolean {
  return !!p && p.estado === 'procesando' && minutosDesde(p.procesando_desde) > LOCK_TTL_MINUTOS
}

/** Genera la llave de la ejecución (fencing token). */
export function nuevoLockToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback para contextos no seguros / navegadores sin randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
    const r = (Math.random() * 16) | 0
    const v = ch === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/** Campos a escribir para soltar el candado. Siempre con `.eq('lock_token', miToken)`. */
export function camposLockLiberado() {
  return {
    procesando_desde: null,
    procesando_por: null,
    lock_token: null,
    procesando_actual: null,
    procesando_total: null,
  }
}

/** Filtro PostgREST para tomar el candado: libre O vencido.
 *
 *  El timestamp VA ENTRE COMILLAS DOBLES a proposito. Dentro de `or=(...)`
 *  PostgREST trata `,` `.` `:` `(` `)` como caracteres reservados, y un ISO
 *  como 2026-08-12T20:05:30.123Z tiene `:` y `.`: sin comillas el filtro se
 *  parsea mal y el UPDATE no afecta ninguna fila (o devuelve 400). Como el
 *  llamador solo mira `data`, eso se veia como "otro usuario tomo el periodo".
 */
export function filtroCandadoDisponible(): string {
  return `estado.eq.abierto,procesando_desde.lt."${lockVencidoAntesDe()}"`
}
