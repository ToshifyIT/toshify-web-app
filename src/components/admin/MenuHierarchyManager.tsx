// src/components/admin/MenuHierarchyManager.tsx
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import type { Menu, Submenu } from '../../types/database.types'

interface MenuWithSubmenus extends Menu {
  submenus?: SubmenuNode[]
}

interface SubmenuNode extends Submenu {
  children?: SubmenuNode[]
}

export function MenuHierarchyManager() {
  const [menus, setMenus] = useState<MenuWithSubmenus[]>([])
  const [selectedMenu, setSelectedMenu] = useState<Menu | null>(null)
  const [loading, setLoading] = useState(true)
  const [showMenuModal, setShowMenuModal] = useState(false)
  const [showSubmenuModal, setShowSubmenuModal] = useState(false)
  const [editingMenu, setEditingMenu] = useState<Menu | null>(null)
  const [editingSubmenu, setEditingSubmenu] = useState<Submenu | null>(null)
  const [parentSubmenu, setParentSubmenu] = useState<Submenu | null>(null)
  const [saving, setSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  const [menuForm, setMenuForm] = useState({
    name: '',
    label: '',
    icon: '',
    route: '',
    order_index: 0
  })

  const [submenuForm, setSubmenuForm] = useState({
    name: '',
    label: '',
    icon: '',
    route: '',
    order_index: 0,
    parent_id: null as string | null
  })

  useEffect(() => {
    loadMenus()
  }, [])

  const loadMenus = async () => {
    setLoading(true)
    try {
      const { data: menusData, error: menusError } = await supabase
        .from('menus')
        .select('*')
        .order('order_index')

      if (menusError) throw menusError

      const { data: submenusData, error: submenusError } = await supabase
        .from('submenus')
        .select('*')
        .order('level, order_index')

      if (submenusError) throw submenusError

      // Construir árbol jerárquico
      const menusWithTree = (menusData as Menu[]).map(menu => ({
        ...menu,
        submenus: buildSubmenuTree((submenusData as Submenu[]).filter(s => s.menu_id === menu.id))
      }))

      setMenus(menusWithTree)
    } catch (err) {
      console.error('Error cargando menús:', err)
    } finally {
      setLoading(false)
    }
  }

  const buildSubmenuTree = (submenus: Submenu[], parentId: string | null = null): SubmenuNode[] => {
    return submenus
      .filter(s => s.parent_id === parentId)
      .map(submenu => ({
        ...submenu,
        children: buildSubmenuTree(submenus, submenu.id)
      }))
      .sort((a, b) => a.order_index - b.order_index)
  }

  const handleCreateMenu = async () => {
    if (!menuForm.name || !menuForm.label) {
      alert('Nombre y etiqueta son requeridos')
      return
    }

    setSaving(true)
    try {
      const { error } = await supabase
        .from('menus')
        // @ts-expect-error - Tipo generado incorrectamente
        .insert([menuForm])

      if (error) throw error

      alert('✅ Menú creado exitosamente')
      setShowMenuModal(false)
      resetMenuForm()
      await loadMenus()
    } catch (err: any) {
      alert('❌ Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateMenu = async () => {
    if (!editingMenu) return

    setSaving(true)
    try {
      const { error } = await supabase
        .from('menus')
        // @ts-expect-error - Tipo generado incorrectamente
        .update(menuForm)
        .eq('id', editingMenu.id)

      if (error) throw error

      alert('✅ Menú actualizado exitosamente')
      setShowMenuModal(false)
      setEditingMenu(null)
      resetMenuForm()
      await loadMenus()
    } catch (err: any) {
      alert('❌ Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteMenu = async (menu: Menu) => {
    if (!confirm(`¿Eliminar menú "${menu.label}" y todos sus submenús?`)) return

    try {
      const { error } = await supabase
        .from('menus')
        .delete()
        .eq('id', menu.id)

      if (error) throw error

      alert('✅ Menú eliminado')
      await loadMenus()
    } catch (err: any) {
      alert('❌ Error: ' + err.message)
    }
  }

  const handleCreateSubmenu = async () => {
    if (!selectedMenu || !submenuForm.name || !submenuForm.label) {
      alert('Selecciona un menú y completa los campos requeridos')
      return
    }

    setSaving(true)
    try {
      // Calcular el nivel basado en el parent
      let level = 1
      if (submenuForm.parent_id) {
        const { data: parent } = await supabase
          .from('submenus')
          .select('level')
          .eq('id', submenuForm.parent_id)
          .single()

        level = ((parent as Submenu | null)?.level || 0) + 1
      }

      const { error } = await supabase
        .from('submenus')
        // @ts-expect-error - Tipo generado incorrectamente
        .insert([{
          ...submenuForm,
          menu_id: selectedMenu.id,
          level
        }])

      if (error) throw error

      alert('✅ Submenú creado exitosamente')
      setShowSubmenuModal(false)
      setParentSubmenu(null)
      resetSubmenuForm()
      await loadMenus()
    } catch (err: any) {
      alert('❌ Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateSubmenu = async () => {
    if (!editingSubmenu) return

    setSaving(true)
    try {
      const { error } = await supabase
        .from('submenus')
        // @ts-expect-error - Tipo generado incorrectamente
        .update({
          name: submenuForm.name,
          label: submenuForm.label,
          icon: submenuForm.icon,
          route: submenuForm.route,
          order_index: submenuForm.order_index
        })
        .eq('id', editingSubmenu.id)

      if (error) throw error

      alert('✅ Submenú actualizado')
      setShowSubmenuModal(false)
      setEditingSubmenu(null)
      resetSubmenuForm()
      await loadMenus()
    } catch (err: any) {
      alert('❌ Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteSubmenu = async (submenu: Submenu) => {
    if (!confirm(`¿Eliminar "${submenu.label}" y todos sus hijos?`)) return

    try {
      const { error } = await supabase
        .from('submenus')
        .delete()
        .eq('id', submenu.id)

      if (error) throw error

      alert('✅ Submenú eliminado')
      await loadMenus()
    } catch (err: any) {
      alert('❌ Error: ' + err.message)
    }
  }

  const openCreateSubmenuModal = (menu: Menu, parent: Submenu | null = null) => {
    setSelectedMenu(menu)
    setParentSubmenu(parent)
    setSubmenuForm({
      ...submenuForm,
      parent_id: parent?.id || null
    })
    setShowSubmenuModal(true)
  }

  const openEditMenuModal = (menu: Menu) => {
    setEditingMenu(menu)
    setMenuForm({
      name: menu.name,
      label: menu.label,
      icon: menu.icon || '',
      route: menu.route || '',
      order_index: menu.order_index
    })
    setShowMenuModal(true)
  }

  const openEditSubmenuModal = (submenu: Submenu) => {
    setEditingSubmenu(submenu)
    setSubmenuForm({
      name: submenu.name,
      label: submenu.label,
      icon: submenu.icon || '',
      route: submenu.route || '',
      order_index: submenu.order_index,
      parent_id: submenu.parent_id
    })
    setShowSubmenuModal(true)
  }

  const resetMenuForm = () => {
    setMenuForm({
      name: '',
      label: '',
      icon: '',
      route: '',
      order_index: 0
    })
  }

  const resetSubmenuForm = () => {
    setSubmenuForm({
      name: '',
      label: '',
      icon: '',
      route: '',
      order_index: 0,
      parent_id: null
    })
  }

  const renderSubmenuTree = (submenus: SubmenuNode[], depth = 0) => {
    return submenus.map(submenu => (
      <div key={submenu.id}>
        <div
          className="submenu-item"
          style={{ marginLeft: `${depth * 24}px` }}
        >
          <div className="submenu-info">
            <span className="submenu-level">L{submenu.level}</span>
            {submenu.icon && <span>{submenu.icon}</span>}
            <strong>{submenu.label}</strong>
            <span className="submenu-name">({submenu.name})</span>
            {submenu.route && (
              <span className="submenu-route">{submenu.route}</span>
            )}
          </div>
          <div className="submenu-actions">
            <button
              className="btn-action btn-add"
              onClick={() => openCreateSubmenuModal(selectedMenu!, submenu)}
              title="Agregar hijo"
            >
              ➕
            </button>
            <button
              className="btn-action btn-edit"
              onClick={() => openEditSubmenuModal(submenu)}
            >
              ✏️
            </button>
            <button
              className="btn-action btn-delete"
              onClick={() => handleDeleteSubmenu(submenu)}
            >
              🗑️
            </button>
          </div>
        </div>
        {submenu.children && submenu.children.length > 0 && (
          <div className="submenu-children">
            {renderSubmenuTree(submenu.children, depth + 1)}
          </div>
        )}
      </div>
    ))
  }

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Cargando...</div>
  }

  return (
    <div>
      <style>{`
        .menu-manager {
          max-width: 1200px;
        }

        .header-section {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }

        .btn-create {
          padding: 10px 20px;
          background: #E63946;
          color: white;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-create:hover {
          background: #D62828;
        }

        .menus-grid {
          display: grid;
          gap: 20px;
        }

        .menu-card {
          background: white;
          border: 1px solid #E5E7EB;
          border-radius: 12px;
          overflow: hidden;
        }

        .menu-header {
          background: linear-gradient(135deg, #1F2937 0%, #374151 100%);
          color: white;
          padding: 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .menu-title {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .menu-title h3 {
          margin: 0;
          font-size: 18px;
        }

        .menu-meta {
          font-size: 12px;
          opacity: 0.8;
          margin-top: 4px;
        }

        .menu-actions {
          display: flex;
          gap: 8px;
        }

        .btn-action {
          width: 36px;
          height: 36px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 16px;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .btn-action.btn-add {
          background: #10B981;
          color: white;
        }

        .btn-action.btn-add:hover {
          background: #059669;
        }

        .btn-action.btn-edit {
          background: #3B82F6;
          color: white;
        }

        .btn-action.btn-edit:hover {
          background: #2563EB;
        }

        .btn-action.btn-delete {
          background: #EF4444;
          color: white;
        }

        .btn-action.btn-delete:hover {
          background: #DC2626;
        }

        .menu-body {
          padding: 20px;
        }

        .submenu-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px;
          border-bottom: 1px solid #F3F4F6;
          transition: all 0.2s;
        }

        .submenu-item:hover {
          background: #F9FAFB;
        }

        .submenu-info {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
        }

        .submenu-level {
          background: #E63946;
          color: white;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: bold;
        }

        .submenu-name {
          color: #9CA3AF;
          font-size: 13px;
          font-family: monospace;
        }

        .submenu-route {
          color: #6B7280;
          font-size: 12px;
          font-family: monospace;
          margin-left: auto;
        }

        .submenu-actions {
          display: flex;
          gap: 4px;
        }

        .submenu-actions .btn-action {
          width: 32px;
          height: 32px;
          font-size: 14px;
        }

        .empty-state {
          padding: 40px;
          text-align: center;
          color: #9CA3AF;
        }

        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .modal-content {
          background: white;
          padding: 32px;
          border-radius: 12px;
          max-width: 600px;
          width: 90%;
          max-height: 90vh;
          overflow-y: auto;
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

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        .modal-actions {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
          margin-top: 24px;
        }

        .btn-secondary {
          padding: 10px 20px;
          background: white;
          color: #6B7280;
          border: 1px solid #E5E7EB;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
        }

        .btn-secondary:hover {
          background: #F9FAFB;
        }

        .info-banner {
          background: #EFF6FF;
          border: 1px solid #BFDBFE;
          border-radius: 8px;
          padding: 12px;
          margin-bottom: 16px;
          font-size: 13px;
          color: #1E40AF;
        }
      `}</style>

      <div className="menu-manager">
        {/* Header */}
        <div style={{ marginBottom: '32px', textAlign: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '24px', fontWeight: '700', color: '#1F2937' }}>
            Gestor de Menús
          </h3>
          <p style={{ margin: '8px 0 0 0', fontSize: '15px', color: '#6B7280' }}>
            Administra la estructura jerárquica de menús y submenús del sistema
          </p>
        </div>

        {/* Action Button */}
        <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn-create" onClick={() => setShowMenuModal(true)}>
            + Crear Menú
          </button>
        </div>

        {/* Buscador */}
        <div style={{ marginBottom: '24px' }}>
          <input
            type="text"
            className="form-input"
            placeholder="🔍 Buscar menú o submenú..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>

        <div className="menus-grid">
          {menus.filter(menu =>
            menu.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
            menu.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (menu.submenus || []).some(sub =>
              sub.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
              sub.name.toLowerCase().includes(searchTerm.toLowerCase())
            )
          ).map(menu => (
            <div key={menu.id} className="menu-card">
              <div className="menu-header">
                <div className="menu-title">
                  {menu.icon && <span style={{ fontSize: '24px' }}>{menu.icon}</span>}
                  <div>
                    <h3>{menu.label}</h3>
                    <div className="menu-meta">
                      {menu.name} {menu.route && `• ${menu.route}`}
                    </div>
                  </div>
                </div>
                <div className="menu-actions">
                  <button
                    className="btn-action btn-add"
                    onClick={() => openCreateSubmenuModal(menu)}
                    title="Agregar submenú"
                  >
                    ➕
                  </button>
                  <button
                    className="btn-action btn-edit"
                    onClick={() => openEditMenuModal(menu)}
                  >
                    ✏️
                  </button>
                  <button
                    className="btn-action btn-delete"
                    onClick={() => handleDeleteMenu(menu)}
                  >
                    🗑️
                  </button>
                </div>
              </div>

              <div className="menu-body">
                {menu.submenus && menu.submenus.length > 0 ? (
                  renderSubmenuTree(menu.submenus)
                ) : (
                  <div className="empty-state">
                    <p>No hay submenús</p>
                    <button
                      className="btn-create"
                      onClick={() => openCreateSubmenuModal(menu)}
                    >
                      + Agregar Primer Submenú
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Modal Menú */}
        {showMenuModal && (
          <div className="modal-overlay" onClick={() => !saving && setShowMenuModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h2 style={{ marginTop: 0 }}>
                {editingMenu ? 'Editar Menú' : 'Crear Nuevo Menú'}
              </h2>

              <div className="form-group">
                <label className="form-label">Nombre (ID) *</label>
                <input
                  type="text"
                  className="form-input"
                  value={menuForm.name}
                  onChange={(e) => setMenuForm({ ...menuForm, name: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                  placeholder="vehiculos"
                  disabled={saving || !!editingMenu}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Etiqueta (Visible) *</label>
                <input
                  type="text"
                  className="form-input"
                  value={menuForm.label}
                  onChange={(e) => setMenuForm({ ...menuForm, label: e.target.value })}
                  placeholder="Vehículos"
                  disabled={saving}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Icono (Emoji)</label>
                  <input
                    type="text"
                    className="form-input"
                    value={menuForm.icon}
                    onChange={(e) => setMenuForm({ ...menuForm, icon: e.target.value })}
                    placeholder="🚗"
                    disabled={saving}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Orden</label>
                  <input
                    type="number"
                    className="form-input"
                    value={menuForm.order_index}
                    onChange={(e) => setMenuForm({ ...menuForm, order_index: parseInt(e.target.value) })}
                    disabled={saving}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Ruta (Opcional)</label>
                <input
                  type="text"
                  className="form-input"
                  value={menuForm.route}
                  onChange={(e) => setMenuForm({ ...menuForm, route: e.target.value })}
                  placeholder="/admin/vehiculos"
                  disabled={saving}
                />
              </div>

              <div className="modal-actions">
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setShowMenuModal(false)
                    setEditingMenu(null)
                    resetMenuForm()
                  }}
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button
                  className="btn-create"
                  onClick={editingMenu ? handleUpdateMenu : handleCreateMenu}
                  disabled={saving}
                >
                  {saving ? 'Guardando...' : (editingMenu ? 'Actualizar' : 'Crear')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Submenú */}
        {showSubmenuModal && (
          <div className="modal-overlay" onClick={() => !saving && setShowSubmenuModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h2 style={{ marginTop: 0 }}>
                {editingSubmenu ? 'Editar Submenú' : 'Crear Nuevo Submenú'}
              </h2>

              {parentSubmenu && (
                <div className="info-banner">
                  ℹ️ Se creará como hijo de: <strong>{parentSubmenu.label}</strong>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Nombre (ID) *</label>
                <input
                  type="text"
                  className="form-input"
                  value={submenuForm.name}
                  onChange={(e) => setSubmenuForm({ ...submenuForm, name: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                  placeholder="listado"
                  disabled={saving || !!editingSubmenu}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Etiqueta (Visible) *</label>
                <input
                  type="text"
                  className="form-input"
                  value={submenuForm.label}
                  onChange={(e) => setSubmenuForm({ ...submenuForm, label: e.target.value })}
                  placeholder="Listado de Vehículos"
                  disabled={saving}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Icono (Emoji)</label>
                  <input
                    type="text"
                    className="form-input"
                    value={submenuForm.icon}
                    onChange={(e) => setSubmenuForm({ ...submenuForm, icon: e.target.value })}
                    placeholder="📋"
                    disabled={saving}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Orden</label>
                  <input
                    type="number"
                    className="form-input"
                    value={submenuForm.order_index}
                    onChange={(e) => setSubmenuForm({ ...submenuForm, order_index: parseInt(e.target.value) })}
                    disabled={saving}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Ruta</label>
                <input
                  type="text"
                  className="form-input"
                  value={submenuForm.route}
                  onChange={(e) => setSubmenuForm({ ...submenuForm, route: e.target.value })}
                  placeholder="/admin/vehiculos/listado"
                  disabled={saving}
                />
                <small style={{ color: '#6B7280', fontSize: '12px' }}>
                  Dejar vacío si tendrá sub-submenús
                </small>
              </div>

              <div className="modal-actions">
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setShowSubmenuModal(false)
                    setEditingSubmenu(null)
                    setParentSubmenu(null)
                    resetSubmenuForm()
                  }}
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button
                  className="btn-create"
                  onClick={editingSubmenu ? handleUpdateSubmenu : handleCreateSubmenu}
                  disabled={saving}
                >
                  {saving ? 'Guardando...' : (editingSubmenu ? 'Actualizar' : 'Crear')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
