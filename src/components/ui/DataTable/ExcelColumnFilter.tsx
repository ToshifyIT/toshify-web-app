// src/components/ui/DataTable/ExcelColumnFilter.tsx
/**
 * Componente reutilizable para filtros de columna estilo Excel
 * Usa React Portal (createPortal) para renderizar fuera de la tabla y evitar clipping
 */

import { useState, useRef, useEffect, useCallback, useLayoutEffect, useMemo } from 'react'
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
  options: (string | { value: string; label: string })[]
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
  /** Con más de 3 opciones muestra «Seleccionar todas» (como el filtro del DataTable). Por defecto, sí. */
  selectAll?: boolean
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
  selectAll = true,
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

  // Normalizar opciones + siempre incluir los valores ya seleccionados
  // para que el usuario pueda deseleccionar aunque no haya resultados
  const normalizedOptions = useMemo(() => {
    const base = options.map(opt =>
      typeof opt === 'string' ? { label: opt, value: opt } : opt
    )
    // Agregar valores seleccionados que no estén ya en la lista
    const values = new Set(base.map(o => o.value))
    for (const sel of selectedValues) {
      if (!values.has(sel)) {
        base.push({ label: sel, value: sel })
      }
    }
    return base
  }, [options, selectedValues])

  // Filtrar opciones por búsqueda
  const filteredOptions = searchTerm
    ? normalizedOptions.filter(opt => opt.label.toLowerCase().includes(searchTerm.toLowerCase()))
    : normalizedOptions

  // Calcular posición del dropdown cuando se abre
  const calculatePosition = useCallback(() => {
    if (!buttonRef.current) return { top: 0, left: 0 }

    const rect = buttonRef.current.getBoundingClientRect()
    const dropdownWidth = dropdownRef.current?.getBoundingClientRect().width || 260
    const dropdownHeight = dropdownRef.current?.getBoundingClientRect().height || 300
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    let left = rect.left
    // Si no cabe a la derecha, alinear al borde derecho del viewport
    if (left + dropdownWidth > viewportWidth - 8) {
      left = Math.max(8, viewportWidth - dropdownWidth - 8)
    }
    if (left < 8) left = 8

    // Si no cabe abajo, abrir hacia arriba
    let top = rect.bottom + 4
    if (top + dropdownHeight > viewportHeight - 8) {
      top = rect.top - dropdownHeight - 4
      // Si tampoco cabe arriba, posicionar lo más alto posible
      if (top < 8) top = 8
    }

    return { top, left }
  }, [])

  // Calcular posición INMEDIATAMENTE cuando se abre (useLayoutEffect para evitar flash)
  useLayoutEffect(() => {
    if (!isOpen || !buttonRef.current) return
    setPosition(calculatePosition())
  }, [isOpen, calculatePosition])

  // Ajustar posición después del render si el dropdown real se sale de pantalla
  useLayoutEffect(() => {
    if (!isOpen || !dropdownRef.current || !buttonRef.current) return
    const dropdownRect = dropdownRef.current.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    if (dropdownRect.right > viewportWidth - 8) {
      setPosition(prev => ({
        ...prev,
        left: Math.max(8, viewportWidth - dropdownRect.width - 8)
      }))
    }
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

    // Recalcular posición en scroll/resize usando ancho real del dropdown
    const handleReposition = () => {
      const newPos = calculatePosition()
      // Doble verificación con el DOM real del dropdown
      if (dropdownRef.current) {
        const dropdownWidth = dropdownRef.current.getBoundingClientRect().width
        const viewportWidth = window.innerWidth
        if (newPos.left + dropdownWidth > viewportWidth - 8) {
          newPos.left = Math.max(8, viewportWidth - dropdownWidth - 8)
        }
      }
      setPosition(newPos)
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
      setPosition(calculatePosition())
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

  // Marcar / desmarcar todas las opciones visibles (las que coinciden con la búsqueda)
  const todasMarcadas = filteredOptions.length > 0 && filteredOptions.every(o => selectedValues.includes(o.value))
  const algunasMarcadas = !todasMarcadas && filteredOptions.some(o => selectedValues.includes(o.value))
  const toggleTodas = () => {
    const visibles = filteredOptions.map(o => o.value)
    if (todasMarcadas) {
      onSelectionChange(selectedValues.filter(v => !visibles.includes(v)))
    } else {
      onSelectionChange([...new Set([...selectedValues, ...visibles])])
    }
  }

  // Mismo aspecto que los filtros automáticos de DataTable (dt-filter-*)
  return (
    <div className="dt-filter-header">
      <span className="dt-filter-label">{label}</span>
      <button
        ref={buttonRef}
        type="button"
        className={`dt-filter-btn ${hasSelection ? 'active' : ''}`}
        onClick={handleToggle}
        title={`Filtrar por ${label.toLowerCase()}`}
      >
        <FilterIcon size={12} />
      </button>
      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          className="dt-filter-dropdown"
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
            className="dt-filter-search"
            autoFocus
          />
          <div className="dt-filter-options">
            {selectAll && filteredOptions.length > 3 && (
              <label className="dt-filter-option dt-filter-option-todas">
                <input
                  type="checkbox"
                  checked={todasMarcadas}
                  ref={el => { if (el) el.indeterminate = algunasMarcadas }}
                  onChange={toggleTodas}
                />
                <span>{searchTerm ? 'Seleccionar resultados' : 'Seleccionar todas'} ({filteredOptions.length})</span>
              </label>
            )}
            {filteredOptions.length === 0 ? (
              <div className="dt-filter-empty">Sin resultados</div>
            ) : (
              filteredOptions.map(option => (
                <label key={option.value} className="dt-filter-option">
                  <input
                    type="checkbox"
                    checked={selectedValues.includes(option.value)}
                    onChange={() => toggleValue(option.value)}
                  />
                  <span>{option.label}</span>
                </label>
              ))
            )}
          </div>
          {hasSelection && (
            <button
              type="button"
              className="dt-filter-clear"
              onClick={() => { clearSelection(); setSearchTerm(''); }}
            >
              Limpiar filtro
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
// eslint-disable-next-line react-refresh/only-export-components
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
