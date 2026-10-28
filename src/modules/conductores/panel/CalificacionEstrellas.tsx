// src/modules/conductores/panel/CalificacionEstrellas.tsx
// Estrellas (1 a 5, con medias) y la ventana que explica la calificación.
import { useEffect, useState } from 'react'
import { Star, X } from 'lucide-react'
import type { Calificacion } from './calificacionConductor'
import { cargarHistorial, type CalificacionSemana } from './calificacionesHistorial'

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

export function CalificacionModal({ conductorId, nombre, calificacion, onClose }: {
  conductorId: string
  nombre: string
  calificacion: Calificacion
  onClose: () => void
}) {
  const [historial, setHistorial] = useState<CalificacionSemana[] | null>(null)
  useEffect(() => {
    let activo = true
    cargarHistorial(conductorId)
      .then(h => { if (activo) setHistorial(h) })
      .catch(() => { if (activo) setHistorial([]) })
    return () => { activo = false }
  }, [conductorId])

  useEffect(() => {
    const cerrar = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', cerrar)
    return () => window.removeEventListener('keydown', cerrar)
  }, [onClose])

  const conDato = calificacion.factores.filter(f => f.puntaje !== null)
  const pesoTotal = conDato.reduce((t, f) => t + f.peso, 0) || 1

  return (
    <div className="cal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="cal-modal" role="dialog" aria-modal="true" aria-labelledby="cal-titulo">
        <header className="cal-header">
          <div>
            <h2 id="cal-titulo">{nombre}</h2>
            {calificacion.estrellas !== null ? (
              <div className="cal-resumen">
                <Estrellas valor={calificacion.estrellas} />
                <strong>{calificacion.estrellas.toLocaleString('es-AR')} de 5</strong>
              </div>
            ) : (
              <div className="cal-resumen">Sin datos suficientes para calificar</div>
            )}
          </div>
          <button type="button" className="cal-cerrar" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </header>

        <div className="cal-factores">
          {calificacion.factores.map(f => {
            const pct = f.puntaje === null ? null : Math.round(f.puntaje * 100)
            const pesoReal = f.puntaje === null ? 0 : Math.round((f.peso / pesoTotal) * 100)
            const tono = pct === null ? 'nulo' : pct >= 70 ? 'bueno' : pct >= 40 ? 'medio' : 'malo'
            return (
              <div key={f.clave} className="cal-factor">
                <div className="cal-factor-cab">
                  <span className="cal-factor-nombre">{f.nombre}</span>
                  <span className="cal-factor-peso">{f.puntaje === null ? 'no cuenta' : `pesa ${pesoReal}%`}</span>
                </div>
                <div className="cal-factor-valor">{f.valor}</div>
                <div className="cal-barra">
                  <span className={`cal-barra-relleno cal-${tono}`} style={{ width: `${pct ?? 0}%` }} />
                </div>
                <div className="cal-factor-expl">{f.explicacion}</div>
              </div>
            )
          })}
        </div>

        <div className="cal-historial">
          <div className="cal-historial-titulo">Historial por semana cerrada</div>
          {historial === null ? (
            <div className="cal-historial-vacio">Cargando…</div>
          ) : historial.length === 0 ? (
            <div className="cal-historial-vacio">Todavía no hay semanas cerradas guardadas. Se guarda cada lunes.</div>
          ) : (
            <ul className="cal-historial-lista">
              {historial.map((h, i) => {
                const previa = historial[i + 1]
                const dif = previa ? h.estrellas - previa.estrellas : 0
                return (
                  <li key={h.semana_inicio}>
                    <span className="cal-historial-sem">Sem. del {fechaSemana(h.semana_inicio)}</span>
                    <Estrellas valor={h.estrellas} />
                    <span className="cal-numero">{h.estrellas.toLocaleString('es-AR')}</span>
                    {previa && dif !== 0 ? (
                      <span className={dif > 0 ? 'cal-sube' : 'cal-baja'}>{dif > 0 ? '▲' : '▼'} {Math.abs(dif).toLocaleString('es-AR')}</span>
                    ) : <span />}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <p className="cal-nota">
          La calificación combina seis factores según su peso: viajes 20%, aprovechamiento 20%, deuda 20%,
          ingresos 15%, límite de km 15% y multas 10%. Arriba: semana en curso. El historial guarda cada semana cerrada.
          {calificacion.parcial ? ' Si falta un dato, ese factor no cuenta y los demás se reparten su peso.' : ''}
        </p>
      </div>
    </div>
  )
}
