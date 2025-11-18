// src/modules/asignaciones/AsignacionesActivasModule.tsx
import { useState, useEffect, useMemo } from 'react'
import { Eye, User, Car, Calendar, Clock, Info } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import Swal from 'sweetalert2'

interface AsignacionActiva {
  id: string
  codigo: string
  vehiculo_id: string
  fecha_inicio: string
  modalidad: string
  horario: string
  estado: string
  created_at: string
  vehiculos?: {
    patente: string
    marca: string
    modelo: string
    anio: number
    vehiculos_tipos?: {
      descripcion: string
    }
  }
  asignaciones_conductores?: Array<{
    id: string
    conductor_id: string
    estado: string
    horario: string
    confirmado: boolean
    conductores: {
      id: string
      nombres: string
      apellidos: string
      numero_licencia: string
      telefono_contacto: string
    }
  }>
}

export function AsignacionesActivasModule() {
  const [asignaciones, setAsignaciones] = useState<AsignacionActiva[]>([])
  const [loading, setLoading] = useState(true)
  const [globalFilter, setGlobalFilter] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const [selectedAsignacion, setSelectedAsignacion] = useState<AsignacionActiva | null>(null)
  const [showDetailsModal, setShowDetailsModal] = useState(false)

  useEffect(() => {
    loadAsignacionesActivas()
  }, [])

  const loadAsignacionesActivas = async () => {
    setLoading(true)
    try {
      // Obtener solo asignaciones con estado "activa" (verificar ambas variantes)
      const { data: asignacionesData, error } = await supabase
        .from('asignaciones')
        .select(`
          id,
          codigo,
          vehiculo_id,
          fecha_inicio,
          modalidad,
          horario,
          estado,
          created_at,
          vehiculos (
            patente,
            marca,
            modelo,
            anio,
            vehiculos_tipos (
              descripcion
            )
          )
        `)
        .in('estado', ['activo', 'activa'])
        .order('created_at', { ascending: false })

      if (error) throw error

      // Cargar conductores asignados por separado (igual que en AsignacionesModule)
      if (asignacionesData && asignacionesData.length > 0) {
        const asignacionesConConductores = await Promise.all(
          asignacionesData.map(async (asignacion: any) => {
            const { data: conductoresAsignados } = await supabase
              .from('asignaciones_conductores')
              .select(`
                id,
                conductor_id,
                estado,
                horario,
                confirmado,
                conductores (
                  id,
                  nombres,
                  apellidos,
                  numero_licencia,
                  telefono_contacto
                )
              `)
              .eq('asignacion_id', asignacion.id)

            return {
              ...asignacion,
              asignaciones_conductores: conductoresAsignados || []
            }
          })
        )

        console.log('Asignaciones con conductores:', asignacionesConConductores)
        if (asignacionesConConductores.length > 0) {
          console.log('Primera asignación:', asignacionesConConductores[0])
          console.log('Conductores:', asignacionesConConductores[0].asignaciones_conductores)
        }

        setAsignaciones(asignacionesConConductores)
      } else {
        setAsignaciones(asignacionesData || [])
      }
    } catch (err: any) {
      console.error('Error cargando asignaciones activas:', err)
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'No se pudieron cargar las asignaciones activas',
        confirmButtonColor: '#E63946'
      })
    } finally {
      setLoading(false)
    }
  }

  const openDetailsModal = (asignacion: AsignacionActiva) => {
    setSelectedAsignacion(asignacion)
    setShowDetailsModal(true)
  }

  const columns = useMemo<ColumnDef<AsignacionActiva>[]>(
    () => [
      {
        accessorKey: 'codigo',
        header: 'Número',
        cell: ({ getValue }) => (
          <span style={{ fontWeight: 600, color: '#E63946' }}>
            {getValue() as string}
          </span>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'vehiculos.patente',
        header: 'Vehículo',
        cell: ({ row }) => {
          const vehiculo = row.original.vehiculos
          return vehiculo ? (
            <div>
              <div style={{ fontWeight: 600, color: '#1F2937' }}>
                {vehiculo.patente}
              </div>
              <div style={{ fontSize: '12px', color: '#6B7280' }}>
                {vehiculo.marca} {vehiculo.modelo} ({vehiculo.anio})
              </div>
            </div>
          ) : 'N/A'
        },
        enableSorting: true,
      },
      {
        id: 'conductores',
        header: 'Conductores',
        cell: ({ row }) => {
          // TEMPORAL: mostrar todos los conductores sin filtrar para debug
          const todosConductores = row.original.asignaciones_conductores || []
          console.log('Conductores en fila:', todosConductores)
          const conductores = todosConductores // Sin filtrar temporalmente
          return conductores.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {conductores.map((ac, idx) => (
                <div key={idx} style={{
                  background: '#F0FDF4',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '13px',
                  color: '#166534',
                  fontWeight: 500
                }}>
                  {ac.conductores.nombres} {ac.conductores.apellidos}
                </div>
              ))}
            </div>
          ) : (
            <span style={{ color: '#9CA3AF', fontSize: '13px' }}>Sin conductores</span>
          )
        },
        enableSorting: false,
      },
      {
        accessorKey: 'modalidad',
        header: 'Modalidad',
        cell: ({ getValue }) => {
          const modalidad = getValue() as string
          return (
            <span style={{
              display: 'inline-block',
              padding: '4px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              background: modalidad === 'permanente' ? '#DBEAFE' : '#FEF3C7',
              color: modalidad === 'permanente' ? '#1E40AF' : '#92400E'
            }}>
              {modalidad.charAt(0).toUpperCase() + modalidad.slice(1)}
            </span>
          )
        },
        enableSorting: true,
      },
      {
        accessorKey: 'fecha_inicio',
        header: 'Fecha Inicio',
        cell: ({ getValue }) => {
          const fecha = getValue() as string
          return new Date(fecha).toLocaleDateString('es-AR')
        },
        enableSorting: true,
      },
      {
        id: 'acciones',
        header: 'Acciones',
        cell: ({ row }) => (
          <button
            onClick={() => openDetailsModal(row.original)}
            style={{
              padding: '8px 16px',
              background: 'white',
              border: '1px solid #E5E7EB',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: '#374151',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.borderColor = '#E63946'
              e.currentTarget.style.color = '#E63946'
              e.currentTarget.style.background = '#FEF2F2'
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.borderColor = '#E5E7EB'
              e.currentTarget.style.color = '#374151'
              e.currentTarget.style.background = 'white'
            }}
          >
            <Eye size={16} />
            Ver Detalles
          </button>
        ),
        enableSorting: false,
      },
    ],
    []
  )

  const table = useReactTable({
    data: asignaciones,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  })

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ color: '#6B7280' }}>Cargando asignaciones activas...</div>
      </div>
    )
  }

  return (
    <div>
      <style>{`
        .table-container {
          background: white;
          border-radius: 12px;
          overflow: hidden;
          border: 1px solid #E5E7EB;
          box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
        }

        .data-table {
          width: 100%;
          border-collapse: collapse;
        }

        .data-table th {
          background: #F9FAFB;
          padding: 14px 16px;
          text-align: left;
          font-size: 12px;
          font-weight: 600;
          color: #6B7280;
          text-transform: uppercase;
          border-bottom: 2px solid #E5E7EB;
          cursor: pointer;
          user-select: none;
        }

        .data-table th.sortable:hover {
          background: #F3F4F6;
        }

        .data-table td {
          padding: 16px;
          border-bottom: 1px solid #F3F4F6;
        }

        .data-table tbody tr {
          transition: background 0.2s;
        }

        .data-table tbody tr:hover {
          background: #F9FAFB;
        }

        .search-input {
          width: 100%;
          max-width: 400px;
          padding: 12px 16px 12px 42px;
          font-size: 15px;
          border: 1px solid #E5E7EB;
          border-radius: 8px;
          background: white;
          transition: border-color 0.2s;
        }

        .search-input:focus {
          outline: none;
          border-color: #E63946;
          box-shadow: 0 0 0 3px rgba(230, 57, 70, 0.1);
        }

        .pagination {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          border-top: 1px solid #E5E7EB;
          background: #FAFAFA;
        }

        .pagination-info {
          font-size: 14px;
          color: #6B7280;
        }

        .pagination-controls {
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .pagination-controls button {
          padding: 8px 12px;
          border: 1px solid #E5E7EB;
          background: white;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          color: #374151;
          transition: all 0.2s;
        }

        .pagination-controls button:hover:not(:disabled) {
          background: #F9FAFB;
          border-color: #E63946;
          color: #E63946;
        }

        .pagination-controls button:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .pagination-controls select {
          padding: 8px 12px;
          border: 1px solid #E5E7EB;
          border-radius: 6px;
          font-size: 14px;
          background: white;
          cursor: pointer;
        }

        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }

        .modal-content {
          background: white;
          border-radius: 16px;
          max-width: 900px;
          width: 100%;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        }

        .modal-header {
          padding: 24px 32px;
          border-bottom: 1px solid #E5E7EB;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .modal-body {
          padding: 32px;
        }

        .modal-footer {
          padding: 20px 32px;
          border-top: 1px solid #E5E7EB;
          display: flex;
          justify-content: flex-end;
        }

        .section-title {
          font-size: 16px;
          font-weight: 700;
          color: #1F2937;
          margin-bottom: 16px;
          padding-bottom: 8px;
          border-bottom: 2px solid #E63946;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .details-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 20px;
          margin-bottom: 24px;
        }

        .detail-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .detail-label {
          font-size: 12px;
          font-weight: 600;
          color: #6B7280;
          text-transform: uppercase;
        }

        .detail-value {
          font-size: 15px;
          color: #1F2937;
          font-weight: 500;
        }

        .conductor-card {
          background: #F9FAFB;
          border: 1px solid #E5E7EB;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 12px;
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

        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 600;
        }

        .status-active {
          background: #D1FAE5;
          color: #065F46;
        }

        .status-confirmed {
          background: #DBEAFE;
          color: #1E40AF;
        }

        .sort-indicator {
          margin-left: 8px;
          color: #9CA3AF;
          font-size: 14px;
        }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h3 style={{ margin: 0, fontSize: '24px', fontWeight: '700', color: '#1F2937' }}>
          Asignaciones Activas
        </h3>
        <p style={{ margin: '8px 0 0 0', fontSize: '15px', color: '#6B7280' }}>
          {asignaciones.length} asignación{asignaciones.length !== 1 ? 'es' : ''} activa{asignaciones.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Search */}
      <div style={{ marginBottom: '24px', position: 'relative' }}>
        <Eye size={20} color="#9CA3AF" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
        <input
          type="text"
          className="search-input"
          placeholder="Buscar por vehículo, conductor, número de asignación..."
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <th
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    className={header.column.getCanSort() ? 'sortable' : ''}
                  >
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && (
                        <span className="sort-indicator">
                          {{
                            asc: ' ↑',
                            desc: ' ↓',
                          }[header.column.getIsSorted() as string] ?? ' ↕'}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '60px 20px', color: '#9CA3AF' }}>
                  <Info size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
                  <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>
                    No hay asignaciones activas
                  </div>
                  <div style={{ fontSize: '14px' }}>
                    {globalFilter ? 'No se encontraron resultados para tu búsqueda' : 'Actualmente no hay asignaciones en estado activo'}
                  </div>
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map(row => (
                <tr key={row.id}>
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {table.getRowModel().rows.length > 0 && (
          <div className="pagination">
            <div className="pagination-info">
              Mostrando {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1} a{' '}
              {Math.min(
                (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
                table.getFilteredRowModel().rows.length
              )}{' '}
              de {table.getFilteredRowModel().rows.length} registros
            </div>
            <div className="pagination-controls">
              <button onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()}>
                {'<<'}
              </button>
              <button onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
                {'<'}
              </button>
              <span style={{ fontSize: '14px', color: '#6B7280' }}>
                Página {table.getState().pagination.pageIndex + 1} de {table.getPageCount()}
              </span>
              <button onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
                {'>'}
              </button>
              <button onClick={() => table.setPageIndex(table.getPageCount() - 1)} disabled={!table.getCanNextPage()}>
                {'>>'}
              </button>
              <select
                value={table.getState().pagination.pageSize}
                onChange={e => table.setPageSize(Number(e.target.value))}
              >
                {[10, 20, 30, 50].map(pageSize => (
                  <option key={pageSize} value={pageSize}>
                    {pageSize} por página
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Modal de Detalles */}
      {showDetailsModal && selectedAsignacion && (
        <div className="modal-overlay" onClick={() => setShowDetailsModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: '#1F2937' }}>
                Detalles de la Asignación
              </h2>
            </div>

            <div className="modal-body">
              {/* Información General */}
              <div className="section-title">
                <Info size={20} />
                Información General
              </div>
              <div className="details-grid">
                <div className="detail-item">
                  <span className="detail-label">Número de Asignación</span>
                  <span className="detail-value" style={{ color: '#E63946', fontWeight: 700 }}>
                    {selectedAsignacion.codigo}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Estado</span>
                  <div>
                    <span className="status-badge status-active">
                      Activo
                    </span>
                  </div>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Modalidad</span>
                  <span className="detail-value">
                    {selectedAsignacion.modalidad.charAt(0).toUpperCase() + selectedAsignacion.modalidad.slice(1)}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Fecha de Inicio</span>
                  <span className="detail-value">
                    <Calendar size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
                    {new Date(selectedAsignacion.fecha_inicio).toLocaleDateString('es-AR')}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Horario General</span>
                  <span className="detail-value">
                    <Clock size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
                    {selectedAsignacion.horario || 'No especificado'}
                  </span>
                </div>
              </div>

              {/* Vehículo Asignado */}
              <div className="section-title" style={{ marginTop: '32px' }}>
                <Car size={20} />
                Vehículo Asignado
              </div>
              {selectedAsignacion.vehiculos ? (
                <div style={{
                  background: '#F0F9FF',
                  border: '1px solid #BAE6FD',
                  borderRadius: '8px',
                  padding: '20px',
                  marginBottom: '24px'
                }}>
                  <div className="details-grid">
                    <div className="detail-item">
                      <span className="detail-label">Patente</span>
                      <span className="detail-value" style={{ fontSize: '18px', fontWeight: 700 }}>
                        {selectedAsignacion.vehiculos.patente}
                      </span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Marca y Modelo</span>
                      <span className="detail-value">
                        {selectedAsignacion.vehiculos.marca} {selectedAsignacion.vehiculos.modelo}
                      </span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Año</span>
                      <span className="detail-value">
                        {selectedAsignacion.vehiculos.anio}
                      </span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Tipo de Vehículo</span>
                      <span className="detail-value">
                        {selectedAsignacion.vehiculos.vehiculos_tipos?.descripcion || 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <p style={{ color: '#9CA3AF', fontStyle: 'italic' }}>No hay información del vehículo</p>
              )}

              {/* Conductores Asignados */}
              <div className="section-title" style={{ marginTop: '32px' }}>
                <User size={20} />
                Conductores Asignados ({selectedAsignacion.asignaciones_conductores?.length || 0})
              </div>
              {selectedAsignacion.asignaciones_conductores && selectedAsignacion.asignaciones_conductores.length > 0 ? (
                <div>
                  {selectedAsignacion.asignaciones_conductores
                    .map((asigConductor, idx) => (
                      <div key={idx} className="conductor-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                          <div>
                            <div style={{ fontSize: '16px', fontWeight: 700, color: '#1F2937', marginBottom: '4px' }}>
                              {asigConductor.conductores.nombres} {asigConductor.conductores.apellidos}
                            </div>
                            <div style={{ fontSize: '13px', color: '#6B7280' }}>
                              Licencia: {asigConductor.conductores.numero_licencia}
                            </div>
                          </div>
                          {asigConductor.confirmado && (
                            <span className="status-badge status-confirmed">
                              Confirmado
                            </span>
                          )}
                        </div>
                        <div className="details-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                          <div className="detail-item">
                            <span className="detail-label">Horario</span>
                            <span className="detail-value" style={{ fontSize: '14px' }}>
                              <Clock size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
                              {asigConductor.horario}
                            </span>
                          </div>
                          <div className="detail-item">
                            <span className="detail-label">Teléfono</span>
                            <span className="detail-value" style={{ fontSize: '14px' }}>
                              {asigConductor.conductores.telefono_contacto || 'No especificado'}
                            </span>
                          </div>
                          <div className="detail-item">
                            <span className="detail-label">Estado (DEBUG)</span>
                            <span className="detail-value" style={{ fontSize: '14px', color: '#E63946', fontWeight: 700 }}>
                              {asigConductor.estado || 'NULL'}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <p style={{ color: '#9CA3AF', fontStyle: 'italic' }}>No hay conductores asignados actualmente</p>
              )}
            </div>

            <div className="modal-footer">
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
    </div>
  )
}
