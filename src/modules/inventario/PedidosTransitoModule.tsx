import { useEffect, useState, useMemo, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { LoadingOverlay } from '../../components/ui/LoadingOverlay'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../../components/ui/DataTable/DataTable'
import Swal from 'sweetalert2'
import { showSuccess } from '../../utils/toast'
import {
  Package,
  Truck,
  CheckCircle,
  Calendar,
  ChevronDown,
  ChevronUp,
  ArrowDownCircle,
  Search,
  Filter
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

interface EntradaTransito {
  id: string
  producto_id: string
  producto_codigo: string
  producto_nombre: string
  producto_tipo: string
  cantidad: number
  proveedor_id: string
  proveedor_nombre: string
  observaciones: string | null
  created_at: string
  usuario_registro: string | null
  estado_aprobacion: string
  fecha_aprobacion: string | null
  aprobador_nombre: string | null
}

export function PedidosTransitoModule() {
  const [pedidos, setPedidos] = useState<PedidoAgrupado[]>([])
  const [entradasSimples, setEntradasSimples] = useState<EntradaTransito[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedPedidos, setExpandedPedidos] = useState<Set<string>>(new Set())
  const [searchPedidos, setSearchPedidos] = useState('')
  const [processingItem, setProcessingItem] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'entradas' | 'pedidos'>('entradas')

  // Excel-style column filter states
  const [openColumnFilter, setOpenColumnFilter] = useState<string | null>(null)
  const [productoFilter, setProductoFilter] = useState<string[]>([])
  const [proveedorFilter, setProveedorFilter] = useState<string[]>([])
  const [tipoProductoFilter] = useState<string[]>([])
  const filterRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadData()
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

  const loadData = async () => {
    try {
      setLoading(true)
      await Promise.all([loadEntradasSimples(), loadPedidos()])
    } catch (err) {
      console.error('Error cargando datos:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadEntradasSimples = async () => {
    try {
      const { data, error } = await supabase
        .from('v_entradas_en_transito')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setEntradasSimples((data || []) as EntradaTransito[])
    } catch (err) {
      console.error('Error cargando entradas simples:', err)
    }
  }

  const loadPedidos = async () => {
    try {
      const { data, error } = await supabase
        .from('v_pedidos_en_transito')
        .select('*')
        .order('fecha_pedido', { ascending: false })

      if (error) throw error

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
      setExpandedPedidos(new Set(pedidosMap.keys()))
    } catch (err) {
      console.error('Error cargando pedidos:', err)
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

  const confirmarEntradaSimple = async (entrada: EntradaTransito) => {
    const { value: cantidad } = await Swal.fire({
      title: 'Confirmar Recepcion',
      html: `
        <div style="text-align: left; margin-bottom: 16px;">
          <p><strong>Producto:</strong> ${entrada.producto_codigo} - ${entrada.producto_nombre}</p>
          <p><strong>Proveedor:</strong> ${entrada.proveedor_nombre}</p>
          <p><strong>Cantidad en transito:</strong> ${entrada.cantidad} unidades</p>
        </div>
        <label style="display: block; margin-bottom: 8px; font-weight: 600;">
          Cantidad recibida:
        </label>
      `,
      input: 'text',
      inputValue: String(entrada.cantidad),
      inputAttributes: { autocomplete: 'off', inputmode: 'numeric', pattern: '[0-9]*' },
      showCancelButton: true,
      confirmButtonText: 'Confirmar Recepcion',
      confirmButtonColor: '#059669',
      cancelButtonText: 'Cancelar',
      didOpen: () => {
        const input = Swal.getInput()
        if (input) {
          input.addEventListener('input', (e) => {
            const target = e.target as HTMLInputElement
            target.value = target.value.replace(/[^0-9]/g, '').replace(/^0+/, '') || ''
          })
        }
      },
      inputValidator: (value) => {
        const num = parseInt(value, 10)
        if (!value || isNaN(num) || num <= 0) return 'Ingresa una cantidad valida'
        if (num > entrada.cantidad) return `La cantidad no puede exceder ${entrada.cantidad}`
        return null
      }
    })

    if (!cantidad) return

    try {
      setProcessingItem(entrada.id)
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error } = await (supabase.rpc as any)('confirmar_recepcion_entrada', {
        p_movimiento_id: entrada.id,
        p_usuario_id: user?.id,
        p_cantidad_recibida: Number(cantidad)
      })

      if (error) throw error
      const result = data as { success: boolean; error?: string; mensaje?: string }
      if (!result.success) throw new Error(result.error || 'Error procesando recepcion')

      showSuccess('Recepción confirmada', result.mensaje || `Se recibieron ${cantidad} unidades`)
      loadData()
    } catch (err: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.message || 'No se pudo procesar' })
    } finally {
      setProcessingItem(null)
    }
  }

  const confirmarRecepcion = async (item: PedidoItem) => {
    const cantidadPendiente = item.cantidad_pendiente

    const { value: cantidad } = await Swal.fire({
      title: 'Confirmar Recepcion',
      html: `
        <div style="text-align: left; margin-bottom: 16px;">
          <p><strong>Producto:</strong> ${item.producto_codigo} - ${item.producto_nombre}</p>
          <p><strong>Cantidad pendiente:</strong> ${cantidadPendiente} unidades</p>
        </div>
        <label style="display: block; margin-bottom: 8px; font-weight: 600;">
          Cantidad recibida:
        </label>
      `,
      input: 'text',
      inputValue: String(cantidadPendiente),
      inputAttributes: { autocomplete: 'off', inputmode: 'numeric', pattern: '[0-9]*' },
      showCancelButton: true,
      confirmButtonText: 'Confirmar Recepcion',
      confirmButtonColor: '#059669',
      cancelButtonText: 'Cancelar',
      didOpen: () => {
        const input = Swal.getInput()
        if (input) {
          input.addEventListener('input', (e) => {
            const target = e.target as HTMLInputElement
            target.value = target.value.replace(/[^0-9]/g, '').replace(/^0+/, '') || ''
          })
        }
      },
      inputValidator: (value) => {
        const num = parseInt(value, 10)
        if (!value || isNaN(num) || num <= 0) return 'Ingresa una cantidad valida'
        if (num > cantidadPendiente) return `La cantidad no puede exceder ${cantidadPendiente}`
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
      if (!result.success) throw new Error(result.error || 'Error procesando recepcion')

      showSuccess('Recepción confirmada', `Se recibieron ${cantidad} unidades`)
      loadData()
    } catch (err: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.message || 'No se pudo procesar' })
    } finally {
      setProcessingItem(null)
    }
  }

  const getEstadoBadge = (estado: string) => {
    const estilos: Record<string, { bg: string; color: string; label: string }> = {
      en_transito: { bg: 'var(--badge-yellow-bg)', color: 'var(--badge-yellow-text)', label: 'En Transito' },
      recibido_parcial: { bg: 'var(--badge-blue-bg)', color: 'var(--badge-blue-text)', label: 'Parcial' },
      pendiente: { bg: 'var(--badge-gray-bg)', color: 'var(--badge-gray-text)', label: 'Pendiente' }
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

  // Unique value lists for filters
  const uniqueProductos = useMemo(() =>
    [...new Set(entradasSimples.map(e => e.producto_nombre))].filter(Boolean) as string[],
    [entradasSimples]
  )
  const uniqueProveedores = useMemo(() =>
    [...new Set(entradasSimples.map(e => e.proveedor_nombre))].filter(Boolean) as string[],
    [entradasSimples]
  )
  // Toggle functions
  const toggleProductoFilter = (value: string) => {
    setProductoFilter(prev =>
      prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]
    )
  }
  const toggleProveedorFilter = (value: string) => {
    setProveedorFilter(prev =>
      prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]
    )
  }
  // Filtered Entradas Simples data
  const entradasFiltered = useMemo(() => {
    let data = entradasSimples
    if (productoFilter.length > 0) {
      data = data.filter(e => productoFilter.includes(e.producto_nombre))
    }
    if (proveedorFilter.length > 0) {
      data = data.filter(e => proveedorFilter.includes(e.proveedor_nombre))
    }
    if (tipoProductoFilter.length > 0) {
      data = data.filter(e => tipoProductoFilter.includes(e.producto_tipo))
    }
    return data
  }, [entradasSimples, productoFilter, proveedorFilter, tipoProductoFilter])

  // Columnas para Entradas Simples
  const entradasColumns = useMemo<ColumnDef<EntradaTransito, any>[]>(() => [
    {
      accessorKey: 'producto_codigo',
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
          <div style={{ fontWeight: 600, color: 'var(--color-primary)', fontSize: '14px' }}>
            {row.original.producto_codigo}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            {row.original.producto_nombre}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
            {row.original.producto_tipo}
          </div>
        </div>
      )
    },
    {
      accessorKey: 'proveedor_nombre',
      header: () => (
        <div className="dt-column-filter" ref={openColumnFilter === 'proveedor' ? filterRef : null}>
          <span>Proveedor {proveedorFilter.length > 0 && `(${proveedorFilter.length})`}</span>
          <button
            className={`dt-column-filter-btn ${proveedorFilter.length > 0 ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setOpenColumnFilter(openColumnFilter === 'proveedor' ? null : 'proveedor') }}
          >
            <Filter size={12} />
          </button>
          {openColumnFilter === 'proveedor' && (
            <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
              <div className="dt-excel-filter-list">
                {uniqueProveedores.map(proveedor => (
                  <label key={proveedor} className={`dt-column-filter-checkbox ${proveedorFilter.includes(proveedor) ? 'selected' : ''}`}>
                    <input type="checkbox" checked={proveedorFilter.includes(proveedor)} onChange={() => toggleProveedorFilter(proveedor)} />
                    <span>{proveedor}</span>
                  </label>
                ))}
              </div>
              {proveedorFilter.length > 0 && (
                <button className="dt-column-filter-clear" onClick={() => setProveedorFilter([])}>
                  Limpiar ({proveedorFilter.length})
                </button>
              )}
            </div>
          )}
        </div>
      ),
      cell: ({ row }) => (
        <span style={{ color: 'var(--text-primary)', fontSize: '14px' }}>
          {row.original.proveedor_nombre}
        </span>
      )
    },
    {
      accessorKey: 'cantidad',
      header: 'Cantidad',
      cell: ({ row }) => (
        <div style={{ textAlign: 'center' }}>
          <span style={{
            fontSize: '15px',
            fontWeight: 700,
            color: 'var(--badge-yellow-text)',
            background: 'var(--badge-yellow-bg)',
            padding: '4px 12px',
            borderRadius: '8px'
          }}>
            {row.original.cantidad}
          </span>
        </div>
      )
    },
    {
      accessorKey: 'created_at',
      header: 'Fecha',
      cell: ({ row }) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '13px' }}>
          <Calendar size={14} />
          {new Date(row.original.created_at).toLocaleDateString('es-CL')}
        </div>
      )
    },
    {
      accessorKey: 'aprobador_nombre',
      header: 'Aprobado por',
      cell: ({ row }) => (
        <div style={{ fontSize: '13px' }}>
          <div style={{ color: 'var(--color-success)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
            <CheckCircle size={14} />
            {row.original.aprobador_nombre || 'Sistema'}
          </div>
          {row.original.fecha_aprobacion && (
            <div style={{ color: 'var(--text-tertiary)', fontSize: '11px', marginTop: '2px' }}>
              {new Date(row.original.fecha_aprobacion).toLocaleDateString('es-CL')}
            </div>
          )}
        </div>
      )
    },
    {
      id: 'acciones',
      header: 'Accion',
      cell: ({ row }) => (
        <div style={{ textAlign: 'center' }}>
          <button
            onClick={() => confirmarEntradaSimple(row.original)}
            disabled={processingItem === row.original.id}
            style={{
              padding: '8px 14px',
              background: 'var(--color-success)',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: processingItem === row.original.id ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              opacity: processingItem === row.original.id ? 0.6 : 1
            }}
          >
            <CheckCircle size={15} />
            {processingItem === row.original.id ? 'Procesando...' : 'Recepcionar'}
          </button>
        </div>
      )
    }
  ], [processingItem, openColumnFilter, productoFilter, proveedorFilter, uniqueProductos, uniqueProveedores])

  // Filtrar pedidos por busqueda
  const pedidosFiltrados = useMemo(() => {
    if (!searchPedidos.trim()) return pedidos
    const term = searchPedidos.toLowerCase()
    return pedidos.filter(pedido =>
      pedido.numero_pedido.toLowerCase().includes(term) ||
      pedido.proveedor_nombre.toLowerCase().includes(term) ||
      pedido.items.some(item =>
        item.producto_codigo.toLowerCase().includes(term) ||
        item.producto_nombre.toLowerCase().includes(term)
      )
    )
  }, [pedidos, searchPedidos])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <LoadingOverlay show={loading} message="Cargando pedidos..." size="lg" />
      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-primary)', paddingBottom: '0' }}>
        <button
          onClick={() => setActiveTab('entradas')}
          style={{
            padding: '12px 20px',
            background: 'none',
            border: 'none',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
            color: activeTab === 'entradas' ? 'var(--color-primary)' : 'var(--text-secondary)',
            borderBottom: activeTab === 'entradas' ? '2px solid var(--color-primary)' : '2px solid transparent',
            marginBottom: '-1px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <ArrowDownCircle size={18} />
          Entradas Simples
          {entradasSimples.length > 0 && (
            <span style={{
              background: 'var(--badge-red-bg)',
              color: 'var(--color-primary)',
              padding: '2px 8px',
              borderRadius: '10px',
              fontSize: '12px',
              fontWeight: 700
            }}>
              {entradasSimples.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('pedidos')}
          style={{
            padding: '12px 20px',
            background: 'none',
            border: 'none',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
            color: activeTab === 'pedidos' ? 'var(--color-primary)' : 'var(--text-secondary)',
            borderBottom: activeTab === 'pedidos' ? '2px solid var(--color-primary)' : '2px solid transparent',
            marginBottom: '-1px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Package size={18} />
          Pedidos por Lote
          {pedidos.length > 0 && (
            <span style={{
              background: 'var(--badge-red-bg)',
              color: 'var(--color-primary)',
              padding: '2px 8px',
              borderRadius: '10px',
              fontSize: '12px',
              fontWeight: 700
            }}>
              {pedidos.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab: Entradas Simples con DataTable */}
      {activeTab === 'entradas' && (
        <DataTable
          data={entradasFiltered}
          columns={entradasColumns}
          loading={loading}
          searchPlaceholder="Buscar por producto o proveedor..."
          emptyIcon={<ArrowDownCircle size={48} />}
          emptyTitle="No hay entradas pendientes de recepcion"
          emptyDescription="Las entradas aprobadas pendientes de recepcionar apareceran aqui"
pageSize={100}
          pageSizeOptions={[10, 20, 50, 100]}
        />
      )}

      {/* Tab: Pedidos por Lote */}
      {activeTab === 'pedidos' && (
        <>
          {/* Buscador para pedidos */}
          <div style={{ position: 'relative', maxWidth: '400px' }}>
            <Search
              size={18}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-tertiary)'
              }}
            />
            <input
              type="text"
              placeholder="Buscar pedido, proveedor o producto..."
              value={searchPedidos}
              onChange={(e) => setSearchPedidos(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 10px 10px 40px',
                border: '1px solid var(--border-primary)',
                borderRadius: '8px',
                fontSize: '14px',
                background: 'var(--input-bg)',
                color: 'var(--text-primary)'
              }}
            />
          </div>

          {pedidosFiltrados.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '60px 20px',
              background: 'var(--card-bg)',
              borderRadius: '12px',
              border: '1px solid var(--border-primary)'
            }}>
              <Truck size={48} style={{ color: 'var(--text-tertiary)', margin: '0 auto 16px' }} />
              <p style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                No hay pedidos en transito
              </p>
              <p style={{ fontSize: '14px', color: 'var(--text-tertiary)', marginTop: '8px' }}>
                Los pedidos con productos pendientes de recepcion apareceran aqui
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '16px' }}>
              {pedidosFiltrados.map((pedido) => (
                <div
                  key={pedido.pedido_id}
                  style={{
                    background: 'var(--card-bg)',
                    borderRadius: '12px',
                    border: '1px solid var(--border-primary)',
                    overflow: 'hidden'
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
                      background: 'var(--table-header-bg)',
                      borderBottom: expandedPedidos.has(pedido.pedido_id) ? '1px solid var(--border-primary)' : 'none'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{
                        width: '40px',
                        height: '40px',
                        background: 'var(--color-primary)',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <Package size={20} color="white" />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>
                          {pedido.numero_pedido}
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                          {pedido.proveedor_nombre} • {pedido.items.length} items
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                          <Calendar size={14} />
                          {new Date(pedido.fecha_pedido).toLocaleDateString('es-CL')}
                        </div>
                        {pedido.fecha_estimada_llegada && (
                          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                            Est: {new Date(pedido.fecha_estimada_llegada).toLocaleDateString('es-CL')}
                          </div>
                        )}
                      </div>
                      {getEstadoBadge(pedido.estado_pedido)}
                      <div style={{ color: 'var(--text-secondary)' }}>
                        {expandedPedidos.has(pedido.pedido_id) ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                      </div>
                    </div>
                  </div>

                  {/* Items del pedido */}
                  {expandedPedidos.has(pedido.pedido_id) && (
                    <div style={{ padding: '16px 20px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom: '2px solid var(--border-primary)' }}>
                            <th style={{ padding: '10px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                              Producto
                            </th>
                            <th style={{ padding: '10px', textAlign: 'center', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                              Pedido
                            </th>
                            <th style={{ padding: '10px', textAlign: 'center', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                              Recibido
                            </th>
                            <th style={{ padding: '10px', textAlign: 'center', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                              Pendiente
                            </th>
                            <th style={{ padding: '10px', textAlign: 'center', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                              Accion
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {pedido.items.map((item) => (
                            <tr key={item.item_id} style={{ borderBottom: '1px solid var(--border-primary)' }}>
                              <td style={{ padding: '12px 10px' }}>
                                <div style={{ fontWeight: 600, color: 'var(--color-primary)', fontSize: '14px' }}>
                                  {item.producto_codigo}
                                </div>
                                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                                  {item.producto_nombre}
                                </div>
                              </td>
                              <td style={{ padding: '12px 10px', textAlign: 'center', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                {item.cantidad_pedida}
                              </td>
                              <td style={{ padding: '12px 10px', textAlign: 'center', fontSize: '14px', color: 'var(--color-success)', fontWeight: 600 }}>
                                {item.cantidad_recibida}
                              </td>
                              <td style={{ padding: '12px 10px', textAlign: 'center', fontSize: '14px', color: 'var(--color-warning)', fontWeight: 600 }}>
                                {item.cantidad_pendiente}
                              </td>
                              <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                                {item.cantidad_pendiente > 0 ? (
                                  <button
                                    onClick={() => confirmarRecepcion(item)}
                                    disabled={processingItem === item.item_id}
                                    style={{
                                      padding: '6px 12px',
                                      background: 'var(--color-success)',
                                      color: 'white',
                                      border: 'none',
                                      borderRadius: '6px',
                                      cursor: processingItem === item.item_id ? 'not-allowed' : 'pointer',
                                      fontSize: '12px',
                                      fontWeight: 600,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      opacity: processingItem === item.item_id ? 0.6 : 1
                                    }}
                                  >
                                    <CheckCircle size={14} />
                                    Recibir
                                  </button>
                                ) : (
                                  <span style={{
                                    padding: '6px 12px',
                                    background: 'var(--badge-green-bg)',
                                    color: 'var(--badge-green-text)',
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
                          padding: '10px 12px',
                          background: 'var(--bg-secondary)',
                          borderRadius: '6px',
                          fontSize: '13px',
                          color: 'var(--text-secondary)',
                          border: '1px solid var(--border-secondary)'
                        }}>
                          <strong>Obs:</strong> {pedido.observaciones}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
