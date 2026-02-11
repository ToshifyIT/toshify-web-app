import React, { useState, useEffect } from 'react';

interface DateFilterPillProps {
  onChange: (value: { month: number; year: number }) => void;
}

export const DateFilterPill: React.FC<DateFilterPillProps> = ({ onChange }) => {
  const currentDate = new Date();
  // Default to current month (1-12) and year
  const [month, setMonth] = useState(currentDate.getMonth() + 1);
  const [year, setYear] = useState(currentDate.getFullYear());

  const months = [
    { value: 1, label: 'Enero' },
    { value: 2, label: 'Febrero' },
    { value: 3, label: 'Marzo' },
    { value: 4, label: 'Abril' },
    { value: 5, label: 'Mayo' },
    { value: 6, label: 'Junio' },
    { value: 7, label: 'Julio' },
    { value: 8, label: 'Agosto' },
    { value: 9, label: 'Septiembre' },
    { value: 10, label: 'Octubre' },
    { value: 11, label: 'Noviembre' },
    { value: 12, label: 'Diciembre' },
  ];

  // Years: Current year down to 2024
  const currentYear = new Date().getFullYear();
  const startYear = 2024;
  const years = Array.from(
    { length: currentYear - startYear + 1 }, 
    (_, i) => currentYear - i
  );

  // Notify parent on change
  useEffect(() => {
    onChange({ month, year });
  }, [month, year, onChange]);

  return (
    <div className="filtro-fecha-container">
      <select
        value={month}
        onChange={(e) => setMonth(Number(e.target.value))}
        className="filtro-fecha-select"
      >
        {months.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>

      <div className="filtro-fecha-divider"></div>

      <select
        value={year}
        onChange={(e) => setYear(Number(e.target.value))}
        className="filtro-fecha-select"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
};
