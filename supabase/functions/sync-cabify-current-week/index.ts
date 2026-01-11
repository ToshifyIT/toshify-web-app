// Edge Function: Sincronización Inteligente de Semana Actual
// Solo sincroniza días faltantes + actualiza día actual
// Optimizado para ejecutarse cada 5 minutos

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

interface DayRange {
  startDate: string
  endDate: string
  label: string
  isToday: boolean
  dayOfWeek: number
  date: Date
}

/**
 * Calcular todos los días de la semana actual (Lunes - Hoy)
 * Zona horaria: America/Argentina/Buenos_Aires (UTC-3)
 */
function getCurrentWeekDays(): DayRange[] {
  const now = new Date()

  // Convertir a hora Argentina
  const argentinaTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))

  // Encontrar el lunes de esta semana
  const dayOfWeek = argentinaTime.getDay() // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1 // Si es domingo, lunes fue hace 6 días

  const mondayDate = new Date(argentinaTime)
  mondayDate.setDate(argentinaTime.getDate() - daysFromMonday)
  mondayDate.setHours(0, 0, 0, 0)

  const days: DayRange[] = []

  // Generar rangos para cada día desde lunes hasta hoy
  for (let i = 0; i <= daysFromMonday; i++) {
    const dayDate = new Date(mondayDate)
    dayDate.setDate(mondayDate.getDate() + i)

    // Inicio del día (00:00 Argentina → UTC)
    const startOfDay = new Date(Date.UTC(
      dayDate.getFullYear(),
      dayDate.getMonth(),
      dayDate.getDate(),
      3, 0, 0, 0  // +3 horas para convertir Argentina a UTC
    ))

    // Fin del día
    let endOfDay: Date
    const isToday = i === daysFromMonday

    if (isToday) {
      // Para hoy: hasta ahora
      endOfDay = new Date()
    } else {
      // Para días pasados: hasta 23:59:59
      endOfDay = new Date(Date.UTC(
        dayDate.getFullYear(),
        dayDate.getMonth(),
        dayDate.getDate() + 1,
        2, 59, 59, 999  // 02:59:59 UTC = 23:59:59 Argentina
      ))
    }

    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
    const dayName = dayNames[dayDate.getDay()]

    days.push({
      startDate: startOfDay.toISOString(),
      endDate: endOfDay.toISOString(),
      label: `${dayName} ${dayDate.getDate()}/${dayDate.getMonth() + 1}`,
      isToday,
      dayOfWeek: i + 1, // 1 = Lunes, 2 = Martes, etc.
      date: dayDate
    })
  }

  return days
}

/**
 * Verificar si un día ya está sincronizado en la BD
 */
async function isDaySynced(supabase: any, startDate: string, endDate: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('cabify_historico')
    .select('id')
    .eq('fecha_inicio', startDate)
    .limit(1)

  if (error) {
    console.error('Error verificando día:', error)
    return false
  }

  return data && data.length > 0
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
 * Cache de balances por compañía (evita múltiples llamadas)
 */
const balancesCache = new Map<string, any[]>()

/**
 * Obtener balances de una compañía (con cache)
 */
async function getCompanyBalances(token: string, companyId: string): Promise<any[]> {
  // Verificar cache
  if (balancesCache.has(companyId)) {
    return balancesCache.get(companyId)!
  }

  try {
    const balancesQuery = `
      query GetBalances($companyId: String) {
        balances(companyId: $companyId) {
          id
          name
          currency
        }
      }
    `

    const response = await fetch(CABIFY_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        query: balancesQuery,
        variables: { companyId },
      }),
    })

    if (!response.ok) {
      console.error(`Error obteniendo balances: ${response.status}`)
      return []
    }

    const data = await response.json()
    const balances = data.data?.balances || []

    // Guardar en cache
    balancesCache.set(companyId, balances)
    return balances
  } catch (error) {
    console.error(`Error en getCompanyBalances:`, error)
    return []
  }
}

/**
 * Obtener peajes de un conductor desde Cabify
 */
async function getTollsForDriver(
  token: string,
  companyId: string,
  driverId: string,
  startDate: string,
  endDate: string
): Promise<number> {
  try {
    const balances = await getCompanyBalances(token, companyId)

    if (balances.length === 0) {
      return 0
    }

    let totalTolls = 0

    // Procesar hasta 3 balances en paralelo usando aliases
    const balancesToProcess = balances.slice(0, 3)

    if (balancesToProcess.length > 0) {
      try {
        // Construir query con aliases para consultar múltiples balances
        const balanceQueries = balancesToProcess.map((balance: any, idx: number) =>
          `balance${idx}: paginatedBalanceMovements(
            balanceId: "${balance.id}",
            companyId: "${companyId}",
            driverId: "${driverId}",
            startAt: "${startDate}",
            endAt: "${endDate}",
            page: 1,
            perPage: 500
          ) {
            movements {
              breakdown {
                name
                value
              }
            }
            pages
          }`
        ).join('\n')

        const query = `query { ${balanceQueries} }`

        const response = await fetch(CABIFY_GRAPHQL_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ query }),
        })

        if (response.ok) {
          const data = await response.json()

          if (data.data && !data.errors) {
            // Procesar resultados de todos los balances
            Object.values(data.data).forEach((result: any) => {
              if (result && result.movements) {
                result.movements.forEach((movement: any) => {
                  if (movement.breakdown) {
                    movement.breakdown.forEach((b: any) => {
                      if (b.name === 'supplement:toll') {
                        totalTolls += Math.abs(b.value || 0)
                      }
                    })
                  }
                })
              }
            })
          }
        }
      } catch (error) {
        console.warn(`⚠️ Error en query de tolls para ${driverId}:`, error)
      }
    }

    // Convertir de centavos a pesos
    return totalTolls / 100
  } catch (error) {
    console.error(`Error obteniendo peajes del conductor ${driverId}:`, error)
    return 0
  }
}

/**
 * Obtener datos de assets (vehículos) en batch
 */
async function getAssetsBatch(token: string, assetIds: string[], companyId: string) {
  if (!assetIds || assetIds.length === 0) return []

  try {
    // Construir query con aliases para múltiples assets
    const assetQueries = assetIds.map((id, idx) =>
      `asset${idx}: asset(id: "${id}", companyId: "${companyId}") {
        id make model regPlate
      }`
    ).join('\n')

    const query = `query { ${assetQueries} }`

    const response = await fetch(CABIFY_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ query }),
    })

    if (!response.ok) return []

    const data = await response.json()
    if (data.errors || !data.data) return []

    // Convertir { asset0: {...}, asset1: {...} } a array
    return Object.values(data.data).filter((a: any) => a && a.id)
  } catch (error) {
    console.error('Error obteniendo assets:', error)
    return []
  }
}

/**
 * Obtener TODOS los conductores de una compañía (con paginación correcta)
 */
async function fetchAllDrivers(token: string, companyId: string): Promise<any[]> {
  const allDrivers: any[] = []
  let page = 1
  const perPage = 200

  while (true) {
    const driversQuery = `
      query ($companyId: String!, $page: Int!, $perPage: Int!) {
        paginatedDrivers(page: $page, perPage: $perPage, companyId: $companyId, disabled: false) {
          page
          pages
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
        variables: { companyId, page, perPage },
      }),
    })

    const driversJson = await driversRes.json()
    const paginatedDrivers = driversJson.data?.paginatedDrivers

    if (!paginatedDrivers || !paginatedDrivers.drivers) break

    allDrivers.push(...paginatedDrivers.drivers)

    // Verificar si hay más páginas
    if (page >= (paginatedDrivers.pages || 0) || paginatedDrivers.pages === 0) break
    page++
  }

  return allDrivers
}

/**
 * Obtener TODOS los viajes de un conductor (con paginación correcta)
 */
async function fetchAllJourneys(token: string, companyId: string, driverId: string, startDate: string, endDate: string): Promise<any[]> {
  const allJourneys: any[] = []
  let page = 1
  const perPage = 100

  while (true) {
    const journeysQuery = `
      query ($companyId: String, $driverId: String!, $page: Int, $perPage: Int, $startAt: String!, $endAt: String!) {
        paginatedJourneys(companyId: $companyId, driverId: $driverId, page: $page, perPage: $perPage, startAt: $startAt, endAt: $endAt) {
          page
          pages
          journeys {
            id assetId finishReason paymentMethod
            totals { earningsTotal { amount currency } }
          }
        }
      }
    `

    const journeysRes = await fetch(CABIFY_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        query: journeysQuery,
        variables: { companyId, driverId, page, perPage, startAt: startDate, endAt: endDate },
      }),
    })

    const journeysJson = await journeysRes.json()
    const paginatedJourneys = journeysJson.data?.paginatedJourneys

    if (!paginatedJourneys || !paginatedJourneys.journeys) break

    allJourneys.push(...paginatedJourneys.journeys)

    // Verificar si hay más páginas
    if (page >= (paginatedJourneys.pages || 0) || paginatedJourneys.pages === 0) break
    page++
  }

  return allJourneys
}

/**
 * Consultar datos de Cabify para un período
 */
async function getCabifyData(token: string, startDate: string, endDate: string) {
  const companiesQuery = `query { metafleetCompanies { companyIds } }`
  const companiesRes = await fetch(CABIFY_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ query: companiesQuery }),
  })

  const companiesJson = await companiesRes.json()
  const companyIds = companiesJson.data?.metafleetCompanies?.companyIds || []

  if (companyIds.length === 0) {
    throw new Error('No companies found')
  }

  const allDriversData: any[] = []

  for (const companyId of companyIds) {
    // Obtener TODOS los conductores con paginación correcta
    const drivers = await fetchAllDrivers(token, companyId)
    console.log(`  📋 Compañía ${companyId}: ${drivers.length} conductores encontrados`)

    if (drivers.length === 0) continue

    for (let i = 0; i < drivers.length; i += 50) {
      const batch = drivers.slice(i, i + 50)

      const batchResults = await Promise.all(
        batch.map(async (driver: any) => {
          try {
            const driverQuery = `
              query ($companyId: String, $driverId: String!, $startAt: DateTime!, $endAt: DateTime!) {
                driver(id: $driverId, companyId: $companyId) {
                  name surname email nationalIdNumber mobileNum driverLicense
                  stats(startAt: $startAt, endAt: $endAt) {
                    accepted missed offered assigned available score
                    rejected dropOffs connected
                  }
                }
              }
            `

            // Obtener stats del conductor
            const driverRes = await fetch(CABIFY_GRAPHQL_URL, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
              },
              body: JSON.stringify({
                query: driverQuery,
                variables: { companyId, driverId: driver.id, startAt: startDate, endAt: endDate },
              }),
            })

            const driverData = await driverRes.json()
            const driverInfo = driverData.data?.driver

            // Obtener TODOS los viajes con paginación correcta
            const journeys = await fetchAllJourneys(token, companyId, driver.id, startDate, endDate)

            // SIEMPRE guardar el conductor, aunque no tenga stats del período
            // Usar datos básicos del driver si no hay driverInfo
            const effectiveDriver = driverInfo || driver

            // Stats pueden venir de driverInfo o ser 0 si no hay datos del período
            const stats = driverInfo?.stats || {}
            const assignedSeconds = Number(stats.assigned || 0)
            // Usar stats.connected directamente de la API (tiempo total conectado)
            const connectedSeconds = Number(stats.connected || 0)
            const horasConectadas = connectedSeconds / 3600
            const tasaOcupacion = connectedSeconds > 0 ? (assignedSeconds / connectedSeconds) * 100 : 0

            const accepted = Number(stats.accepted || 0)
            const missed = Number(stats.missed || 0)
            const offered = Number(stats.offered || 0)
            // Usar stats.rejected directamente de la API
            const rejected = Number(stats.rejected || 0)
            // Usar stats.dropOffs directamente de la API (viajes finalizados)
            const viajesFinalizadosAPI = Number(stats.dropOffs || 0)
            const totalConsidered = accepted + rejected + missed
            const tasaAceptacion = totalConsidered > 0 ? (accepted / totalConsidered) * 100 : 0

            let cobroEfectivoMinor = 0
            let cobroAppMinor = 0
            let gananciaTotalViajesMinor = 0
            const assetIds = new Set<string>()

            journeys.forEach((j: any) => {
              if (j.assetId) assetIds.add(j.assetId)
              const hasEarnings = j.totals?.earningsTotal?.amount > 0
              if (hasEarnings) {
                const amt = Number(j.totals.earningsTotal.amount)
                gananciaTotalViajesMinor += amt
                if (j.paymentMethod === 'cash') cobroEfectivoMinor += amt
                else cobroAppMinor += amt
              }
            })

            const hoursFormatted = Math.floor(horasConectadas)
            const minutesFormatted = Math.floor((horasConectadas - hoursFormatted) * 60)
            const firstAssetId = assetIds.size > 0 ? Array.from(assetIds)[0] : ''

            // Obtener peajes del conductor desde Cabify
            const peajesDriver = await getTollsForDriver(token, companyId, driver.id, startDate, endDate)

            return {
              cabify_driver_id: driver.id,
              cabify_company_id: companyId,
              nombre: effectiveDriver.name || '',
              apellido: effectiveDriver.surname || '',
              email: effectiveDriver.email || '',
              // DNI: usar placeholder con cabify_driver_id si está vacío
              // Cabify manda - incluir TODOS los conductores
              dni: (effectiveDriver.nationalIdNumber && effectiveDriver.nationalIdNumber.trim() !== '')
                ? effectiveDriver.nationalIdNumber
                : `CABIFY_${driver.id}`,
              licencia: effectiveDriver.driverLicense || '',
              telefono_codigo: effectiveDriver.mobileCc || '',
              telefono_numero: effectiveDriver.mobileNum || '',
              vehiculo_id: firstAssetId,
              first_asset_id: firstAssetId, // Temporal para el batch
              fecha_inicio: startDate,
              fecha_fin: endDate,
              viajes_finalizados: viajesFinalizadosAPI,
              viajes_rechazados: rejected,
              viajes_perdidos: missed,
              viajes_aceptados: accepted,
              viajes_ofrecidos: offered,
              score: stats.score || 0,
              tasa_aceptacion: Number(tasaAceptacion.toFixed(2)),
              tasa_ocupacion: Number(tasaOcupacion.toFixed(2)),
              horas_conectadas: Number(horasConectadas.toFixed(1)),
              horas_conectadas_formato: `${hoursFormatted}h ${minutesFormatted}m`,
              cobro_efectivo: Number((cobroEfectivoMinor / 100).toFixed(2)),
              cobro_app: Number((cobroAppMinor / 100).toFixed(2)),
              peajes: peajesDriver,
              ganancia_total: Number((gananciaTotalViajesMinor / 100).toFixed(2)),
              ganancia_por_hora:
                horasConectadas > 0 ? Number(((gananciaTotalViajesMinor / 100) / horasConectadas).toFixed(2)) : 0,
              permiso_efectivo: 'Desactivado',
              estado_conductor: 'Activo'
            }
          } catch (error) {
            console.error(`❌ Error procesando conductor ${driver.id}:`, error)
            return null
          }
        })
      )

      const validResults = batchResults.filter(r => r !== null)

      // Obtener assets en batch para este batch de conductores
      const batchAssetIds = Array.from(new Set(validResults.map(d => d!.first_asset_id).filter(Boolean)))
      const batchAssets = batchAssetIds.length > 0
        ? await getAssetsBatch(token, batchAssetIds, companyId)
        : []

      // Crear mapa de assets
      const assetsMap = new Map(batchAssets.map((asset: any) => [asset.id, asset]))

      // Combinar datos con assets
      const driversWithAssets = validResults.map(driver => {
        const assetData = driver!.first_asset_id ? assetsMap.get(driver!.first_asset_id) : null
        const { first_asset_id, ...driverWithoutTemp } = driver!

        return {
          ...driverWithoutTemp,
          vehiculo_patente: assetData?.regPlate || '',
          vehiculo_marca: assetData?.make || '',
          vehiculo_modelo: assetData?.model || '',
          vehiculo_completo: [assetData?.make, assetData?.model].filter(Boolean).join(' '),
        }
      })

      allDriversData.push(...driversWithAssets)
    }
  }

  return allDriversData
}

// =====================================================
// EDGE FUNCTION HANDLER
// =====================================================

serve(async (req) => {
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

    console.log('🔄 Sincronización inteligente de semana actual')

    // 1. Obtener días de la semana actual
    const weekDays = getCurrentWeekDays()
    console.log(`📅 Semana actual: ${weekDays.length} días a procesar`)

    // 2. Autenticar una sola vez
    console.log('🔐 Autenticando con Cabify...')
    const token = await authenticateCabify()

    let totalSynced = 0
    let daysProcessed = 0

    // 3. Procesar cada día
    for (const day of weekDays) {
      console.log(`\n📅 Procesando: ${day.label}`)

      // Verificar si ya está sincronizado
      const alreadySynced = await isDaySynced(supabase, day.startDate, day.endDate)

      if (alreadySynced && !day.isToday) {
        console.log(`  ✅ Ya sincronizado (día pasado) - SKIP`)
        continue
      }

      if (day.isToday) {
        console.log(`  🔄 Actualizando día actual...`)
        // Eliminar datos previos del día actual (TODOS los registros con esa fecha_inicio)
        const { error: deleteError, count } = await supabase
          .from('cabify_historico')
          .delete({ count: 'exact' })
          .eq('fecha_inicio', day.startDate)

        if (deleteError) {
          console.error(`  ❌ Error eliminando registros previos: ${deleteError.message}`)
        } else {
          console.log(`  🗑️  Eliminados ${count || 0} registros previos`)
        }
      } else {
        console.log(`  📥 Sincronizando día faltante...`)
      }

      // Consultar datos - Cabify manda, incluir TODOS los conductores
      const driversData = await getCabifyData(token, day.startDate, day.endDate)
      console.log(`  📊 ${driversData.length} conductores obtenidos de API`)

      if (driversData.length > 0) {
        // Guardar en BD - todos los conductores (ya tienen DNI o placeholder)
        const { error: insertError } = await supabase
          .from('cabify_historico')
          .insert(driversData)

        if (insertError) {
          console.error(`  ❌ Error guardando: ${insertError.message}`)
        } else {
          totalSynced += driversData.length
          daysProcessed++
          console.log(`  ✅ ${driversData.length} conductores guardados exitosamente`)
        }
      }
    }

    const executionTimeMs = Date.now() - startTime

    // 4. Log de sync
    await supabase
      .from('cabify_sync_log')
      .insert({
        sync_type: 'realtime',
        period_start: weekDays[0].startDate,
        period_end: weekDays[weekDays.length - 1].endDate,
        records_synced: totalSynced,
        status: 'success',
        execution_time_ms: executionTimeMs
      })

    console.log(`\n✅ Sincronización completada:`)
    console.log(`   Días procesados: ${daysProcessed}/${weekDays.length}`)
    console.log(`   Registros: ${totalSynced}`)
    console.log(`   Tiempo: ${(executionTimeMs / 1000).toFixed(1)}s`)

    return new Response(JSON.stringify({
      status: 'success',
      daysProcessed,
      totalDays: weekDays.length,
      records: totalSynced,
      executionTimeMs
    }), {
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('❌ Error en sync:', error)

    const executionTimeMs = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    try {
      const supabase = createClient(supabaseUrl, supabaseServiceKey)

      await supabase
        .from('cabify_sync_log')
        .insert({
          sync_type: 'realtime',
          period_start: new Date().toISOString(),
          period_end: new Date().toISOString(),
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
