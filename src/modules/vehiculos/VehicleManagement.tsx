// src/components/admin/VehicleManagement.tsx
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { usePermissions } from '../../contexts/PermissionsContext'
import Swal from 'sweetalert2'
import type {
  VehiculoWithRelations,
  VehiculoTipo,
  VehiculoEstado,
  CombustibleTipo,
  GpsTipo
} from '../../types/database.types'

export function VehicleManagement() {
  const [vehiculos, setVehiculos] = useState<VehiculoWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedVehiculo, setSelectedVehiculo] = useState<VehiculoWithRelations | null>(null)

  // Catalog states
  const [vehiculosTipos, setVehiculosTipos] = useState<VehiculoTipo[]>([])
  const [vehiculosEstados, setVehiculosEstados] = useState<VehiculoEstado[]>([])
  const [combustiblesTipos, setCombustiblesTipos] = useState<CombustibleTipo[]>([])
  const [gpsTipos, setGpsTipos] = useState<GpsTipo[]>([])

  const { canCreate, canUpdate, canDelete } = usePermissions()

  const [formData, setFormData] = useState({
    patente: '',
    marca: '',
    modelo: '',
    anio: new Date().getFullYear(),
    color: '',
    tipo_id: '',
    tipo_combustible_id: '',
    tipo_gps_id: '',
    gps_uss: false,
    numero_motor: '',
    numero_chasis: '',
    provisoria: '',
    estado_id: '',
    kilometraje_actual: 0,
    fecha_adquisicion: '',
    fecha_ulti_inspeccion: '',
    fecha_prox_inspeccion: '',
    seguro_numero: '',
    seguro_vigencia: '',
    titular: '',
    notas: ''
  })

  useEffect(() => {
    loadVehiculos()
    loadCatalogs()
  }, [])

  const loadCatalogs = async () => {
    try {
      const [tiposRes, estadosRes, combustiblesRes, gpsRes] = await Promise.all([
        supabase.from('vehiculos_tipos').select('*').order('descripcion'),
        supabase.from('vehiculos_estados').select('*').order('descripcion'),
        supabase.from('combustibles_tipos').select('*').order('descripcion'),
        supabase.from('gps_tipos').select('*').order('descripcion')
      ])

      console.log('Catálogos cargados:', { tiposRes, estadosRes, combustiblesRes, gpsRes })

      if (tiposRes.data) setVehiculosTipos(tiposRes.data)
      if (estadosRes.data) setVehiculosEstados(estadosRes.data)
      if (combustiblesRes.data) setCombustiblesTipos(combustiblesRes.data)
      if (gpsRes.data) setGpsTipos(gpsRes.data)

      if (tiposRes.error) console.error('Error vehiculos_tipos:', tiposRes.error)
      if (estadosRes.error) console.error('Error vehiculos_estados:', estadosRes.error)
      if (combustiblesRes.error) console.error('Error combustibles_tipos:', combustiblesRes.error)
      if (gpsRes.error) console.error('Error gps_tipos:', gpsRes.error)
    } catch (err: any) {
      console.error('Error cargando catálogos:', err)
    }
  }

  const loadVehiculos = async () => {
    setLoading(true)
    setError('')

    try {
      const { data, error: fetchError } = await supabase
        .from('vehiculos')
        .select('*')
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError

      // Cargar las relaciones manualmente
      if (data && data.length > 0) {
        const vehiculosConRelaciones = await Promise.all(
          data.map(async (vehiculo: any) => {
            const relaciones: any = { ...vehiculo }

            if (vehiculo.tipo_id) {
              const { data: tipo } = await supabase.from('vehiculos_tipos').select('id, codigo, descripcion').eq('id', vehiculo.tipo_id).single()
              relaciones.vehiculos_tipos = tipo
            }

            if (vehiculo.estado_id) {
              const { data: estado } = await supabase.from('vehiculos_estados').select('id, codigo, descripcion').eq('id', vehiculo.estado_id).single()
              relaciones.vehiculos_estados = estado
            }

            if (vehiculo.tipo_combustible_id) {
              const { data: combustible } = await supabase.from('combustibles_tipos').select('id, codigo, descripcion').eq('id', vehiculo.tipo_combustible_id).single()
              relaciones.combustibles_tipos = combustible
            }

            if (vehiculo.tipo_gps_id) {
              const { data: gps } = await supabase.from('gps_tipos').select('id, codigo, descripcion').eq('id', vehiculo.tipo_gps_id).single()
              relaciones.gps_tipos = gps
            }

            return relaciones
          })
        )

        setVehiculos(vehiculosConRelaciones)
      } else {
        setVehiculos([])
      }
    } catch (err: any) {
      console.error('Error cargando vehículos:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!canCreate('vehiculos')) {
      Swal.fire({
        icon: 'error',
        title: 'Sin permisos',
        text: 'No tienes permisos para crear vehículos',
        confirmButtonColor: '#E63946'
      })
      return
    }

    if (!formData.patente || !formData.marca || !formData.modelo) {
      Swal.fire({
        icon: 'warning',
        title: 'Campos requeridos',
        text: 'Complete todos los campos requeridos',
        confirmButtonColor: '#E63946'
      })
      return
    }

    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()

      const { error: insertError} = await supabase
        .from('vehiculos')
        // @ts-expect-error - Tipo generado incorrectamente por Supabase CLI
        .insert([{
          patente: formData.patente.toUpperCase(),
          marca: formData.marca || null,
          modelo: formData.modelo || null,
          anio: formData.anio || null,
          color: formData.color || null,
          tipo_id: formData.tipo_id || null,
          tipo_combustible_id: formData.tipo_combustible_id || null,
          tipo_gps_id: formData.tipo_gps_id || null,
          gps_uss: formData.gps_uss,
          numero_motor: formData.numero_motor || null,
          numero_chasis: formData.numero_chasis || null,
          provisoria: formData.provisoria || null,
          estado_id: formData.estado_id || null,
          kilometraje_actual: formData.kilometraje_actual,
          fecha_adquisicion: formData.fecha_adquisicion || null,
          fecha_ulti_inspeccion: formData.fecha_ulti_inspeccion || null,
          fecha_prox_inspeccion: formData.fecha_prox_inspeccion || null,
          seguro_numero: formData.seguro_numero || null,
          seguro_vigencia: formData.seguro_vigencia || null,
          titular: formData.titular || null,
          notas: formData.notas || null,
          created_by: user?.id
        }])

      if (insertError) throw insertError

      Swal.fire({
        icon: 'success',
        title: '¡Éxito!',
        text: 'Vehículo creado exitosamente',
        confirmButtonColor: '#E63946',
        timer: 2000
      })
      setShowCreateModal(false)
      resetForm()
      await loadVehiculos()
    } catch (err: any) {
      console.error('Error creando vehículo:', err)
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.message,
        confirmButtonColor: '#E63946'
      })
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async () => {
    if (!canUpdate('vehiculos')) {
      Swal.fire({
        icon: 'error',
        title: 'Sin permisos',
        text: 'No tienes permisos para editar vehículos',
        confirmButtonColor: '#E63946'
      })
      return
    }

    if (!selectedVehiculo) return

    setSaving(true)
    try {
      const { error: updateError } = await supabase
        .from('vehiculos')
        // @ts-expect-error - Tipo generado incorrectamente por Supabase CLI
        .update({
          patente: formData.patente.toUpperCase(),
          marca: formData.marca || null,
          modelo: formData.modelo || null,
          anio: formData.anio || null,
          color: formData.color || null,
          tipo_id: formData.tipo_id || null,
          tipo_combustible_id: formData.tipo_combustible_id || null,
          tipo_gps_id: formData.tipo_gps_id || null,
          gps_uss: formData.gps_uss,
          numero_motor: formData.numero_motor || null,
          numero_chasis: formData.numero_chasis || null,
          provisoria: formData.provisoria || null,
          estado_id: formData.estado_id || null,
          kilometraje_actual: formData.kilometraje_actual,
          fecha_adquisicion: formData.fecha_adquisicion || null,
          fecha_ulti_inspeccion: formData.fecha_ulti_inspeccion || null,
          fecha_prox_inspeccion: formData.fecha_prox_inspeccion || null,
          seguro_numero: formData.seguro_numero || null,
          seguro_vigencia: formData.seguro_vigencia || null,
          titular: formData.titular || null,
          notas: formData.notas || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedVehiculo.id)

      if (updateError) throw updateError

      Swal.fire({
        icon: 'success',
        title: '¡Éxito!',
        text: 'Vehículo actualizado exitosamente',
        confirmButtonColor: '#E63946',
        timer: 2000
      })
      setShowEditModal(false)
      setSelectedVehiculo(null)
      resetForm()
      await loadVehiculos()
    } catch (err: any) {
      console.error('Error actualizando vehículo:', err)
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.message,
        confirmButtonColor: '#E63946'
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!canDelete('vehiculos')) {
      Swal.fire({
        icon: 'error',
        title: 'Sin permisos',
        text: 'No tienes permisos para eliminar vehículos',
        confirmButtonColor: '#E63946'
      })
      return
    }

    if (!selectedVehiculo) return

    setSaving(true)
    try {
      const { error: deleteError } = await supabase
        .from('vehiculos')
        .delete()
        .eq('id', selectedVehiculo.id)

      if (deleteError) throw deleteError

      Swal.fire({
        icon: 'success',
        title: '¡Éxito!',
        text: 'Vehículo eliminado exitosamente',
        confirmButtonColor: '#E63946',
        timer: 2000
      })
      setShowDeleteModal(false)
      setSelectedVehiculo(null)
      await loadVehiculos()
    } catch (err: any) {
      console.error('Error eliminando vehículo:', err)
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.message,
        confirmButtonColor: '#E63946'
      })
    } finally {
      setSaving(false)
    }
  }

  const openEditModal = (vehiculo: VehiculoWithRelations) => {
    setSelectedVehiculo(vehiculo)
    setFormData({
      patente: vehiculo.patente,
      marca: vehiculo.marca || '',
      modelo: vehiculo.modelo || '',
      anio: vehiculo.anio || new Date().getFullYear(),
      color: vehiculo.color || '',
      tipo_id: vehiculo.tipo_id || '',
      tipo_combustible_id: vehiculo.tipo_combustible_id || '',
      tipo_gps_id: vehiculo.tipo_gps_id || '',
      gps_uss: vehiculo.gps_uss,
      numero_motor: vehiculo.numero_motor || '',
      numero_chasis: vehiculo.numero_chasis || '',
      provisoria: vehiculo.provisoria || '',
      estado_id: vehiculo.estado_id || '',
      kilometraje_actual: vehiculo.kilometraje_actual,
      fecha_adquisicion: vehiculo.fecha_adquisicion || '',
      fecha_ulti_inspeccion: vehiculo.fecha_ulti_inspeccion || '',
      fecha_prox_inspeccion: vehiculo.fecha_prox_inspeccion || '',
      seguro_numero: vehiculo.seguro_numero || '',
      seguro_vigencia: vehiculo.seguro_vigencia || '',
      titular: vehiculo.titular || '',
      notas: vehiculo.notas || ''
    })
    setShowEditModal(true)
  }

  const openDeleteModal = (vehiculo: VehiculoWithRelations) => {
    setSelectedVehiculo(vehiculo)
    setShowDeleteModal(true)
  }

  const resetForm = () => {
    setFormData({
      patente: '',
      marca: '',
      modelo: '',
      anio: new Date().getFullYear(),
      color: '',
      tipo_id: '',
      tipo_combustible_id: '',
      tipo_gps_id: '',
      gps_uss: false,
      numero_motor: '',
      numero_chasis: '',
      provisoria: '',
      estado_id: '',
      kilometraje_actual: 0,
      fecha_adquisicion: '',
      fecha_ulti_inspeccion: '',
      fecha_prox_inspeccion: '',
      seguro_numero: '',
      seguro_vigencia: '',
      titular: '',
      notas: ''
    })
  }

  const getEstadoBadgeClass = (estado: string) => {
    switch (estado) {
      case 'disponible':
        return 'badge-available'
      case 'en_uso':
        return 'badge-in-use'
      case 'mantenimiento':
        return 'badge-maintenance'
      default:
        return 'badge-inactive'
    }
  }

  const getEstadoLabel = (estado: string) => {
    switch (estado) {
      case 'disponible':
        return 'Disponible'
      case 'en_uso':
        return 'En Uso'
      case 'mantenimiento':
        return 'Mantenimiento'
      default:
        return estado
    }
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: '#6B7280' }}>
        Cargando vehículos...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{
        padding: '16px',
        background: '#FEE2E2',
        color: '#DC2626',
        borderRadius: '8px'
      }}>
        Error: {error}
      </div>
    )
  }

  return (
    <div>
      <style>{`
        .table-wrapper {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          border-radius: 12px;
          border: 1px solid #E5E7EB;
          box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
        }

        .vehiculos-table {
          width: 100%;
          border-collapse: collapse;
          background: white;
          min-width: 900px;
        }

        .vehiculos-table th {
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

        .vehiculos-table th:last-child {
          min-width: 150px;
          text-align: center;
        }

        .vehiculos-table td {
          padding: 16px 12px;
          border-bottom: 1px solid #E5E7EB;
          color: #1F2937;
          font-size: 14px;
        }

        .vehiculos-table td:last-child {
          text-align: center;
          min-width: 150px;
        }

        .vehiculos-table tr:hover {
          background: #F9FAFB;
        }

        .patente-badge {
          display: inline-block;
          background: #1F2937;
          color: white;
          padding: 6px 12px;
          border-radius: 6px;
          font-weight: 700;
          font-family: monospace;
          font-size: 14px;
          letter-spacing: 1px;
        }

        .badge {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
        }

        .badge-available {
          background: #D1FAE5;
          color: #065F46;
        }

        .badge-in-use {
          background: #DBEAFE;
          color: #1E40AF;
        }

        .badge-maintenance {
          background: #FEF3C7;
          color: #92400E;
        }

        .badge-inactive {
          background: #FEE2E2;
          color: #DC2626;
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

        .btn-action:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-action.btn-edit:not(:disabled):hover {
          border-color: #3B82F6;
          color: #3B82F6;
          background: #EFF6FF;
        }

        .btn-action.btn-view:hover {
          border-color: #8B5CF6;
          color: #8B5CF6;
          background: #F5F3FF;
        }

        .btn-action.btn-delete:not(:disabled):hover {
          border-color: #E63946;
          color: #E63946;
          background: #FEE2E2;
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
          box-shadow: 0 4px 6px rgba(230, 57, 70, 0.2);
        }

        .btn-primary:hover {
          background: #D62828;
          transform: translateY(-2px);
          box-shadow: 0 6px 12px rgba(230, 57, 70, 0.3);
        }

        .btn-primary:disabled {
          background: #9CA3AF;
          cursor: not-allowed;
        }

        .btn-secondary {
          padding: 10px 20px;
          background: white;
          color: #6B7280;
          border: 1px solid #E5E7EB;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-secondary:hover {
          background: #F9FAFB;
        }

        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .modal-content {
          background: white;
          padding: 40px;
          border-radius: 16px;
          max-width: 900px;
          width: 90%;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 16px;
        }

        .form-group {
          margin-bottom: 16px;
        }

        .form-label {
          display: block;
          margin-bottom: 8px;
          font-weight: 600;
          font-size: 14px;
          color: #1F2937;
        }

        .form-input {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #E5E7EB;
          border-radius: 6px;
          font-size: 14px;
          font-family: inherit;
        }

        .form-input:focus {
          outline: none;
          border-color: #E63946;
        }

        .delete-warning {
          background: #FEF2F2;
          border: 1px solid #FEE2E2;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 20px;
        }

        .delete-warning-title {
          color: #DC2626;
          font-weight: 600;
          font-size: 14px;
          margin-bottom: 8px;
        }

        .delete-warning-text {
          color: #7F1D1D;
          font-size: 14px;
          line-height: 1.6;
        }

        .no-permission-msg {
          background: #FEF3C7;
          border: 1px solid #FDE68A;
          border-radius: 8px;
          padding: 12px 16px;
          margin-bottom: 20px;
          color: #92400E;
          font-size: 14px;
        }

        @media (max-width: 768px) {
          .vehiculos-table {
            min-width: 800px;
          }
          .form-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: '32px', textAlign: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '24px', fontWeight: '700', color: '#1F2937' }}>
          Gestión de Vehículos
        </h3>
        <p style={{ margin: '8px 0 0 0', fontSize: '15px', color: '#6B7280' }}>
          {vehiculos.length} vehículo{vehiculos.length !== 1 ? 's' : ''} registrado{vehiculos.length !== 1 ? 's' : ''}
        </p>
      </div>

      {!canCreate('vehiculos') && (
        <div className="no-permission-msg">
          ℹ️ No tienes permisos para crear vehículos. Solo puedes ver la lista.
        </div>
      )}

      {/* Action Button */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          className="btn-primary"
          onClick={() => setShowCreateModal(true)}
          disabled={!canCreate('vehiculos')}
          title={!canCreate('vehiculos') ? 'No tienes permisos para crear vehículos' : ''}
        >
          + Crear Vehículo
        </button>
      </div>

      {/* Tabla de vehículos */}
      <div className="table-wrapper">
        <table className="vehiculos-table">
          <thead>
            <tr>
              <th>Patente</th>
              <th>Marca</th>
              <th>Modelo</th>
              <th>Año</th>
              <th>Kilometraje</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {vehiculos.map((vehiculo) => (
              <tr key={vehiculo.id}>
                <td>
                  <span className="patente-badge">{vehiculo.patente}</span>
                </td>
                <td>
                  <strong>{vehiculo.marca}</strong>
                </td>
                <td>{vehiculo.modelo || 'N/A'}</td>
                <td>{vehiculo.anio || 'N/A'}</td>
                <td>{vehiculo.kilometraje_actual.toLocaleString()} km</td>
                <td>
                  <span className={`badge`} style={{
                    backgroundColor: '#10B981',
                    color: 'white'
                  }}>
                    {vehiculo.vehiculos_estados?.descripcion || 'N/A'}
                  </span>
                </td>
                <td>
                  <button
                    className="btn-action btn-view"
                    onClick={() => {
                      setSelectedVehiculo(vehiculo)
                      setShowDetailsModal(true)
                    }}
                    title="Ver detalles"
                  >
                    👁️ Ver
                  </button>
                  <button
                    className="btn-action btn-edit"
                    onClick={() => openEditModal(vehiculo)}
                    disabled={!canUpdate('vehiculos')}
                    title={!canUpdate('vehiculos') ? 'No tienes permisos para editar' : 'Editar vehículo'}
                  >
                    ✏️ Editar
                  </button>
                  <button
                    className="btn-action btn-delete"
                    onClick={() => openDeleteModal(vehiculo)}
                    disabled={!canDelete('vehiculos')}
                    title={!canDelete('vehiculos') ? 'No tienes permisos para eliminar' : 'Eliminar vehículo'}
                  >
                    🗑️ Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {vehiculos.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#6B7280' }}>
          No hay vehículos registrados. {canCreate('vehiculos') ? 'Crea el primero usando el botón "+ Crear Vehículo".' : ''}
        </div>
      )}

      {/* Modal Crear */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => !saving && setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '900px' }}>
            <h2 style={{ marginTop: 0, fontSize: '20px', fontWeight: '700' }}>
              Crear Nuevo Vehículo
            </h2>

            <div className="section-title">Información Básica</div>

            <div className="form-group">
              <label className="form-label">Patente *</label>
              <input
                type="text"
                className="form-input"
                value={formData.patente}
                onChange={(e) => setFormData({ ...formData, patente: e.target.value.toUpperCase() })}
                placeholder="ABC-123"
                disabled={saving}
                maxLength={10}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Marca</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.marca}
                  onChange={(e) => setFormData({ ...formData, marca: e.target.value })}
                  placeholder="Toyota, Ford, etc."
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Modelo</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.modelo}
                  onChange={(e) => setFormData({ ...formData, modelo: e.target.value })}
                  placeholder="Hilux, Ranger, etc."
                  disabled={saving}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Año</label>
                <input
                  type="number"
                  className="form-input"
                  value={formData.anio}
                  onChange={(e) => setFormData({ ...formData, anio: parseInt(e.target.value) })}
                  min="1900"
                  max={new Date().getFullYear() + 1}
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Color</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  placeholder="Blanco, Negro, etc."
                  disabled={saving}
                />
              </div>
            </div>

            <div className="section-title">Tipo y Características</div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Tipo</label>
                <select
                  className="form-input"
                  value={formData.tipo_id}
                  onChange={(e) => setFormData({ ...formData, tipo_id: e.target.value })}
                  disabled={saving}
                >
                  <option value="">Seleccionar...</option>
                  {vehiculosTipos.map((tipo: any) => (
                    <option key={tipo.id} value={tipo.id}>{tipo.descripcion}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Tipo Combustible</label>
                <select
                  className="form-input"
                  value={formData.tipo_combustible_id}
                  onChange={(e) => setFormData({ ...formData, tipo_combustible_id: e.target.value })}
                  disabled={saving}
                >
                  <option value="">Seleccionar...</option>
                  {combustiblesTipos.map((tipo: any) => (
                    <option key={tipo.id} value={tipo.id}>{tipo.descripcion}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Tipo GPS</label>
                <select
                  className="form-input"
                  value={formData.tipo_gps_id}
                  onChange={(e) => setFormData({ ...formData, tipo_gps_id: e.target.value })}
                  disabled={saving}
                >
                  <option value="">Seleccionar...</option>
                  {gpsTipos.map((tipo: any) => (
                    <option key={tipo.id} value={tipo.id}>{tipo.descripcion}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', marginTop: '28px' }}>
                  <input
                    type="checkbox"
                    className="form-checkbox"
                    checked={formData.gps_uss}
                    onChange={(e) => setFormData({ ...formData, gps_uss: e.target.checked })}
                    disabled={saving}
                  />
                  <span style={{ fontSize: '14px', fontWeight: '500', marginLeft: '8px' }}>GPS USS</span>
                </label>
              </div>
            </div>

            <div className="section-title">Datos Técnicos</div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Número Motor</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.numero_motor}
                  onChange={(e) => setFormData({ ...formData, numero_motor: e.target.value })}
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Número Chasis</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.numero_chasis}
                  onChange={(e) => setFormData({ ...formData, numero_chasis: e.target.value })}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Provisoria</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.provisoria}
                  onChange={(e) => setFormData({ ...formData, provisoria: e.target.value })}
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Kilometraje Actual</label>
                <input
                  type="number"
                  className="form-input"
                  value={formData.kilometraje_actual}
                  onChange={(e) => setFormData({ ...formData, kilometraje_actual: parseInt(e.target.value) || 0 })}
                  min="0"
                  disabled={saving}
                />
              </div>
            </div>

            <div className="section-title">Estado y Fechas</div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Estado</label>
                <select
                  className="form-input"
                  value={formData.estado_id}
                  onChange={(e) => setFormData({ ...formData, estado_id: e.target.value })}
                  disabled={saving}
                >
                  <option value="">Seleccionar...</option>
                  {vehiculosEstados.map((estado: any) => (
                    <option key={estado.id} value={estado.id}>{estado.descripcion}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Fecha Adquisición</label>
                <input
                  type="date"
                  className="form-input"
                  value={formData.fecha_adquisicion}
                  onChange={(e) => setFormData({ ...formData, fecha_adquisicion: e.target.value })}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Fecha Última Inspección</label>
                <input
                  type="date"
                  className="form-input"
                  value={formData.fecha_ulti_inspeccion}
                  onChange={(e) => setFormData({ ...formData, fecha_ulti_inspeccion: e.target.value })}
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Fecha Próxima Inspección</label>
                <input
                  type="date"
                  className="form-input"
                  value={formData.fecha_prox_inspeccion}
                  onChange={(e) => setFormData({ ...formData, fecha_prox_inspeccion: e.target.value })}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="section-title">Seguro</div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Número Seguro</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.seguro_numero}
                  onChange={(e) => setFormData({ ...formData, seguro_numero: e.target.value })}
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Vigencia Seguro</label>
                <input
                  type="date"
                  className="form-input"
                  value={formData.seguro_vigencia}
                  onChange={(e) => setFormData({ ...formData, seguro_vigencia: e.target.value })}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="section-title">Información Adicional</div>

            <div className="form-group">
              <label className="form-label">Titular</label>
              <input
                type="text"
                className="form-input"
                value={formData.titular}
                onChange={(e) => setFormData({ ...formData, titular: e.target.value })}
                disabled={saving}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Notas</label>
              <textarea
                className="form-input"
                value={formData.notas}
                onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
                disabled={saving}
                rows={3}
                style={{ resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowCreateModal(false)
                  resetForm()
                }}
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                className="btn-primary"
                onClick={handleCreate}
                disabled={saving}
              >
                {saving ? 'Creando...' : 'Crear Vehículo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar */}
      {showEditModal && selectedVehiculo && (
        <div className="modal-overlay" onClick={() => !saving && setShowEditModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '900px' }}>
            <h2 style={{ marginTop: 0, fontSize: '20px', fontWeight: '700' }}>
              Editar Vehículo
            </h2>

            <div className="section-title">Información Básica</div>

            <div className="form-group">
              <label className="form-label">Patente *</label>
              <input
                type="text"
                className="form-input"
                value={formData.patente}
                onChange={(e) => setFormData({ ...formData, patente: e.target.value.toUpperCase() })}
                disabled={saving}
                maxLength={10}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Marca</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.marca}
                  onChange={(e) => setFormData({ ...formData, marca: e.target.value })}
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Modelo</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.modelo}
                  onChange={(e) => setFormData({ ...formData, modelo: e.target.value })}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Año</label>
                <input
                  type="number"
                  className="form-input"
                  value={formData.anio}
                  onChange={(e) => setFormData({ ...formData, anio: parseInt(e.target.value) })}
                  min="1900"
                  max={new Date().getFullYear() + 1}
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Color</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="section-title">Tipo y Características</div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Tipo</label>
                <select
                  className="form-input"
                  value={formData.tipo_id}
                  onChange={(e) => setFormData({ ...formData, tipo_id: e.target.value })}
                  disabled={saving}
                >
                  <option value="">Seleccionar...</option>
                  {vehiculosTipos.map((tipo: any) => (
                    <option key={tipo.id} value={tipo.id}>{tipo.descripcion}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Tipo Combustible</label>
                <select
                  className="form-input"
                  value={formData.tipo_combustible_id}
                  onChange={(e) => setFormData({ ...formData, tipo_combustible_id: e.target.value })}
                  disabled={saving}
                >
                  <option value="">Seleccionar...</option>
                  {combustiblesTipos.map((tipo: any) => (
                    <option key={tipo.id} value={tipo.id}>{tipo.descripcion}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Tipo GPS</label>
                <select
                  className="form-input"
                  value={formData.tipo_gps_id}
                  onChange={(e) => setFormData({ ...formData, tipo_gps_id: e.target.value })}
                  disabled={saving}
                >
                  <option value="">Seleccionar...</option>
                  {gpsTipos.map((tipo: any) => (
                    <option key={tipo.id} value={tipo.id}>{tipo.descripcion}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', marginTop: '28px' }}>
                  <input
                    type="checkbox"
                    className="form-checkbox"
                    checked={formData.gps_uss}
                    onChange={(e) => setFormData({ ...formData, gps_uss: e.target.checked })}
                    disabled={saving}
                  />
                  <span style={{ fontSize: '14px', fontWeight: '500', marginLeft: '8px' }}>GPS USS</span>
                </label>
              </div>
            </div>

            <div className="section-title">Datos Técnicos</div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Número Motor</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.numero_motor}
                  onChange={(e) => setFormData({ ...formData, numero_motor: e.target.value })}
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Número Chasis</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.numero_chasis}
                  onChange={(e) => setFormData({ ...formData, numero_chasis: e.target.value })}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Provisoria</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.provisoria}
                  onChange={(e) => setFormData({ ...formData, provisoria: e.target.value })}
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Kilometraje Actual</label>
                <input
                  type="number"
                  className="form-input"
                  value={formData.kilometraje_actual}
                  onChange={(e) => setFormData({ ...formData, kilometraje_actual: parseInt(e.target.value) || 0 })}
                  min="0"
                  disabled={saving}
                />
              </div>
            </div>

            <div className="section-title">Estado y Fechas</div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Estado</label>
                <select
                  className="form-input"
                  value={formData.estado_id}
                  onChange={(e) => setFormData({ ...formData, estado_id: e.target.value })}
                  disabled={saving}
                >
                  <option value="">Seleccionar...</option>
                  {vehiculosEstados.map((estado: any) => (
                    <option key={estado.id} value={estado.id}>{estado.descripcion}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Fecha Adquisición</label>
                <input
                  type="date"
                  className="form-input"
                  value={formData.fecha_adquisicion}
                  onChange={(e) => setFormData({ ...formData, fecha_adquisicion: e.target.value })}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Fecha Última Inspección</label>
                <input
                  type="date"
                  className="form-input"
                  value={formData.fecha_ulti_inspeccion}
                  onChange={(e) => setFormData({ ...formData, fecha_ulti_inspeccion: e.target.value })}
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Fecha Próxima Inspección</label>
                <input
                  type="date"
                  className="form-input"
                  value={formData.fecha_prox_inspeccion}
                  onChange={(e) => setFormData({ ...formData, fecha_prox_inspeccion: e.target.value })}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="section-title">Seguro</div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Número Seguro</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.seguro_numero}
                  onChange={(e) => setFormData({ ...formData, seguro_numero: e.target.value })}
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Vigencia Seguro</label>
                <input
                  type="date"
                  className="form-input"
                  value={formData.seguro_vigencia}
                  onChange={(e) => setFormData({ ...formData, seguro_vigencia: e.target.value })}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="section-title">Información Adicional</div>

            <div className="form-group">
              <label className="form-label">Titular</label>
              <input
                type="text"
                className="form-input"
                value={formData.titular}
                onChange={(e) => setFormData({ ...formData, titular: e.target.value })}
                disabled={saving}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Notas</label>
              <textarea
                className="form-input"
                value={formData.notas}
                onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
                disabled={saving}
                rows={3}
                style={{ resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowEditModal(false)
                  setSelectedVehiculo(null)
                  resetForm()
                }}
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                className="btn-primary"
                onClick={handleUpdate}
                disabled={saving}
              >
                {saving ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Ver Detalles */}
      {showDetailsModal && selectedVehiculo && (
        <div className="modal-overlay" onClick={() => setShowDetailsModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0, fontSize: '20px', fontWeight: '700', marginBottom: '24px' }}>
              Detalles del Vehículo
            </h2>

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '16px',
              marginBottom: '24px'
            }}>
              <div>
                <label style={{ fontWeight: '600', fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>
                  PATENTE
                </label>
                <div className="patente-badge" style={{ display: 'inline-block' }}>
                  {selectedVehiculo.patente}
                </div>
              </div>

              <div>
                <label style={{ fontWeight: '600', fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>
                  ESTADO
                </label>
                <span className={`badge ${getEstadoBadgeClass(selectedVehiculo.estado)}`}>
                  {getEstadoLabel(selectedVehiculo.estado)}
                </span>
              </div>

              <div>
                <label style={{ fontWeight: '600', fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>
                  MARCA
                </label>
                <div style={{ fontSize: '14px', color: '#1F2937' }}>
                  {selectedVehiculo.marca}
                </div>
              </div>

              <div>
                <label style={{ fontWeight: '600', fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>
                  MODELO
                </label>
                <div style={{ fontSize: '14px', color: '#1F2937' }}>
                  {selectedVehiculo.modelo}
                </div>
              </div>

              <div>
                <label style={{ fontWeight: '600', fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>
                  AÑO
                </label>
                <div style={{ fontSize: '14px', color: '#1F2937' }}>
                  {selectedVehiculo.anio || 'N/A'}
                </div>
              </div>

              <div>
                <label style={{ fontWeight: '600', fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>
                  KILOMETRAJE
                </label>
                <div style={{ fontSize: '14px', color: '#1F2937' }}>
                  {selectedVehiculo.kilometraje.toLocaleString()} km
                </div>
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontWeight: '600', fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>
                  FECHA DE CREACIÓN
                </label>
                <div style={{ fontSize: '14px', color: '#1F2937' }}>
                  {new Date(selectedVehiculo.created_at).toLocaleString('es-AR')}
                </div>
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontWeight: '600', fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>
                  ÚLTIMA ACTUALIZACIÓN
                </label>
                <div style={{ fontSize: '14px', color: '#1F2937' }}>
                  {new Date(selectedVehiculo.updated_at).toLocaleString('es-AR')}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                className="btn-secondary"
                onClick={() => setShowDetailsModal(false)}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Eliminar */}
      {showDeleteModal && selectedVehiculo && (
        <div className="modal-overlay" onClick={() => !saving && setShowDeleteModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0, fontSize: '20px', fontWeight: '700', color: '#DC2626' }}>
              Eliminar Vehículo
            </h2>

            <div className="delete-warning">
              <div className="delete-warning-title">⚠️ Advertencia</div>
              <div className="delete-warning-text">
                Estás a punto de eliminar el vehículo <strong>{selectedVehiculo.patente}</strong> ({selectedVehiculo.marca} {selectedVehiculo.modelo}).
                Esta acción es <strong>irreversible</strong>.
              </div>
            </div>

            <p style={{ color: '#6B7280', fontSize: '14px', marginBottom: '24px' }}>
              ¿Estás seguro de que deseas continuar?
            </p>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowDeleteModal(false)
                  setSelectedVehiculo(null)
                }}
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                className="btn-primary"
                onClick={handleDelete}
                disabled={saving}
                style={{ background: '#DC2626' }}
              >
                {saving ? 'Eliminando...' : 'Sí, Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
