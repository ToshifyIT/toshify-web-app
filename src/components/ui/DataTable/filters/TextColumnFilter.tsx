import { BaseFilterDropdown } from './BaseFilterDropdown'
import { Search } from 'lucide-react'

interface TextColumnFilterProps {
  label: string
  value: string
  onChange: (value: string) => void
  filterId: string
  openFilterId: string | null
  onOpenChange: (filterId: string | null) => void
  placeholder?: string
}

export function TextColumnFilter({
  label,
  value,
  onChange,
  filterId,
  openFilterId,
  onOpenChange,
  placeholder
}: TextColumnFilterProps) {
  const isOpen = openFilterId === filterId
  const isActive = !!value

  const handleClear = () => {
    onChange('')
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
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder || `Buscar ${label.toLowerCase()}...`}
            autoFocus
            style={{
              padding: '8px 8px 8px 32px',
              border: '1px solid #D1D5DB',
              borderRadius: '4px',
              fontSize: '13px',
              width: '100%'
            }}
          />
        </div>
      </div>
    </BaseFilterDropdown>
  )
}
