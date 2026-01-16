// src/modules/multas-telepase/TelepaseHistoricoModule.tsx
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { ExcelColumnFilter } from '../../components/ui/DataTable/ExcelColumnFilter'
import { DataTable } from '../../components/ui/DataTable'
import { Download, FileText, AlertCircle, CheckCircle } from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'
import * as XLSX from 'xlsx'

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

  // Columnas
  const columns = useMemo<ColumnDef<TelepaseRegistro>[]>(() => [
    {
      accessorKey: 'created_at',
      header: 'Fecha Carga',
      cell: ({ row }) => formatDateTime(row.original.created_at)
    },
    {
      id: 'semana_facturacion',
      header: 'Sem. Fact.',
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
        <span className="dt-badge dt-badge-gray">{row.original.patente || '-'}</span>
      )
    },
    {
      id: 'detalle',
      header: 'Detalle',
      cell: ({ row }) => {
        const { categoria, estacion, via, dispositivo } = row.original
        const partes = [categoria, estacion, via, dispositivo].filter(Boolean)
        return partes.length > 0 ? partes.join(' / ') : '-'
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
          label="Observaciones"
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
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AlertCircle size={16} style={{ color: '#F59E0B' }} />
            <span style={{ fontSize: '12px', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {obs}
            </span>
          </div>
        )
      }
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
    <div className="module-container">
      {/* Header */}
      <div className="module-header">
        <div className="header-title">
          <FileText size={24} />
          <h1>Telepase Histórico</h1>
        </div>
        <div className="header-actions">
          <button className="btn-secondary" onClick={handleExportar}>
            <Download size={16} />
            Exportar
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(99, 102, 241, 0.1)' }}>
            <FileText size={20} style={{ color: '#6366F1' }} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{registrosFiltrados.length}</span>
            <span className="stat-label">REGISTROS</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(245, 158, 11, 0.1)' }}>
            <span style={{ fontSize: '18px', fontWeight: 700, color: '#F59E0B' }}>$</span>
          </div>
          <div className="stat-content">
            <span className="stat-value">{formatMoney(totalTarifa)}</span>
            <span className="stat-label">TOTAL TARIFAS</span>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="table-container">
        <DataTable
          data={registrosFiltrados}
          columns={columns}
          searchPlaceholder="Buscar por patente, conductor..."
        />
      </div>
    </div>
  )
}
