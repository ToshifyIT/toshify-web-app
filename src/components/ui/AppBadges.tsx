// src/components/ui/AppBadges.tsx
// Logos de Cabify / DiDi de la app con la que trabaja (pagó) el conductor. La regla
// está en services/appsPagoService (la misma de Facturación y del Panel de conductores).
// Desde 2026-11-17 se muestran los logos en vez de etiquetas de texto.

import type { AppsPago } from '../../services/appsPagoService'
import { LogoCabify, LogoDidi } from './LogosApp'

interface AppBadgesProps {
  apps: AppsPago | undefined
  /** 'xs' para filas de tablas chicas */
  size?: 'xs' | 'sm'
  /** Qué mostrar si no tiene ninguna app (null = nada) */
  sinDato?: string | null
}

export function AppBadges({ apps, size = 'sm', sinDato = null }: AppBadgesProps) {
  if (!apps?.cabify && !apps?.didi) {
    return sinDato === null ? null : <span style={{ color: 'var(--text-tertiary)' }}>{sinDato}</span>
  }
  const alto = size === 'xs' ? 10 : 13
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: size === 'xs' ? '5px' : '8px', flexWrap: 'wrap' }}>
      {apps?.cabify && <LogoCabify alto={alto} />}
      {apps?.didi && <LogoDidi alto={alto} />}
    </span>
  )
}
