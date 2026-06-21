import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { LoadingOverlay } from '../../components/ui/LoadingOverlay'
import { ExcelColumnFilter, useExcelFilters } from '../../components/ui/DataTable/ExcelColumnFilter'
import { useSede } from '../../contexts/SedeContext'
import {
  Package,
  AlertTriangle,
  XCircle,
  Wrench,
  CheckCircle,
  Activity,
  Settings,
  Droplets,
  ArrowRight
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
  dañado: number
  perdido: number
  stock_minimo?: number
  alerta_reposicion?: number
}

type FilterEstadoStock = 'all' | 'disponible' | 'en_uso' | 'dañado' | 'perdido'

interface PendientesOperativos {
  entradasTransito: number
  pedidosTransito: number
  pedidosVencidos: number
  movimientosPendientes: number
}

const formatProductosLabel = (cantidad: number, detalle: string) =>
  `${cantidad} producto${cantidad === 1 ? '' : 's'} ${detalle}`

export function InventarioDashboardModule() {
  const navigate = useNavigate()
  const { sedeActualId } = useSede()
  const [stockProductos, setStockProductos] = useState<StockProducto[]>([])
  const [pendientes, setPendientes] = useState<PendientesOperativos>({
    entradasTransito: 0,
    pedidosTransito: 0,
    pedidosVencidos: 0,
    movimientosPendientes: 0
  })
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
  }, [sedeActualId])


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

      const [entradasRes, pedidosRes, movimientosRes] = await Promise.allSettled([
        supabase.from('v_entradas_en_transito').select('id, created_at'),
        supabase.from('v_pedidos_en_transito').select('pedido_id, fecha_estimada_llegada'),
        supabase.from('v_movimientos_pendientes').select('id, created_at')
      ])

      const entradasData = entradasRes.status === 'fulfilled' && !entradasRes.value.error
        ? entradasRes.value.data || []
        : []
      const pedidosData = pedidosRes.status === 'fulfilled' && !pedidosRes.value.error
        ? pedidosRes.value.data || []
        : []
      const movimientosData = movimientosRes.status === 'fulfilled' && !movimientosRes.value.error
        ? movimientosRes.value.data || []
        : []
      const pedidosUnicos = new Set((pedidosData as any[]).map(p => p.pedido_id).filter(Boolean))
      const hoy = new Date()
      hoy.setHours(0, 0, 0, 0)
      const pedidosVencidos = new Set(
        (pedidosData as any[])
          .filter(p => {
            if (!p.fecha_estimada_llegada) return false
            const fecha = new Date(p.fecha_estimada_llegada)
            fecha.setHours(0, 0, 0, 0)
            return fecha < hoy
          })
          .map(p => p.pedido_id)
          .filter(Boolean)
      )

      setPendientes({
        entradasTransito: entradasData.length,
        pedidosTransito: pedidosUnicos.size,
        pedidosVencidos: pedidosVencidos.size,
        movimientosPendientes: movimientosData.length
      })
    } catch {
      // silently ignored
    } finally {
      setLoading(false)
    }
  }

  // Helper: verificar si producto tiene stock (disponible + en_uso > 0)
  const tieneStock = (p: StockProducto) => (p.disponible + p.en_uso) > 0

  // Solo productos con stock para conteos y tabla
  const productosConStock = stockProductos.filter(tieneStock)
  const productosBajoMinimo = useMemo(() =>
    productosConStock.filter(p => (p.stock_minimo || 0) > 0 && p.disponible <= (p.stock_minimo || 0)),
    [productosConStock]
  )
  const productosSinCierre = useMemo(() =>
    productosConStock.filter(p => p.dañado > 0 || p.perdido > 0),
    [productosConStock]
  )
  const accionesOperativas = useMemo(() => {
    const acciones: Array<{
      id: string
      severidad: 'critico' | 'atencion' | 'info'
      titulo: string
      detalle: string
      accion: string
      destino: string
    }> = []

    if (productosBajoMinimo.length > 0) {
      const productoCritico = productosBajoMinimo[0]
      const plural = productosBajoMinimo.length > 1
      acciones.push({
        id: 'bajo-minimo',
        severidad: 'critico',
        titulo: `${productosBajoMinimo.length} producto${plural ? 's' : ''} por reponer`,
        detalle: `Stock por debajo del mínimo. Ej: ${productoCritico.codigo} ${productoCritico.nombre}: quedan ${productoCritico.disponible}, mínimo ${productoCritico.stock_minimo || 0}. Hacé un pedido al proveedor.`,
        accion: 'Crear pedido',
        destino: '/logistica/inventario/pedidos?tab=nuevo'
      })
    }

    if (pendientes.pedidosVencidos > 0) {
      const plural = pendientes.pedidosVencidos > 1
      acciones.push({
        id: 'pedidos-vencidos',
        severidad: 'critico',
        titulo: `${pendientes.pedidosVencidos} pedido${plural ? 's' : ''} atrasado${plural ? 's' : ''}`,
        detalle: `Pedido${plural ? 's' : ''} a proveedor que ya pasó su fecha estimada de llegada. Revisá la recepción o reclamá al proveedor.`,
        accion: 'Ver pedidos',
        destino: '/logistica/inventario/pedidos?tab=pedidos'
      })
    }

    if (pendientes.entradasTransito + pendientes.pedidosTransito > 0) {
      const total = pendientes.entradasTransito + pendientes.pedidosTransito
      const plural = total > 1
      acciones.push({
        id: 'recepciones',
        severidad: 'atencion',
        titulo: `${total} pedido${plural ? 's' : ''} por recibir`,
        detalle: `Mercadería que llegó o está por llegar y falta ingresar al stock. Generá la entrada para sumarla al inventario.`,
        accion: 'Recepcionar',
        destino: '/logistica/inventario/pedidos?tab=pedidos'
      })
    }

    if (pendientes.movimientosPendientes > 0) {
      const plural = pendientes.movimientosPendientes > 1
      acciones.push({
        id: 'aprobaciones',
        severidad: 'info',
        titulo: `${pendientes.movimientosPendientes} movimiento${plural ? 's' : ''} por aprobar`,
        detalle: `Salidas, asignaciones y devoluciones esperando aprobación de un encargado.`,
        accion: 'Revisar',
        destino: '/logistica/inventario/pedidos?tab=pendientes'
      })
    }

    if (productosSinCierre.length > 0) {
      const productoSinCierre = productosSinCierre[0]
      const plural = productosSinCierre.length > 1
      acciones.push({
        id: 'sin-cierre',
        severidad: 'atencion',
        titulo: `${productosSinCierre.length} producto${plural ? 's' : ''} con daño o pérdida`,
        detalle: `Unidades marcadas como dañadas o perdidas. Ej: ${productoSinCierre.codigo} ${productoSinCierre.nombre}: ${productoSinCierre.dañado + productoSinCierre.perdido} unidades. Revisá y dá de baja si corresponde.`,
        accion: 'Ver stock',
        destino: '/logistica/inventario/dashboard'
      })
    }

    return acciones.slice(0, 5)
  }, [pendientes, productosBajoMinimo, productosSinCierre])

  // Contar por categoría en una sola pasada O(n) en vez de O(4n)
  const conteosPorCategoria = useMemo(() => {
    let maquinaria = 0, herramientas = 0, repuestos = 0, insumos = 0
    for (const p of productosConStock) {
      if (p.categoria_codigo === 'maquinaria') maquinaria++
      if (p.categoria_codigo === 'herramientas' || p.es_retornable) herramientas++
      if (p.categoria_codigo === 'repuestos' || (!p.es_retornable && p.categoria_codigo !== 'insumos' && p.categoria_codigo !== 'maquinaria')) repuestos++
      if (p.categoria_codigo === 'insumos') insumos++
    }
    return { maquinaria, herramientas, repuestos, insumos }
  }, [productosConStock])

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

  // Final filtered data - STAT CARD PREVALECE sobre filtros de columna
  const filteredData = useMemo(() => {
    let data = categoryFilteredData

    // Si hay stat card de estado activo, SOLO aplicar ese filtro (ignorar filtros de columna)
    if (filterEstadoStock !== 'all') {
      return categoryFilteredData.filter(p => {
        switch (filterEstadoStock) {
          case 'disponible': return p.disponible > 0
          case 'en_uso': return p.en_uso > 0
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
  // Stock Total = Disponible + En Uso (NO incluye dañado ni perdido)
  const resumenInventario = useMemo(() => categoryFilteredData.reduce(
    (acc, item) => ({
      total: acc.total + item.disponible + item.en_uso,
      disponible: acc.disponible + item.disponible,
      en_uso: acc.en_uso + item.en_uso,
      dañado: acc.dañado + item.dañado,
      perdido: acc.perdido + item.perdido,
      productosDisponibles: acc.productosDisponibles + (item.disponible > 0 ? 1 : 0),
      productosEnUso: acc.productosEnUso + (item.en_uso > 0 ? 1 : 0),
      productosDañados: acc.productosDañados + (item.dañado > 0 ? 1 : 0),
      productosPerdidos: acc.productosPerdidos + (item.perdido > 0 ? 1 : 0)
    }),
    {
      total: 0,
      disponible: 0,
      en_uso: 0,
      dañado: 0,
      perdido: 0,
      productosDisponibles: 0,
      productosEnUso: 0,
      productosDañados: 0,
      productosPerdidos: 0
    }
  ), [categoryFilteredData])

  // Definir columnas para TanStack Table
  const columns = useMemo<ColumnDef<StockProducto>[]>(
    () => [
      {
        accessorKey: 'codigo',
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
        header: 'Unidad',
        cell: ({ getValue }) => (
          <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{getValue() as string}</span>
        ),
        enableSorting: false,
      },
      {
        accessorKey: 'es_retornable',
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
    [uniqueCodigos, codigoFilter, uniqueNombres, nombreFilter, uniqueTipos, tipoFilter, openFilterId, setOpenFilterId]
  )

  return (
    <div className="inv-module">
      <LoadingOverlay show={loading} message="Cargando inventario..." size="lg" />
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
        <div className="inv-stats-header">
          <div>
            <h2>Estado del stock</h2>
            <span>Unidades por condición. Clic en una tarjeta para filtrar la tabla.</span>
          </div>
          <button
            type="button"
            className="inv-stats-reset"
            onClick={() => setFilterEstadoStock('all')}
            disabled={filterEstadoStock === 'all'}
          >
            Ver todo
          </button>
        </div>
        <div className="inv-stats-grid">
          <button
            className={`stat-card${filterEstadoStock === 'disponible' ? ' active' : ''}`}
            onClick={() => setFilterEstadoStock(filterEstadoStock === 'disponible' ? 'all' : 'disponible')}
            title="Filtrar productos con stock disponible"
          >
            <div className="stat-content">
              <span className="stat-card-top">
                <span className="stat-title-group">
                  <CheckCircle size={16} className="stat-icon" />
                  <span className="stat-label">Disponibles</span>
                </span>
                <span className="stat-filter-chip">
                  {filterEstadoStock === 'disponible' ? 'Activo' : 'Filtrar'}
                </span>
              </span>
              <span className="stat-value-row">
                <span className="stat-value">{resumenInventario.disponible}</span>
                <span className="stat-unit">unidades</span>
              </span>
              <span className="stat-helper">
                {formatProductosLabel(resumenInventario.productosDisponibles, 'con saldo')}
              </span>
            </div>
          </button>
          <button
            className={`stat-card${filterEstadoStock === 'en_uso' ? ' active' : ''}`}
            onClick={() => setFilterEstadoStock(filterEstadoStock === 'en_uso' ? 'all' : 'en_uso')}
            title="Filtrar productos con unidades en uso"
          >
            <div className="stat-content">
              <span className="stat-card-top">
                <span className="stat-title-group">
                  <Activity size={16} className="stat-icon" />
                  <span className="stat-label">En uso</span>
                </span>
                <span className="stat-filter-chip">
                  {filterEstadoStock === 'en_uso' ? 'Activo' : 'Filtrar'}
                </span>
              </span>
              <span className="stat-value-row">
                <span className="stat-value">{resumenInventario.en_uso}</span>
                <span className="stat-unit">unidades</span>
              </span>
              <span className="stat-helper">
                {formatProductosLabel(
                  resumenInventario.productosEnUso,
                  resumenInventario.productosEnUso === 1 ? 'asignado' : 'asignados'
                )}
              </span>
            </div>
          </button>
          <button
            className={`stat-card${filterEstadoStock === 'dañado' ? ' active' : ''}`}
            onClick={() => setFilterEstadoStock(filterEstadoStock === 'dañado' ? 'all' : 'dañado')}
            title="Filtrar productos con unidades dañadas"
          >
            <div className="stat-content">
              <span className="stat-card-top">
                <span className="stat-title-group">
                  <AlertTriangle size={16} className="stat-icon" />
                  <span className="stat-label">Dañadas</span>
                </span>
                <span className="stat-filter-chip">
                  {filterEstadoStock === 'dañado' ? 'Activo' : 'Filtrar'}
                </span>
              </span>
              <span className="stat-value-row">
                <span className="stat-value">{resumenInventario.dañado}</span>
                <span className="stat-unit">unidades</span>
              </span>
              <span className="stat-helper">
                {resumenInventario.productosDañados > 0
                  ? formatProductosLabel(resumenInventario.productosDañados, 'por revisar')
                  : 'Sin daño registrado'}
              </span>
            </div>
          </button>
          <button
            className={`stat-card${filterEstadoStock === 'perdido' ? ' active' : ''}`}
            onClick={() => setFilterEstadoStock(filterEstadoStock === 'perdido' ? 'all' : 'perdido')}
            title="Filtrar productos con unidades perdidas"
          >
            <div className="stat-content">
              <span className="stat-card-top">
                <span className="stat-title-group">
                  <XCircle size={16} className="stat-icon" />
                  <span className="stat-label">Perdidas</span>
                </span>
                <span className="stat-filter-chip">
                  {filterEstadoStock === 'perdido' ? 'Activo' : 'Filtrar'}
                </span>
              </span>
              <span className="stat-value-row">
                <span className="stat-value">{resumenInventario.perdido}</span>
                <span className="stat-unit">unidades</span>
              </span>
              <span className="stat-helper">
                {resumenInventario.productosPerdidos > 0
                  ? formatProductosLabel(resumenInventario.productosPerdidos, 'por cerrar')
                  : 'Sin pérdida registrada'}
              </span>
            </div>
          </button>
        </div>
      </div>

      <div className="inv-cockpit">
        <div className="inv-actions-panel">
          <div className="inv-panel-header">
            <div>
              <h2>Pendientes operativos</h2>
              <span>Stock, recepciones, aprobaciones y cierres que requieren atencion</span>
            </div>
            <span className="inv-panel-badge">{accionesOperativas.length} pendientes</span>
          </div>
          <div className="inv-action-list">
            {accionesOperativas.length === 0 ? (
              <div className="inv-action-empty">
                <CheckCircle size={18} />
                No hay pendientes operativos criticos.
              </div>
            ) : accionesOperativas.map(action => (
              <button
                key={action.id}
                className={`inv-action-item ${action.severidad}`}
                onClick={() => navigate(action.destino)}
              >
                <span className="inv-action-status">
                  {action.severidad === 'critico' ? 'Critico' : action.severidad === 'atencion' ? 'Atencion' : 'Revisar'}
                </span>
                <span className="inv-action-copy">
                  <strong>{action.titulo}</strong>
                  <small>{action.detalle}</small>
                </span>
                <span className="inv-action-cta">
                  {action.accion}
                  <ArrowRight size={14} />
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tabla con DataTable - sorting y paginación */}
      <DataTable
        data={filteredData}
        columns={columns}
        loading={loading}
        searchPlaceholder="Buscar por código o producto..."
        emptyIcon={<Package size={64}
      />}
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
      />
    </div>
  )
}
