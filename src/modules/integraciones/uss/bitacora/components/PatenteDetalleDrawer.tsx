// Drawer lateral con el detalle de trips USS de una patente durante la semana.
// Se abre al clickear la patente en una fila de Marcaciones.
// Resalta los trips que componen la marcación clickeada, muestra el resto atenuado.

import { useEffect, useState, useRef, useMemo } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../../../../../lib/supabase'
import type { Marcacion } from '../hooks/useUSSHistoricoData'

interface Trip {
  id: number
  patente: string
  conductor: string | null
  ibutton: string | null
  fecha_hora_inicio_gmt3: string
  fecha_hora_fin_gmt3: string | null
  kilometraje: string | null
  gps_origen: 'USS' | 'GEOTAB'
}

interface Props {
  marcacion: Marcacion | null
  semanaInicio: string  // YYYY-MM-DD lunes
  semanaFin: string     // YYYY-MM-DD domingo
  onClose: () => void
}

const DIAS = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB']

function fmtFechaCorta(iso: string): string {
  const d = new Date(iso)
  const dia = DIAS[d.getDay()]
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(2)
  return `${dia} ${dd}/${mm}/${yy}`
}
/**
 * Los campos *_gmt3 vienen sin offset (ej. "2026-05-09 23:28:48") pero ya están en ART.
 * Agregamos el offset -03:00 explícito para que JS no los interprete como hora local del browser.
 */
function parseGmt3(s: string | null | undefined): Date | null {
  if (!s) return null
  // Si ya tiene zona, devolverlo tal cual; si no, asumir -03:00
  const hasTz = /(Z|[+-]\d{2}:?\d{2})$/.test(s.trim())
  const iso = hasTz ? s.replace(' ', 'T') : s.replace(' ', 'T') + '-03:00'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : d
}
function fmtHora(iso: string | null): string {
  const d = parseGmt3(iso)
  if (!d) return '-'
  // Mostrar en ART (UTC-3) para ser consistente con la data ART de USS
  const ar = new Date(d.getTime() - 3 * 60 * 60 * 1000)
  const hh = String(ar.getUTCHours()).padStart(2, '0')
  const mi = String(ar.getUTCMinutes()).padStart(2, '0')
  const ss = String(ar.getUTCSeconds()).padStart(2, '0')
  return `${hh}:${mi}:${ss}`
}
function fmtDuracion(ini: string, fin: string | null): string {
  const dIni = parseGmt3(ini)
  const dFin = parseGmt3(fin)
  if (!dIni || !dFin) return '-'
  const ms = dFin.getTime() - dIni.getTime()
  if (isNaN(ms) || ms <= 0) return '-'
  const min = Math.round(ms / 60000)
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m} min`
  return `${h}h ${m}min`
}
function dayKey(iso: string): string {
  // Day en ART para agrupar bien (sin desfase por TZ)
  const d = parseGmt3(iso)
  if (!d) return iso.slice(0, 10)
  const ar = new Date(d.getTime() - 3 * 60 * 60 * 1000)
  const y = ar.getUTCFullYear()
  const m = String(ar.getUTCMonth() + 1).padStart(2, '0')
  const day = String(ar.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function normalizarPatente(p: string | null | undefined): string {
  return (p || '').replace(/[\s-]/g, '').toUpperCase()
}

export function PatenteDetalleDrawer({ marcacion, semanaInicio, semanaFin, onClose }: Props) {
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const highlightStartRef = useRef<HTMLTableRowElement | null>(null)

  // Cargar trips de USS + Geotab para la patente y semana
  useEffect(() => {
    if (!marcacion) {
      setTrips([])
      return
    }
    let cancel = false
    setLoading(true)
    setError(null)
    const patenteNorm = normalizarPatente(marcacion.patente)
    const desde = `${semanaInicio}T00:00:00`
    const hasta = `${semanaFin}T23:59:59`

    const fetchTabla = async (tabla: 'uss_historico' | 'geotab_historico', origen: 'USS' | 'GEOTAB'): Promise<Trip[]> => {
      const { data, error: e } = await (supabase
        .from(tabla)
        .select('id, patente, conductor, ibutton, fecha_hora_inicio_gmt3, fecha_hora_fin_gmt3, kilometraje')
        .gte('fecha_hora_inicio_gmt3', desde)
        .lte('fecha_hora_inicio_gmt3', hasta)
        .order('fecha_hora_inicio_gmt3', { ascending: true }) as any)
      if (e) throw e
      return ((data || []) as any[])
        .filter(r => normalizarPatente(r.patente) === patenteNorm)
        .map(r => ({ ...r, gps_origen: origen } as Trip))
    }

    ;(async () => {
      try {
        const [uss, geotab] = await Promise.all([
          fetchTabla('uss_historico', 'USS'),
          fetchTabla('geotab_historico', 'GEOTAB'),
        ])
        const todos = [...uss, ...geotab].sort((a, b) =>
          a.fecha_hora_inicio_gmt3.localeCompare(b.fecha_hora_inicio_gmt3),
        )
        if (!cancel) setTrips(todos)
      } catch (e: any) {
        if (!cancel) setError(e?.message || 'Error cargando trips')
      } finally {
        if (!cancel) setLoading(false)
      }
    })()

    return () => { cancel = true }
  }, [marcacion, semanaInicio, semanaFin])

  // Determinar qué trips están "dentro" del agrupamiento de la marcación seleccionada.
  // Criterio: mismo conductor (o ambos null) Y dentro de la ventana periodo_inicio → periodo_fin.
  const { tripsConMarca, totalKm, totalDuracion, tripsEnAgrupamiento } = useMemo(() => {
    if (!marcacion) return { tripsConMarca: [], totalKm: 0, totalDuracion: '-', tripsEnAgrupamiento: 0 }
    // periodoInicio/periodoFin de wialon_bitacora ya vienen con tz (+00), parsean OK directamente.
    // fecha_hora_*_gmt3 de uss_historico vienen SIN tz pero están en ART → usar parseGmt3.
    const ini = marcacion.periodoInicio ? new Date(marcacion.periodoInicio).getTime() : null
    const fin = marcacion.periodoFin ? new Date(marcacion.periodoFin).getTime() : null
    const conductorRef = (marcacion.conductor || '').trim().toUpperCase()
    let kmSum = 0
    let count = 0
    const enriched = trips.map(t => {
      const tIniDate = parseGmt3(t.fecha_hora_inicio_gmt3)
      const tFinDate = parseGmt3(t.fecha_hora_fin_gmt3) || tIniDate
      const tIni = tIniDate ? tIniDate.getTime() : 0
      const tFin = tFinDate ? tFinDate.getTime() : tIni
      // Tolerancia de 60s en ambos extremos para absorber desalineaciones de segundos
      // entre periodo de la marcación (UTC) y trips (ART → UTC al parsear).
      const TOL = 60 * 1000
      const dentroVentana = ini != null && fin != null && tIni >= (ini - TOL) && tFin <= (fin + TOL)
      const mismoConductor = (t.conductor || '').trim().toUpperCase() === conductorRef
      const inGroup = dentroVentana && mismoConductor
      if (inGroup) {
        kmSum += parseFloat(t.kilometraje || '0') || 0
        count++
      }
      return { ...t, inGroup }
    })
    return {
      tripsConMarca: enriched,
      totalKm: Math.round(kmSum * 100) / 100,
      totalDuracion: marcacion.duracionMinutos != null
        ? (Math.floor(marcacion.duracionMinutos / 60) > 0
            ? `${Math.floor(marcacion.duracionMinutos / 60)}h ${marcacion.duracionMinutos % 60}min`
            : `${marcacion.duracionMinutos} min`)
        : '-',
      tripsEnAgrupamiento: count,
    }
  }, [trips, marcacion])

  // Scroll automático al primer trip resaltado
  useEffect(() => {
    if (!marcacion || tripsConMarca.length === 0) return
    const timer = setTimeout(() => {
      if (highlightStartRef.current) {
        highlightStartRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 150)
    return () => clearTimeout(timer)
  }, [marcacion, tripsConMarca])

  if (!marcacion) return null

  // Agrupar trips por día para los separadores
  const tripsPorDia = new Map<string, typeof tripsConMarca>()
  for (const t of tripsConMarca) {
    const key = dayKey(t.fecha_hora_inicio_gmt3)
    if (!tripsPorDia.has(key)) tripsPorDia.set(key, [])
    tripsPorDia.get(key)!.push(t)
  }
  const diasOrdenados = [...tripsPorDia.keys()].sort()

  const conductoresUnicos = new Set(tripsConMarca.map(t => t.conductor).filter(Boolean))
  const patente = marcacion.patenteNormalizada || marcacion.patente.replace(/\s/g, '')

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.45)', zIndex: 999 }}
      />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 820, maxWidth: '96vw',
        background: 'var(--bg-primary, #fff)',
        zIndex: 1000,
        boxShadow: '-4px 0 24px rgba(0,0,0,0.25)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* HEADER */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-primary, #e5e7eb)',
          background: 'var(--bg-secondary, #f9fafb)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        }}>
          <div>
            <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                fontFamily: 'monospace', fontSize: 13, background: 'var(--text-primary, #111827)',
                color: '#fff', padding: '3px 8px', borderRadius: 4,
              }}>{patente}</span>
              <span style={{ color: 'var(--text-secondary)' }}>
                Detalle de trips · {semanaInicio} a {semanaFin}
              </span>
            </h3>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
              Marcación: <strong style={{ color: 'var(--text-primary)' }}>{marcacion.conductor}</strong>
              {' · '}
              <strong style={{ color: 'var(--text-primary)' }}>{marcacion.fecha}</strong>
              {' '}
              <strong style={{ color: '#16a34a' }}>{marcacion.entrada}</strong>
              {' → '}
              <strong style={{ color: '#dc2626' }}>{marcacion.salida}</strong>
              {' · '}
              <strong style={{ color: 'var(--text-primary)' }}>{totalDuracion}</strong>
              {' · '}
              <strong style={{ color: 'var(--text-primary)' }}>{marcacion.kmTotal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km</strong>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: '#fff',
              border: '1px solid var(--border-primary, #e5e7eb)',
              width: 28, height: 28, borderRadius: 6, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-secondary)',
            }}
            title="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        {/* LEYENDA */}
        <div style={{
          padding: '10px 20px',
          background: 'var(--bg-secondary, #f9fafb)',
          borderBottom: '1px solid var(--border-primary, #e5e7eb)',
          display: 'flex', gap: 16, alignItems: 'center', fontSize: 11,
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text-tertiary)' }}>
            <span style={{ width: 12, height: 12, borderRadius: 2, display: 'inline-block', background: '#f0fdf4', border: '1px solid #86efac' }} />
            En el agrupamiento
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text-tertiary)' }}>
            <span style={{ width: 12, height: 12, borderRadius: 2, display: 'inline-block', background: '#fff', border: '1px solid var(--border-primary, #e5e7eb)' }} />
            Otros conductores
          </span>
          <span style={{ marginLeft: 'auto', color: 'var(--text-tertiary)' }}>
            {loading ? 'Cargando...' : `${tripsConMarca.length} trips · ${conductoresUnicos.size} conductores`}
          </span>
        </div>

        {/* TABLA */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          {error && (
            <div style={{ padding: 16, color: '#dc2626', fontSize: 12 }}>{error}</div>
          )}
          {!loading && !error && tripsConMarca.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>
              Sin trips en este rango
            </div>
          )}
          {tripsConMarca.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr>
                  {['Inicio', 'Fin', 'Conductor', 'iButton', 'Km', 'Duración'].map((h, idx) => (
                    <th key={h} style={{
                      position: 'sticky', top: 0, background: 'var(--bg-secondary, #f9fafb)',
                      padding: '8px 12px', textAlign: idx >= 4 ? 'right' : 'left',
                      fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)',
                      textTransform: 'uppercase', letterSpacing: '0.4px',
                      borderBottom: '1px solid var(--border-primary, #e5e7eb)', zIndex: 2,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {diasOrdenados.map(diaKey => (
                  <FragmentDia
                    key={diaKey}
                    diaKey={diaKey}
                    tripsDelDia={tripsPorDia.get(diaKey)!}
                    conductorRef={marcacion.conductor}
                    highlightStartRef={highlightStartRef}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* FOOTER con totales */}
        <div style={{
          padding: '10px 20px',
          background: '#f0fdf4',
          borderTop: '2px solid #86efac',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11,
        }}>
          <div style={{ display: 'flex', gap: 16 }}>
            <span>
              <span style={{ color: 'var(--text-tertiary)', marginRight: 4 }}>Trips en agrupamiento:</span>
              <strong style={{ fontFamily: 'monospace' }}>{tripsEnAgrupamiento}</strong>
            </span>
            <span>
              <span style={{ color: 'var(--text-tertiary)', marginRight: 4 }}>Km totales:</span>
              <strong style={{ fontFamily: 'monospace' }}>{totalKm.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
            </span>
            <span>
              <span style={{ color: 'var(--text-tertiary)', marginRight: 4 }}>Duración:</span>
              <strong style={{ fontFamily: 'monospace' }}>{totalDuracion}</strong>
            </span>
          </div>
          <div style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>
            {marcacion.gpsOrigen === 'GEOTAB' ? 'Geotab' : 'USS Ecotracker'}
            {marcacion.ibutton && ` · iButton ${marcacion.ibutton}`}
          </div>
        </div>
      </div>
    </>
  )
}

interface FragmentDiaProps {
  diaKey: string
  tripsDelDia: Array<Trip & { inGroup: boolean }>
  conductorRef: string
  highlightStartRef: React.MutableRefObject<HTMLTableRowElement | null>
}

function FragmentDia({ diaKey, tripsDelDia, conductorRef, highlightStartRef }: FragmentDiaProps) {
  // Determinar si este día tiene el primer trip "in group" — para asignar la ref de scroll
  let firstInGroupAssigned = false
  return (
    <>
      <tr>
        <td colSpan={6} style={{
          background: '#f3f4f6', padding: '6px 12px',
          fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)',
          textTransform: 'uppercase', letterSpacing: '0.4px',
          position: 'sticky', top: 32, zIndex: 1,
          borderTop: '1px solid var(--border-primary, #e5e7eb)',
        }}>
          {fmtFechaCorta(diaKey + 'T12:00:00')}
        </td>
      </tr>
      {tripsDelDia.map((t, idx) => {
        const inGroup = t.inGroup
        const isFirstInGroupOverall = inGroup && !firstInGroupAssigned
        if (isFirstInGroupOverall) firstInGroupAssigned = true
        const otroConductor = t.conductor && t.conductor.trim().toUpperCase() !== (conductorRef || '').trim().toUpperCase()
        const bg = inGroup ? '#f0fdf4' : '#fff'
        const borderLeft = inGroup ? '3px solid #16a34a' : '3px solid transparent'
        return (
          <tr
            key={t.id + '_' + idx}
            ref={isFirstInGroupOverall ? highlightStartRef : null}
            style={{
              background: bg,
              borderBottom: '1px solid var(--border-primary, #e5e7eb)',
              opacity: !inGroup && otroConductor ? 0.85 : 1,
            }}
          >
            <td style={{ padding: '7px 12px', borderLeft, fontFamily: 'monospace', fontWeight: 600, color: '#16a34a' }}>
              {fmtHora(t.fecha_hora_inicio_gmt3)}
            </td>
            <td style={{ padding: '7px 12px', fontFamily: 'monospace', fontWeight: 600, color: '#dc2626' }}>
              {fmtHora(t.fecha_hora_fin_gmt3)}
            </td>
            <td style={{ padding: '7px 12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontWeight: 600, fontSize: 11, color: inGroup ? '#16a34a' : 'var(--text-primary)' }}>
                  {t.conductor || '(sin conductor)'}
                </span>
                {otroConductor && !inGroup && (
                  <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>otro conductor</span>
                )}
              </div>
            </td>
            <td style={{ padding: '7px 12px', fontFamily: 'monospace', fontSize: 10, color: 'var(--text-tertiary)' }}>
              {t.ibutton || '-'}
            </td>
            <td style={{ padding: '7px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>
              {parseFloat(t.kilometraje || '0').toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </td>
            <td style={{ padding: '7px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>
              {fmtDuracion(t.fecha_hora_inicio_gmt3, t.fecha_hora_fin_gmt3)}
            </td>
          </tr>
        )
      })}
    </>
  )
}
