// src/modules/integraciones/cabify/components/TopDriversSection.tsx
/**
 * Componente de sección Top 10 conductores
 * Usa datos del histórico de Cabify (sincronizado cada 5 min)
 */

import { useState } from 'react'
import { ChevronDown, ChevronUp, ChevronRight } from 'lucide-react'
import type { CabifyRankingDriver } from '../../../../services/cabifyIntegrationService'
import type { AccordionState } from '../types/cabify.types'
import { formatCurrency } from '../utils/cabify.utils'
import { UI_TEXT } from '../constants/cabify.constants'

// =====================================================
// TIPOS
// =====================================================

interface TopDriversSectionProps {
  readonly topMejores: readonly CabifyRankingDriver[]
  readonly topPeores: readonly CabifyRankingDriver[]
  readonly accordionState: AccordionState
  readonly onToggleAccordion: (key: 'mejores' | 'peores') => void
}

// =====================================================
// COMPONENTE PRINCIPAL
// =====================================================

export function TopDriversSection({
  topMejores,
  topPeores,
  accordionState,
  onToggleAccordion,
}: TopDriversSectionProps) {
  const hasDrivers = topMejores.length > 0 || topPeores.length > 0

  if (!hasDrivers) return null

  return (
    <div className="cabify-tops-container">
      <TopCard
        type="mejores"
        title="Top 10 Mejores Conductores"
        drivers={topMejores}
        isExpanded={accordionState.mejores}
        onToggle={() => onToggleAccordion('mejores')}
      />
      <TopCard
        type="peores"
        title="10 Conductores con Menor Rendimiento"
        drivers={topPeores}
        isExpanded={accordionState.peores}
        onToggle={() => onToggleAccordion('peores')}
      />
    </div>
  )
}

// =====================================================
// TOP CARD
// =====================================================

interface TopCardProps {
  readonly type: 'mejores' | 'peores'
  readonly title: string
  readonly drivers: readonly CabifyRankingDriver[]
  readonly isExpanded: boolean
  readonly onToggle: () => void
}

function TopCard({
  type,
  title,
  drivers,
  isExpanded,
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
          <DriverList drivers={drivers} type={type} />
        </div>
      )}
    </div>
  )
}

// =====================================================
// DRIVER LIST
// =====================================================

interface DriverListProps {
  readonly drivers: readonly CabifyRankingDriver[]
  readonly type: 'mejores' | 'peores'
}

function DriverList({ drivers, type }: DriverListProps) {
  const [expandedDni, setExpandedDni] = useState<string | null>(null)

  if (drivers.length === 0) {
    return <div className="cabify-top-empty">{UI_TEXT.NO_ASSIGNMENT}</div>
  }

  const handleToggle = (dni: string) => {
    setExpandedDni(prev => prev === dni ? null : dni)
  }

  return (
    <div className="cabify-top-list">
      {drivers.map((driver, index) => (
        <DriverListItem
          key={driver.dni}
          driver={driver}
          rank={index + 1}
          type={type}
          isExpanded={expandedDni === driver.dni}
          onToggle={() => handleToggle(driver.dni)}
        />
      ))}
    </div>
  )
}

interface DriverListItemProps {
  readonly driver: CabifyRankingDriver
  readonly rank: number
  readonly type: 'mejores' | 'peores'
  readonly isExpanded: boolean
  readonly onToggle: () => void
}

function DriverListItem({ driver, rank, type, isExpanded, onToggle }: DriverListItemProps) {
  return (
    <div className={`cabify-top-item-wrapper ${isExpanded ? 'expanded' : ''}`}>
      <div className="cabify-top-item" onClick={onToggle}>
        <div className="cabify-top-expand-icon">
          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
        <div className="cabify-top-rank">#{rank}</div>
        <div className="cabify-top-info">
          <div className="cabify-top-name">{driver.nombreCompleto}</div>
          <div className="cabify-top-details">
            {driver.viajesFinalizados} viajes
          </div>
        </div>
        <div className="cabify-top-stats">
          {driver.horario && <ModalidadBadge horario={driver.horario} />}
          <span className={`cabify-top-amount ${type}`}>
            ${formatCurrency(driver.gananciaTotal)}
          </span>
        </div>
      </div>

      {isExpanded && (
        <div className="cabify-top-expanded">
          <div className="cabify-top-expanded-grid">
            <div className="cabify-top-expanded-item">
              <span className="label">Horas Conectadas</span>
              <span className="value">{driver.horasConectadas?.toFixed(1) || '0'} hs</span>
            </div>
            <div className="cabify-top-expanded-item">
              <span className="label">Ganancia/Hora</span>
              <span className="value">${formatCurrency(driver.gananciaPorHora || 0)}</span>
            </div>
            <div className="cabify-top-expanded-item">
              <span className="label">DNI</span>
              <span className="value">{driver.dni}</span>
            </div>
            <div className="cabify-top-expanded-item">
              <span className="label">Ganancia Total</span>
              <span className="value highlight">${formatCurrency(driver.gananciaTotal)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface ModalidadBadgeProps {
  readonly horario: 'CARGO' | 'Diurno' | 'Nocturno'
}

function ModalidadBadge({ horario }: ModalidadBadgeProps) {
  const getBadgeConfig = () => {
    switch (horario) {
      case 'CARGO':
        return { className: 'cargo', label: 'A cargo' }
      case 'Diurno':
        return { className: 'turno diurno', label: 'Diurno' }
      case 'Nocturno':
        return { className: 'turno nocturno', label: 'Nocturno' }
      default:
        return { className: 'turno', label: horario }
    }
  }

  const { className, label } = getBadgeConfig()
  return <span className={`cabify-top-badge ${className}`}>{label}</span>
}
