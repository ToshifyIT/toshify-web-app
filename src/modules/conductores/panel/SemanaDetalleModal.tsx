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

export function SemanaDetalleModal({
  conductor, semana, onClose,
}: { conductor: { nombre: string; dni: string | null }; semana: FacturacionSemana; onClose: () => void }) {
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
    cargarDetalleSemana(semana.id, semana.patente)
      .then(d => { if (vivo) setDetalle(d) })
      .finally(() => { if (vivo) setLoading(false) })
    return () => { vivo = false }
  }, [semana.id, semana.patente])

  const cargos = (detalle?.conceptos || []).filter(c => !c.esDescuento)
  const descuentos = (detalle?.conceptos || []).filter(c => c.esDescuento)
  const subtotalCargos = cargos.reduce((s, c) => s + c.total, 0)
  const subtotalDescuentos = descuentos.reduce((s, c) => s + c.total, 0)

  const estadoTxt = semana.saldo > 1 ? 'Pendiente de pago' : semana.saldo < -1 ? 'Saldo a favor' : 'Sin saldo'

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

              <div className="csem-total-box">
                <div className="csem-total-row"><span>Monto Total Referencial</span><span>{formatCurrency(semana.proforma)}</span></div>
                <div className="csem-pend">
                  <div className="csem-pend-lbl">{estadoTxt.toUpperCase()}</div>
                  <div className={`csem-pend-amt ${semana.saldo > 1 ? 'debit' : 'credit'}`}>
                    {formatCurrency(Math.abs(semana.saldo) < 1 ? 0 : Math.abs(semana.saldo))}
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
