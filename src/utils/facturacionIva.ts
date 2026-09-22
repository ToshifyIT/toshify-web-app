// src/utils/facturacionIva.ts
//
// Desglose de IVA de las lineas de una factura semanal (facturacion_detalle).
//
// Contexto: en `facturacion_detalle` el importe de una linea de alquiler NO esta
// guardado de forma homogenea. `precio_unitario` arrastra el precio CON IVA
// (conceptos_nomina.precio_final), mientras que `total` quedo guardado SIN IVA en
// parte del historico, y las columnas iva_porcentaje / iva_monto solo se llenan
// para P006 (exceso de KM). El modulo de Facturacion siempre resolvio esto tomando
// `cantidad x precio_unitario` como importe bruto y descomponiendo el IVA hacia
// atras con el `iva_porcentaje` del concepto; asi cierra contra
// `facturacion_conductores.total_a_pagar`.
//
// Portal (Mi Espacio) y Panel de Conductores sumaban `total` tal cual, por lo que
// mostraban la semana sin IVA (ej: S38/2026 mostraba 258.522,06 contra los
// 298.265,89 realmente facturados y cobrados).
//
// Este modulo centraliza el criterio para que las tres vistas muestren lo mismo.
// Si cambia, cambia para todas.

import { supabase } from '../lib/supabase'

/** Conceptos de alquiler: su IVA se agrupa en un renglon propio ("IVA de alquiler"). */
export const CODIGOS_ALQUILER = [
  'P001', 'P002', 'P013', 'P014', 'P015', 'P016',
  'P021', 'P022', 'P023', 'P024', 'P025', 'P026',
]

/** Minimo que necesita el desglose de una fila de facturacion_detalle. */
export interface LineaFacturable {
  concepto_codigo: string
  cantidad?: number | null
  precio_unitario?: number | null
  total?: number | null
}

/** Codigo de concepto -> % de IVA. NO todos son 21% (P003 Garantia esta al 0%). */
export type IvaPorCodigo = Map<string, number>

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * % de IVA por codigo de concepto, desde conceptos_nomina (mismo origen y mismo
 * filtro `activo` que usa el modulo de Facturacion).
 * Si la consulta no devuelve nada, el mapa queda vacio: el desglose degrada a
 * "todo neto = bruto", sin renglon de IVA, pero los totales siguen siendo los brutos.
 */
export async function cargarIvaPorCodigo(): Promise<IvaPorCodigo> {
  const { data } = await supabase
    .from('conceptos_nomina')
    .select('codigo, iva_porcentaje')
    .eq('activo', true)
  const filas = (data || []) as Array<{ codigo: string | null; iva_porcentaje: unknown }>
  return new Map(
    filas
      .filter(c => !!c.codigo)
      .map(c => [c.codigo as string, Number(c.iva_porcentaje) || 0] as [string, number]),
  )
}

/** Importe bruto (con IVA) de la linea. Fallback a `total` si no hay precio unitario. */
export function montoBruto(item: LineaFacturable): number {
  const bruto = Number(item.cantidad || 0) * Number(item.precio_unitario || 0) || Number(item.total || 0)
  return r2(bruto)
}

/**
 * Importe neto de la linea. Se descompone sobre el bruto YA redondeado para que
 * Neto + IVA cierre exacto contra el bruto que se usa en los subtotales.
 */
export function montoNeto(item: LineaFacturable, iva: IvaPorCodigo): number {
  const bruto = montoBruto(item)
  const pct = iva.get(item.concepto_codigo) ?? 0
  return pct > 0 ? r2(bruto / (1 + pct / 100)) : bruto
}

/**
 * IVA de los cargos, separado en dos: el del alquiler (que va pegado a sus lineas)
 * y el del resto de los conceptos. Cada uno aporta segun su propio iva_porcentaje,
 * NO es un 21% plano sobre el subtotal. Hoy solo el alquiler lleva IVA, pero si
 * manana otro concepto lo lleva se muestra en su propia fila en vez de quedar
 * escondido dentro de "IVA de alquiler".
 */
export function desglosarIvaCargos(
  cargos: LineaFacturable[],
  iva: IvaPorCodigo,
): { ivaAlquiler: number; ivaOtros: number } {
  let ivaAlquiler = 0
  let ivaOtros = 0
  for (const item of cargos) {
    const dif = montoBruto(item) - montoNeto(item, iva)
    if (CODIGOS_ALQUILER.includes(item.concepto_codigo)) ivaAlquiler += dif
    else ivaOtros += dif
  }
  return { ivaAlquiler: r2(ivaAlquiler), ivaOtros: r2(ivaOtros) }
}

/**
 * Indice de la ultima linea de alquiler dentro de los cargos: el renglon de IVA de
 * alquiler va justo debajo. -1 = la semana no tiene alquiler (va al final de la lista).
 */
export function indiceUltimoAlquiler(cargos: LineaFacturable[]): number {
  return cargos.reduce(
    (idx, item, i) => (CODIGOS_ALQUILER.includes(item.concepto_codigo) ? i : idx),
    -1,
  )
}
