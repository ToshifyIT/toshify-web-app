import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { PROMO_CYBER_LICENCIA_B1 } from '../../promociones/catalogoPromociones'
import { PROMO_B1_PAGO_DIARIO } from '../utils/pagosB1'
import { formatFecha } from '../../../utils/format'
import { formatCurrency } from '../../../types/facturacion.types'
import './AyudaLicenciaB1.css'

interface PromoAyuda {
  codigo: string
  nombre: string
  fecha_inicio: string | null
  fecha_fin: string | null
}

/**
 * Ícono "i" al lado de la pestaña Licencia B1: con un clic muestra cómo funciona
 * la habilitación B1 (antes era un párrafo fijo arriba de la tabla).
 * Va dentro del botón de la pestaña, por eso es un span y corta la propagación.
 */
export function AyudaLicenciaB1() {
  const [abierta, setAbierta] = useState(false)
  const [promo, setPromo] = useState<PromoAyuda | null>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const iconoRef = useRef<HTMLSpanElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!abierta || promo) return
    void (async () => {
      try {
        const { data, error } = await (supabase.from('promociones') as any)
          .select('codigo, nombre, fecha_inicio, fecha_fin')
          .eq('clave', PROMO_CYBER_LICENCIA_B1)
          .maybeSingle()
        if (error) throw error
        if (data) setPromo(data as PromoAyuda)
      } catch (err) {
        console.error('No se pudo leer la habilitación B1:', err)
      }
    })()
  }, [abierta, promo])

  useEffect(() => {
    if (!abierta) return
    const cerrar = (e: MouseEvent) => {
      const t = e.target as Node
      if (panelRef.current?.contains(t) || iconoRef.current?.contains(t)) return
      setAbierta(false)
    }
    const conEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierta(false) }
    const alMover = () => setAbierta(false)
    document.addEventListener('mousedown', cerrar)
    document.addEventListener('keydown', conEsc)
    window.addEventListener('scroll', alMover, true)
    window.addEventListener('resize', alMover)
    return () => {
      document.removeEventListener('mousedown', cerrar)
      document.removeEventListener('keydown', conEsc)
      window.removeEventListener('scroll', alMover, true)
      window.removeEventListener('resize', alMover)
    }
  }, [abierta])

  const alternar = (e: React.SyntheticEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (!abierta && iconoRef.current) {
      const r = iconoRef.current.getBoundingClientRect()
      const ancho = Math.min(360, window.innerWidth - 32)
      setPos({
        top: r.bottom + 8,
        left: Math.max(16, Math.min(r.right - ancho, window.innerWidth - ancho - 16)),
      })
    }
    setAbierta(v => !v)
  }

  return (
    <>
      <span
        ref={iconoRef}
        role="button"
        tabIndex={0}
        className="lb1-ayuda-icono"
        aria-label="Cómo funciona la Licencia B1"
        aria-expanded={abierta}
        onClick={alternar}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') alternar(e) }}
      >
        <Info size={14} strokeWidth={2} />
      </span>
      {abierta && createPortal(
        <div ref={panelRef} className="lb1-ayuda-panel" role="dialog" style={{ top: pos.top, left: pos.left }}>
          <strong>Licencia B1 · pago diario</strong>
          {promo?.fecha_inicio && promo?.fecha_fin && (
            <span className="lb1-ayuda-fechas">
              Del {formatFecha(promo.fecha_inicio)} al {formatFecha(promo.fecha_fin)}
            </span>
          )}
          <ul>
            <li>
              Habilitación temporal: se aceptan conductores con licencia B1 (antes solo D1), con la condición
              de pagar {formatCurrency(PROMO_B1_PAGO_DIARIO)} por día como garantía de que están trabajando.
            </li>
            <li>
              Adelantan {formatCurrency(PROMO_B1_PAGO_DIARIO)} por día de su facturación semanal, todos los días
              desde su primer turno.
            </li>
            <li>
              Pagan por día hasta el día antes de obtener la D1, hasta la fecha de baja o hasta el fin de la
              habilitación{promo?.fecha_fin ? ` (${formatFecha(promo.fecha_fin)})` : ''}, lo que pase primero.
            </li>
            <li>
              No es una deuda: lo que no adelantan se cobra igual al facturar la semana. Cada lunes empieza
              de cero y las semanas anteriores quedan como historial.
            </li>
            <li>
              Los depósitos de Cresium se toman solos (del conductor o de quien paga por él en Cresium conductores); el efectivo se carga en Saldos &gt; Registrar Pago con el tilde B1.
            </li>
            <li>
              Cada pago entra al saldo como un pago más («Transferencia bancaria - B1», con la fecha de la
              transferencia). En la factura la línea B1 queda como información.
            </li>
          </ul>
        </div>,
        document.body,
      )}
    </>
  )
}
