import { useState, useEffect } from 'react'
import {
  Bar,
  Cell,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LabelList,
  ResponsiveContainer,
  ComposedChart
} from 'recharts'
import { getWeek } from 'date-fns'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { useFacturadoCobradoData, type Granularity } from '../../../hooks/useFacturadoCobradoData'
import { supabase } from '../../../lib/supabase'
import { useSede } from '../../../contexts/SedeContext'
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
  const pctDiferencia = facturado > 0 ? ((saldoPendiente / facturado) * 100).toFixed(1) : '0'

  return (
    <div className="fact-cob-tooltip">
      <span className="fact-cob-tooltip-label">{label}</span>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 6, fontSize: '0.8rem' }}>
        <span style={{ color: '#2563eb', fontWeight: 600 }}>Facturado:</span>
        <span style={{ fontWeight: 600 }}>{formatCurrencyFull(facturado)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: '0.8rem' }}>
        <span style={{ color: '#16a34a', fontWeight: 600 }}>Cobrado:</span>
        <span style={{ fontWeight: 600 }}>{formatCurrencyFull(cobrado)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: '0.8rem' }}>
        <span style={{ color: '#9ca3af', fontWeight: 600 }}>Diferencia:</span>
        <span style={{ fontWeight: 600 }}>{formatCurrencyFull(saldoPendiente)}</span>
      </div>
      <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #e5e7eb', fontSize: '0.75rem', color: '#6b7280' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span>% Cobrado:</span>
          <span style={{ fontWeight: 600 }}>{pctCobrado}%</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 2 }}>
          <span>% Diferencia:</span>
          <span style={{ fontWeight: 600 }}>{pctDiferencia}%</span>
        </div>
      </div>
    </div>
  )
}

export function FacturadoVsCobrado() {
  const { sedeActualId } = useSede()
  const [granularity, setGranularity] = useState<Granularity>('semana')
  const [activeTab, setActiveTab] = useState<ActiveTab>('datos')
  const [selectedPeriod, setSelectedPeriod] = useState<string>(() => {
    const now = new Date()
    const week = getWeek(now, { weekStartsOn: 1 })
    return `Sem ${week.toString().padStart(2, '0')} ${now.getFullYear()}`
  })
  const [selectedBarIndex, setSelectedBarIndex] = useState<number | null>(null)
  const [allowedWeeks, setAllowedWeeks] = useState<Set<string> | undefined>(undefined)
  const { chartData: rawChartData, loading } = useFacturadoCobradoData(granularity, selectedPeriod)

  // Cargar semanas cerradas para restringir el PeriodPicker
  useEffect(() => {
    async function fetchClosedPeriods() {
      let query = (supabase.from('periodos_facturacion') as any)
        .select('semana, anio')
        .eq('estado', 'cerrado')
      if (sedeActualId) query = query.eq('sede_id', sedeActualId)
      const { data } = await query
      if (data) {
        const weeks = new Set<string>()
        for (const row of data as { semana: number; anio: number }[]) {
          weeks.add(`Sem ${row.semana.toString().padStart(2, '0')} ${row.anio}`)
        }
        setAllowedWeeks(weeks)
      }
    }
    fetchClosedPeriods()
  }, [sedeActualId])

  // Agregar pctCobrado a cada data point para el label encima de la barra
  const chartData = rawChartData.map(d => ({
    ...d,
    pctCobrado: d.facturado > 0 ? Math.round((d.cobrado / d.facturado) * 100) : 0,
  }))

  const handleGranularityChange = (val: Granularity) => {
    setGranularity(val)
    setSelectedBarIndex(null)
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

  // Datos del periodo seleccionado (click en barra, o ultimo del array por defecto)
  const activeIndex = selectedBarIndex !== null && selectedBarIndex < chartData.length ? selectedBarIndex : chartData.length - 1
  const selectedData = chartData.length > 0 ? chartData[activeIndex] : null
  const selFacturado = selectedData?.facturado || 0
  const selCobrado = selectedData?.cobrado || 0
  const selDiferencia = selFacturado - selCobrado
  const selPctCobrado = selFacturado > 0 ? ((selCobrado / selFacturado) * 100).toFixed(1) : '0'
  const selLabel = selectedData?.label || ''

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
                onChange={(v: string) => { setSelectedPeriod(v); setSelectedBarIndex(null) }}
                className="fact-cob-picker"
                align="right"
                allowedWeeks={granularity === 'semana' ? allowedWeeks : undefined}
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
                  onClick={(e: any) => {
                    if (e && e.activeTooltipIndex !== undefined) {
                      setSelectedBarIndex(e.activeTooltipIndex)
                    }
                  }}
                  style={{ cursor: 'pointer' }}
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
                    domain={[0, 'auto']}
                    width={50}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                  <Legend
                    verticalAlign="top"
                    height={36}
                    wrapperStyle={{ top: 0, right: 0, left: 0, fontSize: '0.92rem' }}
                    content={() => {
                      const items: { label: string; color: string; type: 'line' | 'square' }[] = [
                        { label: 'Facturado', color: '#2563eb', type: 'line' },
                        { label: 'Cobrado', color: '#16a34a', type: 'square' },
                        { label: 'Diferencia', color: '#d1d5db', type: 'square' },
                      ]
                      return (
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                          {items.map(item => (
                            <span key={item.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              {item.type === 'line' ? (
                                <svg width="16" height="10"><line x1="0" y1="5" x2="16" y2="5" stroke={item.color} strokeWidth="3" /></svg>
                              ) : (
                                <span style={{ width: 12, height: 12, background: item.color, borderRadius: 2, display: 'inline-block' }} />
                              )}
                              <span style={{ color: '#374151', fontWeight: 600, fontSize: '0.92rem' }}>{item.label}</span>
                            </span>
                          ))}
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#6b7280', fontWeight: 600, fontSize: '0.82rem' }}>
                            <span style={{ background: '#374151', color: '#fff', borderRadius: 3, padding: '1px 5px', fontSize: '0.72rem', fontWeight: 700 }}>00%</span>
                            = % Cobrado
                          </span>
                        </div>
                      )
                    }}
                  />
                  {/* Orden: Facturado (linea) primero para leyenda */}
                  <Line
                    dataKey="facturado"
                    name="Facturado"
                    type="monotone"
                    stroke="#2563eb"
                    strokeWidth={3}
                    dot={{ r: 4, fill: '#2563eb', strokeWidth: 2, stroke: '#fff' }}
                    activeDot={{ r: 6, fill: '#2563eb', strokeWidth: 2, stroke: '#fff' }}
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="cobrado"
                    name="Cobrado"
                    stackId="cobranza"
                    fill="#16a34a"
                    barSize={32}
                    isAnimationActive={false}
                  >
                    {chartData.map((_, i) => (
                      <Cell
                        key={i}
                        fill="#16a34a"
                        opacity={selectedBarIndex !== null && selectedBarIndex !== i ? 0.4 : 1}
                      />
                    ))}
                  </Bar>
                  <Bar
                    dataKey="brecha"
                    name="Diferencia"
                    stackId="cobranza"
                    fill="#d1d5db"
                    radius={[4, 4, 0, 0]}
                    barSize={32}
                    isAnimationActive={false}
                  >
                    {chartData.map((_, i) => (
                      <Cell
                        key={i}
                        fill="#d1d5db"
                        opacity={selectedBarIndex !== null && selectedBarIndex !== i ? 0.4 : 1}
                      />
                    ))}
                    <LabelList
                      dataKey="pctCobrado"
                      position="top"
                      formatter={(v: any) => `${v}%`}
                      style={{ fill: '#374151', fontSize: 11, fontWeight: 700 }}
                    />
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Resumen del periodo seleccionado */}
          {!loading && selectedData && (
            <div className="fact-cob-summary">
              <div className="fact-cob-summary-item">
                <span className="fact-cob-summary-label">FACTURADO {selLabel.toUpperCase()}</span>
                <span className="fact-cob-summary-value" style={{ color: '#2563eb' }}>
                  {formatCurrencyFull(selFacturado)}
                </span>
              </div>
              <div className="fact-cob-summary-item">
                <span className="fact-cob-summary-label">COBRADO {selLabel.toUpperCase()}</span>
                <span className="fact-cob-summary-value" style={{ color: '#16a34a' }}>
                  {formatCurrencyFull(selCobrado)}
                </span>
              </div>
              <div className="fact-cob-summary-item">
                <span className="fact-cob-summary-label">DIFERENCIA {selLabel.toUpperCase()}</span>
                <span className="fact-cob-summary-value" style={{ color: '#6b7280' }}>
                  {formatCurrencyFull(selDiferencia)}
                </span>
              </div>
              <div className="fact-cob-summary-item">
                <span className="fact-cob-summary-label">% COBRADO {selLabel.toUpperCase()}</span>
                <span className="fact-cob-summary-value">
                  {selPctCobrado}%
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
