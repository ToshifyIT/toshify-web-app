import type { CSSProperties } from 'react'
import './PatenteBadge.css'

export interface PatenteBadgeProps {
  patente: string | null | undefined
  size?: 'sm' | 'md'
  title?: string
  className?: string
  style?: CSSProperties
}

/** Normaliza una patente para mostrar: mayúsculas y sin espacios. */
export function formatPatente(patente: string | null | undefined): string {
  return (patente ?? '').toString().replace(/\s+/g, '').toUpperCase()
}

/**
 * Badge unificado para mostrar la patente de un vehículo
 * (fondo oscuro, letras monoespaciadas). Vacío → "-".
 */
export function PatenteBadge({ patente, size = 'md', title, className, style }: PatenteBadgeProps) {
  const value = formatPatente(patente)
  const classes = [
    'patente-badge-ui',
    size === 'sm' ? 'patente-badge-ui--sm' : '',
    !value ? 'patente-badge-ui--empty' : '',
    className || '',
  ].filter(Boolean).join(' ')

  return (
    <span className={classes} title={title} style={style}>
      {value || '-'}
    </span>
  )
}

export default PatenteBadge
