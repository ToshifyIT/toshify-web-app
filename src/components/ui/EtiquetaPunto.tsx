// src/components/ui/EtiquetaPunto.tsx
// Etiqueta sobria de la app (2026-11-17): punto + texto del color, sin fondo.
// GpsOrigen: logo de Geotab o «USS» con punto (pantallas de Integraciones GPS).
import type { ReactNode } from 'react'
import { LogoGeotab } from './LogosApp'

interface EtiquetaPuntoProps {
  color: string
  children: ReactNode
  title?: string
  /** Si se pasa, la etiqueta es un botón (p. ej. para abrir un detalle) */
  onClick?: () => void
  /** Ícono en lugar del punto */
  icono?: ReactNode
  className?: string
}

export function EtiquetaPunto({ color, children, title, onClick, icono, className }: EtiquetaPuntoProps) {
  // El tamaño de letra lo pone el texto de adentro (así el botón no hereda otro)
  const estilo = {
    display: 'inline-flex', alignItems: 'center', gap: 5, color, whiteSpace: 'nowrap' as const,
    background: 'none', border: 'none', padding: 0, cursor: onClick ? 'pointer' : undefined,
  }
  const contenido = (
    <>
      {icono ?? <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />}
      <span style={{ fontSize: 11, fontWeight: 600 }}>{children}</span>
    </>
  )
  return onClick
    ? <button type="button" className={className} onClick={onClick} title={title} style={estilo}>{contenido}</button>
    : <span className={className} title={title} style={estilo}>{contenido}</span>
}

export function GpsOrigen({ origen }: { origen: string | null | undefined }) {
  if (origen === 'GEOTAB') return <LogoGeotab alto={9} />
  return <EtiquetaPunto color="#047857">USS</EtiquetaPunto>
}
