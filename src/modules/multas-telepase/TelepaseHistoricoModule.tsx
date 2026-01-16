// src/modules/multas-telepase/TelepaseHistoricoModule.tsx
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { ExcelColumnFilter } from '../../components/ui/DataTable/ExcelColumnFilter'
import { DataTable } from '../../components/ui/DataTable'
import { Download, FileText, AlertCircle, CheckCircle, Eye, X, Car, Users, DollarSign } from 'lucide-react'
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
  const num = typeof value === 'string' ? parseFloat(value.replace(/[^0-9.-]/g, '')) : value
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
  const [loading, setLoading] = useState(true)
  const [registros, setRegistros] = useState<TelepaseRegistro[]>([])
  const [selectedRegistro, setSelectedRegistro] = useState<TelepaseRegistro | null>(null)
  const [showModal, setShowModal] = useState(false)
  
  // Filtros
  const [openFilterId, setOpenFilterId] = useState<string | null>(null)
  const [patenteFilter, setPatenteFilter] = useState<string[]>([])
  const [concesionarioFilter, setConcesionarioFilter] = useState<string[]>([])
  const [conductorFilter, setConductorFilter] = useState<string[]>([])
  const [observacionesFilter, setObservacionesFilter] = useState<string[]>([])

  useEffect(() => {
    cargarDatos()
  }, [])

  async function cargarDatos() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('telepase_historico')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setRegistros(data || [])
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

    return filtered
  }, [registros, patenteFilter, concesionarioFilter, conductorFilter, observacionesFilter])

  // Calcular totales
  const totalTarifa = useMemo(() => {
    return registrosFiltrados.reduce((sum, r) => {
      const tarifa = parseFloat(r.tarifa?.replace(/[^0-9.-]/g, '') || '0')
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

  // Columnas
  const columns = useMemo<ColumnDef<TelepaseRegistro>[]>(() => [
    {
      accessorKey: 'created_at',
      header: 'Fecha Carga',
      cell: ({ row }) => formatDateTime(row.original.created_at)
    },
    {
      id: 'semana_facturacion',
      header: 'Sem.',
      cell: ({ row }) => {
        if (!row.original.created_at) return '-'
        return getWeekNumber(row.original.created_at)
      }
    },
    {
      id: 'fecha_hora',
      header: 'Fecha/Hora Peaje',
      cell: ({ row }) => {
        const fecha = row.original.fecha || ''
        const hora = row.original.hora || ''
        return `${fecha} ${hora}`.trim() || '-'
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
      id: 'detalle',
      header: 'Detalle',
      cell: ({ row }) => {
        const { categoria, estacion, via, dispositivo } = row.original
        const partes = [categoria, estacion, via, dispositivo].filter(Boolean)
        return <span style={{ fontSize: '12px' }}>{partes.length > 0 ? partes.join(' / ') : '-'}</span>
      }
    },
    {
      accessorKey: 'tarifa',
      header: 'Tarifa',
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
      header: 'iButton',
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
            className="dt-btn-action dt-btn-view" 
            data-tooltip="Ver detalle"
            onClick={() => handleVerDetalle(row.original)}
          >
            <Eye size={14} />
          </button>
        </div>
      )
    }
  ], [patentesUnicas, patenteFilter, concesionariosUnicos, concesionarioFilter, conductoresUnicos, conductorFilter, observacionesOpciones, observacionesFilter, openFilterId])

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

  if (loading) {
    return (
      <div className="module-container">
        <div className="loading-container">
          <div className="spinner" />
          <p>Cargando datos de Telepase...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="multas-module">
      {/* Stats Cards */}
      <div className="multas-stats">
        <div className="multas-stats-grid five-cols">
          <div className="stat-card">
            <FileText size={18} className="stat-icon" style={{ color: '#6B7280' }} />
            <div className="stat-content">
              <span className="stat-value">{registrosFiltrados.length}</span>
              <span className="stat-label">Total</span>
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
              <span className="stat-value">{formatMoney(totalTarifa)}</span>
              <span className="stat-label">Total Tarifas</span>
            </div>
          </div>
          <div className="stat-card">
            <AlertCircle size={18} className="stat-icon" style={{ color: conObservaciones > 0 ? '#F59E0B' : '#10B981' }} />
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
        headerAction={
          <button className="btn-secondary" onClick={handleExportar}>
            <Download size={16} />
            Exportar
          </button>
        }
      />

      {/* Modal Detalle */}
      {showModal && selectedRegistro && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h2>Detalle de Peaje</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="detail-group">
                  <label>Fecha de Carga</label>
                  <p>{formatDateTime(selectedRegistro.created_at)}</p>
                </div>
                <div className="detail-group">
                  <label>Semana Facturación</label>
                  <p>{selectedRegistro.created_at ? getWeekNumber(selectedRegistro.created_at) : '-'}</p>
                </div>
                <div className="detail-group">
                  <label>Fecha Peaje</label>
                  <p>{selectedRegistro.fecha || '-'}</p>
                </div>
                <div className="detail-group">
                  <label>Hora Peaje</label>
                  <p>{selectedRegistro.hora || '-'}</p>
                </div>
                <div className="detail-group">
                  <label>Concesionario</label>
                  <p>{selectedRegistro.concesionario || '-'}</p>
                </div>
                <div className="detail-group">
                  <label>Patente</label>
                  <p><span className="dt-badge dt-badge-dark">{selectedRegistro.patente || '-'}</span></p>
                </div>
                <div className="detail-group">
                  <label>Categoría</label>
                  <p>{selectedRegistro.categoria || '-'}</p>
                </div>
                <div className="detail-group">
                  <label>Estación</label>
                  <p>{selectedRegistro.estacion || '-'}</p>
                </div>
                <div className="detail-group">
                  <label>Vía</label>
                  <p>{selectedRegistro.via || '-'}</p>
                </div>
                <div className="detail-group">
                  <label>Dispositivo</label>
                  <p>{selectedRegistro.dispositivo || '-'}</p>
                </div>
                <div className="detail-group">
                  <label>Tarifa</label>
                  <p style={{ fontWeight: 600, color: '#F59E0B', fontSize: '18px' }}>{formatMoney(selectedRegistro.tarifa)}</p>
                </div>
                <div className="detail-group">
                  <label>Documento Legal</label>
                  <p>{selectedRegistro.documento_legal || '-'}</p>
                </div>
                <div className="detail-group">
                  <label>Conductor</label>
                  <p>{selectedRegistro.conductor || '-'}</p>
                </div>
                <div className="detail-group">
                  <label>iButton</label>
                  <p>{selectedRegistro.ibutton || '-'}</p>
                </div>
              </div>
              {selectedRegistro.observaciones && (
                <div className="detail-group" style={{ marginTop: '16px' }}>
                  <label>Observaciones</label>
                  <p style={{ 
                    padding: '12px', 
                    background: 'rgba(245, 158, 11, 0.1)', 
                    borderRadius: '6px',
                    border: '1px solid rgba(245, 158, 11, 0.3)'
                  }}>
                    {selectedRegistro.observaciones}
                  </p>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowModal(false)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
