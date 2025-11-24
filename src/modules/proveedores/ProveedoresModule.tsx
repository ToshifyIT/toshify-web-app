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
  Building2,
  FileText,
  Phone,
  CreditCard,
  Calendar
} from 'lucide-react'
import { usePermissions } from '../../contexts/PermissionsContext'

interface Proveedor {
  id: string
  razon_social: string
  tipo_documento: 'RUC' | 'DNI' | 'CUIT' | 'CUIL'
  numero_documento: string
  telefono?: string
  email?: string
  direccion?: string
  informacion_pago?: string
  activo: boolean
  observaciones?: string
  created_at: string
  updated_at: string
}

export function ProveedoresModule() {
  const { canCreateInSubmenu, canEditInSubmenu, canDeleteInSubmenu } = usePermissions()

  // Permisos específicos para el submenú de proveedores
  const canCreate = canCreateInSubmenu('proveedores')
  const canEdit = canEditInSubmenu('proveedores')
  const canDelete = canDeleteInSubmenu('proveedores')
  const canView = true // Si llegó aquí, tiene permiso de ver

  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showViewModal, setShowViewModal] = useState(false)
  const [selectedProveedor, setSelectedProveedor] = useState<Proveedor | null>(null)

  // Form states
  const [formData, setFormData] = useState({
    razon_social: '',
    tipo_documento: 'RUC' as 'RUC' | 'DNI' | 'CUIT' | 'CUIL',
    numero_documento: '',
    telefono: '',
    email: '',
    direccion: '',
    informacion_pago: '',
    observaciones: ''
  })

  useEffect(() => {
    loadProveedores()
  }, [])

  const loadProveedores = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('proveedores')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setProveedores(data || [])
    } catch (err: any) {
      console.error('Error cargando proveedores:', err)
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'No se pudieron cargar los proveedores',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!canCreate) {
      Swal.fire({
        icon: 'error',
        title: 'Sin permisos',
        text: 'No tienes permisos para crear proveedores'
      })
      return
    }

    try {
      const { data: userData } = await supabase.auth.getUser()

      const { error } = await (supabase
        .from('proveedores') as any)
        .insert({
          razon_social: formData.razon_social,
          tipo_documento: formData.tipo_documento,
          numero_documento: formData.numero_documento,
          telefono: formData.telefono || null,
          email: formData.email || null,
          direccion: formData.direccion || null,
          informacion_pago: formData.informacion_pago || null,
          observaciones: formData.observaciones || null,
          created_by: userData.user?.id
        })

      if (error) throw error

      Swal.fire({
        icon: 'success',
        title: 'Proveedor creado',
        text: 'El proveedor ha sido creado exitosamente',
        timer: 2000
      })

      setShowCreateModal(false)
      resetForm()
      loadProveedores()
    } catch (err: any) {
      console.error('Error creando proveedor:', err)
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.message || 'No se pudo crear el proveedor',
      })
    }
  }

  const handleEdit = async () => {
    if (!canEdit || !selectedProveedor) {
      Swal.fire({
        icon: 'error',
        title: 'Sin permisos',
        text: 'No tienes permisos para editar proveedores'
      })
      return
    }

    try {
      const updateData: any = {
        razon_social: formData.razon_social,
        tipo_documento: formData.tipo_documento,
        numero_documento: formData.numero_documento,
        telefono: formData.telefono || null,
        email: formData.email || null,
        direccion: formData.direccion || null,
        informacion_pago: formData.informacion_pago || null,
        observaciones: formData.observaciones || null,
        updated_at: new Date().toISOString()
      }

      const { error } = await (supabase
        .from('proveedores') as any)
        .update(updateData)
        .eq('id', selectedProveedor.id)

      if (error) throw error

      Swal.fire({
        icon: 'success',
        title: 'Proveedor actualizado',
        text: 'El proveedor ha sido actualizado exitosamente',
        timer: 2000
      })

      setShowEditModal(false)
      resetForm()
      loadProveedores()
    } catch (err: any) {
      console.error('Error actualizando proveedor:', err)
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.message || 'No se pudo actualizar el proveedor',
      })
    }
  }

  const handleDelete = async (id: string) => {
    if (!canDelete) {
      Swal.fire({
        icon: 'error',
        title: 'Sin permisos',
        text: 'No tienes permisos para eliminar proveedores'
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
          .from('proveedores') as any)
          .delete()
          .eq('id', id)

        if (error) throw error

        Swal.fire({
          icon: 'success',
          title: 'Proveedor eliminado',
          timer: 2000,
          showConfirmButton: false
        })

        loadProveedores()
      } catch (err: any) {
        console.error('Error eliminando proveedor:', err)
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: err.message || 'No se pudo eliminar el proveedor',
        })
      }
    }
  }

  const openCreateModal = () => {
    resetForm()
    setShowCreateModal(true)
  }

  const openEditModal = (proveedor: Proveedor) => {
    setSelectedProveedor(proveedor)
    setFormData({
      razon_social: proveedor.razon_social,
      tipo_documento: proveedor.tipo_documento,
      numero_documento: proveedor.numero_documento,
      telefono: proveedor.telefono || '',
      email: proveedor.email || '',
      direccion: proveedor.direccion || '',
      informacion_pago: proveedor.informacion_pago || '',
      observaciones: proveedor.observaciones || ''
    })
    setShowEditModal(true)
  }

  const openViewModal = (proveedor: Proveedor) => {
    setSelectedProveedor(proveedor)
    setShowViewModal(true)
  }

  const resetForm = () => {
    setFormData({
      razon_social: '',
      tipo_documento: 'RUC',
      numero_documento: '',
      telefono: '',
      email: '',
      direccion: '',
      informacion_pago: '',
      observaciones: ''
    })
    setSelectedProveedor(null)
  }

  const columns = useMemo<ColumnDef<Proveedor>[]>(
    () => [
      {
        accessorKey: 'razon_social',
        header: 'Razón Social',
        cell: ({ getValue }) => (
          <span style={{ fontWeight: 600, color: '#1F2937' }}>
            {getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: 'tipo_documento',
        header: 'Tipo Doc.',
        cell: ({ getValue }) => (
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
            {getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: 'numero_documento',
        header: 'Número Documento',
        cell: ({ getValue }) => (
          <span style={{ fontWeight: 500, color: '#DC2626' }}>
            {getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: 'telefono',
        header: 'Teléfono',
        cell: ({ getValue }) => {
          const value = getValue() as string
          return value || <span style={{ color: '#9CA3AF', fontStyle: 'italic' }}>-</span>
        },
      },
      {
        accessorKey: 'email',
        header: 'Email',
        cell: ({ getValue }) => {
          const value = getValue() as string
          return value || <span style={{ color: '#9CA3AF', fontStyle: 'italic' }}>-</span>
        },
      },
      {
        accessorKey: 'activo',
        header: 'Estado',
        cell: ({ getValue }) => {
          const activo = getValue() as boolean
          return (
            <span
              style={{
                background: activo ? '#D1FAE5' : '#FEE2E2',
                color: activo ? '#065F46' : '#991B1B',
                padding: '4px 12px',
                borderRadius: '12px',
                fontSize: '13px',
                fontWeight: 600,
                display: 'inline-block'
              }}
            >
              {activo ? 'Activo' : 'Inactivo'}
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
    return proveedores.filter((proveedor) =>
      proveedor.razon_social.toLowerCase().includes(searchTerm.toLowerCase()) ||
      proveedor.numero_documento.toLowerCase().includes(searchTerm.toLowerCase()) ||
      proveedor.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      proveedor.telefono?.toLowerCase().includes(searchTerm.toLowerCase())
    )
  }, [proveedores, searchTerm])

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
        <p>Cargando proveedores...</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#1F2937', marginBottom: '8px' }}>
          Gestión de Proveedores
        </h1>
        <p style={{ color: '#6B7280', fontSize: '14px' }}>
          {proveedores.length} proveedores registrados
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
            placeholder="Buscar por razón social, documento, email, teléfono..."
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
            Crear Proveedor
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
              <Building2 size={24} />
              Crear Proveedor
            </h2>

            <div style={{ display: 'grid', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 600 }}>
                  Razón Social *
                </label>
                <input
                  type="text"
                  value={formData.razon_social}
                  onChange={(e) => setFormData({ ...formData, razon_social: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 600 }}>
                    Tipo Documento *
                  </label>
                  <select
                    value={formData.tipo_documento}
                    onChange={(e) => setFormData({ ...formData, tipo_documento: e.target.value as any })}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #D1D5DB',
                      borderRadius: '6px',
                      fontSize: '14px',
                    }}
                  >
                    <option value="RUC">RUC</option>
                    <option value="DNI">DNI</option>
                    <option value="CUIT">CUIT</option>
                    <option value="CUIL">CUIL</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 600 }}>
                    Número de Documento *
                  </label>
                  <input
                    type="text"
                    value={formData.numero_documento}
                    onChange={(e) => setFormData({ ...formData, numero_documento: e.target.value })}
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 600 }}>
                    Teléfono
                  </label>
                  <input
                    type="text"
                    value={formData.telefono}
                    onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
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
                    Email
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
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
                  Dirección
                </label>
                <textarea
                  value={formData.direccion}
                  onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
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

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 600 }}>
                  Información de Pago
                </label>
                <textarea
                  value={formData.informacion_pago}
                  onChange={(e) => setFormData({ ...formData, informacion_pago: e.target.value })}
                  rows={3}
                  placeholder="Ej: CBU, alias, tarjeta, efectivo, transferencia, etc."
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
                  Observaciones
                </label>
                <textarea
                  value={formData.observaciones}
                  onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
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
                disabled={!formData.razon_social || !formData.numero_documento}
                style={{
                  padding: '10px 20px',
                  background: formData.razon_social && formData.numero_documento ? '#DC2626' : '#D1D5DB',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: formData.razon_social && formData.numero_documento ? 'pointer' : 'not-allowed',
                  fontSize: '14px',
                  fontWeight: 600,
                }}
              >
                Crear Proveedor
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedProveedor && (
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
              Editar Proveedor
            </h2>

            <div style={{ display: 'grid', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 600 }}>
                  Razón Social *
                </label>
                <input
                  type="text"
                  value={formData.razon_social}
                  onChange={(e) => setFormData({ ...formData, razon_social: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 600 }}>
                    Tipo Documento *
                  </label>
                  <select
                    value={formData.tipo_documento}
                    onChange={(e) => setFormData({ ...formData, tipo_documento: e.target.value as any })}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #D1D5DB',
                      borderRadius: '6px',
                      fontSize: '14px',
                    }}
                  >
                    <option value="RUC">RUC</option>
                    <option value="DNI">DNI</option>
                    <option value="CUIT">CUIT</option>
                    <option value="CUIL">CUIL</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 600 }}>
                    Número de Documento *
                  </label>
                  <input
                    type="text"
                    value={formData.numero_documento}
                    onChange={(e) => setFormData({ ...formData, numero_documento: e.target.value })}
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 600 }}>
                    Teléfono
                  </label>
                  <input
                    type="text"
                    value={formData.telefono}
                    onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
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
                    Email
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
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
                  Dirección
                </label>
                <textarea
                  value={formData.direccion}
                  onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
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

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 600 }}>
                  Información de Pago
                </label>
                <textarea
                  value={formData.informacion_pago}
                  onChange={(e) => setFormData({ ...formData, informacion_pago: e.target.value })}
                  rows={3}
                  placeholder="Ej: CBU, alias, tarjeta, efectivo, transferencia, etc."
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
                  Observaciones
                </label>
                <textarea
                  value={formData.observaciones}
                  onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
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
                disabled={!formData.razon_social || !formData.numero_documento}
                style={{
                  padding: '10px 20px',
                  background: formData.razon_social && formData.numero_documento ? '#10B981' : '#D1D5DB',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: formData.razon_social && formData.numero_documento ? 'pointer' : 'not-allowed',
                  fontSize: '14px',
                  fontWeight: 600,
                }}
              >
                Actualizar Proveedor
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Modal */}
      {showViewModal && selectedProveedor && (
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
              <Building2 size={24} />
              Detalles del Proveedor
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
                  <FileText size={20} style={{ color: '#DC2626' }} />
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#DC2626', margin: 0 }}>
                    Información General
                  </h3>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <span style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>Razón Social</span>
                    <span style={{ fontSize: '18px', fontWeight: 700, color: '#1F2937' }}>{selectedProveedor.razon_social}</span>
                  </div>
                  <div>
                    <span style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>Tipo de Documento</span>
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
                      {selectedProveedor.tipo_documento}
                    </span>
                  </div>
                  <div>
                    <span style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>Número de Documento</span>
                    <span style={{ fontSize: '16px', fontWeight: 600, color: '#DC2626' }}>{selectedProveedor.numero_documento}</span>
                  </div>
                </div>
              </div>

              {/* Contacto */}
              <div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '16px',
                  paddingBottom: '8px',
                  borderBottom: '2px solid #DC2626'
                }}>
                  <Phone size={20} style={{ color: '#DC2626' }} />
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#DC2626', margin: 0 }}>
                    Información de Contacto
                  </h3>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <span style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>Teléfono</span>
                    <span style={{ fontSize: '14px', fontWeight: 600 }}>
                      {selectedProveedor.telefono || '-'}
                    </span>
                  </div>
                  <div>
                    <span style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>Email</span>
                    <span style={{ fontSize: '14px', fontWeight: 600 }}>
                      {selectedProveedor.email || '-'}
                    </span>
                  </div>
                  {selectedProveedor.direccion && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <span style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>Dirección</span>
                      <span style={{ fontSize: '14px' }}>{selectedProveedor.direccion}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Información de Pago */}
              {selectedProveedor.informacion_pago && (
                <div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '16px',
                    paddingBottom: '8px',
                    borderBottom: '2px solid #DC2626'
                  }}>
                    <CreditCard size={20} style={{ color: '#DC2626' }} />
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#DC2626', margin: 0 }}>
                      Información de Pago
                    </h3>
                  </div>

                  <div>
                    <span style={{ fontSize: '14px', whiteSpace: 'pre-wrap' }}>{selectedProveedor.informacion_pago}</span>
                  </div>
                </div>
              )}

              {/* Observaciones */}
              {selectedProveedor.observaciones && (
                <div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '16px',
                    paddingBottom: '8px',
                    borderBottom: '2px solid #DC2626'
                  }}>
                    <FileText size={20} style={{ color: '#DC2626' }} />
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#DC2626', margin: 0 }}>
                      Observaciones
                    </h3>
                  </div>

                  <div>
                    <span style={{ fontSize: '14px', whiteSpace: 'pre-wrap' }}>{selectedProveedor.observaciones}</span>
                  </div>
                </div>
              )}

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
                    <span style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>Estado</span>
                    <span
                      style={{
                        background: selectedProveedor.activo ? '#D1FAE5' : '#FEE2E2',
                        color: selectedProveedor.activo ? '#065F46' : '#991B1B',
                        padding: '4px 12px',
                        borderRadius: '12px',
                        fontSize: '13px',
                        fontWeight: 600,
                        display: 'inline-block'
                      }}
                    >
                      {selectedProveedor.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                  <div>
                    <span style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>Creado</span>
                    <span style={{ fontSize: '14px' }}>
                      {new Date(selectedProveedor.created_at).toLocaleString('es-AR')}
                    </span>
                  </div>
                  <div>
                    <span style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>Actualizado</span>
                    <span style={{ fontSize: '14px' }}>
                      {new Date(selectedProveedor.updated_at).toLocaleString('es-AR')}
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
    </div>
  )
}
