// src/modules/asignaciones/AsignacionesModule.tsx
import { useState, useEffect, useMemo } from 'react'
import { Eye, Trash2, CheckCircle, XCircle, FileText, Calendar, UserPlus, UserCheck, Ban, Plus, Pencil } from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../../components/ui/DataTable/DataTable'
import { supabase } from '../../lib/supabase'
import { usePermissions } from '../../contexts/PermissionsContext'
import { useAuth } from '../../contexts/AuthContext'
import { AssignmentWizard } from '../../components/AssignmentWizard'
// KanbanBoard y ProgramacionWizard movidos a /onboarding/programacion
import Swal from 'sweetalert2'
import './AsignacionesModule.css'

interface Asignacion {
  id: string
  codigo: string
  vehiculo_id: string
  conductor_id: string
  fecha_programada?: string | null
  fecha_inicio: string
  fecha_fin: string | null
  modalidad: string
  horario: string
  estado: string
  notas: string | null
  created_at: string
  created_by?: string | null
  vehiculos?: {
    patente: string
    marca: string
    modelo: string
  }
  conductores?: {
    nombres: string
    apellidos: string
    numero_licencia: string
  }
  asignaciones_conductores?: Array<{
    id: string
    conductor_id: string
    estado: string
    horario: string
    confirmado: boolean
    fecha_confirmacion?: string | null
    documento?: string
    conductores: {
      nombres: string
      apellidos: string
      numero_licencia: string
    }
  }>
}

interface ConductorTurno {
  diurno: { id: string; nombre: string; confirmado: boolean } | null
  nocturno: { id: string; nombre: string; confirmado: boolean } | null
}

interface ExpandedAsignacion extends Asignacion {
  conductoresTurno: ConductorTurno | null
  conductorCargo: { id: string; nombre: string; confirmado: boolean } | null
}

// Helper: Convierte fecha ISO UTC a string YYYY-MM-DD en zona horaria LOCAL
// Esto es necesario porque las fechas se guardan en UTC pero queremos filtrar por día local
function getLocalDateStr(isoString: string): string {
  const date = new Date(isoString)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function AsignacionesModule() {
  const { canEditInMenu, canDeleteInMenu } = usePermissions()
  const { profile } = useAuth()
  const canEdit = canEditInMenu('asignaciones')
  const canDelete = canDeleteInMenu('asignaciones')
  
  // Solo admin y fullstack.senior pueden crear/editar asignaciones manuales
  const userRole = profile?.roles?.name || ''
  const canCreateManualAssignment = userRole === 'admin' || userRole === 'fullstack.senior'

  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showWizard, setShowWizard] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [selectedAsignacion, setSelectedAsignacion] = useState<Asignacion | null>(null)
  const [confirmComentarios, setConfirmComentarios] = useState('')
  const [cancelMotivo, setCancelMotivo] = useState('')
  const [showViewModal, setShowViewModal] = useState(false)
  const [viewAsignacion, setViewAsignacion] = useState<Asignacion | null>(null)
  const [conductoresToConfirm, setConductoresToConfirm] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // Modal de regularización
  const [showRegularizarModal, setShowRegularizarModal] = useState(false)
  const [regularizarAsignacion, setRegularizarAsignacion] = useState<Asignacion | null>(null)
  const [regularizarData, setRegularizarData] = useState<{
    fecha_inicio: string
    fecha_fin: string
    notas: string
    vehiculo_id: string
    horario: string
    conductor_diurno_id: string
    conductor_nocturno_id: string
    conductor_cargo_id: string
  }>({ fecha_inicio: '', fecha_fin: '', notas: '', vehiculo_id: '', horario: '', conductor_diurno_id: '', conductor_nocturno_id: '', conductor_cargo_id: '' })
  const [vehiculosDisponibles, setVehiculosDisponibles] = useState<any[]>([])
  const [conductoresDisponibles, setConductoresDisponibles] = useState<any[]>([])
  const [loadingRegularizar, setLoadingRegularizar] = useState(false)
  // Estados para búsqueda de conductores en modal editar
  const [searchDiurno, setSearchDiurno] = useState('')
  const [searchNocturno, setSearchNocturno] = useState('')
  const [searchCargo, setSearchCargo] = useState('')
  const [showDropdownDiurno, setShowDropdownDiurno] = useState(false)
  const [showDropdownNocturno, setShowDropdownNocturno] = useState(false)
  const [showDropdownCargo, setShowDropdownCargo] = useState(false)
  
  // Datos base para cálculo de stats (cargados en paralelo)
  const [vehiculosData, setVehiculosData] = useState<Array<{ id: string; estado_id: string; estadoCodigo?: string }>>([])
  const [conductoresData, setConductoresData] = useState<Array<{ id: string; estadoCodigo?: string }>>([])
  const [activeStatCard, setActiveStatCard] = useState<string | null>(null)
  
  // Programacion de entregas movida a /onboarding/programacion

  // ✅ OPTIMIZADO: Calcular stats desde datos ya cargados (elimina 14+ queries)
  const calculatedStats = useMemo(() => {
    const hoy = new Date()
    // Usar fecha local (no UTC) para comparaciones correctas en la zona horaria del usuario
    const hoyStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
    
    // Calcular lunes de la semana actual (para completadas/canceladas de la semana)
    const diaSemana = hoy.getDay() // 0=domingo, 1=lunes, ..., 6=sabado
    const diffToLunes = diaSemana === 0 ? -6 : 1 - diaSemana // Si es domingo, retroceder 6 días
    const lunesSemana = new Date(hoy)
    lunesSemana.setDate(hoy.getDate() + diffToLunes)
    const lunesSemanaStr = `${lunesSemana.getFullYear()}-${String(lunesSemana.getMonth() + 1).padStart(2, '0')}-${String(lunesSemana.getDate()).padStart(2, '0')}`
    
    // Calcular domingo de la semana actual
    const domingoSemana = new Date(lunesSemana)
    domingoSemana.setDate(lunesSemana.getDate() + 6)
    const domingoSemanaStr = `${domingoSemana.getFullYear()}-${String(domingoSemana.getMonth() + 1).padStart(2, '0')}-${String(domingoSemana.getDate()).padStart(2, '0')}`
    
    // Para entregas programadas (próximos 7 días)
    const finSemana = new Date(hoy)
    finSemana.setDate(finSemana.getDate() + 7)
    const finSemanaStr = `${finSemana.getFullYear()}-${String(finSemana.getMonth() + 1).padStart(2, '0')}-${String(finSemana.getDate()).padStart(2, '0')}`

    // Estados a excluir/agrupar
    const estadosTaller = ['TALLER_AXIS', 'TALLER_CHAPA_PINTURA', 'TALLER_ALLIANCE', 'TALLER_KALZALO']
    const estadosFueraServicio = ['ROBO', 'DESTRUCCION_TOTAL', 'PKG_OFF_BASE']
    const estadosNoDisponibles = ['ROBO', 'DESTRUCCION_TOTAL', 'JUBILADO', 'CORPORATIVO', 'RETENIDO_COMISARIA', 'PKG_OFF_BASE', 'PKG_OFF_FRANCIA']

    // Contadores de vehículos
    let totalVehiculos = 0
    let vehiculosDisponibles = 0
    let vehiculosEnUso = 0
    let vehiculosEnTaller = 0
    let vehiculosFueraServicio = 0

    for (const v of vehiculosData) {
      totalVehiculos++
      const codigo = v.estadoCodigo || ''
      if (codigo === 'DISPONIBLE' || codigo === 'PKG_ON_BASE') vehiculosDisponibles++
      else if (codigo === 'EN_USO') vehiculosEnUso++
      else if (estadosTaller.includes(codigo)) vehiculosEnTaller++
      else if (estadosFueraServicio.includes(codigo)) vehiculosFueraServicio++
    }

    // Conductores activos
    const conductoresActivos = conductoresData.filter(c =>
      c.estadoCodigo?.toLowerCase().includes('activo')
    )
    const totalConductores = conductoresActivos.length

    // Asignaciones activas y sus conductores
    const asignacionesActivas = asignaciones.filter(a => a.estado === 'activa')
    const conductoresOcupadosIds = new Set<string>()

    let turnosOcupados = 0
    let vehiculosTurno = 0

    for (const a of asignacionesActivas) {
      const conductores = a.asignaciones_conductores || []
      for (const c of conductores) {
        if (c.conductor_id) conductoresOcupadosIds.add(c.conductor_id)
      }
      if (a.horario === 'TURNO') {
        vehiculosTurno++
        turnosOcupados += conductores.length
      }
    }

    const conductoresDisponibles = conductoresActivos.filter(c => !conductoresOcupadosIds.has(c.id)).length
    const conductoresAsignados = conductoresOcupadosIds.size
    const turnosDisponibles = Math.max(0, (vehiculosTurno * 2) - turnosOcupados)

    // Vehículos asignados
    const vehiculosAsignadosIds = new Set(asignacionesActivas.map(a => a.vehiculo_id))
    const vehiculosSinAsignar = vehiculosData.filter(v =>
      !vehiculosAsignadosIds.has(v.id) && !estadosNoDisponibles.includes(v.estadoCodigo || '')
    ).length
    const vehiculosTurnoConVacante = asignacionesActivas.filter(a =>
      a.horario === 'TURNO' && (a.asignaciones_conductores?.length || 0) < 2
    ).length
    const unidadesDisponibles = vehiculosSinAsignar + vehiculosTurnoConVacante

    // Entregas programadas
    const entregasHoy = asignaciones.filter(a => {
      if (a.estado !== 'programado' || !a.fecha_programada) return false
      const fecha = a.fecha_programada.split('T')[0]
      return fecha === hoyStr
    }).length

    const entregasSemana = asignaciones.filter(a => {
      if (a.estado !== 'programado' || !a.fecha_programada) return false
      const fecha = a.fecha_programada.split('T')[0]
      return fecha >= hoyStr && fecha <= finSemanaStr
    }).length

    // Entregas completadas ESTA SEMANA (lunes a domingo)
    // Usamos getLocalDateStr para convertir UTC a fecha local y evitar problemas de timezone
    const entregasCompletadasSemana = asignaciones.filter(a => {
      // Incluir asignaciones activas O finalizadas que se activaron esta semana
      if ((a.estado !== 'activa' && a.estado !== 'finalizada') || !a.fecha_inicio) return false
      const fechaEntregaLocal = getLocalDateStr(a.fecha_inicio)
      return fechaEntregaLocal >= lunesSemanaStr && fechaEntregaLocal <= domingoSemanaStr
    }).length

    // Canceladas ESTA SEMANA (lunes a domingo)
    // Usamos getLocalDateStr para convertir UTC a fecha local
    const entregasCanceladasSemana = asignaciones.filter(a => {
      if (a.estado !== 'cancelada') return false
      // Usar fecha_fin si existe, sino fecha de creación
      const fechaRef = a.fecha_fin || a.created_at
      if (!fechaRef) return false
      const fechaCancelacionLocal = getLocalDateStr(fechaRef)
      return fechaCancelacionLocal >= lunesSemanaStr && fechaCancelacionLocal <= domingoSemanaStr
    }).length

    // Conductores por documento - contamos CONDUCTORES ÚNICOS (no asignaciones)
    const conductoresCartaOfertaSet = new Set<string>()
    const conductoresAnexoSet = new Set<string>()

    for (const a of asignaciones) {
      // Solo contar asignaciones activas o programadas
      if (a.estado !== 'activa' && a.estado !== 'programado') continue

      for (const c of (a.asignaciones_conductores || [])) {
        // Solo contar conductores activos (no completados/finalizados/cancelados)
        if (c.estado === 'completado' || c.estado === 'finalizado' || c.estado === 'cancelado') continue
        
        if (c.documento === 'CARTA_OFERTA' && c.conductor_id) {
          conductoresCartaOfertaSet.add(c.conductor_id)
        }
        if (c.documento === 'ANEXO' && c.conductor_id) {
          conductoresAnexoSet.add(c.conductor_id)
        }
      }
    }

    const asignacionesCartaOferta = conductoresCartaOfertaSet.size
    const asignacionesAnexo = conductoresAnexoSet.size

    return {
      totalVehiculos,
      vehiculosDisponibles,
      vehiculosEnUso,
      vehiculosEnTaller,
      vehiculosFueraServicio,
      turnosDisponibles,
      conductoresDisponibles,
      conductoresAsignados,
      totalConductores,
      entregasHoy,
      entregasSemana,
      asignacionesActivas: asignacionesActivas.length,
      unidadesDisponibles,
      entregasCompletadasSemana,
      entregasCanceladasSemana,
      conductoresCartaOferta: asignacionesCartaOferta,
      conductoresAnexo: asignacionesAnexo,
      // Datos de la semana para filtros
      lunesSemanaStr,
      domingoSemanaStr
    }
  }, [vehiculosData, conductoresData, asignaciones])

  // ✅ OPTIMIZADO: Carga TODO en paralelo con límites
  const loadAllData = async () => {
    try {
      setLoading(true)
      setError(null)

      // Calcular fecha límite (últimos 60 días para historial)
      const fechaLimite = new Date()
      fechaLimite.setDate(fechaLimite.getDate() - 60)
      const fechaLimiteStr = fechaLimite.toISOString()

      const [asignacionesRes, vehiculosRes, conductoresRes] = await Promise.all([
        // Asignaciones: activas/programadas + finalizadas recientes (máx 500)
        supabase
          .from('asignaciones')
          .select(`
            id, codigo, vehiculo_id, horario, fecha_programada, fecha_inicio, fecha_fin, estado, created_at,
            vehiculos (patente, marca, modelo),
            asignaciones_conductores (
              id, conductor_id, estado, horario, confirmado, fecha_confirmacion, documento,
              conductores (nombres, apellidos, numero_licencia)
            )
          `)
          .or(`estado.in.(programado,activa),created_at.gte.${fechaLimiteStr}`)
          .order('created_at', { ascending: false })
          .limit(500),
        // Vehículos con estado - solo activos
        supabase
          .from('vehiculos')
          .select('id, estado_id, vehiculos_estados(codigo)')
          .limit(1000),
        // Conductores con estado - solo activos
        supabase
          .from('conductores')
          .select('id, conductores_estados(codigo)')
          .limit(2000)
      ])

      if (asignacionesRes.error) throw asignacionesRes.error
      setAsignaciones(asignacionesRes.data || [])

      // Procesar vehículos
      if (vehiculosRes.data) {
        setVehiculosData(vehiculosRes.data.map((v: any) => ({
          id: v.id,
          estado_id: v.estado_id,
          estadoCodigo: v.vehiculos_estados?.codigo
        })))
      }

      // Procesar conductores
      if (conductoresRes.data) {
        setConductoresData(conductoresRes.data.map((c: any) => ({
          id: c.id,
          estadoCodigo: c.conductores_estados?.codigo
        })))
      }
    } catch (err: any) {
      console.error('Error loading data:', err)
      setError(err.message || 'Error al cargar los datos')
    } finally {
      setLoading(false)
    }
  }

  const loadAsignaciones = async () => {
    try {
      setLoading(true)
      setError(null)

      // Calcular fecha límite (últimos 60 días)
      const fechaLimite = new Date()
      fechaLimite.setDate(fechaLimite.getDate() - 60)
      const fechaLimiteStr = fechaLimite.toISOString()

      const { data, error: queryError } = await supabase
        .from('asignaciones')
        .select(`
          id, codigo, vehiculo_id, horario, fecha_programada, fecha_inicio, fecha_fin, estado, created_at,
          vehiculos (patente, marca, modelo),
          asignaciones_conductores (
            id, conductor_id, estado, horario, confirmado, fecha_confirmacion, documento,
            conductores (nombres, apellidos, numero_licencia)
          )
        `)
        .or(`estado.in.(programado,activa),created_at.gte.${fechaLimiteStr}`)
        .order('created_at', { ascending: false })
        .limit(500)

      if (queryError) throw queryError

      setAsignaciones(data || [])
    } catch (err: any) {
      console.error('Error loading asignaciones:', err)
      setError(err.message || 'Error al cargar las asignaciones')
    } finally {
      setLoading(false)
    }
  }

  // ✅ OPTIMIZADO: Carga unificada en paralelo
  useEffect(() => {
    loadAllData()
  }, [])

  // Programacion de entregas movida a /onboarding/programacion

  // Filtrar solo por stat cards - los filtros de columna los maneja DataTable automáticamente
  // IMPORTANTE: Los filtros deben coincidir EXACTAMENTE con lo que cuentan los stats
  const filteredAsignaciones = useMemo(() => {
    let result = asignaciones

    // Usar los rangos de semana calculados en calculatedStats
    const { lunesSemanaStr, domingoSemanaStr } = calculatedStats
    
    // Calcular hoy para filtro de entregas programadas hoy
    const hoy = new Date()
    const hoyStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`

    // Filtro por stat card activa
    switch (activeStatCard) {
      case 'programadas':
        result = result.filter(a => a.estado === 'programado')
        break
      case 'activas':
        result = result.filter(a => a.estado === 'activa')
        break
      case 'completadas':
        // Completadas ESTA SEMANA (lunes a domingo) - entregas activadas/confirmadas
        // Usamos getLocalDateStr para convertir UTC a fecha local
        result = result.filter(a => {
          if ((a.estado !== 'activa' && a.estado !== 'finalizada') || !a.fecha_inicio) return false
          const fechaEntregaLocal = getLocalDateStr(a.fecha_inicio)
          return fechaEntregaLocal >= lunesSemanaStr && fechaEntregaLocal <= domingoSemanaStr
        })
        break
      case 'canceladas':
        // Canceladas ESTA SEMANA (lunes a domingo) - coincide con stat
        // Usamos getLocalDateStr para convertir UTC a fecha local
        result = result.filter(a => {
          if (a.estado !== 'cancelada') return false
          const fechaRef = a.fecha_fin || a.created_at
          if (!fechaRef) return false
          const fechaCancelacionLocal = getLocalDateStr(fechaRef)
          return fechaCancelacionLocal >= lunesSemanaStr && fechaCancelacionLocal <= domingoSemanaStr
        })
        break
      case 'cartaOferta':
        // Solo asignaciones ACTIVAS o PROGRAMADAS con Carta Oferta - coincide con stat
        result = result.filter(a =>
          (a.estado === 'activa' || a.estado === 'programado') &&
          a.asignaciones_conductores?.some(c => c.documento === 'CARTA_OFERTA')
        )
        break
      case 'anexo':
        // Solo asignaciones ACTIVAS o PROGRAMADAS con Anexo - coincide con stat
        result = result.filter(a =>
          (a.estado === 'activa' || a.estado === 'programado') &&
          a.asignaciones_conductores?.some(c => c.documento === 'ANEXO')
        )
        break
      case 'entregasHoy':
        // Entregas programadas para HOY - coincide con stat entregasHoy
        result = result.filter(a => {
          if (a.estado !== 'programado' || !a.fecha_programada) return false
          const fecha = a.fecha_programada.split('T')[0]
          return fecha === hoyStr
        })
        break
    }

    // Ordenar: programados primero, luego por fecha_programada ascendente
    return result.sort((a, b) => {
      // Prioridad de estados: programado > activa > otros
      const estadoPrioridad: Record<string, number> = { programado: 0, activa: 1, finalizada: 2, cancelada: 3 }
      const prioA = estadoPrioridad[a.estado] ?? 99
      const prioB = estadoPrioridad[b.estado] ?? 99
      if (prioA !== prioB) return prioA - prioB
      // Luego por fecha_programada ascendente (más próximas primero)
      const fechaA = a.fecha_programada ? new Date(a.fecha_programada).getTime() : Infinity
      const fechaB = b.fecha_programada ? new Date(b.fecha_programada).getTime() : Infinity
      return fechaA - fechaB
    })
  }, [asignaciones, activeStatCard])

  // Procesar asignaciones - UNA fila por asignación (solo asignaciones reales)
  const expandedAsignaciones = useMemo<ExpandedAsignacion[]>(() => {
    // Asignaciones activas con vacantes (TURNO con menos de 2 conductores ACTIVOS) van primero
    const asignacionesConVacante = filteredAsignaciones
      .filter(a => (a.estado === 'activa' || a.estado === 'activo') && a.horario === 'TURNO')
      .filter(a => {
        const conductoresActivos = (a.asignaciones_conductores || [])
          .filter(ac => ac.estado !== 'completado' && ac.estado !== 'finalizado' && ac.estado !== 'cancelado')
        return conductoresActivos.length < 2
      })

    // Procesar todas las asignaciones filtradas
    const asignacionesProcesadas = filteredAsignaciones.map((asignacion): ExpandedAsignacion => {
      const conductores = asignacion.asignaciones_conductores || []
      const esAsignacionFinalizada = asignacion.estado === 'finalizada' || asignacion.estado === 'completada'
      
      // Para asignaciones ACTIVAS: filtrar solo conductores activos (no completados/finalizados)
      // Para asignaciones FINALIZADAS: mostrar los últimos conductores (histórico)
      // Para asignaciones ACTIVAS: filtrar conductores que ya no están (completado, finalizado, cancelado)
      const conductoresParaMostrar = esAsignacionFinalizada
        ? conductores // Mostrar todos los conductores (histórico)
        : conductores.filter(ac => ac.estado !== 'completado' && ac.estado !== 'finalizado' && ac.estado !== 'cancelado')

      // Para modalidad TURNO: extraer conductor diurno y nocturno
      if (asignacion.horario === 'TURNO') {
        // Para asignaciones finalizadas, buscar el último conductor de cada turno (el más reciente)
        const conductoresDiurno = conductores.filter(ac => ac.horario === 'diurno')
        const conductoresNocturno = conductores.filter(ac => ac.horario === 'nocturno')
        
        const diurno = esAsignacionFinalizada
          ? conductoresDiurno[conductoresDiurno.length - 1] // El último agregado
          : conductoresParaMostrar.find(ac => ac.horario === 'diurno')
        
        const nocturno = esAsignacionFinalizada
          ? conductoresNocturno[conductoresNocturno.length - 1] // El último agregado
          : conductoresParaMostrar.find(ac => ac.horario === 'nocturno')

        return {
          ...asignacion,
          conductoresTurno: {
            diurno: diurno ? {
              id: diurno.id,
              nombre: `${diurno.conductores.nombres} ${diurno.conductores.apellidos}`,
              confirmado: diurno.confirmado || false
            } : null,
            nocturno: nocturno ? {
              id: nocturno.id,
              nombre: `${nocturno.conductores.nombres} ${nocturno.conductores.apellidos}`,
              confirmado: nocturno.confirmado || false
            } : null
          },
          conductorCargo: null
        }
      }

      // Para modalidad A CARGO: mostrar conductor
      const primerConductor = esAsignacionFinalizada
        ? conductores[conductores.length - 1] // El último agregado (histórico)
        : conductoresParaMostrar[0]
      return {
        ...asignacion,
        conductoresTurno: null,
        conductorCargo: primerConductor ? {
          id: primerConductor.id,
          nombre: `${primerConductor.conductores.nombres} ${primerConductor.conductores.apellidos}`,
          confirmado: primerConductor.confirmado || false
        } : null
      }
    })

    // Ordenar: programados primero (tienen prioridad), luego vacantes, luego el resto
    const vacantesIds = new Set(asignacionesConVacante.map(a => a.id))
    return asignacionesProcesadas.sort((a, b) => {
      // Programados van primero
      const aEsProgramado = a.estado === 'programado' ? 0 : 1
      const bEsProgramado = b.estado === 'programado' ? 0 : 1
      if (aEsProgramado !== bEsProgramado) return aEsProgramado - bEsProgramado

      // Luego vacantes
      const aEsVacante = vacantesIds.has(a.id) ? 0 : 1
      const bEsVacante = vacantesIds.has(b.id) ? 0 : 1
      return aEsVacante - bEsVacante
    })
  }, [filteredAsignaciones])

  // Estadísticas para los stat cards (solo programadas del listado actual)
  const programadasCount = useMemo(() => {
    return asignaciones.filter(a => a.estado === 'programado').length
  }, [asignaciones])

  // Manejar click en stat cards para filtrar
  const handleStatCardClick = (cardType: string) => {
    // Toggle: si hace click en el mismo, desactivar; si no, activar el nuevo
    setActiveStatCard(prev => prev === cardType ? null : cardType)
  }

  // Generar filtros externos para mostrar en la barra de filtros del DataTable
  const externalFilters = useMemo(() => {
    if (!activeStatCard) return []

    const labels: Record<string, string> = {
      programadas: 'Programadas',
      completadas: 'Completadas (Semana)',
      canceladas: 'Canceladas (Semana)',
      cartaOferta: 'Carta Oferta (Activas/Prog.)',
      anexo: 'Anexo (Activas/Prog.)'
    }

    return [{
      id: activeStatCard,
      label: labels[activeStatCard] || activeStatCard,
      onClear: () => setActiveStatCard(null)
    }]
  }, [activeStatCard])

  const handleDelete = async (id: string) => {
    if (isSubmitting || !canDelete) return

    const result = await Swal.fire({
      title: '¿Eliminar asignación?',
      text: 'Esta acción eliminará la asignación permanentemente. Si fue creada desde Programaciones, podrás enviarla nuevamente.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#DC2626',
      cancelButtonColor: '#6B7280',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    })

    if (result.isConfirmed) {
      setIsSubmitting(true)
      try {
        const asignacion = asignaciones.find(a => a.id === id)

        // 1. Limpiar referencia en programaciones_onboarding (si existe)
        // Esto permite re-enviar la programacion despues de eliminar la asignacion
        const { data: progUpdate, error: progError } = await (supabase as any)
          .from('programaciones_onboarding')
          .update({ asignacion_id: null, fecha_asignacion_creada: null })
          .eq('asignacion_id', id)
          .select('id')

        if (progError) {
          console.error('Error limpiando referencia en programaciones:', progError)
        } else {
          console.log('✅ Referencia limpiada en programaciones:', progUpdate?.length || 0, 'registros actualizados')
        }

        // 2. Eliminar conductores asociados
        const { error: conductoresError } = await (supabase as any)
          .from('asignaciones_conductores')
          .delete()
          .eq('asignacion_id', id)

        if (conductoresError) {
          console.error('Error eliminando conductores:', conductoresError)
        }

        // 3. Eliminar la asignación
        const { error: asignacionError } = await (supabase as any)
          .from('asignaciones')
          .delete()
          .eq('id', id)
        if (asignacionError) throw asignacionError

        // 4. Cambiar estado del vehículo a DISPONIBLE
        if (asignacion?.vehiculo_id) {
          const { data: estadoDisponible } = await supabase
            .from('vehiculos_estados')
            .select('id')
            .eq('codigo', 'DISPONIBLE')
            .single() as { data: { id: string } | null }

          if (estadoDisponible) {
            await (supabase as any).from('vehiculos').update({ estado_id: estadoDisponible.id }).eq('id', asignacion.vehiculo_id)
          }
        }

        Swal.fire({
          icon: 'success',
          title: 'Eliminado',
          html: `La asignación ha sido eliminada.<br><br>
                 <strong>Si deseas re-enviar esta programación:</strong><br>
                 Ve a <em>Programaciones</em> y recarga la página (F5), luego podrás enviarla nuevamente.`,
          confirmButtonText: 'Entendido'
        })
        loadAsignaciones()
      } catch (err: any) {
        Swal.fire('Error', err.message || 'Error al eliminar la asignación', 'error')
      } finally {
        setIsSubmitting(false)
      }
    }
  }

  const handleConfirmProgramacion = async () => {
    if (isSubmitting || !selectedAsignacion || conductoresToConfirm.length === 0) return

    setIsSubmitting(true)
    try {
      const ahora = new Date().toISOString()
      const fechaProgramada = selectedAsignacion.fecha_programada
        ? new Date(selectedAsignacion.fecha_programada).toISOString().split('T')[0]
        : null

      // Detectar si hay conductores marcados como "companero" en las notas
      // Formato: [COMPANERO:diurno:uuid] o [COMPANERO:nocturno:uuid]
      const notas = selectedAsignacion.notas || ''
      const companeroMatches = notas.match(/\[COMPANERO:(diurno|nocturno):([a-f0-9-]+)\]/gi) || []
      const companeroIds = new Set<string>()
      companeroMatches.forEach((match: string) => {
        const parts = match.match(/\[COMPANERO:(diurno|nocturno):([a-f0-9-]+)\]/i)
        if (parts && parts[2]) {
          companeroIds.add(parts[2])
        }
      })
      const tieneCompaneros = companeroIds.size > 0
      console.log('🔍 Detectando companeros:', { notas, companeroMatches, companeroIds: Array.from(companeroIds), tieneCompaneros })

      await (supabase as any)
        .from('asignaciones_conductores')
        .update({ confirmado: true, fecha_confirmacion: ahora, fecha_inicio: ahora })
        .in('id', conductoresToConfirm)

      const { data: allConductores } = await supabase
        .from('asignaciones_conductores')
        .select('id, conductor_id, confirmado, horario')
        .eq('asignacion_id', selectedAsignacion.id)

      const todosConfirmados = (allConductores as any)?.every((c: any) => c.confirmado === true)

      if (todosConfirmados) {
        const conductoresIds = (allConductores as any)?.map((c: any) => c.conductor_id) || []

        // Si tiene companeros, lógica especial
        if (tieneCompaneros) {
          console.log('⚡ Ejecutando lógica de asignacion_companero')

          // Identificar conductores nuevos (los que NO son companero)
          const conductoresNuevos = (allConductores as any)?.filter((c: any) => !companeroIds.has(c.conductor_id)) || []
          console.log('👤 Conductores nuevos (no companero):', conductoresNuevos)

          // IMPORTANTE: Finalizar participaciones anteriores de los conductores NUEVOS
          // (igual que en la lógica normal, para que dejen vacante su turno anterior)
          for (const conductorNuevo of conductoresNuevos) {
            console.log('🔄 Finalizando participaciones anteriores de conductor:', conductorNuevo.conductor_id)
            await (supabase as any)
              .from('asignaciones_conductores')
              .update({ estado: 'completado', fecha_fin: ahora })
              .eq('conductor_id', conductorNuevo.conductor_id)
              .in('estado', ['asignado', 'activo'])
              .neq('asignacion_id', selectedAsignacion.id)
          }

          // Buscar la asignación activa del vehículo (donde están los companeros)
          const { data: asignacionExistente } = await (supabase as any)
            .from('asignaciones')
            .select('id, fecha_inicio, notas')
            .eq('vehiculo_id', selectedAsignacion.vehiculo_id)
            .eq('estado', 'activa')
            .neq('id', selectedAsignacion.id)
            .single()

          if (asignacionExistente) {
            console.log('📋 Asignación existente encontrada:', asignacionExistente.id)

            // Obtener conductores actuales de la asignación existente
            const { data: conductoresExistentes } = await (supabase as any)
              .from('asignaciones_conductores')
              .select('id, conductor_id, horario, estado, conductores(nombres, apellidos)')
              .eq('asignacion_id', asignacionExistente.id)
              .in('estado', ['asignado', 'activo'])

            // Obtener patente del vehículo destino
            const patenteDestino = selectedAsignacion.vehiculos?.patente || 'Sin patente'

            // Obtener información de asignaciones actuales de los conductores nuevos
            const conductoresNuevosIds = conductoresNuevos.map((cn: any) => cn.conductor_id)
            const { data: asignacionesAnteriores } = await (supabase as any)
              .from('asignaciones_conductores')
              .select(`
                id, conductor_id, horario, estado,
                conductores(nombres, apellidos),
                asignaciones(id, vehiculos(patente))
              `)
              .in('conductor_id', conductoresNuevosIds)
              .in('estado', ['asignado', 'activo'])
              .neq('asignacion_id', selectedAsignacion.id)

            // Crear mapa de asignación anterior por conductor
            const asignacionAnteriorMap = new Map<string, { patente: string; turno: string }>()
            for (const asigAnt of (asignacionesAnteriores || [])) {
              asignacionAnteriorMap.set(asigAnt.conductor_id, {
                patente: asigAnt.asignaciones?.vehiculos?.patente || 'Sin patente',
                turno: asigAnt.horario
              })
            }

            // Verificar si hay conflictos de turno (otro conductor ya ocupa el turno)
            const conflictos: Array<{
              turno: string
              conductorActual: { id: string; nombre: string; asignacionConductorId: string }
              conductorNuevo: { id: string; nombre: string; horario: string; asignacionAnterior?: { patente: string; turno: string } }
            }> = []

            for (const conductorNuevo of conductoresNuevos) {
              const conductorEnMismoTurno = (conductoresExistentes || []).find(
                (ce: any) => ce.horario === conductorNuevo.horario && ce.conductor_id !== conductorNuevo.conductor_id
              )
              
              // Obtener nombre del conductor nuevo
              const { data: dataConductorNuevo } = await (supabase as any)
                .from('conductores')
                .select('nombres, apellidos')
                .eq('id', conductorNuevo.conductor_id)
                .single()
              
              const nombreConductorNuevo = dataConductorNuevo 
                ? `${dataConductorNuevo.nombres} ${dataConductorNuevo.apellidos}`.trim()
                : 'Conductor'

              if (conductorEnMismoTurno) {
                conflictos.push({
                  turno: conductorNuevo.horario,
                  conductorActual: {
                    id: conductorEnMismoTurno.conductor_id,
                    nombre: `${conductorEnMismoTurno.conductores?.nombres || ''} ${conductorEnMismoTurno.conductores?.apellidos || ''}`.trim(),
                    asignacionConductorId: conductorEnMismoTurno.id
                  },
                  conductorNuevo: {
                    id: conductorNuevo.conductor_id,
                    nombre: nombreConductorNuevo,
                    horario: conductorNuevo.horario,
                    asignacionAnterior: asignacionAnteriorMap.get(conductorNuevo.conductor_id)
                  }
                })
              }
            }

            // Si hay conflictos, preguntar al usuario con mensaje claro
            if (conflictos.length > 0) {
              // Construir mensaje HTML claro
              let mensajeHtml = '<div style="text-align:left;font-size:14px;">'
              
              for (const conflicto of conflictos) {
                const turnoLabel = conflicto.turno === 'diurno' ? 'DIURNO' : conflicto.turno === 'nocturno' ? 'NOCTURNO' : conflicto.turno.toUpperCase()
                
                mensajeHtml += `<div style="background:#FEF3C7;border-left:4px solid #F59E0B;padding:12px;margin-bottom:12px;border-radius:4px;">`
                
                // Info del conductor que entra
                if (conflicto.conductorNuevo.asignacionAnterior) {
                  mensajeHtml += `<p style="margin:0 0 8px 0;"><strong>${conflicto.conductorNuevo.nombre}</strong></p>`
                  mensajeHtml += `<p style="margin:0 0 4px 0;color:#666;">Actualmente en: <strong>${conflicto.conductorNuevo.asignacionAnterior.patente}</strong> - Turno ${conflicto.conductorNuevo.asignacionAnterior.turno.toUpperCase()}</p>`
                  mensajeHtml += `<p style="margin:0 0 8px 0;color:#059669;">➜ Pasará a: <strong>${patenteDestino}</strong> - Turno ${turnoLabel}</p>`
                } else {
                  mensajeHtml += `<p style="margin:0 0 8px 0;"><strong>${conflicto.conductorNuevo.nombre}</strong> entrará a <strong>${patenteDestino}</strong> - Turno ${turnoLabel}</p>`
                }
                
                // Info del conflicto
                mensajeHtml += `<p style="margin:0;color:#DC2626;"><strong>⚠️ Ese turno está ocupado por ${conflicto.conductorActual.nombre}</strong></p>`
                mensajeHtml += `<p style="margin:4px 0 0 0;color:#666;font-size:13px;">Si confirmas, ${conflicto.conductorActual.nombre} quedará sin asignación.</p>`
                
                mensajeHtml += `</div>`
              }
              
              mensajeHtml += '</div>'

              const confirmResult = await Swal.fire({
                title: '¿Confirmar cambio de asignación?',
                html: mensajeHtml,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Sí, confirmar cambio',
                cancelButtonText: 'Cancelar',
                confirmButtonColor: '#059669',
                cancelButtonColor: '#6B7280',
                width: '500px'
              })

              if (!confirmResult.isConfirmed) {
                // Usuario canceló la operación
                setIsSubmitting(false)
                return
              }

              // Usuario confirmó: finalizar a los conductores actuales que serán reemplazados
              for (const conflicto of conflictos) {
                console.log('🔄 Reemplazando conductor:', conflicto.conductorActual.nombre)
                await (supabase as any)
                  .from('asignaciones_conductores')
                  .update({ estado: 'completado', fecha_fin: ahora })
                  .eq('id', conflicto.conductorActual.asignacionConductorId)
              }
            }

            // Agregar los conductores NUEVOS a la asignación existente (sin cambiar fecha)
            for (const conductorNuevo of conductoresNuevos) {
              // Verificar si el conductor ya existe en esa asignación
              const { data: yaExiste } = await (supabase as any)
                .from('asignaciones_conductores')
                .select('id')
                .eq('asignacion_id', asignacionExistente.id)
                .eq('conductor_id', conductorNuevo.conductor_id)
                .single()

              if (!yaExiste) {
                console.log('➕ Agregando conductor', conductorNuevo.conductor_id, 'a asignación existente', asignacionExistente.id)
                await (supabase as any)
                  .from('asignaciones_conductores')
                  .insert({
                    asignacion_id: asignacionExistente.id,
                    conductor_id: conductorNuevo.conductor_id,
                    horario: conductorNuevo.horario,
                    estado: 'activo',
                    confirmado: true,
                    fecha_confirmacion: ahora,
                    fecha_inicio: ahora
                  })
              } else {
                console.log('⚠️ Conductor ya existe en asignación existente, actualizando estado')
                await (supabase as any)
                  .from('asignaciones_conductores')
                  .update({ estado: 'activo', confirmado: true, fecha_confirmacion: ahora })
                  .eq('id', yaExiste.id)
              }
            }
          }

          // Finalizar esta asignación nueva (no activarla)
          // Limpiar las notas de los tags de companero
          const notasLimpias = notas.replace(/\[COMPANERO:(diurno|nocturno):[a-f0-9-]+\]\n?/gi, '').trim()
          await (supabase as any)
            .from('asignaciones')
            .update({
              estado: 'finalizada',
              fecha_fin: ahora,
              notas: `${notasLimpias}\n[COMPANERO-FINALIZADA] Conductores agregados a asignación existente`,
              updated_by: profile?.full_name || 'Sistema'
            })
            .eq('id', selectedAsignacion.id)

          Swal.fire('Confirmado', 'Los conductores nuevos fueron agregados a la asignación existente. Esta asignación ha sido finalizada.', 'success')

        } else {
          // Lógica normal (sin companeros)
          // IMPORTANTE: Solo finalizar la participación del conductor en asignaciones anteriores,
          // NO toda la asignación (para no afectar al compañero de turno)
          
          if (conductoresIds.length > 0) {
            for (const conductorId of conductoresIds) {
              // 1. Finalizar participación del conductor en otras asignaciones activas
              await (supabase as any)
                .from('asignaciones_conductores')
                .update({ estado: 'completado', fecha_fin: ahora })
                .eq('conductor_id', conductorId)
                .in('estado', ['asignado', 'activo'])
                .neq('asignacion_id', selectedAsignacion.id)
            }
          }

          // 2. Verificar si alguna asignación quedó sin conductores activos y finalizarla
          const { data: asignacionesSinConductores } = await (supabase as any)
            .from('asignaciones')
            .select(`
              id,
              asignaciones_conductores(id, estado)
            `)
            .eq('estado', 'activa')
            .neq('id', selectedAsignacion.id)

          if (asignacionesSinConductores) {
            for (const asig of asignacionesSinConductores as any[]) {
              const conductoresActivos = asig.asignaciones_conductores?.filter(
                (ac: any) => ac.estado === 'asignado' || ac.estado === 'activo'
              ) || []
              
              if (conductoresActivos.length === 0) {
                // Esta asignación ya no tiene conductores activos, finalizarla
                await (supabase as any)
                  .from('asignaciones')
                  .update({ 
                    estado: 'finalizada', 
                    fecha_fin: ahora, 
                    notas: '[AUTO-CERRADA] Sin conductores activos',
                    updated_by: profile?.full_name || 'Sistema'
                  })
                  .eq('id', asig.id)
              }
            }
          }

          await (supabase as any)
            .from('asignaciones')
            .update({ estado: 'activa', fecha_inicio: ahora, notas: confirmComentarios || selectedAsignacion.notas, updated_by: profile?.full_name || 'Sistema' })
            .eq('id', selectedAsignacion.id)

          // Actualizar estado del vehículo a EN_USO
          const { data: estadoEnUso } = await supabase
            .from('vehiculos_estados')
            .select('id')
            .eq('codigo', 'EN_USO')
            .single()

          if (estadoEnUso && selectedAsignacion.vehiculo_id) {
            await (supabase
              .from('vehiculos') as any)
              .update({ estado_id: (estadoEnUso as any).id })
              .eq('id', selectedAsignacion.vehiculo_id)
          }

          if (fechaProgramada) {
            await supabase.from('vehiculos_turnos_ocupados').delete()
              .eq('vehiculo_id', selectedAsignacion.vehiculo_id)
              .eq('fecha', fechaProgramada)

            const turnosData = (allConductores as any)?.map((ac: any) => ({
              vehiculo_id: selectedAsignacion.vehiculo_id,
              fecha: fechaProgramada,
              horario: ac.horario,
              asignacion_conductor_id: ac.id,
              estado: 'activo'
            })) || []

            if (turnosData.length > 0) {
              await supabase.from('vehiculos_turnos_ocupados').insert(turnosData)
            }
          }

          Swal.fire('Confirmado', 'Todos los conductores han confirmado. La asignación está ACTIVA.', 'success')
        }
      } else {
        // Confirmación parcial: aún así poner vehículo en EN_USO
        const { data: estadoEnUso } = await supabase
          .from('vehiculos_estados')
          .select('id')
          .eq('codigo', 'EN_USO')
          .single()

        if (estadoEnUso && selectedAsignacion.vehiculo_id) {
          await (supabase
            .from('vehiculos') as any)
            .update({ estado_id: (estadoEnUso as any).id })
            .eq('id', selectedAsignacion.vehiculo_id)
        }

        const pendientes = (allConductores as any)?.filter((c: any) => !c.confirmado).length || 0
        Swal.fire('Confirmación Parcial', `${conductoresToConfirm.length} confirmado(s). Faltan ${pendientes}. Vehículo marcado EN USO.`, 'info')
      }

      setShowConfirmModal(false)
      setConfirmComentarios('')
      setConductoresToConfirm([])
      setSelectedAsignacion(null)
      loadAsignaciones()
    } catch (err: any) {
      Swal.fire('Error', err.message || 'Error al confirmar', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancelProgramacion = async () => {
    if (isSubmitting || !selectedAsignacion || !cancelMotivo.trim()) return

    setIsSubmitting(true)
    try {
      await (supabase as any)
        .from('asignaciones_conductores')
        .update({ confirmado: false, fecha_confirmacion: null })
        .eq('asignacion_id', selectedAsignacion.id)

      await (supabase as any)
        .from('asignaciones')
        .update({ estado: 'cancelada', notas: `${selectedAsignacion.notas || ''}\n\n[CANCELADA] Motivo: ${cancelMotivo}`, updated_by: profile?.full_name || 'Sistema' })
        .eq('id', selectedAsignacion.id)

      const { data: estadoDisponible } = await supabase
        .from('vehiculos_estados')
        .select('id')
        .eq('codigo', 'DISPONIBLE')
        .single() as { data: { id: string } | null }

      if (estadoDisponible) {
        await (supabase as any).from('vehiculos').update({ estado_id: estadoDisponible.id }).eq('id', selectedAsignacion.vehiculo_id)
      }

      Swal.fire('Cancelada', 'La programación ha sido cancelada', 'success')
      setShowCancelModal(false)
      setCancelMotivo('')
      setSelectedAsignacion(null)
      loadAsignaciones()
    } catch (err: any) {
      Swal.fire('Error', err.message || 'Error al cancelar', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUnconfirmConductor = async (conductorAsignacionId: string) => {
    try {
      await (supabase as any)
        .from('asignaciones_conductores')
        .update({ confirmado: false, fecha_confirmacion: null })
        .eq('id', conductorAsignacionId)

      Swal.fire('Actualizado', 'El conductor ha sido desconfirmado.', 'success')
      loadAsignaciones()
    } catch (err: any) {
      Swal.fire('Error', err.message || 'Error al desconfirmar', 'error')
    }
  }

  // Abrir modal de regularización
  const handleOpenRegularizar = async (asignacion: Asignacion) => {
    setRegularizarAsignacion(asignacion)
    setLoadingRegularizar(true)
    setShowRegularizarModal(true)
    
    // Cargar vehículos, conductores disponibles Y conductores de esta asignación
    const [vehiculosRes, conductoresRes, asignacionConductoresRes] = await Promise.all([
      supabase.from('vehiculos').select('id, patente, marca, modelo').order('patente'),
      supabase.from('conductores').select('id, nombres, apellidos').order('apellidos'),
      supabase.from('asignaciones_conductores').select('conductor_id, horario').eq('asignacion_id', asignacion.id)
    ])
    
    setVehiculosDisponibles(vehiculosRes.data || [])
    setConductoresDisponibles(conductoresRes.data || [])
    
    // Obtener conductores actuales de la asignación
    const conductoresAsig = (asignacionConductoresRes.data || []) as any[]
    const diurno = conductoresAsig.find(c => c.horario === 'diurno' || c.horario === 'DIURNO' || c.horario === 'D')
    const nocturno = conductoresAsig.find(c => c.horario === 'nocturno' || c.horario === 'NOCTURNO' || c.horario === 'N')
    const cargo = conductoresAsig.find(c => c.horario === 'CARGO' || c.horario === 'cargo' || c.horario === 'A CARGO')
    
    setRegularizarData({
      fecha_inicio: asignacion.fecha_inicio ? asignacion.fecha_inicio.split('T')[0] : '',
      fecha_fin: asignacion.fecha_fin ? asignacion.fecha_fin.split('T')[0] : '',
      notas: asignacion.notas || '',
      vehiculo_id: asignacion.vehiculo_id || '',
      horario: asignacion.horario || 'TURNO',
      conductor_diurno_id: diurno?.conductor_id || '',
      conductor_nocturno_id: nocturno?.conductor_id || '',
      conductor_cargo_id: cargo?.conductor_id || ''
    })
    
    // Reset search states
    setSearchDiurno('')
    setSearchNocturno('')
    setSearchCargo('')
    setShowDropdownDiurno(false)
    setShowDropdownNocturno(false)
    setShowDropdownCargo(false)
    
    setLoadingRegularizar(false)
  }

  // Guardar regularización
  const handleSaveRegularizacion = async () => {
    if (!regularizarAsignacion || isSubmitting) return

    setIsSubmitting(true)
    try {
      const updateData: Record<string, unknown> = {
        updated_by: profile?.full_name || 'Sistema'
      }

      // Actualizar campos de la asignación
      if (regularizarData.fecha_inicio) {
        updateData.fecha_inicio = new Date(regularizarData.fecha_inicio + 'T12:00:00').toISOString()
      }
      if (regularizarData.fecha_fin) {
        updateData.fecha_fin = new Date(regularizarData.fecha_fin + 'T12:00:00').toISOString()
      }
      if (regularizarData.notas !== regularizarAsignacion.notas) {
        updateData.notas = regularizarData.notas
      }
      if (regularizarData.vehiculo_id && regularizarData.vehiculo_id !== regularizarAsignacion.vehiculo_id) {
        updateData.vehiculo_id = regularizarData.vehiculo_id
      }
      if (regularizarData.horario && regularizarData.horario !== regularizarAsignacion.horario) {
        updateData.horario = regularizarData.horario
      }

      const { error } = await (supabase as any)
        .from('asignaciones')
        .update(updateData)
        .eq('id', regularizarAsignacion.id)

      if (error) throw error

      // Actualizar conductores si es TURNO
      if (regularizarData.horario === 'TURNO') {
        // Eliminar conductores existentes
        await supabase.from('asignaciones_conductores').delete().eq('asignacion_id', regularizarAsignacion.id)
        
        // Insertar nuevos conductores
        const nuevoConductores = []
        if (regularizarData.conductor_diurno_id) {
          nuevoConductores.push({
            asignacion_id: regularizarAsignacion.id,
            conductor_id: regularizarData.conductor_diurno_id,
            horario: 'diurno',
            estado: 'asignado'
          })
        }
        if (regularizarData.conductor_nocturno_id) {
          nuevoConductores.push({
            asignacion_id: regularizarAsignacion.id,
            conductor_id: regularizarData.conductor_nocturno_id,
            horario: 'nocturno',
            estado: 'asignado'
          })
        }
        if (nuevoConductores.length > 0) {
          await (supabase.from('asignaciones_conductores') as any).insert(nuevoConductores)
        }
      } else if (regularizarData.horario === 'CARGO') {
        // Eliminar conductores existentes
        await supabase.from('asignaciones_conductores').delete().eq('asignacion_id', regularizarAsignacion.id)
        
        // Insertar conductor a cargo
        if (regularizarData.conductor_cargo_id) {
          await (supabase.from('asignaciones_conductores') as any).insert({
            asignacion_id: regularizarAsignacion.id,
            conductor_id: regularizarData.conductor_cargo_id,
            horario: 'CARGO',
            estado: 'asignado'
          })
        }
      }

      Swal.fire({
        icon: 'success',
        title: 'Regularizado',
        text: 'Los datos de la asignación han sido actualizados correctamente.',
        timer: 2000,
        showConfirmButton: false
      })

      setShowRegularizarModal(false)
      setRegularizarAsignacion(null)
      loadAsignaciones()
    } catch (err: any) {
      Swal.fire('Error', err.message || 'Error al regularizar la asignación', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const getStatusBadgeClass = (status: string) => {
    const classes: Record<string, string> = {
      programado: 'dt-badge dt-badge-yellow',
      activa: 'dt-badge dt-badge-green',
      finalizada: 'dt-badge dt-badge-blue',
      cancelada: 'dt-badge dt-badge-red'
    }
    return classes[status] || 'dt-badge dt-badge-gray'
  }

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      programado: 'Programado',
      activa: 'Activa',
      finalizada: 'Finalizada',
      cancelada: 'Cancelada'
    }
    return labels[status] || status
  }

  const getHorarioBadgeClass = (horario: string) => {
    return horario === 'CARGO' ? 'dt-badge asig-badge-cargo' : 'dt-badge asig-badge-turno'
  }

  // Columnas para DataTable - headers simples para usar filtros automáticos
  const columns = useMemo<ColumnDef<ExpandedAsignacion, any>[]>(() => [
    {
      accessorKey: 'codigo',
      header: 'Número',
      cell: ({ row }) => <strong>{row.original.codigo || 'N/A'}</strong>
    },
    {
      accessorFn: (row) => row.vehiculos?.patente || '',
      id: 'vehiculo',
      header: 'Vehículo',
      cell: ({ row }) => (
        <div className="asig-vehiculo-cell">
          <span className="asig-vehiculo-patente">{row.original.vehiculos?.patente || 'N/A'}</span>
          <span className="asig-vehiculo-info">
            {row.original.vehiculos?.marca} {row.original.vehiculos?.modelo}
          </span>
        </div>
      )
    },
    {
      accessorKey: 'horario',
      header: 'Modalidad',
      cell: ({ row }) => (
        <span className={getHorarioBadgeClass(row.original.horario)}>
          {row.original.horario === 'CARGO' ? 'A CARGO' : 'TURNO'}
        </span>
      )
    },
    {
      id: 'asignados',
      header: 'Asignados',
      accessorFn: (row) => {
        if (row.horario === 'CARGO' || !row.horario) {
          return row.conductorCargo?.nombre || ''
        }
        const d = row.conductoresTurno?.diurno?.nombre || ''
        const n = row.conductoresTurno?.nocturno?.nombre || ''
        return `${d} ${n}`.trim()
      },
      cell: ({ row }) => {
        const { conductoresTurno, conductorCargo, horario } = row.original

        // Si es A CARGO, mostrar solo el conductor
        if (horario === 'CARGO' || !horario) {
          if (conductorCargo) {
            return <span className="asig-conductor-compacto">{conductorCargo.nombre}</span>
          }
          return <span className="asig-sin-conductor">Sin asignar</span>
        }

        // Si es TURNO, mostrar ambos conductores compacto
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
      }
    },
    {
      id: 'cita_programada',
      header: 'Cita Programada',
      accessorFn: (row) => {
        if (!row.fecha_programada) return '-'
        const fecha = new Date(row.fecha_programada)
        return fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })
      },
      sortingFn: (rowA, rowB) => {
        const fechaA = rowA.original.fecha_programada ? new Date(rowA.original.fecha_programada).getTime() : 0
        const fechaB = rowB.original.fecha_programada ? new Date(rowB.original.fecha_programada).getTime() : 0
        return fechaA - fechaB
      },
      cell: ({ row }) => {
        const fechaProg = row.original.fecha_programada
        if (!fechaProg) return <span className="text-muted">-</span>
        
        const fecha = new Date(fechaProg)
        const fechaStr = fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })
        const horaStr = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' })
        
        return (
          <div style={{ display: 'flex', flexDirection: 'column', fontSize: '12px', lineHeight: '1.3' }}>
            <span style={{ fontWeight: 500 }}>{fechaStr}</span>
            <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>{horaStr}</span>
          </div>
        )
      }
    },
    {
      id: 'entrega_real',
      header: 'Entrega Real',
      accessorFn: (row) => {
        if (!row.fecha_inicio) return '-'
        const fecha = new Date(row.fecha_inicio)
        return fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })
      },
      cell: ({ row }) => {
        const fechaInicio = row.original.fecha_inicio
        if (!fechaInicio) return <span className="text-muted">-</span>
        
        const fecha = new Date(fechaInicio)
        const fechaStr = fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })
        const horaStr = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' })
        
        return (
          <div style={{ display: 'flex', flexDirection: 'column', fontSize: '12px', lineHeight: '1.3' }}>
            <span style={{ fontWeight: 500, color: 'var(--color-success)' }}>{fechaStr}</span>
            <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>{horaStr}</span>
          </div>
        )
      }
    },
    {
      id: 'tipo_documento',
      header: 'Documento',
      accessorFn: (row) => {
        const conductores = row.asignaciones_conductores || []
        const documentos = [...new Set(conductores.map((c: any) => c.documento).filter(Boolean))]
        if (documentos.length === 0) return '-'
        // Retornar solo el primer documento para el filtro (prioridad: CARTA_OFERTA > ANEXO > otros)
        const primerDoc = documentos.includes('CARTA_OFERTA') ? 'CARTA_OFERTA'
          : documentos.includes('ANEXO') ? 'ANEXO'
          : documentos[0]
        return primerDoc === 'CARTA_OFERTA' ? 'Carta Oferta' : primerDoc === 'ANEXO' ? 'Anexo' : 'N/A'
      },
      cell: ({ row }) => {
        const conductores = row.original.asignaciones_conductores || []
        // Obtener documentos únicos de los conductores
        const documentos = [...new Set(conductores.map(c => c.documento).filter(Boolean))]

        if (documentos.length === 0) return <span className="text-muted">-</span>

        // Si hay múltiples documentos diferentes, mostrar ambos
        return (
          <div className="asig-documento-badges">
            {documentos.map((doc, idx) => (
              <span
                key={idx}
                className={`asig-documento-badge ${doc === 'CARTA_OFERTA' ? 'asig-doc-carta' : doc === 'ANEXO' ? 'asig-doc-anexo' : 'asig-doc-na'}`}
              >
                {doc === 'CARTA_OFERTA' ? 'Carta Oferta' : doc === 'ANEXO' ? 'Anexo' : 'N/A'}
              </span>
            ))}
          </div>
        )
      }
    },
    {
      accessorKey: 'fecha_fin',
      header: 'Fecha Fin',
      cell: ({ row }) => (
        <span>
          {row.original.fecha_fin
            ? new Date(row.original.fecha_fin).toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' })
            : 'Sin definir'}
        </span>
      )
    },
    {
      accessorKey: 'estado',
      header: 'Estado',
      cell: ({ row }) => (
        <span className={getStatusBadgeClass(row.original.estado)}>
          {getStatusLabel(row.original.estado)}
        </span>
      )
    },
    {
      id: 'acciones',
      header: 'Acciones',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="dt-actions">
          {row.original.estado === 'programado' && (
            <>
              <button
                onClick={() => {
                  setSelectedAsignacion(row.original)
                  setShowConfirmModal(true)
                }}
                className="dt-btn-action asig-btn-confirm"
                title="Confirmar programación"
                disabled={!canEdit}
              >
                <CheckCircle size={16} />
              </button>
              <button
                onClick={() => {
                  setSelectedAsignacion(row.original)
                  setShowCancelModal(true)
                }}
                className="dt-btn-action asig-btn-cancel-prog"
                title="Cancelar programación"
                disabled={!canEdit}
              >
                <XCircle size={16} />
              </button>
            </>
          )}
          <button
            className="dt-btn-action dt-btn-view"
            title="Ver detalles"
            onClick={() => {
              setViewAsignacion(row.original)
              setShowViewModal(true)
            }}
          >
            <Eye size={16} />
          </button>
          {/* Botón regularizar - solo para admin, fullstack.senior y tech.spec */}
          {canCreateManualAssignment && (
            <button
              onClick={() => handleOpenRegularizar(row.original)}
              className="dt-btn-action dt-btn-edit"
              title="Regularizar datos"
            >
              <Pencil size={16} />
            </button>
          )}
          <button
            onClick={() => handleDelete(row.original.id)}
            className="dt-btn-action dt-btn-delete"
            title="Eliminar"
            disabled={!canDelete}
          >
            <Trash2 size={16} />
          </button>
        </div>
      )
    }
  ], [canEdit, canDelete, canCreateManualAssignment])

  return (
    <div className="asig-module">
      {/* Stats Cards - Estilo Bitácora */}
      <div className="asig-stats">
        <div className="asig-stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'programadas' ? 'stat-card-active' : ''}`}
            title="Asignaciones en estado programado pendientes de confirmación"
            onClick={() => handleStatCardClick('programadas')}
          >
            <Calendar size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{programadasCount}</span>
              <span className="stat-label">Programadas</span>
            </div>
          </div>
          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'completadas' ? 'stat-card-active' : ''}`}
            title="Entregas completadas esta semana (lunes a domingo)"
            onClick={() => handleStatCardClick('completadas')}
          >
            <CheckCircle size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{calculatedStats.entregasCompletadasSemana}</span>
              <span className="stat-label">Completadas</span>
            </div>
          </div>
          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'canceladas' ? 'stat-card-active' : ''}`}
            title="Entregas canceladas esta semana (lunes a domingo)"
            onClick={() => handleStatCardClick('canceladas')}
          >
            <Ban size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{calculatedStats.entregasCanceladasSemana}</span>
              <span className="stat-label">Canceladas</span>
            </div>
          </div>
        </div>
        {/* Segunda fila de stats - Métricas por tipo de documento */}
        <div className="asig-stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginTop: '12px' }}>
          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'cartaOferta' ? 'stat-card-active' : ''}`}
            title="Conductores nuevos que firmaron Carta Oferta (conteo por conductor único)"
            onClick={() => handleStatCardClick('cartaOferta')}
          >
            <UserPlus size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{calculatedStats.conductoresCartaOferta}</span>
              <span className="stat-label">Cond. Nuevos</span>
            </div>
          </div>
          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'anexo' ? 'stat-card-active' : ''}`}
            title="Conductores antiguos con Anexo por cambio de vehículo (conteo por conductor único)"
            onClick={() => handleStatCardClick('anexo')}
          >
            <UserCheck size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{calculatedStats.conductoresAnexo}</span>
              <span className="stat-label">Cond. Anexo</span>
            </div>
          </div>
          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'entregasHoy' ? 'stat-card-active' : ''}`}
            title="Entregas de vehículos programadas para hoy"
            onClick={() => handleStatCardClick('entregasHoy')}
          >
            <Calendar size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{calculatedStats.entregasHoy}</span>
              <span className="stat-label">Entregas Hoy</span>
            </div>
          </div>
        </div>
      </div>

      {/* DataTable */}
      <DataTable
        data={expandedAsignaciones}
        columns={columns}
        loading={loading}
        error={error}
        searchPlaceholder="Buscar por vehículo, conductor o número..."
        emptyIcon={<FileText size={48} />}
        emptyTitle="No hay asignaciones"
        emptyDescription="Las asignaciones se crean desde la pestaña Programacion"
        pageSize={100}
        pageSizeOptions={[10, 20, 50, 100]}
        externalFilters={externalFilters}
        headerAction={canCreateManualAssignment ? (
          <button
            className="btn-primary"
            onClick={() => setShowWizard(true)}
            title="Crear asignación manual (solo para regularización)"
          >
            <Plus size={16} />
            Nueva Asignación
          </button>
        ) : undefined}
      />

      {/* Wizard Modal */}
      {showWizard && (
        <AssignmentWizard
          onClose={() => setShowWizard(false)}
          onSuccess={() => {
            loadAsignaciones()
            setShowWizard(false)
          }}
        />
      )}

      {/* Modal de Confirmación */}
      {showConfirmModal && selectedAsignacion && (
        <div className="asig-modal-overlay">
          <div className="asig-modal-content">
            <h2 className="asig-modal-title">Confirmar Programación</h2>
            <p>Vehículo: <strong>{selectedAsignacion.vehiculos?.patente}</strong></p>
            <p style={{ fontSize: '14px', color: '#6B7280', marginBottom: '16px' }}>
              Fecha de entrega: <strong>{selectedAsignacion.fecha_programada ? new Date(selectedAsignacion.fecha_programada).toLocaleDateString('es-AR') : 'N/A'}</strong>
            </p>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '12px', fontWeight: 600, fontSize: '14px' }}>
                Selecciona los conductores que confirman:
              </label>
              {selectedAsignacion.asignaciones_conductores?.length ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {selectedAsignacion.asignaciones_conductores.map((ac) => (
                    <label key={ac.id} className={`asig-confirm-conductor ${ac.confirmado ? 'confirmed' : 'pending'}`}>
                      <input
                        type="checkbox"
                        checked={ac.confirmado || conductoresToConfirm.includes(ac.id)}
                        disabled={ac.confirmado}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setConductoresToConfirm([...conductoresToConfirm, ac.id])
                          } else {
                            setConductoresToConfirm(conductoresToConfirm.filter(id => id !== ac.id))
                          }
                        }}
                      />
                      <div style={{ flex: 1 }}>
                        <p className="asig-conductor-name">
                          {ac.conductores.nombres} {ac.conductores.apellidos}
                        </p>
                        <p className="asig-conductor-details">
                          {ac.horario !== 'todo_dia' && `Turno: ${ac.horario}`}
                          {ac.confirmado && (
                            <span className="asig-conductor-confirmed">
                              <CheckCircle size={14} /> Ya confirmado
                              {ac.fecha_confirmacion && (
                                <span style={{ marginLeft: '8px', fontWeight: 400, opacity: 0.85 }}>
                                  ({new Date(ac.fecha_confirmacion).toLocaleString('es-AR', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    timeZone: 'America/Buenos_Aires'
                                  })})
                                </span>
                              )}
                            </span>
                          )}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              ) : (
                <p style={{ color: '#9CA3AF', fontSize: '14px' }}>No hay conductores asignados</p>
              )}
            </div>

            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '14px' }}>
              Comentarios (opcional):
            </label>
            <textarea
              value={confirmComentarios}
              onChange={(e) => setConfirmComentarios(e.target.value)}
              rows={4}
              placeholder="Agrega comentarios sobre la confirmación..."
              className="asig-modal-textarea"
              style={{ marginBottom: '20px' }}
            />

            <div className="asig-modal-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowConfirmModal(false)
                  setConfirmComentarios('')
                  setConductoresToConfirm([])
                  setSelectedAsignacion(null)
                }}
              >
                Cancelar
              </button>
              {/* Si todos los conductores ya confirmaron, mostrar botón para activar directamente */}
              {(selectedAsignacion.asignaciones_conductores?.length ?? 0) > 0 &&
               selectedAsignacion.asignaciones_conductores?.every(ac => ac.confirmado) ? (
                <button
                  className="btn-primary"
                  onClick={async () => {
                    if (isSubmitting) return
                    setIsSubmitting(true)
                    try {
                      const ahora = new Date().toISOString()

                      // Cerrar asignaciones activas anteriores del mismo vehículo
                      const { data: asignacionesACerrar } = await supabase
                        .from('asignaciones')
                        .select('id')
                        .eq('vehiculo_id', selectedAsignacion.vehiculo_id)
                        .eq('estado', 'activa')
                        .neq('id', selectedAsignacion.id)

                      if (asignacionesACerrar && asignacionesACerrar.length > 0) {
                        await (supabase as any).from('asignaciones')
                          .update({ estado: 'finalizada', fecha_fin: ahora, notas: '[AUTO-CERRADA]' })
                          .in('id', asignacionesACerrar.map((a: any) => a.id))
                      }

                      // Cerrar asignaciones anteriores de los CONDUCTORES (cuando cambian de vehículo)
                      const conductoresIds = selectedAsignacion.asignaciones_conductores?.map((c: any) => c.conductor_id).filter(Boolean) || []
                      if (conductoresIds.length > 0) {
                        for (const conductorId of conductoresIds) {
                          // Cerrar asignaciones_conductores anteriores
                          await (supabase as any)
                            .from('asignaciones_conductores')
                            .update({ estado: 'finalizado', fecha_fin: ahora })
                            .eq('conductor_id', conductorId)
                            .eq('estado', 'asignado')
                            .neq('asignacion_id', selectedAsignacion.id)
                        }
                      }

                      // Activar la asignación
                      await (supabase as any)
                        .from('asignaciones')
                        .update({
                          estado: 'activa',
                          fecha_inicio: ahora,
                          notas: confirmComentarios || selectedAsignacion.notas,
                          updated_by: profile?.full_name || 'Sistema'
                        })
                        .eq('id', selectedAsignacion.id)

                      // Actualizar estado del vehículo a EN_USO
                      const { data: estadoEnUso } = await supabase
                        .from('vehiculos_estados')
                        .select('id')
                        .eq('codigo', 'EN_USO')
                        .single() as unknown as { data: { id: string } | null }

                      if (estadoEnUso && selectedAsignacion.vehiculo_id) {
                        await (supabase as any)
                          .from('vehiculos')
                          .update({ estado_id: estadoEnUso.id })
                          .eq('id', selectedAsignacion.vehiculo_id)
                      }

                      Swal.fire('Activado', 'La asignación está ahora ACTIVA.', 'success')
                      setShowConfirmModal(false)
                      setConfirmComentarios('')
                      setSelectedAsignacion(null)
                      loadAsignaciones()
                    } catch (err: any) {
                      Swal.fire('Error', err.message || 'Error al activar', 'error')
                    } finally {
                      setIsSubmitting(false)
                    }
                  }}
                  disabled={isSubmitting}
                  style={{ background: !isSubmitting ? '#10B981' : '#D1D5DB' }}
                >
                  {isSubmitting ? 'Procesando...' : 'Activar Asignación'}
                </button>
              ) : (
                <button
                  className="btn-primary"
                  onClick={handleConfirmProgramacion}
                  disabled={conductoresToConfirm.length === 0 || isSubmitting}
                  style={{ background: conductoresToConfirm.length > 0 && !isSubmitting ? '#10B981' : '#D1D5DB' }}
                >
                  {isSubmitting ? 'Procesando...' : 'Confirmar Seleccionados'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Cancelación */}
      {showCancelModal && selectedAsignacion && (
        <div className="asig-modal-overlay">
          <div className="asig-modal-content">
            <h2 className="asig-modal-title">Cancelar Programación</h2>
            <p>¿Estás seguro de cancelar la programación del vehículo <strong>{selectedAsignacion.vehiculos?.patente}</strong>?</p>

            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '14px', color: '#DC2626' }}>
              Motivo de cancelación (requerido):
            </label>
            <textarea
              value={cancelMotivo}
              onChange={(e) => setCancelMotivo(e.target.value)}
              rows={4}
              placeholder="Ingresa el motivo de la cancelación..."
              className="asig-modal-textarea cancel"
              style={{ marginBottom: '20px' }}
            />

            <div className="asig-modal-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowCancelModal(false)
                  setCancelMotivo('')
                  setSelectedAsignacion(null)
                }}
              >
                Volver
              </button>
              <button
                className="btn-primary"
                onClick={handleCancelProgramacion}
                disabled={!cancelMotivo.trim() || isSubmitting}
                style={{ background: cancelMotivo.trim() && !isSubmitting ? '#DC2626' : '#D1D5DB' }}
              >
                {isSubmitting ? 'Procesando...' : 'Cancelar Programación'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Visualización */}
      {showViewModal && viewAsignacion && (
        <div className="asig-modal-overlay">
          <div className="asig-modal-content wide">
            <h2 className="asig-modal-title">Detalles de Asignación</h2>

            <div className="asig-detail-grid">
              <div>
                <label className="asig-detail-label">Número de Asignación</label>
                <p className="asig-detail-value code">{viewAsignacion.codigo}</p>
              </div>

              <div>
                <label className="asig-detail-label">Vehículo</label>
                <p className="asig-detail-value">
                  <strong>{viewAsignacion.vehiculos?.patente}</strong> - {viewAsignacion.vehiculos?.marca} {viewAsignacion.vehiculos?.modelo}
                </p>
              </div>

              <div>
                <label className="asig-detail-label">Conductores Asignados</label>
                {viewAsignacion.asignaciones_conductores?.length ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {viewAsignacion.asignaciones_conductores.map((ac) => (
                      <div key={ac.id} className="asig-conductor-card">
                        <p className="asig-conductor-card-name">
                          {ac.conductores.nombres} {ac.conductores.apellidos}
                        </p>
                        <p className="asig-conductor-card-info">Licencia: {ac.conductores.numero_licencia || '-'}</p>
                        {ac.horario !== 'todo_dia' && (
                          <p className="asig-conductor-card-info">Turno: <strong>{ac.horario}</strong></p>
                        )}
                        {ac.documento && (
                          <p className="asig-conductor-card-info">
                            Documento: <strong style={{ color: ac.documento === 'CARTA_OFERTA' ? '#059669' : ac.documento === 'ANEXO' ? '#2563EB' : '#6B7280' }}>
                              {ac.documento === 'CARTA_OFERTA' ? 'Carta Oferta' : ac.documento === 'ANEXO' ? 'Anexo' : ac.documento}
                            </strong>
                          </p>
                        )}
                        <p className="asig-conductor-status">
                          {ac.confirmado ? (
                            <>
                              <span className="asig-conductor-confirmed">
                                <CheckCircle size={14} /> Confirmado
                                {ac.fecha_confirmacion && (
                                  <span style={{ marginLeft: '6px', fontWeight: 400, fontSize: '12px', opacity: 0.85 }}>
                                    ({new Date(ac.fecha_confirmacion).toLocaleString('es-AR', {
                                      day: '2-digit',
                                      month: '2-digit',
                                      year: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                      timeZone: 'America/Buenos_Aires'
                                    })})
                                  </span>
                                )}
                              </span>
                              {canEdit && viewAsignacion.estado === 'programado' && (
                                <button
                                  className="asig-btn-unconfirm"
                                  onClick={() => {
                                    Swal.fire({
                                      title: '¿Desconfirmar conductor?',
                                      icon: 'warning',
                                      showCancelButton: true,
                                      confirmButtonColor: '#E63946',
                                      confirmButtonText: 'Sí, desconfirmar'
                                    }).then((result) => {
                                      if (result.isConfirmed) {
                                        handleUnconfirmConductor(ac.id)
                                        setShowViewModal(false)
                                        setViewAsignacion(null)
                                      }
                                    })
                                  }}
                                >
                                  Desconfirmar
                                </button>
                              )}
                            </>
                          ) : (
                            <span style={{ color: '#F59E0B', fontWeight: 600 }}>Pendiente</span>
                          )}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: '#9CA3AF', fontSize: '14px' }}>Sin conductores asignados</p>
                )}
              </div>

              <div className="asig-detail-row">
                <div>
                  <label className="asig-detail-label">Horario</label>
                  <span className={getHorarioBadgeClass(viewAsignacion.horario)}>
                    {viewAsignacion.horario === 'CARGO' ? 'A CARGO' : 'TURNO'}
                  </span>
                </div>
                <div>
                  <label className="asig-detail-label">Estado</label>
                  <span className={getStatusBadgeClass(viewAsignacion.estado)}>
                    {viewAsignacion.estado}
                  </span>
                </div>
              </div>

              <div className="asig-detail-row four">
                <div>
                  <label className="asig-detail-label">Fecha Creación</label>
                  <p className="asig-detail-value" style={{ fontSize: '14px' }}>
                    {new Date(viewAsignacion.created_at).toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </p>
                </div>
                <div>
                  <label className="asig-detail-label">Fecha Entrega</label>
                  <p className="asig-detail-value" style={{ fontSize: '14px' }}>
                    {viewAsignacion.fecha_programada ? new Date(viewAsignacion.fecha_programada).toLocaleDateString('es-ES') : 'No definida'}
                  </p>
                </div>
                <div>
                  <label className="asig-detail-label">Fecha Activación</label>
                  <p className="asig-detail-value" style={{ fontSize: '14px' }}>
                    {viewAsignacion.fecha_inicio ? new Date(viewAsignacion.fecha_inicio).toLocaleDateString('es-ES') : 'No activada'}
                  </p>
                </div>
                <div>
                  <label className="asig-detail-label">Fecha Fin</label>
                  <p className="asig-detail-value" style={{ fontSize: '14px' }}>
                    {viewAsignacion.fecha_fin ? new Date(viewAsignacion.fecha_fin).toLocaleDateString('es-ES') : 'Sin definir'}
                  </p>
                </div>
              </div>

              {viewAsignacion.notas && (
                <div>
                  <label className="asig-detail-label">Notas</label>
                  <p className="asig-notes-box">{viewAsignacion.notas}</p>
                </div>
              )}
            </div>

            <div className="asig-modal-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowViewModal(false)
                  setViewAsignacion(null)
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Regularización */}
      {showRegularizarModal && regularizarAsignacion && (
        <div className="asig-modal-overlay">
          <div className="asig-modal-content">
            <h2 className="asig-modal-title">Editar Asignación</h2>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px', textAlign: 'center' }}>
              Código: <strong>{regularizarAsignacion.codigo}</strong>
            </p>

            {loadingRegularizar ? (
              <div style={{ textAlign: 'center', padding: '40px' }}>Cargando...</div>
            ) : (
              <div className="asig-edit-form">
                {/* Vehículo - full width */}
                <div className="asig-edit-row single">
                  <div className="asig-edit-field">
                    <label>Vehículo</label>
                    <select
                      value={regularizarData.vehiculo_id}
                      onChange={(e) => setRegularizarData(prev => ({ ...prev, vehiculo_id: e.target.value }))}
                    >
                      <option value="">Seleccionar vehículo</option>
                      {vehiculosDisponibles.map((v: any) => (
                        <option key={v.id} value={v.id}>{v.patente} - {v.marca} {v.modelo}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Modalidad - full width */}
                <div className="asig-edit-row single">
                  <div className="asig-edit-field">
                    <label>Modalidad</label>
                    <select
                      value={regularizarData.horario}
                      onChange={(e) => setRegularizarData(prev => ({ ...prev, horario: e.target.value }))}
                    >
                      <option value="TURNO">TURNO (Diurno/Nocturno)</option>
                      <option value="CARGO">A CARGO (Un solo conductor)</option>
                    </select>
                  </div>
                </div>

                {/* Conductores según modalidad */}
                {regularizarData.horario === 'TURNO' ? (
                  <div className="asig-edit-row">
                    <div className="asig-edit-field">
                      <label>Conductor Diurno</label>
                      <div className="asig-conductor-input-wrapper">
                        <input
                          type="text"
                          value={showDropdownDiurno ? searchDiurno : (regularizarData.conductor_diurno_id ? (conductoresDisponibles.find(c => c.id === regularizarData.conductor_diurno_id)?.apellidos + ', ' + conductoresDisponibles.find(c => c.id === regularizarData.conductor_diurno_id)?.nombres) : '')}
                          onChange={(e) => { setSearchDiurno(e.target.value); setShowDropdownDiurno(true) }}
                          onFocus={() => { setShowDropdownDiurno(true); setSearchDiurno('') }}
                          onBlur={() => setTimeout(() => setShowDropdownDiurno(false), 200)}
                          placeholder="Buscar conductor..."
                        />
                        {showDropdownDiurno && (
                          <div className="asig-autocomplete-dropdown">
                            <div className="asig-autocomplete-option" onMouseDown={() => { setRegularizarData(prev => ({ ...prev, conductor_diurno_id: '' })); setSearchDiurno(''); setShowDropdownDiurno(false) }}>
                              Sin asignar (Vacante)
                            </div>
                            {conductoresDisponibles
                              .filter(c => !searchDiurno || `${c.apellidos} ${c.nombres}`.toLowerCase().includes(searchDiurno.toLowerCase()))
                              .slice(0, 20)
                              .map((c: any) => (
                                <div 
                                  key={c.id} 
                                  className={`asig-autocomplete-option ${regularizarData.conductor_diurno_id === c.id ? 'selected' : ''}`}
                                  onMouseDown={() => { setRegularizarData(prev => ({ ...prev, conductor_diurno_id: c.id })); setSearchDiurno(''); setShowDropdownDiurno(false) }}
                                >{c.apellidos}, {c.nombres}</div>
                              ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="asig-edit-field">
                      <label>Conductor Nocturno</label>
                      <div className="asig-conductor-input-wrapper">
                        <input
                          type="text"
                          value={showDropdownNocturno ? searchNocturno : (regularizarData.conductor_nocturno_id ? (conductoresDisponibles.find(c => c.id === regularizarData.conductor_nocturno_id)?.apellidos + ', ' + conductoresDisponibles.find(c => c.id === regularizarData.conductor_nocturno_id)?.nombres) : '')}
                          onChange={(e) => { setSearchNocturno(e.target.value); setShowDropdownNocturno(true) }}
                          onFocus={() => { setShowDropdownNocturno(true); setSearchNocturno('') }}
                          onBlur={() => setTimeout(() => setShowDropdownNocturno(false), 200)}
                          placeholder="Buscar conductor..."
                        />
                        {showDropdownNocturno && (
                          <div className="asig-autocomplete-dropdown">
                            <div className="asig-autocomplete-option" onMouseDown={() => { setRegularizarData(prev => ({ ...prev, conductor_nocturno_id: '' })); setSearchNocturno(''); setShowDropdownNocturno(false) }}>
                              Sin asignar (Vacante)
                            </div>
                            {conductoresDisponibles
                              .filter(c => !searchNocturno || `${c.apellidos} ${c.nombres}`.toLowerCase().includes(searchNocturno.toLowerCase()))
                              .slice(0, 20)
                              .map((c: any) => (
                                <div 
                                  key={c.id} 
                                  className={`asig-autocomplete-option ${regularizarData.conductor_nocturno_id === c.id ? 'selected' : ''}`}
                                  onMouseDown={() => { setRegularizarData(prev => ({ ...prev, conductor_nocturno_id: c.id })); setSearchNocturno(''); setShowDropdownNocturno(false) }}
                                >{c.apellidos}, {c.nombres}</div>
                              ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="asig-edit-row single">
                    <div className="asig-edit-field">
                      <label>Conductor A Cargo</label>
                      <div className="asig-conductor-input-wrapper">
                        <input
                          type="text"
                          value={showDropdownCargo ? searchCargo : (regularizarData.conductor_cargo_id ? (conductoresDisponibles.find(c => c.id === regularizarData.conductor_cargo_id)?.apellidos + ', ' + conductoresDisponibles.find(c => c.id === regularizarData.conductor_cargo_id)?.nombres) : '')}
                          onChange={(e) => { setSearchCargo(e.target.value); setShowDropdownCargo(true) }}
                          onFocus={() => { setShowDropdownCargo(true); setSearchCargo('') }}
                          onBlur={() => setTimeout(() => setShowDropdownCargo(false), 200)}
                          placeholder="Buscar conductor..."
                        />
                        {showDropdownCargo && (
                          <div className="asig-autocomplete-dropdown">
                            <div className="asig-autocomplete-option" onMouseDown={() => { setRegularizarData(prev => ({ ...prev, conductor_cargo_id: '' })); setSearchCargo(''); setShowDropdownCargo(false) }}>
                              Sin asignar
                            </div>
                            {conductoresDisponibles
                              .filter(c => !searchCargo || `${c.apellidos} ${c.nombres}`.toLowerCase().includes(searchCargo.toLowerCase()))
                              .slice(0, 20)
                              .map((c: any) => (
                                <div 
                                  key={c.id} 
                                  className={`asig-autocomplete-option ${regularizarData.conductor_cargo_id === c.id ? 'selected' : ''}`}
                                  onMouseDown={() => { setRegularizarData(prev => ({ ...prev, conductor_cargo_id: c.id })); setSearchCargo(''); setShowDropdownCargo(false) }}
                                >{c.apellidos}, {c.nombres}</div>
                              ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Fechas - 2 columnas */}
                <div className="asig-edit-row">
                  <div className="asig-edit-field">
                    <label>Fecha Entrega Real</label>
                    <input
                      type="date"
                      value={regularizarData.fecha_inicio}
                      onChange={(e) => setRegularizarData(prev => ({ ...prev, fecha_inicio: e.target.value }))}
                    />
                  </div>
                  <div className="asig-edit-field">
                    <label>Fecha Fin</label>
                    <input
                      type="date"
                      value={regularizarData.fecha_fin}
                      onChange={(e) => setRegularizarData(prev => ({ ...prev, fecha_fin: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Notas - full width */}
                <div className="asig-edit-row single">
                  <div className="asig-edit-field">
                    <label>Notas / Observaciones</label>
                    <textarea
                      value={regularizarData.notas}
                      onChange={(e) => setRegularizarData(prev => ({ ...prev, notas: e.target.value }))}
                      rows={3}
                      placeholder="Agregar notas..."
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="asig-modal-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowRegularizarModal(false)
                  setRegularizarAsignacion(null)
                }}
                disabled={isSubmitting}
              >
                Cancelar
              </button>
              <button
                className="btn-primary"
                onClick={handleSaveRegularizacion}
                disabled={isSubmitting || loadingRegularizar}
              >
                {isSubmitting ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
