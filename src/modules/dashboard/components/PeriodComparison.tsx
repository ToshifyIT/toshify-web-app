import { useMemo, useState, useEffect } from 'react'
import { ArrowDownRight, ArrowUpRight, Minus, Info } from 'lucide-react'
import { format, subDays, subWeeks, subMonths, subYears, getWeek } from 'date-fns'
import { es } from 'date-fns/locale'
import { getMockPeriodData } from '../mockData'
import { useMultasStats } from '../../../hooks/useMultasStats'
import { useTelepaseStats } from '../../../hooks/useTelepaseStats'
import { useIncidenciasStats } from '../../../hooks/useIncidenciasStats'
import { useIncidenciasSplitStats } from '../../../hooks/useIncidenciasSplitStats'
import { usePermanenciaStats } from '../../../hooks/usePermanenciaStats'
import { useKilometrajeStats } from '../../../hooks/useKilometrajeStats'
import { useVehiculosStats } from '../../../hooks/useVehiculosStats'
import { useBajasConductoresStats } from '../../../hooks/useBajasConductoresStats'
import { useSede } from '../../../contexts/SedeContext'
import { PeriodPicker } from './PeriodPicker'
import './PeriodComparison.css'

type Granularity = 'dia' | 'semana' | 'mes' | 'ano'

interface MetricView {
  id: string
  name: string
  valueA: string | React.ReactNode
  valueB: string | React.ReactNode
  variationLabel: string
  variationSign: 'positive' | 'negative' | 'neutral'
  tooltipContent?: React.ReactNode
}

export function PeriodComparison() {
  const [granularity, setGranularity] = useState<Granularity>('semana')
  
  const [periodA, setPeriodA] = useState<string>(() => {
    const prevWeekDate = subWeeks(new Date(), 1)
    const week = getWeek(prevWeekDate, { weekStartsOn: 1 })
    return `Sem ${week.toString().padStart(2, '0')} ${prevWeekDate.getFullYear()}`
  })
  
  const [periodB, setPeriodB] = useState<string>(() => {
    const now = new Date()
    const week = getWeek(now, { weekStartsOn: 1 })
    return `Sem ${week.toString().padStart(2, '0')} ${now.getFullYear()}`
  })

  const { sedeActual } = useSede()

  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const multasStats = useMultasStats(granularity, periodA, periodB, sedeActual?.id)
  const telepaseStats = useTelepaseStats(granularity, periodA, periodB, sedeActual?.id)
  const incidenciasStats = useIncidenciasStats(granularity, periodA, periodB, sedeActual?.id)
  const incidenciasSplit = useIncidenciasSplitStats(granularity, periodA, periodB, sedeActual?.id)
  const permanenciaStats = usePermanenciaStats(granularity, periodA, periodB, sedeActual?.id)
  const kilometrajeStats = useKilometrajeStats(granularity, periodA, periodB, sedeActual?.id)
  const vehiculosStats = useVehiculosStats(granularity, periodA, periodB, sedeActual?.id)
  const bajasConductoresStats = useBajasConductoresStats(granularity, periodA, periodB, sedeActual?.id)

  const formatCurrency = (value: number) => {
    if (isMobile) {
      if (value >= 1000000) {
        return `$ ${(value / 1000000).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}M`
      }
      if (value >= 1000) {
        return `$ ${(value / 1000).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}K`
      }
    }
    return `$ ${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const currencyFormatter = useMemo(
    () => ({
      format: (value: number) => formatCurrency(value)
    }),
    [isMobile]
  )

  const telepaseFormatter = useMemo(
    () => ({
      format: (value: number) => formatCurrency(value)
    }),
    [isMobile]
  )

  const kmFormatter = useMemo(
    () => ({
      format: (value: number) => {
        return `${value.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} km`
      }
    }),
    []
  )

  const periodDataA = useMemo(
    () => getMockPeriodData(`${granularity}-${periodA}`),
    [granularity, periodA]
  )

  const periodDataB = useMemo(
    () => getMockPeriodData(`${granularity}-${periodB}`),
    [granularity, periodB]
  )

  const metrics = useMemo<MetricView[]>(() => {
    const metricList: MetricView[] = []

    const calculateVariation = (valA: number, valB: number): { label: string, sign: 'positive' | 'negative' | 'neutral' } => {
      // Si el Periodo A (base) es 0, no se puede calcular porcentaje de crecimiento matemáticamente
      // Opción: Si B > 0, es un crecimiento infinito (New). Si B = 0, es 0%.
      if (valA === 0) {
        if (valB === 0) return { label: '0%', sign: 'neutral' }
        return { label: 'N/A', sign: 'neutral' }
      }
      
      const diff = valB - valA
      const percentage = (diff / valA) * 100
      const isPositive = percentage >= 0
      
      return {
        label: `${isPositive ? '+' : ''}${percentage.toFixed(0)}%`,
        sign: isPositive ? 'positive' : 'negative'
      }
    }

    // --- INGRESO DE VEHÍCULOS ---
    {
      const variation = calculateVariation(vehiculosStats.totalA, vehiculosStats.totalB)
      metricList.push({
        id: 'metric-vehiculos-ingreso',
        name: 'INGRESO DE VEHÍCULOS',
        valueA: vehiculosStats.totalA.toLocaleString('es-AR'),
        valueB: vehiculosStats.totalB.toLocaleString('es-AR'),
        variationLabel: variation.label,
        variationSign: variation.sign,
        tooltipContent: (
          <div className="kpi-tooltip-content">
            <strong>Ingreso de Vehículos</strong>
            <p>Cantidad de vehículos registrados en el sistema durante el período seleccionado, según su fecha de creación.</p>
          </div>
        ),
      })
    }

    // --- BAJAS CONDUCTORES ---
    {
      const variation = calculateVariation(bajasConductoresStats.totalA, bajasConductoresStats.totalB)
      metricList.push({
        id: 'metric-bajas-conductores',
        name: 'BAJAS CONDUCTORES',
        valueA: bajasConductoresStats.totalA.toLocaleString('es-AR'),
        valueB: bajasConductoresStats.totalB.toLocaleString('es-AR'),
        variationLabel: variation.label,
        variationSign: variation.sign,
        tooltipContent: (
          <div className="kpi-tooltip-content">
            <strong>Bajas Conductores</strong>
            <p>Cantidad de conductores que pasaron a estado «Baja» durante el período, según su fecha de terminación.</p>
          </div>
        ),
      })
    }

    // --- PROM. PERMANENCIA ---
    {
      const variation = calculateVariation(Math.round(permanenciaStats.avgDaysA), Math.round(permanenciaStats.avgDaysB))
      metricList.push({
        id: 'metric-permanencia',
        name: 'PROM. PERMANENCIA',
        valueA: `${Math.round(permanenciaStats.avgDaysA).toLocaleString('es-AR')} días`,
        valueB: `${Math.round(permanenciaStats.avgDaysB).toLocaleString('es-AR')} días`,
        variationLabel: variation.label,
        variationSign: variation.sign,
        tooltipContent: (
          <div className="kpi-tooltip-content">
            <strong>Promedio de Permanencia</strong>
            <p>Promedio de días que los conductores dados de baja en el período estuvieron asignados a vehículos. Se calcula sumando los días de todas sus asignaciones y dividiendo por la cantidad de conductores.</p>
          </div>
        ),
      })
    }

    // --- KILÓMETROS RECORRIDOS ---
    {
      const variation = calculateVariation(kilometrajeStats.totalA, kilometrajeStats.totalB)
      metricList.push({
        id: 'metric-kilometraje',
        name: 'KILÓMETROS RECORRIDOS',
        valueA: kmFormatter.format(kilometrajeStats.totalA),
        valueB: kmFormatter.format(kilometrajeStats.totalB),
        variationLabel: variation.label,
        variationSign: variation.sign,
        tooltipContent: (
          <div className="kpi-tooltip-content">
            <strong>Kilómetros Recorridos</strong>
            <p>Suma total de kilómetros registrados por todos los vehículos de la flota durante el período seleccionado.</p>
          </div>
        ),
      })
    }

    // --- VUELTAS A ARGENTINA ---
    const vueltasA = Math.floor(kilometrajeStats.totalA / 3700)
    const vueltasB = Math.floor(kilometrajeStats.totalB / 3700)
    {
      const variation = calculateVariation(vueltasA, vueltasB)
      metricList.push({
        id: 'metric-vueltas-argentina',
        name: 'VUELTAS A ARGENTINA',
        valueA: vueltasA.toLocaleString('es-AR'),
        valueB: vueltasB.toLocaleString('es-AR'),
        variationLabel: variation.label,
        variationSign: variation.sign,
        tooltipContent: (
          <div className="kpi-tooltip-content">
            <strong>Vueltas a Argentina</strong>
            <p>Equivalencia de los kilómetros recorridos expresada en «vueltas» al país (1 vuelta = 3.700 km, perímetro aproximado de Argentina).</p>
          </div>
        ),
      })
    }

    // --- TOTAL MULTAS ---
    {
      const variation = calculateVariation(multasStats.totalA, multasStats.totalB)
      metricList.push({
        id: 'metric-total-multas',
        name: 'TOTAL MULTAS',
        valueA: currencyFormatter.format(multasStats.totalA),
        valueB: currencyFormatter.format(multasStats.totalB),
        variationLabel: variation.label,
        variationSign: variation.sign,
        tooltipContent: (
          <div className="kpi-tooltip-content">
            <strong>Total Multas</strong>
            <p>Suma de los montos de todas las multas de tránsito registradas durante el período seleccionado.</p>
          </div>
        ),
      })
    }

    // --- TOTAL TELEPASE ---
    {
      const variation = calculateVariation(telepaseStats.totalA, telepaseStats.totalB)
      metricList.push({
        id: 'metric-total-telepase',
        name: 'TOTAL TELEPASE',
        valueA: telepaseFormatter.format(telepaseStats.totalA),
        valueB: telepaseFormatter.format(telepaseStats.totalB),
        variationLabel: variation.label,
        variationSign: variation.sign,
        tooltipContent: (
          <div className="kpi-tooltip-content">
            <strong>Total Telepase</strong>
            <p>Suma de los montos de todos los consumos de peaje (Telepase) registrados durante el período seleccionado.</p>
          </div>
        ),
      })
    }

    // --- INCIDENCIAS A FAVOR ---
    {
      const variation = calculateVariation(incidenciasSplit.aFavorA, incidenciasSplit.aFavorB)
      const tiposTexto = incidenciasSplit.tiposAFavor.length > 0
        ? incidenciasSplit.tiposAFavor
        : ['Cargando...']
      metricList.push({
        id: 'metric-incidencias-a-favor',
        name: 'INCIDENCIAS A FAVOR',
        valueA: currencyFormatter.format(incidenciasSplit.aFavorA),
        valueB: currencyFormatter.format(incidenciasSplit.aFavorB),
        variationLabel: variation.label,
        variationSign: variation.sign,
        tooltipContent: (
          <div className="kpi-tooltip-content">
            <strong>Incidencias a Favor</strong>
            <p>Suma de los montos de incidencias aplicadas a favor del conductor (descuentos, bonificaciones y tickets de peajes) durante el período seleccionado.</p>
            <div className="kpi-tooltip-divider" />
            <div className="kpi-tooltip-section-title">Incluye</div>
            <ul>
              {tiposTexto.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </div>
        ),
      })
    }

    // --- INCIDENCIAS EN CONTRA ---
    {
      const variation = calculateVariation(incidenciasSplit.enContraA, incidenciasSplit.enContraB)
      metricList.push({
        id: 'metric-incidencias-en-contra',
        name: 'INCIDENCIAS EN CONTRA',
        valueA: currencyFormatter.format(incidenciasSplit.enContraA),
        valueB: currencyFormatter.format(incidenciasSplit.enContraB),
        variationLabel: variation.label,
        variationSign: variation.sign,
        tooltipContent: (
          <div className="kpi-tooltip-content">
            <strong>Incidencias en Contra</strong>
            <p>Suma de los montos de cargos y penalidades ya aplicados a los conductores durante el período seleccionado.</p>
            <div className="kpi-tooltip-divider" />
            <div className="kpi-tooltip-section-title">Incluye</div>
            <ul>
              <li>Exceso de kilómetros</li>
              <li>Multas y penalidades</li>
              <li>Otros cargos</li>
            </ul>
          </div>
        ),
      })
    }

    return metricList
  }, [
    currencyFormatter,
    telepaseFormatter,
    kmFormatter,
    periodDataA,
    periodDataB,
    multasStats,
    telepaseStats,
    incidenciasStats,
    incidenciasSplit,
    permanenciaStats,
    vehiculosStats,
    bajasConductoresStats,
    kilometrajeStats
  ])

  const handleGranularityChange = (value: Granularity) => {
    setGranularity(value)

    const now = new Date()
    let nextA = ''
    let nextB = ''

    if (value === 'dia') {
        nextA = format(subDays(now, 1), 'dd/MM/yyyy')
        nextB = format(now, 'dd/MM/yyyy')
    } else if (value === 'semana') {
        const prev = subWeeks(now, 1)
        const prevWeek = getWeek(prev, { weekStartsOn: 1 })
        nextA = `Sem ${prevWeek.toString().padStart(2, '0')} ${prev.getFullYear()}`
        
        const week = getWeek(now, { weekStartsOn: 1 })
        nextB = `Sem ${week.toString().padStart(2, '0')} ${now.getFullYear()}`
    } else if (value === 'mes') {
        const prev = subMonths(now, 1)
        const prevMonthName = format(prev, 'MMM', { locale: es })
        const capPrev = prevMonthName.charAt(0).toUpperCase() + prevMonthName.slice(1)
        nextA = `${capPrev} ${prev.getFullYear()}`
        
        const monthName = format(now, 'MMM', { locale: es })
        const capMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1)
        nextB = `${capMonth} ${now.getFullYear()}`
    } else if (value === 'ano') {
        nextA = format(subYears(now, 1), 'yyyy')
        nextB = format(now, 'yyyy')
    }

    setPeriodA(nextA)
    setPeriodB(nextB)
  }

  const handleChangePeriodA = (val: string) => {
    setPeriodA(val)
  }

  const handleChangePeriodB = (val: string) => {
    setPeriodB(val)
  }

  return (
    <div className="dashboard-comparison">
      <h2 className="dashboard-section-title">
        COMPARACIÓN DE PERÍODOS
      </h2>

      <div className="dashboard-granularity-buttons-container">
        <button
          type="button"
          className={
            granularity === 'dia'
              ? 'dashboard-granularity-button dashboard-granularity-button--active'
              : 'dashboard-granularity-button'
          }
          onClick={() => handleGranularityChange('dia')}
        >
          Día
        </button>
        <button
          type="button"
          className={
            granularity === 'semana'
              ? 'dashboard-granularity-button dashboard-granularity-button--active'
              : 'dashboard-granularity-button'
          }
          onClick={() => handleGranularityChange('semana')}
        >
          Semana
        </button>
        <button
          type="button"
          className={
            granularity === 'mes'
              ? 'dashboard-granularity-button dashboard-granularity-button--active'
              : 'dashboard-granularity-button'
          }
          onClick={() => handleGranularityChange('mes')}
        >
          Mes
        </button>
        <button
          type="button"
          className={
            granularity === 'ano'
              ? 'dashboard-granularity-button dashboard-granularity-button--active'
              : 'dashboard-granularity-button'
          }
          onClick={() => handleGranularityChange('ano')}
        >
          Año
        </button>
      </div>

      {/* Períodos: FUERA del contenedor gris */}
      
      <div className="dashboard-periods-row">
        <PeriodPicker
          granularity={granularity}
          value={periodA}
          onChange={handleChangePeriodA}
          label="Período A"
          className="dashboard-period-picker period-picker--a"
        />
        <span className="dashboard-period-separator">VS</span>
        <PeriodPicker
          granularity={granularity}
          value={periodB}
          onChange={handleChangePeriodB}
          label="Período B"
          className="dashboard-period-picker period-picker--b"
        />
      </div>
      
      <div className="period-comparison-grid">
        {metrics.map(metric => {
          const isPositive = metric.variationSign === 'positive'
          const isNegative = metric.variationSign === 'negative'
          
          let Icon = Minus
          let badgeClassName = 'period-comparison-badge period-comparison-badge--neutral'

          if (isPositive) {
            Icon = ArrowUpRight
            badgeClassName = 'period-comparison-badge period-comparison-badge--positive'
          } else if (isNegative) {
            Icon = ArrowDownRight
            badgeClassName = 'period-comparison-badge period-comparison-badge--negative'
          }

          return (
            <div
              key={metric.id}
              className="period-comparison-card"
            >
              <span className="period-comparison-name">
                {metric.name}
                {metric.tooltipContent && (
                  <span className="kpi-info-wrapper">
                    <Info size={14} className="kpi-info-icon" />
                    <div className="kpi-tooltip">{metric.tooltipContent}</div>
                  </span>
                )}
              </span>
              <div className="period-comparison-values">
                <div className="period-comparison-value">
                  <span
                    className="period-comparison-label"
                    style={{ color: '#E53935' }}
                  >
                    Periodo A
                  </span>
                  <span className="period-comparison-value-main">
                    {metric.valueA}
                  </span>
                </div>
                <div className="period-comparison-value">
                  <span className="period-comparison-label">
                    Periodo B
                  </span>
                  <span className="period-comparison-value-secondary">
                    {metric.valueB}
                  </span>
                </div>
              </div>
              <span className={badgeClassName}>
                <Icon className="period-comparison-badge-icon" />
                {metric.variationLabel}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
