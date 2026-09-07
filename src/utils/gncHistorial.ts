// src/utils/gncHistorial.ts
//
// Evaluacion del GNC de un vehiculo en una fecha dada, segun el historial de
// instalaciones/desinstalaciones (tabla vehiculos_gnc_historial).
//
// Extraido de ReporteFacturacionTab para poder reusarlo desde otros modulos
// (Asignaciones) sin duplicar la regla. La logica es identica a la original:
// si esto cambia, cambia tambien el calculo de facturacion.

/** Fila de vehiculos_gnc_historial. `accion` es 'instalacion' | 'desinstalacion'. */
export type GncHistorialEntry = { vehiculo_id: string; accion: string; fecha: string }

/**
 * Indica si el vehiculo tenia GNC en `fechaStr` (formato YYYY-MM-DD).
 *
 * Regla: CARGO/DIURNO → GNC aplica desde el dia siguiente a la instalacion.
 *        NOCTURNO     → GNC aplica desde el mismo dia de la instalacion.
 * Sin historial → se usa vehiculos.gnc tal cual (mientras no se carguen
 * historiales retroactivos, el boolean actual es la fuente de verdad).
 *
 * `historialMap` debe tener las entradas de cada vehiculo ordenadas por fecha
 * DESCENDENTE (igual que la query `.order('fecha', { ascending: false })`).
 */
export function tieneGncEnFecha(
  vehiculoId: string,
  fechaStr: string,
  modalidad: 'CARGO' | 'TURNO_DIURNO' | 'TURNO_NOCTURNO',
  historialMap: Map<string, GncHistorialEntry[]>,
  gncActual: boolean,
): boolean {
  const historial = historialMap.get(vehiculoId)
  if (!historial || historial.length === 0) {
    // Sin historial: usar boolean actual del vehículo (fuente de verdad mientras
    // no se cargue historial retroactivo)
    return gncActual
  }
  // Buscar último evento con fecha <= fechaStr (ya viene ordenado desc)
  let ultimoEvento: GncHistorialEntry | null = null
  for (const h of historial) {
    if (h.fecha <= fechaStr) { ultimoEvento = h; break }
  }
  if (!ultimoEvento) {
    // fecha es ANTES del primer evento del historial.
    // historial viene ordenado DESC por fecha → último elemento es el más antiguo.
    const primerEvento = historial[historial.length - 1]
    // Si el primer evento fue una instalación, antes de esa fecha el GNC no existía.
    // Si fue una desinstalación, significa que antes tenía GNC.
    return primerEvento.accion !== 'instalacion'
  }
  if (ultimoEvento.accion === 'desinstalacion') return false
  // accion = 'instalacion': aplicar regla según modalidad
  if (modalidad === 'TURNO_NOCTURNO') return fechaStr >= ultimoEvento.fecha // mismo día
  return fechaStr > ultimoEvento.fecha // día siguiente para CARGO/DIURNO
}

/** Arma el Map<vehiculo_id, entradas[]> que espera tieneGncEnFecha. */
export function armarMapaGncHistorial(filas: GncHistorialEntry[] | null | undefined): Map<string, GncHistorialEntry[]> {
  const mapa = new Map<string, GncHistorialEntry[]>()
  for (const h of filas || []) {
    if (!mapa.has(h.vehiculo_id)) mapa.set(h.vehiculo_id, [])
    mapa.get(h.vehiculo_id)!.push(h)
  }
  return mapa
}
