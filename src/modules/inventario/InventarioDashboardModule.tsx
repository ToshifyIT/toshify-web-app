import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import {
  Package,
  Truck,
  AlertTriangle,
  XCircle,
  Wrench,
  CheckCircle,
  Activity
} from 'lucide-react'

interface StockProducto {
  id: string
  codigo: string
  nombre: string
  es_retornable: boolean
  categoria: string
  stock_total: number
  disponible: number
  en_uso: number
  en_transito: number
  dañado: number
  perdido: number
}

export function InventarioDashboardModule() {
  const [stockProductos, setStockProductos] = useState<StockProducto[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'herramientas' | 'repuestos'>('all')

  useEffect(() => {
    loadStockData()
  }, [])

  const loadStockData = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('v_stock_productos')
        .select('*')
        .order('nombre')

      if (error) throw error
      setStockProductos(data || [])
    } catch (err: any) {
      console.error('Error cargando stock:', err)
    } finally {
      setLoading(false)
    }
  }

  const filteredData = stockProductos.filter((item) => {
    if (filter === 'herramientas') return item.es_retornable
    if (filter === 'repuestos') return !item.es_retornable
    return true
  })

  // Calcular totales generales
  // Stock Total = Disponible + En Uso + En Tránsito (NO incluye dañado ni perdido)
  const totales = filteredData.reduce(
    (acc, item) => ({
      total: acc.total + item.disponible + item.en_uso + item.en_transito,
      disponible: acc.disponible + item.disponible,
      en_uso: acc.en_uso + item.en_uso,
      en_transito: acc.en_transito + item.en_transito,
      dañado: acc.dañado + item.dañado,
      perdido: acc.perdido + item.perdido
    }),
    { total: 0, disponible: 0, en_uso: 0, en_transito: 0, dañado: 0, perdido: 0 }
  )

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <p>Cargando inventario...</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#1F2937', marginBottom: '8px' }}>
          Dashboard de Inventario
        </h1>
        <p style={{ color: '#6B7280', fontSize: '14px' }}>
          Vista general del stock y movimientos
        </p>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
        <button
          onClick={() => setFilter('all')}
          style={{
            padding: '10px 20px',
            background: filter === 'all' ? '#DC2626' : 'white',
            color: filter === 'all' ? 'white' : '#6B7280',
            border: `2px solid ${filter === 'all' ? '#DC2626' : '#E5E7EB'}`,
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '14px'
          }}
        >
          Todos ({stockProductos.length})
        </button>
        <button
          onClick={() => setFilter('herramientas')}
          style={{
            padding: '10px 20px',
            background: filter === 'herramientas' ? '#DC2626' : 'white',
            color: filter === 'herramientas' ? 'white' : '#6B7280',
            border: `2px solid ${filter === 'herramientas' ? '#DC2626' : '#E5E7EB'}`,
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <Wrench size={16} />
          Herramientas ({stockProductos.filter(p => p.es_retornable).length})
        </button>
        <button
          onClick={() => setFilter('repuestos')}
          style={{
            padding: '10px 20px',
            background: filter === 'repuestos' ? '#DC2626' : 'white',
            color: filter === 'repuestos' ? 'white' : '#6B7280',
            border: `2px solid ${filter === 'repuestos' ? '#DC2626' : '#E5E7EB'}`,
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <Package size={16} />
          Repuestos ({stockProductos.filter(p => !p.es_retornable).length})
        </button>
      </div>

      {/* Cards de Resumen */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '32px' }}>
        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: '20px',
          border: '1px solid #E5E7EB',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{
              width: '48px',
              height: '48px',
              background: '#DBEAFE',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Package size={24} style={{ color: '#1E40AF' }} />
            </div>
            <div>
              <p style={{ fontSize: '12px', color: '#6B7280', fontWeight: 600 }}>Stock Total</p>
              <p style={{ fontSize: '24px', fontWeight: 700, color: '#1F2937' }}>{totales.total}</p>
            </div>
          </div>
        </div>

        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: '20px',
          border: '1px solid #E5E7EB',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{
              width: '48px',
              height: '48px',
              background: '#D1FAE5',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <CheckCircle size={24} style={{ color: '#059669' }} />
            </div>
            <div>
              <p style={{ fontSize: '12px', color: '#6B7280', fontWeight: 600 }}>Disponible</p>
              <p style={{ fontSize: '24px', fontWeight: 700, color: '#059669' }}>{totales.disponible}</p>
            </div>
          </div>
        </div>

        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: '20px',
          border: '1px solid #E5E7EB',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{
              width: '48px',
              height: '48px',
              background: '#FEF3C7',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Activity size={24} style={{ color: '#D97706' }} />
            </div>
            <div>
              <p style={{ fontSize: '12px', color: '#6B7280', fontWeight: 600 }}>En Uso</p>
              <p style={{ fontSize: '24px', fontWeight: 700, color: '#D97706' }}>{totales.en_uso}</p>
            </div>
          </div>
        </div>

        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: '20px',
          border: '1px solid #E5E7EB',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{
              width: '48px',
              height: '48px',
              background: '#E0E7FF',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Truck size={24} style={{ color: '#4F46E5' }} />
            </div>
            <div>
              <p style={{ fontSize: '12px', color: '#6B7280', fontWeight: 600 }}>En Tránsito</p>
              <p style={{ fontSize: '24px', fontWeight: 700, color: '#4F46E5' }}>{totales.en_transito}</p>
            </div>
          </div>
        </div>

        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: '20px',
          border: '1px solid #E5E7EB',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{
              width: '48px',
              height: '48px',
              background: '#FEE2E2',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <AlertTriangle size={24} style={{ color: '#DC2626' }} />
            </div>
            <div>
              <p style={{ fontSize: '12px', color: '#6B7280', fontWeight: 600 }}>Dañado</p>
              <p style={{ fontSize: '24px', fontWeight: 700, color: '#DC2626' }}>{totales.dañado}</p>
            </div>
          </div>
        </div>

        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: '20px',
          border: '1px solid #E5E7EB',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{
              width: '48px',
              height: '48px',
              background: '#F3F4F6',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <XCircle size={24} style={{ color: '#6B7280' }} />
            </div>
            <div>
              <p style={{ fontSize: '12px', color: '#6B7280', fontWeight: 600 }}>Perdido</p>
              <p style={{ fontSize: '24px', fontWeight: 700, color: '#6B7280' }}>{totales.perdido}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabla de Productos */}
      <div style={{ background: 'white', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid #E5E7EB' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1F2937' }}>
            Stock por Producto
          </h2>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F9FAFB', borderBottom: '2px solid #E5E7EB' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: '#374151', textTransform: 'uppercase' }}>
                  Código
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: '#374151', textTransform: 'uppercase' }}>
                  Producto
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: '#374151', textTransform: 'uppercase' }}>
                  Tipo
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: 700, color: '#374151', textTransform: 'uppercase' }}>
                  Total
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: 700, color: '#374151', textTransform: 'uppercase' }}>
                  Disponible
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: 700, color: '#374151', textTransform: 'uppercase' }}>
                  En Uso
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: 700, color: '#374151', textTransform: 'uppercase' }}>
                  En Tránsito
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: 700, color: '#374151', textTransform: 'uppercase' }}>
                  Dañado
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: 700, color: '#374151', textTransform: 'uppercase' }}>
                  Perdido
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
                  <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: 600, color: '#DC2626' }}>
                    {item.codigo}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: 500 }}>
                    {item.nombre}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '14px' }}>
                    <span style={{
                      padding: '4px 12px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: 600,
                      background: item.es_retornable ? '#FEF3C7' : '#DBEAFE',
                      color: item.es_retornable ? '#92400E' : '#1E40AF'
                    }}>
                      {item.es_retornable ? 'Herramienta' : 'Repuesto'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '16px', fontWeight: 700 }}>
                    {item.stock_total}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '14px', color: '#059669', fontWeight: 600 }}>
                    {item.disponible}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '14px', color: '#D97706', fontWeight: 600 }}>
                    {item.en_uso}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '14px', color: '#4F46E5', fontWeight: 600 }}>
                    {item.en_transito}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '14px', color: '#DC2626', fontWeight: 600 }}>
                    {item.dañado}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '14px', color: '#6B7280', fontWeight: 600 }}>
                    {item.perdido}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
