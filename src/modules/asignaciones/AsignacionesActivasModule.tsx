// src/modules/asignaciones/AsignacionesActivasModule.tsx
import { useState, useEffect, useMemo } from 'react'
import { Eye, User, Car, Calendar, Clock, Info, ClipboardList, Users, CheckCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { type ColumnDef } from '@tanstack/react-table'
import Swal from 'sweetalert2'
import { DataTable } from '../../components/ui/DataTable'
import './AsignacionesModule.css'

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

  // Calcular estadísticas
  const stats = useMemo(() => {
    const turnoCount = asignaciones.filter(a => a.horario === 'TURNO').length
    const cargoCount = asignaciones.filter(a => a.horario === 'CARGO' || !a.horario).length

    // Conductores únicos
    const conductoresSet = new Set<string>()
    asignaciones.forEach(a => {
      a.asignaciones_conductores?.forEach(ac => {
        if (ac.conductor_id) conductoresSet.add(ac.conductor_id)
      })
    })

    // Vehículos únicos
    const vehiculosSet = new Set<string>()
    asignaciones.forEach(a => {
      if (a.vehiculo_id) vehiculosSet.add(a.vehiculo_id)
    })

    // Confirmados (asignaciones donde todos los conductores están confirmados)
    const confirmadosCount = asignaciones.filter(a => {
      if (!a.asignaciones_conductores || a.asignaciones_conductores.length === 0) return false
      return a.asignaciones_conductores.every(ac => ac.confirmado)
    }).length

    return {
      total: asignaciones.length,
      turno: turnoCount,
      cargo: cargoCount,
      conductores: conductoresSet.size,
      vehiculos: vehiculosSet.size,
      confirmados: confirmadosCount
    }
  }, [asignaciones])

  // Procesar asignaciones - UNA fila por asignación (no expandir)
  const processedAsignaciones = useMemo(() => {
    return asignaciones.map((asignacion: any) => {
      // Para TURNO, organizar conductores por turno
      if (asignacion.horario === 'TURNO') {
        const diurno = asignacion.asignaciones_conductores?.find((ac: any) => ac.horario === 'diurno')
        const nocturno = asignacion.asignaciones_conductores?.find((ac: any) => ac.horario === 'nocturno')

        return {
          ...asignacion,
          conductoresTurno: {
            diurno: diurno ? {
              id: diurno.conductores.id,
              nombre: `${diurno.conductores.nombres} ${diurno.conductores.apellidos}`,
              confirmado: diurno.confirmado
            } : null,
            nocturno: nocturno ? {
              id: nocturno.conductores.id,
              nombre: `${nocturno.conductores.nombres} ${nocturno.conductores.apellidos}`,
              confirmado: nocturno.confirmado
            } : null
          },
          conductorCargo: null
        }
      }

      // Para A CARGO, tomar el primer conductor
      const conductor = asignacion.asignaciones_conductores?.[0]
      return {
        ...asignacion,
        conductoresTurno: null,
        conductorCargo: conductor ? {
          id: conductor.conductores.id,
          nombre: `${conductor.conductores.nombres} ${conductor.conductores.apellidos}`,
          confirmado: conductor.confirmado
        } : null
      }
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
        id: 'asignados',
        header: 'Asignados',
        accessorFn: (row) => {
          const data = row as any
          if (data.horario === 'CARGO' || !data.horario) {
            return data.conductorCargo?.nombre || ''
          }
          const d = data.conductoresTurno?.diurno?.nombre || ''
          const n = data.conductoresTurno?.nocturno?.nombre || ''
          return `${d} ${n}`.trim()
        },
        cell: ({ row }) => {
          const data = row.original as any
          const { conductoresTurno, conductorCargo, horario } = data

          // Para A CARGO o sin horario definido
          if (horario === 'CARGO' || !horario) {
            if (conductorCargo) {
              return <span className="asig-conductor-compacto">{conductorCargo.nombre}</span>
            }
            return <span className="asig-sin-conductor">Sin asignar</span>
          }

          // Para TURNO - mostrar D/N con etiquetas
          const diurno = conductoresTurno?.diurno
          const nocturno = conductoresTurno?.nocturno

          return (
            <div className="asig-conductores-compact">
              <span className={diurno ? 'asig-conductor-turno' : 'asig-turno-vacante'}>
                <span className="asig-turno-label">D</span>
                {diurno ? diurno.nombre.split(' ').slice(0, 2).join(' ') : 'Vacante'}
              </span>
              <span className={nocturno ? 'asig-conductor-turno' : 'asig-turno-vacante'}>
                <span className="asig-turno-label">N</span>
                {nocturno ? nocturno.nombre.split(' ').slice(0, 2).join(' ') : 'Vacante'}
              </span>
            </div>
          )
        },
        enableSorting: true,
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
          {asignaciones.length} asignacion{asignaciones.length !== 1 ? 'es' : ''} activa{asignaciones.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Stats Cards - Estilo Bitácora */}
      <div className="bitacora-stats">
        <div className="stats-grid">
          <div className="stat-card">
            <ClipboardList size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.total}</span>
              <span className="stat-label">Total Activas</span>
            </div>
          </div>
          <div className="stat-card">
            <Clock size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.turno}</span>
              <span className="stat-label">Por Turno</span>
            </div>
          </div>
          <div className="stat-card">
            <User size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.cargo}</span>
              <span className="stat-label">A Cargo</span>
            </div>
          </div>
          <div className="stat-card">
            <Users size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.conductores}</span>
              <span className="stat-label">Conductores</span>
            </div>
          </div>
          <div className="stat-card">
            <Car size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.vehiculos}</span>
              <span className="stat-label">Vehículos</span>
            </div>
          </div>
          <div className="stat-card">
            <CheckCircle size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.confirmados}</span>
              <span className="stat-label">Confirmadas</span>
            </div>
          </div>
        </div>
      </div>

      {/* DataTable */}
      <DataTable
        data={processedAsignaciones}
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
