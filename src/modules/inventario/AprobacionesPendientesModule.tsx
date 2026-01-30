// src/modules/inventario/AprobacionesPendientesModule.tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { LoadingOverlay } from '../../components/ui/LoadingOverlay'
import { useAuth } from '../../contexts/AuthContext'
import Swal from 'sweetalert2'
import { showSuccess } from '../../utils/toast'
import { Check, X, Eye, Clock, Package, ArrowUpRight, ArrowDownLeft, RotateCcw, Filter, RefreshCw, History, CheckCircle, XCircle } from 'lucide-react'

interface MovimientoPendiente {
  id: string
  tipo: 'entrada' | 'salida' | 'asignacion' | 'devolucion'
  cantidad: number
  observaciones: string | null
  created_at: string
  motivo_salida: string | null
  estado_retorno: string | null
  producto_id: string
  producto_nombre: string
  producto_tipo: string
  proveedor_id: string | null
  proveedor_nombre: string | null
  vehiculo_id: string | null
  vehiculo_patente: string | null
  servicio_id: string | null
  usuario_registrador_id: string
  usuario_registrador_nombre: string
}

type FiltroTipo = 'todos' | 'entrada' | 'salida' | 'asignacion' | 'devolucion'
type TabActiva = 'pendientes' | 'historico'

interface MovimientoHistorico {
  id: string
  tipo: string
  cantidad: number
  observaciones: string | null
  created_at: string
  estado_aprobacion: 'aprobado' | 'rechazado'
  fecha_aprobacion: string | null
  motivo_rechazo: string | null
  producto_nombre: string
  usuario_registrador_nombre: string
  usuario_aprobador_nombre: string | null
}

export function AprobacionesPendientesModule() {
  const { user, profile } = useAuth()
  const [movimientos, setMovimientos] = useState<MovimientoPendiente[]>([])
  const [historico, setHistorico] = useState<MovimientoHistorico[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingHistorico, setLoadingHistorico] = useState(false)
  const [processing, setProcessing] = useState<string | null>(null)
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>('todos')
  const [tabActiva, setTabActiva] = useState<TabActiva>('pendientes')

  const userRole = profile?.roles?.name || ''
  const canApprove = userRole === 'encargado' || userRole === 'admin' || userRole === 'supervisor'

  useEffect(() => {
    if (canApprove) {
      cargarMovimientosPendientes()
    } else {
      setLoading(false)
    }
  }, [canApprove])

  useEffect(() => {
    if (tabActiva === 'historico' && historico.length === 0 && canApprove) {
      cargarHistorico()
    }
  }, [tabActiva, canApprove])

  const cargarMovimientosPendientes = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('v_movimientos_pendientes')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setMovimientos(data || [])
    } catch (error) {
      console.error('Error cargando movimientos pendientes:', error)
      Swal.fire('Error', 'No se pudieron cargar los movimientos pendientes', 'error')
    } finally {
      setLoading(false)
    }
  }

  const cargarHistorico = async () => {
    setLoadingHistorico(true)
    try {
      const { data, error } = await supabase
        .from('movimientos')
        .select(`
          id,
          tipo_movimiento,
          cantidad,
          observaciones,
          created_at,
          estado_aprobacion,
          fecha_aprobacion,
          motivo_rechazo,
          usuario_id,
          productos (nombre),
          aprobador:usuario_aprobador_id (full_name)
        `)
        .in('estado_aprobacion', ['aprobado', 'rechazado'])
        .order('fecha_aprobacion', { ascending: false, nullsFirst: false })
        .limit(50)

      if (error) throw error

      // Obtener nombres de usuarios registradores
      const usuarioIds = [...new Set((data || []).map((m: any) => m.usuario_id).filter(Boolean))]
      const { data: perfiles } = await supabase
        .from('user_profiles')
        .select('id, full_name')
        .in('id', usuarioIds)

      const perfilesMap = new Map((perfiles || []).map((p: any) => [p.id, p.full_name]))

      const historicoFormateado: MovimientoHistorico[] = (data || []).map((mov: any) => ({
        id: mov.id,
        tipo: mov.tipo_movimiento,
        cantidad: mov.cantidad,
        observaciones: mov.observaciones,
        created_at: mov.created_at,
        estado_aprobacion: mov.estado_aprobacion,
        fecha_aprobacion: mov.fecha_aprobacion,
        motivo_rechazo: mov.motivo_rechazo,
        producto_nombre: mov.productos?.nombre || 'Producto eliminado',
        usuario_registrador_nombre: perfilesMap.get(mov.usuario_id) || 'Usuario desconocido',
        usuario_aprobador_nombre: mov.aprobador?.full_name || null
      }))

      setHistorico(historicoFormateado)
    } catch (error) {
      console.error('Error cargando histórico:', error)
      Swal.fire('Error', 'No se pudo cargar el histórico de aprobaciones', 'error')
    } finally {
      setLoadingHistorico(false)
    }
  }

  const aprobarMovimiento = async (movimiento: MovimientoPendiente) => {
    const vehiculoInfo = movimiento.vehiculo_patente
      ? `<p><strong>Vehículo:</strong> ${movimiento.vehiculo_patente}</p>`
      : ''

    const result = await Swal.fire({
      title: 'Aprobar Movimiento',
      html: `
        <div style="text-align: left;">
          <p><strong>Tipo:</strong> ${getTipoLabel(movimiento.tipo)}</p>
          <p><strong>Producto:</strong> ${movimiento.producto_nombre}</p>
          <p><strong>Cantidad:</strong> ${movimiento.cantidad}</p>
          ${vehiculoInfo}
          <p><strong>Registrado por:</strong> ${movimiento.usuario_registrador_nombre}</p>
          ${movimiento.observaciones ? `<p><strong>Observaciones:</strong> ${movimiento.observaciones}</p>` : ''}
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#10B981',
      cancelButtonColor: '#6B7280',
      confirmButtonText: 'Aprobar',
      cancelButtonText: 'Cancelar'
    })

    if (!result.isConfirmed) return

    setProcessing(movimiento.id)
    try {
      const { data: rpcResult, error: rpcError } = await (supabase.rpc as any)('aprobar_rechazar_movimiento', {
        p_movimiento_id: movimiento.id,
        p_accion: 'aprobar',
        p_usuario_id: user?.id,
        p_motivo_rechazo: null
      })

      if (rpcError) throw rpcError
      if (rpcResult && !rpcResult.success) throw new Error(rpcResult.error)

      showSuccess('¡Aprobado!', 'El movimiento ha sido aprobado y el stock actualizado')

      cargarMovimientosPendientes()
    } catch (error: any) {
      console.error('Error aprobando movimiento:', error)
      Swal.fire('Error', error.message || 'No se pudo aprobar el movimiento', 'error')
    } finally {
      setProcessing(null)
    }
  }

  const rechazarMovimiento = async (movimiento: MovimientoPendiente) => {
    const vehiculoInfo = movimiento.vehiculo_patente
      ? `<p><strong>Vehículo:</strong> ${movimiento.vehiculo_patente}</p>`
      : ''

    const { value: motivo } = await Swal.fire({
      title: 'Rechazar Movimiento',
      html: `
        <div style="text-align: left; margin-bottom: 16px;">
          <p><strong>Tipo:</strong> ${getTipoLabel(movimiento.tipo)}</p>
          <p><strong>Producto:</strong> ${movimiento.producto_nombre}</p>
          <p><strong>Cantidad:</strong> ${movimiento.cantidad}</p>
          ${vehiculoInfo}
          <p><strong>Registrado por:</strong> ${movimiento.usuario_registrador_nombre}</p>
        </div>
      `,
      input: 'textarea',
      inputLabel: 'Motivo del rechazo (obligatorio)',
      inputPlaceholder: 'Explica por qué se rechaza este movimiento...',
      inputAttributes: {
        'aria-label': 'Motivo del rechazo'
      },
      showCancelButton: true,
      confirmButtonColor: '#EF4444',
      cancelButtonColor: '#6B7280',
      confirmButtonText: 'Rechazar',
      cancelButtonText: 'Cancelar',
      inputValidator: (value) => {
        if (!value || value.trim().length < 10) {
          return 'El motivo debe tener al menos 10 caracteres'
        }
        return null
      }
    })

    if (!motivo) return

    setProcessing(movimiento.id)
    try {
      const { data: rpcResult, error: rejectError } = await (supabase.rpc as any)('aprobar_rechazar_movimiento', {
        p_movimiento_id: movimiento.id,
        p_accion: 'rechazar',
        p_usuario_id: user?.id,
        p_motivo_rechazo: motivo.trim()
      })

      if (rejectError) throw rejectError
      if (rpcResult && !rpcResult.success) throw new Error(rpcResult.error)

      await Swal.fire({
        title: 'Rechazado',
        text: 'El movimiento ha sido rechazado',
        icon: 'info',
        timer: 2000,
        showConfirmButton: false
      })

      cargarMovimientosPendientes()
    } catch (error: any) {
      console.error('Error rechazando movimiento:', error)
      Swal.fire('Error', error.message || 'No se pudo rechazar el movimiento', 'error')
    } finally {
      setProcessing(null)
    }
  }

  const verDetalles = (movimiento: MovimientoPendiente) => {
    let detallesHtml = `
      <div style="text-align: left;">
        <p><strong>Tipo:</strong> ${getTipoLabel(movimiento.tipo)}</p>
        <p><strong>Producto:</strong> ${movimiento.producto_nombre}</p>
        <p><strong>Cantidad:</strong> ${movimiento.cantidad}</p>
    `

    if (movimiento.vehiculo_patente) {
      detallesHtml += `<p><strong>Vehículo:</strong> ${movimiento.vehiculo_patente}</p>`
    }

    if (movimiento.proveedor_nombre) {
      detallesHtml += `<p><strong>Proveedor:</strong> ${movimiento.proveedor_nombre}</p>`
    }

    if (movimiento.motivo_salida) {
      detallesHtml += `<p><strong>Motivo:</strong> ${getMotivoSalidaLabel(movimiento.motivo_salida)}</p>`
    }

    if (movimiento.estado_retorno) {
      detallesHtml += `<p><strong>Estado retorno:</strong> ${getEstadoRetornoLabel(movimiento.estado_retorno)}</p>`
    }

    if (movimiento.observaciones) {
      detallesHtml += `<p><strong>Observaciones:</strong> ${movimiento.observaciones}</p>`
    }

    detallesHtml += `
        <hr style="margin: 12px 0;">
        <p><strong>Registrado por:</strong> ${movimiento.usuario_registrador_nombre}</p>
        <p><strong>Fecha:</strong> ${new Date(movimiento.created_at).toLocaleString('es-CL')}</p>
      </div>
    `

    Swal.fire({
      title: 'Detalles del Movimiento',
      html: detallesHtml,
      icon: 'info',
      confirmButtonText: 'Cerrar'
    })
  }

  const getTipoLabel = (tipo: string): string => {
    const labels: Record<string, string> = {
      entrada: 'Entrada',
      salida: 'Salida',
      asignacion: 'Asignación (Uso)',
      devolucion: 'Devolución'
    }
    return labels[tipo] || tipo
  }

  const getTipoIcon = (tipo: string) => {
    switch (tipo) {
      case 'entrada':
        return <ArrowDownLeft size={16} />
      case 'salida':
        return <ArrowUpRight size={16} />
      case 'asignacion':
        return <Package size={16} />
      case 'devolucion':
        return <RotateCcw size={16} />
      default:
        return <Package size={16} />
    }
  }

  const getTipoColor = (tipo: string): string => {
    switch (tipo) {
      case 'entrada':
        return '#10B981'
      case 'salida':
        return '#EF4444'
      case 'asignacion':
        return '#F59E0B'
      case 'devolucion':
        return '#3B82F6'
      default:
        return '#6B7280'
    }
  }

  const getMotivoSalidaLabel = (motivo: string): string => {
    const labels: Record<string, string> = {
      venta: 'Venta',
      consumo_servicio: 'Consumo en servicio',
      danado: 'Dañado',
      perdido: 'Perdido'
    }
    return labels[motivo] || motivo
  }

  const getEstadoRetornoLabel = (estado: string): string => {
    const labels: Record<string, string> = {
      operativa: 'Operativa',
      danada: 'Dañada',
      perdida: 'Perdida'
    }
    return labels[estado] || estado
  }

  const movimientosFiltrados = filtroTipo === 'todos'
    ? movimientos
    : movimientos.filter(m => m.tipo === filtroTipo)

  if (!canApprove) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <Clock size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
        <h3>Acceso Restringido</h3>
        <p>Solo los usuarios con rol de Encargado o Admin pueden aprobar movimientos.</p>
      </div>
    )
  }

  return (
    <>
      <style>{`
        .aprobaciones-container {
          padding: 0;
        }

        .aprobaciones-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
          flex-wrap: wrap;
          gap: 16px;
        }

        .aprobaciones-title {
          font-size: 24px;
          font-weight: 700;
          color: var(--text-primary);
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .pending-badge {
          background: var(--badge-yellow-bg);
          color: var(--badge-yellow-text);
          padding: 4px 12px;
          border-radius: 16px;
          font-size: 14px;
          font-weight: 600;
        }

        .header-actions {
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .filter-select {
          padding: 8px 12px;
          border: 1px solid var(--border-primary);
          border-radius: 8px;
          font-size: 14px;
          background: var(--input-bg);
          color: var(--text-primary);
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .filter-select select {
          border: none;
          background: var(--input-bg);
          color: var(--text-primary);
          font-size: 14px;
          cursor: pointer;
          outline: none;
        }

        .refresh-btn {
          padding: 8px 16px;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-primary);
          border-radius: 8px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          color: var(--text-primary);
          transition: all 0.2s;
        }

        .refresh-btn:hover {
          background: var(--border-primary);
        }

        .movimientos-grid {
          display: grid;
          gap: 16px;
        }

        .movimiento-card {
          background: var(--card-bg);
          border: 1px solid var(--border-primary);
          border-radius: 12px;
          padding: 20px;
          transition: all 0.2s;
        }

        .movimiento-card:hover {
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .movimiento-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 16px;
        }

        .movimiento-tipo {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
        }

        .movimiento-fecha {
          color: var(--text-secondary);
          font-size: 12px;
        }

        .movimiento-body {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 16px;
        }

        .movimiento-field {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .movimiento-field.full-width {
          grid-column: 1 / -1;
        }

        .field-label {
          font-size: 11px;
          font-weight: 600;
          color: var(--text-tertiary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .field-value {
          font-size: 14px;
          color: var(--text-primary);
        }

        .movimiento-actions {
          display: flex;
          gap: 12px;
          padding-top: 16px;
          border-top: 1px solid var(--bg-tertiary);
        }

        .action-btn {
          flex: 1;
          padding: 10px 16px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: all 0.2s;
          border: none;
        }

        .action-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-aprobar {
          background: #10B981;
          color: var(--card-bg);
        }

        .btn-aprobar:hover:not(:disabled) {
          background: var(--color-success);
        }

        .btn-rechazar {
          background: var(--badge-red-bg);
          color: var(--color-primary);
        }

        .btn-rechazar:hover:not(:disabled) {
          background: #FECACA;
        }

        .btn-detalles {
          background: var(--bg-tertiary);
          color: var(--text-primary);
          flex: 0.5;
        }

        .btn-detalles:hover:not(:disabled) {
          background: var(--border-primary);
        }

        .empty-state {
          text-align: center;
          padding: 60px 20px;
          color: var(--text-secondary);
        }

        .empty-state svg {
          margin-bottom: 16px;
          opacity: 0.5;
        }

        .empty-state h3 {
          font-size: 18px;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 8px;
        }

        .loading-spinner {
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 60px;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 3px solid var(--border-primary);
          border-top-color: #3B82F6;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .tabs-container {
          display: flex;
          gap: 4px;
          background: var(--bg-secondary);
          padding: 4px;
          border-radius: 10px;
          margin-bottom: 16px;
        }

        .tab-btn {
          flex: 1;
          padding: 8px 16px;
          border: none;
          background: transparent;
          color: var(--text-secondary);
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: all 0.2s;
        }

        .tab-btn:hover {
          color: var(--text-primary);
        }

        .tab-btn.active {
          background: var(--card-bg);
          color: var(--color-primary);
          box-shadow: var(--shadow-sm);
        }

        .tab-badge {
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
        }

        .tab-btn.active .tab-badge {
          background: var(--color-primary);
          color: white;
        }

        .tab-btn:not(.active) .tab-badge {
          background: var(--bg-tertiary);
          color: var(--text-secondary);
        }

        .historico-grid {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .historico-item {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px;
          background: var(--card-bg);
          border: 1px solid var(--border-primary);
          border-radius: 10px;
        }

        .historico-icon {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .historico-icon.aprobado {
          background: var(--badge-green-bg);
          color: var(--color-success);
        }

        .historico-icon.rechazado {
          background: var(--badge-red-bg);
          color: var(--color-danger);
        }

        .historico-content {
          flex: 1;
          min-width: 0;
        }

        .historico-producto {
          font-weight: 600;
          color: var(--text-primary);
          font-size: 14px;
        }

        .historico-meta {
          font-size: 12px;
          color: var(--text-secondary);
          margin-top: 4px;
        }

        .historico-estado {
          text-align: right;
        }

        .historico-estado-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 10px;
          border-radius: 16px;
          font-size: 12px;
          font-weight: 600;
        }

        .historico-estado-badge.aprobado {
          background: var(--badge-green-bg);
          color: var(--badge-green-text);
        }

        .historico-estado-badge.rechazado {
          background: var(--badge-red-bg);
          color: var(--badge-red-text);
        }

        .historico-fecha {
          font-size: 11px;
          color: var(--text-tertiary);
          margin-top: 4px;
        }

        @media (max-width: 768px) {
          .aprobaciones-header {
            flex-direction: column;
            align-items: stretch;
          }

          .movimiento-body {
            grid-template-columns: 1fr;
          }

          .movimiento-actions {
            flex-direction: column;
          }

          .btn-detalles {
            flex: 1;
          }

          .historico-item {
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
          }

          .historico-estado {
            text-align: left;
            width: 100%;
          }
        }
      `}</style>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <LoadingOverlay show={loading} message="Cargando aprobaciones..." size="lg" />
        {/* Tabs */}
        <div className="tabs-container">
          <button
            className={`tab-btn ${tabActiva === 'pendientes' ? 'active' : ''}`}
            onClick={() => setTabActiva('pendientes')}
          >
            <Clock size={16} />
            Pendientes
            {movimientos.length > 0 && (
              <span className="tab-badge">{movimientos.length}</span>
            )}
          </button>
          <button
            className={`tab-btn ${tabActiva === 'historico' ? 'active' : ''}`}
            onClick={() => setTabActiva('historico')}
          >
            <History size={16} />
            Histórico
          </button>
        </div>

        {/* Controles - Solo para pestaña pendientes */}
        {tabActiva === 'pendientes' && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', alignItems: 'center' }}>
            <div className="filter-select">
              <Filter size={16} />
              <select
                value={filtroTipo}
                onChange={(e) => setFiltroTipo(e.target.value as FiltroTipo)}
              >
                <option value="todos">Todos los tipos</option>
                <option value="entrada">Entradas</option>
                <option value="salida">Salidas</option>
                <option value="asignacion">Asignaciones</option>
                <option value="devolucion">Devoluciones</option>
              </select>
            </div>
            <button className="refresh-btn" onClick={cargarMovimientosPendientes}>
              <RefreshCw size={16} />
              Actualizar
            </button>
          </div>
        )}

        {/* Controles - Solo para pestaña histórico */}
        {tabActiva === 'historico' && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', alignItems: 'center' }}>
            <button className="refresh-btn" onClick={cargarHistorico}>
              <RefreshCw size={16} />
              Actualizar
            </button>
          </div>
        )}

        {/* Tab: Pendientes */}
        {tabActiva === 'pendientes' && (
          <>
            {loading ? (
              <div className="loading-spinner">
                <div className="spinner"></div>
              </div>
            ) : movimientosFiltrados.length === 0 ? (
              <div className="empty-state">
                <Check size={48} />
                <h3>No hay movimientos pendientes</h3>
                <p>
                  {filtroTipo === 'todos'
                    ? 'Todos los movimientos han sido procesados'
                    : `No hay ${getTipoLabel(filtroTipo).toLowerCase()}s pendientes de aprobación`}
                </p>
              </div>
            ) : (
              <div className="movimientos-grid">
                {movimientosFiltrados.map((movimiento) => (
                  <div key={movimiento.id} className="movimiento-card">
                    <div className="movimiento-header">
                      <div
                        className="movimiento-tipo"
                        style={{
                          background: `${getTipoColor(movimiento.tipo)}15`,
                          color: getTipoColor(movimiento.tipo)
                        }}
                      >
                        {getTipoIcon(movimiento.tipo)}
                        {getTipoLabel(movimiento.tipo)}
                      </div>
                      <div className="movimiento-fecha">
                        {new Date(movimiento.created_at).toLocaleString('es-CL')}
                      </div>
                    </div>

                    <div className="movimiento-body">
                      <div className="movimiento-field">
                        <span className="field-label">Producto</span>
                        <span className="field-value">{movimiento.producto_nombre}</span>
                      </div>
                      <div className="movimiento-field">
                        <span className="field-label">Cantidad</span>
                        <span className="field-value">{movimiento.cantidad}</span>
                      </div>
                      {movimiento.vehiculo_patente && (
                        <div className="movimiento-field">
                          <span className="field-label">Vehículo</span>
                          <span className="field-value">{movimiento.vehiculo_patente}</span>
                        </div>
                      )}
                      {movimiento.motivo_salida && (
                        <div className="movimiento-field">
                          <span className="field-label">Motivo</span>
                          <span className="field-value">{getMotivoSalidaLabel(movimiento.motivo_salida)}</span>
                        </div>
                      )}
                      <div className="movimiento-field full-width">
                        <span className="field-label">Registrado por</span>
                        <span className="field-value">{movimiento.usuario_registrador_nombre}</span>
                      </div>
                      {movimiento.observaciones && (
                        <div className="movimiento-field full-width">
                          <span className="field-label">Observaciones</span>
                          <span className="field-value">{movimiento.observaciones}</span>
                        </div>
                      )}
                    </div>

                    <div className="movimiento-actions">
                      <button
                        className="action-btn btn-detalles"
                        onClick={() => verDetalles(movimiento)}
                      >
                        <Eye size={16} />
                        Detalles
                      </button>
                      <button
                        className="action-btn btn-rechazar"
                        onClick={() => rechazarMovimiento(movimiento)}
                        disabled={processing === movimiento.id}
                      >
                        <X size={16} />
                        Rechazar
                      </button>
                      <button
                        className="action-btn btn-aprobar"
                        onClick={() => aprobarMovimiento(movimiento)}
                        disabled={processing === movimiento.id}
                      >
                        <Check size={16} />
                        Aprobar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Tab: Histórico */}
        {tabActiva === 'historico' && (
          <>
            {loadingHistorico ? (
              <div className="loading-spinner">
                <div className="spinner"></div>
              </div>
            ) : historico.length === 0 ? (
              <div className="empty-state">
                <History size={48} />
                <h3>No hay histórico de aprobaciones</h3>
                <p>Aún no se han procesado movimientos</p>
              </div>
            ) : (
              <div className="historico-grid">
                {historico.map((item) => (
                  <div key={item.id} className="historico-item">
                    <div className={`historico-icon ${item.estado_aprobacion}`}>
                      {item.estado_aprobacion === 'aprobado' ? (
                        <CheckCircle size={20} />
                      ) : (
                        <XCircle size={20} />
                      )}
                    </div>
                    <div className="historico-content">
                      <div className="historico-producto">
                        {item.producto_nombre} ({item.cantidad} uds)
                      </div>
                      <div className="historico-meta">
                        {getTipoLabel(item.tipo)} • Registrado por: {item.usuario_registrador_nombre}
                        {item.usuario_aprobador_nombre && (
                          <> • Procesado por: {item.usuario_aprobador_nombre}</>
                        )}
                      </div>
                      {item.motivo_rechazo && (
                        <div className="historico-meta" style={{ color: 'var(--color-danger)', marginTop: '4px' }}>
                          Motivo: {item.motivo_rechazo}
                        </div>
                      )}
                    </div>
                    <div className="historico-estado">
                      <span className={`historico-estado-badge ${item.estado_aprobacion}`}>
                        {item.estado_aprobacion === 'aprobado' ? (
                          <>
                            <CheckCircle size={12} />
                            Aprobado
                          </>
                        ) : (
                          <>
                            <XCircle size={12} />
                            Rechazado
                          </>
                        )}
                      </span>
                      <div className="historico-fecha">
                        {item.fecha_aprobacion
                          ? new Date(item.fecha_aprobacion).toLocaleString('es-CL')
                          : new Date(item.created_at).toLocaleString('es-CL')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
