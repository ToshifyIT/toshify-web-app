import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import Swal from 'sweetalert2'
import { showSuccess } from '../../utils/toast'
import { Plus, Edit2, Trash2 } from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../../components/ui/DataTable'

interface RangoSeguimiento {
  id: number
  created_at: string
  rango_nombre: string
  color: string
  desde: number | null
  hasta: number | null
}

const COLOR_OPTIONS = [
  { value: 'VERDE', label: 'Verde', hex: '#22c55e' },
  { value: 'AMARILLO', label: 'Amarillo', hex: '#eab308' },
  { value: 'ROJO', label: 'Rojo', hex: '#ef4444' },
];

const getColorHex = (color: string): string => {
  return COLOR_OPTIONS.find(c => c.value === color)?.hex || '#6b7280';
};

export function RangoSeguimientoPage() {
  const [rangos, setRangos] = useState<RangoSeguimiento[]>([])
  const [loading, setLoading] = useState(true)

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
    } catch (error) {
      console.error('Error cargando rangos:', error)
    } finally {
      setLoading(false)
    }
  }

  async function crearRango() {
    const colorOptions = COLOR_OPTIONS.map(c =>
      `<option value="${c.value}">${c.label}</option>`
    ).join('')

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
        const desde = (document.getElementById('swal-desde') as HTMLInputElement).value
        const hasta = (document.getElementById('swal-hasta') as HTMLInputElement).value

        if (!nombre) {
          Swal.showValidationMessage('El nombre es obligatorio')
          return false
        }
        if (desde === '') {
          Swal.showValidationMessage('El valor "Desde" es obligatorio')
          return false
        }

        return {
          rango_nombre: nombre,
          color,
          desde: parseInt(desde),
          hasta: hasta ? parseInt(hasta) : null,
        }
      }
    })

    if (!formValues) return

    try {
      const { error } = await supabase
        .from('guias_seguimiento')
        .insert(formValues)

      if (error) throw error
      showSuccess('Rango creado correctamente')
      cargarRangos()
    } catch (error) {
      console.error('Error creando rango:', error)
      Swal.fire('Error', 'No se pudo crear el rango', 'error')
    }
  }

  async function editarRango(rango: RangoSeguimiento) {
    const colorOptions = COLOR_OPTIONS.map(c =>
      `<option value="${c.value}" ${c.value === rango.color ? 'selected' : ''}>${c.label}</option>`
    ).join('')

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
        const desde = (document.getElementById('swal-desde') as HTMLInputElement).value
        const hasta = (document.getElementById('swal-hasta') as HTMLInputElement).value

        if (!nombre) {
          Swal.showValidationMessage('El nombre es obligatorio')
          return false
        }
        if (desde === '') {
          Swal.showValidationMessage('El valor "Desde" es obligatorio')
          return false
        }

        return {
          rango_nombre: nombre,
          color,
          desde: parseInt(desde),
          hasta: hasta ? parseInt(hasta) : null,
        }
      }
    })

    if (!formValues) return

    try {
      const { error } = await supabase
        .from('guias_seguimiento')
        .update(formValues)
        .eq('id', rango.id)

      if (error) throw error
      showSuccess('Rango actualizado correctamente')
      cargarRangos()
    } catch (error) {
      console.error('Error actualizando rango:', error)
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
      const { error } = await supabase
        .from('guias_seguimiento')
        .delete()
        .eq('id', rango.id)

      if (error) throw error
      showSuccess('Rango eliminado')
      cargarRangos()
    } catch (error) {
      console.error('Error eliminando rango:', error)
      Swal.fire('Error', 'No se pudo eliminar el rango', 'error')
    }
  }

  const formatCurrency = (value: number | null): string => {
    if (value === null || value === undefined) return 'Sin límite'
    return `$ ${value.toLocaleString('es-AR')}`
  }

  const columns: ColumnDef<RangoSeguimiento, unknown>[] = [
    {
      accessorKey: 'rango_nombre',
      header: 'RANGO',
      size: 200,
      cell: ({ row }) => (
        <span style={{ fontWeight: 600 }}>{row.original.rango_nombre}</span>
      ),
    },
    {
      accessorKey: 'color',
      header: 'COLOR',
      size: 150,
      cell: ({ row }) => (
        <span
          className={`dt-badge dt-badge-${row.original.color === 'VERDE' ? 'green' : row.original.color === 'AMARILLO' ? 'yellow' : 'red'}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            background: getColorHex(row.original.color),
            flexShrink: 0,
          }} />
          {row.original.color}
        </span>
      ),
    },
    {
      accessorKey: 'desde',
      header: 'DESDE',
      size: 180,
      cell: ({ row }) => formatCurrency(row.original.desde),
    },
    {
      accessorKey: 'hasta',
      header: 'HASTA',
      size: 180,
      cell: ({ row }) => formatCurrency(row.original.hasta),
    },
    {
      id: 'acciones',
      header: 'ACCIONES',
      size: 120,
      cell: ({ row }) => (
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => editarRango(row.original)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              padding: '4px',
            }}
            title="Editar"
          >
            <Edit2 size={16} />
          </button>
          <button
            onClick={() => eliminarRango(row.original)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#ef4444',
              padding: '4px',
            }}
            title="Eliminar"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      data={rangos}
      loading={loading}
      searchPlaceholder="Buscar rango..."
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
