// Edge Function: Sincronización en Tiempo Real de Cabify
// Se ejecuta vía cron job cada 5 minutos

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// =====================================================
// CONFIGURACIÓN
// =====================================================

const CABIFY_AUTH_URL = 'https://cabify.com/auth/api/authorization'
const CABIFY_GRAPHQL_URL = 'https://partners.cabify.com/api/graphql'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const cabifyConfig = {
  clientId: Deno.env.get('CABIFY_CLIENT_ID')!,
  clientSecret: Deno.env.get('CABIFY_CLIENT_SECRET')!,
  username: Deno.env.get('CABIFY_USERNAME')!,
  password: Deno.env.get('CABIFY_PASSWORD')!,
}

// =====================================================
// HELPERS
// =====================================================

/**
 * Calcular rango del día actual (00:00 hasta ahora)
 */
function getTodayRange() {
  const now = new Date()

  // Inicio del día en Argentina (00:00 hora local)
  const startOfDay = new Date(now)
  startOfDay.setHours(0, 0, 0, 0)

  // Convertir a UTC con offset +3 (Argentina)
  const startUTC = new Date(Date.UTC(
    startOfDay.getFullYear(),
    startOfDay.getMonth(),
    startOfDay.getDate(),
    3, 0, 0, 0
  ))

  // Fin = ahora
  const endUTC = new Date()

  const formatDateTime = (date: Date): string => {
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${day}/${month} ${hours}:${minutes}`
  }

  return {
    startDate: startUTC.toISOString(),
    endDate: endUTC.toISOString(),
    label: `Hoy ${formatDateTime(startOfDay)} - ${formatDateTime(now)}`
  }
}

/**
 * Autenticar con Cabify
 */
async function authenticateCabify(): Promise<string> {
  const response = await fetch(CABIFY_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: cabifyConfig.clientId,
      client_secret: cabifyConfig.clientSecret,
      username: cabifyConfig.username,
      password: cabifyConfig.password,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Auth failed: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  return data.access_token
}

/**
 * Consultar datos de Cabify para un período
 */
async function getCabifyData(token: string, startDate: string, endDate: string) {
  // 1. Obtener compañías
  const companiesQuery = `query { metafleetCompanies { companyIds } }`
  const companiesRes = await fetch(CABIFY_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ query: companiesQuery }),
  })

  const { data: { metafleetCompanies } } = await companiesRes.json()
  const companyIds = metafleetCompanies?.companyIds || []

  if (companyIds.length === 0) {
    throw new Error('No companies found')
  }

  const allDriversData: any[] = []

  // 2. Procesar cada compañía
  for (const companyId of companyIds) {
    // Obtener conductores de la compañía
    const driversQuery = `
      query ($companyId: String!, $page: Int!, $perPage: Int!) {
        paginatedDrivers(page: $page, perPage: $perPage, companyId: $companyId) {
          drivers { id name surname email nationalIdNumber driverLicense mobileNum mobileCc }
        }
      }
    `

    const driversRes = await fetch(CABIFY_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        query: driversQuery,
        variables: { companyId, page: 1, perPage: 500 },
      }),
    })

    const { data: { paginatedDrivers } } = await driversRes.json()
    const drivers = paginatedDrivers?.drivers || []

    // Procesar conductores en batches de 50
    for (let i = 0; i < drivers.length; i += 50) {
      const batch = drivers.slice(i, i + 50)

      const batchResults = await Promise.all(
        batch.map(async (driver: any) => {
          try {
            // Consultar datos del conductor
            const driverQuery = `
              query ($companyId: String, $driverId: String!, $startAt: DateTime!, $endAt: DateTime!) {
                driver(id: $driverId, companyId: $companyId) {
                  name surname email nationalIdNumber mobileNum driverLicense
                  stats(startAt: $startAt, endAt: $endAt) {
                    accepted missed offered assigned available score
                  }
                }
              }
            `

            const journeysQuery = `
              query ($companyId: String, $driverId: String!, $page: Int, $perPage: Int, $startAt: String!, $endAt: String!) {
                paginatedJourneys(companyId: $companyId, driverId: $driverId, page: $page, perPage: $perPage, startAt: $startAt, endAt: $endAt) {
                  journeys {
                    id assetId finishReason paymentMethod
                    totals { earningsTotal { amount currency } }
                  }
                }
              }
            `

            const [driverRes, journeysRes] = await Promise.all([
              fetch(CABIFY_GRAPHQL_URL, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                  query: driverQuery,
                  variables: { companyId, driverId: driver.id, startAt: startDate, endAt: endDate },
                }),
              }),
              fetch(CABIFY_GRAPHQL_URL, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                  query: journeysQuery,
                  variables: {
                    companyId,
                    driverId: driver.id,
                    page: 1,
                    perPage: 500,
                    startAt: startDate,
                    endAt: endDate,
                  },
                }),
              }),
            ])

            const driverData = await driverRes.json()
            const journeysData = await journeysRes.json()

            const driverInfo = driverData.data?.driver
            const journeys = journeysData.data?.paginatedJourneys?.journeys || []

            if (!driverInfo) return null

            // Calcular métricas
            const assignedSeconds = Number(driverInfo.stats?.assigned || 0)
            const availableSeconds = Number(driverInfo.stats?.available || 0)
            const connectedSeconds = assignedSeconds + availableSeconds
            const horasConectadas = connectedSeconds / 3600
            const tasaOcupacion = connectedSeconds > 0 ? (assignedSeconds / connectedSeconds) * 100 : 0

            const accepted = Number(driverInfo.stats?.accepted || 0)
            const missed = Number(driverInfo.stats?.missed || 0)
            const offered = Number(driverInfo.stats?.offered || 0)
            const rejected = Math.max(offered - accepted - missed, 0)
            const totalConsidered = accepted + rejected + missed
            const tasaAceptacion = totalConsidered > 0 ? (accepted / totalConsidered) * 100 : 0

            let cobroEfectivoMinor = 0
            let cobroAppMinor = 0
            let gananciaTotalViajesMinor = 0
            let viajesCompletados = 0
            const assetIds = new Set<string>()

            journeys.forEach((j: any) => {
              if (j.assetId) assetIds.add(j.assetId)
              const hasEarnings = j.totals?.earningsTotal?.amount > 0
              if (hasEarnings) {
                const amt = Number(j.totals.earningsTotal.amount)
                gananciaTotalViajesMinor += amt
                if (j.paymentMethod === 'cash') cobroEfectivoMinor += amt
                else cobroAppMinor += amt
                if (j.finishReason === 'drop_off') viajesCompletados++
              }
            })

            const hoursFormatted = Math.floor(horasConectadas)
            const minutesFormatted = Math.floor((horasConectadas - hoursFormatted) * 60)

            return {
              cabify_driver_id: driver.id,
              cabify_company_id: companyId,
              nombre: driverInfo.name || driver.name || '',
              apellido: driverInfo.surname || driver.surname || '',
              email: driverInfo.email || driver.email || '',
              // DNI: usar placeholder con cabify_driver_id si está vacío
              // Cabify manda - incluir TODOS los conductores
              dni: (driverInfo.nationalIdNumber || driver.nationalIdNumber || '').trim() !== ''
                ? (driverInfo.nationalIdNumber || driver.nationalIdNumber)
                : `CABIFY_${driver.id}`,
              licencia: driverInfo.driverLicense || driver.driverLicense || '',
              telefono_codigo: driverInfo.mobileNum ? driver.mobileCc || '' : '',
              telefono_numero: driverInfo.mobileNum || driver.mobileNum || '',
              vehiculo_id: assetIds.size > 0 ? Array.from(assetIds)[0] : '',
              vehiculo_patente: '',
              vehiculo_marca: '',
              vehiculo_modelo: '',
              vehiculo_completo: '',
              fecha_inicio: startDate,
              fecha_fin: endDate,
              viajes_finalizados: viajesCompletados,
              viajes_rechazados: rejected,
              viajes_perdidos: missed,
              viajes_aceptados: accepted,
              viajes_ofrecidos: offered,
              score: driverInfo.stats?.score || 0,
              tasa_aceptacion: Number(tasaAceptacion.toFixed(2)),
              tasa_ocupacion: Number(tasaOcupacion.toFixed(2)),
              horas_conectadas: Number(horasConectadas.toFixed(1)),
              horas_conectadas_formato: `${hoursFormatted}h ${minutesFormatted}m`,
              cobro_efectivo: Number((cobroEfectivoMinor / 100).toFixed(2)),
              cobro_app: Number((cobroAppMinor / 100).toFixed(2)),
              peajes: 0,
              ganancia_total: Number((gananciaTotalViajesMinor / 100).toFixed(2)),
              ganancia_por_hora:
                horasConectadas > 0 ? Number(((gananciaTotalViajesMinor / 100) / horasConectadas).toFixed(2)) : 0,
              permiso_efectivo: 'Desactivado',
              estado_conductor: 'Activo'
            }
          } catch (error) {
            console.error(`Error procesando conductor ${driver.id}:`, error)
            return null
          }
        })
      )

      allDriversData.push(...batchResults.filter(r => r !== null))
    }
  }

  return allDriversData
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

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 1. Calcular día actual
    const { startDate, endDate, label } = getTodayRange()

    console.log(`📅 Sincronizando: ${label}`)
    console.log(`   Rango: ${startDate} → ${endDate}`)

    // 2. Eliminar registros anteriores del día actual para evitar duplicados
    const { error: deleteError } = await supabase
      .from('cabify_historico')
      .delete()
      .eq('fecha_inicio', startDate)

    if (deleteError) {
      console.warn('⚠️  Error eliminando registros previos:', deleteError.message)
    }

    // 3. Autenticar con Cabify
    console.log('🔐 Autenticando con Cabify...')
    const token = await authenticateCabify()

    // 4. Consultar datos
    console.log('🔄 Consultando datos de Cabify...')
    const driversData = await getCabifyData(token, startDate, endDate)

    console.log(`✅ ${driversData.length} conductores obtenidos`)

    if (driversData.length === 0) {
      console.warn('⚠️  Sin datos para este período')

      await supabase
        .from('cabify_sync_log')
        .insert({
          sync_type: 'realtime',
          period_start: startDate,
          period_end: endDate,
          records_synced: 0,
          status: 'success',
          execution_time_ms: Date.now() - startTime
        })

      return new Response(JSON.stringify({
        status: 'success',
        message: 'No data for this period',
        records: 0,
        period: { startDate, endDate, label }
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // 5. Guardar en BD
    console.log(`💾 Guardando ${driversData.length} registros...`)

    const { error: insertError } = await supabase
      .from('cabify_historico')
      .insert(driversData)

    if (insertError) {
      throw insertError
    }

    // 6. Log de sync
    const executionTimeMs = Date.now() - startTime

    await supabase
      .from('cabify_sync_log')
      .insert({
        sync_type: 'realtime',
        period_start: startDate,
        period_end: endDate,
        records_synced: driversData.length,
        status: 'success',
        execution_time_ms: executionTimeMs
      })

    console.log(`✅ Sincronización completada en ${(executionTimeMs / 1000).toFixed(1)}s`)

    return new Response(JSON.stringify({
      status: 'success',
      records: driversData.length,
      period: { startDate, endDate, label },
      executionTimeMs
    }), {
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('❌ Error en sync:', error)

    const executionTimeMs = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    // Log error
    try {
      const supabase = createClient(supabaseUrl, supabaseServiceKey)
      const { startDate, endDate } = getTodayRange()

      await supabase
        .from('cabify_sync_log')
        .insert({
          sync_type: 'realtime',
          period_start: startDate,
          period_end: endDate,
          records_synced: 0,
          status: 'failed',
          error_message: errorMessage,
          execution_time_ms: executionTimeMs
        })
    } catch (logError) {
      console.error('❌ Error logging failure:', logError)
    }

    return new Response(JSON.stringify({
      status: 'error',
      message: errorMessage
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})
