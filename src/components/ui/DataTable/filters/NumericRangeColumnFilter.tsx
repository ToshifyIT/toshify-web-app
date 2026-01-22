import { BaseFilterDropdown } from './BaseFilterDropdown'

interface NumericRangeValue {
  min: string | null // Using string to handle empty inputs easier
  max: string | null
}

interface NumericRangeColumnFilterProps {
  label: string
  value: NumericRangeValue
  onChange: (value: NumericRangeValue) => void
  filterId: string
  openFilterId: string | null
  onOpenChange: (filterId: string | null) => void
  prefix?: string // e.g. "$"
}

export function NumericRangeColumnFilter({
  label,
  value,
  onChange,
  filterId,
  openFilterId,
  onOpenChange,
  prefix
}: NumericRangeColumnFilterProps) {
  const isOpen = openFilterId === filterId
  const isActive = !!(value.min || value.max)

  const handleClear = () => {
    onChange({ min: null, max: null })
    onOpenChange(null)
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151' }}>Mínimo</label>
          <div style={{ position: 'relative' }}>
            {prefix && (
              <span style={{ 
                position: 'absolute', 
                left: '8px', 
                top: '50%', 
                transform: 'translateY(-50%)',
                color: '#9CA3AF',
                fontSize: '13px'
              }}>
                {prefix}
              </span>
            )}
            <input
              type="number"
              value={value.min || ''}
              onChange={(e) => onChange({ ...value, min: e.target.value || null })}
              placeholder="0"
              style={{
                padding: '8px',
                paddingLeft: prefix ? '24px' : '8px',
                border: '1px solid #D1D5DB',
                borderRadius: '4px',
                fontSize: '13px',
                width: '100%'
              }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151' }}>Máximo</label>
          <div style={{ position: 'relative' }}>
            {prefix && (
              <span style={{ 
                position: 'absolute', 
                left: '8px', 
                top: '50%', 
                transform: 'translateY(-50%)',
                color: '#9CA3AF',
                fontSize: '13px'
              }}>
                {prefix}
              </span>
            )}
            <input
              type="number"
              value={value.max || ''}
              onChange={(e) => onChange({ ...value, max: e.target.value || null })}
              placeholder="Max"
              style={{
                padding: '8px',
                paddingLeft: prefix ? '24px' : '8px',
                border: '1px solid #D1D5DB',
                borderRadius: '4px',
                fontSize: '13px',
                width: '100%'
              }}
            />
          </div>
        </div>
      </div>
    </BaseFilterDropdown>
  )
}
