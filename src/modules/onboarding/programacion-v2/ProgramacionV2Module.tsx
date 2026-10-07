// src/modules/onboarding/programacion-v2/ProgramacionV2Module.tsx
//
// PROGRAMACIONES v2: copia del modulo de programaciones con el flujo de LEADS.
//
// Existe separado a proposito. El modulo v1
// (src/modules/onboarding/ProgramacionModule.tsx) queda EXACTAMENTE como
// estaba y sigue siendo el que usa la operacion: un problema aca no lo afecta.
//
// Lo que agrega respecto del v1:
//   - columna "Tip. Persona" (Lead / Conductor) por turno
//   - `adjuntarLeadIds`: la vista v_programaciones_onboarding no expone las
//     columnas lead_*_id, asi que se leen de la tabla base
//   - al enviar a entrega, primero avisa que hay leads y obliga a convertirlos
//
// Comparte con el v1 la BD, los tipos y la funcion de conversion
// (src/modules/leads/conversionLeadAConductor.ts). Las columnas lead_*_id son
// nullable y aditivas, asi que el v1 las ignora.
//
// Mientras convivan los dos: un arreglo de programaciones hay que aplicarlo
// en los dos archivos.

// src/modules/onboarding/ProgramacionModule.tsx
// Modulo de programacion de entregas de vehiculos
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useEffect, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Car, User, Calendar, FileText, Plus,
  Eye, Trash2, CheckCircle, XCircle, Send,
  MessageSquareText, Pencil, Copy, RefreshCw, Sun, Moon, ArrowLeftRight
} from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../../../components/ui/DataTable/DataTable'
import { LoadingOverlay } from '../../../components/ui/LoadingOverlay'
import { supabase } from '../../../lib/supabase'
import { usePermissions } from '../../../contexts/PermissionsContext'
import { useAuth } from '../../../contexts/AuthContext'
import { useSede } from '../../../contexts/SedeContext'

import { ProgramacionAssignmentWizardV2 } from './components/ProgramacionAssignmentWizardV2'
import type { PrecargaParMapa } from '../../../types/programacionPrecarga.types'
import { tomarPrecargaPar } from '../../../types/programacionPrecarga.types'
import type { ProgramacionOnboardingCompleta, TipoTarifa } from '../../../types/onboarding.types'
import { cargarConceptosTarifa, getEtiquetaTarifa, validarPreciosSemanales, type MapaConceptosTarifa, type TarifaRequerida } from '../tarifaConceptos'
import Swal from 'sweetalert2'
import { showSuccess } from '../../../utils/toast'
import { generateContracts } from '../../../services/contractService'
import type { GeneratedDocument } from '../../../services/contractService'
import './ProgramacionV2Module.css'
import { PROGRAMACION_ESTADO_LABELS } from '../../../utils/conductorUtils'
import { ConvertirLeadModal } from './components/ConvertirLeadModal'
import { AvisoLeadsPendientes, type LeadPendiente } from './components/AvisoLeadsPendientes'
import { calcularMinutosEntre, tieneCoordenadas, type Coordenada } from './distanciaParService'

const TIPO_ASIGNACION_LABELS: Record<string, string> = {
  entrega_auto: 'Entrega de auto',
  asignacion_companero: 'Asignación compañero',
  cambio_auto: 'Cambio de auto',
  asignacion_auto_cargo: 'Asig. auto a cargo',
  entrega_auto_cargo: 'Entrega auto a cargo',
  cambio_turno: 'Cambio de turno',
  devolucion_vehiculo: 'Devolución vehículo'
}

// Labels para mensajes de agenda
const TIPO_ASIGNACION_MSG: Record<string, string> = {
  entrega_auto: 'Entrega de auto',
  cambio_auto: 'Cambio de auto',
  asignacion_companero: 'Asignacion de companero'
}


// Funcion para generar mensaje de agenda
function generarMensajeAgenda(prog: ProgramacionOnboardingCompleta): string {
  const patente = prog.vehiculo_entregar_patente || prog.vehiculo_entregar_patente_sistema || 'N/A'
  const tipoAsignacion = TIPO_ASIGNACION_MSG[prog.tipo_asignacion || ''] || prog.tipo_asignacion || ''
  const zona = prog.zona || prog.zona_diurno || prog.zona_nocturno || 'N/A'
  const distancia = prog.distancia_minutos || prog.distancia_diurno || prog.distancia_nocturno || 'N/A'
  const documento = prog.tipo_documento === 'carta_oferta' ? 'Carta Oferta' : prog.tipo_documento === 'anexo' ? 'Anexo' : 'N/A'

  // Formatear fecha con día de la semana
  let fechaStr = 'N/A'
  if (prog.fecha_cita) {
    const fecha = new Date(prog.fecha_cita + 'T12:00:00')
    const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
    const dia = dias[fecha.getDay()]
    fechaStr = `${dia} ${fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
  }

  const hora = prog.hora_cita?.substring(0, 5) || 'N/A'

  // Generar mensaje según modalidad
  let mensaje = ''

  if (prog.modalidad === 'turno') {
    // Mensaje para modalidad TURNO (formato simple)
    const conductorDiurno = prog.conductor_diurno_nombre || 'Sin asignar'
    const conductorNocturno = prog.conductor_nocturno_nombre || 'Sin asignar'

    mensaje = `– ${tipoAsignacion} a
🌞 Diurno: ${conductorDiurno}
🌙 Nocturno: ${conductorNocturno}
📅 Fecha: ${fechaStr}
⏰ Hora: ${hora}
🚗 Auto asignado: ${patente}
📍 Ubicacion: ${zona.toUpperCase()}
👥 Distancia: ${distancia} minutos
📄 Documento: ${documento}`
  } else {
    // Mensaje para modalidad A CARGO (formato completo con importantes)
    const modelo = prog.vehiculo_entregar_modelo || prog.vehiculo_entregar_modelo_sistema || ''
    const color = prog.vehiculo_entregar_color || ''

    // Construir info del auto con modelo y color
    let autoInfo = patente
    if (modelo && color) {
      autoInfo = `${patente}-${modelo.toUpperCase()}-${color.toUpperCase()}`
    } else if (modelo) {
      autoInfo = `${patente}-${modelo.toUpperCase()}`
    }

    // Formatear fecha con día capitalizado para A CARGO
    let fechaStrCargo = 'N/A'
    if (prog.fecha_cita) {
      const fecha = new Date(prog.fecha_cita + 'T12:00:00')
      const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
      const dia = dias[fecha.getDay()]
      fechaStrCargo = `${dia} ${fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
    }

    // Determinar turno
    const turnoEmoji = prog.turno === 'diurno' ? '🌞' : prog.turno === 'nocturno' ? '🌙' : ''
    const turnoLabel = prog.turno === 'diurno' ? 'Diurno' : prog.turno === 'nocturno' ? 'Nocturno' : ''

    mensaje = `📅 Fecha: ${fechaStrCargo}
⏰ Horario: ${hora} hs
🚗 Auto Asignado: ${autoInfo}
${turnoEmoji}${turnoEmoji ? ' ' : ''}Turno: ${turnoLabel}
👥 Distancia de tu compañero: ${distancia} min
⚠️ Importante:
- Favor de traer el ${patente} limpio, con gnc completo y nafta por encima de la reserva.
- La tolerancia máxima de espera es de 15 minutos ⏳
*Confirmar asistencia por favor* 🤝
⚠️ Importante:
- Recuerde llevar dni y licencia.
- La tolerancia máxima de espera es de 15 minutos ⏳
*Confirmar asistencia por favor* 🤝`
  }

  return mensaje
}

// Sede Buenos Aires: el atendedor responsable de visitas de Asignaciones es Karen (fijo).
/** Turno del modal de edicion rapida que puede ocupar un conductor o un lead. */
type SlotEdicion = 'diurno' | 'nocturno' | 'cargo'

/** Lead tal como se ofrece en el buscador del modal de edicion rapida. */
interface LeadOpcionEdicion {
  id: string
  nombre: string
  dni: string
  estado: string
  zona: string
}

/**
 * Estados de lead que no se ofrecen para programar. Mismo criterio que el
 * wizard de creacion (ESTADOS_LEAD_FUERA_DE_PROGRAMACION en
 * ProgramacionAssignmentWizardV2): un lead descartado o ya convertido en
 * conductor no debe volver a ocupar un turno.
 */
const ESTADOS_LEAD_FUERA_DE_EDICION = new Set(['Descartado', 'Conductor'])

/**
 * Tipo de candidato a guardar para un turno. Un turno con lead siempre es
 * 'lead'; un turno sin lead nunca puede quedar como 'lead' (pasa cuando un
 * conductor reemplaza al lead o el turno queda vacante). Si no se pudo saber
 * si el turno tenia lead (`leadId` undefined) se respeta el valor tal cual,
 * que es el comportamiento previo.
 */
const tipoCandidatoAGuardar = (
  valor: string | null | undefined,
  leadId: string | null | undefined
): string | null | undefined => {
  if (leadId === undefined) return valor
  if (leadId) return 'lead'
  if (valor === 'lead') return null
  return valor || null
}

const SEDE_BUENOS_AIRES_ID = '80587298-b799-4a98-87a9-2f74890da443'
const KAREN_ATENDEDOR_ID = '503e3df5-5d5e-4c27-b90c-93128a670673'

// Resuelve un atendedor activo desde la tabla visitas_atendedores.
// Prioriza la sede del programa; si no hay activos en la sede, cae a cualquier activo.
// Para la sede Buenos Aires se devuelve siempre Karen (decisión de negocio).
async function resolverAtendedorActivo(sedeId: string | null): Promise<string | null> {
  if (sedeId === SEDE_BUENOS_AIRES_ID) return KAREN_ATENDEDOR_ID
  if (sedeId) {
    const { data: enSede } = await (supabase.from('visitas_atendedores') as any)
      .select('id')
      .eq('sede_id', sedeId)
      .eq('activo', true)
      .order('created_at', { ascending: true })
      .limit(1)
    if (enSede && enSede.length > 0) return enSede[0].id
  }
  const { data: cualquiera } = await (supabase.from('visitas_atendedores') as any)
    .select('id')
    .eq('activo', true)
    .order('created_at', { ascending: true })
    .limit(1)
  return cualquiera?.[0]?.id ?? null
}

export function ProgramacionV2Module() {
  const { canCreateInMenu, canEditInMenu, canDeleteInMenu, canViewTab } = usePermissions()
  const { user, profile } = useAuth()
  const { sedeActualId, aplicarFiltroSede, sedeUsuario } = useSede()
  const canCreate = canCreateInMenu('programacion-entregas')
  const canEdit = canEditInMenu('programacion-entregas')
  const canDelete = canDeleteInMenu('programacion-entregas')

  const [programaciones, setProgramaciones] = useState<ProgramacionOnboardingCompleta[]>([])
  const [programacionesHistorico, setProgramacionesHistorico] = useState<ProgramacionOnboardingCompleta[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingHistorico, setLoadingHistorico] = useState(false)
  /**
   * Envio a Asignaciones en curso.
   *
   * El proceso encadena varias llamadas (crear la asignacion, los conductores,
   * la visita y el documento de cada uno). Hasta ahora no mostraba nada: el
   * operador no sabia si habia pasado algo y podia volver a tocar el boton.
   */
  const [enviandoEntrega, setEnviandoEntrega] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'pendientes' | 'historico'>('pendientes')
  
  // Filtro activo por stat card
  // Stats cards ocultas temporalmente
  // type FilterType = 'all' | 'por_agendar' | 'agendados' | 'completados' | 'cond_nuevos' | 'cond_anexo'
  // const [activeFilter, setActiveFilter] = useState<FilterType>('all')
  
  // Modals
  const [showCreateWizard, setShowCreateWizard] = useState(false)
  const [editingProgramacion, setEditingProgramacion] = useState<ProgramacionOnboardingCompleta | null>(null)
  const [previewProgramacion, setPreviewProgramacion] = useState<ProgramacionOnboardingCompleta | null>(null)
  // Aviso previo: dice cuantos leads hay que convertir antes de poder enviar.
  const [avisoLeads, setAvisoLeads] = useState<{
    prog: ProgramacionOnboardingCompleta
    pendientes: LeadPendiente[]
  } | null>(null)
  // Conversion en curso, ya elegido el lead.
  const [conversionLead, setConversionLead] = useState<
    { prog: ProgramacionOnboardingCompleta } & LeadPendiente | null
  >(null)

  // Modal edicion rapida
  const [showQuickEdit, setShowQuickEdit] = useState(false)
  const [quickEditData, setQuickEditData] = useState<Partial<ProgramacionOnboardingCompleta> & { vehiculo_id?: string }>({})
  const [savingQuickEdit, setSavingQuickEdit] = useState(false)
  const [vehiculosDisponibles, setVehiculosDisponibles] = useState<Array<{ id: string; patente: string; marca: string; modelo: string; gnc?: boolean }>>([])
  // Conceptos de alquiler: alimentan las etiquetas del selector de Tarifa.
  const [conceptosTarifa, setConceptosTarifa] = useState<MapaConceptosTarifa>({})
  const [loadingVehiculos, setLoadingVehiculos] = useState(false)
  const [vehiculoSearch, setVehiculoSearch] = useState('')
  const [showVehiculoDropdown, setShowVehiculoDropdown] = useState(false)

  // Conductores disponibles para edición
  const [conductoresDisponibles, setConductoresDisponibles] = useState<Array<{ id: string; nombre: string; dni: string }>>([])
  const [loadingConductores, setLoadingConductores] = useState(false)
  const [conductorDiurnoSearch, setConductorDiurnoSearch] = useState('')
  const [conductorNocturnoSearch, setConductorNocturnoSearch] = useState('')
  const [conductorSearch, setConductorSearch] = useState('') // Para modalidad A CARGO
  const [showConductorDiurnoDropdown, setShowConductorDiurnoDropdown] = useState(false)
  const [showConductorNocturnoDropdown, setShowConductorNocturnoDropdown] = useState(false)
  const [showConductorDropdown, setShowConductorDropdown] = useState(false)

  // Leads en el modal de edicion rapida. Cada turno tiene un selector
  // Conductores / Leads; los leads se buscan en el servidor (son miles y no
  // conviene traerlos todos al abrir el modal).
  const [tipoPersonaEdicion, setTipoPersonaEdicion] = useState<Record<SlotEdicion, 'conductor' | 'lead'>>({ diurno: 'conductor', nocturno: 'conductor', cargo: 'conductor' })
  const [leadSearchEdicion, setLeadSearchEdicion] = useState<Record<SlotEdicion, string>>({ diurno: '', nocturno: '', cargo: '' })
  const [leadDropdownEdicion, setLeadDropdownEdicion] = useState<SlotEdicion | null>(null)
  const [leadResultadosEdicion, setLeadResultadosEdicion] = useState<LeadOpcionEdicion[]>([])
  const [buscandoLeadsEdicion, setBuscandoLeadsEdicion] = useState(false)

  // Vehiculos filtrados por busqueda
  const filteredVehiculos = useMemo(() => {
    if (!vehiculoSearch.trim()) return vehiculosDisponibles
    const search = vehiculoSearch.toLowerCase()
    return vehiculosDisponibles.filter(v =>
      v.patente.toLowerCase().includes(search) ||
      v.marca.toLowerCase().includes(search) ||
      v.modelo.toLowerCase().includes(search)
    )
  }, [vehiculosDisponibles, vehiculoSearch])

  // Vehiculo seleccionado actual
  const selectedVehiculo = useMemo(() => {
    return vehiculosDisponibles.find(v => v.id === quickEditData.vehiculo_id)
  }, [vehiculosDisponibles, quickEditData.vehiculo_id])

  // GNC del vehiculo seleccionado: define que concepto de alquiler (y por lo
  // tanto que precio) se muestra en el selector de Tarifa.
  const gncVehiculoEdicion = useMemo(() => selectedVehiculo?.gnc === true, [selectedVehiculo])

  // Conductores filtrados por búsqueda (diurno) - excluir el nocturno ya seleccionado
  const filteredConductoresDiurno = useMemo(() => {
    let lista = conductoresDisponibles
    // Excluir conductor ya asignado como nocturno
    if (quickEditData.conductor_nocturno_id) {
      lista = lista.filter(c => c.id !== quickEditData.conductor_nocturno_id)
    }
    if (!conductorDiurnoSearch.trim()) return lista
    const search = conductorDiurnoSearch.toLowerCase()
    return lista.filter(c =>
      c.nombre.toLowerCase().includes(search) ||
      c.dni.toLowerCase().includes(search)
    )
  }, [conductoresDisponibles, conductorDiurnoSearch, quickEditData.conductor_nocturno_id])

  // Conductores filtrados por búsqueda (nocturno) - excluir el diurno ya seleccionado
  const filteredConductoresNocturno = useMemo(() => {
    let lista = conductoresDisponibles
    // Excluir conductor ya asignado como diurno
    if (quickEditData.conductor_diurno_id) {
      lista = lista.filter(c => c.id !== quickEditData.conductor_diurno_id)
    }
    if (!conductorNocturnoSearch.trim()) return lista
    const search = conductorNocturnoSearch.toLowerCase()
    return lista.filter(c =>
      c.nombre.toLowerCase().includes(search) ||
      c.dni.toLowerCase().includes(search)
    )
  }, [conductoresDisponibles, conductorNocturnoSearch, quickEditData.conductor_diurno_id])

  // Conductores filtrados por búsqueda (a cargo - legacy)
  const filteredConductores = useMemo(() => {
    if (!conductorSearch.trim()) return conductoresDisponibles
    const search = conductorSearch.toLowerCase()
    return conductoresDisponibles.filter(c =>
      c.nombre.toLowerCase().includes(search) ||
      c.dni.toLowerCase().includes(search)
    )
  }, [conductoresDisponibles, conductorSearch])

  // Conductor seleccionado actual (diurno)
  const selectedConductorDiurno = useMemo(() => {
    return conductoresDisponibles.find(c => c.id === quickEditData.conductor_diurno_id)
  }, [conductoresDisponibles, quickEditData.conductor_diurno_id])

  // Conductor seleccionado actual (nocturno)
  const selectedConductorNocturno = useMemo(() => {
    return conductoresDisponibles.find(c => c.id === quickEditData.conductor_nocturno_id)
  }, [conductoresDisponibles, quickEditData.conductor_nocturno_id])

  // Conductor seleccionado actual (a cargo)
  const selectedConductor = useMemo(() => {
    return conductoresDisponibles.find(c => c.id === quickEditData.conductor_id)
  }, [conductoresDisponibles, quickEditData.conductor_id])

  // Busqueda de leads del modal de edicion rapida (servidor, con debounce).
  // Solo corre para el turno cuyo buscador de leads esta abierto.
  useEffect(() => {
    const slot = leadDropdownEdicion
    if (!slot || !editingProgramacion) return
    // Se sacan los caracteres que rompen la sintaxis del filtro `or` de
    // PostgREST (coma, parentesis) y los comodines de ilike.
    const termino = leadSearchEdicion[slot].replace(/[,()%*\\"']/g, ' ').replace(/\s+/g, ' ').trim()
    if (termino.length < 2) {
      setLeadResultadosEdicion([])
      setBuscandoLeadsEdicion(false)
      return
    }
    let cancelado = false
    setBuscandoLeadsEdicion(true)
    const timer = setTimeout(async () => {
      try {
        let query: any = supabase
          .from('leads')
          .select('id, nombre_completo, primer_nombre, apellido, dni, estado_de_lead, zona')
          .or(`nombre_completo.ilike.%${termino}%,primer_nombre.ilike.%${termino}%,apellido.ilike.%${termino}%,dni.ilike.%${termino}%`)
        // Misma sede que la programacion (igual que el wizard, que filtra los
        // leads por la sede elegida). Sin sede en la fila: sede activa.
        query = editingProgramacion.sede_id
          ? query.eq('sede_id', editingProgramacion.sede_id)
          : aplicarFiltroSede(query)
        const { data, error } = await query.order('created_at', { ascending: false }).limit(100)
        if (error) throw error
        if (cancelado) return
        const lista: LeadOpcionEdicion[] = ((data || []) as any[])
          .filter((l) => !ESTADOS_LEAD_FUERA_DE_EDICION.has((l.estado_de_lead || '').trim()))
          .map((l) => ({
            id: l.id,
            nombre:
              (l.nombre_completo && String(l.nombre_completo).trim()) ||
              `${l.primer_nombre || ''} ${l.apellido || ''}`.trim() ||
              'Sin nombre',
            dni: l.dni || '',
            estado: (l.estado_de_lead || '').trim(),
            zona: l.zona || '',
          }))
        setLeadResultadosEdicion(lista)
      } catch {
        if (!cancelado) setLeadResultadosEdicion([])
      } finally {
        if (!cancelado) setBuscandoLeadsEdicion(false)
      }
    }, 300)
    return () => {
      cancelado = true
      clearTimeout(timer)
    }
  }, [leadDropdownEdicion, leadSearchEdicion, editingProgramacion, aplicarFiltroSede])

  /**
   * Auto-completar "Distancia (min)" en edicion, mismo criterio que el wizard
   * (ProgramacionAssignmentWizardV2): con los dos turnos ocupados, minutos
   * entre las dos personas via `calcularMinutosEntre` (medicion real cacheada
   * primero, Haversine despues; nunca llama a Google). Solo llena un campo
   * vacio: no pisa un valor ya cargado ni uno escrito a mano.
   *
   * Las coordenadas se leen por id porque las listas del modal no las traen.
   * Conductor: direccion_lat/lng. Lead: latitud/longitud (las que usa el mapa y
   * arman las claves del cache) y si faltan, direccion_latitud/longitud.
   */
  useEffect(() => {
    if (!showQuickEdit || editingProgramacion?.modalidad !== 'turno') return
    const diurno = { conductorId: quickEditData.conductor_diurno_id || '', leadId: quickEditData.lead_diurno_id || '' }
    const nocturno = { conductorId: quickEditData.conductor_nocturno_id || '', leadId: quickEditData.lead_nocturno_id || '' }
    if (!(diurno.conductorId || diurno.leadId) || !(nocturno.conductorId || nocturno.leadId)) return

    const coordenadasPersona = async (persona: { conductorId: string; leadId: string }): Promise<Coordenada | null> => {
      try {
        if (persona.conductorId) {
          const { data } = await (supabase.from('conductores') as any)
            .select('direccion_lat, direccion_lng')
            .eq('id', persona.conductorId)
            .maybeSingle()
          const c = { lat: data?.direccion_lat, lng: data?.direccion_lng }
          return tieneCoordenadas(c) ? c : null
        }
        const { data } = await (supabase.from('leads') as any)
          .select('latitud, longitud, direccion_latitud, direccion_longitud')
          .eq('id', persona.leadId)
          .maybeSingle()
        const l = { lat: data?.latitud ?? data?.direccion_latitud, lng: data?.longitud ?? data?.direccion_longitud }
        return tieneCoordenadas(l) ? l : null
      } catch {
        return null
      }
    }

    const vacio = (v: number | null | undefined) => v == null || Number.isNaN(v)
    let cancelado = false
    ;(async () => {
      const [a, b] = await Promise.all([coordenadasPersona(diurno), coordenadasPersona(nocturno)])
      if (cancelado || !a || !b) return
      const res = await calcularMinutosEntre(a, b)
      if (cancelado || !res) return
      setQuickEditData(prev => {
        // Re-verificar: pudo cambiar la persona o llenarse el campo mientras
        // esperabamos las coordenadas y el cache.
        const mismaGente =
          (prev.conductor_diurno_id || '') === diurno.conductorId &&
          (prev.lead_diurno_id || '') === diurno.leadId &&
          (prev.conductor_nocturno_id || '') === nocturno.conductorId &&
          (prev.lead_nocturno_id || '') === nocturno.leadId
        if (!mismaGente) return prev
        const llenarDiurno = vacio(prev.distancia_diurno)
        const llenarNocturno = vacio(prev.distancia_nocturno)
        if (!llenarDiurno && !llenarNocturno) return prev
        return {
          ...prev,
          distancia_diurno: llenarDiurno ? res.minutos : prev.distancia_diurno,
          distancia_nocturno: llenarNocturno ? res.minutos : prev.distancia_nocturno,
        }
      })
    })()

    return () => {
      cancelado = true
    }
  }, [
    showQuickEdit,
    editingProgramacion?.modalidad,
    quickEditData.conductor_diurno_id,
    quickEditData.lead_diurno_id,
    quickEditData.conductor_nocturno_id,
    quickEditData.lead_nocturno_id,
  ])

  /**
   * La distancia es entre las DOS personas del turno: si cambia cualquiera de
   * ellas, el valor anterior queda viejo. Se vacian ambos campos para que el
   * efecto de arriba la recalcule con la pareja nueva (o quede vacia si el
   * turno queda vacante). Si la persona no cambia, no se toca nada.
   * No aplica a A Cargo (una sola persona, sin distancia entre pares).
   */
  const resetDistanciaSiCambiaPersona = (
    prev: typeof quickEditData,
    slot: SlotEdicion,
    conductorId: string,
    leadId: string
  ): Partial<typeof quickEditData> => {
    if (slot === 'cargo') return {}
    const antes = slot === 'diurno'
      ? { conductorId: prev.conductor_diurno_id || '', leadId: prev.lead_diurno_id || '' }
      : { conductorId: prev.conductor_nocturno_id || '', leadId: prev.lead_nocturno_id || '' }
    if (antes.conductorId === conductorId && antes.leadId === leadId) return {}
    return { distancia_diurno: undefined, distancia_nocturno: undefined }
  }

  /** Deja el turno vacante (sin conductor ni lead). */
  const limpiarSlotEdicion = (slot: SlotEdicion) => {
    setQuickEditData(prev => {
      if (slot === 'diurno') return { ...prev, conductor_diurno_id: undefined, conductor_diurno_nombre: '', conductor_diurno_dni: '', lead_diurno_id: null, ...resetDistanciaSiCambiaPersona(prev, 'diurno', '', '') }
      if (slot === 'nocturno') return { ...prev, conductor_nocturno_id: undefined, conductor_nocturno_nombre: '', conductor_nocturno_dni: '', lead_nocturno_id: null, ...resetDistanciaSiCambiaPersona(prev, 'nocturno', '', '') }
      return { ...prev, conductor_id: undefined, conductor_nombre: '', conductor_dni: '', lead_cargo_id: null }
    })
  }

  /**
   * Pone un lead en el turno. Mismo criterio que `asignarLeadASlot` del
   * wizard: el id de conductor queda vacio (el lead no existe en
   * `conductores`), tipo de candidato 'lead' y, si reemplaza a otra persona,
   * asignacion y documento vuelven a los defaults de un lead (entrega de auto
   * con carta oferta).
   */
  const seleccionarLeadEdicion = (slot: SlotEdicion, lead: LeadOpcionEdicion) => {
    setQuickEditData(prev => {
      if (slot === 'diurno') {
        const reemplaza = !!prev.conductor_diurno_id || (!!prev.lead_diurno_id && prev.lead_diurno_id !== lead.id)
        return {
          ...prev,
          conductor_diurno_id: undefined,
          conductor_diurno_nombre: lead.nombre,
          conductor_diurno_dni: lead.dni,
          lead_diurno_id: lead.id,
          tipo_candidato_diurno: 'lead' as any,
          tipo_asignacion_diurno: reemplaza ? 'entrega_auto' : (prev.tipo_asignacion_diurno || 'entrega_auto'),
          documento_diurno: reemplaza ? 'carta_oferta' as any : (prev.documento_diurno || 'carta_oferta' as any),
          zona_diurno: prev.zona_diurno || lead.zona,
          ...resetDistanciaSiCambiaPersona(prev, 'diurno', '', lead.id),
        }
      }
      if (slot === 'nocturno') {
        const reemplaza = !!prev.conductor_nocturno_id || (!!prev.lead_nocturno_id && prev.lead_nocturno_id !== lead.id)
        return {
          ...prev,
          conductor_nocturno_id: undefined,
          conductor_nocturno_nombre: lead.nombre,
          conductor_nocturno_dni: lead.dni,
          lead_nocturno_id: lead.id,
          tipo_candidato_nocturno: 'lead' as any,
          tipo_asignacion_nocturno: reemplaza ? 'entrega_auto' : (prev.tipo_asignacion_nocturno || 'entrega_auto'),
          documento_nocturno: reemplaza ? 'carta_oferta' as any : (prev.documento_nocturno || 'carta_oferta' as any),
          zona_nocturno: prev.zona_nocturno || lead.zona,
          ...resetDistanciaSiCambiaPersona(prev, 'nocturno', '', lead.id),
        }
      }
      const reemplaza = !!prev.conductor_id || (!!prev.lead_cargo_id && prev.lead_cargo_id !== lead.id)
      return {
        ...prev,
        conductor_id: undefined,
        conductor_nombre: lead.nombre,
        conductor_dni: lead.dni,
        lead_cargo_id: lead.id,
        tipo_candidato: 'lead' as any,
        tipo_documento: reemplaza ? 'carta_oferta' as any : (prev.tipo_documento || 'carta_oferta' as any),
        // `zona` legacy esta tipada como ZonaOnboarding; el lead trae texto libre.
        zona: prev.zona || (lead.zona as any),
      }
    })
    setLeadSearchEdicion(prev => ({ ...prev, [slot]: '' }))
    setLeadDropdownEdicion(null)
  }

  /** Cambia el selector Conductores / Leads de un turno. No toca la persona elegida. */
  const cambiarTipoPersonaEdicion = (slot: SlotEdicion, tipo: 'conductor' | 'lead') => {
    setTipoPersonaEdicion(prev => ({ ...prev, [slot]: tipo }))
    setLeadSearchEdicion(prev => ({ ...prev, [slot]: '' }))
    setLeadDropdownEdicion(null)
    if (slot === 'diurno') { setConductorDiurnoSearch(''); setShowConductorDiurnoDropdown(false) }
    else if (slot === 'nocturno') { setConductorNocturnoSearch(''); setShowConductorNocturnoDropdown(false) }
    else { setConductorSearch(''); setShowConductorDropdown(false) }
  }

  /** Datos del turno en edicion: lead y nombre/DNI de quien lo ocupa. */
  const datosSlotEdicion = (slot: SlotEdicion) => {
    if (slot === 'diurno') return { leadId: quickEditData.lead_diurno_id, conductorId: quickEditData.conductor_diurno_id, nombre: quickEditData.conductor_diurno_nombre, otroLeadId: quickEditData.lead_nocturno_id }
    if (slot === 'nocturno') return { leadId: quickEditData.lead_nocturno_id, conductorId: quickEditData.conductor_nocturno_id, nombre: quickEditData.conductor_nocturno_nombre, otroLeadId: quickEditData.lead_diurno_id }
    return { leadId: quickEditData.lead_cargo_id, conductorId: quickEditData.conductor_id, nombre: quickEditData.conductor_nombre, otroLeadId: null }
  }

  /** Selector segmentado Conductores / Leads de un turno. */
  const renderSelectorTipoPersona = (slot: SlotEdicion) => {
    const actual = tipoPersonaEdicion[slot]
    const boton = (tipo: 'conductor' | 'lead', texto: string) => (
      <button
        type="button"
        onClick={() => cambiarTipoPersonaEdicion(slot, tipo)}
        aria-pressed={actual === tipo}
        style={{
          padding: '4px 10px',
          fontSize: '12px',
          fontWeight: 600,
          border: 'none',
          cursor: 'pointer',
          background: actual === tipo ? 'var(--color-primary)' : 'transparent',
          color: actual === tipo ? '#fff' : 'var(--text-secondary)',
        }}
      >
        {texto}
      </button>
    )
    return (
      <div style={{ display: 'inline-flex', border: '1px solid var(--border-primary)', borderRadius: '6px', overflow: 'hidden', background: 'var(--bg-secondary)' }}>
        {boton('conductor', 'Conductores')}
        {boton('lead', 'Leads')}
      </div>
    )
  }

  /** Encabezado del campo de persona: etiqueta + selector Conductores / Leads. */
  const renderEncabezadoPersona = (slot: SlotEdicion) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
      <label style={{ margin: 0 }}>{tipoPersonaEdicion[slot] === 'lead' ? 'Lead *' : 'Conductor *'}</label>
      {renderSelectorTipoPersona(slot)}
    </div>
  )

  /**
   * Placeholder del buscador de conductores: si el turno lo ocupa un lead, lo
   * muestra para que se entienda que elegir un conductor lo reemplaza.
   */
  const placeholderConductorEdicion = (slot: SlotEdicion) => {
    if (loadingConductores) return 'Cargando conductores...'
    const { leadId, nombre } = datosSlotEdicion(slot)
    if (leadId && nombre) return `Actual (lead): ${nombre} — buscar conductor para reemplazar`
    return 'Buscar por nombre o DNI...'
  }

  /** Buscador de leads de un turno. */
  const renderBuscadorLead = (slot: SlotEdicion) => {
    const { leadId, conductorId, nombre, otroLeadId } = datosSlotEdicion(slot)
    const termino = leadSearchEdicion[slot]
    const abierto = leadDropdownEdicion === slot
    const resultados = leadResultadosEdicion.filter(l => l.id !== otroLeadId)
    const placeholder = conductorId && nombre
      ? `Actual (conductor): ${nombre} — buscar lead para reemplazar`
      : 'Buscar lead por nombre o DNI...'
    return (
      <div className="prog-searchable-select">
        <input
          type="text"
          value={leadId ? (nombre || '') : termino}
          onChange={(e) => {
            const valor = e.target.value
            setLeadSearchEdicion(prev => ({ ...prev, [slot]: valor }))
            // Igual que el buscador de conductores: escribir libera el turno
            // hasta que se elija a alguien de la lista.
            limpiarSlotEdicion(slot)
            setLeadDropdownEdicion(slot)
          }}
          onFocus={() => setLeadDropdownEdicion(slot)}
          onBlur={() => setTimeout(() => setLeadDropdownEdicion(prev => (prev === slot ? null : prev)), 200)}
          placeholder={placeholder}
          className="prog-input"
        />
        {abierto && (
          <div className="prog-searchable-dropdown">
            {termino.trim().length < 2 ? (
              <div className="prog-searchable-no-results">Escribe al menos 2 caracteres para buscar leads...</div>
            ) : buscandoLeadsEdicion ? (
              <div className="prog-searchable-no-results">Buscando leads...</div>
            ) : resultados.length > 0 ? (
              resultados.slice(0, 30).map(l => (
                <div
                  key={l.id}
                  className={`prog-searchable-option ${leadId === l.id ? 'selected' : ''}`}
                  onClick={() => seleccionarLeadEdicion(slot, l)}
                >
                  <strong>{l.nombre}</strong> {l.dni && <span style={{ color: 'var(--text-tertiary)' }}>- DNI: {l.dni}</span>}
                  {l.estado && (
                    <span style={{ marginLeft: '6px', fontSize: '11px', padding: '1px 6px', borderRadius: '4px', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                      {l.estado}
                    </span>
                  )}
                </div>
              ))
            ) : (
              <div className="prog-searchable-no-results">No se encontraron leads</div>
            )}
          </div>
        )}
      </div>
    )
  }

  // Especialistas disponibles (para uso futuro)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_especialistas, _setEspecialistas] = useState<Array<{ id: string; nombre: string }>>([])

  // Modal copiar mensaje
  const [showMensajeModal, setShowMensajeModal] = useState(false)
  const [mensajeModalProg, setMensajeModalProg] = useState<ProgramacionOnboardingCompleta | null>(null)

  // IDs de conductores que están de baja (para mostrar badge en preview)
  const [conductoresBajaIds, setConductoresBajaIds] = useState<Set<string>>(new Set())

  // Handlers para cerrar modales
  const handleCloseQuickEdit = () => {
    setShowQuickEdit(false)
    setEditingProgramacion(null)
  }

  const handleClosePreview = () => {
    setPreviewProgramacion(null)
    setConductoresBajaIds(new Set())
  }

  const handleOpenPreview = async (prog: ProgramacionOnboardingCompleta) => {
    setPreviewProgramacion(prog)
    // Consultar si los conductores asignados están de baja
    const ids = [prog.conductor_id, prog.conductor_diurno_id, prog.conductor_nocturno_id].filter(Boolean) as string[]
    if (ids.length === 0) return
    try {
      const { data } = await supabase
        .from('conductores')
        .select('id, conductores_estados(codigo)')
        .in('id', ids)
      if (data) {
        const bajaIds = new Set<string>()
        for (const c of data) {
          const estado = (c as any).conductores_estados
          if (estado && typeof estado.codigo === 'string' && estado.codigo.toLowerCase().includes('baja')) {
            bajaIds.add(c.id)
          }
        }
        setConductoresBajaIds(bajaIds)
      }
    } catch {
      // silently ignored
    }
  }

  const handleCloseMensaje = () => {
    setShowMensajeModal(false)
  }

  const handlePreviewEdit = () => {
    if (!previewProgramacion) return
    handleClosePreview()
    handleEdit(previewProgramacion)
  }

  const handlePreviewEnviar = () => {
    if (!previewProgramacion) return
    handleEnviarAEntrega(previewProgramacion)
  }

  /**
   * Completa las filas con los ids de lead.
   *
   * `v_programaciones_onboarding` es una vista y no expone las columnas
   * agregadas despues de crearla (mismo caso que las de tarifa, ver mas abajo),
   * asi que se leen de la tabla base y se pegan sobre las filas de la vista.
   * Best-effort: si falla, las filas quedan sin el dato y la columna
   * "Tip. Persona" cae a "Conductor", que es el comportamiento previo.
   */
  const adjuntarLeadIds = async (
    filas: ProgramacionOnboardingCompleta[]
  ): Promise<ProgramacionOnboardingCompleta[]> => {
    if (filas.length === 0) return filas
    try {
      const { data } = await (supabase.from('programaciones_onboarding') as any)
        .select('id, lead_diurno_id, lead_nocturno_id, lead_cargo_id')
        .in('id', filas.map((f) => f.id))
      if (!data) return filas
      const porId = new Map<string, any>(data.map((r: any) => [r.id, r]))
      return filas.map((f) => {
        const extra = porId.get(f.id)
        return extra
          ? {
              ...f,
              lead_diurno_id: extra.lead_diurno_id || null,
              lead_nocturno_id: extra.lead_nocturno_id || null,
              lead_cargo_id: extra.lead_cargo_id || null,
            }
          : f
      })
    } catch {
      return filas
    }
  }

  /**
   * Tipo de persona de un slot: 'lead' si quedo apuntado un lead (y por lo
   * tanto no hay fila en `conductores`), 'conductor' si hay conductor, o null
   * si el turno esta vacante.
   */
  const tipoPersonaSlot = (
    leadId: string | null | undefined,
    conductorId: string | null | undefined,
    nombre: string | null | undefined
  ): 'lead' | 'conductor' | null => {
    if (leadId) return 'lead'
    if (conductorId || (nombre && nombre.trim())) return 'conductor'
    return null
  }

  /** Chip de la columna "Tip. Persona". */
  const ChipTipoPersona = ({ tipo }: { tipo: 'lead' | 'conductor' }) => (
    <span
      style={{
        fontSize: '10px',
        fontWeight: 700,
        padding: '2px 7px',
        borderRadius: '4px',
        whiteSpace: 'nowrap',
        background: tipo === 'lead' ? 'rgba(139, 92, 246, 0.18)' : 'rgba(16, 185, 129, 0.15)',
        color: tipo === 'lead' ? '#7C3AED' : '#047857',
      }}
    >
      {tipo === 'lead' ? 'Lead' : 'Conductor'}
    </span>
  )

  // Cargar programaciones
  const loadProgramaciones = async () => {
    setLoading(true)
    try {
      const { data, error: queryError } = await aplicarFiltroSede(supabase
        .from('v_programaciones_onboarding')
        .select('*')
        .neq('estado', 'completado') // Excluir las completadas (ya enviadas)
        .or('eliminado.is.null,eliminado.eq.false')) // Excluir las eliminadas
        .order('created_at', { ascending: false })

      if (queryError) throw queryError
      setProgramaciones(await adjuntarLeadIds((data || []) as ProgramacionOnboardingCompleta[]))
    } catch (err: any) {
      setError(err.message || 'Error al cargar programaciones')
    } finally {
      setLoading(false)
    }
  }

  // Cargar especialistas
  const loadEspecialistas = async () => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, full_name')
        .order('full_name')

      if (error) throw error
      _setEspecialistas((data || []).map((u: any) => ({
        id: u.id,
        nombre: u.full_name || 'Sin nombre'
      })))
    } catch {
      // silently ignored
    }
  }

   
  useEffect(() => {
    loadProgramaciones()
    loadEspecialistas()
  }, [sedeActualId, aplicarFiltroSede])

  // Cargar histórico de programaciones (completadas)
  const loadHistorico = async () => {
    setLoadingHistorico(true)
    try {
      const { data, error: queryError } = await aplicarFiltroSede(supabase
        .from('v_programaciones_onboarding')
        .select('*')
        .eq('estado', 'completado')
        .or('eliminado.is.null,eliminado.eq.false'))
        .order('created_at', { ascending: false })
        .limit(500)

      if (queryError) throw queryError
      setProgramacionesHistorico(await adjuntarLeadIds((data || []) as ProgramacionOnboardingCompleta[]))
    } catch {
      // silently ignored
    } finally {
      setLoadingHistorico(false)
    }
  }

  // Cargar histórico cuando se cambia al tab o sede
   
  useEffect(() => {
    if (activeTab === 'historico') {
      loadHistorico()
    }
  }, [activeTab, sedeActualId, aplicarFiltroSede])

  // Conceptos de alquiler para las etiquetas del selector de Tarifa (una sola vez).
  useEffect(() => {
    let cancelado = false
    cargarConceptosTarifa().then((m) => { if (!cancelado) setConceptosTarifa(m) })
    return () => { cancelado = true }
  }, [])

  // La vista v_programaciones_onboarding no expone las columnas de tarifa: se
  // leen de la tabla base al abrir la edicion rapida para no perderlas al guardar.
  useEffect(() => {
    const id = editingProgramacion?.id
    if (!showQuickEdit || !id) return
    let cancelado = false
    ;(async () => {
      try {
        const { data } = await (supabase.from('programaciones_onboarding') as any)
          .select('tipo_tarifa, tipo_tarifa_diurno, tipo_tarifa_nocturno')
          .eq('id', id)
          .single()
        if (cancelado || !data) return
        setQuickEditData(prev => ({
          ...prev,
          tipo_tarifa: (data.tipo_tarifa || 'antigua') as TipoTarifa,
          tipo_tarifa_diurno: (data.tipo_tarifa_diurno || data.tipo_tarifa || 'antigua') as TipoTarifa,
          tipo_tarifa_nocturno: (data.tipo_tarifa_nocturno || data.tipo_tarifa || 'antigua') as TipoTarifa,
        }))
      } catch { /* se mantienen los defaults de handleEdit */ }
    })()
    return () => { cancelado = true }
  }, [showQuickEdit, editingProgramacion?.id])

  // Handlers
  const handleCreate = () => {
    setShowCreateWizard(true)
  }

  // Llegada desde otra pantalla con la intención de crear (p. ej. "Programar
  // entrega" en Distribución en mapa v2): abrir el wizard directamente. El
  // state se limpia enseguida para que un refresh o un "atrás" no lo reabra.
  const location = useLocation()
  const navigate = useNavigate()
  // Par sugerido que llego desde "Distribucion en mapa v2". Vive aca y no en
  // el wizard porque el wizard se desmonta al cerrar y el state ya se limpio.
  const [precargaPar, setPrecargaPar] = useState<PrecargaParMapa | null>(null)
  useEffect(() => {
    const state = location.state as { abrirNueva?: boolean; precargaPar?: PrecargaParMapa } | null
    // Dos vias de entrada:
    //  - misma pestania: `location.state` (navigate del mapa);
    //  - pestania nueva: `?precarga=<id>`, porque el state no cruza un
    //    window.open y el par quedo en localStorage.
    const params = new URLSearchParams(location.search)
    const idPrecarga = params.get('precarga')
    if (!state?.abrirNueva && !idPrecarga) return

    // El par puede no venir: entrar sin par sigue siendo valido (abre el
    // wizard vacio, como antes).
    const parDeLaUrl = idPrecarga ? tomarPrecargaPar(idPrecarga) : null
    setPrecargaPar(state?.precargaPar || parDeLaUrl || null)
    setShowCreateWizard(true)
    // Se limpian state Y query para que un refresh no reabra el wizard.
    navigate(location.pathname, { replace: true, state: null })
  }, [location.state, location.search, location.pathname, navigate])

  const handleEdit = async (prog: ProgramacionOnboardingCompleta) => {
    // Leads de cada turno: se releen de la tabla base para no depender de que
    // `adjuntarLeadIds` haya funcionado al cargar la lista. Si esta lectura
    // falla se usan los de la fila; si tampoco estan, quedan `undefined` y el
    // guardado no toca esas columnas (no se pierde un lead por no saberlo).
    let leadIds: { lead_diurno_id?: string | null; lead_nocturno_id?: string | null; lead_cargo_id?: string | null } = {
      lead_diurno_id: prog.lead_diurno_id,
      lead_nocturno_id: prog.lead_nocturno_id,
      lead_cargo_id: prog.lead_cargo_id,
    }
    try {
      const { data: leadRow, error: leadRowError } = await (supabase.from('programaciones_onboarding') as any)
        .select('lead_diurno_id, lead_nocturno_id, lead_cargo_id')
        .eq('id', prog.id)
        .single()
      if (!leadRowError && leadRow) {
        leadIds = {
          lead_diurno_id: leadRow.lead_diurno_id || null,
          lead_nocturno_id: leadRow.lead_nocturno_id || null,
          lead_cargo_id: leadRow.lead_cargo_id || null,
        }
      }
    } catch { /* se usan los de la fila */ }

    setEditingProgramacion(prog)
    // Inicializar búsquedas con valores actuales como fallback visual
    // (si el ID no resuelve en la lista, el input muestra estos valores).
    // Un turno con lead no precarga su nombre en el buscador de conductores:
    // ese nombre es del lead y se muestra en el buscador de leads.
    setVehiculoSearch(prog.vehiculo_entregar_patente || prog.vehiculo_entregar_patente_sistema || '')
    setShowVehiculoDropdown(false)
    setConductorDiurnoSearch(leadIds.lead_diurno_id ? '' : (prog.conductor_diurno_nombre || ''))
    setConductorNocturnoSearch(leadIds.lead_nocturno_id ? '' : (prog.conductor_nocturno_nombre || ''))
    setConductorSearch(leadIds.lead_cargo_id ? '' : (prog.conductor_nombre || prog.conductor_display || ''))
    setShowConductorDiurnoDropdown(false)
    setShowConductorNocturnoDropdown(false)
    setShowConductorDropdown(false)
    setTipoPersonaEdicion({
      diurno: leadIds.lead_diurno_id ? 'lead' : 'conductor',
      nocturno: leadIds.lead_nocturno_id ? 'lead' : 'conductor',
      cargo: leadIds.lead_cargo_id ? 'lead' : 'conductor',
    })
    setLeadSearchEdicion({ diurno: '', nocturno: '', cargo: '' })
    setLeadDropdownEdicion(null)
    setLeadResultadosEdicion([])
    // Nocturno igual al diurno = dato duplicado: se limpia el nocturno.
    // Solo aplica a conductores (dos ids de conductor iguales).
    const nocturnoDuplicado = !!prog.conductor_nocturno_id && prog.conductor_nocturno_id === prog.conductor_diurno_id
    setQuickEditData({
      vehiculo_id: prog.vehiculo_entregar_id || '',
      vehiculo_entregar_patente: prog.vehiculo_entregar_patente || prog.vehiculo_entregar_patente_sistema || '',
      fecha_cita: prog.fecha_cita || '',
      hora_cita: prog.hora_cita?.substring(0, 5) || '10:00',
      // Conductores (IDs) - Si son iguales, limpiar nocturno para evitar duplicados
      conductor_diurno_id: prog.conductor_diurno_id || '',
      conductor_diurno_nombre: prog.conductor_diurno_nombre || '',
      conductor_diurno_dni: prog.conductor_diurno_dni || '',
      conductor_nocturno_id: (prog.conductor_nocturno_id && !nocturnoDuplicado) ? prog.conductor_nocturno_id : '',
      // Un nocturno con lead no tiene id de conductor: antes caia en '' y al
      // guardar se borraba el nombre del lead.
      conductor_nocturno_nombre: leadIds.lead_nocturno_id
        ? (prog.conductor_nocturno_nombre || '')
        : ((prog.conductor_nocturno_id && !nocturnoDuplicado) ? (prog.conductor_nocturno_nombre || '') : ''),
      conductor_nocturno_dni: (leadIds.lead_nocturno_id || (prog.conductor_nocturno_id && !nocturnoDuplicado)) ? (prog.conductor_nocturno_dni || '') : '',
      conductor_id: prog.conductor_id || '',
      conductor_nombre: prog.conductor_nombre || prog.conductor_display || '',
      conductor_dni: prog.conductor_dni || '',
      // Leads por turno (null = sin lead, undefined = no se pudo leer)
      lead_diurno_id: leadIds.lead_diurno_id,
      lead_nocturno_id: leadIds.lead_nocturno_id,
      lead_cargo_id: leadIds.lead_cargo_id,
      // Diurno
      tipo_candidato_diurno: prog.tipo_candidato_diurno,
      tipo_asignacion_diurno: prog.tipo_asignacion_diurno || prog.tipo_asignacion || 'entrega_auto',
      documento_diurno: prog.documento_diurno,
      zona_diurno: prog.zona_diurno || '',
      distancia_diurno: prog.distancia_diurno,
      // Nocturno
      tipo_candidato_nocturno: prog.tipo_candidato_nocturno,
      tipo_asignacion_nocturno: prog.tipo_asignacion_nocturno || prog.tipo_asignacion || 'entrega_auto',
      documento_nocturno: prog.documento_nocturno,
      zona_nocturno: prog.zona_nocturno || '',
      distancia_nocturno: prog.distancia_nocturno,
      // A Cargo (legacy)
      tipo_candidato: prog.tipo_candidato,
      tipo_documento: prog.tipo_documento,
      zona: prog.zona,
      distancia_minutos: prog.distancia_minutos,
      // Tarifa (se refinan con la lectura de la tabla base, ver useEffect)
      tipo_tarifa: (prog.tipo_tarifa || 'antigua') as TipoTarifa,
      tipo_tarifa_diurno: (prog.tipo_tarifa_diurno || prog.tipo_tarifa || 'antigua') as TipoTarifa,
      tipo_tarifa_nocturno: (prog.tipo_tarifa_nocturno || prog.tipo_tarifa || 'antigua') as TipoTarifa,
      // Otros
      observaciones: prog.observaciones || ''
    })
    setShowQuickEdit(true)

    // Cargar vehiculos y conductores en paralelo
    setLoadingVehiculos(true)
    setLoadingConductores(true)

    try {
      // Obtener vehiculos que no estan en reparacion/mantenimiento
      const estadosNoDisponibles = ['REPARACION', 'MANTENIMIENTO', 'TALLER_AXIS', 'TALLER_CHAPA_PINTURA', 'TALLER_ALLIANCE', 'TALLER_KALZALO', 'TALLER_MJ', 'TALLER_AUTODOC', 'TALLER_CP_PAINT_CARS', 'TALLER_CP_ANDRADA']
      const { data: vehiculosData } = await aplicarFiltroSede(supabase
        .from('vehiculos')
        .select('id, patente, marca, modelo, gnc, vehiculos_estados(codigo)')
        .is('deleted_at', null))
        .order('patente')

      // Una programación es un borrador: un vehículo con otra programación
      // pendiente sigue disponible. Solo se excluyen los vehículos ya enviados
      // a Asignaciones (asignación en estado 'programado'), salvo el actual.
      // Mismo criterio que ProgramacionAssignmentWizardV2.
      const { data: asignacionesProgramadasData } = await aplicarFiltroSede(supabase
        .from('asignaciones')
        .select('vehiculo_id')
        .eq('estado', 'programado'))

      const vehiculosEnviados = new Set((asignacionesProgramadasData || []).map((a: any) => a.vehiculo_id))

      const vehiculosFiltrados = (vehiculosData || []).filter((v: any) =>
        !estadosNoDisponibles.includes(v.vehiculos_estados?.codigo) &&
        (!vehiculosEnviados.has(v.id) || v.id === prog.vehiculo_entregar_id)
      )

      const listaVehiculos = vehiculosFiltrados.map((v: any) => ({
        id: v.id,
        patente: v.patente,
        marca: v.marca,
        modelo: v.modelo,
        gnc: v.gnc === true
      }))

      // Inyectar el vehículo actual si no está en la lista filtrada (ej. en reparación/taller)
      if (prog.vehiculo_entregar_id && !listaVehiculos.find((v: any) => v.id === prog.vehiculo_entregar_id)) {
        const vehiculoActual = (vehiculosData || []).find((v: any) => v.id === prog.vehiculo_entregar_id)
        if (vehiculoActual) {
          listaVehiculos.unshift({ id: vehiculoActual.id, patente: vehiculoActual.patente, marca: vehiculoActual.marca, modelo: vehiculoActual.modelo, gnc: vehiculoActual.gnc === true })
        } else if (prog.vehiculo_entregar_patente) {
          listaVehiculos.unshift({ id: prog.vehiculo_entregar_id, patente: prog.vehiculo_entregar_patente, marca: prog.vehiculo_entregar_marca || '', modelo: prog.vehiculo_entregar_modelo || prog.vehiculo_entregar_modelo_sistema || '', gnc: false })
        }
      }

      setVehiculosDisponibles(listaVehiculos)
    } catch {
      // silently ignored
    } finally {
      setLoadingVehiculos(false)
    }

    // Cargar TODOS los conductores (sin filtro de programados para simplicidad)
    try {
      const { data: conductoresData, error: conductoresError } = await aplicarFiltroSede(supabase
        .from('conductores')
        .select('id, nombres, apellidos, numero_dni'))
        .order('apellidos')
        .limit(1000)

      if (conductoresError) throw conductoresError

      const listaConductores = (conductoresData || []).map((c: any) => ({
        id: c.id,
        nombre: `${c.nombres || ''} ${c.apellidos || ''}`.trim(),
        dni: c.numero_dni || ''
      }))

      // Inyectar conductores actuales si no están en la lista (ej. baja, otra sede)
      const idsEnLista = new Set(listaConductores.map((c: any) => c.id))
      const conductoresAInyectar = [
        { id: prog.conductor_diurno_id, nombre: prog.conductor_diurno_nombre, dni: prog.conductor_diurno_dni },
        { id: prog.conductor_nocturno_id, nombre: prog.conductor_nocturno_nombre, dni: prog.conductor_nocturno_dni },
        { id: prog.conductor_id, nombre: prog.conductor_nombre || prog.conductor_display, dni: prog.conductor_dni },
      ]
      for (const c of conductoresAInyectar) {
        if (c.id && !idsEnLista.has(c.id) && c.nombre) {
          listaConductores.unshift({ id: c.id, nombre: c.nombre, dni: c.dni || '' })
          idsEnLista.add(c.id)
        }
      }

      setConductoresDisponibles(listaConductores)
    } catch {
      // silently ignored
    } finally {
      setLoadingConductores(false)
    }
  }

  // Guardar edicion rapida
  const handleSaveQuickEdit = async () => {
    if (!editingProgramacion) return

    setSavingQuickEdit(true)
    try {
      const isTurno = editingProgramacion.modalidad === 'turno'

      // Buscar datos del vehiculo seleccionado
      const vehiculoSeleccionado = vehiculosDisponibles.find(v => v.id === quickEditData.vehiculo_id)

      // Buscar datos de conductores seleccionados
      const conductorDiurnoSeleccionado = conductoresDisponibles.find(c => c.id === quickEditData.conductor_diurno_id)
      const conductorNocturnoSeleccionado = conductoresDisponibles.find(c => c.id === quickEditData.conductor_nocturno_id)
      const conductorSeleccionado = conductoresDisponibles.find(c => c.id === quickEditData.conductor_id)

      const updateData: any = {
        fecha_cita: quickEditData.fecha_cita,
        hora_cita: quickEditData.hora_cita,
        observaciones: quickEditData.observaciones,
        // Vehiculo
        vehiculo_entregar_id: quickEditData.vehiculo_id || null,
        vehiculo_entregar_patente: vehiculoSeleccionado?.patente || quickEditData.vehiculo_entregar_patente || null,
        vehiculo_entregar_modelo: vehiculoSeleccionado ? `${vehiculoSeleccionado.marca} ${vehiculoSeleccionado.modelo}` : null
      }

      if (isTurno) {
        // Validar que no sean el mismo conductor en ambos turnos
        if (quickEditData.conductor_diurno_id && quickEditData.conductor_nocturno_id &&
            quickEditData.conductor_diurno_id === quickEditData.conductor_nocturno_id) {
          await Swal.fire('Error', 'No se puede asignar el mismo conductor en ambos turnos', 'error')
          return
        }
        // Mismo control para leads
        if (quickEditData.lead_diurno_id && quickEditData.lead_nocturno_id &&
            quickEditData.lead_diurno_id === quickEditData.lead_nocturno_id) {
          await Swal.fire('Error', 'No se puede asignar el mismo lead en ambos turnos', 'error')
          return
        }

        // Un turno con lead deja el id de conductor en null (el lead no existe
        // en `conductores`) y guarda nombre/DNI del lead, igual que el wizard.
        // Un turno con conductor limpia el lead: nunca conviven los dos.
        const leadDiurnoId = quickEditData.lead_diurno_id
        const leadNocturnoId = quickEditData.lead_nocturno_id

        // Conductor diurno
        if (leadDiurnoId) {
          updateData.conductor_diurno_id = null
          updateData.conductor_diurno_nombre = quickEditData.conductor_diurno_nombre || null
          updateData.conductor_diurno_dni = quickEditData.conductor_diurno_dni || null
        } else {
          updateData.conductor_diurno_id = quickEditData.conductor_diurno_id || null
          updateData.conductor_diurno_nombre = conductorDiurnoSeleccionado?.nombre || quickEditData.conductor_diurno_nombre || null
          updateData.conductor_diurno_dni = conductorDiurnoSeleccionado?.dni || null
        }
        if (leadDiurnoId !== undefined) updateData.lead_diurno_id = leadDiurnoId || null
        updateData.tipo_candidato_diurno = tipoCandidatoAGuardar(quickEditData.tipo_candidato_diurno, leadDiurnoId)
        updateData.documento_diurno = quickEditData.documento_diurno
        updateData.zona_diurno = quickEditData.zona_diurno
        updateData.distancia_diurno = quickEditData.distancia_diurno || null
        updateData.tipo_tarifa_diurno = quickEditData.tipo_tarifa_diurno || 'antigua'

        // Conductor nocturno
        if (leadNocturnoId) {
          updateData.conductor_nocturno_id = null
          updateData.conductor_nocturno_nombre = quickEditData.conductor_nocturno_nombre || null
          updateData.conductor_nocturno_dni = quickEditData.conductor_nocturno_dni || null
        } else {
          updateData.conductor_nocturno_id = quickEditData.conductor_nocturno_id || null
          updateData.conductor_nocturno_nombre = conductorNocturnoSeleccionado?.nombre || quickEditData.conductor_nocturno_nombre || null
          updateData.conductor_nocturno_dni = conductorNocturnoSeleccionado?.dni || null
        }
        if (leadNocturnoId !== undefined) updateData.lead_nocturno_id = leadNocturnoId || null
        updateData.tipo_candidato_nocturno = tipoCandidatoAGuardar(quickEditData.tipo_candidato_nocturno, leadNocturnoId)
        updateData.documento_nocturno = quickEditData.documento_nocturno
        updateData.zona_nocturno = quickEditData.zona_nocturno
        updateData.distancia_nocturno = quickEditData.distancia_nocturno || null
        updateData.tipo_tarifa_nocturno = quickEditData.tipo_tarifa_nocturno || 'antigua'

        // Usar tipo_asignacion general (columnas individuales no existen aún en BD)
        updateData.tipo_asignacion = quickEditData.tipo_asignacion_diurno || quickEditData.tipo_asignacion_nocturno || 'entrega_auto'
        // Espejo legacy de tarifa (respaldo), mismo criterio que el wizard
        updateData.tipo_tarifa = quickEditData.tipo_tarifa_diurno || quickEditData.tipo_tarifa_nocturno || 'antigua'

        // Limpiar campos legacy de A CARGO para evitar datos stale
        updateData.conductor_id = null
        updateData.conductor_nombre = null
        updateData.conductor_dni = null
        updateData.lead_cargo_id = null
      } else {
        // A Cargo - campos legacy
        const leadCargoId = quickEditData.lead_cargo_id
        if (leadCargoId) {
          updateData.conductor_id = null
          updateData.conductor_nombre = quickEditData.conductor_nombre || null
          updateData.conductor_dni = quickEditData.conductor_dni || null
        } else {
          updateData.conductor_id = quickEditData.conductor_id || null
          updateData.conductor_nombre = conductorSeleccionado?.nombre || quickEditData.conductor_nombre || null
          updateData.conductor_dni = conductorSeleccionado?.dni || null
        }
        if (leadCargoId !== undefined) updateData.lead_cargo_id = leadCargoId || null
        updateData.tipo_candidato = tipoCandidatoAGuardar(quickEditData.tipo_candidato, leadCargoId)
        updateData.tipo_documento = quickEditData.tipo_documento
        updateData.zona = quickEditData.zona
        updateData.distancia_minutos = quickEditData.distancia_minutos || null
        updateData.tipo_tarifa = quickEditData.tipo_tarifa || 'antigua'

        // Limpiar campos de TURNO para evitar datos stale
        updateData.conductor_diurno_id = null
        updateData.conductor_diurno_nombre = null
        updateData.conductor_diurno_dni = null
        updateData.conductor_nocturno_id = null
        updateData.conductor_nocturno_nombre = null
        updateData.conductor_nocturno_dni = null
        updateData.lead_diurno_id = null
        updateData.lead_nocturno_id = null
      }

      const { error } = await (supabase
        .from('programaciones_onboarding') as any)
        .update(updateData)
        .eq('id', editingProgramacion.id)

      if (error) throw error

      // Sincronizar devolución vinculada (si existe) con los datos actualizados del conductor
      try {
        const conductorIdFinal = isTurno
          ? (quickEditData.conductor_diurno_id || quickEditData.conductor_nocturno_id || null)
          : (quickEditData.conductor_id || null)
        const conductorNombreFinal = isTurno
          ? (conductorDiurnoSeleccionado?.nombre || quickEditData.conductor_diurno_nombre || conductorNocturnoSeleccionado?.nombre || quickEditData.conductor_nocturno_nombre || null)
          : (conductorSeleccionado?.nombre || quickEditData.conductor_nombre || null)

        if (conductorIdFinal || conductorNombreFinal) {
          const { data: devVinculada } = await (supabase.from('devoluciones') as any)
            .select('id')
            .eq('programacion_id', editingProgramacion.id)
            .in('estado', ['pendiente', 'completado'])
            .limit(1)
          if (devVinculada && devVinculada.length > 0) {
            await (supabase.from('devoluciones') as any)
              .update({
                conductor_id: conductorIdFinal,
                conductor_nombre: conductorNombreFinal,
              })
              .eq('id', devVinculada[0].id)
          }
        }
      } catch {
        // No bloquear el guardado si falla la sincronización de devolución
      }

      await loadProgramaciones()
      setShowQuickEdit(false)
      setEditingProgramacion(null)
      showSuccess('Guardado', 'Programación actualizada correctamente')
    } catch (err: any) {
      Swal.fire('Error', err.message || 'Error al guardar', 'error')
    } finally {
      setSavingQuickEdit(false)
    }
  }

  const handleDelete = async (id: string, yaEnviada: boolean = false) => {
    const result = await Swal.fire({
      title: yaEnviada ? 'Eliminar programacion enviada?' : 'Eliminar programacion?',
      html: yaEnviada
        ? '<p style="color: #ff0033; font-weight: 500;">ATENCION: Esta programacion ya fue enviada a Entrega.</p><p>Solo se eliminara de esta lista, la asignacion en Entrega permanecera.</p>'
        : '<p>Por favor ingrese el motivo de la eliminacion:</p>',
      input: 'textarea',
      inputPlaceholder: 'Motivo de eliminacion...',
      inputAttributes: {
        'aria-label': 'Motivo de eliminacion'
      },
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ff0033',
      confirmButtonText: 'Eliminar',
      cancelButtonText: 'Cancelar',
      inputValidator: (value) => {
        if (!value || value.trim().length < 3) {
          return 'Debe ingresar un motivo (minimo 3 caracteres)'
        }
        return null
      }
    })

    if (!result.isConfirmed || !result.value) return

    try {
      // Eliminación lógica
      const { error } = await (supabase
        .from('programaciones_onboarding') as any)
        .update({
          eliminado: true,
          estado: 'cancelado',
          motivo_eliminacion: result.value.trim(),
          eliminado_at: new Date().toISOString(),
          eliminado_by: user?.id || null
        })
        .eq('id', id)

      if (error) throw error
      setProgramaciones(prev => prev.filter(p => p.id !== id))
      showSuccess('Eliminado', 'La programacion fue eliminada')
    } catch (err: any) {
      Swal.fire('Error', err.message || 'Error al eliminar', 'error')
    }
  }

  // Abrir modal copiar mensaje
  const handleCopiarMensaje = (prog: ProgramacionOnboardingCompleta) => {
    setMensajeModalProg(prog)
    setShowMensajeModal(true)
  }

  // Copiar al portapapeles
  const handleCopiarAlPortapapeles = async () => {
    if (!mensajeModalProg) return
    const mensaje = generarMensajeAgenda(mensajeModalProg)

    try {
      await navigator.clipboard.writeText(mensaje)
      setShowMensajeModal(false)
    } catch {
      // Si falla el clipboard, el usuario puede copiar manualmente del preview
    }
  }

  // Actualizar campo individual inline
  const handleUpdateField = async (id: string, field: string, value: any) => {
    try {
      const { error } = await (supabase
        .from('programaciones_onboarding') as any)
        .update({ [field]: value })
        .eq('id', id)

      if (error) throw error

      // Actualizar estado local
      setProgramaciones(prev => prev.map(p =>
        p.id === id ? { ...p, [field]: value } : p
      ))
    } catch (err: any) {
      Swal.fire('Error', err.message || 'Error al actualizar', 'error')
    }
  }

  // Enviar devolución - Crear registro en tabla devoluciones (sin asignación)
  // No se pregunta quién devuelve: eso se define al confirmar en Asignaciones
  const handleEnviarDevolucion = async (prog: ProgramacionOnboardingCompleta) => {
    if (!prog.vehiculo_entregar_id) {
      Swal.fire('Error', 'La programación no tiene vehículo asignado', 'error')
      return
    }

    // Validar que no exista ya una devolución para esta programación
    const { data: devExistente } = await (supabase.from('devoluciones') as any)
      .select('id')
      .eq('programacion_id', prog.id)
      .in('estado', ['pendiente', 'completado'])
      .limit(1)
    if (devExistente && devExistente.length > 0) {
      Swal.fire('Atención', 'Ya existe una devolución creada para esta programación', 'warning')
      return
    }

    // Construir fecha programada
    let fechaProgramada: string
    if (prog.fecha_cita) {
      const soloFecha = prog.fecha_cita.split('T')[0]
      const hora = prog.hora_cita && prog.hora_cita.trim() !== '' ? prog.hora_cita.substring(0, 5) : '10:00'
      fechaProgramada = new Date(`${soloFecha}T${hora}:00-03:00`).toISOString()
    } else {
      fechaProgramada = new Date().toISOString()
    }

    const result = await Swal.fire({
      title: 'Crear Devolución',
      html: `
        <div style="text-align: left; font-size: 14px;">
          <p><strong>Vehículo:</strong> ${prog.vehiculo_entregar_patente || 'N/A'}</p>
          <p><strong>Fecha:</strong> ${prog.fecha_cita ? new Date(prog.fecha_cita).toLocaleDateString('es-AR') : 'Hoy'}</p>
          <p style="margin-top: 10px; color: #6B7280; font-size: 12px;">Se creará un registro de devolución (no se genera asignación).</p>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#10B981',
      confirmButtonText: 'Crear Devolución',
      cancelButtonText: 'Cancelar',
      width: 440,
    })

    if (!result.isConfirmed) return

    setEnviandoEntrega(true)
    try {
      // Buscar conductor respetando la modalidad de la programación
      // TURNO: priorizar conductor_diurno, luego nocturno, luego legacy
      // A CARGO: priorizar conductor_id (legacy), luego diurno como fallback
      const esTurnoProg = prog.modalidad === 'turno'
      let conductorId = esTurnoProg
        ? (prog.conductor_diurno_id || prog.conductor_nocturno_id || prog.conductor_id || null)
        : (prog.conductor_id || prog.conductor_diurno_id || prog.conductor_nocturno_id || null)
      let conductorNombre = esTurnoProg
        ? (prog.conductor_diurno_nombre || prog.conductor_nocturno_nombre || prog.conductor_nombre?.trim() || prog.conductor_display?.trim() || null)
        : (prog.conductor_nombre?.trim() || prog.conductor_display?.trim() || prog.conductor_diurno_nombre || prog.conductor_nocturno_nombre || null)

      if (!conductorNombre) {
        // Fallback 2: buscar en la tabla programaciones_onboarding
        const { data: progDB } = await (supabase.from('programaciones_onboarding') as any)
          .select('conductor_id, conductor_nombre, conductor_diurno_id, conductor_diurno_nombre, conductor_nocturno_id, conductor_nocturno_nombre')
          .eq('id', prog.id)
          .single()
        if (progDB) {
          conductorId = conductorId || progDB.conductor_id || progDB.conductor_diurno_id || progDB.conductor_nocturno_id || null
          conductorNombre = progDB.conductor_nombre || progDB.conductor_diurno_nombre || progDB.conductor_nocturno_nombre || null
        }
      }

      if (!conductorNombre && prog.vehiculo_entregar_id) {
        // Fallback 3: buscar conductor de la asignación activa del vehículo
        const { data: asigActivas } = await (supabase as any)
          .from('asignaciones')
          .select('asignaciones_conductores(conductor_id, estado, conductores(nombres, apellidos))')
          .eq('vehiculo_id', prog.vehiculo_entregar_id)
          .in('estado', ['activa', 'activo'])
        if (asigActivas) {
          for (const asig of asigActivas) {
            for (const ac of (asig.asignaciones_conductores || [])) {
              if (ac.conductores && ac.estado !== 'cancelado') {
                conductorId = conductorId || ac.conductor_id
                conductorNombre = `${ac.conductores.nombres || ''} ${ac.conductores.apellidos || ''}`.trim()
                break
              }
            }
            if (conductorNombre) break
          }
        }
      }

      // Fallback 4: buscar en la asignación más reciente completada/finalizada del vehículo
      if (!conductorNombre && prog.vehiculo_entregar_id) {
        const { data: asigsCompletadas } = await (supabase as any)
          .from('asignaciones')
          .select('asignaciones_conductores(conductor_id, estado, conductores(nombres, apellidos))')
          .eq('vehiculo_id', prog.vehiculo_entregar_id)
          .in('estado', ['completada', 'finalizada'])
          .order('created_at', { ascending: false })
          .limit(1)
        if (asigsCompletadas) {
          for (const asig of asigsCompletadas) {
            for (const ac of (asig.asignaciones_conductores || [])) {
              if (ac.conductores && ac.estado !== 'cancelado') {
                conductorId = conductorId || ac.conductor_id
                conductorNombre = `${ac.conductores.nombres || ''} ${ac.conductores.apellidos || ''}`.trim()
                break
              }
            }
            if (conductorNombre) break
          }
        }
      }

      const { error: devError } = await (supabase.from('devoluciones') as any)
        .insert({
          vehiculo_id: prog.vehiculo_entregar_id,
          conductor_id: conductorId,
          conductor_nombre: conductorNombre,
          programacion_id: prog.id,
          programado_por: prog.created_by_name || profile?.full_name || 'Sistema',
          fecha_programada: fechaProgramada,
          estado: 'pendiente',
          observaciones: prog.observaciones || null,
          created_by: user?.id || null,
          created_by_name: profile?.full_name || 'Sistema',
          sede_id: prog.sede_id || sedeActualId || sedeUsuario?.id,
        })

      if (devError) throw devError

      // Crear visita automática con categoría "Asignaciones"
      try {
        const CATEGORIA_ASIGNACIONES_ID = '76514b14-b403-4587-993e-d64bad874594'
        const sedeVisita = prog.sede_id || sedeActualId || sedeUsuario?.id || null
        const atendedorIdResuelto = await resolverAtendedorActivo(sedeVisita)

        // Resolver nombre real desde tabla conductores para evitar que quede el DNI
        let visitanteNombre = conductorNombre || ''
        let visitanteDni = prog.conductor_dni || prog.conductor_diurno_dni || prog.conductor_nocturno_dni || null

        if (conductorId) {
          const { data: conductorDB } = await (supabase.from('conductores') as any)
            .select('nombres, apellidos, numero_dni')
            .eq('id', conductorId)
            .single()
          if (conductorDB) {
            const nombreReal = `${conductorDB.nombres || ''} ${conductorDB.apellidos || ''}`.trim()
            if (nombreReal) visitanteNombre = nombreReal
            if (conductorDB.numero_dni) visitanteDni = conductorDB.numero_dni
          }
        }

        if (!visitanteNombre) visitanteNombre = 'Conductor por definir'

        if (prog.fecha_cita && atendedorIdResuelto) {
          const soloFechaCita = prog.fecha_cita.split('T')[0]
          const horaCita = prog.hora_cita && prog.hora_cita.trim() !== ''
            ? prog.hora_cita.substring(0, 5)
            : '10:00'
          const fechaHoraVisita = new Date(`${soloFechaCita}T${horaCita}:00-03:00`).toISOString()

          await (supabase.from('visitas') as any).insert({
            categoria_id: CATEGORIA_ASIGNACIONES_ID,
            motivo_id: null,
            atendedor_id: atendedorIdResuelto,
            sede_id: prog.sede_id || sedeActualId || sedeUsuario?.id,
            nombre_visitante: visitanteNombre,
            dni_visitante: visitanteDni,
            patente: prog.vehiculo_entregar_patente || null,
            fecha_hora: fechaHoraVisita,
            duracion_minutos: 30,
            nota: `Devolución de Vehículo — ${prog.modalidad || ''} — ${prog.vehiculo_entregar_patente || ''}`,
            estado: 'pendiente',
            citador_id: user?.id || null,
            citador_nombre: profile?.full_name || 'Sistema',
          })
        }
      } catch {
        // No bloquear el flujo principal si falla la creación de visita
      }

      // Marcar programación como completada
      await (supabase.from('programaciones_onboarding') as any)
        .update({
          estado: 'completado',
          fecha_asignacion_creada: new Date().toISOString(),
        })
        .eq('id', prog.id)

      setProgramaciones(prev => prev.filter(p => p.id !== prog.id))
      showSuccess('Devolución Creada', `${prog.vehiculo_entregar_patente}`)
    } catch (err: any) {
      Swal.fire('Error', err.message || 'Error al crear devolución', 'error')
    } finally {
      setEnviandoEntrega(false)
    }
  }

  // Enviar a entrega - Crear asignacion
  /**
   * Turnos de esta programacion que todavia estan ocupados por un LEAD.
   * Mientras quede alguno no se puede enviar a entrega: la asignacion necesita
   * un `conductores.id` real (asignaciones_conductores.conductor_id es FK).
   */
  const leadsPendientes = (prog: ProgramacionOnboardingCompleta): LeadPendiente[] => {
    const pendientes: LeadPendiente[] = []
    if (prog.lead_diurno_id) {
      pendientes.push({
        leadId: prog.lead_diurno_id,
        slot: 'diurno',
        label: 'Diurno',
        nombre: prog.conductor_diurno_nombre || 'Sin nombre',
      })
    }
    if (prog.lead_nocturno_id) {
      pendientes.push({
        leadId: prog.lead_nocturno_id,
        slot: 'nocturno',
        label: 'Nocturno',
        nombre: prog.conductor_nocturno_nombre || 'Sin nombre',
      })
    }
    if (prog.lead_cargo_id) {
      pendientes.push({
        leadId: prog.lead_cargo_id,
        slot: 'cargo',
        label: 'A Cargo',
        nombre: prog.conductor_nombre || prog.conductor_display || 'Sin nombre',
      })
    }
    return pendientes
  }

  const handleEnviarAEntrega = async (prog: ProgramacionOnboardingCompleta) => {
    // Si es devolución, usar flujo separado
    if (prog.tipo_asignacion === 'devolucion_vehiculo') {
      return handleEnviarDevolucion(prog)
    }

    // ANTES que cualquier otra validacion: si un turno lo ocupa un lead, hay
    // que convertirlo. El modal repunta la programacion al conductor nuevo y
    // vuelve a entrar aca con los datos ya actualizados.
    const pendientes = leadsPendientes(prog)
    if (pendientes.length > 0) {
      setAvisoLeads({ prog, pendientes })
      return
    }

    // Tarifa de cobro: leer SIEMPRE de la tabla base (la vista
    // v_programaciones_onboarding no expone las columnas nuevas).
    let tarifaProg: { tipo_tarifa?: string | null; tipo_tarifa_diurno?: string | null; tipo_tarifa_nocturno?: string | null } = {}
    try {
      const { data: tarifaRow } = await (supabase.from('programaciones_onboarding') as any)
        .select('tipo_tarifa, tipo_tarifa_diurno, tipo_tarifa_nocturno')
        .eq('id', prog.id)
        .single()
      if (tarifaRow) tarifaProg = tarifaRow
    } catch { /* fallback: todo queda en antigua */ }

    // Verificar qué conductores son "asignacion_companero" (informativo, no bloquea)
    const diurnoEsCompanero = prog.tipo_asignacion_diurno === 'asignacion_companero'
    const nocturnoEsCompanero = prog.tipo_asignacion_nocturno === 'asignacion_companero'
    const legacyEsCompanero = prog.tipo_asignacion === 'asignacion_companero'

    // NOTA: Ya no bloqueamos la creación de asignación para "asignacion_companero"
    // Siempre se crea/actualiza la asignación para que quede en el histórico
    // El tipo "asignacion_companero" solo es informativo

    // Validar que tenga los datos minimos
    if (!prog.vehiculo_entregar_id && !prog.vehiculo_entregar_patente) {
      Swal.fire('Error', 'La programacion no tiene vehiculo asignado', 'error')
      return
    }

    // Validar conductor según modalidad
    const tieneConductorLegacy = prog.conductor_id || prog.conductor_nombre
    const tieneConductorDiurno = prog.conductor_diurno_id || prog.conductor_diurno_nombre
    const tieneConductorNocturno = prog.conductor_nocturno_id || prog.conductor_nocturno_nombre

    if (!tieneConductorLegacy && !tieneConductorDiurno && !tieneConductorNocturno) {
      Swal.fire('Error', 'La programacion no tiene conductor asignado', 'error')
      return
    }

    // GNC del vehículo: define qué concepto de alquiler aplica (P001/P014, etc.).
    // Se resuelve junto con la validación de campos y se reusa más abajo.
    let vehiculoTieneGnc = false

    // ─── Validar campos obligatorios de vehículo y conductor(es) ───
    // Antes de crear la asignación, verificar que los datos necesarios para
    // las plantillas de contrato estén completos en la base de datos.
    {
      const camposFaltantes: string[] = []

      // 1) Validar vehículo
      if (prog.vehiculo_entregar_id) {
        const { data: veh } = await supabase
          .from('vehiculos')
          .select('numero_motor, numero_chasis, marca, modelo, anio, color, titular, cobertura, gnc')
          .eq('id', prog.vehiculo_entregar_id)
          .single() as { data: { numero_motor: string | null; numero_chasis: string | null; marca: string | null; modelo: string | null; anio: number | null; color: string | null; titular: string | null; cobertura: string | null; gnc: boolean | null } | null }

        if (veh) {
          vehiculoTieneGnc = veh.gnc === true
          if (!veh.numero_motor?.trim()) camposFaltantes.push('Vehículo → Número de Motor')
          if (!veh.numero_chasis?.trim()) camposFaltantes.push('Vehículo → Número de Chasis')
          if (!veh.marca?.trim()) camposFaltantes.push('Vehículo → Marca')
          if (!veh.modelo?.trim()) camposFaltantes.push('Vehículo → Modelo')
          if (!veh.anio) camposFaltantes.push('Vehículo → Año')
          if (!veh.color?.trim()) camposFaltantes.push('Vehículo → Color')
          if (!veh.titular?.trim()) camposFaltantes.push('Vehículo → Titular')
          if (!veh.cobertura?.trim()) camposFaltantes.push('Vehículo → Cobertura')
        }
      }

      // 2) Validar conductor(es)
      const conductorIds: { id: string; label: string }[] = []
      if (prog.conductor_id) {
        conductorIds.push({ id: prog.conductor_id, label: 'Conductor' })
      }
      if (prog.conductor_diurno_id) {
        conductorIds.push({ id: prog.conductor_diurno_id, label: 'Conductor Diurno' })
      }
      if (prog.conductor_nocturno_id) {
        conductorIds.push({ id: prog.conductor_nocturno_id, label: 'Conductor Nocturno' })
      }

      for (const { id, label } of conductorIds) {
        const { data: cond } = await supabase
          .from('conductores')
          .select('numero_dni, fecha_nacimiento, direccion, email, telefono_contacto, nacionalidad_id, estado_civil_id')
          .eq('id', id)
          .single() as { data: { numero_dni: string | null; fecha_nacimiento: string | null; direccion: string | null; email: string | null; telefono_contacto: string | null; nacionalidad_id: string | null; estado_civil_id: string | null } | null }

        if (cond) {
          if (!cond.numero_dni?.trim()) camposFaltantes.push(`${label} → DNI`)
          if (!cond.fecha_nacimiento) camposFaltantes.push(`${label} → Fecha de Nacimiento`)
          if (!cond.direccion?.trim()) camposFaltantes.push(`${label} → Dirección`)
          if (!cond.email?.trim()) camposFaltantes.push(`${label} → Email`)
          if (!cond.telefono_contacto?.trim()) camposFaltantes.push(`${label} → Teléfono`)
          if (!cond.nacionalidad_id) camposFaltantes.push(`${label} → Nacionalidad`)
          if (!cond.estado_civil_id) camposFaltantes.push(`${label} → Estado Civil`)
        }
      }

      if (camposFaltantes.length > 0) {
        await Swal.fire({
          title: 'Datos obligatorios incompletos',
          html: `
            <div style="text-align: left; font-size: 13px; max-height: 300px; overflow-y: auto;">
              <p style="margin-bottom: 10px; color: #6B7280;">
                No se puede enviar la programación porque faltan los siguientes datos obligatorios:
              </p>
              <ul style="list-style: none; padding: 0; margin: 0;">
                ${camposFaltantes.map(c => `<li style="padding: 4px 0; border-bottom: 1px solid #f3f4f6;">&#x2022; <strong>${c}</strong></li>`).join('')}
              </ul>
              <p style="margin-top: 12px; color: #9CA3AF; font-size: 12px;">
                Complete estos datos en el módulo correspondiente (Vehículos o Conductores) antes de enviar, para generar el documento Carta Oferta.
              </p>
            </div>
          `,
          icon: 'warning',
          confirmButtonText: 'Entendido',
          confirmButtonColor: '#F59E0B',
          width: 480,
        })
        return
      }
    }

    // Para TURNO: verificar confirmaciones y determinar qué conductores enviar
    let enviarDiurno = true
    let enviarNocturno = true
    
    if (prog.modalidad === 'turno') {
      const diurnoConfirmo = prog.confirmacion_diurno === 'confirmo'
      const nocturnoConfirmo = prog.confirmacion_nocturno === 'confirmo'
      
      // Si ninguno confirmó, advertir pero permitir continuar
      if (!diurnoConfirmo && !nocturnoConfirmo) {
        const result = await Swal.fire({
          title: 'Ningún conductor confirmó',
          html: `
            <div style="text-align: left; font-size: 14px;">
              <p style="color: #ff0033;"><strong>Atención:</strong> Ninguno de los conductores ha confirmado asistencia.</p>
              <p><strong>D:</strong> ${prog.conductor_diurno_nombre || '-'} - <span style="color: #6B7280;">${prog.confirmacion_diurno === 'no_confirmo' ? 'No confirmó' : prog.confirmacion_diurno === 'reprogramar' ? 'Reprogramar' : 'Sin confirmar'}</span></p>
              <p><strong>N:</strong> ${prog.conductor_nocturno_nombre || '-'} - <span style="color: #6B7280;">${prog.confirmacion_nocturno === 'no_confirmo' ? 'No confirmó' : prog.confirmacion_nocturno === 'reprogramar' ? 'Reprogramar' : 'Sin confirmar'}</span></p>
            </div>
          `,
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#F59E0B',
          confirmButtonText: 'Enviar de todas formas',
          cancelButtonText: 'Cancelar'
        })
        if (!result.isConfirmed) return
      } else if (diurnoConfirmo !== nocturnoConfirmo) {
        // Si solo uno confirmó, preguntar qué hacer
        const quienConfirmo = diurnoConfirmo ? 'DIURNO' : 'NOCTURNO'
        const quienNo = diurnoConfirmo ? 'NOCTURNO' : 'DIURNO'
        const nombreConfirmo = diurnoConfirmo ? prog.conductor_diurno_nombre : prog.conductor_nocturno_nombre
        const nombreNo = diurnoConfirmo ? prog.conductor_nocturno_nombre : prog.conductor_diurno_nombre
        const estadoNo = diurnoConfirmo
          ? (prog.confirmacion_nocturno === 'no_confirmo' ? 'No confirmó' : prog.confirmacion_nocturno === 'reprogramar' ? 'Reprogramar' : 'Sin confirmar')
          : (prog.confirmacion_diurno === 'no_confirmo' ? 'No confirmó' : prog.confirmacion_diurno === 'reprogramar' ? 'Reprogramar' : 'Sin confirmar')

        const result = await Swal.fire({
          title: 'Solo 1 conductor confirmó',
          html: `
            <div style="text-align: left; font-size: 14px;">
              <p><strong style="color: #10B981;">${quienConfirmo}:</strong> ${nombreConfirmo} - <span style="color: #10B981;">Confirmó</span></p>
              <p><strong style="color: #ff0033;">${quienNo}:</strong> ${nombreNo} - <span style="color: #ff0033;">${estadoNo}</span></p>
              <p style="margin-top: 12px; color: #6B7280;">
                ¿Cómo desea proceder?
              </p>
            </div>
          `,
          icon: 'question',
          showCancelButton: true,
          showDenyButton: true,
          confirmButtonColor: '#10B981',
          denyButtonColor: '#3B82F6',
          confirmButtonText: 'Enviar ambos',
          denyButtonText: `Solo ${quienConfirmo}`,
          cancelButtonText: 'Cancelar'
        })

        if (result.isDismissed) return

        // Si eligió "Solo el confirmado" (deny button)
        if (result.isDenied) {
          enviarDiurno = diurnoConfirmo
          enviarNocturno = nocturnoConfirmo
        }
        // Si eligió "Enviar ambos" (confirm button) - ambos quedan en true
      }
      // Si ambos confirmaron, continuar normal
    }

    // ─── Determinar si corresponde generar documentos ───
    // Bariloche no tiene plantillas para turnos, se excluye de la generación.
    // Se resuelve acá (y no al momento de generar) porque la validación de
    // tarifas de más abajo depende de esto.
    const SEDE_BARILOCHE_ID = 'f37193f7-5805-4d87-820d-c4521824860e'
    const sedeDelProg = prog.sede_id || sedeActualId || sedeUsuario?.id || null
    const esBarilocheTurno = sedeDelProg === SEDE_BARILOCHE_ID && prog.modalidad === 'turno'

    const needsDocGeneration = esBarilocheTurno ? false : (
      prog.modalidad === 'a_cargo'
        ? (prog.tipo_documento && prog.tipo_documento !== 'na')
        : ((prog.documento_diurno && prog.documento_diurno !== 'na') ||
           (prog.documento_nocturno && prog.documento_nocturno !== 'na'))
    )

    // ─── Validar tarifas antes de crear nada ───
    // La generación del documento aborta si el concepto de alquiler del período
    // vigente no tiene cargado "Total por semana (Sin IVA)". Se verifica ACÁ,
    // antes de crear la asignación, para que un precio sin cargar no deje una
    // asignación creada y sin Carta Oferta (la programación pasa a 'completado'
    // y desaparece de Pendientes, sin forma de reintentar).
    if (needsDocGeneration) {
      const tarifasRequeridas: TarifaRequerida[] = []

      if (prog.modalidad === 'a_cargo') {
        if (prog.conductor_id && prog.tipo_documento && prog.tipo_documento !== 'na') {
          tarifasRequeridas.push({
            modalidad: 'cargo',
            tarifa: (tarifaProg.tipo_tarifa as TipoTarifa) || 'antigua',
            label: 'Conductor',
          })
        }
      } else {
        if (enviarDiurno && prog.conductor_diurno_id && prog.documento_diurno && prog.documento_diurno !== 'na') {
          tarifasRequeridas.push({
            modalidad: 'diurno',
            tarifa: (tarifaProg.tipo_tarifa_diurno as TipoTarifa) || (tarifaProg.tipo_tarifa as TipoTarifa) || 'antigua',
            label: 'Conductor Diurno',
          })
        }
        if (enviarNocturno && prog.conductor_nocturno_id && prog.documento_nocturno && prog.documento_nocturno !== 'na') {
          tarifasRequeridas.push({
            modalidad: 'nocturno',
            tarifa: (tarifaProg.tipo_tarifa_nocturno as TipoTarifa) || (tarifaProg.tipo_tarifa as TipoTarifa) || 'antigua',
            label: 'Conductor Nocturno',
          })
        }
      }

      const tarifasFaltantes = await validarPreciosSemanales(tarifasRequeridas, vehiculoTieneGnc)

      if (tarifasFaltantes.length > 0) {
        await Swal.fire({
          title: 'Tarifa sin precio cargado',
          html: `
            <div style="text-align: left; font-size: 13px; max-height: 300px; overflow-y: auto;">
              <p style="margin-bottom: 10px; color: #6B7280;">
                No se puede enviar la programación porque el documento no podría expresar el importe:
              </p>
              <ul style="list-style: none; padding: 0; margin: 0;">
                ${tarifasFaltantes.map(c => `<li style="padding: 4px 0; border-bottom: 1px solid #f3f4f6;">&#x2022; <strong>${c}</strong></li>`).join('')}
              </ul>
              <p style="margin-top: 12px; color: #9CA3AF; font-size: 12px;">
                Cargue el importe en Facturación → Conceptos antes de enviar.
              </p>
            </div>
          `,
          icon: 'warning',
          confirmButtonText: 'Entendido',
          confirmButtonColor: '#F59E0B',
          width: 480,
        })
        return
      }
    }

    // Formatear hora para mostrar
    const horaDisplay = prog.hora_cita ? prog.hora_cita.substring(0, 5) : 'Sin definir'

    // Construir display de conductores según modalidad (solo los que se van a enviar)
    let conductorDisplay = '-'
    if (prog.modalidad === 'turno') {
      const conductores = []
      if (enviarDiurno && prog.conductor_diurno_nombre) conductores.push(`D: ${prog.conductor_diurno_nombre}`)
      if (enviarNocturno && prog.conductor_nocturno_nombre) conductores.push(`N: ${prog.conductor_nocturno_nombre}`)
      conductorDisplay = conductores.length > 0 ? conductores.join('<br>') : '-'
    } else {
      conductorDisplay = prog.conductor_display || prog.conductor_nombre || '-'
    }

    const result = await Swal.fire({
      title: 'Enviar a Entrega',
      html: `
        <div style="text-align: left; font-size: 14px;">
          <p><strong>Vehiculo:</strong> ${prog.vehiculo_entregar_patente || prog.vehiculo_entregar_patente_sistema || '-'}</p>
          <p><strong>Conductor${prog.modalidad === 'turno' && enviarDiurno && enviarNocturno ? 'es' : ''}:</strong><br>${conductorDisplay}</p>
          <p><strong>Modalidad:</strong> ${prog.modalidad === 'turno' ? 'Turno' : 'A Cargo'}</p>
          <p><strong>Fecha:</strong> ${prog.fecha_cita ? new Date(prog.fecha_cita + 'T12:00:00').toLocaleDateString('es-AR') : 'Sin definir'}</p>
          <p><strong>Hora:</strong> ${horaDisplay}</p>
        </div>
        <p style="margin-top: 16px; color: #6B7280;">Se creara una asignacion en estado <strong>Programado</strong></p>
        <p style="margin-top: 8px; color: #6B7280; font-size: 13px;">Se creará el documento carta oferta correspondiente por cada conductor.</p>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#10B981',
      confirmButtonText: 'Crear Asignacion',
      cancelButtonText: 'Cancelar'
    })

    if (!result.isConfirmed) return

    setEnviandoEntrega(true)
    try {
      // Helper para mapear documento de programación a asignación
      const mapDocumento = (doc: string | undefined) => {
        if (doc === 'carta_oferta') return 'CARTA_OFERTA'
        if (doc === 'anexo') return 'ANEXO'
        return 'N/A'
      }

      // NOTA: La lógica de "asignacion_companero" se maneja al CONFIRMAR la asignación,
      // no aquí. Aquí creamos la asignación con TODOS los conductores visibles.
      // Al confirmar (handleConfirmar), se agrega el conductor nuevo a la asignación existente
      // y se finaliza esta asignación nueva.

      // Crear nueva asignación normalmente (mostrando TODOS los conductores)
      // Generar codigo de asignacion único (incluye segundos y ms para evitar duplicados)
      const fecha = new Date()
      const codigo = `ASG-${fecha.getFullYear()}${String(fecha.getMonth() + 1).padStart(2, '0')}${String(fecha.getDate()).padStart(2, '0')}-${String(fecha.getHours()).padStart(2, '0')}${String(fecha.getMinutes()).padStart(2, '0')}${String(fecha.getSeconds()).padStart(2, '0')}`

      // Crear asignacion
      // modalidad en programacion es 'turno' o 'a_cargo', en asignacion también es 'turno' o 'a_cargo'
      const esTurno = prog.modalidad === 'turno'

      // Construir fecha_programada correctamente con la hora de la cita en timezone Argentina (UTC-3)
      let fechaProgramada: string
      if (prog.fecha_cita) {
        // Extraer solo la fecha (YYYY-MM-DD) en caso de que venga con timezone
        const soloFecha = prog.fecha_cita.split('T')[0]
        const hora = prog.hora_cita && prog.hora_cita.trim() !== ''
          ? prog.hora_cita.substring(0, 5)
          : '10:00'
        // Forzar timezone Argentina (UTC-3) para que la hora sea siempre la de Argentina
        fechaProgramada = new Date(`${soloFecha}T${hora}:00-03:00`).toISOString()
      } else {
        fechaProgramada = new Date().toISOString()
      }

      // Construir notas con metadata de companeros para que al confirmar sepamos quién es quién
      let notasBase = prog.observaciones || `Creado desde programacion. Tipo: ${TIPO_ASIGNACION_LABELS[prog.tipo_asignacion || ''] || prog.tipo_asignacion}`

      // Agregar metadata de companeros al final
      const companeroMeta: string[] = []
      if (diurnoEsCompanero && prog.conductor_diurno_id) {
        companeroMeta.push(`[COMPANERO:diurno:${prog.conductor_diurno_id}]`)
      }
      if (nocturnoEsCompanero && prog.conductor_nocturno_id) {
        companeroMeta.push(`[COMPANERO:nocturno:${prog.conductor_nocturno_id}]`)
      }
      if (companeroMeta.length > 0) {
        notasBase = `${notasBase}\n${companeroMeta.join('\n')}`
      }

      // NO finalizar asignaciones activas aquí: la asignación se crea como "programado"
      // y no debe afectar asignaciones existentes. La finalización ocurre en
      // AsignacionesModule.handleConfirmProgramacion cuando la asignación pasa a "activa".

      const { data: asignacion, error: asignacionError } = await (supabase
        .from('asignaciones') as any)
        .insert({
          codigo,
          vehiculo_id: prog.vehiculo_entregar_id,
          modalidad: esTurno ? 'turno' : 'a_cargo',
          horario: esTurno ? 'turno' : 'todo_dia',
          fecha_programada: fechaProgramada,
          estado: 'programado',
          notas: notasBase,
          // Tarifa de cobro heredada de la programacion (default 'antigua')
          tipo_tarifa: tarifaProg.tipo_tarifa_diurno || tarifaProg.tipo_tarifa || 'antigua',
          zona: prog.zona || prog.zona_diurno || prog.zona_nocturno || null,
          created_by: user?.id || null,
          created_by_name: profile?.full_name || 'Sistema',
          sede_id: prog.sede_id || sedeActualId || sedeUsuario?.id,
        })
        .select()
        .single()

      if (asignacionError) throw asignacionError

      // Crear asignacion_conductor(es) segun modalidad
      // NOTA: Solo insertamos conductores que confirmaron (o todos si no hay filtro)
      // La lógica especial de companero se ejecuta al CONFIRMAR la asignación
      let conductoresInsertados = 0

      // Insertar conductor diurno (solo si debe enviarse)
      if (prog.conductor_diurno_id && enviarDiurno) {
        const { error: diurnoError } = await (supabase
          .from('asignaciones_conductores') as any)
          .insert({
            asignacion_id: asignacion.id,
            conductor_id: prog.conductor_diurno_id,
            horario: 'diurno',
            estado: 'asignado',
            documento: mapDocumento(prog.documento_diurno),
            tipo_tarifa: tarifaProg.tipo_tarifa_diurno || tarifaProg.tipo_tarifa || 'antigua'
          })
        if (diurnoError) throw diurnoError
        conductoresInsertados++
      }

      // Insertar conductor nocturno (solo si debe enviarse)
      if (prog.conductor_nocturno_id && enviarNocturno) {
        const { error: nocturnoError } = await (supabase
          .from('asignaciones_conductores') as any)
          .insert({
            asignacion_id: asignacion.id,
            conductor_id: prog.conductor_nocturno_id,
            horario: 'nocturno',
            estado: 'asignado',
            documento: mapDocumento(prog.documento_nocturno),
            tipo_tarifa: tarifaProg.tipo_tarifa_nocturno || tarifaProg.tipo_tarifa || 'antigua'
          })
        if (nocturnoError) throw nocturnoError
        conductoresInsertados++
      }

      // Si no hay conductores duales, intentar con conductor legacy (A CARGO)
      // Solo si NO es asignacion_companero (aunque este caso ya se maneja arriba con todosEsCompanero)
      if (conductoresInsertados === 0 && prog.conductor_id && !legacyEsCompanero) {
        const { error: conductorError } = await (supabase
          .from('asignaciones_conductores') as any)
          .insert({
            asignacion_id: asignacion.id,
            conductor_id: prog.conductor_id,
            horario: 'todo_dia',
            estado: 'asignado',
            documento: mapDocumento(prog.tipo_documento),
            tipo_tarifa: tarifaProg.tipo_tarifa || 'antigua'
          })
        if (conductorError) throw conductorError
        conductoresInsertados++
      }

      // Actualizar programacion con referencia a la asignacion y marcar como completado
      await (supabase.from('programaciones_onboarding') as any)
        .update({
          asignacion_id: asignacion.id,
          fecha_asignacion_creada: new Date().toISOString(),
          estado: 'completado' // Marcar como completado para que no se liste mas
        })
        .eq('id', prog.id)

      // Crear visita automática con categoría "Asignaciones"
      try {
        const visitanteNombres: string[] = []
        const visitanteDnis: string[] = []
        if (esTurno) {
          if (prog.conductor_diurno_nombre && enviarDiurno) {
            visitanteNombres.push(prog.conductor_diurno_nombre)
            visitanteDnis.push(prog.conductor_diurno_dni || '')
          }
          if (prog.conductor_nocturno_nombre && enviarNocturno) {
            visitanteNombres.push(prog.conductor_nocturno_nombre)
            visitanteDnis.push(prog.conductor_nocturno_dni || '')
          }
        } else if (prog.conductor_nombre) {
          visitanteNombres.push(prog.conductor_nombre)
          visitanteDnis.push(prog.conductor_dni || '')
        }

        const tipoLabel = TIPO_ASIGNACION_LABELS[prog.tipo_asignacion || ''] || prog.tipo_asignacion || 'Asignación'

        const CATEGORIA_ASIGNACIONES_ID = '76514b14-b403-4587-993e-d64bad874594'
        const sedeVisita = prog.sede_id || sedeActualId || sedeUsuario?.id || null
        const atendedorIdResuelto = await resolverAtendedorActivo(sedeVisita)

        if (visitanteNombres.length > 0 && prog.fecha_cita && atendedorIdResuelto) {
          const soloFechaCita = prog.fecha_cita.split('T')[0]
          const horaCita = prog.hora_cita && prog.hora_cita.trim() !== ''
            ? prog.hora_cita.substring(0, 5)
            : '10:00'
          const fechaHoraVisita = new Date(`${soloFechaCita}T${horaCita}:00-03:00`).toISOString()

          await (supabase.from('visitas') as any).insert({
            categoria_id: CATEGORIA_ASIGNACIONES_ID,
            motivo_id: null,
            atendedor_id: atendedorIdResuelto,
            sede_id: prog.sede_id || sedeActualId || sedeUsuario?.id,
            nombre_visitante: visitanteNombres.join('; '),
            dni_visitante: visitanteDnis.join('; ') || null,
            patente: prog.vehiculo_entregar_patente || null,
            fecha_hora: fechaHoraVisita,
            duracion_minutos: 30,
            nota: `${tipoLabel} — ${prog.modalidad || ''} — Código: ${asignacion.codigo}`,
            estado: 'pendiente',
            citador_id: user?.id || null,
            citador_nombre: profile?.full_name || 'Sistema',
          })
        }
      } catch {
        // No bloquear el flujo principal si falla la creación de visita
      }

      // Generar documentos si corresponde (needsDocGeneration se resolvió antes
      // de crear la asignación, junto con la validación de tarifas)
      if (needsDocGeneration) {
        // Si la vista no trae propietario, consultar la tabla base
        let propietarioValue = prog.propietario
        if (!propietarioValue) {
          const { data: progDB } = await (supabase.from('programaciones_onboarding') as any)
            .select('propietario')
            .eq('id', prog.id)
            .single()
          propietarioValue = progDB?.propietario || ''
        }

        const contractParams = {
          conductor_id: prog.modalidad === 'a_cargo' ? prog.conductor_id : null,
          conductor_diurno_id: (prog.modalidad === 'turno' && enviarDiurno) ? prog.conductor_diurno_id : null,
          conductor_nocturno_id: (prog.modalidad === 'turno' && enviarNocturno) ? prog.conductor_nocturno_id : null,
          vehiculo_id: prog.vehiculo_entregar_id as string,
          tipo_documento: prog.modalidad === 'a_cargo' ? prog.tipo_documento : null,
          documento_diurno: (prog.modalidad === 'turno' && enviarDiurno) ? prog.documento_diurno : null,
          documento_nocturno: (prog.modalidad === 'turno' && enviarNocturno) ? prog.documento_nocturno : null,
          // Tarifa: define el concepto de alquiler del que sale el importe del
          // documento. En turno va por conductor, con respaldo en la de la
          // programación (mismo criterio que el insert de asignaciones).
          tipo_tarifa: prog.modalidad === 'a_cargo'
            ? (tarifaProg.tipo_tarifa || 'antigua')
            : null,
          tipo_tarifa_diurno: (prog.modalidad === 'turno' && enviarDiurno)
            ? (tarifaProg.tipo_tarifa_diurno || tarifaProg.tipo_tarifa || 'antigua')
            : null,
          tipo_tarifa_nocturno: (prog.modalidad === 'turno' && enviarNocturno)
            ? (tarifaProg.tipo_tarifa_nocturno || tarifaProg.tipo_tarifa || 'antigua')
            : null,
          modalidad: (prog.modalidad || 'turno') as 'turno' | 'a_cargo',
          sede_id: prog.sede_id || sedeActualId || sedeUsuario?.id || null,
          programacion_id: prog.id,
          propietario: propietarioValue,
          created_by: user?.id || null,
          created_by_name: profile?.full_name || 'Sistema'
        }

        // Se ESPERA a proposito (antes era fire-and-forget). Dos razones:
        //  - el overlay de carga tiene que cubrir tambien la generacion, que es
        //    la parte lenta;
        //  - el aviso de documentos tiene que salir ANTES del "Asignacion
        //    Creada", que es el final del flujo.
        // `generateContracts` ya atrapa sus propios errores y devuelve
        // success:false; el try/catch es por si falla algo fuera de eso.
        let contractResult: { success: boolean; documents: GeneratedDocument[]; error?: string }
        try {
          contractResult = await generateContracts(contractParams)
        } catch (err) {
          console.error('[Contract] Error:', err)
          contractResult = { success: false, documents: [], error: 'Ocurrio un error al generar los documentos.' }
        }

        // El overlay esta en z-index 9999 y SweetAlert2 en 1060: si no se baja
        // primero, el modal queda DEBAJO y su boton no se puede tocar. El tick
        // le da a React el respiro para desmontarlo antes de abrir el modal.
        setEnviandoEntrega(false)
        await new Promise((r) => setTimeout(r, 0))

        if (contractResult.success && contractResult.documents.length > 0) {
          const docLinks = contractResult.documents.map((d: GeneratedDocument) => {
            const label = d.turno ? `${d.conductor_nombre} (${d.turno})` : d.conductor_nombre
            return `<li><strong>${label}</strong>: <a href="${d.folderUrl}" target="_blank" rel="noopener">Ver carpeta en Drive</a></li>`
          }).join('')

          await Swal.fire({
            icon: 'success',
            title: 'Documentos generados',
            html: `<p>Se generaron los siguientes documentos:</p><ul style="text-align:left;margin-top:8px">${docLinks}</ul>`,
            confirmButtonText: 'Entendido'
          })
        } else if (!contractResult.success) {
          // La asignacion YA quedo creada en la base: el fallo es solo del
          // documento. Se dice las dos cosas para que nadie crea que se perdio
          // todo, y se sigue mostrando el exito abajo.
          await Swal.fire({
            icon: 'warning',
            title: 'Error al generar documentos',
            html: `<p>${contractResult.error || 'No se pudieron generar los documentos.'}</p>`
              + '<p style="margin-top:10px"><b>La asignación se creó igual.</b> El documento queda pendiente: '
              + 'la asignación va a figurar sin carpeta en el módulo de Asignaciones.</p>',
            confirmButtonText: 'Entendido'
          })
        }
      }

      // Remover de la lista local (ya no debe aparecer)
      setProgramaciones(prev => prev.filter(p => p.id !== prog.id))

      showSuccess('Asignación Creada', `Código: ${asignacion.codigo}`)

    } catch (err: any) {
      Swal.fire('Error', err.message || 'Error al crear asignacion', 'error')
    } finally {
      setEnviandoEntrega(false)
    }
  }

  // Handler para cambiar tipo de asignación (auto-setea documento a 'na' para devolucion)
  const handleTipoAsignacionChange = (progId: string, tipoField: string, docField: string, value: string) => {
    handleUpdateField(progId, tipoField, value || null)
    if (value === 'devolucion_vehiculo') {
      handleUpdateField(progId, docField, 'na')
    }
  }

  // Columnas de la tabla
  const columns = useMemo<ColumnDef<ProgramacionOnboardingCompleta, any>[]>(() => [
    {
      accessorKey: 'vehiculo_entregar_patente',
      header: 'Vehiculo',
      cell: ({ row }) => (
        <div className="prog-vehiculo-cell">
          <span className="prog-patente">
            {row.original.vehiculo_entregar_patente || row.original.vehiculo_entregar_patente_sistema || '-'}
          </span>
          <span className="prog-modelo">
            {row.original.vehiculo_entregar_modelo || row.original.vehiculo_entregar_modelo_sistema || ''}
          </span>
        </div>
      )
    },
    {
      id: 'programados',
      header: 'Programados',
      accessorFn: (row) => {
        // Para modalidad A CARGO, usar el conductor legacy o el diurno
        if (row.modalidad === 'a_cargo' || !row.modalidad) {
          return row.conductor_display || row.conductor_nombre || row.conductor_diurno_nombre || ''
        }
        // Para TURNO, concatenar ambos conductores para busqueda
        const d = row.conductor_diurno_nombre || row.conductor_nombre || ''
        const n = row.conductor_nocturno_nombre || ''
        return `${d} ${n}`.trim()
      },
      cell: ({ row }) => {
        const { modalidad, conductor_diurno_nombre, conductor_nocturno_nombre, conductor_display, conductor_nombre, turno } = row.original

        // Si es A CARGO, mostrar solo el conductor
        if (modalidad === 'a_cargo' || !modalidad) {
          const nombre = conductor_display || conductor_nombre || conductor_diurno_nombre
          if (nombre) {
            return <span className="prog-conductor-cell">{nombre}</span>
          }
          return <span className="prog-sin-conductor">Sin asignar</span>
        }

        // Si es TURNO con nuevo sistema dual
        if (conductor_diurno_nombre || conductor_nocturno_nombre) {
          return (
            <div className="prog-conductores-compact">
              <span className={conductor_diurno_nombre ? 'prog-conductor-turno prog-turno-diurno' : 'prog-turno-vacante prog-turno-diurno'}>
                <span className="prog-turno-label prog-label-diurno">D</span>
                {conductor_diurno_nombre || 'Vacante'}
              </span>
              <span className={conductor_nocturno_nombre ? 'prog-conductor-turno prog-turno-nocturno' : 'prog-turno-vacante prog-turno-nocturno'}>
                <span className="prog-turno-label prog-label-nocturno">N</span>
                {conductor_nocturno_nombre || 'Vacante'}
              </span>
            </div>
          )
        }

        // Fallback: sistema legacy con un solo conductor y turno
        const nombre = conductor_display || conductor_nombre
        if (nombre && turno) {
          const isDiurno = turno === 'diurno'
          return (
            <div className="prog-conductores-compact">
              <span className={isDiurno ? 'prog-conductor-turno prog-turno-diurno' : 'prog-turno-vacante prog-turno-diurno'}>
                <span className="prog-turno-label prog-label-diurno">D</span>
                {isDiurno ? nombre : 'Vacante'}
              </span>
              <span className={!isDiurno ? 'prog-conductor-turno prog-turno-nocturno' : 'prog-turno-vacante prog-turno-nocturno'}>
                <span className="prog-turno-label prog-label-nocturno">N</span>
                {!isDiurno ? nombre : 'Vacante'}
              </span>
            </div>
          )
        }

        return <span className="prog-sin-conductor">Sin asignar</span>
      }
    },
    {
      id: 'tipo_persona',
      header: 'Tip. Persona',
      // Valor para buscar y filtrar: alcanza con que UN slot sea lead para que
      // la programacion cuente como "Lead", que es como se la busca en la
      // practica ("cuales tienen un lead sin convertir").
      accessorFn: (row) => {
        const esCargo = row.modalidad === 'a_cargo' || !row.modalidad
        const tipos = esCargo
          ? [tipoPersonaSlot(row.lead_cargo_id, row.conductor_id, row.conductor_nombre || row.conductor_display)]
          : [
              tipoPersonaSlot(row.lead_diurno_id, row.conductor_diurno_id, row.conductor_diurno_nombre),
              tipoPersonaSlot(row.lead_nocturno_id, row.conductor_nocturno_id, row.conductor_nocturno_nombre),
            ]
        if (tipos.includes('lead')) return 'Lead'
        if (tipos.includes('conductor')) return 'Conductor'
        return '-'
      },
      cell: ({ row }) => {
        const prog = row.original
        const esCargo = prog.modalidad === 'a_cargo' || !prog.modalidad

        if (esCargo) {
          const tipo = tipoPersonaSlot(
            prog.lead_cargo_id,
            prog.conductor_id,
            prog.conductor_nombre || prog.conductor_display
          )
          return tipo ? <ChipTipoPersona tipo={tipo} /> : <span className="prog-sin-conductor">-</span>
        }

        const diurno = tipoPersonaSlot(prog.lead_diurno_id, prog.conductor_diurno_id, prog.conductor_diurno_nombre)
        const nocturno = tipoPersonaSlot(prog.lead_nocturno_id, prog.conductor_nocturno_id, prog.conductor_nocturno_nombre)

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span className="prog-turno-label prog-label-diurno">D</span>
              {diurno ? <ChipTipoPersona tipo={diurno} /> : <span className="prog-sin-conductor">-</span>}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span className="prog-turno-label prog-label-nocturno">N</span>
              {nocturno ? <ChipTipoPersona tipo={nocturno} /> : <span className="prog-sin-conductor">-</span>}
            </span>
          </div>
        )
      }
    },
    {
      accessorKey: 'tipo_asignacion',
      header: 'Tipo Asig.',
      cell: ({ row }) => {
        const prog = row.original

        // Para TURNO: mostrar 2 selects (diurno y nocturno)
        if (prog.modalidad === 'turno') {
          const tipoD = prog.tipo_asignacion_diurno || prog.tipo_asignacion || ''
          const tipoN = prog.tipo_asignacion_nocturno || prog.tipo_asignacion || ''

          return (
            <div className="prog-tipo-asig-turno">
              <div className="prog-tipo-asig-row">
                <span className="prog-tipo-asig-label">D:</span>
                <select
                  className={`prog-inline-select-mini tipo-asignacion ${tipoD}`}
                  value={tipoD}
                  onChange={(e) => handleTipoAsignacionChange(prog.id, 'tipo_asignacion_diurno', 'documento_diurno', e.target.value)}
                  title="Tipo asignación conductor diurno"
                >
                  <option value="">-</option>
                  <option value="entrega_auto">Entrega auto</option>
                  <option value="asignacion_companero">Asig. compañero</option>
                  <option value="cambio_auto">Cambio auto</option>
                  <option value="cambio_turno">Cambio turno</option>
                  <option value="devolucion_vehiculo">Devolución</option>
                </select>
              </div>
              <div className="prog-tipo-asig-row">
                <span className="prog-tipo-asig-label">N:</span>
                <select
                  className={`prog-inline-select-mini tipo-asignacion ${tipoN}`}
                  value={tipoN}
                  onChange={(e) => handleTipoAsignacionChange(prog.id, 'tipo_asignacion_nocturno', 'documento_nocturno', e.target.value)}
                  title="Tipo asignación conductor nocturno"
                >
                  <option value="">-</option>
                  <option value="entrega_auto">Entrega auto</option>
                  <option value="asignacion_companero">Asig. compañero</option>
                  <option value="cambio_auto">Cambio auto</option>
                  <option value="cambio_turno">Cambio turno</option>
                  <option value="devolucion_vehiculo">Devolución</option>
                </select>
              </div>
            </div>
          )
        }

        // Para A CARGO: un solo select
        return (
          <select
            className={`prog-inline-select tipo-asignacion ${prog.tipo_asignacion || ''}`}
            value={prog.tipo_asignacion || ''}
            onChange={(e) => handleTipoAsignacionChange(prog.id, 'tipo_asignacion', 'tipo_documento', e.target.value)}
            title="Tipo de asignación"
          >
            <option value="">Sin definir</option>
            <option value="entrega_auto">Entrega de auto</option>
            <option value="asignacion_companero">Asignación compañero</option>
            <option value="cambio_auto">Cambio de auto</option>
            <option value="cambio_turno">Cambio de turno</option>
            <option value="devolucion_vehiculo">Devolución vehículo</option>
          </select>
        )
      }
    },
    {
      accessorKey: 'modalidad',
      header: 'Modalidad',
      cell: ({ row }) => (
        <span className={`prog-modalidad-badge ${row.original.modalidad?.toLowerCase()}`}>
          {row.original.modalidad === 'turno' ? 'Turno' : 'A Cargo'}
        </span>
      )
    },
    {
      accessorKey: 'fecha_cita',
      header: 'Cita',
      cell: ({ row }) => {
        const fecha = row.original.fecha_cita
        const hora = row.original.hora_cita?.substring(0, 5)
        if (!fecha) return <span className="prog-hora">-</span>
        const fechaObj = new Date(fecha + 'T12:00:00')
        const fechaCorta = fechaObj.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
        return (
          <div className="prog-fecha-hora">
            <span className="prog-fecha">{fechaCorta}</span>
            {hora && <span className="prog-hora">{hora}</span>}
          </div>
        )
      }
    },
    {
      id: 'tipo_documento_display',
      header: 'Documento',
      cell: ({ row }) => {
        const prog = row.original

        // Para TURNO: mostrar 2 selects (diurno y nocturno)
        if (prog.modalidad === 'turno') {
          const docDiurno = prog.documento_diurno || ''
          const docNocturno = prog.documento_nocturno || ''

          return (
            <div className="prog-documento-turno">
              <div className="prog-documento-row">
                <span className="prog-documento-label">D:</span>
                <select
                  className={`prog-inline-select-mini documento ${docDiurno || 'sin_definir'}`}
                  value={docDiurno}
                  onChange={(e) => handleUpdateField(prog.id, 'documento_diurno', e.target.value || null)}
                  title="Documento conductor diurno"
                >
                  <option value="">-</option>
                  <option value="carta_oferta">Carta Oferta</option>
                  <option value="anexo">Anexo</option>
                  <option value="na">N/A</option>
                </select>
              </div>
              <div className="prog-documento-row">
                <span className="prog-documento-label">N:</span>
                <select
                  className={`prog-inline-select-mini documento ${docNocturno || 'sin_definir'}`}
                  value={docNocturno}
                  onChange={(e) => handleUpdateField(prog.id, 'documento_nocturno', e.target.value || null)}
                  title="Documento conductor nocturno"
                >
                  <option value="">-</option>
                  <option value="carta_oferta">Carta Oferta</option>
                  <option value="anexo">Anexo</option>
                  <option value="na">N/A</option>
                </select>
              </div>
            </div>
          )
        }

        // Para A CARGO: un solo select
        return (
          <select
            className={`prog-inline-select documento ${prog.tipo_documento || 'sin_definir'}`}
            value={prog.tipo_documento || ''}
            onChange={(e) => handleUpdateField(prog.id, 'tipo_documento', e.target.value || null)}
            title="Tipo de documento"
          >
            <option value="">Sin definir</option>
            <option value="carta_oferta">Carta Oferta</option>
            <option value="anexo">Anexo</option>
            <option value="na">N/A</option>
          </select>
        )
      }
    },
    // Columnas de gestión diaria
    // NOTA: Se ocultaron las columnas DOC, WPP, CITADO por solicitud del usuario
    {
      accessorKey: 'confirmacion_asistencia',
      header: 'Confirmación',
      cell: ({ row }) => {
        const prog = row.original

        // Para TURNO: mostrar 2 selects (diurno y nocturno)
        if (prog.modalidad === 'turno') {
          const confD = prog.confirmacion_diurno || 'sin_confirmar'
          const confN = prog.confirmacion_nocturno || 'sin_confirmar'

          return (
            <div className="prog-confirmacion-turno">
              <div className="prog-confirmacion-row">
                <span className="prog-confirmacion-label">D:</span>
                <select
                  className={`prog-inline-select-mini confirmacion ${confD}`}
                  value={confD}
                  onChange={(e) => handleUpdateField(prog.id, 'confirmacion_diurno', e.target.value)}
                  title="Confirmación conductor diurno"
                >
                  <option value="sin_confirmar">Sin confirmar</option>
                  <option value="confirmo">Confirmó</option>
                  <option value="no_confirmo">No confirmó</option>
                  <option value="reprogramar">Reprogramar</option>
                </select>
              </div>
              <div className="prog-confirmacion-row">
                <span className="prog-confirmacion-label">N:</span>
                <select
                  className={`prog-inline-select-mini confirmacion ${confN}`}
                  value={confN}
                  onChange={(e) => handleUpdateField(prog.id, 'confirmacion_nocturno', e.target.value)}
                  title="Confirmación conductor nocturno"
                >
                  <option value="sin_confirmar">Sin confirmar</option>
                  <option value="confirmo">Confirmó</option>
                  <option value="no_confirmo">No confirmó</option>
                  <option value="reprogramar">Reprogramar</option>
                </select>
              </div>
            </div>
          )
        }

        // Para A CARGO: un solo select
        return (
          <select
            className={`prog-inline-select confirmacion ${prog.confirmacion_diurno || 'sin_confirmar'}`}
            value={prog.confirmacion_diurno || 'sin_confirmar'}
            onChange={(e) => handleUpdateField(prog.id, 'confirmacion_diurno', e.target.value)}
            title="Confirmación de asistencia"
          >
            <option value="sin_confirmar">Sin confirmar</option>
            <option value="confirmo">Confirmó</option>
            <option value="no_confirmo">No confirmó</option>
            <option value="reprogramar">Reprogramar</option>
          </select>
        )
      }
    },
    {
      accessorKey: 'estado_cabify',
      header: 'Cabify',
      cell: ({ row }) => {
        const prog = row.original

        // Para TURNO: mostrar 2 selects (diurno y nocturno)
        if (prog.modalidad === 'turno') {
          const estadoD = prog.estado_cabify_diurno || 'pendiente'
          const estadoN = prog.estado_cabify_nocturno || 'pendiente'

          return (
            <div className="prog-cabify-turno">
              <div className="prog-cabify-row">
                <span className="prog-cabify-label">D:</span>
                <select
                  className={`prog-inline-select-mini cabify ${estadoD}`}
                  value={estadoD}
                  onChange={(e) => handleUpdateField(prog.id, 'estado_cabify_diurno', e.target.value)}
                  title="Estado Cabify conductor diurno"
                >
                  <option value="pendiente">Pendiente</option>
                  <option value="listo_cabify">Listo Cabify</option>
                  <option value="asignar_auto">Asignar Auto</option>
                  <option value="crear_cuenta">Crear Cuenta</option>
                </select>
              </div>
              <div className="prog-cabify-row">
                <span className="prog-cabify-label">N:</span>
                <select
                  className={`prog-inline-select-mini cabify ${estadoN}`}
                  value={estadoN}
                  onChange={(e) => handleUpdateField(prog.id, 'estado_cabify_nocturno', e.target.value)}
                  title="Estado Cabify conductor nocturno"
                >
                  <option value="pendiente">Pendiente</option>
                  <option value="listo_cabify">Listo Cabify</option>
                  <option value="asignar_auto">Asignar Auto</option>
                  <option value="crear_cuenta">Crear Cuenta</option>
                </select>
              </div>
            </div>
          )
        }

        // Para A CARGO: un solo select
        return (
          <select
            className={`prog-inline-select cabify ${prog.estado_cabify_diurno || 'pendiente'}`}
            value={prog.estado_cabify_diurno || 'pendiente'}
            onChange={(e) => handleUpdateField(prog.id, 'estado_cabify_diurno', e.target.value)}
            title="Estado Cabify"
          >
            <option value="pendiente">Pendiente</option>
            <option value="listo_cabify">Listo Cabify</option>
            <option value="asignar_auto">Asignar Auto</option>
            <option value="crear_cuenta">Crear Cuenta</option>
          </select>
        )
      }
    },
    {
      id: 'acciones',
      header: 'Acciones',
      cell: ({ row }) => (
        <div className="prog-actions">
          <button
            className="prog-btn prog-btn-view"
            title="Ver detalles"
            onClick={() => handleOpenPreview(row.original)}
          >
            <Eye size={16} />
          </button>
          <button
            className="prog-btn prog-btn-send"
            title={(row.original.asignacion_id || row.original.fecha_asignacion_creada) ? 'Ya enviado' : 'Enviar a Entrega'}
            onClick={() => handleEnviarAEntrega(row.original)}
            disabled={!!(row.original.asignacion_id || row.original.fecha_asignacion_creada)}
          >
            <Send size={16} />
          </button>
          <button
            className="prog-btn prog-btn-copy"
            title="Generar mensaje WhatsApp"
            onClick={() => handleCopiarMensaje(row.original)}
          >
            <MessageSquareText size={16} />
          </button>
          <button
            className="prog-btn prog-btn-edit"
            title="Editar"
            onClick={() => handleEdit(row.original)}
            disabled={!!row.original.asignacion_id}
          >
            <Pencil size={16} />
          </button>
          <button
            className="prog-btn prog-btn-delete"
            title={row.original.asignacion_id ? 'Eliminar (ya enviada a Entrega)' : 'Eliminar'}
            onClick={() => handleDelete(row.original.id, !!row.original.asignacion_id)}
          >
            <Trash2 size={16} />
          </button>
        </div>
      )
    }
  ], [canCreate, canEdit, canDelete])

  // Columnas para Enviados (igual que pendientes pero solo botón Ver)
  const enviadosColumns = useMemo<ColumnDef<ProgramacionOnboardingCompleta, any>[]>(() => [
    {
      accessorKey: 'vehiculo_entregar_patente',
      header: 'Vehiculo',
      cell: ({ row }) => (
        <div className="prog-vehiculo-cell">
          <span className="prog-patente" style={{ fontSize: '13px' }}>
            {row.original.vehiculo_entregar_patente || row.original.vehiculo_entregar_patente_sistema || '-'}
          </span>
          <span className="prog-modelo" style={{ fontSize: '11px' }}>
            {row.original.vehiculo_entregar_modelo || row.original.vehiculo_entregar_modelo_sistema || ''}
          </span>
        </div>
      )
    },
    {
      id: 'programados',
      header: 'Programados',
      accessorFn: (row) => {
        if (row.modalidad === 'a_cargo' || !row.modalidad) {
          return row.conductor_display || row.conductor_nombre || row.conductor_diurno_nombre || ''
        }
        const d = row.conductor_diurno_nombre || row.conductor_nombre || ''
        const n = row.conductor_nocturno_nombre || ''
        return `${d} ${n}`.trim()
      },
      cell: ({ row }) => {
        const { modalidad, conductor_diurno_nombre, conductor_nocturno_nombre, conductor_display, conductor_nombre, turno } = row.original

        if (modalidad === 'a_cargo' || !modalidad) {
          const nombre = conductor_display || conductor_nombre || conductor_diurno_nombre
          if (nombre) {
            return <span className="prog-conductor-cell" style={{ fontSize: '13px' }}>{nombre}</span>
          }
          return <span className="prog-sin-conductor">Sin asignar</span>
        }

        if (conductor_diurno_nombre || conductor_nocturno_nombre) {
          return (
            <div className="prog-conductores-compact" style={{ fontSize: '13px' }}>
              <span className={conductor_diurno_nombre ? 'prog-conductor-turno prog-turno-diurno' : 'prog-turno-vacante prog-turno-diurno'}>
                <span className="prog-turno-label prog-label-diurno">D</span>
                {conductor_diurno_nombre || 'Vacante'}
              </span>
              <span className={conductor_nocturno_nombre ? 'prog-conductor-turno prog-turno-nocturno' : 'prog-turno-vacante prog-turno-nocturno'}>
                <span className="prog-turno-label prog-label-nocturno">N</span>
                {conductor_nocturno_nombre || 'Vacante'}
              </span>
            </div>
          )
        }

        const nombre = conductor_display || conductor_nombre
        if (nombre && turno) {
          const isDiurno = turno === 'diurno'
          return (
            <div className="prog-conductores-compact" style={{ fontSize: '13px' }}>
              <span className={isDiurno ? 'prog-conductor-turno prog-turno-diurno' : 'prog-turno-vacante prog-turno-diurno'}>
                <span className="prog-turno-label prog-label-diurno">D</span>
                {isDiurno ? nombre : 'Vacante'}
              </span>
              <span className={!isDiurno ? 'prog-conductor-turno prog-turno-nocturno' : 'prog-turno-vacante prog-turno-nocturno'}>
                <span className="prog-turno-label prog-label-nocturno">N</span>
                {!isDiurno ? nombre : 'Vacante'}
              </span>
            </div>
          )
        }

        return <span className="prog-sin-conductor">Sin asignar</span>
      }
    },
    {
      id: 'tipo_persona',
      header: 'Tip. Persona',
      // Valor para buscar y filtrar: alcanza con que UN slot sea lead para que
      // la programacion cuente como "Lead", que es como se la busca en la
      // practica ("cuales tienen un lead sin convertir").
      accessorFn: (row) => {
        const esCargo = row.modalidad === 'a_cargo' || !row.modalidad
        const tipos = esCargo
          ? [tipoPersonaSlot(row.lead_cargo_id, row.conductor_id, row.conductor_nombre || row.conductor_display)]
          : [
              tipoPersonaSlot(row.lead_diurno_id, row.conductor_diurno_id, row.conductor_diurno_nombre),
              tipoPersonaSlot(row.lead_nocturno_id, row.conductor_nocturno_id, row.conductor_nocturno_nombre),
            ]
        if (tipos.includes('lead')) return 'Lead'
        if (tipos.includes('conductor')) return 'Conductor'
        return '-'
      },
      cell: ({ row }) => {
        const prog = row.original
        const esCargo = prog.modalidad === 'a_cargo' || !prog.modalidad

        if (esCargo) {
          const tipo = tipoPersonaSlot(
            prog.lead_cargo_id,
            prog.conductor_id,
            prog.conductor_nombre || prog.conductor_display
          )
          return tipo ? <ChipTipoPersona tipo={tipo} /> : <span className="prog-sin-conductor">-</span>
        }

        const diurno = tipoPersonaSlot(prog.lead_diurno_id, prog.conductor_diurno_id, prog.conductor_diurno_nombre)
        const nocturno = tipoPersonaSlot(prog.lead_nocturno_id, prog.conductor_nocturno_id, prog.conductor_nocturno_nombre)

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span className="prog-turno-label prog-label-diurno">D</span>
              {diurno ? <ChipTipoPersona tipo={diurno} /> : <span className="prog-sin-conductor">-</span>}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span className="prog-turno-label prog-label-nocturno">N</span>
              {nocturno ? <ChipTipoPersona tipo={nocturno} /> : <span className="prog-sin-conductor">-</span>}
            </span>
          </div>
        )
      }
    },
    {
      accessorKey: 'tipo_asignacion',
      header: 'Tipo Asig.',
      cell: ({ row }) => {
        const prog = row.original

        const tipoLabelsShort: Record<string, string> = {
          entrega_auto: 'Entrega aut.',
          asignacion_companero: 'Asig. comp.',
          cambio_auto: 'Cambio aut.',
          cambio_turno: 'Cambio turno',
          devolucion_vehiculo: 'Devolución',
          asignacion_auto_cargo: 'Asig. cargo',
          entrega_auto_cargo: 'Entrega cargo'
        }

        if (prog.modalidad === 'turno') {
          const tieneDiurno = !!(prog.conductor_diurno_id || prog.conductor_diurno_nombre)
          const tieneNocturno = !!(prog.conductor_nocturno_id || prog.conductor_nocturno_nombre)
          const tipoD = tieneDiurno ? (prog.tipo_asignacion_diurno || prog.tipo_asignacion || '') : ''
          const tipoN = tieneNocturno ? (prog.tipo_asignacion_nocturno || prog.tipo_asignacion || '') : ''

          return (
            <div className="prog-tipo-asig-turno">
              <div className="prog-tipo-asig-row">
                <span className="prog-tipo-asig-label">D:</span>
                <span className={`prog-inline-select-mini tipo-asignacion ${tipoD}`} style={{ cursor: 'default', border: 'none' }}>
                  {tipoD ? (tipoLabelsShort[tipoD] || tipoD) : '-'}
                </span>
              </div>
              <div className="prog-tipo-asig-row">
                <span className="prog-tipo-asig-label">N:</span>
                <span className={`prog-inline-select-mini tipo-asignacion ${tipoN}`} style={{ cursor: 'default', border: 'none' }}>
                  {tipoN ? (tipoLabelsShort[tipoN] || tipoN) : '-'}
                </span>
              </div>
            </div>
          )
        }

        const tipo = prog.tipo_asignacion || ''

        return (
          <span className={`prog-inline-select tipo-asignacion ${tipo}`} style={{ cursor: 'default', border: 'none' }}>
            {tipoLabelsShort[tipo] || tipo || '-'}
          </span>
        )
      }
    },
    {
      accessorKey: 'modalidad',
      header: 'Modalidad',
      cell: ({ row }) => (
        <span className={`prog-modalidad-badge ${row.original.modalidad?.toLowerCase()}`} style={{ fontSize: '12px' }}>
          {row.original.modalidad === 'turno' ? 'Turno' : 'A Cargo'}
        </span>
      )
    },
    {
      accessorKey: 'fecha_cita',
      header: 'Cita',
      cell: ({ row }) => {
        const fecha = row.original.fecha_cita
        const hora = row.original.hora_cita?.substring(0, 5)
        if (!fecha) return <span className="prog-hora">-</span>
        const fechaObj = new Date(fecha + 'T12:00:00')
        const fechaCorta = fechaObj.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
        return (
          <div className="prog-fecha-hora" style={{ fontSize: '13px' }}>
            <span className="prog-fecha">{fechaCorta}</span>
            {hora && <span className="prog-hora">{hora}</span>}
          </div>
        )
      }
    },
    {
      id: 'tipo_documento_display',
      header: 'Documento',
      cell: ({ row }) => {
        const prog = row.original

        const docLabels: Record<string, string> = {
          carta_oferta: 'Carta Ofert.',
          anexo: 'Anexo',
          na: 'N/A',
          contrato: 'Carta Oferta'
        }

        if (prog.modalidad === 'turno') {
          const docDiurno = prog.documento_diurno || ''
          const docNocturno = prog.documento_nocturno || ''

          return (
            <div className="prog-documento-turno">
              <div className="prog-documento-row">
                <span className="prog-documento-label">D:</span>
                <span className={`prog-inline-select-mini documento ${docDiurno || 'sin_definir'}`} style={{ cursor: 'default', border: 'none' }}>
                  {docLabels[docDiurno] || docDiurno || '-'}
                </span>
              </div>
              <div className="prog-documento-row">
                <span className="prog-documento-label">N:</span>
                <span className={`prog-inline-select-mini documento ${docNocturno || 'sin_definir'}`} style={{ cursor: 'default', border: 'none' }}>
                  {docLabels[docNocturno] || docNocturno || '-'}
                </span>
              </div>
            </div>
          )
        }

        const doc = prog.tipo_documento || ''

        return (
          <span className={`prog-inline-select documento ${doc || 'sin_definir'}`} style={{ cursor: 'default', border: 'none' }}>
            {docLabels[doc] || doc || '-'}
          </span>
        )
      }
    },
    {
      accessorKey: 'confirmacion_asistencia',
      header: 'Confirmación',
      cell: ({ row }) => {
        const prog = row.original

        const confLabels: Record<string, { label: string; color: string }> = {
          confirmo: { label: 'Confirmó', color: '#10B981' },
          no_confirmo: { label: 'No confirmó', color: '#EF4444' },
          reprogramar: { label: 'Reprogramar', color: '#F59E0B' },
          sin_confirmar: { label: 'Sin confirmar', color: '#9CA3AF' }
        }

        // Para TURNO: mostrar ambas confirmaciones
        if (prog.modalidad === 'turno') {
          const confD = prog.confirmacion_diurno || 'sin_confirmar'
          const confN = prog.confirmacion_nocturno || 'sin_confirmar'
          const confDInfo = confLabels[confD] || confLabels.sin_confirmar
          const confNInfo = confLabels[confN] || confLabels.sin_confirmar

          return (
            <div className="prog-confirmacion-turno">
              <div className="prog-confirmacion-row">
                <span className="prog-confirmacion-label">D:</span>
                <span style={{ color: confDInfo.color, fontSize: '12px' }}>{confDInfo.label}</span>
              </div>
              <div className="prog-confirmacion-row">
                <span className="prog-confirmacion-label">N:</span>
                <span style={{ color: confNInfo.color, fontSize: '12px' }}>{confNInfo.label}</span>
              </div>
            </div>
          )
        }

        // Para A CARGO: un solo valor
        const conf = prog.confirmacion_diurno || 'sin_confirmar'
        const confInfo = confLabels[conf] || confLabels.sin_confirmar

        return (
          <span style={{ color: confInfo.color, fontSize: '12px' }}>{confInfo.label}</span>
        )
      }
    },
    {
      id: 'acciones',
      header: 'Acciones',
      cell: ({ row }) => (
        <div className="prog-actions">
          <button
            className="prog-btn prog-btn-view"
            title="Ver detalles"
            onClick={() => handleOpenPreview(row.original)}
          >
            <Eye size={18} />
          </button>
        </div>
      )
    }
  ], [])

  // Stats cards ocultas temporalmente - mostrar todas las programaciones
  const filteredData = programaciones

  return (
    <div className="prog-module">
      {/* Loading Overlay - bloquea toda la pantalla */}
      <LoadingOverlay show={loading} message="Cargando programaciones..." size="lg" />
      {/* Envio a Asignaciones: tapa la pantalla hasta que vuelve la respuesta,
          para que no se toque el boton dos veces mientras se crean la
          asignacion y los documentos. */}
      <LoadingOverlay
        show={enviandoEntrega}
        message="Creando asignación y generando documentos…"
        submessage="Espere la respuesta de confirmación"
        size="lg"
      />

      {/* Stats Cards - Ocultos temporalmente
      <div className="prog-stats">
        <div className="prog-stats-grid">
          <div 
            className={`stat-card stat-card-clickable ${activeFilter === 'por_agendar' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatClick('por_agendar')}
          >
            <ClipboardList size={20} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.porAgendar}</span>
              <span className="stat-label">Por Agendar</span>
            </div>
          </div>
          <div 
            className={`stat-card stat-card-clickable ${activeFilter === 'agendados' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatClick('agendados')}
          >
            <Calendar size={20} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.agendados}</span>
              <span className="stat-label">Agendados</span>
            </div>
          </div>
          <div 
            className={`stat-card stat-card-clickable ${activeFilter === 'completados' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatClick('completados')}
          >
            <CheckCircle size={20} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.enviadas}</span>
              <span className="stat-label">Enviadas</span>
            </div>
          </div>
          <div 
            className={`stat-card stat-card-clickable ${activeFilter === 'cond_nuevos' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatClick('cond_nuevos')}
          >
            <UserPlus size={20} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.condNuevos}</span>
              <span className="stat-label">Cond. Nuevos</span>
            </div>
          </div>
          <div 
            className={`stat-card stat-card-clickable ${activeFilter === 'cond_anexo' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatClick('cond_anexo')}
          >
            <FileText size={20} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.condAnexo}</span>
              <span className="stat-label">Cond. Anexo</span>
            </div>
          </div>
        </div>
      </div>
      */}

      {/* Tabs - controlados por permisos de tab */}
      <div className="prog-tabs">
        {canViewTab('programacion:pendientes') && (
          <button
            className={`prog-tab ${activeTab === 'pendientes' ? 'active' : ''}`}
            onClick={() => setActiveTab('pendientes')}
          >
            <Calendar size={14} />
            Pendientes
            <span className="prog-tab-contador">
              {programaciones.length}
            </span>
          </button>
        )}
        {canViewTab('programacion:historico') && (
          <button
            className={`prog-tab ${activeTab === 'historico' ? 'active' : ''}`}
            onClick={() => setActiveTab('historico')}
          >
            <Send size={14} />
            Enviados
            {programacionesHistorico.length > 0 && (
              <span className="prog-tab-contador">
                {programacionesHistorico.length}
              </span>
            )}
          </button>
        )}
      </div>

      {/* DataTable - Pendientes */}
      {activeTab === 'pendientes' && (
        <DataTable
          data={filteredData}
          columns={columns}
          loading={loading}
          error={error}
          searchPlaceholder="Buscar por patente, conductor..."
          emptyIcon={<Calendar size={48}
        />}
          emptyTitle="No hay programaciones"
          emptyDescription={canCreate ? "Crea una nueva programacion para comenzar" : "No tienes programaciones asignadas"}
          pageSize={100}
          pageSizeOptions={[10, 20, 50, 100]}
          headerAction={(
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="btn-secondary"
                onClick={() => loadProgramaciones()}
                title="Recargar datos"
                disabled={loading}
              >
                <RefreshCw size={16} className={loading ? 'spin' : ''} />
              </button>
              <button className="btn-primary" onClick={handleCreate}>
                <Plus size={16} />
                Nueva Programación
              </button>
            </div>
          )}
        />
      )}

      {/* DataTable - Enviados */}
      {activeTab === 'historico' && (
        <DataTable
          data={programacionesHistorico}
          columns={enviadosColumns}
          loading={loadingHistorico}
          searchPlaceholder="Buscar en enviados..."
          emptyIcon={<Send size={48}
        />}
          emptyTitle="No hay programaciones enviadas"
          emptyDescription="Las programaciones enviadas a Entrega aparecerán aquí"
          pageSize={100}
          pageSizeOptions={[10, 20, 50, 100]}
        />
      )}

      {/* Wizard Modal para CREAR (nuevo diseño visual) */}
      {showCreateWizard && (
        <ProgramacionAssignmentWizardV2
          precarga={precargaPar}
          onClose={() => { setShowCreateWizard(false); setPrecargaPar(null) }}
          onSuccess={() => {
            loadProgramaciones()
            setShowCreateWizard(false)
            setPrecargaPar(null)
          }}
        />
      )}

      {/* Aviso previo: cuantos leads hay que convertir */}
      {avisoLeads && !conversionLead && (
        <AvisoLeadsPendientes
          pendientes={avisoLeads.pendientes}
          onCancelar={() => setAvisoLeads(null)}
          onElegir={(pendiente) => {
            // El aviso NO se limpia: queda debajo para que "Atrás" pueda
            // volver a el sin rearmar la lista.
            setConversionLead({ prog: avisoLeads.prog, ...pendiente })
          }}
        />
      )}

      {/* Conversion de un lead, disparada al enviar a entrega */}
      {conversionLead && (
        <ConvertirLeadModal
          leadId={conversionLead.leadId}
          turnoLabel={conversionLead.label}
          usuario={profile?.full_name || 'Sistema'}
          sedeFallbackId={conversionLead.prog.sede_id || sedeActualId || sedeUsuario?.id}
          onCancel={() => {
            setConversionLead(null)
            setAvisoLeads(null)
          }}
          onVolver={() => setConversionLead(null)}
          onConvertido={async (conductorId, nombreConductor, esFusion) => {
            const pendiente = conversionLead
            // Se desmontan los modales ANTES de cualquier Swal: mientras estan
            // montados (z-index 10001) tapan a SweetAlert2 (1060) y el dialogo
            // queda invisible esperando un click imposible.
            setConversionLead(null)
            setAvisoLeads(null)
            try {
              // El nombre y el DNI se releen del CONDUCTOR, no se copian del
              // lead. Dos razones:
              //
              //  1. `conductores` guarda el nombre en MAYUSCULA (ver
              //     conversionLeadAConductor), asi que copiar el del lead
              //     dejaria la fila escrita distinto al resto de la tabla.
              //  2. En una FUSION el conductor ya existia: el nombre bueno es
              //     el suyo, no el que venia cargado en el lead.
              //
              // Si la lectura falla se usa el del lead en mayuscula, que es lo
              // mas parecido a lo correcto.
              let nombreFinal = (nombreConductor || '').toUpperCase()
              let dniFinal: string | null = null
              try {
                const { data: conductorDB } = await (supabase.from('conductores') as any)
                  .select('nombres, apellidos, numero_dni')
                  .eq('id', conductorId)
                  .single()
                if (conductorDB) {
                  const real = `${conductorDB.nombres || ''} ${conductorDB.apellidos || ''}`.trim()
                  if (real) nombreFinal = real
                  dniFinal = conductorDB.numero_dni || null
                }
              } catch {
                // se conserva el fallback
              }

              // Repuntar la programacion: el turno pasa a tener un conductor
              // real y deja de tener lead. Sin esto la columna "Tip. Persona"
              // seguiria diciendo Lead y el envio volveria a frenarse.
              const campos: Record<string, unknown> =
                pendiente.slot === 'diurno'
                  ? {
                      conductor_diurno_id: conductorId,
                      conductor_diurno_nombre: nombreFinal,
                      conductor_diurno_dni: dniFinal,
                      lead_diurno_id: null,
                    }
                  : pendiente.slot === 'nocturno'
                    ? {
                        conductor_nocturno_id: conductorId,
                        conductor_nocturno_nombre: nombreFinal,
                        conductor_nocturno_dni: dniFinal,
                        lead_nocturno_id: null,
                      }
                    : {
                        conductor_id: conductorId,
                        conductor_nombre: nombreFinal,
                        conductor_dni: dniFinal,
                        lead_cargo_id: null,
                      }

              const { error: errProg } = await (supabase.from('programaciones_onboarding') as any)
                .update(campos)
                .eq('id', pendiente.prog.id)
              if (errProg) throw errProg

              await loadProgramaciones()

              // Se relee la fila desde la BD: el `prog` que teniamos en memoria
              // todavia dice que el turno es un lead. Si quedan mas leads, el
              // propio handleEnviarAEntrega vuelve a abrir el modal.
              const { data: progActualizada } = await supabase
                .from('v_programaciones_onboarding')
                .select('*')
                .eq('id', pendiente.prog.id)
                .single()

              await Swal.fire({
                icon: 'success',
                title: esFusion ? 'Fusionado con un conductor existente' : 'Convertido a conductor',
                text: esFusion
                  ? `Ya existía un conductor con ese documento: se completaron sus campos vacíos y el turno ${pendiente.label} apunta a él.`
                  : `${nombreFinal} ya es conductor y el turno ${pendiente.label} apunta a él.`,
                confirmButtonColor: '#16a34a',
              })

              const base = (progActualizada || pendiente.prog) as ProgramacionOnboardingCompleta
              const [conLeads] = await adjuntarLeadIds([base])
              handleEnviarAEntrega(conLeads)
            } catch (e) {
              Swal.fire(
                'Conductor creado, pero no se actualizó la programación',
                e instanceof Error ? e.message : 'Reintentá el envío desde el tablero.',
                'warning'
              )
              loadProgramaciones()
            }
          }}
        />
      )}

      {/* Modal Edicion Rapida */}
      {showQuickEdit && editingProgramacion && (
        <div className="prog-modal-overlay" onClick={handleCloseQuickEdit}>
          <div className="prog-modal prog-modal-wide" onClick={e => e.stopPropagation()}>
            <div className="prog-modal-header">
              <h2>Editar Programacion</h2>
              <button onClick={handleCloseQuickEdit}>
                <XCircle size={20} />
              </button>
            </div>
            <div className="prog-modal-body">
              {/* Vehiculo - Editable con busqueda */}
              <div className="prog-modal-section">
                <h3><Car size={16} /> Vehiculo</h3>
                <div className="prog-searchable-select">
                  <input
                    type="text"
                    value={selectedVehiculo ? `${selectedVehiculo.patente} - ${selectedVehiculo.marca} ${selectedVehiculo.modelo}` : vehiculoSearch}
                    onChange={(e) => {
                      setVehiculoSearch(e.target.value)
                      setQuickEditData(prev => ({ ...prev, vehiculo_id: undefined }))
                    }}
                    onFocus={() => setShowVehiculoDropdown(true)}
                    onBlur={() => setTimeout(() => setShowVehiculoDropdown(false), 200)}
                    placeholder={loadingVehiculos ? 'Cargando vehiculos...' : 'Buscar por patente, marca o modelo...'}
                    className="prog-input"
                    disabled={loadingVehiculos}
                  />
                  {showVehiculoDropdown && !loadingVehiculos && (
                    <div className="prog-searchable-dropdown">
                      {filteredVehiculos.length > 0 ? (
                        filteredVehiculos.map(v => (
                          <div
                            key={v.id}
                            className={`prog-searchable-option ${quickEditData.vehiculo_id === v.id ? 'selected' : ''}`}
                            onClick={() => {
                              setQuickEditData(prev => ({ ...prev, vehiculo_id: v.id }))
                              setVehiculoSearch('')
                              setShowVehiculoDropdown(false)
                            }}
                          >
                            <strong>{v.patente}</strong> - {v.marca} {v.modelo}
                          </div>
                        ))
                      ) : (
                        <div className="prog-searchable-no-results">
                          {vehiculoSearch ? 'No se encontraron vehiculos' : 'Escribe para buscar...'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Modalidad (solo lectura) */}
              <div className="prog-modal-section" style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Modalidad</label>
                    <p style={{ fontWeight: '600', margin: 0 }}>{editingProgramacion.modalidad || '-'}</p>
                  </div>
                </div>
              </div>

              {/* Fecha y Hora */}
              <div className="prog-modal-section">
                <h3><Calendar size={16} /> Cita</h3>
                <div className="prog-modal-grid">
                  <div>
                    <label>Fecha *</label>
                    <input
                      type="date"
                      value={quickEditData.fecha_cita || ''}
                      onChange={e => setQuickEditData(prev => ({ ...prev, fecha_cita: e.target.value }))}
                      className="prog-input"
                    />
                  </div>
                  <div>
                    <label>Hora *</label>
                    <input
                      type="time"
                      value={quickEditData.hora_cita || ''}
                      onChange={e => setQuickEditData(prev => ({ ...prev, hora_cita: e.target.value }))}
                      className="prog-input"
                    />
                  </div>
                </div>
              </div>

              {/* Campos segun modalidad */}
              {editingProgramacion.modalidad === 'turno' ? (
                <>
                  {/* Conductor Diurno */}
                  <div className="prog-modal-section" style={{ background: 'rgba(251, 191, 36, 0.1)', padding: '12px', borderRadius: '8px' }}>
                    <h3 style={{ color: '#FBBF24', margin: '0 0 12px 0', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}><Sun size={16} /> Conductor Diurno</h3>
                    {/* Selector de conductor / lead diurno */}
                    <div style={{ marginBottom: '12px' }}>
                      {renderEncabezadoPersona('diurno')}
                      {tipoPersonaEdicion.diurno === 'lead' ? renderBuscadorLead('diurno') : (
                      <div className="prog-searchable-select">
                        <input
                          type="text"
                          value={selectedConductorDiurno ? selectedConductorDiurno.nombre : conductorDiurnoSearch}
                          onChange={(e) => {
                            setConductorDiurnoSearch(e.target.value)
                            limpiarSlotEdicion('diurno')
                          }}
                          onFocus={() => setShowConductorDiurnoDropdown(true)}
                          onBlur={() => setTimeout(() => setShowConductorDiurnoDropdown(false), 200)}
                          placeholder={placeholderConductorEdicion('diurno')}
                          className="prog-input"
                          disabled={loadingConductores}
                        />
                        {showConductorDiurnoDropdown && !loadingConductores && (
                          <div className="prog-searchable-dropdown">
                            {filteredConductoresDiurno.length > 0 ? (
                              filteredConductoresDiurno.slice(0, 50).map(c => (
                                <div
                                  key={c.id}
                                  className={`prog-searchable-option ${quickEditData.conductor_diurno_id === c.id ? 'selected' : ''}`}
                                  onClick={() => {
                                    // Un conductor reemplaza al lead que hubiera en el turno;
                                    // el tipo de candidato 'lead' deja de valer.
                                    setQuickEditData(prev => ({
                                      ...prev,
                                      conductor_diurno_id: c.id,
                                      conductor_diurno_nombre: c.nombre,
                                      conductor_diurno_dni: c.dni,
                                      lead_diurno_id: null,
                                      ...(prev.lead_diurno_id || prev.tipo_candidato_diurno === ('lead' as any) ? { tipo_candidato_diurno: '' as any } : {}),
                                      ...resetDistanciaSiCambiaPersona(prev, 'diurno', c.id, ''),
                                    }))
                                    setConductorDiurnoSearch('')
                                    setShowConductorDiurnoDropdown(false)
                                  }}
                                >
                                  <strong>{c.nombre}</strong> {c.dni && <span style={{ color: 'var(--text-tertiary)' }}>- DNI: {c.dni}</span>}
                                </div>
                              ))
                            ) : (
                              <div className="prog-searchable-no-results">
                                {conductorDiurnoSearch ? 'No se encontraron conductores' : 'Escribe para buscar...'}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      )}
                    </div>
                    <div className="prog-modal-grid">
                      <div>
                        <label>Tipo Candidato *</label>
                        <select
                          value={quickEditData.lead_diurno_id ? 'lead' : (quickEditData.tipo_candidato_diurno || '')}
                          onChange={e => setQuickEditData(prev => ({ ...prev, tipo_candidato_diurno: e.target.value as any }))}
                          className="prog-input"
                          disabled={!!quickEditData.lead_diurno_id}
                        >
                          <option value="">Seleccionar...</option>
                          {quickEditData.lead_diurno_id && <option value="lead">Lead</option>}
                          <option value="nuevo">Nuevo</option>
                          <option value="antiguo">Antiguo</option>
                          <option value="reingreso">Reingreso</option>
                        </select>
                      </div>
                      <div>
                        <label>Tipo Asignación *</label>
                        <select
                          value={quickEditData.tipo_asignacion_diurno || 'entrega_auto'}
                          onChange={e => {
                            const val = e.target.value as any
                            setQuickEditData(prev => ({ ...prev, tipo_asignacion_diurno: val, ...(val === 'devolucion_vehiculo' ? { documento_diurno: 'na' } : {}) }))
                          }}
                          className="prog-input"
                        >
                          <option value="entrega_auto">Entrega de auto</option>
                          <option value="asignacion_companero">Asignación compañero</option>
                          <option value="cambio_auto">Cambio de auto</option>
                          <option value="cambio_turno">Cambio de turno</option>
                          <option value="devolucion_vehiculo">Devolución vehículo</option>
                        </select>
                      </div>
                      <div>
                        <label>Documento *</label>
                        <select
                          value={quickEditData.documento_diurno || ''}
                          onChange={e => setQuickEditData(prev => ({ ...prev, documento_diurno: e.target.value as any }))}
                          className="prog-input"
                        >
                          <option value="">Seleccionar...</option>
                          <option value="contrato">Carta Oferta</option>
                          <option value="carta_oferta">Carta Oferta</option>
                          <option value="anexo">Anexo</option>
                          <option value="na">N/A</option>
                        </select>
                      </div>
                      <div>
                        <label>Zona *</label>
                        <input
                          type="text"
                          value={quickEditData.zona_diurno || ''}
                          onChange={e => setQuickEditData(prev => ({ ...prev, zona_diurno: e.target.value }))}
                          className="prog-input"
                          placeholder="Ej: Norte, Sur, CABA..."
                        />
                      </div>
                      <div>
                        <label>Distancia (min)</label>
                        <input
                          type="number"
                          value={quickEditData.distancia_diurno || ''}
                          onChange={e => setQuickEditData(prev => ({ ...prev, distancia_diurno: e.target.value ? parseInt(e.target.value) : undefined }))}
                          className="prog-input"
                          placeholder="Minutos"
                        />
                      </div>
                      <div>
                        <label>Tarifa *</label>
                        <select
                          value={quickEditData.tipo_tarifa_diurno || 'antigua'}
                          onChange={e => setQuickEditData(prev => ({ ...prev, tipo_tarifa_diurno: e.target.value as TipoTarifa }))}
                          className="prog-input"
                          title="Esquema de precios del alquiler para este conductor"
                        >
                          <option value="antigua">{getEtiquetaTarifa(conceptosTarifa, 'diurno', gncVehiculoEdicion, 'antigua')}</option>
                          <option value="nueva">{getEtiquetaTarifa(conceptosTarifa, 'diurno', gncVehiculoEdicion, 'nueva')}</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Conductor Nocturno */}
                  <div className="prog-modal-section" style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '12px', borderRadius: '8px', marginTop: '12px' }}>
                    <h3 style={{ color: '#60A5FA', margin: '0 0 12px 0', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}><Moon size={16} /> Conductor Nocturno</h3>
                    {/* Selector de conductor / lead nocturno */}
                    <div style={{ marginBottom: '12px' }}>
                      {renderEncabezadoPersona('nocturno')}
                      {tipoPersonaEdicion.nocturno === 'lead' ? renderBuscadorLead('nocturno') : (
                      <div className="prog-searchable-select">
                        <input
                          type="text"
                          value={selectedConductorNocturno ? selectedConductorNocturno.nombre : conductorNocturnoSearch}
                          onChange={(e) => {
                            setConductorNocturnoSearch(e.target.value)
                            limpiarSlotEdicion('nocturno')
                          }}
                          onFocus={() => setShowConductorNocturnoDropdown(true)}
                          onBlur={() => setTimeout(() => setShowConductorNocturnoDropdown(false), 200)}
                          placeholder={placeholderConductorEdicion('nocturno')}
                          className="prog-input"
                          disabled={loadingConductores}
                        />
                        {showConductorNocturnoDropdown && !loadingConductores && (
                          <div className="prog-searchable-dropdown">
                            {filteredConductoresNocturno.length > 0 ? (
                              filteredConductoresNocturno.slice(0, 50).map(c => (
                                <div
                                  key={c.id}
                                  className={`prog-searchable-option ${quickEditData.conductor_nocturno_id === c.id ? 'selected' : ''}`}
                                  onClick={() => {
                                    setQuickEditData(prev => ({
                                      ...prev,
                                      conductor_nocturno_id: c.id,
                                      conductor_nocturno_nombre: c.nombre,
                                      conductor_nocturno_dni: c.dni,
                                      lead_nocturno_id: null,
                                      ...(prev.lead_nocturno_id || prev.tipo_candidato_nocturno === ('lead' as any) ? { tipo_candidato_nocturno: '' as any } : {}),
                                      ...resetDistanciaSiCambiaPersona(prev, 'nocturno', c.id, ''),
                                    }))
                                    setConductorNocturnoSearch('')
                                    setShowConductorNocturnoDropdown(false)
                                  }}
                                >
                                  <strong>{c.nombre}</strong> {c.dni && <span style={{ color: 'var(--text-tertiary)' }}>- DNI: {c.dni}</span>}
                                </div>
                              ))
                            ) : (
                              <div className="prog-searchable-no-results">
                                {conductorNocturnoSearch ? 'No se encontraron conductores' : 'Escribe para buscar...'}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      )}
                    </div>
                    <div className="prog-modal-grid">
                      <div>
                        <label>Tipo Candidato *</label>
                        <select
                          value={quickEditData.lead_nocturno_id ? 'lead' : (quickEditData.tipo_candidato_nocturno || '')}
                          onChange={e => setQuickEditData(prev => ({ ...prev, tipo_candidato_nocturno: e.target.value as any }))}
                          className="prog-input"
                          disabled={!!quickEditData.lead_nocturno_id}
                        >
                          <option value="">Seleccionar...</option>
                          {quickEditData.lead_nocturno_id && <option value="lead">Lead</option>}
                          <option value="nuevo">Nuevo</option>
                          <option value="antiguo">Antiguo</option>
                          <option value="reingreso">Reingreso</option>
                        </select>
                      </div>
                      <div>
                        <label>Tipo Asignación *</label>
                        <select
                          value={quickEditData.tipo_asignacion_nocturno || 'entrega_auto'}
                          onChange={e => {
                            const val = e.target.value as any
                            setQuickEditData(prev => ({ ...prev, tipo_asignacion_nocturno: val, ...(val === 'devolucion_vehiculo' ? { documento_nocturno: 'na' } : {}) }))
                          }}
                          className="prog-input"
                        >
                          <option value="entrega_auto">Entrega de auto</option>
                          <option value="asignacion_companero">Asignación compañero</option>
                          <option value="cambio_auto">Cambio de auto</option>
                          <option value="cambio_turno">Cambio de turno</option>
                          <option value="devolucion_vehiculo">Devolución vehículo</option>
                        </select>
                      </div>
                      <div>
                        <label>Documento *</label>
                        <select
                          value={quickEditData.documento_nocturno || ''}
                          onChange={e => setQuickEditData(prev => ({ ...prev, documento_nocturno: e.target.value as any }))}
                          className="prog-input"
                        >
                          <option value="">Seleccionar...</option>
                          <option value="contrato">Carta Oferta</option>
                          <option value="carta_oferta">Carta Oferta</option>
                          <option value="anexo">Anexo</option>
                          <option value="na">N/A</option>
                        </select>
                      </div>
                      <div>
                        <label>Zona *</label>
                        <input
                          type="text"
                          value={quickEditData.zona_nocturno || ''}
                          onChange={e => setQuickEditData(prev => ({ ...prev, zona_nocturno: e.target.value }))}
                          className="prog-input"
                          placeholder="Ej: Norte, Sur, CABA..."
                        />
                      </div>
                      <div>
                        <label>Distancia (min)</label>
                        <input
                          type="number"
                          value={quickEditData.distancia_nocturno || ''}
                          onChange={e => setQuickEditData(prev => ({ ...prev, distancia_nocturno: e.target.value ? parseInt(e.target.value) : undefined }))}
                          className="prog-input"
                          placeholder="Minutos"
                          />
                        </div>
                      <div>
                        <label>Tarifa *</label>
                        <select
                          value={quickEditData.tipo_tarifa_nocturno || 'antigua'}
                          onChange={e => setQuickEditData(prev => ({ ...prev, tipo_tarifa_nocturno: e.target.value as TipoTarifa }))}
                          className="prog-input"
                          title="Esquema de precios del alquiler para este conductor"
                        >
                          <option value="antigua">{getEtiquetaTarifa(conceptosTarifa, 'nocturno', gncVehiculoEdicion, 'antigua')}</option>
                          <option value="nueva">{getEtiquetaTarifa(conceptosTarifa, 'nocturno', gncVehiculoEdicion, 'nueva')}</option>
                        </select>
                      </div>
                      </div>
                    </div>
                </>
              ) : (
                /* A Cargo - campos legacy */
                <div className="prog-modal-section" style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: '8px' }}>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '14px' }}><User size={16} /> Conductor</h3>
                  {/* Selector de conductor / lead */}
                  <div style={{ marginBottom: '12px' }}>
                    {renderEncabezadoPersona('cargo')}
                    {tipoPersonaEdicion.cargo === 'lead' ? renderBuscadorLead('cargo') : (
                    <div className="prog-searchable-select">
                      <input
                        type="text"
                        value={selectedConductor ? selectedConductor.nombre : conductorSearch}
                        onChange={(e) => {
                          setConductorSearch(e.target.value)
                          limpiarSlotEdicion('cargo')
                        }}
                        onFocus={() => setShowConductorDropdown(true)}
                        onBlur={() => setTimeout(() => setShowConductorDropdown(false), 200)}
                        placeholder={placeholderConductorEdicion('cargo')}
                        className="prog-input"
                        disabled={loadingConductores}
                      />
                      {showConductorDropdown && !loadingConductores && (
                        <div className="prog-searchable-dropdown">
                          {filteredConductores.length > 0 ? (
                            filteredConductores.slice(0, 50).map(c => (
                              <div
                                key={c.id}
                                className={`prog-searchable-option ${quickEditData.conductor_id === c.id ? 'selected' : ''}`}
                                onClick={() => {
                                  setQuickEditData(prev => ({
                                    ...prev,
                                    conductor_id: c.id,
                                    conductor_nombre: c.nombre,
                                    conductor_dni: c.dni,
                                    lead_cargo_id: null,
                                    ...(prev.lead_cargo_id || prev.tipo_candidato === ('lead' as any) ? { tipo_candidato: '' as any } : {}),
                                  }))
                                  setConductorSearch('')
                                  setShowConductorDropdown(false)
                                }}
                              >
                                <strong>{c.nombre}</strong> {c.dni && <span style={{ color: 'var(--text-tertiary)' }}>- DNI: {c.dni}</span>}
                              </div>
                            ))
                          ) : (
                            <div className="prog-searchable-no-results">
                              {conductorSearch ? 'No se encontraron conductores' : 'Escribe para buscar...'}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    )}
                  </div>
                  <div className="prog-modal-grid">
                    <div>
                      <label>Tipo Candidato *</label>
                      <select
                        value={quickEditData.lead_cargo_id ? 'lead' : (quickEditData.tipo_candidato || '')}
                        onChange={e => setQuickEditData(prev => ({ ...prev, tipo_candidato: e.target.value as any }))}
                        className="prog-input"
                        disabled={!!quickEditData.lead_cargo_id}
                      >
                        <option value="">Seleccionar...</option>
                        {quickEditData.lead_cargo_id && <option value="lead">Lead</option>}
                        <option value="nuevo">Nuevo</option>
                        <option value="antiguo">Antiguo</option>
                        <option value="reingreso">Reingreso</option>
                      </select>
                    </div>
                    <div>
                      <label>Documento *</label>
                      <select
                        value={quickEditData.tipo_documento || ''}
                        onChange={e => setQuickEditData(prev => ({ ...prev, tipo_documento: e.target.value as any }))}
                        className="prog-input"
                      >
                        <option value="">Seleccionar...</option>
                        <option value="contrato">Carta Oferta</option>
                        <option value="carta_oferta">Carta Oferta</option>
                        <option value="anexo">Anexo</option>
                        <option value="na">N/A</option>
                      </select>
                    </div>
                    <div>
                      <label>Zona *</label>
                      <input
                        type="text"
                        value={quickEditData.zona || ''}
                        onChange={e => setQuickEditData(prev => ({ ...prev, zona: e.target.value as any }))}
                        className="prog-input"
                        placeholder="Ej: Norte, Sur, CABA..."
                      />
                    </div>
                    <div>
                      <label>Distancia (min)</label>
                      <input
                        type="number"
                        value={quickEditData.distancia_minutos || ''}
                        onChange={e => setQuickEditData(prev => ({ ...prev, distancia_minutos: e.target.value ? parseInt(e.target.value) : undefined }))}
                        className="prog-input"
                        placeholder="Minutos"
                      />
                    </div>
                    <div>
                      <label>Tarifa *</label>
                      <select
                        value={quickEditData.tipo_tarifa || 'antigua'}
                        onChange={e => setQuickEditData(prev => ({ ...prev, tipo_tarifa: e.target.value as TipoTarifa }))}
                        className="prog-input"
                        title="Esquema de precios del alquiler para este conductor"
                      >
                        <option value="antigua">{getEtiquetaTarifa(conceptosTarifa, 'cargo', gncVehiculoEdicion, 'antigua')}</option>
                        <option value="nueva">{getEtiquetaTarifa(conceptosTarifa, 'cargo', gncVehiculoEdicion, 'nueva')}</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Observaciones */}
              <div className="prog-modal-section" style={{ marginTop: '12px' }}>
                <h3><FileText size={16} /> Observaciones</h3>
                <textarea
                  value={quickEditData.observaciones || ''}
                  onChange={e => setQuickEditData(prev => ({ ...prev, observaciones: e.target.value }))}
                  className="prog-input"
                  rows={3}
                  placeholder="Notas adicionales..."
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </div>
            </div>
            <div className="prog-modal-footer">
              <button
                className="prog-btn prog-btn-secondary"
                onClick={handleCloseQuickEdit}
              >
                Cancelar
              </button>
              <button
                className="prog-btn prog-btn-primary"
                onClick={handleSaveQuickEdit}
                disabled={savingQuickEdit}
              >
                {savingQuickEdit ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewProgramacion && (
        <div className="prog-modal-overlay" onClick={handleClosePreview}>
          <div className="prog-modal" onClick={e => e.stopPropagation()}>
            <div className="prog-modal-header">
              <h2>Detalle de Programacion</h2>
              <button onClick={handleClosePreview}>
                <XCircle size={20} />
              </button>
            </div>
            <div className="prog-modal-body">
              {/* Vehiculo */}
              <div className="prog-modal-section">
                <h3><Car size={16} /> Vehiculo</h3>
                {(previewProgramacion as any).cambio_vehiculo && (previewProgramacion as any).vehiculo_cambio_patente ? (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0' }}>
                      <div style={{ flex: 1, padding: '10px 14px', background: 'rgba(251, 191, 36, 0.15)', borderRadius: '8px', border: '1px solid rgba(251, 191, 36, 0.3)' }}>
                        <label style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: '600', display: 'block', marginBottom: '2px' }}>VEHÍCULO ANTERIOR</label>
                        <p style={{ margin: 0, fontWeight: '700', fontSize: '14px', color: 'var(--text-primary)' }}>{(previewProgramacion as any).vehiculo_cambio_patente || '-'}</p>
                        <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-tertiary)' }}>{(previewProgramacion as any).vehiculo_cambio_modelo || ''}</p>
                      </div>
                      <ArrowLeftRight size={20} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                      <div style={{ flex: 1, padding: '10px 14px', background: 'rgba(16, 185, 129, 0.15)', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                        <label style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: '600', display: 'block', marginBottom: '2px' }}>VEHÍCULO NUEVO</label>
                        <p style={{ margin: 0, fontWeight: '700', fontSize: '14px', color: 'var(--text-primary)' }}>{previewProgramacion.vehiculo_entregar_patente || previewProgramacion.vehiculo_entregar_patente_sistema || '-'}</p>
                        <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-tertiary)' }}>{previewProgramacion.vehiculo_entregar_modelo || previewProgramacion.vehiculo_entregar_modelo_sistema || ''}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="prog-modal-grid">
                    <div>
                      <label>Patente</label>
                      <p>{previewProgramacion.vehiculo_entregar_patente || previewProgramacion.vehiculo_entregar_patente_sistema || '-'}</p>
                    </div>
                    <div>
                      <label>Modelo</label>
                      <p>{previewProgramacion.vehiculo_entregar_modelo || previewProgramacion.vehiculo_entregar_modelo_sistema || '-'}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Conductores */}
              <div className="prog-modal-section">
                <h3><User size={16} /> {previewProgramacion.modalidad === 'turno' ? 'Conductores' : 'Conductor'}</h3>
                {previewProgramacion.modalidad === 'turno' ? (
                  <>
                    <div className="prog-modal-grid">
                      <div>
                        <label>Conductor Diurno</label>
                        <p>
                          {previewProgramacion.conductor_diurno_nombre || 'Sin asignar'}
                          {previewProgramacion.conductor_diurno_id && conductoresBajaIds.has(previewProgramacion.conductor_diurno_id) && (
                            <span style={{ marginLeft: 8, padding: '2px 8px', fontSize: '11px', fontWeight: 600, color: '#fff', background: '#DC2626', borderRadius: '10px' }}>De baja</span>
                          )}
                        </p>
                      </div>
                      {previewProgramacion.conductor_diurno_dni && (
                        <div>
                          <label>DNI Diurno</label>
                          <p>{previewProgramacion.conductor_diurno_dni}</p>
                        </div>
                      )}
                    </div>
                    <div className="prog-modal-grid" style={{ marginTop: 8 }}>
                      <div>
                        <label>Conductor Nocturno</label>
                        <p>
                          {previewProgramacion.conductor_nocturno_nombre || 'Sin asignar'}
                          {previewProgramacion.conductor_nocturno_id && conductoresBajaIds.has(previewProgramacion.conductor_nocturno_id) && (
                            <span style={{ marginLeft: 8, padding: '2px 8px', fontSize: '11px', fontWeight: 600, color: '#fff', background: '#DC2626', borderRadius: '10px' }}>De baja</span>
                          )}
                        </p>
                      </div>
                      {previewProgramacion.conductor_nocturno_dni && (
                        <div>
                          <label>DNI Nocturno</label>
                          <p>{previewProgramacion.conductor_nocturno_dni}</p>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="prog-modal-grid">
                    <div>
                      <label>Nombre</label>
                      <p>
                        {previewProgramacion.conductor_display || previewProgramacion.conductor_nombre || '-'}
                        {previewProgramacion.conductor_id && conductoresBajaIds.has(previewProgramacion.conductor_id) && (
                          <span style={{ marginLeft: 8, padding: '2px 8px', fontSize: '11px', fontWeight: 600, color: '#fff', background: '#DC2626', borderRadius: '10px' }}>De baja</span>
                        )}
                      </p>
                    </div>
                    {previewProgramacion.conductor_dni && (
                      <div>
                        <label>DNI</label>
                        <p>{previewProgramacion.conductor_dni}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Tipo y Modalidad */}
              <div className="prog-modal-section">
                <h3><FileText size={16} /> Asignacion</h3>
                <div className="prog-modal-grid">
                  <div>
                    <label>Tipo</label>
                    <p>{TIPO_ASIGNACION_LABELS[previewProgramacion.tipo_asignacion || ''] || '-'}</p>
                  </div>
                  <div>
                    <label>Modalidad</label>
                    <p>{previewProgramacion.modalidad === 'turno' ? 'Turno' : 'A Cargo'}</p>
                  </div>
                  {previewProgramacion.turno && (
                    <div>
                      <label>Turno</label>
                      <p>{previewProgramacion.turno === 'diurno' ? 'Diurno' : 'Nocturno'}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Cita */}
              <div className="prog-modal-section">
                <h3><Calendar size={16} /> Cita</h3>
                <div className="prog-modal-grid">
                  <div>
                    <label>Fecha</label>
                    <p>{previewProgramacion.fecha_cita ? new Date(previewProgramacion.fecha_cita + 'T12:00:00').toLocaleDateString('es-AR') : '-'}</p>
                  </div>
                  <div>
                    <label>Hora</label>
                    <p>{previewProgramacion.hora_cita?.substring(0, 5) || '-'}</p>
                  </div>
                  {previewProgramacion.zona && (
                    <div>
                      <label>Zona</label>
                      <p>{previewProgramacion.zona}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Estado */}
              <div className="prog-modal-section">
                <h3>Estado</h3>
                <span className={`prog-estado-badge ${previewProgramacion.estado}`}>
                  {PROGRAMACION_ESTADO_LABELS[previewProgramacion.estado] || previewProgramacion.estado}
                </span>
                {previewProgramacion.asignacion_id && (
                  <p className="prog-asignacion-info">
                    <CheckCircle size={14} />
                    Asignacion creada: <strong>{previewProgramacion.asignacion_codigo}</strong>
                  </p>
                )}
              </div>

              {/* Observaciones */}
              {previewProgramacion.observaciones && (
                <div className="prog-modal-section">
                  <h3>Observaciones</h3>
                  <p className="prog-observaciones">{previewProgramacion.observaciones}</p>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={handleClosePreview}>
                Cerrar
              </button>
              {!previewProgramacion.asignacion_id && canEdit && (
                <>
                  <button
                    className="btn-secondary"
                    onClick={handlePreviewEdit}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Pencil size={16} />
                    Editar
                  </button>
                  <button
                    className="btn-primary"
                    onClick={handlePreviewEnviar}
                    disabled={!!(previewProgramacion.asignacion_id || previewProgramacion.fecha_asignacion_creada)}
                    title={(previewProgramacion.asignacion_id || previewProgramacion.fecha_asignacion_creada) ? 'Ya enviado' : 'Enviar a Entrega'}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Send size={16} />
                    {(previewProgramacion.asignacion_id || previewProgramacion.fecha_asignacion_creada) ? 'Ya Enviado' : 'Enviar a Entrega'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Copiar Mensaje */}
      {showMensajeModal && mensajeModalProg && (
        <div className="prog-modal-overlay" onClick={handleCloseMensaje}>
          <div className="prog-modal" onClick={e => e.stopPropagation()}>
            <div className="prog-modal-header">
              <h2>Mensaje de Agenda</h2>
              <button onClick={handleCloseMensaje}>
                <XCircle size={20} />
              </button>
            </div>
            <div className="prog-modal-body">
              <div className="prog-modal-info">
                {mensajeModalProg.modalidad === 'turno' ? (
                  <>
                    <p><strong>Conductor Diurno:</strong> {mensajeModalProg.conductor_diurno_nombre || 'Sin asignar'}</p>
                    <p><strong>Conductor Nocturno:</strong> {mensajeModalProg.conductor_nocturno_nombre || 'Sin asignar'}</p>
                  </>
                ) : (
                  <p><strong>Conductor:</strong> {mensajeModalProg.conductor_display || mensajeModalProg.conductor_nombre || 'Sin asignar'}</p>
                )}
                <p><strong>Modalidad:</strong> {mensajeModalProg.modalidad === 'turno' ? 'Turno' : 'A Cargo'}</p>
              </div>
              <div className="prog-mensaje-preview">
                <pre>{generarMensajeAgenda(mensajeModalProg)}</pre>
              </div>
            </div>
            <div className="prog-modal-footer">
              <button className="btn-secondary" onClick={handleCloseMensaje}>
                Cerrar
              </button>
              <button className="btn-primary" onClick={handleCopiarAlPortapapeles}>
                <Copy size={16} />
                Copiar Mensaje
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
