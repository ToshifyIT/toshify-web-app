// src/modules/siniestros/components/InformeGestionModal.tsx
// Siniestros v2: el Informe de gestión se arma a la vista. A la derecha se agrega lo que
// se escribe a mano (aclaración, recomendaciones, próximo paso de cada caso) y la vista
// previa se actualiza sola; recién al final se descarga.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, X } from 'lucide-react'
import type { CasoInforme, DatosInforme } from './informeGestionPdf'
import { Spinner } from '../../../components/ui/LoadingOverlay'

interface InformeGestionModalProps {
  /** Arma los datos del informe con las recomendaciones escritas (una por línea) */
  armarDatos: (recomendaciones: string) => DatosInforme
  periodo: string
  cantidad: number
  nombreArchivo: string
  onClose: () => void
}

/** Cuánto se espera después de la última tecla para rearmar la vista previa */
const ESPERA_MS = 700

type GrupoCaso = 'administrativos' | 'legales' | 'cerrados'
const GRUPOS: { clave: GrupoCaso; titulo: string; label: string }[] = [
  { clave: 'administrativos', titulo: 'En trámite (administrativa)', label: 'Próximo paso' },
  { clave: 'legales', titulo: 'En trámite (legal)', label: 'Próximo paso' },
  { clave: 'cerrados', titulo: 'Cerrados', label: 'Resolución' },
]
const claveCaso = (grupo: GrupoCaso, c: CasoInforme, i: number) => `${grupo}-${c.patente}-${i}`

export function InformeGestionModal({ armarDatos, periodo, cantidad, nombreArchivo, onClose }: InformeGestionModalProps) {
  // Lo que se escribe a mano
  const [aclaracion, setAclaracion] = useState('')
  const [recomendaciones, setRecomendaciones] = useState('')
  const [textosCaso, setTextosCaso] = useState<Record<string, string>>({})

  const [url, setUrl] = useState<string | null>(null)
  const [generando, setGenerando] = useState(true)
  const [pendiente, setPendiente] = useState(false)
  const [error, setError] = useState(false)
  const urlRef = useRef<string | null>(null)
  const turnoRef = useRef(0)

  // Datos del sistema (sin lo escrito a mano): casos y su texto sugerido
  const base = useMemo(() => armarDatos(''), [armarDatos])

  const armarConEdiciones = (): DatosInforme => {
    const datos = armarDatos(recomendaciones)
    const editar = (grupo: GrupoCaso, label: string) =>
      datos[grupo].map((c, i) => {
        const texto = textosCaso[claveCaso(grupo, c, i)]
        if (texto === undefined) return c
        return { ...c, cierre: texto.trim() ? { label, texto: texto.trim() } : undefined }
      })
    return {
      ...datos,
      aclaracion: aclaracion.trim() || datos.aclaracion,
      administrativos: editar('administrativos', 'Próximo paso'),
      legales: editar('legales', 'Próximo paso'),
      cerrados: editar('cerrados', 'Resolución'),
    }
  }

  // Rearma la vista previa al abrir y cada vez que se deja de escribir
  useEffect(() => {
    setPendiente(true)
    const turno = ++turnoRef.current
    const t = setTimeout(async () => {
      setGenerando(true)
      setError(false)
      try {
        const { generarInformeGestionPdf } = await import('./informeGestionPdf')
        const blob = await generarInformeGestionPdf(armarConEdiciones())
        if (turno !== turnoRef.current) return // ya se pidió otra versión
        const nueva = URL.createObjectURL(blob)
        if (urlRef.current) URL.revokeObjectURL(urlRef.current)
        urlRef.current = nueva
        setUrl(nueva)
        setPendiente(false)
      } catch (e) {
        console.error('No se pudo generar el informe de gestión:', e)
        setError(true)
      } finally {
        if (turno === turnoRef.current) setGenerando(false)
      }
    }, url ? ESPERA_MS : 0)
    return () => clearTimeout(t)
    // armarConEdiciones depende solo de estos valores
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aclaracion, recomendaciones, textosCaso])

  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
  }, [])

  const descargar = () => {
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = nombreArchivo
    a.click()
  }

  const ocupado = generando || pendiente

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content ss-modal ig-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ss-modal-header">
          <div>
            <h2>Informe de gestión</h2>
            <span className="ig-sub">{cantidad} siniestros · {periodo}</span>
          </div>
          <button className="ss-icon-btn" onClick={onClose} title="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="ig-cuerpo">
          <div className="ig-vista">
            {!url && generando && <div className="ig-cargando"><Spinner size="sm" message="Armando el informe..." /></div>}
            {error && !generando && <p className="ig-error">No se pudo generar el informe.</p>}
            {url && <iframe title="Vista previa del informe" src={`${url}#view=FitH`} className="ig-iframe" />}
            {url && ocupado && <span className="ig-actualizando">Actualizando vista previa…</span>}
          </div>

          <aside className="ig-panel">
            <p className="ig-panel-ayuda">
              Lo que escribas acá se agrega al informe y la vista previa se actualiza sola.
            </p>

            <label className="ig-campo">
              <span>Aclaración</span>
              <textarea
                rows={2}
                value={aclaracion}
                onChange={(e) => setAclaracion(e.target.value)}
                placeholder="Va debajo del título. Ej.: Montos sujetos a reavalúo de Sancor."
              />
            </label>

            <label className="ig-campo">
              <span>Recomendaciones y puntos de atención</span>
              <textarea
                rows={5}
                value={recomendaciones}
                onChange={(e) => setRecomendaciones(e.target.value)}
                placeholder="Un párrafo por línea."
              />
            </label>

            {GRUPOS.filter(g => base[g.clave].length > 0).map(g => (
              <div key={g.clave} className="ig-grupo">
                <span className="ig-grupo-titulo">{g.titulo}</span>
                {base[g.clave].map((c, i) => {
                  const k = claveCaso(g.clave, c, i)
                  return (
                    <label key={k} className="ig-campo ig-campo--caso">
                      <span>{c.patente} · {g.label}</span>
                      <textarea
                        rows={2}
                        value={textosCaso[k] ?? c.cierre?.texto ?? ''}
                        onChange={(e) => setTextosCaso(prev => ({ ...prev, [k]: e.target.value }))}
                        placeholder={g.label === 'Próximo paso' ? 'Qué sigue con este caso' : 'Cómo se cerró'}
                      />
                    </label>
                  )
                })}
              </div>
            ))}
          </aside>
        </div>

        <div className="ig-acciones">
          <button type="button" className="btn-secondary" onClick={onClose}>Cerrar</button>
          <button
            type="button"
            className="btn-primary"
            onClick={descargar}
            disabled={!url || ocupado}
            title={ocupado ? 'Esperá a que termine de actualizarse la vista previa' : undefined}
          >
            <Download size={16} />
            Descargar PDF
          </button>
        </div>
      </div>
    </div>
  )
}
