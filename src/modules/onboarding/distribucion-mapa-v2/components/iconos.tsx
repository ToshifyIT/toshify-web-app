// src/modules/onboarding/distribucion-mapa-v2/components/iconos.tsx
//
// Badge inline del tipo de entidad, para listas, leyendas y tarjetas.
// Usa exactamente el mismo pictograma y la misma forma (rombo) que los pines
// del mapa, para que la lectura sea idéntica en el mapa y en la lista.

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
      ? glifoConductor({ color, escala: 0.52, cx: 12, cy: 12.7 })
      : glifoLead({ escala: 0.74, cx: 12, cy: 12.4 })

  // Rombo para ambos tipos, igual que los pines del mapa: lo que distingue a un
  // conductor de un lead es el pictograma, no la forma del fondo.
  const fondo = `<path d="M12 0.6 23.4 12 12 23.4 0.6 12Z" fill="${color}"/>`

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
