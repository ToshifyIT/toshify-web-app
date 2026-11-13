import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import './DataTable.css'

/**
 * Filtro de encabezado por rango de cantidad (Desde / Hasta), para columnas de montos o
 * números. Mismo comportamiento y estilos que el rango numérico automático del DataTable
 * (dt-filter-number-*) y que ExcelDateRangeFilter, pero usable en encabezados propios.
 */
interface ExcelNumberRangeFilterProps {
  /** Nombre de la columna para mostrar en el header */
  label: string
  /** Mínimo elegido (null = sin mínimo) */
  min: number | null
  /** Máximo elegido (null = sin máximo) */
  max: number | null
  /** Callback cuando cambia el rango */
  onRangeChange: (min: number | null, max: number | null) => void
  /** ID único para el filtro */
  filterId: string
  /** ID del filtro actualmente abierto */
  openFilterId: string | null
  /** Callback para cambiar qué filtro está abierto */
  onOpenChange: (filterId: string | null) => void
  /** Muestra el prefijo $ y pasos de centavos */
  esMonto?: boolean
}

const ANCHO_DROPDOWN = 260

export function ExcelNumberRangeFilter({
  label,
  min,
  max,
  onRangeChange,
  filterId,
  openFilterId,
  onOpenChange,
  esMonto = false,
}: ExcelNumberRangeFilterProps) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ top: 0, left: 0 })

  const isOpen = openFilterId === filterId
  const hasSelection = min !== null || max !== null

  const calculatePosition = useCallback(() => {
    if (!buttonRef.current) return { top: 0, left: 0 }
    const rect = buttonRef.current.getBoundingClientRect()
    let left = rect.left
    if (left + ANCHO_DROPDOWN > window.innerWidth - 8) left = window.innerWidth - ANCHO_DROPDOWN - 8
    if (left < 8) left = 8
    // Si no entra abajo del botón, se abre arriba (o se acomoda dentro de la pantalla)
    const alto = dropdownRef.current?.offsetHeight || 140
    let top = rect.bottom + 4
    if (top + alto > window.innerHeight - 8) {
      const arriba = rect.top - alto - 4
      top = arriba >= 8 ? arriba : Math.max(8, window.innerHeight - alto - 8)
    }
    return { top, left }
  }, [])

  useLayoutEffect(() => {
    if (!isOpen || !buttonRef.current) return
    setPosition(calculatePosition())
  }, [isOpen, calculatePosition])

  // Ya montado: recalcular con el alto real del desplegable
  useLayoutEffect(() => {
    if (!isOpen || !dropdownRef.current) return
    setPosition(calculatePosition())
  }, [isOpen, min, max, calculatePosition])

  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (
        dropdownRef.current && !dropdownRef.current.contains(target) &&
        buttonRef.current && !buttonRef.current.contains(target)
      ) {
        onOpenChange(null)
      }
    }
    const handleReposition = () => setPosition(calculatePosition())
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
    e.preventDefault()
    if (isOpen) {
      onOpenChange(null)
    } else {
      setPosition(calculatePosition())
      onOpenChange(filterId)
    }
  }

  const leer = (valor: string): number | null => (valor === '' || Number.isNaN(Number(valor)) ? null : Number(valor))

  return (
    <div className="dt-filter-header">
      <span className="dt-filter-label">{label}</span>
      <button
        ref={buttonRef}
        type="button"
        className={`dt-filter-btn ${hasSelection ? 'active' : ''}`}
        onClick={handleToggle}
        title="Filtrar por rango"
      >
        <svg width={8} height={8} viewBox="0 0 8 8" fill="currentColor" aria-hidden="true"><path d="M0 1h8L4 7z" /></svg>
      </button>
      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          className="dt-filter-dropdown"
          style={{ position: 'fixed', top: position.top, left: position.left, width: ANCHO_DROPDOWN }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="dt-filter-number-range">
            <div className="dt-filter-number-row">
              <label className="dt-filter-number-label">
                <span>Desde</span>
                <div className="dt-filter-number-input-wrap">
                  {esMonto && <span className="dt-filter-number-prefix">$</span>}
                  <input
                    type="number"
                    placeholder={esMonto ? '0,00' : '0'}
                    step={esMonto ? '0.01' : '1'}
                    value={min ?? ''}
                    onChange={e => onRangeChange(leer(e.target.value), max)}
                    className="dt-filter-number-input"
                    autoFocus
                  />
                </div>
              </label>
              <label className="dt-filter-number-label">
                <span>Hasta</span>
                <div className="dt-filter-number-input-wrap">
                  {esMonto && <span className="dt-filter-number-prefix">$</span>}
                  <input
                    type="number"
                    placeholder={esMonto ? '0,00' : '0'}
                    step={esMonto ? '0.01' : '1'}
                    value={max ?? ''}
                    onChange={e => onRangeChange(min, leer(e.target.value))}
                    className="dt-filter-number-input"
                  />
                </div>
              </label>
            </div>
          </div>
          {hasSelection && (
            <button type="button" className="dt-filter-clear" onClick={() => onRangeChange(null, null)}>
              Limpiar filtro
            </button>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}

export default ExcelNumberRangeFilter
