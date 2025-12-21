import { useEffect, useState, useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { supabase } from '../../lib/supabase'
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
    observacion: ''
  })

  // Column filter states
  const [codigoFilter, setCodigoFilter] = useState('')
  const [nombreFilter, setNombreFilter] = useState('')
  const [tipoFilter, setTipoFilter] = useState('')
  const [openColumnFilter, setOpenColumnFilter] = useState<string | null>(null)

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

  // Filtrar productos según los filtros de columna
  const filteredProductos = useMemo(() => {
    let result = productos

    if (codigoFilter) {
      result = result.filter(p =>
        p.codigo?.toLowerCase().includes(codigoFilter.toLowerCase())
      )
    }

    if (nombreFilter) {
      result = result.filter(p =>
        p.nombre?.toLowerCase().includes(nombreFilter.toLowerCase())
      )
    }

    if (tipoFilter) {
      result = result.filter(p => p.tipo === tipoFilter)
    }

    return result
  }, [productos, codigoFilter, nombreFilter, tipoFilter])

  const loadProductos = async () => {
    console.log('🔵 loadProductos - INICIO')
    try {
      setLoading(true)
      console.log('🔵 loadProductos - Consultando supabase...')
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

      console.log('🔵 loadProductos - Respuesta recibida:', { data, error })
      if (error) throw error
      setProductos(data || [])
      console.log('🟢 loadProductos - SUCCESS')
    } catch (err: any) {
      console.error('🔴 Error cargando productos:', err)
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'No se pudieron cargar los productos',
      })
    } finally {
      console.log('🔵 loadProductos - FINALLY - setLoading(false)')
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
      observacion: producto.observacion || ''
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
      observacion: ''
    })
    setSelectedProducto(null)
  }

  const columns = useMemo<ColumnDef<Producto>[]>(
    () => [
      {
        accessorKey: 'codigo',
        header: () => (
          <div className="dt-column-filter">
            <span>Código</span>
            <button
              className={`dt-column-filter-btn ${codigoFilter ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                setOpenColumnFilter(openColumnFilter === 'codigo' ? null : 'codigo')
              }}
              title="Filtrar por código"
            >
              <Filter size={12} />
            </button>
            {openColumnFilter === 'codigo' && (
              <div className="dt-column-filter-dropdown" style={{ minWidth: '160px' }}>
                <input
                  type="text"
                  placeholder="Buscar código..."
                  value={codigoFilter}
                  onChange={(e) => setCodigoFilter(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="dt-column-filter-input"
                  autoFocus
                />
                {codigoFilter && (
                  <button
                    className="dt-column-filter-option"
                    onClick={(e) => {
                      e.stopPropagation()
                      setCodigoFilter('')
                    }}
                    style={{ marginTop: '4px', color: 'var(--color-danger)' }}
                  >
                    Limpiar
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
            <span>Nombre</span>
            <button
              className={`dt-column-filter-btn ${nombreFilter ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                setOpenColumnFilter(openColumnFilter === 'nombre' ? null : 'nombre')
              }}
              title="Filtrar por nombre"
            >
              <Filter size={12} />
            </button>
            {openColumnFilter === 'nombre' && (
              <div className="dt-column-filter-dropdown" style={{ minWidth: '180px' }}>
                <input
                  type="text"
                  placeholder="Buscar nombre..."
                  value={nombreFilter}
                  onChange={(e) => setNombreFilter(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="dt-column-filter-input"
                  autoFocus
                />
                {nombreFilter && (
                  <button
                    className="dt-column-filter-option"
                    onClick={(e) => {
                      e.stopPropagation()
                      setNombreFilter('')
                    }}
                    style={{ marginTop: '4px', color: 'var(--color-danger)' }}
                  >
                    Limpiar
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
            <span>Tipo</span>
            <button
              className={`dt-column-filter-btn ${tipoFilter ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                setOpenColumnFilter(openColumnFilter === 'tipo' ? null : 'tipo')
              }}
              title="Filtrar por tipo"
            >
              <Filter size={12} />
            </button>
            {openColumnFilter === 'tipo' && (
              <div className="dt-column-filter-dropdown" style={{ minWidth: '150px' }}>
                <button
                  className={`dt-column-filter-option ${tipoFilter === '' ? 'selected' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    setTipoFilter('')
                    setOpenColumnFilter(null)
                  }}
                >
                  Todos
                </button>
                <button
                  className={`dt-column-filter-option ${tipoFilter === 'REPUESTOS' ? 'selected' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    setTipoFilter('REPUESTOS')
                    setOpenColumnFilter(null)
                  }}
                >
                  Repuestos
                </button>
                <button
                  className={`dt-column-filter-option ${tipoFilter === 'HERRAMIENTAS' ? 'selected' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    setTipoFilter('HERRAMIENTAS')
                    setOpenColumnFilter(null)
                  }}
                >
                  Herramientas
                </button>
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
      {/* Header - Estilo Bitacora */}
      <div className="prod-header">
        <div className="prod-header-title">
          <h1>Gestion de Productos</h1>
          <span className="prod-header-subtitle">
            {productos.length} producto{productos.length !== 1 ? 's' : ''} registrado{productos.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Stats Cards - Estilo Bitacora */}
      <div className="prod-stats">
        <div className="prod-stats-grid">
          <div className="stat-card">
            <Package size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{statsData.total}</span>
              <span className="stat-label">Total</span>
            </div>
          </div>
          <div className="stat-card">
            <Wrench size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{statsData.herramientas}</span>
              <span className="stat-label">Herramientas</span>
            </div>
          </div>
          <div className="stat-card">
            <Box size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{statsData.repuestos}</span>
              <span className="stat-label">Repuestos</span>
            </div>
          </div>
          <div className="stat-card">
            <Tag size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{statsData.retornables}</span>
              <span className="stat-label">Retornables</span>
            </div>
          </div>
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
      />

      {/* Create Modal */}
      {showCreateModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: 'var(--card-bg)',
            borderRadius: '12px',
            padding: '24px',
            width: '90%',
            maxWidth: '600px',
            maxHeight: '90vh',
            overflow: 'auto',
          }}>
            <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Package size={24} />
              Crear Producto
            </h2>

            <div style={{ display: 'grid', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 600 }}>
                  Código *
                </label>
                <input
                  type="text"
                  value={formData.codigo}
                  onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '6px',
                    fontSize: '14px',
                    background: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 600 }}>
                  Nombre *
                </label>
                <input
                  type="text"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '6px',
                    fontSize: '14px',
                    background: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 600 }}>
                  Descripción
                </label>
                <textarea
                  value={formData.descripcion}
                  onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '6px',
                    fontSize: '14px',
                    background: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 600 }}>
                  Unidad de Medida *
                </label>
                <select
                  value={formData.unidad_medida_id}
                  onChange={(e) => setFormData({ ...formData, unidad_medida_id: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '6px',
                    fontSize: '14px',
                    background: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <option value="">Seleccionar...</option>
                  {unidadesMedida.map((um) => (
                    <option key={um.id} value={um.id}>
                      {um.descripcion}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 600 }}>
                    Estado *
                  </label>
                  <select
                    value={formData.estado_id}
                    onChange={(e) => setFormData({ ...formData, estado_id: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid var(--border-primary)',
                      borderRadius: '6px',
                      fontSize: '14px',
                      background: 'var(--input-bg)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <option value="">Seleccionar...</option>
                    {estados.map((est) => (
                      <option key={est.id} value={est.id}>
                        {est.descripcion}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 600 }}>
                    Categoría
                  </label>
                  <select
                    value={formData.categoria_id}
                    onChange={(e) => setFormData({ ...formData, categoria_id: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid var(--border-primary)',
                      borderRadius: '6px',
                      fontSize: '14px',
                      background: 'var(--input-bg)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <option value="">Ninguna</option>
                    {categorias.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 600 }}>
                    Tipo *
                  </label>
                  <select
                    value={formData.tipo}
                    onChange={(e) => setFormData({ ...formData, tipo: e.target.value as 'REPUESTOS' | 'HERRAMIENTAS' })}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid var(--border-primary)',
                      borderRadius: '6px',
                      fontSize: '14px',
                      background: 'var(--input-bg)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <option value="REPUESTOS">REPUESTOS</option>
                    <option value="HERRAMIENTAS">HERRAMIENTAS</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 600 }}>
                    Marca
                  </label>
                  <input
                    type="text"
                    value={formData.proveedor}
                    onChange={(e) => setFormData({ ...formData, proveedor: e.target.value })}
                    placeholder="Ej: YPF, Shell, Bosch..."
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid var(--border-primary)',
                      borderRadius: '6px',
                      fontSize: '14px',
                      background: 'var(--input-bg)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 600 }}>
                  Observación
                </label>
                <textarea
                  value={formData.observacion}
                  onChange={(e) => setFormData({ ...formData, observacion: e.target.value })}
                  rows={2}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '6px',
                    fontSize: '14px',
                    background: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowCreateModal(false)
                  resetForm()
                }}
                style={{
                  padding: '10px 20px',
                  background: 'var(--bg-tertiary)',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                disabled={!formData.codigo || !formData.nombre || !formData.unidad_medida_id || !formData.estado_id}
                style={{
                  padding: '10px 20px',
                  background: formData.codigo && formData.nombre && formData.unidad_medida_id && formData.estado_id ? 'var(--color-primary)' : 'var(--border-primary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: formData.codigo && formData.nombre && formData.unidad_medida_id && formData.estado_id ? 'pointer' : 'not-allowed',
                  fontSize: '14px',
                  fontWeight: 600,
                }}
              >
                Crear Producto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal - Similar to Create Modal */}
      {showEditModal && selectedProducto && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: 'var(--card-bg)',
            borderRadius: '12px',
            padding: '24px',
            width: '90%',
            maxWidth: '600px',
            maxHeight: '90vh',
            overflow: 'auto',
          }}>
            <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Edit size={24} />
              Editar Producto
            </h2>

            <div style={{ display: 'grid', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 600 }}>
                  Código *
                </label>
                <input
                  type="text"
                  value={formData.codigo}
                  onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '6px',
                    fontSize: '14px',
                    background: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 600 }}>
                  Nombre *
                </label>
                <input
                  type="text"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '6px',
                    fontSize: '14px',
                    background: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 600 }}>
                  Descripción
                </label>
                <textarea
                  value={formData.descripcion}
                  onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '6px',
                    fontSize: '14px',
                    background: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 600 }}>
                  Unidad de Medida *
                </label>
                <select
                  value={formData.unidad_medida_id}
                  onChange={(e) => setFormData({ ...formData, unidad_medida_id: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '6px',
                    fontSize: '14px',
                    background: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <option value="">Seleccionar...</option>
                  {unidadesMedida.map((um) => (
                    <option key={um.id} value={um.id}>
                      {um.descripcion}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 600 }}>
                    Estado *
                  </label>
                  <select
                    value={formData.estado_id}
                    onChange={(e) => setFormData({ ...formData, estado_id: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid var(--border-primary)',
                      borderRadius: '6px',
                      fontSize: '14px',
                      background: 'var(--input-bg)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <option value="">Seleccionar...</option>
                    {estados.map((est) => (
                      <option key={est.id} value={est.id}>
                        {est.descripcion}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 600 }}>
                    Categoría
                  </label>
                  <select
                    value={formData.categoria_id}
                    onChange={(e) => setFormData({ ...formData, categoria_id: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid var(--border-primary)',
                      borderRadius: '6px',
                      fontSize: '14px',
                      background: 'var(--input-bg)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <option value="">Ninguna</option>
                    {categorias.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 600 }}>
                    Tipo *
                  </label>
                  <select
                    value={formData.tipo}
                    onChange={(e) => setFormData({ ...formData, tipo: e.target.value as 'REPUESTOS' | 'HERRAMIENTAS' })}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid var(--border-primary)',
                      borderRadius: '6px',
                      fontSize: '14px',
                      background: 'var(--input-bg)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <option value="REPUESTOS">REPUESTOS</option>
                    <option value="HERRAMIENTAS">HERRAMIENTAS</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 600 }}>
                    Marca
                  </label>
                  <input
                    type="text"
                    value={formData.proveedor}
                    onChange={(e) => setFormData({ ...formData, proveedor: e.target.value })}
                    placeholder="Ej: YPF, Shell, Bosch..."
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid var(--border-primary)',
                      borderRadius: '6px',
                      fontSize: '14px',
                      background: 'var(--input-bg)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 600 }}>
                  Observación
                </label>
                <textarea
                  value={formData.observacion}
                  onChange={(e) => setFormData({ ...formData, observacion: e.target.value })}
                  rows={2}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '6px',
                    fontSize: '14px',
                    background: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowEditModal(false)
                  resetForm()
                }}
                style={{
                  padding: '10px 20px',
                  background: 'var(--bg-tertiary)',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleEdit}
                disabled={!formData.codigo || !formData.nombre || !formData.unidad_medida_id || !formData.estado_id}
                style={{
                  padding: '10px 20px',
                  background: formData.codigo && formData.nombre && formData.unidad_medida_id && formData.estado_id ? 'var(--color-success)' : 'var(--border-primary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: formData.codigo && formData.nombre && formData.unidad_medida_id && formData.estado_id ? 'pointer' : 'not-allowed',
                  fontSize: '14px',
                  fontWeight: 600,
                }}
              >
                Actualizar Producto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Modal */}
      {showViewModal && selectedProducto && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: 'var(--card-bg)',
            borderRadius: '12px',
            padding: '24px',
            width: '90%',
            maxWidth: '700px',
            maxHeight: '90vh',
            overflow: 'auto',
          }}>
            <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Info size={24} />
              Detalles del Producto
            </h2>

            <div style={{ display: 'grid', gap: '24px' }}>
              {/* Información General */}
              <div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '16px',
                  paddingBottom: '8px',
                  borderBottom: '2px solid var(--color-primary)'
                }}>
                  <Package size={20} style={{ color: 'var(--color-primary)' }} />
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-primary)', margin: 0 }}>
                    Información General
                  </h3>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Código</span>
                    <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-primary)' }}>{selectedProducto.codigo}</span>
                  </div>
                  <div>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Nombre</span>
                    <span style={{ fontSize: '16px', fontWeight: 600 }}>{selectedProducto.nombre}</span>
                  </div>
                  {selectedProducto.descripcion && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Descripción</span>
                      <span style={{ fontSize: '14px' }}>{selectedProducto.descripcion}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Tipo de Producto */}
              <div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '16px',
                  paddingBottom: '8px',
                  borderBottom: '2px solid var(--color-primary)'
                }}>
                  <Tag size={20} style={{ color: 'var(--color-primary)' }} />
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-primary)', margin: 0 }}>
                    Tipo de Producto
                  </h3>
                </div>

                <div style={{ display: 'grid', gap: '16px' }}>
                  <div>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Clasificación</span>
                    {selectedProducto.tipo === 'HERRAMIENTAS' ? (
                      <span
                        style={{
                          background: '#DBEAFE',
                          color: '#1E40AF',
                          padding: '6px 16px',
                          borderRadius: '12px',
                          fontSize: '14px',
                          fontWeight: 600,
                          display: 'inline-block'
                        }}
                      >
                        HERRAMIENTAS (Retornable)
                      </span>
                    ) : (
                      <span
                        style={{
                          background: '#FEF3C7',
                          color: '#92400E',
                          padding: '6px 16px',
                          borderRadius: '12px',
                          fontSize: '14px',
                          fontWeight: 600,
                          display: 'inline-block'
                        }}
                      >
                        REPUESTOS (Consumible)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Detalles Adicionales */}
              <div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '16px',
                  paddingBottom: '8px',
                  borderBottom: '2px solid var(--color-primary)'
                }}>
                  <Info size={20} style={{ color: 'var(--color-primary)' }} />
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-primary)', margin: 0 }}>
                    Detalles Adicionales
                  </h3>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Estado</span>
                    <span style={{ fontSize: '14px', fontWeight: 600 }}>
                      {selectedProducto.productos_estados?.descripcion || 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Unidad de Medida</span>
                    <span style={{ fontSize: '14px', fontWeight: 600 }}>
                      {selectedProducto.unidades_medida?.descripcion || 'N/A'}
                    </span>
                  </div>
                  {selectedProducto.categorias && (
                    <div>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Categoría</span>
                      <span
                        style={{
                          background: '#DBEAFE',
                          color: '#1E40AF',
                          padding: '4px 12px',
                          borderRadius: '12px',
                          fontSize: '13px',
                          fontWeight: 600,
                          display: 'inline-block'
                        }}
                      >
                        {selectedProducto.categorias.nombre}
                      </span>
                    </div>
                  )}
                  <div>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Tipo</span>
                    <span
                      style={{
                        background: selectedProducto.tipo === 'HERRAMIENTAS' ? '#DBEAFE' : '#FEF3C7',
                        color: selectedProducto.tipo === 'HERRAMIENTAS' ? '#1E40AF' : '#92400E',
                        padding: '4px 12px',
                        borderRadius: '12px',
                        fontSize: '13px',
                        fontWeight: 600,
                        display: 'inline-block'
                      }}
                    >
                      {selectedProducto.tipo}
                    </span>
                  </div>
                  {selectedProducto.proveedor && (
                    <div>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Marca</span>
                      <span style={{ fontSize: '14px' }}>{selectedProducto.proveedor}</span>
                    </div>
                  )}
                  {selectedProducto.observacion && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Observación</span>
                      <span style={{ fontSize: '14px' }}>{selectedProducto.observacion}</span>
                    </div>
                  )}
                </div>

                {/* Stock por Proveedor */}
                <div style={{ gridColumn: '1 / -1', marginTop: '16px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                    Stock por Proveedor
                  </span>
                  {loadingStock ? (
                    <div style={{ textAlign: 'center', padding: '12px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                      Cargando stock...
                    </div>
                  ) : stockPorProveedor.length === 0 ? (
                    <div style={{
                      background: 'var(--bg-tertiary)',
                      padding: '12px',
                      borderRadius: '8px',
                      textAlign: 'center',
                      color: 'var(--text-secondary)',
                      fontSize: '13px'
                    }}>
                      No hay stock registrado para este producto
                    </div>
                  ) : (
                    <div style={{
                      border: '1px solid var(--border-primary)',
                      borderRadius: '8px',
                      overflow: 'hidden'
                    }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-primary)' }}>
                            <th style={{
                              padding: '10px 12px',
                              textAlign: 'left',
                              fontSize: '12px',
                              fontWeight: 700,
                              color: 'var(--text-secondary)',
                              textTransform: 'uppercase'
                            }}>
                              Proveedor
                            </th>
                            <th style={{
                              padding: '10px 12px',
                              textAlign: 'center',
                              fontSize: '12px',
                              fontWeight: 700,
                              color: 'var(--text-secondary)',
                              textTransform: 'uppercase'
                            }}>
                              Estado
                            </th>
                            <th style={{
                              padding: '10px 12px',
                              textAlign: 'right',
                              fontSize: '12px',
                              fontWeight: 700,
                              color: 'var(--text-secondary)',
                              textTransform: 'uppercase'
                            }}>
                              Cantidad
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {stockPorProveedor.map((stock, idx) => (
                            <tr
                              key={`${stock.proveedor_id}-${stock.estado}-${idx}`}
                              style={{
                                borderBottom: idx < stockPorProveedor.length - 1 ? '1px solid var(--border-primary)' : 'none',
                                background: 'var(--card-bg)'
                              }}
                            >
                              <td style={{ padding: '10px 12px', fontSize: '13px', color: 'var(--text-primary)' }}>
                                {stock.proveedor_nombre}
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                <span style={{
                                  background: stock.estado === 'disponible' ? 'var(--badge-green-bg)' : '#FEF3C7',
                                  color: stock.estado === 'disponible' ? '#065F46' : '#92400E',
                                  padding: '3px 10px',
                                  borderRadius: '10px',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  textTransform: 'uppercase'
                                }}>
                                  {stock.estado === 'disponible' ? 'Disponible' : 'En Uso'}
                                </span>
                              </td>
                              <td style={{
                                padding: '10px 12px',
                                textAlign: 'right',
                                fontSize: '14px',
                                fontWeight: 600,
                                color: 'var(--text-primary)'
                              }}>
                                {stock.cantidad} {selectedProducto.unidades_medida?.descripcion || ''}
                              </td>
                            </tr>
                          ))}
                          <tr style={{ background: 'var(--table-header-bg)', borderTop: '2px solid var(--color-primary)' }}>
                            <td colSpan={2} style={{
                              padding: '10px 12px',
                              fontSize: '13px',
                              fontWeight: 700,
                              color: 'var(--color-primary)',
                              textAlign: 'right'
                            }}>
                              TOTAL:
                            </td>
                            <td style={{
                              padding: '10px 12px',
                              textAlign: 'right',
                              fontSize: '15px',
                              fontWeight: 700,
                              color: 'var(--color-primary)'
                            }}>
                              {stockPorProveedor.reduce((sum, stock) => sum + stock.cantidad, 0)} {selectedProducto.unidades_medida?.descripcion || ''}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* Metadatos */}
              <div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '16px',
                  paddingBottom: '8px',
                  borderBottom: '2px solid var(--color-primary)'
                }}>
                  <Calendar size={20} style={{ color: 'var(--color-primary)' }} />
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-primary)', margin: 0 }}>
                    Información de Registro
                  </h3>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Creado</span>
                    <span style={{ fontSize: '14px' }}>
                      {new Date(selectedProducto.created_at).toLocaleString('es-CL')}
                    </span>
                  </div>
                  <div>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Actualizado</span>
                    <span style={{ fontSize: '14px' }}>
                      {new Date(selectedProducto.updated_at).toLocaleString('es-CL')}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowViewModal(false)}
                style={{
                  padding: '10px 20px',
                  background: '#3B82F6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                }}
              >
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
