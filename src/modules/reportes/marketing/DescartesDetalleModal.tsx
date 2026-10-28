// src/modules/reportes/marketing/DescartesDetalleModal.tsx
// Detalle de un motivo de descarte: los leads agrupados por el anuncio del que
// vinieron (link que se puede abrir), con canal y cantidad. Cada anuncio se
// despliega para ver quiénes son, su zona, cuándo entraron y la causal cargada.
import { useEffect, useMemo } from 'react'
import { X } from 'lucide-react'
import type { FilaDescarteDetalle } from './marketingTypes'
import { anuncioCorto } from './marketingTypes'

function fechaDia(iso: string | null | undefined): string {
  if (!iso) return '—'
  const t = String(iso).slice(0, 10)
  return `${t.slice(8, 10)}/${t.slice(5, 7)}/${t.slice(2, 4)}`
}

export function DescartesDetalleModal({ motivo, filas, onClose }: {
  motivo: string
  filas: FilaDescarteDetalle[]
  onClose: () => void
}) {
  useEffect(() => {
    const cerrar = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', cerrar)
    return () => window.removeEventListener('keydown', cerrar)
  }, [onClose])

  // Un grupo por anuncio; los sin link van juntos al final
  const grupos = useMemo(() => {
    const mapa = new Map<string, { clave: string; anuncio: string; canal: string; leads: FilaDescarteDetalle[] }>()
    for (const f of filas) {
      const clave = f.anuncio || '__sin__'
      const g = mapa.get(clave) ?? {
        clave,
        anuncio: f.anuncio,
        canal: f.anuncio ? f.canal : f.segmento === 'Pauta redes' ? 'Pauta sin link' : f.segmento,
        leads: [],
      }
      g.leads.push(f)
      mapa.set(clave, g)
    }
    return [...mapa.values()].sort((a, b) =>
      (a.anuncio ? 0 : 1) - (b.anuncio ? 0 : 1) || b.leads.length - a.leads.length)
  }, [filas])

  return (
    <div className="mkt-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="mkt-modal" role="dialog" aria-modal="true" aria-labelledby="mkt-desc-titulo">
        <header className="mkt-modal-header">
          <div>
            <h2 id="mkt-desc-titulo">Descartados · {motivo}</h2>
            <p>
              {filas.length} {filas.length === 1 ? 'lead' : 'leads'} del período, agrupados por el anuncio del que vinieron.
            </p>
          </div>
          <button type="button" className="mkt-modal-cerrar" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </header>
        <div className="mkt-modal-body">
          {grupos.length === 0 ? (
            <p className="ddir-note">Sin detalle para este motivo. Ejecutá la versión nueva de sql/dashboard_marketing.sql.</p>
          ) : (
            <div className="mkt-anuncios-grupos">
              {grupos.map(g => (
                <details key={g.clave} className="mkt-anuncio-grupo">
                  <summary>
                    <span className="mkt-anuncio-cab">
                      {g.anuncio ? (
                        <a
                          className="mkt-link"
                          href={g.anuncio}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={g.anuncio}
                          onClick={e => e.stopPropagation()}
                        >
                          {anuncioCorto(g.anuncio)}
                        </a>
                      ) : (
                        <span className="ddir-muted">Sin link del anuncio</span>
                      )}
                      <span className="ddir-muted">{g.canal}</span>
                    </span>
                    <span className="mkt-anuncio-n">
                      {g.leads.length} {g.leads.length === 1 ? 'lead' : 'leads'}
                    </span>
                  </summary>
                  <ul className="mkt-anuncio-lista">
                    {g.leads.map((l, i) => (
                      <li key={`${l.nombre}-${i}`}>
                        <span>
                          {l.nombre || 'Sin nombre'}
                          <span className="ddir-muted"> · {l.zona || 'Sin zona'}</span>
                        </span>
                        <span className="ddir-muted">
                          {fechaDia(l.ingreso)}{l.causal ? ` · ${l.causal}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
