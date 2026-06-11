// Hook dedicado para Control de Exceso de KM.
// A diferencia de Bitacora, este hook calcula los km SEMANALES con corte estricto
// (lunes 00:00 -> domingo 23:59:59 ART) yendo DIRECTO a uss_historico, sin pasar
// por wialon_bitacora. Razon: un turno que cruza el corte semanal debe partirse,
// y los km del domingo van a la semana del domingo, los del lunes a la siguiente.
//
// Solo lectura. NO toca uss_historico, geotab ni wialon_bitacora.
// Solo USS (geotab queda excluido en este modulo).

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../../../../lib/supabase'
import type { Marcacion } from '../../bitacora/hooks/useUSSHistoricoData'

const TIMEZONE_ARGENTINA = 'America/Argentina/Buenos_Aires'

function toArgentinaDateString(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: TIMEZONE_ARGENTINA })
}

function getToday(): string {
  return toArgentinaDateString(new Date())
}

interface ExcesoKmWeekInfo {
  semana: number
  anio: number
  inicio: string
  fin: string
  key: string
}

function toLocalDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function getISOWeekInfo(dateStr: string): ExcesoKmWeekInfo {
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(year, month - 1, day, 12, 0, 0)
  const dow = date.getDay() === 0 ? 7 : date.getDay()

  const monday = new Date(date)
  monday.setDate(date.getDate() - (dow - 1))

  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)

  const target = new Date(date)
  target.setDate(date.getDate() + 4 - (date.getDay() || 7))
  const yearStart = new Date(target.getFullYear(), 0, 1)
  const semana = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  const anio = target.getFullYear()

  return {
    semana,
    anio,
    inicio: toLocalDateString(monday),
    fin: toLocalDateString(sunday),
    key: `${anio}-${String(semana).padStart(2, '0')}`,
  }
}

function normalizarPatente(p: string | null | undefined): string {
  return (p || '').replace(/[\s-]/g, '').toUpperCase()
}

function parseRawConductores(raw: string | null): string[] {
  if (!raw) return []
  return raw.split(',').map(s => {
    const dash = s.indexOf('-')
    return (dash >= 0 ? s.slice(dash + 1) : s).trim().toUpperCase()
  }).filter(n => n.length > 0)
}

interface UssTripRaw {
  id: number
  patente: string
  conductor: string | null
  conductor_raw: string | null
  ibutton: string | null
  fecha_hora_inicio_gmt3: string
  fecha_hora_fin_gmt3: string | null
  kilometraje: string | null
  sede_id: string | null
}

interface TripEnriched extends UssTripRaw {
  patenteNorm: string
  condEf: string | null
  inicioMs: number
  finMs: number
  kmNum: number
}

export interface ExcesoKmDateRange {
  startDate: string
  endDate: string
  label: string
}

export function useExcesoKmData(sedeId?: string | null) {
  const [dateRange, setDateRange] = useState<ExcesoKmDateRange>(() => {
    // Default: lunes a domingo de la semana actual (ART)
    const d = new Date()
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    d.setDate(diff)
    const monday = toArgentinaDateString(d)
    const dom = new Date(d); dom.setDate(d.getDate() + 6)
    return {
      startDate: monday,
      endDate: toArgentinaDateString(dom),
      label: 'Esta semana',
    }
  })

  const [marcaciones, setMarcaciones] = useState<Marcacion[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [searchTerm, setSearchTerm] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Guard "última request gana": al cambiar el rango rápido (semana -> año, etc.)
  // varios loadData se solapan; el año pagina ~22k filas y puede responder tarde.
  // Cada llamada toma un id y solo aplica su resultado si sigue siendo la vigente.
  const requestIdRef = useRef(0)

  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {}, 400)
  }, [])

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [])

  const loadData = useCallback(async () => {
    const reqId = ++requestIdRef.current
    const isStale = () => requestIdRef.current !== reqId
    setLoading(true)
    setError(null)
    try {
      // Ventana estricta: startDate 00:00 ART -> endDate 23:59:59 ART
      const weekStartMs = new Date(`${dateRange.startDate}T00:00:00-03:00`).getTime()
      const weekEndMs = new Date(`${dateRange.endDate}T23:59:59-03:00`).getTime()

      // Filtrar por sede si aplica
      let sedePatentes: string[] | null = null
      if (sedeId) {
        const { data: vehiculos } = await supabase
          .from('vehiculos')
          .select('patente')
          .eq('sede_id', sedeId)
          .is('deleted_at', null)
        if (vehiculos && vehiculos.length > 0) {
          sedePatentes = vehiculos.map((v: { patente: string }) => normalizarPatente(v.patente))
        } else {
          if (isStale()) return
          setMarcaciones([])
          setLoading(false)
          return
        }
      }

      // 1) Trips de USS_HISTORICO en la ventana. Pedimos tambien 1 dia antes y 1 despues
      //    para que la logica de "vecino mas cercano" (huerfano + multi) tenga contexto.
      const desdeExt = (() => {
        const d = new Date(`${dateRange.startDate}T00:00:00-03:00`)
        d.setDate(d.getDate() - 1)
        return d.toISOString().slice(0, 10) + 'T00:00:00'
      })()
      const hastaExt = (() => {
        const d = new Date(`${dateRange.endDate}T00:00:00-03:00`)
        d.setDate(d.getDate() + 1)
        return d.toISOString().slice(0, 10) + 'T23:59:59'
      })()

      // Paginación: PostgREST limita a 1000 filas por request. Un rango de mes/año
      // supera ese tope (un mes ~6k viajes), así que iteramos con .range() hasta
      // agotar; de lo contrario el desglose semanal quedaría incompleto.
      const PAGE = 1000
      const rows: UssTripRaw[] = []
      for (let offset = 0; ; offset += PAGE) {
        const { data: page, error: e } = await supabase
          .from('uss_historico')
          .select('id, patente, conductor, conductor_raw, ibutton, fecha_hora_inicio_gmt3, fecha_hora_fin_gmt3, kilometraje, sede_id')
          .gte('fecha_hora_inicio_gmt3', desdeExt)
          .lte('fecha_hora_inicio_gmt3', hastaExt)
          .order('patente', { ascending: true })
          .order('fecha_hora_inicio_gmt3', { ascending: true })
          .range(offset, offset + PAGE - 1)
        if (e) throw e
        const batch = (page || []) as UssTripRaw[]
        rows.push(...batch)
        if (batch.length < PAGE) break
      }

      const tripsArr: TripEnriched[] = []
      for (const r of rows) {
        const patenteNorm = normalizarPatente(r.patente)
        if (!patenteNorm) continue
        if (sedePatentes !== null && !sedePatentes.includes(patenteNorm)) continue
        const km = parseFloat(String(r.kilometraje || '0').replace(/[^\d.]/g, '')) || 0
        const inicioMs = new Date(`${r.fecha_hora_inicio_gmt3.replace(' ', 'T')}-03:00`).getTime()
        const finMs = r.fecha_hora_fin_gmt3
          ? new Date(`${r.fecha_hora_fin_gmt3.replace(' ', 'T')}-03:00`).getTime()
          : inicioMs
        tripsArr.push({
          ...r,
          patenteNorm,
          condEf: null,
          inicioMs,
          finMs,
          kmNum: Math.round(km * 100) / 100,
        })
      }

      // 2) Resolver conductor efectivo (huerfano hereda, multi se asigna al vecino mas cercano)
      for (let i = 0; i < tripsArr.length; i++) {
        const t = tripsArr[i]
        const cs = parseRawConductores(t.conductor_raw)
        const titular = (t.conductor || '').trim().toUpperCase() || null

        // Huerfano: sin titular y sin conductores en raw
        if (!titular && cs.length === 0) {
          let prev: TripEnriched | null = null
          let next: TripEnriched | null = null
          for (let j = i - 1; j >= 0; j--) {
            if (tripsArr[j].patenteNorm !== t.patenteNorm) break
            if ((tripsArr[j].conductor || '').trim()) { prev = tripsArr[j]; break }
          }
          for (let j = i + 1; j < tripsArr.length; j++) {
            if (tripsArr[j].patenteNorm !== t.patenteNorm) break
            if ((tripsArr[j].conductor || '').trim()) { next = tripsArr[j]; break }
          }
          let chosen: TripEnriched | null = null
          if (prev && next) {
            const gp = t.inicioMs - prev.finMs
            const gn = next.inicioMs - t.finMs
            chosen = gp <= gn ? prev : next
          } else chosen = prev || next
          t.condEf = (chosen?.conductor || '').trim().toUpperCase() || null
          continue
        }

        // Multi-conductor
        if (cs.length >= 2) {
          const bestGap = new Map<string, number>()
          for (let j = i - 1; j >= 0; j--) {
            if (tripsArr[j].patenteNorm !== t.patenteNorm) break
            const vr = parseRawConductores(tripsArr[j].conductor_raw)
            if (vr.length !== 1) continue
            if (!cs.includes(vr[0])) continue
            const g = t.inicioMs - tripsArr[j].finMs
            const p = bestGap.get(vr[0])
            if (p === undefined || g < p) bestGap.set(vr[0], g)
            break
          }
          for (let j = i + 1; j < tripsArr.length; j++) {
            if (tripsArr[j].patenteNorm !== t.patenteNorm) break
            const vr = parseRawConductores(tripsArr[j].conductor_raw)
            if (vr.length !== 1) continue
            if (!cs.includes(vr[0])) continue
            const g = tripsArr[j].inicioMs - t.finMs
            const p = bestGap.get(vr[0])
            if (p === undefined || g < p) bestGap.set(vr[0], g)
            break
          }
          let receptor: string | null = null
          if (bestGap.size === 0) {
            receptor = titular
          } else if (bestGap.size === cs.length) {
            let m = Infinity
            for (const [n, g] of bestGap.entries()) if (g < m) { m = g; receptor = n }
          } else {
            const huer = cs.filter(c => !bestGap.has(c))
            receptor = huer.length === 1 ? huer[0] : titular
          }
          t.condEf = receptor
          continue
        }

        // Trip normal
        t.condEf = titular
      }

      // 3) Filtrar trips cuyo inicio caiga ESTRICTAMENTE en la semana visible.
      //    (Los del dia antes/despues solo sirvieron para resolver vecinos.)
      const tripsSemana = tripsArr.filter(t => t.inicioMs >= weekStartMs && t.inicioMs <= weekEndMs)

      // 4) Agrupar por (conductorEf + patente) y armar "marcaciones".
      //    En este modulo cada marcacion = 1 turno continuo del mismo conductor en la misma patente.
      //    Como vamos directo a trips, agrupamos consecutivos por condEf + patente.
      interface Turno {
        conductor: string
        patenteNorm: string
        patente: string
        trips: TripEnriched[]
      }
      const turnos: Turno[] = []
      let actual: Turno | null = null
      const ordenados = [...tripsSemana].sort((a, b) => {
        if (a.patenteNorm !== b.patenteNorm) return a.patenteNorm.localeCompare(b.patenteNorm)
        return a.inicioMs - b.inicioMs
      })
      for (const t of ordenados) {
        const cond = t.condEf || ''
        if (!cond) continue
        if (!actual || actual.patenteNorm !== t.patenteNorm || actual.conductor !== cond) {
          if (actual) turnos.push(actual)
          actual = { conductor: cond, patenteNorm: t.patenteNorm, patente: t.patente, trips: [t] }
        } else {
          actual.trips.push(t)
        }
      }
      if (actual) turnos.push(actual)

      // 5) Cargar limites configurables y modalidad/horario via asignaciones
      const { data: limiteParams } = await supabase
        .from('parametros_sistema')
        .select('clave, valor')
        .in('clave', ['limite_km_semanal_turno', 'limite_km_semanal_a_cargo'])
      let limiteTurno = 1800
      let limiteACargo = 3600
      for (const p of (limiteParams || []) as any[]) {
        const v = parseFloat(p.valor)
        if (!isNaN(v) && v > 0) {
          if (p.clave === 'limite_km_semanal_turno') limiteTurno = v
          if (p.clave === 'limite_km_semanal_a_cargo') limiteACargo = v
        }
      }

      // 6) Resolver conductor_id, DNI, modalidad y horario por nombre/patente
      //    Buscamos en conductores activos por nombre (case-insensitive).
      const nombresUnicos = [...new Set(turnos.map(t => t.conductor))].filter(Boolean)
      const condIdByName = new Map<string, { id: string; dni: string | null }>()
      if (nombresUnicos.length > 0) {
        // FIX 2026-05-19: la tabla conductores tiene `nombres` y `apellidos`, no `nombre_completo`
        const { data: conductoresData } = await supabase
          .from('conductores')
          .select('id, nombres, apellidos, numero_dni')
        const conductoresNorm = ((conductoresData || []) as any[]).map(c => {
          const full = `${c.nombres || ''} ${c.apellidos || ''}`.toUpperCase().trim().replace(/\s+/g, ' ')
          const fullRev = `${c.apellidos || ''} ${c.nombres || ''}`.toUpperCase().trim().replace(/\s+/g, ' ')
          return { id: c.id as string, dni: c.numero_dni as string | null, full, fullRev }
        })
        for (const c of conductoresNorm) {
          if (c.full && nombresUnicos.includes(c.full)) {
            condIdByName.set(c.full, { id: c.id, dni: c.dni })
          } else if (c.fullRev && nombresUnicos.includes(c.fullRev)) {
            condIdByName.set(c.fullRev, { id: c.id, dni: c.dni })
          }
        }
        // Buscar tambien por inclusion (USS suele truncar/diferir formato)
        for (const n of nombresUnicos) {
          if (condIdByName.has(n)) continue
          const nUpper = (n as string).toUpperCase()
          const match = conductoresNorm.find(c =>
            (c.full && (nUpper.includes(c.full) || c.full.includes(nUpper))) ||
            (c.fullRev && (nUpper.includes(c.fullRev) || c.fullRev.includes(nUpper))),
          )
          if (match) condIdByName.set(n, { id: match.id, dni: match.dni })
        }
      }

      // Resolver modalidad/horario por patente + conductor via asignaciones + asignaciones_conductores
      const patentesUnicas = [...new Set(turnos.map(t => t.patenteNorm))]
      const vehInfoByPatente = new Map<string, { modalidad: string | null }>()
      // Mapa horario por (patente_norm + conductor_id) para distinguir cuando hay 2 conductores en 1 vehiculo
      const horarioByPatenteCond = new Map<string, string>()
      if (patentesUnicas.length > 0) {
        const { data: vehiculosData } = await supabase
          .from('vehiculos')
          .select('id, patente')
        const vehiculoByPatente = new Map<string, string>()
        for (const v of (vehiculosData || []) as any[]) {
          vehiculoByPatente.set(normalizarPatente(v.patente), v.id)
        }
        const vehIds = [...vehiculoByPatente.values()]
        if (vehIds.length > 0) {
          // FIX 2026-05-19: la modalidad ('turno' | 'a_cargo') vive en `asignaciones`
          // (no en `asignaciones_conductores`). La tabla correcta tiene fecha_inicio/fecha_fin.
          // Adicionalmente leemos `asignaciones_conductores.horario` (diurno/nocturno/todo_dia)
          // para mostrar el turno por conductor en la columna TURNO.
          const { data: asigs } = await supabase
            .from('asignaciones')
            .select('id, vehiculo_id, modalidad, fecha_inicio, fecha_fin, estado, asignaciones_conductores(conductor_id, horario, estado)')
            .in('vehiculo_id', vehIds)
            .in('estado', ['activa', 'activo'])
          // Quedarse con la asignacion vigente al endDate
          const endDateStr = dateRange.endDate
          for (const a of (asigs || []) as any[]) {
            const desd = a.fecha_inicio || ''
            const hasta_ = a.fecha_fin || '9999-12-31'
            if (desd <= endDateStr && endDateStr <= hasta_) {
              const patNorm = [...vehiculoByPatente.entries()].find(([, id]) => id === a.vehiculo_id)?.[0]
              if (!patNorm) continue
              vehInfoByPatente.set(patNorm, { modalidad: a.modalidad || 'turno' })
              // Mapear horario por conductor (puede haber 2 conductores asignados al mismo vehiculo)
              const acs = (a.asignaciones_conductores || []) as Array<{ conductor_id: string; horario: string | null; estado?: string }>
              for (const ac of acs) {
                if (!ac.conductor_id) continue
                // Solo asignaciones del conductor que esten vigentes (no canceladas/finalizadas)
                if (ac.estado && !['asignado', 'completado', 'activa', 'activo'].includes(ac.estado)) continue
                if (ac.horario) {
                  horarioByPatenteCond.set(`${patNorm}|${ac.conductor_id}`, ac.horario)
                }
              }
            }
          }
        }
      }

      // 7) Transformar a Marcacion (interfaz que la tabla espera)
      const marcs: Marcacion[] = turnos.map((t, idx) => {
        const primero = t.trips[0]
        const ultimo = t.trips[t.trips.length - 1]
        const kmTotal = Math.round(t.trips.reduce((s, x) => s + x.kmNum, 0) * 100) / 100
        const inicioStr = new Date(primero.inicioMs).toISOString()
        const finStr = new Date(ultimo.finMs).toISOString()
        const condInfo = condIdByName.get(t.conductor)
        const vehInfo = vehInfoByPatente.get(t.patenteNorm)
        const modalidad = vehInfo?.modalidad || 'turno'
        // FIX 2026-05-19: cruzar horario (diurno/nocturno/todo_dia) desde asignaciones_conductores
        const horarioCond = condInfo?.id
          ? (horarioByPatenteCond.get(`${t.patenteNorm}|${condInfo.id}`) || 'todo_dia')
          : 'todo_dia'

        // Calcular fecha_turno y entrada/salida en ART
        const fechaTurno = new Date(primero.inicioMs).toLocaleDateString('en-CA', { timeZone: TIMEZONE_ARGENTINA })
        const semanaInfo = getISOWeekInfo(fechaTurno)
        const fmtHora = (ms: number) => {
          const d = new Date(ms)
          const h = d.toLocaleTimeString('es-AR', { timeZone: TIMEZONE_ARGENTINA, hour: '2-digit', minute: '2-digit', hour12: false })
          return h
        }
        const duracionMin = Math.round(t.trips.reduce((s, x) => s + (x.finMs - x.inicioMs), 0) / 60000)

        const m: Marcacion = {
          id: `excesoKM-${semanaInfo.key}-${idx}`,
          conductor: t.conductor,
          conductorId: condInfo?.id || null,
          conductorDni: condInfo?.dni || null,
          ibutton: primero.ibutton,
          fecha: fechaTurno,
          patente: t.patente,
          patenteNormalizada: t.patenteNorm,
          entrada: fmtHora(primero.inicioMs),
          salida: fmtHora(ultimo.finMs),
          periodoInicio: inicioStr,
          periodoFin: finStr,
          kmTotal,
          duracionMinutos: duracionMin,
          estado: 'Turno Finalizado',
          horario: horarioCond,
          vehiculoModalidad: modalidad,
          gncCargado: false,
          lavadoRealizado: false,
          naftaCargada: false,
          gpsOrigen: 'USS',
          excesoKmSemana: semanaInfo.semana,
          excesoKmAnio: semanaInfo.anio,
          excesoKmSemanaInicio: semanaInfo.inicio,
          excesoKmSemanaFin: semanaInfo.fin,
          excesoKmSemanaKey: semanaInfo.key,
        }
        return m
      })

      // 8) Calcular suma semanal por conductor para aplicar excedeLimite
      const sumKmPorConductor = new Map<string, { km: number; modalidad: string }>()
      for (const m of marcs) {
        const conductorKey = m.conductorId || m.conductor || ''
        if (!conductorKey) continue
        const key = `${m.excesoKmSemanaKey || 'sin-semana'}|${conductorKey}`
        const prev = sumKmPorConductor.get(key) || { km: 0, modalidad: m.vehiculoModalidad || 'turno' }
        prev.km += m.kmTotal
        if (m.vehiculoModalidad === 'a_cargo') prev.modalidad = 'a_cargo'
        sumKmPorConductor.set(key, prev)
      }
      for (const m of marcs) {
        const conductorKey = m.conductorId || m.conductor || ''
        const key = `${m.excesoKmSemanaKey || 'sin-semana'}|${conductorKey}`
        const acc = sumKmPorConductor.get(key)
        if (acc) {
          const limite = acc.modalidad === 'a_cargo' ? limiteACargo : limiteTurno
          m.kmSemanaConductor = Math.round(acc.km * 100) / 100
          m.limiteSemanal = limite
          m.excedeLimite = acc.km > limite
        } else {
          m.limiteSemanal = (m.vehiculoModalidad === 'a_cargo') ? limiteACargo : limiteTurno
          m.kmSemanaConductor = 0
          m.excedeLimite = false
        }
      }

      // Descartar si una request más nueva ya tomó el relevo (evita que el año,
      // que tarda más, pise los datos de una semana seleccionada después).
      if (isStale()) return
      setMarcaciones(marcs)
    } catch (err) {
      if (isStale()) return
      setError(err instanceof Error ? err.message : 'Error desconocido')
      setMarcaciones([])
    } finally {
      // Solo la request vigente controla el spinner.
      if (!isStale()) setLoading(false)
    }
  }, [dateRange, sedeId])

  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      loadData()
      return
    }
    loadData()
  }, [loadData])

  const setDateRangePreset = useCallback((preset: string) => {
    const today = getToday()
    switch (preset) {
      case 'today':
        setDateRange({ startDate: today, endDate: today, label: 'Hoy' })
        break
      case 'yesterday': {
        const d = new Date()
        d.setDate(d.getDate() - 1)
        const yd = toArgentinaDateString(d)
        setDateRange({ startDate: yd, endDate: yd, label: 'Ayer' })
        break
      }
      case 'week': {
        const ahoraArt = new Date(new Date().toLocaleString('en-US', { timeZone: TIMEZONE_ARGENTINA }))
        const dow = ahoraArt.getDay() === 0 ? 7 : ahoraArt.getDay()
        const lunes = new Date(ahoraArt)
        lunes.setDate(ahoraArt.getDate() - (dow - 1))
        lunes.setHours(0, 0, 0, 0)
        const domingo = new Date(lunes)
        domingo.setDate(lunes.getDate() + 6)
        domingo.setHours(23, 59, 59, 999)
        setDateRange({
          startDate: toArgentinaDateString(lunes),
          endDate: toArgentinaDateString(domingo),
          label: 'Esta semana',
        })
        break
      }
      case 'month': {
        const d = new Date()
        d.setDate(1)
        setDateRange({ startDate: toArgentinaDateString(d), endDate: today, label: 'Este mes' })
        break
      }
    }
  }, [])

  const setCustomDateRange = useCallback((startDate: string, endDate: string, label?: string) => {
    setDateRange({ startDate, endDate, label: label || 'Personalizado' })
  }, [])

  return {
    marcaciones,
    loading,
    error,
    dateRange,
    setDateRangePreset,
    setCustomDateRange,
    searchTerm,
    handleSearchChange,
    refresh: loadData,
  }
}
