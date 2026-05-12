// src/modules/multas-telepase/services/desestimarMulta.ts
// Marca una multa como "desestimada": no se elimina de la base, solo se oculta de la vista
// principal. Se preserva quién la desestimó, cuándo y por qué motivo.

import { supabase } from '../../../lib/supabase'

export interface DesestimarCtx {
  userId?: string
  userName?: string
  motivo?: string
}

export type DesestimarResult =
  | { ok: true }
  | { ok: false; error: string }

export async function desestimarMulta(multaId: number, ctx: DesestimarCtx): Promise<DesestimarResult> {
  const { error } = await (supabase.from('multas_historico' as any) as any)
    .update({
      desestimada_at: new Date().toISOString(),
      desestimada_by: ctx.userName || ctx.userId || 'Sistema',
      desestimada_motivo: ctx.motivo?.trim() || null,
    })
    .eq('id', multaId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function reactivarMulta(multaId: number): Promise<DesestimarResult> {
  const { error } = await (supabase.from('multas_historico' as any) as any)
    .update({
      desestimada_at: null,
      desestimada_by: null,
      desestimada_motivo: null,
    })
    .eq('id', multaId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
