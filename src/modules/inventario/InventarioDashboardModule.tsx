import { useEffect, useState, useMemo, useRef } from 'react'
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
  Filter
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
  unidad_medida?: string
  stock_total: number
  disponible: number
  en_uso: number
  en_transito: number
  dañado: number
  perdido: number
  stock_minimo?: number
  alerta_reposicion?: number
}

type FilterCategoria = 'all' | 'maquinaria' | 'herramientas' | 'repuestos' | 'insumos'

export function InventarioDashboardModule() {
  const [stockProductos, setStockProductos] = useState<StockProducto[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterCategoria>('all')

  // Excel-style column filter states
  const [openColumnFilter, setOpenColumnFilter] = useState<string | null>(null)
  const [codigoFilter, setCodigoFilter] = useState<string[]>([])
  const [nombreFilter, setNombreFilter] = useState<string[]>([])
  const [tipoFilter, setTipoFilter] = useState<string[]>([])
  const [categoriaFilter] = useState<string[]>([])
  const filterRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadStockData()
  }, [])

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

  const loadStockData = async () => {
    try {
      setLoading(true)
      // Cargar vista de stock con datos de productos para stock_minimo y unidad_medida
      const [stockRes, productosRes] = await Promise.all([
        supabase.from('v_stock_productos').select('*').order('nombre'),
        supabase.from('productos').select('id, stock_minimo, alerta_reposicion, categorias(codigo), unidades_medida(descripcion)')
      ])

      if (stockRes.error) throw stockRes.error

      // Combinar datos de stock con datos de productos
      const productosMap = new Map<string, { stock_minimo: number; alerta_reposicion: number; categoria_codigo: string; unidad_medida: string }>()
      if (productosRes.data) {
        productosRes.data.forEach((p: any) => {
          productosMap.set(p.id, {
            stock_minimo: p.stock_minimo || 0,
            alerta_reposicion: p.alerta_reposicion || 0,
            categoria_codigo: p.categorias?.codigo || '',
            unidad_medida: p.unidades_medida?.descripcion || 'Uds'
          })
        })
      }

      const dataConStock = (stockRes.data || []).map((item: any) => {
        const productoInfo = productosMap.get(item.id) || { stock_minimo: 0, alerta_reposicion: 0, categoria_codigo: '', unidad_medida: 'Uds' }
        return {
          ...item,
          stock_minimo: productoInfo.stock_minimo,
          alerta_reposicion: productoInfo.alerta_reposicion,
          categoria_codigo: productoInfo.categoria_codigo,
          unidad_medida: productoInfo.unidad_medida
        }
      })

      setStockProductos(dataConStock)
    } catch (err: any) {
      console.error('Error cargando stock:', err)
    } finally {
      setLoading(false)
    }
  }

  // Helper: verificar si producto tiene stock (disponible + en_uso + en_transito > 0)
  const tieneStock = (p: StockProducto) => (p.disponible + p.en_uso + p.en_transito) > 0

  // Solo productos con stock para conteos y tabla
  const productosConStock = stockProductos.filter(tieneStock)

  // Contar por categoría (solo productos con stock)
  const conteosPorCategoria = {
    maquinaria: productosConStock.filter(p => p.categoria_codigo === 'maquinaria').length,
    herramientas: productosConStock.filter(p => p.categoria_codigo === 'herramientas' || p.es_retornable).length,
    repuestos: productosConStock.filter(p => p.categoria_codigo === 'repuestos' || (!p.es_retornable && p.categoria_codigo !== 'insumos' && p.categoria_codigo !== 'maquinaria')).length,
    insumos: productosConStock.filter(p => p.categoria_codigo === 'insumos').length,
  }

  const categoryFilteredData = productosConStock.filter((item) => {
    if (filter === 'herramientas') return item.categoria_codigo === 'herramientas' || item.es_retornable
    if (filter === 'repuestos') return item.categoria_codigo === 'repuestos' || (!item.es_retornable && item.categoria_codigo !== 'insumos' && item.categoria_codigo !== 'maquinaria')
    if (filter === 'maquinaria') return item.categoria_codigo === 'maquinaria'
    if (filter === 'insumos') return item.categoria_codigo === 'insumos'
    return true
  })

  // Unique value lists for filters
  const uniqueCodigos = useMemo(() =>
    [...new Set(categoryFilteredData.map(p => p.codigo))].filter(Boolean) as string[],
    [categoryFilteredData]
  )
  const uniqueNombres = useMemo(() =>
    [...new Set(categoryFilteredData.map(p => p.nombre))].filter(Boolean) as string[],
    [categoryFilteredData]
  )
  const uniqueTipos = useMemo(() =>
    [...new Set(categoryFilteredData.map(p => p.es_retornable ? 'Herramienta' : 'Repuesto'))],
    [categoryFilteredData]
  )
  // Toggle functions
  const toggleCodigoFilter = (value: string) => {
    setCodigoFilter(prev =>
      prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]
    )
  }
  const toggleNombreFilter = (value: string) => {
    setNombreFilter(prev =>
      prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]
    )
  }
  const toggleTipoFilter = (value: string) => {
    setTipoFilter(prev =>
      prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]
    )
  }
  // Final filtered data with column filters
  const filteredData = useMemo(() => {
    let data = categoryFilteredData
    if (codigoFilter.length > 0) {
      data = data.filter(p => codigoFilter.includes(p.codigo))
    }
    if (nombreFilter.length > 0) {
      data = data.filter(p => nombreFilter.includes(p.nombre))
    }
    if (tipoFilter.length > 0) {
      data = data.filter(p => {
        const tipo = p.es_retornable ? 'Herramienta' : 'Repuesto'
        return tipoFilter.includes(tipo)
      })
    }
    if (categoriaFilter.length > 0) {
      data = data.filter(p => p.categoria && categoriaFilter.includes(p.categoria))
    }
    return data
  }, [categoryFilteredData, codigoFilter, nombreFilter, tipoFilter, categoriaFilter])

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
        header: () => (
          <div className="dt-column-filter" ref={openColumnFilter === 'codigo' ? filterRef : null}>
            <span>Código {codigoFilter.length > 0 && `(${codigoFilter.length})`}</span>
            <button
              className={`dt-column-filter-btn ${codigoFilter.length > 0 ? 'active' : ''}`}
              onClick={(e) => { e.stopPropagation(); setOpenColumnFilter(openColumnFilter === 'codigo' ? null : 'codigo') }}
            >
              <Filter size={12} />
            </button>
            {openColumnFilter === 'codigo' && (
              <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
                <div className="dt-excel-filter-list">
                  {uniqueCodigos.map(codigo => (
                    <label key={codigo} className={`dt-column-filter-checkbox ${codigoFilter.includes(codigo) ? 'selected' : ''}`}>
                      <input type="checkbox" checked={codigoFilter.includes(codigo)} onChange={() => toggleCodigoFilter(codigo)} />
                      <span>{codigo}</span>
                    </label>
                  ))}
                </div>
                {codigoFilter.length > 0 && (
                  <button className="dt-column-filter-clear" onClick={() => setCodigoFilter([])}>
                    Limpiar ({codigoFilter.length})
                  </button>
                )}
              </div>
            )}
          </div>
        ),
        cell: ({ getValue }) => (
          <span className="inv-codigo">{getValue() as string}</span>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'nombre',
        header: () => (
          <div className="dt-column-filter" ref={openColumnFilter === 'nombre' ? filterRef : null}>
            <span>Producto {nombreFilter.length > 0 && `(${nombreFilter.length})`}</span>
            <button
              className={`dt-column-filter-btn ${nombreFilter.length > 0 ? 'active' : ''}`}
              onClick={(e) => { e.stopPropagation(); setOpenColumnFilter(openColumnFilter === 'nombre' ? null : 'nombre') }}
            >
              <Filter size={12} />
            </button>
            {openColumnFilter === 'nombre' && (
              <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
                <div className="dt-excel-filter-list">
                  {uniqueNombres.map(nombre => (
                    <label key={nombre} className={`dt-column-filter-checkbox ${nombreFilter.includes(nombre) ? 'selected' : ''}`}>
                      <input type="checkbox" checked={nombreFilter.includes(nombre)} onChange={() => toggleNombreFilter(nombre)} />
                      <span>{nombre}</span>
                    </label>
                  ))}
                </div>
                {nombreFilter.length > 0 && (
                  <button className="dt-column-filter-clear" onClick={() => setNombreFilter([])}>
                    Limpiar ({nombreFilter.length})
                  </button>
                )}
              </div>
            )}
          </div>
        ),
        cell: ({ getValue }) => (
          <span className="inv-nombre">{getValue() as string}</span>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'unidad_medida',
        header: 'Unidad',
        cell: ({ getValue }) => (
          <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{getValue() as string}</span>
        ),
        enableSorting: false,
      },
      {
        accessorKey: 'es_retornable',
        header: () => (
          <div className="dt-column-filter" ref={openColumnFilter === 'tipo' ? filterRef : null}>
            <span>Tipo {tipoFilter.length > 0 && `(${tipoFilter.length})`}</span>
            <button
              className={`dt-column-filter-btn ${tipoFilter.length > 0 ? 'active' : ''}`}
              onClick={(e) => { e.stopPropagation(); setOpenColumnFilter(openColumnFilter === 'tipo' ? null : 'tipo') }}
            >
              <Filter size={12} />
            </button>
            {openColumnFilter === 'tipo' && (
              <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
                <div className="dt-excel-filter-list">
                  {uniqueTipos.map(tipo => (
                    <label key={tipo} className={`dt-column-filter-checkbox ${tipoFilter.includes(tipo) ? 'selected' : ''}`}>
                      <input type="checkbox" checked={tipoFilter.includes(tipo)} onChange={() => toggleTipoFilter(tipo)} />
                      <span>{tipo}</span>
                    </label>
                  ))}
                </div>
                {tipoFilter.length > 0 && (
                  <button className="dt-column-filter-clear" onClick={() => setTipoFilter([])}>
                    Limpiar ({tipoFilter.length})
                  </button>
                )}
              </div>
            )}
          </div>
        ),
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
    [openColumnFilter, codigoFilter, nombreFilter, tipoFilter, uniqueCodigos, uniqueNombres, uniqueTipos]
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
            <span className="inv-cat-count">{productosConStock.length}</span>
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
      </div>

      {/* Stats Cards - Estilo Bitacora */}
      <div className="inv-stats">
        <div className="inv-stats-grid">
          <button className={`stat-card${filter === 'all' ? ' active' : ''}`} onClick={() => setFilter('all')}>
            <Package size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{filteredData.length}</span>
              <span className="stat-label">Productos</span>
            </div>
          </button>
          <button className="stat-card" onClick={() => setFilter('all')}>
            <CheckCircle size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{totales.disponible}</span>
              <span className="stat-label">Disponible</span>
            </div>
          </button>
          <button className="stat-card" onClick={() => setFilter('all')}>
            <Activity size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{totales.en_uso}</span>
              <span className="stat-label">En Uso</span>
            </div>
          </button>
          <button className="stat-card" onClick={() => setFilter('all')}>
            <Truck size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{totales.en_transito}</span>
              <span className="stat-label">En Tránsito</span>
            </div>
          </button>
          <button className="stat-card" onClick={() => setFilter('all')}>
            <AlertTriangle size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{totales.dañado}</span>
              <span className="stat-label">Dañado</span>
            </div>
          </button>
          <button className="stat-card" onClick={() => setFilter('all')}>
            <XCircle size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{totales.perdido}</span>
              <span className="stat-label">Perdido</span>
            </div>
          </button>
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
