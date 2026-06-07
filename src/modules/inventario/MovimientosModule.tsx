import { useEffect, useState, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { LoadingOverlay } from '../../components/ui/LoadingOverlay'
import { SearchableSelect } from '../../components/ui/SearchableSelect'
import type { SearchableSelectOption } from '../../components/ui/SearchableSelect'
import { usePermissions } from '../../contexts/PermissionsContext'
import { useSede } from '../../contexts/SedeContext'
import Swal from 'sweetalert2'
import { showSuccess } from '../../utils/toast'
import {
  RotateCcw,
  Truck,
  PackagePlus,
  PackageMinus,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Package,
  ArrowDownCircle,
  Check,
  FileText
} from 'lucide-react'

// =====================================================
// TIPOS E INTERFACES
// =====================================================
interface Producto {
  id: string
  codigo: string
  nombre: string
  tipo: 'REPUESTOS' | 'HERRAMIENTAS'
  es_retornable: boolean
  unidades_medida?: {
    codigo: string
    descripcion: string
  }
  stock_disponible?: number
}

interface Proveedor {
  id: string
  razon_social: string
  numero_documento: string
}

interface StockPorProveedor {
  proveedor_id: string
  proveedor_nombre: string
  cantidad: number
  inventario_id: string
}

interface Vehiculo {
  id: string
  patente: string
  marca: string
  modelo: string
}

interface ProductoAsignadoVehiculo {
  producto_id: string
  proveedor_id: string
  cantidad: number
  inventario_id: string
  producto?: Producto
  proveedor_nombre: string
}

// Tipos simplificados (sin daño y pérdida como opciones principales)
type TipoMovimiento = 'entrada' | 'salida' | 'asignacion' | 'devolucion'

// Motivos de salida
type MotivoSalida = 'venta' | 'consumo_servicio' | 'dañado' | 'perdido'

// Estado de retorno para devoluciones
type EstadoRetorno = 'operativa' | 'dañada' | 'perdida'

// Estado inicial para entradas
type EstadoInicial = 'disponible' | 'en_transito'

// Categoría de servicio
type CategoriaServicio = 'mantenimiento' | 'mecanica' | 'chapa_pintura' | 'otro'

const CATEGORIAS_SERVICIO: { value: CategoriaServicio; label: string }[] = [
  { value: 'mantenimiento', label: 'Mantenimiento' },
  { value: 'mecanica', label: 'Mecánica' },
  { value: 'chapa_pintura', label: 'Chapa y Pintura' },
  { value: 'otro', label: 'Otro' },
]

interface ProductoLote {
  producto_id: string
  cantidad: number
  producto?: Producto
}

interface ProductoLoteSalida {
  id: string // ID único para el item
  producto_id: string
  producto?: Producto
  vehiculo_id: string
  vehiculo?: Vehiculo
  cantidad: number
  proveedor_id?: string
  inventario_id?: string
}

// =====================================================
// COMPONENTE PRINCIPAL
// =====================================================
export function MovimientosModule() {
  const location = useLocation()
  const navigate = useNavigate()
  const { aplicarFiltroSede, sedeActualId } = useSede()
  const { canCreateInSubmenu } = usePermissions()

  // Permisos específicos para el submenú de movimientos
  const canCreate = canCreateInSubmenu('inventario-movimientos')

  // Estados de datos
  const [productos, setProductos] = useState<Producto[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([])
  const [vehiculosConInventario, setVehiculosConInventario] = useState<Vehiculo[]>([])
  const [productosAsignadosVehiculo, setProductosAsignadosVehiculo] = useState<ProductoAsignadoVehiculo[]>([])
  const [stockPorProveedor, setStockPorProveedor] = useState<StockPorProveedor[]>([])
  const [loading, setLoading] = useState(true)

  // Estado del formulario
  const [tipoMovimiento, setTipoMovimiento] = useState<TipoMovimiento>('entrada')

  // Filtros
  const [tipoProductoFiltro, setTipoProductoFiltro] = useState<'TODOS' | 'REPUESTOS' | 'HERRAMIENTAS'>('TODOS')

  // Modo de entrada/salida por lote
  const [modoLote, setModoLote] = useState(false)
  const [productosLote, setProductosLote] = useState<ProductoLote[]>([])
  const [productosLoteSalida, setProductosLoteSalida] = useState<ProductoLoteSalida[]>([])

  // Form data común
  const [productoId, setProductoId] = useState('')
  const [proveedorId, setProveedorId] = useState('')
  const [cantidad, setCantidad] = useState(1)
  const [vehiculoId, setVehiculoId] = useState('')
  const [observaciones, setObservaciones] = useState('')

  // Form data - Entrada
  const [estadoInicial, setEstadoInicial] = useState<EstadoInicial>('en_transito')
  const [numeroPedido, setNumeroPedido] = useState('')
  const [fechaEstimadaLlegada, setFechaEstimadaLlegada] = useState('')

  // Modo RECEPCIÓN DE PEDIDO: entrada vinculada a un pedido existente.
  // Cuando está activo, el lote se procesa con procesar_recepcion_pedido (cierra el ciclo).
  const [recepcionPedido, setRecepcionPedido] = useState<{
    pedido_id: string
    numero_pedido: string
    proveedor_nombre: string
    items: { item_id: string; producto_id: string; producto_codigo: string; producto_nombre: string; objetivo: number; recibido: number; pendiente: number }[]
  } | null>(null)
  const [recepcionCantidades, setRecepcionCantidades] = useState<Record<string, number>>({})

  // Form data - Salida
  const [motivoSalida, setMotivoSalida] = useState<MotivoSalida>('consumo_servicio')
  const [categoriaServicio, setCategoriaServicio] = useState<CategoriaServicio | ''>('')
  const [modoLoteSalida, setModoLoteSalida] = useState(false)

  // Form data - Devolución
  const [estadoRetorno, setEstadoRetorno] = useState<EstadoRetorno>('operativa')
  const [categoriaServicioDevolucion, setCategoriaServicioDevolucion] = useState<CategoriaServicio | ''>('')
  const [prefillSearchApplied, setPrefillSearchApplied] = useState('')

  // =====================================================
  // EFECTOS
  // =====================================================
  useEffect(() => {
    loadData()
  }, [sedeActualId])

  useEffect(() => {
    // Cargar stock por proveedor cuando se selecciona producto (solo para salida y asignación)
    const shouldLoadStock = productoId && !modoLote && (
      tipoMovimiento === 'salida' ||
      tipoMovimiento === 'asignacion'
    )

    if (shouldLoadStock) {
      loadStockPorProveedor(productoId)
    } else if (!modoLote && tipoMovimiento !== 'entrada') {
      // Solo limpiar stock si no es entrada (en entrada el usuario selecciona proveedor manualmente)
      if (tipoMovimiento !== 'devolucion' || !vehiculoId) {
        setStockPorProveedor([])
      }
    }
  }, [productoId, tipoMovimiento, modoLote, vehiculoId])

  useEffect(() => {
    // Reset al cambiar tipo de movimiento
    resetForm()
  }, [tipoMovimiento])

  useEffect(() => {
    if (!location.search) return

    const params = new URLSearchParams(location.search)
    const tipo = params.get('tipo')

    if (
      tipo &&
      ['entrada', 'salida', 'asignacion', 'devolucion'].includes(tipo) &&
      tipoMovimiento !== tipo
    ) {
      setTipoMovimiento(tipo as TipoMovimiento)
    }
  }, [location.search, tipoMovimiento])

  useEffect(() => {
    if (!location.search || prefillSearchApplied === location.search) return

    const params = new URLSearchParams(location.search)
    const tipo = params.get('tipo') as TipoMovimiento | null

    if (tipo && ['entrada', 'salida', 'asignacion', 'devolucion'].includes(tipo) && tipoMovimiento !== tipo) {
      return
    }

    const producto = params.get('producto')
    const vehiculo = params.get('vehiculo')
    const motivo = params.get('motivo')

    if (vehiculo) {
      setVehiculoId(vehiculo)
    }

    if (producto) {
      setProductoId(producto)
    }

    if (motivo === 'danado') {
      setMotivoSalida('dañado')
      setObservaciones(prev => prev || 'Reporte iniciado desde asignaciones activas')
    }

    setPrefillSearchApplied(location.search)
  }, [location.search, prefillSearchApplied, productos, tipoMovimiento])

  // Modo RECEPCIÓN DE PEDIDO: si la URL trae ?pedido=<id>, cargar el pedido y precargar el lote
  useEffect(() => {
    if (!location.search) return
    const params = new URLSearchParams(location.search)
    const pedidoId = params.get('pedido')
    if (!pedidoId || (recepcionPedido && recepcionPedido.pedido_id === pedidoId)) return

    const cargarPedido = async () => {
      const { data, error } = await supabase
        .from('v_pedidos_en_transito')
        .select('*')
        .eq('pedido_id', pedidoId)
      if (error || !data || data.length === 0) return

      const items = (data as any[]).map(row => {
        const objetivo = row.cantidad_confirmada ?? row.cantidad_pedida
        const recibido = row.cantidad_recibida || 0
        return {
          item_id: row.item_id,
          producto_id: row.producto_id,
          producto_codigo: row.producto_codigo,
          producto_nombre: row.producto_nombre,
          objetivo,
          recibido,
          pendiente: Math.max(0, objetivo - recibido),
          estado_confirmacion: row.estado_confirmacion
        }
      }).filter(it => (it as any).estado_confirmacion !== 'rechazado' && it.pendiente > 0)

      if (items.length === 0) return

      const first = data[0] as any
      setRecepcionPedido({
        pedido_id: pedidoId,
        numero_pedido: first.numero_pedido,
        proveedor_nombre: first.proveedor_nombre,
        items
      })
      // Precargar cantidades con lo pendiente (recibir todo lo confirmado por defecto)
      const cant: Record<string, number> = {}
      items.forEach(it => { cant[it.item_id] = it.pendiente })
      setRecepcionCantidades(cant)
      // Asegurar que estamos en tipo entrada
      setTipoMovimiento('entrada')
    }
    cargarPedido()
  }, [location.search, recepcionPedido])

  useEffect(() => {
    if (tipoMovimiento === 'devolucion') {
      loadVehiculosConInventario()
    }
  }, [tipoMovimiento])

  useEffect(() => {
    if (tipoMovimiento === 'devolucion' && vehiculoId) {
      loadProductosAsignadosVehiculo(vehiculoId)
    } else if (tipoMovimiento === 'devolucion') {
      setProductosAsignadosVehiculo([])
      setProductoId('')
    }
  }, [vehiculoId, tipoMovimiento])

  // =====================================================
  // FUNCIONES DE CARGA
  // =====================================================
  const loadData = async () => {
    try {
      setLoading(true)

      const [prodRes, provRes, vehRes, stockRes] = await Promise.all([
        supabase
          .from('productos')
          .select(`
            id, codigo, nombre, tipo, es_retornable,
            unidades_medida (codigo, descripcion)
          `)
          .order('nombre'),
        supabase
          .from('proveedores')
          .select('id, razon_social, numero_documento')
          .eq('activo', true)
          .order('razon_social'),
        aplicarFiltroSede(supabase
          .from('vehiculos')
          .select('id, patente, marca, modelo')
          .is('deleted_at', null))
          .order('patente'),
        // Cargar stock disponible por producto
        supabase
          .from('inventario')
          .select('producto_id, cantidad')
          .eq('estado', 'disponible')
      ])

      // Calcular stock disponible por producto
      const stockPorProducto: Record<string, number> = {}
      if (stockRes.data) {
        stockRes.data.forEach((item: any) => {
          stockPorProducto[item.producto_id] = (stockPorProducto[item.producto_id] || 0) + Number(item.cantidad)
        })
      }

      // Agregar stock_disponible a cada producto
      if (prodRes.data) {
        const productosConStock = prodRes.data.map((p: any) => ({
          ...p,
          stock_disponible: stockPorProducto[p.id] || 0
        }))
        setProductos(productosConStock)
      }
      if (provRes.data) setProveedores(provRes.data)
      if (vehRes.data) setVehiculos(vehRes.data)
    } catch {
      Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudieron cargar los datos necesarios' })
    } finally {
      setLoading(false)
    }
  }

  const loadStockPorProveedor = async (productoId: string) => {
    try {
      const { data, error } = await supabase
        .from('inventario')
        .select(`id, proveedor_id, cantidad, proveedores (id, razon_social)`)
        .eq('producto_id', productoId)
        .eq('estado', 'disponible')
        .gt('cantidad', 0)

      if (error) throw error

      const stockAgrupado: StockPorProveedor[] = (data || []).map((item: any) => ({
        proveedor_id: item.proveedor_id,
        proveedor_nombre: item.proveedores?.razon_social || 'Sin proveedor',
        cantidad: item.cantidad,
        inventario_id: item.id
      }))

      // Ordenar por cantidad descendente (mayor stock primero)
      stockAgrupado.sort((a, b) => b.cantidad - a.cantidad)

      setStockPorProveedor(stockAgrupado)

      // Auto-seleccionar el proveedor con mayor stock
      if (stockAgrupado.length > 0) {
        setProveedorId(stockAgrupado[0].proveedor_id)
      }
    } catch {
      setStockPorProveedor([])
    }
  }

  const loadVehiculosConInventario = async () => {
    try {
      const { data, error } = await supabase
        .from('inventario')
        .select(`
          asignado_a_vehiculo_id,
          productos (es_retornable),
          vehiculos (id, patente, marca, modelo)
        `)
        .eq('estado', 'en_uso')
        .not('asignado_a_vehiculo_id', 'is', null)
        .gt('cantidad', 0)

      if (error) throw error

      const vehiculosUnicos = (data || [])
        .filter((item: any) =>
          item.asignado_a_vehiculo_id &&
          item.vehiculos &&
          item.productos?.es_retornable === true
        )
        .reduce((acc: Vehiculo[], item: any) => {
          if (!acc.find(v => v.id === item.asignado_a_vehiculo_id)) {
            acc.push({
              id: item.vehiculos.id,
              patente: item.vehiculos.patente,
              marca: item.vehiculos.marca,
              modelo: item.vehiculos.modelo
            })
          }
          return acc
        }, [])

      setVehiculosConInventario(vehiculosUnicos)
    } catch {
      setVehiculosConInventario([])
    }
  }

  const loadProductosAsignadosVehiculo = async (vehiculoId: string) => {
    try {
      const { data, error } = await supabase
        .from('inventario')
        .select(`
          id, producto_id, proveedor_id, cantidad,
          productos (id, codigo, nombre, tipo, es_retornable),
          proveedores (id, razon_social)
        `)
        .eq('asignado_a_vehiculo_id', vehiculoId)
        .eq('estado', 'en_uso')
        .gt('cantidad', 0)

      if (error) throw error

      const productosAgrupados = (data || [])
        .filter((item: any) => item.productos?.es_retornable === true)
        .reduce((acc: ProductoAsignadoVehiculo[], item: any) => {
          const existente = acc.find(p => p.producto_id === item.producto_id)
          if (existente) {
            existente.cantidad += Number(item.cantidad)
          } else {
            acc.push({
              producto_id: item.producto_id,
              proveedor_id: '',
              cantidad: Number(item.cantidad),
              inventario_id: item.id,
              producto: item.productos,
              proveedor_nombre: 'N/A'
            })
          }
          return acc
        }, [])

      setProductosAsignadosVehiculo(productosAgrupados)
    } catch {
      setProductosAsignadosVehiculo([])
    }
  }

  // =====================================================
  // FUNCIONES DE FORMULARIO
  // =====================================================
  const resetForm = () => {
    setProductoId('')
    setProveedorId('')
    setCantidad(1)
    setVehiculoId('')
    setObservaciones('')
    setTipoProductoFiltro('TODOS')
    setStockPorProveedor([])
    setProductosLote([])
    setModoLote(false)
    setModoLoteSalida(false)
    setProductosLoteSalida([])
    setProductosAsignadosVehiculo([])
    setEstadoInicial('en_transito') // Siempre en tránsito
    setNumeroPedido('')
    setFechaEstimadaLlegada('')
    setMotivoSalida('consumo_servicio')
    setCategoriaServicio('')
    setEstadoRetorno('operativa')
    setCategoriaServicioDevolucion('')
  }

  // Determinar si requiere aprobación
  // TODOS los movimientos excepto entradas requieren aprobación (sin importar el rol)
  const requiereAprobacion = (): boolean => {
    return tipoMovimiento !== 'entrada'
  }

  // =====================================================
  // VALIDACIONES
  // =====================================================
  const showIncompleteWarning = (text: string) => {
    Swal.fire({ icon: 'warning', title: 'Datos incompletos', text })
  }

  /** Valida el lote de entrada. Retorna true si es válido. */
  const validateLoteEntrada = (): boolean => {
    if (!proveedorId) {
      showIncompleteWarning('Debes seleccionar un proveedor')
      return false
    }
    if (productosLote.length === 0) {
      showIncompleteWarning('Debes agregar al menos un producto al lote')
      return false
    }
    if (estadoInicial === 'en_transito' && !numeroPedido.trim()) {
      showIncompleteWarning('Debes ingresar un número de pedido para productos en tránsito')
      return false
    }
    return true
  }

  /** Valida el lote de salida. Retorna true si es válido. */
  const validateLoteSalida = (): boolean => {
    if (productosLoteSalida.length === 0) {
      showIncompleteWarning('Debes agregar al menos un producto al lote')
      return false
    }
    if (!motivoSalida) {
      showIncompleteWarning('Debes seleccionar un motivo de salida')
      return false
    }
    if (motivoSalida === 'consumo_servicio' && !categoriaServicio) {
      showIncompleteWarning('Debes seleccionar una categoría de servicio')
      return false
    }
    return true
  }

  /** Valida el movimiento simple. Retorna true si es válido. */
  const validateMovimientoSimple = (): boolean => {
    if (!productoId || cantidad <= 0) {
      showIncompleteWarning('Selecciona un producto y una cantidad válida')
      return false
    }

    if (tipoMovimiento === 'entrada' && !proveedorId) {
      showIncompleteWarning('Debes seleccionar un proveedor para la entrada')
      return false
    }

    if (tipoMovimiento === 'salida') {
      if (!proveedorId) { showIncompleteWarning('Debes seleccionar un proveedor'); return false }
      if (!motivoSalida) { showIncompleteWarning('Debes seleccionar un motivo de salida'); return false }
      if (motivoSalida === 'consumo_servicio' && !categoriaServicio) {
        showIncompleteWarning('Debes seleccionar una categoría de servicio')
        return false
      }
    }

    if (tipoMovimiento === 'asignacion') {
      const producto = productos.find(p => p.id === productoId)
      if (!producto?.es_retornable) {
        Swal.fire({ icon: 'error', title: 'Operación no permitida', text: 'Solo las herramientas pueden ser asignadas' })
        return false
      }
      if (!vehiculoId) { showIncompleteWarning('Debes seleccionar un vehículo'); return false }
      if (!categoriaServicio) { showIncompleteWarning('Debes seleccionar una categoría de servicio'); return false }
      if (!proveedorId) { showIncompleteWarning('Debes seleccionar un proveedor'); return false }
    }

    if (tipoMovimiento === 'devolucion') {
      if (!vehiculoId) { showIncompleteWarning('Debes seleccionar el vehículo que devuelve'); return false }
      if (!estadoRetorno) { showIncompleteWarning('Debes indicar el estado de la herramienta'); return false }
      if ((estadoRetorno === 'dañada' || estadoRetorno === 'perdida') && !observaciones.trim()) {
        showIncompleteWarning('Debes agregar observaciones para herramientas dañadas o perdidas')
        return false
      }
    }

    // Validar stock disponible
    if (tipoMovimiento === 'salida' || tipoMovimiento === 'asignacion') {
      const stockProveedor = stockPorProveedor.find(s => s.proveedor_id === proveedorId)
      if (!stockProveedor || stockProveedor.cantidad < cantidad) {
        Swal.fire({
          icon: 'error',
          title: 'Stock insuficiente',
          text: `No hay suficiente stock. Disponible: ${stockProveedor?.cantidad || 0}`
        })
        return false
      }
    }

    return true
  }

  // =====================================================
  // MANEJADORES DE MOVIMIENTO
  // =====================================================

  /** Procesa la RECEPCIÓN de un pedido: cada item vía procesar_recepcion_pedido (cierra el ciclo) */
  const handleRecepcionPedido = async () => {
    if (!recepcionPedido) return

    // Items con cantidad > 0 a recibir
    const aRecibir = recepcionPedido.items
      .map(it => ({ ...it, cantidad: Number(recepcionCantidades[it.item_id] || 0) }))
      .filter(it => it.cantidad > 0)

    if (aRecibir.length === 0) {
      Swal.fire('Sin cantidades', 'Indicá cuánto recibiste de al menos un producto.', 'warning')
      return
    }
    // Validar contra lo confirmado pendiente
    for (const it of aRecibir) {
      if (it.cantidad > it.pendiente) {
        Swal.fire('Cantidad inválida', `${it.producto_codigo}: no podés recibir más de ${it.pendiente} (confirmado pendiente).`, 'warning')
        return
      }
    }

    const confirm = await Swal.fire({
      title: 'Confirmar recepción',
      html: `Vas a registrar la entrada de <strong>${aRecibir.length} producto(s)</strong> del pedido <strong>${recepcionPedido.numero_pedido}</strong>. Esto suma al stock y actualiza el pedido.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Confirmar recepción',
      confirmButtonColor: '#059669',
      cancelButtonText: 'Cancelar'
    })
    if (!confirm.isConfirmed) return

    try {
      const { data: { user } } = await supabase.auth.getUser()
      let ok = 0
      const errores: string[] = []
      for (const it of aRecibir) {
        const { data, error } = await (supabase.rpc as any)('procesar_recepcion_pedido', {
          p_pedido_item_id: it.item_id,
          p_cantidad_recibida: it.cantidad,
          p_usuario_id: user?.id
        })
        if (error || (data && data.success === false)) {
          errores.push(`${it.producto_codigo}: ${error?.message || data?.error || 'error'}`)
        } else {
          ok++
        }
      }

      if (errores.length > 0) {
        Swal.fire({
          icon: ok > 0 ? 'warning' : 'error',
          title: ok > 0 ? 'Recepción parcial' : 'No se pudo recibir',
          html: `${ok} producto(s) recibidos.<br>Errores:<br>${errores.join('<br>')}`
        })
      } else {
        showSuccess('Recepción registrada', `${ok} producto(s) ingresados al stock del pedido ${recepcionPedido.numero_pedido}`)
      }
      // Volver a Pedidos
      navigate('/logistica/inventario/pedidos')
    } catch (error: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: error.message || 'No se pudo procesar la recepción' })
    }
  }

  /** Procesa entrada en modo lote */
  const handleLoteEntrada = async () => {
    if (!validateLoteEntrada()) return

    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (estadoInicial === 'en_transito') {
        const items = productosLote.map(pl => ({
          producto_id: pl.producto_id,
          cantidad: pl.cantidad
        }))

        const { error } = await (supabase.rpc as any)('crear_pedido_inventario', {
          p_numero_pedido: numeroPedido,
          p_proveedor_id: proveedorId,
          p_fecha_estimada: fechaEstimadaLlegada || null,
          p_observaciones: observaciones || null,
          p_usuario_id: user?.id,
          p_items: JSON.stringify(items)
        })
        if (error) throw error

        showSuccess('Pedido creado', `Pedido ${numeroPedido} creado con ${productosLote.length} productos en tránsito`)
      } else {
        for (const pl of productosLote) {
          const { error } = await (supabase.rpc as any)('procesar_movimiento_inventario', {
            p_producto_id: pl.producto_id,
            p_tipo_movimiento: 'entrada',
            p_cantidad: pl.cantidad,
            p_proveedor_id: proveedorId,
            p_usuario_id: user?.id,
            p_observaciones: observaciones || `Entrada en lote`
          })
          if (error) throw error
        }

        showSuccess('Éxito', `Entrada de ${productosLote.length} productos registrada correctamente`)
      }

      resetForm()
    } catch (error: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: error.message || 'No se pudo procesar el lote' })
    }
  }

  /** Procesa salida en modo lote */
  const handleLoteSalida = async () => {
    if (!validateLoteSalida()) return

    try {
      const { data: userData } = await supabase.auth.getUser()

      for (const item of productosLoteSalida) {
        const movimientoData: any = {
          producto_id: item.producto_id,
          tipo_movimiento: 'salida',
          cantidad: item.cantidad,
          proveedor_id: null, // Se determinará al aprobar según stock disponible
          vehiculo_destino_id: item.vehiculo_id || null,
          usuario_id: userData.user?.id,
          observaciones: observaciones || `Salida en lote - ${item.vehiculo?.patente || 'Sin vehículo'}`,
          motivo_salida: motivoSalida,
          estado_aprobacion: 'pendiente',
          categoria_servicio: motivoSalida === 'consumo_servicio' ? categoriaServicio : null
        }

        const { error } = await (supabase.from('movimientos') as any).insert(movimientoData)
        if (error) throw error
      }

      showSuccess('Lote enviado para aprobación', `${productosLoteSalida.length} salidas registradas para aprobación.`)
      resetForm()
      loadData()
    } catch (error: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: error.message || 'No se pudo procesar el lote de salidas' })
    }
  }

  /** Procesa un movimiento simple (entrada, salida, asignación o devolución) */
  const handleMovimientoSimple = async () => {
    if (!validateMovimientoSimple()) return

    try {
      const { data: userData } = await supabase.auth.getUser()
      const observacionesFinal = observaciones || ''

      const categoriaServicioFinal = (tipoMovimiento === 'salida' || tipoMovimiento === 'asignacion')
        ? categoriaServicio
        : (tipoMovimiento === 'devolucion' ? categoriaServicioDevolucion : null)

      // Para ENTRADA: usar el RPC (va a tránsito)
      if (tipoMovimiento === 'entrada') {
        const { error } = await (supabase.rpc as any)('procesar_movimiento_inventario', {
          p_producto_id: productoId,
          p_tipo_movimiento: tipoMovimiento,
          p_cantidad: cantidad,
          p_proveedor_id: proveedorId || null,
          p_conductor_destino_id: null,
          p_vehiculo_destino_id: vehiculoId || null,
          p_estado_destino: 'disponible',
          p_usuario_id: userData.user?.id,
          p_observaciones: observacionesFinal || null,
          p_motivo_salida: null,
          p_servicio_id: null,
          p_estado_aprobacion: 'aprobado',
          p_estado_retorno: null
        })
        if (error) throw error

        showSuccess('Entrada registrada', 'El producto está en tránsito. Confirma recepción desde "Pedidos en Tránsito".')
        resetForm()
        loadData()
        return
      }

      // Para SALIDA/ASIGNACION/DEVOLUCION: insertar directamente con estado pendiente
      const movimientoData: any = {
        producto_id: productoId,
        tipo_movimiento: tipoMovimiento,
        cantidad: cantidad,
        proveedor_id: tipoMovimiento === 'devolucion' ? null : (proveedorId || null),
        vehiculo_destino_id: (tipoMovimiento === 'asignacion' || tipoMovimiento === 'salida') ? (vehiculoId || null) : null,
        vehiculo_origen_id: tipoMovimiento === 'devolucion' ? vehiculoId : null,
        usuario_id: userData.user?.id,
        observaciones: observacionesFinal || null,
        motivo_salida: tipoMovimiento === 'salida' ? motivoSalida : null,
        estado_aprobacion: 'pendiente',
        estado_retorno: tipoMovimiento === 'devolucion' ? estadoRetorno : null,
        categoria_servicio: categoriaServicioFinal || null
      }

      const { error } = await (supabase.from('movimientos') as any).insert(movimientoData)
      if (error) throw error

      showSuccess('Movimiento enviado para aprobación', `${getTipoLabel(tipoMovimiento)} registrada. Pendiente de aprobación.`)
      resetForm()
      loadData()
    } catch (err: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.message || 'No se pudo procesar el movimiento' })
    }
  }

  // =====================================================
  // MANEJADOR PRINCIPAL
  // =====================================================
  const handleMovimiento = async () => {
    if (!canCreate) {
      Swal.fire('Sin permisos', 'No tienes permisos para registrar movimientos', 'error')
      return
    }

    if (recepcionPedido) return handleRecepcionPedido()
    if (modoLote && tipoMovimiento === 'entrada') return handleLoteEntrada()
    if (modoLoteSalida && tipoMovimiento === 'salida') return handleLoteSalida()
    return handleMovimientoSimple()
  }

  // =====================================================
  // HELPERS
  // =====================================================
  // =====================================================
  // INLINE HANDLER EXTRACTIONS
  // =====================================================
  const handleToggleModoLote = () => {
    setModoLote(!modoLote)
    setProductoId('')
    setProductosLote([])
    if (!modoLote) {
      setEstadoInicial('en_transito') // Lote siempre en tránsito
    }
  }

  const handleToggleModoLoteSalida = () => {
    setModoLoteSalida(!modoLoteSalida)
    setProductoId('')
    setProductosLoteSalida([])
    setVehiculoId('')
  }

  const handleAgregarProductoLoteEntrada = () => {
    if (!productoId || cantidad <= 0) return
    const prod = productos.find(p => p.id === productoId)
    if (!prod) return

    const existente = productosLote.find(pl => pl.producto_id === productoId)
    if (existente) {
      setProductosLote(productosLote.map(pl =>
        pl.producto_id === productoId
          ? { ...pl, cantidad: pl.cantidad + cantidad }
          : pl
      ))
    } else {
      setProductosLote([...productosLote, { producto_id: productoId, cantidad, producto: prod }])
    }
    setProductoId('')
    setCantidad(1)
  }

  const handleAgregarProductoLoteSalida = () => {
    if (!productoId || cantidad <= 0) return
    const prod = productos.find(p => p.id === productoId)
    if (!prod) return

    if ((prod.stock_disponible || 0) < cantidad) {
      Swal.fire({
        icon: 'warning',
        title: 'Stock insuficiente',
        text: `Stock disponible: ${prod.stock_disponible || 0}`
      })
      return
    }

    const veh = vehiculos.find(v => v.id === vehiculoId)
    const nuevoItem: ProductoLoteSalida = {
      id: `${productoId}-${vehiculoId || 'sin'}-${Date.now()}`,
      producto_id: productoId,
      producto: prod,
      vehiculo_id: vehiculoId,
      vehiculo: veh,
      cantidad: cantidad
    }
    setProductosLoteSalida([...productosLoteSalida, nuevoItem])
    setProductoId('')
    setVehiculoId('')
    setCantidad(1)
  }

  const handleTipoProductoFiltroChange = (tipo: 'TODOS' | 'REPUESTOS' | 'HERRAMIENTAS') => {
    setTipoProductoFiltro(tipo)
    setProductoId('')
  }

  const getTipoLabel = (tipo: TipoMovimiento): string => {
    const labels: Record<TipoMovimiento, string> = {
      entrada: 'Entrada',
      salida: 'Salida',
      asignacion: 'Uso de Herramienta',
      devolucion: 'Devolución'
    }
    return labels[tipo]
  }

  const getTipoIcon = (tipo: TipoMovimiento) => {
    const icons: Record<TipoMovimiento, any> = {
      entrada: <PackagePlus size={20} />,
      salida: <PackageMinus size={20} />,
      asignacion: <Truck size={20} />,
      devolucion: <RotateCcw size={20} />
    }
    return icons[tipo]
  }

  const getMotivoLabel = (motivo: MotivoSalida): string => {
    const labels: Record<MotivoSalida, string> = {
      venta: 'Venta',
      consumo_servicio: 'Consumo en servicio',
      dañado: 'Dañado',
      perdido: 'Perdido'
    }
    return labels[motivo]
  }

  // Filtrar productos
  const productosFiltrados = useMemo(() => {
    let filtered = [...productos]

    if (tipoProductoFiltro !== 'TODOS') {
      filtered = filtered.filter(p => p.tipo === tipoProductoFiltro)
    }

    if (tipoMovimiento === 'asignacion' || tipoMovimiento === 'devolucion') {
      filtered = filtered.filter(p => p.tipo === 'HERRAMIENTAS')
    }

    // Para salida y asignación, ordenar por stock disponible (mayor stock primero)
    if (tipoMovimiento === 'salida' || tipoMovimiento === 'asignacion') {
      filtered = filtered.sort((a, b) => (b.stock_disponible || 0) - (a.stock_disponible || 0))
    }

    return filtered
  }, [productos, tipoProductoFiltro, tipoMovimiento])

  const productoOptions = useMemo<SearchableSelectOption[]>(() =>
    productosFiltrados.map(producto => {
      const unidad = producto.unidades_medida?.descripcion || producto.unidades_medida?.codigo || 'Unidad'
      const stockText = (tipoMovimiento === 'salida' || tipoMovimiento === 'asignacion')
        ? ` · Stock: ${producto.stock_disponible || 0}`
        : ''

      return {
        value: producto.id,
        label: `${producto.codigo} - ${producto.nombre}`,
        subtitle: `${producto.tipo} · ${unidad}${stockText}`,
        searchText: `${producto.codigo} ${producto.nombre} ${producto.tipo} ${unidad}`
      }
    }),
    [productosFiltrados, tipoMovimiento]
  )

  const proveedorOptions = useMemo<SearchableSelectOption[]>(() =>
    proveedores.map(proveedor => ({
      value: proveedor.id,
      label: proveedor.razon_social,
      subtitle: proveedor.numero_documento || 'Sin documento',
      searchText: `${proveedor.razon_social} ${proveedor.numero_documento || ''}`
    })),
    [proveedores]
  )

  const vehiculoOptions = useMemo<SearchableSelectOption[]>(() =>
    vehiculos.map(vehiculo => ({
      value: vehiculo.id,
      label: `${vehiculo.patente} - ${vehiculo.marca} ${vehiculo.modelo}`,
      searchText: `${vehiculo.patente} ${vehiculo.marca} ${vehiculo.modelo}`
    })),
    [vehiculos]
  )

  const vehiculosConInventarioOptions = useMemo<SearchableSelectOption[]>(() =>
    vehiculosConInventario.map(vehiculo => ({
      value: vehiculo.id,
      label: `${vehiculo.patente} - ${vehiculo.marca} ${vehiculo.modelo}`,
      searchText: `${vehiculo.patente} ${vehiculo.marca} ${vehiculo.modelo}`
    })),
    [vehiculosConInventario]
  )

  const stockProveedorOptions = useMemo<SearchableSelectOption[]>(() =>
    stockPorProveedor.map(stock => ({
      value: stock.proveedor_id,
      label: stock.proveedor_nombre,
      subtitle: `Stock: ${stock.cantidad}`,
      searchText: `${stock.proveedor_nombre} ${stock.cantidad}`
    })),
    [stockPorProveedor]
  )

  const productosAsignadosVehiculoOptions = useMemo<SearchableSelectOption[]>(() =>
    productosAsignadosVehiculo.map(item => ({
      value: item.producto_id,
      label: `${item.producto?.codigo || ''} - ${item.producto?.nombre || 'Herramienta'}`,
      subtitle: `Cantidad asignada: ${item.cantidad}`,
      searchText: `${item.producto?.codigo || ''} ${item.producto?.nombre || ''} ${item.cantidad}`
    })),
    [productosAsignadosVehiculo]
  )

  // =====================================================
  // RENDER
  // =====================================================
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <p>Cargando...</p>
      </div>
    )
  }

  const productoSeleccionado = productos.find(p => p.id === productoId)

  return (
    <div
      className="movimientos-module"
      style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', maxWidth: '1200px', margin: '0 auto' }}
    >
      <style>{`
        .movimientos-module,
        .movimientos-module * {
          box-sizing: border-box;
        }

        @media (max-width: 640px) {
          .mov-form-card {
            padding: 16px !important;
          }

          .mov-toggle-row {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 10px;
          }

          .mov-toggle-button {
            width: 100%;
            justify-content: center;
            text-align: center;
            white-space: nowrap;
          }

          .mov-motivo-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }

          .mov-type-filter {
            flex-wrap: wrap;
          }

          .mov-form-actions {
            flex-direction: column;
          }

          .mov-form-actions > button {
            width: 100%;
            justify-content: center;
          }
        }

        @media (max-width: 380px) {
          .mov-motivo-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
      <LoadingOverlay show={loading} message="Cargando movimientos..." size="lg" />
      {requiereAprobacion() && (
        <div style={{
          padding: '8px 12px',
          background: 'var(--badge-yellow-bg)',
          border: '1px solid var(--color-warning)',
          borderRadius: '6px',
          fontSize: '13px',
          color: 'var(--badge-yellow-text)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <Clock size={16} />
          Los movimientos de salida, uso y devolucion requieren aprobacion de un encargado
        </div>
      )}

      {/* Selector de Tipo de Movimiento (oculto en modo recepción de pedido) */}
      {!recepcionPedido && (
      <div style={{ marginBottom: '24px' }}>
        <label style={{ display: 'block', marginBottom: '12px', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
          Tipo de Movimiento
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
          {(['entrada', 'salida', 'asignacion', 'devolucion'] as TipoMovimiento[]).map((tipo) => (
            <button
              key={tipo}
              onClick={() => setTipoMovimiento(tipo)}
              style={{
                padding: '12px 16px',
                background: tipoMovimiento === tipo ? 'var(--color-primary)' : 'var(--card-bg)',
                color: tipoMovimiento === tipo ? 'white' : 'var(--text-secondary)',
                border: `2px solid ${tipoMovimiento === tipo ? 'var(--color-primary)' : 'var(--border-primary)'}`,
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.2s'
              }}
            >
              {getTipoIcon(tipo)}
              {getTipoLabel(tipo)}
            </button>
          ))}
        </div>
      </div>
      )}

      {/* Formulario */}
      <div
        className="mov-form-card"
        style={{
        background: 'var(--card-bg)',
        borderRadius: '12px',
        padding: '24px',
        boxShadow: 'var(--shadow-sm)',
        border: '1px solid var(--border-primary)'
      }}
      >
        <div style={{ display: 'grid', gap: '20px' }}>

          {/* ============= PANEL RECEPCIÓN DE PEDIDO ============= */}
          {recepcionPedido && (
            <div style={{ display: 'grid', gap: '14px' }}>
              <div style={{
                background: 'var(--badge-green-bg)', border: '1px solid var(--badge-green-text)',
                borderRadius: '8px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px'
              }}>
                <ArrowDownCircle size={18} color="var(--badge-green-text)" />
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--badge-green-text)' }}>
                    Recepción del pedido {recepcionPedido.numero_pedido}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {recepcionPedido.proveedor_nombre} · indicá cuánto llegó de cada producto. Se sumará al stock y se cerrará el pedido.
                  </div>
                </div>
              </div>

              <div style={{ border: '1px solid var(--border-primary)', borderRadius: '8px', overflow: 'hidden' }}>
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 110px 110px 130px', gap: '10px',
                  padding: '10px 14px', background: 'var(--bg-secondary)',
                  fontSize: '10px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.4px'
                }}>
                  <span>Producto</span>
                  <span style={{ textAlign: 'center' }}>Confirmado pend.</span>
                  <span style={{ textAlign: 'center' }}>Ya recibido</span>
                  <span style={{ textAlign: 'center' }}>Recibir ahora</span>
                </div>
                {recepcionPedido.items.map(it => (
                  <div key={it.item_id} style={{
                    display: 'grid', gridTemplateColumns: '1fr 110px 110px 130px', gap: '10px',
                    padding: '10px 14px', alignItems: 'center', borderTop: '1px solid var(--border-primary)'
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '14px' }}>{it.producto_nombre}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{it.producto_codigo}</div>
                    </div>
                    <div style={{ textAlign: 'center', fontWeight: 700, fontFamily: 'monospace', color: 'var(--badge-yellow-text)' }}>{it.pendiente}</div>
                    <div style={{ textAlign: 'center', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{it.recibido}</div>
                    <div style={{ textAlign: 'center' }}>
                      <input
                        type="number" min={0} max={it.pendiente}
                        value={recepcionCantidades[it.item_id] ?? 0}
                        onChange={(e) => {
                          const v = Math.max(0, Math.min(it.pendiente, Number(e.target.value)))
                          setRecepcionCantidades(prev => ({ ...prev, [it.item_id]: v }))
                        }}
                        style={{
                          width: '90px', height: '36px', textAlign: 'center', fontFamily: 'monospace', fontWeight: 600,
                          border: '1px solid var(--border-primary)', borderRadius: '7px', background: 'var(--input-bg)', color: 'var(--text-primary)'
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => navigate('/logistica/inventario/pedidos')}
                  style={{ padding: '10px 18px', border: '1px solid var(--border-primary)', borderRadius: '8px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontWeight: 600, cursor: 'pointer' }}>
                  Cancelar
                </button>
                <button type="button" onClick={handleRecepcionPedido}
                  style={{ padding: '10px 18px', border: 'none', borderRadius: '8px', background: 'var(--color-success)', color: '#fff', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <Check size={16} /> Confirmar recepción
                </button>
              </div>
            </div>
          )}

          {/* ============= SECCIÓN ENTRADA ============= */}
          {tipoMovimiento === 'entrada' && !recepcionPedido && (
            <>
              {/* Toggle Modo Lote */}
              <div
                className="mov-toggle-row"
                style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-primary)',
                borderRadius: '8px',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)', marginBottom: '4px' }}>
                    {modoLote ? <><Package size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> Ingreso por Lote/Pedido</> : <><FileText size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> Ingreso Simple</>}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {modoLote
                      ? 'Registra múltiples productos en un solo pedido'
                      : 'Registra un producto a la vez'
                    }
                  </div>
                </div>
                <button
                  className="mov-toggle-button"
                  onClick={handleToggleModoLote}
                  style={{
                    padding: '8px 16px',
                    background: modoLote ? 'var(--color-primary)' : 'var(--text-secondary)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 600
                  }}
                >
                  {modoLote ? 'Cambiar a Simple' : 'Cambiar a Lote'}
                </button>
              </div>

              {/* Proveedor (siempre requerido) */}
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Proveedor *
                </label>
                <SearchableSelect
                  value={proveedorId}
                  onChange={setProveedorId}
                  options={proveedorOptions}
                  placeholder="Seleccionar proveedor..."
                  searchPlaceholder="Buscar proveedor..."
                  noResultsText="Sin proveedores"
                  size="lg"
                />
              </div>

              {/* Aviso de que siempre va a tránsito */}
              <div style={{
                background: 'var(--badge-yellow-bg)',
                border: '1px solid var(--color-warning)',
                borderRadius: '8px',
                padding: '12px',
                fontSize: '13px',
                color: 'var(--badge-yellow-text)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <Truck size={18} />
                <div>
                  <strong style={{ color: 'var(--color-warning)' }}>Los productos ingresarán en estado "En Tránsito".</strong>
                  <div style={{ fontSize: '12px', marginTop: '2px' }}>Deberás confirmar su recepción desde "Pedidos en Tránsito" para que pasen a stock disponible.</div>
                </div>
              </div>

              {/* Número de Pedido (siempre visible) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    N° Pedido/Referencia *
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: PED-001, FAC-123"
                    value={numeroPedido}
                    onChange={(e) => setNumeroPedido(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid var(--border-primary)',
                      borderRadius: '8px',
                      fontSize: '14px',
                      background: 'var(--input-bg)',
                      color: 'var(--text-primary)'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Fecha Estimada Llegada
                  </label>
                  <input
                    type="date"
                    value={fechaEstimadaLlegada}
                    onChange={(e) => setFechaEstimadaLlegada(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid var(--border-primary)',
                      borderRadius: '8px',
                      fontSize: '14px',
                      background: 'var(--input-bg)',
                      color: 'var(--text-primary)'
                    }}
                  />
                </div>
              </div>
            </>
          )}

          {/* ============= SECCIÓN SALIDA ============= */}
          {tipoMovimiento === 'salida' && (
            <>
              {/* Toggle Modo Lote Salida */}
              <div
                className="mov-toggle-row"
                style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-primary)',
                borderRadius: '8px',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)', marginBottom: '4px' }}>
                    {modoLoteSalida ? <><Package size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> Salida por Lote</> : <><FileText size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> Salida Simple</>}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {modoLoteSalida
                      ? 'Registra salidas de múltiples productos a diferentes vehículos'
                      : 'Registra la salida de un producto a la vez'
                    }
                  </div>
                </div>
                <button
                  className="mov-toggle-button"
                  onClick={handleToggleModoLoteSalida}
                  style={{
                    padding: '8px 16px',
                    background: modoLoteSalida ? 'var(--color-primary)' : 'var(--text-secondary)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 600
                  }}
                >
                  {modoLoteSalida ? 'Cambiar a Simple' : 'Cambiar a Lote'}
                </button>
              </div>

              {/* Motivo de Salida */}
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Motivo de Salida *
                </label>
                <div
                  className="mov-motivo-grid"
                  style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}
                >
                  {(['venta', 'consumo_servicio', 'dañado', 'perdido'] as MotivoSalida[]).map((motivo) => (
                    <button
                      key={motivo}
                      onClick={() => setMotivoSalida(motivo)}
                      style={{
                        minHeight: '44px',
                        padding: '8px',
                        background: motivoSalida === motivo ? 'var(--color-primary)' : 'var(--card-bg)',
                        color: motivoSalida === motivo ? 'white' : 'var(--text-secondary)',
                        border: `1px solid ${motivoSalida === motivo ? 'var(--color-primary)' : 'var(--border-primary)'}`,
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                        textAlign: 'center'
                      }}
                    >
                      {motivo === 'dañado' && <AlertTriangle size={14} style={{ marginRight: '4px' }} />}
                      {motivo === 'perdido' && <XCircle size={14} style={{ marginRight: '4px' }} />}
                      {getMotivoLabel(motivo)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Categoría de servicio (obligatorio si es consumo) */}
              {motivoSalida === 'consumo_servicio' && (
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Categoría de Servicio *
                  </label>
                  <select
                    value={categoriaServicio}
                    onChange={(e) => setCategoriaServicio(e.target.value as CategoriaServicio)}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid var(--border-primary)',
                      borderRadius: '8px',
                      fontSize: '14px',
                      background: 'var(--input-bg)',
                      color: 'var(--text-primary)'
                    }}
                  >
                    <option value="">Seleccionar categoría...</option>
                    {CATEGORIAS_SERVICIO.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* MODO SIMPLE: Vehículo (opcional) */}
              {!modoLoteSalida && (
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Vehículo/Patente (opcional)
                  </label>
                  <SearchableSelect
                    value={vehiculoId}
                    onChange={setVehiculoId}
                    options={vehiculoOptions}
                    placeholder="Sin vehículo asociado"
                    searchPlaceholder="Buscar patente..."
                    noResultsText="Sin vehículos"
                    size="lg"
                  />
                </div>
              )}

              {/* MODO LOTE: Gestión de productos con vehículos */}
              {modoLoteSalida && (
                <div style={{
                  background: 'var(--bg-secondary)',
                  border: '2px dashed var(--border-primary)',
                  borderRadius: '8px',
                  padding: '16px'
                }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>
                    Productos a dar salida ({productosLoteSalida.length})
                  </h3>

                  {/* Agregar nuevo item */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', marginBottom: '12px' }}>
                    {/* Selector de producto */}
                    <SearchableSelect
                      value={productoId}
                      onChange={setProductoId}
                      options={productoOptions}
                      placeholder="Buscar producto..."
                      searchPlaceholder="Buscar producto..."
                      noResultsText="Sin productos"
                      size="md"
                    />

                    {/* Selector de vehículo */}
                    <SearchableSelect
                      value={vehiculoId}
                      onChange={setVehiculoId}
                      options={vehiculoOptions}
                      placeholder="Sin vehículo"
                      searchPlaceholder="Buscar patente..."
                      noResultsText="Sin vehículos"
                      size="md"
                    />

                    {/* Cantidad */}
                    <input
                      type="number"
                      min="1"
                      placeholder="Cant."
                      value={cantidad}
                      onChange={(e) => setCantidad(Number(e.target.value))}
                      style={{
                        width: '80px',
                        padding: '8px 12px',
                        border: '1px solid var(--border-primary)',
                        borderRadius: '6px',
                        fontSize: '13px',
                        background: 'var(--input-bg)',
                        color: 'var(--text-primary)'
                      }}
                    />

                    {/* Botón agregar */}
                    <button
                      onClick={handleAgregarProductoLoteSalida}
                      style={{
                        padding: '8px 16px',
                        background: 'var(--color-primary)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: 600
                      }}
                    >
                      + Agregar
                    </button>
                  </div>

                  {/* Lista de items agregados */}
                  {productosLoteSalida.length > 0 ? (
                    <div style={{ display: 'grid', gap: '8px' }}>
                      {productosLoteSalida.map((item) => (
                        <div
                          key={item.id}
                          style={{
                            background: 'var(--card-bg)',
                            padding: '12px',
                            borderRadius: '6px',
                            border: '1px solid var(--border-primary)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
                              {item.producto?.codigo} - {item.producto?.nombre}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', gap: '12px', marginTop: '4px' }}>
                              <span>{item.cantidad} {item.producto?.unidades_medida?.descripcion || 'und'}</span>
                              <span style={{ 
                                padding: '2px 8px', 
                                background: item.vehiculo ? 'var(--badge-blue-bg)' : 'var(--badge-gray-bg)',
                                color: item.vehiculo ? 'var(--badge-blue-text)' : 'var(--text-secondary)',
                                borderRadius: '4px',
                                fontSize: '11px'
                              }}>
                                {item.vehiculo ? `${item.vehiculo.patente}` : 'Sin vehículo'}
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => setProductosLoteSalida(productosLoteSalida.filter(i => i.id !== item.id))}
                            style={{
                              padding: '6px 12px',
                              background: 'var(--badge-red-bg)',
                              color: 'var(--color-danger)',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '12px',
                              fontWeight: 600
                            }}
                          >
                            Quitar
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', fontStyle: 'italic', textAlign: 'center', padding: '16px' }}>
                      No hay productos agregados. Busca un producto, selecciona el vehículo destino y agrega.
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {/* ============= SECCIÓN USO (ASIGNACIÓN) ============= */}
          {tipoMovimiento === 'asignacion' && (
            <>
              <div style={{
                background: 'var(--badge-blue-bg)',
                border: '1px solid var(--color-info)',
                borderRadius: '8px',
                padding: '12px',
                fontSize: '13px',
                color: 'var(--badge-blue-text)'
              }}>
                <strong>Nota:</strong> Solo herramientas pueden asignarse a vehículos. La herramienta cambia a estado "En uso" y no se descuenta del stock.
              </div>

              {/* Vehículo (obligatorio) */}
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Vehículo/Patente *
                </label>
                <SearchableSelect
                  value={vehiculoId}
                  onChange={setVehiculoId}
                  options={vehiculoOptions}
                  placeholder="Seleccionar vehículo..."
                  searchPlaceholder="Buscar patente..."
                  noResultsText="Sin vehículos"
                  size="lg"
                />
              </div>

              {/* Categoría de servicio (obligatorio) */}
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Categoría de Servicio *
                </label>
                <select
                  value={categoriaServicio}
                  onChange={(e) => setCategoriaServicio(e.target.value as CategoriaServicio)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '8px',
                    fontSize: '14px',
                    background: 'var(--input-bg)',
                    color: 'var(--text-primary)'
                  }}
                >
                  <option value="">Seleccionar categoría...</option>
                  {CATEGORIAS_SERVICIO.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* ============= SECCIÓN DEVOLUCIÓN ============= */}
          {tipoMovimiento === 'devolucion' && (
            <>
              {/* Vehículo que devuelve */}
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Vehículo que devuelve *
                </label>
                <SearchableSelect
                  value={vehiculoId}
                  onChange={setVehiculoId}
                  options={vehiculosConInventarioOptions}
                  placeholder="Seleccionar vehículo..."
                  searchPlaceholder="Buscar patente..."
                  noResultsText="Sin vehículos con herramientas"
                  size="lg"
                />
                {vehiculosConInventario.length === 0 && (
                  <p style={{ fontSize: '12px', color: 'var(--color-danger)', marginTop: '4px', fontStyle: 'italic' }}>
                    No hay vehículos con herramientas asignadas
                  </p>
                )}
              </div>

              {/* Producto a devolver (solo si hay vehículo) */}
              {vehiculoId && (
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Herramienta a devolver *
                  </label>
                  <SearchableSelect
                    value={productoId}
                    onChange={(value) => {
                      const selected = productosAsignadosVehiculo.find(p => p.producto_id === value)
                      setProductoId(value)
                      if (selected) setCantidad(selected.cantidad)
                    }}
                    options={productosAsignadosVehiculoOptions}
                    placeholder="Seleccionar herramienta..."
                    searchPlaceholder="Buscar herramienta..."
                    noResultsText="Sin herramientas"
                    size="lg"
                  />
                </div>
              )}

              {/* Categoría de servicio (opcional) */}
              {vehiculoId && productoId && (
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Categoría de Servicio
                  </label>
                  <select
                    value={categoriaServicioDevolucion}
                    onChange={(e) => setCategoriaServicioDevolucion(e.target.value as CategoriaServicio)}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid var(--border-primary)',
                      borderRadius: '8px',
                      fontSize: '14px',
                      background: 'var(--input-bg)',
                      color: 'var(--text-primary)'
                    }}
                  >
                    <option value="">Sin categoría</option>
                    {CATEGORIAS_SERVICIO.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Estado de retorno */}
              {vehiculoId && productoId && (
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Estado de la herramienta *
                  </label>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    {(['operativa', 'dañada', 'perdida'] as EstadoRetorno[]).map((estado) => (
                      <label key={estado} style={{
                        flex: 1,
                        padding: '12px',
                        border: `2px solid ${estadoRetorno === estado
                          ? (estado === 'operativa' ? 'var(--color-success)' : 'var(--color-danger)')
                          : 'var(--border-primary)'}`,
                        borderRadius: '8px',
                        cursor: 'pointer',
                        background: estadoRetorno === estado
                          ? (estado === 'operativa' ? 'var(--badge-green-bg)' : 'var(--badge-red-bg)')
                          : 'var(--card-bg)',
                        textAlign: 'center'
                      }}>
                        <input
                          type="radio"
                          name="estadoRetorno"
                          checked={estadoRetorno === estado}
                          onChange={() => setEstadoRetorno(estado)}
                          style={{ display: 'none' }}
                        />
                        <div style={{
                          fontWeight: 600,
                          color: estado === 'operativa' ? 'var(--color-success)' : 'var(--color-danger)'
                        }}>
                          {estado === 'operativa' && <CheckCircle size={16} style={{ marginBottom: '4px' }} />}
                          {estado === 'dañada' && <AlertTriangle size={16} style={{ marginBottom: '4px' }} />}
                          {estado === 'perdida' && <XCircle size={16} style={{ marginBottom: '4px' }} />}
                          <div>{estado.charAt(0).toUpperCase() + estado.slice(1)}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                  {estadoRetorno !== 'operativa' && (
                    <p style={{ fontSize: '12px', color: 'var(--color-danger)', marginTop: '8px' }}>
                      * Las observaciones son obligatorias para herramientas dañadas o perdidas
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {/* ============= CAMPOS COMUNES ============= */}

          {/* Filtro por Tipo de Producto (solo para entrada y salida sin modo lote) */}
          {!recepcionPedido && (tipoMovimiento === 'entrada' || (tipoMovimiento === 'salida' && !modoLoteSalida)) && (
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Tipo de Producto
              </label>
              <div className="mov-type-filter" style={{ display: 'flex', gap: '8px' }}>
                {['TODOS', 'REPUESTOS', 'HERRAMIENTAS'].map((tipo) => (
                  <button
                    key={tipo}
                    onClick={() => handleTipoProductoFiltroChange(tipo as 'TODOS' | 'REPUESTOS' | 'HERRAMIENTAS')}
                    style={{
                      padding: '8px 16px',
                      background: tipoProductoFiltro === tipo ? 'var(--color-primary)' : 'var(--card-bg)',
                      color: tipoProductoFiltro === tipo ? 'white' : 'var(--text-secondary)',
                      border: `1px solid ${tipoProductoFiltro === tipo ? 'var(--color-primary)' : 'var(--border-primary)'}`,
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: 600
                    }}
                  >
                    {tipo}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Buscador de Producto (modo simple, no devolución, no lote salida) */}
          {!recepcionPedido && !modoLote && !modoLoteSalida && tipoMovimiento !== 'devolucion' && (
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                {tipoMovimiento === 'asignacion' ? 'Herramienta *' : 'Producto *'}
              </label>
              <SearchableSelect
                value={productoId}
                onChange={setProductoId}
                options={productoOptions}
                placeholder="Buscar por código o nombre..."
                searchPlaceholder="Buscar producto..."
                noResultsText="Sin productos"
                size="lg"
              />
              {productoId && productoSeleccionado && (
                <p style={{
                  fontSize: '12px',
                  color: (productoSeleccionado.stock_disponible || 0) > 0 ? 'var(--color-success)' : 'var(--color-danger)',
                  marginTop: '4px'
                }}>
                  {(productoSeleccionado.stock_disponible || 0) > 0
                    ? `✓ ${productoSeleccionado.codigo} - ${productoSeleccionado.nombre} (Stock: ${productoSeleccionado.stock_disponible})`
                    : `⚠ ${productoSeleccionado.codigo} - ${productoSeleccionado.nombre} (Sin stock disponible)`
                  }
                </p>
              )}
            </div>
          )}

          {/* MODO LOTE: Gestión de productos */}
          {modoLote && tipoMovimiento === 'entrada' && proveedorId && (
            <div style={{
              background: 'var(--bg-secondary)',
              border: '2px dashed var(--border-primary)',
              borderRadius: '8px',
              padding: '16px'
            }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>
                Productos del pedido ({productosLote.length})
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', marginBottom: '12px' }}>
                <SearchableSelect
                  value={productoId}
                  onChange={setProductoId}
                  options={productoOptions}
                  placeholder="Buscar producto..."
                  searchPlaceholder="Buscar producto..."
                  noResultsText="Sin productos"
                  size="md"
                />
                <input
                  type="number"
                  min="1"
                  placeholder="Cant."
                  value={cantidad}
                  onChange={(e) => setCantidad(Number(e.target.value))}
                  style={{
                    width: '100px',
                    padding: '8px 12px',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '6px',
                    fontSize: '13px',
                    background: 'var(--input-bg)',
                    color: 'var(--text-primary)'
                  }}
                />
                <button
                  onClick={handleAgregarProductoLoteEntrada}
                  style={{
                    padding: '8px 16px',
                    background: 'var(--color-primary)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 600
                  }}
                >
                  + Agregar
                </button>
              </div>

              {productosLote.length > 0 ? (
                <div style={{ display: 'grid', gap: '8px' }}>
                  {productosLote.map((pl, idx) => (
                    <div
                      key={pl.producto_id}
                      style={{
                        background: 'var(--card-bg)',
                        padding: '12px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-primary)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
                          {pl.producto?.codigo} - {pl.producto?.nombre}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {pl.producto?.tipo} • {pl.cantidad} {pl.producto?.unidades_medida?.descripcion || 'und'}
                        </div>
                      </div>
                      <button
                        onClick={() => setProductosLote(productosLote.filter((_, i) => i !== idx))}
                        style={{
                          padding: '6px 12px',
                          background: 'var(--badge-red-bg)',
                          color: 'var(--color-danger)',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: 600
                        }}
                      >
                        Quitar
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', fontStyle: 'italic', textAlign: 'center', padding: '16px' }}>
                  No hay productos agregados
                </p>
              )}
            </div>
          )}

          {/* Proveedor para Salida/Uso (stock por proveedor) - solo modo simple */}
          {((tipoMovimiento === 'salida' && !modoLoteSalida) || tipoMovimiento === 'asignacion') && productoId && (
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Proveedor *
              </label>
              <SearchableSelect
                value={proveedorId}
                onChange={setProveedorId}
                options={stockProveedorOptions}
                placeholder="Seleccionar proveedor..."
                searchPlaceholder="Buscar proveedor..."
                noResultsText="Sin proveedores con stock"
                size="lg"
              />
              {stockPorProveedor.length === 0 && productoId && (
                <p style={{ fontSize: '12px', color: 'var(--color-danger)', marginTop: '4px', fontStyle: 'italic' }}>
                  No hay stock disponible de este producto
                </p>
              )}
            </div>
          )}

          {/* Cantidad (modo simple, no devolución, no lote salida) */}
          {!recepcionPedido && !modoLote && !modoLoteSalida && tipoMovimiento !== 'devolucion' && (
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Cantidad *
              </label>
              <input
                type="number"
                min="1"
                value={cantidad}
                onChange={(e) => setCantidad(Number(e.target.value))}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '8px',
                  fontSize: '14px',
                  background: 'var(--input-bg)',
                  color: 'var(--text-primary)'
                }}
              />
            </div>
          )}

          {/* Observaciones */}
          {!recepcionPedido && (
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Observaciones {(tipoMovimiento === 'devolucion' && estadoRetorno !== 'operativa') ? '*' : ''}
            </label>
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              rows={3}
              placeholder="Detalles adicionales..."
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid var(--border-primary)',
                borderRadius: '8px',
                fontSize: '14px',
                fontFamily: 'inherit',
                background: 'var(--input-bg)',
                color: 'var(--text-primary)'
              }}
            />
          </div>
          )}

          {/* Botones (ocultos en modo recepción de pedido: el panel tiene los suyos) */}
          {!recepcionPedido && (
          <div className="mov-form-actions" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '12px' }}>
            <button
              onClick={resetForm}
              style={{
                padding: '10px 24px',
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 600
              }}
            >
              Limpiar
            </button>
            <button
              onClick={handleMovimiento}
              style={{
                padding: '10px 24px',
                background: 'var(--color-primary)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              {getTipoIcon(tipoMovimiento)}
              {requiereAprobacion() ? 'Enviar para Aprobación' : `Registrar ${getTipoLabel(tipoMovimiento)}`}
            </button>
          </div>
          )}
        </div>
      </div>
    </div>
  )
}
