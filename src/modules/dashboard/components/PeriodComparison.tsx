import { useMemo, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { format, subDays, subWeeks, subMonths, subYears, getWeek } from 'date-fns'
import { es } from 'date-fns/locale'
import { getMockPeriodData } from '../mockData'
import { useMultasStats } from '../../../hooks/useMultasStats'
import { useTelepaseStats } from '../../../hooks/useTelepaseStats'
import { useIncidenciasStats } from '../../../hooks/useIncidenciasStats'
import { usePermanenciaStats } from '../../../hooks/usePermanenciaStats'
import { useKilometrajeStats } from '../../../hooks/useKilometrajeStats'
import { useVehiculosStats } from '../../../hooks/useVehiculosStats'
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
}

export function PeriodComparison() {
  const [granularity, setGranularity] = useState<Granularity>('semana')
  
  const [periodA, setPeriodA] = useState<string>(() => {
    const now = new Date()
    const week = getWeek(now, { weekStartsOn: 1 })
    return `Sem ${week.toString().padStart(2, '0')} ${now.getFullYear()}`
  })
  
  const [periodB, setPeriodB] = useState<string>(() => {
    const prevWeekDate = subWeeks(new Date(), 1)
    const week = getWeek(prevWeekDate, { weekStartsOn: 1 })
    return `Sem ${week.toString().padStart(2, '0')} ${prevWeekDate.getFullYear()}`
  })

  const { sedeActual } = useSede()

  const multasStats = useMultasStats(granularity, periodA, periodB, sedeActual?.id)
  const telepaseStats = useTelepaseStats(granularity, periodA, periodB, sedeActual?.id)
  const incidenciasStats = useIncidenciasStats(granularity, periodA, periodB, sedeActual?.id)
  const permanenciaStats = usePermanenciaStats(granularity, periodA, periodB, sedeActual?.id)
  const kilometrajeStats = useKilometrajeStats(granularity, periodA, periodB, sedeActual?.id)
  const vehiculosStats = useVehiculosStats(granularity, periodA, periodB, sedeActual?.id)

  const currencyFormatter = useMemo(
    () => ({
      format: (value: number) => {
        return `$ ${value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`
      }
    }),
    []
  )

  const telepaseFormatter = useMemo(
    () => ({
      format: (value: number) => {
        return `$ ${value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`
      }
    }),
    []
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
      if (valB === 0) {
        return { label: 'N/A', sign: 'neutral' }
      }
      const diff = valA - valB
      const percentage = (diff / valB) * 100
      const isPositive = percentage >= 0
      return {
        label: `${isPositive ? '+' : ''}${percentage.toFixed(0)}%`,
        sign: isPositive ? 'positive' : 'negative'
      }
    }

    const addCurrencyMetric = (
      id: string,
      name: string,
      valueA: number,
      valueB: number
    ) => {
      const variation = calculateVariation(valueA, valueB)
      metricList.push({
        id,
        name,
        valueA: currencyFormatter.format(valueA),
        valueB: currencyFormatter.format(valueB),
        variationLabel: variation.label,
        variationSign: variation.sign
      })
    }

    const addTelepaseMetric = (
      id: string,
      name: string,
      valueA: number,
      valueB: number
    ) => {
      const variation = calculateVariation(valueA, valueB)
      metricList.push({
        id,
        name,
        valueA: telepaseFormatter.format(valueA),
        valueB: telepaseFormatter.format(valueB),
        variationLabel: variation.label,
        variationSign: variation.sign
      })
    }

    const addKmMetric = (
      id: string,
      name: string,
      valueA: number,
      valueB: number
    ) => {
      const variation = calculateVariation(valueA, valueB)
      metricList.push({
        id,
        name,
        valueA: kmFormatter.format(valueA),
        valueB: kmFormatter.format(valueB),
        variationLabel: variation.label,
        variationSign: variation.sign
      })
    }

    const addCountMetric = (
      id: string,
      name: string,
      valueA: number,
      valueB: number,
      suffix?: string
    ) => {
      const variation = calculateVariation(valueA, valueB)
      metricList.push({
        id,
        name,
        valueA: suffix ? `${valueA.toLocaleString('es-AR')} ${suffix}` : valueA.toLocaleString('es-AR'),
        valueB: suffix ? `${valueB.toLocaleString('es-AR')} ${suffix}` : valueB.toLocaleString('es-AR'),
        variationLabel: variation.label,
        variationSign: variation.sign
      })
    }

    addCountMetric(
      'metric-vehiculos-ingreso',
      'INGRESO DE VEHÍCULOS',
      vehiculosStats.totalA,
      vehiculosStats.totalB
    )

    addCountMetric(
      'metric-permanencia',
      'PROM. PERMANENCIA',
      Math.round(permanenciaStats.avgDaysA),
      Math.round(permanenciaStats.avgDaysB),
      'días'
    )

    addKmMetric(
      'metric-kilometraje',
      'KILÓMETROS RECORRIDOS',
      kilometrajeStats.totalA,
      kilometrajeStats.totalB
    )

    const vueltasA = Math.floor(kilometrajeStats.totalA / 3700)
    const vueltasB = Math.floor(kilometrajeStats.totalB / 3700)

    addCountMetric(
      'metric-vueltas-argentina',
      'VUELTAS A ARGENTINA',
      vueltasA,
      vueltasB
    )

    addCurrencyMetric(
      'metric-total-multas',
      'TOTAL MULTAS',
      multasStats.totalA,
      multasStats.totalB
    )

    addTelepaseMetric(
      'metric-total-telepase',
      'TOTAL TELEPASE',
      telepaseStats.totalA,
      telepaseStats.totalB
    )

    addCurrencyMetric(
      'metric-total-incidencias',
      'TOTAL DE INCIDENCIAS',
      incidenciasStats.totalA,
      incidenciasStats.totalB
    )

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
    permanenciaStats,
    vehiculosStats,
    kilometrajeStats
  ])

  const handleGranularityChange = (value: Granularity) => {
    setGranularity(value)

    const now = new Date()
    let nextA = ''
    let nextB = ''

    if (value === 'dia') {
        nextA = format(now, 'dd/MM/yyyy')
        nextB = format(subDays(now, 1), 'dd/MM/yyyy')
    } else if (value === 'semana') {
        const week = getWeek(now, { weekStartsOn: 1 })
        nextA = `Sem ${week.toString().padStart(2, '0')} ${now.getFullYear()}`
        
        const prev = subWeeks(now, 1)
        const prevWeek = getWeek(prev, { weekStartsOn: 1 })
        nextB = `Sem ${prevWeek.toString().padStart(2, '0')} ${prev.getFullYear()}`
    } else if (value === 'mes') {
        const monthName = format(now, 'MMM', { locale: es })
        const capMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1)
        nextA = `${capMonth} ${now.getFullYear()}`
        
        const prev = subMonths(now, 1)
        const prevMonthName = format(prev, 'MMM', { locale: es })
        const capPrev = prevMonthName.charAt(0).toUpperCase() + prevMonthName.slice(1)
        nextB = `${capPrev} ${prev.getFullYear()}`
    } else if (value === 'ano') {
        nextA = format(now, 'yyyy')
        nextB = format(subYears(now, 1), 'yyyy')
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
