import { useEffect, useState, useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type SortingState,
  type ColumnDef,
} from '@tanstack/react-table'
import { supabase } from '../../lib/supabase'
import Swal from 'sweetalert2'
import {
  Eye,
  Edit,
  Trash2,
  Plus,
  Search,
  Package,
  Tag,
  Info,
  Calendar
} from 'lucide-react'
import { usePermissions } from '../../contexts/PermissionsContext'

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
  const [searchTerm, setSearchTerm] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
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

  useEffect(() => {
    loadProductos()
    loadUnidadesMedida()
    loadEstados()
    loadCategorias()
  }, [])

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
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: err.message || 'No se pudo eliminar el producto',
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
        header: 'Código',
        cell: ({ getValue }) => (
          <span style={{ fontWeight: 600, color: '#DC2626' }}>
            {getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: 'nombre',
        header: 'Nombre',
        cell: ({ getValue }) => (
          <span style={{ fontWeight: 500 }}>{getValue() as string}</span>
        ),
      },
      {
        id: 'categoria',
        header: 'Categoría',
        cell: ({ row }) => {
          const categoria = row.original.categorias
          return categoria ? (
            <span
              style={{
                background: '#DBEAFE',
                color: '#1E40AF',
                padding: '4px 12px',
                borderRadius: '12px',
                fontSize: '12px',
                fontWeight: 600
              }}
            >
              {categoria.nombre}
            </span>
          ) : (
            <span style={{ color: '#9CA3AF', fontStyle: 'italic' }}>Sin categoría</span>
          )
        },
      },
      {
        id: 'tipo',
        header: 'Tipo',
        cell: ({ row }) => {
          const tipo = row.original.tipo
          return tipo === 'HERRAMIENTAS' ? (
            <span
              style={{
                background: '#DBEAFE',
                color: '#1E40AF',
                padding: '4px 12px',
                borderRadius: '12px',
                fontSize: '12px',
                fontWeight: 600
              }}
            >
              HERRAMIENTAS
            </span>
          ) : (
            <span
              style={{
                background: '#FEF3C7',
                color: '#92400E',
                padding: '4px 12px',
                borderRadius: '12px',
                fontSize: '12px',
                fontWeight: 600
              }}
            >
              REPUESTOS
            </span>
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
          const colors: Record<string, { bg: string; text: string }> = {
            'STOCK': { bg: '#D1FAE5', text: '#065F46' },
            'USO': { bg: '#FEF3C7', text: '#92400E' },
            'TRANSITO': { bg: '#DBEAFE', text: '#1E40AF' },
            'PEDIDO': { bg: '#FCE7F3', text: '#9F1239' },
          }
          const color = colors[estado || ''] || { bg: '#F3F4F6', text: '#1F2937' }

          return (
            <span
              style={{
                background: color.bg,
                color: color.text,
                padding: '4px 12px',
                borderRadius: '12px',
                fontSize: '13px',
                fontWeight: 600,
                display: 'inline-block'
              }}
            >
              {row.original.productos_estados?.descripcion || 'N/A'}
            </span>
          )
        },
      },
      {
        id: 'acciones',
        header: 'Acciones',
        cell: ({ row }) => (
          <div style={{ display: 'flex', gap: '8px' }}>
            {canView && (
              <button
                onClick={() => openViewModal(row.original)}
                style={{
                  padding: '6px',
                  background: 'transparent',
                  color: '#6B7280',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'color 0.2s'
                }}
                title="Ver"
                onMouseEnter={(e) => e.currentTarget.style.color = '#3B82F6'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#6B7280'}
              >
                <Eye size={18} />
              </button>
            )}
            {canEdit && (
              <button
                onClick={() => openEditModal(row.original)}
                style={{
                  padding: '6px',
                  background: 'transparent',
                  color: '#6B7280',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'color 0.2s'
                }}
                title="Editar"
                onMouseEnter={(e) => e.currentTarget.style.color = '#10B981'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#6B7280'}
              >
                <Edit size={18} />
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => handleDelete(row.original.id)}
                style={{
                  padding: '6px',
                  background: 'transparent',
                  color: '#6B7280',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'color 0.2s'
                }}
                title="Eliminar"
                onMouseEnter={(e) => e.currentTarget.style.color = '#EF4444'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#6B7280'}
              >
                <Trash2 size={18} />
              </button>
            )}
          </div>
        ),
      },
    ],
    [canView, canEdit, canDelete]
  )

  const filteredData = useMemo(() => {
    return productos.filter((producto) =>
      producto.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      producto.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      producto.proveedor?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      producto.categorias?.nombre.toLowerCase().includes(searchTerm.toLowerCase())
    )
  }, [productos, searchTerm])

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageSize: 10 },
    },
  })

  console.log('ProductosModule render - loading:', loading, 'productos:', productos.length)

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <p>Cargando productos...</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#1F2937', marginBottom: '8px' }}>
          Gestión de Productos
        </h1>
        <p style={{ color: '#6B7280', fontSize: '14px' }}>
          {productos.length} productos registrados
        </p>
      </div>

      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
          <Search
            size={18}
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#9CA3AF',
            }}
          />
          <input
            type="text"
            placeholder="Buscar por código, nombre, proveedor, categoría..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px 10px 40px',
              border: '1px solid #D1D5DB',
              borderRadius: '8px',
              fontSize: '14px',
            }}
          />
        </div>

        {canCreate && (
          <button
            onClick={openCreateModal}
            style={{
              padding: '10px 16px',
              background: '#DC2626',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '14px',
              fontWeight: 600,
            }}
          >
            <Plus size={18} />
            Crear Producto
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{ background: 'white', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} style={{ background: '#F9FAFB', borderBottom: '2px solid #E5E7EB' }}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: '#374151',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                style={{
                  borderBottom: '1px solid #E5E7EB',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#F9FAFB')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} style={{ padding: '12px 16px', fontSize: '14px', color: '#1F2937' }}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        <div style={{ padding: '16px', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '14px', color: '#6B7280' }}>
            Mostrando {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1} a{' '}
            {Math.min((table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize, filteredData.length)} de {filteredData.length} registros
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              style={{
                padding: '8px 12px',
                border: '1px solid #D1D5DB',
                borderRadius: '6px',
                background: 'white',
                cursor: table.getCanPreviousPage() ? 'pointer' : 'not-allowed',
                fontSize: '14px',
              }}
            >
              Anterior
            </button>
            <span style={{ padding: '8px 12px', fontSize: '14px', color: '#6B7280' }}>
              Página {table.getState().pagination.pageIndex + 1} de {table.getPageCount()}
            </span>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              style={{
                padding: '8px 12px',
                border: '1px solid #D1D5DB',
                borderRadius: '6px',
                background: 'white',
                cursor: table.getCanNextPage() ? 'pointer' : 'not-allowed',
                fontSize: '14px',
              }}
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>

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
            background: 'white',
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
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    fontSize: '14px',
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
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    fontSize: '14px',
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
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    fontSize: '14px',
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
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    fontSize: '14px',
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
                      border: '1px solid #D1D5DB',
                      borderRadius: '6px',
                      fontSize: '14px',
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
                      border: '1px solid #D1D5DB',
                      borderRadius: '6px',
                      fontSize: '14px',
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
                      border: '1px solid #D1D5DB',
                      borderRadius: '6px',
                      fontSize: '14px',
                    }}
                  >
                    <option value="REPUESTOS">REPUESTOS</option>
                    <option value="HERRAMIENTAS">HERRAMIENTAS</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 600 }}>
                    Proveedor
                  </label>
                  <input
                    type="text"
                    value={formData.proveedor}
                    onChange={(e) => setFormData({ ...formData, proveedor: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #D1D5DB',
                      borderRadius: '6px',
                      fontSize: '14px',
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
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    fontSize: '14px',
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
                  background: '#F3F4F6',
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
                  background: formData.codigo && formData.nombre && formData.unidad_medida_id && formData.estado_id ? '#DC2626' : '#D1D5DB',
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
            background: 'white',
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
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    fontSize: '14px',
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
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    fontSize: '14px',
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
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    fontSize: '14px',
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
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    fontSize: '14px',
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
                      border: '1px solid #D1D5DB',
                      borderRadius: '6px',
                      fontSize: '14px',
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
                      border: '1px solid #D1D5DB',
                      borderRadius: '6px',
                      fontSize: '14px',
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
                      border: '1px solid #D1D5DB',
                      borderRadius: '6px',
                      fontSize: '14px',
                    }}
                  >
                    <option value="REPUESTOS">REPUESTOS</option>
                    <option value="HERRAMIENTAS">HERRAMIENTAS</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 600 }}>
                    Proveedor
                  </label>
                  <input
                    type="text"
                    value={formData.proveedor}
                    onChange={(e) => setFormData({ ...formData, proveedor: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #D1D5DB',
                      borderRadius: '6px',
                      fontSize: '14px',
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
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    fontSize: '14px',
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
                  background: '#F3F4F6',
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
                  background: formData.codigo && formData.nombre && formData.unidad_medida_id && formData.estado_id ? '#10B981' : '#D1D5DB',
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
            background: 'white',
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
                  borderBottom: '2px solid #DC2626'
                }}>
                  <Package size={20} style={{ color: '#DC2626' }} />
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#DC2626', margin: 0 }}>
                    Información General
                  </h3>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <span style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>Código</span>
                    <span style={{ fontSize: '16px', fontWeight: 700, color: '#DC2626' }}>{selectedProducto.codigo}</span>
                  </div>
                  <div>
                    <span style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>Nombre</span>
                    <span style={{ fontSize: '16px', fontWeight: 600 }}>{selectedProducto.nombre}</span>
                  </div>
                  {selectedProducto.descripcion && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <span style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>Descripción</span>
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
                  borderBottom: '2px solid #DC2626'
                }}>
                  <Tag size={20} style={{ color: '#DC2626' }} />
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#DC2626', margin: 0 }}>
                    Tipo de Producto
                  </h3>
                </div>

                <div style={{ display: 'grid', gap: '16px' }}>
                  <div>
                    <span style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>Clasificación</span>
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
                  borderBottom: '2px solid #DC2626'
                }}>
                  <Info size={20} style={{ color: '#DC2626' }} />
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#DC2626', margin: 0 }}>
                    Detalles Adicionales
                  </h3>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <span style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>Estado</span>
                    <span style={{ fontSize: '14px', fontWeight: 600 }}>
                      {selectedProducto.productos_estados?.descripcion || 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>Unidad de Medida</span>
                    <span style={{ fontSize: '14px', fontWeight: 600 }}>
                      {selectedProducto.unidades_medida?.descripcion || 'N/A'}
                    </span>
                  </div>
                  {selectedProducto.categorias && (
                    <div>
                      <span style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>Categoría</span>
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
                    <span style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>Tipo</span>
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
                      <span style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>Proveedor</span>
                      <span style={{ fontSize: '14px' }}>{selectedProducto.proveedor}</span>
                    </div>
                  )}
                  {selectedProducto.observacion && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <span style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>Observación</span>
                      <span style={{ fontSize: '14px' }}>{selectedProducto.observacion}</span>
                    </div>
                  )}
                </div>

                {/* Stock por Proveedor */}
                <div style={{ gridColumn: '1 / -1', marginTop: '16px' }}>
                  <span style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                    Stock por Proveedor
                  </span>
                  {loadingStock ? (
                    <div style={{ textAlign: 'center', padding: '12px', color: '#6B7280', fontSize: '13px' }}>
                      Cargando stock...
                    </div>
                  ) : stockPorProveedor.length === 0 ? (
                    <div style={{
                      background: '#F3F4F6',
                      padding: '12px',
                      borderRadius: '8px',
                      textAlign: 'center',
                      color: '#6B7280',
                      fontSize: '13px'
                    }}>
                      No hay stock registrado para este producto
                    </div>
                  ) : (
                    <div style={{
                      border: '1px solid #E5E7EB',
                      borderRadius: '8px',
                      overflow: 'hidden'
                    }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                            <th style={{
                              padding: '10px 12px',
                              textAlign: 'left',
                              fontSize: '12px',
                              fontWeight: 700,
                              color: '#374151',
                              textTransform: 'uppercase'
                            }}>
                              Proveedor
                            </th>
                            <th style={{
                              padding: '10px 12px',
                              textAlign: 'center',
                              fontSize: '12px',
                              fontWeight: 700,
                              color: '#374151',
                              textTransform: 'uppercase'
                            }}>
                              Estado
                            </th>
                            <th style={{
                              padding: '10px 12px',
                              textAlign: 'right',
                              fontSize: '12px',
                              fontWeight: 700,
                              color: '#374151',
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
                                borderBottom: idx < stockPorProveedor.length - 1 ? '1px solid #E5E7EB' : 'none',
                                background: 'white'
                              }}
                            >
                              <td style={{ padding: '10px 12px', fontSize: '13px', color: '#1F2937' }}>
                                {stock.proveedor_nombre}
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                <span style={{
                                  background: stock.estado === 'disponible' ? '#D1FAE5' : '#FEF3C7',
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
                                color: '#1F2937'
                              }}>
                                {stock.cantidad} {selectedProducto.unidades_medida?.descripcion || ''}
                              </td>
                            </tr>
                          ))}
                          <tr style={{ background: '#F9FAFB', borderTop: '2px solid #DC2626' }}>
                            <td colSpan={2} style={{
                              padding: '10px 12px',
                              fontSize: '13px',
                              fontWeight: 700,
                              color: '#DC2626',
                              textAlign: 'right'
                            }}>
                              TOTAL:
                            </td>
                            <td style={{
                              padding: '10px 12px',
                              textAlign: 'right',
                              fontSize: '15px',
                              fontWeight: 700,
                              color: '#DC2626'
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
                  borderBottom: '2px solid #DC2626'
                }}>
                  <Calendar size={20} style={{ color: '#DC2626' }} />
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#DC2626', margin: 0 }}>
                    Información de Registro
                  </h3>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <span style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>Creado</span>
                    <span style={{ fontSize: '14px' }}>
                      {new Date(selectedProducto.created_at).toLocaleString('es-CL')}
                    </span>
                  </div>
                  <div>
                    <span style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>Actualizado</span>
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
          color: #1F2937;
          padding-bottom: 12px;
          border-bottom: 2px solid #E5E7EB;
        }

        .detail-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .detail-label {
          font-size: 12px;
          color: #6B7280;
          font-weight: 600;
        }

        .detail-value {
          font-size: 14px;
          color: #1F2937;
        }
      `}</style>
    </div>
  )
}
