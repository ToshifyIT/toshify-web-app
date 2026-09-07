// src/modules/onboarding/distribucion-mapa-v2/components/marcadores.ts
//
// Construcción del SVG de los pines del mapa. Separado de iconos.tsx para no
// mezclar exports de componentes con exports de utilidades (fast refresh).
//
// En el v1 conductor y lead se distinguían sólo por la forma del punto
// (círculo vs rombo). Acá cada uno lleva además su propio pictograma: gorra de
// conductor y silueta de persona.

import type { TipoEntidadMapa } from '../types'

/** Pictograma de gorra (conductor), en blanco, para pintar dentro del pin. */
const GLIFO_CONDUCTOR = `
  <path d="M9.6 12.9h14.8v2.1H9.6z"/>
  <path d="M11.6 12.4c0-3 2.4-5 5.4-5s5.4 2 5.4 5z"/>
  <path d="M17 17.6c2 0 3.6 1.1 4.6 2.6.7 1 1.1 2.2 1.2 3.3H11.2c.1-1.1.5-2.3 1.2-3.3 1-1.5 2.6-2.6 4.6-2.6z"/>`

/** Pictograma de persona (lead). */
const GLIFO_LEAD = `
  <circle cx="17" cy="14.4" r="4.1"/>
  <path d="M17 19.6c3.1 0 5.7 2 6.5 4.8H10.5c.8-2.8 3.4-4.8 6.5-4.8z"/>`

function svgPin(
  tipo: TipoEntidadMapa,
  color: string,
  activo: boolean,
  atenuado: boolean
): string {
  const borde = activo ? '#ff0033' : atenuado ? '#6B7280' : '#ffffff'
  const grosor = activo ? 3 : 2
  const opacidad = atenuado ? 0.55 : 1

  // conductor: gota clásica. lead: rombo (mantiene la lectura del v1).
  const silueta =
    tipo === 'conductor'
      ? '<path d="M17 43C17 43 32 26.5 32 16.6 32 7.9 25.3 1 17 1S2 7.9 2 16.6C2 26.5 17 43 17 43Z"/>'
      : '<path d="M17 43 31.5 22.5 17 2 2.5 22.5Z"/>'

  const glifo = tipo === 'conductor' ? GLIFO_CONDUCTOR : GLIFO_LEAD

  return `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="44" viewBox="0 0 34 44">
  <g fill="${color}" stroke="${borde}" stroke-width="${grosor}" opacity="${opacidad}">${silueta}</g>
  <g fill="#ffffff" opacity="${opacidad}">${glifo}</g>
</svg>`
}

/** Data URI listo para usarse como `icon.url` de un MarkerF. */
export function urlIconoMarcador(
  tipo: TipoEntidadMapa,
  color: string,
  activo: boolean,
  atenuado: boolean
): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svgPin(tipo, color, activo, atenuado))}`
}
