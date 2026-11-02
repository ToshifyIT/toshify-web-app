// src/modules/parametros/CuentasCabifySection.tsx
// Cuentas de Cabify por sede y grupo de flota (tabla public.cabify_cuentas, ITCODE-432).
// El sync de toshify-sync (sync-cabify-cuentas.ts) recorre en cada corrida las cuentas
// ACTIVAS de esta tabla: para sumar una flota o una sede se agrega una cuenta acá (y su
// usuario/clave en el env.sh del servidor); para apagarla se desactiva, sin borrar nada.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { Ban, CheckCircle, Edit2, Plus, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { DataTable } from '../../components/ui/DataTable'
import { ActionsMenu } from '../../components/ui/ActionsMenu'
import { usePermissions } from '../../contexts/PermissionsContext'
import { showError, showSuccess } from '../../utils/toast'

interface CuentaCabify {
  id: string
  codigo: string
  nombre: string
  grupo_flota_id: string | null
  sede_id: string
  tabla_destino: string
  env_usuario: string
  env_password: string
  orden: number
  activa: boolean
  notas: string | null
}

interface Opcion { id: string; nombre: string }

const TABLAS = [
  { value: 'cabify_historico', label: 'cabify_historico (Buenos Aires)' },
  { value: 'cabify_historico_bariloche', label: 'cabify_historico_bariloche (Bariloche)' },
]

const FORM_VACIO = {
  codigo: '',
  nombre: '',
  grupo_flota_id: '',
  sede_id: '',
  tabla_destino: 'cabify_historico',
  env_usuario: '',
  env_password: '',
  orden: 1,
  activa: true,
  notas: '',
}

export function CuentasCabifySection() {
  const { isAdmin } = usePermissions()
  const esAdmin = isAdmin()
  const [cuentas, setCuentas] = useState<CuentaCabify[]>([])
  const [grupos, setGrupos] = useState<Opcion[]>([])
  const [sedes, setSedes] = useState<Opcion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editando, setEditando] = useState<CuentaCabify | 'nueva' | null>(null)
  const [form, setForm] = useState(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true)
    const [c, g, s] = await Promise.all([
      (supabase.from('cabify_cuentas' as any) as any).select('*').order('sede_id').order('orden'),
      (supabase.from('grupos_flota') as any).select('id, razon_social').order('razon_social'),
      (supabase.from('sedes') as any).select('id, nombre').order('nombre'),
    ])
    if (c.error) {
      setError(c.error.code === '42P01'
        ? 'Falta crear la tabla cabify_cuentas (sql/cabify_cuentas.sql).'
        : 'No se pudieron cargar las cuentas de Cabify.')
      setCuentas([])
    } else {
      setError(null)
      setCuentas((c.data || []) as CuentaCabify[])
    }
    setGrupos(((g.data || []) as any[]).map(x => ({ id: x.id, nombre: x.razon_social })))
    setSedes(((s.data || []) as any[]).map(x => ({ id: x.id, nombre: x.nombre })))
    setLoading(false)
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  const nombreGrupo = useCallback((id: string | null) => grupos.find(g => g.id === id)?.nombre || 'Sin grupo', [grupos])
  const nombreSede = useCallback((id: string) => sedes.find(s => s.id === id)?.nombre || '—', [sedes])

  const cambiarEstado = useCallback(async (cuenta: CuentaCabify) => {
    const { error: e } = await (supabase.from('cabify_cuentas' as any) as any)
      .update({ activa: !cuenta.activa, updated_at: new Date().toISOString() })
      .eq('id', cuenta.id)
    if (e) { showError('No se pudo actualizar la cuenta', e.message); return }
    showSuccess(cuenta.activa ? 'Cuenta desactivada' : 'Cuenta activada', `${cuenta.nombre}: se aplica en la próxima corrida del sync`)
    void cargar()
  }, [cargar])

  const abrir = (cuenta: CuentaCabify | 'nueva') => {
    setEditando(cuenta)
    setForm(cuenta === 'nueva'
      ? { ...FORM_VACIO, sede_id: sedes[0]?.id || '' }
      : {
          codigo: cuenta.codigo,
          nombre: cuenta.nombre,
          grupo_flota_id: cuenta.grupo_flota_id || '',
          sede_id: cuenta.sede_id,
          tabla_destino: cuenta.tabla_destino,
          env_usuario: cuenta.env_usuario,
          env_password: cuenta.env_password,
          orden: cuenta.orden,
          activa: cuenta.activa,
          notas: cuenta.notas || '',
        })
  }

  const guardar = async () => {
    if (!form.codigo.trim() || !form.nombre.trim() || !form.sede_id || !form.env_usuario.trim() || !form.env_password.trim()) {
      showError('Faltan datos', 'Código, nombre, sede y las dos variables son obligatorios')
      return
    }
    setGuardando(true)
    const payload = {
      codigo: form.codigo.trim(),
      nombre: form.nombre.trim(),
      grupo_flota_id: form.grupo_flota_id || null,
      sede_id: form.sede_id,
      tabla_destino: form.tabla_destino,
      env_usuario: form.env_usuario.trim().toUpperCase(),
      env_password: form.env_password.trim().toUpperCase(),
      orden: Number(form.orden) || 1,
      activa: form.activa,
      notas: form.notas.trim() || null,
      updated_at: new Date().toISOString(),
    }
    const tabla = supabase.from('cabify_cuentas' as any) as any
    const { error: e } = editando === 'nueva'
      ? await tabla.insert(payload)
      : await tabla.update(payload).eq('id', (editando as CuentaCabify).id)
    setGuardando(false)
    if (e) { showError('No se pudo guardar la cuenta', e.message); return }
    showSuccess('Cuenta guardada', 'Se aplica en la próxima corrida del sync')
    setEditando(null)
    void cargar()
  }

  const columns = useMemo<ColumnDef<CuentaCabify>[]>(() => [
    {
      accessorKey: 'nombre',
      header: 'Cuenta',
      cell: ({ row }) => (
        <div>
          <div style={{ fontWeight: 600 }}>{row.original.nombre}</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{row.original.codigo}</div>
        </div>
      ),
    },
    { id: 'grupo', header: 'Grupo de flota', accessorFn: r => nombreGrupo(r.grupo_flota_id) },
    { id: 'sede', header: 'Sede', accessorFn: r => nombreSede(r.sede_id) },
    { accessorKey: 'tabla_destino', header: 'Tabla destino' },
    {
      id: 'variables',
      header: 'Variables del servidor',
      accessorFn: r => `${r.env_usuario} / ${r.env_password}`,
      cell: ({ row }) => (
        <code style={{ fontSize: 11 }}>{row.original.env_usuario} · {row.original.env_password}</code>
      ),
    },
    {
      id: 'estado',
      header: 'Estado',
      accessorFn: r => (r.activa ? 'Activa' : 'Inactiva'),
      cell: ({ row }) => (
        <span className={`dt-badge ${row.original.activa ? 'dt-badge-green' : 'dt-badge-gray'}`}>
          {row.original.activa ? 'Activa' : 'Inactiva'}
        </span>
      ),
    },
    {
      id: 'acciones',
      header: 'Acciones',
      enableSorting: false,
      cell: ({ row }) => (
        <ActionsMenu
          actions={[
            { icon: <Edit2 size={15} />, label: 'Editar', onClick: () => abrir(row.original), hidden: !esAdmin },
            {
              icon: row.original.activa ? <Ban size={15} /> : <CheckCircle size={15} />,
              label: row.original.activa ? 'Desactivar' : 'Activar',
              onClick: () => { void cambiarEstado(row.original) },
              variant: row.original.activa ? 'warning' : 'success',
              hidden: !esAdmin,
            },
          ]}
        />
      ),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [nombreGrupo, nombreSede, cambiarEstado, esAdmin, sedes])

  return (
    <section style={{ marginTop: 24 }}>
      <h3 className="gf-section-title" style={{ marginBottom: 4 }}>Cuentas de Cabify por sede y flota</h3>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-secondary)' }}>
        El sync de Cabify recorre las cuentas activas. Las contraseñas no se guardan acá: cada cuenta
        indica el nombre de las variables del servidor (env.sh de toshify-sync) donde están su usuario y su clave.
      </p>
      <DataTable
        data={cuentas}
        columns={columns}
        loading={loading}
        error={error}
        pageSize={100}
        showSearch={false}
        emptyTitle="Sin cuentas de Cabify"
        emptyDescription="Agregá la primera cuenta para que el sync la recorra"
        headerAction={esAdmin ? (
          <button className="btn-primary" onClick={() => abrir('nueva')}>
            <Plus size={16} /> Nueva cuenta
          </button>
        ) : undefined}
      />

      {editando && (
        <div className="modal-overlay" onClick={() => !guardando && setEditando(null)}>
          <div className="modal-content" style={{ maxWidth: 620 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editando === 'nueva' ? 'Nueva cuenta de Cabify' : `Editar ${editando.nombre}`}</h2>
              <button className="modal-close" onClick={() => !guardando && setEditando(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Código *</label>
                  <input className="form-input" value={form.codigo} onChange={e => setForm({ ...form, codigo: e.target.value })} placeholder="Ej: 44dreams" />
                </div>
                <div className="form-group">
                  <label className="form-label">Nombre *</label>
                  <input className="form-input" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Cabify 44 Dreams" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Grupo de flota</label>
                  <select className="form-input" value={form.grupo_flota_id} onChange={e => setForm({ ...form, grupo_flota_id: e.target.value })}>
                    <option value="">Sin grupo</option>
                    {grupos.map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Sede *</label>
                  <select className="form-input" value={form.sede_id} onChange={e => setForm({ ...form, sede_id: e.target.value })}>
                    {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Tabla destino</label>
                  <select className="form-input" value={form.tabla_destino} onChange={e => setForm({ ...form, tabla_destino: e.target.value })}>
                    {TABLAS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Orden</label>
                  <input className="form-input" type="number" min={1} value={form.orden} onChange={e => setForm({ ...form, orden: Number(e.target.value) })} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Variable del usuario *</label>
                  <input className="form-input" value={form.env_usuario} onChange={e => setForm({ ...form, env_usuario: e.target.value })} placeholder="Ej: CABIFY_USERNAME_44" />
                </div>
                <div className="form-group">
                  <label className="form-label">Variable de la contraseña *</label>
                  <input className="form-input" value={form.env_password} onChange={e => setForm({ ...form, env_password: e.target.value })} placeholder="Ej: CABIFY_PASSWORD_44" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Notas</label>
                <input className="form-input" value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={form.activa} onChange={e => setForm({ ...form, activa: e.target.checked })} />
                Activa (el sync la recorre)
              </label>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setEditando(null)} disabled={guardando}>Cancelar</button>
              <button className="btn-primary" onClick={() => { void guardar() }} disabled={guardando}>
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
