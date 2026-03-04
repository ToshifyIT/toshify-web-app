import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import Swal from 'sweetalert2'
import { showSuccess } from '../../utils/toast'
import { Plus, Edit2, Trash2 } from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../../components/ui/DataTable'

interface ParametroUss {
  id: string
  clave: string
  valor: string
  tipo: string
  descripcion: string
  modulo: string
  updated_at: string
}

const TIPO_OPTIONS = [
  { value: 'time', label: 'Hora (HH:MM)' },
  { value: 'number', label: 'Numero' },
  { value: 'text', label: 'Texto' },
]

export function ParametrosUssPage() {
  const [parametros, setParametros] = useState<ParametroUss[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    cargarParametros()
  }, [])

  async function cargarParametros() {
    setLoading(true)
    try {
      const { data, error } = await (supabase
        .from('parametros_sistema') as any)
        .select('*')
        .order('modulo', { ascending: true })
        .order('clave', { ascending: true })

      if (error) throw error
      setParametros((data || []) as ParametroUss[])
    } catch (error) {
      console.error('Error cargando parametros:', error)
    } finally {
      setLoading(false)
    }
  }

  async function crearParametro() {
    const tipoOptions = TIPO_OPTIONS.map(t =>
      `<option value="${t.value}">${t.label}</option>`
    ).join('')

    const { value: formValues } = await Swal.fire({
      title: 'Nuevo Parametro',
      html: `
        <div style="display:flex;flex-direction:column;gap:12px;text-align:left;">
          <div>
            <label style="font-size:13px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">Clave (ID unico)</label>
            <input id="swal-clave" class="swal2-input" placeholder="Ej: bitacora_turno_diurno_inicio" style="margin:0;width:100%;box-sizing:border-box;">
          </div>
          <div>
            <label style="font-size:13px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">Descripcion</label>
            <input id="swal-desc" class="swal2-input" placeholder="Ej: Hora de inicio del turno diurno" style="margin:0;width:100%;box-sizing:border-box;">
          </div>
          <div style="display:flex;gap:12px;">
            <div style="flex:1;">
              <label style="font-size:13px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">Tipo</label>
              <select id="swal-tipo" class="swal2-select" style="margin:0;width:100%;box-sizing:border-box;">
                ${tipoOptions}
              </select>
            </div>
            <div style="flex:1;">
              <label style="font-size:13px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">Modulo</label>
              <input id="swal-modulo" class="swal2-input" value="bitacora" placeholder="Ej: bitacora" style="margin:0;width:100%;box-sizing:border-box;">
            </div>
          </div>
          <div>
            <label style="font-size:13px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">Valor</label>
            <input id="swal-valor" class="swal2-input" placeholder="Ej: 06:00" style="margin:0;width:100%;box-sizing:border-box;">
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Crear',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#ef4444',
      preConfirm: () => {
        const clave = (document.getElementById('swal-clave') as HTMLInputElement).value.trim()
        const descripcion = (document.getElementById('swal-desc') as HTMLInputElement).value.trim()
        const tipo = (document.getElementById('swal-tipo') as HTMLSelectElement).value
        const modulo = (document.getElementById('swal-modulo') as HTMLInputElement).value.trim()
        const valor = (document.getElementById('swal-valor') as HTMLInputElement).value.trim()

        if (!clave) { Swal.showValidationMessage('La clave es obligatoria'); return false }
        if (!valor) { Swal.showValidationMessage('El valor es obligatorio'); return false }
        if (!modulo) { Swal.showValidationMessage('El modulo es obligatorio'); return false }

        return { clave, descripcion, tipo, modulo, valor }
      },
    })

    if (!formValues) return

    try {
      const { error } = await (supabase
        .from('parametros_sistema') as any)
        .insert(formValues)

      if (error) throw error
      showSuccess('Parametro creado')
      cargarParametros()
    } catch (error) {
      console.error('Error creando parametro:', error)
      Swal.fire('Error', 'No se pudo crear el parametro', 'error')
    }
  }

  async function editarParametro(param: ParametroUss) {
    const tipoOptions = TIPO_OPTIONS.map(t =>
      `<option value="${t.value}" ${t.value === param.tipo ? 'selected' : ''}>${t.label}</option>`
    ).join('')

    const { value: formValues } = await Swal.fire({
      title: 'Editar Parametro',
      html: `
        <div style="display:flex;flex-direction:column;gap:12px;text-align:left;">
          <div>
            <label style="font-size:13px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">Clave</label>
            <input id="swal-clave" class="swal2-input" value="${param.clave}" disabled style="margin:0;width:100%;box-sizing:border-box;opacity:0.6;">
          </div>
          <div>
            <label style="font-size:13px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">Descripcion</label>
            <input id="swal-desc" class="swal2-input" value="${param.descripcion || ''}" style="margin:0;width:100%;box-sizing:border-box;">
          </div>
          <div style="display:flex;gap:12px;">
            <div style="flex:1;">
              <label style="font-size:13px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">Tipo</label>
              <select id="swal-tipo" class="swal2-select" style="margin:0;width:100%;box-sizing:border-box;">
                ${tipoOptions}
              </select>
            </div>
            <div style="flex:1;">
              <label style="font-size:13px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">Modulo</label>
              <input id="swal-modulo" class="swal2-input" value="${param.modulo}" style="margin:0;width:100%;box-sizing:border-box;">
            </div>
          </div>
          <div>
            <label style="font-size:13px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">Valor</label>
            <input id="swal-valor" class="swal2-input" value="${param.valor}" style="margin:0;width:100%;box-sizing:border-box;">
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#ef4444',
      preConfirm: () => {
        const descripcion = (document.getElementById('swal-desc') as HTMLInputElement).value.trim()
        const tipo = (document.getElementById('swal-tipo') as HTMLSelectElement).value
        const modulo = (document.getElementById('swal-modulo') as HTMLInputElement).value.trim()
        const valor = (document.getElementById('swal-valor') as HTMLInputElement).value.trim()

        if (!valor) { Swal.showValidationMessage('El valor es obligatorio'); return false }

        return { descripcion, tipo, modulo, valor, updated_at: new Date().toISOString() }
      },
    })

    if (!formValues) return

    try {
      const { error } = await (supabase
        .from('parametros_sistema') as any)
        .update(formValues)
        .eq('id', param.id)

      if (error) throw error
      showSuccess('Parametro actualizado')
      cargarParametros()
    } catch (error) {
      console.error('Error actualizando parametro:', error)
      Swal.fire('Error', 'No se pudo actualizar el parametro', 'error')
    }
  }

  async function eliminarParametro(param: ParametroUss) {
    const result = await Swal.fire({
      title: 'Eliminar parametro?',
      text: `Se eliminara "${param.clave}"`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#ef4444',
    })

    if (!result.isConfirmed) return

    try {
      const { error } = await (supabase
        .from('parametros_sistema') as any)
        .delete()
        .eq('id', param.id)

      if (error) throw error
      showSuccess('Parametro eliminado')
      cargarParametros()
    } catch (error) {
      console.error('Error eliminando parametro:', error)
      Swal.fire('Error', 'No se pudo eliminar el parametro', 'error')
    }
  }

  const columns: ColumnDef<ParametroUss, unknown>[] = [
    {
      accessorKey: 'modulo',
      header: 'MODULO',
      size: 120,
      cell: ({ row }) => (
        <span className="dt-badge dt-badge-solid-blue" style={{ textTransform: 'uppercase' }}>
          {row.original.modulo}
        </span>
      ),
    },
    {
      accessorKey: 'descripcion',
      header: 'DESCRIPCION',
      size: 300,
      cell: ({ row }) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: '13px' }}>{row.original.descripcion || row.original.clave}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{row.original.clave}</div>
        </div>
      ),
    },
    {
      accessorKey: 'valor',
      header: 'VALOR',
      size: 150,
      cell: ({ row }) => (
        <span style={{ fontWeight: 600, fontSize: '14px' }}>{row.original.valor}</span>
      ),
    },
    {
      accessorKey: 'tipo',
      header: 'TIPO',
      size: 100,
      cell: ({ row }) => {
        const label = TIPO_OPTIONS.find(t => t.value === row.original.tipo)?.label || row.original.tipo
        return <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{label}</span>
      },
    },
    {
      id: 'acciones',
      header: 'ACCIONES',
      size: 100,
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
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px' }}
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
      headerAction={
        <button
          onClick={crearParametro}
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
          Nuevo Parametro
        </button>
      }
    />
  )
}
