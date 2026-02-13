// src/modules/asignaciones/AsignacionesActivasModule.tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useMemo } from 'react'
import { Eye, User, Car, Calendar, Clock, Info, ClipboardList, TrendingUp, X, Filter } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useSede } from '../../contexts/SedeContext'
import { type ColumnDef } from '@tanstack/react-table'
import Swal from 'sweetalert2'
import { DataTable } from '../../components/ui/DataTable'
import { LoadingOverlay } from '../../components/ui/LoadingOverlay'
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

// Estados a EXCLUIR del total (igual que en vehículos)
const ESTADOS_EXCLUIDOS = [
  'ROBO',
  'DESTRUCCION_TOTAL',
  'JUBILADO',
  'DEVUELTO_PROVEEDOR'
]

export function AsignacionesActivasModule() {
  const { sedeActualId, aplicarFiltroSede } = useSede()
  const [asignaciones, setAsignaciones] = useState<AsignacionActiva[]>([])
  const [totalVehiculosFlota, setTotalVehiculosFlota] = useState(0)
  const [vehiculosOperativos, setVehiculosOperativos] = useState(0) // PKG_ON_BASE + EN_USO
  const [vehiculosPkgOn, setVehiculosPkgOn] = useState(0) // Solo PKG_ON_BASE
  const [vehiculosEnUso, setVehiculosEnUso] = useState(0) // Solo EN_USO
  const [vehiculosPkgOnSinAsignacion, setVehiculosPkgOnSinAsignacion] = useState<any[]>([]) // PKG_ON_BASE sin asignación
  const [todosVehiculosPkgOn, setTodosVehiculosPkgOn] = useState<any[]>([]) // TODOS los PKG_ON_BASE
  const [loading, setLoading] = useState(true)
  const [selectedAsignacion, setSelectedAsignacion] = useState<AsignacionActiva | null>(null)
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [activeStatFilter, setActiveStatFilter] = useState<string | null>(null)
  const [resetFiltersKey, setResetFiltersKey] = useState(0)

  useEffect(() => {
    loadAllData()
  }, [sedeActualId])

  // ✅ OPTIMIZADO: Una sola función que carga todo en paralelo
  const loadAllData = async () => {
    setLoading(true)
    try {
      // Ejecutar ambas queries en paralelo con Promise.all
      const [asignacionesResult, vehiculosResult] = await Promise.all([
        // Query 1: Asignaciones activas con relaciones
        aplicarFiltroSede(supabase
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
          `))
          .in('estado', ['activo', 'activa'])
          .order('created_at', { ascending: false }),

        // Query 2: Vehículos con estado y datos completos para PKG_ON_BASE
        aplicarFiltroSede(supabase
          .from('vehiculos')
          .select('id, patente, marca, modelo, anio, estado_id, vehiculos_estados(codigo, descripcion), vehiculos_tipos(descripcion)'))
      ])

      // Procesar asignaciones
      if (asignacionesResult.error) throw asignacionesResult.error
      setAsignaciones((asignacionesResult.data || []) as unknown as AsignacionActiva[])

      // Procesar estadísticas de vehículos en una sola pasada
      if (vehiculosResult.data) {
        const vehiculos = vehiculosResult.data as any[]
        const asignacionesData = (asignacionesResult.data || []) as unknown as AsignacionActiva[]

        // Set de vehículos que tienen asignación activa
        const vehiculosConAsignacion = new Set(asignacionesData.map(a => a.vehiculo_id))

        // Calcular todo en una sola iteración
        let totalFlota = 0
        let operativos = 0
        let pkgOn = 0
        let enUso = 0
        const pkgOnSinAsignacion: any[] = []
        const todosLosPkgOn: any[] = []

        // REPLICAR EXACTAMENTE LA LÓGICA DE VEHÍCULOS
        for (const v of vehiculos) {
          const estadoCodigo = v.vehiculos_estados?.codigo || ''
          
          // Excluir del total (igual que en vehículos)
          if (!ESTADOS_EXCLUIDOS.includes(estadoCodigo)) {
            totalFlota++
          }

          // Contar por estado (igual que en vehículos)
          if (estadoCodigo === 'PKG_ON_BASE') {
            pkgOn++
            todosLosPkgOn.push(v) // Guardar TODOS los PKG_ON
            // Si no tiene asignación, guardarlo para mostrarlo
            if (!vehiculosConAsignacion.has(v.id)) {
              pkgOnSinAsignacion.push(v)
            }
            // Contar como operativo
            operativos++
          } else if (estadoCodigo === 'EN_USO') {
            operativos++
            enUso++
          }
        }

        setTotalVehiculosFlota(totalFlota)
        setVehiculosOperativos(operativos)
        setVehiculosPkgOn(pkgOn)
        setVehiculosEnUso(enUso)
        setVehiculosPkgOnSinAsignacion(pkgOnSinAsignacion)
        setTodosVehiculosPkgOn(todosLosPkgOn)
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

  // IMPORTANTE: NO limpiar filtros de columna - deben funcionar en conjunto con el stat card
  const handleStatCardClick = (filterType: string) => {
    // Toggle: si ya está activo, desactivar solo el filtro de stat card
    if (activeStatFilter === filterType) {
      setActiveStatFilter(null)
      return
    }
    setActiveStatFilter(filterType)
  }

  // Verificar si hay filtros activos (solo stat card filter ahora)
  const hasActiveFilters = activeStatFilter !== null

  // Limpiar todos los filtros
  const clearAllFilters = () => {
    setActiveStatFilter(null)
    // Reset DataTable internal filters
    setResetFiltersKey(prev => prev + 1)
  }

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

    // UNA SOLA ITERACIÓN sobre asignaciones
    for (const a of asignaciones) {
      const estadoVehiculo = (a.vehiculos as any)?.vehiculos_estados?.codigo || ''
      const esOperacional = !estadosNoOperacionales.includes(estadoVehiculo)
      const conductores = a.asignaciones_conductores || []

      // Contar por horario
      if (a.horario === 'TURNO') {
        turnoCount++

        // Buscar conductores D y N activos (no cancelados)
        const conductorD = conductores.find(ac =>
          (ac.horario === 'diurno' || ac.horario === 'DIURNO' || ac.horario === 'D') && ac.estado !== 'cancelado'
        )
        const conductorN = conductores.find(ac =>
          (ac.horario === 'nocturno' || ac.horario === 'NOCTURNO' || ac.horario === 'N') && ac.estado !== 'cancelado'
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
        const tieneConductor = conductores.some(ac => ac.conductor_id && ac.estado !== 'cancelado')
        if (tieneConductor) {
          cuposOcupados++
        }
      }

      // Vehículos ocupados (con al menos 1 conductor activo)
      const tieneConductor = conductores.some(ac => ac.conductor_id && ac.estado !== 'cancelado')
      if (tieneConductor) {
        vehiculosOcupados++
        if (esOperacional) vehiculosOcupadosOperacionales++
      }

      // Contar operacionales
      if (esOperacional) vehiculosOperacionalesCount++

      // Agregar a sets
      if (a.vehiculo_id) vehiculosSet.add(a.vehiculo_id)
      for (const ac of conductores) {
        if (ac.conductor_id) conductoresSet.add(ac.conductor_id)
      }
    }

    // Cálculos finales
    const cuposTotales = (turnoCount * 2) + cargoCount
    const cuposDisponibles = cuposTotales - cuposOcupados

    // % Ocupación = (totalidad_turnos - turnos_disp) / totalidad_turnos
    // totalidad_turnos = (vehículos activos + PKG_ON) * 2
    // turnos_disp = vacantesD + vacantesN + (PKG_ON sin asignación * 2)
    const totalidadTurnos = (vehiculosSet.size + vehiculosPkgOnSinAsignacion.length) * 2
    const turnosDisp = vacantesD + vacantesN + (vehiculosPkgOnSinAsignacion.length * 2)
    const porcentajeOcupacionGeneral = totalidadTurnos > 0
      ? (((totalidadTurnos - turnosDisp) / totalidadTurnos) * 100).toFixed(1)
      : '0'

    const porcentajeOcupacionOperacional = vehiculosOperacionalesCount > 0
      ? ((vehiculosOcupadosOperacionales / vehiculosOperacionalesCount) * 100).toFixed(1)
      : '0'

    // % Operatividad = Vehículos operativos (PKG_ON + EN_USO) / Total Flota
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
      autosDisponibles: vehiculosPkgOnSinAsignacion.length, // Solo PKG_ON_BASE SIN asignación
      pkgOnBase: vehiculosPkgOn,
      enUso: vehiculosEnUso
    }
  }, [asignaciones, totalVehiculosFlota, vehiculosOperativos, vehiculosPkgOn, vehiculosPkgOnSinAsignacion, vehiculosEnUso])

  // Filtrar asignaciones según los filtros de columna y stat clickeada
  const filteredAsignaciones = useMemo(() => {
    let result = asignaciones

    // Filtrar por stat card clickeada
    if (activeStatFilter) {
      switch (activeStatFilter) {
        case 'vacantes':
          // Mostrar asignaciones TURNO con al menos 1 vacante (ignorar conductores cancelados)
          result = result.filter(a => {
            if (a.horario === 'TURNO') {
              const conductores = a.asignaciones_conductores || []
              const diurno = conductores.find(ac => (ac.horario === 'diurno' || ac.horario === 'DIURNO' || ac.horario === 'D') && ac.estado !== 'cancelado')
              const nocturno = conductores.find(ac => (ac.horario === 'nocturno' || ac.horario === 'NOCTURNO' || ac.horario === 'N') && ac.estado !== 'cancelado')
              return !diurno?.conductor_id || !nocturno?.conductor_id
            }
            return false // CARGO no tiene vacantes en el mismo sentido
          })
          break
        case 'disponibles':
          // Para disponibles, mostrar SOLO vehículos PKG_ON_BASE sin asignación
          result = []
          break
        // Para totalFlota y vehiculosActivos no hay filtrado especial
        default:
          break
      }
    }

    // Si el filtro es vacantes, agregar solo vehículos PKG_ON_BASE sin asignación
    if (activeStatFilter === 'vacantes') {
      // Crear filas "fake" para vehículos sin asignación
      const vehiculosSinAsignacionRows = vehiculosPkgOnSinAsignacion.map(v => ({
        id: `sin-asignacion-${v.id}`,
        codigo: '-',
        vehiculo_id: v.id,
        fecha_programada: null,
        fecha_inicio: '-',
        modalidad: '-',
        horario: 'TURNO', // Marcar como TURNO para mostrar que tiene 2 turnos disponibles
        estado: 'sin_asignacion',
        created_at: '',
        vehiculos: {
          patente: v.patente,
          marca: v.marca,
          modelo: v.modelo,
          anio: v.anio,
          vehiculos_tipos: v.vehiculos_tipos,
          vehiculos_estados: v.vehiculos_estados
        },
        asignaciones_conductores: []
      })) as AsignacionActiva[]

      result = [...result, ...vehiculosSinAsignacionRows]
    }
    
    // Si el filtro es disponibles, mostrar TODOS los PKG_ON_BASE
    if (activeStatFilter === 'disponibles') {
      // Crear filas para TODOS los vehículos PKG_ON_BASE
      const todosVehiculosPkgOnRows = todosVehiculosPkgOn.map(v => {
        // Ver si tiene asignación
        const asignacion = asignaciones.find(a => a.vehiculo_id === v.id)
        
        if (asignacion) {
          // Si tiene asignación, devolver la asignación existente
          return asignacion
        } else {
          // Si no tiene asignación, crear fila "fake"
          return {
            id: `sin-asignacion-${v.id}`,
            codigo: '-',
            vehiculo_id: v.id,
            fecha_programada: null,
            fecha_inicio: '-',
            modalidad: '-',
            horario: 'TURNO',
            estado: 'sin_asignacion',
            created_at: '',
            vehiculos: {
              patente: v.patente,
              marca: v.marca,
              modelo: v.modelo,
              anio: v.anio,
              vehiculos_tipos: v.vehiculos_tipos,
              vehiculos_estados: v.vehiculos_estados
            },
            asignaciones_conductores: []
          } as AsignacionActiva
        }
      })
      
      result = todosVehiculosPkgOnRows
    }

    return result
  }, [asignaciones, activeStatFilter, vehiculosPkgOnSinAsignacion, todosVehiculosPkgOn])

  // Procesar asignaciones - UNA fila por asignación (no expandir)
  const processedAsignaciones = useMemo(() => {
    return filteredAsignaciones.map((asignacion: any) => {
      // Para vehículos sin asignación, mostrar campos vacíos
      if (asignacion.estado === 'sin_asignacion') {
        return {
          ...asignacion,
          conductoresTurno: {
            diurno: null,
            nocturno: null
          },
          conductorCargo: null
        }
      }

      // Filtrar solo conductores activos (no completados/finalizados/cancelados)
      // Conductores con estado 'completado' = dados de baja, no mostrar
      const conductoresActivos = (asignacion.asignaciones_conductores || [])
        .filter((ac: any) => ac.estado !== 'completado' && ac.estado !== 'finalizado' && ac.estado !== 'cancelado')

      // Para TURNO, organizar conductores por turno
      if (asignacion.horario === 'TURNO') {
        const diurno = conductoresActivos.find((ac: any) => ac.horario === 'diurno')
        const nocturno = conductoresActivos.find((ac: any) => ac.horario === 'nocturno')

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

      // Para A CARGO, tomar el primer conductor activo
      const conductor = conductoresActivos[0]
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
              <span className={diurno ? 'asig-conductor-turno asig-turno-diurno' : 'asig-turno-vacante asig-turno-diurno'}>
                <span className="asig-turno-label asig-label-diurno">D</span>
                {diurno ? diurno.nombre : 'Vacante'}
              </span>
              <span className={nocturno ? 'asig-conductor-turno asig-turno-nocturno' : 'asig-turno-vacante asig-turno-nocturno'}>
                <span className="asig-turno-label asig-label-nocturno">N</span>
                {nocturno ? nocturno.nombre : 'Vacante'}
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
    <div className="asig-module">
      {/* Loading Overlay - bloquea toda la pantalla */}
      <LoadingOverlay show={loading} message="Cargando estado de flota..." size="lg" />

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
            title="Total de vehículos en la flota (excluye robos, destruidos, jubilados)"
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
            className={`stat-card stat-card-clickable ${activeStatFilter === 'disponibles' ? 'stat-card-active' : ''}`}
            title="Total de vehículos con estado PKG_ON_BASE - Click para ver listado"
            onClick={() => handleStatCardClick('disponibles')}
          >
            <Car size={18} className="stat-icon" style={{ color: '#059669' }} />
            <div className="stat-content">
              <span className="stat-value" style={{ color: '#059669' }}>{stats.pkgOnBase}</span>
              <span className="stat-label">Disponibles</span>
            </div>
          </div>
          <div
            className={`stat-card stat-card-clickable ${activeStatFilter === 'vacantes' ? 'stat-card-active' : ''}`}
            title={`D: ${stats.vacantesD} | N: ${stats.vacantesN} | PKG_ON: ${stats.autosDisponibles} (x2) - Click para filtrar`}
            onClick={() => handleStatCardClick('vacantes')}
          >
            <Clock size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.vacantesD + stats.vacantesN + (stats.autosDisponibles * 2)}</span>
              <span className="stat-label">Turnos Disponibles</span>
            </div>
          </div>
          <div 
            className="stat-card stat-card-clickable" 
            title="Click para ver detalle del cálculo"
            onClick={() => {
              Swal.fire({
                title: '% Ocupacion',
                html: `
                  <div style="text-align: left; font-size: 14px; line-height: 1.8;">
                    <p style="margin-bottom: 12px; color: #6B7280;">Porcentaje de turnos ocupados sobre el total de turnos disponibles:</p>
                    <div style="background: #F3F4F6; padding: 16px; border-radius: 8px; font-family: monospace;">
                      <p style="margin: 0;"><strong>Vehiculos con asignacion activa:</strong> ${stats.vehiculos}</p>
                      <p style="margin: 8px 0;"><strong>PKG_ON sin asignacion:</strong> ${stats.autosDisponibles}</p>
                      <p style="margin: 8px 0;"><strong>Totalidad Turnos:</strong> (${stats.vehiculos} + ${stats.autosDisponibles}) x 2 = ${(stats.vehiculos + stats.autosDisponibles) * 2}</p>
                      <hr style="border: none; border-top: 1px solid #D1D5DB; margin: 12px 0;">
                      <p style="margin: 0;"><strong>Vacantes D:</strong> ${stats.vacantesD}</p>
                      <p style="margin: 8px 0;"><strong>Vacantes N:</strong> ${stats.vacantesN}</p>
                      <p style="margin: 8px 0;"><strong>PKG_ON sin asignar (x2):</strong> ${stats.autosDisponibles * 2}</p>
                      <p style="margin: 8px 0;"><strong>Turnos Disponibles:</strong> ${stats.vacantesD + stats.vacantesN + (stats.autosDisponibles * 2)}</p>
                      <hr style="border: none; border-top: 1px solid #D1D5DB; margin: 12px 0;">
                      <p style="margin: 0; font-size: 16px; color: #059669;"><strong>= (${(stats.vehiculos + stats.autosDisponibles) * 2} - ${stats.vacantesD + stats.vacantesN + (stats.autosDisponibles * 2)}) / ${(stats.vehiculos + stats.autosDisponibles) * 2} = ${stats.porcentajeOcupacionGeneral}%</strong></p>
                    </div>
                  </div>
                `,
                icon: 'info',
                confirmButtonColor: '#059669',
                confirmButtonText: 'Entendido'
              })
            }}
          >
            <TrendingUp size={18} className="stat-icon" style={{ color: '#059669' }} />
            <div className="stat-content">
              <span className="stat-value" style={{ color: '#059669' }}>{stats.porcentajeOcupacionGeneral}%</span>
              <span className="stat-label">% Ocupación</span>
            </div>
          </div>
          <div 
            className="stat-card stat-card-clickable" 
            title="Click para ver detalle del cálculo"
            onClick={() => {
              Swal.fire({
                title: '% Operatividad',
                html: `
                  <div style="text-align: left; font-size: 14px; line-height: 1.8;">
                    <p style="margin-bottom: 12px; color: #6B7280;">Porcentaje de vehículos operativos sobre el total de la flota:</p>
                    <div style="background: #F3F4F6; padding: 16px; border-radius: 8px; font-family: monospace;">
                      <p style="margin: 0;"><strong>PKG_ON_BASE:</strong> ${stats.pkgOnBase}</p>
                      <p style="margin: 8px 0;"><strong>EN_USO:</strong> ${stats.enUso}</p>
                      <hr style="border: none; border-top: 1px solid #D1D5DB; margin: 12px 0;">
                      <p style="margin: 0;"><strong>Total Operativos:</strong> ${stats.pkgOnBase + stats.enUso}</p>
                      <p style="margin: 8px 0;"><strong>Total Flota:</strong> ${stats.totalFlota}</p>
                      <hr style="border: none; border-top: 1px solid #D1D5DB; margin: 12px 0;">
                      <p style="margin: 0; font-size: 16px; color: #059669;"><strong>= (${stats.pkgOnBase} + ${stats.enUso}) / ${stats.totalFlota} = ${stats.porcentajeOperatividad}%</strong></p>
                    </div>
                  </div>
                `,
                icon: 'info',
                confirmButtonColor: '#059669',
                confirmButtonText: 'Entendido'
              })
            }}
          >
            <TrendingUp size={18} className="stat-icon" style={{ color: '#059669' }} />
            <div className="stat-content">
              <span className="stat-value" style={{ color: '#059669' }}>{stats.porcentajeOperatividad}%</span>
              <span className="stat-label">% Operatividad</span>
            </div>
          </div>
        </div>
      </div>

      {/* Barra de Filtros Activos (solo para stat cards) */}
      {hasActiveFilters && (
        <div className="asig-active-filters">
          <div className="asig-filters-label">
            <Filter size={14} />
            <span>Filtros activos:</span>
          </div>
          <div className="asig-filters-chips">
            {activeStatFilter && (
              <span className="asig-filter-chip">
                {activeStatFilter === 'vacantes' ? 'Turnos Disponibles' :
                 activeStatFilter === 'totalFlota' ? 'Total Flota' :
                 activeStatFilter === 'vehiculosActivos' ? 'Vehículos Activos' :
                 activeStatFilter === 'disponibles' ? 'Vehículos Disponibles (PKG_ON)' : activeStatFilter}
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
        resetFiltersKey={resetFiltersKey}
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
                      ? new Date(selectedAsignacion.fecha_programada).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })
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
