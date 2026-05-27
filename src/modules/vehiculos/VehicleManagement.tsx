 
// src/modules/vehiculos/VehicleManagement.tsx
import { useState, useEffect, useMemo, useRef } from 'react'
import { AlertTriangle, Eye, Edit, Trash2, Info, Car, Wrench, Briefcase, PaintBucket, Warehouse, FolderOpen, FolderPlus, Undo2, History, Fuel, CreditCard, Download } from 'lucide-react'
import * as XLSX from 'xlsx'
import { ActionsMenu } from '../../components/ui/ActionsMenu'
import { VerLogsButton } from '../../components/ui/VerLogsButton'

import { HistorialModal } from '../../components/ui/HistorialModal'
import { supabase } from '../../lib/supabase'
import { ExcelColumnFilter, useExcelFilters } from '../../components/ui/DataTable/ExcelColumnFilter'
import { usePermissions } from '../../contexts/PermissionsContext'
import { useAuth } from '../../contexts/AuthContext'
import { useSede } from '../../contexts/SedeContext'
import Swal from 'sweetalert2'
import { showSuccess } from '../../utils/toast'
import { registrarHistorialVehiculo, registrarHistorialConductor } from '../../services/historialService'
import type {
  VehiculoWithRelations,
  VehiculoEstado
} from '../../types/database.types'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../../components/ui/DataTable'
import { LoadingOverlay } from '../../components/ui/LoadingOverlay'
import { VehiculoWizard } from './components/VehiculoWizard'
import { SearchableSelect } from '../../components/ui/SearchableSelect/SearchableSelect'
import { formatDateTimeAR } from '../../utils/dateUtils'
import { VEHICULO_ESTADO_LABELS } from '../../types/vehiculo.types'
import './VehicleManagement.css'








export function VehicleManagement() {
  const { sedeActualId, aplicarFiltroSede } = useSede()
  const [vehiculos, setVehiculos] = useState<VehiculoWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showEditTitularDropdown, setShowEditTitularDropdown] = useState(false)
  const editTitularInputRef = useRef<HTMLInputElement>(null)
  const editTitularDropdownRef = useRef<HTMLDivElement>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedVehiculo, setSelectedVehiculo] = useState<VehiculoWithRelations | null>(null)
  const [lastAuditLog, setLastAuditLog] = useState<{ usuario_nombre: string | null; campos_modificados: string[] | null } | null>(null)

  const [historialVehiculo, setHistorialVehiculo] = useState<{ id: string; patente: string } | null>(null)
  const [sedes, setSedes] = useState<{ id: string; nombre: string }[]>([])
  const [titularesOptions, setTitularesOptions] = useState<{ id: string; tipo: 'persona' | 'empresa'; nombre: string }[]>([])

  // Modal de finalización de asignación al cambiar estado del vehículo
  const [showFinalizarModal, setShowFinalizarModal] = useState(false)
  const [finalizarData, setFinalizarData] = useState<{
    asignaciones: { id: string; codigo: string }[]
    conductores: { nombre: string; horario: string }[]
    nuevoEstadoCodigo: string
    fechaFinalizacion: string
    motivo: string
  } | null>(null)
  const finalizarResolveRef = useRef<((confirmed: boolean) => void) | null>(null)
  const finalizarDataRef = useRef(finalizarData)
  finalizarDataRef.current = finalizarData

  // Historial GNC / Telepase
  const [showHistorialModal, setShowHistorialModal] = useState<'gnc' | 'telepase' | null>(null)
  const [historialCambios, setHistorialCambios] = useState<{ accion: string; fecha: string; created_by_name: string; created_at: string }[]>([])
  const [loadingHistorial, setLoadingHistorial] = useState(false)

  // Stats calculados desde datos cargados (ver calculatedStats useMemo)

  // Removed TanStack Table states - now handled by DataTable component

  // Catalog states
  const [vehiculosEstados, setVehiculosEstados] = useState<VehiculoEstado[]>([])
  // Patentes que aparecen en uss_historico (ultimos 30 dias) - para badge GPS en columna km
  const [ussPatentes, setUssPatentes] = useState<Set<string>>(() => new Set())

  // Column filter states - Multiselect tipo Excel
  const [patenteFilter, setPatenteFilter] = useState<string[]>([])
  const [marcaFilter, setMarcaFilter] = useState<string[]>([])
  const [modeloFilter, setModeloFilter] = useState<string[]>([])
  const [anioFilter, setAnioFilter] = useState<string[]>([])
  const [colorFilter, setColorFilter] = useState<string[]>([])
  const [kmFilter, setKmFilter] = useState<string[]>([])
  const [titularFilter, setTitularFilter] = useState<string[]>([])
  const [estadoFilter, setEstadoFilter] = useState<string[]>([]) // Filtro de columna Estado
  const [activeStatCard, setActiveStatCard] = useState<string | null>(null)
  const [statCardEstadoFilter, setStatCardEstadoFilter] = useState<string[]>([]) // Filtro separado para stat cards
  const [statCardExcludeMode, setStatCardExcludeMode] = useState(false) // true = excluir los estados del filtro en vez de incluir
  const [gncFilter, setGncFilter] = useState<string | null>(null) // 'sinGnc' | 'conGnc'
  const [telepaseFilter, setTelepaseFilter] = useState<string | null>(null) // 'propio' | 'toshify'
  // Búsqueda global del DataTable (controlada para poder reflejarla en el botón Exportar)
  const [globalSearch, setGlobalSearch] = useState('')

  // Excel filter hook for portal-based dropdowns
  const { openFilterId, setOpenFilterId } = useExcelFilters()

  const { canCreateInMenu, canEditInMenu, canDeleteInMenu, isAdmin } = usePermissions()
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
    gps_uss: '',
    gnc: false,
    telepase: false,
    numero_motor: '',
    numero_chasis: '',
    provisoria: '',
    estado_id: '',
    kilometraje_actual: 0,
    fecha_adquisicion: '',
    fecha_ulti_inspeccion: '',
    fecha_prox_inspeccion: '',
    cobertura: '',
    seguro_numero: '',
    seguro_vigencia: '',
    titular: '',
    tipo_titular: '' as 'persona' | 'empresa' | '',
    titular_id: '',
    notas: '',
    url_documentacion: '',
    sede_id: '',
    grupo_flota: '',
    cantidad_llaves: '',
    lugar_radicacion: '',
    vencimiento_seguro: '',
    vto_vtv_aplica: false,
    vto_vtv_fecha: '',
    vto_gnc_aplica: false,
    vto_gnc_fecha: '',
    vto_matafuego_aplica: false,
    vto_matafuego_fecha: ''
  })

  // ✅ OPTIMIZADO: Carga unificada en paralelo (recarga al cambiar sede)
  useEffect(() => {
    loadAllData()
  }, [sedeActualId])

  // Cerrar dropdown titular edición al clic fuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        editTitularDropdownRef.current && !editTitularDropdownRef.current.contains(e.target as Node) &&
        editTitularInputRef.current && !editTitularInputRef.current.contains(e.target as Node)
      ) {
        setShowEditTitularDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Filtrar titulares para edición
  const editFilteredTitulares = useMemo(() => {
    if (!formData.tipo_titular) return []
    return titularesOptions
      .filter(t => t.tipo === formData.tipo_titular)
      .filter(t => {
        const search = formData.titular.trim().toUpperCase()
        if (!search) return true
        return t.nombre.toUpperCase().includes(search)
      })
  }, [formData.tipo_titular, formData.titular, titularesOptions])

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
    let vehiculosSinGnc = 0
    let vehiculosConGnc = 0
    let vehiculosConTelepase = 0
    let vehiculosTelepaseToshify = 0

    // UNA SOLA PASADA sobre los vehículos
    for (const v of vehiculos) {
      const estadoCodigo = (v as any).vehiculos_estados?.codigo || ''

      // Excluir del total
      if (!estadosExcluidos.includes(estadoCodigo)) {
        totalVehiculos++
      }

      // Contar GNC (solo entre flota activa)
      if (!estadosExcluidos.includes(estadoCodigo)) {
        if ((v as any).gnc) {
          vehiculosConGnc++
        } else {
          vehiculosSinGnc++
        }
      }

      // Contar Telepase (solo entre flota activa)
      if (!estadosExcluidos.includes(estadoCodigo)) {
        if ((v as any).telepase) {
          vehiculosConTelepase++
        } else {
          vehiculosTelepaseToshify++
        }
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
      vehiculosSinGnc,
      vehiculosConGnc,
      vehiculosConTelepase,
      vehiculosTelepaseToshify,
    }
  }, [vehiculos])

  // ✅ OPTIMIZADO: Carga TODO en paralelo - SOLO campos necesarios para tabla
  const loadAllData = async () => {
    setLoading(true)
    setError('')

    try {
      const desde30d = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
      const [vehiculosRes, estadosRes, sedesRes, ussRes, titularesRes] = await Promise.all([
        aplicarFiltroSede(supabase
          .from('vehiculos')
          .select(`
            id, patente, marca, modelo, anio, color, kilometraje_actual, kilometraje_geotab, kilometraje_geotab_updated_at, estado_id, created_at,
            drive_folder_id, drive_folder_url, url_documentacion, gnc, telepase, titular, grupo_flota,
            cantidad_llaves, lugar_radicacion, vencimiento_seguro,
            vto_vtv_aplica, vto_vtv_fecha, vto_gnc_aplica, vto_gnc_fecha, vto_matafuego_aplica, vto_matafuego_fecha,
            vehiculos_estados (id, codigo, descripcion)
          `)
          .is('deleted_at', null))
          .order('created_at', { ascending: false }),
        supabase.from('vehiculos_estados').select('id, codigo, descripcion').order('descripcion'),
        supabase.from('sedes').select('id, nombre').order('nombre'),
        supabase.from('uss_historico').select('patente').gte('fecha_hora_inicio_gmt3', desde30d),
        supabase.from('titulares').select('id, tipo, nombres, apellidos, razon_social').eq('estado', 'activo'),
      ])

      if (vehiculosRes.error) throw vehiculosRes.error
      if (estadosRes.data) setVehiculosEstados(estadosRes.data)
      if (sedesRes.data) setSedes(sedesRes.data)
      if (titularesRes?.data) {
        setTitularesOptions((titularesRes.data as any[]).map(t => ({
          id: t.id,
          tipo: t.tipo as 'persona' | 'empresa',
          nombre: t.tipo === 'empresa'
            ? (t.razon_social || '').toUpperCase()
            : [t.apellidos, t.nombres].filter(Boolean).join(' ').toUpperCase(),
        })))
      }
      if (ussRes.data) {
        const set = new Set<string>()
        for (const r of ussRes.data as { patente: string }[]) {
          set.add((r.patente || '').replace(/[\s\-.%]/g, '').toUpperCase())
        }
        setUssPatentes(set)
      }

      if (!vehiculosRes.data || vehiculosRes.data.length === 0) {
        setVehiculos([])
      } else {
        // Ordenar: DISPONIBLE primero
        const sortedData = [...vehiculosRes.data].sort((a, b) => {
          const estadoA = (a as any).vehiculos_estados?.codigo || ''
          const estadoB = (b as any).vehiculos_estados?.codigo || ''
          if (estadoA === 'DISPONIBLE' && estadoB !== 'DISPONIBLE') return -1
          if (estadoB === 'DISPONIBLE' && estadoA !== 'DISPONIBLE') return 1
          return estadoA.localeCompare(estadoB)
        })
        setVehiculos(sortedData as VehiculoWithRelations[])
      }
    } catch (err: any) {
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
      if (!data) return

      setSelectedVehiculo(data as VehiculoWithRelations)

      // Traer último audit log de UPDATE para este vehículo
      const { data: auditData } = await supabase
        .from('audit_logs')
        .select('usuario_nombre, campos_modificados')
        .eq('tabla', 'vehiculos')
        .eq('registro_id', vehiculoId)
        .eq('accion', 'UPDATE')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      setLastAuditLog(auditData || null)

      setShowHistorialModal(null)
      setShowDetailsModal(true)
    } catch {
      // silently ignored
    }
  }

  const cargarHistorialCambios = async (tipo: 'gnc' | 'telepase') => {
    if (!selectedVehiculo) return
    setLoadingHistorial(true)
    setHistorialCambios([])
    const tabla = tipo === 'gnc' ? 'vehiculos_gnc_historial' : 'vehiculos_telepase_historial'
    const { data } = await (supabase.from(tabla) as any)
      .select('accion, fecha, created_by_name, created_at')
      .eq('vehiculo_id', selectedVehiculo.id)
      .order('fecha', { ascending: false })
    setHistorialCambios(data || [])
    setLoadingHistorial(false)
    setShowHistorialModal(tipo)
  }

  const loadVehiculos = async (silent = false) => {
    if (!silent) setLoading(true)
    setError('')

    try {
      // ✅ OPTIMIZADO: Una sola query con JOIN (51 queries → 1 query)
      const { data, error: fetchError } = await aplicarFiltroSede(supabase
        .from('vehiculos')
        .select(`
          *,
          vehiculos_estados (
            id,
            codigo,
            descripcion
          )
        `)
        .is('deleted_at', null))
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError

      // Los datos ya vienen con las relaciones, no necesitamos hacer más queries
      if (!data || data.length === 0) {
        setVehiculos([])
      } else {
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
      }
    } catch (err: any) {
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

    if (!formData.patente || !formData.marca || !formData.modelo || !formData.sede_id || !formData.tipo_titular || !formData.titular?.trim() || !formData.cobertura?.trim() || !formData.lugar_radicacion?.trim()) {
      Swal.fire({
        icon: 'warning',
        title: 'Campos requeridos',
        text: 'Complete todos los campos requeridos: Patente, Marca, Modelo, Sede, Tipo de Titular, Titular, Cobertura y Lugar de Radicación',
        confirmButtonColor: '#ff0033'
      })
      return
    }

    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()

      // Verificar si existe una patente soft-deleted con la misma patente
      const { data: vehiculoEliminado } = await (supabase as any)
        .from('vehiculos')
        .select('id, patente, marca, modelo, deleted_at')
        .eq('patente', formData.patente.toUpperCase())
        .not('deleted_at', 'is', null)
        .maybeSingle()

      if (vehiculoEliminado) {
        setSaving(false)
        const resultado = await Swal.fire({
          icon: 'warning',
          title: 'Patente encontrada',
          html: `
            <p>La patente <strong>${formData.patente.toUpperCase()}</strong> fue eliminada anteriormente.</p>
            <div style="text-align:left; padding:12px; background:#f9fafb; border-radius:8px; margin-top:12px;">
              <p style="margin:4px 0;"><strong>Marca:</strong> ${vehiculoEliminado.marca || '-'}</p>
              <p style="margin:4px 0;"><strong>Modelo:</strong> ${vehiculoEliminado.modelo || '-'}</p>
              <p style="margin:4px 0;"><strong>Eliminado el:</strong> ${new Date(vehiculoEliminado.deleted_at).toLocaleDateString('es-AR')}</p>
            </div>
            <p style="margin-top:12px;">¿Desea restaurar este vehículo y actualizar sus datos con los que ingresó?</p>
          `,
          showCancelButton: true,
          confirmButtonText: 'Restaurar y actualizar',
          cancelButtonText: 'Cancelar',
          confirmButtonColor: '#16a34a',
        })

        if (!resultado.isConfirmed) return
        setSaving(true)

        // Restaurar: quitar deleted_at y actualizar con los nuevos datos
        const defaultEstadoIdRestore = vehiculosEstados.find((e: VehiculoEstado) => e.codigo === 'PKG_ON_BASE')?.id || null
        const { error: restoreError } = await supabase
          .from('vehiculos')
          .update({
            deleted_at: null,
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
            estado_id: formData.estado_id || defaultEstadoIdRestore,
            kilometraje_actual: formData.kilometraje_actual,
            fecha_adquisicion: formData.fecha_adquisicion || null,
            fecha_ulti_inspeccion: formData.fecha_ulti_inspeccion || null,
            fecha_prox_inspeccion: formData.fecha_prox_inspeccion || null,
            cobertura: formData.cobertura || null,
            seguro_numero: formData.seguro_numero || null,
            seguro_vigencia: formData.seguro_vigencia || null,
            titular: formData.titular || null,
            notas: formData.notas || null,
            gnc: formData.gnc || false,
            telepase: formData.telepase || false,
            url_documentacion: formData.url_documentacion || null,
            sede_id: formData.sede_id,
            grupo_flota: formData.grupo_flota || null,
            cantidad_llaves: formData.cantidad_llaves ? Number(formData.cantidad_llaves) : null,
            lugar_radicacion: formData.lugar_radicacion || null,
            vencimiento_seguro: formData.vencimiento_seguro || null,
            vto_vtv_aplica: formData.vto_vtv_aplica,
            vto_vtv_fecha: formData.vto_vtv_aplica && formData.vto_vtv_fecha ? formData.vto_vtv_fecha : null,
            vto_gnc_aplica: formData.vto_gnc_aplica,
            vto_gnc_fecha: formData.vto_gnc_aplica && formData.vto_gnc_fecha ? formData.vto_gnc_fecha : null,
            vto_matafuego_aplica: formData.vto_matafuego_aplica,
            vto_matafuego_fecha: formData.vto_matafuego_aplica && formData.vto_matafuego_fecha ? formData.vto_matafuego_fecha : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', vehiculoEliminado.id)

        if (restoreError) throw restoreError

        // Crear relación titular para vehículo restaurado
        if (formData.titular.trim() && formData.tipo_titular) {
          let titularId = formData.titular_id
          if (!titularId) {
            const titularNombre = formData.titular.trim().toUpperCase()
            const nuevoTitular: Record<string, any> = {
              tipo: formData.tipo_titular,
              dni_cuit: '',
              estado: 'activo',
              sede_id: formData.sede_id || null,
              created_by: user?.id,
              created_by_name: profile?.full_name || 'Sistema',
            }
            if (formData.tipo_titular === 'empresa') {
              nuevoTitular.razon_social = titularNombre
            } else {
              const partes = titularNombre.split(/\s+/)
              if (partes.length >= 2) {
                nuevoTitular.apellidos = partes[partes.length - 1]
                nuevoTitular.nombres = partes.slice(0, -1).join(' ')
              } else {
                nuevoTitular.nombres = titularNombre
                nuevoTitular.apellidos = ''
              }
            }
            const { data: titularCreado } = await supabase.from('titulares').insert([nuevoTitular]).select('id').single()
            if (titularCreado) titularId = titularCreado.id
          }
          if (titularId) {
            const hoy = new Date().toISOString().split('T')[0]
            // Desactivar titulares anteriores de este vehículo
            await supabase.from('vehiculos_titulares').update({ activo: false, fecha_hasta: hoy }).eq('vehiculo_id', vehiculoEliminado.id).eq('activo', true)
            await supabase.from('vehiculos_titulares').insert([{
              vehiculo_id: vehiculoEliminado.id,
              titular_id: titularId,
              fecha_desde: hoy,
              activo: true,
              created_by: user?.id,
              created_by_name: profile?.full_name || 'Sistema',
            }])
          }
        }

        showSuccess('Vehículo restaurado', 'El vehículo fue restaurado y sus datos actualizados.')
        setShowCreateModal(false)
        resetForm()
        await loadVehiculos(true)
        return
      }

      // Estado por defecto: PKG_ON_BASE si no se seleccionó otro
      const defaultEstadoId = vehiculosEstados.find((e: VehiculoEstado) => e.codigo === 'PKG_ON_BASE')?.id || null

      const { error: insertError} = await supabase
        .from('vehiculos')
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
          estado_id: formData.estado_id || defaultEstadoId,
          kilometraje_actual: formData.kilometraje_actual,
          fecha_adquisicion: formData.fecha_adquisicion || null,
          fecha_ulti_inspeccion: formData.fecha_ulti_inspeccion || null,
          fecha_prox_inspeccion: formData.fecha_prox_inspeccion || null,
          cobertura: formData.cobertura || null,
          seguro_numero: formData.seguro_numero || null,
          seguro_vigencia: formData.seguro_vigencia || null,
          titular: formData.titular || null,
          notas: formData.notas || null,
          gnc: formData.gnc || false,
          telepase: formData.telepase || false,
          url_documentacion: formData.url_documentacion || null,
          created_by: user?.id,
          created_by_name: profile?.full_name || 'Sistema',
          sede_id: formData.sede_id,
          grupo_flota: formData.grupo_flota || null,
          cantidad_llaves: formData.cantidad_llaves ? Number(formData.cantidad_llaves) : null,
          lugar_radicacion: formData.lugar_radicacion || null,
          vencimiento_seguro: formData.vencimiento_seguro || null,
          vto_vtv_aplica: formData.vto_vtv_aplica,
          vto_vtv_fecha: formData.vto_vtv_aplica && formData.vto_vtv_fecha ? formData.vto_vtv_fecha : null,
          vto_gnc_aplica: formData.vto_gnc_aplica,
          vto_gnc_fecha: formData.vto_gnc_aplica && formData.vto_gnc_fecha ? formData.vto_gnc_fecha : null,
          vto_matafuego_aplica: formData.vto_matafuego_aplica,
          vto_matafuego_fecha: formData.vto_matafuego_aplica && formData.vto_matafuego_fecha ? formData.vto_matafuego_fecha : null,
        }])

      if (insertError) throw insertError

      // Registrar historial: vehículo creado con estado inicial
      const estadoInicial = vehiculosEstados.find((e: VehiculoEstado) => e.id === formData.estado_id)
      // Obtener el ID del vehículo recién creado
      const { data: vehiculoCreado } = await (supabase as any)
        .from('vehiculos')
        .select('id')
        .eq('patente', formData.patente.toUpperCase())
        .single()

      if (vehiculoCreado) {
        // Si se crea con GNC, registrar en historial
        if (formData.gnc) {
          const hoy = new Date().toISOString().split('T')[0]
          await (supabase.from('vehiculos_gnc_historial') as any).insert({
            vehiculo_id: vehiculoCreado.id,
            accion: 'instalacion',
            fecha: hoy,
            created_by: profile?.id,
            created_by_name: profile?.full_name || 'Sistema',
          })
        }

        // Crear relación titular
        if (formData.titular.trim() && formData.tipo_titular) {
          let titularId = formData.titular_id

          // Si no se seleccionó un titular existente, crear uno nuevo
          if (!titularId) {
            const titularNombre = formData.titular.trim().toUpperCase()
            const nuevoTitular: Record<string, any> = {
              tipo: formData.tipo_titular,
              dni_cuit: '',
              estado: 'activo',
              sede_id: formData.sede_id || null,
              created_by: user?.id,
              created_by_name: profile?.full_name || 'Sistema',
            }

            if (formData.tipo_titular === 'empresa') {
              nuevoTitular.razon_social = titularNombre
            } else {
              // Partir nombre: última palabra = apellido, resto = nombres
              const partes = titularNombre.split(/\s+/)
              if (partes.length >= 2) {
                nuevoTitular.apellidos = partes[partes.length - 1]
                nuevoTitular.nombres = partes.slice(0, -1).join(' ')
              } else {
                nuevoTitular.nombres = titularNombre
                nuevoTitular.apellidos = ''
              }
            }

            const { data: titularCreado, error: titError } = await supabase
              .from('titulares')
              .insert([nuevoTitular])
              .select('id')
              .single()

            if (titError) {
              console.error('Error creando titular:', titError)
            } else if (titularCreado) {
              titularId = titularCreado.id
            }
          }

          // Crear relación vehiculo-titular
          if (titularId) {
            const hoy = new Date().toISOString().split('T')[0]
            await supabase.from('vehiculos_titulares').insert([{
              vehiculo_id: vehiculoCreado.id,
              titular_id: titularId,
              fecha_desde: hoy,
              activo: true,
              created_by: user?.id,
              created_by_name: profile?.full_name || 'Sistema',
            }])
          }
        }

        registrarHistorialVehiculo({
          vehiculoId: vehiculoCreado.id,
          tipoEvento: 'cambio_estado',
          estadoNuevo: estadoInicial?.codigo || 'SIN_ESTADO',
          detalles: { patente: formData.patente.toUpperCase(), accion: 'vehiculo_creado' },
          modulo: 'vehiculos',
          sedeId: formData.sede_id,
        })
      }

      showSuccess('Vehículo creado')
      setShowCreateModal(false)
      resetForm()
      await loadVehiculos(true)
    } catch (err: any) {
      const isDuplicatePatente =
        err?.code === '23505' ||
        (typeof err?.message === 'string' && err.message.includes('vehiculos_patente_key'))
      Swal.fire({
        icon: 'error',
        title: isDuplicatePatente ? 'Patente duplicada' : 'Error',
        text: isDuplicatePatente
          ? `Ya existe un vehículo registrado con la patente ${formData.patente.toUpperCase()}.`
          : err.message,
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

    const camposFaltantes: string[] = []
    if (!formData.patente?.trim()) camposFaltantes.push('Patente')
    if (!formData.marca?.trim()) camposFaltantes.push('Marca')
    if (!formData.modelo?.trim()) camposFaltantes.push('Modelo')
    if (!formData.anio) camposFaltantes.push('Año')
    if (!formData.color?.trim()) camposFaltantes.push('Color')
    if (!formData.tipo_vehiculo?.trim()) camposFaltantes.push('Tipo')
    if (!formData.numero_motor?.trim()) camposFaltantes.push('Número Motor')
    if (!formData.numero_chasis?.trim()) camposFaltantes.push('Número Chasis')
    if (!formData.cobertura?.trim()) camposFaltantes.push('Cobertura')
    if (!formData.lugar_radicacion?.trim()) camposFaltantes.push('Lugar de Radicación')
    if (!formData.tipo_titular) camposFaltantes.push('Tipo de Titular')
    if (!formData.titular?.trim()) camposFaltantes.push('Titular')

    if (camposFaltantes.length > 0) {
      Swal.fire({
        icon: 'warning',
        title: 'Campos requeridos',
        text: `Complete los siguientes campos obligatorios: ${camposFaltantes.join(', ')}`,
        confirmButtonColor: '#ff0033'
      })
      return
    }

    setSaving(true)
    try {
      // Estados que NO finalizan asignaciones (el vehículo sigue operativo con conductores)
      const estadosOperativos = ['EN_USO']

      // Verificar si el nuevo estado requiere finalizar asignaciones
      let nuevoEstadoCodigo = ''
      let motivoFinalizacion = ''
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
          // Obtener conductores afectados
          const asigIds = asignacionesActivas.map((a: any) => a.id)
          const { data: conductoresAfectados } = await (supabase as any)
            .from('asignaciones_conductores')
            .select('conductor_id, horario, conductores(nombre, apellido)')
            .in('asignacion_id', asigIds)
            .in('estado', ['asignado', 'activo'])

          const conductoresList = (conductoresAfectados || []).map((c: any) => ({
            nombre: `${c.conductores?.nombre || ''} ${c.conductores?.apellido || ''}`.trim(),
            horario: c.horario || 'N/A',
          }))

          // Mostrar modal de confirmación con fecha de finalización
          const hoy = new Date().toISOString().split('T')[0]
          setFinalizarData({
            asignaciones: asignacionesActivas,
            conductores: conductoresList,
            nuevoEstadoCodigo,
            fechaFinalizacion: hoy,
            motivo: '',
          })
          setShowFinalizarModal(true)

          // Esperar confirmación del usuario
          const confirmed = await new Promise<boolean>((resolve) => {
            finalizarResolveRef.current = resolve
          })

          const confirmedData = finalizarDataRef.current
          if (!confirmed || !confirmedData) {
            setSaving(false)
            return
          }

          motivoFinalizacion = confirmedData.motivo || 'Sin motivo especificado'
          const fechaFin = confirmedData.fechaFinalizacion
            ? new Date(confirmedData.fechaFinalizacion + 'T23:59:59-03:00').toISOString()
            : new Date().toISOString()

          // Finalizar asignaciones activas

          // 1. Finalizar conductores de las asignaciones
          for (const asig of asignacionesActivas) {
            await (supabase as any)
              .from('asignaciones_conductores')
              .update({
                estado: 'completado',
                fecha_fin: fechaFin
              })
              .eq('asignacion_id', asig.id)
              .in('estado', ['asignado', 'activo'])
          }

          // 2. Finalizar las asignaciones
          await (supabase as any)
            .from('asignaciones')
            .update({
              estado: 'finalizada',
              fecha_fin: fechaFin,
              notas: `[FINALIZADA] Cambio de estado a ${VEHICULO_ESTADO_LABELS[nuevoEstadoCodigo] || nuevoEstadoCodigo}. Motivo: ${motivoFinalizacion}`,
              updated_by: profile?.full_name || 'Sistema'
            })
            .in('id', asignacionesActivas.map((a: any) => a.id))
        }
      }

      const { error: updateError } = await supabase
        .from('vehiculos')
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
          cobertura: formData.cobertura || null,
          seguro_numero: formData.seguro_numero || null,
          seguro_vigencia: formData.seguro_vigencia || null,
          titular: formData.titular || null,
          notas: formData.notas || null,
          gnc: formData.gnc || false,
          telepase: formData.telepase || false,
          url_documentacion: formData.url_documentacion || null,
          sede_id: formData.sede_id || null,
          grupo_flota: formData.grupo_flota || null,
          cantidad_llaves: formData.cantidad_llaves ? Number(formData.cantidad_llaves) : null,
          lugar_radicacion: formData.lugar_radicacion || null,
          vencimiento_seguro: formData.vencimiento_seguro || null,
          vto_vtv_aplica: formData.vto_vtv_aplica,
          vto_vtv_fecha: formData.vto_vtv_aplica && formData.vto_vtv_fecha ? formData.vto_vtv_fecha : null,
          vto_gnc_aplica: formData.vto_gnc_aplica,
          vto_gnc_fecha: formData.vto_gnc_aplica && formData.vto_gnc_fecha ? formData.vto_gnc_fecha : null,
          vto_matafuego_aplica: formData.vto_matafuego_aplica,
          vto_matafuego_fecha: formData.vto_matafuego_aplica && formData.vto_matafuego_fecha ? formData.vto_matafuego_fecha : null,
          updated_at: new Date().toISOString(),
          updated_by: profile?.full_name || 'Sistema'
        })
        .eq('id', selectedVehiculo.id)

      if (updateError) throw updateError

      // Registrar historial GNC si cambió
      const gncAnterior = !!(selectedVehiculo as any).gnc
      const gncNuevo = formData.gnc || false
      if (gncAnterior !== gncNuevo) {
        const hoy = new Date().toISOString().split('T')[0]
        await (supabase.from('vehiculos_gnc_historial') as any).insert({
          vehiculo_id: selectedVehiculo.id,
          accion: gncNuevo ? 'instalacion' : 'desinstalacion',
          fecha: hoy,
          created_by: profile?.id,
          created_by_name: profile?.full_name || 'Sistema',
        })
      }

      // Registrar historial Telepase si cambió
      const telepaseAnterior = !!(selectedVehiculo as any).telepase
      const telepaseNuevo = formData.telepase || false
      if (telepaseAnterior !== telepaseNuevo) {
        const hoyTp = new Date().toISOString().split('T')[0]
        await (supabase.from('vehiculos_telepase_historial') as any).insert({
          vehiculo_id: selectedVehiculo.id,
          accion: telepaseNuevo ? 'activacion' : 'desactivacion',
          fecha: hoyTp,
          created_by: profile?.id,
          created_by_name: profile?.full_name || 'Sistema',
        })
      }

      // Registrar historial: cambio de estado del vehículo
      if (estadoAnteriorCodigo !== nuevoEstadoCodigo && nuevoEstadoCodigo) {
        registrarHistorialVehiculo({
          vehiculoId: selectedVehiculo.id,
          tipoEvento: 'cambio_estado',
          estadoAnterior: estadoAnteriorCodigo || null,
          estadoNuevo: nuevoEstadoCodigo,
          detalles: {
            patente: formData.patente.toUpperCase(),
            asignaciones_finalizadas: debeFinalizarAsignaciones,
          },
          modulo: 'vehiculos',
          sedeId: formData.sede_id,
        })
      }

      // Registrar historial para conductores cuyas asignaciones fueron finalizadas
      if (debeFinalizarAsignaciones) {
        const { data: asignacionesFinalizadas } = await (supabase as any)
          .from('asignaciones')
          .select('id, vehiculo_id, asignaciones_conductores(conductor_id)')
          .eq('vehiculo_id', selectedVehiculo.id)
          .eq('estado', 'finalizada')
          .eq('notas', `[FINALIZADA] Cambio de estado a ${VEHICULO_ESTADO_LABELS[nuevoEstadoCodigo] || nuevoEstadoCodigo}. Motivo: ${motivoFinalizacion}`)
        if (asignacionesFinalizadas) {
          for (const asig of asignacionesFinalizadas) {
            for (const ac of (asig.asignaciones_conductores || [])) {
              registrarHistorialConductor({
                conductorId: ac.conductor_id,
                tipoEvento: 'asignacion_completada',
                detalles: {
                  patente: formData.patente.toUpperCase(),
                  vehiculo_id: selectedVehiculo.id,
                  asignacion_id: asig.id,
                  motivo: `Vehículo cambió a ${nuevoEstadoCodigo}`,
                },
                modulo: 'vehiculos',
                sedeId: formData.sede_id,
              })
            }
          }
        }
      }

      // Manejar cambio de titular
      if (formData.titular.trim() && formData.tipo_titular) {
        const { data: { user } } = await supabase.auth.getUser()
        let titularId = formData.titular_id

        // Si no se seleccionó un titular existente, crear uno nuevo
        if (!titularId) {
          const titularNombre = formData.titular.trim().toUpperCase()
          const nuevoTitular: Record<string, any> = {
            tipo: formData.tipo_titular,
            dni_cuit: '',
            estado: 'activo',
            sede_id: formData.sede_id || null,
            created_by: user?.id,
            created_by_name: profile?.full_name || 'Sistema',
          }
          if (formData.tipo_titular === 'empresa') {
            nuevoTitular.razon_social = titularNombre
          } else {
            const partes = titularNombre.split(/\s+/)
            if (partes.length >= 2) {
              nuevoTitular.apellidos = partes[partes.length - 1]
              nuevoTitular.nombres = partes.slice(0, -1).join(' ')
            } else {
              nuevoTitular.nombres = titularNombre
              nuevoTitular.apellidos = ''
            }
          }
          const { data: titularCreado } = await supabase.from('titulares').insert([nuevoTitular]).select('id').single()
          if (titularCreado) titularId = titularCreado.id
        }

        if (titularId) {
          const hoy = new Date().toISOString().split('T')[0]
          // Desactivar titular anterior
          await supabase
            .from('vehiculos_titulares')
            .update({ activo: false, fecha_hasta: hoy })
            .eq('vehiculo_id', selectedVehiculo.id)
            .eq('activo', true)
          // Crear nueva relación
          await supabase.from('vehiculos_titulares').insert([{
            vehiculo_id: selectedVehiculo.id,
            titular_id: titularId,
            fecha_desde: hoy,
            activo: true,
            created_by: user?.id,
            created_by_name: profile?.full_name || 'Sistema',
          }])
        }
      }

      showSuccess('Vehículo actualizado', debeFinalizarAsignaciones ? 'Asignaciones finalizadas' : undefined)
      setShowEditModal(false)
      setSelectedVehiculo(null)
      resetForm()
      await loadVehiculos(true)
    } catch (err: any) {
      const isDuplicatePatente =
        err?.code === '23505' ||
        (typeof err?.message === 'string' && err.message.includes('vehiculos_patente_key'))
      Swal.fire({
        icon: 'error',
        title: isDuplicatePatente ? 'Patente duplicada' : 'Error',
        text: isDuplicatePatente
          ? `Ya existe un vehículo registrado con la patente ${formData.patente.toUpperCase()}.`
          : err.message,
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
      // Soft delete: marcar como eliminado sin borrar datos ni romper FK
      const { error: deleteError } = await supabase
        .from('vehiculos')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', selectedVehiculo.id)

      if (deleteError) throw deleteError

      showSuccess('Vehículo eliminado')
      setShowDeleteModal(false)
      setSelectedVehiculo(null)
      await loadVehiculos(true)
    } catch (err: any) {
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
      if (!data) return

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
        gps_uss: (fullVehiculo as any).gps_uss || '',
        gnc: (fullVehiculo as any).gnc || false,
        telepase: (fullVehiculo as any).telepase || false,
        numero_motor: fullVehiculo.numero_motor || '',
        numero_chasis: fullVehiculo.numero_chasis || '',
        provisoria: fullVehiculo.provisoria || '',
        estado_id: fullVehiculo.estado_id || '',
        kilometraje_actual: fullVehiculo.kilometraje_actual,
        fecha_adquisicion: fullVehiculo.fecha_adquisicion || '',
        fecha_ulti_inspeccion: fullVehiculo.fecha_ulti_inspeccion || '',
        fecha_prox_inspeccion: fullVehiculo.fecha_prox_inspeccion || '',
        cobertura: (fullVehiculo as any).cobertura || '',
        seguro_numero: fullVehiculo.seguro_numero || '',
        seguro_vigencia: fullVehiculo.seguro_vigencia || '',
        titular: fullVehiculo.titular || '',
        tipo_titular: '' as 'persona' | 'empresa' | '',
        titular_id: '',
        notas: fullVehiculo.notas || '',
        url_documentacion: (fullVehiculo as any).url_documentacion || (fullVehiculo as any).documentos_urls || '',
        sede_id: (fullVehiculo as any).sede_id || '',
        grupo_flota: (fullVehiculo as any).grupo_flota || '',
        cantidad_llaves: (fullVehiculo as any).cantidad_llaves != null ? String((fullVehiculo as any).cantidad_llaves) : '',
        lugar_radicacion: (fullVehiculo as any).lugar_radicacion || '',
        vencimiento_seguro: (fullVehiculo as any).vencimiento_seguro || '',
        vto_vtv_aplica: !!(fullVehiculo as any).vto_vtv_aplica,
        vto_vtv_fecha: (fullVehiculo as any).vto_vtv_fecha || '',
        vto_gnc_aplica: !!(fullVehiculo as any).vto_gnc_aplica,
        vto_gnc_fecha: (fullVehiculo as any).vto_gnc_fecha || '',
        vto_matafuego_aplica: !!(fullVehiculo as any).vto_matafuego_aplica,
        vto_matafuego_fecha: (fullVehiculo as any).vto_matafuego_fecha || ''
      })
      // Precargar titular activo del vehículo
      const { data: vtData } = await supabase
        .from('vehiculos_titulares')
        .select('titular_id, titulares(id, tipo, nombres, apellidos, razon_social)')
        .eq('vehiculo_id', vehiculo.id)
        .eq('activo', true)
        .maybeSingle()

      if (vtData?.titulares) {
        const tit = vtData.titulares as any
        setFormData(prev => ({
          ...prev,
          tipo_titular: tit.tipo as 'persona' | 'empresa',
          titular_id: tit.id,
          titular: tit.tipo === 'empresa'
            ? (tit.razon_social || '').toUpperCase()
            : [tit.apellidos, tit.nombres].filter(Boolean).join(' ').toUpperCase(),
        }))
      } else if (fullVehiculo.titular) {
        // Titular en texto pero sin relación, intentar matchear
        const titularTexto = (fullVehiculo.titular || '').toUpperCase()
        const match = titularesOptions.find(t => t.nombre === titularTexto)
        if (match) {
          setFormData(prev => ({
            ...prev,
            tipo_titular: match.tipo,
            titular_id: match.id,
          }))
        }
      }

      setShowEditModal(true)
    } catch {
      // silently ignored
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
      tipo_vehiculo: '',
      tipo_combustible: '',
      tipo_gps: '',
      gps_uss: '',
      gnc: false,
      telepase: false,
      numero_motor: '',
      numero_chasis: '',
      provisoria: '',
      estado_id: '',
      kilometraje_actual: 0,
      fecha_adquisicion: '',
      fecha_ulti_inspeccion: '',
      fecha_prox_inspeccion: '',
      cobertura: '',
      seguro_numero: '',
      seguro_vigencia: '',
      titular: '',
      tipo_titular: '' as 'persona' | 'empresa' | '',
      titular_id: '',
      notas: '',
      url_documentacion: '',
      sede_id: '',
      grupo_flota: '',
      cantidad_llaves: '',
      lugar_radicacion: '',
      vencimiento_seguro: '',
      vto_vtv_aplica: false,
      vto_vtv_fecha: '',
      vto_gnc_aplica: false,
      vto_gnc_fecha: '',
      vto_matafuego_aplica: false,
      vto_matafuego_fecha: ''
    })
  }

  const handleOpenCreateModal = () => {
    resetForm()
    setShowCreateModal(true)
  }

  const handleCloseCreateModal = () => {
    if (!saving) setShowCreateModal(false)
  }

  const handleCancelCreateWizard = () => {
    setShowCreateModal(false)
    resetForm()
  }

  const handleCloseEditModal = () => {
    if (!saving) setShowEditModal(false)
  }

  const handleCancelEdit = () => {
    setShowEditModal(false)
    setSelectedVehiculo(null)
    resetForm()
  }

  const handleCloseDeleteModal = () => {
    if (!saving) setShowDeleteModal(false)
  }

  const handleCancelDelete = () => {
    setShowDeleteModal(false)
    setSelectedVehiculo(null)
  }



  // Manejar click en stat cards para filtrar
  // IMPORTANTE: NO limpiar filtros de columna - deben funcionar en conjunto con el stat card
  const handleStatCardClick = (cardType: string) => {
    // Si hace click en el mismo, desactivar solo el filtro de stat card
    if (activeStatCard === cardType) {
      setActiveStatCard(null)
      setStatCardEstadoFilter([]) // Solo limpiar el filtro del stat card, NO el de columna
      setStatCardExcludeMode(false)
      setGncFilter(null)
      setTelepaseFilter(null)
      return
    }

    setActiveStatCard(cardType)
    setGncFilter(null) // Limpiar filtro GNC al cambiar de card
    setTelepaseFilter(null) // Limpiar filtro Telepase al cambiar de card

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
        // Excluir estados que no son parte de la flota activa
        setStatCardEstadoFilter(['Robo', 'Destruccion', 'Jubilado', 'Dev. Proveedor'])
        setStatCardExcludeMode(true)
        break
      case 'enCochera':
        setStatCardEstadoFilter(estadosEnCochera)
        setStatCardExcludeMode(false)
        break
      case 'enUso':
        setStatCardEstadoFilter(estadosEnUso)
        setStatCardExcludeMode(false)
        break
      case 'tallerMecanico':
        setStatCardEstadoFilter(estadosTallerMecanico)
        setStatCardExcludeMode(false)
        break
      case 'chapaPintura':
        setStatCardEstadoFilter(estadosChapaPintura)
        setStatCardExcludeMode(false)
        break
      case 'corporativos':
        setStatCardEstadoFilter(estadosCorporativos)
        setStatCardExcludeMode(false)
        break
      case 'devueltos':
        setStatCardEstadoFilter(estadosDevueltos)
        setStatCardExcludeMode(false)
        break
      case 'sinGnc':
        setStatCardEstadoFilter([])
        setStatCardExcludeMode(false)
        setGncFilter('sinGnc')
        setTelepaseFilter(null)
        break
      case 'conGnc':
        setStatCardEstadoFilter([])
        setStatCardExcludeMode(false)
        setGncFilter('conGnc')
        setTelepaseFilter(null)
        break
      case 'telepase':
        setStatCardEstadoFilter([])
        setStatCardExcludeMode(false)
        setGncFilter(null)
        setTelepaseFilter('propio')
        break
      case 'telepaseToshify':
        setStatCardEstadoFilter([])
        setStatCardExcludeMode(false)
        setGncFilter(null)
        setTelepaseFilter('toshify')
        break
      default:
        setStatCardEstadoFilter([])
        setStatCardExcludeMode(false)
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
        devueltos: 'Dev. Proveedor',
        sinGnc: 'Sin GNC',
        conGnc: 'Con GNC',
        telepase: 'Telepase Propio',
        telepaseToshify: 'Telepase Toshify',
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
    if (anioFilter.length > 0) {
      filters.push({
        id: 'anio',
        label: `Año: ${anioFilter.length === 1 ? anioFilter[0] : `${anioFilter.length} seleccionados`}`,
        onClear: () => setAnioFilter([])
      })
    }
    if (colorFilter.length > 0) {
      filters.push({
        id: 'color',
        label: `Color: ${colorFilter.length === 1 ? colorFilter[0] : `${colorFilter.length} seleccionados`}`,
        onClear: () => setColorFilter([])
      })
    }
    if (kmFilter.length > 0) {
      filters.push({
        id: 'km',
        label: `Km: ${kmFilter.length === 1 ? kmFilter[0] : `${kmFilter.length} seleccionados`}`,
        onClear: () => setKmFilter([])
      })
    }
    if (titularFilter.length > 0) {
      filters.push({
        id: 'titular',
        label: `Titular: ${titularFilter.length === 1 ? titularFilter[0] : `${titularFilter.length} seleccionados`}`,
        onClear: () => setTitularFilter([])
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
  }, [activeStatCard, patenteFilter, marcaFilter, modeloFilter, anioFilter, colorFilter, titularFilter, kmFilter, estadoFilter, gncFilter])

  // Limpiar todos los filtros
  const handleClearAllFilters = () => {
    setActiveStatCard(null)
    setStatCardEstadoFilter([])
    setGncFilter(null)
    setTelepaseFilter(null)
    setPatenteFilter([])
    setMarcaFilter([])
    setModeloFilter([])
    setAnioFilter([])
    setColorFilter([])
    setTitularFilter([])
    setKmFilter([])
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

  const gruposFlotaExistentes = useMemo(() => {
    const grupos = new Set<string>()
    vehiculos.forEach(v => {
      const g = (v as any).grupo_flota
      if (g) grupos.add(g)
    })
    return Array.from(grupos).sort()
  }, [vehiculos])

  // Valores únicos para filtros tipo Excel
  const patentesUnicas = useMemo(() => {
    const patentes = vehiculos.map(v => v.patente).filter(Boolean) as string[]
    return [...new Set(patentes)].sort()
  }, [vehiculos])

  const titularesUnicos = useMemo(() => {
    const titulares = new Set<string>()
    vehiculos.forEach(v => {
      const t = (v as any).titular
      if (t) titulares.add(t)
    })
    return Array.from(titulares).sort()
  }, [vehiculos])

  const aniosUnicos = useMemo(() => {
    const anios = new Set<string>()
    vehiculos.forEach(v => {
      if (v.anio) anios.add(String(v.anio))
    })
    return Array.from(anios).sort()
  }, [vehiculos])

  const coloresUnicos = useMemo(() => {
    const colores = new Set<string>()
    vehiculos.forEach(v => {
      if ((v as any).color) colores.add((v as any).color)
    })
    return Array.from(colores).sort()
  }, [vehiculos])

  // Opciones de estado únicas derivadas de los vehículos reales (no del catálogo completo)
  const estadosUnicos = useMemo(() => {
    const labels = new Set<string>()
    vehiculos.forEach(v => {
      const codigo = v.vehiculos_estados?.codigo
      if (codigo) labels.add(VEHICULO_ESTADO_LABELS[codigo] || codigo)
    })
    return Array.from(labels).sort()
  }, [vehiculos])

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

    if (anioFilter.length > 0) {
      result = result.filter(v =>
        anioFilter.includes(String(v.anio || ''))
      )
    }

    if (colorFilter.length > 0) {
      result = result.filter(v =>
        colorFilter.includes((v as any).color || '')
      )
    }

    if (titularFilter.length > 0) {
      result = result.filter(v =>
        titularFilter.includes((v as any).titular || '')
      )
    }

    if (kmFilter.length > 0) {
      result = result.filter(v => {
        const km = (v as any).kilometraje_actual || 0
        return kmFilter.some(rango => {
          if (rango === '0 - 50,000') return km < 50000
          if (rango === '50,000 - 100,000') return km >= 50000 && km < 100000
          if (rango === '100,000 - 150,000') return km >= 100000 && km < 150000
          if (rango === '150,000 - 200,000') return km >= 150000 && km < 200000
          if (rango === '200,000+') return km >= 200000
          return false
        })
      })
    }

    // Filtro de columna Estado (desde ExcelColumnFilter)
    if (estadoFilter.length > 0) {
      result = result.filter(v => {
        const estadoCodigo = v.vehiculos_estados?.codigo || ''
        const estadoLabel = VEHICULO_ESTADO_LABELS[estadoCodigo] || estadoCodigo
        return estadoFilter.includes(estadoLabel) || estadoFilter.includes(estadoCodigo)
      })
    }

    // Filtro de Stat Card (ADICIONAL al filtro de columna)
    if (statCardEstadoFilter.length > 0) {
      result = result.filter(v => {
        const estadoCodigo = v.vehiculos_estados?.codigo || ''
        const estadoLabel = VEHICULO_ESTADO_LABELS[estadoCodigo] || estadoCodigo
        const matches = statCardEstadoFilter.includes(estadoLabel) || statCardEstadoFilter.includes(estadoCodigo)
        // En modo exclusión (Total Flota): mostrar los que NO están en la lista
        return statCardExcludeMode ? !matches : matches
      })
    } else {
      // Por defecto (sin stat card activa): excluir estados fuera de flota activa
      const estadosExcluidosTabla = ['ROBO', 'DESTRUCCION_TOTAL', 'JUBILADO', 'DEVUELTO_PROVEEDOR']
      result = result.filter(v => {
        const estadoCodigo = v.vehiculos_estados?.codigo || ''
        return !estadosExcluidosTabla.includes(estadoCodigo)
      })
    }

    // Filtro de GNC
    if (gncFilter === 'sinGnc') {
      result = result.filter(v => !(v as any).gnc)
    } else if (gncFilter === 'conGnc') {
      result = result.filter(v => (v as any).gnc === true)
    }

    // Filtro de Telepase
    if (telepaseFilter === 'propio') {
      result = result.filter(v => (v as any).telepase === true)
    } else if (telepaseFilter === 'toshify') {
      result = result.filter(v => !(v as any).telepase)
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
  }, [vehiculos, patenteFilter, marcaFilter, modeloFilter, anioFilter, colorFilter, titularFilter, kmFilter, estadoFilter, statCardEstadoFilter, statCardExcludeMode, gncFilter, telepaseFilter])


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
        accessorKey: 'titular',
        header: () => (
          <ExcelColumnFilter
            label="Titular"
            options={titularesUnicos}
            selectedValues={titularFilter}
            onSelectionChange={setTitularFilter}
            filterId="titular"
            openFilterId={openFilterId}
            onOpenChange={setOpenFilterId}
          />
        ),
        cell: ({ row }) => {
          const titular = (row.original as any).titular
          if (!titular) return <span style={{ color: 'var(--text-tertiary)' }}>-</span>
          return <span style={{ fontSize: '12px' }}>{titular}</span>
        },
        enableSorting: true,
      },
      {
        accessorKey: 'grupo_flota',
        header: 'Grupo de Flota',
        cell: ({ row }) => {
          const g = (row.original as any).grupo_flota
          if (!g) return <span style={{ color: 'var(--text-tertiary)' }}>-</span>
          return <span style={{ fontSize: '12px' }}>{g}</span>
        },
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
        accessorKey: 'lugar_radicacion',
        header: 'Lugar de Radicación',
        cell: ({ row }) => {
          const l = (row.original as any).lugar_radicacion
          if (!l) return <span style={{ color: 'var(--text-tertiary)' }}>-</span>
          return <span style={{ fontSize: '12px' }}>{l}</span>
        },
        enableSorting: true,
      },
      {
        accessorKey: 'anio',
        header: () => (
          <ExcelColumnFilter
            label="Año"
            options={aniosUnicos}
            selectedValues={anioFilter}
            onSelectionChange={setAnioFilter}
            filterId="anio"
            openFilterId={openFilterId}
            onOpenChange={setOpenFilterId}
          />
        ),
        cell: ({ getValue }) => (getValue() as number) || 'N/A',
        enableSorting: true,
      },
      {
        accessorKey: 'color',
        header: () => (
          <ExcelColumnFilter
            label="Color"
            options={coloresUnicos}
            selectedValues={colorFilter}
            onSelectionChange={setColorFilter}
            filterId="color"
            openFilterId={openFilterId}
            onOpenChange={setOpenFilterId}
          />
        ),
        cell: ({ getValue }) => {
          const rawColor = getValue() as string
          if (!rawColor || !rawColor.trim()) return <span style={{ color: 'var(--text-tertiary)' }}>-</span>
          const colorNorm = rawColor.trim().toLowerCase()
          const colorDisplay = rawColor.trim().toUpperCase()
          const colorMap: Record<string, string> = {
            'blanco': '#ffffff',
            'negro': '#1a1a1a',
            'gris': '#808080',
            'plata': '#c0c0c0',
            'plateado': '#c0c0c0',
            'rojo': '#dc2626',
            'azul': '#2563eb',
            'celeste': '#38bdf8',
            'verde': '#16a34a',
            'amarillo': '#eab308',
            'naranja': '#ea580c',
            'marron': '#78350f',
            'marrón': '#78350f',
            'beige': '#d4c4a8',
            'bordo': '#800020',
            'bordó': '#800020',
            'champagne': '#f7e7ce',
            'dorado': '#d4a017',
            'champán': '#f7e7ce',
          }
          return (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  background: colorMap[colorNorm] || '#9ca3af',
                  border: colorNorm === 'blanco' ? '2px solid #d1d5db' : '2px solid var(--border-secondary)',
                  boxShadow: colorNorm === 'blanco' ? 'inset 0 0 0 1px rgba(0,0,0,0.15)' : 'inset 0 0 0 1px rgba(0,0,0,0.1)',
                  flexShrink: 0,
                }}
              />
              <span style={{ fontWeight: 500 }}>{colorDisplay}</span>
            </div>
          )
        },
        enableSorting: true,
      },
      {
        accessorKey: 'kilometraje_actual',
        header: () => (
          <ExcelColumnFilter
            label="Kilometraje"
            options={['0 - 50,000', '50,000 - 100,000', '100,000 - 150,000', '150,000 - 200,000', '200,000+']}
            selectedValues={kmFilter}
            onSelectionChange={setKmFilter}
            filterId="km"
            openFilterId={openFilterId}
            onOpenChange={setOpenFilterId}
          />
        ),
        cell: ({ row, getValue }) => {
          const km = (getValue() as number) || 0
          const updatedAt = (row.original as any).kilometraje_geotab_updated_at as string | null
          const patenteNorm = ((row.original as any).patente || '').replace(/[\s\-.%]/g, '').toUpperCase()
          const esGeotab = !!updatedAt
          const esUss = !esGeotab && ussPatentes.has(patenteNorm)
          const tooltip = esGeotab && updatedAt
            ? `Actualizado automáticamente desde Geotab el ${new Date(updatedAt).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}`
            : esUss
            ? 'Vehículo con GPS USS (km manual; USS no transmite odómetro acumulado)'
            : 'Carga manual'
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.3 }} title={tooltip}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{km.toLocaleString()} km</span>
              {esGeotab && (
                <span
                  style={{
                    background: '#3b82f6', color: '#fff',
                    padding: '1px 5px', borderRadius: 3,
                    fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
                    width: 'fit-content',
                  }}
                >
                  GEOTAB
                </span>
              )}
              {esUss && (
                <span
                  style={{
                    background: '#16a34a', color: '#fff',
                    padding: '1px 5px', borderRadius: 3,
                    fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
                    width: 'fit-content',
                  }}
                >
                  USS
                </span>
              )}
            </div>
          )
        },
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
            'PROGRAMADO': 'Programado',
            'DEVUELTO_PROVEEDOR': 'Dev. Proveedor',
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
            case 'DEVUELTO_PROVEEDOR':
              badgeClass = 'dt-badge dt-badge-solid-red'
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
          const folderUrl = (row.original as any).drive_folder_url || (row.original as any).url_documentacion

          const handleFolderClick = () => {
            if (folderUrl) window.open(folderUrl, '_blank')
            else Swal.fire('Sin URL', 'Este vehículo no tiene una URL de documentación configurada', 'info')
          }
          
          return (
            <ActionsMenu
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
                  icon: folderUrl ? <FolderOpen size={15} /> : <FolderPlus size={15} />,
                  label: folderUrl ? 'Ver documentos' : 'Sin carpeta',
                  onClick: handleFolderClick,
                  variant: folderUrl ? 'success' : 'default'
                },
                {
                  icon: <History size={15} />,
                  label: 'Historial',
                  onClick: () => setHistorialVehiculo({ id: row.original.id, patente: row.original.patente }),
                  hidden: !isAdmin(),
                  variant: 'info'
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
    [canUpdate, canDelete, patenteFilter, marcaFilter, modeloFilter, titularFilter, anioFilter, colorFilter, kmFilter, estadoFilter, openFilterId, patentesUnicas, marcasExistentes, modelosExistentes, titularesUnicos, aniosUnicos, coloresUnicos, estadosUnicos, ussPatentes]
  )

  // Exporta a Excel los vehículos actualmente visibles en la tabla, respetando:
  // - filtros de stat cards (activeStatCard, gnc/telepase)
  // - filtros de columna Excel (patente, marca, modelo, etc.)
  // - búsqueda global del input (replica la misma lógica del DataTable: case-insensitive,
  //   todas las palabras deben coincidir en algún campo del registro)
  // Hace un SELECT completo on-demand para incluir todos los campos, no solo los visibles.
  const handleExportarVehiculos = async () => {
    // Aplicar la búsqueda global sobre los vehículos ya filtrados por columnas/stat cards.
    const search = globalSearch.trim().toLowerCase()
    const filtroBusqueda = (v: any): boolean => {
      if (!search) return true
      const words = search.split(/\s+/).filter(w => w.length > 0)
      const haystack = [
        v.patente, v.marca, v.modelo, v.color, v.titular,
        (v as any).grupo_flota, (v as any).tipo_vehiculo, (v as any).lugar_radicacion,
        v.anio != null ? String(v.anio) : '',
        v.vehiculos_estados?.descripcion, v.vehiculos_estados?.codigo,
      ].filter(Boolean).join(' ').toLowerCase()
      return words.every(w => haystack.includes(w))
    }
    const vehiculosVisibles = filteredVehiculos.filter(filtroBusqueda)

    if (vehiculosVisibles.length === 0) {
      Swal.fire('Sin datos', 'No hay vehículos para exportar', 'info')
      return
    }
    try {
      const ids = vehiculosVisibles.map(v => v.id)
      const { data, error: exportError } = await supabase
        .from('vehiculos')
        .select(`
          *,
          vehiculos_estados (codigo, descripcion),
          sedes:sede_id (nombre, codigo)
        `)
        .in('id', ids)
      if (exportError) throw exportError

      const fmtFecha = (v: string | null | undefined) =>
        v ? new Date(v).toLocaleDateString('es-AR') : ''
      const fmtFechaHora = (v: string | null | undefined) =>
        v ? new Date(v).toLocaleString('es-AR') : ''

      // Mantener orden de los IDs filtrados para que el Excel respete la vista actual
      const ordenIds = new Map(ids.map((id, i) => [id, i]))
      const sorted = ([...(data || [])] as any[]).sort(
        (a, b) => (ordenIds.get(a.id) ?? 0) - (ordenIds.get(b.id) ?? 0)
      )

      const dataExport = sorted.map((v: any) => ({
        'Patente': v.patente || '',
        'Marca': v.marca || '',
        'Modelo': v.modelo || '',
        'Año': v.anio || '',
        'Color': v.color || '',
        'Tipo Vehículo': v.tipo_vehiculo || '',
        'Grupo de Flota': v.grupo_flota || '',
        'Lugar de Radicación': v.lugar_radicacion || '',
        'Cantidad de Llaves': v.cantidad_llaves != null ? v.cantidad_llaves : '',
        'Titular': v.titular || '',
        'Sede': v.sedes?.nombre || '',
        'Estado': v.vehiculos_estados?.descripcion || v.vehiculos_estados?.codigo || '',
        'Tipo Combustible': v.tipo_combustible || '',
        'GNC': v.gnc ? 'Sí' : 'No',
        'Telepase': v.telepase ? 'Sí' : 'No',
        'Tipo GPS': v.tipo_gps || '',
        'GPS 2': v.gps_uss || 'Sin GPS 2',
        'Número Motor': v.numero_motor || '',
        'Número Chasis': v.numero_chasis || '',
        'Provisoria': v.provisoria || '',
        'Kilometraje Actual': v.kilometraje_actual || 0,
        'Kilometraje Geotab': v.kilometraje_geotab || '',
        'Geotab — Última Lectura': fmtFechaHora(v.kilometraje_geotab_updated_at),
        'Fecha Adquisición': fmtFecha(v.fecha_adquisicion),
        'Última Inspección': fmtFecha(v.fecha_ulti_inspeccion),
        'Próxima Inspección': fmtFecha(v.fecha_prox_inspeccion),
        'Cobertura': v.cobertura || '',
        'N° Póliza': v.seguro_numero || '',
        'Vigencia Seguro': fmtFecha(v.seguro_vigencia),
        'Vencimiento Seguro': fmtFecha(v.vencimiento_seguro),
        'Vto VTV': v.vto_vtv_aplica ? `Sí${v.vto_vtv_fecha ? ' — ' + fmtFecha(v.vto_vtv_fecha) : ''}` : 'No',
        'Vto GNC': v.vto_gnc_aplica ? `Sí${v.vto_gnc_fecha ? ' — ' + fmtFecha(v.vto_gnc_fecha) : ''}` : 'No',
        'Vto Matafuego': v.vto_matafuego_aplica ? `Sí${v.vto_matafuego_fecha ? ' — ' + fmtFecha(v.vto_matafuego_fecha) : ''}` : 'No',
        'URL Documentación': v.url_documentacion || '',
        'Drive Folder URL': v.drive_folder_url || '',
        'Notas': v.notas || '',
        'Creado por': v.created_by_name || '',
        'Fecha Creación': fmtFechaHora(v.created_at),
        'Actualizado por': v.updated_by || '',
        'Última Actualización': fmtFechaHora(v.updated_at),
      }))

      const ws = XLSX.utils.json_to_sheet(dataExport)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Vehículos')

      // Anchos razonables para las columnas principales
      ws['!cols'] = [
        { wch: 10 }, { wch: 14 }, { wch: 22 }, { wch: 6 }, { wch: 12 },
        { wch: 14 }, { wch: 18 }, { wch: 24 }, { wch: 16 }, { wch: 18 },
        { wch: 14 }, { wch: 6 }, { wch: 10 }, { wch: 14 }, { wch: 14 },
        { wch: 18 }, { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
        { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 18 },
        { wch: 16 }, { wch: 14 }, { wch: 30 }, { wch: 30 }, { wch: 30 },
        { wch: 22 }, { wch: 18 }, { wch: 22 }, { wch: 18 },
      ]

      const fecha = new Date().toISOString().split('T')[0]
      XLSX.writeFile(wb, `Vehiculos_${fecha}.xlsx`)
    } catch (err: any) {
      Swal.fire('Error', err?.message || 'No se pudo exportar', 'error')
    }
  }

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
          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'sinGnc' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatCardClick('sinGnc')}
            title="Click para filtrar: Vehiculos sin GNC"
          >
            <Fuel size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{calculatedStats.vehiculosSinGnc}</span>
              <span className="stat-label">Sin GNC</span>
            </div>
          </div>
          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'conGnc' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatCardClick('conGnc')}
            title="Click para filtrar: Vehiculos con GNC"
          >
            <Fuel size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{calculatedStats.vehiculosConGnc}</span>
              <span className="stat-label">Con GNC</span>
            </div>
          </div>
          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'telepase' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatCardClick('telepase')}
            title="Click para filtrar: Vehiculos con Telepase propio"
          >
            <CreditCard size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{calculatedStats.vehiculosConTelepase}</span>
              <span className="stat-label">Telepase Propio</span>
            </div>
          </div>
          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'telepaseToshify' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatCardClick('telepaseToshify')}
            title="Click para filtrar: Vehiculos con Telepase Toshify"
          >
            <CreditCard size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{calculatedStats.vehiculosTelepaseToshify}</span>
              <span className="stat-label">Telepase Toshify</span>
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
        stickyLeftColumns={3}
        pageSize={100}
        pageSizeOptions={[50, 100, 200]}
        searchPlaceholder="Buscar por patente, marca, modelo..."
        globalFilter={globalSearch}
        onGlobalFilterChange={setGlobalSearch}
        emptyIcon={<Car size={64}
      />}
        emptyTitle="No hay vehiculos registrados"
        emptyDescription={canCreate ? 'Crea el primero usando el boton "+ Crear Vehiculo".' : ''}
        headerAction={
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <VerLogsButton tablas={['vehiculos', 'vehiculo_control']} label="Veh\u00edculos" />
            <button
              className="btn-secondary"
              onClick={handleExportarVehiculos}
              title="Exportar a Excel los veh\u00edculos visibles seg\u00fan los filtros aplicados"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Download size={14} /> Exportar
            </button>
            <button
              className="btn-primary"
              onClick={handleOpenCreateModal}
              disabled={!canCreate}
              title={!canCreate ? 'No tienes permisos para crear vehiculos' : ''}
            >
              + Crear Vehiculo
            </button>
          </div>
        }
        externalFilters={externalFilters}
        onClearAllFilters={handleClearAllFilters}
      />

      {/* MODALS */}
      {/* Modal Crear - Wizard */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={handleCloseCreateModal}>
          <div className="modal-content modal-wizard" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Crear Nuevo Vehículo</h2>
              <button
                className="modal-close"
                onClick={handleCloseCreateModal}
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
              gruposFlotaExistentes={gruposFlotaExistentes}
              sedes={sedes}
              titulares={titularesOptions}
              onCancel={handleCancelCreateWizard}
              onSubmit={handleCreate}
              saving={saving}
            />
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar - Formulario completo */}
      {showEditModal && selectedVehiculo && (
        <div className="modal-overlay" onClick={handleCloseEditModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '900px' }}>
            <div className="modal-header">
              <h2>Editar Vehículo</h2>
              <button
                className="modal-close"
                onClick={handleCloseEditModal}
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
                <label className="form-label">Marca <span style={{ color: '#ef4444' }}>*</span></label>
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
                <label className="form-label">Modelo <span style={{ color: '#ef4444' }}>*</span></label>
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
                <label className="form-label">Año <span style={{ color: '#ef4444' }}>*</span></label>
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
                <label className="form-label">Color <span style={{ color: '#ef4444' }}>*</span></label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Tipo <span style={{ color: '#ef4444' }}>*</span></label>
                <select
                  className="form-input"
                  value={formData.tipo_vehiculo}
                  onChange={(e) => setFormData({ ...formData, tipo_vehiculo: e.target.value })}
                  disabled={saving}
                >
                  <option value="">Seleccionar...</option>
                  <option value="SEDAN 5 PUERTAS">SEDAN 5 PUERTAS</option>
                  <option value="SEDAN 4 PUERTAS">SEDAN 4 PUERTAS</option>
                </select>
              </div>
            </div>

            <div className="section-title">Combustible y GPS</div>

            <div className="form-row">
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

              <div className="form-group" style={{ display: 'flex', gap: '24px' }}>
                <div>
                  <label className="form-label">GNC</label>
                  <label style={{ display: 'flex', alignItems: 'center', height: '42px', cursor: 'pointer', gap: '8px' }}>
                    <input
                      type="checkbox"
                      checked={formData.gnc}
                      onChange={(e) => setFormData({ ...formData, gnc: e.target.checked })}
                      disabled={saving}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <span style={{ color: formData.gnc ? '#10B981' : 'var(--text-primary)' }}>
                      GNC
                    </span>
                  </label>
                </div>
                <div>
                  <label className="form-label">Telepase</label>
                  <label style={{ display: 'flex', alignItems: 'center', height: '42px', cursor: 'pointer', gap: '8px' }}>
                    <input
                      type="checkbox"
                      checked={formData.telepase}
                      onChange={(e) => setFormData({ ...formData, telepase: e.target.checked })}
                      disabled={saving}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <span style={{ color: formData.telepase ? '#3b82f6' : 'var(--text-primary)' }}>
                      Telepase Propio
                    </span>
                    <span style={{ position: 'relative', display: 'inline-flex' }} className="telepase-tooltip-wrap">
                      <Info size={14} style={{ color: '#9CA3AF', cursor: 'help', flexShrink: 0 }} />
                      <span className="telepase-tooltip">Al activar, el peaje es asumido por el conductor asignado a este vehículo</span>
                    </span>
                  </label>
                </div>
              </div>
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
                <select
                  className="form-select"
                  value={formData.gps_uss}
                  onChange={(e) => setFormData({ ...formData, gps_uss: e.target.value })}
                  disabled={saving}
                >
                  <option value="">Sin GPS 2</option>
                  <option value="USS">USS (WIALON)</option>
                  <option value="GEOTAB">Geotab</option>
                </select>
              </div>
            </div>

            <div className="section-title">Datos Técnicos</div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Número Motor <span style={{ color: '#ef4444' }}>*</span></label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.numero_motor}
                  onChange={(e) => setFormData({ ...formData, numero_motor: e.target.value })}
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Número Chasis <span style={{ color: '#ef4444' }}>*</span></label>
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
                  {vehiculosEstados
                    .filter((estado: VehiculoEstado) => estado.codigo !== 'DISPONIBLE' && estado.codigo !== 'PROGRAMADO')
                    .map((estado: VehiculoEstado) => (
                    <option key={estado.id} value={estado.id}>{estado.descripcion}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Sede</label>
                <select
                  className="form-input"
                  value={formData.sede_id}
                  onChange={(e) => setFormData({ ...formData, sede_id: e.target.value })}
                  disabled={saving}
                >
                  <option value="">Seleccionar...</option>
                  {sedes.map((s) => (
                    <option key={s.id} value={s.id}>{s.nombre}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-row">
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

            <div className="form-group">
              <label className="form-label">Cobertura <span className="required">*</span></label>
              <input
                type="text"
                className="form-input"
                value={formData.cobertura}
                onChange={(e) => setFormData({ ...formData, cobertura: e.target.value })}
                disabled={saving}
                placeholder="Tipo de cobertura del seguro"
              />
            </div>

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

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Vencimiento Seguro</label>
                <input
                  type="date"
                  className="form-input"
                  value={formData.vencimiento_seguro}
                  onChange={(e) => setFormData({ ...formData, vencimiento_seguro: e.target.value })}
                  disabled={saving}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Lugar de Radicación <span style={{ color: '#ef4444' }}>*</span></label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.lugar_radicacion}
                  onChange={(e) => setFormData({ ...formData, lugar_radicacion: e.target.value })}
                  disabled={saving}
                  required
                  placeholder="Ciudad / jurisdicción"
                  style={!formData.lugar_radicacion?.trim() ? { borderColor: '#ef4444' } : {}}
                />
              </div>
            </div>

            <div className="section-title">Relación Titular</div>

            <div style={{
              border: '1px solid var(--border-primary)',
              borderRadius: '8px',
              padding: '16px',
              background: 'var(--bg-secondary)',
            }}>
              <div className="form-group">
                <label className="form-label">Tipo de Titular <span style={{ color: '#ef4444' }}>*</span></label>
                <select
                  className="form-input"
                  value={formData.tipo_titular}
                  onChange={(e) => {
                    const tipo = e.target.value as 'persona' | 'empresa' | ''
                    setFormData({ ...formData, tipo_titular: tipo, titular: '', titular_id: '' })
                    setShowEditTitularDropdown(false)
                  }}
                  disabled={saving}
                >
                  <option value="">Seleccionar tipo...</option>
                  <option value="persona">Persona</option>
                  <option value="empresa">Empresa</option>
                </select>
              </div>

              {formData.tipo_titular && (
                <div className="form-group" style={{ position: 'relative' }}>
                  <label className="form-label">
                    {formData.tipo_titular === 'persona' ? 'Nombre del Titular' : 'Razón Social'} <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    ref={editTitularInputRef}
                    type="text"
                    className="form-input"
                    value={formData.titular}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase()
                      setFormData({ ...formData, titular: val, titular_id: '' })
                      setShowEditTitularDropdown(true)
                    }}
                    onFocus={() => setShowEditTitularDropdown(true)}
                    disabled={saving}
                    placeholder={formData.tipo_titular === 'persona' ? 'Ej: GARCIA JUAN' : 'Ej: NAIREBIS S.R.L.'}
                    autoComplete="off"
                  />

                  {/* Dropdown autocomplete */}
                  {showEditTitularDropdown && formData.titular.trim() !== '' && editFilteredTitulares.length > 0 && (
                    <div
                      ref={editTitularDropdownRef}
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        maxHeight: '160px',
                        overflowY: 'auto',
                        background: 'var(--bg-primary)',
                        border: '1px solid var(--border-primary)',
                        borderRadius: '6px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        zIndex: 50,
                        marginTop: '2px',
                      }}
                    >
                      {editFilteredTitulares.map(t => (
                        <div
                          key={t.id}
                          onClick={() => {
                            setFormData({ ...formData, titular: t.nombre, titular_id: t.id })
                            setShowEditTitularDropdown(false)
                          }}
                          style={{
                            padding: '8px 12px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            color: 'var(--text-primary)',
                            borderBottom: '1px solid var(--border-primary)',
                            transition: 'background 0.15s',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          {t.nombre}
                        </div>
                      ))}
                    </div>
                  )}

                </div>
              )}
            </div>

            <div className="section-title" style={{ marginTop: '16px' }}>Información Adicional</div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Grupo de Flota</label>
                <SearchableSelect
                  value={formData.grupo_flota}
                  onChange={(val) => setFormData({ ...formData, grupo_flota: val })}
                  options={gruposFlotaExistentes.map(g => ({ value: g, label: g }))}
                  placeholder="Seleccionar grupo..."
                  searchPlaceholder="Buscar grupo..."
                  disabled={saving}
                  clearable
                  noResultsText="No hay grupos de flota"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Cantidad de llaves de encendido</label>
                <select
                  className="form-input"
                  value={formData.cantidad_llaves}
                  onChange={(e) => setFormData({ ...formData, cantidad_llaves: e.target.value })}
                  disabled={saving}
                >
                  <option value="">Seleccionar...</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                </select>
              </div>
            </div>

            {/* Vencimientos opcionales (VTV / GNC / Matafuego) */}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Vencimiento VTV</label>
                <select
                  className="form-input"
                  value={formData.vto_vtv_aplica ? 'si' : 'no'}
                  onChange={(e) => setFormData({
                    ...formData,
                    vto_vtv_aplica: e.target.value === 'si',
                    vto_vtv_fecha: e.target.value === 'si' ? formData.vto_vtv_fecha : ''
                  })}
                  disabled={saving}
                >
                  <option value="no">No</option>
                  <option value="si">Sí</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Fecha VTV</label>
                <input
                  type="date"
                  className="form-input"
                  value={formData.vto_vtv_fecha}
                  onChange={(e) => setFormData({ ...formData, vto_vtv_fecha: e.target.value })}
                  disabled={saving || !formData.vto_vtv_aplica}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Vencimiento GNC</label>
                <select
                  className="form-input"
                  value={formData.vto_gnc_aplica ? 'si' : 'no'}
                  onChange={(e) => setFormData({
                    ...formData,
                    vto_gnc_aplica: e.target.value === 'si',
                    vto_gnc_fecha: e.target.value === 'si' ? formData.vto_gnc_fecha : ''
                  })}
                  disabled={saving}
                >
                  <option value="no">No</option>
                  <option value="si">Sí</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Fecha GNC</label>
                <input
                  type="date"
                  className="form-input"
                  value={formData.vto_gnc_fecha}
                  onChange={(e) => setFormData({ ...formData, vto_gnc_fecha: e.target.value })}
                  disabled={saving || !formData.vto_gnc_aplica}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Vencimiento Matafuego</label>
                <select
                  className="form-input"
                  value={formData.vto_matafuego_aplica ? 'si' : 'no'}
                  onChange={(e) => setFormData({
                    ...formData,
                    vto_matafuego_aplica: e.target.value === 'si',
                    vto_matafuego_fecha: e.target.value === 'si' ? formData.vto_matafuego_fecha : ''
                  })}
                  disabled={saving}
                >
                  <option value="no">No</option>
                  <option value="si">Sí</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Fecha Matafuego</label>
                <input
                  type="date"
                  className="form-input"
                  value={formData.vto_matafuego_fecha}
                  onChange={(e) => setFormData({ ...formData, vto_matafuego_fecha: e.target.value })}
                  disabled={saving || !formData.vto_matafuego_aplica}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">URL Documentación</label>
              <input
                type="url"
                className="form-input"
                value={formData.url_documentacion}
                onChange={(e) => setFormData({ ...formData, url_documentacion: e.target.value })}
                disabled={saving}
                placeholder="https://..."
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
                onClick={handleCancelEdit}
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
        <div className="modal-overlay" onClick={() => { setShowDetailsModal(false); setLastAuditLog(null) }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '700px' }}>
            <div className="modal-header">
              <h2>Detalles del Vehículo</h2>
              <button
                className="modal-close"
                onClick={() => { setShowDetailsModal(false); setLastAuditLog(null) }}
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
                <div className="detail-value">{selectedVehiculo.color ? selectedVehiculo.color.trim().toUpperCase() : 'N/A'}</div>
              </div>
              <div>
                <label className="detail-label">TIPO</label>
                <div className="detail-value">{(selectedVehiculo as any).tipo_vehiculo || 'N/A'}</div>
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
                <label className="detail-label">GPS 2</label>
                <div className="detail-value" style={{ color: (selectedVehiculo as any).gps_uss ? '#10B981' : 'inherit' }}>
                  {(selectedVehiculo as any).gps_uss || 'Sin GPS 2'}
                </div>
              </div>
              <div>
                <label className="detail-label">GNC</label>
                <div className="detail-value" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: (selectedVehiculo as any).gnc ? '#10B981' : 'inherit' }}>
                    {(selectedVehiculo as any).gnc ? 'Sí' : 'No'}
                  </span>
                  <button
                    onClick={() => cargarHistorialCambios('gnc')}
                    title="Ver historial de cambios GNC"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#9CA3AF', display: 'flex', alignItems: 'center' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#6B7280')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#9CA3AF')}
                  >
                    <History size={14} />
                  </button>
                </div>
              </div>
              <div>
                <label className="detail-label">TELEPASE</label>
                <div className="detail-value" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: (selectedVehiculo as any).telepase ? '#3b82f6' : 'inherit' }}>
                    {(selectedVehiculo as any).telepase ? 'Telepase Propio' : 'No'}
                  </span>
                  <button
                    onClick={() => cargarHistorialCambios('telepase')}
                    title="Ver historial de cambios Telepase"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#9CA3AF', display: 'flex', alignItems: 'center' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#6B7280')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#9CA3AF')}
                  >
                    <History size={14} />
                  </button>
                </div>
              </div>
            </div>

            {/* Mini-modal historial GNC / Telepase */}
            {showHistorialModal && (
              <div style={{ marginTop: '8px', marginBottom: '12px', padding: '12px 16px', borderRadius: '8px', background: 'var(--bg-secondary, #f9fafb)', border: '1px solid var(--border-primary, #e5e7eb)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Historial de {showHistorialModal === 'gnc' ? 'GNC' : 'Telepase'}
                  </span>
                  <button
                    onClick={() => setShowHistorialModal(null)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: '#9CA3AF', lineHeight: 1 }}
                  >
                    &times;
                  </button>
                </div>
                {loadingHistorial ? (
                  <div style={{ textAlign: 'center', padding: '12px', color: 'var(--text-secondary)', fontSize: '12px' }}>Cargando...</div>
                ) : historialCambios.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '12px', color: 'var(--text-secondary)', fontSize: '12px' }}>Sin registros de cambios</div>
                ) : (
                  <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-primary, #e5e7eb)' }}>
                        <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-secondary)', fontWeight: 600 }}>Fecha</th>
                        <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-secondary)', fontWeight: 600 }}>Cambio</th>
                        <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-secondary)', fontWeight: 600 }}>Realizado por</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historialCambios.map((h, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border-primary, #f3f4f6)' }}>
                          <td style={{ padding: '6px 8px' }}>
                            {h.fecha ? h.fecha.split('-').reverse().join('/') : '-'}
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            <span style={{
                              padding: '1px 6px', borderRadius: '4px', fontWeight: 600, fontSize: '11px',
                              background: h.accion === 'instalacion' || h.accion === 'activacion' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                              color: h.accion === 'instalacion' || h.accion === 'activacion' ? '#059669' : '#dc2626',
                            }}>
                              {h.accion === 'instalacion' ? 'Instalado' : h.accion === 'desinstalacion' ? 'Desinstalado' : h.accion === 'activacion' ? 'Activado' : 'Desactivado'}
                            </span>
                          </td>
                          <td style={{ padding: '6px 8px', color: 'var(--text-secondary)' }}>
                            {h.created_by_name || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

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
                <label className="detail-label">COBERTURA</label>
                <div className="detail-value">{(selectedVehiculo as any).cobertura || 'N/A'}</div>
              </div>
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
              <div>
                <label className="detail-label">GRUPO DE FLOTA</label>
                <div className="detail-value">{(selectedVehiculo as any).grupo_flota || 'N/A'}</div>
              </div>
              <div>
                <label className="detail-label">LUGAR DE RADICACIÓN</label>
                <div className="detail-value">{(selectedVehiculo as any).lugar_radicacion || 'N/A'}</div>
              </div>
              <div>
                <label className="detail-label">CANTIDAD DE LLAVES</label>
                <div className="detail-value">{(selectedVehiculo as any).cantidad_llaves != null ? (selectedVehiculo as any).cantidad_llaves : 'N/A'}</div>
              </div>
              <div>
                <label className="detail-label">VENCIMIENTO SEGURO</label>
                <div className="detail-value">{(selectedVehiculo as any).vencimiento_seguro ? new Date((selectedVehiculo as any).vencimiento_seguro).toLocaleDateString('es-AR') : 'N/A'}</div>
              </div>
            </div>

            {/* Vencimientos opcionales */}
            <div className="section-title">Vencimientos</div>
            <div className="details-grid">
              <div>
                <label className="detail-label">VENCIMIENTO VTV</label>
                <div className="detail-value">
                  {(selectedVehiculo as any).vto_vtv_aplica
                    ? `Sí${(selectedVehiculo as any).vto_vtv_fecha ? ` — ${new Date((selectedVehiculo as any).vto_vtv_fecha).toLocaleDateString('es-AR')}` : ''}`
                    : 'No'}
                </div>
              </div>
              <div>
                <label className="detail-label">VENCIMIENTO GNC</label>
                <div className="detail-value">
                  {(selectedVehiculo as any).vto_gnc_aplica
                    ? `Sí${(selectedVehiculo as any).vto_gnc_fecha ? ` — ${new Date((selectedVehiculo as any).vto_gnc_fecha).toLocaleDateString('es-AR')}` : ''}`
                    : 'No'}
                </div>
              </div>
              <div>
                <label className="detail-label">VENCIMIENTO MATAFUEGO</label>
                <div className="detail-value">
                  {(selectedVehiculo as any).vto_matafuego_aplica
                    ? `Sí${(selectedVehiculo as any).vto_matafuego_fecha ? ` — ${new Date((selectedVehiculo as any).vto_matafuego_fecha).toLocaleDateString('es-AR')}` : ''}`
                    : 'No'}
                </div>
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
                {(lastAuditLog?.usuario_nombre || (selectedVehiculo as any).updated_by) && (
                  <div className="detail-value" style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    por {lastAuditLog?.usuario_nombre || (selectedVehiculo as any).updated_by}
                  </div>
                )}
                {lastAuditLog?.campos_modificados && lastAuditLog.campos_modificados.length > 0 && (
                  <div className="detail-value" style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Cambios: {lastAuditLog.campos_modificados.join(', ')}
                  </div>
                )}
              </div>
            </div>
            </div>
            {(() => {
              const folderUrl = (selectedVehiculo as any).drive_folder_url || (selectedVehiculo as any).url_documentacion
              return (
                <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button
                    className={folderUrl ? 'btn-success' : 'btn-secondary'}
                    onClick={() => {
                      if (folderUrl) window.open(folderUrl, '_blank')
                      else Swal.fire('Sin URL', 'Este vehículo no tiene una URL de documentación configurada', 'info')
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    {folderUrl ? <FolderOpen size={16} /> : <FolderPlus size={16} />}
                    {folderUrl ? 'Ver documentos' : 'Sin carpeta'}
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => { setShowDetailsModal(false); setLastAuditLog(null) }}
                  >
                    Cerrar
                  </button>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* Modal Eliminar */}
      {showDeleteModal && selectedVehiculo && (
        <div className="modal-overlay" onClick={handleCloseDeleteModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ color: '#ff0033' }}>Eliminar Vehículo</h2>
              <button
                className="modal-close"
                onClick={handleCloseDeleteModal}
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
                onClick={handleCancelDelete}
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



      {/* Modal Historial */}
      {historialVehiculo && (
        <HistorialModal
          tipo="vehiculo"
          entityId={historialVehiculo.id}
          entityLabel={historialVehiculo.patente}
          onClose={() => setHistorialVehiculo(null)}
        />
      )}

      {/* Modal Finalización de Asignación */}
      {showFinalizarModal && finalizarData && (
        <div className="modal-overlay" onClick={() => {
          setShowFinalizarModal(false)
          finalizarResolveRef.current?.(false)
        }}>
          <div className="modal-content" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={20} style={{ color: '#ef4444' }} />
                Vehículo con asignación activa
              </h2>
            </div>
            <div className="modal-body" style={{ padding: '16px 24px' }}>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                Este vehículo tiene <strong>{finalizarData.asignaciones.length}</strong> asignación(es) activa(s).
                Al cambiar el estado a <strong>{VEHICULO_ESTADO_LABELS[finalizarData.nuevoEstadoCodigo] || finalizarData.nuevoEstadoCodigo}</strong>, se finalizarán automáticamente.
              </p>

              {/* Conductores afectados */}
              {finalizarData.conductores.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Conductores afectados
                  </label>
                  <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {finalizarData.conductores.map((c, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '8px 12px', borderRadius: '6px',
                        background: 'rgba(239, 68, 68, 0.05)',
                        border: '1px solid rgba(239, 68, 68, 0.12)',
                      }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{c.nombre}</span>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: '4px' }}>{c.horario}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Fecha de finalización */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>
                  Fecha de finalización de asignación
                </label>
                <input
                  type="date"
                  className="form-input"
                  value={finalizarData.fechaFinalizacion}
                  onChange={(e) => setFinalizarData({ ...finalizarData, fechaFinalizacion: e.target.value })}
                  max={new Date().toISOString().split('T')[0]}
                />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                  Esta fecha se usará como fecha de fin de la asignación. Afecta la facturación.
                </span>
              </div>

              {/* Motivo */}
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>
                  Motivo de finalización
                </label>
                <textarea
                  className="form-input"
                  rows={3}
                  placeholder="Ej: Vehículo ingresa a taller por revisión mecánica..."
                  value={finalizarData.motivo}
                  onChange={(e) => setFinalizarData({ ...finalizarData, motivo: e.target.value })}
                  style={{ resize: 'vertical' }}
                />
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '12px 24px', borderTop: '1px solid var(--border-primary)' }}>
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowFinalizarModal(false)
                  finalizarResolveRef.current?.(false)
                }}
              >
                Cancelar
              </button>
              <button
                className="btn-primary"
                style={{ background: '#ef4444', borderColor: '#ef4444' }}
                disabled={!finalizarData.motivo || finalizarData.motivo.trim().length < 5}
                onClick={() => {
                  setShowFinalizarModal(false)
                  finalizarResolveRef.current?.(true)
                }}
              >
                Finalizar y Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
