// src/modules/promociones/PromocionesModule.tsx
// Parámetros > Promociones. Lista las promociones del catálogo del código
// (catalogoPromociones.ts): se activan / desactivan y se programan (desde / hasta).
// No se crean ni se borran desde acá.

import { useState, useEffect, useMemo } from 'react'
import { Tag, CheckCircle, Clock, XCircle, Eye, CalendarRange, X, History } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { useAuth } from '../../contexts/AuthContext'
import { usePermissions } from '../../contexts/PermissionsContext'
import { confirmar } from '../../components/ui/alertas'
import { showError, showSuccess, showWarning } from '../../utils/toast'
import { formatFechaHoraART } from '../../utils/fechaArgentina'
import { definicionPromocion } from './catalogoPromociones'
import {
  actualizarPromocion, cargarHistorialPromocion, cargarPromociones, estadoPromocion,
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

/** "YYYY-MM-DD" → "DD/MM/YYYY" (sin pasar por Date: es una fecha, no un instante). */
function formatFecha(fecha: string | null): string {
  if (!fecha) return '-'
  const [y, m, d] = fecha.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
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

  const [programando, setProgramando] = useState<PromocionRegistro | null>(null)
  const [fechas, setFechas] = useState({ inicio: '', fin: '' })
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
    const def = definicionPromocion(p.codigo)
    const activar = !p.activa

    if (activar && (!p.fecha_inicio || !p.fecha_fin)) {
      showWarning('Primero programá la promoción', 'Cargá desde y hasta cuándo aplica antes de activarla.')
      return
    }

    const periodo = `del ${formatFecha(p.fecha_inicio)} al ${formatFecha(p.fecha_fin)}`
    const texto = activar
      ? `Va a aplicar ${periodo}.` +
        (def && !def.conectada ? ' Todavía no está conectada a facturación: solo queda registrado el período.' : '')
      : 'Deja de aplicar desde ahora, aunque esté dentro del período programado.'

    const ok = await confirmar({
      titulo: `${activar ? 'Activar' : 'Desactivar'} "${p.nombre}"`,
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

  function abrirProgramar(p: PromocionRegistro) {
    setProgramando(p)
    setFechas({ inicio: p.fecha_inicio || '', fin: p.fecha_fin || '' })
  }

  async function guardarFechas() {
    if (!programando) return
    if (!fechas.inicio || !fechas.fin) {
      showWarning('Faltan fechas', 'Cargá desde y hasta cuándo aplica la promoción.')
      return
    }
    if (fechas.fin < fechas.inicio) {
      showWarning('Fechas inválidas', 'La fecha "hasta" no puede ser anterior a "desde".')
      return
    }
    setGuardando(true)
    try {
      reemplazar(await actualizarPromocion(programando.id, { fecha_inicio: fechas.inicio, fecha_fin: fechas.fin }, usuario))
      showSuccess('Período guardado')
      setProgramando(null)
    } catch (err: any) {
      console.error('Error guardando fechas de promoción:', err)
      showError('No se pudo guardar el período', err.message)
    } finally {
      setGuardando(false)
    }
  }

  async function abrirDetalle(p: PromocionRegistro) {
    setDetalle(p)
    setHistorial([])
    setCargandoHistorial(true)
    try {
      setHistorial(await cargarHistorialPromocion(p.codigo))
    } catch (err) {
      console.error('Error cargando historial de promoción:', err)
    } finally {
      setCargandoHistorial(false)
    }
  }

  const columns = useMemo<ColumnDef<PromocionRegistro & { estado: EstadoPromocion }>[]>(() => [
    {
      accessorKey: 'nombre',
      header: 'Promoción',
      cell: ({ row }) => {
        const def = definicionPromocion(row.original.codigo)
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
            {def && <span className="promo-nombre-desc">{def.descripcion}</span>}
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
            <button className="promo-action-btn" onClick={() => abrirProgramar(row.original)} title="Programar fechas">
              <CalendarRange size={15} />
            </button>
          )}
        </div>
      ),
      enableSorting: false,
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [puedeEditar, cambiandoId])

  const defDetalle = detalle ? definicionPromocion(detalle.codigo) : undefined
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
        searchPlaceholder="Buscar promoción..."
        emptyTitle="No hay promociones"
        emptyDescription="Las promociones se agregan desde el código (catalogoPromociones.ts)"
      />

      {/* Programar desde / hasta */}
      {programando && (
        <div className="modal-overlay" onClick={() => !guardando && setProgramando(null)}>
          <div className="modal-content" style={{ maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Programar promoción</h2>
              <button className="modal-close" onClick={() => !guardando && setProgramando(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <p className="promo-modal-nombre">{programando.nombre}</p>
              <div className="form-row">
                <div className="form-group">
                  <label>Desde <span className="required">*</span></label>
                  <input
                    type="date"
                    className="form-input"
                    value={fechas.inicio}
                    onChange={e => setFechas(f => ({ ...f, inicio: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Hasta <span className="required">*</span></label>
                  <input
                    type="date"
                    className="form-input"
                    value={fechas.fin}
                    min={fechas.inicio || undefined}
                    onChange={e => setFechas(f => ({ ...f, fin: e.target.value }))}
                  />
                </div>
              </div>
              <p className="promo-ayuda">
                Las dos fechas se incluyen. La promoción aplica solo si además está activada.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setProgramando(null)} disabled={guardando}>
                Cancelar
              </button>
              <button className="btn-primary" onClick={guardarFechas} disabled={guardando}>
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
                  <span className="promo-fecha">{detalle.codigo}</span>
                </div>
                <div>
                  <span className="promo-detalle-label">Último cambio</span>
                  <span>
                    {formatFechaHoraART(detalle.updated_at)}
                    {detalle.updated_by_name ? ` · ${detalle.updated_by_name}` : ''}
                  </span>
                </div>
              </div>

              {defDetalle && (
                <>
                  <h3 className="promo-seccion">Qué hace</h3>
                  <p className="promo-ayuda">{defDetalle.descripcion}</p>
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
                      <span className="promo-historial-fecha">{formatFechaHoraART(h.registrado_at)}</span>
                      <span>
                        {h.activa ? 'Activa' : 'Desactivada'} · {formatFecha(h.fecha_inicio)} al {formatFecha(h.fecha_fin)}
                      </span>
                      <span className="promo-historial-usuario">{h.usuario_nombre || 'Sistema'}</span>
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
