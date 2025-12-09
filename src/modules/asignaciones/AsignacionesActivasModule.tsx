// src/modules/asignaciones/AsignacionesActivasModule.tsx
import { useState, useEffect, useMemo } from 'react'
import { Eye, User, Car, Calendar, Clock, Info, ClipboardList } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { type ColumnDef } from '@tanstack/react-table'
import Swal from 'sweetalert2'
import { DataTable } from '../../components/ui/DataTable'

interface AsignacionActiva {
  id: string
  codigo: string
  vehiculo_id: string
  fecha_programada?: string | null
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
          fecha_programada,
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
          ),
          asignaciones_conductores (
            id,
            conductor_id,
            estado,
            horario,
            confirmado,
            fecha_confirmacion,
            conductores (
              id,
              nombres,
              apellidos,
              numero_licencia,
              telefono_contacto
            )
          )
        `)
        .in('estado', ['activo', 'activa'])
        .order('created_at', { ascending: false })

      if (error) throw error

      // ✅ OPTIMIZADO: Ya no necesitamos queries separadas, incluir en la query principal
      setAsignaciones(asignacionesData || [])
    } catch (err: any) {
      console.error('Error cargando asignaciones activas:', err)
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'No se pudieron cargar las asignaciones activas',
        confirmButtonColor: 'var(--color-primary)'
      })
    } finally {
      setLoading(false)
    }
  }

  const openDetailsModal = (asignacion: AsignacionActiva) => {
    setSelectedAsignacion(asignacion)
    setShowDetailsModal(true)
  }

  // Expandir filas para TURNO (una fila por conductor) vs A CARGO (una fila con todos)
  const expandedAsignaciones = useMemo(() => {
    return asignaciones.flatMap((asignacion: any) => {
      // Si es A CARGO, retornar una sola fila con todos los conductores
      if (asignacion.horario === 'CARGO') {
        return [{
          ...asignacion,
          conductorEspecifico: null,
          turnoEspecifico: '-'
        }]
      }

      // Si es TURNO con conductores, retornar una fila por cada conductor
      if (asignacion.asignaciones_conductores && asignacion.asignaciones_conductores.length > 0) {
        return asignacion.asignaciones_conductores.map((ac: any) => ({
          ...asignacion,
          conductorEspecifico: ac,
          turnoEspecifico: ac.horario
        }))
      }

      // Si no hay conductores, retornar una fila vacía
      return [{
        ...asignacion,
        conductorEspecifico: null,
        turnoEspecifico: '-'
      }]
    })
  }, [asignaciones])

  const columns = useMemo<ColumnDef<AsignacionActiva>[]>(
    () => [
      {
        accessorKey: 'codigo',
        header: 'Número',
        cell: ({ getValue }) => (
          <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
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
              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {vehiculo.patente}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {vehiculo.marca} {vehiculo.modelo} ({vehiculo.anio})
              </div>
            </div>
          ) : 'N/A'
        },
        enableSorting: true,
      },
      {
        id: 'turno',
        header: 'Turno',
        cell: ({ row }) => {
          const turno = (row.original as any).turnoEspecifico
          return (
            <span style={{ fontSize: '13px', fontWeight: '500' }}>
              {turno === '-' ? '-' : turno || 'N/A'}
            </span>
          )
        },
        enableSorting: false,
      },
      {
        id: 'conductor',
        header: 'Conductor',
        cell: ({ row }) => {
          const conductorEsp = (row.original as any).conductorEspecifico

          // Si hay conductor específico (TURNO), mostrar solo ese
          if (conductorEsp) {
            return (
              <span style={{ fontSize: '13px', fontWeight: '500' }}>
                {conductorEsp.conductores.nombres} {conductorEsp.conductores.apellidos}
              </span>
            )
          }

          // Si es A CARGO, mostrar todos los conductores
          if (row.original.horario === 'CARGO' && row.original.asignaciones_conductores && row.original.asignaciones_conductores.length > 0) {
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {row.original.asignaciones_conductores.map((ac, idx) => (
                  <span key={idx} style={{ fontSize: '13px', fontWeight: '500' }}>
                    {ac.conductores.nombres} {ac.conductores.apellidos}
                  </span>
                ))}
              </div>
            )
          }

          return (
            <span style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>Sin conductor</span>
          )
        },
        enableSorting: false,
      },
      {
        accessorKey: 'horario',
        header: 'Modalidad',
        cell: ({ getValue }) => {
          const horario = getValue() as string
          return (
            <span className={horario === 'CARGO' ? 'dt-badge dt-badge-blue' : 'dt-badge dt-badge-yellow'}>
              {horario === 'CARGO' ? 'A CARGO' : 'TURNO'}
            </span>
          )
        },
        enableSorting: true,
      },
      {
        accessorKey: 'fecha_programada',
        header: 'Fecha Entrega',
        cell: ({ getValue }) => {
          const fecha = getValue() as string | null
          return fecha ? new Date(fecha).toLocaleDateString('es-AR') : 'No definida'
        },
        enableSorting: true,
      },
      {
        accessorKey: 'fecha_inicio',
        header: 'Fecha Activación',
        cell: ({ getValue }) => {
          const fecha = getValue() as string
          return fecha ? new Date(fecha).toLocaleDateString('es-AR') : 'No activada'
        },
        enableSorting: true,
      },
      {
        id: 'acciones',
        header: 'Acciones',
        cell: ({ row }) => (
          <div className="dt-actions">
            <button
              className="dt-btn-action dt-btn-view"
              onClick={() => openDetailsModal(row.original)}
              title="Ver detalles"
            >
              <Eye size={16} />
            </button>
          </div>
        ),
        enableSorting: false,
      },
    ],
    []
  )

  return (
    <div className="module-container">
      <style>{`
        .modal-header {
          padding: 24px 32px;
          border-bottom: 1px solid var(--border-primary);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .modal-body {
          padding: 32px;
        }

        .asignacion-section-title {
          font-size: 16px;
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 16px;
          padding-bottom: 8px;
          border-bottom: 2px solid var(--color-primary);
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .detail-value {
          font-size: 15px;
          color: var(--text-primary);
          font-weight: 500;
        }

        .conductor-card {
          background: var(--bg-secondary);
          border: 1px solid var(--border-primary);
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 12px;
        }

        .btn-secondary {
          padding: 10px 20px;
          background: var(--card-bg);
          color: var(--text-secondary);
          border: 1px solid var(--border-primary);
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-secondary:hover {
          background: var(--bg-secondary);
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
          background: var(--badge-green-bg);
          color: var(--color-success);
        }

        .status-confirmed {
          background: var(--badge-blue-bg);
          color: var(--badge-blue-text);
        }

        .sort-indicator {
          margin-left: 8px;
          color: var(--text-tertiary);
          font-size: 14px;
        }
      `}</style>

      {/* Header */}
      <div className="module-header">
        <h3 className="module-title">Asignaciones Activas</h3>
        <p className="module-subtitle">
          {expandedAsignaciones.length} fila{expandedAsignaciones.length !== 1 ? 's' : ''} ({asignaciones.length} asignacion{asignaciones.length !== 1 ? 'es' : ''} activa{asignaciones.length !== 1 ? 's' : ''})
        </p>
      </div>

      {/* DataTable */}
      <DataTable
        data={expandedAsignaciones}
        columns={columns}
        loading={loading}
        searchPlaceholder="Buscar por vehiculo, conductor, numero de asignacion..."
        emptyIcon={<ClipboardList size={64} />}
        emptyTitle="No hay asignaciones activas"
        emptyDescription="Actualmente no hay asignaciones en estado activo"
      />

      {/* Modal de Detalles */}
      {showDetailsModal && selectedAsignacion && (
        <div className="modal-overlay" onClick={() => setShowDetailsModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)' }}>
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
                  <span className="detail-value" style={{ color: 'var(--color-primary)', fontWeight: 700 }}>
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
                    {selectedAsignacion.horario === 'CARGO' ? 'A CARGO' : 'TURNO'}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Fecha de Programación</span>
                  <span className="detail-value">
                    <Calendar size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
                    {new Date(selectedAsignacion.created_at).toLocaleDateString('es-AR')}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Fecha de Entrega</span>
                  <span className="detail-value">
                    <Calendar size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
                    {selectedAsignacion.fecha_programada
                      ? new Date(selectedAsignacion.fecha_programada).toLocaleDateString('es-AR')
                      : 'No definida'}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Fecha de Activación</span>
                  <span className="detail-value">
                    <Calendar size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
                    {selectedAsignacion.fecha_inicio
                      ? new Date(selectedAsignacion.fecha_inicio).toLocaleDateString('es-AR')
                      : 'No activada'}
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
                  background: 'var(--badge-blue-bg)',
                  border: '1px solid var(--border-primary)',
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
                <p style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>No hay información del vehículo</p>
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
                            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                              {asigConductor.conductores.nombres} {asigConductor.conductores.apellidos}
                            </div>
                            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
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
                          {asigConductor.horario !== 'todo_dia' && (
                            <div className="detail-item">
                              <span className="detail-label">Turno</span>
                              <span className="detail-value" style={{ fontSize: '14px' }}>
                                <Clock size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
                                {asigConductor.horario}
                              </span>
                            </div>
                          )}
                          <div className="detail-item">
                            <span className="detail-label">Teléfono</span>
                            <span className="detail-value" style={{ fontSize: '14px' }}>
                              {asigConductor.conductores.telefono_contacto || 'No especificado'}
                            </span>
                          </div>
                          <div className="detail-item">
                            <span className="detail-label">Estado</span>
                            <span className="detail-value" style={{ fontSize: '14px', color: 'var(--color-primary)', fontWeight: 700 }}>
                              {asigConductor.estado || 'NULL'}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <p style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>No hay conductores asignados actualmente</p>
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
