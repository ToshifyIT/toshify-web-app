// src/modules/asignaciones/AsignacionesActivasModule.tsx
import { useState, useEffect, useMemo } from 'react'
import { Eye, User, Car, Calendar, Clock, Info, ClipboardList, Filter, TrendingUp } from 'lucide-react'
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

// Estados NO operativos que se excluyen del conteo de flota
const ESTADOS_NO_OPERATIVOS = [
  'CORPORATIVO',
  'ROBO',
  'DESTRUCCION_TOTAL',
  'JUBILADO'
]

export function AsignacionesActivasModule() {
  const [asignaciones, setAsignaciones] = useState<AsignacionActiva[]>([])
  const [totalVehiculosFlota, setTotalVehiculosFlota] = useState(0)
  const [vehiculosOperativos, setVehiculosOperativos] = useState(0) // PKG_ON_BASE + EN_USO
  const [vehiculosPkgOn, setVehiculosPkgOn] = useState(0) // Solo PKG_ON_BASE
  const [loading, setLoading] = useState(true)
  const [selectedAsignacion, setSelectedAsignacion] = useState<AsignacionActiva | null>(null)
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [activeStatFilter, setActiveStatFilter] = useState<string | null>(null)

  // Column filter states
  const [codigoFilter, setCodigoFilter] = useState('')
  const [vehiculoFilter, setVehiculoFilter] = useState('')
  const [modalidadFilter, setModalidadFilter] = useState('')
  const [openColumnFilter, setOpenColumnFilter] = useState<string | null>(null)

  useEffect(() => {
    loadAsignacionesActivas()
    loadTotalVehiculos()
  }, [])

  // Cerrar dropdown de filtro al hacer click fuera
  useEffect(() => {
    const handleClickOutside = () => {
      if (openColumnFilter) {
        setOpenColumnFilter(null)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [openColumnFilter])

  const loadTotalVehiculos = async () => {
    try {
      // Obtener estados de vehículos primero
      const { data: estadosData } = await supabase
        .from('vehiculos_estados')
        .select('id, codigo')

      if (!estadosData) return

      const estadoIdMap = new Map<string, string>()
      estadosData.forEach((e: any) => estadoIdMap.set(e.codigo, e.id))

      // Obtener todos los vehículos con su estado_id
      const { data: vehiculos } = await supabase
        .from('vehiculos')
        .select('id, estado_id')

      if (!vehiculos) return

      // Crear mapa inverso: id -> codigo
      const idToCodigoMap = new Map<string, string>()
      estadosData.forEach((e: any) => idToCodigoMap.set(e.id, e.codigo))

      // Contar solo vehículos operativos (excluir CORPORATIVO, ROBO, DESTRUCCION_TOTAL, JUBILADO)
      const totalFlotaOperativa = vehiculos.filter((v: any) => {
        const estadoCodigo = idToCodigoMap.get(v.estado_id)
        return !ESTADOS_NO_OPERATIVOS.includes(estadoCodigo || '')
      }).length

      // Contar PKG_ON_BASE + EN_USO para % Operatividad
      const operativos = vehiculos.filter((v: any) => {
        const estadoCodigo = idToCodigoMap.get(v.estado_id)
        return estadoCodigo === 'PKG_ON_BASE' || estadoCodigo === 'EN_USO'
      }).length

      // Contar solo PKG_ON_BASE para Cupos Disponibles
      const pkgOnId = estadoIdMap.get('PKG_ON_BASE')
      const pkgOn = vehiculos.filter((v: any) => v.estado_id === pkgOnId).length

      setTotalVehiculosFlota(totalFlotaOperativa)
      setVehiculosOperativos(operativos)
      setVehiculosPkgOn(pkgOn)
    } catch (err) {
      console.error('Error cargando total vehículos:', err)
    }
  }

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
            estado_id,
            vehiculos_tipos (
              descripcion
            ),
            vehiculos_estados (
              codigo,
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

  const handleStatCardClick = (filterType: string) => {
    // Toggle: si ya está activo, desactivar
    if (activeStatFilter === filterType) {
      setActiveStatFilter(null)
      return
    }
    setActiveStatFilter(filterType)
  }

  const openDetailsModal = (asignacion: AsignacionActiva) => {
    setSelectedAsignacion(asignacion)
    setShowDetailsModal(true)
  }

  // Calcular estadísticas
  const stats = useMemo(() => {
    const turnoCount = asignaciones.filter(a => a.horario === 'TURNO').length
    const cargoCount = asignaciones.filter(a => a.horario === 'CARGO' || !a.horario).length

    // Estados de vehículos NO operacionales
    const estadosNoOperacionales = ['REPARACION', 'MANTENIMIENTO', 'BAJA', 'VENDIDO']

    // Cupos totales: TURNO tiene 2 cupos (D+N), CARGO tiene 1 cupo
    const cuposTotales = (turnoCount * 2) + cargoCount

    // Filtrar solo vehículos operacionales (disponibles)
    const asignacionesOperacionales = asignaciones.filter(a => {
      const estadoVehiculo = (a.vehiculos as any)?.vehiculos_estados?.codigo
      return !estadosNoOperacionales.includes(estadoVehiculo)
    })
    // Variables para futura referencia - cupos operacionales
    // const turnoCountOp = asignacionesOperacionales.filter(a => a.horario === 'TURNO').length
    // const cargoCountOp = asignacionesOperacionales.filter(a => a.horario === 'CARGO' || !a.horario).length
    // const cuposTotalesOperacionales = (turnoCountOp * 2) + cargoCountOp

    // Contar cupos ocupados y vacantes (TODOS los vehículos)
    let cuposOcupados = 0
    let vacantesD = 0
    let vacantesN = 0

    asignaciones.forEach(a => {
      if (a.horario === 'TURNO') {
        // Buscar conductor diurno (minúsculas)
        const conductorD = a.asignaciones_conductores?.find(ac =>
          ac.horario === 'diurno' || ac.horario === 'DIURNO' || ac.horario === 'D'
        )
        // Buscar conductor nocturno (minúsculas)
        const conductorN = a.asignaciones_conductores?.find(ac =>
          ac.horario === 'nocturno' || ac.horario === 'NOCTURNO' || ac.horario === 'N'
        )

        if (conductorD?.conductor_id) {
          cuposOcupados++
        } else {
          vacantesD++
        }

        if (conductorN?.conductor_id) {
          cuposOcupados++
        } else {
          vacantesN++
        }
      } else {
        // CARGO: tiene 1 cupo, contar si está ocupado
        const tieneConductor = a.asignaciones_conductores?.some(ac => ac.conductor_id)
        if (tieneConductor) {
          cuposOcupados++
        }
      }
    })

    // Contar VEHÍCULOS ocupados (con al menos 1 conductor) - para % Operacional
    let vehiculosOcupados = 0
    let vehiculosOcupadosOperacionales = 0

    asignaciones.forEach(a => {
      const tieneConductor = a.asignaciones_conductores?.some(ac => ac.conductor_id)
      if (tieneConductor) vehiculosOcupados++
    })

    asignacionesOperacionales.forEach(a => {
      const tieneConductor = a.asignaciones_conductores?.some(ac => ac.conductor_id)
      if (tieneConductor) vehiculosOcupadosOperacionales++
    })

    const cuposDisponibles = cuposTotales - cuposOcupados

    // % Ocupación General: (Turnos ocupados / Turnos totales) × 100
    const porcentajeOcupacionGeneral = cuposTotales > 0
      ? ((cuposOcupados / cuposTotales) * 100).toFixed(1)
      : '0'

    // % Ocupación Operacional: (Vehículos ocupados / Vehículos disponibles) × 100
    const vehiculosDisponibles = asignacionesOperacionales.length
    const porcentajeOcupacionOperacional = vehiculosDisponibles > 0
      ? ((vehiculosOcupadosOperacionales / vehiculosDisponibles) * 100).toFixed(1)
      : '0'

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

    // Vehículos sin asignación
    const vehiculosSinAsignar = totalVehiculosFlota - vehiculosSet.size

    // % Operatividad = (PKG_ON_BASE + EN_USO) / Total Flota * 100
    const porcentajeOperatividad = totalVehiculosFlota > 0
      ? ((vehiculosOperativos / totalVehiculosFlota) * 100).toFixed(1)
      : '0'

    return {
      total: asignaciones.length,
      turno: turnoCount,
      cargo: cargoCount,
      conductores: conductoresSet.size,
      vehiculos: vehiculosSet.size,
      totalFlota: totalVehiculosFlota,
      vehiculosSinAsignar,
      cuposTotales,
      cuposOcupados,
      cuposDisponibles,
      vacantesD,
      vacantesN,
      vehiculosOperacionales: asignacionesOperacionales.length,
      vehiculosOcupados,
      vehiculosOcupadosOperacionales,
      porcentajeOcupacionGeneral,
      porcentajeOcupacionOperacional,
      porcentajeOperatividad,
      cuposDisp: vehiculosPkgOn
    }
  }, [asignaciones, totalVehiculosFlota, vehiculosOperativos, vehiculosPkgOn])

  // Filtrar asignaciones según los filtros de columna y stat clickeada
  const filteredAsignaciones = useMemo(() => {
    let result = asignaciones

    // Filtrar por stat card clickeada
    if (activeStatFilter) {
      switch (activeStatFilter) {
        case 'vacantes':
          // Solo mostrar asignaciones con al menos 1 vacante
          result = result.filter(a => {
            if (a.horario === 'TURNO') {
              const conductores = a.asignaciones_conductores || []
              const diurno = conductores.find(ac => ac.horario === 'diurno' || ac.horario === 'DIURNO' || ac.horario === 'D')
              const nocturno = conductores.find(ac => ac.horario === 'nocturno' || ac.horario === 'NOCTURNO' || ac.horario === 'N')
              return !diurno?.conductor_id || !nocturno?.conductor_id
            }
            return false // CARGO no tiene vacantes en el mismo sentido
          })
          break
        // Para totalFlota y vehiculosActivos no hay filtrado especial
        default:
          break
      }
    }

    if (codigoFilter) {
      result = result.filter(a =>
        a.codigo?.toLowerCase().includes(codigoFilter.toLowerCase())
      )
    }

    if (vehiculoFilter) {
      result = result.filter(a =>
        a.vehiculos?.patente?.toLowerCase().includes(vehiculoFilter.toLowerCase())
      )
    }

    if (modalidadFilter) {
      result = result.filter(a => a.horario === modalidadFilter)
    }

    return result
  }, [asignaciones, codigoFilter, vehiculoFilter, modalidadFilter, activeStatFilter])

  // Procesar asignaciones - UNA fila por asignación (no expandir)
  const processedAsignaciones = useMemo(() => {
    return filteredAsignaciones.map((asignacion: any) => {
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
  }, [filteredAsignaciones])

  const columns = useMemo<ColumnDef<AsignacionActiva>[]>(
    () => [
      {
        accessorKey: 'codigo',
        header: () => (
          <div className="dt-column-filter">
            <span>Número</span>
            <button
              className={`dt-column-filter-btn ${codigoFilter ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                setOpenColumnFilter(openColumnFilter === 'codigo' ? null : 'codigo')
              }}
              title="Filtrar por número"
            >
              <Filter size={12} />
            </button>
            {openColumnFilter === 'codigo' && (
              <div className="dt-column-filter-dropdown" style={{ minWidth: '160px' }}>
                <input
                  type="text"
                  placeholder="Buscar número..."
                  value={codigoFilter}
                  onChange={(e) => setCodigoFilter(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="dt-column-filter-input"
                  autoFocus
                />
                {codigoFilter && (
                  <button
                    className="dt-column-filter-option"
                    onClick={(e) => {
                      e.stopPropagation()
                      setCodigoFilter('')
                    }}
                    style={{ marginTop: '4px', color: 'var(--color-danger)' }}
                  >
                    Limpiar
                  </button>
                )}
              </div>
            )}
          </div>
        ),
        cell: ({ getValue }) => (
          <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
            {getValue() as string}
          </span>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'vehiculos.patente',
        header: () => (
          <div className="dt-column-filter">
            <span>Vehículo</span>
            <button
              className={`dt-column-filter-btn ${vehiculoFilter ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                setOpenColumnFilter(openColumnFilter === 'vehiculo' ? null : 'vehiculo')
              }}
              title="Filtrar por vehículo"
            >
              <Filter size={12} />
            </button>
            {openColumnFilter === 'vehiculo' && (
              <div className="dt-column-filter-dropdown" style={{ minWidth: '160px' }}>
                <input
                  type="text"
                  placeholder="Buscar patente..."
                  value={vehiculoFilter}
                  onChange={(e) => setVehiculoFilter(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="dt-column-filter-input"
                  autoFocus
                />
                {vehiculoFilter && (
                  <button
                    className="dt-column-filter-option"
                    onClick={(e) => {
                      e.stopPropagation()
                      setVehiculoFilter('')
                    }}
                    style={{ marginTop: '4px', color: 'var(--color-danger)' }}
                  >
                    Limpiar
                  </button>
                )}
              </div>
            )}
          </div>
        ),
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
              <span className={diurno ? 'asig-conductor-turno asig-turno-diurno' : 'asig-turno-vacante asig-turno-diurno'}>
                <span className="asig-turno-label asig-label-diurno">D</span>
                {diurno ? diurno.nombre.split(' ').slice(0, 2).join(' ') : 'Vacante'}
              </span>
              <span className={nocturno ? 'asig-conductor-turno asig-turno-nocturno' : 'asig-turno-vacante asig-turno-nocturno'}>
                <span className="asig-turno-label asig-label-nocturno">N</span>
                {nocturno ? nocturno.nombre.split(' ').slice(0, 2).join(' ') : 'Vacante'}
              </span>
            </div>
          )
        },
        enableSorting: true,
      },
      {
        accessorKey: 'horario',
        header: () => (
          <div className="dt-column-filter">
            <span>Modalidad</span>
            <button
              className={`dt-column-filter-btn ${modalidadFilter ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                setOpenColumnFilter(openColumnFilter === 'modalidad' ? null : 'modalidad')
              }}
              title="Filtrar por modalidad"
            >
              <Filter size={12} />
            </button>
            {openColumnFilter === 'modalidad' && (
              <div className="dt-column-filter-dropdown" style={{ minWidth: '140px' }}>
                <button
                  className={`dt-column-filter-option ${modalidadFilter === '' ? 'selected' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    setModalidadFilter('')
                    setOpenColumnFilter(null)
                  }}
                >
                  Todos
                </button>
                <button
                  className={`dt-column-filter-option ${modalidadFilter === 'TURNO' ? 'selected' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    setModalidadFilter('TURNO')
                    setOpenColumnFilter(null)
                  }}
                >
                  Turno
                </button>
                <button
                  className={`dt-column-filter-option ${modalidadFilter === 'CARGO' ? 'selected' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    setModalidadFilter('CARGO')
                    setOpenColumnFilter(null)
                  }}
                >
                  A Cargo
                </button>
              </div>
            )}
          </div>
        ),
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
    [codigoFilter, vehiculoFilter, modalidadFilter, openColumnFilter]
  )

  return (
    <div className="asig-module">
      <style>{`
        .modal-header {
          padding: 24px 32px;
          border-bottom: 1px solid var(--border-primary);
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--modal-bg);
          flex-shrink: 0;
          border-radius: 12px 12px 0 0;
        }

        .modal-body {
          padding: 32px;
          overflow-y: auto;
          flex: 1;
          min-height: 0;
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

      {/* Stats Cards - Estilo Bitácora */}
      <div className="asig-stats">
        <div className="asig-stats-grid">
          <div
            className={`stat-card stat-card-clickable ${activeStatFilter === 'totalFlota' ? 'stat-card-active' : ''}`}
            title="Total de vehículos en la flota (excluye corporativos, robos, destruidos, jubilados)"
            onClick={() => handleStatCardClick('totalFlota')}
          >
            <Car size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.totalFlota}</span>
              <span className="stat-label">Total Flota</span>
            </div>
          </div>
          <div
            className={`stat-card stat-card-clickable ${activeStatFilter === 'vehiculosActivos' ? 'stat-card-active' : ''}`}
            title="Vehículos con asignación activa"
            onClick={() => handleStatCardClick('vehiculosActivos')}
          >
            <Car size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.vehiculos}</span>
              <span className="stat-label">Vehículos Activos</span>
            </div>
          </div>
          <div
            className={`stat-card stat-card-clickable ${activeStatFilter === 'vacantes' ? 'stat-card-active' : ''}`}
            title={`Diurno: ${stats.vacantesD} | Nocturno: ${stats.vacantesN} - Click para ver solo vacantes`}
            onClick={() => handleStatCardClick('vacantes')}
          >
            <Clock size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.vacantesD + stats.vacantesN}</span>
              <span className="stat-label">Turnos Disponibles</span>
            </div>
          </div>
          <div className="stat-card" title="Vehículos con estado PKG_ON_BASE">
            <Car size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.cuposDisp}</span>
              <span className="stat-label">Cupos Disp</span>
            </div>
          </div>
          <div className="stat-card" title={`${stats.cuposOcupados} cupos ocupados de ${stats.cuposTotales} totales`}>
            <TrendingUp size={18} className="stat-icon" style={{ color: '#059669' }} />
            <div className="stat-content">
              <span className="stat-value" style={{ color: '#059669' }}>{stats.porcentajeOcupacionGeneral}%</span>
              <span className="stat-label">% Ocupación</span>
            </div>
          </div>
          <div className="stat-card" title={`(PKG ON + EN USO) / Total Flota`}>
            <TrendingUp size={18} className="stat-icon" style={{ color: '#059669' }} />
            <div className="stat-content">
              <span className="stat-value" style={{ color: '#059669' }}>{stats.porcentajeOperatividad}%</span>
              <span className="stat-label">% Operatividad</span>
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
