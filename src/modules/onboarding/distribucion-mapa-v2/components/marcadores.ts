// src/modules/onboarding/distribucion-mapa-v2/components/marcadores.ts
//
// Construcción del SVG de los pines del mapa. Separado de iconos.tsx para no
// mezclar exports de componentes con exports de utilidades (fast refresh).
//
// Pictogramas (definidos en glifos.ts):
//   - conductor: chofer con gorra y volante
//   - lead:      silueta de persona de pie
//
// Ambos usan rombo: la distinción la hace el pictograma (y el color), no la
// silueta. El conductor usaba gota; se unificó a pedido para que el mapa lea
// como una sola familia de marcadores.

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

  const silueta = '<path d="M17 43 31.5 22.5 17 2 2.5 22.5Z"/>'

  // El glifo del conductor necesita el color del pin para "recortar" el hueco
  // del volante sobre los hombros (no se puede lograr sólo con blanco).
  //
  // Va más chico que el del lead y algo por encima del centro: la gorra es la
  // parte más ancha del dibujo y el rombo se angosta hacia arriba, así que con
  // una escala mayor la visera se sale por los lados.
  const glifo =
    tipo === 'conductor'
      ? glifoConductor({ color, escala: 0.7, cx: 17, cy: 19 })
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

/** Diámetro en px del halo que se dibuja bajo la persona seleccionada. */
export const TAMANO_HALO = 76

/**
 * Halo de selección: disco rojo translúcido con un anillo más marcado. Va como
 * marcador propio debajo del pin (zIndex menor) para que se vea a cualquier
 * zoom sin depender del tamaño del pin.
 */
export const URL_HALO_ACTIVO: string = (() => {
  const r = TAMANO_HALO / 2
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TAMANO_HALO}" height="${TAMANO_HALO}" viewBox="0 0 ${TAMANO_HALO} ${TAMANO_HALO}">
  <circle cx="${r}" cy="${r}" r="${r - 1}" fill="#ff0033" fill-opacity="0.16"/>
  <circle cx="${r}" cy="${r}" r="${r - 2}" fill="none" stroke="#ff0033" stroke-opacity="0.85" stroke-width="2.5"/>
  <circle cx="${r}" cy="${r}" r="${r * 0.42}" fill="none" stroke="#ff0033" stroke-opacity="0.55" stroke-width="1.5"/>
</svg>`
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
})()
