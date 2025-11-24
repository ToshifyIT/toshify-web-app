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
      entrada: <ArrowDown size={16} style={{ color: '#059669' }} />,
      salida: <ArrowUp size={16} style={{ color: '#DC2626' }} />,
      asignacion: <Truck size={16} style={{ color: '#D97706' }} />,
      devolucion: <RotateCcw size={16} style={{ color: '#1E40AF' }} />,
      ajuste: <Package size={16} style={{ color: '#6B7280' }} />,
      daño: <AlertTriangle size={16} style={{ color: '#DC2626' }} />,
      perdida: <XCircle size={16} style={{ color: '#6B7280' }} />
    }
    return icons[tipo] || <Package size={16} />
  }

  const getTipoBadgeStyle = (tipo: string) => {
    const styles: Record<string, any> = {
      entrada: { background: '#D1FAE5', color: '#059669' },
      salida: { background: '#FEE2E2', color: '#DC2626' },
      asignacion: { background: '#FEF3C7', color: '#D97706' },
      devolucion: { background: '#DBEAFE', color: '#1E40AF' },
      ajuste: { background: '#F3F4F6', color: '#6B7280' },
      daño: { background: '#FEE2E2', color: '#DC2626' },
      perdida: { background: '#F3F4F6', color: '#6B7280' }
    }
    return styles[tipo] || { background: '#F3F4F6', color: '#6B7280' }
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
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <p>Cargando historial...</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#1F2937', marginBottom: '8px' }}>
          Historial de Movimientos
        </h1>
        <p style={{ color: '#6B7280', fontSize: '14px' }}>
          Últimos 100 movimientos del inventario
        </p>
      </div>

      {/* Filtros */}
      <div style={{ marginBottom: '24px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Buscar por producto, usuario o vehículo..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{
            flex: 1,
            minWidth: '300px',
            padding: '10px 16px',
            border: '1px solid #D1D5DB',
            borderRadius: '8px',
            fontSize: '14px'
          }}
        />
        <select
          value={tipoFilter}
          onChange={(e) => setTipoFilter(e.target.value)}
          style={{
            padding: '10px 16px',
            border: '1px solid #D1D5DB',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 600
          }}
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

      {/* Tabla de Movimientos */}
      <div style={{ background: 'white', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '1px solid #E5E7EB' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F9FAFB', borderBottom: '2px solid #E5E7EB' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: '#374151', textTransform: 'uppercase' }}>
                  Fecha
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: '#374151', textTransform: 'uppercase' }}>
                  Tipo
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: '#374151', textTransform: 'uppercase' }}>
                  Producto
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: 700, color: '#374151', textTransform: 'uppercase' }}>
                  Cantidad
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: '#374151', textTransform: 'uppercase' }}>
                  Vehículo
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: '#374151', textTransform: 'uppercase' }}>
                  Usuario
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: '#374151', textTransform: 'uppercase' }}>
                  Observaciones
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((item) => (
                <tr
                  key={item.id}
                  style={{ borderBottom: '1px solid #E5E7EB' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#F9FAFB')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
                >
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6B7280' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Calendar size={14} />
                      <div>
                        <div>{new Date(item.created_at).toLocaleDateString('es-CL')}</div>
                        <div style={{ fontSize: '11px', color: '#9CA3AF' }}>
                          {new Date(item.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      ...getTipoBadgeStyle(item.tipo_movimiento),
                      padding: '6px 12px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      {getTipoIcon(item.tipo_movimiento)}
                      {getTipoLabel(item.tipo_movimiento)}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#DC2626' }}>
                        {item.producto.codigo}
                      </div>
                      <div style={{ fontSize: '13px', color: '#6B7280' }}>
                        {item.producto.nombre}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '16px', fontWeight: 700 }}>
                    {item.cantidad}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '13px' }}>
                    {item.vehiculo_destino?.patente || item.vehiculo_origen?.patente || '-'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {item.usuario ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{
                          width: '32px',
                          height: '32px',
                          background: '#DC2626',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          fontWeight: 700,
                          fontSize: '12px'
                        }}>
                          {item.usuario.nombre.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 600 }}>
                            {item.usuario.nombre}
                          </div>
                          <div style={{ fontSize: '11px', color: '#9CA3AF' }}>
                            {item.usuario.email}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: '#9CA3AF', fontStyle: 'italic' }}>Sistema</span>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6B7280' }}>
                    {item.observaciones || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {filteredData.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          background: 'white',
          borderRadius: '12px',
          border: '1px solid #E5E7EB',
          marginTop: '20px'
        }}>
          <Package size={48} style={{ color: '#D1D5DB', margin: '0 auto 16px' }} />
          <p style={{ fontSize: '16px', fontWeight: 600, color: '#6B7280' }}>
            No se encontraron movimientos
          </p>
        </div>
      )}
    </div>
  )
}
