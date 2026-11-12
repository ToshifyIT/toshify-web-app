// src/modules/promociones/promocionesService.ts
// Estado de las promociones (tabla `promociones`, sql/promociones.sql). Qué promociones
// existen lo define el código (catalogoPromociones.ts), enlazado por `clave`; la base
// guarda el código visible (editable), la descripción, si está activa y su período. Cada cambio lo registra un trigger en promociones_historial
// (qué cambió, quién y cuándo).

import { supabase } from '../../lib/supabase'
import { hoyART } from '../../utils/fechaArgentina'
import { PROMOCIONES } from './catalogoPromociones'

export interface PromocionRegistro {
  id: string
  /** Identificador interno fijo (el del catálogo). */
  clave: string
  /** Código visible (PRM01...), editable. */
  codigo: string
  nombre: string
  descripcion: string | null
  activa: boolean
  fecha_inicio: string | null
  fecha_fin: string | null
  updated_at: string
  updated_by_name: string | null
}

export interface PromocionHistorial {
  id: number
  /** Código que tenía la promoción en ese momento. */
  promocion_codigo: string
  /** 'alta', 'codigo', 'activada', 'desactivada', 'fechas', 'descripcion' (separados por coma). */
  cambio: string | null
  activa: boolean
  descripcion: string | null
  fecha_inicio: string | null
  fecha_fin: string | null
  registrado_at: string
  usuario_nombre: string | null
}

export type EstadoPromocion = 'desactivada' | 'programada' | 'vigente' | 'finalizada'

const COLUMNAS = 'id, clave, codigo, nombre, descripcion, activa, fecha_inicio, fecha_fin, updated_at, updated_by_name'

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

  const faltan = PROMOCIONES.filter(def => !registros.some(r => r.clave === def.clave))
  if (faltan.length > 0) {
    const { data: nuevas, error: errInsert } = await (supabase.from('promociones') as any)
      .upsert(
        faltan.map(def => ({
          clave: def.clave,
          codigo: def.codigoInicial,
          nombre: def.nombre,
          descripcion: def.descripcionInicial,
          activa: false,
          fecha_inicio: def.fechasSugeridas.inicio,
          fecha_fin: def.fechasSugeridas.fin,
        })),
        { onConflict: 'clave', ignoreDuplicates: true },
      )
      .select(COLUMNAS)
    if (errInsert) throw errInsert
    registros.push(...(nuevas || []))
  }

  return PROMOCIONES
    .map(def => registros.find(r => r.clave === def.clave))
    .filter((r): r is PromocionRegistro => !!r)
}

export async function actualizarPromocion(
  id: string,
  cambios: Partial<Pick<PromocionRegistro, 'codigo' | 'activa' | 'descripcion' | 'fecha_inicio' | 'fecha_fin'>>,
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

export async function cargarHistorialPromocion(promocionId: string): Promise<PromocionHistorial[]> {
  const { data, error } = await (supabase.from('promociones_historial') as any)
    .select('id, promocion_codigo, cambio, activa, descripcion, fecha_inicio, fecha_fin, registrado_at, usuario_nombre')
    .eq('promocion_id', promocionId)
    .order('registrado_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return data || []
}

/** Código visible válido: mayúsculas, números y guion, de 2 a 20 caracteres (ej. PRM01). */
export const FORMATO_CODIGO_PROMOCION = /^[A-Z0-9-]{2,20}$/

/**
 * ¿La promoción aplica en esa fecha? (activa y fecha dentro del período).
 * `clave` es la constante PROMO_* del catálogo, no el código visible.
 * Es la pregunta que tiene que hacer cualquier cálculo que use una promoción.
 */
export async function promocionVigente(clave: string, fecha: string = hoyART()): Promise<boolean> {
  const { data, error } = await (supabase.from('promociones') as any)
    .select('activa, fecha_inicio, fecha_fin')
    .eq('clave', clave)
    .maybeSingle()
  if (error) throw error
  return !!data && estadoPromocion(data, fecha) === 'vigente'
}
