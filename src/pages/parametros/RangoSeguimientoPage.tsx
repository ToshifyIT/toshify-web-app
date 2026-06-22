import { useState, useEffect, useRef, useLayoutEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../../lib/supabase'
import Swal from 'sweetalert2'
import { showSuccess } from '../../utils/toast'
import { Plus, Edit2, Trash2 } from 'lucide-react'
import { type ColumnDef, type Table, type FilterFn } from '@tanstack/react-table'
import { DataTable } from '../../components/ui/DataTable'

interface RangoSeguimiento {
  id: number
  created_at: string
  rango_nombre: string
  sub_rango_nombre: string | null
  color: string
  desde: number | null
  hasta: number | null
  gnc: boolean
}

interface NumericFilter {
  min?: number
  max?: number
}

const FilterIcon = () => (
  <svg width={12} height={12} viewBox="0 0 8 6" fill="currentColor">
    <path d="M0.5 0.5L4 5L7.5 0.5H0.5Z" />
  </svg>
)

// Componente de filtro numérico completamente autónomo.
// Gestiona su propio estado (open, min, max) para que no se resetee
// cuando el padre actualiza el filtro y el DataTable re-renderiza.
function NumericRangeFilter({
  label,
  onChange,
}: {
  label: string
  onChange: (v: NumericFilter) => void
}) {
  const [open, setOpen] = useState(false)
  const [min, setMin] = useState<string>('')
  const [max, setMax] = useState<string>('')
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  const hasFilter = min !== '' || max !== ''

  const handleMinChange = (val: string) => {
    setMin(val)
    onChange({
      min: val === '' ? undefined : Number(val),
      max: max === '' ? undefined : Number(max),
    })
  }

  const handleMaxChange = (val: string) => {
    setMax(val)
    onChange({
      min: min === '' ? undefined : Number(min),
      max: val === '' ? undefined : Number(val),
    })
  }

  const handleClear = () => {
    setMin('')
    setMax('')
    onChange({})
  }

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    const dropW = dropRef.current?.getBoundingClientRect().width || 220
    const vw = window.innerWidth
    let left = rect.left
    let top = rect.bottom + 4
    if (left + dropW > vw - 8) left = Math.max(8, vw - dropW - 8)
    if (top + 160 > window.innerHeight) top = rect.top - 164
    setPosition({ top, left })
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (
        dropRef.current && !dropRef.current.contains(t) &&
        btnRef.current && !btnRef.current.contains(t)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div className="dt-filter-header">
      <span className="dt-filter-label">{label}</span>
      <button
        ref={btnRef}
        type="button"
        className={`dt-filter-btn ${hasFilter ? 'active' : ''}`}
        onClick={e => { e.stopPropagation(); setOpen(p => !p) }}
        title={`Filtrar por ${label}`}
      >
        <FilterIcon />
      </button>
      {open && createPortal(
        <div
          ref={dropRef}
          className="dt-filter-dropdown"
          style={{ position: 'fixed', top: position.top, left: position.left, zIndex: 9999 }}
          onClick={e => e.stopPropagation()}
        >
          <div className="dt-filter-number-range">
            <div className="dt-filter-number-row">
              <label className="dt-filter-number-label">
                <span>Desde ($)</span>
                <input
                  type="number"
                  placeholder="0"
                  value={min}
                  onChange={e => handleMinChange(e.target.value)}
                  className="dt-filter-number-input"
                  style={{ width: '100%' }}
                />
              </label>
              <label className="dt-filter-number-label">
                <span>Hasta ($)</span>
                <input
                  type="number"
                  placeholder="0"
                  value={max}
                  onChange={e => handleMaxChange(e.target.value)}
                  className="dt-filter-number-input"
                  style={{ width: '100%' }}
                />
              </label>
            </div>
          </div>
          {hasFilter && (
            <button type="button" className="dt-filter-clear" onClick={handleClear}>
              Limpiar filtro
            </button>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}

const COLOR_OPTIONS = [
  { value: 'VERDE', label: 'Verde', hex: '#22c55e' },
  { value: 'AMARILLO', label: 'Amarillo', hex: '#eab308' },
  { value: 'ROJO', label: 'Rojo', hex: '#ef4444' },
]

const getColorHex = (color: string): string =>
  COLOR_OPTIONS.find(c => c.value === color)?.hex || '#6b7280'

const formatCurrency = (value: number | null): string => {
  if (value === null || value === undefined) return 'Sin límite'
  return `$ ${value.toLocaleString('es-AR')}`
}

// FilterFn para columnas numéricas con rango
const numericRangeFilter: FilterFn<RangoSeguimiento> = (row, columnId, filterValue: NumericFilter) => {
  if (!filterValue || (filterValue.min === undefined && filterValue.max === undefined)) return true
  const raw = row.getValue<number | null>(columnId)
  const val = raw ?? (columnId === 'hasta' ? Infinity : 0)
  if (filterValue.min !== undefined && val < filterValue.min) return false
  if (filterValue.max !== undefined && val > filterValue.max) return false
  return true
}
numericRangeFilter.autoRemove = (val: unknown) =>
  !val || ((val as NumericFilter).min === undefined && (val as NumericFilter).max === undefined)

export function RangoSeguimientoPage() {
  const [rangos, setRangos] = useState<RangoSeguimiento[]>([])
  const [loading, setLoading] = useState(true)
  const tableRef = useRef<Table<RangoSeguimiento> | null>(null)

  useEffect(() => {
    cargarRangos()
  }, [])

  async function cargarRangos() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('guias_seguimiento')
        .select('*')
        .order('desde', { ascending: false })
      if (error) throw error
      setRangos(data || [])
    } catch {
      // silently ignored
    } finally {
      setLoading(false)
    }
  }

  // Callbacks estables — no cambian entre renders
  const handleDesdeChange = useCallback((v: NumericFilter) => {
    tableRef.current?.getColumn('desde')?.setFilterValue(
      v.min === undefined && v.max === undefined ? undefined : v
    )
  }, [])

  const handleHastaChange = useCallback((v: NumericFilter) => {
    tableRef.current?.getColumn('hasta')?.setFilterValue(
      v.min === undefined && v.max === undefined ? undefined : v
    )
  }, [])

  const handleTableReady = useCallback((table: Table<RangoSeguimiento>) => {
    tableRef.current = table
  }, [])

  async function crearRango() {
    const colorOptions = COLOR_OPTIONS.map(c =>
      `<option value="${c.value}">${c.label}</option>`
    ).join('')
    const turnoOptions = [
      { value: '', label: 'Todos los turnos' },
      { value: 'DIURNO', label: 'Diurno' },
      { value: 'NOCTURNO', label: 'Nocturno' },
      { value: 'CARGO', label: 'A Cargo' },
    ].map(t => `<option value="${t.value}">${t.label}</option>`).join('')

    const gncOptions = [
      { value: 'true', label: 'Con GNC' },
      { value: 'false', label: 'Sin GNC' },
    ].map(g => `<option value="${g.value}">${g.label}</option>`).join('')

    const { value: formValues } = await Swal.fire({
      title: 'Nuevo Rango de Seguimiento',
      html: `
        <div style="display:flex;flex-direction:column;gap:12px;text-align:left;">
          <div>
            <label style="font-size:13px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">Nombre del Rango</label>
            <input id="swal-nombre" class="swal2-input" placeholder="Ej: SEMANAL" style="margin:0;width:100%;box-sizing:border-box;">
          </div>
          <div>
            <label style="font-size:13px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">Color</label>
            <select id="swal-color" class="swal2-select" style="margin:0;width:100%;box-sizing:border-box;">
              ${colorOptions}
            </select>
          </div>
          <div style="display:flex;gap:12px;">
            <div style="flex:1;">
              <label style="font-size:13px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">Turno</label>
              <select id="swal-turno" class="swal2-select" style="margin:0;width:100%;box-sizing:border-box;">
                ${turnoOptions}
              </select>
            </div>
            <div style="flex:1;">
              <label style="font-size:13px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">GNC</label>
              <select id="swal-gnc" class="swal2-select" style="margin:0;width:100%;box-sizing:border-box;">
                ${gncOptions}
              </select>
            </div>
          </div>
          <div style="display:flex;gap:12px;">
            <div style="flex:1;">
              <label style="font-size:13px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">Desde ($)</label>
              <input id="swal-desde" type="number" class="swal2-input" placeholder="0" style="margin:0;width:100%;box-sizing:border-box;">
            </div>
            <div style="flex:1;">
              <label style="font-size:13px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">Hasta ($)</label>
              <input id="swal-hasta" type="number" class="swal2-input" placeholder="Dejar vacío = sin límite" style="margin:0;width:100%;box-sizing:border-box;">
            </div>
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Crear',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#ef4444',
      preConfirm: () => {
        const nombre = (document.getElementById('swal-nombre') as HTMLInputElement).value.trim().toUpperCase()
        const color = (document.getElementById('swal-color') as HTMLSelectElement).value
        const turno = (document.getElementById('swal-turno') as HTMLSelectElement).value
        const gncVal = (document.getElementById('swal-gnc') as HTMLSelectElement).value
        const desde = (document.getElementById('swal-desde') as HTMLInputElement).value
        const hasta = (document.getElementById('swal-hasta') as HTMLInputElement).value
        if (!nombre) { Swal.showValidationMessage('El nombre es obligatorio'); return false }
        if (desde === '') { Swal.showValidationMessage('El valor "Desde" es obligatorio'); return false }
        return {
          rango_nombre: nombre,
          color,
          sub_rango_nombre: turno ? turno.toUpperCase() : null,
          gnc: gncVal === 'true',
          desde: parseInt(desde),
          hasta: hasta ? parseInt(hasta) : null,
        }
      }
    })

    if (!formValues) return
    try {
      const { error } = await supabase.from('guias_seguimiento').insert(formValues)
      if (error) throw error
      showSuccess('Rango creado correctamente')
      cargarRangos()
    } catch {
      Swal.fire('Error', 'No se pudo crear el rango', 'error')
    }
  }

  async function editarRango(rango: RangoSeguimiento) {
    const colorOptions = COLOR_OPTIONS.map(c =>
      `<option value="${c.value}" ${c.value === rango.color ? 'selected' : ''}>${c.label}</option>`
    ).join('')
    const turnoOptions = [
      { value: '', label: 'Todos los turnos' },
      { value: 'DIURNO', label: 'Diurno' },
      { value: 'NOCTURNO', label: 'Nocturno' },
      { value: 'CARGO', label: 'A Cargo' },
    ].map(t => `<option value="${t.value}" ${t.value === (rango.sub_rango_nombre || '') ? 'selected' : ''}>${t.label}</option>`).join('')

    const gncCurrentVal = rango.gnc === true ? 'true' : 'false'
    const gncOptionsEdit = [
      { value: 'true', label: 'Con GNC' },
      { value: 'false', label: 'Sin GNC' },
    ].map(g => `<option value="${g.value}" ${g.value === gncCurrentVal ? 'selected' : ''}>${g.label}</option>`).join('')

    const { value: formValues } = await Swal.fire({
      title: 'Editar Rango de Seguimiento',
      html: `
        <div style="display:flex;flex-direction:column;gap:12px;text-align:left;">
          <div>
            <label style="font-size:13px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">Nombre del Rango</label>
            <input id="swal-nombre" class="swal2-input" value="${rango.rango_nombre}" style="margin:0;width:100%;box-sizing:border-box;">
          </div>
          <div>
            <label style="font-size:13px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">Color</label>
            <select id="swal-color" class="swal2-select" style="margin:0;width:100%;box-sizing:border-box;">
              ${colorOptions}
            </select>
          </div>
          <div style="display:flex;gap:12px;">
            <div style="flex:1;">
              <label style="font-size:13px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">Turno</label>
              <select id="swal-turno" class="swal2-select" style="margin:0;width:100%;box-sizing:border-box;">
                ${turnoOptions}
              </select>
            </div>
            <div style="flex:1;">
              <label style="font-size:13px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">GNC</label>
              <select id="swal-gnc" class="swal2-select" style="margin:0;width:100%;box-sizing:border-box;">
                ${gncOptionsEdit}
              </select>
            </div>
          </div>
          <div style="display:flex;gap:12px;">
            <div style="flex:1;">
              <label style="font-size:13px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">Desde ($)</label>
              <input id="swal-desde" type="number" class="swal2-input" value="${rango.desde ?? ''}" style="margin:0;width:100%;box-sizing:border-box;">
            </div>
            <div style="flex:1;">
              <label style="font-size:13px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">Hasta ($)</label>
              <input id="swal-hasta" type="number" class="swal2-input" value="${rango.hasta ?? ''}" placeholder="Sin límite" style="margin:0;width:100%;box-sizing:border-box;">
            </div>
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#ef4444',
      preConfirm: () => {
        const nombre = (document.getElementById('swal-nombre') as HTMLInputElement).value.trim().toUpperCase()
        const color = (document.getElementById('swal-color') as HTMLSelectElement).value
        const turno = (document.getElementById('swal-turno') as HTMLSelectElement).value
        const gncVal = (document.getElementById('swal-gnc') as HTMLSelectElement).value
        const desde = (document.getElementById('swal-desde') as HTMLInputElement).value
        const hasta = (document.getElementById('swal-hasta') as HTMLInputElement).value
        if (!nombre) { Swal.showValidationMessage('El nombre es obligatorio'); return false }
        if (desde === '') { Swal.showValidationMessage('El valor "Desde" es obligatorio'); return false }
        return {
          rango_nombre: nombre,
          color,
          sub_rango_nombre: turno ? turno.toUpperCase() : null,
          gnc: gncVal === 'true',
          desde: parseInt(desde),
          hasta: hasta ? parseInt(hasta) : null,
        }
      }
    })

    if (!formValues) return
    try {
      const { error } = await supabase.from('guias_seguimiento').update(formValues).eq('id', rango.id)
      if (error) throw error
      showSuccess('Rango actualizado correctamente')
      cargarRangos()
    } catch {
      Swal.fire('Error', 'No se pudo actualizar el rango', 'error')
    }
  }

  async function eliminarRango(rango: RangoSeguimiento) {
    const result = await Swal.fire({
      title: '¿Eliminar rango?',
      text: `Se eliminará el rango "${rango.rango_nombre}"`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#ef4444',
    })
    if (!result.isConfirmed) return
    try {
      const { error } = await supabase.from('guias_seguimiento').delete().eq('id', rango.id)
      if (error) throw error
      showSuccess('Rango eliminado')
      cargarRangos()
    } catch {
      Swal.fire('Error', 'No se pudo eliminar el rango', 'error')
    }
  }

  // Columns memoizadas — solo dependen de callbacks estables, NO de filterDesde/filterHasta
  const columns = useMemo<ColumnDef<RangoSeguimiento, unknown>[]>(() => [
    {
      accessorKey: 'rango_nombre',
      header: 'RANGO',
      size: 200,
      cell: ({ row }) => <span style={{ fontWeight: 600 }}>{row.original.rango_nombre}</span>,
    },
    {
      accessorKey: 'sub_rango_nombre',
      header: 'TURNO',
      size: 150,
      cell: ({ row }) => <span>{row.original.sub_rango_nombre || '—'}</span>,
    },
    {
      id: 'gnc',
      accessorFn: (row) => row.gnc ? 'Con GNC' : 'Sin GNC',
      header: 'GNC',
      size: 120,
      cell: ({ row }) => (
        <span
          className={`dt-badge dt-badge-${row.original.gnc ? 'green' : 'yellow'}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
        >
          {row.original.gnc ? 'Con GNC' : 'Sin GNC'}
        </span>
      ),
    },
    {
      accessorKey: 'color',
      header: 'COLOR',
      size: 150,
      cell: ({ row }) => (
        <span
          className={`dt-badge dt-badge-${row.original.color === 'VERDE' ? 'green' : row.original.color === 'AMARILLO' ? 'yellow' : 'red'}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: getColorHex(row.original.color), flexShrink: 0 }} />
          {row.original.color}
        </span>
      ),
    },
    {
      id: 'desde',
      accessorKey: 'desde',
      filterFn: numericRangeFilter,
      header: () => <NumericRangeFilter label="DESDE" onChange={handleDesdeChange} />,
      size: 180,
      enableSorting: true,
      sortingFn: (rowA, rowB) => (rowA.original.desde ?? -1) - (rowB.original.desde ?? -1),
      cell: ({ row }) => formatCurrency(row.original.desde),
    },
    {
      id: 'hasta',
      accessorKey: 'hasta',
      filterFn: numericRangeFilter,
      header: () => <NumericRangeFilter label="HASTA" onChange={handleHastaChange} />,
      size: 180,
      enableSorting: true,
      sortingFn: (rowA, rowB) => (rowA.original.hasta ?? Infinity) - (rowB.original.hasta ?? Infinity),
      cell: ({ row }) => formatCurrency(row.original.hasta),
    },
    {
      id: 'acciones',
      header: 'Acciones',
      size: 120,
      cell: ({ row }) => (
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => editarRango(row.original)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px' }}
            title="Editar"
          >
            <Edit2 size={16} />
          </button>
          <button
            onClick={() => eliminarRango(row.original)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px' }}
            title="Eliminar"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ),
    },
  ], [handleDesdeChange, handleHastaChange])

  return (
    <DataTable
      columns={columns}
      data={rangos}
      loading={loading}
      searchPlaceholder="Buscar rango..."
      onTableReady={handleTableReady}
      headerAction={
        <button
          onClick={crearRango}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            background: '#ef4444',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s',
            whiteSpace: 'nowrap',
          }}
        >
          <Plus size={18} />
          Nuevo Rango
        </button>
      }
    />
  )
}
