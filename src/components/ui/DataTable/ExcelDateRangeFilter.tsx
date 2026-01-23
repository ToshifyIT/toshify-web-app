import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Filter, Calendar } from 'lucide-react'
import './DataTable.css' // Assuming styles are shared or I'll add inline styles for specific layout

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

  // Calcular posición inmediatamente cuando se abre
  useLayoutEffect(() => {
    if (!isOpen || !buttonRef.current) return

    const rect = buttonRef.current.getBoundingClientRect()
    setPosition({
      top: rect.bottom + 4,
      left: rect.left
    })
  }, [isOpen])

  // Manejar clic fuera para cerrar
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        onOpenChange(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('resize', () => onOpenChange(null))
    window.addEventListener('scroll', () => onOpenChange(null), true)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('resize', () => onOpenChange(null))
      window.removeEventListener('scroll', () => onOpenChange(null), true)
    }
  }, [isOpen, onOpenChange])

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    onOpenChange(isOpen ? null : filterId)
  }

  const handleClear = () => {
    onRangeChange(null, null)
    // No cerramos el filtro al limpiar para permitir nueva selección si se desea
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
          className="dt-column-filter-dropdown dt-filter-portal"
          style={{
            position: 'fixed',
            top: position.top,
            left: position.left,
            padding: '12px',
            width: '240px',
            cursor: 'default'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151' }}>Desde:</label>
              <input
                type="date"
                value={startDate || ''}
                onChange={(e) => onRangeChange(e.target.value || null, endDate)}
                className="dt-column-filter-input"
                style={{ width: '100%' }}
              />
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151' }}>Hasta:</label>
              <input
                type="date"
                value={endDate || ''}
                onChange={(e) => onRangeChange(startDate, e.target.value || null)}
                className="dt-column-filter-input"
                style={{ width: '100%' }}
              />
            </div>

            {hasSelection && (
              <button
                type="button"
                className="dt-column-filter-clear"
                onClick={handleClear}
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
