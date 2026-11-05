// src/modules/asignaciones/historialFlota.ts
// Historial de conductores en los vehículos, compartido por Agentes (Estado de Flota) y el
// Dashboard General. Arma cada paso de un conductor por un auto (asignaciones_conductores:
// fecha_inicio / fecha_fin) y cuándo volvió cada auto a estar asignable (historial_vehiculos),
// para saber:
//  - las altas y bajas en los autos (sin contar como baja + alta cuando se cierra una
//    asignación y el mismo conductor sigue en el auto),
//  - desde cuándo está vacante cada turno (los días en taller no suman),
//  - cuánto se tardó en llenar cada turno.
import { supabase } from '../../lib/supabase'
import { fechaISOART } from '../../utils/fechaArgentina'

const PAGINA = 1000

/** Si el mismo conductor vuelve a entrar al mismo auto dentro de este plazo, no se fue. */
const CONTINUIDAD_MS = 24 * 60 * 60 * 1000
const DIA_MS = 24 * 60 * 60 * 1000

/** Estados en los que el auto se puede asignar a conductores. */
const ESTADOS_ASIGNABLES = ['PKG_ON_BASE', 'EN_USO']

/** Turno del conductor en el auto: diurno, nocturno o a cargo. */
export type Turno = 'D' | 'N' | 'C'

export type FiltroSede = <T>(q: T) => T

export interface MovimientoConductor {
  tipo: 'alta' | 'baja'
  /** Fecha y hora (ISO) en que entró o salió del auto */
  fecha: string
  /** 'YYYY-MM-DD' en hora argentina */
  dia: string
  vehiculoId: string
  patente: string
  guiaResponsable: string | null
  conductor: string
  /** Guía del conductor (quién lo cargó), tal como está en conductores.guia */
  guiaConductor: string | null
  turno: Turno
}

export interface DisponibleDesde {
  /** Fecha y hora (ISO) en que el auto pasó a PKG ON o En uso */
  fecha: string
  /** Estado en que estaba antes, con su descripción (ej. «Taller Mecánico») */
  estadoAnterior: string | null
}

export interface HistorialFlota {
  /** Altas y bajas reales, de la más nueva a la más vieja */
  movimientos: MovimientoConductor[]
  /** Última salida (ISO) por `vehiculoId|turno` y por `vehiculoId|*` (cualquier turno) */
  ultimaSalida: Map<string, string>
  /** Última vez que cada auto volvió a estar asignable (desde taller, robo, etc.) */
  disponibleDesde: Map<string, DisponibleDesde>
  /** Todas las salidas (ISO, ordenadas) por `vehiculoId|turno` y `vehiculoId|*` */
  salidas: Map<string, string[]>
  /** Todas las veces (ISO, ordenadas) que cada auto volvió a estar asignable */
  disponibilidades: Map<string, string[]>
  /**
   * Conductor -> desde cuándo (ISO) tiene asignación sin cortes, en cualquier auto: si
   * cambia de vehículo o se renueva la asignación dentro de las 24 h, no se corta.
   * Solo para los que hoy tienen una asignación en curso.
   */
  conAsignacionDesde: Map<string, string>
}

/** Un turno que se llenó: cuánto estuvo libre antes de que entrara el conductor. */
export interface Llenado {
  /** Cuándo entró el conductor (ISO) y su día en hora argentina */
  fecha: string
  dia: string
  /** Desde cuándo estaba libre el turno (salida anterior o auto disponible) */
  libreDesde: string
  dias: number
  vehiculoId: string
  patente: string
  guiaResponsable: string | null
  conductor: string
  turno: Turno
}

export function turnoDe(horario: string | null | undefined): Turno {
  const h = (horario || '').toLowerCase()
  if (h === 'diurno' || h === 'd') return 'D'
  if (h === 'nocturno' || h === 'n') return 'N'
  return 'C'
}

const cancelada = (estado: string | null | undefined) => /^cancel/i.test(estado || '')
const sinEmpezar = (estado: string | null | undefined) => /^(cancel|program|pendient)/i.test(estado || '')

async function leerTodo(consulta: (desde: number, hasta: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<any[]> {
  const filas: any[] = []
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await consulta(desde, desde + PAGINA - 1)
    if (error) throw error
    const lote = (data || []) as any[]
    filas.push(...lote)
    if (lote.length < PAGINA) break
  }
  return filas
}

/** Último valor de una lista ordenada que sea anterior a `antes`. */
function ultimoAntes(lista: string[] | undefined, antes: string): string | null {
  if (!lista) return null
  let r: string | null = null
  for (const x of lista) {
    if (x >= antes) break
    r = x
  }
  return r
}

/**
 * Carga el historial desde `desde` (ISO): asignaciones activas o que terminaron después,
 * y los cambios de estado de los vehículos.
 */
export async function cargarHistorialFlota(filtroSede: FiltroSede, desde: string): Promise<HistorialFlota> {
  const filas = await leerTodo((a, b) => filtroSede(supabase
    .from('asignaciones')
    .select(`
      id, vehiculo_id, estado, fecha_fin,
      vehiculos (patente, guia_responsable),
      asignaciones_conductores (conductor_id, horario, estado, fecha_inicio, fecha_fin, conductores (nombres, apellidos, guia))
    `))
    .or(`estado.in.(activo,activa),fecha_fin.gte.${desde}`)
    .order('id')
    .range(a, b))

  // Cada paso de un conductor por un auto (una fila de asignaciones_conductores)
  interface Estadia {
    base: Omit<MovimientoConductor, 'tipo' | 'fecha' | 'dia'>
    conductorId: string
    inicio: string | null
    fin: string | null
  }
  const estadias: Estadia[] = []
  for (const a of filas) {
    if (cancelada(a.estado) || !a.vehiculo_id) continue
    for (const ac of a.asignaciones_conductores || []) {
      const c = ac.conductores
      if (!c || cancelada(ac.estado)) continue
      if (/interno/i.test(c.apellidos || '')) continue
      estadias.push({
        base: {
          vehiculoId: a.vehiculo_id as string,
          patente: a.vehiculos?.patente || '-',
          guiaResponsable: a.vehiculos?.guia_responsable ?? null,
          conductor: `${c.nombres || ''} ${c.apellidos || ''}`.trim(),
          guiaConductor: c.guia ?? null,
          turno: turnoDe(ac.horario),
        },
        conductorId: ac.conductor_id,
        inicio: ac.fecha_inicio && !sinEmpezar(a.estado) ? ac.fecha_inicio : null,
        // Si la asignación se cerró sin fecha propia del conductor, vale la de la asignación
        // (o si la asignación ya no está activa, aunque la fila del conductor quedó vieja)
        fin: ac.fecha_fin || (['completado', 'finalizado'].includes(ac.estado) || !['activo', 'activa'].includes(String(a.estado || '').toLowerCase())
          ? a.fecha_fin
          : null),
      })
    }
  }

  // Cuando se cierra una asignación y se abre otra para el mismo auto (por ejemplo, al
  // sumar al conductor del otro turno), el conductor sigue en el auto: esa salida y esa
  // entrada no son una baja y un alta. Se toma como continuidad si vuelve a entrar al
  // mismo auto dentro de las 24 h.
  const sigueEnElAuto = new Set<Estadia>() // salida que continúa en otra estadía
  const esContinuacion = new Set<Estadia>() // entrada que continúa una anterior
  const turnoCambiado = new Set<Estadia>() // siguió en el auto pero pasó a otro turno
  const porConductor = new Map<string, Estadia[]>()
  for (const e of estadias) {
    if (!e.conductorId) continue
    const clave = `${e.base.vehiculoId}|${e.conductorId}`
    porConductor.set(clave, [...(porConductor.get(clave) ?? []), e])
  }
  for (const lista of porConductor.values()) {
    for (const sale of lista) {
      if (!sale.fin) continue
      const finMs = Date.parse(sale.fin)
      const entra = lista.find(o => o !== sale && o.inicio && !esContinuacion.has(o)
        && Math.abs(Date.parse(o.inicio) - finMs) <= CONTINUIDAD_MS)
      if (!entra) continue
      sigueEnElAuto.add(sale)
      esContinuacion.add(entra)
      if (entra.base.turno !== sale.base.turno) turnoCambiado.add(sale)
    }
  }

  const movimientos: MovimientoConductor[] = []
  const salidas = new Map<string, string[]>()
  const guardarSalida = (clave: string, fecha: string) => {
    salidas.set(clave, [...(salidas.get(clave) ?? []), fecha])
  }
  for (const e of estadias) {
    if (e.inicio && !esContinuacion.has(e)) {
      movimientos.push({ ...e.base, tipo: 'alta', fecha: e.inicio, dia: fechaISOART(e.inicio) ?? '' })
    }
    if (!e.fin) continue
    if (!sigueEnElAuto.has(e)) {
      movimientos.push({ ...e.base, tipo: 'baja', fecha: e.fin, dia: fechaISOART(e.fin) ?? '' })
      guardarSalida(`${e.base.vehiculoId}|${e.base.turno}`, e.fin)
      guardarSalida(`${e.base.vehiculoId}|*`, e.fin)
    } else if (turnoCambiado.has(e)) {
      // Siguió en el auto en otro turno: el turno que dejó sí quedó libre
      guardarSalida(`${e.base.vehiculoId}|${e.base.turno}`, e.fin)
    }
  }
  const ultimaSalida = new Map<string, string>()
  for (const [clave, lista] of salidas) {
    lista.sort()
    ultimaSalida.set(clave, lista[lista.length - 1])
  }

  // Cuándo volvió cada auto a un estado asignable. Si falla, se cuenta solo por salidas.
  const disponibleDesde = new Map<string, DisponibleDesde>()
  const disponibilidades = new Map<string, string[]>()
  try {
    const { data: estados } = await supabase.from('vehiculos_estados').select('codigo, descripcion')
    const descripcion = new Map(((estados || []) as any[]).map(e => [e.codigo, e.descripcion]))
    const cambios = await leerTodo((a, b) => supabase
      .from('historial_vehiculos')
      .select('vehiculo_id, estado_anterior, estado_nuevo, created_at')
      .eq('tipo_evento', 'cambio_estado')
      .in('estado_nuevo', ESTADOS_ASIGNABLES)
      .gte('created_at', desde)
      .order('created_at')
      .range(a, b))
    for (const h of cambios) {
      // PKG ON <-> En uso no corta la disponibilidad
      if (h.estado_anterior && ESTADOS_ASIGNABLES.includes(h.estado_anterior)) continue
      disponibilidades.set(h.vehiculo_id, [...(disponibilidades.get(h.vehiculo_id) ?? []), h.created_at])
      const actual = disponibleDesde.get(h.vehiculo_id)
      if (!actual || h.created_at > actual.fecha) {
        const anterior = h.estado_anterior ? (descripcion.get(h.estado_anterior) ?? h.estado_anterior) : null
        disponibleDesde.set(h.vehiculo_id, { fecha: h.created_at, estadoAnterior: anterior })
      }
    }
  } catch (error) {
    console.error('No se pudo leer el historial de estados de los vehículos:', error)
  }

  movimientos.sort((x, y) => (x.fecha < y.fecha ? 1 : -1))
  // Días con asignación de cada conductor, sin importar el auto
  const tramosPorConductor = new Map<string, { ini: number; fin: number }[]>()
  for (const e of estadias) {
    if (!e.conductorId || !e.inicio) continue
    const lista = tramosPorConductor.get(e.conductorId) ?? []
    lista.push({ ini: Date.parse(e.inicio), fin: e.fin ? Date.parse(e.fin) : Number.POSITIVE_INFINITY })
    tramosPorConductor.set(e.conductorId, lista)
  }
  const conAsignacionDesde = new Map<string, string>()
  for (const [conductorId, tramos] of tramosPorConductor) {
    tramos.sort((a, b) => a.ini - b.ini)
    let inicio = tramos[0].ini
    let fin = tramos[0].fin
    for (const t of tramos.slice(1)) {
      if (t.ini <= fin + CONTINUIDAD_MS) {
        fin = Math.max(fin, t.fin)
      } else {
        inicio = t.ini
        fin = t.fin
      }
    }
    if (fin === Number.POSITIVE_INFINITY) conAsignacionDesde.set(conductorId, new Date(inicio).toISOString())
  }

  return { movimientos, ultimaSalida, disponibleDesde, salidas, disponibilidades, conAsignacionDesde }
}

/**
 * Cada alta en un auto con el tiempo que el turno estuvo libre antes: desde la salida
 * anterior de ese turno o desde que el auto volvió a estar disponible, lo que sea más
 * reciente. Las altas sin un "libre desde" conocido (fuera del historial cargado) no van.
 */
export function calcularLlenados(h: HistorialFlota): Llenado[] {
  const llenados: Llenado[] = []
  for (const m of h.movimientos) {
    if (m.tipo !== 'alta') continue
    const claveTurno = `${m.vehiculoId}|${m.turno === 'C' ? '*' : m.turno}`
    const salida = ultimoAntes(h.salidas.get(claveTurno), m.fecha)
    const disponible = ultimoAntes(h.disponibilidades.get(m.vehiculoId), m.fecha)
    const libreDesde = salida && disponible ? (salida > disponible ? salida : disponible) : salida ?? disponible
    if (!libreDesde) continue
    llenados.push({
      fecha: m.fecha,
      dia: m.dia,
      libreDesde,
      dias: Math.max(0, (Date.parse(m.fecha) - Date.parse(libreDesde)) / DIA_MS),
      vehiculoId: m.vehiculoId,
      patente: m.patente,
      guiaResponsable: m.guiaResponsable,
      conductor: m.conductor,
      turno: m.turno,
    })
  }
  return llenados
}
