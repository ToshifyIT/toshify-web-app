import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Swal from 'sweetalert2'
import {
  Package,
  Truck,
  CheckCircle,
  Calendar,
  Search,
  ChevronDown,
  ChevronUp
} from 'lucide-react'

interface PedidoItem {
  item_id: string
  pedido_id: string
  numero_pedido: string
  fecha_pedido: string
  fecha_estimada_llegada: string | null
  estado_pedido: string
  proveedor_nombre: string
  producto_id: string
  producto_codigo: string
  producto_nombre: string
  cantidad_pedida: number
  cantidad_recibida: number
  cantidad_pendiente: number
  estado_item: string
  usuario_registro: string | null
  observaciones: string | null
}

interface PedidoAgrupado {
  pedido_id: string
  numero_pedido: string
  fecha_pedido: string
  fecha_estimada_llegada: string | null
  estado_pedido: string
  proveedor_nombre: string
  observaciones: string | null
  items: PedidoItem[]
}

export function PedidosTransitoModule() {
  const [pedidos, setPedidos] = useState<PedidoAgrupado[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedPedidos, setExpandedPedidos] = useState<Set<string>>(new Set())
  const [searchTerm, setSearchTerm] = useState('')
  const [processingItem, setProcessingItem] = useState<string | null>(null)

  useEffect(() => {
    loadPedidos()
  }, [])

  const loadPedidos = async () => {
    try {
      setLoading(true)

      const { data, error } = await supabase
        .from('v_pedidos_en_transito')
        .select('*')
        .order('fecha_pedido', { ascending: false })

      if (error) throw error

      // Agrupar items por pedido
      const pedidosMap = new Map<string, PedidoAgrupado>()
      const items = (data || []) as unknown as PedidoItem[]

      for (const item of items) {
        if (!pedidosMap.has(item.pedido_id)) {
          pedidosMap.set(item.pedido_id, {
            pedido_id: item.pedido_id,
            numero_pedido: item.numero_pedido,
            fecha_pedido: item.fecha_pedido,
            fecha_estimada_llegada: item.fecha_estimada_llegada,
            estado_pedido: item.estado_pedido,
            proveedor_nombre: item.proveedor_nombre,
            observaciones: item.observaciones,
            items: []
          })
        }
        pedidosMap.get(item.pedido_id)!.items.push(item)
      }

      setPedidos(Array.from(pedidosMap.values()))

      // Expandir todos los pedidos por defecto
      setExpandedPedidos(new Set(pedidosMap.keys()))
    } catch (err) {
      console.error('Error cargando pedidos:', err)
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'No se pudieron cargar los pedidos en tránsito'
      })
    } finally {
      setLoading(false)
    }
  }

  const togglePedido = (pedidoId: string) => {
    const newExpanded = new Set(expandedPedidos)
    if (newExpanded.has(pedidoId)) {
      newExpanded.delete(pedidoId)
    } else {
      newExpanded.add(pedidoId)
    }
    setExpandedPedidos(newExpanded)
  }

  const confirmarRecepcion = async (item: PedidoItem) => {
    const cantidadPendiente = item.cantidad_pendiente

    const { value: cantidad } = await Swal.fire({
      title: 'Confirmar Recepción',
      html: `
        <div style="text-align: left; margin-bottom: 16px;">
          <p><strong>Producto:</strong> ${item.producto_codigo} - ${item.producto_nombre}</p>
          <p><strong>Cantidad pendiente:</strong> ${cantidadPendiente} unidades</p>
        </div>
        <label style="display: block; margin-bottom: 8px; font-weight: 600;">
          Cantidad recibida:
        </label>
      `,
      input: 'number',
      inputValue: cantidadPendiente,
      inputAttributes: {
        min: '1',
        max: String(cantidadPendiente),
        step: '1'
      },
      showCancelButton: true,
      confirmButtonText: 'Confirmar Recepción',
      confirmButtonColor: '#059669',
      cancelButtonText: 'Cancelar',
      inputValidator: (value) => {
        const num = Number(value)
        if (!value || num <= 0) {
          return 'Ingresa una cantidad válida'
        }
        if (num > cantidadPendiente) {
          return `La cantidad no puede exceder ${cantidadPendiente}`
        }
        return null
      }
    })

    if (!cantidad) return

    try {
      setProcessingItem(item.item_id)

      const { data: { user } } = await supabase.auth.getUser()

      const { data, error } = await (supabase.rpc as any)('procesar_recepcion_pedido', {
        p_pedido_item_id: item.item_id,
        p_cantidad_recibida: Number(cantidad),
        p_usuario_id: user?.id
      })

      if (error) throw error

      const result = data as { success: boolean; error?: string; mensaje?: string }

      if (!result.success) {
        throw new Error(result.error || 'Error procesando recepción')
      }

      Swal.fire({
        icon: 'success',
        title: 'Recepción confirmada',
        text: `Se recibieron ${cantidad} unidades de ${item.producto_nombre}`,
        timer: 2500
      })

      loadPedidos() // Recargar datos
    } catch (err: any) {
      console.error('Error procesando recepción:', err)
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.message || 'No se pudo procesar la recepción'
      })
    } finally {
      setProcessingItem(null)
    }
  }

  const getEstadoBadge = (estado: string) => {
    const estilos: Record<string, { bg: string; color: string; label: string }> = {
      en_transito: { bg: '#FEF3C7', color: '#D97706', label: 'En Tránsito' },
      recibido_parcial: { bg: '#DBEAFE', color: '#1E40AF', label: 'Recibido Parcial' },
      pendiente: { bg: '#F3F4F6', color: '#6B7280', label: 'Pendiente' }
    }
    const estilo = estilos[estado] || estilos.pendiente

    return (
      <span style={{
        padding: '4px 10px',
        borderRadius: '12px',
        fontSize: '12px',
        fontWeight: 600,
        background: estilo.bg,
        color: estilo.color
      }}>
        {estilo.label}
      </span>
    )
  }

  // Filtrar pedidos
  const pedidosFiltrados = pedidos.filter(pedido => {
    if (!searchTerm.trim()) return true
    const term = searchTerm.toLowerCase()
    return (
      pedido.numero_pedido.toLowerCase().includes(term) ||
      pedido.proveedor_nombre.toLowerCase().includes(term) ||
      pedido.items.some(item =>
        item.producto_codigo.toLowerCase().includes(term) ||
        item.producto_nombre.toLowerCase().includes(term)
      )
    )
  })

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <p>Cargando pedidos...</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#1F2937', marginBottom: '8px' }}>
          Pedidos en Tránsito
        </h1>
        <p style={{ color: '#6B7280', fontSize: '14px' }}>
          Gestiona la recepción de productos pendientes de entrega
        </p>
      </div>

      {/* Buscador */}
      <div style={{ marginBottom: '24px', position: 'relative', maxWidth: '400px' }}>
        <Search
          size={18}
          style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#9CA3AF'
          }}
        />
        <input
          type="text"
          placeholder="Buscar por pedido, proveedor o producto..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 10px 10px 40px',
            border: '1px solid #D1D5DB',
            borderRadius: '8px',
            fontSize: '14px'
          }}
        />
      </div>

      {/* Lista de pedidos */}
      {pedidosFiltrados.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          background: 'white',
          borderRadius: '12px',
          border: '1px solid #E5E7EB'
        }}>
          <Truck size={48} style={{ color: '#D1D5DB', margin: '0 auto 16px' }} />
          <p style={{ fontSize: '16px', fontWeight: 600, color: '#6B7280' }}>
            No hay pedidos en tránsito
          </p>
          <p style={{ fontSize: '14px', color: '#9CA3AF', marginTop: '8px' }}>
            Los pedidos con productos pendientes de recepción aparecerán aquí
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '16px' }}>
          {pedidosFiltrados.map((pedido) => (
            <div
              key={pedido.pedido_id}
              style={{
                background: 'white',
                borderRadius: '12px',
                border: '1px solid #E5E7EB',
                overflow: 'hidden',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
              }}
            >
              {/* Cabecera del pedido */}
              <div
                onClick={() => togglePedido(pedido.pedido_id)}
                style={{
                  padding: '16px 20px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                  background: '#F9FAFB',
                  borderBottom: expandedPedidos.has(pedido.pedido_id) ? '1px solid #E5E7EB' : 'none'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    background: '#DC2626',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Package size={20} color="white" />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '16px', color: '#1F2937' }}>
                      {pedido.numero_pedido}
                    </div>
                    <div style={{ fontSize: '13px', color: '#6B7280' }}>
                      {pedido.proveedor_nombre}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#6B7280' }}>
                      <Calendar size={14} />
                      {new Date(pedido.fecha_pedido).toLocaleDateString('es-CL')}
                    </div>
                    {pedido.fecha_estimada_llegada && (
                      <div style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '2px' }}>
                        Est. llegada: {new Date(pedido.fecha_estimada_llegada).toLocaleDateString('es-CL')}
                      </div>
                    )}
                  </div>
                  {getEstadoBadge(pedido.estado_pedido)}
                  <div style={{ color: '#6B7280', marginLeft: '8px' }}>
                    {expandedPedidos.has(pedido.pedido_id) ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </div>
                </div>
              </div>

              {/* Items del pedido */}
              {expandedPedidos.has(pedido.pedido_id) && (
                <div style={{ padding: '16px 20px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #E5E7EB' }}>
                        <th style={{ padding: '10px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: '#374151', textTransform: 'uppercase' }}>
                          Producto
                        </th>
                        <th style={{ padding: '10px', textAlign: 'center', fontSize: '12px', fontWeight: 700, color: '#374151', textTransform: 'uppercase' }}>
                          Pedido
                        </th>
                        <th style={{ padding: '10px', textAlign: 'center', fontSize: '12px', fontWeight: 700, color: '#374151', textTransform: 'uppercase' }}>
                          Recibido
                        </th>
                        <th style={{ padding: '10px', textAlign: 'center', fontSize: '12px', fontWeight: 700, color: '#374151', textTransform: 'uppercase' }}>
                          Pendiente
                        </th>
                        <th style={{ padding: '10px', textAlign: 'center', fontSize: '12px', fontWeight: 700, color: '#374151', textTransform: 'uppercase' }}>
                          Estado
                        </th>
                        <th style={{ padding: '10px', textAlign: 'center', fontSize: '12px', fontWeight: 700, color: '#374151', textTransform: 'uppercase' }}>
                          Acción
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pedido.items.map((item) => (
                        <tr
                          key={item.item_id}
                          style={{ borderBottom: '1px solid #E5E7EB' }}
                        >
                          <td style={{ padding: '12px 10px' }}>
                            <div style={{ fontWeight: 600, color: '#DC2626', fontSize: '14px' }}>
                              {item.producto_codigo}
                            </div>
                            <div style={{ fontSize: '13px', color: '#6B7280' }}>
                              {item.producto_nombre}
                            </div>
                          </td>
                          <td style={{ padding: '12px 10px', textAlign: 'center', fontSize: '14px', fontWeight: 600 }}>
                            {item.cantidad_pedida}
                          </td>
                          <td style={{ padding: '12px 10px', textAlign: 'center', fontSize: '14px', color: '#059669', fontWeight: 600 }}>
                            {item.cantidad_recibida}
                          </td>
                          <td style={{ padding: '12px 10px', textAlign: 'center', fontSize: '14px', color: '#D97706', fontWeight: 600 }}>
                            {item.cantidad_pendiente}
                          </td>
                          <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                            {getEstadoBadge(item.estado_item)}
                          </td>
                          <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                            {item.cantidad_pendiente > 0 ? (
                              <button
                                onClick={() => confirmarRecepcion(item)}
                                disabled={processingItem === item.item_id}
                                style={{
                                  padding: '6px 12px',
                                  background: '#059669',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '6px',
                                  cursor: processingItem === item.item_id ? 'not-allowed' : 'pointer',
                                  fontSize: '13px',
                                  fontWeight: 600,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  opacity: processingItem === item.item_id ? 0.6 : 1
                                }}
                              >
                                <CheckCircle size={14} />
                                {processingItem === item.item_id ? 'Procesando...' : 'Recibir'}
                              </button>
                            ) : (
                              <span style={{
                                padding: '6px 12px',
                                background: '#D1FAE5',
                                color: '#059669',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: 600
                              }}>
                                Completo
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {pedido.observaciones && (
                    <div style={{
                      marginTop: '12px',
                      padding: '12px',
                      background: '#F9FAFB',
                      borderRadius: '6px',
                      fontSize: '13px',
                      color: '#6B7280'
                    }}>
                      <strong>Observaciones:</strong> {pedido.observaciones}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
