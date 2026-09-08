// src/modules/onboarding/distribucion-mapa-v2/components/glifos.ts
//
// Pictogramas de conductor y lead, como fragmentos de SVG reutilizables.
// Viven en un archivo propio porque los usan tanto el pin del mapa
// (marcadores.ts) como el badge de las listas (iconos.tsx), y así el dibujo es
// literalmente el mismo en los dos lugares.
//
// Ambos se dibujan sobre una caja de 24x24 centrada en (0,0) y se reubican con
// los parámetros `escala` / `cx` / `cy`.

interface OpcionesGlifo {
  /** Factor de escala sobre la caja base de 24x24. */
  escala?: number
  /** Centro donde queda el glifo. */
  cx?: number
  cy?: number
  /** Color del pictograma. */
  tinta?: string
}

function envolver(contenido: string, { escala = 1, cx = 12, cy = 12 }: OpcionesGlifo): string {
  const dx = cx - 12 * escala
  const dy = cy - 12 * escala
  return `<g transform="translate(${dx.toFixed(2)} ${dy.toFixed(2)}) scale(${escala})">${contenido}</g>`
}

/**
 * Chofer: gorra con visera, rostro, hombros y volante por delante.
 *
 * `color` es el color de FONDO sobre el que se dibuja: se usa para recortar el
 * interior del volante contra los hombros, que es lo que hace que el aro se
 * lea como un volante y no como una mancha.
 */
export function glifoConductor(
  opciones: OpcionesGlifo & { color: string }
): string {
  const tinta = opciones.tinta || '#ffffff'
  const fondo = opciones.color

  const contenido = `
    <g fill="${tinta}">
      <path d="M12 1.6 20.6 6.9 A0.9 0.9 0 0 1 20.3 8.5 L3.7 8.5 A0.9 0.9 0 0 1 3.4 6.9 Z"/>
      <path d="M3.9 9.4 h16.2 a0.6 0.6 0 0 1 0 1.5 H3.9 a0.6 0.6 0 0 1 0-1.5 z"/>
      <path d="M4.6 11.7 h14.8 c-0.8 2.6 -3.7 4.4 -7.4 4.4 s-6.6 -1.8 -7.4 -4.4 z"/>
      <path d="M9.1 16.6 c0.9 0.4 1.9 0.6 2.9 0.6 s2 -0.2 2.9 -0.6 l3.4 1.3 c1.9 0.7 3.1 2.4 3.1 4.4 v1.5 H2.6 v-1.5 c0 -2 1.2 -3.7 3.1 -4.4 z"/>
    </g>
    <circle cx="12" cy="19.8" r="5.4" fill="${fondo}"/>
    <g fill="none" stroke="${tinta}" stroke-width="1.5">
      <circle cx="12" cy="19.8" r="4.4"/>
      <path d="M7.7 19.8 h8.6 M12 21.5 v4"/>
    </g>
    <circle cx="12" cy="19.8" r="1.35" fill="${tinta}"/>`

  return envolver(contenido, opciones)
}

/** Lead: silueta de persona de pie (cabeza, torso con brazos, dos piernas). */
export function glifoLead(opciones: OpcionesGlifo = {}): string {
  const tinta = opciones.tinta || '#ffffff'

  const contenido = `
    <g fill="${tinta}">
      <circle cx="12" cy="4.4" r="3.2"/>
      <path d="M9 8.6 h6 a2.6 2.6 0 0 1 2.6 2.6 v5.2 a0.95 0.95 0 0 1 -1.9 0 v-4.6 h-0.7 v9.5 a1.1 1.1 0 0 1 -2.2 0 v-5.5 h-1.6 v5.5 a1.1 1.1 0 0 1 -2.2 0 v-9.5 h-0.7 v4.6 a0.95 0.95 0 0 1 -1.9 0 v-5.2 a2.6 2.6 0 0 1 2.6 -2.6 z"/>
    </g>`

  return envolver(contenido, opciones)
}
