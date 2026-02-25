// src/modules/multas-telepase/TelepaseHistoricoModule.tsx
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { LoadingOverlay } from '../../components/ui/LoadingOverlay'
import { ExcelColumnFilter } from '../../components/ui/DataTable/ExcelColumnFilter'
import ExcelDateRangeFilter from '../../components/ui/DataTable/ExcelDateRangeFilter'
import { DataTable } from '../../components/ui/DataTable'
import { Download, FileText, AlertCircle, CheckCircle, Eye, Edit2, X, Car, Users, DollarSign } from 'lucide-react'
import Swal from 'sweetalert2'
import { showSuccess } from '../../utils/toast'
import { useSede } from '../../contexts/SedeContext'
import { type ColumnDef } from '@tanstack/react-table'
import * as XLSX from 'xlsx'
import './MultasTelepase.css'

interface TelepaseRegistro {
  id: string
  created_at: string
  semana: string
  fecha: string
  hora: string
  estacion: string
  via: string
  dispositivo: string
  patente: string
  categoria: string
  tarifa: string
  documento_legal: string
  concesionario: string
  conductor: string
  ibutton: string
  observaciones: string
}

function formatMoney(value: string | number | null | undefined): string {
  if (!value) return '$ 0'
  let num: number
  if (typeof value === 'string') {
    // Formato europeo: "3.622,54" -> convertir a número
    // Quitar puntos de miles, reemplazar coma decimal por punto
    const cleaned = value.replace(/\./g, '').replace(',', '.')
    num = parseFloat(cleaned)
  } else {
    num = value
  }
  if (isNaN(num)) return '$ 0'
  return `$ ${num.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '-'
  try {
    const date = new Date(dateStr)
    return date.toLocaleString('es-AR', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return dateStr
  }
}

function getWeekNumber(dateStr: string): number {
  const date = new Date(dateStr)
  const thursday = new Date(date)
  thursday.setDate(thursday.getDate() - ((thursday.getDay() + 6) % 7) + 3)
  const firstThursday = new Date(thursday.getFullYear(), 0, 4)
  firstThursday.setDate(firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7) + 3)
  const weekNumber = Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1
  return weekNumber
}

export default function TelepaseHistoricoModule() {
  const { aplicarFiltroSede, sedeActualId } = useSede()
  const [loading, setLoading] = useState(true)
  const [registros, setRegistros] = useState<TelepaseRegistro[]>([])
  const [selectedRegistro, setSelectedRegistro] = useState<TelepaseRegistro | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingRegistro, setEditingRegistro] = useState<TelepaseRegistro | null>(null)
  
  // Filtros
  const [openFilterId, setOpenFilterId] = useState<string | null>(null)
  const [patenteFilter, setPatenteFilter] = useState<string[]>([])
  const [concesionarioFilter, setConcesionarioFilter] = useState<string[]>([])
  const [conductorFilter, setConductorFilter] = useState<string[]>([])
  const [observacionesFilter, setObservacionesFilter] = useState<string[]>([])
  const [semanaFilter, setSemanaFilter] = useState<string[]>([])
  const [fechaDesde, setFechaDesde] = useState<string | null>(null)
  const [fechaHasta, setFechaHasta] = useState<string | null>(null)
  const [tarifaFilter, setTarifaFilter] = useState<string[]>([])
  const [ibuttonFilter, setIbuttonFilter] = useState<string[]>([])
  
  // Opciones para autocompletado y validación
  const [conductoresOptions, setConductoresOptions] = useState<string[]>([])
  const [conductoresStatus, setConductoresStatus] = useState<Record<string, string>>({})
  const [showConductorSuggestions, setShowConductorSuggestions] = useState(false)
  const [showOnlyActiveConductores, setShowOnlyActiveConductores] = useState(false)

  useEffect(() => {
    cargarDatos()
    fetchConductores()
  }, [sedeActualId])

  async function fetchConductores() {
    try {
      // Consulta de referencia: SELECT DISTINCT CONCAT(nombres, ' ', apellidos) AS conductor FROM conductores
      const { data, error } = await aplicarFiltroSede(supabase
        .from('conductores')
        .select('nombres, apellidos, estado_facturacion'))
        .order('nombres', { ascending: true })
        .limit(5000)
      
      if (error) throw error
      
      if (data) {
        // Mapa de estados para validación
        const statusMap: Record<string, string> = {}
        const options: string[] = []

        data.forEach((c: any) => {
          const nombre = c.nombres || ''
          const apellido = c.apellidos || ''
          const fullName = `${nombre} ${apellido}`.trim()
          
          if (fullName) {
            statusMap[fullName.toLowerCase()] = c.estado_facturacion
            
            // Agregar todos los conductores para permitir búsqueda
            options.push(fullName)
          }
        })

        setConductoresStatus(statusMap)
        setConductoresOptions([...new Set(options)].sort())
      }
    } catch (error) {
      console.error('Error cargando conductores:', error)
    }
  }

  async function cargarDatos() {
    setLoading(true)
    try {
      const { data, error } = await aplicarFiltroSede(supabase
        .from('telepase_historico')
        .select('*')
        .gte('fecha', '2026-01-01'))
        .order('fecha', { ascending: false })
        .order('hora', { ascending: false })

      if (error) throw error
      
      // Filtrar registros que contengan "Aproximado" en observaciones
      const filteredData = ((data || []) as TelepaseRegistro[]).filter(r => {
        const obs = r.observaciones?.toLowerCase() || ''
        return !obs.includes('aproximado')
      })
      
      setRegistros(filteredData)
    } catch (error) {
      console.error('Error cargando datos:', error)
    } finally {
      setLoading(false)
    }
  }

  // Valores únicos para filtros
  const patentesUnicas = useMemo(() => 
    [...new Set(registros.map(r => r.patente).filter(Boolean))].sort()
  , [registros])

  const concesionariosUnicos = useMemo(() => 
    [...new Set(registros.map(r => r.concesionario).filter(Boolean))].sort()
  , [registros])

  const conductoresUnicos = useMemo(() => 
    [...new Set(registros.map(r => r.conductor).filter(Boolean))].sort()
  , [registros])

  const observacionesOpciones = useMemo(() => ['Con observaciones', 'Sin observaciones'], [])

  const semanasUnicas = useMemo(() => 
    [...new Set(registros.map(r => {
      const semanaVal = parseInt(r.semana || '0', 10)
      return isNaN(semanaVal) ? '-' : (semanaVal + 1).toString()
    }).filter(s => s !== '-'))].sort((a, b) => parseInt(a) - parseInt(b))
  , [registros])

  const tarifasUnicas = useMemo(() => 
    [...new Set(registros.map(r => formatMoney(r.tarifa)).filter(t => t !== '$ 0'))].sort((a, b) => {
      const valA = parseFloat(a.replace('$ ', '').replace(/\./g, '').replace(',', '.'))
      const valB = parseFloat(b.replace('$ ', '').replace(/\./g, '').replace(',', '.'))
      return valA - valB
    })
  , [registros])
  
  const ibuttonsUnicos = useMemo(() => 
    [...new Set(registros.map(r => r.ibutton).filter(Boolean))].sort()
  , [registros])

  // Filtrar registros
  const registrosFiltrados = useMemo(() => {
    let filtered = registros

    if (patenteFilter.length > 0) {
      filtered = filtered.filter(r => patenteFilter.includes(r.patente))
    }
    if (concesionarioFilter.length > 0) {
      filtered = filtered.filter(r => concesionarioFilter.includes(r.concesionario))
    }
    if (conductorFilter.length > 0) {
      filtered = filtered.filter(r => conductorFilter.includes(r.conductor))
    }
    if (observacionesFilter.length > 0) {
      filtered = filtered.filter(r => {
        const tieneObs = r.observaciones && r.observaciones.trim() !== ''
        if (observacionesFilter.includes('Con observaciones') && tieneObs) return true
        if (observacionesFilter.includes('Sin observaciones') && !tieneObs) return true
        return false
      })
    }

    if (semanaFilter.length > 0) {
      filtered = filtered.filter(r => {
        const semanaVal = parseInt(r.semana || '0', 10)
        const displaySemana = isNaN(semanaVal) ? '-' : (semanaVal + 1).toString()
        return semanaFilter.includes(displaySemana)
      })
    }

    if (fechaDesde || fechaHasta) {
      filtered = filtered.filter(r => {
        if (!r.fecha) return false
        if (fechaDesde && r.fecha < fechaDesde) return false
        if (fechaHasta && r.fecha > fechaHasta) return false
        return true
      })
    }

    if (tarifaFilter.length > 0) {
      filtered = filtered.filter(r => tarifaFilter.includes(formatMoney(r.tarifa)))
    }
    if (ibuttonFilter.length > 0) {
      filtered = filtered.filter(r => ibuttonFilter.includes(r.ibutton))
    }

    return filtered
  }, [registros, patenteFilter, concesionarioFilter, conductorFilter, observacionesFilter, semanaFilter, fechaDesde, fechaHasta, tarifaFilter, ibuttonFilter])

  // Calcular totales
  const totalTarifa = useMemo(() => {
    return registrosFiltrados.reduce((sum, r) => {
      if (!r.tarifa) return sum
      // Formato europeo: "3.622,54" -> quitar puntos de miles, coma a punto decimal
      const cleaned = r.tarifa.replace(/\./g, '').replace(',', '.')
      const tarifa = parseFloat(cleaned)
      return sum + (isNaN(tarifa) ? 0 : tarifa)
    }, 0)
  }, [registrosFiltrados])

  // Estadísticas adicionales
  const patentesUnicasCount = useMemo(() => 
    new Set(registrosFiltrados.map(r => r.patente).filter(Boolean)).size
  , [registrosFiltrados])

  const conductoresUnicosCount = useMemo(() => 
    new Set(registrosFiltrados.map(r => r.conductor).filter(Boolean)).size
  , [registrosFiltrados])

  const conObservaciones = useMemo(() => 
    registrosFiltrados.filter(r => r.observaciones && r.observaciones.trim() !== '').length
  , [registrosFiltrados])

  // Ver detalle
  function handleVerDetalle(registro: TelepaseRegistro) {
    setSelectedRegistro(registro)
    setShowModal(true)
  }

  // Editar registro
  function handleEditar(registro: TelepaseRegistro) {
    setEditingRegistro({ ...registro })
    setShowEditModal(true)
    setShowOnlyActiveConductores(false)
  }

  async function handleGuardarEdicion() {
    if (!editingRegistro) return

    try {
      const { error } = await (supabase
        .from('telepase_historico') as any)
        .update({
          conductor: editingRegistro.conductor,
          ibutton: editingRegistro.ibutton,
          observaciones: editingRegistro.observaciones
        })
        .eq('id', editingRegistro.id)

      if (error) throw error

      showSuccess('Actualizado')

      setShowEditModal(false)
      setEditingRegistro(null)
      cargarDatos()
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Error al guardar'
      Swal.fire('Error', msg, 'error')
    }
  }

  // Filtros activos para mostrar en la tabla
  const activeFilters = useMemo(() => {
    const filters: { id: string; label: string; onClear: () => void }[] = []

    patenteFilter.forEach(val => filters.push({
      id: `patente-${val}`,
      label: `Patente: ${val}`,
      onClear: () => setPatenteFilter(prev => prev.filter(p => p !== val))
    }))

    concesionarioFilter.forEach(val => filters.push({
      id: `concesionario-${val}`,
      label: `Concesionario: ${val}`,
      onClear: () => setConcesionarioFilter(prev => prev.filter(c => c !== val))
    }))

    conductorFilter.forEach(val => filters.push({
      id: `conductor-${val}`,
      label: `Conductor: ${val}`,
      onClear: () => setConductorFilter(prev => prev.filter(c => c !== val))
    }))

    observacionesFilter.forEach(val => filters.push({
      id: `observaciones-${val}`,
      label: `Obs: ${val}`,
      onClear: () => setObservacionesFilter(prev => prev.filter(o => o !== val))
    }))

    semanaFilter.forEach(val => filters.push({
      id: `semana-${val}`,
      label: `Semana: ${val}`,
      onClear: () => setSemanaFilter(prev => prev.filter(s => s !== val))
    }))

    if (fechaDesde || fechaHasta) {
      filters.push({
        id: 'fecha-rango',
        label: `Fecha: ${fechaDesde ? fechaDesde.split('-').reverse().join('/') : 'Inicio'} - ${fechaHasta ? fechaHasta.split('-').reverse().join('/') : 'Fin'}`,
        onClear: () => { setFechaDesde(null); setFechaHasta(null) }
      })
    }

    tarifaFilter.forEach(val => filters.push({
      id: `tarifa-${val}`,
      label: `Tarifa: ${val}`,
      onClear: () => setTarifaFilter(prev => prev.filter(t => t !== val))
    }))

    ibuttonFilter.forEach(val => filters.push({
      id: `ibutton-${val}`,
      label: `iButton: ${val}`,
      onClear: () => setIbuttonFilter(prev => prev.filter(i => i !== val))
    }))

    return filters
  }, [patenteFilter, concesionarioFilter, conductorFilter, observacionesFilter, semanaFilter, fechaDesde, fechaHasta, tarifaFilter, ibuttonFilter])

  const clearAllFilters = () => {
    setPatenteFilter([])
    setConcesionarioFilter([])
    setConductorFilter([])
    setObservacionesFilter([])
    setSemanaFilter([])
    setFechaDesde(null)
    setFechaHasta(null)
    setTarifaFilter([])
    setIbuttonFilter([])
  }

  // Columnas
  const columns = useMemo<ColumnDef<TelepaseRegistro>[]>(() => [
    {
      id: 'fecha_hora',
      accessorFn: (row) => `${row.fecha || ''} ${row.hora || ''}`,
      enableSorting: true,
      header: () => (
        <ExcelDateRangeFilter
          label="FECHA CARGA"
          startDate={fechaDesde}
          endDate={fechaHasta}
          onRangeChange={(start, end) => {
            setFechaDesde(start)
            setFechaHasta(end)
          }}
          filterId="fecha"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => {
        const fecha = row.original.fecha || ''
        const hora = row.original.hora || ''
        return `${fecha} ${hora}`.trim() || '-'
      }
    },
    {
      id: 'semana_facturacion',
      accessorFn: (row) => {
        const val = parseInt(row.semana || '0', 10)
        return isNaN(val) ? 0 : val + 1
      },
      enableSorting: true,
      header: () => (
        <ExcelColumnFilter
          label="Sem."
          options={semanasUnicas}
          selectedValues={semanaFilter}
          onSelectionChange={setSemanaFilter}
          filterId="semana"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => {
        const semanaVal = parseInt(row.original.semana || '0', 10)
        return isNaN(semanaVal) ? '-' : semanaVal + 1
      }
    },
    {
      accessorKey: 'concesionario',
      header: () => (
        <ExcelColumnFilter
          label="Concesionario"
          options={concesionariosUnicos}
          selectedValues={concesionarioFilter}
          onSelectionChange={setConcesionarioFilter}
          filterId="concesionario"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => row.original.concesionario || '-'
    },
    {
      accessorKey: 'patente',
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
      cell: ({ row }) => (
        <span className="patente-badge">{row.original.patente || '-'}</span>
      )
    },
    {
      accessorKey: 'tarifa',
      header: () => (
        <ExcelColumnFilter
          label="Tarifa"
          options={tarifasUnicas}
          selectedValues={tarifaFilter}
          onSelectionChange={setTarifaFilter}
          filterId="tarifa"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => (
        <span style={{ fontWeight: 600, color: '#F59E0B' }}>
          {formatMoney(row.original.tarifa)}
        </span>
      )
    },
    {
      accessorKey: 'conductor',
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
      cell: ({ row }) => row.original.conductor || '-'
    },
    {
      accessorKey: 'ibutton',
      header: () => (
        <ExcelColumnFilter
          label="iButton"
          options={ibuttonsUnicos}
          selectedValues={ibuttonFilter}
          onSelectionChange={setIbuttonFilter}
          filterId="ibutton"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => row.original.ibutton || '-'
    },
    {
      accessorKey: 'observaciones',
      header: () => (
        <ExcelColumnFilter
          label="Obs."
          options={observacionesOpciones}
          selectedValues={observacionesFilter}
          onSelectionChange={setObservacionesFilter}
          filterId="observaciones"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => {
        const obs = row.original.observaciones
        if (!obs || obs.trim() === '') {
          return <CheckCircle size={16} style={{ color: '#10B981' }} />
        }
        return <span title={obs}><AlertCircle size={16} style={{ color: '#F59E0B' }} /></span>
      }
    },
    {
      id: 'acciones',
      header: 'Acciones',
      cell: ({ row }) => (
        <div className="dt-actions">
          <button 
            className="dt-btn-action dt-btn-edit" 
            data-tooltip="Editar"
            onClick={() => handleEditar(row.original)}
          >
            <Edit2 size={14} />
          </button>
          <button 
            className="dt-btn-action dt-btn-view" 
            data-tooltip="Ver detalle"
            onClick={() => handleVerDetalle(row.original)}
          >
            <Eye size={14} />
          </button>
        </div>
      )
    }
  ], [patentesUnicas, patenteFilter, concesionariosUnicos, concesionarioFilter, conductoresUnicos, conductorFilter, observacionesOpciones, observacionesFilter, openFilterId, semanasUnicas, semanaFilter, fechaDesde, fechaHasta, tarifasUnicas, tarifaFilter, ibuttonsUnicos, ibuttonFilter])

  // Exportar a Excel
  function handleExportar() {
    const dataExport = registrosFiltrados.map(r => ({
      'Fecha Carga': formatDateTime(r.created_at),
      'Sem. Facturación': r.created_at ? getWeekNumber(r.created_at) : '',
      'Fecha Peaje': r.fecha,
      'Hora Peaje': r.hora,
      'Concesionario': r.concesionario,
      'Patente': r.patente,
      'Categoría': r.categoria,
      'Estación': r.estacion,
      'Vía': r.via,
      'Dispositivo': r.dispositivo,
      'Tarifa': r.tarifa,
      'Conductor': r.conductor,
      'iButton': r.ibutton,
      'Observaciones': r.observaciones
    }))

    const ws = XLSX.utils.json_to_sheet(dataExport)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Telepase')
    XLSX.writeFile(wb, `telepase_historico_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  return (
    <div className="multas-module">
      <LoadingOverlay show={loading} message="Cargando datos de Telepase..." size="lg" />
      {/* Stats Cards */}
      <div className="multas-stats">
        <div className="multas-stats-grid five-cols">
          <div className="stat-card">
            <FileText size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{registrosFiltrados.length}</span>
              <span className="stat-label">Total</span>
            </div>
          </div>
          <div className="stat-card">
            <Car size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{patentesUnicasCount}</span>
              <span className="stat-label">Vehiculos</span>
            </div>
          </div>
          <div className="stat-card">
            <Users size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{conductoresUnicosCount}</span>
              <span className="stat-label">Conductores</span>
            </div>
          </div>
          <div className="stat-card">
            <DollarSign size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{formatMoney(totalTarifa)}</span>
              <span className="stat-label">Total Tarifas</span>
            </div>
          </div>
          <div className="stat-card">
            <AlertCircle size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{conObservaciones}</span>
              <span className="stat-label">Con Obs.</span>
            </div>
          </div>
        </div>
      </div>

      {/* DataTable */}
      <DataTable
        data={registrosFiltrados}
        columns={columns}
        searchPlaceholder="Buscar por patente, conductor..."
        externalFilters={activeFilters}
        onClearAllFilters={clearAllFilters}
        headerAction={
          <button className="btn-secondary" onClick={handleExportar}>
            <Download size={16} />
            Exportar
          </button>
        }
      />

      {/* Modal Detalle */}
      {showModal && selectedRegistro && (
        <div className="multas-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="multas-modal-container" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="multas-modal-header">
              <h2 className="multas-modal-title">Detalle de Peaje</h2>
              <button className="multas-modal-close" onClick={() => setShowModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="multas-modal-body">
              <table className="multas-detail-table">
                <tbody>
                  <tr>
                    <td className="multas-detail-label">Fecha de Carga</td>
                    <td className="multas-detail-value">{formatDateTime(selectedRegistro.created_at)}</td>
                  </tr>
                  <tr>
                    <td className="multas-detail-label">Semana</td>
                    <td className="multas-detail-value">{selectedRegistro.created_at ? getWeekNumber(selectedRegistro.created_at) : '-'}</td>
                  </tr>
                  <tr>
                    <td className="multas-detail-label">Fecha Peaje</td>
                    <td className="multas-detail-value">{selectedRegistro.fecha || '-'}</td>
                  </tr>
                  <tr>
                    <td className="multas-detail-label">Hora Peaje</td>
                    <td className="multas-detail-value">{selectedRegistro.hora || '-'}</td>
                  </tr>
                  <tr>
                    <td className="multas-detail-label">Concesionario</td>
                    <td className="multas-detail-value">{selectedRegistro.concesionario || '-'}</td>
                  </tr>
                  <tr>
                    <td className="multas-detail-label">Patente</td>
                    <td className="multas-detail-value">
                      <span className="patente-badge">{selectedRegistro.patente || '-'}</span>
                    </td>
                  </tr>
                  <tr>
                    <td className="multas-detail-label">Categoria</td>
                    <td className="multas-detail-value">{selectedRegistro.categoria || '-'}</td>
                  </tr>
                  <tr>
                    <td className="multas-detail-label">Estacion</td>
                    <td className="multas-detail-value">{selectedRegistro.estacion || '-'}</td>
                  </tr>
                  <tr>
                    <td className="multas-detail-label">Via</td>
                    <td className="multas-detail-value">{selectedRegistro.via || '-'}</td>
                  </tr>
                  <tr>
                    <td className="multas-detail-label">Dispositivo</td>
                    <td className="multas-detail-value">{selectedRegistro.dispositivo || '-'}</td>
                  </tr>
                  <tr>
                    <td className="multas-detail-label">Tarifa</td>
                    <td className="multas-detail-value" style={{ fontWeight: 600, color: '#F59E0B', fontSize: '18px' }}>
                      {formatMoney(selectedRegistro.tarifa)}
                    </td>
                  </tr>
                  <tr>
                    <td className="multas-detail-label">Documento Legal</td>
                    <td className="multas-detail-value">{selectedRegistro.documento_legal || '-'}</td>
                  </tr>
                  <tr>
                    <td className="multas-detail-label">Conductor</td>
                    <td className="multas-detail-value">{selectedRegistro.conductor || '-'}</td>
                  </tr>
                  <tr>
                    <td className="multas-detail-label">iButton</td>
                    <td className="multas-detail-value">{selectedRegistro.ibutton || '-'}</td>
                  </tr>
                  {selectedRegistro.observaciones && (
                    <tr>
                      <td className="multas-detail-label">Observaciones</td>
                      <td className="multas-detail-value" style={{ 
                        padding: '12px', 
                        background: 'rgba(245, 158, 11, 0.1)', 
                        borderRadius: '6px',
                        border: '1px solid rgba(245, 158, 11, 0.3)'
                      }}>
                        {selectedRegistro.observaciones}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="multas-modal-footer">
              <button className="multas-btn-secondary" onClick={() => setShowModal(false)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar */}
      {showEditModal && editingRegistro && (
        <div className="multas-modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="multas-modal-container" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="multas-modal-header">
              <h2 className="multas-modal-title">Editar Registro</h2>
              <button className="multas-modal-close" onClick={() => setShowEditModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="multas-modal-body">
              {/* Info no editable */}
              <div style={{ marginBottom: '20px', padding: '12px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-primary)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px' }}>
                  <div><strong>Patente:</strong> <span className="patente-badge" style={{ marginLeft: '4px' }}>{editingRegistro.patente}</span></div>
                  <div><strong>Fecha:</strong> {editingRegistro.fecha} {editingRegistro.hora}</div>
                  <div><strong>Tarifa:</strong> <span style={{ color: '#F59E0B', fontWeight: 600 }}>{formatMoney(editingRegistro.tarifa)}</span></div>
                  <div><strong>Concesionario:</strong> {editingRegistro.concesionario}</div>
                </div>
              </div>

              {/* Campos editables */}
              <div className="multas-modal-form">
                <div className="multas-form-group" style={{ position: 'relative' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label className="multas-form-label" style={{ marginBottom: 0 }}>Conductor</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '12px', color: '#4B5563', fontWeight: 500 }}>Solo Activos</span>
                      <label style={{
                        position: 'relative',
                        display: 'inline-block',
                        width: '36px',
                        height: '20px',
                        cursor: 'pointer'
                      }}>
                        <input 
                          type="checkbox" 
                          checked={showOnlyActiveConductores}
                          onChange={(e) => setShowOnlyActiveConductores(e.target.checked)}
                          style={{ opacity: 0, width: 0, height: 0 }}
                        />
                        <span style={{
                          position: 'absolute',
                          cursor: 'pointer',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          backgroundColor: showOnlyActiveConductores ? '#2563EB' : '#E5E7EB',
                          transition: '.4s',
                          borderRadius: '34px'
                        }}></span>
                        <span style={{
                          position: 'absolute',
                          content: '""',
                          height: '16px',
                          width: '16px',
                          left: '2px',
                          bottom: '2px',
                          backgroundColor: 'white',
                          transition: '.4s',
                          borderRadius: '50%',
                          transform: showOnlyActiveConductores ? 'translateX(16px)' : 'translateX(0)'
                        }}></span>
                      </label>
                    </div>
                  </div>
                  <input
                    type="text"
                    className="multas-form-input"
                    value={editingRegistro.conductor || ''}
                    onChange={(e) => {
                      setEditingRegistro({ ...editingRegistro, conductor: e.target.value })
                      setShowConductorSuggestions(true)
                    }}
                    onFocus={() => setShowConductorSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowConductorSuggestions(false), 200)}
                    placeholder="Buscar conductor..."
                    autoComplete="off"
                  />
                  {showConductorSuggestions && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      maxHeight: '200px',
                      overflowY: 'auto',
                      background: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '0 0 6px 6px',
                      zIndex: 50,
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}>
                      {conductoresOptions
                        .filter(c => {
                          const matchesSearch = c.toLowerCase().includes((editingRegistro.conductor || '').toLowerCase())
                          if (!matchesSearch) return false
                          
                          if (showOnlyActiveConductores) {
                            return conductoresStatus[c.toLowerCase()] === 'activo'
                          }
                          return true
                        })
                        .map((c, i) => {
                          const status = conductoresStatus[c.toLowerCase()]
                          const isActive = status === 'activo'
                          return (
                            <div
                              key={i}
                              onClick={() => {
                                setEditingRegistro({ ...editingRegistro, conductor: c })
                                setShowConductorSuggestions(false)
                              }}
                              style={{
                                padding: '8px 12px',
                                cursor: 'pointer',
                                borderBottom: '1px solid #f3f4f6',
                                fontSize: '14px',
                                color: '#374151',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between'
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                            >
                              <span>{c}</span>
                              {isActive ? (
                                <CheckCircle size={14} style={{ color: '#10B981' }} />
                              ) : (
                                <AlertCircle size={14} style={{ color: '#EF4444' }} />
                              )}
                            </div>
                          )
                        })}
                        {conductoresOptions.filter(c => {
                          const matchesSearch = c.toLowerCase().includes((editingRegistro.conductor || '').toLowerCase())
                          if (!matchesSearch) return false
                          if (showOnlyActiveConductores) {
                            return conductoresStatus[c.toLowerCase()] === 'activo'
                          }
                          return true
                        }).length === 0 && (
                          <div style={{ padding: '8px 12px', color: '#9ca3af', fontSize: '14px' }}>
                            No se encontraron conductores
                          </div>
                        )}
                    </div>
                  )}
                  {/* Validación de estado del conductor */}
                  {(() => {
                    const conductorName = (editingRegistro.conductor || '').trim().toLowerCase()
                    if (!conductorName) return null
                    
                    const exists = Object.prototype.hasOwnProperty.call(conductoresStatus, conductorName)
                    const status = conductoresStatus[conductorName]
                    
                    if (status === 'activo') {
                      return (
                        <div style={{
                          marginTop: '8px',
                          padding: '8px 12px',
                          background: '#ECFDF5',
                          border: '1px solid #A7F3D0',
                          borderRadius: '6px',
                          color: '#047857',
                          fontSize: '13px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontWeight: 500
                        }}>
                          <CheckCircle size={16} />
                          Conductor Activo
                        </div>
                      )
                    } else if (exists) {
                      return (
                        <div style={{
                          marginTop: '8px',
                          padding: '8px 12px',
                          background: '#FEF2F2',
                          border: '1px solid #FECACA',
                          borderRadius: '6px',
                          color: '#e6002e',
                          fontSize: '13px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontWeight: 500
                        }}>
                          <AlertCircle size={16} />
                          {`Conductor NO ACTIVO (Estado: ${status || 'Desconocido'})`}
                        </div>
                      )
                    } else {
                      // Verificar si hay coincidencias parciales
                      const hasPartialMatches = conductoresOptions.some(c => 
                        c.toLowerCase().includes(conductorName)
                      )

                      if (hasPartialMatches) return null

                      return (
                        <div style={{
                          marginTop: '8px',
                          padding: '8px 12px',
                          background: '#F3F4F6',
                          border: '1px solid #D1D5DB',
                          borderRadius: '6px',
                          color: '#4B5563',
                          fontSize: '13px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontWeight: 500
                        }}>
                          <AlertCircle size={16} />
                          Conductor no encontrado en base de datos
                        </div>
                      )
                    }
                  })()}
                </div>

                <div className="multas-form-group">
                  <label className="multas-form-label">iButton</label>
                  <input
                    type="text"
                    className="multas-form-input"
                    value={editingRegistro.ibutton || ''}
                    onChange={(e) => setEditingRegistro({ ...editingRegistro, ibutton: e.target.value })}
                    placeholder="Codigo iButton..."
                  />
                </div>

                <div className="multas-form-group">
                  <label className="multas-form-label">Observaciones</label>
                  <textarea
                    className="multas-form-textarea"
                    value={editingRegistro.observaciones || ''}
                    onChange={(e) => setEditingRegistro({ ...editingRegistro, observaciones: e.target.value })}
                    rows={3}
                    placeholder="Observaciones..."
                  />
                </div>
              </div>
            </div>
            <div className="multas-modal-footer">
              <button className="multas-btn-primary" onClick={handleGuardarEdicion}>
                Guardar
              </button>
              <button className="multas-btn-secondary" onClick={() => setShowEditModal(false)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
