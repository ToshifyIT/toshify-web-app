// src/modules/reportes/marketing/ReferidosDetalleModal.tsx
// Quiénes llegaron referidos en el período: nombre, día que entraron, estado
// actual del lead, el conductor embajador que lo recomendó y si ya recibió auto.
import { useEffect } from 'react'
import { X } from 'lucide-react'
import type { FilaReferido } from './marketingTypes'

function fechaDia(iso: string | null | undefined): string {
  if (!iso) return '—'
  const t = String(iso).slice(0, 10)
  return `${t.slice(8, 10)}/${t.slice(5, 7)}/${t.slice(2, 4)}`
}

/** Situación del lead: solo texto en color, sin fondo. */
function situacion(f: FilaReferido): { texto: string; clase: string } {
  if (f.con_auto) return { texto: `Recibió auto el ${fechaDia(f.primer_auto)}`, clase: 'mkt-ref-ok' }
  if (f.descartado) return { texto: f.estado || 'Descartado', clase: 'mkt-ref-baja' }
  return { texto: f.estado || 'Sin estado', clase: 'mkt-ref-curso' }
}

export function ReferidosDetalleModal({ filas, onClose }: {
  filas: FilaReferido[]
  onClose: () => void
}) {
  useEffect(() => {
    const cerrar = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', cerrar)
    return () => window.removeEventListener('keydown', cerrar)
  }, [onClose])

  return (
    <div className="mkt-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="mkt-modal" role="dialog" aria-modal="true" aria-labelledby="mkt-ref-titulo">
        <header className="mkt-modal-header">
          <div>
            <h2 id="mkt-ref-titulo">Referidos del período</h2>
            <p>
              {filas.length} {filas.length === 1 ? 'lead' : 'leads'}, del más nuevo al más viejo, con el conductor que lo recomendó.
            </p>
          </div>
          <button type="button" className="mkt-modal-cerrar" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </header>
        <div className="mkt-modal-body">
          {filas.length === 0 ? (
            <p className="ddir-note">Ningún lead referido en el período.</p>
          ) : (
            <ul className="mkt-anuncio-lista mkt-ref-lista">
              {filas.map((f, i) => {
                const s = situacion(f)
                return (
                  <li key={`${f.nombre}-${i}`}>
                    <span className="mkt-ref-quien">
                      <span>{f.nombre || 'Sin nombre'}</span>
                      <span className="ddir-muted">
                        Entró el {fechaDia(f.ingreso)} · {f.embajador ? `Lo recomendó ${f.embajador}` : 'Sin embajador cargado'}
                      </span>
                    </span>
                    <span className={s.clase}>{s.texto}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
