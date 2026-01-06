// src/modules/integraciones/uss/bitacora/components/BitacoraHeader.tsx
import { useState } from 'react'
import { Radio } from 'lucide-react'
import type { BitacoraDateRange } from '../types/bitacora.types'
import { BITACORA_CONSTANTS } from '../constants/bitacora.constants'

interface BitacoraHeaderProps {
  dateRange: BitacoraDateRange
  onDateRangePreset: (preset: string) => void
  onCustomDateRange: (startDate: string, endDate: string) => void
  isLoading: boolean
  lastUpdate: Date | null
}

export function BitacoraHeader({
  dateRange,
  onDateRangePreset,
  onCustomDateRange,
  isLoading,
  lastUpdate,
}: BitacoraHeaderProps) {
  const [showCustomRange, setShowCustomRange] = useState(false)
  const [customStart, setCustomStart] = useState(dateRange.startDate)
  const [customEnd, setCustomEnd] = useState(dateRange.endDate)

  const handlePresetChange = (preset: string) => {
    if (preset === 'custom') {
      setShowCustomRange(true)
    } else {
      setShowCustomRange(false)
      onDateRangePreset(preset)
    }
  }

  const handleApplyCustomRange = () => {
    onCustomDateRange(customStart, customEnd)
    setShowCustomRange(false)
  }

  const formatLastUpdate = (date: Date | null) => {
    if (!date) return 'Nunca'
    return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  }

  const isRealtime = dateRange.label === 'Hoy'

  return (
    <div className="bitacora-header">
      <div className="header-controls">
        {/* Filtros de fecha */}
        <div className="date-range-selector">
          <span className="filter-label">Período:</span>
          <div className="date-presets">
            {BITACORA_CONSTANTS.DATE_RANGES.map((range) => (
              <button
                key={range.value}
                className={`preset-btn ${dateRange.label === range.label ? 'active' : ''}`}
                onClick={() => handlePresetChange(range.value)}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>

        {/* Rango personalizado */}
        {showCustomRange && (
          <div className="custom-range">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="date-input"
            />
            <span className="range-separator">a</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="date-input"
            />
            <button className="btn-apply" onClick={handleApplyCustomRange}>
              Aplicar
            </button>
          </div>
        )}

        {/* Metadata y estado */}
        <div className="header-right">
          <div className="header-meta">
            <span className="current-date">{dateRange.startDate === dateRange.endDate ? dateRange.startDate : `${dateRange.startDate} - ${dateRange.endDate}`}</span>
            <span className="last-update">
              Última actualización: {formatLastUpdate(lastUpdate)}
              {isLoading && <span className="loading-indicator"> (cargando...)</span>}
            </span>
          </div>
          {isRealtime && (
            <div className="realtime-indicator">
              <Radio size={14} className="pulse-icon" />
              <span>Tiempo real</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
