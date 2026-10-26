// Botón "Actualizar desde Geotab" de la Bitácora (components/ActualizarGeotabButton.tsx).
//
// Geotab corrige datos después (conductor de un viaje, viajes reemitidos) y el sync
// automático solo relee los últimos 2 días. Este hook pide reprocesar la semana
// visible: inserta un pedido en geotab_resync_solicitudes y un cron del servidor
// (geotab_resync_runner.py, cada minuto) corre el sync de esa semana y sede.
// Ver sql/geotab_resync_semana.sql.
//
// Solo se ofrece para una semana completa (lunes a domingo), ya empezada, cuyo
// período de facturación de la sede NO esté cerrado.

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../../../../lib/supabase'

export interface ResyncResumen {
  viajes_antes?: number
  viajes_despues?: number
  viajes_nuevos?: number
  viajes_cambio_conductor?: number
  km_reasignados?: number
  conductores_afectados?: string[]
  km_antes?: number
  km_despues?: number
  duplicados_borrados?: number | null
  turnos_guardados?: number
}

export interface ResyncPedido {
  id: number
  estado: 'pendiente' | 'procesando' | 'terminado' | 'error'
  created_at: string
  terminado_at: string | null
  solicitado_por_nombre: string | null
  resumen: ResyncResumen | null
  error: string | null
}

const POLL_MS = 5000
const COLUMNAS = 'id, estado, created_at, terminado_at, solicitado_por_nombre, resumen, error'
const TZ = 'America/Argentina/Buenos_Aires'

/** Semana ISO si el rango es exactamente lunes a domingo; null si no (mes, rango libre). */
export function semanaDelRango(startDate: string, endDate: string): { semana: number; anio: number } | null {
  const [y, m, d] = startDate.split('-').map(Number)
  const lunes = new Date(Date.UTC(y, m - 1, d))
  if (lunes.getUTCDay() !== 1) return null
  const domingo = new Date(lunes)
  domingo.setUTCDate(lunes.getUTCDate() + 6)
  if (domingo.toISOString().slice(0, 10) !== endDate) return null
  const jueves = new Date(lunes)
  jueves.setUTCDate(lunes.getUTCDate() + 3)
  const anio = jueves.getUTCFullYear()
  const inicioAnio = new Date(Date.UTC(anio, 0, 1))
  const semana = Math.ceil(((jueves.getTime() - inicioAnio.getTime()) / 86400000 + 1) / 7)
  return { semana, anio }
}

export function useGeotabResync(
  sedeId: string | null,
  startDate: string,
  endDate: string,
  onTerminado: (pedido: ResyncPedido) => void,
  onError: (pedido: ResyncPedido) => void,
) {
  const semana = semanaDelRango(startDate, endDate)
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
  const semanaEmpezada = !!semana && startDate <= hoy

  const [periodoCerrado, setPeriodoCerrado] = useState<boolean | null>(null)
  const [pedido, setPedido] = useState<ResyncPedido | null>(null)
  const avisar = useRef({ onTerminado, onError })
  useEffect(() => { avisar.current = { onTerminado, onError } }, [onTerminado, onError])

  // Estado del período de facturación + último pedido de esta semana.
  useEffect(() => {
    let vivo = true
    setPeriodoCerrado(null)
    setPedido(null)
    if (!sedeId || !semanaEmpezada) return
    void (async () => {
      const [{ data: periodos }, { data: pedidos }] = await Promise.all([
        supabase.from('periodos_facturacion').select('estado')
          .eq('sede_id', sedeId).eq('fecha_inicio', startDate),
        (supabase.from('geotab_resync_solicitudes' as any) as any).select(COLUMNAS)
          .eq('sede_id', sedeId).eq('desde', startDate)
          .order('created_at', { ascending: false }).limit(1),
      ])
      if (!vivo) return
      setPeriodoCerrado(((periodos || []) as Array<{ estado: string | null }>)
        .some(p => p.estado === 'cerrado'))
      setPedido(((pedidos || []) as ResyncPedido[])[0] ?? null)
    })()
    return () => { vivo = false }
  }, [sedeId, startDate, semanaEmpezada])

  const enCurso = pedido?.estado === 'pendiente' || pedido?.estado === 'procesando'

  // Mientras el pedido está en curso se consulta cada 5 s hasta que termine.
  useEffect(() => {
    if (!enCurso || !pedido) return
    const timer = setInterval(async () => {
      const { data } = await (supabase.from('geotab_resync_solicitudes' as any) as any)
        .select(COLUMNAS).eq('id', pedido.id).single()
      const actual = data as ResyncPedido | null
      if (!actual || actual.estado === pedido.estado) return
      setPedido(actual)
      if (actual.estado === 'terminado') avisar.current.onTerminado(actual)
      if (actual.estado === 'error') avisar.current.onError(actual)
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [enCurso, pedido])

  const numSemana = semana?.semana ?? null
  const anioSemana = semana?.anio ?? null
  const solicitar = useCallback(async (nombreUsuario: string) => {
    if (!sedeId || !numSemana || !anioSemana) throw new Error('Elegí una semana (lunes a domingo).')
    const { data, error } = await (supabase.from('geotab_resync_solicitudes' as any) as any)
      .insert({
        sede_id: sedeId,
        semana: numSemana,
        anio: anioSemana,
        desde: startDate,
        hasta: endDate,
        solicitado_por_nombre: nombreUsuario,
      })
      .select(COLUMNAS)
      .single()
    if (error) {
      if (error.code === '23505') throw new Error('Ya hay una actualización en curso para esta semana.')
      if (error.code === '42501') throw new Error('Esta semana no se puede actualizar (período cerrado o fuera de rango).')
      throw error
    }
    setPedido(data as ResyncPedido)
  }, [sedeId, numSemana, anioSemana, startDate, endDate])

  return {
    /** Mostrar el botón: semana completa, empezada y con el período abierto. */
    disponible: semanaEmpezada && periodoCerrado === false,
    semana,
    pedido,
    enCurso,
    solicitar,
  }
}
