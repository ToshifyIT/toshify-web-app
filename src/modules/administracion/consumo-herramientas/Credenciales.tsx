// src/modules/administracion/consumo-herramientas/Credenciales.tsx
// Credenciales de una herramienta: usuario a la vista, contraseña / 2FA / notas
// cifrados en el navegador (ver baul.ts). Se ven con el ojito tras abrir el baúl
// con su clave; cada vez que alguien ve, copia o cambia algo queda registrado.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Copy, Eye, EyeOff, KeyRound, Lock, Pencil } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import type { Herramienta } from './types'
import type { Cifrado, ConfigBaul } from './baul'
import { abrirBaul, baulAbierto, cerrarBaul, cifrar, crearBaul, descifrar, esperaRestante } from './baul'
import { showError, showSuccess } from '../../../utils/toast'
import { formatFechaHora } from '../../../utils/format'

const MOSTRAR_MS = 30_000
/** PIN del baúl: 4 dígitos */
const PIN_VALIDO = /^\d{4}$/
const soloDigitos = (v: string) => v.replace(/\D/g, '').slice(0, 4)

interface FilaCredencial {
  herramienta_id: string
  usuario: string | null
  password_cifrada: string | null
  password_iv: string | null
  totp_cifrado: string | null
  totp_iv: string | null
  notas_cifradas: string | null
  notas_iv: string | null
  actualizado_en: string
}

interface Acceso {
  creado_en: string
  accion: string
  user_profiles: { full_name: string | null; email: string | null } | null
}

type Campo = 'password' | 'totp' | 'notas'

const ETIQUETA_ACCION: Record<string, string> = {
  ver: 'vio', copiar: 'copió', editar: 'cambió', crear_baul: 'creó el baúl',
}

function cifradoDe(fila: FilaCredencial | null, campo: Campo): Cifrado | null {
  if (!fila) return null
  const [c, iv] = campo === 'password'
    ? [fila.password_cifrada, fila.password_iv]
    : campo === 'totp' ? [fila.totp_cifrado, fila.totp_iv] : [fila.notas_cifradas, fila.notas_iv]
  return c && iv ? { cifrado: c, iv } : null
}

interface CredencialesModalProps {
  herramienta: Herramienta
  onClose: () => void
}

export function CredencialesModal({ herramienta, onClose }: CredencialesModalProps) {
  const [cargando, setCargando] = useState(true)
  const [config, setConfig] = useState<ConfigBaul | null>(null)
  const [fila, setFila] = useState<FilaCredencial | null>(null)
  const [accesos, setAccesos] = useState<Acceso[]>([])
  const [abierto, setAbierto] = useState(baulAbierto())
  const [clave, setClave] = useState('')
  const [clave2, setClave2] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const [pendiente, setPendiente] = useState<{ campo: Campo; accion: 'ver' | 'copiar' } | null>(null)
  const [visibles, setVisibles] = useState<Partial<Record<Campo, string>>>({})
  const [editando, setEditando] = useState(false)
  const [form, setForm] = useState({ usuario: '', password: '', totp: '', notas: '' })
  const [verPassForm, setVerPassForm] = useState(false)
  const timers = useRef<Partial<Record<Campo, ReturnType<typeof setTimeout>>>>({})

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const [b, c, a] = await Promise.all([
        supabase.from('herramientas_baul').select('sal, iteraciones, verificador, verificador_iv').maybeSingle(),
        supabase.from('herramientas_credenciales').select('*').eq('herramienta_id', herramienta.id).maybeSingle(),
        supabase.from('herramientas_credenciales_accesos')
          .select('creado_en, accion, user_profiles(full_name, email)')
          .eq('herramienta_id', herramienta.id)
          .order('creado_en', { ascending: false })
          .limit(8),
      ])
      if (b.error) throw b.error
      if (c.error) throw c.error
      setConfig((b.data as ConfigBaul | null) ?? null)
      setFila((c.data as FilaCredencial | null) ?? null)
      setAccesos(a.error ? [] : ((a.data ?? []) as unknown as Acceso[]))
    } catch (error) {
      console.error('No se pudieron cargar las credenciales:', error)
      showError('No se pudieron cargar las credenciales')
    } finally {
      setCargando(false)
    }
  }, [herramienta.id])

  useEffect(() => { cargar() }, [cargar])

  // Al cerrar el modal se ocultan los valores visibles
  useEffect(() => {
    const t = timers.current
    return () => { Object.values(t).forEach(x => x && clearTimeout(x)) }
  }, [])

  const registrar = async (accion: 'ver' | 'copiar' | 'editar' | 'crear_baul') => {
    const { data: u } = await supabase.auth.getUser()
    if (!u.user) return
    const { error } = await supabase.from('herramientas_credenciales_accesos').insert({
      herramienta_id: accion === 'crear_baul' ? null : herramienta.id,
      user_id: u.user.id,
      accion,
    })
    if (error) console.error('No se pudo registrar el acceso:', error)
  }

  const mostrarTemporal = (campo: Campo, valor: string) => {
    setVisibles(prev => ({ ...prev, [campo]: valor }))
    if (timers.current[campo]) clearTimeout(timers.current[campo])
    timers.current[campo] = setTimeout(() => {
      setVisibles(prev => { const n = { ...prev }; delete n[campo]; return n })
    }, MOSTRAR_MS)
  }

  const ejecutar = async (campo: Campo, accion: 'ver' | 'copiar') => {
    const c = cifradoDe(fila, campo)
    if (!c) return
    try {
      const valor = await descifrar(c)
      if (accion === 'ver') {
        mostrarTemporal(campo, valor)
      } else {
        await navigator.clipboard.writeText(valor)
        showSuccess('Copiado al portapapeles')
      }
      await registrar(accion)
    } catch (error) {
      console.error('No se pudo descifrar:', error)
      showError('No se pudo descifrar. Volvé a abrir el baúl.')
      cerrarBaul()
      setAbierto(false)
    }
  }

  const pedir = (campo: Campo, accion: 'ver' | 'copiar') => {
    if (accion === 'ver' && visibles[campo] !== undefined) {
      setVisibles(prev => { const n = { ...prev }; delete n[campo]; return n })
      return
    }
    if (baulAbierto()) { ejecutar(campo, accion); return }
    setPendiente({ campo, accion })
    setAbierto(false)
  }

  const abrir = async () => {
    if (!config || !clave) return
    setTrabajando(true)
    try {
      const espera = esperaRestante()
      if (espera > 0) { showError(`Demasiados intentos. Esperá ${espera} s.`); return }
      const ok = await abrirBaul(clave, config)
      if (!ok) {
        const e = esperaRestante()
        showError(e > 0 ? `PIN incorrecto. Demasiados intentos: esperá ${e} s.` : 'PIN incorrecto')
        setClave('')
        return
      }
      setClave('')
      // Si se estaba por editar, primero se descifran los valores actuales para no pisarlos con vacíos
      if (editando && !pendiente) await empezarEdicion()
      setAbierto(true)
      if (pendiente) { const p = pendiente; setPendiente(null); await ejecutar(p.campo, p.accion) }
    } finally {
      setTrabajando(false)
    }
  }

  const crear = async () => {
    if (!PIN_VALIDO.test(clave)) { showError('El PIN del baúl son 4 dígitos'); return }
    if (clave !== clave2) { showError('Los dos PIN no coinciden'); return }
    setTrabajando(true)
    try {
      const nueva = await crearBaul(clave)
      const { data: u } = await supabase.auth.getUser()
      const { error } = await supabase.from('herramientas_baul').insert({ id: 1, ...nueva, creado_por: u.user?.id ?? null })
      if (error) throw error
      await registrar('crear_baul')
      setClave(''); setClave2('')
      setConfig(nueva)
      setAbierto(true)
      showSuccess('Baúl creado')
    } catch (error) {
      console.error('No se pudo crear el baúl:', error)
      cerrarBaul()
      showError('No se pudo crear el baúl')
    } finally {
      setTrabajando(false)
    }
  }

  const empezarEdicion = async () => {
    if (!baulAbierto()) { setAbierto(false); setPendiente(null); showError('Abrí el baúl para editar'); return }
    try {
      const [p, t, n] = await Promise.all((['password', 'totp', 'notas'] as Campo[]).map(campo => {
        const c = cifradoDe(fila, campo)
        return c ? descifrar(c) : Promise.resolve('')
      }))
      setForm({ usuario: fila?.usuario ?? herramienta.cuenta_acceso ?? '', password: p, totp: t, notas: n })
      setEditando(true)
    } catch (error) {
      console.error('No se pudo descifrar para editar:', error)
      showError('No se pudo descifrar. Volvé a abrir el baúl.')
      cerrarBaul(); setAbierto(false)
    }
  }

  const guardar = async () => {
    setTrabajando(true)
    try {
      const cif = async (v: string) => (v.trim() ? cifrar(v) : null)
      const [p, t, n] = await Promise.all([cif(form.password), cif(form.totp), cif(form.notas)])
      const { data: u } = await supabase.auth.getUser()
      const { error } = await supabase.from('herramientas_credenciales').upsert({
        herramienta_id: herramienta.id,
        usuario: form.usuario.trim() || null,
        password_cifrada: p?.cifrado ?? null, password_iv: p?.iv ?? null,
        totp_cifrado: t?.cifrado ?? null, totp_iv: t?.iv ?? null,
        notas_cifradas: n?.cifrado ?? null, notas_iv: n?.iv ?? null,
        actualizado_en: new Date().toISOString(),
        actualizado_por: u.user?.id ?? null,
      })
      if (error) throw error
      await registrar('editar')
      setForm({ usuario: '', password: '', totp: '', notas: '' })
      setVisibles({})
      setEditando(false)
      showSuccess('Credenciales guardadas')
      await cargar()
    } catch (error) {
      console.error('No se pudieron guardar las credenciales:', error)
      showError('No se pudieron guardar las credenciales')
    } finally {
      setTrabajando(false)
    }
  }

  const usuario = fila?.usuario ?? herramienta.cuenta_acceso
  const pideClave = !!config && !abierto && (pendiente !== null || editando)
  const btnIcono = { background: 'none', border: 0, padding: 4, cursor: 'pointer', color: 'var(--text-secondary)', display: 'inline-flex' } as const

  const filaSecreta = (campo: Campo, etiqueta: string) => {
    const tiene = !!cifradoDe(fila, campo)
    const visible = visibles[campo]
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border-primary)' }}>
        <span style={{ width: 110, fontSize: 12, color: 'var(--text-tertiary)' }}>{etiqueta}</span>
        <span style={{ flex: 1, fontSize: 13, fontFamily: visible !== undefined ? 'monospace' : undefined, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {!tiene ? <span style={{ color: 'var(--text-tertiary)' }}>Sin cargar</span> : visible !== undefined ? visible : '••••••••••'}
        </span>
        {tiene && (
          <>
            <button type="button" style={btnIcono} title={visible !== undefined ? 'Ocultar' : 'Ver (se oculta a los 30 s)'} onClick={() => pedir(campo, 'ver')}>
              {visible !== undefined ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
            <button type="button" style={btnIcono} title="Copiar" onClick={() => pedir(campo, 'copiar')}>
              <Copy size={16} />
            </button>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <h2>Credenciales</h2>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{herramienta.nombre}</span>
          </div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          {cargando ? (
            <div style={{ padding: 16, color: 'var(--text-tertiary)' }}>Cargando...</div>
          ) : !config ? (
            // ── Baúl todavía no creado
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13 }}>
                <Lock size={18} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>
                  Todavía no hay baúl. Definí el <strong>PIN del baúl</strong> (4 dígitos): con él se cifran las
                  contraseñas en tu navegador. Toshibase no lo guarda, así que <strong>si se olvida no se pueden
                  recuperar</strong> las contraseñas. Compartilo solo con Karen, Sara y Josué, en persona.
                </span>
              </div>
              <input className="form-input" type="password" inputMode="numeric" maxLength={4} placeholder="PIN del baúl (4 dígitos)"
                value={clave} onChange={e => setClave(soloDigitos(e.target.value))} autoComplete="new-password" />
              <input className="form-input" type="password" inputMode="numeric" maxLength={4} placeholder="Repetir el PIN"
                value={clave2} onChange={e => setClave2(soloDigitos(e.target.value))} autoComplete="new-password"
                onKeyDown={e => { if (e.key === 'Enter') crear() }} />
              <div><button className="btn-primary" onClick={crear} disabled={trabajando}>{trabajando ? 'Creando...' : 'Crear baúl'}</button></div>
            </div>
          ) : (
            <>
              {pideClave && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 10, marginBottom: 12, borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)' }}>
                  <KeyRound size={16} style={{ flexShrink: 0 }} />
                  <input className="form-input" style={{ flex: 1, letterSpacing: 6 }} type="password" inputMode="numeric" maxLength={4}
                    placeholder="PIN del baúl" autoFocus
                    value={clave} onChange={e => setClave(soloDigitos(e.target.value))} autoComplete="off"
                    onKeyDown={e => { if (e.key === 'Enter' && clave.length === 4) abrir() }} />
                  <button className="btn-primary" onClick={abrir} disabled={trabajando || clave.length !== 4}>{trabajando ? 'Abriendo...' : 'Abrir'}</button>
                </div>
              )}

              {editando && abierto ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div className="form-group">
                    <label className="form-label">Usuario</label>
                    <input className="form-input" value={form.usuario} onChange={e => setForm(f => ({ ...f, usuario: e.target.value }))} autoComplete="off" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Contraseña</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input className="form-input" style={{ flex: 1 }} type={verPassForm ? 'text' : 'password'} value={form.password}
                        onChange={e => setForm(f => ({ ...f, password: e.target.value }))} autoComplete="new-password" />
                      <button type="button" style={btnIcono} onClick={() => setVerPassForm(v => !v)} title={verPassForm ? 'Ocultar' : 'Ver'}>
                        {verPassForm ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Clave 2FA / códigos de respaldo (opcional)</label>
                    <input className="form-input" type="password" value={form.totp} onChange={e => setForm(f => ({ ...f, totp: e.target.value }))} autoComplete="off" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Notas privadas (opcional, se cifran)</label>
                    <textarea className="form-input" rows={3} value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    Nunca cargues números de tarjeta: solo accesos.
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border-primary)' }}>
                    <span style={{ width: 110, fontSize: 12, color: 'var(--text-tertiary)' }}>Usuario</span>
                    <span style={{ flex: 1, fontSize: 13, overflowWrap: 'anywhere' }}>{usuario || <span style={{ color: 'var(--text-tertiary)' }}>Sin cargar</span>}</span>
                    {usuario && (
                      <button type="button" style={btnIcono} title="Copiar usuario"
                        onClick={async () => { await navigator.clipboard.writeText(usuario); showSuccess('Usuario copiado') }}>
                        <Copy size={16} />
                      </button>
                    )}
                  </div>
                  {filaSecreta('password', 'Contraseña')}
                  {filaSecreta('totp', '2FA')}
                  {filaSecreta('notas', 'Notas')}
                  {fila && (
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>
                      Actualizado {formatFechaHora(fila.actualizado_en)}
                    </div>
                  )}
                </>
              )}

              {!editando && accesos.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 6 }}>
                    Últimos accesos
                  </div>
                  {accesos.map((a, i) => (
                    <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '2px 0' }}>
                      {formatFechaHora(a.creado_en)} · {a.user_profiles?.full_name || a.user_profiles?.email || 'Alguien'} {ETIQUETA_ACCION[a.accion] ?? a.accion}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <div className="modal-footer">
          {config && abierto && (
            <button className="btn-secondary" style={{ marginRight: 'auto' }} onClick={() => { cerrarBaul(); setAbierto(false); setVisibles({}); setEditando(false) }}
              title="Olvida el PIN del baúl en este navegador">
              <Lock size={14} style={{ marginRight: 4, verticalAlign: -2 }} /> Cerrar baúl
            </button>
          )}
          {editando ? (
            <>
              <button className="btn-secondary" onClick={() => { setEditando(false); setForm({ usuario: '', password: '', totp: '', notas: '' }) }} disabled={trabajando}>Cancelar</button>
              <button className="btn-primary" onClick={guardar} disabled={trabajando || !abierto}>{trabajando ? 'Guardando...' : 'Guardar'}</button>
            </>
          ) : (
            <>
              {config && (
                <button className="btn-secondary" onClick={() => { if (baulAbierto()) empezarEdicion(); else { setEditando(true); setAbierto(false) } }}>
                  <Pencil size={14} style={{ marginRight: 4, verticalAlign: -2 }} /> {fila ? 'Cambiar' : 'Cargar credenciales'}
                </button>
              )}
              <button className="btn-secondary" onClick={onClose}>Cerrar</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
