// src/modules/integraciones/uss/bitacora/components/BitacoraTable.tsx
/**
 * Tabla de bitácora usando DataTable con filtros Excel
 */

import { useState, useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../../../../../components/ui/DataTable/DataTable'
import { ExcelColumnFilter, useExcelFilters } from '../../../../../components/ui/DataTable/ExcelColumnFilter'
import { Search, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, ClipboardList } from 'lucide-react'
import type { BitacoraRegistroTransformado } from '../../../../../services/wialonBitacoraService'
import { BITACORA_CONSTANTS } from '../constants/bitacora.constants'

interface BitacoraTableProps {
  registros: BitacoraRegistroTransformado[]
  totalCount: number
  isLoading: boolean
  page: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  onChecklistChange: (
    id: string,
    field: 'gnc_cargado' | 'lavado_realizado' | 'nafta_cargada',
    value: boolean
  ) => Promise<void>
  searchTerm: string
  onSearchChange: (term: string) => void
  headerControls?: React.ReactNode
}

export function BitacoraTable({
  registros,
  totalCount,
  isLoading,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  onChecklistChange,
  searchTerm,
  onSearchChange,
  headerControls,
}: BitacoraTableProps) {
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const totalPages = Math.ceil(totalCount / pageSize)

  // Estados para filtros Excel - TODAS las columnas
  const { openFilterId, setOpenFilterId } = useExcelFilters()
  const [patenteFilter, setPatenteFilter] = useState<string[]>([])
  const [ibuttonFilter, setIbuttonFilter] = useState<string[]>([])
  const [conductorFilter, setConductorFilter] = useState<string[]>([])
  const [tipoFilter, setTipoFilter] = useState<string[]>([])
  const [turnoFilter, setTurnoFilter] = useState<string[]>([])
  const [inicioFilter, setInicioFilter] = useState<string[]>([])
  const [cierreFilter, setCierreFilter] = useState<string[]>([])
  const [kmFilter, setKmFilter] = useState<string[]>([])
  const [gncFilter, setGncFilter] = useState<string[]>([])
  const [lavadoFilter, setLavadoFilter] = useState<string[]>([])
  const [naftaFilter, setNaftaFilter] = useState<string[]>([])
  const [estadoFilter, setEstadoFilter] = useState<string[]>([])

  // Listas únicas para filtros
  const patentesUnicas = useMemo(() =>
    [...new Set(registros.map(r => r.patente.replace(/\s/g, '')))].filter(Boolean).sort()
  , [registros])

  const ibuttonsUnicos = useMemo(() =>
    [...new Set(registros.map(r => r.ibutton || '-'))].sort()
  , [registros])

  const conductoresUnicos = useMemo(() =>
    [...new Set(registros.map(r => r.conductor_wialon || '-'))].sort()
  , [registros])

  const tiposUnicos = useMemo(() =>
    [...new Set(registros.map(r => r.tipo_turno || '-'))].sort()
  , [registros])

  const turnosUnicos = useMemo(() =>
    [...new Set(registros.map(r => r.turno_indicador || '-'))].sort()
  , [registros])

  const iniciosUnicos = useMemo(() =>
    [...new Set(registros.map(r => r.hora_inicio ? r.hora_inicio.substring(0, 5) : '-'))].sort()
  , [registros])

  const cierresUnicos = useMemo(() =>
    [...new Set(registros.map(r => r.hora_cierre ? r.hora_cierre.substring(0, 5) : '-'))].sort()
  , [registros])

  const kmsUnicos = useMemo(() =>
    [...new Set(registros.map(r => r.kilometraje.toLocaleString('es-AR', { maximumFractionDigits: 1 })))].sort((a, b) => parseFloat(a.replace(',', '.')) - parseFloat(b.replace(',', '.')))
  , [registros])

  const gncUnicos = useMemo(() => ['Sí', 'No'], [])
  const lavadoUnicos = useMemo(() => ['Sí', 'No'], [])
  const naftaUnicos = useMemo(() => ['Sí', 'No'], [])

  const estadosUnicos = useMemo(() =>
    [...new Set(registros.map(r => r.estado))].filter(Boolean).sort()
  , [registros])

  // Datos filtrados
  const registrosFiltrados = useMemo(() => {
    return registros.filter(r => {
      if (patenteFilter.length > 0 && !patenteFilter.includes(r.patente.replace(/\s/g, ''))) return false
      if (ibuttonFilter.length > 0 && !ibuttonFilter.includes(r.ibutton || '-')) return false
      if (conductorFilter.length > 0 && !conductorFilter.includes(r.conductor_wialon || '-')) return false
      if (tipoFilter.length > 0 && !tipoFilter.includes(r.tipo_turno || '-')) return false
      if (turnoFilter.length > 0 && !turnoFilter.includes(r.turno_indicador || '-')) return false
      if (inicioFilter.length > 0 && !inicioFilter.includes(r.hora_inicio ? r.hora_inicio.substring(0, 5) : '-')) return false
      if (cierreFilter.length > 0 && !cierreFilter.includes(r.hora_cierre ? r.hora_cierre.substring(0, 5) : '-')) return false
      if (kmFilter.length > 0 && !kmFilter.includes(r.kilometraje.toLocaleString('es-AR', { maximumFractionDigits: 1 }))) return false
      if (gncFilter.length > 0) {
        const gncStr = r.gnc_cargado ? 'Sí' : 'No'
        if (!gncFilter.includes(gncStr)) return false
      }
      if (lavadoFilter.length > 0) {
        const lavadoStr = r.lavado_realizado ? 'Sí' : 'No'
        if (!lavadoFilter.includes(lavadoStr)) return false
      }
      if (naftaFilter.length > 0) {
        const naftaStr = r.nafta_cargada ? 'Sí' : 'No'
        if (!naftaFilter.includes(naftaStr)) return false
      }
      if (estadoFilter.length > 0 && !estadoFilter.includes(r.estado)) return false
      return true
    })
  }, [registros, patenteFilter, ibuttonFilter, conductorFilter, tipoFilter, turnoFilter, inicioFilter, cierreFilter, kmFilter, gncFilter, lavadoFilter, naftaFilter, estadoFilter])

  const handleCheckboxChange = async (
    id: string,
    field: 'gnc_cargado' | 'lavado_realizado' | 'nafta_cargada',
    value: boolean
  ) => {
    setUpdatingId(id)
    try {
      await onChecklistChange(id, field, value)
    } finally {
      setUpdatingId(null)
    }
  }

  const formatTime = (time: string | null) => {
    if (!time) return '-'
    return time.substring(0, 5)
  }

  // Columnas con filtros Excel
  const columns = useMemo<ColumnDef<BitacoraRegistroTransformado, unknown>[]>(() => [
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
        <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
          {row.original.patente.replace(/\s/g, '')}
        </span>
      ),
      enableSorting: false,
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
      cell: ({ row }) => (
        <span style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>
          {row.original.ibutton || '-'}
        </span>
      ),
      enableSorting: false,
    },
    {
      accessorKey: 'conductor_wialon',
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
      cell: ({ row }) => row.original.conductor_wialon || '-',
      enableSorting: false,
    },
    {
      accessorKey: 'tipo_turno',
      header: () => (
        <ExcelColumnFilter
          label="Tipo"
          options={tiposUnicos}
          selectedValues={tipoFilter}
          onSelectionChange={setTipoFilter}
          filterId="tipo"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => {
        const tipo = row.original.tipo_turno
        const badgeClass = tipo === 'CARGO' ? 'dt-badge-solid-blue' : tipo === 'TURNO' ? 'dt-badge-solid-green' : 'dt-badge-gray'
        return <span className={`dt-badge ${badgeClass}`}>{tipo || '-'}</span>
      },
      enableSorting: false,
    },
    {
      accessorKey: 'turno_indicador',
      header: () => (
        <ExcelColumnFilter
          label="Turno"
          options={turnosUnicos}
          selectedValues={turnoFilter}
          onSelectionChange={setTurnoFilter}
          filterId="turno"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => {
        const tipo = row.original.tipo_turno
        const turno = row.original.turno_indicador
        if (tipo !== 'TURNO' || !turno) return <span style={{ color: 'var(--text-tertiary)' }}>-</span>
        const badgeClass = turno === 'Diurno' ? 'dt-badge-yellow' : 'dt-badge-blue'
        return <span className={`dt-badge ${badgeClass}`}>{turno}</span>
      },
      enableSorting: false,
    },
    {
      accessorKey: 'hora_inicio',
      header: () => (
        <ExcelColumnFilter
          label="Inicio"
          options={iniciosUnicos}
          selectedValues={inicioFilter}
          onSelectionChange={setInicioFilter}
          filterId="inicio"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => formatTime(row.original.hora_inicio),
      enableSorting: true,
    },
    {
      accessorKey: 'hora_cierre',
      header: () => (
        <ExcelColumnFilter
          label="Cierre"
          options={cierresUnicos}
          selectedValues={cierreFilter}
          onSelectionChange={setCierreFilter}
          filterId="cierre"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => formatTime(row.original.hora_cierre),
      enableSorting: true,
    },
    {
      accessorKey: 'kilometraje',
      header: () => (
        <ExcelColumnFilter
          label="Km"
          options={kmsUnicos}
          selectedValues={kmFilter}
          onSelectionChange={setKmFilter}
          filterId="km"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => {
        const km = row.original.kilometraje
        const isLow = km < BITACORA_CONSTANTS.POCO_KM_THRESHOLD
        return (
          <span style={{
            fontWeight: 600,
            color: isLow ? 'var(--color-danger)' : 'var(--text-primary)'
          }}>
            {km.toLocaleString('es-AR', { maximumFractionDigits: 1 })}
          </span>
        )
      },
      enableSorting: true,
    },
    {
      id: 'gnc_cargado',
      header: () => (
        <ExcelColumnFilter
          label="GNC"
          options={gncUnicos}
          selectedValues={gncFilter}
          onSelectionChange={setGncFilter}
          filterId="gnc"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => (
        <div style={{ textAlign: 'center' }}>
          <input
            type="checkbox"
            checked={row.original.gnc_cargado}
            onChange={(e) => handleCheckboxChange(row.original.id, 'gnc_cargado', e.target.checked)}
            disabled={updatingId === row.original.id}
            style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--color-primary)' }}
          />
        </div>
      ),
      enableSorting: false,
    },
    {
      id: 'lavado_realizado',
      header: () => (
        <ExcelColumnFilter
          label="Lavado"
          options={lavadoUnicos}
          selectedValues={lavadoFilter}
          onSelectionChange={setLavadoFilter}
          filterId="lavado"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => (
        <div style={{ textAlign: 'center' }}>
          <input
            type="checkbox"
            checked={row.original.lavado_realizado}
            onChange={(e) => handleCheckboxChange(row.original.id, 'lavado_realizado', e.target.checked)}
            disabled={updatingId === row.original.id}
            style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--color-primary)' }}
          />
        </div>
      ),
      enableSorting: false,
    },
    {
      id: 'nafta_cargada',
      header: () => (
        <ExcelColumnFilter
          label="Nafta"
          options={naftaUnicos}
          selectedValues={naftaFilter}
          onSelectionChange={setNaftaFilter}
          filterId="nafta"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => (
        <div style={{ textAlign: 'center' }}>
          <input
            type="checkbox"
            checked={row.original.nafta_cargada}
            onChange={(e) => handleCheckboxChange(row.original.id, 'nafta_cargada', e.target.checked)}
            disabled={updatingId === row.original.id}
            style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--color-primary)' }}
          />
        </div>
      ),
      enableSorting: false,
    },
    {
      accessorKey: 'estado',
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
        const estado = row.original.estado
        let badgeClass = 'dt-badge-gray'
        if (estado === 'Turno Finalizado') badgeClass = 'dt-badge-green'
        else if (estado === 'Poco Km') badgeClass = 'dt-badge-red'
        else if (estado === 'En Curso') badgeClass = 'dt-badge-blue'
        return <div style={{ textAlign: 'center' }}><span className={`dt-badge ${badgeClass}`}>{estado}</span></div>
      },
      enableSorting: false,
    },
  ], [
    patentesUnicas, patenteFilter,
    ibuttonsUnicos, ibuttonFilter,
    conductoresUnicos, conductorFilter,
    tiposUnicos, tipoFilter,
    turnosUnicos, turnoFilter,
    iniciosUnicos, inicioFilter,
    cierresUnicos, cierreFilter,
    kmsUnicos, kmFilter,
    gncUnicos, gncFilter,
    lavadoUnicos, lavadoFilter,
    naftaUnicos, naftaFilter,
    estadosUnicos, estadoFilter,
    openFilterId, updatingId,
  ])

  // Mostrar paginación manual porque es del servidor
  const paginationControls = (
    <div className="dt-pagination" style={{ borderTop: 'none', background: 'transparent', padding: '12px 0' }}>
      <div className="dt-pagination-info">
        Mostrando {((page - 1) * pageSize) + 1}-{Math.min(page * pageSize, totalCount)} de {totalCount.toLocaleString()} registros
      </div>
      <div className="dt-pagination-controls">
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="dt-pagination-select"
        >
          {BITACORA_CONSTANTS.PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>{size} por página</option>
          ))}
        </select>
        <button onClick={() => onPageChange(1)} disabled={page === 1 || isLoading} className="dt-pagination-btn">
          <ChevronsLeft size={14} />
        </button>
        <button onClick={() => onPageChange(page - 1)} disabled={page === 1 || isLoading} className="dt-pagination-btn">
          <ChevronLeft size={14} />
        </button>
        <span className="dt-pagination-text">Página {page} de {totalPages || 1}</span>
        <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages || isLoading} className="dt-pagination-btn">
          <ChevronRight size={14} />
        </button>
        <button onClick={() => onPageChange(totalPages)} disabled={page >= totalPages || isLoading} className="dt-pagination-btn">
          <ChevronsRight size={14} />
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Toolbar con búsqueda y controles */}
      <div className="dt-header-bar">
        <div className="dt-search-wrapper">
          <Search size={18} className="dt-search-icon" />
          <input
            type="text"
            placeholder="Buscar por patente o conductor..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="dt-search-input"
          />
        </div>
        {headerControls}
        <span style={{ color: 'var(--text-secondary)', fontSize: '13px', whiteSpace: 'nowrap' }}>
          {totalCount.toLocaleString()} registros
        </span>
      </div>

      {/* DataTable sin búsqueda interna ni paginación interna */}
      <DataTable
        data={registrosFiltrados}
        columns={columns}
        loading={isLoading}
        showSearch={false}
        showPagination={false}
        emptyIcon={<ClipboardList size={48} />}
        emptyTitle="Sin registros"
        emptyDescription="No hay registros de bitácora para mostrar"
        pageSize={pageSize}
      />

      {/* Paginación manual del servidor */}
      {registrosFiltrados.length > 0 && paginationControls}
    </div>
  )
}
