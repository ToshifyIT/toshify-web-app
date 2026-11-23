// src/modules/onboarding/distribucion-mapa-v2/components/glifos.ts
//
// Pictogramas de conductor y lead, como fragmentos de SVG reutilizables.
// Los usan el pin del mapa (marcadores.ts) y el ícono de las listas
// (iconos.tsx), así el dibujo es literalmente el mismo en los dos lugares.
//
// Son los Material Symbols "local_taxi" (conductor) y "person" (lead), estilo
// Outlined, peso 400 (Google, licencia Apache 2.0). Se dibujan sobre su caja
// original (viewBox 0 -960 960 960) dentro de un <svg> anidado, así se ubican
// y escalan sin tocar el path. Ambos van al MISMO tamaño.

import type { TipoEntidadMapa } from '../types'

// 2026-11-23: mismos íconos que 2Chat (integraciones/twochat/TipoContactoIcono.tsx):
// volante = conductor y silueta de persona (lucide "user-round") = lead, en trazo.
const TRAZO_CONDUCTOR =
  '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="2.5"/>' +
  '<path d="M2.5 10.5c3 .8 5.6 1.3 7 1.5"/><path d="M21.5 10.5c-3 .8-5.6 1.3-7 1.5"/><path d="M12 14.5V22"/>'
const TRAZO_LEAD = '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>'

interface OpcionesGlifo {
  /** Lado del cuadrado que ocupa el pictograma, en unidades del SVG contenedor. */
  tamano: number
  /** Centro del pictograma. */
  cx: number
  cy: number
  /** Color del trazo. */
  tinta: string
}

export function glifoEntidad(tipo: TipoEntidadMapa, { tamano, cx, cy, tinta }: OpcionesGlifo): string {
  const trazo = tipo === 'conductor' ? TRAZO_CONDUCTOR : TRAZO_LEAD
  const x = (cx - tamano / 2).toFixed(2)
  const y = (cy - tamano / 2).toFixed(2)
  return `<svg x="${x}" y="${y}" width="${tamano}" height="${tamano}" viewBox="0 0 24 24" fill="none" stroke="${tinta}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${trazo}</svg>`
}
