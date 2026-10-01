import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useSede } from '../contexts/SedeContext'
import { getCache, setCache } from './useSessionCache'
import { fetchCobroMultasStats } from '../services/cobroMultasStatsService'
import { calcularMetricasGarantias } from '../modules/facturacion/utils/garantiasMetricas'

// ─── Mismas reglas que Estado de Flota (AsignacionesActivasModule) ───
// Total Flota por INCLUSIÓN: solo cuentan estos estados, identificados por la
// descripción (sin acentos ni mayúsculas) y no por el código interno.
const normEstadoFlota = (s: string) =>
  (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

const ESTADOS_TOTAL_FLOTA: { clave: 'en_uso' | 'pkg_on' | 'pkg_off' | 'taller' | 'retenido'; match: (d: string) => boolean }[] = [
  { clave: 'en_uso', match: d => d === 'en uso' },
  { clave: 'pkg_on', match: d => d.startsWith('pkg on') },
  { clave: 'pkg_off', match: d => d.includes('pkg off') && d.includes('base') },
  { clave: 'pkg_off', match: d => d.includes('pkg off') && d.includes('franc') },
  { clave: 'taller', match: d => d.includes('taller') && d.includes('mecanic') },
  { clave: 'taller', match: d => d.includes('taller') && (d.includes('chapa') || d.includes('pintura')) },
  { clave: 'retenido', match: d => d.includes('retenido') || d.includes('comisar') },
]

const bucketEstadoFlota = (descripcion: string) =>
  ESTADOS_TOTAL_FLOTA.find(e => e.match(normEstadoFlota(descripcion)))?.clave ?? null

// Conductor de una asignación que ya no ocupa el turno
const ESTADOS_CONDUCTOR_INACTIVOS = ['cancelado', 'completado', 'finalizado']

interface DashboardCardValue {
  value: string
  subtitle: string
  extra?: any
}

interface DashboardStats {
  totalFlota: DashboardCardValue
  vehiculosActivos: DashboardCardValue
  disponibles: DashboardCardValue
  turnosDisponibles: DashboardCardValue
  porcentajeOcupacion: DashboardCardValue
  porcentajeOperatividad: DashboardCardValue
  fondoGarantia: DashboardCardValue
  pendienteDevolucion: DashboardCardValue
  reintegroReciente: DashboardCardValue
  reintegroAntiguo: DashboardCardValue
  cobroPendiente: DashboardCardValue
  diasSinSiniestro: DashboardCardValue
  diasSinRobo: DashboardCardValue
  totalSaldo: DashboardCardValue
  totalSaldoPendiente: DashboardCardValue
  deudaNoCubierta: DashboardCardValue
  cobroMultas: DashboardCardValue
  vueltasMundo: DashboardCardValue
}

function parseFechaSiniestro(fechaStr: string | undefined | null) {
  if (!fechaStr) return null
  const raw = fechaStr.split('T')[0]
  if (raw.includes('-')) {
    const parts = raw.split('-')
    if (parts.length !== 3) return null
    const [yearStr, monthStr, dayStr] = parts
    const year = Number(yearStr)
    const month = Number(monthStr)
    const day = Number(dayStr)
    if (!year || !month || !day) return null
    return new Date(year, month - 1, day)
  }
  if (raw.includes('/')) {
    const parts = raw.split('/')
    if (parts.length !== 3) return null
    const [dayStr, monthStr, yearStr] = parts
    const year = Number(yearStr)
    const month = Number(monthStr)
    const day = Number(dayStr)
    if (!year || !month || !day) return null
    return new Date(year, month - 1, day)
  }
  return null
}

function esCategoriaRobo(nombre: string | undefined | null) {
  if (!nombre) return false
  const normalized = nombre.toLowerCase().trim()
  return normalized === 'robo' || normalized === 'robo parcial'
}

function diffDias(from: Date, to: Date) {
  const fromDate = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const toDate = new Date(to.getFullYear(), to.getMonth(), to.getDate())
  const diffMs = fromDate.getTime() - toDate.getTime()
  const dias = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  return dias < 0 ? 0 : dias
}

export function useDashboardStats() {
  const { aplicarFiltroSede, sedeActualId } = useSede()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<DashboardStats | null>(null)

  useEffect(() => {
    // v2: flota/ocupación/operatividad como Estado de Flota, km con Geotab y fondo de garantía solo activas
    const cacheKey = `dashStats-v4-deuda-no-cubierta-${sedeActualId || 'all'}`
    const cached = getCache<DashboardStats>(cacheKey, cacheKey)
    if (cached) {
      setStats(cached)
      setLoading(false)
      return
    }

    const fetchData = async () => {
      setLoading(true)
      try {
        const [
          asignacionesRes,
          vehiculosRes,
          siniestrosRes,
          garantiasRes,
          saldosRes,
          conductoresRes,
          wialonRes,
          geotabKmRes,
          cobroMultasRes,
        ] = await Promise.all([
          aplicarFiltroSede(
            supabase
              .from('asignaciones')
              .select(`
                id,
                vehiculo_id,
                horario,
                estado,
                created_at,
                asignaciones_conductores (
                  conductor_id,
                  estado,
                  horario
                )
              `)
          )
            .in('estado', ['activo', 'activa'])
            .order('created_at', { ascending: false }),
          aplicarFiltroSede(
            supabase
              .from('vehiculos')
              .select(
                'id, patente, marca, modelo, anio, estado_id, vehiculos_estados(codigo, descripcion), vehiculos_tipos(descripcion)'
              )
              .is('deleted_at', null)
          ),
          aplicarFiltroSede(
            supabase.from('v_siniestros_completos' as any).select('fecha_siniestro, categoria_nombre')
          ).order('fecha_siniestro', { ascending: false }).limit(2000),
          aplicarFiltroSede(
            supabase
              .from('garantias_conductores')
              .select('id, conductor_id, monto_pagado, monto_realmente_pagado, monto_devuelto, estado')
          ),
          aplicarFiltroSede(
            supabase
              .from('saldos_conductores')
              .select('conductor_id, saldo_actual, monto_mora_acumulada, ultima_actualizacion')
          ),
          aplicarFiltroSede(
            supabase
              .from('conductores')
              .select('id, estado_id, fecha_terminacion, updated_at, conductores_estados(codigo)')
          ),
          supabase.rpc('sum_kilometraje_total', {
            p_sede_id: sedeActualId || null
          }),
          // Km de Geotab (bitácora). sum_kilometraje_total es el acumulado histórico de USS.
          // Si la función todavía no está instalada (sql/dashboard_km_geotab.sql) se toma 0.
          supabase.rpc('dashboard_km_geotab', {
            p_start: null,
            p_end: null,
            p_sede_id: sedeActualId || null,
          }),
          fetchCobroMultasStats({
            sedeId: sedeActualId || null,
          })
        ])

        if (asignacionesRes.error) throw asignacionesRes.error
        if (vehiculosRes.error) throw vehiculosRes.error
        if (siniestrosRes.error) throw siniestrosRes.error
        if (garantiasRes.error) throw garantiasRes.error
        if (saldosRes.error) throw saldosRes.error
        if (conductoresRes.error) throw conductoresRes.error
        if (wialonRes.error) throw wialonRes.error

        const asignaciones = (asignacionesRes.data || []) as any[]
        const vehiculos = (vehiculosRes.data || []) as any[]
        const siniestros = (siniestrosRes.data || []) as any[]
        const garantias = (garantiasRes.data || []) as any[]
        const saldos = (saldosRes.data || []) as any[]
        const conductores = (conductoresRes.data || []) as any[]
        // RPC returns a single number directly
        const totalKmHistorico = (Number(wialonRes.data) || 0) + (geotabKmRes.error ? 0 : Number(geotabKmRes.data) || 0)
        const vueltasMundoVal = totalKmHistorico / 40000

        const vehiculosConAsignacion = new Set(asignaciones.map(a => a.vehiculo_id))
        let totalFlota = 0
        let enUso = 0
        let tallerCount = 0
        const pkgOnSinAsignacion: any[] = []

        for (const v of vehiculos) {
          const estadoCodigo = v.vehiculos_estados?.codigo || ''
          const bucket = bucketEstadoFlota(v.vehiculos_estados?.descripcion || '')

          // Total Flota igual que Estado de Flota: solo los estados de la lista
          if (bucket) totalFlota++
          if (bucket === 'taller') tallerCount++

          if (estadoCodigo === 'PKG_ON_BASE') {
            if (!vehiculosConAsignacion.has(v.id)) pkgOnSinAsignacion.push(v)
          } else if (estadoCodigo === 'EN_USO') {
            enUso++
          }
        }

        let turnoCount = 0
        let cargoCount = 0
        let cuposOcupados = 0
        let vacantesD = 0
        let vacantesN = 0
        for (const a of asignaciones) {
          const conductores = a.asignaciones_conductores || []
          if (a.horario === 'turno') {
            turnoCount++
            const conductorD = conductores.find(
              (ac: any) =>
                (ac.horario === 'diurno' || ac.horario === 'DIURNO' || ac.horario === 'D') &&
                !ESTADOS_CONDUCTOR_INACTIVOS.includes(ac.estado)
            )
            const conductorN = conductores.find(
              (ac: any) =>
                (ac.horario === 'nocturno' || ac.horario === 'NOCTURNO' || ac.horario === 'N') &&
                !ESTADOS_CONDUCTOR_INACTIVOS.includes(ac.estado)
            )
            if (conductorD?.conductor_id) cuposOcupados++
            else vacantesD++
            if (conductorN?.conductor_id) cuposOcupados++
            else vacantesN++
          } else {
            cargoCount++
            const tieneConductor = conductores.some((ac: any) => ac.conductor_id && !ESTADOS_CONDUCTOR_INACTIVOS.includes(ac.estado))
            if (tieneConductor) cuposOcupados++
          }
        }

        const cuposTotales = turnoCount * 2 + cargoCount
        // % Ocupación igual que Estado de Flota:
        // (turnos totales - turnos disponibles) / turnos totales,
        // turnos totales = (vehículos con asignación + PKG ON sin asignación) × 2
        const totalidadTurnos = (vehiculosConAsignacion.size + pkgOnSinAsignacion.length) * 2
        const turnosDisp = vacantesD + vacantesN + pkgOnSinAsignacion.length * 2
        const turnosOcupados = totalidadTurnos - turnosDisp
        const cuposDisponibles = cuposTotales - cuposOcupados
        const porcentajeOcupacionGeneral =
          totalidadTurnos > 0
            ? Number((((totalidadTurnos - turnosDisp) / totalidadTurnos) * 100).toFixed(1))
            : 0

        // UNIFICACIÓN DE CRITERIO: % Operatividad debe coincidir con Dashboard Flota
        // Solo contamos vehículos EN_USO (efectivamente trabajando), ignorando PKG_ON_BASE
        const porcentajeOperatividad =
          totalFlota > 0 ? Number(((enUso / totalFlota) * 100).toFixed(1)) : 0

        const today = new Date()
        const robosFechas = siniestros
          .filter(s => esCategoriaRobo(s.categoria_nombre))
          .map(s => parseFechaSiniestro(s.fecha_siniestro))
          .filter((d): d is Date => d !== null)
          .sort((a, b) => b.getTime() - a.getTime())
        const siniestrosFechas = siniestros
          .filter(s => !esCategoriaRobo(s.categoria_nombre))
          .map(s => parseFechaSiniestro(s.fecha_siniestro))
          .filter((d): d is Date => d !== null)
          .sort((a, b) => b.getTime() - a.getTime())

        const ultimoRobo = robosFechas[0]
        const ultimoSiniestro = siniestrosFechas[0]
        const diasDesdeUltimoRobo = ultimoRobo ? diffDias(today, ultimoRobo) : null
        const diasDesdeUltimoSiniestro = ultimoSiniestro ? diffDias(today, ultimoSiniestro) : null

        const formatDateEs = (d: Date | undefined) => (d ? d.toLocaleDateString('es-AR') : '-')

        const formatCurrencyArs = (value: number) =>
          new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }).format(value)
        const formatCurrencyCompacto = (value: number) =>
          value < 1 ? '$0' : new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS',
            notation: 'compact',
            maximumFractionDigits: 1,
          }).format(value)

        // Garantías: mismas reglas que Facturación > Garantías (garantiasMetricas.ts)
        const saldosPorConductor = new Map<string, number>()
        for (const fila of saldos) {
          if (fila.conductor_id) saldosPorConductor.set(fila.conductor_id, Number(fila.saldo_actual) || 0)
        }
        const metricasGarantias = calcularMetricasGarantias(
          garantias,
          conductores.map((c: any) => ({
            id: c.id,
            esActivo: String(c.conductores_estados?.codigo || '').toUpperCase() === 'ACTIVO',
            fecha_terminacion: c.fecha_terminacion ?? null,
            updated_at: c.updated_at ?? null,
          })),
          saldosPorConductor,
        )
        const totalPagadoGarantias = metricasGarantias.enCurso.monto
        const conductoresGarantiaActiva = metricasGarantias.enCurso.cantidad
        const reintegroReciente = metricasGarantias.devolucionReciente.monto
        const countReciente = metricasGarantias.devolucionReciente.cantidad
        const reintegroAntiguo = metricasGarantias.devolucionVencida.monto
        const countAntiguo = metricasGarantias.devolucionVencida.cantidad
        const totalReintegroPendiente = reintegroReciente + reintegroAntiguo

        // Saldo pendiente: deuda que realmente queda por cobrar.
        // - Conductor activo: su deuda tal cual (la garantía sigue en curso, no se aplica).
        // - Conductor de baja: deuda menos la garantía que todavía retenemos (pagado − devuelto).
        //   Si la garantía la cubre, no suma (pasa a ser reintegro, no deuda).
        // Conductor sin registro: se toma como activo, igual que en garantiasMetricas.
        const conductorActivo = new Map<string, boolean>(
          conductores.map((c: any) => [c.id, String(c.conductores_estados?.codigo || '').toUpperCase() === 'ACTIVO'])
        )
        const garantiaRetenida = new Map<string, number>()
        for (const g of garantias) {
          if (!g.conductor_id || g.estado === 'cancelada') continue
          const pendiente = Number(g.monto_realmente_pagado || g.monto_pagado || 0) - Number(g.monto_devuelto || 0)
          if (pendiente > 0) garantiaRetenida.set(g.conductor_id, (garantiaRetenida.get(g.conductor_id) || 0) + pendiente)
        }
        let deudaActivos = 0
        let deudaBajas = 0
        let conDeudaActivos = 0
        let conDeudaBajas = 0
        for (const fila of saldos) {
          const saldo = Number(fila.saldo_actual) || 0
          if (saldo >= 0) continue
          const esBaja = conductorActivo.get(fila.conductor_id) === false
          if (!esBaja) {
            deudaActivos += Math.abs(saldo)
            conDeudaActivos++
            continue
          }
          const neto = saldo + (garantiaRetenida.get(fila.conductor_id) || 0)
          if (neto < -0.01) {
            deudaBajas += Math.abs(neto)
            conDeudaBajas++
          }
        }
        const totalSaldoActual = deudaActivos + deudaBajas

        // Deuda no cubierta: de la deuda de los activos, lo que su garantía no alcanza a cubrir
        // (lo que quedaría por cobrar si se dieran de baja hoy).
        let deudaNoCubiertaMonto = 0
        let deudaNoCubiertaCantidad = 0
        for (const fila of saldos) {
          const saldo = Number(fila.saldo_actual) || 0
          if (saldo >= 0 || conductorActivo.get(fila.conductor_id) === false) continue
          const descubierto = Math.abs(saldo) - (garantiaRetenida.get(fila.conductor_id) || 0)
          if (descubierto > 0.01) {
            deudaNoCubiertaMonto += descubierto
            deudaNoCubiertaCantidad++
          }
        }
        const totalMora = saldos.reduce((sum, item) => sum + (item.monto_mora_acumulada || 0), 0)
        const totalSaldoFinal = totalSaldoActual + totalMora

        // Calcular Deuda Actual y Deuda Semana Pasada
        const totalDeudaActual = saldos.reduce((sum: number, item: any) => {
          const saldo = item.saldo_actual || 0
          // Sumamos solo saldos negativos (deuda)
          return sum + (saldo < 0 ? Math.abs(saldo) : 0)
        }, 0)

        const oneWeekAgo = new Date()
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

        const deudaSemanaPasada = saldos.reduce((sum: number, item: any) => {
          const saldo = item.saldo_actual || 0
          const ultimaAct = item.ultima_actualizacion ? new Date(item.ultima_actualizacion) : null
          
          // Sumamos deuda actualizada en la última semana
          if (saldo < 0 && ultimaAct && ultimaAct >= oneWeekAgo) {
            return sum + Math.abs(saldo)
          }
          return sum
        }, 0)

        const porcentajeDeudaSemanaPasada = totalDeudaActual > 0 
          ? ((deudaSemanaPasada / totalDeudaActual) * 100).toFixed(1)
          : '0.0'

        const newStats: DashboardStats = {
          totalFlota: {
            value: String(totalFlota),
            subtitle: `${enUso} en uso · ${tallerCount} taller · ${pkgOnSinAsignacion.length} disp.`,
          },
          vehiculosActivos: {
            value: String(vehiculosConAsignacion.size),
            subtitle: '',
          },
          disponibles: {
            value: String(pkgOnSinAsignacion.length),
            subtitle: '',
          },
          turnosDisponibles: {
            value: String(cuposDisponibles),
            subtitle: '',
          },
          porcentajeOcupacion: {
            value: `${porcentajeOcupacionGeneral}%`,
            subtitle: `${turnosOcupados} de ${totalidadTurnos} turnos`,
          },
          porcentajeOperatividad: {
            value: `${porcentajeOperatividad}%`,
            subtitle: `${enUso} en uso de ${totalFlota} vehículos`,
          },
          fondoGarantia: {
            value: formatCurrencyArs(totalPagadoGarantias),
            subtitle: `${conductoresGarantiaActiva} garantías en curso`,
          },
          pendienteDevolucion: {
            value: formatCurrencyArs(totalReintegroPendiente),
            subtitle: `${countReciente + countAntiguo} en devolución`,
          },
          reintegroReciente: {
            value: formatCurrencyArs(reintegroReciente),
            subtitle: `${countReciente} conductores (< 120 días hábiles)`,
          },
          reintegroAntiguo: {
            value: formatCurrencyArs(reintegroAntiguo),
            subtitle: `${countAntiguo} conductores (120 días hábiles o más)`,
          },
          cobroPendiente: {
            value: formatCurrencyArs(totalDeudaActual),
            subtitle: `${formatCurrencyArs(deudaSemanaPasada)} (${porcentajeDeudaSemanaPasada}%)`,
            extra: {
              deudaSemanaPasada: formatCurrencyArs(deudaSemanaPasada),
              porcentaje: porcentajeDeudaSemanaPasada,
              tooltip: 'Porcentaje de la deuda total que corresponde a saldos actualizados en los últimos 7 días'
            }
          },
          diasSinSiniestro: {
            value: diasDesdeUltimoSiniestro !== null ? String(diasDesdeUltimoSiniestro) : '-',
            subtitle: `Último: ${formatDateEs(ultimoSiniestro)}`,
          },
          diasSinRobo: {
            value: diasDesdeUltimoRobo !== null ? String(diasDesdeUltimoRobo) : '-',
            subtitle: `Último: ${formatDateEs(ultimoRobo)}`,
          },
          totalSaldo: {
            value: formatCurrencyArs(totalSaldoFinal),
            subtitle: 'Saldo Actual + Mora'
          },
          totalSaldoPendiente: {
            value: formatCurrencyArs(totalSaldoActual),
            subtitle: `Activos ${formatCurrencyCompacto(deudaActivos)} (${conDeudaActivos}) · Bajas ${formatCurrencyCompacto(deudaBajas)} (${conDeudaBajas})`
          },
          deudaNoCubierta: {
            value: formatCurrencyArs(deudaNoCubiertaMonto),
            subtitle: `${deudaNoCubiertaCantidad} activos con deuda mayor a su garantía`
          },
          cobroMultas: {
            value: formatCurrencyArs(cobroMultasRes.total),
            subtitle: `${cobroMultasRes.count} multas enviadas a facturación`
          },
          vueltasMundo: {
            value: vueltasMundoVal.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
            subtitle: 'Histórico global'
          }
        }
        setStats(newStats)
        setCache(cacheKey, cacheKey, newStats)
      } catch {
        setStats(null)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [sedeActualId, aplicarFiltroSede])

  const memoized = useMemo(() => ({ stats, loading }), [stats, loading])
  return memoized
}
