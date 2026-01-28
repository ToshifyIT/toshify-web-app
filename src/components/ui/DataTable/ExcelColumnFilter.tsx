// src/components/ui/DataTable/ExcelColumnFilter.tsx
/**
 * Componente reutilizable para filtros de columna estilo Excel
 * Usa React Portal (createPortal) para renderizar fuera de la tabla y evitar clipping
 */

import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'

// Icono de filtro estilo Excel - dropdown arrow pequeño y sutil
const FilterIcon = ({ size = 8 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 8 6"
    fill="currentColor"
  >
    <path d="M0.5 0.5L4 5L7.5 0.5H0.5Z" />
  </svg>
)

interface ExcelColumnFilterProps {
  /** Nombre de la columna para mostrar en el header */
  label: string
  /** Array de valores únicos para mostrar en el filtro */
  options: string[]
  /** Array de valores seleccionados actualmente */
  selectedValues: string[]
  /** Callback cuando cambia la selección */
  onSelectionChange: (values: string[]) => void
  /** ID único para el filtro (para manejar múltiples filtros abiertos) */
  filterId: string
  /** ID del filtro actualmente abierto (null si ninguno) */
  openFilterId: string | null
  /** Callback para cambiar qué filtro está abierto */
  onOpenChange: (filterId: string | null) => void
}

interface DropdownPosition {
  top: number
  left: number
}

export function ExcelColumnFilter({
  label,
  options,
  selectedValues,
  onSelectionChange,
  filterId,
  openFilterId,
  onOpenChange,
}: ExcelColumnFilterProps) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<DropdownPosition>({ top: 0, left: 0 })
  const [searchTerm, setSearchTerm] = useState('')

  const isOpen = openFilterId === filterId
  const hasSelection = selectedValues.length > 0

  // Limpiar búsqueda cuando se cierra
  useEffect(() => {
    if (!isOpen) {
      setSearchTerm('')
    }
  }, [isOpen])

  // Filtrar opciones por búsqueda
  const filteredOptions = searchTerm
    ? options.filter(opt => opt.toLowerCase().includes(searchTerm.toLowerCase()))
    : options

  // Calcular posición del dropdown cuando se abre
  const calculatePosition = useCallback(() => {
    if (!buttonRef.current) return { top: 0, left: 0 }

    const rect = buttonRef.current.getBoundingClientRect()
    return {
      top: rect.bottom + 4,
      left: rect.left
    }
  }, [])

  // Calcular posición INMEDIATAMENTE cuando se abre (useLayoutEffect para evitar flash)
  useLayoutEffect(() => {
    if (!isOpen || !buttonRef.current) return

    const rect = buttonRef.current.getBoundingClientRect()
    setPosition({
      top: rect.bottom + 4,
      left: rect.left
    })
  }, [isOpen])

  // Ajustar posición si se sale de la pantalla (después del primer render)
  useLayoutEffect(() => {
    if (!isOpen || !dropdownRef.current || !buttonRef.current) return

    const dropdown = dropdownRef.current
    const rect = dropdown.getBoundingClientRect()
    const buttonRect = buttonRef.current.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    let newLeft = buttonRect.left
    let newTop = buttonRect.bottom + 4

    // Si se sale por la derecha
    if (newLeft + rect.width > viewportWidth - 16) {
      newLeft = viewportWidth - rect.width - 16
    }

    // Si se sale por la izquierda
    if (newLeft < 16) {
      newLeft = 16
    }

    // Si se sale por abajo, mostrar arriba del botón
    if (newTop + rect.height > viewportHeight - 16) {
      newTop = buttonRect.top - rect.height - 4
    }

    setPosition({ top: newTop, left: newLeft })
  }, [isOpen])

  // Cerrar al hacer click fuera
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

    // Recalcular posición en scroll/resize
    const handleReposition = () => {
      setPosition(calculatePosition())
    }

    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('scroll', handleReposition, { capture: true, passive: true })
    window.addEventListener('resize', handleReposition, { passive: true })

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('scroll', handleReposition, true)
      window.removeEventListener('resize', handleReposition)
    }
  }, [isOpen, onOpenChange, calculatePosition])

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isOpen) {
      onOpenChange(null)
    } else {
      // Calcular posición inmediatamente antes de abrir
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect()
        setPosition({
          top: rect.bottom + 4,
          left: rect.left
        })
      }
      onOpenChange(filterId)
    }
  }

  const toggleValue = (value: string) => {
    if (selectedValues.includes(value)) {
      onSelectionChange(selectedValues.filter(v => v !== value))
    } else {
      onSelectionChange([...selectedValues, value])
    }
  }

  const clearSelection = () => {
    onSelectionChange([])
  }

  return (
    <div className="dt-column-filter">
      <span>{label} {hasSelection && `(${selectedValues.length})`}</span>
      <button
        ref={buttonRef}
        type="button"
        className={`dt-column-filter-btn ${hasSelection ? 'active' : ''}`}
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
          <input
            type="text"
            placeholder="Buscar..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="dt-column-filter-input"
            autoFocus
          />
          <div className="dt-excel-filter-list">
            {filteredOptions.length === 0 ? (
              <div className="dt-excel-filter-empty">Sin resultados</div>
            ) : (
              filteredOptions.map(option => (
                <label
                  key={option}
                  className={`dt-column-filter-checkbox ${selectedValues.includes(option) ? 'selected' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={selectedValues.includes(option)}
                    onChange={() => toggleValue(option)}
                  />
                  <span>{option}</span>
                </label>
              ))
            )}
          </div>
          {hasSelection && (
            <button
              type="button"
              className="dt-column-filter-clear"
              onClick={() => { clearSelection(); setSearchTerm(''); }}
            >
              Limpiar ({selectedValues.length})
            </button>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}

/**
 * Hook para manejar múltiples filtros Excel en una tabla
 * @returns Estado y funciones para manejar filtros
 */
export function useExcelFilters() {
  const [openFilterId, setOpenFilterId] = useState<string | null>(null)

  // Cerrar todos los filtros al presionar Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenFilterId(null)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  return {
    openFilterId,
    setOpenFilterId,
  }
}

export default ExcelColumnFilter
