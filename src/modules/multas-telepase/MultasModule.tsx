// src/modules/multas-telepase/MultasModule.tsx
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { LoadingOverlay } from '../../components/ui/LoadingOverlay'
import { ExcelColumnFilter } from '../../components/ui/DataTable/ExcelColumnFilter'
import { ExcelDateRangeFilter } from '../../components/ui/DataTable/ExcelDateRangeFilter'
import { DataTable } from '../../components/ui/DataTable'
import { Download, AlertTriangle, Eye, Edit2, Trash2, Plus, X, Car, Users, DollarSign, CheckCircle, AlertCircle } from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'
import * as XLSX from 'xlsx'
import Swal from 'sweetalert2'
import { showSuccess } from '../../utils/toast'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import './MultasTelepase.css'

interface Multa {
  id: number
  created_at: string
  patente: string
  fecha_infraccion: string | null
  importe: string
  lugar: string
  detalle: string
  fecha_anotacion: string | null
  conductor_responsable: string
  observaciones: string
  infraccion: string
  lugar_detalle: string
  ibutton: string
}

interface Vehiculo {
  id: string
  patente: string
}

function formatMoney(value: string | number | null | undefined): string {
  if (!value) return 'Gs. 0'
  const num = typeof value === 'string' ? parseFloat(value.replace(/[^0-9.-]/g, '')) : value
  if (isNaN(num)) return 'Gs. 0'
  return `Gs. ${num.toLocaleString('es-PY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function parseImporte(importe: string | number | null | undefined): number {
  if (!importe) return 0
  const num = typeof importe === 'string' ? parseFloat(importe.replace(/[^0-9.-]/g, '')) : importe
  return isNaN(num) ? 0 : num
}

function formatFecha(fecha: string | null): string {
  if (!fecha) return '-'
  try {
    return format(new Date(fecha), 'dd/MM/yyyy', { locale: es })
  } catch {
    return fecha
  }
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

export default function MultasModule() {
  const [loading, setLoading] = useState(true)
  const [multas, setMultas] = useState<Multa[]>([])
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([])
  const [selectedMulta, setSelectedMulta] = useState<Multa | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingMulta, setEditingMulta] = useState<Multa | null>(null)
  const [onlyActiveConductors, setOnlyActiveConductors] = useState(false)

  // Filtros
  const [openFilterId, setOpenFilterId] = useState<string | null>(null)
  const [patenteFilter, setPatenteFilter] = useState<string[]>([])
  const [conductorFilter, setConductorFilter] = useState<string[]>([])
  const [lugarFilter, setLugarFilter] = useState<string[]>([])
  const [infraccionFilter, setInfraccionFilter] = useState<string[]>([])
  const [semanaFilter, setSemanaFilter] = useState<string[]>([])
  const [fechaInfraccionDesde, setFechaInfraccionDesde] = useState<string | null>(null)
  const [fechaInfraccionHasta, setFechaInfraccionHasta] = useState<string | null>(null)
  const [fechaCargaDesde, setFechaCargaDesde] = useState<string | null>(null)
  const [fechaCargaHasta, setFechaCargaHasta] = useState<string | null>(null)
  const [ibuttonFilter, setIbuttonFilter] = useState<string[]>([])

  // Opciones para autocompletado y validación
  const [conductoresOptions, setConductoresOptions] = useState<string[]>([])
  const [conductoresStatus, setConductoresStatus] = useState<Record<string, string>>({})
  const [showConductorSuggestions, setShowConductorSuggestions] = useState(false)

  useEffect(() => {
    cargarDatos()
    fetchConductores()
  }, [])

  async function fetchConductores() {
    try {
      // Consulta de referencia: SELECT DISTINCT CONCAT(nombres, ' ', apellidos) AS conductor FROM conductores
      const { data, error } = await supabase
        .from('conductores')
        .select('nombres, apellidos, estado_facturacion')
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
      const [multasRes, vehiculosRes] = await Promise.all([
        supabase.from('multas_historico').select('*').order('created_at', { ascending: false }),
        supabase.from('vehiculos').select('id, patente')
      ])

      if (multasRes.error) throw multasRes.error
      setMultas((multasRes.data || []) as Multa[])
      setVehiculos((vehiculosRes.data || []) as Vehiculo[])
    } catch (error) {
      console.error('Error cargando datos:', error)
      Swal.fire('Error', 'No se pudieron cargar las multas', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Valores unicos para filtros
  const patentesUnicas = useMemo(() =>
    [...new Set(multas.map(m => m.patente).filter(Boolean))].sort()
  , [multas])

  const conductoresUnicos = useMemo(() =>
    [...new Set(multas.map(m => m.conductor_responsable).filter(Boolean))].sort()
  , [multas])

  const lugaresUnicos = useMemo(() =>
    [...new Set(multas.map(m => m.lugar).filter(Boolean))].sort()
  , [multas])

  const infraccionesUnicas = useMemo(() =>
    [...new Set(multas.map(m => m.detalle).filter(Boolean))].sort()
  , [multas])

  const semanasUnicas = useMemo(() => {
    const semanas = new Set<string>()
    multas.forEach(m => {
      if (m.created_at) {
        semanas.add(getWeekNumber(m.created_at).toString())
      }
    })
    return [...semanas].sort((a, b) => parseInt(a) - parseInt(b))
  }, [multas])

  const ibuttonsUnicos = useMemo(() =>
    [...new Set(multas.map(m => m.ibutton).filter(Boolean))].sort()
  , [multas])

  // Filtrar registros
  const multasFiltradas = useMemo(() => {
    let filtered = multas

    if (patenteFilter.length > 0) {
      filtered = filtered.filter(m => patenteFilter.includes(m.patente))
    }
    if (conductorFilter.length > 0) {
      filtered = filtered.filter(m => conductorFilter.includes(m.conductor_responsable))
    }
    if (lugarFilter.length > 0) {
      filtered = filtered.filter(m => lugarFilter.includes(m.lugar))
    }
    if (infraccionFilter.length > 0) {
      filtered = filtered.filter(m => infraccionFilter.includes(m.detalle))
    }
    if (semanaFilter.length > 0) {
      filtered = filtered.filter(m => {
        if (!m.created_at) return false
        return semanaFilter.includes(getWeekNumber(m.created_at).toString())
      })
    }
    if (ibuttonFilter.length > 0) {
      filtered = filtered.filter(m => ibuttonFilter.includes(m.ibutton))
    }
    if (fechaInfraccionDesde) {
      filtered = filtered.filter(m => {
        if (!m.fecha_infraccion) return false
        return m.fecha_infraccion >= fechaInfraccionDesde
      })
    }
    if (fechaInfraccionHasta) {
      filtered = filtered.filter(m => {
        if (!m.fecha_infraccion) return false
        // Añadimos T23:59:59 para incluir todo el día final
        return m.fecha_infraccion <= `${fechaInfraccionHasta}T23:59:59`
      })
    }
    if (fechaCargaDesde) {
      filtered = filtered.filter(m => {
        if (!m.created_at) return false
        return m.created_at >= fechaCargaDesde
      })
    }
    if (fechaCargaHasta) {
      filtered = filtered.filter(m => {
        if (!m.created_at) return false
        return m.created_at <= `${fechaCargaHasta}T23:59:59`
      })
    }

    return filtered
  }, [multas, patenteFilter, conductorFilter, lugarFilter, infraccionFilter, semanaFilter, ibuttonFilter, fechaInfraccionDesde, fechaInfraccionHasta, fechaCargaDesde, fechaCargaHasta])

  // Estadisticas
  const totalImporte = useMemo(() =>
    multasFiltradas.reduce((sum, m) => sum + parseImporte(m.importe), 0)
  , [multasFiltradas])

  const patentesUnicasCount = useMemo(() =>
    new Set(multasFiltradas.map(m => m.patente).filter(Boolean)).size
  , [multasFiltradas])

  const conductoresUnicosCount = useMemo(() =>
    new Set(multasFiltradas.map(m => m.conductor_responsable).filter(Boolean)).size
  , [multasFiltradas])

  // Ver detalle
  function handleVerDetalle(multa: Multa) {
    setSelectedMulta(multa)
    setShowModal(true)
  }

  // Crear multa
  async function crearMulta() {
    const patentesOptions = vehiculos
      .sort((a, b) => (a.patente || '').localeCompare(b.patente || ''))
      .map(v => `<option value="${v.patente}">${v.patente}</option>`)
      .join('')

    const { value: formValues } = await Swal.fire({
      title: 'Registrar Multa',
      html: `
        <div class="multas-modal-form">
          <div class="multas-form-group">
            <label class="multas-form-label">Patente *</label>
            <select id="swal-patente" class="multas-form-select">
              <option value="">Seleccione vehiculo...</option>
              ${patentesOptions}
            </select>
          </div>
          <div class="multas-form-group">
            <label class="multas-form-label">Fecha Infraccion *</label>
            <input id="swal-fecha" type="date" class="multas-form-input">
          </div>
          <div class="multas-form-group">
            <label class="multas-form-label">Importe (Gs.) *</label>
            <input id="swal-importe" type="number" placeholder="Ej: 500000" class="multas-form-input">
          </div>
          <div class="multas-form-group">
            <label class="multas-form-label">Infraccion</label>
            <input id="swal-infraccion" type="text" placeholder="Tipo de infraccion..." class="multas-form-input">
          </div>
          <div class="multas-form-group">
            <label class="multas-form-label">Lugar</label>
            <input id="swal-lugar" type="text" placeholder="Ubicacion..." class="multas-form-input">
          </div>
          <div class="multas-form-group">
            <label class="multas-form-label">Conductor Responsable</label>
            <input id="swal-conductor" type="text" placeholder="Nombre del conductor..." class="multas-form-input">
          </div>
          <div class="multas-form-group">
            <label class="multas-form-label">Observaciones</label>
            <textarea id="swal-detalle" rows="2" placeholder="Detalles adicionales..." class="multas-form-textarea"></textarea>
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Registrar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#DC2626',
      width: 480,
      preConfirm: () => {
        const patente = (document.getElementById('swal-patente') as HTMLSelectElement).value
        const fecha = (document.getElementById('swal-fecha') as HTMLInputElement).value
        const importe = (document.getElementById('swal-importe') as HTMLInputElement).value
        const infraccion = (document.getElementById('swal-infraccion') as HTMLInputElement).value
        const lugar = (document.getElementById('swal-lugar') as HTMLInputElement).value
        const conductor = (document.getElementById('swal-conductor') as HTMLInputElement).value
        const detalle = (document.getElementById('swal-detalle') as HTMLTextAreaElement).value

        if (!patente) { Swal.showValidationMessage('Seleccione una patente'); return false }
        if (!fecha) { Swal.showValidationMessage('Ingrese la fecha'); return false }
        if (!importe || parseFloat(importe) <= 0) { Swal.showValidationMessage('Ingrese un importe valido'); return false }

        return { patente, fecha, importe, infraccion, lugar, conductor, detalle }
      }
    })

    if (!formValues) return

    try {
      const { error } = await (supabase.from('multas_historico') as any).insert({
        patente: formValues.patente,
        fecha_infraccion: formValues.fecha,
        importe: formValues.importe,
        infraccion: formValues.infraccion || null,
        lugar: formValues.lugar || null,
        conductor_responsable: formValues.conductor || null,
        detalle: formValues.detalle || null,
        observaciones: formValues.detalle || null,
        fecha_anotacion: new Date().toISOString()
      })

      if (error) throw error

      showSuccess('Multa Registrada')
      cargarDatos()
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo registrar', 'error')
    }
  }

  // Editar multa
  function editarMulta(multa: Multa) {
    setEditingMulta({ ...multa })
    setOnlyActiveConductors(false)
    setShowEditModal(true)
  }

  async function handleGuardarEdicion() {
    if (!editingMulta) return

    try {
      const { error } = await (supabase.from('multas_historico') as any)
        .update({
          patente: editingMulta.patente,
          fecha_infraccion: editingMulta.fecha_infraccion,
          importe: editingMulta.importe,
          infraccion: editingMulta.infraccion || null,
          lugar: editingMulta.lugar || null,
          conductor_responsable: editingMulta.conductor_responsable || null,
          detalle: editingMulta.detalle || null,
          observaciones: editingMulta.observaciones || null,
          ibutton: editingMulta.ibutton || null
        })
        .eq('id', editingMulta.id)

      if (error) throw error

      showSuccess('Actualizada')
      setShowEditModal(false)
      setEditingMulta(null)
      cargarDatos()
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo actualizar', 'error')
    }
  }

  // Eliminar multa
  async function eliminarMulta(multa: Multa) {
    const result = await Swal.fire({
      title: 'Eliminar multa?',
      text: `${multa.patente} - ${formatMoney(multa.importe)}`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#DC2626',
      confirmButtonText: 'Eliminar',
      cancelButtonText: 'Cancelar'
    })

    if (!result.isConfirmed) return

    try {
      const { error } = await (supabase.from('multas_historico') as any).delete().eq('id', multa.id)
      if (error) throw error

      showSuccess('Eliminada')
      setShowModal(false)
      cargarDatos()
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo eliminar', 'error')
    }
  }

  // Filtros activos
  const activeFilters = [
    ...(fechaCargaDesde || fechaCargaHasta ? [{
      id: 'fecha_carga',
      label: `Fecha Carga: ${fechaCargaDesde || '...'} - ${fechaCargaHasta || '...'}`,
      onClear: () => { setFechaCargaDesde(null); setFechaCargaHasta(null) }
    }] : []),
    ...(fechaInfraccionDesde || fechaInfraccionHasta ? [{
      id: 'fecha_infraccion',
      label: `Fecha Infracción: ${fechaInfraccionDesde || '...'} - ${fechaInfraccionHasta || '...'}`,
      onClear: () => { setFechaInfraccionDesde(null); setFechaInfraccionHasta(null) }
    }] : []),
    ...(patenteFilter.length > 0 ? [{
      id: 'patente',
      label: `Patente: ${patenteFilter.length} seleccionados`,
      onClear: () => setPatenteFilter([])
    }] : []),
    ...(conductorFilter.length > 0 ? [{
      id: 'conductor',
      label: `Conductor: ${conductorFilter.length} seleccionados`,
      onClear: () => setConductorFilter([])
    }] : []),
    ...(lugarFilter.length > 0 ? [{
      id: 'lugar',
      label: `Lugar: ${lugarFilter.length} seleccionados`,
      onClear: () => setLugarFilter([])
    }] : []),
    ...(infraccionFilter.length > 0 ? [{
      id: 'infraccion',
      label: `Infracción: ${infraccionFilter.length} seleccionados`,
      onClear: () => setInfraccionFilter([])
    }] : []),
    ...(ibuttonFilter.length > 0 ? [{
      id: 'ibutton',
      label: `iButton: ${ibuttonFilter.length} seleccionados`,
      onClear: () => setIbuttonFilter([])
    }] : []),
    ...(semanaFilter.length > 0 ? [{
      id: 'semana',
      label: `Semana: ${semanaFilter.join(', ')}`,
      onClear: () => setSemanaFilter([])
    }] : [])
  ]

  function clearAllFilters() {
    setPatenteFilter([])
    setConductorFilter([])
    setLugarFilter([])
    setInfraccionFilter([])
    setSemanaFilter([])
    setIbuttonFilter([])
    setFechaInfraccionDesde(null)
    setFechaInfraccionHasta(null)
    setFechaCargaDesde(null)
    setFechaCargaHasta(null)
  }

  // Columnas
  const columns = useMemo<ColumnDef<Multa>[]>(() => [
    {
      accessorKey: 'created_at',
      header: () => (
        <ExcelDateRangeFilter
          label="Fecha Carga"
          startDate={fechaCargaDesde}
          endDate={fechaCargaHasta}
          onRangeChange={(start, end) => {
            setFechaCargaDesde(start)
            setFechaCargaHasta(end)
          }}
          filterId="fecha_carga"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => formatDateTime(row.original.created_at)
    },
    {
      id: 'semana',
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
        if (!row.original.created_at) return '-'
        return getWeekNumber(row.original.created_at)
      }
    },
    {
      accessorKey: 'fecha_infraccion',
      header: () => (
        <ExcelDateRangeFilter
          label="Fecha Infraccion"
          startDate={fechaInfraccionDesde}
          endDate={fechaInfraccionHasta}
          onRangeChange={(start, end) => {
            setFechaInfraccionDesde(start)
            setFechaInfraccionHasta(end)
          }}
          filterId="fecha_infraccion"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => formatFecha(row.original.fecha_infraccion)
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
      accessorKey: 'lugar',
      header: () => (
        <ExcelColumnFilter
          label="Lugar"
          options={lugaresUnicos}
          selectedValues={lugarFilter}
          onSelectionChange={setLugarFilter}
          filterId="lugar"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => row.original.lugar || '-'
    },
    {
      accessorKey: 'detalle',
      header: () => (
        <ExcelColumnFilter
          label="Infraccion"
          options={infraccionesUnicas}
          selectedValues={infraccionFilter}
          onSelectionChange={setInfraccionFilter}
          filterId="infraccion"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => (
        <span style={{ fontSize: '13px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
          {row.original.detalle || '-'}
        </span>
      )
    },
    {
      accessorKey: 'conductor_responsable',
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
      cell: ({ row }) => row.original.conductor_responsable || '-'
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
      id: 'acciones',
      header: 'Acciones',
      cell: ({ row }) => (
        <div className="dt-actions">
          <button
            className="dt-btn-action dt-btn-edit"
            data-tooltip="Editar"
            onClick={() => editarMulta(row.original)}
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
          <button
            className="dt-btn-action dt-btn-delete"
            data-tooltip="Eliminar"
            onClick={() => eliminarMulta(row.original)}
          >
            <Trash2 size={14} />
          </button>
        </div>
      )
    }
  ], [patentesUnicas, patenteFilter, conductoresUnicos, conductorFilter, lugaresUnicos, lugarFilter, infraccionesUnicas, infraccionFilter, semanasUnicas, semanaFilter, ibuttonsUnicos, ibuttonFilter, fechaInfraccionDesde, fechaInfraccionHasta, fechaCargaDesde, fechaCargaHasta, openFilterId])

  // Exportar a Excel
  function handleExportar() {
    const dataExport = multasFiltradas.map(m => ({
      'Patente': m.patente,
      'Fecha Infraccion': formatFecha(m.fecha_infraccion),
      'Importe': parseImporte(m.importe),
      'Infraccion': m.infraccion,
      'Lugar': m.lugar,
      'Conductor': m.conductor_responsable,
      'Observaciones': m.observaciones || m.detalle
    }))

    const ws = XLSX.utils.json_to_sheet(dataExport)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Multas')
    XLSX.writeFile(wb, `multas_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  return (
    <div className="multas-module">
      <LoadingOverlay show={loading} message="Cargando multas..." size="lg" />
      {/* Stats Cards */}
      <div className="multas-stats">
        <div className="multas-stats-grid">
          <div className="stat-card">
            <AlertTriangle size={18} className="stat-icon" style={{ color: '#EF4444' }} />
            <div className="stat-content">
              <span className="stat-value">{multasFiltradas.length}</span>
              <span className="stat-label">Total Multas</span>
            </div>
          </div>
          <div className="stat-card">
            <Car size={18} className="stat-icon" style={{ color: '#6B7280' }} />
            <div className="stat-content">
              <span className="stat-value">{patentesUnicasCount}</span>
              <span className="stat-label">Vehiculos</span>
            </div>
          </div>
          <div className="stat-card">
            <Users size={18} className="stat-icon" style={{ color: '#6B7280' }} />
            <div className="stat-content">
              <span className="stat-value">{conductoresUnicosCount}</span>
              <span className="stat-label">Conductores</span>
            </div>
          </div>
          <div className="stat-card">
            <DollarSign size={18} className="stat-icon" style={{ color: '#22C55E' }} />
            <div className="stat-content">
              <span className="stat-value">{formatMoney(totalImporte)}</span>
              <span className="stat-label">Monto Total</span>
            </div>
          </div>
        </div>
      </div>

      {/* DataTable */}
      <DataTable
        data={multasFiltradas}
        columns={columns}
        searchPlaceholder="Buscar por patente, conductor, lugar..."
        disableAutoFilters={true}
        externalFilters={activeFilters}
        onClearAllFilters={clearAllFilters}
        headerAction={
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn-secondary" onClick={handleExportar}>
              <Download size={16} />
              Exportar
            </button>
            <button className="btn-primary" onClick={crearMulta}>
              <Plus size={16} />
              Registrar Multa
            </button>
          </div>
        }
      />

      {/* Modal Detalle */}
      {showModal && selectedMulta && (
        <div className="multas-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="multas-modal-container" onClick={e => e.stopPropagation()} style={{ maxWidth: '550px' }}>
            <div className="multas-modal-header">
              <h2 className="multas-modal-title">Detalle de Multa</h2>
              <button className="multas-modal-close" onClick={() => setShowModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="multas-modal-body">
              <table className="multas-detail-table">
                <tbody>
                  <tr>
                    <td className="multas-detail-label">Patente</td>
                    <td className="multas-detail-value">
                      <span className="patente-badge">{selectedMulta.patente || '-'}</span>
                    </td>
                  </tr>
                  <tr>
                    <td className="multas-detail-label">Fecha Infraccion</td>
                    <td className="multas-detail-value">{formatFecha(selectedMulta.fecha_infraccion)}</td>
                  </tr>
                  <tr>
                    <td className="multas-detail-label">Importe</td>
                    <td className="multas-detail-value" style={{ fontWeight: 700, color: '#DC2626', fontSize: '18px' }}>
                      {formatMoney(selectedMulta.importe)}
                    </td>
                  </tr>
                  <tr>
                    <td className="multas-detail-label">Infraccion</td>
                    <td className="multas-detail-value">{selectedMulta.infraccion || '-'}</td>
                  </tr>
                  <tr>
                    <td className="multas-detail-label">Lugar</td>
                    <td className="multas-detail-value">{selectedMulta.lugar || '-'}</td>
                  </tr>
                  {selectedMulta.lugar_detalle && (
                    <tr>
                      <td className="multas-detail-label">Lugar Detalle</td>
                      <td className="multas-detail-value">{selectedMulta.lugar_detalle}</td>
                    </tr>
                  )}
                  <tr>
                    <td className="multas-detail-label">Conductor</td>
                    <td className="multas-detail-value">{selectedMulta.conductor_responsable || '-'}</td>
                  </tr>
                  {selectedMulta.ibutton && (
                    <tr>
                      <td className="multas-detail-label">iButton</td>
                      <td className="multas-detail-value" style={{ fontFamily: 'monospace', fontSize: '12px' }}>{selectedMulta.ibutton}</td>
                    </tr>
                  )}
                  {(selectedMulta.observaciones || selectedMulta.detalle) && (
                    <tr>
                      <td className="multas-detail-label">Observaciones</td>
                      <td className="multas-detail-value" style={{
                        padding: '12px',
                        background: 'rgba(239, 68, 68, 0.1)',
                        borderRadius: '6px',
                        border: '1px solid rgba(239, 68, 68, 0.2)'
                      }}>
                        {selectedMulta.observaciones || selectedMulta.detalle}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="multas-modal-footer">
              <button className="multas-btn-primary" onClick={() => { setShowModal(false); editarMulta(selectedMulta); }}>
                <Edit2 size={14} style={{ marginRight: '6px' }} />
                Editar
              </button>
              <button className="multas-btn-secondary" onClick={() => setShowModal(false)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar */}
      {showEditModal && editingMulta && (
        <div className="multas-modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="multas-modal-container" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="multas-modal-header">
              <h2 className="multas-modal-title">Editar Multa</h2>
              <button className="multas-modal-close" onClick={() => setShowEditModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="multas-modal-body">
              <div className="multas-modal-form">
                {/* Patente */}
                <div className="multas-form-group">
                  <label className="multas-form-label">Patente *</label>
                  <select 
                    className="multas-form-select"
                    value={editingMulta.patente}
                    onChange={e => setEditingMulta({...editingMulta, patente: e.target.value})}
                  >
                    <option value="">Seleccione...</option>
                    {vehiculos
                      .sort((a, b) => (a.patente || '').localeCompare(b.patente || ''))
                      .map(v => (
                        <option key={v.id} value={v.patente}>{v.patente}</option>
                    ))}
                  </select>
                </div>
                
                {/* Fecha Infraccion */}
                <div className="multas-form-group">
                  <label className="multas-form-label">Fecha Infraccion *</label>
                  <input 
                    type="date" 
                    className="multas-form-input"
                    value={editingMulta.fecha_infraccion ? editingMulta.fecha_infraccion.split('T')[0] : ''}
                    onChange={e => setEditingMulta({...editingMulta, fecha_infraccion: e.target.value})}
                  />
                </div>

                {/* Importe */}
                <div className="multas-form-group">
                  <label className="multas-form-label">Importe (Gs.) *</label>
                  <input 
                    type="number" 
                    className="multas-form-input"
                    value={parseImporte(editingMulta.importe)}
                    onChange={e => setEditingMulta({...editingMulta, importe: e.target.value})}
                  />
                </div>

                {/* Infraccion */}
                <div className="multas-form-group">
                  <label className="multas-form-label">Infraccion</label>
                  <input 
                    type="text" 
                    className="multas-form-input"
                    value={editingMulta.infraccion || ''}
                    onChange={e => setEditingMulta({...editingMulta, infraccion: e.target.value})}
                  />
                </div>

                {/* Lugar */}
                <div className="multas-form-group">
                  <label className="multas-form-label">Lugar</label>
                  <input 
                    type="text" 
                    className="multas-form-input"
                    value={editingMulta.lugar || ''}
                    onChange={e => setEditingMulta({...editingMulta, lugar: e.target.value})}
                  />
                </div>

                {/* Conductor Responsable - Autocomplete */}
                <div className="multas-form-group" style={{ position: 'relative' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label className="multas-form-label" style={{ marginBottom: 0 }}>Conductor Responsable</label>
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
                          checked={onlyActiveConductors}
                          onChange={(e) => setOnlyActiveConductors(e.target.checked)}
                          style={{ opacity: 0, width: 0, height: 0 }}
                        />
                        <span style={{
                          position: 'absolute',
                          cursor: 'pointer',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          backgroundColor: onlyActiveConductors ? '#2563EB' : '#E5E7EB',
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
                          transform: onlyActiveConductors ? 'translateX(16px)' : 'translateX(0)'
                        }}></span>
                      </label>
                    </div>
                  </div>
                  <input
                    type="text"
                    className="multas-form-input"
                    value={editingMulta.conductor_responsable || ''}
                    onChange={(e) => {
                      setEditingMulta({ ...editingMulta, conductor_responsable: e.target.value })
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
                          const matchesSearch = c.toLowerCase().includes((editingMulta.conductor_responsable || '').toLowerCase())
                          if (!matchesSearch) return false
                          if (onlyActiveConductors) {
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
                                setEditingMulta({ ...editingMulta, conductor_responsable: c })
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
                          const matchesSearch = c.toLowerCase().includes((editingMulta.conductor_responsable || '').toLowerCase())
                          if (!matchesSearch) return false
                          if (onlyActiveConductors) {
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
                    const conductorName = (editingMulta.conductor_responsable || '').trim().toLowerCase()
                    if (!conductorName) return null
                    
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
                    } else if (conductoresOptions.some(c => c.toLowerCase() === conductorName)) {
                      return (
                        <div style={{
                          marginTop: '8px',
                          padding: '8px 12px',
                          background: '#FEF2F2',
                          border: '1px solid #FECACA',
                          borderRadius: '6px',
                          color: '#B91C1C',
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
                    }
                    return null
                  })()}
                </div>

                {/* iButton */}
                <div className="multas-form-group">
                  <label className="multas-form-label">iButton</label>
                  <input
                    type="text"
                    className="multas-form-input"
                    value={editingMulta.ibutton || ''}
                    onChange={(e) => setEditingMulta({...editingMulta, ibutton: e.target.value})}
                    placeholder="Código iButton..."
                  />
                </div>

                {/* Observaciones */}
                <div className="multas-form-group">
                  <label className="multas-form-label">Observaciones</label>
                  <textarea 
                    className="multas-form-textarea"
                    rows={3}
                    value={editingMulta.observaciones || ''}
                    onChange={e => setEditingMulta({...editingMulta, observaciones: e.target.value})}
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
