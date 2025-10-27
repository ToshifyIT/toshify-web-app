// src/components/admin/RoleMenuPermissionsManager.tsx
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import type { Role, Menu, Submenu } from '../../types/database.types'

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

export function RoleMenuPermissionsManager() {
  const [roles, setRoles] = useState<Role[]>([])
  const [menus, setMenus] = useState<Menu[]>([])
  const [submenus, setSubmenus] = useState<Submenu[]>([])
  const [selectedRole, setSelectedRole] = useState<string>('')
  const [menuPermissions, setMenuPermissions] = useState<RoleMenuPermission[]>([])
  const [submenuPermissions, setSubmenuPermissions] = useState<RoleSubmenuPermission[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

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

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Cargando...</div>
  }

  const selectedRoleData = roles.find(r => r.id === selectedRole)

  return (
    <div>
      <style>{`
        .permissions-container {
          max-width: 1200px;
        }

        .role-selector {
          margin-bottom: 30px;
          padding: 20px;
          background: #F9FAFB;
          border-radius: 12px;
        }

        .select-input {
          width: 100%;
          padding: 12px;
          font-size: 14px;
          border: 1px solid #E5E7EB;
          border-radius: 8px;
          background: white;
        }

        .select-input:focus {
          outline: none;
          border-color: #E63946;
        }

        .role-info-banner {
          margin-top: 15px;
          padding: 15px;
          background: #FEF3C7;
          border: 1px solid #FDE68A;
          border-radius: 8px;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .permissions-grid {
          display: grid;
          gap: 24px;
        }

        .menu-section {
          background: white;
          border: 1px solid #E5E7EB;
          border-radius: 12px;
          overflow: hidden;
        }

        .menu-header {
          background: #1F2937;
          color: white;
          padding: 16px 20px;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .menu-header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
        }

        .permissions-table {
          width: 100%;
          border-collapse: collapse;
        }

        .permissions-table th {
          background: #F9FAFB;
          padding: 12px;
          text-align: left;
          font-size: 12px;
          font-weight: 600;
          color: #6B7280;
          text-transform: uppercase;
          border-bottom: 1px solid #E5E7EB;
        }

        .permissions-table th:first-child {
          width: 40%;
        }

        .permissions-table th:not(:first-child) {
          text-align: center;
          width: 15%;
        }

        .permissions-table td {
          padding: 12px;
          border-bottom: 1px solid #F3F4F6;
        }

        .permissions-table tr:last-child td {
          border-bottom: none;
        }

        .permissions-table td:not(:first-child) {
          text-align: center;
        }

        .submenu-row {
          background: #FAFAFA;
        }

        .submenu-label {
          padding-left: 30px;
          color: #6B7280;
          font-size: 13px;
        }

        .perm-checkbox {
          width: 32px;
          height: 32px;
          border: 2px solid #E5E7EB;
          border-radius: 6px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
          background: white;
        }

        .perm-checkbox:hover {
          border-color: #E63946;
          transform: scale(1.1);
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

        .empty-state {
          padding: 60px 20px;
          text-align: center;
          color: #9CA3AF;
        }

        .empty-state-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }
      `}</style>

      <div className="permissions-container">
        <div className="role-selector">
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
            Seleccionar Rol
          </label>
          <select
            className="select-input"
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
          >
            <option value="">-- Seleccione un rol --</option>
            {roles.map(role => (
              <option key={role.id} value={role.id}>
                {role.name} - {role.description || 'Sin descripción'}
              </option>
            ))}
          </select>

          {selectedRoleData && (
            <div className="role-info-banner">
              <div style={{
                width: '40px',
                height: '40px',
                background: '#F59E0B',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: 'bold',
                fontSize: '18px'
              }}>
                🔑
              </div>
              <div>
                <div style={{ fontWeight: 600, color: '#1F2937', textTransform: 'capitalize' }}>
                  Rol: {selectedRoleData.name}
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
            <div className="empty-state-icon">👆</div>
            <h3 style={{ margin: '0 0 8px 0', color: '#6B7280' }}>
              Selecciona un rol
            </h3>
            <p style={{ margin: 0, fontSize: '14px' }}>
              Elige un rol del selector para gestionar sus permisos de menús y submenús
            </p>
          </div>
        ) : (
          <div className="permissions-grid">
            {menus.map(menu => {
              const menuSubmenus = submenus.filter((sm: any) =>
                sm.menus?.name === menu.name
              )

              return (
                <div key={menu.id} className="menu-section">
                  <div className="menu-header">
                    <span style={{ fontSize: '20px' }}>{menu.icon}</span>
                    <h3>{menu.label}</h3>
                  </div>

                  <table className="permissions-table">
                    <thead>
                      <tr>
                        <th>Elemento</th>
                        <th>Ver</th>
                        <th>Crear</th>
                        <th>Editar</th>
                        <th>Eliminar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Fila del menú principal */}
                      <tr>
                        <td>
                          <strong>{menu.label}</strong>
                        </td>
                        <td>
                          <div
                            className={`perm-checkbox ${getMenuPermission(menu.id, 'can_view') ? 'checked' : ''} ${saving ? 'disabled' : ''}`}
                            onClick={() => !saving && toggleMenuPermission(menu.id, 'can_view')}
                          >
                            {getMenuPermission(menu.id, 'can_view') && '✓'}
                          </div>
                        </td>
                        <td>
                          <div
                            className={`perm-checkbox ${getMenuPermission(menu.id, 'can_create') ? 'checked' : ''} ${saving ? 'disabled' : ''}`}
                            onClick={() => !saving && toggleMenuPermission(menu.id, 'can_create')}
                          >
                            {getMenuPermission(menu.id, 'can_create') && '✓'}
                          </div>
                        </td>
                        <td>
                          <div
                            className={`perm-checkbox ${getMenuPermission(menu.id, 'can_edit') ? 'checked' : ''} ${saving ? 'disabled' : ''}`}
                            onClick={() => !saving && toggleMenuPermission(menu.id, 'can_edit')}
                          >
                            {getMenuPermission(menu.id, 'can_edit') && '✓'}
                          </div>
                        </td>
                        <td>
                          <div
                            className={`perm-checkbox ${getMenuPermission(menu.id, 'can_delete') ? 'checked' : ''} ${saving ? 'disabled' : ''}`}
                            onClick={() => !saving && toggleMenuPermission(menu.id, 'can_delete')}
                          >
                            {getMenuPermission(menu.id, 'can_delete') && '✓'}
                          </div>
                        </td>
                      </tr>

                      {/* Filas de submenús */}
                      {menuSubmenus.map((submenu: any) => (
                        <tr key={submenu.id} className="submenu-row">
                          <td className="submenu-label">
                            ↳ {submenu.label}
                          </td>
                          <td>
                            <div
                              className={`perm-checkbox ${getSubmenuPermission(submenu.id, 'can_view') ? 'checked' : ''} ${saving ? 'disabled' : ''}`}
                              onClick={() => !saving && toggleSubmenuPermission(submenu.id, 'can_view')}
                            >
                              {getSubmenuPermission(submenu.id, 'can_view') && '✓'}
                            </div>
                          </td>
                          <td>
                            <div
                              className={`perm-checkbox ${getSubmenuPermission(submenu.id, 'can_create') ? 'checked' : ''} ${saving ? 'disabled' : ''}`}
                              onClick={() => !saving && toggleSubmenuPermission(submenu.id, 'can_create')}
                            >
                              {getSubmenuPermission(submenu.id, 'can_create') && '✓'}
                            </div>
                          </td>
                          <td>
                            <div
                              className={`perm-checkbox ${getSubmenuPermission(submenu.id, 'can_edit') ? 'checked' : ''} ${saving ? 'disabled' : ''}`}
                              onClick={() => !saving && toggleSubmenuPermission(submenu.id, 'can_edit')}
                            >
                              {getSubmenuPermission(submenu.id, 'can_edit') && '✓'}
                            </div>
                          </td>
                          <td>
                            <div
                              className={`perm-checkbox ${getSubmenuPermission(submenu.id, 'can_delete') ? 'checked' : ''} ${saving ? 'disabled' : ''}`}
                              onClick={() => !saving && toggleSubmenuPermission(submenu.id, 'can_delete')}
                            >
                              {getSubmenuPermission(submenu.id, 'can_delete') && '✓'}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
