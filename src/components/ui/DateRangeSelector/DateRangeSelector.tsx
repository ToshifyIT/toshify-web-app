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
  type: 'day' | 'week' | 'custom' | 'all' | 'month' | 'year'
}

export interface DateRangeShortcut {
  id: string
  label: string
  range: DateRange
}

interface DateRangeSelectorProps {
  selectedRange: DateRange | null
  onRangeChange: (range: DateRange) => void
  disabled?: boolean
  showAllOption?: boolean // Mostrar opción "Todo el historial"
  placeholder?: string
  extraShortcuts?: DateRangeShortcut[] // Atajos adicionales al inicio de la lista
  weekOnly?: boolean // Solo modo semana, sin día ni shortcuts Hoy/Ayer
  // Modo "desglose semanal": permite además elegir Mes/Año. El rango resultante
  // siempre cubre semanas COMPLETAS lunes-domingo (se extiende hacia atrás/adelante
  // para no cortar la semana borde). Los datos se siguen mostrando por semana.
  allowMonthYear?: boolean
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

type SelectionMode = 'day' | 'week' | 'month' | 'year' | 'range'

// Formatea una fecha como "5 jun" / "22 jun 2026" para el label de un rango libre.
const MONTH_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const formatRangeLabelPart = (year: number, month: number, day: number, withYear: boolean): string =>
  withYear ? `${day} ${MONTH_SHORT[month]} ${year}` : `${day} ${MONTH_SHORT[month]}`

// Rango de semanas COMPLETAS (lunes-domingo) que cubren un mes.
// Se extiende: del lunes de la semana que contiene el día 1, al domingo de la
// semana que contiene el último día del mes. Así ninguna semana borde se corta.
const getMonthWeekRange = (year: number, month: number): { start: { year: number; month: number; day: number }; end: { year: number; month: number; day: number } } => {
  const lastDay = new Date(year, month + 1, 0).getDate()
  const start = getMondayOfWeek(year, month, 1)
  const end = getSundayOfWeek(year, month, lastDay)
  return { start, end }
}

// Rango de semanas COMPLETAS (lunes-domingo) que cubren un año.
// Del lunes de la semana del 1-ene al domingo de la semana del 31-dic.
const getYearWeekRange = (year: number): { start: { year: number; month: number; day: number }; end: { year: number; month: number; day: number } } => {
  const start = getMondayOfWeek(year, 0, 1)
  const end = getSundayOfWeek(year, 11, 31)
  return { start, end }
}

export function DateRangeSelector({
  selectedRange,
  onRangeChange,
  disabled = false,
  showAllOption = true,
  placeholder = 'Seleccionar fecha',
  extraShortcuts = [],
  weekOnly = false,
  allowMonthYear = false,
}: DateRangeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [viewDate, setViewDate] = useState(new Date())
  // El modo inicial respeta el tipo del rango ya seleccionado (mes/año/semana),
  // así las pestañas reflejan lo que el usuario tiene activo al abrir el dropdown.
  const [selectionMode, setSelectionMode] = useState<SelectionMode>(() => {
    if (allowMonthYear && (selectedRange?.type === 'month' || selectedRange?.type === 'year')) {
      return selectedRange.type
    }
    if (allowMonthYear && selectedRange?.type === 'custom') return 'range'
    return 'week'
  })
  // Rango libre: primer clic fija el ancla (inicio); segundo clic cierra el rango.
  // null = esperando el primer clic.
  const [rangeAnchor, setRangeAnchor] = useState<{ year: number; month: number; day: number } | null>(null)
  // true mientras el usuario está eligiendo un rango nuevo (entró a la pestaña Rango
  // y aún no completó los dos clics). Mientras esté activo, el calendario NO pinta el
  // rango anterior (selectedRange): arranca limpio para que elija desde cero.
  const [rangeSelecting, setRangeSelecting] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Pre-calcular rango seleccionado
  const selectedRangeParsed = useMemo(() => {
    if (!selectedRange || selectedRange.type === 'all') return null
    const start = parseISODate(selectedRange.startDate)
    const end = parseISODate(selectedRange.endDate)
    return { start, end }
  }, [selectedRange])

  // Al abrir, posicionar el calendario en el mes/año del rango seleccionado.
  // Para mes/año el mes lo da el label ("Mayo 2026" / "Año 2026"), no las fechas,
  // porque el rango se extiende a semanas completas que pueden caer en otro mes.
  useEffect(() => {
    if (!isOpen || !selectedRange || selectedRange.type === 'all') return
    // Sincronizar la pestaña activa con el tipo del rango ya seleccionado,
    // así no queda "Mes" activo cuando en realidad hay una semana elegida.
    if (allowMonthYear) {
      if (selectedRange.type === 'month') setSelectionMode('month')
      else if (selectedRange.type === 'year') setSelectionMode('year')
      else if (selectedRange.type === 'custom') setSelectionMode('range')
      else setSelectionMode('week')
    }
    let year: number
    let month: number
    if (selectedRange.type === 'month') {
      const mi = MONTH_NAMES.findIndex(n => selectedRange.label.startsWith(n))
      const ym = selectedRange.label.match(/(\d{4})/)
      if (mi < 0 || !ym) return
      month = mi
      year = Number(ym[1])
    } else if (selectedRange.type === 'year') {
      const ym = selectedRange.label.match(/(\d{4})/)
      if (!ym) return
      year = Number(ym[1])
      // En modo año conservamos el mes que ya mostraba el calendario, así al
      // volver a "Mes" no salta a enero. Solo ajustamos el año.
      setViewDate(prev => prev.getFullYear() === year ? prev : new Date(year, prev.getMonth(), 1))
      return
    } else {
      const p = parseISODate(selectedRange.startDate)
      year = p.year
      month = p.month
    }
    setViewDate(prev =>
      prev.getFullYear() === year && prev.getMonth() === month ? prev : new Date(year, month, 1),
    )
  }, [isOpen, selectedRange])

  // Cerrar al hacer clic fuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        // Descartar un ancla a medio elegir al cerrar sin completar el rango.
        setRangeAnchor(null)
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

  // Construir el rango de un MES completo (semanas lunes-domingo). No cierra el dropdown:
  // se reutiliza tanto al clicar un día como al cambiar de pestaña / navegar.
  const emitMonthRange = (year: number, month: number, close = true) => {
    const { start, end } = getMonthWeekRange(year, month)
    onRangeChange({
      startDate: toISODateString(start.year, start.month, start.day),
      endDate: toISODateString(end.year, end.month, end.day),
      label: `${MONTH_NAMES[month]} ${year}`,
      type: 'month',
    })
    if (close) setIsOpen(false)
  }

  // Construir el rango de un AÑO completo (semanas lunes-domingo).
  const emitYearRange = (year: number, close = true) => {
    const { start, end } = getYearWeekRange(year)
    onRangeChange({
      startDate: toISODateString(start.year, start.month, start.day),
      endDate: toISODateString(end.year, end.month, end.day),
      label: `Año ${year}`,
      type: 'year',
    })
    if (close) setIsOpen(false)
  }

  // Emitir el rango de una SEMANA completa (lunes-domingo) que contiene una fecha.
  const emitWeekRange = (year: number, month: number, day: number, close = true) => {
    const monday = getMondayOfWeek(year, month, day)
    const sunday = getSundayOfWeek(year, month, day)
    const weekNum = getWeekNumber(monday.year, monday.month, monday.day)
    onRangeChange({
      startDate: toISODateString(monday.year, monday.month, monday.day),
      endDate: toISODateString(sunday.year, sunday.month, sunday.day),
      label: `Semana ${weekNum}`,
      type: 'week',
    })
    if (close) setIsOpen(false)
  }

  // Emitir un RANGO LIBRE entre dos fechas EXACTAS (no se estira a semana completa).
  // Trae solo los días entre inicio y fin tal cual los eligió el usuario; la tabla
  // luego agrupa por semana ISO según la fecha de cada viaje, así que las semanas
  // borde quedan PARCIALES (solo los días dentro del rango). El límite por modalidad
  // de cada fila no cambia: lo resuelve useExcesoKmData según la asignación.
  const emitCustomRange = (
    a: { year: number; month: number; day: number },
    b: { year: number; month: number; day: number },
    close = true,
  ) => {
    // Ordenar (el usuario puede clicar el fin antes que el inicio)
    const aTs = getDayTimestamp(a.year, a.month, a.day)
    const bTs = getDayTimestamp(b.year, b.month, b.day)
    const [lo, hi] = aTs <= bTs ? [a, b] : [b, a]
    const sameYear = lo.year === hi.year
    const label = `${formatRangeLabelPart(lo.year, lo.month, lo.day, !sameYear)} – ${formatRangeLabelPart(hi.year, hi.month, hi.day, true)}`
    onRangeChange({
      startDate: toISODateString(lo.year, lo.month, lo.day),
      endDate: toISODateString(hi.year, hi.month, hi.day),
      label,
      type: 'custom',
    })
    if (close) setIsOpen(false)
  }

  // Cambiar de pestaña. Cada modo emite un rango coherente de inmediato para que el
  // resaltado y los datos se actualicen sin tener que clicar un día:
  //  - Mes/Año: selecciona el mes/año que se está viendo en el calendario.
  //  - Semana: selecciona una semana dentro del período visible (la semana de hoy si
  //    cae en el mes/año visible; si no, la primera semana del mes visible). Así no
  //    queda el mes completo seleccionado al pasar de Mes a Semana.
  //  - Rango: no emite todavía; espera dos clics en el calendario (ancla + cierre).
  const handleModeChange = (mode: SelectionMode) => {
    setSelectionMode(mode)
    if (mode === 'range') {
      // Reiniciar: el calendario arranca limpio (sin el rango anterior resaltado) y
      // se arma con dos clics. rangeSelecting=true suprime el pintado de selectedRange.
      setRangeAnchor(null)
      setRangeSelecting(true)
      return
    }
    if (mode === 'month') {
      emitMonthRange(viewDate.getFullYear(), viewDate.getMonth(), false)
    } else if (mode === 'year') {
      emitYearRange(viewDate.getFullYear(), false)
    } else if (mode === 'week') {
      const today = new Date()
      const vy = viewDate.getFullYear()
      const vm = viewDate.getMonth()
      // Si hoy cae en el mes visible, usamos hoy; si no, el día 1 del mes visible.
      if (today.getFullYear() === vy && today.getMonth() === vm) {
        emitWeekRange(vy, vm, today.getDate(), false)
      } else {
        emitWeekRange(vy, vm, 1, false)
      }
    }
  }

  // Navegar con las flechas. En modo Año saltan de año en año; en el resto, mes a mes.
  // En Mes/Año además re-seleccionan el rango para que el cambio se refleje al instante.
  const handleNavigate = (delta: number) => {
    const next = selectionMode === 'year'
      ? new Date(viewDate.getFullYear() + delta, viewDate.getMonth(), 1)
      : new Date(viewDate.getFullYear(), viewDate.getMonth() + delta, 1)
    setViewDate(next)
    if (selectionMode === 'month') emitMonthRange(next.getFullYear(), next.getMonth(), false)
    else if (selectionMode === 'year') emitYearRange(next.getFullYear(), false)
  }

  // Cambiar el año desde el <select>. En modo Mes/Año re-selecciona el rango.
  const handleYearSelect = (year: number) => {
    const next = new Date(year, viewDate.getMonth(), 1)
    setViewDate(next)
    if (selectionMode === 'month') emitMonthRange(year, viewDate.getMonth(), false)
    else if (selectionMode === 'year') emitYearRange(year, false)
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
    } else if (selectionMode === 'month') {
      // Modo mes: trae todas las semanas completas (lunes-domingo) del mes del día clicado.
      emitMonthRange(dayInfo.year, dayInfo.month)
    } else if (selectionMode === 'year') {
      // Modo año: trae todas las semanas completas (lunes-domingo) del año del día clicado.
      emitYearRange(dayInfo.year)
    } else if (selectionMode === 'range') {
      // Rango libre: 1er clic fija el ancla; 2do clic cierra el rango (se extiende a
      // semanas completas). Mantiene el dropdown abierto hasta cerrar el rango.
      const punto = { year: dayInfo.year, month: dayInfo.month, day: dayInfo.day }
      if (!rangeAnchor) {
        setRangeAnchor(punto)
      } else {
        emitCustomRange(rangeAnchor, punto)
        setRangeAnchor(null)
        // Rango completo: vuelve a pintarse el rango ya elegido (selectedRange).
        setRangeSelecting(false)
      }
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

    const weekShortcuts: DateRangeShortcut[] = [
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
    ]

    if (weekOnly) return weekShortcuts

    return [
      ...weekShortcuts,
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
  }, [weekOnly])

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
          {/* Pestañas Día/Semana (modo Bitácora) */}
          {!weekOnly && !allowMonthYear && (
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
          )}

          {/* Pestañas Semana/Mes/Año (Exceso de KM: siempre desglose semanal) */}
          {allowMonthYear && (
          <div className="date-range-tabs">
            <button
              type="button"
              className={`date-range-tab ${selectionMode === 'week' ? 'active' : ''}`}
              onClick={() => handleModeChange('week')}
            >
              Semana
            </button>
            <button
              type="button"
              className={`date-range-tab ${selectionMode === 'month' ? 'active' : ''}`}
              onClick={() => handleModeChange('month')}
            >
              Mes
            </button>
            <button
              type="button"
              className={`date-range-tab ${selectionMode === 'year' ? 'active' : ''}`}
              onClick={() => handleModeChange('year')}
            >
              Año
            </button>
            <button
              type="button"
              className={`date-range-tab ${selectionMode === 'range' ? 'active' : ''}`}
              onClick={() => handleModeChange('range')}
            >
              Rango
            </button>
          </div>
          )}

          {/* Header con navegación */}
          <div className="date-range-header">
            <button type="button" onClick={() => handleNavigate(-1)} className="date-range-nav">
              <ChevronLeft size={16} />
            </button>
            <div className="date-range-month-year">
              <span className="date-range-month">{MONTH_NAMES[viewDate.getMonth()]}</span>
              <select
                className="date-range-year-select"
                value={viewDate.getFullYear()}
                onChange={(e) => handleYearSelect(parseInt(e.target.value))}
              >
                {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i).map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            <button type="button" onClick={() => handleNavigate(1)} className="date-range-nav">
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

              const isRangeMode = selectionMode === 'week' || selectionMode === 'month' || selectionMode === 'year' || selectionMode === 'range'
              const isInRange = isRangeMode && isDayInSelectedRange(dayInfo.timestamp)
              const isStart = isRangeMode && isRangeStart(dayInfo.timestamp)
              const isEnd = isRangeMode && isRangeEnd(dayInfo.timestamp)
              // En modo Rango, resaltar el ancla mientras se espera el 2do clic.
              const isAnchor = selectionMode === 'range' && rangeAnchor != null &&
                getDayTimestamp(rangeAnchor.year, rangeAnchor.month, rangeAnchor.day) === dayInfo.timestamp

              const classes = [
                'date-range-day',
                !dayInfo.isCurrentMonth && 'other-month',
                (isDaySelected || isInRange || isAnchor) && 'selected',
                isDaySelected && 'day-selected',
                (isStart || isAnchor) && 'range-start',
                (isEnd || isAnchor) && 'range-end',
                isToday && !isDaySelected && !isInRange && !isAnchor && 'today',
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

          {/* Ayuda modo Rango: indica el paso actual (elegir inicio / fin) */}
          {selectionMode === 'range' && (
            <div className="date-range-hint">
              {rangeAnchor
                ? `Inicio: ${rangeAnchor.day}/${rangeAnchor.month + 1} — elegí la fecha final`
                : 'Elegí la fecha de inicio del rango'}
            </div>
          )}

          {/* Atajos rápidos */}
          <div className="date-range-shortcuts">
            {extraShortcuts.map(shortcut => (
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
