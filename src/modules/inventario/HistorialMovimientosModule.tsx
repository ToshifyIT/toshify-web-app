import { useEffect, useState, useMemo, useRef } from 'react'
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
  ArrowDown,
  Filter
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

  // Excel-style column filter states
  const [openColumnFilter, setOpenColumnFilter] = useState<string | null>(null)
  const [tipoMovimientoFilter, setTipoMovimientoFilter] = useState<string[]>([])
  const [productoFilter, setProductoFilter] = useState<string[]>([])
  const [vehiculoFilter, setVehiculoFilter] = useState<string[]>([])
  const [usuarioFilter, setUsuarioFilter] = useState<string[]>([])
  const filterRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadMovimientos()
  }, [])

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setOpenColumnFilter(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
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

  // Unique value lists for filters
  const uniqueTipoMovimiento = useMemo(() =>
    [...new Set(movimientos.map(m => m.tipo_movimiento))].filter(Boolean) as string[],
    [movimientos]
  )
  const uniqueProductos = useMemo(() =>
    [...new Set(movimientos.map(m => m.producto.nombre))].filter(Boolean) as string[],
    [movimientos]
  )
  const uniqueVehiculos = useMemo(() =>
    [...new Set(movimientos.map(m => m.vehiculo_destino?.patente || m.vehiculo_origen?.patente))].filter(Boolean) as string[],
    [movimientos]
  )
  const uniqueUsuarios = useMemo(() =>
    [...new Set(movimientos.map(m => m.usuario?.nombre))].filter(Boolean) as string[],
    [movimientos]
  )

  // Toggle functions
  const toggleTipoMovimientoFilter = (value: string) => {
    setTipoMovimientoFilter(prev =>
      prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]
    )
  }
  const toggleProductoFilter = (value: string) => {
    setProductoFilter(prev =>
      prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]
    )
  }
  const toggleVehiculoFilter = (value: string) => {
    setVehiculoFilter(prev =>
      prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]
    )
  }
  const toggleUsuarioFilter = (value: string) => {
    setUsuarioFilter(prev =>
      prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]
    )
  }

  // Filtrar por tipo de movimiento y column filters
  const filteredData = useMemo(() => {
    let data = movimientos
    if (tipoFilter !== 'all') {
      data = data.filter(item => item.tipo_movimiento === tipoFilter)
    }
    if (tipoMovimientoFilter.length > 0) {
      data = data.filter(item => tipoMovimientoFilter.includes(item.tipo_movimiento))
    }
    if (productoFilter.length > 0) {
      data = data.filter(item => productoFilter.includes(item.producto.nombre))
    }
    if (vehiculoFilter.length > 0) {
      data = data.filter(item => {
        const vehiculo = item.vehiculo_destino?.patente || item.vehiculo_origen?.patente
        return vehiculo && vehiculoFilter.includes(vehiculo)
      })
    }
    if (usuarioFilter.length > 0) {
      data = data.filter(item => item.usuario?.nombre && usuarioFilter.includes(item.usuario.nombre))
    }
    return data
  }, [movimientos, tipoFilter, tipoMovimientoFilter, productoFilter, vehiculoFilter, usuarioFilter])

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
      header: () => (
        <div className="dt-column-filter" ref={openColumnFilter === 'tipo' ? filterRef : null}>
          <span>Tipo {tipoMovimientoFilter.length > 0 && `(${tipoMovimientoFilter.length})`}</span>
          <button
            className={`dt-column-filter-btn ${tipoMovimientoFilter.length > 0 ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setOpenColumnFilter(openColumnFilter === 'tipo' ? null : 'tipo') }}
          >
            <Filter size={12} />
          </button>
          {openColumnFilter === 'tipo' && (
            <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
              <div className="dt-excel-filter-list">
                {uniqueTipoMovimiento.map(tipo => (
                  <label key={tipo} className={`dt-column-filter-checkbox ${tipoMovimientoFilter.includes(tipo) ? 'selected' : ''}`}>
                    <input type="checkbox" checked={tipoMovimientoFilter.includes(tipo)} onChange={() => toggleTipoMovimientoFilter(tipo)} />
                    <span>{getTipoLabel(tipo)}</span>
                  </label>
                ))}
              </div>
              {tipoMovimientoFilter.length > 0 && (
                <button className="dt-column-filter-clear" onClick={() => setTipoMovimientoFilter([])}>
                  Limpiar ({tipoMovimientoFilter.length})
                </button>
              )}
            </div>
          )}
        </div>
      ),
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
      header: () => (
        <div className="dt-column-filter" ref={openColumnFilter === 'producto' ? filterRef : null}>
          <span>Producto {productoFilter.length > 0 && `(${productoFilter.length})`}</span>
          <button
            className={`dt-column-filter-btn ${productoFilter.length > 0 ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setOpenColumnFilter(openColumnFilter === 'producto' ? null : 'producto') }}
          >
            <Filter size={12} />
          </button>
          {openColumnFilter === 'producto' && (
            <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
              <div className="dt-excel-filter-list">
                {uniqueProductos.map(producto => (
                  <label key={producto} className={`dt-column-filter-checkbox ${productoFilter.includes(producto) ? 'selected' : ''}`}>
                    <input type="checkbox" checked={productoFilter.includes(producto)} onChange={() => toggleProductoFilter(producto)} />
                    <span>{producto}</span>
                  </label>
                ))}
              </div>
              {productoFilter.length > 0 && (
                <button className="dt-column-filter-clear" onClick={() => setProductoFilter([])}>
                  Limpiar ({productoFilter.length})
                </button>
              )}
            </div>
          )}
        </div>
      ),
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
      header: () => (
        <div className="dt-column-filter" ref={openColumnFilter === 'vehiculo' ? filterRef : null}>
          <span>Vehículo {vehiculoFilter.length > 0 && `(${vehiculoFilter.length})`}</span>
          <button
            className={`dt-column-filter-btn ${vehiculoFilter.length > 0 ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setOpenColumnFilter(openColumnFilter === 'vehiculo' ? null : 'vehiculo') }}
          >
            <Filter size={12} />
          </button>
          {openColumnFilter === 'vehiculo' && (
            <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
              <div className="dt-excel-filter-list">
                {uniqueVehiculos.map(vehiculo => (
                  <label key={vehiculo} className={`dt-column-filter-checkbox ${vehiculoFilter.includes(vehiculo) ? 'selected' : ''}`}>
                    <input type="checkbox" checked={vehiculoFilter.includes(vehiculo)} onChange={() => toggleVehiculoFilter(vehiculo)} />
                    <span>{vehiculo}</span>
                  </label>
                ))}
              </div>
              {vehiculoFilter.length > 0 && (
                <button className="dt-column-filter-clear" onClick={() => setVehiculoFilter([])}>
                  Limpiar ({vehiculoFilter.length})
                </button>
              )}
            </div>
          )}
        </div>
      ),
      cell: ({ row }) => (
        <span>
          {row.original.vehiculo_destino?.patente || row.original.vehiculo_origen?.patente || '-'}
        </span>
      )
    },
    {
      accessorFn: (row) => row.usuario?.nombre || 'Sistema',
      id: 'usuario',
      header: () => (
        <div className="dt-column-filter" ref={openColumnFilter === 'usuario' ? filterRef : null}>
          <span>Usuario {usuarioFilter.length > 0 && `(${usuarioFilter.length})`}</span>
          <button
            className={`dt-column-filter-btn ${usuarioFilter.length > 0 ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setOpenColumnFilter(openColumnFilter === 'usuario' ? null : 'usuario') }}
          >
            <Filter size={12} />
          </button>
          {openColumnFilter === 'usuario' && (
            <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
              <div className="dt-excel-filter-list">
                {uniqueUsuarios.map(usuario => (
                  <label key={usuario} className={`dt-column-filter-checkbox ${usuarioFilter.includes(usuario) ? 'selected' : ''}`}>
                    <input type="checkbox" checked={usuarioFilter.includes(usuario)} onChange={() => toggleUsuarioFilter(usuario)} />
                    <span>{usuario}</span>
                  </label>
                ))}
              </div>
              {usuarioFilter.length > 0 && (
                <button className="dt-column-filter-clear" onClick={() => setUsuarioFilter([])}>
                  Limpiar ({usuarioFilter.length})
                </button>
              )}
            </div>
          )}
        </div>
      ),
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
  ], [openColumnFilter, tipoMovimientoFilter, productoFilter, vehiculoFilter, usuarioFilter, uniqueTipoMovimiento, uniqueProductos, uniqueVehiculos, uniqueUsuarios])

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
pageSize={100}
        pageSizeOptions={[10, 20, 50, 100]}
      />
    </div>
  )
}
