// src/components/admin/UserManagement.tsx
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import type { UserWithRole, Role } from '../../types/database.types'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'

export function UserManagement() {
  const [users, setUsers] = useState<UserWithRole[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
    fullName: '',
    roleId: ''
  })

  // TanStack Table states
  const [globalFilter, setGlobalFilter] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
  console.log('📥 Cargando datos...')
  setLoading(true)
  setError('')
  
  try {
    const { data: usersData, error: usersError } = await supabase
      .from('user_profiles')
      .select(`
        *,
        roles (*)
      `)
      .order('created_at', { ascending: false })

    console.log('👥 Usuarios cargados:', usersData)
    console.log('⚠️ Error usuarios:', usersError)

    if (usersError) throw usersError

    const { data: rolesData, error: rolesError } = await supabase
      .from('roles')
      .select('*')
      .order('name')

    console.log('🏷️ Roles cargados:', rolesData)
    console.log('⚠️ Error roles:', rolesError)

    if (rolesError) throw rolesError

    setUsers(usersData as UserWithRole[])
    setRoles(rolesData)
    console.log('✅ Estado actualizado')
  } catch (err: any) {
    console.error('❌ Error cargando datos:', err)
    setError(err.message)
  } finally {
    setLoading(false)
  }
}

  const handleCreateUser = async () => {
    if (!newUser.email || !newUser.password || !newUser.fullName) {
      alert('Complete todos los campos requeridos')
      return
    }

    setCreating(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        throw new Error('No hay sesión activa')
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify(newUser)
        }
      )

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Error creando usuario')
      }

      alert('✅ Usuario creado exitosamente')
      setShowCreateModal(false)
      setNewUser({ email: '', password: '', fullName: '', roleId: '' })
      await loadData()
    } catch (err: any) {
      alert('❌ Error: ' + err.message)
    } finally {
      setCreating(false)
    }
  }

const handleRoleChange = async (userId: string, newRoleId: string) => {
  console.log('🔄 Intentando cambiar rol:', { userId, newRoleId })
  
  try {
    // Verificar que hay un rol seleccionado
    if (!newRoleId) {
      console.log('⚠️ No se seleccionó rol')
      alert('Selecciona un rol válido')
      return
    }

    // Hacer el update
    const { data, error } = await supabase
      .from('user_profiles')
      // @ts-expect-error - Tipo generado incorrectamente por Supabase CLI
      .update({ role_id: newRoleId })
      .eq('id', userId)
      .select()

    console.log('📦 Respuesta de Supabase:', { data, error })

    if (error) {
      console.error('❌ Error de Supabase:', error)
      throw error
    }

    console.log('✅ Rol actualizado en DB')

    // Recargar datos
    await loadData()
    console.log('✅ Datos recargados')
    
    alert('✅ Rol actualizado correctamente')
  } catch (err: any) {
    console.error('❌ Error completo:', err)
    alert('❌ Error al actualizar rol: ' + err.message)
  }
}

  const toggleUserStatus = async (userId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('user_profiles')
        // @ts-expect-error - Tipo generado incorrectamente por Supabase CLI
        .update({ is_active: !currentStatus })
        .eq('id', userId)

      if (error) throw error

      await loadData()
      alert(`Usuario ${!currentStatus ? 'activado' : 'desactivado'} correctamente`)
    } catch (err: any) {
      alert('Error al cambiar estado: ' + err.message)
    }
  }

  // Definir columnas para TanStack Table
  const columns = useMemo<ColumnDef<UserWithRole>[]>(
    () => [
      {
        accessorKey: 'full_name',
        header: 'Usuario',
        cell: ({ getValue }) => <strong>{(getValue() as string) || 'Sin nombre'}</strong>,
        enableSorting: true,
      },
      {
        accessorKey: 'id',
        header: 'ID',
        cell: ({ getValue }) => (
          <span style={{ fontSize: '12px', color: '#6B7280', fontFamily: 'monospace' }}>
            {(getValue() as string).substring(0, 8)}...
          </span>
        ),
        enableSorting: false,
      },
      {
        accessorKey: 'role_id',
        header: 'Rol',
        cell: ({ row }) => (
          <select
            className="select-role"
            value={row.original.role_id || ''}
            onChange={(e) => handleRoleChange(row.original.id, e.target.value)}
          >
            <option value="">Sin rol</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'is_active',
        header: 'Estado',
        cell: ({ getValue }) => {
          const isActive = getValue() as boolean
          return (
            <span className={`badge ${isActive ? 'badge-active' : 'badge-inactive'}`}>
              {isActive ? 'Activo' : 'Inactivo'}
            </span>
          )
        },
        enableSorting: true,
      },
      {
        accessorKey: 'created_at',
        header: 'Fecha Registro',
        cell: ({ getValue }) => new Date(getValue() as string).toLocaleDateString('es-ES'),
        enableSorting: true,
      },
      {
        id: 'acciones',
        header: 'Acciones',
        cell: ({ row }) => (
          <button
            className="btn-toggle"
            onClick={() => toggleUserStatus(row.original.id, row.original.is_active)}
          >
            {row.original.is_active ? 'Desactivar' : 'Activar'}
          </button>
        ),
        enableSorting: false,
      },
    ],
    [roles]
  )

  // Configurar TanStack Table
  const table = useReactTable({
    data: users,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  })

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: '#6B7280' }}>
        Cargando usuarios...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ 
        padding: '16px', 
        background: '#FEE2E2', 
        color: '#DC2626', 
        borderRadius: '8px' 
      }}>
        Error: {error}
      </div>
    )
  }

  return (
    <div>
      <style>{`
        .users-container {
          max-width: 1400px;
          margin: 0 auto;
          padding: 20px;
        }

        .search-filter-container {
          margin-bottom: 20px;
        }

        .search-input {
          width: 100%;
          padding: 12px 16px 12px 42px;
          font-size: 15px;
          border: 1px solid #E5E7EB;
          border-radius: 8px;
          background: white;
          transition: border-color 0.2s;
        }

        .search-input:focus {
          outline: none;
          border-color: #E63946;
          box-shadow: 0 0 0 3px rgba(230, 57, 70, 0.1);
        }

        .table-container {
          background: white;
          border: 1px solid #E5E7EB;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
        }

        .data-table {
          width: 100%;
          border-collapse: collapse;
        }

        .data-table th {
          background: #F9FAFB;
          padding: 14px 16px;
          text-align: left;
          font-size: 12px;
          font-weight: 600;
          color: #6B7280;
          text-transform: uppercase;
          border-bottom: 2px solid #E5E7EB;
          cursor: pointer;
          user-select: none;
        }

        .data-table th.sortable:hover {
          background: #F3F4F6;
        }

        .data-table th:last-child {
          text-align: center;
        }

        .data-table td {
          padding: 12px 16px;
          border-bottom: 1px solid #F3F4F6;
          color: #1F2937;
        }

        .data-table td:last-child {
          text-align: center;
        }

        .data-table tbody tr {
          transition: background 0.2s;
        }

        .data-table tbody tr:hover {
          background: #F9FAFB;
        }

        .sort-indicator {
          margin-left: 8px;
          color: #9CA3AF;
          font-size: 14px;
        }

        .badge {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
        }

        .badge-active {
          background: #D1FAE5;
          color: #065F46;
        }

        .badge-inactive {
          background: #FEE2E2;
          color: #DC2626;
        }

        .select-role {
          padding: 6px 10px;
          border: 1px solid #E5E7EB;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
        }

        .btn-toggle {
          padding: 6px 12px;
          border: 1px solid #E5E7EB;
          border-radius: 6px;
          background: white;
          color: #1F2937;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
        }

        .btn-toggle:hover {
          background: #F9FAFB;
          border-color: #E63946;
          color: #E63946;
        }

        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .modal-content {
          background: white;
          padding: 40px;
          border-radius: 16px;
          max-width: 500px;
          width: 90%;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        }

        .form-group {
          margin-bottom: 16px;
        }

        .form-label {
          display: block;
          margin-bottom: 8px;
          font-weight: 600;
          font-size: 14px;
          color: #1F2937;
        }

        .form-input {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #E5E7EB;
          border-radius: 6px;
          font-size: 14px;
          font-family: inherit;
        }

        .form-input:focus {
          outline: none;
          border-color: #E63946;
        }

        .btn-primary {
          padding: 12px 28px;
          background: #E63946;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 4px 6px rgba(230, 57, 70, 0.2);
        }

        .btn-primary:hover {
          background: #D62828;
          transform: translateY(-2px);
          box-shadow: 0 6px 12px rgba(230, 57, 70, 0.3);
        }

        .btn-primary:disabled {
          background: #9CA3AF;
          cursor: not-allowed;
        }

        .btn-secondary {
          padding: 10px 20px;
          background: white;
          color: #6B7280;
          border: 1px solid #E5E7EB;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-secondary:hover {
          background: #F9FAFB;
        }

        .btn-secondary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .pagination {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          border-top: 1px solid #E5E7EB;
          background: #FAFAFA;
        }

        .pagination-info {
          font-size: 14px;
          color: #6B7280;
        }

        .pagination-controls {
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .pagination-controls button {
          padding: 8px 12px;
          border: 1px solid #E5E7EB;
          background: white;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          color: #374151;
          transition: all 0.2s;
        }

        .pagination-controls button:hover:not(:disabled) {
          background: #F9FAFB;
          border-color: #E63946;
          color: #E63946;
        }

        .pagination-controls button:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .pagination-controls select {
          padding: 8px 12px;
          border: 1px solid #E5E7EB;
          border-radius: 6px;
          font-size: 14px;
          background: white;
          cursor: pointer;
        }

        .empty-state {
          padding: 80px 20px;
          text-align: center;
          color: #9CA3AF;
        }

        @media (max-width: 768px) {
          .modal-content {
            padding: 24px;
          }
          .form-group {
            margin-bottom: 12px;
          }
        }
      `}</style>

      <div className="users-container">

        {/* Header */}
        <div style={{ marginBottom: '32px', textAlign: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '24px', fontWeight: '700', color: '#1F2937' }}>
            Gestión de Usuarios
          </h3>
          <p style={{ margin: '8px 0 0 0', fontSize: '15px', color: '#6B7280' }}>
            {users.length} usuario{users.length !== 1 ? 's' : ''} registrado{users.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Action Button */}
        <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            className="btn-primary"
            onClick={() => setShowCreateModal(true)}
          >
            + Crear Usuario
          </button>
        </div>

        {users.length > 0 ? (
          <>
            {/* Search Filter */}
            <div className="search-filter-container">
              <div style={{ position: 'relative' }}>
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#9CA3AF"
                  strokeWidth="2"
                  style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }}
                >
                  <circle cx="11" cy="11" r="8"/>
                  <path d="M21 21l-4.35-4.35"/>
                </svg>
                <input
                  type="text"
                  className="search-input"
                  placeholder="Buscar por nombre, email, ID..."
                  value={globalFilter}
                  onChange={(e) => setGlobalFilter(e.target.value)}
                />
              </div>
            </div>

            {/* Table */}
            <div className="table-container">
              <table className="data-table">
                <thead>
                  {table.getHeaderGroups().map(headerGroup => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map(header => (
                        <th
                          key={header.id}
                          onClick={header.column.getToggleSortingHandler()}
                          className={header.column.getCanSort() ? 'sortable' : ''}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: header.id === 'acciones' ? 'center' : 'flex-start' }}>
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {header.column.getCanSort() && (
                              <span className="sort-indicator">
                                {{
                                  asc: ' ↑',
                                  desc: ' ↓',
                                }[header.column.getIsSorted() as string] ?? ' ↕'}
                              </span>
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: '#9CA3AF' }}>
                        No se encontraron resultados
                      </td>
                    </tr>
                  ) : (
                    table.getRowModel().rows.map(row => (
                      <tr key={row.id}>
                        {row.getVisibleCells().map(cell => (
                          <td key={cell.id}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              {/* Pagination */}
              {table.getRowModel().rows.length > 0 && (
                <div className="pagination">
                  <div className="pagination-info">
                    Mostrando {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1} a{' '}
                    {Math.min(
                      (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
                      table.getFilteredRowModel().rows.length
                    )}{' '}
                    de {table.getFilteredRowModel().rows.length} registros
                  </div>
                  <div className="pagination-controls">
                    <button onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()}>
                      {'<<'}
                    </button>
                    <button onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
                      {'<'}
                    </button>
                    <span style={{ fontSize: '14px', color: '#6B7280' }}>
                      Página {table.getState().pagination.pageIndex + 1} de {table.getPageCount()}
                    </span>
                    <button onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
                      {'>'}
                    </button>
                    <button onClick={() => table.setPageIndex(table.getPageCount() - 1)} disabled={!table.getCanNextPage()}>
                      {'>>'}
                    </button>
                    <select
                      value={table.getState().pagination.pageSize}
                      onChange={e => table.setPageSize(Number(e.target.value))}
                    >
                      {[10, 20, 30, 50].map(pageSize => (
                        <option key={pageSize} value={pageSize}>
                          {pageSize} por página
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="empty-state">
            <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ margin: '0 auto 16px' }}>
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            <h3 style={{ margin: '0 0 8px 0', color: '#6B7280', fontSize: '18px' }}>
              No hay usuarios registrados
            </h3>
            <p style={{ margin: 0, fontSize: '14px' }}>
              Crea el primero usando el botón "+ Crear Usuario".
            </p>
          </div>
        )}
      </div>

      {/* Modal para crear usuario */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => !creating && setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0, fontSize: '20px', fontWeight: '700' }}>
              Crear Nuevo Usuario
            </h2>
            <p style={{ color: '#6B7280', fontSize: '14px', marginBottom: '24px' }}>
              Completa los datos del nuevo usuario del sistema
            </p>

            <div className="form-group">
              <label className="form-label">Nombre Completo *</label>
              <input
                type="text"
                className="form-input"
                value={newUser.fullName}
                onChange={(e) => setNewUser({ ...newUser, fullName: e.target.value })}
                placeholder="Juan Pérez"
                disabled={creating}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Email *</label>
              <input
                type="email"
                className="form-input"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                placeholder="usuario@toshify.com"
                disabled={creating}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Contraseña *</label>
              <input
                type="password"
                className="form-input"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                placeholder="Mínimo 6 caracteres"
                disabled={creating}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Rol</label>
              <select
                className="form-input"
                value={newUser.roleId}
                onChange={(e) => setNewUser({ ...newUser, roleId: e.target.value })}
                disabled={creating}
              >
                <option value="">Sin rol</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowCreateModal(false)
                  setNewUser({ email: '', password: '', fullName: '', roleId: '' })
                }}
                disabled={creating}
              >
                Cancelar
              </button>
              <button
                className="btn-primary"
                onClick={handleCreateUser}
                disabled={creating}
              >
                {creating ? 'Creando...' : 'Crear Usuario'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}