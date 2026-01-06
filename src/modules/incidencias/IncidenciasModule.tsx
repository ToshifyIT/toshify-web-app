// src/modules/incidencias/IncidenciasModule.tsx
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Swal from 'sweetalert2'
import {
  Plus,
  Search,
  Eye,
  Edit2,
  FileText,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
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

export function IncidenciasModule() {
  const { user, profile } = useAuth()
  const [activeTab, setActiveTab] = useState<TabType>('incidencias')
  const [loading, setLoading] = useState(true)

  // Data
  const [incidencias, setIncidencias] = useState<IncidenciaCompleta[]>([])
  const [penalidades, setPenalidades] = useState<PenalidadCompleta[]>([])
  const [estados, setEstados] = useState<IncidenciaEstado[]>([])
  const [tiposPenalidad, setTiposPenalidad] = useState<TipoPenalidad[]>([])
  const [vehiculos, setVehiculos] = useState<VehiculoSimple[]>([])
  const [conductores, setConductores] = useState<ConductorSimple[]>([])

  // Filtros incidencias
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroArea, setFiltroArea] = useState('')
  const [filtroTurno, setFiltroTurno] = useState('')
  const [busqueda, setBusqueda] = useState('')

  // Filtros penalidades
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroAplicado, setFiltroAplicado] = useState('')

  // Paginación
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  // Ordenamiento
  type SortColumn = 'fecha' | 'patente_display' | 'conductor_display' | 'estado_nombre' | 'area' | 'monto'
  const [sortColumn, setSortColumn] = useState<SortColumn>('fecha')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

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

  // Filtrar incidencias
  const incidenciasFiltradas = useMemo(() => {
    let filtered = [...incidencias]

    if (filtroEstado) {
      filtered = filtered.filter(i => i.estado_id === filtroEstado)
    }
    if (filtroArea) {
      filtered = filtered.filter(i => i.area === filtroArea)
    }
    if (filtroTurno) {
      filtered = filtered.filter(i => i.turno === filtroTurno)
    }
    if (busqueda.trim()) {
      const term = busqueda.toLowerCase()
      filtered = filtered.filter(i =>
        i.patente_display?.toLowerCase().includes(term) ||
        i.conductor_display?.toLowerCase().includes(term) ||
        i.descripcion?.toLowerCase().includes(term)
      )
    }

    // Ordenar
    filtered.sort((a, b) => {
      let aVal: any = sortColumn === 'fecha' ? a.fecha : a[sortColumn as keyof IncidenciaCompleta]
      let bVal: any = sortColumn === 'fecha' ? b.fecha : b[sortColumn as keyof IncidenciaCompleta]

      if (aVal === null || aVal === undefined) aVal = ''
      if (bVal === null || bVal === undefined) bVal = ''

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        aVal = aVal.toLowerCase()
        bVal = bVal.toLowerCase()
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })

    return filtered
  }, [incidencias, filtroEstado, filtroArea, filtroTurno, busqueda, sortColumn, sortDirection])

  // Filtrar penalidades
  const penalidadesFiltradas = useMemo(() => {
    let filtered = [...penalidades]

    if (activeTab === 'por_aplicar') {
      filtered = filtered.filter(p => !p.aplicado)
    }

    if (filtroTipo) {
      filtered = filtered.filter(p => p.tipo_penalidad_id === filtroTipo)
    }
    if (filtroAplicado !== '') {
      filtered = filtered.filter(p => p.aplicado === (filtroAplicado === 'true'))
    }
    if (busqueda.trim()) {
      const term = busqueda.toLowerCase()
      filtered = filtered.filter(p =>
        p.patente_display?.toLowerCase().includes(term) ||
        p.conductor_display?.toLowerCase().includes(term) ||
        p.observaciones?.toLowerCase().includes(term)
      )
    }

    return filtered.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
  }, [penalidades, activeTab, filtroTipo, filtroAplicado, busqueda])

  // Paginación
  const currentData = activeTab === 'incidencias' ? incidenciasFiltradas : penalidadesFiltradas
  const totalPages = Math.ceil(currentData.length / pageSize)
  const paginatedData = currentData.slice((page - 1) * pageSize, page * pageSize)

  // Handlers
  function handleSort(column: SortColumn) {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
    setPage(1)
  }

  function handleNuevaIncidencia() {
    const estadoPendiente = estados.find(e => e.codigo === 'PENDIENTE')
    setIncidenciaForm({
      estado_id: estadoPendiente?.id || '',
      fecha: getLocalDateString(),
      registrado_por: profile?.full_name || ''
    })
    setSelectedIncidencia(null)
    setModalMode('create')
    setModalType('incidencia')
    setShowModal(true)
  }

  function handleNuevaPenalidad() {
    setPenalidadForm({
      fecha: getLocalDateString(),
      aplicado: false
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

  // Areas únicas para filtro
  const areasUnicas = [...new Set(incidencias.map(i => i.area).filter(Boolean))]

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
            onClick={() => { setActiveTab('incidencias'); setPage(1) }}
          >
            <FileText size={16} />
            Listado
            <span className="tab-badge">{incidencias.length}</span>
          </button>
          <button
            className={`incidencias-tab ${activeTab === 'penalidades' ? 'active' : ''}`}
            onClick={() => { setActiveTab('penalidades'); setPage(1) }}
          >
            <DollarSign size={16} />
            Cobros&Descuentos
          </button>
          <button
            className={`incidencias-tab ${activeTab === 'por_aplicar' ? 'active' : ''}`}
            onClick={() => { setActiveTab('por_aplicar'); setPage(1) }}
          >
            <Clock size={16} />
            Por Aplicar
            {countPorAplicar > 0 && <span className="tab-badge">{countPorAplicar}</span>}
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
          <button className="btn-primary" onClick={activeTab === 'penalidades' || activeTab === 'por_aplicar' ? handleNuevaPenalidad : handleNuevaIncidencia}>
            <Plus size={16} />
            {activeTab === 'penalidades' || activeTab === 'por_aplicar' ? 'Nueva Penalidad' : 'Nueva Incidencia'}
          </button>
        </div>
      </div>

      {/* Incidencias Tab */}
      {activeTab === 'incidencias' && (
        <>
          {/* Filtros */}
          <div className="incidencias-filters">
            <div className="filter-group">
              <span className="filter-label">Estado:</span>
              <select className="filter-select" value={filtroEstado} onChange={e => { setFiltroEstado(e.target.value); setPage(1) }}>
                <option value="">Todos</option>
                {estados.map(e => (
                  <option key={e.id} value={e.id}>{e.nombre}</option>
                ))}
              </select>
            </div>
            <div className="filter-group">
              <span className="filter-label">Área:</span>
              <select className="filter-select" value={filtroArea} onChange={e => { setFiltroArea(e.target.value); setPage(1) }}>
                <option value="">Todas</option>
                {areasUnicas.map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
            <div className="filter-group">
              <span className="filter-label">Tipo:</span>
              <select className="filter-select" value={filtroTurno} onChange={e => { setFiltroTurno(e.target.value); setPage(1) }}>
                <option value="">Todos</option>
                <option value="Diurno">Diurno</option>
                <option value="Nocturno">Nocturno</option>
                <option value="A cargo">A cargo</option>
              </select>
            </div>
            <div className="search-wrapper">
              <Search size={16} />
              <input
                type="text"
                placeholder="Buscar por patente, conductor..."
                value={busqueda}
                onChange={e => { setBusqueda(e.target.value); setPage(1) }}
              />
            </div>
          </div>

          {/* Tabla */}
          <div className="incidencias-table-container">
            <div className="table-toolbar">
              <span className="record-count">
                Mostrando {paginatedData.length} de {incidenciasFiltradas.length} registros
              </span>
            </div>
            <div className="table-wrapper">
              <table className="incidencias-table">
                <thead>
                  <tr>
                    <th className="sortable" onClick={() => handleSort('fecha')}>
                      Fecha
                      {sortColumn === 'fecha' && (sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                    </th>
                    <th>Sem</th>
                    <th className="sortable" onClick={() => handleSort('patente_display')}>
                      Patente
                      {sortColumn === 'patente_display' && (sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                    </th>
                    <th className="sortable" onClick={() => handleSort('conductor_display')}>
                      Conductor
                      {sortColumn === 'conductor_display' && (sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                    </th>
                    <th>Tipo</th>
                    <th className="sortable" onClick={() => handleSort('area')}>
                      Área
                      {sortColumn === 'area' && (sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                    </th>
                    <th className="sortable" onClick={() => handleSort('estado_nombre')}>
                      Estado
                      {sortColumn === 'estado_nombre' && (sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                    </th>
                    <th>Responsable</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    [...Array(5)].map((_, i) => (
                      <tr key={i} className="loading-row">
                        {[...Array(9)].map((_, j) => (
                          <td key={j}><div className="skeleton" style={{ width: `${60 + Math.random() * 40}%` }} /></td>
                        ))}
                      </tr>
                    ))
                  ) : paginatedData.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="empty-state">
                        <Shield size={40} />
                        <p>No hay incidencias para mostrar</p>
                      </td>
                    </tr>
                  ) : (
                    (paginatedData as IncidenciaCompleta[]).map(i => (
                      <tr key={i.id} onClick={() => handleVerIncidencia(i)}>
                        <td>{formatDate(i.fecha)}</td>
                        <td className="text-center">{i.semana || '-'}</td>
                        <td><span className="patente">{i.patente_display || '-'}</span></td>
                        <td className="text-truncate">{i.conductor_display || '-'}</td>
                        <td>
                          {i.turno && (
                            <span className={`turno-badge turno-${i.turno.toLowerCase()}`}>{i.turno}</span>
                          )}
                        </td>
                        <td><span className="area-badge">{i.area || '-'}</span></td>
                        <td>
                          <span className={`estado-badge estado-${i.estado_color}`}>{i.estado_nombre}</span>
                        </td>
                        <td className="text-truncate">{i.registrado_por || '-'}</td>
                        <td onClick={e => e.stopPropagation()}>
                          <div className="table-actions">
                            <button className="btn-icon" title="Ver" onClick={() => handleVerIncidencia(i)}>
                              <Eye size={14} />
                            </button>
                            <button className="btn-icon" title="Editar" onClick={() => handleEditarIncidencia(i)}>
                              <Edit2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Paginación */}
            {incidenciasFiltradas.length > 0 && (
              <div className="table-footer">
                <span className="pagination-info">
                  Mostrando {((page - 1) * pageSize) + 1} a {Math.min(page * pageSize, incidenciasFiltradas.length)} de {incidenciasFiltradas.length} registros
                </span>
                <div className="pagination">
                  <button className="pagination-btn" disabled={page <= 1} onClick={() => setPage(1)}>«</button>
                  <button className="pagination-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                    <ChevronLeft size={14} />
                  </button>
                  <span className="page-info">Pagina {page} de {totalPages}</span>
                  <button className="pagination-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                    <ChevronRight size={14} />
                  </button>
                  <button className="pagination-btn" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>»</button>
                  <div className="page-size">
                    <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}>
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                    </select>
                    <span>por pagina</span>
                  </div>
                </div>
              </div>
            )}
          </div>
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
                  <div className="stat-card">
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

          {/* Filtros */}
          {activeTab === 'penalidades' && (
            <div className="incidencias-filters">
              <div className="filter-group">
                <span className="filter-label">Tipo:</span>
                <select className="filter-select" value={filtroTipo} onChange={e => { setFiltroTipo(e.target.value); setPage(1) }}>
                  <option value="">Todos</option>
                  {tiposPenalidad.map(t => (
                    <option key={t.id} value={t.id}>{t.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="filter-group">
                <span className="filter-label">Estado:</span>
                <select className="filter-select" value={filtroAplicado} onChange={e => { setFiltroAplicado(e.target.value); setPage(1) }}>
                  <option value="">Todos</option>
                  <option value="true">Aplicadas</option>
                  <option value="false">Pendientes</option>
                </select>
              </div>
              <div className="search-wrapper">
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Buscar por patente, conductor..."
                  value={busqueda}
                  onChange={e => { setBusqueda(e.target.value); setPage(1) }}
                />
              </div>
            </div>
          )}

          {/* Tabla Penalidades */}
          <div className="incidencias-table-container">
            <div className="table-toolbar">
              <span className="record-count">
                Mostrando {Math.min(pageSize, penalidadesFiltradas.length)} de {penalidadesFiltradas.length} registros
              </span>
            </div>
            <div className="table-wrapper">
              <table className="incidencias-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Sem</th>
                    <th>Patente</th>
                    <th>Conductor</th>
                    <th>Tipo</th>
                    <th>Monto</th>
                    <th>Aplicado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    [...Array(5)].map((_, i) => (
                      <tr key={i} className="loading-row">
                        {[...Array(8)].map((_, j) => (
                          <td key={j}><div className="skeleton" style={{ width: `${60 + Math.random() * 40}%` }} /></td>
                        ))}
                      </tr>
                    ))
                  ) : penalidadesFiltradas.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="empty-state">
                        <Shield size={40} />
                        <p>No hay penalidades para mostrar</p>
                      </td>
                    </tr>
                  ) : (
                    penalidadesFiltradas.slice((page - 1) * pageSize, page * pageSize).map(p => (
                      <tr key={p.id} onClick={() => handleVerPenalidad(p)}>
                        <td>{formatDate(p.fecha)}</td>
                        <td className="text-center">{p.semana || '-'}</td>
                        <td><span className="patente">{p.patente_display || '-'}</span></td>
                        <td className="text-truncate">{p.conductor_display || '-'}</td>
                        <td>{p.tipo_nombre || '-'}</td>
                        <td className="monto">{formatMoney(p.monto)}</td>
                        <td>
                          <span className={`aplicado-badge ${p.aplicado ? 'aplicado-si' : 'aplicado-no'}`}>
                            {p.aplicado ? <><CheckCircle size={12} /> Sí</> : <><XCircle size={12} /> No</>}
                          </span>
                        </td>
                        <td onClick={e => e.stopPropagation()}>
                          <div className="table-actions">
                            {!p.aplicado && (
                              <button className="btn-icon" title="Marcar como aplicado" onClick={() => handleMarcarAplicado(p)}>
                                <CheckCircle size={14} />
                              </button>
                            )}
                            <button className="btn-icon" title="Ver" onClick={() => handleVerPenalidad(p)}>
                              <Eye size={14} />
                            </button>
                            <button className="btn-icon" title="Editar" onClick={() => handleEditarPenalidad(p)}>
                              <Edit2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Paginación */}
            {penalidadesFiltradas.length > 0 && (
              <div className="table-footer">
                <span className="pagination-info">
                  Mostrando {((page - 1) * pageSize) + 1} a {Math.min(page * pageSize, penalidadesFiltradas.length)} de {penalidadesFiltradas.length} registros
                </span>
                <div className="pagination">
                  <button className="pagination-btn" disabled={page <= 1} onClick={() => setPage(1)}>«</button>
                  <button className="pagination-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                    <ChevronLeft size={14} />
                  </button>
                  <span className="page-info">Pagina {page} de {Math.ceil(penalidadesFiltradas.length / pageSize)}</span>
                  <button className="pagination-btn" disabled={page >= Math.ceil(penalidadesFiltradas.length / pageSize)} onClick={() => setPage(p => p + 1)}>
                    <ChevronRight size={14} />
                  </button>
                  <button className="pagination-btn" disabled={page >= Math.ceil(penalidadesFiltradas.length / pageSize)} onClick={() => setPage(Math.ceil(penalidadesFiltradas.length / pageSize))}>»</button>
                  <div className="page-size">
                    <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}>
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                    </select>
                    <span>por pagina</span>
                  </div>
                </div>
              </div>
            )}
          </div>
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
  horario: string
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
      const { data, error } = await supabase
        .from('asignaciones')
        .select(`
          id,
          horario,
          conductores (
            id,
            nombres,
            apellidos
          )
        `)
        .eq('vehiculo_id', vehiculoId)
        .eq('activo', true)

      if (error) throw error

      const conductoresData: ConductorAsignado[] = (data || [])
        .filter((a: any) => a.conductores)
        .map((a: any) => ({
          id: a.conductores.id,
          nombre_completo: `${a.conductores.nombres} ${a.conductores.apellidos}`,
          horario: a.horario === 'TURNO' ? 'Turno' : 'A Cargo'
        }))

      if (conductoresData.length === 1) {
        // Solo un conductor, auto-seleccionar
        setFormData(prev => ({ ...prev, conductor_id: conductoresData[0].id }))
        setConductorSearch('')
      } else if (conductoresData.length > 1) {
        // Múltiples conductores, mostrar modal
        setConductoresAsignados(conductoresData)
        setShowConductorSelectModal(true)
      }
      // Si no hay conductores asignados, no hacer nada
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
                  <span className="conductor-select-horario">{c.horario}</span>
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
      const { data, error } = await supabase
        .from('asignaciones')
        .select(`
          id,
          horario,
          conductores (
            id,
            nombres,
            apellidos
          )
        `)
        .eq('vehiculo_id', vehiculoId)
        .eq('activo', true)

      if (error) throw error

      const conductoresData: ConductorAsignado[] = (data || [])
        .filter((a: any) => a.conductores)
        .map((a: any) => ({
          id: a.conductores.id,
          nombre_completo: `${a.conductores.nombres} ${a.conductores.apellidos}`,
          horario: a.horario === 'TURNO' ? 'Turno' : 'A Cargo'
        }))

      if (conductoresData.length === 1) {
        // Solo un conductor, auto-seleccionar
        setFormData(prev => ({ ...prev, conductor_id: conductoresData[0].id }))
        setConductorSearch('')
      } else if (conductoresData.length > 1) {
        // Múltiples conductores, mostrar modal
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
                  <span className="conductor-select-horario">{c.horario}</span>
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
