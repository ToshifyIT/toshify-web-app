// src/modules/integraciones/uss/bitacora/hooks/useBitacoraData.ts
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../../../../lib/supabase'
import {
  wialonBitacoraService,
  type BitacoraRegistroTransformado,
} from '../../../../../services/wialonBitacoraService'
import type {
  BitacoraStats,
  BitacoraDateRange,
  BitacoraQueryState,
} from '../types/bitacora.types'
import { BITACORA_CONSTANTS } from '../constants/bitacora.constants'

// Intervalo de auto-refresh en ms (30 segundos)
const AUTO_REFRESH_INTERVAL = 30000

// Tipo para asignaciones
interface AsignacionActiva {
  patente: string
  patente_normalizada: string
  conductor_nombre: string
  conductor_apellido: string
  conductor_completo: string
}

// Helpers para fechas
function getToday(): string {
  return new Date().toISOString().split('T')[0]
}

function getYesterday(): string {
  const date = new Date()
  date.setDate(date.getDate() - 1)
  return date.toISOString().split('T')[0]
}

function getStartOfWeek(): string {
  const date = new Date()
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  date.setDate(diff)
  return date.toISOString().split('T')[0]
}

function getStartOfMonth(): string {
  const date = new Date()
  date.setDate(1)
  return date.toISOString().split('T')[0]
}

export function useBitacoraData() {
  // Estado de fechas - Default a "Hoy" para datos en tiempo real
  const [dateRange, setDateRange] = useState<BitacoraDateRange>({
    startDate: getToday(),
    endDate: getToday(),
    label: 'Hoy',
  })

  // Estado de datos
  const [registros, setRegistros] = useState<BitacoraRegistroTransformado[]>([])
  const [stats, setStats] = useState<BitacoraStats | null>(null)
  const [totalCount, setTotalCount] = useState(0)
  const [asignaciones, setAsignaciones] = useState<Map<string, AsignacionActiva>>(new Map())

  // Estado de paginación
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(BITACORA_CONSTANTS.DEFAULT_PAGE_SIZE)

  // Estado de filtros
  const [filterPatente, setFilterPatente] = useState('')
  const [filterConductor, setFilterConductor] = useState('')
  const [filterEstado, setFilterEstado] = useState('')

  // Estado de query
  const [queryState, setQueryState] = useState<BitacoraQueryState>({
    loading: false,
    error: null,
    lastUpdate: null,
  })

  // Cargar asignaciones activas
  const loadAsignaciones = useCallback(async () => {
    const { data } = await supabase
      .from('asignaciones')
      .select(`
        vehiculo_id,
        vehiculos!inner(patente),
        conductores!inner(nombres, apellidos)
      `)
      .eq('estado', 'activa') as {
      data: Array<{
        vehiculo_id: string
        vehiculos: { patente: string }
        conductores: { nombres: string; apellidos: string }
      }> | null
    }

    if (data) {
      const map = new Map<string, AsignacionActiva>()
      for (const row of data) {
        const vehiculo = row.vehiculos
        const conductor = row.conductores

        if (vehiculo && conductor) {
          const patenteNorm = vehiculo.patente.replace(/\s/g, '').toUpperCase()
          map.set(patenteNorm, {
            patente: vehiculo.patente,
            patente_normalizada: patenteNorm,
            conductor_nombre: conductor.nombres,
            conductor_apellido: conductor.apellidos,
            conductor_completo: `${conductor.nombres} ${conductor.apellidos}`,
          })
        }
      }
      setAsignaciones(map)
    }
  }, [])

  // Cargar asignaciones al montar
  useEffect(() => {
    loadAsignaciones()
  }, [loadAsignaciones])

  // Cargar datos
  const loadData = useCallback(async () => {
    setQueryState((prev) => ({ ...prev, loading: true, error: null }))

    try {
      const offset = (page - 1) * pageSize

      const [bitacoraResult, statsResult] = await Promise.all([
        wialonBitacoraService.getBitacora(dateRange.startDate, dateRange.endDate, {
          limit: pageSize,
          offset,
          patente: filterPatente || undefined,
          conductor: filterConductor || undefined,
          estado: filterEstado || undefined,
        }),
        wialonBitacoraService.getStats(dateRange.startDate, dateRange.endDate),
      ])

      // Cruzar con asignaciones
      const registrosEnriquecidos = bitacoraResult.data.map((r) => {
        const asignacion = asignaciones.get(r.patente_normalizada)
        if (asignacion) {
          return {
            ...r,
            conductor_wialon: asignacion.conductor_completo,
          }
        }
        return r
      })

      setRegistros(registrosEnriquecidos)
      setTotalCount(bitacoraResult.count)
      setStats(statsResult)
      setQueryState({
        loading: false,
        error: null,
        lastUpdate: new Date(),
      })
    } catch (error) {
      setQueryState({
        loading: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
        lastUpdate: null,
      })
    }
  }, [dateRange, page, pageSize, filterPatente, filterConductor, filterEstado, asignaciones])

  // Cargar datos automáticamente al montar
  useEffect(() => {
    loadAsignaciones().then(() => loadData())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Solo al montar

  // Cargar datos cuando cambian los parámetros (excepto al montar)
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    if (asignaciones.size > 0 || !queryState.loading) {
      loadData()
    }
  }, [loadData, asignaciones.size])

  // Auto-refresh: Suscripción a Supabase Realtime para cambios en wialon_bitacora
  useEffect(() => {
    // Solo auto-refresh si estamos viendo "Hoy"
    if (dateRange.label !== 'Hoy') return

    const channel = supabase
      .channel('wialon_bitacora_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'wialon_bitacora',
        },
        () => {
          // Cuando hay cambios en la tabla, recargar datos
          wialonBitacoraService.clearCache()
          loadData()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [dateRange.label, loadData])

  // Auto-refresh con intervalo como fallback (cada 30 segundos cuando vemos "Hoy")
  useEffect(() => {
    if (dateRange.label !== 'Hoy') return

    const intervalId = setInterval(() => {
      wialonBitacoraService.clearCache()
      loadData()
    }, AUTO_REFRESH_INTERVAL)

    return () => clearInterval(intervalId)
  }, [dateRange.label, loadData])

  // Cambiar rango de fecha predefinido
  const setDateRangePreset = useCallback((preset: string) => {
    const today = getToday()

    switch (preset) {
      case 'today':
        setDateRange({ startDate: today, endDate: today, label: 'Hoy' })
        break
      case 'yesterday':
        const yesterday = getYesterday()
        setDateRange({ startDate: yesterday, endDate: yesterday, label: 'Ayer' })
        break
      case 'week':
        setDateRange({ startDate: getStartOfWeek(), endDate: today, label: 'Esta semana' })
        break
      case 'month':
        setDateRange({ startDate: getStartOfMonth(), endDate: today, label: 'Este mes' })
        break
    }
    setPage(1)
  }, [])

  // Cambiar rango de fecha personalizado
  const setCustomDateRange = useCallback((startDate: string, endDate: string) => {
    setDateRange({ startDate, endDate, label: 'Personalizado' })
    setPage(1)
  }, [])

  // Actualizar checklist
  const updateChecklist = useCallback(
    async (
      id: string,
      field: 'gnc_cargado' | 'lavado_realizado' | 'nafta_cargada',
      value: boolean
    ) => {
      try {
        await wialonBitacoraService.updateChecklist(id, { [field]: value })

        setRegistros((prev) =>
          prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
        )
      } catch (error) {
        console.error('Error actualizando checklist:', error)
        throw error
      }
    },
    []
  )

  // Actualizar estado
  const updateEstado = useCallback(async (id: string, estado: string) => {
    try {
      await wialonBitacoraService.updateEstado(id, estado)
      setRegistros((prev) => prev.map((r) => (r.id === id ? { ...r, estado } : r)))
    } catch (error) {
      console.error('Error actualizando estado:', error)
      throw error
    }
  }, [])

  // Refrescar datos
  const refresh = useCallback(() => {
    wialonBitacoraService.clearCache()
    loadAsignaciones()
    loadData()
  }, [loadData, loadAsignaciones])

  // Sincronizar - Solo recarga datos (uss_historico se sincroniza automáticamente)
  const triggerSync = useCallback(async () => {
    setQueryState((prev) => ({ ...prev, loading: true }))
    wialonBitacoraService.clearCache()
    await loadData()
    return { success: true }
  }, [loadData])

  return {
    // Datos
    registros,
    stats,
    totalCount,

    // Estado de query
    queryState,

    // Fechas
    dateRange,
    setDateRangePreset,
    setCustomDateRange,

    // Paginación
    page,
    setPage,
    pageSize,
    setPageSize,

    // Filtros
    filterPatente,
    setFilterPatente,
    filterConductor,
    setFilterConductor,
    filterEstado,
    setFilterEstado,

    // Acciones
    updateChecklist,
    updateEstado,
    refresh,
    triggerSync,
  }
}
