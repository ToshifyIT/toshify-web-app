// src/modules/integraciones/didi/didiService.ts
// Integraciones > DiDi: datos de los conductores en DiDi Fleet por semana (sql/didi_integracion.sql).
//
// La carga es por Excel: «Informe de ganancias» e «Informe de viaje» de DiDi Fleet (DiDi los
// manda por email con «Descargar informe»). Las columnas se reconocen por su nombre, así no
// importa el orden. El Excel no trae DNI ni fechas: se importa en la semana elegida en
// pantalla y el conductor se cruza por nombre (o por el vínculo guardado en didi_conductores).
import * as XLSX from 'xlsx'
import { supabase } from '../../../lib/supabase'
import { normalizeNombre } from '../../../utils/normalizeDocuments'

export type TipoInforme = 'ganancias' | 'viajes'

export interface FilaDidi {
  id: string
  anio: number
  semana: number
  nombre_didi: string
  nombre_norm: string
  conductor_id: string | null
  viajes_pagados: number | null
  ganancia_total: number | null
  ganancia_efectivo: number | null
  ganancia_tarjeta: number | null
  efectivo_conductor: number | null
  impuesto: number | null
  cargo_tag: number | null
  recompensas: number | null
  deduccion_plataforma: number | null
  horas_en_linea: number | null
  viajes_asignados: number | null
  viajes_aceptados: number | null
  tasa_aceptacion: number | null
  viajes_finalizados: number | null
  tasa_finalizacion: number | null
  cancelados_pasajero: number | null
  cancelados_conductor: number | null
  cancelados_otros: number | null
  viajes_finalizados_pagados: number | null
  total_pagado_finalizados: number | null
  ganancias_importado_en: string | null
  viajes_importado_en: string | null
  importado_por: string | null
  conductor: { nombres: string | null; apellidos: string | null; numero_dni: string | null; email: string | null } | null
}

export interface ConductorSede {
  id: string
  nombres: string | null
  apellidos: string | null
  numero_dni: string | null
}

type Campo = Exclude<keyof FilaDidi,
  'id' | 'anio' | 'semana' | 'nombre_didi' | 'nombre_norm' | 'conductor_id' | 'conductor' |
  'ganancias_importado_en' | 'viajes_importado_en' | 'importado_por'>

/**
 * Columnas de cada informe: nombre de la columna en DiDi (sin acentos, en mayúsculas) → campo.
 * Las más específicas primero: «VIAJES FINALIZADOS Y PAGADOS» antes que «VIAJES FINALIZADOS».
 */
const COLUMNAS: Record<TipoInforme, [string, Campo][]> = {
  ganancias: [
    ['GANANCIAS DE VIAJES PAGADOS EN EFECTIVO', 'ganancia_efectivo'],
    ['GANANCIAS DE VIAJES PAGADOS CON TARJETA', 'ganancia_tarjeta'],
    ['GANANCIAS EN EFECTIVO DEL CONDUCTOR', 'efectivo_conductor'],
    ['GANANCIAS TOTALES DEL CONDUCTOR', 'ganancia_total'],
    ['CARGO POR TAG', 'cargo_tag'],
    ['DEDUCCION DE LA PLATAFORMA', 'deduccion_plataforma'],
    ['VIAJES PAGADOS', 'viajes_pagados'],
    ['RECOMPENSAS', 'recompensas'],
    ['IMPUESTO', 'impuesto'],
  ],
  viajes: [
    ['TOTAL PAGADO EN VIAJES FINALIZADOS', 'total_pagado_finalizados'],
    ['VIAJES FINALIZADOS Y PAGADOS', 'viajes_finalizados_pagados'],
    ['TASA DE VIAJES FINALIZADOS', 'tasa_finalizacion'],
    ['TASA DE ACEPTACION', 'tasa_aceptacion'],
    ['VIAJES CANCELADOS POR EL PASAJERO', 'cancelados_pasajero'],
    ['VIAJES CANCELADOS POR EL CONDUCTOR', 'cancelados_conductor'],
    ['VIAJES CANCELADOS POR OTROS MOTIVOS', 'cancelados_otros'],
    ['TOTAL DE HORAS EN LINEA', 'horas_en_linea'],
    ['VIAJES ASIGNADOS', 'viajes_asignados'],
    ['VIAJES ACEPTADOS', 'viajes_aceptados'],
    ['VIAJES FINALIZADOS', 'viajes_finalizados'],
  ],
}

const CAMPOS_ENTEROS = new Set<Campo>([
  'viajes_pagados', 'viajes_asignados', 'viajes_aceptados', 'viajes_finalizados',
  'cancelados_pasajero', 'cancelados_conductor', 'cancelados_otros', 'viajes_finalizados_pagados',
])

export interface InformeLeido {
  tipo: TipoInforme
  filas: { nombre: string; valores: Partial<Record<Campo, number | null>> }[]
  /** Columnas del informe que no se encontraron en el archivo */
  faltantes: string[]
}

/** Número de una celda: 1.234,56 · 1234.56 · 85% · 12:30 (horas) · "-" o vacío = null */
function numero(valor: unknown): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null
  let t = String(valor ?? '').trim().replace(/[$\s%]/g, '').replace(/^ARS/i, '')
  if (!t || t === '-') return null
  const hm = t.match(/^(\d+):(\d{2})(?::\d{2})?$/)
  if (hm) return Number(hm[1]) + Number(hm[2]) / 60
  // Con coma decimal (1.234,56) o con punto decimal (1,234.56 / 1234.56)
  if (t.includes(',') && (!t.includes('.') || t.lastIndexOf(',') > t.lastIndexOf('.'))) {
    t = t.replace(/\./g, '').replace(',', '.')
  } else {
    t = t.replace(/,/g, '')
  }
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/**
 * Lee un Excel de DiDi Fleet. Reconoce solo cuál de los dos informes es por sus columnas.
 * Saltea la fila de totales («Número de conductores», «Total»).
 */
export async function leerInformeDidi(archivo: File): Promise<InformeLeido> {
  const libro = XLSX.read(await archivo.arrayBuffer(), { type: 'array' })
  const hoja = libro.Sheets[libro.SheetNames[0]]
  if (!hoja) throw new Error('El archivo no tiene hojas')
  const filas = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, defval: '', raw: true })

  const iEncabezado = filas.findIndex(f => f.some(c => normalizeNombre(String(c)) === 'NOMBRE DEL CONDUCTOR'))
  if (iEncabezado < 0) throw new Error('No se encontró la columna «Nombre del conductor». ¿Es un informe de DiDi Fleet?')
  const encabezado = filas[iEncabezado].map(c => normalizeNombre(String(c)))
  const colNombre = encabezado.indexOf('NOMBRE DEL CONDUCTOR')

  const ubicar = (tipo: TipoInforme) => {
    const usadas = new Set<number>()
    const mapa: [number, Campo][] = []
    const faltantes: string[] = []
    for (const [titulo, campo] of COLUMNAS[tipo]) {
      let i = encabezado.findIndex((h, j) => !usadas.has(j) && h === titulo)
      if (i < 0) i = encabezado.findIndex((h, j) => !usadas.has(j) && h.startsWith(titulo))
      if (i < 0) { faltantes.push(titulo); continue }
      usadas.add(i)
      mapa.push([i, campo])
    }
    return { mapa, faltantes }
  }
  const g = ubicar('ganancias')
  const v = ubicar('viajes')
  const tipo: TipoInforme = v.mapa.length > g.mapa.length ? 'viajes' : 'ganancias'
  const { mapa, faltantes } = tipo === 'viajes' ? v : g
  if (mapa.length < 3) throw new Error('No se reconocen las columnas del Informe de ganancias ni del Informe de viaje.')

  const resultado: InformeLeido['filas'] = []
  for (const f of filas.slice(iEncabezado + 1)) {
    const nombre = String(f[colNombre] ?? '').trim()
    const norm = normalizeNombre(nombre)
    if (!norm || norm.startsWith('NUMERO DE CONDUCTORES') || norm === 'TOTAL' || norm.startsWith('TOTAL ')) continue
    const valores: Partial<Record<Campo, number | null>> = {}
    for (const [i, campo] of mapa) {
      const n = numero(f[i])
      valores[campo] = n === null ? null : CAMPOS_ENTEROS.has(campo) ? Math.round(n) : Math.round(n * 100) / 100
    }
    resultado.push({ nombre, valores })
  }
  return { tipo, filas: resultado, faltantes }
}

/** Palabras de un nombre (sin acentos, mayúsculas) */
function palabras(nombre: string): string[] {
  return normalizeNombre(nombre).split(' ').filter(Boolean)
}

/**
 * Conductor de Toshify para un nombre de DiDi. Primero el vínculo guardado; si no, por
 * nombre: mismas palabras en cualquier orden, o todas las de DiDi (al menos 2) dentro del
 * nombre completo de un solo conductor. null si no hay uno claro.
 */
export function cruzarConductor(
  nombreNorm: string,
  conductores: ConductorSede[],
  vinculos: Map<string, string | null>,
): string | null {
  if (vinculos.has(nombreNorm)) return vinculos.get(nombreNorm) ?? null
  const didi = palabras(nombreNorm)
  if (didi.length === 0) return null
  const conPalabras = conductores.map(c => ({ c, p: new Set(palabras(`${c.nombres || ''} ${c.apellidos || ''}`)) }))
  const iguales = conPalabras.filter(x => x.p.size === new Set(didi).size && didi.every(w => x.p.has(w)))
  if (iguales.length === 1) return iguales[0].c.id
  if (didi.length < 2) return null
  const contienen = conPalabras.filter(x => didi.every(w => x.p.has(w)))
  return contienen.length === 1 ? contienen[0].c.id : null
}

type FiltroSede = <T>(query: T, campo?: string) => T

/** Conductores de la sede (para cruzar y para vincular a mano) */
export async function cargarConductoresSede(aplicarFiltroSede: FiltroSede): Promise<ConductorSede[]> {
  const filas: ConductorSede[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await aplicarFiltroSede(
      (supabase.from('conductores') as any).select('id, nombres, apellidos, numero_dni'),
    ).order('id').range(desde, desde + 999)
    if (error) throw error
    filas.push(...(data || []))
    if (!data || data.length < 1000) return filas
  }
}

/** Vínculos guardados: nombre DiDi → conductor */
async function cargarVinculos(): Promise<Map<string, string | null>> {
  const { data, error } = await (supabase.from('didi_conductores') as any).select('nombre_norm, conductor_id')
  if (error) throw error
  return new Map((data || []).map((v: { nombre_norm: string; conductor_id: string | null }) => [v.nombre_norm, v.conductor_id]))
}

/** Filas de una semana (de la sede elegida). null si las tablas todavía no existen. */
export async function cargarSemanaDidi(anio: number, semana: number, aplicarFiltroSede: FiltroSede): Promise<FilaDidi[] | null> {
  const { data, error } = await aplicarFiltroSede(
    (supabase.from('didi_semanal') as any)
      .select('*, conductor:conductores(nombres, apellidos, numero_dni, email)')
      .eq('anio', anio)
      .eq('semana', semana),
  ).order('ganancia_total', { ascending: false, nullsFirst: false })
  if (error) {
    const codigo = (error as { code?: string }).code
    if (codigo === '42P01' || codigo === 'PGRST205') return null
    throw error
  }
  return (data || []) as FilaDidi[]
}

/**
 * Guarda un informe en la semana y sede elegidas (upsert por conductor: cada informe solo
 * pisa sus columnas). Devuelve cuántos conductores quedaron sin cruzar.
 */
export async function importarInformeDidi(params: {
  informe: InformeLeido
  anio: number
  semana: number
  sedeId: string
  conductores: ConductorSede[]
  usuario: string
}): Promise<{ guardados: number; sinCruzar: number }> {
  const { informe, anio, semana, sedeId, conductores, usuario } = params
  const vinculos = await cargarVinculos()
  const ahora = new Date().toISOString()

  // El mismo conductor dos veces en el archivo: se suma (no debería pasar)
  const porNombre = new Map<string, { nombre: string; valores: Partial<Record<Campo, number | null>> }>()
  for (const f of informe.filas) {
    const norm = normalizeNombre(f.nombre)
    const previo = porNombre.get(norm)
    if (!previo) { porNombre.set(norm, { nombre: f.nombre, valores: { ...f.valores } }); continue }
    for (const [k, v] of Object.entries(f.valores) as [Campo, number | null][]) {
      if (v !== null) previo.valores[k] = (previo.valores[k] ?? 0) + v
    }
  }

  let sinCruzar = 0
  const filas = [...porNombre.entries()].map(([norm, f]) => {
    const conductorId = cruzarConductor(norm, conductores, vinculos)
    if (!conductorId) sinCruzar++
    return {
      sede_id: sedeId, anio, semana, nombre_didi: f.nombre, nombre_norm: norm, conductor_id: conductorId,
      ...f.valores,
      [informe.tipo === 'ganancias' ? 'ganancias_importado_en' : 'viajes_importado_en']: ahora,
      importado_por: usuario,
      updated_at: ahora,
    }
  })

  for (let i = 0; i < filas.length; i += 200) {
    const { error } = await (supabase.from('didi_semanal') as any)
      .upsert(filas.slice(i, i + 200), { onConflict: 'sede_id,anio,semana,nombre_norm' })
    if (error) throw error
  }

  // Los cruces automáticos nuevos se guardan como vínculo (no pisan los manuales)
  const nuevos = filas
    .filter(f => f.conductor_id && !vinculos.has(f.nombre_norm))
    .map(f => ({ nombre_norm: f.nombre_norm, nombre_didi: f.nombre_didi, conductor_id: f.conductor_id, origen: 'auto', vinculado_por: usuario }))
  if (nuevos.length) {
    const { error } = await (supabase.from('didi_conductores') as any)
      .upsert(nuevos, { onConflict: 'nombre_norm', ignoreDuplicates: true })
    if (error) console.error('No se pudieron guardar los vínculos DiDi:', error)
  }

  return { guardados: filas.length, sinCruzar }
}

/** Vincula a mano un nombre de DiDi con un conductor (y lo aplica a todas sus semanas). */
export async function vincularConductorDidi(params: {
  nombreNorm: string
  nombreDidi: string
  conductorId: string | null
  usuario: string
}): Promise<void> {
  const { nombreNorm, nombreDidi, conductorId, usuario } = params
  const { error } = await (supabase.from('didi_conductores') as any).upsert({
    nombre_norm: nombreNorm, nombre_didi: nombreDidi, conductor_id: conductorId,
    origen: 'manual', vinculado_por: usuario, updated_at: new Date().toISOString(),
  }, { onConflict: 'nombre_norm' })
  if (error) throw error
  const { error: errorFilas } = await (supabase.from('didi_semanal') as any)
    .update({ conductor_id: conductorId, updated_at: new Date().toISOString() })
    .eq('nombre_norm', nombreNorm)
  if (errorFilas) throw errorFilas
}
