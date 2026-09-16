// Pestaña "Rendimiento Cabify" del modal de detalle de conductor.
// Muestra, semana a semana (lunes a domingo), lo que el conductor genero en
// Cabify: total, efectivo, app, peajes, promociones y deducciones. Incluye la
// semana EN CURSO, marcada como parcial porque todavia esta acumulando.
//
// Los datos los carga el modal (cargarRendimientoCabifyConductor) y llegan por
// props, igual que las pestañas de saldo y garantia. La fuente es la misma que
// el modulo Integraciones > Cabify, y el cruce conductor <-> Cabify usa el mismo
// criterio que la columna "Ingresos Cabify" del panel, para que los numeros
// cierren entre pantallas.

import { useMemo, useState, Fragment, type CSSProperties } from 'react'
import { ChevronDown } from 'lucide-react'
import { formatCurrency } from '../../../types/facturacion.types'
import type { CabifySemanaRend } from './conductorDetalleService'
import type { KmSemanaConductor } from '../../portal/kmRecorridos'

interface Props {
  data: CabifySemanaRend[]
  loading: boolean
  // Km de GPS (uss_historico + geotab_historico): los MISMOS que muestra la
  // pestaña "Km recorridos". Se cruzan por semana y por dia contra los km de
  // Cabify; la diferencia es lo que se recorrio con la app apagada.
  kmSemanas: KmSemanaConductor[]
}

// 'yyyy-MM-dd' -> 'dd/MM/yy'. Se parsea a mano para no caer en la trampa de
// new Date('2026-09-07'), que el navegador interpreta como UTC y en Argentina
// (UTC-3) mostraria el dia anterior.
function fmtDia(s: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '')
  if (!m) return '—'
  return `${m[3]}/${m[2]}/${m[1].slice(2)}`
}

function nombreDia(s: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '')
  if (!m) return '—'
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const txt = d.toLocaleDateString('es-AR', { weekday: 'long' })
  return txt.charAt(0).toUpperCase() + txt.slice(1)
}

// Kilometros recorridos con la app de Cabify encendida. "—" = sin dato: los dias
// anteriores al 16/09/2026 no tienen kilometros sincronizados, y eso no es 0 km.
function fmtKm(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  return `${v.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`
}

// Suma que conserva el null: si ninguna fila tiene dato, el total queda en null.
function totalKm<T>(filas: T[], pick: (f: T) => number | null | undefined): number | null {
  let acc: number | null = null
  for (const f of filas) {
    const v = pick(f)
    if (v !== null && v !== undefined) acc = (acc ?? 0) + v
  }
  return acc
}

const LBL_MINI: CSSProperties = {
  fontSize: '10px', textTransform: 'uppercase', fontWeight: 600,
  letterSpacing: '0.3px', color: 'var(--text-secondary, #6b7280)',
}
const VAL_MINI: CSSProperties = {
  fontSize: '15px', fontWeight: 700, fontFamily: 'monospace',
  color: 'var(--text-primary, #111827)', marginTop: '2px',
}

export function RendimientoCabifyTab({ data, loading, kmSemanas }: Props) {
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set())

  // Indices de km de GPS: por lunes de la semana y por dia.
  const kmGeoPorSemana = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of kmSemanas) m.set(s.fecha_inicio, s.km)
    return m
  }, [kmSemanas])
  const kmGeoPorDia = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of kmSemanas) for (const d of s.dias) m.set(d.fecha, d.km)
    return m
  }, [kmSemanas])

  // Resumen. El promedio y la mejor semana EXCLUYEN la semana en curso: es un
  // acumulado parcial y mezclarla hundiria el promedio los lunes.
  const resumen = useMemo(() => {
    const cerradas = data.filter(s => !s.enCurso)
    const total = data.reduce((a, s) => a + s.gananciaTotal, 0)
    const totalCerradas = cerradas.reduce((a, s) => a + s.gananciaTotal, 0)
    const mejor = cerradas.reduce<CabifySemanaRend | null>(
      (best, s) => (!best || s.gananciaTotal > best.gananciaTotal ? s : best), null,
    )
    return {
      total,
      promedio: cerradas.length ? totalCerradas / cerradas.length : 0,
      mejor,
      semanas: data.length,
      enCurso: data.find(s => s.enCurso) || null,
    }
  }, [data])

  if (loading) return <div className="cdet-empty">Cargando…</div>
  if (data.length === 0) {
    return (
      <div className="cdet-empty">
        Sin datos de Cabify para este conductor.
        <div style={{ fontSize: 12, marginTop: 6, color: 'var(--text-tertiary, #9ca3af)' }}>
          O no operó en Cabify, o sus datos no cruzan por DNI, licencia ni nombre con los registros sincronizados.
        </div>
      </div>
    )
  }

  const toggle = (key: string) => setAbiertas(prev => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })

  return (
    <div>
      {/* Resumen */}
      <div style={{
        display: 'flex', gap: '16px', marginBottom: '12px', padding: '10px 14px',
        background: 'var(--bg-secondary, #f9fafb)', borderRadius: '6px',
        border: '1px solid var(--border-primary, #e5e7eb)', alignItems: 'center', flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: '130px' }}>
          <div style={LBL_MINI}>Total acumulado</div>
          <div style={VAL_MINI}>{formatCurrency(resumen.total)}</div>
        </div>
        <div style={{ flex: 1, minWidth: '130px' }}>
          <div style={LBL_MINI}>Promedio semanal</div>
          <div style={VAL_MINI} title="Promedio de las semanas cerradas; no incluye la semana en curso">
            {formatCurrency(resumen.promedio)}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: '130px' }}>
          <div style={LBL_MINI}>Mejor semana</div>
          <div style={{ ...VAL_MINI, color: '#16a34a' }}>
            {resumen.mejor ? formatCurrency(resumen.mejor.gananciaTotal) : '—'}
          </div>
          {resumen.mejor && (
            <div style={{ fontSize: '10px', color: 'var(--text-tertiary, #9ca3af)', marginTop: '1px' }}>
              S{resumen.mejor.semana}/{resumen.mejor.anio}
            </div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: '110px' }}>
          <div style={LBL_MINI}>Semanas con datos</div>
          <div style={VAL_MINI}>{resumen.semanas}</div>
        </div>
        <div style={{ flex: 1, minWidth: '130px' }}>
          <div style={LBL_MINI}>Semana en curso</div>
          <div style={{ ...VAL_MINI, color: resumen.enCurso ? '#b45309' : undefined }}>
            {resumen.enCurso ? formatCurrency(resumen.enCurso.gananciaTotal) : '—'}
          </div>
          {resumen.enCurso && (
            <div style={{ fontSize: '10px', color: 'var(--text-tertiary, #9ca3af)', marginTop: '1px' }}>
              parcial · hasta hoy
            </div>
          )}
        </div>
      </div>

      <table className="cdet-table">
        <thead><tr>
          <th>Semana</th><th>Período</th>
          <th className="r">Total</th><th className="r">Efectivo</th><th className="r">App</th>
          <th className="r">Peajes</th>
          <th className="r">KM total</th><th className="r">KM-viaje asig</th><th className="r">KM-viaje sin asig</th>
          <th className="r">KM Geo</th>
          <th className="c">Días</th>
        </tr></thead>
        <tbody>
          {data.map(s => {
            const abierta = abiertas.has(s.key)
            return (
              <Fragment key={s.key}>
                <tr className={abierta ? 'cdet-km-open' : ''}>
                  <td>
                    S{s.semana}/{s.anio}
                    {s.enCurso && <> <span className="cdet-tag pend" title="Acumulado parcial: la semana todavía está en curso">En curso</span></>}
                  </td>
                  <td>{fmtDia(s.inicio)} al {fmtDia(s.fin)}</td>
                  <td className="r"><b>{formatCurrency(s.gananciaTotal)}</b></td>
                  <td className="r">{formatCurrency(s.cobroEfectivo)}</td>
                  <td className="r">{formatCurrency(s.cobroApp)}</td>
                  <td className="r">{formatCurrency(s.peajes)}</td>
                  <td className="r">{fmtKm(s.kmTotal)}</td>
                  <td className="r">{fmtKm(s.kmAsignado)}</td>
                  <td className="r">{fmtKm(s.kmSinAsignar)}</td>
                  <td className="r">{fmtKm(kmGeoPorSemana.get(s.inicio))}</td>
                  <td className="c">
                    <button
                      className={`cdet-km-toggle ${abierta ? 'open' : ''}`}
                      onClick={() => toggle(s.key)}
                      disabled={s.dias.length === 0}
                      title={s.dias.length === 0 ? 'Sin detalle diario' : (abierta ? 'Ocultar el detalle por día' : 'Ver el detalle por día')}
                      aria-expanded={abierta}
                    >
                      <ChevronDown size={14} />
                    </button>
                  </td>
                </tr>
                {abierta && (
                  <tr className="cdet-km-dias-row">
                    <td colSpan={11}>
                      <div className="cdet-km-dias">
                        <div className="cdet-km-dias-head">
                          Ingresos por día · {fmtDia(s.inicio)} al {fmtDia(s.fin)}
                          {s.dias.length < 7 && <> · {s.dias.length} {s.dias.length === 1 ? 'día' : 'días'} con registro</>}
                        </div>
                        <table className="cdet-km-dias-tabla">
                          <thead><tr>
                            <th>Día</th><th>Fecha</th>
                            <th className="r">Total</th><th className="r">Efectivo</th><th className="r">App</th>
                            <th className="r">Peajes</th>
                            <th className="r">KM total</th><th className="r">KM-viaje asig</th><th className="r">KM-viaje sin asig</th>
                            <th className="r">KM Geo</th>
                            <th className="r">% semana</th>
                          </tr></thead>
                          <tbody>
                            {s.dias.map(d => {
                              const pct = s.gananciaTotal > 0 ? (d.gananciaTotal / s.gananciaTotal) * 100 : 0
                              return (
                                <tr key={d.fecha} className={d.gananciaTotal === 0 ? 'vacio' : ''}>
                                  <td>{nombreDia(d.fecha)}</td>
                                  <td>{fmtDia(d.fecha)}</td>
                                  <td className="r"><b>{formatCurrency(d.gananciaTotal)}</b></td>
                                  <td className="r">{formatCurrency(d.cobroEfectivo)}</td>
                                  <td className="r">{formatCurrency(d.cobroApp)}</td>
                                  <td className="r">{formatCurrency(d.peajes)}</td>
                                  <td className="r">{fmtKm(d.kmTotal)}</td>
                                  <td className="r">{fmtKm(d.kmAsignado)}</td>
                                  <td className="r">{fmtKm(d.kmSinAsignar)}</td>
                                  <td className="r">{fmtKm(kmGeoPorDia.get(d.fecha))}</td>
                                  <td className="r">{d.gananciaTotal > 0 ? `${pct.toFixed(1)}%` : '—'}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                          <tfoot><tr>
                            <td colSpan={2}>Total semana</td>
                            <td className="r"><b>{formatCurrency(s.gananciaTotal)}</b></td>
                            <td className="r">{formatCurrency(s.cobroEfectivo)}</td>
                            <td className="r">{formatCurrency(s.cobroApp)}</td>
                            <td className="r">{formatCurrency(s.peajes)}</td>
                            <td className="r">{fmtKm(s.kmTotal)}</td>
                            <td className="r">{fmtKm(s.kmAsignado)}</td>
                            <td className="r">{fmtKm(s.kmSinAsignar)}</td>
                            <td className="r">{fmtKm(kmGeoPorSemana.get(s.inicio))}</td>
                            <td className="r">100%</td>
                          </tr></tfoot>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
        <tfoot><tr>
          <td colSpan={2}>Total {data.length} {data.length === 1 ? 'semana' : 'semanas'}</td>
          <td className="r"><b>{formatCurrency(resumen.total)}</b></td>
          <td className="r">{formatCurrency(data.reduce((a, s) => a + s.cobroEfectivo, 0))}</td>
          <td className="r">{formatCurrency(data.reduce((a, s) => a + s.cobroApp, 0))}</td>
          <td className="r">{formatCurrency(data.reduce((a, s) => a + s.peajes, 0))}</td>
          <td className="r">{fmtKm(totalKm(data, s => s.kmTotal))}</td>
          <td className="r">{fmtKm(totalKm(data, s => s.kmAsignado))}</td>
          <td className="r">{fmtKm(totalKm(data, s => s.kmSinAsignar))}</td>
          <td className="r">{fmtKm(totalKm(data, s => kmGeoPorSemana.get(s.inicio) ?? null))}</td>
          <td />
        </tr></tfoot>
      </table>
    </div>
  )
}
