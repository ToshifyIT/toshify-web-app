import { useState, useRef, useEffect, useMemo } from 'react';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { startOfISOWeek, endOfISOWeek, format, setISOWeek, isSameDay, isWithinInterval, subWeeks } from 'date-fns';
// import { es } from 'date-fns/locale';
import './WeekSelector.css';

interface WeekSelectorProps {
  selectedWeek: string; // Format: "YYYY-Www"
  onWeekChange: (week: string) => void;
}

// Días de la semana (Lunes a Domingo)
const DAYS_SHORT = ['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'];
const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                     'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export function WeekSelector({ selectedWeek, onWeekChange }: WeekSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  // Parse initial date from selectedWeek string
  const getInitialDate = () => {
    try {
      const [yearStr, weekStr] = selectedWeek.split('-W');
      const year = parseInt(yearStr);
      const week = parseInt(weekStr);
      const simpleDate = new Date(year, 0, 4); // 4th Jan is always in week 1
      const weekDate = setISOWeek(simpleDate, week);
      return startOfISOWeek(weekDate);
    } catch (e) {
      return new Date();
    }
  };

  const [viewDate, setViewDate] = useState(getInitialDate());
  const [selectionMode, setSelectionMode] = useState<'day' | 'week'>('week');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync viewDate when selectedWeek changes externally (optional, but good for consistency)
  useEffect(() => {
    setViewDate(getInitialDate());
  }, [selectedWeek]);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Helpers for week calculation
  const getWeekStrFromDate = (date: Date) => {
    const year = format(date, 'R'); // ISO week-numbering year
    const week = format(date, 'I'); // ISO week number
    return `${year}-W${week.toString().padStart(2, '0')}`;
  };

  const selectedDateStart = getInitialDate();
  const selectedDateEnd = endOfISOWeek(selectedDateStart);

  // Generate calendar days
  const calendarDays = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const days = [];
    
    // Days from previous month
    // getDay(): 0=Sun, 1=Mon... 
    // We want Mon=0, Sun=6 for calculation of padding
    const startDayOfWeek = firstDay.getDay(); // 0-6
    const daysFromPrevMonth = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

    for (let i = daysFromPrevMonth; i > 0; i--) {
      const d = new Date(year, month, 1 - i);
      days.push({ date: d, isCurrentMonth: false });
    }

    // Days from current month
    for (let i = 1; i <= lastDay.getDate(); i++) {
      const d = new Date(year, month, i);
      days.push({ date: d, isCurrentMonth: true });
    }

    // Days from next month
    const remainingDays = 7 - (days.length % 7);
    if (remainingDays < 7) {
      for (let i = 1; i <= remainingDays; i++) {
        const d = new Date(year, month + 1, i);
        days.push({ date: d, isCurrentMonth: false });
      }
    }

    return days;
  }, [viewDate]);

  // Handle day click
  const handleDayClick = (date: Date) => {
    const weekStr = getWeekStrFromDate(date);
    onWeekChange(weekStr);
    setIsOpen(false);
  };

  // Button label
  const getButtonLabel = () => {
    const [year, week] = selectedWeek.split('-W');
    // Check if it's current week
    const currentWeekStr = getWeekStrFromDate(new Date());
    if (selectedWeek === currentWeekStr) {
      return `Esta semana (S${parseInt(week)})`;
    }
    return `Semana ${parseInt(week)} (${year})`;
  };

  // Quick shortcuts
  const currentWeekStr = getWeekStrFromDate(new Date());
  const lastWeekDate = subWeeks(new Date(), 1);
  const lastWeekStr = getWeekStrFromDate(lastWeekDate);

  // Check if a day is selected (in range)
  const isSelected = (date: Date) => {
    return isWithinInterval(date, { start: selectedDateStart, end: selectedDateEnd });
  };

  const isToday = (date: Date) => isSameDay(date, new Date());

  // Helper for rounded corners on week selection
  const getDayPosition = (date: Date) => {
    const day = date.getDay(); // 0=Sun, 1=Mon
    const isFirst = day === 1; // Monday
    const isLast = day === 0; // Sunday
    return { isFirst, isLast };
  };

  return (
    <div className="week-selector-container">
      {/* Dropdown Selector */}
      <div className="week-calendar-selector" ref={dropdownRef}>
        <button
          type="button"
          className="week-calendar-btn"
          onClick={() => setIsOpen(!isOpen)}
        >
          <Calendar size={16} />
          <span>{getButtonLabel()}</span>
          <ChevronDown size={14} className={isOpen ? 'rotate' : ''} />
        </button>

        {isOpen && (
          <div className="week-calendar-dropdown">
            {/* Tabs */}
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

            {/* Header */}
            <div className="week-calendar-header">
              <button 
                type="button" 
                onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))} 
                className="week-calendar-nav"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="week-calendar-month">
                {MONTH_NAMES[viewDate.getMonth()]} {viewDate.getFullYear()}
              </span>
              <button 
                type="button" 
                onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))} 
                className="week-calendar-nav"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Days Header */}
            <div className="week-calendar-days-header">
              {DAYS_SHORT.map(day => (
                <div key={day} className="week-calendar-day-name">{day}</div>
              ))}
            </div>

            {/* Grid */}
            <div className="week-calendar-grid">
              {calendarDays.map((item, index) => {
                const selected = isSelected(item.date);
                const { isFirst, isLast } = getDayPosition(item.date);
                
                let classes = 'week-calendar-day';
                if (!item.isCurrentMonth) classes += ' other-month';
                if (isToday(item.date) && !selected) classes += ' today';
                if (selected) {
                   classes += ' selected';
                   if (isFirst) classes += ' week-start';
                   if (isLast) classes += ' week-end';
                }

                return (
                  <div
                    key={index}
                    className={classes}
                    onClick={() => handleDayClick(item.date)}
                  >
                    <span>{item.date.getDate()}</span>
                  </div>
                );
              })}
            </div>

            {/* Shortcuts */}
            <div className="week-calendar-shortcuts">
              <button
                type="button"
                className={`week-calendar-shortcut ${selectedWeek === currentWeekStr ? 'active' : ''}`}
                onClick={() => {
                  onWeekChange(currentWeekStr);
                  setIsOpen(false);
                }}
              >
                Esta semana (S{parseInt(currentWeekStr.split('-W')[1])})
              </button>
              <button
                type="button"
                className={`week-calendar-shortcut ${selectedWeek === lastWeekStr ? 'active' : ''}`}
                onClick={() => {
                  onWeekChange(lastWeekStr);
                  setIsOpen(false);
                }}
              >
                Semana pasada (S{parseInt(lastWeekStr.split('-W')[1])})
              </button>
            </div>
          </div>
        )}
      </div>

      {/* School Tracking Action - HIDDEN PER USER REQUEST */}
      {/* <div className="week-extra-actions">
        <button 
          className="week-refresh-btn" 
          onClick={onSchoolTrackingClick} 
          title="Escuela Conductores"
        >
          <GraduationCap size={16} />
          <span>Escuela Conductores</span>
        </button>
      </div> */}
    </div>
  );
}
