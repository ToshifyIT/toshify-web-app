import { useEffect, useState, useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { supabase } from '../../lib/supabase'
import { LoadingOverlay } from '../../components/ui/LoadingOverlay'
import Swal from 'sweetalert2'
import { Eye, Edit, Trash2, Package, Tag, Info, Calendar, Filter, Wrench, Box } from 'lucide-react'
import { usePermissions } from '../../contexts/PermissionsContext'
import { DataTable } from '../../components/ui/DataTable'
import './ProductosModule.css'

interface UnidadMedida {
  id: string
  codigo: string
  descripcion: string
}

interface ProductoEstado {
  id: string
  codigo: string
  descripcion: string
}

interface Categoria {
  id: string
  codigo: string
  nombre: string
  descripcion?: string
}

interface Producto {
  id: string
  codigo: string
  nombre: string
  descripcion?: string
  unidad_medida_id: string
  estado_id: string
  categoria_id?: string
  es_retornable: boolean
  tipo: 'REPUESTOS' | 'HERRAMIENTAS'
  proveedor?: string
  observacion?: string
  stock_minimo?: number
  alerta_reposicion?: number
  created_at: string
  updated_at: string
  unidades_medida?: UnidadMedida
  productos_estados?: ProductoEstado
  categorias?: Categoria
}

interface StockPorProveedor {
  proveedor_id: string
  proveedor_nombre: string
  cantidad: number
  estado: string
}

export function ProductosModule() {
  const { canCreateInSubmenu, canEditInSubmenu, canDeleteInSubmenu } = usePermissions()

  // Permisos específicos para el submenú de productos
  const canCreate = canCreateInSubmenu('productos')
  const canEdit = canEditInSubmenu('productos')
  const canDelete = canDeleteInSubmenu('productos')
  const canView = true // Si llegó aquí, tiene permiso de ver (validado por ProtectedRoute)

  const [productos, setProductos] = useState<Producto[]>([])
  const [unidadesMedida, setUnidadesMedida] = useState<UnidadMedida[]>([])
  const [estados, setEstados] = useState<ProductoEstado[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showViewModal, setShowViewModal] = useState(false)
  const [selectedProducto, setSelectedProducto] = useState<Producto | null>(null)
  const [stockPorProveedor, setStockPorProveedor] = useState<StockPorProveedor[]>([])
  const [loadingStock, setLoadingStock] = useState(false)

  // Form states
  const [formData, setFormData] = useState({
    codigo: '',
    nombre: '',
    descripcion: '',
    unidad_medida_id: '',
    estado_id: '',
    categoria_id: '',
    tipo: 'REPUESTOS' as 'REPUESTOS' | 'HERRAMIENTAS',
    proveedor: '',
    observacion: '',
    stock_minimo: 0,
    alerta_reposicion: 0
  })

  // Column filter states - Multiselect tipo Excel
  const [codigoFilter, setCodigoFilter] = useState<string[]>([])
  const [codigoSearch, setCodigoSearch] = useState('')
  const [nombreFilter, setNombreFilter] = useState<string[]>([])
  const [nombreSearch, setNombreSearch] = useState('')
  const [tipoFilter, setTipoFilter] = useState<string[]>([])
  const [openColumnFilter, setOpenColumnFilter] = useState<string | null>(null)

  // Stat card filter state
  const [activeStatCard, setActiveStatCard] = useState<string | null>(null)

  useEffect(() => {
    loadProductos()
    loadUnidadesMedida()
    loadEstados()
    loadCategorias()
  }, [])

  // Cerrar dropdown de filtro al hacer click fuera
  useEffect(() => {
    const handleClickOutside = () => {
      if (openColumnFilter) {
        setOpenColumnFilter(null)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [openColumnFilter])

  // Valores únicos para filtros tipo Excel
  const codigosUnicos = useMemo(() => {
    const codigos = productos.map(p => p.codigo).filter(Boolean)
    return [...new Set(codigos)].sort()
  }, [productos])

  const nombresUnicos = useMemo(() => {
    const nombres = productos.map(p => p.nombre).filter(Boolean)
    return [...new Set(nombres)].sort()
  }, [productos])

  const tipoOptions = [
    { value: 'REPUESTOS', label: 'Repuestos' },
    { value: 'HERRAMIENTAS', label: 'Herramientas' }
  ]

  // Opciones filtradas por búsqueda
  const codigosFiltrados = useMemo(() => {
    if (!codigoSearch) return codigosUnicos
    return codigosUnicos.filter(c => c.toLowerCase().includes(codigoSearch.toLowerCase()))
  }, [codigosUnicos, codigoSearch])

  const nombresFiltrados = useMemo(() => {
    if (!nombreSearch) return nombresUnicos
    return nombresUnicos.filter(n => n.toLowerCase().includes(nombreSearch.toLowerCase()))
  }, [nombresUnicos, nombreSearch])

  // Toggle functions para multiselect
  const toggleCodigoFilter = (codigo: string) => {
    setCodigoFilter(prev =>
      prev.includes(codigo) ? prev.filter(c => c !== codigo) : [...prev, codigo]
    )
  }

  const toggleNombreFilter = (nombre: string) => {
    setNombreFilter(prev =>
      prev.includes(nombre) ? prev.filter(n => n !== nombre) : [...prev, nombre]
    )
  }

  const toggleTipoFilter = (tipo: string) => {
    setTipoFilter(prev =>
      prev.includes(tipo) ? prev.filter(t => t !== tipo) : [...prev, tipo]
    )
  }

  // Generar filtros externos para mostrar en la barra de filtros del DataTable
  const externalFilters = useMemo(() => {
    if (!activeStatCard) return []

    const labels: Record<string, string> = {
      total: 'Total',
      herramientas: 'Herramientas',
      repuestos: 'Repuestos',
      retornables: 'Retornables'
    }

    return [{
      id: activeStatCard,
      label: labels[activeStatCard] || activeStatCard,
      onClear: () => setActiveStatCard(null)
    }]
  }, [activeStatCard])

  // Filtrar productos - STAT CARD PREVALECE sobre filtros de columna
  const filteredProductos = useMemo(() => {
    let result = productos

    // Si hay stat card activo, SOLO aplicar ese filtro (ignorar filtros de columna)
    if (activeStatCard) {
      switch (activeStatCard) {
        case 'herramientas':
          return productos.filter(p => p.tipo === 'HERRAMIENTAS')
        case 'repuestos':
          return productos.filter(p => p.tipo === 'REPUESTOS')
        case 'retornables':
          return productos.filter(p => p.es_retornable)
        case 'total':
        default:
          return productos
      }
    }

    // Sin stat card activo → aplicar filtros de columna
    if (codigoFilter.length > 0) {
      result = result.filter(p =>
        codigoFilter.includes(p.codigo || '')
      )
    }

    if (nombreFilter.length > 0) {
      result = result.filter(p =>
        nombreFilter.includes(p.nombre || '')
      )
    }

    if (tipoFilter.length > 0) {
      result = result.filter(p => tipoFilter.includes(p.tipo))
    }

    return result
  }, [productos, codigoFilter, nombreFilter, tipoFilter, activeStatCard])

  const loadProductos = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('productos')
        .select(`
          *,
          unidades_medida (
            id,
            codigo,
            descripcion
          ),
          productos_estados (
            id,
            codigo,
            descripcion
          ),
          categorias (
            id,
            codigo,
            nombre,
            descripcion
          )
        `)
        .order('created_at', { ascending: false })

      if (error) throw error
      setProductos(data || [])
    } catch (err: any) {
      console.error('🔴 Error cargando productos:', err)
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'No se pudieron cargar los productos',
      })
    } finally {
      setLoading(false)
    }
  }

  const loadUnidadesMedida = async () => {
    const { data } = await supabase
      .from('unidades_medida')
      .select('*')
      .eq('activo', true)
      .order('descripcion')
    if (data) setUnidadesMedida(data)
  }

  const loadEstados = async () => {
    const { data } = await supabase
      .from('productos_estados')
      .select('*')
      .eq('activo', true)
      .order('codigo')
    if (data) setEstados(data)
  }

  const loadCategorias = async () => {
    const { data } = await supabase
      .from('categorias')
      .select('*')
      .eq('activo', true)
      .order('nombre')
    if (data) setCategorias(data)
  }

  const handleCreate = async () => {
    if (!canCreate) {
      Swal.fire({
        icon: 'error',
        title: 'Sin permisos',
        text: 'No tienes permisos para crear productos'
      })
      return
    }

    try {
      const { data: userData } = await supabase.auth.getUser()

      const { error } = await (supabase
        .from('productos') as any)
        .insert({
          codigo: formData.codigo,
          nombre: formData.nombre,
          descripcion: formData.descripcion,
          unidad_medida_id: formData.unidad_medida_id,
          estado_id: formData.estado_id,
          categoria_id: formData.categoria_id || null,
          es_retornable: formData.tipo === 'HERRAMIENTAS',
          tipo: formData.tipo,
          proveedor: formData.proveedor,
          observacion: formData.observacion,
          stock_minimo: formData.stock_minimo || 0,
          alerta_reposicion: formData.alerta_reposicion || 0,
          created_by: userData.user?.id
        })

      if (error) throw error

      Swal.fire({
        icon: 'success',
        title: 'Producto creado',
        text: 'El producto ha sido creado exitosamente',
        timer: 2000
      })

      setShowCreateModal(false)
      resetForm()
      loadProductos()
    } catch (err: any) {
      console.error('Error creando producto:', err)
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.message || 'No se pudo crear el producto',
      })
    }
  }

  const handleEdit = async () => {
    if (!canEdit || !selectedProducto) {
      Swal.fire({
        icon: 'error',
        title: 'Sin permisos',
        text: 'No tienes permisos para editar productos'
      })
      return
    }

    try {
      const updateData: any = {
        codigo: formData.codigo,
        nombre: formData.nombre,
        descripcion: formData.descripcion,
        unidad_medida_id: formData.unidad_medida_id,
        estado_id: formData.estado_id,
        categoria_id: formData.categoria_id || null,
        es_retornable: formData.tipo === 'HERRAMIENTAS',
        tipo: formData.tipo,
        proveedor: formData.proveedor,
        observacion: formData.observacion,
        stock_minimo: formData.stock_minimo || 0,
        alerta_reposicion: formData.alerta_reposicion || 0,
        updated_at: new Date().toISOString()
      }

      const { error } = await (supabase
        .from('productos') as any)
        .update(updateData)
        .eq('id', selectedProducto.id)

      if (error) throw error

      Swal.fire({
        icon: 'success',
        title: 'Producto actualizado',
        text: 'El producto ha sido actualizado exitosamente',
        timer: 2000
      })

      setShowEditModal(false)
      resetForm()
      loadProductos()
    } catch (err: any) {
      console.error('Error actualizando producto:', err)
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.message || 'No se pudo actualizar el producto',
      })
    }
  }

  const handleDelete = async (id: string) => {
    if (!canDelete) {
      Swal.fire({
        icon: 'error',
        title: 'Sin permisos',
        text: 'No tienes permisos para eliminar productos'
      })
      return
    }

    const result = await Swal.fire({
      title: '¿Estás seguro?',
      text: 'Esta acción no se puede deshacer',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#EF4444',
      cancelButtonColor: '#6B7280',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    })

    if (result.isConfirmed) {
      try {
        // Verificar si el producto está en uso en inventario
        const { data: inventarioData } = await supabase
          .from('inventario')
          .select('id')
          .eq('producto_id', id)
          .limit(1)

        if (inventarioData && inventarioData.length > 0) {
          Swal.fire({
            icon: 'warning',
            title: 'No se puede eliminar',
            text: 'Este producto tiene movimientos de inventario asociados. Primero elimine los registros de inventario.',
          })
          return
        }

        // Verificar si está en pedidos
        const { data: pedidosData } = await supabase
          .from('pedido_items')
          .select('id')
          .eq('producto_id', id)
          .limit(1)

        if (pedidosData && pedidosData.length > 0) {
          Swal.fire({
            icon: 'warning',
            title: 'No se puede eliminar',
            text: 'Este producto tiene pedidos asociados. Primero elimine los pedidos relacionados.',
          })
          return
        }

        const { error } = await (supabase
          .from('productos') as any)
          .delete()
          .eq('id', id)

        if (error) throw error

        Swal.fire({
          icon: 'success',
          title: 'Producto eliminado',
          timer: 2000,
          showConfirmButton: false
        })

        loadProductos()
      } catch (err: any) {
        console.error('Error eliminando producto:', err)
        // Mensaje más amigable para errores de FK
        let errorMessage = err.message || 'No se pudo eliminar el producto'
        if (err.message?.includes('foreign key constraint')) {
          errorMessage = 'No se puede eliminar el producto porque está siendo utilizado en otras tablas (inventario, pedidos, etc.)'
        }
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: errorMessage,
        })
      }
    }
  }

  const openCreateModal = () => {
    resetForm()
    // Establecer estado "Stock disponible" por defecto
    const estadoStock = estados.find(e => e.codigo === 'STOCK')
    if (estadoStock) {
      setFormData(prev => ({ ...prev, estado_id: estadoStock.id }))
    }
    setShowCreateModal(true)
  }

  const openEditModal = (producto: Producto) => {
    setSelectedProducto(producto)
    setFormData({
      codigo: producto.codigo,
      nombre: producto.nombre,
      descripcion: producto.descripcion || '',
      unidad_medida_id: producto.unidad_medida_id,
      estado_id: producto.estado_id,
      categoria_id: producto.categoria_id || '',
      tipo: producto.tipo,
      proveedor: producto.proveedor || '',
      observacion: producto.observacion || '',
      stock_minimo: producto.stock_minimo || 0,
      alerta_reposicion: producto.alerta_reposicion || 0
    })
    setShowEditModal(true)
  }

  const openViewModal = async (producto: Producto) => {
    setSelectedProducto(producto)
    setShowViewModal(true)
    await loadStockPorProveedor(producto.id)
  }

  const loadStockPorProveedor = async (productoId: string) => {
    try {
      setLoadingStock(true)
      const { data, error } = await supabase
        .from('inventario')
        .select(`
          proveedor_id,
          cantidad,
          estado,
          proveedores (
            razon_social
          )
        `)
        .eq('producto_id', productoId)
        .in('estado', ['disponible', 'en_uso'])
        .gt('cantidad', 0)
        .order('estado', { ascending: true })

      if (error) throw error

      const stockAgrupado = (data || []).reduce((acc: StockPorProveedor[], item: any) => {
        if (!item.proveedor_id || !item.proveedores) return acc

        const existente = acc.find(
          s => s.proveedor_id === item.proveedor_id && s.estado === item.estado
        )

        if (existente) {
          existente.cantidad += Number(item.cantidad)
        } else {
          acc.push({
            proveedor_id: item.proveedor_id,
            proveedor_nombre: item.proveedores.razon_social,
            cantidad: Number(item.cantidad),
            estado: item.estado
          })
        }

        return acc
      }, [])

      setStockPorProveedor(stockAgrupado)
    } catch (err) {
      console.error('Error cargando stock por proveedor:', err)
      setStockPorProveedor([])
    } finally {
      setLoadingStock(false)
    }
  }

  const resetForm = () => {
    setFormData({
      codigo: '',
      nombre: '',
      descripcion: '',
      unidad_medida_id: '',
      estado_id: '',
      categoria_id: '',
      tipo: 'REPUESTOS',
      proveedor: '',
      observacion: '',
      stock_minimo: 0,
      alerta_reposicion: 0
    })
    setSelectedProducto(null)
  }

  const columns = useMemo<ColumnDef<Producto>[]>(
    () => [
      {
        accessorKey: 'codigo',
        header: () => (
          <div className="dt-column-filter">
            <span>Código {codigoFilter.length > 0 && `(${codigoFilter.length})`}</span>
            <button
              className={`dt-column-filter-btn ${codigoFilter.length > 0 ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                setOpenColumnFilter(openColumnFilter === 'codigo' ? null : 'codigo')
              }}
              title="Filtrar por código"
            >
              <Filter size={12} />
            </button>
            {openColumnFilter === 'codigo' && (
              <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
                <input
                  type="text"
                  placeholder="Buscar..."
                  value={codigoSearch}
                  onChange={(e) => setCodigoSearch(e.target.value)}
                  className="dt-column-filter-input"
                  autoFocus
                />
                <div className="dt-excel-filter-list">
                  {codigosFiltrados.length === 0 ? (
                    <div className="dt-excel-filter-empty">Sin resultados</div>
                  ) : (
                    codigosFiltrados.slice(0, 50).map(codigo => (
                      <label key={codigo} className={`dt-column-filter-checkbox ${codigoFilter.includes(codigo) ? 'selected' : ''}`}>
                        <input
                          type="checkbox"
                          checked={codigoFilter.includes(codigo)}
                          onChange={() => toggleCodigoFilter(codigo)}
                        />
                        <span>{codigo}</span>
                      </label>
                    ))
                  )}
                </div>
                {codigoFilter.length > 0 && (
                  <button
                    className="dt-column-filter-clear"
                    onClick={() => { setCodigoFilter([]); setCodigoSearch('') }}
                  >
                    Limpiar ({codigoFilter.length})
                  </button>
                )}
              </div>
            )}
          </div>
        ),
        cell: ({ getValue }) => (
          <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
            {getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: 'nombre',
        header: () => (
          <div className="dt-column-filter">
            <span>Nombre {nombreFilter.length > 0 && `(${nombreFilter.length})`}</span>
            <button
              className={`dt-column-filter-btn ${nombreFilter.length > 0 ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                setOpenColumnFilter(openColumnFilter === 'nombre' ? null : 'nombre')
              }}
              title="Filtrar por nombre"
            >
              <Filter size={12} />
            </button>
            {openColumnFilter === 'nombre' && (
              <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
                <input
                  type="text"
                  placeholder="Buscar..."
                  value={nombreSearch}
                  onChange={(e) => setNombreSearch(e.target.value)}
                  className="dt-column-filter-input"
                  autoFocus
                />
                <div className="dt-excel-filter-list">
                  {nombresFiltrados.length === 0 ? (
                    <div className="dt-excel-filter-empty">Sin resultados</div>
                  ) : (
                    nombresFiltrados.slice(0, 50).map(nombre => (
                      <label key={nombre} className={`dt-column-filter-checkbox ${nombreFilter.includes(nombre) ? 'selected' : ''}`}>
                        <input
                          type="checkbox"
                          checked={nombreFilter.includes(nombre)}
                          onChange={() => toggleNombreFilter(nombre)}
                        />
                        <span>{nombre}</span>
                      </label>
                    ))
                  )}
                </div>
                {nombreFilter.length > 0 && (
                  <button
                    className="dt-column-filter-clear"
                    onClick={() => { setNombreFilter([]); setNombreSearch('') }}
                  >
                    Limpiar ({nombreFilter.length})
                  </button>
                )}
              </div>
            )}
          </div>
        ),
        cell: ({ getValue }) => (
          <span style={{ fontWeight: 500 }}>{getValue() as string}</span>
        ),
      },
      {
        id: 'categoria',
        header: 'Categoria',
        cell: ({ row }) => {
          const categoria = row.original.categorias
          return categoria ? (
            <span className="dt-badge dt-badge-blue">{categoria.nombre}</span>
          ) : (
            <span className="vehiculo-cell-na">Sin categoria</span>
          )
        },
      },
      {
        id: 'tipo',
        header: () => (
          <div className="dt-column-filter">
            <span>Tipo {tipoFilter.length > 0 && `(${tipoFilter.length})`}</span>
            <button
              className={`dt-column-filter-btn ${tipoFilter.length > 0 ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                setOpenColumnFilter(openColumnFilter === 'tipo' ? null : 'tipo')
              }}
              title="Filtrar por tipo"
            >
              <Filter size={12} />
            </button>
            {openColumnFilter === 'tipo' && (
              <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
                <div className="dt-excel-filter-list">
                  {tipoOptions.map(opt => (
                    <label key={opt.value} className={`dt-column-filter-checkbox ${tipoFilter.includes(opt.value) ? 'selected' : ''}`}>
                      <input
                        type="checkbox"
                        checked={tipoFilter.includes(opt.value)}
                        onChange={() => toggleTipoFilter(opt.value)}
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
                {tipoFilter.length > 0 && (
                  <button
                    className="dt-column-filter-clear"
                    onClick={() => setTipoFilter([])}
                  >
                    Limpiar ({tipoFilter.length})
                  </button>
                )}
              </div>
            )}
          </div>
        ),
        cell: ({ row }) => {
          const tipo = row.original.tipo
          return tipo === 'HERRAMIENTAS' ? (
            <span className="dt-badge dt-badge-blue">HERRAMIENTAS</span>
          ) : (
            <span className="dt-badge dt-badge-yellow">REPUESTOS</span>
          )
        },
      },
      {
        accessorKey: 'unidades_medida.descripcion',
        header: 'Unidad',
        cell: ({ row }) => row.original.unidades_medida?.descripcion || 'N/A',
      },
      {
        accessorKey: 'productos_estados.descripcion',
        header: 'Estado',
        cell: ({ row }) => {
          const estado = row.original.productos_estados?.codigo
          let badgeClass = 'dt-badge dt-badge-gray'
          switch (estado) {
            case 'STOCK':
              badgeClass = 'dt-badge dt-badge-green'
              break
            case 'USO':
              badgeClass = 'dt-badge dt-badge-yellow'
              break
            case 'TRANSITO':
              badgeClass = 'dt-badge dt-badge-blue'
              break
            case 'PEDIDO':
              badgeClass = 'dt-badge dt-badge-red'
              break
          }
          return (
            <span className={badgeClass}>
              {row.original.productos_estados?.descripcion || 'N/A'}
            </span>
          )
        },
      },
      {
        id: 'acciones',
        header: 'Acciones',
        cell: ({ row }) => (
          <div className="dt-actions">
            {canView && (
              <button
                className="dt-btn-action dt-btn-view"
                onClick={() => openViewModal(row.original)}
                title="Ver"
              >
                <Eye size={16} />
              </button>
            )}
            {canEdit && (
              <button
                className="dt-btn-action dt-btn-edit"
                onClick={() => openEditModal(row.original)}
                title="Editar"
              >
                <Edit size={16} />
              </button>
            )}
            {canDelete && (
              <button
                className="dt-btn-action dt-btn-delete"
                onClick={() => handleDelete(row.original.id)}
                title="Eliminar"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        ),
      },
    ],
    [canView, canEdit, canDelete, codigoFilter, nombreFilter, tipoFilter, openColumnFilter]
  )

  // Calcular estadísticas
  const statsData = useMemo(() => {
    const total = productos.length
    const herramientas = productos.filter(p => p.tipo === 'HERRAMIENTAS').length
    const repuestos = productos.filter(p => p.tipo === 'REPUESTOS').length
    const retornables = productos.filter(p => p.es_retornable).length
    return { total, herramientas, repuestos, retornables }
  }, [productos])

  return (
    <div className="prod-module">
      <LoadingOverlay show={loading} message="Cargando productos..." size="lg" />
      {/* Stats Cards - Estilo Bitacora (clickeables como filtros) */}
      <div className="prod-stats">
        <div className="prod-stats-grid">
          <button
            className={`stat-card${!activeStatCard ? ' active' : ''}`}
            onClick={() => setActiveStatCard(null)}
          >
            <Package size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{statsData.total}</span>
              <span className="stat-label">Total</span>
            </div>
          </button>
          <button
            className={`stat-card${activeStatCard === 'herramientas' ? ' active' : ''}`}
            onClick={() => setActiveStatCard(activeStatCard === 'herramientas' ? null : 'herramientas')}
          >
            <Wrench size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{statsData.herramientas}</span>
              <span className="stat-label">Herramientas</span>
            </div>
          </button>
          <button
            className={`stat-card${activeStatCard === 'repuestos' ? ' active' : ''}`}
            onClick={() => setActiveStatCard(activeStatCard === 'repuestos' ? null : 'repuestos')}
          >
            <Box size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{statsData.repuestos}</span>
              <span className="stat-label">Repuestos</span>
            </div>
          </button>
          <button
            className={`stat-card${activeStatCard === 'retornables' ? ' active' : ''}`}
            onClick={() => setActiveStatCard(activeStatCard === 'retornables' ? null : 'retornables')}
          >
            <Tag size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{statsData.retornables}</span>
              <span className="stat-label">Retornables</span>
            </div>
          </button>
        </div>
      </div>

      {/* DataTable with integrated action button */}
      <DataTable
        data={filteredProductos}
        columns={columns}
        loading={loading}
        searchPlaceholder="Buscar por codigo, nombre, proveedor, categoria..."
        emptyIcon={<Package size={64} />}
        emptyTitle="No hay productos registrados"
        emptyDescription={canCreate ? 'Crea el primero usando el boton "+ Crear Producto".' : ''}
        headerAction={
          canCreate ? (
            <button className="btn-primary" onClick={openCreateModal}>
              + Crear Producto
            </button>
          ) : undefined
        }
        externalFilters={externalFilters}
        onClearAllFilters={() => {
          // Limpiar filtros de columna
          setCodigoFilter([])
          setCodigoSearch('')
          setNombreFilter([])
          setNombreSearch('')
          setTipoFilter([])
          // Limpiar stat card
          setActiveStatCard(null)
        }}
      />

      {/* Create Modal */}
      {showCreateModal && (
        <div className="prod-modal-overlay">
          <div className="prod-modal-content">
            <div className="prod-modal-header">
              <h2><Package size={24} /> Crear Producto</h2>
            </div>

            <div className="prod-modal-body">
              <div className="prod-form-grid">
                <div className="prod-form-group">
                  <label className="prod-form-label">Codigo *</label>
                  <input
                    type="text"
                    className="prod-form-input"
                    value={formData.codigo}
                    onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
                  />
                </div>

                <div className="prod-form-group">
                  <label className="prod-form-label">Nombre *</label>
                  <input
                    type="text"
                    className="prod-form-input"
                    value={formData.nombre}
                    onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  />
                </div>

                <div className="prod-form-group">
                  <label className="prod-form-label">Descripcion</label>
                  <textarea
                    className="prod-form-textarea"
                    value={formData.descripcion}
                    onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                    rows={3}
                  />
                </div>

                <div className="prod-form-group">
                  <label className="prod-form-label">Unidad de Medida *</label>
                  <select
                    className="prod-form-select"
                    value={formData.unidad_medida_id}
                    onChange={(e) => setFormData({ ...formData, unidad_medida_id: e.target.value })}
                  >
                    <option value="">Seleccionar...</option>
                    {unidadesMedida.map((um) => (
                      <option key={um.id} value={um.id}>{um.descripcion}</option>
                    ))}
                  </select>
                </div>

                <div className="prod-form-group">
                  <label className="prod-form-label">Categoria *</label>
                  <select
                    className="prod-form-select"
                    value={formData.categoria_id}
                    onChange={(e) => setFormData({ ...formData, categoria_id: e.target.value })}
                  >
                    <option value="">Seleccionar...</option>
                    {categorias.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.nombre}</option>
                    ))}
                  </select>
                </div>

                <div className="prod-form-row">
                  <div className="prod-form-group">
                    <label className="prod-form-label">Tipo *</label>
                    <select
                      className="prod-form-select"
                      value={formData.tipo}
                      onChange={(e) => setFormData({ ...formData, tipo: e.target.value as 'REPUESTOS' | 'HERRAMIENTAS' })}
                    >
                      <option value="REPUESTOS">REPUESTOS</option>
                      <option value="HERRAMIENTAS">HERRAMIENTAS</option>
                    </select>
                  </div>

                  <div className="prod-form-group">
                    <label className="prod-form-label">Marca</label>
                    <input
                      type="text"
                      className="prod-form-input"
                      value={formData.proveedor}
                      onChange={(e) => setFormData({ ...formData, proveedor: e.target.value })}
                      placeholder="Ej: YPF, Shell, Bosch..."
                    />
                  </div>
                </div>

                <div className="prod-form-row">
                  <div className="prod-form-group">
                    <label className="prod-form-label">Stock Minimo</label>
                    <input
                      type="number"
                      min="0"
                      className="prod-form-input"
                      value={formData.stock_minimo}
                      onChange={(e) => setFormData({ ...formData, stock_minimo: Number(e.target.value) || 0 })}
                    />
                  </div>

                  <div className="prod-form-group">
                    <label className="prod-form-label">Alerta de Reposicion</label>
                    <input
                      type="number"
                      min="0"
                      className="prod-form-input"
                      value={formData.alerta_reposicion}
                      onChange={(e) => setFormData({ ...formData, alerta_reposicion: Number(e.target.value) || 0 })}
                    />
                  </div>
                </div>

                <div className="prod-form-group">
                  <label className="prod-form-label">Observacion</label>
                  <textarea
                    className="prod-form-textarea"
                    value={formData.observacion}
                    onChange={(e) => setFormData({ ...formData, observacion: e.target.value })}
                    rows={2}
                  />
                </div>
              </div>
            </div>

            <div className="prod-modal-footer">
              <button
                className="prod-btn-primary"
                onClick={handleCreate}
                disabled={!formData.codigo || !formData.nombre || !formData.unidad_medida_id || !formData.categoria_id}
              >
                Crear Producto
              </button>
              <button
                className="prod-btn-secondary"
                onClick={() => {
                  setShowCreateModal(false)
                  resetForm()
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedProducto && (
        <div className="prod-modal-overlay">
          <div className="prod-modal-content">
            <div className="prod-modal-header">
              <h2><Edit size={24} /> Editar Producto</h2>
            </div>

            <div className="prod-modal-body">
              <div className="prod-form-grid">
                <div className="prod-form-group">
                  <label className="prod-form-label">Codigo *</label>
                  <input
                    type="text"
                    className="prod-form-input"
                    value={formData.codigo}
                    onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
                  />
                </div>

                <div className="prod-form-group">
                  <label className="prod-form-label">Nombre *</label>
                  <input
                    type="text"
                    className="prod-form-input"
                    value={formData.nombre}
                    onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  />
                </div>

                <div className="prod-form-group">
                  <label className="prod-form-label">Descripcion</label>
                  <textarea
                    className="prod-form-textarea"
                    value={formData.descripcion}
                    onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                    rows={3}
                  />
                </div>

                <div className="prod-form-group">
                  <label className="prod-form-label">Unidad de Medida *</label>
                  <select
                    className="prod-form-select"
                    value={formData.unidad_medida_id}
                    onChange={(e) => setFormData({ ...formData, unidad_medida_id: e.target.value })}
                  >
                    <option value="">Seleccionar...</option>
                    {unidadesMedida.map((um) => (
                      <option key={um.id} value={um.id}>{um.descripcion}</option>
                    ))}
                  </select>
                </div>

                <div className="prod-form-row">
                  <div className="prod-form-group">
                    <label className="prod-form-label">Estado *</label>
                    <select
                      className="prod-form-select"
                      value={formData.estado_id}
                      onChange={(e) => setFormData({ ...formData, estado_id: e.target.value })}
                    >
                      <option value="">Seleccionar...</option>
                      {estados.map((est) => (
                        <option key={est.id} value={est.id}>{est.descripcion}</option>
                      ))}
                    </select>
                  </div>

                  <div className="prod-form-group">
                    <label className="prod-form-label">Categoria *</label>
                    <select
                      className="prod-form-select"
                      value={formData.categoria_id}
                      onChange={(e) => setFormData({ ...formData, categoria_id: e.target.value })}
                    >
                      <option value="">Seleccionar...</option>
                      {categorias.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.nombre}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="prod-form-row">
                  <div className="prod-form-group">
                    <label className="prod-form-label">Tipo *</label>
                    <select
                      className="prod-form-select"
                      value={formData.tipo}
                      onChange={(e) => setFormData({ ...formData, tipo: e.target.value as 'REPUESTOS' | 'HERRAMIENTAS' })}
                    >
                      <option value="REPUESTOS">REPUESTOS</option>
                      <option value="HERRAMIENTAS">HERRAMIENTAS</option>
                    </select>
                  </div>

                  <div className="prod-form-group">
                    <label className="prod-form-label">Marca</label>
                    <input
                      type="text"
                      className="prod-form-input"
                      value={formData.proveedor}
                      onChange={(e) => setFormData({ ...formData, proveedor: e.target.value })}
                      placeholder="Ej: YPF, Shell, Bosch..."
                    />
                  </div>
                </div>

                <div className="prod-form-row">
                  <div className="prod-form-group">
                    <label className="prod-form-label">Stock Minimo</label>
                    <input
                      type="number"
                      min="0"
                      className="prod-form-input"
                      value={formData.stock_minimo}
                      onChange={(e) => setFormData({ ...formData, stock_minimo: Number(e.target.value) || 0 })}
                    />
                  </div>

                  <div className="prod-form-group">
                    <label className="prod-form-label">Alerta de Reposicion</label>
                    <input
                      type="number"
                      min="0"
                      className="prod-form-input"
                      value={formData.alerta_reposicion}
                      onChange={(e) => setFormData({ ...formData, alerta_reposicion: Number(e.target.value) || 0 })}
                    />
                  </div>
                </div>

                <div className="prod-form-group">
                  <label className="prod-form-label">Observacion</label>
                  <textarea
                    className="prod-form-textarea"
                    value={formData.observacion}
                    onChange={(e) => setFormData({ ...formData, observacion: e.target.value })}
                    rows={2}
                  />
                </div>
              </div>
            </div>

            <div className="prod-modal-footer">
              <button
                className="prod-btn-success"
                onClick={handleEdit}
                disabled={!formData.codigo || !formData.nombre || !formData.unidad_medida_id || !formData.estado_id || !formData.categoria_id}
              >
                Actualizar Producto
              </button>
              <button
                className="prod-btn-secondary"
                onClick={() => {
                  setShowEditModal(false)
                  resetForm()
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Modal */}
      {showViewModal && selectedProducto && (
        <div className="prod-modal-overlay">
          <div className="prod-modal-content wide">
            <div className="prod-modal-header">
              <h2><Info size={24} /> Detalles del Producto</h2>
            </div>

            <div className="prod-modal-body">
              <div className="prod-view-sections">
                {/* Informacion General */}
                <div className="prod-view-section">
                  <div className="prod-section-header">
                    <Package size={20} />
                    <h3>Informacion General</h3>
                  </div>

                  <div className="prod-info-grid">
                    <div className="prod-info-item">
                      <span className="prod-info-label">Codigo</span>
                      <span className="prod-info-value large">{selectedProducto.codigo}</span>
                    </div>
                    <div className="prod-info-item">
                      <span className="prod-info-label">Nombre</span>
                      <span className="prod-info-value">{selectedProducto.nombre}</span>
                    </div>
                    {selectedProducto.descripcion && (
                      <div className="prod-info-item full">
                        <span className="prod-info-label">Descripcion</span>
                        <span className="prod-info-value">{selectedProducto.descripcion}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Tipo de Producto */}
                <div className="prod-view-section">
                  <div className="prod-section-header">
                    <Tag size={20} />
                    <h3>Tipo de Producto</h3>
                  </div>

                  <div className="prod-info-item">
                    <span className="prod-info-label">Clasificacion</span>
                    <span className={selectedProducto.tipo === 'HERRAMIENTAS' ? 'dt-badge dt-badge-blue' : 'dt-badge dt-badge-yellow'}>
                      {selectedProducto.tipo === 'HERRAMIENTAS' ? 'HERRAMIENTAS (Retornable)' : 'REPUESTOS (Consumible)'}
                    </span>
                  </div>
                </div>

                {/* Detalles Adicionales */}
                <div className="prod-view-section">
                  <div className="prod-section-header">
                    <Info size={20} />
                    <h3>Detalles Adicionales</h3>
                  </div>

                  <div className="prod-info-grid">
                    <div className="prod-info-item">
                      <span className="prod-info-label">Estado</span>
                      <span className="prod-info-value">{selectedProducto.productos_estados?.descripcion || 'N/A'}</span>
                    </div>
                    <div className="prod-info-item">
                      <span className="prod-info-label">Unidad de Medida</span>
                      <span className="prod-info-value">{selectedProducto.unidades_medida?.descripcion || 'N/A'}</span>
                    </div>
                    {selectedProducto.categorias && (
                      <div className="prod-info-item">
                        <span className="prod-info-label">Categoria</span>
                        <span className="dt-badge dt-badge-blue">{selectedProducto.categorias.nombre}</span>
                      </div>
                    )}
                    <div className="prod-info-item">
                      <span className="prod-info-label">Tipo</span>
                      <span className={selectedProducto.tipo === 'HERRAMIENTAS' ? 'dt-badge dt-badge-blue' : 'dt-badge dt-badge-yellow'}>
                        {selectedProducto.tipo}
                      </span>
                    </div>
                    {selectedProducto.proveedor && (
                      <div className="prod-info-item">
                        <span className="prod-info-label">Marca</span>
                        <span className="prod-info-value">{selectedProducto.proveedor}</span>
                      </div>
                    )}
                    {selectedProducto.observacion && (
                      <div className="prod-info-item full">
                        <span className="prod-info-label">Observacion</span>
                        <span className="prod-info-value">{selectedProducto.observacion}</span>
                      </div>
                    )}
                  </div>

                  {/* Stock por Proveedor */}
                  <div style={{ marginTop: '16px' }}>
                    <span className="prod-info-label" style={{ marginBottom: '8px', display: 'block' }}>Stock por Proveedor</span>
                    {loadingStock ? (
                      <div className="prod-stock-empty">Cargando stock...</div>
                    ) : stockPorProveedor.length === 0 ? (
                      <div className="prod-stock-empty">No hay stock registrado para este producto</div>
                    ) : (
                      <table className="prod-stock-table">
                        <thead>
                          <tr>
                            <th>Proveedor</th>
                            <th style={{ textAlign: 'center' }}>Estado</th>
                            <th style={{ textAlign: 'right' }}>Cantidad</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stockPorProveedor.map((stock, idx) => (
                            <tr key={`${stock.proveedor_id}-${stock.estado}-${idx}`}>
                              <td>{stock.proveedor_nombre}</td>
                              <td style={{ textAlign: 'center' }}>
                                <span className={stock.estado === 'disponible' ? 'dt-badge dt-badge-green' : 'dt-badge dt-badge-yellow'}>
                                  {stock.estado === 'disponible' ? 'Disponible' : 'En Uso'}
                                </span>
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 600 }}>
                                {stock.cantidad} {selectedProducto.unidades_medida?.descripcion || ''}
                              </td>
                            </tr>
                          ))}
                          <tr style={{ background: 'var(--bg-secondary)' }}>
                            <td colSpan={2} style={{ textAlign: 'right', fontWeight: 700, color: '#DC2626' }}>TOTAL:</td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: '#DC2626' }}>
                              {stockPorProveedor.reduce((sum, stock) => sum + stock.cantidad, 0)} {selectedProducto.unidades_medida?.descripcion || ''}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

                {/* Metadatos */}
                <div className="prod-view-section">
                  <div className="prod-section-header">
                    <Calendar size={20} />
                    <h3>Informacion de Registro</h3>
                  </div>

                  <div className="prod-info-grid">
                    <div className="prod-info-item">
                      <span className="prod-info-label">Creado</span>
                      <span className="prod-info-value">{new Date(selectedProducto.created_at).toLocaleString('es-CL')}</span>
                    </div>
                    <div className="prod-info-item">
                      <span className="prod-info-label">Actualizado</span>
                      <span className="prod-info-value">{new Date(selectedProducto.updated_at).toLocaleString('es-CL')}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="prod-modal-footer">
              <button className="prod-btn-primary" onClick={() => setShowViewModal(false)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .section-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 16px;
          font-weight: 700;
          color: var(--text-primary);
          padding-bottom: 12px;
          border-bottom: 2px solid var(--border-primary);
        }

        .detail-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .detail-label {
          font-size: 12px;
          color: var(--text-secondary);
          font-weight: 600;
        }

        .detail-value {
          font-size: 14px;
          color: var(--text-primary);
        }
      `}</style>
    </div>
  )
}
