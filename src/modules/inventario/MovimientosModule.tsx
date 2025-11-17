import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Swal from 'sweetalert2'
import {
  Package,
  RotateCcw,
  AlertTriangle,
  XCircle,
  Truck
} from 'lucide-react'

interface Producto {
  id: string
  codigo: string
  nombre: string
  es_retornable: boolean
}

interface Vehiculo {
  id: string
  patente: string
  marca: string
  modelo: string
}

type TipoMovimiento = 'entrada' | 'salida' | 'asignacion' | 'devolucion' | 'ajuste' | 'daño' | 'perdida'

export function MovimientosModule() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([])
  const [loading, setLoading] = useState(true)
  const [tipoMovimiento, setTipoMovimiento] = useState<TipoMovimiento>('entrada')

  // Form data
  const [productoId, setProductoId] = useState('')
  const [cantidad, setCantidad] = useState(1)
  const [vehiculoId, setVehiculoId] = useState('')
  const [estadoDestino, setEstadoDestino] = useState<'disponible' | 'dañado' | 'perdido'>('disponible')
  const [observaciones, setObservaciones] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)

      const [prodRes, vehRes] = await Promise.all([
        supabase.from('productos').select('id, codigo, nombre, es_retornable').order('nombre'),
        supabase.from('vehiculos').select('id, patente, marca, modelo').order('patente')
      ])

      if (prodRes.data) setProductos(prodRes.data)
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

  const resetForm = () => {
    setProductoId('')
    setCantidad(1)
    setVehiculoId('')
    setEstadoDestino('disponible')
    setObservaciones('')
  }

  const handleMovimiento = async () => {
    if (!productoId || cantidad <= 0) {
      Swal.fire({
        icon: 'warning',
        title: 'Datos incompletos',
        text: 'Selecciona un producto y una cantidad válida'
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

    try {
      const { data: userData } = await supabase.auth.getUser()

      // Llamar a la función de Supabase para procesar el movimiento
      const { error } = await (supabase.rpc as any)('procesar_movimiento_inventario', {
        p_producto_id: productoId,
        p_tipo_movimiento: tipoMovimiento,
        p_cantidad: cantidad,
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
          {/* Producto */}
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>
              Producto *
            </label>
            <select
              value={productoId}
              onChange={(e) => setProductoId(e.target.value)}
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #D1D5DB',
                borderRadius: '8px',
                fontSize: '14px'
              }}
            >
              <option value="">Seleccionar producto...</option>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.codigo} - {p.nombre} ({p.es_retornable ? 'Herramienta' : 'Repuesto'})
                </option>
              ))}
            </select>
          </div>

          {/* Cantidad */}
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

          {/* Vehículo (solo para devolución) */}
          {tipoMovimiento === 'devolucion' && (
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
                  No hay vehículos disponibles
                </p>
              )}
            </div>
          )}

          {/* Estado destino (solo para devolución) */}
          {tipoMovimiento === 'devolucion' && (
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

          {/* Observaciones */}
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
                <strong>Nota:</strong> La salida reduce el stock disponible permanentemente. Úsalo para consumo de repuestos.
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
