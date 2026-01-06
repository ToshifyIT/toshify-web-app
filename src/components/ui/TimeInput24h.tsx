// src/components/ui/TimeInput24h.tsx
import { useState, useRef, useEffect } from 'react';
import { Clock } from 'lucide-react';
import './TimeInput24h.css';

interface TimeInput24hProps {
  value: string; // formato "HH:mm"
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

export function TimeInput24h({ value, onChange, disabled = false, className = '' }: TimeInput24hProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parsear el valor actual
  const [hours, minutes] = value ? value.split(':').map(Number) : [9, 0];

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleHourChange = (newHour: number) => {
    const h = String(newHour).padStart(2, '0');
    const m = String(minutes).padStart(2, '0');
    onChange(`${h}:${m}`);
  };

  const handleMinuteChange = (newMinute: number) => {
    const h = String(hours).padStart(2, '0');
    const m = String(newMinute).padStart(2, '0');
    onChange(`${h}:${m}`);
  };

  const formatDisplayTime = () => {
    const h = String(hours).padStart(2, '0');
    const m = String(minutes).padStart(2, '0');
    return `${h}:${m}`;
  };

  // Generar arrays de horas (0-23) y minutos (0-59, de 5 en 5)
  const hoursArray = Array.from({ length: 24 }, (_, i) => i);
  const minutesArray = Array.from({ length: 12 }, (_, i) => i * 5);

  return (
    <div className={`time-input-24h ${className}`} ref={containerRef}>
      <div
        className={`time-input-display ${disabled ? 'disabled' : ''}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <span className="time-value">{formatDisplayTime()}</span>
        <Clock size={16} className="time-icon" />
      </div>

      {isOpen && !disabled && (
        <div className="time-dropdown">
          <div className="time-columns">
            {/* Columna de horas */}
            <div className="time-column">
              <div className="time-column-header">Hora</div>
              <div className="time-scroll">
                {hoursArray.map((h) => (
                  <div
                    key={h}
                    className={`time-option ${h === hours ? 'selected' : ''}`}
                    onClick={() => handleHourChange(h)}
                  >
                    {String(h).padStart(2, '0')}
                  </div>
                ))}
              </div>
            </div>

            {/* Columna de minutos */}
            <div className="time-column">
              <div className="time-column-header">Min</div>
              <div className="time-scroll">
                {minutesArray.map((m) => (
                  <div
                    key={m}
                    className={`time-option ${m === minutes ? 'selected' : ''}`}
                    onClick={() => handleMinuteChange(m)}
                  >
                    {String(m).padStart(2, '0')}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="time-dropdown-footer">
            <button
              className="time-confirm-btn"
              onClick={() => setIsOpen(false)}
            >
              Confirmar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
