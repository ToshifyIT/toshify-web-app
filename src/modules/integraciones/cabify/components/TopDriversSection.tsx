// src/modules/integraciones/cabify/components/TopDriversSection.tsx
/**
 * Componente de sección Top 10 conductores
 * Principio: Single Responsibility - Solo visualización de tops
 * Principio: Open/Closed - Extensible para diferentes tipos de top
 */

import { ChevronDown, ChevronUp, List, BarChart3 } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import type { AsignacionActiva } from '../../../../services/asignacionesService'
import type {
  CabifyDriver,
  ViewMode,
  ChartDataPoint,
  AccordionState,
} from '../types/cabify.types'
import { formatCurrency, getDriverPatente } from '../utils/cabify.utils'
import { CHART_COLORS, UI_TEXT } from '../constants/cabify.constants'

// =====================================================
// TIPOS
// =====================================================

interface TopDriversSectionProps {
  readonly topMejores: readonly CabifyDriver[]
  readonly topPeores: readonly CabifyDriver[]
  readonly chartDataMejores: readonly ChartDataPoint[]
  readonly chartDataPeores: readonly ChartDataPoint[]
  readonly viewMode: ViewMode
  readonly accordionState: AccordionState
  readonly asignaciones: Map<string, AsignacionActiva>
  readonly onViewModeChange: (mode: ViewMode) => void
  readonly onToggleAccordion: (key: 'mejores' | 'peores') => void
}

// =====================================================
// COMPONENTE PRINCIPAL
// =====================================================

export function TopDriversSection({
  topMejores,
  topPeores,
  chartDataMejores,
  chartDataPeores,
  viewMode,
  accordionState,
  asignaciones,
  onViewModeChange,
  onToggleAccordion,
}: TopDriversSectionProps) {
  const hasDrivers = topMejores.length > 0 || topPeores.length > 0

  if (!hasDrivers) return null

  return (
    <>
      <ViewToggle viewMode={viewMode} onChange={onViewModeChange} />
      <div className="cabify-tops-container">
        <TopCard
          type="mejores"
          title="Top 10 Mejores Conductores"
          drivers={topMejores}
          chartData={chartDataMejores}
          viewMode={viewMode}
          isExpanded={accordionState.mejores}
          asignaciones={asignaciones}
          onToggle={() => onToggleAccordion('mejores')}
        />
        <TopCard
          type="peores"
          title="10 Conductores con Menor Rendimiento"
          drivers={topPeores}
          chartData={chartDataPeores}
          viewMode={viewMode}
          isExpanded={accordionState.peores}
          asignaciones={asignaciones}
          onToggle={() => onToggleAccordion('peores')}
        />
      </div>
    </>
  )
}

// =====================================================
// VIEW TOGGLE
// =====================================================

interface ViewToggleProps {
  readonly viewMode: ViewMode
  readonly onChange: (mode: ViewMode) => void
}

function ViewToggle({ viewMode, onChange }: ViewToggleProps) {
  return (
    <div className="cabify-view-toggle">
      <span>Vista:</span>
      <ToggleButton
        mode="list"
        icon={<List size={18} />}
        label="Lista"
        isActive={viewMode === 'list'}
        onClick={() => onChange('list')}
      />
      <ToggleButton
        mode="chart"
        icon={<BarChart3 size={18} />}
        label="Gráfico"
        isActive={viewMode === 'chart'}
        onClick={() => onChange('chart')}
      />
    </div>
  )
}

interface ToggleButtonProps {
  readonly mode: ViewMode
  readonly icon: React.ReactNode
  readonly label: string
  readonly isActive: boolean
  readonly onClick: () => void
}

function ToggleButton({ icon, label, isActive, onClick }: ToggleButtonProps) {
  const className = `cabify-toggle-btn${isActive ? ' active' : ''}`

  return (
    <button className={className} onClick={onClick} title={`Vista ${label}`}>
      {icon}
      {label}
    </button>
  )
}

// =====================================================
// TOP CARD
// =====================================================

interface TopCardProps {
  readonly type: 'mejores' | 'peores'
  readonly title: string
  readonly drivers: readonly CabifyDriver[]
  readonly chartData: readonly ChartDataPoint[]
  readonly viewMode: ViewMode
  readonly isExpanded: boolean
  readonly asignaciones: Map<string, AsignacionActiva>
  readonly onToggle: () => void
}

function TopCard({
  type,
  title,
  drivers,
  chartData,
  viewMode,
  isExpanded,
  asignaciones,
  onToggle,
}: TopCardProps) {
  const ChevronIcon = isExpanded ? ChevronUp : ChevronDown

  return (
    <div className={`cabify-accordion-card ${type}`}>
      <div className={`cabify-accordion-header ${type}`} onClick={onToggle}>
        <h3 className="cabify-accordion-title">{title}</h3>
        <ChevronIcon size={20} />
      </div>
      {isExpanded && (
        <div className="cabify-accordion-content">
          {viewMode === 'list' ? (
            <DriverList
              drivers={drivers}
              type={type}
              asignaciones={asignaciones}
            />
          ) : (
            <DriverChart chartData={chartData} type={type} />
          )}
        </div>
      )}
    </div>
  )
}

// =====================================================
// DRIVER LIST
// =====================================================

interface DriverListProps {
  readonly drivers: readonly CabifyDriver[]
  readonly type: 'mejores' | 'peores'
  readonly asignaciones: Map<string, AsignacionActiva>
}

function DriverList({ drivers, type, asignaciones }: DriverListProps) {
  if (drivers.length === 0) {
    return <div className="cabify-top-empty">{UI_TEXT.NO_ASSIGNMENT}</div>
  }

  return (
    <div className="cabify-top-list">
      {drivers.map((driver, index) => (
        <DriverListItem
          key={driver.id}
          driver={driver}
          rank={index + 1}
          type={type}
          asignaciones={asignaciones}
        />
      ))}
    </div>
  )
}

interface DriverListItemProps {
  readonly driver: CabifyDriver
  readonly rank: number
  readonly type: 'mejores' | 'peores'
  readonly asignaciones: Map<string, AsignacionActiva>
}

function DriverListItem({
  driver,
  rank,
  type,
  asignaciones,
}: DriverListItemProps) {
  const asig = driver.nationalIdNumber
    ? asignaciones.get(driver.nationalIdNumber)
    : null
  const patente = getDriverPatente(driver, asignaciones)

  return (
    <div className="cabify-top-item">
      <div className="cabify-top-rank">#{rank}</div>
      <div className="cabify-top-info">
        <div className="cabify-top-name">
          {driver.name} {driver.surname}
        </div>
        <div className="cabify-top-details">
          {patente} • {driver.viajesFinalizados || 0} viajes • Score{' '}
          {driver.score?.toFixed(2) || '-'}
        </div>
      </div>
      <div className="cabify-top-stats">
        {asig && <ModalidadBadge horario={asig.horario} />}
        <span className={`cabify-top-amount ${type}`}>
          ${formatCurrency(driver.gananciaTotal)}
        </span>
      </div>
    </div>
  )
}

interface ModalidadBadgeProps {
  readonly horario: 'TURNO' | 'CARGO' | null
}

function ModalidadBadge({ horario }: ModalidadBadgeProps) {
  const isCargo = horario === 'CARGO'
  const className = `cabify-top-badge ${isCargo ? 'cargo' : 'turno'}`
  const label = isCargo ? 'A cargo' : 'Turno'

  return <span className={className}>{label}</span>
}

// =====================================================
// DRIVER CHART
// =====================================================

interface DriverChartProps {
  readonly chartData: readonly ChartDataPoint[]
  readonly type: 'mejores' | 'peores'
}

function DriverChart({ chartData, type }: DriverChartProps) {
  const colors = type === 'mejores' ? CHART_COLORS.MEJORES : CHART_COLORS.PEORES

  // Convertir a formato compatible con Recharts (evita errores de readonly)
  const mutableChartData = chartData.map(d => ({
    name: d.name,
    value: d.value,
    fullName: d.fullName,
  })) as Array<{ name: string; value: number; fullName: string; [key: string]: unknown }>

  return (
    <div className="cabify-chart-wrapper">
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={mutableChartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
            dataKey="value"
            label={({ name, percent }) => `${name ?? ''}: ${((percent ?? 0) * 100).toFixed(0)}%`}
          >
            {mutableChartData.map((_, index) => (
              <Cell
                key={`cell-${type}-${index}`}
                fill={colors[index % colors.length]}
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number, _name: string, props: { payload?: { fullName?: string } }) =>
              [`$${formatCurrency(value)}`, props.payload?.fullName ?? '']
            }
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
