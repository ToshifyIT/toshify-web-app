// Edge Function para streaming en tiempo real de datos de Cabify
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CABIFY_AUTH_URL = 'https://id.cabify.com/oauth/v2/token'
const CABIFY_GRAPHQL_URL = 'https://fleet-partner-services.cabify.com/graphql'

serve(async (req) => {
  // CORS headers
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    // Extraer parámetros de la URL (EventSource usa GET)
    const url = new URL(req.url)
    const startDate = url.searchParams.get('startDate')
    const endDate = url.searchParams.get('endDate')

    if (!startDate || !endDate) {
      return new Response(JSON.stringify({ error: 'startDate y endDate son requeridos' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    // Crear stream
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()

        try {
          // 1. Autenticar con Cabify
          const authResponse = await fetch(CABIFY_AUTH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              grant_type: 'password',
              client_id: Deno.env.get('CABIFY_CLIENT_ID')!,
              client_secret: Deno.env.get('CABIFY_CLIENT_SECRET')!,
              username: Deno.env.get('CABIFY_USERNAME')!,
              password: Deno.env.get('CABIFY_PASSWORD')!,
            }),
          })
          const { access_token } = await authResponse.json()

          // 2. Obtener compañías
          const companiesQuery = `query { metafleetCompanies { companyIds } }`
          const companiesRes = await fetch(CABIFY_GRAPHQL_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${access_token}`,
            },
            body: JSON.stringify({ query: companiesQuery }),
          })
          const { data: { metafleetCompanies } } = await companiesRes.json()
          const companyIds = metafleetCompanies?.companyIds || []

          let totalProcessed = 0

          // 3. Procesar cada compañía
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
                'Authorization': `Bearer ${access_token}`,
              },
              body: JSON.stringify({
                query: driversQuery,
                variables: { companyId, page: 1, perPage: 500 },
              }),
            })
            const { data: { paginatedDrivers } } = await driversRes.json()
            const drivers = paginatedDrivers?.drivers || []

            // Procesar conductores de 10 en 10 (streaming real)
            for (let i = 0; i < drivers.length; i += 10) {
              const batch = drivers.slice(i, i + 10)

              // Procesar batch en paralelo
              const results = await Promise.all(
                batch.map(async (driver) => {
                  try {
                    // Obtener datos del conductor
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
                          'Authorization': `Bearer ${access_token}`,
                        },
                        body: JSON.stringify({
                          query: driverQuery,
                          variables: { companyId, driverId: driver.id, startAt, endAt },
                        }),
                      }),
                      fetch(CABIFY_GRAPHQL_URL, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${access_token}`,
                        },
                        body: JSON.stringify({
                          query: journeysQuery,
                          variables: {
                            companyId,
                            driverId: driver.id,
                            page: 1,
                            perPage: 500,
                            startAt,
                            endAt,
                          },
                        }),
                      }),
                    ])

                    const driverData = await driverRes.json()
                    const journeysData = await journeysRes.json()

                    const driverInfo = driverData.data?.driver
                    const journeys = journeysData.data?.paginatedJourneys?.journeys || []

                    // Calcular métricas
                    const assignedSeconds = Number(driverInfo?.stats?.assigned || 0)
                    const availableSeconds = Number(driverInfo?.stats?.available || 0)
                    const connectedSeconds = assignedSeconds + availableSeconds
                    const horasConectadas = connectedSeconds / 3600
                    const tasaOcupacion = connectedSeconds > 0 ? (assignedSeconds / connectedSeconds) * 100 : 0

                    const accepted = Number(driverInfo?.stats?.accepted || 0)
                    const missed = Number(driverInfo?.stats?.missed || 0)
                    const offered = Number(driverInfo?.stats?.offered || 0)
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
                      id: driver.id,
                      companyId,
                      companyName: companyId,
                      name: driverInfo?.name || driver.name || '',
                      surname: driverInfo?.surname || driver.surname || '',
                      email: driverInfo?.email || driver.email || '',
                      nationalIdNumber: driverInfo?.nationalIdNumber || driver.nationalIdNumber || '',
                      mobileNum: driverInfo?.mobileNum || driver.mobileNum || '',
                      driverLicense: driverInfo?.driverLicense || driver.driverLicense || '',
                      score: driverInfo?.stats?.score || 0,
                      viajesAceptados: accepted,
                      viajesPerdidos: missed,
                      viajesOfrecidos: offered,
                      viajesFinalizados: viajesCompletados,
                      viajesRechazados: rejected,
                      tasaAceptacion: Number(tasaAceptacion.toFixed(2)),
                      horasConectadas: Number(horasConectadas.toFixed(1)),
                      horasConectadasFormato: `${hoursFormatted}h ${minutesFormatted}m`,
                      tasaOcupacion: Number(tasaOcupacion.toFixed(2)),
                      cobroEfectivo: Number((cobroEfectivoMinor / 100).toFixed(2)),
                      cobroApp: Number((cobroAppMinor / 100).toFixed(2)),
                      gananciaTotal: Number((gananciaTotalViajesMinor / 100).toFixed(2)),
                      gananciaPorHora:
                        horasConectadas > 0 ? Number(((gananciaTotalViajesMinor / 100) / horasConectadas).toFixed(2)) : 0,
                      peajes: 0,
                      permisoEfectivo: 'Desactivado',
                      vehiculo: '',
                      vehicleMake: '',
                      vehicleModel: '',
                      vehicleRegPlate: '',
                      assetId: assetIds.size > 0 ? Array.from(assetIds)[0] : '',
                    }
                  } catch (error) {
                    console.error(`Error procesando conductor ${driver.id}:`, error)
                    return null
                  }
                })
              )

              // Filtrar nulls y enviar batch
              const validResults = results.filter((r) => r !== null)
              if (validResults.length > 0) {
                totalProcessed += validResults.length
                const message = `data: ${JSON.stringify({
                  type: 'batch',
                  data: validResults,
                  progress: { current: totalProcessed, total: drivers.length * companyIds.length },
                })}\n\n`
                controller.enqueue(encoder.encode(message))
              }
            }
          }

          // Enviar mensaje de finalización
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`))
          controller.close()
        } catch (error) {
          console.error('Error en stream:', error)
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`)
          )
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
