// src/modules/vehiculos/VehicleManagement.tsx
import { useState, useEffect, useMemo } from 'react'
import { AlertTriangle, Eye, Edit, Trash2, Info, Car, Wrench, Filter } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { usePermissions } from '../../contexts/PermissionsContext'
import { useAuth } from '../../contexts/AuthContext'
import Swal from 'sweetalert2'
import type {
  VehiculoWithRelations,
  VehiculoEstado
} from '../../types/database.types'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../../components/ui/DataTable'
import { VehiculoWizard } from './components/VehiculoWizard'
import './VehicleManagement.css'

export function VehicleManagement() {
  const [vehiculos, setVehiculos] = useState<VehiculoWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedVehiculo, setSelectedVehiculo] = useState<VehiculoWithRelations | null>(null)

  // Stats data para tarjetas de resumen
  const [statsData, setStatsData] = useState({
    totalVehiculos: 0,
    vehiculosDisponibles: 0,
    vehiculosEnUso: 0,
    vehiculosEnTaller: 0,
    vehiculosFueraServicio: 0,
  })

  // Removed TanStack Table states - now handled by DataTable component

  // Catalog states
  const [vehiculosEstados, setVehiculosEstados] = useState<VehiculoEstado[]>([])

  // Column filter states
  const [patenteFilter, setPatenteFilter] = useState('')
  const [marcaFilter, setMarcaFilter] = useState('')
  const [modeloFilter, setModeloFilter] = useState('')
  const [estadoFilter, setEstadoFilter] = useState<string[]>([])
  const [openColumnFilter, setOpenColumnFilter] = useState<string | null>(null)

  const { canCreateInMenu, canEditInMenu, canDeleteInMenu } = usePermissions()
  const { profile } = useAuth()

  // Permisos específicos para el menú de vehículos
  const canCreate = canCreateInMenu('vehiculos')
  const canUpdate = canEditInMenu('vehiculos')
  const canDelete = canDeleteInMenu('vehiculos')

  const [formData, setFormData] = useState({
    patente: '',
    marca: '',
    modelo: '',
    anio: new Date().getFullYear(),
    color: '',
    tipo_vehiculo: '',
    tipo_combustible: '',
    tipo_gps: '',
    gps_uss: false,
    numero_motor: '',
    numero_chasis: '',
    provisoria: '',
    estado_id: '',
    kilometraje_actual: 0,
    fecha_adquisicion: '',
    fecha_ulti_inspeccion: '',
    fecha_prox_inspeccion: '',
    seguro_numero: '',
    seguro_vigencia: '',
    titular: '',
    notas: ''
  })

  useEffect(() => {
    loadVehiculos()
    loadCatalogs()
    loadStatsData()
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

  const loadStatsData = async () => {
    try {
      // Total de vehículos
      const { count: totalVehiculos } = await supabase
        .from('vehiculos')
        .select('*', { count: 'exact', head: true })

      // Obtener estados de vehículos
      const { data: estadosVeh } = await supabase
        .from('vehiculos_estados')
        .select('id, codigo') as { data: Array<{ id: string; codigo: string }> | null }

      const estadoIdMap = new Map<string, string>()
      estadosVeh?.forEach(e => estadoIdMap.set(e.codigo, e.id))

      // Vehículos disponibles (sin asignar, listos para usar: DISPONIBLE + PKG_ON_BASE)
      let vehiculosDisponibles = 0
      const disponiblesIds = [
        estadoIdMap.get('DISPONIBLE'),
        estadoIdMap.get('PKG_ON_BASE')
      ].filter(Boolean) as string[]
      if (disponiblesIds.length > 0) {
        const { count } = await supabase
          .from('vehiculos')
          .select('*', { count: 'exact', head: true })
          .in('estado_id', disponiblesIds)
        vehiculosDisponibles = count || 0
      }

      // Vehículos en uso
      let vehiculosEnUso = 0
      const estadoEnUsoId = estadoIdMap.get('EN_USO')
      if (estadoEnUsoId) {
        const { count } = await supabase
          .from('vehiculos')
          .select('*', { count: 'exact', head: true })
          .eq('estado_id', estadoEnUsoId)
        vehiculosEnUso = count || 0
      }

      // Vehículos en taller
      let vehiculosEnTaller = 0
      const tallerIds = [
        estadoIdMap.get('TALLER_AXIS'),
        estadoIdMap.get('TALLER_CHAPA_PINTURA'),
        estadoIdMap.get('TALLER_ALLIANCE'),
        estadoIdMap.get('TALLER_KALZALO'),
        estadoIdMap.get('TALLER_BASE_VALIENTE'),
        estadoIdMap.get('INSTALACION_GNC')
      ].filter(Boolean) as string[]
      if (tallerIds.length > 0) {
        const { count } = await supabase
          .from('vehiculos')
          .select('*', { count: 'exact', head: true })
          .in('estado_id', tallerIds)
        vehiculosEnTaller = count || 0
      }

      // Vehículos no disponibles (Robo, Destrucción, Jubilado, Retenido, Corporativo, PKG OFF)
      let vehiculosFueraServicio = 0
      const noDisponibleIds = [
        estadoIdMap.get('ROBO'),
        estadoIdMap.get('DESTRUCCION_TOTAL'),
        estadoIdMap.get('JUBILADO'),
        estadoIdMap.get('RETENIDO_COMISARIA'),
        estadoIdMap.get('CORPORATIVO'),
        estadoIdMap.get('PKG_OFF_BASE'),
        estadoIdMap.get('PKG_OFF_FRANCIA')
      ].filter(Boolean) as string[]
      if (noDisponibleIds.length > 0) {
        const { count } = await supabase
          .from('vehiculos')
          .select('*', { count: 'exact', head: true })
          .in('estado_id', noDisponibleIds)
        vehiculosFueraServicio = count || 0
      }

      setStatsData({
        totalVehiculos: totalVehiculos || 0,
        vehiculosDisponibles,
        vehiculosEnUso,
        vehiculosEnTaller,
        vehiculosFueraServicio,
      })
    } catch (err) {
      console.error('Error loading stats:', err)
    }
  }

  const loadCatalogs = async () => {
    try {
      const estadosRes = await supabase.from('vehiculos_estados').select('*').order('descripcion')

      if (estadosRes.data) setVehiculosEstados(estadosRes.data)

      if (estadosRes.error) console.error('Error vehiculos_estados:', estadosRes.error)
    } catch (err: any) {
      console.error('Error cargando catálogos:', err)
    }
  }

  const loadVehiculos = async () => {
    setLoading(true)
    setError('')

    try {
      // ✅ OPTIMIZADO: Una sola query con JOIN (51 queries → 1 query)
      const { data, error: fetchError } = await supabase
        .from('vehiculos')
        .select(`
          *,
          vehiculos_estados (
            id,
            codigo,
            descripcion
          )
        `)
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError

      // Los datos ya vienen con las relaciones, no necesitamos hacer más queries
      if (data && data.length > 0) {
        // Ordenar: DISPONIBLE primero, luego el resto
        const sortedData = [...data].sort((a, b) => {
          const estadoA = (a as any).vehiculos_estados?.codigo || ''
          const estadoB = (b as any).vehiculos_estados?.codigo || ''

          // DISPONIBLE primero
          if (estadoA === 'DISPONIBLE' && estadoB !== 'DISPONIBLE') return -1
          if (estadoB === 'DISPONIBLE' && estadoA !== 'DISPONIBLE') return 1

          // Luego ordenar alfabéticamente por estado
          return estadoA.localeCompare(estadoB)
        })
        setVehiculos(sortedData as VehiculoWithRelations[])
      } else {
        setVehiculos([])
      }
    } catch (err: any) {
      console.error('Error cargando vehículos:', err)
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
        text: 'No tienes permisos para crear vehículos',
        confirmButtonColor: '#E63946'
      })
      return
    }

    if (!formData.patente || !formData.marca || !formData.modelo) {
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

      const { error: insertError} = await supabase
        .from('vehiculos')
        // @ts-expect-error - Tipo generado incorrectamente por Supabase CLI
        .insert([{
          patente: formData.patente.toUpperCase(),
          marca: formData.marca || null,
          modelo: formData.modelo || null,
          anio: formData.anio || null,
          color: formData.color || null,
          tipo_vehiculo: formData.tipo_vehiculo || null,
          tipo_combustible: formData.tipo_combustible || null,
          tipo_gps: formData.tipo_gps || null,
          gps_uss: formData.gps_uss,
          numero_motor: formData.numero_motor || null,
          numero_chasis: formData.numero_chasis || null,
          provisoria: formData.provisoria || null,
          estado_id: formData.estado_id || null,
          kilometraje_actual: formData.kilometraje_actual,
          fecha_adquisicion: formData.fecha_adquisicion || null,
          fecha_ulti_inspeccion: formData.fecha_ulti_inspeccion || null,
          fecha_prox_inspeccion: formData.fecha_prox_inspeccion || null,
          seguro_numero: formData.seguro_numero || null,
          seguro_vigencia: formData.seguro_vigencia || null,
          titular: formData.titular || null,
          notas: formData.notas || null,
          created_by: user?.id,
          created_by_name: profile?.full_name || 'Sistema'
        }])

      if (insertError) throw insertError

      Swal.fire({
        icon: 'success',
        title: '¡Éxito!',
        text: 'Vehículo creado exitosamente',
        confirmButtonColor: '#E63946',
        timer: 2000
      })
      setShowCreateModal(false)
      resetForm()
      await loadVehiculos()
    } catch (err: any) {
      console.error('Error creando vehículo:', err)
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
        text: 'No tienes permisos para editar vehículos',
        confirmButtonColor: '#E63946'
      })
      return
    }

    if (!selectedVehiculo) return

    setSaving(true)
    try {
      const { error: updateError } = await supabase
        .from('vehiculos')
        // @ts-expect-error - Tipo generado incorrectamente por Supabase CLI
        .update({
          patente: formData.patente.toUpperCase(),
          marca: formData.marca || null,
          modelo: formData.modelo || null,
          anio: formData.anio || null,
          color: formData.color || null,
          tipo_vehiculo: formData.tipo_vehiculo || null,
          tipo_combustible: formData.tipo_combustible || null,
          tipo_gps: formData.tipo_gps || null,
          gps_uss: formData.gps_uss,
          numero_motor: formData.numero_motor || null,
          numero_chasis: formData.numero_chasis || null,
          provisoria: formData.provisoria || null,
          estado_id: formData.estado_id || null,
          kilometraje_actual: formData.kilometraje_actual,
          fecha_adquisicion: formData.fecha_adquisicion || null,
          fecha_ulti_inspeccion: formData.fecha_ulti_inspeccion || null,
          fecha_prox_inspeccion: formData.fecha_prox_inspeccion || null,
          seguro_numero: formData.seguro_numero || null,
          seguro_vigencia: formData.seguro_vigencia || null,
          titular: formData.titular || null,
          notas: formData.notas || null,
          updated_at: new Date().toISOString(),
          updated_by: profile?.full_name || 'Sistema'
        })
        .eq('id', selectedVehiculo.id)

      if (updateError) throw updateError

      Swal.fire({
        icon: 'success',
        title: '¡Éxito!',
        text: 'Vehículo actualizado exitosamente',
        confirmButtonColor: '#E63946',
        timer: 2000
      })
      setShowEditModal(false)
      setSelectedVehiculo(null)
      resetForm()
      await loadVehiculos()
    } catch (err: any) {
      console.error('Error actualizando vehículo:', err)
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
        text: 'No tienes permisos para eliminar vehículos',
        confirmButtonColor: '#E63946'
      })
      return
    }

    if (!selectedVehiculo) return

    setSaving(true)
    try {
      const { error: deleteError } = await supabase
        .from('vehiculos')
        .delete()
        .eq('id', selectedVehiculo.id)

      if (deleteError) throw deleteError

      Swal.fire({
        icon: 'success',
        title: '¡Éxito!',
        text: 'Vehículo eliminado exitosamente',
        confirmButtonColor: '#E63946',
        timer: 2000
      })
      setShowDeleteModal(false)
      setSelectedVehiculo(null)
      await loadVehiculos()
    } catch (err: any) {
      console.error('Error eliminando vehículo:', err)
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

  const openEditModal = (vehiculo: VehiculoWithRelations) => {
    setSelectedVehiculo(vehiculo)
    setFormData({
      patente: vehiculo.patente,
      marca: vehiculo.marca || '',
      modelo: vehiculo.modelo || '',
      anio: vehiculo.anio || new Date().getFullYear(),
      color: vehiculo.color || '',
      tipo_vehiculo: (vehiculo as any).tipo_vehiculo || '',
      tipo_combustible: (vehiculo as any).tipo_combustible || '',
      tipo_gps: (vehiculo as any).tipo_gps || '',
      gps_uss: (vehiculo as any).gps_uss || false,
      numero_motor: vehiculo.numero_motor || '',
      numero_chasis: vehiculo.numero_chasis || '',
      provisoria: vehiculo.provisoria || '',
      estado_id: vehiculo.estado_id || '',
      kilometraje_actual: vehiculo.kilometraje_actual,
      fecha_adquisicion: vehiculo.fecha_adquisicion || '',
      fecha_ulti_inspeccion: vehiculo.fecha_ulti_inspeccion || '',
      fecha_prox_inspeccion: vehiculo.fecha_prox_inspeccion || '',
      seguro_numero: vehiculo.seguro_numero || '',
      seguro_vigencia: vehiculo.seguro_vigencia || '',
      titular: vehiculo.titular || '',
      notas: vehiculo.notas || ''
    })
    setShowEditModal(true)
  }

  const openDeleteModal = (vehiculo: VehiculoWithRelations) => {
    setSelectedVehiculo(vehiculo)
    setShowDeleteModal(true)
  }

  const resetForm = () => {
    setFormData({
      patente: '',
      marca: '',
      modelo: '',
      anio: new Date().getFullYear(),
      color: '',
      tipo_vehiculo: '',
      tipo_combustible: '',
      tipo_gps: '',
      gps_uss: false,
      numero_motor: '',
      numero_chasis: '',
      provisoria: '',
      estado_id: '',
      kilometraje_actual: 0,
      fecha_adquisicion: '',
      fecha_ulti_inspeccion: '',
      fecha_prox_inspeccion: '',
      seguro_numero: '',
      seguro_vigencia: '',
      titular: '',
      notas: ''
    })
  }

  // Filtrar vehículos según los filtros de columna
  const filteredVehiculos = useMemo(() => {
    let result = vehiculos

    if (patenteFilter) {
      result = result.filter(v =>
        v.patente?.toLowerCase().includes(patenteFilter.toLowerCase())
      )
    }

    if (marcaFilter) {
      result = result.filter(v =>
        v.marca?.toLowerCase().includes(marcaFilter.toLowerCase())
      )
    }

    if (modeloFilter) {
      result = result.filter(v =>
        v.modelo?.toLowerCase().includes(modeloFilter.toLowerCase())
      )
    }

    if (estadoFilter.length > 0) {
      result = result.filter(v =>
        estadoFilter.includes(v.vehiculos_estados?.codigo || '')
      )
    }

    // Ordenar por estado: En Uso, PKG ON, PKG OFF, Chapa&Pintura, luego el resto
    const estadoOrden: Record<string, number> = {
      'EN_USO': 1,
      'PKG_ON_BASE': 2,
      'PKG_OFF_BASE': 3,
      'TALLER_CHAPA_PINTURA': 4,
    }
    result = [...result].sort((a, b) => {
      const ordenA = estadoOrden[a.vehiculos_estados?.codigo || ''] || 99
      const ordenB = estadoOrden[b.vehiculos_estados?.codigo || ''] || 99
      if (ordenA !== ordenB) return ordenA - ordenB
      // Si mismo estado, ordenar por patente
      return (a.patente || '').localeCompare(b.patente || '')
    })

    return result
  }, [vehiculos, patenteFilter, marcaFilter, modeloFilter, estadoFilter])


  // Definir columnas para TanStack Table
  const columns = useMemo<ColumnDef<VehiculoWithRelations>[]>(
    () => [
      {
        accessorKey: 'patente',
        header: () => (
          <div className="dt-column-filter">
            <span>Patente</span>
            <button
              className={`dt-column-filter-btn ${patenteFilter ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                setOpenColumnFilter(openColumnFilter === 'patente' ? null : 'patente')
              }}
              title="Filtrar por patente"
            >
              <Filter size={12} />
            </button>
            {openColumnFilter === 'patente' && (
              <div className="dt-column-filter-dropdown" style={{ minWidth: '160px' }}>
                <input
                  type="text"
                  placeholder="Buscar patente..."
                  value={patenteFilter}
                  onChange={(e) => setPatenteFilter(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="dt-column-filter-input"
                  autoFocus
                />
                {patenteFilter && (
                  <button
                    className="dt-column-filter-option"
                    onClick={(e) => {
                      e.stopPropagation()
                      setPatenteFilter('')
                    }}
                    style={{ marginTop: '4px', color: 'var(--color-danger)' }}
                  >
                    Limpiar
                  </button>
                )}
              </div>
            )}
          </div>
        ),
        cell: ({ getValue }) => (
          <span className="patente-badge">{getValue() as string}</span>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'marca',
        header: () => (
          <div className="dt-column-filter">
            <span>Marca</span>
            <button
              className={`dt-column-filter-btn ${marcaFilter ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                setOpenColumnFilter(openColumnFilter === 'marca' ? null : 'marca')
              }}
              title="Filtrar por marca"
            >
              <Filter size={12} />
            </button>
            {openColumnFilter === 'marca' && (
              <div className="dt-column-filter-dropdown" style={{ minWidth: '160px' }}>
                <input
                  type="text"
                  placeholder="Buscar marca..."
                  value={marcaFilter}
                  onChange={(e) => setMarcaFilter(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="dt-column-filter-input"
                  autoFocus
                />
                {marcaFilter && (
                  <button
                    className="dt-column-filter-option"
                    onClick={(e) => {
                      e.stopPropagation()
                      setMarcaFilter('')
                    }}
                    style={{ marginTop: '4px', color: 'var(--color-danger)' }}
                  >
                    Limpiar
                  </button>
                )}
              </div>
            )}
          </div>
        ),
        cell: ({ getValue }) => <strong>{getValue() as string}</strong>,
        enableSorting: true,
      },
      {
        accessorKey: 'modelo',
        header: () => (
          <div className="dt-column-filter">
            <span>Modelo</span>
            <button
              className={`dt-column-filter-btn ${modeloFilter ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                setOpenColumnFilter(openColumnFilter === 'modelo' ? null : 'modelo')
              }}
              title="Filtrar por modelo"
            >
              <Filter size={12} />
            </button>
            {openColumnFilter === 'modelo' && (
              <div className="dt-column-filter-dropdown" style={{ minWidth: '160px' }}>
                <input
                  type="text"
                  placeholder="Buscar modelo..."
                  value={modeloFilter}
                  onChange={(e) => setModeloFilter(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="dt-column-filter-input"
                  autoFocus
                />
                {modeloFilter && (
                  <button
                    className="dt-column-filter-option"
                    onClick={(e) => {
                      e.stopPropagation()
                      setModeloFilter('')
                    }}
                    style={{ marginTop: '4px', color: 'var(--color-danger)' }}
                  >
                    Limpiar
                  </button>
                )}
              </div>
            )}
          </div>
        ),
        cell: ({ getValue }) => (getValue() as string) || 'N/A',
        enableSorting: true,
      },
      {
        accessorKey: 'anio',
        header: 'Año',
        cell: ({ getValue }) => (getValue() as number) || 'N/A',
        enableSorting: true,
      },
      {
        accessorKey: 'kilometraje_actual',
        header: 'Kilometraje',
        cell: ({ getValue }) => `${(getValue() as number).toLocaleString()} km`,
        enableSorting: true,
      },
      {
        accessorKey: 'vehiculos_estados.codigo',
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
              <div className="dt-column-filter-dropdown" style={{ minWidth: '220px', maxHeight: '400px', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
                <button
                  className="dt-column-filter-option"
                  onClick={() => setEstadoFilter([])}
                  style={{ color: estadoFilter.length === 0 ? 'var(--color-primary)' : 'inherit', fontWeight: estadoFilter.length === 0 ? '600' : 'normal' }}
                >
                  ✓ Todos ({vehiculos.length})
                </button>
                <div style={{ borderBottom: '1px solid var(--border-primary)', margin: '4px 0' }} />
                {/* Ordenar estados: En Uso, PKG ON, PKG OFF, Chapa&Pintura, luego el resto */}
                {[...vehiculosEstados].sort((a, b) => {
                  const orden: Record<string, number> = {
                    'EN_USO': 1,
                    'PKG_ON_BASE': 2,
                    'PKG_OFF_BASE': 3,
                    'TALLER_CHAPA_PINTURA': 4,
                  }
                  const ordenA = orden[a.codigo] || 99
                  const ordenB = orden[b.codigo] || 99
                  if (ordenA !== ordenB) return ordenA - ordenB
                  return (a.descripcion || '').localeCompare(b.descripcion || '')
                }).map((estado) => {
                  const isSelected = estadoFilter.includes(estado.codigo)
                  const count = vehiculos.filter(v => v.vehiculos_estados?.codigo === estado.codigo).length
                  return (
                    <label
                      key={estado.codigo}
                      className="dt-column-filter-option"
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          if (isSelected) {
                            setEstadoFilter(estadoFilter.filter(c => c !== estado.codigo))
                          } else {
                            setEstadoFilter([...estadoFilter, estado.codigo])
                          }
                        }}
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      <span style={{ flex: 1 }}>{estado.descripcion}</span>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>({count})</span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        ),
        cell: ({ row }) => {
          const estado = row.original.vehiculos_estados
          const codigo = estado?.codigo || 'N/A'

          // Etiquetas cortas para el badge
          const etiquetasCortas: Record<string, string> = {
            'DISPONIBLE': 'Disponible',
            'EN_USO': 'En Uso',
            'CORPORATIVO': 'Corporativo',
            'PKG_ON_BASE': 'PKG ON',
            'PKG_OFF_BASE': 'PKG OFF',
            'PKG_OFF_FRANCIA': 'PKG Francia',
            'TALLER_AXIS': 'Taller Axis',
            'TALLER_CHAPA_PINTURA': 'Chapa&Pintura',
            'TALLER_ALLIANCE': 'Taller Alliance',
            'TALLER_KALZALO': 'Taller Kalzalo',
            'TALLER_BASE_VALIENTE': 'Base Valiente',
            'INSTALACION_GNC': 'Inst. GNC',
            'RETENIDO_COMISARIA': 'Retenido',
            'ROBO': 'Robo',
            'DESTRUCCION_TOTAL': 'Destrucción',
            'JUBILADO': 'Jubilado',
            'PROGRAMADO': 'Programado'
          }

          let badgeClass = 'dt-badge dt-badge-solid-gray'
          switch (codigo) {
            case 'EN_USO':
              badgeClass = 'dt-badge dt-badge-solid-green'
              break
            case 'DISPONIBLE':
              badgeClass = 'dt-badge dt-badge-solid-amber'
              break
            case 'CORPORATIVO':
              badgeClass = 'dt-badge dt-badge-solid-blue'
              break
            case 'PKG_ON_BASE':
              badgeClass = 'dt-badge dt-badge-solid-yellow'
              break
            case 'PKG_OFF_BASE':
            case 'PKG_OFF_FRANCIA':
              badgeClass = 'dt-badge dt-badge-solid-gray'
              break
            case 'TALLER_CHAPA_PINTURA':
              badgeClass = 'dt-badge dt-badge-solid-purple'
              break
            case 'TALLER_AXIS':
            case 'TALLER_ALLIANCE':
            case 'TALLER_KALZALO':
            case 'TALLER_BASE_VALIENTE':
            case 'INSTALACION_GNC':
              badgeClass = 'dt-badge dt-badge-solid-orange'
              break
            case 'ROBO':
            case 'DESTRUCCION_TOTAL':
            case 'RETENIDO_COMISARIA':
            case 'JUBILADO':
              badgeClass = 'dt-badge dt-badge-solid-red'
              break
          }

          return (
            <span className={badgeClass} title={estado?.descripcion || codigo}>
              {etiquetasCortas[codigo] || codigo}
            </span>
          )
        },
        enableSorting: true,
      },
      {
        id: 'acciones',
        header: 'Acciones',
        cell: ({ row }) => (
          <div className="dt-actions">
            <button
              className="dt-btn-action dt-btn-view"
              onClick={() => {
                setSelectedVehiculo(row.original)
                setShowDetailsModal(true)
              }}
              title="Ver detalles"
            >
              <Eye size={16} />
            </button>
            <button
              className="dt-btn-action dt-btn-edit"
              onClick={() => openEditModal(row.original)}
              disabled={!canUpdate}
              title={!canUpdate ? 'No tienes permisos para editar' : 'Editar vehiculo'}
            >
              <Edit size={16} />
            </button>
            <button
              className="dt-btn-action dt-btn-delete"
              onClick={() => openDeleteModal(row.original)}
              disabled={!canDelete}
              title={!canDelete ? 'No tienes permisos para eliminar' : 'Eliminar vehiculo'}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ),
        enableSorting: false,
      },
    ],
    [canUpdate, canDelete, patenteFilter, marcaFilter, modeloFilter, estadoFilter, openColumnFilter, vehiculosEstados]
  )

  return (
    <div className="veh-module">
      {/* Stats Cards - Estilo Bitácora */}
      <div className="veh-stats">
        <div className="veh-stats-grid">
          <div className="stat-card">
            <Car size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{statsData.totalVehiculos}</span>
              <span className="stat-label">Total</span>
            </div>
          </div>
          <div className="stat-card" title="Vehículos disponibles para asignar (DISPONIBLE + PKG ON)">
            <Car size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{statsData.vehiculosDisponibles}</span>
              <span className="stat-label">Disponibles</span>
            </div>
          </div>
          <div className="stat-card" title="Vehículos con asignación activa actualmente">
            <Car size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{statsData.vehiculosEnUso}</span>
              <span className="stat-label">En Uso</span>
            </div>
          </div>
          <div className="stat-card" title="Vehículos en taller de mecánica o chapa y pintura">
            <Wrench size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{statsData.vehiculosEnTaller}</span>
              <span className="stat-label">En Taller</span>
            </div>
          </div>
          <div className="stat-card" title="Vehículos no disponibles (robo, destrucción, jubilado, PKG off, corporativo)">
            <AlertTriangle size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{statsData.vehiculosFueraServicio}</span>
              <span className="stat-label">No Disponible</span>
            </div>
          </div>
        </div>
      </div>

      {!canCreate && (
        <div className="no-permission-msg">
          <Info size={16} />
          No tienes permisos para crear vehiculos. Solo puedes ver la lista.
        </div>
      )}

      {/* DataTable with integrated action button */}
      <DataTable
        data={filteredVehiculos}
        columns={columns}
        loading={loading}
        error={error}
        pageSize={100}
        pageSizeOptions={[50, 100, 200]}
        searchPlaceholder="Buscar por patente, marca, modelo..."
        emptyIcon={<Car size={64} />}
        emptyTitle="No hay vehiculos registrados"
        emptyDescription={canCreate ? 'Crea el primero usando el boton "+ Crear Vehiculo".' : ''}
        headerAction={
          <button
            className="btn-primary"
            onClick={() => {
              resetForm()
              setShowCreateModal(true)
            }}
            disabled={!canCreate}
            title={!canCreate ? 'No tienes permisos para crear vehiculos' : ''}
          >
            + Crear Vehiculo
          </button>
        }
      />

      {/* MODALS */}
      {/* Modal Crear - Wizard */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => !saving && setShowCreateModal(false)}>
          <div className="modal-content modal-wizard" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Crear Nuevo Vehículo</h2>
              <button
                className="modal-close"
                onClick={() => !saving && setShowCreateModal(false)}
                type="button"
              >
                ×
              </button>
            </div>
            <div className="modal-body" style={{ padding: 0 }}>
            <VehiculoWizard
              formData={formData}
              setFormData={setFormData}
              vehiculosEstados={vehiculosEstados}
              onCancel={() => {
                setShowCreateModal(false)
                resetForm()
              }}
              onSubmit={handleCreate}
              saving={saving}
            />
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar - Formulario completo */}
      {showEditModal && selectedVehiculo && (
        <div className="modal-overlay" onClick={() => !saving && setShowEditModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '900px' }}>
            <div className="modal-header">
              <h2>Editar Vehículo</h2>
              <button
                className="modal-close"
                onClick={() => !saving && setShowEditModal(false)}
                type="button"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
            {/* Mismo formulario que en crear, solo cambia el botón final */}
            <div className="section-title">Información Básica</div>

            <div className="form-group">
              <label className="form-label">Patente *</label>
              <input
                type="text"
                className="form-input"
                value={formData.patente}
                onChange={(e) => setFormData({ ...formData, patente: e.target.value.toUpperCase() })}
                disabled={saving}
                maxLength={10}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Marca</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.marca}
                  onChange={(e) => setFormData({ ...formData, marca: e.target.value })}
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Modelo</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.modelo}
                  onChange={(e) => setFormData({ ...formData, modelo: e.target.value })}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Año</label>
                <input
                  type="number"
                  className="form-input"
                  value={formData.anio}
                  onChange={(e) => setFormData({ ...formData, anio: parseInt(e.target.value) })}
                  min="1900"
                  max={new Date().getFullYear() + 1}
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Color</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="section-title">Tipo y Características</div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Tipo</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.tipo_vehiculo}
                  onChange={(e) => setFormData({ ...formData, tipo_vehiculo: e.target.value })}
                  disabled={saving}
                  placeholder="Ej: Camion, Auto, Moto, Utilitario..."
                />
              </div>

              <div className="form-group">
                <label className="form-label">Tipo Combustible</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.tipo_combustible}
                  onChange={(e) => setFormData({ ...formData, tipo_combustible: e.target.value })}
                  disabled={saving}
                  placeholder="Ej: Nafta, Gasoil, GNC, Eléctrico..."
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Tipo GPS</label>
                <select
                  className="form-input"
                  value={formData.tipo_gps}
                  onChange={(e) => setFormData({ ...formData, tipo_gps: e.target.value })}
                  disabled={saving}
                >
                  <option value="">Sin GPS</option>
                  <option value="Strix">Strix</option>
                  <option value="Traccar">Traccar</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">USS (Wialon)</label>
                <div style={{ display: 'flex', alignItems: 'center', height: '42px' }}>
                  <input
                    type="checkbox"
                    checked={formData.gps_uss}
                    onChange={(e) => setFormData({ ...formData, gps_uss: e.target.checked })}
                    disabled={saving}
                    style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                  />
                  <span style={{ marginLeft: '8px', color: formData.gps_uss ? '#10B981' : '#6B7280' }}>
                    {formData.gps_uss ? 'Sí tiene USS' : 'No tiene USS'}
                  </span>
                </div>
              </div>
            </div>

            <div className="section-title">Datos Técnicos</div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Número Motor</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.numero_motor}
                  onChange={(e) => setFormData({ ...formData, numero_motor: e.target.value })}
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Número Chasis</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.numero_chasis}
                  onChange={(e) => setFormData({ ...formData, numero_chasis: e.target.value })}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Provisoria</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.provisoria}
                  onChange={(e) => setFormData({ ...formData, provisoria: e.target.value })}
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Kilometraje Actual</label>
                <input
                  type="number"
                  className="form-input"
                  value={formData.kilometraje_actual}
                  onChange={(e) => setFormData({ ...formData, kilometraje_actual: parseInt(e.target.value) || 0 })}
                  min="0"
                  disabled={saving}
                />
              </div>
            </div>

            <div className="section-title">Estado y Fechas</div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Estado</label>
                <select
                  className="form-input"
                  value={formData.estado_id}
                  onChange={(e) => setFormData({ ...formData, estado_id: e.target.value })}
                  disabled={saving}
                >
                  <option value="">Seleccionar...</option>
                  {vehiculosEstados.map((estado: any) => (
                    <option key={estado.id} value={estado.id}>{estado.descripcion}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Fecha Adquisición</label>
                <input
                  type="date"
                  className="form-input"
                  value={formData.fecha_adquisicion}
                  onChange={(e) => setFormData({ ...formData, fecha_adquisicion: e.target.value })}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Fecha Última Inspección</label>
                <input
                  type="date"
                  className="form-input"
                  value={formData.fecha_ulti_inspeccion}
                  onChange={(e) => setFormData({ ...formData, fecha_ulti_inspeccion: e.target.value })}
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Fecha Próxima Inspección</label>
                <input
                  type="date"
                  className="form-input"
                  value={formData.fecha_prox_inspeccion}
                  onChange={(e) => setFormData({ ...formData, fecha_prox_inspeccion: e.target.value })}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="section-title">Seguro</div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Número Seguro</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.seguro_numero}
                  onChange={(e) => setFormData({ ...formData, seguro_numero: e.target.value })}
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Vigencia Seguro</label>
                <input
                  type="date"
                  className="form-input"
                  value={formData.seguro_vigencia}
                  onChange={(e) => setFormData({ ...formData, seguro_vigencia: e.target.value })}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="section-title">Información Adicional</div>

            <div className="form-group">
              <label className="form-label">Titular</label>
              <input
                type="text"
                className="form-input"
                value={formData.titular}
                onChange={(e) => setFormData({ ...formData, titular: e.target.value })}
                disabled={saving}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Notas</label>
              <textarea
                className="form-input"
                value={formData.notas}
                onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
                disabled={saving}
                rows={3}
                style={{ resize: 'vertical' }}
              />
            </div>

            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowEditModal(false)
                  setSelectedVehiculo(null)
                  resetForm()
                }}
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                className="btn-primary"
                onClick={handleUpdate}
                disabled={saving}
              >
                {saving ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Ver Detalles */}
      {showDetailsModal && selectedVehiculo && (
        <div className="modal-overlay" onClick={() => setShowDetailsModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Detalles del Vehículo</h2>
              <button
                className="modal-close"
                onClick={() => setShowDetailsModal(false)}
                type="button"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '16px',
              marginBottom: '24px'
            }}>
              <div>
                <label style={{ fontWeight: '600', fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>
                  PATENTE
                </label>
                <div className="patente-badge" style={{ display: 'inline-block' }}>
                  {selectedVehiculo.patente}
                </div>
              </div>

              <div>
                <label style={{ fontWeight: '600', fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>
                  ESTADO
                </label>
                <span className="badge" style={{ backgroundColor: '#10B981', color: 'white' }}>
                  {selectedVehiculo.vehiculos_estados?.descripcion || 'N/A'}
                </span>
              </div>

              <div>
                <label style={{ fontWeight: '600', fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>
                  MARCA
                </label>
                <div style={{ fontSize: '14px', color: '#1F2937' }}>
                  {selectedVehiculo.marca}
                </div>
              </div>

              <div>
                <label style={{ fontWeight: '600', fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>
                  MODELO
                </label>
                <div style={{ fontSize: '14px', color: '#1F2937' }}>
                  {selectedVehiculo.modelo}
                </div>
              </div>

              <div>
                <label style={{ fontWeight: '600', fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>
                  AÑO
                </label>
                <div style={{ fontSize: '14px', color: '#1F2937' }}>
                  {selectedVehiculo.anio || 'N/A'}
                </div>
              </div>

              <div>
                <label style={{ fontWeight: '600', fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>
                  KILOMETRAJE
                </label>
                <div style={{ fontSize: '14px', color: '#1F2937' }}>
                  {selectedVehiculo.kilometraje_actual.toLocaleString()} km
                </div>
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontWeight: '600', fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>
                  FECHA DE CREACIÓN
                </label>
                <div style={{ fontSize: '14px', color: '#1F2937' }}>
                  {new Date(selectedVehiculo.created_at).toLocaleString('es-AR')}
                </div>
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontWeight: '600', fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>
                  ÚLTIMA ACTUALIZACIÓN
                </label>
                <div style={{ fontSize: '14px', color: '#1F2937' }}>
                  {new Date(selectedVehiculo.updated_at).toLocaleString('es-AR')}
                </div>
              </div>
            </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setShowDetailsModal(false)}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Eliminar */}
      {showDeleteModal && selectedVehiculo && (
        <div className="modal-overlay" onClick={() => !saving && setShowDeleteModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ color: '#DC2626' }}>Eliminar Vehículo</h2>
              <button
                className="modal-close"
                onClick={() => !saving && setShowDeleteModal(false)}
                type="button"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
            <div className="delete-warning">
              <div className="delete-warning-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={20} /> Advertencia
              </div>
              <div className="delete-warning-text">
                Estás a punto de eliminar el vehículo <strong>{selectedVehiculo.patente}</strong> ({selectedVehiculo.marca} {selectedVehiculo.modelo}).
                Esta acción es <strong>irreversible</strong>.
              </div>
            </div>

            <p style={{ color: '#6B7280', fontSize: '14px' }}>
              ¿Estás seguro de que deseas continuar?
            </p>
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowDeleteModal(false)
                  setSelectedVehiculo(null)
                }}
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                className="btn-primary"
                onClick={handleDelete}
                disabled={saving}
                style={{ background: '#DC2626' }}
              >
                {saving ? 'Eliminando...' : 'Sí, Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
