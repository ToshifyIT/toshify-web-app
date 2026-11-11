// src/modules/promociones/promocionesService.ts
// Estado de las promociones (tabla `promociones`, sql/promociones.sql). Qué promociones
// existen lo define el código (catalogoPromociones.ts); la base guarda si está activa y
// su período.

import { supabase } from '../../lib/supabase'
import { hoyART } from '../../utils/fechaArgentina'
import { PROMOCIONES } from './catalogoPromociones'

export interface PromocionRegistro {
  id: string
  codigo: string
  nombre: string
  activa: boolean
  fecha_inicio: string | null
  fecha_fin: string | null
  updated_at: string
  updated_by_name: string | null
}

export interface PromocionHistorial {
  id: number
  promocion_codigo: string
  activa: boolean
  fecha_inicio: string | null
  fecha_fin: string | null
  registrado_at: string
  usuario_nombre: string | null
}

export type EstadoPromocion = 'desactivada' | 'programada' | 'vigente' | 'finalizada'

const COLUMNAS = 'id, codigo, nombre, activa, fecha_inicio, fecha_fin, updated_at, updated_by_name'

/** Estado de la promoción en una fecha ("YYYY-MM-DD", por defecto hoy en Argentina). */
export function estadoPromocion(
  p: Pick<PromocionRegistro, 'activa' | 'fecha_inicio' | 'fecha_fin'>,
  fecha: string = hoyART(),
): EstadoPromocion {
  if (!p.activa || !p.fecha_inicio || !p.fecha_fin) return 'desactivada'
  if (fecha < p.fecha_inicio) return 'programada'
  if (fecha > p.fecha_fin) return 'finalizada'
  return 'vigente'
}

/**
 * Trae las promociones y da de alta (desactivadas) las del catálogo que todavía no están
 * en la base. Devuelve solo las que siguen en el catálogo, en su orden.
 */
export async function cargarPromociones(): Promise<PromocionRegistro[]> {
  const { data, error } = await (supabase.from('promociones') as any).select(COLUMNAS)
  if (error) throw error
  const registros: PromocionRegistro[] = data || []

  const faltan = PROMOCIONES.filter(def => !registros.some(r => r.codigo === def.codigo))
  if (faltan.length > 0) {
    const { data: nuevas, error: errInsert } = await (supabase.from('promociones') as any)
      .upsert(
        faltan.map(def => ({
          codigo: def.codigo,
          nombre: def.nombre,
          activa: false,
          fecha_inicio: def.fechasSugeridas.inicio,
          fecha_fin: def.fechasSugeridas.fin,
        })),
        { onConflict: 'codigo', ignoreDuplicates: true },
      )
      .select(COLUMNAS)
    if (errInsert) throw errInsert
    registros.push(...(nuevas || []))
  }

  return PROMOCIONES
    .map(def => registros.find(r => r.codigo === def.codigo))
    .filter((r): r is PromocionRegistro => !!r)
}

export async function actualizarPromocion(
  id: string,
  cambios: Partial<Pick<PromocionRegistro, 'activa' | 'fecha_inicio' | 'fecha_fin'>>,
  usuario: { id: string | null; nombre: string | null },
): Promise<PromocionRegistro> {
  const { data, error } = await (supabase.from('promociones') as any)
    .update({
      ...cambios,
      updated_at: new Date().toISOString(),
      updated_by: usuario.id,
      updated_by_name: usuario.nombre,
    })
    .eq('id', id)
    .select(COLUMNAS)
    .single()
  if (error) throw error
  return data
}

export async function cargarHistorialPromocion(codigo: string): Promise<PromocionHistorial[]> {
  const { data, error } = await (supabase.from('promociones_historial') as any)
    .select('id, promocion_codigo, activa, fecha_inicio, fecha_fin, registrado_at, usuario_nombre')
    .eq('promocion_codigo', codigo)
    .order('registrado_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return data || []
}

/**
 * ¿La promoción aplica en esa fecha? (activa y fecha dentro del período).
 * Es la pregunta que tiene que hacer cualquier cálculo que use una promoción.
 */
export async function promocionVigente(codigo: string, fecha: string = hoyART()): Promise<boolean> {
  const { data, error } = await (supabase.from('promociones') as any)
    .select('activa, fecha_inicio, fecha_fin')
    .eq('codigo', codigo)
    .maybeSingle()
  if (error) throw error
  return !!data && estadoPromocion(data, fecha) === 'vigente'
}
