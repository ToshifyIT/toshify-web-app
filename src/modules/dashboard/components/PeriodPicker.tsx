import { useState, useRef, useEffect, useMemo } from 'react'
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameMonth, 
  getWeek, 
  startOfWeek, 
  endOfWeek, 
  setWeek, 
  addYears, 
  subYears, 
  parse,
  isValid,
  isSameDay
} from 'date-fns'
import { es } from 'date-fns/locale'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'

type Granularity = 'dia' | 'semana' | 'mes' | 'ano'

interface PeriodPickerProps {
  granularity: Granularity
  value: string
  onChange: (value: string) => void
  label?: string
  className?: string
}

export function PeriodPicker({ granularity, value, onChange, label, className = '' }: PeriodPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  
  // State for week hover effect
  const [hoveredDate, setHoveredDate] = useState<Date | null>(null)

  // Parse initial view date from value string
  const getInitialViewDate = () => {
    const now = new Date()
    try {
      if (granularity === 'dia') {
        // Try DD/MM/YYYY
        if (value.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
          return parse(value, 'dd/MM/yyyy', now)
        }
        // Try DD/MM (assume current year)
        const parts = value.split('/')
        if (parts.length === 2) {
            const day = parseInt(parts[0], 10)
            const month = parseInt(parts[1], 10)
            let date = new Date(now.getFullYear(), month - 1, day)
            // Heuristic: if date is in future, maybe previous year? 
            // Consistent with periodUtils
            if (date > now) date = subYears(date, 1)
            return date
        }
      } else if (granularity === 'semana') {
         // Try "Sem XX YYYY"
         const match = value.match(/Sem (\d+) (\d{4})/)
         if (match) {
           const week = parseInt(match[1], 10)
           const year = parseInt(match[2], 10)
           return setWeek(new Date(year, 0, 4), week, { weekStartsOn: 1 })
         }
         // Try "Sem XX"
         const simpleMatch = value.match(/Sem (\d+)/)
         if (simpleMatch) {
            const week = parseInt(simpleMatch[1], 10)
            return setWeek(new Date(now.getFullYear(), 0, 4), week, { weekStartsOn: 1 })
         }
      } else if (granularity === 'mes') {
          // "Mmm YYYY"
          const parsed = parse(value, 'MMM yyyy', now, { locale: es })
          if (isValid(parsed)) return parsed
      } else if (granularity === 'ano') {
          // "YYYY"
          const parsed = parse(value, 'yyyy', now)
          if (isValid(parsed)) return parsed
      }
    } catch (e) {
      console.error('Error parsing date for picker', e)
    }
    return now
  }

  const [viewDate, setViewDate] = useState(getInitialViewDate)

  // Update viewDate when reopening or value changes externally
  useEffect(() => {
    if (isOpen) {
      setViewDate(getInitialViewDate())
    }
  }, [isOpen, granularity]) // value omitted to avoid resetting view while navigating

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handlePrev = () => {
    if (granularity === 'dia' || granularity === 'semana') {
      setViewDate(subMonths(viewDate, 1))
    } else if (granularity === 'mes') {
      setViewDate(subYears(viewDate, 1))
    } else if (granularity === 'ano') {
      setViewDate(subYears(viewDate, 12)) // Page of 12 years
    }
  }

  const handleNext = () => {
    if (granularity === 'dia' || granularity === 'semana') {
      setViewDate(addMonths(viewDate, 1))
    } else if (granularity === 'mes') {
      setViewDate(addYears(viewDate, 1))
    } else if (granularity === 'ano') {
      setViewDate(addYears(viewDate, 12))
    }
  }

  const handleDaySelect = (day: Date) => {
    // Return DD/MM/YYYY to support full history
    const newVal = format(day, 'dd/MM/yyyy')
    onChange(newVal)
    setIsOpen(false)
  }

  const handleWeekSelect = (day: Date) => {
    const weekNum = getWeek(day, { weekStartsOn: 1 })
    const year = day.getFullYear() 
    // Format: "Sem XX YYYY"
    const newVal = `Sem ${weekNum.toString().padStart(2, '0')} ${year}`
    onChange(newVal)
    setIsOpen(false)
  }

  const handleMonthSelect = (date: Date) => {
    // Format: "Mmm YYYY" (e.g. Ene 2025)
    const monthName = format(date, 'MMM', { locale: es })
    // Capitalize first letter
    const capitalized = monthName.charAt(0).toUpperCase() + monthName.slice(1)
    const newVal = `${capitalized} ${format(date, 'yyyy')}`
    onChange(newVal)
    setIsOpen(false)
  }

  const handleYearSelect = (year: number) => {
    const newVal = year.toString()
    onChange(newVal)
    setIsOpen(false)
  }

  // Helpers for calendar rendering
  const calendarDays = useMemo(() => {
    if (granularity !== 'dia' && granularity !== 'semana') return []
    
    const monthStart = startOfMonth(viewDate)
    const monthEnd = endOfMonth(monthStart)
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 })
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 })
    return eachDayOfInterval({ start: startDate, end: endDate })
  }, [viewDate, granularity])

  const isSelected = (day: Date) => {
      if (granularity === 'dia') {
          if (value.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
              return format(day, 'dd/MM/yyyy') === value
          }
           // Fallback for DD/MM
           const formatted = format(day, 'dd/MM')
           // Only match if month/day match. Year might be ambiguous in value, so we check strictly if value has year
           return formatted === value
      }
      if (granularity === 'semana') {
          const currentWeek = getWeek(day, { weekStartsOn: 1 })
          const currentYear = day.getFullYear()
          
          const match = value.match(/Sem (\d+) (\d{4})/)
          if (match) {
              return parseInt(match[1], 10) === currentWeek && parseInt(match[2], 10) === currentYear
          }
          const simpleMatch = value.match(/Sem (\d+)/)
          if (simpleMatch) {
              // Weak check for simple format
              return parseInt(simpleMatch[1], 10) === currentWeek
          }
      }
      return false
  }

  const isWeekHovered = (day: Date) => {
      if (granularity !== 'semana' || !hoveredDate) return false
      return getWeek(day, { weekStartsOn: 1 }) === getWeek(hoveredDate, { weekStartsOn: 1 }) && 
             day.getFullYear() === hoveredDate.getFullYear()
  }

  const renderHeader = () => {
    let title = ''
    if (granularity === 'dia' || granularity === 'semana') {
      title = format(viewDate, 'MMMM yyyy', { locale: es })
    } else if (granularity === 'mes') {
      title = format(viewDate, 'yyyy')
    } else if (granularity === 'ano') {
      const startYear = viewDate.getFullYear() - 5
      const endYear = viewDate.getFullYear() + 6
      title = `${startYear} - ${endYear}`
    }

    return (
      <div className="flex items-center justify-between mb-4 px-1">
        <button 
          onClick={(e) => { e.stopPropagation(); handlePrev() }} 
          className="p-1 hover:bg-gray-100 rounded-full text-gray-600 transition-colors"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="font-semibold text-gray-800 capitalize select-none">{title}</span>
        <button 
          onClick={(e) => { e.stopPropagation(); handleNext() }} 
          className="p-1 hover:bg-gray-100 rounded-full text-gray-600 transition-colors"
        >
          <ChevronRight size={18} />
        </button>
      </div>
    )
  }

  const renderCalendar = () => {
    const weekDays = ['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO']

    return (
      <div className="w-64 select-none">
        <div className="grid grid-cols-7 mb-2">
          {weekDays.map(d => (
            <div key={d} className="text-center text-xs font-bold text-gray-400 py-1">
              {d}
            </div>
          ))}
        </div>
        <div 
            className="grid grid-cols-7 gap-y-1" 
            onMouseLeave={() => setHoveredDate(null)}
        >
          {calendarDays.map((day, idx) => {
            const isCurrentMonth = isSameMonth(day, viewDate)
            const selected = isSelected(day)
            const weekHovered = isWeekHovered(day)
            
            let bgClass = 'hover:bg-gray-100'
            let textClass = 'text-gray-700'
            
            if (selected) {
                bgClass = 'bg-[#ef4444] text-white hover:bg-[#dc2626]'
                textClass = 'text-white'
            } else if (weekHovered && granularity === 'semana') {
                bgClass = 'bg-red-50 text-[#ef4444]'
                textClass = 'text-[#ef4444]'
            } else if (!isCurrentMonth) {
                textClass = 'text-gray-300'
                bgClass = 'hover:bg-transparent'
            }

            // Rounded corners for week range
            let roundedClass = 'rounded-md'
            if (granularity === 'semana' && (selected || weekHovered)) {
                const dayOfWeek = day.getDay() // 0=Sun, 1=Mon...
                // Adjust for ISO week (Mon=1 ... Sun=7)
                const isoDay = dayOfWeek === 0 ? 7 : dayOfWeek
                
                if (isoDay === 1) roundedClass = 'rounded-l-md rounded-r-none'
                else if (isoDay === 7) roundedClass = 'rounded-r-md rounded-l-none'
                else roundedClass = 'rounded-none'
            }

            return (
              <div
                key={day.toString()}
                onClick={(e) => {
                    e.stopPropagation()
                    if (granularity === 'dia') handleDaySelect(day)
                    else handleWeekSelect(day)
                }}
                onMouseEnter={() => setHoveredDate(day)}
                className={`
                  relative h-8 w-full flex items-center justify-center text-sm cursor-pointer transition-colors
                  ${textClass}
                  ${bgClass}
                  ${roundedClass}
                `}
              >
                 {format(day, 'd')}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const renderMonths = () => {
    const months = [
        'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
        'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
    ]
    const currentYear = viewDate.getFullYear()
    
    return (
        <div className="grid grid-cols-3 gap-2 w-64 select-none">
            {months.map((m, idx) => {
                const date = new Date(currentYear, idx, 1)
                const monthStr = format(date, 'MMM', { locale: es })
                
                // Check selection loosely
                const isSel = value.toLowerCase().includes(monthStr.toLowerCase()) && value.includes(currentYear.toString())
                
                return (
                    <button
                        key={m}
                        onClick={(e) => { e.stopPropagation(); handleMonthSelect(date) }}
                        className={`
                            py-2 px-1 text-sm rounded-md transition-colors
                            ${isSel 
                                ? 'bg-[#ef4444] text-white shadow-sm' 
                                : 'hover:bg-gray-100 text-gray-700'
                            }
                        `}
                    >
                        {m}
                    </button>
                )
            })}
        </div>
    )
  }

  const renderYears = () => {
    const centerYear = viewDate.getFullYear()
    const years = []
    for (let i = centerYear - 5; i <= centerYear + 6; i++) {
        years.push(i)
    }

    return (
        <div className="grid grid-cols-3 gap-2 w-64 select-none">
            {years.map(y => {
                const isSel = value === y.toString()
                return (
                    <button
                        key={y}
                        onClick={(e) => { e.stopPropagation(); handleYearSelect(y) }}
                        className={`
                            py-2 px-1 text-sm rounded-md transition-colors
                            ${isSel 
                                ? 'bg-[#ef4444] text-white shadow-sm' 
                                : 'hover:bg-gray-100 text-gray-700'
                            }
                        `}
                    >
                        {y}
                    </button>
                )
            })}
        </div>
    )
  }

  return (
    <div className={`period-picker relative ${className}`} ref={containerRef}>
      {label && <label className="period-picker__label block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">{label}</label>}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`
          period-picker__select
          flex items-center gap-2 px-3 py-2 bg-white border rounded-lg text-sm font-medium transition-all w-full justify-between shadow-sm
          ${isOpen ? 'border-[#ef4444] ring-1 ring-[#ef4444]/20' : 'border-gray-200 hover:border-gray-300 hover:shadow'}
        `}
      >
        <div className="flex items-center gap-2.5 text-gray-700">
            <CalendarIcon size={16} className="text-[#ef4444] calendar-icon" />
            <span className="truncate">{value}</span>
        </div>
        <ChevronDown size={14} className={`text-gray-400 transition-transform duration-200 chevron-icon ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 z-50 bg-white rounded-lg shadow-xl border border-gray-100 p-4 animate-in fade-in zoom-in-95 duration-100 origin-top-left min-w-[280px]">
          {renderHeader()}
          
          {(granularity === 'dia' || granularity === 'semana') && renderCalendar()}
          {granularity === 'mes' && renderMonths()}
          {granularity === 'ano' && renderYears()}
        </div>
      )}
    </div>
  )
}
