// Edge Function: Backfill de múltiples días de Cabify
// Sincroniza un rango de días hacia atrás
// Ejecuta día por día para evitar timeouts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function getDateRange(targetDate: Date): { startDate: string; endDate: string; dateOnly: string } {
  const startOfDay = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate(), 0, 0, 0, 0))
  const endOfDay = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate(), 23, 59, 59, 999))
  const dateOnly = `${targetDate.getUTCFullYear()}-${String(targetDate.getUTCMonth() + 1).padStart(2, '0')}-${String(targetDate.getUTCDate()).padStart(2, '0')}`
  return { startDate: startOfDay.toISOString(), endDate: endOfDay.toISOString(), dateOnly }
}

async function authenticateCabify(): Promise<string> {
  for (let attempt = 0; attempt <= 5; attempt++) {
    try {
      if (attempt > 0) {
        const delay = 2000 * Math.pow(2, attempt - 1) + Math.random() * 1000
        console.log(`  🔄 Reintento auth ${attempt}/5 - esperando ${Math.round(delay/1000)}s...`)
        await sleep(delay)
      }

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

      if (response.ok) {
        const data = await response.json()
        if (attempt > 0) console.log(`  ✅ Auth OK después de ${attempt} reintentos`)
        return data.access_token
      }

      if (response.status === 401 || response.status === 403) {
        throw new Error(`Auth failed: ${response.status}`)
      }
    } catch (error) {
      if (error instanceof Error && (error.message.includes('401') || error.message.includes('403'))) throw error
    }
  }
  throw new Error('Auth failed after max retries')
}

async function fetchWithRetry(url: string, options: RequestInit): Promise<Response> {
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      if (attempt > 0) await sleep(1000 * Math.pow(2, attempt))
      const response = await fetch(url, options)
      if (response.status === 429) { await sleep(3000); continue }
      return response
    } catch {}
  }
  throw new Error('Request failed')
}

async function getAssetsBatch(token: string, assetIds: string[], companyId: string) {
  if (!assetIds.length) return []
  try {
    const assetQueries = assetIds.map((id, idx) => `asset${idx}: asset(id: "${id}", companyId: "${companyId}") { id make model regPlate }`).join('\n')
    const response = await fetchWithRetry(CABIFY_GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ query: `query { ${assetQueries} }` }),
    })
    if (!response.ok) return []
    const data = await response.json()
    return data.data ? Object.values(data.data).filter((a: any) => a?.id) : []
  } catch { return [] }
}

async function syncOneDay(supabase: any, token: string, daysAgo: number): Promise<{ date: string; records: number; error?: string }> {
  const targetDate = new Date()
  targetDate.setUTCDate(targetDate.getUTCDate() - daysAgo)
  const { startDate, endDate, dateOnly } = getDateRange(targetDate)

  try {
    // Marcar como sincronizando
    await supabase.from('cabify_sync_status').upsert({ fecha: dateOnly, estado: 'sincronizando', fecha_inicio_sync: new Date().toISOString(), intentos: 1 }, { onConflict: 'fecha' })

    // Obtener companies
    const companiesRes = await fetchWithRetry(CABIFY_GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ query: `query { metafleetCompanies { companyIds } }` }),
    })
    const companiesJson = await companiesRes.json()
    const companyIds = companiesJson.data?.metafleetCompanies?.companyIds || []
    if (!companyIds.length) throw new Error('No companies')

    const allDriversData: any[] = []

    for (const companyId of companyIds) {
      const driversRes = await fetchWithRetry(CABIFY_GRAPHQL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          query: `query ($companyId: String!, $page: Int!, $perPage: Int!) { paginatedDrivers(page: $page, perPage: $perPage, companyId: $companyId) { drivers { id name surname email nationalIdNumber driverLicense mobileNum mobileCc } } }`,
          variables: { companyId, page: 1, perPage: 500 },
        }),
      })
      const drivers = (await driversRes.json()).data?.paginatedDrivers?.drivers || []

      for (let i = 0; i < drivers.length; i += 75) {
        const batch = drivers.slice(i, i + 75)
        const results = await Promise.all(batch.map(async (driver: any) => {
          try {
            const [driverRes, journeysRes] = await Promise.all([
              fetchWithRetry(CABIFY_GRAPHQL_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                  // CORREGIDO: Agregados rejected, dropOffs, connected a stats
                  query: `query ($companyId: String, $driverId: String!, $startAt: DateTime!, $endAt: DateTime!) { driver(id: $driverId, companyId: $companyId) { name surname email nationalIdNumber mobileNum driverLicense preferences { name enabled } stats(startAt: $startAt, endAt: $endAt) { accepted missed offered assigned available score rejected dropOffs connected } } }`,
                  variables: { companyId, driverId: driver.id, startAt: startDate, endAt: endDate },
                }),
              }),
              fetchWithRetry(CABIFY_GRAPHQL_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                  query: `query ($companyId: String, $driverId: String!, $page: Int, $perPage: Int, $startAt: String!, $endAt: String!) { paginatedJourneys(companyId: $companyId, driverId: $driverId, page: $page, perPage: $perPage, startAt: $startAt, endAt: $endAt) { journeys { id assetId finishReason paymentMethod totals { earningsTotal { amount } } } } }`,
                  variables: { companyId, driverId: driver.id, page: 1, perPage: 500, startAt: startDate, endAt: endDate },
                }),
              }),
            ])

            const driverInfo = (await driverRes.json()).data?.driver
            const journeys = (await journeysRes.json()).data?.paginatedJourneys?.journeys || []
            if (!driverInfo) return null

            const dni = driverInfo.nationalIdNumber || driver.nationalIdNumber || ''
            if (!dni) return null

            const assigned = Number(driverInfo.stats?.assigned || 0)
            // CORREGIDO: Usar stats.connected directamente de la API
            const connected = Number(driverInfo.stats?.connected || 0)
            const hours = connected / 3600

            const accepted = Number(driverInfo.stats?.accepted || 0)
            const missed = Number(driverInfo.stats?.missed || 0)
            const offered = Number(driverInfo.stats?.offered || 0)
            // CORREGIDO: Usar stats.rejected directamente de la API
            const rejected = Number(driverInfo.stats?.rejected || 0)
            // CORREGIDO: Usar stats.dropOffs directamente de la API
            const trips = Number(driverInfo.stats?.dropOffs || 0)

            let cashMinor = 0, appMinor = 0, totalMinor = 0
            const assetIds = new Set<string>()

            journeys.forEach((j: any) => {
              if (j.assetId) assetIds.add(j.assetId)
              if (j.totals?.earningsTotal?.amount > 0) {
                const amt = Number(j.totals.earningsTotal.amount)
                totalMinor += amt
                if (j.paymentMethod === 'cash') cashMinor += amt; else appMinor += amt
              }
            })

            const h = Math.floor(hours), m = Math.floor((hours - h) * 60)
            const firstAsset = assetIds.size > 0 ? Array.from(assetIds)[0] : ''
            const cashPref = driverInfo.preferences?.find((p: any) => p.name === 'payment_cash')

            return {
              cabify_driver_id: driver.id, cabify_company_id: companyId,
              nombre: driverInfo.name || '', apellido: driverInfo.surname || '',
              email: driverInfo.email || '', dni, licencia: driverInfo.driverLicense || '',
              telefono_codigo: driver.mobileCc || '', telefono_numero: driverInfo.mobileNum || '',
              vehiculo_id: firstAsset, first_asset_id: firstAsset,
              fecha_inicio: startDate, fecha_fin: endDate,
              viajes_finalizados: trips, viajes_rechazados: rejected, viajes_perdidos: missed,
              viajes_aceptados: accepted, viajes_ofrecidos: offered,
              score: driverInfo.stats?.score || 0,
              tasa_aceptacion: (accepted + rejected + missed) > 0 ? Number(((accepted / (accepted + rejected + missed)) * 100).toFixed(2)) : 0,
              tasa_ocupacion: connected > 0 ? Number(((assigned / connected) * 100).toFixed(2)) : 0,
              horas_conectadas: Number(hours.toFixed(1)),
              horas_conectadas_formato: `${h}h ${m}m`,
              cobro_efectivo: Number((cashMinor / 100).toFixed(2)),
              cobro_app: Number((appMinor / 100).toFixed(2)),
              peajes: 0,
              ganancia_total: Number((totalMinor / 100).toFixed(2)),
              ganancia_por_hora: hours > 0 ? Number(((totalMinor / 100) / hours).toFixed(2)) : 0,
              permiso_efectivo: cashPref?.enabled ? 'Activado' : 'Desactivado',
              estado_conductor: 'Activo'
            }
          } catch { return null }
        }))

        const valid = results.filter(r => r !== null)
        const batchAssetIds = [...new Set(valid.map(d => d!.first_asset_id).filter(Boolean))]
        const assets = batchAssetIds.length ? await getAssetsBatch(token, batchAssetIds, companyId) : []
        const assetsMap = new Map(assets.map((a: any) => [a.id, a]))

        valid.forEach(driver => {
          const asset = driver!.first_asset_id ? assetsMap.get(driver!.first_asset_id) : null
          const { first_asset_id, ...rest } = driver!
          allDriversData.push({
            ...rest,
            vehiculo_patente: asset?.regPlate || '',
            vehiculo_marca: asset?.make || '',
            vehiculo_modelo: asset?.model || '',
            vehiculo_completo: [asset?.make, asset?.model].filter(Boolean).join(' '),
          })
        })
      }
    }

    // Delete + Insert
    await supabase.from('cabify_historico').delete().eq('fecha_inicio', startDate)

    if (allDriversData.length > 0) {
      const { error } = await supabase.from('cabify_historico').insert(allDriversData)
      if (error) throw error
    }

    // Marcar completado
    await supabase.from('cabify_sync_status').update({
      estado: 'completado',
      registros_sincronizados: allDriversData.length,
      fecha_fin_sync: new Date().toISOString(),
      mensaje_error: null
    }).eq('fecha', dateOnly)

    return { date: dateOnly, records: allDriversData.length }

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown'
    await supabase.from('cabify_sync_status').update({ estado: 'error', mensaje_error: msg, fecha_fin_sync: new Date().toISOString() }).eq('fecha', dateOnly)
    return { date: dateOnly, records: 0, error: msg }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  const startTime = Date.now()
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    let startDay = 1, endDay = 7 // Por defecto, últimos 7 días
    if (req.method === 'POST') {
      try {
        const body = await req.json()
        startDay = body.startDay ?? 1
        endDay = body.endDay ?? 7
      } catch {}
    }

    console.log(`🔄 Backfill: días ${startDay} a ${endDay}`)

    // Autenticar una vez
    console.log('🔐 Autenticando...')
    const token = await authenticateCabify()
    console.log('✅ Auth OK')

    const results: Array<{ date: string; records: number; error?: string }> = []

    for (let day = startDay; day <= endDay; day++) {
      console.log(`\n📅 Procesando día ${day}/${endDay}...`)
      const result = await syncOneDay(supabase, token, day)
      results.push(result)
      console.log(`  ${result.error ? '❌ ' + result.error : '✅ ' + result.records + ' registros'}`)

      // Pausa entre días
      if (day < endDay) await sleep(500)
    }

    const executionTimeMs = Date.now() - startTime
    const totalRecords = results.filter(r => !r.error).reduce((sum, r) => sum + r.records, 0)
    const errors = results.filter(r => r.error).length

    console.log(`\n✅ Backfill completado: ${results.length} días, ${totalRecords} registros, ${errors} errores, ${(executionTimeMs / 1000).toFixed(0)}s`)

    return new Response(JSON.stringify({
      status: 'success',
      daysProcessed: results.length,
      totalRecords,
      errors,
      results,
      executionTimeMs
    }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown'
    console.error('❌ Error:', msg)
    return new Response(JSON.stringify({ status: 'error', message: msg, executionTimeMs: Date.now() - startTime }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  }
})
