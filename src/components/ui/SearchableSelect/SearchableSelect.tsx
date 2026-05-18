/**
 * SearchableSelect — reemplazo de <select> nativo con buscador.
 *
 * Por que existe: el <select> nativo en mobile abre una lista enorme y feo
 * que tapa todo. En desktop, no permite filtrar. Esto soluciona ambos.
 *
 * Uso minimo (drop-in replacement de <select>):
 *   <SearchableSelect
 *     value={value}
 *     onChange={setValue}
 *     options={[{value: 'a', label: 'Opcion A'}, ...]}
 *     placeholder="Seleccionar..."
 *   />
 *
 * Tambien acepta options como string[] (atajo).
 */

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { ChevronDown, Search, X, Check } from 'lucide-react'
import './SearchableSelect.css'

export interface SearchableSelectOption {
  value: string
  label: string
  /** Texto extra para search (ej: dni, patente). No se muestra. */
  searchText?: string
  /** Subtitulo gris debajo del label */
  subtitle?: string
  /** Deshabilitar opcion */
  disabled?: boolean
  /** Agrupacion visual (equivalente a optgroup). Las opciones con el mismo
   *  `group` aparecen bajo un header no clickeable con ese texto. */
  group?: string
}

interface Props {
  value: string
  onChange: (value: string) => void
  options: (SearchableSelectOption | string)[]
  placeholder?: string
  searchPlaceholder?: string
  disabled?: boolean
  required?: boolean
  /** Mostrar X para limpiar seleccion. Default true si no required. */
  clearable?: boolean
  /** className para el contenedor */
  className?: string
  /** id para form/label */
  id?: string
  /** Nombre para forms */
  name?: string
  /** A partir de cuantas opciones mostrar el buscador (default 5) */
  searchThreshold?: number
  /** Mensaje cuando no hay resultados */
  noResultsText?: string
  /** Size: 'sm' (28px), 'md' (36px default), 'lg' (44px touch) */
  size?: 'sm' | 'md' | 'lg'
}

function normalize(str: string): string {
  return str.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Seleccionar...',
  searchPlaceholder = 'Buscar...',
  disabled = false,
  required = false,
  clearable,
  className = '',
  id,
  name,
  searchThreshold = 5,
  noResultsText = 'Sin resultados',
  size = 'md',
}: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [focusedIdx, setFocusedIdx] = useState<number>(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Normalizar opciones (acepta string[] o SearchableSelectOption[])
  const normalizedOptions = useMemo<SearchableSelectOption[]>(() => {
    return options.map(o => typeof o === 'string' ? { value: o, label: o } : o)
  }, [options])

  // Opcion seleccionada
  const selectedOption = useMemo(
    () => normalizedOptions.find(o => o.value === value),
    [normalizedOptions, value]
  )

  // Opciones filtradas por search
  const filteredOptions = useMemo(() => {
    if (!search.trim()) return normalizedOptions
    const q = normalize(search.trim())
    return normalizedOptions.filter(o =>
      normalize(o.label).includes(q) ||
      (o.searchText && normalize(o.searchText).includes(q)) ||
      (o.subtitle && normalize(o.subtitle).includes(q))
    )
  }, [normalizedOptions, search])

  const showSearch = normalizedOptions.length >= searchThreshold
  const isClearable = clearable ?? !required

  // Cerrar al click afuera
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Focus al input search al abrir
  useEffect(() => {
    if (open && showSearch) {
      // Pequeño delay para que el DOM termine de pintar
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
    if (open) {
      // Pre-focus la opcion seleccionada
      const idx = filteredOptions.findIndex(o => o.value === value)
      setFocusedIdx(idx >= 0 ? idx : 0)
    } else {
      setFocusedIdx(-1)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, showSearch])

  // Reset focused al cambiar el filtro
  useEffect(() => {
    if (!open) return
    setFocusedIdx(filteredOptions.length > 0 ? 0 : -1)
  }, [search, open, filteredOptions.length])

  // Scroll focused option into view
  useEffect(() => {
    if (focusedIdx < 0 || !listRef.current) return
    const item = listRef.current.querySelector(`[data-idx="${focusedIdx}"]`) as HTMLElement | null
    item?.scrollIntoView({ block: 'nearest' })
  }, [focusedIdx])

  const handleSelect = useCallback((opt: SearchableSelectOption) => {
    if (opt.disabled) return
    onChange(opt.value)
    setOpen(false)
    setSearch('')
  }, [onChange])

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onChange('')
  }, [onChange])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (disabled) return
    if (!open && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
      e.preventDefault()
      setOpen(true)
      return
    }
    if (!open) return
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      setSearch('')
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIdx(i => Math.min(i + 1, filteredOptions.length - 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIdx(i => Math.max(i - 1, 0))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const opt = filteredOptions[focusedIdx]
      if (opt) handleSelect(opt)
      return
    }
  }, [disabled, open, focusedIdx, filteredOptions, handleSelect])

  return (
    <div
      ref={containerRef}
      className={`ss-root ss-size-${size} ${disabled ? 'ss-disabled' : ''} ${open ? 'ss-open' : ''} ${className}`}
    >
      {/* Trigger */}
      <button
        type="button"
        id={id}
        name={name}
        className="ss-trigger"
        onClick={() => !disabled && setOpen(o => !o)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-required={required}
      >
        <span className={`ss-value ${!selectedOption ? 'ss-placeholder' : ''}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <span className="ss-actions">
          {isClearable && selectedOption && !disabled && (
            <span
              className="ss-clear"
              onClick={handleClear}
              role="button"
              tabIndex={-1}
              aria-label="Limpiar"
            >
              <X size={14} />
            </span>
          )}
          <ChevronDown size={16} className="ss-chevron" />
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="ss-dropdown" role="listbox">
          {showSearch && (
            <div className="ss-search-wrap">
              <Search size={14} className="ss-search-icon" />
              <input
                ref={searchInputRef}
                type="text"
                className="ss-search-input"
                placeholder={searchPlaceholder}
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                autoComplete="off"
              />
              {search && (
                <button
                  type="button"
                  className="ss-search-clear"
                  onClick={() => setSearch('')}
                  aria-label="Limpiar busqueda"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          )}
          <div ref={listRef} className="ss-list">
            {filteredOptions.length === 0 ? (
              <div className="ss-empty">{noResultsText}</div>
            ) : (
              (() => {
                // Render con agrupacion: si hay opciones con `group`, insertamos
                // un header no clickeable antes del primer item de ese grupo.
                // Las opciones sin `group` aparecen al final (o al principio si todas son sin group).
                const elements: React.ReactNode[] = []
                let lastGroup: string | undefined = undefined
                filteredOptions.forEach((opt, idx) => {
                  const g = opt.group
                  if (g && g !== lastGroup) {
                    elements.push(
                      <div key={`grp-${g}-${idx}`} className="ss-group-header" aria-hidden="true">
                        {g}
                      </div>
                    )
                    lastGroup = g
                  } else if (!g) {
                    lastGroup = undefined
                  }
                  const isSelected = opt.value === value
                  const isFocused = idx === focusedIdx
                  elements.push(
                    <div
                      key={opt.value}
                      data-idx={idx}
                      className={`ss-option ${isSelected ? 'ss-selected' : ''} ${isFocused ? 'ss-focused' : ''} ${opt.disabled ? 'ss-opt-disabled' : ''}`}
                      onClick={() => handleSelect(opt)}
                      onMouseEnter={() => setFocusedIdx(idx)}
                      role="option"
                      aria-selected={isSelected}
                      aria-disabled={opt.disabled}
                    >
                      <div className="ss-option-content">
                        <span className="ss-option-label">{opt.label}</span>
                        {opt.subtitle && <span className="ss-option-subtitle">{opt.subtitle}</span>}
                      </div>
                      {isSelected && <Check size={14} className="ss-option-check" />}
                    </div>
                  )
                })
                return elements
              })()
            )}
          </div>
        </div>
      )}
    </div>
  )
}
