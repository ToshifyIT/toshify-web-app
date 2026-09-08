// src/modules/onboarding/distribucion-mapa-v2/components/marcadores.ts
//
// Construcción del SVG de los pines del mapa. Separado de iconos.tsx para no
// mezclar exports de componentes con exports de utilidades (fast refresh).
//
// Pictogramas (definidos en glifos.ts):
//   - conductor: chofer con gorra y volante
//   - lead:      silueta de persona de pie
//
// La forma del pin refuerza la distinción: gota para conductores, rombo para
// leads (que ya era la forma del lead en el v1).

import { glifoConductor, glifoLead } from './glifos'
import type { TipoEntidadMapa } from '../types'

function svgPin(
  tipo: TipoEntidadMapa,
  color: string,
  activo: boolean,
  atenuado: boolean
): string {
  const borde = activo ? '#ff0033' : atenuado ? '#6B7280' : '#ffffff'
  const grosor = activo ? 3 : 2
  const opacidad = atenuado ? 0.55 : 1

  const silueta =
    tipo === 'conductor'
      ? '<path d="M17 43C17 43 32 26.5 32 16.6 32 7.9 25.3 1 17 1S2 7.9 2 16.6C2 26.5 17 43 17 43Z"/>'
      : '<path d="M17 43 31.5 22.5 17 2 2.5 22.5Z"/>'

  // El glifo del conductor necesita el color del pin para "recortar" el hueco
  // del volante sobre los hombros (no se puede lograr sólo con blanco).
  const glifo =
    tipo === 'conductor'
      ? glifoConductor({ color, escala: 0.9, cx: 17, cy: 17 })
      : glifoLead({ escala: 0.92, cx: 17, cy: 20 })

  return `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="44" viewBox="0 0 34 44">
  <g fill="${color}" stroke="${borde}" stroke-width="${grosor}" opacity="${opacidad}">${silueta}</g>
  <g opacity="${opacidad}">${glifo}</g>
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

/**
 * Etiqueta flotante (píldora) para el punto medio de una línea del mapa.
 * Se usa como icono de un MarkerF, que es la forma más simple de poner texto
 * arbitrario sobre el mapa sin montar un OverlayView propio.
 */
export function urlEtiquetaPill(texto: string, fondo = '#ff0033', color = '#ffffff'): string {
  const ancho = Math.max(38, texto.length * 6.6 + 14)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="20" viewBox="0 0 ${ancho} 20">
  <rect x="0.5" y="0.5" width="${ancho - 1}" height="19" rx="9.5" fill="${fondo}" stroke="#ffffff" stroke-width="1"/>
  <text x="${ancho / 2}" y="13.6" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="10.5" font-weight="700" fill="${color}">${texto}</text>
</svg>`
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}
