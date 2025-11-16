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
  Scale,
  Info,
  User,
  Calendar,
  AlertCircle
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

interface ProductoCategoria {
  categoria_id: string
  categorias: Categoria
}

interface Producto {
  id: string
  codigo: string
  nombre: string
  descripcion?: string
  unidad_medida_id: string
  stock_actual: number
  stock_en_uso: number
  estado_id: string
  proveedor?: string
  modelo?: string
  observacion?: string
  created_at: string
  updated_at: string
  unidades_medida?: UnidadMedida
  productos_estados?: ProductoEstado
  productos_categorias?: ProductoCategoria[]
}

export function ProductosModule() {
  const { canCreateInMenu, canEditInMenu, canDeleteInMenu } = usePermissions()

  // Permisos específicos para el menú de productos
  const canCreate = canCreateInMenu('productos')
  const canEdit = canEditInMenu('productos')
  const canDelete = canDeleteInMenu('productos')
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

  // Form states
  const [formData, setFormData] = useState({
    codigo: '',
    nombre: '',
    descripcion: '',
    unidad_medida_id: '',
    stock_actual: 0,
    estado_id: '',
    proveedor: '',
    modelo: '',
    observacion: '',
    categorias_ids: [] as string[]
  })

  useEffect(() => {
    loadProductos()
    loadUnidadesMedida()
    loadEstados()
    loadCategorias()
  }, [])

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
          productos_categorias (
            categoria_id,
            categorias (
              id,
              codigo,
              nombre,
              descripcion
            )
          )
        `)
        .order('created_at', { ascending: false })

      if (error) throw error
      setProductos(data || [])
    } catch (err: any) {
      console.error('Error cargando productos:', err)
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

      const { data: producto, error } = await supabase
        .from('productos')
        .insert({
          codigo: formData.codigo,
          nombre: formData.nombre,
          descripcion: formData.descripcion,
          unidad_medida_id: formData.unidad_medida_id,
          stock_actual: formData.stock_actual,
          stock_en_uso: 0,
          estado_id: formData.estado_id,
          proveedor: formData.proveedor,
          modelo: formData.modelo,
          observacion: formData.observacion,
          created_by: userData.user?.id
        })
        .select()
        .single()

      if (error) throw error

      // Insertar categorías
      if (formData.categorias_ids.length > 0 && producto) {
        const categoriasData = formData.categorias_ids.map(cat_id => ({
          producto_id: producto.id,
          categoria_id: cat_id
        }))

        const { error: catError } = await supabase
          .from('productos_categorias')
          .insert(categoriasData)

        if (catError) throw catError
      }

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
      const { error } = await supabase
        .from('productos')
        .update({
          codigo: formData.codigo,
          nombre: formData.nombre,
          descripcion: formData.descripcion,
          unidad_medida_id: formData.unidad_medida_id,
          stock_actual: formData.stock_actual,
          estado_id: formData.estado_id,
          proveedor: formData.proveedor,
          modelo: formData.modelo,
          observacion: formData.observacion,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedProducto.id)

      if (error) throw error

      // Actualizar categorías
      await supabase
        .from('productos_categorias')
        .delete()
        .eq('producto_id', selectedProducto.id)

      if (formData.categorias_ids.length > 0) {
        const categoriasData = formData.categorias_ids.map(cat_id => ({
          producto_id: selectedProducto.id,
          categoria_id: cat_id
        }))

        const { error: catError } = await supabase
          .from('productos_categorias')
          .insert(categoriasData)

        if (catError) throw catError
      }

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
        const { error } = await supabase
          .from('productos')
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
      stock_actual: producto.stock_actual,
      estado_id: producto.estado_id,
      proveedor: producto.proveedor || '',
      modelo: producto.modelo || '',
      observacion: producto.observacion || '',
      categorias_ids: producto.productos_categorias?.map(pc => pc.categoria_id) || []
    })
    setShowEditModal(true)
  }

  const openViewModal = (producto: Producto) => {
    setSelectedProducto(producto)
    setShowViewModal(true)
  }

  const resetForm = () => {
    setFormData({
      codigo: '',
      nombre: '',
      descripcion: '',
      unidad_medida_id: '',
      stock_actual: 0,
      estado_id: '',
      proveedor: '',
      modelo: '',
      observacion: '',
      categorias_ids: []
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
        id: 'categorias',
        header: 'Categorías',
        cell: ({ row }) => {
          const cats = row.original.productos_categorias || []
          return cats.length > 0 ? (
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              {cats.map((pc, idx) => (
                <span
                  key={idx}
                  style={{
                    background: '#DBEAFE',
                    color: '#1E40AF',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: 500
                  }}
                >
                  {pc.categorias.nombre}
                </span>
              ))}
            </div>
          ) : (
            <span style={{ color: '#9CA3AF', fontStyle: 'italic' }}>Sin categorías</span>
          )
        },
      },
      {
        id: 'stock',
        header: 'Stock',
        cell: ({ row }) => {
          const disponible = row.original.stock_actual - row.original.stock_en_uso
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div style={{ fontSize: '14px', fontWeight: 600 }}>
                Total: {row.original.stock_actual}
              </div>
              <div style={{ fontSize: '12px', color: '#059669' }}>
                Disponible: {disponible}
              </div>
              {row.original.stock_en_uso > 0 && (
                <div style={{ fontSize: '12px', color: '#DC2626' }}>
                  En uso: {row.original.stock_en_uso}
                </div>
              )}
            </div>
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
                  padding: '6px 12px',
                  background: '#3B82F6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '13px'
                }}
              >
                <Eye size={14} />
                Ver
              </button>
            )}
            {canEdit && (
              <button
                onClick={() => openEditModal(row.original)}
                style={{
                  padding: '6px 12px',
                  background: '#10B981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '13px'
                }}
              >
                <Edit size={14} />
                Editar
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => handleDelete(row.original.id)}
                style={{
                  padding: '6px 12px',
                  background: '#EF4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '13px'
                }}
              >
                <Trash2 size={14} />
                Eliminar
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
      producto.productos_categorias?.some(pc =>
        pc.categorias.nombre.toLowerCase().includes(searchTerm.toLowerCase())
      )
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
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

                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 600 }}>
                    Stock Inicial *
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.stock_actual}
                    onChange={(e) => setFormData({ ...formData, stock_actual: Number(e.target.value) })}
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
                  Categorías
                </label>
                <div style={{
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  padding: '12px',
                  maxHeight: '150px',
                  overflowY: 'auto'
                }}>
                  {categorias.map((cat) => (
                    <label key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={formData.categorias_ids.includes(cat.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({ ...formData, categorias_ids: [...formData.categorias_ids, cat.id] })
                          } else {
                            setFormData({ ...formData, categorias_ids: formData.categorias_ids.filter(id => id !== cat.id) })
                          }
                        }}
                        style={{ cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '14px' }}>{cat.nombre}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
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

                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 600 }}>
                    Modelo
                  </label>
                  <input
                    type="text"
                    value={formData.modelo}
                    onChange={(e) => setFormData({ ...formData, modelo: e.target.value })}
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
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

                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 600 }}>
                    Stock Actual *
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.stock_actual}
                    onChange={(e) => setFormData({ ...formData, stock_actual: Number(e.target.value) })}
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
                  Categorías
                </label>
                <div style={{
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  padding: '12px',
                  maxHeight: '150px',
                  overflowY: 'auto'
                }}>
                  {categorias.map((cat) => (
                    <label key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={formData.categorias_ids.includes(cat.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({ ...formData, categorias_ids: [...formData.categorias_ids, cat.id] })
                          } else {
                            setFormData({ ...formData, categorias_ids: formData.categorias_ids.filter(id => id !== cat.id) })
                          }
                        }}
                        style={{ cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '14px' }}>{cat.nombre}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
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

                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 600 }}>
                    Modelo
                  </label>
                  <input
                    type="text"
                    value={formData.modelo}
                    onChange={(e) => setFormData({ ...formData, modelo: e.target.value })}
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

              <div style={{
                background: '#FEF3C7',
                border: '1px solid #FCD34D',
                borderRadius: '6px',
                padding: '12px',
                display: 'flex',
                gap: '8px',
                alignItems: 'start'
              }}>
                <AlertCircle size={18} style={{ color: '#92400E', flexShrink: 0, marginTop: '2px' }} />
                <div style={{ fontSize: '13px', color: '#78350F' }}>
                  <strong>Stock en uso:</strong> {selectedProducto.stock_en_uso}<br />
                  El stock actual no puede ser menor que el stock en uso.
                </div>
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

              {/* Stock */}
              <div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '16px',
                  paddingBottom: '8px',
                  borderBottom: '2px solid #DC2626'
                }}>
                  <Scale size={20} style={{ color: '#DC2626' }} />
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#DC2626', margin: 0 }}>
                    Inventario
                  </h3>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                  <div style={{ background: '#F0FDF4', padding: '16px', borderRadius: '8px' }}>
                    <span style={{ fontSize: '12px', color: '#166534', display: 'block', marginBottom: '4px' }}>Stock Total</span>
                    <span style={{ fontSize: '24px', fontWeight: 700, color: '#166534' }}>{selectedProducto.stock_actual}</span>
                    <span style={{ fontSize: '12px', color: '#166534', marginLeft: '4px' }}>
                      {selectedProducto.unidades_medida?.descripcion}
                    </span>
                  </div>
                  <div style={{ background: '#FEF3C7', padding: '16px', borderRadius: '8px' }}>
                    <span style={{ fontSize: '12px', color: '#92400E', display: 'block', marginBottom: '4px' }}>En Uso</span>
                    <span style={{ fontSize: '24px', fontWeight: 700, color: '#92400E' }}>{selectedProducto.stock_en_uso}</span>
                  </div>
                  <div style={{ background: '#DBEAFE', padding: '16px', borderRadius: '8px' }}>
                    <span style={{ fontSize: '12px', color: '#1E40AF', display: 'block', marginBottom: '4px' }}>Disponible</span>
                    <span style={{ fontSize: '24px', fontWeight: 700, color: '#1E40AF' }}>
                      {selectedProducto.stock_actual - selectedProducto.stock_en_uso}
                    </span>
                  </div>
                </div>
              </div>

              {/* Categorías */}
              {selectedProducto.productos_categorias && selectedProducto.productos_categorias.length > 0 && (
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
                      Categorías
                    </h3>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {selectedProducto.productos_categorias.map((pc, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: '#DBEAFE',
                          color: '#1E40AF',
                          padding: '8px 16px',
                          borderRadius: '20px',
                          fontSize: '14px',
                          fontWeight: 600
                        }}
                      >
                        {pc.categorias.nombre}
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
                  {selectedProducto.proveedor && (
                    <div>
                      <span style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>Proveedor</span>
                      <span style={{ fontSize: '14px' }}>{selectedProducto.proveedor}</span>
                    </div>
                  )}
                  {selectedProducto.modelo && (
                    <div>
                      <span style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>Modelo</span>
                      <span style={{ fontSize: '14px' }}>{selectedProducto.modelo}</span>
                    </div>
                  )}
                  {selectedProducto.observacion && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <span style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>Observación</span>
                      <span style={{ fontSize: '14px' }}>{selectedProducto.observacion}</span>
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
