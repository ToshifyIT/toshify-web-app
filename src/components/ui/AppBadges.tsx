// src/components/ui/AppBadges.tsx
// Etiquetas "Cabify" / "DiDi" de la app con la que trabaja (pagó) el conductor. La regla
// está en services/appsPagoService (la misma de Facturación y del Panel de conductores).
// Mismos colores que las etiquetas de Facturación.

import type { AppsPago } from '../../services/appsPagoService'

interface AppBadgesProps {
  apps: AppsPago | undefined
  /** 'xs' para filas de tablas chicas */
  size?: 'xs' | 'sm'
  /** Qué mostrar si no tiene ninguna app (null = nada) */
  sinDato?: string | null
}

const COLORES = {
  Cabify: { bg: 'rgba(124, 58, 237, 0.12)', fg: '#7c3aed' },
  DiDi: { bg: 'rgba(249, 115, 22, 0.14)', fg: '#c2410c' },
}

export function AppBadges({ apps, size = 'sm', sinDato = null }: AppBadgesProps) {
  const etiquetas = [...(apps?.cabify ? ['Cabify' as const] : []), ...(apps?.didi ? ['DiDi' as const] : [])]
  if (etiquetas.length === 0) {
    return sinDato === null ? null : <span style={{ color: 'var(--text-tertiary)' }}>{sinDato}</span>
  }
  const xs = size === 'xs'
  return (
    <span style={{ display: 'inline-flex', gap: '4px', flexWrap: 'wrap' }}>
      {etiquetas.map(app => (
        <span
          key={app}
          style={{
            display: 'inline-block',
            fontSize: xs ? '9px' : '11px',
            lineHeight: xs ? '13px' : '16px',
            padding: xs ? '1px 5px' : '1px 9px',
            borderRadius: xs ? 'var(--radius-xs)' : 'var(--radius-lg)',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            background: COLORES[app].bg,
            color: COLORES[app].fg,
          }}
        >
          {app}
        </span>
      ))}
    </span>
  )
}
