// src/modules/inventario/PedidosUnificadoModule.tsx
// Módulo unificado que combina Pedidos en Tránsito y Aprobaciones Pendientes
import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { usePermissions } from '../../contexts/PermissionsContext'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../../components/ui/DataTable/DataTable'
import Swal from 'sweetalert2'
import {
  Package,
  Truck,
  CheckCircle,
  Calendar,
  ChevronDown,
  ChevronUp,
  ArrowDownCircle,
  Search,
  Check,
  X,
  Eye,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  RotateCcw,
  Filter,
  RefreshCw,
  History,
  XCircle
} from 'lucide-react'

// ============= TIPOS =============
// Tipos para Pedidos en Tránsito
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

// Tipos para Aprobaciones
interface MovimientoPendiente {
  id: string
  tipo: 'entrada' | 'salida' | 'asignacion' | 'devolucion'
  cantidad: number
  observaciones: string | null
  created_at: string
  motivo_salida: string | null
  estado_retorno: string | null
  producto_id: string
  producto_nombre: string
  producto_tipo: string
  proveedor_id: string | null
  proveedor_nombre: string | null
  vehiculo_id: string | null
  vehiculo_patente: string | null
  servicio_id: string | null
  usuario_registrador_id: string
  usuario_registrador_nombre: string
}

interface MovimientoHistorico {
  id: string
  tipo: string
  cantidad: number
  observaciones: string | null
  created_at: string
  estado_aprobacion: 'aprobado' | 'rechazado'
  fecha_aprobacion: string | null
  motivo_rechazo: string | null
  producto_nombre: string
  usuario_registrador_nombre: string
  usuario_aprobador_nombre: string | null
}

type TabActiva = 'entradas' | 'pedidos' | 'pendientes' | 'historico'
type FiltroTipo = 'todos' | 'entrada' | 'salida' | 'asignacion' | 'devolucion'

export function PedidosUnificadoModule() {
  const { user, profile } = useAuth()
  const { canCreateInSubmenu, canEditInSubmenu, canDeleteInSubmenu } = usePermissions()

  // Permisos específicos para el submenú de pedidos
  const canCreate = canCreateInSubmenu('pedidos')
  const canEdit = canEditInSubmenu('pedidos')
  const canDelete = canDeleteInSubmenu('pedidos')

  // Estado de tab activa
  const [activeTab, setActiveTab] = useState<TabActiva>('entradas')

  // Estados para Pedidos en Tránsito
  const [pedidos, setPedidos] = useState<PedidoAgrupado[]>([])
  const [entradasSimples, setEntradasSimples] = useState<EntradaTransito[]>([])
  const [loadingPedidos, setLoadingPedidos] = useState(true)
  const [expandedPedidos, setExpandedPedidos] = useState<Set<string>>(new Set())
  const [searchPedidos, setSearchPedidos] = useState('')
  const [processingItem, setProcessingItem] = useState<string | null>(null)

  // Estados para Aprobaciones
  const [movimientos, setMovimientos] = useState<MovimientoPendiente[]>([])
  const [historico, setHistorico] = useState<MovimientoHistorico[]>([])
  const [loadingAprobaciones, setLoadingAprobaciones] = useState(true)
  const [loadingHistorico, setLoadingHistorico] = useState(false)
  const [processing, setProcessing] = useState<string | null>(null)
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>('todos')

  // Excel-style column filter states for Entradas Simples
  const [openColumnFilter, setOpenColumnFilter] = useState<string | null>(null)
  const [productoFilter, setProductoFilter] = useState<string[]>([])
  const [proveedorFilter, setProveedorFilter] = useState<string[]>([])
  const [tipoProductoFilter] = useState<string[]>([])
  const filterRef = useRef<HTMLDivElement>(null)

  const userRole = profile?.roles?.name || ''
  const canApprove = userRole === 'encargado' || userRole === 'admin' || userRole === 'supervisor'

  // ============= EFECTOS =============
  useEffect(() => {
    loadPedidosData()
    if (canApprove) {
      cargarMovimientosPendientes()
    } else {
      setLoadingAprobaciones(false)
    }
  }, [canApprove])

  useEffect(() => {
    if (activeTab === 'historico' && historico.length === 0 && canApprove) {
      cargarHistorico()
    }
  }, [activeTab, canApprove])

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

  // ============= FUNCIONES PEDIDOS EN TRÁNSITO =============
  const loadPedidosData = async () => {
    try {
      setLoadingPedidos(true)
      await Promise.all([loadEntradasSimples(), loadPedidos()])
    } catch (err) {
      console.error('Error cargando datos:', err)
    } finally {
      setLoadingPedidos(false)
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

      Swal.fire({
        icon: 'success',
        title: 'Recepcion confirmada',
        text: result.mensaje || `Se recibieron ${cantidad} unidades`,
        timer: 2500
      })
      loadPedidosData()
    } catch (err: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.message || 'No se pudo procesar' })
    } finally {
      setProcessingItem(null)
    }
  }

  const confirmarRecepcion = async (item: PedidoItem) => {
    // Validar permisos
    if (!canEdit) {
      Swal.fire('Sin permisos', 'No tienes permisos para confirmar recepciones', 'error')
      return
    }

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

      Swal.fire({
        icon: 'success',
        title: 'Recepcion confirmada',
        text: `Se recibieron ${cantidad} unidades`,
        timer: 2500
      })
      loadPedidosData()
    } catch (err: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.message || 'No se pudo procesar' })
    } finally {
      setProcessingItem(null)
    }
  }

  // ============= FUNCIONES APROBACIONES =============
  const cargarMovimientosPendientes = async () => {
    setLoadingAprobaciones(true)
    try {
      const { data, error } = await supabase
        .from('v_movimientos_pendientes')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setMovimientos(data || [])
    } catch (error) {
      console.error('Error cargando movimientos pendientes:', error)
      Swal.fire('Error', 'No se pudieron cargar los movimientos pendientes', 'error')
    } finally {
      setLoadingAprobaciones(false)
    }
  }

  const cargarHistorico = async () => {
    setLoadingHistorico(true)
    try {
      const { data, error } = await supabase
        .from('movimientos')
        .select(`
          id,
          tipo_movimiento,
          cantidad,
          observaciones,
          created_at,
          estado_aprobacion,
          fecha_aprobacion,
          motivo_rechazo,
          usuario_id,
          productos (nombre),
          aprobador:usuario_aprobador_id (full_name)
        `)
        .in('estado_aprobacion', ['aprobado', 'rechazado'])
        .order('fecha_aprobacion', { ascending: false, nullsFirst: false })
        .limit(50)

      if (error) throw error

      const usuarioIds = [...new Set((data || []).map((m: any) => m.usuario_id).filter(Boolean))]
      const { data: perfiles } = await supabase
        .from('user_profiles')
        .select('id, full_name')
        .in('id', usuarioIds)

      const perfilesMap = new Map((perfiles || []).map((p: any) => [p.id, p.full_name]))

      const historicoFormateado: MovimientoHistorico[] = (data || []).map((mov: any) => ({
        id: mov.id,
        tipo: mov.tipo_movimiento,
        cantidad: mov.cantidad,
        observaciones: mov.observaciones,
        created_at: mov.created_at,
        estado_aprobacion: mov.estado_aprobacion,
        fecha_aprobacion: mov.fecha_aprobacion,
        motivo_rechazo: mov.motivo_rechazo,
        producto_nombre: mov.productos?.nombre || 'Producto eliminado',
        usuario_registrador_nombre: perfilesMap.get(mov.usuario_id) || 'Usuario desconocido',
        usuario_aprobador_nombre: mov.aprobador?.full_name || null
      }))

      setHistorico(historicoFormateado)
    } catch (error) {
      console.error('Error cargando histórico:', error)
      Swal.fire('Error', 'No se pudo cargar el histórico de aprobaciones', 'error')
    } finally {
      setLoadingHistorico(false)
    }
  }

  const aprobarMovimiento = async (movimiento: MovimientoPendiente) => {
    // Validar permisos
    if (!canEdit) {
      Swal.fire('Sin permisos', 'No tienes permisos para aprobar movimientos', 'error')
      return
    }

    const vehiculoInfo = movimiento.vehiculo_patente
      ? `<p><strong>Vehículo:</strong> ${movimiento.vehiculo_patente}</p>`
      : ''

    const result = await Swal.fire({
      title: 'Aprobar Movimiento',
      html: `
        <div style="text-align: left;">
          <p><strong>Tipo:</strong> ${getTipoLabel(movimiento.tipo)}</p>
          <p><strong>Producto:</strong> ${movimiento.producto_nombre}</p>
          <p><strong>Cantidad:</strong> ${movimiento.cantidad}</p>
          ${vehiculoInfo}
          <p><strong>Registrado por:</strong> ${movimiento.usuario_registrador_nombre}</p>
          ${movimiento.observaciones ? `<p><strong>Observaciones:</strong> ${movimiento.observaciones}</p>` : ''}
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#10B981',
      cancelButtonColor: '#6B7280',
      confirmButtonText: 'Aprobar',
      cancelButtonText: 'Cancelar'
    })

    if (!result.isConfirmed) return

    setProcessing(movimiento.id)
    try {
      const { data: rpcResult, error: rpcError } = await (supabase.rpc as any)('aprobar_rechazar_movimiento', {
        p_movimiento_id: movimiento.id,
        p_accion: 'aprobar',
        p_usuario_id: user?.id,
        p_motivo_rechazo: null
      })

      if (rpcError) throw rpcError
      if (rpcResult && !rpcResult.success) throw new Error(rpcResult.error)

      await Swal.fire({
        title: '¡Aprobado!',
        text: 'El movimiento ha sido aprobado y el stock actualizado',
        icon: 'success',
        timer: 2000,
        showConfirmButton: false
      })

      cargarMovimientosPendientes()
    } catch (error: any) {
      console.error('Error aprobando movimiento:', error)
      Swal.fire('Error', error.message || 'No se pudo aprobar el movimiento', 'error')
    } finally {
      setProcessing(null)
    }
  }

  const rechazarMovimiento = async (movimiento: MovimientoPendiente) => {
    // Validar permisos
    if (!canEdit) {
      Swal.fire('Sin permisos', 'No tienes permisos para rechazar movimientos', 'error')
      return
    }

    const vehiculoInfo = movimiento.vehiculo_patente
      ? `<p><strong>Vehículo:</strong> ${movimiento.vehiculo_patente}</p>`
      : ''

    const { value: motivo } = await Swal.fire({
      title: 'Rechazar Movimiento',
      html: `
        <div style="text-align: left; margin-bottom: 16px;">
          <p><strong>Tipo:</strong> ${getTipoLabel(movimiento.tipo)}</p>
          <p><strong>Producto:</strong> ${movimiento.producto_nombre}</p>
          <p><strong>Cantidad:</strong> ${movimiento.cantidad}</p>
          ${vehiculoInfo}
          <p><strong>Registrado por:</strong> ${movimiento.usuario_registrador_nombre}</p>
        </div>
      `,
      input: 'textarea',
      inputLabel: 'Motivo del rechazo (obligatorio)',
      inputPlaceholder: 'Explica por qué se rechaza este movimiento...',
      inputAttributes: {
        'aria-label': 'Motivo del rechazo'
      },
      showCancelButton: true,
      confirmButtonColor: '#EF4444',
      cancelButtonColor: '#6B7280',
      confirmButtonText: 'Rechazar',
      cancelButtonText: 'Cancelar',
      inputValidator: (value) => {
        if (!value || value.trim().length < 10) {
          return 'El motivo debe tener al menos 10 caracteres'
        }
        return null
      }
    })

    if (!motivo) return

    setProcessing(movimiento.id)
    try {
      const { data: rpcResult, error: rejectError } = await (supabase.rpc as any)('aprobar_rechazar_movimiento', {
        p_movimiento_id: movimiento.id,
        p_accion: 'rechazar',
        p_usuario_id: user?.id,
        p_motivo_rechazo: motivo.trim()
      })

      if (rejectError) throw rejectError
      if (rpcResult && !rpcResult.success) throw new Error(rpcResult.error)

      await Swal.fire({
        title: 'Rechazado',
        text: 'El movimiento ha sido rechazado',
        icon: 'info',
        timer: 2000,
        showConfirmButton: false
      })

      cargarMovimientosPendientes()
    } catch (error: any) {
      console.error('Error rechazando movimiento:', error)
      Swal.fire('Error', error.message || 'No se pudo rechazar el movimiento', 'error')
    } finally {
      setProcessing(null)
    }
  }

  const verDetalles = (movimiento: MovimientoPendiente) => {
    let detallesHtml = `
      <div style="text-align: left;">
        <p><strong>Tipo:</strong> ${getTipoLabel(movimiento.tipo)}</p>
        <p><strong>Producto:</strong> ${movimiento.producto_nombre}</p>
        <p><strong>Cantidad:</strong> ${movimiento.cantidad}</p>
    `

    if (movimiento.vehiculo_patente) {
      detallesHtml += `<p><strong>Vehículo:</strong> ${movimiento.vehiculo_patente}</p>`
    }

    if (movimiento.proveedor_nombre) {
      detallesHtml += `<p><strong>Proveedor:</strong> ${movimiento.proveedor_nombre}</p>`
    }

    if (movimiento.motivo_salida) {
      detallesHtml += `<p><strong>Motivo:</strong> ${getMotivoSalidaLabel(movimiento.motivo_salida)}</p>`
    }

    if (movimiento.estado_retorno) {
      detallesHtml += `<p><strong>Estado retorno:</strong> ${getEstadoRetornoLabel(movimiento.estado_retorno)}</p>`
    }

    if (movimiento.observaciones) {
      detallesHtml += `<p><strong>Observaciones:</strong> ${movimiento.observaciones}</p>`
    }

    detallesHtml += `
        <hr style="margin: 12px 0;">
        <p><strong>Registrado por:</strong> ${movimiento.usuario_registrador_nombre}</p>
        <p><strong>Fecha:</strong> ${new Date(movimiento.created_at).toLocaleString('es-CL')}</p>
      </div>
    `

    Swal.fire({
      title: 'Detalles del Movimiento',
      html: detallesHtml,
      icon: 'info',
      confirmButtonText: 'Cerrar'
    })
  }

  // ============= HELPERS =============
  const getTipoLabel = (tipo: string): string => {
    const labels: Record<string, string> = {
      entrada: 'Entrada',
      salida: 'Salida',
      asignacion: 'Asignación (Uso)',
      devolucion: 'Devolución'
    }
    return labels[tipo] || tipo
  }

  const getTipoIcon = (tipo: string) => {
    switch (tipo) {
      case 'entrada':
        return <ArrowDownLeft size={16} />
      case 'salida':
        return <ArrowUpRight size={16} />
      case 'asignacion':
        return <Package size={16} />
      case 'devolucion':
        return <RotateCcw size={16} />
      default:
        return <Package size={16} />
    }
  }

  const getTipoColor = (tipo: string): string => {
    switch (tipo) {
      case 'entrada':
        return '#10B981'
      case 'salida':
        return '#EF4444'
      case 'asignacion':
        return '#F59E0B'
      case 'devolucion':
        return '#3B82F6'
      default:
        return '#6B7280'
    }
  }

  const getMotivoSalidaLabel = (motivo: string): string => {
    const labels: Record<string, string> = {
      venta: 'Venta',
      consumo_servicio: 'Consumo en servicio',
      danado: 'Dañado',
      perdido: 'Perdido'
    }
    return labels[motivo] || motivo
  }

  const getEstadoRetornoLabel = (estado: string): string => {
    const labels: Record<string, string> = {
      operativa: 'Operativa',
      danada: 'Dañada',
      perdida: 'Perdida'
    }
    return labels[estado] || estado
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

  // ============= MEMOS =============
  // Unique value lists for Entradas Simples filters
  const uniqueProductos = useMemo(() =>
    [...new Set(entradasSimples.map(e => e.producto_nombre))].filter(Boolean) as string[],
    [entradasSimples]
  )
  const uniqueProveedores = useMemo(() =>
    [...new Set(entradasSimples.map(e => e.proveedor_nombre))].filter(Boolean) as string[],
    [entradasSimples]
  )
  // Toggle functions for Entradas Simples filters
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

  const movimientosFiltrados = filtroTipo === 'todos'
    ? movimientos
    : movimientos.filter(m => m.tipo === filtroTipo)

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

  // ============= RENDER =============
  return (
    <>
      <style>{`
        .pedidos-tabs {
          display: flex;
          gap: 0;
          border-bottom: 2px solid var(--border-primary);
          margin-bottom: 20px;
          overflow-x: auto;
        }

        .pedidos-tab {
          padding: 14px 24px;
          background: none;
          border: none;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          color: var(--text-secondary);
          border-bottom: 2px solid transparent;
          margin-bottom: -2px;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: all 0.2s;
          white-space: nowrap;
        }

        .pedidos-tab:hover {
          color: var(--text-primary);
          background: var(--bg-secondary);
        }

        .pedidos-tab.active {
          color: var(--color-primary);
          border-bottom-color: var(--color-primary);
        }

        .pedidos-tab-badge {
          padding: 2px 8px;
          border-radius: 10px;
          font-size: 12px;
          font-weight: 700;
        }

        .pedidos-tab.active .pedidos-tab-badge {
          background: var(--color-primary);
          color: white;
        }

        .pedidos-tab:not(.active) .pedidos-tab-badge {
          background: var(--bg-tertiary);
          color: var(--text-secondary);
        }

        .controls-row {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          align-items: center;
          margin-bottom: 16px;
          flex-wrap: wrap;
        }

        .filter-select {
          padding: 8px 12px;
          border: 1px solid var(--border-primary);
          border-radius: 8px;
          font-size: 14px;
          background: var(--input-bg);
          color: var(--text-primary);
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .filter-select select {
          border: none;
          background: var(--input-bg);
          color: var(--text-primary);
          font-size: 14px;
          cursor: pointer;
          outline: none;
        }

        .refresh-btn {
          padding: 8px 16px;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-primary);
          border-radius: 8px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          color: var(--text-primary);
          transition: all 0.2s;
        }

        .refresh-btn:hover {
          background: var(--border-primary);
        }

        .empty-state {
          text-align: center;
          padding: 60px 20px;
          color: var(--text-secondary);
        }

        .empty-state svg {
          margin-bottom: 16px;
          opacity: 0.5;
        }

        .empty-state h3 {
          font-size: 18px;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 8px;
        }

        .loading-spinner {
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 60px;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 3px solid var(--border-primary);
          border-top-color: #3B82F6;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .movimientos-grid {
          display: grid;
          gap: 16px;
        }

        .movimiento-card {
          background: var(--card-bg);
          border: 1px solid var(--border-primary);
          border-radius: 12px;
          padding: 20px;
          transition: all 0.2s;
        }

        .movimiento-card:hover {
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .movimiento-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 16px;
        }

        .movimiento-tipo {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
        }

        .movimiento-fecha {
          color: var(--text-secondary);
          font-size: 12px;
        }

        .movimiento-body {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 16px;
        }

        .movimiento-field {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .movimiento-field.full-width {
          grid-column: 1 / -1;
        }

        .field-label {
          font-size: 11px;
          font-weight: 600;
          color: var(--text-tertiary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .field-value {
          font-size: 14px;
          color: var(--text-primary);
        }

        .movimiento-actions {
          display: flex;
          gap: 12px;
          padding-top: 16px;
          border-top: 1px solid var(--bg-tertiary);
        }

        .action-btn {
          flex: 1;
          padding: 10px 16px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: all 0.2s;
          border: none;
        }

        .action-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-aprobar {
          background: #10B981;
          color: var(--card-bg);
        }

        .btn-aprobar:hover:not(:disabled) {
          background: var(--color-success);
        }

        .btn-rechazar {
          background: var(--badge-red-bg);
          color: var(--color-primary);
        }

        .btn-rechazar:hover:not(:disabled) {
          background: #FECACA;
        }

        .btn-detalles {
          background: var(--bg-tertiary);
          color: var(--text-primary);
          flex: 0.5;
        }

        .btn-detalles:hover:not(:disabled) {
          background: var(--border-primary);
        }

        .historico-grid {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .historico-item {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px;
          background: var(--card-bg);
          border: 1px solid var(--border-primary);
          border-radius: 10px;
        }

        .historico-icon {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .historico-icon.aprobado {
          background: var(--badge-green-bg);
          color: var(--color-success);
        }

        .historico-icon.rechazado {
          background: var(--badge-red-bg);
          color: var(--color-danger);
        }

        .historico-content {
          flex: 1;
          min-width: 0;
        }

        .historico-producto {
          font-weight: 600;
          color: var(--text-primary);
          font-size: 14px;
        }

        .historico-meta {
          font-size: 12px;
          color: var(--text-secondary);
          margin-top: 4px;
        }

        .historico-estado {
          text-align: right;
        }

        .historico-estado-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 10px;
          border-radius: 16px;
          font-size: 12px;
          font-weight: 600;
        }

        .historico-estado-badge.aprobado {
          background: var(--badge-green-bg);
          color: var(--badge-green-text);
        }

        .historico-estado-badge.rechazado {
          background: var(--badge-red-bg);
          color: var(--badge-red-text);
        }

        .historico-fecha {
          font-size: 11px;
          color: var(--text-tertiary);
          margin-top: 4px;
        }

        .no-permission {
          padding: 40px 20px;
          text-align: center;
          color: var(--text-secondary);
        }

        .no-permission svg {
          margin-bottom: 16px;
          opacity: 0.5;
        }

        @media (max-width: 768px) {
          .pedidos-tabs {
            gap: 0;
          }

          .pedidos-tab {
            padding: 12px 16px;
            font-size: 13px;
          }

          .movimiento-body {
            grid-template-columns: 1fr;
          }

          .movimiento-actions {
            flex-direction: column;
          }

          .btn-detalles {
            flex: 1;
          }

          .historico-item {
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
          }

          .historico-estado {
            text-align: left;
            width: 100%;
          }

          .controls-row {
            flex-direction: column;
            align-items: stretch;
          }
        }
      `}</style>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
        {/* Tabs principales */}
        <div className="pedidos-tabs">
          <button
            className={`pedidos-tab ${activeTab === 'entradas' ? 'active' : ''}`}
            onClick={() => setActiveTab('entradas')}
          >
            <ArrowDownCircle size={18} />
            Entradas Simples
            {entradasSimples.length > 0 && (
              <span className="pedidos-tab-badge">{entradasSimples.length}</span>
            )}
          </button>
          <button
            className={`pedidos-tab ${activeTab === 'pedidos' ? 'active' : ''}`}
            onClick={() => setActiveTab('pedidos')}
          >
            <Package size={18} />
            Pedidos por Lote
            {pedidos.length > 0 && (
              <span className="pedidos-tab-badge">{pedidos.length}</span>
            )}
          </button>
          <button
            className={`pedidos-tab ${activeTab === 'pendientes' ? 'active' : ''}`}
            onClick={() => setActiveTab('pendientes')}
          >
            <Clock size={18} />
            Pendientes
            {movimientos.length > 0 && (
              <span className="pedidos-tab-badge">{movimientos.length}</span>
            )}
          </button>
          <button
            className={`pedidos-tab ${activeTab === 'historico' ? 'active' : ''}`}
            onClick={() => setActiveTab('historico')}
          >
            <History size={18} />
            Historico
          </button>
        </div>

        {/* ==================== TAB: ENTRADAS SIMPLES ==================== */}
        {activeTab === 'entradas' && (
          <DataTable
            data={entradasFiltered}
            columns={entradasColumns}
            loading={loadingPedidos}
            searchPlaceholder="Buscar por producto o proveedor..."
            emptyIcon={<ArrowDownCircle size={48} />}
            emptyTitle="No hay entradas pendientes de recepcion"
            emptyDescription="Las entradas aprobadas pendientes de recepcionar apareceran aqui"
            pageSize={20}
            pageSizeOptions={[10, 20, 50]}
          />
        )}

        {/* ==================== TAB: PEDIDOS POR LOTE ==================== */}
        {activeTab === 'pedidos' && (
          <>
            <div style={{ position: 'relative', maxWidth: '400px', marginBottom: '16px' }}>
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

            {loadingPedidos ? (
              <div className="loading-spinner">
                <div className="spinner"></div>
              </div>
            ) : pedidosFiltrados.length === 0 ? (
              <div className="empty-state">
                <Truck size={48} />
                <h3>No hay pedidos en transito</h3>
                <p>Los pedidos con productos pendientes de recepcion apareceran aqui</p>
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

        {/* ==================== TAB: PENDIENTES ==================== */}
        {activeTab === 'pendientes' && (
          <>
            {!canApprove ? (
              <div className="no-permission">
                <Clock size={48} />
                <h3>Acceso Restringido</h3>
                <p>Solo los usuarios con rol de Encargado o Admin pueden aprobar movimientos.</p>
              </div>
            ) : (
              <>
                <div className="controls-row">
                  <div className="filter-select">
                    <Filter size={16} />
                    <select
                      value={filtroTipo}
                      onChange={(e) => setFiltroTipo(e.target.value as FiltroTipo)}
                    >
                      <option value="todos">Todos los tipos</option>
                      <option value="entrada">Entradas</option>
                      <option value="salida">Salidas</option>
                      <option value="asignacion">Asignaciones</option>
                      <option value="devolucion">Devoluciones</option>
                    </select>
                  </div>
                  <button className="refresh-btn" onClick={cargarMovimientosPendientes}>
                    <RefreshCw size={16} />
                    Actualizar
                  </button>
                </div>

                {loadingAprobaciones ? (
                  <div className="loading-spinner">
                    <div className="spinner"></div>
                  </div>
                ) : movimientosFiltrados.length === 0 ? (
                  <div className="empty-state">
                    <Check size={48} />
                    <h3>No hay movimientos pendientes</h3>
                    <p>
                      {filtroTipo === 'todos'
                        ? 'Todos los movimientos han sido procesados'
                        : `No hay ${getTipoLabel(filtroTipo).toLowerCase()}s pendientes de aprobación`}
                    </p>
                  </div>
                ) : (
                  <div className="movimientos-grid">
                    {movimientosFiltrados.map((movimiento) => (
                      <div key={movimiento.id} className="movimiento-card">
                        <div className="movimiento-header">
                          <div
                            className="movimiento-tipo"
                            style={{
                              background: `${getTipoColor(movimiento.tipo)}15`,
                              color: getTipoColor(movimiento.tipo)
                            }}
                          >
                            {getTipoIcon(movimiento.tipo)}
                            {getTipoLabel(movimiento.tipo)}
                          </div>
                          <div className="movimiento-fecha">
                            {new Date(movimiento.created_at).toLocaleString('es-CL')}
                          </div>
                        </div>

                        <div className="movimiento-body">
                          <div className="movimiento-field">
                            <span className="field-label">Producto</span>
                            <span className="field-value">{movimiento.producto_nombre}</span>
                          </div>
                          <div className="movimiento-field">
                            <span className="field-label">Cantidad</span>
                            <span className="field-value">{movimiento.cantidad}</span>
                          </div>
                          {movimiento.vehiculo_patente && (
                            <div className="movimiento-field">
                              <span className="field-label">Vehículo</span>
                              <span className="field-value">{movimiento.vehiculo_patente}</span>
                            </div>
                          )}
                          {movimiento.motivo_salida && (
                            <div className="movimiento-field">
                              <span className="field-label">Motivo</span>
                              <span className="field-value">{getMotivoSalidaLabel(movimiento.motivo_salida)}</span>
                            </div>
                          )}
                          <div className="movimiento-field full-width">
                            <span className="field-label">Registrado por</span>
                            <span className="field-value">{movimiento.usuario_registrador_nombre}</span>
                          </div>
                          {movimiento.observaciones && (
                            <div className="movimiento-field full-width">
                              <span className="field-label">Observaciones</span>
                              <span className="field-value">{movimiento.observaciones}</span>
                            </div>
                          )}
                        </div>

                        <div className="movimiento-actions">
                          <button
                            className="action-btn btn-detalles"
                            onClick={() => verDetalles(movimiento)}
                          >
                            <Eye size={16} />
                            Detalles
                          </button>
                          <button
                            className="action-btn btn-rechazar"
                            onClick={() => rechazarMovimiento(movimiento)}
                            disabled={processing === movimiento.id}
                          >
                            <X size={16} />
                            Rechazar
                          </button>
                          <button
                            className="action-btn btn-aprobar"
                            onClick={() => aprobarMovimiento(movimiento)}
                            disabled={processing === movimiento.id}
                          >
                            <Check size={16} />
                            Aprobar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ==================== TAB: HISTORICO ==================== */}
        {activeTab === 'historico' && (
          <>
            {!canApprove ? (
              <div className="no-permission">
                <History size={48} />
                <h3>Acceso Restringido</h3>
                <p>Solo los usuarios con rol de Encargado o Admin pueden ver el histórico.</p>
              </div>
            ) : (
              <>
                <div className="controls-row">
                  <button className="refresh-btn" onClick={cargarHistorico}>
                    <RefreshCw size={16} />
                    Actualizar
                  </button>
                </div>

                {loadingHistorico ? (
                  <div className="loading-spinner">
                    <div className="spinner"></div>
                  </div>
                ) : historico.length === 0 ? (
                  <div className="empty-state">
                    <History size={48} />
                    <h3>No hay histórico de aprobaciones</h3>
                    <p>Aún no se han procesado movimientos</p>
                  </div>
                ) : (
                  <div className="historico-grid">
                    {historico.map((item) => (
                      <div key={item.id} className="historico-item">
                        <div className={`historico-icon ${item.estado_aprobacion}`}>
                          {item.estado_aprobacion === 'aprobado' ? (
                            <CheckCircle size={20} />
                          ) : (
                            <XCircle size={20} />
                          )}
                        </div>
                        <div className="historico-content">
                          <div className="historico-producto">
                            {item.producto_nombre} ({item.cantidad} uds)
                          </div>
                          <div className="historico-meta">
                            {getTipoLabel(item.tipo)} • Registrado por: {item.usuario_registrador_nombre}
                            {item.usuario_aprobador_nombre && (
                              <> • Procesado por: {item.usuario_aprobador_nombre}</>
                            )}
                          </div>
                          {item.motivo_rechazo && (
                            <div className="historico-meta" style={{ color: 'var(--color-danger)', marginTop: '4px' }}>
                              Motivo: {item.motivo_rechazo}
                            </div>
                          )}
                        </div>
                        <div className="historico-estado">
                          <span className={`historico-estado-badge ${item.estado_aprobacion}`}>
                            {item.estado_aprobacion === 'aprobado' ? (
                              <>
                                <CheckCircle size={12} />
                                Aprobado
                              </>
                            ) : (
                              <>
                                <XCircle size={12} />
                                Rechazado
                              </>
                            )}
                          </span>
                          <div className="historico-fecha">
                            {item.fecha_aprobacion
                              ? new Date(item.fecha_aprobacion).toLocaleString('es-CL')
                              : new Date(item.created_at).toLocaleString('es-CL')}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </>
  )
}
