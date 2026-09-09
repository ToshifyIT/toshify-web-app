// src/modules/onboarding/distribucion-mapa-v2/DistribucionMapaV2Module.tsx
//
// Submódulo "Distribución en mapa v2" — modo emparejamiento (propuesta B).
//
// Copia evolucionada del submódulo `distribucion-mapa`, que queda intacto.
// Novedades respecto del v1:
//   1. Iconografía propia por tipo de entidad (gorra de conductor / persona).
//   2. Distancia y tiempo REALES en vehículo (Distance Matrix). El tiempo es el
//      HABITUAL del recorrido, no el de un instante elegido: sin hora de salida
//      ni tráfico puntual, así el número es estable entre corridas. Se muestra
//      km y después tiempo.
//   3. Filtros segmentados: cada segmento muestra sólo sus filtros. Zona es
//      global; Turno aplica a ambos con semántica distinta.
//   4. Filtro nuevo "Conductor sin compañero".
//   5. Botón "Sugerir compañero" con panel derecho de pares (≤ 25 min por
//      defecto, regulable). Qué se cruza con qué lo decide el segmento activo:
//      Conductores cruza conductores, Leads cruza leads, Ambos cruza todo.
//   6. Búsqueda por tokens (arregla "Matias Albarado" -> "ALBARADO, MATIAS").
//   7. Los 14 estados de lead disponibles en filtros, con los dos de inducción
//      preseleccionados.
//   8. Más datos de ficha: edad, licencia y vigencia, experiencia, antecedentes
//      penales y zona peligrosa.
//
// Sigue siendo de sólo lectura: propone pares, no crea ni modifica asignaciones.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useJsApiLoader } from '@react-google-maps/api'
import { ChevronLeft, ChevronRight, Loader2, Map as MapIcon, ShieldAlert, Sparkles } from 'lucide-react'
import { useSede } from '../../../contexts/SedeContext'
import { supabase } from '../../../lib/supabase'
import type { Lead } from '../../../types/leads.types'
import { ConductorDetalleModal } from '../../conductores/panel/ConductorDetalleModal'
import {
  cargarPanelConductores,
  type ConductorPanelRow,
} from '../../conductores/panel/conductoresPanelService'
import { LeadDetalleModal } from './components/LeadDetalleModal'
import { getLeadEstadoColor } from '../../leads/leadEstadoColors'
import {
  GOOGLE_MAPS_API_KEY,
  GOOGLE_MAPS_LIBRARIES,
  GOOGLE_MAPS_LANGUAGE,
  GOOGLE_MAPS_REGION,
} from '../../../lib/googleMaps'
import {
  fetchConductoresMapa,
  fetchLeadsMapa,
  fetchZonasPeligrosas,
  geocodificarFaltantes,
  ESTADOS_LEAD_TODOS,
  SIN_ESTADO_LEAD,
  type ZonaPeligrosa,
} from './distribucionMapaV2Service'
import {
  clavePar,
  conexionesDesde,
  medirPar,
  sugerirPares,
  UMBRAL_MINUTOS_DEFAULT,
} from './emparejamientoService'
import { coincideBusqueda, coordsValidas, mismaPersona, turnoLeadATurno } from './utils'
import type {
  EntidadMapa,
  ParSugerido,
  Radar,
} from './types'
import { FiltrosSidebar } from './components/FiltrosSidebar'
import { contarFiltrosActivos, filtrosIniciales, type FiltrosV2 } from './components/filtrosOpciones'
import { MapaCanvas } from './components/MapaCanvas'
import {
  colorEntidad,
  COLOR_TURNO_DIURNO,
  COLOR_TURNO_NOCTURNO,
  COLOR_TURNO_SINPREF,
} from './components/colores'
import { SugerenciasDrawer } from './components/SugerenciasDrawer'
import { IconoEntidad } from './components/iconos'
import { Chip } from './components/ui'

// Cache perezoso del panel de conductores (consulta pesada). Se reusa para las
// fichas y se invalida al cambiar de sede. Mismo patrón que el v1.
let _panelCache: { sedeId: string | null; rows: ConductorPanelRow[] } | null = null
async function cargarPanelConductoresCache(sedeId: string | null): Promise<ConductorPanelRow[]> {
  if (_panelCache && _panelCache.sedeId === sedeId) return _panelCache.rows
  const rows = await cargarPanelConductores(sedeId)
  _panelCache = { sedeId, rows }
  return rows
}

/** Ancho del panel de filtros (el contenedor anima entre este valor y 0). */
const ANCHO_SIDEBAR = 250
/** Ancho de la lista flotante de resultados. */
const ANCHO_LISTA = 252
/** Ancho del panel de sugerencias (derecha). */
const ANCHO_DRAWER = 384

/**
 * Tope de líneas simultáneas sobre el mapa en el modo "Mostrar todos". Más que
 * esto el mapa deja de leerse y las etiquetas se pisan entre sí.
 */
const MAX_LINEAS_MAPA = 25

export function DistribucionMapaV2Module() {
  const { sedeActualId, aplicarFiltroSede } = useSede()
  const navigate = useNavigate()

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: GOOGLE_MAPS_LIBRARIES,
    language: GOOGLE_MAPS_LANGUAGE,
    region: GOOGLE_MAPS_REGION,
  })
  const [mapTimeout, setMapTimeout] = useState(false)

  const [conductores, setConductores] = useState<EntidadMapa[]>([])
  const [leads, setLeads] = useState<EntidadMapa[]>([])
  const [zonasPeligrosas, setZonasPeligrosas] = useState<ZonaPeligrosa[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [filtros, setFiltros] = useState<FiltrosV2>(filtrosIniciales)
  const aplicarPatch = useCallback((patch: Partial<FiltrosV2>) => {
    setFiltros((prev) => ({ ...prev, ...patch }))
  }, [])
  const limpiarFiltros = useCallback(() => {
    setFiltros((prev) => ({ ...filtrosIniciales(), segmento: prev.segmento }))
  }, [])
  const filtrosActivos = useMemo(() => contarFiltrosActivos(filtros), [filtros])

  // Emparejamiento
  const [drawerAbierto, setDrawerAbierto] = useState(false)
  const [baseSugerencias, setBaseSugerencias] = useState<EntidadMapa | null>(null)
  const [pares, setPares] = useState<ParSugerido[]>([])
  const [avisoPares, setAvisoPares] = useState<string | null>(null)
  const [calculando, setCalculando] = useState(false)
  const [umbral, setUmbral] = useState(UMBRAL_MINUTOS_DEFAULT)
  const [parSeleccionado, setParSeleccionado] = useState<ParSugerido | null>(null)
  // "Mostrar todos": dibuja de una todas las sugerencias sobre el mapa.
  const [mostrarTodosPares, setMostrarTodosPares] = useState(false)
  // Los pares en pantalla dejaron de corresponder a los filtros actuales.
  const [paresDesactualizados, setParesDesactualizados] = useState(false)

  // Modo "Ver todos en mapa": líneas desde una persona a las más cercanas.
  const [radar, setRadar] = useState<Radar | null>(null)
  const [calculandoRadar, setCalculandoRadar] = useState(false)

  // Los dos paneles de la izquierda (filtros y lista) se pliegan deslizándose
  // hacia el borde, para dejarle todo el ancho al mapa cuando hace falta.
  const [mostrarFiltros, setMostrarFiltros] = useState(true)
  const [mostrarLista, setMostrarLista] = useState(true)
  const anchoFiltros = mostrarFiltros ? ANCHO_SIDEBAR : 0
  const anchoLista = mostrarLista ? ANCHO_LISTA : 0
  // El panel de sugerencias (derecha) también se pliega, hacia su borde.
  const [drawerPlegado, setDrawerPlegado] = useState(false)
  // Los polígonos de zonas peligrosas se dibujan sobre el mapa (toggle).
  const [mostrarZonas, setMostrarZonas] = useState(true)

  const [activo, setActivo] = useState<string | null>(null)
  // Contador de "intenciones de enfoque". Cambiar sólo `activo` no alcanza para
  // volver a centrar el mapa cuando se vuelve a elegir a la MISMA persona (el
  // estado no cambia, React no re-dispara el efecto). Cada selección explícita
  // incrementa este tick, y el mapa se centra con cada cambio del tick.
  const [enfoqueTick, setEnfoqueTick] = useState(0)

  // ---------- Emparejamiento manual (base fijada) ----------
  // Con una base fijada, cada persona que se toca se mide contra ella: la
  // línea anterior se reemplaza por la nueva. La base se suelta a mano (✕) o
  // sola si deja de estar visible.
  const [baseManual, setBaseManual] = useState<EntidadMapa | null>(null)
  const [midiendoManual, setMidiendoManual] = useState(false)
  // Caché de pares ya medidos: el tiempo es determinístico, así que volver a
  // tocar a la misma persona no vuelve a pagar Distance Matrix.
  const cacheParesRef = useRef(new Map<string, ParSugerido>())
  const geocodDoneRef = useRef(false)

  // Fichas completas
  const [fichaConductor, setFichaConductor] = useState<ConductorPanelRow | null>(null)
  const [fichaLead, setFichaLead] = useState<Lead | null>(null)
  const [fichaLoading, setFichaLoading] = useState(false)

  const [toast, setToast] = useState<string | null>(null)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(t)
  }, [toast])

  // ---------- Carga de datos ----------

  const cargar = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      // Las zonas peligrosas se resuelven una vez por carga y se inyectan a los
      // fetch, que marcan si el domicilio de cada persona cae dentro de alguna.
      const zonas = await fetchZonasPeligrosas()
      setZonasPeligrosas(zonas)

      const [cond, lds] = await Promise.all([
        fetchConductoresMapa(aplicarFiltroSede, sedeActualId, zonas),
        fetchLeadsMapa(aplicarFiltroSede, zonas),
      ])
      setConductores(cond)
      setLeads(lds)

      // Geocodificación best-effort (acotada) una vez por carga.
      if (!geocodDoneRef.current) {
        geocodDoneRef.current = true
        const faltantes = [...cond, ...lds]
          .map((e) => ({
            id: e.id,
            tipo: e.tipo,
            direccion: e.direccion,
            lat: e.lat ?? null,
            lng: e.lng ?? null,
          }))
          .filter((f) => f.direccion && (f.lat == null || f.lng == null))

        if (faltantes.length > 0) {
          const actualizado = await geocodificarFaltantes(faltantes)
          if (actualizado) {
            const [cond2, lds2] = await Promise.all([
              fetchConductoresMapa(aplicarFiltroSede, sedeActualId, zonas),
              fetchLeadsMapa(aplicarFiltroSede, zonas),
            ])
            setConductores(cond2)
            setLeads(lds2)
          }
        }
      }
    } catch (err: any) {
      console.error('[DistribucionMapaV2] Error cargando datos:', err)
      setError(err?.message || 'Error cargando datos')
    } finally {
      setLoading(false)
    }
  }, [aplicarFiltroSede, sedeActualId])

  useEffect(() => {
    geocodDoneRef.current = false
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sedeActualId])

  useEffect(() => {
    if (isLoaded) return
    const t = setTimeout(() => setMapTimeout(true), 10000)
    return () => clearTimeout(t)
  }, [isLoaded])

  // ---------- Filtrado ----------

  const conUbicacion = useMemo(
    () => ({
      conds: conductores.filter((c) => coordsValidas(c.lat, c.lng)),
      lds: leads.filter((l) => coordsValidas(l.lat, l.lng)),
    }),
    [conductores, leads]
  )

  const matchZona = useCallback(
    (e: EntidadMapa) => filtros.zonas.size === 0 || (e.zona ? filtros.zonas.has(e.zona) : false),
    [filtros.zonas]
  )

  const matchRequisitos = useCallback((e: EntidadMapa, reqs: Set<string>) => {
    if (reqs.size === 0) return true
    if (reqs.has('licencia_vigente') && e.datos.licenciaEstado !== 'vigente') return false
    if (reqs.has('sin_antecedentes') && e.datos.antecedentesPenales === true) return false
    if (reqs.has('fuera_zona_peligrosa') && e.datos.zonaPeligrosa) return false
    return true
  }, [])

  const pasaFiltrosConductor = useCallback(
    (c: EntidadMapa) => {
      if (c.esBaja && !filtros.verBaja) return false
      if (
        filtros.turnosConductor.size > 0 &&
        !filtros.turnosConductor.has(c.turnoEfectivo || 'SIN_PREFERENCIA')
      ) {
        return false
      }
      // Asignación: mismo criterio que el v1 (sólo conductores en estado activo).
      if (filtros.asignacion.size > 0) {
        if (c.estadoCodigo !== 'activo') return false
        const con = filtros.asignacion.has('con')
        const sin = filtros.asignacion.has('sin')
        if (!(con && sin)) {
          if (c.tieneAsignacionActiva ? !con : !sin) return false
        }
      }
      // Compañero: 'no_aplica' queda fuera cuando el filtro está activo.
      if (filtros.companero.size > 0) {
        if (c.estadoCompanero === 'no_aplica') return false
        const clave = c.estadoCompanero === 'sin_companero' ? 'sin' : 'con'
        if (!filtros.companero.has(clave)) return false
      }
      if (!matchRequisitos(c, filtros.requisitosConductor)) return false
      if (!matchZona(c)) return false
      return coincideBusqueda(c, filtros.busqueda)
    },
    [filtros, matchZona, matchRequisitos]
  )

  const pasaFiltrosLead = useCallback(
    (l: EntidadMapa) => {
      if (
        filtros.estadosLead.size > 0 &&
        !filtros.estadosLead.has(l.estadoLead || SIN_ESTADO_LEAD)
      ) {
        return false
      }
      if (
        filtros.turnosLead.size > 0 &&
        !filtros.turnosLead.has(turnoLeadATurno(l.turnoLead) || 'SIN_PREFERENCIA')
      ) {
        return false
      }
      if (!matchRequisitos(l, filtros.requisitosLead)) return false
      if (!matchZona(l)) return false
      return coincideBusqueda(l, filtros.busqueda)
    },
    [filtros, matchZona, matchRequisitos]
  )

  /** Lo que se pinta en el mapa: respeta el segmento activo. */
  const visibles = useMemo(() => {
    const out: EntidadMapa[] = []
    if (filtros.segmento !== 'leads') {
      for (const c of conUbicacion.conds) if (pasaFiltrosConductor(c)) out.push(c)
    }
    if (filtros.segmento !== 'conductores') {
      for (const l of conUbicacion.lds) if (pasaFiltrosLead(l)) out.push(l)
    }
    return out
  }, [conUbicacion, filtros.segmento, pasaFiltrosConductor, pasaFiltrosLead])

  // El emparejamiento trabaja EXACTAMENTE sobre lo que se está viendo en el
  // mapa (`visibles`). Antes ignoraba el segmento activo, y eso hacía que el
  // panel propusiera leads que no estaban en pantalla: confuso e imposible de
  // verificar a ojo. Para emparejar con leads hay que mostrarlos (segmento
  // Leads o Ambos).

  const conteos = useMemo(() => {
    const c = visibles.filter((e) => e.tipo === 'conductor').length
    const l = visibles.filter((e) => e.tipo === 'lead').length
    const sinCompanero = visibles.filter(
      (x) => x.tipo === 'conductor' && x.estadoCompanero === 'sin_companero' && !x.esBaja
    ).length
    return { c, l, sinCompanero }
  }, [visibles])

  /** Estados de lead ofrecidos en el filtro: catálogo completo + los que existan. */
  const estadosLeadDisponibles = useMemo(() => {
    const vistos = new Set<string>(ESTADOS_LEAD_TODOS as unknown as string[])
    for (const l of leads) vistos.add(l.estadoLead || SIN_ESTADO_LEAD)
    return [...vistos].sort((a, b) => a.localeCompare(b))
  }, [leads])

  const leyendaLeads = useMemo(() => {
    const vistos = new Map<string, string>()
    for (const e of visibles) {
      if (e.tipo !== 'lead') continue
      const estado = e.estadoLead || SIN_ESTADO_LEAD
      if (!vistos.has(estado)) vistos.set(estado, getLeadEstadoColor(e.estadoLead))
    }
    return [...vistos.entries()].map(([estado, color]) => ({ estado, color })).slice(0, 4)
  }, [visibles])

  /**
   * Lo que se dibuja en el mapa y en la lista: lo visible, más la base fijada
   * si un filtro la dejó afuera. La base es INMUNE a los filtros a propósito:
   * el flujo típico es fijar a quien querés ubicar y después cambiar los
   * filtros para ver candidatos (leads, conductores con turno vacío). Si la
   * base desapareciera con el filtro, ese flujo sería imposible.
   *
   * Los candidatos del emparejamiento siguen saliendo de `visibles`: la base
   * nunca es candidata de sí misma.
   */
  const baseFueraDelFiltro = useMemo(
    () => !!baseManual && !visibles.some((e) => e.id === baseManual.id),
    [visibles, baseManual]
  )
  const entidadesMapa = useMemo(
    () => (baseManual && baseFueraDelFiltro ? [baseManual, ...visibles] : visibles),
    [visibles, baseManual, baseFueraDelFiltro]
  )

  const entidadActiva = useMemo(
    () => entidadesMapa.find((e) => e.id === activo) || null,
    [entidadesMapa, activo]
  )

  // Espejo de `visibles` para leerlo desde efectos sin agregarlo a sus
  // dependencias (ver el efecto de auto-recálculo más abajo).
  const visiblesRef = useRef(visibles)
  useEffect(() => {
    visiblesRef.current = visibles
  }, [visibles])

  // ---------- Emparejamiento manual ----------

  /** Mide base ↔ b y lo deja como par dibujado. Reemplaza la línea anterior. */
  const medirManual = useCallback(
    async (base: EntidadMapa, b: EntidadMapa) => {
      if (mismaPersona(base, b)) {
        setToast('Es la misma persona que la base')
        return
      }
      const clave = clavePar(base, b)
      const cacheado = cacheParesRef.current.get(clave)
      // Toda medición manual reemplaza lo dibujado: una línea a la vez.
      setRadar(null)
      setMostrarTodosPares(false)
      if (cacheado) {
        setParSeleccionado(cacheado)
        return
      }
      setMidiendoManual(true)
      try {
        const par = await medirPar(base, b)
        cacheParesRef.current.set(clave, par)
        setParSeleccionado(par)
      } catch (err) {
        console.error('[DistribucionMapaV2] Error midiendo par manual:', err)
        setToast('No se pudo medir la distancia')
      } finally {
        setMidiendoManual(false)
      }
    },
    []
  )

  const fijarBase = useCallback((e: EntidadMapa) => {
    setBaseManual(e)
    setParSeleccionado(null)
    setRadar(null)
    setMostrarTodosPares(false)
    setActivo(e.id)
    setEnfoqueTick((t) => t + 1)
    setToast(`Base fijada: ${e.nombre}. Cambiá filtros si hace falta: la base se mantiene.`)
  }, [])

  const soltarBase = useCallback(() => {
    setBaseManual(null)
    setParSeleccionado(null)
  }, [])

  /**
   * Selección desde el mapa o la lista. Con una base fijada, tocar a otra
   * persona además la mide contra la base.
   */
  const seleccionar = useCallback(
    (id: string | null) => {
      setActivo(id)
      if (!id) return
      setEnfoqueTick((t) => t + 1)
      if (baseManual && id !== baseManual.id) {
        const b = visiblesRef.current.find((e) => e.id === id)
        if (b) void medirManual(baseManual, b)
      }
    },
    [baseManual, medirManual]
  )

  // ---------- Emparejamiento ----------

  const correrSugerencias = useCallback(
    async (base: EntidadMapa | null) => {
      // El mapa arranca limpio: las líneas que hubiera son del cálculo anterior
      // y no tienen por qué coincidir con los pares que vienen.
      setRadar(null)
      setParSeleccionado(null)
      setMostrarTodosPares(false)
      setCalculando(true)
      setAvisoPares(null)
      try {
        const bases = base
          ? [base]
          : visibles.filter(
              (e) => e.tipo === 'conductor' && e.estadoCompanero === 'sin_companero' && !e.esBaja
            )

        if (bases.length === 0) {
          setPares([])
          setAvisoPares(
            'No hay conductores sin compañero con los filtros actuales. Seleccioná una persona en el mapa para sugerirle compañero.'
          )
          return
        }

        const resultado = await sugerirPares(bases, visibles, umbral)
        setPares(resultado.pares)
        setAvisoPares(resultado.aviso)
        setParesDesactualizados(false)
      } catch (err) {
        console.error('[DistribucionMapaV2] Error calculando pares:', err)
        setPares([])
        setAvisoPares('No se pudieron calcular las sugerencias.')
      } finally {
        setCalculando(false)
      }
    },
    [visibles, umbral]
  )

  const abrirSugerencias = useCallback(
    (base: EntidadMapa | null) => {
      setBaseSugerencias(base)
      setDrawerAbierto(true)
      setDrawerPlegado(false)
      setActivo(null)
      setRadar(null)
      setMostrarTodosPares(false)
      correrSugerencias(base)
    },
    [correrSugerencias]
  )

  // `correrSugerencias` cambia de identidad cada vez que cambian los filtros
  // (porque depende de `visibles`). Se guarda en un ref para poder dispararla
  // desde efectos sin que esos efectos se re-ejecuten con cada tecleo del
  // buscador, que dispararía llamadas a Distance Matrix de más.
  const correrSugerenciasRef = useRef(correrSugerencias)
  useEffect(() => {
    correrSugerenciasRef.current = correrSugerencias
  }, [correrSugerencias])

  // Espejo de la base manual para leerla desde el efecto de abajo sin que un
  // "Soltar base" dispare un recálculo por sí solo.
  const baseManualRef = useRef(baseManual)
  useEffect(() => {
    baseManualRef.current = baseManual
  }, [baseManual])

  // Con el panel abierto, elegir otra persona en el mapa o en la lista cambia
  // la base y recalcula solo. Pequeño retardo para no disparar dos veces cuando
  // el clic viene acompañado de un pan/zoom.
  //
  // EXCEPTO con una base manual fijada: ahí el clic significa "medí a esta
  // persona contra la base", no "cambiá la base de las sugerencias". Si este
  // efecto corriera igual, pisaría la línea recién medida (setParSeleccionado
  // null) y recalcularía sugerencias desde la persona equivocada.
  useEffect(() => {
    if (!drawerAbierto || !activo) return
    if (baseManualRef.current) return
    const base = visiblesRef.current.find((e) => e.id === activo)
    if (!base) return
    if (baseSugerencias && baseSugerencias.id === base.id) return

    const t = setTimeout(() => {
      setBaseSugerencias(base)
      setParSeleccionado(null)
      setMostrarTodosPares(false)
      correrSugerenciasRef.current(base)
    }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, drawerAbierto])

  // Las líneas dibujadas sobre el mapa (par elegido y modo "Ver todos") quedan
  // obsoletas si cambian los filtros o el tiempo máximo de viaje: se limpian
  // para no mostrar distancias que ya no corresponden a lo que se está viendo.
  //
  // Los pares del panel NO se recalculan solos acá: cada recálculo cuesta
  // llamadas a Distance Matrix y el usuario puede estar tipeando o arrastrando
  // el slider. Se marcan como desactualizados y el panel ofrece recalcular.
  useEffect(() => {
    setRadar(null)
    setParSeleccionado(null)
    setMostrarTodosPares(false)
    setParesDesactualizados((prev) => prev || pares.length > 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros, umbral])

  /**
   * Pares dibujados sobre el mapa: todos cuando está activo "Mostrar todos", o
   * sólo el elegido. Se recorta para que el mapa siga siendo legible.
   */
  const paresDibujados = useMemo(() => {
    if (mostrarTodosPares) return pares.slice(0, MAX_LINEAS_MAPA)
    return parSeleccionado ? [parSeleccionado] : []
  }, [mostrarTodosPares, pares, parSeleccionado])

  /**
   * "Ver todos en mapa": mide la distancia real desde la persona elegida hacia
   * las más cercanas y las dibuja como líneas, para ver de un vistazo quién
   * tiene cerca sin tener que abrir el panel de sugerencias.
   */
  const verTodosDesde = useCallback(
    async (base: EntidadMapa) => {
      setActivo(null)
      setParSeleccionado(null)
      setCalculandoRadar(true)
      try {
        const resultado = await conexionesDesde(base, visibles, umbral)
        setRadar(resultado)
        if (resultado.conexiones.length === 0) {
          setToast('No hay otras personas cerca con los filtros actuales')
        }
      } catch (err) {
        console.error('[DistribucionMapaV2] Error calculando cercanos:', err)
        setToast('No se pudieron calcular los cercanos')
      } finally {
        setCalculandoRadar(false)
      }
    },
    [visibles, umbral]
  )

  const copiarPar = useCallback((p: ParSugerido) => {
    const texto = [
      `${p.a.nombre} (DNI ${p.a.documento || 's/d'})`,
      `${p.b.nombre} (DNI ${p.b.documento || 's/d'})`,
      `${p.distanciaKm} km · ${p.tiempoMinutos} min`,
    ].join(' | ')
    navigator.clipboard?.writeText(texto).then(
      () => setToast('Par copiado al portapapeles'),
      () => setToast('No se pudo copiar')
    )
  }, [])

  const programarPar = useCallback(
    (p: ParSugerido) => {
      copiarPar(p)
      // `abrirNueva` le pide a Programación que abra el wizard de alta apenas
      // monta, así no hay que buscar el botón después de saltar de pantalla.
      navigate('/onboarding/programacion', { state: { abrirNueva: true } })
    },
    [copiarPar, navigate]
  )

  // ---------- Fichas ----------

  const abrirFicha = useCallback(
    async (e: EntidadMapa) => {
      setActivo(null)
      setFichaLoading(true)
      try {
        if (e.tipo === 'conductor') {
          const rows = await cargarPanelConductoresCache(sedeActualId)
          const row = rows.find((r) => r.id === e.id) || null
          if (row) setFichaConductor(row)
        } else {
          const { data } = await supabase.from('leads').select('*').eq('id', e.id).single()
          if (data) setFichaLead(data as Lead)
        }
      } catch (err) {
        console.error('[DistribucionMapaV2] Error abriendo ficha:', err)
      } finally {
        setFichaLoading(false)
      }
    },
    [sedeActualId]
  )

  // ---------- Render ----------

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)', minHeight: 480 }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 14,
          padding: '11px 18px',
          borderBottom: '1px solid var(--border-primary)',
          flexShrink: 0,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <MapIcon size={20} style={{ color: 'var(--color-primary, #ff0033)' }} />
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>
              Distribución en mapa <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>v2</span>
            </h2>
            <span style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>
              {conteos.c} conductores · {conteos.l} leads con ubicación ·{' '}
              <b style={{ color: 'var(--color-primary, #ff0033)' }}>
                {conteos.sinCompanero} sin compañero
              </b>
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Chip
            activo={mostrarZonas}
            onClick={() => setMostrarZonas((v) => !v)}
            title="Dibuja sobre el mapa los polígonos de las zonas restringidas activas."
          >
            <ShieldAlert size={12} /> Zonas restringidas ({zonasPeligrosas.length})
          </Chip>
          {/* Leyenda */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '5px 10px',
              background: 'var(--bg-secondary)',
              borderRadius: 8,
              flexWrap: 'wrap',
            }}
          >
            <LegendItem tipo="conductor" color={COLOR_TURNO_DIURNO} label="Diurno" />
            <LegendItem tipo="conductor" color={COLOR_TURNO_NOCTURNO} label="Nocturno" />
            <LegendItem tipo="conductor" color={COLOR_TURNO_SINPREF} label="Sin pref." />
            {leyendaLeads.map((l) => (
              <LegendItem key={`lg-${l.estado}`} tipo="lead" color={l.color} label={l.estado} />
            ))}
          </div>

          <button
            type="button"
            onClick={() => abrirSugerencias(null)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              border: 'none',
              borderRadius: 8,
              background: 'var(--color-primary, #ff0033)',
              color: '#fff',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <Sparkles size={14} /> Sugerir compañero (≤ {umbral} min)
          </button>
        </div>
      </div>

      {/* Body. Es `position: relative` porque las manijas de los paneles
          laterales viven acá, como hermanas de los paneles: si estuvieran
          adentro, el `overflow: hidden` que recorta el panel al plegarse las
          recortaría también. */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        {/* Panel de filtros: el contenedor anima el ancho y RECORTA; el sidebar
            adentro conserva sus 250px para que el contenido no se reacomode
            mientras se desliza. */}
        <div
          style={{
            width: mostrarFiltros ? ANCHO_SIDEBAR : 0,
            flexShrink: 0,
            overflow: 'hidden',
            transition: 'width .25s ease',
          }}
        >
          <div style={{ width: ANCHO_SIDEBAR, height: '100%' }}>
            <FiltrosSidebar
              filtros={filtros}
              onChange={aplicarPatch}
              estadosLeadDisponibles={estadosLeadDisponibles}
              conteoConductores={conteos.c}
              conteoLeads={conteos.l}
              conteoSinCompanero={conteos.sinCompanero}
              filtrosActivos={filtrosActivos}
              onLimpiar={limpiarFiltros}
            />
          </div>
        </div>
        {/* Lista de resultados: segunda columna, misma mecánica que filtros.
            Queda montada al plegarse, así conserva scroll y selección. */}
        <div
          style={{
            width: mostrarLista ? ANCHO_LISTA : 0,
            flexShrink: 0,
            overflow: 'hidden',
            transition: 'width .25s ease',
          }}
        >
          <div style={{ width: ANCHO_LISTA, height: '100%' }}>
            <ListaResultados
              entidades={entidadesMapa}
              activo={activo}
              onSeleccionar={seleccionar}
              baseManual={baseManual}
              baseFueraDelFiltro={baseFueraDelFiltro}
            />
          </div>
        </div>

        {/* Manijas de los dos paneles izquierdos. Se posicionan sobre el borde
            derecho de su panel; a distinta altura para no pisarse cuando los
            dos están plegados y comparten borde. */}
        <ManijaPanel
          abierto={mostrarFiltros}
          onClick={() => setMostrarFiltros((v) => !v)}
          titulo={mostrarFiltros ? 'Ocultar filtros' : 'Mostrar filtros'}
          badge={!mostrarFiltros && filtrosActivos > 0 ? filtrosActivos : undefined}
          left={Math.max(0, anchoFiltros - 12)}
        />
        <ManijaPanel
          abierto={mostrarLista}
          onClick={() => setMostrarLista((v) => !v)}
          titulo={mostrarLista ? 'Ocultar lista' : `Mostrar lista (${visibles.length})`}
          top={40}
          left={Math.max(0, anchoFiltros + anchoLista - 12)}
          badge={!mostrarLista ? visibles.length : undefined}
        />

        <div style={{ flex: 1, position: 'relative', display: 'flex' }}>
          {error ? (
            <CenterMsg>
              <span style={{ color: 'var(--text-secondary)' }}>{error}</span>
              <RetryButton onClick={cargar} label="Reintentar" />
            </CenterMsg>
          ) : loadError || (!isLoaded && mapTimeout) ? (
            <CenterMsg>
              <span style={{ color: 'var(--text-secondary)' }}>No se pudo cargar Google Maps</span>
              <RetryButton onClick={() => window.location.reload()} label="Reintentar" />
            </CenterMsg>
          ) : !isLoaded || loading ? (
            <CenterMsg>
              <span style={{ display: 'flex', alignItems: 'center', color: 'var(--text-tertiary)' }}>
                <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', marginRight: 8 }} />
                {!isLoaded ? 'Cargando mapa...' : 'Cargando datos...'}
              </span>
            </CenterMsg>
          ) : (
            <>
              <MapaCanvas
                entidades={entidadesMapa}
                activo={activo}
                onSeleccionar={seleccionar}
                entidadActiva={entidadActiva}
                enfoqueTick={enfoqueTick}
                paresDibujados={paresDibujados}
                parDestacado={parSeleccionado}
                onLimpiarPar={() => {
                  setParSeleccionado(null)
                  setMostrarTodosPares(false)
                }}
                onVerFicha={abrirFicha}
                onSugerirDesde={abrirSugerencias}
                onVerTodosDesde={verTodosDesde}
                zonasPeligrosas={zonasPeligrosas}
                mostrarZonas={mostrarZonas}
                radar={radar}
                onLimpiarRadar={() => setRadar(null)}
                baseManual={baseManual}
                midiendoManual={midiendoManual}
                onFijarBase={fijarBase}
                onSoltarBase={soltarBase}
                onCopiarPar={copiarPar}
                onProgramarPar={programarPar}
              />


              {calculandoRadar && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 16,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 4,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: 9,
                    padding: '7px 13px',
                    boxShadow: '0 4px 14px rgba(0,0,0,.16)',
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                  }}
                >
                  <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                  Midiendo distancias reales...
                </div>
              )}
            </>
          )}
        </div>

        {drawerAbierto && (
          <div
            style={{
              position: 'relative',
              width: drawerPlegado ? 0 : ANCHO_DRAWER,
              flexShrink: 0,
              overflow: 'hidden',
              transition: 'width .25s ease',
            }}
          >
            {/* Anclado al borde derecho: al achicarse el contenedor, el
                contenido queda recortado por la izquierda = se "va" a la derecha. */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                right: 0,
                width: ANCHO_DRAWER,
              }}
            >
          <SugerenciasDrawer
            base={baseSugerencias}
            pares={pares}
            cargando={calculando}
            aviso={avisoPares}
            umbral={umbral}
            onUmbralChange={setUmbral}
            parSeleccionado={parSeleccionado}
            onSeleccionarPar={(par) => {
              setMostrarTodosPares(false)
              setParSeleccionado(par)
            }}
            mostrarTodos={mostrarTodosPares}
            onToggleMostrarTodos={() => {
              setParSeleccionado(null)
              setMostrarTodosPares((v) => !v)
            }}
            desactualizado={paresDesactualizados}
            maxLineasMapa={MAX_LINEAS_MAPA}
            onCopiarPar={copiarPar}
            onProgramar={programarPar}
            onCerrar={() => {
              setDrawerAbierto(false)
              setParSeleccionado(null)
              setMostrarTodosPares(false)
            }}
            onRecalcular={() => correrSugerencias(baseSugerencias)}
          />
            </div>
          </div>
        )}
        {drawerAbierto && (
          <ManijaPanel
            lado="derecha"
            abierto={!drawerPlegado}
            onClick={() => setDrawerPlegado((v) => !v)}
            titulo={drawerPlegado ? `Mostrar sugerencias (${pares.length})` : 'Ocultar sugerencias'}
            badge={drawerPlegado && pares.length > 0 ? pares.length : undefined}
            right={drawerPlegado ? 0 : ANCHO_DRAWER - 12}
          />
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 22,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 12100,
            background: 'var(--text-primary)',
            color: 'var(--bg-primary)',
            padding: '9px 16px',
            borderRadius: 9,
            fontSize: 12.5,
            fontWeight: 600,
            boxShadow: '0 8px 24px rgba(0,0,0,.25)',
          }}
        >
          {toast}
        </div>
      )}

      {/* Carga de ficha */}
      {fichaLoading && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 12000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.35)',
          }}
        >
          <div
            style={{
              background: 'var(--bg-primary)',
              padding: '14px 20px',
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: 'var(--text-secondary)',
              fontSize: 13,
            }}
          >
            <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Cargando ficha...
          </div>
        </div>
      )}

      {fichaConductor && (
        <ConductorDetalleModal conductor={fichaConductor} onClose={() => setFichaConductor(null)} />
      )}
      {fichaLead && <LeadDetalleModal lead={fichaLead} onClose={() => setFichaLead(null)} />}
    </div>
  )
}

// =====================================================
// Subcomponentes locales
// =====================================================

function LegendItem({
  tipo,
  color,
  label,
}: {
  tipo: 'conductor' | 'lead'
  color: string
  label: string
}) {
  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 11,
        color: 'var(--text-secondary)',
        whiteSpace: 'nowrap',
      }}
    >
      <IconoEntidad tipo={tipo} color={color} size={13} />
      {label}
    </span>
  )
}

/**
 * Lista de resultados: sirve para ENCONTRAR y SELECCIONAR. Las acciones sobre
 * una persona (fijar base, ver cercanos, sugerir, ficha) viven en su ficha
 * flotante, que se abre sola al seleccionar una fila; tenerlas también acá
 * era duplicar botones a 200px de distancia.
 */
function ListaResultados({
  entidades,
  activo,
  onSeleccionar,
  baseManual,
  baseFueraDelFiltro,
}: {
  entidades: EntidadMapa[]
  activo: string | null
  onSeleccionar: (id: string) => void
  baseManual: EntidadMapa | null
  /** true cuando la base está en `entidades` sólo por ser base (el filtro la excluye). */
  baseFueraDelFiltro: boolean
}) {
  // `entidades` ya trae la base aunque el filtro la excluya. Para el contador
  // se muestra aparte, así el número sigue siendo el de la búsqueda.
  const resultados = baseFueraDelFiltro ? entidades.length - 1 : entidades.length

  // La fila elegida se trae a la vista: con 180 resultados puede estar muy
  // abajo, y si se seleccionó desde el mapa el operador no sabe dónde buscarla.
  const filaActivaRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    filaActivaRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [activo])

  return (
    <div
      style={{
        // Columna anclada al layout (no flota sobre el mapa): el ancho lo fija
        // el contenedor plegable del módulo, acá se llena el 100%.
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-primary)',
        borderRight: '1px solid var(--border-primary)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          padding: '7px 8px 7px 12px',
          borderBottom: '1px solid var(--border-primary)',
          background: 'var(--bg-secondary)',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
          {resultados} resultado{resultados === 1 ? '' : 's'}
          {baseFueraDelFiltro && (
            <span style={{ color: 'var(--text-tertiary)', fontWeight: 500 }}> · + base fijada</span>
          )}
        </span>
      </div>

      {/* flex:1 + minHeight:0: sin eso la lista no scrollea dentro de la columna */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {entidades.map((e) => {
          const esActiva = activo === e.id
          const esBase = !!baseManual && baseManual.id === e.id
          return (
          <div
            key={`li-${e.tipo}-${e.id}`}
            ref={esActiva ? filaActivaRef : undefined}
            onClick={() => onSeleccionar(e.id)}
            style={{
              padding: '7px 12px 7px 9px',
              cursor: 'pointer',
              borderBottom: '1px solid var(--border-primary)',
              // La fila activa se marca igual que la persona en el mapa: barra y
              // fondo rojos. Con sólo un gris de fondo no se distinguía.
              borderLeft: esActiva ? '4px solid #ff0033' : '4px solid transparent',
              background: esActiva ? 'rgba(255, 0, 51, 0.09)' : 'transparent',
              opacity: e.tipo === 'conductor' && e.esBaja ? 0.55 : 1,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <IconoEntidad tipo={e.tipo} color={colorEntidad(e)} size={15} />
              <span
                style={{
                  fontSize: 12,
                  fontWeight: esActiva ? 800 : 600,
                  color: esActiva ? '#ff0033' : 'var(--text-primary)',
                  lineHeight: 1.2,
                }}
              >
                {e.nombre}
              </span>
              {(esActiva || esBase) && (
                <span
                  style={{
                    marginLeft: 'auto',
                    fontSize: 9.5,
                    fontWeight: 800,
                    letterSpacing: '.4px',
                    textTransform: 'uppercase',
                    color: esBase ? '#ff0033' : '#fff',
                    background: esBase ? 'rgba(255,0,51,.12)' : '#ff0033',
                    border: esBase ? '1px solid #ff0033' : 'none',
                    borderRadius: 999,
                    padding: '2px 7px',
                    flexShrink: 0,
                  }}
                >
                  {esBase ? (baseFueraDelFiltro ? 'Base · fuera del filtro' : 'Base') : 'Seleccionado'}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 2, marginLeft: 21, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                {e.tipo === 'lead' ? 'Lead' : e.esBaja ? 'Conductor · Baja' : 'Conductor'}
              </span>
              {e.documento && (
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{e.documento}</span>
              )}
              {e.zona && <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{e.zona}</span>}
              {e.estadoCompanero === 'sin_companero' && (
                <span style={{ fontSize: 10, fontWeight: 700, color: '#b91c1c' }}>Sin compañero</span>
              )}
            </div>
          </div>
          )
        })}
        {entidades.length === 0 && (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>
            Sin resultados
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Manija vertical pegada al borde derecho de un panel lateral. Queda mitad
 * sobre el panel y mitad sobre el mapa, así sigue visible (y clickeable) con
 * el panel cerrado. `badge` muestra un número cuando hay algo que recordar
 * (p. ej. filtros activos con el panel oculto).
 */
function ManijaPanel({
  abierto,
  onClick,
  titulo,
  badge,
  lado = 'izquierda',
  top = '50%',
  left,
  right,
}: {
  abierto: boolean
  onClick: () => void
  titulo: string
  badge?: number
  /** De qué lado de la pantalla vive el panel: define hacia dónde apunta el chevron. */
  lado?: 'izquierda' | 'derecha'
  /** Posición vertical (default: centrada). */
  top?: number | string
  /** Posición horizontal, relativa al contenedor `position: relative` más cercano. */
  left?: number | string
  right?: number | string
}) {
  // Panel izquierdo: abierto → chevron a la izquierda (se va hacia allá).
  // Panel derecho: abierto → chevron a la derecha.
  const apuntaIzquierda = lado === 'izquierda' ? abierto : !abierto
  return (
    <button
      type="button"
      onClick={onClick}
      title={titulo}
      aria-label={titulo}
      style={{
        position: 'absolute',
        top,
        left,
        right,
        transform: top === '50%' ? 'translateY(-50%)' : undefined,
        transition: 'left .25s ease, right .25s ease',
        width: 24,
        height: 56,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px solid var(--border-primary)',
        borderRadius: 8,
        background: 'var(--bg-primary)',
        color: 'var(--text-secondary)',
        boxShadow: '0 3px 10px rgba(0,0,0,0.12)',
        cursor: 'pointer',
        zIndex: 6,
        padding: 0,
      }}
    >
      {apuntaIzquierda ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
      {badge !== undefined && (
        <span
          style={{
            position: 'absolute',
            top: -7,
            right: -7,
            minWidth: 16,
            height: 16,
            padding: '0 4px',
            borderRadius: 999,
            background: 'var(--color-primary, #ff0033)',
            color: '#fff',
            fontSize: 9.5,
            fontWeight: 800,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {badge}
        </span>
      )}
    </button>
  )
}

function CenterMsg({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flex: 1,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 12,
      }}
    >
      {children}
    </div>
  )
}

function RetryButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 20px',
        background: 'var(--color-primary, #ff0033)',
        color: '#fff',
        border: 'none',
        borderRadius: 8,
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      {label}
    </button>
  )
}

export default DistribucionMapaV2Module
