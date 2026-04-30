// src/modules/asignaciones/AsignacionesModule.tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useMemo } from 'react'
import { Eye, Trash2, CheckCircle, XCircle, FileText, Calendar, UserPlus, UserCheck, Ban, Plus, Pencil, ArrowLeftRight, FolderOpen, ClipboardCheck, Car } from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../../components/ui/DataTable/DataTable'
import { LoadingOverlay } from '../../components/ui/LoadingOverlay'
import { ActionsMenu } from '../../components/ui/ActionsMenu'
import { supabase } from '../../lib/supabase'
import { usePermissions } from '../../contexts/PermissionsContext'
import { useAuth } from '../../contexts/AuthContext'
import { useSede } from '../../contexts/SedeContext'
import { AssignmentWizard } from '../../components/AssignmentWizard'
// KanbanBoard y ProgramacionWizard movidos a /onboarding/programacion
import Swal from 'sweetalert2'
import { showSuccess } from '../../utils/toast'
import { registrarHistorialVehiculo, registrarHistorialConductor } from '../../services/historialService'
import { completeControl } from '../../services/controlService'
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
  control_completado?: boolean
  created_at: string
  created_by?: string | null
  motivo?: string | null
  motivoDetalle?: { observaciones?: string; programadoPor?: string; cambioVehiculo?: boolean; vehiculoCambioPatente?: string; vehiculoCambioModelo?: string; vehiculoCambioId?: string } | null
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
  diurno: { id: string; nombre: string; confirmado: boolean; cancelado?: boolean } | null
  nocturno: { id: string; nombre: string; confirmado: boolean; cancelado?: boolean } | null
}

interface ExpandedAsignacion extends Asignacion {
  conductoresTurno: ConductorTurno | null
  conductorCargo: { id: string; nombre: string; confirmado: boolean; cancelado?: boolean } | null
  esDevolucion?: boolean
  devolucionId?: string
}

// Helper: Convierte fecha ISO UTC a string YYYY-MM-DD en zona horaria LOCAL
// Esto es necesario porque las fechas se guardan en UTC pero queremos filtrar por día local
function getLocalDateStr(isoString: string): string {
  const date = new Date(isoString)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// Helper: cargar programaciones con fallback si columnas de cambio no existen
async function fetchProgramaciones(): Promise<any[]> {
  try {
    const res = await supabase
      .from('programaciones_onboarding')
      .select('asignacion_id, tipo_asignacion, observaciones, created_by_name, vehiculo_cambio_id, vehiculo_cambio_patente, vehiculo_cambio_modelo')
      .not('asignacion_id', 'is', null)
    if (res.error) throw res.error
    return res.data || []
  } catch {
    const res = await supabase
      .from('programaciones_onboarding')
      .select('asignacion_id, tipo_asignacion, observaciones, created_by_name')
      .not('asignacion_id', 'is', null)
    return res.data || []
  }
}

// Helper: mapear motivos de programación a asignaciones
function buildAsignacionesConMotivo(asignaciones: any[], programaciones: any[]) {
  const motivosMap = new Map<string, { tipo: string; observaciones?: string; programadoPor?: string; cambioVehiculo?: boolean; vehiculoCambioPatente?: string; vehiculoCambioModelo?: string; vehiculoCambioId?: string }>()
  for (const p of programaciones) {
    if (p.asignacion_id && p.tipo_asignacion) {
      motivosMap.set(p.asignacion_id, { tipo: p.tipo_asignacion, observaciones: p.observaciones, programadoPor: p.created_by_name, cambioVehiculo: !!(p.vehiculo_cambio_id), vehiculoCambioPatente: p.vehiculo_cambio_patente || '', vehiculoCambioModelo: p.vehiculo_cambio_modelo || '', vehiculoCambioId: p.vehiculo_cambio_id || '' })
    }
  }
  return asignaciones.map((a: any) => {
    const prog = motivosMap.get(a.id)
    return {
      ...a,
      motivo: prog?.tipo || null,
      motivoDetalle: prog ? { observaciones: prog.observaciones, programadoPor: prog.programadoPor, cambioVehiculo: prog.cambioVehiculo, vehiculoCambioPatente: prog.vehiculoCambioPatente, vehiculoCambioModelo: prog.vehiculoCambioModelo, vehiculoCambioId: prog.vehiculoCambioId } : null,
    }
  })
}

export function AsignacionesModule() {
  const { canEditInMenu, canDeleteInMenu } = usePermissions()
  const { profile } = useAuth()
  const { sedeActualId, aplicarFiltroSede, sedes } = useSede()
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
  const [viewDriveUrls, setViewDriveUrls] = useState<Record<string, string>>({})
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
    estado: string
    documento_diurno: string
    documento_nocturno: string
    documento_cargo: string
    sede_id: string
  }>({ fecha_inicio: '', fecha_fin: '', notas: '', vehiculo_id: '', horario: '', conductor_diurno_id: '', conductor_nocturno_id: '', conductor_cargo_id: '', estado: '', documento_diurno: '', documento_nocturno: '', documento_cargo: '', sede_id: '' })
  const [vehiculosDisponibles, setVehiculosDisponibles] = useState<any[]>([])
  const [conductoresDisponibles, setConductoresDisponibles] = useState<any[]>([])
  const [loadingRegularizar, setLoadingRegularizar] = useState(false)
  // Estados para búsqueda en modal editar (vehículo + conductores)
  const [searchVehiculo, setSearchVehiculo] = useState('')
  const [showDropdownVehiculo, setShowDropdownVehiculo] = useState(false)
  const [searchDiurno, setSearchDiurno] = useState('')
  const [searchNocturno, setSearchNocturno] = useState('')
  const [searchCargo, setSearchCargo] = useState('')
  const [showDropdownDiurno, setShowDropdownDiurno] = useState(false)
  const [showDropdownNocturno, setShowDropdownNocturno] = useState(false)
  const [showDropdownCargo, setShowDropdownCargo] = useState(false)

  // --- Completar Control ---
  const [showControlModal, setShowControlModal] = useState(false)
  const [controlAsignacion, setControlAsignacion] = useState<ExpandedAsignacion | null>(null)
  const [controlSaving, setControlSaving] = useState(false)
  const [isControlBariloche, setIsControlBariloche] = useState(false)
  const [controlForm, setControlForm] = useState({
    km: '',
    ltnafta: '',
    observations: '',
    cristal_status: '',
    carter: '',
    tires: '',
    others_docs: '',
    other_accesory: '',
    make_chains: '',
    status_chains: '',
    tensioners_chains: '',
    others_kit: '',
  })

  async function openControlModal(asig: ExpandedAsignacion) {
    setControlAsignacion(asig)
    setControlForm({ km: '', ltnafta: '', observations: '', cristal_status: '', carter: '', tires: '', others_docs: '', other_accesory: '', make_chains: '', status_chains: '', tensioners_chains: '', others_kit: '' })
    // Obtener un conductor para consultar si la plantilla es Bariloche
    const isAutoCargo = asig.horario === 'todo_dia'
    let conductorId = ''
    if (isAutoCargo && asig.conductorCargo) {
      conductorId = asig.conductorCargo.id
    } else if (!isAutoCargo && asig.conductoresTurno?.diurno) {
      conductorId = asig.conductoresTurno.diurno.id
    }
    // Determinar si es Bariloche consultando la plantilla real del documento generado
    let esBRC = false
    if (conductorId) {
      try {
        const { data } = await supabase
          .from('documentos_generados')
          .select('plantilla_usada')
          .eq('conductor_id', conductorId)
          .not('google_doc_id', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()
        if (data?.plantilla_usada) {
          esBRC = data.plantilla_usada.toLowerCase().includes('bariloche')
        }
      } catch {
        // Si falla la consulta, fallback a la sede actual
        if (sedeActualId) {
          const sede = sedes.find(s => s.id === sedeActualId)
          esBRC = sede?.codigo?.toUpperCase() === 'BRC'
        }
      }
    }
    setIsControlBariloche(esBRC)
    setShowControlModal(true)
  }

  async function handleSubmitControl() {
    if (!controlAsignacion) return

    // Obtener los conductores de la asignación
    const conductoresAsig = controlAsignacion.asignaciones_conductores?.map(ac => ({
      id: (ac as any).conductores?.id || ac.conductor_id,
      nombre: `${(ac as any).conductores?.nombres || ''} ${(ac as any).conductores?.apellidos || ''}`.trim(),
      horario: ac.horario,
    })).filter(c => c.id && c.nombre) || []

    if (conductoresAsig.length === 0) return

    // Validar que todos los campos visibles estén completos
    const camposBase = [controlForm.km, controlForm.ltnafta, controlForm.observations]
    const camposBariloche = isControlBariloche
      ? [controlForm.cristal_status, controlForm.carter, controlForm.tires, controlForm.others_docs, controlForm.other_accesory, controlForm.make_chains, controlForm.status_chains, controlForm.tensioners_chains, controlForm.others_kit]
      : []
    const todosLosCampos = [...camposBase, ...camposBariloche]
    if (todosLosCampos.some(c => !c.trim())) {
      Swal.fire('Campos requeridos', 'Todos los campos son obligatorios. En caso de no tener el dato, ingresa N/A o Sin observación.', 'warning')
      return
    }

    const cantConductores = conductoresAsig.length
    const confirmacion = await Swal.fire({
      icon: 'warning',
      title: 'Confirmar generacion',
      text: cantConductores > 1
        ? `Se generará el documento de control para los ${cantConductores} conductores asignados. Tenga en cuenta que despues de guardar estos datos ya no se podra revertir ni editar los documentos generados.`
        : 'Tenga en cuenta que despues de guardar estos datos ya no se podra revertir ni editar el documento generado.',
      showCancelButton: true,
      confirmButtonText: cantConductores > 1 ? `Generar ${cantConductores} Documentos` : 'Generar Documento',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: 'var(--color-primary)',
    })

    if (!confirmacion.isConfirmed) return

    setControlSaving(true)
    try {
      const payload = {
        asignacion_id: controlAsignacion.id,
        km: controlForm.km.trim(),
        ltnafta: controlForm.ltnafta.trim(),
        observations: controlForm.observations.trim(),
        cristal_status: isControlBariloche ? (controlForm.cristal_status.trim() || null) : null,
        carter: isControlBariloche ? (controlForm.carter.trim() || null) : null,
        tires: isControlBariloche ? (controlForm.tires.trim() || null) : null,
        others_docs: isControlBariloche ? (controlForm.others_docs.trim() || null) : null,
        other_accesory: isControlBariloche ? (controlForm.other_accesory.trim() || null) : null,
        make_chains: isControlBariloche ? (controlForm.make_chains.trim() || null) : null,
        status_chains: isControlBariloche ? (controlForm.status_chains.trim() || null) : null,
        tensioners_chains: isControlBariloche ? (controlForm.tensioners_chains.trim() || null) : null,
        others_kit: isControlBariloche ? (controlForm.others_kit.trim() || null) : null,
      }

      // Enviar control para cada conductor
      for (const conductor of conductoresAsig) {
        const result = await completeControl({
          conductor_id: conductor.id,
          ...payload,
        })
        if (!result.success) throw new Error(result.error || `Error al generar control para ${conductor.nombre}`)
      }

      setShowControlModal(false)
      showSuccess(cantConductores > 1
        ? `Control completado y ${cantConductores} PDFs generados correctamente`
        : 'Control completado y PDF generado correctamente')
      loadAsignaciones()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido'
      Swal.fire('Error', `No se pudo completar el control: ${msg}`, 'error')
    } finally {
      setControlSaving(false)
    }
  }

  // Maps O(1) para lookup de conductores/vehículos por id (evita .find() O(n) en JSX)
  const conductoresMap = useMemo(() => {
    const m = new Map<string, any>()
    for (const c of conductoresDisponibles) m.set(c.id, c)
    return m
  }, [conductoresDisponibles])
  const vehiculosMap = useMemo(() => {
    const m = new Map<string, any>()
    for (const v of vehiculosDisponibles) m.set(v.id, v)
    return m
  }, [vehiculosDisponibles])
  const getConductorDisplay = (id: string) => {
    const c = conductoresMap.get(id)
    return c ? `${c.apellidos}, ${c.nombres}` : ''
  }
  const getVehiculoDisplay = (id: string) => {
    const v = vehiculosMap.get(id)
    return v ? `${v.patente} - ${v.marca} ${v.modelo}` : ''
  }

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
      if (a.horario === 'turno') {
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
      a.horario === 'turno' && (a.asignaciones_conductores?.length || 0) < 2
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

    // Conductores por documento ESTA SEMANA - contamos CONDUCTORES ÚNICOS (no asignaciones)
    // Solo contamos asignaciones que se entregaron/activaron esta semana (lunes a domingo)
    const conductoresCartaOfertaSet = new Set<string>()
    const conductoresAnexoSet = new Set<string>()

    for (const a of asignaciones) {
      // Solo contar asignaciones activas o programadas
      if (a.estado !== 'activa' && a.estado !== 'programado') continue
      
      // Filtrar por semana: usar fecha_inicio (entrega real) o fecha_programada
      const fechaRef = a.fecha_inicio || a.fecha_programada
      if (fechaRef) {
        const fechaLocal = getLocalDateStr(fechaRef)
        // Si la asignación NO es de esta semana, saltar
        if (fechaLocal < lunesSemanaStr || fechaLocal > domingoSemanaStr) continue
      }

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

      const [asignacionesRes, vehiculosRes, conductoresRes, devolucionesRes] = await Promise.all([
        // Asignaciones: activas/programadas + finalizadas recientes (máx 500)
        aplicarFiltroSede(supabase
          .from('asignaciones')
          .select(`
            id, codigo, vehiculo_id, horario, fecha_programada, fecha_inicio, fecha_fin, estado, control_completado, created_at, sede_id,
            vehiculos (patente, marca, modelo),
            asignaciones_conductores (
              id, conductor_id, estado, horario, confirmado, fecha_confirmacion, documento,
              conductores (nombres, apellidos, numero_licencia, estado_id, conductores_estados(codigo))
            )
          `))
          .or(`estado.in.(programado,activa),created_at.gte.${fechaLimiteStr}`)
          .order('fecha_programada', { ascending: false, nullsFirst: false })
          .limit(500),
        // Vehículos con estado - solo activos (excluir soft-deleted)
        aplicarFiltroSede(supabase
          .from('vehiculos')
          .select('id, estado_id, vehiculos_estados(codigo)')
          .is('deleted_at', null))
          .limit(1000),
        // Conductores con estado - solo activos
        aplicarFiltroSede(supabase
          .from('conductores')
          .select('id, conductores_estados(codigo)'))
          .limit(2000),
        // Devoluciones pendientes y completadas
        aplicarFiltroSede((supabase as any)
          .from('devoluciones')
          .select('id, vehiculo_id, conductor_nombre, programado_por, fecha_programada, fecha_devolucion, estado, observaciones, created_at, programacion_id, sede_id, vehiculos:vehiculo_id(patente, marca, modelo), programaciones_onboarding:programacion_id(conductor_nombre, conductor_diurno_nombre, conductor_nocturno_nombre, documento_diurno, documento_nocturno, tipo_documento)'))
          .in('estado', ['pendiente', 'completado'])
          .order('fecha_programada', { ascending: true })
      ])

      if (asignacionesRes.error) throw asignacionesRes.error

      const programacionesData = await fetchProgramaciones()
      const asignacionesConMotivo = buildAsignacionesConMotivo(asignacionesRes.data || [], programacionesData)

      // PRE-RESOLVER conductores de todos los vehículos con devoluciones via query directa
      // (misma lógica que handleConfirmarDevolucion, SIN filtro de sede)
      // Se hace ANTES de construir devolucionesVirtuales para tener el fallback disponible inline
      const allDevVehIds = [...new Set((devolucionesRes?.data || []).map((d: any) => d.vehiculo_id).filter(Boolean))]
      const conductoresPorVehiculo = new Map<string, string>()
      if (allDevVehIds.length > 0) {
        const { data: asigsConductores } = await (supabase as any)
          .from('asignaciones')
          .select('vehiculo_id, asignaciones_conductores(conductor_id, estado, horario, conductores(nombres, apellidos))')
          .in('vehiculo_id', allDevVehIds)
          .in('estado', ['activa', 'activo'])
        if (asigsConductores) {
          for (const asig of asigsConductores) {
            const nombres = (asig.asignaciones_conductores || [])
              .filter((c: any) => c.estado !== 'cancelado' && c.estado !== 'completado' && c.conductores)
              .map((c: any) => `${c.conductores.nombres || ''} ${c.conductores.apellidos || ''}`.trim())
              .filter(Boolean)
            if (nombres.length > 0) conductoresPorVehiculo.set(asig.vehiculo_id, nombres.join(', '))
          }
        }
        // Fallback: asignaciones completadas/finalizadas para vehículos sin resolver
        const vehSinResolver = allDevVehIds.filter((v) => !conductoresPorVehiculo.has(v as string))
        if (vehSinResolver.length > 0) {
          const { data: asigsCompletadas } = await (supabase as any)
            .from('asignaciones')
            .select('vehiculo_id, asignaciones_conductores(conductor_id, estado, conductores(nombres, apellidos))')
            .in('vehiculo_id', vehSinResolver)
            .in('estado', ['completada', 'finalizada'])
            .order('created_at', { ascending: false })
          if (asigsCompletadas) {
            for (const asig of asigsCompletadas) {
              if (conductoresPorVehiculo.has(asig.vehiculo_id)) continue
              const nombres = (asig.asignaciones_conductores || [])
                .filter((c: any) => c.conductores)
                .map((c: any) => `${c.conductores.nombres || ''} ${c.conductores.apellidos || ''}`.trim())
                .filter(Boolean)
              if (nombres.length > 0) conductoresPorVehiculo.set(asig.vehiculo_id, nombres.join(', '))
            }
          }
        }
      }

      // Convertir devoluciones pendientes en filas virtuales
      // Usa conductoresPorVehiculo (ya resuelto arriba) como fallback final
      const devolucionesVirtuales: Asignacion[] = (devolucionesRes?.data || []).map((d: any) => {
        const asigVehiculo = asignacionesConMotivo.find((a: any) => a.vehiculo_id === d.vehiculo_id && a.estado === 'activa')
          || asignacionesConMotivo.filter((a: any) => a.vehiculo_id === d.vehiculo_id && a.estado === 'finalizada').sort((a: any, b: any) => (b.fecha_fin || b.created_at || '').localeCompare(a.fecha_fin || a.created_at || ''))[0]
        const horarioReal = asigVehiculo?.horario || 'turno'
        const prog = d.programaciones_onboarding
        // Resolver conductor con .trim() y fallback a conductoresPorVehiculo (query directa)
        const conductorNombre = d.conductor_nombre?.trim()
          || prog?.conductor_nombre?.trim()
          || prog?.conductor_diurno_nombre?.trim()
          || prog?.conductor_nocturno_nombre?.trim()
          || conductoresPorVehiculo.get(d.vehiculo_id)
          || ''
        const doc = prog?.tipo_documento || prog?.documento_diurno || prog?.documento_nocturno
        return {
          id: d.id,
          codigo: '',
          vehiculo_id: d.vehiculo_id,
          conductor_id: '',
          fecha_programada: d.fecha_programada,
          fecha_inicio: d.fecha_devolucion || '',
          fecha_fin: d.fecha_devolucion || null,
          modalidad: '',
          horario: horarioReal,
          estado: d.estado === 'completado' ? 'finalizada' : 'programado',
          notas: d.observaciones,
          created_at: d.created_at,
          created_by: null,
          motivo: 'devolucion_vehiculo',
          vehiculos: d.vehiculos || undefined,
          asignaciones_conductores: doc ? [{ id: d.id, conductor_id: '', estado: 'asignado', horario: horarioReal === 'todo_dia' ? 'todo_dia' : 'diurno', documento: doc === 'carta_oferta' ? 'CARTA_OFERTA' : doc === 'anexo' ? 'ANEXO' : doc?.toUpperCase() }] : [],
          esDevolucion: true,
          devolucionId: d.id,
          _conductorNombre: conductorNombre,
          _programadoPor: d.programado_por,
          motivoDetalle: { observaciones: d.observaciones, programadoPor: d.programado_por },
          sede_id: d.sede_id || '',
        }
      })

      setAsignaciones([...asignacionesConMotivo, ...devolucionesVirtuales])

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

      const [asigRes, devRes] = await Promise.all([
        aplicarFiltroSede(supabase
          .from('asignaciones')
          .select(`
            id, codigo, vehiculo_id, horario, fecha_programada, fecha_inicio, fecha_fin, estado, control_completado, created_at, sede_id,
            vehiculos (patente, marca, modelo),
            asignaciones_conductores (
              id, conductor_id, estado, horario, confirmado, fecha_confirmacion, documento,
              conductores (nombres, apellidos, numero_licencia, estado_id, drive_folder_url, conductores_estados(codigo))
            )
          `))
          .or(`estado.in.(programado,activa),created_at.gte.${fechaLimiteStr}`)
          .order('created_at', { ascending: false })
          .limit(500),
        aplicarFiltroSede((supabase as any)
          .from('devoluciones')
          .select('id, vehiculo_id, conductor_nombre, programado_por, fecha_programada, fecha_devolucion, estado, observaciones, created_at, programacion_id, sede_id, vehiculos:vehiculo_id(patente, marca, modelo), programaciones_onboarding:programacion_id(conductor_nombre, conductor_diurno_nombre, conductor_nocturno_nombre, documento_diurno, documento_nocturno, tipo_documento)'))
          .in('estado', ['pendiente', 'completado'])
          .order('fecha_programada', { ascending: true })
      ])

      if (asigRes.error) throw asigRes.error

      const progData = await fetchProgramaciones()
      const asignacionesConMotivo = buildAsignacionesConMotivo(asigRes.data || [], progData)

      // Resolver conductores de devoluciones: query directa a la BD (igual que handleConfirmarDevolucion)
      // Buscar conductores para TODOS los vehículos con devoluciones (no solo los sin nombre)
      // para tener siempre el fallback disponible
      const devsData = devRes?.data || []
      const vehIdsDev = [...new Set(devsData.map((d: any) => d.vehiculo_id).filter(Boolean))]
      const conductoresPorVeh = new Map<string, string>()
      if (vehIdsDev.length > 0) {
        // Buscar primero en asignaciones activas
        const { data: asigsCond } = await (supabase as any)
          .from('asignaciones')
          .select('vehiculo_id, asignaciones_conductores(conductor_id, estado, conductores(nombres, apellidos))')
          .in('vehiculo_id', vehIdsDev)
          .in('estado', ['activa', 'activo'])
        if (asigsCond) {
          for (const asig of asigsCond) {
            if (conductoresPorVeh.has(asig.vehiculo_id)) continue
            const nombres = (asig.asignaciones_conductores || [])
              .filter((c: any) => c.estado !== 'cancelado' && c.conductores)
              .map((c: any) => `${c.conductores.nombres || ''} ${c.conductores.apellidos || ''}`.trim())
              .filter(Boolean)
            if (nombres.length > 0) conductoresPorVeh.set(asig.vehiculo_id, nombres.join(', '))
          }
        }

        // Fallback: para los vehículos que no se resolvieron, buscar en la asignación más reciente (completada/finalizada)
        const vehSinResolver = vehIdsDev.filter((v) => !conductoresPorVeh.has(v as string))
        if (vehSinResolver.length > 0) {
          const { data: asigsCompletadas } = await (supabase as any)
            .from('asignaciones')
            .select('vehiculo_id, asignaciones_conductores(conductor_id, estado, conductores(nombres, apellidos))')
            .in('vehiculo_id', vehSinResolver)
            .in('estado', ['completada', 'finalizada'])
            .order('created_at', { ascending: false })
          if (asigsCompletadas) {
            for (const asig of asigsCompletadas) {
              if (conductoresPorVeh.has(asig.vehiculo_id)) continue
              const nombres = (asig.asignaciones_conductores || [])
                .filter((c: any) => c.conductores)
                .map((c: any) => `${c.conductores.nombres || ''} ${c.conductores.apellidos || ''}`.trim())
                .filter(Boolean)
              if (nombres.length > 0) conductoresPorVeh.set(asig.vehiculo_id, nombres.join(', '))
            }
          }
        }
      }

      const devolucionesVirtuales: Asignacion[] = devsData.map((d: any) => {
        const prog = d.programaciones_onboarding
        const condNombre = d.conductor_nombre?.trim()
          || prog?.conductor_nombre?.trim()
          || prog?.conductor_diurno_nombre?.trim()
          || prog?.conductor_nocturno_nombre?.trim()
          || conductoresPorVeh.get(d.vehiculo_id)
          || ''
        const doc = prog?.tipo_documento || prog?.documento_diurno || prog?.documento_nocturno
        // Resolver horario real: primero activa, luego finalizada más reciente
        const asigVeh = asignacionesConMotivo.find((a: any) => a.vehiculo_id === d.vehiculo_id && a.estado === 'activa')
          || asignacionesConMotivo.filter((a: any) => a.vehiculo_id === d.vehiculo_id && a.estado === 'finalizada').sort((a: any, b: any) => (b.fecha_fin || b.created_at || '').localeCompare(a.fecha_fin || a.created_at || ''))[0]
        const horarioReal = asigVeh?.horario || 'turno'
        return {
          id: d.id, codigo: '', vehiculo_id: d.vehiculo_id, conductor_id: '', fecha_programada: d.fecha_programada,
          fecha_inicio: d.fecha_devolucion || '', fecha_fin: d.fecha_devolucion || null, modalidad: '', horario: horarioReal, estado: d.estado === 'completado' ? 'finalizada' : 'programado',
          notas: d.observaciones, created_at: d.created_at, created_by: null, motivo: 'devolucion_vehiculo',
          vehiculos: d.vehiculos || undefined,
          asignaciones_conductores: doc ? [{ id: d.id, conductor_id: '', estado: 'asignado', horario: horarioReal === 'todo_dia' ? 'todo_dia' : 'diurno', documento: doc === 'carta_oferta' ? 'CARTA_OFERTA' : doc === 'anexo' ? 'ANEXO' : doc?.toUpperCase() }] : [],
          esDevolucion: true, devolucionId: d.id, _conductorNombre: condNombre, _programadoPor: d.programado_por,
          motivoDetalle: { observaciones: d.observaciones, programadoPor: d.programado_por },
          sede_id: d.sede_id || '',
        }
      })

      setAsignaciones([...asignacionesConMotivo, ...devolucionesVirtuales])
    } catch (err: any) {
      setError(err.message || 'Error al cargar las asignaciones')
    } finally {
      setLoading(false)
    }
  }

  // ✅ OPTIMIZADO: Carga unificada en paralelo (recarga al cambiar sede)
  useEffect(() => {
    loadAllData()
  }, [sedeActualId])

  // Cargar drive_folder_url directo de conductores cuando se abre el modal de detalle
  useEffect(() => {
    if (!showViewModal || !viewAsignacion) {
      setViewDriveUrls({})
      return
    }
    const conductorIds = (viewAsignacion.asignaciones_conductores || [])
      .map(ac => ac.conductor_id)
      .filter(Boolean)
    if (conductorIds.length === 0) return
    supabase
      .from('conductores')
      .select('id, drive_folder_url')
      .in('id', conductorIds)
      .then(({ data }) => {
        if (data) {
          const urls: Record<string, string> = {}
          for (const c of data) {
            if (c.drive_folder_url) urls[c.id] = c.drive_folder_url
          }
          setViewDriveUrls(urls)
        }
      })
  }, [showViewModal, viewAsignacion])

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
        // Programadas ESTA SEMANA (lunes a domingo)
        result = result.filter(a => {
          if (a.estado !== 'programado' || !a.fecha_programada) return false
          const fechaLocal = getLocalDateStr(a.fecha_programada)
          return fechaLocal >= lunesSemanaStr && fechaLocal <= domingoSemanaStr
        })
        break
      case 'activas':
        result = result.filter(a => a.estado === 'activa')
        break
      case 'completadas':
        // Completadas ESTA SEMANA (lunes a domingo) - entregas activadas/confirmadas
        result = result.filter(a => {
          if ((a.estado !== 'activa' && a.estado !== 'finalizada') || !a.fecha_inicio) return false
          const fechaEntregaLocal = getLocalDateStr(a.fecha_inicio)
          return fechaEntregaLocal >= lunesSemanaStr && fechaEntregaLocal <= domingoSemanaStr
        })
        break
      case 'canceladas':
        // Canceladas ESTA SEMANA (lunes a domingo)
        result = result.filter(a => {
          if (a.estado !== 'cancelada') return false
          const fechaRef = a.fecha_fin || a.created_at
          if (!fechaRef) return false
          const fechaCancelacionLocal = getLocalDateStr(fechaRef)
          return fechaCancelacionLocal >= lunesSemanaStr && fechaCancelacionLocal <= domingoSemanaStr
        })
        break
      case 'cartaOferta':
        // Carta Oferta ESTA SEMANA (lunes a domingo)
        result = result.filter(a => {
          if (a.estado !== 'activa' && a.estado !== 'programado') return false
          if (!a.asignaciones_conductores?.some(c => c.documento === 'CARTA_OFERTA')) return false
          const fechaRef = a.fecha_inicio || a.fecha_programada
          if (!fechaRef) return false
          const fechaLocal = getLocalDateStr(fechaRef)
          return fechaLocal >= lunesSemanaStr && fechaLocal <= domingoSemanaStr
        })
        break
      case 'anexo':
        // Anexo ESTA SEMANA (lunes a domingo)
        result = result.filter(a => {
          if (a.estado !== 'activa' && a.estado !== 'programado') return false
          if (!a.asignaciones_conductores?.some(c => c.documento === 'ANEXO')) return false
          const fechaRef = a.fecha_inicio || a.fecha_programada
          if (!fechaRef) return false
          const fechaLocal = getLocalDateStr(fechaRef)
          return fechaLocal >= lunesSemanaStr && fechaLocal <= domingoSemanaStr
        })
        break
      case 'entregasHoy':
        // Entregas programadas para HOY
        result = result.filter(a => {
          if (a.estado !== 'programado' || !a.fecha_programada) return false
          const fecha = a.fecha_programada.split('T')[0]
          return fecha === hoyStr
        })
        break
    }

    // Ordenar siempre por fecha de cita (fecha_programada) descendente: más reciente primero
    // Los registros sin fecha quedan al final
    return result.sort((a, b) => {
      const fechaA = a.fecha_programada ? new Date(a.fecha_programada).getTime() : 0
      const fechaB = b.fecha_programada ? new Date(b.fecha_programada).getTime() : 0
      return fechaB - fechaA
    })
  }, [asignaciones, activeStatCard])

  // Procesar asignaciones - UNA fila por asignación (solo asignaciones reales)
  const expandedAsignaciones = useMemo<ExpandedAsignacion[]>(() => {
    // Procesar todas las asignaciones filtradas
    const asignacionesProcesadas = filteredAsignaciones.map((asignacion): ExpandedAsignacion => {
      // Devoluciones: crear fila virtual - buscar conductor de la asignación activa del vehículo
      if ((asignacion as any).esDevolucion) {
        // Resolver nombre con múltiples niveles de fallback:
        // 1) Campo _conductorNombre (resuelto en loadAllData/loadAsignaciones)
        // 2) Conductores activos/asignados del mismo vehículo en otras filas
        // 3) Conductores completados del mismo vehículo (asignación ya finalizada)
        // 4) Cualquier conductor del mismo vehículo (incluyendo cancelados, último recurso)
        // 5) Nombre de la programación asociada (conductor_diurno/nocturno/cargo)
        let nombre = (asignacion as any)._conductorNombre || ''
        if (!nombre) {
          // Nivel 2: buscar conductores activos/asignados del mismo vehículo
          for (const otra of filteredAsignaciones) {
            if ((otra as any).esDevolucion) continue
            if (otra.vehiculo_id !== asignacion.vehiculo_id) continue
            const conds = otra.asignaciones_conductores || []
            for (const c of conds) {
              const cd = (c as any).conductores
              if (cd && c.estado !== 'completado' && c.estado !== 'cancelado') {
                nombre = `${cd.nombres || ''} ${cd.apellidos || ''}`.trim()
                break
              }
            }
            if (nombre) break
          }
        }
        if (!nombre) {
          // Nivel 3: buscar en conductores completados (no cancelados)
          for (const otra of filteredAsignaciones) {
            if ((otra as any).esDevolucion) continue
            if (otra.vehiculo_id !== asignacion.vehiculo_id) continue
            const conds = otra.asignaciones_conductores || []
            for (const c of conds) {
              const cd = (c as any).conductores
              if (cd && c.estado !== 'cancelado') {
                nombre = `${cd.nombres || ''} ${cd.apellidos || ''}`.trim()
                break
              }
            }
            if (nombre) break
          }
        }
        if (!nombre) {
          // Nivel 4: cualquier conductor del mismo vehículo (incluyendo cancelados)
          for (const otra of filteredAsignaciones) {
            if ((otra as any).esDevolucion) continue
            if (otra.vehiculo_id !== asignacion.vehiculo_id) continue
            const conds = otra.asignaciones_conductores || []
            for (const c of conds) {
              const cd = (c as any).conductores
              if (cd) {
                nombre = `${cd.nombres || ''} ${cd.apellidos || ''}`.trim()
                break
              }
            }
            if (nombre) break
          }
        }
        if (!nombre) {
          // Nivel 5: buscar en otras devoluciones completadas del mismo vehículo que sí tengan nombre
          for (const otra of filteredAsignaciones) {
            if (!(otra as any).esDevolucion) continue
            if (otra.id === asignacion.id) continue
            if (otra.vehiculo_id !== asignacion.vehiculo_id) continue
            const otroNombre = (otra as any)._conductorNombre || ''
            if (otroNombre) {
              nombre = otroNombre
              break
            }
          }
        }
        return {
          ...asignacion,
          esDevolucion: true,
          devolucionId: (asignacion as any).devolucionId,
          conductoresTurno: null,
          conductorCargo: {
            id: '',
            nombre: nombre || 'Sin conductor',
            confirmado: false,
            cancelado: false,
          },
        }
      }

      const conductores = asignacion.asignaciones_conductores || []
      const esAsignacionFinalizada = asignacion.estado === 'finalizada' || asignacion.estado === 'completada' || asignacion.estado === 'cancelada'
      
      // Para modalidad TURNO: extraer conductor diurno y nocturno
      // IMPORTANTE: Para trazabilidad, mostramos TODOS los conductores (incluidos cancelados)
      // pero marcamos los cancelados para mostrarlos diferente en la UI
      if (asignacion.horario === 'turno') {
        const conductoresDiurno = conductores.filter(ac => ac.horario === 'diurno')
        const conductoresNocturno = conductores.filter(ac => ac.horario === 'nocturno')
        
        // Buscar conductor activo/asignado. Si no hay:
        // - Finalizada: mostrar último del historial (trazabilidad)
        // - Activa: mostrar Vacante (null) — conductor completado/dado de baja = ya no está
        // - Programada: mostrar cancelado tachado (para ver que se cayó antes de entregar)
        const esActiva = asignacion.estado === 'activa' || asignacion.estado === 'activo'
        const diurnoActivo = conductoresDiurno.find(ac => ac.estado !== 'completado' && ac.estado !== 'finalizado' && ac.estado !== 'cancelado')
        const diurno = diurnoActivo || (esAsignacionFinalizada
          ? conductoresDiurno[conductoresDiurno.length - 1]
          : esActiva ? null : conductoresDiurno.find(ac => ac.estado === 'cancelado') || null)
        
        const nocturnoActivo = conductoresNocturno.find(ac => ac.estado !== 'completado' && ac.estado !== 'finalizado' && ac.estado !== 'cancelado')
        const nocturno = nocturnoActivo || (esAsignacionFinalizada
          ? conductoresNocturno[conductoresNocturno.length - 1]
          : esActiva ? null : conductoresNocturno.find(ac => ac.estado === 'cancelado') || null)

        return {
          ...asignacion,
          conductoresTurno: {
            diurno: diurno ? {
              id: diurno.conductor_id,
              nombre: `${diurno.conductores?.nombres || ''} ${diurno.conductores?.apellidos || ''}`.trim() || 'Sin datos',
              confirmado: diurno.confirmado || false,
              cancelado: !esAsignacionFinalizada && diurno.estado === 'cancelado'
            } : null,
            nocturno: nocturno ? {
              id: nocturno.conductor_id,
              nombre: `${nocturno.conductores?.nombres || ''} ${nocturno.conductores?.apellidos || ''}`.trim() || 'Sin datos',
              confirmado: nocturno.confirmado || false,
              cancelado: !esAsignacionFinalizada && nocturno.estado === 'cancelado'
            } : null
          },
          conductorCargo: null
        }
      }

      // Para modalidad A CARGO: misma lógica que TURNO
      const esActivaCargo = asignacion.estado === 'activa' || asignacion.estado === 'activo'
      const conductorActivo = conductores.find(ac => ac.estado !== 'completado' && ac.estado !== 'finalizado' && ac.estado !== 'cancelado')
      const primerConductor = conductorActivo || (esAsignacionFinalizada
        ? conductores[conductores.length - 1]
        : esActivaCargo ? null : conductores.find(ac => ac.estado === 'cancelado') || null)
      
      // Si es finalizada y no hay conductores en el array, intentar extraer de notas
      let conductorCargoInfo: { id: string; nombre: string; confirmado: boolean; cancelado?: boolean } | null = null
      if (primerConductor && primerConductor.conductores) {
        conductorCargoInfo = {
          id: String(primerConductor.conductor_id),
          nombre: `${primerConductor.conductores.nombres} ${primerConductor.conductores.apellidos}`,
          confirmado: primerConductor.confirmado || false,
          cancelado: !esAsignacionFinalizada && primerConductor.estado === 'cancelado'
        }
      } else if (esAsignacionFinalizada && conductores.length === 0 && asignacion.notas) {
        // Extraer nombre del conductor de la traza en notas
        const matchConductores = asignacion.notas.match(/Conductores al cierre:\s*(.+?)(?:\n|$)/)
          || asignacion.notas.match(/Ultimos conductores:\s*(.+?)(?:\n|$)/)
        if (matchConductores && matchConductores[1] && matchConductores[1] !== 'ninguno') {
          conductorCargoInfo = {
            id: '',
            nombre: matchConductores[1].split(',')[0].replace(/\s*\(.*?\)\s*$/, '').trim(),
            confirmado: true,
            cancelado: false
          }
        }
      }

      return {
        ...asignacion,
        conductoresTurno: null,
        conductorCargo: conductorCargoInfo
      }
    })

    // Ordenar: PROGRAMADOS primero, luego el resto por fecha de cita descendente
    // Los registros sin fecha quedan al final
    return asignacionesProcesadas.sort((a, b) => {
      // 1. PROGRAMADOS siempre primero
      const aEsProgramado = a.estado === 'programado' ? 0 : 1
      const bEsProgramado = b.estado === 'programado' ? 0 : 1
      if (aEsProgramado !== bEsProgramado) return aEsProgramado - bEsProgramado

      // 2. Dentro de cada grupo, ordenar por fecha_programada descendente
      const fechaA = a.fecha_programada ? new Date(a.fecha_programada).getTime() : 0
      const fechaB = b.fecha_programada ? new Date(b.fecha_programada).getTime() : 0
      return fechaB - fechaA
    })
  }, [filteredAsignaciones])

  // Estadísticas para los stat cards (solo programadas de ESTA SEMANA)
  const programadasCount = useMemo(() => {
    const { lunesSemanaStr, domingoSemanaStr } = calculatedStats
    return asignaciones.filter(a => {
      if (a.estado !== 'programado') return false
      // Filtrar por fecha programada dentro de esta semana
      if (!a.fecha_programada) return false
      const fechaLocal = getLocalDateStr(a.fecha_programada)
      return fechaLocal >= lunesSemanaStr && fechaLocal <= domingoSemanaStr
    }).length
  }, [asignaciones, calculatedStats])

  // Manejar click en stat cards para filtrar
  const handleStatCardClick = (cardType: string) => {
    // Toggle: si hace click en el mismo, desactivar; si no, activar el nuevo
    setActiveStatCard(prev => prev === cardType ? null : cardType)
  }

  // Generar filtros externos para mostrar en la barra de filtros del DataTable
  const externalFilters = useMemo(() => {
    if (!activeStatCard) return []

    const labels: Record<string, string> = {
      programadas: 'Programadas (Semana)',
      completadas: 'Completadas (Semana)',
      canceladas: 'Canceladas (Semana)',
      cartaOferta: 'Cond. Nuevos (Semana)',
      anexo: 'Cond. Anexo (Semana)'
    }

    return [{
      id: activeStatCard,
      label: labels[activeStatCard] || activeStatCard,
      onClear: () => setActiveStatCard(null)
    }]
  }, [activeStatCard])

  // Confirmar devolución: seleccionar conductor que devuelve, cambiar vehículo a PKG_ON_BASE
  const handleConfirmarDevolucion = async (asig: ExpandedAsignacion) => {
    if (isSubmitting) return

    // Buscar conductores activos del vehículo para mostrar selector
    const { data: asignacionesActivas } = await (supabase as any)
      .from('asignaciones')
      .select(`id, horario, asignaciones_conductores(id, conductor_id, horario, estado, conductores(nombres, apellidos))`)
      .eq('vehiculo_id', asig.vehiculo_id)
      .in('estado', ['activa', 'activo'])

    const conductores: Array<{ id: string; nombre: string; turno: string }> = []
    if (asignacionesActivas) {
      for (const asigActiva of asignacionesActivas) {
        for (const ac of (asigActiva.asignaciones_conductores || [])) {
          // Solo conductores activos/asignados (no cancelados/completados)
          if (ac.conductores && ac.conductor_id && ac.estado !== 'cancelado' && ac.estado !== 'completado') {
            const nombre = `${ac.conductores.nombres || ''} ${ac.conductores.apellidos || ''}`.trim()
            const turno = ac.horario === 'nocturno' ? 'Nocturno' : 'Diurno'
            // Evitar duplicados
            if (!conductores.find(c => c.id === ac.conductor_id)) {
              conductores.push({ id: ac.conductor_id, nombre, turno })
            }
          }
        }
      }
    }

    // Construir HTML del selector de conductores
    let conductoresHtml = ''
    if (conductores.length > 1) {
      conductoresHtml = `
        <div style="margin: 12px 0;">
          <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 8px;">¿Quién devuelve el vehículo?</label>
          ${conductores.map((c, i) => `
            <label style="display: flex; align-items: center; gap: 8px; padding: 8px; border: 1px solid #E5E7EB; border-radius: 6px; margin-bottom: 6px; cursor: pointer;">
              <input type="radio" name="conductor-devolucion" value="${i}" ${i === 0 ? 'checked' : ''} style="width: 16px; height: 16px;">
              <span style="font-size: 13px;"><strong>${c.turno}:</strong> ${c.nombre}</span>
            </label>
          `).join('')}
        </div>
      `
    } else if (conductores.length === 1) {
      conductoresHtml = `<p><strong>Conductor:</strong> ${conductores[0].nombre}</p>`
    }

    const result = await Swal.fire({
      title: 'Confirmar Devolución',
      html: `
        <div style="text-align: left; font-size: 14px;">
          <p><strong>Vehículo:</strong> ${asig.vehiculos?.patente || 'N/A'}</p>
          ${conductoresHtml}
          <p style="margin-top: 10px; color: #6B7280; font-size: 12px;">
            El vehículo pasará a estado <strong>PKG ON BASE</strong> y se finalizará la asignación activa.
          </p>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#10B981',
      confirmButtonText: 'Confirmar Devolución',
      cancelButtonText: 'Cancelar',
      width: 440,
      preConfirm: () => {
        if (conductores.length > 1) {
          const selected = document.querySelector('input[name="conductor-devolucion"]:checked') as HTMLInputElement
          return { conductorIndex: parseInt(selected?.value || '0') }
        }
        return { conductorIndex: 0 }
      }
    })

    if (!result.isConfirmed) return

    const selectedConductor = conductores.length > 0
      ? conductores[result.value?.conductorIndex || 0]
      : null

    setIsSubmitting(true)
    try {
      const ahora = new Date().toISOString()

      // 1. Marcar devolución como completada con el conductor seleccionado
      await (supabase as any)
        .from('devoluciones')
        .update({
          estado: 'completado',
          fecha_devolucion: ahora,
          conductor_id: selectedConductor?.id || null,
          conductor_nombre: selectedConductor?.nombre || null,
        })
        .eq('id', asig.devolucionId)

      // 2. Finalizar asignaciones activas del vehículo
      const { data: asignacionesPrevias } = await (supabase as any)
        .from('asignaciones')
        .select('id')
        .eq('vehiculo_id', asig.vehiculo_id)
        .in('estado', ['activa', 'activo'])

      if (asignacionesPrevias && asignacionesPrevias.length > 0) {
        for (const asigPrevia of asignacionesPrevias) {
          await (supabase as any)
            .from('asignaciones_conductores')
            .update({ estado: 'completado', fecha_fin: ahora })
            .eq('asignacion_id', asigPrevia.id)
            .in('estado', ['asignado', 'activo'])

          await (supabase as any)
            .from('asignaciones')
            .update({ estado: 'finalizada', fecha_fin: ahora, notas: `Finalizada por devolución de vehículo` })
            .eq('id', asigPrevia.id)
        }
      }

      // 3. Cambiar estado del vehículo a PKG_ON_BASE
      const { data: estadoPkgOn } = await supabase
        .from('vehiculos_estados')
        .select('id')
        .eq('codigo', 'PKG_ON_BASE')
        .single() as { data: { id: string } | null }

      if (estadoPkgOn && asig.vehiculo_id) {
        await (supabase as any)
          .from('vehiculos')
          .update({ estado_id: estadoPkgOn.id })
          .eq('id', asig.vehiculo_id)
      }

      showSuccess('Devolución Confirmada', `${asig.vehiculos?.patente} ahora está en PKG ON BASE`)

      // Historial: vehículo devuelto
      if (asig.vehiculo_id) {
        registrarHistorialVehiculo({
          vehiculoId: asig.vehiculo_id,
          tipoEvento: 'devolucion',
          estadoNuevo: 'PKG_ON_BASE',
          detalles: { patente: asig.vehiculos?.patente, codigo: asig.codigo },
          modulo: 'asignaciones',
          sedeId: sedeActualId,
        })
      }
      // Historial: conductores completados por devolución
      for (const cond of conductores) {
        registrarHistorialConductor({
          conductorId: cond.id,
          tipoEvento: 'devolucion',
          detalles: { patente: asig.vehiculos?.patente, codigo: asig.codigo, nombre: cond.nombre },
          modulo: 'asignaciones',
          sedeId: sedeActualId,
        })
      }

      loadAsignaciones()
    } catch (err: any) {
      Swal.fire('Error', err.message || 'Error al confirmar devolución', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (isSubmitting || !canDelete) return

    const result = await Swal.fire({
      title: '¿Eliminar asignación?',
      text: 'Esta acción eliminará la asignación permanentemente. Si fue creada desde Programaciones, podrás enviarla nuevamente.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ff0033',
      cancelButtonColor: '#6B7280',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    })

    if (!result.isConfirmed) return

    setIsSubmitting(true)
    try {
      const asignacion = asignaciones.find(a => a.id === id)

      // 1. Limpiar referencia en programaciones_onboarding (si existe)
      // Esto permite re-enviar la programacion despues de eliminar la asignacion
      const { error: progError } = await (supabase as any)
        .from('programaciones_onboarding')
        .update({ asignacion_id: null, fecha_asignacion_creada: null })
        .eq('asignacion_id', id)
        .select('id')

      if (progError) {
        // silently ignored
      }

      // 2. Eliminar conductores asociados
      const { error: conductoresError } = await (supabase as any)
        .from('asignaciones_conductores')
        .delete()
        .eq('asignacion_id', id)

      if (conductoresError) {
        // silently ignored
      }

      // 3. Eliminar la asignación
      const { error: asignacionError } = await (supabase as any)
        .from('asignaciones')
        .delete()
        .eq('id', id)
      if (asignacionError) throw asignacionError

      // 4. Cambiar estado del vehículo a PKG_ON_BASE
      if (asignacion?.vehiculo_id) {
        const { data: estadoPkgOn } = await supabase
          .from('vehiculos_estados')
          .select('id')
          .eq('codigo', 'PKG_ON_BASE')
          .single() as { data: { id: string } | null }

        if (estadoPkgOn) {
          await (supabase as any).from('vehiculos').update({ estado_id: estadoPkgOn.id }).eq('id', asignacion.vehiculo_id)
        }
      }

      showSuccess('Eliminado', 'La asignación ha sido eliminada. Puedes re-enviar desde Programaciones.')

      // Historial: asignación eliminada
      if (asignacion?.vehiculo_id) {
        registrarHistorialVehiculo({
          vehiculoId: asignacion.vehiculo_id,
          tipoEvento: 'eliminacion_asignacion',
          estadoNuevo: 'PKG_ON_BASE',
          detalles: { patente: asignacion.vehiculos?.patente, codigo: asignacion.codigo },
          modulo: 'asignaciones',
          sedeId: sedeActualId,
        })
      }

      loadAsignaciones()
    } catch (err: any) {
      Swal.fire('Error', err.message || 'Error al eliminar la asignación', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleConfirmProgramacion = async () => {
    if (isSubmitting || !selectedAsignacion || conductoresToConfirm.length === 0) return

    // Si es devolución, usar flujo especial
    if (selectedAsignacion.motivo === 'devolucion_vehiculo') {
      setIsSubmitting(true)
      try {
        const ahora = new Date().toISOString()

        // 1. Confirmar conductores
        await (supabase as any)
          .from('asignaciones_conductores')
          .update({ confirmado: true, fecha_confirmacion: ahora, estado: 'completado', fecha_fin: ahora })
          .in('id', conductoresToConfirm)

        // 2. Finalizar asignaciones activas del vehículo (incluida esta)
        const { data: asignacionesVehiculo } = await (supabase as any)
          .from('asignaciones')
          .select('id, notas')
          .eq('vehiculo_id', selectedAsignacion.vehiculo_id)
          .in('estado', ['activa', 'activo', 'programado'])

        if (asignacionesVehiculo) {
          for (const asig of asignacionesVehiculo as any[]) {
            await (supabase as any)
              .from('asignaciones_conductores')
              .update({ estado: 'completado', fecha_fin: ahora })
              .eq('asignacion_id', asig.id)
              .in('estado', ['asignado', 'activo'])

            await (supabase as any)
              .from('asignaciones')
              .update({
                estado: 'finalizada',
                fecha_inicio: asig.id === selectedAsignacion.id ? ahora : undefined,
                fecha_fin: ahora,
                notas: (asig.notas || '') + `\n[DEVOLUCIÓN ${new Date().toLocaleDateString('es-AR')}] Vehículo devuelto a base.`,
                updated_by: profile?.full_name || 'Sistema'
              })
              .eq('id', asig.id)
          }
        }

        // 3. Cambiar vehículo a PKG_ON_BASE
        const { data: estadoPkgOn } = await supabase
          .from('vehiculos_estados')
          .select('id')
          .eq('codigo', 'PKG_ON_BASE')
          .single() as { data: { id: string } | null }

        if (estadoPkgOn && selectedAsignacion.vehiculo_id) {
          await (supabase as any)
            .from('vehiculos')
            .update({ estado_id: estadoPkgOn.id })
            .eq('id', selectedAsignacion.vehiculo_id)
        }

        showSuccess('Devolución Confirmada', `${selectedAsignacion.vehiculos?.patente} ahora está en PKG ON BASE`)

        // Historial: vehículo devuelto (programacion)
        if (selectedAsignacion.vehiculo_id) {
          registrarHistorialVehiculo({
            vehiculoId: selectedAsignacion.vehiculo_id,
            tipoEvento: 'devolucion',
            estadoNuevo: 'PKG_ON_BASE',
            detalles: { patente: selectedAsignacion.vehiculos?.patente, codigo: selectedAsignacion.codigo },
            modulo: 'asignaciones',
            sedeId: sedeActualId,
          })
        }
        // Historial: conductores completados por devolución
        if (selectedAsignacion.asignaciones_conductores) {
          for (const ac of selectedAsignacion.asignaciones_conductores) {
            if (ac.conductor_id) {
              registrarHistorialConductor({
                conductorId: ac.conductor_id,
                tipoEvento: 'devolucion',
                detalles: {
                  patente: selectedAsignacion.vehiculos?.patente,
                  codigo: selectedAsignacion.codigo,
                  nombre: ac.conductores ? `${ac.conductores.nombres} ${ac.conductores.apellidos}`.trim() : undefined,
                },
                modulo: 'asignaciones',
                sedeId: sedeActualId,
              })
            }
          }
        }

        setShowConfirmModal(false)
        setSelectedAsignacion(null)
        setConductoresToConfirm([])
        loadAsignaciones()
      } catch (err: any) {
        Swal.fire('Error', err.message || 'Error al confirmar devolución', 'error')
      } finally {
        setIsSubmitting(false)
      }
      return
    }

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
          // Identificar conductores nuevos (los que NO son companero)
          const conductoresNuevos = (allConductores as any)?.filter((c: any) => !companeroIds.has(c.conductor_id)) || []

          // IMPORTANTE: Finalizar participaciones anteriores de los conductores NUEVOS
          // (igual que en la lógica normal, para que dejen vacante su turno anterior)
          for (const conductorNuevo of conductoresNuevos) {
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
            .in('estado', ['activa', 'activo'])
            .neq('id', selectedAsignacion.id)
            .single()

          if (asignacionExistente) {
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
                mensajeHtml += `<p style="margin:0;color:#ff0033;"><strong>⚠️ Ese turno está ocupado por ${conflicto.conductorActual.nombre}</strong></p>`
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
              const reemplazosTraza: string[] = []
              for (const conflicto of conflictos) {
                await (supabase as any)
                  .from('asignaciones_conductores')
                  .update({ estado: 'completado', fecha_fin: ahora })
                  .eq('id', conflicto.conductorActual.asignacionConductorId)
                reemplazosTraza.push(`${conflicto.conductorActual.nombre} reemplazado por ${conflicto.conductorNuevo.nombre} en turno ${conflicto.turno}`)

                // Historial: conductor reemplazado completado
                registrarHistorialConductor({
                  conductorId: conflicto.conductorActual.id,
                  tipoEvento: 'asignacion_completada',
                  detalles: {
                    patente: selectedAsignacion.vehiculos?.patente,
                    codigo: selectedAsignacion.codigo,
                    reemplazadoPor: conflicto.conductorNuevo.nombre,
                    flujo: 'companero',
                  },
                  modulo: 'asignaciones',
                  sedeId: sedeActualId,
                })
              }
              // Agregar traza de reemplazos a la asignación existente
              if (reemplazosTraza.length > 0) {
                const { data: asigExData } = await (supabase as any)
                  .from('asignaciones')
                  .select('notas')
                  .eq('id', asignacionExistente.id)
                  .single()
                const notasExistentes = asigExData?.notas || ''
                const trazaReemplazo = `\n[REEMPLAZO ${new Date().toLocaleDateString('es-AR')}] ${reemplazosTraza.join('; ')}`
                await (supabase as any)
                  .from('asignaciones')
                  .update({ notas: notasExistentes + trazaReemplazo, updated_by: profile?.full_name || 'Sistema' })
                  .eq('id', asignacionExistente.id)
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

          showSuccess('Confirmado', 'Los conductores nuevos fueron agregados a la asignación existente.')

          // Historial: nuevos conductores asignados (companero flow)
          for (const conductorNuevo of conductoresNuevos) {
            registrarHistorialConductor({
              conductorId: conductorNuevo.conductor_id,
              tipoEvento: 'asignacion_activada',
              estadoNuevo: 'activo',
              detalles: { patente: selectedAsignacion.vehiculos?.patente, codigo: selectedAsignacion.codigo, flujo: 'companero' },
              modulo: 'asignaciones',
              sedeId: sedeActualId,
            })
          }

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

          // 2. Cerrar asignaciones activas anteriores del mismo vehículo
          const { data: asignacionesVehiculo } = await (supabase as any)
            .from('asignaciones')
            .select(`id, codigo, notas,
              asignaciones_conductores(conductor_id, estado, horario,
                conductores(nombres, apellidos)
              )
            `)
            .eq('vehiculo_id', selectedAsignacion.vehiculo_id)
            .in('estado', ['activa', 'activo'])
            .neq('id', selectedAsignacion.id)

          if (asignacionesVehiculo && asignacionesVehiculo.length > 0) {
            const idsACerrar = asignacionesVehiculo.map((a: any) => a.id)
            // Finalizar conductores de esas asignaciones
            await (supabase as any)
              .from('asignaciones_conductores')
              .update({ estado: 'completado', fecha_fin: ahora })
              .in('asignacion_id', idsACerrar)
              .in('estado', ['asignado', 'activo'])
            // Finalizar las asignaciones con traza de conductores
            for (const asigAnterior of asignacionesVehiculo as any[]) {
              // Capturar TODOS los conductores para trazabilidad (no solo activos)
              const conductoresAnteriores = (asigAnterior.asignaciones_conductores || [])
                .map((ac: any) => {
                  const nombre = ac.conductores ? `${ac.conductores.nombres || ''} ${ac.conductores.apellidos || ''}`.trim() : 'Desconocido'
                  return `${nombre} (${ac.horario || 'sin turno'})`
                })
              const notasAnterior = asigAnterior.notas || ''
              const traza = `\n[AUTO-CERRADA ${new Date().toLocaleDateString('es-AR')}] Nuevo turno activado para el mismo vehículo.\nConductores al cierre: ${conductoresAnteriores.length > 0 ? conductoresAnteriores.join(', ') : 'ninguno'}`
              await (supabase as any)
                .from('asignaciones')
                .update({
                  estado: 'finalizada',
                  fecha_fin: ahora,
                  notas: notasAnterior + traza,
                  updated_by: profile?.full_name || 'Sistema'
                })
                .eq('id', asigAnterior.id)
            }
          }

          // 3. Verificar si alguna otra asignación quedó sin conductores activos y finalizarla
          const { data: asignacionesSinConductores } = await (supabase as any)
            .from('asignaciones')
            .select(`
              id, notas,
              asignaciones_conductores(conductor_id, estado, horario,
                conductores(nombres, apellidos)
              )
            `)
            .in('estado', ['activa', 'activo'])
            .neq('id', selectedAsignacion.id)

          if (asignacionesSinConductores) {
            for (const asig of asignacionesSinConductores as any[]) {
              const conductoresActivos = asig.asignaciones_conductores?.filter(
                (ac: any) => ac.estado === 'asignado' || ac.estado === 'activo'
              ) || []

              if (conductoresActivos.length === 0) {
                const conductoresCompletados = (asig.asignaciones_conductores || [])
                  .filter((ac: any) => ac.estado === 'completado' || ac.estado === 'finalizado')
                  .map((ac: any) => {
                    const nombre = ac.conductores ? `${ac.conductores.nombres || ''} ${ac.conductores.apellidos || ''}`.trim() : 'Desconocido'
                    return `${nombre} (${ac.horario || 'sin turno'})`
                  })
                const notasAnterior = asig.notas || ''
                const traza = `\n[AUTO-CERRADA ${new Date().toLocaleDateString('es-AR')}] Sin conductores activos.\nUltimos conductores: ${conductoresCompletados.length > 0 ? conductoresCompletados.join(', ') : 'ninguno'}`
                await (supabase as any)
                  .from('asignaciones')
                  .update({
                    estado: 'finalizada',
                    fecha_fin: ahora,
                    notas: notasAnterior + traza,
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

          // Si es cambio de vehículo: verificar si el vehículo viejo tiene asignaciones activas antes de cambiar estado
          if (selectedAsignacion?.motivoDetalle?.cambioVehiculo && selectedAsignacion?.motivoDetalle?.vehiculoCambioId) {
            const vehiculoViejoId = selectedAsignacion.motivoDetalle!.vehiculoCambioId

            // Consultar si el vehículo viejo todavía tiene asignaciones activas
            const { count: asignacionesActivas } = await supabase
              .from('asignaciones_conductores')
              .select('id', { count: 'exact', head: true })
              .eq('vehiculo_id', vehiculoViejoId)
              .eq('estado', 'activo')

            if ((asignacionesActivas || 0) === 0) {
              // Sin asignaciones activas → ponerlo como disponible
              const { data: estadoPkgOn } = await supabase
                .from('vehiculos_estados')
                .select('id')
                .eq('codigo', 'PKG_ON_BASE')
                .single()

              if (estadoPkgOn) {
                await (supabase
                  .from('vehiculos') as any)
                  .update({ estado_id: (estadoPkgOn as any).id })
                  .eq('id', vehiculoViejoId)
              }
            }
            // Si tiene asignaciones activas → se deja en EN_USO (no se modifica)
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

          showSuccess('Confirmado', 'Todos los conductores han confirmado. La asignación está ACTIVA.')

          // Historial: asignación activada - vehículo EN_USO
          if (selectedAsignacion.vehiculo_id) {
            registrarHistorialVehiculo({
              vehiculoId: selectedAsignacion.vehiculo_id,
              tipoEvento: 'asignacion_activada',
              estadoNuevo: 'EN_USO',
              detalles: { patente: selectedAsignacion.vehiculos?.patente, codigo: selectedAsignacion.codigo },
              modulo: 'asignaciones',
              sedeId: sedeActualId,
            })
          }
          // Historial: conductores activados
          for (const conductorId of conductoresIds) {
            registrarHistorialConductor({
              conductorId,
              tipoEvento: 'asignacion_activada',
              estadoNuevo: 'activo',
              detalles: { patente: selectedAsignacion.vehiculos?.patente, codigo: selectedAsignacion.codigo },
              modulo: 'asignaciones',
              sedeId: sedeActualId,
            })
          }
          // Historial: conductores de asignaciones anteriores del vehículo finalizados
          if (asignacionesVehiculo && asignacionesVehiculo.length > 0) {
            for (const asigAnterior of asignacionesVehiculo as any[]) {
              for (const ac of (asigAnterior.asignaciones_conductores || []) as any[]) {
                if (ac.conductor_id && (ac.estado === 'asignado' || ac.estado === 'activo' || ac.estado === 'completado')) {
                  registrarHistorialConductor({
                    conductorId: ac.conductor_id,
                    tipoEvento: 'asignacion_completada',
                    detalles: {
                      patente: selectedAsignacion.vehiculos?.patente,
                      codigoAnterior: asigAnterior.codigo,
                      codigoNuevo: selectedAsignacion.codigo,
                      motivo: 'nueva_asignacion_activada',
                    },
                    modulo: 'asignaciones',
                    sedeId: sedeActualId,
                  })
                }
              }
            }
          }
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

      // Cancelar no modifica el estado del vehículo

      showSuccess('Cancelada', 'La programación ha sido cancelada')
      // Historial: conductores cancelados
      if (selectedAsignacion.asignaciones_conductores) {
        for (const ac of selectedAsignacion.asignaciones_conductores) {
          if (ac.conductor_id) {
            registrarHistorialConductor({
              conductorId: ac.conductor_id,
              tipoEvento: 'asignacion_cancelada',
              detalles: {
                patente: selectedAsignacion.vehiculos?.patente,
                codigo: selectedAsignacion.codigo,
                motivo: cancelMotivo,
              },
              modulo: 'asignaciones',
              sedeId: sedeActualId,
            })
          }
        }
      }

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

      showSuccess('Actualizado', 'El conductor ha sido desconfirmado.')
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

    const esDevolucionVirtual = !!(asignacion as any).esDevolucion

    // Cargar vehículos, conductores disponibles Y conductores de esta asignación
    const queries: [any, any, any] = [
      aplicarFiltroSede(supabase.from('vehiculos').select('id, patente, marca, modelo, vehiculos_estados(codigo)').is('deleted_at', null)).order('patente'),
      aplicarFiltroSede(supabase.from('conductores').select('id, nombres, apellidos')).order('apellidos'),
      // Para devoluciones el ID es de la tabla devoluciones, no de asignaciones
      // Buscar conductores desde la asignación real del vehículo
      esDevolucionVirtual && asignacion.vehiculo_id
        ? (supabase as any).from('asignaciones')
            .select('asignaciones_conductores(conductor_id, horario, estado, documento, conductores(nombres, apellidos))')
            .eq('vehiculo_id', asignacion.vehiculo_id)
            .in('estado', ['activa', 'activo', 'completada', 'finalizada'])
            .order('created_at', { ascending: false })
            .limit(3)
        : supabase.from('asignaciones_conductores').select('conductor_id, horario, estado, documento').eq('asignacion_id', asignacion.id)
    ]

    const [vehiculosRes, conductoresRes, asignacionConductoresRes] = await Promise.all(queries)

    // Filtrar solo vehículos disponibles o el vehículo actual de la asignación
    const estadosDisponibles = ['PKG_ON_BASE', 'EN_USO', 'DISPONIBLE']
    const vehiculosFiltrados = (vehiculosRes.data || []).filter((v: any) =>
      estadosDisponibles.includes(v.vehiculos_estados?.codigo) || v.id === asignacion.vehiculo_id
    )

    // Si el vehículo actual no está en la lista (soft-deleted u otro estado), inyectarlo desde los datos de la fila
    if (asignacion.vehiculo_id && !vehiculosFiltrados.find((v: any) => v.id === asignacion.vehiculo_id)) {
      const vehInfo = (asignacion as any).vehiculos
      if (vehInfo) {
        vehiculosFiltrados.unshift({ id: asignacion.vehiculo_id, patente: vehInfo.patente || '', marca: vehInfo.marca || '', modelo: vehInfo.modelo || '' })
      }
    }

    setVehiculosDisponibles(vehiculosFiltrados)
    setConductoresDisponibles(conductoresRes.data || [])

    // Para devoluciones: consultar datos propios de la tabla devoluciones (conductor_id, conductor_nombre)
    // y usarlos como fuente principal; asignaciones del vehículo solo como fallback
    let devConductorId: string | null = null
    let devConductorNombre: string | null = null
    if (esDevolucionVirtual) {
      const devId = (asignacion as any).devolucionId || asignacion.id
      const { data: devData } = await (supabase as any)
        .from('devoluciones')
        .select('conductor_id, conductor_nombre')
        .eq('id', devId)
        .single()
      if (devData) {
        devConductorId = devData.conductor_id || null
        devConductorNombre = devData.conductor_nombre || null
      }
    }

    // Obtener conductores desde asignaciones del vehículo (fallback para devoluciones)
    let conductoresAsig: any[] = []
    if (esDevolucionVirtual) {
      const asigs = (asignacionConductoresRes.data || []) as any[]
      for (const asig of asigs) {
        const conds = (asig.asignaciones_conductores || []).filter((c: any) => c.estado !== 'cancelado')
        if (conds.length > 0) {
          conductoresAsig = conds
          break
        }
      }
    } else {
      conductoresAsig = (asignacionConductoresRes.data || []) as any[]
    }

    const esDiurno = (c: any) => c.horario === 'diurno' || c.horario === 'DIURNO' || c.horario === 'D'
    const esNocturno = (c: any) => c.horario === 'nocturno' || c.horario === 'NOCTURNO' || c.horario === 'N'
    const esCargo = (c: any) => c.horario === 'todo_dia' || c.horario === 'A CARGO' || c.horario === 'cargo'
    const esActivo = (c: any) => c.estado === 'asignado' || c.estado === 'activo'
    const esFinalizada = asignacion.estado === 'finalizada' || asignacion.estado === 'completada'
    const diurno = conductoresAsig.find(c => esDiurno(c) && esActivo(c)) || (esFinalizada ? conductoresAsig.filter(esDiurno).pop() : null)
    const nocturno = conductoresAsig.find(c => esNocturno(c) && esActivo(c)) || (esFinalizada ? conductoresAsig.filter(esNocturno).pop() : null)
    const cargo = conductoresAsig.find(c => esCargo(c) && esActivo(c)) || (esFinalizada ? conductoresAsig.filter(esCargo).pop() : null)

    // Resolver conductor para devoluciones: priorizar datos propios de devoluciones, fallback a asignaciones
    let conductorIdFinal = ''
    if (esDevolucionVirtual) {
      // 1. Datos propios de la devolución
      if (devConductorId) {
        conductorIdFinal = devConductorId
      }
      // 2. Fallback: conductor de la asignación del vehículo
      if (!conductorIdFinal) {
        if (asignacion.horario === 'todo_dia') {
          conductorIdFinal = cargo?.conductor_id || diurno?.conductor_id || ''
        } else {
          conductorIdFinal = diurno?.conductor_id || ''
        }
      }

      // Asegurar que el conductor esté en la lista disponible
      const listaActual = [...(conductoresRes.data || [])]
      const idsEnLista = new Set(listaActual.map((c: any) => c.id))

      // Inyectar conductor propio de la devolución si no está en la lista
      if (conductorIdFinal && !idsEnLista.has(conductorIdFinal)) {
        // Buscar nombre en conductores de asignaciones o usar el nombre de la devolución
        const condAsig = [diurno, nocturno, cargo].find(c => c?.conductor_id === conductorIdFinal)
        if (condAsig?.conductores) {
          listaActual.unshift({ id: conductorIdFinal, nombres: condAsig.conductores.nombres || '', apellidos: condAsig.conductores.apellidos || '' })
        } else if (devConductorNombre) {
          const partes = devConductorNombre.split(' ')
          listaActual.unshift({ id: conductorIdFinal, nombres: partes.slice(0, -1).join(' ') || devConductorNombre, apellidos: partes.slice(-1).join(' ') || '' })
        }
        idsEnLista.add(conductorIdFinal)
      }

      // Inyectar conductores de asignaciones que no estén en la lista
      for (const c of [diurno, nocturno, cargo].filter(Boolean)) {
        if (c?.conductor_id && !idsEnLista.has(c.conductor_id) && c.conductores) {
          listaActual.unshift({ id: c.conductor_id, nombres: c.conductores.nombres || '', apellidos: c.conductores.apellidos || '' })
          idsEnLista.add(c.conductor_id)
        }
      }

      setConductoresDisponibles(listaActual)
    }

    // Para devoluciones: tomar el documento de la fila virtual (viene de la programación)
    // Mapear al formato del select del modal: CARTA_OFERTA, ANEXO, N/A
    // Default 'N/A' para devoluciones (las devoluciones siempre tienen doc N/A)
    let docVirtual: string | null = null
    if (esDevolucionVirtual) {
      const docRaw = ((asignacion.asignaciones_conductores || [])[0] as any)?.documento || ''
      const docUpper = docRaw.toUpperCase()
      if (docUpper === 'CARTA_OFERTA') docVirtual = 'CARTA_OFERTA'
      else if (docUpper === 'ANEXO') docVirtual = 'ANEXO'
      else docVirtual = 'N/A'
    }

    setRegularizarData({
      fecha_inicio: asignacion.fecha_inicio ? asignacion.fecha_inicio.split('T')[0] : '',
      fecha_fin: asignacion.fecha_fin ? asignacion.fecha_fin.split('T')[0] : '',
      notas: asignacion.notas || '',
      vehiculo_id: asignacion.vehiculo_id || '',
      horario: asignacion.horario || 'turno',
      conductor_diurno_id: esDevolucionVirtual ? conductorIdFinal : (diurno?.conductor_id || ''),
      conductor_nocturno_id: esDevolucionVirtual ? '' : (nocturno?.conductor_id || ''),
      conductor_cargo_id: esDevolucionVirtual ? conductorIdFinal : (cargo?.conductor_id || ''),
      estado: asignacion.estado || 'programado',
      documento_diurno: docVirtual ?? (diurno?.documento || ''),
      documento_nocturno: docVirtual != null ? '' : (nocturno?.documento || ''),
      documento_cargo: docVirtual ?? (cargo?.documento || ''),
      sede_id: (asignacion as any).sede_id || '',
    })

    // Reset search states
    setSearchDiurno('')
    setSearchNocturno('')
    setSearchVehiculo('')
    setSearchCargo('')
    setShowDropdownVehiculo(false)
    setShowDropdownDiurno(false)
    setShowDropdownNocturno(false)
    setShowDropdownCargo(false)

    setLoadingRegularizar(false)
  }

  // Guardar regularización con trazabilidad (optimizado: queries en paralelo)
  const handleSaveRegularizacion = async () => {
    if (!regularizarAsignacion || isSubmitting) return

    // Flujo separado para devoluciones virtuales (tabla devoluciones, no asignaciones)
    if ((regularizarAsignacion as any).esDevolucion) {
      setIsSubmitting(true)
      try {
        const devId = (regularizarAsignacion as any).devolucionId || regularizarAsignacion.id
        const usuario = profile?.full_name || 'Sistema'

        // Resolver nombre del conductor seleccionado
        const conductorId = regularizarData.horario === 'todo_dia'
          ? regularizarData.conductor_cargo_id
          : regularizarData.conductor_diurno_id
        const conductorInfo = conductorId ? conductoresDisponibles.find((c: any) => c.id === conductorId) : null
        const conductorNombre = conductorInfo ? `${conductorInfo.nombres || ''} ${conductorInfo.apellidos || ''}`.trim() : (regularizarAsignacion as any)._conductorNombre || null

        const devUpdate: Record<string, unknown> = {
          vehiculo_id: regularizarData.vehiculo_id || regularizarAsignacion.vehiculo_id,
          conductor_id: conductorId || null,
          conductor_nombre: conductorNombre,
          estado: regularizarData.estado === 'finalizada' || regularizarData.estado === 'completada' ? 'completado' : regularizarData.estado === 'cancelada' ? 'cancelado' : 'pendiente',
          observaciones: regularizarData.notas || null,
          fecha_programada: regularizarData.fecha_inicio ? new Date(regularizarData.fecha_inicio + 'T12:00:00').toISOString() : undefined,
          fecha_devolucion: regularizarData.fecha_fin ? new Date(regularizarData.fecha_fin + 'T12:00:00').toISOString() : null,
          sede_id: regularizarData.sede_id || undefined,
        }
        // Remover campos undefined
        Object.keys(devUpdate).forEach(k => devUpdate[k] === undefined && delete devUpdate[k])

        const { error: devError } = await (supabase as any).from('devoluciones').update(devUpdate).eq('id', devId)
        if (devError) throw devError

        // Persistir documento en programaciones_onboarding (es donde se lee al cargar la tabla)
        const docModal = regularizarData.horario === 'todo_dia'
          ? regularizarData.documento_cargo
          : regularizarData.documento_diurno
        if (docModal) {
          // Mapear formato del modal (CARTA_OFERTA, ANEXO, N/A) al formato de programación (carta_oferta, anexo, na)
          const docDB = docModal === 'CARTA_OFERTA' ? 'carta_oferta' : docModal === 'ANEXO' ? 'anexo' : 'na'
          // Obtener programacion_id de la devolución
          const { data: devRow } = await (supabase as any)
            .from('devoluciones')
            .select('programacion_id')
            .eq('id', devId)
            .single()
          if (devRow?.programacion_id) {
            await (supabase as any)
              .from('programaciones_onboarding')
              .update({ tipo_documento: docDB, documento_diurno: docDB, documento_nocturno: docDB })
              .eq('id', devRow.programacion_id)
          }
        }

        showSuccess('Devolución Editada', `Datos actualizados por ${usuario}`)
        setShowRegularizarModal(false)
        setRegularizarAsignacion(null)
        loadAsignaciones()
      } catch (err: any) {
        Swal.fire('Error', err.message || 'Error al editar la devolución', 'error')
      } finally {
        setIsSubmitting(false)
      }
      return
    }

    setIsSubmitting(true)
    try {
      const ahora = new Date().toISOString()
      const fechaHoy = new Date().toLocaleDateString('es-AR')
      const usuario = profile?.full_name || 'Sistema'

      // ==========================================
      // 1. Construir traza de cambios (sin query extra, usa datos de asignacion_conductores ya cargados)
      // ==========================================
      const cambios: string[] = []
      const conductoresAsig = (regularizarAsignacion.asignaciones_conductores || []) as any[]
      const esAsigFinalizada = regularizarAsignacion.estado === 'finalizada' || regularizarAsignacion.estado === 'completada'
      const esActivoCond = (c: any) => c.estado === 'asignado' || c.estado === 'activo' || (esAsigFinalizada && c.estado === 'completado')

      // Detectar cambio de vehículo
      if (regularizarData.vehiculo_id && regularizarData.vehiculo_id !== regularizarAsignacion.vehiculo_id) {
        const vehiculoAnterior = vehiculosDisponibles.find(v => v.id === regularizarAsignacion.vehiculo_id)
        const vehiculoNuevo = vehiculosDisponibles.find(v => v.id === regularizarData.vehiculo_id)
        cambios.push(`Vehículo: ${vehiculoAnterior?.patente || 'Desconocido'} → ${vehiculoNuevo?.patente || 'Desconocido'}`)
      }

      // Detectar cambio de modalidad
      if (regularizarData.horario && regularizarData.horario !== regularizarAsignacion.horario) {
        cambios.push(`Modalidad: ${regularizarAsignacion.horario} → ${regularizarData.horario}`)
      }

      // Detectar cambio de estado
      if (regularizarData.estado && regularizarData.estado !== regularizarAsignacion.estado) {
        cambios.push(`Estado: ${regularizarAsignacion.estado} → ${regularizarData.estado}`)
      }

      // Detectar cambios de conductores usando Map O(1)
      const getNombreConductor = (id: string) => {
        return getConductorDisplay(id) || 'Desconocido'
      }
      const getAnterior = (horarioFiltro: string[]) => {
        const c = conductoresAsig.find((ac: any) => horarioFiltro.includes(ac.horario) && esActivoCond(ac))
        return c ? { id: c.conductor_id, nombre: c.conductores ? `${c.conductores.apellidos || ''}, ${c.conductores.nombres || ''}`.trim() : 'Desconocido' } : null
      }

      if (regularizarData.horario === 'turno') {
        const diurnoAnt = getAnterior(['diurno', 'DIURNO', 'D'])
        const nocturnoAnt = getAnterior(['nocturno', 'NOCTURNO', 'N'])
        if (regularizarData.conductor_diurno_id !== (diurnoAnt?.id || '')) {
          cambios.push(`Diurno: ${diurnoAnt?.nombre || 'Vacante'} → ${regularizarData.conductor_diurno_id ? getNombreConductor(regularizarData.conductor_diurno_id) : 'Vacante'}`)
        }
        if (regularizarData.conductor_nocturno_id !== (nocturnoAnt?.id || '')) {
          cambios.push(`Nocturno: ${nocturnoAnt?.nombre || 'Vacante'} → ${regularizarData.conductor_nocturno_id ? getNombreConductor(regularizarData.conductor_nocturno_id) : 'Vacante'}`)
        }
      } else if (regularizarData.horario === 'todo_dia') {
        const cargoAnt = getAnterior(['todo_dia', 'A CARGO', 'cargo'])
        if (regularizarData.conductor_cargo_id !== (cargoAnt?.id || '')) {
          cambios.push(`Conductor: ${cargoAnt?.nombre || 'Sin asignar'} → ${regularizarData.conductor_cargo_id ? getNombreConductor(regularizarData.conductor_cargo_id) : 'Sin asignar'}`)
        }
      }

      // ==========================================
      // 2. Construir datos de actualización
      // ==========================================
      const updateData: Record<string, unknown> = {
        updated_by: usuario
      }

      if (regularizarData.fecha_inicio) {
        // Solo actualizar fecha_inicio si cambió (comparar solo la parte de fecha, no la hora)
        const fechaOriginal = regularizarAsignacion.fecha_inicio ? regularizarAsignacion.fecha_inicio.split('T')[0] : ''
        if (regularizarData.fecha_inicio !== fechaOriginal) {
          updateData.fecha_inicio = new Date(regularizarData.fecha_inicio + 'T12:00:00').toISOString()
        }
      }
      updateData.fecha_fin = regularizarData.fecha_fin 
        ? new Date(regularizarData.fecha_fin + 'T12:00:00').toISOString() 
        : null
      if (regularizarData.vehiculo_id && regularizarData.vehiculo_id !== regularizarAsignacion.vehiculo_id) {
        updateData.vehiculo_id = regularizarData.vehiculo_id
      }
      if (regularizarData.horario && regularizarData.horario !== regularizarAsignacion.horario) {
        updateData.horario = regularizarData.horario
      }
      if (regularizarData.estado && regularizarData.estado !== regularizarAsignacion.estado) {
        updateData.estado = regularizarData.estado
      }
      if (regularizarData.sede_id) {
        updateData.sede_id = regularizarData.sede_id
      }

      // Agregar traza de cambios a las notas
      const notasBase = regularizarData.notas || regularizarAsignacion.notas || ''
      if (cambios.length > 0) {
        const traza = `\n[EDITADO ${fechaHoy} por ${usuario}] ${cambios.join(' | ')}`
        updateData.notas = notasBase + traza
      } else if (regularizarData.notas !== regularizarAsignacion.notas) {
        updateData.notas = regularizarData.notas
      }

      // ==========================================
      // 3. Ejecutar UPDATE asignacion + soft-delete + INSERT conductores EN PARALELO
      // ==========================================
      const estadoConductorNuevo = (regularizarData.estado === 'activa' || regularizarData.estado === 'activo') ? 'activo' : 'asignado'
      const nuevoConductores: any[] = []

      if (regularizarData.horario === 'turno') {
        if (regularizarData.conductor_diurno_id) {
          nuevoConductores.push({
            asignacion_id: regularizarAsignacion.id,
            conductor_id: regularizarData.conductor_diurno_id,
            horario: 'diurno',
            estado: estadoConductorNuevo,
            documento: regularizarData.documento_diurno || 'N/A'
          })
        }
        if (regularizarData.conductor_nocturno_id) {
          nuevoConductores.push({
            asignacion_id: regularizarAsignacion.id,
            conductor_id: regularizarData.conductor_nocturno_id,
            horario: 'nocturno',
            estado: estadoConductorNuevo,
            documento: regularizarData.documento_nocturno || 'N/A'
          })
        }
      } else if (regularizarData.horario === 'todo_dia') {
        if (regularizarData.conductor_cargo_id) {
          nuevoConductores.push({
            asignacion_id: regularizarAsignacion.id,
            conductor_id: regularizarData.conductor_cargo_id,
            horario: 'todo_dia',
            estado: estadoConductorNuevo,
            documento: regularizarData.documento_cargo || 'N/A'
          })
        }
      }

      // Verificar si los conductores realmente cambiaron antes de recrearlos
      // Consultar estado REAL de la BD (no confiar en datos locales que pueden estar desactualizados)
      const { data: conductoresActualesBD } = await (supabase as any)
        .from('asignaciones_conductores')
        .select('id, conductor_id, horario, estado, documento')
        .eq('asignacion_id', regularizarAsignacion.id)
        .in('estado', esAsigFinalizada ? ['asignado', 'activo', 'completado'] : ['asignado', 'activo'])
      const conductoresActuales = (conductoresActualesBD || []) as any[]

      // Comparar conductor_id + horario (case-insensitive) para detectar cambios reales
      const conductoresCambiaron = conductoresActuales.length !== nuevoConductores.length ||
        nuevoConductores.some((n: any) => {
          const actual = conductoresActuales.find((a: any) =>
            a.conductor_id === n.conductor_id &&
            a.horario?.toLowerCase() === n.horario?.toLowerCase()
          )
          return !actual
        })

      // UPDATE asignacion
      const { error: updateError2 } = await (supabase as any).from('asignaciones').update(updateData).eq('id', regularizarAsignacion.id)
      if (updateError2) throw updateError2

      // Solo recrear conductores si cambiaron
      if (conductoresCambiaron && nuevoConductores.length > 0) {
        // Identificar conductores que se mantienen (mismo conductor_id, sin importar horario)
        const conductoresQueSeQuedan = conductoresActuales.filter((a: any) =>
          nuevoConductores.find((n: any) => n.conductor_id === a.conductor_id)
        )
        const conductoresAReemplazar = conductoresActuales.filter((a: any) =>
          !nuevoConductores.find((n: any) => n.conductor_id === a.conductor_id)
        )

        // Soft-delete todos los que no se mantienen
        if (conductoresAReemplazar.length > 0) {
          const idsAReemplazar = conductoresAReemplazar.map((c: any) => c.id)
          const { error: softDeleteError } = await (supabase as any)
            .from('asignaciones_conductores')
            .update({ estado: 'reemplazado', fecha_fin: ahora })
            .in('id', idsAReemplazar)
          if (softDeleteError) throw softDeleteError
        }

        // Para los que se quedan: actualizar horario y documento si cambiaron
        for (const actual of conductoresQueSeQuedan) {
          const nuevo = nuevoConductores.find((n: any) => n.conductor_id === actual.conductor_id)
          if (nuevo && (actual.horario?.toLowerCase() !== nuevo.horario?.toLowerCase() || actual.documento !== nuevo.documento)) {
            await (supabase as any)
              .from('asignaciones_conductores')
              .update({ horario: nuevo.horario, documento: nuevo.documento, estado: nuevo.estado })
              .eq('id', actual.id)
          }
        }

        // Si A CARGO tiene duplicados que se quedaron, soft-delete los extras (dejar solo el más reciente)
        if (regularizarData.horario === 'todo_dia' && conductoresQueSeQuedan.length > 1) {
          const extras = conductoresQueSeQuedan.slice(0, -1)
          const idsExtras = extras.map((c: any) => c.id)
          await (supabase as any)
            .from('asignaciones_conductores')
            .update({ estado: 'reemplazado', fecha_fin: ahora })
            .in('id', idsExtras)
        }

        // Solo insertar conductores que no existen en BD (por conductor_id)
        const idsQueSeQuedan = new Set(conductoresQueSeQuedan.map((c: any) => c.conductor_id))
        const conductoresAInsertar = nuevoConductores.filter((n: any) => !idsQueSeQuedan.has(n.conductor_id))
        if (conductoresAInsertar.length > 0) {
          const { error: insertError } = await (supabase.from('asignaciones_conductores') as any).insert(conductoresAInsertar)
          if (insertError) throw insertError
        }
      } else if (!conductoresCambiaron) {
        // Conductores no cambiaron - solo actualizar documento si cambió
        for (const ac of conductoresActuales) {
          const nuevo = nuevoConductores.find((n: any) => n.conductor_id === ac.conductor_id)
          if (nuevo && nuevo.documento !== ac.documento) {
            await (supabase as any)
              .from('asignaciones_conductores')
              .update({ documento: nuevo.documento })
              .eq('id', ac.id)
          }
        }
      }

      showSuccess('Regularizado', 'Los datos de la asignación han sido actualizados correctamente.')

      // Historial: regularización del vehículo
      if (regularizarAsignacion.vehiculo_id) {
        registrarHistorialVehiculo({
          vehiculoId: regularizarAsignacion.vehiculo_id,
          tipoEvento: 'regularizacion',
          detalles: {
            patente: regularizarAsignacion.vehiculos?.patente,
            codigo: regularizarAsignacion.codigo,
            cambios,
          },
          modulo: 'asignaciones',
          sedeId: regularizarData.sede_id || sedeActualId,
        })
      }
      // Historial: conductores anteriores completados por regularización
      for (const ac of conductoresAsig) {
        if (ac.conductor_id && esActivoCond(ac)) {
          registrarHistorialConductor({
            conductorId: ac.conductor_id,
            tipoEvento: 'regularizacion',
            detalles: {
              patente: regularizarAsignacion.vehiculos?.patente,
              codigo: regularizarAsignacion.codigo,
              cambios,
            },
            modulo: 'asignaciones',
            sedeId: regularizarData.sede_id || sedeActualId,
          })
        }
      }

      setShowRegularizarModal(false)
      setRegularizarAsignacion(null)
      loadAsignaciones()
    } catch (err: any) {
      Swal.fire('Error', err.message || 'Error al regularizar la asignación', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Activar asignación directamente cuando todos los conductores ya confirmaron
  const handleActivarAsignacionDirecta = async () => {
    if (isSubmitting || !selectedAsignacion) return
    setIsSubmitting(true)
    try {
      const ahora = new Date().toISOString()

      // Cerrar asignaciones activas anteriores del mismo vehículo
      const { data: asignacionesACerrar } = await (supabase as any)
        .from('asignaciones')
        .select(`id, codigo, notas,
          asignaciones_conductores(conductor_id, estado, horario,
            conductores(nombres, apellidos)
          )
        `)
        .eq('vehiculo_id', selectedAsignacion.vehiculo_id)
        .in('estado', ['activa', 'activo'])
        .neq('id', selectedAsignacion.id)

      if (asignacionesACerrar && asignacionesACerrar.length > 0) {
        for (const asigAnterior of asignacionesACerrar as any[]) {
          // Capturar TODOS los conductores para trazabilidad (no solo activos)
          const conductoresAnteriores = (asigAnterior.asignaciones_conductores || [])
            .map((ac: any) => {
              const nombre = ac.conductores ? `${ac.conductores.nombres || ''} ${ac.conductores.apellidos || ''}`.trim() : 'Desconocido'
              return `${nombre} (${ac.horario || 'sin turno'})`
            })
          const notasAnterior = asigAnterior.notas || ''
          const traza = `\n[AUTO-CERRADA ${new Date().toLocaleDateString('es-AR')}] Nuevo turno activado para el mismo vehículo.\nConductores al cierre: ${conductoresAnteriores.length > 0 ? conductoresAnteriores.join(', ') : 'ninguno'}`
          await (supabase as any).from('asignaciones')
            .update({ estado: 'finalizada', fecha_fin: ahora, notas: notasAnterior + traza })
            .eq('id', asigAnterior.id)
        }
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

      showSuccess('Activado', 'La asignación está ahora ACTIVA.')

      // Historial: activación directa - vehículo EN_USO
      if (selectedAsignacion.vehiculo_id) {
        registrarHistorialVehiculo({
          vehiculoId: selectedAsignacion.vehiculo_id,
          tipoEvento: 'asignacion_activada',
          estadoNuevo: 'EN_USO',
          detalles: { patente: selectedAsignacion.vehiculos?.patente, codigo: selectedAsignacion.codigo },
          modulo: 'asignaciones',
          sedeId: sedeActualId,
        })
      }
      // Historial: conductores activados
      if (selectedAsignacion.asignaciones_conductores) {
        for (const ac of selectedAsignacion.asignaciones_conductores) {
          if (ac.conductor_id) {
            registrarHistorialConductor({
              conductorId: ac.conductor_id,
              tipoEvento: 'asignacion_activada',
              estadoNuevo: 'activo',
              detalles: { patente: selectedAsignacion.vehiculos?.patente, codigo: selectedAsignacion.codigo },
              modulo: 'asignaciones',
              sedeId: sedeActualId,
            })
          }
        }
      }

      setShowConfirmModal(false)
      setConfirmComentarios('')
      setSelectedAsignacion(null)
      loadAsignaciones()
    } catch (err: any) {
      Swal.fire('Error', err.message || 'Error al activar', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Dismiss confirm modal and reset state
  const handleDismissConfirmModal = () => {
    setShowConfirmModal(false)
    setConfirmComentarios('')
    setConductoresToConfirm([])
    setSelectedAsignacion(null)
  }

  // Dismiss cancel modal and reset state
  const handleDismissCancelModal = () => {
    setShowCancelModal(false)
    setCancelMotivo('')
    setSelectedAsignacion(null)
  }

  // Dismiss view modal and reset state
  const handleDismissViewModal = () => {
    setShowViewModal(false)
    setViewAsignacion(null)
  }

  // Dismiss regularizar modal and reset state
  const handleDismissRegularizarModal = () => {
    setShowRegularizarModal(false)
    setRegularizarAsignacion(null)
  }

  // Handle unconfirm conductor from view modal
  const handleUnconfirmFromViewModal = (acId: string) => {
    Swal.fire({
      title: '¿Desconfirmar conductor?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ff0033',
      confirmButtonText: 'Sí, desconfirmar'
    }).then((result) => {
      if (result.isConfirmed) {
        handleUnconfirmConductor(acId)
        setShowViewModal(false)
        setViewAsignacion(null)
      }
    })
  }

  // Handle cancel devolucion from actions menu
  const handleCancelDevolucion = async (devolucionId: string) => {
    const res = await Swal.fire({
      title: '¿Eliminar devolución?',
      text: 'Esta acción eliminará la devolución permanentemente. Si fue creada desde Programaciones, podrás enviarla nuevamente.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ff0033',
      cancelButtonColor: '#6B7280',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    })
    if (!res.isConfirmed) return
    const { error: cancelError } = await (supabase as any).from('devoluciones').update({
      estado: 'cancelado',
      observaciones: '[ELIMINADA] Eliminada por usuario',
    }).eq('id', devolucionId)
    if (cancelError) {
      Swal.fire('Error', cancelError.message || 'Error al cancelar devolución', 'error')
      return
    }
    showSuccess('Cancelada', 'Devolución cancelada')
    loadAsignaciones()
  }

  // Handle motivo detail click in table
  const handleShowMotivoDetalle = (motivo: string, detalle: { observaciones?: string; programadoPor?: string }) => {
    const labels: Record<string, string> = {
      entrega_auto: 'Entrega de auto',
      asignacion_companero: 'Asig. compañero',
      cambio_auto: 'Cambio de auto',
      asignacion_auto_cargo: 'Asig. auto a cargo',
      entrega_auto_cargo: 'Entrega a cargo',
      cambio_turno: 'Cambio de turno',
      devolucion_vehiculo: 'Devolución',
    }
    Swal.fire({
      title: labels[motivo] || motivo,
      html: `
        <div style="text-align: left; font-size: 14px;">
          ${detalle.programadoPor ? `<p style="margin-bottom: 8px;"><strong>Programado por:</strong> ${detalle.programadoPor}</p>` : ''}
          ${detalle.observaciones ? `<p style="margin-bottom: 0;"><strong>Observaciones:</strong><br/>${detalle.observaciones}</p>` : '<p style="color: #9CA3AF;">Sin observaciones</p>'}
        </div>
      `,
      width: 400,
      showConfirmButton: true,
      confirmButtonText: 'Cerrar',
      confirmButtonColor: '#6B7280',
    })
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
    return horario === 'todo_dia' ? 'dt-badge asig-badge-cargo' : 'dt-badge asig-badge-turno'
  }

  // Columnas para DataTable - headers simples para usar filtros automáticos
  const columns = useMemo<ColumnDef<ExpandedAsignacion, any>[]>(() => [
    {
      accessorFn: (row) => `${row.vehiculos?.patente || ''} ${row.horario === 'todo_dia' ? 'A CARGO' : 'TURNO'}`,
      id: 'vehiculo',
      header: 'Vehículo',
      cell: ({ row }) => (
        <div>
          <div><span className="asig-vehiculo-patente">{row.original.vehiculos?.patente || 'N/A'}</span></div>
          <span className={getHorarioBadgeClass(row.original.horario)} style={{ fontSize: '10px', padding: '1px 6px' }}>
            {row.original.horario === 'todo_dia' ? 'A CARGO' : 'TURNO'}
          </span>
        </div>
      )
    },
    {
      id: 'motivo',
      header: 'Motivo',
      accessorFn: (row) => {
        const labels: Record<string, string> = {
          entrega_auto: 'Entrega de auto',
          asignacion_companero: 'Asig. compañero',
          cambio_auto: 'Cambio de auto',
          asignacion_auto_cargo: 'Asig. auto a cargo',
          entrega_auto_cargo: 'Entrega a cargo',
          cambio_turno: 'Cambio de turno',
          devolucion_vehiculo: 'Devolución',
        }
        return row.motivo ? (labels[row.motivo] || row.motivo) : '-'
      },
      cell: ({ row }) => {
        const motivo = row.original.motivo
        if (!motivo) return <span className="text-muted">-</span>
        const labels: Record<string, string> = {
          entrega_auto: 'Entrega de auto',
          asignacion_companero: 'Asig. compañero',
          cambio_auto: 'Cambio de auto',
          asignacion_auto_cargo: 'Asig. auto a cargo',
          entrega_auto_cargo: 'Entrega a cargo',
          cambio_turno: 'Cambio de turno',
          devolucion_vehiculo: 'Devolución',
        }
        const detalle = row.original.motivoDetalle
        const tieneDetalle = detalle && (detalle.observaciones || detalle.programadoPor)
        return (
          <span
            style={{ fontSize: '12px', fontWeight: 500, cursor: tieneDetalle ? 'pointer' : 'default', textDecoration: tieneDetalle ? 'underline dotted' : 'none' }}
            onClick={tieneDetalle ? () => handleShowMotivoDetalle(motivo, detalle!) : undefined}
          >
            {labels[motivo] || motivo}
          </span>
        )
      }
    },
    {
      id: 'asignados',
      header: 'Asignados',
      accessorFn: (row) => {
        if (row.esDevolucion) return (row as any)._conductorNombre || row.conductorCargo?.nombre || ''
        if (row.horario === 'todo_dia' || !row.horario) {
          return row.conductorCargo?.nombre || ''
        }
        const d = row.conductoresTurno?.diurno?.nombre || ''
        const n = row.conductoresTurno?.nocturno?.nombre || ''
        return `${d} ${n}`.trim()
      },
      cell: ({ row }) => {
        const { conductoresTurno, conductorCargo, horario } = row.original

        // Si es DEVOLUCIÓN, mostrar conductor
        if (row.original.esDevolucion) {
          const nombre = (row.original as any)._conductorNombre || conductorCargo?.nombre || 'Sin conductor'
          return <span className="asig-conductor-compacto">{nombre}</span>
        }

        // Si es A CARGO, mostrar solo el conductor
        if (horario === 'todo_dia' || !horario) {
          if (conductorCargo) {
            // Si está cancelado, mostrar con estilo tachado
            if (conductorCargo.cancelado) {
              return (
                <span className="asig-conductor-compacto" style={{ textDecoration: 'line-through', color: 'var(--color-error)', opacity: 0.7 }} title="Conductor cancelado">
                  {conductorCargo.nombre}
                </span>
              )
            }
            return <span className="asig-conductor-compacto">{conductorCargo.nombre}</span>
          }
          return <span className="asig-sin-conductor">Sin asignar</span>
        }

        // Si es TURNO, mostrar ambos conductores compacto
        const diurno = conductoresTurno?.diurno
        const nocturno = conductoresTurno?.nocturno

        return (
          <div className="asig-conductores-compact">
            <span 
              className={diurno ? 'asig-conductor-turno asig-turno-diurno' : 'asig-turno-vacante asig-turno-diurno'}
              style={diurno?.cancelado ? { textDecoration: 'line-through', color: 'var(--color-error)', opacity: 0.7 } : undefined}
              title={diurno?.cancelado ? 'Conductor cancelado' : undefined}
            >
              <span className="asig-turno-label asig-label-diurno">D</span>
              {diurno ? diurno.nombre : 'Vacante'}
            </span>
            <span 
              className={nocturno ? 'asig-conductor-turno asig-turno-nocturno' : 'asig-turno-vacante asig-turno-nocturno'}
              style={nocturno?.cancelado ? { textDecoration: 'line-through', color: 'var(--color-error)', opacity: 0.7 } : undefined}
              title={nocturno?.cancelado ? 'Conductor cancelado' : undefined}
            >
              <span className="asig-turno-label asig-label-nocturno">N</span>
              {nocturno ? nocturno.nombre : 'Vacante'}
            </span>
          </div>
        )
      }
    },
    {
      id: 'cita_programada',
      header: 'Cita',
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
          <div style={{ fontSize: '11px', lineHeight: '1.3' }}>
            <div>{fechaStr}</div>
            <div style={{ color: 'var(--text-secondary)' }}>{horaStr}</div>
          </div>
        )
      }
    },
    {
      id: 'entrega_real',
      header: 'Entrega',
      accessorFn: (row) => {
        const fechaRef = row.fecha_inicio || row.fecha_programada
        if (!fechaRef) return '-'
        const fecha = new Date(fechaRef)
        return fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })
      },
      cell: ({ row }) => {
        const fechaInicio = row.original.fecha_inicio
        // Si no tiene fecha_inicio (aún no activada), mostrar fecha_programada como referencia
        const fechaRef = fechaInicio || row.original.fecha_programada
        if (!fechaRef) return <span className="text-muted">-</span>
        const esFechaProgramada = !fechaInicio
        const fecha = new Date(fechaRef)
        const fechaStr = fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })
        const horaStr = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' })
        return (
          <div style={{ fontSize: '11px', lineHeight: '1.3' }}>
            <div style={{ color: esFechaProgramada ? 'var(--text-tertiary)' : 'var(--color-success)' }}>{fechaStr}</div>
            <div style={{ color: 'var(--text-secondary)' }}>{horaStr}</div>
          </div>
        )
      }
    },
    {
      id: 'tipo_documento',
      header: 'Doc.',
      accessorFn: (row) => {
        const esFinalizadaOCancelada = row.estado === 'finalizada' || row.estado === 'completada' || row.estado === 'cancelada'
        const conductores = (row.asignaciones_conductores || []).filter((c: any) =>
          c.estado === 'asignado' || c.estado === 'activo' || (esFinalizadaOCancelada && c.estado === 'completado')
        )
        const documentos = [...new Set(conductores.map((c: any) => c.documento).filter(Boolean))]
        if (documentos.length === 0) return '-'
        const primerDoc = documentos.includes('CARTA_OFERTA') ? 'CARTA_OFERTA'
          : documentos.includes('ANEXO') ? 'ANEXO'
          : documentos[0]
        return primerDoc === 'CARTA_OFERTA' ? 'C.Oferta' : primerDoc === 'ANEXO' ? 'Anexo' : 'N/A'
      },
      cell: ({ row }) => {
        const esFinalizadaOCancelada = row.original.estado === 'finalizada' || row.original.estado === 'completada' || row.original.estado === 'cancelada'
        const conductores = (row.original.asignaciones_conductores || []).filter((c: any) =>
          c.estado === 'asignado' || c.estado === 'activo' || (esFinalizadaOCancelada && c.estado === 'completado')
        )
        if (conductores.length === 0) return <span className="text-muted">-</span>

        // Para A CARGO: mostrar solo 1 badge (el último conductor activo)
        const esCargo = row.original.horario === 'todo_dia'
        const listaDoc = esCargo ? [conductores[conductores.length - 1]] : (() => {
          const diurnos = conductores.filter((c: any) => c.horario === 'diurno')
          const nocturnos = conductores.filter((c: any) => c.horario === 'nocturno')
          const result: any[] = []
          if (diurnos.length > 0) result.push(diurnos[diurnos.length - 1])
          if (nocturnos.length > 0) result.push(nocturnos[nocturnos.length - 1])
          return result
        })()

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {listaDoc.map((c: any, idx: number) => {
              const doc = c.documento
              const label = doc === 'CARTA_OFERTA' ? 'C.Oferta' : doc === 'ANEXO' ? 'Anexo' : 'N/A'
              const badgeClass = doc === 'CARTA_OFERTA' ? 'asig-doc-carta' : doc === 'ANEXO' ? 'asig-doc-anexo' : 'asig-doc-na'
              return (
                <span
                  key={idx}
                  className={`asig-documento-badge ${badgeClass}`}
                  style={{ fontSize: '10px', padding: '1px 4px' }}
                >
                  {label}
                </span>
              )
            })}
          </div>
        )
      }
    },
    {
      accessorKey: 'fecha_fin',
      header: 'Fin',
      cell: ({ row }) => {
        if (!row.original.fecha_fin) return <span style={{ fontSize: '11px' }}>-</span>
        const d = new Date(row.original.fecha_fin)
        return (
          <span style={{ fontSize: '11px' }}>
            {d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })}
            <span style={{ display: 'block', fontSize: '9px', color: 'var(--text-tertiary)' }}>
              {d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' })}
            </span>
          </span>
        )
      }
    },
    {
      accessorKey: 'estado',
      header: 'Estado',
      cell: ({ row }) => {
        const conductores = (row.original.asignaciones_conductores || []).filter((c: any) =>
          c.estado === 'asignado' || c.estado === 'activo' || c.estado === 'completado'
        )
        // Para TURNO con 2 conductores: solo mostrar por conductor si tienen estados DIFERENTES
        if (conductores.length > 1 && row.original.horario === 'turno' && row.original.estado === 'programado') {
          const labels = conductores.map((c: any) => c.confirmado ? 'Confirmado' : 'Pendiente')
          const todosIguales = labels.every(l => l === labels[0])
          if (!todosIguales) {
            const sorted = [...conductores].sort((a: any, b: any) => {
              if (a.horario === 'diurno') return -1
              if (b.horario === 'diurno') return 1
              return 0
            })
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {sorted.map((c: any, idx: number) => (
                  <span key={idx} className={getStatusBadgeClass(c.confirmado ? 'activa' : 'programado')} style={{ fontSize: '10px', padding: '2px 6px' }}>
                    {c.confirmado ? 'Confirmado' : 'Pendiente'}
                  </span>
                ))}
              </div>
            )
          }
        }
        return (
          <span className={getStatusBadgeClass(row.original.estado)} style={{ fontSize: '10px', padding: '2px 6px' }}>
            {getStatusLabel(row.original.estado)}
          </span>
        )
      }
    },
    {
      id: 'acciones',
      header: 'Acciones',
      enableSorting: false,
      cell: ({ row }) => {
        const esDevolucion = row.original.esDevolucion || row.original.motivo === 'devolucion_vehiculo'
        const actions = [
          // Acciones de programación (solo si está programado)
          ...(row.original.estado === 'programado' ? [
            {
              icon: <CheckCircle size={15} />,
              label: esDevolucion ? 'Confirmar Devolución' : 'Confirmar',
              onClick: esDevolucion
                ? () => handleConfirmarDevolucion(row.original)
                : () => {
                    setSelectedAsignacion(row.original)
                    setShowConfirmModal(true)
                  },
              disabled: !canEdit,
              variant: 'success' as const,
            },
            {
              icon: <XCircle size={15} />,
              label: 'Cancelar',
              onClick: esDevolucion && row.original.devolucionId
                ? () => handleCancelDevolucion(row.original.devolucionId!)
                : () => {
                    setSelectedAsignacion(row.original)
                    setShowCancelModal(true)
                  },
              disabled: !canEdit,
              variant: 'warning' as const,
            },
          ] : []),
          // Ver detalles
          {
            icon: <Eye size={15} />,
            label: 'Ver detalles',
            onClick: () => {
              setViewAsignacion(row.original)
              setShowViewModal(true)
            },
          },
          // Regularizar (solo para ciertos roles)
          {
            icon: <Pencil size={15} />,
            label: 'Regularizar',
            onClick: () => handleOpenRegularizar(row.original),
            hidden: !canCreateManualAssignment,
          },
          // Completar Control (visible solo si no se ha completado y creada después del 27/04/2026)
          {
            icon: <ClipboardCheck size={15} />,
            label: 'Completar Control',
            onClick: () => openControlModal(row.original),
            hidden: row.original.control_completado === true || Boolean(row.original.created_at && new Date(row.original.created_at) <= new Date('2026-04-27T23:59:59')),
            variant: 'info' as const,
          },
          // Eliminar
          {
            icon: <Trash2 size={15} />,
            label: 'Eliminar',
            onClick: () => esDevolucion && row.original.devolucionId
              ? handleCancelDevolucion(row.original.devolucionId)
              : handleDelete(row.original.id),
            disabled: !canDelete,
            variant: 'danger' as const,
          },
        ]
        return <ActionsMenu actions={actions} />
      }
    }
  ], [canEdit, canDelete, canCreateManualAssignment])

  return (
    <div className="asig-module">
      {/* Loading Overlay - bloquea toda la pantalla */}
      <LoadingOverlay show={loading} message="Cargando asignaciones..." size="lg" />

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
        searchPlaceholder="Buscar por patente, conductor o código..."
        globalFilterFn={(row, _columnId, filterValue) => {
          if (!filterValue || typeof filterValue !== 'string' || filterValue.trim() === '') return true
          const search = filterValue.toLowerCase().trim()
          const a = row.original as any
          // Buscar en patente, código, motivo y nombres de conductores (raw + procesados)
          const patente = (a.vehiculos?.patente || a._patente || '').toLowerCase()
          const codigo = (a.codigo || '').toLowerCase()
          const motivo = (a.motivo || '').toLowerCase()
          const conductoresRaw = (a.asignaciones_conductores || [])
            .map((c: any) => `${c.conductores?.apellidos || ''} ${c.conductores?.nombres || ''}`.toLowerCase())
            .join(' ')
          const conductorCargo = (a.conductorCargo?.nombre || '').toLowerCase()
          const conductorDiurno = (a.conductoresTurno?.diurno?.nombre || '').toLowerCase()
          const conductorNocturno = (a.conductoresTurno?.nocturno?.nombre || '').toLowerCase()
          const conductorNombre = (a._conductorNombre || '').toLowerCase()
          const text = `${patente} ${codigo} ${motivo} ${conductoresRaw} ${conductorCargo} ${conductorDiurno} ${conductorNocturno} ${conductorNombre}`
          return search.split(/\s+/).every(word => text.includes(word))
        }}
        emptyIcon={<FileText size={48}
      />}
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
              Fecha de entrega: <strong>{selectedAsignacion.fecha_programada ? new Date(selectedAsignacion.fecha_programada).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }) : 'N/A'}</strong>
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
                                    timeZone: 'America/Argentina/Buenos_Aires'
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
                onClick={handleDismissConfirmModal}
              >
                Cancelar
              </button>
              {/* Si todos los conductores ya confirmaron, mostrar botón para activar directamente */}
              {(selectedAsignacion.asignaciones_conductores?.length ?? 0) > 0 &&
               selectedAsignacion.asignaciones_conductores?.every(ac => ac.confirmado) ? (
                <button
                  className="btn-primary"
                  onClick={handleActivarAsignacionDirecta}
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

            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '14px', color: '#ff0033' }}>
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
                onClick={handleDismissCancelModal}
              >
                Volver
              </button>
              <button
                className="btn-primary"
                onClick={handleCancelProgramacion}
                disabled={!cancelMotivo.trim() || isSubmitting}
                style={{ background: cancelMotivo.trim() && !isSubmitting ? '#ff0033' : '#D1D5DB' }}
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
            {(viewAsignacion as any).esDevolucion ? (
              <>
                <h2 className="asig-modal-title">Detalle de la Devolución</h2>
                <div className="asig-detail-grid">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <label className="asig-detail-label">Vehículo</label>
                      <p className="asig-detail-value">
                        <strong>{viewAsignacion.vehiculos?.patente}</strong> - {viewAsignacion.vehiculos?.marca} {viewAsignacion.vehiculos?.modelo}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right', padding: '4px 10px', background: 'var(--bg-secondary)', borderRadius: '6px', border: '1px solid var(--border-primary)' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Devolución de vehículo</div>
                      {(viewAsignacion as any)._programadoPor && (
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>por {(viewAsignacion as any)._programadoPor}</div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="asig-detail-label">Conductor</label>
                    <div className="asig-conductor-card">
                      <p className="asig-conductor-card-name">
                        {(viewAsignacion as any)._conductorNombre || (viewAsignacion.asignaciones_conductores?.[0]?.conductores ? `${viewAsignacion.asignaciones_conductores[0].conductores?.nombres || ''} ${viewAsignacion.asignaciones_conductores[0].conductores?.apellidos || ''}`.trim() : '-')}
                        {(viewAsignacion.asignaciones_conductores?.[0]?.conductores as any)?.conductores_estados?.codigo?.toLowerCase().includes('baja') && (
                          <span style={{ marginLeft: 8, padding: '2px 8px', fontSize: '11px', fontWeight: 600, color: '#fff', background: '#DC2626', borderRadius: '10px', verticalAlign: 'middle' }}>De baja</span>
                        )}
                      </p>
                      <p className="asig-conductor-card-info">Turno: <strong>{viewAsignacion.horario === 'todo_dia' ? 'A CARGO' : viewAsignacion.horario}</strong></p>
                      {viewAsignacion.asignaciones_conductores?.[0]?.documento && (
                        <p className="asig-conductor-card-info">
                          Documento: <strong style={{ color: viewAsignacion.asignaciones_conductores[0].documento === 'CARTA_OFERTA' ? '#059669' : viewAsignacion.asignaciones_conductores[0].documento === 'ANEXO' ? '#2563EB' : '#6B7280' }}>
                            {viewAsignacion.asignaciones_conductores[0].documento === 'CARTA_OFERTA' ? 'Carta Oferta' : viewAsignacion.asignaciones_conductores[0].documento === 'ANEXO' ? 'Anexo' : viewAsignacion.asignaciones_conductores[0].documento === 'NA' ? 'N/A' : viewAsignacion.asignaciones_conductores[0].documento}
                          </strong>
                        </p>
                      )}
                      {(() => {
                        const docTipo = viewAsignacion.asignaciones_conductores?.[0]?.documento
                        if (docTipo === 'NA' || docTipo === 'N/A') return null
                        const cId = viewAsignacion.asignaciones_conductores?.[0]?.conductor_id
                        const driveUrl = (cId && viewDriveUrls[cId]) || (viewAsignacion.asignaciones_conductores?.[0]?.conductores as any)?.drive_folder_url
                        if (!driveUrl) return (
                          <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <FolderOpen size={13} style={{ color: '#9CA3AF' }} />
                            <span style={{ fontSize: '12px', color: '#9CA3AF', fontWeight: 500 }}>Sin Carpeta</span>
                          </div>
                        )
                        return (
                          <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <a href={driveUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#2563EB', textDecoration: 'none', fontWeight: 500 }}>
                              <FolderOpen size={13} /> Ver documentos en Drive
                            </a>
                            <span
                              onClick={() => { navigator.clipboard.writeText(driveUrl); showSuccess('URL copiada') }}
                              style={{ fontSize: '10px', color: '#9CA3AF', cursor: 'pointer', wordBreak: 'break-all' }}
                              title="Click para copiar"
                            >{driveUrl}</span>
                          </div>
                        )
                      })()}
                    </div>
                  </div>

                  <div className="asig-detail-row">
                    <div>
                      <label className="asig-detail-label">Horario</label>
                      <span className={getHorarioBadgeClass(viewAsignacion.horario)}>
                        {viewAsignacion.horario === 'todo_dia' ? 'A CARGO' : 'TURNO'}
                      </span>
                    </div>
                    <div>
                      <label className="asig-detail-label">Estado</label>
                      <span className={getStatusBadgeClass(viewAsignacion.estado)}>
                        {viewAsignacion.estado}
                      </span>
                    </div>
                  </div>

                  <div className="asig-detail-row">
                    <div>
                      <label className="asig-detail-label">Fecha Creación</label>
                      <p className="asig-detail-value" style={{ fontSize: '14px' }}>
                        {new Date(viewAsignacion.created_at).toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                    <div>
                      <label className="asig-detail-label">Fecha Devolución</label>
                      <p className="asig-detail-value" style={{ fontSize: '14px' }}>
                        {viewAsignacion.fecha_inicio ? new Date(viewAsignacion.fecha_inicio).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' }) : 'No definida'}
                      </p>
                    </div>
                  </div>

                  {viewAsignacion.notas && (
                    <div>
                      <label className="asig-detail-label">Observaciones</label>
                      <p className="asig-notes-box">{viewAsignacion.notas}</p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <h2 className="asig-modal-title">{viewAsignacion?.motivoDetalle?.cambioVehiculo ? 'Detalles de Cambio de Vehículo' : 'Detalles de Asignación'}</h2>
                <div className="asig-detail-grid">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <label className="asig-detail-label">Número de Asignación</label>
                      <p className="asig-detail-value code">{viewAsignacion.codigo}</p>
                    </div>
                    {viewAsignacion.motivo && (
                      <div style={{ textAlign: 'right', padding: '4px 10px', background: 'var(--bg-secondary)', borderRadius: '6px', border: '1px solid var(--border-primary)' }}>
                        <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600 }}>Programación</div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{viewAsignacion.motivo === 'entrega_auto' ? 'Entrega de auto' : viewAsignacion.motivo === 'cambio_auto' ? 'Cambio de auto' : viewAsignacion.motivo === 'cambio_turno' ? 'Cambio de turno' : viewAsignacion.motivo === 'entrega_cargo' ? 'Entrega a cargo' : viewAsignacion.motivo === 'devolucion' ? 'Devolución' : viewAsignacion.motivo}</div>
                        {viewAsignacion.motivoDetalle?.programadoPor && (
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>por {viewAsignacion.motivoDetalle.programadoPor}</div>
                        )}
                        {viewAsignacion.motivoDetalle?.observaciones && (
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', fontStyle: 'italic', maxWidth: '250px' }}>{viewAsignacion.motivoDetalle.observaciones}</div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Vehículo: si es cambio de vehículo mostrar ambos, sino el normal */}
                  {viewAsignacion?.motivoDetalle?.cambioVehiculo && viewAsignacion?.motivoDetalle?.vehiculoCambioPatente ? (
                    <div>
                      <label className="asig-detail-label">Cambio de Vehículo</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px' }}>
                        <div style={{ flex: 1, padding: '10px 14px', background: '#FEF3C7', borderRadius: '8px', border: '1px solid #FDE68A' }}>
                          <div style={{ fontSize: '10px', color: '#92400E', fontWeight: 600, marginBottom: '2px' }}>VEHÍCULO A CAMBIAR</div>
                          <div style={{ fontWeight: 700, fontSize: '14px' }}>{viewAsignacion?.motivoDetalle?.vehiculoCambioPatente}</div>
                          <div style={{ fontSize: '11px', color: '#6B7280' }}>{viewAsignacion?.motivoDetalle?.vehiculoCambioModelo}</div>
                        </div>
                        <ArrowLeftRight size={20} style={{ color: '#9CA3AF', flexShrink: 0 }} />
                        <div style={{ flex: 1, padding: '10px 14px', background: '#D1FAE5', borderRadius: '8px', border: '1px solid #A7F3D0' }}>
                          <div style={{ fontSize: '10px', color: '#065F46', fontWeight: 600, marginBottom: '2px' }}>VEHÍCULO NUEVO</div>
                          <div style={{ fontWeight: 700, fontSize: '14px' }}>{viewAsignacion.vehiculos?.patente}</div>
                          <div style={{ fontSize: '11px', color: '#6B7280' }}>{viewAsignacion.vehiculos?.marca} {viewAsignacion.vehiculos?.modelo}</div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="asig-detail-label">Vehículo</label>
                      <p className="asig-detail-value">
                        <strong>{viewAsignacion.vehiculos?.patente}</strong> - {viewAsignacion.vehiculos?.marca} {viewAsignacion.vehiculos?.modelo}
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="asig-detail-label">Conductores Asignados</label>
                    {viewAsignacion.asignaciones_conductores?.length ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {(() => {
                          const conductoresFiltrados = viewAsignacion.asignaciones_conductores.filter((c) =>
                            c.estado === 'asignado' || c.estado === 'activo' || c.estado === 'completado'
                          )
                          const esCargo = viewAsignacion.horario === 'todo_dia'
                          const lista = esCargo
                            ? [conductoresFiltrados[conductoresFiltrados.length - 1]]
                            : (() => {
                                const diurnos = conductoresFiltrados.filter((c: any) => c.horario === 'diurno')
                                const nocturnos = conductoresFiltrados.filter((c: any) => c.horario === 'nocturno')
                                const result: any[] = []
                                if (diurnos.length > 0) result.push(diurnos[diurnos.length - 1])
                                if (nocturnos.length > 0) result.push(nocturnos[nocturnos.length - 1])
                                return result
                              })()
                          return lista
                        })().map((ac) => (
                          <div key={ac.id} className="asig-conductor-card">
                            <p className="asig-conductor-card-name">
                              {ac.conductores?.nombres || '-'} {ac.conductores?.apellidos || ''}
                              {(ac.conductores as any)?.conductores_estados?.codigo?.toLowerCase().includes('baja') && (
                                <span style={{ marginLeft: 8, padding: '2px 8px', fontSize: '11px', fontWeight: 600, color: '#fff', background: '#DC2626', borderRadius: '10px', verticalAlign: 'middle' }}>De baja</span>
                              )}
                            </p>
                            <p className="asig-conductor-card-info">Licencia: {ac.conductores?.numero_licencia || '-'}</p>
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
                            {(() => {
                              if (ac.documento === 'NA' || ac.documento === 'N/A') return null
                              const driveUrl = viewDriveUrls[ac.conductor_id] || (ac.conductores as any)?.drive_folder_url
                              if (!driveUrl) return (
                                <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <FolderOpen size={13} style={{ color: '#9CA3AF' }} />
                                  <span style={{ fontSize: '12px', color: '#9CA3AF', fontWeight: 500 }}>Sin Carpeta</span>
                                </div>
                              )
                              return (
                                <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                  <a href={driveUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#2563EB', textDecoration: 'none', fontWeight: 500 }}>
                                    <FolderOpen size={13} /> Ver documentos en Drive
                                  </a>
                                  <span
                                    onClick={() => { navigator.clipboard.writeText(driveUrl); showSuccess('URL copiada') }}
                                    style={{ fontSize: '10px', color: '#9CA3AF', cursor: 'pointer', wordBreak: 'break-all' }}
                                    title="Click para copiar"
                                  >{driveUrl}</span>
                                </div>
                              )
                            })()}
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
                                          timeZone: 'America/Argentina/Buenos_Aires'
                                        })})
                                      </span>
                                    )}
                                  </span>
                                  {canEdit && viewAsignacion.estado === 'programado' && (
                                    <button
                                      className="asig-btn-unconfirm"
                                      onClick={() => handleUnconfirmFromViewModal(ac.id)}
                                    >
                                      Desconfirmar
                                    </button>
                                  )}
                                </>
                              ) : (
                                <span style={{ color: '#F59E0B', fontWeight: 600 }}>Pendiente</span>
                              )}
                            </p>
                            {(() => {
                              if (ac.documento === 'NA' || ac.documento === 'N/A') return null
                              const driveUrl = (ac.conductores as any)?.drive_folder_url
                              if (!driveUrl) return null
                              return (
                                <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                  <a href={driveUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#2563EB', textDecoration: 'none', fontWeight: 500 }}>
                                    <FolderOpen size={13} /> Ver documentos en Drive
                                  </a>
                                  <span
                                    onClick={() => { navigator.clipboard.writeText(driveUrl); showSuccess('URL copiada') }}
                                    style={{ fontSize: '10px', color: '#9CA3AF', cursor: 'pointer', wordBreak: 'break-all' }}
                                    title="Click para copiar"
                                  >{driveUrl}</span>
                                </div>
                              )
                            })()}
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
                        {viewAsignacion.horario === 'todo_dia' ? 'A CARGO' : 'TURNO'}
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
                        {viewAsignacion.fecha_programada ? new Date(viewAsignacion.fecha_programada).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' }) : 'No definida'}
                      </p>
                    </div>
                    <div>
                      <label className="asig-detail-label">Fecha Activación</label>
                      <p className="asig-detail-value" style={{ fontSize: '14px' }}>
                        {viewAsignacion.fecha_inicio ? new Date(viewAsignacion.fecha_inicio).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' }) : 'No activada'}
                      </p>
                    </div>
                    <div>
                      <label className="asig-detail-label">Fecha Fin</label>
                      <p className="asig-detail-value" style={{ fontSize: '14px' }}>
                        {viewAsignacion.fecha_fin ? new Date(viewAsignacion.fecha_fin).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' }) : 'Sin definir'}
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
              </>
            )}

            <div className="asig-modal-actions">
              <button
                className="btn-secondary"
                onClick={handleDismissViewModal}
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
                {/* Vehículo - full width, autocomplete searchable */}
                <div className="asig-edit-row single">
                  <div className="asig-edit-field" style={{ position: 'relative' }}>
                    <label>Vehículo</label>
                    <input
                      type="text"
                      className="asig-autocomplete-input"
                      value={showDropdownVehiculo ? searchVehiculo : (regularizarData.vehiculo_id ? getVehiculoDisplay(regularizarData.vehiculo_id) : '')}
                      onChange={(e) => { setSearchVehiculo(e.target.value); setShowDropdownVehiculo(true) }}
                      onFocus={() => { setShowDropdownVehiculo(true); setSearchVehiculo('') }}
                      onBlur={() => setTimeout(() => setShowDropdownVehiculo(false), 200)}
                      placeholder={regularizarData.vehiculo_id ? `Actual: ${vehiculosMap.get(regularizarData.vehiculo_id)?.patente || ''}` : 'Buscar vehículo...'}
                    />
                    {showDropdownVehiculo && (
                      <div className="asig-autocomplete-dropdown">
                        {vehiculosDisponibles
                          .filter((v: any) => !searchVehiculo || `${v.patente} ${v.marca} ${v.modelo}`.toLowerCase().includes(searchVehiculo.toLowerCase()))
                          .sort((a: any, b: any) => {
                            if (a.id === regularizarData.vehiculo_id) return -1
                            if (b.id === regularizarData.vehiculo_id) return 1
                            return 0
                          })
                          .slice(0, 20)
                          .map((v: any) => (
                            <div
                              key={v.id}
                              className={`asig-autocomplete-option ${regularizarData.vehiculo_id === v.id ? 'selected' : ''}`}
                              onMouseDown={() => { setRegularizarData(prev => ({ ...prev, vehiculo_id: v.id })); setSearchVehiculo(''); setShowDropdownVehiculo(false) }}
                            >{v.patente} - {v.marca} {v.modelo}{regularizarData.vehiculo_id === v.id ? ' (actual)' : ''}</div>
                          ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Modalidad y Estado - 2 columnas */}
                <div className="asig-edit-row">
                  <div className="asig-edit-field">
                    <label>Modalidad</label>
                    <select
                      value={regularizarData.horario}
                      onChange={(e) => setRegularizarData(prev => ({ ...prev, horario: e.target.value }))}
                    >
                      <option value="turno">TURNO (Diurno/Nocturno)</option>
                      <option value="todo_dia">A CARGO (Un solo conductor)</option>
                    </select>
                  </div>
                  <div className="asig-edit-field">
                    <label>Estado</label>
                    <select
                      value={regularizarData.estado}
                      onChange={(e) => setRegularizarData(prev => ({ ...prev, estado: e.target.value }))}
                    >
                      <option value="programado">Programada</option>
                      <option value="activa">Activa</option>
                      <option value="finalizada">Finalizada</option>
                      <option value="cancelada">Cancelada</option>
                    </select>
                  </div>
                </div>

                <div className="asig-edit-row single">
                  <div className="asig-edit-field">
                    <label>Sede</label>
                    <select
                      value={regularizarData.sede_id}
                      onChange={e => setRegularizarData(prev => ({ ...prev, sede_id: e.target.value }))}
                    >
                      <option value="">Seleccionar...</option>
                      {(sedes || []).map((s: any) => (
                        <option key={s.id} value={s.id}>{s.nombre}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Conductores según modalidad */}
                {regularizarData.horario === 'turno' ? (
                  <>
                    {/* Conductor Diurno */}
                    <div className="asig-edit-row">
                      <div className="asig-edit-field" style={{ flex: 2 }}>
                        <label>Conductor Diurno</label>
                        <div className="asig-conductor-input-wrapper">
                          <input
                            type="text"
                            value={showDropdownDiurno ? searchDiurno : (regularizarData.conductor_diurno_id ? getConductorDisplay(regularizarData.conductor_diurno_id) : '')}
                            onChange={(e) => { setSearchDiurno(e.target.value); setShowDropdownDiurno(true) }}
                            onFocus={() => { setShowDropdownDiurno(true); setSearchDiurno('') }}
                            onBlur={() => setTimeout(() => setShowDropdownDiurno(false), 200)}
                            placeholder={regularizarData.conductor_diurno_id ? `Actual: ${getConductorDisplay(regularizarData.conductor_diurno_id)}` : 'Buscar conductor...'}
                          />
                          {showDropdownDiurno && (
                            <div className="asig-autocomplete-dropdown">
                              <div className="asig-autocomplete-option" style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }} onMouseDown={() => { setRegularizarData(prev => ({ ...prev, conductor_diurno_id: '' })); setSearchDiurno(''); setShowDropdownDiurno(false) }}>
                                Sin asignar (Vacante)
                              </div>
                              {conductoresDisponibles
                                .filter(c => !searchDiurno || `${c.apellidos} ${c.nombres}`.toLowerCase().includes(searchDiurno.toLowerCase()))
                                .sort((a, b) => {
                                  if (a.id === regularizarData.conductor_diurno_id) return -1
                                  if (b.id === regularizarData.conductor_diurno_id) return 1
                                  return 0
                                })
                                .slice(0, 20)
                                .map((c: any) => (
                                  <div 
                                    key={c.id} 
                                    className={`asig-autocomplete-option ${regularizarData.conductor_diurno_id === c.id ? 'selected' : ''}`}
                                    onMouseDown={() => { setRegularizarData(prev => ({ ...prev, conductor_diurno_id: c.id })); setSearchDiurno(''); setShowDropdownDiurno(false) }}
                                  >{c.apellidos}, {c.nombres}{regularizarData.conductor_diurno_id === c.id ? ' (actual)' : ''}</div>
                                ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="asig-edit-field" style={{ flex: 1 }}>
                        <label>Documento Diurno</label>
                        <select
                          value={regularizarData.documento_diurno}
                          onChange={(e) => setRegularizarData(prev => ({ ...prev, documento_diurno: e.target.value }))}
                        >
                          <option value="">Sin definir</option>
                          <option value="CARTA_OFERTA">Carta Oferta</option>
                          <option value="ANEXO">Anexo</option>
                          <option value="N/A">N/A</option>
                        </select>
                      </div>
                    </div>
                    {/* Conductor Nocturno */}
                    <div className="asig-edit-row">
                      <div className="asig-edit-field" style={{ flex: 2 }}>
                        <label>Conductor Nocturno</label>
                        <div className="asig-conductor-input-wrapper">
                          <input
                            type="text"
                            value={showDropdownNocturno ? searchNocturno : (regularizarData.conductor_nocturno_id ? getConductorDisplay(regularizarData.conductor_nocturno_id) : '')}
                            onChange={(e) => { setSearchNocturno(e.target.value); setShowDropdownNocturno(true) }}
                            onFocus={() => { setShowDropdownNocturno(true); setSearchNocturno('') }}
                            onBlur={() => setTimeout(() => setShowDropdownNocturno(false), 200)}
                            placeholder={regularizarData.conductor_nocturno_id ? `Actual: ${getConductorDisplay(regularizarData.conductor_nocturno_id)}` : 'Buscar conductor...'}
                          />
                          {showDropdownNocturno && (
                            <div className="asig-autocomplete-dropdown">
                              <div className="asig-autocomplete-option" style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }} onMouseDown={() => { setRegularizarData(prev => ({ ...prev, conductor_nocturno_id: '' })); setSearchNocturno(''); setShowDropdownNocturno(false) }}>
                                Sin asignar (Vacante)
                              </div>
                              {conductoresDisponibles
                                .filter(c => !searchNocturno || `${c.apellidos} ${c.nombres}`.toLowerCase().includes(searchNocturno.toLowerCase()))
                                .sort((a, b) => {
                                  if (a.id === regularizarData.conductor_nocturno_id) return -1
                                  if (b.id === regularizarData.conductor_nocturno_id) return 1
                                  return 0
                                })
                                .slice(0, 20)
                                .map((c: any) => (
                                  <div 
                                    key={c.id} 
                                    className={`asig-autocomplete-option ${regularizarData.conductor_nocturno_id === c.id ? 'selected' : ''}`}
                                    onMouseDown={() => { setRegularizarData(prev => ({ ...prev, conductor_nocturno_id: c.id })); setSearchNocturno(''); setShowDropdownNocturno(false) }}
                                  >{c.apellidos}, {c.nombres}{regularizarData.conductor_nocturno_id === c.id ? ' (actual)' : ''}</div>
                                ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="asig-edit-field" style={{ flex: 1 }}>
                        <label>Documento Nocturno</label>
                        <select
                          value={regularizarData.documento_nocturno}
                          onChange={(e) => setRegularizarData(prev => ({ ...prev, documento_nocturno: e.target.value }))}
                        >
                          <option value="">Sin definir</option>
                          <option value="CARTA_OFERTA">Carta Oferta</option>
                          <option value="ANEXO">Anexo</option>
                          <option value="N/A">N/A</option>
                        </select>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="asig-edit-row">
                    <div className="asig-edit-field" style={{ flex: 2 }}>
                      <label>Conductor A Cargo</label>
                      <div className="asig-conductor-input-wrapper">
                        <input
                          type="text"
                          value={showDropdownCargo ? searchCargo : (regularizarData.conductor_cargo_id ? getConductorDisplay(regularizarData.conductor_cargo_id) : '')}
                          onChange={(e) => { setSearchCargo(e.target.value); setShowDropdownCargo(true) }}
                          onFocus={() => { setShowDropdownCargo(true); setSearchCargo('') }}
                          onBlur={() => setTimeout(() => setShowDropdownCargo(false), 200)}
                          placeholder={regularizarData.conductor_cargo_id ? `Actual: ${getConductorDisplay(regularizarData.conductor_cargo_id)}` : 'Buscar conductor...'}
                        />
                        {showDropdownCargo && (
                          <div className="asig-autocomplete-dropdown">
                            <div className="asig-autocomplete-option" style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }} onMouseDown={() => { setRegularizarData(prev => ({ ...prev, conductor_cargo_id: '' })); setSearchCargo(''); setShowDropdownCargo(false) }}>
                              Sin asignar (Vacante)
                            </div>
                            {conductoresDisponibles
                              .filter(c => !searchCargo || `${c.apellidos} ${c.nombres}`.toLowerCase().includes(searchCargo.toLowerCase()))
                              .sort((a, b) => {
                                if (a.id === regularizarData.conductor_cargo_id) return -1
                                if (b.id === regularizarData.conductor_cargo_id) return 1
                                return 0
                              })
                              .slice(0, 20)
                              .map((c: any) => (
                                <div 
                                  key={c.id} 
                                  className={`asig-autocomplete-option ${regularizarData.conductor_cargo_id === c.id ? 'selected' : ''}`}
                                  onMouseDown={() => { setRegularizarData(prev => ({ ...prev, conductor_cargo_id: c.id })); setSearchCargo(''); setShowDropdownCargo(false) }}
                                >{c.apellidos}, {c.nombres}{regularizarData.conductor_cargo_id === c.id ? ' (actual)' : ''}</div>
                              ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="asig-edit-field" style={{ flex: 1 }}>
                      <label>Documento</label>
                      <select
                        value={regularizarData.documento_cargo}
                        onChange={(e) => setRegularizarData(prev => ({ ...prev, documento_cargo: e.target.value }))}
                      >
                        <option value="">Sin definir</option>
                        <option value="CARTA_OFERTA">Carta Oferta</option>
                        <option value="ANEXO">Anexo</option>
                        <option value="N/A">N/A</option>
                      </select>
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
                onClick={handleDismissRegularizarModal}
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

      {/* Modal Completar Control */}
      {showControlModal && controlAsignacion && (() => {
        const isAutoCargo = controlAsignacion.horario === 'todo_dia'
        const patente = controlAsignacion.vehiculos?.patente || '-'
        const marca = controlAsignacion.vehiculos?.marca || ''
        const modelo = controlAsignacion.vehiculos?.modelo || ''
        const vehiculoLabel = `${patente} ${marca && modelo ? `- ${marca} ${modelo}` : ''}`.trim()

        const conductoresAsig = controlAsignacion.asignaciones_conductores?.map(ac => ({
          id: (ac as any).conductores?.id || ac.conductor_id,
          nombre: `${(ac as any).conductores?.nombres || ''} ${(ac as any).conductores?.apellidos || ''}`.trim(),
          horario: ac.horario,
        })).filter(c => c.id && c.nombre) || []

        const inputStyle: React.CSSProperties = {
          padding: '10px 12px', border: '1px solid var(--border-primary)', borderRadius: '8px',
          background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '13px',
          width: '100%', outline: 'none', transition: 'border-color 0.2s',
        }
        const labelStyle: React.CSSProperties = {
          fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', display: 'block',
        }
        const sectionTitleStyle: React.CSSProperties = {
          fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em',
          color: 'var(--text-tertiary)', marginBottom: '12px', paddingBottom: '8px',
          borderBottom: '1px solid var(--border-primary)', display: 'flex', alignItems: 'center', gap: '6px',
        }

        return (
          <div className="asig-modal-overlay" onClick={() => !controlSaving && setShowControlModal(false)}>
            <div className="asig-modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px', padding: 0, overflow: 'hidden' }}>

              {/* Header */}
              <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-primary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--color-primary-light, #ffe5ea)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ClipboardCheck size={18} style={{ color: 'var(--color-primary)' }} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>Completar Control</h3>
                    <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{controlAsignacion.codigo}</span>
                  </div>
                </div>
                <button
                  onClick={() => !controlSaving && setShowControlModal(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: '4px', borderRadius: '6px', display: 'flex' }}
                >
                  <XCircle size={20} />
                </button>
              </div>

              {/* Body */}
              <div style={{ padding: '20px 24px', maxHeight: '60vh', overflowY: 'auto' }}>

                {/* Sección: Vehículo y Conductor */}
                <div style={sectionTitleStyle}>
                  <Car size={14} /> Asignación
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
                  <div style={{ padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-primary)' }}>
                    <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Vehículo</span>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>{vehiculoLabel}</div>
                  </div>
                  <div style={{ padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-primary)' }}>
                    <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Modalidad</span>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>{isAutoCargo ? 'A Cargo' : 'Turno'}</div>
                  </div>
                </div>

                {/* Conductor(es) */}
                {conductoresAsig.length > 1 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
                    {conductoresAsig.map(c => (
                      <div key={c.id} style={{ padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-primary)' }}>
                        <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>{c.horario === 'diurno' ? 'Conductor Diurno' : 'Conductor Nocturno'}</span>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>{c.nombre}</div>
                      </div>
                    ))}
                  </div>
                ) : conductoresAsig.length === 1 ? (
                  <div style={{ marginBottom: '20px', padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-primary)' }}>
                    <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Conductor</span>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>{conductoresAsig[0].nombre}</div>
                  </div>
                ) : null}

                {/* Sección: Datos del Control */}
                <div style={sectionTitleStyle}>
                  <FileText size={14} /> Datos del control
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: isControlBariloche ? '16px' : '0' }}>
                  <div>
                    <label style={labelStyle}>Kilometraje <span style={{ color: '#dc2626' }}>*</span></label>
                    <input type="text" placeholder="Ej: 45.000" value={controlForm.km} onChange={(e) => setControlForm(p => ({ ...p, km: e.target.value }))} disabled={controlSaving} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Litros de Nafta <span style={{ color: '#dc2626' }}>*</span></label>
                    <input type="text" placeholder="Ej: 30" value={controlForm.ltnafta} onChange={(e) => setControlForm(p => ({ ...p, ltnafta: e.target.value }))} disabled={controlSaving} style={inputStyle} />
                  </div>
                </div>

                <div style={{ marginTop: '12px', marginBottom: isControlBariloche ? '16px' : '0' }}>
                  <label style={labelStyle}>Observaciones <span style={{ color: '#dc2626' }}>*</span></label>
                  <textarea
                    placeholder="Ingrese observaciones del control..."
                    value={controlForm.observations}
                    onChange={(e) => setControlForm(p => ({ ...p, observations: e.target.value }))}
                    disabled={controlSaving}
                    rows={3}
                    style={{ ...inputStyle, resize: 'vertical', minHeight: '60px' }}
                  />
                </div>

                {isControlBariloche && (
                  <>
                    <div style={{ marginTop: '12px', marginBottom: '12px' }}>
                      <label style={labelStyle}>Estado de Cristales</label>
                      <input type="text" placeholder="Ej: Buen estado, sin rajaduras" value={controlForm.cristal_status} onChange={(e) => setControlForm(p => ({ ...p, cristal_status: e.target.value }))} disabled={controlSaving} style={inputStyle} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                      <div>
                        <label style={labelStyle}>Bajos y Carter</label>
                        <input type="text" placeholder="Ej: Sin pérdidas" value={controlForm.carter} onChange={(e) => setControlForm(p => ({ ...p, carter: e.target.value }))} disabled={controlSaving} style={inputStyle} />
                      </div>
                      <div>
                        <label style={labelStyle}>Neumáticos</label>
                        <input type="text" placeholder="Ej: Buen estado" value={controlForm.tires} onChange={(e) => setControlForm(p => ({ ...p, tires: e.target.value }))} disabled={controlSaving} style={inputStyle} />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                      <div>
                        <label style={labelStyle}>Otros Documentos</label>
                        <input type="text" placeholder="Ej: VTV, seguro" value={controlForm.others_docs} onChange={(e) => setControlForm(p => ({ ...p, others_docs: e.target.value }))} disabled={controlSaving} style={inputStyle} />
                      </div>
                      <div>
                        <label style={labelStyle}>Otros Accesorios</label>
                        <input type="text" placeholder="Ej: Matafuegos, baliza" value={controlForm.other_accesory} onChange={(e) => setControlForm(p => ({ ...p, other_accesory: e.target.value }))} disabled={controlSaving} style={inputStyle} />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                      <div>
                        <label style={labelStyle}>Marca Cadenas</label>
                        <input type="text" placeholder="-" value={controlForm.make_chains} onChange={(e) => setControlForm(p => ({ ...p, make_chains: e.target.value }))} disabled={controlSaving} style={inputStyle} />
                      </div>
                      <div>
                        <label style={labelStyle}>Estado Cadenas</label>
                        <input type="text" placeholder="-" value={controlForm.status_chains} onChange={(e) => setControlForm(p => ({ ...p, status_chains: e.target.value }))} disabled={controlSaving} style={inputStyle} />
                      </div>
                      <div>
                        <label style={labelStyle}>Tensores Cadenas</label>
                        <input type="text" placeholder="-" value={controlForm.tensioners_chains} onChange={(e) => setControlForm(p => ({ ...p, tensioners_chains: e.target.value }))} disabled={controlSaving} style={inputStyle} />
                      </div>
                    </div>
                    <div>
                      <label style={labelStyle}>Kit Otros</label>
                      <input type="text" placeholder="-" value={controlForm.others_kit} onChange={(e) => setControlForm(p => ({ ...p, others_kit: e.target.value }))} disabled={controlSaving} style={inputStyle} />
                    </div>
                  </>
                )}
              </div>

              {/* Footer */}
              <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-primary)', display: 'flex', justifyContent: 'flex-end', gap: '10px', background: 'var(--bg-secondary)' }}>
                <button
                  className="btn-secondary"
                  onClick={() => setShowControlModal(false)}
                  disabled={controlSaving}
                  style={{ padding: '9px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 600 }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSubmitControl}
                  disabled={controlSaving || conductoresAsig.length === 0}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    padding: '9px 22px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                    cursor: (controlSaving || conductoresAsig.length === 0) ? 'not-allowed' : 'pointer',
                    border: 'none', background: 'var(--color-primary)', color: 'white',
                    opacity: (controlSaving || conductoresAsig.length === 0) ? 0.5 : 1,
                    transition: 'opacity 0.2s',
                  }}
                >
                  <ClipboardCheck size={15} />
                  {controlSaving ? 'Generando documento...' : 'Guardar Datos'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

export default AsignacionesModule
