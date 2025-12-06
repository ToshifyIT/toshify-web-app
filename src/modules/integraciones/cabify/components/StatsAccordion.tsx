// src/modules/integraciones/cabify/components/StatsAccordion.tsx
/**
 * Componente de estadísticas con acordeón
 * Principio: Single Responsibility - Solo estadísticas
 */

import { ChevronDown, ChevronUp } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
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
  const total = conductoresCargo + conductoresTurno

  // Convertir a formato compatible con Recharts (evita errores de readonly)
  const chartData = distribucionModalidad.map(d => ({
    name: d.name,
    value: d.value,
    color: d.color,
  })) as Array<{ name: string; value: number; color: string; [key: string]: unknown }>

  // Calcular porcentajes
  const pctCargo = total > 0 ? ((conductoresCargo / total) * 100).toFixed(0) : '0'
  const pctTurno = total > 0 ? ((conductoresTurno / total) * 100).toFixed(0) : '0'

  return (
    <div className="cabify-chart-section">
      <h4 className="cabify-chart-title">{STATS_LABELS.MODALIDAD_DISTRIBUTION}</h4>
      <div className="cabify-chart-container">
        <ResponsiveContainer width={180} height={180}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={45}
              outerRadius={70}
              paddingAngle={3}
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip formatter={(value: number) => [`${value} conductores`, 'Cantidad']} />
          </PieChart>
        </ResponsiveContainer>
        <ModalidadLegend
          cargo={conductoresCargo}
          turno={conductoresTurno}
          pctCargo={pctCargo}
          pctTurno={pctTurno}
        />
      </div>
    </div>
  )
}

interface ModalidadLegendProps {
  readonly cargo: number
  readonly turno: number
  readonly pctCargo: string
  readonly pctTurno: string
}

function ModalidadLegend({ cargo, turno, pctCargo, pctTurno }: ModalidadLegendProps) {
  return (
    <div className="cabify-modalidad-legend">
      <div className="cabify-modalidad-item">
        <span className="cabify-modalidad-dot cargo" />
        <div className="cabify-modalidad-info">
          <span className="cabify-modalidad-label">A Cargo</span>
          <span className="cabify-modalidad-value">{cargo} ({pctCargo}%)</span>
        </div>
      </div>
      <div className="cabify-modalidad-item">
        <span className="cabify-modalidad-dot turno" />
        <div className="cabify-modalidad-info">
          <span className="cabify-modalidad-label">Turno</span>
          <span className="cabify-modalidad-value">{turno} ({pctTurno}%)</span>
        </div>
      </div>
    </div>
  )
}
