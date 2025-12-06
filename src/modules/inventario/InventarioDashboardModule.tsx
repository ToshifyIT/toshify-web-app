import { useEffect, useState, useMemo } from 'react'
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
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../../components/ui/DataTable'
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

  // Definir columnas para TanStack Table
  const columns = useMemo<ColumnDef<StockProducto>[]>(
    () => [
      {
        accessorKey: 'codigo',
        header: 'Código',
        cell: ({ getValue }) => (
          <span className="inv-codigo">{getValue() as string}</span>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'nombre',
        header: 'Producto',
        cell: ({ getValue }) => (
          <span className="inv-nombre">{getValue() as string}</span>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'es_retornable',
        header: 'Tipo',
        cell: ({ getValue }) => {
          const esRetornable = getValue() as boolean
          return (
            <span className={`inv-tipo-badge ${esRetornable ? 'herramienta' : 'repuesto'}`}>
              {esRetornable ? 'Herramienta' : 'Repuesto'}
            </span>
          )
        },
        enableSorting: true,
      },
      {
        accessorKey: 'stock_total',
        header: 'Total',
        cell: ({ getValue }) => (
          <span className="inv-total">{getValue() as number}</span>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'disponible',
        header: 'Disponible',
        cell: ({ getValue }) => (
          <span className="inv-disponible">{getValue() as number}</span>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'en_uso',
        header: 'En Uso',
        cell: ({ getValue }) => (
          <span className="inv-en-uso">{getValue() as number}</span>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'en_transito',
        header: 'En Tránsito',
        cell: ({ getValue }) => (
          <span className="inv-en-transito">{getValue() as number}</span>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'dañado',
        header: 'Dañado',
        cell: ({ getValue }) => (
          <span className="inv-dañado">{getValue() as number}</span>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'perdido',
        header: 'Perdido',
        cell: ({ getValue }) => (
          <span className="inv-perdido">{getValue() as number}</span>
        ),
        enableSorting: true,
      },
    ],
    []
  )

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

      {/* Tabla con DataTable - sorting y paginación */}
      <DataTable
        data={filteredData}
        columns={columns}
        loading={loading}
        searchPlaceholder="Buscar por código o producto..."
        emptyIcon={<Package size={64} />}
        emptyTitle="No hay productos en inventario"
        emptyDescription=""
        showSearch={true}
        showPagination={true}
        pageSize={20}
      />
    </div>
  )
}
