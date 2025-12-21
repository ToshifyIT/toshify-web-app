// src/modules/integraciones/uss/components/USSHeader.tsx
/**
 * Header del módulo USS con controles de fecha
 */

import { useState, useRef, useEffect } from 'react'
import { RefreshCw, Calendar, ChevronDown } from 'lucide-react'
import type { DateRange } from '../types/uss.types'
import { DATE_RANGES } from '../constants/uss.constants'

interface USSHeaderProps {
  readonly lastUpdate: Date | null
  readonly isLoading: boolean
  readonly dateRange: DateRange
  readonly onDateRangeChange: (range: DateRange) => void
  readonly onRefresh: () => void
}

export function USSHeader({
  lastUpdate,
  isLoading,
  dateRange,
  onDateRangeChange,
  onRefresh,
}: USSHeaderProps) {
  return (
    <div className="uss-header">
      <div className="uss-header-title">
        <h1>Excesos de Velocidad</h1>
        <span className="uss-header-subtitle">
          Monitoreo de infracciones de velocidad desde USS/Wialon
          {lastUpdate && (
            <span className="uss-last-update">
              {' '}• Última consulta: {lastUpdate.toLocaleString('es-AR')}
            </span>
          )}
        </span>
      </div>

      <div className="uss-controls">
        <DateRangeSelector
          dateRange={dateRange}
          isLoading={isLoading}
          onChange={onDateRangeChange}
        />

        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="btn-primary uss-refresh-btn"
        >
          <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
          {isLoading ? 'Cargando...' : 'Actualizar'}
        </button>
      </div>
    </div>
  )
}

interface DateRangeSelectorProps {
  readonly dateRange: DateRange
  readonly isLoading: boolean
  readonly onChange: (range: DateRange) => void
}

function DateRangeSelector({ dateRange, isLoading, onChange }: DateRangeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [customMode, setCustomMode] = useState(false)
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

  const handlePresetClick = (preset: typeof DATE_RANGES[number]) => {
    const today = new Date()
    let startDate: Date
    let endDate = new Date(today)

    switch (preset.label) {
      case 'Hoy':
        startDate = new Date(today)
        break
      case 'Ayer':
        startDate = new Date(today)
        startDate.setDate(startDate.getDate() - 1)
        endDate = new Date(startDate)
        break
      case 'Última semana':
        startDate = new Date(today)
        startDate.setDate(startDate.getDate() - 7)
        break
      case 'Últimos 30 días':
        startDate = new Date(today)
        startDate.setDate(startDate.getDate() - 30)
        break
      default:
        startDate = new Date(today)
    }

    onChange({
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      label: preset.label,
    })
    setIsOpen(false)
    setCustomMode(false)
  }

  const handleCustomDateChange = (field: 'startDate' | 'endDate', value: string) => {
    onChange({
      ...dateRange,
      [field]: value,
      label: 'Personalizado',
    })
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
            {DATE_RANGES.map((preset) => (
              <button
                key={preset.label}
                onClick={() => handlePresetClick(preset)}
                className={dateRange.label === preset.label ? 'active' : ''}
              >
                {preset.label}
              </button>
            ))}
            <button
              onClick={() => setCustomMode(true)}
              className={customMode ? 'active' : ''}
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
                  value={dateRange.startDate}
                  onChange={(e) => handleCustomDateChange('startDate', e.target.value)}
                  className="uss-date-input"
                />
              </div>
              <div className="uss-date-row">
                <label>Hasta:</label>
                <input
                  type="date"
                  value={dateRange.endDate}
                  onChange={(e) => handleCustomDateChange('endDate', e.target.value)}
                  className="uss-date-input"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

