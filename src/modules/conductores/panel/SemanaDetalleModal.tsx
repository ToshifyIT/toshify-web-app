// Modal de detalle de una semana de facturación (se abre desde una tarjeta del
// historial en el modal del conductor). Replica el detalle del portal Mi Espacio:
// datos del vehículo, conceptos, subtotales, monto referencial y pendiente de pago.

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { formatCurrency } from '../../../types/facturacion.types'
import { cargarDetalleSemana, type SemanaDetalle, type FacturacionSemana } from './conductorDetalleService'
import './SemanaDetalleModal.css'

function fmt(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s + 'T00:00:00')
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

// Etiquetas legibles de cada tipo de aporte (igual que el portal).
const TIPO_APORTE_LABEL: Record<string, string> = {
  pago_cabify: 'Pago Cabify',
  pago_manual: 'Pago Manual',
  pago: 'Pago',
  pago_cuota: 'Pago Cuota',
  ajuste_manual: 'Ajuste',
}

function fmtPagoFecha(s: string | null): string {
  if (!s) return ''
  const d = new Date(s)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
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
    cargarDetalleSemana(semana.id, semana.patente, conductorId, semana.semana, semana.anio)
      .then(d => { if (vivo) setDetalle(d) })
      .finally(() => { if (vivo) setLoading(false) })
    return () => { vivo = false }
  }, [semana.id, semana.patente, conductorId, semana.semana, semana.anio])

  const cargos = (detalle?.conceptos || []).filter(c => !c.esDescuento)
  const descuentos = (detalle?.conceptos || []).filter(c => c.esDescuento)
  const subtotalCargos = cargos.reduce((s, c) => s + c.total, 0)
  const subtotalDescuentos = descuentos.reduce((s, c) => s + c.total, 0)
  const pagos = detalle?.pagos || []
  const totalAportado = pagos.reduce((s, p) => s + p.monto, 0)
  const saldoAnterior = semana.saldoAnterior

  // Monto Total Referencial y Pendiente se toman del total_a_pagar de la factura
  // (semana.proforma), que conserva los centavos reales. El desglose de conceptos
  // puede sumar redondeado y quedar unos centavos por debajo del total.
  const montoReferencial = semana.proforma
  const pendiente = montoReferencial - totalAportado
  const pendienteMostrado = Math.abs(pendiente) < 0.01 ? 0 : Math.abs(pendiente)
  const estadoTxt = pendiente > 0.01 ? 'Pendiente de pago' : pendiente < -0.01 ? 'Saldo a favor' : 'Sin saldo'

  return (
    <div className="csem-overlay" onClick={(e) => { e.stopPropagation(); onClose() }}>
      <div className="csem-modal" onClick={e => e.stopPropagation()}>
        <button className="csem-close" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>

        <div className="csem-header">
          <div>
            <div className="csem-name">{conductor.nombre || '—'}</div>
            <div className="csem-dni">{conductor.dni || '—'}</div>
          </div>
          <div className="csem-week">
            <div className="csem-week-n">Semana {semana.semana}</div>
            <div className="csem-week-r">{fmt(semana.fechaInicio)} - {fmt(semana.fechaFin)} / {semana.anio}</div>
          </div>
        </div>

        <div className="csem-info">
          <span>Vehículo <b>{semana.patente || '—'}</b></span>
          <span>Modalidad <b>{semana.modalidad || '—'}</b></span>
          {detalle?.gnc != null && <span>Combustible <b className={detalle.gnc ? 'gnc' : ''}>{detalle.gnc ? 'GNC' : 'Nafta'}</b></span>}
          <span>Turnos <b>{semana.turnosCobrados}/{semana.turnosBase}</b></span>
          {detalle?.grupoFlota && <span>Flota <span className="csem-flota">{detalle.grupoFlota}</span></span>}
        </div>

        <div className="csem-body">
          {loading ? (
            <div className="csem-empty">Cargando…</div>
          ) : (
            <>
              <div className="csem-sect-title">Conceptos</div>
              {cargos.map((c, i) => (
                <div key={`c${i}`} className="csem-row"><span className="csem-dot" />{c.nombre}<span className="csem-amt">{formatCurrency(c.total)}</span></div>
              ))}
              <div className="csem-subtotal"><span>Subtotal Cargos</span><span>{formatCurrency(subtotalCargos)}</span></div>

              {descuentos.length > 0 && (
                <>
                  {descuentos.map((c, i) => (
                    <div key={`d${i}`} className="csem-row desc"><span className="csem-dot desc" />{c.nombre}<span className="csem-amt">-{formatCurrency(c.total)}</span></div>
                  ))}
                  <div className="csem-subtotal"><span>Subtotal Descuentos</span><span>-{formatCurrency(subtotalDescuentos)}</span></div>
                </>
              )}

              {saldoAnterior !== 0 && (
                <div className="csem-subtotal">
                  <span>{saldoAnterior > 0 ? 'Saldo anterior (deuda)' : 'Saldo anterior (a favor)'}</span>
                  <span className={saldoAnterior > 0 ? 'debit' : 'credit'}>
                    {saldoAnterior > 0 ? '+' : '-'}{formatCurrency(Math.abs(saldoAnterior))}
                  </span>
                </div>
              )}

              {pagos.length > 0 && (
                <>
                  <div className="csem-sect-title aportes">Aportes</div>
                  {pagos.map(p => (
                    <div key={p.id} className="csem-row aporte">
                      <span className="csem-dot aporte" />
                      {TIPO_APORTE_LABEL[p.tipo] || p.tipo}
                      <span className="csem-ref">
                        {p.referencia ? `· ${p.referencia}` : ''}{fmtPagoFecha(p.fecha) ? ` · ${fmtPagoFecha(p.fecha)}` : ''}
                      </span>
                      <span className="csem-amt credit">-{formatCurrency(p.monto)}</span>
                    </div>
                  ))}
                  <div className="csem-subtotal"><span>Total aportado</span><span className="credit">-{formatCurrency(totalAportado)}</span></div>
                </>
              )}

              <div className="csem-total-box">
                <div className="csem-total-ref">
                  <div className="csem-ref-row"><span>Subtotal Cargos</span><span>{formatCurrency(subtotalCargos)}</span></div>
                  {subtotalDescuentos > 0 && (
                    <div className="csem-ref-row"><span>Subtotal Descuentos</span><span>-{formatCurrency(subtotalDescuentos)}</span></div>
                  )}
                  {saldoAnterior !== 0 && (
                    <div className="csem-ref-row">
                      <span>{saldoAnterior > 0 ? 'Saldo anterior (deuda)' : 'Saldo anterior (a favor)'}</span>
                      <span>{saldoAnterior > 0 ? '+' : '-'}{formatCurrency(Math.abs(saldoAnterior))}</span>
                    </div>
                  )}
                  <div className="csem-total-row"><span>Monto Total Referencial</span><span>{formatCurrency(montoReferencial)}</span></div>
                  {totalAportado > 0 && (
                    <div className="csem-ref-row"><span>Total aportado</span><span>-{formatCurrency(totalAportado)}</span></div>
                  )}
                </div>
                <div className="csem-pend">
                  <div className="csem-pend-lbl">{estadoTxt.toUpperCase()}</div>
                  <div className={`csem-pend-amt ${pendiente > 0.01 ? 'debit' : 'credit'}`}>
                    {formatCurrency(pendienteMostrado)}
                  </div>
                </div>
              </div>

              <div className="csem-disclaimer">La información presentada es de carácter referencial y no constituye un comprobante fiscal válido.</div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
