// src/modules/vehiculos/VehicleManagement.tsx
import { useState, useEffect, useMemo } from 'react'
import { AlertTriangle, Eye, Edit, Trash2, Info, Car, Wrench, Filter, Loader2, Briefcase, PaintBucket, Warehouse } from 'lucide-react'
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
    vehiculosDisponibles: 0, // PKG_ON_BASE + PKG_OFF_BASE (disponibles en cochera)
    vehiculosEnUso: 0,
    vehiculosTallerMecanico: 0, // TALLER_AXIS, TALLER_ALLIANCE, TALLER_KALZALO, TALLER_BASE_VALIENTE, INSTALACION_GNC
    vehiculosChapaPintura: 0, // TALLER_CHAPA_PINTURA
    vehiculosCorporativos: 0, // CORPORATIVO
  })
  const [statsLoading, setStatsLoading] = useState(true)

  // Removed TanStack Table states - now handled by DataTable component

  // Catalog states
  const [vehiculosEstados, setVehiculosEstados] = useState<VehiculoEstado[]>([])

  // Column filter states - Multiselect tipo Excel
  const [patenteFilter, setPatenteFilter] = useState<string[]>([])
  const [patenteSearch, setPatenteSearch] = useState('')
  const [marcaFilter, setMarcaFilter] = useState<string[]>([])
  const [marcaSearch, setMarcaSearch] = useState('')
  const [modeloFilter, setModeloFilter] = useState<string[]>([])
  const [modeloSearch, setModeloSearch] = useState('')
  const [estadoFilter, setEstadoFilter] = useState<string[]>([])
  const [openColumnFilter, setOpenColumnFilter] = useState<string | null>(null)
  const [activeStatCard, setActiveStatCard] = useState<string | null>(null)

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
    tipo_vehiculo: 'Auto',
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
    setStatsLoading(true)
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

      // Vehículos disponibles en cochera (solo PKG_ON_BASE - listos para usar)
      let vehiculosDisponibles = 0
      const disponibleId = estadoIdMap.get('PKG_ON_BASE')
      if (disponibleId) {
        const { count } = await supabase
          .from('vehiculos')
          .select('*', { count: 'exact', head: true })
          .eq('estado_id', disponibleId)
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

      // Vehículos en taller mecánico
      let vehiculosTallerMecanico = 0
      const tallerMecanicoIds = [
        estadoIdMap.get('TALLER_AXIS'),
        estadoIdMap.get('TALLER_ALLIANCE'),
        estadoIdMap.get('TALLER_KALZALO'),
        estadoIdMap.get('TALLER_BASE_VALIENTE'),
        estadoIdMap.get('INSTALACION_GNC')
      ].filter(Boolean) as string[]
      if (tallerMecanicoIds.length > 0) {
        const { count } = await supabase
          .from('vehiculos')
          .select('*', { count: 'exact', head: true })
          .in('estado_id', tallerMecanicoIds)
        vehiculosTallerMecanico = count || 0
      }

      // Vehículos en taller chapa y pintura
      let vehiculosChapaPintura = 0
      const chapaPinturaId = estadoIdMap.get('TALLER_CHAPA_PINTURA')
      if (chapaPinturaId) {
        const { count } = await supabase
          .from('vehiculos')
          .select('*', { count: 'exact', head: true })
          .eq('estado_id', chapaPinturaId)
        vehiculosChapaPintura = count || 0
      }

      // Vehículos corporativos
      let vehiculosCorporativos = 0
      const corporativoId = estadoIdMap.get('CORPORATIVO')
      if (corporativoId) {
        const { count } = await supabase
          .from('vehiculos')
          .select('*', { count: 'exact', head: true })
          .eq('estado_id', corporativoId)
        vehiculosCorporativos = count || 0
      }

      setStatsData({
        totalVehiculos: totalVehiculos || 0,
        vehiculosDisponibles,
        vehiculosEnUso,
        vehiculosTallerMecanico,
        vehiculosChapaPintura,
        vehiculosCorporativos,
      })
    } catch (err) {
      console.error('Error loading stats:', err)
    } finally {
      setStatsLoading(false)
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
      tipo_vehiculo: 'Auto',
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

  // Manejar click en stat cards para filtrar
  const handleStatCardClick = (cardType: string) => {
    // Limpiar filtros de columna
    setPatenteFilter([])
    setPatenteSearch('')
    setMarcaFilter([])
    setMarcaSearch('')
    setModeloFilter([])
    setModeloSearch('')

    // Si hace click en el mismo, desactivar
    if (activeStatCard === cardType) {
      setActiveStatCard(null)
      setEstadoFilter([])
      return
    }

    setActiveStatCard(cardType)

    // Definir estados para cada categoría
    const estadosEnCochera = ['PKG_ON_BASE'] // Solo disponibles (listos para usar)
    const estadosEnUso = ['EN_USO']
    const estadosTallerMecanico = ['TALLER_AXIS', 'TALLER_ALLIANCE', 'TALLER_KALZALO', 'TALLER_BASE_VALIENTE', 'INSTALACION_GNC']
    const estadosChapaPintura = ['TALLER_CHAPA_PINTURA']
    const estadosCorporativos = ['CORPORATIVO']

    switch (cardType) {
      case 'total':
        setEstadoFilter([])
        break
      case 'enCochera':
        setEstadoFilter(estadosEnCochera)
        break
      case 'enUso':
        setEstadoFilter(estadosEnUso)
        break
      case 'tallerMecanico':
        setEstadoFilter(estadosTallerMecanico)
        break
      case 'chapaPintura':
        setEstadoFilter(estadosChapaPintura)
        break
      case 'corporativos':
        setEstadoFilter(estadosCorporativos)
        break
      default:
        setEstadoFilter([])
    }
  }

  // Extraer marcas y modelos únicos para autocomplete
  const marcasExistentes = useMemo(() => {
    const marcas = new Set<string>()
    vehiculos.forEach(v => {
      if (v.marca) marcas.add(v.marca)
    })
    return Array.from(marcas).sort()
  }, [vehiculos])

  const modelosExistentes = useMemo(() => {
    const modelos = new Set<string>()
    vehiculos.forEach(v => {
      if (v.modelo) modelos.add(v.modelo)
    })
    return Array.from(modelos).sort()
  }, [vehiculos])

  // Valores únicos para filtros tipo Excel
  const patentesUnicas = useMemo(() => {
    const patentes = vehiculos.map(v => v.patente).filter(Boolean) as string[]
    return [...new Set(patentes)].sort()
  }, [vehiculos])

  // Opciones filtradas por búsqueda
  const patentesFiltradas = useMemo(() => {
    if (!patenteSearch) return patentesUnicas
    return patentesUnicas.filter(p => p.toLowerCase().includes(patenteSearch.toLowerCase()))
  }, [patentesUnicas, patenteSearch])

  const marcasFiltradas = useMemo(() => {
    if (!marcaSearch) return marcasExistentes
    return marcasExistentes.filter(m => m.toLowerCase().includes(marcaSearch.toLowerCase()))
  }, [marcasExistentes, marcaSearch])

  const modelosFiltrados = useMemo(() => {
    if (!modeloSearch) return modelosExistentes
    return modelosExistentes.filter(m => m.toLowerCase().includes(modeloSearch.toLowerCase()))
  }, [modelosExistentes, modeloSearch])

  // Toggle functions para multiselect
  const togglePatenteFilter = (patente: string) => {
    setPatenteFilter(prev =>
      prev.includes(patente) ? prev.filter(p => p !== patente) : [...prev, patente]
    )
  }

  const toggleMarcaFilter = (marca: string) => {
    setMarcaFilter(prev =>
      prev.includes(marca) ? prev.filter(m => m !== marca) : [...prev, marca]
    )
  }

  const toggleModeloFilter = (modelo: string) => {
    setModeloFilter(prev =>
      prev.includes(modelo) ? prev.filter(m => m !== modelo) : [...prev, modelo]
    )
  }

  // Filtrar vehículos según los filtros de columna (multiselect tipo Excel)
  const filteredVehiculos = useMemo(() => {
    let result = vehiculos

    if (patenteFilter.length > 0) {
      result = result.filter(v =>
        patenteFilter.includes(v.patente || '')
      )
    }

    if (marcaFilter.length > 0) {
      result = result.filter(v =>
        marcaFilter.includes(v.marca || '')
      )
    }

    if (modeloFilter.length > 0) {
      result = result.filter(v =>
        modeloFilter.includes(v.modelo || '')
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
            <span>Patente {patenteFilter.length > 0 && `(${patenteFilter.length})`}</span>
            <button
              className={`dt-column-filter-btn ${patenteFilter.length > 0 ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                setOpenColumnFilter(openColumnFilter === 'patente' ? null : 'patente')
              }}
              title="Filtrar por patente"
            >
              <Filter size={12} />
            </button>
            {openColumnFilter === 'patente' && (
              <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
                <input
                  type="text"
                  placeholder="Buscar..."
                  value={patenteSearch}
                  onChange={(e) => setPatenteSearch(e.target.value)}
                  className="dt-column-filter-input"
                  autoFocus
                />
                <div className="dt-excel-filter-list">
                  {patentesFiltradas.length === 0 ? (
                    <div className="dt-excel-filter-empty">Sin resultados</div>
                  ) : (
                    patentesFiltradas.slice(0, 50).map(patente => (
                      <label key={patente} className={`dt-column-filter-checkbox ${patenteFilter.includes(patente) ? 'selected' : ''}`}>
                        <input
                          type="checkbox"
                          checked={patenteFilter.includes(patente)}
                          onChange={() => togglePatenteFilter(patente)}
                        />
                        <span>{patente}</span>
                      </label>
                    ))
                  )}
                </div>
                {patenteFilter.length > 0 && (
                  <button
                    className="dt-column-filter-clear"
                    onClick={() => { setPatenteFilter([]); setPatenteSearch('') }}
                  >
                    Limpiar ({patenteFilter.length})
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
            <span>Marca {marcaFilter.length > 0 && `(${marcaFilter.length})`}</span>
            <button
              className={`dt-column-filter-btn ${marcaFilter.length > 0 ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                setOpenColumnFilter(openColumnFilter === 'marca' ? null : 'marca')
              }}
              title="Filtrar por marca"
            >
              <Filter size={12} />
            </button>
            {openColumnFilter === 'marca' && (
              <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
                <input
                  type="text"
                  placeholder="Buscar..."
                  value={marcaSearch}
                  onChange={(e) => setMarcaSearch(e.target.value)}
                  className="dt-column-filter-input"
                  autoFocus
                />
                <div className="dt-excel-filter-list">
                  {marcasFiltradas.length === 0 ? (
                    <div className="dt-excel-filter-empty">Sin resultados</div>
                  ) : (
                    marcasFiltradas.slice(0, 50).map(marca => (
                      <label key={marca} className={`dt-column-filter-checkbox ${marcaFilter.includes(marca) ? 'selected' : ''}`}>
                        <input
                          type="checkbox"
                          checked={marcaFilter.includes(marca)}
                          onChange={() => toggleMarcaFilter(marca)}
                        />
                        <span>{marca}</span>
                      </label>
                    ))
                  )}
                </div>
                {marcaFilter.length > 0 && (
                  <button
                    className="dt-column-filter-clear"
                    onClick={() => { setMarcaFilter([]); setMarcaSearch('') }}
                  >
                    Limpiar ({marcaFilter.length})
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
            <span>Modelo {modeloFilter.length > 0 && `(${modeloFilter.length})`}</span>
            <button
              className={`dt-column-filter-btn ${modeloFilter.length > 0 ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                setOpenColumnFilter(openColumnFilter === 'modelo' ? null : 'modelo')
              }}
              title="Filtrar por modelo"
            >
              <Filter size={12} />
            </button>
            {openColumnFilter === 'modelo' && (
              <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
                <input
                  type="text"
                  placeholder="Buscar..."
                  value={modeloSearch}
                  onChange={(e) => setModeloSearch(e.target.value)}
                  className="dt-column-filter-input"
                  autoFocus
                />
                <div className="dt-excel-filter-list">
                  {modelosFiltrados.length === 0 ? (
                    <div className="dt-excel-filter-empty">Sin resultados</div>
                  ) : (
                    modelosFiltrados.slice(0, 50).map(modelo => (
                      <label key={modelo} className={`dt-column-filter-checkbox ${modeloFilter.includes(modelo) ? 'selected' : ''}`}>
                        <input
                          type="checkbox"
                          checked={modeloFilter.includes(modelo)}
                          onChange={() => toggleModeloFilter(modelo)}
                        />
                        <span>{modelo}</span>
                      </label>
                    ))
                  )}
                </div>
                {modeloFilter.length > 0 && (
                  <button
                    className="dt-column-filter-clear"
                    onClick={() => { setModeloFilter([]); setModeloSearch('') }}
                  >
                    Limpiar ({modeloFilter.length})
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
      {/* Stats Cards - Clickeables para filtrar */}
      <div className="veh-stats">
        <div className="veh-stats-grid">
          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'total' ? 'stat-card-active' : ''}`}
            onClick={() => !statsLoading && handleStatCardClick('total')}
            title="Click para ver todos"
          >
            <Car size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">
                {statsLoading ? <Loader2 size={20} className="stat-spinner" /> : statsData.totalVehiculos}
              </span>
              <span className="stat-label">Total</span>
            </div>
          </div>
          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'enCochera' ? 'stat-card-active' : ''}`}
            onClick={() => !statsLoading && handleStatCardClick('enCochera')}
            title="Click para filtrar: PKG ON + PKG OFF"
          >
            <Warehouse size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">
                {statsLoading ? <Loader2 size={20} className="stat-spinner" /> : statsData.vehiculosDisponibles}
              </span>
              <span className="stat-label">Disponible</span>
            </div>
          </div>
          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'enUso' ? 'stat-card-active' : ''}`}
            onClick={() => !statsLoading && handleStatCardClick('enUso')}
            title="Click para filtrar: EN USO"
          >
            <Car size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">
                {statsLoading ? <Loader2 size={20} className="stat-spinner" /> : statsData.vehiculosEnUso}
              </span>
              <span className="stat-label">En Uso</span>
            </div>
          </div>
          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'tallerMecanico' ? 'stat-card-active' : ''}`}
            onClick={() => !statsLoading && handleStatCardClick('tallerMecanico')}
            title="Click para filtrar: Talleres mecánicos"
          >
            <Wrench size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">
                {statsLoading ? <Loader2 size={20} className="stat-spinner" /> : statsData.vehiculosTallerMecanico}
              </span>
              <span className="stat-label">Taller Mecánico</span>
            </div>
          </div>
          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'chapaPintura' ? 'stat-card-active' : ''}`}
            onClick={() => !statsLoading && handleStatCardClick('chapaPintura')}
            title="Click para filtrar: Chapa y Pintura"
          >
            <PaintBucket size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">
                {statsLoading ? <Loader2 size={20} className="stat-spinner" /> : statsData.vehiculosChapaPintura}
              </span>
              <span className="stat-label">Chapa y Pintura</span>
            </div>
          </div>
          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'corporativos' ? 'stat-card-active' : ''}`}
            onClick={() => !statsLoading && handleStatCardClick('corporativos')}
            title="Click para filtrar: Corporativos"
          >
            <Briefcase size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">
                {statsLoading ? <Loader2 size={20} className="stat-spinner" /> : statsData.vehiculosCorporativos}
              </span>
              <span className="stat-label">Corporativos</span>
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
              marcasExistentes={marcasExistentes}
              modelosExistentes={modelosExistentes}
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
                  placeholder={marcasExistentes.length > 0 ? marcasExistentes.slice(0, 3).join(', ') + '...' : ''}
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
                  placeholder={modelosExistentes.length > 0 ? modelosExistentes.slice(0, 3).join(', ') + '...' : ''}
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

            <div className="section-title">Combustible y GPS</div>

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

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">GPS 1</label>
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
                <label className="form-label">GPS 2</label>
                <label style={{ display: 'flex', alignItems: 'center', height: '42px', cursor: 'pointer', gap: '8px' }}>
                  <input
                    type="checkbox"
                    checked={formData.gps_uss}
                    onChange={(e) => setFormData({ ...formData, gps_uss: e.target.checked })}
                    disabled={saving}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <span style={{ color: formData.gps_uss ? '#10B981' : 'var(--text-primary)' }}>
                    USS (Wialon)
                  </span>
                </label>
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
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '700px' }}>
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
            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            {/* Información Básica */}
            <div className="section-title">Información Básica</div>
            <div className="details-grid">
              <div>
                <label className="detail-label">PATENTE</label>
                <div className="patente-badge" style={{ display: 'inline-block' }}>{selectedVehiculo.patente}</div>
              </div>
              <div>
                <label className="detail-label">ESTADO</label>
                <div className="detail-value">{selectedVehiculo.vehiculos_estados?.descripcion || 'N/A'}</div>
              </div>
              <div>
                <label className="detail-label">MARCA</label>
                <div className="detail-value">{selectedVehiculo.marca || 'N/A'}</div>
              </div>
              <div>
                <label className="detail-label">MODELO</label>
                <div className="detail-value">{selectedVehiculo.modelo || 'N/A'}</div>
              </div>
              <div>
                <label className="detail-label">AÑO</label>
                <div className="detail-value">{selectedVehiculo.anio || 'N/A'}</div>
              </div>
              <div>
                <label className="detail-label">COLOR</label>
                <div className="detail-value">{selectedVehiculo.color || 'N/A'}</div>
              </div>
            </div>

            {/* Combustible y GPS */}
            <div className="section-title">Combustible y GPS</div>
            <div className="details-grid">
              <div>
                <label className="detail-label">TIPO COMBUSTIBLE</label>
                <div className="detail-value">{(selectedVehiculo as any).tipo_combustible || 'N/A'}</div>
              </div>
              <div>
                <label className="detail-label">GPS 1</label>
                <div className="detail-value">{(selectedVehiculo as any).tipo_gps || 'Sin GPS'}</div>
              </div>
              <div>
                <label className="detail-label">GPS 2 - USS (WIALON)</label>
                <div className="detail-value" style={{ color: (selectedVehiculo as any).gps_uss ? '#10B981' : 'inherit' }}>
                  {(selectedVehiculo as any).gps_uss ? 'Sí' : 'No'}
                </div>
              </div>
            </div>

            {/* Datos Técnicos */}
            <div className="section-title">Datos Técnicos</div>
            <div className="details-grid">
              <div>
                <label className="detail-label">NÚMERO MOTOR</label>
                <div className="detail-value">{selectedVehiculo.numero_motor || 'N/A'}</div>
              </div>
              <div>
                <label className="detail-label">NÚMERO CHASIS</label>
                <div className="detail-value">{selectedVehiculo.numero_chasis || 'N/A'}</div>
              </div>
              <div>
                <label className="detail-label">PROVISORIA</label>
                <div className="detail-value">{selectedVehiculo.provisoria || 'N/A'}</div>
              </div>
              <div>
                <label className="detail-label">KILOMETRAJE</label>
                <div className="detail-value">{selectedVehiculo.kilometraje_actual?.toLocaleString() || 0} km</div>
              </div>
            </div>

            {/* Fechas e Inspecciones */}
            <div className="section-title">Fechas e Inspecciones</div>
            <div className="details-grid">
              <div>
                <label className="detail-label">FECHA ADQUISICIÓN</label>
                <div className="detail-value">{selectedVehiculo.fecha_adquisicion ? new Date(selectedVehiculo.fecha_adquisicion).toLocaleDateString('es-AR') : 'N/A'}</div>
              </div>
              <div>
                <label className="detail-label">ÚLTIMA INSPECCIÓN</label>
                <div className="detail-value">{selectedVehiculo.fecha_ulti_inspeccion ? new Date(selectedVehiculo.fecha_ulti_inspeccion).toLocaleDateString('es-AR') : 'N/A'}</div>
              </div>
              <div>
                <label className="detail-label">PRÓXIMA INSPECCIÓN</label>
                <div className="detail-value">{selectedVehiculo.fecha_prox_inspeccion ? new Date(selectedVehiculo.fecha_prox_inspeccion).toLocaleDateString('es-AR') : 'N/A'}</div>
              </div>
            </div>

            {/* Seguro */}
            <div className="section-title">Seguro</div>
            <div className="details-grid">
              <div>
                <label className="detail-label">NÚMERO PÓLIZA</label>
                <div className="detail-value">{selectedVehiculo.seguro_numero || 'N/A'}</div>
              </div>
              <div>
                <label className="detail-label">VIGENCIA SEGURO</label>
                <div className="detail-value">{selectedVehiculo.seguro_vigencia ? new Date(selectedVehiculo.seguro_vigencia).toLocaleDateString('es-AR') : 'N/A'}</div>
              </div>
              <div>
                <label className="detail-label">TITULAR</label>
                <div className="detail-value">{selectedVehiculo.titular || 'N/A'}</div>
              </div>
            </div>

            {/* Notas */}
            {selectedVehiculo.notas && (
              <>
                <div className="section-title">Notas</div>
                <div className="detail-value" style={{ whiteSpace: 'pre-wrap' }}>{selectedVehiculo.notas}</div>
              </>
            )}

            {/* Registro */}
            <div className="section-title">Registro</div>
            <div className="details-grid">
              <div>
                <label className="detail-label">CREADO</label>
                <div className="detail-value">{new Date(selectedVehiculo.created_at).toLocaleString('es-AR')}</div>
              </div>
              <div>
                <label className="detail-label">ÚLTIMA ACTUALIZACIÓN</label>
                <div className="detail-value">{new Date(selectedVehiculo.updated_at).toLocaleString('es-AR')}</div>
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
