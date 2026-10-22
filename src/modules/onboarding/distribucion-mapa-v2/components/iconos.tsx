// src/modules/onboarding/distribucion-mapa-v2/components/iconos.tsx
//
// Ícono inline del tipo de entidad, para listas, leyendas y tarjetas: círculo
// pastel con el pictograma (auto o persona) en el color de acento. Mismo
// pictograma y mismos tonos que los pines del mapa.

import { glifoEntidad } from './glifos'
import { fondoPastel } from './colores'
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
  const fondo = `<circle cx="12" cy="12" r="11.2" fill="${fondoPastel(color)}" stroke="${color}" stroke-width="1.2"/>`
  const glifo = glifoEntidad(tipo, { tamano: 16, cx: 12, cy: 12, tinta: color })

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{ flexShrink: 0, display: 'block' }}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: fondo + glifo }}
    />
  )
}
