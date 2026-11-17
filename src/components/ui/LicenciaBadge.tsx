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

// Estilo sobrio (2026-11-17): sin fondo, borde fino del color y texto del color.
const COLORES: Record<string, { borde: string; fg: string }> = {
  B1: { borde: 'rgba(217, 119, 6, 0.45)', fg: '#b45309' },
  D1: { borde: 'rgba(22, 163, 74, 0.45)', fg: '#15803d' },
  Otros: { borde: 'rgba(100, 116, 139, 0.4)', fg: '#475569' },
  sin: { borde: 'transparent', fg: 'var(--text-tertiary)' },
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
        fontSize: xs ? '8px' : '10px',
        lineHeight: xs ? '10px' : '14px',
        padding: xs ? '0 3px' : '0 6px',
        borderRadius: 'var(--radius-xs)',
        fontWeight: 700,
        whiteSpace: 'nowrap',
        background: 'transparent',
        border: `1px solid ${color.borde}`,
        color: color.fg,
      }}
    >
      {texto ?? sinDato}
    </span>
  )
}
