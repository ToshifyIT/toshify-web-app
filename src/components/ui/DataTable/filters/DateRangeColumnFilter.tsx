import { useRef } from 'react'
import { BaseFilterDropdown } from './BaseFilterDropdown'
import { Calendar } from 'lucide-react'

interface DateRangeValue {
  from: string | null
  to: string | null
}

interface DateRangeColumnFilterProps {
  label: string
  value: DateRangeValue
  onChange: (value: DateRangeValue) => void
  filterId: string
  openFilterId: string | null
  onOpenChange: (filterId: string | null) => void
  placeholder?: string
}

/**
 * Componente de filtro de rango de fechas.
 * Soporta entrada de texto (dd/mm/aaaa) con máscara automática y selector de fecha nativo.
 */
export function DateRangeColumnFilter({
  label,
  value,
  onChange,
  filterId,
  openFilterId,
  onOpenChange,
  placeholder = 'dd/mm/aaaa'
}: DateRangeColumnFilterProps) {
  const isOpen = openFilterId === filterId
  const isActive = !!(value.from || value.to)
  const fromPickerRef = useRef<HTMLInputElement>(null)
  const toPickerRef = useRef<HTMLInputElement>(null)

  const handleClear = () => {
    onChange({ from: null, to: null })
    onOpenChange(null)
  }

  const handleDateTextChange = (field: 'from' | 'to', inputValue: string) => {
    // Allow only numbers and slashes
    const cleaned = inputValue.replace(/[^0-9/]/g, '')
    
    // Auto-insert slashes
    let formatted = cleaned
    const currentValue = field === 'from' ? (value.from || '') : (value.to || '')
    
    if (cleaned.length === 2 && inputValue.length > currentValue.length) {
       formatted = cleaned + '/'
    } else if (cleaned.length === 5 && inputValue.length > currentValue.length) {
       formatted = cleaned + '/'
    }
    
    if (formatted.length > 10) return

    onChange({
      ...value,
      [field]: formatted || null
    })
  }

  const handlePickerChange = (field: 'from' | 'to', inputValue: string) => {
     if (!inputValue) return
     const [y, m, d] = inputValue.split('-')
     onChange({
      ...value,
      [field]: `${d}/${m}/${y}`
     })
  }

  return (
    <BaseFilterDropdown
      label={label}
      isActive={isActive}
      isOpen={isOpen}
      onToggle={() => onOpenChange(isOpen ? null : filterId)}
      onClose={() => onOpenChange(null)}
      onClear={handleClear}
    >
      <div className="dt-filter-date" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '12px', fontWeight: 500, color: '#374151' }}>Desde:</span>
          <div className="dt-date-input-container" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              type="text"
              placeholder={placeholder}
              value={value.from || ''}
              onChange={e => handleDateTextChange('from', e.target.value)}
              className="dt-date-input"
              maxLength={10}
              style={{
                padding: '8px 30px 8px 8px',
                border: '1px solid #D1D5DB',
                borderRadius: '4px',
                fontSize: '13px',
                width: '100%'
              }}
            />
            <Calendar 
                className="dt-date-icon" 
                size={14} 
                style={{ position: 'absolute', right: '8px', color: '#6B7280', cursor: 'pointer' }}
                onClick={() => fromPickerRef.current?.showPicker()}
            />
            <input
              ref={fromPickerRef}
              type="date"
              className="dt-hidden-date-picker"
              style={{ position: 'absolute', opacity: 0, width: 0, height: 0, bottom: 0, left: 0, border: 0, padding: 0, pointerEvents: 'none' }}
              onChange={e => handlePickerChange('from', e.target.value)}
              tabIndex={-1}
            />
          </div>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '12px', fontWeight: 500, color: '#374151' }}>Hasta:</span>
          <div className="dt-date-input-container" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              type="text"
              placeholder={placeholder}
              value={value.to || ''}
              onChange={e => handleDateTextChange('to', e.target.value)}
              className="dt-date-input"
              maxLength={10}
              style={{
                padding: '8px 30px 8px 8px',
                border: '1px solid #D1D5DB',
                borderRadius: '4px',
                fontSize: '13px',
                width: '100%'
              }}
            />
            <Calendar 
                className="dt-date-icon" 
                size={14} 
                style={{ position: 'absolute', right: '8px', color: '#6B7280', cursor: 'pointer' }}
                onClick={() => toPickerRef.current?.showPicker()}
            />
            <input
              ref={toPickerRef}
              type="date"
              className="dt-hidden-date-picker"
              style={{ position: 'absolute', opacity: 0, width: 0, height: 0, bottom: 0, left: 0, border: 0, padding: 0, pointerEvents: 'none' }}
              onChange={e => handlePickerChange('to', e.target.value)}
              tabIndex={-1}
            />
          </div>
        </label>
      </div>
    </BaseFilterDropdown>
  )
}
