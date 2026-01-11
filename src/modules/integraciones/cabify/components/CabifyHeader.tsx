// src/modules/integraciones/cabify/components/CabifyHeader.tsx
/**
 * Componente Header de Cabify
 * Principio: Single Responsibility - Solo UI de encabezado
 */

import { Radio } from 'lucide-react'
import type { WeekOption } from '../types/cabify.types'
import { formatDateTimeAR } from '../../../../utils/dateUtils'
import { WeekCalendarSelector } from './WeekCalendarSelector'

// =====================================================
// TIPOS
// =====================================================

export interface DateRange {
  readonly startDate: string
  readonly endDate: string
}

interface CabifyHeaderProps {
  readonly lastUpdate: Date | null
  readonly isLoading: boolean
  readonly availableWeeks: readonly WeekOption[]
  readonly selectedWeek: WeekOption | null
  readonly customDateRange: DateRange | null
  readonly onWeekChange: (week: WeekOption) => void
  readonly onCustomDateChange: (range: DateRange) => void
}

// =====================================================
// COMPONENTE
// =====================================================

export function CabifyHeader({
  lastUpdate,
  isLoading,
  availableWeeks,
  selectedWeek,
  customDateRange,
  onWeekChange,
  onCustomDateChange,
}: CabifyHeaderProps) {
  const isDisabled = isLoading || availableWeeks.length === 0

  return (
    <div className="cabify-header cabify-header-compact">
      <div className="cabify-controls">
        <WeekCalendarSelector
          selectedWeek={selectedWeek}
          availableWeeks={availableWeeks}
          isDisabled={isDisabled}
          onWeekChange={onWeekChange}
        />
        {isLoading && (
          <div className="cabify-loading-indicator">
            <div className="dt-loading-spinner" style={{ width: 16, height: 16 }} />
            <span>Sincronizando...</span>
          </div>
        )}
        {!isLoading && (
          <div className="cabify-realtime-indicator">
            <Radio size={14} className="pulse-icon" />
            <span>Tiempo real</span>
          </div>
        )}
      </div>
      {lastUpdate && (
        <span className="cabify-last-update-compact">
          Última actualización: {formatDateTimeAR(lastUpdate)}
        </span>
      )}
    </div>
  )
}


