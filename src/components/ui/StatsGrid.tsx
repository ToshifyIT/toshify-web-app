// src/components/ui/StatsGrid.tsx
// Grilla de indicadores única para todos los módulos. Si entran todas en una
// línea, cada tarjeta mide lo que su contenido y se estiran para llenar la fila.
// Si no entran y hay que usar más de una línea, pasan a una grilla de columnas
// iguales: todas las tarjetas del mismo ancho, en todas las filas (pedido
// 2026-11-05: con la fila de abajo más corta, las tarjetas se veían de tamaños
// distintos). Las filas se reparten parejas (13 tarjetas en 2 filas → 7 + 6).
// Si una etiqueta no entra se corta con «…» y el texto completo aparece al pasar
// el mouse. Usa la clase de grilla de cada módulo para conservar el diseño de sus
// tarjetas.
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import './StatsGrid.css'

interface StatsGridProps {
  /** Clase de grilla del módulo (ej. 'veh-stats-grid'). */
  className?: string
  /** Se mantienen por compatibilidad; ya no se ocultan tarjetas. */
  max?: number
  storageKey?: string
  children: ReactNode
}

const GAP_PX = 8

/** Columnas iguales para `n` tarjetas, o null si entran todas en una línea. */
function columnasParejas(el: HTMLDivElement): number | null {
  const tarjetas = Array.from(el.children) as HTMLElement[]
  const n = tarjetas.length
  if (n === 0) return null
  // Ancho natural de cada tarjeta: se mide en una fila sin cortes ni estiramiento.
  el.classList.add('stats-grid-midiendo')
  const anchoMax = Math.max(...tarjetas.map(t => t.getBoundingClientRect().width))
  el.classList.remove('stats-grid-midiendo')
  const disponible = el.clientWidth
  const entran = Math.max(1, Math.floor((disponible + GAP_PX) / (anchoMax + GAP_PX)))
  if (entran >= n) {
    // ¿Entran todas en una línea con su ancho natural? Entonces no hace falta grilla.
    el.classList.add('stats-grid-midiendo')
    const total = tarjetas.reduce((s, t) => s + t.getBoundingClientRect().width, 0) + GAP_PX * (n - 1)
    el.classList.remove('stats-grid-midiendo')
    if (total <= disponible) return null
  }
  const filas = Math.ceil(n / Math.min(entran, n))
  return Math.ceil(n / filas)
}

export function StatsGrid({ className = '', children }: StatsGridProps) {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ajustar = () => {
      // Una línea (flex) o varias con columnas iguales (grid)
      const cols = columnasParejas(el)
      if (cols) {
        el.classList.add('stats-grid-columnas')
        el.style.setProperty('--stats-cols', String(cols))
      } else {
        el.classList.remove('stats-grid-columnas')
        el.style.removeProperty('--stats-cols')
      }
      // Tooltip con el texto completo en las etiquetas que quedaron cortadas
      el.querySelectorAll<HTMLElement>('[class*="stat-label"]').forEach(l => {
        const cortada = l.scrollWidth > l.clientWidth || l.scrollHeight > l.clientHeight + 1
        if (cortada) l.title = l.textContent?.trim() ?? ''
        else if (l.title) l.removeAttribute('title')
      })
    }
    ajustar()
    // Solo el ancho importa: cambiar de flex a grid puede cambiar el alto y no
    // debe volver a disparar el cálculo.
    let ancho = el.clientWidth
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === ancho) return
      ancho = el.clientWidth
      ajustar()
    })
    ro.observe(el)
    return () => ro.disconnect()
  })

  return <div ref={ref} className={`${className} stats-grid-uniforme`}>{children}</div>
}
