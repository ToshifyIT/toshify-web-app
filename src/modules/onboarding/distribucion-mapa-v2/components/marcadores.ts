// src/modules/onboarding/distribucion-mapa-v2/components/marcadores.ts
//
// Construcción del SVG de los pines del mapa. Separado de iconos.tsx para no
// mezclar exports de componentes con exports de utilidades (fast refresh).
//
// Forma: pin de ubicación (gota) para ambos tipos, con fondo pastel y el
// pictograma en el color de acento (ver colores.ts). Conductor y lead llevan el
// pictograma al mismo tamaño; los distingue el dibujo (auto / persona) y el
// color. La punta del pin queda abajo al centro, que es donde se ancla en el
// mapa (anchor 17,44 en MapaCanvas).

import { glifoEntidad } from './glifos'
import { fondoPastel } from './colores'
import type { TipoEntidadMapa } from '../types'

function svgPin(
  tipo: TipoEntidadMapa,
  color: string,
  activo: boolean,
  atenuado: boolean
): string {
  const borde = activo ? '#ff0033' : atenuado ? '#9CA3AF' : color
  const grosor = activo ? 2.6 : 1.6
  const opacidad = atenuado ? 0.55 : 1

  const silueta = '<path d="M17 42.6C13.4 37.6 3 27.4 3 16.2a14 14 0 0 1 28 0c0 11.2-10.4 21.4-14 26.4Z"/>'
  const glifo = glifoEntidad(tipo, { tamano: 19, cx: 17, cy: 16.2, tinta: atenuado ? '#6B7280' : color })

  return `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="44" viewBox="0 0 34 44">
  <g fill="${fondoPastel(color)}" stroke="${borde}" stroke-width="${grosor}" opacity="${opacidad}">${silueta}</g>
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
