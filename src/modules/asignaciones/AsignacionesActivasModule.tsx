// src/modules/asignaciones/AsignacionesActivasModule.tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useMemo, type ReactNode } from 'react'
import { Eye, User, Car, Clock, ClipboardList, TrendingUp, X, Filter } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useSede } from '../../contexts/SedeContext'
import { type ColumnDef } from '@tanstack/react-table'
import Swal from 'sweetalert2'
import { DataTable } from '../../components/ui/DataTable'
import { LoadingOverlay } from '../../components/ui/LoadingOverlay'
import { cargarConceptosTarifa, getPeriodoTarifa } from '../onboarding/tarifaConceptos'
import { useFlotaSemanaAnterior } from './useFlotaSemanaAnterior'
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
    vehiculos_estados?: {
      codigo: string
      descripcion: string
    }
  }
  asignaciones_conductores?: Array<{
    id: string
    conductor_id: string
    estado: string
    horario: string
    confirmado: boolean
    fecha_confirmacion?: string | null
    conductores: {
      id: string
      nombres: string
      apellidos: string
      numero_licencia: string
      telefono_contacto: string
    }
  }>
}

// Normaliza la descripción del estado (sin acentos, minúsculas, espacios simples)
// para comparar sin depender de mayúsculas/tildes/formato.
const normEstadoFlota = (s: string) =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

// Estados que SÍ cuentan para el "Total Flota". Se identifica por la descripción
// del estado del vehículo (no por el código interno) para no depender de códigos.
// Cada bucket tiene la etiqueta a mostrar en el popup y su regla de coincidencia.
const ESTADOS_TOTAL_FLOTA: { label: string; match: (d: string) => boolean }[] = [
  { label: 'En uso', match: d => d === 'en uso' },
  { label: 'PKG ON', match: d => d.startsWith('pkg on') },
  { label: 'PKG OFF - Base', match: d => d.includes('pkg off') && d.includes('base') },
  { label: 'PKG OFF - Francia', match: d => d.includes('pkg off') && d.includes('franc') },
  { label: 'Taller Mecánico', match: d => d.includes('taller') && d.includes('mecanic') },
  { label: 'Taller Chapa y Pintura', match: d => d.includes('taller') && (d.includes('chapa') || d.includes('pintura')) },
  { label: 'Retenido en Comisaría', match: d => d.includes('retenido') || d.includes('comisar') },
]

// Devuelve el índice del bucket al que pertenece la descripción, o -1 si el
// estado no cuenta para el total.
function bucketEstadoFlota(descripcion: string): number {
  const d = normEstadoFlota(descripcion)
  return ESTADOS_TOTAL_FLOTA.findIndex(e => e.match(d))
}

// Flecha contra el mismo día de la semana anterior (foto diaria de kpi_flota_diaria).
// `invertido`: subir es malo (ej. turnos disponibles = turnos sin conductor).
function Comparacion({ actual, anterior, puntos = false, invertido = false }: {
  actual: number
  anterior: number | null
  puntos?: boolean
  invertido?: boolean
}) {
  if (anterior === null || !Number.isFinite(anterior)) return null
  const dif = actual - anterior
  const umbral = puntos ? 0.05 : 0.5
  const plano = Math.abs(dif) < umbral
  const bueno = invertido ? dif < 0 : dif > 0
  const tono = plano ? 'neutro' : bueno ? 'bueno' : 'malo'
  const texto = puntos
    ? `${Math.abs(dif).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} pts`
    : Math.abs(Math.round(dif)).toLocaleString('es-AR')
  const anteriorTexto = puntos
    ? `${anterior.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`
    : Math.round(anterior).toLocaleString('es-AR')
  return (
    <span
      className={`asig-comp asig-comp--${tono}`}
      title={`Hace una semana: ${anteriorTexto}`}
      onClick={(e) => e.stopPropagation()}
    >
      {plano ? '=' : dif > 0 ? '▲' : '▼'} {plano ? 'igual' : texto}
      <span className="asig-comp-sufijo"> vs sem. ant.</span>
    </span>
  )
}

export function AsignacionesActivasModule() {
  const { sedeActualId, aplicarFiltroSede } = useSede()
  const semanaAnterior = useFlotaSemanaAnterior()
  const [asignaciones, setAsignaciones] = useState<AsignacionActiva[]>([])
  const [totalVehiculosFlota, setTotalVehiculosFlota] = useState(0)
  // Desglose del Total Flota por estado (para el popup descriptivo)
  const [desgloseFlota, setDesgloseFlota] = useState<{ label: string; count: number }[]>([])
  const [vehiculosOperativos, setVehiculosOperativos] = useState(0)
  const [vehiculosPkgOn, setVehiculosPkgOn] = useState(0)
  const [vehiculosEnUso, setVehiculosEnUso] = useState(0)
  const [vehiculosPkgOnSinAsignacion, setVehiculosPkgOnSinAsignacion] = useState<any[]>([])
  const [todosVehiculosPkgOn, setTodosVehiculosPkgOn] = useState<any[]>([])
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
          .select('id, patente, marca, modelo, anio, estado_id, vehiculos_estados(codigo, descripcion), vehiculos_tipos(descripcion)')
          .is('deleted_at', null))
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
        // Desglose por estado (mismo orden que ESTADOS_TOTAL_FLOTA)
        const desglose = ESTADOS_TOTAL_FLOTA.map(e => ({ label: e.label, count: 0 }))

        for (const v of vehiculos) {
          const estadoCodigo = v.vehiculos_estados?.codigo || ''
          const estadoDescripcion = v.vehiculos_estados?.descripcion || ''

          // Total Flota por INCLUSIÓN: solo cuenta si el estado está en la lista
          // definida (En uso, PKG ON, PKG OFF - Base/Francia, Taller Mecánico,
          // Taller Chapa y Pintura, Retenido en Comisaría).
          const bucket = bucketEstadoFlota(estadoDescripcion)
          if (bucket >= 0) {
            totalFlota++
            desglose[bucket].count++
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
        setDesgloseFlota(desglose)
        setVehiculosOperativos(operativos)
        setVehiculosPkgOn(pkgOn)
        setVehiculosEnUso(enUso)
        setVehiculosPkgOnSinAsignacion(pkgOnSinAsignacion)
        setTodosVehiculosPkgOn(todosLosPkgOn)
      }
    } catch {
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
      if (a.horario === 'turno') {
        turnoCount++

        // Buscar conductores D y N activos (excluir cancelados, completados y finalizados)
        const estadosInactivos = ['cancelado', 'completado', 'finalizado']
        const conductorD = conductores.find(ac =>
          (ac.horario === 'diurno' || ac.horario === 'DIURNO' || ac.horario === 'D') && !estadosInactivos.includes(ac.estado)
        )
        const conductorN = conductores.find(ac =>
          (ac.horario === 'nocturno' || ac.horario === 'NOCTURNO' || ac.horario === 'N') && !estadosInactivos.includes(ac.estado)
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
        const tieneConductorCargo = conductores.some(ac => ac.conductor_id && !['cancelado', 'completado', 'finalizado'].includes(ac.estado))
        if (tieneConductorCargo) {
          cuposOcupados++
        }
      }

      // Vehículos ocupados (con al menos 1 conductor activo)
      const tieneConductor = conductores.some(ac => ac.conductor_id && !['cancelado', 'completado', 'finalizado'].includes(ac.estado))
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

    // % Operatividad = Vehículos EN_USO / Total Flota
    const porcentajeOperatividad = totalVehiculosFlota > 0
      ? ((vehiculosEnUso / totalVehiculosFlota) * 100).toFixed(1)
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
      // Desglose de Turnos Disponibles por turno: cada PKG_ON sin asignación
      // aporta 1 turno D y 1 turno N, así D + N = total de la tarjeta.
      turnosDisponiblesD: vacantesD + vehiculosPkgOnSinAsignacion.length,
      turnosDisponiblesN: vacantesN + vehiculosPkgOnSinAsignacion.length,
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
          // Mostrar asignaciones TURNO con al menos 1 vacante (excluir cancelados, completados y finalizados)
          result = result.filter(a => {
            if (a.horario === 'turno') {
              const conductores = a.asignaciones_conductores || []
              const inactivos = ['cancelado', 'completado', 'finalizado']
              const diurno = conductores.find(ac => (ac.horario === 'diurno' || ac.horario === 'DIURNO' || ac.horario === 'D') && !inactivos.includes(ac.estado))
              const nocturno = conductores.find(ac => (ac.horario === 'nocturno' || ac.horario === 'NOCTURNO' || ac.horario === 'N') && !inactivos.includes(ac.estado))
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
        horario: 'turno', // Marcar como TURNO para mostrar que tiene 2 turnos disponibles
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
            horario: 'turno',
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
      // También excluir registros huérfanos donde conductores=null (conductor eliminado de BD)
      const conductoresActivos = (asignacion.asignaciones_conductores || [])
        .filter((ac: any) => ac.conductores && ac.estado !== 'completado' && ac.estado !== 'finalizado' && ac.estado !== 'cancelado')

      // Para TURNO, organizar conductores por turno
      if (asignacion.horario === 'turno') {
        const diurno = conductoresActivos.find((ac: any) => ac.horario === 'diurno' && ac.conductores)
        const nocturno = conductoresActivos.find((ac: any) => ac.horario === 'nocturno' && ac.conductores)

        return {
          ...asignacion,
          conductoresTurno: {
            diurno: diurno?.conductores ? {
              id: diurno.conductores.id,
              nombre: `${diurno.conductores.nombres || ''} ${diurno.conductores.apellidos || ''}`.trim(),
              confirmado: diurno.confirmado
            } : null,
            nocturno: nocturno?.conductores ? {
              id: nocturno.conductores.id,
              nombre: `${nocturno.conductores.nombres || ''} ${nocturno.conductores.apellidos || ''}`.trim(),
              confirmado: nocturno.confirmado
            } : null
          },
          conductorCargo: null
        }
      }

      // Para A CARGO, tomar el primer conductor activo (con datos válidos)
      const conductor = conductoresActivos.find((c: any) => c.conductores)
      return {
        ...asignacion,
        conductoresTurno: null,
        conductorCargo: conductor?.conductores ? {
          id: conductor.conductores.id,
          nombre: `${conductor.conductores.nombres || ''} ${conductor.conductores.apellidos || ''}`.trim(),
          confirmado: conductor.confirmado
        } : null
      }
    })
  }, [filteredAsignaciones])

  const columns = useMemo<ColumnDef<AsignacionActiva>[]>(
    () => [
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
          if (data.horario === 'todo_dia' || !data.horario) {
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
          if (horario === 'todo_dia' || !horario) {
            return (
              <div className="asig-conductores-compact">
                <span className={conductorCargo ? 'asig-conductor-turno' : 'asig-turno-vacante asig-turno-cargo'} title="A cargo">
                  <span className="asig-turno-label asig-label-cargo">C</span>
                  {conductorCargo ? conductorCargo.nombre : 'Sin asignar'}
                </span>
              </div>
            )
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
        id: 'modalidad',
        header: 'Modalidad',
        // El valor del accessor es el que lista el filtro de la columna: "A Cargo" / "Turno"
        accessorFn: (row) => etiquetaModalidad(row.horario),
        cell: ({ row }) => {
          const esCargo = row.original.horario === 'todo_dia'
          return (
            <span className={esCargo ? 'dt-badge asig-badge-cargo' : 'dt-badge asig-badge-turno'}>
              {etiquetaModalidad(row.original.horario)}
            </span>
          )
        },
        enableSorting: true,
      },
      {
        accessorKey: 'fecha_programada',
        header: 'Programación',
        cell: ({ getValue }) => {
          const fecha = getValue() as string | null
          if (!fecha) return <span style={{ color: 'var(--text-tertiary)' }}>-</span>
          const d = new Date(fecha)
          return `${d.toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })} ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' })}`
        },
        enableSorting: true,
      },
      {
        accessorKey: 'fecha_inicio',
        header: 'Entrega Real',
        cell: ({ getValue }) => {
          const fecha = getValue() as string
          if (!fecha || fecha === '-') return <span style={{ color: 'var(--text-tertiary)' }}>-</span>
          const d = new Date(fecha)
          return `${d.toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })} ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' })}`
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
            className="stat-card stat-card-clickable"
            title="Cómo se calcula el Total Flota - Click para ver el detalle"
            onClick={() => {
              const filas = desgloseFlota.map(e =>
                `<tr>
                   <td style="padding:7px 12px;border-bottom:1px solid #eee;text-align:left;">${e.label}</td>
                   <td style="padding:7px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${e.count}</td>
                 </tr>`
              ).join('')
              Swal.fire({
                title: 'Total Flota',
                html: `
                  <p style="margin:0 0 12px;color:#6B7280;text-align:left;font-size:13px;">
                    El <strong>Total Flota</strong> cuenta los vehículos cuyo estado actual es uno de los
                    siguientes. Cualquier otro estado (robo, destrucción total, jubilado, devuelto al
                    proveedor, disponible, corporativo, etc.) <strong>no</strong> se suma.
                  </p>
                  <table style="width:100%;border-collapse:collapse;font-size:14px;">
                    <thead>
                      <tr>
                        <th style="text-align:left;padding:7px 12px;border-bottom:2px solid #e5e7eb;color:#6B7280;font-size:12px;">Estado considerado</th>
                        <th style="text-align:right;padding:7px 12px;border-bottom:2px solid #e5e7eb;color:#6B7280;font-size:12px;">Vehículos</th>
                      </tr>
                    </thead>
                    <tbody>${filas}</tbody>
                    <tfoot>
                      <tr>
                        <td style="padding:9px 12px;font-weight:700;text-align:left;">Total Flota</td>
                        <td style="padding:9px 12px;font-weight:700;text-align:right;color:#e6002e;">${stats.totalFlota}</td>
                      </tr>
                    </tfoot>
                  </table>`,
                confirmButtonText: 'Cerrar',
                confirmButtonColor: '#e6002e',
                width: 500,
              })
            }}
          >
            <Car size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.totalFlota}</span>
              <span className="stat-label">Total Flota</span>
            </div>
            <Comparacion actual={stats.totalFlota} anterior={semanaAnterior?.totalFlota ?? null} />
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
            <Comparacion actual={stats.vehiculos} anterior={semanaAnterior?.vehiculosAsignados ?? null} />
          </div>
          <div
            className={`stat-card stat-card-clickable ${activeStatFilter === 'disponibles' ? 'stat-card-active' : ''}`}
            title="Total de vehículos con estado PKG_ON_BASE - Click para ver listado"
            onClick={() => handleStatCardClick('disponibles')}
          >
            <Car size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.pkgOnBase}</span>
              <span className="stat-label">Disponibles</span>
            </div>
          </div>
          <div
            className={`stat-card stat-card-clickable ${activeStatFilter === 'vacantes' ? 'stat-card-active' : ''}`}
            title={`Diurnos: ${stats.turnosDisponiblesD} | Nocturnos: ${stats.turnosDisponiblesN} (incluye ${stats.autosDisponibles} PKG_ON sin asignación, 1 D + 1 N c/u) - Click para filtrar`}
            onClick={() => handleStatCardClick('vacantes')}
          >
            <Clock size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.vacantesD + stats.vacantesN + (stats.autosDisponibles * 2)}</span>
              <span className="stat-label">Turnos Disponibles</span>
            </div>
            <Comparacion
              actual={stats.vacantesD + stats.vacantesN + (stats.autosDisponibles * 2)}
              anterior={semanaAnterior ? semanaAnterior.turnosTotales - semanaAnterior.turnosOcupados : null}
              invertido
            />
            <div className="asig-turnos-desglose">
              <span className="asig-turnos-desglose-item">
                <span className="asig-turno-label asig-label-diurno">D</span>
                {stats.turnosDisponiblesD}
              </span>
              <span className="asig-turnos-desglose-item">
                <span className="asig-turno-label asig-label-nocturno">N</span>
                {stats.turnosDisponiblesN}
              </span>
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
            <TrendingUp size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.porcentajeOcupacionGeneral}%</span>
              <span className="stat-label">% Ocupación</span>
            </div>
            <Comparacion
              puntos
              actual={Number(stats.porcentajeOcupacionGeneral)}
              anterior={semanaAnterior && semanaAnterior.turnosTotales > 0 ? (semanaAnterior.turnosOcupados / semanaAnterior.turnosTotales) * 100 : null}
            />
          </div>
          <div 
            className="stat-card stat-card-clickable" 
            title="Click para ver detalle del cálculo"
            onClick={() => {
              Swal.fire({
                title: '% Operatividad',
                html: `
                   <div style="text-align: left; font-size: 14px; line-height: 1.8;">
                    <p style="margin-bottom: 12px; color: #6B7280;">Porcentaje de vehículos en uso sobre el total de la flota:</p>
                    <div style="background: #F3F4F6; padding: 16px; border-radius: 8px; font-family: monospace;">
                      <p style="margin: 0;"><strong>EN_USO:</strong> ${stats.enUso}</p>
                      <p style="margin: 8px 0;"><strong>Total Flota:</strong> ${stats.totalFlota}</p>
                      <hr style="border: none; border-top: 1px solid #D1D5DB; margin: 12px 0;">
                      <p style="margin: 0; font-size: 16px; color: #059669;"><strong>= ${stats.enUso} / ${stats.totalFlota} = ${stats.porcentajeOperatividad}%</strong></p>
                    </div>
                  </div>
                `,
                icon: 'info',
                confirmButtonColor: '#059669',
                confirmButtonText: 'Entendido'
              })
            }}
          >
            <TrendingUp size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.porcentajeOperatividad}%</span>
              <span className="stat-label">% Operatividad</span>
            </div>
            <Comparacion
              puntos
              actual={Number(stats.porcentajeOperatividad)}
              anterior={semanaAnterior && semanaAnterior.totalFlota > 0 ? (semanaAnterior.enUso / semanaAnterior.totalFlota) * 100 : null}
            />
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
        emptyIcon={<ClipboardList size={64}
      />}
        emptyTitle="No hay asignaciones activas"
        emptyDescription="Actualmente no hay asignaciones en estado activo"
        resetFiltersKey={resetFiltersKey}
      />

      {/* Modal de Detalles */}
      {showDetailsModal && selectedAsignacion && (
        <DetalleAsignacionModal
          asignacion={selectedAsignacion}
          onClose={() => setShowDetailsModal(false)}
        />
      )}

    </div>
  )
}

// ===== Modalidad =====
/** Etiqueta de la modalidad: misma en la celda, en el filtro de la columna y en el modal. */
function etiquetaModalidad(horario: string | null | undefined): string {
  return horario === 'todo_dia' ? 'A Cargo' : 'Turno'
}

// ===== Modal "Detalles de la Asignación" =====

/** Datos del vehículo que no trae la query de la tabla: se piden al abrir el modal. */
interface VehiculoDetalle {
  color: string | null
  kilometraje_actual: number | null
  gnc: boolean | null
  telepase: boolean | null
  titular: string | null
  grupo_flota: string | null
  categoria: string | null
  cantidad_llaves: number | null
  lugar_radicacion: string | null
  vencimiento_seguro: string | null
  vto_vtv_aplica: boolean | null
  vto_vtv_fecha: string | null
  vto_gnc_aplica: boolean | null
  vto_gnc_fecha: string | null
  vto_matafuego_aplica: boolean | null
  vto_matafuego_fecha: string | null
}

/** Datos del conductor que no trae la query de la tabla. */
interface ConductorDetalle {
  id: string
  numero_dni: string | null
  numero_cuit: string | null
  licencia_vencimiento: string | null
  zona: string | null
  fecha_contratacion: string | null
  conductores_estados?: { descripcion: string } | null
}

const TZ_AR = 'America/Argentina/Buenos_Aires'
const SIN_DATO = '-'
const ORDEN_HORARIO: Record<string, number> = { diurno: 0, nocturno: 1 }

/** Fecha + hora (timestamps) en hora Argentina. */
function fechaHoraAR(valor: string | null | undefined): string {
  if (!valor || valor === '-') return SIN_DATO
  const d = new Date(valor)
  if (isNaN(d.getTime())) return SIN_DATO
  return `${d.toLocaleDateString('es-AR', { timeZone: TZ_AR })} ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ_AR })}`
}

/** Fecha sola (columnas date): se toma el día tal cual, sin corrimiento por zona horaria. */
function fechaAR(valor: string | null | undefined): string {
  if (!valor) return SIN_DATO
  const d = new Date(String(valor).substring(0, 10) + 'T12:00:00')
  return isNaN(d.getTime()) ? SIN_DATO : d.toLocaleDateString('es-AR')
}

/** Clase según cuánto falta para un vencimiento: vencido (rojo) o vence en 30 días (naranja). */
function claseVencimiento(valor: string | null | undefined): string {
  if (!valor) return ''
  const d = new Date(String(valor).substring(0, 10) + 'T12:00:00')
  if (isNaN(d.getTime())) return ''
  const dias = (d.getTime() - Date.now()) / 86400000
  if (dias < 0) return 'efd-vencido'
  if (dias <= 30) return 'efd-por-vencer'
  return ''
}

function siNo(valor: boolean | null | undefined): string {
  if (valor === null || valor === undefined) return SIN_DATO
  return valor ? 'Sí' : 'No'
}

function Dato({ label, children, ancho, className }: { label: string; children: ReactNode; ancho?: boolean; className?: string }) {
  return (
    <div className={`efd-dato${ancho ? ' efd-dato-ancho' : ''}`}>
      <span className="efd-label">{label}</span>
      <span className={`efd-valor${className ? ` ${className}` : ''}`}>{children ?? SIN_DATO}</span>
    </div>
  )
}

function Vencimiento({ label, aplica, fecha }: { label: string; aplica?: boolean | null; fecha: string | null | undefined }) {
  if (aplica === false) return <Dato label={label}><span className="efd-muted">No aplica</span></Dato>
  return <Dato label={label} className={claseVencimiento(fecha)}>{fechaAR(fecha)}</Dato>
}

function DetalleAsignacionModal({ asignacion, onClose }: { asignacion: AsignacionActiva; onClose: () => void }) {
  const [vehiculo, setVehiculo] = useState<VehiculoDetalle | null>(null)
  const [conductoresDet, setConductoresDet] = useState<Map<string, ConductorDetalle>>(new Map())
  // Tarifa de cada conductor de la asignación (id de asignaciones_conductores -> etiqueta "ENE-26"/"OCT-26")
  const [tarifas, setTarifas] = useState<Map<string, { etiqueta: string; nueva: boolean }>>(new Map())
  const [cargando, setCargando] = useState(true)

  const esCargo = asignacion.horario === 'todo_dia'

  // Conductores vigentes: diurno, nocturno y luego el resto (a cargo)
  const conductores = useMemo(() =>
    (asignacion.asignaciones_conductores || [])
      .filter(ac => ac.conductores && !['completado', 'finalizado', 'cancelado'].includes(ac.estado))
      .sort((a, b) => (ORDEN_HORARIO[a.horario] ?? 2) - (ORDEN_HORARIO[b.horario] ?? 2)),
  [asignacion])

  useEffect(() => {
    let vigente = true
    const ids = conductores.map(c => c.conductor_id).filter(Boolean)
    setCargando(true)
    Promise.all([
      asignacion.vehiculo_id
        ? supabase
            .from('vehiculos')
            .select('color, kilometraje_actual, gnc, telepase, titular, grupo_flota, categoria, cantidad_llaves, lugar_radicacion, vencimiento_seguro, vto_vtv_aplica, vto_vtv_fecha, vto_gnc_aplica, vto_gnc_fecha, vto_matafuego_aplica, vto_matafuego_fecha')
            .eq('id', asignacion.vehiculo_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      ids.length > 0
        ? supabase
            .from('conductores')
            .select('id, numero_dni, numero_cuit, licencia_vencimiento, zona, fecha_contratacion, conductores_estados (descripcion)')
            .in('id', ids)
        : Promise.resolve({ data: [] }),
      // Tarifa: la del conductor en la asignación; si no tiene, la de la asignación (mismo criterio que Asignaciones)
      supabase
        .from('asignaciones')
        .select('tipo_tarifa, asignaciones_conductores (id, tipo_tarifa)')
        .eq('id', asignacion.id)
        .maybeSingle(),
      cargarConceptosTarifa(),
    ])
      .then(([vRes, cRes, tRes, conceptos]) => {
        if (!vigente) return
        const asigTarifa = (tRes.data as any) || null
        const mapaTarifas = new Map<string, { etiqueta: string; nueva: boolean }>()
        for (const ac of (asigTarifa?.asignaciones_conductores || []) as Array<{ id: string; tipo_tarifa: string | null }>) {
          const tipo = (ac.tipo_tarifa || asigTarifa?.tipo_tarifa || 'antigua') === 'nueva' ? 'nueva' : 'antigua'
          mapaTarifas.set(ac.id, { etiqueta: getPeriodoTarifa(conceptos, tipo), nueva: tipo === 'nueva' })
        }
        setTarifas(mapaTarifas)
        setVehiculo((vRes.data as unknown as VehiculoDetalle) || null)
        const mapa = new Map<string, ConductorDetalle>()
        for (const c of ((cRes.data || []) as unknown as ConductorDetalle[])) mapa.set(c.id, c)
        setConductoresDet(mapa)
      })
      .catch(() => { /* el modal sigue mostrando los datos básicos de la tabla */ })
      .finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [asignacion, conductores])

  // Cerrar con Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const v = asignacion.vehiculos
  const estadoAsig = (asignacion.estado || '').toLowerCase()
  const estadoLabel = estadoAsig === 'activo' || estadoAsig === 'activa' ? 'Activa' : (asignacion.estado || SIN_DATO)
  const pendiente = cargando ? '…' : SIN_DATO

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content efd-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Detalles de la asignación">
        {/* Encabezado */}
        <div className="efd-header">
          <div className="efd-header-main">
            <span className="efd-titulo">Detalles de la Asignación</span>
            <div className="efd-header-fila">
              <span className="efd-codigo">{asignacion.codigo}</span>
              <span className="dt-badge dt-badge-green">{estadoLabel}</span>
              <span className={esCargo ? 'dt-badge asig-badge-cargo' : 'dt-badge asig-badge-turno'}>
                {etiquetaModalidad(asignacion.horario)}
              </span>
            </div>
          </div>
          <button className="efd-close" onClick={onClose} title="Cerrar"><X size={18} /></button>
        </div>

        <div className="efd-body">
          {/* Fechas */}
          <div className="efd-fechas">
            <Dato label="Creada">{fechaHoraAR(asignacion.created_at)}</Dato>
            <Dato label="Programada">{fechaHoraAR(asignacion.fecha_programada)}</Dato>
            <Dato label="Entrega real">{fechaHoraAR(asignacion.fecha_inicio)}</Dato>
          </div>

          {/* Vehículo */}
          <section className="efd-seccion">
            <div className="efd-seccion-titulo"><Car size={15} /> Vehículo</div>
            {v ? (
              <div className="efd-card">
                <div className="efd-card-head">
                  <div>
                    <span className="efd-patente">{v.patente}</span>
                    <span className="efd-sub">{[v.marca, v.modelo].filter(Boolean).join(' ')}{v.anio ? ` · ${v.anio}` : ''}</span>
                  </div>
                  {v.vehiculos_estados?.descripcion && (
                    <span className="dt-badge dt-badge-gray">{v.vehiculos_estados.descripcion}</span>
                  )}
                </div>
                <div className="efd-grid">
                  <Dato label="Color">{vehiculo?.color || pendiente}</Dato>
                  <Dato label="Categoría">{vehiculo?.categoria || pendiente}</Dato>
                  <Dato label="Grupo de flota">{vehiculo?.grupo_flota || pendiente}</Dato>
                  <Dato label="Kilometraje">
                    {vehiculo?.kilometraje_actual != null ? `${Number(vehiculo.kilometraje_actual).toLocaleString('es-AR')} km` : pendiente}
                  </Dato>
                  <Dato label="GNC">{vehiculo ? siNo(vehiculo.gnc) : pendiente}</Dato>
                  <Dato label="Telepase">{vehiculo ? (vehiculo.telepase ? 'Propio' : 'Toshify') : pendiente}</Dato>
                  <Dato label="Llaves">{vehiculo?.cantidad_llaves ?? pendiente}</Dato>
                  <Dato label="Radicación">{vehiculo?.lugar_radicacion || pendiente}</Dato>
                  <Dato label="Titular" ancho>{vehiculo?.titular || pendiente}</Dato>
                  <Dato label="Tipo">{v.vehiculos_tipos?.descripcion || SIN_DATO}</Dato>
                </div>
                {vehiculo && (
                  <div className="efd-grid efd-vencimientos">
                    <Vencimiento label="Vto. seguro" fecha={vehiculo.vencimiento_seguro} />
                    <Vencimiento label="Vto. VTV" aplica={vehiculo.vto_vtv_aplica} fecha={vehiculo.vto_vtv_fecha} />
                    <Vencimiento label="Vto. GNC" aplica={vehiculo.vto_gnc_aplica} fecha={vehiculo.vto_gnc_fecha} />
                    <Vencimiento label="Vto. matafuego" aplica={vehiculo.vto_matafuego_aplica} fecha={vehiculo.vto_matafuego_fecha} />
                  </div>
                )}
              </div>
            ) : (
              <p className="efd-vacio">No hay información del vehículo</p>
            )}
          </section>

          {/* Conductores */}
          <section className="efd-seccion">
            <div className="efd-seccion-titulo">
              <User size={15} /> {conductores.length === 1 ? 'Conductor' : `Conductores (${conductores.length})`}
            </div>
            {conductores.length === 0 && <p className="efd-vacio">No hay conductores asignados actualmente</p>}
            {conductores.map(ac => {
              const det = conductoresDet.get(ac.conductor_id)
              const letra = ac.horario === 'diurno' ? 'D' : ac.horario === 'nocturno' ? 'N' : 'C'
              const claseLetra = letra === 'D' ? 'asig-label-diurno' : letra === 'N' ? 'asig-label-nocturno' : 'asig-label-cargo'
              const turnoLabel = letra === 'D' ? 'Diurno' : letra === 'N' ? 'Nocturno' : 'A cargo'
              return (
                <div key={ac.id} className="efd-card">
                  <div className="efd-card-head">
                    <div className="efd-conductor-nombre">
                      <span className={`asig-turno-label ${claseLetra}`} title={turnoLabel}>{letra}</span>
                      <span>{`${ac.conductores?.nombres || ''} ${ac.conductores?.apellidos || ''}`.trim()}</span>
                    </div>
                    <div className="efd-head-badges">
                    {tarifas.get(ac.id) && (
                      <span className={tarifas.get(ac.id)!.nueva ? 'dt-badge dt-badge-blue' : 'dt-badge dt-badge-gray'}
                        title={tarifas.get(ac.id)!.nueva ? 'Tarifa nueva' : 'Tarifa anterior'}>
                        Tarifa {tarifas.get(ac.id)!.etiqueta}
                      </span>
                    )}
                    {ac.confirmado ? (
                      <span className="dt-badge dt-badge-green" title={ac.fecha_confirmacion ? `Confirmado el ${fechaHoraAR(ac.fecha_confirmacion)}` : undefined}>Confirmado</span>
                    ) : (
                      <span className="dt-badge dt-badge-yellow">Pendiente</span>
                    )}
                    </div>
                  </div>
                  <div className="efd-grid">
                    <Dato label="DNI">{det?.numero_dni || pendiente}</Dato>
                    <Dato label="CUIT">{det?.numero_cuit || pendiente}</Dato>
                    <Dato label="Teléfono">{ac.conductores?.telefono_contacto || SIN_DATO}</Dato>
                    <Dato label="Zona">{det?.zona || pendiente}</Dato>
                    <Dato label="Licencia">{ac.conductores?.numero_licencia || SIN_DATO}</Dato>
                    <Dato label="Vto. licencia" className={claseVencimiento(det?.licencia_vencimiento)}>
                      {det ? fechaAR(det.licencia_vencimiento) : pendiente}
                    </Dato>
                    <Dato label="Estado conductor">{det?.conductores_estados?.descripcion || pendiente}</Dato>
                    <Dato label="Ingreso">{det ? fechaAR(det.fecha_contratacion) : pendiente}</Dato>
                  </div>
                </div>
              )
            })}
          </section>
        </div>

        <div className="efd-footer">
          <button className="efd-btn-cerrar" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}
