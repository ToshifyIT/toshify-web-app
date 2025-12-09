// src/modules/asignaciones/AsignacionesModule.tsx
import { useState, useEffect, useMemo } from 'react'
import { Eye, Trash2, Plus, CheckCircle, XCircle, FileText } from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../../components/ui/DataTable/DataTable'
import { supabase } from '../../lib/supabase'
import { usePermissions } from '../../contexts/PermissionsContext'
import { AssignmentWizard } from '../../components/AssignmentWizard'
import Swal from 'sweetalert2'
import './AsignacionesModule.css'

interface Asignacion {
  id: string
  codigo: string
  vehiculo_id: string
  conductor_id: string
  fecha_programada?: string | null
  fecha_inicio: string
  fecha_fin: string | null
  modalidad: string
  horario: string
  estado: string
  notas: string | null
  created_at: string
  created_by?: string | null
  vehiculos?: {
    patente: string
    marca: string
    modelo: string
  }
  conductores?: {
    nombres: string
    apellidos: string
    numero_licencia: string
  }
  asignaciones_conductores?: Array<{
    id: string
    conductor_id: string
    estado: string
    horario: string
    confirmado: boolean
    fecha_confirmacion?: string | null
    conductores: {
      nombres: string
      apellidos: string
      numero_licencia: string
    }
  }>
}

interface ExpandedAsignacion extends Asignacion {
  conductorEspecifico: any
  turnoEspecifico: string
}

export function AsignacionesModule() {
  const { canCreateInMenu, canEditInMenu, canDeleteInMenu } = usePermissions()
  const canCreate = canCreateInMenu('asignaciones')
  const canEdit = canEditInMenu('asignaciones')
  const canDelete = canDeleteInMenu('asignaciones')

  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showWizard, setShowWizard] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [selectedAsignacion, setSelectedAsignacion] = useState<Asignacion | null>(null)
  const [confirmComentarios, setConfirmComentarios] = useState('')
  const [cancelMotivo, setCancelMotivo] = useState('')
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [showViewModal, setShowViewModal] = useState(false)
  const [viewAsignacion, setViewAsignacion] = useState<Asignacion | null>(null)
  const [conductoresToConfirm, setConductoresToConfirm] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  const loadAsignaciones = async () => {
    try {
      setLoading(true)
      setError(null)

      const { data, error: fetchError } = await supabase
        .from('asignaciones')
        .select(`
          *,
          vehiculos (patente, marca, modelo),
          conductores (nombres, apellidos, numero_licencia),
          asignaciones_conductores (
            id, conductor_id, estado, horario, confirmado, fecha_confirmacion,
            conductores (nombres, apellidos, numero_licencia)
          )
        `)
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError
      setAsignaciones(data || [])
    } catch (err: any) {
      console.error('Error loading asignaciones:', err)
      setError(err.message || 'Error al cargar las asignaciones')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAsignaciones()
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUserId(user?.id || null)
    }
    getCurrentUser()
  }, [])

  // Filtrar por estado
  const filteredAsignaciones = useMemo(() => {
    if (!statusFilter) return asignaciones
    return asignaciones.filter(a => a.estado === statusFilter)
  }, [asignaciones, statusFilter])

  // Expandir asignaciones TURNO en filas separadas
  const expandedAsignaciones = useMemo<ExpandedAsignacion[]>(() => {
    return filteredAsignaciones.flatMap((asignacion): ExpandedAsignacion[] => {
      if (asignacion.horario === 'CARGO') {
        return [{ ...asignacion, conductorEspecifico: null, turnoEspecifico: '-' }]
      }
      if (asignacion.asignaciones_conductores && asignacion.asignaciones_conductores.length > 0) {
        return asignacion.asignaciones_conductores.map(ac => ({
          ...asignacion,
          conductorEspecifico: ac,
          turnoEspecifico: ac.horario
        }))
      }
      return [{ ...asignacion, conductorEspecifico: null, turnoEspecifico: '-' }]
    })
  }, [filteredAsignaciones])

  const handleDelete = async (id: string) => {
    if (isSubmitting || !canDelete) return

    const result = await Swal.fire({
      title: '¿Estás seguro?',
      text: 'Esta acción no se puede deshacer',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#E63946',
      cancelButtonColor: '#6B7280',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    })

    if (result.isConfirmed) {
      setIsSubmitting(true)
      try {
        const asignacion = asignaciones.find(a => a.id === id)

        const { data: conductoresAsignados } = await supabase
          .from('asignaciones_conductores')
          .select('id')
          .eq('asignacion_id', id)

        if (conductoresAsignados && conductoresAsignados.length > 0) {
          const conductorIds = conductoresAsignados.map((c: any) => c.id)
          await supabase.from('vehiculos_turnos_ocupados').delete().in('asignacion_conductor_id', conductorIds)
        }

        await supabase.from('asignaciones_conductores').delete().eq('asignacion_id', id)
        const { error: asignacionError } = await supabase.from('asignaciones').delete().eq('id', id)
        if (asignacionError) throw asignacionError

        if (asignacion?.vehiculo_id) {
          const { data: estadoDisponible } = await supabase
            .from('vehiculos_estados')
            .select('id')
            .eq('codigo', 'DISPONIBLE')
            .single() as { data: { id: string } | null }

          if (estadoDisponible) {
            await (supabase as any).from('vehiculos').update({ estado_id: estadoDisponible.id }).eq('id', asignacion.vehiculo_id)
          }
        }

        Swal.fire('Eliminado', 'La asignación ha sido eliminada', 'success')
        loadAsignaciones()
      } catch (err: any) {
        Swal.fire('Error', err.message || 'Error al eliminar la asignación', 'error')
      } finally {
        setIsSubmitting(false)
      }
    }
  }

  const handleConfirmProgramacion = async () => {
    if (isSubmitting || !selectedAsignacion || conductoresToConfirm.length === 0) return

    setIsSubmitting(true)
    try {
      const ahora = new Date().toISOString()
      const fechaProgramada = selectedAsignacion.fecha_programada
        ? new Date(selectedAsignacion.fecha_programada).toISOString().split('T')[0]
        : null

      await (supabase as any)
        .from('asignaciones_conductores')
        .update({ confirmado: true, fecha_confirmacion: ahora, fecha_inicio: ahora })
        .in('id', conductoresToConfirm)

      const { data: allConductores } = await supabase
        .from('asignaciones_conductores')
        .select('id, conductor_id, confirmado, horario')
        .eq('asignacion_id', selectedAsignacion.id)

      const todosConfirmados = (allConductores as any)?.every((c: any) => c.confirmado === true)

      if (todosConfirmados) {
        const conductoresIds = (allConductores as any)?.map((c: any) => c.conductor_id) || []

        const { data: asignacionesACerrar } = await supabase
          .from('asignaciones')
          .select('id, vehiculo_id')
          .eq('vehiculo_id', selectedAsignacion.vehiculo_id)
          .eq('estado', 'activa')
          .neq('id', selectedAsignacion.id)

        if (asignacionesACerrar && asignacionesACerrar.length > 0) {
          await supabase.from('asignaciones')
            // @ts-ignore
            .update({ estado: 'finalizada', fecha_fin: ahora, notas: '[AUTO-CERRADA]' })
            .in('id', asignacionesACerrar.map((a: any) => a.id))
        }

        if (conductoresIds.length > 0) {
          for (const conductorId of conductoresIds) {
            await (supabase as any)
              .from('asignaciones_conductores')
              .update({ estado: 'cancelado', fecha_fin: ahora })
              .eq('conductor_id', conductorId)
              .eq('estado', 'asignado')
              .neq('asignacion_id', selectedAsignacion.id)
          }
        }

        await (supabase as any)
          .from('asignaciones')
          .update({ estado: 'activa', fecha_inicio: ahora, notas: confirmComentarios || selectedAsignacion.notas })
          .eq('id', selectedAsignacion.id)

        // Actualizar estado del vehículo a EN_USO
        const { data: estadoEnUso } = await supabase
          .from('vehiculos_estados')
          .select('id')
          .eq('codigo', 'EN_USO')
          .single()

        if (estadoEnUso && selectedAsignacion.vehiculo_id) {
          await supabase
            .from('vehiculos')
            .update({ estado_id: estadoEnUso.id })
            .eq('id', selectedAsignacion.vehiculo_id)
        }

        if (fechaProgramada) {
          await supabase.from('vehiculos_turnos_ocupados').delete()
            .eq('vehiculo_id', selectedAsignacion.vehiculo_id)
            .eq('fecha', fechaProgramada)

          const turnosData = (allConductores as any)?.map((ac: any) => ({
            vehiculo_id: selectedAsignacion.vehiculo_id,
            fecha: fechaProgramada,
            horario: ac.horario,
            asignacion_conductor_id: ac.id,
            estado: 'activo'
          })) || []

          if (turnosData.length > 0) {
            await supabase.from('vehiculos_turnos_ocupados').insert(turnosData)
          }
        }

        Swal.fire('Confirmado', 'Todos los conductores han confirmado. La asignación está ACTIVA.', 'success')
      } else {
        const pendientes = (allConductores as any)?.filter((c: any) => !c.confirmado).length || 0
        Swal.fire('Confirmación Parcial', `${conductoresToConfirm.length} confirmado(s). Faltan ${pendientes}.`, 'info')
      }

      setShowConfirmModal(false)
      setConfirmComentarios('')
      setConductoresToConfirm([])
      setSelectedAsignacion(null)
      loadAsignaciones()
    } catch (err: any) {
      Swal.fire('Error', err.message || 'Error al confirmar', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancelProgramacion = async () => {
    if (isSubmitting || !selectedAsignacion || !cancelMotivo.trim()) return

    setIsSubmitting(true)
    try {
      await (supabase as any)
        .from('asignaciones_conductores')
        .update({ confirmado: false, fecha_confirmacion: null })
        .eq('asignacion_id', selectedAsignacion.id)

      await (supabase as any)
        .from('asignaciones')
        .update({ estado: 'cancelada', notas: `${selectedAsignacion.notas || ''}\n\n[CANCELADA] Motivo: ${cancelMotivo}` })
        .eq('id', selectedAsignacion.id)

      const { data: estadoDisponible } = await supabase
        .from('vehiculos_estados')
        .select('id')
        .eq('codigo', 'DISPONIBLE')
        .single() as { data: { id: string } | null }

      if (estadoDisponible) {
        await (supabase as any).from('vehiculos').update({ estado_id: estadoDisponible.id }).eq('id', selectedAsignacion.vehiculo_id)
      }

      Swal.fire('Cancelada', 'La programación ha sido cancelada', 'success')
      setShowCancelModal(false)
      setCancelMotivo('')
      setSelectedAsignacion(null)
      loadAsignaciones()
    } catch (err: any) {
      Swal.fire('Error', err.message || 'Error al cancelar', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUnconfirmConductor = async (conductorAsignacionId: string) => {
    try {
      await (supabase as any)
        .from('asignaciones_conductores')
        .update({ confirmado: false, fecha_confirmacion: null })
        .eq('id', conductorAsignacionId)

      Swal.fire('Actualizado', 'El conductor ha sido desconfirmado.', 'success')
      loadAsignaciones()
    } catch (err: any) {
      Swal.fire('Error', err.message || 'Error al desconfirmar', 'error')
    }
  }

  const getStatusBadgeClass = (status: string) => {
    const classes: Record<string, string> = {
      programado: 'dt-badge dt-badge-yellow',
      activa: 'dt-badge dt-badge-green',
      finalizada: 'dt-badge dt-badge-blue',
      cancelada: 'dt-badge dt-badge-red'
    }
    return classes[status] || 'dt-badge dt-badge-gray'
  }

  const getHorarioBadgeClass = (horario: string) => {
    return horario === 'CARGO' ? 'dt-badge asig-badge-cargo' : 'dt-badge asig-badge-turno'
  }

  // Columnas para DataTable
  const columns = useMemo<ColumnDef<ExpandedAsignacion, any>[]>(() => [
    {
      accessorKey: 'codigo',
      header: 'Número',
      cell: ({ row }) => <strong>{row.original.codigo || 'N/A'}</strong>
    },
    {
      accessorFn: (row) => row.vehiculos?.patente || '',
      id: 'vehiculo',
      header: 'Vehículo',
      cell: ({ row }) => (
        <div className="asig-vehiculo-cell">
          <span className="asig-vehiculo-patente">{row.original.vehiculos?.patente || 'N/A'}</span>
          <span className="asig-vehiculo-info">
            {row.original.vehiculos?.marca} {row.original.vehiculos?.modelo}
          </span>
        </div>
      )
    },
    {
      accessorKey: 'horario',
      header: 'Modalidad',
      cell: ({ row }) => (
        <span className={getHorarioBadgeClass(row.original.horario)}>
          {row.original.horario === 'CARGO' ? 'A CARGO' : 'TURNO'}
        </span>
      )
    },
    {
      accessorKey: 'turnoEspecifico',
      header: 'Turno',
      cell: ({ row }) => (
        <span style={{ fontSize: '13px', fontWeight: 500 }}>
          {row.original.turnoEspecifico === '-' ? '-' : row.original.turnoEspecifico || 'N/A'}
        </span>
      )
    },
    {
      id: 'conductor',
      header: 'Conductor',
      accessorFn: (row) => {
        if (row.conductorEspecifico) {
          return `${row.conductorEspecifico.conductores.nombres} ${row.conductorEspecifico.conductores.apellidos}`
        }
        if (row.horario === 'CARGO' && row.asignaciones_conductores?.length) {
          return row.asignaciones_conductores.map(ac => `${ac.conductores.nombres} ${ac.conductores.apellidos}`).join(', ')
        }
        return 'Sin conductor'
      },
      cell: ({ row }) => {
        if (row.original.conductorEspecifico) {
          return (
            <span style={{ fontSize: '13px' }}>
              {row.original.conductorEspecifico.conductores.nombres} {row.original.conductorEspecifico.conductores.apellidos}
            </span>
          )
        }
        if (row.original.horario === 'CARGO' && row.original.asignaciones_conductores?.length) {
          return (
            <div className="asig-conductores-list">
              {row.original.asignaciones_conductores.map(ac => (
                <span key={ac.id} className="asig-conductor-item">
                  {ac.conductores.nombres} {ac.conductores.apellidos}
                </span>
              ))}
            </div>
          )
        }
        return <span className="asig-sin-conductor">Sin conductor</span>
      }
    },
    {
      accessorKey: 'fecha_programada',
      header: 'Fecha Entrega',
      cell: ({ row }) => (
        <span>
          {row.original.fecha_programada
            ? new Date(row.original.fecha_programada).toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' })
            : 'No definida'}
        </span>
      )
    },
    {
      accessorKey: 'fecha_fin',
      header: 'Fecha Fin',
      cell: ({ row }) => (
        <span>
          {row.original.fecha_fin
            ? new Date(row.original.fecha_fin).toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' })
            : 'Sin definir'}
        </span>
      )
    },
    {
      accessorKey: 'estado',
      header: 'Estado',
      cell: ({ row }) => (
        <span className={getStatusBadgeClass(row.original.estado)}>
          {row.original.estado}
        </span>
      )
    },
    {
      id: 'acciones',
      header: 'Acciones',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="dt-actions">
          {row.original.estado === 'programado' && (
            <>
              <button
                onClick={() => {
                  setSelectedAsignacion(row.original)
                  setShowConfirmModal(true)
                }}
                className="dt-btn-action asig-btn-confirm"
                title="Confirmar programación"
                disabled={!canEdit}
              >
                <CheckCircle size={16} />
              </button>
              <button
                onClick={() => {
                  setSelectedAsignacion(row.original)
                  setShowCancelModal(true)
                }}
                className="dt-btn-action asig-btn-cancel-prog"
                title="Cancelar programación"
                disabled={row.original.created_by !== currentUserId}
              >
                <XCircle size={16} />
              </button>
            </>
          )}
          <button
            className="dt-btn-action dt-btn-view"
            title="Ver detalles"
            onClick={() => {
              setViewAsignacion(row.original)
              setShowViewModal(true)
            }}
          >
            <Eye size={16} />
          </button>
          <button
            onClick={() => handleDelete(row.original.id)}
            className="dt-btn-action dt-btn-delete"
            title="Eliminar"
            disabled={!canDelete}
          >
            <Trash2 size={16} />
          </button>
        </div>
      )
    }
  ], [canEdit, canDelete, currentUserId])

  return (
    <div className="module-container">
      {/* Header */}
      <div className="module-header">
        <div>
          <h1 className="module-title">Gestión de Asignaciones</h1>
          <p className="module-subtitle">
            {filteredAsignaciones.length} asignación{filteredAsignaciones.length !== 1 ? 'es' : ''}
            {expandedAsignaciones.length !== filteredAsignaciones.length && ` (${expandedAsignaciones.length} filas)`}
          </p>
        </div>
      </div>

      {/* Filtro de estado */}
      <div className="asig-filters">
        <select
          className="asig-status-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">Todos los estados</option>
          <option value="programado">Programado</option>
          <option value="activa">Activa</option>
          <option value="finalizada">Finalizada</option>
          <option value="cancelada">Cancelada</option>
        </select>
      </div>

      {/* DataTable with integrated action button */}
      <DataTable
        data={expandedAsignaciones}
        columns={columns}
        loading={loading}
        error={error}
        searchPlaceholder="Buscar por vehículo, conductor o número..."
        emptyIcon={<FileText size={48} />}
        emptyTitle="No hay asignaciones"
        emptyDescription="Crea la primera asignación usando el botón 'Nueva Asignación'"
        pageSize={20}
        pageSizeOptions={[10, 20, 50, 100]}
        headerAction={
          <button
            className="btn-primary"
            onClick={() => setShowWizard(true)}
            disabled={!canCreate}
            title={!canCreate ? 'No tienes permisos para crear asignaciones' : 'Nueva Asignación'}
          >
            <Plus size={18} />
            Nueva Asignación
          </button>
        }
      />

      {/* Wizard Modal */}
      {showWizard && (
        <AssignmentWizard
          onClose={() => setShowWizard(false)}
          onSuccess={() => {
            loadAsignaciones()
            setShowWizard(false)
          }}
        />
      )}

      {/* Modal de Confirmación */}
      {showConfirmModal && selectedAsignacion && (
        <div className="asig-modal-overlay">
          <div className="asig-modal-content">
            <h2 className="asig-modal-title">Confirmar Programación</h2>
            <p>Vehículo: <strong>{selectedAsignacion.vehiculos?.patente}</strong></p>
            <p style={{ fontSize: '14px', color: '#6B7280', marginBottom: '16px' }}>
              Fecha de entrega: <strong>{selectedAsignacion.fecha_programada ? new Date(selectedAsignacion.fecha_programada).toLocaleDateString('es-AR') : 'N/A'}</strong>
            </p>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '12px', fontWeight: 600, fontSize: '14px' }}>
                Selecciona los conductores que confirman:
              </label>
              {selectedAsignacion.asignaciones_conductores?.length ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {selectedAsignacion.asignaciones_conductores.map((ac) => (
                    <label key={ac.id} className={`asig-confirm-conductor ${ac.confirmado ? 'confirmed' : 'pending'}`}>
                      <input
                        type="checkbox"
                        checked={ac.confirmado || conductoresToConfirm.includes(ac.id)}
                        disabled={ac.confirmado}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setConductoresToConfirm([...conductoresToConfirm, ac.id])
                          } else {
                            setConductoresToConfirm(conductoresToConfirm.filter(id => id !== ac.id))
                          }
                        }}
                      />
                      <div style={{ flex: 1 }}>
                        <p className="asig-conductor-name">
                          {ac.conductores.nombres} {ac.conductores.apellidos}
                        </p>
                        <p className="asig-conductor-details">
                          {ac.horario !== 'todo_dia' && `Turno: ${ac.horario}`}
                          {ac.confirmado && (
                            <span className="asig-conductor-confirmed">
                              <CheckCircle size={14} /> Ya confirmado
                            </span>
                          )}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              ) : (
                <p style={{ color: '#9CA3AF', fontSize: '14px' }}>No hay conductores asignados</p>
              )}
            </div>

            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '14px' }}>
              Comentarios (opcional):
            </label>
            <textarea
              value={confirmComentarios}
              onChange={(e) => setConfirmComentarios(e.target.value)}
              rows={4}
              placeholder="Agrega comentarios sobre la confirmación..."
              className="asig-modal-textarea"
              style={{ marginBottom: '20px' }}
            />

            <div className="asig-modal-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowConfirmModal(false)
                  setConfirmComentarios('')
                  setConductoresToConfirm([])
                  setSelectedAsignacion(null)
                }}
              >
                Cancelar
              </button>
              <button
                className="btn-primary"
                onClick={handleConfirmProgramacion}
                disabled={conductoresToConfirm.length === 0 || isSubmitting}
                style={{ background: conductoresToConfirm.length > 0 && !isSubmitting ? '#10B981' : '#D1D5DB' }}
              >
                {isSubmitting ? 'Procesando...' : 'Confirmar Seleccionados'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Cancelación */}
      {showCancelModal && selectedAsignacion && (
        <div className="asig-modal-overlay">
          <div className="asig-modal-content">
            <h2 className="asig-modal-title">Cancelar Programación</h2>
            <p>¿Estás seguro de cancelar la programación del vehículo <strong>{selectedAsignacion.vehiculos?.patente}</strong>?</p>

            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '14px', color: '#DC2626' }}>
              Motivo de cancelación (requerido):
            </label>
            <textarea
              value={cancelMotivo}
              onChange={(e) => setCancelMotivo(e.target.value)}
              rows={4}
              placeholder="Ingresa el motivo de la cancelación..."
              className="asig-modal-textarea cancel"
              style={{ marginBottom: '20px' }}
            />

            <div className="asig-modal-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowCancelModal(false)
                  setCancelMotivo('')
                  setSelectedAsignacion(null)
                }}
              >
                Volver
              </button>
              <button
                className="btn-primary"
                onClick={handleCancelProgramacion}
                disabled={!cancelMotivo.trim() || isSubmitting}
                style={{ background: cancelMotivo.trim() && !isSubmitting ? '#DC2626' : '#D1D5DB' }}
              >
                {isSubmitting ? 'Procesando...' : 'Cancelar Programación'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Visualización */}
      {showViewModal && viewAsignacion && (
        <div className="asig-modal-overlay">
          <div className="asig-modal-content wide">
            <h2 className="asig-modal-title">Detalles de Asignación</h2>

            <div className="asig-detail-grid">
              <div>
                <label className="asig-detail-label">Número de Asignación</label>
                <p className="asig-detail-value code">{viewAsignacion.codigo}</p>
              </div>

              <div>
                <label className="asig-detail-label">Vehículo</label>
                <p className="asig-detail-value">
                  <strong>{viewAsignacion.vehiculos?.patente}</strong> - {viewAsignacion.vehiculos?.marca} {viewAsignacion.vehiculos?.modelo}
                </p>
              </div>

              <div>
                <label className="asig-detail-label">Conductores Asignados</label>
                {viewAsignacion.asignaciones_conductores?.length ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {viewAsignacion.asignaciones_conductores.map((ac) => (
                      <div key={ac.id} className="asig-conductor-card">
                        <p className="asig-conductor-card-name">
                          {ac.conductores.nombres} {ac.conductores.apellidos}
                        </p>
                        <p className="asig-conductor-card-info">Licencia: {ac.conductores.numero_licencia}</p>
                        {ac.horario !== 'todo_dia' && (
                          <p className="asig-conductor-card-info">Turno: <strong>{ac.horario}</strong></p>
                        )}
                        <p className="asig-conductor-status">
                          {ac.confirmado ? (
                            <>
                              <span className="asig-conductor-confirmed">
                                <CheckCircle size={14} /> Confirmado
                              </span>
                              {canEdit && viewAsignacion.estado === 'programado' && (
                                <button
                                  className="asig-btn-unconfirm"
                                  onClick={() => {
                                    Swal.fire({
                                      title: '¿Desconfirmar conductor?',
                                      icon: 'warning',
                                      showCancelButton: true,
                                      confirmButtonColor: '#E63946',
                                      confirmButtonText: 'Sí, desconfirmar'
                                    }).then((result) => {
                                      if (result.isConfirmed) {
                                        handleUnconfirmConductor(ac.id)
                                        setShowViewModal(false)
                                        setViewAsignacion(null)
                                      }
                                    })
                                  }}
                                >
                                  Desconfirmar
                                </button>
                              )}
                            </>
                          ) : (
                            <span style={{ color: '#F59E0B', fontWeight: 600 }}>Pendiente</span>
                          )}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: '#9CA3AF', fontSize: '14px' }}>Sin conductores asignados</p>
                )}
              </div>

              <div className="asig-detail-row">
                <div>
                  <label className="asig-detail-label">Horario</label>
                  <span className={getHorarioBadgeClass(viewAsignacion.horario)}>
                    {viewAsignacion.horario === 'CARGO' ? 'A CARGO' : 'TURNO'}
                  </span>
                </div>
                <div>
                  <label className="asig-detail-label">Estado</label>
                  <span className={getStatusBadgeClass(viewAsignacion.estado)}>
                    {viewAsignacion.estado}
                  </span>
                </div>
              </div>

              <div className="asig-detail-row four">
                <div>
                  <label className="asig-detail-label">Fecha Creación</label>
                  <p className="asig-detail-value" style={{ fontSize: '14px' }}>
                    {new Date(viewAsignacion.created_at).toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </p>
                </div>
                <div>
                  <label className="asig-detail-label">Fecha Entrega</label>
                  <p className="asig-detail-value" style={{ fontSize: '14px' }}>
                    {viewAsignacion.fecha_programada ? new Date(viewAsignacion.fecha_programada).toLocaleDateString('es-ES') : 'No definida'}
                  </p>
                </div>
                <div>
                  <label className="asig-detail-label">Fecha Activación</label>
                  <p className="asig-detail-value" style={{ fontSize: '14px' }}>
                    {viewAsignacion.fecha_inicio ? new Date(viewAsignacion.fecha_inicio).toLocaleDateString('es-ES') : 'No activada'}
                  </p>
                </div>
                <div>
                  <label className="asig-detail-label">Fecha Fin</label>
                  <p className="asig-detail-value" style={{ fontSize: '14px' }}>
                    {viewAsignacion.fecha_fin ? new Date(viewAsignacion.fecha_fin).toLocaleDateString('es-ES') : 'Sin definir'}
                  </p>
                </div>
              </div>

              {viewAsignacion.notas && (
                <div>
                  <label className="asig-detail-label">Notas</label>
                  <p className="asig-notes-box">{viewAsignacion.notas}</p>
                </div>
              )}
            </div>

            <div className="asig-modal-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowViewModal(false)
                  setViewAsignacion(null)
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
