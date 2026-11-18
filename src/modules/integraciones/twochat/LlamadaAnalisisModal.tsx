/**
 * Detalle de una llamada analizada por Gemini: resumen, cómo terminó, calidad
 * por criterio y la transcripción completa. (Integraciones › 2Chat › Llamadas)
 */
import { X } from 'lucide-react'
import type { CriterioCalidad, LlamadaTwoChat, ResultadoConversacion } from '../../../services/twoChatService'
import { formatFechaHoraART } from '../../../utils/fechaArgentina'

const ETIQUETA_CRITERIO: Record<CriterioCalidad, { nombre: string; ayuda: string }> = {
  presentacion: { nombre: 'Presentación', ayuda: 'Saluda, dice su nombre y que llama de Toshify' },
  indagacion: { nombre: 'Indagación', ayuda: 'Pregunta por la situación del contacto antes de ofrecer' },
  claridad: { nombre: 'Claridad', ayuda: 'Explica condiciones, precios y requisitos sin errores' },
  objeciones: { nombre: 'Objeciones', ayuda: 'Responde dudas y reparos con argumentos' },
  cierre: { nombre: 'Cierre', ayuda: 'Termina con un próximo paso concreto' },
}

const ETIQUETA_RESULTADO_CONVERSACION: Record<ResultadoConversacion, string> = {
  interesado: 'Interesado',
  agendado: 'Agendado',
  volver_a_llamar: 'Volver a llamar',
  no_interesado: 'No interesado',
  informativa: 'Informativa',
  otro: 'Otro',
}

const CRITERIOS: CriterioCalidad[] = ['presentacion', 'indagacion', 'claridad', 'objeciones', 'cierre']

export function NotaCalidad({ nota }: { nota: number | null }) {
  if (nota == null) return <span className="tc-nota tc-nota--na">-</span>
  // Acepta promedios (3,8): verde desde 4, amarillo desde 3
  const nivel = nota >= 4 ? 'buena' : nota >= 3 ? 'media' : 'baja'
  const texto = Number.isInteger(nota) ? String(nota) : nota.toFixed(1).replace('.', ',')
  return <span className={`tc-nota tc-nota--${nivel}`}>{texto}/5</span>
}

interface Props {
  llamada: LlamadaTwoChat
  onClose: () => void
}

export function LlamadaAnalisisModal({ llamada, onClose }: Props) {
  const detalle = llamada.calificacion_detalle
  const contacto = llamada.conductor || llamada.lead || llamada.numero || 'Sin identificar'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content tc-analisis" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Llamada con {contacto}</h2>
            <div className="tc-analisis-sub">
              {formatFechaHoraART(llamada.fecha)} · {llamada.agente}
            </div>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body tc-analisis-body">
          {llamada.resumen && (
            <section>
              <h3 className="tc-analisis-titulo">Resumen</h3>
              <p>{llamada.resumen}</p>
            </section>
          )}

          {(llamada.resultado_conversacion || llamada.proximo_paso) && (
            <section className="tc-analisis-fila">
              {llamada.resultado_conversacion && (
                <div>
                  <h3 className="tc-analisis-titulo">Cómo terminó</h3>
                  <p>{ETIQUETA_RESULTADO_CONVERSACION[llamada.resultado_conversacion]}</p>
                </div>
              )}
              {llamada.proximo_paso && (
                <div>
                  <h3 className="tc-analisis-titulo">Próximo paso</h3>
                  <p>{llamada.proximo_paso}</p>
                </div>
              )}
            </section>
          )}

          {llamada.calificacion != null && (
            <section>
              <h3 className="tc-analisis-titulo">
                Calidad de la llamada <NotaCalidad nota={llamada.calificacion} />
              </h3>
              {detalle?.motivo && <p className="tc-analisis-motivo">{detalle.motivo}</p>}
              {detalle && (
                <div className="tc-criterios">
                  {CRITERIOS.map((c) => (
                    <div key={c} className="tc-criterio" title={ETIQUETA_CRITERIO[c].ayuda}>
                      <span>{ETIQUETA_CRITERIO[c].nombre}</span>
                      <div className="tc-criterio-barra">
                        <div style={{ width: `${((detalle[c] ?? 0) / 5) * 100}%` }} />
                      </div>
                      <span className="tc-criterio-nota">{detalle[c] ?? 'No aplica'}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          <section>
            <h3 className="tc-analisis-titulo">Transcripción</h3>
            {llamada.transcripcion ? (
              <div className="tc-transcripcion">
                {llamada.transcripcion.split('\n').filter((t) => t.trim()).map((turno, i) => {
                  const [quien, ...resto] = turno.split(':')
                  const tieneRol = resto.length > 0 && quien.length < 12
                  return (
                    <p key={i} className={tieneRol && quien.trim() === 'Agente' ? 'tc-turno--agente' : undefined}>
                      {tieneRol ? <><b>{quien.trim()}:</b>{resto.join(':')}</> : turno}
                    </p>
                  )
                })}
              </div>
            ) : (
              <p className="tc-analisis-vacio">No se identificaron palabras en la grabación.</p>
            )}
          </section>

          {llamada.grabacion && (
            <a href={llamada.grabacion} target="_blank" rel="noreferrer" className="tc-link">
              Escuchar la grabación
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
