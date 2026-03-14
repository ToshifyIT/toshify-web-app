import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { showSuccess } from '../../utils/toast'
import Swal from 'sweetalert2'
import { Edit2 } from 'lucide-react'
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

const PARAMETROS_SEED = [
  { clave: 'hora_corte_diurno', valor: '12', tipo: 'number', descripcion: 'Hora corte entrega diurno. Si entrega >= esta hora, descuento turno completo' },
  { clave: 'hora_corte_cargo', valor: '14', tipo: 'number', descripcion: 'Hora corte entrega a cargo. Si entrega >= esta hora, descuento medio turno' },
  { clave: 'descuento_diurno_antes', valor: '0.5', tipo: 'number', descripcion: 'Descuento (turnos) si entrega diurna antes del corte' },
  { clave: 'descuento_diurno_despues', valor: '1', tipo: 'number', descripcion: 'Descuento (turnos) si entrega diurna despues del corte' },
  { clave: 'descuento_cargo_despues', valor: '0.5', tipo: 'number', descripcion: 'Descuento (turnos) si entrega a cargo despues del corte' },
]

export function ParametrosAsignacionesPage() {
  const [parametros, setParametros] = useState<ParametroAsignacion[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    cargarParametros()
  }, [])

  async function cargarParametros() {
    setLoading(true)
    try {
      const claves = PARAMETROS_SEED.map(p => p.clave)
      const { data, error } = await (supabase
        .from('parametros_sistema') as ReturnType<typeof supabase.from>)
        .select('*')
        .eq('modulo', 'facturacion')
        .in('clave', claves)
        .order('clave')

      if (error) throw error
      const dbParams = (data || []) as ParametroAsignacion[]

      // Agregar parámetros que no existen en DB con valores default
      const clavesExistentes = new Set(dbParams.map(p => p.clave))
      const virtuales: ParametroAsignacion[] = PARAMETROS_SEED
        .filter(p => !clavesExistentes.has(p.clave))
        .map(p => ({
          id: `new_${p.clave}`,
          clave: p.clave,
          valor: p.valor,
          tipo: p.tipo,
          descripcion: p.descripcion,
          modulo: 'facturacion',
          updated_at: '',
        }))

      setParametros([...dbParams, ...virtuales])
    } catch {
      // silently ignored
    } finally {
      setLoading(false)
    }
  }

  async function editarParametro(param: ParametroAsignacion) {
    const { value: nuevoValor } = await Swal.fire({
      title: 'Editar Parametro',
      html: `
        <div style="display:flex;flex-direction:column;gap:12px;text-align:left;">
          <div>
            <label style="font-size:13px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">Clave</label>
            <input class="swal2-input" value="${param.clave}" disabled style="margin:0;width:100%;box-sizing:border-box;opacity:0.6;">
          </div>
          <div>
            <label style="font-size:13px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">Descripcion</label>
            <div style="font-size:12px;color:var(--text-tertiary);padding:4px 0;">${param.descripcion}</div>
          </div>
          <div>
            <label style="font-size:13px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">Valor</label>
            <input id="swal-valor" class="swal2-input" value="${param.valor}" type="number" step="0.5" style="margin:0;width:100%;box-sizing:border-box;">
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#ef4444',
      preConfirm: () => {
        const valor = (document.getElementById('swal-valor') as HTMLInputElement).value.trim()
        if (!valor) { Swal.showValidationMessage('El valor es obligatorio'); return false }
        return valor
      },
    })

    if (!nuevoValor) return

    try {
      if (param.id.startsWith('new_')) {
        // Crear en DB
        const { error } = await (supabase.from('parametros_sistema') as ReturnType<typeof supabase.from>)
          .insert({
            clave: param.clave,
            valor: nuevoValor,
            tipo: param.tipo,
            modulo: 'facturacion',
            descripcion: param.descripcion,
            activo: true,
          })
        if (error) throw error
        showSuccess('Parametro creado')
      } else {
        // Update existente
        const { error } = await (supabase.from('parametros_sistema') as ReturnType<typeof supabase.from>)
          .update({ valor: nuevoValor, updated_at: new Date().toISOString() })
          .eq('id', param.id)
        if (error) throw error
        showSuccess('Parametro actualizado')
      }
      cargarParametros()
    } catch {
      Swal.fire('Error', 'No se pudo guardar el parametro', 'error')
    }
  }

  const columns: ColumnDef<ParametroAsignacion, unknown>[] = [
    {
      accessorKey: 'descripcion',
      header: 'DESCRIPCION',
      cell: ({ row }) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: '13px' }}>{row.original.descripcion}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{row.original.clave}</div>
        </div>
      ),
    },
    {
      accessorKey: 'valor',
      header: 'VALOR',
      cell: ({ row }) => (
        <span style={{ fontWeight: 600, fontSize: '14px' }}>{row.original.valor}</span>
      ),
    },
    {
      accessorKey: 'tipo',
      header: 'TIPO',
      cell: () => (
        <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Numero</span>
      ),
    },
    {
      id: 'acciones',
      header: 'ACCIONES',
      size: 60,
      cell: ({ row }) => (
        <button
          onClick={() => editarParametro(row.original)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px' }}
          title="Editar"
        >
          <Edit2 size={16} />
        </button>
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
