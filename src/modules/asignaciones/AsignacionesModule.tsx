// src/modules/asignaciones/AsignacionesModule.tsx
import { useState } from 'react'
import { Eye, Trash2, Plus, Search, Filter } from 'lucide-react'

interface Assignment {
  id: string
  vehicle: string
  modality: 'turno' | 'cargo'
  drivers: string[]
  date: string
  status: 'pendiente' | 'por_entregar' | 'activo'
  createdAt: string
}

export function AsignacionesModule() {
  const [assignments, setAssignments] = useState<Assignment[]>([
    {
      id: 'ASG-001',
      vehicle: 'ABC-123',
      modality: 'turno',
      drivers: ['Juan López', 'Aníbal Morales'],
      date: '2024-01-20',
      status: 'pendiente',
      createdAt: '2024-01-18'
    },
    {
      id: 'ASG-002',
      vehicle: 'DEF-456',
      modality: 'cargo',
      drivers: ['Carlos Díaz'],
      date: '2024-01-19',
      status: 'por_entregar',
      createdAt: '2024-01-17'
    },
    {
      id: 'ASG-003',
      vehicle: 'GHI-789',
      modality: 'turno',
      drivers: ['Laura Vega', 'Roberto Moreno'],
      date: '2024-01-18',
      status: 'activo',
      createdAt: '2024-01-16'
    }
  ])

  const [editingId, setEditingId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')

  const handleStatusChange = (id: string, newStatus: 'pendiente' | 'por_entregar' | 'activo') => {
    setAssignments(assignments.map(assignment =>
      assignment.id === id ? { ...assignment, status: newStatus } : assignment
    ))
    setEditingId(null)
  }

  const handleDelete = (id: string) => {
    if (window.confirm('¿Estás seguro que deseas eliminar esta asignación?')) {
      setAssignments(assignments.filter(assignment => assignment.id !== id))
    }
  }

  const filteredAssignments = assignments.filter(assignment => {
    const matchesSearch =
      assignment.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      assignment.vehicle.toLowerCase().includes(searchTerm.toLowerCase()) ||
      assignment.drivers.some(driver => driver.toLowerCase().includes(searchTerm.toLowerCase()))

    const matchesStatus = !statusFilter || assignment.status === statusFilter

    return matchesSearch && matchesStatus
  })

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'pendiente':
        return 'badge-pending'
      case 'por_entregar':
        return 'badge-delivery'
      case 'activo':
        return 'badge-active'
      default:
        return ''
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pendiente':
        return 'Pendiente'
      case 'por_entregar':
        return 'Por Entregar'
      case 'activo':
        return 'Activo'
      default:
        return status
    }
  }

  const getModalityBadgeClass = (modality: string) => {
    return modality === 'turno' ? 'badge-turno' : 'badge-cargo'
  }

  const getModalityLabel = (modality: string) => {
    return modality === 'turno' ? 'Turno' : 'A Cargo'
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
          border-radius: 8px;
          border: 1px solid #E5E7EB;
        }

        .assignments-table {
          width: 100%;
          border-collapse: collapse;
          background: white;
          min-width: 1000px;
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

        .badge-pending {
          background: #FEF3C7;
          color: #92400E;
        }

        .badge-delivery {
          background: #DBEAFE;
          color: #1E40AF;
        }

        .badge-active {
          background: #D1FAE5;
          color: #065F46;
        }

        .badge-turno {
          background: #E9D5FF;
          color: #6B21A8;
        }

        .badge-cargo {
          background: #C7D2FE;
          color: #3730A3;
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
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }

        .btn-primary:hover {
          background: #D62828;
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

        .drivers-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        @media (max-width: 768px) {
          .assignments-table {
            min-width: 900px;
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
            Gestión de Asignaciones
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#6B7280' }}>
            {filteredAssignments.length} asignación{filteredAssignments.length !== 1 ? 'es' : ''} encontrada{filteredAssignments.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button className="btn-primary">
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
            placeholder="Buscar por vehículo, conductor o ID..."
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
            <option value="pendiente">Pendiente</option>
            <option value="por_entregar">Por Entregar</option>
            <option value="activo">Activo</option>
          </select>
        </div>
      </div>

      {/* Tabla de asignaciones */}
      <div className="table-wrapper">
        <table className="assignments-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Vehículo</th>
              <th>Modalidad</th>
              <th>Conductores</th>
              <th>Fecha Asignación</th>
              <th>Creado</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredAssignments.map((assignment) => (
              <tr key={assignment.id}>
                <td>
                  <strong>{assignment.id}</strong>
                </td>
                <td>
                  <strong>{assignment.vehicle}</strong>
                </td>
                <td>
                  <span className={`badge ${getModalityBadgeClass(assignment.modality)}`}>
                    {getModalityLabel(assignment.modality)}
                  </span>
                </td>
                <td>
                  <div className="drivers-list">
                    {assignment.drivers.map((driver, idx) => (
                      <span key={idx}>{driver}</span>
                    ))}
                  </div>
                </td>
                <td>
                  {new Date(assignment.date).toLocaleDateString('es-ES', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                  })}
                </td>
                <td>
                  {new Date(assignment.createdAt).toLocaleDateString('es-ES', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                  })}
                </td>
                <td>
                  {editingId === assignment.id ? (
                    <select
                      value={assignment.status}
                      onChange={(e) => handleStatusChange(assignment.id, e.target.value as 'pendiente' | 'por_entregar' | 'activo')}
                      onBlur={() => setEditingId(null)}
                      autoFocus
                      className="status-select"
                    >
                      <option value="pendiente">Pendiente</option>
                      <option value="por_entregar">Por Entregar</option>
                      <option value="activo">Activo</option>
                    </select>
                  ) : (
                    <button
                      onClick={() => setEditingId(assignment.id)}
                      className={`badge ${getStatusBadgeClass(assignment.status)}`}
                      style={{ cursor: 'pointer', border: 'none' }}
                    >
                      {getStatusLabel(assignment.status)}
                    </button>
                  )}
                </td>
                <td>
                  <button
                    className="btn-action"
                    title="Ver detalles"
                  >
                    <Eye size={16} style={{ display: 'inline', verticalAlign: 'middle' }} />
                  </button>
                  <button
                    onClick={() => handleDelete(assignment.id)}
                    className="btn-action btn-delete"
                    title="Eliminar"
                  >
                    <Trash2 size={16} style={{ display: 'inline', verticalAlign: 'middle' }} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredAssignments.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#6B7280' }}>
          No se encontraron asignaciones con los filtros seleccionados.
        </div>
      )}
    </div>
  )
}
