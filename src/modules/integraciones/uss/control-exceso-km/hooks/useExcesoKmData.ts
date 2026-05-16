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

function normalizarPatente(p: string | null | undefined): string {
  return (p || '').replace(/[\s\-]/g, '').toUpperCase()
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
    const today = getToday()
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

  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {}, 400)
  }, [])

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Ventana estricta: startDate 00:00 ART -> endDate 23:59:59 ART
      const desde = `${dateRange.startDate}T00:00:00`
      const hasta = `${dateRange.endDate}T23:59:59`
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

      const { data: rows, error: e } = await supabase
        .from('uss_historico')
        .select('id, patente, conductor, conductor_raw, ibutton, fecha_hora_inicio_gmt3, fecha_hora_fin_gmt3, kilometraje, sede_id')
        .gte('fecha_hora_inicio_gmt3', desdeExt)
        .lte('fecha_hora_inicio_gmt3', hastaExt)
        .order('patente', { ascending: true })
        .order('fecha_hora_inicio_gmt3', { ascending: true })
      if (e) throw e

      const tripsArr: TripEnriched[] = []
      for (const r of (rows || []) as UssTripRaw[]) {
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
        const { data: conductoresData } = await supabase
          .from('conductores')
          .select('id, nombre_completo, numero_dni')
        for (const c of (conductoresData || []) as any[]) {
          const nom = (c.nombre_completo || '').toUpperCase().trim()
          if (nom && nombresUnicos.includes(nom)) {
            condIdByName.set(nom, { id: c.id, dni: c.numero_dni })
          }
        }
        // Buscar tambien por inclusion (USS suele truncar/diferir formato)
        for (const n of nombresUnicos) {
          if (condIdByName.has(n)) continue
          const match = (conductoresData || []).find((c: any) =>
            c.nombre_completo && n.includes((c.nombre_completo as string).toUpperCase()))
          if (match) condIdByName.set(n, { id: match.id, dni: match.numero_dni })
        }
      }

      // Resolver modalidad/horario por patente via asignaciones_conductores
      const patentesUnicas = [...new Set(turnos.map(t => t.patenteNorm))]
      const vehInfoByPatente = new Map<string, { modalidad: string | null }>()
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
          const { data: asigs } = await supabase
            .from('asignaciones_conductores')
            .select('vehiculo_id, modalidad, fecha_desde, fecha_hasta, estado')
            .in('vehiculo_id', vehIds)
            .eq('estado', 'activo')
          // Quedarse con la asignacion vigente al endDate
          const endDateStr = dateRange.endDate
          for (const a of (asigs || []) as any[]) {
            const desd = a.fecha_desde || ''
            const hasta_ = a.fecha_hasta || '9999-12-31'
            if (desd <= endDateStr && endDateStr <= hasta_) {
              const patNorm = [...vehiculoByPatente.entries()].find(([, id]) => id === a.vehiculo_id)?.[0]
              if (patNorm) vehInfoByPatente.set(patNorm, { modalidad: a.modalidad || 'turno' })
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

        // Calcular fecha_turno y entrada/salida en ART
        const fechaTurno = new Date(primero.inicioMs).toLocaleDateString('en-CA', { timeZone: TIMEZONE_ARGENTINA })
        const fmtHora = (ms: number) => {
          const d = new Date(ms)
          const h = d.toLocaleTimeString('es-AR', { timeZone: TIMEZONE_ARGENTINA, hour: '2-digit', minute: '2-digit', hour12: false })
          return h
        }
        const duracionMin = Math.round(t.trips.reduce((s, x) => s + (x.finMs - x.inicioMs), 0) / 60000)

        const m: Marcacion = {
          id: `excesoKM-${idx}`,
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
          horario: 'todo_dia',
          vehiculoModalidad: modalidad,
          gncCargado: false,
          lavadoRealizado: false,
          naftaCargada: false,
          gpsOrigen: 'USS',
        }
        return m
      })

      // 8) Calcular suma semanal por conductor para aplicar excedeLimite
      const sumKmPorConductor = new Map<string, { km: number; modalidad: string }>()
      for (const m of marcs) {
        const key = m.conductorId || m.conductor || ''
        if (!key) continue
        const prev = sumKmPorConductor.get(key) || { km: 0, modalidad: m.vehiculoModalidad || 'turno' }
        prev.km += m.kmTotal
        if (m.vehiculoModalidad === 'a_cargo') prev.modalidad = 'a_cargo'
        sumKmPorConductor.set(key, prev)
      }
      for (const m of marcs) {
        const key = m.conductorId || m.conductor || ''
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

      setMarcaciones(marcs)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
      setMarcaciones([])
    } finally {
      setLoading(false)
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
