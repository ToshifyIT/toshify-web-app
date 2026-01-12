// src/modules/siniestros/SiniestrosModule.tsx
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { usePermissions } from '../../contexts/PermissionsContext'
import { TimeInput24h } from '../../components/ui/TimeInput24h'
import { ExcelColumnFilter, useExcelFilters } from '../../components/ui/DataTable/ExcelColumnFilter'
import Swal from 'sweetalert2'
import {
  Plus,
  Eye,
  Edit2,
  AlertTriangle,
  Car,
  Users,
  DollarSign,
  FileText,
  TrendingUp,
  X,
  Shield,
  Clock,
  ExternalLink,
  FolderOpen,
  Download
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../../components/ui/DataTable'
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
import './SiniestrosModule.css'
import { SiniestroWizard } from './components/SiniestroWizard'
import { ReparacionTicket } from './components/ReparacionTicket'
import { SiniestroSeguimiento } from './components/SiniestroSeguimiento'

type TabType = 'dashboard' | 'listado' | 'por_cobrar' | 'historico'

export function SiniestrosModule() {
  const { user, profile } = useAuth()
  const { canCreateInSubmenu, canEditInSubmenu, isAdmin } = usePermissions()

  // Permisos específicos para el submenú de siniestros
  // Admin siempre tiene acceso completo
  const canCreate = isAdmin() || canCreateInSubmenu('siniestros')
  const canEdit = isAdmin() || canEditInSubmenu('siniestros')

  const [activeTab, setActiveTab] = useState<TabType>('listado')
  const [loading, setLoading] = useState(true)
  const [siniestros, setSiniestros] = useState<SiniestroCompleto[]>([])
  const [categorias, setCategorias] = useState<SiniestroCategoria[]>([])
  const [estados, setEstados] = useState<SiniestroEstado[]>([])
  const [seguros, setSeguros] = useState<Seguro[]>([])
  const [vehiculos, setVehiculos] = useState<VehiculoSimple[]>([])
  const [conductores, setConductores] = useState<ConductorSimple[]>([])
  const [stats, setStats] = useState<SiniestroStats | null>(null)

  // Filtros por columna tipo Excel con Portal
  const { openFilterId, setOpenFilterId } = useExcelFilters()
  const [patenteFilter, setPatenteFilter] = useState<string[]>([])
  const [conductorFilter, setConductorFilter] = useState<string[]>([])
  const [categoriaFilter, setCategoriaFilter] = useState<string[]>([])
  const [responsableFilter, setResponsableFilter] = useState<string[]>([])
  const [estadoFilter, setEstadoFilter] = useState<string[]>([])

  // Modal
  const [showModal, setShowModal] = useState(false)
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
  }, [])

  async function cargarDatos() {
    setLoading(true)
    try {
      // Cargar catálogos en paralelo
      // Primero obtener el ID del estado activo de conductores
      const { data: estadosCond } = await supabase
        .from('conductores_estados')
        .select('id, codigo') as { data: { id: string; codigo: string }[] | null }
      const estadoActivoId = estadosCond?.find(e => e.codigo.toLowerCase() === 'activo')?.id

      const [
        categoriasRes,
        estadosRes,
        segurosRes,
        vehiculosRes,
        conductoresRes,
        siniestrosRes
      ] = await Promise.all([
        supabase.from('siniestros_categorias' as any).select('*').eq('is_active', true).order('orden'),
        supabase.from('siniestros_estados' as any).select('*').eq('is_active', true).order('orden'),
        supabase.from('seguros' as any).select('*').eq('is_active', true).order('nombre'),
        supabase.from('vehiculos').select('id, patente, marca, modelo').order('patente'),
        estadoActivoId
          ? supabase.from('conductores').select('id, nombres, apellidos').eq('estado_id', estadoActivoId).order('apellidos')
          : supabase.from('conductores').select('id, nombres, apellidos').order('apellidos'),
        supabase.from('v_siniestros_completos' as any).select('*').order('fecha_siniestro', { ascending: false })
      ])

      const categoriasData = categoriasRes.data as SiniestroCategoria[] | null
      const estadosData = estadosRes.data as SiniestroEstado[] | null
      const segurosData = segurosRes.data as Seguro[] | null
      const vehiculosData = vehiculosRes.data as VehiculoSimple[] | null
      const conductoresData = conductoresRes.data as { id: string; nombres: string; apellidos: string }[] | null
      const siniestrosData = siniestrosRes.data as SiniestroCompleto[] | null

      setCategorias(categoriasData || [])
      setEstados(estadosData || [])
      setSeguros(segurosData || [])
      setVehiculos(vehiculosData || [])
      setConductores((conductoresData || []).map(c => ({
        id: c.id,
        nombres: c.nombres,
        apellidos: c.apellidos,
        nombre_completo: `${c.nombres} ${c.apellidos}`
      })))
      setSiniestros(siniestrosData || [])

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
    } catch (error) {
      console.error('Error cargando datos:', error)
      Swal.fire('Error', 'No se pudieron cargar los datos', 'error')
    } finally {
      setLoading(false)
    }
  }

  function calcularStats(data: SiniestroCompleto[], estadosData: SiniestroEstado[], categoriasData: SiniestroCategoria[]) {
    const porEstado = estadosData.map(e => ({
      estado: e.nombre,
      color: e.color,
      cantidad: data.filter(s => s.estado_id === e.id).length
    })).filter(e => e.cantidad > 0)

    const porCategoria = categoriasData.map(c => ({
      categoria: c.nombre,
      cantidad: data.filter(s => s.categoria_id === c.id).length
    })).filter(c => c.cantidad > 0)

    const porResponsable = [
      { responsable: 'Tercero', cantidad: data.filter(s => s.responsable === 'tercero').length },
      { responsable: 'Conductor', cantidad: data.filter(s => s.responsable === 'conductor').length },
      { responsable: 'Compartida', cantidad: data.filter(s => s.responsable === 'compartida').length }
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
        : 0
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


  // Filtrar siniestros según tab y filtros tipo Excel
  const siniestrosFiltrados = useMemo(() => {
    let filtered = [...siniestros]

    // Filtrar por tab
    if (activeTab === 'por_cobrar') {
      filtered = filtered.filter(s => {
        const estadoCobrado = estados.find(e => e.codigo === 'COBRADO')
        const estadoCerrado = estados.find(e => e.codigo === 'CERRADO')
        return s.estado_id !== estadoCobrado?.id &&
               s.estado_id !== estadoCerrado?.id &&
               (s.presupuesto_real || 0) > 0
      })
    } else if (activeTab === 'historico') {
      filtered = filtered.filter(s => {
        const estadoCerrado = estados.find(e => e.codigo === 'CERRADO')
        return s.estado_id === estadoCerrado?.id
      })
    } else if (activeTab === 'listado') {
      // Excluir cerrados del listado principal
      filtered = filtered.filter(s => {
        const estadoCerrado = estados.find(e => e.codigo === 'CERRADO')
        return s.estado_id !== estadoCerrado?.id
      })
    }

    // Aplicar filtros tipo Excel
    if (patenteFilter.length > 0) {
      filtered = filtered.filter(s => patenteFilter.includes(s.vehiculo_patente || ''))
    }
    if (conductorFilter.length > 0) {
      filtered = filtered.filter(s => conductorFilter.includes(s.conductor_display || ''))
    }
    if (categoriaFilter.length > 0) {
      filtered = filtered.filter(s => categoriaFilter.includes(s.categoria_nombre || ''))
    }
    if (responsableFilter.length > 0) {
      filtered = filtered.filter(s => responsableFilter.includes(s.responsable || ''))
    }
    if (estadoFilter.length > 0) {
      filtered = filtered.filter(s => estadoFilter.includes(s.estado_nombre || ''))
    }

    return filtered
  }, [siniestros, activeTab, patenteFilter, conductorFilter, categoriaFilter, responsableFilter, estadoFilter, estados])

  // Conductores con más siniestros (para alertas)
  const conductoresReincidentes = useMemo(() => {
    const conteo: Record<string, { nombre: string; cantidad: number }> = {}
    siniestros.forEach(s => {
      const nombre = s.conductor_display || 'Sin conductor'
      if (!conteo[nombre]) {
        conteo[nombre] = { nombre, cantidad: 0 }
      }
      conteo[nombre].cantidad++
    })
    return Object.values(conteo)
      .filter(c => c.cantidad >= 3)
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 5)
  }, [siniestros])

  // Columnas para DataTable con filtros tipo Excel
  const siniestrosColumns = useMemo<ColumnDef<SiniestroCompleto>[]>(() => [
    {
      accessorKey: 'fecha_siniestro',
      header: 'Fecha',
      cell: ({ row }) => formatDate(row.original.fecha_siniestro)
    },
    {
      accessorKey: 'vehiculo_patente',
      header: () => (
        <ExcelColumnFilter
          label="Patente"
          options={patentesUnicas}
          selectedValues={patenteFilter}
          onSelectionChange={setPatenteFilter}
          filterId="patente"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => <span className="dt-badge dt-badge-gray">{row.original.vehiculo_patente || '-'}</span>
    },
    {
      accessorKey: 'conductor_display',
      header: () => (
        <ExcelColumnFilter
          label="Conductor"
          options={conductoresUnicos}
          selectedValues={conductorFilter}
          onSelectionChange={setConductorFilter}
          filterId="conductor"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => row.original.conductor_display || '-'
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
      accessorKey: 'responsable',
      header: () => (
        <ExcelColumnFilter
          label="Responsable"
          options={['tercero', 'conductor', 'compartida', 'sin_info']}
          selectedValues={responsableFilter}
          onSelectionChange={setResponsableFilter}
          filterId="responsable"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => {
        const resp = row.original.responsable
        const color = resp === 'tercero' ? 'green' : resp === 'conductor' ? 'red' : 'gray'
        const labels: Record<string, string> = {
          tercero: 'Tercero',
          conductor: 'Conductor',
          sin_info: 'Sin Info',
          compartida: 'Compartida'
        }
        return <span className={`dt-badge dt-badge-${color}`}>{labels[resp] || resp}</span>
      }
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
      accessorKey: 'habilitado_circular',
      header: 'Hab.',
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={row.original.habilitado_circular || false}
          onChange={() => handleToggleHabilitado(row.original.id, !row.original.habilitado_circular)}
          onClick={(e) => e.stopPropagation()}
          disabled={!canEdit}
          title={!canEdit ? 'Sin permisos para modificar' : ''}
        />
      )
    },
    {
      id: 'acciones',
      header: 'Acciones',
      cell: ({ row }) => (
        <div className="dt-actions">
          <button className="dt-btn-action dt-btn-view" title="Ver" onClick={() => handleVerSiniestro(row.original)}>
            <Eye size={14} />
          </button>
          <button className="dt-btn-action dt-btn-edit" title="Editar" onClick={() => handleEditarSiniestro(row.original)}>
            <Edit2 size={14} />
          </button>
          {row.original.carpeta_drive_url && (
            <a
              href={row.original.carpeta_drive_url}
              target="_blank"
              rel="noopener noreferrer"
              className="dt-btn-action"
              title="Drive"
              onClick={(e) => e.stopPropagation()}
            >
              <FolderOpen size={14} />
            </a>
          )}
        </div>
      )
    }
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
    // Validar permisos
    if (modalMode === 'create' && !canCreate) {
      Swal.fire('Sin permisos', 'No tienes permisos para crear siniestros', 'error')
      return
    }
    if (modalMode === 'edit' && !canEdit) {
      Swal.fire('Sin permisos', 'No tienes permisos para editar siniestros', 'error')
      return
    }

    if (!formData.categoria_id || !formData.estado_id || !formData.fecha_siniestro) {
      Swal.fire('Error', 'Complete los campos requeridos', 'error')
      return
    }

    setSaving(true)
    try {
      const dataToSave = {
        ...formData,
        fecha_siniestro: new Date(formData.fecha_siniestro).toISOString(),
        created_by: user?.id
      }

      if (modalMode === 'create') {
        const { error } = await (supabase.from('siniestros' as any) as any).insert({
          ...dataToSave,
          created_by_name: profile?.full_name || 'Sistema'
        })
        if (error) throw error

        Swal.fire({
          icon: 'success',
          title: 'Siniestro registrado',
          timer: 1500,
          showConfirmButton: false
        })
      } else if (modalMode === 'edit' && selectedSiniestro) {
        const { error } = await (supabase.from('siniestros' as any) as any).update({
          ...dataToSave,
          updated_by: profile?.full_name || 'Sistema'
        }).eq('id', selectedSiniestro.id)
        if (error) throw error

        Swal.fire({
          icon: 'success',
          title: 'Siniestro actualizado',
          timer: 1500,
          showConfirmButton: false
        })
      }

      setShowModal(false)
      cargarDatos()
    } catch (error) {
      console.error('Error guardando:', error)
      Swal.fire('Error', 'No se pudo guardar el siniestro', 'error')
    } finally {
      setSaving(false)
    }
  }

  function handleVehiculoChange(vehiculoId: string) {
    setFormData(prev => ({ ...prev, vehiculo_id: vehiculoId }))

    // TODO: Auto-seleccionar conductor asignado y seguro del vehículo
  }

  async function handleToggleHabilitado(siniestroId: string, habilitado: boolean) {
    // Verificar permisos
    if (!canEdit) {
      Swal.fire('Sin permisos', 'No tienes permisos para modificar siniestros', 'error')
      return
    }

    try {
      const { error } = await (supabase.from('siniestros' as any) as any)
        .update({ habilitado_circular: habilitado })
        .eq('id', siniestroId)

      if (error) throw error

      // El trigger de BD actualiza automáticamente el estado del vehículo
      cargarDatos()

      Swal.fire({
        icon: 'success',
        title: habilitado ? 'Vehículo habilitado para circular' : 'Vehículo marcado como siniestrado',
        timer: 1500,
        showConfirmButton: false
      })
    } catch (error: any) {
      Swal.fire('Error', error?.message || 'No se pudo actualizar el estado', 'error')
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
    return new Date(dateStr).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
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

    const tabName = activeTab === 'por_cobrar' ? 'PorCobrar' : activeTab === 'historico' ? 'Historico' : 'Listado'
    const fecha = new Date().toISOString().split('T')[0]
    XLSX.writeFile(wb, `Siniestros_${tabName}_${fecha}.xlsx`)
  }

  // Contadores para tabs
  const countPorCobrar = siniestros.filter(s => {
    const estadoCobrado = estados.find(e => e.codigo === 'COBRADO')
    const estadoCerrado = estados.find(e => e.codigo === 'CERRADO')
    return s.estado_id !== estadoCobrado?.id &&
           s.estado_id !== estadoCerrado?.id &&
           (s.presupuesto_real || 0) > 0
  }).length

  const countHistorico = siniestros.filter(s => {
    const estadoCerrado = estados.find(e => e.codigo === 'CERRADO')
    return s.estado_id === estadoCerrado?.id
  }).length

  return (
    <div className="siniestros-module">
      {/* Stats rápidos - Arriba de todo */}
      <div className="siniestros-stats">
        <div className="stats-grid">
          <div className="stat-card">
            <DollarSign size={20} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{formatMoney(stats?.presupuesto_total || 0)}</span>
              <span className="stat-label">Total Presupuesto</span>
            </div>
          </div>
          <div className="stat-card">
            <TrendingUp size={20} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{formatMoney(stats?.total_recuperados || 0)}</span>
              <span className="stat-label">Total Recuperados</span>
            </div>
          </div>
          <div className="stat-card">
            <Car size={20} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{formatMoney(stats?.total_cobrado || 0)}</span>
              <span className="stat-label">Total Cobrado</span>
            </div>
          </div>
          <div className="stat-card highlight">
            <Clock size={20} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{formatMoney(stats?.procesando_pago_total || 0)}</span>
              <span className="stat-label">Procesando Pago</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs + Action Button */}
      <div className="siniestros-tabs-row">
        <div className="siniestros-tabs">
        {/* Dashboard tab oculto temporalmente */}
        <button
          className={`siniestros-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
          style={{ display: 'none' }}
        >
          <TrendingUp size={16} />
          Dashboard
        </button>
        <button
          className={`siniestros-tab ${activeTab === 'listado' ? 'active' : ''}`}
          onClick={() => setActiveTab('listado')}
        >
          <FileText size={16} />
          Listado
        </button>
        <button
          className={`siniestros-tab ${activeTab === 'por_cobrar' ? 'active' : ''}`}
          onClick={() => setActiveTab('por_cobrar')}
        >
          <DollarSign size={16} />
          Por Cobrar
          {countPorCobrar > 0 && <span className="tab-badge">{countPorCobrar}</span>}
        </button>
        <button
          className={`siniestros-tab ${activeTab === 'historico' ? 'active' : ''}`}
          onClick={() => setActiveTab('historico')}
        >
          <Clock size={16} />
          Histórico
          {countHistorico > 0 && <span className="tab-badge">{countHistorico}</span>}
        </button>
        </div>
        <div className="tabs-actions">
          <button className="btn-secondary" onClick={handleExportarExcel} title="Exportar a Excel">
            <Download size={16} />
            Exportar
          </button>
          <button
            className="btn-primary"
            onClick={handleNuevoSiniestro}
            disabled={!canCreate}
            title={!canCreate ? 'No tienes permisos para crear siniestros' : ''}
          >
            <Plus size={16} />
            Nuevo Siniestro
          </button>
        </div>
      </div>

      {/* Alertas de conductores reincidentes */}
      {conductoresReincidentes.length > 0 && activeTab !== 'dashboard' && (
        <div className="siniestros-alerts">
          <div className="alert-item">
            <AlertTriangle size={16} />
            <span>
              <strong>Atención:</strong> {conductoresReincidentes.length} conductor(es) con 3+ siniestros: {' '}
              {conductoresReincidentes.map(c => `${c.nombre} (${c.cantidad})`).join(', ')}
            </span>
          </div>
        </div>
      )}

      {/* Contenido según tab */}
      {activeTab === 'dashboard' ? (
        <DashboardContent
          stats={stats}
          conductoresReincidentes={conductoresReincidentes}
          loading={loading}
        />
      ) : (
        <DataTable
          data={siniestrosFiltrados}
          columns={siniestrosColumns}
          loading={loading}
          searchPlaceholder="Buscar por patente, conductor..."
          emptyIcon={<Shield size={40} />}
          emptyTitle="No hay siniestros para mostrar"
          emptyDescription="Los siniestros aparecerán aquí cuando se registren."
        />
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
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
    </div>
  )
}

// Componente Dashboard
interface DashboardContentProps {
  stats: SiniestroStats | null
  conductoresReincidentes: { nombre: string; cantidad: number }[]
  loading: boolean
}

function DashboardContent({ stats, conductoresReincidentes, loading }: DashboardContentProps) {
  if (loading || !stats) {
    return (
      <div className="siniestros-stats">
        <div className="stats-grid">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="stat-card skeleton">
              <div className="skeleton-content" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <>
      {/* KPIs grandes */}
      <div className="siniestros-stats">
        <div className="stats-grid">
          <div className="stat-card">
            <FileText size={24} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.total}</span>
              <span className="stat-label">Total Siniestros</span>
            </div>
          </div>
          <div className="stat-card">
            <Users size={24} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">
                {stats.por_responsable.find(r => r.responsable === 'Tercero')?.cantidad || 0}
              </span>
              <span className="stat-label">Resp. Tercero</span>
            </div>
          </div>
          <div className="stat-card">
            <DollarSign size={24} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">
                {new Intl.NumberFormat('es-AR', {
                  style: 'currency',
                  currency: 'ARS',
                  maximumFractionDigits: 0,
                  notation: 'compact'
                }).format(stats.presupuesto_total)}
              </span>
              <span className="stat-label">Presupuesto Total</span>
            </div>
          </div>
          <div className="stat-card">
            <TrendingUp size={24} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">
                {new Intl.NumberFormat('es-AR', {
                  style: 'currency',
                  currency: 'ARS',
                  maximumFractionDigits: 0,
                  notation: 'compact'
                }).format(stats.total_cobrado)}
              </span>
              <span className="stat-label">Total Cobrado</span>
            </div>
          </div>
          <div className="stat-card">
            <AlertTriangle size={24} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.con_lesionados}</span>
              <span className="stat-label">Con Lesionados</span>
            </div>
          </div>
        </div>
      </div>

      {/* Dashboard grid */}
      <div className="dashboard-grid">
        {/* Por estado */}
        <div className="dashboard-card">
          <div className="dashboard-card-title">Por Estado</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {stats.por_estado.map(e => (
              <div key={e.estado} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className={`estado-badge estado-${e.color}`}>{e.estado}</span>
                <span style={{ fontWeight: 600 }}>{e.cantidad}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Por categoría */}
        <div className="dashboard-card">
          <div className="dashboard-card-title">Por Categoría</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {stats.por_categoria.slice(0, 6).map(c => (
              <div key={c.categoria} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{c.categoria}</span>
                <span style={{ fontWeight: 600 }}>{c.cantidad}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Conductores reincidentes */}
        <div className="dashboard-card full-width">
          <div className="dashboard-card-title">Conductores con más siniestros</div>
          {conductoresReincidentes.length === 0 ? (
            <p style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>
              No hay conductores con 3 o más siniestros
            </p>
          ) : (
            <table className="top-conductores-table">
              <thead>
                <tr>
                  <th>Conductor</th>
                  <th style={{ textAlign: 'right' }}>Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {conductoresReincidentes.map((c, i) => (
                  <tr key={i}>
                    <td>{c.nombre}</td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="conductor-alert">
                        <AlertTriangle size={14} />
                        {c.cantidad}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
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
  isEditMode = false
}: SiniestroFormProps) {
  // En modo edición solo se puede modificar estado_id y responsable
  const isFieldDisabled = (fieldName: string) => {
    if (disabled) return true
    if (!isEditMode) return false
    // En modo edición, solo estado_id y responsable son editables
    return !['estado_id', 'responsable'].includes(fieldName)
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
            <div style={{ display: 'flex', gap: '16px' }}>
              <label className="checkbox-option">
                <input
                  type="checkbox"
                  checked={formData.enviado_abogada}
                  onChange={(e) => setFormData(prev => ({ ...prev, enviado_abogada: e.target.checked }))}
                  disabled={isFieldDisabled('other')}
                />
                <span>Enviado a abogada</span>
              </label>
              <label className="checkbox-option">
                <input
                  type="checkbox"
                  checked={formData.enviado_alliance}
                  onChange={(e) => setFormData(prev => ({ ...prev, enviado_alliance: e.target.checked }))}
                  disabled={isFieldDisabled('other')}
                />
                <span>Enviado a Rentadora</span>
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
              type="number"
              value={formData.presupuesto_real || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, presupuesto_real: Number(e.target.value) || undefined }))}
              placeholder="0"
              disabled={isFieldDisabled('other')}
            />
          </div>
          <div className="form-group">
            <label>Presupuesto Enviado al Seguro</label>
            <input
              type="number"
              value={formData.presupuesto_enviado_seguro || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, presupuesto_enviado_seguro: Number(e.target.value) || undefined }))}
              placeholder="0"
              disabled={isFieldDisabled('other')}
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Presupuesto Aprobado</label>
            <input
              type="number"
              value={formData.presupuesto_aprobado_seguro || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, presupuesto_aprobado_seguro: Number(e.target.value) || undefined }))}
              placeholder="0"
              disabled={isFieldDisabled('other')}
            />
          </div>
          <div className="form-group">
            <label>Total Pagado</label>
            <input
              type="number"
              value={formData.total_pagado || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, total_pagado: Number(e.target.value) || undefined }))}
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
              type="number"
              step="0.01"
              value={formData.porcentaje_abogada || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, porcentaje_abogada: Number(e.target.value) || undefined }))}
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
  const [showSeguimiento, setShowSeguimiento] = useState(false)

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

  return (
    <div className="siniestro-detail">
      <div className="detail-header" style={{ flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
          <div>
            <p className="detail-id">ID: {siniestro.id.slice(0, 8)}...</p>
            <h3 className="detail-title">
              {siniestro.vehiculo_patente || 'Sin patente'} - {siniestro.categoria_nombre}
            </h3>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
              <span className={`estado-badge estado-${siniestro.estado_color}`}>
                {siniestro.estado_nombre}
              </span>
              {siniestro.dias_siniestrado !== undefined && (
                <span className="dias-badge">
                  <Clock size={12} /> {siniestro.dias_siniestrado} dias
                </span>
              )}
              {(siniestro as any).habilitado_circular === false && (
                <span className="no-circular-badge">No habilitado</span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="btn-primary"
              onClick={() => setShowSeguimiento(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Clock size={14} />
              Seguimiento
            </button>
            {siniestro.carpeta_drive_url && (
              <a
                href={siniestro.carpeta_drive_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary btn-drive"
                style={{ textDecoration: 'none' }}
              >
                <FolderOpen size={14} />
                Carpeta
              </a>
            )}
            <button className="btn-secondary" onClick={onEdit}>
              <Edit2 size={14} />
              Editar
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="detail-tabs">
        <button
          className={`detail-tab ${activeTab === 'info' ? 'active' : ''}`}
          onClick={() => setActiveTab('info')}
        >
          Informacion General
        </button>
        <button
          className={`detail-tab ${activeTab === 'reparacion' ? 'active' : ''}`}
          onClick={() => setActiveTab('reparacion')}
        >
          Ticket de Reparacion
          {siniestro.reparacion_id && <span className="tab-dot" />}
        </button>
      </div>

      {activeTab === 'info' ? (
      <div className="detail-cards">
        <div className="detail-card">
          <div className="detail-card-title">Información General</div>
          <div className="detail-item">
            <span className="detail-item-label">Fecha</span>
            <span className="detail-item-value">{formatDate(siniestro.fecha_siniestro)}</span>
          </div>
          <div className="detail-item">
            <span className="detail-item-label">Hora</span>
            <span className="detail-item-value">{siniestro.hora_siniestro || '-'}</span>
          </div>
          <div className="detail-item">
            <span className="detail-item-label">Ubicación</span>
            <span className="detail-item-value">{siniestro.ubicacion || '-'}</span>
          </div>
          <div className="detail-item">
            <span className="detail-item-label">Responsable</span>
            <span className="detail-item-value" style={{ textTransform: 'capitalize' }}>
              {siniestro.responsable}
            </span>
          </div>
          <div className="detail-item">
            <span className="detail-item-label">Lesionados</span>
            <span className="detail-item-value">{siniestro.hay_lesionados ? 'Sí' : 'No'}</span>
          </div>
        </div>

        <div className="detail-card">
          <div className="detail-card-title">Vehículo y Conductor</div>
          <div className="detail-item">
            <span className="detail-item-label">Patente</span>
            <span className="detail-item-value">{siniestro.vehiculo_patente || '-'}</span>
          </div>
          <div className="detail-item">
            <span className="detail-item-label">Vehículo</span>
            <span className="detail-item-value">
              {siniestro.vehiculo_marca} {siniestro.vehiculo_modelo}
            </span>
          </div>
          <div className="detail-item">
            <span className="detail-item-label">Conductor</span>
            <span className="detail-item-value">{siniestro.conductor_display || '-'}</span>
          </div>
          <div className="detail-item">
            <span className="detail-item-label">Seguro</span>
            <span className="detail-item-value">{siniestro.seguro_nombre || '-'}</span>
          </div>
          <div className="detail-item">
            <span className="detail-item-label">Nro. Siniestro</span>
            <span className="detail-item-value">{siniestro.nro_siniestro_seguro || '-'}</span>
          </div>
        </div>

        <div className="detail-card">
          <div className="detail-card-title">Gestión</div>
          <div className="detail-item">
            <span className="detail-item-label">Enviado a Abogada</span>
            <span className="detail-item-value">{siniestro.enviado_abogada ? 'Sí' : 'No'}</span>
          </div>
          <div className="detail-item">
            <span className="detail-item-label">Enviado a Rentadora</span>
            <span className="detail-item-value">{siniestro.enviado_alliance ? 'Sí' : 'No'}</span>
          </div>
          {siniestro.carpeta_drive_url && (
            <div className="detail-item">
              <span className="detail-item-label">Carpeta Drive</span>
              <a
                href={siniestro.carpeta_drive_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#DC2626', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                Abrir <ExternalLink size={12} />
              </a>
            </div>
          )}
        </div>

        <div className="detail-card">
          <div className="detail-card-title">Montos</div>
          <div className="detail-item">
            <span className="detail-item-label">Presupuesto Real</span>
            <span className="detail-item-value monto">{formatMoney(siniestro.presupuesto_real)}</span>
          </div>
          <div className="detail-item">
            <span className="detail-item-label">Enviado al Seguro</span>
            <span className="detail-item-value monto">{formatMoney(siniestro.presupuesto_enviado_seguro)}</span>
          </div>
          <div className="detail-item">
            <span className="detail-item-label">Aprobado</span>
            <span className="detail-item-value monto">{formatMoney(siniestro.presupuesto_aprobado_seguro)}</span>
          </div>
          <div className="detail-item">
            <span className="detail-item-label">Total Pagado</span>
            <span className="detail-item-value monto monto-positivo">{formatMoney(siniestro.total_pagado)}</span>
          </div>
        </div>

        {/* Descripción y Relato */}
        {(siniestro.descripcion_danos || siniestro.relato) && (
          <div className="detail-card" style={{ gridColumn: '1 / -1' }}>
            <div className="detail-card-title">Descripcion</div>
            {siniestro.descripcion_danos && (
              <div style={{ marginBottom: '12px' }}>
                <strong style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Danos:</strong>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px' }}>{siniestro.descripcion_danos}</p>
              </div>
            )}
            {siniestro.relato && (
              <div>
                <strong style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Relato:</strong>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px' }}>{siniestro.relato}</p>
              </div>
            )}
          </div>
        )}

        {/* Observaciones */}
        {siniestro.observaciones && (
          <div className="detail-card" style={{ gridColumn: '1 / -1' }}>
            <div className="detail-card-title">Observaciones</div>
            <p style={{ margin: 0, fontSize: '13px' }}>{siniestro.observaciones}</p>
          </div>
        )}
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

      {/* Modal Seguimiento */}
      {showSeguimiento && (
        <div className="modal-overlay" onClick={() => setShowSeguimiento(false)}>
          <div
            className="modal-content"
            style={{ maxWidth: '700px', maxHeight: '90vh', overflow: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>Seguimiento del Siniestro</h2>
              <button className="modal-close" onClick={() => setShowSeguimiento(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <SiniestroSeguimiento
                siniestro={siniestro}
                onReload={() => {
                  onReload()
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
