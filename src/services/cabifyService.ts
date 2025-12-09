// src/services/cabifyService.ts
import type { CabifyConfig, CabifyAuthResponse, CabifyDriver, CabifyPeriod } from '../types/cabify.types'

/**
 * Servicio para interactuar con la API de Cabify
 * En desarrollo usa proxy de Vite, en producción llama directamente
 */
class CabifyService {
  private config: CabifyConfig
  private accessToken: string | null = null
  private tokenExpiry: number | null = null
  private assetsCache: Map<string, any> = new Map()

  constructor() {
    // Cargar configuración desde variables de entorno
    this.config = {
      username: import.meta.env.VITE_CABIFY_USERNAME || '',
      password: import.meta.env.VITE_CABIFY_PASSWORD || '',
      clientId: import.meta.env.VITE_CABIFY_CLIENT_ID || '',
      clientSecret: import.meta.env.VITE_CABIFY_CLIENT_SECRET || '',
      companyId: import.meta.env.VITE_CABIFY_COMPANY_ID || '', // ID de la flota
      // SIEMPRE usar proxy de Vite (evita CORS)
      authUrl: '/cabify-auth',
      graphqlUrl: '/cabify-graphql'
    }
  }

  /**
   * Autenticar con Cabify OAuth
   */
  private async authenticate(): Promise<string> {
    try {
      // Verificar si el token actual es válido
      if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
        return this.accessToken
      }

      console.log('🔐 Autenticando con Cabify...')

      const response = await fetch(this.config.authUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'password',
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          username: this.config.username,
          password: this.config.password,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Error de autenticación: ${response.status} - ${errorText}`)
      }

      const data: CabifyAuthResponse = await response.json()

      this.accessToken = data.access_token
      // Restar 5 minutos de margen al tiempo de expiración
      this.tokenExpiry = Date.now() + (data.expires_in * 1000) - (5 * 60 * 1000)

      console.log('✅ Autenticación exitosa')
      return this.accessToken

    } catch (error) {
      console.error('❌ Error de autenticación:', error)
      throw new Error(`No se pudo autenticar con Cabify: ${error instanceof Error ? error.message : 'Error desconocido'}`)
    }
  }

  /**
   * Obtener todas las compañías disponibles (para usuarios metafleet)
   */
  async getMetafleetCompanies(): Promise<string[]> {
    try {
      const token = await this.authenticate()

      const graphqlQuery = `
        query {
          metafleetCompanies {
            companyIds
          }
        }
      `

      const response = await fetch(this.config.graphqlUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: graphqlQuery,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Error en GraphQL: ${response.status} - ${errorText}`)
      }

      const data = await response.json()

      if (data.errors) {
        throw new Error(`Errores GraphQL: ${JSON.stringify(data.errors)}`)
      }

      const companyIds = data.data.metafleetCompanies?.companyIds || []
      console.log(`✅ ${companyIds.length} compañías encontradas:`, companyIds)
      return companyIds

    } catch (error) {
      console.error('❌ Error obteniendo compañías:', error)
      return []
    }
  }

  /**
   * Obtener conductores sin filtro de compañía (todos los disponibles)
   */
  async getAllDriversWithoutCompanyFilter(): Promise<any[]> {
    try {
      const token = await this.authenticate()

      const graphqlQuery = `
        query GetAllDriversNoFilter($page: Int!, $perPage: Int!) {
          paginatedDrivers(disabled: false, page: $page, perPage: $perPage) {
            page
            pages
            records
            drivers {
              id
              name
              surname
              email
              nationalIdNumber
              driverLicense
              mobileNum
              mobileCc
              disabled
              activatedAt
              birthday
              gender
              score
            }
          }
        }
      `

      let allDrivers: any[] = []
      let currentPage = 1
      let totalPages = 1

      // Paginar hasta obtener todos los conductores
      while (currentPage <= totalPages) {
        const response = await fetch(this.config.graphqlUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            query: graphqlQuery,
            variables: {
              page: currentPage,
              perPage: 200, // Más conductores por página
            },
          }),
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`Error en GraphQL: ${response.status} - ${errorText}`)
        }

        const data = await response.json()

        if (data.errors) {
          throw new Error(`Errores GraphQL: ${JSON.stringify(data.errors)}`)
        }

        const paginatedData = data.data.paginatedDrivers
        allDrivers = allDrivers.concat(paginatedData.drivers)
        totalPages = paginatedData.pages
        currentPage++

        console.log(`  📄 Página ${currentPage - 1}/${totalPages}: ${paginatedData.drivers.length} conductores`)
      }

      return allDrivers

    } catch (error) {
      console.error('❌ Error obteniendo conductores sin filtro:', error)
      throw error
    }
  }

  /**
   * Obtener conductores de una compañía específica
   */
  async getDriversByCompany(companyId: string): Promise<any[]> {
    try {
      const token = await this.authenticate()

      const graphqlQuery = `
        query GetDriversByCompany($page: Int!, $perPage: Int!, $companyId: String!) {
          paginatedDrivers(page: $page, perPage: $perPage, companyId: $companyId) {
            page
            pages
            records
            drivers {
              id
              name
              surname
              email
              nationalIdNumber
              driverLicense
              mobileNum
              mobileCc
              disabled
              activatedAt
              birthday
              gender
              score
            }
          }
        }
      `

      let allDrivers: any[] = []
      let currentPage = 1
      let totalPages = 1

      // Paginar hasta obtener todos los conductores de esta compañía
      while (currentPage <= totalPages) {
        console.log(`📄 Fetching page ${currentPage} of drivers for company ${companyId}`)

        const response = await fetch(this.config.graphqlUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            query: graphqlQuery,
            variables: {
              page: currentPage,
              perPage: 500, // Aumentado para máximo rendimiento
              companyId: companyId,
            },
          }),
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`Error en GraphQL: ${response.status} - ${errorText}`)
        }

        const data = await response.json()

        if (data.errors) {
          throw new Error(`Errores GraphQL: ${JSON.stringify(data.errors)}`)
        }

        const paginatedData = data.data.paginatedDrivers
        console.log(`📊 Page ${currentPage}: ${paginatedData.drivers.length} drivers received, Total pages: ${paginatedData.pages}`)
        console.log(`🔍 Drivers on this page:`, paginatedData.drivers.map((d: any) => `${d.name} ${d.surname}`))

        allDrivers = allDrivers.concat(paginatedData.drivers)
        totalPages = paginatedData.pages
        currentPage++
      }

      console.log(`✅ Total drivers fetched from company ${companyId}: ${allDrivers.length}`)
      return allDrivers

    } catch (error) {
      console.error(`❌ Error obteniendo conductores de compañía ${companyId}:`, error)
      throw error
    }
  }

  /**
   * Obtener lista de todos los conductores activos (de todas las compañías)
   */
  async getAllDrivers(): Promise<any[]> {
    try {
      console.log('🔄 Iniciando obtención de conductores...')

      // Paso 1: Obtener todas las compañías disponibles
      console.log('🏢 Obteniendo lista de compañías...')
      const companyIds = await this.getMetafleetCompanies()

      if (companyIds.length === 0) {
        console.warn('⚠️ No se encontraron compañías, intentando sin filtro...')
        const allDrivers = await this.getAllDriversWithoutCompanyFilter()
        return allDrivers.map(driver => ({
          ...driver,
          companyId: 'unknown',
          companyName: 'Sin Compañía'
        }))
      }

      console.log(`📋 Se encontraron ${companyIds.length} compañías`)

      // Paso 2: Obtener conductores de cada compañía
      const allDrivers: any[] = []

      for (let i = 0; i < companyIds.length; i++) {
        const companyId = companyIds[i]
        console.log(`  🔄 Procesando compañía ${i + 1}/${companyIds.length}: ${companyId}`)

        try {
          const drivers = await this.getDriversByCompany(companyId)
          console.log(`    ✅ ${drivers.length} conductores encontrados en ${companyId}`)

          // Agregar companyId a cada conductor
          const driversWithCompany = drivers.map(driver => ({
            ...driver,
            companyId: companyId,
            companyName: companyId // Por ahora usamos el ID como nombre
          }))

          allDrivers.push(...driversWithCompany)
        } catch (error) {
          console.error(`    ❌ Error obteniendo conductores de ${companyId}:`, error)
          // Continuar con la siguiente compañía
        }
      }

      console.log(`✅ Total: ${allDrivers.length} conductores obtenidos de ${companyIds.length} compañías`)
      return allDrivers

    } catch (error) {
      console.error('❌ Error obteniendo conductores:', error)
      throw new Error(`No se pudieron obtener los conductores: ${error instanceof Error ? error.message : 'Error desconocido'}`)
    }
  }

  /**
   * Obtener viajes de un conductor en un rango de fechas
   */
  async getDriverJourneys(driverId: string, startAt: string, endAt: string, companyId?: string): Promise<any> {
    try {
      const token = await this.authenticate()

      const graphqlQuery = `
        query GetDriverJourneys($driverId: String!, $companyId: String, $startAt: String!, $endAt: String!, $page: Int!, $perPage: Int!) {
          paginatedJourneys(driverId: $driverId, companyId: $companyId, startAt: $startAt, endAt: $endAt, page: $page, perPage: $perPage) {
            page
            pages
            records
            journeys {
              id
              assetId
              finishReason
              paymentMethod
              totals {
                earningsTotal {
                  amount
                  currency
                }
                distance
              }
            }
          }
        }
      `

      let allJourneys: any[] = []
      let currentPage = 1
      let totalPages = 1

      while (currentPage <= totalPages) {
        const response = await fetch(this.config.graphqlUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            query: graphqlQuery,
            variables: {
              driverId,
              companyId,
              startAt,
              endAt,
              page: currentPage,
              perPage: 100,
            },
          }),
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`Error en GraphQL: ${response.status} - ${errorText}`)
        }

        const data = await response.json()

        if (data.errors) {
          throw new Error(`Errores GraphQL: ${JSON.stringify(data.errors)}`)
        }

        const paginatedData = data.data.paginatedJourneys
        allJourneys = allJourneys.concat(paginatedData.journeys)
        totalPages = paginatedData.pages
        currentPage++
      }

      return allJourneys

    } catch (error) {
      console.error(`❌ Error obteniendo viajes del conductor ${driverId}:`, error)
      throw error
    }
  }

  /**
   * Obtener estadísticas de un conductor en un rango de fechas
   */
  async getDriverStats(driverId: string, startAt: string, endAt: string, companyId?: string): Promise<any> {
    try {
      const token = await this.authenticate()

      const graphqlQuery = `
        query GetDriverStats($driverId: String!, $companyId: String, $startAt: DateTime!, $endAt: DateTime!) {
          driver(id: $driverId, companyId: $companyId) {
            id
            name
            surname
            email
            nationalIdNumber
            mobileNum
            mobileCc
            driverLicense
            score
            stats(startAt: $startAt, endAt: $endAt) {
              accepted
              assigned
              assignedDistance
              assignedJourneys
              available
              availableDistance
              connected
              connectionDistance
              dropOffs
              missed
              offered
              rejected
              score
            }
            preferences {
              name
              enabled
            }
          }
        }
      `

      const response = await fetch(this.config.graphqlUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: graphqlQuery,
          variables: {
            driverId,
            companyId,
            startAt,
            endAt,
          },
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Error en GraphQL: ${response.status} - ${errorText}`)
      }

      const data = await response.json()

      if (data.errors) {
        throw new Error(`Errores GraphQL: ${JSON.stringify(data.errors)}`)
      }

      return data.data.driver

    } catch (error) {
      console.error(`❌ Error obteniendo stats del conductor ${driverId}:`, error)
      throw error
    }
  }

  /**
   * Obtener información de un vehículo (asset) por ID
   * EXACTAMENTE como fetchAssetById_ en script.gs.rtf con caching
   */
  async getAssetById(assetId: string, companyId: string): Promise<any> {
    // Si no hay assetId, retornar null
    if (!assetId) {
      return null
    }

    // Crear key de cache: companyId:assetId
    const cacheKey = `${companyId}:${assetId}`

    // Si ya está en cache, retornar de cache
    if (this.assetsCache.has(cacheKey)) {
      return this.assetsCache.get(cacheKey)
    }

    try {
      const token = await this.authenticate()

      // Query EXACTA de script.gs.rtf - SIN campo "year"
      const graphqlQuery = `
        query ($id: String, $companyId: String) {
          asset(id: $id, companyId: $companyId) {
            id
            make
            model
            regPlate
          }
        }
      `

      const response = await fetch(this.config.graphqlUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: graphqlQuery,
          variables: {
            id: assetId,
            companyId,
          },
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`❌ Error obteniendo asset ${assetId}: ${errorText}`)
        return null
      }

      const data = await response.json()

      if (data.errors) {
        console.error(`❌ GraphQL errors obteniendo asset ${assetId}:`, data.errors)
        return null
      }

      const asset = data.data?.asset || null

      // Guardar en cache si se obtuvo data
      if (asset) {
        this.assetsCache.set(cacheKey, asset)
      }

      return asset

    } catch (error) {
      console.error(`❌ Error obteniendo asset ${assetId}:`, error)
      return null
    }
  }

  /**
   * Obtener información de múltiples vehículos en batch (OPTIMIZACIÓN)
   * Usa aliases de GraphQL para consultar múltiples assets en 1 sola query
   * EXACTAMENTE como fetchAssetsBatch_ de las instrucciones de optimización
   */
  async getAssetsBatch(assetIds: string[], companyId: string): Promise<any[]> {
    if (!assetIds || assetIds.length === 0) {
      return []
    }

    const uncachedIds: string[] = []
    const results: any[] = []

    // Revisar caché primero
    for (const assetId of assetIds) {
      const cacheKey = `${companyId}:${assetId}`
      if (this.assetsCache.has(cacheKey)) {
        const cached = this.assetsCache.get(cacheKey)
        if (cached) results.push(cached)
      } else {
        uncachedIds.push(assetId)
      }
    }

    // Si todos están en caché, retornar
    if (uncachedIds.length === 0) {
      return results
    }

    try {
      const token = await this.authenticate()

      // Construir query con aliases para múltiples assets
      // asset0: asset(id: "xxx") { ... }
      // asset1: asset(id: "yyy") { ... }
      const assetQueries = uncachedIds.map((id, idx) =>
        `asset${idx}: asset(id: "${id}", companyId: "${companyId}") {
          id
          make
          model
          regPlate
        }`
      ).join('\n')

      const query = `query { ${assetQueries} }`

      const response = await fetch(this.config.graphqlUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ query }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`❌ Error en getAssetsBatch: ${errorText}`)
        return results
      }

      const data = await response.json()

      if (data.errors) {
        console.error(`❌ GraphQL errors en getAssetsBatch:`, data.errors)
        return results
      }

      // Extraer y cachear resultados
      // data.data = { asset0: {...}, asset1: {...}, ... }
      if (data.data) {
        Object.values(data.data).forEach((asset: any) => {
          if (asset && asset.id) {
            const cacheKey = `${companyId}:${asset.id}`
            this.assetsCache.set(cacheKey, asset)
            results.push(asset)
          }
        })
      }

      return results

    } catch (error) {
      console.error('❌ Error en getAssetsBatch:', error)
      return results
    }
  }

  /**
   * Obtener peajes de un conductor en un rango de fechas
   * OPTIMIZADO: Usa aliases de GraphQL para consultar múltiples balances en paralelo
   */
  async getTollsForDriver(companyId: string, driverId: string, startAt: string, endAt: string): Promise<number> {
    try {
      const token = await this.authenticate()

      // Primero obtener los balances de la compañía
      const balancesQuery = `
        query GetBalances($companyId: String) {
          balances(companyId: $companyId) {
            id
            name
            currency
          }
        }
      `

      const balancesResponse = await fetch(this.config.graphqlUrl, {
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

      if (!balancesResponse.ok) {
        throw new Error(`Error obteniendo balances: ${balancesResponse.status}`)
      }

      const balancesData = await balancesResponse.json()
      const balances = balancesData.data?.balances || []

      if (balances.length === 0) {
        return 0
      }

      let totalTolls = 0

      // OPTIMIZACIÓN: Procesar hasta 3 balances en paralelo usando aliases
      // Similar a la optimización sugerida en el documento
      const balancesToProcess = balances.slice(0, 3)

      if (balancesToProcess.length > 0) {
        try {
          // Construir query con aliases para consultar múltiples balances en paralelo
          const balanceQueries = balancesToProcess.map((balance: any, idx: number) =>
            `balance${idx}: paginatedBalanceMovements(
              balanceId: "${balance.id}",
              companyId: "${companyId}",
              driverId: "${driverId}",
              startAt: "${startAt}",
              endAt: "${endAt}",
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

          const response = await fetch(this.config.graphqlUrl, {
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
          console.warn(`⚠️ Error en query optimizado de tolls:`, error)

          // FALLBACK: Si falla la query optimizada, usar método secuencial
          for (const balance of balancesToProcess) {
            try {
              const movementsQuery = `
                query GetBalanceMovements($balanceId: String!, $companyId: String, $driverId: String, $startAt: DateTime!, $endAt: DateTime!, $page: Int, $perPage: Int) {
                  paginatedBalanceMovements(
                    balanceId: $balanceId,
                    companyId: $companyId,
                    driverId: $driverId,
                    startAt: $startAt,
                    endAt: $endAt,
                    page: $page,
                    perPage: $perPage
                  ) {
                    movements {
                      breakdown {
                        name
                        value
                      }
                    }
                  }
                }
              `

              const movementsResponse = await fetch(this.config.graphqlUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                  query: movementsQuery,
                  variables: {
                    balanceId: balance.id,
                    companyId,
                    driverId,
                    startAt,
                    endAt,
                    page: 1,
                    perPage: 500,
                  },
                }),
              })

              if (movementsResponse.ok) {
                const movementsData = await movementsResponse.json()
                const paginatedData = movementsData.data?.paginatedBalanceMovements

                if (paginatedData && paginatedData.movements) {
                  for (const movement of paginatedData.movements) {
                    if (movement.breakdown) {
                      for (const breakdown of movement.breakdown) {
                        if (breakdown.name === 'supplement:toll') {
                          totalTolls += Math.abs(breakdown.value || 0)
                        }
                      }
                    }
                  }
                }
              }
            } catch (balanceError) {
              console.warn(`⚠️ Error obteniendo movimientos del balance ${balance.id}:`, balanceError)
            }
          }
        }
      }

      // Convertir de centavos a pesos antes de retornar
      return totalTolls / 100

    } catch (error) {
      console.error(`❌ Error obteniendo peajes del conductor ${driverId}:`, error)
      return 0
    }
  }

  /**
   * Obtener datos completos de un conductor siguiendo exactamente la estructura de script.gs.rtf
   * Queries separadas: driver+stats, journeys, asset
   */
  async getDriverCompleteData(driverId: string, companyId: string, startAt: string, endAt: string): Promise<any> {
    try {
      const token = await this.authenticate()

      // EXACTAMENTE como en script.gs.rtf - fetchDriverStats_
      const driverQuery = `
        query ($companyId: String, $driverId: String!, $startAt: DateTime!, $endAt: DateTime!) {
          driver(id: $driverId, companyId: $companyId) {
            name
            surname
            email
            nationalIdNumber
            mobileNum
            driverLicense
            preferences {
              name
              enabled
            }
            stats(startAt: $startAt, endAt: $endAt) {
              accepted
              missed
              offered
              assigned
              available
              score
            }
          }
        }
      `

      // EXACTAMENTE como en script.gs.rtf - paginatedJourneys query
      // IMPORTANTE: paginatedJourneys usa String! (no DateTime!)
      const journeysQuery = `
        query ($companyId: String, $driverId: String!, $page: Int, $perPage: Int, $startAt: String!, $endAt: String!) {
          paginatedJourneys(
            companyId: $companyId,
            driverId: $driverId,
            page: $page,
            perPage: $perPage,
            startAt: $startAt,
            endAt: $endAt
          ) {
            page
            pages
            records
            journeys {
              id
              assetId
              finishReason
              paymentMethod
              totals {
                earningsTotal {
                  amount
                  currency
                }
                distance
              }
            }
          }
        }
      `

      console.log(`  📤 Enviando queries para conductor ${driverId}...`)

      // Ejecutar queries en paralelo
      const [driverResponse, journeysResponse] = await Promise.all([
        fetch(this.config.graphqlUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            query: driverQuery,
            variables: {
              companyId,
              driverId,
              startAt, // DateTime! para stats
              endAt,   // DateTime! para stats
            },
          }),
        }),
        fetch(this.config.graphqlUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            query: journeysQuery,
            variables: {
              companyId,
              driverId,
              page: 1,
              perPage: 500, // Aumentado para reducir requests
              startAt, // String! para journeys
              endAt,   // String! para journeys
            },
          }),
        }),
      ])

      console.log(`  ✅ Respuestas: Driver ${driverResponse.status}, Journeys ${journeysResponse.status}`)

      if (!driverResponse.ok || !journeysResponse.ok) {
        const driverText = await driverResponse.text()
        const journeysText = await journeysResponse.text()
        console.error(`  ❌ Driver error: ${driverText}`)
        console.error(`  ❌ Journeys error: ${journeysText}`)
        throw new Error(`Error en GraphQL: Driver ${driverResponse.status}, Journeys ${journeysResponse.status}`)
      }

      const [driverData, journeysData] = await Promise.all([
        driverResponse.json(),
        journeysResponse.json(),
      ])

      // LOG COMPLETO para debugging
      const driverInfo = driverData.data?.driver
      console.log(`  📊 Driver data:`, JSON.stringify(driverInfo, null, 2))
      console.log(`  📋 DNI: ${driverInfo?.nationalIdNumber || 'NULL'}`)
      console.log(`  📋 License: ${driverInfo?.driverLicense || 'NULL'}`)
      console.log(`  📋 Phone: ${driverInfo?.mobileNum || 'NULL'}`)
      console.log(`  📋 Email: ${driverInfo?.email || 'NULL'}`)
      console.log(`  📊 Journeys count:`, journeysData.data?.paginatedJourneys?.journeys?.length || 0)

      if (driverData.errors) {
        console.error(`  ❌ Errores en driver query:`, JSON.stringify(driverData.errors, null, 2))
        throw new Error(`Driver query failed: ${JSON.stringify(driverData.errors)}`)
      }
      if (journeysData.errors) {
        console.error(`  ❌ Errores en journeys query:`, JSON.stringify(journeysData.errors, null, 2))
        throw new Error(`Journeys query failed: ${JSON.stringify(journeysData.errors)}`)
      }

      // Paginar journeys si hay más páginas
      let allJourneys = journeysData.data?.paginatedJourneys?.journeys || []
      const totalPages = journeysData.data?.paginatedJourneys?.pages || 1

      if (totalPages > 1) {
        console.log(`  📄 Obteniendo ${totalPages - 1} páginas adicionales de journeys...`)
        const remainingPages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2)
        const additionalJourneys = await Promise.all(
          remainingPages.map(async (page) => {
            const response = await fetch(this.config.graphqlUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
              },
              body: JSON.stringify({
                query: journeysQuery,
                variables: {
                  companyId,
                  driverId,
                  page,
                  perPage: 500, // Aumentado para reducir requests
                  startAt,
                  endAt,
                },
              }),
            })
            const data = await response.json()
            return data.data?.paginatedJourneys?.journeys || []
          })
        )
        allJourneys = allJourneys.concat(...additionalJourneys)
      }

      return {
        driver: driverData.data?.driver || null,
        journeys: allJourneys,
      }

    } catch (error) {
      console.error(`❌ Error obteniendo datos del conductor ${driverId}:`, error)
      return null
    }
  }

  /**
   * Obtener datos detallados de conductores con stats, viajes, vehículo y peajes
   * Versión SUPER OPTIMIZADA - Trae datos de TODAS las compañías en paralelo
   * EXACTAMENTE como script.gs.txt (líneas 834-1007)
   */
  async getDriversWithDetails(
    period: CabifyPeriod = 'semana',
    customRange?: { startDate: string; endDate: string },
    onProgress?: (current: number, total: number, newDrivers: any[], message: string) => void
  ): Promise<any[]> {
    try {
      console.log('🔄 Iniciando obtención de conductores con detalles completos...')

      // Calcular rango de fechas EXACTAMENTE como script.gs.txt
      let startDate: string, endDate: string

      if (period === 'custom' && customRange) {
        startDate = customRange.startDate
        endDate = customRange.endDate
      } else {
        const range = this.getDateRange(period)
        startDate = range.startDate
        endDate = range.endDate
      }

      console.log(`📅 Rango: ${startDate} - ${endDate}`)

      // PASO 1: Obtener TODAS las compañías (como script.gs línea 834)
      const companyIds = await this.getMetafleetCompanies()

      if (companyIds.length === 0) {
        console.warn('⚠️ No se encontraron compañías')
        return []
      }

      console.log(`🏢 Procesando ${companyIds.length} compañías en paralelo`)

      const allDriversData: any[] = []

      // OPTIMIZACIÓN 1: Procesar TODAS las compañías en paralelo
      const companyPromises = companyIds.map(async (companyId, companyIndex) => {
        try {
          console.log(`  🔄 Compañía ${companyIndex + 1}/${companyIds.length}: ${companyId}`)

          // Obtener conductores de esta compañía
          const drivers = await this.getDriversByCompany(companyId)
          console.log(`    ✅ ${drivers.length} conductores encontrados`)

          const companyDriversData: any[] = []

          // OPTIMIZACIÓN 2: Procesar conductores en batches de 100 en paralelo (MÁXIMO RENDIMIENTO)
          const BATCH_SIZE = 100
          for (let j = 0; j < drivers.length; j += BATCH_SIZE) {
            const batch = drivers.slice(j, j + BATCH_SIZE)
            console.log(`    📦 Batch ${Math.floor(j / BATCH_SIZE) + 1}/${Math.ceil(drivers.length / BATCH_SIZE)} (${batch.length} conductores)`)

            // Paso 1: Obtener datos de todos los conductores del batch en paralelo
            const batchDataPromises = batch.map(async (driver) => {
              try {
                // OPTIMIZACIÓN: Obtener datos del conductor Y peajes en paralelo
                const [completeData, totalPeajes] = await Promise.all([
                  this.getDriverCompleteData(driver.id, companyId, startDate, endDate),
                  this.getTollsForDriver(companyId, driver.id, startDate, endDate).catch(() => 0)
                ])

                if (!completeData || !completeData.driver) {
                  console.warn(`      ⚠️ No se obtuvieron datos para ${driver.name}`)
                  return null
                }

                const driverData = completeData.driver
                const journeys = completeData.journeys || []

                // EXACTAMENTE como script.gs líneas 872-878
                const assignedSeconds = Number(driverData.stats?.assigned || 0)
                const availableSeconds = Number(driverData.stats?.available || 0)
                const connectedSeconds = assignedSeconds + availableSeconds
                const horasConectadas = connectedSeconds / 3600
                const tasaOcupacion = connectedSeconds > 0 ? (assignedSeconds / connectedSeconds) * 100 : 0

                // EXACTAMENTE como script.gs líneas 880-882
                const accepted = Number(driverData.stats?.accepted || 0)
                const missed = Number(driverData.stats?.missed || 0)
                const offered = Number(driverData.stats?.offered || 0)
                const rejected = Math.max(offered - accepted - missed, 0)
                const totalConsidered = accepted + rejected + missed
                const tasaAceptacion = totalConsidered > 0 ? (accepted / totalConsidered) * 100 : 0

                // EXACTAMENTE como script.gs líneas 893-918
                let cobroEfectivoMinor = 0
                let cobroAppMinor = 0
                let gananciaTotalViajesMinor = 0
                let viajesCompletados = 0
                const assetIds = new Set<string>()

                journeys.forEach((j: any) => {
                  try {
                    if (j.assetId) {
                      assetIds.add(j.assetId)
                    }

                    const hasEarnings = j.totals?.earningsTotal?.amount > 0

                    if (hasEarnings) {
                      const amt = Number(j.totals.earningsTotal.amount)
                      gananciaTotalViajesMinor += amt
                      if (j.paymentMethod === 'cash') cobroEfectivoMinor += amt
                      else cobroAppMinor += amt

                      if (j.finishReason === 'drop_off') {
                        viajesCompletados++
                      }
                    }
                  } catch (journeyError) {
                    console.log(`      ⚠️ Error en journey ${j.id}:`, journeyError)
                  }
                })

                // Convertir de centavos a pesos (script.gs línea 941)
                const cobroEfectivo = cobroEfectivoMinor / 100
                const cobroApp = cobroAppMinor / 100
                const gananciaTotalViajes = gananciaTotalViajesMinor / 100

                // Permiso efectivo (script.gs líneas 488-489, 950)
                const cashPreference = driverData.preferences?.find((p: any) => p.name === 'payment_cash')
                const permisoEfectivo = cashPreference?.enabled ? 'Activado' : 'Desactivado'

                // Usar assetId más frecuente (script.gs líneas 920-922)
                const firstAssetId = assetIds.size > 0 ? Array.from(assetIds)[0] : ''

                return {
                  driver,
                  driverData,
                  firstAssetId,
                  cobroEfectivo,
                  cobroApp,
                  gananciaTotalViajes,
                  totalPeajes,
                  horasConectadas,
                  tasaOcupacion,
                  tasaAceptacion,
                  permisoEfectivo,
                  viajesCompletados,
                  rejected,
                  missed,
                  companyId
                }
              } catch (error) {
                console.warn(`      ⚠️ Error procesando conductor ${driver.name} ${driver.surname}:`, error)
                return null
              }
            })

            const batchData = await Promise.all(batchDataPromises)
            const validBatchData = batchData.filter(d => d !== null)

            // Paso 2: Recolectar todos los assetIds únicos del batch
            const batchAssetIds = Array.from(new Set(validBatchData.map(d => d!.firstAssetId).filter(Boolean)))

            // Paso 3: Obtener TODOS los assets en 1 sola query batch (OPTIMIZACIÓN!)
            const batchAssets = batchAssetIds.length > 0
              ? await this.getAssetsBatch(batchAssetIds, companyId)
              : []

            // Crear mapa de assets para acceso rápido
            const assetsMap = new Map(batchAssets.map(asset => [asset.id, asset]))

            // Paso 4: Combinar datos con assets (script.gs líneas 924-991)
            const batchResults = validBatchData.map((data) => {
              if (!data) return null

              const {
                driver,
                driverData,
                firstAssetId,
                cobroEfectivo,
                cobroApp,
                gananciaTotalViajes,
                totalPeajes,
                horasConectadas,
                tasaOcupacion,
                tasaAceptacion,
                permisoEfectivo,
                viajesCompletados,
                rejected,
                missed,
                companyId
              } = data

              // Obtener asset del mapa
              const assetData = firstAssetId ? assetsMap.get(firstAssetId) : null

              const vehicleMake = assetData?.make || ''
              const vehicleModel = assetData?.model || ''
              const vehicleRegPlate = assetData?.regPlate || ''
              const vehiculoInfo = [vehicleMake, vehicleModel].filter(Boolean).join(' ')

              // Formato exacto de script.gs líneas 944-946
              const hoursFormatted = Math.floor(horasConectadas)
              const minutesFormatted = Math.floor((horasConectadas - hoursFormatted) * 60)
              const horasConectadasFormato = `${hoursFormatted}h ${minutesFormatted}m`

              return {
                id: driver.id,
                companyId,
                companyName: companyId,
                name: driverData.name || driver.name || '',
                surname: driverData.surname || driver.surname || '',
                email: driverData.email || driver.email || '',
                nationalIdNumber: driverData.nationalIdNumber || driver.nationalIdNumber || '',
                mobileNum: driverData.mobileNum || driver.mobileNum || '',
                mobileCc: driverData.mobileCc || driver.mobileCc || '',
                driverLicense: driverData.driverLicense || driver.driverLicense || '',
                assetId: firstAssetId || '',
                vehicleMake,
                vehicleModel,
                vehicleRegPlate,
                vehiculo: vehiculoInfo,
                score: driverData.stats?.score || driver.score || 0,
                viajesAceptados: driverData.stats?.accepted || 0,
                viajesPerdidos: missed,
                viajesOfrecidos: driverData.stats?.offered || 0,
                viajesFinalizados: viajesCompletados,
                viajesRechazados: rejected,
                tasaAceptacion: Number(tasaAceptacion.toFixed(2)),
                horasConectadas: Number(horasConectadas.toFixed(1)),
                horasConectadasFormato,
                tasaOcupacion: Number(tasaOcupacion.toFixed(2)),
                cobroEfectivo: Number(cobroEfectivo.toFixed(2)),
                cobroApp: Number(cobroApp.toFixed(2)),
                gananciaTotal: Number(gananciaTotalViajes.toFixed(2)),
                gananciaPorHora: horasConectadas > 0 ? Number((gananciaTotalViajes / horasConectadas).toFixed(2)) : 0,
                peajes: Number(totalPeajes.toFixed(2)),
                permisoEfectivo,
                disabled: driver.disabled || false,
                activatedAt: driver.activatedAt || null
              }
            })

            const validResults = batchResults.filter(r => r !== null)
            companyDriversData.push(...validResults)

            // Reportar progreso después de cada batch
            if (onProgress) {
              allDriversData.push(...validResults)
              const totalProcessed = allDriversData.length
              const totalDrivers = drivers.length * companyIds.length
              onProgress(
                totalProcessed,
                totalDrivers,
                validResults,
                `Procesando conductores: ${totalProcessed}/${totalDrivers}`
              )
            }
          }

          console.log(`    ✅ Compañía ${companyId}: ${companyDriversData.length} conductores procesados`)
          return companyDriversData

        } catch (error) {
          console.error(`    ❌ Error en compañía ${companyId}:`, error)
          return []
        }
      })

      // Esperar a que TODAS las compañías terminen
      await Promise.all(companyPromises)

      // allDriversData ya contiene todos los resultados gracias al callback incremental
      console.log(`✅ TOTAL: ${allDriversData.length} conductores de ${companyIds.length} compañías`)
      return allDriversData

    } catch (error) {
      console.error('❌ Error general:', error)
      throw error
    }
  }

  /**
   * Obtener datos completos de conductores con stats y viajes
   */
  async getDriversData(period: CabifyPeriod = 'semana'): Promise<CabifyDriver[]> {
    try {
      // Calcular rango de fechas
      const { startDate, endDate } = this.getDateRange(period)

      console.log(`📊 Consultando datos de Cabify para período: ${period}`)
      console.log(`📅 Rango: ${startDate} - ${endDate}`)

      // 1. Obtener todos los conductores
      const drivers = await this.getAllDrivers()

      // 2. Para cada conductor, obtener stats y viajes
      const driversData: CabifyDriver[] = []

      for (const driver of drivers) {
        try {
          // Obtener stats y viajes en paralelo
          const [stats, journeys] = await Promise.all([
            this.getDriverStats(driver.id, startDate, endDate),
            this.getDriverJourneys(driver.id, startDate, endDate)
          ])

          // Calcular métricas
          const horasConectadas = (stats.stats.connected || 0) / 3600 // Convertir segundos a horas
          const tasaAceptacion = stats.stats.offered > 0
            ? (stats.stats.accepted / stats.stats.offered) * 100
            : 0

          const porcentajeOcupado = stats.stats.connected > 0
            ? ((stats.stats.assigned || 0) / stats.stats.connected) * 100
            : 0

          // Calcular ganancias
          let cobroEfectivo = 0
          let cobroApp = 0
          let peajes = 0

          for (const journey of journeys) {
            const totals = journey.totals || {}
            const breakdown = totals.driverEarningBreakdown || {}

            // Extraer amounts de la estructura anidada según la API de Cabify
            cobroEfectivo += breakdown.cash?.amount || 0
            cobroApp += breakdown.credit?.amount || 0
            peajes += breakdown.toll?.amount || 0
          }

          const gananciaTotal = cobroEfectivo + cobroApp
          const gananciaPorHora = horasConectadas > 0 ? gananciaTotal / horasConectadas : 0

          // Obtener preferencia de efectivo
          const cashPreference = stats.preferences?.find((p: any) => p.name === 'payment_cash')
          const permisoEfectivo = cashPreference?.enabled ? 'Activado' : 'Desactivado'

          // Construir objeto de conductor
          driversData.push({
            conductor: `${driver.name} ${driver.surname}`.trim(),
            email: driver.email || '',
            dni: driver.nationalIdNumber || '',
            patente: '', // Se completará con el cruce de BD
            viajesFinalizados: stats.stats.dropOffs || 0,
            tasaAceptacion: Number(tasaAceptacion.toFixed(1)),
            horasConectadas: Number(horasConectadas.toFixed(1)),
            horasConectadasFormato: `${Math.floor(horasConectadas)}h ${Math.round((horasConectadas % 1) * 60)}m`,
            porcentajeOcupado: Number(porcentajeOcupado.toFixed(1)),
            score: stats.score || 0,
            gananciaPorHora: Number(gananciaPorHora.toFixed(2)),
            cobroEfectivo: Number(cobroEfectivo.toFixed(2)),
            cobroApp: Number(cobroApp.toFixed(2)),
            peajes: Number(peajes.toFixed(2)),
            gananciaTotal: Number(gananciaTotal.toFixed(2)),
            permisoEfectivo
          })

        } catch (error) {
          console.warn(`⚠️  Error procesando conductor ${driver.name} ${driver.surname}:`, error)
          // Continuar con el siguiente conductor
        }
      }

      console.log(`✅ ${driversData.length} conductores procesados exitosamente`)
      return driversData

    } catch (error) {
      console.error('❌ Error obteniendo datos de Cabify:', error)
      throw new Error(`No se pudieron obtener los datos de Cabify: ${error instanceof Error ? error.message : 'Error desconocido'}`)
    }
  }

  /**
   * Calcular rango de fechas según el período
   * EXACTAMENTE como en script.gs - usando hora de Argentina y conversión a UTC con offset +3
   */
  private getDateRange(period: CabifyPeriod): { startDate: string; endDate: string } {
    // Obtener fecha actual en Argentina (como script.gs getArgentinaDate)
    const now = this.getArgentinaDate()

    let startLocal: Date
    let endLocal: Date

    switch (period) {
      case 'ayer':
        // getYesterdayInfo() de script.gs líneas 763-796
        const yesterday = new Date(now)
        yesterday.setDate(yesterday.getDate() - 1)
        yesterday.setHours(0, 0, 0, 0)

        const endOfYesterday = new Date(yesterday)
        endOfYesterday.setHours(23, 59, 59, 999)

        startLocal = yesterday
        endLocal = endOfYesterday
        break

      case 'semana_actual':
        // Semana actual no está en script.gs pero lo mantenemos
        const dayOfWeek = now.getDay()
        const monday = new Date(now)
        const deltaToMonday = (dayOfWeek === 0 ? -6 : 1 - dayOfWeek)
        monday.setDate(monday.getDate() + deltaToMonday)
        monday.setHours(0, 0, 0, 0)

        const currentEnd = new Date(now)
        currentEnd.setHours(23, 59, 59, 999)

        startLocal = monday
        endLocal = currentEnd
        break

      case 'semana':
      default:
        // getLastWeekInfo() de script.gs líneas 718-761
        const today = now
        const dow = today.getDay()

        const currentMonday = new Date(today)
        const delta = (dow === 0 ? -6 : 1 - dow)
        currentMonday.setDate(currentMonday.getDate() + delta)
        currentMonday.setHours(0, 0, 0, 0)

        const weekStart = new Date(currentMonday)
        weekStart.setDate(weekStart.getDate() - 7)

        const weekEnd = new Date(currentMonday)
        weekEnd.setDate(weekEnd.getDate() - 1)
        weekEnd.setHours(23, 59, 59, 999)

        startLocal = weekStart
        endLocal = weekEnd
        break
    }

    // Convertir a UTC con offset +3 horas (Argentina = UTC-3, entonces UTC = local + 3)
    // script.gs líneas 742-754, 776-788
    const startUTC = new Date(Date.UTC(
      startLocal.getFullYear(),
      startLocal.getMonth(),
      startLocal.getDate(),
      3, 0, 0, 0
    ))

    const endUTC = new Date(Date.UTC(
      endLocal.getFullYear(),
      endLocal.getMonth(),
      endLocal.getDate() + 1,
      2, 59, 59, 999
    ))

    return {
      startDate: startUTC.toISOString(),
      endDate: endUTC.toISOString(),
    }
  }

  /**
   * Limpiar tokens (útil para logout o forzar re-autenticación)
   */
  clearTokens(): void {
    this.accessToken = null
    this.tokenExpiry = null
  }

  /**
   * Obtener fecha y hora actual en Buenos Aires
   */
  getArgentinaDate(): Date {
    // Crear fecha en UTC
    const now = new Date()

    // Convertir a horario de Buenos Aires usando Intl
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Argentina/Buenos_Aires',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })

    const parts = formatter.formatToParts(now)
    const get = (type: string) => parts.find(p => p.type === type)?.value || ''

    const year = parseInt(get('year'))
    const month = parseInt(get('month')) - 1 // JavaScript months are 0-indexed
    const day = parseInt(get('day'))
    const hour = parseInt(get('hour'))
    const minute = parseInt(get('minute'))
    const second = parseInt(get('second'))

    return new Date(year, month, day, hour, minute, second)
  }

  /**
   * Obtener lunes y domingo de una semana específica en Buenos Aires
   * EXACTAMENTE como script.gs.txt getLastWeekInfo() - líneas 718-761
   *
   * weeksAgo: cuántas semanas atrás desde HOY (0 = semana actual, 1 = semana pasada, etc.)
   */
  getWeekRange(weeksAgo: number = 0): { startDate: string; endDate: string; label: string } {
    // PASO 1: Obtener fecha actual en Argentina (como script.gs línea 719)
    const today = this.getArgentinaDate()
    const dow = today.getDay()

    // PASO 2: Calcular el lunes de ESTA semana (como script.gs líneas 722-725)
    const currentMonday = new Date(today)
    const deltaToMonday = (dow === 0 ? -6 : 1 - dow)
    currentMonday.setDate(currentMonday.getDate() + deltaToMonday)
    currentMonday.setHours(0, 0, 0, 0)

    // PASO 3: Calcular el lunes de la semana deseada
    let monday: Date
    let sunday: Date

    if (weeksAgo === 0) {
      // SEMANA ACTUAL: desde lunes 00:00 hasta AHORA
      monday = new Date(currentMonday)
      sunday = new Date(today) // Hora actual
    } else {
      // SEMANAS ANTERIORES: desde lunes 00:00 hasta domingo 23:59:59
      monday = new Date(currentMonday)
      monday.setDate(monday.getDate() - (weeksAgo * 7))

      sunday = new Date(monday)
      sunday.setDate(sunday.getDate() + 6)
      sunday.setHours(23, 59, 59, 999)
    }

    // PASO 4: Convertir a UTC con offset +3 (script.gs líneas 742-754)
    // Inicio: día a las 03:00 UTC
    const startUTC = new Date(Date.UTC(
      monday.getFullYear(),
      monday.getMonth(),
      monday.getDate(),
      3, 0, 0, 0
    ))

    // Fin: día siguiente a las 02:59:59.999 UTC
    let endUTC: Date
    if (weeksAgo === 0) {
      // Para semana actual, usar la hora actual convertida a UTC
      endUTC = new Date(Date.UTC(
        sunday.getFullYear(),
        sunday.getMonth(),
        sunday.getDate(),
        sunday.getHours() + 3, // Agregar offset de Argentina
        sunday.getMinutes(),
        sunday.getSeconds(),
        sunday.getMilliseconds()
      ))
    } else {
      // Para semanas anteriores, usar fin fijo (domingo 23:59 -> lunes 02:59 UTC)
      endUTC = new Date(Date.UTC(
        sunday.getFullYear(),
        sunday.getMonth(),
        sunday.getDate() + 1,
        2, 59, 59, 999
      ))
    }

    // Generar label con número de semana ISO
    const formatDate = (date: Date) => {
      const day = String(date.getDate()).padStart(2, '0')
      const month = String(date.getMonth() + 1).padStart(2, '0')
      return `${day}/${month}`
    }

    // Calcular número de semana ISO (lunes = inicio de semana)
    const getWeekNumber = (date: Date): number => {
      const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
      const dayNum = d.getUTCDay() || 7
      d.setUTCDate(d.getUTCDate() + 4 - dayNum)
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
      return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
    }

    const weekNum = getWeekNumber(monday)

    let label: string
    if (weeksAgo === 0) {
      label = `Sem ${weekNum} - Actual`
    } else {
      const endDate = new Date(sunday)
      label = `Sem ${weekNum} (${formatDate(monday)} - ${formatDate(endDate)})`
    }

    return {
      startDate: startUTC.toISOString(),
      endDate: endUTC.toISOString(),
      label
    }
  }

  /**
   * Generar lista de semanas disponibles (últimas N semanas)
   * Semana 0 = actual, 1 = anterior, 2 = hace 2 semanas, etc.
   */
  getAvailableWeeks(count: number = 12): Array<{ weeksAgo: number; label: string; startDate: string; endDate: string }> {
    const weeks: Array<{ weeksAgo: number; label: string; startDate: string; endDate: string }> = []

    for (let i = 0; i < count; i++) {
      const range = this.getWeekRange(i)
      weeks.push({
        weeksAgo: i,
        label: range.label,
        startDate: range.startDate,
        endDate: range.endDate
      })
    }

    return weeks
  }
}

// Exportar instancia singleton
export const cabifyService = new CabifyService()
