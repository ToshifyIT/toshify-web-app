import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import {
  Package,
  Truck,
  AlertTriangle,
  XCircle,
  Wrench,
  CheckCircle,
  Activity,
  Settings,
  Droplets,
  Bell
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
  categoria_codigo?: string
  stock_total: number
  disponible: number
  en_uso: number
  en_transito: number
  dañado: number
  perdido: number
  stock_minimo?: number
  alerta_reposicion?: number
}

type FilterCategoria = 'all' | 'maquinaria' | 'herramientas' | 'repuestos' | 'insumos' | 'alerta'

export function InventarioDashboardModule() {
  const [stockProductos, setStockProductos] = useState<StockProducto[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterCategoria>('all')

  useEffect(() => {
    loadStockData()
  }, [])

  const loadStockData = async () => {
    try {
      setLoading(true)
      // Cargar vista de stock con datos de productos para stock_minimo
      const [stockRes, productosRes] = await Promise.all([
        supabase.from('v_stock_productos').select('*').order('nombre'),
        supabase.from('productos').select('id, stock_minimo, alerta_reposicion, categorias(codigo)')
      ])

      if (stockRes.error) throw stockRes.error

      // Combinar datos de stock con datos de productos
      const productosMap = new Map<string, { stock_minimo: number; alerta_reposicion: number; categoria_codigo: string }>()
      if (productosRes.data) {
        productosRes.data.forEach((p: any) => {
          productosMap.set(p.id, {
            stock_minimo: p.stock_minimo || 0,
            alerta_reposicion: p.alerta_reposicion || 0,
            categoria_codigo: p.categorias?.codigo || ''
          })
        })
      }

      const dataConStock = (stockRes.data || []).map((item: any) => {
        const productoInfo = productosMap.get(item.id) || { stock_minimo: 0, alerta_reposicion: 0, categoria_codigo: '' }
        return {
          ...item,
          stock_minimo: productoInfo.stock_minimo,
          alerta_reposicion: productoInfo.alerta_reposicion,
          categoria_codigo: productoInfo.categoria_codigo
        }
      })

      setStockProductos(dataConStock)
    } catch (err: any) {
      console.error('Error cargando stock:', err)
    } finally {
      setLoading(false)
    }
  }

  // Contar productos con alerta de stock bajo
  const productosConAlerta = stockProductos.filter((item) => {
    const stockMinimo = item.stock_minimo || 0
    return stockMinimo > 0 && item.disponible <= stockMinimo
  })

  // Contar por categoría
  const conteosPorCategoria = {
    maquinaria: stockProductos.filter(p => p.categoria_codigo === 'maquinaria').length,
    herramientas: stockProductos.filter(p => p.categoria_codigo === 'herramientas' || p.es_retornable).length,
    repuestos: stockProductos.filter(p => p.categoria_codigo === 'repuestos' || (!p.es_retornable && p.categoria_codigo !== 'insumos' && p.categoria_codigo !== 'maquinaria')).length,
    insumos: stockProductos.filter(p => p.categoria_codigo === 'insumos').length,
  }

  const filteredData = stockProductos.filter((item) => {
    if (filter === 'herramientas') return item.categoria_codigo === 'herramientas' || item.es_retornable
    if (filter === 'repuestos') return item.categoria_codigo === 'repuestos' || (!item.es_retornable && item.categoria_codigo !== 'insumos' && item.categoria_codigo !== 'maquinaria')
    if (filter === 'maquinaria') return item.categoria_codigo === 'maquinaria'
    if (filter === 'insumos') return item.categoria_codigo === 'insumos'
    if (filter === 'alerta') {
      const stockMinimo = item.stock_minimo || 0
      return stockMinimo > 0 && item.disponible <= stockMinimo
    }
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
        cell: ({ row, getValue }) => {
          const disponible = getValue() as number
          const stockMinimo = row.original.stock_minimo || 0
          const tieneAlerta = stockMinimo > 0 && disponible <= stockMinimo
          return (
            <span className={`inv-disponible ${tieneAlerta ? 'con-alerta' : ''}`}>
              {tieneAlerta && <AlertTriangle size={14} className="alerta-icon" />}
              {disponible}
            </span>
          )
        },
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
    <div className="inv-module">
      {/* Cards de Categorías Clickeables */}
      <div className="inv-category-cards">
        <button
          onClick={() => setFilter('all')}
          className={`inv-category-card ${filter === 'all' ? 'active' : ''}`}
        >
          <Package size={20} className="inv-cat-icon" />
          <div className="inv-cat-info">
            <span className="inv-cat-count">{stockProductos.length}</span>
            <span className="inv-cat-label">Todos</span>
          </div>
        </button>
        <button
          onClick={() => setFilter('maquinaria')}
          className={`inv-category-card ${filter === 'maquinaria' ? 'active' : ''}`}
        >
          <Settings size={20} className="inv-cat-icon" />
          <div className="inv-cat-info">
            <span className="inv-cat-count">{conteosPorCategoria.maquinaria}</span>
            <span className="inv-cat-label">Maquinaria</span>
          </div>
        </button>
        <button
          onClick={() => setFilter('herramientas')}
          className={`inv-category-card ${filter === 'herramientas' ? 'active' : ''}`}
        >
          <Wrench size={20} className="inv-cat-icon" />
          <div className="inv-cat-info">
            <span className="inv-cat-count">{conteosPorCategoria.herramientas}</span>
            <span className="inv-cat-label">Herramientas</span>
          </div>
        </button>
        <button
          onClick={() => setFilter('repuestos')}
          className={`inv-category-card ${filter === 'repuestos' ? 'active' : ''}`}
        >
          <Package size={20} className="inv-cat-icon" />
          <div className="inv-cat-info">
            <span className="inv-cat-count">{conteosPorCategoria.repuestos}</span>
            <span className="inv-cat-label">Repuestos</span>
          </div>
        </button>
        <button
          onClick={() => setFilter('insumos')}
          className={`inv-category-card ${filter === 'insumos' ? 'active' : ''}`}
        >
          <Droplets size={20} className="inv-cat-icon" />
          <div className="inv-cat-info">
            <span className="inv-cat-count">{conteosPorCategoria.insumos}</span>
            <span className="inv-cat-label">Insumos</span>
          </div>
        </button>
        <button
          onClick={() => setFilter('alerta')}
          className={`inv-category-card alerta ${filter === 'alerta' ? 'active' : ''}`}
        >
          <Bell size={20} className="inv-cat-icon" />
          <div className="inv-cat-info">
            <span className="inv-cat-count">{productosConAlerta.length}</span>
            <span className="inv-cat-label">Stock Bajo</span>
          </div>
        </button>
      </div>

      {/* Stats Cards - Estilo Bitacora */}
      <div className="inv-stats">
        <div className="inv-stats-grid">
          <div className="stat-card">
            <Package size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{totales.total}</span>
              <span className="stat-label">Stock Total</span>
            </div>
          </div>
          <div className="stat-card">
            <CheckCircle size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{totales.disponible}</span>
              <span className="stat-label">Disponible</span>
            </div>
          </div>
          <div className="stat-card">
            <Activity size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{totales.en_uso}</span>
              <span className="stat-label">En Uso</span>
            </div>
          </div>
          <div className="stat-card">
            <Truck size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{totales.en_transito}</span>
              <span className="stat-label">En Tránsito</span>
            </div>
          </div>
          <div className="stat-card">
            <AlertTriangle size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{totales.dañado}</span>
              <span className="stat-label">Dañado</span>
            </div>
          </div>
          <div className="stat-card">
            <XCircle size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{totales.perdido}</span>
              <span className="stat-label">Perdido</span>
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
