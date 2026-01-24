// src/components/ui/ColumnFilterDropdown.tsx
/**
 * Dropdown flotante para filtros de columna tipo Excel
 * Usa React Portal para renderizar fuera de la tabla y evitar clipping
 */

import { useState, useRef, useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// Icono de filtro estilo Excel - dropdown arrow
const FilterIcon = ({ size = 12 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 12 12"
    fill="currentColor"
  >
    <path d="M2 4L6 8L10 4H2Z" />
  </svg>
)

interface ColumnFilterDropdownProps {
  /** ID único del filtro (ej: 'patente', 'conductor') */
  filterId: string
  /** Label de la columna */
  label: string
  /** Cantidad de filtros activos */
  activeCount: number
  /** ID del filtro actualmente abierto */
  openFilter: string | null
  /** Callback para cambiar el filtro abierto */
  onOpenChange: (id: string | null) => void
  /** Contenido del dropdown */
  children: ReactNode
}

export function ColumnFilterDropdown({
  filterId,
  label,
  activeCount,
  openFilter,
  onOpenChange,
  children
}: ColumnFilterDropdownProps) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ top: 0, left: 0 })

  const isOpen = openFilter === filterId

  // Calcular posición cuando se abre
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setPosition({
        top: rect.bottom + 4,
        left: rect.left
      })
    }
  }, [isOpen])

  // Cerrar al hacer click fuera
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        onOpenChange(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, onOpenChange])

  // Ajustar posición si se sale de la pantalla
  useEffect(() => {
    if (!isOpen || !dropdownRef.current) return

    const dropdown = dropdownRef.current
    const rect = dropdown.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    let newLeft = position.left
    let newTop = position.top

    // Si se sale por la derecha
    if (rect.right > viewportWidth - 16) {
      newLeft = viewportWidth - rect.width - 16
    }

    // Si se sale por abajo
    if (rect.bottom > viewportHeight - 16) {
      // Mostrar arriba del botón
      if (buttonRef.current) {
        const buttonRect = buttonRef.current.getBoundingClientRect()
        newTop = buttonRect.top - rect.height - 4
      }
    }

    if (newLeft !== position.left || newTop !== position.top) {
      setPosition({ top: newTop, left: newLeft })
    }
  }, [isOpen, position])

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    onOpenChange(isOpen ? null : filterId)
  }

  return (
    <div className="dt-column-filter">
      <span>{label} {activeCount > 0 && `(${activeCount})`}</span>
      <button
        ref={buttonRef}
        className={`dt-column-filter-btn ${activeCount > 0 ? 'active' : ''}`}
        onClick={handleToggle}
        title={`Filtrar por ${label.toLowerCase()}`}
      >
        <FilterIcon size={12} />
      </button>
      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          className="dt-column-filter-dropdown dt-excel-filter dt-filter-portal"
          style={{
            position: 'fixed',
            top: position.top,
            left: position.left,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>,
        document.body
      )}
    </div>
  )
}

interface ExcelFilterContentProps {
  /** Valor de búsqueda */
  searchValue: string
  /** Callback para cambiar búsqueda */
  onSearchChange: (value: string) => void
  /** Placeholder del input */
  searchPlaceholder?: string
  /** Items a mostrar */
  items: string[]
  /** Items seleccionados */
  selectedItems: string[]
  /** Callback para toggle de item */
  onToggleItem: (item: string) => void
  /** Callback para limpiar selección */
  onClear: () => void
  /** Si muestra el input de búsqueda */
  showSearch?: boolean
}

export function ExcelFilterContent({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Buscar...',
  items,
  selectedItems,
  onToggleItem,
  onClear,
  showSearch = true
}: ExcelFilterContentProps) {
  return (
    <>
      {showSearch && (
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          className="dt-column-filter-input"
          autoFocus
        />
      )}
      <div className="dt-excel-filter-list">
        {items.length === 0 ? (
          <div className="dt-excel-filter-empty">Sin resultados</div>
        ) : (
          items.map(item => (
            <label
              key={item}
              className={`dt-column-filter-checkbox ${selectedItems.includes(item) ? 'selected' : ''}`}
            >
              <input
                type="checkbox"
                checked={selectedItems.includes(item)}
                onChange={() => onToggleItem(item)}
              />
              <span>{item}</span>
            </label>
          ))
        )}
      </div>
      {selectedItems.length > 0 && (
        <button className="dt-column-filter-clear" onClick={onClear}>
          Limpiar ({selectedItems.length})
        </button>
      )}
    </>
  )
}
