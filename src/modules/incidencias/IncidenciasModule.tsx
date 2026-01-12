// src/modules/incidencias/IncidenciasModule.tsx
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { usePermissions } from '../../contexts/PermissionsContext'
import { ExcelColumnFilter, useExcelFilters } from '../../components/ui/DataTable/ExcelColumnFilter'
import Swal from 'sweetalert2'
import {
  Plus,
  Eye,
  Edit2,
  FileText,
  X,
  Shield,
  Clock,
  DollarSign,
  CheckCircle,
  XCircle,
  Users,
  Car,
  Download
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../../components/ui/DataTable'
import type {
  IncidenciaCompleta,
  IncidenciaEstado,
  IncidenciaFormData,
  PenalidadCompleta,
  TipoPenalidad,
  PenalidadFormData,
  VehiculoSimple,
  ConductorSimple
} from '../../types/incidencias.types'
import './IncidenciasModule.css'

type TabType = 'incidencias' | 'penalidades' | 'por_aplicar'

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
  const { canCreateInMenu, canEditInMenu } = usePermissions()

  // Permisos específicos para el menú de incidencias
  const canCreate = canCreateInMenu('incidencias')
  const canEdit = canEditInMenu('incidencias')

  const [activeTab, setActiveTab] = useState<TabType>('incidencias')
  const [loading, setLoading] = useState(true)

  // Data
  const [incidencias, setIncidencias] = useState<IncidenciaCompleta[]>([])
  const [penalidades, setPenalidades] = useState<PenalidadCompleta[]>([])
  const [estados, setEstados] = useState<IncidenciaEstado[]>([])
  const [tiposPenalidad, setTiposPenalidad] = useState<TipoPenalidad[]>([])
  const [vehiculos, setVehiculos] = useState<VehiculoSimple[]>([])
  const [conductores, setConductores] = useState<ConductorSimple[]>([])

  // Filtros por columna tipo Excel con Portal
  const { openFilterId, setOpenFilterId } = useExcelFilters()

  // Filtros - Incidencias
  const [patenteFilter, setPatenteFilter] = useState<string[]>([])
  const [conductorFilter, setConductorFilter] = useState<string[]>([])
  const [estadoFilter, setEstadoFilter] = useState<string[]>([])
  const [turnoFilter, setTurnoFilter] = useState<string[]>([])
  const [areaFilter, setAreaFilter] = useState<string[]>([])

  // Filtros - Penalidades
  const [penPatenteFilter, setPenPatenteFilter] = useState<string[]>([])
  const [penConductorFilter, setPenConductorFilter] = useState<string[]>([])
  const [penTipoFilter, setPenTipoFilter] = useState<string[]>([])
  const [penAplicadoFilter, setPenAplicadoFilter] = useState<string[]>([])

  // Modal
  const [showModal, setShowModal] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'view'>('create')
  const [modalType, setModalType] = useState<'incidencia' | 'penalidad'>('incidencia')
  const [selectedIncidencia, setSelectedIncidencia] = useState<IncidenciaCompleta | null>(null)
  const [selectedPenalidad, setSelectedPenalidad] = useState<PenalidadCompleta | null>(null)

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

  async function cargarDatos() {
    setLoading(true)
    try {
      const [
        estadosRes,
        tiposRes,
        vehiculosRes,
        conductoresRes,
        incidenciasRes,
        penalidadesRes
      ] = await Promise.all([
        (supabase.from('incidencias_estados' as any) as any).select('*').eq('is_active', true).order('orden'),
        (supabase.from('tipos_penalidad' as any) as any).select('*').eq('is_active', true).order('orden'),
        supabase.from('vehiculos').select('id, patente, marca, modelo').order('patente'),
        supabase.from('conductores').select('id, nombres, apellidos').order('apellidos'),
        (supabase.from('v_incidencias_completas' as any) as any).select('*').order('fecha', { ascending: false }),
        (supabase.from('v_penalidades_completas' as any) as any).select('*').order('fecha', { ascending: false })
      ])

      setEstados(estadosRes.data || [])
      setTiposPenalidad(tiposRes.data || [])
      setVehiculos(vehiculosRes.data || [])
      setConductores((conductoresRes.data || []).map((c: any) => ({
        id: c.id,
        nombres: c.nombres,
        apellidos: c.apellidos,
        nombre_completo: `${c.nombres} ${c.apellidos}`
      })))
      setIncidencias(incidenciasRes.data || [])
      setPenalidades(penalidadesRes.data || [])

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


  // Filtrar incidencias con filtros tipo Excel
  const incidenciasFiltradas = useMemo(() => {
    let filtered = [...incidencias]

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
  }, [incidencias, patenteFilter, conductorFilter, estadoFilter, turnoFilter, areaFilter])

  // Filtrar penalidades con filtros tipo Excel
  const penalidadesFiltradas = useMemo(() => {
    let filtered = [...penalidades]

    if (activeTab === 'por_aplicar') {
      filtered = filtered.filter(p => !p.aplicado)
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
      id: 'acciones',
      header: 'Acciones',
      cell: ({ row }) => (
        <div className="dt-actions">
          <button className="dt-btn-action dt-btn-view" title="Ver" onClick={() => handleVerIncidencia(row.original)}>
            <Eye size={14} />
          </button>
          <button className="dt-btn-action dt-btn-edit" title="Editar" onClick={() => handleEditarIncidencia(row.original)}>
            <Edit2 size={14} />
          </button>
        </div>
      )
    }
  ], [patentesUnicas, patenteFilter, conductoresUnicos, conductorFilter, turnosUnicos, turnoFilter, areasUnicas, areaFilter, estadosUnicos, estadoFilter, openFilterId])

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
      id: 'acciones',
      header: 'Acciones',
      cell: ({ row }) => (
        <div className="dt-actions">
          {!row.original.aplicado && (
            <button className="dt-btn-action dt-btn-view" title="Marcar como aplicado" onClick={() => handleMarcarAplicado(row.original)}>
              <CheckCircle size={14} />
            </button>
          )}
          <button className="dt-btn-action dt-btn-view" title="Ver" onClick={() => handleVerPenalidad(row.original)}>
            <Eye size={14} />
          </button>
          <button className="dt-btn-action dt-btn-edit" title="Editar" onClick={() => handleEditarPenalidad(row.original)}>
            <Edit2 size={14} />
          </button>
        </div>
      )
    }
  ], [penPatentesUnicas, penPatenteFilter, penConductoresUnicos, penConductorFilter, penTiposUnicos, penTipoFilter, penAplicadoFilter, openFilterId])

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

  function handleNuevaPenalidad() {
    const areaResponsable = getAreaResponsablePorRol(profile?.roles?.name)
    setPenalidadForm({
      fecha: getLocalDateString(),
      aplicado: false,
      area_responsable: areaResponsable || undefined
    })
    setSelectedPenalidad(null)
    setModalMode('create')
    setModalType('penalidad')
    setShowModal(true)
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
      vehiculo_patente: incidencia.vehiculo_patente
    })
    setModalMode('edit')
    setModalType('incidencia')
    setShowModal(true)
  }

  function handleVerPenalidad(penalidad: PenalidadCompleta) {
    setSelectedPenalidad(penalidad)
    setModalMode('view')
    setModalType('penalidad')
    setShowModal(true)
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

    setSaving(true)
    try {
      // Calcular semana basada en la fecha
      const semanaCalculada = getWeekNumber(incidenciaForm.fecha)
      const dataToSave = {
        ...incidenciaForm,
        semana: semanaCalculada,
        created_by: user?.id
      }

      if (modalMode === 'edit' && selectedIncidencia) {
        const { error } = await (supabase.from('incidencias' as any) as any)
          .update({ ...dataToSave, updated_by: profile?.full_name || 'Sistema' })
          .eq('id', selectedIncidencia.id)
        if (error) throw error
        Swal.fire('Guardado', 'Incidencia actualizada correctamente', 'success')
      } else {
        const { error } = await (supabase.from('incidencias' as any) as any)
          .insert({ ...dataToSave, created_by_name: profile?.full_name || 'Sistema' })
        if (error) throw error
        Swal.fire('Guardado', 'Incidencia registrada correctamente', 'success')
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
      const dataToSave = {
        ...penalidadForm,
        semana: semanaCalculada,
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

  async function handleMarcarAplicado(penalidad: PenalidadCompleta) {
    const result = await Swal.fire({
      title: '¿Marcar como aplicado?',
      text: `Penalidad de ${formatMoney(penalidad.monto)} para ${penalidad.conductor_display}`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#F59E0B',
      confirmButtonText: 'Sí, aplicar',
      cancelButtonText: 'Cancelar'
    })

    if (result.isConfirmed) {
      try {
        const { error } = await (supabase.from('penalidades' as any) as any)
          .update({ aplicado: true, fecha_aplicacion: new Date().toISOString().split('T')[0], updated_by: profile?.full_name || 'Sistema' })
          .eq('id', penalidad.id)
        if (error) throw error
        Swal.fire('Aplicado', 'La penalidad fue marcada como aplicada', 'success')
        cargarDatos()
      } catch (error: any) {
        Swal.fire('Error', error.message, 'error')
      }
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
      'Total Penalidades': i.total_penalidades || 0
    }))

    const ws = XLSX.utils.json_to_sheet(dataExport)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Incidencias')

    const colWidths = [
      { wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 20 }, { wch: 25 },
      { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 35 },
      { wch: 35 }, { wch: 15 }, { wch: 12 }
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
  const countPorAplicar = penalidades.filter(p => !p.aplicado).length

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
            className={`incidencias-tab ${activeTab === 'incidencias' ? 'active' : ''}`}
            onClick={() => setActiveTab('incidencias')}
          >
            <FileText size={16} />
            Listado
            <span className="tab-badge">{incidencias.length}</span>
          </button>
          <button
            className={`incidencias-tab ${activeTab === 'penalidades' ? 'active' : ''}`}
            onClick={() => setActiveTab('penalidades')}
          >
            <DollarSign size={16} />
            Cobros&Descuentos
          </button>
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
        </div>
        <div className="tabs-actions">
          <button
            className="btn-secondary"
            onClick={activeTab === 'incidencias' ? handleExportarIncidencias : handleExportarPenalidades}
            title="Exportar a Excel"
          >
            <Download size={16} />
            Exportar
          </button>
          <button
            className="btn-primary"
            onClick={activeTab === 'penalidades' || activeTab === 'por_aplicar' ? handleNuevaPenalidad : handleNuevaIncidencia}
            disabled={!canCreate}
            title={!canCreate ? 'No tienes permisos para crear' : ''}
          >
            <Plus size={16} />
            {activeTab === 'penalidades' || activeTab === 'por_aplicar' ? 'Nueva Penalidad' : 'Nueva Incidencia'}
          </button>
        </div>
      </div>

      {/* Incidencias Tab */}
      {activeTab === 'incidencias' && (
        <>
          {/* Tabla con DataTable */}
          <DataTable
            data={incidenciasFiltradas}
            columns={incidenciasColumns}
            loading={loading}
            searchPlaceholder="Buscar por patente, conductor..."
            emptyIcon={<Shield size={48} />}
            emptyTitle="Sin incidencias"
            emptyDescription="No hay incidencias registradas"
            pageSize={20}
            pageSizeOptions={[10, 20, 50, 100]}
          />
        </>
      )}

      {/* Penalidades / Por Aplicar Tab */}
      {(activeTab === 'penalidades' || activeTab === 'por_aplicar') && (
        <>
          {/* Stats - diferentes según tab */}
          <div className="incidencias-stats">
            <div className="stats-grid">
              {activeTab === 'por_aplicar' ? (
                // Tab Por Aplicar - solo mostrar pendientes
                <>
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
                </>
              ) : (
                // Tab Cobros&Descuentos - mostrar pendientes, aplicadas y totales
                <>
                  <div className="stat-card">
                    <Clock size={20} className="stat-icon" />
                    <div className="stat-content">
                      <span className="stat-value">{penalidades.filter(p => !p.aplicado).length}</span>
                      <span className="stat-label">Pendientes</span>
                    </div>
                  </div>
                  <div className="stat-card">
                    <DollarSign size={20} className="stat-icon" />
                    <div className="stat-content">
                      <span className="stat-value">{formatMoney(penalidades.filter(p => !p.aplicado).reduce((s, p) => s + (p.monto || 0), 0))}</span>
                      <span className="stat-label">$ Pendiente</span>
                    </div>
                  </div>
                  <div className="stat-card">
                    <CheckCircle size={20} className="stat-icon" />
                    <div className="stat-content">
                      <span className="stat-value">{penalidades.filter(p => p.aplicado).length}</span>
                      <span className="stat-label">Aplicadas</span>
                    </div>
                  </div>
                  <div className="stat-card">
                    <DollarSign size={20} className="stat-icon" />
                    <div className="stat-content">
                      <span className="stat-value">{formatMoney(penalidades.filter(p => p.aplicado).reduce((s, p) => s + (p.monto || 0), 0))}</span>
                      <span className="stat-label">$ Aplicado</span>
                    </div>
                  </div>
                  <div className="stat-card">
                    <FileText size={20} className="stat-icon" />
                    <div className="stat-content">
                      <span className="stat-value">{penalidades.length}</span>
                      <span className="stat-label">Total</span>
                    </div>
                  </div>
                  <div className="stat-card">
                    <DollarSign size={20} className="stat-icon" />
                    <div className="stat-content">
                      <span className="stat-value">{formatMoney(penalidades.reduce((s, p) => s + (p.monto || 0), 0))}</span>
                      <span className="stat-label">$ Total</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Tabla Penalidades con DataTable */}
          <DataTable
            data={penalidadesFiltradas}
            columns={penalidadesColumns}
            loading={loading}
            searchPlaceholder="Buscar por patente, conductor..."
            emptyIcon={<Shield size={48} />}
            emptyTitle="Sin penalidades"
            emptyDescription="No hay penalidades registradas"
            pageSize={20}
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
                 (modalType === 'incidencia' ? 'Detalle de Incidencia' : 'Detalle de Penalidad')}
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
                    onEdit={() => handleEditarPenalidad(selectedPenalidad)}
                  />
                ) : null
              ) : modalType === 'incidencia' ? (
                <IncidenciaForm
                  formData={incidenciaForm}
                  setFormData={setIncidenciaForm}
                  estados={estados}
                  vehiculos={vehiculos}
                  conductores={conductores}
                  disabled={saving}
                />
              ) : (
                <PenalidadForm
                  formData={penalidadForm}
                  setFormData={setPenalidadForm}
                  tiposPenalidad={tiposPenalidad}
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
  disabled?: boolean
}

interface ConductorAsignado {
  id: string
  nombre_completo: string
  horario: string // TURNO o CARGO (de asignacion)
  turno: string // diurno, nocturno, todo_dia (de asignaciones_conductores)
}

function IncidenciaForm({ formData, setFormData, estados, vehiculos, conductores, disabled }: IncidenciaFormProps) {
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
        <div className="form-row">
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
        </div>
        <div className="form-row three-cols">
          <div className="form-group">
            <label>Tipo</label>
            <select value={formData.turno || ''} onChange={e => setFormData(prev => ({ ...prev, turno: e.target.value }))} disabled={disabled}>
              <option value="">Seleccionar</option>
              <option value="Diurno">Diurno</option>
              <option value="Nocturno">Nocturno</option>
              <option value="A cargo">A cargo</option>
            </select>
          </div>
          <div className="form-group">
            <label>Área <span className="required">*</span></label>
            <select value={formData.area || ''} onChange={e => setFormData(prev => ({ ...prev, area: e.target.value }))} disabled={disabled}>
              <option value="">Seleccionar</option>
              <option value="Logística">Logística</option>
              <option value="Data Entry">Data Entry</option>
              <option value="Administración">Administración</option>
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

interface PenalidadFormProps {
  formData: PenalidadFormData
  setFormData: React.Dispatch<React.SetStateAction<PenalidadFormData>>
  tiposPenalidad: TipoPenalidad[]
  vehiculos: VehiculoSimple[]
  conductores: ConductorSimple[]
  disabled?: boolean
}

function PenalidadForm({ formData, setFormData, tiposPenalidad, vehiculos, conductores, disabled }: PenalidadFormProps) {
  const [conductorSearch, setConductorSearch] = useState('')
  const [showConductorDropdown, setShowConductorDropdown] = useState(false)
  const [vehiculoSearch, setVehiculoSearch] = useState('')
  const [showVehiculoDropdown, setShowVehiculoDropdown] = useState(false)

  // Estado para modal de selección de conductor
  const [showConductorSelectModal, setShowConductorSelectModal] = useState(false)
  const [conductoresAsignados, setConductoresAsignados] = useState<ConductorAsignado[]>([])
  const [loadingConductores, setLoadingConductores] = useState(false)

  const selectedConductor = conductores.find(c => c.id === formData.conductor_id)
  const selectedVehiculo = vehiculos.find(v => v.id === formData.vehiculo_id)

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
        // Solo un conductor, auto-seleccionar
        setFormData(prev => ({ ...prev, conductor_id: conductoresData[0].id }))
        setConductorSearch('')
      } else if (conductoresData.length > 1) {
        // Múltiples conductores, mostrar modal para elegir
        setConductoresAsignados(conductoresData)
        setShowConductorSelectModal(true)
      }
    } catch (error) {
      console.error('Error buscando conductores asignados:', error)
    } finally {
      setLoadingConductores(false)
    }
  }

  // Manejar selección de vehículo
  function handleSelectVehiculoPenalidad(vehiculo: VehiculoSimple) {
    setFormData(prev => ({ ...prev, vehiculo_id: vehiculo.id, vehiculo_patente: undefined }))
    setVehiculoSearch('')
    setShowVehiculoDropdown(false)
    // Buscar conductores asignados
    buscarConductoresAsignados(vehiculo.id)
  }

  // Manejar selección de conductor desde modal
  function handleSelectConductorFromModal(conductor: ConductorAsignado) {
    setFormData(prev => ({ ...prev, conductor_id: conductor.id }))
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

  const filteredConductores = conductores.filter(c => {
    return c.nombre_completo.toLowerCase().includes(conductorSearch.toLowerCase())
  }).slice(0, 10)

  const filteredVehiculos = vehiculos.filter(v => {
    const term = vehiculoSearch.toLowerCase()
    return v.patente.toLowerCase().includes(term) || v.marca.toLowerCase().includes(term)
  }).slice(0, 10)

  // Lista de tipos de cobros/descuentos
  const tiposCobrosDescuentos = [
    'Entrega tardía del vehículo',
    'Llegada tarde o inasistencia injustificada a revisión técnica',
    'Ingreso a zonas restringidas',
    'Falta de lavado',
    'Falta de restitución de la unidad',
    'Pérdida o daño de elementos de seguridad',
    'Falta restitución de GNC',
    'Falta restitución de Nafta',
    'Mora en canon',
    'Exceso de kilometraje',
    'Manipulación no autorizada de GPS',
    'Abandono del vehículo',
    'No disponer de lugar seguro para la guarda del vehículo',
    'I button',
    'Multa de tránsito',
    'Reparación Siniestro'
  ]

  return (
    <>
      <div className="form-section">
        <div className="form-section-title">Datos del Cobro/Descuento</div>
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
                    <div key={v.id} className="searchable-option" onClick={() => handleSelectVehiculoPenalidad(v)}>
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
            <label>Conductor <span className="required">*</span></label>
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
                      setFormData(prev => ({ ...prev, conductor_id: c.id }))
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
            <label>Modalidad</label>
            <select value={formData.turno || ''} onChange={e => setFormData(prev => ({ ...prev, turno: e.target.value }))} disabled={disabled}>
              <option value="">Seleccionar</option>
              <option value="Diurno">Diurno</option>
              <option value="Nocturno">Nocturno</option>
            </select>
          </div>
        </div>
        <div className="form-row three-cols">
          <div className="form-group">
            <label>Tipo</label>
            <select value={formData.tipo_penalidad_id || ''} onChange={e => setFormData(prev => ({ ...prev, tipo_penalidad_id: e.target.value || undefined }))} disabled={disabled}>
              <option value="">Seleccionar</option>
              {tiposPenalidad.length > 0 ? (
                tiposPenalidad.map(t => (
                  <option key={t.id} value={t.id}>{t.nombre}</option>
                ))
              ) : (
                tiposCobrosDescuentos.map(tipo => (
                  <option key={tipo} value={tipo}>{tipo}</option>
                ))
              )}
            </select>
          </div>
          <div className="form-group">
            <label>Acción a realizar</label>
            <select value={formData.detalle || ''} onChange={e => setFormData(prev => ({ ...prev, detalle: e.target.value }))} disabled={disabled}>
              <option value="">Seleccionar</option>
              <option value="Descuento">Descuento</option>
              <option value="Cobro">Cobro</option>
              <option value="A favor">A favor</option>
            </select>
          </div>
          <div className="form-group">
            <label>Monto (ARS)</label>
            <input
              type="number"
              value={formData.monto || ''}
              onChange={e => setFormData(prev => ({ ...prev, monto: Number(e.target.value) || undefined }))}
              placeholder="0"
              disabled={disabled}
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Área Responsable</label>
            <select value={formData.area_responsable || ''} onChange={e => setFormData(prev => ({ ...prev, area_responsable: e.target.value }))} disabled={disabled}>
              <option value="">Seleccionar</option>
              <option value="LOGISTICA">Logística</option>
              <option value="DATA ENTRY">Data Entry</option>
              <option value="ADMINISTRACION">Administración</option>
            </select>
          </div>
          <div className="form-group">
            <label>Patente</label>
            <input
              type="text"
              value={selectedVehiculo ? selectedVehiculo.patente : (formData.vehiculo_patente || '-')}
              readOnly
              className="form-input-readonly"
            />
          </div>
        </div>
      </div>

      <div className="form-section">
        <div className="form-section-title">Observaciones</div>
        <div className="form-row">
          <div className="form-group full-width">
            <textarea
              value={formData.observaciones || ''}
              onChange={e => setFormData(prev => ({ ...prev, observaciones: e.target.value }))}
              placeholder="Notas adicionales..."
              disabled={disabled}
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <div className="checkbox-group">
              <input
                type="checkbox"
                id="aplicado"
                checked={formData.aplicado}
                onChange={e => setFormData(prev => ({ ...prev, aplicado: e.target.checked }))}
                disabled={disabled}
              />
              <span>Marcar como aplicado</span>
            </div>
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
  onEdit: () => void
}

function PenalidadDetailView({ penalidad, onEdit }: PenalidadDetailViewProps) {
  function formatDate(dateStr: string | undefined | null) {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('es-AR')
  }

  function formatMoney(value: number | undefined | null) {
    if (!value) return '-'
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value)
  }

  return (
    <div className="incidencia-detail">
      <div className="detail-header">
        <div>
          <p className="detail-id">ID: {penalidad.id.slice(0, 8)}...</p>
          <h3 className="detail-title">{penalidad.conductor_display || 'Sin conductor'}</h3>
          <span className={`aplicado-badge ${penalidad.aplicado ? 'aplicado-si' : 'aplicado-no'}`}>
            {penalidad.aplicado ? 'Aplicado' : 'Pendiente'}
          </span>
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
            <span className="detail-item-label">Tipo</span>
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
    </div>
  )
}
