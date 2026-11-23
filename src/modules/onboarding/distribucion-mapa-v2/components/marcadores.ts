// src/modules/onboarding/distribucion-mapa-v2/components/marcadores.ts
//
// Construcción del SVG de los pines del mapa. Separado de iconos.tsx para no
// mezclar exports de componentes con exports de utilidades (fast refresh).
//
// Forma: círculo para ambos tipos (2026-11-23; antes era un pin de ubicación con
// forma de gota). Fondo pastel, contorno blanco fino y el pictograma (volante o
// persona) en el color de acento (ver colores.ts). Se ancla en su centro.
import { glifoEntidad } from './glifos'
import { fondoPastel } from './colores'
import type { TipoEntidadMapa } from '../types'

function svgPin(
  tipo: TipoEntidadMapa,
  color: string,
  activo: boolean,
  atenuado: boolean
): string {
  // Círculo simple (2026-11-23): el pin con forma de GPS se veía escandaloso.
  // Fondo pastel suave, sin borde de color (sólo un contorno blanco fino para
  // despegarlo del mapa) y el pictograma en el color de acento. El seleccionado
  // lleva borde rojo.
  const opacidad = atenuado ? 0.55 : 1
  const borde = activo ? '#ff0033' : '#ffffff'
  const grosor = activo ? 2.4 : 1.5
  const glifo = glifoEntidad(tipo, { tamano: 15, cx: 16, cy: 16, tinta: atenuado ? '#6B7280' : color })
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <g opacity="${opacidad}">
    <circle cx="16" cy="16" r="14.2" fill="${fondoPastel(color)}" stroke="${borde}" stroke-width="${grosor}"/>
    ${glifo}
  </g>
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

/**
 * Tamaño en pantalla de los pines (2026-11-23: antes 28x36 y 34x44; con zoom
 * tapaban las calles). El SVG se dibuja en 34x44 y Google lo escala.
 */
export const PIN_ANCHO = 26
export const PIN_ALTO = 26
/** Pin de la persona seleccionada o de la base fijada: un poco más grande. */
export const PIN_ANCHO_DESTACADO = 32
export const PIN_ALTO_DESTACADO = 32

/** Diámetro en px del aro que se dibuja alrededor de la persona seleccionada. */
export const TAMANO_HALO = 42

/** Distancia (px) entre el punto de anclaje y el centro del ícono; 0 con el círculo. */
// Con el pin redondo anclado en su centro, el aro y la ficha se centran ahí.
export const HALO_SOBRE_PUNTA = 0

/**
 * Aro de selección (2026-10-22): antes era un disco rojo de 76px con relleno que
 * se veía exagerado; ahora es un aro fino con un relleno muy suave alrededor de
 * la cabeza del pin. Va como marcador propio debajo del pin (zIndex menor) para
 * que se vea a cualquier zoom y siga sirviendo para ubicar a la persona entre
 * muchos marcadores.
 */
export const URL_HALO_ACTIVO: string = (() => {
  const r = TAMANO_HALO / 2
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TAMANO_HALO}" height="${TAMANO_HALO}" viewBox="0 0 ${TAMANO_HALO} ${TAMANO_HALO}">
  <circle cx="${r}" cy="${r}" r="${r - 1.25}" fill="#ff0033" fill-opacity="0.06" stroke="#ff0033" stroke-opacity="0.85" stroke-width="2"/>
</svg>`
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
})()
