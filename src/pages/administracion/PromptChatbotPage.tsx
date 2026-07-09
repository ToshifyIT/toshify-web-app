// src/pages/administracion/PromptChatbotPage.tsx
// Módulo "Prompt - Chatbot" (Administración, solo admin).
// Edita el único prompt de la tabla mynos_prompts y registra cada edición y
// restauración en mynos_prompts_historial (quién, cuándo, antes/después).

import { useEffect, useState, useCallback } from 'react'
import type { CSSProperties } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { usePermissions } from '../../contexts/PermissionsContext'
import { History, Save, RotateCcw, Eye, EyeOff, ShieldAlert, RefreshCw, GitCompare } from 'lucide-react'

// Diff por palabras (LCS): marca tokens iguales, quitados y agregados. Resalta solo
// lo que cambió (el prompt suele venir como una sola línea larga, por eso no sirve por línea).
type DiffPart = { t: 'same' | 'del' | 'add'; text: string }
function diffWords(a: string, b: string): DiffPart[] {
  const A = (a || '').split(/(\s+)/), B = (b || '').split(/(\s+)/)   // conserva los espacios
  const n = A.length, m = B.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const res: DiffPart[] = []
  let i = 0, j = 0
  while (i < n && j < m) {
    if (A[i] === B[j]) { res.push({ t: 'same', text: A[i] }); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { res.push({ t: 'del', text: A[i] }); i++ }
    else { res.push({ t: 'add', text: B[j] }); j++ }
  }
  while (i < n) res.push({ t: 'del', text: A[i++] })
  while (j < m) res.push({ t: 'add', text: B[j++] })
  return res
}

interface HistorialRow {
  id: number
  tipo_evento: string
  prompt_anterior: string | null
  prompt_nuevo: string
  restaurado_de_id: number | null
  usuario_nombre: string | null
  created_at: string
}

export function PromptChatbotPage() {
  const { user, profile } = useAuth()
  const { isAdmin } = usePermissions()

  const [promptId, setPromptId] = useState<number | null>(null)
  const [texto, setTexto] = useState('')
  const [original, setOriginal] = useState('')
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [historial, setHistorial] = useState<HistorialRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [expandidos, setExpandidos] = useState<Set<number>>(new Set())
  const [comparando, setComparando] = useState<Set<number>>(new Set())

  const admin = isAdmin()

  const cargarHistorial = useCallback(async (pid: number) => {
    const { data } = await (supabase.from('mynos_prompts_historial' as any) as any)
      .select('id, tipo_evento, prompt_anterior, prompt_nuevo, restaurado_de_id, usuario_nombre, created_at')
      .eq('prompt_id', pid)
      .order('created_at', { ascending: false })
    setHistorial((data || []) as HistorialRow[])
  }, [])

  const cargar = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data, error: e } = await supabase
        .from('mynos_prompts')
        .select('id, prompt, updated_at')
        .order('id', { ascending: true })
        .limit(1)
      if (e) throw e
      const row = (data || [])[0] as { id: number; prompt: string | null; updated_at: string | null } | undefined
      if (!row) { setError('No se encontró el prompt en la base.'); return }
      setPromptId(row.id)
      setTexto(row.prompt || '')
      setOriginal(row.prompt || '')
      setUpdatedAt(row.updated_at)
      await cargarHistorial(row.id)
    } catch (err: any) {
      setError(err?.message || 'Error al cargar el prompt')
    } finally {
      setLoading(false)
    }
  }, [cargarHistorial])

  useEffect(() => { if (admin) cargar() }, [admin, cargar])

  const guardar = async () => {
    if (promptId == null || texto === original) return
    setSaving(true); setError(''); setOkMsg('')
    try {
      const ahora = new Date().toISOString()
      const { error: upErr } = await (supabase.from('mynos_prompts') as any)
        .update({ prompt: texto, updated_at: ahora })
        .eq('id', promptId)
      if (upErr) throw upErr
      await (supabase.from('mynos_prompts_historial' as any) as any).insert({
        prompt_id: promptId,
        tipo_evento: 'edicion',
        prompt_anterior: original,
        prompt_nuevo: texto,
        usuario_id: user?.id ?? null,
        usuario_nombre: profile?.full_name ?? null,
      })
      setOriginal(texto)
      setUpdatedAt(ahora)
      setOkMsg('Prompt guardado y registrado en el historial.')
      await cargarHistorial(promptId)
    } catch (err: any) {
      setError(err?.message || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const restaurar = async (version: HistorialRow) => {
    if (promptId == null) return
    if (!window.confirm(`¿Restaurar la versión del ${new Date(version.created_at).toLocaleString('es-AR')}? El prompt actual se reemplazará (queda registrado en el historial).`)) return
    setSaving(true); setError(''); setOkMsg('')
    try {
      const ahora = new Date().toISOString()
      const { error: upErr } = await (supabase.from('mynos_prompts') as any)
        .update({ prompt: version.prompt_nuevo, updated_at: ahora })
        .eq('id', promptId)
      if (upErr) throw upErr
      await (supabase.from('mynos_prompts_historial' as any) as any).insert({
        prompt_id: promptId,
        tipo_evento: 'restauracion',
        prompt_anterior: original,
        prompt_nuevo: version.prompt_nuevo,
        restaurado_de_id: version.id,
        usuario_id: user?.id ?? null,
        usuario_nombre: profile?.full_name ?? null,
      })
      setTexto(version.prompt_nuevo)
      setOriginal(version.prompt_nuevo)
      setUpdatedAt(ahora)
      setOkMsg('Versión restaurada y registrada en el historial.')
      await cargarHistorial(promptId)
    } catch (err: any) {
      setError(err?.message || 'Error al restaurar')
    } finally {
      setSaving(false)
    }
  }

  const toggleExpand = (id: number) => {
    setExpandidos(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }
  const toggleComparar = (id: number) => {
    setComparando(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  const fmt = (s: string) => new Date(s).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
  })

  if (!admin) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
        <ShieldAlert size={40} style={{ color: '#dc2626', marginBottom: 8 }} />
        <div style={{ fontWeight: 700, color: '#111827' }}>Acceso restringido</div>
        <div style={{ fontSize: 13, marginTop: 4 }}>Este módulo es solo para administradores.</div>
      </div>
    )
  }

  const hayCambios = texto !== original
  const panelDiff: CSSProperties = {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, lineHeight: 1.6,
    whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: 'var(--bg-secondary, #f9fafb)',
    borderRadius: 8, padding: 12, maxHeight: 360, overflow: 'auto', color: '#374151',
  }

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '8px 4px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--text-primary, #111827)' }}>Prompt - Chatbot</h2>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: '#9ca3af' }}>
            Editá el prompt del chatbot. Cada cambio queda registrado en el historial.
            {updatedAt && <> · Última actualización: {fmt(updatedAt)}</>}
          </p>
        </div>
        <button onClick={cargar} disabled={loading || saving}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #e5e7eb', background: '#fff', borderRadius: 8, padding: '7px 12px', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
          <RefreshCw size={14} /> Recargar
        </button>
      </div>

      {error && <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '10px 12px', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{error}</div>}
      {okMsg && <div style={{ background: '#dcfce7', color: '#15803d', padding: '10px 12px', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{okMsg}</div>}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Cargando…</div>
      ) : (
        <>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            spellCheck={false}
            style={{
              width: '100%', minHeight: 380, resize: 'vertical', padding: '14px 16px',
              border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 13, lineHeight: 1.6,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-primary, #111827)',
              background: 'var(--card-bg, #fff)', outline: 'none',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: '#9ca3af' }}>{texto.length.toLocaleString('es-AR')} caracteres{hayCambios && ' · cambios sin guardar'}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setTexto(original)} disabled={!hayCambios || saving}
                style={{ border: '1px solid #e5e7eb', background: '#fff', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, color: '#374151', cursor: hayCambios ? 'pointer' : 'not-allowed', opacity: hayCambios ? 1 : .5 }}>
                Descartar
              </button>
              <button onClick={guardar} disabled={!hayCambios || saving}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: hayCambios ? '#dc2626' : '#f3f4f6', color: hayCambios ? '#fff' : '#9ca3af', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: hayCambios && !saving ? 'pointer' : 'not-allowed' }}>
                <Save size={14} /> {saving ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </div>

          {/* Historial */}
          <div style={{ marginTop: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <History size={16} style={{ color: '#6b7280' }} />
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--text-primary, #111827)' }}>Historial de cambios</h3>
              <span style={{ fontSize: 12, color: '#9ca3af' }}>({historial.length})</span>
            </div>
            {historial.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#9ca3af', fontSize: 13, background: 'var(--bg-secondary, #f9fafb)', borderRadius: 8 }}>
                Sin cambios registrados todavía.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {historial.map((h) => {
                  const esRestauracion = h.tipo_evento === 'restauracion'
                  const abierto = expandidos.has(h.id)
                  const comparar = comparando.has(h.id)
                  return (
                    <div key={h.id} style={{ border: '1px solid #eef0f2', borderRadius: 10, padding: '10px 12px', background: 'var(--card-bg, #fff)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: esRestauracion ? '#7c3aed' : '#2563eb', padding: '2px 8px', borderRadius: 999 }}>
                          {esRestauracion ? 'Restauración' : 'Edición'}
                        </span>
                        <span style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>{h.usuario_nombre || 'Usuario'}</span>
                        <span style={{ fontSize: 12, color: '#9ca3af' }}>· {fmt(h.created_at)}</span>
                        {esRestauracion && h.restaurado_de_id && <span style={{ fontSize: 12, color: '#9ca3af' }}>· desde versión #{h.restaurado_de_id}</span>}
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                          <button onClick={() => toggleExpand(h.id)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px solid #e5e7eb', background: '#fff', borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 600, color: '#6b7280', cursor: 'pointer' }}>
                            {abierto ? <EyeOff size={12} /> : <Eye size={12} />} {abierto ? 'Ocultar' : 'Ver'}
                          </button>
                          <button onClick={() => toggleComparar(h.id)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px solid #e5e7eb', background: comparar ? '#eff6ff' : '#fff', borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 600, color: '#2563eb', cursor: 'pointer' }}>
                            <GitCompare size={12} /> Comparar
                          </button>
                          <button onClick={() => restaurar(h)} disabled={saving}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px solid #ddd6fe', background: '#f5f3ff', borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 600, color: '#6d28d9', cursor: 'pointer' }}>
                            <RotateCcw size={12} /> Restaurar
                          </button>
                        </div>
                      </div>

                      {abierto && (
                        <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, lineHeight: 1.55, color: '#374151', background: 'var(--bg-secondary, #f9fafb)', padding: 12, borderRadius: 8, maxHeight: 320, overflow: 'auto' }}>
                          {h.prompt_nuevo}
                        </pre>
                      )}

                      {comparar && (
                        h.prompt_anterior == null ? (
                          <div style={{ marginTop: 8, fontSize: 12, color: '#9ca3af', padding: '8px 12px', background: 'var(--bg-secondary, #f9fafb)', borderRadius: 8 }}>
                            No hay versión anterior para comparar.
                          </div>
                        ) : (() => {
                          const partes = diffWords(h.prompt_anterior, h.prompt_nuevo)
                          return (
                            <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                              <div style={{ flex: '1 1 300px', minWidth: 0 }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#991b1b', marginBottom: 4 }}>Antes (en rojo lo que se quitó)</div>
                                <div style={panelDiff}>
                                  {partes.filter(p => p.t !== 'add').map((p, idx) => (
                                    <span key={idx} style={{ background: p.t === 'del' ? '#fecaca' : 'transparent', color: p.t === 'del' ? '#991b1b' : undefined }}>{p.text}</span>
                                  ))}
                                </div>
                              </div>
                              <div style={{ flex: '1 1 300px', minWidth: 0 }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#166534', marginBottom: 4 }}>Después (en verde lo que se agregó)</div>
                                <div style={panelDiff}>
                                  {partes.filter(p => p.t !== 'del').map((p, idx) => (
                                    <span key={idx} style={{ background: p.t === 'add' ? '#bbf7d0' : 'transparent', color: p.t === 'add' ? '#166534' : undefined }}>{p.text}</span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )
                        })()
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
