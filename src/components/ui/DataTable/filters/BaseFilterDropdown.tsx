import { useState, useRef, useLayoutEffect, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Filter } from 'lucide-react'

interface BaseFilterDropdownProps {
  label: string
  isActive: boolean
  isOpen: boolean
  onToggle: () => void
  onClose: () => void
  children: React.ReactNode
  onClear?: () => void
}

interface DropdownPosition {
  top: number
  left: number
}

export function BaseFilterDropdown({
  label,
  isActive,
  isOpen,
  onToggle,
  onClose,
  children,
  onClear
}: BaseFilterDropdownProps) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<DropdownPosition>({ top: 0, left: 0 })

  // Cerrar al hacer clic fuera
  useEffect(() => {
    if (!isOpen) return

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      // Si el clic fue en el botón, no hacemos nada (el onClick del botón lo maneja)
      if (buttonRef.current?.contains(target)) return
      
      // Si el clic fue fuera del dropdown, cerramos
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, onClose])

  // Calcular posición
  useLayoutEffect(() => {
    if (!isOpen || !buttonRef.current) return

    const rect = buttonRef.current.getBoundingClientRect()
    setPosition({
      top: rect.bottom + 4,
      left: rect.left
    })
  }, [isOpen])

  // Ajustar posición si se sale de la pantalla
  useLayoutEffect(() => {
    if (!isOpen || !dropdownRef.current || !buttonRef.current) return

    const dropdown = dropdownRef.current
    const rect = dropdown.getBoundingClientRect()
    const buttonRect = buttonRef.current.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    // const viewportHeight = window.innerHeight

    let newLeft = buttonRect.left
    const newTop = buttonRect.bottom + 4

    // Si se sale por la derecha
    if (newLeft + rect.width > viewportWidth - 20) {
      newLeft = Math.max(20, viewportWidth - rect.width - 20)
    }

    setPosition({ top: newTop, left: newLeft })
  }, [isOpen])

  return (
    <>
      <div className="dt-header-content">
        <span>{label}</span>
        <button
          ref={buttonRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onToggle()
          }}
          className={`dt-filter-button ${isActive || isOpen ? 'active' : ''}`}
          title={`Filtrar por ${label}`}
        >
          <Filter size={14} />
        </button>
      </div>

      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          className="dt-filter-dropdown"
          style={{
            position: 'fixed',
            top: position.top,
            left: position.left,
            zIndex: 9999,
            minWidth: '280px',
            maxWidth: '320px',
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            border: '1px solid #E5E7EB',
            padding: '12px',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
          
          <div style={{ 
            display: 'flex', 
            justifyContent: 'flex-end', 
            gap: '8px',
            marginTop: '12px',
            paddingTop: '12px',
            borderTop: '1px solid #F3F4F6'
          }}>
            {onClear && (
              <button
                onClick={onClear}
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  color: '#6B7280',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                Limpiar
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                backgroundColor: '#1F2937',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Cerrar
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
