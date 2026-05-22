// src/modules/multas-telepase/services/auditMulta.ts
// Helper para auditoría de cambios en multas_historico.
// Registra en `audit_log` y completa los campos updated_by / updated_by_name.

import { supabase } from '../../../lib/supabase'

export interface AuditCtx {
  userId?: string | null
  userName?: string | null
  userEmail?: string | null
}

/**
 * Inyecta los campos de auditoría (updated_by, updated_by_name) en el payload de update.
 * El campo updated_at lo setea el trigger DB automáticamente.
 */
export function withAudit<T extends Record<string, unknown>>(payload: T, ctx: AuditCtx): T & { updated_by: string | null; updated_by_name: string | null } {
  return {
    ...payload,
    updated_by: ctx.userId || null,
    updated_by_name: ctx.userName || ctx.userEmail || 'Sistema',
  }
}

/**
 * Registra una entrada en audit_log para una multa.
 * No falla si el audit_log no está disponible (best-effort).
 */
export async function logMultaAudit(params: {
  multaId: number | string
  accion: 'update' | 'desestimar' | 'reactivar' | 'eliminar' | 'restaurar'
  datosAnteriores?: Record<string, unknown> | null
  datosNuevos?: Record<string, unknown> | null
  camposModificados?: string[] | null
  ctx: AuditCtx
}): Promise<void> {
  try {
    await (supabase.from('audit_log' as any) as any).insert({
      tabla: 'multas_historico',
      registro_id: String(params.multaId),
      accion: params.accion,
      datos_anteriores: params.datosAnteriores || null,
      datos_nuevos: params.datosNuevos || null,
      campos_modificados: params.camposModificados || null,
      usuario_id: params.ctx.userId || null,
      usuario_nombre: params.ctx.userName || null,
      usuario_email: params.ctx.userEmail || null,
    })
  } catch (e) {
    // Audit es best-effort: no rompe la operación principal
    console.warn('[auditMulta] No se pudo registrar en audit_log:', e)
  }
}
