// src/modules/integraciones/uss/bitacora/components/BitacoraTable.tsx
/**
 * Tabla de bitácora usando DataTable con filtros Excel
 * + vista agrupada por conductor con resumen
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useMemo, useRef, useEffect } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../../../../../components/ui/DataTable/DataTable'
import { ExcelColumnFilter, useExcelFilters } from '../../../../../components/ui/DataTable/ExcelColumnFilter'
import { Search, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, ClipboardList, Download, ChevronDown, Users } from 'lucide-react'
import type { BitacoraRegistroTransformado } from '../../../../../services/wialonBitacoraService'
import { BITACORA_CONSTANTS } from '../constants/bitacora.constants'
import { normalizePatente } from '../../../../../utils/normalizeDocuments'
import * as XLSX from 'xlsx'

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
  const [vistaAgrupada, setVistaAgrupada] = useState(false)
  const totalPages = Math.ceil(totalCount / pageSize)

  // Estados para filtros Excel
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
    [...new Set(registros.map(r => normalizePatente(r.patente)))].filter(Boolean).sort()
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

  // Datos filtrados y ordenados alfabéticamente por conductor
  const registrosFiltrados = useMemo(() => {
    const filtered = registros.filter(r => {
      if (patenteFilter.length > 0 && !patenteFilter.includes(normalizePatente(r.patente))) return false
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
    // Ordenar alfabéticamente por conductor, luego por hora_inicio desc
    filtered.sort((a, b) => {
      const ca = (a.conductor_wialon || '').toLowerCase()
      const cb = (b.conductor_wialon || '').toLowerCase()
      if (ca < cb) return -1
      if (ca > cb) return 1
      // Mismo conductor: ordenar por hora_inicio desc
      return (b.hora_inicio || '').localeCompare(a.hora_inicio || '')
    })
    return filtered
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

  const formatDateTime = (fecha: string, time: string | null) => {
    if (!time) return '-'
    const d = new Date(fecha + 'T00:00:00')
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    return `${dd}/${mm} ${time.substring(0, 5)}`
  }

  // ====== COLUMNAS ======
  const columns = useMemo<ColumnDef<BitacoraRegistroTransformado, unknown>[]>(() => [
    {
      accessorKey: 'patente',
      header: () => (
        <ExcelColumnFilter label="Patente" options={patentesUnicas} selectedValues={patenteFilter}
          onSelectionChange={setPatenteFilter} filterId="patente" openFilterId={openFilterId} onOpenChange={setOpenFilterId} />
      ),
      cell: ({ row }) => (
        <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
          {normalizePatente(row.original.patente)}
        </span>
      ),
      enableSorting: false,
    },
    {
      accessorKey: 'ibutton',
      header: () => (
        <ExcelColumnFilter label="iButton" options={ibuttonsUnicos} selectedValues={ibuttonFilter}
          onSelectionChange={setIbuttonFilter} filterId="ibutton" openFilterId={openFilterId} onOpenChange={setOpenFilterId} />
      ),
      cell: ({ row }) => (
        <span style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>{row.original.ibutton || '-'}</span>
      ),
      enableSorting: false,
    },
    {
      accessorKey: 'conductor_wialon',
      header: () => (
        <ExcelColumnFilter label="Conductor" options={conductoresUnicos} selectedValues={conductorFilter}
          onSelectionChange={setConductorFilter} filterId="conductor" openFilterId={openFilterId} onOpenChange={setOpenFilterId} />
      ),
      cell: ({ row }) => row.original.conductor_wialon || '-',
      enableSorting: false,
    },
    {
      accessorKey: 'tipo_turno',
      header: () => (
        <ExcelColumnFilter label="Tipo" options={tiposUnicos} selectedValues={tipoFilter}
          onSelectionChange={setTipoFilter} filterId="tipo" openFilterId={openFilterId} onOpenChange={setOpenFilterId} />
      ),
      cell: ({ row }) => {
        const tipo = row.original.tipo_turno
        const badgeClass = tipo === 'a_cargo' ? 'dt-badge-solid-blue' : tipo === 'turno' ? 'dt-badge-solid-green' : 'dt-badge-gray'
        return <span className={`dt-badge ${badgeClass}`}>{tipo || '-'}</span>
      },
      enableSorting: false,
    },
    {
      accessorKey: 'turno_indicador',
      header: () => (
        <ExcelColumnFilter label="Turno" options={turnosUnicos} selectedValues={turnoFilter}
          onSelectionChange={setTurnoFilter} filterId="turno" openFilterId={openFilterId} onOpenChange={setOpenFilterId} />
      ),
      cell: ({ row }) => {
        const tipo = row.original.tipo_turno
        const turno = row.original.turno_indicador
        if (tipo !== 'turno' || !turno) return <span style={{ color: 'var(--text-tertiary)' }}>-</span>
        const badgeClass = turno === 'Diurno' ? 'dt-badge-yellow' : 'dt-badge-blue'
        return <span className={`dt-badge ${badgeClass}`}>{turno}</span>
      },
      enableSorting: false,
    },
    {
      accessorKey: 'hora_inicio',
      header: () => (
        <ExcelColumnFilter label="Inicio" options={iniciosUnicos} selectedValues={inicioFilter}
          onSelectionChange={setInicioFilter} filterId="inicio" openFilterId={openFilterId} onOpenChange={setOpenFilterId} />
      ),
      cell: ({ row }) => formatDateTime(row.original.fecha_turno, row.original.hora_inicio),
      enableSorting: true,
    },
    {
      accessorKey: 'hora_cierre',
      header: () => (
        <ExcelColumnFilter label="Cierre" options={cierresUnicos} selectedValues={cierreFilter}
          onSelectionChange={setCierreFilter} filterId="cierre" openFilterId={openFilterId} onOpenChange={setOpenFilterId} />
      ),
      cell: ({ row }) => formatDateTime(row.original.fecha_turno, row.original.hora_cierre),
      enableSorting: true,
    },
    {
      accessorKey: 'kilometraje',
      header: () => (
        <ExcelColumnFilter label="Km" options={kmsUnicos} selectedValues={kmFilter}
          onSelectionChange={setKmFilter} filterId="km" openFilterId={openFilterId} onOpenChange={setOpenFilterId} />
      ),
      cell: ({ row }) => {
        const km = row.original.kilometraje
        const isLow = km < BITACORA_CONSTANTS.POCO_KM_THRESHOLD
        return (
          <span style={{ fontWeight: 600, color: isLow ? 'var(--color-danger)' : 'var(--text-primary)' }}>
            {km.toLocaleString('es-AR', { maximumFractionDigits: 1 })}
          </span>
        )
      },
      enableSorting: true,
    },
    {
      id: 'gnc_cargado',
      header: () => (
        <ExcelColumnFilter label="GNC" options={gncUnicos} selectedValues={gncFilter}
          onSelectionChange={setGncFilter} filterId="gnc" openFilterId={openFilterId} onOpenChange={setOpenFilterId} />
      ),
      cell: ({ row }) => (
        <div style={{ textAlign: 'center' }}>
          <input type="checkbox" checked={row.original.gnc_cargado}
            onChange={(e) => handleCheckboxChange(row.original.id, 'gnc_cargado', e.target.checked)}
            disabled={updatingId === row.original.id}
            style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--color-primary)' }} />
        </div>
      ),
      enableSorting: false,
    },
    {
      id: 'lavado_realizado',
      header: () => (
        <ExcelColumnFilter label="Lavado" options={lavadoUnicos} selectedValues={lavadoFilter}
          onSelectionChange={setLavadoFilter} filterId="lavado" openFilterId={openFilterId} onOpenChange={setOpenFilterId} />
      ),
      cell: ({ row }) => (
        <div style={{ textAlign: 'center' }}>
          <input type="checkbox" checked={row.original.lavado_realizado}
            onChange={(e) => handleCheckboxChange(row.original.id, 'lavado_realizado', e.target.checked)}
            disabled={updatingId === row.original.id}
            style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--color-primary)' }} />
        </div>
      ),
      enableSorting: false,
    },
    {
      id: 'nafta_cargada',
      header: () => (
        <ExcelColumnFilter label="Nafta" options={naftaUnicos} selectedValues={naftaFilter}
          onSelectionChange={setNaftaFilter} filterId="nafta" openFilterId={openFilterId} onOpenChange={setOpenFilterId} />
      ),
      cell: ({ row }) => (
        <div style={{ textAlign: 'center' }}>
          <input type="checkbox" checked={row.original.nafta_cargada}
            onChange={(e) => handleCheckboxChange(row.original.id, 'nafta_cargada', e.target.checked)}
            disabled={updatingId === row.original.id}
            style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--color-primary)' }} />
        </div>
      ),
      enableSorting: false,
    },
    {
      accessorKey: 'estado',
      header: () => (
        <ExcelColumnFilter label="Estado" options={estadosUnicos} selectedValues={estadoFilter}
          onSelectionChange={setEstadoFilter} filterId="estado" openFilterId={openFilterId} onOpenChange={setOpenFilterId} />
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
    patentesUnicas, patenteFilter, ibuttonsUnicos, ibuttonFilter,
    conductoresUnicos, conductorFilter, tiposUnicos, tipoFilter,
    turnosUnicos, turnoFilter, iniciosUnicos, inicioFilter,
    cierresUnicos, cierreFilter, kmsUnicos, kmFilter,
    gncUnicos, gncFilter, lavadoUnicos, lavadoFilter,
    naftaUnicos, naftaFilter, estadosUnicos, estadoFilter,
    openFilterId, updatingId,
  ])

  // ====== VISTA AGRUPADA POR CONDUCTOR ======
  // Ordenar registros por conductor, luego por hora_inicio desc
  const registrosAgrupados = useMemo(() => {
    if (!vistaAgrupada) return registrosFiltrados

    const map = new Map<string, BitacoraRegistroTransformado[]>()
    for (const r of registrosFiltrados) {
      const key = r.conductor_wialon || 'Sin conductor'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(r)
    }

    // Ordenar conductores alfabéticamente
    const sorted = [...map.entries()].sort((a, b) =>
      a[0].toLowerCase().localeCompare(b[0].toLowerCase())
    )

    // Aplanar: registros del conductor + fila resumen
    const result: BitacoraRegistroTransformado[] = []
    for (const [conductor, regs] of sorted) {
      // Ordenar registros de este conductor por hora desc
      regs.sort((a, b) => (b.hora_inicio || '').localeCompare(a.hora_inicio || ''))
      result.push(...regs)

      // Fila resumen (fake row)
      if (regs.length > 1) {
        const kmTotal = regs.reduce((sum, r) => sum + r.kilometraje, 0)
        // Cruce con asignaciones: extraer tipo_turno y turno_indicador de los registros
        const tipoTurno = regs.find(r => r.tipo_turno)?.tipo_turno || null
        const turnoInd = regs.find(r => r.turno_indicador)?.turno_indicador || null
        // Patentes únicas del conductor
        const patentesUnicas = [...new Set(regs.map(r => normalizePatente(r.patente)).filter(Boolean))]
        result.push({
          id: `__resumen__${conductor}`,
          patente: patentesUnicas.join(', '),
          patente_normalizada: '',
          conductor_wialon: conductor,
          conductor_id: null,
          ibutton: null,
          fecha_turno: regs[0].fecha_turno,
          hora_inicio: null,
          hora_cierre: null,
          duracion_minutos: null,
          kilometraje: kmTotal,
          observaciones: `RESUMEN|${regs.length}|${tipoTurno || ''}|${turnoInd || ''}`,
          estado: '',
          gnc_cargado: false,
          lavado_realizado: false,
          nafta_cargada: false,
          tipo_turno: tipoTurno,
          turno_indicador: turnoInd,
        } as BitacoraRegistroTransformado)
      }
    }
    return result
  }, [registrosFiltrados, vistaAgrupada])

  // Columnas para vista agrupada (override algunas celdas para filas resumen)
  const columnsAgrupadas = useMemo<ColumnDef<BitacoraRegistroTransformado, unknown>[]>(() => {
    return columns.map((col) => {
      const colCopy = { ...col }
      const key = (col as any).accessorKey || (col as any).id || ''

      if (key === 'patente') {
        colCopy.cell = ({ row }: any) => {
          if (row.original.id.startsWith('__resumen__')) {
            // Mostrar patentes del conductor en el resumen
            const patentes = row.original.patente
            if (!patentes) return null
            return (
              <span style={{ fontWeight: 600, fontSize: '11px', color: 'var(--text-secondary)' }}>
                {patentes}
              </span>
            )
          }
          return (
            <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
              {normalizePatente(row.original.patente)}
            </span>
          )
        }
      }

      if (key === 'conductor_wialon') {
        colCopy.cell = ({ row }: any) => {
          if (row.original.id.startsWith('__resumen__')) {
            const parts = (row.original.observaciones || '').split('|')
            const count = parts[1] || '?'
            const tipoTurno = parts[2] || ''
            const turnoInd = parts[3] || ''
            // Construir etiqueta de asignación
            let asignacionLabel = 'Sin asignación'
            if (tipoTurno === 'turno') {
              asignacionLabel = turnoInd ? `TURNO ${turnoInd}` : 'TURNO'
            } else if (tipoTurno === 'a_cargo') {
              asignacionLabel = 'A CARGO'
            } else if (tipoTurno) {
              asignacionLabel = tipoTurno
            }
            return (
              <span style={{ fontWeight: 700, fontSize: '12px', color: 'var(--text-primary)' }}>
                RESUMEN {row.original.conductor_wialon}
                <span style={{ marginLeft: '6px', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, background: tipoTurno ? 'var(--color-primary)' : 'var(--color-warning, #f59e0b)', color: '#fff' }}>
                  {asignacionLabel}
                </span>
                <span style={{ marginLeft: '6px', color: 'var(--text-tertiary)', fontWeight: 500 }}>
                  {count} sub-viajes
                </span>
              </span>
            )
          }
          return row.original.conductor_wialon || '-'
        }
      }

      if (key === 'kilometraje') {
        colCopy.cell = ({ row }: any) => {
          const km = row.original.kilometraje
          if (row.original.id.startsWith('__resumen__')) {
            return (
              <span style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text-primary)' }}>
                {km.toLocaleString('es-AR', { maximumFractionDigits: 1 })} km
              </span>
            )
          }
          const isLow = km < BITACORA_CONSTANTS.POCO_KM_THRESHOLD
          return (
            <span style={{ fontWeight: 600, color: isLow ? 'var(--color-danger)' : 'var(--text-primary)' }}>
              {km.toLocaleString('es-AR', { maximumFractionDigits: 1 })}
            </span>
          )
        }
      }

      // Para tipo_turno en resumen: mostrar badge de asignación
      if (key === 'tipo_turno') {
        colCopy.cell = ({ row }: any) => {
          if (row.original.id.startsWith('__resumen__')) {
            const tipo = row.original.tipo_turno
            if (!tipo) return <span className="dt-badge dt-badge-gray">Sin asig.</span>
            const label = tipo === 'a_cargo' ? 'A CARGO' : tipo
            const badgeClass = label === 'A CARGO' ? 'dt-badge-solid-blue' : tipo === 'turno' ? 'dt-badge-solid-green' : 'dt-badge-gray'
            return <span className={`dt-badge ${badgeClass}`}>{label}</span>
          }
          const tipo = row.original.tipo_turno
          const badgeClass = tipo === 'a_cargo' ? 'dt-badge-solid-blue' : tipo === 'turno' ? 'dt-badge-solid-green' : 'dt-badge-gray'
          return <span className={`dt-badge ${badgeClass}`}>{tipo || '-'}</span>
        }
      }

      // Para turno_indicador en resumen: mostrar Diurno/Nocturno
      if (key === 'turno_indicador') {
        colCopy.cell = ({ row }: any) => {
          if (row.original.id.startsWith('__resumen__')) {
            const turno = row.original.turno_indicador
            if (!turno || row.original.tipo_turno !== 'turno') return <span style={{ color: 'var(--text-tertiary)' }}>-</span>
            const badgeClass = turno === 'Diurno' ? 'dt-badge-yellow' : 'dt-badge-blue'
            return <span className={`dt-badge ${badgeClass}`}>{turno}</span>
          }
          const tipo = row.original.tipo_turno
          const turno = row.original.turno_indicador
          if (tipo !== 'turno' || !turno) return <span style={{ color: 'var(--text-tertiary)' }}>-</span>
          const badgeClass = turno === 'Diurno' ? 'dt-badge-yellow' : 'dt-badge-blue'
          return <span className={`dt-badge ${badgeClass}`}>{turno}</span>
        }
      }

      // Para filas resumen, vaciar celdas irrelevantes
      const emptyForResumen = ['ibutton', 'hora_inicio', 'hora_cierre', 'estado']
      if (emptyForResumen.includes((col as any).accessorKey || '') || emptyForResumen.includes((col as any).id || '')) {
        const originalCell = colCopy.cell
        colCopy.cell = (props: any) => {
          if (props.row.original.id.startsWith('__resumen__')) return null
          return typeof originalCell === 'function' ? originalCell(props) : null
        }
      }

      // Checkboxes: vaciar para resumen
      if (['gnc_cargado', 'lavado_realizado', 'nafta_cargada'].includes((col as any).id || '')) {
        const originalCell = colCopy.cell
        colCopy.cell = (props: any) => {
          if (props.row.original.id.startsWith('__resumen__')) return null
          return typeof originalCell === 'function' ? originalCell(props) : null
        }
      }

      return colCopy
    })
  }, [columns])

  // ====== PAGINACION ======
  const paginationControls = (
    <div className="dt-pagination" style={{ borderTop: 'none', background: 'transparent', padding: '12px 0' }}>
      <div className="dt-pagination-info">
        Mostrando {((page - 1) * pageSize) + 1}-{Math.min(page * pageSize, totalCount)} de {totalCount.toLocaleString()} registros
      </div>
      <div className="dt-pagination-controls">
        <select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))} className="dt-pagination-select">
          {BITACORA_CONSTANTS.PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>{size} por página</option>
          ))}
        </select>
        <button onClick={() => onPageChange(1)} disabled={page === 1 || isLoading} className="dt-pagination-btn"><ChevronsLeft size={14} /></button>
        <button onClick={() => onPageChange(page - 1)} disabled={page === 1 || isLoading} className="dt-pagination-btn"><ChevronLeft size={14} /></button>
        <span className="dt-pagination-text">Página {page} de {totalPages || 1}</span>
        <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages || isLoading} className="dt-pagination-btn"><ChevronRight size={14} /></button>
        <button onClick={() => onPageChange(totalPages)} disabled={page >= totalPages || isLoading} className="dt-pagination-btn"><ChevronsRight size={14} /></button>
      </div>
    </div>
  )

  // ====== EXPORTAR ======
  const [showExportMenu, setShowExportMenu] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showExportMenu) return
    const handleClick = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setShowExportMenu(false)
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [showExportMenu])

  function getExportData() {
    return registrosFiltrados.map((r) => ({
      'Patente': normalizePatente(r.patente),
      'iButton': r.ibutton || '',
      'Conductor': r.conductor_wialon || '',
      'Tipo': r.tipo_turno || '',
      'Turno': r.turno_indicador || '',
      'Inicio': formatDateTime(r.fecha_turno, r.hora_inicio),
      'Cierre': formatDateTime(r.fecha_turno, r.hora_cierre),
      'Km': r.kilometraje,
      'GNC': r.gnc_cargado ? 'Si' : 'No',
      'Lavado': r.lavado_realizado ? 'Si' : 'No',
      'Nafta': r.nafta_cargada ? 'Si' : 'No',
      'Estado': r.estado,
    }))
  }

  function exportarExcel() {
    const data = getExportData()
    if (data.length === 0) return
    const ws = XLSX.utils.json_to_sheet(data)
    ws['!cols'] = [
      { wch: 10 }, { wch: 8 }, { wch: 35 }, { wch: 8 }, { wch: 10 },
      { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 6 }, { wch: 8 },
      { wch: 6 }, { wch: 16 },
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Bitacora')
    XLSX.writeFile(wb, `Bitacora_${new Date().toISOString().slice(0, 10)}.xlsx`)
    setShowExportMenu(false)
  }

  function exportarCSV() {
    const data = getExportData()
    if (data.length === 0) return
    const ws = XLSX.utils.json_to_sheet(data)
    const csv = XLSX.utils.sheet_to_csv(ws)
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Bitacora_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setShowExportMenu(false)
  }

  function exportarPDF() {
    const data = getExportData()
    if (data.length === 0) return
    const headers = Object.keys(data[0])
    const headerRow = headers.map(h => `<th style="padding:4px 6px;border:1px solid #ddd;background:#f5f5f5;font-size:10px;white-space:nowrap;">${h}</th>`).join('')
    const bodyRows = data.map(row =>
      '<tr>' + headers.map(h => `<td style="padding:3px 6px;border:1px solid #ddd;font-size:9px;white-space:nowrap;">${(row as Record<string, unknown>)[h] ?? ''}</td>`).join('') + '</tr>'
    ).join('')
    const html = `<html><head><title>Bitacora</title></head><body>
      <h3 style="font-family:sans-serif;margin-bottom:8px;">Bitacora - ${new Date().toLocaleDateString('es-AR')}</h3>
      <table style="border-collapse:collapse;font-family:sans-serif;">
        <thead><tr>${headerRow}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table></body></html>`
    const win = window.open('', '_blank')
    if (win) { win.document.write(html); win.document.close(); win.print() }
    setShowExportMenu(false)
  }

  // ====== RENDER ======
  const dataToShow = vistaAgrupada ? registrosAgrupados : registrosFiltrados
  const activeColumns = vistaAgrupada ? columnsAgrupadas : columns

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Toolbar */}
      <div className="dt-header-bar">
        <div className="dt-search-wrapper">
          <Search size={18} className="dt-search-icon" />
          <input type="text" placeholder="Buscar por patente o conductor..." value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)} className="dt-search-input" />
        </div>
        {headerControls}

        {/* Toggle vista agrupada */}
        <button
          onClick={() => setVistaAgrupada(!vistaAgrupada)}
          title={vistaAgrupada ? 'Vista normal' : 'Agrupar por conductor'}
          style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            padding: '6px 10px', fontSize: '13px', fontWeight: 500,
            border: '1px solid var(--border-color)', borderRadius: '6px',
            background: vistaAgrupada ? 'var(--color-primary)' : 'var(--bg-primary)',
            color: vistaAgrupada ? '#fff' : 'var(--text-secondary)',
            cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          <Users size={14} /> Turnos
        </button>

        {/* Exportar dropdown */}
        <div ref={exportRef} style={{ position: 'relative' }}>
          <button onClick={() => setShowExportMenu(!showExportMenu)} disabled={registrosFiltrados.length === 0}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '6px 10px', fontSize: '13px', fontWeight: 500,
              border: '1px solid var(--border-color)', borderRadius: '6px',
              background: 'var(--bg-primary)', color: 'var(--text-secondary)',
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
            <Download size={14} /> Exportar <ChevronDown size={12} />
          </button>
          {showExportMenu && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, marginTop: '4px',
              background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
              borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              zIndex: 50, minWidth: '140px', overflow: 'hidden',
            }}>
              {[
                { fn: exportarExcel, label: 'Excel (.xlsx)' },
                { fn: exportarCSV, label: 'CSV (.csv)' },
                { fn: exportarPDF, label: 'PDF (imprimir)' },
              ].map(({ fn, label }) => (
                <button key={label} onClick={fn} style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 12px', fontSize: '13px', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-primary)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <span style={{ color: 'var(--text-secondary)', fontSize: '13px', whiteSpace: 'nowrap' }}>
          {totalCount.toLocaleString()} registros
        </span>
      </div>

      {/* DataTable */}
      <DataTable
        data={dataToShow}
        columns={activeColumns}
        loading={isLoading}
        showSearch={false}
        showPagination={false}
        emptyIcon={<ClipboardList size={48}
      />}
        emptyTitle="Sin registros"
        emptyDescription="No hay registros de bitácora para mostrar"
        pageSize={999}
      />

      {/* Paginación */}
      {!vistaAgrupada && registrosFiltrados.length > 0 && paginationControls}
    </div>
  )
}
