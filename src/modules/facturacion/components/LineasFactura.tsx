// Conceptos de una factura semanal (facturacion_detalle), uno por renglón: alquiler,
// garantía, Toshipass, incidencias, promociones y demás descuentos. Lo usan los detalles
// de facturación del Control de Saldos y del panel del conductor.
// Importe de cada renglón con IVA (montoBruto), igual que el total de la factura.

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../../../lib/supabase'
import { getConceptoLabel } from '../../../utils/conceptoLabels'
import { montoBruto } from '../../../utils/facturacionIva'

interface Linea {
  clave: string
  nombre: string
  monto: number
}

interface LineasFacturaProps {
  facturaId: string | null | undefined
  /** Dibuja un renglón (nombre, monto con signo: los descuentos vienen negativos) */
  fila: (nombre: string, monto: number, clave: string) => ReactNode
  /** Se muestra mientras carga o si la factura no tiene conceptos guardados */
  respaldo: ReactNode
}

export function LineasFactura({ facturaId, fila, respaldo }: LineasFacturaProps) {
  const [lineas, setLineas] = useState<Linea[] | null>(null)

  useEffect(() => {
    let cancelado = false
    setLineas(null)
    if (!facturaId) return
    ;(supabase.from('facturacion_detalle') as any)
      .select('id, concepto_codigo, concepto_descripcion, cantidad, precio_unitario, total, es_descuento')
      .eq('facturacion_id', facturaId)
      // Primero cargos y después descuentos, cada grupo por código (igual que el portal)
      .order('es_descuento')
      .order('concepto_codigo')
      .then(({ data, error }: { data: any[] | null; error: unknown }) => {
        if (cancelado) return
        if (error) {
          console.error('Error cargando los conceptos de la factura:', error)
          setLineas([])
          return
        }
        setLineas((data || []).map(d => ({
          clave: String(d.id),
          nombre: getConceptoLabel(d),
          monto: d.es_descuento ? -Math.abs(montoBruto(d)) : montoBruto(d),
        })))
      })
    return () => { cancelado = true }
  }, [facturaId])

  if (!lineas || lineas.length === 0) return <>{respaldo}</>
  return <>{lineas.map(l => fila(l.nombre, l.monto, l.clave))}</>
}
