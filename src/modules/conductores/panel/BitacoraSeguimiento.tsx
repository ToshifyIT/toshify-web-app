// src/modules/conductores/panel/BitacoraSeguimiento.tsx
// Bitácora de seguimiento del conductor: las notas de cobranza
// (sql/conductores_notas_cobranza.sql) y, mezcladas por fecha, sus llamadas de 2Chat
// desde que tiene asignación (quién, a qué número, duración, resultado y resumen).
// Arriba, un resumen con IA de todo (server-2chat.js → conductores_seguimiento_resumen),
// cuyo nivel es el factor «Seguimiento» de la calificación.
import { useCallback, useEffect, useState } from 'react'
import { Phone, PhoneIncoming, Sparkles } from 'lucide-react'
import type { NivelSeguimiento, ResumenSeguimiento } from '../../../services/twoChatService'
import { obtenerResumenSeguimiento } from '../../../services/twoChatService'
import { formatDateTimeAR } from '../../../utils/dateUtils'
import type { EntradaBitacora } from '../../vehiculos/components/BitacoraNotasVehiculo'
import { cargarLlamadasBitacora, ETIQUETA_RESULTADO_LLAMADA } from './llamadasBitacora'
import type { LlamadaBitacora } from './llamadasBitacora'
import { BitacoraNotasVehiculo } from '../../vehiculos/components/BitacoraNotasVehiculo'

function mmss(seg: number) {
  return `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`
}

function ContenidoLlamada({ l }: { l: LlamadaBitacora }) {
  const [verTranscripcion, setVerTranscripcion] = useState(false)
  return (
    <>
      <div>
        Llamada {l.direccion === 'saliente' ? 'a' : 'de'} {l.numero || 'número desconocido'}
        {' · '}{ETIQUETA_RESULTADO_LLAMADA[l.resultado] || l.resultado}
        {l.duracion > 0 ? ` · ${mmss(l.duracion)}` : ''}
      </div>
      {l.resumen && <div style={{ color: 'var(--text-secondary)', marginTop: 2 }}>{l.resumen}</div>}
      {l.transcripcion && (
        <>
          <button type="button" className="bnv-ver-todas" style={{ marginTop: 2 }} onClick={() => setVerTranscripcion(v => !v)}>
            {verTranscripcion ? 'Ocultar transcripción' : 'Ver transcripción'}
          </button>
          {verTranscripcion && (
            <div style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{l.transcripcion}</div>
          )}
        </>
      )}
    </>
  )
}

// Solo texto en color, sin resaltado (como «Garantía · …» y «Toshipass · …»)
const NIVEL: Record<NivelSeguimiento, { texto: string; color: string }> = {
  bueno: { texto: 'Bueno', color: '#15803d' },
  regular: { texto: 'Regular', color: '#b45309' },
  malo: { texto: 'Malo', color: '#b91c1c' },
}

function TarjetaResumen({ estado, resumen, error }: { estado: 'cargando' | 'listo' | 'error'; resumen: ResumenSeguimiento | null; error: string | null }) {
  if (estado === 'listo' && !resumen) return null
  const nivel = resumen ? NIVEL[resumen.nivel] : null
  return (
    <div style={{
      border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)',
      padding: '10px 12px', marginBottom: 10, fontSize: 13,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontSize: 11, color: 'var(--text-secondary)' }}>
        <Sparkles size={13} />
        <span style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Resumen</span>
        {nivel && (
          <span className="cdet-kpi-badge" title={resumen?.motivo || undefined} style={{ color: nivel.color }}>
            Seguimiento · {nivel.texto}
          </span>
        )}
        {resumen && <span style={{ marginLeft: 'auto' }}>Actualizado {formatDateTimeAR(resumen.generado_en)}</span>}
      </div>
      {estado === 'cargando' && !resumen ? (
        <div style={{ color: 'var(--text-secondary)' }}>Armando el resumen…</div>
      ) : estado === 'error' && !resumen ? (
        <div style={{ color: 'var(--text-secondary)' }}>No se pudo armar el resumen{error ? `: ${error}` : ''}.</div>
      ) : resumen ? (
        <>
          <div style={{ color: 'var(--text-primary)' }}>{resumen.resumen}</div>
          {resumen.motivo && <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>{resumen.motivo}</div>}
        </>
      ) : null}
    </div>
  )
}

export function BitacoraSeguimiento({ conductorId }: { conductorId: string }) {
  const [llamadas, setLlamadas] = useState<LlamadaBitacora[]>([])
  const [resumen, setResumen] = useState<ResumenSeguimiento | null>(null)
  const [estadoResumen, setEstadoResumen] = useState<'cargando' | 'listo' | 'error'>('cargando')
  const [errorResumen, setErrorResumen] = useState<string | null>(null)

  const cargarResumen = useCallback((id: string, esActual: () => boolean) => {
    setEstadoResumen('cargando')
    obtenerResumenSeguimiento(id)
      .then(r => { if (esActual()) { setResumen(r); setEstadoResumen('listo') } })
      .catch(err => {
        console.error('No se pudo armar el resumen de seguimiento:', err)
        if (esActual()) { setErrorResumen(err instanceof Error ? err.message : String(err)); setEstadoResumen('error') }
      })
  }, [])

  useEffect(() => {
    let actual = true
    setResumen(null)
    cargarResumen(conductorId, () => actual)
    return () => { actual = false }
  }, [conductorId, cargarResumen])

  useEffect(() => {
    let cancelado = false
    setLlamadas([])
    cargarLlamadasBitacora(conductorId)
      .then(l => { if (!cancelado) setLlamadas(l) })
      .catch(err => console.error('No se pudieron cargar las llamadas de 2Chat:', err))
    return () => { cancelado = true }
  }, [conductorId])

  const extras: EntradaBitacora[] = llamadas.map(l => ({
    id: l.id,
    fecha: l.fecha,
    autor: l.quien && l.via ? `${l.quien} (vía ${l.via})` : l.quien || `vía ${l.via} (desde la app de 2Chat)`,
    icono: l.direccion === 'saliente'
      ? <Phone size={12} aria-label="Llamada" />
      : <PhoneIncoming size={12} aria-label="Llamada entrante" />,
    contenido: <ContenidoLlamada l={l} />,
  }))

  return (
    <BitacoraNotasVehiculo
      vehiculoId={conductorId}
      canAdd
      extras={extras}
      encabezado={<TarjetaResumen estado={estadoResumen} resumen={resumen} error={errorResumen} />}
      onNotaAgregada={() => cargarResumen(conductorId, () => true)}
      config={{
        tabla: 'conductores_notas_cobranza',
        columnaId: 'conductor_id',
        titulo: 'Bitácora de seguimiento',
        sqlArchivo: 'sql/conductores_notas_cobranza.sql',
        etiquetaOrigen: { carga_inicial: 'Observación inicial (cobranzas)' },
      }}
    />
  )
}
