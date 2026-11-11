// src/modules/conductores/licenciaConductor.ts
// Licencia del conductor (regla 2026-11-11, igual que leads: ver leads/licenciaLead.ts).
//   - "¿Tiene licencia?" (conductores.tiene_licencia, 'Si' / 'No').
//   - Si tiene: Nro, Vencimiento, Categoría única (B1 / D1 / Otros) y las fechas de
//     obtención: B1 (obligatoria con B1, opcional con D1), D1 y la general de Otros.
//   - conductores_licencias_categorias queda como histórico: no se borra nada, solo se
//     agrega la categoría actual (la siguen leyendo Guías, Asignaciones y los filtros).
//   - El historial de cambios de categoría lo escribe un trigger en la base
//     (sql/licencia_categoria_conductores.sql).

import { supabase } from '../../lib/supabase'
import {
  ajustarFechasLicencia, codigosCategoriaParaConductor, estadoLicencia, faltantesLicencia,
  FALTA_FECHA_B1, FALTA_FECHA_D1, FALTA_FECHA_OTROS,
} from '../leads/licenciaLead'

export interface LicenciaConductorForm {
  tiene_licencia: string
  numero_licencia: string
  licencia_vencimiento: string
  categoria_licencia: string
  categoria_licencia_otra: string
  fecha_categoria_licencia: string
  fecha_licencia_b1: string
  fecha_licencia_d1: string
}

/** Campo del formulario → etiqueta del faltante (para marcar el error en su campo). */
const CAMPO_DE_FALTANTE: Record<string, keyof LicenciaConductorForm> = {
  '¿Tiene licencia?': 'tiene_licencia',
  'Nro. licencia': 'numero_licencia',
  'Vencimiento licencia': 'licencia_vencimiento',
  'Categoría de licencia': 'categoria_licencia',
  'Detalle de la licencia (Otros)': 'categoria_licencia_otra',
  [FALTA_FECHA_OTROS]: 'fecha_categoria_licencia',
  [FALTA_FECHA_B1]: 'fecha_licencia_b1',
  [FALTA_FECHA_D1]: 'fecha_licencia_d1',
}

/** Errores de licencia por campo (vacío = completo). */
export function erroresLicenciaConductor(fd: LicenciaConductorForm): Record<string, string> {
  const faltan = faltantesLicencia({
    licencia: fd.tiene_licencia,
    numero_licencia: fd.numero_licencia,
    vencimiento_licencia: fd.licencia_vencimiento,
    categoria_licencia: fd.categoria_licencia,
    categoria_licencia_otra: fd.categoria_licencia_otra,
    fecha_categoria_licencia: fd.fecha_categoria_licencia,
    fecha_licencia_b1: fd.fecha_licencia_b1,
    fecha_licencia_d1: fd.fecha_licencia_d1,
  })
  const errores: Record<string, string> = {}
  for (const etiqueta of faltan) errores[CAMPO_DE_FALTANTE[etiqueta] || 'tiene_licencia'] = 'Requerido'
  return errores
}

/** Columnas de licencia para insert / update (sin licencia → todo vacío). */
export function columnasLicenciaConductor(fd: LicenciaConductorForm): Record<string, string | null> {
  const estado = estadoLicencia(fd.tiene_licencia)
  if (estado === 'no') {
    return {
      tiene_licencia: 'No',
      numero_licencia: null,
      licencia_vencimiento: null,
      categoria_licencia: null,
      categoria_licencia_otra: null,
      fecha_categoria_licencia: null,
      fecha_licencia_b1: null,
      fecha_licencia_d1: null,
    }
  }
  const columnas: Record<string, string | null> = {
    tiene_licencia: estado === 'si' ? 'Si' : null,
    numero_licencia: fd.numero_licencia?.trim() || null,
    licencia_vencimiento: fd.licencia_vencimiento || null,
    categoria_licencia: fd.categoria_licencia || null,
    categoria_licencia_otra: fd.categoria_licencia === 'Otros' ? fd.categoria_licencia_otra?.trim() || null : null,
    fecha_categoria_licencia: fd.fecha_categoria_licencia || null,
    fecha_licencia_b1: fd.fecha_licencia_b1 || null,
    fecha_licencia_d1: fd.fecha_licencia_d1 || null,
  }
  ajustarFechasLicencia(columnas)
  return columnas
}

/**
 * Agrega la categoría actual a conductores_licencias_categorias si no estaba.
 * No borra nada: lo que ya había queda como histórico.
 */
export async function agregarCategoriaAlHistorico(
  conductorId: string,
  categoria: string | null | undefined,
  otra: string | null | undefined,
  catalogo: { id: string; codigo: string }[],
): Promise<void> {
  const codigos = codigosCategoriaParaConductor(categoria, otra, catalogo.map(c => c.codigo))
  const ids = codigos.map(codigo => catalogo.find(c => c.codigo === codigo)?.id).filter((id): id is string => !!id)
  if (ids.length === 0) return

  const { data: existentes, error } = await (supabase as any)
    .from('conductores_licencias_categorias')
    .select('licencia_categoria_id')
    .eq('conductor_id', conductorId)
  if (error) throw error
  const yaTiene = new Set((existentes || []).map((e: { licencia_categoria_id: string }) => e.licencia_categoria_id))
  const nuevas = ids.filter(id => !yaTiene.has(id)).map(id => ({ conductor_id: conductorId, licencia_categoria_id: id }))
  if (nuevas.length === 0) return

  const { error: errInsert } = await (supabase as any).from('conductores_licencias_categorias').insert(nuevas)
  if (errInsert) throw errInsert
}
