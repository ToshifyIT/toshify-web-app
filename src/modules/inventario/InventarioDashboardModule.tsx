import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { ExcelColumnFilter, useExcelFilters } from '../../components/ui/DataTable/ExcelColumnFilter'
import {
  Package,
  Truck,
  AlertTriangle,
  XCircle,
  Wrench,
  CheckCircle,
  Activity,
  Settings,
  Droplets
} from 'lucide-react'
import { type ColumnDef, type FilterFn } from '@tanstack/react-table'
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

type FilterEstadoStock = 'all' | 'disponible' | 'en_uso' | 'en_transito' | 'dañado' | 'perdido'

export function InventarioDashboardModule() {
  const [stockProductos, setStockProductos] = useState<StockProducto[]>([])
  const [loading, setLoading] = useState(true)
  const [filterEstadoStock, setFilterEstadoStock] = useState<FilterEstadoStock>('all')

  // Excel-style column filter states con Portal
  const { openFilterId, setOpenFilterId } = useExcelFilters()
  const [codigoFilter, setCodigoFilter] = useState<string[]>([])
  const [nombreFilter, setNombreFilter] = useState<string[]>([])
  const [tipoFilter, setTipoFilter] = useState<string[]>([])
  const [categoriaFilter] = useState<string[]>([])

  useEffect(() => {
    loadStockData()
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

  // Mostrar siempre todos los productos (las tarjetas de categoría solo muestran conteo, no filtran)
  const categoryFilteredData = productosConStock

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
  // Generar filtros externos para mostrar en la barra de filtros del DataTable
  const externalFilters = useMemo(() => {
    const filters: Array<{ id: string; label: string; onClear: () => void }> = []

    // Filtro de estado de stock
    if (filterEstadoStock !== 'all') {
      const labels: Record<string, string> = {
        disponible: 'Disponible',
        en_uso: 'En Uso',
        en_transito: 'En Tránsito',
        dañado: 'Dañado',
        perdido: 'Perdido'
      }
      filters.push({
        id: filterEstadoStock,
        label: labels[filterEstadoStock] || filterEstadoStock,
        onClear: () => setFilterEstadoStock('all')
      })
    }

    // Filtro de código
    if (codigoFilter.length > 0) {
      filters.push({
        id: 'codigo',
        label: `Código: ${codigoFilter.length === 1 ? codigoFilter[0] : `${codigoFilter.length} sel.`}`,
        onClear: () => setCodigoFilter([])
      })
    }

    // Filtro de nombre/producto
    if (nombreFilter.length > 0) {
      filters.push({
        id: 'nombre',
        label: `Producto: ${nombreFilter.length === 1 ? nombreFilter[0] : `${nombreFilter.length} sel.`}`,
        onClear: () => setNombreFilter([])
      })
    }

    // Filtro de tipo
    if (tipoFilter.length > 0) {
      filters.push({
        id: 'tipo',
        label: `Tipo: ${tipoFilter.length === 1 ? tipoFilter[0] : `${tipoFilter.length} sel.`}`,
        onClear: () => setTipoFilter([])
      })
    }

    return filters
  }, [filterEstadoStock, codigoFilter, nombreFilter, tipoFilter])

  // Filtro global personalizado para buscar términos en todos los campos relevantes
  const customGlobalFilter = useMemo<FilterFn<StockProducto>>(() => {
    return (row, _columnId, filterValue) => {
      if (!filterValue || typeof filterValue !== 'string') return true
      
      const searchLower = filterValue.toLowerCase().trim()
      const data = row.original

      // Construir un string con todos los datos relevantes para la búsqueda
      const searchableText = [
        data.codigo,
        data.nombre,
        data.unidad_medida,
        data.categoria,
        // Incluir "Herramienta" o "Repuesto" basado en es_retornable
        data.es_retornable ? 'Herramienta' : 'Repuesto',
        // También incluimos los valores numéricos por si acaso
        String(data.stock_total),
        String(data.disponible)
      ].filter(Boolean).join(' ').toLowerCase()

      // Buscar término completo
      if (searchableText.includes(searchLower)) return true
      
      // Buscar por palabras individuales
      const words = searchLower.split(/\s+/).filter(w => w.length > 0)
      if (words.length > 1) {
        return words.every(word => searchableText.includes(word))
      }
      
      return false
    }
  }, [])

  // Final filtered data - STAT CARD PREVALECE sobre filtros de columna
  const filteredData = useMemo(() => {
    let data = categoryFilteredData

    // Si hay stat card de estado activo, SOLO aplicar ese filtro (ignorar filtros de columna)
    if (filterEstadoStock !== 'all') {
      return categoryFilteredData.filter(p => {
        switch (filterEstadoStock) {
          case 'disponible': return p.disponible > 0
          case 'en_uso': return p.en_uso > 0
          case 'en_transito': return p.en_transito > 0
          case 'dañado': return p.dañado > 0
          case 'perdido': return p.perdido > 0
          default: return true
        }
      })
    }

    // Sin stat card activo → aplicar filtros de columna
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
  }, [categoryFilteredData, codigoFilter, nombreFilter, tipoFilter, categoriaFilter, filterEstadoStock])

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
        size: 120,
        header: () => (
          <ExcelColumnFilter
            label="Codigo"
            options={uniqueCodigos}
            selectedValues={codigoFilter}
            onSelectionChange={setCodigoFilter}
            filterId="inv_codigo"
            openFilterId={openFilterId}
            onOpenChange={setOpenFilterId}
          />
        ),
        cell: ({ getValue }) => (
          <span className="inv-codigo">{getValue() as string}</span>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'nombre',
        size: 300,
        header: () => (
          <ExcelColumnFilter
            label="Producto"
            options={uniqueNombres}
            selectedValues={nombreFilter}
            onSelectionChange={setNombreFilter}
            filterId="inv_nombre"
            openFilterId={openFilterId}
            onOpenChange={setOpenFilterId}
          />
        ),
        cell: ({ getValue }) => (
          <span className="inv-nombre">{getValue() as string}</span>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'unidad_medida',
        size: 80,
        header: 'Unidad',
        cell: ({ getValue }) => (
          <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{getValue() as string}</span>
        ),
        enableSorting: false,
      },
      {
        accessorKey: 'es_retornable',
        size: 130,
        header: () => (
          <ExcelColumnFilter
            label="Tipo"
            options={uniqueTipos}
            selectedValues={tipoFilter}
            onSelectionChange={setTipoFilter}
            filterId="inv_tipo"
            openFilterId={openFilterId}
            onOpenChange={setOpenFilterId}
          />
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
        size: 80,
        header: 'Total',
        cell: ({ getValue }) => (
          <span className="inv-total">{getValue() as number}</span>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'disponible',
        size: 100,
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
        size: 80,
        header: 'En Uso',
        cell: ({ getValue }) => (
          <span className="inv-en-uso">{getValue() as number}</span>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'en_transito',
        size: 100,
        header: 'En Tránsito',
        cell: ({ getValue }) => (
          <span className="inv-en-transito">{getValue() as number}</span>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'dañado',
        size: 80,
        header: 'Dañado',
        cell: ({ getValue }) => (
          <span className="inv-dañado">{getValue() as number}</span>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'perdido',
        size: 80,
        header: 'Perdido',
        cell: ({ getValue }) => (
          <span className="inv-perdido">{getValue() as number}</span>
        ),
        enableSorting: true,
      },
    ],
    [uniqueCodigos, codigoFilter, uniqueNombres, nombreFilter, uniqueTipos, tipoFilter, openFilterId]
  )

  return (
    <div className="inv-module">
      {/* Cards de Categorías Clickeables */}
      {/* Tarjetas de categoría - Solo muestran conteo, no filtran */}
      <div className="inv-category-cards">
        <div className="inv-category-card">
          <Package size={20} className="inv-cat-icon" />
          <div className="inv-cat-info">
            <span className="inv-cat-count">{productosConStock.length}</span>
            <span className="inv-cat-label">Todos</span>
          </div>
        </div>
        <div className="inv-category-card">
          <Settings size={20} className="inv-cat-icon" />
          <div className="inv-cat-info">
            <span className="inv-cat-count">{conteosPorCategoria.maquinaria}</span>
            <span className="inv-cat-label">Maquinaria</span>
          </div>
        </div>
        <div className="inv-category-card">
          <Wrench size={20} className="inv-cat-icon" />
          <div className="inv-cat-info">
            <span className="inv-cat-count">{conteosPorCategoria.herramientas}</span>
            <span className="inv-cat-label">Herramientas</span>
          </div>
        </div>
        <div className="inv-category-card">
          <Package size={20} className="inv-cat-icon" />
          <div className="inv-cat-info">
            <span className="inv-cat-count">{conteosPorCategoria.repuestos}</span>
            <span className="inv-cat-label">Repuestos</span>
          </div>
        </div>
        <div className="inv-category-card">
          <Droplets size={20} className="inv-cat-icon" />
          <div className="inv-cat-info">
            <span className="inv-cat-count">{conteosPorCategoria.insumos}</span>
            <span className="inv-cat-label">Insumos</span>
          </div>
        </div>
      </div>

      {/* Stats Cards - Estado de Stock (clickeables como filtros) */}
      <div className="inv-stats">
        <div className="inv-stats-grid">
          <button
            className={`stat-card${filterEstadoStock === 'all' ? ' active' : ''}`}
            onClick={() => setFilterEstadoStock(filterEstadoStock === 'all' ? 'all' : 'all')}
          >
            <Package size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{categoryFilteredData.length}</span>
              <span className="stat-label">Productos</span>
            </div>
          </button>
          <button
            className={`stat-card${filterEstadoStock === 'disponible' ? ' active' : ''}`}
            onClick={() => setFilterEstadoStock(filterEstadoStock === 'disponible' ? 'all' : 'disponible')}
          >
            <CheckCircle size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{totales.disponible}</span>
              <span className="stat-label">Disponible</span>
            </div>
          </button>
          <button
            className={`stat-card${filterEstadoStock === 'en_uso' ? ' active' : ''}`}
            onClick={() => setFilterEstadoStock(filterEstadoStock === 'en_uso' ? 'all' : 'en_uso')}
          >
            <Activity size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{totales.en_uso}</span>
              <span className="stat-label">En Uso</span>
            </div>
          </button>
          <button
            className={`stat-card${filterEstadoStock === 'en_transito' ? ' active' : ''}`}
            onClick={() => setFilterEstadoStock(filterEstadoStock === 'en_transito' ? 'all' : 'en_transito')}
          >
            <Truck size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{totales.en_transito}</span>
              <span className="stat-label">En Tránsito</span>
            </div>
          </button>
          <button
            className={`stat-card${filterEstadoStock === 'dañado' ? ' active' : ''}`}
            onClick={() => setFilterEstadoStock(filterEstadoStock === 'dañado' ? 'all' : 'dañado')}
          >
            <AlertTriangle size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{totales.dañado}</span>
              <span className="stat-label">Dañado</span>
            </div>
          </button>
          <button
            className={`stat-card${filterEstadoStock === 'perdido' ? ' active' : ''}`}
            onClick={() => setFilterEstadoStock(filterEstadoStock === 'perdido' ? 'all' : 'perdido')}
          >
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
pageSize={100}
        pageSizeOptions={[10, 20, 50, 100]}
        externalFilters={externalFilters}
        onClearAllFilters={() => {
          // Limpiar filtros de columna
          setCodigoFilter([])
          setNombreFilter([])
          setTipoFilter([])
          // Limpiar stat card de estado
          setFilterEstadoStock('all')
        }}
        globalFilterFn={customGlobalFilter}
      />
    </div>
  )
}
