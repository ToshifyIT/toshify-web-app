// src/modules/onboarding/distribucion-mapa-v2/medicionesCacheService.ts
//
// Caché PERSISTENTE de mediciones de ruta (segundo nivel, detrás del Map en
// memoria de emparejamientoService).
//
// Por qué existe: Distance Matrix se cobra por elemento y el tiempo que pide
// este módulo es determinístico (se consulta sin hora de salida). Entonces un
// tramo medido una vez vale para siempre, y guardarlo en la base hace que:
//   - sobreviva al refresh de la página, que antes borraba todo;
//   - lo aprovechen TODOS los operadores, no sólo el que lo pagó.
//
// Degradación: si la tabla no existe, RLS la bloquea o Supabase falla, estas
// funciones devuelven vacío / no escriben y el módulo sigue andando igual que
// antes (midiendo contra la API). Nunca tiran una excepción hacia arriba.

import { supabase } from '../../../lib/supabase'

export interface MedicionPersistida {
  distanciaKm: number
  tiempoMinutos: number
}

/** Tabla del caché. Ver sql/mediciones_rutas_table.sql */
const TABLA = 'mediciones_rutas'

/**
 * Claves por request. PostgREST arma un `.in()` sobre la URL, así que un lote
 * muy grande la haría explotar por largo. Con claves de ~45 caracteres, 100
 * entran cómodas.
 */
const LOTE_CLAVES = 100

/**
 * Vencimiento de una medición. Las calles no cambian seguido, pero una obra o
 * una autopista nueva sí pueden alterar un tiempo: a los 6 meses se vuelve a
 * medir. Las filas vencidas quedan en la tabla sin molestar.
 */
const TTL_MESES = 6

/**
 * Si la tabla no está disponible se deja de intentar por el resto de la
 * sesión, para no repetir una consulta que ya sabemos que falla en cada
 * corrida.
 */
let cacheDisponible = true

function fechaMinima(): string {
  const d = new Date()
  d.setMonth(d.getMonth() - TTL_MESES)
  return d.toISOString()
}

function enLotes<T>(items: T[], tamano: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += tamano) out.push(items.slice(i, i + tamano))
  return out
}

/**
 * Trae del caché persistente las mediciones vigentes de las claves pedidas.
 * Lo que no esté (o esté vencido) simplemente no viene en el Map.
 */
export async function leerMediciones(
  claves: string[]
): Promise<Map<string, MedicionPersistida>> {
  const out = new Map<string, MedicionPersistida>()
  if (!cacheDisponible || claves.length === 0) return out

  const desde = fechaMinima()

  try {
    const respuestas = await Promise.all(
      enLotes(claves, LOTE_CLAVES).map((lote) =>
        supabase
          .from(TABLA)
          .select('clave, distancia_km, tiempo_minutos')
          .in('clave', lote)
          .gte('creado_en', desde)
      )
    )

    for (const { data, error } of respuestas) {
      if (error) {
        // Tabla inexistente o sin permisos: se apaga el caché y se sigue.
        console.warn('[medicionesCache] lectura deshabilitada:', error.message)
        cacheDisponible = false
        return new Map()
      }
      for (const fila of (data || []) as Array<{
        clave: string
        distancia_km: number | string
        tiempo_minutos: number
      }>) {
        const km = Number(fila.distancia_km)
        if (!Number.isFinite(km) || !Number.isFinite(fila.tiempo_minutos)) continue
        out.set(fila.clave, { distanciaKm: km, tiempoMinutos: fila.tiempo_minutos })
      }
    }
  } catch (err) {
    console.warn('[medicionesCache] error leyendo:', err)
    cacheDisponible = false
    return new Map()
  }

  return out
}

/**
 * Guarda mediciones nuevas. Es deliberadamente "fire and forget": la pantalla
 * no espera a que termine, porque el resultado ya lo tiene en memoria y que la
 * escritura falle no debe frenar ni romper nada.
 *
 * `upsert` con ignoreDuplicates resuelve el empate cuando dos operadores miden
 * el mismo tramo al mismo tiempo.
 */
export function guardarMediciones(
  entradas: Array<{ clave: string; distanciaKm: number; tiempoMinutos: number }>
): void {
  if (!cacheDisponible || entradas.length === 0) return

  const filas = entradas.map((e) => ({
    clave: e.clave,
    distancia_km: e.distanciaKm,
    tiempo_minutos: e.tiempoMinutos,
  }))

  void (async () => {
    try {
      const { error } = await supabase
        .from(TABLA)
        .upsert(filas, { onConflict: 'clave', ignoreDuplicates: true })
      if (error) {
        console.warn('[medicionesCache] escritura deshabilitada:', error.message)
        cacheDisponible = false
      }
    } catch (err) {
      console.warn('[medicionesCache] error guardando:', err)
      cacheDisponible = false
    }
  })()
}
