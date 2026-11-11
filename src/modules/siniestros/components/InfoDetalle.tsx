// src/modules/siniestros/components/InfoDetalle.tsx
// Botón "i" que abre un recuadro con el detalle de un indicador (Siniestros v2).
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { Info } from 'lucide-react'

interface InfoDetalleProps {
  titulo: string
  children: ReactNode
}

export function InfoDetalle({ titulo, children }: InfoDetalleProps) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const popRef = useRef<HTMLSpanElement>(null)
  // El recuadro se dibuja en <body> con posición fija y se acomoda dentro de la pantalla:
  // dentro de la tarjeta quedaba cortado o tapado por el menú lateral.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!abierto) { setPos(null); return }
    const ubicar = () => {
      const btn = ref.current?.getBoundingClientRect()
      const pop = popRef.current
      if (!btn || !pop) return
      const margen = 8
      const ancho = pop.offsetWidth
      const alto = pop.offsetHeight
      const left = Math.min(Math.max(margen, btn.right - ancho), window.innerWidth - ancho - margen)
      const abajo = btn.bottom + 6
      const top = abajo + alto > window.innerHeight - margen ? Math.max(margen, btn.top - alto - 6) : abajo
      setPos({ top, left })
    }
    ubicar()
    window.addEventListener('resize', ubicar)
    window.addEventListener('scroll', ubicar, true)
    return () => {
      window.removeEventListener('resize', ubicar)
      window.removeEventListener('scroll', ubicar, true)
    }
  }, [abierto])

  useEffect(() => {
    if (!abierto) return
    const cerrar = (e: MouseEvent) => {
      const t = e.target as Node
      if (ref.current?.contains(t) || popRef.current?.contains(t)) return
      setAbierto(false)
    }
    const conEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('mousedown', cerrar)
    document.addEventListener('keydown', conEscape)
    return () => {
      document.removeEventListener('mousedown', cerrar)
      document.removeEventListener('keydown', conEscape)
    }
  }, [abierto])

  return (
    <span className="info-detalle" ref={ref}>
      <button
        type="button"
        className="info-detalle-btn"
        aria-label={`Ver detalle: ${titulo}`}
        aria-expanded={abierto}
        onClick={(e) => { e.stopPropagation(); setAbierto(v => !v) }}
      >
        <Info size={14} />
      </button>
      {abierto && createPortal(
        <span
          ref={popRef}
          className="info-detalle-pop"
          role="dialog"
          onClick={(e) => e.stopPropagation()}
          style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? 'visible' : 'hidden' }}
        >
          <strong className="info-detalle-titulo">{titulo}</strong>
          {children}
        </span>,
        document.body,
      )}
    </span>
  )
}
