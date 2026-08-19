// Pestaña "Historial de garantía" del modal de detalle de conductor.
// Replica el modal "Estado de Garantía" de Facturación > Garantías (GarantiasTab),
// en versión SOLO LECTURA: mismo hero, resumen objetivo / real pagado, filtros,
// tabla consolidada por semana y footer Pagadas / Restantes.
// A diferencia del original, NO sincroniza garantias_conductores (no escribe en BD).
// Los datos y el cálculo llegan por props: los carga el modal una sola vez y los
// comparte con los KPIs de la cabecera.

import { useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { formatCurrency } from '../../../types/facturacion.types'
import { formatNombreCompleto } from '../../../utils/conductorUtils'
import type { GarantiaKardex, GarantiaResumen, FilaGarantiaSemana } from './conductorDetalleService'

interface Props {
  data: GarantiaKardex | null
  resumen: GarantiaResumen | null
  loading: boolean
  nombre: string
  dni: string | null
  cuit: string | null
}

export function GarantiaHistorialTab({ data, resumen, loading, nombre, dni, cuit }: Props) {
  const [search, setSearch] = useState('')
  const [semanaFilter, setSemanaFilter] = useState('')
  const [alertTip, setAlertTip] = useState<{ x: number; y: number } | null>(null)

  const filasFiltradas = useMemo(() => {
    if (!resumen) return [] as FilaGarantiaSemana[]
    return resumen.filas.filter(f => {
      if (semanaFilter && f.key !== semanaFilter) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        const blob = `${f.referencia || ''} ${f.aplicado} ${f.montoCuota} S${f.semana} ${f.anio}`.toLowerCase()
        if (!blob.includes(q)) return false
      }
      return true
    })
  }, [resumen, search, semanaFilter])

  if (loading) return <div className="cdet-empty">Cargando…</div>

  const g = data?.garantia || null
  if (!g || !resumen) return <div className="cdet-empty">Este conductor no tiene garantía registrada.</div>

  const semanasUnicas = resumen.filas.map(f => f.key)

  return (
    <div className="cdet-garantia">
      {/* Hero: conductor + alerta de deuda real */}
      <div style={{ marginBottom: '14px', paddingBottom: '12px', borderBottom: '1px solid var(--border-primary, #e5e7eb)' }}>
        <div style={{ fontSize: '16px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span>{formatNombreCompleto(g.conductor_nombre || nombre)}</span>
          {resumen.tieneDeuda && (
            <span style={{
              fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px',
              background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a',
            }}>
              ⚠ Deuda real ${resumen.deudaReal.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
            </span>
          )}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-secondary, #6b7280)', marginTop: '4px' }}>
          DNI {g.conductor_dni || dni || '-'} · CUIT {g.conductor_cuit || cuit || '-'} · {g.tipo_alquiler}
        </div>
      </div>

      {/* Resumen: objetivo vs total real pagado (+ excedente) */}
      <div style={{
        display: 'flex', gap: '16px', marginBottom: '12px', padding: '10px 14px',
        background: 'var(--bg-secondary, #f9fafb)', borderRadius: '6px',
        border: '1px solid var(--border-primary, #e5e7eb)', alignItems: 'center', flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: '120px' }}>
          <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-secondary, #6b7280)', fontWeight: 600, letterSpacing: '0.3px' }}>Garantía objetivo</div>
          <div style={{ fontSize: '15px', fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-primary, #111827)', marginTop: '2px' }}>
            {formatCurrency(Math.round(resumen.montoTotal))}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: '120px' }}>
          <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-secondary, #6b7280)', fontWeight: 600, letterSpacing: '0.3px' }}>Total real pagado</div>
          <div style={{ fontSize: '15px', fontWeight: 700, fontFamily: 'monospace', color: resumen.tieneExcedente ? '#16a34a' : 'var(--text-primary, #111827)', marginTop: '2px' }}>
            {formatCurrency(resumen.totalRealPagado)}
          </div>
        </div>
        {resumen.tieneExcedente && (
          <div style={{ flex: 1, minWidth: '120px' }}>
            <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-secondary, #6b7280)', fontWeight: 600, letterSpacing: '0.3px' }}>Excedente</div>
            <div style={{ fontSize: '15px', fontWeight: 700, fontFamily: 'monospace', color: '#16a34a', marginTop: '2px' }}>
              +{formatCurrency(resumen.excedente)}
            </div>
          </div>
        )}
      </div>

      {/* Filtros */}
      {resumen.filas.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="🔍 Buscar por semana, referencia, monto..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              flex: 1, minWidth: '180px', padding: '6px 10px', fontSize: '11px',
              border: '1px solid var(--border-primary, #e5e7eb)', borderRadius: '4px',
              background: 'var(--bg-secondary, #f9fafb)', color: 'var(--text-primary, #111827)',
            }}
          />
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
        </div>
      )}

      {resumen.filas.length === 0 ? (
        <div className="cdet-empty">Sin movimientos en el kardex de garantía.</div>
      ) : (
        <>
          <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid var(--border-primary, #e5e7eb)', borderRadius: '6px' }}>
            <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary, #f9fafb)', position: 'sticky', top: 0, zIndex: 1 }}>
                  {[
                    { h: 'Fecha', align: 'left' as const },
                    { h: 'Semana', align: 'left' as const },
                    { h: 'Cuota', align: 'center' as const },
                    { h: 'Concepto', align: 'left' as const },
                    { h: 'Monto', align: 'right' as const },
                    { h: 'Diferencia', align: 'right' as const },
                  ].map((col, hi) => (
                    <th key={hi} style={{
                      padding: '8px 12px', fontWeight: 600, color: 'var(--text-secondary, #6b7280)',
                      borderBottom: '1px solid var(--border-primary, #e5e7eb)',
                      textAlign: col.align, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.3px',
                      background: 'var(--bg-secondary, #f9fafb)',
                    }}>{col.h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filasFiltradas.map((f) => {
                  // La fecha solo se muestra si la semana está cerrada (fecha_cierre del
                  // período). Semana en curso → ícono de aviso.
                  const cerrada = resumen.semanaCerrada(f.anio, f.semana)
                  const fechaBase = cerrada ? (resumen.fechaCierreSemana(f.anio, f.semana) || f.fecha) : ''
                  const fecha = fechaBase ? new Date(fechaBase).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : ''
                  const esExtraFacturacion = f.tipoMovimiento === 'facturacion'
                  const esExcedente = !esExtraFacturacion && f.esExcedenteReal
                  const montoColor = esExtraFacturacion || esExcedente ? '#b45309' : 'var(--text-primary, #111827)'
                  const origenLabel = esExtraFacturacion
                    ? `Excedente facturado S${f.semana}/${f.anio}`
                    : `Cuota Garantía S${f.semana}/${f.anio}`
                  return (
                    <tr key={f.key} style={{
                      borderBottom: '1px solid var(--border-primary, #e5e7eb)',
                      background: esExtraFacturacion || esExcedente ? '#fffbeb' : undefined,
                    }}>
                      <td style={{ padding: '10px 12px', color: 'var(--text-secondary, #6b7280)', fontSize: '11px', whiteSpace: 'nowrap' }}>
                        {cerrada ? fecha : (
                          <span
                            style={{ display: 'inline-flex', cursor: 'help' }}
                            title="Esta semana aún no está cerrada, por lo tanto el monto aún no se considera en el Total Real Pagado"
                            onMouseEnter={(e) => {
                              const r = e.currentTarget.getBoundingClientRect()
                              setAlertTip({ x: r.right + 8, y: r.top + r.height / 2 })
                            }}
                            onMouseLeave={() => setAlertTip(null)}
                          >
                            <AlertTriangle size={14} color="#f59e0b" />
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text-primary, #111827)', whiteSpace: 'nowrap' }}>
                        {f.anio} S{String(f.semana || '').padStart(2, '0')}
                        {(esExtraFacturacion || esExcedente) && (
                          <span style={{ fontSize: '9px', marginLeft: '4px', padding: '1px 5px', borderRadius: '3px', background: '#fde68a', color: '#92400e', fontWeight: 600 }}>
                            EXTRA
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '12px', fontWeight: 600, color: esExtraFacturacion ? '#b45309' : 'var(--text-primary, #111827)' }}>
                        {esExtraFacturacion ? '-' : f.cuotaRef}
                      </td>
                      <td style={{ padding: '10px 12px', color: esExtraFacturacion ? '#b45309' : 'var(--text-secondary, #6b7280)', fontSize: '11px', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={origenLabel}>
                        {origenLabel}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace', color: montoColor, fontWeight: 700 }}>
                        {formatCurrency(f.montoCuota || 0)}
                      </td>
                      {(() => {
                        // Las filas EXTRA (excedente) no se comparan contra la cuota fija.
                        const celdaVacia = (
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-tertiary, #9ca3af)' }}>-</td>
                        )
                        if (esExtraFacturacion) return celdaVacia
                        const diff = (f.montoCuota || 0) - resumen.montoCuotaFijo
                        if (Math.abs(diff) < 0.01) return celdaVacia
                        const esExcedenteDiff = diff > 0
                        return (
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace', fontSize: '11px', fontWeight: 600, color: esExcedenteDiff ? '#16a34a' : '#ef4444' }}>
                            {esExcedenteDiff ? '+' : ''}{formatCurrency(diff)}
                          </td>
                        )
                      })()}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Footer: Pagadas / Restantes */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
            marginTop: '8px', background: 'var(--bg-secondary, #f9fafb)',
            border: '1px solid var(--border-primary, #e5e7eb)', borderRadius: '6px', overflow: 'hidden',
          }}>
            <div style={{ padding: '12px 16px', borderRight: '1px solid var(--border-primary, #e5e7eb)', textAlign: 'center' }}>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-secondary, #6b7280)', fontWeight: 600, letterSpacing: '0.4px' }}>Pagadas</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#16a34a', fontFamily: 'monospace', marginTop: '4px' }}>
                {resumen.cuotasPagadas}
              </div>
              <div style={{ fontSize: '11px', color: '#16a34a', marginTop: '2px', fontWeight: 500 }}>
                {formatCurrency(resumen.totalRealPagado)}
              </div>
            </div>
            <div style={{ padding: '12px 16px', textAlign: 'center', gridColumn: 'span 3' }}>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-secondary, #6b7280)', fontWeight: 600, letterSpacing: '0.4px' }}>Restantes</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-secondary, #6b7280)', fontFamily: 'monospace', marginTop: '4px' }}>
                {resumen.cuotasRestantes}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary, #6b7280)', marginTop: '2px', fontWeight: 500 }}>
                {resumen.montoRestante > 0 ? `${formatCurrency(Math.round(resumen.montoRestante))} a futuro` : 'Completada'}
              </div>
            </div>
          </div>

          <div style={{ marginTop: '8px', fontSize: '10px', color: 'var(--text-tertiary, #9ca3af)' }}>
            Mostrando {filasFiltradas.length} de {resumen.filas.length} movimientos
            {(search || semanaFilter) && (
              <button
                onClick={() => { setSearch(''); setSemanaFilter('') }}
                style={{ marginLeft: '8px', background: 'transparent', border: 'none', color: 'var(--text-secondary, #6b7280)', cursor: 'pointer', textDecoration: 'underline', fontSize: '10px', padding: 0 }}
              >
                Limpiar filtros
              </button>
            )}
          </div>
        </>
      )}

      {/* Tooltip flotante (fixed) del aviso de semana no cerrada: así no lo recorta
          el contenedor con scroll de la tabla. */}
      {alertTip && (
        <div style={{
          position: 'fixed', left: alertTip.x, top: alertTip.y, transform: 'translateY(-50%)',
          zIndex: 3000, maxWidth: '260px', background: '#1f2937', color: '#fff',
          padding: '8px 10px', borderRadius: '6px', fontSize: '11px', lineHeight: 1.35,
          boxShadow: '0 6px 20px rgba(0,0,0,0.28)', pointerEvents: 'none',
        }}>
          Esta semana aún no está cerrada, por lo tanto el monto aún no se considera en el Total Real Pagado
        </div>
      )}
    </div>
  )
}
