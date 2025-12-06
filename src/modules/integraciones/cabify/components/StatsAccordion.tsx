// src/modules/integraciones/cabify/components/StatsAccordion.tsx
/**
 * Componente de estadísticas con acordeón
 * Principio: Single Responsibility - Solo estadísticas
 */

import { ChevronDown, ChevronUp } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import type { DriverStatistics } from '../types/cabify.types'
import { formatCurrency } from '../utils/cabify.utils'
import { STATS_LABELS } from '../constants/cabify.constants'

// =====================================================
// TIPOS
// =====================================================

interface StatsAccordionProps {
  readonly estadisticas: DriverStatistics
  readonly isExpanded: boolean
  readonly onToggle: () => void
}

// =====================================================
// COMPONENTE PRINCIPAL
// =====================================================

export function StatsAccordion({
  estadisticas,
  isExpanded,
  onToggle,
}: StatsAccordionProps) {
  return (
    <div className="cabify-accordion-card estadisticas">
      <AccordionHeader isExpanded={isExpanded} onToggle={onToggle} />
      {isExpanded && <AccordionContent estadisticas={estadisticas} />}
    </div>
  )
}

// =====================================================
// SUBCOMPONENTES
// =====================================================

interface AccordionHeaderProps {
  readonly isExpanded: boolean
  readonly onToggle: () => void
}

function AccordionHeader({ isExpanded, onToggle }: AccordionHeaderProps) {
  const ChevronIcon = isExpanded ? ChevronUp : ChevronDown

  return (
    <div className="cabify-accordion-header" onClick={onToggle}>
      <h3 className="cabify-accordion-title">
        Estadísticas de Conductores con Asignación
      </h3>
      <ChevronIcon size={20} />
    </div>
  )
}

interface AccordionContentProps {
  readonly estadisticas: DriverStatistics
}

function AccordionContent({ estadisticas }: AccordionContentProps) {
  return (
    <div className="cabify-accordion-content">
      <StatsGrid estadisticas={estadisticas} />
      {estadisticas.distribucionModalidad.length > 0 && (
        <ModalidadChart estadisticas={estadisticas} />
      )}
    </div>
  )
}

interface StatsGridProps {
  readonly estadisticas: DriverStatistics
}

function StatsGrid({ estadisticas }: StatsGridProps) {
  return (
    <div className="cabify-stats-grid">
      <StatCard
        value={estadisticas.totalConductores}
        label={STATS_LABELS.ACTIVE_DRIVERS}
      />
      <StatCard
        value={`$${formatCurrency(estadisticas.totalRecaudado)}`}
        label={STATS_LABELS.TOTAL_REVENUE}
        highlighted
      />
      <StatCard
        value={`$${formatCurrency(estadisticas.promedioRecaudacion)}`}
        label={STATS_LABELS.AVG_REVENUE}
      />
      <StatCard
        value={estadisticas.totalViajes.toLocaleString('es-AR')}
        label={STATS_LABELS.TOTAL_TRIPS}
      />
      <StatCard
        value={estadisticas.promedioViajes.toFixed(1)}
        label={STATS_LABELS.AVG_TRIPS}
      />
    </div>
  )
}

interface StatCardProps {
  readonly value: string | number
  readonly label: string
  readonly highlighted?: boolean
}

function StatCard({ value, label, highlighted = false }: StatCardProps) {
  const className = `cabify-stat-card${highlighted ? ' highlight-green' : ''}`

  return (
    <div className={className}>
      <div className="cabify-stat-value">{value}</div>
      <div className="cabify-stat-label">{label}</div>
    </div>
  )
}

interface ModalidadChartProps {
  readonly estadisticas: DriverStatistics
}

function ModalidadChart({ estadisticas }: ModalidadChartProps) {
  const { distribucionModalidad, conductoresCargo, conductoresTurno } = estadisticas

  // Convertir a formato compatible con Recharts (evita errores de readonly)
  const chartData = distribucionModalidad.map(d => ({
    name: d.name,
    value: d.value,
    color: d.color,
  })) as Array<{ name: string; value: number; color: string; [key: string]: unknown }>

  return (
    <div className="cabify-chart-section">
      <h4 className="cabify-chart-title">{STATS_LABELS.MODALIDAD_DISTRIBUTION}</h4>
      <div className="cabify-chart-container">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={5}
              dataKey="value"
              label={({ name, percent }) => `${name ?? ''}: ${((percent ?? 0) * 100).toFixed(0)}%`}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip formatter={(value: number) => [`${value} conductores`, 'Cantidad']} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
        <ModalidadLegend cargo={conductoresCargo} turno={conductoresTurno} />
      </div>
    </div>
  )
}

interface ModalidadLegendProps {
  readonly cargo: number
  readonly turno: number
}

function ModalidadLegend({ cargo, turno }: ModalidadLegendProps) {
  return (
    <div className="cabify-modalidad-legend">
      <div className="cabify-modalidad-item">
        <span className="cabify-modalidad-dot cargo" />
        <span>A Cargo: {cargo}</span>
      </div>
      <div className="cabify-modalidad-item">
        <span className="cabify-modalidad-dot turno" />
        <span>Turno: {turno}</span>
      </div>
    </div>
  )
}
