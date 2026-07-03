import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../../../../lib/supabase'
import { fetchAlertasPage, marcarAtendida, descartarAlerta, reactivarAlerta } from '../../../../services/alertasService'
import type { AlertaMantenimiento, AlertasStats } from '../types/alertas.types'

const SERVICE_INTERVAL = 10000

// Carga progresiva: el primer lote pinta la tabla enseguida (clave en
// conexiones lentas); el resto baja en background sin bloquear la UI.
const PRIMER_LOTE = 100
const LOTE_BACKGROUND = 1000
const MAX_FILAS = 10000
// El realtime dispara muchos eventos por corrida del sync (cada ~1 min).
// Coalescemos: como mucho un refetch por minuto.
const REFETCH_MIN_MS = 60_000

/**
 * Calcula prioridad del vehículo según km que faltan para el próximo service.
 * Menor número = más urgente. Se usa para ordenar la tabla con Vencido/Próximo primero.
 */
function prioridadServicio(alerta: AlertaMantenimiento): number {
  const km = alerta.vehiculo?.kilometraje_actual
  if (km == null) return 999_999  // Sin datos al final
  const proxService = Math.ceil(km / SERVICE_INTERVAL) * SERVICE_INTERVAL
  const faltan = proxService - km
  // Vencido = negativo → bien arriba
  // Próximo = positivo pequeño → después
  // Al día = positivo grande → al final
  return faltan
}

export function useAlertasData(sedeId?: string | null) {
  const [alertasRaw, setAlertasRaw] = useState<AlertaMantenimiento[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Generación de carga: si arranca una carga nueva (cambio de sede, refetch),
  // los lotes en background de la carga anterior se descartan.
  const generacionRef = useRef(0)
  const ultimoFetchRef = useRef(0)

  const cargar = useCallback(async () => {
    const gen = ++generacionRef.current
    ultimoFetchRef.current = Date.now()
    setLoading(true)
    setError(null)
    try {
      // Primer lote: rápido, pinta la tabla
      const primerLote = await fetchAlertasPage(sedeId, 0, PRIMER_LOTE - 1)
      if (gen !== generacionRef.current) return
      setAlertasRaw(primerLote)
      setLoading(false)
      // Resto en background, por lotes
      if (primerLote.length < PRIMER_LOTE) return
      let desde = PRIMER_LOTE
      while (desde < MAX_FILAS) {
        const lote = await fetchAlertasPage(sedeId, desde, desde + LOTE_BACKGROUND - 1)
        if (gen !== generacionRef.current) return
        if (lote.length === 0) break
        setAlertasRaw(prev => [...prev, ...lote])
        if (lote.length < LOTE_BACKGROUND) break
        desde += LOTE_BACKGROUND
      }
    } catch (e) {
      if (gen !== generacionRef.current) return
      setError(e instanceof Error ? e.message : 'Error desconocido')
      setLoading(false)
    }
  }, [sedeId])

  // Ordenar: Vencido > Próximo > Al día > Sin datos. Dentro de cada grupo, por fecha desc.
  const alertas = useMemo(() => {
    return [...alertasRaw].sort((a, b) => {
      const pa = prioridadServicio(a)
      const pb = prioridadServicio(b)
      if (pa !== pb) return pa - pb
      // Mismo bucket → más reciente arriba
      return new Date(b.fecha_evento).getTime() - new Date(a.fecha_evento).getTime()
    })
  }, [alertasRaw])

  useEffect(() => { cargar() }, [cargar])

  // Realtime: cuando el cron actualiza la tabla, refrescamos automaticamente.
  // Debounced: el sync dispara un evento por fila tocada; sin esto se
  // re-descargaba el listado completo varias veces por minuto.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const channel = supabase
      .channel('geotab_fault_data_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'geotab_fault_data' },
        () => {
          if (timer) return // ya hay un refetch programado
          const transcurrido = Date.now() - ultimoFetchRef.current
          const espera = Math.max(5_000, REFETCH_MIN_MS - transcurrido)
          timer = setTimeout(() => { timer = null; cargar() }, espera)
        }
      )
      .subscribe()
    return () => {
      if (timer) clearTimeout(timer)
      channel.unsubscribe()
    }
  }, [cargar])

  // Stats derivadas
  const stats: AlertasStats = useMemo(() => {
    const activas = alertas.filter(a => a.estado === 'activa')
    const vehiculosConAlertaSet = new Set(activas.map(a => a.vehiculo_id || a.patente).filter(Boolean))
    const criticas = activas.filter(a => a.severidad === 'Critical').length
    const medias = activas.filter(a => a.severidad === 'Medium' || a.severidad === 'High').length
    const haceUnaSemana = Date.now() - 7 * 24 * 3600 * 1000
    const atendidasSemana = alertas.filter(a =>
      a.estado === 'atendida' &&
      a.dismiss_at &&
      new Date(a.dismiss_at).getTime() >= haceUnaSemana
    ).length
    // Km flota acumulados: suma de kilometraje_actual de los vehiculos únicos
    const vehiculosUnicos = new Map<string, number>()
    for (const a of alertas) {
      const vid = a.vehiculo_id
      const km = a.vehiculo?.kilometraje_actual
      if (vid && km != null && !vehiculosUnicos.has(vid)) {
        vehiculosUnicos.set(vid, km)
      }
    }
    const kmFlotaAcumulados = Array.from(vehiculosUnicos.values()).reduce((sum, km) => sum + km, 0)
    return {
      vehiculosConAlerta: vehiculosConAlertaSet.size,
      criticas,
      medias,
      atendidasSemana,
      kmFlotaAcumulados,
    }
  }, [alertas])

  // Acciones
  const accionAtender = useCallback(async (faultId: string, userName: string) => {
    await marcarAtendida(faultId, userName)
  }, [])

  const accionDescartar = useCallback(async (faultId: string, userName: string) => {
    await descartarAlerta(faultId, userName)
  }, [])

  const accionReactivar = useCallback(async (faultId: string) => {
    await reactivarAlerta(faultId)
  }, [])

  return {
    alertas,
    stats,
    loading,
    error,
    refrescar: cargar,
    accionAtender,
    accionDescartar,
    accionReactivar,
  }
}
