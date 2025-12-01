/**
 * Servicio para consultas híbridas de datos Cabify
 *
 * Estrategia inteligente:
 * 1. Consultar primero datos históricos en BD (rápido)
 * 2. Identificar gaps (períodos faltantes)
 * 3. Consultar API solo para gaps (eficiente)
 * 4. Combinar y retornar
 */

import { supabase } from '../lib/supabase'
import { cabifyService } from './cabifyService'
import type { CabifyPeriod } from '../types/cabify.types'

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
        console.log('✅ Datos desde caché en memoria (0ms)')
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
    console.log('🔍 Consultando datos históricos...')
    const historical = await this.queryHistorical(startDate, endDate)

    // 3. Analizar cobertura
    const coverage = this.analyzeCoverage(historical, startDate, endDate)
    console.log(`📊 Cobertura histórica: ${coverage.percentage.toFixed(1)}%`)

    // 4. Si hay datos en la tabla, SIEMPRE usarlos (se sincronizan automáticamente)
    // No verificar si son "recientes" - el cron job se encarga de mantenerlos actualizados
    if (coverage.hasFullCoverage && !options.forceAPI) {
      console.log('✅ 100% desde histórico - 0 llamadas API')

      // Cachear resultado
      this.cache.set(cacheKey, historical)

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

    // 5. Si no hay datos en la tabla → consultar API
    console.log('🔄 Consultando API Cabify (no hay datos en histórico)...')

    const apiDrivers = await cabifyService.getDriversWithDetails(
      'custom' as CabifyPeriod,
      { startDate, endDate },
      options.onProgress ? (current, total, _newDrivers, message) => options.onProgress!(current, total, message) : undefined
    )

    // 6. Guardar en histórico (asíncrono, no bloquear respuesta)
    this.saveToHistorical(apiDrivers, startDate, endDate).catch(err => {
      console.error('⚠️  Error guardando en histórico:', err)
    })

    // 7. Combinar histórico + API (quitar duplicados)
    const combined = this.mergeDriversData(historical, apiDrivers)

    // Cachear resultado
    this.cache.set(cacheKey, combined)

    const stats: QueryStats = {
      source: coverage.percentage > 0 ? 'hybrid' : 'api',
      historicalRecords: historical.length,
      apiRecords: apiDrivers.length,
      totalRecords: combined.length,
      executionTimeMs: Date.now() - startTime,
      cacheHit: false
    }

    console.log(`✅ Datos combinados: ${historical.length} histórico + ${apiDrivers.length} API = ${combined.length} total`)

    return { drivers: combined, stats }
  }

  /**
   * Consultar datos históricos de la BD
   */
  private async queryHistorical(
    startDate: string,
    _endDate: string
  ): Promise<DriverHistoricalData[]> {
    // Consulta flexible: buscar por fecha_inicio únicamente
    // Esto permite usar datos sincronizados sin requerir fecha_fin exacta
    const { data, error } = await supabase
      .from('cabify_historico')
      .select('*')
      .eq('fecha_inicio', startDate)
      .gte('fecha_fin', startDate) // fecha_fin >= startDate (datos válidos)
      .order('ganancia_total', { ascending: false })

    if (error) {
      console.error('❌ Error consultando histórico:', error)
      return []
    }

    if (!data || data.length === 0) {
      console.log('📭 Sin datos históricos para este período')
      return []
    }

    console.log(`📦 ${data.length} registros históricos encontrados`)

    // Mapear a formato estándar
    return (data as any[]).map((record: any) => ({
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
      score: Number(record.score || 0),
      viajesAceptados: record.viajes_aceptados || 0,
      viajesPerdidos: record.viajes_perdidos || 0,
      viajesOfrecidos: record.viajes_ofrecidos || 0,
      viajesFinalizados: record.viajes_finalizados || 0,
      viajesRechazados: record.viajes_rechazados || 0,
      tasaAceptacion: Number(record.tasa_aceptacion || 0),
      horasConectadas: Number(record.horas_conectadas || 0),
      horasConectadasFormato: record.horas_conectadas_formato || '0h 0m',
      tasaOcupacion: Number(record.tasa_ocupacion || 0),
      cobroEfectivo: Number(record.cobro_efectivo || 0),
      cobroApp: Number(record.cobro_app || 0),
      gananciaTotal: Number(record.ganancia_total || 0),
      gananciaPorHora: Number(record.ganancia_por_hora || 0),
      peajes: Number(record.peajes || 0),
      permisoEfectivo: record.permiso_efectivo || 'Desactivado',
      disabled: record.estado_conductor === 'Deshabilitado',
      activatedAt: null
    }))
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
   * Combinar datos históricos + API (eliminar duplicados)
   */
  private mergeDriversData(
    historical: DriverHistoricalData[],
    api: any[]
  ): DriverHistoricalData[] {
    // Crear mapa de históricos por driver ID
    const historicalMap = new Map(
      historical.map(d => [d.id, d])
    )

    // Agregar datos de API solo si no están en histórico
    const merged = [...historical]

    for (const apiDriver of api) {
      if (!historicalMap.has(apiDriver.id)) {
        merged.push(apiDriver)
      }
    }

    return merged
  }

  /**
   * Guardar datos de API en histórico (async, no bloquea)
   */
  private async saveToHistorical(
    drivers: any[],
    startDate: string,
    endDate: string
  ): Promise<void> {
    try {
      if (drivers.length === 0) return

      console.log(`💾 Guardando ${drivers.length} registros en histórico...`)

      const records = drivers.map(d => ({
        cabify_driver_id: d.id,
        cabify_company_id: d.companyId,
        nombre: d.name,
        apellido: d.surname,
        email: d.email,
        dni: d.nationalIdNumber,
        licencia: d.driverLicense,
        telefono_codigo: d.mobileCc,
        telefono_numero: d.mobileNum,
        vehiculo_id: d.assetId,
        vehiculo_patente: d.vehicleRegPlate,
        vehiculo_marca: d.vehicleMake,
        vehiculo_modelo: d.vehicleModel,
        vehiculo_completo: d.vehiculo,
        fecha_inicio: startDate,
        fecha_fin: endDate,
        viajes_finalizados: d.viajesFinalizados,
        viajes_rechazados: d.viajesRechazados,
        viajes_perdidos: d.viajesPerdidos,
        viajes_aceptados: d.viajesAceptados,
        viajes_ofrecidos: d.viajesOfrecidos,
        score: d.score,
        tasa_aceptacion: d.tasaAceptacion,
        tasa_ocupacion: d.tasaOcupacion,
        horas_conectadas: d.horasConectadas,
        horas_conectadas_formato: d.horasConectadasFormato,
        cobro_efectivo: d.cobroEfectivo,
        cobro_app: d.cobroApp,
        peajes: d.peajes,
        ganancia_total: d.gananciaTotal,
        ganancia_por_hora: d.gananciaPorHora,
        permiso_efectivo: d.permisoEfectivo,
        estado_conductor: d.disabled ? 'Deshabilitado' : 'Activo'
      }))

      // Insertar en batches de 500
      const BATCH_SIZE = 500
      for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const batch = records.slice(i, i + BATCH_SIZE)

        const { error } = await supabase
          .from('cabify_historico')
          .insert(batch as any)

        if (error) {
          // Ignorar errores de duplicados (constraint único)
          if (error.code !== '23505') {
            console.error('❌ Error guardando batch en histórico:', error)
          }
        }
      }

      console.log(`✅ Registros guardados en histórico`)

    } catch (error) {
      console.error('❌ Error en saveToHistorical:', error)
      // No lanzar error, solo loguear (no queremos romper el flujo)
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
    console.log('🗑️  Caché limpiado')
  }

  /**
   * Invalidar caché para un patrón específico
   */
  invalidateCache(pattern: string) {
    this.cache.invalidatePattern(pattern)
    this.statsCache.invalidatePattern(pattern)
    console.log(`🗑️  Caché invalidado para: ${pattern}`)
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
