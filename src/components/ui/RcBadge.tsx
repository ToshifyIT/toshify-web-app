import type { CSSProperties } from 'react'

const ESTILO: CSSProperties = {
  display: 'inline-block',
  background: 'var(--color-info-light)',
  color: 'var(--color-info)',
  border: '1px solid var(--color-info)',
  padding: '1px 5px',
  borderRadius: 'var(--radius-xs)',
  fontSize: '10px',
  fontWeight: 700,
  lineHeight: 1.2,
  whiteSpace: 'nowrap',
  verticalAlign: 'middle',
}

/**
 * Indicador de vehiculo con seguro de Responsabilidad Civil.
 * Con tarifa nueva su carta oferta sale de la plantilla RC.
 */
export function RcBadge({ style }: { style?: CSSProperties }) {
  return (
    <span
      style={{ ...ESTILO, ...style }}
      title="Seguro Responsabilidad Civil: con tarifa nueva se usa la plantilla de carta oferta RC"
    >
      RC
    </span>
  )
}

export default RcBadge
