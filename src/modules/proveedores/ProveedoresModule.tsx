import { useEffect, useState, useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { supabase } from '../../lib/supabase'
import Swal from 'sweetalert2'
import { Eye, Edit, Trash2, Building2, FileText, Phone, CreditCard, Calendar, Filter, CheckCircle, XCircle } from 'lucide-react'
import { usePermissions } from '../../contexts/PermissionsContext'
import { DataTable } from '../../components/ui/DataTable'
import { formatDateTimeAR } from '../../utils/dateUtils'
import './ProveedoresModule.css'

type CategoriaProveedor = 'maquinaria' | 'herramientas' | 'repuestos' | 'insumos' | 'otro'

const CATEGORIAS_PROVEEDOR: { value: CategoriaProveedor; label: string }[] = [
  { value: 'maquinaria', label: 'Maquinaria' },
  { value: 'herramientas', label: 'Herramientas' },
  { value: 'repuestos', label: 'Repuestos' },
  { value: 'insumos', label: 'Insumos' },
  { value: 'otro', label: 'Otro' },
]

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
  categoria?: CategoriaProveedor
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
    observaciones: '',
    categoria: '' as CategoriaProveedor | ''
  })

  // Column filter states - Multiselect tipo Excel
  const [razonSocialFilter, setRazonSocialFilter] = useState<string[]>([])
  const [razonSocialSearch, setRazonSocialSearch] = useState('')
  const [estadoFilter, setEstadoFilter] = useState<string[]>([])
  const [openColumnFilter, setOpenColumnFilter] = useState<string | null>(null)

  // Stat card filter state - SEPARADO del filtro de columna
  const [activeStatCard, setActiveStatCard] = useState<string | null>(null)
  const [statCardEstadoFilter, setStatCardEstadoFilter] = useState<string[]>([])

  useEffect(() => {
    loadProveedores()
  }, [])

  // Cerrar dropdown de filtro al hacer click fuera
  useEffect(() => {
    const handleClickOutside = () => {
      if (openColumnFilter) {
        setOpenColumnFilter(null)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [openColumnFilter])

  // Valores únicos para filtros tipo Excel
  const razonSocialUnicos = useMemo(() => {
    const razones = proveedores.map(p => p.razon_social).filter(Boolean)
    return [...new Set(razones)].sort()
  }, [proveedores])

  const razonSocialFiltrados = useMemo(() => {
    if (!razonSocialSearch) return razonSocialUnicos
    return razonSocialUnicos.filter(r => r.toLowerCase().includes(razonSocialSearch.toLowerCase()))
  }, [razonSocialUnicos, razonSocialSearch])

  const estadoOptions = [
    { value: 'true', label: 'Activo' },
    { value: 'false', label: 'Inactivo' }
  ]

  // Toggle functions para multiselect
  const toggleRazonSocialFilter = (razon: string) => {
    setRazonSocialFilter(prev =>
      prev.includes(razon) ? prev.filter(r => r !== razon) : [...prev, razon]
    )
  }

  const toggleEstadoFilter = (estado: string) => {
    setEstadoFilter(prev =>
      prev.includes(estado) ? prev.filter(e => e !== estado) : [...prev, estado]
    )
  }

  // Handler para stat cards - NO afecta el filtro de columna
  const handleStatCardClick = (cardType: string) => {
    if (activeStatCard === cardType) {
      // Deseleccionar: limpia solo el filtro del stat card
      setActiveStatCard(null)
      setStatCardEstadoFilter([])
      return
    }

    setActiveStatCard(cardType)
    switch (cardType) {
      case 'total':
        setStatCardEstadoFilter([]) // Total muestra todos
        break
      case 'activos':
        setStatCardEstadoFilter(['true'])
        break
      case 'inactivos':
        setStatCardEstadoFilter(['false'])
        break
    }
  }

  // Filtrar proveedores según los filtros de columna (multiselect tipo Excel)
  const filteredProveedores = useMemo(() => {
    let result = proveedores

    // Filtro de columna Razón Social
    if (razonSocialFilter.length > 0) {
      result = result.filter(p =>
        razonSocialFilter.includes(p.razon_social || '')
      )
    }

    // Filtro de columna Estado
    if (estadoFilter.length > 0) {
      result = result.filter(p => {
        const estadoStr = p.activo ? 'true' : 'false'
        return estadoFilter.includes(estadoStr)
      })
    }

    // Filtro de Stat Card (ADICIONAL al filtro de columna)
    if (statCardEstadoFilter.length > 0) {
      result = result.filter(p => {
        const estadoStr = p.activo ? 'true' : 'false'
        return statCardEstadoFilter.includes(estadoStr)
      })
    }

    return result
  }, [proveedores, razonSocialFilter, estadoFilter, statCardEstadoFilter])

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
          categoria: formData.categoria || null,
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
        categoria: formData.categoria || null,
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
      observaciones: proveedor.observaciones || '',
      categoria: proveedor.categoria || ''
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
      observaciones: '',
      categoria: ''
    })
    setSelectedProveedor(null)
  }

  const columns = useMemo<ColumnDef<Proveedor>[]>(
    () => [
      {
        accessorKey: 'razon_social',
        header: () => (
          <div className="dt-column-filter">
            <span>Razón Social {razonSocialFilter.length > 0 && `(${razonSocialFilter.length})`}</span>
            <button
              className={`dt-column-filter-btn ${razonSocialFilter.length > 0 ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                setOpenColumnFilter(openColumnFilter === 'razon_social' ? null : 'razon_social')
              }}
              title="Filtrar por razón social"
            >
              <Filter size={12} />
            </button>
            {openColumnFilter === 'razon_social' && (
              <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
                <input
                  type="text"
                  placeholder="Buscar..."
                  value={razonSocialSearch}
                  onChange={(e) => setRazonSocialSearch(e.target.value)}
                  className="dt-column-filter-input"
                  autoFocus
                />
                <div className="dt-excel-filter-list">
                  {razonSocialFiltrados.length === 0 ? (
                    <div className="dt-excel-filter-empty">Sin resultados</div>
                  ) : (
                    razonSocialFiltrados.slice(0, 50).map(razon => (
                      <label key={razon} className={`dt-column-filter-checkbox ${razonSocialFilter.includes(razon) ? 'selected' : ''}`}>
                        <input
                          type="checkbox"
                          checked={razonSocialFilter.includes(razon)}
                          onChange={() => toggleRazonSocialFilter(razon)}
                        />
                        <span>{razon}</span>
                      </label>
                    ))
                  )}
                </div>
                {razonSocialFilter.length > 0 && (
                  <button
                    className="dt-column-filter-clear"
                    onClick={() => { setRazonSocialFilter([]); setRazonSocialSearch('') }}
                  >
                    Limpiar ({razonSocialFilter.length})
                  </button>
                )}
              </div>
            )}
          </div>
        ),
        cell: ({ getValue }) => (
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
            {getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: 'tipo_documento',
        header: 'Tipo Doc.',
        cell: ({ getValue }) => (
          <span className="dt-badge dt-badge-blue">{getValue() as string}</span>
        ),
      },
      {
        accessorKey: 'numero_documento',
        header: 'Número Documento',
        cell: ({ getValue }) => (
          <span style={{ fontWeight: 500, color: 'var(--color-primary)' }}>
            {getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: 'categoria',
        header: 'Categoría',
        cell: ({ getValue }) => {
          const value = getValue() as CategoriaProveedor | null
          if (!value) return <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>-</span>
          const cat = CATEGORIAS_PROVEEDOR.find(c => c.value === value)
          return (
            <span className="dt-badge dt-badge-purple">
              {cat?.label || value}
            </span>
          )
        },
      },
      {
        accessorKey: 'telefono',
        header: 'Teléfono',
        cell: ({ getValue }) => {
          const value = getValue() as string
          return value || <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>-</span>
        },
      },
      {
        accessorKey: 'email',
        header: 'Email',
        cell: ({ getValue }) => {
          const value = getValue() as string
          return value || <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>-</span>
        },
      },
      {
        accessorKey: 'activo',
        header: () => (
          <div className="dt-column-filter">
            <span>Estado {estadoFilter.length > 0 && `(${estadoFilter.length})`}</span>
            <button
              className={`dt-column-filter-btn ${estadoFilter.length > 0 ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                setOpenColumnFilter(openColumnFilter === 'estado' ? null : 'estado')
              }}
              title="Filtrar por estado"
            >
              <Filter size={12} />
            </button>
            {openColumnFilter === 'estado' && (
              <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
                <div className="dt-excel-filter-list">
                  {estadoOptions.map(opt => (
                    <label key={opt.value} className={`dt-column-filter-checkbox ${estadoFilter.includes(opt.value) ? 'selected' : ''}`}>
                      <input
                        type="checkbox"
                        checked={estadoFilter.includes(opt.value)}
                        onChange={() => toggleEstadoFilter(opt.value)}
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
                {estadoFilter.length > 0 && (
                  <button
                    className="dt-column-filter-clear"
                    onClick={() => setEstadoFilter([])}
                  >
                    Limpiar ({estadoFilter.length})
                  </button>
                )}
              </div>
            )}
          </div>
        ),
        cell: ({ getValue }) => {
          const activo = getValue() as boolean
          return (
            <span className={activo ? 'dt-badge dt-badge-green' : 'dt-badge dt-badge-red'}>
              {activo ? 'Activo' : 'Inactivo'}
            </span>
          )
        },
      },
      {
        id: 'acciones',
        header: 'Acciones',
        cell: ({ row }) => (
          <div className="dt-actions">
            {canView && (
              <button
                className="dt-btn-action dt-btn-view"
                onClick={() => openViewModal(row.original)}
                title="Ver"
              >
                <Eye size={16} />
              </button>
            )}
            {canEdit && (
              <button
                className="dt-btn-action dt-btn-edit"
                onClick={() => openEditModal(row.original)}
                title="Editar"
              >
                <Edit size={16} />
              </button>
            )}
            {canDelete && (
              <button
                className="dt-btn-action dt-btn-delete"
                onClick={() => handleDelete(row.original.id)}
                title="Eliminar"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        ),
      },
    ],
    [canView, canEdit, canDelete, razonSocialFilter, estadoFilter, openColumnFilter]
  )

  // Calcular estadísticas
  const statsData = useMemo(() => {
    const total = proveedores.length
    const activos = proveedores.filter(p => p.activo).length
    const inactivos = proveedores.filter(p => !p.activo).length
    return { total, activos, inactivos }
  }, [proveedores])

  return (
    <div className="prov-module">
      {/* Stats Cards - Estilo Bitacora */}
      <div className="prov-stats">
        <div className="prov-stats-grid">
          <button
            className={`stat-card${activeStatCard === 'total' ? ' active' : ''}`}
            onClick={() => handleStatCardClick('total')}
          >
            <Building2 size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{statsData.total}</span>
              <span className="stat-label">Total</span>
            </div>
          </button>
          <button
            className={`stat-card${activeStatCard === 'activos' ? ' active' : ''}`}
            onClick={() => handleStatCardClick('activos')}
          >
            <CheckCircle size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{statsData.activos}</span>
              <span className="stat-label">Activos</span>
            </div>
          </button>
          <button
            className={`stat-card${activeStatCard === 'inactivos' ? ' active' : ''}`}
            onClick={() => handleStatCardClick('inactivos')}
          >
            <XCircle size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{statsData.inactivos}</span>
              <span className="stat-label">Inactivos</span>
            </div>
          </button>
        </div>
      </div>

      {/* DataTable with integrated action button */}
      <DataTable
        data={filteredProveedores}
        columns={columns}
        loading={loading}
        searchPlaceholder="Buscar por razon social, documento, email, telefono..."
        emptyIcon={<Building2 size={64} />}
        emptyTitle="No hay proveedores registrados"
        emptyDescription={canCreate ? 'Crea el primero usando el boton "+ Crear Proveedor".' : ''}
        headerAction={
          canCreate ? (
            <button className="btn-primary" onClick={openCreateModal}>
              + Crear Proveedor
            </button>
          ) : undefined
        }
        externalFilters={
          activeStatCard && activeStatCard !== 'total'
            ? [
                {
                  id: 'stat-estado',
                  label: activeStatCard === 'activos' ? 'Estado: Activos' : 'Estado: Inactivos',
                  onClear: () => {
                    setActiveStatCard(null)
                    setStatCardEstadoFilter([])
                  }
                }
              ]
            : undefined
        }
        onClearAllFilters={() => {
          // Limpiar TODO: filtros de columna + stat cards
          setRazonSocialFilter([])
          setRazonSocialSearch('')
          setEstadoFilter([])
          setActiveStatCard(null)
          setStatCardEstadoFilter([])
        }}
      />

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
            background: 'var(--card-bg)',
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
                    border: '1px solid var(--border-primary)',
                    borderRadius: '6px',
                    fontSize: '14px',
                    background: 'var(--input-bg)',
                    color: 'var(--text-primary)',
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
                      border: '1px solid var(--border-primary)',
                      borderRadius: '6px',
                      fontSize: '14px',
                      background: 'var(--input-bg)',
                      color: 'var(--text-primary)',
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
                      border: '1px solid var(--border-primary)',
                      borderRadius: '6px',
                      fontSize: '14px',
                      background: 'var(--input-bg)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 600 }}>
                  Categoría de Proveedor
                </label>
                <select
                  value={formData.categoria}
                  onChange={(e) => setFormData({ ...formData, categoria: e.target.value as CategoriaProveedor | '' })}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '6px',
                    fontSize: '14px',
                    background: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <option value="">Seleccionar categoría...</option>
                  {CATEGORIAS_PROVEEDOR.map((cat) => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
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
                      border: '1px solid var(--border-primary)',
                      borderRadius: '6px',
                      fontSize: '14px',
                      background: 'var(--input-bg)',
                      color: 'var(--text-primary)',
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
                      border: '1px solid var(--border-primary)',
                      borderRadius: '6px',
                      fontSize: '14px',
                      background: 'var(--input-bg)',
                      color: 'var(--text-primary)',
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
                    border: '1px solid var(--border-primary)',
                    borderRadius: '6px',
                    fontSize: '14px',
                    background: 'var(--input-bg)',
                    color: 'var(--text-primary)',
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
                    border: '1px solid var(--border-primary)',
                    borderRadius: '6px',
                    fontSize: '14px',
                    background: 'var(--input-bg)',
                    color: 'var(--text-primary)',
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
                    border: '1px solid var(--border-primary)',
                    borderRadius: '6px',
                    fontSize: '14px',
                    background: 'var(--input-bg)',
                    color: 'var(--text-primary)',
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
                  background: 'var(--bg-tertiary)',
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
                  background: formData.razon_social && formData.numero_documento ? 'var(--color-primary)' : 'var(--border-primary)',
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
            background: 'var(--card-bg)',
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
                    border: '1px solid var(--border-primary)',
                    borderRadius: '6px',
                    fontSize: '14px',
                    background: 'var(--input-bg)',
                    color: 'var(--text-primary)',
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
                      border: '1px solid var(--border-primary)',
                      borderRadius: '6px',
                      fontSize: '14px',
                      background: 'var(--input-bg)',
                      color: 'var(--text-primary)',
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
                      border: '1px solid var(--border-primary)',
                      borderRadius: '6px',
                      fontSize: '14px',
                      background: 'var(--input-bg)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 600 }}>
                  Categoría de Proveedor
                </label>
                <select
                  value={formData.categoria}
                  onChange={(e) => setFormData({ ...formData, categoria: e.target.value as CategoriaProveedor | '' })}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '6px',
                    fontSize: '14px',
                    background: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <option value="">Seleccionar categoría...</option>
                  {CATEGORIAS_PROVEEDOR.map((cat) => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
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
                      border: '1px solid var(--border-primary)',
                      borderRadius: '6px',
                      fontSize: '14px',
                      background: 'var(--input-bg)',
                      color: 'var(--text-primary)',
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
                      border: '1px solid var(--border-primary)',
                      borderRadius: '6px',
                      fontSize: '14px',
                      background: 'var(--input-bg)',
                      color: 'var(--text-primary)',
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
                    border: '1px solid var(--border-primary)',
                    borderRadius: '6px',
                    fontSize: '14px',
                    background: 'var(--input-bg)',
                    color: 'var(--text-primary)',
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
                    border: '1px solid var(--border-primary)',
                    borderRadius: '6px',
                    fontSize: '14px',
                    background: 'var(--input-bg)',
                    color: 'var(--text-primary)',
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
                    border: '1px solid var(--border-primary)',
                    borderRadius: '6px',
                    fontSize: '14px',
                    background: 'var(--input-bg)',
                    color: 'var(--text-primary)',
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
                  background: 'var(--bg-tertiary)',
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
                  background: formData.razon_social && formData.numero_documento ? 'var(--color-success)' : 'var(--border-primary)',
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
            background: 'var(--card-bg)',
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
                  borderBottom: '2px solid var(--color-primary)'
                }}>
                  <FileText size={20} style={{ color: 'var(--color-primary)' }} />
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-primary)', margin: 0 }}>
                    Información General
                  </h3>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Razón Social</span>
                    <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>{selectedProveedor.razon_social}</span>
                  </div>
                  <div>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Tipo de Documento</span>
                    <span
                      style={{
                        background: 'var(--badge-blue-bg)',
                        color: 'var(--badge-blue-text)',
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
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Número de Documento</span>
                    <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-primary)' }}>{selectedProveedor.numero_documento}</span>
                  </div>
                  <div>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Categoría</span>
                    {selectedProveedor.categoria ? (
                      <span
                        style={{
                          background: 'var(--badge-purple-bg, #f3e8ff)',
                          color: 'var(--badge-purple-text, #7c3aed)',
                          padding: '4px 12px',
                          borderRadius: '12px',
                          fontSize: '13px',
                          fontWeight: 600,
                          display: 'inline-block'
                        }}
                      >
                        {CATEGORIAS_PROVEEDOR.find(c => c.value === selectedProveedor.categoria)?.label || selectedProveedor.categoria}
                      </span>
                    ) : (
                      <span style={{ fontSize: '14px', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>-</span>
                    )}
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
                  borderBottom: '2px solid var(--color-primary)'
                }}>
                  <Phone size={20} style={{ color: 'var(--color-primary)' }} />
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-primary)', margin: 0 }}>
                    Información de Contacto
                  </h3>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Teléfono</span>
                    <span style={{ fontSize: '14px', fontWeight: 600 }}>
                      {selectedProveedor.telefono || '-'}
                    </span>
                  </div>
                  <div>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Email</span>
                    <span style={{ fontSize: '14px', fontWeight: 600 }}>
                      {selectedProveedor.email || '-'}
                    </span>
                  </div>
                  {selectedProveedor.direccion && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Dirección</span>
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
                    borderBottom: '2px solid var(--color-primary)'
                  }}>
                    <CreditCard size={20} style={{ color: 'var(--color-primary)' }} />
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-primary)', margin: 0 }}>
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
                    borderBottom: '2px solid var(--color-primary)'
                  }}>
                    <FileText size={20} style={{ color: 'var(--color-primary)' }} />
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-primary)', margin: 0 }}>
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
                  borderBottom: '2px solid var(--color-primary)'
                }}>
                  <Calendar size={20} style={{ color: 'var(--color-primary)' }} />
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-primary)', margin: 0 }}>
                    Información de Registro
                  </h3>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Estado</span>
                    <span
                      style={{
                        background: selectedProveedor.activo ? 'var(--badge-green-bg)' : 'var(--badge-red-bg)',
                        color: selectedProveedor.activo ? 'var(--badge-green-text)' : 'var(--badge-red-text)',
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
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Creado</span>
                    <span style={{ fontSize: '14px' }}>
                      {formatDateTimeAR(selectedProveedor.created_at)}
                    </span>
                  </div>
                  <div>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Actualizado</span>
                    <span style={{ fontSize: '14px' }}>
                      {formatDateTimeAR(selectedProveedor.updated_at)}
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
                  background: 'var(--color-primary)',
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
