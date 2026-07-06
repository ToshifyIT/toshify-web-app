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
  conductor_raw: string | null
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
      const cols = tabla === 'uss_historico'
        ? 'id, patente, conductor, conductor_raw, ibutton, fecha_hora_inicio_gmt3, fecha_hora_fin_gmt3, kilometraje'
        : 'id, patente, conductor, ibutton, fecha_hora_inicio_gmt3, fecha_hora_fin_gmt3, kilometraje'
      const { data, error: e } = await (supabase
        .from(tabla)
        .select(cols)
        .gte('fecha_hora_inicio_gmt3', desde)
        .lte('fecha_hora_inicio_gmt3', hasta)
        .order('fecha_hora_inicio_gmt3', { ascending: true }) as any)
      if (e) throw e
      return ((data || []) as any[])
        .filter(r => normalizarPatente(r.patente) === patenteNorm)
        .map(r => ({ ...r, conductor_raw: r.conductor_raw ?? null, gps_origen: origen } as Trip))
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
  // Replica la lógica del sync sync-wialon-bitacora.ts:
  //   - Huérfanos (conductor=null) heredan del vecino más cercano de la misma patente.
  //   - Multi-conductor (conductor_raw con coma): el km/tiempo va al vecino más cercano
  //     que aparezca en la lista raw. Si solo uno de los conductores del raw aparece en
  //     un vecino con 1 conductor, el "huérfano" (el que no aparece) es el receptor.
  // Entonces un trip "in group" si: está dentro de la ventana Y el conductor efectivo
  // (después de huérfano-inherit y multi-donate) coincide con el de la marcación.
  const { tripsConMarca, totalKm, totalDuracion, tripsEnAgrupamiento } = useMemo(() => {
    if (!marcacion) return { tripsConMarca: [], totalKm: 0, totalDuracion: '-', tripsEnAgrupamiento: 0 }
    const ini = marcacion.periodoInicio ? new Date(marcacion.periodoInicio).getTime() : null
    const fin = marcacion.periodoFin ? new Date(marcacion.periodoFin).getTime() : null
    const conductorRef = (marcacion.conductor || '').trim().toUpperCase()
    const TOL = 60 * 1000

    // Parser de conductor_raw "203-LUCIANO, 212-MIGUEL" -> ["LUCIANO", "MIGUEL"]
    const parseRaw = (raw: string | null): string[] => {
      if (!raw) return []
      return raw.split(',').map(s => {
        const d = s.indexOf('-')
        return (d >= 0 ? s.slice(d + 1) : s).trim().toUpperCase()
      }).filter(n => n.length > 0)
    }

    // Ordenar trips por inicio (ya vienen ordenados pero por seguridad) y precomputar timestamps
    const tripsConTiempo = trips.map(t => {
      const tIniDate = parseGmt3(t.fecha_hora_inicio_gmt3)
      const tFinDate = parseGmt3(t.fecha_hora_fin_gmt3) || tIniDate
      const tIniMs = tIniDate ? tIniDate.getTime() : 0
      const tFinMs = tFinDate ? tFinDate.getTime() : tIniMs
      return { ...t, tIniMs, tFinMs }
    })

    // Calcular conductor efectivo para cada trip
    const conductorEfectivo: (string | null)[] = tripsConTiempo.map(t => {
      const conductores = parseRaw(t.conductor_raw)
      const titular = (t.conductor || '').trim().toUpperCase() || null

      // CASO 1: huerfano (conductor=null) -> heredar del vecino mas cercano (misma patente)
      // Como el drawer ya filtra a la misma patente, todos los vecinos sirven.
      if (!titular && conductores.length === 0) {
        let prev: typeof tripsConTiempo[number] | null = null
        let next: typeof tripsConTiempo[number] | null = null
        for (let j = tripsConTiempo.indexOf(t) - 1; j >= 0; j--) {
          if ((tripsConTiempo[j].conductor || '').trim()) { prev = tripsConTiempo[j]; break }
        }
        for (let j = tripsConTiempo.indexOf(t) + 1; j < tripsConTiempo.length; j++) {
          if ((tripsConTiempo[j].conductor || '').trim()) { next = tripsConTiempo[j]; break }
        }
        let chosen: typeof tripsConTiempo[number] | null = null
        if (prev && next) {
          const gPrev = t.tIniMs - prev.tFinMs
          const gNext = next.tIniMs - t.tFinMs
          chosen = gPrev <= gNext ? prev : next
        } else chosen = prev || next
        return (chosen?.conductor || '').trim().toUpperCase() || null
      }

      // CASO 2: multi-conductor (raw con 2+) -> ver si dona al vecino mas cercano
      if (conductores.length >= 2) {
        const bestGap = new Map<string, number>()
        const idx = tripsConTiempo.indexOf(t)
        // Hacia atras
        for (let j = idx - 1; j >= 0; j--) {
          const vr = parseRaw(tripsConTiempo[j].conductor_raw)
          if (vr.length !== 1) continue
          if (!conductores.includes(vr[0])) continue
          const gap = t.tIniMs - tripsConTiempo[j].tFinMs
          const prev = bestGap.get(vr[0])
          if (prev === undefined || gap < prev) bestGap.set(vr[0], gap)
          break
        }
        // Hacia adelante
        for (let j = idx + 1; j < tripsConTiempo.length; j++) {
          const vr = parseRaw(tripsConTiempo[j].conductor_raw)
          if (vr.length !== 1) continue
          if (!conductores.includes(vr[0])) continue
          const gap = tripsConTiempo[j].tIniMs - t.tFinMs
          const prev = bestGap.get(vr[0])
          if (prev === undefined || gap < prev) bestGap.set(vr[0], gap)
          break
        }
        let receptor: string | null = null
        if (bestGap.size === conductores.length) {
          let m = Infinity
          for (const [n, g] of bestGap.entries()) if (g < m) { m = g; receptor = n }
        } else if (bestGap.size > 0) {
          const huerf = conductores.filter(c => !bestGap.has(c))
          if (huerf.length === 1) receptor = huerf[0]
        }
        // Solo donamos si receptor !== titular actual (sino es no-op)
        if (receptor && receptor !== titular) return receptor
        return titular
      }

      // CASO 3: trip normal de 1 conductor
      return titular
    })

    let kmSum = 0
    let count = 0
    const enriched = tripsConTiempo.map((t, i) => {
      const dentroVentana = ini != null && fin != null && t.tIniMs >= (ini - TOL) && t.tFinMs <= (fin + TOL)
      const condEf = conductorEfectivo[i]
      const inGroup = dentroVentana && condEf === conductorRef
      if (inGroup) {
        kmSum += parseFloat(t.kilometraje || '0') || 0
        count++
      }
      // Strip los campos auxiliares para que el resto del drawer reciba Trip
      const { tIniMs: _a, tFinMs: _b, ...rest } = t
      return { ...rest, inGroup, conductorEfectivo: condEf }
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
        width: 'min(100vw, 820px)',
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
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
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
                  {['Inicio', 'Fin', 'Conductor', 'iButton', 'Km', 'Tiempo Conducido'].map((h, idx) => (
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
              <span style={{ color: 'var(--text-tertiary)', marginRight: 4 }}>Tiempo Conducido:</span>
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
  tripsDelDia: Array<Trip & { inGroup: boolean; conductorEfectivo: string | null }>
  conductorRef: string
  highlightStartRef: React.MutableRefObject<HTMLTableRowElement | null>
}

function FragmentDia({ diaKey, tripsDelDia, conductorRef, highlightStartRef }: FragmentDiaProps) {
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
        const condRefUpper = (conductorRef || '').trim().toUpperCase()
        const tituloUpper = (t.conductor || '').trim().toUpperCase()
        const condEfUpper = (t.conductorEfectivo || '').trim().toUpperCase()
        const otroConductor = !!t.conductor && tituloUpper !== condRefUpper && condEfUpper !== condRefUpper
        // Heredado: titular USS distinto al efectivo, y el efectivo coincide con la marcacion -> es donado/heredado
        const heredadoParaMarcacion = inGroup && tituloUpper !== condRefUpper
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
                {heredadoParaMarcacion && (
                  <span style={{ fontSize: 9, color: '#16a34a', fontWeight: 600 }}>
                    {!t.conductor ? `→ heredado a ${t.conductorEfectivo}` : `→ km contado a ${t.conductorEfectivo}`}
                  </span>
                )}
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
