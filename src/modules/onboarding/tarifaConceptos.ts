// Etiquetas del selector de Tarifa en el wizard de Programación.
//
// El valor guardado sigue siendo 'antigua' | 'nueva'. Lo que cambia acá es solo
// como se MUESTRA cada opción: en lugar de "Tarifa Antigua" / "Tarifa Nueva",
// se muestra el período y el precio semanal del concepto de alquiler que le
// corresponde a ese conductor, según su modalidad y si el vehículo tiene GNC.
//
// El mapa de códigos replica el de Facturación (ver GuiasModule.getCodigoPorModalidad)
// y el de useCobroTeoricoData (equivalencia antigua → nueva).

import { supabase } from '../../lib/supabase'
import type { TipoTarifa } from '../../types/onboarding.types'

export type ModalidadTarifa = 'cargo' | 'diurno' | 'nocturno'

/** codigo de concepto por modalidad × GNC × tipo de tarifa. */
const CODIGOS: Record<ModalidadTarifa, Record<'conGnc' | 'sinGnc', Record<TipoTarifa, string>>> = {
  cargo: {
    conGnc: { antigua: 'P002', nueva: 'P022' },
    sinGnc: { antigua: 'P016', nueva: 'P026' },
  },
  diurno: {
    conGnc: { antigua: 'P001', nueva: 'P021' },
    sinGnc: { antigua: 'P014', nueva: 'P024' },
  },
  nocturno: {
    conGnc: { antigua: 'P013', nueva: 'P023' },
    sinGnc: { antigua: 'P015', nueva: 'P025' },
  },
}

const CODIGOS_TARIFA_ALQUILER = [
  'P001', 'P002', 'P013', 'P014', 'P015', 'P016',
  'P021', 'P022', 'P023', 'P024', 'P025', 'P026',
]

function getCodigoTarifa(modalidad: ModalidadTarifa, tieneGnc: boolean, tarifa: TipoTarifa): string {
  return CODIGOS[modalidad][tieneGnc ? 'conGnc' : 'sinGnc'][tarifa]
}

interface ConceptoTarifa {
  codigo: string
  /** Período tomado del sufijo de la descripción, ej. "ENE-26". Vacío si no se pudo parsear. */
  periodo: string
  /** Monto semanal redondo. */
  precioSemanal: number
}

export type MapaConceptosTarifa = Record<string, ConceptoTarifa>

/** Extrae el período del final de la descripción: "... DIURNO ENE-26" → "ENE-26". */
function extraerPeriodo(descripcion: string): string {
  const ultimo = (descripcion || '').trim().split(/\s+/).pop() || ''
  return /^[A-Za-zÁÉÍÓÚÑ]{3}-\d{2}$/.test(ultimo) ? ultimo.toUpperCase() : ''
}

/** Trae los conceptos de alquiler activos. Ante cualquier error devuelve {} (el
 *  selector cae a sus etiquetas por defecto en vez de romperse). */
export async function cargarConceptosTarifa(): Promise<MapaConceptosTarifa> {
  try {
    const { data, error } = await (supabase.from('conceptos_nomina') as any)
      .select('codigo, descripcion, precio_final, precio_semanal')
      .eq('activo', true)
      .in('codigo', CODIGOS_TARIFA_ALQUILER)
    if (error || !data) return {}
    const mapa: MapaConceptosTarifa = {}
    for (const c of data as Array<{ codigo: string; descripcion: string; precio_final: number | null; precio_semanal: number | null }>) {
      mapa[c.codigo] = {
        codigo: c.codigo,
        periodo: extraerPeriodo(c.descripcion),
        // Mismo criterio que ConceptosFacturacionTab: precio_semanal de BD, respaldo precio_final × 7.
        precioSemanal: c.precio_semanal ?? Math.round((c.precio_final || 0) * 7),
      }
    }
    return mapa
  } catch {
    return {}
  }
}

const FALLBACK: Record<TipoTarifa, string> = { antigua: 'Tarifa Antigua', nueva: 'Tarifa Nueva' }

const fmt = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0 })

/** Etiqueta de una opción del selector: "ENE-26 ($ 299.000)".
 *  Si el concepto no está cargado o no tiene período, usa la etiqueta genérica. */
export function getEtiquetaTarifa(
  conceptos: MapaConceptosTarifa,
  modalidad: ModalidadTarifa,
  tieneGnc: boolean,
  tarifa: TipoTarifa,
): string {
  const c = conceptos[getCodigoTarifa(modalidad, tieneGnc, tarifa)]
  if (!c || !c.periodo) return FALLBACK[tarifa]
  return `${c.periodo} (${fmt.format(c.precioSemanal)})`
}
