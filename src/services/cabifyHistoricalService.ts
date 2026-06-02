/**
 * Servicio para consultas de datos históricos de Cabify
 *
 * Estrategia:
 * - SOLO consulta datos desde la tabla cabify_historico
 * - El Edge Function se encarga de sincronizar datos cada 5 minutos
 * - NUNCA llama a la API de Cabify directamente desde el frontend
 */

import { supabase } from '../lib/supabase'
import {
  normalizeDni,
  normalizeLicencia,
  normalizeNombre,
  normalizePatente,
} from '../utils/normalizeDocuments'

// IDs de sedes
const SEDE_BARILOCHE_ID = 'f37193f7-5805-4d87-820d-c4521824860e'
const SEDE_BUENOS_AIRES_ID = '80587298-b799-4a98-87a9-2f74890da443'

type CabifySourceAccount = 'buenos_aires_44dreams' | 'bariloche'

interface HistoricalSourceConfig {
  tableName: 'cabify_historico' | 'cabify_historico_bariloche'
  sourceAccount: CabifySourceAccount
  sourceLabel: string
  includeInResults: boolean
}

interface HistoricalRecord {
  cabify_driver_id: string
  cabify_company_id: string | null
  nombre: string | null
  apellido: string | null
  email: string | null
  dni: string | null
  telefono_numero: string | null
  telefono_codigo: string | null
  licencia: string | null
  vehiculo_id: string | null
  vehiculo_marca: string | null
  vehiculo_modelo: string | null
  vehiculo_patente: string | null
  vehiculo_completo: string | null
  score: number | string | null
  viajes_aceptados: number | null
  viajes_perdidos: number | null
  viajes_ofrecidos: number | null
  viajes_finalizados: number | null
  viajes_rechazados: number | null
  tasa_aceptacion: number | string | null
  horas_conectadas: number | string | null
  tasa_ocupacion: number | string | null
  cobro_efectivo: number | string | null
  cobro_app: number | string | null
  ganancia_total: number | string | null
  peajes: number | string | null
  promociones: number | string | null
  deducciones: number | string | null
  permiso_efectivo: string | null
  estado_conductor: string | null
  fecha_inicio: string | null
  fecha_guardado: string | null
  sourceAccount: CabifySourceAccount
  sourceLabel: string
  sourceTable: HistoricalSourceConfig['tableName']
}

interface SedeIdentityIndex {
  dnis: Set<string>
  licencias: Set<string>
  nombres: Set<string>
  patentes: Set<string>
}

const SOURCE_BUENOS_AIRES: HistoricalSourceConfig = {
  tableName: 'cabify_historico',
  sourceAccount: 'buenos_aires_44dreams',
  sourceLabel: 'Buenos Aires / 44Dreams',
  includeInResults: true,
}

const SOURCE_BARILOCHE: HistoricalSourceConfig = {
  tableName: 'cabify_historico_bariloche',
  sourceAccount: 'bariloche',
  sourceLabel: 'Bariloche',
  includeInResults: true,
}

// =====================================================
// TIPOS
// =====================================================

export interface DriverHistoricalData {
  id: string
  companyId: string
  companyName: string
  sourceAccount: CabifySourceAccount
  sourceLabel: string
  sourceTable: HistoricalSourceConfig['tableName']
  sourceCompanyId: string
  sourceCompanyIds: string[]
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
  promociones: number
  deducciones: number
  permisoEfectivo: string
  disabled: boolean
  activatedAt: string | null
  lastSyncedAt: string | null
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
        return false
      }

      return data && data.length > 0
    } catch {
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
      sedeId?: string | null // null = todas las sedes
    } = {}
  ): Promise<{ drivers: DriverHistoricalData[]; stats: QueryStats }> {
    const startTime = Date.now()
    const sedeKey = options.sedeId || 'all'
    const cacheKey = `drivers_${startDate}_${endDate}_${sedeKey}`
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

    // 2. Consultar histórico en BD (tabla depende de la sede)
    const historical = await this.queryHistorical(startDate, endDate, options.sedeId)

    // 3. Analizar cobertura (para logging/debug)
    this.analyzeCoverage(historical, startDate, endDate)

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
  /**
   * Determinar qué fuentes consultar según la sede.
   * Buenos Aires usa el job multicuenta CG + 44Dreams sobre cabify_historico.
   * Bariloche usa una cuenta separada sobre cabify_historico_bariloche.
   */
  private getSourceConfigs(sedeId?: string | null): HistoricalSourceConfig[] {
    if (sedeId === SEDE_BARILOCHE_ID) {
      return [SOURCE_BARILOCHE]
    }
    if (!sedeId) {
      return [SOURCE_BUENOS_AIRES, SOURCE_BARILOCHE]
    }
    if (sedeId === SEDE_BUENOS_AIRES_ID) {
      return [SOURCE_BUENOS_AIRES]
    }
    return [SOURCE_BUENOS_AIRES]
  }

  private getQuerySources(sedeId?: string | null): HistoricalSourceConfig[] {
    const sourceConfigs = this.getSourceConfigs(sedeId)
    const needsBarilocheExclusion = sourceConfigs.some(
      source => source.sourceAccount === 'buenos_aires_44dreams'
    )
    const alreadyQueriesBariloche = sourceConfigs.some(
      source => source.sourceAccount === 'bariloche'
    )

    if (!needsBarilocheExclusion || alreadyQueriesBariloche) {
      return sourceConfigs
    }

    return [
      ...sourceConfigs,
      { ...SOURCE_BARILOCHE, includeInResults: false },
    ]
  }

  /**
   * Índice interno de la sede. La fuente Cabify no es suficiente porque puede
   * traer conductores de otra cuenta; este cruce valida contra Toshify.
   */
  private async getSedeIdentityIndex(sedeId?: string | null): Promise<SedeIdentityIndex | null> {
    if (!sedeId) return null

    const [conductoresResult, vehiculosResult] = await Promise.all([
      supabase
        .from('conductores')
        .select('numero_dni, numero_licencia, nombres, apellidos')
        .eq('sede_id', sedeId)
        .limit(5000),
      supabase
        .from('vehiculos')
        .select('patente')
        .eq('sede_id', sedeId)
        .limit(5000),
    ])

    const index: SedeIdentityIndex = {
      dnis: new Set(),
      licencias: new Set(),
      nombres: new Set(),
      patentes: new Set(),
    }

    if (!conductoresResult.error && conductoresResult.data) {
      for (const conductor of conductoresResult.data as any[]) {
        const dni = this.normalizeRealDni(conductor.numero_dni)
        if (dni) index.dnis.add(dni)

        const licencia = normalizeLicencia(conductor.numero_licencia)
        if (licencia) index.licencias.add(licencia)

        const nombre = normalizeNombre(`${conductor.nombres || ''} ${conductor.apellidos || ''}`)
        if (nombre) index.nombres.add(nombre)
      }
    }

    if (!vehiculosResult.error && vehiculosResult.data) {
      for (const vehiculo of vehiculosResult.data as any[]) {
        const patente = normalizePatente(vehiculo.patente)
        if (patente) index.patentes.add(patente)
      }
    }

    return index
  }

  private normalizeRealDni(value: string | number | null | undefined): string {
    const raw = String(value || '').trim()
    if (!raw || raw.toUpperCase().startsWith('CABIFY_')) return ''

    const dni = normalizeDni(raw)
    return /^\d+$/.test(dni) ? dni : ''
  }

  private recordMatchesSede(record: HistoricalRecord, index: SedeIdentityIndex | null): boolean {
    if (!index) return true

    const dni = this.normalizeRealDni(record.dni)
    if (dni) {
      return index.dnis.has(dni)
    }

    const licencia = normalizeLicencia(record.licencia)
    if (licencia && index.licencias.has(licencia)) return true

    const nombre = normalizeNombre(`${record.nombre || ''} ${record.apellido || ''}`)
    if (nombre && index.nombres.has(nombre)) return true

    const patente = normalizePatente(record.vehiculo_patente)
    return Boolean(patente && index.patentes.has(patente))
  }

  private async queryHistorical(
    startDate: string,
    endDate: string,
    sedeId?: string | null
  ): Promise<DriverHistoricalData[]> {
    const selectFields = 'cabify_driver_id, cabify_company_id, nombre, apellido, email, dni, telefono_numero, telefono_codigo, licencia, vehiculo_id, vehiculo_marca, vehiculo_modelo, vehiculo_patente, vehiculo_completo, score, viajes_aceptados, viajes_perdidos, viajes_ofrecidos, viajes_finalizados, viajes_rechazados, tasa_aceptacion, horas_conectadas, tasa_ocupacion, cobro_efectivo, cobro_app, ganancia_total, peajes, promociones, deducciones, permiso_efectivo, estado_conductor, fecha_inicio, fecha_guardado'

    const sourceConfigs = this.getQuerySources(sedeId)
    const sedeIdentityPromise = this.getSedeIdentityIndex(sedeId)

    // Consultar todas las tablas necesarias en paralelo
    const queryPromises = sourceConfigs.map(source =>
      supabase
        .from(source.tableName)
        .select(selectFields)
        .gte('fecha_inicio', startDate)
        .lte('fecha_inicio', endDate)
        .order('ganancia_total', { ascending: false })
        .limit(5000)
    )

    const results = await Promise.all(queryPromises)
    const sedeIdentityIndex = await sedeIdentityPromise

    const dataBySource = results.map((result, index) => ({
      source: sourceConfigs[index],
      rows: !result.error && result.data ? (result.data as any[]) : [],
    }))

    const barilocheCompanyIds = new Set(
      dataBySource
        .filter(({ source }) => source.sourceAccount === 'bariloche')
        .flatMap(({ rows }) => rows.map(row => row.cabify_company_id).filter(Boolean))
    )

    // Combinar datos de todas las fuentes visibles y excluir de BA las compañías
    // que también llegan por la cuenta/tabla de Bariloche.
    const allData: HistoricalRecord[] = []
    for (const { source, rows } of dataBySource) {
      if (!source.includeInResults) continue

      for (const row of rows) {
        if (
          source.sourceAccount === 'buenos_aires_44dreams' &&
          row.cabify_company_id &&
          barilocheCompanyIds.has(row.cabify_company_id)
        ) {
          continue
        }

        const record: HistoricalRecord = {
          ...row,
          sourceAccount: source.sourceAccount,
          sourceLabel: source.sourceLabel,
          sourceTable: source.tableName,
        }

        if (!this.recordMatchesSede(record, sedeIdentityIndex)) {
          continue
        }

        allData.push(record)
      }
    }

    if (allData.length === 0) {
      return []
    }

    // PASO 1: Eliminar duplicados - quedarse solo con el registro más reciente por (dni, fecha)
    // Esto soluciona el problema de múltiples sincronizaciones por día
    const uniqueRecordsMap = new Map<string, HistoricalRecord>()

    for (const record of allData) {
      const dni = record.dni || record.cabify_driver_id
      if (!dni) continue

      // Crear key única: fuente + dni + fecha del día
      const fechaDia = record.fecha_inicio ? record.fecha_inicio.split('T')[0] : ''
      const uniqueKey = `${record.sourceAccount}_${dni}_${fechaDia}`

      const existing = uniqueRecordsMap.get(uniqueKey)

      // Si no existe o el registro actual es mejor, guardar
      if (!existing) {
        uniqueRecordsMap.set(uniqueKey, record)
      } else {
        // Preferir el registro que tenga datos financieros (peajes/promociones/deducciones)
        // sobre uno más reciente pero vacío — esto resuelve duplicados de scripts legacy
        const existingHasFinancials = Number(existing.peajes || 0) > 0 || Number(existing.promociones || 0) > 0 || Number(existing.deducciones || 0) > 0
        const currentHasFinancials = Number(record.peajes || 0) > 0 || Number(record.promociones || 0) > 0 || Number(record.deducciones || 0) > 0

        if (currentHasFinancials && !existingHasFinancials) {
          // El actual tiene datos financieros y el existente no → preferir actual
          uniqueRecordsMap.set(uniqueKey, record)
        } else if (!currentHasFinancials && existingHasFinancials) {
          // El existente tiene datos financieros y el actual no → mantener existente
          // no hacer nada
        } else {
          // Ambos tienen o ambos no tienen datos financieros → usar el más reciente
          const existingDate = new Date(existing.fecha_guardado || 0)
          const currentDate = new Date(record.fecha_guardado || 0)
          if (currentDate > existingDate) {
            uniqueRecordsMap.set(uniqueKey, record)
          }
        }
      }
    }

    const uniqueRecords = Array.from(uniqueRecordsMap.values())

    // PASO 2: Agrupar y sumar datos por conductor (dni)
    const driverMap = new Map<string, any>()

    for (const record of uniqueRecords) {
      const dniRaw = record.dni || record.cabify_driver_id
      if (!dniRaw) continue
      const dni = normalizeDni(dniRaw)

      const driverKey = `${record.sourceAccount}_${dni}`
      const existing = driverMap.get(driverKey)

      if (!existing) {
        // Primer registro del conductor
        driverMap.set(driverKey, {
          id: record.cabify_driver_id,
          companyId: record.cabify_company_id || '',
          companyName: record.sourceLabel,
          sourceAccount: record.sourceAccount,
          sourceLabel: record.sourceLabel,
          sourceLabels: new Set([record.sourceLabel]),
          sourceTable: record.sourceTable,
          sourceCompanyId: record.cabify_company_id || '',
          sourceCompanyIds: new Set(record.cabify_company_id ? [record.cabify_company_id] : []),
          lastSyncedAt: record.fecha_guardado || null,
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
          promociones: Number(record.promociones || 0),
          deducciones: Number(record.deducciones || 0),
          permisoEfectivo: record.permiso_efectivo || 'Desactivado',
          disabled: record.estado_conductor === 'Deshabilitado',
        })
      } else {
        if (record.sourceLabel) {
          existing.sourceLabels.add(record.sourceLabel)
        }
        if (record.cabify_company_id) {
          existing.sourceCompanyIds.add(record.cabify_company_id)
        }
        if (
          record.fecha_guardado &&
          (!existing.lastSyncedAt || new Date(record.fecha_guardado) > new Date(existing.lastSyncedAt))
        ) {
          existing.lastSyncedAt = record.fecha_guardado
        }

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
        existing.promociones += Number(record.promociones || 0)
        existing.deducciones += Number(record.deducciones || 0)

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
      const sourceLabels = Array.from(d.sourceLabels as Set<string>)
      const sourceCompanyIds = Array.from(d.sourceCompanyIds as Set<string>)
      const sourceLabel = sourceLabels.length > 0 ? sourceLabels.join(' / ') : d.sourceLabel

      // Formatear horas conectadas
      const hours = Math.floor(d.horasConectadas)
      const minutes = Math.floor((d.horasConectadas - hours) * 60)
      const horasConectadasFormato = `${hours}h ${minutes}m`

      return {
        id: d.id,
        companyId: d.companyId,
        companyName: sourceLabel,
        sourceAccount: d.sourceAccount,
        sourceLabel,
        sourceTable: d.sourceTable,
        sourceCompanyId: d.sourceCompanyId,
        sourceCompanyIds,
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
        promociones: Number(d.promociones.toFixed(2)),
        deducciones: Number(d.deducciones.toFixed(2)),
        permisoEfectivo: d.permisoEfectivo,
        disabled: d.disabled,
        activatedAt: null,
        lastSyncedAt: d.lastSyncedAt
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
      return []
    }

    return data || []
  }
}

// Exportar instancia singleton
export const cabifyHistoricalService = new CabifyHistoricalService()
