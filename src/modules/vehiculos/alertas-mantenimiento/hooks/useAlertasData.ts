import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../../../lib/supabase'
import { fetchAlertas, marcarAtendida, descartarAlerta, reactivarAlerta } from '../../../../services/alertasService'
import type { AlertaMantenimiento, AlertasStats } from '../types/alertas.types'

export function useAlertasData(sedeId?: string | null) {
  const [alertas, setAlertas] = useState<AlertaMantenimiento[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchAlertas(sedeId)
      setAlertas(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }, [sedeId])

  useEffect(() => { cargar() }, [cargar])

  // Realtime: cuando el cron actualiza la tabla, refrescamos automaticamente
  useEffect(() => {
    const channel = supabase
      .channel('geotab_fault_data_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'geotab_fault_data' },
        () => { cargar() }
      )
      .subscribe()
    return () => { channel.unsubscribe() }
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
    return {
      vehiculosConAlerta: vehiculosConAlertaSet.size,
      criticas,
      medias,
      atendidasSemana,
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
