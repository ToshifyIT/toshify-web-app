// src/modules/integraciones/uss/bitacora/components/BitacoraHeader.tsx
import { useState, useRef, useEffect } from 'react'
import { Calendar, ChevronDown, Radio } from 'lucide-react'
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
  const formatLastUpdate = (date: Date | null) => {
    if (!date) return 'Nunca'
    return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  }

  const isRealtime = dateRange.label === 'Hoy'

  return (
    <div className="uss-controls">
      <DateRangeSelector
        dateRange={dateRange}
        isLoading={isLoading}
        onPresetChange={onDateRangePreset}
        onCustomChange={onCustomDateRange}
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

interface DateRangeSelectorProps {
  readonly dateRange: BitacoraDateRange
  readonly isLoading: boolean
  readonly onPresetChange: (preset: string) => void
  readonly onCustomChange: (startDate: string, endDate: string) => void
}

function DateRangeSelector({ dateRange, isLoading, onPresetChange, onCustomChange }: DateRangeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [customMode, setCustomMode] = useState(false)
  const [customStart, setCustomStart] = useState(dateRange.startDate)
  const [customEnd, setCustomEnd] = useState(dateRange.endDate)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handlePresetClick = (preset: typeof BITACORA_CONSTANTS.DATE_RANGES[number]) => {
    if (preset.value === 'custom') {
      setCustomMode(true)
      setCustomStart(dateRange.startDate)
      setCustomEnd(dateRange.endDate)
    } else {
      onPresetChange(preset.value)
      setIsOpen(false)
      setCustomMode(false)
    }
  }

  const handleApplyCustom = () => {
    onCustomChange(customStart, customEnd)
    setIsOpen(false)
    setCustomMode(false)
  }

  return (
    <div className="uss-date-picker" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className="uss-date-picker-btn"
      >
        <Calendar size={16} />
        <span>{dateRange.label}</span>
        <ChevronDown size={14} className={isOpen ? 'rotate' : ''} />
      </button>

      {isOpen && (
        <div className="uss-date-dropdown">
          <div className="uss-date-presets">
            {BITACORA_CONSTANTS.DATE_RANGES.filter(r => r.value !== 'custom').map((preset) => (
              <button
                key={preset.value}
                onClick={() => handlePresetClick(preset)}
                className={dateRange.label === preset.label ? 'active' : ''}
              >
                {preset.label}
              </button>
            ))}
            <button
              onClick={() => handlePresetClick({ value: 'custom', label: 'Personalizado' })}
              className={customMode || dateRange.label === 'Personalizado' ? 'active' : ''}
            >
              Personalizado
            </button>
          </div>

          {customMode && (
            <div className="uss-date-custom">
              <div className="uss-date-row">
                <label>Desde:</label>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="uss-date-input"
                />
              </div>
              <div className="uss-date-row">
                <label>Hasta:</label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="uss-date-input"
                />
              </div>
              <button
                className="uss-date-apply-btn"
                onClick={handleApplyCustom}
              >
                Aplicar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
