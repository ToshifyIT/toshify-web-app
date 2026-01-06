import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../../components/ui/DataTable/DataTable'
import {
  Package,
  RotateCcw,
  AlertTriangle,
  XCircle,
  Truck,
  Calendar,
  ArrowUp,
  ArrowDown
} from 'lucide-react'
import './HistorialMovimientos.css'

interface Movimiento {
  id: string
  tipo_movimiento: string
  cantidad: number
  estado_origen: string | null
  estado_destino: string | null
  observaciones: string | null
  created_at: string
  producto: {
    codigo: string
    nombre: string
  }
  vehiculo_destino: {
    patente: string
  } | null
  vehiculo_origen: {
    patente: string
  } | null
  usuario: {
    nombre: string
    email: string
  } | null
}

const getTipoLabel = (tipo: string): string => {
  const labels: Record<string, string> = {
    entrada: 'Entrada',
    salida: 'Salida',
    asignacion: 'Uso',
    devolucion: 'Devolución',
    ajuste: 'Ajuste',
    daño: 'Daño',
    perdida: 'Pérdida'
  }
  return labels[tipo] || tipo
}

const getTipoIcon = (tipo: string) => {
  const icons: Record<string, any> = {
    entrada: <ArrowDown size={16} />,
    salida: <ArrowUp size={16} />,
    asignacion: <Truck size={16} />,
    devolucion: <RotateCcw size={16} />,
    ajuste: <Package size={16} />,
    daño: <AlertTriangle size={16} />,
    perdida: <XCircle size={16} />
  }
  return icons[tipo] || <Package size={16} />
}

export function HistorialMovimientosModule() {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tipoFilter, setTipoFilter] = useState<string>('all')

  useEffect(() => {
    loadMovimientos()
  }, [])

  const loadMovimientos = async () => {
    try {
      setLoading(true)
      setError(null)
      const { data, error: fetchError } = await supabase
        .from('movimientos')
        .select(`
          id,
          tipo_movimiento,
          cantidad,
          estado_origen,
          estado_destino,
          observaciones,
          created_at,
          productos:producto_id (
            codigo,
            nombre
          ),
          vehiculo_destino:vehiculo_destino_id (
            patente
          ),
          vehiculo_origen:vehiculo_origen_id (
            patente
          ),
          usuarios:usuario_id (
            nombre,
            email
          )
        `)
        .order('created_at', { ascending: false })
        .limit(100)

      if (fetchError) throw fetchError

      // Transform data
      const transformed = (data || []).map((item: any) => ({
        id: item.id,
        tipo_movimiento: item.tipo_movimiento,
        cantidad: item.cantidad,
        estado_origen: item.estado_origen,
        estado_destino: item.estado_destino,
        observaciones: item.observaciones,
        created_at: item.created_at,
        producto: {
          codigo: item.productos?.codigo || 'N/A',
          nombre: item.productos?.nombre || 'N/A'
        },
        vehiculo_destino: item.vehiculo_destino,
        vehiculo_origen: item.vehiculo_origen,
        usuario: item.usuarios
      }))

      setMovimientos(transformed)
    } catch (err: any) {
      console.error('Error cargando movimientos:', err)
      setError(err.message || 'Error al cargar movimientos')
    } finally {
      setLoading(false)
    }
  }

  // Filtrar por tipo de movimiento
  const filteredData = useMemo(() => {
    if (tipoFilter === 'all') return movimientos
    return movimientos.filter(item => item.tipo_movimiento === tipoFilter)
  }, [movimientos, tipoFilter])

  // Definición de columnas para TanStack Table
  const columns = useMemo<ColumnDef<Movimiento, any>[]>(() => [
    {
      accessorKey: 'created_at',
      header: 'Fecha',
      cell: ({ row }) => {
        const date = new Date(row.original.created_at)
        return (
          <div className="hist-date-cell">
            <Calendar size={14} />
            <div>
              <div>{date.toLocaleDateString('es-CL')}</div>
              <div className="hist-date-time">
                {date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })}
              </div>
            </div>
          </div>
        )
      }
    },
    {
      accessorKey: 'tipo_movimiento',
      header: 'Tipo',
      cell: ({ row }) => {
        const tipo = row.original.tipo_movimiento
        return (
          <span className={`hist-tipo-badge ${tipo}`}>
            {getTipoIcon(tipo)}
            {getTipoLabel(tipo)}
          </span>
        )
      }
    },
    {
      accessorFn: (row) => `${row.producto.codigo} ${row.producto.nombre}`,
      id: 'producto',
      header: 'Producto',
      cell: ({ row }) => (
        <div>
          <div className="hist-producto-codigo">{row.original.producto.codigo}</div>
          <div className="hist-producto-nombre">{row.original.producto.nombre}</div>
        </div>
      )
    },
    {
      accessorKey: 'cantidad',
      header: 'Cantidad',
      cell: ({ row }) => (
        <div style={{ textAlign: 'center' }} className="hist-cantidad">
          {row.original.cantidad}
        </div>
      )
    },
    {
      accessorFn: (row) => row.vehiculo_destino?.patente || row.vehiculo_origen?.patente || '',
      id: 'vehiculo',
      header: 'Vehículo',
      cell: ({ row }) => (
        <span>
          {row.original.vehiculo_destino?.patente || row.original.vehiculo_origen?.patente || '-'}
        </span>
      )
    },
    {
      accessorFn: (row) => row.usuario?.nombre || 'Sistema',
      id: 'usuario',
      header: 'Usuario',
      cell: ({ row }) => {
        const usuario = row.original.usuario
        if (!usuario) {
          return <span className="hist-usuario-sistema">Sistema</span>
        }
        return (
          <div className="hist-usuario-cell">
            <div className="hist-usuario-avatar">
              {usuario.nombre.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="hist-usuario-nombre">{usuario.nombre}</div>
              <div className="hist-usuario-email">{usuario.email}</div>
            </div>
          </div>
        )
      }
    },
    {
      accessorKey: 'observaciones',
      header: 'Observaciones',
      cell: ({ row }) => (
        <span className="hist-observaciones">
          {row.original.observaciones || '-'}
        </span>
      )
    }
  ], [])

  return (
    <div className="hist-module">
      {/* Filtro de tipo (adicional al buscador del DataTable) */}
      <div className="hist-filters">
        <select
          className="hist-type-select"
          value={tipoFilter}
          onChange={(e) => setTipoFilter(e.target.value)}
        >
          <option value="all">Todos los tipos</option>
          <option value="entrada">Entrada</option>
          <option value="salida">Salida</option>
          <option value="asignacion">Uso</option>
          <option value="devolucion">Devolución</option>
          <option value="daño">Daño</option>
          <option value="perdida">Pérdida</option>
        </select>
      </div>

      {/* DataTable */}
      <DataTable
        data={filteredData}
        columns={columns}
        loading={loading}
        error={error}
        searchPlaceholder="Buscar por producto, usuario o vehículo..."
        emptyIcon={<Package size={48} />}
        emptyTitle="No hay movimientos"
        emptyDescription="No se encontraron movimientos en el historial"
        pageSize={20}
        pageSizeOptions={[10, 20, 50, 100]}
      />
    </div>
  )
}
