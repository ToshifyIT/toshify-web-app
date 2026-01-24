import { useEffect, useState, useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { supabase } from '../../lib/supabase'
import { LoadingOverlay } from '../../components/ui/LoadingOverlay'
import Swal from 'sweetalert2'
import { showSuccess } from '../../utils/toast'
import { Eye, Edit, Trash2, Building2, FileText, Phone, CreditCard, Calendar, Filter, CheckCircle, XCircle, RotateCcw } from 'lucide-react'
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
  const [categoriaFilter, setCategoriaFilter] = useState<string[]>([])
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

  // Valores únicos para filtro de categoría
  const categoriasUnicas = useMemo(() => {
    const cats = proveedores
      .map(p => p.categoria)
      .filter((c): c is CategoriaProveedor => !!c)
    return [...new Set(cats)].sort()
  }, [proveedores])

  // Toggle functions para multiselect
  const toggleRazonSocialFilter = (razon: string) => {
    setRazonSocialFilter(prev =>
      prev.includes(razon) ? prev.filter(r => r !== razon) : [...prev, razon]
    )
  }

  const toggleCategoriaFilter = (cat: string) => {
    setCategoriaFilter(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
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

  // Filtrar proveedores - STAT CARD PREVALECE sobre filtros de columna
  const filteredProveedores = useMemo(() => {
    let result = proveedores

    // Si hay stat card activo, SOLO aplicar ese filtro (ignorar filtros de columna)
    if (statCardEstadoFilter.length > 0) {
      return proveedores.filter(p => {
        const estadoStr = p.activo ? 'true' : 'false'
        return statCardEstadoFilter.includes(estadoStr)
      })
    }

    // Sin stat card activo → aplicar filtros de columna
    if (razonSocialFilter.length > 0) {
      result = result.filter(p =>
        razonSocialFilter.includes(p.razon_social || '')
      )
    }

    if (categoriaFilter.length > 0) {
      result = result.filter(p =>
        p.categoria && categoriaFilter.includes(p.categoria)
      )
    }

    if (estadoFilter.length > 0) {
      result = result.filter(p => {
        const estadoStr = p.activo ? 'true' : 'false'
        return estadoFilter.includes(estadoStr)
      })
    }

    return result
  }, [proveedores, razonSocialFilter, categoriaFilter, estadoFilter, statCardEstadoFilter])

  const loadProveedores = async () => {
    try {
      setLoading(true)
      // Cargar todos los proveedores (activos e inactivos)
      const { data, error } = await supabase
        .from('proveedores')
        .select('*')
        .order('activo', { ascending: false }) // Activos primero
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

      showSuccess('Proveedor creado', 'El proveedor ha sido creado exitosamente')

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

      showSuccess('Proveedor actualizado', 'El proveedor ha sido actualizado exitosamente')

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
        text: 'No tienes permisos para desactivar proveedores'
      })
      return
    }

    // Buscar el proveedor para mostrar su nombre
    const proveedor = proveedores.find(p => p.id === id)
    const nombreProveedor = proveedor?.razon_social || 'este proveedor'

    const result = await Swal.fire({
      title: '¿Desactivar proveedor?',
      html: `El proveedor <strong>${nombreProveedor}</strong> será marcado como inactivo y ya no aparecerá en las listas.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#EF4444',
      cancelButtonColor: '#6B7280',
      confirmButtonText: 'Sí, desactivar',
      cancelButtonText: 'Cancelar'
    })

    if (result.isConfirmed) {
      try {
        // Soft delete: marcar como inactivo en lugar de eliminar
        const { error } = await (supabase
          .from('proveedores') as any)
          .update({ activo: false, updated_at: new Date().toISOString() })
          .eq('id', id)

        if (error) throw error

        showSuccess('Proveedor desactivado', `${nombreProveedor} ha sido desactivado correctamente.`)

        loadProveedores()
      } catch (err: any) {
        console.error('Error desactivando proveedor:', err)
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: err.message || 'No se pudo desactivar el proveedor',
        })
      }
    }
  }

  const handleReactivar = async (id: string) => {
    if (!canEdit) {
      Swal.fire({
        icon: 'error',
        title: 'Sin permisos',
        text: 'No tienes permisos para reactivar proveedores'
      })
      return
    }

    const proveedor = proveedores.find(p => p.id === id)
    const nombreProveedor = proveedor?.razon_social || 'este proveedor'

    const result = await Swal.fire({
      title: '¿Reactivar proveedor?',
      html: `El proveedor <strong>${nombreProveedor}</strong> será marcado como activo nuevamente.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#10B981',
      cancelButtonColor: '#6B7280',
      confirmButtonText: 'Sí, reactivar',
      cancelButtonText: 'Cancelar'
    })

    if (result.isConfirmed) {
      try {
        const { error } = await (supabase
          .from('proveedores') as any)
          .update({ activo: true, updated_at: new Date().toISOString() })
          .eq('id', id)

        if (error) throw error

        showSuccess('Proveedor reactivado', `${nombreProveedor} ha sido reactivado correctamente.`)

        loadProveedores()
      } catch (err: any) {
        console.error('Error reactivando proveedor:', err)
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: err.message || 'No se pudo reactivar el proveedor',
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
        header: () => (
          <div className="dt-column-filter">
            <span>Categoría {categoriaFilter.length > 0 && `(${categoriaFilter.length})`}</span>
            <button
              className={`dt-column-filter-btn ${categoriaFilter.length > 0 ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                setOpenColumnFilter(openColumnFilter === 'categoria' ? null : 'categoria')
              }}
              title="Filtrar por categoría"
            >
              <Filter size={12} />
            </button>
            {openColumnFilter === 'categoria' && (
              <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
                <div className="dt-excel-filter-list">
                  {categoriasUnicas.length === 0 ? (
                    <div className="dt-excel-filter-empty">Sin categorías</div>
                  ) : (
                    categoriasUnicas.map(cat => {
                      const catInfo = CATEGORIAS_PROVEEDOR.find(c => c.value === cat)
                      return (
                        <label key={cat} className={`dt-column-filter-checkbox ${categoriaFilter.includes(cat) ? 'selected' : ''}`}>
                          <input
                            type="checkbox"
                            checked={categoriaFilter.includes(cat)}
                            onChange={() => toggleCategoriaFilter(cat)}
                          />
                          <span>{catInfo?.label || cat}</span>
                        </label>
                      )
                    })
                  )}
                </div>
                {categoriaFilter.length > 0 && (
                  <button
                    className="dt-column-filter-clear"
                    onClick={() => setCategoriaFilter([])}
                  >
                    Limpiar ({categoriaFilter.length})
                  </button>
                )}
              </div>
            )}
          </div>
        ),
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
            {canDelete && row.original.activo && (
              <button
                className="dt-btn-action dt-btn-delete"
                onClick={() => handleDelete(row.original.id)}
                title="Desactivar"
              >
                <Trash2 size={16} />
              </button>
            )}
            {canEdit && !row.original.activo && (
              <button
                className="dt-btn-action dt-btn-reactivar"
                onClick={() => handleReactivar(row.original.id)}
                title="Reactivar"
              >
                <RotateCcw size={16} />
              </button>
            )}
          </div>
        ),
      },
    ],
    [canView, canEdit, canDelete, razonSocialFilter, categoriaFilter, categoriasUnicas, estadoFilter, openColumnFilter, handleReactivar]
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
      <LoadingOverlay show={loading} message="Cargando proveedores..." size="lg" />
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
          setCategoriaFilter([])
          setEstadoFilter([])
          setActiveStatCard(null)
          setStatCardEstadoFilter([])
        }}
      />

      {/* Create Modal */}
      {showCreateModal && (
        <div className="prov-modal-overlay">
          <div className="prov-modal-content">
            <div className="prov-modal-header">
              <h2><Building2 size={24} /> Crear Proveedor</h2>
            </div>

            <div className="prov-modal-body">
              <div className="prov-form-grid">
                <div className="prov-form-group">
                  <label className="prov-form-label">Razon Social *</label>
                  <input
                    type="text"
                    className="prov-form-input"
                    value={formData.razon_social}
                    onChange={(e) => setFormData({ ...formData, razon_social: e.target.value })}
                  />
                </div>

                <div className="prov-form-row">
                  <div className="prov-form-group">
                    <label className="prov-form-label">Tipo Documento *</label>
                    <select
                      className="prov-form-select"
                      value={formData.tipo_documento}
                      onChange={(e) => setFormData({ ...formData, tipo_documento: e.target.value as any })}
                    >
                      <option value="RUC">RUC</option>
                      <option value="DNI">DNI</option>
                      <option value="CUIT">CUIT</option>
                      <option value="CUIL">CUIL</option>
                    </select>
                  </div>

                  <div className="prov-form-group">
                    <label className="prov-form-label">Numero de Documento *</label>
                    <input
                      type="text"
                      className="prov-form-input"
                      value={formData.numero_documento}
                      onChange={(e) => setFormData({ ...formData, numero_documento: e.target.value })}
                    />
                  </div>
                </div>

                <div className="prov-form-group">
                  <label className="prov-form-label">Categoria de Proveedor</label>
                  <select
                    className="prov-form-select"
                    value={formData.categoria}
                    onChange={(e) => setFormData({ ...formData, categoria: e.target.value as CategoriaProveedor | '' })}
                  >
                    <option value="">Seleccionar categoria...</option>
                    {CATEGORIAS_PROVEEDOR.map((cat) => (
                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                    ))}
                  </select>
                </div>

                <div className="prov-form-row-2">
                  <div className="prov-form-group">
                    <label className="prov-form-label">Telefono</label>
                    <input
                      type="text"
                      className="prov-form-input"
                      value={formData.telefono}
                      onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                    />
                  </div>

                  <div className="prov-form-group">
                    <label className="prov-form-label">Email</label>
                    <input
                      type="email"
                      className="prov-form-input"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                </div>

                <div className="prov-form-group">
                  <label className="prov-form-label">Direccion</label>
                  <textarea
                    className="prov-form-textarea"
                    value={formData.direccion}
                    onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
                    rows={2}
                  />
                </div>

                <div className="prov-form-group">
                  <label className="prov-form-label">Informacion de Pago</label>
                  <textarea
                    className="prov-form-textarea"
                    value={formData.informacion_pago}
                    onChange={(e) => setFormData({ ...formData, informacion_pago: e.target.value })}
                    rows={3}
                    placeholder="Ej: CBU, alias, tarjeta, efectivo, transferencia, etc."
                  />
                </div>

                <div className="prov-form-group">
                  <label className="prov-form-label">Observaciones</label>
                  <textarea
                    className="prov-form-textarea"
                    value={formData.observaciones}
                    onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
                    rows={2}
                  />
                </div>
              </div>
            </div>

            <div className="prov-modal-footer">
              <button
                className="prov-btn-primary"
                onClick={handleCreate}
                disabled={!formData.razon_social || !formData.numero_documento}
              >
                Crear Proveedor
              </button>
              <button
                className="prov-btn-secondary"
                onClick={() => {
                  setShowCreateModal(false)
                  resetForm()
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedProveedor && (
        <div className="prov-modal-overlay">
          <div className="prov-modal-content">
            <div className="prov-modal-header">
              <h2><Edit size={24} /> Editar Proveedor</h2>
            </div>

            <div className="prov-modal-body">
              <div className="prov-form-grid">
                <div className="prov-form-group">
                  <label className="prov-form-label">Razon Social *</label>
                  <input
                    type="text"
                    className="prov-form-input"
                    value={formData.razon_social}
                    onChange={(e) => setFormData({ ...formData, razon_social: e.target.value })}
                  />
                </div>

                <div className="prov-form-row">
                  <div className="prov-form-group">
                    <label className="prov-form-label">Tipo Documento *</label>
                    <select
                      className="prov-form-select"
                      value={formData.tipo_documento}
                      onChange={(e) => setFormData({ ...formData, tipo_documento: e.target.value as any })}
                    >
                      <option value="RUC">RUC</option>
                      <option value="DNI">DNI</option>
                      <option value="CUIT">CUIT</option>
                      <option value="CUIL">CUIL</option>
                    </select>
                  </div>

                  <div className="prov-form-group">
                    <label className="prov-form-label">Numero de Documento *</label>
                    <input
                      type="text"
                      className="prov-form-input"
                      value={formData.numero_documento}
                      onChange={(e) => setFormData({ ...formData, numero_documento: e.target.value })}
                    />
                  </div>
                </div>

                <div className="prov-form-group">
                  <label className="prov-form-label">Categoria de Proveedor</label>
                  <select
                    className="prov-form-select"
                    value={formData.categoria}
                    onChange={(e) => setFormData({ ...formData, categoria: e.target.value as CategoriaProveedor | '' })}
                  >
                    <option value="">Seleccionar categoria...</option>
                    {CATEGORIAS_PROVEEDOR.map((cat) => (
                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                    ))}
                  </select>
                </div>

                <div className="prov-form-row-2">
                  <div className="prov-form-group">
                    <label className="prov-form-label">Telefono</label>
                    <input
                      type="text"
                      className="prov-form-input"
                      value={formData.telefono}
                      onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                    />
                  </div>

                  <div className="prov-form-group">
                    <label className="prov-form-label">Email</label>
                    <input
                      type="email"
                      className="prov-form-input"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                </div>

                <div className="prov-form-group">
                  <label className="prov-form-label">Direccion</label>
                  <textarea
                    className="prov-form-textarea"
                    value={formData.direccion}
                    onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
                    rows={2}
                  />
                </div>

                <div className="prov-form-group">
                  <label className="prov-form-label">Informacion de Pago</label>
                  <textarea
                    className="prov-form-textarea"
                    value={formData.informacion_pago}
                    onChange={(e) => setFormData({ ...formData, informacion_pago: e.target.value })}
                    rows={3}
                    placeholder="Ej: CBU, alias, tarjeta, efectivo, transferencia, etc."
                  />
                </div>

                <div className="prov-form-group">
                  <label className="prov-form-label">Observaciones</label>
                  <textarea
                    className="prov-form-textarea"
                    value={formData.observaciones}
                    onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
                    rows={2}
                  />
                </div>
              </div>
            </div>

            <div className="prov-modal-footer">
              <button
                className="prov-btn-success"
                onClick={handleEdit}
                disabled={!formData.razon_social || !formData.numero_documento}
              >
                Actualizar Proveedor
              </button>
              <button
                className="prov-btn-secondary"
                onClick={() => {
                  setShowEditModal(false)
                  resetForm()
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Modal */}
      {showViewModal && selectedProveedor && (
        <div className="prov-modal-overlay">
          <div className="prov-modal-content wide">
            <div className="prov-modal-header">
              <h2><Building2 size={24} /> Detalles del Proveedor</h2>
            </div>

            <div className="prov-modal-body">
              <div className="prov-view-sections">
                {/* Informacion General */}
                <div className="prov-view-section">
                  <div className="prov-section-header">
                    <FileText size={20} />
                    <h3>Informacion General</h3>
                  </div>

                  <div className="prov-info-grid">
                    <div className="prov-info-item full">
                      <span className="prov-info-label">Razon Social</span>
                      <span className="prov-info-value large">{selectedProveedor.razon_social}</span>
                    </div>
                    <div className="prov-info-item">
                      <span className="prov-info-label">Tipo de Documento</span>
                      <span className="dt-badge dt-badge-blue">{selectedProveedor.tipo_documento}</span>
                    </div>
                    <div className="prov-info-item">
                      <span className="prov-info-label">Numero de Documento</span>
                      <span className="prov-info-value">{selectedProveedor.numero_documento}</span>
                    </div>
                    <div className="prov-info-item">
                      <span className="prov-info-label">Categoria</span>
                      {selectedProveedor.categoria ? (
                        <span className="dt-badge dt-badge-purple">
                          {CATEGORIAS_PROVEEDOR.find(c => c.value === selectedProveedor.categoria)?.label || selectedProveedor.categoria}
                        </span>
                      ) : (
                        <span className="prov-info-value empty">-</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Contacto */}
                <div className="prov-view-section">
                  <div className="prov-section-header">
                    <Phone size={20} />
                    <h3>Informacion de Contacto</h3>
                  </div>

                  <div className="prov-info-grid">
                    <div className="prov-info-item">
                      <span className="prov-info-label">Telefono</span>
                      <span className="prov-info-value">{selectedProveedor.telefono || '-'}</span>
                    </div>
                    <div className="prov-info-item">
                      <span className="prov-info-label">Email</span>
                      <span className="prov-info-value">{selectedProveedor.email || '-'}</span>
                    </div>
                    {selectedProveedor.direccion && (
                      <div className="prov-info-item full">
                        <span className="prov-info-label">Direccion</span>
                        <span className="prov-info-value">{selectedProveedor.direccion}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Informacion de Pago */}
                {selectedProveedor.informacion_pago && (
                  <div className="prov-view-section">
                    <div className="prov-section-header">
                      <CreditCard size={20} />
                      <h3>Informacion de Pago</h3>
                    </div>
                    <div className="prov-info-item">
                      <span className="prov-info-value" style={{ whiteSpace: 'pre-wrap' }}>{selectedProveedor.informacion_pago}</span>
                    </div>
                  </div>
                )}

                {/* Observaciones */}
                {selectedProveedor.observaciones && (
                  <div className="prov-view-section">
                    <div className="prov-section-header">
                      <FileText size={20} />
                      <h3>Observaciones</h3>
                    </div>
                    <div className="prov-info-item">
                      <span className="prov-info-value" style={{ whiteSpace: 'pre-wrap' }}>{selectedProveedor.observaciones}</span>
                    </div>
                  </div>
                )}

                {/* Metadatos */}
                <div className="prov-view-section">
                  <div className="prov-section-header">
                    <Calendar size={20} />
                    <h3>Informacion de Registro</h3>
                  </div>

                  <div className="prov-info-grid">
                    <div className="prov-info-item">
                      <span className="prov-info-label">Estado</span>
                      <span className={selectedProveedor.activo ? 'dt-badge dt-badge-green' : 'dt-badge dt-badge-red'}>
                        {selectedProveedor.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </div>
                    <div className="prov-info-item">
                      <span className="prov-info-label">Creado</span>
                      <span className="prov-info-value">{formatDateTimeAR(selectedProveedor.created_at)}</span>
                    </div>
                    <div className="prov-info-item">
                      <span className="prov-info-label">Actualizado</span>
                      <span className="prov-info-value">{formatDateTimeAR(selectedProveedor.updated_at)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="prov-modal-footer">
              <button className="prov-btn-primary" onClick={() => setShowViewModal(false)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
