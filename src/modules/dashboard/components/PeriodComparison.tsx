import { useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { getMockPeriodData } from '../mockData'

type Granularity = 'dia' | 'semana' | 'mes' | 'ano'

type QuickFilter =
  | 'hoy-ayer'
  | 'semana-actual-anterior'
  | 'mes-actual-anterior'
  | 'personalizado'

interface MetricView {
  id: string
  name: string
  valueA: string
  valueB: string
  variationLabel: string
  variationSign: 'positive' | 'negative'
}

const WEEK_OPTIONS = Array.from({ length: 52 }, (_, index) => {
  const number = index + 1
  return `Sem ${number.toString().padStart(2, '0')}`
})

const MONTH_NAMES = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic'
]

const MONTH_OPTIONS: string[] = []
;[2024, 2025, 2026].forEach(year => {
  MONTH_NAMES.forEach(month => {
    MONTH_OPTIONS.push(`${month} ${year}`)
  })
})

const YEAR_OPTIONS = ['2024', '2025', '2026']

function getDayOptions(): string[] {
  const today = new Date()
  const options: string[] = []

  for (let index = 0; index < 30; index += 1) {
    const date = new Date(today)
    date.setDate(today.getDate() - index)
    const day = date.getDate().toString().padStart(2, '0')
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    options.push(`${day}/${month}`)
  }

  return options
}

export function PeriodComparison() {
  const [granularity, setGranularity] = useState<Granularity>('semana')
  const [periodA, setPeriodA] = useState<string>('Sem 08')
  const [periodB, setPeriodB] = useState<string>('Sem 06')
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('personalizado')

  const periodOptions = granularity === 'dia'
    ? getDayOptions()
    : granularity === 'semana'
      ? WEEK_OPTIONS
      : granularity === 'mes'
        ? MONTH_OPTIONS
        : YEAR_OPTIONS

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
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

    const addPercentageMetric = (
      id: string,
      name: string,
      valueA: number,
      valueB: number,
      asPoints: boolean
    ) => {
      if (asPoints) {
        const diff = valueA - valueB
        const isPositive = diff >= 0
        metricList.push({
          id,
          name,
          valueA: `${valueA.toFixed(1)}%`,
          valueB: `${valueB.toFixed(1)}%`,
          variationLabel: `${isPositive ? '+' : '-'}${Math.abs(diff).toFixed(1)}pp`,
          variationSign: isPositive ? 'positive' : 'negative'
        })
      } else {
        const diff = valueA - valueB
        const base = valueB === 0 ? 0 : (diff / valueB) * 100
        const isPositive = base >= 0
        metricList.push({
          id,
          name,
          valueA: `${valueA.toFixed(0)}%`,
          valueB: `${valueB.toFixed(0)}%`,
          variationLabel: `${isPositive ? '+' : '-'}${Math.abs(base).toFixed(0)}%`,
          variationSign: isPositive ? 'positive' : 'negative'
        })
      }
    }

    addCurrencyMetric(
      'metric-cobro-pendiente',
      'COBRO PENDIENTE (ARRASTRE)',
      periodDataA.cobroPendiente,
      periodDataB.cobroPendiente
    )

    addPercentageMetric(
      'metric-efectividad-cobro',
      'EFECTIVIDAD DE COBRO',
      periodDataA.efectividadCobro,
      periodDataB.efectividadCobro,
      false
    )

    addCurrencyMetric(
      'metric-total-multas',
      'TOTAL MULTAS',
      periodDataA.totalMultas,
      periodDataB.totalMultas
    )

    addCurrencyMetric(
      'metric-total-telepase',
      'TOTAL TELEPASE',
      periodDataA.totalTelepase,
      periodDataB.totalTelepase
    )

    addPercentageMetric(
      'metric-porcentaje-siniestros',
      '% INGRESO EN SINIESTROS',
      periodDataA.ingresoSiniestros,
      periodDataB.ingresoSiniestros,
      true
    )

    return metricList
  }, [currencyFormatter, periodDataA, periodDataB])

  const handleGranularityChange = (value: Granularity) => {
    setGranularity(value)
    setQuickFilter('personalizado')

    const options = value === 'dia'
      ? getDayOptions()
      : value === 'semana'
        ? WEEK_OPTIONS
        : value === 'mes'
          ? MONTH_OPTIONS
          : YEAR_OPTIONS

    const nextPeriodA = options[0] ?? ''
    const nextPeriodB = options[1] ?? nextPeriodA

    setPeriodA(nextPeriodA)
    setPeriodB(nextPeriodB)
  }

  const handleQuickFilterClick = (filter: QuickFilter) => {
    setQuickFilter(filter)

    const today = new Date()

    if (filter === 'hoy-ayer') {
      const options = getDayOptions()
      const todayLabel = options[0] ?? ''
      const yesterdayLabel = options[1] ?? todayLabel
      setGranularity('dia')
      setPeriodA(todayLabel)
      setPeriodB(yesterdayLabel)
      return
    }

    if (filter === 'semana-actual-anterior') {
      setGranularity('semana')
      setPeriodA('Sem 08')
      setPeriodB('Sem 07')
      return
    }

    if (filter === 'mes-actual-anterior') {
      const monthIndex = today.getMonth()
      const year = today.getFullYear()

      let previousMonthIndex = monthIndex - 1
      let previousYear = year

      if (previousMonthIndex < 0) {
        previousMonthIndex = 11
        previousYear = year - 1
      }

      const currentLabel = `${MONTH_NAMES[monthIndex]} ${year}`
      const previousLabel = `${MONTH_NAMES[previousMonthIndex]} ${previousYear}`

      setGranularity('mes')
      setPeriodA(currentLabel)
      setPeriodB(previousLabel)
    }
  }

  const handleChangePeriodA = (event: ChangeEvent<HTMLSelectElement>) => {
    setPeriodA(event.target.value)
    setQuickFilter('personalizado')
  }

  const handleChangePeriodB = (event: ChangeEvent<HTMLSelectElement>) => {
    setPeriodB(event.target.value)
    setQuickFilter('personalizado')
  }

  return (
    <div className="dashboard-comparison">
      <h2 className="dashboard-section-title">
        COMPARACIÓN DE PERÍODOS
      </h2>
      <div className="dashboard-comparison-controls">
        <div className="dashboard-granularity-group">
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
        <div className="dashboard-period-selects">
          <select
            className="dashboard-select"
            value={periodA}
            onChange={handleChangePeriodA}
          >
            {periodOptions.map(option => (
              <option
                key={option}
                value={option}
              >
                {option}
              </option>
            ))}
          </select>
          <span className="dashboard-period-separator">VS</span>
          <select
            className="dashboard-select"
            value={periodB}
            onChange={handleChangePeriodB}
          >
            {periodOptions.map(option => (
              <option
                key={option}
                value={option}
              >
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="dashboard-quick-filters">
        <button
          type="button"
          className="dashboard-quick-filter"
          onClick={() => handleQuickFilterClick('hoy-ayer')}
        >
          Hoy vs Ayer
        </button>
        <button
          type="button"
          className="dashboard-quick-filter"
          onClick={() => handleQuickFilterClick('semana-actual-anterior')}
        >
          Sem actual vs anterior
        </button>
        <button
          type="button"
          className="dashboard-quick-filter"
          onClick={() => handleQuickFilterClick('mes-actual-anterior')}
        >
          Mes actual vs anterior
        </button>
        <button
          type="button"
          className={
            quickFilter === 'personalizado'
              ? 'dashboard-quick-filter dashboard-quick-filter--custom'
              : 'dashboard-quick-filter'
          }
          onClick={() => handleQuickFilterClick('personalizado')}
        >
          Personalizado
        </button>
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
                    PER. A
                  </span>
                  <span className="dashboard-metric-value-main">
                    {metric.valueA}
                  </span>
                </div>
                <div className="dashboard-metric-value">
                  <span className="dashboard-metric-label">
                    PER. B
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

