import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import Swal from 'sweetalert2'
import {
  RotateCcw,
  Truck,
  Search,
  PackagePlus,
  PackageMinus,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle
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

interface ProductoLote {
  producto_id: string
  cantidad: number
  producto?: Producto
}

// =====================================================
// COMPONENTE PRINCIPAL
// =====================================================
export function MovimientosModule() {
  // Estados de datos
  const [productos, setProductos] = useState<Producto[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([])
  const [vehiculosConInventario, setVehiculosConInventario] = useState<Vehiculo[]>([])
  const [productosAsignadosVehiculo, setProductosAsignadosVehiculo] = useState<ProductoAsignadoVehiculo[]>([])
  const [stockPorProveedor, setStockPorProveedor] = useState<StockPorProveedor[]>([])
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState<string>('')

  // Estado del formulario
  const [tipoMovimiento, setTipoMovimiento] = useState<TipoMovimiento>('entrada')

  // Filtros
  const [tipoProductoFiltro, setTipoProductoFiltro] = useState<'TODOS' | 'REPUESTOS' | 'HERRAMIENTAS'>('TODOS')
  const [busquedaProducto, setBusquedaProducto] = useState('')
  const [mostrarDropdownProductos, setMostrarDropdownProductos] = useState(false)

  // Modo de entrada
  const [modoLote, setModoLote] = useState(false)
  const [productosLote, setProductosLote] = useState<ProductoLote[]>([])

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

  // Form data - Salida
  const [motivoSalida, setMotivoSalida] = useState<MotivoSalida>('consumo_servicio')
  const [servicioVinculado, setServicioVinculado] = useState('')

  // Form data - Devolución
  const [estadoRetorno, setEstadoRetorno] = useState<EstadoRetorno>('operativa')
  const [servicioVinculadoDevolucion, setServicioVinculadoDevolucion] = useState('')

  // =====================================================
  // EFECTOS
  // =====================================================
  useEffect(() => {
    loadData()
    loadUserRole()
  }, [])

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
    // Cerrar dropdown al hacer clic fuera
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('[data-producto-dropdown]')) {
        setMostrarDropdownProductos(false)
      }
    }

    if (mostrarDropdownProductos) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [mostrarDropdownProductos])

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
  const loadUserRole = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: userData } = await supabase
          .from('user_profiles')
          .select('role_id, roles(name)')
          .eq('id', user.id)
          .single() as { data: { role_id: string; roles: { name: string } | null } | null }
        if (userData?.roles) {
          setUserRole(userData.roles.name || '')
        }
      }
    } catch (err) {
      console.error('Error cargando rol:', err)
    }
  }

  const loadData = async () => {
    try {
      setLoading(true)

      const [prodRes, provRes, vehRes] = await Promise.all([
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
        supabase
          .from('vehiculos')
          .select('id, patente, marca, modelo')
          .order('patente')
      ])

      if (prodRes.data) setProductos(prodRes.data)
      if (provRes.data) setProveedores(provRes.data)
      if (vehRes.data) setVehiculos(vehRes.data)
    } catch (err: any) {
      console.error('Error cargando datos:', err)
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

      setStockPorProveedor(stockAgrupado)

      if (stockAgrupado.length > 0 && !proveedorId) {
        setProveedorId(stockAgrupado[0].proveedor_id)
      }
    } catch (err) {
      console.error('Error cargando stock:', err)
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
    } catch (err) {
      console.error('Error cargando vehículos con inventario:', err)
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
    } catch (err) {
      console.error('Error cargando productos asignados:', err)
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
    setBusquedaProducto('')
    setTipoProductoFiltro('TODOS')
    setStockPorProveedor([])
    setProductosLote([])
    setModoLote(false)
    setProductosAsignadosVehiculo([])
    setEstadoInicial('en_transito') // Siempre en tránsito
    setNumeroPedido('')
    setFechaEstimadaLlegada('')
    setMotivoSalida('consumo_servicio')
    setServicioVinculado('')
    setEstadoRetorno('operativa')
    setServicioVinculadoDevolucion('')
  }

  // Determinar si requiere aprobación
  const requiereAprobacion = (): boolean => {
    if (userRole === 'encargado' || userRole === 'admin') return false
    return tipoMovimiento === 'salida' || tipoMovimiento === 'asignacion' || tipoMovimiento === 'devolucion'
  }

  // =====================================================
  // MANEJADOR PRINCIPAL
  // =====================================================
  const handleMovimiento = async () => {
    // ===== MODO LOTE (ENTRADA) =====
    if (modoLote && tipoMovimiento === 'entrada') {
      if (!proveedorId) {
        Swal.fire({ icon: 'warning', title: 'Datos incompletos', text: 'Debes seleccionar un proveedor' })
        return
      }
      if (productosLote.length === 0) {
        Swal.fire({ icon: 'warning', title: 'Datos incompletos', text: 'Debes agregar al menos un producto al lote' })
        return
      }

      // Si es en tránsito, requiere número de pedido
      if (estadoInicial === 'en_transito' && !numeroPedido.trim()) {
        Swal.fire({ icon: 'warning', title: 'Datos incompletos', text: 'Debes ingresar un número de pedido para productos en tránsito' })
        return
      }

      try {
        const { data: { user } } = await supabase.auth.getUser()

        if (estadoInicial === 'en_transito') {
          // Crear pedido en tránsito
          const items = productosLote.map(pl => ({
            producto_id: pl.producto_id,
            cantidad: pl.cantidad
          }))

          const { error: pedidoError } = await (supabase.rpc as any)('crear_pedido_inventario', {
            p_numero_pedido: numeroPedido,
            p_proveedor_id: proveedorId,
            p_fecha_estimada: fechaEstimadaLlegada || null,
            p_observaciones: observaciones || null,
            p_usuario_id: user?.id,
            p_items: JSON.stringify(items)
          })

          if (pedidoError) throw pedidoError

          Swal.fire({
            icon: 'success',
            title: 'Pedido creado',
            text: `Pedido ${numeroPedido} creado con ${productosLote.length} productos en tránsito`
          })
        } else {
          // Entrada directa a stock (estado disponible)
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

          Swal.fire({
            icon: 'success',
            title: 'Éxito',
            text: `Entrada de ${productosLote.length} productos registrada correctamente`
          })
        }

        resetForm()
      } catch (error: any) {
        console.error('Error procesando lote:', error)
        Swal.fire({ icon: 'error', title: 'Error', text: error.message || 'No se pudo procesar el lote' })
      }
      return
    }

    // ===== MODO SIMPLE =====
    if (!productoId || cantidad <= 0) {
      Swal.fire({ icon: 'warning', title: 'Datos incompletos', text: 'Selecciona un producto y una cantidad válida' })
      return
    }

    // Validaciones específicas por tipo
    if (tipoMovimiento === 'entrada' && !proveedorId) {
      Swal.fire({ icon: 'warning', title: 'Datos incompletos', text: 'Debes seleccionar un proveedor para la entrada' })
      return
    }

    if (tipoMovimiento === 'salida') {
      if (!proveedorId) {
        Swal.fire({ icon: 'warning', title: 'Datos incompletos', text: 'Debes seleccionar un proveedor' })
        return
      }
      if (!motivoSalida) {
        Swal.fire({ icon: 'warning', title: 'Datos incompletos', text: 'Debes seleccionar un motivo de salida' })
        return
      }
      if (motivoSalida === 'consumo_servicio' && !servicioVinculado.trim()) {
        Swal.fire({ icon: 'warning', title: 'Datos incompletos', text: 'Debes indicar el servicio vinculado' })
        return
      }
    }

    if (tipoMovimiento === 'asignacion') {
      const producto = productos.find(p => p.id === productoId)
      if (!producto?.es_retornable) {
        Swal.fire({ icon: 'error', title: 'Operación no permitida', text: 'Solo las herramientas pueden ser asignadas' })
        return
      }
      if (!vehiculoId) {
        Swal.fire({ icon: 'warning', title: 'Datos incompletos', text: 'Debes seleccionar un vehículo' })
        return
      }
      if (!servicioVinculado.trim()) {
        Swal.fire({ icon: 'warning', title: 'Datos incompletos', text: 'Debes indicar el servicio vinculado' })
        return
      }
      if (!proveedorId) {
        Swal.fire({ icon: 'warning', title: 'Datos incompletos', text: 'Debes seleccionar un proveedor' })
        return
      }
    }

    if (tipoMovimiento === 'devolucion') {
      if (!vehiculoId) {
        Swal.fire({ icon: 'warning', title: 'Datos incompletos', text: 'Debes seleccionar el vehículo que devuelve' })
        return
      }
      if (!estadoRetorno) {
        Swal.fire({ icon: 'warning', title: 'Datos incompletos', text: 'Debes indicar el estado de la herramienta' })
        return
      }
      if ((estadoRetorno === 'dañada' || estadoRetorno === 'perdida') && !observaciones.trim()) {
        Swal.fire({ icon: 'warning', title: 'Datos incompletos', text: 'Debes agregar observaciones para herramientas dañadas o perdidas' })
        return
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
        return
      }
    }

    try {
      const { data: userData } = await supabase.auth.getUser()

      // Movimiento normal (incluye entrada simple que va a tránsito automáticamente)
      // Nota: para devoluciones, vehiculoId representa el vehículo origen (desde donde se devuelve)
      // El RPC usa p_vehiculo_destino_id internamente pero lo mapea a vehiculo_origen_id

      // Construir observaciones con servicio vinculado incluido
      let observacionesFinal = observaciones || ''
      if (tipoMovimiento === 'salida' && servicioVinculado.trim()) {
        observacionesFinal = `Servicio: ${servicioVinculado.trim()}${observaciones ? '. ' + observaciones : ''}`
      } else if (tipoMovimiento === 'asignacion' && servicioVinculado.trim()) {
        observacionesFinal = `Servicio: ${servicioVinculado.trim()}${observaciones ? '. ' + observaciones : ''}`
      } else if (tipoMovimiento === 'devolucion' && servicioVinculadoDevolucion.trim()) {
        observacionesFinal = `Servicio: ${servicioVinculadoDevolucion.trim()}${observaciones ? '. ' + observaciones : ''}`
      }

      const { error } = await (supabase.rpc as any)('procesar_movimiento_inventario', {
        p_producto_id: productoId,
        p_tipo_movimiento: tipoMovimiento,
        p_cantidad: cantidad,
        p_proveedor_id: tipoMovimiento === 'devolucion' ? null : (proveedorId || null),
        p_conductor_destino_id: null,
        p_vehiculo_destino_id: vehiculoId || null,
        p_estado_destino: tipoMovimiento === 'devolucion' ? estadoRetorno : 'disponible',
        p_usuario_id: userData.user?.id,
        p_observaciones: observacionesFinal || null,
        p_motivo_salida: tipoMovimiento === 'salida' ? motivoSalida : null,
        p_servicio_id: null,
        p_estado_aprobacion: 'aprobado', // El RPC maneja internamente que entrada vaya a pendiente
        p_estado_retorno: tipoMovimiento === 'devolucion' ? estadoRetorno : null
      })

      if (error) throw error

      // Mensaje según tipo de movimiento
      if (tipoMovimiento === 'entrada') {
        Swal.fire({
          icon: 'success',
          title: 'Entrada registrada',
          text: 'El producto está en tránsito. Confirma la recepción desde "Pedidos en Tránsito".',
          timer: 3000
        })
      } else {
        Swal.fire({
          icon: 'success',
          title: 'Movimiento registrado',
          text: `${getTipoLabel(tipoMovimiento)} realizada con éxito`,
          timer: 2000
        })
      }

      resetForm()
    } catch (err: any) {
      console.error('Error procesando movimiento:', err)
      Swal.fire({ icon: 'error', title: 'Error', text: err.message || 'No se pudo procesar el movimiento' })
    }
  }

  // =====================================================
  // HELPERS
  // =====================================================
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
    let filtered = productos

    if (tipoProductoFiltro !== 'TODOS') {
      filtered = filtered.filter(p => p.tipo === tipoProductoFiltro)
    }

    if (tipoMovimiento === 'asignacion' || tipoMovimiento === 'devolucion') {
      filtered = filtered.filter(p => p.tipo === 'HERRAMIENTAS')
    }

    if (busquedaProducto.trim()) {
      const search = busquedaProducto.toLowerCase()
      filtered = filtered.filter(p =>
        p.codigo.toLowerCase().includes(search) ||
        p.nombre.toLowerCase().includes(search)
      )
    }

    return filtered
  }, [productos, tipoProductoFiltro, busquedaProducto, tipoMovimiento])

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
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#1F2937', marginBottom: '8px' }}>
          Gestión de Movimientos
        </h1>
        <p style={{ color: '#6B7280', fontSize: '14px' }}>
          Registrar entradas, salidas, uso y devolución de herramientas
        </p>
        {requiereAprobacion() && (
          <div style={{
            marginTop: '12px',
            padding: '8px 12px',
            background: '#FEF3C7',
            border: '1px solid #FCD34D',
            borderRadius: '6px',
            fontSize: '13px',
            color: '#92400E',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <Clock size={16} />
            Los movimientos de salida, uso y devolución requieren aprobación de un encargado
          </div>
        )}
      </div>

      {/* Selector de Tipo de Movimiento (sin Daño ni Pérdida) */}
      <div style={{ marginBottom: '24px' }}>
        <label style={{ display: 'block', marginBottom: '12px', fontSize: '14px', fontWeight: 600, color: '#374151' }}>
          Tipo de Movimiento
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
          {(['entrada', 'salida', 'asignacion', 'devolucion'] as TipoMovimiento[]).map((tipo) => (
            <button
              key={tipo}
              onClick={() => setTipoMovimiento(tipo)}
              style={{
                padding: '12px 16px',
                background: tipoMovimiento === tipo ? '#DC2626' : 'white',
                color: tipoMovimiento === tipo ? 'white' : '#6B7280',
                border: `2px solid ${tipoMovimiento === tipo ? '#DC2626' : '#E5E7EB'}`,
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
      <div style={{
        background: 'white',
        borderRadius: '12px',
        padding: '24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        border: '1px solid #E5E7EB'
      }}>
        <div style={{ display: 'grid', gap: '20px' }}>

          {/* ============= SECCIÓN ENTRADA ============= */}
          {tipoMovimiento === 'entrada' && (
            <>
              {/* Toggle Modo Lote */}
              <div style={{
                background: '#F9FAFB',
                border: '1px solid #E5E7EB',
                borderRadius: '8px',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '14px', color: '#1F2937', marginBottom: '4px' }}>
                    {modoLote ? '📦 Ingreso por Lote/Pedido' : '📄 Ingreso Simple'}
                  </div>
                  <div style={{ fontSize: '12px', color: '#6B7280' }}>
                    {modoLote
                      ? 'Registra múltiples productos en un solo pedido'
                      : 'Registra un producto a la vez'
                    }
                  </div>
                </div>
                <button
                  onClick={() => {
                    setModoLote(!modoLote)
                    setProductoId('')
                    setBusquedaProducto('')
                    setProductosLote([])
                    if (!modoLote) {
                      setEstadoInicial('en_transito') // Lote siempre en tránsito
                    }
                  }}
                  style={{
                    padding: '8px 16px',
                    background: modoLote ? '#DC2626' : '#6B7280',
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
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>
                  Proveedor *
                </label>
                <select
                  value={proveedorId}
                  onChange={(e) => setProveedorId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #D1D5DB',
                    borderRadius: '8px',
                    fontSize: '14px'
                  }}
                >
                  <option value="">Seleccionar proveedor...</option>
                  {proveedores.map((prov) => (
                    <option key={prov.id} value={prov.id}>
                      {prov.razon_social} - {prov.numero_documento}
                    </option>
                  ))}
                </select>
              </div>

              {/* Aviso de que siempre va a tránsito */}
              <div style={{
                background: '#FFFBEB',
                border: '1px solid #F59E0B',
                borderRadius: '8px',
                padding: '12px',
                fontSize: '13px',
                color: '#92400E',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <Truck size={18} />
                <div>
                  <strong>Los productos ingresarán en estado "En Tránsito".</strong>
                  <div style={{ fontSize: '12px', marginTop: '2px' }}>Deberás confirmar su recepción desde "Pedidos en Tránsito" para que pasen a stock disponible.</div>
                </div>
              </div>

              {/* Número de Pedido (siempre visible) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>
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
                      border: '1px solid #D1D5DB',
                      borderRadius: '8px',
                      fontSize: '14px'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>
                    Fecha Estimada Llegada
                  </label>
                  <input
                    type="date"
                    value={fechaEstimadaLlegada}
                    onChange={(e) => setFechaEstimadaLlegada(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #D1D5DB',
                      borderRadius: '8px',
                      fontSize: '14px'
                    }}
                  />
                </div>
              </div>
            </>
          )}

          {/* ============= SECCIÓN SALIDA ============= */}
          {tipoMovimiento === 'salida' && (
            <>
              {/* Motivo de Salida */}
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>
                  Motivo de Salida *
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                  {(['venta', 'consumo_servicio', 'dañado', 'perdido'] as MotivoSalida[]).map((motivo) => (
                    <button
                      key={motivo}
                      onClick={() => setMotivoSalida(motivo)}
                      style={{
                        padding: '10px',
                        background: motivoSalida === motivo ? '#DC2626' : 'white',
                        color: motivoSalida === motivo ? 'white' : '#6B7280',
                        border: `1px solid ${motivoSalida === motivo ? '#DC2626' : '#D1D5DB'}`,
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: 600
                      }}
                    >
                      {motivo === 'dañado' && <AlertTriangle size={14} style={{ marginRight: '4px' }} />}
                      {motivo === 'perdido' && <XCircle size={14} style={{ marginRight: '4px' }} />}
                      {getMotivoLabel(motivo)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Vehículo (opcional) */}
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>
                  Vehículo/Patente (opcional)
                </label>
                <select
                  value={vehiculoId}
                  onChange={(e) => setVehiculoId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #D1D5DB',
                    borderRadius: '8px',
                    fontSize: '14px'
                  }}
                >
                  <option value="">Sin vehículo asociado</option>
                  {vehiculos.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.patente} - {v.marca} {v.modelo}
                    </option>
                  ))}
                </select>
              </div>

              {/* Servicio vinculado (obligatorio si es consumo) */}
              {motivoSalida === 'consumo_servicio' && (
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>
                    Servicio Vinculado *
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Mantenimiento preventivo, Reparación motor, etc."
                    value={servicioVinculado}
                    onChange={(e) => setServicioVinculado(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #D1D5DB',
                      borderRadius: '8px',
                      fontSize: '14px'
                    }}
                  />
                </div>
              )}
            </>
          )}

          {/* ============= SECCIÓN USO (ASIGNACIÓN) ============= */}
          {tipoMovimiento === 'asignacion' && (
            <>
              <div style={{
                background: '#DBEAFE',
                border: '1px solid #93C5FD',
                borderRadius: '8px',
                padding: '12px',
                fontSize: '13px',
                color: '#1E40AF'
              }}>
                <strong>Nota:</strong> Solo herramientas pueden asignarse a vehículos. La herramienta cambia a estado "En uso" y no se descuenta del stock.
              </div>

              {/* Vehículo (obligatorio) */}
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>
                  Vehículo/Patente *
                </label>
                <select
                  value={vehiculoId}
                  onChange={(e) => setVehiculoId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #D1D5DB',
                    borderRadius: '8px',
                    fontSize: '14px'
                  }}
                >
                  <option value="">Seleccionar vehículo...</option>
                  {vehiculos.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.patente} - {v.marca} {v.modelo}
                    </option>
                  ))}
                </select>
              </div>

              {/* Servicio vinculado (obligatorio) */}
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>
                  Servicio Vinculado *
                </label>
                <input
                  type="text"
                  placeholder="Ej: Mantenimiento preventivo, Reparación frenos, etc."
                  value={servicioVinculado}
                  onChange={(e) => setServicioVinculado(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #D1D5DB',
                    borderRadius: '8px',
                    fontSize: '14px'
                  }}
                />
              </div>
            </>
          )}

          {/* ============= SECCIÓN DEVOLUCIÓN ============= */}
          {tipoMovimiento === 'devolucion' && (
            <>
              {/* Vehículo que devuelve */}
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>
                  Vehículo que devuelve *
                </label>
                <select
                  value={vehiculoId}
                  onChange={(e) => setVehiculoId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #D1D5DB',
                    borderRadius: '8px',
                    fontSize: '14px'
                  }}
                >
                  <option value="">Seleccionar vehículo...</option>
                  {vehiculosConInventario.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.patente} - {v.marca} {v.modelo}
                    </option>
                  ))}
                </select>
                {vehiculosConInventario.length === 0 && (
                  <p style={{ fontSize: '12px', color: '#DC2626', marginTop: '4px', fontStyle: 'italic' }}>
                    No hay vehículos con herramientas asignadas
                  </p>
                )}
              </div>

              {/* Producto a devolver (solo si hay vehículo) */}
              {vehiculoId && (
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>
                    Herramienta a devolver *
                  </label>
                  <select
                    value={productoId}
                    onChange={(e) => {
                      const selected = productosAsignadosVehiculo.find(p => p.producto_id === e.target.value)
                      setProductoId(e.target.value)
                      if (selected) setCantidad(selected.cantidad)
                    }}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #D1D5DB',
                      borderRadius: '8px',
                      fontSize: '14px'
                    }}
                  >
                    <option value="">Seleccionar herramienta...</option>
                    {productosAsignadosVehiculo.map((pa) => (
                      <option key={pa.inventario_id} value={pa.producto_id}>
                        {pa.producto?.codigo} - {pa.producto?.nombre} (Cant: {pa.cantidad})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Servicio vinculado (opcional) */}
              {vehiculoId && productoId && (
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>
                    Servicio Vinculado
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Mantenimiento completado, Fin de servicio, etc."
                    value={servicioVinculadoDevolucion}
                    onChange={(e) => setServicioVinculadoDevolucion(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #D1D5DB',
                      borderRadius: '8px',
                      fontSize: '14px'
                    }}
                  />
                </div>
              )}

              {/* Estado de retorno */}
              {vehiculoId && productoId && (
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>
                    Estado de la herramienta *
                  </label>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    {(['operativa', 'dañada', 'perdida'] as EstadoRetorno[]).map((estado) => (
                      <label key={estado} style={{
                        flex: 1,
                        padding: '12px',
                        border: `2px solid ${estadoRetorno === estado
                          ? (estado === 'operativa' ? '#059669' : '#DC2626')
                          : '#E5E7EB'}`,
                        borderRadius: '8px',
                        cursor: 'pointer',
                        background: estadoRetorno === estado
                          ? (estado === 'operativa' ? '#ECFDF5' : '#FEF2F2')
                          : 'white',
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
                          color: estado === 'operativa' ? '#059669' : '#DC2626'
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
                    <p style={{ fontSize: '12px', color: '#DC2626', marginTop: '8px' }}>
                      * Las observaciones son obligatorias para herramientas dañadas o perdidas
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {/* ============= CAMPOS COMUNES ============= */}

          {/* Filtro por Tipo de Producto (solo para entrada y salida sin modo lote) */}
          {(tipoMovimiento === 'entrada' || tipoMovimiento === 'salida') && (
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>
                Tipo de Producto
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {['TODOS', 'REPUESTOS', 'HERRAMIENTAS'].map((tipo) => (
                  <button
                    key={tipo}
                    onClick={() => {
                      setTipoProductoFiltro(tipo as any)
                      setProductoId('')
                      setBusquedaProducto('')
                    }}
                    style={{
                      padding: '8px 16px',
                      background: tipoProductoFiltro === tipo ? '#DC2626' : 'white',
                      color: tipoProductoFiltro === tipo ? 'white' : '#6B7280',
                      border: `1px solid ${tipoProductoFiltro === tipo ? '#DC2626' : '#D1D5DB'}`,
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

          {/* Buscador de Producto (modo simple, no devolución) */}
          {!modoLote && tipoMovimiento !== 'devolucion' && (
            <div style={{ position: 'relative' }} data-producto-dropdown>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>
                {tipoMovimiento === 'asignacion' ? 'Herramienta *' : 'Producto *'}
              </label>
              <div style={{ position: 'relative' }}>
                <Search
                  size={18}
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#9CA3AF',
                    pointerEvents: 'none'
                  }}
                />
                <input
                  type="text"
                  placeholder="Buscar por código o nombre..."
                  value={busquedaProducto}
                  onChange={(e) => {
                    setBusquedaProducto(e.target.value)
                    setMostrarDropdownProductos(true)
                  }}
                  onFocus={() => setMostrarDropdownProductos(true)}
                  style={{
                    width: '100%',
                    padding: '10px 10px 10px 40px',
                    border: '1px solid #D1D5DB',
                    borderRadius: '8px',
                    fontSize: '14px'
                  }}
                />

                {mostrarDropdownProductos && productosFiltrados.length > 0 && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    maxHeight: '300px',
                    overflowY: 'auto',
                    background: 'white',
                    border: '1px solid #D1D5DB',
                    borderRadius: '8px',
                    marginTop: '4px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    zIndex: 1000
                  }}>
                    {productosFiltrados.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => {
                          setProductoId(p.id)
                          setBusquedaProducto(`${p.codigo} - ${p.nombre}`)
                          setMostrarDropdownProductos(false)
                        }}
                        style={{
                          padding: '12px 16px',
                          cursor: 'pointer',
                          borderBottom: '1px solid #F3F4F6',
                          fontSize: '14px'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#F9FAFB'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                      >
                        <div style={{ fontWeight: 600, color: '#1F2937' }}>
                          {p.codigo} - {p.nombre}
                        </div>
                        <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '2px' }}>
                          {p.tipo} • {p.unidades_medida?.descripcion || 'Sin UM'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {productoId && productoSeleccionado && (
                <p style={{ fontSize: '12px', color: '#059669', marginTop: '4px' }}>
                  ✓ {productoSeleccionado.codigo} - {productoSeleccionado.nombre}
                </p>
              )}
            </div>
          )}

          {/* MODO LOTE: Gestión de productos */}
          {modoLote && tipoMovimiento === 'entrada' && proveedorId && (
            <div style={{
              background: '#F9FAFB',
              border: '2px dashed #D1D5DB',
              borderRadius: '8px',
              padding: '16px'
            }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#1F2937', marginBottom: '12px' }}>
                Productos del pedido ({productosLote.length})
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '8px', marginBottom: '12px' }}>
                <div style={{ position: 'relative' }} data-producto-dropdown>
                  <input
                    type="text"
                    placeholder="Buscar producto..."
                    value={busquedaProducto}
                    onChange={(e) => {
                      setBusquedaProducto(e.target.value)
                      setMostrarDropdownProductos(true)
                    }}
                    onFocus={() => setMostrarDropdownProductos(true)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #D1D5DB',
                      borderRadius: '6px',
                      fontSize: '13px'
                    }}
                  />
                  {mostrarDropdownProductos && productosFiltrados.length > 0 && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      maxHeight: '200px',
                      overflowY: 'auto',
                      background: 'white',
                      border: '1px solid #D1D5DB',
                      borderRadius: '6px',
                      marginTop: '4px',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                      zIndex: 1000
                    }}>
                      {productosFiltrados.map((p) => (
                        <div
                          key={p.id}
                          onClick={() => {
                            setProductoId(p.id)
                            setBusquedaProducto(`${p.codigo} - ${p.nombre}`)
                            setMostrarDropdownProductos(false)
                          }}
                          style={{
                            padding: '8px 12px',
                            cursor: 'pointer',
                            borderBottom: '1px solid #F3F4F6',
                            fontSize: '13px'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = '#F9FAFB'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                        >
                          <div style={{ fontWeight: 600 }}>{p.codigo} - {p.nombre}</div>
                          <div style={{ fontSize: '11px', color: '#6B7280' }}>{p.tipo}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <input
                  type="number"
                  min="1"
                  placeholder="Cant."
                  value={cantidad}
                  onChange={(e) => setCantidad(Number(e.target.value))}
                  style={{
                    width: '100px',
                    padding: '8px 12px',
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    fontSize: '13px'
                  }}
                />
                <button
                  onClick={() => {
                    if (productoId && cantidad > 0) {
                      const prod = productos.find(p => p.id === productoId)
                      if (prod) {
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
                        setBusquedaProducto('')
                        setCantidad(1)
                      }
                    }
                  }}
                  style={{
                    padding: '8px 16px',
                    background: '#DC2626',
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
                        background: 'white',
                        padding: '12px',
                        borderRadius: '6px',
                        border: '1px solid #E5E7EB',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '13px' }}>
                          {pl.producto?.codigo} - {pl.producto?.nombre}
                        </div>
                        <div style={{ fontSize: '12px', color: '#6B7280' }}>
                          {pl.producto?.tipo} • {pl.cantidad} {pl.producto?.unidades_medida?.descripcion || 'und'}
                        </div>
                      </div>
                      <button
                        onClick={() => setProductosLote(productosLote.filter((_, i) => i !== idx))}
                        style={{
                          padding: '6px 12px',
                          background: '#FEE2E2',
                          color: '#DC2626',
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
                <p style={{ fontSize: '13px', color: '#6B7280', fontStyle: 'italic', textAlign: 'center', padding: '16px' }}>
                  No hay productos agregados
                </p>
              )}
            </div>
          )}

          {/* Proveedor para Salida/Uso (stock por proveedor) */}
          {(tipoMovimiento === 'salida' || tipoMovimiento === 'asignacion') && productoId && (
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>
                Proveedor *
              </label>
              <select
                value={proveedorId}
                onChange={(e) => setProveedorId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '8px',
                  fontSize: '14px'
                }}
              >
                <option value="">Seleccionar proveedor...</option>
                {stockPorProveedor.map((stock) => (
                  <option key={stock.proveedor_id} value={stock.proveedor_id}>
                    {stock.proveedor_nombre} - Stock: {stock.cantidad}
                  </option>
                ))}
              </select>
              {stockPorProveedor.length === 0 && productoId && (
                <p style={{ fontSize: '12px', color: '#DC2626', marginTop: '4px', fontStyle: 'italic' }}>
                  No hay stock disponible de este producto
                </p>
              )}
            </div>
          )}

          {/* Cantidad (modo simple, no devolución) */}
          {!modoLote && tipoMovimiento !== 'devolucion' && (
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>
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
                  border: '1px solid #D1D5DB',
                  borderRadius: '8px',
                  fontSize: '14px'
                }}
              />
            </div>
          )}

          {/* Observaciones */}
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>
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
                border: '1px solid #D1D5DB',
                borderRadius: '8px',
                fontSize: '14px',
                fontFamily: 'inherit'
              }}
            />
          </div>

          {/* Botones */}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '12px' }}>
            <button
              onClick={resetForm}
              style={{
                padding: '10px 24px',
                background: '#F3F4F6',
                color: '#374151',
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
                background: '#DC2626',
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
        </div>
      </div>
    </div>
  )
}
