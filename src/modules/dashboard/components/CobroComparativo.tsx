import { useState, useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts'
import { format, getWeek } from 'date-fns'
import { es } from 'date-fns/locale'
import { useCobroTeoricoData, type Granularity } from '../../../hooks/useCobroTeoricoData'
import { PeriodPicker } from './PeriodPicker'
import { AdaptiveTooltip } from '../../../components/ui/AdaptiveTooltip'
import './CobroComparativo.css'

const formatCurrencyK = (value: number) => {
  return `$${Math.round(value / 1000)}K`
}

const formatCurrencyFull = (value: number) => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value)
}

/** Etiquetas genéricas para el eje X según granularidad */
function getGenericLabels(granularity: Granularity, count: number): string[] {
  if (granularity === 'semana') {
    return ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
  }
  if (granularity === 'mes') {
    return Array.from({ length: count }, (_, i) => `Sem ${(i + 1).toString().padStart(2, '0')}`)
  }
  // año
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return meses.slice(0, count)
}

/** Etiqueta corta de período para textos de variación */
const mesesCompletos: Record<string, string> = {
  ene: 'Enero', feb: 'Febrero', mar: 'Marzo', abr: 'Abril',
  may: 'Mayo', jun: 'Junio', jul: 'Julio', ago: 'Agosto',
  sep: 'Septiembre', oct: 'Octubre', nov: 'Noviembre', dic: 'Diciembre',
}

function getShortLabel(period: string, granularity: Granularity): string {
  if (granularity === 'semana') {
    // "Sem 11 2026" → "Semana 11"
    const match = period.match(/Sem\s+(\d+)/)
    return match ? `Semana ${parseInt(match[1], 10)}` : period
  }
  if (granularity === 'mes') {
    // "Mar 2026" → "Marzo"
    const abbr = period.split(' ')[0]?.toLowerCase() || ''
    return mesesCompletos[abbr] || period.split(' ')[0] || period
  }
  // año: "2026" → "2026"
  return period
}

/** Calcula variación porcentual */
function calcVariation(a: number, b: number): { pct: string; direction: 'up' | 'down' | 'neutral' } {
  if (b === 0 && a === 0) return { pct: '0', direction: 'neutral' }
  if (b === 0) return { pct: '100', direction: a > 0 ? 'up' : 'neutral' }
  const diff = a - b
  const pct = Math.abs((diff / b) * 100).toFixed(1)
  return { pct, direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'neutral' }
}

interface ComparisonTooltipProps {
  active?: boolean
  payload?: any[]
  label?: string
}

// Colores agrupados por período
const COLOR_A = '#2563eb' // Azul — Período A
const COLOR_B = '#f97316' // Naranja — Período B

const ComparisonTooltip = ({ active, payload, label }: ComparisonTooltipProps) => {
  if (!active || !payload || payload.length === 0) return null

  const data = payload[0]?.payload || {}

  return (
    <div className="cobro-comparativo-tooltip">
      <span className="cobro-comparativo-tooltip-label">{label}</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: COLOR_A }}>
          {data.diaA ? `Período A — ${data.diaA}` : 'Período A'}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: '0.8rem' }}>
          <span style={{ color: '#374151' }}>Esperado:</span>
          <span style={{ fontWeight: 600 }}>{formatCurrencyFull(data.teoricoA || 0)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: '0.8rem' }}>
          <span style={{ color: '#374151' }}>Percibido:</span>
          <span style={{ fontWeight: 600 }}>{formatCurrencyFull(data.realA || 0)}</span>
        </div>
        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 6, marginTop: 2, fontSize: '0.8rem', fontWeight: 600, color: COLOR_B }}>
          {data.diaB ? `Período B — ${data.diaB}` : 'Período B'}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: '0.8rem' }}>
          <span style={{ color: '#374151' }}>Esperado:</span>
          <span style={{ fontWeight: 600 }}>{formatCurrencyFull(data.teoricoB || 0)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: '0.8rem' }}>
          <span style={{ color: '#374151' }}>Percibido:</span>
          <span style={{ fontWeight: 600 }}>{formatCurrencyFull(data.realB || 0)}</span>
        </div>
      </div>
    </div>
  )
}

interface Props {
  granularity: Granularity
  onGranularityChange: (g: Granularity) => void
}

export function CobroComparativo({ granularity, onGranularityChange }: Props) {
  const now = new Date()

  // Período A: semana/mes/año actual
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

  // Período B: semana/mes/año anterior
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

  const dataA = useCobroTeoricoData(granularity, periodA)
  const dataB = useCobroTeoricoData(granularity, periodB)

  const loading = dataA.loading || dataB.loading

  // Merge data para el gráfico superpuesto
  const mergedData = useMemo(() => {
    const maxLen = Math.max(dataA.chartData.length, dataB.chartData.length)
    if (maxLen === 0) return []

    const labels = getGenericLabels(granularity, maxLen)

    return Array.from({ length: maxLen }, (_, i) => {
      const a = dataA.chartData[i]
      const b = dataB.chartData[i]
      return {
        dia: labels[i] || `${i + 1}`,
        diaA: a?.dia || '',
        diaB: b?.dia || '',
        teoricoA: a?.teorico || 0,
        realA: a?.real || 0,
        teoricoB: b?.teorico || 0,
        realB: b?.real || 0,
      }
    })
  }, [dataA.chartData, dataB.chartData, granularity])

  // Totales para tarjetas resumen
  const totals = useMemo(() => {
    const sumA = dataA.chartData.reduce((acc, d) => ({ teorico: acc.teorico + d.teorico, real: acc.real + d.real }), { teorico: 0, real: 0 })
    const sumB = dataB.chartData.reduce((acc, d) => ({ teorico: acc.teorico + d.teorico, real: acc.real + d.real }), { teorico: 0, real: 0 })

    const varEsperado = calcVariation(sumA.teorico, sumB.teorico)
    const varPercibido = calcVariation(sumA.real, sumB.real)

    return { sumA, sumB, varEsperado, varPercibido }
  }, [dataA.chartData, dataB.chartData])

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
    <div className="cobro-comparativo-content">
      {/* Controles */}
      <div className="cobro-comparativo-controls">
        <div className="dashboard-granularity-buttons-container">
          {(['semana', 'mes', 'ano'] as Granularity[]).map(g => (
            <button
              key={g}
              type="button"
              className={granularity === g ? 'dashboard-granularity-button dashboard-granularity-button--active' : 'dashboard-granularity-button'}
              onClick={() => handleGranularityChange(g)}
            >
              {g === 'semana' ? 'Semana' : g === 'mes' ? 'Mes' : 'Año'}
            </button>
          ))}
        </div>
      </div>

      {/* Selectores de período */}
      <div className="cobro-comparativo-periods">
        <div className="cobro-comparativo-period-group">
          <span className="cobro-comparativo-period-label cobro-comparativo-period-label--a">PERÍODO A</span>
          <PeriodPicker
            granularity={granularity}
            value={periodA}
            onChange={setPeriodA}
            className="cobro-comparativo-picker"
          />
        </div>
        <span className="cobro-comparativo-vs">VS</span>
        <div className="cobro-comparativo-period-group">
          <span className="cobro-comparativo-period-label cobro-comparativo-period-label--b">PERÍODO B</span>
          <PeriodPicker
            granularity={granularity}
            value={periodB}
            onChange={setPeriodB}
            className="cobro-comparativo-picker"
          />
        </div>
      </div>

      {/* Variaciones descriptivas — sección propia */}
      {!loading && (
        <div className="cobro-comparativo-variation-section">
          <p className="cobro-comparativo-variation-text">
            El <strong>COBRO ESPERADO</strong> de <strong>{getShortLabel(periodA, granularity)}</strong> es un{' '}
            <span className={`cobro-comparativo-variation-pct cobro-comparativo-variation-pct--${totals.varEsperado.direction}`}>
              {totals.varEsperado.pct}%{' '}
              {totals.varEsperado.direction === 'up' ? 'mayor' : totals.varEsperado.direction === 'down' ? 'menor' : 'igual'}
            </span>{' '}
            respecto a <strong>{getShortLabel(periodB, granularity)}</strong>
            <AdaptiveTooltip
              width={280}
              variant="card"
              content={
                <span>
                  <strong>Variación del Cobro Esperado</strong><br /><br />
                  Compara el total esperado (teórico) entre <strong>{getShortLabel(periodA, granularity)}</strong> y <strong>{getShortLabel(periodB, granularity)}</strong>.<br /><br />
                  Si el porcentaje es positivo (↗), significa que en {getShortLabel(periodA, granularity)} se esperaba cobrar <strong>más</strong>. Si es negativo (↘), se esperaba cobrar <strong>menos</strong>.<br /><br />
                  <em>Fórmula: ((Esperado A − Esperado B) / Esperado B) × 100</em>
                </span>
              }
            >
              <span className="cobro-comparativo-info-icon">i</span>
            </AdaptiveTooltip>
          </p>
          <p className="cobro-comparativo-variation-text">
            El <strong>COBRO PERCIBIDO</strong> de <strong>{getShortLabel(periodA, granularity)}</strong> es un{' '}
            <span className={`cobro-comparativo-variation-pct cobro-comparativo-variation-pct--${totals.varPercibido.direction}`}>
              {totals.varPercibido.pct}%{' '}
              {totals.varPercibido.direction === 'up' ? 'mayor' : totals.varPercibido.direction === 'down' ? 'menor' : 'igual'}
            </span>{' '}
            respecto a <strong>{getShortLabel(periodB, granularity)}</strong>
            <AdaptiveTooltip
              width={280}
              variant="card"
              content={
                <span>
                  <strong>Variación del Cobro Percibido</strong><br /><br />
                  Compara el total efectivamente cobrado (real) entre <strong>{getShortLabel(periodA, granularity)}</strong> y <strong>{getShortLabel(periodB, granularity)}</strong>.<br /><br />
                  Si el porcentaje es positivo (↗), significa que en {getShortLabel(periodA, granularity)} se cobró <strong>más</strong>. Si es negativo (↘), se cobró <strong>menos</strong>.<br /><br />
                  <em>Fórmula: ((Percibido A − Percibido B) / Percibido B) × 100</em>
                </span>
              }
            >
              <span className="cobro-comparativo-info-icon">i</span>
            </AdaptiveTooltip>
          </p>
        </div>
      )}

      {/* Gráfico */}
      <div className="cobro-comparativo-chart-wrapper">
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            Cargando...
          </div>
        ) : (
          <ResponsiveContainer width="99%" height="100%">
            <LineChart
              data={mergedData}
              margin={{ top: 20, right: 30, left: 20, bottom: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
              <XAxis
                dataKey="dia"
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
              <Tooltip content={<ComparisonTooltip />} cursor={{ stroke: '#9ca3af', strokeWidth: 1, strokeDasharray: '4 4' }} />
              <Legend
                verticalAlign="top"
                height={50}
                iconType="plainline"
                wrapperStyle={{ top: 0, right: 0, left: 0, fontSize: '0.92rem' }}
                formatter={(value: string) => {
                  const match = value.match(/^(Esperado|Percibido)\s*\((.+)\)$/)
                  if (match) {
                    const periodShort = match[2].replace(/\s+\d{4}$/, '')
                    return (
                      <span style={{ color: '#374151', fontWeight: 600 }}>
                        {match[1]} <span style={{ fontSize: '0.78em', opacity: 0.6 }}>({periodShort})</span>
                      </span>
                    )
                  }
                  return <span style={{ color: '#374151', fontWeight: 600 }}>{value}</span>
                }}
              />
              {/* Período A: sólida = Esperado, punteada = Percibido */}
              <Line
                type="linear"
                dataKey="teoricoA"
                name={`Esperado (${periodA})`}
                stroke={COLOR_A}
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="realA"
                name={`Percibido (${periodA})`}
                stroke={COLOR_A}
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={{ r: 3, fill: '#ffffff', stroke: COLOR_A, strokeWidth: 2 }}
                activeDot={{ r: 5, fill: COLOR_A, stroke: '#ffffff', strokeWidth: 2 }}
                isAnimationActive={false}
              />
              {/* Período B: sólida = Esperado, punteada = Percibido */}
              <Line
                type="linear"
                dataKey="teoricoB"
                name={`Esperado (${periodB})`}
                stroke={COLOR_B}
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="realB"
                name={`Percibido (${periodB})`}
                stroke={COLOR_B}
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                activeDot={{ r: 4, fill: COLOR_B, stroke: '#ffffff', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Tarjetas resumen agrupadas por período */}
      <div className="cobro-comparativo-summary">
        <div className="cobro-comparativo-card cobro-comparativo-card--a">
          <div className="cobro-comparativo-card-title" style={{ color: COLOR_A }}>{periodA.toUpperCase()}</div>
          <div className="cobro-comparativo-card-row">
            <div className="cobro-comparativo-card-period">
              <span className="cobro-comparativo-card-label">ESPERADO</span>
              <span className="cobro-comparativo-card-value">{formatCurrencyFull(totals.sumA.teorico)}</span>
            </div>
            <div className="cobro-comparativo-card-period">
              <span className="cobro-comparativo-card-label">PERCIBIDO</span>
              <span className="cobro-comparativo-card-value">{formatCurrencyFull(totals.sumA.real)}</span>
            </div>
          </div>
        </div>

        <div className="cobro-comparativo-card cobro-comparativo-card--b">
          <div className="cobro-comparativo-card-title" style={{ color: COLOR_B }}>{periodB.toUpperCase()}</div>
          <div className="cobro-comparativo-card-row">
            <div className="cobro-comparativo-card-period">
              <span className="cobro-comparativo-card-label">ESPERADO</span>
              <span className="cobro-comparativo-card-value">{formatCurrencyFull(totals.sumB.teorico)}</span>
            </div>
            <div className="cobro-comparativo-card-period">
              <span className="cobro-comparativo-card-label">PERCIBIDO</span>
              <span className="cobro-comparativo-card-value">{formatCurrencyFull(totals.sumB.real)}</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
