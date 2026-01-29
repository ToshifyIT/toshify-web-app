// src/components/admin/MenuHierarchyManager.tsx
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { LoadingOverlay } from '../ui/LoadingOverlay'
import type { Menu, Submenu } from '../../types/database.types'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../ui/DataTable/DataTable'
import { Menu as MenuIcon } from 'lucide-react'
import Swal from 'sweetalert2'
import { showSuccess } from '../../utils/toast'
import './MenuHierarchyManager.css'
import './AdminStyles.css'

interface MenuRow {
  id: string
  type: 'menu' | 'submenu'
  name: string
  label: string
  route: string | null
  order_index: number
  menu_id?: string
  parent_id?: string | null
  level: number
  data: Menu | Submenu
}

export function MenuHierarchyManager() {
  const [menus, setMenus] = useState<Menu[]>([])
  const [submenus, setSubmenus] = useState<Submenu[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showMenuModal, setShowMenuModal] = useState(false)
  const [showSubmenuModal, setShowSubmenuModal] = useState(false)
  const [editingMenu, setEditingMenu] = useState<Menu | null>(null)
  const [editingSubmenu, setEditingSubmenu] = useState<Submenu | null>(null)
  const [saving, setSaving] = useState(false)

  const [menuForm, setMenuForm] = useState({
    name: '',
    label: '',
    route: '',
    order_index: 0
  })

  const [submenuForm, setSubmenuForm] = useState({
    name: '',
    label: '',
    route: '',
    order_index: 0,
    menu_id: '',
    parent_id: '' as string | null  // Para submenús anidados
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: menusData, error: menusError } = await supabase
        .from('menus')
        .select('*')
        .order('order_index')

      if (menusError) throw menusError

      const { data: submenusData, error: submenusError } = await supabase
        .from('submenus')
        .select('*')
        .order('order_index')

      if (submenusError) throw submenusError

      setMenus(menusData || [])
      setSubmenus(submenusData || [])
    } catch (err: any) {
      console.error('Error cargando datos:', err)
      setError(err.message || 'Error al cargar datos')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateMenu = async () => {
    if (!menuForm.name || !menuForm.label) {
      Swal.fire('Error', 'Nombre y etiqueta son requeridos', 'error')
      return
    }

    setSaving(true)
    try {
      const { error } = await supabase
        .from('menus')
        // @ts-expect-error - Tipo generado incorrectamente
        .insert([menuForm])

      if (error) throw error

      showSuccess('¡Éxito!', 'Menú creado exitosamente')
      setShowMenuModal(false)
      resetMenuForm()
      await loadData()
    } catch (err: any) {
      Swal.fire('Error', err.message, 'error')
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

      showSuccess('¡Éxito!', 'Menú actualizado exitosamente')
      setShowMenuModal(false)
      setEditingMenu(null)
      resetMenuForm()
      await loadData()
    } catch (err: any) {
      Swal.fire('Error', err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteMenu = async (menu: Menu) => {
    const result = await Swal.fire({
      title: '¿Eliminar menú?',
      text: `Se eliminará "${menu.label}" y todos sus submenús`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ff0033',
      cancelButtonColor: '#6B7280',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    })

    if (!result.isConfirmed) return

    try {
      const { error } = await supabase.from('menus').delete().eq('id', menu.id)
      if (error) throw error

      showSuccess('¡Eliminado!', 'Menú eliminado exitosamente')
      await loadData()
    } catch (err: any) {
      Swal.fire('Error', err.message, 'error')
    }
  }

  const handleCreateSubmenu = async () => {
    if (!submenuForm.name || !submenuForm.label || !submenuForm.menu_id) {
      Swal.fire('Error', 'Completa todos los campos requeridos', 'error')
      return
    }

    setSaving(true)
    try {
      // Calcular el nivel basado en el padre
      let level = 1
      const parentId = submenuForm.parent_id || null

      if (parentId) {
        const parentSubmenu = submenus.find(s => s.id === parentId)
        if (parentSubmenu) {
          level = (parentSubmenu.level || 1) + 1
        }
      }

      const { error } = await supabase
        .from('submenus')
        // @ts-expect-error - Tipo generado incorrectamente
        .insert([{
          name: submenuForm.name,
          label: submenuForm.label,
          route: submenuForm.route,
          order_index: submenuForm.order_index,
          menu_id: submenuForm.menu_id,
          parent_id: parentId,
          level: level
        }])

      if (error) throw error

      showSuccess('¡Éxito!', 'Submenú creado exitosamente')
      setShowSubmenuModal(false)
      resetSubmenuForm()
      await loadData()
    } catch (err: any) {
      Swal.fire('Error', err.message, 'error')
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
          route: submenuForm.route,
          order_index: submenuForm.order_index
        })
        .eq('id', editingSubmenu.id)

      if (error) throw error

      showSuccess('¡Éxito!', 'Submenú actualizado exitosamente')
      setShowSubmenuModal(false)
      setEditingSubmenu(null)
      resetSubmenuForm()
      await loadData()
    } catch (err: any) {
      Swal.fire('Error', err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteSubmenu = async (submenu: Submenu) => {
    const result = await Swal.fire({
      title: '¿Eliminar submenú?',
      text: `Se eliminará "${submenu.label}"`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ff0033',
      cancelButtonColor: '#6B7280',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    })

    if (!result.isConfirmed) return

    try {
      const { error } = await supabase.from('submenus').delete().eq('id', submenu.id)
      if (error) throw error

      showSuccess('¡Eliminado!', 'Submenú eliminado exitosamente')
      await loadData()
    } catch (err: any) {
      Swal.fire('Error', err.message, 'error')
    }
  }

  const resetMenuForm = () => {
    setMenuForm({ name: '', label: '', route: '', order_index: 0 })
  }

  const resetSubmenuForm = () => {
    setSubmenuForm({ name: '', label: '', route: '', order_index: 0, menu_id: '', parent_id: '' })
  }

  // Función recursiva para agregar submenús anidados
  const addSubmenusRecursively = (
    rows: MenuRow[],
    menuId: string,
    parentId: string | null,
    menuSubmenus: Submenu[]
  ) => {
    const children = menuSubmenus
      .filter(sub => sub.parent_id === parentId)
      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))

    children.forEach(submenu => {
      rows.push({
        id: submenu.id,
        type: 'submenu',
        name: submenu.name,
        label: submenu.label,
        route: submenu.route,
        order_index: submenu.order_index,
        menu_id: menuId,
        parent_id: submenu.parent_id,
        level: submenu.level || 1,
        data: submenu
      })
      // Agregar hijos de este submenú recursivamente
      addSubmenusRecursively(rows, menuId, submenu.id, menuSubmenus)
    })
  }

  // Construir datos para la tabla (menús + submenús jerárquicos)
  const tableData = useMemo<MenuRow[]>(() => {
    const rows: MenuRow[] = []
    menus.forEach(menu => {
      rows.push({
        id: menu.id,
        type: 'menu',
        name: menu.name,
        label: menu.label,
        route: menu.route,
        order_index: menu.order_index,
        level: 0,
        data: menu
      })

      // Obtener submenús de este menú
      const menuSubmenus = submenus.filter(sub => sub.menu_id === menu.id)
      // Agregar recursivamente empezando por los de nivel 1 (parent_id = null)
      addSubmenusRecursively(rows, menu.id, null, menuSubmenus)
    })
    return rows
  }, [menus, submenus])

  // Definir columnas para DataTable
  const columns = useMemo<ColumnDef<MenuRow, any>[]>(
    () => [
      {
        accessorKey: 'type',
        header: 'Tipo',
        cell: ({ getValue }) => {
          const type = getValue() as 'menu' | 'submenu'
          return (
            <span className={`dt-badge ${type === 'menu' ? 'mhm-type-menu' : 'mhm-type-submenu'}`}>
              {type === 'menu' ? 'Menú' : 'Submenú'}
            </span>
          )
        }
      },
      {
        accessorKey: 'name',
        header: 'Nombre',
        cell: ({ row, getValue }) => {
          const level = row.original.level
          const indent = level > 0 ? '─'.repeat(level) + ' ' : ''
          const indicator = level > 0 ? '└' + indent : ''
          return (
            <span style={{ paddingLeft: `${level * 16}px` }}>
              {level > 0 && <span className="mhm-submenu-indicator">{indicator}</span>}
              <strong>{getValue() as string}</strong>
            </span>
          )
        }
      },
      {
        accessorKey: 'label',
        header: 'Etiqueta',
        cell: ({ getValue }) => <span>{getValue() as string}</span>
      },
      {
        accessorKey: 'route',
        header: 'Ruta',
        cell: ({ getValue }) => {
          const route = getValue() as string
          return route ? <code className="mhm-route-code">{route}</code> : <span style={{ color: '#9CA3AF' }}>-</span>
        }
      },
      {
        accessorKey: 'order_index',
        header: 'Orden',
        cell: ({ getValue }) => <span style={{ textAlign: 'center', display: 'block' }}>{getValue() as number}</span>
      },
      {
        id: 'acciones',
        header: 'Acciones',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="dt-actions">
            <button
              className="dt-btn-action dt-btn-edit"
              onClick={() => {
                if (row.original.type === 'menu') {
                  setEditingMenu(row.original.data as Menu)
                  setMenuForm({
                    name: row.original.name,
                    label: row.original.label,
                    route: row.original.route || '',
                    order_index: row.original.order_index
                  })
                  setShowMenuModal(true)
                } else {
                  setEditingSubmenu(row.original.data as Submenu)
                  setSubmenuForm({
                    name: row.original.name,
                    label: row.original.label,
                    route: row.original.route || '',
                    order_index: row.original.order_index,
                    menu_id: row.original.menu_id || '',
                    parent_id: row.original.parent_id || ''
                  })
                  setShowSubmenuModal(true)
                }
              }}
            >
              Editar
            </button>
            <button
              className="dt-btn-action dt-btn-delete"
              onClick={() => {
                if (row.original.type === 'menu') {
                  handleDeleteMenu(row.original.data as Menu)
                } else {
                  handleDeleteSubmenu(row.original.data as Submenu)
                }
              }}
            >
              Eliminar
            </button>
          </div>
        )
      }
    ],
    []
  )

  return (
    <div className="admin-module">
      <LoadingOverlay show={loading} message="Cargando menus..." size="lg" />
      {/* DataTable with integrated action buttons */}
      <DataTable
        data={tableData}
        columns={columns}
        loading={loading}
        error={error}
        searchPlaceholder="Buscar por nombre, etiqueta o ruta..."
        emptyIcon={<MenuIcon size={48} />}
        emptyTitle="No hay menús"
        emptyDescription="Crea el primer menú usando el botón '+ Menú'"
pageSize={100}
        pageSizeOptions={[10, 20, 50, 100]}
        headerAction={
          <div className="mhm-header-actions">
            <button className="btn-primary" onClick={() => setShowMenuModal(true)}>
              + Menú
            </button>
            <button className="btn-primary" onClick={() => setShowSubmenuModal(true)}>
              + Submenú
            </button>
          </div>
        }
      />

      {/* Modal Menú */}
      {showMenuModal && (
        <div className="mhm-modal-overlay" onClick={() => !saving && setShowMenuModal(false)}>
          <div className="mhm-modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 className="mhm-modal-title">
              {editingMenu ? 'Editar Menú' : 'Crear Nuevo Menú'}
            </h2>

            <div className="mhm-form-group">
              <label className="mhm-form-label">Nombre (ID) *</label>
              <input
                type="text"
                className="mhm-form-input"
                value={menuForm.name}
                onChange={(e) => setMenuForm({ ...menuForm, name: e.target.value })}
                placeholder="vehiculos"
                disabled={saving}
              />
            </div>

            <div className="mhm-form-group">
              <label className="mhm-form-label">Etiqueta (Visible) *</label>
              <input
                type="text"
                className="mhm-form-input"
                value={menuForm.label}
                onChange={(e) => setMenuForm({ ...menuForm, label: e.target.value })}
                placeholder="Vehículos"
                disabled={saving}
              />
            </div>

            <div className="mhm-form-group">
              <label className="mhm-form-label">Ruta</label>
              <input
                type="text"
                className="mhm-form-input"
                value={menuForm.route}
                onChange={(e) => setMenuForm({ ...menuForm, route: e.target.value })}
                placeholder="/vehiculos"
                disabled={saving}
              />
            </div>

            <div className="mhm-form-group">
              <label className="mhm-form-label">Orden</label>
              <input
                type="number"
                className="mhm-form-input"
                value={menuForm.order_index}
                onChange={(e) => setMenuForm({ ...menuForm, order_index: parseInt(e.target.value) || 0 })}
                disabled={saving}
              />
            </div>

            <div className="mhm-modal-actions">
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
                className="btn-primary"
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
        <div className="mhm-modal-overlay" onClick={() => !saving && setShowSubmenuModal(false)}>
          <div className="mhm-modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 className="mhm-modal-title">
              {editingSubmenu ? 'Editar Submenú' : 'Crear Nuevo Submenú'}
            </h2>

            <div className="mhm-form-group">
              <label className="mhm-form-label">Menú Principal *</label>
              <select
                className="mhm-form-input"
                value={submenuForm.menu_id}
                onChange={(e) => setSubmenuForm({ ...submenuForm, menu_id: e.target.value, parent_id: '' })}
                disabled={saving || !!editingSubmenu}
              >
                <option value="">Seleccionar menú...</option>
                {menus.map(menu => (
                  <option key={menu.id} value={menu.id}>{menu.label}</option>
                ))}
              </select>
            </div>

            {/* Selector de submenú padre (opcional, para anidación) */}
            {submenuForm.menu_id && (
              <div className="mhm-form-group">
                <label className="mhm-form-label">Submenú Padre (opcional)</label>
                <select
                  className="mhm-form-input"
                  value={submenuForm.parent_id || ''}
                  onChange={(e) => setSubmenuForm({ ...submenuForm, parent_id: e.target.value || null })}
                  disabled={saving}
                >
                  <option value="">-- Ninguno (nivel 1) --</option>
                  {submenus
                    .filter(sub => sub.menu_id === submenuForm.menu_id && sub.id !== editingSubmenu?.id)
                    .map(sub => {
                      const indent = '─'.repeat(sub.level || 1)
                      return (
                        <option key={sub.id} value={sub.id}>
                          {indent} {sub.label}
                        </option>
                      )
                    })}
                </select>
                <small className="mhm-form-hint">Selecciona un submenú si quieres crear un sub-submenú anidado</small>
              </div>
            )}

            <div className="mhm-form-group">
              <label className="mhm-form-label">Nombre (ID) *</label>
              <input
                type="text"
                className="mhm-form-input"
                value={submenuForm.name}
                onChange={(e) => setSubmenuForm({ ...submenuForm, name: e.target.value })}
                placeholder="gestion-conductores"
                disabled={saving}
              />
            </div>

            <div className="mhm-form-group">
              <label className="mhm-form-label">Etiqueta (Visible) *</label>
              <input
                type="text"
                className="mhm-form-input"
                value={submenuForm.label}
                onChange={(e) => setSubmenuForm({ ...submenuForm, label: e.target.value })}
                placeholder="Gestión de Conductores"
                disabled={saving}
              />
            </div>

            <div className="mhm-form-group">
              <label className="mhm-form-label">Ruta</label>
              <input
                type="text"
                className="mhm-form-input"
                value={submenuForm.route}
                onChange={(e) => setSubmenuForm({ ...submenuForm, route: e.target.value })}
                placeholder="/vehiculos/conductores"
                disabled={saving}
              />
            </div>

            <div className="mhm-form-group">
              <label className="mhm-form-label">Orden</label>
              <input
                type="number"
                className="mhm-form-input"
                value={submenuForm.order_index}
                onChange={(e) => setSubmenuForm({ ...submenuForm, order_index: parseInt(e.target.value) || 0 })}
                disabled={saving}
              />
            </div>

            <div className="mhm-modal-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowSubmenuModal(false)
                  setEditingSubmenu(null)
                  resetSubmenuForm()
                }}
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                className="btn-primary"
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
  )
}
