/* eslint-disable @typescript-eslint/no-explicit-any */
// src/modules/vehiculos/VehicleManagement.tsx
import { useState, useEffect, useMemo } from 'react'
import { AlertTriangle, Eye, Edit, Trash2, Info, Car, Wrench, Briefcase, PaintBucket, Warehouse, FolderOpen, FolderPlus, Loader2, Undo2 } from 'lucide-react'
import { ActionsMenu } from '../../components/ui/ActionsMenu'
import { DriveFilesModal } from '../../components/DriveFilesModal'
import { supabase } from '../../lib/supabase'
import { ExcelColumnFilter, useExcelFilters } from '../../components/ui/DataTable/ExcelColumnFilter'
import { usePermissions } from '../../contexts/PermissionsContext'
import { useAuth } from '../../contexts/AuthContext'
import Swal from 'sweetalert2'
import { showSuccess } from '../../utils/toast'
import type {
  VehiculoWithRelations,
  VehiculoEstado
} from '../../types/database.types'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../../components/ui/DataTable'
import { LoadingOverlay } from '../../components/ui/LoadingOverlay'
import { VehiculoWizard } from './components/VehiculoWizard'
import { formatDateTimeAR } from '../../utils/dateUtils'
import './VehicleManagement.css'

// Mapping de códigos de estado a etiquetas para mostrar en filtros y celdas
const ESTADO_LABELS: Record<string, string> = {
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
  'PROGRAMADO': 'Programado',
  'DEVUELTO_PROVEEDOR': 'Dev. Proveedor'
}


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
  const [creatingDriveFolder, setCreatingDriveFolder] = useState<string | null>(null)

  // Drive Files Modal
  const [showDriveModal, setShowDriveModal] = useState(false)
  const [driveFiles, setDriveFiles] = useState<Array<{
    id: string
    name: string
    mimeType: string
    size?: string
    modifiedTime: string
    webViewLink?: string
    thumbnailLink?: string
    iconLink?: string
  }>>([])
  const [loadingDriveFiles, setLoadingDriveFiles] = useState(false)
  const [driveModalTitle, setDriveModalTitle] = useState('')
  const [driveModalUrl, setDriveModalUrl] = useState('')

  // Stats calculados desde datos cargados (ver calculatedStats useMemo)

  // Removed TanStack Table states - now handled by DataTable component

  // Catalog states
  const [vehiculosEstados, setVehiculosEstados] = useState<VehiculoEstado[]>([])

  // Column filter states - Multiselect tipo Excel
  const [patenteFilter, setPatenteFilter] = useState<string[]>([])
  const [marcaFilter, setMarcaFilter] = useState<string[]>([])
  const [modeloFilter, setModeloFilter] = useState<string[]>([])
  const [estadoFilter, setEstadoFilter] = useState<string[]>([]) // Filtro de columna Estado
  const [activeStatCard, setActiveStatCard] = useState<string | null>(null)
  const [statCardEstadoFilter, setStatCardEstadoFilter] = useState<string[]>([]) // Filtro separado para stat cards

  // Excel filter hook for portal-based dropdowns
  const { openFilterId, setOpenFilterId } = useExcelFilters()

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
    notas: '',
    url_documentacion: ''
  })

  // ✅ OPTIMIZADO: Carga unificada en paralelo
  useEffect(() => {
    loadAllData()
  }, [])

  // ✅ OPTIMIZADO: Calcular stats desde datos ya cargados (elimina 6+ queries)
  const calculatedStats = useMemo(() => {
    // Estados a EXCLUIR del total
    const estadosExcluidos = ['ROBO', 'DESTRUCCION_TOTAL', 'JUBILADO', 'DEVUELTO_PROVEEDOR']
    // Estados de taller mecánico
    const estadosTallerMecanico = ['TALLER_AXIS', 'TALLER_ALLIANCE', 'TALLER_KALZALO', 'TALLER_BASE_VALIENTE', 'INSTALACION_GNC']

    let totalVehiculos = 0
    let vehiculosDisponibles = 0
    let vehiculosEnUso = 0
    let vehiculosTallerMecanico = 0
    let vehiculosChapaPintura = 0
    let vehiculosCorporativos = 0
    let vehiculosDevueltos = 0

    // UNA SOLA PASADA sobre los vehículos
    for (const v of vehiculos) {
      const estadoCodigo = (v as any).vehiculos_estados?.codigo || ''

      // Excluir del total
      if (!estadosExcluidos.includes(estadoCodigo)) {
        totalVehiculos++
      }

      // Contar por estado
      if (estadoCodigo === 'PKG_ON_BASE') {
        vehiculosDisponibles++
      } else if (estadoCodigo === 'EN_USO') {
        vehiculosEnUso++
      } else if (estadosTallerMecanico.includes(estadoCodigo)) {
        vehiculosTallerMecanico++
      } else if (estadoCodigo === 'TALLER_CHAPA_PINTURA') {
        vehiculosChapaPintura++
      } else if (estadoCodigo === 'CORPORATIVO') {
        vehiculosCorporativos++
      } else if (estadoCodigo === 'DEVUELTO_PROVEEDOR') {
        vehiculosDevueltos++
      }
    }

    return {
      totalVehiculos,
      vehiculosDisponibles,
      vehiculosEnUso,
      vehiculosTallerMecanico,
      vehiculosChapaPintura,
      vehiculosCorporativos,
      vehiculosDevueltos,
    }
  }, [vehiculos])

  // ✅ OPTIMIZADO: Carga TODO en paralelo - SOLO campos necesarios para tabla
  const loadAllData = async () => {
    setLoading(true)
    setError('')

    try {
      const [vehiculosRes, estadosRes] = await Promise.all([
        supabase
          .from('vehiculos')
          .select(`
            id, patente, marca, modelo, anio, color, kilometraje_actual, estado_id, created_at,
            drive_folder_id, drive_folder_url,
            vehiculos_estados (id, codigo, descripcion)
          `)
          .order('created_at', { ascending: false }),
        supabase.from('vehiculos_estados').select('id, codigo, descripcion').order('descripcion')
      ])

      if (vehiculosRes.error) throw vehiculosRes.error
      if (estadosRes.data) setVehiculosEstados(estadosRes.data)

      if (vehiculosRes.data && vehiculosRes.data.length > 0) {
        // Ordenar: DISPONIBLE primero
        const sortedData = [...vehiculosRes.data].sort((a, b) => {
          const estadoA = (a as any).vehiculos_estados?.codigo || ''
          const estadoB = (b as any).vehiculos_estados?.codigo || ''
          if (estadoA === 'DISPONIBLE' && estadoB !== 'DISPONIBLE') return -1
          if (estadoB === 'DISPONIBLE' && estadoA !== 'DISPONIBLE') return 1
          return estadoA.localeCompare(estadoB)
        })
        setVehiculos(sortedData as VehiculoWithRelations[])
      } else {
        setVehiculos([])
      }
    } catch (err: any) {
      console.error('Error cargando datos:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ✅ Carga on-demand de detalles completos para modal
  const loadVehiculoDetails = async (vehiculoId: string) => {
    try {
      const { data, error } = await supabase
        .from('vehiculos')
        .select('*, vehiculos_estados (id, codigo, descripcion)')
        .eq('id', vehiculoId)
        .single()

      if (error) throw error
      if (data) {
        setSelectedVehiculo(data as VehiculoWithRelations)
        setShowDetailsModal(true)
      }
    } catch (err: any) {
      console.error('Error cargando detalles:', err)
    }
  }

  const loadVehiculos = async (silent = false) => {
    if (!silent) setLoading(true)
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
        confirmButtonColor: '#ff0033'
      })
      return
    }

    if (!formData.patente || !formData.marca || !formData.modelo) {
      Swal.fire({
        icon: 'warning',
        title: 'Campos requeridos',
        text: 'Complete todos los campos requeridos',
        confirmButtonColor: '#ff0033'
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

      showSuccess('Vehículo creado')
      setShowCreateModal(false)
      resetForm()
      await loadVehiculos(true)
    } catch (err: any) {
      console.error('Error creando vehículo:', err)
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.message,
        confirmButtonColor: '#ff0033'
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
        confirmButtonColor: '#ff0033'
      })
      return
    }

    if (!selectedVehiculo) return

    setSaving(true)
    try {
      // Estados que NO finalizan asignaciones (el vehículo sigue operativo con conductores)
      const estadosOperativos = ['EN_USO']

      // Verificar si el nuevo estado requiere finalizar asignaciones
      let nuevoEstadoCodigo = ''
      const estadoAnteriorCodigo = (selectedVehiculo as any).vehiculos_estados?.codigo || ''
      
      if (formData.estado_id) {
        const estadoSeleccionado = vehiculosEstados.find((e: VehiculoEstado) => e.id === formData.estado_id)
        nuevoEstadoCodigo = estadoSeleccionado?.codigo || ''
      }

      // Si cambia DE "EN_USO" A otro estado, o cambia A "DEVUELTO_PROVEEDOR" desde cualquier estado → finalizar asignaciones
      const debeFinalizarAsignaciones =
        (estadoAnteriorCodigo === 'EN_USO' && !estadosOperativos.includes(nuevoEstadoCodigo)) ||
        nuevoEstadoCodigo === 'DEVUELTO_PROVEEDOR'

      // Si cambia a un estado que finaliza asignaciones, verificar si hay asignaciones activas
      if (debeFinalizarAsignaciones) {
        const { data: asignacionesActivas } = await (supabase as any)
          .from('asignaciones')
          .select('id, codigo')
          .eq('vehiculo_id', selectedVehiculo.id)
          .in('estado', ['activa', 'programado'])

        if (asignacionesActivas && asignacionesActivas.length > 0) {
          // Pedir motivo de finalización
          const result = await Swal.fire({
            icon: 'warning',
            title: 'Vehículo con asignación activa',
            html: `Este vehículo tiene <b>${asignacionesActivas.length}</b> asignación(es) activa(s).<br><br>
                   Al cambiar el estado a <b>${ESTADO_LABELS[nuevoEstadoCodigo] || nuevoEstadoCodigo}</b>, se finalizarán automáticamente.<br><br>
                   <b>Ingrese el motivo de finalización:</b>`,
            input: 'textarea',
            inputPlaceholder: 'Ej: Vehículo ingresa a taller por revisión mecánica...',
            inputAttributes: {
              'aria-label': 'Motivo de finalización'
            },
            showCancelButton: true,
            confirmButtonText: 'Finalizar y continuar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#ff0033',
            inputValidator: (value) => {
              if (!value || value.trim().length < 5) {
                return 'Debe ingresar un motivo (mínimo 5 caracteres)'
              }
              return null
            }
          })

          if (!result.isConfirmed) {
            setSaving(false)
            return
          }

          const motivo = result.value || 'Sin motivo especificado'

          // Finalizar asignaciones activas
          const ahora = new Date().toISOString()
          
          // 1. Finalizar conductores de las asignaciones
          for (const asig of asignacionesActivas) {
            await (supabase as any)
              .from('asignaciones_conductores')
              .update({ 
                estado: 'completado', 
                fecha_fin: ahora 
              })
              .eq('asignacion_id', asig.id)
              .in('estado', ['asignado', 'activo'])
          }

          // 2. Finalizar las asignaciones
          await (supabase as any)
            .from('asignaciones')
            .update({ 
              estado: 'finalizada', 
              fecha_fin: ahora,
              notas: `[FINALIZADA] Cambio de estado a ${ESTADO_LABELS[nuevoEstadoCodigo] || nuevoEstadoCodigo}. Motivo: ${motivo}`,
              updated_by: profile?.full_name || 'Sistema'
            })
            .in('id', asignacionesActivas.map((a: any) => a.id))
        }
      }

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

      showSuccess('Vehículo actualizado', debeFinalizarAsignaciones ? 'Asignaciones finalizadas' : undefined)
      setShowEditModal(false)
      setSelectedVehiculo(null)
      resetForm()
      await loadVehiculos(true)
    } catch (err: any) {
      console.error('Error actualizando vehículo:', err)
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.message,
        confirmButtonColor: '#ff0033'
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
        confirmButtonColor: '#ff0033'
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

      showSuccess('Vehículo eliminado')
      setShowDeleteModal(false)
      setSelectedVehiculo(null)
      await loadVehiculos(true)
    } catch (err: any) {
      console.error('Error eliminando vehículo:', err)
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.message,
        confirmButtonColor: '#ff0033'
      })
    } finally {
      setSaving(false)
    }
  }

  const openEditModal = async (vehiculo: VehiculoWithRelations) => {
    try {
      // Cargar datos completos on-demand
      const { data, error } = await supabase
        .from('vehiculos')
        .select('*, vehiculos_estados (id, codigo, descripcion)')
        .eq('id', vehiculo.id)
        .single()

      if (error) throw error
      if (data) {
        const fullVehiculo = data as VehiculoWithRelations
        setSelectedVehiculo(fullVehiculo)
        setFormData({
          patente: fullVehiculo.patente,
          marca: fullVehiculo.marca || '',
          modelo: fullVehiculo.modelo || '',
          anio: fullVehiculo.anio || new Date().getFullYear(),
          color: fullVehiculo.color || '',
          tipo_vehiculo: (fullVehiculo as any).tipo_vehiculo || '',
          tipo_combustible: (fullVehiculo as any).tipo_combustible || '',
          tipo_gps: (fullVehiculo as any).tipo_gps || '',
          gps_uss: (fullVehiculo as any).gps_uss || false,
          numero_motor: fullVehiculo.numero_motor || '',
          numero_chasis: fullVehiculo.numero_chasis || '',
          provisoria: fullVehiculo.provisoria || '',
          estado_id: fullVehiculo.estado_id || '',
          kilometraje_actual: fullVehiculo.kilometraje_actual,
          fecha_adquisicion: fullVehiculo.fecha_adquisicion || '',
          fecha_ulti_inspeccion: fullVehiculo.fecha_ulti_inspeccion || '',
          fecha_prox_inspeccion: fullVehiculo.fecha_prox_inspeccion || '',
          seguro_numero: fullVehiculo.seguro_numero || '',
          seguro_vigencia: fullVehiculo.seguro_vigencia || '',
          titular: fullVehiculo.titular || '',
          notas: fullVehiculo.notas || '',
          url_documentacion: (fullVehiculo as any).url_documentacion || (fullVehiculo as any).documentos_urls || ''
        })
        setShowEditModal(true)
      }
    } catch (err: any) {
      console.error('Error cargando datos para edición:', err)
    }
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
      notas: '',
      url_documentacion: ''
    })
  }

  // Crear carpeta en Google Drive para vehículo
  const handleCreateDriveFolder = async (vehiculo: VehiculoWithRelations) => {
    setCreatingDriveFolder(vehiculo.id)
    try {
      const response = await fetch('/api/create-drive-folder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tipo: 'vehiculo',
          vehiculoId: vehiculo.id,
          vehiculoPatente: vehiculo.patente
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Error al crear carpeta')
      }

      // Guardar URL en la base de datos
      await (supabase as any)
        .from('vehiculos')
        .update({ drive_folder_url: result.folderUrl })
        .eq('id', vehiculo.id)

      showSuccess('Carpeta creada', `Se creó "${result.folderName}" en Drive`)

      // Recargar datos para mostrar el nuevo link (silencioso)
      await loadVehiculos(true)

      // Abrir la carpeta en nueva pestaña
      if (result.folderUrl) {
        window.open(result.folderUrl, '_blank')
      }
    } catch (err: any) {
      console.error('Error creando carpeta Drive:', err)
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.message || 'No se pudo crear la carpeta en Drive',
        confirmButtonColor: '#ff0033'
      })
    } finally {
      setCreatingDriveFolder(null)
    }
  }

  // Abrir modal con lista de archivos de Drive
  const handleOpenDriveFolder = async (vehiculo: VehiculoWithRelations) => {
    const driveUrl = (vehiculo as any).drive_folder_url
    if (!driveUrl) return

    setDriveModalTitle(`Documentos - ${vehiculo.patente}`)
    setDriveModalUrl(driveUrl)
    setShowDriveModal(true)
    setLoadingDriveFiles(true)
    setDriveFiles([])

    try {
      const response = await fetch('/api/list-drive-files', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ folderUrl: driveUrl })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Error al listar archivos')
      }

      setDriveFiles(result.files || [])
    } catch (err: any) {
      console.error('Error listando archivos Drive:', err)
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.message || 'No se pudieron cargar los archivos',
        confirmButtonColor: '#ff0033'
      })
    } finally {
      setLoadingDriveFiles(false)
    }
  }

  // Manejar click en stat cards para filtrar
  // IMPORTANTE: NO limpiar filtros de columna - deben funcionar en conjunto con el stat card
  const handleStatCardClick = (cardType: string) => {
    // Si hace click en el mismo, desactivar solo el filtro de stat card
    if (activeStatCard === cardType) {
      setActiveStatCard(null)
      setStatCardEstadoFilter([]) // Solo limpiar el filtro del stat card, NO el de columna
      return
    }

    setActiveStatCard(cardType)

    // Definir estados para cada categoría (usando labels formateados)
    const estadosEnCochera = ['PKG ON'] // Solo disponibles (listos para usar)
    const estadosEnUso = ['En Uso']
    const estadosTallerMecanico = ['Taller Axis', 'Taller Alliance', 'Taller Kalzalo', 'Base Valiente', 'Inst. GNC']
    const estadosChapaPintura = ['Chapa&Pintura']
    const estadosCorporativos = ['Corporativo']
    const estadosDevueltos = ['Dev. Proveedor']

    // Usar statCardEstadoFilter para no interferir con el filtro de columna
    switch (cardType) {
      case 'total':
        setStatCardEstadoFilter([])
        break
      case 'enCochera':
        setStatCardEstadoFilter(estadosEnCochera)
        break
      case 'enUso':
        setStatCardEstadoFilter(estadosEnUso)
        break
      case 'tallerMecanico':
        setStatCardEstadoFilter(estadosTallerMecanico)
        break
      case 'chapaPintura':
        setStatCardEstadoFilter(estadosChapaPintura)
        break
      case 'corporativos':
        setStatCardEstadoFilter(estadosCorporativos)
        break
      case 'devueltos':
        setStatCardEstadoFilter(estadosDevueltos)
        break
      default:
        setStatCardEstadoFilter([])
    }
  }

  // Generar filtros externos para mostrar en la barra de filtros del DataTable
  const externalFilters = useMemo(() => {
    const filters: Array<{ id: string; label: string; onClear: () => void }> = []

    // Stat card filter
    if (activeStatCard) {
      const labels: Record<string, string> = {
        total: 'Total Flota',
        enCochera: 'Disponibles',
        enUso: 'En Uso',
        tallerMecanico: 'Taller Mecánico',
        chapaPintura: 'Chapa y Pintura',
        corporativos: 'Corporativos',
        devueltos: 'Dev. Proveedor'
      }
      filters.push({
        id: 'statCard',
        label: labels[activeStatCard] || activeStatCard,
        onClear: () => {
          setActiveStatCard(null)
          setStatCardEstadoFilter([])
        }
      })
    }

    // Column filters
    if (patenteFilter.length > 0) {
      filters.push({
        id: 'patente',
        label: `Patente: ${patenteFilter.length === 1 ? patenteFilter[0] : `${patenteFilter.length} seleccionados`}`,
        onClear: () => setPatenteFilter([])
      })
    }
    if (marcaFilter.length > 0) {
      filters.push({
        id: 'marca',
        label: `Marca: ${marcaFilter.length === 1 ? marcaFilter[0] : `${marcaFilter.length} seleccionados`}`,
        onClear: () => setMarcaFilter([])
      })
    }
    if (modeloFilter.length > 0) {
      filters.push({
        id: 'modelo',
        label: `Modelo: ${modeloFilter.length === 1 ? modeloFilter[0] : `${modeloFilter.length} seleccionados`}`,
        onClear: () => setModeloFilter([])
      })
    }
    if (estadoFilter.length > 0) {
      filters.push({
        id: 'estado',
        label: `Estado: ${estadoFilter.length === 1 ? estadoFilter[0] : `${estadoFilter.length} seleccionados`}`,
        onClear: () => setEstadoFilter([])
      })
    }

    return filters
  }, [activeStatCard, patenteFilter, marcaFilter, modeloFilter, estadoFilter])

  // Limpiar todos los filtros
  const handleClearAllFilters = () => {
    setActiveStatCard(null)
    setStatCardEstadoFilter([])
    setPatenteFilter([])
    setMarcaFilter([])
    setModeloFilter([])
    setEstadoFilter([])
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

  // Mostrar labels formateados en el filtro (en vez de códigos como EN_USO)
  const estadosUnicos = useMemo(() => {
    return vehiculosEstados.map(e => ESTADO_LABELS[e.codigo] || e.codigo).sort()
  }, [vehiculosEstados])

  // Filtrar vehículos según los filtros de columna (multiselect tipo Excel) Y stat cards
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

    // Filtro de columna Estado (desde ExcelColumnFilter)
    if (estadoFilter.length > 0) {
      result = result.filter(v => {
        const estadoCodigo = v.vehiculos_estados?.codigo || ''
        const estadoLabel = ESTADO_LABELS[estadoCodigo] || estadoCodigo
        return estadoFilter.includes(estadoLabel) || estadoFilter.includes(estadoCodigo)
      })
    }

    // Filtro de Stat Card (ADICIONAL al filtro de columna)
    if (statCardEstadoFilter.length > 0) {
      result = result.filter(v => {
        const estadoCodigo = v.vehiculos_estados?.codigo || ''
        const estadoLabel = ESTADO_LABELS[estadoCodigo] || estadoCodigo
        return statCardEstadoFilter.includes(estadoLabel) || statCardEstadoFilter.includes(estadoCodigo)
      })
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
  }, [vehiculos, patenteFilter, marcaFilter, modeloFilter, estadoFilter, statCardEstadoFilter])


  // Definir columnas para TanStack Table
  const columns = useMemo<ColumnDef<VehiculoWithRelations>[]>(
    () => [
      {
        accessorKey: 'patente',
        header: () => (
          <ExcelColumnFilter
            label="Patente"
            options={patentesUnicas}
            selectedValues={patenteFilter}
            onSelectionChange={setPatenteFilter}
            filterId="patente"
            openFilterId={openFilterId}
            onOpenChange={setOpenFilterId}
          />
        ),
        cell: ({ getValue }) => (
          <span className="patente-badge">{getValue() as string}</span>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'marca',
        header: () => (
          <ExcelColumnFilter
            label="Marca"
            options={marcasExistentes}
            selectedValues={marcaFilter}
            onSelectionChange={setMarcaFilter}
            filterId="marca"
            openFilterId={openFilterId}
            onOpenChange={setOpenFilterId}
          />
        ),
        cell: ({ getValue }) => <strong>{getValue() as string}</strong>,
        enableSorting: true,
      },
      {
        accessorKey: 'modelo',
        header: () => (
          <ExcelColumnFilter
            label="Modelo"
            options={modelosExistentes}
            selectedValues={modeloFilter}
            onSelectionChange={setModeloFilter}
            filterId="modelo"
            openFilterId={openFilterId}
            onOpenChange={setOpenFilterId}
          />
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
        accessorKey: 'color',
        header: 'Color',
        cell: ({ getValue }) => {
          const color = getValue() as string
          if (!color) return <span style={{ color: 'var(--text-tertiary)' }}>-</span>
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: color.toLowerCase() === 'blanco' ? '#f5f5f5' :
                              color.toLowerCase() === 'negro' ? '#1a1a1a' :
                              color.toLowerCase() === 'gris' ? '#808080' :
                              color.toLowerCase() === 'plata' ? '#c0c0c0' :
                              color.toLowerCase() === 'rojo' ? '#dc2626' :
                              color.toLowerCase() === 'azul' ? '#2563eb' :
                              color.toLowerCase() === 'verde' ? '#16a34a' :
                              color.toLowerCase() === 'amarillo' ? '#eab308' :
                              color.toLowerCase() === 'naranja' ? '#ea580c' :
                              color.toLowerCase() === 'marron' || color.toLowerCase() === 'marrón' ? '#78350f' :
                              color.toLowerCase() === 'beige' ? '#d4c4a8' :
                              '#9ca3af',
                  border: '1px solid var(--border-primary)',
                  flexShrink: 0
                }}
              />
              <span>{color}</span>
            </div>
          )
        },
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
          <ExcelColumnFilter
            label="Estado"
            options={estadosUnicos}
            selectedValues={estadoFilter}
            onSelectionChange={setEstadoFilter}
            filterId="estado"
            openFilterId={openFilterId}
            onOpenChange={setOpenFilterId}
          />
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
        cell: ({ row }) => {
          const driveUrl = (row.original as any).drive_folder_url
          const isCreatingFolder = creatingDriveFolder === row.original.id
          
          return (
            <ActionsMenu
              maxVisible={2}
              actions={[
                {
                  icon: <Eye size={15} />,
                  label: 'Ver detalles',
                  onClick: () => loadVehiculoDetails(row.original.id)
                },
                {
                  icon: <Edit size={15} />,
                  label: 'Editar',
                  onClick: () => openEditModal(row.original),
                  disabled: !canUpdate,
                  variant: 'info'
                },
                {
                  icon: driveUrl ? <FolderOpen size={15} /> : (isCreatingFolder ? <Loader2 size={15} className="animate-spin" /> : <FolderPlus size={15} />),
                  label: driveUrl ? 'Ver documentos' : 'Crear carpeta',
                  onClick: () => driveUrl ? handleOpenDriveFolder(row.original) : handleCreateDriveFolder(row.original),
                  disabled: isCreatingFolder,
                  variant: driveUrl ? 'success' : 'default'
                },
                {
                  icon: <Trash2 size={15} />,
                  label: 'Eliminar',
                  onClick: () => openDeleteModal(row.original),
                  disabled: !canDelete,
                  variant: 'danger'
                }
              ]}
            />
          )
        },
        enableSorting: false,
      },
    ],
    [canUpdate, canDelete, patenteFilter, marcaFilter, modeloFilter, estadoFilter, openFilterId, patentesUnicas, marcasExistentes, modelosExistentes, estadosUnicos, creatingDriveFolder]
  )

  return (
    <div className="veh-module">
      {/* Loading Overlay - bloquea toda la pantalla */}
      <LoadingOverlay show={loading} message="Cargando vehiculos..." size="lg" />

      {/* Stats Cards - Clickeables para filtrar */}
      <div className="veh-stats">
        <div className="veh-stats-grid">
          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'total' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatCardClick('total')}
            title="Click para ver todos"
          >
            <Car size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{calculatedStats.totalVehiculos}</span>
              <span className="stat-label">Total</span>
            </div>
          </div>
          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'enCochera' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatCardClick('enCochera')}
            title="Click para filtrar: PKG ON + PKG OFF"
          >
            <Warehouse size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{calculatedStats.vehiculosDisponibles}</span>
              <span className="stat-label">Disponible</span>
            </div>
          </div>
          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'enUso' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatCardClick('enUso')}
            title="Click para filtrar: EN USO"
          >
            <Car size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{calculatedStats.vehiculosEnUso}</span>
              <span className="stat-label">En Uso</span>
            </div>
          </div>
          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'tallerMecanico' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatCardClick('tallerMecanico')}
            title="Click para filtrar: Talleres mecánicos"
          >
            <Wrench size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{calculatedStats.vehiculosTallerMecanico}</span>
              <span className="stat-label">Taller Mecánico</span>
            </div>
          </div>
          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'chapaPintura' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatCardClick('chapaPintura')}
            title="Click para filtrar: Chapa y Pintura"
          >
            <PaintBucket size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{calculatedStats.vehiculosChapaPintura}</span>
              <span className="stat-label">Chapa y Pintura</span>
            </div>
          </div>
          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'corporativos' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatCardClick('corporativos')}
            title="Click para filtrar: Corporativos"
          >
            <Briefcase size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{calculatedStats.vehiculosCorporativos}</span>
              <span className="stat-label">Corporativos</span>
            </div>
          </div>
          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'devueltos' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatCardClick('devueltos')}
            title="Click para filtrar: Devueltos a Proveedor"
          >
            <Undo2 size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{calculatedStats.vehiculosDevueltos}</span>
              <span className="stat-label">Dev. Proveedor</span>
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
        externalFilters={externalFilters}
        onClearAllFilters={handleClearAllFilters}
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
                <div className="detail-value">{formatDateTimeAR(selectedVehiculo.created_at)}</div>
              </div>
              <div>
                <label className="detail-label">ÚLTIMA ACTUALIZACIÓN</label>
                <div className="detail-value">{formatDateTimeAR(selectedVehiculo.updated_at)}</div>
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
              <h2 style={{ color: '#ff0033' }}>Eliminar Vehículo</h2>
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
                style={{ background: '#ff0033' }}
              >
                {saving ? 'Eliminando...' : 'Sí, Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Drive Files */}
      <DriveFilesModal
        isOpen={showDriveModal}
        onClose={() => setShowDriveModal(false)}
        title={driveModalTitle}
        driveUrl={driveModalUrl}
        files={driveFiles}
        loading={loadingDriveFiles}
      />
    </div>
  )
}
