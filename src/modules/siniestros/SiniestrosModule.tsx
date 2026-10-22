// src/modules/siniestros/SiniestrosModule.tsx
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { usePermissions } from '../../contexts/PermissionsContext'
import { useSede } from '../../contexts/SedeContext'
import { TimeInput24h } from '../../components/ui/TimeInput24h'
import { ExcelColumnFilter, useExcelFilters } from '../../components/ui/DataTable/ExcelColumnFilter'
import Swal from 'sweetalert2'
import { showSuccess } from '../../utils/toast'
import {
  Plus,
  Eye,
  Edit2,
  AlertTriangle,
  Car,
  DollarSign,
  FileText,
  TrendingUp,
  X,
  Shield,
  Clock,
  FolderOpen,
  Download,
  CheckCircle,
  History
} from 'lucide-react'
import { DateRangeSelector } from '../../components/ui/DateRangeSelector'
import * as XLSX from 'xlsx'
import { type ColumnDef, type FilterFn } from '@tanstack/react-table'
import { DataTable } from '../../components/ui/DataTable'
import { VerLogsButton } from '../../components/ui/VerLogsButton'
import { LoadingOverlay } from '../../components/ui/LoadingOverlay'
import { ActionsMenu } from '../../components/ui/ActionsMenu'
import { registrarHistorialVehiculo, registrarHistorialConductor } from '../../services/historialService'
import type {
  SiniestroCompleto,
  SiniestroCategoria,
  SiniestroEstado,
  Seguro,
  SiniestroFormData,
  VehiculoSimple,
  ConductorSimple,
  SiniestroStats
} from '../../types/siniestros.types'
import type { DateRange } from '../../components/ui/DateRangeSelector'
import type { VehiculoEstado } from '../../types/database.types'
import './SiniestrosModule.css'
import { SiniestroWizard } from './components/SiniestroWizard'
import { ReparacionTicket } from './components/ReparacionTicket'
import { SiniestroSeguimiento } from './components/SiniestroSeguimiento'

function toISODateLocal(date: Date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseFechaSiniestro(fechaStr: string | undefined | null) {
  if (!fechaStr) return null
  const raw = fechaStr.split('T')[0]
  if (raw.includes('-')) {
    const parts = raw.split('-')
    if (parts.length !== 3) return null
    const [yearStr, monthStr, dayStr] = parts
    const year = Number(yearStr)
    const month = Number(monthStr)
    const day = Number(dayStr)
    if (!year || !month || !day) return null
    return new Date(year, month - 1, day)
  }
  if (raw.includes('/')) {
    const parts = raw.split('/')
    if (parts.length !== 3) return null
    const [dayStr, monthStr, yearStr] = parts
    const year = Number(yearStr)
    const month = Number(monthStr)
    const day = Number(dayStr)
    if (!year || !month || !day) return null
    return new Date(year, month - 1, day)
  }
  return null
}

export function SiniestrosModule() {
  const { user, profile } = useAuth()
  const { canEditInSubmenu, isAdmin } = usePermissions()
  const { sedeActualId, aplicarFiltroSede, sedeUsuario } = useSede()

  // Permisos específicos para el submenú de siniestros
  // Admin siempre tiene acceso completo
  const canEdit = isAdmin() || canEditInSubmenu('siniestros')

  const [loading, setLoading] = useState(true)
  const [siniestros, setSiniestros] = useState<SiniestroCompleto[]>([])
  const [categorias, setCategorias] = useState<SiniestroCategoria[]>([])
  const [estados, setEstados] = useState<SiniestroEstado[]>([])
  const [seguros, setSeguros] = useState<Seguro[]>([])
  const [vehiculos, setVehiculos] = useState<VehiculoSimple[]>([])
  const [conductores, setConductores] = useState<ConductorSimple[]>([])
  const [vehiculosEstados, setVehiculosEstados] = useState<VehiculoEstado[]>([])
  const [stats, setStats] = useState<SiniestroStats | null>(null)
  const [dateRangeSemana, setDateRangeSemana] = useState<DateRange | null>({
    startDate: '',
    endDate: '',
    label: 'Todo el historial',
    type: 'all'
  })

  // Filtros por columna tipo Excel con Portal
  const { openFilterId, setOpenFilterId } = useExcelFilters()
  const [patenteFilter, setPatenteFilter] = useState<string[]>([])
  const [conductorFilter, setConductorFilter] = useState<string[]>([])
  const [categoriaFilter, setCategoriaFilter] = useState<string[]>([])
  const [responsableFilter, setResponsableFilter] = useState<string[]>([])
  const [estadoFilter, setEstadoFilter] = useState<string[]>([])

  // Modal
  const [showModal, setShowModal] = useState(false)
  const [seguimientoSiniestro, setSeguimientoSiniestro] = useState<SiniestroCompleto | null>(null)
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'view'>('create')
  const [selectedSiniestro, setSelectedSiniestro] = useState<SiniestroCompleto | null>(null)
  const [formData, setFormData] = useState<SiniestroFormData>({
    categoria_id: '',
    estado_id: '',
    fecha_siniestro: new Date().toISOString().split('T')[0],
    responsable: 'sin_info',
    hay_lesionados: false,
    enviado_abogada: false,
    enviado_alliance: false
  })
  const [saving, setSaving] = useState(false)

  // Cargar datos iniciales
  useEffect(() => {
    cargarDatos()
  }, [sedeActualId])

  async function cargarDatos() {
    setLoading(true)
    try {
      // Cargar catálogos en paralelo (incluyendo estados de conductores)
      const [
        categoriasRes,
        estadosRes,
        segurosRes,
        vehiculosRes,
        estadosCondRes,
        siniestrosRes,
        vehiculosEstadosRes
      ] = await Promise.all([
        supabase.from('siniestros_categorias' as any).select('id, codigo, nombre, descripcion, es_robo, orden').eq('is_active', true).order('orden'),
        supabase.from('siniestros_estados' as any).select('id, codigo, nombre, color, orden').eq('is_active', true).order('orden'),
        supabase.from('seguros' as any).select('id, nombre').eq('is_active', true).order('nombre'),
        aplicarFiltroSede(supabase.from('vehiculos').select('id, patente, marca, modelo')).order('patente'),
        supabase.from('conductores_estados').select('id, codigo') as unknown as Promise<{ data: { id: string; codigo: string }[] | null; error: any }>,
        aplicarFiltroSede(supabase.from('v_siniestros_completos' as any).select('*')).order('fecha_siniestro', { ascending: false }).limit(2000),
        supabase.from('vehiculos_estados').select('id, codigo, descripcion').eq('activo', true).order('descripcion')
      ])

      // Traer TODOS los conductores (activos y de baja) con su estado — siniestros/cobros
      // son hechos históricos y pueden requerir referenciar a un conductor ya dado de baja
      const estadosMap = new Map<string, string>()
      for (const e of (estadosCondRes.data || [])) estadosMap.set(e.id, e.codigo)
      const conductoresRes = await aplicarFiltroSede(supabase.from('conductores').select('id, nombres, apellidos, estado_id')).order('apellidos')

      const categoriasData = categoriasRes.data as SiniestroCategoria[] | null
      const estadosData = estadosRes.data as SiniestroEstado[] | null
      const segurosData = segurosRes.data as Seguro[] | null
      const vehiculosData = vehiculosRes.data as VehiculoSimple[] | null
      const conductoresData = conductoresRes.data as { id: string; nombres: string; apellidos: string; estado_id: string | null }[] | null
      const siniestrosData = siniestrosRes.data as SiniestroCompleto[] | null
      const vehiculosEstadosData = vehiculosEstadosRes.data as VehiculoEstado[] | null

      setCategorias(categoriasData || [])
      setEstados(estadosData || [])
      setSeguros(segurosData || [])
      setVehiculos(vehiculosData || [])
      setConductores((conductoresData || []).map(c => {
        const estadoCodigo = c.estado_id ? estadosMap.get(c.estado_id) : undefined
        const isBaja = estadoCodigo?.toUpperCase() === 'BAJA'
        return {
          id: c.id,
          nombres: c.nombres,
          apellidos: c.apellidos,
          nombre_completo: isBaja
            ? `${c.nombres} ${c.apellidos} [BAJA]`
            : `${c.nombres} ${c.apellidos}`,
          estado_codigo: estadoCodigo,
        }
      }))
      setSiniestros(siniestrosData || [])
      setVehiculosEstados(vehiculosEstadosData || [])

      // Calcular estadísticas
      if (siniestrosData) {
        calcularStats(siniestrosData, estadosData || [], categoriasData || [])
      }

      // Set estado inicial si hay estados
      if (estadosData && estadosData.length > 0 && !formData.estado_id) {
        const estadoRegistrado = estadosData.find(e => e.codigo === 'REGISTRADO')
        if (estadoRegistrado) {
          setFormData(prev => ({ ...prev, estado_id: estadoRegistrado.id }))
        }
      }
    } catch {
      Swal.fire('Error', 'No se pudieron cargar los datos', 'error')
    } finally {
      setLoading(false)
    }
  }

  function calcularStats(data: SiniestroCompleto[], estadosData: SiniestroEstado[], categoriasData: SiniestroCategoria[]) {
    const esCategoriaRobo = (nombre: string | undefined | null) => {
      if (!nombre) return false
      const normalized = nombre.toLowerCase().trim()
      return normalized === 'robo' || normalized === 'robo parcial'
    }

    const diffDias = (from: Date, to: Date) => {
      const fromDate = new Date(from.getFullYear(), from.getMonth(), from.getDate())
      const toDate = new Date(to.getFullYear(), to.getMonth(), to.getDate())
      const diffMs = fromDate.getTime() - toDate.getTime()
      const dias = Math.floor(diffMs / (1000 * 60 * 60 * 24))
      return dias < 0 ? 0 : dias
    }

    const robos = data.filter(s => esCategoriaRobo(s.categoria_nombre))

    const siniestrosSinRobo = data.filter(s => !esCategoriaRobo(s.categoria_nombre))

    const today = new Date()

    const fechasRobos = robos
      .map(s => parseFechaSiniestro(s.fecha_siniestro))
      .filter((d): d is Date => d !== null)
      .sort((a, b) => b.getTime() - a.getTime())

    const fechasSiniestros = siniestrosSinRobo
      .map(s => parseFechaSiniestro(s.fecha_siniestro))
      .filter((d): d is Date => d !== null)
      .sort((a, b) => b.getTime() - a.getTime())

    const diasDesdeUltimoRobo = fechasRobos.length >= 1 ? diffDias(today, fechasRobos[0]) : null
    const diasEntreUltimosRobos = fechasRobos.length >= 2 ? diffDias(fechasRobos[0], fechasRobos[1]) : null

    const diasDesdeUltimoSiniestro = fechasSiniestros.length >= 1 ? diffDias(today, fechasSiniestros[0]) : null
    const diasEntreUltimosSiniestros = fechasSiniestros.length >= 2 ? diffDias(fechasSiniestros[0], fechasSiniestros[1]) : null

    // Conteo en una sola pasada O(n) en vez de O(n*k) con múltiples .filter()
    const conteoEstado = new Map<string, number>()
    const conteoCategoria = new Map<string, number>()
    const conteoResponsable = new Map<string, number>()
    for (const s of data) {
      conteoEstado.set(s.estado_id, (conteoEstado.get(s.estado_id) || 0) + 1)
      conteoCategoria.set(s.categoria_id, (conteoCategoria.get(s.categoria_id) || 0) + 1)
      if (s.responsable) conteoResponsable.set(s.responsable, (conteoResponsable.get(s.responsable) || 0) + 1)
    }
    const porEstado = estadosData.map(e => ({
      estado: e.nombre,
      color: e.color,
      cantidad: conteoEstado.get(e.id) || 0
    })).filter(e => e.cantidad > 0)

    const porCategoria = categoriasData.map(c => ({
      categoria: c.nombre,
      cantidad: conteoCategoria.get(c.id) || 0
    })).filter(c => c.cantidad > 0)

    const porResponsable = [
      { responsable: 'Tercero', cantidad: conteoResponsable.get('tercero') || 0 },
      { responsable: 'Conductor', cantidad: conteoResponsable.get('conductor') || 0 },
      { responsable: 'Compartida', cantidad: conteoResponsable.get('compartida') || 0 }
    ].filter(r => r.cantidad > 0)

    // Buscar estado PROCESANDO_COBRO para métricas
    const estadoProcesando = estadosData.find(e => e.codigo === 'PROCESANDO_COBRO')

    setStats({
      total: data.length,
      por_estado: porEstado,
      por_categoria: porCategoria,
      por_responsable: porResponsable,
      presupuesto_total: data.reduce((sum, s) => sum + (s.presupuesto_real || 0), 0),
      total_cobrado: data.reduce((sum, s) => sum + (s.total_pagado || 0), 0),
      con_lesionados: data.filter(s => s.hay_lesionados).length,
      total_recuperados: data.reduce((sum, s) => sum + (s.presupuesto_aprobado_seguro || 0), 0),
      procesando_pago_total: estadoProcesando
        ? data.filter(s => s.estado_id === estadoProcesando.id).reduce((sum, s) => sum + (s.presupuesto_real || 0), 0)
        : 0,
      dias_desde_ultimo_robo: diasDesdeUltimoRobo,
      dias_entre_ultimos_robos: diasEntreUltimosRobos,
      dias_desde_ultimo_siniestro: diasDesdeUltimoSiniestro,
      dias_entre_ultimos_siniestros: diasEntreUltimosSiniestros
    })
  }


  // Listas de valores únicos para filtros
  const patentesUnicas = useMemo(() =>
    [...new Set(siniestros.map(s => s.vehiculo_patente).filter(Boolean))].sort() as string[]
  , [siniestros])

  const conductoresUnicos = useMemo(() =>
    [...new Set(siniestros.map(s => s.conductor_display).filter(Boolean))].sort() as string[]
  , [siniestros])

  const categoriasUnicas = useMemo(() =>
    [...new Set(siniestros.map(s => s.categoria_nombre).filter(Boolean))].sort() as string[]
  , [siniestros])

  const estadosUnicos = useMemo(() =>
    [...new Set(siniestros.map(s => s.estado_nombre).filter(Boolean))].sort() as string[]
  , [siniestros])


  const customGlobalFilter = useMemo<FilterFn<SiniestroCompleto>>(() => {
    return (row, _columnId, filterValue) => {
      if (!filterValue || typeof filterValue !== 'string') return true
      
      const searchLower = filterValue.toLowerCase().trim()
      const data = row.original

      // Construir un string con todos los datos relevantes para la búsqueda
      // Incluimos campos clave donde el usuario podría buscar "robo", "choque", etc.
      const searchableText = [
        data.categoria_nombre,
        data.estado_nombre,
        data.vehiculo_patente,
        data.conductor_display,
        data.responsable,
        data.descripcion_danos,
        data.relato,
        data.ubicacion,
        data.tercero_nombre,
        data.tercero_vehiculo,
        data.tercero_seguro,
        data.nro_siniestro_seguro
      ].filter(Boolean).join(' ').toLowerCase()

      // Buscar término completo
      if (searchableText.includes(searchLower)) return true
      
      // Buscar por palabras individuales
      const words = searchLower.split(/\s+/).filter(w => w.length > 0)
      if (words.length > 1) {
        return words.every(word => searchableText.includes(word))
      }
      
      return false
    }
  }, [])


  const siniestrosSemana = useMemo(() => {
    if (!dateRangeSemana || dateRangeSemana.type === 'all') {
      return [...siniestros]
    }
    return siniestros.filter(s => {
      const fecha = parseFechaSiniestro(s.fecha_siniestro)
      if (!fecha) return false
      const iso = toISODateLocal(fecha)
      if (dateRangeSemana.startDate && iso < dateRangeSemana.startDate) return false
      if (dateRangeSemana.endDate && iso > dateRangeSemana.endDate) return false
      return true
    })
  }, [siniestros, dateRangeSemana])

  const siniestrosFiltrados = useMemo(() => {
    let filtered = [...siniestrosSemana]

    // Sets para lookup O(1) en vez de Array.includes() O(m) en cada fila.
    const patenteSet = new Set(patenteFilter)
    const conductorSet = new Set(conductorFilter)
    const categoriaSet = new Set(categoriaFilter)
    const responsableSet = new Set(responsableFilter)
    const estadoSet = new Set(estadoFilter)

    if (patenteSet.size > 0) {
      filtered = filtered.filter(s => patenteSet.has(s.vehiculo_patente || ''))
    }
    if (conductorSet.size > 0) {
      filtered = filtered.filter(s => conductorSet.has(s.conductor_display || ''))
    }
    if (categoriaSet.size > 0) {
      filtered = filtered.filter(s => categoriaSet.has(s.categoria_nombre || ''))
    }
    if (responsableSet.size > 0) {
      filtered = filtered.filter(s => responsableSet.has(s.responsable || ''))
    }
    if (estadoSet.size > 0) {
      filtered = filtered.filter(s => estadoSet.has(s.estado_nombre || ''))
    }

    return filtered
  }, [siniestrosSemana, patenteFilter, conductorFilter, categoriaFilter, responsableFilter, estadoFilter])

  // Filtros externos para mostrar en la barra de filtros del DataTable
  const externalFilters = useMemo(() => {
    const filters: Array<{ id: string; label: string; onClear: () => void }> = []
    if (patenteFilter.length > 0) {
      filters.push({
        id: 'patente',
        label: `Patente: ${patenteFilter.length === 1 ? patenteFilter[0] : `${patenteFilter.length} seleccionados`}`,
        onClear: () => setPatenteFilter([])
      })
    }
    if (conductorFilter.length > 0) {
      filters.push({
        id: 'conductor',
        label: `Conductor: ${conductorFilter.length === 1 ? conductorFilter[0] : `${conductorFilter.length} seleccionados`}`,
        onClear: () => setConductorFilter([])
      })
    }
    if (categoriaFilter.length > 0) {
      filters.push({
        id: 'categoria',
        label: `Categoría: ${categoriaFilter.length === 1 ? categoriaFilter[0] : `${categoriaFilter.length} seleccionados`}`,
        onClear: () => setCategoriaFilter([])
      })
    }
    if (responsableFilter.length > 0) {
      filters.push({
        id: 'responsable',
        label: `Responsable: ${responsableFilter.length === 1 ? responsableFilter[0] : `${responsableFilter.length} seleccionados`}`,
        onClear: () => setResponsableFilter([])
      })
    }
    if (estadoFilter.length > 0) {
      filters.push({
        id: 'estado',
        label: `Estado: ${estadoFilter.length === 1 ? estadoFilter[0] : `${estadoFilter.length} seleccionados`}`,
        onClear: () => setEstadoFilter([])
      })
    }
    return filters
  }, [patenteFilter, conductorFilter, categoriaFilter, responsableFilter, estadoFilter])

  const handleClearAllFilters = () => {
    setPatenteFilter([])
    setConductorFilter([])
    setCategoriaFilter([])
    setResponsableFilter([])
    setEstadoFilter([])
  }

  // Columnas para DataTable con filtros tipo Excel
  const siniestrosColumns = useMemo<ColumnDef<SiniestroCompleto>[]>(() => [
    {
      accessorKey: 'fecha_siniestro',
      header: 'Fecha',
      cell: ({ row }) => {
        const hora = (row.original.hora_siniestro || '').slice(0, 5)
        return (
          <div style={{ lineHeight: 1.2, whiteSpace: 'nowrap' }}>
            <div>{formatDate(row.original.fecha_siniestro)}</div>
            {hora && <div style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>{hora}</div>}
          </div>
        )
      }
    },
    {
      id: 'patente_conductor',
      accessorKey: 'conductor_display',
      header: () => (
        <ExcelColumnFilter
          label="Patente / Conductor"
          options={conductoresUnicos}
          selectedValues={conductorFilter}
          onSelectionChange={setConductorFilter}
          filterId="conductor"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => {
        const resp = row.original.responsable
        const color = resp === 'tercero' ? 'green' : resp === 'conductor' ? 'red' : resp === 'compartida' ? 'yellow' : 'gray'
        const labels: Record<string, string> = { tercero: 'Tercero', conductor: 'Conductor', sin_info: 'Sin Info', compartida: 'Compartida' }
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {row.original.conductor_display || '-'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-tertiary)' }}>
              <span className="dt-badge dt-badge-gray" style={{ fontSize: '10px', padding: '1px 6px' }}>
                {row.original.vehiculo_patente || 'Sin patente'}
              </span>
              {resp && (
                <span className={`dt-badge dt-badge-${color}`} style={{ fontSize: '9px', padding: '1px 6px' }}>
                  {labels[resp] || resp}
                </span>
              )}
            </div>
          </div>
        )
      }
    },
    {
      accessorKey: 'categoria_nombre',
      header: () => (
        <ExcelColumnFilter
          label="Categoria"
          options={categoriasUnicas}
          selectedValues={categoriaFilter}
          onSelectionChange={setCategoriaFilter}
          filterId="categoria"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => row.original.categoria_nombre || '-'
    },
    {
      accessorKey: 'estado_nombre',
      header: () => (
        <ExcelColumnFilter
          label="Estado"
          options={estadosUnicos}
          selectedValues={estadoFilter}
          onSelectionChange={setEstadoFilter}
          filterId="estado"
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
      accessorKey: 'presupuesto_real',
      header: 'Presupuesto',
      cell: ({ row }) => {
        const val = row.original.presupuesto_real
        return val ? <span style={{ fontWeight: 600, color: '#059669' }}>{formatMoney(val)}</span> : '-'
      }
    },
    {
      id: 'acciones',
      size: 110,
      header: 'Acciones',
      cell: ({ row }) => {
        const isHabilitado = row.original.habilitado_circular
        const hasVehiculo = !!row.original.vehiculo_id
        const hasDrive = !!row.original.carpeta_drive_url
        const habilitarDisabled = isHabilitado || !hasVehiculo

        return (
          <ActionsMenu
            maxVisible={2}
            actions={[
              { icon: <Eye size={15} />, label: 'Ver detalle', onClick: () => handleVerSiniestro(row.original) },
              { icon: <Edit2 size={15} />, label: 'Editar', onClick: () => handleEditarSiniestro(row.original), variant: 'info' },
              { icon: <History size={15} />, label: 'Seguimiento', onClick: () => setSeguimientoSiniestro(row.original) },
              {
                icon: <FolderOpen size={15} />,
                label: hasDrive ? 'Carpeta de Drive' : 'Sin carpeta de Drive',
                onClick: () => { if (hasDrive) window.open(row.original.carpeta_drive_url!, '_blank') },
                disabled: !hasDrive,
                variant: hasDrive ? 'success' : undefined,
              },
              {
                icon: <CheckCircle size={15} />,
                label: !hasVehiculo ? 'Habilitar (sin vehículo)' : isHabilitado ? 'Vehículo ya habilitado' : 'Habilitar vehículo',
                onClick: () => handleHabilitarVehiculo(row.original),
                disabled: habilitarDisabled,
                variant: habilitarDisabled ? undefined : 'warning',
              },
            ]}
          />
        )
      }
    },
  ], [patentesUnicas, patenteFilter, conductoresUnicos, conductorFilter, categoriasUnicas, categoriaFilter, responsableFilter, estadosUnicos, estadoFilter, openFilterId, canEdit])

  function handleNuevoSiniestro() {
    const estadoRegistrado = estados.find(e => e.codigo === 'REGISTRADO')
    setFormData({
      categoria_id: '',
      estado_id: estadoRegistrado?.id || '',
      fecha_siniestro: new Date().toISOString().split('T')[0],
      responsable: 'sin_info',
      hay_lesionados: false,
      enviado_abogada: false,
      enviado_alliance: false,
      habilitado_circular: true // Por defecto habilitado
    })
    setSelectedSiniestro(null)
    setModalMode('create')
    setShowModal(true)
  }

  function handleVerSiniestro(siniestro: SiniestroCompleto) {
    setSelectedSiniestro(siniestro)
    setModalMode('view')
    setShowModal(true)
  }

  function handleEditarSiniestro(siniestro: SiniestroCompleto) {
    setSelectedSiniestro(siniestro)
    setFormData({
      vehiculo_id: siniestro.vehiculo_id || undefined,
      conductor_id: siniestro.conductor_id || undefined,
      categoria_id: siniestro.categoria_id,
      estado_id: siniestro.estado_id,
      seguro_id: siniestro.seguro_id || undefined,
      fecha_siniestro: siniestro.fecha_siniestro.split('T')[0],
      hora_siniestro: siniestro.hora_siniestro || undefined,
      ubicacion: siniestro.ubicacion || undefined,
      responsable: siniestro.responsable,
      hay_lesionados: siniestro.hay_lesionados,
      descripcion_danos: siniestro.descripcion_danos || undefined,
      relato: siniestro.relato || undefined,
      tercero_nombre: siniestro.tercero_nombre || undefined,
      tercero_dni: siniestro.tercero_dni || undefined,
      tercero_telefono: siniestro.tercero_telefono || undefined,
      tercero_vehiculo: siniestro.tercero_vehiculo || undefined,
      tercero_seguro: siniestro.tercero_seguro || undefined,
      tercero_poliza: siniestro.tercero_poliza || undefined,
      carpeta_drive_url: siniestro.carpeta_drive_url || undefined,
      enviado_abogada: siniestro.enviado_abogada,
      enviado_alliance: siniestro.enviado_alliance,
      nro_siniestro_seguro: siniestro.nro_siniestro_seguro || undefined,
      presupuesto_real: siniestro.presupuesto_real || undefined,
      presupuesto_enviado_seguro: siniestro.presupuesto_enviado_seguro || undefined,
      presupuesto_aprobado_seguro: siniestro.presupuesto_aprobado_seguro || undefined,
      fecha_pago_estimada: siniestro.fecha_pago_estimada || undefined,
      total_pagado: siniestro.total_pagado || undefined,
      porcentaje_abogada: siniestro.porcentaje_abogada || undefined,
      observaciones: siniestro.observaciones || undefined,
      habilitado_circular: (siniestro as any).habilitado_circular ?? true,
      costos_reparacion: (siniestro as any).costos_reparacion || undefined,
      total_reparacion_pagada: (siniestro as any).total_reparacion_pagada || undefined,
      fecha_cierre: (siniestro as any).fecha_cierre || undefined
    })
    setModalMode('edit')
    setShowModal(true)
  }

  async function handleGuardar() {
    if (!formData.categoria_id || !formData.estado_id || !formData.fecha_siniestro) {
      Swal.fire('Error', 'Complete los campos requeridos', 'error')
      return
    }

    setSaving(true)
    try {
      // Extraer campos temporales del wizard y campos que no existen en la tabla
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { _finalizarAsignacion, _asignacionId, estado_vehiculo, habilitado_circular, ...formDataClean } = formData as any

      const dataToSave = {
        ...formDataClean,
        fecha_siniestro: new Date(formDataClean.fecha_siniestro).toISOString(),
        created_by: user?.id
      }

      if (modalMode === 'create') {
        const { error } = await (supabase.from('siniestros' as any) as any).insert({
          ...dataToSave,
          sede_id: sedeActualId || sedeUsuario?.id,
          created_by_name: profile?.full_name || 'Sistema'
        })
        if (error) throw error

        // Usar fecha + hora del siniestro (no la fecha actual) para cerrar asignaciones
        // Así facturación corta en el momento real del evento, no cuando se carga en el sistema
        const fechaSiniestroStr = formDataClean.fecha_siniestro
        const horaSiniestroStr = formDataClean.hora_siniestro || '00:00:00'
        const fechaCierre = new Date(`${fechaSiniestroStr}T${horaSiniestroStr}`).toISOString()

        // Si se seleccionó un estado para el vehículo, actualizarlo
        if (estado_vehiculo && formDataClean.vehiculo_id) {
          const estadoSeleccionado = vehiculosEstados.find(e => e.codigo === estado_vehiculo)
          if (estadoSeleccionado) {
            await (supabase as any)
              .from('vehiculos')
              .update({
                estado_id: estadoSeleccionado.id,
                updated_by: profile?.full_name || 'Sistema'
              })
              .eq('id', formDataClean.vehiculo_id)
          }

          // Historial: registrar cambio de estado del vehículo por siniestro
          registrarHistorialVehiculo({
            vehiculoId: formDataClean.vehiculo_id,
            tipoEvento: 'siniestro',
            estadoNuevo: estado_vehiculo,
            detalles: {
              accion: 'crear_siniestro',
              categoria_id: formDataClean.categoria_id,
              responsable: formDataClean.responsable,
              fecha_siniestro: formDataClean.fecha_siniestro,
            },
            modulo: 'siniestros',
            sedeId: sedeActualId || sedeUsuario?.id,
          })

          // Estados que finalizan asignaciones
          const estadosFinalizanAsignacion = [
            'SINIESTRADO',
            'TALLER_CHAPA_PINTURA',
            'TALLER_CP_PAINT_CARS',
            'TALLER_CP_ANDRADA',
            'CORPORATIVO', 
            'PKG_OFF_BASE',
            'PKG_OFF_FRANCIA',
            'DESTRUCCION_TOTAL',
            'ROBO',
            'RETENIDO_COMISARIA'
          ]

          // Si el estado requiere finalizar asignaciones, buscar y finalizar TODAS las activas del vehículo
          if (estadosFinalizanAsignacion.includes(estado_vehiculo)) {
            const { data: asignacionesActivas } = await (supabase as any)
              .from('asignaciones')
              .select('id, asignaciones_conductores(conductor_id)')
              .eq('vehiculo_id', formDataClean.vehiculo_id)
              .in('estado', ['activa', 'programado'])

            if (asignacionesActivas && asignacionesActivas.length > 0) {
              const asignacionIds = asignacionesActivas.map((a: any) => a.id)

              // Finalizar conductores (usa fecha del siniestro, no fecha actual)
              await (supabase as any)
                .from('asignaciones_conductores')
                .update({ estado: 'completado', fecha_fin: fechaCierre })
                .in('asignacion_id', asignacionIds)
                .in('estado', ['asignado', 'activo'])

              // Finalizar asignaciones (usa fecha del siniestro, no fecha actual)
              await (supabase as any)
                .from('asignaciones')
                .update({
                  estado: 'finalizada',
                  fecha_fin: fechaCierre,
                  notas: `[AUTO-CERRADA] Siniestro - Vehículo cambió a estado: ${estado_vehiculo}`,
                  updated_by: profile?.full_name || 'Sistema'
                })
                .in('id', asignacionIds)

              // Historial: registrar siniestro para cada conductor afectado
              for (const asig of asignacionesActivas as any[]) {
                const conductoresAsig = asig.asignaciones_conductores || []
                for (const ac of conductoresAsig) {
                  if (ac.conductor_id) {
                    registrarHistorialConductor({
                      conductorId: ac.conductor_id,
                      tipoEvento: 'siniestro',
                      detalles: {
                        accion: 'asignacion_finalizada_por_siniestro',
                        vehiculo_id: formDataClean.vehiculo_id,
                        estado_vehiculo: estado_vehiculo,
                        asignacion_id: asig.id,
                      },
                      modulo: 'siniestros',
                      sedeId: sedeActualId || sedeUsuario?.id,
                    })
                  }
                }
              }
            }
          }
        }

        showSuccess('Siniestro registrado', estado_vehiculo ? 'El estado del vehículo y asignaciones fueron actualizados' : undefined)
      } else if (modalMode === 'edit' && selectedSiniestro) {
        const { error } = await (supabase.from('siniestros' as any) as any).update({
          ...dataToSave,
          updated_by: profile?.full_name || 'Sistema'
        }).eq('id', selectedSiniestro.id)
        if (error) throw error

        // Usar fecha + hora del siniestro (no la fecha actual) para cerrar asignaciones
        const fechaSiniestroStrEdit = formDataClean.fecha_siniestro
        const horaSiniestroStrEdit = formDataClean.hora_siniestro || '00:00:00'
        const fechaCierreEdit = new Date(`${fechaSiniestroStrEdit}T${horaSiniestroStrEdit}`).toISOString()

        // Si se seleccionó un estado para el vehículo, actualizarlo
        if (estado_vehiculo && formDataClean.vehiculo_id) {
          const estadoSeleccionado = vehiculosEstados.find(e => e.codigo === estado_vehiculo)
          if (estadoSeleccionado) {
            await (supabase as any)
              .from('vehiculos')
              .update({
                estado_id: estadoSeleccionado.id,
                updated_by: profile?.full_name || 'Sistema'
              })
              .eq('id', formDataClean.vehiculo_id)
          }

          // Historial: registrar cambio de estado del vehículo por siniestro (edición)
          registrarHistorialVehiculo({
            vehiculoId: formDataClean.vehiculo_id,
            tipoEvento: 'siniestro',
            estadoNuevo: estado_vehiculo,
            detalles: {
              accion: 'editar_siniestro',
              siniestro_id: selectedSiniestro.id,
              categoria_id: formDataClean.categoria_id,
              responsable: formDataClean.responsable,
            },
            modulo: 'siniestros',
            sedeId: sedeActualId || sedeUsuario?.id,
          })

          // Estados que finalizan asignaciones
          const estadosFinalizanAsignacion = [
            'SINIESTRADO',
            'TALLER_CHAPA_PINTURA',
            'TALLER_CP_PAINT_CARS',
            'TALLER_CP_ANDRADA',
            'CORPORATIVO',
            'PKG_OFF_BASE',
            'PKG_OFF_FRANCIA',
            'DESTRUCCION_TOTAL',
            'ROBO',
            'RETENIDO_COMISARIA'
          ]

          // Si el estado requiere finalizar asignaciones
          if (estadosFinalizanAsignacion.includes(estado_vehiculo)) {
            const { data: asignacionesActivas } = await (supabase as any)
              .from('asignaciones')
              .select('id, asignaciones_conductores(conductor_id)')
              .eq('vehiculo_id', formDataClean.vehiculo_id)
              .in('estado', ['activa', 'programado'])

            if (asignacionesActivas && asignacionesActivas.length > 0) {
              const asignacionIds = asignacionesActivas.map((a: any) => a.id)

              // Finalizar conductores (usa fecha del siniestro, no fecha actual)
              await (supabase as any)
                .from('asignaciones_conductores')
                .update({ estado: 'completado', fecha_fin: fechaCierreEdit })
                .in('asignacion_id', asignacionIds)
                .in('estado', ['asignado', 'activo'])

              // Finalizar asignaciones (usa fecha del siniestro, no fecha actual)
              await (supabase as any)
                .from('asignaciones')
                .update({
                  estado: 'finalizada',
                  fecha_fin: fechaCierreEdit,
                  notas: `[AUTO-CERRADA] Siniestro - Vehículo cambió a estado: ${estado_vehiculo}`,
                  updated_by: profile?.full_name || 'Sistema'
                })
                .in('id', asignacionIds)

              // Historial: registrar siniestro para cada conductor afectado
              for (const asig of asignacionesActivas as any[]) {
                const conductoresAsig = asig.asignaciones_conductores || []
                for (const ac of conductoresAsig) {
                  if (ac.conductor_id) {
                    registrarHistorialConductor({
                      conductorId: ac.conductor_id,
                      tipoEvento: 'siniestro',
                      detalles: {
                        accion: 'asignacion_finalizada_por_siniestro',
                        vehiculo_id: formDataClean.vehiculo_id,
                        estado_vehiculo: estado_vehiculo,
                        siniestro_id: selectedSiniestro.id,
                        asignacion_id: asig.id,
                      },
                      modulo: 'siniestros',
                      sedeId: sedeActualId || sedeUsuario?.id,
                    })
                  }
                }
              }
            }
          }
        }

        showSuccess('Siniestro actualizado', estado_vehiculo ? 'El estado del vehículo y asignaciones fueron actualizados' : undefined)
      }

      setShowModal(false)
      cargarDatos()
    } catch (error: any) {
      const errorMsg = error?.message || error?.details || error?.hint || 'Error desconocido'
      Swal.fire('Error', `No se pudo guardar: ${errorMsg}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  function handleVehiculoChange(vehiculoId: string) {
    setFormData(prev => ({ ...prev, vehiculo_id: vehiculoId }))

    // TODO: Auto-seleccionar conductor asignado y seguro del vehículo
  }

  // Habilitar vehículo: cambiar estado a PKG_ON_BASE
  async function handleHabilitarVehiculo(siniestro: SiniestroCompleto) {
    if (!siniestro.vehiculo_id) {
      Swal.fire('Error', 'Este siniestro no tiene vehículo asociado', 'error')
      return
    }

    const result = await Swal.fire({
      title: 'Habilitar Vehículo',
      text: `¿Desea habilitar el vehículo ${siniestro.vehiculo_patente} para circular?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, habilitar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#10b981'
    })

    if (!result.isConfirmed) return

    try {
      // Actualizar el estado del vehículo directamente (las columnas estado_vehiculo y habilitado_circular no existen en siniestros)
      const estadoPkgOn = vehiculosEstados.find(e => e.codigo === 'PKG_ON_BASE')
      if (estadoPkgOn) {
        const { error } = await (supabase.from('vehiculos') as any).update({
          estado_id: estadoPkgOn.id
        }).eq('id', siniestro.vehiculo_id)

        if (error) throw error

        // Historial: registrar habilitación del vehículo
        registrarHistorialVehiculo({
          vehiculoId: siniestro.vehiculo_id,
          tipoEvento: 'cambio_estado',
          estadoNuevo: 'PKG_ON_BASE',
          detalles: {
            accion: 'habilitar_vehiculo_desde_siniestro',
            patente: siniestro.vehiculo_patente,
            siniestro_id: siniestro.id,
          },
          modulo: 'siniestros',
          sedeId: sedeActualId || sedeUsuario?.id,
        })
      }

      showSuccess('Vehículo habilitado', `${siniestro.vehiculo_patente} ahora puede circular`)

      cargarDatos()
    } catch {
      Swal.fire('Error', 'No se pudo habilitar el vehículo', 'error')
    }
  }

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
    // Extraer solo la parte de fecha (YYYY-MM-DD) y usar mediodía para evitar bugs de timezone
    const datePart = dateStr.split('T')[0]
    return new Date(`${datePart}T12:00:00`).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'America/Argentina/Buenos_Aires'
    })
  }

  // Montos del período elegido en el selector (con "Todo el historial" = todos).
  // Mismas fórmulas que calcularStats, pero sobre los siniestros del período, así las
  // tarjetas responden al filtro. Los "días desde/entre" siguen siendo sobre todo el historial.
  const resumenPeriodo = useMemo(() => {
    const estadoProcesando = estados.find(e => e.codigo === 'PROCESANDO_COBRO')
    let presupuesto = 0, recuperado = 0, cobrado = 0, procesando = 0
    for (const s of siniestrosSemana) {
      presupuesto += s.presupuesto_real || 0
      recuperado += s.presupuesto_aprobado_seguro || 0
      cobrado += s.total_pagado || 0
      if (estadoProcesando && s.estado_id === estadoProcesando.id) procesando += s.presupuesto_real || 0
    }
    return { cantidad: siniestrosSemana.length, presupuesto, recuperado, cobrado, procesando }
  }, [siniestrosSemana, estados])

  /** Monto para las tarjetas: muestra "$ 0" en vez de "-". */
  function montoTarjeta(value: number) {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value || 0)
  }

  /** "34 días" / "1 día" / "Sin datos" */
  function diasTexto(value: number | null | undefined) {
    if (value === null || value === undefined) return 'Sin datos'
    return `${value} ${value === 1 ? 'día' : 'días'}`
  }

  function handleExportarExcel() {
    if (siniestrosFiltrados.length === 0) {
      Swal.fire('Sin datos', 'No hay siniestros para exportar', 'info')
      return
    }

    const dataExport = siniestrosFiltrados.map(s => ({
      'Fecha': formatDate(s.fecha_siniestro),
      'Patente': s.vehiculo_patente || '',
      'Vehículo': `${s.vehiculo_marca || ''} ${s.vehiculo_modelo || ''}`.trim(),
      'Conductor': s.conductor_display || '',
      'Categoría': s.categoria_nombre || '',
      'Estado': s.estado_nombre || '',
      'Responsable': s.responsable === 'tercero' ? 'Tercero' : s.responsable === 'conductor' ? 'Conductor' : s.responsable === 'compartida' ? 'Compartida' : '',
      'Lesionados': s.hay_lesionados ? 'Sí' : 'No',
      'Presupuesto Real': s.presupuesto_real || 0,
      'Pres. Aprobado': s.presupuesto_aprobado_seguro || 0,
      'Total Rep. Pagada': (s as any).total_reparacion_pagada || 0,
      'Total Pagado': s.total_pagado || 0,
      'Días Siniestrado': s.dias_siniestrado || 0,
      'Habilitado': (s as any).habilitado_circular !== false ? 'Sí' : 'No',
      'Seguro': s.seguro_nombre || '',
      'Nro. Siniestro': s.nro_siniestro_seguro || '',
      'Ubicación': s.ubicacion || '',
      'Descripción Daños': s.descripcion_danos || '',
      'Relato': s.relato || '',
      'Observaciones': s.observaciones || ''
    }))

    const ws = XLSX.utils.json_to_sheet(dataExport)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Siniestros')

    // Ajustar anchos de columna
    const colWidths = [
      { wch: 12 }, // Fecha
      { wch: 10 }, // Patente
      { wch: 20 }, // Vehículo
      { wch: 25 }, // Conductor
      { wch: 15 }, // Categoría
      { wch: 15 }, // Estado
      { wch: 12 }, // Responsable
      { wch: 10 }, // Lesionados
      { wch: 15 }, // Presupuesto Real
      { wch: 15 }, // Pres. Aprobado
      { wch: 15 }, // Total Rep. Pagada
      { wch: 15 }, // Total Pagado
      { wch: 12 }, // Días Siniestrado
      { wch: 10 }, // Habilitado
      { wch: 15 }, // Seguro
      { wch: 15 }, // Nro. Siniestro
      { wch: 25 }, // Ubicación
      { wch: 30 }, // Descripción Daños
      { wch: 30 }, // Relato
      { wch: 30 }  // Observaciones
    ]
    ws['!cols'] = colWidths

    const tabName = 'Listado'
    const fecha = new Date().toISOString().split('T')[0]
    XLSX.writeFile(wb, `Siniestros_${tabName}_${fecha}.xlsx`)
  }

  return (
    <div className="siniestros-module">
      {/* Loading Overlay - bloquea toda la pantalla */}
      <LoadingOverlay show={loading} message="Cargando siniestros..." size="lg" />

      {/* Indicadores: montos del período elegido + tiempos (sobre todo el historial) */}
      <div className="siniestros-stats">
        <div className="stats-grid siniestros-stats-grid">
          <div className="stat-card" title="Cantidad de siniestros del período elegido">
            <FileText size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{resumenPeriodo.cantidad}</span>
              <span className="stat-label">Siniestros</span>
            </div>
          </div>
          <div className="stat-card" title="Suma de los presupuestos reales del período">
            <DollarSign size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{montoTarjeta(resumenPeriodo.presupuesto)}</span>
              <span className="stat-label">Presupuesto</span>
            </div>
          </div>
          <div className="stat-card" title="Suma de los presupuestos aprobados por el seguro en el período">
            <TrendingUp size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{montoTarjeta(resumenPeriodo.recuperado)}</span>
              <span className="stat-label">Recuperado</span>
            </div>
          </div>
          <div className="stat-card" title="Total cobrado de los siniestros del período">
            <Car size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{montoTarjeta(resumenPeriodo.cobrado)}</span>
              <span className="stat-label">Cobrado</span>
            </div>
          </div>
          <div className={`stat-card${resumenPeriodo.procesando > 0 ? ' highlight' : ''}`} title="Presupuesto de los siniestros en estado Procesando Cobro">
            <Clock size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{montoTarjeta(resumenPeriodo.procesando)}</span>
              <span className="stat-label">Procesando pago</span>
            </div>
          </div>
          <div className="stat-card" title={`Días entre los dos últimos siniestros: ${diasTexto(stats?.dias_entre_ultimos_siniestros)}`}>
            <AlertTriangle size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{diasTexto(stats?.dias_desde_ultimo_siniestro)}</span>
              <span className="stat-label">
                desde el último siniestro
                {stats?.dias_entre_ultimos_siniestros != null && <> · {diasTexto(stats.dias_entre_ultimos_siniestros)} entre los dos últimos</>}
              </span>
            </div>
          </div>
          <div className="stat-card" title={`Días entre los dos últimos robos: ${diasTexto(stats?.dias_entre_ultimos_robos)}`}>
            <Shield size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{diasTexto(stats?.dias_desde_ultimo_robo)}</span>
              <span className="stat-label">
                desde el último robo
                {stats?.dias_entre_ultimos_robos != null && <> · {diasTexto(stats.dias_entre_ultimos_robos)} entre los dos últimos</>}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Período + acciones (sin pestañas: el módulo tiene una sola vista) */}
      <div className="siniestros-tabs-row">
        <div className="siniestros-periodo">
          <DateRangeSelector
            selectedRange={dateRangeSemana}
            onRangeChange={setDateRangeSemana}
            showAllOption
            placeholder="Semana actual"
          />
        </div>
        <div className="tabs-actions">
          <VerLogsButton tablas={['siniestros', 'siniestros_seguimientos']} label="Siniestros" />
          <button className="btn-secondary" onClick={handleExportarExcel} title="Exportar a Excel">
            <Download size={16} />
            Exportar
          </button>
          <button
            className="btn-primary"
            onClick={handleNuevoSiniestro}
          >
            <Plus size={16} />
            Nuevo Siniestro
          </button>
        </div>
      </div>

      {/* Tabla de siniestros */}
      <DataTable
        data={siniestrosFiltrados}
        columns={siniestrosColumns}
        loading={loading}
        searchPlaceholder="Buscar por patente, conductor..."
        emptyIcon={<Shield size={40}
      />}
        emptyTitle="No hay siniestros para mostrar"
        emptyDescription="Los siniestros aparecerán aquí cuando se registren."
        globalFilterFn={customGlobalFilter}
        externalFilters={externalFilters}
        onClearAllFilters={handleClearAllFilters}
      />

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className={`modal-content${modalMode === 'view' ? ' sd-modal' : ''}`} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                {modalMode === 'create' ? 'Nuevo Siniestro' :
                 modalMode === 'edit' ? 'Editar Siniestro' : 'Detalle del Siniestro'}
              </h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              {modalMode === 'view' && selectedSiniestro ? (
                <SiniestroDetailView
                  siniestro={selectedSiniestro}
                  onEdit={() => handleEditarSiniestro(selectedSiniestro)}
                  onReload={cargarDatos}
                />
              ) : modalMode === 'create' ? (
                <SiniestroWizard
                  formData={formData}
                  setFormData={setFormData}
                  categorias={categorias}
                  estados={estados}
                  vehiculos={vehiculos}
                  conductores={conductores}
                  vehiculosEstados={vehiculosEstados}
                  onVehiculoChange={handleVehiculoChange}
                  onCancel={() => setShowModal(false)}
                  onSubmit={handleGuardar}
                  saving={saving}
                />
              ) : (
                <SiniestroForm
                  formData={formData}
                  setFormData={setFormData}
                  categorias={categorias}
                  estados={estados}
                  seguros={seguros}
                  vehiculos={vehiculos}
                  conductores={conductores}
                  onVehiculoChange={handleVehiculoChange}
                  disabled={modalMode === 'view'}
                  isEditMode={modalMode === 'edit'}
                />
              )}
            </div>

            {modalMode === 'edit' && (
              <div className="modal-footer">
                <button
                  className="btn-secondary"
                  onClick={() => setShowModal(false)}
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button
                  className="btn-primary"
                  onClick={handleGuardar}
                  disabled={saving}
                >
                  {saving ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Seguimiento (desde ActionsMenu) */}
      {seguimientoSiniestro && (
        <div className="modal-overlay" onClick={() => setSeguimientoSiniestro(null)}>
          <div
            className="modal-content ss-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ss-modal-header">
              <h2>Seguimiento del siniestro</h2>
              <button className="ss-icon-btn" onClick={() => setSeguimientoSiniestro(null)} title="Cerrar">
                <X size={18} />
              </button>
            </div>
            <div className="ss-modal-body">
              <SiniestroSeguimiento
                siniestro={seguimientoSiniestro}
                onReload={cargarDatos}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Componente Form
interface SiniestroFormProps {
  formData: SiniestroFormData
  setFormData: React.Dispatch<React.SetStateAction<SiniestroFormData>>
  categorias: SiniestroCategoria[]
  estados: SiniestroEstado[]
  seguros: Seguro[]
  vehiculos: VehiculoSimple[]
  conductores: ConductorSimple[]
  onVehiculoChange: (id: string) => void
  disabled?: boolean
  isEditMode?: boolean // Solo permite editar estado y responsable
}

function SiniestroForm({
  formData,
  setFormData,
  categorias,
  estados,
  seguros,
  vehiculos,
  conductores,
  onVehiculoChange,
  disabled,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isEditMode: _isEditMode = false
}: SiniestroFormProps) {
  // Todos los campos son editables en modo edición
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const isFieldDisabled = (_fieldName: string) => {
    return disabled || false
  }
  const [vehiculoSearch, setVehiculoSearch] = useState('')
  const [conductorSearch, setConductorSearch] = useState('')
  const [showVehiculoDropdown, setShowVehiculoDropdown] = useState(false)
  const [showConductorDropdown, setShowConductorDropdown] = useState(false)

  const selectedVehiculo = vehiculos.find(v => v.id === formData.vehiculo_id)
  const selectedConductor = conductores.find(c => c.id === formData.conductor_id)

  const filteredVehiculos = vehiculos.filter(v => {
    const searchTerm = vehiculoSearch.toLowerCase()
    return v.patente.toLowerCase().includes(searchTerm) ||
           v.marca.toLowerCase().includes(searchTerm) ||
           v.modelo.toLowerCase().includes(searchTerm)
  }).slice(0, 10)

  const filteredConductores = conductores.filter(c => {
    const searchTerm = conductorSearch.toLowerCase()
    return c.nombre_completo.toLowerCase().includes(searchTerm)
  }).slice(0, 10)

  return (
    <>
      {/* Datos del evento */}
      <div className="form-section">
        <div className="form-section-title">Datos del Evento</div>
        <div className="form-row">
          <div className="form-group">
            <label>Patente <span className="required">*</span></label>
            <div className="searchable-select">
              <input
                type="text"
                value={selectedVehiculo ? `${selectedVehiculo.patente} - ${selectedVehiculo.marca} ${selectedVehiculo.modelo}` : vehiculoSearch}
                onChange={(e) => {
                  setVehiculoSearch(e.target.value)
                  setShowVehiculoDropdown(true)
                  if (formData.vehiculo_id) onVehiculoChange('')
                }}
                onFocus={() => setShowVehiculoDropdown(true)}
                onBlur={() => setTimeout(() => setShowVehiculoDropdown(false), 200)}
                placeholder="Buscar por patente..."
                disabled={isFieldDisabled('vehiculo_id')}
              />
              {showVehiculoDropdown && vehiculoSearch && filteredVehiculos.length > 0 && (
                <div className="searchable-dropdown">
                  {filteredVehiculos.map(v => (
                    <div
                      key={v.id}
                      className="searchable-option"
                      onClick={() => {
                        onVehiculoChange(v.id)
                        setVehiculoSearch('')
                        setShowVehiculoDropdown(false)
                      }}
                    >
                      <strong>{v.patente}</strong> - {v.marca} {v.modelo}
                    </div>
                  ))}
                </div>
              )}
              {selectedVehiculo && (
                <button
                  type="button"
                  className="clear-selection"
                  onClick={() => {
                    onVehiculoChange('')
                    setVehiculoSearch('')
                  }}
                >
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
                value={selectedConductor ? selectedConductor.nombre_completo : conductorSearch}
                onChange={(e) => {
                  setConductorSearch(e.target.value)
                  setShowConductorDropdown(true)
                  if (formData.conductor_id) setFormData(prev => ({ ...prev, conductor_id: undefined }))
                }}
                onFocus={() => setShowConductorDropdown(true)}
                onBlur={() => setTimeout(() => setShowConductorDropdown(false), 200)}
                placeholder="Buscar conductor..."
                disabled={isFieldDisabled('conductor_id')}
              />
              {showConductorDropdown && conductorSearch && filteredConductores.length > 0 && (
                <div className="searchable-dropdown">
                  {filteredConductores.map(c => (
                    <div
                      key={c.id}
                      className="searchable-option"
                      onClick={() => {
                        setFormData(prev => ({ ...prev, conductor_id: c.id }))
                        setConductorSearch('')
                        setShowConductorDropdown(false)
                      }}
                    >
                      {c.nombre_completo}
                    </div>
                  ))}
                </div>
              )}
              {selectedConductor && (
                <button
                  type="button"
                  className="clear-selection"
                  onClick={() => {
                    setFormData(prev => ({ ...prev, conductor_id: undefined }))
                    setConductorSearch('')
                  }}
                >
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
              value={formData.fecha_siniestro}
              onChange={(e) => setFormData(prev => ({ ...prev, fecha_siniestro: e.target.value }))}
              disabled={isFieldDisabled('fecha_siniestro')}
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Hora</label>
            <TimeInput24h
              value={formData.hora_siniestro || '09:00'}
              onChange={(value) => setFormData(prev => ({ ...prev, hora_siniestro: value }))}
              disabled={isFieldDisabled('hora_siniestro')}
            />
          </div>
          <div className="form-group">
            <label>Ubicación</label>
            <input
              type="text"
              value={formData.ubicacion || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, ubicacion: e.target.value }))}
              placeholder="Dirección o referencia"
              disabled={isFieldDisabled('ubicacion')}
            />
          </div>
        </div>
      </div>

      {/* Clasificación */}
      <div className="form-section">
        <div className="form-section-title">Clasificación</div>
        <div className="form-row">
          <div className="form-group">
            <label>Categoría <span className="required">*</span></label>
            <select
              value={formData.categoria_id}
              onChange={(e) => setFormData(prev => ({ ...prev, categoria_id: e.target.value }))}
              disabled={isFieldDisabled('categoria_id')}
            >
              <option value="">Seleccionar categoría</option>
              {categorias.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Estado <span className="required">*</span></label>
            <select
              value={formData.estado_id}
              onChange={(e) => setFormData(prev => ({ ...prev, estado_id: e.target.value }))}
              disabled={isFieldDisabled('estado_id')}
            >
              <option value="">Seleccionar estado</option>
              {estados.map(e => (
                <option key={e.id} value={e.id}>{e.nombre}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Responsable</label>
            <div className="radio-group">
              {['tercero', 'conductor', 'compartida'].map(r => (
                <label key={r} className="radio-option">
                  <input
                    type="radio"
                    name="responsable"
                    value={r}
                    checked={formData.responsable === r}
                    onChange={(e) => setFormData(prev => ({ ...prev, responsable: e.target.value as any }))}
                    disabled={isFieldDisabled('responsable')}
                  />
                  <span>{r.charAt(0).toUpperCase() + r.slice(1)}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label>&nbsp;</label>
            <label className="checkbox-option">
              <input
                type="checkbox"
                checked={formData.hay_lesionados}
                onChange={(e) => setFormData(prev => ({ ...prev, hay_lesionados: e.target.checked }))}
                disabled={isFieldDisabled('other')}
              />
              <span>Hay lesionados</span>
            </label>
          </div>
        </div>
      </div>

      {/* Descripción */}
      <div className="form-section">
        <div className="form-section-title">Descripción</div>
        <div className="form-row">
          <div className="form-group full-width">
            <label>Descripción de daños</label>
            <textarea
              value={formData.descripcion_danos || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, descripcion_danos: e.target.value }))}
              placeholder="Detalle los daños del vehículo..."
              disabled={isFieldDisabled('other')}
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group full-width">
            <label>Relato del siniestro</label>
            <textarea
              value={formData.relato || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, relato: e.target.value }))}
              placeholder="Describa cómo ocurrió el siniestro..."
              style={{ minHeight: '100px' }}
              disabled={isFieldDisabled('other')}
            />
          </div>
        </div>
      </div>

      {/* Datos del tercero */}
      <div className="form-section">
        <div className="form-section-title">Datos del Tercero (Opcional)</div>
        <div className="form-row three-cols">
          <div className="form-group">
            <label>Nombre</label>
            <input
              type="text"
              value={formData.tercero_nombre || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, tercero_nombre: e.target.value }))}
              disabled={isFieldDisabled('other')}
            />
          </div>
          <div className="form-group">
            <label>DNI</label>
            <input
              type="text"
              value={formData.tercero_dni || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, tercero_dni: e.target.value }))}
              disabled={isFieldDisabled('other')}
            />
          </div>
          <div className="form-group">
            <label>Teléfono</label>
            <input
              type="text"
              value={formData.tercero_telefono || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, tercero_telefono: e.target.value }))}
              disabled={isFieldDisabled('other')}
            />
          </div>
        </div>
        <div className="form-row three-cols">
          <div className="form-group">
            <label>Vehículo</label>
            <input
              type="text"
              value={formData.tercero_vehiculo || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, tercero_vehiculo: e.target.value }))}
              disabled={isFieldDisabled('other')}
            />
          </div>
          <div className="form-group">
            <label>Seguro</label>
            <input
              type="text"
              value={formData.tercero_seguro || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, tercero_seguro: e.target.value }))}
              disabled={isFieldDisabled('other')}
            />
          </div>
          <div className="form-group">
            <label>Póliza</label>
            <input
              type="text"
              value={formData.tercero_poliza || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, tercero_poliza: e.target.value }))}
              disabled={isFieldDisabled('other')}
            />
          </div>
        </div>
      </div>

      {/* Gestión */}
      <div className="form-section">
        <div className="form-section-title">Gestión</div>
        <div className="form-row">
          <div className="form-group">
            <label>Seguro</label>
            <select
              value={formData.seguro_id || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, seguro_id: e.target.value || undefined }))}
              disabled={isFieldDisabled('other')}
            >
              <option value="">Seleccionar seguro</option>
              {seguros.map(s => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Nro. Siniestro Seguro</label>
            <input
              type="text"
              value={formData.nro_siniestro_seguro || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, nro_siniestro_seguro: e.target.value }))}
              disabled={isFieldDisabled('other')}
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Carpeta Drive</label>
            <input
              type="url"
              value={formData.carpeta_drive_url || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, carpeta_drive_url: e.target.value }))}
              placeholder="https://drive.google.com/..."
              disabled={isFieldDisabled('other')}
            />
          </div>
          <div className="form-group">
            <label>&nbsp;</label>
            <div className="checkbox-row" style={{ height: '42px', alignItems: 'center' }}>
              <label className="checkbox-card">
                <input
                  type="checkbox"
                  checked={formData.enviado_abogada}
                  onChange={(e) => setFormData(prev => ({ ...prev, enviado_abogada: e.target.checked }))}
                  disabled={isFieldDisabled('other')}
                />
                <span className="checkbox-card-label">Enviado a abogada</span>
              </label>
              <label className="checkbox-card">
                <input
                  type="checkbox"
                  checked={formData.enviado_alliance}
                  onChange={(e) => setFormData(prev => ({ ...prev, enviado_alliance: e.target.checked }))}
                  disabled={isFieldDisabled('other')}
                />
                <span className="checkbox-card-label">Enviado a Rentadora</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Montos */}
      <div className="form-section">
        <div className="form-section-title">Montos</div>
        <div className="form-row">
          <div className="form-group">
            <label>Presupuesto Real</label>
            <input
              type="text"
              inputMode="numeric"
              value={formData.presupuesto_real ?? ''}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9]/g, '')
                setFormData(prev => ({ ...prev, presupuesto_real: val === '' ? undefined : Number(val) }))
              }}
              placeholder="0"
              disabled={isFieldDisabled('other')}
            />
          </div>
          <div className="form-group">
            <label>Presupuesto Enviado al Seguro</label>
            <input
              type="text"
              inputMode="numeric"
              value={formData.presupuesto_enviado_seguro ?? ''}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9]/g, '')
                setFormData(prev => ({ ...prev, presupuesto_enviado_seguro: val === '' ? undefined : Number(val) }))
              }}
              placeholder="0"
              disabled={isFieldDisabled('other')}
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Presupuesto Aprobado</label>
            <input
              type="text"
              inputMode="numeric"
              value={formData.presupuesto_aprobado_seguro ?? ''}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9]/g, '')
                setFormData(prev => ({ ...prev, presupuesto_aprobado_seguro: val === '' ? undefined : Number(val) }))
              }}
              placeholder="0"
              disabled={isFieldDisabled('other')}
            />
          </div>
          <div className="form-group">
            <label>Total Pagado</label>
            <input
              type="text"
              inputMode="numeric"
              value={formData.total_pagado ?? ''}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9]/g, '')
                setFormData(prev => ({ ...prev, total_pagado: val === '' ? undefined : Number(val) }))
              }}
              placeholder="0"
              disabled={isFieldDisabled('other')}
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Fecha Pago Estimada</label>
            <input
              type="date"
              value={formData.fecha_pago_estimada || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, fecha_pago_estimada: e.target.value }))}
              disabled={isFieldDisabled('other')}
            />
          </div>
          <div className="form-group">
            <label>% Abogada</label>
            <input
              type="text"
              inputMode="decimal"
              value={formData.porcentaje_abogada ?? ''}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9.]/g, '')
                const num = parseFloat(val)
                setFormData(prev => ({ ...prev, porcentaje_abogada: val === '' ? undefined : (isNaN(num) ? undefined : Math.min(100, num)) }))
              }}
              placeholder="0"
              disabled={isFieldDisabled('other')}
            />
          </div>
        </div>
      </div>

      {/* Observaciones */}
      <div className="form-section">
        <div className="form-section-title">Observaciones</div>
        <div className="form-row">
          <div className="form-group full-width">
            <textarea
              value={formData.observaciones || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, observaciones: e.target.value }))}
              placeholder="Notas adicionales..."
              disabled={isFieldDisabled('other')}
            />
          </div>
        </div>
      </div>
    </>
  )
}

// Componente Detail View
interface SiniestroDetailViewProps {
  siniestro: SiniestroCompleto
  onEdit: () => void
  onReload: () => void
}

function SiniestroDetailView({ siniestro, onEdit, onReload }: SiniestroDetailViewProps) {
  const [activeTab, setActiveTab] = useState<'info' | 'reparacion'>('info')

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
    // Extraer solo la parte de fecha (YYYY-MM-DD) y usar mediodía para evitar bugs de timezone
    const datePart = dateStr.split('T')[0]
    return new Date(`${datePart}T12:00:00`).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'America/Argentina/Buenos_Aires'
    })
  }

  const respLabels: Record<string, string> = { tercero: 'Tercero', conductor: 'Conductor', compartida: 'Compartida', sin_info: 'Sin info' }
  const vehiculoTexto = [siniestro.vehiculo_marca, siniestro.vehiculo_modelo].filter(Boolean).join(' ')
  const Dato = ({ label, children, ancho }: { label: string; children: React.ReactNode; ancho?: boolean }) => (
    <div className={`sd-dato${ancho ? ' sd-dato-ancho' : ''}`}>
      <span className="sd-label">{label}</span>
      <span className="sd-valor">{children}</span>
    </div>
  )

  return (
    <div className="siniestro-detail sd">
      {/* Encabezado */}
      <div className="sd-header">
        <div className="sd-header-main">
          <div className="sd-header-fila">
            <span className="sd-titulo">{siniestro.vehiculo_patente || 'Sin patente'} · {siniestro.categoria_nombre}</span>
            <span className={`estado-badge estado-${siniestro.estado_color}`}>{siniestro.estado_nombre}</span>
            {siniestro.dias_siniestrado !== undefined && siniestro.dias_siniestrado !== null && (
              <span className="dias-badge"><Clock size={12} /> {siniestro.dias_siniestrado} días</span>
            )}
            {(siniestro as any).habilitado_circular === false && (
              <span className="no-circular-badge">No habilitado</span>
            )}
          </div>
          <span className="sd-sub">
            {[siniestro.conductor_display, vehiculoTexto].filter(Boolean).join(' · ') || 'Sin conductor ni vehículo'}
          </span>
        </div>
        <div className="sd-header-acciones">
          {siniestro.carpeta_drive_url && (
            <a href={siniestro.carpeta_drive_url} target="_blank" rel="noopener noreferrer" className="btn-secondary sd-btn" style={{ textDecoration: 'none' }}>
              <FolderOpen size={13} />
              Carpeta
            </a>
          )}
          <button className="btn-secondary sd-btn" onClick={onEdit}>
            <Edit2 size={13} />
            Editar
          </button>
        </div>
      </div>

      {/* Pestañas */}
      <div className="sd-tabs">
        <button className={`sd-tab${activeTab === 'info' ? ' active' : ''}`} onClick={() => setActiveTab('info')}>
          Información general
        </button>
        <button className={`sd-tab${activeTab === 'reparacion' ? ' active' : ''}`} onClick={() => setActiveTab('reparacion')}>
          Ticket de reparación
          {siniestro.reparacion_id && <span className="tab-dot" />}
        </button>
      </div>

      {activeTab === 'info' ? (
      <div className="sd-body">
        {/* Montos */}
        <div className="sd-montos">
          <Dato label="Presupuesto real">{formatMoney(siniestro.presupuesto_real)}</Dato>
          <Dato label="Enviado al seguro">{formatMoney(siniestro.presupuesto_enviado_seguro)}</Dato>
          <Dato label="Aprobado">{formatMoney(siniestro.presupuesto_aprobado_seguro)}</Dato>
          <Dato label="Total pagado"><span className={siniestro.total_pagado ? 'sd-positivo' : undefined}>{formatMoney(siniestro.total_pagado)}</span></Dato>
        </div>

        <section className="sd-seccion">
          <div className="sd-seccion-titulo">Siniestro</div>
          <div className="sd-grid">
            <Dato label="Fecha">{formatDate(siniestro.fecha_siniestro)}</Dato>
            <Dato label="Hora">{siniestro.hora_siniestro ? siniestro.hora_siniestro.slice(0, 5) : '-'}</Dato>
            <Dato label="Responsable">{siniestro.responsable ? (respLabels[siniestro.responsable] || siniestro.responsable) : '-'}</Dato>
            <Dato label="Lesionados">{siniestro.hay_lesionados ? 'Sí' : 'No'}</Dato>
            <Dato label="Ubicación" ancho>{siniestro.ubicacion || '-'}</Dato>
          </div>
        </section>

        <section className="sd-seccion">
          <div className="sd-seccion-titulo">Vehículo, conductor y seguro</div>
          <div className="sd-grid">
            <Dato label="Patente">{siniestro.vehiculo_patente || '-'}</Dato>
            <Dato label="Vehículo">{vehiculoTexto || '-'}</Dato>
            <Dato label="Conductor" ancho>{siniestro.conductor_display || '-'}</Dato>
            <Dato label="Seguro">{siniestro.seguro_nombre || '-'}</Dato>
            <Dato label="Nro. siniestro">{siniestro.nro_siniestro_seguro || '-'}</Dato>
            <Dato label="Enviado a abogada">{siniestro.enviado_abogada ? 'Sí' : 'No'}</Dato>
            <Dato label="Enviado a rentadora">{siniestro.enviado_alliance ? 'Sí' : 'No'}</Dato>
          </div>
        </section>

        {(siniestro.descripcion_danos || siniestro.relato || siniestro.observaciones) && (
          <section className="sd-seccion">
            <div className="sd-seccion-titulo">Descripción</div>
            {siniestro.descripcion_danos && (
              <div className="sd-texto-bloque">
                <span className="sd-label">Daños</span>
                <p className="sd-texto">{siniestro.descripcion_danos}</p>
              </div>
            )}
            {siniestro.relato && (
              <div className="sd-texto-bloque">
                <span className="sd-label">Relato</span>
                <p className="sd-texto">{siniestro.relato}</p>
              </div>
            )}
            {siniestro.observaciones && (
              <div className="sd-texto-bloque">
                <span className="sd-label">Observaciones</span>
                <p className="sd-texto">{siniestro.observaciones}</p>
              </div>
            )}
          </section>
        )}

        {/* Historial de gestión (solo lectura) */}
        <section className="sd-seccion">
          <SiniestroSeguimiento siniestro={siniestro} onReload={onReload} readonly />
        </section>
      </div>
      ) : (
        <ReparacionTicket
          siniestroId={siniestro.id}
          reparacion={siniestro.reparacion_id ? {
            id: siniestro.reparacion_id,
            siniestro_id: siniestro.id,
            taller: siniestro.reparacion_taller,
            fecha_inicio: siniestro.reparacion_fecha_inicio,
            fecha_finalizacion: siniestro.reparacion_fecha_finalizacion,
            estado: siniestro.reparacion_estado || 'INICIADO',
            observaciones: siniestro.reparacion_observaciones
          } : null}
          onSave={onReload}
        />
      )}

    </div>
  )
}
