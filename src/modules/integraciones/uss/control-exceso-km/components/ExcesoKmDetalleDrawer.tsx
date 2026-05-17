// Drawer lateral con el desglose semanal del conductor:
//   - Suma del exceso por día (acumulado vs límite)
//   - Excesos de velocidad de la semana con localización (link a Google Maps)

import { useEffect, useState } from 'react'
import { X, AlertTriangle, MapPin, Gauge, ExternalLink } from 'lucide-react'
import { supabase } from '../../../../../lib/supabase'
import type { ExcesoKmRow } from './ExcesoKmTable'

interface Props {
  row: ExcesoKmRow | null
  onClose: () => void
  /** Rango semanal visible para acotar la query de excesos de velocidad */
  semanaInicio: string
  semanaFin: string
}

interface ExcesoVelocidad {
  id: string
  fecha_evento: string
  patente: string | null
  localizacion: string | null
  latitud: number | null
  longitud: number | null
  velocidad_maxima: number | null
  limite_velocidad: number | null
  exceso: number | null
  duracion_segundos: number | null
}

function formatFecha(fecha: string): string {
  if (!fecha) return '-'
  const [y, m, d] = fecha.split('-')
  return `${d}/${m}/${y.slice(2)}`
}

function formatFechaHora(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '-'
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(2)
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${yy} ${hh}:${mi}`
}

function formatSegundos(s: number | null): string {
  if (s == null || s <= 0) return '-'
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rest = s % 60
  return rest === 0 ? `${m}min` : `${m}m ${rest}s`
}

export function ExcesoKmDetalleDrawer({ row, onClose, semanaInicio, semanaFin }: Props) {
  const [excesosVel, setExcesosVel] = useState<ExcesoVelocidad[]>([])
  const [loadingVel, setLoadingVel] = useState(false)

  useEffect(() => {
    if (!row) {
      setExcesosVel([])
      return
    }
    let cancel = false
    ;(async () => {
      setLoadingVel(true)
      try {
        const desde = `${semanaInicio}T00:00:00`
        const hasta = `${semanaFin}T23:59:59`
        let q = supabase
          .from('uss_excesos_velocidad')
          .select('id, fecha_evento, patente, localizacion, latitud, longitud, velocidad_maxima, limite_velocidad, exceso, duracion_segundos')
          .gte('fecha_evento', desde)
          .lte('fecha_evento', hasta)
          .order('fecha_evento', { ascending: true })
          .limit(500)
        if (row.conductorId) q = q.eq('conductor_id', row.conductorId)
        else q = q.eq('conductor_wialon', row.conductorNombre)
        const { data, error } = await q
        if (cancel) return
        if (error) throw error
        setExcesosVel((data || []) as any)
      } catch {
        if (!cancel) setExcesosVel([])
      } finally {
        if (!cancel) setLoadingVel(false)
      }
    })()
    return () => { cancel = true }
  }, [row, semanaInicio, semanaFin])

  if (!row) return null

  // Listar cada marcacion con su entrada -> salida real (igual que Bitacora),
  // ordenadas por periodo_inicio. Acumulado progresivo para resaltar cuando cruzo el limite.
  const marcacionesOrdenadas = [...row.detalle].sort((a, b) => {
    const av = a.periodoInicio || `${a.fecha}T${a.entrada}`
    const bv = b.periodoInicio || `${b.fecha}T${b.entrada}`
    return av.localeCompare(bv)
  })
  let acumulado = 0
  const marcacionesConAcum = marcacionesOrdenadas.map(m => {
    acumulado += m.kmTotal || 0
    return { m, acumulado, excedeAqui: acumulado > row.limite }
  })

  // Agrupar excesos de velocidad por ubicación
  const porUbicacion = new Map<string, ExcesoVelocidad[]>()
  for (const ev of excesosVel) {
    const key = ev.localizacion || 'Sin localización'
    if (!porUbicacion.has(key)) porUbicacion.set(key, [])
    porUbicacion.get(key)!.push(ev)
  }
  const ubicacionesTop = [...porUbicacion.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 6)

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', zIndex: 999 }}
      />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 'min(100vw, 640px)',
        background: 'var(--bg-primary, #fff)',
        zIndex: 1000,
        boxShadow: '-4px 0 20px rgba(0,0,0,0.15)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* HEADER */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-primary, #e5e7eb)',
          background: 'var(--bg-secondary, #f9fafb)',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle size={14} color={row.excedido > 0 ? '#dc2626' : '#16a34a'} />
              {row.conductorNombre}
            </span>
            <span style={{ fontSize: 12, color: row.excedido > 0 ? '#dc2626' : 'var(--text-secondary)', fontWeight: 600 }}>
              {row.kmRecorridos.toLocaleString('es-AR')} / {row.limite.toLocaleString('es-AR')} km · {row.modalidad === 'a_cargo' ? 'a cargo' : 'turno'}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {row.excedido > 0
                ? `Excedido: +${row.excedido.toLocaleString('es-AR')} km (${row.porcentaje}%)`
                : 'Dentro del límite semanal'}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32,
              border: '1px solid var(--border-primary, #e5e7eb)',
              borderRadius: 8, background: 'var(--bg-primary, #fff)',
              color: 'var(--text-secondary)', cursor: 'pointer',
            }}
            title="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        {/* BODY */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

          {/* SECCIÓN: Marcaciones de la semana (entrada -> salida real, como Bitacora) */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
              Marcaciones de la semana ({marcacionesConAcum.length})
            </div>
            {marcacionesConAcum.map(({ m, acumulado: acumActual, excedeAqui }, idx) => {
              const pctAcum = (acumActual / row.limite) * 100
              const pctBar = Math.min(100, pctAcum)
              let barColor = '#16a34a'
              if (pctAcum >= 100) barColor = '#dc2626'
              else if (pctAcum >= 80) barColor = '#ea580c'
              else if (pctAcum >= 60) barColor = '#f59e0b'
              // Fecha entrada y salida (si periodoInicio/periodoFin existen, los usamos; sino caemos al fecha+entrada)
              const fechaIni = m.periodoInicio ? m.periodoInicio.slice(0, 10) : m.fecha
              const fechaFin = m.periodoFin ? m.periodoFin.slice(0, 10) : m.fecha
              const cruzaDia = fechaIni !== fechaFin
              const dur = m.duracionMinutos
              const durTxt = dur != null
                ? (dur >= 60 ? `${Math.floor(dur / 60)}h ${dur % 60}min` : `${dur} min`)
                : '-'
              return (
                <div key={`${m.id}-${idx}`} style={{
                  padding: '10px 0',
                  borderBottom: '1px solid var(--border-primary, #e5e7eb)',
                  fontSize: 12,
                  display: 'flex', flexDirection: 'column', gap: 6,
                }}>
                  {/* Linea 1: rango entrada -> salida + km del turno */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3, flex: 1, minWidth: 0 }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600 }}>
                        <span style={{ color: '#16a34a' }}>{formatFecha(fechaIni)} {m.entrada}</span>
                        <span style={{ color: 'var(--text-tertiary)', margin: '0 4px' }}>→</span>
                        <span style={{ color: '#dc2626' }}>
                          {cruzaDia ? `${formatFecha(fechaFin)} ` : ''}{m.salida}
                        </span>
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                        {m.patente?.replace(/\s/g, '')} · {durTxt}
                      </span>
                    </div>
                    <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                      {(m.kmTotal || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km
                    </span>
                  </div>
                  {/* Linea 2: barra de acumulado vs limite */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Acumulado</span>
                      <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 600, color: barColor }}>
                        {acumActual.toLocaleString('es-AR', { maximumFractionDigits: 0 })} km · {pctAcum.toFixed(0)}%
                      </span>
                    </div>
                    <div style={{ width: '100%', height: 5, background: 'var(--bg-secondary)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pctBar}%`, background: barColor, borderRadius: 3 }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      {excedeAqui ? (
                        <span style={{ fontSize: 10, fontWeight: 600, color: '#dc2626' }}>EXCEDIDO</span>
                      ) : (
                        <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                          {(row.limite - acumActual).toLocaleString('es-AR', { maximumFractionDigits: 0 })} km libres
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* SECCIÓN: Excesos de velocidad */}
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                Excesos de velocidad
              </span>
              {!loadingVel && excesosVel.length > 0 && (
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{excesosVel.length} eventos</span>
              )}
            </div>

            {loadingVel && (
              <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>
                Cargando...
              </div>
            )}

            {!loadingVel && excesosVel.length === 0 && (
              <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12, background: 'var(--bg-secondary)', borderRadius: 6 }}>
                Sin excesos de velocidad esta semana
              </div>
            )}

            {!loadingVel && excesosVel.length > 0 && (
              <>
                {/* Top ubicaciones */}
                {ubicacionesTop.length > 0 && (
                  <div style={{ marginBottom: 12, padding: 10, background: 'var(--bg-secondary)', borderRadius: 6 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 6, textTransform: 'uppercase' }}>
                      Top ubicaciones
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {ubicacionesTop.map(([loc, items]) => (
                        <div key={loc} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 11 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={loc}>
                            <MapPin size={11} color="#ea580c" />
                            {loc}
                          </span>
                          <span style={{ fontWeight: 600, color: '#dc2626', whiteSpace: 'nowrap' }}>
                            {items.length}×
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Listado */}
                {excesosVel.map(ev => {
                  const mapsUrl = ev.latitud && ev.longitud
                    ? `https://www.google.com/maps?q=${ev.latitud},${ev.longitud}`
                    : null
                  return (
                    <div key={ev.id} style={{
                      padding: '8px 0',
                      borderBottom: '1px solid var(--border-primary, #e5e7eb)',
                      fontSize: 12,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                        <span style={{ fontWeight: 600 }}>{formatFechaHora(ev.fecha_evento)}</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#dc2626', fontWeight: 700, fontFamily: 'monospace' }}>
                          <Gauge size={12} />
                          {ev.velocidad_maxima?.toFixed(0)}<span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 500 }}>/{ev.limite_velocidad?.toFixed(0)} km/h</span>
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 11 }}>
                        <a
                          href={mapsUrl || undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => { if (!mapsUrl) e.preventDefault() }}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            color: mapsUrl ? '#2563eb' : 'var(--text-tertiary)',
                            textDecoration: 'none',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            flex: 1, minWidth: 0,
                            cursor: mapsUrl ? 'pointer' : 'default',
                          }}
                          title={ev.localizacion || 'Sin localización'}
                        >
                          <MapPin size={11} />
                          {ev.localizacion || 'Sin localización'}
                          {mapsUrl && <ExternalLink size={10} />}
                        </a>
                        <span style={{ color: 'var(--text-tertiary)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                          {ev.patente?.replace(/\s/g, '')} · {formatSegundos(ev.duracion_segundos)}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
