// src/modules/onboarding/components/ProgramacionAssignmentWizard.tsx
// Wizard visual para crear nuevas programaciones de entregas
// Basado en AssignmentWizard con drag & drop dual conductor
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps */

import { useState, useEffect, useMemo, useRef } from 'react'
import { X, Calendar, User, ChevronRight, Check, Sun, Moon, Route, Loader2, MapPin, Building2 } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import { useSede } from '../../../contexts/SedeContext'
import { TimeInput24h } from '../../../components/ui/TimeInput24h'
import Swal from 'sweetalert2'
import { showSuccess } from '../../../utils/toast'
import type { TipoCandidato, TipoDocumento, TipoAsignacion } from '../../../types/onboarding.types'

// Google Maps API Key
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || 'AIzaSyCCiqk9jWZghUq5rBtSyo6ZjLuMORblY-w'

// Labels para estados
const ESTADO_LABELS: Record<string, string> = {
  por_agendar: 'Por Agendar',
  agendado: 'Agendado',
  en_curso: 'En Curso',
  completado: 'Completado'
}

interface Vehicle {
  id: string
  patente: string
  marca: string
  modelo: string
  anio: number
  color?: string
  estado_id: string
  vehiculos_estados?: {
    codigo: string
    descripcion: string
  }
  asignacionActiva?: {
    id: string
    horario: 'TURNO' | 'CARGO'
    turnoDiurnoOcupado: boolean
    turnoNocturnoOcupado: boolean
  }
  disponibilidad: 'disponible' | 'turno_diurno_libre' | 'turno_nocturno_libre' | 'ocupado' | 'programado'
}

interface Conductor {
  id: string
  numero_licencia: string
  numero_dni: string
  nombres: string
  apellidos: string
  licencia_vencimiento: string
  estado_id: string
  preferencia_turno?: string
  direccion?: string | null
  direccion_lat?: number | null
  direccion_lng?: number | null
  conductores_estados?: {
    codigo: string
    descripcion: string
  }
  tieneAsignacionActiva?: boolean
  tieneAsignacionProgramada?: boolean
  tieneAsignacionDiurna?: boolean
  tieneAsignacionNocturna?: boolean
  // Campos calculados para emparejamiento
  distanciaCalculada?: number | null  // en minutos
}

// Helper para formatear preferencia de turno
const formatPreferencia = (preferencia?: string): string => {
  switch (preferencia) {
    case 'DIURNO': return 'Diurno'
    case 'NOCTURNO': return 'Nocturno'
    case 'A_CARGO': return 'A Cargo'
    case 'SIN_PREFERENCIA': return 'Ambos'
    default: return 'Ambos'
  }
}

// Helper para obtener color de badge segun preferencia
const getPreferenciaBadge = (preferencia?: string): { bg: string; color: string } => {
  switch (preferencia) {
    case 'DIURNO': return { bg: '#FEF3C7', color: '#92400E' }
    case 'NOCTURNO': return { bg: '#DBEAFE', color: '#1E40AF' }
    case 'A_CARGO': return { bg: '#D1FAE5', color: '#065F46' }
    default: return { bg: '#F3F4F6', color: '#6B7280' }
  }
}

interface ProgramacionData {
  sede_id: string
  modalidad: 'TURNO' | 'CARGO' | ''
  vehiculo_id: string
  vehiculo_patente: string
  vehiculo_modelo: string
  vehiculo_color: string
  // Conductor legacy (para A CARGO)
  conductor_id: string
  conductor_nombre: string
  conductor_dni: string
  // Conductor Diurno (para TURNO)
  conductor_diurno_id: string
  conductor_diurno_nombre: string
  conductor_diurno_dni: string
  // Conductor Nocturno (para TURNO)
  conductor_nocturno_id: string
  conductor_nocturno_nombre: string
  conductor_nocturno_dni: string
  // Cita (compartida)
  fecha_cita: string
  hora_cita: string
  // Campos para modo A CARGO (un solo set)
  tipo_candidato_cargo: TipoCandidato | ''
  tipo_asignacion_cargo: TipoAsignacion | ''
  documento_cargo: TipoDocumento | ''
  zona_cargo: string
  distancia_cargo: number | ''
  // Campos para conductor DIURNO
  tipo_candidato_diurno: TipoCandidato | ''
  tipo_asignacion_diurno: TipoAsignacion | ''
  documento_diurno: TipoDocumento | ''
  zona_diurno: string
  distancia_diurno: number | ''
  // Campos para conductor NOCTURNO
  tipo_candidato_nocturno: TipoCandidato | ''
  tipo_asignacion_nocturno: TipoAsignacion | ''
  documento_nocturno: TipoDocumento | ''
  zona_nocturno: string
  distancia_nocturno: number | ''
  // Otros
  observaciones: string
}

// Tipo para datos de edición - usa any para flexibilidad con los campos de la vista
type EditData = {
  id: string
  [key: string]: any
}

interface Props {
  onClose: () => void
  onSuccess: () => void
  editData?: EditData | null
}

export function ProgramacionAssignmentWizard({ onClose, onSuccess, editData }: Props) {
  const { user, profile } = useAuth()
  const { sedeActualId, aplicarFiltroSede, sedeUsuario, sedes } = useSede()
  const isEditMode = !!editData
  const [step, setStep] = useState(0)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [conductores, setConductores] = useState<Conductor[]>([])
  const [loading, setLoading] = useState(false)
  const isSubmittingRef = useRef(false)
  const [loadingVehicles, setLoadingVehicles] = useState(true)
  const [loadingConductores, setLoadingConductores] = useState(true)
  const [vehicleSearch, setVehicleSearch] = useState('')
  const [vehicleAvailabilityFilter, setVehicleAvailabilityFilter] = useState<string>('')
  const [conductorSearch, setConductorSearch] = useState('')
  const [conductorStatusFilter, setConductorStatusFilter] = useState<string>('')
  const [conductorTurnoFilter, setConductorTurnoFilter] = useState<string>('')
  const [conductoresDelVehiculoActual, setConductoresDelVehiculoActual] = useState<string[]>([])

  // Estado para modo de vista por pares cercanos
  const [mostrarParesCercanos, setMostrarParesCercanos] = useState(false)
  const [paresCercanos, setParesCercanos] = useState<Array<{
    diurno: Conductor
    nocturno: Conductor
    distanciaKm: number
    tiempoMinutos?: number
  }>>([])
  const [loadingPares, setLoadingPares] = useState(false)

  const [formData, setFormData] = useState<ProgramacionData>(() => {
    // Si hay datos de edición, pre-cargar
    if (editData) {
      const isCargo = editData.modalidad === 'CARGO'
      return {
        sede_id: editData.sede_id || '',
        modalidad: editData.modalidad || '',
        vehiculo_id: editData.vehiculo_entregar_id || '',
        vehiculo_patente: editData.vehiculo_entregar_patente || editData.vehiculo_entregar_patente_sistema || '',
        vehiculo_modelo: editData.vehiculo_entregar_modelo || editData.vehiculo_entregar_modelo_sistema || '',
        vehiculo_color: editData.vehiculo_entregar_color || '',
        // Conductor legacy (A CARGO)
        conductor_id: editData.conductor_id || '',
        conductor_nombre: editData.conductor_nombre || editData.conductor_display || '',
        conductor_dni: editData.conductor_dni || '',
        // Conductor Diurno
        conductor_diurno_id: editData.conductor_diurno_id || '',
        conductor_diurno_nombre: editData.conductor_diurno_nombre || '',
        conductor_diurno_dni: editData.conductor_diurno_dni || '',
        // Conductor Nocturno
        conductor_nocturno_id: editData.conductor_nocturno_id || '',
        conductor_nocturno_nombre: editData.conductor_nocturno_nombre || '',
        conductor_nocturno_dni: editData.conductor_nocturno_dni || '',
        // Fecha y hora
        fecha_cita: editData.fecha_cita || new Date().toISOString().split('T')[0],
        hora_cita: editData.hora_cita?.substring(0, 5) || '10:00',
        // A CARGO - campos
        tipo_candidato_cargo: (isCargo ? (editData.tipo_candidato || '') : '') as TipoCandidato,
        tipo_asignacion_cargo: (isCargo ? (editData.tipo_asignacion || '') : '') as TipoAsignacion,
        documento_cargo: (isCargo ? (editData.tipo_documento || '') : '') as TipoDocumento,
        zona_cargo: isCargo ? (editData.zona || '') : '',
        distancia_cargo: isCargo ? (editData.distancia_minutos || '') : '',
        // DIURNO - campos
        tipo_candidato_diurno: (editData.tipo_candidato_diurno || '') as TipoCandidato,
        tipo_asignacion_diurno: (editData.tipo_asignacion_diurno || editData.tipo_asignacion || '') as TipoAsignacion,
        documento_diurno: (editData.documento_diurno || '') as TipoDocumento,
        zona_diurno: editData.zona_diurno || '',
        distancia_diurno: editData.distancia_diurno || '',
        // NOCTURNO - campos
        tipo_candidato_nocturno: (editData.tipo_candidato_nocturno || '') as TipoCandidato,
        tipo_asignacion_nocturno: (editData.tipo_asignacion_nocturno || editData.tipo_asignacion || '') as TipoAsignacion,
        documento_nocturno: (editData.documento_nocturno || '') as TipoDocumento,
        zona_nocturno: editData.zona_nocturno || '',
        distancia_nocturno: editData.distancia_nocturno || '',
        observaciones: editData.observaciones || ''
      }
    }
    // Valores por defecto para crear - preseleccionar sede si hay una activa
    return {
      sede_id: sedeActualId || sedeUsuario?.id || '',
      modalidad: '',
      vehiculo_id: '',
      vehiculo_patente: '',
      vehiculo_modelo: '',
      vehiculo_color: '',
      conductor_id: '',
      conductor_nombre: '',
      conductor_dni: '',
      conductor_diurno_id: '',
    conductor_diurno_nombre: '',
    conductor_diurno_dni: '',
    conductor_nocturno_id: '',
    conductor_nocturno_nombre: '',
    conductor_nocturno_dni: '',
    fecha_cita: new Date().toISOString().split('T')[0],
    hora_cita: '10:00',
    // Campos A CARGO
    tipo_candidato_cargo: '',
    tipo_asignacion_cargo: '',
    documento_cargo: '',
    zona_cargo: '',
    distancia_cargo: '',
    // Campos DIURNO
    tipo_candidato_diurno: '',
    tipo_asignacion_diurno: '',
    documento_diurno: '',
    zona_diurno: '',
    distancia_diurno: '',
    // Campos NOCTURNO
    tipo_candidato_nocturno: '',
    tipo_asignacion_nocturno: '',
    documento_nocturno: '',
    zona_nocturno: '',
    distancia_nocturno: '',
    observaciones: ''
    }
  })

  // Cargar vehiculos con informacion de disponibilidad
  useEffect(() => {
    const loadVehicles = async () => {
      setLoadingVehicles(true)
      try {
        // Hacer los 3 queries en PARALELO - solo campos minimos necesarios
        const [vehiculosRes, asignacionesRes, programacionesRes] = await Promise.all([
          aplicarFiltroSede(supabase
            .from('vehiculos')
            .select('id, patente, marca, modelo, anio, color, vehiculos_estados!inner(codigo)')
            .in('vehiculos_estados.codigo', ['PKG_ON_BASE', 'EN_USO', 'DISPONIBLE']))
            .order('patente'),
          aplicarFiltroSede(supabase
            .from('asignaciones')
            .select('vehiculo_id, horario, estado, asignaciones_conductores(horario)')
            .in('estado', ['activa', 'programado'])),
          aplicarFiltroSede(supabase
            .from('programaciones_onboarding')
            .select('vehiculo_entregar_id, id')
            .in('estado', ['por_agendar', 'agendado', 'en_curso']))
        ])

        if (vehiculosRes.error) throw vehiculosRes.error
        const vehiculosData = vehiculosRes.data || []
        const asignacionesData = asignacionesRes.data || []
        const programacionesData = programacionesRes.data || []

        // Crear Maps para busqueda O(1) en vez de O(n)
        const vehiculosProgramadosSet = new Set(
          programacionesData
            .filter((p: any) => !editData || p.id !== editData.id)
            .map((p: any) => p.vehiculo_entregar_id)
        )

        const asignacionesPorVehiculo = new Map<string, any>()
        for (const a of asignacionesData as any[]) {
          const existing = asignacionesPorVehiculo.get(a.vehiculo_id)
          // Priorizar 'activa' sobre 'programado'
          if (!existing || (a.estado === 'activa' && existing.estado !== 'activa')) {
            asignacionesPorVehiculo.set(a.vehiculo_id, a)
          }
        }

        // Calcular disponibilidad de cada vehiculo
        const vehiculosConDisponibilidad: Vehicle[] = vehiculosData.map((vehiculo: any) => {
          const tieneProgramacionPendiente = vehiculosProgramadosSet.has(vehiculo.id)
          const asignacion = asignacionesPorVehiculo.get(vehiculo.id)

          // Si no tiene asignacion activa
          if (!asignacion || asignacion.estado === 'programado') {
            // Si tiene programacion pendiente O asignacion en estado 'programado', marcar como programado
            if (tieneProgramacionPendiente || asignacion) {
              return { ...vehiculo, disponibilidad: 'programado' as const, asignacionActiva: undefined }
            }
            return { ...vehiculo, disponibilidad: 'disponible' as const, asignacionActiva: undefined }
          }

          // Es asignacion activa
          if (asignacion.horario === 'CARGO') {
            // CARGO siempre ocupado - si tiene programacion pendiente, marcar como programado
            if (tieneProgramacionPendiente) {
              return { ...vehiculo, disponibilidad: 'programado' as const, asignacionActiva: undefined }
            }
            return {
              ...vehiculo,
              disponibilidad: 'ocupado' as const,
              asignacionActiva: { id: asignacion.id, horario: 'CARGO' as const, turnoDiurnoOcupado: true, turnoNocturnoOcupado: true }
            }
          }

          // Es TURNO - verificar slots libres
          const conductores = asignacion.asignaciones_conductores || []
          const turnoDiurnoOcupado = conductores.some((c: any) => c.horario === 'diurno')
          const turnoNocturnoOcupado = conductores.some((c: any) => c.horario === 'nocturno')

          let disponibilidad: Vehicle['disponibilidad'] = 'ocupado'
          if (!turnoDiurnoOcupado && !turnoNocturnoOcupado) {
            disponibilidad = 'disponible'
          } else if (!turnoDiurnoOcupado) {
            disponibilidad = 'turno_diurno_libre'
          } else if (!turnoNocturnoOcupado) {
            disponibilidad = 'turno_nocturno_libre'
          }

          // Si tiene programacion pendiente Y esta completamente ocupado, marcar como programado
          // Pero si tiene slot libre, permitir seleccion (mostrar el slot disponible)
          if (tieneProgramacionPendiente && disponibilidad === 'ocupado') {
            return { ...vehiculo, disponibilidad: 'programado' as const, asignacionActiva: undefined }
          }

          return {
            ...vehiculo,
            disponibilidad,
            asignacionActiva: {
              id: asignacion.id,
              horario: 'TURNO' as const,
              turnoDiurnoOcupado,
              turnoNocturnoOcupado
            }
          }
        })

        // Si estamos editando, marcar el vehículo actual como disponible (no programado)
        const vehiculosFinales = vehiculosConDisponibilidad.map((v: any) => {
          if (editData && v.id === editData.vehiculo_entregar_id && v.disponibilidad === 'programado') {
            return { ...v, disponibilidad: 'disponible' }
          }
          return v
        })

        setVehicles(vehiculosFinales)
      } catch (error) {
        console.error('Error loading vehicles:', error)
      } finally {
        setLoadingVehicles(false)
      }
    }

    loadVehicles()
  }, [editData?.id, sedeActualId])

  // Cargar conductores disponibles
  useEffect(() => {
    const loadConductores = async () => {
      setLoadingConductores(true)
      try {
        const { data, error } = await aplicarFiltroSede(supabase
          .from('conductores')
          .select(`
            id,
            numero_licencia,
            numero_dni,
            nombres,
            apellidos,
            licencia_vencimiento,
            estado_id,
            preferencia_turno,
            direccion,
            direccion_lat,
            direccion_lng,
            conductores_estados (
              codigo,
              descripcion
            )
          `))
          .order('apellidos')

        if (error) throw error

        // Filtrar conductores activos
        const conductoresActivos = (data || []).filter((c: any) =>
          c.conductores_estados?.codigo?.toLowerCase().includes('activo')
        ) as unknown as Conductor[]

        // Verificar asignaciones activas o programadas
        const [asignacionesActivasRes, asignacionesProgramadasRes] = await Promise.all([
          supabase
            .from('asignaciones_conductores')
            .select('conductor_id, horario, asignaciones!inner(estado)')
            .eq('asignaciones.estado', 'activa'),
          supabase
            .from('asignaciones_conductores')
            .select('conductor_id, horario, asignaciones!inner(estado)')
            .eq('asignaciones.estado', 'programado')
        ])

        const asignacionesActivas = asignacionesActivasRes.data as { conductor_id: string; horario: string }[] | null
        const asignacionesProgramadas = asignacionesProgramadasRes.data as { conductor_id: string; horario: string }[] | null

        const todasAsignaciones = [...(asignacionesActivas || []), ...(asignacionesProgramadas || [])]

        const conductoresConEstado = conductoresActivos.map(conductor => {
          const asignacionesConductor = todasAsignaciones.filter(a => a.conductor_id === conductor.id)
          const tieneAsignacionActiva = asignacionesActivas?.some((a: any) => a.conductor_id === conductor.id) || false
          const tieneAsignacionProgramada = asignacionesProgramadas?.some((a: any) => a.conductor_id === conductor.id) || false
          const tieneAsignacionDiurna = asignacionesConductor.some(a => a.horario === 'diurno')
          const tieneAsignacionNocturna = asignacionesConductor.some(a => a.horario === 'nocturno')
          const tieneAsignacionCargo = asignacionesConductor.some(a => a.horario !== 'diurno' && a.horario !== 'nocturno')
          
          return {
            ...conductor,
            tieneAsignacionActiva,
            tieneAsignacionProgramada,
            tieneAsignacionDiurna: tieneAsignacionDiurna || tieneAsignacionCargo,
            tieneAsignacionNocturna: tieneAsignacionNocturna || tieneAsignacionCargo
          }
        })

        setConductores(conductoresConEstado)
      } catch (error) {
        console.error('Error loading conductores:', error)
      } finally {
        setLoadingConductores(false)
      }
    }

    loadConductores()
  }, [sedeActualId])

  // Función para cargar Google Maps API si no está disponible
  const loadGoogleMapsAPI = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (window.google?.maps) {
        resolve()
        return
      }

      // Verificar si ya existe el script
      const existingScript = document.querySelector('script[src*="maps.googleapis.com"]')
      if (existingScript) {
        existingScript.addEventListener('load', () => resolve())
        return
      }

      const script = document.createElement('script')
      script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`
      script.async = true
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Error cargando Google Maps'))
      document.head.appendChild(script)
    })
  }

  // Función para geocodificar una dirección usando Google Maps Geocoder
  const geocodificarDireccion = (direccion: string): Promise<{ lat: number; lng: number } | null> => {
    return new Promise((resolve) => {
      const geocoder = new google.maps.Geocoder()
      geocoder.geocode(
        { address: direccion, region: 'ar' },
        (results, status) => {
          if (status === 'OK' && results && results[0]) {
            const location = results[0].geometry.location
            resolve({ lat: location.lat(), lng: location.lng() })
          } else {
            resolve(null)
          }
        }
      )
    })
  }

  // Función para geocodificar conductores que tienen dirección pero no coordenadas
  const geocodificarConductoresSinCoordenadas = async (conductoresLista: Conductor[]): Promise<Conductor[]> => {
    const conductoresActualizados = [...conductoresLista]
    const conductoresSinCoords = conductoresLista.filter(
      c => c.direccion && (!c.direccion_lat || !c.direccion_lng)
    )

    if (conductoresSinCoords.length === 0) return conductoresActualizados

    // Asegurar que Google Maps esté cargado
    await loadGoogleMapsAPI()

    // Geocodificar cada conductor sin coordenadas
    for (const conductor of conductoresSinCoords) {
      try {
        const coords = await geocodificarDireccion(conductor.direccion || '')

        if (coords) {
          // Actualizar en la base de datos (campos custom no tipados)
          await (supabase
            .from('conductores') as any)
            .update({ direccion_lat: coords.lat, direccion_lng: coords.lng })
            .eq('id', conductor.id)

          // Actualizar en el array local
          const index = conductoresActualizados.findIndex(c => c.id === conductor.id)
          if (index !== -1) {
            conductoresActualizados[index] = {
              ...conductoresActualizados[index],
              direccion_lat: coords.lat,
              direccion_lng: coords.lng
            }
          }
        }
      } catch (error) {
        console.error(`Error geocodificando conductor ${conductor.id}:`, error)
      }
    }

    return conductoresActualizados
  }

  // Fórmula de Haversine para calcular distancia en km (muy rápido, sin API)
  const calcularDistanciaHaversine = (
    lat1: number, lng1: number,
    lat2: number, lng2: number
  ): number => {
    const R = 6371 // Radio de la Tierra en km
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLng = (lng2 - lng1) * Math.PI / 180
    const a =
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng/2) * Math.sin(dLng/2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
    return R * c
  }

  // Función para obtener distancia y tiempo en auto usando Distance Matrix API
  const obtenerDistanciaEnAuto = async (
    origen: { lat: number; lng: number },
    destino: { lat: number; lng: number }
  ): Promise<{ distanciaKm: number; tiempoMinutos: number } | null> => {
    try {
      await loadGoogleMapsAPI()

      return new Promise((resolve) => {
        const service = new google.maps.DistanceMatrixService()
        service.getDistanceMatrix(
          {
            origins: [new google.maps.LatLng(origen.lat, origen.lng)],
            destinations: [new google.maps.LatLng(destino.lat, destino.lng)],
            travelMode: google.maps.TravelMode.DRIVING,
            unitSystem: google.maps.UnitSystem.METRIC,
          },
          (response, status) => {
            if (status === 'OK' && response?.rows[0]?.elements[0]?.status === 'OK') {
              const element = response.rows[0].elements[0]
              resolve({
                distanciaKm: Math.round((element.distance.value / 1000) * 10) / 10,
                tiempoMinutos: Math.round(element.duration.value / 60)
              })
            } else {
              resolve(null)
            }
          }
        )
      })
    } catch (error) {
      console.error('Error obteniendo distancia en auto:', error)
      return null
    }
  }

  // Función para calcular y ordenar pares cercanos
  const calcularParesCercanos = async () => {
    setLoadingPares(true)

    try {
      // 1. Primero intentar cargar desde la base de datos (datos pre-calculados)
      const { data: emparajamientosDB, error: errorDB } = await supabase
        .from('conductor_emparajamientos')
        .select(`
          *,
          conductor_a:conductor_a_id(id, nombres, apellidos, numero_dni, preferencia_turno),
          conductor_b:conductor_b_id(id, nombres, apellidos, numero_dni, preferencia_turno)
        `)
        .gte('score', 50)
        .order('score', { ascending: false })
        .limit(50)

      if (!errorDB && emparajamientosDB && emparajamientosDB.length > 0) {
        const paresDB: any[] = []

        for (const emp of emparajamientosDB) {
          const conductorA = emp.conductor_a
          const conductorB = emp.conductor_b

          if (!conductorA || !conductorB) continue

          const esDiurnoA = conductorA.preferencia_turno === 'DIURNO' || conductorA.preferencia_turno === 'SIN_PREFERENCIA' || !conductorA.preferencia_turno
          const esNocturnoA = conductorA.preferencia_turno === 'NOCTURNO' || conductorA.preferencia_turno === 'SIN_PREFERENCIA' || !conductorA.preferencia_turno
          const esDiurnoB = conductorB.preferencia_turno === 'DIURNO' || conductorB.preferencia_turno === 'SIN_PREFERENCIA' || !conductorB.preferencia_turno
          const esNocturnoB = conductorB.preferencia_turno === 'NOCTURNO' || conductorB.preferencia_turno === 'SIN_PREFERENCIA' || !conductorB.preferencia_turno

          let diurno: any = null, nocturno: any = null
          if (esDiurnoA && esNocturnoB) {
            diurno = conductorA
            nocturno = conductorB
          } else if (esNocturnoA && esDiurnoB) {
            diurno = conductorB
            nocturno = conductorA
          }

          if (diurno && nocturno) {
            paresDB.push({
              diurno,
              nocturno,
              distanciaKm: emp.distancia_km,
              tiempoMinutos: emp.tiempo_minutos,
              score: emp.score
            })
          }
        }

        if (paresDB.length > 0) {
          setParesCercanos(paresDB.slice(0, 10))
          setMostrarParesCercanos(true)
          setLoadingPares(false)
          return
        }
      }

      // 2. Fallback: calcular en tiempo real si no hay datos en BD
      
      // Geocodificar conductores sin coordenadas
      const conductoresActualizados = await geocodificarConductoresSinCoordenadas(conductores)
      setConductores(conductoresActualizados)

      // Filtrar conductores con coordenadas y disponibles
      const conductoresConCoords = conductoresActualizados.filter((c: Conductor) =>
        c.direccion_lat && c.direccion_lng
      )

      // Separar por preferencia de turno
      const diurnos = conductoresConCoords.filter((c: Conductor) =>
        c.preferencia_turno === 'DIURNO' || c.preferencia_turno === 'SIN_PREFERENCIA' || !c.preferencia_turno
      )
      const nocturnos = conductoresConCoords.filter((c: Conductor) =>
        c.preferencia_turno === 'NOCTURNO' || c.preferencia_turno === 'SIN_PREFERENCIA' || !c.preferencia_turno
      )

      if (diurnos.length === 0 || nocturnos.length === 0) {
        setParesCercanos([])
        setMostrarParesCercanos(true)
        setLoadingPares(false)
        return
      }

      // Calcular todos los pares posibles con sus distancias (Haversine rápido)
      const pares: Array<{ diurno: Conductor; nocturno: Conductor; distanciaKm: number; tiempoMinutos?: number }> = []

      for (const diurno of diurnos) {
        for (const nocturno of nocturnos) {
          if (diurno.id === nocturno.id) continue
          // Evitar emparejar conductores con exactamente la misma ubicación (duplicados de datos)
          if (diurno.direccion_lat === nocturno.direccion_lat && diurno.direccion_lng === nocturno.direccion_lng) continue

          const distanciaKm = calcularDistanciaHaversine(
            diurno.direccion_lat!,
            diurno.direccion_lng!,
            nocturno.direccion_lat!,
            nocturno.direccion_lng!
          )

          pares.push({ diurno, nocturno, distanciaKm })
        }
      }

      // Ordenar por distancia (más cercanos primero)
      pares.sort((a, b) => a.distanciaKm - b.distanciaKm)

      // Tomar los mejores pares únicos (cada conductor solo una vez)
      const usados = new Set<string>()
      const paresUnicos: typeof pares = []

      for (const par of pares) {
        if (!usados.has(par.diurno.id) && !usados.has(par.nocturno.id)) {
          paresUnicos.push(par)
          usados.add(par.diurno.id)
          usados.add(par.nocturno.id)
        }
      }

      // Top 10 pares
      const top10 = paresUnicos.slice(0, 10)

      // Obtener distancia y tiempo en auto para los top 10 (llamadas a Distance Matrix API)
      const paresConTiempo = await Promise.all(
        top10.map(async (par) => {
          const resultado = await obtenerDistanciaEnAuto(
            { lat: par.diurno.direccion_lat!, lng: par.diurno.direccion_lng! },
            { lat: par.nocturno.direccion_lat!, lng: par.nocturno.direccion_lng! }
          )
          return {
            ...par,
            distanciaKm: resultado?.distanciaKm || par.distanciaKm,
            tiempoMinutos: resultado?.tiempoMinutos
          }
        })
      )

      // Reordenar por tiempo en auto si está disponible
      paresConTiempo.sort((a, b) => {
        if (a.tiempoMinutos && b.tiempoMinutos) return a.tiempoMinutos - b.tiempoMinutos
        return a.distanciaKm - b.distanciaKm
      })

      setParesCercanos(paresConTiempo)
      setMostrarParesCercanos(true)
    } catch (error) {
      console.error('Error calculando pares:', error)
    } finally {
      setLoadingPares(false)
    }
  }

  // Toggle para activar/desactivar vista de pares
  const toggleVistaPares = () => {
    if (!mostrarParesCercanos) {
      calcularParesCercanos()
    } else {
      setMostrarParesCercanos(false)
    }
  }

  const handleNext = async () => {
    if (step === 1) {
      if (!formData.modalidad) {
        Swal.fire('Error', 'Debes seleccionar una modalidad', 'error')
        return
      }
    } else if (step === 2) {
      if (!formData.vehiculo_id) {
        Swal.fire('Error', 'Debes seleccionar un vehiculo', 'error')
        return
      }
      // Cargar conductores del vehiculo antes de pasar al paso 3
      setLoading(true)
      await loadConductoresDelVehiculo(formData.vehiculo_id)
      setLoading(false)
    } else if (step === 3) {
      // Validar conductores segun modalidad
      if (formData.modalidad === 'CARGO') {
        if (!formData.conductor_id) {
          Swal.fire('Error', 'Debes asignar un conductor', 'error')
          return
        }
      } else {
        // Modo TURNO - al menos 1 conductor
        if (!formData.conductor_diurno_id && !formData.conductor_nocturno_id) {
          Swal.fire('Error', 'Debes asignar al menos un conductor (Diurno o Nocturno)', 'error')
          return
        }
        // Validar que no sea el mismo conductor en ambos turnos
        if (formData.conductor_diurno_id && formData.conductor_nocturno_id &&
            formData.conductor_diurno_id === formData.conductor_nocturno_id) {
          Swal.fire('Error', 'No se puede asignar el mismo conductor en ambos turnos', 'error')
          return
        }
      }
    }
    setStep(step + 1)
  }

  const handleBack = () => {
    setStep(step - 1)
  }

  const handleSelectModality = (modalidad: 'TURNO' | 'CARGO') => {
    setFormData({
      ...formData,
      modalidad,
      // Reset conductores al cambiar modalidad
      conductor_id: '',
      conductor_nombre: '',
      conductor_dni: '',
      conductor_diurno_id: '',
      conductor_diurno_nombre: '',
      conductor_diurno_dni: '',
      conductor_nocturno_id: '',
      conductor_nocturno_nombre: '',
      conductor_nocturno_dni: ''
    })
  }

  const handleSelectVehicle = (vehicle: Vehicle) => {
    setFormData({
      ...formData,
      vehiculo_id: vehicle.id,
      vehiculo_patente: vehicle.patente,
      vehiculo_modelo: `${vehicle.marca} ${vehicle.modelo}`,
      vehiculo_color: vehicle.color || ''
    })
  }

  // Cargar conductores asignados al vehiculo seleccionado (llamado en handleNext del paso 2)
  const loadConductoresDelVehiculo = async (vehiculoId: string) => {
    try {
      const { data: asignacionData } = await supabase
        .from('asignaciones')
        .select(`
          id,
          horario,
          asignaciones_conductores (
            horario,
            conductor_id,
            conductores (
              id,
              nombres,
              apellidos,
              numero_dni
            )
          )
        `)
        .eq('vehiculo_id', vehiculoId)
        .eq('estado', 'activa')
        .single()

      if (asignacionData) {
        const asigData = asignacionData as any
        const conductoresAsig = asigData.asignaciones_conductores || []

        // Guardar los IDs de conductores que ya están asignados a este vehículo
        // para que aparezcan disponibles en la lista aunque tengan asignación activa
        const conductorIds = conductoresAsig
          .map((c: any) => c.conductor_id)
          .filter((id: string) => id)
        setConductoresDelVehiculoActual(conductorIds)

        // Solo pre-llenar los campos si la modalidad seleccionada coincide con la del vehículo
        // Si el usuario cambió de CARGO a TURNO (o viceversa), no pre-llenar para que pueda elegir
        const modalidadSeleccionada = formData.modalidad
        const modalidadVehiculo = asigData.horario

        // Si la modalidad coincide, pre-llenar los campos del conductor
        if (modalidadSeleccionada === modalidadVehiculo) {
          let updates: Partial<ProgramacionData> = {}

          if (asigData.horario === 'CARGO') {
            const conductorCargo = conductoresAsig[0]?.conductores
            if (conductorCargo) {
              updates = {
                conductor_id: conductorCargo.id,
                conductor_nombre: `${conductorCargo.nombres} ${conductorCargo.apellidos}`,
                conductor_dni: conductorCargo.numero_dni || ''
              }
            }
          } else {
            const diurnoData = conductoresAsig.find((c: any) => c.horario === 'diurno')
            const nocturnoData = conductoresAsig.find((c: any) => c.horario === 'nocturno')

            if (diurnoData?.conductores) {
              updates.conductor_diurno_id = diurnoData.conductores.id
              updates.conductor_diurno_nombre = `${diurnoData.conductores.nombres} ${diurnoData.conductores.apellidos}`
              updates.conductor_diurno_dni = diurnoData.conductores.numero_dni || ''
            }
            if (nocturnoData?.conductores) {
              updates.conductor_nocturno_id = nocturnoData.conductores.id
              updates.conductor_nocturno_nombre = `${nocturnoData.conductores.nombres} ${nocturnoData.conductores.apellidos}`
              updates.conductor_nocturno_dni = nocturnoData.conductores.numero_dni || ''
            }
          }

          if (Object.keys(updates).length > 0) {
            setFormData(prev => ({ ...prev, ...updates }))
          }
        }
        // Si la modalidad NO coincide, los conductores del vehículo ya están en conductoresDelVehiculoActual
        // y aparecerán en la lista para que el usuario los seleccione manualmente
      } else {
        // No hay asignación activa, limpiar lista de conductores del vehículo
        setConductoresDelVehiculoActual([])
      }
    } catch {
      // Si no hay asignacion activa, limpiar lista
      setConductoresDelVehiculoActual([])
    }
  }

  // Para modo A CARGO
  const handleSelectConductorCargo = (conductorId: string) => {
    const conductor = conductores.find(c => c.id === conductorId)
    if (conductor) {
      setFormData({
        ...formData,
        conductor_id: conductorId,
        conductor_nombre: `${conductor.nombres} ${conductor.apellidos}`,
        conductor_dni: conductor.numero_dni || ''
      })
    }
  }

  // Para modo TURNO - Diurno
  const handleSelectConductorDiurno = (conductorId: string, pairTiempo?: number, pairPartnerId?: string) => {
    const conductor = conductores.find(c => c.id === conductorId)
    if (conductor) {
      setFormData(prev => {
        const updates: any = {
          ...prev,
          conductor_diurno_id: conductorId,
          conductor_diurno_nombre: `${conductor.nombres} ${conductor.apellidos}`,
          conductor_diurno_dni: conductor.numero_dni || ''
        }
        // Si viene de un par y el compañero ya está asignado como nocturno, auto-rellenar distancia
        if (pairTiempo && pairPartnerId && prev.conductor_nocturno_id === pairPartnerId) {
          updates.distancia_diurno = pairTiempo
          updates.distancia_nocturno = pairTiempo
        }
        return updates
      })
    }
  }

  // Para modo TURNO - Nocturno
  const handleSelectConductorNocturno = (conductorId: string, pairTiempo?: number, pairPartnerId?: string) => {
    const conductor = conductores.find(c => c.id === conductorId)
    if (conductor) {
      setFormData(prev => {
        const updates: any = {
          ...prev,
          conductor_nocturno_id: conductorId,
          conductor_nocturno_nombre: `${conductor.nombres} ${conductor.apellidos}`,
          conductor_nocturno_dni: conductor.numero_dni || ''
        }
        // Si viene de un par y el compañero ya está asignado como diurno, auto-rellenar distancia
        if (pairTiempo && pairPartnerId && prev.conductor_diurno_id === pairPartnerId) {
          updates.distancia_diurno = pairTiempo
          updates.distancia_nocturno = pairTiempo
        }
        return updates
      })
    }
  }

  // Remover conductor de turno
  const handleRemoveConductorTurno = (tipo: 'diurno' | 'nocturno' | 'cargo') => {
    if (tipo === 'diurno') {
      setFormData({
        ...formData,
        conductor_diurno_id: '',
        conductor_diurno_nombre: '',
        conductor_diurno_dni: ''
      })
    } else if (tipo === 'nocturno') {
      setFormData({
        ...formData,
        conductor_nocturno_id: '',
        conductor_nocturno_nombre: '',
        conductor_nocturno_dni: ''
      })
    } else {
      setFormData({
        ...formData,
        conductor_id: '',
        conductor_nombre: '',
        conductor_dni: ''
      })
    }
  }

  // Auto-calcular distancia en auto cuando ambos conductores están asignados
  // (solo si no se auto-rellenó desde un par arrastrado)
  useEffect(() => {
    if (!formData.conductor_diurno_id || !formData.conductor_nocturno_id) return
    // No sobreescribir valores ya presentes (de par o manuales)
    if (formData.distancia_diurno && formData.distancia_nocturno) return

    const diurno = conductores.find(c => c.id === formData.conductor_diurno_id)
    const nocturno = conductores.find(c => c.id === formData.conductor_nocturno_id)

    if (!diurno?.direccion_lat || !diurno?.direccion_lng || !nocturno?.direccion_lat || !nocturno?.direccion_lng) return

    // Calcular distancia en auto entre los conductores
    obtenerDistanciaEnAuto(
      { lat: diurno.direccion_lat, lng: diurno.direccion_lng },
      { lat: nocturno.direccion_lat, lng: nocturno.direccion_lng }
    ).then(resultado => {
      if (resultado?.tiempoMinutos) {
        setFormData(prev => {
          // Re-verificar que no se hayan llenado mientras esperábamos
          if (prev.distancia_diurno && prev.distancia_nocturno) return prev
          return {
            ...prev,
            distancia_diurno: resultado.tiempoMinutos,
            distancia_nocturno: resultado.tiempoMinutos
          }
        })
      }
    })
  }, [formData.conductor_diurno_id, formData.conductor_nocturno_id])

  const handleSubmit = async () => {
    if (loading || isSubmittingRef.current) return
    isSubmittingRef.current = true

    // Validaciones
    if (!formData.fecha_cita) {
      Swal.fire('Error', 'Debes seleccionar una fecha de cita', 'error')
      return
    }

    // Validar campos segun modalidad
    if (formData.modalidad === 'CARGO') {
      if (!formData.tipo_candidato_cargo) {
        Swal.fire('Error', 'Debes seleccionar el tipo de candidato', 'error')
        return
      }
      if (!formData.documento_cargo) {
        Swal.fire('Error', 'Debes seleccionar el tipo de documento', 'error')
        return
      }
      if (!formData.zona_cargo) {
        Swal.fire('Error', 'Debes ingresar la zona', 'error')
        return
      }
    } else {
      // Modo TURNO - validar campos para conductores asignados
      if (formData.conductor_diurno_id) {
        if (!formData.tipo_candidato_diurno) {
          Swal.fire('Error', 'Debes seleccionar el tipo de candidato para el conductor diurno', 'error')
          return
        }
        if (!formData.documento_diurno) {
          Swal.fire('Error', 'Debes seleccionar el documento para el conductor diurno', 'error')
          return
        }
        if (!formData.zona_diurno) {
          Swal.fire('Error', 'Debes ingresar la zona para el conductor diurno', 'error')
          return
        }
      }
      if (formData.conductor_nocturno_id) {
        if (!formData.tipo_candidato_nocturno) {
          Swal.fire('Error', 'Debes seleccionar el tipo de candidato para el conductor nocturno', 'error')
          return
        }
        if (!formData.documento_nocturno) {
          Swal.fire('Error', 'Debes seleccionar el documento para el conductor nocturno', 'error')
          return
        }
        if (!formData.zona_nocturno) {
          Swal.fire('Error', 'Debes ingresar la zona para el conductor nocturno', 'error')
          return
        }
      }
    }

    // Validar duplicados solo al crear (no en edición)
    if (!isEditMode) {
      try {
        // Estados activos (no cancelados ni completados)
        const estadosActivos = ['por_agendar', 'agendado', 'en_curso']

        // Verificar si el vehículo ya está programado
        const { data: vehiculosProgramados } = await aplicarFiltroSede(supabase
          .from('programaciones_onboarding')
          .select('id, vehiculo_entregar_patente, estado')
          .eq('vehiculo_entregar_id', formData.vehiculo_id)
          .in('estado', estadosActivos))
          .limit(1) as { data: Array<{ id: string; vehiculo_entregar_patente: string; estado: string }> | null }

        const vehiculoProgramado = vehiculosProgramados?.[0]
        if (vehiculoProgramado) {
          Swal.fire({
            icon: 'warning',
            title: 'Vehículo ya programado',
            html: `El vehículo <strong>${formData.vehiculo_patente}</strong> ya tiene una programación activa (${ESTADO_LABELS[vehiculoProgramado.estado] || vehiculoProgramado.estado}).<br><br>Debe cancelar o completar esa programación primero.`,
            confirmButtonColor: '#FF0033'
          })
          return
        }

        // Verificar conductores duplicados según modalidad
        const conductoresToCheck: { id: string, nombre: string, tipo: string }[] = []

        if (formData.modalidad === 'CARGO' && formData.conductor_id) {
          conductoresToCheck.push({ id: formData.conductor_id, nombre: formData.conductor_nombre, tipo: 'A Cargo' })
        } else {
          if (formData.conductor_diurno_id) {
            conductoresToCheck.push({ id: formData.conductor_diurno_id, nombre: formData.conductor_diurno_nombre, tipo: 'Diurno' })
          }
          if (formData.conductor_nocturno_id) {
            conductoresToCheck.push({ id: formData.conductor_nocturno_id, nombre: formData.conductor_nocturno_nombre, tipo: 'Nocturno' })
          }
        }

        for (const conductor of conductoresToCheck) {
          // Buscar en todos los campos posibles de conductor
          const { data: conductoresProgramados } = await aplicarFiltroSede(supabase
            .from('programaciones_onboarding')
            .select('id, vehiculo_entregar_patente, estado')
            .in('estado', estadosActivos)
            .or(`conductor_id.eq.${conductor.id},conductor_diurno_id.eq.${conductor.id},conductor_nocturno_id.eq.${conductor.id}`))
            .limit(1) as { data: Array<{ id: string; vehiculo_entregar_patente: string; estado: string }> | null }

          const conductorProgramado = conductoresProgramados?.[0]
          if (conductorProgramado) {
            Swal.fire({
              icon: 'warning',
              title: 'Conductor ya programado',
              html: `El conductor <strong>${conductor.nombre}</strong> (${conductor.tipo}) ya tiene una programación activa para el vehículo ${conductorProgramado.vehiculo_entregar_patente} (${ESTADO_LABELS[conductorProgramado.estado] || conductorProgramado.estado}).<br><br>Debe cancelar o completar esa programación primero.`,
              confirmButtonColor: '#FF0033'
            })
            return
          }
        }
      } catch (checkError: any) {
        // Si es error de "no rows" es OK, significa que no hay duplicados
        if (checkError.code !== 'PGRST116') {
          console.error('Error verificando duplicados:', checkError)
        }
      }
    }

    setLoading(true)

    try {
      // Preparar datos para insertar/actualizar
      const saveData: any = {
        modalidad: formData.modalidad,
        vehiculo_entregar_id: formData.vehiculo_id,
        vehiculo_entregar_patente: formData.vehiculo_patente,
        vehiculo_entregar_modelo: formData.vehiculo_modelo,
        vehiculo_entregar_color: formData.vehiculo_color,
        fecha_cita: formData.fecha_cita,
        hora_cita: formData.hora_cita,
        observaciones: formData.observaciones || null
      }

      if (formData.modalidad === 'CARGO') {
        // A CARGO - usar campos legacy con un solo set de datos
        saveData.conductor_id = formData.conductor_id
        saveData.conductor_nombre = formData.conductor_nombre
        saveData.conductor_dni = formData.conductor_dni
        saveData.tipo_candidato = formData.tipo_candidato_cargo || null
        saveData.tipo_asignacion = formData.tipo_asignacion_cargo || 'entrega_auto'
        saveData.tipo_documento = formData.documento_cargo
        saveData.zona = formData.zona_cargo
        saveData.distancia_minutos = formData.distancia_cargo || null
        // Limpiar campos de turno
        saveData.conductor_diurno_id = null
        saveData.conductor_diurno_nombre = null
        saveData.conductor_diurno_dni = null
        saveData.conductor_nocturno_id = null
        saveData.conductor_nocturno_nombre = null
        saveData.conductor_nocturno_dni = null
        saveData.tipo_candidato_diurno = null
        saveData.tipo_candidato_nocturno = null
        saveData.tipo_asignacion_diurno = null
        saveData.tipo_asignacion_nocturno = null
        saveData.documento_diurno = null
        saveData.documento_nocturno = null
        saveData.zona_diurno = null
        saveData.zona_nocturno = null
        saveData.distancia_diurno = null
        saveData.distancia_nocturno = null
      } else {
        // TURNO - usar campos duales con datos por conductor
        saveData.conductor_diurno_id = formData.conductor_diurno_id || null
        saveData.conductor_diurno_nombre = formData.conductor_diurno_nombre || null
        saveData.conductor_diurno_dni = formData.conductor_diurno_dni || null
        saveData.tipo_candidato_diurno = formData.tipo_candidato_diurno || null
        saveData.tipo_asignacion_diurno = formData.tipo_asignacion_diurno || null
        saveData.documento_diurno = formData.documento_diurno || null
        saveData.zona_diurno = formData.zona_diurno || null
        saveData.distancia_diurno = formData.distancia_diurno || null

        saveData.conductor_nocturno_id = formData.conductor_nocturno_id || null
        saveData.conductor_nocturno_nombre = formData.conductor_nocturno_nombre || null
        saveData.conductor_nocturno_dni = formData.conductor_nocturno_dni || null
        saveData.tipo_candidato_nocturno = formData.tipo_candidato_nocturno || null
        saveData.tipo_asignacion_nocturno = formData.tipo_asignacion_nocturno || null
        saveData.documento_nocturno = formData.documento_nocturno || null
        saveData.zona_nocturno = formData.zona_nocturno || null
        saveData.distancia_nocturno = formData.distancia_nocturno || null

        // Zona general = primera zona disponible
        saveData.zona = formData.zona_diurno || formData.zona_nocturno
        // Tipo candidato general = primero disponible
        saveData.tipo_candidato = formData.tipo_candidato_diurno || formData.tipo_candidato_nocturno || null
        // Tipo asignacion general = usar el primero seleccionado (para compatibilidad)
        saveData.tipo_asignacion = formData.tipo_asignacion_diurno || formData.tipo_asignacion_nocturno || 'entrega_auto'
        // Distancia general = primera disponible
        saveData.distancia_minutos = formData.distancia_diurno || formData.distancia_nocturno || null
        // Limpiar campos legacy
        saveData.conductor_id = null
        saveData.conductor_nombre = null
        saveData.conductor_dni = null
        saveData.tipo_documento = null
      }

      let error
      if (isEditMode && editData) {
        // ACTUALIZAR
        const result = await (supabase
          .from('programaciones_onboarding') as any)
          .update(saveData)
          .eq('id', editData.id)
        error = result.error
      } else {
        // CREAR
        saveData.estado = 'por_agendar'
        // tipo_asignacion ya se setea arriba según modalidad
        saveData.documento_listo = false
        saveData.grupo_whatsapp = false
        saveData.citado_ypf = false
        saveData.created_by = user?.id
        saveData.created_by_name = profile?.full_name || 'Sistema'
        saveData.sede_id = sedeActualId || sedeUsuario?.id
        
        const result = await (supabase
          .from('programaciones_onboarding') as any)
          .insert(saveData)
        error = result.error
      }

      if (error) throw error

      showSuccess(isEditMode ? 'Programación actualizada' : 'Programación creada', isEditMode ? 'Los cambios se guardaron correctamente' : 'La programación se agregó al tablero')

      onSuccess()
      onClose()
    } catch (error: any) {
      console.error('Error guardando programacion:', error)
      Swal.fire('Error', error.message || 'No se pudo guardar la programacion', 'error')
    } finally {
      setLoading(false)
      isSubmittingRef.current = false
    }
  }

  // Filtrar vehiculos con useMemo
  const filteredVehicles = useMemo(() => {
    const searchLower = vehicleSearch.toLowerCase()
    return vehicles
      .filter(v => {
        // En modo edicion, siempre incluir el vehiculo actual
        if (isEditMode && v.id === formData.vehiculo_id) {
          return true
        }

        const matchesSearch = !searchLower || 
          v.patente.toLowerCase().includes(searchLower) ||
          v.marca.toLowerCase().includes(searchLower) ||
          v.modelo.toLowerCase().includes(searchLower)

        const matchesAvailability = vehicleAvailabilityFilter === '' ||
          vehicleAvailabilityFilter === v.disponibilidad ||
          (vehicleAvailabilityFilter === 'con_turno_libre' &&
            (v.disponibilidad === 'turno_diurno_libre' || v.disponibilidad === 'turno_nocturno_libre')) ||
          (vehicleAvailabilityFilter === 'en_uso' &&
            (v.disponibilidad === 'ocupado' || v.disponibilidad === 'turno_diurno_libre' || v.disponibilidad === 'turno_nocturno_libre'))

        return matchesSearch && matchesAvailability
      })
      .sort((a, b) => {
        // En modo edicion, poner el vehiculo actual primero
        if (isEditMode && formData.vehiculo_id) {
          if (a.id === formData.vehiculo_id) return -1
          if (b.id === formData.vehiculo_id) return 1
        }
        const prioridad: Record<string, number> = {
          'disponible': 0,
          'turno_diurno_libre': 1,
          'turno_nocturno_libre': 1,
          'ocupado': 2
        }
        const prioA = prioridad[a.disponibilidad] ?? 99
        const prioB = prioridad[b.disponibilidad] ?? 99
        return prioA - prioB
      })
  }, [vehicles, vehicleSearch, vehicleAvailabilityFilter, isEditMode, formData.vehiculo_id])

  // Obtener conductores seleccionados (buscar en lista o crear objeto temporal con datos del form)
  const conductorDiurno = conductores.find(c => c.id === formData.conductor_diurno_id) || 
    (formData.conductor_diurno_id && formData.conductor_diurno_nombre ? {
      id: formData.conductor_diurno_id,
      nombres: formData.conductor_diurno_nombre.split(' ')[0] || '',
      apellidos: formData.conductor_diurno_nombre.split(' ').slice(1).join(' ') || '',
      numero_dni: formData.conductor_diurno_dni || ''
    } as Conductor : undefined)
  
  const conductorNocturno = conductores.find(c => c.id === formData.conductor_nocturno_id) ||
    (formData.conductor_nocturno_id && formData.conductor_nocturno_nombre ? {
      id: formData.conductor_nocturno_id,
      nombres: formData.conductor_nocturno_nombre.split(' ')[0] || '',
      apellidos: formData.conductor_nocturno_nombre.split(' ').slice(1).join(' ') || '',
      numero_dni: formData.conductor_nocturno_dni || ''
    } as Conductor : undefined)
  
  const conductorCargo = conductores.find(c => c.id === formData.conductor_id) ||
    (formData.conductor_id && formData.conductor_nombre ? {
      id: formData.conductor_id,
      nombres: formData.conductor_nombre.split(' ')[0] || '',
      apellidos: formData.conductor_nombre.split(' ').slice(1).join(' ') || '',
      numero_dni: formData.conductor_dni || ''
    } as Conductor : undefined)

  // Modo TURNO o CARGO
  const isTurnoMode = formData.modalidad === 'TURNO'

  // Filtrar conductores disponibles con useMemo
  const filteredConductores = useMemo(() => {
    const searchLower = conductorSearch.toLowerCase()
    return conductores
      .filter(c => {
        // Excluir conductores ya seleccionados en los slots
        if (c.id === formData.conductor_diurno_id || c.id === formData.conductor_nocturno_id || c.id === formData.conductor_id) return false

        const matchesSearch = !searchLower ||
          c.nombres.toLowerCase().includes(searchLower) ||
          c.apellidos.toLowerCase().includes(searchLower) ||
          (c.numero_dni || '').includes(searchLower)

        // Si el conductor ya está asignado al vehículo seleccionado, SIEMPRE mostrarlo
        // (solo respetando la búsqueda, ignorando otros filtros)
        const esDelVehiculoActual = conductoresDelVehiculoActual.includes(c.id)
        if (esDelVehiculoActual && matchesSearch) {
          return true
        }

        // Filtro por estado (solo para conductores que NO son del vehículo actual)
        let matchesStatus = true
        if (conductorStatusFilter === 'disponible') {
          matchesStatus = !c.tieneAsignacionActiva && !c.tieneAsignacionProgramada
        } else if (conductorStatusFilter === 'activo') {
          matchesStatus = c.tieneAsignacionActiva || false
        } else if (conductorStatusFilter === 'con_asignacion') {
          matchesStatus = c.tieneAsignacionActiva || c.tieneAsignacionProgramada || false
        }

        // Filtro por preferencia de turno
        let matchesTurno = true
        if (conductorTurnoFilter === 'diurno') {
          matchesTurno = c.preferencia_turno === 'DIURNO' || c.preferencia_turno === 'SIN_PREFERENCIA'
        } else if (conductorTurnoFilter === 'nocturno') {
          matchesTurno = c.preferencia_turno === 'NOCTURNO' || c.preferencia_turno === 'SIN_PREFERENCIA'
        } else if (conductorTurnoFilter === 'cargo') {
          matchesTurno = c.preferencia_turno === 'A_CARGO'
        }

        return matchesSearch && matchesStatus && matchesTurno
      })
      .sort((a, b) => {
        // Conductores del vehículo actual primero
        const aEsDelVehiculo = conductoresDelVehiculoActual.includes(a.id)
        const bEsDelVehiculo = conductoresDelVehiculoActual.includes(b.id)
        if (aEsDelVehiculo && !bEsDelVehiculo) return -1
        if (!aEsDelVehiculo && bEsDelVehiculo) return 1
        // Disponibles segundo
        if (!a.tieneAsignacionActiva && b.tieneAsignacionActiva) return -1
        if (a.tieneAsignacionActiva && !b.tieneAsignacionActiva) return 1
        return a.apellidos.localeCompare(b.apellidos)
      })
  }, [conductores, conductorSearch, conductorStatusFilter, conductorTurnoFilter, formData.conductor_diurno_id, formData.conductor_nocturno_id, formData.conductor_id, conductoresDelVehiculoActual])

  return (
    <>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .wizard-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
          backdrop-filter: blur(4px);
        }

        .wizard-container {
          background: var(--modal-bg);
          border-radius: 20px;
          width: 100%;
          max-width: 1100px;
          height: 92vh;
          max-height: 800px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          border: 1px solid var(--border-primary);
        }

        .wizard-header {
          padding: 16px 28px;
          border-bottom: 1px solid var(--border-primary);
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-shrink: 0;
        }

        .wizard-title {
          margin: 0;
          font-size: clamp(16px, 1.5vw, 20px);
          font-weight: 700;
          color: var(--text-primary);
          letter-spacing: -0.5px;
        }

        .wizard-subtitle {
          margin: 4px 0 0 0;
          font-size: clamp(10px, 1vw, 12px);
          color: var(--text-secondary);
          font-weight: 400;
        }

        .btn-close {
          background: none;
          border: none;
          color: var(--text-secondary);
          cursor: pointer;
          padding: 8px;
          border-radius: 6px;
          transition: all 0.2s;
        }

        .btn-close:hover {
          background: #E5E7EB;
          color: var(--text-primary);
        }

        .wizard-stepper {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px 24px;
          border-bottom: 1px solid var(--border-primary);
          flex-shrink: 0;
        }

        .step-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          position: relative;
        }

        .step-circle {
          width: clamp(32px, 3vw, 40px);
          height: clamp(32px, 3vw, 40px);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: clamp(11px, 1vw, 14px);
          border: 2px solid var(--border-primary);
          background: var(--modal-bg);
          color: var(--text-tertiary);
          transition: all 0.25s ease;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
        }

        .step-circle.active {
          background: #ff0033;
          border-color: #ff0033;
          color: white;
          box-shadow: 0 4px 12px rgba(230, 57, 70, 0.3);
          transform: scale(1.05);
        }

        .step-circle.completed {
          background: #10B981;
          border-color: #10B981;
          color: white;
          box-shadow: 0 2px 8px rgba(16, 185, 129, 0.2);
        }

        .step-label {
          font-size: clamp(9px, 0.8vw, 11px);
          font-weight: 600;
          color: var(--text-tertiary);
          white-space: nowrap;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }

        .step-label.active {
          color: var(--color-primary);
        }

        .step-label.completed {
          color: #10B981;
        }

        .step-connector {
          width: 80px;
          height: 2px;
          background: var(--border-primary);
          margin: 0 12px;
          margin-bottom: 28px;
          border-radius: 2px;
          transition: all 0.3s ease;
        }

        .step-connector.completed {
          background: #10B981;
        }

        .wizard-content {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 20px 24px;
          background: var(--bg-secondary);
          box-sizing: border-box;
        }

        .wizard-content::-webkit-scrollbar {
          width: 0px;
          background: transparent;
        }

        .wizard-footer {
          padding: 20px 40px;
          border-top: 1px solid var(--border-primary);
          display: flex;
          justify-content: space-between;
          background: var(--modal-bg);
        }

        .btn {
          padding: 14px 28px;
          border-radius: 10px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border: none;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .btn-secondary {
          background: var(--bg-secondary);
          color: var(--text-secondary);
          border: 2px solid var(--border-primary);
          box-shadow: none;
        }

        .btn-secondary:hover {
          background: var(--bg-tertiary);
          border-color: var(--text-tertiary);
          color: var(--text-primary);
        }

        .btn-primary {
          background: var(--color-primary);
          color: white;
          border: 2px solid var(--color-primary);
        }

        .btn-primary:hover {
          background: var(--color-primary-hover);
          box-shadow: 0 4px 12px var(--color-primary-shadow);
          transform: translateY(-1px);
        }

        .btn-primary:disabled {
          background: var(--bg-tertiary);
          border-color: var(--bg-tertiary);
          color: var(--text-tertiary);
          cursor: not-allowed;
          box-shadow: none;
          transform: none;
        }

        .modality-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 20px;
          max-width: 700px;
          margin: 0 auto;
        }

        .modality-card {
          border: 2px solid var(--border-primary);
          border-radius: 16px;
          padding: 40px 24px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s ease;
          background: var(--bg-secondary);
          position: relative;
          overflow: hidden;
        }

        .modality-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 4px;
          background: transparent;
          transition: all 0.2s ease;
        }

        .modality-card:hover {
          border-color: #ff0033;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
        }

        .modality-card:hover::before {
          background: #ff0033;
        }

        .modality-card.selected {
          border-color: #ff0033;
          background: var(--modal-bg);
          box-shadow: 0 4px 16px rgba(230, 57, 70, 0.15);
        }

        .modality-card.selected::before {
          background: #ff0033;
        }

        .modality-icon {
          margin-bottom: 20px;
          color: var(--text-secondary);
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .modality-card:hover .modality-icon,
        .modality-card.selected .modality-icon {
          color: #ff0033;
          transform: scale(1.1);
        }

        .modality-title {
          font-size: clamp(16px, 1.5vw, 20px);
          font-weight: 700;
          color: var(--text-primary);
          margin: 0 0 8px 0;
        }

        .modality-description {
          font-size: clamp(11px, 1vw, 13px);
          color: var(--text-secondary);
          margin: 0;
          line-height: 1.5;
        }

        .vehicle-grid {
          display: grid;
          gap: 12px;
          max-height: 400px;
          overflow-y: auto;
          padding-right: 8px;
        }

        .vehicle-grid::-webkit-scrollbar {
          width: 6px;
        }

        .vehicle-grid::-webkit-scrollbar-track {
          background: #F3F4F6;
          border-radius: 3px;
        }

        .vehicle-grid::-webkit-scrollbar-thumb {
          background: #D1D5DB;
          border-radius: 3px;
        }

        .vehicle-card {
          border: 2px solid var(--border-primary);
          border-radius: 14px;
          padding: 20px;
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 16px;
          align-items: center;
          cursor: pointer;
          transition: all 0.2s ease;
          background: var(--modal-bg);
        }

        .vehicle-card:hover {
          border-color: #ff0033;
          background: var(--modal-bg);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
          transform: translateY(-1px);
        }

        .vehicle-card.selected {
          border-color: #ff0033;
          background: linear-gradient(to right, #FEF2F2 0%, #FFF 100%);
          box-shadow: 0 4px 16px rgba(230, 57, 70, 0.15);
        }

        .vehicle-info {
          flex: 1;
        }

        .vehicle-patente {
          font-size: clamp(14px, 1.3vw, 17px);
          font-weight: 700;
          color: var(--text-primary);
          margin: 0 0 6px 0;
          letter-spacing: 0.5px;
        }

        .vehicle-details {
          font-size: clamp(11px, 1vw, 13px);
          color: var(--text-secondary);
          margin: 0;
        }

        .radio-circle {
          width: 26px;
          height: 26px;
          border: 3px solid #D1D5DB;
          border-radius: 50%;
          position: relative;
          transition: all 0.2s ease;
          flex-shrink: 0;
        }

        .radio-circle.selected {
          border-color: #ff0033;
          background: #FEF2F2;
        }

        .radio-circle.selected::after {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 12px;
          height: 12px;
          background: #ff0033;
          border-radius: 50%;
        }

        .conductores-layout {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 20px;
          width: 100%;
        }

        .conductores-layout.cargo-mode {
          grid-template-columns: 1fr 1fr;
        }

        .conductores-column {
          border: 2px solid var(--border-primary);
          border-radius: 12px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          background: var(--modal-bg);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
          min-height: 300px;
          max-height: 400px;
          overflow: hidden;
        }

        .conductores-column.turno-diurno {
          border-color: #FCD34D;
          background: linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%);
        }

        .conductores-column.turno-nocturno {
          border-color: #93C5FD;
          background: linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%);
        }

        .conductores-column.a-cargo {
          border-color: #6EE7B7;
          background: linear-gradient(135deg, #F0FDF4 0%, #D1FAE5 100%);
        }

        .turno-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 4px 12px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .turno-badge.diurno {
          background: linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%);
          color: #92400E;
        }

        .turno-badge.nocturno {
          background: linear-gradient(135deg, #DBEAFE 0%, #BFDBFE 100%);
          color: #1E40AF;
        }

        .turno-badge.cargo {
          background: linear-gradient(135deg, #D1FAE5 0%, #A7F3D0 100%);
          color: #065F46;
        }

        .conductores-list {
          flex: 1;
          overflow-y: auto;
          padding-right: 6px;
        }

        .conductores-list::-webkit-scrollbar {
          width: 6px;
        }

        .conductores-list::-webkit-scrollbar-track {
          background: #F3F4F6;
          border-radius: 3px;
        }

        .conductores-list::-webkit-scrollbar-thumb {
          background: #D1D5DB;
          border-radius: 3px;
        }

        .conductores-column h4 {
          margin: 0 0 12px 0;
          font-size: clamp(12px, 1vw, 14px);
          font-weight: 700;
          color: var(--text-primary);
          padding-bottom: 10px;
          border-bottom: 2px solid rgba(0, 0, 0, 0.1);
          flex-shrink: 0;
        }

        .conductor-item {
          border: 1px solid #E5E7EB;
          border-radius: 8px;
          padding: 10px;
          margin-bottom: 8px;
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: grab;
          transition: all 0.2s ease;
          background: var(--modal-bg);
        }

        .conductor-item:hover {
          border-color: #ff0033;
          background: var(--modal-bg);
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
        }

        .conductor-item.dragging {
          opacity: 0.5;
          transform: scale(0.95);
        }

        .conductor-avatar {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: linear-gradient(135deg, #E5E7EB 0%, #D1D5DB 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 12px;
          color: var(--text-secondary);
          flex-shrink: 0;
        }

        .conductor-info {
          flex: 1;
          min-width: 0;
        }

        .conductor-name {
          font-size: clamp(10px, 0.9vw, 12px);
          font-weight: 600;
          color: var(--text-primary);
          margin: 0 0 2px 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .conductor-license {
          font-size: clamp(9px, 0.8vw, 11px);
          color: var(--text-tertiary);
          margin: 0;
          font-weight: 500;
        }

        .drop-zone {
          min-height: 80px;
          border: 2px dashed #D1D5DB;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 12px;
          transition: all 0.2s ease;
        }

        .drop-zone.drag-over {
          border-color: #ff0033;
          background: rgba(230, 57, 70, 0.05);
        }

        .drop-zone.has-conductor {
          border-style: solid;
          border-color: #10B981;
          background: var(--modal-bg);
        }

        .drop-zone-empty {
          color: var(--text-tertiary);
          font-size: 12px;
          text-align: center;
        }

        .assigned-conductor-card {
          width: 100%;
          border: 2px solid #10B981;
          border-radius: 10px;
          padding: 12px;
          background: var(--modal-bg);
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .remove-btn {
          background: none;
          border: none;
          color: #EF4444;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          transition: all 0.2s;
        }

        .remove-btn:hover {
          background: #FEE2E2;
        }

        .step-description {
          text-align: center;
          margin-bottom: clamp(12px, 1.5vw, 20px);
        }

        .step-description h3 {
          font-size: clamp(14px, 1.3vw, 18px);
          font-weight: 700;
          color: var(--text-primary);
          margin: 0 0 6px 0;
        }

        .step-description p {
          font-size: clamp(10px, 0.9vw, 13px);
          color: var(--text-secondary);
          margin: 0;
          line-height: 1.5;
        }

        .empty-state {
          text-align: center;
          padding: 32px;
          color: var(--text-tertiary);
          font-size: 14px;
        }

        @media (max-width: 900px) {
          .conductores-layout {
            grid-template-columns: 1fr;
          }
          .conductores-layout.cargo-mode {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 768px) {
          .wizard-container {
            max-width: 100%;
            max-height: 100vh;
            border-radius: 0;
          }

          .modality-grid {
            grid-template-columns: 1fr;
          }

          .step-connector {
            width: 60px;
          }
        }

        /* Dark Mode */
        [data-theme="dark"] .wizard-header {
          border-color: var(--border-primary);
        }
        [data-theme="dark"] .wizard-header h2 {
          color: var(--text-primary);
        }
        [data-theme="dark"] .wizard-header p {
          color: var(--text-secondary);
        }
        [data-theme="dark"] .wizard-progress {
          border-color: var(--border-primary);
        }
        [data-theme="dark"] .wizard-footer {
          border-color: var(--border-primary);
        }
        [data-theme="dark"] .step-description {
          background: var(--bg-secondary);
          border-color: var(--border-primary);
        }
        [data-theme="dark"] .step-description h3 {
          color: var(--text-primary);
        }
        [data-theme="dark"] .step-description p {
          color: var(--text-secondary);
        }
        [data-theme="dark"] .modality-card {
          background: var(--bg-secondary);
          border-color: var(--border-primary);
        }
        [data-theme="dark"] .modality-card:hover {
          border-color: var(--color-primary);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
        }
        [data-theme="dark"] .modality-card.selected {
          border-color: var(--color-primary);
          background: var(--bg-secondary);
        }
        [data-theme="dark"] .modality-icon {
          color: var(--text-secondary);
        }
        [data-theme="dark"] .modality-title {
          color: var(--text-primary);
        }
        [data-theme="dark"] .modality-description {
          color: var(--text-secondary);
        }
        [data-theme="dark"] .vehicle-card {
          background: var(--bg-secondary);
          border-color: var(--border-primary);
        }
        [data-theme="dark"] .vehicle-card:hover {
          border-color: var(--color-primary);
          background: var(--bg-secondary);
        }
        [data-theme="dark"] .vehicle-card.selected {
          border-color: var(--color-primary);
          background: var(--bg-tertiary);
        }
        [data-theme="dark"] .vehicle-patente {
          color: var(--text-primary);
        }
        [data-theme="dark"] .vehicle-details {
          color: var(--text-secondary);
        }
        [data-theme="dark"] .vehicle-grid::-webkit-scrollbar-track {
          background: var(--bg-tertiary);
        }
        [data-theme="dark"] .vehicle-grid::-webkit-scrollbar-thumb {
          background: var(--text-tertiary);
        }
        [data-theme="dark"] .conductor-card {
          background: var(--bg-secondary);
          border-color: var(--border-primary);
        }
        [data-theme="dark"] .conductor-card:hover {
          border-color: var(--color-primary);
        }
        [data-theme="dark"] .conductor-card.selected {
          border-color: var(--color-primary);
          background: var(--bg-tertiary);
        }
        [data-theme="dark"] .conductor-name {
          color: var(--text-primary);
        }
        [data-theme="dark"] .conductor-dni {
          color: var(--text-secondary);
        }
        [data-theme="dark"] .wizard-footer {
          border-color: var(--border-primary);
        }
        [data-theme="dark"] .btn-secondary {
          background: var(--bg-secondary);
          border-color: var(--border-primary);
          color: var(--text-primary);
        }
        [data-theme="dark"] .btn-secondary:hover {
          background: var(--bg-tertiary);
        }
        [data-theme="dark"] .btn-primary:disabled {
          background: var(--bg-tertiary);
          border-color: var(--bg-tertiary);
          color: var(--text-tertiary);
        }
        [data-theme="dark"] .step-number {
          background: var(--bg-tertiary);
          color: var(--text-secondary);
        }
        [data-theme="dark"] .step-label {
          color: var(--text-tertiary);
        }
        [data-theme="dark"] .step-connector {
          background: var(--border-primary);
        }
        [data-theme="dark"] .empty-state {
          color: var(--text-secondary);
        }
        [data-theme="dark"] .turno-column h4 {
          color: var(--text-primary);
        }
        [data-theme="dark"] .turno-column p {
          color: var(--text-secondary);
        }
        [data-theme="dark"] .detail-group label {
          color: var(--text-secondary);
        }
        [data-theme="dark"] .detail-group input,
        [data-theme="dark"] .detail-group select,
        [data-theme="dark"] .detail-group textarea {
          background: var(--bg-secondary);
          border-color: var(--border-primary);
          color: var(--text-primary);
        }
        [data-theme="dark"] .detail-value {
          color: var(--text-primary);
        }

        /* Conductor form cards */
        .conductor-form-card {
          margin-bottom: 24px;
          padding: 20px;
          border-radius: 12px;
          border: 2px solid;
        }
        .conductor-form-card.diurno {
          background: linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%);
          border-color: #FCD34D;
        }
        .conductor-form-card.nocturno {
          background: linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%);
          border-color: #93C5FD;
        }
        .conductor-form-card.cargo {
          background: linear-gradient(135deg, #F0FDF4 0%, #D1FAE5 100%);
          border-color: #6EE7B7;
        }
        .conductor-form-card h4 {
          margin: 0 0 16px 0;
          font-size: 14px;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .conductor-form-card.diurno h4 { color: #92400E; }
        .conductor-form-card.nocturno h4 { color: #1E40AF; }
        .conductor-form-card.cargo h4 { color: #065F46; }
        
        .conductor-form-card label {
          display: block;
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
          margin-bottom: 6px;
        }
        .conductor-form-card input,
        .conductor-form-card select {
          width: 100%;
          padding: 10px;
          border: 2px solid var(--border-primary);
          border-radius: 8px;
          font-size: 12px;
          background: var(--modal-bg);
          color: var(--text-primary);
        }
        .conductor-form-card input::placeholder {
          color: var(--text-tertiary);
        }

        /* Dark mode for conductor form cards */
        [data-theme="dark"] .conductor-form-card.diurno {
          background: rgba(251, 191, 36, 0.1);
          border-color: rgba(251, 191, 36, 0.4);
        }
        [data-theme="dark"] .conductor-form-card.nocturno {
          background: rgba(59, 130, 246, 0.1);
          border-color: rgba(59, 130, 246, 0.4);
        }
        [data-theme="dark"] .conductor-form-card.cargo {
          background: rgba(16, 185, 129, 0.1);
          border-color: rgba(16, 185, 129, 0.4);
        }
        [data-theme="dark"] .conductor-form-card.diurno h4 { color: #FCD34D; }
        [data-theme="dark"] .conductor-form-card.nocturno h4 { color: #93C5FD; }
        [data-theme="dark"] .conductor-form-card.cargo h4 { color: #6EE7B7; }

        /* Step 4 general form styles */
        .step4-form label {
          display: block;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-secondary);
          margin-bottom: 6px;
        }
        .step4-form input,
        .step4-form select,
        .step4-form textarea {
          width: 100%;
          padding: 10px;
          border: 2px solid var(--border-primary);
          border-radius: 8px;
          font-size: 13px;
          font-family: inherit;
          background: var(--modal-bg);
          color: var(--text-primary);
        }
        .step4-form input::placeholder,
        .step4-form textarea::placeholder {
          color: var(--text-tertiary);
        }
        .step4-form textarea {
          resize: vertical;
        }
      `}</style>

      <div className="wizard-overlay" onClick={onClose}>
        <div className="wizard-container" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="wizard-header">
            <div>
              <h2 className="wizard-title">{isEditMode ? 'Editar Programacion' : 'Nueva Programacion'}</h2>
              <p className="wizard-subtitle">{isEditMode ? 'Modifica los datos de la programacion' : 'Programa una entrega de vehiculo paso a paso'}</p>
            </div>
            <button className="btn-close" onClick={onClose}>
              <X size={24} />
            </button>
          </div>

          {/* Stepper */}
          <div className="wizard-stepper">
            <div className="step-item">
              <div className={`step-circle ${step >= 0 ? 'active' : ''} ${step > 0 ? 'completed' : ''}`}>
                {step > 0 ? <Check size={16} /> : '1'}
              </div>
              <span className={`step-label ${step >= 0 ? 'active' : ''} ${step > 0 ? 'completed' : ''}`}>
                Sede
              </span>
            </div>

            <div className={`step-connector ${step > 0 ? 'completed' : ''}`} />

            <div className="step-item">
              <div className={`step-circle ${step >= 1 ? 'active' : ''} ${step > 1 ? 'completed' : ''}`}>
                {step > 1 ? <Check size={16} /> : '2'}
              </div>
              <span className={`step-label ${step >= 1 ? 'active' : ''} ${step > 1 ? 'completed' : ''}`}>
                Modalidad
              </span>
            </div>

            <div className={`step-connector ${step > 1 ? 'completed' : ''}`} />

            <div className="step-item">
              <div className={`step-circle ${step >= 2 ? 'active' : ''} ${step > 2 ? 'completed' : ''}`}>
                {step > 2 ? <Check size={16} /> : '3'}
              </div>
              <span className={`step-label ${step >= 2 ? 'active' : ''} ${step > 2 ? 'completed' : ''}`}>
                Vehiculo
              </span>
            </div>

            <div className={`step-connector ${step > 2 ? 'completed' : ''}`} />

            <div className="step-item">
              <div className={`step-circle ${step >= 3 ? 'active' : ''} ${step > 3 ? 'completed' : ''}`}>
                {step > 3 ? <Check size={16} /> : '3'}
              </div>
              <span className={`step-label ${step >= 3 ? 'active' : ''} ${step > 3 ? 'completed' : ''}`}>
                Conductores
              </span>
            </div>

            <div className={`step-connector ${step > 3 ? 'completed' : ''}`} />

            <div className="step-item">
              <div className={`step-circle ${step >= 4 ? 'active' : ''}`}>4</div>
              <span className={`step-label ${step >= 4 ? 'active' : ''}`}>Detalles</span>
            </div>
          </div>

          {/* Content */}
          <div className="wizard-content">
            {/* Step 0: Sede */}
            {step === 0 && (
              <div>
                <div className="step-description">
                  <h3>Paso 1: Selecciona la Sede</h3>
                  <p>En qué sede se har la asignacion?</p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '400px', margin: '0 auto' }}>
                  {sedes.map(sede => (
                    <button
                      key={sede.id}
                      onClick={() => {
                        setFormData({ ...formData, sede_id: sede.id })
                        setStep(1)
                      }}
                      className={`modality-card ${formData.sede_id === sede.id ? 'selected' : ''}`}
                      style={{ padding: '20px', textAlign: 'left' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Building2 size={32} />
                        <div>
                          <h4>{sede.nombre}</h4>
                          <p style={{ fontSize: '12px', margin: 0 }}>{sede.direccion || 'Sin dirección'}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 1: Modalidad */}
            {step === 1 && (
              <div>
                <div className="step-description">
                  <h3>Paso 1: Selecciona la Modalidad</h3>
                  <p>Que tipo de asignacion sera?</p>
                </div>

                <div className="modality-grid">
                  <div
                    className={`modality-card ${formData.modalidad === 'TURNO' ? 'selected' : ''}`}
                    onClick={() => handleSelectModality('TURNO')}
                  >
                    <div className="modality-icon">
                      <Calendar size={48} />
                    </div>
                    <h4 className="modality-title">Turno</h4>
                    <p className="modality-description">Asignacion por jornada (Diurno y/o Nocturno)</p>
                  </div>

                  <div
                    className={`modality-card ${formData.modalidad === 'CARGO' ? 'selected' : ''}`}
                    onClick={() => handleSelectModality('CARGO')}
                  >
                    <div className="modality-icon">
                      <User size={48} />
                    </div>
                    <h4 className="modality-title">A Cargo</h4>
                    <p className="modality-description">Asignacion permanente a conductor</p>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Vehiculo */}
            {step === 2 && (
              <div>
                <div className="step-description">
                  <h3>Paso 2: Selecciona el Vehiculo</h3>
                  <p>Selecciona el vehiculo que se va a entregar</p>
                </div>

                {/* Buscador y Filtro */}
                <div style={{ marginBottom: '20px', maxWidth: '700px', margin: '0 auto 20px auto', display: 'flex', gap: '12px' }}>
                  <input
                    type="text"
                    placeholder="Buscar por patente, marca o modelo..."
                    value={vehicleSearch}
                    onChange={(e) => setVehicleSearch(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '12px 16px',
                      border: '2px solid #E5E7EB',
                      borderRadius: '8px',
                      fontSize: 'clamp(12px, 1vw, 14px)',
                      fontFamily: 'inherit'
                    }}
                  />
                  <select
                    value={vehicleAvailabilityFilter}
                    onChange={(e) => setVehicleAvailabilityFilter(e.target.value)}
                    style={{
                      padding: '12px 16px',
                      border: '2px solid #E5E7EB',
                      borderRadius: '8px',
                      fontSize: 'clamp(12px, 1vw, 14px)',
                      fontFamily: 'inherit',
                      background: 'white',
                      cursor: 'pointer',
                      minWidth: '180px'
                    }}
                  >
                    <option value="">Todos</option>
                    <option value="disponible">Disponible</option>
                    <option value="con_turno_libre">Con turno libre</option>
                    <option value="en_uso">En Uso</option>
                  </select>
                </div>

                <div className="vehicle-grid">
                  {loadingVehicles ? (
                    <div className="empty-state" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                      <div style={{ 
                        width: '32px', 
                        height: '32px', 
                        border: '3px solid var(--border-primary)', 
                        borderTopColor: 'var(--color-primary)', 
                        borderRadius: '50%', 
                        animation: 'spin 1s linear infinite' 
                      }} />
                      <span>Cargando vehiculos...</span>
                    </div>
                  ) : filteredVehicles.length === 0 ? (
                    <div className="empty-state">
                      {vehicleSearch || vehicleAvailabilityFilter ? 'No se encontraron vehiculos con ese criterio' : 'No hay vehiculos disponibles'}
                    </div>
                  ) : (
                    filteredVehicles.map((vehicle) => {
                      let badgeText = ''
                      let badgeBg = ''
                      let badgeColor = ''
                      let detalleText = ''

                      const isProgramado = vehicle.disponibilidad === 'programado'
                      const asig = vehicle.asignacionActiva
                      
                      switch (vehicle.disponibilidad) {
                        case 'disponible':
                          badgeText = 'Disponible'
                          badgeBg = '#10B981'
                          badgeColor = 'white'
                          detalleText = 'Libre para asignacion'
                          break
                        case 'turno_diurno_libre':
                          badgeText = 'En Uso'
                          badgeBg = '#F59E0B'
                          badgeColor = 'white'
                          detalleText = 'Diurno Libre'
                          break
                        case 'turno_nocturno_libre':
                          badgeText = 'En Uso'
                          badgeBg = '#F59E0B'
                          badgeColor = 'white'
                          detalleText = 'Nocturno Libre'
                          break
                        case 'ocupado':
                          badgeText = 'En Uso'
                          badgeBg = '#F59E0B'
                          badgeColor = 'white'
                          detalleText = asig?.horario === 'CARGO' ? 'A Cargo' : 'Turnos completos'
                          break
                        case 'programado':
                          badgeText = 'Programado'
                          badgeBg = '#EF4444'
                          badgeColor = 'white'
                          detalleText = 'Tiene entrega pendiente'
                          break
                      }

                      return (
                        <div
                          key={vehicle.id}
                          className={`vehicle-card ${formData.vehiculo_id === vehicle.id ? 'selected' : ''} ${isProgramado ? 'disabled' : ''}`}
                          onClick={() => !isProgramado && handleSelectVehicle(vehicle)}
                          style={isProgramado ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                        >
                          <div className="vehicle-info">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                              <h4 className="vehicle-patente" style={{ margin: 0 }}>{vehicle.patente}</h4>
                              <span style={{
                                background: badgeBg,
                                color: badgeColor,
                                padding: '3px 10px',
                                borderRadius: '6px',
                                fontSize: 'clamp(9px, 0.8vw, 11px)',
                                fontWeight: '600'
                              }}>
                                {badgeText}
                              </span>
                              {detalleText && (
                                <span style={{
                                  color: isProgramado ? '#EF4444' : '#6B7280',
                                  fontSize: 'clamp(9px, 0.8vw, 11px)',
                                  fontWeight: '500'
                                }}>
                                  ({detalleText})
                                </span>
                              )}
                            </div>
                            <p className="vehicle-details">
                              {vehicle.marca} {vehicle.modelo} - {vehicle.anio}
                            </p>
                          </div>
                          <div className={`radio-circle ${formData.vehiculo_id === vehicle.id ? 'selected' : ''}`} />
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )}

            {/* Step 3: Conductores */}
            {step === 3 && (
              <div>
                <div className="step-description">
                  <h3>Paso 3: Asigna los Conductores</h3>
                  <p>{isTurnoMode ? 'Arrastra conductores a los turnos Diurno y/o Nocturno' : 'Arrastra un conductor a la zona de A Cargo'}</p>
                </div>

                <div className={`conductores-layout ${!isTurnoMode ? 'cargo-mode' : ''}`}>
                  {/* Conductores Disponibles */}
                  <div className="conductores-column">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', paddingBottom: '8px', borderBottom: '2px solid rgba(0,0,0,0.1)' }}>
                      <h4 style={{ margin: 0, border: 'none', paddingBottom: 0 }}>Conductores Disponibles</h4>
                      {isTurnoMode && (
                        <button
                          type="button"
                          onClick={toggleVistaPares}
                          disabled={loadingPares}
                          title={mostrarParesCercanos ? 'Ver lista normal' : 'Ver pares cercanos'}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 8px',
                            fontSize: '10px',
                            fontWeight: '600',
                            background: mostrarParesCercanos ? '#10B981' : '#F3F4F6',
                            color: mostrarParesCercanos ? 'white' : '#6B7280',
                            border: mostrarParesCercanos ? 'none' : '1px solid #E5E7EB',
                            borderRadius: '6px',
                            cursor: loadingPares ? 'wait' : 'pointer',
                            transition: 'all 0.2s'
                          }}
                        >
                          {loadingPares ? (
                            <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} />
                          ) : (
                            <MapPin size={10} />
                          )}
                          Pares
                        </button>
                      )}
                    </div>

                    {/* Filtros */}
                    <div style={{ marginBottom: '10px', flexShrink: 0, display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <input
                        type="text"
                        placeholder="Buscar..."
                        value={conductorSearch}
                        onChange={(e) => setConductorSearch(e.target.value)}
                        style={{
                          flex: 1,
                          minWidth: '60px',
                          padding: '7px 10px',
                          border: '1px solid #E5E7EB',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontFamily: 'inherit'
                        }}
                      />
                      <select
                        value={conductorStatusFilter}
                        onChange={(e) => setConductorStatusFilter(e.target.value)}
                        style={{
                          padding: '7px 6px',
                          border: '1px solid #E5E7EB',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontFamily: 'inherit',
                          background: 'white',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="">Estado</option>
                        <option value="disponible">Disponible</option>
                        <option value="activo">Activo</option>
                      </select>
                      <select
                        value={conductorTurnoFilter}
                        onChange={(e) => setConductorTurnoFilter(e.target.value)}
                        style={{
                          padding: '7px 6px',
                          border: '1px solid #E5E7EB',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontFamily: 'inherit',
                          background: 'white',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="">Turno</option>
                        <option value="diurno">Diurno</option>
                        <option value="nocturno">Nocturno</option>
                        <option value="cargo">A Cargo</option>
                      </select>
                    </div>

                    <div className="conductores-list">
                      {loadingConductores || loadingPares ? (
                        <div className="empty-state" style={{ padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                          <div style={{
                            width: '24px',
                            height: '24px',
                            border: '2px solid var(--border-primary)',
                            borderTopColor: 'var(--color-primary)',
                            borderRadius: '50%',
                            animation: 'spin 1s linear infinite'
                          }} />
                          <span style={{ fontSize: '11px' }}>{loadingPares ? 'Calculando pares...' : 'Cargando...'}</span>
                        </div>
                      ) : mostrarParesCercanos ? (
                        // Vista de pares cercanos
                        paresCercanos.length === 0 ? (
                          <div className="empty-state" style={{ padding: '16px', textAlign: 'center' }}>
                            <MapPin size={24} style={{ marginBottom: '8px', opacity: 0.5 }} />
                            <p style={{ margin: 0, fontSize: '11px' }}>No se encontraron pares con coordenadas</p>
                          </div>
                        ) : (
                          paresCercanos.map((par, idx) => (
                            <div
                              key={idx}
                              style={{
                                padding: '10px',
                                background: '#F0FDF4',
                                border: '1px solid #86EFAC',
                                borderRadius: '8px',
                                marginBottom: '8px'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <MapPin size={12} style={{ color: '#10B981' }} />
                                  <span style={{ fontSize: '10px', fontWeight: '600', color: '#059669' }}>
                                    {par.distanciaKm.toFixed(1)} km
                                  </span>
                                </div>
                                {par.tiempoMinutos !== undefined && par.tiempoMinutos > 0 && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Route size={12} style={{ color: '#3B82F6' }} />
                                    <span style={{ fontSize: '10px', fontWeight: '600', color: '#2563EB' }}>
                                      ~{par.tiempoMinutos} min
                                    </span>
                                  </div>
                                )}
                              </div>
                              {/* Conductor Diurno */}
                              <div
                                className="conductor-item"
                                draggable
                                onDragStart={(e) => {
                                  e.dataTransfer.setData('conductorId', par.diurno.id)
                                  e.dataTransfer.setData('pairPartnerId', par.nocturno.id)
                                  if (par.tiempoMinutos) e.dataTransfer.setData('pairTiempo', String(par.tiempoMinutos))
                                  e.currentTarget.classList.add('dragging')
                                }}
                                onDragEnd={(e) => {
                                  e.currentTarget.classList.remove('dragging')
                                }}
                                style={{ marginBottom: '6px', background: '#FFFBEB', borderColor: '#FCD34D' }}
                              >
                                <div className="conductor-avatar" style={{ background: '#F59E0B' }}>
                                  {par.diurno.nombres.charAt(0)}{par.diurno.apellidos.charAt(0)}
                                </div>
                                <div className="conductor-info">
                                  <p className="conductor-name" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Sun size={10} style={{ color: '#F59E0B' }} />
                                    {par.diurno.nombres} {par.diurno.apellidos}
                                  </p>
                                  <p className="conductor-license">DNI: {par.diurno.numero_dni || '-'}</p>
                                </div>
                              </div>
                              {/* Conductor Nocturno */}
                              <div
                                className="conductor-item"
                                draggable
                                onDragStart={(e) => {
                                  e.dataTransfer.setData('conductorId', par.nocturno.id)
                                  e.dataTransfer.setData('pairPartnerId', par.diurno.id)
                                  if (par.tiempoMinutos) e.dataTransfer.setData('pairTiempo', String(par.tiempoMinutos))
                                  e.currentTarget.classList.add('dragging')
                                }}
                                onDragEnd={(e) => {
                                  e.currentTarget.classList.remove('dragging')
                                }}
                                style={{ background: '#EFF6FF', borderColor: '#93C5FD' }}
                              >
                                <div className="conductor-avatar" style={{ background: '#3B82F6' }}>
                                  {par.nocturno.nombres.charAt(0)}{par.nocturno.apellidos.charAt(0)}
                                </div>
                                <div className="conductor-info">
                                  <p className="conductor-name" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Moon size={10} style={{ color: '#3B82F6' }} />
                                    {par.nocturno.nombres} {par.nocturno.apellidos}
                                  </p>
                                  <p className="conductor-license">DNI: {par.nocturno.numero_dni || '-'}</p>
                                </div>
                              </div>
                            </div>
                          ))
                        )
                      ) : filteredConductores.length === 0 ? (
                        <div className="empty-state" style={{ padding: '16px' }}>
                          {conductorSearch ? 'Sin resultados' : 'Sin conductores'}
                        </div>
                      ) : (
                        filteredConductores.map((conductor) => {
                          const algunoOcupado = conductor.tieneAsignacionDiurna || conductor.tieneAsignacionNocturna
                          let infoMsg = ''
                          if (conductor.tieneAsignacionDiurna && !conductor.tieneAsignacionNocturna) {
                            infoMsg = 'Diurno ocupado'
                          } else if (!conductor.tieneAsignacionDiurna && conductor.tieneAsignacionNocturna) {
                            infoMsg = 'Nocturno ocupado'
                          } else if (algunoOcupado) {
                            infoMsg = 'Ambos ocupados'
                          }

                          return (
                            <div
                              key={conductor.id}
                              className="conductor-item"
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.setData('conductorId', conductor.id)
                                e.currentTarget.classList.add('dragging')
                              }}
                              onDragEnd={(e) => {
                                e.currentTarget.classList.remove('dragging')
                              }}
                              style={{
                                background: algunoOcupado ? '#FFFBEB' : undefined,
                                borderColor: algunoOcupado ? '#FCD34D' : undefined
                              }}
                            >
                              <div className="conductor-avatar">
                                {conductor.nombres.charAt(0)}{conductor.apellidos.charAt(0)}
                              </div>
                              <div className="conductor-info">
                                <p className="conductor-name">
                                  {conductor.nombres} {conductor.apellidos}
                                </p>
                                <p className="conductor-license" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                  <span>DNI: {conductor.numero_dni || '-'}</span>
                                  <span style={{
                                    fontSize: '9px',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    fontWeight: '600',
                                    background: getPreferenciaBadge(conductor.preferencia_turno).bg,
                                    color: getPreferenciaBadge(conductor.preferencia_turno).color
                                  }}>
                                    {formatPreferencia(conductor.preferencia_turno)}
                                  </span>
                                </p>
                                {infoMsg && (
                                  <span style={{
                                    fontSize: '9px',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    fontWeight: '600',
                                    marginTop: '2px',
                                    display: 'inline-block',
                                    background: '#FEF3C7',
                                    color: '#92400E'
                                  }}>
                                    {infoMsg}
                                  </span>
                                )}
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>

                  {/* Modo TURNO: Mostrar dos columnas (Diurno y Nocturno) */}
                  {isTurnoMode && (
                    <>
                      {/* Turno Diurno */}
                      <div className="conductores-column turno-diurno">
                        <h4>
                          <span className="turno-badge diurno"><Sun size={12} style={{ marginRight: 4 }} />DIURNO</span>
                        </h4>
                        <div
                          className={`drop-zone ${conductorDiurno ? 'has-conductor' : ''}`}
                          onDragOver={(e) => {
                            e.preventDefault()
                            e.currentTarget.classList.add('drag-over')
                          }}
                          onDragLeave={(e) => {
                            e.currentTarget.classList.remove('drag-over')
                          }}
                          onDrop={(e) => {
                            e.preventDefault()
                            e.currentTarget.classList.remove('drag-over')
                            const conductorId = e.dataTransfer.getData('conductorId')
                            const pairTiempo = e.dataTransfer.getData('pairTiempo')
                            const pairPartnerId = e.dataTransfer.getData('pairPartnerId')
                            if (conductorId) {
                              const conductor = conductores.find(c => c.id === conductorId)
                              if (conductor?.tieneAsignacionDiurna) {
                                Swal.fire({
                                  icon: 'info',
                                  title: 'Conductor con asignacion activa',
                                  html: `<b>${conductor.nombres} ${conductor.apellidos}</b> tiene una asignacion activa en turno diurno.`,
                                  confirmButtonText: 'Entendido',
                                  confirmButtonColor: '#3085d6'
                                })
                              }
                              handleSelectConductorDiurno(conductorId, pairTiempo ? parseInt(pairTiempo) : undefined, pairPartnerId || undefined)
                            }
                          }}
                        >
                          {conductorDiurno ? (
                            <div className="assigned-conductor-card">
                              <div className="conductor-avatar">
                                {conductorDiurno.nombres.charAt(0)}{conductorDiurno.apellidos.charAt(0)}
                              </div>
                              <div className="conductor-info" style={{ flex: 1 }}>
                                <p className="conductor-name">
                                  {conductorDiurno.nombres} {conductorDiurno.apellidos}
                                </p>
                                <p className="conductor-license">
                                  DNI: {conductorDiurno.numero_dni || '-'}
                                </p>
                              </div>
                              <button
                                className="remove-btn"
                                onClick={() => handleRemoveConductorTurno('diurno')}
                                title="Remover"
                              >
                                <X size={18} />
                              </button>
                            </div>
                          ) : (
                            <div className="drop-zone-empty">
                              Arrastra un conductor aqui
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Turno Nocturno */}
                      <div className="conductores-column turno-nocturno">
                        <h4>
                          <span className="turno-badge nocturno"><Moon size={12} style={{ marginRight: 4 }} />NOCTURNO</span>
                        </h4>
                        <div
                          className={`drop-zone ${conductorNocturno ? 'has-conductor' : ''}`}
                          onDragOver={(e) => {
                            e.preventDefault()
                            e.currentTarget.classList.add('drag-over')
                          }}
                          onDragLeave={(e) => {
                            e.currentTarget.classList.remove('drag-over')
                          }}
                          onDrop={(e) => {
                            e.preventDefault()
                            e.currentTarget.classList.remove('drag-over')
                            const conductorId = e.dataTransfer.getData('conductorId')
                            const pairTiempo = e.dataTransfer.getData('pairTiempo')
                            const pairPartnerId = e.dataTransfer.getData('pairPartnerId')
                            if (conductorId) {
                              const conductor = conductores.find(c => c.id === conductorId)
                              if (conductor?.tieneAsignacionNocturna) {
                                Swal.fire({
                                  icon: 'info',
                                  title: 'Conductor con asignacion activa',
                                  html: `<b>${conductor.nombres} ${conductor.apellidos}</b> tiene una asignacion activa en turno nocturno.`,
                                  confirmButtonText: 'Entendido',
                                  confirmButtonColor: '#3085d6'
                                })
                              }
                              handleSelectConductorNocturno(conductorId, pairTiempo ? parseInt(pairTiempo) : undefined, pairPartnerId || undefined)
                            }
                          }}
                        >
                          {conductorNocturno ? (
                            <div className="assigned-conductor-card">
                              <div className="conductor-avatar">
                                {conductorNocturno.nombres.charAt(0)}{conductorNocturno.apellidos.charAt(0)}
                              </div>
                              <div className="conductor-info" style={{ flex: 1 }}>
                                <p className="conductor-name">
                                  {conductorNocturno.nombres} {conductorNocturno.apellidos}
                                </p>
                                <p className="conductor-license">
                                  DNI: {conductorNocturno.numero_dni || '-'}
                                </p>
                              </div>
                              <button
                                className="remove-btn"
                                onClick={() => handleRemoveConductorTurno('nocturno')}
                                title="Remover"
                              >
                                <X size={18} />
                              </button>
                            </div>
                          ) : (
                            <div className="drop-zone-empty">
                              Arrastra un conductor aqui
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}

                  {/* Modo A CARGO: Mostrar una columna */}
                  {!isTurnoMode && (
                    <div className="conductores-column a-cargo">
                      <h4>
                        <span className="turno-badge cargo">A CARGO</span>
                      </h4>
                      <div
                        className={`drop-zone ${conductorCargo ? 'has-conductor' : ''}`}
                        onDragOver={(e) => {
                          e.preventDefault()
                          e.currentTarget.classList.add('drag-over')
                        }}
                        onDragLeave={(e) => {
                          e.currentTarget.classList.remove('drag-over')
                        }}
                        onDrop={(e) => {
                          e.preventDefault()
                          e.currentTarget.classList.remove('drag-over')
                          const conductorId = e.dataTransfer.getData('conductorId')
                          if (conductorId) {
                            const conductor = conductores.find(c => c.id === conductorId)
                            if (conductor?.tieneAsignacionDiurna || conductor?.tieneAsignacionNocturna) {
                              Swal.fire({
                                icon: 'info',
                                title: 'Conductor con asignacion activa',
                                html: `<b>${conductor.nombres} ${conductor.apellidos}</b> tiene una asignacion activa.`,
                                confirmButtonText: 'Entendido',
                                confirmButtonColor: '#3085d6'
                              })
                            }
                            handleSelectConductorCargo(conductorId)
                          }
                        }}
                      >
                        {conductorCargo ? (
                          <div className="assigned-conductor-card">
                            <div className="conductor-avatar">
                              {conductorCargo.nombres.charAt(0)}{conductorCargo.apellidos.charAt(0)}
                            </div>
                            <div className="conductor-info" style={{ flex: 1 }}>
                              <p className="conductor-name">
                                {conductorCargo.nombres} {conductorCargo.apellidos}
                              </p>
                              <p className="conductor-license">
                                DNI: {conductorCargo.numero_dni || '-'}
                              </p>
                            </div>
                            <button
                              className="remove-btn"
                              onClick={() => handleRemoveConductorTurno('cargo')}
                              title="Remover"
                            >
                              <X size={18} />
                            </button>
                          </div>
                        ) : (
                          <div className="drop-zone-empty">
                            Arrastra un conductor aqui
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step 4: Detalles */}
            {step === 4 && (
              <div>
                <div className="step-description">
                  <h3>Paso 4: Detalles de la Programacion</h3>
                  <p>Completa la informacion de la cita y documentacion</p>
                </div>

                <div className="step4-form" style={{ maxWidth: '700px', margin: '0 auto' }}>
                  {/* Fecha y Hora (compartidos) */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                    <div>
                      <label>Fecha de Cita *</label>
                      <input
                        type="date"
                        value={formData.fecha_cita}
                        onChange={(e) => setFormData({ ...formData, fecha_cita: e.target.value })}
                      />
                    </div>
                    <div>
                      <label>Hora de Cita *</label>
                      <TimeInput24h
                        value={formData.hora_cita}
                        onChange={(value) => setFormData({ ...formData, hora_cita: value })}
                      />
                    </div>
                  </div>

                  {/* Campos por conductor - Modo A CARGO (un solo set) */}
                  {!isTurnoMode && conductorCargo && (
                    <div className="conductor-form-card cargo">
                      <h4>{conductorCargo.nombres} {conductorCargo.apellidos}</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                        <div>
                          <label>Tipo de Candidato *</label>
                          <select
                            value={formData.tipo_candidato_cargo}
                            onChange={(e) => setFormData({ ...formData, tipo_candidato_cargo: e.target.value as TipoCandidato })}
                          >
                            <option value="">Seleccionar...</option>
                            <option value="nuevo">Nuevo</option>
                            <option value="antiguo">Antiguo</option>
                            <option value="reingreso">Reingreso</option>
                          </select>
                        </div>
                        <div>
                          <label>Tipo de Asignacion *</label>
                          <select
                            value={formData.tipo_asignacion_cargo}
                            onChange={(e) => {
                              const val = e.target.value as TipoAsignacion
                              setFormData({ ...formData, tipo_asignacion_cargo: val, ...(val === 'devolucion_vehiculo' ? { documento_cargo: 'na' as TipoDocumento } : {}) })
                            }}
                          >
                            <option value="">Seleccionar...</option>
                            <option value="entrega_auto">Entrega de auto</option>
                            <option value="asignacion_companero">Asignacion companero</option>
                            <option value="cambio_auto">Cambio de auto</option>
                            <option value="asignacion_auto_cargo">Asig. auto a cargo</option>
                            <option value="entrega_auto_cargo">Entrega auto a cargo</option>
                            <option value="cambio_turno">Cambio de turno</option>
                            <option value="devolucion_vehiculo">Devolucion vehiculo</option>
                          </select>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                        <div>
                          <label>Documento *</label>
                          <select
                            value={formData.documento_cargo}
                            onChange={(e) => setFormData({ ...formData, documento_cargo: e.target.value as TipoDocumento })}
                          >
                            <option value="">Seleccionar...</option>
                            <option value="anexo">Anexo</option>
                            <option value="carta_oferta">Carta Oferta</option>
                            <option value="na">N/A</option>
                          </select>
                        </div>
                        <div></div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div>
                          <label>Zona *</label>
                          <input
                            type="text"
                            value={formData.zona_cargo}
                            onChange={(e) => setFormData({ ...formData, zona_cargo: e.target.value })}
                            placeholder="Ej: Norte, CABA..."
                          />
                        </div>
                        <div>
                          <label>Distancia (minutos)</label>
                          <input
                            type="number"
                            value={formData.distancia_cargo}
                            onChange={(e) => setFormData({ ...formData, distancia_cargo: e.target.value ? parseInt(e.target.value) : '' })}
                            placeholder="Tiempo estimado"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Campos por conductor - Modo TURNO - Diurno */}
                  {isTurnoMode && conductorDiurno && (
                    <div className="conductor-form-card diurno">
                      <h4><Sun size={16} /> Conductor Diurno: {conductorDiurno.nombres} {conductorDiurno.apellidos}</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                        <div>
                          <label>Tipo de Candidato *</label>
                          <select
                            value={formData.tipo_candidato_diurno}
                            onChange={(e) => setFormData({ ...formData, tipo_candidato_diurno: e.target.value as TipoCandidato })}
                          >
                            <option value="">Seleccionar...</option>
                            <option value="nuevo">Nuevo</option>
                            <option value="antiguo">Antiguo</option>
                            <option value="reingreso">Reingreso</option>
                          </select>
                        </div>
                        <div>
                          <label>Tipo de Asignacion *</label>
                          <select
                            value={formData.tipo_asignacion_diurno}
                            onChange={(e) => {
                              const val = e.target.value as TipoAsignacion
                              setFormData({ ...formData, tipo_asignacion_diurno: val, ...(val === 'devolucion_vehiculo' ? { documento_diurno: 'na' as TipoDocumento } : {}) })
                            }}
                          >
                            <option value="">Seleccionar...</option>
                            <option value="entrega_auto">Entrega de auto</option>
                            <option value="asignacion_companero">Asignacion companero</option>
                            <option value="cambio_auto">Cambio de auto</option>
                            <option value="asignacion_auto_cargo">Asig. auto a cargo</option>
                            <option value="entrega_auto_cargo">Entrega auto a cargo</option>
                            <option value="cambio_turno">Cambio de turno</option>
                            <option value="devolucion_vehiculo">Devolucion vehiculo</option>
                          </select>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                        <div>
                          <label>Documento *</label>
                          <select
                            value={formData.documento_diurno}
                            onChange={(e) => setFormData({ ...formData, documento_diurno: e.target.value as TipoDocumento })}
                          >
                            <option value="">Seleccionar...</option>
                            <option value="anexo">Anexo</option>
                            <option value="carta_oferta">Carta Oferta</option>
                            <option value="na">N/A</option>
                          </select>
                        </div>
                        <div></div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: conductorNocturno ? '1fr 1fr' : '1fr', gap: '16px' }}>
                        <div>
                          <label>Zona *</label>
                          <input
                            type="text"
                            value={formData.zona_diurno}
                            onChange={(e) => setFormData({ ...formData, zona_diurno: e.target.value })}
                            placeholder="Ej: Norte, CABA..."
                          />
                        </div>
                        {conductorNocturno && (
                        <div>
                          <label>Distancia (minutos)</label>
                          <input
                            type="number"
                            value={formData.distancia_diurno}
                            onChange={(e) => setFormData({ ...formData, distancia_diurno: e.target.value ? parseInt(e.target.value) : '' })}
                            placeholder="Tiempo estimado"
                          />
                        </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Campos por conductor - Modo TURNO - Nocturno */}
                  {isTurnoMode && conductorNocturno && (
                    <div className="conductor-form-card nocturno">
                      <h4><Moon size={16} /> Conductor Nocturno: {conductorNocturno.nombres} {conductorNocturno.apellidos}</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                        <div>
                          <label>Tipo de Candidato *</label>
                          <select
                            value={formData.tipo_candidato_nocturno}
                            onChange={(e) => setFormData({ ...formData, tipo_candidato_nocturno: e.target.value as TipoCandidato })}
                          >
                            <option value="">Seleccionar...</option>
                            <option value="nuevo">Nuevo</option>
                            <option value="antiguo">Antiguo</option>
                            <option value="reingreso">Reingreso</option>
                          </select>
                        </div>
                        <div>
                          <label>Tipo de Asignacion *</label>
                          <select
                            value={formData.tipo_asignacion_nocturno}
                            onChange={(e) => {
                              const val = e.target.value as TipoAsignacion
                              setFormData({ ...formData, tipo_asignacion_nocturno: val, ...(val === 'devolucion_vehiculo' ? { documento_nocturno: 'na' as TipoDocumento } : {}) })
                            }}
                          >
                            <option value="">Seleccionar...</option>
                            <option value="entrega_auto">Entrega de auto</option>
                            <option value="asignacion_companero">Asignacion companero</option>
                            <option value="cambio_auto">Cambio de auto</option>
                            <option value="asignacion_auto_cargo">Asig. auto a cargo</option>
                            <option value="entrega_auto_cargo">Entrega auto a cargo</option>
                            <option value="cambio_turno">Cambio de turno</option>
                            <option value="devolucion_vehiculo">Devolucion vehiculo</option>
                          </select>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                        <div>
                          <label>Documento *</label>
                          <select
                            value={formData.documento_nocturno}
                            onChange={(e) => setFormData({ ...formData, documento_nocturno: e.target.value as TipoDocumento })}
                          >
                            <option value="">Seleccionar...</option>
                            <option value="anexo">Anexo</option>
                            <option value="carta_oferta">Carta Oferta</option>
                            <option value="na">N/A</option>
                          </select>
                        </div>
                        <div></div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: conductorDiurno ? '1fr 1fr' : '1fr', gap: '16px' }}>
                        <div>
                          <label>Zona *</label>
                          <input
                            type="text"
                            value={formData.zona_nocturno}
                            onChange={(e) => setFormData({ ...formData, zona_nocturno: e.target.value })}
                            placeholder="Ej: Norte, CABA..."
                          />
                        </div>
                        {conductorDiurno && (
                        <div>
                          <label>Distancia (minutos)</label>
                          <input
                            type="number"
                            value={formData.distancia_nocturno}
                            onChange={(e) => setFormData({ ...formData, distancia_nocturno: e.target.value ? parseInt(e.target.value) : '' })}
                            placeholder="Tiempo estimado"
                          />
                        </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Observaciones */}
                  <div>
                    <label>Observaciones</label>
                    <textarea
                      value={formData.observaciones}
                      onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
                      placeholder="Notas adicionales..."
                      rows={3}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="wizard-footer">
            <button
              className="btn btn-secondary"
              onClick={step === 1 ? onClose : handleBack}
            >
              {step === 1 ? 'Cancelar' : 'Atras'}
            </button>
            
            {step < 4 ? (
              <button
                className="btn btn-primary"
                onClick={handleNext}
              >
                Siguiente <ChevronRight size={18} />
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={loading}
              >
                {loading ? 'Guardando...' : (isEditMode ? 'Guardar Cambios' : 'Crear Programacion')}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
