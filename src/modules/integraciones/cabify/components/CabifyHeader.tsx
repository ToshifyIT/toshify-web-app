// src/modules/integraciones/cabify/components/CabifyHeader.tsx
/**
 * Componente Header de Cabify
 * Principio: Single Responsibility - Solo UI de encabezado
 */

import { useState, useRef, useEffect } from 'react'
import { RefreshCw, Calendar, ChevronDown } from 'lucide-react'
import type { WeekOption } from '../types/cabify.types'
import { UI_TEXT } from '../constants/cabify.constants'

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
  readonly onRefresh: () => void
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
  onRefresh,
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
    <div className="cabify-header">
      <HeaderInfo lastUpdate={lastUpdate} />
      <HeaderControls
        selectedWeek={selectedWeek}
        availableWeeks={availableWeeks}
        customDateRange={customDateRange}
        isLoading={isLoading}
        isDisabled={isDisabled}
        onWeekChange={handleWeekChange}
        onCustomDateChange={onCustomDateChange}
        onRefresh={onRefresh}
      />
    </div>
  )
}

// =====================================================
// SUBCOMPONENTES
// =====================================================

interface HeaderInfoProps {
  readonly lastUpdate: Date | null
}

function HeaderInfo({ lastUpdate }: HeaderInfoProps) {
  return (
    <div className="cabify-header-info">
      <h1>{UI_TEXT.TITLE}</h1>
      <p>{UI_TEXT.SUBTITLE}</p>
      {lastUpdate && <LastUpdate date={lastUpdate} />}
    </div>
  )
}

interface LastUpdateProps {
  readonly date: Date
}

function LastUpdate({ date }: LastUpdateProps) {
  return (
    <p className="cabify-last-update">
      Última consulta: {date.toLocaleString('es-AR')}
    </p>
  )
}

interface HeaderControlsProps {
  readonly selectedWeek: WeekOption | null
  readonly availableWeeks: readonly WeekOption[]
  readonly customDateRange: DateRange | null
  readonly isLoading: boolean
  readonly isDisabled: boolean
  readonly onWeekChange: (event: React.ChangeEvent<HTMLSelectElement>) => void
  readonly onCustomDateChange: (range: DateRange) => void
  readonly onRefresh: () => void
}

function HeaderControls({
  selectedWeek,
  availableWeeks,
  customDateRange,
  isLoading,
  isDisabled,
  onWeekChange,
  onCustomDateChange,
  onRefresh,
}: HeaderControlsProps) {
  return (
    <div className="cabify-controls">
      <WeekSelector
        selectedWeek={selectedWeek}
        availableWeeks={availableWeeks}
        isDisabled={isDisabled}
        onChange={onWeekChange}
      />
      <DateRangePicker
        dateRange={customDateRange}
        isDisabled={isDisabled}
        onChange={onCustomDateChange}
      />
      <RefreshButton
        isLoading={isLoading}
        isDisabled={isLoading || !selectedWeek}
        onClick={onRefresh}
      />
    </div>
  )
}

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

interface RefreshButtonProps {
  readonly isLoading: boolean
  readonly isDisabled: boolean
  readonly onClick: () => void
}

function RefreshButton({ isLoading, isDisabled, onClick }: RefreshButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      className="btn-primary cabify-refresh-btn"
    >
      <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
      {isLoading ? UI_TEXT.LOADING : UI_TEXT.REFRESH}
    </button>
  )
}
