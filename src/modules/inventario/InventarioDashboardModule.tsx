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
import './InventarioDashboard.css'

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
      <div className="dt-loading">
        <div className="dt-loading-spinner"></div>
        <span>Cargando inventario...</span>
      </div>
    )
  }

  return (
    <div className="module-container">
      {/* Header */}
      <div className="module-header">
        <h1 className="module-title">Dashboard de Inventario</h1>
        <p className="module-subtitle">Vista general del stock y movimientos</p>
      </div>

      {/* Filtros */}
      <div className="inv-filters">
        <button
          onClick={() => setFilter('all')}
          className={`inv-filter-btn ${filter === 'all' ? 'active' : ''}`}
        >
          Todos ({stockProductos.length})
        </button>
        <button
          onClick={() => setFilter('herramientas')}
          className={`inv-filter-btn ${filter === 'herramientas' ? 'active' : ''}`}
        >
          <Wrench size={16} />
          Herramientas ({stockProductos.filter(p => p.es_retornable).length})
        </button>
        <button
          onClick={() => setFilter('repuestos')}
          className={`inv-filter-btn ${filter === 'repuestos' ? 'active' : ''}`}
        >
          <Package size={16} />
          Repuestos ({stockProductos.filter(p => !p.es_retornable).length})
        </button>
      </div>

      {/* Cards de Resumen */}
      <div className="inv-summary-grid">
        <div className="inv-summary-card">
          <div className="inv-summary-content">
            <div className="inv-summary-icon total">
              <Package size={22} />
            </div>
            <div>
              <p className="inv-summary-label">Stock Total</p>
              <p className="inv-summary-value total">{totales.total}</p>
            </div>
          </div>
        </div>

        <div className="inv-summary-card">
          <div className="inv-summary-content">
            <div className="inv-summary-icon disponible">
              <CheckCircle size={22} />
            </div>
            <div>
              <p className="inv-summary-label">Disponible</p>
              <p className="inv-summary-value disponible">{totales.disponible}</p>
            </div>
          </div>
        </div>

        <div className="inv-summary-card">
          <div className="inv-summary-content">
            <div className="inv-summary-icon en-uso">
              <Activity size={22} />
            </div>
            <div>
              <p className="inv-summary-label">En Uso</p>
              <p className="inv-summary-value en-uso">{totales.en_uso}</p>
            </div>
          </div>
        </div>

        <div className="inv-summary-card">
          <div className="inv-summary-content">
            <div className="inv-summary-icon en-transito">
              <Truck size={22} />
            </div>
            <div>
              <p className="inv-summary-label">En Tránsito</p>
              <p className="inv-summary-value en-transito">{totales.en_transito}</p>
            </div>
          </div>
        </div>

        <div className="inv-summary-card">
          <div className="inv-summary-content">
            <div className="inv-summary-icon dañado">
              <AlertTriangle size={22} />
            </div>
            <div>
              <p className="inv-summary-label">Dañado</p>
              <p className="inv-summary-value dañado">{totales.dañado}</p>
            </div>
          </div>
        </div>

        <div className="inv-summary-card">
          <div className="inv-summary-content">
            <div className="inv-summary-icon perdido">
              <XCircle size={22} />
            </div>
            <div>
              <p className="inv-summary-label">Perdido</p>
              <p className="inv-summary-value perdido">{totales.perdido}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabla de Productos - Usando clases de DataTable */}
      <div className="dt-container">
        <div className="inv-table-header">
          <h2 className="inv-table-title">Stock por Producto</h2>
        </div>
        <div className="dt-table-wrapper">
          <table className="dt-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Producto</th>
                <th>Tipo</th>
                <th style={{ textAlign: 'center' }}>Total</th>
                <th style={{ textAlign: 'center' }}>Disponible</th>
                <th style={{ textAlign: 'center' }}>En Uso</th>
                <th style={{ textAlign: 'center' }}>En Tránsito</th>
                <th style={{ textAlign: 'center' }}>Dañado</th>
                <th style={{ textAlign: 'center' }}>Perdido</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((item) => (
                <tr key={item.id}>
                  <td className="inv-codigo">{item.codigo}</td>
                  <td className="inv-nombre">{item.nombre}</td>
                  <td>
                    <span className={`inv-tipo-badge ${item.es_retornable ? 'herramienta' : 'repuesto'}`}>
                      {item.es_retornable ? 'Herramienta' : 'Repuesto'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }} className="inv-total">{item.stock_total}</td>
                  <td style={{ textAlign: 'center' }} className="inv-disponible">{item.disponible}</td>
                  <td style={{ textAlign: 'center' }} className="inv-en-uso">{item.en_uso}</td>
                  <td style={{ textAlign: 'center' }} className="inv-en-transito">{item.en_transito}</td>
                  <td style={{ textAlign: 'center' }} className="inv-dañado">{item.dañado}</td>
                  <td style={{ textAlign: 'center' }} className="inv-perdido">{item.perdido}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
