import { useState, useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts'
import { format, getWeek } from 'date-fns'
import { es } from 'date-fns/locale'
import { useFactCobComparativeData, type Granularity } from '../../../hooks/useFacturadoCobradoData'
import { PeriodPicker } from './PeriodPicker'
import { AdaptiveTooltip } from '../../../components/ui/AdaptiveTooltip'
import './FacturadoComparativo.css'

const formatCurrencyK = (value: number) => `$${Math.round(value / 1000)}K`

const formatCurrencyFull = (value: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)

const mesesCompletos: Record<string, string> = {
  ene: 'Enero', feb: 'Febrero', mar: 'Marzo', abr: 'Abril',
  may: 'Mayo', jun: 'Junio', jul: 'Julio', ago: 'Agosto',
  sep: 'Septiembre', oct: 'Octubre', nov: 'Noviembre', dic: 'Diciembre',
}

function getShortLabel(period: string, granularity: Granularity): string {
  if (granularity === 'semana') {
    const match = period.match(/Sem\s+(\d+)/)
    return match ? `Semana ${parseInt(match[1], 10)}` : period
  }
  if (granularity === 'mes') {
    const abbr = period.split(' ')[0]?.toLowerCase() || ''
    return mesesCompletos[abbr] || period.split(' ')[0] || period
  }
  return period
}

function calcVariation(a: number, b: number): { pct: string; direction: 'up' | 'down' | 'neutral' } {
  if (b === 0 && a === 0) return { pct: '0', direction: 'neutral' }
  if (b === 0) return { pct: '100', direction: a > 0 ? 'up' : 'neutral' }
  const diff = a - b
  const pct = Math.abs((diff / b) * 100).toFixed(1)
  return { pct, direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'neutral' }
}

const COLOR_A = '#2563eb'
const COLOR_B = '#f97316'

const ComparisonTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || payload.length === 0) return null
  const data = payload[0]?.payload || {}

  return (
    <div className="fact-comp-tooltip">
      <span className="fact-comp-tooltip-label">{label}</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: COLOR_A }}>
          Periodo A
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: '0.8rem' }}>
          <span style={{ color: '#374151' }}>Facturado:</span>
          <span style={{ fontWeight: 600 }}>{formatCurrencyFull(data.facturadoA || 0)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: '0.8rem' }}>
          <span style={{ color: '#374151' }}>Cobrado:</span>
          <span style={{ fontWeight: 600 }}>{formatCurrencyFull(data.cobradoA || 0)}</span>
        </div>
        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 6, marginTop: 2, fontSize: '0.8rem', fontWeight: 600, color: COLOR_B }}>
          Periodo B
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: '0.8rem' }}>
          <span style={{ color: '#374151' }}>Facturado:</span>
          <span style={{ fontWeight: 600 }}>{formatCurrencyFull(data.facturadoB || 0)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: '0.8rem' }}>
          <span style={{ color: '#374151' }}>Cobrado:</span>
          <span style={{ fontWeight: 600 }}>{formatCurrencyFull(data.cobradoB || 0)}</span>
        </div>
      </div>
    </div>
  )
}

interface Props {
  granularity: Granularity
  onGranularityChange: (g: Granularity) => void
}

export function FacturadoComparativo({ granularity, onGranularityChange }: Props) {
  const now = new Date()

  const [periodA, setPeriodA] = useState<string>(() => {
    if (granularity === 'semana') {
      const week = getWeek(now, { weekStartsOn: 1 })
      return `Sem ${week.toString().padStart(2, '0')} ${now.getFullYear()}`
    }
    if (granularity === 'mes') {
      const monthName = format(now, 'MMM', { locale: es })
      return `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${now.getFullYear()}`
    }
    return now.getFullYear().toString()
  })

  const [periodB, setPeriodB] = useState<string>(() => {
    if (granularity === 'semana') {
      const week = getWeek(now, { weekStartsOn: 1 })
      const prevWeek = week - 1 > 0 ? week - 1 : 52
      const prevYear = week - 1 > 0 ? now.getFullYear() : now.getFullYear() - 1
      return `Sem ${prevWeek.toString().padStart(2, '0')} ${prevYear}`
    }
    if (granularity === 'mes') {
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const monthName = format(prevMonth, 'MMM', { locale: es })
      return `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${prevMonth.getFullYear()}`
    }
    return (now.getFullYear() - 1).toString()
  })

  const { dataA, dataB, loading } = useFactCobComparativeData(granularity, periodA, periodB)

  // Para semana: comparamos un solo punto (facturado/cobrado de cada periodo)
  // Para mes/año: comparamos múltiples puntos
  const mergedData = useMemo(() => {
    if (granularity === 'semana') {
      // Dos puntos (Facturado / Cobrado) con una barra por periodo
      const a = dataA[0] || { facturado: 0, cobrado: 0 }
      const b = dataB[0] || { facturado: 0, cobrado: 0 }
      return [{
        label: 'Facturado',
        valorA: a.facturado,
        valorB: b.facturado,
        facturadoA: a.facturado,
        cobradoA: a.cobrado,
        facturadoB: b.facturado,
        cobradoB: b.cobrado,
      }, {
        label: 'Cobrado',
        valorA: a.cobrado,
        valorB: b.cobrado,
        facturadoA: a.facturado,
        cobradoA: a.cobrado,
        facturadoB: b.facturado,
        cobradoB: b.cobrado,
      }]
    }

    // Mes/Año: overlay por punto
    const maxLen = Math.max(dataA.length, dataB.length)
    if (maxLen === 0) return []

    return Array.from({ length: maxLen }, (_, i) => {
      const a = dataA[i]
      const b = dataB[i]
      return {
        label: a?.label || b?.label || `${i + 1}`,
        facturadoA: a?.facturado || 0,
        cobradoA: a?.cobrado || 0,
        facturadoB: b?.facturado || 0,
        cobradoB: b?.cobrado || 0,
      }
    })
  }, [dataA, dataB, granularity])

  const totals = useMemo(() => {
    const sumA = dataA.reduce((acc, d) => ({
      facturado: acc.facturado + d.facturado,
      cobrado: acc.cobrado + d.cobrado,
    }), { facturado: 0, cobrado: 0 })
    const sumB = dataB.reduce((acc, d) => ({
      facturado: acc.facturado + d.facturado,
      cobrado: acc.cobrado + d.cobrado,
    }), { facturado: 0, cobrado: 0 })

    const varFacturado = calcVariation(sumA.facturado, sumB.facturado)
    const varCobrado = calcVariation(sumA.cobrado, sumB.cobrado)

    return { sumA, sumB, varFacturado, varCobrado }
  }, [dataA, dataB])

  const handleGranularityChange = (val: Granularity) => {
    onGranularityChange(val)
    const n = new Date()
    if (val === 'semana') {
      const week = getWeek(n, { weekStartsOn: 1 })
      setPeriodA(`Sem ${week.toString().padStart(2, '0')} ${n.getFullYear()}`)
      const prevWeek = week - 1 > 0 ? week - 1 : 52
      const prevYear = week - 1 > 0 ? n.getFullYear() : n.getFullYear() - 1
      setPeriodB(`Sem ${prevWeek.toString().padStart(2, '0')} ${prevYear}`)
    } else if (val === 'mes') {
      const monthName = format(n, 'MMM', { locale: es })
      setPeriodA(`${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${n.getFullYear()}`)
      const prevMonth = new Date(n.getFullYear(), n.getMonth() - 1, 1)
      const prevMName = format(prevMonth, 'MMM', { locale: es })
      setPeriodB(`${prevMName.charAt(0).toUpperCase() + prevMName.slice(1)} ${prevMonth.getFullYear()}`)
    } else if (val === 'ano') {
      setPeriodA(n.getFullYear().toString())
      setPeriodB((n.getFullYear() - 1).toString())
    }
  }

  return (
    <div className="fact-comp-content">
      {/* Controles */}
      <div className="fact-comp-controls">
        <div className="dashboard-granularity-buttons-container">
          {(['semana', 'mes', 'ano'] as Granularity[]).map(g => (
            <button
              key={g}
              type="button"
              className={granularity === g
                ? 'dashboard-granularity-button dashboard-granularity-button--active'
                : 'dashboard-granularity-button'}
              onClick={() => handleGranularityChange(g)}
            >
              {g === 'semana' ? 'Semana' : g === 'mes' ? 'Mes' : 'Año'}
            </button>
          ))}
        </div>
      </div>

      {/* Selectores de periodo */}
      <div className="fact-comp-periods">
        <div className="fact-comp-period-group">
          <span className="fact-comp-period-label fact-comp-period-label--a">PERIODO A</span>
          <PeriodPicker
            granularity={granularity}
            value={periodA}
            onChange={setPeriodA}
            className="fact-comp-picker"
          />
        </div>
        <span className="fact-comp-vs">VS</span>
        <div className="fact-comp-period-group">
          <span className="fact-comp-period-label fact-comp-period-label--b">PERIODO B</span>
          <PeriodPicker
            granularity={granularity}
            value={periodB}
            onChange={setPeriodB}
            className="fact-comp-picker"
          />
        </div>
      </div>

      {/* Variaciones */}
      {!loading && (
        <div className="fact-comp-variation-section">
          <p className="fact-comp-variation-text">
            El <strong>FACTURADO</strong> de <strong>{getShortLabel(periodA, granularity)}</strong> es un{' '}
            <span className={`fact-comp-variation-pct fact-comp-variation-pct--${totals.varFacturado.direction}`}>
              {totals.varFacturado.pct}%{' '}
              {totals.varFacturado.direction === 'up' ? 'mayor' : totals.varFacturado.direction === 'down' ? 'menor' : 'igual'}
            </span>{' '}
            respecto a <strong>{getShortLabel(periodB, granularity)}</strong>
            <AdaptiveTooltip
              width={280}
              variant="card"
              content={
                <span>
                  <strong>Variacion del Facturado</strong><br /><br />
                  Compara el total facturado entre <strong>{getShortLabel(periodA, granularity)}</strong> y <strong>{getShortLabel(periodB, granularity)}</strong>.<br /><br />
                  <em>Formula: ((Facturado A - Facturado B) / Facturado B) x 100</em>
                </span>
              }
            >
              <span className="fact-comp-info-icon">i</span>
            </AdaptiveTooltip>
          </p>
          <p className="fact-comp-variation-text">
            El <strong>COBRADO</strong> de <strong>{getShortLabel(periodA, granularity)}</strong> es un{' '}
            <span className={`fact-comp-variation-pct fact-comp-variation-pct--${totals.varCobrado.direction}`}>
              {totals.varCobrado.pct}%{' '}
              {totals.varCobrado.direction === 'up' ? 'mayor' : totals.varCobrado.direction === 'down' ? 'menor' : 'igual'}
            </span>{' '}
            respecto a <strong>{getShortLabel(periodB, granularity)}</strong>
            <AdaptiveTooltip
              width={280}
              variant="card"
              content={
                <span>
                  <strong>Variacion del Cobrado</strong><br /><br />
                  Compara el total cobrado entre <strong>{getShortLabel(periodA, granularity)}</strong> y <strong>{getShortLabel(periodB, granularity)}</strong>.<br /><br />
                  <em>Formula: ((Cobrado A - Cobrado B) / Cobrado B) x 100</em>
                </span>
              }
            >
              <span className="fact-comp-info-icon">i</span>
            </AdaptiveTooltip>
          </p>
        </div>
      )}

      {/* Grafico */}
      <div className="fact-comp-chart-wrapper">
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            Cargando...
          </div>
        ) : mergedData.length === 0 ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#9ca3af', fontSize: 14 }}>
            No hay datos para comparar
          </div>
        ) : (
          <ResponsiveContainer width="99%" height="100%">
            <BarChart
              data={mergedData}
              margin={{ top: 20, right: 30, left: 20, bottom: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#6b7280', fontSize: 12 }}
                dy={10}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#6b7280', fontSize: 12 }}
                tickFormatter={formatCurrencyK}
                domain={['auto', 'auto']}
                width={50}
              />
              <Tooltip content={<ComparisonTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
              <Legend
                verticalAlign="top"
                height={50}
                iconType="square"
                wrapperStyle={{ top: 0, right: 0, left: 0, fontSize: '0.85rem' }}
                formatter={(value: string) => (
                  <span style={{ color: '#374151', fontWeight: 600 }}>{value}</span>
                )}
              />
              {granularity === 'semana' ? (
                <>
                  <Bar dataKey="valorA" name={periodA} fill={COLOR_A} radius={[4, 4, 0, 0]} barSize={28} isAnimationActive={false} />
                  <Bar dataKey="valorB" name={periodB} fill={COLOR_B} radius={[4, 4, 0, 0]} barSize={28} isAnimationActive={false} />
                </>
              ) : (
                <>
                  <Bar dataKey="facturadoA" name={`Facturado (${periodA})`} fill={COLOR_A} radius={[4, 4, 0, 0]} barSize={20} isAnimationActive={false} />
                  <Bar dataKey="cobradoA" name={`Cobrado (${periodA})`} fill={`${COLOR_A}99`} radius={[4, 4, 0, 0]} barSize={20} isAnimationActive={false} />
                  <Bar dataKey="facturadoB" name={`Facturado (${periodB})`} fill={COLOR_B} radius={[4, 4, 0, 0]} barSize={20} isAnimationActive={false} />
                  <Bar dataKey="cobradoB" name={`Cobrado (${periodB})`} fill={`${COLOR_B}99`} radius={[4, 4, 0, 0]} barSize={20} isAnimationActive={false} />
                </>
              )}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Tarjetas resumen */}
      <div className="fact-comp-summary">
        <div className="fact-comp-card fact-comp-card--a">
          <div className="fact-comp-card-title" style={{ color: COLOR_A }}>{periodA.toUpperCase()}</div>
          <div className="fact-comp-card-row">
            <div className="fact-comp-card-period">
              <span className="fact-comp-card-label">FACTURADO</span>
              <span className="fact-comp-card-value">{formatCurrencyFull(totals.sumA.facturado)}</span>
            </div>
            <div className="fact-comp-card-period">
              <span className="fact-comp-card-label">COBRADO</span>
              <span className="fact-comp-card-value">{formatCurrencyFull(totals.sumA.cobrado)}</span>
            </div>
          </div>
        </div>

        <div className="fact-comp-card fact-comp-card--b">
          <div className="fact-comp-card-title" style={{ color: COLOR_B }}>{periodB.toUpperCase()}</div>
          <div className="fact-comp-card-row">
            <div className="fact-comp-card-period">
              <span className="fact-comp-card-label">FACTURADO</span>
              <span className="fact-comp-card-value">{formatCurrencyFull(totals.sumB.facturado)}</span>
            </div>
            <div className="fact-comp-card-period">
              <span className="fact-comp-card-label">COBRADO</span>
              <span className="fact-comp-card-value">{formatCurrencyFull(totals.sumB.cobrado)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
