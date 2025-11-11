// src/modules/asignaciones/AsignacionesModule.tsx
import { useState, useEffect } from 'react'
import { Eye, Trash2, Plus, Search, Filter, Calendar, User as UserIcon } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { usePermissions } from '../../contexts/PermissionsContext'
import { AssignmentWizard } from '../../components/AssignmentWizard'
import Swal from 'sweetalert2'

interface Asignacion {
  id: string
  numero_asignacion: string
  vehiculo_id: string
  conductor_id: string
  fecha_inicio: string
  fecha_fin: string | null
  modalidad: string
  horario: string
  estado: string
  notas: string | null
  created_at: string
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
    conductores: {
      nombres: string
      apellidos: string
      numero_licencia: string
    }
  }>
}

export function AsignacionesModule() {
  const { canCreateInMenu, canEditInMenu, canDeleteInMenu } = usePermissions()

  // Permisos específicos para el menú de asignaciones
  const canCreate = canCreateInMenu('asignaciones')
  const canEdit = canEditInMenu('asignaciones')
  const canDelete = canDeleteInMenu('asignaciones')

  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([])
  const [loading, setLoading] = useState(true)
  const [showWizard, setShowWizard] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')

  // Cargar asignaciones desde Supabase
  const loadAsignaciones = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('asignaciones')
        .select(`
          *,
          vehiculos (
            patente,
            marca,
            modelo
          ),
          conductores (
            nombres,
            apellidos,
            numero_licencia
          )
        `)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error en query principal:', error)
        throw error
      }

      // Cargar conductores asignados por separado
      if (data && data.length > 0) {
        const asignacionesConConductores = await Promise.all(
          data.map(async (asignacion) => {
            const { data: conductoresAsignados } = await supabase
              .from('asignaciones_conductores')
              .select(`
                id,
                conductor_id,
                estado,
                conductores (
                  nombres,
                  apellidos,
                  numero_licencia
                )
              `)
              .eq('asignacion_id', asignacion.id)

            return {
              ...asignacion,
              asignaciones_conductores: conductoresAsignados || []
            }
          })
        )
        setAsignaciones(asignacionesConConductores)
      } else {
        setAsignaciones(data || [])
      }
    } catch (error: any) {
      console.error('Error loading asignaciones:', error)
      Swal.fire('Error', error.message || 'Error al cargar las asignaciones', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAsignaciones()
  }, [])

  const handleDelete = async (id: string) => {
    if (!canDelete) {
      Swal.fire({
        icon: 'error',
        title: 'Sin permisos',
        text: 'No tienes permisos para eliminar asignaciones'
      })
      return
    }

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
      try {
        // 1. Eliminar registros de asignaciones_conductores
        const { error: conductoresError } = await supabase
          .from('asignaciones_conductores')
          .delete()
          .eq('asignacion_id', id)

        if (conductoresError) throw conductoresError

        // 2. Obtener la asignación antes de eliminarla (para actualizar vehículo)
        const asignacion = asignaciones.find(a => a.id === id)

        // 3. Eliminar la asignación
        const { error: asignacionError } = await supabase
          .from('asignaciones')
          .delete()
          .eq('id', id)

        if (asignacionError) throw asignacionError

        // 4. Actualizar estado del vehículo a "DISPONIBLE"
        if (asignacion?.vehiculo_id) {
          const { data: estadoDisponible, error: estadoError } = await supabase
            .from('vehiculos_estados')
            .select('id')
            .eq('codigo', 'DISPONIBLE')
            .single()

          if (estadoError) {
            console.error('Error al obtener estado DISPONIBLE:', estadoError)
          }

          if (estadoDisponible) {
            const { error: updateError } = await supabase
              .from('vehiculos')
              .update({ estado_id: estadoDisponible.id })
              .eq('id', asignacion.vehiculo_id)

            if (updateError) {
              console.error('Error al actualizar estado del vehículo:', updateError)
            } else {
              console.log('✅ Vehículo vuelto a estado DISPONIBLE')
            }
          }
        }

        Swal.fire('Eliminado', 'La asignación ha sido eliminada', 'success')
        loadAsignaciones()
      } catch (error: any) {
        console.error('Error deleting assignment:', error)
        Swal.fire('Error', error.message || 'Error al eliminar la asignación', 'error')
      }
    }
  }

  const handleStatusChange = async (id: string, newStatus: string) => {
    if (!canEdit) {
      Swal.fire({
        icon: 'error',
        title: 'Sin permisos',
        text: 'No tienes permisos para editar asignaciones'
      })
      return
    }

    try {
      const { error } = await supabase
        .from('asignaciones')
        .update({ estado: newStatus })
        .eq('id', id)

      if (error) throw error

      // Si se finaliza o cancela, actualizar estado del vehículo a DISPONIBLE
      if (newStatus === 'finalizada' || newStatus === 'cancelada') {
        const asignacion = asignaciones.find(a => a.id === id)
        if (asignacion?.vehiculo_id) {
          const { data: estadoDisponible, error: estadoError } = await supabase
            .from('vehiculos_estados')
            .select('id')
            .eq('codigo', 'DISPONIBLE')
            .single()

          if (estadoError) {
            console.error('Error al obtener estado DISPONIBLE:', estadoError)
          }

          if (estadoDisponible) {
            const { error: updateError } = await supabase
              .from('vehiculos')
              .update({ estado_id: estadoDisponible.id })
              .eq('id', asignacion.vehiculo_id)

            if (updateError) {
              console.error('Error al actualizar estado del vehículo:', updateError)
            } else {
              console.log('✅ Vehículo vuelto a estado DISPONIBLE')
            }
          }
        }
      }

      loadAsignaciones()
    } catch (error: any) {
      console.error('Error updating status:', error)
      Swal.fire('Error', error.message || 'Error al actualizar el estado', 'error')
    }
  }

  const filteredAsignaciones = asignaciones.filter(asignacion => {
    const matchesSearch =
      asignacion.numero_asignacion?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      asignacion.vehiculos?.patente.toLowerCase().includes(searchTerm.toLowerCase()) ||
      asignacion.conductores?.nombres.toLowerCase().includes(searchTerm.toLowerCase()) ||
      asignacion.conductores?.apellidos.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesStatus = !statusFilter || asignacion.estado === statusFilter

    return matchesSearch && matchesStatus
  })

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'activa':
        return 'badge-active'
      case 'finalizada':
        return 'badge-completed'
      case 'cancelada':
        return 'badge-cancelled'
      default:
        return ''
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'activa':
        return 'Activa'
      case 'finalizada':
        return 'Finalizada'
      case 'cancelada':
        return 'Cancelada'
      default:
        return status
    }
  }

  const getModalityBadgeClass = (modality: string) => {
    switch (modality) {
      case 'dia_completo':
        return 'badge-dia-completo'
      case 'medio_dia':
        return 'badge-medio-dia'
      case 'por_horas':
        return 'badge-por-horas'
      case 'semanal':
        return 'badge-semanal'
      case 'mensual':
        return 'badge-mensual'
      default:
        return ''
    }
  }

  const getModalityLabel = (modality: string) => {
    switch (modality) {
      case 'dia_completo':
        return 'Día Completo'
      case 'medio_dia':
        return 'Medio Día'
      case 'por_horas':
        return 'Por Horas'
      case 'semanal':
        return 'Semanal'
      case 'mensual':
        return 'Mensual'
      default:
        return modality
    }
  }

  const getHorarioBadgeClass = (horario: string) => {
    switch (horario) {
      case 'Diurno':
        return 'badge-diurno'
      case 'Nocturno':
        return 'badge-nocturno'
      case 'CARGO':
        return 'badge-cargo'
      default:
        return ''
    }
  }

  return (
    <div>
      <style>{`
        .search-wrapper {
          display: flex;
          gap: 12px;
          margin-bottom: 16px;
          flex-wrap: wrap;
        }

        .search-input-container {
          position: relative;
          flex: 1;
          min-width: 250px;
        }

        .search-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: #9CA3AF;
        }

        .search-input {
          width: 100%;
          padding: 10px 12px 10px 40px;
          border: 1px solid #E5E7EB;
          border-radius: 6px;
          font-size: 14px;
          font-family: inherit;
        }

        .search-input:focus {
          outline: none;
          border-color: #E63946;
        }

        .filter-select-container {
          position: relative;
          min-width: 200px;
        }

        .filter-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: #9CA3AF;
        }

        .filter-select {
          width: 100%;
          padding: 10px 12px 10px 40px;
          border: 1px solid #E5E7EB;
          border-radius: 6px;
          font-size: 14px;
          font-family: inherit;
          background: white;
          cursor: pointer;
        }

        .filter-select:focus {
          outline: none;
          border-color: #E63946;
        }

        .table-wrapper {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          border-radius: 12px;
          border: 1px solid #E5E7EB;
          box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
        }

        .assignments-table {
          width: 100%;
          border-collapse: collapse;
          background: white;
          min-width: 1200px;
        }

        .assignments-table th {
          text-align: left;
          padding: 12px;
          background: #F9FAFB;
          font-size: 12px;
          font-weight: 600;
          color: #6B7280;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border-bottom: 1px solid #E5E7EB;
          white-space: nowrap;
        }

        .assignments-table th:last-child {
          text-align: center;
        }

        .assignments-table td {
          padding: 16px 12px;
          border-bottom: 1px solid #E5E7EB;
          color: #1F2937;
          font-size: 14px;
        }

        .assignments-table td:last-child {
          text-align: center;
        }

        .assignments-table tr:hover {
          background: #F9FAFB;
        }

        .badge {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
        }

        .badge-active {
          background: #D1FAE5;
          color: #065F46;
        }

        .badge-completed {
          background: #E0E7FF;
          color: #3730A3;
        }

        .badge-cancelled {
          background: #FEE2E2;
          color: #991B1B;
        }

        .badge-dia-completo {
          background: #DBEAFE;
          color: #1E40AF;
        }

        .badge-medio-dia {
          background: #E9D5FF;
          color: #6B21A8;
        }

        .badge-por-horas {
          background: #FED7AA;
          color: #9A3412;
        }

        .badge-semanal {
          background: #D1FAE5;
          color: #065F46;
        }

        .badge-mensual {
          background: #C7D2FE;
          color: #3730A3;
        }

        .badge-diurno {
          background: #FEF3C7;
          color: #92400E;
        }

        .badge-nocturno {
          background: #DBEAFE;
          color: #1E3A8A;
        }

        .badge-cargo {
          background: #E9D5FF;
          color: #6B21A8;
        }

        .btn-action {
          padding: 6px 12px;
          border: 1px solid #E5E7EB;
          border-radius: 6px;
          background: white;
          color: #1F2937;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          margin: 0 4px;
        }

        .btn-action:hover {
          border-color: #3B82F6;
          color: #3B82F6;
          background: #EFF6FF;
        }

        .btn-action.btn-delete:hover {
          border-color: #E63946;
          color: #E63946;
          background: #FEE2E2;
        }

        .btn-action:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-action:disabled:hover {
          border-color: #E5E7EB;
          color: #1F2937;
          background: white;
        }

        .btn-primary {
          padding: 12px 28px;
          background: #E63946;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          box-shadow: 0 4px 6px rgba(230, 57, 70, 0.2);
        }

        .btn-primary:hover {
          background: #D62828;
          transform: translateY(-2px);
          box-shadow: 0 6px 12px rgba(230, 57, 70, 0.3);
        }

        .btn-primary:disabled {
          background: #D1D5DB;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }

        .status-select {
          padding: 6px 12px;
          border: 1px solid #E5E7EB;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          background: white;
        }

        .status-select:focus {
          outline: none;
          border-color: #E63946;
        }

        .conductores-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .conductor-item {
          font-size: 13px;
          color: #1F2937;
        }

        .loading-state {
          text-align: center;
          padding: 60px 20px;
          color: #6B7280;
        }

        .empty-state {
          text-align: center;
          padding: 60px 20px;
          color: #9CA3AF;
        }

        @media (max-width: 768px) {
          .assignments-table {
            min-width: 1100px;
          }
        }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: '32px', textAlign: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '24px', fontWeight: '700', color: '#1F2937' }}>
          Gestión de Asignaciones
        </h3>
        <p style={{ margin: '8px 0 0 0', fontSize: '15px', color: '#6B7280' }}>
          {filteredAsignaciones.length} asignación{filteredAsignaciones.length !== 1 ? 'es' : ''} encontrada{filteredAsignaciones.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Action Button */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          className="btn-primary"
          onClick={() => setShowWizard(true)}
          disabled={!canCreate}
          title={!canCreate ? 'No tienes permisos para crear asignaciones' : 'Nueva Asignación'}
        >
          <Plus size={18} />
          Nueva Asignación
        </button>
      </div>

      {/* Filtros y búsqueda */}
      <div className="search-wrapper">
        <div className="search-input-container">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            placeholder="Buscar por vehículo, conductor o número..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="filter-select-container">
          <Filter size={18} className="filter-icon" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="filter-select"
          >
            <option value="">Todos los estados</option>
            <option value="activa">Activa</option>
            <option value="finalizada">Finalizada</option>
            <option value="cancelada">Cancelada</option>
          </select>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="loading-state">
          Cargando asignaciones...
        </div>
      )}

      {/* Tabla de asignaciones */}
      {!loading && (
        <>
          <div className="table-wrapper">
            <table className="assignments-table">
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Vehículo</th>
                  <th>Modalidad</th>
                  <th>Horario</th>
                  <th>Conductores</th>
                  <th>Fecha Inicio</th>
                  <th>Fecha Fin</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredAsignaciones.map((asignacion) => (
                  <tr key={asignacion.id}>
                    <td>
                      <strong>{asignacion.numero_asignacion || 'N/A'}</strong>
                    </td>
                    <td>
                      <strong>{asignacion.vehiculos?.patente || 'N/A'}</strong>
                      <br />
                      <span style={{ fontSize: '12px', color: '#6B7280' }}>
                        {asignacion.vehiculos?.marca} {asignacion.vehiculos?.modelo}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${getModalityBadgeClass(asignacion.modalidad)}`}>
                        {getModalityLabel(asignacion.modalidad)}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${getHorarioBadgeClass(asignacion.horario)}`}>
                        {asignacion.horario}
                      </span>
                    </td>
                    <td>
                      <div className="conductores-list">
                        {asignacion.asignaciones_conductores && asignacion.asignaciones_conductores.length > 0 ? (
                          asignacion.asignaciones_conductores.map((ac) => (
                            <span key={ac.id} className="conductor-item">
                              {ac.conductores.nombres} {ac.conductores.apellidos}
                            </span>
                          ))
                        ) : (
                          <span style={{ color: '#9CA3AF', fontSize: '12px' }}>Sin conductores</span>
                        )}
                      </div>
                    </td>
                    <td>
                      {new Date(asignacion.fecha_inicio).toLocaleDateString('es-ES', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </td>
                    <td>
                      {asignacion.fecha_fin
                        ? new Date(asignacion.fecha_fin).toLocaleDateString('es-ES', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })
                        : 'Sin definir'}
                    </td>
                    <td>
                      <select
                        value={asignacion.estado}
                        onChange={(e) => handleStatusChange(asignacion.id, e.target.value)}
                        className={`status-select badge ${getStatusBadgeClass(asignacion.estado)}`}
                        disabled={!canEdit}
                        style={{ border: 'none', cursor: canEdit ? 'pointer' : 'not-allowed' }}
                      >
                        <option value="activa">Activa</option>
                        <option value="finalizada">Finalizada</option>
                        <option value="cancelada">Cancelada</option>
                      </select>
                    </td>
                    <td>
                      <button
                        className="btn-action"
                        title="Ver detalles"
                      >
                        <Eye size={16} style={{ display: 'inline', verticalAlign: 'middle' }} />
                      </button>
                      <button
                        onClick={() => handleDelete(asignacion.id)}
                        className="btn-action btn-delete"
                        title="Eliminar"
                        disabled={!canDelete}
                      >
                        <Trash2 size={16} style={{ display: 'inline', verticalAlign: 'middle' }} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredAsignaciones.length === 0 && !loading && (
            <div className="empty-state">
              No se encontraron asignaciones con los filtros seleccionados.
            </div>
          )}
        </>
      )}

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
    </div>
  )
}
