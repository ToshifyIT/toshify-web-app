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

const PATH_CONDUCTOR =
  'M200-204v54q0 12.75-8.62 21.37Q182.75-120 170-120h-20q-12.75 0-21.37-8.63Q120-137.25 120-150v-324l85-256q3-14 15.4-22t27.6-8h127v-75h212v75h125q15.2 0 27.6 8 12.4 8 15.4 22l85 256v324q0 12.75-8.62 21.37Q822.75-120 810-120h-21q-12.75 0-21.37-8.63Q759-137.25 759-150v-54H200Zm3-330h554l-55-166H258l-55 166Zm-23 60v210-210Zm105.76 160q23.24 0 38.74-15.75Q340-345.5 340-368q0-23.33-15.75-39.67Q308.5-424 286-424q-23.33 0-39.67 16.26Q230-391.47 230-368.24q0 23.24 16.26 38.74 16.27 15.5 39.5 15.5ZM675-314q23.33 0 39.67-15.75Q731-345.5 731-368q0-23.33-16.26-39.67Q698.47-424 675.24-424q-23.24 0-38.74 16.26-15.5 16.27-15.5 39.5 0 23.24 15.75 38.74Q652.5-314 675-314Zm-495 50h600v-210H180v210Z'

const PATH_LEAD =
  'M372-523q-42-42-42-108t42-108q42-42 108-42t108 42q42 42 42 108t-42 108q-42 42-108 42t-108-42ZM160-160v-94q0-38 19-65t49-41q67-30 128.5-45T480-420q62 0 123 15.5T731-360q31 14 50 41t19 65v94H160Zm60-60h520v-34q0-16-9.5-30.5T707-306q-64-31-117-42.5T480-360q-57 0-111 11.5T252-306q-14 7-23 21.5t-9 30.5v34Zm324.5-346.5Q570-592 570-631t-25.5-64.5Q519-721 480-721t-64.5 25.5Q390-670 390-631t25.5 64.5Q441-541 480-541t64.5-25.5ZM480-631Zm0 411Z'

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
  const d = tipo === 'conductor' ? PATH_CONDUCTOR : PATH_LEAD
  const x = (cx - tamano / 2).toFixed(2)
  const y = (cy - tamano / 2).toFixed(2)
  return `<svg x="${x}" y="${y}" width="${tamano}" height="${tamano}" viewBox="0 -960 960 960"><path d="${d}" fill="${tinta}"/></svg>`
}
