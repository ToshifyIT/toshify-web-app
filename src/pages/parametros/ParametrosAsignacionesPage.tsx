import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import Swal from 'sweetalert2'
import { showSuccess } from '../../utils/toast'
import { Edit2, Trash2 } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../../components/ui/DataTable'

interface ParametroAsignacion {
  id: string
  clave: string
  valor: string
  tipo: string
  descripcion: string
  modulo: string
  updated_at: string
}

const PARAMS_DEFAULTS: Record<string, { valor: string; descripcion: string }> = {
  hora_corte_diurno: { valor: '12', descripcion: 'Hora corte Diurno - Si entrega >= esta hora, descuento turno completo' },
  hora_corte_cargo: { valor: '14', descripcion: 'Hora corte A Cargo - Si entrega >= esta hora, descuento medio turno' },
  descuento_diurno_antes: { valor: '0.5', descripcion: 'Descuento (turnos) si entrega diurna antes del corte' },
  descuento_diurno_despues: { valor: '1', descripcion: 'Descuento (turnos) si entrega diurna despues del corte' },
  descuento_cargo_despues: { valor: '0.5', descripcion: 'Descuento (turnos) si entrega a cargo despues del corte' },
}

const CLAVES = Object.keys(PARAMS_DEFAULTS)

export function ParametrosAsignacionesPage() {
  const [parametros, setParametros] = useState<ParametroAsignacion[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { cargarParametros() }, [])

  async function cargarParametros() {
    setLoading(true)
    try {
      const { data, error } = await (supabase
        .from('parametros_sistema') as ReturnType<typeof supabase.from>)
        .select('*')
        .eq('modulo', 'facturacion')
        .in('clave', CLAVES)

      if (error) throw error

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dbMap = new Map((data as any[] || []).map((r: any) => [r.clave, r]))

      const rows: ParametroAsignacion[] = CLAVES.map(clave => {
        const db = dbMap.get(clave)
        const def = PARAMS_DEFAULTS[clave]
        return {
          id: db?.id || `new_${clave}`,
          clave,
          valor: db?.valor || def.valor,
          tipo: db?.tipo || 'number',
          descripcion: def.descripcion,
          modulo: 'facturacion',
          updated_at: db?.updated_at || '',
        }
      })
      setParametros(rows)
    } catch {
      // silently ignored
    } finally {
      setLoading(false)
    }
  }

  async function editarParametro(param: ParametroAsignacion) {
    const { value: formValues } = await Swal.fire({
      title: 'Editar Parametro',
      html: `
        <div style="display:flex;flex-direction:column;gap:12px;text-align:left;">
          <div>
            <label style="font-size:13px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">Clave</label>
            <input class="swal2-input" value="${param.clave}" disabled style="margin:0;width:100%;box-sizing:border-box;opacity:0.6;">
          </div>
          <div>
            <label style="font-size:13px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">Descripcion</label>
            <input id="swal-desc" class="swal2-input" value="${param.descripcion}" style="margin:0;width:100%;box-sizing:border-box;">
          </div>
          <div>
            <label style="font-size:13px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">Valor</label>
            <input id="swal-valor" class="swal2-input" value="${param.valor}" type="number" step="0.5" min="0" style="margin:0;width:100%;box-sizing:border-box;">
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#ef4444',
      preConfirm: () => {
        const descripcion = (document.getElementById('swal-desc') as HTMLInputElement).value.trim()
        const valor = (document.getElementById('swal-valor') as HTMLInputElement).value.trim()
        if (!valor) { Swal.showValidationMessage('El valor es obligatorio'); return false }
        return { descripcion, valor, updated_at: new Date().toISOString() }
      },
    })

    if (!formValues) return

    try {
      if (param.id.startsWith('new_')) {
        const { error } = await (supabase.from('parametros_sistema') as ReturnType<typeof supabase.from>)
          .insert({ clave: param.clave, valor: formValues.valor, tipo: 'number', modulo: 'facturacion', descripcion: formValues.descripcion, activo: true })
        if (error) throw error
      } else {
        const { error } = await (supabase.from('parametros_sistema') as ReturnType<typeof supabase.from>)
          .update(formValues)
          .eq('id', param.id)
        if (error) throw error
      }
      showSuccess('Parametro actualizado')
      cargarParametros()
    } catch {
      Swal.fire('Error', 'No se pudo guardar', 'error')
    }
  }

  async function eliminarParametro(param: ParametroAsignacion) {
    if (param.id.startsWith('new_')) {
      Swal.fire('Info', 'Este parametro aun no existe en la base de datos', 'info')
      return
    }

    const result = await Swal.fire({
      title: 'Eliminar parametro',
      html: `<p>Se eliminara <strong>${param.descripcion}</strong></p><p style="color:#dc2626;font-size:13px;">Esta accion no se puede deshacer. Si el parametro se usa en calculos, se usara el valor por defecto.</p>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
    })

    if (!result.isConfirmed) return

    try {
      const { error } = await (supabase.from('parametros_sistema') as ReturnType<typeof supabase.from>)
        .delete()
        .eq('id', param.id)
      if (error) throw error
      showSuccess('Parametro eliminado')
      cargarParametros()
    } catch {
      Swal.fire('Error', 'No se pudo eliminar', 'error')
    }
  }

  const columns: ColumnDef<ParametroAsignacion, unknown>[] = [
    {
      accessorKey: 'descripcion',
      header: 'Descripcion',
      cell: ({ row }) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: '13px' }}>{row.original.descripcion}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{row.original.clave}</div>
        </div>
      ),
    },
    {
      accessorKey: 'valor',
      header: 'Valor',
      size: 100,
      cell: ({ row }) => (
        <span style={{ fontWeight: 600, fontSize: '14px' }}>{row.original.valor}</span>
      ),
    },
    {
      accessorKey: 'tipo',
      header: 'Tipo',
      size: 100,
      cell: () => (
        <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Numero</span>
      ),
    },
    {
      id: 'acciones',
      header: 'Acciones',
      size: 120,
      cell: ({ row }) => (
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => editarParametro(row.original)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px' }}
            title="Editar"
          >
            <Edit2 size={16} />
          </button>
          <button
            onClick={() => eliminarParametro(row.original)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: '4px' }}
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
      data={parametros}
      loading={loading}
      searchPlaceholder="Buscar parametro..."
      emptyTitle="Sin parametros"
      emptyDescription="No se encontraron parametros de asignacion"
      pageSize={10}
/>
  )
}
