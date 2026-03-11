import { useState, useRef, useEffect, useCallback, useLayoutEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import './DataTable.css'
import '../DateRangeSelector/DateRangeSelector.css'

interface ExcelDateRangeFilterProps {
  /** Nombre de la columna para mostrar en el header */
  label: string
  /** Fecha inicio seleccionada (YYYY-MM-DD) */
  startDate: string | null
  /** Fecha fin seleccionada (YYYY-MM-DD) */
  endDate: string | null
  /** Callback cuando cambia el rango */
  onRangeChange: (start: string | null, end: string | null) => void
  /** ID único para el filtro */
  filterId: string
  /** ID del filtro actualmente abierto */
  openFilterId: string | null
  /** Callback para cambiar qué filtro está abierto */
  onOpenChange: (filterId: string | null) => void
}

interface DropdownPosition {
  top: number
  left: number
}

const DAYS_SHORT = ['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO']
const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                     'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

const toISO = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

const getMondayOf = (y: number, m: number, d: number) => {
  const date = new Date(y, m, d)
  const dow = date.getDay()
  const diff = dow === 0 ? 6 : dow - 1
  const mon = new Date(y, m, d - diff)
  return { y: mon.getFullYear(), m: mon.getMonth(), d: mon.getDate() }
}

const getSundayOf = (y: number, m: number, d: number) => {
  const mon = getMondayOf(y, m, d)
  const sun = new Date(mon.y, mon.m, mon.d + 6)
  return { y: sun.getFullYear(), m: sun.getMonth(), d: sun.getDate() }
}

const getWeekNum = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m, d))
  const dayNum = dt.getUTCDay() || 7
  dt.setUTCDate(dt.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1))
  return Math.ceil((((dt.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

export function ExcelDateRangeFilter({
  label,
  startDate,
  endDate,
  onRangeChange,
  filterId,
  openFilterId,
  onOpenChange,
}: ExcelDateRangeFilterProps) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<DropdownPosition>({ top: 0, left: 0 })

  const isOpen = openFilterId === filterId
  const hasSelection = !!startDate || !!endDate

  // Calendar state
  const [viewDate, setViewDate] = useState(() => new Date())
  const [selectionMode, setSelectionMode] = useState<'day' | 'week'>('day')

  // Reset view when opening
  useEffect(() => {
    if (isOpen) {
      if (startDate) {
        const [y, m] = startDate.split('-').map(Number)
        setViewDate(new Date(y, m - 1, 1))
      } else {
        setViewDate(new Date())
      }
    }
  }, [isOpen, startDate])

  // Calendar days
  const calendarDays = useMemo(() => {
    const year = viewDate.getFullYear()
    const month = viewDate.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const days: Array<{ y: number; m: number; d: number; cur: boolean; ts: number }> = []

    const startDow = firstDay.getDay()
    const prevDays = startDow === 0 ? 6 : startDow - 1
    for (let i = prevDays; i > 0; i--) {
      const dt = new Date(year, month, 1 - i)
      days.push({ y: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate(), cur: false, ts: dt.getTime() })
    }
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push({ y: year, m: month, d: i, cur: true, ts: new Date(year, month, i).getTime() })
    }
    const rem = 7 - (days.length % 7)
    if (rem < 7) {
      for (let i = 1; i <= rem; i++) {
        const dt = new Date(year, month + 1, i)
        days.push({ y: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate(), cur: false, ts: dt.getTime() })
      }
    }
    return days
  }, [viewDate])

  const todayTs = useMemo(() => {
    const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime()
  }, [])

  const filterRange = useMemo(() => {
    if (!startDate && !endDate) return null
    const from = startDate ? new Date(startDate + 'T00:00:00').getTime() : -Infinity
    const to = endDate ? new Date(endDate + 'T00:00:00').getTime() : Infinity
    return { from, to }
  }, [startDate, endDate])

  // Handle day click
  const handleCalendarDayClick = useCallback((day: { y: number; m: number; d: number }, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (selectionMode === 'day') {
      const iso = toISO(day.y, day.m, day.d)
      if (!startDate || (startDate && endDate)) {
        onRangeChange(iso, null)
      } else {
        const fromTs = new Date(startDate + 'T00:00:00').getTime()
        const clickTs = new Date(iso + 'T00:00:00').getTime()
        if (clickTs >= fromTs) {
          onRangeChange(startDate, iso)
        } else {
          onRangeChange(iso, startDate)
        }
      }
    } else {
      const mon = getMondayOf(day.y, day.m, day.d)
      const sun = getSundayOf(day.y, day.m, day.d)
      onRangeChange(toISO(mon.y, mon.m, mon.d), toISO(sun.y, sun.m, sun.d))
    }
  }, [selectionMode, startDate, endDate, onRangeChange])

  // Shortcuts
  const dateShortcuts = useMemo(() => {
    const now = new Date()
    const y = now.getFullYear(), m = now.getMonth(), d = now.getDate()
    const mon = getMondayOf(y, m, d)
    const sun = getSundayOf(y, m, d)
    const wn = getWeekNum(mon.y, mon.m, mon.d)
    const prevMon = getMondayOf(mon.y, mon.m, mon.d - 7)
    const prevSun = getSundayOf(prevMon.y, prevMon.m, prevMon.d)
    const pwn = getWeekNum(prevMon.y, prevMon.m, prevMon.d)
    const yesterday = new Date(y, m, d - 1)

    return [
      { id: 'today', label: 'Hoy', from: toISO(y, m, d), to: toISO(y, m, d) },
      { id: 'yesterday', label: 'Ayer', from: toISO(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate()), to: toISO(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate()) },
      { id: 'this-week', label: `Esta semana (S${wn})`, from: toISO(mon.y, mon.m, mon.d), to: toISO(sun.y, sun.m, sun.d) },
      { id: 'last-week', label: `Semana pasada (S${pwn})`, from: toISO(prevMon.y, prevMon.m, prevMon.d), to: toISO(prevSun.y, prevSun.m, prevSun.d) },
      { id: 'this-year', label: `Este año (${y})`, from: toISO(y, 0, 1), to: toISO(y, 11, 31) },
    ]
  }, [])

  const calculatePosition = useCallback(() => {
    if (!buttonRef.current) return { top: 0, left: 0 }
    const rect = buttonRef.current.getBoundingClientRect()
    const dropdownWidth = 320
    let left = rect.left
    if (left + dropdownWidth > window.innerWidth - 8) {
      left = window.innerWidth - dropdownWidth - 8
    }
    if (left < 8) left = 8
    return { top: rect.bottom + 4, left }
  }, [])

  useLayoutEffect(() => {
    if (!isOpen || !buttonRef.current) return
    setPosition(calculatePosition())
  }, [isOpen, calculatePosition])

  useLayoutEffect(() => {
    if (!isOpen || !dropdownRef.current || !buttonRef.current) return
    const dropdownRect = dropdownRef.current.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    if (dropdownRect.right > viewportWidth - 8) {
      setPosition(prev => ({
        ...prev,
        left: Math.max(8, viewportWidth - dropdownRect.width - 8)
      }))
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (
        dropdownRef.current && !dropdownRef.current.contains(target) &&
        buttonRef.current && !buttonRef.current.contains(target)
      ) {
        onOpenChange(null)
      }
    }
    const handleReposition = () => setPosition(calculatePosition())
    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('scroll', handleReposition, { capture: true, passive: true })
    window.addEventListener('resize', handleReposition, { passive: true })
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('scroll', handleReposition, true)
      window.removeEventListener('resize', handleReposition)
    }
  }, [isOpen, onOpenChange, calculatePosition])

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (isOpen) {
      onOpenChange(null)
    } else {
      setPosition(calculatePosition())
      onOpenChange(filterId)
    }
  }

  return (
    <div className="dt-column-filter">
      <span>{label} {hasSelection && `(*)`}</span>
      <button
        ref={buttonRef}
        type="button"
        className={`dt-column-filter-btn ${hasSelection ? 'active' : ''}`}
        onClick={handleToggle}
        title={`Filtrar por rango de fechas`}
      >
        <Calendar size={14} />
      </button>
      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          className="dt-column-filter-dropdown dt-filter-portal dt-filter-dropdown-calendar"
          style={{ position: 'fixed', top: position.top, left: position.left }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="dt-filter-calendar">
            {/* Tabs Día/Semana */}
            <div className="date-range-tabs">
              <button type="button" className={`date-range-tab ${selectionMode === 'day' ? 'active' : ''}`} onClick={() => setSelectionMode('day')}>Día</button>
              <button type="button" className={`date-range-tab ${selectionMode === 'week' ? 'active' : ''}`} onClick={() => setSelectionMode('week')}>Semana</button>
            </div>
            {/* Month navigation */}
            <div className="date-range-header">
              <button type="button" className="date-range-nav" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}>
                <ChevronLeft size={16} />
              </button>
              <div className="date-range-month-year">
                <span className="date-range-month">{MONTH_NAMES[viewDate.getMonth()]}</span>
                <select
                  className="date-range-year-select"
                  value={viewDate.getFullYear()}
                  onChange={e => setViewDate(new Date(parseInt(e.target.value), viewDate.getMonth(), 1))}
                >
                  {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i).map(yr => (
                    <option key={yr} value={yr}>{yr}</option>
                  ))}
                </select>
              </div>
              <button type="button" className="date-range-nav" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))}>
                <ChevronRight size={16} />
              </button>
            </div>
            {/* Day names */}
            <div className="date-range-days-header">
              {DAYS_SHORT.map(d => <div key={d} className="date-range-day-name">{d}</div>)}
            </div>
            {/* Day grid */}
            <div className="date-range-grid">
              {calendarDays.map((day, idx) => {
                const iso = toISO(day.y, day.m, day.d)
                const isToday = day.ts === todayTs
                const inRange = filterRange && day.ts >= filterRange.from && day.ts <= filterRange.to
                const isStart = startDate === iso
                const isEnd = endDate === iso
                const dow = new Date(day.y, day.m, day.d).getDay()
                const gridPos = dow === 0 ? 6 : dow - 1
                const isRowStart = gridPos === 0
                const isRowEnd = gridPos === 6

                const cls = [
                  'date-range-day',
                  !day.cur && 'other-month',
                  inRange && 'selected',
                  isStart && 'range-start',
                  isEnd && 'range-end',
                  isStart && !endDate && 'day-selected',
                  isToday && !inRange && !isStart && 'today',
                  inRange && isRowStart && 'row-start',
                  inRange && isRowEnd && 'row-end',
                ].filter(Boolean).join(' ')

                return (
                  <div key={idx} className={cls} onClick={e => handleCalendarDayClick(day, e)} role="button" tabIndex={0}>
                    <span>{day.d}</span>
                  </div>
                )
              })}
            </div>
            {/* Range display */}
            {(startDate || endDate) && (
              <div className="dt-filter-range-display">
                {startDate && <span>{startDate.split('-').reverse().join('/')}</span>}
                {startDate && endDate && <span> → </span>}
                {endDate && <span>{endDate.split('-').reverse().join('/')}</span>}
                {startDate && !endDate && <span className="dt-filter-range-hint"> (selecciona fin)</span>}
              </div>
            )}
            {/* Shortcuts */}
            <div className="date-range-shortcuts">
              {dateShortcuts.map(s => (
                <button
                  key={s.id}
                  type="button"
                  className={`date-range-shortcut ${startDate === s.from && endDate === s.to ? 'active' : ''}`}
                  onClick={() => onRangeChange(s.from, s.to)}
                >
                  {s.label}
                </button>
              ))}
            </div>
            {/* Clear */}
            {hasSelection && (
              <button
                type="button"
                className="dt-column-filter-clear"
                onClick={() => onRangeChange(null, null)}
                style={{ marginTop: '4px' }}
              >
                Limpiar filtro
              </button>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

export default ExcelDateRangeFilter
