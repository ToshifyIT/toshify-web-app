// src/modules/promociones/PromocionesModule.tsx
// Parámetros > Promociones. Lista las promociones del catálogo del código
// (catalogoPromociones.ts): se activan / desactivan y se edita el código, la descripción y el
// período (desde / hasta). No se crean ni se borran desde acá. Cada cambio queda en el
// historial (quién y cuándo), que se ve en el detalle.

import { useState, useEffect, useMemo } from 'react'
import { Tag, CheckCircle, Clock, XCircle, Eye, Edit2, X, History } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { useAuth } from '../../contexts/AuthContext'
import { usePermissions } from '../../contexts/PermissionsContext'
import { confirmar } from '../../components/ui/alertas'
import { showError, showSuccess, showWarning } from '../../utils/toast'
import { formatFechaHoraART } from '../../utils/fechaArgentina'
import { definicionPromocion } from './catalogoPromociones'
import {
  actualizarPromocion, cargarHistorialPromocion, cargarPromociones, estadoPromocion, FORMATO_CODIGO_PROMOCION,
} from './promocionesService'
import type { EstadoPromocion, PromocionHistorial, PromocionRegistro } from './promocionesService'
import { DataTable } from '../../components/ui/DataTable'
import { StatsGrid } from '../../components/ui/StatsGrid'
import '../../styles/modules.css'
import './PromocionesModule.css'

const ETIQUETA_ESTADO: Record<EstadoPromocion, string> = {
  vigente: 'Vigente',
  programada: 'Programada',
  finalizada: 'Finalizada',
  desactivada: 'Desactivada',
}

const ETIQUETA_CAMBIO: Record<string, string> = {
  alta: 'Alta',
  codigo: 'Código',
  activada: 'Activada',
  desactivada: 'Desactivada',
  fechas: 'Período',
  descripcion: 'Descripción',
}

function etiquetaCambio(cambio: string | null): string {
  if (!cambio) return 'Cambio'
  return cambio.split(',').map(c => ETIQUETA_CAMBIO[c.trim()] || c.trim()).join(' · ')
}

/** "YYYY-MM-DD" → "DD/MM/YYYY" (sin pasar por Date: es una fecha, no un instante). */
function formatFecha(fecha: string | null): string {
  if (!fecha) return '-'
  const [y, m, d] = fecha.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

/** Descripción guardada; si todavía no tiene, la del catálogo del código. */
function descripcionDe(p: PromocionRegistro): string {
  return p.descripcion || definicionPromocion(p.clave)?.descripcionInicial || ''
}

export function PromocionesModule() {
  const { user, profile } = useAuth()
  const { canEditInSubmenu } = usePermissions()
  const puedeEditar = canEditInSubmenu('promociones')

  const [promociones, setPromociones] = useState<PromocionRegistro[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filtro, setFiltro] = useState<EstadoPromocion | null>(null)
  const [cambiandoId, setCambiandoId] = useState<string | null>(null)

  const [editando, setEditando] = useState<PromocionRegistro | null>(null)
  const [form, setForm] = useState({ codigo: '', descripcion: '', inicio: '', fin: '' })
  const [guardando, setGuardando] = useState(false)

  const [detalle, setDetalle] = useState<PromocionRegistro | null>(null)
  const [historial, setHistorial] = useState<PromocionHistorial[]>([])
  const [cargandoHistorial, setCargandoHistorial] = useState(false)

  const usuario = { id: user?.id ?? null, nombre: profile?.full_name || profile?.email || null }

  useEffect(() => {
    cargar()
  }, [])

  async function cargar() {
    setLoading(true)
    setError('')
    try {
      setPromociones(await cargarPromociones())
    } catch (err: any) {
      console.error('Error cargando promociones:', err)
      setError(err.message || 'Error al cargar las promociones')
    } finally {
      setLoading(false)
    }
  }

  function reemplazar(actualizada: PromocionRegistro) {
    setPromociones(prev => prev.map(p => (p.id === actualizada.id ? actualizada : p)))
    setDetalle(prev => (prev?.id === actualizada.id ? actualizada : prev))
  }

  const conEstado = useMemo(
    () => promociones.map(p => ({ ...p, estado: estadoPromocion(p) })),
    [promociones],
  )

  const stats = useMemo(() => {
    const cuenta = (e: EstadoPromocion) => conEstado.filter(p => p.estado === e).length
    return {
      total: conEstado.length,
      vigentes: cuenta('vigente'),
      programadas: cuenta('programada'),
      desactivadas: cuenta('desactivada') + cuenta('finalizada'),
    }
  }, [conEstado])

  const filtradas = useMemo(() => {
    if (!filtro) return conEstado
    if (filtro === 'desactivada') return conEstado.filter(p => p.estado === 'desactivada' || p.estado === 'finalizada')
    return conEstado.filter(p => p.estado === filtro)
  }, [conEstado, filtro])

  async function cambiarActiva(p: PromocionRegistro) {
    if (!puedeEditar) return
    const def = definicionPromocion(p.clave)
    const activar = !p.activa

    if (activar && (!p.fecha_inicio || !p.fecha_fin)) {
      showWarning('Primero cargá el período', 'Editá la promoción y cargá desde y hasta cuándo aplica antes de activarla.')
      return
    }

    const periodo = `del ${formatFecha(p.fecha_inicio)} al ${formatFecha(p.fecha_fin)}`
    const texto = activar
      ? `Va a aplicar ${periodo}.` +
        (def && !def.conectada ? ' Todavía no está conectada a facturación: solo queda registrado el período.' : '')
      : 'Deja de aplicar desde ahora, aunque esté dentro del período programado.'

    const ok = await confirmar({
      titulo: `${activar ? 'Activar' : 'Desactivar'} ${p.codigo} · ${p.nombre}`,
      texto,
      peligro: !activar,
    })
    if (!ok) return

    setCambiandoId(p.id)
    try {
      reemplazar(await actualizarPromocion(p.id, { activa: activar }, usuario))
      showSuccess(activar ? 'Promoción activada' : 'Promoción desactivada')
    } catch (err: any) {
      console.error('Error cambiando promoción:', err)
      showError('No se pudo cambiar la promoción', err.message)
    } finally {
      setCambiandoId(null)
    }
  }

  function abrirEditar(p: PromocionRegistro) {
    setEditando(p)
    setForm({
      codigo: p.codigo,
      descripcion: descripcionDe(p),
      inicio: p.fecha_inicio || '',
      fin: p.fecha_fin || '',
    })
  }

  async function guardarEdicion() {
    if (!editando) return
    const codigo = form.codigo.trim().toUpperCase()
    if (!FORMATO_CODIGO_PROMOCION.test(codigo)) {
      showWarning('Código inválido', 'Usá mayúsculas, números o guion, de 2 a 20 caracteres (ej. PRM01).')
      return
    }
    if (promociones.some(p => p.id !== editando.id && p.codigo === codigo)) {
      showWarning('Código repetido', `Ya hay otra promoción con el código ${codigo}.`)
      return
    }
    const descripcion = form.descripcion.trim()
    if (!descripcion) {
      showWarning('Falta la descripción', 'La promoción tiene que tener una descripción.')
      return
    }
    if (!form.inicio || !form.fin) {
      showWarning('Faltan fechas', 'Cargá desde y hasta cuándo aplica la promoción.')
      return
    }
    if (form.fin < form.inicio) {
      showWarning('Fechas inválidas', 'La fecha "hasta" no puede ser anterior a "desde".')
      return
    }

    // Solo lo que cambió (así el historial registra exactamente eso)
    const cambios: Parameters<typeof actualizarPromocion>[1] = {}
    if (codigo !== editando.codigo) cambios.codigo = codigo
    if (descripcion !== (editando.descripcion ?? '')) cambios.descripcion = descripcion
    if (form.inicio !== editando.fecha_inicio) cambios.fecha_inicio = form.inicio
    if (form.fin !== editando.fecha_fin) cambios.fecha_fin = form.fin
    if (Object.keys(cambios).length === 0) {
      setEditando(null)
      return
    }

    setGuardando(true)
    try {
      reemplazar(await actualizarPromocion(editando.id, cambios, usuario))
      showSuccess('Promoción actualizada')
      setEditando(null)
    } catch (err: any) {
      console.error('Error editando promoción:', err)
      const repetido = err?.code === '23505'
      showError('No se pudo guardar la promoción', repetido ? `El código ${codigo} ya está en uso.` : err.message)
    } finally {
      setGuardando(false)
    }
  }

  async function abrirDetalle(p: PromocionRegistro) {
    setDetalle(p)
    setHistorial([])
    setCargandoHistorial(true)
    try {
      setHistorial(await cargarHistorialPromocion(p.id))
    } catch (err) {
      console.error('Error cargando historial de promoción:', err)
    } finally {
      setCargandoHistorial(false)
    }
  }

  const columns = useMemo<ColumnDef<PromocionRegistro & { estado: EstadoPromocion }>[]>(() => [
    {
      accessorKey: 'codigo',
      header: 'Código',
      cell: ({ getValue }) => <span className="promo-codigo">{getValue() as string}</span>,
      enableSorting: true,
    },
    {
      accessorKey: 'nombre',
      header: 'Promoción',
      cell: ({ row }) => {
        const def = definicionPromocion(row.original.clave)
        return (
          <div className="promo-nombre">
            <span className="promo-nombre-titulo">
              {row.original.nombre}
              {def && !def.conectada && (
                <span className="promo-sin-conectar" title="Activarla todavía no cambia ningún cálculo del sistema">
                  Sin conectar
                </span>
              )}
            </span>
            <span className="promo-nombre-desc">{descripcionDe(row.original)}</span>
          </div>
        )
      },
      enableSorting: true,
    },
    {
      accessorKey: 'fecha_inicio',
      header: 'Desde',
      cell: ({ getValue }) => <span className="promo-fecha">{formatFecha(getValue() as string | null)}</span>,
      enableSorting: true,
    },
    {
      accessorKey: 'fecha_fin',
      header: 'Hasta',
      cell: ({ getValue }) => <span className="promo-fecha">{formatFecha(getValue() as string | null)}</span>,
      enableSorting: true,
    },
    {
      accessorKey: 'estado',
      header: 'Estado',
      cell: ({ row }) => (
        <span className={`promo-badge promo-badge-${row.original.estado}`}>
          {ETIQUETA_ESTADO[row.original.estado]}
        </span>
      ),
      enableSorting: false,
    },
    {
      accessorKey: 'activa',
      header: 'Activa',
      cell: ({ row }) => (
        <label
          className={`promo-switch ${!puedeEditar ? 'promo-switch-disabled' : ''}`}
          title={puedeEditar ? (row.original.activa ? 'Desactivar' : 'Activar') : 'Sin permiso para editar'}
        >
          <input
            type="checkbox"
            checked={row.original.activa}
            disabled={!puedeEditar || cambiandoId === row.original.id}
            onChange={() => cambiarActiva(row.original)}
          />
          <span className="promo-switch-slider" />
        </label>
      ),
      enableSorting: false,
    },
    {
      id: 'acciones',
      header: 'Acciones',
      cell: ({ row }) => (
        <div className="promo-acciones">
          <button className="promo-action-btn" onClick={() => abrirDetalle(row.original)} title="Ver detalle">
            <Eye size={15} />
          </button>
          {puedeEditar && (
            <button className="promo-action-btn" onClick={() => abrirEditar(row.original)} title="Editar código, descripción y período">
              <Edit2 size={15} />
            </button>
          )}
        </div>
      ),
      enableSorting: false,
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [puedeEditar, cambiandoId])

  const defDetalle = detalle ? definicionPromocion(detalle.clave) : undefined
  const estadoDetalle = detalle ? estadoPromocion(detalle) : null

  return (
    <div className="module-container">
      <div className="promo-stats">
        <StatsGrid className="promo-stats-grid" storageKey="PromocionesModule">
          <div
            className={`stat-card stat-card-clickable ${filtro === null ? 'stat-card-active' : ''}`}
            onClick={() => setFiltro(null)}
          >
            <Tag size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.total}</span>
              <span className="stat-label">Promociones</span>
            </div>
          </div>
          <div
            className={`stat-card stat-card-clickable ${filtro === 'vigente' ? 'stat-card-active' : ''}`}
            onClick={() => setFiltro(prev => (prev === 'vigente' ? null : 'vigente'))}
          >
            <CheckCircle size={18} className="stat-icon" style={{ color: '#16a34a' }} />
            <div className="stat-content">
              <span className="stat-value">{stats.vigentes}</span>
              <span className="stat-label">Vigentes hoy</span>
            </div>
          </div>
          <div
            className={`stat-card stat-card-clickable ${filtro === 'programada' ? 'stat-card-active' : ''}`}
            onClick={() => setFiltro(prev => (prev === 'programada' ? null : 'programada'))}
          >
            <Clock size={18} className="stat-icon" style={{ color: '#2563eb' }} />
            <div className="stat-content">
              <span className="stat-value">{stats.programadas}</span>
              <span className="stat-label">Programadas</span>
            </div>
          </div>
          <div
            className={`stat-card stat-card-clickable ${filtro === 'desactivada' ? 'stat-card-active' : ''}`}
            onClick={() => setFiltro(prev => (prev === 'desactivada' ? null : 'desactivada'))}
          >
            <XCircle size={18} className="stat-icon" style={{ color: '#9ca3af' }} />
            <div className="stat-content">
              <span className="stat-value">{stats.desactivadas}</span>
              <span className="stat-label">Desactivadas / finalizadas</span>
            </div>
          </div>
        </StatsGrid>
      </div>

      <DataTable
        data={filtradas}
        columns={columns}
        loading={loading}
        error={error}
        pageSize={50}
        searchPlaceholder="Buscar por código o promoción..."
        emptyTitle="No hay promociones"
        emptyDescription="Las promociones se agregan desde el código (catalogoPromociones.ts)"
      />

      {/* Editar descripción y período */}
      {editando && (
        <div className="modal-overlay" onClick={() => !guardando && setEditando(null)}>
          <div className="modal-content" style={{ maxWidth: '560px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Editar promoción</h2>
              <button className="modal-close" onClick={() => !guardando && setEditando(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <p className="promo-modal-nombre">{editando.nombre}</p>
              <div className="form-group">
                <label>Código <span className="required">*</span></label>
                <input
                  type="text"
                  className="form-input promo-codigo-input"
                  value={form.codigo}
                  maxLength={20}
                  placeholder="PRM01"
                  onChange={e => setForm(f => ({ ...f, codigo: e.target.value.toUpperCase().replace(/\s/g, '') }))}
                />
              </div>
              <div className="form-group">
                <label>Descripción <span className="required">*</span></label>
                <textarea
                  className="form-input"
                  rows={3}
                  value={form.descripcion}
                  onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Desde <span className="required">*</span></label>
                  <input
                    type="date"
                    className="form-input"
                    value={form.inicio}
                    onChange={e => setForm(f => ({ ...f, inicio: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Hasta <span className="required">*</span></label>
                  <input
                    type="date"
                    className="form-input"
                    value={form.fin}
                    min={form.inicio || undefined}
                    onChange={e => setForm(f => ({ ...f, fin: e.target.value }))}
                  />
                </div>
              </div>
              <p className="promo-ayuda">
                Las dos fechas se incluyen. La promoción aplica solo si además está activada.
                Se puede editar esté activa o desactivada; el cambio queda en el historial.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setEditando(null)} disabled={guardando}>
                Cancelar
              </button>
              <button className="btn-primary" onClick={guardarEdicion} disabled={guardando}>
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detalle */}
      {detalle && (
        <div className="modal-overlay" onClick={() => setDetalle(null)}>
          <div className="modal-content" style={{ maxWidth: '620px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{detalle.nombre}</h2>
              <button className="modal-close" onClick={() => setDetalle(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="promo-detalle-grid">
                <div>
                  <span className="promo-detalle-label">Estado</span>
                  {estadoDetalle && (
                    <span className={`promo-badge promo-badge-${estadoDetalle}`}>{ETIQUETA_ESTADO[estadoDetalle]}</span>
                  )}
                </div>
                <div>
                  <span className="promo-detalle-label">Período</span>
                  <span>{formatFecha(detalle.fecha_inicio)} al {formatFecha(detalle.fecha_fin)}</span>
                </div>
                <div>
                  <span className="promo-detalle-label">Código</span>
                  <span className="promo-codigo">{detalle.codigo}</span>
                </div>
                <div>
                  <span className="promo-detalle-label">Último cambio</span>
                  <span>
                    {formatFechaHoraART(detalle.updated_at)}
                    {detalle.updated_by_name ? ` · ${detalle.updated_by_name}` : ''}
                  </span>
                </div>
              </div>

              <h3 className="promo-seccion">Descripción</h3>
              <p className="promo-ayuda">{descripcionDe(detalle)}</p>

              {defDetalle && (
                <>
                  <h3 className="promo-seccion">Reglas</h3>
                  <ul className="promo-reglas">
                    {defDetalle.reglas.map(r => <li key={r}>{r}</li>)}
                  </ul>
                  {!defDetalle.conectada && (
                    <div className="promo-aviso">
                      Todavía no está conectada al sistema: activarla deja registrado el período, pero no
                      cambia facturación ni saldos.
                    </div>
                  )}
                </>
              )}

              <h3 className="promo-seccion"><History size={15} /> Historial</h3>
              {cargandoHistorial ? (
                <p className="promo-ayuda">Cargando...</p>
              ) : historial.length === 0 ? (
                <p className="promo-ayuda">Sin cambios registrados.</p>
              ) : (
                <ul className="promo-historial">
                  {historial.map(h => (
                    <li key={h.id}>
                      <div className="promo-historial-cabecera">
                        <span className="promo-historial-fecha">{formatFechaHoraART(h.registrado_at)}</span>
                        <span className="promo-historial-cambio">{etiquetaCambio(h.cambio)}</span>
                        <span className="promo-historial-usuario">{h.usuario_nombre || 'Sistema'}</span>
                      </div>
                      <span>
                        {h.promocion_codigo} · {h.activa ? 'Activa' : 'Desactivada'} · {formatFecha(h.fecha_inicio)} al {formatFecha(h.fecha_fin)}
                      </span>
                      {h.cambio?.includes('descripcion') && h.descripcion && (
                        <span className="promo-historial-desc">"{h.descripcion}"</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setDetalle(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
