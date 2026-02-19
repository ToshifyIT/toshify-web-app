// src/components/admin/ZonasManagement.tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { AlertTriangle, Edit2, Trash2, Plus, MapPin, Shield, Ban, Eye, Settings } from 'lucide-react'
import { GoogleMap, useJsApiLoader, Polygon, DrawingManager } from '@react-google-maps/api'
import { supabase } from '../../lib/supabase'
import { LoadingOverlay, Spinner } from '../ui/LoadingOverlay'
import { DataTable } from '../ui/DataTable/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import Swal from 'sweetalert2'
import { showSuccess } from '../../utils/toast'
import { ZonaTiposManager } from './ZonaTiposManager'
import { useAuth } from '../../contexts/AuthContext'
import './AdminStyles.css'

// Google Maps API Key
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || 'AIzaSyCCiqk9jWZghUq5rBtSyo6ZjLuMORblY-w'

// Libraries for Google Maps
const libraries: ("places" | "drawing")[] = ['places', 'drawing']

// Default center: Buenos Aires, Argentina
const DEFAULT_CENTER = {
  lat: -34.6037,
  lng: -58.3816
}

// Map container styles
const mapContainerStyle = {
  width: '100%',
  height: '300px',
  borderRadius: '8px',
  border: '1px solid var(--border-primary)'
}

const modalMapContainerStyle = {
  width: '100%',
  height: '350px',
  borderRadius: '8px',
  border: '1px solid var(--border-primary)'
}

// Types
interface ZonaTipo {
  id: string
  codigo: string
  nombre: string
  color: string
  descripcion: string | null
  activo: boolean
  created_at: string
}

interface ZonaPeligrosa {
  id: string
  nombre: string
  descripcion: string | null
  tipo_id: string
  poligono: { lat: number; lng: number }[]
  bloquear_asignaciones: boolean
  mostrar_advertencia: boolean
  mensaje_advertencia: string
  activo: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  zonas_tipos?: ZonaTipo
}

interface FormData {
  nombre: string
  descripcion: string
  tipo_id: string
  poligono: { lat: number; lng: number }[]
  bloquear_asignaciones: boolean
  mostrar_advertencia: boolean
  mensaje_advertencia: string
}

const initialFormData: FormData = {
  nombre: '',
  descripcion: '',
  tipo_id: '',
  poligono: [],
  bloquear_asignaciones: false,
  mostrar_advertencia: true,
  mensaje_advertencia: 'Esta zona ha sido marcada como peligrosa'
}

export function ZonasManagement() {
  const { profile } = useAuth()
  const [zonas, setZonas] = useState<ZonaPeligrosa[]>([])
  const [tipos, setTipos] = useState<ZonaTipo[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showTiposModal, setShowTiposModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [selectedZona, setSelectedZona] = useState<ZonaPeligrosa | null>(null)
  const [creating, setCreating] = useState(false)
  const [formData, setFormData] = useState<FormData>(initialFormData)

  // Filters
  const [filterTipo, setFilterTipo] = useState<string>('')
  const [filterEstado, setFilterEstado] = useState<string>('')

  // Google Maps loader
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries,
    language: 'es',
    region: 'AR'
  })

  const loadZonas = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from('zonas_peligrosas')
      .select(`
        *,
        zonas_tipos (*)
      `)
      .order('created_at', { ascending: false })

    if (error) throw error
    setZonas(data || [])
  }, [])

  const loadTipos = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from('zonas_tipos')
      .select('*')
      .eq('activo', true)
      .order('nombre')

    if (error) throw error
    setTipos(data || [])
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      await Promise.all([loadZonas(), loadTipos()])
    } catch (err) {
      console.error('Error cargando datos:', err)
    } finally {
      setLoading(false)
    }
  }, [loadZonas, loadTipos])

  // Load data on mount
  useEffect(() => {
    loadData()
  }, [loadData])

  // Statistics
  const stats = useMemo(() => {
    const total = zonas.length
    const activas = zonas.filter(z => z.activo).length
    const bloqueo = zonas.filter(z => z.bloquear_asignaciones && z.activo).length
    const advertencia = zonas.filter(z => z.mostrar_advertencia && z.activo).length
    return { total, activas, bloqueo, advertencia }
  }, [zonas])

  // Filtered zones for display
  const filteredZonas = useMemo(() => {
    return zonas.filter(zona => {
      if (filterTipo && zona.tipo_id !== filterTipo) return false
      if (filterEstado === 'activo' && !zona.activo) return false
      if (filterEstado === 'inactivo' && zona.activo) return false
      return true
    })
  }, [zonas, filterTipo, filterEstado])

  // Calculate map center from all zones
  const mapCenter = useMemo(() => {
    const activeZones = zonas.filter(z => z.activo && z.poligono?.length > 0)
    if (activeZones.length === 0) return DEFAULT_CENTER

    let totalLat = 0
    let totalLng = 0
    let count = 0

    activeZones.forEach(zona => {
      zona.poligono.forEach(point => {
        totalLat += point.lat
        totalLng += point.lng
        count++
      })
    })

    if (count === 0) return DEFAULT_CENTER
    return { lat: totalLat / count, lng: totalLng / count }
  }, [zonas])

  // Handle polygon complete
  const onPolygonComplete = useCallback((polygon: google.maps.Polygon) => {
    const path = polygon.getPath()
    const coordinates: { lat: number; lng: number }[] = []

    for (let i = 0; i < path.getLength(); i++) {
      const point = path.getAt(i)
      coordinates.push({ lat: point.lat(), lng: point.lng() })
    }

    setFormData(prev => ({ ...prev, poligono: coordinates }))
    polygon.setMap(null) // Remove the drawing, we'll render our own
  }, [])

  // Clear polygon
  const clearPolygon = () => {
    setFormData(prev => ({ ...prev, poligono: [] }))
  }

  // CRUD handlers
  const handleCreate = async () => {
    if (!formData.nombre.trim()) {
      Swal.fire({ icon: 'error', title: 'Error', text: 'El nombre es requerido' })
      return
    }
    if (!formData.tipo_id) {
      Swal.fire({ icon: 'error', title: 'Error', text: 'Selecciona un tipo de zona' })
      return
    }
    if (formData.poligono.length < 3) {
      Swal.fire({ icon: 'error', title: 'Error', text: 'Dibuja un poligono con al menos 3 puntos' })
      return
    }
    if (formData.mostrar_advertencia && !formData.mensaje_advertencia.trim()) {
      Swal.fire({ icon: 'error', title: 'Error', text: 'El mensaje de advertencia es requerido' })
      return
    }

    setCreating(true)
    try {
      const { error } = await (supabase as any)
        .from('zonas_peligrosas')
        .insert([{
          nombre: formData.nombre.trim(),
          descripcion: formData.descripcion.trim() || null,
          tipo_id: formData.tipo_id,
          poligono: formData.poligono,
          bloquear_asignaciones: formData.bloquear_asignaciones,
          mostrar_advertencia: formData.mostrar_advertencia,
          mensaje_advertencia: formData.mensaje_advertencia.trim(),
          created_by: profile?.id || null
        }])

      if (error) throw error

      showSuccess('Zona Creada', 'La zona peligrosa se ha creado exitosamente')
      setShowCreateModal(false)
      setFormData(initialFormData)
      await loadZonas()
    } catch (err: any) {
      console.error('Error creando zona:', err)
      Swal.fire({ icon: 'error', title: 'Error', text: err.message })
    } finally {
      setCreating(false)
    }
  }

  const handleEdit = async () => {
    if (!selectedZona) return

    if (!formData.nombre.trim()) {
      Swal.fire({ icon: 'error', title: 'Error', text: 'El nombre es requerido' })
      return
    }
    if (!formData.tipo_id) {
      Swal.fire({ icon: 'error', title: 'Error', text: 'Selecciona un tipo de zona' })
      return
    }
    if (formData.poligono.length < 3) {
      Swal.fire({ icon: 'error', title: 'Error', text: 'El poligono debe tener al menos 3 puntos' })
      return
    }
    if (formData.mostrar_advertencia && !formData.mensaje_advertencia.trim()) {
      Swal.fire({ icon: 'error', title: 'Error', text: 'El mensaje de advertencia es requerido' })
      return
    }

    setCreating(true)
    try {
      const { error } = await (supabase as any)
        .from('zonas_peligrosas')
        .update({
          nombre: formData.nombre.trim(),
          descripcion: formData.descripcion.trim() || null,
          tipo_id: formData.tipo_id,
          poligono: formData.poligono,
          bloquear_asignaciones: formData.bloquear_asignaciones,
          mostrar_advertencia: formData.mostrar_advertencia,
          mensaje_advertencia: formData.mensaje_advertencia.trim(),
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedZona.id)

      if (error) throw error

      showSuccess('Zona Actualizada', 'La zona se ha actualizado exitosamente')
      setShowEditModal(false)
      setSelectedZona(null)
      setFormData(initialFormData)
      await loadZonas()
    } catch (err: any) {
      console.error('Error actualizando zona:', err)
      Swal.fire({ icon: 'error', title: 'Error', text: err.message })
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedZona) return

    setCreating(true)
    try {
      const { error } = await (supabase as any)
        .from('zonas_peligrosas')
        .delete()
        .eq('id', selectedZona.id)

      if (error) throw error

      showSuccess('Zona Eliminada', 'La zona se ha eliminado exitosamente')
      setShowDeleteModal(false)
      setSelectedZona(null)
      await loadZonas()
    } catch (err: any) {
      console.error('Error eliminando zona:', err)
      Swal.fire({ icon: 'error', title: 'Error', text: err.message })
    } finally {
      setCreating(false)
    }
  }

  const handleToggleActivo = async (zona: ZonaPeligrosa) => {
    try {
      const { error } = await (supabase as any)
        .from('zonas_peligrosas')
        .update({
          activo: !zona.activo,
          updated_at: new Date().toISOString()
        })
        .eq('id', zona.id)

      if (error) throw error

      showSuccess(
        zona.activo ? 'Zona Desactivada' : 'Zona Activada',
        `La zona "${zona.nombre}" ha sido ${zona.activo ? 'desactivada' : 'activada'}`
      )
      await loadZonas()
    } catch (err: any) {
      console.error('Error cambiando estado:', err)
      Swal.fire({ icon: 'error', title: 'Error', text: err.message })
    }
  }

  // Open modals
  const openEditModal = (zona: ZonaPeligrosa) => {
    setSelectedZona(zona)
    setFormData({
      nombre: zona.nombre,
      descripcion: zona.descripcion || '',
      tipo_id: zona.tipo_id,
      poligono: zona.poligono || [],
      bloquear_asignaciones: zona.bloquear_asignaciones,
      mostrar_advertencia: zona.mostrar_advertencia,
      mensaje_advertencia: zona.mensaje_advertencia || ''
    })
    setShowEditModal(true)
  }

  const openDeleteModal = (zona: ZonaPeligrosa) => {
    setSelectedZona(zona)
    setShowDeleteModal(true)
  }

  const openCreateModal = () => {
    setFormData(initialFormData)
    setShowCreateModal(true)
  }

  // Get color for zona type
  const getZonaColor = (zona: ZonaPeligrosa): string => {
    return zona.zonas_tipos?.color || '#EF4444'
  }

  // Table columns
  const columns: ColumnDef<ZonaPeligrosa>[] = useMemo(() => [
    {
      accessorKey: 'nombre',
      header: 'Nombre',
      cell: ({ row }) => (
        <div className="zona-nombre-cell">
          <div
            className="zona-color-indicator"
            style={{ backgroundColor: getZonaColor(row.original) }}
          />
          <span className="zona-nombre-text">{row.original.nombre}</span>
        </div>
      )
    },
    {
      accessorKey: 'tipo',
      header: 'Tipo',
      accessorFn: (row) => row.zonas_tipos?.nombre || 'Sin tipo',
      cell: ({ row }) => (
        <span
          className="dt-badge"
          style={{
            backgroundColor: `${getZonaColor(row.original)}20`,
            color: getZonaColor(row.original)
          }}
        >
          {row.original.zonas_tipos?.nombre || 'Sin tipo'}
        </span>
      )
    },
    {
      accessorKey: 'bloquear_asignaciones',
      header: 'Bloquea',
      cell: ({ row }) => (
        <span className={`dt-badge ${row.original.bloquear_asignaciones ? 'dt-badge-red' : 'dt-badge-gray'}`}>
          {row.original.bloquear_asignaciones ? 'Si' : 'No'}
        </span>
      )
    },
    {
      accessorKey: 'mostrar_advertencia',
      header: 'Advertencia',
      cell: ({ row }) => (
        <span className={`dt-badge ${row.original.mostrar_advertencia ? 'dt-badge-yellow' : 'dt-badge-gray'}`}>
          {row.original.mostrar_advertencia ? 'Si' : 'No'}
        </span>
      )
    },
    {
      accessorKey: 'activo',
      header: 'Estado',
      cell: ({ row }) => (
        <span className={`dt-badge ${row.original.activo ? 'dt-badge-green' : 'dt-badge-gray'}`}>
          {row.original.activo ? 'Activa' : 'Inactiva'}
        </span>
      )
    },
    {
      id: 'acciones',
      header: 'Acciones',
      cell: ({ row }) => (
        <div className="zona-actions">
          <button
            className="btn-icon btn-edit"
            onClick={() => openEditModal(row.original)}
            title="Editar zona"
          >
            <Edit2 size={14} />
          </button>
          <button
            className="btn-icon"
            onClick={() => handleToggleActivo(row.original)}
            title={row.original.activo ? 'Desactivar' : 'Activar'}
            style={{
              borderColor: row.original.activo ? 'var(--color-warning)' : 'var(--color-success)',
              color: row.original.activo ? 'var(--color-warning)' : 'var(--color-success)'
            }}
          >
            {row.original.activo ? <Ban size={14} /> : <Eye size={14} />}
          </button>
          <button
            className="btn-icon btn-delete"
            onClick={() => openDeleteModal(row.original)}
            title="Eliminar zona"
          >
            <Trash2 size={14} />
          </button>
        </div>
      )
    }
  ], [])

  // Render map with all zones
  const renderGeneralMap = () => {
    if (!isLoaded) {
      return (
        <div className="zona-map-loading">
          <Spinner size="md" />
          <span>Cargando mapa...</span>
        </div>
      )
    }

    const activeZones = zonas.filter(z => z.activo && z.poligono?.length > 0)

    return (
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={mapCenter}
        zoom={12}
        options={{
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: true,
          zoomControl: true
        }}
      >
        {activeZones.map(zona => (
          <Polygon
            key={zona.id}
            paths={zona.poligono}
            options={{
              fillColor: getZonaColor(zona),
              fillOpacity: 0.35,
              strokeColor: getZonaColor(zona),
              strokeOpacity: 0.8,
              strokeWeight: 2
            }}
          />
        ))}
      </GoogleMap>
    )
  }

  // Render modal map with drawing
  const renderModalMap = () => {
    if (!isLoaded) {
      return (
        <div className="zona-map-loading">
          <Spinner size="md" />
          <span>Cargando mapa...</span>
        </div>
      )
    }

    const selectedTipo = tipos.find(t => t.id === formData.tipo_id)
    const polygonColor = selectedTipo?.color || '#EF4444'

    return (
      <div className="zona-modal-map-container">
        <GoogleMap
          mapContainerStyle={modalMapContainerStyle}
          center={formData.poligono.length > 0 ? formData.poligono[0] : DEFAULT_CENTER}
          zoom={formData.poligono.length > 0 ? 14 : 12}
          options={{
            streetViewControl: false,
            mapTypeControl: false,
            fullscreenControl: false,
            zoomControl: true
          }}
        >
          {formData.poligono.length === 0 && (
            <DrawingManager
              onPolygonComplete={onPolygonComplete}
              options={{
                drawingControl: true,
                drawingControlOptions: {
                  position: google.maps.ControlPosition.TOP_CENTER,
                  drawingModes: [google.maps.drawing.OverlayType.POLYGON]
                },
                polygonOptions: {
                  fillColor: polygonColor,
                  fillOpacity: 0.35,
                  strokeColor: polygonColor,
                  strokeWeight: 2,
                  editable: true
                }
              }}
            />
          )}
          {formData.poligono.length > 0 && (
            <Polygon
              paths={formData.poligono}
              options={{
                fillColor: polygonColor,
                fillOpacity: 0.35,
                strokeColor: polygonColor,
                strokeOpacity: 0.8,
                strokeWeight: 2,
                editable: true
              }}
              onMouseUp={(e) => {
                // Update polygon when edited
                if (e.latLng) {
                  const polygon = e as any
                  if (polygon.path) {
                    const path = polygon.path
                    const coordinates: { lat: number; lng: number }[] = []
                    for (let i = 0; i < path.getLength(); i++) {
                      const point = path.getAt(i)
                      coordinates.push({ lat: point.lat(), lng: point.lng() })
                    }
                    setFormData(prev => ({ ...prev, poligono: coordinates }))
                  }
                }
              }}
            />
          )}
        </GoogleMap>

        {formData.poligono.length === 0 ? (
          <p className="zona-map-hint">
            <MapPin size={14} /> Haz clic en el mapa para agregar puntos del poligono. Minimo 3 puntos requeridos.
          </p>
        ) : (
          <div className="zona-map-actions">
            <span className="zona-points-count">{formData.poligono.length} puntos</span>
            <button type="button" className="btn-secondary btn-sm" onClick={clearPolygon}>
              Limpiar poligono
            </button>
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="admin-module">
        <LoadingOverlay show={true} message="Cargando zonas..." size="lg" />
      </div>
    )
  }

  return (
    <div className="admin-module">
      {/* Header */}
      <div className="admin-header">
        <div className="admin-header-title">
          <h1>Gestion de Zonas Peligrosas</h1>
          <span className="admin-header-subtitle">Administra areas geograficas con restricciones o advertencias</span>
        </div>
      </div>

      {/* Action Bar */}
      <div className="rm-action-bar" style={{ justifyContent: 'space-between' }}>
        <button className="btn-secondary" onClick={() => setShowTiposModal(true)}>
          <Settings size={16} /> Tipos
        </button>
        <button className="btn-primary" onClick={openCreateModal}>
          <Plus size={16} /> Nueva Zona
        </button>
      </div>

      {/* Statistics */}
      <div className="admin-stats">
        <div className="admin-stats-grid">
          <div className="stat-card">
            <div className="stat-icon"><MapPin size={20} /></div>
            <div className="stat-content">
              <span className="stat-value">{stats.total}</span>
              <span className="stat-label">Total Zonas</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon"><Shield size={20} /></div>
            <div className="stat-content">
              <span className="stat-value">{stats.activas}</span>
              <span className="stat-label">Activas</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon"><Ban size={20} /></div>
            <div className="stat-content">
              <span className="stat-value">{stats.bloqueo}</span>
              <span className="stat-label">Con Bloqueo</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon"><AlertTriangle size={20} /></div>
            <div className="stat-content">
              <span className="stat-value">{stats.advertencia}</span>
              <span className="stat-label">Con Advertencia</span>
            </div>
          </div>
        </div>
      </div>

      {/* General Map */}
      <div className="zona-general-map">
        <h3 className="zona-section-title">Mapa General</h3>
        {renderGeneralMap()}
      </div>

      {/* Filters */}
      <div className="zona-filters">
        <div className="zona-filter-group">
          <label>Tipo</label>
          <select
            value={filterTipo}
            onChange={(e) => setFilterTipo(e.target.value)}
          >
            <option value="">Todos</option>
            {tipos.map(tipo => (
              <option key={tipo.id} value={tipo.id}>{tipo.nombre}</option>
            ))}
          </select>
        </div>
        <div className="zona-filter-group">
          <label>Estado</label>
          <select
            value={filterEstado}
            onChange={(e) => setFilterEstado(e.target.value)}
          >
            <option value="">Todos</option>
            <option value="activo">Activas</option>
            <option value="inactivo">Inactivas</option>
          </select>
        </div>
        {(filterTipo || filterEstado) && (
          <button
            className="btn-secondary btn-sm"
            onClick={() => { setFilterTipo(''); setFilterEstado('') }}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Table */}
      <div className="zona-table-container">
        <DataTable
          data={filteredZonas}
          columns={columns}
          searchPlaceholder="Buscar zonas..."
          emptyTitle="No hay zonas"
          emptyDescription="No se encontraron zonas peligrosas registradas"
        />
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="rm-modal-overlay" onClick={() => !creating && setShowCreateModal(false)}>
          <div className="rm-modal-content zona-modal-large" onClick={(e) => e.stopPropagation()}>
            <h2 className="rm-modal-title">Nueva Zona Peligrosa</h2>
            <p className="rm-modal-subtitle">Define un area geografica con restricciones</p>

            <div className="form-group">
              <label className="form-label">Nombre *</label>
              <input
                type="text"
                className="form-input"
                value={formData.nombre}
                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                placeholder="Ej: Zona Centro - Alta peligrosidad"
                disabled={creating}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Tipo de Zona *</label>
              <select
                className="form-input"
                value={formData.tipo_id}
                onChange={(e) => setFormData({ ...formData, tipo_id: e.target.value })}
                disabled={creating}
              >
                <option value="">Seleccionar tipo...</option>
                {tipos.map(tipo => (
                  <option key={tipo.id} value={tipo.id}>{tipo.nombre}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Descripcion</label>
              <textarea
                className="form-input"
                value={formData.descripcion}
                onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                placeholder="Describe las caracteristicas de esta zona..."
                rows={2}
                disabled={creating}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Area del Poligono *</label>
              {renderModalMap()}
            </div>

            <div className="zona-config-section">
              <h4 className="zona-config-title">Configuracion</h4>

              <label className="zona-checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.bloquear_asignaciones}
                  onChange={(e) => setFormData({ ...formData, bloquear_asignaciones: e.target.checked })}
                  disabled={creating}
                />
                <span>Bloquear asignaciones en esta zona</span>
              </label>

              <label className="zona-checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.mostrar_advertencia}
                  onChange={(e) => setFormData({ ...formData, mostrar_advertencia: e.target.checked })}
                  disabled={creating}
                />
                <span>Mostrar advertencia al asignar</span>
              </label>

              {formData.mostrar_advertencia && (
                <div className="form-group" style={{ marginTop: '12px' }}>
                  <label className="form-label">Mensaje de advertencia *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.mensaje_advertencia}
                    onChange={(e) => setFormData({ ...formData, mensaje_advertencia: e.target.value })}
                    disabled={creating}
                  />
                </div>
              )}
            </div>

            <div className="rm-modal-actions">
              <button
                className="btn-secondary"
                onClick={() => { setShowCreateModal(false); setFormData(initialFormData) }}
                disabled={creating}
              >
                Cancelar
              </button>
              <button
                className="btn-primary"
                onClick={handleCreate}
                disabled={creating}
              >
                {creating ? 'Guardando...' : 'Crear Zona'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedZona && (
        <div className="rm-modal-overlay" onClick={() => !creating && setShowEditModal(false)}>
          <div className="rm-modal-content zona-modal-large" onClick={(e) => e.stopPropagation()}>
            <h2 className="rm-modal-title">Editar Zona</h2>
            <p className="rm-modal-subtitle">Modifica la zona "{selectedZona.nombre}"</p>

            <div className="form-group">
              <label className="form-label">Nombre *</label>
              <input
                type="text"
                className="form-input"
                value={formData.nombre}
                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                disabled={creating}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Tipo de Zona *</label>
              <select
                className="form-input"
                value={formData.tipo_id}
                onChange={(e) => setFormData({ ...formData, tipo_id: e.target.value })}
                disabled={creating}
              >
                <option value="">Seleccionar tipo...</option>
                {tipos.map(tipo => (
                  <option key={tipo.id} value={tipo.id}>{tipo.nombre}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Descripcion</label>
              <textarea
                className="form-input"
                value={formData.descripcion}
                onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                rows={2}
                disabled={creating}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Area del Poligono *</label>
              {renderModalMap()}
            </div>

            <div className="zona-config-section">
              <h4 className="zona-config-title">Configuracion</h4>

              <label className="zona-checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.bloquear_asignaciones}
                  onChange={(e) => setFormData({ ...formData, bloquear_asignaciones: e.target.checked })}
                  disabled={creating}
                />
                <span>Bloquear asignaciones en esta zona</span>
              </label>

              <label className="zona-checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.mostrar_advertencia}
                  onChange={(e) => setFormData({ ...formData, mostrar_advertencia: e.target.checked })}
                  disabled={creating}
                />
                <span>Mostrar advertencia al asignar</span>
              </label>

              {formData.mostrar_advertencia && (
                <div className="form-group" style={{ marginTop: '12px' }}>
                  <label className="form-label">Mensaje de advertencia *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.mensaje_advertencia}
                    onChange={(e) => setFormData({ ...formData, mensaje_advertencia: e.target.value })}
                    disabled={creating}
                  />
                </div>
              )}
            </div>

            <div className="rm-modal-actions">
              <button
                className="btn-secondary"
                onClick={() => { setShowEditModal(false); setSelectedZona(null); setFormData(initialFormData) }}
                disabled={creating}
              >
                Cancelar
              </button>
              <button
                className="btn-primary"
                onClick={handleEdit}
                disabled={creating}
              >
                {creating ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteModal && selectedZona && (
        <div className="rm-modal-overlay" onClick={() => !creating && setShowDeleteModal(false)}>
          <div className="rm-modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 className="rm-modal-title rm-modal-title-danger">Eliminar Zona</h2>

            <div className="rm-delete-warning">
              <div className="rm-delete-warning-title">
                <AlertTriangle size={20} /> Advertencia
              </div>
              <div className="rm-delete-warning-text">
                Estas a punto de eliminar la zona "<strong>{selectedZona.nombre}</strong>".
                Esta accion es <strong>irreversible</strong>.
              </div>
            </div>

            <p className="rm-modal-subtitle">
              Estas seguro de que deseas continuar?
            </p>

            <div className="rm-modal-actions">
              <button
                className="btn-secondary"
                onClick={() => { setShowDeleteModal(false); setSelectedZona(null) }}
                disabled={creating}
              >
                Cancelar
              </button>
              <button
                className="btn-primary btn-danger"
                onClick={handleDelete}
                disabled={creating}
              >
                {creating ? 'Eliminando...' : 'Si, Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tipos Manager Modal */}
      {showTiposModal && (
        <ZonaTiposManager
          onClose={() => setShowTiposModal(false)}
          onUpdate={loadTipos}
        />
      )}
    </div>
  )
}
