// Modal "Ver detalle" del Panel de Conductores. Vista densa para admin:
// cabecera + KPIs + 3 pestañas (Multas, Facturación, Km) como tablas compactas.
// Reusa la misma logica de datos que el portal Mi Espacio.

import { useState, useEffect, useMemo } from 'react'
import { X, AlertTriangle, Wallet, Gauge, Receipt } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { formatCurrency } from '../../../types/facturacion.types'
import { calcularKmSemanasConductor, type KmSemanaConductor } from '../../portal/kmRecorridos'
import { cargarMultasConductor, cargarFacturacionConductor, cargarResumenExtra, type MultaDetalle, type FacturacionSemana, type ResumenExtra } from './conductorDetalleService'
import type { ConductorPanelRow } from './conductoresPanelService'
import { SemanaDetalleModal } from './SemanaDetalleModal'
import './ConductorDetalleModal.css'

type Tab = 'multas' | 'facturacion' | 'km'

function fmtFecha(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function ConductorDetalleModal({ conductor, onClose }: { conductor: ConductorPanelRow; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('multas')
  const [multas, setMultas] = useState<MultaDetalle[]>([])
  const [facturacion, setFacturacion] = useState<FacturacionSemana[]>([])
  const [km, setKm] = useState<KmSemanaConductor[]>([])
  const [resumen, setResumen] = useState<ResumenExtra>({ gananciaCabify: 0 })
  const [loading, setLoading] = useState(true)
  const [semanaSel, setSemanaSel] = useState<FacturacionSemana | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let vivo = true
    setLoading(true)
    Promise.all([
      cargarMultasConductor({ id: conductor.id, nombres: conductor.nombres, apellidos: conductor.apellidos }),
      cargarFacturacionConductor(conductor.id),
      calcularKmSemanasConductor(supabase, { id: conductor.id, nombres: conductor.nombres || '', apellidos: conductor.apellidos || '' })
        .then(r => r.semanas).catch(() => [] as KmSemanaConductor[]),
    ]).then(async ([m, f, k]) => {
      if (!vivo) return
      setMultas(m); setFacturacion(f); setKm(k)
      // Resumen extra (Cabify + saldo) usa el rango de la última semana facturada.
      const rango = f.length && f[0].fechaInicio && f[0].fechaFin
        ? { inicio: f[0].fechaInicio, fin: f[0].fechaFin }
        : null
      const ext = await cargarResumenExtra(
        { id: conductor.id, nombres: conductor.nombres, apellidos: conductor.apellidos, dni: conductor.dni },
        rango,
      ).catch(() => ({ gananciaCabify: 0 }))
      if (vivo) setResumen(ext)
    }).finally(() => { if (vivo) setLoading(false) })
    return () => { vivo = false }
  }, [conductor.id, conductor.nombres, conductor.apellidos, conductor.dni])

  const factStats = useMemo(() => {
    const totales = facturacion.map(f => f.proforma)
    const sum = totales.reduce((a, b) => a + b, 0)
    const ultima = totales[0] || 0
    const anterior = totales[1] || 0
    const variacion = anterior > 0 ? ((ultima - anterior) / anterior) * 100 : 0
    // Saldo actual = saldo de la última semana (proforma - aportes). Vía saldo_anterior
    // ya arrastra el acumulado, así que es el saldo vigente. Igual que el portal.
    // Positivo = pendiente (deuda), negativo = a favor.
    const saldoNet = facturacion.length ? facturacion[0].saldo : 0
    return { ultima, variacion, promedio: totales.length ? sum / totales.length : 0, totalSemanas: totales.length, saldoNet }
  }, [facturacion])

  const kpis = useMemo(() => {
    const kmUltima = km.length ? km[km.length - 1].km : 0
    const factUltima = facturacion.length ? facturacion[0].proforma : 0
    return {
      multas: conductor.cantidadMultas,
      deuda: conductor.montoPendiente,
      kmUltima,
      factUltima,
    }
  }, [km, facturacion, conductor])

  return (
    <div className="cdet-overlay" onClick={onClose}>
      <div className="cdet-modal" onClick={e => e.stopPropagation()}>
        <button className="cdet-close" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>

        {/* Cabecera */}
        <div className="cdet-header">
          <div className="cdet-avatar">{(conductor.nombre || '?').split(' ').map(w => w[0]).slice(0, 2).join('')}</div>
          <div>
            <div className="cdet-name">{conductor.nombre || '—'}</div>
            <div className="cdet-meta">
              DNI {conductor.dni || '—'}
              {conductor.vehiculoAsignado && <> · <span className="cdet-chip">{conductor.vehiculoAsignado}</span></>}
              {' · '}<span className={conductor.activo ? 'cdet-ok' : 'cdet-off'}>{conductor.activo ? 'Activo' : (conductor.estadoCodigo || 'Inactivo')}</span>
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="cdet-kpis">
          <div className="cdet-kpi"><span className="cdet-kpi-ico"><AlertTriangle size={15} /></span><div><div className="cdet-kpi-val">{kpis.multas}</div><div className="cdet-kpi-lbl">Multas</div></div></div>
          <div className="cdet-kpi"><span className="cdet-kpi-ico"><Wallet size={15} /></span><div><div className="cdet-kpi-val danger">{formatCurrency(kpis.deuda)}</div><div className="cdet-kpi-lbl">Deuda pendiente</div></div></div>
          <div className="cdet-kpi"><span className="cdet-kpi-ico"><Gauge size={15} /></span><div><div className="cdet-kpi-val">{Math.round(kpis.kmUltima).toLocaleString('es-AR')} km</div><div className="cdet-kpi-lbl">Km última semana</div></div></div>
          <div className="cdet-kpi"><span className="cdet-kpi-ico"><Receipt size={15} /></span><div><div className="cdet-kpi-val">{formatCurrency(kpis.factUltima)}</div><div className="cdet-kpi-lbl">Facturación última semana</div></div></div>
        </div>

        {/* Tabs */}
        <div className="cdet-tabs">
          <button className={tab === 'multas' ? 'active' : ''} onClick={() => setTab('multas')}>Multas</button>
          <button className={tab === 'facturacion' ? 'active' : ''} onClick={() => setTab('facturacion')}>Facturación</button>
          <button className={tab === 'km' ? 'active' : ''} onClick={() => setTab('km')}>Km recorridos</button>
        </div>

        <div className="cdet-body">
          {loading ? (
            <div className="cdet-empty">Cargando…</div>
          ) : tab === 'multas' ? (
            multas.length === 0 ? <div className="cdet-empty">Sin multas atribuidas.</div> : (
              <table className="cdet-table">
                <thead><tr><th>Fecha</th><th>Infracción</th><th>Patente</th><th>Estado</th><th className="r">Monto</th></tr></thead>
                <tbody>
                  {multas.map(m => (
                    <tr key={m.id}>
                      <td>{fmtFecha(m.fecha)}</td>
                      <td className="cdet-trunc" title={m.infraccion || ''}>{m.infraccion || '—'}</td>
                      <td>{m.patente || '—'}</td>
                      <td><span className={`cdet-tag ${m.estado === 'pagada' ? 'ok' : 'pend'}`}>{m.estado === 'pagada' ? 'Pagada' : 'Pendiente'}</span></td>
                      <td className="r">{formatCurrency(m.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : tab === 'facturacion' ? (
            <>
              <div className="cdet-fac-stats">
                <div className="cdet-fac-stat">
                  <div className="cdet-fac-stat-lbl">Última semana</div>
                  <div className="cdet-fac-stat-val danger">{formatCurrency(factStats.ultima)}</div>
                  {factStats.variacion !== 0 && (
                    <div className={`cdet-fac-stat-sub ${factStats.variacion > 0 ? 'up' : 'down'}`}>
                      {factStats.variacion > 0 ? '↑' : '↓'} {Math.abs(factStats.variacion).toFixed(1)}%
                    </div>
                  )}
                </div>
                <div className="cdet-fac-stat">
                  <div className="cdet-fac-stat-lbl">Promedio semanal</div>
                  <div className="cdet-fac-stat-val">{formatCurrency(factStats.promedio)}</div>
                  <div className="cdet-fac-stat-sub muted">{factStats.totalSemanas} semanas</div>
                </div>
                <div className="cdet-fac-stat">
                  <div className="cdet-fac-stat-lbl">Ganancia Cabify</div>
                  <div className="cdet-fac-stat-val ok">{formatCurrency(resumen.gananciaCabify)}</div>
                  <div className="cdet-fac-stat-sub muted">última semana</div>
                </div>
                <div className="cdet-fac-stat">
                  <div className="cdet-fac-stat-lbl">Saldo actual</div>
                  <div className={`cdet-fac-stat-val ${factStats.saldoNet > 1 ? 'danger' : 'ok'}`}>
                    {formatCurrency(Math.abs(factStats.saldoNet) < 1 ? 0 : Math.abs(factStats.saldoNet))}
                  </div>
                  <div className="cdet-fac-stat-sub muted">
                    {factStats.saldoNet > 1 ? 'Pendiente' : factStats.saldoNet < -1 ? 'A favor' : 'Sin saldo'}
                  </div>
                </div>
              </div>
              {facturacion.length === 0 ? <div className="cdet-empty">Sin facturación registrada.</div> : (
              <div className="cdet-fac-list">
                {facturacion.map(f => {
                  const estadoTexto = f.estado === 'pendiente'
                    ? `Pendiente ${formatCurrency(f.saldo)}`
                    : f.estado === 'favor'
                      ? `A favor ${formatCurrency(Math.abs(f.saldo))}`
                      : '✓ Cubierto'
                  return (
                    <div key={f.id} className={`cdet-fac-card clickable ${f.estado === 'pendiente' ? 'pend' : ''}`} onClick={() => setSemanaSel(f)}>
                      <div className="cdet-fac-top">
                        <span className="cdet-fac-sem">Semana {f.semana} / {f.anio}</span>
                        <span className="cdet-fac-monto">{formatCurrency(f.proforma)}</span>
                      </div>
                      <div className="cdet-fac-sub">
                        {fmtFecha(f.fechaInicio)} - {fmtFecha(f.fechaFin)} · {f.patente || '-'} · {f.turnosCobrados}/{f.turnosBase} turnos
                      </div>
                      <div className="cdet-fac-cov">
                        <span className="cdet-fac-cov-lbl">Cobertura {Math.round(f.cobertura)}%</span>
                        <span className={`cdet-fac-cov-est ${f.estado}`}>{estadoTexto}</span>
                      </div>
                      <div className="cdet-fac-bar"><div className={`cdet-fac-bar-fill ${f.estado}`} style={{ width: `${f.cobertura}%` }} /></div>
                    </div>
                  )
                })}
              </div>
              )}
            </>
          ) : (
            km.length === 0 ? <div className="cdet-empty">Sin km registrados.</div> : (
              <table className="cdet-table">
                <thead><tr><th>Semana</th><th className="r">Km</th><th className="r">Límite</th><th className="r">Excedido</th><th>Modalidad</th></tr></thead>
                <tbody>
                  {[...km].reverse().map(k => (
                    <tr key={`${k.semana}-${k.anio}`}>
                      <td>S{k.semana}/{k.anio}</td>
                      <td className="r">{Math.round(k.km).toLocaleString('es-AR')}</td>
                      <td className="r">{Math.round(k.limite).toLocaleString('es-AR')}</td>
                      <td className={`r ${k.excedido > 0 ? 'danger' : ''}`}>{k.excedido > 0 ? Math.round(k.excedido).toLocaleString('es-AR') : '—'}</td>
                      <td>{k.modalidad || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}
        </div>
      </div>

      {semanaSel && (
        <SemanaDetalleModal
          conductor={{ nombre: conductor.nombre, dni: conductor.dni }}
          semana={semanaSel}
          onClose={() => setSemanaSel(null)}
        />
      )}
    </div>
  )
}
