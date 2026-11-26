// Modal de detalle de una semana de facturación (se abre desde una tarjeta del
// historial en el modal del conductor). Replica el detalle del portal Mi Espacio:
// datos del vehículo, conceptos, subtotales, monto referencial y pendiente de pago.

import { Fragment, useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { formatPlata } from '../../../utils/format'
import { cargarDetalleSemana, type SemanaDetalle, type FacturacionSemana } from './conductorDetalleService'
import { etiquetaIvaLinea } from '../../../utils/facturacionIva'
import { Spinner } from '../../../components/ui/LoadingOverlay'
import './SemanaDetalleModal.css'
import { PatenteBadge } from '../../../components/ui/PatenteBadge'
import { formatFecha } from '../../../utils/format'
import { clasePagoConductor } from '../../../utils/textoPagoConductor'

function fmt(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s + 'T00:00:00')
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

// Etiquetas legibles de cada tipo de aporte (igual que el portal).
const TIPO_APORTE_LABEL: Record<string, string> = {
  pago_cabify: 'Pago Cabify',
  pago_didi: 'Pago DiDi',
  pago_manual: 'Pago Manual',
  pago: 'Pago',
  pago_cuota: 'Pago Cuota',
  ajuste_manual: 'Ajuste',
  devolucion_garantia: 'Devolución Garantía',
}

function fmtPagoFecha(s: string | null): string {
  if (!s) return ''
  const txt = formatFecha(s)
  return txt === '-' ? '' : txt
}

export function SemanaDetalleModal({
  conductor, conductorId, semana, onClose,
}: { conductor: { nombre: string; dni: string | null }; conductorId: string; semana: FacturacionSemana; onClose: () => void }) {
  const [detalle, setDetalle] = useState<SemanaDetalle | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let vivo = true
    setLoading(true)
    cargarDetalleSemana(semana.id, semana.patente, conductorId, semana.semana, semana.anio, semana.saldoAnterior)
      .then(d => { if (vivo) setDetalle(d) })
      .finally(() => { if (vivo) setLoading(false) })
    return () => { vivo = false }
  }, [semana.id, semana.patente, conductorId, semana.semana, semana.anio, semana.saldoAnterior])

  const cargos = (detalle?.conceptos || []).filter(c => !c.esDescuento)
  const descuentos = (detalle?.conceptos || []).filter(c => c.esDescuento)
  // Los cargos se muestran en NETO y el IVA va en su propio renglon, igual que en el
  // modulo de Facturacion. El subtotal suma los BRUTOS (`total`), asi
  // Subtotal - Descuentos + Saldo anterior cierra contra total_a_pagar.
  const subtotalCargos = Math.round(cargos.reduce((s, c) => s + c.total, 0) * 100) / 100
  // Cada producto con IVA lleva su propio renglon de IVA justo debajo, con referencia al
  // concepto (ej: "IVA 21% · P001 - Alquiler Turno Diurno"), igual que en Facturacion.
  const filaIva = (etiqueta: string, valor: number) => (
    <div className="csem-row iva"><span className="csem-dot" />{etiqueta}<span className="csem-amt">{formatPlata(valor, { decimales: 2 })}</span></div>
  )
  const subtotalDescuentos = descuentos.reduce((s, c) => s + c.total, 0)
  // Lo de esta semana: cargos menos descuentos (sin el saldo anterior)
  const subtotalSemana = subtotalCargos - subtotalDescuentos
  // Con fraccionamiento, los pagos previos a fraccionar se muestran en "Saldo anterior"
  // (cierre - pagos - fraccionado), no en Aportes.
  const desgloseFrac = detalle?.desgloseFraccionamiento || null
  const idsEnDesglose = new Set((desgloseFrac?.pagos || []).map(p => p.id))
  // Un aporte en $0 (p. ej. "Pago Cabify" de una semana sin cobro) no se muestra
  const pagos = (detalle?.pagos || []).filter(p => !idsEnDesglose.has(p.id) && Math.abs(p.monto) >= 0.005)
  // Los pagos que ya quedaron dentro de una deuda fraccionada se muestran pero no se restan.
  const totalAportado = pagos.filter(p => !p.aplicadoAFraccionamiento).reduce((s, p) => s + p.monto, 0)
  // Saldo al cierre de la semana anterior: si un aporte de esta semana ya estaba dentro de
  // saldo_anterior se lo saca de ahí, porque se muestra (y se resta) en Aportes.
  const saldoAnterior = semana.saldoAnterior + (semana.pagoEnSaldoAnterior || 0)

  // Monto Total Referencial y Pendiente: misma formula que el portal Mi Espacio
  // (PortalPage: `totalAPagar = subtotalCargos - subtotalDescuentos + saldoAnterior`,
  // `saldoPendiente = totalAPagar - totalPagadoSemana`).
  // Se calcula desde las lineas y NO desde `semana.proforma`
  // (facturacion_conductores.total_a_pagar) para que el referencial sea siempre la suma
  // de lo que se muestra. Como los cargos ahora suman su importe bruto (con IVA, mismo
  // criterio que Facturacion), ambos valores coinciden salvo centavos de redondeo.
  const montoReferencial = subtotalCargos - subtotalDescuentos + saldoAnterior
  const pendiente = montoReferencial - totalAportado
  const pendienteMostrado = Math.abs(pendiente) < 0.01 ? 0 : Math.abs(pendiente)
  const estadoTxt = pendiente > 0.01 ? 'Pendiente de pago' : pendiente < -0.01 ? 'Saldo a favor' : 'Sin saldo'

  return (
    <div className="csem-overlay" onClick={(e) => { e.stopPropagation(); onClose() }}>
      <div className="csem-modal" onClick={e => e.stopPropagation()}>
        <button className="csem-close" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>

        {/* Tres franjas, como el detalle de Facturación: encabezado compacto arriba y total
            abajo quietos; solo el medio se desplaza */}
        <div className="csem-header">
          <div className="csem-head-line">
            <div className="csem-who">
              <span className="csem-name">{conductor.nombre || '—'}</span>
              <span className="csem-dni">{conductor.dni || '—'}</span>
            </div>
            <div className="csem-week">
              <strong className="csem-week-n">Semana {semana.semana}</strong>
              {' · '}{fmt(semana.fechaInicio)} al {fmt(semana.fechaFin)}/{semana.anio}
            </div>
          </div>
          <div className="csem-info">
            <PatenteBadge patente={semana.patente} size="sm" />
            <span>{semana.modalidad || '—'}</span>
            {detalle?.gnc != null && <span className={detalle.gnc ? 'gnc' : ''}>{detalle.gnc ? 'GNC' : 'Nafta'}</span>}
            <span>{semana.turnosCobrados}<span className="csem-suave"> de {semana.turnosBase} turnos</span></span>
            {detalle?.grupoFlota && <span className="csem-flota">{detalle.grupoFlota}</span>}
          </div>
        </div>

        <div className="csem-body">
          {loading ? (
            <Spinner size="sm" message="Cargando…" />
          ) : (
            <>
              {/* Se lee como una cuenta: esta semana + saldo anterior = total a pagar;
                  menos los aportes = pendiente (pedido 2026-11-26) */}
              <div className="csem-bloque">Esta semana</div>
              <div className="csem-items">
                {cargos.map((c, i) => (
                  <Fragment key={`c${i}`}>
                    <div className="csem-row"><span className="csem-dot" />{c.nombre}{c.cantidad > 1 ? ` x${c.cantidad}` : ''}<span className="csem-amt">{formatPlata(c.neto, { decimales: 2 })}</span></div>
                    {c.total - c.neto > 0.005 && filaIva(etiquetaIvaLinea(c.ivaPorcentaje, `${c.codigo} - ${c.nombre}`), Math.round((c.total - c.neto) * 100) / 100)}
                  </Fragment>
                ))}
                {descuentos.map((c, i) => (
                  <div key={`d${i}`} className="csem-row desc"><span className="csem-dot desc" />{c.nombre}{c.cantidad > 1 ? ` x${c.cantidad}` : ''}<span className="csem-amt">− {formatPlata(c.total, { decimales: 2 })}</span></div>
                ))}
              </div>
              <div className="csem-resultado"><span>Subtotal de la semana</span><span>{formatPlata(subtotalSemana, { decimales: 2 })}</span></div>

              {saldoAnterior !== 0 && !desgloseFrac && (
                <div className="csem-saldo-ant">
                  <span>{saldoAnterior > 0 ? 'Saldo anterior (deuda)' : 'Saldo anterior (a favor)'}</span>
                  <span className={saldoAnterior > 0 ? 'debit' : 'credit'}>
                    {saldoAnterior > 0 ? '+ ' : '− '}{formatPlata(Math.abs(saldoAnterior), { decimales: 2 })}
                  </span>
                </div>
              )}

              {desgloseFrac && (
                <>
                  <div className="csem-sect-title">Saldo anterior</div>
                  <div className="csem-items">
                    <div className="csem-row">
                      <span className="csem-dot" />Saldo adeudado al cierre S{desgloseFrac.cierreSemana}
                      <span className="csem-amt" style={{ color: '#dc2626' }}>{formatPlata(desgloseFrac.saldoCierre, { decimales: 2 })}</span>
                    </div>
                    {desgloseFrac.pagos.map(p => (
                      <div key={p.id} className="csem-row aporte">
                        {/* Al conductor: tipo de pago y fecha, sin quién pagó ni la cuenta */}
                        <span className="csem-dot aporte" />{clasePagoConductor(p.tipo, p.ref) || TIPO_APORTE_LABEL[p.tipo] || p.tipo}
                        <span className="csem-ref">{clasePagoConductor(p.tipo, p.ref) ? '' : `· ${p.ref}`}{fmtPagoFecha(p.fecha) ? ` · ${fmtPagoFecha(p.fecha)}` : ''}</span>
                        <span className="csem-amt" style={{ color: p.monto < 0 ? '#dc2626' : '#059669' }}>
                          {p.monto < 0 ? '+' : '-'}{formatPlata(Math.abs(p.monto), { decimales: 2 })}
                        </span>
                      </div>
                    ))}
                    <div className="csem-row" title={`Fraccionado el ${fmtPagoFecha(desgloseFrac.fraccionamiento.fecha)}. Se cobra en ${desgloseFrac.fraccionamiento.cuotas} cuotas semanales (P010).`}>
                      <span className="csem-dot" style={{ background: '#6366F1' }} />Fraccionamiento en {desgloseFrac.fraccionamiento.cuotas} cuotas (P010)
                      <span className="csem-amt" style={{ color: '#6366F1' }}>-{formatPlata(desgloseFrac.fraccionamiento.monto, { decimales: 2 })}</span>
                    </div>
                  </div>
                  <div className="csem-subtotal">
                    <span>{saldoAnterior > 0 ? 'Resultado: deuda pendiente' : saldoAnterior < 0 ? 'Resultado: saldo a favor' : 'Resultado: sin saldo pendiente'}</span>
                    <span className={saldoAnterior > 0 ? 'debit' : 'credit'}>
                      {saldoAnterior > 0 ? '+' : saldoAnterior < 0 ? '-' : ''}{formatPlata(Math.abs(saldoAnterior), { decimales: 2 })}
                    </span>
                  </div>
                </>
              )}

              <div className="csem-total-pagar"><span>Total a pagar</span><span>{formatPlata(montoReferencial, { decimales: 2 })}</span></div>

              {pagos.length > 0 && (
                <>
                  <div className="csem-bloque">Aportes</div>
                  <div className="csem-items">
                  {pagos.map(p => (
                    <div key={p.id} className="csem-row aporte">
                      <span className="csem-dot aporte" />
                      {clasePagoConductor(p.tipo, p.referencia) || TIPO_APORTE_LABEL[p.tipo] || p.tipo}
                      <span className="csem-ref">
                        {p.referencia && !clasePagoConductor(p.tipo, p.referencia) ? `· ${p.referencia}` : ''}{fmtPagoFecha(p.fecha) ? ` · ${fmtPagoFecha(p.fecha)}` : ''}
                        {p.aplicadoAFraccionamiento ? ' · aplicado a la deuda fraccionada' : ''}
                      </span>
                      {p.aplicadoAFraccionamiento
                        ? <span className="csem-amt" style={{ color: '#9ca3af' }} title="Este pago bajó la deuda antes de fraccionarla: ya está descontado en las cuotas (P010).">{formatPlata(p.monto, { decimales: 2 })}</span>
                        : <span className="csem-amt credit">− {formatPlata(p.monto, { decimales: 2 })}</span>}
                    </div>
                  ))}
                  </div>
                  <div className="csem-resultado"><span>Total aportado</span><span className="credit">− {formatPlata(totalAportado, { decimales: 2 })}</span></div>
                </>
              )}

            </>
          )}
        </div>

        {!loading && (
          <div className="csem-footer">
            <div className="csem-total-box">
              <div className="csem-cuenta">
                {totalAportado > 0 && <>{formatPlata(montoReferencial, { decimales: 2 })} − {formatPlata(totalAportado, { decimales: 2 })} aportado</>}
              </div>
              <div className="csem-pend">
                <div className="csem-pend-lbl">{estadoTxt.toUpperCase()}</div>
                <div className={`csem-pend-amt ${pendiente > 0.01 ? 'debit' : 'credit'}`}>
                  {formatPlata(pendienteMostrado, { decimales: 2 })}
                </div>
              </div>
            </div>
            <div className="csem-disclaimer">Información referencial: no es un comprobante fiscal válido.</div>
          </div>
        )}
      </div>
    </div>
  )
}
