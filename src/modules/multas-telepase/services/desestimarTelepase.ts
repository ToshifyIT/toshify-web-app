// src/modules/multas-telepase/services/desestimarTelepase.ts
// Desestimar / reactivar / eliminar (soft) un registro de telepase_historico.
// Espejo de desestimarMulta.ts, adaptado a la tabla telepase_historico.

import { supabase } from '../../../lib/supabase'

export interface TelepaseCtx {
  userId?: string | null
  userName?: string | null
  userEmail?: string | null
  motivo?: string
}

export type TelepaseActionResult =
  | { ok: true }
  | { ok: false; error: string }

function auditFields(ctx: TelepaseCtx) {
  return {
    updated_at: new Date().toISOString(),
    updated_by: ctx.userId || null,
    updated_by_name: ctx.userName || ctx.userEmail || 'Sistema',
  }
}

async function logTelepaseAudit(params: {
  registroId: string
  accion: 'desestimar' | 'reactivar' | 'eliminar'
  camposModificados: string[]
  ctx: TelepaseCtx
}): Promise<void> {
  try {
    await (supabase.from('audit_log' as any) as any).insert({
      tabla: 'telepase_historico',
      registro_id: params.registroId,
      accion: params.accion,
      campos_modificados: params.camposModificados,
      usuario_id: params.ctx.userId || null,
      usuario_nombre: params.ctx.userName || null,
      usuario_email: params.ctx.userEmail || null,
    })
  } catch (e) {
    console.warn('[desestimarTelepase] No se pudo registrar en audit_log:', e)
  }
}

// Oculta el registro del listado principal (sin borrarlo).
export async function desestimarTelepase(id: string, ctx: TelepaseCtx): Promise<TelepaseActionResult> {
  const payload = {
    desestimada_at: new Date().toISOString(),
    desestimada_by: ctx.userName || ctx.userId || 'Sistema',
    desestimada_motivo: ctx.motivo?.trim() || null,
    ...auditFields(ctx),
  }
  const { error } = await (supabase.from('telepase_historico' as any) as any)
    .update(payload)
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  await logTelepaseAudit({
    registroId: id,
    accion: 'desestimar',
    camposModificados: ['desestimada_at', 'desestimada_by', 'desestimada_motivo'],
    ctx,
  })
  return { ok: true }
}

// Vuelve el registro al listado principal.
export async function reactivarTelepase(id: string, ctx: TelepaseCtx): Promise<TelepaseActionResult> {
  const payload = {
    desestimada_at: null,
    desestimada_by: null,
    desestimada_motivo: null,
    ...auditFields(ctx),
  }
  const { error } = await (supabase.from('telepase_historico' as any) as any)
    .update(payload)
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  await logTelepaseAudit({
    registroId: id,
    accion: 'reactivar',
    camposModificados: ['desestimada_at', 'desestimada_by', 'desestimada_motivo'],
    ctx,
  })
  return { ok: true }
}

// Eliminación lógica (soft-delete): no borra de la base, solo marca deleted_at.
export async function eliminarTelepase(id: string, ctx: TelepaseCtx): Promise<TelepaseActionResult> {
  const payload = {
    deleted_at: new Date().toISOString(),
    deleted_by: ctx.userName || ctx.userId || 'Sistema',
    ...auditFields(ctx),
  }
  const { error } = await (supabase.from('telepase_historico' as any) as any)
    .update(payload)
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  await logTelepaseAudit({
    registroId: id,
    accion: 'eliminar',
    camposModificados: ['deleted_at', 'deleted_by'],
    ctx,
  })
  return { ok: true }
}
