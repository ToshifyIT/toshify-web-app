// src/components/ui/LicenciaBadge.tsx
// Etiqueta con la categoría de licencia actual del conductor (B1, D1 u Otros con su
// detalle, ej. "D2"). Sale de conductores.categoria_licencia / categoria_licencia_otra
// (regla 2026-11-11, ver modules/leads/licenciaLead.ts). La usan Asignaciones, Panel de
// conductores y Facturación.

import { etiquetaLicencia } from '../../utils/etiquetaLicencia'

interface LicenciaBadgeProps {
  categoria: string | null | undefined
  otra?: string | null
  /** 'xs' para chips chicos en filas de tablas (Facturación) */
  size?: 'xs' | 'sm'
  /** Qué mostrar si no tiene categoría cargada (null = nada) */
  sinDato?: string | null
}

const COLORES: Record<string, { bg: string; fg: string }> = {
  B1: { bg: 'rgba(245, 158, 11, 0.16)', fg: '#b45309' },
  D1: { bg: 'rgba(22, 163, 74, 0.14)', fg: '#15803d' },
  Otros: { bg: 'rgba(100, 116, 139, 0.15)', fg: '#475569' },
  sin: { bg: 'transparent', fg: 'var(--text-tertiary)' },
}

export function LicenciaBadge({ categoria, otra, size = 'sm', sinDato = null }: LicenciaBadgeProps) {
  const texto = etiquetaLicencia(categoria, otra)
  if (!texto && sinDato === null) return null
  const color = texto ? COLORES[categoria === 'B1' || categoria === 'D1' ? categoria : 'Otros'] : COLORES.sin
  const xs = size === 'xs'
  return (
    <span
      title={texto ? `Licencia ${texto}${categoria === 'B1' ? ' (sin D1)' : ''}` : 'Sin categoría de licencia cargada'}
      style={{
        display: 'inline-block',
        fontSize: xs ? '8px' : '11px',
        lineHeight: xs ? '12px' : '16px',
        padding: xs ? '1px 4px' : '1px 9px',
        borderRadius: xs ? 'var(--radius-xs)' : 'var(--radius-lg)',
        fontWeight: 700,
        whiteSpace: 'nowrap',
        background: color.bg,
        color: color.fg,
      }}
    >
      {texto ?? sinDato}
    </span>
  )
}
