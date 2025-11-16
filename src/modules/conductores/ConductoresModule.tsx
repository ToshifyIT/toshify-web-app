// src/modules/conductores/ConductoresModule.tsx
import { useState, useEffect, useMemo } from 'react'
import { Eye, Edit2, Trash2, AlertTriangle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { usePermissions } from '../../contexts/PermissionsContext'
import Swal from 'sweetalert2'
import type {
  ConductorWithRelations,
  EstadoCivil,
  Nacionalidad,
  LicenciaCategoria,
  ConductorEstado,
  LicenciaEstado,
  LicenciaTipo
} from '../../types/database.types'
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

export function ConductoresModule() {
  const [conductores, setConductores] = useState<ConductorWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedConductor, setSelectedConductor] = useState<ConductorWithRelations | null>(null)

  // TanStack Table states
  const [globalFilter, setGlobalFilter] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])

  // Catalog states
  const [estadosCiviles, setEstadosCiviles] = useState<EstadoCivil[]>([])
  const [nacionalidades, setNacionalidades] = useState<Nacionalidad[]>([])
  const [categoriasLicencia, setCategoriasLicencia] = useState<LicenciaCategoria[]>([])
  const [estadosConductor, setEstadosConductor] = useState<ConductorEstado[]>([])
  const [estadosLicencia, setEstadosLicencia] = useState<LicenciaEstado[]>([])
  const [tiposLicencia, setTiposLicencia] = useState<LicenciaTipo[]>([])

  const { canCreateInMenu, canEditInMenu, canDeleteInMenu } = usePermissions()

  // Permisos específicos para el menú de conductores
  const canCreate = canCreateInMenu('conductores')
  const canUpdate = canEditInMenu('conductores')
  const canDelete = canDeleteInMenu('conductores')

  const [formData, setFormData] = useState({
    nombres: '',
    apellidos: '',
    numero_dni: '',
    numero_cuit: '',
    numero_licencia: '',
    licencia_categoria_id: '',
    licencia_vencimiento: '',
    licencia_estado_id: '',
    licencia_tipo_id: '',
    telefono_contacto: '',
    email: '',
    direccion: '',
    zona: '',
    fecha_nacimiento: '',
    estado_civil_id: '',
    nacionalidad_id: '',
    contacto_emergencia: '',
    telefono_emergencia: '',
    antecedentes_penales: false,
    antecedentes_transito: false,
    cochera_propia: false,
    fecha_contratacion: '',
    fecha_reincorpoaracion: '',
    fecha_terminacion: '',
    motivo_baja: '',
    estado_id: ''
  })

  useEffect(() => {
    loadConductores()
    loadCatalogs()
  }, [])

  const loadCatalogs = async () => {
    try {
      const [estadosCivilesRes, nacionalidadesRes, categoriasRes, estadosConductorRes, estadosLicenciaRes, tiposLicenciaRes] = await Promise.all([
        supabase.from('estados_civiles').select('*').order('descripcion'),
        supabase.from('nacionalidades').select('*').order('descripcion'),
        supabase.from('licencias_categorias').select('*').order('descripcion'),
        supabase.from('conductores_estados').select('*').order('descripcion'),
        supabase.from('licencias_estados').select('*').order('descripcion'),
        supabase.from('licencias_tipos').select('*').order('descripcion')
      ])

      console.log('Catálogos conductores:', { estadosCivilesRes, nacionalidadesRes, categoriasRes, estadosConductorRes, estadosLicenciaRes, tiposLicenciaRes })

      if (estadosCivilesRes.data) setEstadosCiviles(estadosCivilesRes.data)
      if (nacionalidadesRes.data) setNacionalidades(nacionalidadesRes.data)
      if (categoriasRes.data) setCategoriasLicencia(categoriasRes.data)
      if (estadosConductorRes.data) setEstadosConductor(estadosConductorRes.data)
      if (estadosLicenciaRes.data) setEstadosLicencia(estadosLicenciaRes.data)
      if (tiposLicenciaRes.data) setTiposLicencia(tiposLicenciaRes.data)

      if (estadosCivilesRes.error) console.error('Error estados_civiles:', estadosCivilesRes.error)
      if (nacionalidadesRes.error) console.error('Error nacionalidades:', nacionalidadesRes.error)
      if (categoriasRes.error) console.error('Error licencias_categorias:', categoriasRes.error)
      if (estadosConductorRes.error) console.error('Error conductores_estados:', estadosConductorRes.error)
      if (estadosLicenciaRes.error) console.error('Error licencias_estados:', estadosLicenciaRes.error)
      if (tiposLicenciaRes.error) console.error('Error licencias_tipos:', tiposLicenciaRes.error)
    } catch (err: any) {
      console.error('Error cargando catálogos:', err)
    }
  }

  const loadConductores = async () => {
    setLoading(true)
    setError('')

    try {
      const { data, error: fetchError } = await supabase
        .from('conductores')
        .select('*')
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError

      // Cargar las relaciones manualmente
      if (data && data.length > 0) {
        const conductoresConRelaciones = await Promise.all(
          data.map(async (conductor: any) => {
            const relaciones: any = { ...conductor }


            if (conductor.estado_civil_id) {
              const { data: estadoCivil } = await supabase.from('estados_civiles').select('id, codigo, descripcion').eq('id', conductor.estado_civil_id).single()
              relaciones.estados_civiles = estadoCivil
            }

            if (conductor.nacionalidad_id) {
              const { data: nacionalidad } = await supabase.from('nacionalidades').select('id, codigo, descripcion, gentilicio').eq('id', conductor.nacionalidad_id).single()
              relaciones.nacionalidades = nacionalidad
            }

            if (conductor.licencia_categoria_id) {
              const { data: categoria } = await supabase.from('licencias_categorias').select('id, codigo, descripcion').eq('id', conductor.licencia_categoria_id).single()
              relaciones.licencias_categorias = categoria
            }

            if (conductor.estado_id) {
              const { data: estado } = await supabase.from('conductores_estados').select('id, codigo, descripcion').eq('id', conductor.estado_id).single()
              relaciones.conductores_estados = estado
            }

            if (conductor.licencia_estado_id) {
              const { data: licenciaEstado } = await supabase.from('licencias_estados').select('id, codigo, descripcion').eq('id', conductor.licencia_estado_id).single()
              relaciones.licencias_estados = licenciaEstado
            }

            if (conductor.licencia_tipo_id) {
              const { data: tipoLicencia } = await supabase.from('licencias_tipos').select('id, codigo, descripcion').eq('id', conductor.licencia_tipo_id).single()
              relaciones.licencias_tipos = tipoLicencia
            }

            return relaciones
          })
        )

        setConductores(conductoresConRelaciones)
      } else {
        setConductores([])
      }
    } catch (err: any) {
      console.error('Error cargando conductores:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!canCreate) {
      Swal.fire({
        icon: 'error',
        title: 'Sin permisos',
        text: 'No tienes permisos para crear conductores',
        confirmButtonColor: '#E63946'
      })
      return
    }

    if (!formData.nombres || !formData.apellidos || !formData.licencia_vencimiento) {
      Swal.fire({
        icon: 'warning',
        title: 'Campos requeridos',
        text: 'Complete todos los campos requeridos',
        confirmButtonColor: '#E63946'
      })
      return
    }

    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()

      const { error: insertError } = await (supabase as any)
        .from('conductores')
        .insert([{
          nombres: formData.nombres,
          apellidos: formData.apellidos,
          numero_dni: formData.numero_dni || null,
          numero_cuit: formData.numero_cuit || null,
          numero_licencia: formData.numero_licencia || null,
          licencia_categoria_id: formData.licencia_categoria_id || null,
          licencia_vencimiento: formData.licencia_vencimiento,
          licencia_estado_id: formData.licencia_estado_id || null,
          licencia_tipo_id: formData.licencia_tipo_id || null,
          telefono_contacto: formData.telefono_contacto || null,
          email: formData.email || null,
          direccion: formData.direccion || null,
          zona: formData.zona || null,
          fecha_nacimiento: formData.fecha_nacimiento || null,
          estado_civil_id: formData.estado_civil_id || null,
          nacionalidad_id: formData.nacionalidad_id || null,
          contacto_emergencia: formData.contacto_emergencia || null,
          telefono_emergencia: formData.telefono_emergencia || null,
          antecedentes_penales: formData.antecedentes_penales,
          antecedentes_transito: formData.antecedentes_transito,
          cochera_propia: formData.cochera_propia,
          fecha_contratacion: formData.fecha_contratacion || null,
          fecha_reincorpoaracion: formData.fecha_reincorpoaracion || null,
          fecha_terminacion: formData.fecha_terminacion || null,
          motivo_baja: formData.motivo_baja || null,
          estado_id: formData.estado_id || null,
          created_by: user?.id
        }])

      if (insertError) throw insertError

      Swal.fire({
        icon: 'success',
        title: '¡Éxito!',
        text: 'Conductor creado exitosamente',
        confirmButtonColor: '#E63946',
        timer: 2000
      })
      setShowCreateModal(false)
      resetForm()
      await loadConductores()
    } catch (err: any) {
      console.error('Error creando conductor:', err)
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.message,
        confirmButtonColor: '#E63946'
      })
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async () => {
    if (!canUpdate) {
      Swal.fire({
        icon: 'error',
        title: 'Sin permisos',
        text: 'No tienes permisos para editar conductores',
        confirmButtonColor: '#E63946'
      })
      return
    }

    if (!selectedConductor) return

    setSaving(true)
    try {
      const { error: updateError } = await (supabase as any)
        .from('conductores')
        .update({
          nombres: formData.nombres,
          apellidos: formData.apellidos,
          numero_dni: formData.numero_dni || null,
          numero_cuit: formData.numero_cuit || null,
          numero_licencia: formData.numero_licencia || null,
          licencia_categoria_id: formData.licencia_categoria_id || null,
          licencia_vencimiento: formData.licencia_vencimiento,
          licencia_estado_id: formData.licencia_estado_id || null,
          licencia_tipo_id: formData.licencia_tipo_id || null,
          telefono_contacto: formData.telefono_contacto || null,
          email: formData.email || null,
          direccion: formData.direccion || null,
          zona: formData.zona || null,
          fecha_nacimiento: formData.fecha_nacimiento || null,
          estado_civil_id: formData.estado_civil_id || null,
          nacionalidad_id: formData.nacionalidad_id || null,
          contacto_emergencia: formData.contacto_emergencia || null,
          telefono_emergencia: formData.telefono_emergencia || null,
          antecedentes_penales: formData.antecedentes_penales,
          antecedentes_transito: formData.antecedentes_transito,
          cochera_propia: formData.cochera_propia,
          fecha_contratacion: formData.fecha_contratacion || null,
          fecha_reincorpoaracion: formData.fecha_reincorpoaracion || null,
          fecha_terminacion: formData.fecha_terminacion || null,
          motivo_baja: formData.motivo_baja || null,
          estado_id: formData.estado_id || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedConductor.id)

      if (updateError) throw updateError

      Swal.fire({
        icon: 'success',
        title: '¡Éxito!',
        text: 'Conductor actualizado exitosamente',
        confirmButtonColor: '#E63946',
        timer: 2000
      })
      setShowEditModal(false)
      setSelectedConductor(null)
      resetForm()
      await loadConductores()
    } catch (err: any) {
      console.error('Error actualizando conductor:', err)
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.message,
        confirmButtonColor: '#E63946'
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!canDelete) {
      Swal.fire({
        icon: 'error',
        title: 'Sin permisos',
        text: 'No tienes permisos para eliminar conductores',
        confirmButtonColor: '#E63946'
      })
      return
    }

    if (!selectedConductor) return

    setSaving(true)
    try {
      const { error: deleteError } = await supabase
        .from('conductores')
        .delete()
        .eq('id', selectedConductor.id)

      if (deleteError) throw deleteError

      Swal.fire({
        icon: 'success',
        title: '¡Éxito!',
        text: 'Conductor eliminado exitosamente',
        confirmButtonColor: '#E63946',
        timer: 2000
      })
      setShowDeleteModal(false)
      setSelectedConductor(null)
      await loadConductores()
    } catch (err: any) {
      console.error('Error eliminando conductor:', err)
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.message,
        confirmButtonColor: '#E63946'
      })
    } finally {
      setSaving(false)
    }
  }

  const openEditModal = (conductor: ConductorWithRelations) => {
    setSelectedConductor(conductor)
    setFormData({
      nombres: conductor.nombres,
      apellidos: conductor.apellidos,
      numero_dni: conductor.numero_dni || '',
      numero_cuit: conductor.numero_cuit || '',
      numero_licencia: conductor.numero_licencia || '',
      licencia_categoria_id: conductor.licencia_categoria_id || '',
      licencia_vencimiento: conductor.licencia_vencimiento,
      licencia_estado_id: conductor.licencia_estado_id || '',
      licencia_tipo_id: conductor.licencia_tipo_id || '',
      telefono_contacto: conductor.telefono_contacto || '',
      email: conductor.email || '',
      direccion: conductor.direccion || '',
      zona: conductor.zona || '',
      fecha_nacimiento: conductor.fecha_nacimiento || '',
      estado_civil_id: conductor.estado_civil_id || '',
      nacionalidad_id: conductor.nacionalidad_id || '',
      contacto_emergencia: conductor.contacto_emergencia || '',
      telefono_emergencia: conductor.telefono_emergencia || '',
      antecedentes_penales: conductor.antecedentes_penales,
      antecedentes_transito: conductor.antecedentes_transito,
      cochera_propia: conductor.cochera_propia,
      fecha_contratacion: conductor.fecha_contratacion || '',
      fecha_reincorpoaracion: conductor.fecha_reincorpoaracion || '',
      fecha_terminacion: conductor.fecha_terminacion || '',
      motivo_baja: conductor.motivo_baja || '',
      estado_id: conductor.estado_id || ''
    })
    setShowEditModal(true)
  }

  const openDeleteModal = (conductor: ConductorWithRelations) => {
    setSelectedConductor(conductor)
    setShowDeleteModal(true)
  }

  const resetForm = () => {
    setFormData({
      nombres: '',
      apellidos: '',
      numero_dni: '',
      numero_cuit: '',
      numero_licencia: '',
      licencia_categoria_id: '',
      licencia_vencimiento: '',
      licencia_estado_id: '',
      licencia_tipo_id: '',
      telefono_contacto: '',
      email: '',
      direccion: '',
      zona: '',
      fecha_nacimiento: '',
      estado_civil_id: '',
      nacionalidad_id: '',
      contacto_emergencia: '',
      telefono_emergencia: '',
      antecedentes_penales: false,
      antecedentes_transito: false,
      cochera_propia: false,
      fecha_contratacion: '',
      fecha_reincorpoaracion: '',
      fecha_terminacion: '',
      motivo_baja: '',
      estado_id: ''
    })
  }

  const getEstadoBadgeClass = (estado: string) => {
    switch (estado) {
      case 'activo':
        return 'badge-available'
      case 'inactivo':
        return 'badge-inactive'
      case 'suspendido':
        return 'badge-maintenance'
      default:
        return 'badge-inactive'
    }
  }

  const getEstadoLabel = (estado: string) => {
    switch (estado) {
      case 'activo':
        return 'Activo'
      case 'inactivo':
        return 'Inactivo'
      case 'suspendido':
        return 'Suspendido'
      default:
        return estado
    }
  }

  // Definir columnas para TanStack Table
  const columns = useMemo<ColumnDef<ConductorWithRelations>[]>(
    () => [
      {
        accessorKey: 'nombres',
        header: 'Nombre',
        cell: ({ row }) => (
          <strong>{`${row.original.nombres} ${row.original.apellidos}`}</strong>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'numero_dni',
        header: 'DNI',
        cell: ({ getValue }) => (getValue() as string) || 'N/A',
        enableSorting: true,
      },
      {
        accessorKey: 'numero_licencia',
        header: 'Licencia',
        cell: ({ getValue }) => (getValue() as string) || 'N/A',
        enableSorting: true,
      },
      {
        accessorKey: 'licencias_categorias.descripcion',
        header: 'Categoría',
        cell: ({ row }) => (
          <span style={{
            background: '#DBEAFE',
            color: '#1E40AF',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: '600'
          }}>
            {row.original.licencias_categorias?.codigo || 'N/A'}
          </span>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'licencia_vencimiento',
        header: 'Vencimiento',
        cell: ({ getValue }) => new Date(getValue() as string).toLocaleDateString('es-AR'),
        enableSorting: true,
      },
      {
        accessorKey: 'telefono_contacto',
        header: 'Teléfono',
        cell: ({ getValue }) => (getValue() as string) || 'N/A',
        enableSorting: true,
      },
      {
        accessorKey: 'conductores_estados.descripcion',
        header: 'Estado',
        cell: ({ row }) => {
          const descripcion = row.original.conductores_estados?.descripcion || 'N/A'
          const esActivo = descripcion.toLowerCase().includes('activo')
          return (
            <span className="badge" style={{
              backgroundColor: '#3B82F6',
              color: 'white',
              padding: '4px 12px',
              borderRadius: '12px',
              fontSize: '12px',
              fontWeight: '600'
            }}>
              {esActivo ? 'Activo' : descripcion}
            </span>
          )
        },
        enableSorting: true,
      },
      {
        id: 'acciones',
        header: 'Acciones',
        cell: ({ row }) => (
          <div>
            <button
              className="btn-action btn-view"
              onClick={() => {
                setSelectedConductor(row.original)
                setShowDetailsModal(true)
              }}
              title="Ver detalles"
            >
              <Eye size={16} />
            </button>
            <button
              className="btn-action btn-edit"
              onClick={() => openEditModal(row.original)}
              disabled={!canUpdate}
              title={!canUpdate ? 'No tienes permisos para editar' : 'Editar conductor'}
            >
              <Edit2 size={16} />
            </button>
            <button
              className="btn-action btn-delete"
              onClick={() => openDeleteModal(row.original)}
              disabled={!canDelete}
              title={!canDelete ? 'No tienes permisos para eliminar' : 'Eliminar conductor'}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ),
        enableSorting: false,
      },
    ],
    [canUpdate, canDelete]
  )

  // Configurar TanStack Table
  const table = useReactTable({
    data: conductores,
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
        Cargando conductores...
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
        .conductores-container {
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

        .badge-available {
          background: #D1FAE5;
          color: #065F46;
        }

        .badge-inactive {
          background: #FEE2E2;
          color: #DC2626;
        }

        .badge-maintenance {
          background: #FEF3C7;
          color: #92400E;
        }

        .btn-action {
          padding: 6px 12px;
          border: 1px solid #E5E7EB;
          border-radius: 6px;
          background: white;
          color: #1F2937;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          margin: 0 4px;
        }

        .btn-action:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-action.btn-view:hover {
          border-color: #8B5CF6;
          color: #8B5CF6;
          background: #F5F3FF;
        }

        .btn-action.btn-edit:not(:disabled):hover {
          border-color: #3B82F6;
          color: #3B82F6;
          background: #EFF6FF;
        }

        .btn-action.btn-delete:not(:disabled):hover {
          border-color: #E63946;
          color: #E63946;
          background: #FEE2E2;
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
          max-width: 900px;
          width: 90%;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 16px;
        }

        .form-row-3 {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 16px;
          margin-bottom: 16px;
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

        .form-checkbox {
          margin-right: 8px;
        }

        .delete-warning {
          background: #FEF2F2;
          border: 1px solid #FEE2E2;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 20px;
        }

        .delete-warning-title {
          color: #DC2626;
          font-weight: 600;
          font-size: 14px;
          margin-bottom: 8px;
        }

        .delete-warning-text {
          color: #7F1D1D;
          font-size: 14px;
          line-height: 1.6;
        }

        .section-title {
          font-size: 16px;
          font-weight: 700;
          color: #1F2937;
          margin: 24px 0 16px 0;
          padding-bottom: 8px;
          border-bottom: 2px solid #E5E7EB;
        }

        .details-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 16px;
        }

        .detail-item {
          margin-bottom: 12px;
        }

        .detail-label {
          font-weight: 600;
          fontSize: 12px;
          color: #6B7280;
          display: block;
          marginBottom: 4px;
        }

        .detail-value {
          fontSize: 14px;
          color: #1F2937;
        }

        @media (max-width: 768px) {
          .form-row, .form-row-3, .details-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div className="conductores-container">
        {/* Header */}
        <div style={{ marginBottom: '32px', textAlign: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '24px', fontWeight: '700', color: '#1F2937' }}>
            Gestión de Conductores
          </h3>
          <p style={{ margin: '8px 0 0 0', fontSize: '15px', color: '#6B7280' }}>
            {conductores.length} conductor{conductores.length !== 1 ? 'es' : ''} registrado{conductores.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Action Button */}
        <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            className="btn-primary"
            onClick={() => setShowCreateModal(true)}
            disabled={!canCreate}
            title={!canCreate ? 'No tienes permisos para crear conductores' : ''}
          >
            + Crear Conductor
          </button>
        </div>

        {conductores.length > 0 ? (
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
                  placeholder="Buscar por nombre, DNI, licencia..."
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
                      <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: '#9CA3AF' }}>
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
              No hay conductores registrados
            </h3>
            <p style={{ margin: 0, fontSize: '14px' }}>
              {canCreate ? 'Crea el primero usando el botón "+ Crear Conductor".' : ''}
            </p>
          </div>
        )}
      </div>

      {/* Modales definidos en componente separado para reducir tamaño del archivo */}
      {showCreateModal && <ModalCrear formData={formData} setFormData={setFormData} saving={saving} handleCreate={handleCreate} setShowCreateModal={setShowCreateModal} resetForm={resetForm} estadosCiviles={estadosCiviles} nacionalidades={nacionalidades} categoriasLicencia={categoriasLicencia} estadosConductor={estadosConductor} estadosLicencia={estadosLicencia} tiposLicencia={tiposLicencia} />}
      {showEditModal && selectedConductor && <ModalEditar formData={formData} setFormData={setFormData} saving={saving} handleUpdate={handleUpdate} setShowEditModal={setShowEditModal} setSelectedConductor={setSelectedConductor} resetForm={resetForm} estadosCiviles={estadosCiviles} nacionalidades={nacionalidades} categoriasLicencia={categoriasLicencia} estadosConductor={estadosConductor} estadosLicencia={estadosLicencia} tiposLicencia={tiposLicencia} />}
      {showDeleteModal && selectedConductor && <ModalEliminar selectedConductor={selectedConductor} saving={saving} handleDelete={handleDelete} setShowDeleteModal={setShowDeleteModal} setSelectedConductor={setSelectedConductor} />}
      {showDetailsModal && selectedConductor && <ModalDetalles selectedConductor={selectedConductor} setShowDetailsModal={setShowDetailsModal} getEstadoBadgeClass={getEstadoBadgeClass} getEstadoLabel={getEstadoLabel} />}
    </div>
  )
}

// Componentes de modales separados para mejor organización
function ModalCrear({ formData, setFormData, saving, handleCreate, setShowCreateModal, resetForm, estadosCiviles, nacionalidades, categoriasLicencia, estadosConductor, estadosLicencia, tiposLicencia }: any) {
  return (
    <div className="modal-overlay" onClick={() => !saving && setShowCreateModal(false)}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0, fontSize: '20px', fontWeight: '700' }}>
          Crear Nuevo Conductor
        </h2>

        <div className="section-title">Información Personal</div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Nombres *</label>
            <input type="text" className="form-input" value={formData.nombres} onChange={(e) => setFormData({ ...formData, nombres: e.target.value })} disabled={saving} />
          </div>
          <div className="form-group">
            <label className="form-label">Apellidos *</label>
            <input type="text" className="form-input" value={formData.apellidos} onChange={(e) => setFormData({ ...formData, apellidos: e.target.value })} disabled={saving} />
          </div>
        </div>

        <div className="form-row-3">
          <div className="form-group">
            <label className="form-label">Número DNI</label>
            <input type="text" className="form-input" value={formData.numero_dni} onChange={(e) => setFormData({ ...formData, numero_dni: e.target.value })} disabled={saving} />
          </div>
          <div className="form-group">
            <label className="form-label">CUIT</label>
            <input type="text" className="form-input" value={formData.numero_cuit} onChange={(e) => setFormData({ ...formData, numero_cuit: e.target.value })} disabled={saving} />
          </div>
          <div className="form-group">
            <label className="form-label">Fecha de Nacimiento</label>
            <input type="date" className="form-input" value={formData.fecha_nacimiento} onChange={(e) => setFormData({ ...formData, fecha_nacimiento: e.target.value })} disabled={saving} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Nacionalidad</label>
            <select className="form-input" value={formData.nacionalidad_id} onChange={(e) => setFormData({ ...formData, nacionalidad_id: e.target.value })} disabled={saving}>
              <option value="">Seleccionar...</option>
              {nacionalidades.map((nacionalidad: any) => (
                <option key={nacionalidad.id} value={nacionalidad.id}>{nacionalidad.descripcion}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Estado Civil</label>
            <select className="form-input" value={formData.estado_civil_id} onChange={(e) => setFormData({ ...formData, estado_civil_id: e.target.value })} disabled={saving}>
              <option value="">Seleccionar...</option>
              {estadosCiviles.map((estado: any) => (
                <option key={estado.id} value={estado.id}>{estado.descripcion}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Zona</label>
            <input type="text" className="form-input" value={formData.zona} onChange={(e) => setFormData({ ...formData, zona: e.target.value })} disabled={saving} placeholder="Ej: Zona Norte, CABA, etc." />
          </div>
        </div>

        <div className="section-title">Información de Licencia</div>

        <div className="form-row-3">
          <div className="form-group">
            <label className="form-label">Nro. Licencia *</label>
            <input type="text" className="form-input" value={formData.numero_licencia} onChange={(e) => setFormData({ ...formData, numero_licencia: e.target.value })} disabled={saving} />
          </div>
          <div className="form-group">
            <label className="form-label">Categoría *</label>
            <select className="form-input" value={formData.licencia_categoria_id} onChange={(e) => setFormData({ ...formData, licencia_categoria_id: e.target.value })} disabled={saving}>
              <option value="">Seleccionar...</option>
              {categoriasLicencia.map((cat: any) => (
                <option key={cat.id} value={cat.id}>{cat.descripcion}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Vencimiento *</label>
            <input type="date" className="form-input" value={formData.licencia_vencimiento} onChange={(e) => setFormData({ ...formData, licencia_vencimiento: e.target.value })} disabled={saving} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Estado Licencia</label>
            <select className="form-input" value={formData.licencia_estado_id} onChange={(e) => setFormData({ ...formData, licencia_estado_id: e.target.value })} disabled={saving}>
              <option value="">Seleccionar...</option>
              {estadosLicencia.map((estado: any) => (
                <option key={estado.id} value={estado.id}>{estado.descripcion}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Tipo Licencia</label>
            <select className="form-input" value={formData.licencia_tipo_id} onChange={(e) => setFormData({ ...formData, licencia_tipo_id: e.target.value })} disabled={saving}>
              <option value="">Seleccionar...</option>
              {tiposLicencia.map((tipo: any) => (
                <option key={tipo.id} value={tipo.id}>{tipo.descripcion}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="section-title">Información de Contacto</div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Teléfono Contacto</label>
            <input type="tel" className="form-input" value={formData.telefono_contacto} onChange={(e) => setFormData({ ...formData, telefono_contacto: e.target.value })} disabled={saving} />
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input type="email" className="form-input" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} disabled={saving} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Dirección</label>
            <input type="text" className="form-input" value={formData.direccion} onChange={(e) => setFormData({ ...formData, direccion: e.target.value })} disabled={saving} />
          </div>
        </div>

        <div className="section-title">Contacto de Emergencia</div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Nombre Contacto</label>
            <input type="text" className="form-input" value={formData.contacto_emergencia} onChange={(e) => setFormData({ ...formData, contacto_emergencia: e.target.value })} disabled={saving} />
          </div>
          <div className="form-group">
            <label className="form-label">Teléfono Emergencia</label>
            <input type="tel" className="form-input" value={formData.telefono_emergencia} onChange={(e) => setFormData({ ...formData, telefono_emergencia: e.target.value })} disabled={saving} />
          </div>
        </div>

        <div className="section-title">Información Adicional</div>

        <div className="form-row-3" style={{ marginBottom: '16px' }}>
          <div>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" className="form-checkbox" checked={formData.antecedentes_penales} onChange={(e) => setFormData({ ...formData, antecedentes_penales: e.target.checked })} disabled={saving} />
              <span style={{ fontSize: '14px', fontWeight: '500' }}>Antecedentes Penales</span>
            </label>
          </div>
          <div>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" className="form-checkbox" checked={formData.antecedentes_transito} onChange={(e) => setFormData({ ...formData, antecedentes_transito: e.target.checked })} disabled={saving} />
              <span style={{ fontSize: '14px', fontWeight: '500' }}>Antecedentes de Tránsito</span>
            </label>
          </div>
          <div>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" className="form-checkbox" checked={formData.cochera_propia} onChange={(e) => setFormData({ ...formData, cochera_propia: e.target.checked })} disabled={saving} />
              <span style={{ fontSize: '14px', fontWeight: '500' }}>Cochera Propia</span>
            </label>
          </div>
        </div>

        <div className="section-title">Información Laboral</div>

        <div className="form-row-3">
          <div className="form-group">
            <label className="form-label">Fecha Contratación</label>
            <input type="date" className="form-input" value={formData.fecha_contratacion} onChange={(e) => setFormData({ ...formData, fecha_contratacion: e.target.value })} disabled={saving} />
          </div>
          <div className="form-group">
            <label className="form-label">Fecha Reincorporación</label>
            <input type="date" className="form-input" value={formData.fecha_reincorpoaracion} onChange={(e) => setFormData({ ...formData, fecha_reincorpoaracion: e.target.value })} disabled={saving} />
          </div>
          <div className="form-group">
            <label className="form-label">Estado</label>
            <select className="form-input" value={formData.estado_id} onChange={(e) => setFormData({ ...formData, estado_id: e.target.value })} disabled={saving}>
              <option value="">Seleccionar...</option>
              {estadosConductor.map((estado: any) => (
                <option key={estado.id} value={estado.id}>{estado.descripcion}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
          <button className="btn-secondary" onClick={() => { setShowCreateModal(false); resetForm() }} disabled={saving}>Cancelar</button>
          <button className="btn-primary" onClick={handleCreate} disabled={saving}>{saving ? 'Creando...' : 'Crear Conductor'}</button>
        </div>
      </div>
    </div>
  )
}

function ModalEditar({ formData, setFormData, saving, handleUpdate, setShowEditModal, setSelectedConductor, resetForm, estadosCiviles, nacionalidades, categoriasLicencia, estadosConductor, estadosLicencia, tiposLicencia }: any) {
  return (
    <div className="modal-overlay" onClick={() => !saving && setShowEditModal(false)}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0, fontSize: '20px', fontWeight: '700' }}>Editar Conductor</h2>

        <div className="section-title">Información Personal</div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Nombres *</label>
            <input type="text" className="form-input" value={formData.nombres} onChange={(e) => setFormData({ ...formData, nombres: e.target.value })} disabled={saving} />
          </div>
          <div className="form-group">
            <label className="form-label">Apellidos *</label>
            <input type="text" className="form-input" value={formData.apellidos} onChange={(e) => setFormData({ ...formData, apellidos: e.target.value })} disabled={saving} />
          </div>
        </div>

        <div className="form-row-3">
          <div className="form-group">
            <label className="form-label">Número DNI</label>
            <input type="text" className="form-input" value={formData.numero_dni} onChange={(e) => setFormData({ ...formData, numero_dni: e.target.value })} disabled={saving} />
          </div>
          <div className="form-group">
            <label className="form-label">CUIT</label>
            <input type="text" className="form-input" value={formData.numero_cuit} onChange={(e) => setFormData({ ...formData, numero_cuit: e.target.value })} disabled={saving} />
          </div>
          <div className="form-group">
            <label className="form-label">Fecha de Nacimiento</label>
            <input type="date" className="form-input" value={formData.fecha_nacimiento} onChange={(e) => setFormData({ ...formData, fecha_nacimiento: e.target.value })} disabled={saving} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Nacionalidad</label>
            <select className="form-input" value={formData.nacionalidad_id} onChange={(e) => setFormData({ ...formData, nacionalidad_id: e.target.value })} disabled={saving}>
              <option value="">Seleccionar...</option>
              {nacionalidades.map((nacionalidad: any) => (
                <option key={nacionalidad.id} value={nacionalidad.id}>{nacionalidad.descripcion}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Estado Civil</label>
            <select className="form-input" value={formData.estado_civil_id} onChange={(e) => setFormData({ ...formData, estado_civil_id: e.target.value })} disabled={saving}>
              <option value="">Seleccionar...</option>
              {estadosCiviles.map((estado: any) => (
                <option key={estado.id} value={estado.id}>{estado.descripcion}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Zona</label>
            <input type="text" className="form-input" value={formData.zona} onChange={(e) => setFormData({ ...formData, zona: e.target.value })} disabled={saving} placeholder="Ej: Zona Norte, CABA, etc." />
          </div>
        </div>

        <div className="section-title">Información de Licencia</div>

        <div className="form-row-3">
          <div className="form-group">
            <label className="form-label">Nro. Licencia *</label>
            <input type="text" className="form-input" value={formData.numero_licencia} onChange={(e) => setFormData({ ...formData, numero_licencia: e.target.value })} disabled={saving} />
          </div>
          <div className="form-group">
            <label className="form-label">Categoría *</label>
            <select className="form-input" value={formData.licencia_categoria_id} onChange={(e) => setFormData({ ...formData, licencia_categoria_id: e.target.value })} disabled={saving}>
              <option value="">Seleccionar...</option>
              {categoriasLicencia.map((cat: any) => (
                <option key={cat.id} value={cat.id}>{cat.descripcion}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Vencimiento *</label>
            <input type="date" className="form-input" value={formData.licencia_vencimiento} onChange={(e) => setFormData({ ...formData, licencia_vencimiento: e.target.value })} disabled={saving} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Estado Licencia</label>
            <select className="form-input" value={formData.licencia_estado_id} onChange={(e) => setFormData({ ...formData, licencia_estado_id: e.target.value })} disabled={saving}>
              <option value="">Seleccionar...</option>
              {estadosLicencia.map((estado: any) => (
                <option key={estado.id} value={estado.id}>{estado.descripcion}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Tipo Licencia</label>
            <select className="form-input" value={formData.licencia_tipo_id} onChange={(e) => setFormData({ ...formData, licencia_tipo_id: e.target.value })} disabled={saving}>
              <option value="">Seleccionar...</option>
              {tiposLicencia.map((tipo: any) => (
                <option key={tipo.id} value={tipo.id}>{tipo.descripcion}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="section-title">Información de Contacto</div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Teléfono Contacto</label>
            <input type="tel" className="form-input" value={formData.telefono_contacto} onChange={(e) => setFormData({ ...formData, telefono_contacto: e.target.value })} disabled={saving} />
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input type="email" className="form-input" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} disabled={saving} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Dirección</label>
            <input type="text" className="form-input" value={formData.direccion} onChange={(e) => setFormData({ ...formData, direccion: e.target.value })} disabled={saving} />
          </div>
        </div>

        <div className="section-title">Contacto de Emergencia</div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Nombre Contacto</label>
            <input type="text" className="form-input" value={formData.contacto_emergencia} onChange={(e) => setFormData({ ...formData, contacto_emergencia: e.target.value })} disabled={saving} />
          </div>
          <div className="form-group">
            <label className="form-label">Teléfono Emergencia</label>
            <input type="tel" className="form-input" value={formData.telefono_emergencia} onChange={(e) => setFormData({ ...formData, telefono_emergencia: e.target.value })} disabled={saving} />
          </div>
        </div>

        <div className="section-title">Información Adicional</div>

        <div className="form-row-3" style={{ marginBottom: '16px' }}>
          <div>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" className="form-checkbox" checked={formData.antecedentes_penales} onChange={(e) => setFormData({ ...formData, antecedentes_penales: e.target.checked })} disabled={saving} />
              <span style={{ fontSize: '14px', fontWeight: '500' }}>Antecedentes Penales</span>
            </label>
          </div>
          <div>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" className="form-checkbox" checked={formData.antecedentes_transito} onChange={(e) => setFormData({ ...formData, antecedentes_transito: e.target.checked })} disabled={saving} />
              <span style={{ fontSize: '14px', fontWeight: '500' }}>Antecedentes de Tránsito</span>
            </label>
          </div>
          <div>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" className="form-checkbox" checked={formData.cochera_propia} onChange={(e) => setFormData({ ...formData, cochera_propia: e.target.checked })} disabled={saving} />
              <span style={{ fontSize: '14px', fontWeight: '500' }}>Cochera Propia</span>
            </label>
          </div>
        </div>

        <div className="section-title">Información Laboral</div>

        <div className="form-row-3">
          <div className="form-group">
            <label className="form-label">Fecha Contratación</label>
            <input type="date" className="form-input" value={formData.fecha_contratacion} onChange={(e) => setFormData({ ...formData, fecha_contratacion: e.target.value })} disabled={saving} />
          </div>
          <div className="form-group">
            <label className="form-label">Fecha Reincorporación</label>
            <input type="date" className="form-input" value={formData.fecha_reincorpoaracion} onChange={(e) => setFormData({ ...formData, fecha_reincorpoaracion: e.target.value })} disabled={saving} />
          </div>
          <div className="form-group">
            <label className="form-label">Estado</label>
            <select className="form-input" value={formData.estado_id} onChange={(e) => setFormData({ ...formData, estado_id: e.target.value })} disabled={saving}>
              <option value="">Seleccionar...</option>
              {estadosConductor.map((estado: any) => (
                <option key={estado.id} value={estado.id}>{estado.descripcion}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
          <button className="btn-secondary" onClick={() => { setShowEditModal(false); setSelectedConductor(null); resetForm() }} disabled={saving}>Cancelar</button>
          <button className="btn-primary" onClick={handleUpdate} disabled={saving}>{saving ? 'Guardando...' : 'Guardar Cambios'}</button>
        </div>
      </div>
    </div>
  )
}

function ModalEliminar({ selectedConductor, saving, handleDelete, setShowDeleteModal, setSelectedConductor }: any) {
  return (
    <div className="modal-overlay" onClick={() => !saving && setShowDeleteModal(false)}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0, fontSize: '20px', fontWeight: '700', color: '#DC2626' }}>Eliminar Conductor</h2>
        <div className="delete-warning">
          <div className="delete-warning-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={20} /> Advertencia
          </div>
          <div className="delete-warning-text">
            Estás a punto de eliminar al conductor <strong>{selectedConductor.nombre_completo}</strong> (DNI: {selectedConductor.dni}). Esta acción es <strong>irreversible</strong>.
          </div>
        </div>
        <p style={{ color: '#6B7280', fontSize: '14px', marginBottom: '24px' }}>¿Estás seguro de que deseas continuar?</p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button className="btn-secondary" onClick={() => { setShowDeleteModal(false); setSelectedConductor(null) }} disabled={saving}>Cancelar</button>
          <button className="btn-primary" onClick={handleDelete} disabled={saving} style={{ background: '#DC2626' }}>{saving ? 'Eliminando...' : 'Sí, Eliminar'}</button>
        </div>
      </div>
    </div>
  )
}

function ModalDetalles({ selectedConductor, setShowDetailsModal, getEstadoBadgeClass: _getEstadoBadgeClass, getEstadoLabel: _getEstadoLabel }: any) {
  return (
    <div className="modal-overlay" onClick={() => setShowDetailsModal(false)}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0, fontSize: '20px', fontWeight: '700', marginBottom: '24px' }}>Detalles del Conductor</h2>

        <div className="section-title">Información Personal</div>
        <div className="details-grid">
          <div><label className="detail-label">NOMBRES</label><div className="detail-value">{selectedConductor.nombres}</div></div>
          <div><label className="detail-label">APELLIDOS</label><div className="detail-value">{selectedConductor.apellidos}</div></div>
          <div><label className="detail-label">NÚMERO DNI</label><div className="detail-value">{selectedConductor.numero_dni || 'N/A'}</div></div>
          <div><label className="detail-label">FECHA NACIMIENTO</label><div className="detail-value">{selectedConductor.fecha_nacimiento ? new Date(selectedConductor.fecha_nacimiento).toLocaleDateString('es-AR') : 'N/A'}</div></div>
          <div><label className="detail-label">NACIONALIDAD</label><div className="detail-value">{selectedConductor.nacionalidades?.descripcion || 'N/A'}</div></div>
          <div><label className="detail-label">ESTADO CIVIL</label><div className="detail-value">{selectedConductor.estados_civiles?.descripcion || 'N/A'}</div></div>
          <div><label className="detail-label">ZONA</label><div className="detail-value">{selectedConductor.zona || 'N/A'}</div></div>
        </div>

        <div className="section-title">Licencia de Conducir</div>
        <div className="details-grid">
          <div><label className="detail-label">NRO. LICENCIA</label><div className="detail-value">{selectedConductor.numero_licencia || 'N/A'}</div></div>
          <div><label className="detail-label">CATEGORÍA</label><div className="detail-value" style={{ background: '#DBEAFE', color: '#1E40AF', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: '600', display: 'inline-block' }}>{selectedConductor.licencias_categorias?.descripcion || 'N/A'}</div></div>
          <div><label className="detail-label">VENCIMIENTO</label><div className="detail-value">{new Date(selectedConductor.licencia_vencimiento).toLocaleDateString('es-AR')}</div></div>
          <div><label className="detail-label">ESTADO</label><div className="detail-value">{selectedConductor.licencias_estados?.descripcion || 'N/A'}</div></div>
        </div>

        <div className="section-title">Contacto</div>
        <div className="details-grid">
          <div><label className="detail-label">TELÉFONO CONTACTO</label><div className="detail-value">{selectedConductor.telefono_contacto || 'N/A'}</div></div>
          <div><label className="detail-label">EMAIL</label><div className="detail-value">{selectedConductor.email || 'N/A'}</div></div>
          <div style={{ gridColumn: '1 / -1' }}><label className="detail-label">DIRECCIÓN</label><div className="detail-value">{selectedConductor.direccion || 'N/A'}</div></div>
        </div>

        <div className="section-title">Estado</div>
        <div>
          <span className={`badge`} style={{
            backgroundColor: '#3B82F6',
            color: 'white',
            padding: '4px 12px',
            borderRadius: '12px',
            fontSize: '12px',
            fontWeight: '600'
          }}>
            {selectedConductor.conductores_estados?.descripcion || 'N/A'}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
          <button className="btn-secondary" onClick={() => setShowDetailsModal(false)}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}
