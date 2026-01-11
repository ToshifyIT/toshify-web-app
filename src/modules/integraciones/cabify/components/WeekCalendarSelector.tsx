// src/modules/integraciones/cabify/components/WeekCalendarSelector.tsx
/**
 * Selector de semanas tipo calendario (estilo Cabify)
 * Semanas van de Domingo a Sábado
 */

import { useState, useRef, useEffect, useMemo } from 'react'
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import type { WeekOption } from '../types/cabify.types'

interface WeekCalendarSelectorProps {
  readonly selectedWeek: WeekOption | null
  readonly availableWeeks: readonly WeekOption[]
  readonly isDisabled: boolean
  readonly onWeekChange: (week: WeekOption) => void
}

// Días de la semana (Lunes a Domingo)
const DAYS_SHORT = ['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO']
const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                     'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

// Obtener timestamp normalizado (solo fecha, sin hora)
const getDayTimestamp = (year: number, month: number, day: number): number => {
  return new Date(year, month, day, 0, 0, 0, 0).getTime()
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

type SelectionMode = 'day' | 'week'

export function WeekCalendarSelector({
  selectedWeek,
  availableWeeks,
  isDisabled,
  onWeekChange,
}: WeekCalendarSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [viewDate, setViewDate] = useState(new Date())
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('week')
  const [selectedDay, setSelectedDay] = useState<{ year: number; month: number; day: number } | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Pre-calcular rango de la semana seleccionada
  const selectedRange = useMemo(() => {
    if (!selectedWeek) return null
    const start = parseISODate(selectedWeek.startDate)
    const end = parseISODate(selectedWeek.endDate)
    return { start, end }
  }, [selectedWeek])

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

  // Calcular número de semana ISO
  const getWeekNumber = (year: number, month: number, day: number): number => {
    const d = new Date(Date.UTC(year, month, day))
    const dayNum = d.getUTCDay() || 7
    d.setUTCDate(d.getUTCDate() + 4 - dayNum)
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  }

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
  const isDayInSelectedWeek = (ts: number): boolean => {
    if (!selectedRange) return false
    return ts >= selectedRange.start.timestamp && ts <= selectedRange.end.timestamp
  }

  const isWeekStart = (ts: number): boolean => {
    if (!selectedRange) return false
    return ts === selectedRange.start.timestamp
  }

  const isWeekEnd = (ts: number): boolean => {
    if (!selectedRange) return false
    return ts === selectedRange.end.timestamp
  }

  // Pre-calcular qué semanas están disponibles para clic
  const availableWeekTimestamps = useMemo(() => {
    return new Set(availableWeeks.map(week => parseISODate(week.startDate).timestamp))
  }, [availableWeeks])

  // Verificar si un día pertenece a una semana disponible
  const isDayInAvailableWeek = (dayInfo: typeof calendarDays[0]): boolean => {
    const clickedDate = new Date(dayInfo.year, dayInfo.month, dayInfo.day)
    const dayOfWeek = clickedDate.getDay()
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    const mondayDate = new Date(dayInfo.year, dayInfo.month, dayInfo.day - daysToMonday)
    const mondayTimestamp = getDayTimestamp(mondayDate.getFullYear(), mondayDate.getMonth(), mondayDate.getDate())
    return availableWeekTimestamps.has(mondayTimestamp)
  }

  // Manejar clic en un día
  const handleDayClick = (dayInfo: typeof calendarDays[0], e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (selectionMode === 'day') {
      // Modo día: seleccionar solo ese día
      setSelectedDay({ year: dayInfo.year, month: dayInfo.month, day: dayInfo.day })

      // Crear un WeekOption especial para un solo día
      const dayStart = new Date(Date.UTC(dayInfo.year, dayInfo.month, dayInfo.day, 0, 0, 0, 0))
      const dayEnd = new Date(Date.UTC(dayInfo.year, dayInfo.month, dayInfo.day, 23, 59, 59, 999))

      const customDayWeek: WeekOption = {
        weeksAgo: -1, // Indicador especial para día personalizado
        label: `${dayInfo.day}/${dayInfo.month + 1}/${dayInfo.year}`,
        startDate: dayStart.toISOString(),
        endDate: dayEnd.toISOString()
      }

      onWeekChange(customDayWeek)
      setIsOpen(false)
    } else {
      // Modo semana: encontrar el LUNES de esa semana
      const clickedDate = new Date(dayInfo.year, dayInfo.month, dayInfo.day)
      const dayOfWeek = clickedDate.getDay()
      // Calcular el lunes: si es domingo (0), retroceder 6 días; si no, retroceder (dow-1) días
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
      const mondayDate = new Date(dayInfo.year, dayInfo.month, dayInfo.day - daysToMonday)
      const mondayTimestamp = getDayTimestamp(mondayDate.getFullYear(), mondayDate.getMonth(), mondayDate.getDate())

      const matchingWeek = availableWeeks.find(week => {
        const weekStart = parseISODate(week.startDate)
        return weekStart.timestamp === mondayTimestamp
      })

      if (matchingWeek) {
        setSelectedDay(null)
        onWeekChange(matchingWeek)
        setIsOpen(false)
      }
    }
  }

  // Label del botón
  const getButtonLabel = (): string => {
    // Si hay un día seleccionado en modo día
    if (selectedDay && selectedWeek?.weeksAgo === -1) {
      return `${selectedDay.day}/${selectedDay.month + 1}/${selectedDay.year}`
    }

    if (!selectedWeek || !selectedRange) return 'Seleccionar semana'
    const weekNum = getWeekNumber(selectedRange.start.year, selectedRange.start.month, selectedRange.start.day)
    if (selectedWeek.weeksAgo === 0) {
      return `Esta semana (S${weekNum})`
    }
    return `Semana ${weekNum} (S${weekNum})`
  }

  const todayTimestamp = useMemo(() => {
    const now = new Date()
    return getDayTimestamp(now.getFullYear(), now.getMonth(), now.getDate())
  }, [])

  // Determinar posición del día en la semana para bordes redondeados
  const getDayPosition = (dayInfo: typeof calendarDays[0]) => {
    const dayOfWeek = new Date(dayInfo.year, dayInfo.month, dayInfo.day).getDay()
    // En nuestro grid: 0=Lunes... 6=Domingo
    // getDay(): 0=Domingo, 1=Lunes... 6=Sábado
    // Convertir: Domingo(0)->6, Lunes(1)->0, etc.
    const gridPosition = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    return {
      isFirstInRow: gridPosition === 0, // Lunes
      isLastInRow: gridPosition === 6,  // Domingo
    }
  }

  return (
    <div className="week-calendar-selector" ref={dropdownRef}>
      <button
        type="button"
        className="week-calendar-btn"
        onClick={() => setIsOpen(!isOpen)}
        disabled={isDisabled}
      >
        <Calendar size={16} />
        <span>{getButtonLabel()}</span>
        <ChevronDown size={14} className={isOpen ? 'rotate' : ''} />
      </button>

      {isOpen && (
        <div className="week-calendar-dropdown">
          {/* Pestañas Día/Semana */}
          <div className="week-calendar-tabs">
            <button
              type="button"
              className={`week-calendar-tab ${selectionMode === 'day' ? 'active' : ''}`}
              onClick={() => setSelectionMode('day')}
            >
              Día
            </button>
            <button
              type="button"
              className={`week-calendar-tab ${selectionMode === 'week' ? 'active' : ''}`}
              onClick={() => setSelectionMode('week')}
            >
              Semana
            </button>
          </div>

          {/* Header con navegación */}
          <div className="week-calendar-header">
            <button type="button" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))} className="week-calendar-nav">
              <ChevronLeft size={16} />
            </button>
            <span className="week-calendar-month">
              {MONTH_NAMES[viewDate.getMonth()]} {viewDate.getFullYear()}
            </span>
            <button type="button" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))} className="week-calendar-nav">
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Días de la semana */}
          <div className="week-calendar-days-header">
            {DAYS_SHORT.map(day => (
              <div key={day} className="week-calendar-day-name">{day}</div>
            ))}
          </div>

          {/* Grid de días */}
          <div className="week-calendar-grid">
            {calendarDays.map((dayInfo, index) => {
              const isToday = dayInfo.timestamp === todayTimestamp
              const { isFirstInRow, isLastInRow } = getDayPosition(dayInfo)

              // En modo día: solo marcar el día seleccionado
              // En modo semana: marcar toda la semana
              const isDaySelected = selectionMode === 'day' && selectedDay &&
                selectedDay.year === dayInfo.year &&
                selectedDay.month === dayInfo.month &&
                selectedDay.day === dayInfo.day

              const isWeekSelected = selectionMode === 'week' && isDayInSelectedWeek(dayInfo.timestamp)
              const isStart = selectionMode === 'week' && isWeekStart(dayInfo.timestamp)
              const isEnd = selectionMode === 'week' && isWeekEnd(dayInfo.timestamp)

              // En modo día todos los días son clickeables
              // En modo semana solo las semanas disponibles
              const isAvailable = selectionMode === 'day' || isDayInAvailableWeek(dayInfo)

              // Clases para estilo Cabify
              const classes = [
                'week-calendar-day',
                !dayInfo.isCurrentMonth && 'other-month',
                (isDaySelected || isWeekSelected) && 'selected',
                isDaySelected && 'day-selected',
                isStart && 'week-start',
                isEnd && 'week-end',
                isToday && !isDaySelected && !isWeekSelected && 'today',
                isWeekSelected && isFirstInRow && 'row-start',
                isWeekSelected && isLastInRow && 'row-end',
                !isAvailable && 'unavailable',
              ].filter(Boolean).join(' ')

              return (
                <div
                  key={index}
                  className={classes}
                  onClick={(e) => isAvailable && handleDayClick(dayInfo, e)}
                  role="button"
                  tabIndex={isAvailable ? 0 : -1}
                >
                  <span>{dayInfo.day}</span>
                </div>
              )
            })}
          </div>

          {/* Atajos rápidos */}
          <div className="week-calendar-shortcuts">
            {availableWeeks.slice(0, 2).map(week => {
              const start = parseISODate(week.startDate)
              const weekNum = getWeekNumber(start.year, start.month, start.day)
              const label = week.weeksAgo === 0
                ? `Esta semana (S${weekNum})`
                : `Semana pasada (S${weekNum})`
              return (
                <button
                  key={week.weeksAgo}
                  type="button"
                  className={`week-calendar-shortcut ${selectedWeek?.weeksAgo === week.weeksAgo ? 'active' : ''}`}
                  onClick={() => {
                    onWeekChange(week)
                    setIsOpen(false)
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
