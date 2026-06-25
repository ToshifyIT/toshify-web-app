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
  X,
  Package,
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

interface LineaRecepcionPedido {
  producto_id: string
  cantidad: number
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

  // Si la entrada viene de "Registrar recepción" de un pedido, guardamos su id para mapear el movimiento al pedido
  const [pedidoOrigenId, setPedidoOrigenId] = useState<string | null>(null)
  const [recepcionPedidoModal, setRecepcionPedidoModal] = useState<LineaRecepcionPedido[] | null>(null)
  const [confirmandoRecepcionPedido, setConfirmandoRecepcionPedido] = useState(false)

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

  // "Registrar recepción" desde un pedido: precarga el form de entrada (simple si 1 item, lote si varios)
  useEffect(() => {
    if (!location.search) return
    const params = new URLSearchParams(location.search)
    const pedidoId = params.get('pedido')
    if (!pedidoId || pedidoOrigenId === pedidoId) return

    const cargarPedido = async () => {
      const { data: cab } = await supabase
        .from('pedidos_inventario')
        .select('id, numero_pedido, proveedor_id, estado_respuesta')
        .eq('id', pedidoId)
        .single()
      if (!cab) return

      const { data: rows } = await supabase
        .from('pedido_items')
        .select('producto_id, cantidad_pedida, cantidad_confirmada, cantidad_recibida, estado_confirmacion, productos(codigo, nombre)')
        .eq('pedido_id', pedidoId)
      if (!rows) return

      const recibidoAlgo = (rows as any[]).some(r => Number(r.cantidad_recibida || 0) > 0)
      const tieneRespuestaParaRecibir = ['confirmado', 'confirmado_ajustes'].includes(
        String((cab as any).estado_respuesta || '')
      )

      if (!tieneRespuestaParaRecibir && !recibidoAlgo) {
        await Swal.fire({
          icon: 'warning',
          title: 'Primero registra la respuesta del proveedor',
          text: 'La recepción se habilita cuando el proveedor confirma qué productos entregará.'
        })
        navigate('/logistica/inventario/pedidos?tab=pedidos', { replace: true })
        return
      }

      // Items pendientes de recibir (objetivo = confirmado, fallback a pedido)
      const items = (rows as any[])
        .map(r => {
          const objetivo = r.cantidad_confirmada ?? r.cantidad_pedida
          return { producto_id: r.producto_id, cantidad: Math.max(0, objetivo - (r.cantidad_recibida || 0)), estado_confirmacion: r.estado_confirmacion, producto: r.productos }
        })
        .filter(it => it.estado_confirmacion !== 'rechazado' && it.cantidad > 0)
      if (items.length === 0) return

      // Datos comunes
      setTipoMovimiento('entrada')
      setProveedorId(cab.proveedor_id)
      setNumeroPedido(cab.numero_pedido)
      setEstadoInicial('disponible')      // entrada que recibe: va directo a stock disponible
      setPedidoOrigenId(pedidoId)

      if (items.length === 1) {
        // 1 item → modo simple
        setModoLote(false)
        setProductoId(items[0].producto_id)
        setCantidad(items[0].cantidad)
      } else {
        // varios items → modo lote
        setModoLote(true)
        setProductosLote(items.map(it => ({
          producto_id: it.producto_id,
          cantidad: it.cantidad,
          producto: { id: it.producto_id, codigo: (it.producto as any)?.codigo, nombre: (it.producto as any)?.nombre } as any
        })))
      }
    }
    cargarPedido()
  }, [location.search, pedidoOrigenId])

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

  const getEntradaManualObservaciones = () => {
    const partes = [`Referencia: ${numeroPedido.trim()}`]
    if (observaciones.trim()) partes.push(observaciones.trim())
    return partes.join(' - ')
  }

  const crearMovimientoEntradaManual = async (
    producto_id: string,
    cantidadMovimiento: number,
    usuarioId?: string
  ) => {
    const { error } = await (supabase.from('movimientos') as any).insert({
      producto_id,
      tipo_movimiento: 'entrada',
      cantidad: cantidadMovimiento,
      proveedor_id: proveedorId || null,
      usuario_id: usuarioId,
      observaciones: getEntradaManualObservaciones(),
      estado_destino: 'en_transito',
      estado_aprobacion: 'aprobado',
      usuario_aprobador_id: usuarioId,
      fecha_aprobacion: new Date().toISOString()
    })
    if (error) throw error
  }

  /** Valida el lote de entrada. Retorna true si es válido. */
  const validateLoteEntrada = (): boolean => {
    if (!proveedorId) {
      showIncompleteWarning('Debes seleccionar un proveedor')
      return false
    }
    if (productosLote.length === 0) {
      showIncompleteWarning('Debes agregar al menos un producto a la lista')
      return false
    }
    if (estadoInicial === 'en_transito' && !numeroPedido.trim()) {
      showIncompleteWarning('Debes ingresar una referencia de compra o entrega')
      return false
    }
    return true
  }

  /** Valida el lote de salida. Retorna true si es válido. */
  const validateLoteSalida = (): boolean => {
    if (productosLoteSalida.length === 0) {
      showIncompleteWarning('Debes agregar al menos un producto a la lista')
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

    if (
      tipoMovimiento === 'entrada' &&
      !pedidoOrigenId &&
      estadoInicial === 'en_transito' &&
      !numeroPedido.trim()
    ) {
      showIncompleteWarning('Debes ingresar una referencia de compra o entrega')
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

  const abrirModalRecepcionPedido = (lineas: LineaRecepcionPedido[]) => {
    const lineasValidas = lineas.filter(linea => linea.cantidad > 0)

    if (lineasValidas.length === 0) {
      showIncompleteWarning('No hay productos con cantidad para recibir')
      return
    }

    setRecepcionPedidoModal(lineasValidas)
  }

  const cerrarModalRecepcionPedido = () => {
    if (confirmandoRecepcionPedido) return
    setRecepcionPedidoModal(null)
  }

  /** Recepción desde un pedido: genera el movimiento de entrada mapeado al pedido (procesar_recepcion_pedido) */
  const recibirEntradaDePedido = async (lineas: LineaRecepcionPedido[]) => {
    if (!pedidoOrigenId) return
    try {
      const { data: { user } } = await supabase.auth.getUser()

      // Traer los item_id y saldos actuales para no permitir sobre-recepciones.
      const { data: items } = await supabase
        .from('pedido_items')
        .select('id, producto_id, cantidad_pedida, cantidad_confirmada, cantidad_recibida, estado_confirmacion, productos(codigo, nombre)')
        .eq('pedido_id', pedidoOrigenId)
      type PedidoItemRecepcion = {
        id: string
        producto_id: string
        cantidad_pedida: number
        cantidad_confirmada?: number | null
        cantidad_recibida?: number | null
        estado_confirmacion?: string | null
        productos?: { codigo?: string | null; nombre?: string | null } | null
      }
      const mapItem = new Map<string, PedidoItemRecepcion>(
        (items || []).map((it: any) => [it.producto_id, it as PedidoItemRecepcion])
      )

      let ok = 0
      const errores: string[] = []
      for (const ln of lineas) {
        if (ln.cantidad <= 0) continue
        const pedidoItem = mapItem.get(ln.producto_id)
        if (!pedidoItem) { errores.push('Producto sin línea en el pedido'); continue }

        const productoLabel = pedidoItem.productos?.codigo || 'Producto del pedido'
        if (pedidoItem.estado_confirmacion === 'rechazado') {
          errores.push(`${productoLabel}: el proveedor lo rechazó`)
          continue
        }

        const objetivo = Number(pedidoItem.cantidad_confirmada ?? pedidoItem.cantidad_pedida ?? 0)
        const recibido = Number(pedidoItem.cantidad_recibida || 0)
        const pendiente = Math.max(0, objetivo - recibido)
        if (pendiente <= 0) {
          errores.push(`${productoLabel}: no tiene saldo pendiente por recibir`)
          continue
        }
        if (ln.cantidad > pendiente) {
          errores.push(`${productoLabel}: quedan ${pendiente} por recibir y se intentó recibir ${ln.cantidad}`)
          continue
        }

        const { data, error } = await (supabase.rpc as any)('procesar_recepcion_pedido', {
          p_pedido_item_id: pedidoItem.id,
          p_cantidad_recibida: ln.cantidad,
          p_usuario_id: user?.id
        })
        if (error || (data && data.success === false)) {
          errores.push(error?.message || data?.error || 'error')
        } else {
          ok++
        }
      }

      if (errores.length > 0) {
        Swal.fire({ icon: ok > 0 ? 'warning' : 'error', title: ok > 0 ? 'Recepción parcial' : 'No se pudo confirmar la recepción', html: `${ok} producto(s) ingresados.<br>${errores.join('<br>')}` })
      } else {
        showSuccess('Recepción confirmada', `${ok} producto(s) ingresados al stock.`)
      }
      navigate('/logistica/inventario/pedidos')
    } catch (error: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: error.message || 'No se pudo confirmar la recepción' })
    }
  }

  const confirmarRecepcionPedido = async () => {
    if (!recepcionPedidoModal) return

    try {
      setConfirmandoRecepcionPedido(true)
      await recibirEntradaDePedido(recepcionPedidoModal)
      setRecepcionPedidoModal(null)
    } finally {
      setConfirmandoRecepcionPedido(false)
    }
  }

  /** Procesa entrada en modo lote */
  const handleLoteEntrada = async () => {
    if (!validateLoteEntrada()) return

    // Si la entrada viene de "Registrar recepción" de un pedido → recepción que mapea al pedido
    if (pedidoOrigenId) {
      abrirModalRecepcionPedido(productosLote.map(pl => ({
        producto_id: pl.producto_id,
        cantidad: pl.cantidad
      })))
      return
    }

    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (estadoInicial === 'en_transito') {
        for (const pl of productosLote) {
          await crearMovimientoEntradaManual(pl.producto_id, pl.cantidad, user?.id)
        }

        showSuccess('Ingreso manual registrado', `${productosLote.length} productos quedaron pendientes de confirmación.`)
        resetForm()
        navigate('/logistica/inventario/control-movimientos?tab=ingresos')
        return
      } else {
        for (const pl of productosLote) {
          const { error } = await (supabase.rpc as any)('procesar_movimiento_inventario', {
            p_producto_id: pl.producto_id,
            p_tipo_movimiento: 'entrada',
            p_cantidad: pl.cantidad,
            p_proveedor_id: proveedorId,
            p_usuario_id: user?.id,
            p_observaciones: observaciones || 'Ingresar varios productos'
          })
          if (error) throw error
        }

        showSuccess('Ingreso registrado', `${productosLote.length} productos ingresados correctamente`)
      }

      resetForm()
    } catch (error: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: error.message || 'No se pudo procesar la lista de productos' })
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
          proveedor_id: item.proveedor_id || null,
          vehiculo_destino_id: item.vehiculo_id || null,
          usuario_id: userData.user?.id,
          observaciones: observaciones || `Retiro de varios productos - ${item.vehiculo?.patente || 'Sin vehículo'}`,
          motivo_salida: motivoSalida,
          estado_aprobacion: 'pendiente',
          categoria_servicio: motivoSalida === 'consumo_servicio' ? categoriaServicio : null
        }

        const { error } = await (supabase.from('movimientos') as any).insert(movimientoData)
        if (error) throw error
      }

      showSuccess(
        'Retiro enviado a aprobación',
        getRetiroPendienteMessage(`${productosLoteSalida.length} productos`)
      )
      resetForm()
      loadData()
    } catch (error: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: error.message || 'No se pudo procesar la lista de productos a retirar' })
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
        // Si la entrada viene de "Registrar recepción" de un pedido → recepción que mapea al pedido
        if (pedidoOrigenId) {
          abrirModalRecepcionPedido([{ producto_id: productoId, cantidad }])
          return
        }

        if (estadoInicial === 'en_transito') {
          await crearMovimientoEntradaManual(productoId, cantidad, userData.user?.id)

          showSuccess('Ingreso manual registrado', 'Quedó pendiente de confirmación y todavía no suma al stock disponible.')
          resetForm()
          navigate('/logistica/inventario/control-movimientos?tab=ingresos')
          return
        }

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

        showSuccess('Ingreso registrado', 'El producto ingresó correctamente.')
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

      if (tipoMovimiento === 'salida') {
        showSuccess('Retiro enviado a aprobación', getRetiroPendienteMessage(`${cantidad} unidades`))
      } else {
        showSuccess('Movimiento enviado a aprobación', `${getTipoResultadoLabel(tipoMovimiento)} pendiente de aprobación.`)
      }
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

  const handleAgregarProductoLoteSalida = async () => {
    if (!productoId || cantidad <= 0) return
    const prod = productos.find(p => p.id === productoId)
    if (!prod) return

    const { data: stockDisponible, error } = await supabase
      .from('inventario')
      .select('id, proveedor_id, cantidad')
      .eq('producto_id', productoId)
      .eq('estado', 'disponible')
      .gt('cantidad', 0)
      .order('cantidad', { ascending: false })

    if (error) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudo validar el stock',
        text: 'Intenta nuevamente antes de agregar el producto.'
      })
      return
    }

    const inventarioConStock = (stockDisponible || []).find((item: any) =>
      Number(item.cantidad || 0) >= cantidad
    )

    if (!inventarioConStock) {
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
      cantidad: cantidad,
      proveedor_id: inventarioConStock.proveedor_id,
      inventario_id: inventarioConStock.id
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
      entrada: 'Ingresar stock',
      salida: 'Retirar stock',
      asignacion: 'Asignar herramienta',
      devolucion: 'Devolver herramienta'
    }
    return labels[tipo]
  }

  const getTipoResultadoLabel = (tipo: TipoMovimiento): string => {
    const labels: Record<TipoMovimiento, string> = {
      entrada: 'Ingreso',
      salida: 'Retiro',
      asignacion: 'Asignación de herramienta',
      devolucion: 'Devolución de herramienta'
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
      consumo_servicio: 'Uso en servicio',
      dañado: 'Dañado',
      perdido: 'Perdido'
    }
    return labels[motivo]
  }

  const esRetiroDefinitivo = (motivo: MotivoSalida) => motivo === 'dañado' || motivo === 'perdido'

  const getRetiroPendienteMessage = (alcance: string) => (
    esRetiroDefinitivo(motivoSalida)
      ? `${alcance} quedaron pendientes de aprobación. Si se aprueban, se descuentan definitivamente del stock disponible.`
      : `${alcance} quedaron pendientes de aprobación. El stock se descuenta recién cuando un encargado aprueba.`
  )

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
  const proveedorSeleccionado = proveedores.find(p => p.id === proveedorId)
  const recepcionPedidoDetalle = (recepcionPedidoModal || []).map(linea => {
    const producto = productos.find(p => p.id === linea.producto_id)
      || productosLote.find(item => item.producto_id === linea.producto_id)?.producto

    return {
      ...linea,
      codigo: producto?.codigo || 'Producto',
      nombre: producto?.nombre || 'Producto del pedido',
      unidad: producto?.unidades_medida?.descripcion || producto?.unidades_medida?.codigo || 'unidades'
    }
  })
  const totalRecepcionPedido = recepcionPedidoDetalle.reduce((acc, linea) => acc + linea.cantidad, 0)
  const entradaDesdePedido = Boolean(pedidoOrigenId)
  const submitLabel = (() => {
    if (tipoMovimiento === 'entrada') {
      if (entradaDesdePedido) {
        return modoLote ? 'Confirmar recepción de varios productos' : 'Confirmar recepción del pedido'
      }
      return modoLote ? 'Registrar varios productos' : 'Registrar ingreso manual'
    }

    return requiereAprobacion() ? 'Enviar a aprobación' : `Registrar ${getTipoResultadoLabel(tipoMovimiento).toLowerCase()}`
  })()

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

        .mov-confirm-overlay {
          position: fixed;
          inset: 0;
          z-index: 2200;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background: rgba(17, 24, 39, 0.48);
        }

        .mov-confirm-modal {
          width: min(640px, 100%);
          max-height: 88vh;
          overflow-y: auto;
          background: var(--card-bg);
          border: 1px solid var(--border-primary);
          border-radius: 10px;
          box-shadow: 0 18px 45px rgba(15, 23, 42, 0.22);
        }

        .mov-confirm-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
          padding: 18px 20px 14px;
          border-bottom: 1px solid var(--border-primary);
        }

        .mov-confirm-header h3 {
          margin: 0;
          color: var(--text-primary);
          font-size: 17px;
          font-weight: 700;
        }

        .mov-confirm-header p {
          margin: 4px 0 0;
          color: var(--text-secondary);
          font-size: 12px;
          line-height: 1.45;
        }

        .mov-confirm-close {
          width: 30px;
          height: 30px;
          border: none;
          border-radius: 8px;
          background: transparent;
          color: var(--text-tertiary);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .mov-confirm-close:hover {
          background: var(--bg-secondary);
          color: var(--text-primary);
        }

        .mov-confirm-close:disabled {
          opacity: .55;
          cursor: not-allowed;
        }

        .mov-confirm-body {
          display: grid;
          gap: 12px;
          padding: 16px 20px 0;
        }

        .mov-confirm-summary {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }

        .mov-confirm-summary-item,
        .mov-confirm-note {
          border: 1px solid var(--border-primary);
          border-radius: 8px;
          background: var(--bg-secondary);
          padding: 10px 12px;
        }

        .mov-confirm-summary-item span {
          display: block;
          color: var(--text-tertiary);
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .mov-confirm-summary-item strong {
          display: block;
          color: var(--text-primary);
          font-size: 13px;
          line-height: 1.35;
          margin-top: 4px;
          overflow-wrap: anywhere;
        }

        .mov-confirm-table {
          border: 1px solid var(--border-primary);
          border-radius: 8px;
          overflow: hidden;
        }

        .mov-confirm-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 120px;
          gap: 12px;
          align-items: center;
          padding: 11px 12px;
          border-bottom: 1px solid var(--border-primary);
        }

        .mov-confirm-row:last-child {
          border-bottom: none;
        }

        .mov-confirm-row.header {
          background: var(--bg-secondary);
          color: var(--text-tertiary);
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .mov-confirm-product strong {
          display: block;
          color: var(--text-primary);
          font-size: 13px;
          line-height: 1.3;
        }

        .mov-confirm-product span {
          display: block;
          color: var(--text-secondary);
          font-size: 12px;
          line-height: 1.35;
          margin-top: 2px;
        }

        .mov-confirm-quantity {
          color: var(--text-primary);
          font-size: 13px;
          font-weight: 700;
          text-align: right;
        }

        .mov-confirm-note {
          color: var(--text-secondary);
          font-size: 12px;
          line-height: 1.45;
        }

        .mov-confirm-footer {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 16px;
          padding: 16px 20px 18px;
          border-top: 1px solid var(--border-primary);
        }

        .mov-confirm-footer button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          border-radius: 7px;
          padding: 9px 18px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
        }

        .mov-confirm-secondary {
          border: 1px solid var(--border-primary);
          background: var(--bg-secondary);
          color: var(--text-primary);
        }

        .mov-confirm-primary {
          border: none;
          background: var(--color-primary);
          color: #fff;
        }

        .mov-confirm-footer button:disabled {
          opacity: .6;
          cursor: not-allowed;
        }

        @media (max-width: 640px) {
          .mov-form-card {
            padding: 16px !important;
          }

          .mov-confirm-summary,
          .mov-confirm-row {
            grid-template-columns: 1fr;
          }

          .mov-confirm-quantity {
            text-align: left;
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
          {tipoMovimiento === 'salida'
            ? 'Todo retiro queda pendiente de aprobación. El stock se descuenta recién cuando un encargado aprueba.'
            : 'Los retiros de stock, asignaciones y devoluciones requieren aprobación de un encargado.'}
        </div>
      )}

      {/* Selector de Tipo de Movimiento (sin Daño ni Pérdida) */}
      <div style={{ marginBottom: '24px' }}>
        <label style={{ display: 'block', marginBottom: '12px', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
          Qué vas a registrar
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

          {/* ============= SECCIÓN ENTRADA ============= */}
          {tipoMovimiento === 'entrada' && (
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
                    {entradaDesdePedido ? (
                      <><Package size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> Recepción de pedido</>
                    ) : modoLote ? (
                      <><Package size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> Ingresar varios productos</>
                    ) : (
                      <><FileText size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> Ingresar un producto</>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {entradaDesdePedido
                      ? 'Viene del seguimiento del pedido; al confirmar se descuenta el pendiente y entra a stock.'
                      : modoLote
                        ? 'Úsalo cuando llegaron varios productos sin haber creado antes un pedido a proveedor en el sistema.'
                        : 'Úsalo cuando llegó un producto sin haber creado antes un pedido a proveedor en el sistema.'
                    }
                  </div>
                </div>
                <button
                  className="mov-toggle-button"
                  onClick={handleToggleModoLote}
                  disabled={entradaDesdePedido}
                  style={{
                    padding: '8px 16px',
                    background: modoLote ? 'var(--color-primary)' : 'var(--text-secondary)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: entradaDesdePedido ? 'not-allowed' : 'pointer',
                    fontSize: '13px',
                    fontWeight: 600,
                    opacity: entradaDesdePedido ? 0.65 : 1
                  }}
                >
                  {entradaDesdePedido ? 'Definido por pedido' : modoLote ? 'Ingresar un producto' : 'Ingresar varios productos'}
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

              {/* Aviso del flujo de entrada */}
              <div style={{
                background: entradaDesdePedido ? 'var(--badge-green-bg)' : 'var(--badge-yellow-bg)',
                border: `1px solid ${entradaDesdePedido ? 'var(--color-success)' : 'var(--color-warning)'}`,
                borderRadius: '8px',
                padding: '12px',
                fontSize: '13px',
                color: entradaDesdePedido ? 'var(--badge-green-text)' : 'var(--badge-yellow-text)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <Truck size={18} />
                <div>
                  <strong style={{ color: entradaDesdePedido ? 'var(--color-success)' : 'var(--color-warning)' }}>
                    {entradaDesdePedido ? 'Esta acción confirma una recepción de pedido.' : 'Este ingreso queda pendiente de confirmación.'}
                  </strong>
                  <div style={{ fontSize: '12px', marginTop: '2px' }}>
                    {entradaDesdePedido
                      ? 'Se usa cuando el pedido a proveedor ya tuvo respuesta y llegó la mercadería.'
                      : 'Luego confírmalo desde Movimientos > Seguimiento para que pase a stock disponible.'}
                  </div>
                </div>
              </div>

              {/* Número de Pedido (siempre visible) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    {entradaDesdePedido ? 'Pedido origen' : 'Referencia de compra o entrega *'}
                  </label>
                  <input
                    type="text"
                    placeholder={entradaDesdePedido ? 'Pedido origen' : 'Ej: OC-001, FAC-123, Remito-45'}
                    value={numeroPedido}
                    onChange={(e) => setNumeroPedido(e.target.value)}
                    disabled={entradaDesdePedido}
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
                    Fecha estimada de llegada
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
                    {modoLoteSalida ? <><Package size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> Retirar varios productos</> : <><FileText size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> Retirar un producto</>}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {modoLoteSalida
                      ? 'Úsalo cuando debes retirar más de un producto del stock en una misma solicitud.'
                      : 'Úsalo cuando debes retirar un solo producto del stock.'
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
                  {modoLoteSalida ? 'Retirar un producto' : 'Retirar varios productos'}
                </button>
              </div>

              {/* Motivo de Salida */}
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Motivo del retiro *
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

              {esRetiroDefinitivo(motivoSalida) && (
                <div style={{
                  padding: '10px 12px',
                  background: 'var(--badge-red-bg)',
                  border: '1px solid var(--color-danger)',
                  borderRadius: '8px',
                  color: 'var(--badge-red-text)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                  fontSize: '13px',
                  lineHeight: 1.45
                }}>
                  <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
                  <span>
                    Al aprobar este retiro, las unidades se descuentan definitivamente del stock disponible.
                    Si se rechaza, el stock no cambia.
                  </span>
                </div>
              )}

              {/* Categoría de servicio (obligatorio si es consumo) */}
              {motivoSalida === 'consumo_servicio' && (
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Servicio donde se usó *
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
                    Productos a retirar ({productosLoteSalida.length})
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
                      No hay productos agregados. Busca un producto, selecciona un vehículo si aplica y agrégalo.
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
                  Servicio donde se usará *
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
                    Servicio asociado
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
          {(tipoMovimiento === 'entrada' || (tipoMovimiento === 'salida' && !modoLoteSalida)) && (
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
          {!modoLote && !modoLoteSalida && tipoMovimiento !== 'devolucion' && (
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
                Productos de la entrada ({productosLote.length})
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
          {!modoLote && !modoLoteSalida && tipoMovimiento !== 'devolucion' && (
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
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Observaciones {(tipoMovimiento === 'devolucion' && estadoRetorno !== 'operativa') ? '*' : ''}
              {tipoMovimiento === 'salida' && esRetiroDefinitivo(motivoSalida) ? ' (recomendado)' : ''}
            </label>
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              rows={3}
              placeholder={
                tipoMovimiento === 'salida' && esRetiroDefinitivo(motivoSalida)
                  ? 'Describe por qué se retira definitivamente del stock...'
                  : 'Detalles adicionales...'
              }
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

          {/* Botones */}
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
              {submitLabel}
            </button>
          </div>
        </div>
      </div>

      {recepcionPedidoModal && (
        <div className="mov-confirm-overlay" onClick={cerrarModalRecepcionPedido}>
          <div className="mov-confirm-modal" onClick={(event) => event.stopPropagation()}>
            <div className="mov-confirm-header">
              <div>
                <h3>Confirmar recepción del pedido</h3>
                <p>Revisa lo que entrará a stock disponible antes de registrar la recepción.</p>
              </div>
              <button
                type="button"
                className="mov-confirm-close"
                onClick={cerrarModalRecepcionPedido}
                disabled={confirmandoRecepcionPedido}
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mov-confirm-body">
              <div className="mov-confirm-summary">
                <div className="mov-confirm-summary-item">
                  <span>Pedido origen</span>
                  <strong>{numeroPedido || 'Sin número'}</strong>
                </div>
                <div className="mov-confirm-summary-item">
                  <span>Proveedor</span>
                  <strong>{proveedorSeleccionado?.razon_social || 'Sin proveedor'}</strong>
                </div>
                <div className="mov-confirm-summary-item">
                  <span>Total a ingresar</span>
                  <strong>{totalRecepcionPedido} unidades</strong>
                </div>
              </div>

              <div className="mov-confirm-table">
                <div className="mov-confirm-row header">
                  <span>Producto</span>
                  <span>Cantidad</span>
                </div>
                {recepcionPedidoDetalle.map(linea => (
                  <div className="mov-confirm-row" key={linea.producto_id}>
                    <div className="mov-confirm-product">
                      <strong>{linea.codigo}</strong>
                      <span>{linea.nombre}</span>
                    </div>
                    <div className="mov-confirm-quantity">
                      {linea.cantidad} {linea.unidad}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mov-confirm-note">
                Al confirmar, estas cantidades se registran como recibidas del pedido y pasan a
                stock disponible.
              </div>
            </div>

            <div className="mov-confirm-footer">
              <button
                type="button"
                className="mov-confirm-secondary"
                onClick={cerrarModalRecepcionPedido}
                disabled={confirmandoRecepcionPedido}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="mov-confirm-primary"
                onClick={confirmarRecepcionPedido}
                disabled={confirmandoRecepcionPedido}
              >
                <CheckCircle size={15} />
                {confirmandoRecepcionPedido ? 'Confirmando...' : 'Confirmar recepción'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
