import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Swal from 'sweetalert2'
import { showSuccess } from '../../utils/toast'
import {
  Plus,
  Edit2,
  Trash2,
  X,
  DollarSign,
  Check,
  Loader2,
  Package,
  FileText,
  Filter
} from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../../components/ui/DataTable'
import type {
  ConceptoNomina,
  ConceptoNominaFormData,
  ConceptosNominaStats
} from '../../types/nominas.types'
import {
  TIPOS_CONCEPTO,
  getTipoColor,
  getTipoLabel
} from '../../types/nominas.types'

const INITIAL_FORM_DATA: ConceptoNominaFormData = {
  codigo: '',
  descripcion: '',
  precio_base: 0,
  iva_porcentaje: 0,
  precio_final: 0,
  tipo: 'cargo',
  es_variable: false,
  aplica_turno: true,
  aplica_cargo: true,
  activo: true,
  orden: 0
}

export function ConceptosTab() {
  const { profile } = useAuth()

  // Data states
  const [conceptos, setConceptos] = useState<ConceptoNomina[]>([])
  const [stats, setStats] = useState<ConceptosNominaStats | null>(null)
  const [loading, setLoading] = useState(true)

  // Modal states
  const [showModal, setShowModal] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
  const [selectedConcepto, setSelectedConcepto] = useState<ConceptoNomina | null>(null)
  const [formData, setFormData] = useState<ConceptoNominaFormData>(INITIAL_FORM_DATA)
  const [saving, setSaving] = useState(false)

  // Column filter states - Multiselect tipo Excel
  const [codigoFilter, setCodigoFilter] = useState<string[]>([])
  const [codigoSearch, setCodigoSearch] = useState('')
  const [tipoFilter, setTipoFilter] = useState<string[]>([])
  const [openColumnFilter, setOpenColumnFilter] = useState<string | null>(null)

  // Load data on mount
  useEffect(() => {
    cargarDatos()
  }, [])

  // Calculate precio_final when precio_base or iva changes
  useEffect(() => {
    const precioFinal = formData.precio_base * (1 + formData.iva_porcentaje / 100)
    setFormData(prev => ({ ...prev, precio_final: Number(precioFinal.toFixed(2)) }))
  }, [formData.precio_base, formData.iva_porcentaje])

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
  const codigosUnicos = useMemo(() => {
    const codigos = conceptos.map(c => c.codigo).filter(Boolean)
    return [...new Set(codigos)].sort()
  }, [conceptos])

  const codigosFiltrados = useMemo(() => {
    if (!codigoSearch) return codigosUnicos
    return codigosUnicos.filter(c => c.toLowerCase().includes(codigoSearch.toLowerCase()))
  }, [codigosUnicos, codigoSearch])

  // Toggle functions para multiselect
  const toggleCodigoFilter = (codigo: string) => {
    setCodigoFilter(prev =>
      prev.includes(codigo) ? prev.filter(c => c !== codigo) : [...prev, codigo]
    )
  }

  const toggleTipoFilter = (tipo: string) => {
    setTipoFilter(prev =>
      prev.includes(tipo) ? prev.filter(t => t !== tipo) : [...prev, tipo]
    )
  }

  // Filtrar conceptos según los filtros de columna
  const filteredConceptos = useMemo(() => {
    let result = conceptos

    if (codigoFilter.length > 0) {
      result = result.filter(c => codigoFilter.includes(c.codigo))
    }

    if (tipoFilter.length > 0) {
      result = result.filter(c => tipoFilter.includes(c.tipo))
    }

    return result
  }, [conceptos, codigoFilter, tipoFilter])

  async function cargarDatos() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('conceptos_nomina')
        .select('*')
        .order('orden', { ascending: true })

      if (error) throw error

      setConceptos(data || [])
      calcularStats(data || [])
    } catch (error) {
      console.error('Error cargando conceptos:', error)
      Swal.fire('Error', 'No se pudieron cargar los conceptos', 'error')
    } finally {
      setLoading(false)
    }
  }

  function calcularStats(data: ConceptoNomina[]) {
    const stats: ConceptosNominaStats = {
      total: data.length,
      activos: data.filter(c => c.activo).length,
      inactivos: data.filter(c => !c.activo).length,
      porTipo: {
        alquiler: data.filter(c => c.tipo === 'alquiler').length,
        cargo: data.filter(c => c.tipo === 'cargo').length,
        descuento: data.filter(c => c.tipo === 'descuento').length,
        penalidad: data.filter(c => c.tipo === 'penalidad').length,
        ingreso: data.filter(c => c.tipo === 'ingreso').length
      }
    }
    setStats(stats)
  }

  // Open modal for create
  function handleCreate() {
    setFormData(INITIAL_FORM_DATA)
    setSelectedConcepto(null)
    setModalMode('create')
    setShowModal(true)
  }

  // Open modal for edit
  function handleEdit(concepto: ConceptoNomina) {
    setFormData({
      codigo: concepto.codigo,
      descripcion: concepto.descripcion,
      precio_base: concepto.precio_base,
      iva_porcentaje: concepto.iva_porcentaje,
      precio_final: concepto.precio_final,
      tipo: concepto.tipo,
      es_variable: concepto.es_variable,
      aplica_turno: concepto.aplica_turno,
      aplica_cargo: concepto.aplica_cargo,
      activo: concepto.activo,
      orden: concepto.orden
    })
    setSelectedConcepto(concepto)
    setModalMode('edit')
    setShowModal(true)
  }

  // Handle delete
  async function handleDelete(concepto: ConceptoNomina) {
    const result = await Swal.fire({
      title: 'Eliminar concepto',
      text: `¿Está seguro de eliminar "${concepto.descripcion}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ff0033',
      cancelButtonColor: '#6B7280',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    })

    if (result.isConfirmed) {
      try {
        const { error } = await supabase
          .from('conceptos_nomina')
          .delete()
          .eq('id', concepto.id)

        if (error) throw error

        showSuccess('Eliminado')
        cargarDatos()
      } catch (error) {
        Swal.fire('Error', 'No se pudo eliminar el concepto', 'error')
      }
    }
  }

  // Handle save (create/update)
  async function handleGuardar() {
    if (!formData.codigo.trim()) {
      Swal.fire('Error', 'El código es requerido', 'error')
      return
    }
    if (!formData.descripcion.trim()) {
      Swal.fire('Error', 'La descripción es requerida', 'error')
      return
    }

    setSaving(true)
    try {
      const dataToSave = {
        ...formData,
        codigo: formData.codigo.toUpperCase().trim(),
        descripcion: formData.descripcion.trim()
      }

      if (modalMode === 'create') {
        const { error } = await (supabase
          .from('conceptos_nomina') as any)
          .insert({ ...dataToSave, created_by_name: profile?.full_name || 'Sistema' })

        if (error) {
          if (error.code === '23505') {
            throw new Error('Ya existe un concepto con ese código')
          }
          throw error
        }

        showSuccess('Creado')
      } else if (modalMode === 'edit' && selectedConcepto) {
        const { error } = await (supabase
          .from('conceptos_nomina') as any)
          .update({ ...dataToSave, updated_by: profile?.full_name || 'Sistema' })
          .eq('id', selectedConcepto.id)

        if (error) throw error

        showSuccess('Actualizado')
      }

      setShowModal(false)
      cargarDatos()
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo guardar el concepto', 'error')
    } finally {
      setSaving(false)
    }
  }

  // Format currency
  function formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 2
    }).format(value)
  }

  // Define columns for DataTable
  const columns = useMemo<ColumnDef<ConceptoNomina>[]>(() => [
    {
      accessorKey: 'codigo',
      header: () => (
        <div className="dt-column-filter">
          <span>Código {codigoFilter.length > 0 && `(${codigoFilter.length})`}</span>
          <button
            className={`dt-column-filter-btn ${codigoFilter.length > 0 ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              setOpenColumnFilter(openColumnFilter === 'codigo' ? null : 'codigo')
            }}
            title="Filtrar por código"
          >
            <Filter size={12} />
          </button>
          {openColumnFilter === 'codigo' && (
            <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                placeholder="Buscar..."
                value={codigoSearch}
                onChange={(e) => setCodigoSearch(e.target.value)}
                className="dt-column-filter-input"
                autoFocus
              />
              <div className="dt-excel-filter-list">
                {codigosFiltrados.length === 0 ? (
                  <div className="dt-excel-filter-empty">Sin resultados</div>
                ) : (
                  codigosFiltrados.slice(0, 50).map(codigo => (
                    <label key={codigo} className={`dt-column-filter-checkbox ${codigoFilter.includes(codigo) ? 'selected' : ''}`}>
                      <input
                        type="checkbox"
                        checked={codigoFilter.includes(codigo)}
                        onChange={() => toggleCodigoFilter(codigo)}
                      />
                      <span>{codigo}</span>
                    </label>
                  ))
                )}
              </div>
              {codigoFilter.length > 0 && (
                <button
                  className="dt-column-filter-clear"
                  onClick={() => { setCodigoFilter([]); setCodigoSearch('') }}
                >
                  Limpiar ({codigoFilter.length})
                </button>
              )}
            </div>
          )}
        </div>
      ),
      cell: ({ row }) => (
        <span className="nom-codigo">{row.original.codigo}</span>
      )
    },
    {
      accessorKey: 'descripcion',
      header: 'Descripción',
      cell: ({ row }) => row.original.descripcion
    },
    {
      accessorKey: 'tipo',
      header: () => (
        <div className="dt-column-filter">
          <span>Tipo {tipoFilter.length > 0 && `(${tipoFilter.length})`}</span>
          <button
            className={`dt-column-filter-btn ${tipoFilter.length > 0 ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              setOpenColumnFilter(openColumnFilter === 'tipo' ? null : 'tipo')
            }}
            title="Filtrar por tipo"
          >
            <Filter size={12} />
          </button>
          {openColumnFilter === 'tipo' && (
            <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
              <div className="dt-excel-filter-list">
                {TIPOS_CONCEPTO.map(tipo => (
                  <label key={tipo.value} className={`dt-column-filter-checkbox ${tipoFilter.includes(tipo.value) ? 'selected' : ''}`}>
                    <input
                      type="checkbox"
                      checked={tipoFilter.includes(tipo.value)}
                      onChange={() => toggleTipoFilter(tipo.value)}
                    />
                    <span>{tipo.label}</span>
                  </label>
                ))}
              </div>
              {tipoFilter.length > 0 && (
                <button
                  className="dt-column-filter-clear"
                  onClick={() => setTipoFilter([])}
                >
                  Limpiar ({tipoFilter.length})
                </button>
              )}
            </div>
          )}
        </div>
      ),
      cell: ({ row }) => (
        <span
          className="dt-badge"
          style={{
            background: `${getTipoColor(row.original.tipo)}20`,
            color: getTipoColor(row.original.tipo)
          }}
        >
          {getTipoLabel(row.original.tipo)}
        </span>
      )
    },
    {
      accessorKey: 'precio_base',
      header: 'Precio Base',
      cell: ({ row }) => (
        <span className="nom-precio">{formatCurrency(row.original.precio_base)}</span>
      )
    },
    {
      accessorKey: 'iva_porcentaje',
      header: 'IVA %',
      cell: ({ row }) => `${row.original.iva_porcentaje}%`
    },
    {
      accessorKey: 'precio_final',
      header: 'Precio Final',
      cell: ({ row }) => (
        <span className="nom-precio">{formatCurrency(row.original.precio_final)}</span>
      )
    },
    {
      accessorKey: 'es_variable',
      header: 'Variable',
      cell: ({ row }) => (
        <span className={`nom-bool-badge ${row.original.es_variable ? 'yes' : 'no'}`}>
          {row.original.es_variable ? <Check size={14} /> : '-'}
        </span>
      )
    },
    {
      accessorKey: 'aplica_turno',
      header: 'Turno',
      cell: ({ row }) => (
        <span className={`nom-bool-badge ${row.original.aplica_turno ? 'yes' : 'no'}`}>
          {row.original.aplica_turno ? <Check size={14} /> : '-'}
        </span>
      )
    },
    {
      accessorKey: 'aplica_cargo',
      header: 'Cargo',
      cell: ({ row }) => (
        <span className={`nom-bool-badge ${row.original.aplica_cargo ? 'yes' : 'no'}`}>
          {row.original.aplica_cargo ? <Check size={14} /> : '-'}
        </span>
      )
    },
    {
      accessorKey: 'activo',
      header: 'Estado',
      cell: ({ row }) => (
        <span className={`dt-badge ${row.original.activo ? 'dt-badge-solid-green' : 'dt-badge-solid-gray'}`}>
          {row.original.activo ? 'Activo' : 'Inactivo'}
        </span>
      )
    },
    {
      id: 'acciones',
      header: 'Acciones',
      cell: ({ row }) => (
        <div className="dt-actions">
          <button
            className="dt-btn-action dt-btn-edit"
            onClick={(e) => { e.stopPropagation(); handleEdit(row.original) }}
            title="Editar"
          >
            <Edit2 size={14} />
          </button>
          <button
            className="dt-btn-action dt-btn-delete"
            onClick={(e) => { e.stopPropagation(); handleDelete(row.original) }}
            title="Eliminar"
          >
            <Trash2 size={14} />
          </button>
        </div>
      )
    }
  ], [openColumnFilter, codigoFilter, codigoSearch, codigosFiltrados, tipoFilter])

  return (
    <>
      {/* Stats */}
      <div className="nom-stats">
        <div className="nom-stats-grid">
          <button className={`stat-card${tipoFilter.length === 0 ? ' active' : ''}`} onClick={() => setTipoFilter([])}>
            <Package size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats?.total || 0}</span>
              <span className="stat-label">Total</span>
            </div>
          </button>
          <button className="stat-card" onClick={() => setTipoFilter([])}>
            <Check size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats?.activos || 0}</span>
              <span className="stat-label">Activos</span>
            </div>
          </button>
          <button className={`stat-card${tipoFilter.length === 1 && tipoFilter[0] === 'alquiler' ? ' active' : ''}`} onClick={() => setTipoFilter(['alquiler'])}>
            <DollarSign size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats?.porTipo.alquiler || 0}</span>
              <span className="stat-label">Alquiler</span>
            </div>
          </button>
          <button className={`stat-card${tipoFilter.length === 1 && tipoFilter[0] === 'cargo' ? ' active' : ''}`} onClick={() => setTipoFilter(['cargo'])}>
            <FileText size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats?.porTipo.cargo || 0}</span>
              <span className="stat-label">Cargos</span>
            </div>
          </button>
          <button className={`stat-card${tipoFilter.length === 1 && tipoFilter[0] === 'descuento' ? ' active' : ''}`} onClick={() => setTipoFilter(['descuento'])}>
            <DollarSign size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats?.porTipo.descuento || 0}</span>
              <span className="stat-label">Descuentos</span>
            </div>
          </button>
        </div>
      </div>

      {/* DataTable */}
      <DataTable
        data={filteredConceptos}
        columns={columns}
        loading={loading}
        searchPlaceholder="Buscar por código, descripción..."
        emptyIcon={<Package size={48} />}
        emptyTitle="No hay conceptos"
        emptyDescription="Agregue un nuevo concepto de nómina"
        pageSize={100}
        pageSizeOptions={[10, 20, 50, 100]}
        headerAction={
          <button className="nom-btn-primary" onClick={handleCreate}>
            <Plus size={16} />
            Nuevo Concepto
          </button>
        }
      />

      {/* Modal */}
      {showModal && (
        <div className="nom-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="nom-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="nom-modal-header">
              <h2>{modalMode === 'create' ? 'Nuevo Concepto' : 'Editar Concepto'}</h2>
              <button className="nom-modal-close" onClick={() => setShowModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="nom-modal-body">
              <div className="nom-form-section">
                <div className="nom-form-section-title">Información General</div>
                <div className="nom-form-row">
                  <div className="nom-form-group">
                    <label>Código <span className="required">*</span></label>
                    <input
                      type="text"
                      value={formData.codigo}
                      onChange={(e) => setFormData(prev => ({ ...prev, codigo: e.target.value.toUpperCase() }))}
                      placeholder="Ej: P001"
                      maxLength={10}
                    />
                  </div>
                  <div className="nom-form-group">
                    <label>Tipo <span className="required">*</span></label>
                    <select
                      value={formData.tipo}
                      onChange={(e) => setFormData(prev => ({ ...prev, tipo: e.target.value }))}
                    >
                      {TIPOS_CONCEPTO.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="nom-form-row">
                  <div className="nom-form-group full-width">
                    <label>Descripción <span className="required">*</span></label>
                    <input
                      type="text"
                      value={formData.descripcion}
                      onChange={(e) => setFormData(prev => ({ ...prev, descripcion: e.target.value }))}
                      placeholder="Descripción del concepto"
                    />
                  </div>
                </div>
              </div>

              <div className="nom-form-section">
                <div className="nom-form-section-title">Precios</div>
                <div className="nom-form-row three-cols">
                  <div className="nom-form-group">
                    <label>Precio Base</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.precio_base}
                      onChange={(e) => setFormData(prev => ({ ...prev, precio_base: Number(e.target.value) }))}
                    />
                  </div>
                  <div className="nom-form-group">
                    <label>IVA %</label>
                    <select
                      value={formData.iva_porcentaje}
                      onChange={(e) => setFormData(prev => ({ ...prev, iva_porcentaje: Number(e.target.value) }))}
                    >
                      <option value={0}>0%</option>
                      <option value={10.5}>10.5%</option>
                      <option value={21}>21%</option>
                      <option value={27}>27%</option>
                    </select>
                  </div>
                  <div className="nom-form-group">
                    <label>Precio Final</label>
                    <div className="nom-iva-calculated">
                      <span className="value">{formatCurrency(formData.precio_final)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="nom-form-section">
                <div className="nom-form-section-title">Configuración</div>
                <div className="nom-form-row">
                  <div className="nom-form-group">
                    <label>Orden</label>
                    <input
                      type="number"
                      min="0"
                      value={formData.orden}
                      onChange={(e) => setFormData(prev => ({ ...prev, orden: Number(e.target.value) }))}
                    />
                  </div>
                  <div className="nom-form-group">
                    <label>&nbsp;</label>
                    <div className="nom-checkbox-inline">
                      <input
                        type="checkbox"
                        id="activo"
                        checked={formData.activo}
                        onChange={(e) => setFormData(prev => ({ ...prev, activo: e.target.checked }))}
                      />
                      <span>Activo</span>
                    </div>
                  </div>
                </div>

                <div className="nom-form-row three-cols">
                  <div className="nom-form-group">
                    <div className="nom-checkbox-inline">
                      <input
                        type="checkbox"
                        id="es_variable"
                        checked={formData.es_variable}
                        onChange={(e) => setFormData(prev => ({ ...prev, es_variable: e.target.checked }))}
                      />
                      <span>Es Variable</span>
                    </div>
                  </div>
                  <div className="nom-form-group">
                    <div className="nom-checkbox-inline">
                      <input
                        type="checkbox"
                        id="aplica_turno"
                        checked={formData.aplica_turno}
                        onChange={(e) => setFormData(prev => ({ ...prev, aplica_turno: e.target.checked }))}
                      />
                      <span>Aplica Turno</span>
                    </div>
                  </div>
                  <div className="nom-form-group">
                    <div className="nom-checkbox-inline">
                      <input
                        type="checkbox"
                        id="aplica_cargo"
                        checked={formData.aplica_cargo}
                        onChange={(e) => setFormData(prev => ({ ...prev, aplica_cargo: e.target.checked }))}
                      />
                      <span>Aplica Cargo</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="nom-modal-footer">
              <button
                className="nom-btn-secondary"
                onClick={() => setShowModal(false)}
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                className="nom-btn-primary"
                onClick={handleGuardar}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <Loader2 size={16} className="spinning" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    Guardar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
