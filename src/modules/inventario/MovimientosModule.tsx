import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import Swal from 'sweetalert2'
import {
  Package,
  RotateCcw,
  AlertTriangle,
  XCircle,
  Truck,
  Search
} from 'lucide-react'

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

type TipoMovimiento = 'entrada' | 'salida' | 'asignacion' | 'devolucion' | 'ajuste' | 'daño' | 'perdida'

interface ProductoLote {
  producto_id: string
  cantidad: number
  producto?: Producto
}

export function MovimientosModule() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([])
  const [vehiculosConInventario, setVehiculosConInventario] = useState<Vehiculo[]>([])
  const [productosAsignadosVehiculo, setProductosAsignadosVehiculo] = useState<ProductoAsignadoVehiculo[]>([])
  const [stockPorProveedor, setStockPorProveedor] = useState<StockPorProveedor[]>([])
  const [loading, setLoading] = useState(true)
  const [tipoMovimiento, setTipoMovimiento] = useState<TipoMovimiento>('entrada')

  // Filtros
  const [tipoProductoFiltro, setTipoProductoFiltro] = useState<'TODOS' | 'REPUESTOS' | 'HERRAMIENTAS'>('TODOS')
  const [busquedaProducto, setBusquedaProducto] = useState('')
  const [mostrarDropdownProductos, setMostrarDropdownProductos] = useState(false)

  // Modo de entrada/salida
  const [modoLote, setModoLote] = useState(false)
  const [productosLote, setProductosLote] = useState<ProductoLote[]>([])

  // Form data
  const [productoId, setProductoId] = useState('')
  const [proveedorId, setProveedorId] = useState('')
  const [cantidad, setCantidad] = useState(1)
  const [vehiculoId, setVehiculoId] = useState('')
  const [estadoDestino, setEstadoDestino] = useState<'disponible' | 'dañado' | 'perdido'>('disponible')
  const [numeroDocumento, setNumeroDocumento] = useState('')
  const [observaciones, setObservaciones] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    // Cuando cambia el producto, cargar stock por proveedor (solo en modo simple)
    // Para devolución, solo cargar si NO hay vehículo seleccionado (modo normal)
    const shouldLoadStock = productoId && !modoLote && (
      tipoMovimiento === 'salida' ||
      tipoMovimiento === 'asignacion' ||
      (tipoMovimiento === 'devolucion' && !vehiculoId)
    )

    if (shouldLoadStock) {
      loadStockPorProveedor(productoId)
    } else if (!modoLote && !(tipoMovimiento === 'devolucion' && vehiculoId && productoId)) {
      // Solo limpiar si NO estamos en modo lote y NO en devolución con vehículo+producto seleccionados
      setStockPorProveedor([])
      // No limpiar proveedorId si estamos en devolución con vehículo y producto seleccionados
      if (!(tipoMovimiento === 'devolucion' && vehiculoId && productoId)) {
        setProveedorId('')
      }
    }
  }, [productoId, tipoMovimiento, modoLote, vehiculoId])

  useEffect(() => {
    // Resetear selección de producto al cambiar tipo
    setProductoId('')
    setProveedorId('')
    setBusquedaProducto('')
    setMostrarDropdownProductos(false)
  }, [tipoMovimiento])

  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
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

  const loadData = async () => {
    try {
      setLoading(true)

      const [prodRes, provRes, vehRes] = await Promise.all([
        supabase
          .from('productos')
          .select(`
            id,
            codigo,
            nombre,
            tipo,
            es_retornable,
            unidades_medida (
              codigo,
              descripcion
            )
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
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'No se pudieron cargar los datos necesarios'
      })
    } finally {
      setLoading(false)
    }
  }

  const loadStockPorProveedor = async (productoId: string) => {
    try {
      const { data, error } = await supabase
        .from('inventario')
        .select(`
          id,
          proveedor_id,
          cantidad,
          proveedores (
            id,
            razon_social
          )
        `)
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

      // Pre-seleccionar primer proveedor con stock
      if (stockAgrupado.length > 0 && !proveedorId) {
        setProveedorId(stockAgrupado[0].proveedor_id)
      }
    } catch (err) {
      console.error('Error cargando stock por proveedor:', err)
      setStockPorProveedor([])
    }
  }

  const loadProveedoresConStock = async () => {
    try {
      const { data, error } = await supabase
        .from('inventario')
        .select(`
          proveedor_id,
          proveedores (
            id,
            razon_social
          )
        `)
        .eq('estado', 'disponible')
        .gt('cantidad', 0)

      if (error) throw error

      // Agrupar por proveedor (eliminar duplicados)
      const proveedoresUnicos = (data || [])
        .filter((item: any) => item.proveedor_id && item.proveedores)
        .reduce((acc: any[], item: any) => {
          if (!acc.find(p => p.proveedor_id === item.proveedor_id)) {
            acc.push({
              proveedor_id: item.proveedor_id,
              proveedor_nombre: item.proveedores.razon_social
            })
          }
          return acc
        }, [])

      return proveedoresUnicos
    } catch (err) {
      console.error('Error cargando proveedores con stock:', err)
      return []
    }
  }

  const [proveedoresConStock, setProveedoresConStock] = useState<Array<{ proveedor_id: string; proveedor_nombre: string }>>([])

  const loadVehiculosConInventario = async () => {
    try {
      const { data, error } = await supabase
        .from('inventario')
        .select(`
          asignado_a_vehiculo_id,
          productos (
            es_retornable
          ),
          vehiculos (
            id,
            patente,
            marca,
            modelo
          )
        `)
        .eq('estado', 'en_uso')
        .not('asignado_a_vehiculo_id', 'is', null)
        .gt('cantidad', 0)

      if (error) throw error

      // Filtrar solo herramientas (retornables) y agrupar por vehículo
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
          id,
          producto_id,
          proveedor_id,
          cantidad,
          productos (
            id,
            codigo,
            nombre,
            tipo,
            es_retornable
          ),
          proveedores (
            id,
            razon_social
          )
        `)
        .eq('asignado_a_vehiculo_id', vehiculoId)
        .eq('estado', 'en_uso')
        .gt('cantidad', 0)

      if (error) throw error

      // Filtrar solo herramientas y agrupar por producto (sumar cantidades de todos los proveedores)
      const productosAgrupados = (data || [])
        .filter((item: any) => item.productos?.es_retornable === true)
        .reduce((acc: ProductoAsignadoVehiculo[], item: any) => {
          const existente = acc.find(p => p.producto_id === item.producto_id)

          if (existente) {
            // Si ya existe el producto, sumar la cantidad
            existente.cantidad += Number(item.cantidad)
          } else {
            // Si no existe, agregar nuevo
            acc.push({
              producto_id: item.producto_id,
              proveedor_id: '', // No se usa para devolución
              cantidad: Number(item.cantidad),
              inventario_id: item.id,
              producto: item.productos,
              proveedor_nombre: 'N/A' // No se usa para devolución
            })
          }

          return acc
        }, [])

      setProductosAsignadosVehiculo(productosAgrupados)
    } catch (err) {
      console.error('Error cargando productos asignados al vehículo:', err)
      setProductosAsignadosVehiculo([])
    }
  }

  useEffect(() => {
    // Cargar proveedores con stock cuando estamos en modo lote SALIDA
    if (modoLote && tipoMovimiento === 'salida') {
      loadProveedoresConStock().then(setProveedoresConStock)
    }
  }, [modoLote, tipoMovimiento])

  useEffect(() => {
    // Cargar vehículos con inventario cuando estamos en devolución
    if (tipoMovimiento === 'devolucion') {
      loadVehiculosConInventario()
    }
  }, [tipoMovimiento])

  useEffect(() => {
    // Cargar productos asignados cuando se selecciona un vehículo en devolución
    if (tipoMovimiento === 'devolucion' && vehiculoId) {
      loadProductosAsignadosVehiculo(vehiculoId)
    } else if (tipoMovimiento === 'devolucion') {
      setProductosAsignadosVehiculo([])
      setProductoId('')
      setProveedorId('')
    }
  }, [vehiculoId, tipoMovimiento])

  useEffect(() => {
    // Pre-seleccionar primer proveedor con stock
    if (stockPorProveedor.length > 0 && !proveedorId) {
      setProveedorId(stockPorProveedor[0].proveedor_id)
    }
  }, [stockPorProveedor])

  const resetForm = () => {
    setProductoId('')
    setProveedorId('')
    setCantidad(1)
    setVehiculoId('')
    setEstadoDestino('disponible')
    setObservaciones('')
    setBusquedaProducto('')
    setTipoProductoFiltro('TODOS')
    setStockPorProveedor([])
    setNumeroDocumento('')
    setProductosLote([])
    setModoLote(false)
    setProductosAsignadosVehiculo([])
  }

  const handleMovimiento = async () => {
    // MODO LOTE: Validaciones y procesamiento para múltiples productos
    if (modoLote && (tipoMovimiento === 'entrada' || tipoMovimiento === 'salida')) {
      if (!proveedorId) {
        Swal.fire({
          icon: 'warning',
          title: 'Datos incompletos',
          text: 'Debes seleccionar un proveedor'
        })
        return
      }

      if (productosLote.length === 0) {
        Swal.fire({
          icon: 'warning',
          title: 'Datos incompletos',
          text: 'Debes agregar al menos un producto al lote'
        })
        return
      }

      try {
        const { data: { user } } = await supabase.auth.getUser()

        // Procesar cada producto del lote
        for (const pl of productosLote) {
          const { error } = await (supabase.rpc as any)('procesar_movimiento_inventario', {
            p_producto_id: pl.producto_id,
            p_tipo_movimiento: tipoMovimiento,
            p_cantidad: pl.cantidad,
            p_proveedor_id: proveedorId,
            p_usuario_id: user?.id,
            p_observaciones: observaciones || `${tipoMovimiento === 'entrada' ? 'Entrada' : 'Salida'} en lote${numeroDocumento ? ` - Doc: ${numeroDocumento}` : ''}`
          })

          if (error) throw error
        }

        Swal.fire({
          icon: 'success',
          title: 'Éxito',
          text: `${tipoMovimiento === 'entrada' ? 'Entrada' : 'Salida'} de ${productosLote.length} productos registrada correctamente`
        })

        resetForm()
      } catch (error: any) {
        console.error('Error procesando lote:', error)
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: error.message || 'No se pudo procesar el lote'
        })
      }
      return
    }

    // MODO SIMPLE: Validaciones normales
    if (!productoId || cantidad <= 0) {
      Swal.fire({
        icon: 'warning',
        title: 'Datos incompletos',
        text: 'Selecciona un producto y una cantidad válida'
      })
      return
    }

    // Validación de proveedor para entrada
    if (tipoMovimiento === 'entrada' && !proveedorId) {
      Swal.fire({
        icon: 'warning',
        title: 'Datos incompletos',
        text: 'Debes seleccionar un proveedor para la entrada'
      })
      return
    }

    // Validación de proveedor para salida y uso (NO para devolución)
    if ((tipoMovimiento === 'salida' || tipoMovimiento === 'asignacion') && !proveedorId) {
      Swal.fire({
        icon: 'warning',
        title: 'Datos incompletos',
        text: 'Debes seleccionar un proveedor'
      })
      return
    }

    const producto = productos.find(p => p.id === productoId)
    if (!producto) return

    // Validaciones específicas por tipo
    if (tipoMovimiento === 'asignacion') {
      if (!producto.es_retornable) {
        Swal.fire({
          icon: 'error',
          title: 'Operación no permitida',
          text: 'Solo las herramientas (retornables) pueden ser asignadas'
        })
        return
      }
      if (!vehiculoId) {
        Swal.fire({
          icon: 'warning',
          title: 'Datos incompletos',
          text: 'Debes seleccionar un vehículo para el uso'
        })
        return
      }
    }

    if (tipoMovimiento === 'devolucion') {
      if (!producto.es_retornable) {
        Swal.fire({
          icon: 'error',
          title: 'Operación no permitida',
          text: 'Solo las herramientas pueden ser devueltas'
        })
        return
      }
      if (!vehiculoId) {
        Swal.fire({
          icon: 'warning',
          title: 'Datos incompletos',
          text: 'Debes seleccionar el vehículo que devuelve'
        })
        return
      }
    }

    // Validar stock disponible para salida/asignacion
    if (tipoMovimiento === 'salida' || tipoMovimiento === 'asignacion') {
      const stockProveedor = stockPorProveedor.find(s => s.proveedor_id === proveedorId)
      if (!stockProveedor || stockProveedor.cantidad < cantidad) {
        Swal.fire({
          icon: 'error',
          title: 'Stock insuficiente',
          text: `No hay suficiente stock del proveedor seleccionado. Disponible: ${stockProveedor?.cantidad || 0}`
        })
        return
      }
    }

    try {
      const { data: userData } = await supabase.auth.getUser()

      // Llamar a la función de Supabase para procesar el movimiento
      const { error } = await (supabase.rpc as any)('procesar_movimiento_inventario', {
        p_producto_id: productoId,
        p_tipo_movimiento: tipoMovimiento,
        p_cantidad: cantidad,
        // Para DEVOLUCIÓN: enviar NULL - el SQL saca el proveedor de los registros de inventario en_uso
        p_proveedor_id: tipoMovimiento === 'devolucion' ? null : (proveedorId || null),
        p_conductor_destino_id: null,
        p_vehiculo_destino_id: vehiculoId || null,
        p_estado_destino: estadoDestino,
        p_usuario_id: userData.user?.id,
        p_observaciones: observaciones || null
      })

      if (error) throw error

      Swal.fire({
        icon: 'success',
        title: 'Movimiento registrado',
        text: `${getTipoLabel(tipoMovimiento)} realizada con éxito`,
        timer: 2000
      })

      resetForm()
    } catch (err: any) {
      console.error('Error procesando movimiento:', err)
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.message || 'No se pudo procesar el movimiento'
      })
    }
  }

  const getTipoLabel = (tipo: TipoMovimiento): string => {
    const labels: Record<TipoMovimiento, string> = {
      entrada: 'Entrada',
      salida: 'Salida',
      asignacion: 'Uso',
      devolucion: 'Devolución',
      ajuste: 'Ajuste',
      daño: 'Marcar como dañado',
      perdida: 'Marcar como perdido'
    }
    return labels[tipo]
  }

  const getTipoIcon = (tipo: TipoMovimiento) => {
    const icons: Record<TipoMovimiento, any> = {
      entrada: <Package size={20} />,
      salida: <Package size={20} />,
      asignacion: <Truck size={20} />,
      devolucion: <RotateCcw size={20} />,
      ajuste: <Package size={20} />,
      daño: <AlertTriangle size={20} />,
      perdida: <XCircle size={20} />
    }
    return icons[tipo]
  }

  // Filtrar productos según tipo y búsqueda
  const productosFiltrados = useMemo(() => {
    let filtered = productos

    // Filtrar por tipo de producto
    if (tipoProductoFiltro !== 'TODOS') {
      filtered = filtered.filter(p => p.tipo === tipoProductoFiltro)
    }

    // Filtrar solo HERRAMIENTAS para uso y devolución
    if (tipoMovimiento === 'asignacion' || tipoMovimiento === 'devolucion') {
      filtered = filtered.filter(p => p.tipo === 'HERRAMIENTAS')
    }

    // Filtrar por búsqueda
    if (busquedaProducto.trim()) {
      const search = busquedaProducto.toLowerCase()
      filtered = filtered.filter(p =>
        p.codigo.toLowerCase().includes(search) ||
        p.nombre.toLowerCase().includes(search)
      )
    }

    return filtered
  }, [productos, tipoProductoFiltro, busquedaProducto, tipoMovimiento])

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <p>Cargando...</p>
      </div>
    )
  }

  const productoSeleccionado = productos.find(p => p.id === productoId)
  const stockTotal = stockPorProveedor.reduce((sum, s) => sum + s.cantidad, 0)

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#1F2937', marginBottom: '8px' }}>
          Gestión de Movimientos
        </h1>
        <p style={{ color: '#6B7280', fontSize: '14px' }}>
          Registrar entradas, salidas, asignaciones y más
        </p>
      </div>

      {/* Selector de Tipo de Movimiento */}
      <div style={{ marginBottom: '24px' }}>
        <label style={{ display: 'block', marginBottom: '12px', fontSize: '14px', fontWeight: 600, color: '#374151' }}>
          Tipo de Movimiento
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
          {(['entrada', 'salida', 'asignacion', 'devolucion', 'daño', 'perdida'] as TipoMovimiento[]).map((tipo) => (
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
          {/* Toggle Modo Lote - Solo para ENTRADA y SALIDA */}
          {(tipoMovimiento === 'entrada' || tipoMovimiento === 'salida') && (
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
                  {modoLote ? '📦 Modo Lote' : '📄 Modo Simple'}
                </div>
                <div style={{ fontSize: '12px', color: '#6B7280' }}>
                  {modoLote
                    ? 'Registra múltiples productos en una sola operación'
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
                }}
                style={{
                  padding: '8px 16px',
                  background: modoLote ? '#DC2626' : '#6B7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 600,
                  transition: 'all 0.2s'
                }}
              >
                {modoLote ? 'Cambiar a Simple' : 'Cambiar a Lote'}
              </button>
            </div>
          )}

          {/* ============= SECCIÓN ESPECIAL PARA DEVOLUCIÓN ============= */}
          {tipoMovimiento === 'devolucion' && (
            <>
              {/* 1. VEHÍCULO (primero para devolución) */}
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
                    No hay vehículos con herramientas asignadas (en uso)
                  </p>
                )}
              </div>

              {/* 2. PRODUCTO (solo si hay vehículo seleccionado) */}
              {vehiculoId && (
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>
                    Producto a devolver *
                  </label>
                  <select
                    value={productoId}
                    onChange={(e) => {
                      const selectedProducto = productosAsignadosVehiculo.find(p => p.producto_id === e.target.value)
                      setProductoId(e.target.value)
                      if (selectedProducto) {
                        setCantidad(selectedProducto.cantidad)
                      } else {
                        setCantidad(1)
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #D1D5DB',
                      borderRadius: '8px',
                      fontSize: '14px'
                    }}
                  >
                    <option value="">Seleccionar producto...</option>
                    {productosAsignadosVehiculo.map((pa) => (
                      <option key={pa.inventario_id} value={pa.producto_id}>
                        {pa.producto?.codigo} - {pa.producto?.nombre} (Cant: {pa.cantidad})
                      </option>
                    ))}
                  </select>
                  {productosAsignadosVehiculo.length === 0 && (
                    <p style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px', fontStyle: 'italic' }}>
                      Este vehículo no tiene productos asignados
                    </p>
                  )}
                </div>
              )}

              {/* 3. CANTIDAD (solo si hay producto seleccionado) */}
              {vehiculoId && productoId && (
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>
                    Cantidad *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={cantidad}
                    onChange={(e) => setCantidad(Number(e.target.value))}
                    readOnly={true}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #D1D5DB',
                      borderRadius: '8px',
                      fontSize: '14px',
                      background: '#F3F4F6',
                      cursor: 'not-allowed'
                    }}
                  />
                  <p style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px', fontStyle: 'italic' }}>
                    Cantidad auto-completada con el total asignado al vehículo
                  </p>
                </div>
              )}

              {/* 4. ESTADO DESTINO (solo si hay producto seleccionado) */}
              {vehiculoId && productoId && (
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>
                    Estado del producto devuelto *
                  </label>
                  <select
                    value={estadoDestino}
                    onChange={(e) => setEstadoDestino(e.target.value as any)}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #D1D5DB',
                      borderRadius: '8px',
                      fontSize: '14px'
                    }}
                  >
                    <option value="disponible">Disponible (buen estado)</option>
                    <option value="dañado">Dañado (requiere reparación)</option>
                    <option value="perdido">Perdido</option>
                  </select>
                </div>
              )}

              {/* 5. OBSERVACIONES */}
              {vehiculoId && productoId && (
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>
                    Observaciones
                  </label>
                  <textarea
                    value={observaciones}
                    onChange={(e) => setObservaciones(e.target.value)}
                    rows={3}
                    placeholder="Detalles adicionales sobre la devolución..."
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
              )}
            </>
          )}
          {/* ============= FIN SECCIÓN DEVOLUCIÓN ============= */}

          {/* Filtro por Tipo de Producto (NO para devolución ni asignación) */}
          {tipoMovimiento !== 'asignacion' && tipoMovimiento !== 'devolucion' && (
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

          {/* Producto con buscador integrado - Solo en modo simple y NO en devolución */}
          {!modoLote && tipoMovimiento !== 'devolucion' && (
          <div style={{ position: 'relative' }} data-producto-dropdown>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>
              Producto *
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
                  pointerEvents: 'none',
                  zIndex: 1
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
                  fontSize: '14px',
                  background: 'white'
                }}
              />

              {/* Dropdown personalizado */}
              {mostrarDropdownProductos && productosFiltrados.length > 0 && (
                <div
                  style={{
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
                  }}
                >
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
                        transition: 'background 0.15s',
                        fontSize: '14px'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#F9FAFB'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'white'
                      }}
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
            {productosFiltrados.length === 0 && busquedaProducto && (
              <p style={{ fontSize: '12px', color: '#DC2626', marginTop: '4px', fontStyle: 'italic' }}>
                No hay productos que coincidan con la búsqueda
              </p>
            )}
            {productoId && productoSeleccionado && (
              <p style={{ fontSize: '12px', color: '#059669', marginTop: '4px' }}>
                ✓ {productoSeleccionado.codigo} - {productoSeleccionado.nombre} ({productoSeleccionado.unidades_medida?.descripcion || 'Sin UM'})
              </p>
            )}
          </div>
          )}

          {/* Información del Producto Seleccionado - Solo en modo simple */}
          {!modoLote && productoSeleccionado && (
            <div style={{
              background: '#F9FAFB',
              border: '1px solid #E5E7EB',
              borderRadius: '8px',
              padding: '12px',
              fontSize: '13px'
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
                <div>
                  <span style={{ color: '#6B7280', display: 'block' }}>Tipo</span>
                  <span style={{ fontWeight: 600, color: '#1F2937' }}>{productoSeleccionado.tipo}</span>
                </div>
                <div>
                  <span style={{ color: '#6B7280', display: 'block' }}>Unidad de Medida</span>
                  <span style={{ fontWeight: 600, color: '#1F2937' }}>
                    {productoSeleccionado.unidades_medida?.descripcion || 'N/A'}
                  </span>
                </div>
                {(tipoMovimiento === 'salida' || tipoMovimiento === 'asignacion' || tipoMovimiento === 'devolucion') && (
                  <div>
                    <span style={{ color: '#6B7280', display: 'block' }}>Stock Total</span>
                    <span style={{ fontWeight: 600, color: stockTotal > 0 ? '#059669' : '#DC2626' }}>
                      {stockTotal} {productoSeleccionado.unidades_medida?.descripcion || 'unidades'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Proveedor - Entrada */}
          {tipoMovimiento === 'entrada' && (
            <>
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
                {proveedores.length === 0 && (
                  <p style={{ fontSize: '12px', color: '#DC2626', marginTop: '4px', fontStyle: 'italic' }}>
                    No hay proveedores activos. Crea uno primero.
                  </p>
                )}
              </div>

              {/* Número de Documento (Factura/Guía) - Solo en modo lote */}
              {modoLote && (
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>
                    N° Documento (Factura/Guía) {!modoLote && '*'}
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: F001-00123456"
                    value={numeroDocumento}
                    onChange={(e) => setNumeroDocumento(e.target.value)}
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

          {/* Proveedor - Salida MODO LOTE (seleccionar proveedor primero) */}
          {tipoMovimiento === 'salida' && modoLote && (
            <>
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
                  <option value="">Seleccionar proveedor con stock...</option>
                  {proveedoresConStock.map((prov) => (
                    <option key={prov.proveedor_id} value={prov.proveedor_id}>
                      {prov.proveedor_nombre}
                    </option>
                  ))}
                </select>
                {proveedoresConStock.length === 0 && (
                  <p style={{ fontSize: '12px', color: '#DC2626', marginTop: '4px', fontStyle: 'italic' }}>
                    No hay proveedores con stock disponible
                  </p>
                )}
              </div>

              {/* Número de Documento (Guía de Salida) - Solo en modo lote */}
              {proveedorId && (
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>
                    N° Documento (Guía de Salida)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: G001-00123456"
                    value={numeroDocumento}
                    onChange={(e) => setNumeroDocumento(e.target.value)}
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

          {/* Proveedor - Salida/Uso MODO SIMPLE (con stock por proveedor) */}
          {/* Para DEVOLUCIÓN: no mostrar si hay vehículo seleccionado (se auto-completa) */}
          {(tipoMovimiento === 'salida' || tipoMovimiento === 'asignacion' || (tipoMovimiento === 'devolucion' && !vehiculoId)) && !modoLote && productoId && (
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>
                Proveedor * {stockPorProveedor.length > 0 && '(primer proveedor con stock pre-seleccionado)'}
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
                    {stock.proveedor_nombre} - Stock: {stock.cantidad} {productoSeleccionado?.unidades_medida?.descripcion || 'und'}
                  </option>
                ))}
              </select>
              {stockPorProveedor.length === 0 && productoId && (
                <p style={{ fontSize: '12px', color: '#DC2626', marginTop: '4px', fontStyle: 'italic' }}>
                  No hay stock disponible de este producto
                </p>
              )}
              {proveedorId && stockPorProveedor.length > 0 && (
                <p style={{ fontSize: '12px', color: '#059669', marginTop: '4px' }}>
                  ✓ Stock seleccionado: {stockPorProveedor.find(s => s.proveedor_id === proveedorId)?.cantidad} {productoSeleccionado?.unidades_medida?.descripcion || 'unidades'}
                </p>
              )}
            </div>
          )}

          {/* MODO LOTE: Gestión de productos múltiples */}
          {modoLote && (tipoMovimiento === 'entrada' || tipoMovimiento === 'salida') && proveedorId && (
            <div style={{
              background: '#F9FAFB',
              border: '2px dashed #D1D5DB',
              borderRadius: '8px',
              padding: '16px'
            }}>
              <div style={{ marginBottom: '16px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#1F2937', marginBottom: '12px' }}>
                  Productos a registrar ({productosLote.length})
                </h3>

                {/* Agregar producto al lote */}
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
                            onMouseEnter={(e) => { e.currentTarget.style.background = '#F9FAFB' }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'white' }}
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
                            // Si el producto ya existe, sumar la cantidad
                            setProductosLote(productosLote.map(pl =>
                              pl.producto_id === productoId
                                ? { ...pl, cantidad: pl.cantidad + cantidad }
                                : pl
                            ))
                          } else {
                            // Si no existe, agregar nuevo
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

                {/* Lista de productos agregados */}
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
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: '13px', color: '#1F2937' }}>
                            {pl.producto?.codigo} - {pl.producto?.nombre}
                          </div>
                          <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '2px' }}>
                            {pl.producto?.tipo} • {pl.cantidad} {pl.producto?.unidades_medida?.descripcion || 'und'}
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            setProductosLote(productosLote.filter((_, i) => i !== idx))
                          }}
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
                    No hay productos agregados. Usa el buscador de arriba para agregar productos al lote.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Cantidad - Solo en modo simple y NO en devolución */}
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

          {/* Vehículo (solo para USO/asignación) */}
          {tipoMovimiento === 'asignacion' && (
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>
                Vehículo *
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
              {vehiculos.length === 0 && (
                <p style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px', fontStyle: 'italic' }}>
                  No hay vehículos activos disponibles
                </p>
              )}
            </div>
          )}

          {/* Observaciones (NO para devolución, ya está en su sección) */}
          {tipoMovimiento !== 'devolucion' && (
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>
                Observaciones
              </label>
              <textarea
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                rows={3}
                placeholder="Detalles adicionales sobre el movimiento..."
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
          )}

          {/* Alertas según tipo de movimiento */}
          {productoSeleccionado && tipoMovimiento === 'asignacion' && !productoSeleccionado.es_retornable && (
            <div style={{
              background: '#FEE2E2',
              border: '1px solid #FCA5A5',
              borderRadius: '8px',
              padding: '12px',
              display: 'flex',
              gap: '8px',
              alignItems: 'start'
            }}>
              <AlertTriangle size={18} style={{ color: '#DC2626', flexShrink: 0, marginTop: '2px' }} />
              <div style={{ fontSize: '13px', color: '#991B1B' }}>
                <strong>Advertencia:</strong> Este producto NO es retornable (repuesto). Solo las herramientas pueden asignarse a conductores/vehículos.
              </div>
            </div>
          )}

          {tipoMovimiento === 'salida' && (
            <div style={{
              background: '#FEF3C7',
              border: '1px solid #FCD34D',
              borderRadius: '8px',
              padding: '12px',
              display: 'flex',
              gap: '8px',
              alignItems: 'start'
            }}>
              <Package size={18} style={{ color: '#92400E', flexShrink: 0, marginTop: '2px' }} />
              <div style={{ fontSize: '13px', color: '#78350F' }}>
                <strong>Nota:</strong> La salida reduce el stock disponible del proveedor seleccionado. Úsalo para consumo de repuestos.
              </div>
            </div>
          )}

          {tipoMovimiento === 'entrada' && (
            <div style={{
              background: '#D1FAE5',
              border: '1px solid #6EE7B7',
              borderRadius: '8px',
              padding: '12px',
              display: 'flex',
              gap: '8px',
              alignItems: 'start'
            }}>
              <Package size={18} style={{ color: '#065F46', flexShrink: 0, marginTop: '2px' }} />
              <div style={{ fontSize: '13px', color: '#065F46' }}>
                <strong>Nota:</strong> La entrada aumenta el stock del proveedor seleccionado.
              </div>
            </div>
          )}

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
              Registrar {getTipoLabel(tipoMovimiento)}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
