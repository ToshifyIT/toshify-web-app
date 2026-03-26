/**
 * Sincronizacion de Bitacora Wialon para Deno (v2)
 *
 * Mejoras sobre v1:
 * - Split por turno diurno/nocturno basado en asignaciones
 * - Conversion timezone UTC -> ART para horas correctas
 * - Mapeo de conductor_id desde asignaciones internas
 * - Km proporcional por turno
 * - Registros "Sin Actividad" para conductores activos sin datos GPS
 * - Auto-recuperacion de token Wialon (archivo -> env -> credenciales)
 *
 * Corre cada 5 min via cron. Solo sincroniza el dia actual.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// =====================================================
// CONFIGURACION
// =====================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const WIALON_HOST = 'https://hst-api.wialon.us'
const WIALON_TOKEN = Deno.env.get('WIALON_TOKEN')!
const WIALON_USER = Deno.env.get('WIALON_USER') || ''
const WIALON_PASSWORD = Deno.env.get('WIALON_PASSWORD') || ''
const TOKEN_FILE = '/opt/toshify-sync/wialon-token.txt'

const WIALON_CONFIG = {
  reportResourceId: 401831897,
  reportTemplateId: 17,
  reportObjectId: 401831899,
}

const POCO_KM_THRESHOLD = 100
const TIMEZONE = 'America/Argentina/Buenos_Aires'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// =====================================================
// TOKEN MANAGEMENT
// =====================================================

function readSavedToken(): string | null {
  try {
    const t = Deno.readTextFileSync(TOKEN_FILE).trim()
    return t || null
  } catch {
    return null
  }
}

function saveToken(token: string): void {
  try {
    Deno.writeTextFileSync(TOKEN_FILE, token)
  } catch (e) {
    console.error('No se pudo guardar token:', e)
  }
}

// =====================================================
// WIALON CLIENT
// =====================================================

class WialonClient {
  private host: string
  private sid: string | null = null

  constructor(host: string) {
    this.host = host
  }

  private async request(svc: string, params: Record<string, unknown>): Promise<any> {
    const url = `${this.host}/wialon/ajax.html`
    const body = new URLSearchParams()
    body.append('svc', svc)
    body.append('params', JSON.stringify(params))
    if (this.sid) body.append('sid', this.sid)
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    return await response.json()
  }

  async loginWithToken(token: string): Promise<boolean> {
    const result = await this.request('token/login', { token })
    if (result.eid) { this.sid = result.eid; return true }
    return false
  }

  async loginWithCredentials(user: string, password: string): Promise<boolean> {
    const result = await this.request('core/login', { user, password })
    if (result.eid) { this.sid = result.eid; return true }
    console.error('core/login fallo:', JSON.stringify(result))
    return false
  }

  async createToken(appName: string): Promise<string | null> {
    if (!this.sid) return null
    const result = await this.request('token/update', {
      callMode: 'create', app: appName, at: 0, dur: 0, fl: -1, p: '{}', items: [],
    })
    if (result.h) return result.h
    console.error('token/update fallo:', JSON.stringify(result))
    return null
  }

  async login(): Promise<string> {
    // 1. Token guardado en archivo (prioridad)
    const savedToken = readSavedToken()
    if (savedToken) {
      if (await this.loginWithToken(savedToken)) return 'token (archivo)'
    }
    // 2. Token del env
    if (WIALON_TOKEN) {
      if (await this.loginWithToken(WIALON_TOKEN)) {
        saveToken(WIALON_TOKEN)
        return 'token (env)'
      }
    }
    // 3. Credenciales + regenerar token
    if (!WIALON_USER || !WIALON_PASSWORD) {
      throw new Error('Token invalido y no hay credenciales configuradas')
    }
    if (!(await this.loginWithCredentials(WIALON_USER, WIALON_PASSWORD))) {
      throw new Error('Login con credenciales fallo')
    }
    const newToken = await this.createToken('toshify-bitacora-sync')
    if (newToken) {
      saveToken(newToken)
      console.log('Token regenerado y guardado')
    }
    return 'credenciales'
  }

  async logout(): Promise<void> {
    if (this.sid) {
      try { await this.request('core/logout', {}) } catch { /* ignore */ }
      this.sid = null
    }
  }

  async cleanupReport(): Promise<void> {
    await this.request('report/cleanup_result', {})
  }

  async execReport(from: number, to: number): Promise<any> {
    return await this.request('report/exec_report', {
      reportResourceId: WIALON_CONFIG.reportResourceId,
      reportTemplateId: WIALON_CONFIG.reportTemplateId,
      reportObjectId: WIALON_CONFIG.reportObjectId,
      reportObjectSecId: 0,
      interval: { flags: 0, from, to },
    })
  }

  async selectRows(tableIndex: number, from: number, to: number, level: number = 0): Promise<any> {
    return await this.request('report/select_result_rows', {
      tableIndex,
      config: { type: 'range', data: { from, to, level } },
    })
  }
}

// =====================================================
// HELPERS
// =====================================================

function normalizarPatente(patente: string): string {
  return (patente || '').replace(/[\s\-.%]/g, '').toUpperCase()
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function calcularEstado(horaCierre: string | null, km: number): string {
  if (!horaCierre) return 'En Curso'
  if (km < POCO_KM_THRESHOLD) return 'Poco Km'
  return 'Turno Finalizado'
}

/**
 * Convierte celda Wialon a fecha/hora en ART.
 * Prioriza unix timestamp (campo v) que es inequivoco.
 * Fallback: parsea texto asumiendo UTC y convierte a ART.
 */
function extractTimeART(cell: any): { fecha: string; hora: string } | null {
  if (!cell) return null

  // Preferir unix timestamp (v) - es la fuente mas confiable
  if (typeof cell === 'object' && cell.v && typeof cell.v === 'number') {
    const date = new Date(cell.v * 1000)
    const fecha = date.toLocaleDateString('en-CA', { timeZone: TIMEZONE })
    const hora = date.toLocaleTimeString('en-GB', { timeZone: TIMEZONE, hour12: false })
    return { fecha, hora }
  }

  // Fallback: parsear texto (UTC) y convertir a ART
  const text = typeof cell === 'string' ? cell : cell?.t || ''
  if (!text || text === '-') return null

  let isoStr: string | null = null

  // Formato: DD.MM.YYYY HH:MM
  const m1 = text.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})/)
  if (m1) isoStr = `${m1[3]}-${m1[2]}-${m1[1]}T${m1[4]}:${m1[5]}:00Z`

  // Formato: YYYY/MM/DD HH:MM:SS
  if (!isoStr) {
    const m2 = text.match(/(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))/)
    if (m2) isoStr = `${m2[1]}-${m2[2]}-${m2[3]}T${m2[4]}:${m2[5]}:${m2[6] || '00'}Z`
  }

  if (!isoStr) return null

  const utcDate = new Date(isoStr)
  const fecha = utcDate.toLocaleDateString('en-CA', { timeZone: TIMEZONE })
  const hora = utcDate.toLocaleTimeString('en-GB', { timeZone: TIMEZONE, hour12: false })
  return { fecha, hora }
}

/**
 * Extrae ibutton y nombre del campo conductor Wialon.
 * Formato: "15-EMMANUEL SEBASTIAN RAMIREZ, 16-RUBEN ALANIS"
 * Toma el PRIMER conductor de la lista.
 */
function extractConductor(cell: any): { ibutton: string | null; nombre: string | null } {
  if (!cell) return { ibutton: null, nombre: null }
  const text = typeof cell === 'string' ? cell : cell?.t || ''
  if (!text || text === '-') return { ibutton: null, nombre: null }
  const firstConductor = text.split(',')[0].trim()
  const match = firstConductor.match(/^(\d+)\s*[-\u2013]\s*(.+)$/)
  if (match) return { ibutton: match[1], nombre: match[2].trim() }
  return { ibutton: null, nombre: firstConductor || null }
}

function extractKm(cell: any): number {
  if (!cell) return 0
  const text = typeof cell === 'string' ? cell : cell?.t || ''
  return parseFloat(text.replace(/[^\d.]/g, '')) || 0
}

function extractUnitId(cell: any): number | null {
  if (!cell || typeof cell !== 'object') return null
  return cell.u || null
}

// =====================================================
// ASIGNACIONES (date-aware, incluye historicas)
// =====================================================

interface AsignacionInfo {
  vehiculoId: string
  patente: string
  patenteNorm: string
  modalidad: string // 'turno' | 'a_cargo'
  conductores: {
    conductorId: string
    horario: string // 'diurno' | 'nocturno' | 'todo_dia'
    nombre: string
  }[]
}

interface AsignacionRaw {
  id: string
  vehiculo_id: string
  horario: string
  estado: string
  created_at: string
  fecha_inicio: string | null
  fecha_fin: string | null
  vehiculos: { patente: string } | null
  asignaciones_conductores: {
    conductor_id: string
    horario: string
    estado: string
    conductores: { nombres: string; apellidos: string } | null
  }[]
}

let allAsignaciones: AsignacionRaw[] = []

async function loadAllAsignaciones(): Promise<void> {
  const { data, error } = await (supabase
    .from('asignaciones') as any)
    .select(`
      id, vehiculo_id, horario, estado, created_at, fecha_inicio, fecha_fin,
      vehiculos(patente),
      asignaciones_conductores(
        conductor_id, horario, estado,
        conductores(nombres, apellidos)
      )
    `)
    .in('estado', ['activa', 'finalizada', 'programado'])
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error cargando asignaciones:', error.message)
    allAsignaciones = []
    return
  }
  allAsignaciones = (data || []) as AsignacionRaw[]
  console.log(`Asignaciones cargadas: ${allAsignaciones.length}`)
}

function getAsignacionesForDate(dateStr: string): Map<string, AsignacionInfo> {
  const map = new Map<string, AsignacionInfo>()

  for (const a of allAsignaciones) {
    const patente = a.vehiculos?.patente || ''
    const patenteNorm = normalizarPatente(patente)
    if (!patenteNorm || map.has(patenteNorm)) continue // primera coincidencia gana (mas reciente)

    // Verificar si esta asignacion estaba activa en la fecha
    const createdAt = a.fecha_inicio ? new Date(a.fecha_inicio) : new Date(a.created_at)
    const endedAt = a.fecha_fin ? new Date(a.fecha_fin) : null
    const startedBeforeOrOn = createdAt <= new Date(dateStr + 'T23:59:59Z')
    const endedAfterOrOn = !endedAt || endedAt >= new Date(dateStr + 'T00:00:00Z')

    if (!startedBeforeOrOn || !endedAfterOrOn) continue

    const esTurno = (a.horario || '').toUpperCase() === 'TURNO'
    const conductoresActivos = (a.asignaciones_conductores || [])
      .filter((ac) => ['asignado', 'activo'].includes(ac.estado))
      .map((ac) => ({
        conductorId: ac.conductor_id,
        horario: ac.horario || 'todo_dia',
        nombre: ac.conductores
          ? `${ac.conductores.nombres || ''} ${ac.conductores.apellidos || ''}`.trim()
          : '',
      }))

    map.set(patenteNorm, {
      vehiculoId: a.vehiculo_id,
      patente,
      patenteNorm,
      modalidad: esTurno ? 'turno' : 'a_cargo',
      conductores: conductoresActivos,
    })
  }
  return map
}

// =====================================================
// PARAMETROS (horas de corte de turno)
// =====================================================

async function getShiftHours(): Promise<{ diurnoInicio: string; diurnoFin: string }> {
  const { data } = await supabase
    .from('parametros_sistema')
    .select('clave, valor')
    .in('clave', ['bitacora_turno_diurno_inicio', 'bitacora_turno_diurno_fin'])

  let diurnoInicio = '06:00'
  let diurnoFin = '18:00'
  for (const row of data || []) {
    if (row.clave === 'bitacora_turno_diurno_inicio') diurnoInicio = row.valor
    if (row.clave === 'bitacora_turno_diurno_fin') diurnoFin = row.valor
  }
  return { diurnoInicio, diurnoFin }
}

// =====================================================
// VEHICULOS MAP (patente -> vehiculo_id)
// =====================================================

let vehiculosMap: Map<string, string> | null = null

async function getVehiculosMap(): Promise<Map<string, string>> {
  if (vehiculosMap) return vehiculosMap
  const { data } = await supabase.from('vehiculos').select('id, patente')
  vehiculosMap = new Map<string, string>()
  for (const v of data || []) vehiculosMap.set(normalizarPatente(v.patente), v.id)
  return vehiculosMap
}

// =====================================================
// SYNC
// =====================================================

interface BitacoraRecord {
  patente: string
  patente_normalizada: string
  vehiculo_id: string | null
  conductor_wialon: string | null
  conductor_id: string | null
  ibutton: string | null
  fecha_turno: string
  hora_inicio: string | null
  hora_cierre: string | null
  kilometraje: number
  estado: string
  horario: string
  vehiculo_modalidad: string | null
  wialon_unit_id: number | null
  synced_at: string
  updated_at: string
}

async function syncBitacora(overrideDate?: string): Promise<{ success: boolean; turnos: number; error?: string }> {
  const startTime = Date.now()
  const client = new WialonClient(WIALON_HOST)

  // Fecha: argumento o hoy en ART
  const now = new Date()
  const startDate = overrideDate || now.toLocaleDateString('en-CA', { timeZone: TIMEZONE })
  const startOfDay = new Date(startDate + 'T00:00:00-03:00')
  const fromTs = Math.floor(startOfDay.getTime() / 1000)
  const toTs = overrideDate ? fromTs + 86399 : Math.floor(now.getTime() / 1000)

  let syncLogId: string | null = null

  try {
    // Sync log
    const { data: logData } = await supabase
      .from('wialon_bitacora_sync_log')
      .insert({
        tipo: 'realtime',
        fecha_inicio: startDate,
        fecha_fin: startDate,
        status: 'running',
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    syncLogId = logData?.id

    // Cargar datos de referencia en paralelo
    const [shiftHours] = await Promise.all([
      getShiftHours(),
      loadAllAsignaciones(),
    ])
    const vMap = await getVehiculosMap()
    const asignaciones = getAsignacionesForDate(startDate)

    console.log(`Turno diurno: ${shiftHours.diurnoInicio} - ${shiftHours.diurnoFin}`)
    console.log(`Asignaciones del dia: ${asignaciones.size}`)

    const diurnoInicioMin = timeToMinutes(shiftHours.diurnoInicio)
    const diurnoFinMin = timeToMinutes(shiftHours.diurnoFin)

    // Login Wialon y ejecutar reporte
    const loginMethod = await client.login()
    console.log('Login via: ' + loginMethod)
    await client.cleanupReport()

    const reportResult = await client.execReport(fromTs, toTs)
    const tables = reportResult.reportResult?.tables || []

    // Parsear filas resumen de Wialon (level 0 = 1 por vehiculo)
    interface VehicleSummary {
      tableIdx: number
      rowIdx: number
      patente: string
      patenteNorm: string
      horaInicio: string | null
      horaCierre: string | null
      fechaTurno: string
      km: number
      conductor: string | null
      ibutton: string | null
      unitId: number | null
    }

    // Sub-viaje individual (level 1)
    interface SubTrip {
      horaInicio: string | null
      horaCierre: string | null
      fechaTurno: string
      km: number
      conductor: string | null
      ibutton: string | null
    }

    const vehicleSummaries: VehicleSummary[] = []

    for (let tableIdx = 0; tableIdx < tables.length; tableIdx++) {
      const table = tables[tableIdx]
      if (!table.rows || table.rows === 0) continue

      // level 0 = filas resumen por vehiculo
      const rows = await client.selectRows(tableIdx, 0, table.rows, 0)

      for (let rowIdx = 0; rowIdx < (rows || []).length; rowIdx++) {
        const row = rows[rowIdx]
        const cells = row.c || []

        const patente = typeof cells[0] === 'string' ? cells[0] : cells[0]?.t || ''
        if (!patente) continue

        let horaInicio: string | null = null
        let fechaTurno = startDate
        const parsedInicio = extractTimeART(cells[1])
        if (parsedInicio) {
          horaInicio = parsedInicio.hora
          fechaTurno = parsedInicio.fecha
        }

        let horaCierre: string | null = null
        const parsedCierre = extractTimeART(cells[2])
        if (parsedCierre) horaCierre = parsedCierre.hora

        const km = extractKm(cells[4])
        const { ibutton, nombre: conductor } = extractConductor(cells[5])
        const unitId = extractUnitId(cells[1])

        vehicleSummaries.push({
          tableIdx,
          rowIdx,
          patente,
          patenteNorm: normalizarPatente(patente),
          horaInicio,
          horaCierre,
          fechaTurno,
          km: Math.round(km * 100) / 100,
          conductor,
          ibutton,
          unitId,
        })
      }
    }

    console.log(`Vehiculos en Wialon: ${vehicleSummaries.length}`)

    // Sub-viajes vienen en la propiedad .r de cada fila level 1
    // Necesitamos una segunda pasada con level 1 para obtener .r
    // Key compuesta tableIdx_rowIdx para evitar colisiones entre tablas
    const vehicleSubTrips = new Map<string, SubTrip[]>()

    for (let tableIdx = 0; tableIdx < tables.length; tableIdx++) {
      const table = tables[tableIdx]
      if (!table.rows || table.rows === 0) continue
      const rows1 = await client.selectRows(tableIdx, 0, table.rows, 1)
      for (let rowIdx = 0; rowIdx < (rows1 || []).length; rowIdx++) {
        const row = rows1[rowIdx]
        const subTripsRaw = row.r || []
        if (subTripsRaw.length === 0) continue
        const trips: SubTrip[] = []
        for (const trip of subTripsRaw) {
          const tc = trip.c || []
          // Usar unix timestamps t1/t2 para hora precisa
          let horaInicio: string | null = null
          let horaCierre: string | null = null
          let fechaTurno = startDate
          if (trip.t1) {
            const d = new Date(trip.t1 * 1000)
            fechaTurno = d.toLocaleDateString('en-CA', { timeZone: TIMEZONE })
            horaInicio = d.toLocaleTimeString('en-GB', { timeZone: TIMEZONE, hour12: false })
          }
          if (trip.t2) {
            const d = new Date(trip.t2 * 1000)
            horaCierre = d.toLocaleTimeString('en-GB', { timeZone: TIMEZONE, hour12: false })
          }
          const km = extractKm(tc[4])
          const { ibutton, nombre: conductor } = extractConductor(tc[5])
          trips.push({
            horaInicio,
            horaCierre,
            fechaTurno,
            km: Math.round(km * 100) / 100,
            conductor,
            ibutton,
          })
        }
        vehicleSubTrips.set(`${tableIdx}_${rowIdx}`, trips)
      }
    }

    // Clasificar un sub-viaje como diurno o nocturno por su hora de inicio
    function classifyTrip(horaInicio: string | null): 'diurno' | 'nocturno' {
      if (!horaInicio) return 'diurno'
      const min = timeToMinutes(horaInicio)
      return (min >= diurnoInicioMin && min < diurnoFinMin) ? 'diurno' : 'nocturno'
    }

    // Resolver conductor: buscar en asignaciones por nombre Wialon o por turno
    function resolveCondFromAsig(
      asig: AsignacionInfo,
      tripConductor: string | null,
      turno: 'diurno' | 'nocturno' | 'todo_dia',
    ): { nombre: string | null; conductorId: string | null } {
      // 1. Buscar por nombre Wialon (match parcial)
      if (tripConductor) {
        const normalizado = tripConductor.toUpperCase()
        const match = asig.conductores.find(c =>
          c.nombre && normalizado.includes(c.nombre.toUpperCase())
        )
        if (match) return { nombre: match.nombre, conductorId: match.conductorId }
      }
      // 2. Buscar por turno asignado
      const byTurno = asig.conductores.find(c => c.horario === turno)
      if (byTurno) return { nombre: byTurno.nombre, conductorId: byTurno.conductorId }
      // 3. Fallback: primer conductor
      const first = asig.conductores[0]
      if (first) return { nombre: first.nombre, conductorId: first.conductorId }
      return { nombre: null, conductorId: null }
    }

    // Generar registros finales: cada sub-viaje = 1 fila
    const records: BitacoraRecord[] = []
    const vehiculosConDatos = new Set<string>()
    const nowStr = new Date().toISOString()

    for (const vs of vehicleSummaries) {
      vehiculosConDatos.add(vs.patenteNorm)
      const vehiculoId = vMap.get(vs.patenteNorm) || null
      const asig = asignaciones.get(vs.patenteNorm)

      const baseRecord = {
        patente: vs.patente,
        patente_normalizada: vs.patenteNorm,
        vehiculo_id: vehiculoId,
        fecha_turno: vs.fechaTurno,
        wialon_unit_id: vs.unitId,
        synced_at: nowStr,
        updated_at: nowStr,
      }

      // -----------------------------------------------
      // Sin asignacion o A_CARGO: guardar sub-viajes individuales como todo_dia
      // -----------------------------------------------
      if (!asig || asig.modalidad === 'a_cargo') {
        const cond = asig?.conductores?.[0]
        const subTrips = vehicleSubTrips.get(`${vs.tableIdx}_${vs.rowIdx}`) || []

        if (subTrips.length > 0) {
          for (const trip of subTrips) {
            records.push({
              ...baseRecord,
              fecha_turno: trip.fechaTurno,
              conductor_wialon: trip.conductor || cond?.nombre || vs.conductor || null,
              conductor_id: cond?.conductorId || null,
              ibutton: trip.ibutton || vs.ibutton,
              hora_inicio: trip.horaInicio,
              hora_cierre: trip.horaCierre,
              kilometraje: trip.km,
              estado: calcularEstado(trip.horaCierre, trip.km),
              horario: 'todo_dia',
              vehiculo_modalidad: asig ? 'A_CARGO' : null,
            })
          }
        } else {
          // Sin sub-viajes: 1 registro resumen
          records.push({
            ...baseRecord,
            conductor_wialon: cond?.nombre || vs.conductor || null,
            conductor_id: cond?.conductorId || null,
            ibutton: vs.ibutton,
            hora_inicio: vs.horaInicio,
            hora_cierre: vs.horaCierre,
            kilometraje: vs.km,
            estado: calcularEstado(vs.horaCierre, vs.km),
            horario: 'todo_dia',
            vehiculo_modalidad: asig ? 'A_CARGO' : null,
          })
        }
        continue
      }

      // -----------------------------------------------
      // TURNO: guardar cada sub-viaje como fila individual
      // clasificado como diurno/nocturno por hora de inicio
      // -----------------------------------------------
      const subTrips = vehicleSubTrips.get(`${vs.tableIdx}_${vs.rowIdx}`) || []

      if (subTrips.length > 0) {
        for (const trip of subTrips) {
          const turno = classifyTrip(trip.horaInicio)
          const cond = resolveCondFromAsig(asig, trip.conductor, turno)
          records.push({
            ...baseRecord,
            fecha_turno: trip.fechaTurno,
            conductor_wialon: trip.conductor || cond.nombre || null,
            conductor_id: cond.conductorId || null,
            ibutton: trip.ibutton || vs.ibutton,
            hora_inicio: trip.horaInicio,
            hora_cierre: trip.horaCierre,
            kilometraje: trip.km,
            estado: calcularEstado(trip.horaCierre, trip.km),
            horario: turno,
            vehiculo_modalidad: 'TURNO',
          })
        }
      } else {
        // Sin sub-viajes: fallback a 1 registro resumen
        const diurno = asig.conductores.find(c => c.horario === 'diurno')
        const nocturno = asig.conductores.find(c => c.horario === 'nocturno')
        if (diurno) {
          records.push({
            ...baseRecord,
            conductor_wialon: diurno.nombre || vs.conductor || null,
            conductor_id: diurno.conductorId || null,
            ibutton: vs.ibutton,
            hora_inicio: vs.horaInicio,
            hora_cierre: vs.horaCierre,
            kilometraje: vs.km,
            estado: calcularEstado(vs.horaCierre, vs.km),
            horario: 'todo_dia',
            vehiculo_modalidad: 'TURNO',
          })
        } else if (nocturno) {
          records.push({
            ...baseRecord,
            conductor_wialon: nocturno.nombre || vs.conductor || null,
            conductor_id: nocturno.conductorId || null,
            ibutton: vs.ibutton,
            hora_inicio: vs.horaInicio,
            hora_cierre: vs.horaCierre,
            kilometraje: vs.km,
            estado: calcularEstado(vs.horaCierre, vs.km),
            horario: 'todo_dia',
            vehiculo_modalidad: 'TURNO',
          })
        }
      }
    }

    // -----------------------------------------------
    // Registros "Sin Actividad" para vehiculos asignados
    // que no aparecieron en el reporte Wialon
    // -----------------------------------------------
    for (const [patenteNorm, asig] of asignaciones) {
      if (vehiculosConDatos.has(patenteNorm)) continue

      const vehiculoId = vMap.get(patenteNorm) || asig.vehiculoId
      const baseRecord = {
        patente: asig.patente,
        patente_normalizada: patenteNorm,
        vehiculo_id: vehiculoId,
        fecha_turno: startDate,
        wialon_unit_id: null,
        synced_at: nowStr,
        updated_at: nowStr,
      }

      if (asig.modalidad === 'a_cargo') {
        const cond = asig.conductores[0]
        if (cond) {
          records.push({
            ...baseRecord,
            conductor_wialon: cond.nombre || null,
            conductor_id: cond.conductorId || null,
            ibutton: null,
            hora_inicio: null,
            hora_cierre: null,
            kilometraje: 0,
            estado: 'Sin Actividad',
            horario: 'todo_dia',
            vehiculo_modalidad: 'A_CARGO',
          })
        }
      } else {
        // TURNO: generar registros para cada conductor asignado
        for (const cond of asig.conductores) {
          if (cond.horario === 'diurno') {
            records.push({
              ...baseRecord,
              conductor_wialon: cond.nombre || null,
              conductor_id: cond.conductorId || null,
              ibutton: null,
              hora_inicio: shiftHours.diurnoInicio + ':00',
              hora_cierre: shiftHours.diurnoFin + ':00',
              kilometraje: 0,
              estado: 'Sin Actividad',
              horario: 'diurno',
              vehiculo_modalidad: 'TURNO',
            })
          } else if (cond.horario === 'nocturno') {
            // Madrugada
            records.push({
              ...baseRecord,
              conductor_wialon: cond.nombre || null,
              conductor_id: cond.conductorId || null,
              ibutton: null,
              hora_inicio: '00:00:00',
              hora_cierre: shiftHours.diurnoInicio + ':00',
              kilometraje: 0,
              estado: 'Sin Actividad',
              horario: 'nocturno',
              vehiculo_modalidad: 'TURNO',
            })
            // Noche
            records.push({
              ...baseRecord,
              conductor_wialon: cond.nombre || null,
              conductor_id: cond.conductorId || null,
              ibutton: null,
              hora_inicio: shiftHours.diurnoFin + ':00',
              hora_cierre: '23:59:59',
              kilometraje: 0,
              estado: 'Sin Actividad',
              horario: 'nocturno',
              vehiculo_modalidad: 'TURNO',
            })
          } else {
            // todo_dia
            records.push({
              ...baseRecord,
              conductor_wialon: cond.nombre || null,
              conductor_id: cond.conductorId || null,
              ibutton: null,
              hora_inicio: null,
              hora_cierre: null,
              kilometraje: 0,
              estado: 'Sin Actividad',
              horario: 'todo_dia',
              vehiculo_modalidad: 'TURNO',
            })
          }
        }
      }
    }

    // Recalcular estado por conductor+fecha (total km del día, no por sub-viaje)
    const kmPorConductorDia = new Map<string, number>()
    for (const r of records) {
      if (r.estado === 'Sin Actividad') continue
      const key = `${r.conductor_wialon || r.conductor_id || r.patente}_${r.fecha_turno}`
      kmPorConductorDia.set(key, (kmPorConductorDia.get(key) || 0) + r.kilometraje)
    }
    for (const r of records) {
      if (r.estado === 'Sin Actividad' || r.estado === 'En Curso') continue
      const key = `${r.conductor_wialon || r.conductor_id || r.patente}_${r.fecha_turno}`
      const totalKmDia = kmPorConductorDia.get(key) || 0
      r.estado = totalKmDia < POCO_KM_THRESHOLD ? 'Poco Km' : 'Turno Finalizado'
    }

    console.log(`Registros generados: ${records.length} (${vehicleSummaries.length} vehiculos Wialon + sin actividad)`)

    // Delete + Insert
    let guardados = 0
    if (records.length > 0) {
      await supabase.from('wialon_bitacora').delete().eq('fecha_turno', startDate)

      for (let i = 0; i < records.length; i += 100) {
        const batch = records.slice(i, i + 100)
        const { error } = await supabase.from('wialon_bitacora').insert(batch)
        if (!error) guardados += batch.length
        else console.error('Error batch:', error.message)
      }
    }

    if (syncLogId) {
      await supabase
        .from('wialon_bitacora_sync_log')
        .update({
          status: 'success',
          registros_procesados: records.length,
          registros_nuevos: guardados,
          completed_at: new Date().toISOString(),
          execution_time_ms: Date.now() - startTime,
        })
        .eq('id', syncLogId)
    }

    return { success: true, turnos: guardados }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    if (syncLogId) {
      await supabase
        .from('wialon_bitacora_sync_log')
        .update({
          status: 'failed',
          error_message: errorMessage,
          completed_at: new Date().toISOString(),
          execution_time_ms: Date.now() - startTime,
        })
        .eq('id', syncLogId)
    }

    return { success: false, turnos: 0, error: errorMessage }

  } finally {
    await client.logout()
  }
}

// =====================================================
// MAIN
// =====================================================

// Argumentos: fecha opcional (YYYY-MM-DD) o rango (--from YYYY-MM-DD --to YYYY-MM-DD)
const args = Deno.args
const fromIdx = args.indexOf('--from')
const toIdx = args.indexOf('--to')

let datesToSync: string[] = []

if (fromIdx >= 0) {
  const fromDate = args[fromIdx + 1]
  const toDate = toIdx >= 0 ? args[toIdx + 1] : fromDate
  const start = new Date(fromDate + 'T12:00:00Z')
  const end = new Date(toDate + 'T12:00:00Z')
  const d = new Date(start)
  while (d <= end) {
    datesToSync.push(d.toISOString().split('T')[0])
    d.setDate(d.getDate() + 1)
  }
} else if (args.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(args[0])) {
  datesToSync = [args[0]]
}

const nowStr = new Date().toLocaleString('es-AR', { timeZone: TIMEZONE })

if (datesToSync.length > 0) {
  console.log(`[${nowStr}] Sincronizando bitacora Wialon (v2) - ${datesToSync.length} dia(s): ${datesToSync[0]} -> ${datesToSync[datesToSync.length - 1]}`)
  let totalOk = 0
  let totalError = 0
  for (const dateStr of datesToSync) {
    const enc = new TextEncoder()
    Deno.stdout.writeSync(enc.encode(`  ${dateStr}... `))
    const result = await syncBitacora(dateStr)
    if (result.success) {
      console.log(`OK ${result.turnos} registros`)
      totalOk += result.turnos
    } else {
      console.error(`ERROR: ${result.error}`)
      totalError++
    }
  }
  console.log(`Total: ${totalOk} registros, ${totalError} errores`)
} else {
  // Sync hoy + ayer (para recuperar datos si el job falló el día anterior)
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toLocaleDateString('en-CA', { timeZone: TIMEZONE })

  console.log(`[${nowStr}] Sincronizando bitacora Wialon (v2) - hoy + ayer (${yesterdayStr})...`)

  // Primero ayer (para no perder datos)
  const resultAyer = await syncBitacora(yesterdayStr)
  if (resultAyer.success) {
    console.log(`  Ayer (${yesterdayStr}): OK ${resultAyer.turnos} registros`)
  } else {
    console.error(`  Ayer (${yesterdayStr}): ERROR ${resultAyer.error}`)
  }

  // Luego hoy
  const resultHoy = await syncBitacora()
  if (resultHoy.success) {
    console.log(`  Hoy: OK ${resultHoy.turnos} registros sincronizados`)
  } else {
    console.error(`  Hoy: ERROR ${resultHoy.error}`)
    Deno.exit(1)
  }
}
