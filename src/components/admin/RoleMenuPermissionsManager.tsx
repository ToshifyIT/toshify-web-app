// src/components/admin/RoleMenuPermissionsManager.tsx
import { useState, useEffect, useMemo } from 'react'
import { Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Role, Menu, Submenu } from '../../types/database.types'
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

interface RoleMenuPermission {
  role_id: string
  menu_id: string
  menu_name: string
  menu_label: string
  can_view: boolean
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
}

interface RoleSubmenuPermission {
  role_id: string
  submenu_id: string
  submenu_name: string
  submenu_label: string
  can_view: boolean
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
}

interface PermissionRow {
  id: string
  type: 'menu' | 'submenu'
  name: string
  label: string
  parentLabel?: string
  can_view: boolean
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
  menu_id?: string
  submenu_id?: string
}

export function RoleMenuPermissionsManager() {
  const [roles, setRoles] = useState<Role[]>([])
  const [menus, setMenus] = useState<Menu[]>([])
  const [submenus, setSubmenus] = useState<Submenu[]>([])
  const [selectedRole, setSelectedRole] = useState<string>('')
  const [menuPermissions, setMenuPermissions] = useState<RoleMenuPermission[]>([])
  const [submenuPermissions, setSubmenuPermissions] = useState<RoleSubmenuPermission[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [globalFilter, setGlobalFilter] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const [roleSearchTerm, setRoleSearchTerm] = useState('')
  const [showRoleDropdown, setShowRoleDropdown] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (selectedRole) {
      loadRolePermissions(selectedRole)
    }
  }, [selectedRole])

  const loadData = async () => {
    setLoading(true)
    try {
      // Cargar roles
      const { data: rolesData } = await supabase
        .from('roles')
        .select('*')
        .order('name')

      // Cargar menús
      const { data: menusData } = await supabase
        .from('menus')
        .select('*')
        .eq('is_active', true)
        .order('order_index')

      // Cargar submenús
      const { data: submenusData } = await supabase
        .from('submenus')
        .select('*, menus(name)')
        .eq('is_active', true)
        .order('order_index')

      setRoles(rolesData || [])
      setMenus(menusData || [])
      setSubmenus(submenusData || [])
    } catch (err) {
      console.error('Error cargando datos:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadRolePermissions = async (roleId: string) => {
    try {
      console.log('📥 Cargando permisos para rol:', roleId)

      // Cargar permisos de menú del rol
      const { data: menuPermsData, error: menuError } = await supabase
        .from('role_menu_permissions')
        .select(`
          role_id,
          menu_id,
          can_view,
          can_create,
          can_edit,
          can_delete,
          menus (
            id,
            name,
            label
          )
        `)
        .eq('role_id', roleId)

      if (menuError) {
        console.error('Error cargando permisos de menú:', menuError)
      }

      // Cargar permisos de submenú del rol
      const { data: submenuPermsData, error: submenuError } = await supabase
        .from('role_submenu_permissions')
        .select(`
          role_id,
          submenu_id,
          can_view,
          can_create,
          can_edit,
          can_delete,
          submenus (
            id,
            name,
            label
          )
        `)
        .eq('role_id', roleId)

      if (submenuError) {
        console.error('Error cargando permisos de submenú:', submenuError)
      }

      // Transformar datos
      const formattedMenuPerms = (menuPermsData || []).map((p: any) => ({
        role_id: p.role_id,
        menu_id: p.menu_id,
        menu_name: p.menus?.name || '',
        menu_label: p.menus?.label || '',
        can_view: p.can_view,
        can_create: p.can_create,
        can_edit: p.can_edit,
        can_delete: p.can_delete
      }))

      const formattedSubmenuPerms = (submenuPermsData || []).map((p: any) => ({
        role_id: p.role_id,
        submenu_id: p.submenu_id,
        submenu_name: p.submenus?.name || '',
        submenu_label: p.submenus?.label || '',
        can_view: p.can_view,
        can_create: p.can_create,
        can_edit: p.can_edit,
        can_delete: p.can_delete
      }))

      console.log('✅ Permisos de menú cargados:', formattedMenuPerms)
      console.log('✅ Permisos de submenú cargados:', formattedSubmenuPerms)

      setMenuPermissions(formattedMenuPerms)
      setSubmenuPermissions(formattedSubmenuPerms)
    } catch (err) {
      console.error('❌ Error cargando permisos:', err)
    }
  }

  const toggleMenuPermission = async (
    menuId: string,
    field: 'can_view' | 'can_create' | 'can_edit' | 'can_delete'
  ) => {
    if (!selectedRole) {
      console.log('⚠️ No hay rol seleccionado')
      return
    }

    console.log('🔄 Toggling menu permission:', { menuId, field, selectedRole })

    setSaving(true)
    try {
      const existingPerm = menuPermissions.find(p => p.menu_id === menuId)
      const newValue = existingPerm ? !existingPerm[field] : true

      console.log('📝 Estado actual:', existingPerm)
      console.log('✨ Nuevo valor:', newValue)

      if (existingPerm) {
        // Actualizar permiso existente
        console.log('🔧 Actualizando permiso existente...')
        const { data, error } = await supabase
          .from('role_menu_permissions')
          // @ts-expect-error - Tipo generado incorrectamente
          .update({ [field]: newValue })
          .eq('role_id', selectedRole)
          .eq('menu_id', menuId)
          .select()

        console.log('📦 Respuesta update:', { data, error })
        if (error) throw error
      } else {
        // Crear nuevo permiso
        console.log('➕ Creando nuevo permiso...')
        const { data, error } = await supabase
          .from('role_menu_permissions')
          // @ts-expect-error - Tipo generado incorrectamente
          .insert([{
            role_id: selectedRole,
            menu_id: menuId,
            can_view: field === 'can_view',
            can_create: field === 'can_create',
            can_edit: field === 'can_edit',
            can_delete: field === 'can_delete'
          }])
          .select()

        console.log('📦 Respuesta insert:', { data, error })
        if (error) throw error
      }

      console.log('✅ Permiso actualizado, recargando...')
      await loadRolePermissions(selectedRole)
    } catch (err: any) {
      console.error('❌ Error actualizando permiso:', err)
      alert('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const toggleSubmenuPermission = async (
    submenuId: string,
    field: 'can_view' | 'can_create' | 'can_edit' | 'can_delete'
  ) => {
    if (!selectedRole) {
      console.log('⚠️ No hay rol seleccionado')
      return
    }

    console.log('🔄 Toggling submenu permission:', { submenuId, field, selectedRole })

    setSaving(true)
    try {
      const existingPerm = submenuPermissions.find(p => p.submenu_id === submenuId)
      const newValue = existingPerm ? !existingPerm[field] : true

      console.log('📝 Estado actual:', existingPerm)
      console.log('✨ Nuevo valor:', newValue)

      if (existingPerm) {
        console.log('🔧 Actualizando permiso existente...')
        const { data, error } = await supabase
          .from('role_submenu_permissions')
          // @ts-expect-error - Tipo generado incorrectamente
          .update({ [field]: newValue })
          .eq('role_id', selectedRole)
          .eq('submenu_id', submenuId)
          .select()

        console.log('📦 Respuesta update:', { data, error })
        if (error) throw error
      } else {
        console.log('➕ Creando nuevo permiso...')
        const { data, error } = await supabase
          .from('role_submenu_permissions')
          // @ts-expect-error - Tipo generado incorrectamente
          .insert([{
            role_id: selectedRole,
            submenu_id: submenuId,
            can_view: field === 'can_view',
            can_create: field === 'can_create',
            can_edit: field === 'can_edit',
            can_delete: field === 'can_delete'
          }])
          .select()

        console.log('📦 Respuesta insert:', { data, error })
        if (error) throw error
      }

      console.log('✅ Permiso actualizado, recargando...')
      await loadRolePermissions(selectedRole)
    } catch (err: any) {
      console.error('❌ Error actualizando permiso:', err)
      alert('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const getMenuPermission = (menuId: string, field: keyof RoleMenuPermission) => {
    const perm = menuPermissions.find(p => p.menu_id === menuId)
    return perm ? perm[field] : false
  }

  const getSubmenuPermission = (submenuId: string, field: keyof RoleSubmenuPermission) => {
    const perm = submenuPermissions.find(p => p.submenu_id === submenuId)
    return perm ? perm[field] : false
  }

  // Crear estructura de datos plana para la tabla
  const tableData = useMemo<PermissionRow[]>(() => {
    const rows: PermissionRow[] = []

    menus.forEach(menu => {
      // Agregar fila del menú
      rows.push({
        id: menu.id,
        type: 'menu',
        name: menu.name,
        label: menu.label,
        can_view: getMenuPermission(menu.id, 'can_view') as boolean,
        can_create: getMenuPermission(menu.id, 'can_create') as boolean,
        can_edit: getMenuPermission(menu.id, 'can_edit') as boolean,
        can_delete: getMenuPermission(menu.id, 'can_delete') as boolean,
        menu_id: menu.id
      })

      // Agregar filas de submenús
      const menuSubmenus = submenus.filter((sm: any) => sm.menus?.name === menu.name)
      menuSubmenus.forEach((submenu: any) => {
        rows.push({
          id: submenu.id,
          type: 'submenu',
          name: submenu.name,
          label: submenu.label,
          parentLabel: menu.label,
          can_view: getSubmenuPermission(submenu.id, 'can_view') as boolean,
          can_create: getSubmenuPermission(submenu.id, 'can_create') as boolean,
          can_edit: getSubmenuPermission(submenu.id, 'can_edit') as boolean,
          can_delete: getSubmenuPermission(submenu.id, 'can_delete') as boolean,
          submenu_id: submenu.id
        })
      })
    })

    return rows
  }, [menus, submenus, menuPermissions, submenuPermissions])

  // Definir columnas
  const columns = useMemo<ColumnDef<PermissionRow>[]>(
    () => [
      {
        accessorKey: 'type',
        header: 'Tipo',
        cell: ({ getValue }) => {
          const type = getValue() as string
          return (
            <span
              style={{
                display: 'inline-block',
                padding: '4px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                background: type === 'menu' ? '#DBEAFE' : '#E9D5FF',
                color: type === 'menu' ? '#1E40AF' : '#6B21A8',
              }}
            >
              {type === 'menu' ? 'Menú' : 'Submenú'}
            </span>
          )
        },
        enableSorting: true,
      },
      {
        accessorKey: 'label',
        header: 'Elemento',
        cell: ({ row }) => {
          const isSubmenu = row.original.type === 'submenu'
          return (
            <div>
              {isSubmenu && (
                <div style={{ fontSize: '12px', color: '#9CA3AF', marginBottom: '2px' }}>
                  {row.original.parentLabel}
                </div>
              )}
              <div
                style={{
                  fontWeight: isSubmenu ? 400 : 600,
                  color: isSubmenu ? '#6B7280' : '#1F2937',
                  paddingLeft: isSubmenu ? '20px' : '0',
                }}
              >
                {isSubmenu && '↳ '}
                {row.original.label}
              </div>
            </div>
          )
        },
        enableSorting: true,
      },
      {
        accessorKey: 'can_view',
        header: 'Ver',
        cell: ({ row }) => (
          <div
            className={`perm-checkbox ${row.original.can_view ? 'checked' : ''} ${saving ? 'disabled' : ''}`}
            onClick={() => {
              if (saving) return
              if (row.original.type === 'menu' && row.original.menu_id) {
                toggleMenuPermission(row.original.menu_id, 'can_view')
              } else if (row.original.type === 'submenu' && row.original.submenu_id) {
                toggleSubmenuPermission(row.original.submenu_id, 'can_view')
              }
            }}
          >
            {row.original.can_view && <Check size={16} />}
          </div>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'can_create',
        header: 'Crear',
        cell: ({ row }) => (
          <div
            className={`perm-checkbox ${row.original.can_create ? 'checked' : ''} ${saving ? 'disabled' : ''}`}
            onClick={() => {
              if (saving) return
              if (row.original.type === 'menu' && row.original.menu_id) {
                toggleMenuPermission(row.original.menu_id, 'can_create')
              } else if (row.original.type === 'submenu' && row.original.submenu_id) {
                toggleSubmenuPermission(row.original.submenu_id, 'can_create')
              }
            }}
          >
            {row.original.can_create && <Check size={16} />}
          </div>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'can_edit',
        header: 'Editar',
        cell: ({ row }) => (
          <div
            className={`perm-checkbox ${row.original.can_edit ? 'checked' : ''} ${saving ? 'disabled' : ''}`}
            onClick={() => {
              if (saving) return
              if (row.original.type === 'menu' && row.original.menu_id) {
                toggleMenuPermission(row.original.menu_id, 'can_edit')
              } else if (row.original.type === 'submenu' && row.original.submenu_id) {
                toggleSubmenuPermission(row.original.submenu_id, 'can_edit')
              }
            }}
          >
            {row.original.can_edit && <Check size={16} />}
          </div>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'can_delete',
        header: 'Eliminar',
        cell: ({ row }) => (
          <div
            className={`perm-checkbox ${row.original.can_delete ? 'checked' : ''} ${saving ? 'disabled' : ''}`}
            onClick={() => {
              if (saving) return
              if (row.original.type === 'menu' && row.original.menu_id) {
                toggleMenuPermission(row.original.menu_id, 'can_delete')
              } else if (row.original.type === 'submenu' && row.original.submenu_id) {
                toggleSubmenuPermission(row.original.submenu_id, 'can_delete')
              }
            }}
          >
            {row.original.can_delete && <Check size={16} />}
          </div>
        ),
        enableSorting: true,
      },
    ],
    [menuPermissions, submenuPermissions, saving]
  )

  // Configurar TanStack Table
  const table = useReactTable({
    data: tableData,
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

  const selectedRoleData = roles.find(r => r.id === selectedRole)

  // Filtrar roles según búsqueda
  const filteredRoles = roles.filter(role =>
    role.name.toLowerCase().includes(roleSearchTerm.toLowerCase()) ||
    (role.description && role.description.toLowerCase().includes(roleSearchTerm.toLowerCase()))
  )

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Cargando...</div>
  }

  return (
    <div>
      <style>{`
        .permissions-container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
        }

        .role-selector {
          margin-bottom: 30px;
          padding: 24px;
          background: white;
          border-radius: 12px;
          border: 1px solid #E5E7EB;
          box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
        }

        .role-search-container {
          position: relative;
        }

        .select-input {
          width: 100%;
          padding: 12px 16px;
          font-size: 15px;
          border: 1px solid #E5E7EB;
          border-radius: 8px;
          background: white;
          transition: border-color 0.2s;
          cursor: pointer;
        }

        .select-input:focus {
          outline: none;
          border-color: #E63946;
          box-shadow: 0 0 0 3px rgba(230, 57, 70, 0.1);
        }

        .role-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          margin-top: 4px;
          background: white;
          border: 1px solid #E5E7EB;
          border-radius: 8px;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
          max-height: 300px;
          overflow-y: auto;
          z-index: 1000;
        }

        .role-option {
          padding: 12px 16px;
          cursor: pointer;
          transition: background 0.2s;
          border-bottom: 1px solid #F3F4F6;
        }

        .role-option:last-child {
          border-bottom: none;
        }

        .role-option:hover {
          background: #F9FAFB;
        }

        .role-option.selected {
          background: #FEF2F2;
          color: #E63946;
          font-weight: 600;
        }

        .role-info-banner {
          margin-top: 16px;
          padding: 16px;
          background: #F9FAFB;
          border-radius: 8px;
          display: flex;
          align-items: center;
          gap: 12px;
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

        .data-table th:nth-child(3),
        .data-table th:nth-child(4),
        .data-table th:nth-child(5),
        .data-table th:nth-child(6) {
          text-align: center;
          width: 100px;
        }

        .data-table td {
          padding: 12px 16px;
          border-bottom: 1px solid #F3F4F6;
          color: #1F2937;
        }

        .data-table td:nth-child(3),
        .data-table td:nth-child(4),
        .data-table td:nth-child(5),
        .data-table td:nth-child(6) {
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

        .perm-checkbox {
          width: 36px;
          height: 36px;
          border: 2px solid #D1D5DB;
          border-radius: 8px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
          background: white;
          font-size: 16px;
        }

        .perm-checkbox:hover {
          border-color: #E63946;
          background: #FEF2F2;
        }

        .perm-checkbox.checked {
          background: #E63946;
          border-color: #E63946;
          color: white;
        }

        .perm-checkbox.disabled {
          opacity: 0.3;
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

        .empty-state-icon {
          font-size: 64px;
          margin-bottom: 16px;
        }
      `}</style>

      <div className="permissions-container">
        {/* Header */}
        <div style={{ marginBottom: '32px', textAlign: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '24px', fontWeight: '700', color: '#1F2937' }}>
            Menú por Rol
          </h3>
          <p style={{ margin: '8px 0 0 0', fontSize: '15px', color: '#6B7280' }}>
            Configura los permisos de menús y submenús para cada rol del sistema
          </p>
        </div>

        {/* Role Selector with Search */}
        <div className="role-selector">
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '14px', color: '#374151' }}>
            Seleccionar Rol
          </label>
          <div className="role-search-container">
            <input
              type="text"
              className="select-input"
              placeholder={selectedRoleData ? `${selectedRoleData.name} - ${selectedRoleData.description || 'Sin descripción'}` : 'Buscar y seleccionar rol...'}
              value={roleSearchTerm}
              onChange={(e) => setRoleSearchTerm(e.target.value)}
              onFocus={() => setShowRoleDropdown(true)}
              onBlur={() => setTimeout(() => setShowRoleDropdown(false), 200)}
            />
            {showRoleDropdown && (
              <div className="role-dropdown">
                {filteredRoles.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#9CA3AF' }}>
                    No se encontraron roles
                  </div>
                ) : (
                  filteredRoles.map(role => (
                    <div
                      key={role.id}
                      className={`role-option ${selectedRole === role.id ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedRole(role.id)
                        setRoleSearchTerm('')
                        setShowRoleDropdown(false)
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: '2px', textTransform: 'capitalize' }}>
                        {role.name}
                      </div>
                      <div style={{ fontSize: '13px', color: '#6B7280' }}>
                        {role.description || 'Sin descripción'}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {selectedRoleData && (
            <div className="role-info-banner">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <div>
                <div style={{ fontWeight: 600, color: '#1F2937', fontSize: '14px', textTransform: 'capitalize' }}>
                  {selectedRoleData.name}
                </div>
                <div style={{ fontSize: '13px', color: '#6B7280' }}>
                  {selectedRoleData.description || 'Sin descripción'}
                </div>
              </div>
            </div>
          )}
        </div>

        {!selectedRole ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ margin: '0 auto' }}>
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <h3 style={{ margin: '0 0 8px 0', color: '#6B7280', fontSize: '18px' }}>
              Selecciona un rol
            </h3>
            <p style={{ margin: 0, fontSize: '14px' }}>
              Elige un rol del selector para gestionar sus permisos de menús y submenús
            </p>
          </div>
        ) : (
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
                  placeholder="Buscar menú o submenú..."
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
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: header.index > 1 ? 'center' : 'flex-start' }}>
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
        )}
      </div>
    </div>
  )
}
