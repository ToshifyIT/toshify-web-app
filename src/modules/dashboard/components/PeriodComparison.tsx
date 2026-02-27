import { useMemo, useState } from 'react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { format, subDays, subWeeks, subMonths, subYears, getWeek } from 'date-fns'
import { es } from 'date-fns/locale'
import { getMockPeriodData } from '../mockData'
import { useMultasStats } from '../../../hooks/useMultasStats'
import { useTelepaseStats } from '../../../hooks/useTelepaseStats'
import { useIncidenciasStats } from '../../../hooks/useIncidenciasStats'
import { usePermanenciaStats } from '../../../hooks/usePermanenciaStats'
import { PeriodPicker } from './PeriodPicker'
import './PeriodComparison.css'

type Granularity = 'dia' | 'semana' | 'mes' | 'ano'

type QuickFilter =
  | 'hoy-ayer'
  | 'semana-actual-anterior'
  | 'mes-actual-anterior'
  | 'personalizado'

interface MetricView {
  id: string
  name: string
  valueA: string | React.ReactNode
  valueB: string | React.ReactNode
  variationLabel: string
  variationSign: 'positive' | 'negative'
}

const MONTH_NAMES = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
]

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

  const [quickFilter, setQuickFilter] = useState<QuickFilter>('personalizado')

  const multasStats = useMultasStats(granularity, periodA, periodB)
  const telepaseStats = useTelepaseStats(granularity, periodA, periodB)
  const incidenciasStats = useIncidenciasStats(granularity, periodA, periodB)
  const permanenciaStats = usePermanenciaStats(granularity, periodA, periodB)

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

    const addCurrencyMetric = (
      id: string,
      name: string,
      valueA: number,
      valueB: number
    ) => {
      const diff = valueA - valueB
      const base = valueB === 0 ? 0 : (diff / valueB) * 100
      const isPositive = base >= 0
      metricList.push({
        id,
        name,
        valueA: currencyFormatter.format(valueA),
        valueB: currencyFormatter.format(valueB),
        variationLabel: `${isPositive ? '+' : '-'}${Math.abs(base).toFixed(0)}%`,
        variationSign: isPositive ? 'positive' : 'negative'
      })
    }

    const addTelepaseMetric = (
      id: string,
      name: string,
      valueA: number,
      valueB: number
    ) => {
      const diff = valueA - valueB
      const base = valueB === 0 ? 0 : (diff / valueB) * 100
      const isPositive = base >= 0
      metricList.push({
        id,
        name,
        valueA: telepaseFormatter.format(valueA),
        valueB: telepaseFormatter.format(valueB),
        variationLabel: `${isPositive ? '+' : '-'}${Math.abs(base).toFixed(0)}%`,
        variationSign: isPositive ? 'positive' : 'negative'
      })
    }

    const addIntegerMetric = (
      id: string,
      name: string,
      valueA: number,
      valueB: number
    ) => {
      const diff = valueA - valueB
      const base = valueB === 0 ? 0 : (diff / valueB) * 100
      const isPositive = base >= 0
      metricList.push({
        id,
        name,
        valueA: valueA.toFixed(0),
        valueB: valueB.toFixed(0),
        variationLabel: `${isPositive ? '+' : '-'}${Math.abs(base).toFixed(0)}%`,
        variationSign: isPositive ? 'positive' : 'negative'
      })
    }

    const addDaysMetric = (
      id: string,
      name: string,
      valueA: number,
      valueB: number
    ) => {
      const diff = valueA - valueB
      const base = valueB === 0 ? 0 : (diff / valueB) * 100
      const isPositive = base >= 0
      
      const formatWithDays = (val: number) => (
        <>
          {val.toFixed(0)}{' '}
          <span style={{ 
            fontSize: '0.65em', 
            fontWeight: 400, 
            color: '#64748b',
            textTransform: 'uppercase',
            marginLeft: '2px',
            letterSpacing: '0.05em'
          }}>
            Días
          </span>
        </>
      )

      metricList.push({
        id,
        name,
        valueA: formatWithDays(valueA),
        valueB: formatWithDays(valueB),
        variationLabel: `${isPositive ? '+' : '-'}${Math.abs(base).toFixed(0)}%`,
        variationSign: isPositive ? 'positive' : 'negative'
      })
    }

    addCurrencyMetric(
      'metric-cobro-pendiente',
      'COBRO PENDIENTE (ARRASTRE)',
      periodDataA.cobroPendiente,
      periodDataB.cobroPendiente
    )

    // Override values for COBRO PENDIENTE (ARRASTRE) to 'N/A'
    const cobroPendienteMetric = metricList.find(m => m.id === 'metric-cobro-pendiente')
    if (cobroPendienteMetric) {
      cobroPendienteMetric.valueA = 'N/A'
      cobroPendienteMetric.valueB = 'N/A'
    }

    addDaysMetric(
      'metric-permanencia',
      'PROM. PERMANENCIA',
      permanenciaStats.avgDaysA,
      permanenciaStats.avgDaysB
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
    periodDataA,
    periodDataB,
    multasStats,
    telepaseStats,
    incidenciasStats,
    permanenciaStats
  ])

  const handleGranularityChange = (value: Granularity) => {
    setGranularity(value)
    setQuickFilter('personalizado')

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

  const handleQuickFilterClick = (filter: QuickFilter) => {
    setQuickFilter(filter)
    const now = new Date()

    if (filter === 'hoy-ayer') {
      setGranularity('dia')
      setPeriodA(format(now, 'dd/MM/yyyy'))
      setPeriodB(format(subDays(now, 1), 'dd/MM/yyyy'))
      return
    }

    if (filter === 'semana-actual-anterior') {
      setGranularity('semana')
      const week = getWeek(now, { weekStartsOn: 1 })
      setPeriodA(`Sem ${week.toString().padStart(2, '0')} ${now.getFullYear()}`)
      
      const prev = subWeeks(now, 1)
      const prevWeek = getWeek(prev, { weekStartsOn: 1 })
      setPeriodB(`Sem ${prevWeek.toString().padStart(2, '0')} ${prev.getFullYear()}`)
      return
    }

    if (filter === 'mes-actual-anterior') {
      setGranularity('mes')
      const monthName = format(now, 'MMM', { locale: es })
      const capMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1)
      setPeriodA(`${capMonth} ${now.getFullYear()}`)
      
      const prev = subMonths(now, 1)
      const prevMonthName = format(prev, 'MMM', { locale: es })
      const capPrev = prevMonthName.charAt(0).toUpperCase() + prevMonthName.slice(1)
      setPeriodB(`${capPrev} ${prev.getFullYear()}`)
    }
  }

  const handleChangePeriodA = (val: string) => {
    setPeriodA(val)
    setQuickFilter('personalizado')
  }

  const handleChangePeriodB = (val: string) => {
    setPeriodB(val)
    setQuickFilter('personalizado')
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
      
      <div className="dashboard-metrics-grid">
        {metrics.map(metric => {
          const isPositive = metric.variationSign === 'positive'
          const Icon = isPositive ? ArrowUpRight : ArrowDownRight
          const badgeClassName = isPositive
            ? 'dashboard-metric-badge dashboard-metric-badge--positive'
            : 'dashboard-metric-badge dashboard-metric-badge--negative'

          return (
            <div
              key={metric.id}
              className="dashboard-metric-card"
            >
              <span className="dashboard-metric-name">
                {metric.name}
              </span>
              <div className="dashboard-metric-values">
                <div className="dashboard-metric-value">
                  <span
                    className="dashboard-metric-label"
                    style={{ color: '#E53935' }}
                  >
                    Periodo A
                  </span>
                  <span className="dashboard-metric-value-main">
                    {metric.valueA}
                  </span>
                </div>
                <div className="dashboard-metric-value">
                  <span className="dashboard-metric-label">
                    Periodo B
                  </span>
                  <span className="dashboard-metric-value-secondary">
                    {metric.valueB}
                  </span>
                </div>
              </div>
              <span className={badgeClassName}>
                <Icon className="dashboard-metric-badge-icon" />
                {metric.variationLabel}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
