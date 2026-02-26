// src/modules/integraciones/cabify/components/StatsAccordion.tsx
/**
 * Stat cards para el modulo Cabify
 * Patron estandar: stat-card con icono + valor + label
 */

import { Users, DollarSign, TrendingUp, Car, BarChart3 } from 'lucide-react'
import type { DriverStatistics } from '../types/cabify.types'
import { formatCurrency } from '../utils/cabify.utils'
import { STATS_LABELS } from '../constants/cabify.constants'

// =====================================================
// TIPOS
// =====================================================

interface StatsAccordionProps {
  readonly estadisticas: DriverStatistics
}

// =====================================================
// COMPONENTE PRINCIPAL
// =====================================================

export function StatsAccordion({ estadisticas }: StatsAccordionProps) {
  return (
    <div className="cabify-stats">
      <div className="cabify-stats-grid">
        <div className="stat-card">
          <Users size={18} className="stat-icon" />
          <div className="stat-content">
            <span className="stat-value">{estadisticas.totalConductores}</span>
            <span className="stat-label">{STATS_LABELS.ACTIVE_DRIVERS}</span>
          </div>
        </div>
        <div className="stat-card">
          <DollarSign size={18} className="stat-icon" />
          <div className="stat-content">
            <span className="stat-value">${formatCurrency(estadisticas.totalRecaudado)}</span>
            <span className="stat-label">{STATS_LABELS.TOTAL_REVENUE}</span>
          </div>
        </div>
        <div className="stat-card">
          <TrendingUp size={18} className="stat-icon" />
          <div className="stat-content">
            <span className="stat-value">${formatCurrency(estadisticas.promedioRecaudacion)}</span>
            <span className="stat-label">{STATS_LABELS.AVG_REVENUE}</span>
          </div>
        </div>
        <div className="stat-card">
          <Car size={18} className="stat-icon" />
          <div className="stat-content">
            <span className="stat-value">{estadisticas.totalViajes.toLocaleString('es-AR')}</span>
            <span className="stat-label">{STATS_LABELS.TOTAL_TRIPS}</span>
          </div>
        </div>
        <div className="stat-card">
          <BarChart3 size={18} className="stat-icon" />
          <div className="stat-content">
            <span className="stat-value">{estadisticas.promedioViajes.toFixed(1)}</span>
            <span className="stat-label">{STATS_LABELS.AVG_TRIPS}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
