// Modal "Ver detalle" del Panel de Conductores. Vista densa para admin:
// cabecera + KPIs + 3 pestañas (Multas, Facturación, Km) como tablas compactas.
// Reusa la misma logica de datos que el portal Mi Espacio.

import { useState, useEffect, useMemo } from 'react'
import { X, AlertTriangle, Wallet, Gauge, Receipt, Info } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { formatCurrency } from '../../../types/facturacion.types'
import { calcularKmSemanasConductor, type KmSemanaConductor } from '../../portal/kmRecorridos'
import { cargarMultasConductor, cargarFacturacionConductor, cargarResumenExtra, cargarExcesoKmConductor, cargarAsignacionesConductor, cargarHistorialBajasConductor, type MultaDetalle, type FacturacionSemana, type ResumenExtra, type ExcesoKmConductor, type AsignacionHist, type BajaHist } from './conductorDetalleService'
import type { ConductorPanelRow } from './conductoresPanelService'
import { SemanaDetalleModal } from './SemanaDetalleModal'
import './ConductorDetalleModal.css'

type Tab = 'multas' | 'facturacion' | 'km' | 'asignaciones' | 'bajas'

// Etiqueta legible de turno/horario y estados para los historiales.
function horarioLabel(h: string | null): string {
  if (h === 'nocturno') return 'Nocturno'
  if (h === 'diurno') return 'Diurno'
  if (h === 'todo_dia') return 'A cargo'
  return h || '—'
}
function fmtFechaCorta(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtFecha(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Turno de la semana: a cargo, o el horario (diurno/nocturno) si es modalidad turno.
function turnoKmLabel(modalidad: string | null, horario: string | null): string {
  if (modalidad === 'a_cargo' || horario === 'todo_dia') return 'A cargo'
  if (horario === 'nocturno') return 'Nocturno'
  if (horario === 'diurno') return 'Diurno'
  if (modalidad) return modalidad.charAt(0).toUpperCase() + modalidad.slice(1)
  return '—'
}

export function ConductorDetalleModal({ conductor, onClose }: { conductor: ConductorPanelRow; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('multas')
  const [multas, setMultas] = useState<MultaDetalle[]>([])
  const [facturacion, setFacturacion] = useState<FacturacionSemana[]>([])
  const [km, setKm] = useState<KmSemanaConductor[]>([])
  const [excesoKm, setExcesoKm] = useState<ExcesoKmConductor>({ porSemana: new Map(), pendienteTotal: 0 })
  const [asignaciones, setAsignaciones] = useState<AsignacionHist[]>([])
  const [bajas, setBajas] = useState<BajaHist[]>([])
  const [loadingHist, setLoadingHist] = useState(true)
  const [resumen, setResumen] = useState<ResumenExtra>({ gananciaCabify: 0 })
  const [loading, setLoading] = useState(true)
  const [kmLoading, setKmLoading] = useState(true)
  const [semanaSel, setSemanaSel] = useState<FacturacionSemana | null>(null)
  const [deudaOpen, setDeudaOpen] = useState(false)

  useEffect(() => {
    // Escape cierra el modal de arriba: primero el detalle de deuda, luego el de
    // semana (que lo maneja él mismo), y por último este modal.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (deudaOpen) { setDeudaOpen(false); return }
      if (!semanaSel) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, semanaSel, deudaOpen])

  useEffect(() => {
    let vivo = true
    setLoading(true)
    setKmLoading(true)

    // GRUPO RÁPIDO (multas + facturación + exceso KM): destraba el modal. La pestaña
    // Multas (la que se ve por defecto) y los KPIs de deuda/facturación dependen solo
    // de esto, así que se muestran apenas resuelve, sin esperar al cálculo de km.
    Promise.all([
      cargarMultasConductor({ id: conductor.id, nombres: conductor.nombres, apellidos: conductor.apellidos }),
      cargarFacturacionConductor(conductor.id),
      cargarExcesoKmConductor(conductor.id).catch(() => ({ porSemana: new Map(), pendienteTotal: 0 })),
    ]).then(([m, f, ex]) => {
      if (!vivo) return
      setMultas(m); setFacturacion(f); setExcesoKm(ex)
      // Resumen extra (Cabify) usa el rango de la última semana facturada. Se dispara
      // en cuanto está la facturación, en paralelo con el cálculo de km.
      const rango = f.length && f[0].fechaInicio && f[0].fechaFin
        ? { inicio: f[0].fechaInicio, fin: f[0].fechaFin }
        : null
      cargarResumenExtra(
        { id: conductor.id, nombres: conductor.nombres, apellidos: conductor.apellidos, dni: conductor.dni },
        rango,
      ).then(ext => { if (vivo) setResumen(ext) }).catch(() => { /* ignora */ })
    }).finally(() => { if (vivo) setLoading(false) })

    // Historiales de asignaciones y bajas (consultas livianas, en paralelo).
    setLoadingHist(true)
    Promise.all([
      cargarAsignacionesConductor(conductor.id).catch(() => [] as AsignacionHist[]),
      cargarHistorialBajasConductor(conductor.id).catch(() => [] as BajaHist[]),
    ]).then(([asig, bj]) => {
      if (!vivo) return
      setAsignaciones(asig); setBajas(bj)
    }).finally(() => { if (vivo) setLoadingHist(false) })

    // KM en paralelo y sin bloquear: es el cálculo más pesado (recorre viajes GPS).
    // Alimenta solo la pestaña Km y el KPI "Km última semana".
    calcularKmSemanasConductor(supabase, { id: conductor.id, nombres: conductor.nombres || '', apellidos: conductor.apellidos || '' })
      .then(r => { if (vivo) setKm(r.semanas) })
      .catch(() => { if (vivo) setKm([]) })
      .finally(() => { if (vivo) setKmLoading(false) })

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
    // km viene ordenado de la semana más reciente a la más antigua: la última semana es km[0].
    const kmUltima = km.length ? km[0].km : 0
    const factUltima = facturacion.length ? facturacion[0].proforma : 0
    // Deuda pendiente = multas pendientes de pago + saldo pendiente (Saldo Actual)
    //   + penalidades de exceso de KM en estado pendiente (aún no aplicadas).
    // Los tres componentes son disjuntos (lo pendiente aún no entró a facturación).
    const multasPendientes = conductor.montoPendiente
    const saldoPendiente = Math.max(0, factStats.saldoNet)
    // Segmentación del saldo pendiente: cuánto es arrastre de la semana anterior
    // (saldo_anterior de la última semana) y cuánto es lo que se cobra esta semana.
    const saldoAnterior = saldoPendiente > 0 ? (facturacion[0]?.saldoAnterior ?? 0) : 0
    const saldoActualSemana = saldoPendiente - saldoAnterior
    const excesoPendiente = excesoKm.pendienteTotal
    const deuda = multasPendientes + saldoPendiente + excesoPendiente
    return {
      multas: conductor.cantidadMultas,
      deuda,
      multasPendientes,
      saldoPendiente,
      saldoAnterior,
      saldoActualSemana,
      excesoPendiente,
      kmUltima,
      factUltima,
    }
  }, [km, facturacion, conductor, factStats.saldoNet, excesoKm.pendienteTotal])

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
          <div className="cdet-kpi">
            <span className="cdet-kpi-ico"><Wallet size={15} /></span>
            <div>
              <div className="cdet-kpi-val danger">{formatCurrency(kpis.deuda)}</div>
              <div className="cdet-kpi-lbl">Deuda pendiente</div>
            </div>
            <button className="cdet-kpi-detalle" onClick={() => setDeudaOpen(true)} title="Ver detalle del cálculo">
              <Info size={12} /> Detalle
            </button>
          </div>
          <div className="cdet-kpi"><span className="cdet-kpi-ico"><Gauge size={15} /></span><div><div className="cdet-kpi-val">{kmLoading ? '…' : `${Math.round(kpis.kmUltima).toLocaleString('es-AR')} km`}</div><div className="cdet-kpi-lbl">Km última semana</div></div></div>
          <div className="cdet-kpi"><span className="cdet-kpi-ico"><Receipt size={15} /></span><div><div className="cdet-kpi-val">{formatCurrency(kpis.factUltima)}</div><div className="cdet-kpi-lbl">Facturación última semana</div></div></div>
        </div>

        {/* Tabs */}
        <div className="cdet-tabs">
          <button className={tab === 'multas' ? 'active' : ''} onClick={() => setTab('multas')}>Multas</button>
          <button className={tab === 'facturacion' ? 'active' : ''} onClick={() => setTab('facturacion')}>Facturación</button>
          <button className={tab === 'km' ? 'active' : ''} onClick={() => setTab('km')}>Km recorridos</button>
          <button className={tab === 'asignaciones' ? 'active' : ''} onClick={() => setTab('asignaciones')}>Historial de asignaciones</button>
          <button className={tab === 'bajas' ? 'active' : ''} onClick={() => setTab('bajas')}>Historial de bajas</button>
        </div>

        <div className="cdet-body">
          {loading ? (
            <div className="cdet-empty">Cargando…</div>
          ) : tab === 'multas' ? (
            multas.length === 0 ? <div className="cdet-empty">Sin multas atribuidas.</div> : (
              <table className="cdet-table">
                <thead><tr>
                  <th>Fecha</th><th>Infracción</th><th>Patente</th><th>Estado</th>
                  <th className="r">Importe</th><th className="r">Con desc.</th><th>Vto. desc.</th><th className="r">Monto de incidencia</th><th>Semana de pago</th>
                </tr></thead>
                <tbody>
                  {multas.map(m => {
                    // Resaltar en verde la columna cuyo importe se está cobrando (el que
                    // coincide con "Monto"). Pendiente: importe o importe con descuento.
                    // En proceso / Pagada: el monto facturado (penalidad) coincide con
                    // uno de los dos, así que se resalta ese.
                    const tieneCuotas = !!(m.cuotas && m.cuotas.length)
                    let aplicaImporte = false
                    let aplicaDesc = false
                    if (!tieneCuotas && m.estado === 'pendiente') {
                      aplicaImporte = !m.usaDescuento
                      aplicaDesc = m.usaDescuento
                    } else {
                      const cerca = (a: number, b: number) => Math.abs(a - b) < 1
                      if (m.importeDescuento > 0 && cerca(m.monto, m.importeDescuento)) aplicaDesc = true
                      else if (cerca(m.monto, m.importe)) aplicaImporte = true
                    }
                    return (
                      <tr key={m.id}>
                        <td>{fmtFecha(m.fecha)}</td>
                        <td className="cdet-trunc" title={m.infraccion || ''}>{m.infraccion || '—'}</td>
                        <td>{m.patente || '—'}</td>
                        <td><span className={`cdet-tag ${m.estado === 'pagada' ? 'ok' : 'pend'}`}>{m.estado === 'pagada' ? 'Pagada' : 'Pendiente'}</span></td>
                        <td className={`r ${aplicaImporte ? 'cdet-aplica' : ''}`}>{formatCurrency(m.importe)}</td>
                        <td className={`r ${aplicaDesc ? 'cdet-aplica' : ''}`}>{m.importeDescuento > 0 ? formatCurrency(m.importeDescuento) : '—'}</td>
                        <td>
                          {m.fechaVencDescuento
                            ? <span className={m.descuentoVigente ? 'cdet-venc-ok' : 'cdet-venc-off'}>
                                {fmtFecha(m.fechaVencDescuento)}{m.descuentoVigente ? '' : ' · vencido'}
                              </span>
                            : '—'}
                        </td>
                        <td className="r">
                          {tieneCuotas
                            ? (m.cuotas && m.cuotas.length
                                ? <div className="cdet-cuotas">
                                    <div className="cdet-cuotas-head" aria-hidden="true">&nbsp;</div>
                                    <div className="cdet-cuotas-list right">
                                      {m.cuotas.map(c => (
                                        <span key={c.numero} className={c.aplicado ? 'cuota-ok' : 'cuota-no'}>{formatCurrency(c.monto)}</span>
                                      ))}
                                    </div>
                                  </div>
                                : <b>—</b>)
                            : <b>{formatCurrency(m.monto)}</b>}
                        </td>
                        <td>
                          {tieneCuotas
                            ? (() => {
                                const cu = m.cuotas || []
                                if (cu.length === 0) return 'Fraccionada'
                                const pagadas = cu.filter(c => c.aplicado).length
                                return (
                                  <div className="cdet-cuotas">
                                    <div className="cdet-cuotas-head">{pagadas}/{cu.length} cuotas</div>
                                    <div className="cdet-cuotas-list">
                                      {cu.map(c => (
                                        <span key={c.numero} className={c.aplicado ? 'cuota-ok' : 'cuota-no'}>
                                          S{c.semana}/{c.anio} {c.aplicado ? '✓' : '✗'}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )
                              })()
                            : (m.semanaPago || '—')}
                        </td>
                      </tr>
                    )
                  })}
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
          ) : tab === 'km' ? (
            kmLoading ? <div className="cdet-empty">Cargando…</div> : km.length === 0 ? <div className="cdet-empty">Sin km registrados.</div> : (
              <table className="cdet-table">
                <thead><tr>
                  <th>Semana</th><th className="r">Km</th><th className="r">Límite</th><th className="r">Excedido</th>
                  <th>Estado</th><th>Modalidad</th><th className="r">Monto</th><th>Semana de pago</th>
                </tr></thead>
                <tbody>
                  {km.map(k => {
                    // Fuente de verdad del exceso: la INCIDENCIA. Una semana tiene exceso
                    // (a cobrar) si tiene una incidencia de exceso de km. Su km excedido,
                    // monto, estado y semana de pago salen de ahí.
                    const ex = excesoKm.porSemana.get(k.semana)
                    const hayExceso = !!ex
                    const monto = ex?.monto
                    const semanasPago = ex?.semanasPago || []
                    // Pagado sólo si el exceso ya se cobró (pago único aplicado o todas
                    // las cuotas cobradas si es fraccionado).
                    const excesoPagado = semanasPago.length > 0 && semanasPago.every(s => s.aplicado)
                    return (
                      <tr key={`${k.semana}-${k.anio}`}>
                        <td>S{k.semana}/{k.anio}</td>
                        <td className="r">{Math.round(k.km).toLocaleString('es-AR')}</td>
                        <td className="r">{Math.round(k.limite).toLocaleString('es-AR')}</td>
                        <td className={`r ${hayExceso ? 'danger' : ''}`}>{ex ? Math.round(ex.kmExceso).toLocaleString('es-AR') : '—'}</td>
                        <td>{!hayExceso ? 'N/A' : <span className={`cdet-tag ${excesoPagado ? 'ok' : 'impaga'}`}>{excesoPagado ? 'Pagado' : 'Pendiente'}</span>}</td>
                        <td>{turnoKmLabel(k.modalidad, k.horario)}</td>
                        <td className={`r ${monto != null && monto > 0 ? 'danger' : ''}`}>{monto != null ? formatCurrency(monto) : 'N/A'}</td>
                        <td>
                          {!hayExceso
                            ? '—'
                            : semanasPago.length === 0
                              ? <span className="cdet-tag pend">Por cobrar</span>
                              : <div className="cdet-cuotas-list">
                                  {semanasPago.map((s, i) => (
                                    <span key={i} className={s.aplicado ? 'cuota-ok' : 'cuota-no'}>
                                      S{s.semana}/{s.anio} {s.aplicado ? '✓' : '✗'}
                                    </span>
                                  ))}
                                </div>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )
          ) : tab === 'asignaciones' ? (
            loadingHist ? <div className="cdet-empty">Cargando…</div> : asignaciones.length === 0 ? <div className="cdet-empty">Sin asignaciones registradas.</div> : (
              <table className="cdet-table">
                <thead><tr>
                  <th>Patente</th><th>Vehículo</th><th>Turno</th><th>Estado</th><th>Desde</th><th>Hasta</th><th>Compañero</th>
                </tr></thead>
                <tbody>
                  {asignaciones.map(a => {
                    const activa = a.estadoAsig === 'activa'
                    return (
                      <tr key={a.id}>
                        <td><b>{a.patente || '—'}</b></td>
                        <td className="cdet-trunc" title={a.vehiculo || ''}>{a.vehiculo || '—'}</td>
                        <td>{a.modalidad === 'a_cargo' ? 'A cargo' : horarioLabel(a.horario)}</td>
                        <td><span className={`cdet-tag ${activa ? 'ok' : 'pend'}`}>{activa ? 'Activa' : (a.estadoAsig || a.estado || '—')}</span></td>
                        <td>{fmtFechaCorta(a.fechaInicio)}</td>
                        <td>{a.fechaFin ? fmtFechaCorta(a.fechaFin) : '—'}</td>
                        <td className="cdet-trunc" title={a.companero || ''}>{a.companero || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )
          ) : (
            loadingHist ? <div className="cdet-empty">Cargando…</div> : bajas.length === 0 ? <div className="cdet-empty">Sin bajas ni reactivaciones registradas.</div> : (
              <div className="cdet-bajas-list">
                {bajas.map(b => {
                  const esBaja = b.tipoEvento === 'baja'
                  return (
                    <div key={b.id} className={`cdet-baja-item ${esBaja ? 'baja' : 'reac'}`}>
                      <div className="cdet-baja-top">
                        <span className={`cdet-baja-badge ${esBaja ? 'baja' : 'reac'}`}>{esBaja ? 'Baja' : 'Reactivación'}</span>
                        <span className="cdet-baja-estado">{(b.estadoAnterior || '—')} → {(b.estadoNuevo || '—')}</span>
                        <span className="cdet-baja-fecha">{fmtFechaCorta(b.fecha)}</span>
                      </div>
                      {b.motivo && <div className="cdet-baja-motivo"><b>Motivo:</b> {b.motivo}</div>}
                      <div className="cdet-baja-usuario">Por {b.usuario || '—'}</div>
                    </div>
                  )
                })}
              </div>
            )
          )}
        </div>
      </div>

      {semanaSel && (
        <SemanaDetalleModal
          conductor={{ nombre: conductor.nombre, dni: conductor.dni }}
          conductorId={conductor.id}
          semana={semanaSel}
          onClose={() => setSemanaSel(null)}
        />
      )}

      {deudaOpen && (
        <div className="cdet-deuda-overlay" onClick={(e) => { e.stopPropagation(); setDeudaOpen(false) }}>
          <div className="cdet-deuda-modal" onClick={e => e.stopPropagation()}>
            <button className="cdet-deuda-close" onClick={() => setDeudaOpen(false)} aria-label="Cerrar"><X size={16} /></button>
            <div className="cdet-deuda-title">Detalle de la deuda pendiente</div>
            <div className="cdet-deuda-sub">Cómo se compone el total</div>

            <div className="cdet-deuda-row">
              <div>
                <div className="cdet-deuda-lbl">Multas pendientes de pago</div>
                <div className="cdet-deuda-hint">Multas en estado Pendiente (con descuento si sigue vigente)</div>
              </div>
              <span className="cdet-deuda-amt">{formatCurrency(kpis.multasPendientes)}</span>
            </div>
            <div className="cdet-deuda-row">
              <div>
                <div className="cdet-deuda-lbl">Saldo semana anterior</div>
                <div className="cdet-deuda-hint">Arrastre pendiente de semanas previas</div>
              </div>
              <span className="cdet-deuda-amt">{formatCurrency(kpis.saldoAnterior)}</span>
            </div>
            <div className="cdet-deuda-row">
              <div>
                <div className="cdet-deuda-lbl">Saldo actual</div>
                <div className="cdet-deuda-hint">Lo que se le va a cobrar en la última semana</div>
              </div>
              <span className="cdet-deuda-amt">{formatCurrency(kpis.saldoActualSemana)}</span>
            </div>
            <div className="cdet-deuda-row">
              <div>
                <div className="cdet-deuda-lbl">Exceso de KM pendiente</div>
                <div className="cdet-deuda-hint">Penalidades de exceso de km por aplicar (aún no facturadas)</div>
              </div>
              <span className="cdet-deuda-amt">{formatCurrency(kpis.excesoPendiente)}</span>
            </div>

            <div className="cdet-deuda-total">
              <span>Deuda pendiente</span>
              <span className="danger">{formatCurrency(kpis.deuda)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
