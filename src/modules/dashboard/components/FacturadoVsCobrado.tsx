import { useState } from 'react'
import {
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart
} from 'recharts'
import { getWeek } from 'date-fns'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { useFacturadoCobradoData, type Granularity } from '../../../hooks/useFacturadoCobradoData'
import { PeriodPicker } from './PeriodPicker'
import { FacturadoComparativo } from './FacturadoComparativo'
import './FacturadoVsCobrado.css'

type ActiveTab = 'datos' | 'comparativo'

const formatCurrencyK = (value: number) => `$${Math.round(value / 1000)}K`

const formatCurrencyFull = (value: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || payload.length === 0) return null

  const data = payload[0]?.payload || {}
  const facturado = Number(data.facturado || 0)
  const cobrado = Number(data.cobrado || 0)
  const saldoPendiente = facturado - cobrado
  const pctCobrado = facturado > 0 ? ((cobrado / facturado) * 100).toFixed(1) : '0'
  const saldoColor = saldoPendiente >= 0 ? '#ef4444' : '#16a34a'

  return (
    <div className="fact-cob-tooltip">
      <span className="fact-cob-tooltip-label">{label}</span>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 6, fontSize: '0.8rem' }}>
        <span style={{ color: '#16a34a', fontWeight: 600 }}>Facturado:</span>
        <span style={{ fontWeight: 600 }}>{formatCurrencyFull(facturado)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: '0.8rem' }}>
        <span style={{ color: '#2563eb', fontWeight: 600 }}>Cobrado:</span>
        <span style={{ fontWeight: 600 }}>{formatCurrencyFull(cobrado)}</span>
      </div>
      <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #e5e7eb', fontSize: '0.75rem', color: '#6b7280' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span>Saldo Pendiente:</span>
          <span style={{ fontWeight: 600, color: saldoColor }}>{formatCurrencyFull(saldoPendiente)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 2 }}>
          <span>% Cobrado:</span>
          <span style={{ fontWeight: 600 }}>{pctCobrado}%</span>
        </div>
      </div>
    </div>
  )
}

export function FacturadoVsCobrado() {
  const [granularity, setGranularity] = useState<Granularity>('semana')
  const [activeTab, setActiveTab] = useState<ActiveTab>('datos')
  const [selectedPeriod, setSelectedPeriod] = useState<string>(() => {
    const now = new Date()
    const week = getWeek(now, { weekStartsOn: 1 })
    return `Sem ${week.toString().padStart(2, '0')} ${now.getFullYear()}`
  })
  const { chartData, loading } = useFacturadoCobradoData(granularity, selectedPeriod)

  const handleGranularityChange = (val: Granularity) => {
    setGranularity(val)
    const now = new Date()
    if (val === 'semana') {
      const week = getWeek(now, { weekStartsOn: 1 })
      setSelectedPeriod(`Sem ${week.toString().padStart(2, '0')} ${now.getFullYear()}`)
    } else if (val === 'mes') {
      const monthName = format(now, 'MMM', { locale: es })
      const capMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1)
      setSelectedPeriod(`${capMonth} ${now.getFullYear()}`)
    } else if (val === 'ano') {
      setSelectedPeriod(now.getFullYear().toString())
    }
  }

  // Totales para el resumen
  const totalFacturado = chartData.reduce((s, d) => s + d.facturado, 0)
  const totalCobrado = chartData.reduce((s, d) => s + d.cobrado, 0)
  const totalSaldoPendiente = totalFacturado - totalCobrado
  const pctCobrado = totalFacturado > 0 ? ((totalCobrado / totalFacturado) * 100).toFixed(1) : '0'

  return (
    <div className="fact-cob-container">
      {/* Tabs */}
      <div className="fact-cob-tabs">
        <button
          type="button"
          className={`fact-cob-tab ${activeTab === 'datos' ? 'fact-cob-tab--active' : ''}`}
          onClick={() => setActiveTab('datos')}
        >
          Gráfico de Datos
        </button>
        <button
          type="button"
          className={`fact-cob-tab ${activeTab === 'comparativo' ? 'fact-cob-tab--active' : ''}`}
          onClick={() => setActiveTab('comparativo')}
        >
          Gráfico Comparativo
        </button>
      </div>

      {activeTab === 'datos' ? (
        <>
          <div className="fact-cob-header">
            <h2 className="fact-cob-title">FACTURADO VS COBRADO</h2>
            <div className="fact-cob-controls">
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

              <PeriodPicker
                granularity={granularity}
                value={selectedPeriod}
                onChange={setSelectedPeriod}
                className="fact-cob-picker"
                align="right"
              />
            </div>
          </div>

          <div className="fact-cob-chart-wrapper">
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                Cargando...
              </div>
            ) : chartData.length === 0 ? (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#9ca3af', fontSize: 14 }}>
                No hay semanas cerradas disponibles
              </div>
            ) : (
              <ResponsiveContainer width="99%" height="100%">
                <ComposedChart
                  data={chartData}
                  margin={{ top: 20, right: 30, left: 20, bottom: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-primary, #e5e7eb)" />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--text-tertiary, #6b7280)', fontSize: 12 }}
                    dy={10}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--text-tertiary, #6b7280)', fontSize: 12 }}
                    tickFormatter={formatCurrencyK}
                    domain={['auto', 'auto']}
                    width={50}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                  <Legend
                    verticalAlign="top"
                    height={36}
                    iconType="square"
                    wrapperStyle={{ top: 0, right: 0, left: 0, fontSize: '0.92rem' }}
                    formatter={(value: string) => (
                      <span style={{ color: '#374151', fontWeight: 600 }}>{value}</span>
                    )}
                  />
                  <Bar
                    dataKey="facturado"
                    name="Facturado"
                    fill="#16a34a"
                    radius={[4, 4, 0, 0]}
                    barSize={24}
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="cobrado"
                    name="Cobrado"
                    fill="#2563eb"
                    radius={[4, 4, 0, 0]}
                    barSize={24}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="brecha"
                    name="Saldo Pendiente"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    dot={{ r: 3, fill: '#ffffff', stroke: '#f59e0b', strokeWidth: 2 }}
                    activeDot={{ r: 5, fill: '#f59e0b', stroke: '#ffffff', strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Resumen */}
          {!loading && chartData.length > 0 && (
            <div className="fact-cob-summary">
              <div className="fact-cob-summary-item">
                <span className="fact-cob-summary-label">TOTAL FACTURADO</span>
                <span className="fact-cob-summary-value" style={{ color: '#16a34a' }}>
                  {formatCurrencyFull(totalFacturado)}
                </span>
              </div>
              <div className="fact-cob-summary-item">
                <span className="fact-cob-summary-label">TOTAL COBRADO</span>
                <span className="fact-cob-summary-value" style={{ color: '#2563eb' }}>
                  {formatCurrencyFull(totalCobrado)}
                </span>
              </div>
              <div className="fact-cob-summary-item">
                <span className="fact-cob-summary-label">SALDO PENDIENTE</span>
                <span className="fact-cob-summary-value" style={{ color: totalSaldoPendiente >= 0 ? '#ef4444' : '#16a34a' }}>
                  {formatCurrencyFull(totalSaldoPendiente)}
                </span>
              </div>
              <div className="fact-cob-summary-item">
                <span className="fact-cob-summary-label">% COBRADO</span>
                <span className="fact-cob-summary-value">
                  {pctCobrado}%
                </span>
              </div>
            </div>
          )}
        </>
      ) : (
        <FacturadoComparativo
          granularity={granularity}
          onGranularityChange={handleGranularityChange}
        />
      )}
    </div>
  )
}
