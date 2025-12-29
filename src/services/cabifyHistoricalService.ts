/**
 * Servicio para consultas de datos históricos de Cabify
 *
 * Estrategia:
 * - SOLO consulta datos desde la tabla cabify_historico
 * - El Edge Function se encarga de sincronizar datos cada 5 minutos
 * - NUNCA llama a la API de Cabify directamente desde el frontend
 */

import { supabase } from '../lib/supabase'

// =====================================================
// TIPOS
// =====================================================

export interface DriverHistoricalData {
  id: string
  companyId: string
  companyName: string
  name: string
  surname: string
  email: string
  nationalIdNumber: string
  mobileNum: string
  mobileCc: string
  driverLicense: string
  assetId: string
  vehicleMake: string
  vehicleModel: string
  vehicleRegPlate: string
  vehiculo: string
  score: number
  viajesAceptados: number
  viajesPerdidos: number
  viajesOfrecidos: number
  viajesFinalizados: number
  viajesRechazados: number
  tasaAceptacion: number
  horasConectadas: number
  horasConectadasFormato: string
  tasaOcupacion: number
  cobroEfectivo: number
  cobroApp: number
  gananciaTotal: number
  gananciaPorHora: number
  peajes: number
  permisoEfectivo: string
  disabled: boolean
  activatedAt: string | null
}

interface CoverageAnalysis {
  percentage: number // 0-100
  totalExpectedRecords: number
  foundRecords: number
  hasFullCoverage: boolean
  gaps: Array<{ start: string; end: string }>
}

interface QueryStats {
  source: 'historical' | 'api' | 'hybrid'
  historicalRecords: number
  apiRecords: number
  totalRecords: number
  executionTimeMs: number
  cacheHit: boolean
}

// =====================================================
// CACHÉ EN MEMORIA
// =====================================================

class SimpleCache<T> {
  private cache = new Map<string, { data: T; expires: number }>()
  private TTL: number

  constructor(ttlMinutes: number = 5) {
    this.TTL = ttlMinutes * 60 * 1000
  }

  get(key: string): T | null {
    const cached = this.cache.get(key)

    if (!cached) return null

    if (Date.now() > cached.expires) {
      this.cache.delete(key)
      return null
    }

    return cached.data
  }

  set(key: string, data: T): void {
    this.cache.set(key, {
      data,
      expires: Date.now() + this.TTL
    })
  }

  clear(): void {
    this.cache.clear()
  }

  invalidatePattern(pattern: string): void {
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key)
      }
    }
  }

  getStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    }
  }
}

// =====================================================
// SERVICIO PRINCIPAL
// =====================================================

class CabifyHistoricalService {
  private cache = new SimpleCache<DriverHistoricalData[]>(5) // 5 minutos TTL
  private statsCache = new SimpleCache<QueryStats>(10) // 10 minutos TTL

  /**
   * Verificar si el rango de fechas incluye el día actual
   */
  private includesToday(startDate: string, endDate: string): boolean {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const start = new Date(startDate)
    const end = new Date(endDate)

    return start <= now && end >= today
  }

  /**
   * Verificar si los datos fueron sincronizados recientemente (últimos 10 min)
   * @deprecated No se usa actualmente, pero se mantiene para uso futuro
   */
  // @ts-expect-error - Método no usado pero mantenido para uso futuro
  private async _checkRecentSync(startDate: string, endDate: string): Promise<boolean> {
    try {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()

      const { data, error } = await supabase
        .from('cabify_sync_log')
        .select('created_at')
        .eq('period_start', startDate)
        .eq('period_end', endDate)
        .eq('status', 'success')
        .gte('created_at', tenMinutesAgo)
        .limit(1)

      if (error) {
        console.warn('⚠️ Error verificando sync reciente:', error.message)
        return false
      }

      return data && data.length > 0
    } catch (error) {
      console.warn('⚠️ Error en checkRecentSync:', error)
      return false
    }
  }

  /**
   * Método principal: Obtener datos con estrategia híbrida
   */
  async getDriversData(
    startDate: string,
    endDate: string,
    options: {
      forceAPI?: boolean // Forzar consulta a API (ignorar caché e histórico)
      onProgress?: (current: number, total: number, message: string) => void
    } = {}
  ): Promise<{ drivers: DriverHistoricalData[]; stats: QueryStats }> {
    const startTime = Date.now()
    const cacheKey = `drivers_${startDate}_${endDate}`
    const isToday = this.includesToday(startDate, endDate)

    // 1. Verificar caché en memoria (solo para datos NO de hoy, o con TTL muy corto)
    if (!options.forceAPI && !isToday) {
      const cached = this.cache.get(cacheKey)
      if (cached) {
        return {
          drivers: cached,
          stats: {
            source: 'historical',
            historicalRecords: cached.length,
            apiRecords: 0,
            totalRecords: cached.length,
            executionTimeMs: Date.now() - startTime,
            cacheHit: true
          }
        }
      }
    }

    // 2. Consultar histórico en BD
    const historical = await this.queryHistorical(startDate, endDate)

    // 3. Analizar cobertura
    const coverage = this.analyzeCoverage(historical, startDate, endDate)

    // 4. SIEMPRE retornar datos del histórico (NUNCA llamar a la API desde el frontend)
    // El Edge Function se encarga de mantener el histórico actualizado cada 5 minutos

    // Cachear resultado (incluso si está vacío, para evitar consultas repetidas)
    if (historical.length > 0) {
      this.cache.set(cacheKey, historical)
    }

    const stats: QueryStats = {
      source: 'historical',
      historicalRecords: historical.length,
      apiRecords: 0,
      totalRecords: historical.length,
      executionTimeMs: Date.now() - startTime,
      cacheHit: false
    }

    return { drivers: historical, stats }
  }

  /**
   * Consultar datos históricos de la BD
   * Los datos se almacenan por día, esta función los agrega por conductor
   */
  private async queryHistorical(
    startDate: string,
    endDate: string
  ): Promise<DriverHistoricalData[]> {
    // IMPORTANTE: Las fechas ya vienen correctamente calculadas desde cabifyService.getWeekRange()
    // con la alineación a zona horaria de Argentina (UTC-3):
    //
    // - startDate: "2025-12-08T03:00:00Z" = Lunes 08/12 00:00 Argentina
    // - endDate: "2025-12-15T02:59:59Z" = Domingo 14/12 23:59:59 Argentina (día+1 02:59:59 UTC)
    //
    // NO debemos modificar estas fechas, ya tienen el formato correcto de code.txt

    // Consulta usando las fechas originales directamente
    // startDate ya tiene T03:00:00Z (00:00 Argentina)
    // endDate ya tiene T02:59:59Z del día siguiente (23:59:59 Argentina del día anterior)
    const { data, error } = await supabase
      .from('cabify_historico')
      .select('*')
      .gte('fecha_inicio', startDate)
      .lte('fecha_inicio', endDate)
      .order('ganancia_total', { ascending: false })

    if (error) {
      console.error('❌ Error consultando histórico:', error)
      return []
    }

    if (!data || data.length === 0) {
      return []
    }

    // PASO 1: Eliminar duplicados - quedarse solo con el registro más reciente por (dni, fecha)
    // Esto soluciona el problema de múltiples sincronizaciones por día
    const uniqueRecordsMap = new Map<string, any>()

    for (const record of data as any[]) {
      const dni = record.dni || record.cabify_driver_id
      if (!dni) continue

      // Crear key única: dni + fecha del día
      const fechaDia = record.fecha_inicio ? record.fecha_inicio.split('T')[0] : ''
      const uniqueKey = `${dni}_${fechaDia}`

      const existing = uniqueRecordsMap.get(uniqueKey)

      // Si no existe o el registro actual es más reciente, guardar
      if (!existing) {
        uniqueRecordsMap.set(uniqueKey, record)
      } else {
        // Comparar fecha_guardado para quedarse con el más reciente
        const existingDate = new Date(existing.fecha_guardado || 0)
        const currentDate = new Date(record.fecha_guardado || 0)

        if (currentDate > existingDate) {
          uniqueRecordsMap.set(uniqueKey, record)
        }
      }
    }

    const uniqueRecords = Array.from(uniqueRecordsMap.values())

    // PASO 2: Agrupar y sumar datos por conductor (dni)
    const driverMap = new Map<string, any>()

    for (const record of uniqueRecords) {
      const dni = record.dni || record.cabify_driver_id
      if (!dni) continue

      const existing = driverMap.get(dni)

      if (!existing) {
        // Primer registro del conductor
        driverMap.set(dni, {
          id: record.cabify_driver_id,
          companyId: record.cabify_company_id,
          companyName: record.cabify_company_id,
          name: record.nombre || '',
          surname: record.apellido || '',
          email: record.email || '',
          nationalIdNumber: record.dni || '',
          mobileNum: record.telefono_numero || '',
          mobileCc: record.telefono_codigo || '',
          driverLicense: record.licencia || '',
          assetId: record.vehiculo_id || '',
          vehicleMake: record.vehiculo_marca || '',
          vehicleModel: record.vehiculo_modelo || '',
          vehicleRegPlate: record.vehiculo_patente || '',
          vehiculo: record.vehiculo_completo || '',
          // Acumuladores
          score: Number(record.score || 0),
          scoreCount: 1,
          viajesAceptados: record.viajes_aceptados || 0,
          viajesPerdidos: record.viajes_perdidos || 0,
          viajesOfrecidos: record.viajes_ofrecidos || 0,
          viajesFinalizados: record.viajes_finalizados || 0,
          viajesRechazados: record.viajes_rechazados || 0,
          tasaAceptacionSum: Number(record.tasa_aceptacion || 0),
          tasaAceptacionCount: record.tasa_aceptacion ? 1 : 0,
          horasConectadas: Number(record.horas_conectadas || 0),
          tasaOcupacionSum: Number(record.tasa_ocupacion || 0),
          tasaOcupacionCount: record.tasa_ocupacion ? 1 : 0,
          cobroEfectivo: Number(record.cobro_efectivo || 0),
          cobroApp: Number(record.cobro_app || 0),
          gananciaTotal: Number(record.ganancia_total || 0),
          peajes: Number(record.peajes || 0),
          permisoEfectivo: record.permiso_efectivo || 'Desactivado',
          disabled: record.estado_conductor === 'Deshabilitado',
        })
      } else {
        // Acumular datos de días adicionales
        existing.viajesAceptados += record.viajes_aceptados || 0
        existing.viajesPerdidos += record.viajes_perdidos || 0
        existing.viajesOfrecidos += record.viajes_ofrecidos || 0
        existing.viajesFinalizados += record.viajes_finalizados || 0
        existing.viajesRechazados += record.viajes_rechazados || 0
        existing.horasConectadas += Number(record.horas_conectadas || 0)
        existing.cobroEfectivo += Number(record.cobro_efectivo || 0)
        existing.cobroApp += Number(record.cobro_app || 0)
        existing.gananciaTotal += Number(record.ganancia_total || 0)
        existing.peajes += Number(record.peajes || 0)

        // Para promedios
        if (record.score) {
          existing.score += Number(record.score)
          existing.scoreCount++
        }
        if (record.tasa_aceptacion) {
          existing.tasaAceptacionSum += Number(record.tasa_aceptacion)
          existing.tasaAceptacionCount++
        }
        if (record.tasa_ocupacion) {
          existing.tasaOcupacionSum += Number(record.tasa_ocupacion)
          existing.tasaOcupacionCount++
        }

        // Usar el último valor de permiso_efectivo
        if (record.permiso_efectivo) {
          existing.permisoEfectivo = record.permiso_efectivo
        }
      }
    }

    // Convertir a formato final con promedios calculados
    const aggregatedDrivers: DriverHistoricalData[] = Array.from(driverMap.values()).map(d => {
      const avgScore = d.scoreCount > 0 ? d.score / d.scoreCount : 0
      const avgTasaAceptacion = d.tasaAceptacionCount > 0 ? d.tasaAceptacionSum / d.tasaAceptacionCount : 0
      const avgTasaOcupacion = d.tasaOcupacionCount > 0 ? d.tasaOcupacionSum / d.tasaOcupacionCount : 0
      const gananciaPorHora = d.horasConectadas > 0 ? d.gananciaTotal / d.horasConectadas : 0

      // Formatear horas conectadas
      const hours = Math.floor(d.horasConectadas)
      const minutes = Math.floor((d.horasConectadas - hours) * 60)
      const horasConectadasFormato = `${hours}h ${minutes}m`

      return {
        id: d.id,
        companyId: d.companyId,
        companyName: d.companyName,
        name: d.name,
        surname: d.surname,
        email: d.email,
        nationalIdNumber: d.nationalIdNumber,
        mobileNum: d.mobileNum,
        mobileCc: d.mobileCc,
        driverLicense: d.driverLicense,
        assetId: d.assetId,
        vehicleMake: d.vehicleMake,
        vehicleModel: d.vehicleModel,
        vehicleRegPlate: d.vehicleRegPlate,
        vehiculo: d.vehiculo,
        score: Number(avgScore.toFixed(2)),
        viajesAceptados: d.viajesAceptados,
        viajesPerdidos: d.viajesPerdidos,
        viajesOfrecidos: d.viajesOfrecidos,
        viajesFinalizados: d.viajesFinalizados,
        viajesRechazados: d.viajesRechazados,
        tasaAceptacion: Number(avgTasaAceptacion.toFixed(2)),
        horasConectadas: Number(d.horasConectadas.toFixed(1)),
        horasConectadasFormato,
        tasaOcupacion: Number(avgTasaOcupacion.toFixed(2)),
        cobroEfectivo: Number(d.cobroEfectivo.toFixed(2)),
        cobroApp: Number(d.cobroApp.toFixed(2)),
        gananciaTotal: Number(d.gananciaTotal.toFixed(2)),
        gananciaPorHora: Number(gananciaPorHora.toFixed(2)),
        peajes: Number(d.peajes.toFixed(2)),
        permisoEfectivo: d.permisoEfectivo,
        disabled: d.disabled,
        activatedAt: null
      }
    })

    // Ordenar por ganancia total descendente
    aggregatedDrivers.sort((a, b) => b.gananciaTotal - a.gananciaTotal)

    return aggregatedDrivers
  }

  /**
   * Analizar cobertura de datos históricos
   */
  private analyzeCoverage(
    historical: DriverHistoricalData[],
    startDate: string,
    endDate: string
  ): CoverageAnalysis {
    // Por ahora, análisis simple: si hay datos, asumimos cobertura completa
    // En futuro se puede mejorar para detectar gaps por conductor

    const hasData = historical.length > 0

    return {
      percentage: hasData ? 100 : 0,
      totalExpectedRecords: hasData ? historical.length : 0,
      foundRecords: historical.length,
      hasFullCoverage: hasData,
      gaps: hasData ? [] : [{ start: startDate, end: endDate }]
    }
  }

  /**
   * Obtener estadísticas de uso del caché
   */
  getCacheStats() {
    return {
      cache: this.cache.getStats(),
      statsCache: this.statsCache.getStats()
    }
  }

  /**
   * Limpiar caché manualmente
   */
  clearCache() {
    this.cache.clear()
    this.statsCache.clear()
  }

  /**
   * Invalidar caché para un patrón específico
   */
  invalidateCache(pattern: string) {
    this.cache.invalidatePattern(pattern)
    this.statsCache.invalidatePattern(pattern)
  }

  /**
   * Obtener estadísticas de cobertura histórica
   */
  async getHistoricalCoverageStats() {
    const { data, error } = await supabase
      .rpc('get_historical_coverage_stats')

    if (error) {
      console.error('❌ Error obteniendo estadísticas:', error)
      return []
    }

    return data || []
  }
}

// Exportar instancia singleton
export const cabifyHistoricalService = new CabifyHistoricalService()
