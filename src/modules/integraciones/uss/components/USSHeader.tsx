// src/modules/integraciones/uss/components/USSHeader.tsx
/**
 * Header del módulo USS con controles de fecha y indicador de tiempo real
 */

import { useMemo } from 'react'
import { Radio } from 'lucide-react'
import { DateRangeSelector } from '../../../../components/ui/DateRangeSelector'
import type { DateRange as SharedDateRange, DateRangeShortcut } from '../../../../components/ui/DateRangeSelector'
import type { DateRange } from '../types/uss.types'

interface USSHeaderProps {
  readonly lastUpdate: Date | null
  readonly isLoading: boolean
  readonly dateRange: DateRange
  readonly onDateRangeChange: (range: DateRange) => void
  readonly isRealtime: boolean
}

const TIMEZONE_ARGENTINA = 'America/Argentina/Buenos_Aires'

function toArgentinaDateString(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: TIMEZONE_ARGENTINA })
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

  const extraShortcuts: DateRangeShortcut[] = useMemo(() => {
    const today = toArgentinaDateString(new Date())
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = toArgentinaDateString(yesterday)

    return [
      {
        id: 'today',
        label: 'Hoy',
        range: { startDate: today, endDate: today, label: 'Hoy', type: 'day' },
      },
      {
        id: 'yesterday',
        label: 'Ayer',
        range: { startDate: yesterdayStr, endDate: yesterdayStr, label: 'Ayer', type: 'day' },
      },
    ]
  }, [])

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
        extraShortcuts={extraShortcuts}
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
