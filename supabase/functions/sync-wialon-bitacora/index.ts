// Edge Function: Sincronización de Bitácora desde uss_historico
// Agrupa viajes por patente+fecha para crear turnos en wialon_bitacora

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// =====================================================
// CONFIGURACIÓN
// =====================================================

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const POCO_KM_THRESHOLD = 100

// =====================================================
// TIPOS
// =====================================================

interface UssHistoricoRow {
  id: number
  patente: string
  conductor: string | null
  ibutton: string | null
  observaciones: string | null
  fecha_hora_inicio: string
  fecha_hora_final: string | null
  kilometraje: string | null
}

interface TurnoAgrupado {
  patente: string
  patenteNormalizada: string
  conductor: string | null
  ibutton: string | null
  fecha: string
  horaInicio: string | null
  horaCierre: string | null
  kilometraje: number
  observaciones: string | null
  viajesCount: number
}

// =====================================================
// HELPERS
// =====================================================

function normalizarPatente(patente: string): string {
  return (patente || '').replace(/\s/g, '').toUpperCase()
}

function extraerFecha(timestamp: string): string {
  if (!timestamp) return ''
  return timestamp.split(/[T\s]/)[0]
}

function extraerHora(timestamp: string | null): string | null {
  if (!timestamp) return null
  const match = timestamp.match(/(\d{2}:\d{2})(:\d{2})?/)
  return match ? match[1] : null
}

function calcularEstado(horaCierre: string | null, km: number): string {
  if (!horaCierre) return 'En Curso'
  if (km < POCO_KM_THRESHOLD) return 'Poco Km'
  return 'Turno Finalizado'
}

// NOTA: duracion_minutos se calcula como columna generada en la tabla selfhosted

/**
 * Calcula rango de fechas para sincronización
 * Por defecto: últimos 3 días
 */
function getDateRange(daysBack: number = 3): { startDate: string; endDate: string } {
  const now = new Date()
  const end = new Date(now)
  const start = new Date(now)
  start.setDate(start.getDate() - daysBack)

  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  }
}

/**
 * Agrupa viajes de uss_historico en turnos
 */
function agruparViajesEnTurnos(viajes: UssHistoricoRow[]): TurnoAgrupado[] {
  const turnosMap = new Map<string, TurnoAgrupado>()

  for (const viaje of viajes) {
    const fecha = extraerFecha(viaje.fecha_hora_inicio)
    const patenteNorm = normalizarPatente(viaje.patente)
    const key = `${patenteNorm}_${fecha}`

    const km = parseFloat(viaje.kilometraje || '0') || 0
    const horaInicio = extraerHora(viaje.fecha_hora_inicio)
    const horaCierre = extraerHora(viaje.fecha_hora_final)

    const existing = turnosMap.get(key)

    if (!existing) {
      turnosMap.set(key, {
        patente: viaje.patente,
        patenteNormalizada: patenteNorm,
        conductor: viaje.conductor,
        ibutton: viaje.ibutton,
        fecha,
        horaInicio,
        horaCierre,
        kilometraje: km,
        observaciones: viaje.observaciones,
        viajesCount: 1,
      })
    } else {
      // Acumular km
      existing.kilometraje += km
      existing.viajesCount++

      // Actualizar hora inicio si es más temprano
      if (horaInicio && (!existing.horaInicio || horaInicio < existing.horaInicio)) {
        existing.horaInicio = horaInicio
      }

      // Actualizar hora cierre si es más tarde
      if (horaCierre && (!existing.horaCierre || horaCierre > existing.horaCierre)) {
        existing.horaCierre = horaCierre
      }

      // Actualizar conductor si no tenía
      if (!existing.conductor && viaje.conductor) {
        existing.conductor = viaje.conductor
      }
      if (!existing.ibutton && viaje.ibutton) {
        existing.ibutton = viaje.ibutton
      }
    }
  }

  return Array.from(turnosMap.values())
}

// =====================================================
// EDGE FUNCTION HANDLER
// =====================================================

serve(async (req) => {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  const startTime = Date.now()
  let syncLogId: string | null = null

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Parsear parámetros opcionales
    let daysBack = 3
    let startDate: string | undefined
    let endDate: string | undefined

    if (req.method === 'POST') {
      try {
        const body = await req.json()
        if (body.daysBack) daysBack = body.daysBack
        if (body.startDate) startDate = body.startDate
        if (body.endDate) endDate = body.endDate
      } catch {
        // Ignorar si no hay body
      }
    }

    // Calcular rango de fechas
    const dateRange = startDate && endDate
      ? { startDate, endDate }
      : getDateRange(daysBack)

    console.log(`📅 Sincronizando bitácora: ${dateRange.startDate} → ${dateRange.endDate}`)

    // Crear registro de sync
    const { data: logData } = await supabase
      .from('wialon_bitacora_sync_log')
      .insert({
        tipo: 'automatic',
        fecha_inicio: dateRange.startDate,
        fecha_fin: dateRange.endDate,
        status: 'running',
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    syncLogId = logData?.id

    // 1. Obtener viajes de uss_historico
    console.log('📡 Obteniendo viajes de uss_historico...')

    const { data: viajes, error: viajesError } = await supabase
      .from('uss_historico')
      .select('*')
      .gte('fecha_hora_inicio', `${dateRange.startDate} 00:00:00`)
      .lte('fecha_hora_inicio', `${dateRange.endDate} 23:59:59`)
      .order('fecha_hora_inicio', { ascending: false })

    if (viajesError) {
      throw new Error(`Error obteniendo viajes: ${viajesError.message}`)
    }

    console.log(`   Encontrados: ${viajes?.length || 0} viajes`)

    if (!viajes || viajes.length === 0) {
      // Actualizar log
      if (syncLogId) {
        await supabase
          .from('wialon_bitacora_sync_log')
          .update({
            status: 'success',
            registros_procesados: 0,
            registros_nuevos: 0,
            registros_actualizados: 0,
            completed_at: new Date().toISOString(),
            execution_time_ms: Date.now() - startTime,
          })
          .eq('id', syncLogId)
      }

      return new Response(JSON.stringify({
        status: 'success',
        message: 'No hay viajes para procesar',
        turnos: 0,
        period: dateRange,
      }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 2. Agrupar viajes en turnos
    console.log('🔄 Agrupando viajes en turnos...')
    const turnos = agruparViajesEnTurnos(viajes as UssHistoricoRow[])
    console.log(`   Generados: ${turnos.length} turnos`)

    // 3. Preparar registros para upsert
    // NOTA: duracion_minutos es columna generada en selfhosted, no la enviamos
    const registros = turnos.map(turno => ({
      patente: turno.patente,
      patente_normalizada: turno.patenteNormalizada,
      conductor_wialon: turno.conductor,
      ibutton: turno.ibutton,
      fecha_turno: turno.fecha,
      hora_inicio: turno.horaInicio || '00:00', // Evitar NULL en constraint
      hora_cierre: turno.horaCierre,
      kilometraje: Math.round(turno.kilometraje * 100) / 100,
      estado: calcularEstado(turno.horaCierre, turno.kilometraje),
      observaciones: turno.observaciones,
      synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }))

    // 4. Upsert en wialon_bitacora
    console.log(`💾 Guardando ${registros.length} turnos...`)

    const nuevos = 0
    let actualizados = 0

    // Procesar en batches de 100
    for (let i = 0; i < registros.length; i += 100) {
      const batch = registros.slice(i, i + 100)

      const { error: upsertError } = await supabase
        .from('wialon_bitacora')
        .upsert(batch, {
          onConflict: 'patente_normalizada,fecha_turno',
          ignoreDuplicates: false,
        })

      if (upsertError) {
        console.error(`Error en batch ${i}:`, upsertError)
        // Continuar con el siguiente batch
      } else {
        // Contar como actualizados (no podemos diferenciar fácilmente con upsert)
        actualizados += batch.length
      }
    }

    // 5. Actualizar log de sync
    const executionTimeMs = Date.now() - startTime

    if (syncLogId) {
      await supabase
        .from('wialon_bitacora_sync_log')
        .update({
          status: 'success',
          registros_procesados: viajes.length,
          registros_nuevos: nuevos,
          registros_actualizados: actualizados,
          completed_at: new Date().toISOString(),
          execution_time_ms: executionTimeMs,
        })
        .eq('id', syncLogId)
    }

    console.log(`✅ Sincronización completada en ${(executionTimeMs / 1000).toFixed(1)}s`)

    return new Response(JSON.stringify({
      status: 'success',
      viajesProcesados: viajes.length,
      turnosGenerados: turnos.length,
      period: dateRange,
      executionTimeMs,
    }), {
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('❌ Error en sync:', error)

    const executionTimeMs = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    // Actualizar log con error
    if (syncLogId) {
      try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey)
        await supabase
          .from('wialon_bitacora_sync_log')
          .update({
            status: 'failed',
            error_message: errorMessage,
            completed_at: new Date().toISOString(),
            execution_time_ms: executionTimeMs,
          })
          .eq('id', syncLogId)
      } catch (logError) {
        console.error('Error actualizando log:', logError)
      }
    }

    return new Response(JSON.stringify({
      status: 'error',
      message: errorMessage,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
