// src/components/ui/ConductorAutocomplete.tsx
//
// Caja de texto con autocompletado: se escribe en el mismo campo, aparece la
// lista de coincidencias (nombre o DNI) y al elegir una el nombre queda en el
// campo. La lista se dibuja en document.body (portal, position: fixed) para que
// no la corte el overflow del modal que contiene al formulario.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import type { SearchableSelectOption } from './SearchableSelect'

interface ConductorAutocompleteProps {
  value: string
  onChange: (value: string) => void
  options: SearchableSelectOption[]
  placeholder?: string
  disabled?: boolean
  /** className del input (ej: 'form-input') para que se vea como el resto del form. */
  inputClassName?: string
  hasError?: boolean
}

const MAX_RESULTADOS = 50
const ALTO_LISTA = 260

function normalizar(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function ConductorAutocomplete({
  value, onChange, options, placeholder, disabled = false, inputClassName = '', hasError = false,
}: ConductorAutocompleteProps) {
  const seleccionado = useMemo(() => options.find((o) => o.value === value), [options, value])
  const [texto, setTexto] = useState(seleccionado?.label || '')
  const [abierto, setAbierto] = useState(false)
  const [foco, setFoco] = useState(0)
  const [pos, setPos] = useState<{ top: number; left: number; width: number; arriba: boolean } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listaRef = useRef<HTMLDivElement>(null)

  // Si cambia el valor desde afuera (o llegan las opciones), el campo muestra su nombre.
  useEffect(() => {
    if (!abierto) setTexto(seleccionado?.label || '')
  }, [seleccionado, abierto])

  const resultados = useMemo(() => {
    const q = normalizar(texto.trim())
    const lista = q && q !== normalizar(seleccionado?.label || '')
      ? options.filter((o) => normalizar(o.label).includes(q) || (o.searchText && normalizar(o.searchText).includes(q)))
      : options
    return lista.slice(0, MAX_RESULTADOS)
  }, [texto, options, seleccionado])

  // Posición de la lista pegada al input; si no entra abajo, se abre hacia arriba.
  useLayoutEffect(() => {
    if (!abierto) return
    const ubicar = () => {
      const r = inputRef.current?.getBoundingClientRect()
      if (!r) return
      const arriba = window.innerHeight - r.bottom < ALTO_LISTA + 8 && r.top > window.innerHeight - r.bottom
      setPos({ top: arriba ? r.top - 4 : r.bottom + 4, left: r.left, width: r.width, arriba })
    }
    ubicar()
    window.addEventListener('resize', ubicar)
    window.addEventListener('scroll', ubicar, true)
    return () => {
      window.removeEventListener('resize', ubicar)
      window.removeEventListener('scroll', ubicar, true)
    }
  }, [abierto])

  // Click afuera: se cierra y el campo vuelve a mostrar lo elegido.
  useEffect(() => {
    if (!abierto) return
    const handler = (e: MouseEvent) => {
      const t = e.target as Node
      if (inputRef.current?.parentElement?.contains(t) || listaRef.current?.contains(t)) return
      cerrar()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, seleccionado])

  useEffect(() => {
    listaRef.current?.querySelector(`[data-idx="${foco}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [foco])

  function cerrar() {
    setAbierto(false)
    setTexto(seleccionado?.label || '')
  }

  function elegir(opt: SearchableSelectOption) {
    onChange(opt.value)
    setTexto(opt.label)
    setAbierto(false)
  }

  function limpiar() {
    onChange('')
    setTexto('')
    inputRef.current?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!abierto) setAbierto(true)
      setFoco((i) => Math.min(i + 1, resultados.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFoco((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      if (abierto && resultados[foco]) {
        e.preventDefault()
        elegir(resultados[foco])
      }
    } else if (e.key === 'Escape') {
      if (abierto) {
        e.preventDefault()
        e.stopPropagation()
        cerrar()
      }
    } else if (e.key === 'Tab') {
      cerrar()
    }
  }

  const lista = abierto && pos && !disabled ? createPortal(
    <div
      ref={listaRef}
      role="listbox"
      style={{
        position: 'fixed',
        left: pos.left,
        width: pos.width,
        ...(pos.arriba ? { bottom: window.innerHeight - pos.top } : { top: pos.top }),
        maxHeight: ALTO_LISTA,
        overflowY: 'auto',
        zIndex: 10000,
        background: 'var(--bg-primary, #fff)',
        border: '1px solid var(--border-primary, #e5e7eb)',
        borderRadius: 8,
        boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
        padding: 4,
      }}
    >
      {resultados.length === 0 ? (
        <div style={{ padding: '10px 12px', fontSize: 13, color: 'var(--text-secondary, #6b7280)' }}>
          Sin coincidencias
        </div>
      ) : resultados.map((o, idx) => (
        <div
          key={o.value}
          data-idx={idx}
          role="option"
          aria-selected={o.value === value}
          onMouseDown={(e) => { e.preventDefault(); elegir(o) }}
          onMouseEnter={() => setFoco(idx)}
          style={{
            padding: '8px 12px',
            borderRadius: 6,
            cursor: 'pointer',
            background: idx === foco ? 'var(--bg-secondary, #f3f4f6)' : 'transparent',
          }}
        >
          <div style={{ fontSize: 13, color: 'var(--text-primary, #111827)', fontWeight: o.value === value ? 600 : 400 }}>
            {o.label}
          </div>
          {o.subtitle && (
            <div style={{ fontSize: 11, color: 'var(--text-secondary, #6b7280)' }}>{o.subtitle}</div>
          )}
        </div>
      ))}
    </div>,
    document.body
  ) : null

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input
        ref={inputRef}
        type="text"
        className={`${inputClassName} ${hasError ? 'field-error input-error' : ''}`.trim()}
        value={texto}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        role="combobox"
        aria-expanded={abierto}
        onChange={(e) => {
          setTexto(e.target.value)
          setAbierto(true)
          setFoco(0)
        }}
        onFocus={(e) => {
          e.target.select()
          setAbierto(true)
          setFoco(0)
        }}
        onKeyDown={onKeyDown}
        style={{ width: '100%', paddingRight: value && !disabled ? 32 : undefined }}
      />
      {value && !disabled && (
        <button
          type="button"
          onClick={limpiar}
          aria-label="Quitar embajador"
          title="Quitar"
          style={{
            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
            border: 'none', background: 'transparent', cursor: 'pointer', padding: 2,
            color: 'var(--text-secondary, #6b7280)', display: 'flex',
          }}
        >
          <X size={14} />
        </button>
      )}
      {lista}
    </div>
  )
}
