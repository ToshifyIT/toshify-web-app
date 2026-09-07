// src/modules/onboarding/distribucion-mapa-v2/components/iconos.tsx
//
// Badge inline del tipo de entidad, para listas, leyendas y tarjetas.
// El SVG de los pines del mapa vive en `marcadores.ts`.

import type { TipoEntidadMapa } from '../types'

export function IconoEntidad({
  tipo,
  color,
  size = 15,
}: {
  tipo: TipoEntidadMapa
  color: string
  size?: number
}) {
  if (tipo === 'conductor') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink: 0 }} aria-hidden>
        <circle cx="12" cy="12" r="11" fill={color} />
        <g fill="#fff">
          <path d="M5.6 11.4h12.8v1.8H5.6z" />
          <path d="M7.4 11c0-2.6 2-4.3 4.6-4.3s4.6 1.7 4.6 4.3z" />
          <path d="M12 15.1c1.8 0 3.2 1 4 2.3.4.6.7 1.3.8 2H7.2c.1-.7.4-1.4.8-2 .8-1.3 2.2-2.3 4-2.3z" />
        </g>
      </svg>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink: 0 }} aria-hidden>
      <path d="M12 1 23 12 12 23 1 12Z" fill={color} />
      <g fill="#fff">
        <circle cx="12" cy="10.2" r="3" />
        <path d="M12 14c2.3 0 4.2 1.5 4.8 3.5H7.2C7.8 15.5 9.7 14 12 14z" />
      </g>
    </svg>
  )
}
