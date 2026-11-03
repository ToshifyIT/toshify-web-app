import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import './TabsBar.css'

export interface TabsBarItem<T extends string = string> {
  id: T
  label: ReactNode
  /** Icono lucide (componente) */
  icon?: LucideIcon
  /** Contador opcional (badge). No se muestra si es undefined/null. */
  count?: number | string | null
  /** 'danger' pinta el contador en rojo (p. ej. campos con error) */
  countVariant?: 'default' | 'danger'
  /** Tooltip del contador */
  countTitle?: string
  disabled?: boolean
  title?: string
}

interface TabsBarProps<T extends string = string> {
  tabs: TabsBarItem<T>[]
  active: T
  onChange: (id: T) => void
  className?: string
  /** aria-label del tablist */
  ariaLabel?: string
}

/**
 * Barra de pestañas de sección compartida (estilo de Administración › Facturación).
 */
export function TabsBar<T extends string = string>({ tabs, active, onChange, className, ariaLabel }: TabsBarProps<T>) {
  return (
    <div className={`tabs-bar${className ? ` ${className}` : ''}`} role="tablist" aria-label={ariaLabel}>
      {tabs.map(tab => {
        const Icon = tab.icon
        const isActive = tab.id === active
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`tabs-bar-tab${isActive ? ' active' : ''}`}
            onClick={() => onChange(tab.id)}
            disabled={tab.disabled}
            title={tab.title}
          >
            {Icon && <Icon size={16} />}
            <span>{tab.label}</span>
            {tab.count !== undefined && tab.count !== null && (
              <span
                className={`tabs-bar-count${tab.countVariant === 'danger' ? ' tabs-bar-count--danger' : ''}`}
                title={tab.countTitle}
              >
                {tab.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export default TabsBar
