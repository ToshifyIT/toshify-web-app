// src/components/ui/DateRangeSelector/DateRangeSelector.tsx
/**
 * Selector de rango de fechas con calendario
 * Permite seleccionar día individual o semana completa
 * Incluye atajos rápidos (Esta semana, Semana pasada, etc.)
 */

import { useState, useRef, useEffect, useMemo } from 'react'
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import './DateRangeSelector.css'

export interface DateRange {
  startDate: string // ISO string YYYY-MM-DD
  endDate: string   // ISO string YYYY-MM-DD
  label: string
  type: 'day' | 'week' | 'custom' | 'all' | 'year'
}

interface DateRangeSelectorProps {
  selectedRange: DateRange | null
  onRangeChange: (range: DateRange) => void
  disabled?: boolean
  showAllOption?: boolean // Mostrar opción "Todo el historial"
  placeholder?: string
}

// Días de la semana (Lunes a Domingo)
const DAYS_SHORT = ['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO']
const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                     'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

// Obtener timestamp normalizado (solo fecha, sin hora)
const getDayTimestamp = (year: number, month: number, day: number): number => {
  return new Date(year, month, day, 0, 0, 0, 0).getTime()
}

// Formatear fecha a ISO string YYYY-MM-DD
const toISODateString = (year: number, month: number, day: number): string => {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// Parsear fecha ISO
const parseISODate = (isoString: string): { year: number; month: number; day: number; timestamp: number } => {
  const datePart = isoString.split('T')[0]
  const [year, month, day] = datePart.split('-').map(Number)
  return {
    year,
    month: month - 1,
    day,
    timestamp: getDayTimestamp(year, month - 1, day)
  }
}

// Calcular número de semana ISO
const getWeekNumber = (year: number, month: number, day: number): number => {
  const d = new Date(Date.UTC(year, month, day))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

// Obtener lunes de la semana de una fecha
const getMondayOfWeek = (year: number, month: number, day: number): { year: number; month: number; day: number } => {
  const date = new Date(year, month, day)
  const dayOfWeek = date.getDay()
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const monday = new Date(year, month, day - daysToMonday)
  return { year: monday.getFullYear(), month: monday.getMonth(), day: monday.getDate() }
}

// Obtener domingo de la semana de una fecha
const getSundayOfWeek = (year: number, month: number, day: number): { year: number; month: number; day: number } => {
  const monday = getMondayOfWeek(year, month, day)
  const sunday = new Date(monday.year, monday.month, monday.day + 6)
  return { year: sunday.getFullYear(), month: sunday.getMonth(), day: sunday.getDate() }
}

type SelectionMode = 'day' | 'week'

export function DateRangeSelector({
  selectedRange,
  onRangeChange,
  disabled = false,
  showAllOption = true,
  placeholder = 'Seleccionar fecha'
}: DateRangeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [viewDate, setViewDate] = useState(new Date())
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('week')
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Pre-calcular rango seleccionado
  const selectedRangeParsed = useMemo(() => {
    if (!selectedRange || selectedRange.type === 'all') return null
    const start = parseISODate(selectedRange.startDate)
    const end = parseISODate(selectedRange.endDate)
    return { start, end }
  }, [selectedRange])

  // Cerrar al hacer clic fuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Generar días del calendario
  const calendarDays = useMemo(() => {
    const year = viewDate.getFullYear()
    const month = viewDate.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)

    const days: Array<{ year: number; month: number; day: number; isCurrentMonth: boolean; timestamp: number }> = []

    const startDayOfWeek = firstDay.getDay()
    const daysFromPrevMonth = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1

    for (let i = daysFromPrevMonth; i > 0; i--) {
      const d = new Date(year, month, 1 - i)
      days.push({
        year: d.getFullYear(),
        month: d.getMonth(),
        day: d.getDate(),
        isCurrentMonth: false,
        timestamp: getDayTimestamp(d.getFullYear(), d.getMonth(), d.getDate())
      })
    }

    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push({
        year, month, day: i,
        isCurrentMonth: true,
        timestamp: getDayTimestamp(year, month, i)
      })
    }

    const remainingDays = 7 - (days.length % 7)
    if (remainingDays < 7) {
      for (let i = 1; i <= remainingDays; i++) {
        const d = new Date(year, month + 1, i)
        days.push({
          year: d.getFullYear(),
          month: d.getMonth(),
          day: d.getDate(),
          isCurrentMonth: false,
          timestamp: getDayTimestamp(d.getFullYear(), d.getMonth(), d.getDate())
        })
      }
    }

    return days
  }, [viewDate])

  // Verificaciones de selección
  const isDayInSelectedRange = (ts: number): boolean => {
    if (!selectedRangeParsed) return false
    return ts >= selectedRangeParsed.start.timestamp && ts <= selectedRangeParsed.end.timestamp
  }

  const isRangeStart = (ts: number): boolean => {
    if (!selectedRangeParsed) return false
    return ts === selectedRangeParsed.start.timestamp
  }

  const isRangeEnd = (ts: number): boolean => {
    if (!selectedRangeParsed) return false
    return ts === selectedRangeParsed.end.timestamp
  }

  // Manejar clic en un día
  const handleDayClick = (dayInfo: typeof calendarDays[0], e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (selectionMode === 'day') {
      // Modo día: seleccionar solo ese día
      const dateStr = toISODateString(dayInfo.year, dayInfo.month, dayInfo.day)
      const range: DateRange = {
        startDate: dateStr,
        endDate: dateStr,
        label: `${dayInfo.day}/${dayInfo.month + 1}/${dayInfo.year}`,
        type: 'day'
      }
      onRangeChange(range)
      setIsOpen(false)
    } else {
      // Modo semana: seleccionar semana completa
      const monday = getMondayOfWeek(dayInfo.year, dayInfo.month, dayInfo.day)
      const sunday = getSundayOfWeek(dayInfo.year, dayInfo.month, dayInfo.day)
      const weekNum = getWeekNumber(monday.year, monday.month, monday.day)
      
      const range: DateRange = {
        startDate: toISODateString(monday.year, monday.month, monday.day),
        endDate: toISODateString(sunday.year, sunday.month, sunday.day),
        label: `Semana ${weekNum}`,
        type: 'week'
      }
      onRangeChange(range)
      setIsOpen(false)
    }
  }

  // Atajos rápidos
  const shortcuts = useMemo(() => {
    const today = new Date()
    const currentYear = today.getFullYear()
    const currentMonth = today.getMonth()
    const currentDay = today.getDate()

    // Esta semana
    const thisMonday = getMondayOfWeek(currentYear, currentMonth, currentDay)
    const thisSunday = getSundayOfWeek(currentYear, currentMonth, currentDay)
    const thisWeekNum = getWeekNumber(thisMonday.year, thisMonday.month, thisMonday.day)

    // Semana pasada
    const lastWeekDate = new Date(thisMonday.year, thisMonday.month, thisMonday.day - 7)
    const lastMonday = getMondayOfWeek(lastWeekDate.getFullYear(), lastWeekDate.getMonth(), lastWeekDate.getDate())
    const lastSunday = getSundayOfWeek(lastWeekDate.getFullYear(), lastWeekDate.getMonth(), lastWeekDate.getDate())
    const lastWeekNum = getWeekNumber(lastMonday.year, lastMonday.month, lastMonday.day)

    return [
      {
        id: 'this-week',
        label: `Esta semana (S${thisWeekNum})`,
        range: {
          startDate: toISODateString(thisMonday.year, thisMonday.month, thisMonday.day),
          endDate: toISODateString(thisSunday.year, thisSunday.month, thisSunday.day),
          label: `Esta semana (S${thisWeekNum})`,
          type: 'week' as const
        }
      },
      {
        id: 'last-week',
        label: `Semana pasada (S${lastWeekNum})`,
        range: {
          startDate: toISODateString(lastMonday.year, lastMonday.month, lastMonday.day),
          endDate: toISODateString(lastSunday.year, lastSunday.month, lastSunday.day),
          label: `Semana pasada (S${lastWeekNum})`,
          type: 'week' as const
        }
      },
      {
        id: 'this-year',
        label: `Este año (${currentYear})`,
        range: {
          startDate: toISODateString(currentYear, 0, 1), // 1 de enero
          endDate: toISODateString(currentYear, 11, 31), // 31 de diciembre
          label: `Año ${currentYear}`,
          type: 'year' as const
        }
      }
    ]
  }, [])

  // Label del botón
  const getButtonLabel = (): string => {
    if (!selectedRange) return placeholder
    if (selectedRange.type === 'all') return 'Todo el historial'
    return selectedRange.label
  }

  const todayTimestamp = useMemo(() => {
    const now = new Date()
    return getDayTimestamp(now.getFullYear(), now.getMonth(), now.getDate())
  }, [])

  // Determinar posición del día en la semana para bordes redondeados
  const getDayPosition = (dayInfo: typeof calendarDays[0]) => {
    const dayOfWeek = new Date(dayInfo.year, dayInfo.month, dayInfo.day).getDay()
    const gridPosition = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    return {
      isFirstInRow: gridPosition === 0,
      isLastInRow: gridPosition === 6,
    }
  }

  // Verificar si el atajo está seleccionado
  const isShortcutSelected = (shortcutRange: DateRange): boolean => {
    if (!selectedRange || selectedRange.type === 'all') return false
    return selectedRange.startDate === shortcutRange.startDate && selectedRange.endDate === shortcutRange.endDate
  }

  return (
    <div className="date-range-selector" ref={dropdownRef}>
      <button
        type="button"
        className={`date-range-btn ${selectedRange ? 'has-selection' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
      >
        <Calendar size={16} />
        <span>{getButtonLabel()}</span>
        <ChevronDown size={14} className={isOpen ? 'rotate' : ''} />
      </button>

      {isOpen && (
        <div className="date-range-dropdown">
          {/* Pestañas Día/Semana */}
          <div className="date-range-tabs">
            <button
              type="button"
              className={`date-range-tab ${selectionMode === 'day' ? 'active' : ''}`}
              onClick={() => setSelectionMode('day')}
            >
              Día
            </button>
            <button
              type="button"
              className={`date-range-tab ${selectionMode === 'week' ? 'active' : ''}`}
              onClick={() => setSelectionMode('week')}
            >
              Semana
            </button>
          </div>

          {/* Header con navegación */}
          <div className="date-range-header">
            <button type="button" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))} className="date-range-nav">
              <ChevronLeft size={16} />
            </button>
            <div className="date-range-month-year">
              <span className="date-range-month">{MONTH_NAMES[viewDate.getMonth()]}</span>
              <select 
                className="date-range-year-select"
                value={viewDate.getFullYear()}
                onChange={(e) => setViewDate(new Date(parseInt(e.target.value), viewDate.getMonth(), 1))}
              >
                {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i).map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            <button type="button" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))} className="date-range-nav">
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Días de la semana */}
          <div className="date-range-days-header">
            {DAYS_SHORT.map(day => (
              <div key={day} className="date-range-day-name">{day}</div>
            ))}
          </div>

          {/* Grid de días */}
          <div className="date-range-grid">
            {calendarDays.map((dayInfo, index) => {
              const isToday = dayInfo.timestamp === todayTimestamp
              const { isFirstInRow, isLastInRow } = getDayPosition(dayInfo)

              const isDaySelected = selectionMode === 'day' && 
                selectedRange?.type === 'day' &&
                selectedRange.startDate === toISODateString(dayInfo.year, dayInfo.month, dayInfo.day)

              const isInRange = selectionMode === 'week' && isDayInSelectedRange(dayInfo.timestamp)
              const isStart = selectionMode === 'week' && isRangeStart(dayInfo.timestamp)
              const isEnd = selectionMode === 'week' && isRangeEnd(dayInfo.timestamp)

              const classes = [
                'date-range-day',
                !dayInfo.isCurrentMonth && 'other-month',
                (isDaySelected || isInRange) && 'selected',
                isDaySelected && 'day-selected',
                isStart && 'range-start',
                isEnd && 'range-end',
                isToday && !isDaySelected && !isInRange && 'today',
                isInRange && isFirstInRow && 'row-start',
                isInRange && isLastInRow && 'row-end',
              ].filter(Boolean).join(' ')

              return (
                <div
                  key={index}
                  className={classes}
                  onClick={(e) => handleDayClick(dayInfo, e)}
                  role="button"
                  tabIndex={0}
                >
                  <span>{dayInfo.day}</span>
                </div>
              )
            })}
          </div>

          {/* Atajos rápidos */}
          <div className="date-range-shortcuts">
            {shortcuts.map(shortcut => (
              <button
                key={shortcut.id}
                type="button"
                className={`date-range-shortcut ${isShortcutSelected(shortcut.range) ? 'active' : ''}`}
                onClick={() => {
                  onRangeChange(shortcut.range)
                  setIsOpen(false)
                }}
              >
                {shortcut.label}
              </button>
            ))}
            {showAllOption && (
              <button
                type="button"
                className={`date-range-shortcut ${selectedRange?.type === 'all' ? 'active' : ''}`}
                onClick={() => {
                  onRangeChange({
                    startDate: '',
                    endDate: '',
                    label: 'Todo el historial',
                    type: 'all'
                  })
                  setIsOpen(false)
                }}
              >
                Todo el historial
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
