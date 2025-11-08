// src/components/admin/UserMenuPermissionsManager.tsx
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import type { UserWithRole, Menu, Submenu } from '../../types/database.types'

interface MenuPermission {
  menu_id: string
  menu_name: string
  menu_label: string
  can_view: boolean
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
}

interface SubmenuPermission {
  submenu_id: string
  menu_name: string
  submenu_name: string
  submenu_label: string
  can_view: boolean
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
}

export function UserMenuPermissionsManager() {
  const [users, setUsers] = useState<UserWithRole[]>([])
  const [menus, setMenus] = useState<Menu[]>([])
  const [submenus, setSubmenus] = useState<Submenu[]>([])
  const [selectedUser, setSelectedUser] = useState<string>('')
  const [menuPermissions, setMenuPermissions] = useState<MenuPermission[]>([])
  const [submenuPermissions, setSubmenuPermissions] = useState<SubmenuPermission[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (selectedUser) {
      loadUserPermissions(selectedUser)
    }
  }, [selectedUser])

  const loadData = async () => {
    setLoading(true)
    try {
      // Cargar usuarios
      const { data: usersData } = await supabase
        .from('user_profiles')
        .select('*, roles(*)')
        .order('full_name')

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

      setUsers(usersData as UserWithRole[] || [])
      setMenus(menusData || [])
      setSubmenus(submenusData || [])
    } catch (err) {
      console.error('Error cargando datos:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadUserPermissions = async (userId: string) => {
    try {
      // Cargar permisos de menú del usuario desde la tabla correcta
      const { data: menuPermsData, error: menuError } = await supabase
        .from('user_menu_permissions')
        .select(`
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
        .eq('user_id', userId)

      if (menuError) {
        console.error('Error cargando permisos de menú:', menuError)
      }

      // Cargar permisos de submenú del usuario desde la tabla correcta
      const { data: submenuPermsData, error: submenuError } = await supabase
        .from('user_submenu_permissions')
        .select(`
          submenu_id,
          can_view,
          can_create,
          can_edit,
          can_delete,
          submenus (
            id,
            name,
            label,
            menu_id,
            menus (
              name
            )
          )
        `)
        .eq('user_id', userId)

      if (submenuError) {
        console.error('Error cargando permisos de submenú:', submenuError)
      }

      // Transformar los datos al formato esperado
      const formattedMenuPerms = (menuPermsData || []).map((p: any) => ({
        menu_id: p.menu_id,
        menu_name: p.menus?.name || '',
        menu_label: p.menus?.label || '',
        can_view: p.can_view,
        can_create: p.can_create,
        can_edit: p.can_edit,
        can_delete: p.can_delete
      }))

      const formattedSubmenuPerms = (submenuPermsData || []).map((p: any) => ({
        submenu_id: p.submenu_id,
        menu_name: p.submenus?.menus?.name || '',
        submenu_name: p.submenus?.name || '',
        submenu_label: p.submenus?.label || '',
        can_view: p.can_view,
        can_create: p.can_create,
        can_edit: p.can_edit,
        can_delete: p.can_delete
      }))

      console.log('📋 Permisos de menú cargados:', formattedMenuPerms)
      console.log('📋 Permisos de submenú cargados:', formattedSubmenuPerms)

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
    if (!selectedUser) {
      console.log('⚠️ No hay usuario seleccionado')
      return
    }

    console.log('🔄 Toggling menu permission:', { menuId, field, selectedUser })

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
          .from('user_menu_permissions')
          // @ts-expect-error - Tipo generado incorrectamente
          .update({ [field]: newValue })
          .eq('user_id', selectedUser)
          .eq('menu_id', menuId)
          .select()

        console.log('📦 Respuesta update:', { data, error })
        if (error) throw error
      } else {
        // Crear nuevo permiso
        console.log('➕ Creando nuevo permiso...')
        const { data, error } = await supabase
          .from('user_menu_permissions')
          // @ts-expect-error - Tipo generado incorrectamente
          .insert([{
            user_id: selectedUser,
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
      await loadUserPermissions(selectedUser)
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
    if (!selectedUser) {
      console.log('⚠️ No hay usuario seleccionado')
      return
    }

    console.log('🔄 Toggling submenu permission:', { submenuId, field, selectedUser })

    setSaving(true)
    try {
      const existingPerm = submenuPermissions.find(p => p.submenu_id === submenuId)
      const newValue = existingPerm ? !existingPerm[field] : true

      console.log('📝 Estado actual:', existingPerm)
      console.log('✨ Nuevo valor:', newValue)

      if (existingPerm) {
        console.log('🔧 Actualizando permiso existente...')
        const { data, error } = await supabase
          .from('user_submenu_permissions')
          // @ts-expect-error - Tipo generado incorrectamente
          .update({ [field]: newValue })
          .eq('user_id', selectedUser)
          .eq('submenu_id', submenuId)
          .select()

        console.log('📦 Respuesta update:', { data, error })
        if (error) throw error
      } else {
        console.log('➕ Creando nuevo permiso...')
        const { data, error } = await supabase
          .from('user_submenu_permissions')
          // @ts-expect-error - Tipo generado incorrectamente
          .insert([{
            user_id: selectedUser,
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
      await loadUserPermissions(selectedUser)
    } catch (err: any) {
      console.error('❌ Error actualizando permiso:', err)
      alert('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const getMenuPermission = (menuId: string, field: keyof MenuPermission) => {
    const perm = menuPermissions.find(p => p.menu_id === menuId)
    return perm ? perm[field] : false
  }

  const getSubmenuPermission = (submenuId: string, field: keyof SubmenuPermission) => {
    const perm = submenuPermissions.find(p => p.submenu_id === submenuId)
    return perm ? perm[field] : false
  }

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Cargando...</div>
  }

  const selectedUserData = users.find(u => u.id === selectedUser)

  return (
    <div>
      <style>{`
        .permissions-container {
          max-width: 1000px;
          margin: 0 auto;
        }

        .user-selector {
          margin-bottom: 30px;
          padding: 24px;
          background: white;
          border-radius: 12px;
          border: 1px solid #E5E7EB;
          box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
        }

        .select-input {
          width: 100%;
          padding: 12px 16px;
          font-size: 15px;
          border: 1px solid #E5E7EB;
          border-radius: 8px;
          background: white;
          transition: border-color 0.2s;
        }

        .select-input:focus {
          outline: none;
          border-color: #E63946;
          box-shadow: 0 0 0 3px rgba(230, 57, 70, 0.1);
        }

        .user-info-banner {
          margin-top: 16px;
          padding: 16px;
          background: #F9FAFB;
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
          box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
        }

        .menu-header {
          background: #F9FAFB;
          border-bottom: 2px solid #E5E7EB;
          padding: 16px 20px;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .menu-header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
          color: #1F2937;
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
        {/* Header */}
        <div style={{ marginBottom: '32px', textAlign: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '24px', fontWeight: '700', color: '#1F2937' }}>
            Menú por Usuario
          </h3>
          <p style={{ margin: '8px 0 0 0', fontSize: '15px', color: '#6B7280' }}>
            Asigna permisos de menús y submenús específicos para cada usuario
          </p>
        </div>

        <div className="user-selector">
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
            Seleccionar Usuario
          </label>
          <select
            className="select-input"
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
          >
            <option value="">-- Seleccione un usuario --</option>
            {users.map(user => (
              <option key={user.id} value={user.id}>
                {user.full_name || 'Sin nombre'} ({user.roles?.name || 'Sin rol'})
              </option>
            ))}
          </select>

          {selectedUserData && (
            <div className="user-info-banner">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              <div>
                <div style={{ fontWeight: 600, color: '#1F2937', fontSize: '14px' }}>
                  {selectedUserData.full_name || 'Sin nombre'}
                </div>
                <div style={{ fontSize: '13px', color: '#6B7280' }}>
                  {selectedUserData.roles?.name || 'Sin rol'}
                </div>
              </div>
            </div>
          )}
        </div>

        {!selectedUser ? (
          <div className="empty-state">
            <div className="empty-state-icon">👆</div>
            <h3 style={{ margin: '0 0 8px 0', color: '#6B7280' }}>
              Selecciona un usuario
            </h3>
            <p style={{ margin: 0, fontSize: '14px' }}>
              Elige un usuario del selector para gestionar sus permisos de menús
            </p>
          </div>
        ) : (
          <>
            {/* Buscador */}
            <div style={{ marginBottom: '24px' }}>
              <input
                type="text"
                className="select-input"
                placeholder="🔍 Buscar menú o submenú..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="permissions-grid">
            {menus.filter(menu =>
              menu.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
              submenus.some((sm: any) =>
                sm.menus?.name === menu.name &&
                sm.label.toLowerCase().includes(searchTerm.toLowerCase())
              )
            ).map(menu => {
              const menuSubmenus = submenus.filter((sm: any) =>
                sm.menus?.name === menu.name
              )

              return (
                <div key={menu.id} className="menu-section">
                  <div className="menu-header">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="7" height="7"/>
                      <rect x="14" y="3" width="7" height="7"/>
                      <rect x="14" y="14" width="7" height="7"/>
                      <rect x="3" y="14" width="7" height="7"/>
                    </svg>
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
          </>
        )}
      </div>
    </div>
  )
}
