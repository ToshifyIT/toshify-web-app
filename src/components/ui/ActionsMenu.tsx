// src/components/ui/ActionsMenu.tsx
/**
 * Componente de menu de acciones para DataTables
 * Muestra los primeros N botones visibles y agrupa el resto en un dropdown
 */

import { useState, useRef, useEffect, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { MoreVertical } from 'lucide-react'

interface ActionButton {
  icon: ReactElement
  label: string
  onClick: () => void
  disabled?: boolean
  variant?: 'default' | 'success' | 'danger' | 'warning' | 'info'
  hidden?: boolean
}

interface ActionsMenuProps {
  actions: ActionButton[]
  maxVisible?: number // Cuantos botones mostrar antes de agrupar (default: 2)
}

export function ActionsMenu({ actions, maxVisible = 2 }: ActionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Filtrar acciones ocultas
  const visibleActions = actions.filter(a => !a.hidden)
  
  // Si hay pocas acciones, mostrar todas
  if (visibleActions.length <= maxVisible + 1) {
    return (
      <div className="dt-actions">
        {visibleActions.map((action, idx) => (
          <button
            key={idx}
            onClick={action.onClick}
            disabled={action.disabled}
            className={`dt-btn-action ${action.variant ? `dt-btn-${action.variant}` : ''}`}
            title={action.label}
          >
            {action.icon}
          </button>
        ))}
      </div>
    )
  }

  // Separar acciones visibles y las del menu
  const primaryActions = visibleActions.slice(0, maxVisible)
  const menuActions = visibleActions.slice(maxVisible)

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setPosition({
        top: rect.bottom + 4,
        left: rect.right - 160, // Alinear a la derecha
      })
    }
    setIsOpen(!isOpen)
  }

  // Cerrar al hacer click fuera
  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  // Cerrar con Escape
  useEffect(() => {
    if (!isOpen) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen])

  return (
    <div className="dt-actions">
      {/* Botones principales visibles */}
      {primaryActions.map((action, idx) => (
        <button
          key={idx}
          onClick={action.onClick}
          disabled={action.disabled}
          className={`dt-btn-action ${action.variant ? `dt-btn-${action.variant}` : ''}`}
          title={action.label}
        >
          {action.icon}
        </button>
      ))}
      
      {/* Boton de menu */}
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className={`dt-btn-action dt-btn-more ${isOpen ? 'active' : ''}`}
        title="Mas opciones"
      >
        <MoreVertical size={15} />
      </button>

      {/* Dropdown menu */}
      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          className="dt-actions-dropdown"
          style={{
            position: 'fixed',
            top: position.top,
            left: position.left,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {menuActions.map((action, idx) => (
            <button
              key={idx}
              onClick={() => {
                action.onClick()
                setIsOpen(false)
              }}
              disabled={action.disabled}
              className={`dt-actions-dropdown-item ${action.variant ? `dt-dropdown-${action.variant}` : ''}`}
            >
              {action.icon}
              <span>{action.label}</span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
