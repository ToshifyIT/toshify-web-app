// Sub-modulo "Panel de Conductores" (dentro de Conductores).
// Mismo formato que el resto de modulos: tarjetas de metricas (stat-cards) arriba
// y DataTable compartido abajo (buscador + paginacion + filtros de columna).
//
// Acumulado por conductor: estado, auto asignado ahora mismo, y sus multas
// (cantidad, vehiculos, monto total, pagadas/pendientes y montos). Por defecto se
// muestran solo los conductores con auto asignado; las stat-cards actuan de filtro.
// Cada fila tiene "Ver mis datos" (portal Mi Espacio embebido).

import { useState, useEffect, useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { Eye, Car, AlertTriangle, Clock, Users, Download, Gauge, RefreshCw, Phone, TrendingDown, Wallet, Banknote, MessageCircle } from 'lucide-react'
import { useSede } from '../../../contexts/SedeContext'
import { formatPlata, formatNumero } from '../../../utils/format'
import { DataTable } from '../../../components/ui/DataTable'
import { cabifyService } from '../../../services/cabifyService'
import { cargarPanelConductores, cargarKmGeoPanel, type ConductorPanelRow } from './conductoresPanelService'
import { ConductorDetalleModal } from './ConductorDetalleModal'
import { calificacionDesdeGuardada, calificarConductor, referenciaIngresos, type Calificacion, type ExtrasCalificacion } from './calificacionConductor'
import { CalificacionCelda } from './CalificacionEstrellas'
import { ajustarConSaldoActual, cargarRiesgoDeuda, textoRiesgo, NIVEL_RIESGO_LABEL, type RiesgoDeuda } from './riesgoDeuda'
import { guardarSemanaCerradaSiFalta, cargarExcesosRecientes, cargarExtrasCalificacion, cargarSemanaCerradaGuardada, lunesSemanaCerrada, type CalificacionSemana } from './calificacionesHistorial'
import { StatsGrid } from '../../../components/ui/StatsGrid'
import { hoyART } from '../../../utils/fechaArgentina'
import '../ConductoresModule.css'
import './ConductoresPanelModule.css'
import { PatenteBadge } from '../../../components/ui/PatenteBadge'
import { LicenciaBadge } from '../../../components/ui/LicenciaBadge'
import { TurnoBadge } from '../../../components/ui/TurnoBadge'
import { AppBadges } from '../../../components/ui/AppBadges'
import { etiquetaLicencia } from '../../../utils/etiquetaLicencia'
import { ActionsMenu } from '../../../components/ui/ActionsMenu'
import { LlamadaConductor } from '../../integraciones/twochat/LlamadaConductor'
import { useLineaVoz } from '../../integraciones/twochat/useLineaVoz'
import { ElegirNumeroLlamada } from '../../integraciones/twochat/ElegirNumeroLlamada'
import { ChatLeadModal } from '../../leads/components/ChatLeadModal'
import { telefonosParaLlamar, type TelefonoLlamada, type TipoTelefono } from '../../integraciones/twochat/telefonosConductor'

// Kilometros de Cabify. La tabla muestra "—" cuando no hay dato: los dias
// anteriores al 16/09/2026 no tienen kilometros sincronizados, y eso no es 0 km.
function fmtKm(v: number): string {
  return `${v.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`
}

/** Tarjeta «Deuda mayor a $ 100.000»: Saldo pendiente por encima de esto */
const DEUDA_ALTA = 100000

type CardKey = 'conAuto' | 'sinCubrir' | 'deuda100' | 'pendientes' | 'alertaKm' | 'riesgoAlto'

const CARD_LABELS: Record<CardKey, string> = {
  conAuto: 'Con Auto Asignado',
  sinCubrir: 'No cubrió 2 semanas',
  deuda100: 'Deuda mayor a $ 100.000',
  pendientes: 'Con Multas Pendientes',
  alertaKm: 'Bajo Aprovechamiento',
  riesgoAlto: 'Riesgo de deuda alto',
}

// ALERTA DE USO OCIOSO DEL VEHICULO
// Regla: se toma el UMBRAL% de los km recorridos segun GPS (columna KM Geo) y,
// si ese valor es MAYOR que los km con viaje asignado (columna KM-viaje asig),
// el conductor queda marcado. Dicho al reves: alerta cuando el aprovechamiento
// (KM-viaje asig / KM Geo) queda por DEBAJO del umbral.
//
// El pedido original fue 70%, pero con datos reales ningun conductor de la
// flota llega a ese nivel (el mejor ronda 47%): a 70% la alerta marcaba al
// 100% de la gente y no distinguia nada. Se fijo en 35%, que es donde empieza
// a separar los casos reales. Cambiar este numero es una linea.
const UMBRAL_KM_PRODUCTIVO = 0.35

// Aprovechamiento del vehiculo: que parte de los km recorridos (GPS) se hizo
// con un viaje asignado. null cuando falta alguna de las dos mediciones.
function aprovechamientoKm(r: ConductorPanelRow): number | null {
  const geo = r.kmGeo
  const asig = r.cabify?.kmAsignado
  if (geo === null || geo === undefined || geo <= 0) return null
  if (asig === null || asig === undefined) return null
  return (asig / geo) * 100
}

// Sin GPS o sin cruce con Cabify no se marca: no hay con que comparar, y
// marcar por falta de dato seria peor que no marcar.
function tieneAlertaKm(r: ConductorPanelRow): boolean {
  const pct = aprovechamientoKm(r)
  return pct !== null && pct < UMBRAL_KM_PRODUCTIVO * 100
}

// Etiqueta legible del turno de la asignacion actual.
const TURNO_LABELS: Record<string, string> = {
  diurno: 'Diurno',
  nocturno: 'Nocturno',
  a_cargo: 'A cargo',
}
// Etiqueta corta del grupo de flota (vehiculos.grupo_flota guarda la razon
// social). Los grupos conocidos se abrevian; cualquier otro se muestra tal cual.
function grupoFlotaLabel(grupo: string | null): string {
  if (!grupo) return ''
  const upper = grupo.toUpperCase()
  if (upper.includes('44 DREAM')) return '44 Dreams'
  if (upper.includes('GRUPO CG')) return 'Grupo CG'
  return grupo
}

function turnoLabel(t: string | null): string {
  if (!t) return '—'
  return TURNO_LABELS[t] || t
}

// dd/MM de una fecha ISO. El rango de semana de Cabify se construye en UTC
// (cabifyService.getWeekRange), asi que se lee en UTC para no correrse un dia.
function diaCorto(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function ConductoresPanelModule() {
  const { sedeActualId } = useSede()

  // La tabla se muestra con los datos principales; KM GEO (viajes de GPS, lo más
  // lento) llega después y se completa en las mismas filas.
  const [rowsBase, setRowsBase] = useState<ConductorPanelRow[]>([])
  const [kmGeo, setKmGeo] = useState<Map<string, number> | null>(null)
  const [kmGeoCargando, setKmGeoCargando] = useState(true)
  const rows = useMemo(
    () => kmGeo ? rowsBase.map(r => ({ ...r, kmGeo: kmGeo.get(r.id) ?? null })) : rowsBase,
    [rowsBase, kmGeo],
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Por defecto: solo conductores con auto asignado ahora mismo.
  // «Con Auto Asignado» va aparte: queda prendido por defecto y se combina con las otras
  // tarjetas (p. ej. Bajo Aprovechamiento solo de los que tienen auto), hasta que
  // se apaga a mano. Las demás tarjetas son de a una.
  const [soloConAuto, setSoloConAuto] = useState(true)
  const [activeCard, setActiveCard] = useState<Exclude<CardKey, 'conAuto'> | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [detalle, setDetalle] = useState<{ fila: ConductorPanelRow; tab: 'facturacion' | 'calificacion' } | null>(null)
  // Llamada en curso desde Toshibase (2Chat): una a la vez
  const [chat, setChat] = useState<{ id: string; nombre: string } | null>(null)
  const [llamada, setLlamada] = useState<{ id: string; nombre: string; telefono: TipoTelefono } | null>(null)
  // Conductor con más de un número (WhatsApp y secundario): primero se elige a cuál llamar
  const [eligiendo, setEligiendo] = useState<{ id: string; nombre: string; telefonos: TelefonoLlamada[] } | null>(null)
  // Línea de 2Chat ocupada por otra persona con la misma cuenta (p. ej. Info Toshify)
  const { motivo: sinLinea, actualizar: actualizarLinea } = useLineaVoz()
  // Calificación 1-5 de cada conductor (ver calificacionConductor.ts)
  // Excesos de km de las últimas 4 semanas (Facturación), para el factor "Límite de km"
  const [excesosKm, setExcesosKm] = useState<Awaited<ReturnType<typeof cargarExcesosRecientes>>>(null)
  useEffect(() => {
    if (!rowsBase.length) return
    let activo = true
    cargarExcesosRecientes(rowsBase.map(r => r.id)).then(e => { if (activo) setExcesosKm(e) })
    return () => { activo = false }
  }, [rowsBase])
  // Semana en curso (avance parcial): se ve dentro del detalle, pestaña Calificación
  const [extrasCal, setExtrasCal] = useState<ExtrasCalificacion | null>(null)
  useEffect(() => {
    if (!rowsBase.length) return
    let activo = true
    cargarExtrasCalificacion(rowsBase.map(r => r.id)).then(e => { if (activo) setExtrasCal(e) })
    return () => { activo = false }
  }, [rowsBase])
  const calificacionesEnCurso = useMemo(() => {
    const ref = referenciaIngresos(rows)
    const m = new Map<string, Calificacion>()
    for (const r of rows) m.set(r.id, calificarConductor(r, ref, excesosKm, extrasCal))
    return m
  }, [rows, excesosKm, extrasCal])
  // La tabla muestra la ÚLTIMA SEMANA CERRADA (la guardada cada lunes): la semana en
  // curso arranca en cero el lunes y bajaba a todos. Si un conductor no tiene la
  // semana guardada todavía, se usa el avance de la semana en curso.
  const [cerradas, setCerradas] = useState<Map<string, CalificacionSemana> | null>(null)
  const [recargarCerradas, setRecargarCerradas] = useState(0)
  useEffect(() => {
    let activo = true
    cargarSemanaCerradaGuardada()
      .then(m => { if (activo) setCerradas(m) })
      .catch(() => { if (activo) setCerradas(new Map()) })
    return () => { activo = false }
  }, [recargarCerradas, reloadKey])
  const calificaciones = useMemo(() => {
    const m = new Map<string, Calificacion>()
    for (const r of rows) {
      const g = cerradas?.get(r.id)
      m.set(r.id, g ? calificacionDesdeGuardada(g) : (calificacionesEnCurso.get(r.id) as Calificacion))
    }
    return m
  }, [rows, cerradas, calificacionesEnCurso])
  // Historial: la primera vez que se abre el panel desde el lunes se calcula y guarda
  // la calificación de la semana que terminó (en segundo plano, sin trabar la pantalla).
  useEffect(() => {
    if (loading || !rowsBase.length) return
    void guardarSemanaCerradaSiFalta(sedeActualId ?? null, rowsBase.map(r => r.id))
      .then(guardo => { if (guardo) setRecargarCerradas(k => k + 1) })
  }, [loading, rowsBase, sedeActualId])
  // Filas realmente visibles en la tabla: el DataTable las reporta ya pasadas por
  // TODOS sus filtros internos (columna, rangos numéricos, búsqueda global).
  // Es null hasta el primer aviso de la tabla; ahí se cae a filteredRows.
  const [visibles, setVisibles] = useState<ConductorPanelRow[] | null>(null)

  // Semana EN CURSO de Cabify (lunes-domingo, mismo calculo que el modulo
  // Integraciones > Cabify). Se recalcula al recargar para que, si la pestaña
  // quedo abierta al cruzar el lunes, pase sola a la semana nueva.
  // El rango incluye hoy, asi que cabifyHistoricalService saltea su cache y
  // siempre trae lo ultimo sincronizado (acumulado lunes -> hoy).
  const semanaCabify = useMemo(() => {
    void reloadKey // recalcular tambien al pulsar "Recargar"
    return cabifyService.getWeekRange(0)
  }, [reloadKey])
  const rangoCabifyLabel = useMemo(
    () => `${diaCorto(semanaCabify.startDate)} – ${diaCorto(semanaCabify.endDate)}`,
    [semanaCabify],
  )

  useEffect(() => {
    let activo = true
    setLoading(true)
    setError('')
    setKmGeo(null)
    setKmGeoCargando(true)
    cargarPanelConductores(sedeActualId, {
      cabify: { startDate: semanaCabify.startDate, endDate: semanaCabify.endDate },
      appsPago: { inicio: semanaCabify.startDate.slice(0, 10) },
      sinKmGeo: true,
    })
      .then(data => { if (activo) setRowsBase(data) })
      .catch(e => { if (activo) setError(e?.message || 'Error al cargar el panel') })
      .finally(() => { if (activo) setLoading(false) })
    // En paralelo: si falla, la columna queda en "—" como antes
    cargarKmGeoPanel(sedeActualId, semanaCabify)
      .catch(() => new Map<string, number>())
      .then(m => { if (activo) setKmGeo(m) })
      .finally(() => { if (activo) setKmGeoCargando(false) })
    return () => { activo = false }
  }, [sedeActualId, reloadKey, semanaCabify])

  // Riesgo de no poder pagar la deuda (ver riesgoDeuda.ts). Si falla, la columna queda en "—".
  const [riesgosBase, setRiesgos] = useState<Map<string, RiesgoDeuda> | null>(null)
  // No cubrió lo facturado las 2 últimas semanas (sale de la misma consulta)
  const [sinCubrir, setSinCubrir] = useState<Set<string> | null>(null)
  // La deuda se corrige con el saldo actual: incluye pagos posteriores a la facturación
  const riesgos = useMemo(
    () => (riesgosBase ? ajustarConSaldoActual(riesgosBase, new Map(rowsBase.map(r => [r.id, r.saldoPendiente]))) : null),
    [riesgosBase, rowsBase],
  )
  useEffect(() => {
    let activo = true
    setRiesgos(null)
    setSinCubrir(null)
    cargarRiesgoDeuda(sedeActualId ?? null)
      .then(m => { if (activo) { setRiesgos(m.riesgos); setSinCubrir(m.sinCubrir2Semanas) } })
      .catch(e => {
        console.error('Riesgo de deuda:', e)
        if (activo) { setRiesgos(new Map()); setSinCubrir(new Set()) }
      })
    return () => { activo = false }
  }, [sedeActualId, reloadKey])

  // Base de las demás tarjetas: con «Con Auto Asignado» prendido, solo los que tienen auto
  const base = useMemo(() => (soloConAuto ? rows.filter(c => c.tieneAsignacion) : rows), [rows, soloConAuto])

  const stats = useMemo(() => ({
    conAuto: rows.filter(c => c.tieneAsignacion).length,
    sinCubrir: base.filter(c => !!sinCubrir?.has(c.id)).length,
    deuda100: base.filter(c => c.saldoPendiente > DEUDA_ALTA).length,
    pendientes: base.filter(c => c.montoPendiente > 0).length,
    alertaKm: base.filter(tieneAlertaKm).length,
    riesgoAlto: base.filter(c => c.tieneAsignacion && riesgos?.get(c.id)?.nivel === 'alto').length,
  }), [rows, base, riesgos, sinCubrir])

  const filteredRows = useMemo(() => {
    switch (activeCard) {
      case 'sinCubrir': return base.filter(c => !!sinCubrir?.has(c.id))
      case 'deuda100': return base.filter(c => c.saldoPendiente > DEUDA_ALTA)
      case 'pendientes': return base.filter(c => c.montoPendiente > 0)
      case 'alertaKm': return base.filter(tieneAlertaKm)
      case 'riesgoAlto': return base.filter(c => c.tieneAsignacion && riesgos?.get(c.id)?.nivel === 'alto')
      default: return base
    }
  }, [base, activeCard, riesgos, sinCubrir])

  const handleCard = (card: CardKey) => {
    if (card === 'conAuto') setSoloConAuto(v => !v)
    else setActiveCard(prev => prev === card ? null : card)
  }

  // Lo que se exporta = exactamente lo que el usuario está viendo: el filtro de
  // stat-card (filteredRows) más los filtros internos del DataTable (que llegan
  // por onFilteredDataChange). No es la página actual: son todas las filas que
  // pasan los filtros.
  const filasAExportar = visibles ?? filteredRows

  const handleExportar = async () => {
    const XLSX = await import('xlsx')
    if (filasAExportar.length === 0) return

    // Los importes van como NÚMERO (no con formatCurrency) para que Excel pueda
    // sumarlos y filtrarlos; el formato de moneda lo pone la planilla.
    const dataExport = filasAExportar.map(c => ({
      'Conductor': c.nombre || '',
      'Calificación (1-5)': calificaciones.get(c.id)?.estrellas ?? '',
      'DNI': c.dni || '',
      'CUIT': c.ruc || '',
      'Capitán': c.guia || '',
      'App (pagó)': c.apps?.join(' + ') || '',
      'Riesgo deuda': riesgos?.get(c.id) ? NIVEL_RIESGO_LABEL[riesgos.get(c.id)!.nivel] : '',
      'Deuda (semanas de alquiler)': riesgos?.get(c.id) ? Number(riesgos.get(c.id)!.semanasDeuda.toFixed(1)) : '',
      'Estado': c.activo ? 'Activo' : (c.estadoCodigo || 'Inactivo'),
      'Licencia': etiquetaLicencia(c.categoriaLicencia, c.categoriaLicenciaOtra) || '',
      'Patente Asignada': c.vehiculoAsignado || 'Sin asignación',
      'Grupo de Flota': grupoFlotaLabel(c.grupoFlotaAsignado),
      'Turno': turnoLabel(c.turno),
      'Multas': c.cantidadMultas,
      'Pendientes': c.pendientes,
      'En Proceso': c.enProceso,
      'Pagadas': c.pagadas,
      'Vehículos (cant.)': c.vehiculos.length,
      'Vehículos (patentes)': c.vehiculos.join(', '),
      'Monto Pendiente': c.montoPendiente,
      'Monto En Proceso': c.montoEnProceso,
      'Monto Pagado': c.montoPagado,
      'Monto Total Multas': c.montoTotalMultas,
      'Saldo Pendiente': c.saldoPendiente,
      'Saldo A Favor': c.saldoAFavor,
      'Tiene Garantía': c.tieneGarantia ? 'Sí' : 'No',
      'Garantía Pagada': c.garantiaPagada,
      'Garantía Total': c.garantiaTotal,
      'Saldo − Garantía': c.saldoMenosGarantia,
      [`Ingresos Cabify (${rangoCabifyLabel})`]: c.cabify ? c.cabify.gananciaTotal : '',
      [`Viajes Cabify (${rangoCabifyLabel})`]: c.cabify ? c.cabify.viajesFinalizados : '',
      [`Efectivo Cabify (${rangoCabifyLabel})`]: c.cabify ? c.cabify.cobroEfectivo : '',
      [`App Cabify (${rangoCabifyLabel})`]: c.cabify ? c.cabify.cobroApp : '',
      [`Peajes Cabify (${rangoCabifyLabel})`]: c.cabify ? c.cabify.peajes : '',
      [`KM total Cabify (${rangoCabifyLabel})`]: c.cabify && c.cabify.kmTotal !== null ? c.cabify.kmTotal : '',
      [`KM-viaje asig Cabify (${rangoCabifyLabel})`]: c.cabify && c.cabify.kmAsignado !== null ? c.cabify.kmAsignado : '',
      [`KM-viaje sin asig Cabify (${rangoCabifyLabel})`]: c.cabify && c.cabify.kmSinAsignar !== null ? c.cabify.kmSinAsignar : '',
      [`KM Geo (${rangoCabifyLabel})`]: c.kmGeo ?? '',
      '% Aprovechamiento': aprovechamientoKm(c) !== null ? Number(aprovechamientoKm(c)!.toFixed(1)) : '',
      'Bajo Aprovechamiento': tieneAlertaKm(c) ? 'Sí' : 'No',
    }))

    const ws = XLSX.utils.json_to_sheet(dataExport)
    ws['!cols'] = [
      { wch: 30 }, // Conductor
      { wch: 12 }, // Calificación
      { wch: 12 }, // DNI
      { wch: 14 }, // CUIT
      { wch: 18 }, // Guía
      { wch: 14 }, // App
      { wch: 12 }, // Riesgo deuda
      { wch: 14 }, // Deuda (semanas)
      { wch: 12 }, // Estado
      { wch: 16 }, // Patente Asignada
      { wch: 14 }, // Grupo de Flota
      { wch: 10 }, // Turno
      { wch: 8 },  // Multas
      { wch: 11 }, // Pendientes
      { wch: 11 }, // En Proceso
      { wch: 10 }, // Pagadas
      { wch: 15 }, // Vehículos (cant.)
      { wch: 28 }, // Vehículos (patentes)
      { wch: 16 }, // Monto Pendiente
      { wch: 16 }, // Monto En Proceso
      { wch: 15 }, // Monto Pagado
      { wch: 17 }, // Monto Total Multas
      { wch: 16 }, // Saldo Pendiente
      { wch: 14 }, // Saldo A Favor
      { wch: 13 }, // Tiene Garantía
      { wch: 16 }, // Garantía Pagada
      { wch: 15 }, // Garantía Total
      { wch: 17 }, // Saldo − Garantía
      { wch: 24 }, // Ingresos Cabify
      { wch: 22 }, // Viajes Cabify
      { wch: 24 }, // Efectivo Cabify
      { wch: 22 }, // App Cabify
      { wch: 22 }, // Peajes Cabify
      { wch: 22 }, // KM total Cabify
      { wch: 24 }, // KM-viaje asig Cabify
      { wch: 26 }, // KM-viaje sin asig Cabify
      { wch: 20 }, // KM Geo
      { wch: 18 }, // % Aprovechamiento
      { wch: 24 }, // Bajo Aprovechamiento
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Conductores')

    // El nombre del archivo deja constancia del filtro de stat-card usado.
    const sufijoFiltro = [soloConAuto ? 'conAuto' as const : null, activeCard]
      .filter((k): k is CardKey => !!k)
      .map(k => `_${CARD_LABELS[k].replace(/\s+/g, '')}`)
      .join('')
    const fecha = hoyART()
    XLSX.writeFile(wb, `Panel_Conductores${sufijoFiltro}_${fecha}.xlsx`)
  }

  const externalFilters = useMemo(() => [
    ...(soloConAuto ? [{ id: 'conAuto', label: CARD_LABELS.conAuto, onClear: () => setSoloConAuto(false) }] : []),
    ...(activeCard ? [{ id: 'statCard', label: CARD_LABELS[activeCard], onClear: () => setActiveCard(null) }] : []),
  ], [soloConAuto, activeCard])

  const columns = useMemo<ColumnDef<ConductorPanelRow, unknown>[]>(() => [
    {
      id: 'conductor',
      // Solo el nombre: así el filtro de columna muestra únicamente nombres. La
      // búsqueda global sigue matcheando por DNI/CUIT porque lee los campos crudos.
      accessorFn: (r) => r.nombre || '',
      header: 'Conductor',
      cell: ({ row }) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary, #111827)', display: 'flex', alignItems: 'center', gap: 6 }}>
            {row.original.nombre || '—'}
            {row.original.nuevoEstaSemana && (
              <span
                title="Conductor nuevo: arrancó esta semana (primera asignación o entró con Carta Oferta)"
                aria-label="Conductor nuevo esta semana"
                style={{ width: 8, height: 8, borderRadius: '50%', background: '#2563eb', flexShrink: 0 }}
              />
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary, #9ca3af)' }}>
            DNI: {row.original.dni || '—'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary, #9ca3af)' }}>
            CUIT: {row.original.ruc || '—'}
          </div>
        </div>
      ),
    },
    {
      id: 'calificacion',
      accessorFn: (r) => calificaciones.get(r.id)?.puntaje ?? -1,
      header: () => {
        const l = lunesSemanaCerrada()
        return <span title={`Última semana cerrada (desde el ${l.slice(8, 10)}/${l.slice(5, 7)}). La semana en curso se ve en el detalle.`}>Calificación</span>
      },
      enableColumnFilter: false,
      sortingFn: (a, b) => (calificaciones.get(a.original.id)?.puntaje ?? -1) - (calificaciones.get(b.original.id)?.puntaje ?? -1),
      cell: ({ row }) => {
        const c = calificaciones.get(row.original.id)
        if (!c) return null
        return <CalificacionCelda calificacion={c} onClick={() => setDetalle({ fila: row.original, tab: 'calificacion' })} />
      },
    },
    {
      // App con la que pagó (Cabify, DiDi o ambas): misma regla que Facturación
      id: 'apps',
      // Header de texto (no función): así el DataTable le pone el filtro de columna
      accessorFn: (r) => (r.apps && r.apps.length ? r.apps.join(' + ') : 'Sin cuenta relacionada'),
      header: 'App',
      meta: { info: 'Cabify: tiene la cuenta relacionada (figura en el histórico de Cabify de las últimas 9 semanas). DiDi: pagó por DiDi la última semana cerrada (todavía no hay API de DiDi); en gris si es la última vez conocida' },
      cell: ({ row }) => {
        const apps = row.original.apps
        if (apps === undefined) return <span className="cpanel-num cpanel-nulo">…</span>
        if (!apps.length) {
          // Sin pagos por Cabify ni DiDi en las últimas semanas: alerta de cuenta no relacionada
          return (
            <span
              title="Sin cuenta relacionada: no figura en el histórico de Cabify ni tiene pagos por DiDi en las últimas 9 semanas"
              style={{ display: 'inline-flex', color: '#D97706' }}
            >
              <AlertTriangle size={15} aria-label="Sin cuenta relacionada" />
            </span>
          )
        }
        // Logos en vez de etiquetas de texto (las etiquetas vienen de etiquetasApps)
        // Si la semana pasada no pagó por app, es la última conocida: AppBadges la pone en gris
        return (
          <AppBadges
            apps={{ cabify: apps.includes('Cabify'), didi: apps.includes('DiDi'), ultimaSemana: row.original.appsUltimaSemana }}
            cabifyPorCuenta
            size="xs"
          />
        )
      },
    },
    {
      // Riesgo de no poder pagar la deuda, con las últimas 4 semanas de facturación
      id: 'riesgo_deuda',
      accessorFn: (r) => {
        const x = riesgos?.get(r.id)
        return x ? NIVEL_RIESGO_LABEL[x.nivel] : 'N/A'
      },
      header: 'Riesgo deuda',
      meta: {
        info: 'Riesgo de no poder pagar, según cómo pagó las últimas semanas cerradas de facturación (hasta 4; los nuevos, con las que tengan). N/A = todavía sin una semana cerrada con pago para evaluar (p. ej. conductor nuevo, con punto azul en el nombre)',
        // Filtro como lista (el id tiene «deuda» y la tabla lo tomaba como monto)
        filterValue: (r: ConductorPanelRow) => {
          const x = riesgos?.get(r.id)
          return x ? NIVEL_RIESGO_LABEL[x.nivel] : 'N/A'
        },
        filterOrder: ['Alto', 'Medio', 'Bajo', 'N/A'],
      },
      sortingFn: (a, b) => {
        const orden = { alto: 3, medio: 2, bajo: 1 }
        const va = riesgos?.get(a.original.id), vb = riesgos?.get(b.original.id)
        return (va ? orden[va.nivel] : 0) - (vb ? orden[vb.nivel] : 0) || (va?.semanasDeuda ?? 0) - (vb?.semanasDeuda ?? 0)
      },
      cell: ({ row }) => {
        if (riesgos === null) return <span className="cpanel-num cpanel-nulo">…</span>
        const x = riesgos.get(row.original.id)
        if (!x) {
          return <span className="cpanel-num cpanel-nulo" title="Todavía sin una semana de facturación cerrada con pago para evaluar">—</span>
        }
        return (
          <span className={`cpanel-badge riesgo-${x.nivel}`} title={textoRiesgo(x)}>
            {NIVEL_RIESGO_LABEL[x.nivel]}
          </span>
        )
      },
    },
    {
      id: 'guia',
      accessorFn: (r) => r.guia || 'Sin capitán',
      header: 'Capitán',
      cell: ({ row }) => row.original.guia
        ? <span>{row.original.guia}</span>
        : <span className="cpanel-num cpanel-nulo">—</span>,
    },
    {
      id: 'patente',
      // Sin patente -> "Sin asignación", para que aparezca como opción en el filtro.
      accessorFn: (r) => r.vehiculoAsignado || 'Sin asignación',
      header: 'Patente',
      // El filtro es Con / Sin asignación (antes listaba cada patente más «Sin asignación»
      // y «Seleccionar todas» traía también a los sin auto). Una patente se busca arriba.
      meta: {
        filterValue: (r: ConductorPanelRow) => (r.vehiculoAsignado ? 'Con asignación' : 'Sin asignación'),
        filterOrder: ['Con asignación', 'Sin asignación'],
      },
      cell: ({ row }) => row.original.vehiculoAsignado
        ? (
          <div>
            <PatenteBadge patente={row.original.vehiculoAsignado} size="sm" />
            {row.original.grupoFlotaAsignado && (
              <div style={{ fontSize: 11, marginTop: 4, color: 'var(--text-tertiary, #9ca3af)' }}>
                {grupoFlotaLabel(row.original.grupoFlotaAsignado)}
              </div>
            )}
          </div>
        )
        : <span className="cpanel-badge noasig">Sin asignación</span>,
    },
    {
      id: 'turno',
      accessorFn: (r) => turnoLabel(r.turno),
      header: 'Turno',
      cell: ({ row }) => !row.original.turno
        ? <span className="cpanel-num">—</span>
        : TURNO_LABELS[row.original.turno]
          ? <TurnoBadge turno={row.original.turno} />
          : <span>{turnoLabel(row.original.turno)}</span>,
    },
    {
      id: 'estado',
      accessorFn: (r) => (r.activo ? 'Activo' : (r.estadoCodigo || 'Inactivo')),
      header: 'Estado',
      cell: ({ row }) => (
        <span className={`cpanel-badge ${row.original.activo ? 'ok' : 'off'}`}>
          {row.original.activo ? 'Activo' : (row.original.estadoCodigo || 'Inactivo')}
        </span>
      ),
    },
    {
      // Categoría de licencia actual: B1, D1 o el detalle de Otros (ej. D2)
      id: 'licencia',
      accessorFn: (r) => etiquetaLicencia(r.categoriaLicencia, r.categoriaLicenciaOtra) || 'Sin cargar',
      header: 'Licencia',
      cell: ({ row }) => (
        <LicenciaBadge categoria={row.original.categoriaLicencia} otra={row.original.categoriaLicenciaOtra} sinDato="—" />
      ),
    },
    // Columnas de conteo con filtro de RANGO (Desde/Hasta). Para que el DataTable las
    // detecte como numéricas, el id usa una palabra numérica ('cantidad_...') y el
    // accessor devuelve el número crudo (el filtro numérico lo lee del accessorFn).
    {
      id: 'cantidad_infracciones',
      accessorFn: (r) => r.cantidadMultas,
      header: 'Multas',
      sortingFn: (a, b) => (a.original.cantidadMultas || 0) - (b.original.cantidadMultas || 0),
      cell: ({ row }) => <span className="cpanel-num">{row.original.cantidadMultas}</span>,
    },
    {
      id: 'cantidad_pendientes',
      accessorFn: (r) => r.pendientes,
      header: 'Pendientes',
      sortingFn: (a, b) => (a.original.pendientes || 0) - (b.original.pendientes || 0),
      cell: ({ row }) => <span className="cpanel-num">{row.original.pendientes}</span>,
    },
    {
      id: 'cantidad_en_proceso',
      accessorFn: (r) => r.enProceso,
      header: 'En Proceso',
      sortingFn: (a, b) => (a.original.enProceso || 0) - (b.original.enProceso || 0),
      cell: ({ row }) => <span className="cpanel-num">{row.original.enProceso}</span>,
    },
    {
      id: 'cantidad_pagadas',
      accessorFn: (r) => r.pagadas,
      header: 'Pagadas',
      sortingFn: (a, b) => (a.original.pagadas || 0) - (b.original.pagadas || 0),
      cell: ({ row }) => <span className="cpanel-num">{row.original.pagadas}</span>,
    },
    {
      id: 'cantidad_vehiculos',
      accessorFn: (r) => r.vehiculos.length,
      header: 'Vehículos',
      sortingFn: (a, b) => a.original.vehiculos.length - b.original.vehiculos.length,
      cell: ({ row }) => <span className="cpanel-num" title={row.original.vehiculos.join(', ')}>{row.original.vehiculos.length}</span>,
    },
    // Columnas de dinero con filtro de RANGO (Desde/Hasta) y prefijo $. El id usa una
    // palabra de dinero ('monto_...') para que el DataTable las trate como money, y el
    // accessor devuelve el número crudo (el filtro numérico lo parsea directo).
    {
      id: 'monto_pendiente',
      accessorFn: (r) => r.montoPendiente,
      header: 'Multas Pendientes',
      sortingFn: (a, b) => (a.original.montoPendiente || 0) - (b.original.montoPendiente || 0),
      cell: ({ row }) => <span className="cpanel-num">{formatPlata(row.original.montoPendiente)}</span>,
    },
    {
      id: 'monto_en_proceso',
      accessorFn: (r) => r.montoEnProceso,
      header: 'Multas En Proceso',
      sortingFn: (a, b) => (a.original.montoEnProceso || 0) - (b.original.montoEnProceso || 0),
      cell: ({ row }) => <span className="cpanel-num">{formatPlata(row.original.montoEnProceso)}</span>,
    },
    {
      id: 'monto_pagado',
      accessorFn: (r) => r.montoPagado,
      header: 'Multas Pagadas',
      sortingFn: (a, b) => (a.original.montoPagado || 0) - (b.original.montoPagado || 0),
      cell: ({ row }) => <span className="cpanel-num">{formatPlata(row.original.montoPagado)}</span>,
    },
    {
      id: 'monto_total',
      accessorFn: (r) => r.montoTotalMultas,
      header: 'Monto Total',
      sortingFn: (a, b) => (a.original.montoTotalMultas || 0) - (b.original.montoTotalMultas || 0),
      cell: ({ row }) => <span className="cpanel-num">{formatPlata(row.original.montoTotalMultas)}</span>,
    },
    // --- Saldo y garantía ---
    // Saldo pendiente = deuda del último movimiento del kardex (control_saldos),
    // el mismo número que muestra la pestaña "Historial de saldo" del detalle.
    // El accessor devuelve la DEUDA en positivo para que el filtro Desde/Hasta sea
    // intuitivo; si el conductor está a favor, se muestra en verde y filtra como 0.
    {
      id: 'monto_saldo_pendiente',
      accessorFn: (r) => r.saldoPendiente,
      header: 'Saldo Pendiente',
      sortingFn: (a, b) => (a.original.saldoPendiente || 0) - (b.original.saldoPendiente || 0),
      cell: ({ row }) => {
        const r = row.original
        if (r.saldoPendiente > 0) {
          return <span className="cpanel-num cpanel-deuda">{formatPlata(r.saldoPendiente)}</span>
        }
        if (r.saldoAFavor > 0) {
          return (
            <span className="cpanel-num cpanel-favor" title="Saldo a favor del conductor">
              {formatPlata(r.saldoAFavor)}
              <small> a favor</small>
            </span>
          )
        }
        return <span className="cpanel-num">{formatPlata(0)}</span>
      },
    },
    {
      id: 'monto_garantia_pagada',
      accessorFn: (r) => r.garantiaPagada,
      header: 'Garantía Pagada',
      sortingFn: (a, b) => (a.original.garantiaPagada || 0) - (b.original.garantiaPagada || 0),
      cell: ({ row }) => {
        const r = row.original
        if (!r.tieneGarantia) return <span className="cpanel-num cpanel-nulo">Sin garantía</span>
        return (
          <span className="cpanel-num">
            {formatPlata(r.garantiaPagada)}
            {r.garantiaTotal > 0 && <small> de {formatPlata(r.garantiaTotal)}</small>}
          </span>
        )
      },
    },
    // Diferencia = saldo pendiente − garantía pagada: cuánto de la deuda queda sin
    // cubrir si se aplica el fondo de garantía. Positivo = todavía debe.
    {
      id: 'monto_saldo_menos_garantia',
      accessorFn: (r) => r.saldoMenosGarantia,
      header: 'Saldo − Garantía',
      sortingFn: (a, b) => (a.original.saldoMenosGarantia || 0) - (b.original.saldoMenosGarantia || 0),
      cell: ({ row }) => {
        const d = row.original.saldoMenosGarantia
        if (d > 0) {
          return (
            <span className="cpanel-num cpanel-deuda" title="La garantía no alcanza a cubrir el saldo pendiente">
              {formatPlata(d)}
              <small> sin cubrir</small>
            </span>
          )
        }
        return (
          <span className="cpanel-num cpanel-favor" title="La garantía cubre el saldo pendiente">
            {formatPlata(d)}
            <small> cubierto</small>
          </span>
        )
      },
    },
    // --- Ingresos Cabify de la semana en curso ---
    // Fuente: cabifyHistoricalService, el MISMO servicio que alimenta el modulo
    // Integraciones > Cabify, para que los importes coincidan entre pantallas.
    // Sin cruce por DNI/licencia/nombre -> '—' (distinto de $ 0,00 real) y el
    // filtro Desde/Hasta los excluye, porque el accessor devuelve null.
    {
      id: 'monto_cabify_ingresos',
      accessorFn: (r) => r.cabify?.gananciaTotal ?? null,
      header: 'Ingresos Cabify',
      sortingFn: (a, b) => (a.original.cabify?.gananciaTotal ?? -1) - (b.original.cabify?.gananciaTotal ?? -1),
      cell: ({ row }) => {
        const c = row.original.cabify
        if (!c) return <span className="cpanel-num cpanel-nulo" title="Sin registros de Cabify vinculados a este conductor">—</span>
        return <span className="cpanel-num" title={`Acumulado de la semana en curso (${rangoCabifyLabel})`}>{formatPlata(c.gananciaTotal)}</span>
      },
    },
    {
      id: 'cantidad_viajes_cabify',
      accessorFn: (r) => r.cabify?.viajesFinalizados ?? null,
      header: 'Viajes Cabify',
      sortingFn: (a, b) => (a.original.cabify?.viajesFinalizados ?? -1) - (b.original.cabify?.viajesFinalizados ?? -1),
      cell: ({ row }) => {
        const c = row.original.cabify
        if (!c) return <span className="cpanel-num cpanel-nulo">—</span>
        return <span className="cpanel-num">{c.viajesFinalizados}</span>
      },
    },
    {
      id: 'monto_cabify_efectivo',
      accessorFn: (r) => r.cabify?.cobroEfectivo ?? null,
      header: 'Efectivo Cabify',
      sortingFn: (a, b) => (a.original.cabify?.cobroEfectivo ?? -1) - (b.original.cabify?.cobroEfectivo ?? -1),
      cell: ({ row }) => {
        const c = row.original.cabify
        if (!c) return <span className="cpanel-num cpanel-nulo">—</span>
        return <span className="cpanel-num">{formatPlata(c.cobroEfectivo)}</span>
      },
    },
    {
      id: 'monto_cabify_app',
      accessorFn: (r) => r.cabify?.cobroApp ?? null,
      header: 'App Cabify',
      sortingFn: (a, b) => (a.original.cabify?.cobroApp ?? -1) - (b.original.cabify?.cobroApp ?? -1),
      cell: ({ row }) => {
        const c = row.original.cabify
        if (!c) return <span className="cpanel-num cpanel-nulo">—</span>
        return <span className="cpanel-num">{formatPlata(c.cobroApp)}</span>
      },
    },
    {
      id: 'monto_cabify_peajes',
      accessorFn: (r) => r.cabify?.peajes ?? null,
      header: 'Peajes Cabify',
      sortingFn: (a, b) => (a.original.cabify?.peajes ?? -1) - (b.original.cabify?.peajes ?? -1),
      cell: ({ row }) => {
        const c = row.original.cabify
        if (!c) return <span className="cpanel-num cpanel-nulo">—</span>
        return <span className="cpanel-num">{formatPlata(c.peajes)}</span>
      },
    },
    {
      id: 'km_cabify_total',
      accessorFn: (r) => r.cabify?.kmTotal ?? null,
      header: 'KM total',
      sortingFn: (a, b) => (a.original.cabify?.kmTotal ?? -1) - (b.original.cabify?.kmTotal ?? -1),
      cell: ({ row }) => {
        const c = row.original.cabify
        if (!c || c.kmTotal === null) return <span className="cpanel-num cpanel-nulo">—</span>
        return <span className="cpanel-num">{fmtKm(c.kmTotal)}</span>
      },
    },
    {
      id: 'km_cabify_asignado',
      accessorFn: (r) => r.cabify?.kmAsignado ?? null,
      header: 'KM-viaje asig',
      sortingFn: (a, b) => (a.original.cabify?.kmAsignado ?? -1) - (b.original.cabify?.kmAsignado ?? -1),
      cell: ({ row }) => {
        const c = row.original.cabify
        if (!c || c.kmAsignado === null) return <span className="cpanel-num cpanel-nulo">—</span>
        return <span className="cpanel-num">{fmtKm(c.kmAsignado)}</span>
      },
    },
    {
      id: 'km_cabify_sin_asignar',
      accessorFn: (r) => r.cabify?.kmSinAsignar ?? null,
      header: 'KM-viaje sin asig',
      sortingFn: (a, b) => (a.original.cabify?.kmSinAsignar ?? -1) - (b.original.cabify?.kmSinAsignar ?? -1),
      cell: ({ row }) => {
        const c = row.original.cabify
        if (!c || c.kmSinAsignar === null) return <span className="cpanel-num cpanel-nulo">—</span>
        return <span className="cpanel-num">{fmtKm(c.kmSinAsignar)}</span>
      },
    },
    {
      id: 'km_geo',
      accessorFn: (r) => r.kmGeo ?? null,
      header: 'KM Geo',
      sortingFn: (a, b) => (a.original.kmGeo ?? -1) - (b.original.kmGeo ?? -1),
      cell: ({ row }) => {
        const v = row.original.kmGeo
        if (v === undefined && kmGeoCargando) {
          return <span className="cpanel-num cpanel-nulo" title="Calculando km de GPS...">…</span>
        }
        if (v === null || v === undefined) {
          return <span className="cpanel-num cpanel-nulo" title="Sin viajes de GPS en la semana">—</span>
        }
        const alerta = tieneAlertaKm(row.original)
        return (
          <span
            className={`cpanel-num${alerta ? ' cpanel-alerta-km' : ''}`}
            title={alerta
              ? `Alerta: el ${Math.round(UMBRAL_KM_PRODUCTIVO * 100)}% de estos km (${Math.round(v * UMBRAL_KM_PRODUCTIVO)} km) supera los km con viaje asignado`
              : `Km recorridos segun GPS (${rangoCabifyLabel}) - mismo dato que la pestaña Km recorridos del modal`}>
            {v.toLocaleString('es-AR')} km
          </span>
        )
      },
    },
    {
      id: 'aprovechamiento_km',
      accessorFn: (r) => aprovechamientoKm(r),
      header: '% Aprovech.',
      sortingFn: (a, b) => (aprovechamientoKm(a.original) ?? -1) - (aprovechamientoKm(b.original) ?? -1),
      cell: ({ row }) => {
        const pct = aprovechamientoKm(row.original)
        if (pct === null) {
          return <span className="cpanel-num cpanel-nulo" title="Falta el dato de GPS o el cruce con Cabify">—</span>
        }
        const alerta = pct < UMBRAL_KM_PRODUCTIVO * 100
        return (
          <span
            className={`cpanel-num${alerta ? ' cpanel-alerta-km' : ''}`}
            title={`${Math.round(pct)}% de los km recorridos fue con viaje asignado (umbral de alerta: ${Math.round(UMBRAL_KM_PRODUCTIVO * 100)}%)`}>
            {formatNumero(pct, 1)}%
          </span>
        )
      },
    },
    {
      id: 'acciones',
      header: 'Acciones',
      enableSorting: false,
      cell: ({ row }) => (
        <ActionsMenu
          actions={[
            { icon: <Eye size={15} />, label: 'Ver detalle', onClick: () => setDetalle({ fila: row.original, tab: 'calificacion' }) },
            {
              icon: <Phone size={15} />,
              label: llamada ? 'Ya hay una llamada en curso' : sinLinea ?? 'Llamar (2Chat)',
              variant: 'success',
              disabled: !!llamada || !!sinLinea,
              onClick: () => {
                const { id, nombre, telefono, telefonoSecundario } = row.original
                const telefonos = telefonosParaLlamar(telefono, telefonoSecundario)
                if (telefonos.length > 1) setEligiendo({ id, nombre, telefonos })
                else setLlamada({ id, nombre, telefono: 'principal' })
              },
            },
            {
              // WhatsApp en 2Chat: abre o inicia la conversación, etiqueta «Conductor»,
              // equipo Clientes y asignada a su capitán
              icon: <MessageCircle size={15} />,
              label: 'Chat (2Chat)',
              variant: 'success',
              onClick: () => setChat({ id: row.original.id, nombre: row.original.nombre }),
            },
          ]}
        />
      ),
    },
  ], [rangoCabifyLabel, calificaciones, kmGeoCargando, llamada, riesgos, sinLinea])

  return (
    <div className="cond-module">
      {/* Stats Cards */}
      <div className="cond-stats">
        <StatsGrid className="cond-stats-grid" storageKey="ConductoresPanelModule">
          <div className={`stat-card stat-card-clickable ${soloConAuto ? 'stat-card-active' : ''}`}
            onClick={() => handleCard('conAuto')} title="Conductores con auto asignado ahora mismo">
            <Car size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.conAuto}</span>
              <span className="stat-label">Con Auto Asignado</span>
            </div>
          </div>
          <div className={`stat-card stat-card-clickable ${activeCard === 'pendientes' ? 'stat-card-active' : ''}`}
            onClick={() => handleCard('pendientes')} title="Conductores con multas pendientes de pago (sin contar las que están en cuotas)">
            <Clock size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.pendientes}</span>
              <span className="stat-label">Con Multas Pendientes</span>
            </div>
          </div>
          <div className={`stat-card stat-card-clickable ${activeCard === 'alertaKm' ? 'stat-card-active' : ''}`}
            onClick={() => handleCard('alertaKm')}
            title={`Conductores donde el ${Math.round(UMBRAL_KM_PRODUCTIVO * 100)}% de los km recorridos (GPS) supera a los km con viaje asignado`}>
            <Gauge size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.alertaKm}</span>
              <span className="stat-label">Bajo Aprovechamiento</span>
            </div>
          </div>
          <div className={`stat-card stat-card-clickable ${activeCard === 'riesgoAlto' ? 'stat-card-active' : ''}`}
            onClick={() => handleCard('riesgoAlto')}
            title="Conductores con auto que deben 1 semana o más y la deuda sube, o que pagaron menos del 90% tres semanas seguidas">
            <TrendingDown size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{riesgos === null ? '…' : stats.riesgoAlto}</span>
              <span className="stat-label">Riesgo de Deuda Alto</span>
            </div>
          </div>
          <div className={`stat-card stat-card-clickable ${activeCard === 'sinCubrir' ? 'stat-card-active' : ''}`}
            onClick={() => handleCard('sinCubrir')}
            title="Conductores que en las 2 últimas semanas cerradas pagaron menos de lo que se les facturó esa semana">
            <Wallet size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{sinCubrir === null ? '…' : stats.sinCubrir}</span>
              <span className="stat-label">No cubrió 2 semanas</span>
            </div>
          </div>
          <div className={`stat-card stat-card-clickable ${activeCard === 'deuda100' ? 'stat-card-active' : ''}`}
            onClick={() => handleCard('deuda100')}
            title="Conductores con Saldo pendiente mayor a $ 100.000">
            <Banknote size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.deuda100}</span>
              <span className="stat-label">Deuda mayor a $ 100.000</span>
            </div>
          </div>
        </StatsGrid>
      </div>

      <DataTable
        data={filteredRows}
        columns={columns}
        loading={loading}
        error={error}
        stickyLeftColumns={3}
        searchPlaceholder="Buscar por nombre o DNI..."
        emptyIcon={<Users size={64} />}
        emptyTitle="No hay conductores para mostrar"
        emptyDescription="Probá quitar el filtro activo o cambiar la sede."
        externalFilters={externalFilters}
        // «Limpiar todos» no apaga «Con Auto Asignado»: eso se hace desde su tarjeta (o su ×)
        onClearAllFilters={() => { setActiveCard(null); setSoloConAuto(true) }}
        onFilteredDataChange={setVisibles}
        headerAction={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              className="btn-secondary"
              onClick={handleExportar}
              disabled={loading || kmGeoCargando || filasAExportar.length === 0}
              title={
                kmGeoCargando
                  ? 'Esperando los km de GPS para exportar completo'
                  : filasAExportar.length === 0
                  ? 'No hay filas para exportar'
                  : `Exporta las ${filasAExportar.length} filas que pasan los filtros actuales`
              }
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Download size={16} />
              Exportar
            </button>
            <button className="btn-secondary" onClick={() => setReloadKey(k => k + 1)} disabled={loading}
              title="Recargar" aria-label="Recargar"
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <RefreshCw size={16} />
            </button>
          </div>
        }
      />

      {detalle && (
        <ConductorDetalleModal
          conductor={detalle.fila}
          onClose={() => setDetalle(null)}
          tabInicial={detalle.tab}
          calificacion={calificacionesEnCurso.get(detalle.fila.id) ?? null}
        />
      )}
      {eligiendo && (
        <ElegirNumeroLlamada
          nombre={eligiendo.nombre}
          telefonos={eligiendo.telefonos}
          onElegir={(tipo) => { setLlamada({ id: eligiendo.id, nombre: eligiendo.nombre, telefono: tipo }); setEligiendo(null) }}
          onClose={() => setEligiendo(null)}
        />
      )}
      {chat && (
        <ChatLeadModal tipo="conductor" leadId={chat.id} nombre={chat.nombre} onClose={() => setChat(null)} />
      )}
      {llamada && (
        <LlamadaConductor
          conductorId={llamada.id}
          nombre={llamada.nombre}
          telefono={llamada.telefono}
          onClose={() => { setLlamada(null); actualizarLinea() }}
        />
      )}
    </div>
  )
}
