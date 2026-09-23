// src/modules/integraciones/cabify/components/CabifyHeader.tsx
/**
 * Componente Header de Cabify
 * Principio: Single Responsibility - Solo UI de encabezado
 */

import { HelpCircle } from 'lucide-react'
import type { WeekOption } from '../types/cabify.types'
import { formatDateTimeAR } from '../../../../utils/dateUtils'
import { WeekCalendarSelector } from './WeekCalendarSelector'

// =====================================================
// TEXTOS
// =====================================================

/**
 * Resumen de la regla que aplica el RPA py-cabify-efectivo, que corre dos veces
 * por semana y compara lo cobrado por app contra alquiler + garantia del periodo.
 */
const AYUDA_EFECTIVO = [
  'Desactivación automática — sábados 06:00',
  'Si de lunes a sábado lo cobrado por app no cubre el alquiler + garantía de la semana, se desactiva el efectivo.',
  '',
  'Activación automática — lunes 06:00',
  'Si en la semana anterior lo cobrado por app cubrió el alquiler + garantía, se reactiva.',
  '',
  'También puede activarse o desactivarse manualmente desde Facturación.',
].join('\n')

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
  readonly onWeekChange: (week: WeekOption) => void
}

// =====================================================
// COMPONENTE
// =====================================================

export function CabifyHeader({
  lastUpdate,
  isLoading,
  availableWeeks,
  selectedWeek,
  onWeekChange,
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
        <span
          className="cabify-help-icon"
          data-tooltip={AYUDA_EFECTIVO}
          role="img"
          aria-label={AYUDA_EFECTIVO}
          tabIndex={0}
        >
          <HelpCircle size={14} />
          <span>Desactivación Efectivo</span>
        </span>
        {isLoading && (
          <div className="cabify-loading-indicator">
            <div className="dt-loading-spinner" style={{ width: 16, height: 16 }} />
            <span>Sincronizando...</span>
          </div>
        )}
      </div>
      {lastUpdate && (
        <span className="cabify-last-update-compact">
          Última sync: {formatDateTimeAR(lastUpdate)}
        </span>
      )}
    </div>
  )
}


