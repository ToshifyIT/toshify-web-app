// src/components/admin/VehicleManagement.tsx
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { usePermissions } from '../../contexts/PermissionsContext'
import type { Vehiculo } from '../../types/database.types'

export function VehicleManagement() {
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedVehiculo, setSelectedVehiculo] = useState<Vehiculo | null>(null)

  const { canCreate, canUpdate, canDelete } = usePermissions()

  const [formData, setFormData] = useState({
    patente: '',
    marca: '',
    modelo: '',
    anio: new Date().getFullYear(),
    kilometraje: 0,
    estado: 'disponible'
  })

  useEffect(() => {
    loadVehiculos()
  }, [])

  const loadVehiculos = async () => {
    setLoading(true)
    setError('')

    try {
      const { data, error: fetchError } = await supabase
        .from('vehiculos')
        .select('*')
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError
      setVehiculos(data || [])
    } catch (err: any) {
      console.error('Error cargando vehículos:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!canCreate('vehiculos')) {
      alert('❌ No tienes permisos para crear vehículos')
      return
    }

    if (!formData.patente || !formData.marca || !formData.modelo) {
      alert('Complete todos los campos requeridos')
      return
    }

    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()

      const { error: insertError } = await supabase
        .from('vehiculos')
        // @ts-expect-error - Tipo generado incorrectamente por Supabase CLI
        .insert([{
          patente: formData.patente.toUpperCase(),
          marca: formData.marca,
          modelo: formData.modelo,
          anio: formData.anio,
          kilometraje: formData.kilometraje,
          estado: formData.estado,
          created_by: user?.id
        }])

      if (insertError) throw insertError

      alert('✅ Vehículo creado exitosamente')
      setShowCreateModal(false)
      resetForm()
      await loadVehiculos()
    } catch (err: any) {
      console.error('Error creando vehículo:', err)
      alert('❌ Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async () => {
    if (!canUpdate('vehiculos')) {
      alert('❌ No tienes permisos para editar vehículos')
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
          marca: formData.marca,
          modelo: formData.modelo,
          anio: formData.anio,
          kilometraje: formData.kilometraje,
          estado: formData.estado,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedVehiculo.id)

      if (updateError) throw updateError

      alert('✅ Vehículo actualizado exitosamente')
      setShowEditModal(false)
      setSelectedVehiculo(null)
      resetForm()
      await loadVehiculos()
    } catch (err: any) {
      console.error('Error actualizando vehículo:', err)
      alert('❌ Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!canDelete('vehiculos')) {
      alert('❌ No tienes permisos para eliminar vehículos')
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

      alert('✅ Vehículo eliminado exitosamente')
      setShowDeleteModal(false)
      setSelectedVehiculo(null)
      await loadVehiculos()
    } catch (err: any) {
      console.error('Error eliminando vehículo:', err)
      alert('❌ Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const openEditModal = (vehiculo: Vehiculo) => {
    setSelectedVehiculo(vehiculo)
    setFormData({
      patente: vehiculo.patente,
      marca: vehiculo.marca,
      modelo: vehiculo.modelo,
      anio: vehiculo.anio || new Date().getFullYear(),
      kilometraje: vehiculo.kilometraje,
      estado: vehiculo.estado
    })
    setShowEditModal(true)
  }

  const openDeleteModal = (vehiculo: Vehiculo) => {
    setSelectedVehiculo(vehiculo)
    setShowDeleteModal(true)
  }

  const resetForm = () => {
    setFormData({
      patente: '',
      marca: '',
      modelo: '',
      anio: new Date().getFullYear(),
      kilometraje: 0,
      estado: 'disponible'
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
          border-radius: 8px;
          border: 1px solid #E5E7EB;
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

        .btn-action.btn-delete:not(:disabled):hover {
          border-color: #E63946;
          color: #E63946;
          background: #FEE2E2;
        }

        .btn-primary {
          padding: 10px 20px;
          background: #E63946;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }

        .btn-primary:hover {
          background: #D62828;
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
          padding: 32px;
          border-radius: 12px;
          max-width: 600px;
          width: 90%;
          max-height: 90vh;
          overflow-y: auto;
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
      <div style={{
        marginBottom: '20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700' }}>
            Gestión de Vehículos
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#6B7280' }}>
            {vehiculos.length} vehículo{vehiculos.length !== 1 ? 's' : ''} registrado{vehiculos.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={() => setShowCreateModal(true)}
          disabled={!canCreate('vehiculos')}
          title={!canCreate('vehiculos') ? 'No tienes permisos para crear vehículos' : ''}
        >
          + Crear Vehículo
        </button>
      </div>

      {!canCreate('vehiculos') && (
        <div className="no-permission-msg">
          ℹ️ No tienes permisos para crear vehículos. Solo puedes ver la lista.
        </div>
      )}

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
                <td>{vehiculo.modelo}</td>
                <td>{vehiculo.anio}</td>
                <td>{vehiculo.kilometraje.toLocaleString()} km</td>
                <td>
                  <span className={`badge ${getEstadoBadgeClass(vehiculo.estado)}`}>
                    {getEstadoLabel(vehiculo.estado)}
                  </span>
                </td>
                <td>
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
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0, fontSize: '20px', fontWeight: '700' }}>
              Crear Nuevo Vehículo
            </h2>

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
                <label className="form-label">Marca *</label>
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
                <label className="form-label">Modelo *</label>
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
                <label className="form-label">Kilometraje</label>
                <input
                  type="number"
                  className="form-input"
                  value={formData.kilometraje}
                  onChange={(e) => setFormData({ ...formData, kilometraje: parseInt(e.target.value) })}
                  min="0"
                  disabled={saving}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Estado</label>
              <select
                className="form-input"
                value={formData.estado}
                onChange={(e) => setFormData({ ...formData, estado: e.target.value })}
                disabled={saving}
              >
                <option value="disponible">Disponible</option>
                <option value="en_uso">En Uso</option>
                <option value="mantenimiento">Mantenimiento</option>
              </select>
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
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0, fontSize: '20px', fontWeight: '700' }}>
              Editar Vehículo
            </h2>

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
                <label className="form-label">Marca *</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.marca}
                  onChange={(e) => setFormData({ ...formData, marca: e.target.value })}
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Modelo *</label>
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
                <label className="form-label">Kilometraje</label>
                <input
                  type="number"
                  className="form-input"
                  value={formData.kilometraje}
                  onChange={(e) => setFormData({ ...formData, kilometraje: parseInt(e.target.value) })}
                  min="0"
                  disabled={saving}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Estado</label>
              <select
                className="form-input"
                value={formData.estado}
                onChange={(e) => setFormData({ ...formData, estado: e.target.value })}
                disabled={saving}
              >
                <option value="disponible">Disponible</option>
                <option value="en_uso">En Uso</option>
                <option value="mantenimiento">Mantenimiento</option>
              </select>
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
