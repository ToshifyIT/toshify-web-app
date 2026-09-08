// src/modules/onboarding/distribucion-mapa-v2/components/iconos.tsx
//
// Badge inline del tipo de entidad, para listas, leyendas y tarjetas.
// Usa exactamente los mismos pictogramas que los pines del mapa (glifos.ts),
// para que la lectura sea idéntica en el mapa y en la lista.

import { glifoConductor, glifoLead } from './glifos'
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
  const glifo =
    tipo === 'conductor'
      ? glifoConductor({ color, escala: 0.78, cx: 12, cy: 12.6 })
      : glifoLead({ escala: 0.74, cx: 12, cy: 12.4 })

  const fondo =
    tipo === 'conductor'
      ? `<circle cx="12" cy="12" r="11.5" fill="${color}"/>`
      : `<path d="M12 0.6 23.4 12 12 23.4 0.6 12Z" fill="${color}"/>`

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
