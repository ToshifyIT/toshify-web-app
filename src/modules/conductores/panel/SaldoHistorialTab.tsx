// Pestaña "Historial de saldo" del modal de detalle de conductor.
// Replica el modal "Control de Saldos" de Facturación > Saldos (SaldosAbonosTab),
// en versión SOLO LECTURA: mismo hero, filtros, columnas, totales y detalle de
// facturación; sin "Editar saldo" ni edición de movimientos (eso sigue viviendo
// en el módulo de Facturación, que es donde se gestionan los saldos).

import { useMemo, useState } from 'react'
import { X, Search, FileDown } from 'lucide-react'
import { formatCurrency } from '../../../types/facturacion.types'
import {
  saldoActualKardex,
  type SaldoKardex,
  type SaldoMovimiento,
  type FacturacionResumenSemana,
} from './conductorDetalleService'

interface Props {
  // El kardex lo carga el modal una sola vez y lo comparte con los KPIs.
  data: SaldoKardex | null
  loading: boolean
  nombre: string
  dni: string | null
  cuit: string | null
  estado: string | null      // ACTIVO / BAJA / ...
}

// Etiquetas legibles de tipo_movimiento (mismo mapa que el kardex de Facturación).
const TIPO_LABEL: Record<string, string> = {
  regularizado: 'Facturación',
  pago_cabify: 'Pago Cabify',
  pago: 'Pago',
  pago_manual: 'Pago Manual',
  pago_cuota: 'Pago Cuota',
  ajuste_manual: 'Ajuste',
  eliminacion_pago: 'Elim. Pago',
  edicion_pago: 'Edic. Pago',
  cargo: 'Cargo',
  abono: 'Abono',
  eliminacion_saldo: 'Elim. Saldo',
  importacion: 'Importación',
}

const CARGOS_TIPOS = new Set(['regularizado', 'cargo', 'eliminacion_pago'])
const ABONOS_TIPOS = new Set(['pago_cabify', 'pago', 'pago_manual', 'pago_cuota', 'abono'])
const ELIM_TIPOS = new Set(['eliminacion_pago', 'eliminacion_saldo'])

type Clase = 'cargo' | 'abono' | 'elim' | null

// Clasifica una fila como cargo / abono / eliminación. Para tipos ambiguos se
// infiere por el delta del snapshot saldo_pendiente contra la fila más vieja.
function clasificar(r: SaldoMovimiento, idx: number, rows: SaldoMovimiento[]): Clase {
  const t = r.tipoMovimiento || 'regularizado'
  if (ELIM_TIPOS.has(t)) return 'elim'
  if (CARGOS_TIPOS.has(t)) return 'cargo'
  if (ABONOS_TIPOS.has(t)) return 'abono'
  const prev = rows[idx + 1]
  const pendPrev = prev ? prev.saldoPendiente : 0
  const delta = r.saldoPendiente - pendPrev
  if (delta > 0) return 'abono'
  if (delta < 0) return 'cargo'
  return null
}

// Limpia centavos residuales (<$1) para no mostrar saldos tipo $0,03.
const cleanResiduo = (v: number) => (Math.abs(v) < 1 ? 0 : v)

export function SaldoHistorialTab({ data, loading, nombre, dni, cuit, estado }: Props) {
  const [search, setSearch] = useState('')
  const [semanaFilter, setSemanaFilter] = useState('')   // '' = todas, formato '2026-19'
  const [tipoFilter, setTipoFilter] = useState('')       // '' | cargo | abono | eliminacion
  const [factDetalle, setFactDetalle] = useState<{ fact: FacturacionResumenSemana; anio: number | null; semana: number | null } | null>(null)

  // useMemo: si no, `data?.movimientos || []` crea un array nuevo en cada render
  // e invalida los useMemo que dependen de él.
  const rows = useMemo(() => data?.movimientos || [], [data])

  // Saldo real = saldo del último movimiento del kardex (saldos_conductores puede
  // estar desactualizado). Positivo = a favor, negativo = deuda.
  const saldoReal = saldoActualKardex(data)
  const sColor = saldoReal >= 0 ? '#16a34a' : '#dc2626'

  const semanasUnicas = useMemo(() => (
    Array.from(new Set(rows.map(r => `${r.anio}-${r.semana}`))).sort((a, b) => {
      const [aA, aS] = a.split('-').map(Number)
      const [bA, bS] = b.split('-').map(Number)
      if (aA !== bA) return bA - aA
      return bS - aS
    })
  ), [rows])

  const filas = useMemo(() => {
    const norm = (x: unknown) => (x ?? '').toString().toLowerCase()
    const idxDe = new Map(rows.map((r, i) => [r.id, i]))
    const filtradas = rows.filter(r => {
      if (semanaFilter && `${r.anio}-${r.semana}` !== semanaFilter) return false
      if (tipoFilter) {
        const cls = clasificar(r, idxDe.get(r.id) ?? 0, rows)
        if (tipoFilter === 'cargo' && cls !== 'cargo') return false
        if (tipoFilter === 'abono' && cls !== 'abono') return false
        if (tipoFilter === 'eliminacion' && cls !== 'elim') return false
      }
      if (search.trim()) {
        const q = norm(search)
        const blob = `${norm(r.referencia)} ${norm(r.usuario)} ${norm(r.montoMovimiento)} ${norm(TIPO_LABEL[r.tipoMovimiento] || r.tipoMovimiento)}`
        if (!blob.includes(q)) return false
      }
      return true
    })
    return filtradas.map((r, i) => {
      const idx = idxDe.get(r.id) ?? 0
      const cls = clasificar(r, idx, rows)
      const monto = Math.abs(r.montoMovimiento)
      const saldo = cleanResiduo(r.saldoPendiente)
      return { r, i, cls, monto, saldo }
    })
  }, [rows, search, semanaFilter, tipoFilter])

  const totales = useMemo(() => {
    const totalCargos = filas.reduce((acc, f) => acc + (f.cls === 'cargo' || f.cls === 'elim' ? f.monto : 0), 0)
    const totalAbonos = filas.reduce((acc, f) => acc + (f.cls === 'abono' ? f.monto : 0), 0)
    return {
      totalCargos,
      totalAbonos,
      neto: totalAbonos - totalCargos,
      saldoFinal: filas.length > 0 ? filas[0].saldo : (data?.saldoActual || 0),
    }
  }, [filas, data?.saldoActual])

  function exportarPDF() {
    const w = window.open('', '_blank', 'width=900,height=700')
    if (!w) return
    const cuerpo = rows.map(r => {
      const fecha = r.createdAt ? new Date(r.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'
      const monto = r.montoMovimiento ? formatCurrency(Math.abs(r.montoMovimiento)) : '-'
      return `<tr>
        <td>${fecha}</td>
        <td>${r.anio} S${String(r.semana ?? '').padStart(2, '0')}</td>
        <td>${TIPO_LABEL[r.tipoMovimiento] || r.tipoMovimiento || '-'}</td>
        <td>${(r.referencia || '-').replace(/</g, '&lt;')}</td>
        <td style="text-align:right">${monto}</td>
        <td style="text-align:right">${formatCurrency(r.saldoPendiente)}</td>
        <td>${(r.usuario || 'Sistema').replace(/</g, '&lt;')}</td>
      </tr>`
    }).join('')
    w.document.write(`<!doctype html><html><head><meta charset="utf-8" />
      <title>Kardex - ${nombre}</title>
      <style>
        body { font-family: 'Roboto', -apple-system, 'Segoe UI', sans-serif; padding: 24px; color: #111827; }
        h1 { font-size: 18px; margin: 0 0 4px; }
        .meta { font-size: 11px; color: #6b7280; margin-bottom: 16px; }
        .saldo { font-size: 18px; font-weight: 700; color: ${saldoReal < 0 ? '#dc2626' : '#16a34a'}; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th, td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; text-align: left; }
        th { background: #f9fafb; font-weight: 600; text-transform: uppercase; font-size: 10px; color: #6b7280; }
        @media print { body { padding: 8px; } }
      </style>
      </head><body>
      <h1>Control de Saldos</h1>
      <div class="meta">
        <strong>${nombre}</strong> &middot; DNI ${dni || '-'} &middot; CUIT ${cuit || data?.cuit || '-'}
        <br/>Saldo actual: <span class="saldo">${formatCurrency(saldoReal)}</span>
        <br/>Generado: ${new Date().toLocaleString('es-AR')}
      </div>
      <table>
        <thead><tr><th>Fecha</th><th>Semana</th><th>Tipo</th><th>Referencia</th><th style="text-align:right">Monto</th><th style="text-align:right">Saldo</th><th>Usuario</th></tr></thead>
        <tbody>${cuerpo}</tbody>
      </table>
      <script>window.onload = () => { window.print(); };</script>
      </body></html>`)
    w.document.close()
  }

  const filaDetalle = (lbl: string, val: number, isTotal = false, isSubtle = false) => (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      padding: '6px 0',
      borderBottom: isTotal ? 'none' : '1px solid var(--border-primary, #e5e7eb)',
      fontWeight: isTotal ? 700 : 500,
      color: isSubtle ? 'var(--text-tertiary, #9ca3af)' : 'var(--text-primary, #111827)',
      fontSize: isTotal ? '14px' : '12px',
    }}>
      <span>{lbl}</span>
      <span style={{ fontFamily: 'monospace' }}>{formatCurrency(val)}</span>
    </div>
  )

  return (
    <div className="cdet-saldo">
      {/* Hero: identificación + saldo actual (igual que el modal Control de Saldos) */}
      <div style={{
        marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        paddingBottom: '12px', borderBottom: '1px solid var(--border-primary, #e5e7eb)', gap: '16px',
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary, #111827)' }}>{nombre}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary, #6b7280)', marginTop: '3px' }}>
            DNI: {dni || '-'} &middot; CUIT: {cuit || data?.cuit || '-'}
            {estado && (
              <> &middot; Estado: <span style={{
                fontWeight: 700,
                color: estado === 'BAJA' ? '#92400e' : estado === 'ACTIVO' ? '#16a34a' : 'var(--text-secondary, #6b7280)',
              }}>{estado}</span></>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: sColor, lineHeight: 1 }}>
            {formatCurrency(saldoReal)}
          </div>
          <span style={{
            display: 'inline-block', marginTop: '4px', padding: '2px 8px', borderRadius: '4px',
            fontSize: '10px', fontWeight: 600,
            background: saldoReal >= 0 ? '#DCFCE7' : '#FEE2E2', color: sColor,
          }}>
            {saldoReal >= 0 ? 'A Favor' : 'Deuda'}
          </span>
        </div>
      </div>

      {/* Barra de filtros */}
      {!loading && rows.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '180px', position: 'relative' }}>
            <Search size={12} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary, #9ca3af)' }} />
            <input
              type="text"
              placeholder="Buscar referencia, usuario o monto..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%', padding: '5px 8px 5px 26px', fontSize: '11px',
                border: '1px solid var(--border-primary, #e5e7eb)', borderRadius: '4px',
                background: 'var(--bg-secondary, #f9fafb)', color: 'var(--text-primary, #111827)',
              }}
            />
          </div>
          <select
            value={semanaFilter}
            onChange={e => setSemanaFilter(e.target.value)}
            style={{
              padding: '5px 8px', fontSize: '11px', border: '1px solid var(--border-primary, #e5e7eb)',
              borderRadius: '4px', background: 'var(--card-bg, #fff)', color: 'var(--text-secondary, #6b7280)',
            }}
          >
            <option value="">Todas las semanas</option>
            {semanasUnicas.map(sem => {
              const [a, s] = sem.split('-')
              return <option key={sem} value={sem}>{a} S{String(s).padStart(2, '0')}</option>
            })}
          </select>
          <select
            value={tipoFilter}
            onChange={e => setTipoFilter(e.target.value)}
            style={{
              padding: '5px 8px', fontSize: '11px', border: '1px solid var(--border-primary, #e5e7eb)',
              borderRadius: '4px', background: 'var(--card-bg, #fff)', color: 'var(--text-secondary, #6b7280)',
            }}
          >
            <option value="">Todos los tipos</option>
            <option value="cargo">Cargos</option>
            <option value="abono">Abonos</option>
            <option value="eliminacion">Eliminaciones</option>
          </select>
          <button
            onClick={exportarPDF}
            title="Exportar a PDF"
            style={{
              background: 'var(--card-bg, #fff)', border: '1px solid var(--border-primary, #e5e7eb)',
              borderRadius: '4px', padding: '5px 10px', fontSize: '11px', cursor: 'pointer',
              color: 'var(--text-secondary, #6b7280)', display: 'inline-flex', alignItems: 'center', gap: '4px',
            }}
          >
            <FileDown size={12} /> PDF
          </button>
        </div>
      )}

      {loading ? (
        <div className="cdet-empty">Cargando…</div>
      ) : rows.length === 0 ? (
        <div className="cdet-empty">Sin movimientos de saldo registrados.</div>
      ) : (
        <>
          <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid var(--border-primary, #e5e7eb)', borderRadius: '6px' }}>
            <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary, #f9fafb)', position: 'sticky', top: 0, zIndex: 1 }}>
                  {['Fecha', 'Semana', 'Tipo', 'Referencia', 'Detalle', 'Monto', 'Facturado', 'Saldo', 'Usuario'].map((h, hi) => (
                    <th key={hi} style={{
                      padding: '6px 8px', fontWeight: 600, color: 'var(--text-secondary, #6b7280)',
                      borderBottom: '1px solid var(--border-primary, #e5e7eb)',
                      textAlign: hi >= 5 && hi <= 7 ? 'right' : 'left',
                      fontSize: '10px', background: 'var(--bg-secondary, #f9fafb)',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map(({ r, i, cls, monto, saldo }) => {
                  const tipo = r.tipoMovimiento || 'regularizado'
                  const labelBg = cls === 'cargo' ? '#fef2f2' : cls === 'abono' ? '#f0fdf4' : cls === 'elim' ? '#f3f4f6' : 'var(--bg-secondary, #f9fafb)'
                  const labelFg = cls === 'cargo' ? '#dc2626' : cls === 'abono' ? '#16a34a' : 'var(--text-secondary, #6b7280)'
                  const rowBg = i === 0 ? '#fef3c7'
                    : cls === 'cargo' ? 'rgba(254,242,242,0.4)'
                    : cls === 'abono' ? 'rgba(240,253,244,0.4)'
                    : cls === 'elim' ? 'rgba(249,250,251,0.6)'
                    : 'transparent'
                  const montoColor = cls === 'cargo' || cls === 'elim' ? '#dc2626' : cls === 'abono' ? '#16a34a' : 'var(--text-tertiary, #9ca3af)'
                  const montoSigno = cls === 'cargo' || cls === 'elim' ? '-' : cls === 'abono' ? '+' : ''
                  const fecha = r.createdAt ? new Date(r.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '-'

                  const refParts = (r.referencia || '').split(' | ')
                  const refMain = refParts[0] || '-'
                  let refDetalle = refParts.length > 1 ? refParts.slice(1).join(' | ') : ''
                  if (!refDetalle && data) {
                    refDetalle = data.detalleAbonos.get(`${r.referencia}_${Math.abs(r.montoMovimiento)}`) || ''
                  }

                  return (
                    <tr key={r.id} style={{
                      borderBottom: '1px solid var(--border-primary, #e5e7eb)',
                      background: rowBg,
                      borderLeft: i === 0 ? '3px solid #f59e0b' : '3px solid transparent',
                    }}>
                      <td style={{ padding: '5px 8px', color: 'var(--text-secondary, #6b7280)', fontSize: '10px', whiteSpace: 'nowrap' }}>{fecha}</td>
                      <td style={{ padding: '5px 8px', fontWeight: 600, color: 'var(--text-primary, #111827)', whiteSpace: 'nowrap' }}>
                        {r.anio} S{String(r.semana ?? '').padStart(2, '0')}
                      </td>
                      <td style={{ padding: '5px 8px', whiteSpace: 'nowrap', fontSize: '10px' }}>
                        <span style={{
                          display: 'inline-block', padding: '1px 6px', borderRadius: '3px',
                          background: labelBg, color: labelFg, fontWeight: 600, fontSize: '10px',
                        }}>{TIPO_LABEL[tipo] || tipo}</span>
                      </td>
                      <td style={{ padding: '5px 8px', color: 'var(--text-secondary, #6b7280)', fontSize: '10px', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={refMain}>
                        {refMain}
                        {i === 0 && (
                          <span style={{
                            marginLeft: '6px', padding: '1px 5px', background: '#f59e0b',
                            color: '#fff', borderRadius: '3px', fontSize: '9px', fontWeight: 700,
                            textTransform: 'uppercase', letterSpacing: '0.4px',
                          }}>actual</span>
                        )}
                      </td>
                      <td style={{ padding: '5px 8px', color: 'var(--text-secondary, #6b7280)', fontSize: '10px', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={refDetalle || ''}>
                        {refDetalle || '-'}
                      </td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace', color: montoColor, whiteSpace: 'nowrap' }}>
                        {monto > 0 ? `${montoSigno}${formatCurrency(Math.round(monto))}` : '-'}
                      </td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                        {(() => {
                          // Ajustes manuales, pagos manuales y cancelaciones por baja no
                          // tienen facturación asociada.
                          if (tipo === 'ajuste_manual' || tipo === 'cancelacion_fraccionado_baja' || tipo === 'pago_manual') {
                            return <span style={{ color: 'var(--text-tertiary, #9ca3af)' }}>—</span>
                          }
                          const fac = data?.facPorSemana.get(`${r.anio}-${r.semana}`)
                          if (!fac) return <span style={{ color: 'var(--text-tertiary, #9ca3af)' }}>—</span>
                          return (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setFactDetalle({ fact: fac, anio: r.anio, semana: r.semana }) }}
                              style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                fontFamily: 'monospace', color: '#2563eb',
                                textDecoration: 'underline', textDecorationStyle: 'dotted',
                                padding: 0, fontSize: '11px', fontWeight: 500,
                              }}
                              title="Ver detalle de facturación"
                            >
                              {formatCurrency(fac.totalAPagar)}
                            </button>
                          )
                        })()}
                      </td>
                      <td style={{
                        padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700,
                        color: saldo < 0 ? '#dc2626' : saldo > 0 ? '#16a34a' : 'var(--text-secondary, #6b7280)',
                        whiteSpace: 'nowrap',
                      }}>
                        {formatCurrency(saldo)}
                      </td>
                      <td style={{ padding: '5px 8px', color: 'var(--text-secondary, #6b7280)', fontSize: '10px', whiteSpace: 'nowrap' }}>
                        {r.usuario || 'Sistema'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Totales del rango filtrado */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
            marginTop: '8px', background: 'var(--bg-secondary, #f9fafb)',
            border: '1px solid var(--border-primary, #e5e7eb)', borderRadius: '6px', overflow: 'hidden',
          }}>
            <div style={{ padding: '8px 12px', borderRight: '1px solid var(--border-primary, #e5e7eb)', textAlign: 'right' }}>
              <div style={{ fontSize: '9px', textTransform: 'uppercase', color: 'var(--text-secondary, #6b7280)', fontWeight: 600, letterSpacing: '0.3px' }}>Total cargos</div>
              <div style={{ fontSize: '13px', fontWeight: 700, marginTop: '2px', color: '#dc2626', fontFamily: 'monospace' }}>
                -{formatCurrency(totales.totalCargos)}
              </div>
            </div>
            <div style={{ padding: '8px 12px', borderRight: '1px solid var(--border-primary, #e5e7eb)', textAlign: 'right' }}>
              <div style={{ fontSize: '9px', textTransform: 'uppercase', color: 'var(--text-secondary, #6b7280)', fontWeight: 600, letterSpacing: '0.3px' }}>Total abonos</div>
              <div style={{ fontSize: '13px', fontWeight: 700, marginTop: '2px', color: '#16a34a', fontFamily: 'monospace' }}>
                +{formatCurrency(totales.totalAbonos)}
              </div>
            </div>
            <div style={{ padding: '8px 12px', borderRight: '1px solid var(--border-primary, #e5e7eb)', textAlign: 'right' }}>
              <div style={{ fontSize: '9px', textTransform: 'uppercase', color: 'var(--text-secondary, #6b7280)', fontWeight: 600, letterSpacing: '0.3px' }}>Neto del rango</div>
              <div style={{
                fontSize: '13px', fontWeight: 700, marginTop: '2px', fontFamily: 'monospace',
                color: totales.neto < 0 ? '#dc2626' : totales.neto > 0 ? '#16a34a' : 'var(--text-secondary, #6b7280)',
              }}>
                {formatCurrency(totales.neto)}
              </div>
            </div>
            <div style={{ padding: '8px 12px', textAlign: 'right' }}>
              <div style={{ fontSize: '9px', textTransform: 'uppercase', color: 'var(--text-secondary, #6b7280)', fontWeight: 600, letterSpacing: '0.3px' }}>Saldo final</div>
              <div style={{
                fontSize: '13px', fontWeight: 700, marginTop: '2px', fontFamily: 'monospace',
                color: totales.saldoFinal < 0 ? '#dc2626' : totales.saldoFinal > 0 ? '#16a34a' : 'var(--text-secondary, #6b7280)',
              }}>
                {formatCurrency(totales.saldoFinal)}
              </div>
            </div>
          </div>

          <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-tertiary, #9ca3af)' }}>
            <span>
              Mostrando {filas.length} de {rows.length} movimientos
              {(search || semanaFilter || tipoFilter) && (
                <button
                  onClick={() => { setSearch(''); setSemanaFilter(''); setTipoFilter('') }}
                  style={{
                    marginLeft: '8px', background: 'transparent', border: 'none',
                    color: 'var(--text-secondary, #6b7280)', cursor: 'pointer', textDecoration: 'underline',
                    fontSize: '10px', padding: 0,
                  }}
                >
                  Limpiar filtros
                </button>
              )}
            </span>
          </div>
        </>
      )}

      {/* Mini-modal: desglose de la facturación de la semana */}
      {factDetalle && (
        <div className="cdet-deuda-overlay" onClick={(e) => { e.stopPropagation(); setFactDetalle(null) }}>
          <div className="cdet-deuda-modal" style={{ maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
            <button className="cdet-deuda-close" onClick={() => setFactDetalle(null)} aria-label="Cerrar"><X size={16} /></button>
            <div className="cdet-deuda-title" style={{ marginBottom: '12px' }}>Detalle Facturación — S{factDetalle.semana}/{factDetalle.anio}</div>
            {filaDetalle('Saldo previo', factDetalle.fact.saldoAnterior, false, true)}
            {filaDetalle('Alquiler', factDetalle.fact.subtotalAlquiler)}
            {filaDetalle('Garantía (P003)', factDetalle.fact.subtotalGarantia)}
            {filaDetalle('Cargos', factDetalle.fact.subtotalCargos - factDetalle.fact.subtotalAlquiler - factDetalle.fact.subtotalGarantia)}
            {filaDetalle('Descuentos', -factDetalle.fact.subtotalDescuentos)}
            <div style={{ borderTop: '2px solid var(--border-primary, #e5e7eb)', marginTop: '6px', paddingTop: '6px' }}>
              {filaDetalle('Subtotal Neto', factDetalle.fact.subtotalNeto, false, true)}
              {filaDetalle('Total a Pagar', factDetalle.fact.totalAPagar, true)}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
