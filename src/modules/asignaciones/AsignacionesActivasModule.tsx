// src/modules/asignaciones/AsignacionesActivasModule.tsx
import { useState, useEffect, useMemo } from 'react'
import { Eye, User, Car, Calendar, Clock, Info, ClipboardList, Filter, TrendingUp, X } from 'lucide-react'
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
  const [vehiculosEnUso, setVehiculosEnUso] = useState(0) // Solo EN_USO
  const [loading, setLoading] = useState(true)
  const [selectedAsignacion, setSelectedAsignacion] = useState<AsignacionActiva | null>(null)
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [activeStatFilter, setActiveStatFilter] = useState<string | null>(null)

  // Column filter states - Multiselect tipo Excel
  const [codigoFilter, setCodigoFilter] = useState<string[]>([])
  const [codigoSearch, setCodigoSearch] = useState('')
  const [vehiculoFilter, setVehiculoFilter] = useState<string[]>([])
  const [vehiculoSearch, setVehiculoSearch] = useState('')
  const [modalidadFilter, setModalidadFilter] = useState<string[]>([])
  const [openColumnFilter, setOpenColumnFilter] = useState<string | null>(null)

  useEffect(() => {
    loadAllData()
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

  // ✅ OPTIMIZADO: Una sola función que carga todo en paralelo
  const loadAllData = async () => {
    setLoading(true)
    try {
      // Ejecutar ambas queries en paralelo con Promise.all
      const [asignacionesResult, vehiculosResult] = await Promise.all([
        // Query 1: Asignaciones activas con relaciones
        supabase
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
          .order('created_at', { ascending: false }),

        // Query 2: Vehículos con estado (una sola query con join)
        supabase
          .from('vehiculos')
          .select('id, estado_id, vehiculos_estados(codigo)')
      ])

      // Procesar asignaciones
      if (asignacionesResult.error) throw asignacionesResult.error
      setAsignaciones(asignacionesResult.data || [])

      // Procesar estadísticas de vehículos en una sola pasada
      if (vehiculosResult.data) {
        const vehiculos = vehiculosResult.data as any[]

        // Calcular todo en una sola iteración
        let totalFlota = 0
        let operativos = 0
        let pkgOn = 0
        let enUso = 0

        for (const v of vehiculos) {
          const estadoCodigo = v.vehiculos_estados?.codigo || ''

          // Total flota (excluir no operativos)
          if (!ESTADOS_NO_OPERATIVOS.includes(estadoCodigo)) {
            totalFlota++
          }

          // Operativos (PKG_ON_BASE + EN_USO)
          if (estadoCodigo === 'PKG_ON_BASE') {
            operativos++
            pkgOn++
          } else if (estadoCodigo === 'EN_USO') {
            operativos++
            enUso++
          }
        }

        setTotalVehiculosFlota(totalFlota)
        setVehiculosOperativos(operativos)
        setVehiculosPkgOn(pkgOn)
        setVehiculosEnUso(enUso)
      }
    } catch (err: any) {
      console.error('Error cargando datos:', err)
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'No se pudieron cargar los datos',
        confirmButtonColor: 'var(--color-primary)'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleStatCardClick = (filterType: string) => {
    // Limpiar TODOS los filtros de columna primero
    setCodigoFilter([])
    setCodigoSearch('')
    setVehiculoFilter([])
    setVehiculoSearch('')
    setModalidadFilter([])

    // Toggle: si ya está activo, desactivar
    if (activeStatFilter === filterType) {
      setActiveStatFilter(null)
      return
    }
    setActiveStatFilter(filterType)
  }

  // Verificar si hay filtros activos
  const hasActiveFilters = codigoFilter.length > 0 || vehiculoFilter.length > 0 || modalidadFilter.length > 0 || activeStatFilter

  // Limpiar todos los filtros
  const clearAllFilters = () => {
    setCodigoFilter([])
    setCodigoSearch('')
    setVehiculoFilter([])
    setVehiculoSearch('')
    setModalidadFilter([])
    setActiveStatFilter(null)
  }

  // Toggle functions para multiselect
  const toggleCodigoFilter = (codigo: string) => {
    setCodigoFilter(prev =>
      prev.includes(codigo)
        ? prev.filter(c => c !== codigo)
        : [...prev, codigo]
    )
  }

  const toggleVehiculoFilter = (patente: string) => {
    setVehiculoFilter(prev =>
      prev.includes(patente)
        ? prev.filter(p => p !== patente)
        : [...prev, patente]
    )
  }

  const toggleModalidadFilter = (modalidad: string) => {
    setModalidadFilter(prev =>
      prev.includes(modalidad)
        ? prev.filter(m => m !== modalidad)
        : [...prev, modalidad]
    )
  }

  // Valores únicos para dropdowns tipo Excel
  const codigosUnicos = useMemo(() => {
    const codigos = asignaciones.map(a => a.codigo).filter(Boolean)
    return [...new Set(codigos)].sort()
  }, [asignaciones])

  const patentesUnicas = useMemo(() => {
    const patentes = asignaciones.map(a => a.vehiculos?.patente).filter(Boolean) as string[]
    return [...new Set(patentes)].sort()
  }, [asignaciones])

  // Opciones filtradas por búsqueda
  const codigosFiltrados = useMemo(() => {
    if (!codigoSearch) return codigosUnicos
    return codigosUnicos.filter(c => c.toLowerCase().includes(codigoSearch.toLowerCase()))
  }, [codigosUnicos, codigoSearch])

  const patentesFiltradas = useMemo(() => {
    if (!vehiculoSearch) return patentesUnicas
    return patentesUnicas.filter(p => p.toLowerCase().includes(vehiculoSearch.toLowerCase()))
  }, [patentesUnicas, vehiculoSearch])

  const openDetailsModal = (asignacion: AsignacionActiva) => {
    setSelectedAsignacion(asignacion)
    setShowDetailsModal(true)
  }

  // ✅ OPTIMIZADO: Calcular todas las estadísticas en UNA SOLA PASADA
  const stats = useMemo(() => {
    // Estados de vehículos NO operacionales
    const estadosNoOperacionales = ['REPARACION', 'MANTENIMIENTO', 'BAJA', 'VENDIDO']

    // Sets para contar únicos
    const conductoresSet = new Set<string>()
    const vehiculosSet = new Set<string>()

    // Contadores - todo en una sola pasada
    let turnoCount = 0
    let cargoCount = 0
    let cuposOcupados = 0
    let vacantesD = 0
    let vacantesN = 0
    let vehiculosOcupados = 0
    let vehiculosOperacionalesCount = 0
    let vehiculosOcupadosOperacionales = 0
    let autosDisponibles = 0 // PKG_ON_BASE con vacantes (no A CARGO)

    // UNA SOLA ITERACIÓN sobre asignaciones
    for (const a of asignaciones) {
      const estadoVehiculo = (a.vehiculos as any)?.vehiculos_estados?.codigo || ''
      const esOperacional = !estadosNoOperacionales.includes(estadoVehiculo)
      const conductores = a.asignaciones_conductores || []

      // Contar por horario
      if (a.horario === 'TURNO') {
        turnoCount++

        // Buscar conductores D y N
        const conductorD = conductores.find(ac =>
          ac.horario === 'diurno' || ac.horario === 'DIURNO' || ac.horario === 'D'
        )
        const conductorN = conductores.find(ac =>
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
        cargoCount++
        const tieneConductor = conductores.some(ac => ac.conductor_id)
        if (tieneConductor) {
          cuposOcupados++
        }
      }

      // Vehículos ocupados (con al menos 1 conductor)
      const tieneConductor = conductores.some(ac => ac.conductor_id)
      if (tieneConductor) {
        vehiculosOcupados++
        if (esOperacional) vehiculosOcupadosOperacionales++
      }

      // Contar operacionales
      if (esOperacional) vehiculosOperacionalesCount++

      // Contar autos disponibles: PKG_ON_BASE + TURNO con vacantes (no A CARGO)
      if (estadoVehiculo === 'PKG_ON_BASE' && a.horario === 'TURNO') {
        const conductorD = conductores.find(ac =>
          ac.horario === 'diurno' || ac.horario === 'DIURNO' || ac.horario === 'D'
        )
        const conductorN = conductores.find(ac =>
          ac.horario === 'nocturno' || ac.horario === 'NOCTURNO' || ac.horario === 'N'
        )
        // Disponible si tiene al menos una vacante
        if (!conductorD?.conductor_id || !conductorN?.conductor_id) {
          autosDisponibles++
        }
      }

      // Agregar a sets
      if (a.vehiculo_id) vehiculosSet.add(a.vehiculo_id)
      for (const ac of conductores) {
        if (ac.conductor_id) conductoresSet.add(ac.conductor_id)
      }
    }

    // Cálculos finales
    const cuposTotales = (turnoCount * 2) + cargoCount
    const cuposDisponibles = cuposTotales - cuposOcupados

    const porcentajeOcupacionGeneral = totalVehiculosFlota > 0
      ? ((vehiculosEnUso / totalVehiculosFlota) * 100).toFixed(1)
      : '0'

    const porcentajeOcupacionOperacional = vehiculosOperacionalesCount > 0
      ? ((vehiculosOcupadosOperacionales / vehiculosOperacionalesCount) * 100).toFixed(1)
      : '0'

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
      vehiculosSinAsignar: totalVehiculosFlota - vehiculosSet.size,
      cuposTotales,
      cuposOcupados,
      cuposDisponibles,
      vacantesD,
      vacantesN,
      vehiculosOperacionales: vehiculosOperacionalesCount,
      vehiculosOcupados,
      vehiculosOcupadosOperacionales,
      porcentajeOcupacionGeneral,
      porcentajeOcupacionOperacional,
      porcentajeOperatividad,
      autosDisponibles
    }
  }, [asignaciones, totalVehiculosFlota, vehiculosOperativos, vehiculosPkgOn, vehiculosEnUso])

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
        case 'autosDisponibles':
          // Vehículos PKG_ON_BASE que tienen vacantes (realmente disponibles)
          // Excluir A CARGO (tienen conductor asignado a tiempo completo)
          result = result.filter(a => {
            const estadoCodigo = a.vehiculos?.vehiculos_estados?.codigo?.toUpperCase()
            if (estadoCodigo !== 'PKG_ON_BASE') return false

            // Si es A CARGO, NO es disponible (tiene conductor asignado)
            if (a.horario === 'CARGO') return false

            // Si es TURNO, verificar que tenga al menos una vacante
            if (a.horario === 'TURNO') {
              const conductores = a.asignaciones_conductores || []
              const diurno = conductores.find(ac => ac.horario === 'diurno' || ac.horario === 'DIURNO' || ac.horario === 'D')
              const nocturno = conductores.find(ac => ac.horario === 'nocturno' || ac.horario === 'NOCTURNO' || ac.horario === 'N')
              return !diurno?.conductor_id || !nocturno?.conductor_id
            }

            return true
          })
          break
        // Para totalFlota y vehiculosActivos no hay filtrado especial
        default:
          break
      }
    }

    if (codigoFilter.length > 0) {
      result = result.filter(a => codigoFilter.includes(a.codigo))
    }

    if (vehiculoFilter.length > 0) {
      result = result.filter(a => a.vehiculos?.patente && vehiculoFilter.includes(a.vehiculos.patente))
    }

    if (modalidadFilter.length > 0) {
      result = result.filter(a => modalidadFilter.includes(a.horario))
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
              className={`dt-column-filter-btn ${codigoFilter.length > 0 ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                setOpenColumnFilter(openColumnFilter === 'codigo' ? null : 'codigo')
                if (openColumnFilter === 'codigo') setCodigoSearch('')
              }}
              title="Filtrar por número"
            >
              <Filter size={12} />
            </button>
            {openColumnFilter === 'codigo' && (
              <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
                <input
                  type="text"
                  placeholder="Buscar..."
                  value={codigoSearch}
                  onChange={(e) => setCodigoSearch(e.target.value)}
                  className="dt-column-filter-input"
                  autoFocus
                />
                <div className="dt-excel-filter-list">
                  {codigosFiltrados.length === 0 ? (
                    <div className="dt-excel-filter-empty">Sin resultados</div>
                  ) : (
                    codigosFiltrados.slice(0, 50).map(codigo => (
                      <label key={codigo} className={`dt-column-filter-checkbox ${codigoFilter.includes(codigo) ? 'selected' : ''}`}>
                        <input
                          type="checkbox"
                          checked={codigoFilter.includes(codigo)}
                          onChange={() => toggleCodigoFilter(codigo)}
                        />
                        <span>{codigo}</span>
                      </label>
                    ))
                  )}
                </div>
                {codigoFilter.length > 0 && (
                  <button
                    className="dt-column-filter-clear"
                    onClick={() => {
                      setCodigoFilter([])
                      setCodigoSearch('')
                    }}
                  >
                    Limpiar ({codigoFilter.length})
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
              className={`dt-column-filter-btn ${vehiculoFilter.length > 0 ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                setOpenColumnFilter(openColumnFilter === 'vehiculo' ? null : 'vehiculo')
                if (openColumnFilter === 'vehiculo') setVehiculoSearch('')
              }}
              title="Filtrar por vehículo"
            >
              <Filter size={12} />
            </button>
            {openColumnFilter === 'vehiculo' && (
              <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
                <input
                  type="text"
                  placeholder="Buscar patente..."
                  value={vehiculoSearch}
                  onChange={(e) => setVehiculoSearch(e.target.value)}
                  className="dt-column-filter-input"
                  autoFocus
                />
                <div className="dt-excel-filter-list">
                  {patentesFiltradas.length === 0 ? (
                    <div className="dt-excel-filter-empty">Sin resultados</div>
                  ) : (
                    patentesFiltradas.slice(0, 50).map(patente => (
                      <label key={patente} className={`dt-column-filter-checkbox ${vehiculoFilter.includes(patente) ? 'selected' : ''}`}>
                        <input
                          type="checkbox"
                          checked={vehiculoFilter.includes(patente)}
                          onChange={() => toggleVehiculoFilter(patente)}
                        />
                        <span>{patente}</span>
                      </label>
                    ))
                  )}
                </div>
                {vehiculoFilter.length > 0 && (
                  <button
                    className="dt-column-filter-clear"
                    onClick={() => {
                      setVehiculoFilter([])
                      setVehiculoSearch('')
                    }}
                  >
                    Limpiar ({vehiculoFilter.length})
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
              className={`dt-column-filter-btn ${modalidadFilter.length > 0 ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                setOpenColumnFilter(openColumnFilter === 'modalidad' ? null : 'modalidad')
              }}
              title="Filtrar por modalidad"
            >
              <Filter size={12} />
            </button>
            {openColumnFilter === 'modalidad' && (
              <div className="dt-column-filter-dropdown" style={{ minWidth: '160px' }}>
                <label
                  className={`dt-column-filter-checkbox ${modalidadFilter.includes('TURNO') ? 'selected' : ''}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={modalidadFilter.includes('TURNO')}
                    onChange={() => toggleModalidadFilter('TURNO')}
                  />
                  <span>Turno</span>
                </label>
                <label
                  className={`dt-column-filter-checkbox ${modalidadFilter.includes('CARGO') ? 'selected' : ''}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={modalidadFilter.includes('CARGO')}
                    onChange={() => toggleModalidadFilter('CARGO')}
                  />
                  <span>A Cargo</span>
                </label>
                {modalidadFilter.length > 0 && (
                  <button
                    className="dt-column-filter-clear"
                    onClick={(e) => {
                      e.stopPropagation()
                      setModalidadFilter([])
                    }}
                  >
                    Limpiar
                  </button>
                )}
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
          <div
            className={`stat-card stat-card-clickable ${activeStatFilter === 'autosDisponibles' ? 'stat-card-active' : ''}`}
            title="Vehículos PKG_ON_BASE con vacantes (TURNO sin conductor completo)"
            onClick={() => handleStatCardClick('autosDisponibles')}
          >
            <Car size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.autosDisponibles}</span>
              <span className="stat-label">Autos Disponibles</span>
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

      {/* Barra de Filtros Activos */}
      {hasActiveFilters && (
        <div className="asig-active-filters">
          <div className="asig-filters-label">
            <Filter size={14} />
            <span>Filtros activos:</span>
          </div>
          <div className="asig-filters-chips">
            {codigoFilter.length > 0 && (
              <span className="asig-filter-chip">
                Número: {codigoFilter.length === 1 ? codigoFilter[0] : `${codigoFilter.length} seleccionados`}
                <button onClick={() => setCodigoFilter([])} className="asig-filter-chip-remove">
                  <X size={12} />
                </button>
              </span>
            )}
            {vehiculoFilter.length > 0 && (
              <span className="asig-filter-chip">
                Vehículo: {vehiculoFilter.length === 1 ? vehiculoFilter[0] : `${vehiculoFilter.length} seleccionados`}
                <button onClick={() => setVehiculoFilter([])} className="asig-filter-chip-remove">
                  <X size={12} />
                </button>
              </span>
            )}
            {modalidadFilter.length > 0 && (
              <span className="asig-filter-chip">
                Modalidad: {modalidadFilter.map(m => m === 'TURNO' ? 'Turno' : 'A Cargo').join(', ')}
                <button onClick={() => setModalidadFilter([])} className="asig-filter-chip-remove">
                  <X size={12} />
                </button>
              </span>
            )}
            {activeStatFilter && (
              <span className="asig-filter-chip">
                {activeStatFilter === 'vacantes' ? 'Solo Vacantes' :
                 activeStatFilter === 'totalFlota' ? 'Total Flota' :
                 activeStatFilter === 'vehiculosActivos' ? 'Vehículos Activos' :
                 activeStatFilter === 'autosDisponibles' ? 'Autos Disponibles' : activeStatFilter}
                <button onClick={() => setActiveStatFilter(null)} className="asig-filter-chip-remove">
                  <X size={12} />
                </button>
              </span>
            )}
          </div>
          <button className="asig-clear-filters-btn" onClick={clearAllFilters}>
            Limpiar todos
          </button>
        </div>
      )}

      {/* Mensaje cuando filtros no tienen resultados */}
      {hasActiveFilters && processedAsignaciones.length === 0 && !loading && (
        <div className="asig-no-filter-results">
          <Filter size={32} />
          <h3>Sin resultados para los filtros aplicados</h3>
          <p>No se encontraron asignaciones que coincidan con los filtros seleccionados.</p>
          <button className="asig-clear-filters-btn" onClick={clearAllFilters}>
            Limpiar filtros
          </button>
        </div>
      )}

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
