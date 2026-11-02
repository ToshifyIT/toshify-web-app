// src/modules/conductores/panel/CalificacionEstrellas.tsx
// Estrellas (1 a 5, con medias) y la pestaña Calificación del detalle del conductor.
import { Fragment, useEffect, useState } from 'react'
import { ChevronDown, Star } from 'lucide-react'
import { cambiosEntreSemanas, calificacionDesdeGuardada, type CambioFactor, type Calificacion, type FactorCalificacion } from './calificacionConductor'
import { cargarHistorial, type CalificacionSemana } from './calificacionesHistorial'
import { Spinner } from '../../../components/ui/LoadingOverlay'

function Estrella({ relleno }: { relleno: 0 | 0.5 | 1 }) {
  return (
    <span className="cal-estrella">
      <Star size={14} className="cal-estrella-vacia" />
      {relleno > 0 && (
        <span className="cal-estrella-llena" style={{ width: relleno === 1 ? '100%' : '50%' }}>
          <Star size={14} />
        </span>
      )}
    </span>
  )
}

export function Estrellas({ valor }: { valor: number }) {
  return (
    <span className="cal-estrellas" aria-label={`${valor} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map(i => (
        <Estrella key={i} relleno={valor >= i ? 1 : valor >= i - 0.5 ? 0.5 : 0} />
      ))}
    </span>
  )
}

export function CalificacionCelda({ calificacion, onClick }: { calificacion: Calificacion; onClick: () => void }) {
  if (calificacion.estrellas === null) {
    return <span className="cpanel-num cpanel-nulo" title="No hay datos suficientes para calificar">—</span>
  }
  return (
    <button type="button" className="cal-celda" onClick={onClick} title="Ver por qué tiene esta calificación">
      <Estrellas valor={calificacion.estrellas} />
      <span className="cal-numero">{calificacion.estrellas.toLocaleString('es-AR')}</span>
      {calificacion.parcial ? <span className="cal-parcial" title="Calculada con datos parciales">*</span> : null}
    </button>
  )
}

function fechaSemana(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

const fmtEstrellas = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 1 })

function tonoDe(p: number | null): string {
  if (p === null) return 'nulo'
  return p >= 0.7 ? 'bueno' : p >= 0.4 ? 'medio' : 'malo'
}

/** "Bajó por Ingresos (−0,8★) y Multas (−0,3★)" */
function resumenCambio(cambios: CambioFactor[], dif: number): string {
  const relevantes = cambios
    .filter(c => Math.abs(c.efecto) >= 0.15 && (dif === 0 || Math.sign(c.efecto) === Math.sign(dif)))
    .sort((a, b) => Math.abs(b.efecto) - Math.abs(a.efecto))
    .slice(0, 2)
  if (!relevantes.length) return dif === 0 ? 'Sin cambios importantes' : 'Cambios chicos en varios factores'
  const lista = relevantes.map(c => `${c.nombre.replace(' (Cabify)', '').replace(' de la semana', '')} (${c.efecto > 0 ? '+' : '−'}${fmtEstrellas(Math.abs(c.efecto))}★)`)
  const verbo = dif > 0 ? 'Subió por' : dif < 0 ? 'Bajó por' : 'Movieron'
  return `${verbo} ${lista.join(' y ')}`
}

function Factores({ factores }: { factores: FactorCalificacion[] }) {
  const conDato = factores.filter(f => f.puntaje !== null)
  const pesoTotal = conDato.reduce((t, f) => t + f.peso, 0) || 1
  return (
    <div className="cal-factores cal-factores--grid">
      {factores.map(f => {
        const pct = f.puntaje === null ? null : Math.round(f.puntaje * 100)
        const pesoReal = f.puntaje === null ? 0 : Math.round((f.peso / pesoTotal) * 100)
        return (
          <div key={f.clave} className="cal-factor">
            <div className="cal-factor-cab">
              <span className="cal-factor-nombre">{f.nombre}</span>
              <span className="cal-factor-peso">{f.puntaje === null ? 'no cuenta' : `pesa ${pesoReal}%`}</span>
            </div>
            <div className="cal-factor-valor">{f.valor}</div>
            <div className="cal-barra">
              <span className={`cal-barra-relleno cal-${tonoDe(f.puntaje)}`} style={{ width: `${pct ?? 0}%` }} />
            </div>
            <div className="cal-factor-expl">{f.explicacion}</div>
          </div>
        )
      })}
    </div>
  )
}

/** Tabla factor por factor: esta semana contra la anterior y cuánto movió cada uno. */
function DetalleCambios({ cambios }: { cambios: CambioFactor[] }) {
  return (
    <table className="cdet-table cal-cambios">
      <thead><tr>
        <th>Factor</th><th>Semana anterior</th><th>Esta semana</th><th style={{ textAlign: 'right' }}>Efecto</th>
      </tr></thead>
      <tbody>
        {cambios.map(c => (
          <tr key={c.clave}>
            <td>{c.nombre}</td>
            <td className="cal-cambio-valor">{c.antes ? c.antes.valor : '—'}</td>
            <td className="cal-cambio-valor">
              {c.ahora ? c.ahora.valor : '—'}
              {c.ahora?.explicacion ? <div className="cal-cambio-expl">{c.ahora.explicacion}</div> : null}
            </td>
            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
              {Math.abs(c.efecto) < 0.05
                ? <span className="cal-igual">=</span>
                : <span className={c.efecto > 0 ? 'cal-sube' : 'cal-baja'}>{c.efecto > 0 ? '▲' : '▼'} {fmtEstrellas(Math.abs(c.efecto))}★</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/**
 * Pestaña "Calificación" del detalle del conductor: historial por semana cerrada
 * (con qué factores la hicieron subir o bajar) y la semana en curso como avance.
 */
export function CalificacionTab({ conductorId, enCurso }: { conductorId: string; enCurso?: Calificacion | null }) {
  const [historial, setHistorial] = useState<CalificacionSemana[] | null>(null)
  const [abierta, setAbierta] = useState<string | null>(null)
  const [verEnCurso, setVerEnCurso] = useState(false)
  useEffect(() => {
    let activo = true
    cargarHistorial(conductorId)
      .then(h => { if (activo) setHistorial(h) })
      .catch(() => { if (activo) setHistorial([]) })
    return () => { activo = false }
  }, [conductorId])

  return (
    <div className="cal-tab">
      {enCurso && (
        <div className="cal-encurso">
          <button type="button" className="cal-encurso-cab" onClick={() => setVerEnCurso(v => !v)} aria-expanded={verEnCurso}>
            <span>
              <strong>Semana en curso</strong>
              <span className="cal-encurso-nota"> · avance parcial, se cierra el domingo</span>
            </span>
            <span className="cal-encurso-valor">
              {enCurso.estrellas !== null ? <><Estrellas valor={enCurso.estrellas} /> <span className="cal-numero">{fmtEstrellas(enCurso.estrellas)}</span></> : 'Sin datos todavía'}
              <ChevronDown size={16} style={{ transform: verEnCurso ? 'rotate(180deg)' : undefined }} />
            </span>
          </button>
          {verEnCurso && <Factores factores={enCurso.factores} />}
        </div>
      )}

      {historial === null ? (
        <Spinner size="sm" message="Cargando…" />
      ) : historial.length === 0 ? (
        <div className="cdet-empty">Todavía no hay semanas cerradas guardadas. Se guarda cada lunes.</div>
      ) : (
        <table className="cdet-table cal-semanas">
          <thead><tr>
            <th>Semana</th><th>Calificación</th><th>Cambio</th><th>Por qué</th><th />
          </tr></thead>
          <tbody>
            {historial.map((h, i) => {
              const previa = historial[i + 1]
              const dif = previa ? h.estrellas - previa.estrellas : 0
              const cambios = previa ? cambiosEntreSemanas(h.factores, previa.factores) : []
              const abiertaEsta = abierta === h.semana_inicio
              return (
                <Fragment key={h.semana_inicio}>
                  <tr className={`cal-fila${abiertaEsta ? ' is-abierta' : ''}`} onClick={() => setAbierta(abiertaEsta ? null : h.semana_inicio)}>
                    <td style={{ whiteSpace: 'nowrap' }}>Sem. del {fechaSemana(h.semana_inicio)}{i === 0 ? <span className="cal-ultima">última cerrada</span> : null}</td>
                    <td style={{ whiteSpace: 'nowrap' }}><Estrellas valor={h.estrellas} /> <span className="cal-numero">{fmtEstrellas(h.estrellas)}</span></td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {!previa ? <span className="cal-igual">—</span>
                        : dif === 0 ? <span className="cal-igual">= igual</span>
                          : <span className={dif > 0 ? 'cal-sube' : 'cal-baja'}>{dif > 0 ? '▲' : '▼'} {fmtEstrellas(Math.abs(dif))}</span>}
                    </td>
                    <td className="cal-porque">
                      {!previa ? 'Primera semana guardada'
                        : !h.factores || !previa.factores ? 'Sin detalle guardado'
                          : resumenCambio(cambios, dif)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button type="button" className="cal-expandir" aria-expanded={abiertaEsta} aria-label="Ver detalle de la semana">
                        <ChevronDown size={16} style={{ transform: abiertaEsta ? 'rotate(180deg)' : undefined }} />
                      </button>
                    </td>
                  </tr>
                  {abiertaEsta && (
                    <tr className="cal-detalle-fila">
                      <td colSpan={5}>
                        {previa && h.factores && previa.factores
                          ? <DetalleCambios cambios={cambios} />
                          : h.factores
                            ? <Factores factores={calificacionDesdeGuardada(h).factores} />
                            : <div className="cdet-empty">Esta semana se guardó sin el detalle de factores.</div>}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      )}

      <p className="cal-nota">
        Cada lunes se guarda la calificación de la semana que cerró. Pesos: pagos 30%, ingresos contra lo que
        tenía que cubrir 25%, cuidado del auto 20% (siniestros con culpa y excesos de km), multas 10%,
        aprovechamiento 10% y antigüedad 5%. Si falta un dato, ese factor no cuenta y los demás se reparten su
        peso. Las semanas anteriores al 02/11 se calcularon con la fórmula vieja. El efecto de cada factor es aproximado.
      </p>
    </div>
  )
}
