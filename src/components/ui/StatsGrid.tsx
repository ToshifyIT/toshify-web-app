// src/components/ui/StatsGrid.tsx
// Grilla de indicadores única para todos los módulos: todas las tarjetas del mismo
// ancho y alto, y en cada fila entran tantas como quepan (sin «ver más»: se ve todo
// ocupando el menor alto posible). Si una etiqueta no entra se corta con «…» y el
// texto completo aparece al pasar el mouse. Usa la clase de grilla de cada módulo
// para conservar el diseño de sus tarjetas.
import { useEffect, useRef, type ReactNode } from 'react'
import './StatsGrid.css'

interface StatsGridProps {
  /** Clase de grilla del módulo (ej. 'veh-stats-grid'). */
  className?: string
  /** Se mantienen por compatibilidad; ya no se ocultan tarjetas. */
  max?: number
  storageKey?: string
  children: ReactNode
}

export function StatsGrid({ className = '', children }: StatsGridProps) {
  const ref = useRef<HTMLDivElement>(null)

  // Tooltip con el texto completo en las etiquetas que quedaron cortadas
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const marcar = () => {
      el.querySelectorAll<HTMLElement>('[class*="stat-label"]').forEach(l => {
        const cortada = l.scrollWidth > l.clientWidth || l.scrollHeight > l.clientHeight + 1
        if (cortada) l.title = l.textContent?.trim() ?? ''
        else if (l.title) l.removeAttribute('title')
      })
    }
    marcar()
    const ro = new ResizeObserver(marcar)
    ro.observe(el)
    return () => ro.disconnect()
  })

  return <div ref={ref} className={`${className} stats-grid-uniforme`}>{children}</div>
}
