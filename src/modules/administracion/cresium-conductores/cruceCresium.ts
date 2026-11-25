// src/modules/administracion/cresium-conductores/cruceCresium.ts
// Cruce de los movimientos de Cresium (cresium_movimientos) con los conductores.
// Un movimiento es de un conductor si coincide, en este orden:
//   1. el CUIT/CUIL del movimiento con el CUIT del conductor
//   2. el DNI que va dentro del CUIL (dígitos 3 a 10) con el DNI del conductor
//   3. la cuenta (CBU/CVU) del movimiento con el CBU del conductor
// Solo lectura: no escribe nada en la base.
import { supabase } from '../../../lib/supabase'
import type { EmpresaCresium } from '../../../services/cresiumService'

export type CriterioCruce = 'cuit' | 'dni' | 'cbu' | 'asignado'

export interface ConductorCruce {
  id: string
  nombres: string | null
  apellidos: string | null
  numero_dni: string | null
  numero_cuit: string | null
  cbu: string | null
  estado: string | null
}

export interface MovimientoCruce {
  cresium_id: number
  empresa: EmpresaCresium
  fecha: string | null
  direccion: 'entrada' | 'salida'
  tipo: string | null
  contraparte: string | null
  cuit: string | null
  cuenta_contraparte: string | null
  banco_contraparte: string | null
  importe: number
  nota: string | null
}

export interface FilaCruce extends MovimientoCruce {
  /** null: el movimiento no se cruza con ningún conductor (solo en la consulta) */
  conductor: ConductorCruce | null
  /** Nombre del conductor, o el de Cresium si no es de un conductor */
  nombre_conductor: string
  criterio: CriterioCruce | null
  dni: string
  /** Si corresponde al conductor por una asignación de quien paga */
  asignacion: PagadorConductor | null
}

/** Persona que paga por un conductor (tabla cresium_pagadores_conductor) */
export interface PagadorConductor {
  id: string
  cuit: string | null
  cbu: string | null
  nombre_pagador: string | null
  vinculo: string | null
  conductor_id: string
}

export const VINCULOS = ['Pareja', 'Hermano/a', 'Padre/Madre', 'Hijo/a', 'Tío/a', 'Primo/a', 'Amigo/a', 'Otro']

/** Días hacia atrás que abarca la consulta (además de hoy) */
export const DIAS_CONSULTA = 7

export const ETIQUETA_CRITERIO: Record<CriterioCruce, string> = {
  cuit: 'CUIT/CUIL',
  dni: 'DNI',
  cbu: 'CBU',
  asignado: 'Asignado',
}

const COLUMNAS_MOV =
  'cresium_id, empresa, fecha, direccion, tipo, contraparte, cuit, cuenta_contraparte, banco_contraparte, importe, nota'

const TAM_PAGINA = 1000

/** Solo los dígitos */
export function soloDigitos(valor: string | null | undefined): string {
  return (valor || '').replace(/\D/g, '')
}

/** DNI sin ceros adelante, para comparar */
function dniNormalizado(valor: string | null | undefined): string {
  return soloDigitos(valor).replace(/^0+/, '')
}

/** CUIT de empresa (30, 33, 34): Cabify, dLocal, transferencias entre 44 Dreams y Grupo CG... */
export function esCuitEmpresa(cuit: string | null | undefined): boolean {
  const d = soloDigitos(cuit)
  return d.length === 11 && ['30', '33', '34'].includes(d.slice(0, 2))
}

/** DNI que va dentro de un CUIT/CUIL de 11 dígitos */
export function dniDeCuit(cuit: string | null | undefined): string {
  const d = soloDigitos(cuit)
  return d.length === 11 ? d.slice(2, 10).replace(/^0+/, '') : ''
}

export function nombreConductor(c: ConductorCruce): string {
  return [c.apellidos, c.nombres].filter(Boolean).join(', ') || '(sin nombre)'
}

/** Solo personas: saca los cobros de empresas (CUIT 30, 33, 34) */
function sinEmpresas(movs: MovimientoCruce[]): MovimientoCruce[] {
  return movs.filter((m) => !esCuitEmpresa(m.cuit))
}

/** Trae todas las filas de una consulta, de a TAM_PAGINA */
async function traerTodo<T>(armar: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const filas: T[] = []
  for (let desde = 0; ; desde += TAM_PAGINA) {
    const { data, error } = await armar(desde, desde + TAM_PAGINA - 1)
    if (error) throw error
    filas.push(...(data || []))
    if (!data || data.length < TAM_PAGINA) break
  }
  return filas
}

/** Conductores de la sede (lo arma el que llama con aplicarFiltroSede) */
export async function obtenerConductores(
  filtrarSede: <Q>(query: Q) => Q,
): Promise<ConductorCruce[]> {
  // La relación llega como objeto, aunque el tipo inferido de supabase-js dice arreglo
  type Estado = { descripcion: string | null }
  type Fila = Omit<ConductorCruce, 'estado'> & { conductores_estados: Estado | Estado[] | null }
  const filas = await traerTodo<Fila>((desde, hasta) =>
    filtrarSede(
      supabase
        .from('conductores')
        .select('id, nombres, apellidos, numero_dni, numero_cuit, cbu, conductores_estados(descripcion)'),
    )
      .order('id')
      .range(desde, hasta),
  )
  return filas.map(({ conductores_estados, ...c }) => {
    const estado = Array.isArray(conductores_estados) ? conductores_estados[0] : conductores_estados
    return { ...c, estado: estado?.descripcion ?? null }
  })
}

/** Cobros de personas en Cresium (sin rechazados ni empresas) del mes 'AAAA-MM' */
export async function obtenerMovimientosMes(mes: string): Promise<MovimientoCruce[]> {
  const [y, m] = mes.split('-').map(Number)
  const ultimoDia = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return sinEmpresas(await traerTodo<MovimientoCruce>((desde, hasta) =>
    supabase
      .from('cresium_movimientos')
      .select(COLUMNAS_MOV)
      .gte('fecha', `${mes}-01`)
      .lte('fecha', `${mes}-${String(ultimoDia).padStart(2, '0')}`)
      .neq('estado', 'FAILED')
      .eq('direccion', 'entrada')
      .order('fecha', { ascending: false })
      .order('cresium_id', { ascending: false })
      .range(desde, hasta),
  ))
}

export type TipoConsulta = 'cbu' | 'cuit' | 'dni' | 'nombre'

export const ETIQUETA_CONSULTA: Record<TipoConsulta, string> = {
  cbu: 'CBU/CVU',
  cuit: 'CUIT/CUIL',
  dni: 'DNI',
  nombre: 'nombre',
}

/** Texto de un nombre listo para buscar: solo letras y espacios */
export function nombreParaBuscar(texto: string): string {
  return texto.replace(/[^\p{L}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Qué dato es: con números, por la cantidad (22 CBU/CVU, 11 CUIT/CUIL, 7 u 8 DNI);
 * sin números y con 3 letras o más, un nombre.
 */
export function tipoDeConsulta(texto: string): TipoConsulta | null {
  const digitos = soloDigitos(texto)
  if (!digitos) return nombreParaBuscar(texto).length >= 3 ? 'nombre' : null
  if (digitos.length === 22) return 'cbu'
  if (digitos.length === 11) return 'cuit'
  if (digitos.length === 7 || digitos.length === 8) return 'dni'
  return null
}

/** Conductor de la sede al que corresponde el dato consultado (si hay) */
export function conductorDeConsulta(
  tipo: TipoConsulta,
  digitos: string,
  conductores: ConductorCruce[],
): ConductorCruce | null {
  if (tipo === 'nombre') return null
  const dni = tipo === 'dni' ? digitos.replace(/^0+/, '') : tipo === 'cuit' ? dniDeCuit(digitos) : ''
  return conductores.find((c) => {
    if (tipo === 'cbu') return soloDigitos(c.cbu) === digitos
    if (tipo === 'cuit' && soloDigitos(c.numero_cuit) === digitos) return true
    return !!dni && dniNormalizado(c.numero_dni) === dni
  }) || null
}

/**
 * Movimientos desde `desde` ('AAAA-MM-DD') de un CBU/CVU, CUIT/CUIL, DNI o nombre.
 * Con DNI busca los CUIL que lo tienen adentro; con nombre, la contraparte que lo
 * contiene. Si el dato es de un conductor con CBU cargado, también trae los
 * movimientos de ese CBU.
 */
export async function obtenerMovimientosConsulta(
  tipo: TipoConsulta,
  valor: string,
  cbuConductor: string | null,
  desde: string,
): Promise<MovimientoCruce[]> {
  if (tipo === 'nombre') {
    const patron = `%${nombreParaBuscar(valor).replace(/ /g, '%')}%`
    return sinEmpresas(await traerTodo<MovimientoCruce>((d, h) =>
      supabase
        .from('cresium_movimientos')
        .select(COLUMNAS_MOV)
        .ilike('contraparte', patron)
        .gte('fecha', desde)
        .neq('estado', 'FAILED')
      .eq('direccion', 'entrada')
        .order('fecha', { ascending: false })
        .order('cresium_id', { ascending: false })
        .range(d, h),
    ))
  }
  const digitos = soloDigitos(valor)
  const condiciones: string[] = []
  if (tipo === 'cbu') condiciones.push(`cuenta_contraparte.eq.${digitos}`)
  if (tipo === 'cuit') condiciones.push(`cuit.eq.${digitos}`, `cuit.like.__${digitos.slice(2, 10)}_`)
  if (tipo === 'dni') condiciones.push(`cuit.like.__${digitos.padStart(8, '0')}_`)
  const cbu = soloDigitos(cbuConductor)
  if (cbu.length === 22 && tipo !== 'cbu') condiciones.push(`cuenta_contraparte.eq.${cbu}`)

  return sinEmpresas(await traerTodo<MovimientoCruce>((d, h) =>
    supabase
      .from('cresium_movimientos')
      .select(COLUMNAS_MOV)
      .or(condiciones.join(','))
      .gte('fecha', desde)
      .neq('estado', 'FAILED')
      .eq('direccion', 'entrada')
      .order('fecha', { ascending: false })
      .order('cresium_id', { ascending: false })
      .range(d, h),
  ))
}

/** Quiénes pagan por un conductor. null si la tabla todavía no existe (falta correr el SQL) */
export async function obtenerPagadores(): Promise<PagadorConductor[] | null> {
  const { data, error } = await supabase
    .from('cresium_pagadores_conductor')
    .select('id, cuit, cbu, nombre_pagador, vinculo, conductor_id')
  if (error) {
    const codigo = (error as { code?: string }).code
    if (codigo === '42P01' || codigo === 'PGRST205') return null
    throw error
  }
  return (data || []) as PagadorConductor[]
}

/**
 * Guarda que la persona que hizo el movimiento paga por el conductor. Se identifica
 * por CUIT/CUIL; si el movimiento no lo trae, por CBU/CVU. Reemplaza la asignación
 * anterior de esa persona.
 */
export async function asignarPagador(
  mov: MovimientoCruce,
  conductorId: string,
  vinculo: string | null,
  usuarioId: string | null,
): Promise<void> {
  const cuit = soloDigitos(mov.cuit)
  const cbu = soloDigitos(mov.cuenta_contraparte)
  if (cuit.length !== 11 && cbu.length !== 22) throw new Error('El movimiento no tiene CUIT ni CBU')

  const borrar = cuit.length === 11
    ? supabase.from('cresium_pagadores_conductor').delete().eq('cuit', cuit)
    : supabase.from('cresium_pagadores_conductor').delete().is('cuit', null).eq('cbu', cbu)
  const { error: errorBorrar } = await borrar
  if (errorBorrar) throw errorBorrar

  const { error } = await supabase.from('cresium_pagadores_conductor').insert({
    cuit: cuit.length === 11 ? cuit : null,
    cbu: cbu.length === 22 ? cbu : null,
    nombre_pagador: mov.contraparte,
    vinculo: vinculo || null,
    conductor_id: conductorId,
    created_by: usuarioId,
  })
  if (error) throw error
}

export async function quitarPagador(id: string): Promise<void> {
  const { error } = await supabase.from('cresium_pagadores_conductor').delete().eq('id', id)
  if (error) throw error
}

/** Índices para encontrar el conductor de un movimiento */
export function indexarConductores(conductores: ConductorCruce[], pagadores: PagadorConductor[] = []) {
  const porCuit = new Map<string, ConductorCruce>()
  const porDni = new Map<string, ConductorCruce>()
  const porCbu = new Map<string, ConductorCruce>()
  for (const c of conductores) {
    const cuit = soloDigitos(c.numero_cuit)
    if (cuit.length === 11 && !porCuit.has(cuit)) porCuit.set(cuit, c)
    const dni = dniNormalizado(c.numero_dni)
    if (dni.length >= 6 && !porDni.has(dni)) porDni.set(dni, c)
    const cbu = soloDigitos(c.cbu)
    if (cbu.length === 22 && !porCbu.has(cbu)) porCbu.set(cbu, c)
  }
  // Quien paga por un conductor: solo si el conductor es de la sede elegida
  const porId = new Map(conductores.map((c) => [c.id, c]))
  const pagadorPorCuit = new Map<string, { conductor: ConductorCruce; pagador: PagadorConductor }>()
  const pagadorPorCbu = new Map<string, { conductor: ConductorCruce; pagador: PagadorConductor }>()
  for (const p of pagadores) {
    const conductor = porId.get(p.conductor_id)
    if (!conductor) continue
    if (p.cuit) pagadorPorCuit.set(soloDigitos(p.cuit), { conductor, pagador: p })
    else if (p.cbu) pagadorPorCbu.set(soloDigitos(p.cbu), { conductor, pagador: p })
  }
  return { porCuit, porDni, porCbu, pagadorPorCuit, pagadorPorCbu }
}

export type IndiceConductores = ReturnType<typeof indexarConductores>

/**
 * Movimientos con su conductor y por qué dato se cruzó. Deja solo los de conductores,
 * salvo con incluirOtros (la consulta: puede pagar la pareja u otra persona).
 */
export function cruzar(
  movimientos: MovimientoCruce[],
  indice: IndiceConductores,
  incluirOtros = false,
): FilaCruce[] {
  const filas: FilaCruce[] = []
  for (const m of movimientos) {
    const cuit = soloDigitos(m.cuit)
    let conductor = cuit ? indice.porCuit.get(cuit) : undefined
    let criterio: CriterioCruce = 'cuit'
    if (!conductor) {
      const dni = dniDeCuit(cuit)
      conductor = dni ? indice.porDni.get(dni) : undefined
      criterio = 'dni'
    }
    const cbuMov = soloDigitos(m.cuenta_contraparte)
    if (!conductor) {
      conductor = cbuMov ? indice.porCbu.get(cbuMov) : undefined
      criterio = 'cbu'
    }
    let asignacion: PagadorConductor | null = null
    if (!conductor) {
      const asignado = (cuit ? indice.pagadorPorCuit.get(cuit) : undefined)
        ?? (!cuit && cbuMov ? indice.pagadorPorCbu.get(cbuMov) : undefined)
      if (asignado) {
        conductor = asignado.conductor
        asignacion = asignado.pagador
        criterio = 'asignado'
      }
    }
    if (!conductor) {
      if (incluirOtros) {
        filas.push({
          ...m,
          importe: Number(m.importe) || 0,
          conductor: null,
          nombre_conductor: m.contraparte || '(sin nombre)',
          criterio: null,
          dni: dniDeCuit(cuit),
          asignacion: null,
        })
      }
      continue
    }
    filas.push({
      ...m,
      importe: Number(m.importe) || 0,
      conductor,
      nombre_conductor: nombreConductor(conductor),
      criterio,
      dni: soloDigitos(conductor.numero_dni) || (asignacion ? '' : dniDeCuit(cuit)),
      asignacion,
    })
  }
  return filas
}
