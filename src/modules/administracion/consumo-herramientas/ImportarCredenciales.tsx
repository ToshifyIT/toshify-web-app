// src/modules/administracion/consumo-herramientas/ImportarCredenciales.tsx
// Importar credenciales desde el Excel de la planilla «Credenciales Administrador» (2026-11-17).
// Todo pasa en el navegador: se lee el .xlsx, se reconocen las columnas por su encabezado,
// cada fila se asocia a una herramienta (por URL, usuario y nombre) y, al confirmar, las
// contraseñas se cifran con el PIN del baúl antes de guardarse. Las contraseñas nunca se
// muestran en la vista previa ni salen del navegador sin cifrar.

import { useEffect, useMemo, useState } from 'react'
import { FileSpreadsheet, KeyRound, Lock, Upload } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import type { Herramienta } from './types'
import type { ConfigBaul } from './baul'
import { abrirBaul, baulAbierto, cifrar, esperaRestante } from './baul'
import { showError, showSuccess } from '../../../utils/toast'

type Campo = 'nombre' | 'usuario' | 'password' | 'url' | 'totp' | 'notas'

const CAMPOS: { id: Campo; etiqueta: string; patron: RegExp; requerido?: boolean }[] = [
  { id: 'nombre', etiqueta: 'Herramienta', patron: /herramienta|plataforma|servicio|aplicaci|app|sistema|sitio|nombre|cuenta|descrip/i },
  { id: 'usuario', etiqueta: 'Usuario', patron: /usuario|user|correo|e-?mail|mail|login/i, requerido: true },
  { id: 'password', etiqueta: 'Contraseña', patron: /contrase|clave|password|pass|pwd/i, requerido: true },
  { id: 'url', etiqueta: 'URL', patron: /url|link|enlace|p[aá]gina|web|direcci/i },
  { id: 'totp', etiqueta: '2FA / códigos', patron: /2fa|totp|token|c[oó]digo|backup|respaldo/i },
  { id: 'notas', etiqueta: 'Notas', patron: /nota|observ|coment|detalle/i },
]

const PIN_VALIDO = /^\d{4}$/
const soloDigitos = (v: string) => v.replace(/\D/g, '').slice(0, 4)
const normalizar = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const dominio = (v: string | null | undefined) => {
  if (!v) return ''
  try { return new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`).hostname.replace(/^www\./, '').toLowerCase() } catch { return '' }
}
/** "partners.cabify.com" → "cabify" (para comparar sin subdominios) */
const raizDominio = (d: string) => d.split('.').slice(-2, -1)[0] || d

interface FilaImport {
  idx: number
  valores: Partial<Record<Campo, string>>
  herramientaId: string
}

/** Mejor herramienta para una fila del Excel ('' si no hay ninguna razonable) */
function asociar(v: Partial<Record<Campo, string>>, herramientas: Herramienta[]): string {
  const usuario = normalizar(v.usuario || '')
  const nombre = normalizar(v.nombre || '')
  const dom = dominio(v.url)
  let mejor = { id: '', puntos: 0 }
  for (const h of herramientas) {
    let puntos = 0
    const hDom = dominio(h.url_acceso || h.url_facturacion)
    if (dom && hDom) {
      if (dom === hDom) puntos += 4
      else if (raizDominio(dom) === raizDominio(hDom)) puntos += 3
    }
    if (usuario && normalizar(h.cuenta_acceso || '') === usuario) puntos += 3
    const hNombre = normalizar(h.nombre)
    const app = normalizar(h.nombre.split(/\s+[–-]\s+/)[0])
    if (nombre) {
      if (hNombre === nombre) puntos += 5
      else if (nombre.includes(app) || app.includes(nombre)) puntos += 2
      const resto = normalizar(h.nombre.split(/\s+[–-]\s+/)[1] || '')
      if (resto && (nombre.includes(resto) || usuario.includes(resto))) puntos += 2
    }
    if (puntos > mejor.puntos) mejor = { id: h.id, puntos }
  }
  return mejor.puntos >= 3 ? mejor.id : ''
}

interface ImportarCredencialesModalProps {
  herramientas: Herramienta[]
  onClose: () => void
  onImportado: () => void
}

export function ImportarCredencialesModal({ herramientas, onClose, onImportado }: ImportarCredencialesModalProps) {
  const [config, setConfig] = useState<ConfigBaul | null | undefined>(undefined)
  const [abierto, setAbierto] = useState(baulAbierto())
  const [pin, setPin] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const [archivo, setArchivo] = useState('')
  const [tabla, setTabla] = useState<string[][]>([])
  const [filaEncabezado, setFilaEncabezado] = useState(0)
  const [mapa, setMapa] = useState<Partial<Record<Campo, number>>>({})
  const [filas, setFilas] = useState<FilaImport[]>([])
  const [conCredenciales, setConCredenciales] = useState<Set<string>>(new Set())

  useEffect(() => {
    Promise.all([
      supabase.from('herramientas_baul').select('sal, iteraciones, verificador, verificador_iv').maybeSingle(),
      supabase.from('herramientas_credenciales').select('herramienta_id'),
    ]).then(([b, c]) => {
      setConfig(b.error ? null : ((b.data as ConfigBaul | null) ?? null))
      setConCredenciales(new Set(((c.data ?? []) as { herramienta_id: string }[]).map(x => x.herramienta_id)))
    })
  }, [])

  const encabezados = tabla[filaEncabezado] ?? []

  // Cuando cambia el encabezado o el mapeo, se arman las filas y se asocian
  useEffect(() => {
    if (!tabla.length) { setFilas([]); return }
    const nuevas: FilaImport[] = []
    tabla.slice(filaEncabezado + 1).forEach((celdas, i) => {
      const valores: Partial<Record<Campo, string>> = {}
      ;(Object.keys(mapa) as Campo[]).forEach(c => {
        const col = mapa[c]
        if (col !== undefined && col >= 0) valores[c] = String(celdas[col] ?? '').trim()
      })
      if (!valores.usuario && !valores.password) return
      nuevas.push({ idx: filaEncabezado + 2 + i, valores, herramientaId: asociar(valores, herramientas) })
    })
    setFilas(nuevas)
  }, [tabla, filaEncabezado, mapa, herramientas])

  const detectarMapa = (cab: string[]) => {
    const m: Partial<Record<Campo, number>> = {}
    const usadas = new Set<number>()
    // Primero los más específicos (contraseña, usuario, url) para que "nombre" no se los lleve
    for (const id of ['password', 'usuario', 'url', 'totp', 'notas', 'nombre'] as Campo[]) {
      const campo = CAMPOS.find(c => c.id === id)!
      const col = cab.findIndex((t, i) => !usadas.has(i) && campo.patron.test(t))
      if (col >= 0) { m[id] = col; usadas.add(col) }
    }
    // Sin columna de nombre: se usa la primera columna libre
    if (m.nombre === undefined) {
      const libre = cab.findIndex((t, i) => !usadas.has(i) && String(t).trim() !== '')
      if (libre >= 0) m.nombre = libre
    }
    return m
  }

  const leerExcel = async (f: File) => {
    try {
      const XLSX = await import('xlsx')
      const libro = XLSX.read(await f.arrayBuffer(), { type: 'array' })
      const hoja = libro.Sheets[libro.SheetNames[0]]
      const datos = (XLSX.utils.sheet_to_json(hoja, { header: 1, raw: false, defval: '' }) as unknown[][])
        .map(r => r.map(c => String(c ?? '')))
        .filter(r => r.some(c => c.trim() !== ''))
      if (!datos.length) { showError('El Excel está vacío'); return }
      // Encabezado: la primera fila que tenga algo como "usuario" y algo como "contraseña"
      const usuarioRe = CAMPOS.find(c => c.id === 'usuario')!.patron
      const passRe = CAMPOS.find(c => c.id === 'password')!.patron
      const enc = datos.findIndex(r => r.some(c => usuarioRe.test(c)) && r.some(c => passRe.test(c)))
      const filaEnc = enc >= 0 ? enc : 0
      setArchivo(f.name)
      setTabla(datos)
      setFilaEncabezado(filaEnc)
      setMapa(detectarMapa(datos[filaEnc]))
    } catch (error) {
      console.error('No se pudo leer el Excel:', error)
      showError('No se pudo leer el Excel. ¿Es un .xlsx?')
    }
  }

  const abrir = async () => {
    if (!config || !PIN_VALIDO.test(pin)) return
    setTrabajando(true)
    try {
      const espera = esperaRestante()
      if (espera > 0) { showError(`Demasiados intentos. Esperá ${espera} s.`); return }
      const ok = await abrirBaul(pin, config)
      setPin('')
      if (!ok) { showError(esperaRestante() > 0 ? `PIN incorrecto. Esperá ${esperaRestante()} s.` : 'PIN incorrecto'); return }
      setAbierto(true)
    } finally {
      setTrabajando(false)
    }
  }

  const aImportar = filas.filter(f => f.herramientaId && f.valores.password)
  const repetidas = useMemo(() => {
    const vistos = new Map<string, number>()
    aImportar.forEach(f => vistos.set(f.herramientaId, (vistos.get(f.herramientaId) || 0) + 1))
    return new Set([...vistos].filter(([, n]) => n > 1).map(([id]) => id))
  }, [aImportar])

  const importar = async () => {
    if (!baulAbierto()) { setAbierto(false); showError('Abrí el baúl para importar'); return }
    if (repetidas.size) { showError('Hay herramientas elegidas en más de una fila: dejá una sola'); return }
    setTrabajando(true)
    try {
      const { data: u } = await supabase.auth.getUser()
      const cif = async (v?: string) => (v && v.trim() ? cifrar(v.trim()) : null)
      const registros = await Promise.all(aImportar.map(async f => {
        const [p, t, n] = await Promise.all([cif(f.valores.password), cif(f.valores.totp), cif(f.valores.notas)])
        const h = herramientas.find(x => x.id === f.herramientaId)
        return {
          herramienta_id: f.herramientaId,
          usuario: f.valores.usuario?.trim() || h?.cuenta_acceso || null,
          password_cifrada: p?.cifrado ?? null, password_iv: p?.iv ?? null,
          totp_cifrado: t?.cifrado ?? null, totp_iv: t?.iv ?? null,
          notas_cifradas: n?.cifrado ?? null, notas_iv: n?.iv ?? null,
          actualizado_en: new Date().toISOString(),
          actualizado_por: u.user?.id ?? null,
        }
      }))
      const { error } = await supabase.from('herramientas_credenciales').upsert(registros)
      if (error) throw error
      if (u.user) {
        const { error: e2 } = await supabase.from('herramientas_credenciales_accesos')
          .insert(registros.map(r => ({ herramienta_id: r.herramienta_id, user_id: u.user!.id, accion: 'editar' })))
        if (e2) console.error('No se pudo registrar la importación:', e2)
      }
      showSuccess(`${registros.length} credenciales importadas`)
      onImportado()
    } catch (error) {
      console.error('No se pudieron importar las credenciales:', error)
      showError('No se pudieron importar las credenciales')
    } finally {
      setTrabajando(false)
    }
  }

  const sel = { height: 30, fontSize: 12, padding: '0 6px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)', background: 'var(--bg-primary)', color: 'var(--text-primary)', maxWidth: '100%' } as const
  const ordenadas = useMemo(() => [...herramientas].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')), [herramientas])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 900 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <h2>Importar credenciales</h2>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Desde el Excel de credenciales · se cifran en tu navegador</span>
          </div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          {config === undefined ? (
            <div style={{ padding: 16, color: 'var(--text-tertiary)' }}>Cargando...</div>
          ) : config === null ? (
            <div style={{ display: 'flex', gap: 8, fontSize: 13 }}>
              <Lock size={18} style={{ flexShrink: 0 }} />
              <span>Todavía no hay baúl. Crealo primero desde el candado de cualquier herramienta (definís el PIN de 4 dígitos) y después volvé a importar.</span>
            </div>
          ) : !abierto ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 10, borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)' }}>
              <KeyRound size={16} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 13 }}>Abrí el baúl para importar:</span>
              <input className="form-input" style={{ width: 120, letterSpacing: 6 }} type="password" inputMode="numeric" maxLength={4} placeholder="PIN" autoFocus
                value={pin} onChange={e => setPin(soloDigitos(e.target.value))} autoComplete="off"
                onKeyDown={e => { if (e.key === 'Enter' && pin.length === 4) abrir() }} />
              <button className="btn-primary" onClick={abrir} disabled={trabajando || pin.length !== 4}>{trabajando ? 'Abriendo...' : 'Abrir'}</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 14, border: '1px dashed var(--border-primary)', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>
                {archivo ? <FileSpreadsheet size={20} /> : <Upload size={20} />}
                <span style={{ fontSize: 13 }}>
                  {archivo ? <><strong>{archivo}</strong> · {filas.length} filas con usuario o contraseña</> : 'Elegí el Excel (.xlsx) de credenciales, tal cual está'}
                </span>
                <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) leerExcel(f); e.target.value = '' }} />
              </label>

              {tabla.length > 0 && (
                <>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 12 }}>
                    <span style={{ color: 'var(--text-tertiary)' }}>Columnas:</span>
                    {CAMPOS.map(c => (
                      <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {c.etiqueta}
                        <select style={sel} value={mapa[c.id] ?? -1} onChange={e => setMapa(m => ({ ...m, [c.id]: Number(e.target.value) }))}>
                          <option value={-1}>—</option>
                          {encabezados.map((t, i) => <option key={i} value={i}>{t || `Columna ${i + 1}`}</option>)}
                        </select>
                      </label>
                    ))}
                  </div>

                  <div style={{ maxHeight: 380, overflow: 'auto', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ position: 'sticky', top: 0, background: 'var(--bg-secondary)' }}>
                          {['Fila', 'En el Excel', 'Usuario', 'Contraseña', 'Va a la herramienta'].map(t => (
                            <th key={t} style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600, color: 'var(--text-tertiary)' }}>{t}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filas.map(f => {
                          const repetida = !!f.herramientaId && repetidas.has(f.herramientaId)
                          return (
                            <tr key={f.idx} style={{ borderTop: '1px solid var(--border-primary)', opacity: f.herramientaId ? 1 : 0.6 }}>
                              <td style={{ padding: '6px 8px', color: 'var(--text-tertiary)' }}>{f.idx}</td>
                              <td style={{ padding: '6px 8px' }}>
                                <div>{f.valores.nombre || '-'}</div>
                                {f.valores.url && <div style={{ color: 'var(--text-tertiary)' }}>{dominio(f.valores.url) || f.valores.url}</div>}
                              </td>
                              <td style={{ padding: '6px 8px', overflowWrap: 'anywhere' }}>{f.valores.usuario || '-'}</td>
                              <td style={{ padding: '6px 8px' }}>{f.valores.password ? '••••••••' : <span style={{ color: 'var(--text-tertiary)' }}>vacía</span>}</td>
                              <td style={{ padding: '6px 8px' }}>
                                <select style={{ ...sel, borderColor: repetida ? 'var(--color-danger)' : undefined }} value={f.herramientaId}
                                  onChange={e => setFilas(fs => fs.map(x => (x.idx === f.idx ? { ...x, herramientaId: e.target.value } : x)))}>
                                  <option value="">No importar</option>
                                  {ordenadas.map(h => <option key={h.id} value={h.id}>{h.nombre}</option>)}
                                </select>
                                {f.herramientaId && conCredenciales.has(f.herramientaId) && (
                                  <div style={{ color: '#b45309', fontSize: 11 }}>Ya tiene: se reemplaza</div>
                                )}
                                {repetida && <div style={{ color: 'var(--color-danger)', fontSize: 11 }}>Elegida en otra fila</div>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    Las filas sin herramienta no se importan. Las que no tienen herramienta en Toshibase se pueden crear con «Nueva herramienta» y volver a importar.
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={trabajando}>Cancelar</button>
          {abierto && config && (
            <button className="btn-primary" onClick={importar} disabled={trabajando || aImportar.length === 0 || repetidas.size > 0}>
              {trabajando ? 'Importando...' : `Importar ${aImportar.length}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
