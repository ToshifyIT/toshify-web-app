import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
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

export function HistorialMovimientosModule() {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [tipoFilter, setTipoFilter] = useState<string>('all')

  useEffect(() => {
    loadMovimientos()
  }, [])

  const loadMovimientos = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
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

      if (error) throw error

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
    } finally {
      setLoading(false)
    }
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

  const filteredData = movimientos.filter((item) => {
    const matchesSearch =
      item.producto.codigo.toLowerCase().includes(filter.toLowerCase()) ||
      item.producto.nombre.toLowerCase().includes(filter.toLowerCase()) ||
      item.usuario?.nombre.toLowerCase().includes(filter.toLowerCase()) ||
      item.vehiculo_destino?.patente.toLowerCase().includes(filter.toLowerCase()) ||
      item.vehiculo_origen?.patente.toLowerCase().includes(filter.toLowerCase())

    const matchesTipo = tipoFilter === 'all' || item.tipo_movimiento === tipoFilter

    return matchesSearch && matchesTipo
  })

  if (loading) {
    return (
      <div className="dt-loading">
        <div className="dt-loading-spinner"></div>
        <span>Cargando historial...</span>
      </div>
    )
  }

  return (
    <div className="module-container">
      {/* Header */}
      <div className="module-header">
        <h1 className="module-title">Historial de Movimientos</h1>
        <p className="module-subtitle">Últimos 100 movimientos del inventario</p>
      </div>

      {/* Filtros */}
      <div className="hist-filters">
        <input
          type="text"
          className="hist-search-input"
          placeholder="Buscar por producto, usuario o vehículo..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
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

      {/* Tabla de Movimientos - usando clases de DataTable */}
      <div className="dt-container">
        <div className="dt-table-wrapper">
          <table className="dt-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Producto</th>
                <th style={{ textAlign: 'center' }}>Cantidad</th>
                <th>Vehículo</th>
                <th>Usuario</th>
                <th>Observaciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="hist-date-cell">
                      <Calendar size={14} />
                      <div>
                        <div>{new Date(item.created_at).toLocaleDateString('es-CL')}</div>
                        <div className="hist-date-time">
                          {new Date(item.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`hist-tipo-badge ${item.tipo_movimiento}`}>
                      {getTipoIcon(item.tipo_movimiento)}
                      {getTipoLabel(item.tipo_movimiento)}
                    </span>
                  </td>
                  <td>
                    <div>
                      <div className="hist-producto-codigo">{item.producto.codigo}</div>
                      <div className="hist-producto-nombre">{item.producto.nombre}</div>
                    </div>
                  </td>
                  <td style={{ textAlign: 'center' }} className="hist-cantidad">{item.cantidad}</td>
                  <td>
                    {item.vehiculo_destino?.patente || item.vehiculo_origen?.patente || '-'}
                  </td>
                  <td>
                    {item.usuario ? (
                      <div className="hist-usuario-cell">
                        <div className="hist-usuario-avatar">
                          {item.usuario.nombre.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="hist-usuario-nombre">{item.usuario.nombre}</div>
                          <div className="hist-usuario-email">{item.usuario.email}</div>
                        </div>
                      </div>
                    ) : (
                      <span className="hist-usuario-sistema">Sistema</span>
                    )}
                  </td>
                  <td className="hist-observaciones">{item.observaciones || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {filteredData.length === 0 && (
        <div className="hist-empty">
          <Package size={48} className="hist-empty-icon" />
          <p className="hist-empty-text">No se encontraron movimientos</p>
        </div>
      )}
    </div>
  )
}
