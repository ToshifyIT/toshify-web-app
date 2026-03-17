// src/modules/integraciones/uss/bitacora/components/BitacoraHeader.tsx
import { useMemo } from 'react'
import { Radio } from 'lucide-react'
import { DateRangeSelector } from '../../../../../components/ui/DateRangeSelector'
import type { DateRange, DateRangeShortcut } from '../../../../../components/ui/DateRangeSelector'
import type { BitacoraDateRange } from '../types/bitacora.types'

interface BitacoraHeaderProps {
  dateRange: BitacoraDateRange
  onDateRangePreset: (preset: string) => void
  onCustomDateRange: (startDate: string, endDate: string, label?: string) => void
  isLoading: boolean
  lastUpdate?: Date | null
  weekOnly?: boolean
}

// Helpers de fecha en zona Argentina
const TIMEZONE_ARGENTINA = 'America/Argentina/Buenos_Aires'

function toArgentinaDateString(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: TIMEZONE_ARGENTINA })
}

export function BitacoraHeader({
  dateRange,
  onDateRangePreset,
  onCustomDateRange,
  isLoading,
  weekOnly = false,
}: BitacoraHeaderProps) {

  const isRealtime = dateRange.label === 'Hoy'

  // Convertir BitacoraDateRange a DateRange del componente compartido
  const selectedRange: DateRange = useMemo(() => ({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    label: dateRange.label,
    type: dateRange.startDate === dateRange.endDate ? 'day' : 'week',
  }), [dateRange])

  // Atajos extra: Hoy y Ayer solo para Marcaciones, no para Histórico
  const extraShortcuts: DateRangeShortcut[] = useMemo(() => {
    if (weekOnly) return []
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
  }, [weekOnly])

  // Manejar cambio de rango desde el DateRangeSelector compartido
  const handleRangeChange = (range: DateRange) => {
    // Mapear a los presets del hook si coinciden
    if (range.label === 'Hoy') {
      onDateRangePreset('today')
    } else if (range.label === 'Ayer') {
      onDateRangePreset('yesterday')
    } else {
      // Cualquier otro rango (semana, dia del calendario, etc.) → custom con label
      onCustomDateRange(range.startDate, range.endDate, range.label)
    }
  }

  return (
    <div className="uss-controls">
      <DateRangeSelector
        selectedRange={selectedRange}
        onRangeChange={handleRangeChange}
        disabled={isLoading}
        showAllOption={false}
        placeholder="Seleccionar fecha"
        extraShortcuts={extraShortcuts}
        weekOnly={weekOnly}
      />

      <div className="uss-status">
        {isLoading && (
          <span className="uss-last-update">
            <span className="uss-loading">Cargando...</span>
          </span>
        )}
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
