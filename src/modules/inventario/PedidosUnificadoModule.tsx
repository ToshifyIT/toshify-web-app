// src/modules/inventario/PedidosUnificadoModule.tsx
// Módulo unificado que combina Pedidos en Tránsito y Aprobaciones Pendientes
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { usePermissions } from '../../contexts/PermissionsContext'
import { useSede } from '../../contexts/SedeContext'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../../components/ui/DataTable/DataTable'
import { SearchableSelect } from '../../components/ui/SearchableSelect'
import type { SearchableSelectOption } from '../../components/ui/SearchableSelect'
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
  XCircle,
  AlertTriangle,
  MapPin,
  Mail,
  Send,
  Plus,
  Trash2,
  ClipboardList,
  CheckCircle2,
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

interface ProveedorPedido {
  id: string
  razon_social: string
  email: string | null
  telefono: string | null
  activo: boolean
}

interface ProductoPedido {
  id: string
  codigo: string
  nombre: string
  tipo: string
  proveedor?: string | null
  stock_disponible?: number
  stock_minimo?: number
  unidades_medida?: {
    codigo?: string | null
    descripcion?: string | null
  } | null
}

interface PedidoDraftItem {
  producto_id: string
  cantidad: number
}

type TabActiva = 'nuevo' | 'entradas' | 'pedidos' | 'pendientes' | 'historico' | 'excepciones'
type FiltroTipo = 'todos' | 'entrada' | 'salida' | 'asignacion' | 'devolucion'

const getPedidoSla = (pedido: PedidoAgrupado) => {
  if (!pedido.fecha_estimada_llegada) {
    return { label: 'Sin fecha', className: 'sla-warning' }
  }

  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const fecha = new Date(pedido.fecha_estimada_llegada)
  fecha.setHours(0, 0, 0, 0)
  const diffDias = Math.ceil((fecha.getTime() - hoy.getTime()) / 86400000)

  if (diffDias < 0) return { label: 'Fecha vencida', className: 'sla-danger' }
  if (diffDias === 0) return { label: 'Vence hoy', className: 'sla-warning' }
  if (diffDias <= 2) return { label: `${diffDias} dias`, className: 'sla-info' }
  return { label: 'En plazo', className: 'sla-ok' }
}

const generarNumeroPedido = () => {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  const fecha = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  const hora = `${pad(now.getHours())}${pad(now.getMinutes())}`
  return `PED-${fecha}-${hora}`
}

const escapeHtml = (value: string | number | null | undefined) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const todayInputValue = () => new Date().toISOString().slice(0, 10)

export function PedidosUnificadoModule() {
  const { user, profile } = useAuth()
  const { canCreateInSubmenu, canEditInSubmenu, canViewTab } = usePermissions()
  const { sedeActual, verTodas } = useSede()

  // Permisos específicos para el submenú de pedidos
  const canEdit = canEditInSubmenu('inventario-pedidos') || canEditInSubmenu('pedidos')
  const canCreatePedido = canCreateInSubmenu('inventario-pedidos') || canCreateInSubmenu('pedidos') || canEdit

  // Estado de tab activa — abre en "Nuevo Pedido" por defecto
  const [activeTab, setActiveTab] = useState<TabActiva>('nuevo')

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

  // Estados para creación/envío de pedidos a proveedores
  const [proveedoresPedido, setProveedoresPedido] = useState<ProveedorPedido[]>([])
  const [productosPedido, setProductosPedido] = useState<ProductoPedido[]>([])
  const [loadingCatalogoPedido, setLoadingCatalogoPedido] = useState(false)
  const [creatingPedido, setCreatingPedido] = useState(false)
  const [numeroPedidoDraft, setNumeroPedidoDraft] = useState(() => generarNumeroPedido())
  const [proveedorPedidoId, setProveedorPedidoId] = useState('')
  const [fechaEstimadaPedido, setFechaEstimadaPedido] = useState('')
  const [observacionesPedido, setObservacionesPedido] = useState('')
  const [pedidoDraftItems, setPedidoDraftItems] = useState<PedidoDraftItem[]>([
    { producto_id: '', cantidad: 1 }
  ])

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
    cargarCatalogoPedido()
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
    } catch {
      // silently ignored
    } finally {
      setLoadingPedidos(false)
    }
  }

  const cargarCatalogoPedido = async () => {
    setLoadingCatalogoPedido(true)
    try {
      const [proveedoresRes, productosRes, stockRes] = await Promise.all([
        supabase
          .from('proveedores')
          .select('id, razon_social, email, telefono, activo')
          .eq('activo', true)
          .order('razon_social'),
        supabase
          .from('productos')
          .select(`
            id,
            codigo,
            nombre,
            tipo,
            proveedor,
            stock_minimo,
            unidades_medida (
              codigo,
              descripcion
            )
          `)
          .order('nombre'),
        supabase
          .from('v_stock_productos')
          .select('id, disponible')
      ])

      if (proveedoresRes.error) throw proveedoresRes.error
      if (productosRes.error) throw productosRes.error
      if (stockRes.error) throw stockRes.error

      const stockMap = new Map<string, number>(
        (stockRes.data || []).map((row: { id: string; disponible: number }) => [row.id, row.disponible || 0])
      )

      setProveedoresPedido((proveedoresRes.data || []) as ProveedorPedido[])
      setProductosPedido(
        ((productosRes.data || []) as unknown as ProductoPedido[]).map(producto => ({
          ...producto,
          stock_disponible: stockMap.get(producto.id) ?? 0
        }))
      )
    } catch {
      Swal.fire('Error', 'No se pudo cargar el catalogo para crear pedidos', 'error')
    } finally {
      setLoadingCatalogoPedido(false)
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
    } catch {
      // silently ignored
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
    } catch {
      // silently ignored
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

  const resetPedidoProveedorForm = () => {
    setNumeroPedidoDraft(generarNumeroPedido())
    setProveedorPedidoId('')
    setFechaEstimadaPedido('')
    setObservacionesPedido('')
    setPedidoDraftItems([{ producto_id: '', cantidad: 1 }])
  }

  const getProductoPedido = (productoId: string) =>
    productosPedido.find(producto => producto.id === productoId)

  const getUnidadProducto = (producto?: ProductoPedido) => {
    if (!producto?.unidades_medida) return 'Unidad'
    return producto.unidades_medida.descripcion || producto.unidades_medida.codigo || 'Unidad'
  }

  const getPedidoProveedorSeleccionado = () =>
    proveedoresPedido.find(proveedor => proveedor.id === proveedorPedidoId) || null

  const proveedorPedidoOptions = useMemo<SearchableSelectOption[]>(() =>
    proveedoresPedido.map(proveedor => ({
      value: proveedor.id,
      label: proveedor.razon_social,
      subtitle: proveedor.email || 'Sin email cargado',
      searchText: [
        proveedor.razon_social,
        proveedor.email,
        proveedor.telefono
      ].filter(Boolean).join(' ')
    })),
    [proveedoresPedido]
  )

  const productoPedidoBaseOptions = useMemo<SearchableSelectOption[]>(() =>
    productosPedido.map(producto => {
      const unidad = getUnidadProducto(producto)
      return {
        value: producto.id,
        label: `${producto.codigo} - ${producto.nombre}`,
        subtitle: `${producto.tipo} · ${unidad}`,
        searchText: `${producto.codigo} ${producto.nombre} ${producto.tipo} ${unidad}`
      }
    }),
    [productosPedido]
  )

  const pedidoItemsValidos = useMemo(() => pedidoDraftItems
    .map(item => ({
      ...item,
      producto: getProductoPedido(item.producto_id)
    }))
    .filter(item => item.producto && Number(item.cantidad) > 0),
    [pedidoDraftItems, productosPedido]
  )

  // Total de unidades del borrador (suma de cantidades válidas)
  const pedidoTotalUnidades = useMemo(
    () => pedidoItemsValidos.reduce((acc, item) => acc + Number(item.cantidad || 0), 0),
    [pedidoItemsValidos]
  )

  // Productos del proveedor seleccionado que están bajo el stock mínimo y aún no fueron agregados
  const sugerenciasBajoMinimo = useMemo(() => {
    const proveedorSel = getPedidoProveedorSeleccionado()
    if (!proveedorSel) return [] as ProductoPedido[]
    const razon = proveedorSel.razon_social?.trim().toLowerCase()
    const yaAgregados = new Set(pedidoDraftItems.map(item => item.producto_id).filter(Boolean))
    return productosPedido.filter(producto => {
      const min = Number(producto.stock_minimo || 0)
      if (min <= 0) return false
      if (Number(producto.stock_disponible || 0) > min) return false
      if (yaAgregados.has(producto.id)) return false
      // Sólo sugerir productos cuya marca/proveedor coincida con el proveedor seleccionado
      return Boolean(razon) && (producto.proveedor || '').trim().toLowerCase() === razon
    })
  }, [productosPedido, pedidoDraftItems, proveedorPedidoId])

  const agregarSugerenciasBajoMinimo = () => {
    if (sugerenciasBajoMinimo.length === 0) return
    setPedidoDraftItems(prev => {
      const base = prev.filter(item => item.producto_id)
      const nuevos = sugerenciasBajoMinimo.map(producto => ({
        producto_id: producto.id,
        cantidad: Math.max(1, Number(producto.stock_minimo || 1))
      }))
      const merged = [...base, ...nuevos]
      return merged.length > 0 ? merged : [{ producto_id: '', cantidad: 1 }]
    })
  }

  const addPedidoDraftItem = () => {
    setPedidoDraftItems(prev => [...prev, { producto_id: '', cantidad: 1 }])
  }

  const updatePedidoDraftItem = (
    index: number,
    field: keyof PedidoDraftItem,
    value: string | number
  ) => {
    setPedidoDraftItems(prev => prev.map((item, itemIndex) => {
      if (itemIndex !== index) return item
      if (field === 'cantidad') {
        return { ...item, cantidad: Math.max(1, Number(value) || 1) }
      }
      return { ...item, producto_id: String(value) }
    }))
  }

  const removePedidoDraftItem = (index: number) => {
    setPedidoDraftItems(prev => prev.length === 1
      ? [{ producto_id: '', cantidad: 1 }]
      : prev.filter((_, itemIndex) => itemIndex !== index)
    )
  }

  const validatePedidoProveedor = () => {
    if (!canCreatePedido) return 'No tienes permisos para crear pedidos'
    if (!numeroPedidoDraft.trim()) return 'Debes indicar un numero de pedido'
    if (!proveedorPedidoId) return 'Debes seleccionar un proveedor'
    if (pedidoItemsValidos.length === 0) return 'Debes agregar al menos un producto con cantidad valida'

    const proveedor = getPedidoProveedorSeleccionado()
    if (!proveedor?.email?.trim()) {
      return 'El proveedor no tiene email configurado. Carga el email en Proveedores antes de crear el pedido.'
    }

    const productoIds = pedidoItemsValidos.map(item => item.producto_id)
    if (new Set(productoIds).size !== productoIds.length) {
      return 'Hay productos repetidos en el pedido. Unifica las cantidades antes de enviar.'
    }

    return null
  }

  const buildPedidoEmailPayload = () => {
    const proveedor = getPedidoProveedorSeleccionado()
    return {
      to: proveedor?.email?.trim() || '',
      proveedorNombre: proveedor?.razon_social || '',
      numeroPedido: numeroPedidoDraft.trim(),
      fechaPedido: new Date().toLocaleDateString('es-AR'),
      fechaEstimada: fechaEstimadaPedido
        ? new Date(`${fechaEstimadaPedido}T00:00:00`).toLocaleDateString('es-AR')
        : '',
      sede: verTodas ? 'Todas las sedes' : (sedeActual?.nombre || 'Sede operativa'),
      solicitante: profile?.full_name || user?.email || 'Toshify',
      observaciones: observacionesPedido.trim(),
      replyTo: user?.email || undefined,
      items: pedidoItemsValidos.map(item => ({
        codigo: item.producto?.codigo || '',
        nombre: item.producto?.nombre || '',
        cantidad: item.cantidad,
        unidad: getUnidadProducto(item.producto)
      }))
    }
  }

  const buildPedidoPreviewHtml = () => {
    const payload = buildPedidoEmailPayload()
    const rows = payload.items.map(item => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;">
          <strong>${escapeHtml(item.codigo)}</strong><br>
          <span style="color:#6b7280;">${escapeHtml(item.nombre)}</span>
        </td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:700;">
          ${escapeHtml(item.cantidad)}
        </td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.unidad)}</td>
      </tr>
    `).join('')

    return `
      <div style="text-align:left;font-size:13px;color:#111827;">
        <p><strong>Proveedor:</strong> ${escapeHtml(payload.proveedorNombre)}</p>
        <p><strong>Email:</strong> ${escapeHtml(payload.to || 'Sin email')}</p>
        <p><strong>Pedido:</strong> ${escapeHtml(payload.numeroPedido)}</p>
        <p><strong>Sede:</strong> ${escapeHtml(payload.sede)}</p>
        <table style="width:100%;border-collapse:collapse;margin-top:12px;">
          <thead>
            <tr style="background:#f3f4f6;">
              <th style="padding:8px;text-align:left;">Producto</th>
              <th style="padding:8px;text-align:center;">Cantidad</th>
              <th style="padding:8px;text-align:left;">Unidad</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        ${payload.observaciones ? `<p style="margin-top:12px;"><strong>Obs:</strong> ${escapeHtml(payload.observaciones)}</p>` : ''}
      </div>
    `
  }

  const previewPedidoProveedor = async () => {
    const validationError = validatePedidoProveedor()
    if (validationError) {
      Swal.fire('Revisar pedido', validationError, 'warning')
      return
    }

    await Swal.fire({
      title: 'Vista previa del pedido',
      html: buildPedidoPreviewHtml(),
      width: 760,
      confirmButtonText: 'Cerrar',
      confirmButtonColor: '#FF0033'
    })
  }

  const enviarCorreoPedidoProveedor = async () => {
    const payload = buildPedidoEmailPayload()
    const response = await fetch('/api/logistica/enviar-pedido-proveedor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    const result = await response.json().catch(() => ({}))
    if (!response.ok || !result.success) {
      throw new Error(result.error || 'No se pudo enviar el correo')
    }
  }

  const crearPedidoProveedor = async () => {
    const validationError = validatePedidoProveedor()
    if (validationError) {
      Swal.fire('Revisar pedido', validationError, 'warning')
      return
    }

    const proveedor = getPedidoProveedorSeleccionado()
    const result = await Swal.fire({
      title: 'Crear y enviar pedido',
      html: buildPedidoPreviewHtml(),
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Crear y enviar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#FF0033',
      width: 760
    })

    if (!result.isConfirmed) return

    setCreatingPedido(true)
    try {
      const { data: authData } = await supabase.auth.getUser()
      const observacionesFinal = [
        observacionesPedido.trim(),
        proveedor?.email ? `Pedido preparado para envio por correo a ${proveedor.email}` : null
      ].filter(Boolean).join('\n')

      const { error } = await (supabase.rpc as any)('crear_pedido_inventario', {
        p_numero_pedido: numeroPedidoDraft.trim(),
        p_proveedor_id: proveedorPedidoId,
        p_fecha_estimada: fechaEstimadaPedido || null,
        p_observaciones: observacionesFinal || null,
        p_usuario_id: authData.user?.id,
        p_items: JSON.stringify(pedidoItemsValidos.map(item => ({
          producto_id: item.producto_id,
          cantidad: item.cantidad
        })))
      })

      if (error) throw error

      try {
        await enviarCorreoPedidoProveedor()
        showSuccess('Pedido enviado', `Pedido ${numeroPedidoDraft} creado y enviado a ${proveedor?.email}`)
      } catch (emailError: any) {
        await Swal.fire({
          icon: 'warning',
          title: 'Pedido creado, correo pendiente',
          text: emailError.message || 'El pedido quedó creado pero no se pudo enviar el correo.'
        })
      }

      resetPedidoProveedorForm()
      await loadPedidosData()
      setActiveTab('pedidos')
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo crear el pedido', 'error')
    } finally {
      setCreatingPedido(false)
    }
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

      showSuccess('Recepción confirmada', `Se recibieron ${cantidad} unidades`)
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
    } catch {
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
    } catch {
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

      showSuccess('¡Aprobado!', 'El movimiento ha sido aprobado y el stock actualizado')

      cargarMovimientosPendientes()
    } catch (error: any) {
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

  const pedidosConExcepcion = useMemo(() => pedidos.filter((pedido) => {
    const sla = getPedidoSla(pedido)
    const tieneParcial = pedido.items.some(item => item.cantidad_recibida > 0 && item.cantidad_pendiente > 0)
    return sla.className === 'sla-danger' || sla.className === 'sla-warning' || tieneParcial
  }), [pedidos])

  const totalRecepcionesPendientes = entradasSimples.length + pedidos.length
  const totalExcepciones = pedidosConExcepcion.length
  const sedeOperativaLabel = verTodas ? 'Todas las sedes' : (sedeActual?.nombre || 'Sede actual')
  const proveedorPedidoSeleccionado = getPedidoProveedorSeleccionado()
  const proveedorPedidoTieneEmail = Boolean(proveedorPedidoSeleccionado?.email?.trim())

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
      header: 'Acciones',
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
          padding: 8px 16px;
          background: none;
          border: none;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          color: var(--text-secondary);
          border-bottom: 2px solid transparent;
          margin-bottom: -2px;
          display: flex;
          align-items: center;
          gap: 6px;
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

        .pedidos-tab-separator {
          width: 1px;
          min-width: 1px;
          height: 24px;
          align-self: center;
          margin: 0 10px;
          background: var(--border-primary);
        }

        .pedido-compose {
          display: grid;
          grid-template-columns: minmax(0, 1.5fr) minmax(280px, 0.7fr);
          gap: 16px;
          align-items: start;
        }

        .pedido-compose-card {
          background: var(--card-bg);
          border: 1px solid var(--border-primary);
          border-radius: 8px;
          padding: 16px;
        }

        .pedido-compose-title {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 0 0 14px 0;
          color: var(--text-primary);
          font-size: 15px;
          font-weight: 700;
        }

        .pedido-compose-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .pedido-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .pedido-field.full {
          grid-column: 1 / -1;
        }

        .pedido-field label {
          color: var(--text-secondary);
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .pedido-field input,
        .pedido-field select,
        .pedido-field textarea {
          width: 100%;
          border: 1px solid var(--border-primary);
          border-radius: 8px;
          background: var(--input-bg);
          color: var(--text-primary);
          font-size: 13px;
          padding: 10px 12px;
          box-sizing: border-box;
        }

        .pedido-field textarea {
          min-height: 84px;
          resize: vertical;
        }

        .pedido-items {
          display: grid;
          gap: 8px;
          margin-top: 14px;
        }

        .pedido-items-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .pedido-items-count {
          font-size: 12px;
          color: var(--text-secondary);
        }

        .pedido-items-table {
          border: 1px solid var(--border-primary);
          border-radius: 8px;
        }

        .pedido-items-table .pedido-item-row:first-child {
          border-top-left-radius: 8px;
          border-top-right-radius: 8px;
        }

        .pedido-items-table .pedido-item-row:last-child {
          border-bottom-left-radius: 8px;
          border-bottom-right-radius: 8px;
        }

        .pedido-item-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 110px 132px 36px;
          gap: 10px;
          align-items: center;
          padding: 8px 12px;
          border-bottom: 1px solid var(--border-primary);
        }

        .pedido-item-row:last-child {
          border-bottom: none;
        }

        .pedido-item-row--header {
          background: var(--bg-secondary);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.4px;
          text-transform: uppercase;
          color: var(--text-tertiary);
        }

        .pedido-item-stock-empty {
          color: var(--text-tertiary);
        }

        .pedido-stock-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 8px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
          width: fit-content;
          background: var(--badge-green-bg);
          color: var(--badge-green-text);
        }

        .pedido-stock-pill.low {
          background: var(--badge-yellow-bg);
          color: var(--badge-yellow-text);
        }

        .pedido-qty {
          display: inline-flex;
          align-items: center;
          border: 1px solid var(--border-primary);
          border-radius: 7px;
          overflow: hidden;
          height: 36px;
          width: fit-content;
        }

        .pedido-qty button {
          width: 32px;
          height: 100%;
          border: none;
          background: var(--bg-secondary);
          color: var(--text-secondary);
          font-size: 16px;
          cursor: pointer;
        }

        .pedido-qty button:hover:not(:disabled) {
          background: var(--border-primary);
          color: var(--text-primary);
        }

        .pedido-qty button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .pedido-qty input {
          width: 48px;
          height: 100%;
          text-align: center;
          border: none;
          background: var(--input-bg);
          color: var(--text-primary);
          font-size: 13px;
          font-weight: 600;
          padding: 0;
        }

        .pedido-add-item {
          width: 100%;
          height: 40px;
          border: 1.5px dashed var(--border-primary);
          border-radius: 8px;
          background: none;
          color: var(--text-secondary);
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          transition: all 0.15s;
        }

        .pedido-add-item:hover:not(:disabled) {
          border-color: var(--color-primary);
          color: var(--color-primary);
          background: var(--bg-secondary);
        }

        .pedido-add-item:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .pedido-suggest {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 11px 14px;
          border-radius: 8px;
          font-size: 12.5px;
          background: var(--badge-yellow-bg);
          color: var(--badge-yellow-text);
        }

        .pedido-suggest-btn {
          margin-left: auto;
          border: none;
          border-radius: 6px;
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
          background: var(--badge-yellow-text);
          color: var(--card-bg);
        }

        .pedido-suggest-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .pedido-compose-side {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .pedido-resumen-row {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          padding: 9px 0;
          border-bottom: 1px solid var(--bg-secondary);
          font-size: 13px;
        }

        .pedido-resumen-row:last-child {
          border-bottom: none;
        }

        .pedido-resumen-row span {
          color: var(--text-secondary);
        }

        .pedido-resumen-row strong {
          color: var(--text-primary);
          text-align: right;
        }

        .pedido-resumen-totals {
          background: var(--bg-secondary);
          border-radius: 8px;
          padding: 12px 14px;
          margin-top: 10px;
        }

        .pedido-resumen-total-row {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
          padding: 3px 0;
          color: var(--text-secondary);
        }

        .pedido-resumen-total-row.big {
          font-size: 16px;
          font-weight: 700;
          color: var(--text-primary);
          padding-top: 8px;
          margin-top: 5px;
          border-top: 1px dashed var(--border-primary);
        }

        .pedido-resumen-total-row strong {
          color: var(--text-primary);
        }

        .pedido-checklist {
          display: flex;
          flex-direction: column;
          gap: 9px;
        }

        .pedido-check {
          display: flex;
          align-items: center;
          gap: 9px;
          font-size: 12.5px;
        }

        .pedido-check-mark {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 700;
          flex-shrink: 0;
        }

        .pedido-check.done {
          color: var(--text-secondary);
        }

        .pedido-check.done .pedido-check-mark {
          background: var(--badge-green-text);
          color: var(--card-bg);
        }

        .pedido-check.todo {
          color: var(--text-primary);
          font-weight: 600;
        }

        .pedido-check.todo .pedido-check-mark {
          background: var(--bg-secondary);
          color: var(--text-tertiary);
          border: 1.5px solid var(--border-primary);
        }

        .pedido-info-box {
          margin: 0;
          font-size: 11.5px;
          line-height: 1.55;
          background: var(--bg-secondary);
          border: 1px solid var(--border-primary);
          color: var(--text-secondary);
          border-radius: 8px;
          padding: 10px 12px;
        }

        .pedido-actions-summary {
          margin-right: auto;
          font-size: 13px;
          color: var(--text-secondary);
        }

        .pedido-actions-summary strong {
          color: var(--text-primary);
        }

        .pedido-icon-button {
          width: 36px;
          height: 36px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--border-primary);
          border-radius: 6px;
          background: var(--card-bg);
          color: var(--text-secondary);
          cursor: pointer;
        }

        .pedido-icon-button:hover {
          color: var(--color-primary);
          background: var(--bg-secondary);
        }

        .pedido-compose .btn-secondary,
        .pedido-compose-actions .btn-secondary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          border: 1px solid #E5E7EB;
          border-radius: 6px;
          background: #F3F4F6;
          color: var(--text-primary);
          padding: 8px 18px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s;
        }

        .pedido-compose .btn-secondary:hover:not(:disabled),
        .pedido-compose-actions .btn-secondary:hover:not(:disabled) {
          background: #E5E7EB;
        }

        .pedido-compose .btn-primary,
        .pedido-compose-actions .btn-primary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          border: none;
          border-radius: 6px;
          background: var(--color-primary);
          color: white;
          padding: 8px 18px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.15s;
        }

        .pedido-compose .btn-primary:hover:not(:disabled),
        .pedido-compose-actions .btn-primary:hover:not(:disabled) {
          background: var(--color-primary-hover);
        }

        .pedido-compose .btn-primary:disabled,
        .pedido-compose .btn-secondary:disabled,
        .pedido-compose-actions .btn-primary:disabled,
        .pedido-compose-actions .btn-secondary:disabled,
        .pedido-icon-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .pedido-compose-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 16px;
          padding-top: 14px;
          border-top: 1px solid var(--border-primary);
        }

        .pedido-email-status {
          display: grid;
          gap: 10px;
          color: var(--text-secondary);
          font-size: 13px;
        }

        .pedido-status-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          width: fit-content;
          padding: 6px 10px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
          background: var(--badge-green-bg);
          color: var(--badge-green-text);
        }

        .pedido-status-pill.warning {
          background: var(--badge-yellow-bg);
          color: var(--badge-yellow-text);
        }

        .pedido-email-preview {
          border: 1px solid var(--border-primary);
          border-radius: 8px;
          background: var(--bg-secondary);
          padding: 12px;
          display: grid;
          gap: 8px;
        }

        .pedido-email-preview-row {
          display: flex;
          justify-content: space-between;
          gap: 10px;
        }

        .pedido-email-preview-row span {
          color: var(--text-tertiary);
          font-size: 11px;
          text-transform: uppercase;
          font-weight: 700;
        }

        .pedido-email-preview-row strong {
          color: var(--text-primary);
          text-align: right;
          font-size: 13px;
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

        .pedidos-operational-summary {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 12px;
          margin-bottom: 16px;
        }

        .pedidos-summary-card {
          background: var(--card-bg);
          border: 1px solid var(--border-primary);
          border-radius: 8px;
          padding: 12px;
        }

        .pedidos-summary-label {
          color: var(--text-tertiary);
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .pedidos-summary-value {
          color: var(--text-primary);
          font-size: 18px;
          font-weight: 700;
          line-height: 1;
          margin-top: 6px;
        }

        .pedidos-summary-note {
          color: var(--text-secondary);
          font-size: 11px;
          margin-top: 5px;
        }

        .sla-badge {
          display: inline-flex;
          align-items: center;
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 700;
          white-space: nowrap;
        }

        .sla-ok {
          background: var(--badge-green-bg);
          color: var(--badge-green-text);
        }

        .sla-info {
          background: var(--badge-blue-bg);
          color: var(--badge-blue-text);
        }

        .sla-warning {
          background: var(--badge-yellow-bg);
          color: var(--badge-yellow-text);
        }

        .sla-danger {
          background: var(--badge-red-bg);
          color: var(--badge-red-text);
        }

        .excepciones-grid {
          display: grid;
          gap: 12px;
        }

        .excepcion-card {
          background: var(--card-bg);
          border: 1px solid var(--border-primary);
          border-left: 4px solid var(--color-warning);
          border-radius: 8px;
          padding: 14px;
        }

        .excepcion-card.critica {
          border-left-color: var(--color-danger);
        }

        .excepcion-header {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
          margin-bottom: 10px;
        }

        .excepcion-title {
          color: var(--text-primary);
          font-size: 14px;
          font-weight: 700;
        }

        .excepcion-meta {
          color: var(--text-secondary);
          font-size: 12px;
          margin-top: 3px;
        }

        .excepcion-list {
          display: grid;
          gap: 8px;
          margin-top: 10px;
        }

        .excepcion-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 10px;
          align-items: center;
          padding: 8px 10px;
          background: var(--bg-secondary);
          border-radius: 6px;
          color: var(--text-secondary);
          font-size: 12px;
        }

        .excepcion-footer {
          display: flex;
          justify-content: flex-end;
          margin-top: 12px;
        }

        .excepcion-action {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          border: 1px solid var(--border-primary);
          border-radius: 6px;
          background: var(--card-bg);
          color: var(--text-primary);
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }

        .excepcion-action:hover {
          background: var(--bg-secondary);
        }

        .item-exception-badge {
          display: inline-flex;
          padding: 2px 8px;
          border-radius: 10px;
          background: var(--badge-yellow-bg);
          color: var(--badge-yellow-text);
          font-size: 11px;
          font-weight: 700;
        }

        @media (max-width: 768px) {
          .pedidos-operational-summary {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .pedidos-tabs {
            gap: 8px;
            flex-wrap: wrap;
            border-bottom: none;
            margin-bottom: 12px;
          }

          .pedidos-tabs::-webkit-scrollbar {
            display: none;
          }

          .pedidos-tab {
            padding: 12px 16px;
            font-size: 13px;
            flex: 1 1 160px;
            min-width: 0;
            white-space: normal;
            justify-content: center;
            text-align: center;
            min-height: 42px;
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

          .excepcion-header {
            flex-direction: column;
          }

          .pedido-compose {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 640px) {
          .pedidos-tabs {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
            border-bottom: none;
            margin-bottom: 16px;
          }

          .pedidos-tab {
            min-height: 42px;
            margin-bottom: 0;
            padding: 10px;
            border: 1px solid var(--border-primary);
            border-radius: 8px;
            white-space: normal;
            text-align: center;
            justify-content: center;
            flex-wrap: wrap;
            gap: 4px;
            line-height: 1.2;
          }

          .pedidos-tab.active {
            border-color: var(--color-primary);
            background: var(--badge-red-bg);
          }

          .pedidos-tab-badge {
            font-size: 11px;
          }

          .pedidos-tab-separator {
            display: none;
          }

          .pedido-compose-grid,
          .pedido-item-row {
            grid-template-columns: 1fr;
          }

          .pedido-compose-actions {
            flex-direction: column;
          }

          .pedido-compose-actions > button {
            width: 100%;
          }

          .pedido-icon-button {
            width: 100%;
          }
        }
      `}</style>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
        <div className="pedidos-operational-summary">
          <div className="pedidos-summary-card">
            <div className="pedidos-summary-label">Sede</div>
            <div className="pedidos-summary-value" style={{ fontSize: '14px' }}>{sedeOperativaLabel}</div>
            <div className="pedidos-summary-note"><MapPin size={12} style={{ verticalAlign: 'middle' }} /> contexto operativo</div>
          </div>
          <div className="pedidos-summary-card">
            <div className="pedidos-summary-label">Recepciones</div>
            <div className="pedidos-summary-value">{totalRecepcionesPendientes}</div>
            <div className="pedidos-summary-note">entradas y pedidos en transito</div>
          </div>
          <div className="pedidos-summary-card">
            <div className="pedidos-summary-label">Aprobaciones</div>
            <div className="pedidos-summary-value">{movimientos.length}</div>
            <div className="pedidos-summary-note">salidas, asignaciones y devoluciones</div>
          </div>
          <div className="pedidos-summary-card">
            <div className="pedidos-summary-label">Excepciones</div>
            <div className="pedidos-summary-value">{totalExcepciones}</div>
            <div className="pedidos-summary-note">SLA o recepcion parcial</div>
          </div>
          <div className="pedidos-summary-card">
            <div className="pedidos-summary-label">Historico</div>
            <div className="pedidos-summary-value">{historico.length}</div>
            <div className="pedidos-summary-note">procesados cargados</div>
          </div>
        </div>

        {/* Tabs principales - controlados por permisos de tab */}
        <div className="pedidos-tabs">
          {canViewTab('inventario-pedidos:pedidos') && (
            <button
              className={`pedidos-tab ${activeTab === 'nuevo' ? 'active' : ''}`}
              onClick={() => setActiveTab('nuevo')}
            >
              <Mail size={16} />
              Nuevo Pedido
            </button>
          )}
          {canViewTab('inventario-pedidos:pedidos') && (
            <button
              className={`pedidos-tab ${activeTab === 'pedidos' ? 'active' : ''}`}
              onClick={() => setActiveTab('pedidos')}
            >
              <Package size={16} />
              Pedidos a proveedor
              {pedidos.length > 0 && (
                <span className="pedidos-tab-badge">{pedidos.length}</span>
              )}
            </button>
          )}
          {canViewTab('inventario-pedidos:entradas') && (
            <button
              className={`pedidos-tab ${activeTab === 'entradas' ? 'active' : ''}`}
              onClick={() => setActiveTab('entradas')}
            >
              <ArrowDownCircle size={16} />
              Entradas Simples
              {entradasSimples.length > 0 && (
                <span className="pedidos-tab-badge">{entradasSimples.length}</span>
              )}
            </button>
          )}
          {canViewTab('inventario-pedidos:pendientes') && (
            <>
              <span className="pedidos-tab-separator" aria-hidden="true" />
              <button
                className={`pedidos-tab ${activeTab === 'pendientes' ? 'active' : ''}`}
                onClick={() => setActiveTab('pendientes')}
              >
                <Clock size={16} />
                Aprobaciones
                {movimientos.length > 0 && (
                  <span className="pedidos-tab-badge">{movimientos.length}</span>
                )}
              </button>
            </>
          )}
          {canViewTab('inventario-pedidos:historico') && (
            <button
              className={`pedidos-tab ${activeTab === 'historico' ? 'active' : ''}`}
              onClick={() => setActiveTab('historico')}
            >
              <History size={16} />
              Historico
            </button>
          )}
          {canViewTab('inventario-pedidos:pedidos') && (
            <button
              className={`pedidos-tab ${activeTab === 'excepciones' ? 'active' : ''}`}
              onClick={() => setActiveTab('excepciones')}
            >
              <AlertTriangle size={16} />
              Excepciones
              {totalExcepciones > 0 && (
                <span className="pedidos-tab-badge">{totalExcepciones}</span>
              )}
            </button>
          )}
        </div>

        {/* ==================== TAB: NUEVO PEDIDO ==================== */}
        {activeTab === 'nuevo' && (
          <div className="pedido-compose">
            <div className="pedido-compose-card">
              <h3 className="pedido-compose-title">
                <Package size={16} />
                Pedido a proveedor
              </h3>

              {!canCreatePedido && (
                <div className="no-permission" style={{ padding: '20px 0' }}>
                  <Clock size={32} />
                  <h3>Accion no disponible</h3>
                  <p>No tienes permisos para crear pedidos de inventario.</p>
                </div>
              )}

              {canCreatePedido && (
                <>
                  <div className="pedido-compose-grid">
                    <div className="pedido-field">
                      <label>Proveedor</label>
                      <SearchableSelect
                        value={proveedorPedidoId}
                        onChange={setProveedorPedidoId}
                        options={proveedorPedidoOptions}
                        placeholder="Seleccionar proveedor"
                        searchPlaceholder="Buscar proveedor..."
                        noResultsText="Sin proveedores"
                        size="lg"
                        disabled={loadingCatalogoPedido || creatingPedido}
                      />
                    </div>

                    <div className="pedido-field">
                      <label>Numero de pedido</label>
                      <input
                        value={numeroPedidoDraft}
                        onChange={(event) => setNumeroPedidoDraft(event.target.value)}
                        disabled={creatingPedido}
                      />
                    </div>

                    <div className="pedido-field">
                      <label>Fecha estimada</label>
                      <input
                        type="date"
                        min={todayInputValue()}
                        value={fechaEstimadaPedido}
                        onChange={(event) => setFechaEstimadaPedido(event.target.value)}
                        disabled={creatingPedido}
                      />
                    </div>

                    <div className="pedido-field">
                      <label>Sede</label>
                      <input value={sedeOperativaLabel} disabled />
                    </div>
                  </div>

                  <div className="pedido-items">
                    <div className="pedido-items-head">
                      <div className="pedido-compose-title" style={{ margin: 0 }}>
                        <Package size={16} />
                        Items del pedido
                      </div>
                      <div className="pedido-items-count">
                        {pedidoItemsValidos.length} productos · <strong>{pedidoTotalUnidades} unidades</strong>
                      </div>
                    </div>

                    <div className="pedido-items-table">
                      <div className="pedido-item-row pedido-item-row--header">
                        <span>Producto</span>
                        <span>Stock actual</span>
                        <span>Cantidad</span>
                        <span />
                      </div>

                      {pedidoDraftItems.map((item, index) => {
                        const productosSeleccionados = pedidoDraftItems
                          .filter((_, itemIndex) => itemIndex !== index)
                          .map(draft => draft.producto_id)
                          .filter(Boolean)

                        const producto = getProductoPedido(item.producto_id)
                        const disponible = Number(producto?.stock_disponible || 0)
                        const minimo = Number(producto?.stock_minimo || 0)
                        const bajoMinimo = producto && minimo > 0 && disponible <= minimo

                        return (
                          <div className="pedido-item-row" key={`${index}-${item.producto_id || 'nuevo'}`}>
                            <div className="pedido-field">
                              <SearchableSelect
                                value={item.producto_id}
                                onChange={(value) => updatePedidoDraftItem(index, 'producto_id', value)}
                                options={productoPedidoBaseOptions.map(option => ({
                                  ...option,
                                  disabled: productosSeleccionados.includes(option.value)
                                }))}
                                placeholder="Seleccionar producto"
                                searchPlaceholder="Buscar producto..."
                                noResultsText="Sin productos"
                                size="lg"
                                disabled={loadingCatalogoPedido || creatingPedido}
                              />
                            </div>

                            <div className="pedido-item-stock">
                              {producto ? (
                                <span className={`pedido-stock-pill ${bajoMinimo ? 'low' : 'ok'}`}>
                                  {bajoMinimo && <AlertTriangle size={11} />}
                                  {bajoMinimo ? `${disponible} · bajo mín.` : `${disponible} disp.`}
                                </span>
                              ) : (
                                <span className="pedido-item-stock-empty">—</span>
                              )}
                            </div>

                            <div className="pedido-qty">
                              <button
                                type="button"
                                onClick={() => updatePedidoDraftItem(index, 'cantidad', String(Math.max(1, Number(item.cantidad || 1) - 1)))}
                                disabled={creatingPedido}
                                aria-label="Disminuir cantidad"
                              >−</button>
                              <input
                                type="number"
                                min={1}
                                step={1}
                                value={item.cantidad}
                                onChange={(event) => updatePedidoDraftItem(index, 'cantidad', event.target.value)}
                                disabled={creatingPedido}
                              />
                              <button
                                type="button"
                                onClick={() => updatePedidoDraftItem(index, 'cantidad', String(Number(item.cantidad || 0) + 1))}
                                disabled={creatingPedido}
                                aria-label="Aumentar cantidad"
                              >+</button>
                            </div>

                            <button
                              type="button"
                              className="pedido-icon-button"
                              onClick={() => removePedidoDraftItem(index)}
                              disabled={creatingPedido}
                              title="Quitar item"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        )
                      })}
                    </div>

                    <button
                      type="button"
                      className="pedido-add-item"
                      onClick={addPedidoDraftItem}
                      disabled={creatingPedido || loadingCatalogoPedido}
                    >
                      <Plus size={15} />
                      Agregar item
                    </button>

                    {sugerenciasBajoMinimo.length > 0 && (
                      <div className="pedido-suggest">
                        <AlertTriangle size={17} />
                        <span>
                          <strong>{sugerenciasBajoMinimo.length} producto{sugerenciasBajoMinimo.length > 1 ? 's' : ''} más</strong>
                          {' '}de {proveedorPedidoSeleccionado?.razon_social} {sugerenciasBajoMinimo.length > 1 ? 'están' : 'está'} bajo el stock mínimo. ¿Agregarlo{sugerenciasBajoMinimo.length > 1 ? 's' : ''} al pedido?
                        </span>
                        <button
                          type="button"
                          className="pedido-suggest-btn"
                          onClick={agregarSugerenciasBajoMinimo}
                          disabled={creatingPedido}
                        >
                          + Agregar {sugerenciasBajoMinimo.length > 1 ? 'todos' : 'producto'}
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="pedido-field full" style={{ marginTop: '14px' }}>
                    <label>Observaciones para proveedor</label>
                    <textarea
                      value={observacionesPedido}
                      onChange={(event) => setObservacionesPedido(event.target.value)}
                      placeholder="Ej: confirmar disponibilidad, alternativa de marca, prioridad de entrega..."
                      disabled={creatingPedido}
                    />
                  </div>

                  <div className="pedido-compose-actions">
                    <div className="pedido-actions-summary">
                      <strong>{pedidoItemsValidos.length} items</strong> · <strong>{pedidoTotalUnidades} u.</strong>
                      {proveedorPedidoSeleccionado ? ` · ${proveedorPedidoSeleccionado.razon_social}` : ''}
                    </div>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={previewPedidoProveedor}
                      disabled={creatingPedido || loadingCatalogoPedido}
                    >
                      <Eye size={15} />
                      Vista previa
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={resetPedidoProveedorForm}
                      disabled={creatingPedido}
                    >
                      <RotateCcw size={15} />
                      Limpiar
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={crearPedidoProveedor}
                      disabled={creatingPedido || loadingCatalogoPedido || !proveedorPedidoTieneEmail}
                      title={!proveedorPedidoTieneEmail ? 'El proveedor debe tener email configurado' : 'Crear y enviar pedido'}
                    >
                      <Send size={15} />
                      {creatingPedido ? 'Procesando...' : 'Crear y enviar'}
                    </button>
                  </div>
                </>
              )}
            </div>

            <aside className="pedido-compose-side">
              <div className="pedido-compose-card">
                <h3 className="pedido-compose-title">
                  <ClipboardList size={16} />
                  Resumen del pedido
                </h3>
                <div className="pedido-email-preview" style={{ background: 'transparent', border: 'none', padding: 0, gap: 0 }}>
                  <div className="pedido-resumen-row">
                    <span>Proveedor</span>
                    <strong>{proveedorPedidoSeleccionado?.razon_social || '—'}</strong>
                  </div>
                  <div className="pedido-resumen-row">
                    <span>N° pedido</span>
                    <strong>{numeroPedidoDraft || '—'}</strong>
                  </div>
                  <div className="pedido-resumen-row">
                    <span>Fecha estimada</span>
                    <strong>{fechaEstimadaPedido || 'A confirmar'}</strong>
                  </div>
                  <div className="pedido-resumen-row">
                    <span>Sede</span>
                    <strong>{sedeOperativaLabel}</strong>
                  </div>
                </div>
                <div className="pedido-resumen-totals">
                  <div className="pedido-resumen-total-row">
                    <span>Productos distintos</span>
                    <strong>{pedidoItemsValidos.length}</strong>
                  </div>
                  <div className="pedido-resumen-total-row big">
                    <span>Total unidades</span>
                    <strong>{pedidoTotalUnidades}</strong>
                  </div>
                </div>
              </div>

              <div className="pedido-compose-card">
                <h3 className="pedido-compose-title" style={{ fontSize: '14px' }}>
                  <CheckCircle2 size={16} />
                  Para poder enviar
                </h3>
                {(() => {
                  const checks = [
                    { ok: Boolean(proveedorPedidoId), label: 'Proveedor seleccionado' },
                    { ok: proveedorPedidoTieneEmail, label: 'Proveedor con email configurado' },
                    { ok: pedidoItemsValidos.length > 0, label: 'Al menos 1 item con cantidad > 0' },
                    { ok: Boolean(numeroPedidoDraft.trim()), label: 'Número de pedido cargado' }
                  ]
                  const faltantes = checks.filter(c => !c.ok).length
                  return (
                    <>
                      <div className="pedido-checklist">
                        {checks.map((check, i) => (
                          <div key={i} className={`pedido-check ${check.ok ? 'done' : 'todo'}`}>
                            <span className="pedido-check-mark">{check.ok ? '✓' : '!'}</span>
                            {check.label}
                          </div>
                        ))}
                      </div>
                      <span className={`pedido-status-pill ${faltantes === 0 ? '' : 'warning'}`} style={{ marginTop: '14px' }}>
                        {faltantes === 0
                          ? <><CheckCircle2 size={13} /> Listo para crear y enviar</>
                          : <><AlertTriangle size={13} /> Falta{faltantes > 1 ? 'n' : ''} {faltantes} requisito{faltantes > 1 ? 's' : ''}</>}
                      </span>
                    </>
                  )
                })()}
              </div>

              <p className="pedido-info-box">
                Al crear el pedido se registra en inventario como <strong>pedido en tránsito</strong>. El correo al proveedor se envía desde el servidor; el envío es obligatorio para pedidos a proveedor.
              </p>
            </aside>
          </div>
        )}

        {/* ==================== TAB: ENTRADAS SIMPLES ==================== */}
        {activeTab === 'entradas' && (
          <DataTable
            data={entradasFiltered}
            columns={entradasColumns}
            loading={loadingPedidos}
            searchPlaceholder="Buscar por producto o proveedor..."
            emptyIcon={<ArrowDownCircle size={48}
          />}
            emptyTitle="No hay entradas pendientes de recepcion"
            emptyDescription="Las entradas aprobadas pendientes de recepcionar apareceran aqui"
pageSize={100}
            pageSizeOptions={[10, 20, 50, 100]}
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
                {pedidosFiltrados.map((pedido) => {
                  const sla = getPedidoSla(pedido)
                  return (
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
                          <span className={`sla-badge ${sla.className}`}>{sla.label}</span>
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
                                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                      {item.producto_nombre}
                                      {item.cantidad_recibida > 0 && item.cantidad_pendiente > 0 && (
                                        <span className="item-exception-badge">Parcial</span>
                                      )}
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
                                      canApprove ? (
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
                                          background: 'var(--badge-yellow-bg)',
                                          color: 'var(--badge-yellow-text)',
                                          borderRadius: '6px',
                                          fontSize: '12px',
                                          fontWeight: 600
                                        }}>
                                          Pendiente
                                        </span>
                                      )
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
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* ==================== TAB: EXCEPCIONES ==================== */}
        {activeTab === 'excepciones' && (
          <>
            {pedidosConExcepcion.length === 0 ? (
              <div className="empty-state">
                <CheckCircle size={48} />
                <h3>Sin excepciones operativas</h3>
                <p>No hay pedidos con fecha vencida, sin fecha o con recepcion parcial pendiente.</p>
              </div>
            ) : (
              <div className="excepciones-grid">
                {pedidosConExcepcion.map((pedido) => {
                  const sla = getPedidoSla(pedido)
                  const itemsParciales = pedido.items.filter(item =>
                    item.cantidad_recibida > 0 && item.cantidad_pendiente > 0
                  )
                  const itemsPendientes = pedido.items.filter(item => item.cantidad_pendiente > 0)

                  return (
                    <div
                      key={pedido.pedido_id}
                      className={`excepcion-card ${sla.className === 'sla-danger' ? 'critica' : ''}`}
                    >
                      <div className="excepcion-header">
                        <div>
                          <div className="excepcion-title">{pedido.numero_pedido}</div>
                          <div className="excepcion-meta">
                            {pedido.proveedor_nombre} • {itemsPendientes.length} items pendientes
                          </div>
                        </div>
                        <span className={`sla-badge ${sla.className}`}>{sla.label}</span>
                      </div>

                      <div className="excepcion-list">
                        {!pedido.fecha_estimada_llegada && (
                          <div className="excepcion-row">
                            <span>Fecha estimada pendiente</span>
                            <strong>Completar seguimiento</strong>
                          </div>
                        )}
                        {sla.className === 'sla-danger' && (
                          <div className="excepcion-row">
                            <span>Pedido vencido</span>
                            <strong>Reclamar proveedor</strong>
                          </div>
                        )}
                        {itemsParciales.length > 0 && (
                          <div className="excepcion-row">
                            <span>Recepcion parcial</span>
                            <strong>{itemsParciales.length} items</strong>
                          </div>
                        )}
                        {itemsPendientes.slice(0, 3).map((item) => (
                          <div key={item.item_id} className="excepcion-row">
                            <span>{item.producto_codigo} - {item.producto_nombre}</span>
                            <strong>{item.cantidad_pendiente} pendientes</strong>
                          </div>
                        ))}
                        {itemsPendientes.length > 3 && (
                          <div className="excepcion-row">
                            <span>Items adicionales con saldo</span>
                            <strong>+{itemsPendientes.length - 3}</strong>
                          </div>
                        )}
                      </div>

                      <div className="excepcion-footer">
                        <button
                          type="button"
                          className="excepcion-action"
                          onClick={() => {
                            setActiveTab('pedidos')
                            setExpandedPedidos(prev => {
                              const next = new Set(prev)
                              next.add(pedido.pedido_id)
                              return next
                            })
                          }}
                        >
                          <Eye size={14} />
                          Ver pedido
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* ==================== TAB: APROBACIONES INTERNAS ==================== */}
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
                    <h3>No hay aprobaciones pendientes</h3>
                    <p>
                      {filtroTipo === 'todos'
                        ? 'Todos los movimientos internos han sido procesados'
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
                          {canApprove && (
                            <>
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
                            </>
                          )}
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
