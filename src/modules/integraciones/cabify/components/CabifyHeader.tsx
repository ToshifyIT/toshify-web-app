// src/modules/integraciones/cabify/components/CabifyHeader.tsx
/**
 * Componente Header de Cabify
 * Principio: Single Responsibility - Solo UI de encabezado
 */

import { useState, useRef, useEffect } from 'react'
import { Calendar, ChevronDown } from 'lucide-react'
import type { WeekOption } from '../types/cabify.types'

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
  const handleWeekChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const weeksAgo = Number(event.target.value)
    const selected = availableWeeks.find((w) => w.weeksAgo === weeksAgo)

    if (selected) {
      onWeekChange(selected)
    }
  }

  const isDisabled = isLoading || availableWeeks.length === 0

  return (
    <div className="cabify-header cabify-header-compact">
      <div className="cabify-controls">
        <WeekSelector
          selectedWeek={selectedWeek}
          availableWeeks={availableWeeks}
          isDisabled={isDisabled}
          onChange={handleWeekChange}
        />
        <DateRangePicker
          dateRange={customDateRange}
          isDisabled={isDisabled}
          onChange={onCustomDateChange}
        />
        {isLoading && (
          <div className="cabify-loading-indicator">
            <div className="dt-loading-spinner" style={{ width: 16, height: 16 }} />
            <span>Sincronizando...</span>
          </div>
        )}
      </div>
      {lastUpdate && (
        <span className="cabify-last-update-compact">
          Última actualización: {lastUpdate.toLocaleString('es-AR')}
        </span>
      )}
    </div>
  )
}

// =====================================================
// SUBCOMPONENTES
// =====================================================

interface WeekSelectorProps {
  readonly selectedWeek: WeekOption | null
  readonly availableWeeks: readonly WeekOption[]
  readonly isDisabled: boolean
  readonly onChange: (event: React.ChangeEvent<HTMLSelectElement>) => void
}

function WeekSelector({
  selectedWeek,
  availableWeeks,
  isDisabled,
  onChange,
}: WeekSelectorProps) {
  return (
    <div className="cabify-week-selector">
      <label>Semana:</label>
      <select
        value={selectedWeek?.weeksAgo.toString() ?? ''}
        onChange={onChange}
        disabled={isDisabled}
      >
        {availableWeeks.map((week) => (
          <option key={week.weeksAgo} value={week.weeksAgo}>
            {week.label}
          </option>
        ))}
      </select>
    </div>
  )
}

interface DateRangePickerProps {
  readonly dateRange: DateRange | null
  readonly isDisabled: boolean
  readonly onChange: (range: DateRange) => void
}

function DateRangePicker({
  dateRange,
  isDisabled,
  onChange,
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const formatDateForInput = (isoDate: string | undefined): string => {
    if (!isoDate) return ''
    return isoDate.split('T')[0]
  }

  const formatDateDisplay = (isoDate: string | undefined): string => {
    if (!isoDate) return ''
    return new Date(isoDate).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
  }

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newStartDate = e.target.value
    if (newStartDate) {
      onChange({
        startDate: new Date(newStartDate + 'T00:00:00').toISOString(),
        endDate: dateRange?.endDate || new Date().toISOString()
      })
    }
  }

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEndDate = e.target.value
    if (newEndDate) {
      onChange({
        startDate: dateRange?.startDate || new Date().toISOString(),
        endDate: new Date(newEndDate + 'T23:59:59').toISOString()
      })
    }
  }

  const displayLabel = dateRange
    ? `${formatDateDisplay(dateRange.startDate)} - ${formatDateDisplay(dateRange.endDate)}`
    : 'Seleccionar fechas'

  return (
    <div className="cabify-date-picker-wrapper" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={isDisabled}
        className="cabify-date-picker-btn"
      >
        <Calendar size={16} />
        <span>{displayLabel}</span>
        <ChevronDown size={14} className={isOpen ? 'rotate' : ''} />
      </button>

      {isOpen && (
        <div className="cabify-date-dropdown">
          <div className="cabify-date-dropdown-row">
            <label>Desde:</label>
            <input
              type="date"
              value={formatDateForInput(dateRange?.startDate)}
              onChange={handleStartDateChange}
              disabled={isDisabled}
              className="cabify-date-input"
            />
          </div>
          <div className="cabify-date-dropdown-row">
            <label>Hasta:</label>
            <input
              type="date"
              value={formatDateForInput(dateRange?.endDate)}
              onChange={handleEndDateChange}
              disabled={isDisabled}
              className="cabify-date-input"
            />
          </div>
        </div>
      )}
    </div>
  )
}

