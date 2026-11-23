// src/modules/leads/components/InfoSituacionesBcra.tsx
// Botón "i" que explica las situaciones del BCRA. Se abre con un toque (sirve en el celular)
// y se dibuja sobre el body, así no lo corta el encabezado de una tabla con scroll.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'
import { SITUACIONES_BCRA } from '../bcraSituaciones'
import './InfoSituacionesBcra.css'

export function InfoSituacionesBcra() {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const boton = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!pos) return
    const cerrar = (e: Event) => {
      const t = e.target as Node
      if (panel.current?.contains(t) || boton.current?.contains(t)) return
      setPos(null)
    }
    const conEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setPos(null) }
    document.addEventListener('mousedown', cerrar)
    document.addEventListener('touchstart', cerrar)
    window.addEventListener('scroll', cerrar, true)
    window.addEventListener('keydown', conEsc)
    return () => {
      document.removeEventListener('mousedown', cerrar)
      document.removeEventListener('touchstart', cerrar)
      window.removeEventListener('scroll', cerrar, true)
      window.removeEventListener('keydown', conEsc)
    }
  }, [pos])

  function alternar(e: React.MouseEvent) {
    // Que no ordene ni abra el filtro de la columna
    e.stopPropagation()
    e.preventDefault()
    if (pos) { setPos(null); return }
    const r = boton.current?.getBoundingClientRect()
    if (!r) return
    const ancho = Math.min(300, window.innerWidth - 16)
    setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - ancho - 8)) })
  }

  return (
    <>
      <button
        ref={boton}
        type="button"
        className="info-sit-bcra-btn"
        onClick={alternar}
        aria-expanded={!!pos}
        aria-label="Qué significa cada situación del BCRA"
        title="Qué significa cada situación del BCRA"
      >
        <Info size={13} />
      </button>
      {pos && createPortal(
        <div ref={panel} className="info-sit-bcra-panel" style={{ top: pos.top, left: pos.left }} role="dialog">
          <div className="info-sit-bcra-titulo">Situación en el BCRA</div>
          {SITUACIONES_BCRA.map(s => (
            <div key={s.valor} className="info-sit-bcra-fila">
              <span className="info-sit-bcra-num">{s.valor}</span>
              <span>
                <strong>{s.nombre}</strong>
                <span className="info-sit-bcra-det">{s.detalle}</span>
              </span>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}
