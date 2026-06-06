// src/modules/integraciones/uss/components/USSHeader.tsx
/**
 * Header del módulo USS con controles de fecha y indicador de tiempo real
 */

import { useMemo } from 'react'
import { Radio } from 'lucide-react'
import { DateRangeSelector } from '../../../../components/ui/DateRangeSelector'
import type { DateRange as SharedDateRange } from '../../../../components/ui/DateRangeSelector'
import type { DateRange } from '../types/uss.types'

interface USSHeaderProps {
  readonly lastUpdate: Date | null
  readonly isLoading: boolean
  readonly dateRange: DateRange
  readonly onDateRangeChange: (range: DateRange) => void
  readonly isRealtime: boolean
}

export function USSHeader({
  lastUpdate,
  isLoading,
  dateRange,
  onDateRangeChange,
  isRealtime,
}: USSHeaderProps) {
  const selectedRange: SharedDateRange = useMemo(() => ({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    label: dateRange.label,
    type: dateRange.startDate === dateRange.endDate
      ? 'day'
      : dateRange.label.startsWith('Año')
        ? 'year'
        : 'week',
  }), [dateRange])

  const formatLastUpdate = (date: Date | null) => {
    if (!date) return 'Nunca'
    return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  }

  const handleRangeChange = (range: SharedDateRange) => {
    onDateRangeChange({
      startDate: range.startDate,
      endDate: range.endDate,
      label: range.label,
    })
  }

  return (
    <div className="uss-controls uss-speed-controls">
      <DateRangeSelector
        selectedRange={selectedRange}
        onRangeChange={handleRangeChange}
        disabled={isLoading}
        showAllOption={false}
        placeholder="Seleccionar fecha"
        weekOnly
      />

      <div className="uss-status">
        <span className="uss-last-update">
          Actualizado: {formatLastUpdate(lastUpdate)}
          {isLoading && <span className="uss-loading"> (cargando...)</span>}
        </span>
        {isRealtime && (
          <div className="uss-realtime-indicator">
            <Radio size={14} className="pulse-icon" />
            <span>Tiempo real</span>
          </div>
        )}
      </div>
    </div>
  )
}
