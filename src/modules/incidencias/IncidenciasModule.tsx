/* eslint-disable @typescript-eslint/no-explicit-any */
// src/modules/incidencias/IncidenciasModule.tsx
import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { usePermissions } from '../../contexts/PermissionsContext'
import { useCategorizedTipos } from '../../hooks/useCategorizedTipos'
import { ExcelColumnFilter, useExcelFilters } from '../../components/ui/DataTable/ExcelColumnFilter'
import Swal from 'sweetalert2'
import {
  Plus,
  Eye,
  Edit2,
  Trash2,
  FileText,
  X,
  Shield,
  Clock,
  DollarSign,
  CheckCircle,
  XCircle,
  Users,
  Car,
  Download,
  Filter,
  Calendar,
  ArrowRightLeft,
  Send,
  Square,
  CheckSquare,
  Ban
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { type ColumnDef, type FilterFn } from '@tanstack/react-table'
import { DataTable } from '../../components/ui/DataTable'
import type {
  IncidenciaCompleta,
  IncidenciaEstado,
  IncidenciaFormData,
  PenalidadCompleta,
  TipoPenalidad,
  TipoCobroDescuento,
  PenalidadFormData,
  VehiculoSimple,
  ConductorSimple
} from '../../types/incidencias.types'
import './IncidenciasModule.css'
import { PenalidadForm } from '../../components/shared/PenalidadForm'
import { DateRangeSelector } from '../../components/ui/DateRangeSelector'
import type { DateRange } from '../../components/ui/DateRangeSelector'

type TabType = 'logistica' | 'cobro' | 'penalidades' | 'por_aplicar' | 'aplicadas' | 'rechazados'

// Helper para mapear rol de usuario a área (para incidencias)
function getAreaPorRol(roleName: string | undefined | null): string {
  if (!roleName) return ''
  const rol = roleName.toLowerCase()

  // Roles administrativos
  if (rol.includes('admin') || rol.includes('superadmin')) {
    return 'Administración'
  }
  // Roles de data entry
  if (rol.includes('data') || rol.includes('entry')) {
    return 'Data Entry'
  }
  // Roles de logística/operaciones
  if (rol.includes('logist') || rol.includes('operador') || rol.includes('operacion')) {
    return 'Logística'
  }

  return ''
}

// Helper para mapear rol de usuario a área responsable (para penalidades - valores en mayúsculas)
function getAreaResponsablePorRol(roleName: string | undefined | null): string {
  if (!roleName) return ''
  const rol = roleName.toLowerCase()

  // Roles administrativos
  if (rol.includes('admin') || rol.includes('superadmin')) {
    return 'ADMINISTRACION'
  }
  // Roles de data entry
  if (rol.includes('data') || rol.includes('entry')) {
    return 'DATA ENTRY'
  }
  // Roles de logística/operaciones
  if (rol.includes('logist') || rol.includes('operador') || rol.includes('operacion')) {
    return 'LOGISTICA'
  }

  return ''
}

export function IncidenciasModule() {
  const { user, profile } = useAuth()
  const { canCreateInMenu, canEditInMenu, canDeleteInMenu } = usePermissions()
  const [searchParams, setSearchParams] = useSearchParams()

  // Permisos específicos para el menú de incidencias
  const canCreate = canCreateInMenu('incidencias')
  const canEdit = canEditInMenu('incidencias')
  const canDelete = canDeleteInMenu('incidencias')

  const [activeTab, setActiveTab] = useState<TabType>('logistica')
  const [loading, setLoading] = useState(true)

  // Data
  const [incidencias, setIncidencias] = useState<IncidenciaCompleta[]>([])
  const [penalidades, setPenalidades] = useState<PenalidadCompleta[]>([])
  const [estados, setEstados] = useState<IncidenciaEstado[]>([])
  const [tiposPenalidad, setTiposPenalidad] = useState<TipoPenalidad[]>([])
  const [tiposCobroDescuento, setTiposCobroDescuento] = useState<TipoCobroDescuento[]>([])
  const [vehiculos, setVehiculos] = useState<VehiculoSimple[]>([])
  const [conductores, setConductores] = useState<ConductorSimple[]>([])
  // Mapa de penalidades fraccionadas: penalidad_id -> { total_cuotas, cuotas_pendientes }
  const [fraccionamientoMap, setFraccionamientoMap] = useState<Map<string, { total_cuotas: number; cuotas_pendientes: number }>>(new Map())

  // Filtros por columna tipo Excel con Portal
  const { openFilterId, setOpenFilterId } = useExcelFilters()

  // Filtros - Incidencias
  const [patenteFilter, setPatenteFilter] = useState<string[]>([])
  const [conductorFilter, setConductorFilter] = useState<string[]>([])
  const [estadoFilter, setEstadoFilter] = useState<string[]>([])
  const [turnoFilter, setTurnoFilter] = useState<string[]>([])
  const [areaFilter, setAreaFilter] = useState<string[]>([])
  
  // Filtro especial: Solo pendientes de enviar a facturación
  const [soloPendientesEnviar, setSoloPendientesEnviar] = useState(false)
  
  // Filtros de rango de fecha
  const [dateRangeLogistica, setDateRangeLogistica] = useState<DateRange | null>(null)
  const [dateRangeCobro, setDateRangeCobro] = useState<DateRange | null>(null)
  const [dateRangePenalidades, setDateRangePenalidades] = useState<DateRange | null>(null)

  // Helper: ¿Hay filtros activos en incidencias?
  const hayFiltrosIncidenciasActivos = patenteFilter.length > 0 || conductorFilter.length > 0 || estadoFilter.length > 0 || turnoFilter.length > 0 || areaFilter.length > 0 || soloPendientesEnviar

  // Limpiar todos los filtros de incidencias
  function limpiarFiltrosIncidencias() {
    setPatenteFilter([])
    setConductorFilter([])
    setEstadoFilter([])
    setTurnoFilter([])
    setAreaFilter([])
    setSoloPendientesEnviar(false)
  }

  // Filtros - Penalidades
  const [penPatenteFilter, setPenPatenteFilter] = useState<string[]>([])
  const [penConductorFilter, setPenConductorFilter] = useState<string[]>([])
  const [penTipoFilter, setPenTipoFilter] = useState<string[]>([])
  const [penAplicadoFilter, setPenAplicadoFilter] = useState<string[]>([])
  
  // Helper: ¿Hay filtros activos en penalidades?
  const hayFiltrosPenalidadesActivos = penPatenteFilter.length > 0 || penConductorFilter.length > 0 || penTipoFilter.length > 0 || penAplicadoFilter.length > 0
  
  // Limpiar todos los filtros de penalidades
  function limpiarFiltrosPenalidades() {
    setPenPatenteFilter([])
    setPenConductorFilter([])
    setPenTipoFilter([])
    setPenAplicadoFilter([])
  }

  // Selección masiva para envío a facturación
  const [modoSeleccionMasiva, setModoSeleccionMasiva] = useState(false)
  const [incidenciasSeleccionadas, setIncidenciasSeleccionadas] = useState<Set<string>>(new Set())
  const [enviandoMasivo, setEnviandoMasivo] = useState(false)

  // Modal
  const [showModal, setShowModal] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'view'>('create')
  const [modalType, setModalType] = useState<'incidencia' | 'penalidad'>('incidencia')
  const [selectedIncidencia, setSelectedIncidencia] = useState<IncidenciaCompleta | null>(null)
  const [selectedPenalidad, setSelectedPenalidad] = useState<PenalidadCompleta | null>(null)
  
  // Modal de aplicación/fraccionamiento
  const [showAplicarModal, setShowAplicarModal] = useState(false)
  const [penalidadAplicar, setPenalidadAplicar] = useState<PenalidadCompleta | null>(null)
  const [aplicarFraccionado, setAplicarFraccionado] = useState(false)
  const [cantidadCuotas, setCantidadCuotas] = useState(2)
  const [semanaInicio, setSemanaInicio] = useState<number>(0)
  const [anioInicio, setAnioInicio] = useState<number>(new Date().getFullYear())
  const [periodosDisponibles, setPeriodosDisponibles] = useState<Array<{semana: number, anio: number, label: string}>>([])
  const [aplicandoCobro, setAplicandoCobro] = useState(false)
  
  // Modal de rechazo
  const [showRechazoModal, setShowRechazoModal] = useState(false)
  const [penalidadRechazar, setPenalidadRechazar] = useState<PenalidadCompleta | null>(null)
  const [motivoRechazo, setMotivoRechazo] = useState('')
  const [rechazando, setRechazando] = useState(false)
  
  // Historial de rechazos para el detalle
  const [historialRechazos, setHistorialRechazos] = useState<Array<{id: string; motivo: string; rechazado_por_nombre: string; created_at: string}>>([])
  const [loadingHistorial, setLoadingHistorial] = useState(false)

  // Modal de reasignar semana
  const [showReasignarModal, setShowReasignarModal] = useState(false)
  const [penalidadReasignar, setPenalidadReasignar] = useState<PenalidadCompleta | null>(null)
  const [nuevaSemana, setNuevaSemana] = useState<number>(0)
  const [nuevoAnio, setNuevoAnio] = useState<number>(new Date().getFullYear())
  const [reasignando, setReasignando] = useState(false)

  // Helper para obtener fecha local en formato YYYY-MM-DD
  function getLocalDateString() {
    const today = new Date()
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const day = String(today.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // Form data
  const [incidenciaForm, setIncidenciaForm] = useState<IncidenciaFormData>({
    estado_id: '',
    fecha: getLocalDateString(),
    registrado_por: profile?.full_name || ''
  })
  const [penalidadForm, setPenalidadForm] = useState<PenalidadFormData>({
    fecha: getLocalDateString(),
    aplicado: false
  })
  const [saving, setSaving] = useState(false)

  // Cargar datos
  useEffect(() => {
    cargarDatos()
  }, [])

  // Verificar si hay datos precargados desde siniestros
  useEffect(() => {
    const preloadData = localStorage.getItem('incidencia_preload')
    const urlParams = new URLSearchParams(window.location.search)
    const crearParam = urlParams.get('crear')

    if (preloadData && crearParam) {
      try {
        const data = JSON.parse(preloadData)

        // Si es penalidad, abrir el modal de penalidad
        if (crearParam === 'penalidad' || data.tipo === 'penalidad') {
          // Cambiar a tab de penalidades
          setActiveTab('penalidades')

          // Pre-llenar formulario de penalidad
          setPenalidadForm(prev => ({
            ...prev,
            vehiculo_id: data.vehiculo_id || undefined,
            conductor_id: data.conductor_id || undefined,
            monto: data.monto || undefined,
            detalle: 'Cobro',
            observaciones: data.descripcion || '',
            fecha: getLocalDateString(),
            aplicado: false
          }))

          // Abrir modal de penalidad
          setModalType('penalidad')
          setModalMode('create')
          setShowModal(true)
        } else {
          // Pre-llenar formulario de incidencia
          setIncidenciaForm(prev => ({
            ...prev,
            vehiculo_id: data.vehiculo_id || undefined,
            conductor_id: data.conductor_id || undefined,
            descripcion: data.descripcion || '',
            area: data.area || '',
            fecha: getLocalDateString(),
            registrado_por: profile?.full_name || ''
          }))

          setModalType('incidencia')
          setModalMode('create')
          setShowModal(true)
        }

        // Limpiar localStorage y URL
        localStorage.removeItem('incidencia_preload')
        window.history.replaceState({}, '', window.location.pathname)
      } catch (error) {
        console.error('Error parseando datos precargados:', error)
        localStorage.removeItem('incidencia_preload')
      }
    }
  }, [profile])

  // Manejar parámetro de URL para abrir incidencia específica (ej: desde Siniestros)
  useEffect(() => {
    const incidenciaId = searchParams.get('id')
    const penalidadId = searchParams.get('penalidad_id')
    
    if (incidenciaId && incidencias.length > 0) {
      const incidencia = incidencias.find(i => i.id === incidenciaId)
      if (incidencia) {
        // Determinar el tab correcto basado en el tipo
        if (incidencia.tipo === 'cobro') {
          setActiveTab('cobro')
        } else {
          setActiveTab('logistica')
        }
        // Abrir modal de vista
        setSelectedIncidencia(incidencia)
        setModalType('incidencia')
        setModalMode('view')
        setShowModal(true)
        // Limpiar parámetro de URL
        setSearchParams({})
      }
    }
    
    if (penalidadId && penalidades.length > 0) {
      const penalidad = penalidades.find(p => p.id === penalidadId)
      if (penalidad) {
        setActiveTab('penalidades')
        setSelectedPenalidad(penalidad)
        setModalType('penalidad')
        setModalMode('view')
        setShowModal(true)
        setSearchParams({})
      }
    }
  }, [searchParams, incidencias, penalidades, setSearchParams])

  async function cargarDatos() {
    setLoading(true)
    try {
      const [
        estadosRes,
        tiposRes,
        tiposCobroRes,
        vehiculosRes,
        conductoresRes,
        incidenciasRes,
        penalidadesRes,
        incidenciasTipoRes,
        penalidadesTableRes,
        rechazosRes
      ] = await Promise.all([
        (supabase.from('incidencias_estados' as any) as any).select('*').eq('is_active', true).order('orden'),
        (supabase.from('tipos_penalidad' as any) as any).select('*').eq('is_active', true).order('orden'),
        (supabase.from('tipos_cobro_descuento' as any) as any).select('*').eq('is_active', true).order('orden'),
        supabase.from('vehiculos').select('id, patente, marca, modelo').order('patente'),
        supabase.from('conductores').select('id, nombres, apellidos').order('apellidos'),
        (supabase.from('v_incidencias_completas' as any) as any).select('*').order('fecha', { ascending: false }),
        (supabase.from('v_penalidades_completas' as any) as any).select('*').order('fecha', { ascending: false }),
        // Obtener campos adicionales de la tabla incidencias (tipo, monto)
        (supabase.from('incidencias' as any) as any).select('id, tipo, tipo_cobro_descuento_id, monto'),
        // Obtener campos frescos de la tabla penalidades (aplicado, rechazado, incidencia_id)
        (supabase.from('penalidades' as any) as any).select('id, incidencia_id, aplicado, rechazado, fecha_rechazo, motivo_rechazo'),
        // Obtener historial de rechazos
        (supabase.from('penalidades_rechazos' as any) as any).select('penalidad_id, motivo, rechazado_por, created_at').order('created_at', { ascending: false })
      ])

      setEstados(estadosRes.data || [])
      setTiposPenalidad(tiposRes.data || [])
      setTiposCobroDescuento(tiposCobroRes.data || [])
      setVehiculos(vehiculosRes.data || [])
      setConductores((conductoresRes.data || []).map((c: any) => ({
        id: c.id,
        nombres: c.nombres,
        apellidos: c.apellidos,
        nombre_completo: `${c.nombres} ${c.apellidos}`
      })))
      
      // Combinar datos de la vista con campos de la tabla (tipo, monto)
      const extraDataMap = new Map<string, { tipo: string; tipo_cobro_descuento_id: string | null; monto: number | null }>((incidenciasTipoRes.data || []).map((i: any) => [i.id, { tipo: i.tipo, tipo_cobro_descuento_id: i.tipo_cobro_descuento_id, monto: i.monto }]))
      const incidenciasConTipo = (incidenciasRes.data || []).map((inc: any) => {
        const extraData = extraDataMap.get(inc.id)
        return {
          ...inc,
          tipo: extraData?.tipo || 'cobro',
          tipo_cobro_descuento_id: extraData?.tipo_cobro_descuento_id || inc.tipo_cobro_descuento_id,
          monto: extraData?.monto || inc.monto // Traer monto de la tabla
        }
      })
      setIncidencias(incidenciasConTipo)
      
      // Combinar datos de la vista con datos frescos de la tabla penalidades
      const penalidadTableDataMap = new Map<string, { incidencia_id: string | null; aplicado: boolean; rechazado: boolean; fecha_rechazo: string | null; motivo_rechazo: string | null }>()
      for (const p of (penalidadesTableRes.data || [])) {
        penalidadTableDataMap.set(p.id, { 
          incidencia_id: p.incidencia_id || null,
          aplicado: p.aplicado ?? false,
          rechazado: p.rechazado ?? false, 
          fecha_rechazo: p.fecha_rechazo, 
          motivo_rechazo: p.motivo_rechazo 
        })
      }
      
      // Mapa de rechazos desde penalidades_rechazos (último rechazo por penalidad)
      const rechazosMap = new Map<string, { motivo: string; fecha: string }>()
      for (const r of (rechazosRes.data || [])) {
        if (!rechazosMap.has(r.penalidad_id)) {
          rechazosMap.set(r.penalidad_id, { motivo: r.motivo, fecha: r.created_at })
        }
      }
      
      const penData = (penalidadesRes.data || []).map((p: any) => {
        const tableData = penalidadTableDataMap.get(p.id)
        const rechazoHistorial = rechazosMap.get(p.id)
        // Una penalidad está rechazada SOLO si tiene rechazado=true en la tabla
        // El historial de rechazos es solo para mostrar el historial, no determina el estado actual
        const estaRechazado = tableData?.rechazado ?? false
        return {
          ...p,
          incidencia_id: tableData?.incidencia_id ?? p.incidencia_id ?? null,
          aplicado: tableData?.aplicado ?? p.aplicado ?? false,
          rechazado: estaRechazado,
          fecha_rechazo: tableData?.fecha_rechazo || (estaRechazado ? rechazoHistorial?.fecha : null) || null,
          motivo_rechazo: tableData?.motivo_rechazo || (estaRechazado ? rechazoHistorial?.motivo : null) || null
        }
      })
      setPenalidades(penData)

      // Cargar cuotas fraccionadas para saber qué penalidades tienen fraccionamiento
      const { data: cuotasData } = await (supabase.from('penalidades_cuotas' as any) as any)
        .select('penalidad_id, aplicado')
      
      if (cuotasData && cuotasData.length > 0) {
        // Agrupar por penalidad_id
        const fracMap = new Map<string, { total_cuotas: number; cuotas_pendientes: number }>()
        for (const cuota of cuotasData) {
          const existing = fracMap.get(cuota.penalidad_id) || { total_cuotas: 0, cuotas_pendientes: 0 }
          existing.total_cuotas++
          if (!cuota.aplicado) existing.cuotas_pendientes++
          fracMap.set(cuota.penalidad_id, existing)
        }
        setFraccionamientoMap(fracMap)
      }

      // Estado inicial del form
      if (estadosRes.data && estadosRes.data.length > 0) {
        const estadoPendiente = estadosRes.data.find((e: any) => e.codigo === 'PENDIENTE')
        if (estadoPendiente) {
          setIncidenciaForm(prev => ({ ...prev, estado_id: estadoPendiente.id }))
        }
      }
    } catch (error) {
      console.error('Error cargando datos:', error)
      Swal.fire('Error', 'No se pudieron cargar los datos', 'error')
    } finally {
      setLoading(false)
    }
  }


  // Listas de valores únicos para filtros - Incidencias
  const patentesUnicas = useMemo(() =>
    [...new Set(incidencias.map(i => i.patente_display).filter(Boolean))].sort() as string[]
  , [incidencias])

  const conductoresUnicos = useMemo(() =>
    [...new Set(incidencias.map(i => i.conductor_display).filter(Boolean))].sort() as string[]
  , [incidencias])

  const estadosUnicos = useMemo(() =>
    [...new Set(incidencias.map(i => i.estado_nombre).filter(Boolean))].sort() as string[]
  , [incidencias])

  const turnosUnicos = useMemo(() =>
    [...new Set(incidencias.map(i => i.turno).filter(Boolean))].sort() as string[]
  , [incidencias])

  const areasUnicas = useMemo(() =>
    [...new Set(incidencias.map(i => i.area).filter(Boolean))].sort() as string[]
  , [incidencias])


  // Listas para penalidades
  const penPatentesUnicas = useMemo(() =>
    [...new Set(penalidades.map(p => p.patente_display).filter(Boolean))].sort() as string[]
  , [penalidades])

  const penConductoresUnicos = useMemo(() =>
    [...new Set(penalidades.map(p => p.conductor_display).filter(Boolean))].sort() as string[]
  , [penalidades])

  const penTiposUnicos = useMemo(() =>
    [...new Set(penalidades.map(p => p.tipo_nombre).filter(Boolean))].sort() as string[]
  , [penalidades])


  // Filtrar incidencias LOGÍSTICAS (sin tipo o tipo='logistica')
  const incidenciasLogisticas = useMemo(() => {
    let filtered = incidencias.filter(i => !i.tipo || i.tipo === 'logistica')
    
    // Filtro de fecha
    if (dateRangeLogistica && dateRangeLogistica.type !== 'all') {
      filtered = filtered.filter(i => {
        if (!i.fecha) return false
        return i.fecha >= dateRangeLogistica.startDate && i.fecha <= dateRangeLogistica.endDate
      })
    }

    if (patenteFilter.length > 0) {
      filtered = filtered.filter(i => patenteFilter.includes(i.patente_display || ''))
    }
    if (conductorFilter.length > 0) {
      filtered = filtered.filter(i => conductorFilter.includes(i.conductor_display || ''))
    }
    if (estadoFilter.length > 0) {
      filtered = filtered.filter(i => estadoFilter.includes(i.estado_nombre || ''))
    }
    if (turnoFilter.length > 0) {
      filtered = filtered.filter(i => turnoFilter.includes(i.turno || ''))
    }
    if (areaFilter.length > 0) {
      filtered = filtered.filter(i => areaFilter.includes(i.area || ''))
    }

    return filtered
  }, [incidencias, patenteFilter, conductorFilter, estadoFilter, turnoFilter, areaFilter, dateRangeLogistica])

  // Filtrar incidencias de COBRO (tipo='cobro')
  const incidenciasCobro = useMemo(() => {
    let filtered = incidencias.filter(i => i.tipo === 'cobro')
    
    // Filtro de fecha
    if (dateRangeCobro && dateRangeCobro.type !== 'all') {
      filtered = filtered.filter(i => {
        if (!i.fecha) return false
        return i.fecha >= dateRangeCobro.startDate && i.fecha <= dateRangeCobro.endDate
      })
    }
    
    // Filtro de pendientes de enviar a facturación
    if (soloPendientesEnviar) {
      filtered = filtered.filter(i => {
        const penalidad = penalidades.find(p => p.incidencia_id === i.id)
        // Puede enviarse si no tiene penalidad O si fue rechazada
        return !penalidad || penalidad.rechazado === true
      })
    }

    if (patenteFilter.length > 0) {
      filtered = filtered.filter(i => patenteFilter.includes(i.patente_display || ''))
    }
    if (conductorFilter.length > 0) {
      filtered = filtered.filter(i => conductorFilter.includes(i.conductor_display || ''))
    }
    if (estadoFilter.length > 0) {
      filtered = filtered.filter(i => estadoFilter.includes(i.estado_nombre || ''))
    }
    if (turnoFilter.length > 0) {
      filtered = filtered.filter(i => turnoFilter.includes(i.turno || ''))
    }
    if (areaFilter.length > 0) {
      filtered = filtered.filter(i => areaFilter.includes(i.area || ''))
    }

    return filtered
  }, [incidencias, patenteFilter, conductorFilter, estadoFilter, turnoFilter, areaFilter, dateRangeCobro, soloPendientesEnviar, penalidades])

  // Incidencias que pueden enviarse a facturación (no tienen penalidad o fue rechazada, y tienen monto)
  const incidenciasEnviables = useMemo(() => {
    return incidenciasCobro.filter(i => {
      const penalidad = penalidades.find(p => p.incidencia_id === i.id)
      const puedeEnviar = !penalidad || penalidad.rechazado === true
      const tieneMonto = (i.monto || 0) > 0
      return puedeEnviar && tieneMonto
    })
  }, [incidenciasCobro, penalidades])

  // Handlers para selección masiva
  const handleToggleSeleccion = (id: string) => {
    setIncidenciasSeleccionadas(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  const handleSeleccionarTodas = () => {
    setIncidenciasSeleccionadas(new Set(incidenciasEnviables.map(i => i.id)))
  }

  const handleDeseleccionarTodas = () => {
    setIncidenciasSeleccionadas(new Set())
  }

  // Enviar seleccionadas a facturación
  async function handleEnviarMasivo() {
    if (incidenciasSeleccionadas.size === 0) return
    
    const seleccionadas = incidenciasCobro.filter(i => incidenciasSeleccionadas.has(i.id))
    
    const confirmResult = await Swal.fire({
      icon: 'question',
      title: 'Enviar a facturación',
      html: `¿Confirmas enviar <strong>${seleccionadas.length}</strong> incidencias a facturación?<br><br>
        <strong>Monto total:</strong> $${seleccionadas.reduce((sum, i) => sum + (i.monto || 0), 0).toLocaleString('es-AR')}`,
      showCancelButton: true,
      confirmButtonText: 'Enviar todas',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#10b981'
    })
    
    if (!confirmResult.isConfirmed) return
    
    setEnviandoMasivo(true)
    let enviados = 0
    let errores = 0
    
    for (const incidencia of seleccionadas) {
      try {
        // Verificar si ya tiene penalidad (para reenvío)
        const penalidadExistente = penalidades.find(p => p.incidencia_id === incidencia.id)
        
        if (penalidadExistente?.rechazado) {
          // Reenvío - actualizar penalidad existente
          const { error } = await (supabase.from('penalidades' as any) as any)
            .update({
              monto: incidencia.monto,
              rechazado: false,
              fecha_rechazo: null,
              motivo_rechazo: null,
              aplicado: false,
              fecha_aplicacion: null
            })
            .eq('id', penalidadExistente.id)
          if (error) throw error
        } else {
          // Nueva penalidad
          const semana = getWeekNumber(incidencia.fecha || new Date().toISOString().split('T')[0])
          const { error } = await (supabase.from('penalidades' as any) as any)
            .insert({
              incidencia_id: incidencia.id,
              vehiculo_id: incidencia.vehiculo_id || null,
              conductor_id: incidencia.conductor_id || null,
              tipo_cobro_descuento_id: incidencia.tipo_cobro_descuento_id || null,
              semana,
              fecha: incidencia.fecha,
              turno: incidencia.turno || null,
              area_responsable: 'LOGISTICA',
              detalle: 'Cobro por incidencia',
              monto: incidencia.monto,
              observaciones: incidencia.descripcion || '',
              aplicado: false,
              conductor_nombre: incidencia.conductor_display,
              vehiculo_patente: incidencia.patente_display,
              created_by: user?.id,
              created_by_name: profile?.full_name || 'Sistema'
            })
          if (error) throw error
        }
        enviados++
      } catch (error) {
        console.error('Error enviando incidencia:', incidencia.id, error)
        errores++
      }
    }
    
    setEnviandoMasivo(false)
    setModoSeleccionMasiva(false)
    setIncidenciasSeleccionadas(new Set())
    
    if (errores > 0) {
      Swal.fire('Resultado', `Enviadas: ${enviados}, Errores: ${errores}`, 'warning')
    } else {
      Swal.fire({
        icon: 'success',
        title: 'Enviadas a facturación',
        text: `${enviados} incidencias enviadas correctamente`,
        timer: 2000,
        showConfirmButton: false
      })
    }
    
    cargarDatos()
  }

  // Incidencias filtradas según tab activo
  const incidenciasFiltradas = activeTab === 'logistica' ? incidenciasLogisticas : incidenciasCobro

  // Custom Global Filter para Incidencias
  // Permite filtrar estrictamente por estado "Pendiente" cuando se busca esa palabra exacta
  const customGlobalFilter = useMemo<FilterFn<IncidenciaCompleta>>(() => {
    return (row, _columnId, filterValue) => {
      if (!filterValue || typeof filterValue !== 'string') return true
      
      const searchLower = filterValue.toLowerCase().trim()
      
      // LOGICA ESPECIFICA: Si busca "pendiente", filtrar SOLO por estado Pendiente
      if (searchLower === 'pendiente') {
        const estado = row.original.estado_nombre?.toLowerCase() || ''
        return estado === 'pendiente'
      }

      // Comportamiento default para otros términos
      const original = row.original as unknown as Record<string, unknown>

      const collectStrings = (obj: unknown, depth = 0): string => {
        if (depth > 3) return ''
        if (obj === null || obj === undefined) return ''
        if (typeof obj === 'string') return obj + ' '
        if (typeof obj === 'number') return String(obj) + ' '
        if (Array.isArray(obj)) return obj.map(item => collectStrings(item, depth + 1)).join(' ')
        if (typeof obj === 'object') {
          return Object.values(obj as Record<string, unknown>)
            .map(val => collectStrings(val, depth + 1))
            .join(' ')
        }
        return ''
      }

      const allText = collectStrings(original).toLowerCase()
      
      // Buscar término completo o palabras
      if (allText.includes(searchLower)) return true
      
      const words = searchLower.split(/\s+/).filter(w => w.length > 0)
      if (words.length > 1) {
        return words.every(word => allText.includes(word))
      }
      
      return false
    }
  }, [])

  // Filtrar penalidades con filtros tipo Excel
  const penalidadesFiltradas = useMemo(() => {
    let filtered = [...penalidades]

    if (activeTab === 'por_aplicar') {
      filtered = filtered.filter(p => !p.aplicado && !p.rechazado)
    } else if (activeTab === 'aplicadas') {
      filtered = filtered.filter(p => p.aplicado && !p.rechazado)
    } else if (activeTab === 'rechazados') {
      filtered = filtered.filter(p => p.rechazado)
    }

    if (penPatenteFilter.length > 0) {
      filtered = filtered.filter(p => penPatenteFilter.includes(p.patente_display || ''))
    }
    if (penConductorFilter.length > 0) {
      filtered = filtered.filter(p => penConductorFilter.includes(p.conductor_display || ''))
    }
    if (penTipoFilter.length > 0) {
      filtered = filtered.filter(p => penTipoFilter.includes(p.tipo_nombre || ''))
    }
    if (penAplicadoFilter.length > 0) {
      filtered = filtered.filter(p => {
        const aplicadoStr = p.aplicado ? 'Sí' : 'No'
        return penAplicadoFilter.includes(aplicadoStr)
      })
    }

    return filtered
  }, [penalidades, activeTab, penPatenteFilter, penConductorFilter, penTipoFilter, penAplicadoFilter])

  // Columnas para tabla de incidencias
  const incidenciasColumns = useMemo<ColumnDef<IncidenciaCompleta>[]>(() => [
    {
      accessorKey: 'fecha',
      header: 'Fecha',
      cell: ({ row }) => formatDate(row.original.fecha)
    },
    {
      accessorKey: 'semana',
      header: 'Sem',
      cell: ({ row }) => row.original.semana || '-'
    },
    {
      accessorKey: 'patente_display',
      header: () => (
        <ExcelColumnFilter
          label="Patente"
          options={patentesUnicas}
          selectedValues={patenteFilter}
          onSelectionChange={setPatenteFilter}
          filterId="inc_patente"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => <span className="dt-badge dt-badge-gray">{row.original.patente_display || '-'}</span>
    },
    {
      accessorKey: 'conductor_display',
      header: () => (
        <ExcelColumnFilter
          label="Conductor"
          options={conductoresUnicos}
          selectedValues={conductorFilter}
          onSelectionChange={setConductorFilter}
          filterId="inc_conductor"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => row.original.conductor_display || '-'
    },
    {
      accessorKey: 'turno',
      header: () => (
        <ExcelColumnFilter
          label="Tipo"
          options={turnosUnicos}
          selectedValues={turnoFilter}
          onSelectionChange={setTurnoFilter}
          filterId="inc_turno"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => {
        const turno = row.original.turno
        if (!turno) return '-'
        const color = turno === 'Diurno' ? 'yellow' : turno === 'Nocturno' ? 'blue' : 'gray'
        return <span className={`dt-badge dt-badge-${color}`}>{turno}</span>
      }
    },
    {
      accessorKey: 'area',
      header: () => (
        <ExcelColumnFilter
          label="Area"
          options={areasUnicas}
          selectedValues={areaFilter}
          onSelectionChange={setAreaFilter}
          filterId="inc_area"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => row.original.area || '-'
    },
    {
      accessorKey: 'estado_nombre',
      header: () => (
        <ExcelColumnFilter
          label="Estado"
          options={estadosUnicos}
          selectedValues={estadoFilter}
          onSelectionChange={setEstadoFilter}
          filterId="inc_estado"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => {
        const color = row.original.estado_color || 'gray'
        return <span className={`dt-badge dt-badge-${color}`}>{row.original.estado_nombre}</span>
      }
    },
    {
      accessorKey: 'registrado_por',
      header: 'Responsable',
      cell: ({ row }) => row.original.registrado_por || '-'
    },
    {
      accessorKey: 'created_at',
      header: 'Creado',
      cell: ({ row }) => {
        if (!row.original.created_at) return '-'
        return new Date(row.original.created_at).toLocaleDateString('es-AR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      }
    },
    {
      id: 'acciones',
      header: 'Acciones',
      cell: ({ row }) => (
        <div className="dt-actions">
          <button className="dt-btn-action dt-btn-view" data-tooltip="Ver detalle" onClick={() => handleVerIncidencia(row.original)}>
            <Eye size={14} />
          </button>
          <button className="dt-btn-action dt-btn-edit" data-tooltip="Editar" onClick={() => handleEditarIncidencia(row.original)}>
            <Edit2 size={14} />
          </button>
          {canDelete && (
            <button className="dt-btn-action dt-btn-delete" data-tooltip="Eliminar" onClick={() => handleEliminarIncidencia(row.original)}>
              <Trash2 size={14} />
            </button>
          )}
        </div>
      )
    }
  ], [patentesUnicas, patenteFilter, conductoresUnicos, conductorFilter, turnosUnicos, turnoFilter, areasUnicas, areaFilter, estadosUnicos, estadoFilter, openFilterId, canDelete])

  // Columnas específicas para incidencias de COBRO (incluye botón generar cobro/descuento)
  const incidenciasCobroColumns = useMemo<ColumnDef<IncidenciaCompleta>[]>(() => {
    const cols: ColumnDef<IncidenciaCompleta>[] = []
    
    // Columna de checkbox solo en modo selección masiva
    if (modoSeleccionMasiva) {
      cols.push({
        id: 'seleccion',
        header: '',
        size: 40,
        cell: ({ row }) => {
          const puedeEnviar = incidenciasEnviables.some(i => i.id === row.original.id)
          if (!puedeEnviar) return <span style={{ opacity: 0.3 }}><Square size={16} /></span>
          
          const seleccionada = incidenciasSeleccionadas.has(row.original.id)
          return (
            <button
              onClick={() => handleToggleSeleccion(row.original.id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
            >
              {seleccionada ? <CheckSquare size={18} color="#10b981" /> : <Square size={18} color="#9ca3af" />}
            </button>
          )
        }
      })
    }
    
    cols.push({
      accessorKey: 'fecha',
      header: 'Fecha',
      cell: ({ row }) => formatDate(row.original.fecha)
    },
    {
      accessorKey: 'semana',
      header: 'Sem',
      cell: ({ row }) => row.original.semana || '-'
    },
    {
      accessorKey: 'patente_display',
      header: () => (
        <ExcelColumnFilter
          label="Patente"
          options={patentesUnicas}
          selectedValues={patenteFilter}
          onSelectionChange={setPatenteFilter}
          filterId="inc_cobro_patente"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => <span className="dt-badge dt-badge-gray">{row.original.patente_display || '-'}</span>
    },
    {
      accessorKey: 'conductor_display',
      header: () => (
        <ExcelColumnFilter
          label="Conductor"
          options={conductoresUnicos}
          selectedValues={conductorFilter}
          onSelectionChange={setConductorFilter}
          filterId="inc_cobro_conductor"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => row.original.conductor_display || '-'
    },
    {
      accessorKey: 'monto',
      header: 'Monto',
      cell: ({ row }) => {
        const monto = row.original.monto || row.original.monto_penalidades
        if (!monto) return '-'
        return <span style={{ fontWeight: 600, color: '#F59E0B' }}>{formatMoney(monto)}</span>
      }
    },
    {
      accessorKey: 'turno',
      header: () => (
        <ExcelColumnFilter
          label="Tipo"
          options={turnosUnicos}
          selectedValues={turnoFilter}
          onSelectionChange={setTurnoFilter}
          filterId="inc_cobro_turno"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => {
        const turno = row.original.turno
        if (!turno) return '-'
        const color = turno === 'Diurno' ? 'yellow' : turno === 'Nocturno' ? 'blue' : 'gray'
        return <span className={`dt-badge dt-badge-${color}`}>{turno}</span>
      }
    },
    {
      accessorKey: 'area',
      header: () => (
        <ExcelColumnFilter
          label="Area"
          options={areasUnicas}
          selectedValues={areaFilter}
          onSelectionChange={setAreaFilter}
          filterId="inc_cobro_area"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => row.original.area || '-'
    },
    {
      accessorKey: 'estado_nombre',
      header: () => (
        <ExcelColumnFilter
          label="Estado"
          options={estadosUnicos}
          selectedValues={estadoFilter}
          onSelectionChange={setEstadoFilter}
          filterId="inc_cobro_estado"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => {
        const color = row.original.estado_color || 'gray'
        return <span className={`dt-badge dt-badge-${color}`}>{row.original.estado_nombre}</span>
      }
    },
    {
      accessorKey: 'registrado_por',
      header: 'Responsable',
      cell: ({ row }) => row.original.registrado_por || '-'
    },
    {
      accessorKey: 'created_at',
      header: 'Creado',
      cell: ({ row }) => {
        if (!row.original.created_at) return '-'
        return new Date(row.original.created_at).toLocaleDateString('es-AR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      }
    },
    {
      id: 'acciones',
      header: 'Acciones',
      cell: ({ row }) => {
        // Buscar penalidad asociada - total_penalidades > 0 significa que tiene penalidad
        const tienePenalidad = (row.original.total_penalidades || 0) > 0
        // Si tiene penalidad, verificar si está rechazada
        const penalidadAsociada = tienePenalidad ? penalidades.find(p => p.incidencia_id === row.original.id) : null
        const estaRechazada = penalidadAsociada?.rechazado === true
        // Puede enviar: no tiene penalidad O está rechazada
        const puedeEnviar = !tienePenalidad || estaRechazada
        
        return (
          <div className="dt-actions">
            <button className="dt-btn-action dt-btn-view" data-tooltip="Ver detalle" onClick={() => handleVerIncidencia(row.original)}>
              <Eye size={14} />
            </button>
            <button className="dt-btn-action dt-btn-edit" data-tooltip="Editar" onClick={() => handleEditarIncidencia(row.original)}>
              <Edit2 size={14} />
            </button>
            {puedeEnviar ? (
              <button 
                className={`dt-btn-action ${estaRechazada ? 'dt-btn-danger' : 'dt-btn-warning'}`}
                data-tooltip={estaRechazada ? 'Reenviar a facturación' : 'Enviar a facturación'}
                onClick={() => handleEnviarAFacturacion(row.original)}
              >
                <DollarSign size={14} />
              </button>
            ) : (
              <button 
                className="dt-btn-action dt-btn-success" 
                data-tooltip="Ya enviado a facturación"
                style={{ opacity: 0.5, cursor: 'default' }}
              >
                <CheckCircle size={14} />
              </button>
            )}
            {canDelete && (
              <button className="dt-btn-action dt-btn-delete" data-tooltip="Eliminar" onClick={() => handleEliminarIncidencia(row.original)}>
                <Trash2 size={14} />
              </button>
            )}
          </div>
        )
      }
    })
    
    return cols
  }, [patentesUnicas, patenteFilter, conductoresUnicos, conductorFilter, turnosUnicos, turnoFilter, areasUnicas, areaFilter, estadosUnicos, estadoFilter, openFilterId, canDelete, modoSeleccionMasiva, incidenciasSeleccionadas, incidenciasEnviables, penalidades])

  // Columnas para tabla de penalidades
  const penalidadesColumns = useMemo<ColumnDef<PenalidadCompleta>[]>(() => [
    {
      accessorKey: 'fecha',
      header: 'Fecha',
      cell: ({ row }) => formatDate(row.original.fecha)
    },
    {
      accessorKey: 'semana',
      header: 'Sem',
      cell: ({ row }) => row.original.semana || '-'
    },
    {
      accessorKey: 'patente_display',
      header: () => (
        <ExcelColumnFilter
          label="Patente"
          options={penPatentesUnicas}
          selectedValues={penPatenteFilter}
          onSelectionChange={setPenPatenteFilter}
          filterId="pen_patente"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => <span className="dt-badge dt-badge-gray">{row.original.patente_display || '-'}</span>
    },
    {
      accessorKey: 'conductor_display',
      header: () => (
        <ExcelColumnFilter
          label="Conductor"
          options={penConductoresUnicos}
          selectedValues={penConductorFilter}
          onSelectionChange={setPenConductorFilter}
          filterId="pen_conductor"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => row.original.conductor_display || '-'
    },
    {
      accessorKey: 'tipo_nombre',
      header: () => (
        <ExcelColumnFilter
          label="Tipo"
          options={penTiposUnicos}
          selectedValues={penTipoFilter}
          onSelectionChange={setPenTipoFilter}
          filterId="pen_tipo"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => row.original.tipo_nombre || '-'
    },
    {
      accessorKey: 'monto',
      header: 'Monto',
      cell: ({ row }) => <span style={{ fontWeight: 600, color: '#F59E0B' }}>{formatMoney(row.original.monto)}</span>
    },
    {
      accessorKey: 'aplicado',
      header: () => (
        <ExcelColumnFilter
          label="Aplicado"
          options={['Sí', 'No']}
          selectedValues={penAplicadoFilter}
          onSelectionChange={setPenAplicadoFilter}
          filterId="pen_aplicado"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => (
        <span className={`dt-badge ${row.original.aplicado ? 'dt-badge-green' : 'dt-badge-red'}`}>
          {row.original.aplicado ? <><CheckCircle size={12} /> Sí</> : <><XCircle size={12} /> No</>}
        </span>
      )
    },
    {
      id: 'fraccionado',
      header: 'Fracc.',
      cell: ({ row }) => {
        const fracInfo = fraccionamientoMap.get(row.original.id)
        if (!fracInfo) {
          return <span className="text-gray-400">-</span>
        }
        const pendientes = fracInfo.cuotas_pendientes
        const total = fracInfo.total_cuotas
        return (
          <span 
            className="dt-badge" 
            style={{ 
              backgroundColor: pendientes > 0 ? '#FEF3C7' : '#DCFCE7', 
              color: pendientes > 0 ? '#92400E' : '#166534',
              fontSize: '11px'
            }}
            title={pendientes > 0 ? `${pendientes} cuotas pendientes de ${total}` : 'Todas las cuotas aplicadas'}
          >
            {pendientes > 0 ? `${pendientes}/${total} pend.` : `${total} cuotas`}
          </span>
        )
      }
    },
    {
      id: 'acciones',
      header: 'Acciones',
      cell: ({ row }) => {
        const esRechazado = row.original.rechazado
        const esAplicado = row.original.aplicado
        
        return (
          <div className="dt-actions">
            {/* Botón aplicar solo en Por Aplicar (no aplicado, no rechazado) */}
            {!esAplicado && !esRechazado && (
              <button className="dt-btn-action dt-btn-success" data-tooltip="Aplicar a facturación" onClick={() => handleMarcarAplicado(row.original)}>
                <CheckCircle size={14} />
              </button>
            )}
            {/* Botón rechazar solo en Por Aplicar */}
            {!esAplicado && !esRechazado && (
              <button 
                className="dt-btn-action dt-btn-danger" 
                data-tooltip="Rechazar" 
                onClick={() => {
                  setPenalidadRechazar(row.original)
                  setMotivoRechazo('')
                  setShowRechazoModal(true)
                }}
              >
                <Ban size={14} />
              </button>
            )}
            {/* Botones de aplicadas */}
            {esAplicado && !esRechazado && (
              <>
                <button className="dt-btn-action dt-btn-info" data-tooltip="Reasignar semana" onClick={() => handleReasignarSemana(row.original)}>
                  <Calendar size={14} />
                </button>
                <button className="dt-btn-action dt-btn-warning" data-tooltip="Desaplicar" onClick={() => handleDesaplicar(row.original)}>
                  <XCircle size={14} />
                </button>
              </>
            )}
            {/* Ver detalle siempre visible */}
            <button className="dt-btn-action dt-btn-view" data-tooltip="Ver detalle" onClick={() => handleVerPenalidad(row.original)}>
              <Eye size={14} />
            </button>
            {/* Editar y eliminar no en rechazados */}
            {!esRechazado && (
              <>
                <button className="dt-btn-action dt-btn-edit" data-tooltip="Editar" onClick={() => handleEditarPenalidad(row.original)}>
                  <Edit2 size={14} />
                </button>
                {canDelete && (
                  <button className="dt-btn-action dt-btn-delete" data-tooltip="Eliminar" onClick={() => handleEliminarPenalidad(row.original)}>
                    <Trash2 size={14} />
                  </button>
                )}
              </>
            )}
          </div>
        )
      }
    }
  ], [penPatentesUnicas, penPatenteFilter, penConductoresUnicos, penConductorFilter, penTiposUnicos, penTipoFilter, penAplicadoFilter, openFilterId, canDelete, fraccionamientoMap])

  function handleNuevaIncidencia() {
    const estadoPendiente = estados.find(e => e.codigo === 'PENDIENTE')
    const areaUsuario = getAreaPorRol(profile?.roles?.name)
    setIncidenciaForm({
      estado_id: estadoPendiente?.id || '',
      fecha: getLocalDateString(),
      registrado_por: profile?.full_name || '',
      area: areaUsuario || undefined
    })
    setSelectedIncidencia(null)
    setModalMode('create')
    setModalType('incidencia')
    setShowModal(true)
  }

  // Generar Cobro/Descuento (penalidad) desde una incidencia de cobro
  // Enviar incidencia a facturación (crear penalidad asociada)
  async function handleEnviarAFacturacion(incidencia: IncidenciaCompleta) {
    // Verificar si ya existe una penalidad asociada a esta incidencia (consulta directa a BD)
    const { data: penalidadesExistentes, error: checkError } = await (supabase
      .from('penalidades' as any) as any)
      .select('id, monto, fecha, aplicado, rechazado')
      .eq('incidencia_id', incidencia.id)
    
    if (checkError) {
      Swal.fire('Error', 'No se pudo verificar el estado del cobro', 'error')
      return
    }
    
    // Verificar si existe penalidad rechazada (para reenvío)
    const penalidadRechazada = penalidadesExistentes?.find((p: any) => p.rechazado === true)
    
    // Si ya existe penalidad NO rechazada, NO permitir crear otra
    // Solo bloquear si hay penalidades y NINGUNA está rechazada
    if (penalidadesExistentes && penalidadesExistentes.length > 0 && !penalidadRechazada) {
      const montoTotal = penalidadesExistentes.reduce((sum: number, p: any) => sum + (p.monto || 0), 0)
      Swal.fire({
        icon: 'info',
        title: 'Ya enviado a facturación',
        html: `Esta incidencia ya fue enviada a facturación.<br><br>Monto: <strong>$${montoTotal.toLocaleString('es-AR')}</strong><br><br>Revisa la pestaña <strong>Cobros/Descuentos</strong> para ver o aplicar el cobro.`,
        confirmButtonText: 'Entendido'
      })
      return
    }
    
    // Validar que tenga monto
    if (!incidencia.monto || incidencia.monto <= 0) {
      Swal.fire('Error', 'La incidencia no tiene monto definido para enviar a facturación. Edite la incidencia y agregue el monto.', 'warning')
      return
    }
    
    // Si es reenvío (penalidad rechazada), actualizar en lugar de crear
    if (penalidadRechazada) {
      const confirmReenvio = await Swal.fire({
        icon: 'warning',
        title: 'Reenviar a facturación',
        html: `Esta incidencia fue rechazada anteriormente.<br><br>
          <strong>Conductor:</strong> ${incidencia.conductor_display || 'N/A'}<br>
          <strong>Monto:</strong> $${incidencia.monto?.toLocaleString('es-AR') || 0}<br><br>
          ¿Confirmas reenviar a facturación?`,
        showCancelButton: true,
        confirmButtonText: 'Reenviar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#dc2626'
      })
      
      if (!confirmReenvio.isConfirmed) return
      
      try {
        const { error } = await (supabase.from('penalidades' as any) as any)
          .update({
            monto: incidencia.monto,
            rechazado: false,
            fecha_rechazo: null,
            motivo_rechazo: null,
            aplicado: false,
            fecha_aplicacion: null
          })
          .eq('id', penalidadRechazada.id)
        
        if (error) throw error
        
        Swal.fire({
          icon: 'success',
          title: 'Reenviado',
          text: 'La incidencia fue reenviada a facturación',
          timer: 2000,
          showConfirmButton: false
        })
        cargarDatos()
        return
      } catch (error: any) {
        Swal.fire('Error', error.message || 'No se pudo reenviar', 'error')
        return
      }
    }
    
    // Confirmar envío (nuevo)
    const confirmResult = await Swal.fire({
      icon: 'question',
      title: 'Enviar a facturación',
      html: `¿Confirmas enviar esta incidencia a facturación?<br><br>
        <strong>Conductor:</strong> ${incidencia.conductor_display || 'N/A'}<br>
        <strong>Vehículo:</strong> ${incidencia.patente_display || 'N/A'}<br>
        <strong>Monto:</strong> $${incidencia.monto?.toLocaleString('es-AR') || 0}<br>
        <strong>Descripción:</strong> ${incidencia.descripcion || 'Sin descripción'}`,
      showCancelButton: true,
      confirmButtonText: 'Enviar a facturación',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#10b981'
    })
    
    if (!confirmResult.isConfirmed) return
    
    // Crear la penalidad
    try {
      const areaResponsable = getAreaResponsablePorRol(profile?.roles?.name)
      const semanaCalculada = getWeekNumber(incidencia.fecha || getLocalDateString())
      
      const penalidadData = {
        incidencia_id: incidencia.id,
        vehiculo_id: incidencia.vehiculo_id || null,
        conductor_id: incidencia.conductor_id || null,
        tipo_cobro_descuento_id: incidencia.tipo_cobro_descuento_id || null,
        semana: semanaCalculada,
        fecha: incidencia.fecha || getLocalDateString(),
        turno: incidencia.turno || null,
        area_responsable: areaResponsable || 'LOGISTICA',
        detalle: 'Cobro por incidencia',
        monto: incidencia.monto,
        observaciones: incidencia.descripcion || '',
        aplicado: false,
        conductor_nombre: incidencia.conductor_display,
        vehiculo_patente: incidencia.patente_display,
        created_by: user?.id,
        created_by_name: profile?.full_name || 'Sistema'
      }
      
      const { data: insertedData, error: insertError } = await (supabase.from('penalidades' as any) as any)
        .insert(penalidadData)
        .select('*')
        .single()
      
      if (insertError) throw insertError
      
      // Forzar aplicado = false después de insertar (por si hay un default/trigger en BD)
      if (insertedData && insertedData.aplicado === true) {
        await (supabase.from('penalidades' as any) as any)
          .update({ aplicado: false, fecha_aplicacion: null, semana_aplicacion: null, anio_aplicacion: null })
          .eq('id', insertedData.id)
      }
      
      Swal.fire({
        icon: 'success',
        title: 'Enviado a facturación',
        html: 'El cobro fue registrado correctamente.<br>Aparecerá en la pestaña <strong>Cobros/Descuentos</strong> como "Por Aplicar".',
        timer: 3000,
        showConfirmButton: false
      })
      
      // Recargar datos para actualizar la vista
      cargarDatos()
      
    } catch (error: any) {
      console.error('Error creando penalidad:', error)
      Swal.fire('Error', error.message || 'No se pudo enviar a facturación', 'error')
    }
  }

  function handleVerIncidencia(incidencia: IncidenciaCompleta) {
    setSelectedIncidencia(incidencia)
    setModalMode('view')
    setModalType('incidencia')
    setShowModal(true)
  }

  function handleEditarIncidencia(incidencia: IncidenciaCompleta) {
    setSelectedIncidencia(incidencia)
    setIncidenciaForm({
      vehiculo_id: incidencia.vehiculo_id,
      conductor_id: incidencia.conductor_id,
      estado_id: incidencia.estado_id,
      semana: incidencia.semana,
      fecha: incidencia.fecha,
      turno: incidencia.turno,
      area: incidencia.area,
      estado_vehiculo: incidencia.estado_vehiculo,
      descripcion: incidencia.descripcion,
      accion_ejecutada: incidencia.accion_ejecutada,
      registrado_por: incidencia.registrado_por,
      conductor_nombre: incidencia.conductor_nombre,
      vehiculo_patente: incidencia.vehiculo_patente,
      tipo_cobro_descuento_id: incidencia.tipo_cobro_descuento_id,
      monto: incidencia.monto // Cargar monto al editar
    })
    setModalMode('edit')
    setModalType('incidencia')
    setShowModal(true)
  }

  async function handleVerPenalidad(penalidad: PenalidadCompleta) {
    // Limpiar historial anterior y mostrar loading
    setHistorialRechazos([])
    setLoadingHistorial(true)
    setSelectedPenalidad(penalidad)
    setModalMode('view')
    setModalType('penalidad')
    setShowModal(true)
    
    // Cargar historial de rechazos
    const { data } = await (supabase.from('penalidades_rechazos' as any) as any)
      .select('id, motivo, rechazado_por_nombre, created_at')
      .eq('penalidad_id', penalidad.id)
      .order('created_at', { ascending: false })
    
    setHistorialRechazos(data || [])
    setLoadingHistorial(false)
  }

  function handleEditarPenalidad(penalidad: PenalidadCompleta) {
    setSelectedPenalidad(penalidad)
    setPenalidadForm({
      vehiculo_id: penalidad.vehiculo_id,
      conductor_id: penalidad.conductor_id,
      tipo_penalidad_id: penalidad.tipo_penalidad_id,
      semana: penalidad.semana,
      fecha: penalidad.fecha,
      turno: penalidad.turno,
      area_responsable: penalidad.area_responsable,
      detalle: penalidad.detalle,
      monto: penalidad.monto,
      observaciones: penalidad.observaciones,
      aplicado: penalidad.aplicado,
      nota_administrativa: penalidad.nota_administrativa,
      conductor_nombre: penalidad.conductor_nombre,
      vehiculo_patente: penalidad.vehiculo_patente
    })
    setModalMode('edit')
    setModalType('penalidad')
    setShowModal(true)
  }

  async function handleEliminarIncidencia(incidencia: IncidenciaCompleta) {
    if (!canDelete) {
      Swal.fire('Sin permisos', 'No tienes permisos para eliminar incidencias', 'error')
      return
    }

    const result = await Swal.fire({
      title: '¿Eliminar incidencia?',
      html: `
        <p>Se eliminará la incidencia del <strong>${formatDate(incidencia.fecha)}</strong></p>
        <p><small>Conductor: ${incidencia.conductor_display || 'N/A'}</small></p>
        <p><small>Vehículo: ${incidencia.patente_display || 'N/A'}</small></p>
        ${incidencia.total_penalidades > 0 ? '<p style="color: #dc2626;"><strong>También se eliminarán las penalidades asociadas.</strong></p>' : ''}
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    })

    if (result.isConfirmed) {
      try {
        // Primero eliminar penalidades asociadas (si las hay)
        if (incidencia.total_penalidades > 0) {
          const { error: penError } = await (supabase.from('penalidades' as any) as any)
            .delete()
            .eq('incidencia_id', incidencia.id)
          if (penError) throw penError
        }

        // Luego eliminar la incidencia
        const { error } = await (supabase.from('incidencias' as any) as any)
          .delete()
          .eq('id', incidencia.id)
        if (error) throw error

        Swal.fire('Eliminado', 'La incidencia fue eliminada correctamente', 'success')
        cargarDatos()
      } catch (error: any) {
        console.error('Error eliminando:', error)
        Swal.fire('Error', error.message || 'No se pudo eliminar la incidencia', 'error')
      }
    }
  }

  async function handleEliminarPenalidad(penalidad: PenalidadCompleta) {
    if (!canDelete) {
      Swal.fire('Sin permisos', 'No tienes permisos para eliminar penalidades', 'error')
      return
    }

    const result = await Swal.fire({
      title: '¿Eliminar penalidad?',
      html: `
        <p>Se eliminará la penalidad de <strong>${formatMoney(penalidad.monto)}</strong></p>
        <p><small>Conductor: ${penalidad.conductor_display || 'N/A'}</small></p>
        <p><small>Fecha: ${formatDate(penalidad.fecha)}</small></p>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    })

    if (result.isConfirmed) {
      try {
        const { error } = await (supabase.from('penalidades' as any) as any)
          .delete()
          .eq('id', penalidad.id)
        if (error) throw error

        Swal.fire('Eliminado', 'La penalidad fue eliminada correctamente', 'success')
        cargarDatos()
      } catch (error: any) {
        console.error('Error eliminando:', error)
        Swal.fire('Error', error.message || 'No se pudo eliminar la penalidad', 'error')
      }
    }
  }

  // Rechazar penalidad - guarda en historial y marca para reenvío
  async function handleRechazarPenalidad() {
    if (!penalidadRechazar || !motivoRechazo.trim()) {
      Swal.fire('Error', 'Debes ingresar un motivo de rechazo', 'error')
      return
    }
    
    setRechazando(true)
    try {
      // 1. Guardar en historial de rechazos
      const { error: errorHistorial } = await (supabase.from('penalidades_rechazos' as any) as any)
        .insert({
          penalidad_id: penalidadRechazar.id,
          motivo: motivoRechazo.trim(),
          rechazado_por: user?.id,
          rechazado_por_nombre: profile?.full_name || 'Sistema',
          monto_al_rechazo: penalidadRechazar.monto,
          detalle_al_rechazo: penalidadRechazar.detalle || ''
        })
      
      if (errorHistorial) throw errorHistorial
      
      // 2. Marcar penalidad como rechazada (para que vuelva a incidencia cobro)
      const { error: errorPenalidad } = await (supabase.from('penalidades' as any) as any)
        .update({
          rechazado: true,
          fecha_rechazo: new Date().toISOString(),
          motivo_rechazo: motivoRechazo.trim()
        })
        .eq('id', penalidadRechazar.id)
      
      if (errorPenalidad) throw errorPenalidad
      
      Swal.fire({
        icon: 'success',
        title: 'Rechazado',
        text: 'La penalidad fue rechazada y volverá a Incidencia (Cobro) para revisión',
        timer: 2500,
        showConfirmButton: false
      })
      
      setShowRechazoModal(false)
      setPenalidadRechazar(null)
      setMotivoRechazo('')
      cargarDatos()
    } catch (error: any) {
      console.error('Error rechazando:', error)
      Swal.fire('Error', error.message || 'No se pudo rechazar', 'error')
    } finally {
      setRechazando(false)
    }
  }

  // Calcular número de semana ISO 8601
  function getWeekNumber(dateStr: string): number {
    if (!dateStr) return 0
    // Parsear la fecha usando componentes locales para evitar problemas de timezone
    const [year, month, day] = dateStr.split('-').map(Number)
    const date = new Date(year, month - 1, day, 12, 0, 0) // mediodía hora local

    // ISO week: la semana 1 es la que contiene el primer jueves del año
    const thursday = new Date(date)
    thursday.setDate(date.getDate() - ((date.getDay() + 6) % 7) + 3) // Ir al jueves de la semana

    const firstThursday = new Date(thursday.getFullYear(), 0, 4) // 4 de enero siempre está en semana 1
    firstThursday.setDate(firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7) + 3)

    const weekNumber = Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1
    return weekNumber
  }

  async function handleGuardarIncidencia() {
    // Validar permisos
    if (modalMode === 'create' && !canCreate) {
      Swal.fire('Sin permisos', 'No tienes permisos para crear incidencias', 'error')
      return
    }
    if (modalMode === 'edit' && !canEdit) {
      Swal.fire('Sin permisos', 'No tienes permisos para editar incidencias', 'error')
      return
    }

    if (!incidenciaForm.estado_id || !incidenciaForm.fecha || !incidenciaForm.area) {
      Swal.fire('Error', 'Por favor complete los campos requeridos (fecha, estado, área)', 'warning')
      return
    }

    // Si es incidencia de cobro, validar que tenga monto
    const esCobro = activeTab === 'cobro'
    if (esCobro && (!incidenciaForm.monto || incidenciaForm.monto <= 0)) {
      Swal.fire('Error', 'Por favor ingrese el monto del cobro', 'warning')
      return
    }

    setSaving(true)
    try {
      // Calcular semana basada en la fecha
      const semanaCalculada = getWeekNumber(incidenciaForm.fecha)
      
      // Para logística, el tipo_cobro_descuento_id viene con prefijo "__" (no es UUID)
      // En ese caso, guardamos el valor en tipo_incidencia (legacy) y no en la FK
      const tipoCobroId = incidenciaForm.tipo_cobro_descuento_id
      const esLogisticaTipo = tipoCobroId?.startsWith('__')
      
      // Construir objeto solo con campos que existen en la tabla incidencias
      const dataToSave: Record<string, unknown> = {
        vehiculo_id: incidenciaForm.vehiculo_id || null,
        conductor_id: incidenciaForm.conductor_id || null,
        estado_id: incidenciaForm.estado_id,
        semana: semanaCalculada,
        fecha: incidenciaForm.fecha,
        turno: incidenciaForm.turno || null,
        area: incidenciaForm.area || null,
        estado_vehiculo: incidenciaForm.estado_vehiculo || null,
        descripcion: incidenciaForm.descripcion || null,
        accion_ejecutada: incidenciaForm.accion_ejecutada || null,
        registrado_por: incidenciaForm.registrado_por || null,
        created_by: user?.id,
        tipo: esCobro ? 'cobro' : 'logistica',
        tipo_cobro_descuento_id: esCobro && tipoCobroId && !esLogisticaTipo ? tipoCobroId : null,
        monto: esCobro ? (incidenciaForm.monto || 0) : null // Guardar monto solo para incidencias de cobro
      }

      if (modalMode === 'edit' && selectedIncidencia) {
        const { error } = await (supabase.from('incidencias' as any) as any)
          .update({ ...dataToSave, updated_by: profile?.full_name || 'Sistema' })
          .eq('id', selectedIncidencia.id)
        if (error) throw error
        Swal.fire('Guardado', 'Incidencia actualizada correctamente', 'success')
      } else {
        // Insertar incidencia (NO crear penalidad automáticamente - se crea al "Enviar a facturación")
        const { error } = await (supabase.from('incidencias' as any) as any)
          .insert({ ...dataToSave, created_by_name: profile?.full_name || 'Sistema' })
        if (error) throw error
        
        Swal.fire('Guardado', esCobro 
          ? 'Incidencia de cobro registrada. Use el botón $ para enviar a facturación.' 
          : 'Incidencia registrada correctamente', 'success')
      }

      setShowModal(false)
      cargarDatos()
    } catch (error: any) {
      console.error('Error guardando:', error)
      Swal.fire('Error', error.message || 'No se pudo guardar', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleGuardarPenalidad() {
    // Validar permisos
    if (modalMode === 'create' && !canCreate) {
      Swal.fire('Sin permisos', 'No tienes permisos para crear penalidades', 'error')
      return
    }
    if (modalMode === 'edit' && !canEdit) {
      Swal.fire('Sin permisos', 'No tienes permisos para editar penalidades', 'error')
      return
    }

    if (!penalidadForm.fecha) {
      Swal.fire('Error', 'Por favor complete los campos requeridos', 'warning')
      return
    }

    setSaving(true)
    try {
      // Calcular semana basada en la fecha
      const semanaCalculada = getWeekNumber(penalidadForm.fecha)
      
      // Construir objeto solo con campos que existen en la tabla penalidades
      const dataToSave: Record<string, unknown> = {
        incidencia_id: penalidadForm.incidencia_id || null,
        vehiculo_id: penalidadForm.vehiculo_id || null,
        conductor_id: penalidadForm.conductor_id || null,
        tipo_penalidad_id: penalidadForm.tipo_penalidad_id || null,
        tipo_cobro_descuento_id: penalidadForm.tipo_cobro_descuento_id || null,
        semana: semanaCalculada,
        fecha: penalidadForm.fecha,
        turno: penalidadForm.turno || null,
        area_responsable: penalidadForm.area_responsable || null,
        detalle: penalidadForm.detalle || null,
        monto: penalidadForm.monto || null,
        observaciones: penalidadForm.observaciones || null,
        aplicado: penalidadForm.aplicado || false,
        nota_administrativa: penalidadForm.nota_administrativa || null,
        created_by: user?.id
      }

      if (modalMode === 'edit' && selectedPenalidad) {
        const { error } = await (supabase.from('penalidades' as any) as any)
          .update({ ...dataToSave, updated_by: profile?.full_name || 'Sistema' })
          .eq('id', selectedPenalidad.id)
        if (error) throw error
        Swal.fire('Guardado', 'Penalidad actualizada correctamente', 'success')
      } else {
        const { error } = await (supabase.from('penalidades' as any) as any)
          .insert({ ...dataToSave, created_by_name: profile?.full_name || 'Sistema' })
        if (error) throw error
        Swal.fire('Guardado', 'Penalidad registrada correctamente', 'success')
      }

      setShowModal(false)
      cargarDatos()
    } catch (error: any) {
      console.error('Error guardando:', error)
      Swal.fire('Error', error.message || 'No se pudo guardar', 'error')
    } finally {
      setSaving(false)
    }
  }

  // Abrir modal de aplicación
  async function handleMarcarAplicado(penalidad: PenalidadCompleta) {
    setPenalidadAplicar(penalidad)
    setAplicarFraccionado(false)
    setCantidadCuotas(2)
    
    // Calcular semana actual y semana anterior (para regularización)
    const hoy = new Date()
    const semanaActual = getWeekNumber(hoy.toISOString().split('T')[0])
    const anioActual = hoy.getFullYear()
    
    // Por defecto usar semana anterior para regularización
    let semanaAnterior = semanaActual - 1
    let anioAnterior = anioActual
    if (semanaAnterior < 1) {
      semanaAnterior = 52
      anioAnterior = anioActual - 1
    }
    
    setSemanaInicio(semanaAnterior)
    setAnioInicio(anioAnterior)
    
    // Generar períodos disponibles (4 semanas anteriores + semana actual + próximas 20 semanas)
    const periodos: Array<{semana: number, anio: number, label: string}> = []
    
    // Agregar 4 semanas anteriores
    let sem = semanaActual - 4
    let anio = anioActual
    if (sem < 1) {
      sem = 52 + sem
      anio = anioActual - 1
    }
    
    for (let i = 0; i < 25; i++) { // 4 anteriores + actual + 20 siguientes
      periodos.push({
        semana: sem,
        anio: anio,
        label: `Semana ${sem} - ${anio}`
      })
      sem++
      if (sem > 52) {
        sem = 1
        anio++
      }
    }
    
    setPeriodosDisponibles(periodos)
    setShowAplicarModal(true)
  }

  // Ejecutar la aplicación del cobro
  async function handleConfirmarAplicacion() {
    if (!penalidadAplicar) return
    
    setAplicandoCobro(true)
    try {
      // Si es "a favor", siempre aplicar completo (sin fraccionar)
      const esAFavor = penalidadAplicar.tipo_es_a_favor === true
      
      if (aplicarFraccionado && !esAFavor) {
        // Crear cuotas fraccionadas
        const montoCuota = Math.ceil((penalidadAplicar.monto || 0) / cantidadCuotas)
        const cuotas = []
        
        let sem = semanaInicio
        let anio = anioInicio
        
        for (let i = 0; i < cantidadCuotas; i++) {
          cuotas.push({
            penalidad_id: penalidadAplicar.id,
            numero_cuota: i + 1,
            monto_cuota: i === cantidadCuotas - 1 
              ? (penalidadAplicar.monto || 0) - (montoCuota * (cantidadCuotas - 1)) // Última cuota ajusta diferencia
              : montoCuota,
            semana: sem,
            anio: anio,
            aplicado: false
          })
          
          sem++
          if (sem > 52) {
            sem = 1
            anio++
          }
        }
        
        // Insertar cuotas
        const { error: cuotasError } = await (supabase.from('penalidades_cuotas' as any) as any)
          .insert(cuotas)
        
        if (cuotasError) throw cuotasError
        
        // Actualizar penalidad como fraccionada y aplicada
        const { error: updateError } = await (supabase.from('penalidades' as any) as any)
          .update({
            fraccionado: true,
            cantidad_cuotas: cantidadCuotas,
            aplicado: true, // Marcamos como aplicado porque ya se fraccionó
            semana_aplicacion: semanaInicio,
            anio_aplicacion: anioInicio,
            fecha_aplicacion: new Date().toISOString().split('T')[0],
            updated_by: profile?.full_name || 'Sistema'
          })
          .eq('id', penalidadAplicar.id)
        
        if (updateError) throw updateError
        
        Swal.fire({
          icon: 'success',
          title: 'Cobro Fraccionado',
          html: `Se crearon <strong>${cantidadCuotas} cuotas</strong> de ${formatMoney(montoCuota)} c/u<br>
                 Comenzando en Semana ${semanaInicio} - ${anioInicio}`
        })
      } else {
        // Aplicar completo en la semana seleccionada
        const { error } = await (supabase.from('penalidades' as any) as any)
          .update({
            aplicado: true,
            fraccionado: false,
            semana_aplicacion: semanaInicio,
            anio_aplicacion: anioInicio,
            fecha_aplicacion: new Date().toISOString().split('T')[0],
            updated_by: profile?.full_name || 'Sistema'
          })
          .eq('id', penalidadAplicar.id)
        
        if (error) throw error
        
        Swal.fire({
          icon: 'success',
          title: esAFavor ? 'Descuento Aplicado' : 'Cobro Aplicado',
          html: `Se aplicará en <strong>Semana ${semanaInicio} - ${anioInicio}</strong><br>
                 Monto: ${formatMoney(penalidadAplicar.monto)}${esAFavor ? ' (a favor del conductor)' : ''}`
        })
      }
      
      setShowAplicarModal(false)
      cargarDatos()
    } catch (error: any) {
      console.error('Error aplicando cobro:', error)
      Swal.fire('Error', error.message || 'No se pudo aplicar el cobro', 'error')
    } finally {
      setAplicandoCobro(false)
    }
  }

  // Desaplicar un cobro/descuento (revertir la aplicación)
  async function handleDesaplicar(penalidad: PenalidadCompleta) {
    const result = await Swal.fire({
      title: '¿Desaplicar cobro/descuento?',
      html: `
        <p>Se revertirá la aplicación de:</p>
        <p><strong>${formatMoney(penalidad.monto)}</strong> - ${penalidad.conductor_display}</p>
        ${penalidad.fraccionado ? '<p style="color: #dc2626;"><strong>También se eliminarán las cuotas fraccionadas.</strong></p>' : ''}
        <p style="margin-top: 12px; color: var(--text-secondary); font-size: 13px;">El registro volverá a estado "pendiente"</p>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#f59e0b',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Sí, desaplicar',
      cancelButtonText: 'Cancelar'
    })

    if (result.isConfirmed) {
      try {
        // Si está fraccionado, eliminar las cuotas primero
        if (penalidad.fraccionado) {
          const { error: cuotasError } = await (supabase.from('penalidades_cuotas' as any) as any)
            .delete()
            .eq('penalidad_id', penalidad.id)
          
          if (cuotasError) {
            console.error('Error eliminando cuotas:', cuotasError)
          }
        }

        // Revertir la penalidad a estado pendiente
        const { error } = await (supabase.from('penalidades' as any) as any)
          .update({
            aplicado: false,
            fraccionado: false,
            cantidad_cuotas: null,
            semana_aplicacion: null,
            anio_aplicacion: null,
            fecha_aplicacion: null,
            updated_by: profile?.full_name || 'Sistema'
          })
          .eq('id', penalidad.id)

        if (error) throw error

        Swal.fire({
          icon: 'success',
          title: 'Desaplicado',
          text: 'El cobro/descuento volvió a estado pendiente'
        })
        
        cargarDatos()
      } catch (error: any) {
        console.error('Error desaplicando:', error)
        Swal.fire('Error', error.message || 'No se pudo desaplicar', 'error')
      }
    }
  }

  // Abrir modal de reasignar semana
  function handleReasignarSemana(penalidad: PenalidadCompleta) {
    setPenalidadReasignar(penalidad)
    
    // Setear la semana actual del cobro
    setNuevaSemana(penalidad.semana_aplicacion || 1)
    setNuevoAnio(penalidad.anio_aplicacion || new Date().getFullYear())
    
    // Generar períodos disponibles (8 semanas anteriores + 20 semanas futuras)
    const semanaActual = getWeek(new Date())
    const anioActual = new Date().getFullYear()
    const periodos: Array<{semana: number, anio: number, label: string}> = []
    
    let sem = semanaActual - 8
    let anio = anioActual
    if (sem < 1) {
      sem = 52 + sem
      anio = anioActual - 1
    }
    
    for (let i = 0; i < 30; i++) { // 8 anteriores + actual + 21 siguientes
      periodos.push({
        semana: sem,
        anio: anio,
        label: `Semana ${sem} - ${anio}`
      })
      sem++
      if (sem > 52) {
        sem = 1
        anio++
      }
    }
    
    setPeriodosDisponibles(periodos)
    setShowReasignarModal(true)
  }

  // Helper para obtener semana del año
  function getWeek(date: Date): number {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1)
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7)
  }

  // Ejecutar reasignación de semana con recálculo en cascada
  async function handleConfirmarReasignacion() {
    if (!penalidadReasignar) return
    
    const semanaOrigen = penalidadReasignar.semana_aplicacion
    const anioOrigen = penalidadReasignar.anio_aplicacion
    
    if (semanaOrigen === nuevaSemana && anioOrigen === nuevoAnio) {
      Swal.fire('Sin cambios', 'La semana seleccionada es la misma que la actual', 'info')
      return
    }
    
    setReasignando(true)
    try {
      const monto = penalidadReasignar.monto || 0
      const esAFavor = penalidadReasignar.tipo_es_a_favor === true
      
      // 1. Actualizar la penalidad con la nueva semana
      const { error: updateError } = await (supabase.from('penalidades' as any) as any)
        .update({
          semana_aplicacion: nuevaSemana,
          anio_aplicacion: nuevoAnio,
          updated_by: profile?.full_name || 'Sistema'
        })
        .eq('id', penalidadReasignar.id)
      
      if (updateError) throw updateError
      
      // 2. Recalcular período origen (restar el monto)
      if (semanaOrigen && anioOrigen) {
        const { data: periodoOrigen } = await (supabase
          .from('periodos_facturacion') as any)
          .select('id, total_cargos, total_descuentos, total_neto')
          .eq('semana', semanaOrigen)
          .eq('anio', anioOrigen)
          .single()
        
        if (periodoOrigen) {
          const nuevosCargosOrigen = esAFavor 
            ? periodoOrigen.total_cargos 
            : (periodoOrigen.total_cargos || 0) - monto
          const nuevosDescuentosOrigen = esAFavor 
            ? (periodoOrigen.total_descuentos || 0) - monto 
            : periodoOrigen.total_descuentos
          
          await (supabase.from('periodos_facturacion') as any)
            .update({
              total_cargos: Math.max(0, nuevosCargosOrigen),
              total_descuentos: Math.max(0, nuevosDescuentosOrigen),
              total_neto: Math.max(0, nuevosCargosOrigen) - Math.max(0, nuevosDescuentosOrigen),
              updated_at: new Date().toISOString()
            })
            .eq('id', periodoOrigen.id)
        }
      }
      
      // 3. Recalcular período destino (sumar el monto)
      const { data: periodoDestino } = await (supabase
        .from('periodos_facturacion') as any)
        .select('id, total_cargos, total_descuentos, total_neto')
        .eq('semana', nuevaSemana)
        .eq('anio', nuevoAnio)
        .single()
      
      if (periodoDestino) {
        const nuevosCargosDestino = esAFavor 
          ? periodoDestino.total_cargos 
          : (periodoDestino.total_cargos || 0) + monto
        const nuevosDescuentosDestino = esAFavor 
          ? (periodoDestino.total_descuentos || 0) + monto 
          : periodoDestino.total_descuentos
        
        await (supabase.from('periodos_facturacion') as any)
          .update({
            total_cargos: nuevosCargosDestino,
            total_descuentos: nuevosDescuentosDestino,
            total_neto: nuevosCargosDestino - nuevosDescuentosDestino,
            updated_at: new Date().toISOString()
          })
          .eq('id', periodoDestino.id)
      }
      
      setShowReasignarModal(false)
      
      Swal.fire({
        icon: 'success',
        title: 'Semana reasignada',
        html: `El cobro se movió de <strong>Semana ${semanaOrigen}-${anioOrigen}</strong> a <strong>Semana ${nuevaSemana}-${nuevoAnio}</strong><br><br>Los totales de ambos períodos fueron recalculados.`
      })
      
      cargarDatos()
    } catch (error: any) {
      console.error('Error reasignando semana:', error)
      Swal.fire('Error', error.message || 'No se pudo reasignar la semana', 'error')
    } finally {
      setReasignando(false)
    }
  }

  // Formatters
  function formatMoney(value: number | undefined | null) {
    if (!value) return '-'
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0
    }).format(value)
  }

  function formatDate(dateStr: string | undefined | null) {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  }

  function handleExportarIncidencias() {
    if (incidenciasFiltradas.length === 0) {
      Swal.fire('Sin datos', 'No hay incidencias para exportar', 'info')
      return
    }

    const dataExport = incidenciasFiltradas.map(i => ({
      'Fecha': formatDate(i.fecha),
      'Semana': i.semana || '',
      'Patente': i.patente_display || '',
      'Vehículo': `${i.vehiculo_marca || ''} ${i.vehiculo_modelo || ''}`.trim(),
      'Conductor': i.conductor_display || '',
      'Turno': i.turno || '',
      'Área': i.area || '',
      'Estado': i.estado_nombre || '',
      'Estado Vehículo': i.estado_vehiculo || '',
      'Descripción': i.descripcion || '',
      'Acción Ejecutada': i.accion_ejecutada || '',
      'Registrado por': i.registrado_por || '',
      'Fecha Creación': i.created_at ? new Date(i.created_at).toLocaleString('es-AR') : '',
      'Total Penalidades': i.total_penalidades || 0
    }))

    const ws = XLSX.utils.json_to_sheet(dataExport)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Incidencias')

    const colWidths = [
      { wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 20 }, { wch: 25 },
      { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 35 },
      { wch: 35 }, { wch: 15 }, { wch: 18 }, { wch: 12 }
    ]
    ws['!cols'] = colWidths

    const fecha = new Date().toISOString().split('T')[0]
    XLSX.writeFile(wb, `Incidencias_${fecha}.xlsx`)
  }

  function handleExportarPenalidades() {
    if (penalidadesFiltradas.length === 0) {
      Swal.fire('Sin datos', 'No hay penalidades para exportar', 'info')
      return
    }

    const dataExport = penalidadesFiltradas.map(p => ({
      'Fecha': formatDate(p.fecha),
      'Semana': p.semana || '',
      'Patente': p.patente_display || '',
      'Conductor': p.conductor_display || '',
      'Tipo': p.tipo_nombre || '',
      'Detalle': p.detalle || '',
      'Monto': p.monto || 0,
      'Turno': p.turno || '',
      'Área Responsable': p.area_responsable || '',
      'Aplicado': p.aplicado ? 'Sí' : 'No',
      'Fecha Aplicación': formatDate(p.fecha_aplicacion),
      'Observaciones': p.observaciones || '',
      'Nota Administrativa': p.nota_administrativa || ''
    }))

    const ws = XLSX.utils.json_to_sheet(dataExport)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Penalidades')

    const colWidths = [
      { wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 25 }, { wch: 15 },
      { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 15 }, { wch: 10 },
      { wch: 12 }, { wch: 30 }, { wch: 30 }
    ]
    ws['!cols'] = colWidths

    const tabName = activeTab === 'por_aplicar' ? 'PorAplicar' : 'Todas'
    const fecha = new Date().toISOString().split('T')[0]
    XLSX.writeFile(wb, `Penalidades_${tabName}_${fecha}.xlsx`)
  }

  // Contadores para tabs
  const countPorAplicar = penalidades.filter(p => !p.aplicado && !p.rechazado).length
  const countAplicadas = penalidades.filter(p => p.aplicado && !p.rechazado).length
  const countRechazados = penalidades.filter(p => p.rechazado).length

  return (
    <div className="incidencias-module">
      {/* Stats rápidos - Arriba de todo (igual que Siniestros) */}
      <div className="incidencias-stats">
        <div className="stats-grid">
          <div className="stat-card">
            <FileText size={20} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{incidencias.length}</span>
              <span className="stat-label">Total</span>
            </div>
          </div>
          <div className="stat-card">
            <Car size={20} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{new Set(incidencias.map(i => i.patente_display)).size}</span>
              <span className="stat-label">Vehículos</span>
            </div>
          </div>
          <div className="stat-card">
            <Users size={20} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{new Set(incidencias.map(i => i.conductor_display)).size}</span>
              <span className="stat-label">Conductores</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs + Action Button (igual que Siniestros) */}
      <div className="incidencias-tabs-row">
        <div className="incidencias-tabs">
          <button
            className={`incidencias-tab ${activeTab === 'logistica' ? 'active' : ''}`}
            onClick={() => setActiveTab('logistica')}
          >
            <FileText size={16} />
            Incidencia Logística
            <span className="tab-badge">{incidenciasLogisticas.length}</span>
          </button>
          <button
            className={`incidencias-tab ${activeTab === 'cobro' ? 'active' : ''}`}
            onClick={() => setActiveTab('cobro')}
          >
            <DollarSign size={16} />
            Incidencia (Cobro)
            <span className="tab-badge">{incidenciasCobro.length}</span>
          </button>
          {/* Tab Por Aplicar - muestra penalidades pendientes */}
          <button
            className={`incidencias-tab ${activeTab === 'por_aplicar' ? 'active' : ''}`}
            onClick={() => setActiveTab('por_aplicar')}
          >
            <Clock size={16} />
            Por Aplicar
            {countPorAplicar > 0 && (
              <span className={`tab-badge ${activeTab !== 'por_aplicar' ? 'pending' : ''}`}>
                {countPorAplicar}
              </span>
            )}
          </button>
          {/* Tab Aplicadas - muestra penalidades ya aplicadas */}
          <button
            className={`incidencias-tab ${activeTab === 'aplicadas' ? 'active' : ''}`}
            onClick={() => setActiveTab('aplicadas')}
          >
            <CheckCircle size={16} />
            Aplicadas
            <span className="tab-badge">{countAplicadas}</span>
          </button>
          {/* Tab Rechazados */}
          <button
            className={`incidencias-tab ${activeTab === 'rechazados' ? 'active' : ''}`}
            onClick={() => setActiveTab('rechazados')}
          >
            <XCircle size={16} />
            Rechazados
            {countRechazados > 0 && (
              <span className="tab-badge pending">{countRechazados}</span>
            )}
          </button>
        </div>
        <div className="tabs-actions">
          {/* Selector de fecha para tab Logística */}
          {activeTab === 'logistica' && (
            <DateRangeSelector
              selectedRange={dateRangeLogistica}
              onRangeChange={setDateRangeLogistica}
              showAllOption={true}
              placeholder="Filtrar por fecha"
            />
          )}
          {/* Filtros especiales para tab Cobro */}
          {activeTab === 'cobro' && (
            <>
              <DateRangeSelector
                selectedRange={dateRangeCobro}
                onRangeChange={setDateRangeCobro}
                showAllOption={true}
                placeholder="Filtrar por fecha"
              />
            </>
          )}
          {/* Selector de fecha para tabs de Penalidades */}
          {(activeTab === 'por_aplicar' || activeTab === 'aplicadas' || activeTab === 'rechazados') && (
            <DateRangeSelector
              selectedRange={dateRangePenalidades}
              onRangeChange={setDateRangePenalidades}
              showAllOption={true}
              placeholder="Filtrar por fecha"
            />
          )}
          <button
            className="btn-secondary"
            onClick={activeTab === 'por_aplicar' || activeTab === 'aplicadas' ? handleExportarPenalidades : handleExportarIncidencias}
            title="Exportar a Excel"
          >
            <Download size={16} />
            Exportar
          </button>
          {activeTab !== 'por_aplicar' && activeTab !== 'aplicadas' && (
            <button
              className="btn-primary"
              onClick={handleNuevaIncidencia}
              disabled={!canCreate}
              title={!canCreate ? 'No tienes permisos para crear' : ''}
            >
              <Plus size={16} />
              Nueva Incidencia
            </button>
          )}
        </div>
      </div>

      {/* Incidencias Logística Tab */}
      {activeTab === 'logistica' && (
        <>
          {/* Barra de filtros activos con estilo de chips */}
          {hayFiltrosIncidenciasActivos && (
            <div className="dt-active-filters">
              <div className="dt-active-filters-label">
                <Filter size={14} />
                <span>Filtros activos</span>
              </div>
              <div className="dt-active-filters-list">
                {patenteFilter.map(val => (
                  <div key={`patente-${val}`} className="dt-active-filter-chip">
                    <span className="dt-chip-label">Patente:</span>
                    <span className="dt-chip-value">{val}</span>
                    <button
                      className="dt-chip-remove"
                      onClick={() => setPatenteFilter(prev => prev.filter(v => v !== val))}
                      title="Quitar filtro"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                {conductorFilter.map(val => (
                  <div key={`conductor-${val}`} className="dt-active-filter-chip">
                    <span className="dt-chip-label">Conductor:</span>
                    <span className="dt-chip-value">{val}</span>
                    <button
                      className="dt-chip-remove"
                      onClick={() => setConductorFilter(prev => prev.filter(v => v !== val))}
                      title="Quitar filtro"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                {turnoFilter.map(val => (
                  <div key={`turno-${val}`} className="dt-active-filter-chip">
                    <span className="dt-chip-label">Turno:</span>
                    <span className="dt-chip-value">{val}</span>
                    <button
                      className="dt-chip-remove"
                      onClick={() => setTurnoFilter(prev => prev.filter(v => v !== val))}
                      title="Quitar filtro"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                {areaFilter.map(val => (
                  <div key={`area-${val}`} className="dt-active-filter-chip">
                    <span className="dt-chip-label">Área:</span>
                    <span className="dt-chip-value">{val}</span>
                    <button
                      className="dt-chip-remove"
                      onClick={() => setAreaFilter(prev => prev.filter(v => v !== val))}
                      title="Quitar filtro"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                {estadoFilter.map(val => (
                  <div key={`estado-${val}`} className="dt-active-filter-chip">
                    <span className="dt-chip-label">Estado:</span>
                    <span className="dt-chip-value">{val}</span>
                    <button
                      className="dt-chip-remove"
                      onClick={() => setEstadoFilter(prev => prev.filter(v => v !== val))}
                      title="Quitar filtro"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
              <button className="dt-clear-all-filters" onClick={limpiarFiltrosIncidencias}>
                Limpiar todo
              </button>
            </div>
          )}

          {/* Tabla con DataTable */}
          <DataTable
            data={incidenciasLogisticas}
            columns={incidenciasColumns}
            globalFilterFn={customGlobalFilter}
            loading={loading}
            searchPlaceholder="Buscar por patente, conductor..."
            emptyIcon={<Shield size={48} />}
            emptyTitle="Sin incidencias logísticas"
            emptyDescription="No hay incidencias logísticas registradas"
            pageSize={100}
            pageSizeOptions={[10, 20, 50, 100]}
          />
        </>
      )}

      {/* Incidencias Cobro Tab */}
      {activeTab === 'cobro' && (
        <>
          {/* Barra de acciones de envío masivo */}
          <div className="incidencias-bulk-bar">
            <button
              className={`btn-filter ${soloPendientesEnviar ? 'active' : ''}`}
              onClick={() => {
                setSoloPendientesEnviar(!soloPendientesEnviar)
                if (!soloPendientesEnviar) {
                  setModoSeleccionMasiva(false)
                  setIncidenciasSeleccionadas(new Set())
                }
              }}
            >
              <Clock size={16} />
              Pend. Facturación
              {incidenciasEnviables.length > 0 && (
                <span className="badge">{incidenciasEnviables.length}</span>
              )}
            </button>
            
            {soloPendientesEnviar && !modoSeleccionMasiva && incidenciasEnviables.length > 0 && (
              <button className="btn-primary" onClick={() => setModoSeleccionMasiva(true)}>
                <Send size={16} />
                Seleccionar para envío
              </button>
            )}
            
            {modoSeleccionMasiva && (
              <button
                className="btn-secondary"
                onClick={() => {
                  setModoSeleccionMasiva(false)
                  setIncidenciasSeleccionadas(new Set())
                }}
              >
                <X size={16} />
                Cancelar
              </button>
            )}
          </div>

          {/* Barra de filtros activos con estilo de chips */}
          {hayFiltrosIncidenciasActivos && (
            <div className="dt-active-filters">
              <div className="dt-active-filters-label">
                <Filter size={14} />
                <span>Filtros activos</span>
              </div>
              <div className="dt-active-filters-list">
                {patenteFilter.map(val => (
                  <div key={`patente-${val}`} className="dt-active-filter-chip">
                    <span className="dt-chip-label">Patente:</span>
                    <span className="dt-chip-value">{val}</span>
                    <button
                      className="dt-chip-remove"
                      onClick={() => setPatenteFilter(prev => prev.filter(v => v !== val))}
                      title="Quitar filtro"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                {conductorFilter.map(val => (
                  <div key={`conductor-${val}`} className="dt-active-filter-chip">
                    <span className="dt-chip-label">Conductor:</span>
                    <span className="dt-chip-value">{val}</span>
                    <button
                      className="dt-chip-remove"
                      onClick={() => setConductorFilter(prev => prev.filter(v => v !== val))}
                      title="Quitar filtro"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                {turnoFilter.map(val => (
                  <div key={`turno-${val}`} className="dt-active-filter-chip">
                    <span className="dt-chip-label">Turno:</span>
                    <span className="dt-chip-value">{val}</span>
                    <button
                      className="dt-chip-remove"
                      onClick={() => setTurnoFilter(prev => prev.filter(v => v !== val))}
                      title="Quitar filtro"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                {areaFilter.map(val => (
                  <div key={`area-${val}`} className="dt-active-filter-chip">
                    <span className="dt-chip-label">Área:</span>
                    <span className="dt-chip-value">{val}</span>
                    <button
                      className="dt-chip-remove"
                      onClick={() => setAreaFilter(prev => prev.filter(v => v !== val))}
                      title="Quitar filtro"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                {estadoFilter.map(val => (
                  <div key={`estado-${val}`} className="dt-active-filter-chip">
                    <span className="dt-chip-label">Estado:</span>
                    <span className="dt-chip-value">{val}</span>
                    <button
                      className="dt-chip-remove"
                      onClick={() => setEstadoFilter(prev => prev.filter(v => v !== val))}
                      title="Quitar filtro"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                {soloPendientesEnviar && (
                  <div className="dt-active-filter-chip" style={{ background: 'rgba(245, 158, 11, 0.1)', borderColor: '#f59e0b' }}>
                    <span className="dt-chip-label" style={{ color: '#f59e0b' }}>Pendiente Facturación</span>
                    <button
                      className="dt-chip-remove"
                      onClick={() => {
                        setSoloPendientesEnviar(false)
                        setModoSeleccionMasiva(false)
                        setIncidenciasSeleccionadas(new Set())
                      }}
                      title="Quitar filtro"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}
              </div>
              <button className="dt-clear-all-filters" onClick={limpiarFiltrosIncidencias}>
                Limpiar todo
              </button>
            </div>
          )}

          {/* Barra de selección masiva */}
          {modoSeleccionMasiva && (
            <div className="incidencias-selection-bar">
              <button
                className="btn-select-all"
                onClick={() => {
                  if (incidenciasSeleccionadas.size === incidenciasEnviables.length) {
                    handleDeseleccionarTodas()
                  } else {
                    handleSeleccionarTodas()
                  }
                }}
              >
                {incidenciasSeleccionadas.size === incidenciasEnviables.length && incidenciasEnviables.length > 0 ? (
                  <><CheckSquare size={16} color="#10b981" /> Deseleccionar todas</>
                ) : (
                  <><Square size={16} /> Seleccionar todas ({incidenciasEnviables.length})</>
                )}
              </button>
              
              <span className="selection-count">
                <strong>{incidenciasSeleccionadas.size}</strong> de {incidenciasEnviables.length} seleccionadas
              </span>
              
              {incidenciasSeleccionadas.size > 0 && (
                <button className="btn-send" onClick={handleEnviarMasivo} disabled={enviandoMasivo}>
                  <Send size={16} />
                  {enviandoMasivo ? 'Enviando...' : `Enviar ${incidenciasSeleccionadas.size} a facturación`}
                </button>
              )}
            </div>
          )}

          {/* Tabla con DataTable - usa columnas específicas con botón Generar Cobro */}
          <DataTable
            data={soloPendientesEnviar ? incidenciasEnviables : incidenciasCobro}
            columns={incidenciasCobroColumns}
            globalFilterFn={customGlobalFilter}
            loading={loading}
            searchPlaceholder="Buscar por patente, conductor..."
            emptyIcon={<DollarSign size={48} />}
            emptyTitle="Sin incidencias de cobro"
            emptyDescription="Las incidencias que generan cobros aparecerán aquí"
            pageSize={100}
            pageSizeOptions={[10, 20, 50, 100]}
          />
        </>
      )}

      {/* Por Aplicar Tab - Cobros/Descuentos pendientes */}
      {activeTab === 'por_aplicar' && (
        <>
          {/* Stats - pendientes */}
          <div className="incidencias-stats">
            <div className="stats-grid">
              <div className="stat-card active">
                <Clock size={20} className="stat-icon" />
                <div className="stat-content">
                  <span className="stat-value">{penalidadesFiltradas.length}</span>
                  <span className="stat-label">Pendientes</span>
                </div>
              </div>
              <div className="stat-card">
                <DollarSign size={20} className="stat-icon" />
                <div className="stat-content">
                  <span className="stat-value">{formatMoney(penalidadesFiltradas.reduce((s, p) => s + (p.monto || 0), 0))}</span>
                  <span className="stat-label">$ Pendiente</span>
                </div>
              </div>
            </div>
          </div>

          {/* Barra de filtros activos con estilo de chips */}
          {hayFiltrosPenalidadesActivos && (
            <div className="dt-active-filters">
              <div className="dt-active-filters-label">
                <Filter size={14} />
                <span>Filtros activos</span>
              </div>
              <div className="dt-active-filters-list">
                {penPatenteFilter.map(val => (
                  <div key={`patente-${val}`} className="dt-active-filter-chip">
                    <span className="dt-chip-label">Patente:</span>
                    <span className="dt-chip-value">{val}</span>
                    <button
                      className="dt-chip-remove"
                      onClick={() => setPenPatenteFilter(prev => prev.filter(v => v !== val))}
                      title="Quitar filtro"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                {penConductorFilter.map(val => (
                  <div key={`conductor-${val}`} className="dt-active-filter-chip">
                    <span className="dt-chip-label">Conductor:</span>
                    <span className="dt-chip-value">{val}</span>
                    <button
                      className="dt-chip-remove"
                      onClick={() => setPenConductorFilter(prev => prev.filter(v => v !== val))}
                      title="Quitar filtro"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                {penTipoFilter.map(val => (
                  <div key={`tipo-${val}`} className="dt-active-filter-chip">
                    <span className="dt-chip-label">Tipo:</span>
                    <span className="dt-chip-value">{val}</span>
                    <button
                      className="dt-chip-remove"
                      onClick={() => setPenTipoFilter(prev => prev.filter(v => v !== val))}
                      title="Quitar filtro"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                {penAplicadoFilter.map(val => (
                  <div key={`aplicado-${val}`} className="dt-active-filter-chip">
                    <span className="dt-chip-label">Estado:</span>
                    <span className="dt-chip-value">{val}</span>
                    <button
                      className="dt-chip-remove"
                      onClick={() => setPenAplicadoFilter(prev => prev.filter(v => v !== val))}
                      title="Quitar filtro"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
              <button className="dt-clear-all-filters" onClick={limpiarFiltrosPenalidades}>
                Limpiar todo
              </button>
            </div>
          )}

          {/* Tabla Penalidades con DataTable */}
          <DataTable
            data={penalidadesFiltradas}
            columns={penalidadesColumns}
            loading={loading}
            searchPlaceholder="Buscar por patente, conductor..."
            emptyIcon={<Shield size={48} />}
            emptyTitle={hayFiltrosPenalidadesActivos ? "Sin resultados con los filtros actuales" : "Sin cobros/descuentos pendientes"}
            emptyDescription={hayFiltrosPenalidadesActivos ? "Intenta limpiar los filtros para ver todos los registros" : "Los cobros generados desde incidencias aparecerán aquí"}
            pageSize={100}
            pageSizeOptions={[10, 20, 50, 100]}
          />
        </>
      )}

      {/* Aplicadas Tab - Cobros/Descuentos ya aplicados */}
      {activeTab === 'aplicadas' && (
        <>
          {/* Stats - aplicados */}
          <div className="incidencias-stats">
            <div className="stats-grid">
              <div className="stat-card">
                <CheckCircle size={20} className="stat-icon" style={{ color: '#16a34a' }} />
                <div className="stat-content">
                  <span className="stat-value">{penalidadesFiltradas.length}</span>
                  <span className="stat-label">Aplicadas</span>
                </div>
              </div>
              <div className="stat-card">
                <DollarSign size={20} className="stat-icon" style={{ color: '#16a34a' }} />
                <div className="stat-content">
                  <span className="stat-value">{formatMoney(penalidadesFiltradas.reduce((s, p) => s + (p.monto || 0), 0))}</span>
                  <span className="stat-label">$ Aplicado</span>
                </div>
              </div>
            </div>
          </div>

          {/* Barra de filtros activos con estilo de chips */}
          {hayFiltrosPenalidadesActivos && (
            <div className="dt-active-filters">
              <div className="dt-active-filters-label">
                <Filter size={14} />
                <span>Filtros activos</span>
              </div>
              <div className="dt-active-filters-list">
                {penPatenteFilter.map(val => (
                  <div key={`patente-${val}`} className="dt-active-filter-chip">
                    <span className="dt-chip-label">Patente:</span>
                    <span className="dt-chip-value">{val}</span>
                    <button
                      className="dt-chip-remove"
                      onClick={() => setPenPatenteFilter(prev => prev.filter(v => v !== val))}
                      title="Quitar filtro"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                {penConductorFilter.map(val => (
                  <div key={`conductor-${val}`} className="dt-active-filter-chip">
                    <span className="dt-chip-label">Conductor:</span>
                    <span className="dt-chip-value">{val}</span>
                    <button
                      className="dt-chip-remove"
                      onClick={() => setPenConductorFilter(prev => prev.filter(v => v !== val))}
                      title="Quitar filtro"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                {penTipoFilter.map(val => (
                  <div key={`tipo-${val}`} className="dt-active-filter-chip">
                    <span className="dt-chip-label">Tipo:</span>
                    <span className="dt-chip-value">{val}</span>
                    <button
                      className="dt-chip-remove"
                      onClick={() => setPenTipoFilter(prev => prev.filter(v => v !== val))}
                      title="Quitar filtro"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
              <button className="dt-clear-all-filters" onClick={limpiarFiltrosPenalidades}>
                Limpiar todo
              </button>
            </div>
          )}

          {/* Tabla Penalidades Aplicadas con DataTable */}
          <DataTable
            data={penalidadesFiltradas}
            columns={penalidadesColumns}
            loading={loading}
            searchPlaceholder="Buscar por patente, conductor..."
            emptyIcon={<CheckCircle size={48} />}
            emptyTitle={hayFiltrosPenalidadesActivos ? "Sin resultados con los filtros actuales" : "Sin cobros aplicados"}
            emptyDescription={hayFiltrosPenalidadesActivos ? "Intenta limpiar los filtros para ver todos los registros" : "Los cobros que se apliquen aparecerán aquí"}
            pageSize={100}
            pageSizeOptions={[10, 20, 50, 100]}
          />
        </>
      )}

      {/* Rechazados Tab */}
      {activeTab === 'rechazados' && (
        <>
          <div className="incidencias-stats">
            <div className="stats-grid">
              <div className="stat-card">
                <XCircle size={20} className="stat-icon" />
                <div className="stat-content">
                  <span className="stat-value">{penalidadesFiltradas.length}</span>
                  <span className="stat-label">Rechazados</span>
                </div>
              </div>
              <div className="stat-card">
                <DollarSign size={20} className="stat-icon" />
                <div className="stat-content">
                  <span className="stat-value">{formatMoney(penalidadesFiltradas.reduce((s, p) => s + (p.monto || 0), 0))}</span>
                  <span className="stat-label">$ Rechazado</span>
                </div>
              </div>
            </div>
          </div>

          <DataTable
            data={penalidadesFiltradas}
            columns={penalidadesColumns}
            loading={loading}
            searchPlaceholder="Buscar por patente, conductor..."
            emptyIcon={<XCircle size={48} />}
            emptyTitle="Sin rechazos"
            emptyDescription="Los cobros rechazados aparecerán aquí"
            pageSize={100}
            pageSizeOptions={[10, 20, 50, 100]}
          />
        </>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                {modalMode === 'create' ? (modalType === 'incidencia' ? 'Nueva Incidencia' : 'Nueva Penalidad') :
                 modalMode === 'edit' ? (modalType === 'incidencia' ? 'Editar Incidencia' : 'Editar Penalidad') :
                 (modalType === 'incidencia' ? 'Detalle de Incidencia' : 
                   (selectedPenalidad?.rechazado ? 'Cobro Rechazado' : 'Detalle de Penalidad'))}
              </h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              {modalMode === 'view' ? (
                modalType === 'incidencia' && selectedIncidencia ? (
                  <IncidenciaDetailView
                    incidencia={selectedIncidencia}
                    onEdit={() => handleEditarIncidencia(selectedIncidencia)}
                  />
                ) : modalType === 'penalidad' && selectedPenalidad ? (
                  <PenalidadDetailView
                    penalidad={selectedPenalidad}
                    onEdit={selectedPenalidad.rechazado ? undefined : () => handleEditarPenalidad(selectedPenalidad)}
                    historialRechazos={historialRechazos}
                    loadingHistorial={loadingHistorial}
                  />
                ) : null
              ) : modalType === 'incidencia' ? (
                <IncidenciaForm
                  formData={incidenciaForm}
                  setFormData={setIncidenciaForm}
                  estados={estados}
                  vehiculos={vehiculos}
                  conductores={conductores}
                  tiposCobroDescuento={tiposCobroDescuento}
                  disabled={saving}
                  esCobro={activeTab === 'cobro'}
                />
              ) : (
                <PenalidadForm
                  formData={penalidadForm}
                  setFormData={setPenalidadForm}
                  tiposPenalidad={tiposPenalidad}
                  tiposCobroDescuento={tiposCobroDescuento}
                  vehiculos={vehiculos}
                  conductores={conductores}
                  disabled={saving}
                />
              )}
            </div>

            {modalMode !== 'view' && (
              <div className="modal-footer">
                <button className="btn-secondary" onClick={() => setShowModal(false)} disabled={saving}>
                  Cancelar
                </button>
                <button
                  className="btn-primary"
                  onClick={modalType === 'incidencia' ? handleGuardarIncidencia : handleGuardarPenalidad}
                  disabled={saving}
                >
                  {saving ? 'Guardando...' : (modalMode === 'create' ? 'Registrar' : 'Guardar')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal de Rechazo */}
      {showRechazoModal && penalidadRechazar && (
        <div className="modal-overlay" onClick={() => setShowRechazoModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
            <div className="modal-header">
              <h2>Rechazar Penalidad</h2>
              <button className="modal-close" onClick={() => setShowRechazoModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                <div style={{ marginBottom: '8px' }}>
                  <strong>{penalidadRechazar.conductor_display}</strong>
                </div>
                <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                  Monto: <span style={{ color: '#F59E0B', fontWeight: 600 }}>${penalidadRechazar.monto?.toLocaleString('es-AR')}</span>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Motivo del rechazo *</label>
                <textarea
                  className="form-textarea"
                  rows={3}
                  placeholder="Ingresa el motivo del rechazo..."
                  value={motivoRechazo}
                  onChange={e => setMotivoRechazo(e.target.value)}
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowRechazoModal(false)}>
                Cancelar
              </button>
              <button 
                className="btn-primary" 
                onClick={handleRechazarPenalidad}
                disabled={rechazando || !motivoRechazo.trim()}
                style={{ background: '#dc2626' }}
              >
                {rechazando ? 'Rechazando...' : 'Rechazar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Aplicación/Fraccionamiento */}
      {showAplicarModal && penalidadAplicar && (
        <div className="modal-overlay" onClick={() => setShowAplicarModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="modal-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
              <h2 style={{ fontSize: '18px', fontWeight: 600 }}>Aplicar Cobro/Descuento</h2>
              <button className="modal-close" onClick={() => setShowAplicarModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ padding: '20px 24px' }}>
              {/* Info del cobro - Estilo con fondo gris */}
              <div style={{ 
                background: '#f5f5f5', 
                padding: '16px 20px', 
                borderRadius: '8px', 
                marginBottom: '24px' 
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span style={{ color: '#666', fontSize: '14px' }}>Conductor:</span>
                  <strong style={{ fontSize: '14px' }}>{penalidadAplicar.conductor_display}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span style={{ color: '#666', fontSize: '14px' }}>Vehículo:</span>
                  <strong style={{ fontSize: '14px' }}>{penalidadAplicar.patente_display || '-'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#666', fontSize: '14px' }}>Monto Total:</span>
                  <strong style={{ color: '#F59E0B', fontSize: '18px' }}>{formatMoney(penalidadAplicar.monto)}</strong>
                </div>
              </div>

              {/* Opciones de aplicación - Solo mostrar si NO es "a favor" */}
              {!penalidadAplicar.tipo_es_a_favor && (
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', marginBottom: '12px', fontWeight: 500, fontSize: '14px', color: '#333' }}>
                    ¿Cómo desea aplicar el cobro?
                  </label>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <label style={{ 
                      flex: 1, 
                      padding: '14px', 
                      border: `2px solid ${!aplicarFraccionado ? '#F59E0B' : '#e5e5e5'}`,
                      borderRadius: '8px',
                      cursor: 'pointer',
                      background: !aplicarFraccionado ? 'rgba(245, 158, 11, 0.08)' : '#fff',
                      textAlign: 'center'
                    }}>
                      <input
                        type="radio"
                        checked={!aplicarFraccionado}
                        onChange={() => setAplicarFraccionado(false)}
                        style={{ marginBottom: '6px' }}
                      />
                      <div style={{ fontWeight: 600, fontSize: '14px' }}>Completo</div>
                      <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                        Se cobra todo en una semana
                      </div>
                    </label>
                    <label style={{ 
                      flex: 1, 
                      padding: '14px', 
                      border: `2px solid ${aplicarFraccionado ? '#F59E0B' : '#e5e5e5'}`,
                      borderRadius: '8px',
                      cursor: 'pointer',
                      background: aplicarFraccionado ? 'rgba(245, 158, 11, 0.08)' : '#fff',
                      textAlign: 'center'
                    }}>
                      <input
                        type="radio"
                        checked={aplicarFraccionado}
                        onChange={() => setAplicarFraccionado(true)}
                        style={{ marginBottom: '6px' }}
                      />
                      <div style={{ fontWeight: 600, fontSize: '14px' }}>Fraccionado</div>
                      <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                        Dividir en cuotas semanales
                      </div>
                    </label>
                  </div>
                </div>
              )}
              
              {/* Mensaje para tickets a favor */}
              {penalidadAplicar.tipo_es_a_favor && (
                <div style={{ 
                  padding: '14px 16px', 
                  background: 'rgba(16, 185, 129, 0.1)', 
                  borderRadius: '8px', 
                  marginBottom: '20px',
                  border: '1px solid rgba(16, 185, 129, 0.3)'
                }}>
                  <strong style={{ color: '#10B981', fontSize: '14px' }}>Ticket a Favor</strong>
                  <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                    Los tickets a favor se aplican completos (sin fraccionamiento)
                  </div>
                </div>
              )}

              {/* Semana de inicio */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '14px', color: '#333' }}>
                  {aplicarFraccionado ? 'Semana de inicio:' : 'Aplicar en semana:'}
                </label>
                <select
                  value={`${semanaInicio}-${anioInicio}`}
                  onChange={(e) => {
                    const [sem, anio] = e.target.value.split('-').map(Number)
                    setSemanaInicio(sem)
                    setAnioInicio(anio)
                  }}
                  style={{ 
                    width: '100%', 
                    padding: '12px 14px', 
                    borderRadius: '6px', 
                    border: '1px solid #e5e5e5',
                    background: '#f5f5f5',
                    color: '#333',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                  onFocus={(e) => e.target.style.border = '2px solid #ef4444'}
                  onBlur={(e) => e.target.style.border = '1px solid #e5e5e5'}
                >
                  {periodosDisponibles.map(p => (
                    <option key={`${p.semana}-${p.anio}`} value={`${p.semana}-${p.anio}`}>
                      Semana {p.semana} - {p.anio}
                    </option>
                  ))}
                </select>
              </div>

              {/* Cantidad de cuotas (solo si es fraccionado) */}
              {aplicarFraccionado && (
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '14px', color: '#333' }}>
                    Cantidad de cuotas:
                  </label>
                  <input
                    type="number"
                    min="2"
                    max="52"
                    value={cantidadCuotas}
                    onChange={(e) => setCantidadCuotas(Math.max(2, parseInt(e.target.value) || 2))}
                    style={{ 
                      width: '100%', 
                      padding: '12px 14px', 
                      borderRadius: '6px', 
                      border: '1px solid #e5e5e5',
                      background: '#f5f5f5',
                      color: '#333',
                      fontSize: '14px',
                      outline: 'none'
                    }}
                    onFocus={(e) => e.target.style.border = '2px solid #ef4444'}
                    onBlur={(e) => e.target.style.border = '1px solid #e5e5e5'}
                  />
                  
                  {/* Resumen de cuotas - DESTACADO */}
                  <div style={{ 
                    marginTop: '16px', 
                    padding: '16px 20px', 
                    background: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)', 
                    borderRadius: '8px',
                    border: '2px solid #F59E0B'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '13px', color: '#92400E', fontWeight: 500 }}>Monto por cuota:</div>
                        <div style={{ fontSize: '12px', color: '#B45309', marginTop: '2px' }}>Última semana:</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '20px', fontWeight: 700, color: '#D97706' }}>
                          {formatMoney(Math.ceil((penalidadAplicar.monto || 0) / cantidadCuotas))}
                        </div>
                        <div style={{ fontSize: '12px', color: '#B45309' }}>
                          Semana {((semanaInicio + cantidadCuotas - 2) % 52) + 1} - {anioInicio + Math.floor((semanaInicio + cantidadCuotas - 2) / 52)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer" style={{ borderTop: 'none', padding: '16px 24px 24px', gap: '12px' }}>
              <button 
                onClick={() => setShowAplicarModal(false)} 
                disabled={aplicandoCobro}
                style={{
                  padding: '10px 24px',
                  borderRadius: '6px',
                  border: '1px solid #e5e5e5',
                  background: '#fff',
                  color: '#666',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmarAplicacion}
                disabled={aplicandoCobro}
                style={{
                  padding: '10px 24px',
                  borderRadius: '6px',
                  border: 'none',
                  background: '#ef4444',
                  color: '#fff',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                {aplicandoCobro ? 'Aplicando...' : (
                  penalidadAplicar.tipo_es_a_favor 
                    ? 'Aplicar Descuento' 
                    : (aplicarFraccionado ? 'Crear Cuotas' : 'Aplicar Cobro')
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Reasignar Semana */}
      {showReasignarModal && penalidadReasignar && (
        <div className="modal-overlay" onClick={() => setShowReasignarModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
            <div className="modal-header" style={{ borderBottom: 'none', padding: '20px 24px 0' }}>
              <h3 style={{ margin: 0, fontSize: '18px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <ArrowRightLeft size={20} style={{ color: '#3B82F6' }} />
                Reasignar Semana
              </h3>
              <button className="modal-close" onClick={() => setShowReasignarModal(false)}>
                <X size={20} />
              </button>
            </div>
            
            <div className="modal-body" style={{ padding: '20px 24px' }}>
              {/* Info del cobro */}
              <div style={{ 
                padding: '16px', 
                background: '#f8f9fa', 
                borderRadius: '8px', 
                marginBottom: '20px',
                border: '1px solid #e9ecef'
              }}>
                <div style={{ fontSize: '13px', color: '#666', marginBottom: '4px' }}>Conductor</div>
                <div style={{ fontWeight: 600, fontSize: '15px', marginBottom: '12px' }}>
                  {penalidadReasignar.conductor_display || 'Sin conductor'}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '13px', color: '#666', marginBottom: '2px' }}>Monto</div>
                    <div style={{ fontWeight: 600, fontSize: '16px', color: penalidadReasignar.tipo_es_a_favor ? '#10B981' : '#EF4444' }}>
                      {penalidadReasignar.tipo_es_a_favor ? '-' : ''}{formatMoney(penalidadReasignar.monto)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '13px', color: '#666', marginBottom: '2px' }}>Semana actual</div>
                    <div style={{ fontWeight: 600, fontSize: '16px' }}>
                      S{penalidadReasignar.semana_aplicacion} - {penalidadReasignar.anio_aplicacion}
                    </div>
                  </div>
                </div>
              </div>

              {/* Selector de nueva semana */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '14px', color: '#333' }}>
                  Nueva semana de aplicación:
                </label>
                <select
                  value={`${nuevaSemana}-${nuevoAnio}`}
                  onChange={(e) => {
                    const [sem, anio] = e.target.value.split('-').map(Number)
                    setNuevaSemana(sem)
                    setNuevoAnio(anio)
                  }}
                  style={{ 
                    width: '100%', 
                    padding: '12px 14px', 
                    borderRadius: '6px', 
                    border: '1px solid #e5e5e5',
                    background: '#fff',
                    color: '#333',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                >
                  {periodosDisponibles.map(p => (
                    <option 
                      key={`${p.semana}-${p.anio}`} 
                      value={`${p.semana}-${p.anio}`}
                      style={{ 
                        fontWeight: p.semana === penalidadReasignar.semana_aplicacion && p.anio === penalidadReasignar.anio_aplicacion ? 'bold' : 'normal'
                      }}
                    >
                      {p.label} {p.semana === penalidadReasignar.semana_aplicacion && p.anio === penalidadReasignar.anio_aplicacion ? '(actual)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Aviso de recálculo */}
              <div style={{ 
                padding: '12px 14px', 
                background: 'rgba(59, 130, 246, 0.1)', 
                borderRadius: '6px',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                fontSize: '13px',
                color: '#1E40AF'
              }}>
                <strong>Recálculo automático:</strong> Al confirmar, se actualizarán los totales de ambos períodos (origen y destino).
              </div>
            </div>

            <div className="modal-footer" style={{ borderTop: 'none', padding: '16px 24px 24px', gap: '12px' }}>
              <button 
                onClick={() => setShowReasignarModal(false)} 
                disabled={reasignando}
                style={{
                  padding: '10px 24px',
                  borderRadius: '6px',
                  border: '1px solid #e5e5e5',
                  background: '#fff',
                  color: '#666',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmarReasignacion}
                disabled={reasignando || (nuevaSemana === penalidadReasignar.semana_aplicacion && nuevoAnio === penalidadReasignar.anio_aplicacion)}
                style={{
                  padding: '10px 24px',
                  borderRadius: '6px',
                  border: 'none',
                  background: '#3B82F6',
                  color: '#fff',
                  fontWeight: 500,
                  cursor: 'pointer',
                  opacity: (nuevaSemana === penalidadReasignar.semana_aplicacion && nuevoAnio === penalidadReasignar.anio_aplicacion) ? 0.5 : 1
                }}
              >
                {reasignando ? 'Reasignando...' : 'Confirmar Reasignación'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// =====================================================
// FORM COMPONENTS
// =====================================================

interface IncidenciaFormProps {
  formData: IncidenciaFormData
  setFormData: React.Dispatch<React.SetStateAction<IncidenciaFormData>>
  estados: IncidenciaEstado[]
  vehiculos: VehiculoSimple[]
  conductores: ConductorSimple[]
  tiposCobroDescuento: TipoCobroDescuento[]
  disabled?: boolean
  esCobro?: boolean  // Indica si es incidencia de cobro (muestra campo monto)
}

interface ConductorAsignado {
  id: string
  nombre_completo: string
  horario: string // TURNO o CARGO (de asignacion)
  turno: string // diurno, nocturno, todo_dia (de asignaciones_conductores)
}

function IncidenciaForm({ formData, setFormData, estados, vehiculos, conductores, tiposCobroDescuento, disabled, esCobro = false }: IncidenciaFormProps) {
  const [vehiculoSearch, setVehiculoSearch] = useState('')
  const [conductorSearch, setConductorSearch] = useState('')
  const [showVehiculoDropdown, setShowVehiculoDropdown] = useState(false)
  const [showConductorDropdown, setShowConductorDropdown] = useState(false)

  // Estado para modal de selección de conductor
  const [showConductorSelectModal, setShowConductorSelectModal] = useState(false)
  const [conductoresAsignados, setConductoresAsignados] = useState<ConductorAsignado[]>([])
  const [loadingConductores, setLoadingConductores] = useState(false)

  const selectedVehiculo = vehiculos.find(v => v.id === formData.vehiculo_id)
  const selectedConductor = conductores.find(c => c.id === formData.conductor_id)

  // Tipos categorizados memoizados
  const { tiposP006, tiposP004, tiposP007, tiposSinCategoria } = useCategorizedTipos(tiposCobroDescuento)

  // Buscar conductores asignados al vehículo seleccionado
  async function buscarConductoresAsignados(vehiculoId: string) {
    setLoadingConductores(true)
    try {
      // Consultar asignaciones activas del vehículo con sus conductores
      const { data, error } = await supabase
        .from('asignaciones')
        .select(`
          id,
          horario,
          asignaciones_conductores (
            horario,
            conductores (
              id,
              nombres,
              apellidos
            )
          )
        `)
        .eq('vehiculo_id', vehiculoId)
        .eq('estado', 'activa')

      if (error) throw error

      // Extraer conductores de asignaciones_conductores
      const conductoresData: ConductorAsignado[] = []
      for (const asig of (data || [])) {
        const asigConductores = (asig as any).asignaciones_conductores || []
        for (const ac of asigConductores) {
          if (ac.conductores) {
            // Mapear turno: diurno -> Diurno, nocturno -> Nocturno, todo_dia -> A cargo
            let turnoDisplay = 'A cargo'
            if (ac.horario === 'diurno') turnoDisplay = 'Diurno'
            else if (ac.horario === 'nocturno') turnoDisplay = 'Nocturno'

            conductoresData.push({
              id: ac.conductores.id,
              nombre_completo: `${ac.conductores.nombres} ${ac.conductores.apellidos}`,
              horario: (asig as any).horario === 'TURNO' ? 'Turno' : 'A Cargo',
              turno: turnoDisplay
            })
          }
        }
      }

      if (conductoresData.length === 1) {
        // Solo un conductor, auto-seleccionar y setear turno
        setFormData(prev => ({
          ...prev,
          conductor_id: conductoresData[0].id,
          turno: conductoresData[0].turno
        }))
        setConductorSearch('')
      } else if (conductoresData.length > 1) {
        // Múltiples conductores, mostrar modal para elegir
        setConductoresAsignados(conductoresData)
        setShowConductorSelectModal(true)
      }
      // Si no hay conductores asignados, no hacer nada (permite búsqueda manual)
    } catch (error) {
      console.error('Error buscando conductores asignados:', error)
    } finally {
      setLoadingConductores(false)
    }
  }

  // Manejar selección de vehículo
  function handleSelectVehiculo(vehiculo: VehiculoSimple) {
    setFormData(prev => ({ ...prev, vehiculo_id: vehiculo.id, vehiculo_patente: undefined }))
    setVehiculoSearch('')
    setShowVehiculoDropdown(false)
    // Buscar conductores asignados
    buscarConductoresAsignados(vehiculo.id)
  }

  // Manejar selección de conductor desde modal
  function handleSelectConductorFromModal(conductor: ConductorAsignado) {
    setFormData(prev => ({
      ...prev,
      conductor_id: conductor.id,
      turno: conductor.turno // Auto-setear el turno del conductor
    }))
    setConductorSearch('')
    setShowConductorSelectModal(false)
    setConductoresAsignados([])
  }

  // Calcular número de semana ISO 8601
  const getWeekNumber = (dateStr: string): number => {
    if (!dateStr) return 0
    // Parsear la fecha usando componentes locales para evitar problemas de timezone
    const [year, month, day] = dateStr.split('-').map(Number)
    const date = new Date(year, month - 1, day, 12, 0, 0) // mediodía hora local

    // ISO week: la semana 1 es la que contiene el primer jueves del año
    const thursday = new Date(date)
    thursday.setDate(date.getDate() - ((date.getDay() + 6) % 7) + 3) // Ir al jueves de la semana

    const firstThursday = new Date(thursday.getFullYear(), 0, 4) // 4 de enero siempre está en semana 1
    firstThursday.setDate(firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7) + 3)

    const weekNumber = Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1
    return weekNumber
  }

  const semanaCalculada = getWeekNumber(formData.fecha)

  const filteredVehiculos = vehiculos.filter(v => {
    const term = vehiculoSearch.toLowerCase()
    return v.patente.toLowerCase().includes(term) || v.marca.toLowerCase().includes(term)
  }).slice(0, 10)

  const filteredConductores = conductores.filter(c => {
    return c.nombre_completo.toLowerCase().includes(conductorSearch.toLowerCase())
  }).slice(0, 10)

  return (
    <>
      <div className="form-section">
        <div className="form-section-title">Datos de la Incidencia</div>
        <div className="form-row">
          <div className="form-group">
            <label>Patente</label>
            <div className="searchable-select">
              <input
                type="text"
                autoComplete="off"
                value={selectedVehiculo ? `${selectedVehiculo.patente} - ${selectedVehiculo.marca} ${selectedVehiculo.modelo}` : vehiculoSearch}
                onChange={e => {
                  setVehiculoSearch(e.target.value)
                  setShowVehiculoDropdown(true)
                  if (formData.vehiculo_id) setFormData(prev => ({ ...prev, vehiculo_id: undefined }))
                }}
                onFocus={() => setShowVehiculoDropdown(true)}
                onBlur={() => setTimeout(() => setShowVehiculoDropdown(false), 200)}
                placeholder="Buscar patente..."
                disabled={disabled}
              />
              {showVehiculoDropdown && vehiculoSearch && filteredVehiculos.length > 0 && (
                <div className="searchable-dropdown">
                  {filteredVehiculos.map(v => (
                    <div key={v.id} className="searchable-option" onClick={() => handleSelectVehiculo(v)}>
                      <strong>{v.patente}</strong> - {v.marca} {v.modelo}
                    </div>
                  ))}
                </div>
              )}
              {loadingConductores && (
                <div className="searchable-loading">Buscando conductores...</div>
              )}
              {selectedVehiculo && (
                <button type="button" className="clear-selection" onClick={() => {
                  setFormData(prev => ({ ...prev, vehiculo_id: undefined, conductor_id: undefined }))
                  setVehiculoSearch('')
                }}>
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
          <div className="form-group">
            <label>Conductor</label>
            <div className="searchable-select">
              <input
                type="text"
                autoComplete="off"
                value={selectedConductor ? selectedConductor.nombre_completo : conductorSearch}
                onChange={e => {
                  setConductorSearch(e.target.value)
                  setShowConductorDropdown(true)
                  if (formData.conductor_id) setFormData(prev => ({ ...prev, conductor_id: undefined }))
                }}
                onFocus={() => setShowConductorDropdown(true)}
                onBlur={() => setTimeout(() => setShowConductorDropdown(false), 200)}
                placeholder="Buscar conductor..."
                disabled={disabled}
              />
              {showConductorDropdown && conductorSearch && filteredConductores.length > 0 && (
                <div className="searchable-dropdown">
                  {filteredConductores.map(c => (
                    <div key={c.id} className="searchable-option" onClick={() => {
                      setFormData(prev => ({ ...prev, conductor_id: c.id, conductor_nombre: undefined }))
                      setConductorSearch('')
                      setShowConductorDropdown(false)
                    }}>
                      {c.nombre_completo}
                    </div>
                  ))}
                </div>
              )}
              {selectedConductor && (
                <button type="button" className="clear-selection" onClick={() => {
                  setFormData(prev => ({ ...prev, conductor_id: undefined }))
                  setConductorSearch('')
                }}>
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="form-row three-cols">
          <div className="form-group">
            <label>Fecha <span className="required">*</span></label>
            <input
              type="date"
              value={formData.fecha}
              onChange={e => setFormData(prev => ({ ...prev, fecha: e.target.value }))}
              disabled={disabled}
            />
          </div>
          <div className="form-group">
            <label>Semana</label>
            <input
              type="text"
              value={semanaCalculada || '-'}
              readOnly
              className="form-input-readonly"
            />
          </div>
          <div className="form-group">
            <label>Turno</label>
            <input
              type="text"
              value={formData.turno || '-'}
              readOnly
              className="form-input-readonly"
              placeholder="Se carga del conductor"
            />
          </div>
        </div>
        <div className="form-row three-cols">
          <div className="form-group">
            <label>Tipo de Incidencia <span className="required">*</span></label>
            <select 
              value={formData.tipo_cobro_descuento_id || ''} 
              onChange={e => setFormData(prev => ({ ...prev, tipo_cobro_descuento_id: e.target.value || undefined }))} 
              disabled={disabled}
            >
              <option value="">Seleccionar</option>
              {esCobro ? (
                // Tipos que generan COBRO - agrupados por categoría
                <>
                  {/* P006 - Exceso KM */}
                  {tiposP006.length > 0 && (
                    <optgroup label="P006 - Exceso KM">
                      {tiposP006.map(tipo => (
                        <option key={tipo.id} value={tipo.id}>{tipo.nombre}</option>
                      ))}
                    </optgroup>
                  )}
                  {/* P004 - Tickets a Favor */}
                  {tiposP004.length > 0 && (
                    <optgroup label="P004 - Tickets a Favor">
                      {tiposP004.map(tipo => (
                        <option key={tipo.id} value={tipo.id}>{tipo.nombre}</option>
                      ))}
                    </optgroup>
                  )}
                  {/* P007 - Multas/Penalidades */}
                  {tiposP007.length > 0 && (
                    <optgroup label="P007 - Multas/Penalidades">
                      {tiposP007.map(tipo => (
                        <option key={tipo.id} value={tipo.id}>{tipo.nombre}</option>
                      ))}
                    </optgroup>
                  )}
                  {/* Sin categoría */}
                  {tiposSinCategoria.map(tipo => (
                    <option key={tipo.id} value={tipo.id}>{tipo.nombre}</option>
                  ))}
                </>
              ) : (
                // Tipos de LOGÍSTICA (no generan cobro)
                <>
                  <option value="__ENTREGA_TARDIA">Entrega tardía del vehículo</option>
                  <option value="__LLEGADA_TARDE_REVISION">Llegada tarde o inasistencia injustificada a revisión técnica</option>
                  <option value="__ZONAS_RESTRINGIDAS">Ingreso a zonas restringidas</option>
                  <option value="__FALTA_LAVADO">Falta de lavado</option>
                  <option value="__FALTA_RESTITUCION_UNIDAD">Falta de restitución de la unidad</option>
                  <option value="__PERDIDA_DANO_SEGURIDAD">Pérdida o daño de elementos de seguridad</option>
                  <option value="__FALTA_RESTITUCION_GNC">Falta restitución de GNC</option>
                  <option value="__FALTA_RESTITUCION_NAFTA">Falta restitución de Nafta</option>
                  <option value="__MORA_CANON">Mora en canon</option>
                  <option value="__MANIPULACION_GPS">Manipulación no autorizada de GPS</option>
                  <option value="__ABANDONO_VEHICULO">Abandono del vehículo</option>
                  <option value="__SIN_LUGAR_GUARDA">No disponer de lugar seguro para la guarda del vehículo</option>
                  <option value="__IBUTTON">I button</option>
                  <option value="__MULTA_TRANSITO">Multa de tránsito</option>
                  <option value="__REPARACION_SINIESTRO">Reparación Siniestro</option>
                  <option value="__FALTA_REPORTE">Falta de reporte (Intercom)</option>
                  <option value="__OTRO">Otro</option>
                </>
              )}
            </select>
          </div>
          <div className="form-group">
            <label>Área <span className="required">*</span></label>
            <select value={formData.area || ''} onChange={e => setFormData(prev => ({ ...prev, area: e.target.value }))} disabled={disabled}>
              <option value="">Seleccionar</option>
              <option value="Logística">Logística</option>
              <option value="Data Entry">Data Entry</option>
              <option value="Administración">Administración</option>
              <option value="Siniestros">Siniestros</option>
            </select>
          </div>
          <div className="form-group">
            <label>Estado <span className="required">*</span></label>
            <select value={formData.estado_id} onChange={e => setFormData(prev => ({ ...prev, estado_id: e.target.value }))} disabled={disabled}>
              <option value="">Seleccionar</option>
              {estados.map(e => (
                <option key={e.id} value={e.id}>{e.nombre}</option>
              ))}
            </select>
          </div>
        </div>
        {/* Monto solo para cobro */}
        {esCobro && (
          <div className="form-row">
            <div className="form-group">
              <label>Monto <span className="required">*</span></label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.monto || ''}
                onChange={e => setFormData(prev => ({ ...prev, monto: e.target.value ? parseFloat(e.target.value) : undefined }))}
                placeholder="0.00"
                disabled={disabled}
              />
            </div>
            <div className="form-group">
              <label>Estado del Vehículo</label>
              <select value={formData.estado_vehiculo || ''} onChange={e => setFormData(prev => ({ ...prev, estado_vehiculo: e.target.value }))} disabled={disabled}>
                <option value="">Seleccionar</option>
                <option value="En uso">En uso</option>
                <option value="Parking-Disponible">Parking-Disponible</option>
                <option value="Parking-No disponible">Parking-No disponible</option>
                <option value="Taller">Taller</option>
                <option value="Taller mecanico">Taller mecánico</option>
                <option value="Taller chapa & pintura">Taller chapa & pintura</option>
                <option value="Sin asignar">Sin asignar</option>
              </select>
            </div>
          </div>
        )}
        {/* Estado vehículo para logística */}
        {!esCobro && (
          <div className="form-row">
            <div className="form-group">
              <label>Estado del Vehículo</label>
              <select value={formData.estado_vehiculo || ''} onChange={e => setFormData(prev => ({ ...prev, estado_vehiculo: e.target.value }))} disabled={disabled}>
                <option value="">Seleccionar</option>
                <option value="En uso">En uso</option>
                <option value="Parking-Disponible">Parking-Disponible</option>
                <option value="Parking-No disponible">Parking-No disponible</option>
                <option value="Taller">Taller</option>
                <option value="Taller mecanico">Taller mecánico</option>
                <option value="Taller chapa & pintura">Taller chapa & pintura</option>
                <option value="Sin asignar">Sin asignar</option>
              </select>
            </div>
            <div className="form-group">
              <label>Registrado por</label>
              <input
                type="text"
                value={formData.registrado_por || ''}
                readOnly
                className="form-input-readonly"
                placeholder="Se asigna automáticamente"
              />
            </div>
          </div>
        )}
        {esCobro && (
          <div className="form-row">
            <div className="form-group">
              <label>Registrado por</label>
              <input
                type="text"
                value={formData.registrado_por || ''}
                readOnly
                className="form-input-readonly"
                placeholder="Se asigna automáticamente"
              />
            </div>
          </div>
        )}
      </div>

      <div className="form-section">
        <div className="form-section-title">Descripción</div>
        <div className="form-row">
          <div className="form-group full-width">
            <label>Descripción del problema</label>
            <textarea
              value={formData.descripcion || ''}
              onChange={e => setFormData(prev => ({ ...prev, descripcion: e.target.value }))}
              placeholder="Describa la incidencia..."
              disabled={disabled}
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group full-width">
            <label>Acción ejecutada</label>
            <textarea
              value={formData.accion_ejecutada || ''}
              onChange={e => setFormData(prev => ({ ...prev, accion_ejecutada: e.target.value }))}
              placeholder="¿Qué se hizo para resolver?"
              disabled={disabled}
            />
          </div>
        </div>
      </div>

      {/* Modal de selección de conductor */}
      {showConductorSelectModal && (
        <div className="conductor-select-modal-overlay" onClick={() => setShowConductorSelectModal(false)}>
          <div className="conductor-select-modal" onClick={e => e.stopPropagation()}>
            <div className="conductor-select-modal-header">
              <h4>Seleccionar Conductor</h4>
              <p>Este vehículo tiene múltiples conductores asignados</p>
            </div>
            <div className="conductor-select-modal-list">
              {conductoresAsignados.map(c => (
                <button
                  key={c.id}
                  type="button"
                  className="conductor-select-option"
                  onClick={() => handleSelectConductorFromModal(c)}
                >
                  <span className="conductor-select-name">{c.nombre_completo}</span>
                  <span className={`conductor-select-turno ${c.turno.toLowerCase().replace(' ', '-')}`}>{c.turno}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="conductor-select-skip"
              onClick={() => setShowConductorSelectModal(false)}
            >
              Omitir selección
            </button>
          </div>
        </div>
      )}
    </>
  )
}

// =====================================================
// DETAIL VIEW COMPONENTS
// =====================================================

interface IncidenciaDetailViewProps {
  incidencia: IncidenciaCompleta
  onEdit: () => void
}

function IncidenciaDetailView({ incidencia, onEdit }: IncidenciaDetailViewProps) {
  function formatDate(dateStr: string | undefined | null) {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('es-AR')
  }

  return (
    <div className="incidencia-detail">
      <div className="detail-header">
        <div>
          <p className="detail-id">ID: {incidencia.id.slice(0, 8)}...</p>
          <h3 className="detail-title">{incidencia.patente_display || 'Sin patente'}</h3>
          <span className={`estado-badge estado-${incidencia.estado_color}`}>{incidencia.estado_nombre}</span>
        </div>
        <button className="btn-secondary" onClick={onEdit}>
          <Edit2 size={14} />
          Editar
        </button>
      </div>

      <div className="detail-cards">
        <div className="detail-card">
          <div className="detail-card-title">Información General</div>
          <div className="detail-item">
            <span className="detail-item-label">Fecha</span>
            <span className="detail-item-value">{formatDate(incidencia.fecha)}</span>
          </div>
          <div className="detail-item">
            <span className="detail-item-label">Semana</span>
            <span className="detail-item-value">{incidencia.semana || '-'}</span>
          </div>
          <div className="detail-item">
            <span className="detail-item-label">Tipo</span>
            <span className="detail-item-value">{incidencia.turno || '-'}</span>
          </div>
          <div className="detail-item">
            <span className="detail-item-label">Área</span>
            <span className="detail-item-value">{incidencia.area || '-'}</span>
          </div>
          <div className="detail-item">
            <span className="detail-item-label">Registrado por</span>
            <span className="detail-item-value">{incidencia.registrado_por || '-'}</span>
          </div>
        </div>

        <div className="detail-card">
          <div className="detail-card-title">Vehículo y Conductor</div>
          <div className="detail-item">
            <span className="detail-item-label">Patente</span>
            <span className="detail-item-value">{incidencia.patente_display || '-'}</span>
          </div>
          <div className="detail-item">
            <span className="detail-item-label">Vehículo</span>
            <span className="detail-item-value">{incidencia.vehiculo_marca} {incidencia.vehiculo_modelo}</span>
          </div>
          <div className="detail-item">
            <span className="detail-item-label">Conductor</span>
            <span className="detail-item-value">{incidencia.conductor_display || '-'}</span>
          </div>
          <div className="detail-item">
            <span className="detail-item-label">Estado vehículo</span>
            <span className="detail-item-value">{incidencia.estado_vehiculo || '-'}</span>
          </div>
          <div className="detail-item">
            <span className="detail-item-label">Penalidades</span>
            <span className="detail-item-value">{incidencia.total_penalidades}</span>
          </div>
        </div>
      </div>

      {incidencia.descripcion && (
        <div className="detail-description">
          <div className="detail-description-title">Descripción</div>
          <p>{incidencia.descripcion}</p>
        </div>
      )}

      {incidencia.accion_ejecutada && (
        <div className="detail-description">
          <div className="detail-description-title">Acción Ejecutada</div>
          <p>{incidencia.accion_ejecutada}</p>
        </div>
      )}
    </div>
  )
}

interface PenalidadDetailViewProps {
  penalidad: PenalidadCompleta
  onEdit?: () => void
  historialRechazos?: Array<{id: string; motivo: string; rechazado_por_nombre: string; created_at: string}>
  loadingHistorial?: boolean
}

function PenalidadDetailView({ penalidad, onEdit, historialRechazos = [], loadingHistorial = false }: PenalidadDetailViewProps) {
  function formatDate(dateStr: string | undefined | null) {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('es-AR')
  }
  
  function formatDateTime(dateStr: string | undefined | null) {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleString('es-AR', { 
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  }

  function formatMoney(value: number | undefined | null) {
    if (!value) return '-'
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value)
  }
  
  const esRechazado = penalidad.rechazado

  return (
    <div className="incidencia-detail">
      <div className="detail-header">
        <div>
          <p className="detail-id">ID: {penalidad.id.slice(0, 8)}...</p>
          <h3 className="detail-title">{penalidad.conductor_display || 'Sin conductor'}</h3>
          <span className={`aplicado-badge ${esRechazado ? 'aplicado-rechazado' : penalidad.aplicado ? 'aplicado-si' : 'aplicado-no'}`}>
            {esRechazado ? 'Rechazado' : penalidad.aplicado ? 'Aplicado' : 'Pendiente'}
          </span>
        </div>
        {!esRechazado && onEdit && (
          <button className="btn-secondary" onClick={onEdit}>
            <Edit2 size={14} />
            Editar
          </button>
        )}
      </div>

      <div className="detail-cards">
        <div className="detail-card">
          <div className="detail-card-title">Información General</div>
          <div className="detail-item">
            <span className="detail-item-label">Fecha</span>
            <span className="detail-item-value">{formatDate(penalidad.fecha)}</span>
          </div>
          <div className="detail-item">
            <span className="detail-item-label">Tipo</span>
            <span className="detail-item-value">{penalidad.tipo_nombre || '-'}</span>
          </div>
          <div className="detail-item">
            <span className="detail-item-label">Detalle</span>
            <span className="detail-item-value">{penalidad.detalle || '-'}</span>
          </div>
          <div className="detail-item">
            <span className="detail-item-label">Monto</span>
            <span className="detail-item-value" style={{ fontWeight: 600, color: '#F59E0B' }}>{formatMoney(penalidad.monto)}</span>
          </div>
          <div className="detail-item">
            <span className="detail-item-label">Área responsable</span>
            <span className="detail-item-value">{penalidad.area_responsable || '-'}</span>
          </div>
        </div>

        <div className="detail-card">
          <div className="detail-card-title">Conductor y Vehículo</div>
          <div className="detail-item">
            <span className="detail-item-label">Conductor</span>
            <span className="detail-item-value">{penalidad.conductor_display || '-'}</span>
          </div>
          <div className="detail-item">
            <span className="detail-item-label">Patente</span>
            <span className="detail-item-value">{penalidad.patente_display || '-'}</span>
          </div>
          <div className="detail-item">
            <span className="detail-item-label">Turno</span>
            <span className="detail-item-value">{penalidad.turno || '-'}</span>
          </div>
          <div className="detail-item">
            <span className="detail-item-label">Fecha aplicación</span>
            <span className="detail-item-value">{formatDate(penalidad.fecha_aplicacion)}</span>
          </div>
        </div>
      </div>

      {penalidad.observaciones && (
        <div className="detail-description">
          <div className="detail-description-title">Observaciones</div>
          <p>{penalidad.observaciones}</p>
        </div>
      )}

      {penalidad.nota_administrativa && (
        <div className="detail-description">
          <div className="detail-description-title">Nota Administrativa</div>
          <p>{penalidad.nota_administrativa}</p>
        </div>
      )}
      
      {/* Historial de rechazos */}
      {(loadingHistorial || historialRechazos.length > 0) && (
        <div className="detail-description" style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
          <div className="detail-description-title" style={{ color: '#dc2626' }}>Historial de Rechazos</div>
          {loadingHistorial ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
              Cargando historial...
            </div>
          ) : historialRechazos.map((rechazo, idx) => (
            <div key={rechazo.id} style={{ 
              padding: '12px', 
              background: 'white', 
              borderRadius: '6px', 
              marginBottom: idx < historialRechazos.length - 1 ? '8px' : 0 
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontWeight: 600, color: '#dc2626' }}>Rechazo #{historialRechazos.length - idx}</span>
                <span style={{ fontSize: '12px', color: '#666' }}>{formatDateTime(rechazo.created_at)}</span>
              </div>
              <p style={{ margin: '0 0 4px 0', color: '#333' }}>{rechazo.motivo}</p>
              <span style={{ fontSize: '12px', color: '#888' }}>Por: {rechazo.rechazado_por_nombre || 'Sistema'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
