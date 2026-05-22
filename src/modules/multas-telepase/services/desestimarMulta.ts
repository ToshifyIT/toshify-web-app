// src/modules/multas-telepase/services/desestimarMulta.ts
// Marca una multa como "desestimada": no se elimina de la base, solo se oculta de la vista
// principal. Se preserva quién la desestimó, cuándo y por qué motivo.

import { supabase } from '../../../lib/supabase'
import { withAudit, logMultaAudit } from './auditMulta'

export interface DesestimarCtx {
  userId?: string
  userName?: string
  userEmail?: string
  motivo?: string
}

export type DesestimarResult =
  | { ok: true }
  | { ok: false; error: string }

export async function desestimarMulta(multaId: number, ctx: DesestimarCtx): Promise<DesestimarResult> {
  const payload = withAudit({
    desestimada_at: new Date().toISOString(),
    desestimada_by: ctx.userName || ctx.userId || 'Sistema',
    desestimada_motivo: ctx.motivo?.trim() || null,
  }, { userId: ctx.userId, userName: ctx.userName, userEmail: ctx.userEmail })
  const { error } = await (supabase.from('multas_historico' as any) as any)
    .update(payload)
    .eq('id', multaId)
  if (error) return { ok: false, error: error.message }
  await logMultaAudit({
    multaId,
    accion: 'desestimar',
    datosNuevos: { desestimada_motivo: ctx.motivo?.trim() || null },
    camposModificados: ['desestimada_at', 'desestimada_by', 'desestimada_motivo'],
    ctx: { userId: ctx.userId, userName: ctx.userName, userEmail: ctx.userEmail },
  })
  return { ok: true }
}

export async function reactivarMulta(multaId: number, ctx?: DesestimarCtx): Promise<DesestimarResult> {
  const auditCtx = { userId: ctx?.userId, userName: ctx?.userName, userEmail: ctx?.userEmail }
  const payload = withAudit({
    desestimada_at: null,
    desestimada_by: null,
    desestimada_motivo: null,
  }, auditCtx)
  const { error } = await (supabase.from('multas_historico' as any) as any)
    .update(payload)
    .eq('id', multaId)
  if (error) return { ok: false, error: error.message }
  await logMultaAudit({
    multaId,
    accion: 'reactivar',
    camposModificados: ['desestimada_at', 'desestimada_by', 'desestimada_motivo'],
    ctx: auditCtx,
  })
  return { ok: true }
}
