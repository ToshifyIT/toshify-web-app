// src/components/admin/MenuHierarchyManager.tsx
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import type { Menu, Submenu } from '../../types/database.types'
import Swal from 'sweetalert2'
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

interface MenuRow {
  id: string
  type: 'menu' | 'submenu'
  name: string
  label: string
  route: string | null
  order_index: number
  menu_id?: string
  data: Menu | Submenu
}

export function MenuHierarchyManager() {
  const [menus, setMenus] = useState<Menu[]>([])
  const [submenus, setSubmenus] = useState<Submenu[]>([])
  const [loading, setLoading] = useState(true)
  const [showMenuModal, setShowMenuModal] = useState(false)
  const [showSubmenuModal, setShowSubmenuModal] = useState(false)
  const [editingMenu, setEditingMenu] = useState<Menu | null>(null)
  const [editingSubmenu, setEditingSubmenu] = useState<Submenu | null>(null)
  const [saving, setSaving] = useState(false)
  const [globalFilter, setGlobalFilter] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])

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
    menu_id: ''
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
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
        .order('order_index')

      if (submenusError) throw submenusError

      setMenus(menusData || [])
      setSubmenus(submenusData || [])
    } catch (err) {
      console.error('Error cargando datos:', err)
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

      Swal.fire('¡Éxito!', 'Menú creado exitosamente', 'success')
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

      Swal.fire('¡Éxito!', 'Menú actualizado exitosamente', 'success')
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
      confirmButtonColor: '#E63946',
      cancelButtonColor: '#6B7280',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    })

    if (!result.isConfirmed) return

    try {
      const { error } = await supabase
        .from('menus')
        .delete()
        .eq('id', menu.id)

      if (error) throw error

      Swal.fire('¡Eliminado!', 'Menú eliminado exitosamente', 'success')
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
      const { error } = await supabase
        .from('submenus')
        // @ts-expect-error - Tipo generado incorrectamente
        .insert([{ ...submenuForm, level: 1, parent_id: null }])

      if (error) throw error

      Swal.fire('¡Éxito!', 'Submenú creado exitosamente', 'success')
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

      Swal.fire('¡Éxito!', 'Submenú actualizado exitosamente', 'success')
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
      confirmButtonColor: '#E63946',
      cancelButtonColor: '#6B7280',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    })

    if (!result.isConfirmed) return

    try {
      const { error } = await supabase
        .from('submenus')
        .delete()
        .eq('id', submenu.id)

      if (error) throw error

      Swal.fire('¡Eliminado!', 'Submenú eliminado exitosamente', 'success')
      await loadData()
    } catch (err: any) {
      Swal.fire('Error', err.message, 'error')
    }
  }

  const resetMenuForm = () => {
    setMenuForm({ name: '', label: '', route: '', order_index: 0 })
  }

  const resetSubmenuForm = () => {
    setSubmenuForm({ name: '', label: '', route: '', order_index: 0, menu_id: '' })
  }

  // Construir datos para la tabla
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
        data: menu
      })

      submenus
        .filter(sub => sub.menu_id === menu.id)
        .forEach(submenu => {
          rows.push({
            id: submenu.id,
            type: 'submenu',
            name: submenu.name,
            label: submenu.label,
            route: submenu.route,
            order_index: submenu.order_index,
            menu_id: menu.id,
            data: submenu
          })
        })
    })
    return rows
  }, [menus, submenus])

  // Definir columnas
  const columns = useMemo<ColumnDef<MenuRow>[]>(
    () => [
      {
        accessorKey: 'type',
        header: 'Tipo',
        cell: ({ getValue }) => {
          const type = getValue() as 'menu' | 'submenu'
          return (
            <span className={`type-badge ${type === 'menu' ? 'type-menu' : 'type-submenu'}`}>
              {type === 'menu' ? 'Menú' : 'Submenú'}
            </span>
          )
        },
        size: 100
      },
      {
        accessorKey: 'name',
        header: 'Nombre',
        cell: ({ row, getValue }) => (
          <>
            {row.original.type === 'submenu' && <span style={{ color: '#9CA3AF', marginRight: '8px' }}>↳</span>}
            <strong>{getValue() as string}</strong>
          </>
        )
      },
      {
        accessorKey: 'label',
        header: 'Etiqueta'
      },
      {
        accessorKey: 'route',
        header: 'Ruta',
        cell: ({ getValue }) => (
          <code style={{ fontSize: '12px', color: '#6B7280' }}>
            {getValue() as string || '-'}
          </code>
        )
      },
      {
        accessorKey: 'order_index',
        header: 'Orden',
        size: 80
      },
      {
        id: 'actions',
        header: 'Acciones',
        cell: ({ row }) => (
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
            <button
              className="btn-action"
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
                    menu_id: row.original.menu_id || ''
                  })
                  setShowSubmenuModal(true)
                }
              }}
            >
              Editar
            </button>
            <button
              className="btn-action btn-delete"
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
        ),
        size: 140
      }
    ],
    []
  )

  const table = useReactTable({
    data: tableData,
    columns,
    state: {
      sorting,
      globalFilter
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 10
      }
    }
  })

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '40px', color: '#6B7280' }}>Cargando...</div>
  }

  return (
    <div>
      <style>{`
        .manager-container {
          max-width: 1200px;
          margin: 0 auto;
        }

        .search-bar {
          margin-bottom: 24px;
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .search-input {
          flex: 1;
          padding: 12px 16px;
          border: 1px solid #E5E7EB;
          border-radius: 8px;
          font-size: 15px;
          transition: border-color 0.2s;
        }

        .search-input:focus {
          outline: none;
          border-color: #E63946;
          box-shadow: 0 0 0 3px rgba(230, 57, 70, 0.1);
        }

        .btn-create {
          padding: 12px 24px;
          background: #E63946;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 4px 6px rgba(230, 57, 70, 0.2);
          white-space: nowrap;
        }

        .btn-create:hover {
          background: #D62828;
          transform: translateY(-2px);
          box-shadow: 0 6px 12px rgba(230, 57, 70, 0.3);
        }

        .table-wrapper {
          background: white;
          border-radius: 12px;
          border: 1px solid #E5E7EB;
          overflow: hidden;
          box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
        }

        .data-table {
          width: 100%;
          border-collapse: collapse;
        }

        .data-table thead {
          background: #F9FAFB;
          border-bottom: 2px solid #E5E7EB;
        }

        .data-table th {
          padding: 14px 16px;
          text-align: left;
          font-size: 12px;
          font-weight: 600;
          color: #6B7280;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          cursor: pointer;
          user-select: none;
        }

        .data-table th:hover {
          background: #F3F4F6;
        }

        .data-table th.sortable {
          position: relative;
        }

        .sort-indicator {
          margin-left: 8px;
          font-size: 10px;
          color: #9CA3AF;
        }

        .data-table td {
          padding: 14px 16px;
          border-bottom: 1px solid #F3F4F6;
          color: #1F2937;
          font-size: 14px;
        }

        .data-table tbody tr:hover {
          background: #F9FAFB;
        }

        .data-table tbody tr:last-child td {
          border-bottom: none;
        }

        .type-badge {
          display: inline-block;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
        }

        .type-menu {
          background: #DBEAFE;
          color: #1E40AF;
        }

        .type-submenu {
          background: #F3E8FF;
          color: #6B21A8;
        }

        .btn-action {
          padding: 6px 12px;
          border: 1px solid #E5E7EB;
          border-radius: 6px;
          background: white;
          cursor: pointer;
          transition: all 0.2s;
          font-size: 12px;
          font-weight: 500;
          color: #6B7280;
        }

        .btn-action:hover {
          border-color: #3B82F6;
          color: #3B82F6;
          background: #EFF6FF;
        }

        .btn-action.btn-delete:hover {
          border-color: #E63946;
          color: #E63946;
          background: #FEE2E2;
        }

        .pagination {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          background: #F9FAFB;
          border-top: 1px solid #E5E7EB;
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

        .pagination button {
          padding: 8px 12px;
          border: 1px solid #E5E7EB;
          border-radius: 6px;
          background: white;
          cursor: pointer;
          font-size: 14px;
          color: #6B7280;
          transition: all 0.2s;
        }

        .pagination button:hover:not(:disabled) {
          border-color: #E63946;
          color: #E63946;
          background: #FEF2F2;
        }

        .pagination button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .pagination select {
          padding: 6px 10px;
          border: 1px solid #E5E7EB;
          border-radius: 6px;
          font-size: 14px;
          color: #6B7280;
          background: white;
          cursor: pointer;
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
          border-radius: 16px;
          max-width: 600px;
          width: 90%;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        }

        .form-group {
          margin-bottom: 20px;
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
          padding: 10px 14px;
          border: 1px solid #E5E7EB;
          border-radius: 8px;
          font-size: 14px;
          transition: border-color 0.2s;
        }

        .form-input:focus {
          outline: none;
          border-color: #E63946;
          box-shadow: 0 0 0 3px rgba(230, 57, 70, 0.1);
        }

        .modal-actions {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
          margin-top: 24px;
        }

        .btn-secondary {
          padding: 10px 24px;
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

        .btn-primary {
          padding: 10px 24px;
          background: #E63946;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-primary:hover {
          background: #D62828;
        }

        .btn-primary:disabled {
          background: #9CA3AF;
          cursor: not-allowed;
        }
      `}</style>

      <div className="manager-container">
        {/* Header */}
        <div style={{ marginBottom: '32px', textAlign: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '24px', fontWeight: '700', color: '#1F2937' }}>
            Gestor de Menús
          </h3>
          <p style={{ margin: '8px 0 0 0', fontSize: '15px', color: '#6B7280' }}>
            Administra la estructura de navegación del sistema
          </p>
        </div>

        {/* Search Bar & Actions */}
        <div className="search-bar">
          <input
            type="text"
            className="search-input"
            placeholder="Buscar en todos los campos..."
            value={globalFilter ?? ''}
            onChange={(e) => setGlobalFilter(e.target.value)}
          />
          <button className="btn-create" onClick={() => setShowMenuModal(true)}>
            + Menú
          </button>
          <button className="btn-create" onClick={() => setShowSubmenuModal(true)}>
            + Submenú
          </button>
        </div>

        {/* Table */}
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map(header => (
                    <th
                      key={header.id}
                      onClick={header.column.getToggleSortingHandler()}
                      className={header.column.getCanSort() ? 'sortable' : ''}
                      style={{ width: header.getSize() }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center' }}>
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
              {table.getRowModel().rows.map(row => (
                <tr key={row.id}>
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          <div className="pagination">
            <div className="pagination-info">
              Mostrando {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1} a{' '}
              {Math.min((table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize, table.getFilteredRowModel().rows.length)}{' '}
              de {table.getFilteredRowModel().rows.length} registros
            </div>
            <div className="pagination-controls">
              <button
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
              >
                {'<<'}
              </button>
              <button
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                {'<'}
              </button>
              <span style={{ padding: '0 12px', fontSize: '14px', color: '#6B7280' }}>
                Página {table.getState().pagination.pageIndex + 1} de {table.getPageCount()}
              </span>
              <button
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                {'>'}
              </button>
              <button
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
              >
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
        </div>

        {/* Modal Menú */}
        {showMenuModal && (
          <div className="modal-overlay" onClick={() => !saving && setShowMenuModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h2 style={{ marginTop: 0, fontSize: '20px', fontWeight: '700' }}>
                {editingMenu ? 'Editar Menú' : 'Crear Nuevo Menú'}
              </h2>

              <div className="form-group">
                <label className="form-label">Nombre (ID) *</label>
                <input
                  type="text"
                  className="form-input"
                  value={menuForm.name}
                  onChange={(e) => setMenuForm({ ...menuForm, name: e.target.value })}
                  placeholder="vehiculos"
                  disabled={saving}
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

              <div className="form-group">
                <label className="form-label">Ruta</label>
                <input
                  type="text"
                  className="form-input"
                  value={menuForm.route}
                  onChange={(e) => setMenuForm({ ...menuForm, route: e.target.value })}
                  placeholder="/vehiculos"
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
          <div className="modal-overlay" onClick={() => !saving && setShowSubmenuModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h2 style={{ marginTop: 0, fontSize: '20px', fontWeight: '700' }}>
                {editingSubmenu ? 'Editar Submenú' : 'Crear Nuevo Submenú'}
              </h2>

              <div className="form-group">
                <label className="form-label">Menú Padre *</label>
                <select
                  className="form-input"
                  value={submenuForm.menu_id}
                  onChange={(e) => setSubmenuForm({ ...submenuForm, menu_id: e.target.value })}
                  disabled={saving || !!editingSubmenu}
                >
                  <option value="">Seleccionar menú...</option>
                  {menus.map(menu => (
                    <option key={menu.id} value={menu.id}>{menu.label}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Nombre (ID) *</label>
                <input
                  type="text"
                  className="form-input"
                  value={submenuForm.name}
                  onChange={(e) => setSubmenuForm({ ...submenuForm, name: e.target.value })}
                  placeholder="gestion-conductores"
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Etiqueta (Visible) *</label>
                <input
                  type="text"
                  className="form-input"
                  value={submenuForm.label}
                  onChange={(e) => setSubmenuForm({ ...submenuForm, label: e.target.value })}
                  placeholder="Gestión de Conductores"
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Ruta</label>
                <input
                  type="text"
                  className="form-input"
                  value={submenuForm.route}
                  onChange={(e) => setSubmenuForm({ ...submenuForm, route: e.target.value })}
                  placeholder="/vehiculos/conductores"
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

              <div className="modal-actions">
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
    </div>
  )
}
