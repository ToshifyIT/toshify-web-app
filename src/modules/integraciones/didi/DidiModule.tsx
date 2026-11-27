// src/modules/integraciones/didi/DidiModule.tsx
// Integraciones > APP Viajes > DiDi: lo que hizo cada conductor en DiDi Fleet en la semana
// (lunes a domingo). Misma vista que Integraciones > Cabify: indicadores, buscador con selector
// de semana y tabla con el conductor compacto, patente, viajes, plata y tasas.
//
// DiDi no da kilómetros, score ni datos por día (el Excel es semanal), así que no hay columnas
// de km ni tasa de ocupación, y el selector es solo por semana. A cambio trae cancelados y tasa
// de finalización. Los datos se cargan importando los Excel de DiDi Fleet (ver didiService.ts);
// quien tiene can_edit del submenú importa y vincula conductores.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BarChart3, Car, ChevronLeft, ChevronRight, DollarSign, Link2, TrendingUp, Upload, Users, UserX, X } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { useSede } from '../../../contexts/SedeContext'
import { useAuth } from '../../../contexts/AuthContext'
import { usePermissions } from '../../../contexts/PermissionsContext'
import { confirmar } from '../../../components/ui/alertas'
import { showError, showSuccess, showWarning } from '../../../utils/toast'
import { formatPlata, formatNumero } from '../../../utils/format'
import { hoyART } from '../../../utils/fechaArgentina'
import { rangoSemanaISO, semanaISO, sumarSemanasISO } from '../../../utils/semanaISO'
import { formatNombreCompleto } from '../../../utils/conductorUtils'
import { asignacionesService, findAsignacionEnIndex } from '../../../services/asignacionesService'
import type { AsignacionActiva } from '../../../services/asignacionesService'
import {
  cargarConductoresSede,
  cargarSemanaDidi,
  importarInformeDidi,
  leerInformeDidi,
  vincularConductorDidi,
} from './didiService'
import type { ConductorSede, FilaDidi } from './didiService'
import type { WeekOption } from '../cabify/types/cabify.types'
import { getRateLevel } from '../cabify/utils/cabify.utils'
import { ACCEPTANCE_RATE_THRESHOLDS } from '../cabify/constants/cabify.constants'
import { DataTable } from '../../../components/ui/DataTable/DataTable'
import { StatsGrid } from '../../../components/ui/StatsGrid'
import { PatenteBadge } from '../../../components/ui/PatenteBadge'
import { TurnoBadge } from '../../../components/ui/TurnoBadge'
import { ConductorAutocomplete } from '../../../components/ui/ConductorAutocomplete'
import { WeekCalendarSelector } from '../cabify/components/WeekCalendarSelector'
import '../cabify/CabifyModule.css'
import './DidiModule.css'

const SUBMENU = 'didi'
/** Semanas hacia atrás que se pueden elegir */
const SEMANAS_ATRAS = 52
/** Colores de la tasa de finalización (verde desde 90%, amarillo desde 75%) */
const FINALIZACION_THRESHOLDS = { HIGH: 90, MEDIUM: 75 } as const

/** Fila de la tabla: la de DiDi más lo calculado y la asignación del conductor vinculado */
interface FilaVista extends FilaDidi {
  asig: AsignacionActiva | null
  nombreVista: string
  dni: string | null
  patente: string | null
  porHora: number | null
  rechazados: number | null
  cancelados: number | null
  tasaAcept: number | null
  tasaFinal: number | null
  deducciones: number | null
  activo: boolean
}

type Vista = 'todos' | 'sin_vincular'
type Semana = WeekOption & { semana: number; anio: number }

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/** Semanas elegibles, de la más reciente (weeksAgo 0) a la más vieja, con el formato del selector de Cabify */
function semanasDisponibles(): Semana[] {
  const actual = semanaISO(hoyART())
  const lista: Semana[] = []
  for (let i = 0; i <= SEMANAS_ATRAS; i++) {
    const { semana, anio } = sumarSemanasISO(actual.semana, actual.anio, -i)
    const { inicio, fin } = rangoSemanaISO(semana, anio)
    lista.push({
      weeksAgo: i,
      label: `Semana ${semana} · ${ddmm(inicio)} al ${ddmm(fin)}`,
      startDate: `${inicio}T00:00:00.000Z`,
      endDate: `${fin}T23:59:59.999Z`,
      semana,
      anio,
    })
  }
  return lista
}

function formatHoras(horas: number | null): string | null {
  if (horas === null || horas <= 0) return null
  const h = Math.floor(horas)
  const m = Math.round((horas - h) * 60)
  return m === 60 ? `${h + 1}h 0m` : `${h}h ${m}m`
}

/** Igual que Cabify: grupo de flota de la asignación (44D, CG…) */
function etiquetaFlota(asig: AsignacionActiva | null): string {
  const grupo = asig?.grupoFlota?.trim() || ''
  const upper = grupo.toUpperCase()
  if (upper.includes('44 DREAM')) return '44D'
  if (upper.includes('GRUPO CG')) return 'CG'
  if (grupo) return grupo
  return asig ? 'Sin flota' : 'DiDi'
}

/** Turno del conductor (no la modalidad del auto), igual que Cabify */
function turnoDe(asig: AsignacionActiva | null): 'diurno' | 'nocturno' | 'a_cargo' | null {
  if (!asig) return null
  const t = (asig.turnoEspecifico || '').toLowerCase()
  if (asig.horario === 'todo_dia' || t.includes('cargo') || t === 'todo_dia') return 'a_cargo'
  if (t.includes('noct')) return 'nocturno'
  if (t.includes('diur')) return 'diurno'
  return null
}

const suma = (...v: (number | null)[]) => (v.every(x => x === null) ? null : v.reduce<number>((t, x) => t + (x ?? 0), 0))
const sinDato = <span className="cabify-sin-dato">—</span>

export function DidiModule() {
  const { aplicarFiltroSede, sedeActualId } = useSede()
  const { profile } = useAuth()
  const { canEditInSubmenu, isAdmin } = usePermissions()
  const puedeEditar = isAdmin() || canEditInSubmenu(SUBMENU)
  const usuario = profile?.full_name || 'Usuario'

  const semanas = useMemo(semanasDisponibles, [])
  const [elegida, setElegida] = useState<Semana>(semanas[0])
  const { semana, anio } = elegida

  const [filas, setFilas] = useState<FilaDidi[] | null>([])
  const [conductores, setConductores] = useState<ConductorSede[]>([])
  const [asignaciones, setAsignaciones] = useState<Map<string, AsignacionActiva>>(new Map())
  const [cargando, setCargando] = useState(true)
  const [importando, setImportando] = useState(false)
  const [vista, setVista] = useState<Vista>('todos')
  const [vinculando, setVinculando] = useState<FilaDidi | null>(null)
  const archivoRef = useRef<HTMLInputElement>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      setFilas(await cargarSemanaDidi(anio, semana, aplicarFiltroSede))
    } catch (error) {
      console.error('Error cargando datos de DiDi:', error)
      showError('Error', 'No se pudieron cargar los datos de DiDi')
    } finally {
      setCargando(false)
    }
  }, [anio, semana, aplicarFiltroSede])

  useEffect(() => { void cargar() }, [cargar])

  useEffect(() => {
    cargarConductoresSede(aplicarFiltroSede)
      .then(setConductores)
      .catch(err => console.error('Error cargando conductores para DiDi:', err))
  }, [aplicarFiltroSede])

  // Asignaciones activas: patente, turno y grupo de flota (igual que Cabify)
  useEffect(() => {
    asignacionesService.getAllAsignacionesActivasIndex(sedeActualId)
      .then(setAsignaciones)
      .catch(err => console.error('Error cargando asignaciones para DiDi:', err))
  }, [sedeActualId])

  const importar = async (archivo: File) => {
    if (!sedeActualId) {
      showWarning('Elegí una sede', 'Para importar, elegí la sede de la flota (arriba a la derecha)')
      return
    }
    setImportando(true)
    try {
      const informe = await leerInformeDidi(archivo)
      if (informe.filas.length === 0) throw new Error('El archivo no tiene conductores')
      const nombreInforme = informe.tipo === 'ganancias' ? 'Informe de ganancias' : 'Informe de viaje'
      const ok = await confirmar({
        titulo: `Importar ${nombreInforme}`,
        texto: `${informe.filas.length} conductores en la ${elegida.label}. ` +
          'Si ya había datos de este informe en la semana, se reemplazan.' +
          (informe.faltantes.length ? ` Columnas que no están en el archivo: ${informe.faltantes.join(', ')}.` : ''),
        confirmar: 'Importar',
      })
      if (!ok) return
      const r = await importarInformeDidi({ informe, anio, semana, sedeId: sedeActualId, conductores, usuario })
      showSuccess(`${nombreInforme} importado`, `${r.guardados} conductores${r.sinCruzar ? ` · ${r.sinCruzar} sin vincular` : ''}`)
      await cargar()
    } catch (error) {
      console.error('Error importando informe de DiDi:', error)
      showError('No se pudo importar', (error as Error).message || 'Revisá el archivo')
    } finally {
      setImportando(false)
      if (archivoRef.current) archivoRef.current.value = ''
    }
  }

  // Filas con lo calculado. Las tasas pueden venir como 85 (85%) o como 0,85: si en la
  // semana ninguna pasa de 1, se toman como fracción.
  const lista = useMemo<FilaVista[]>(() => {
    const base = filas || []
    const tasas = base.flatMap(f => [f.tasa_aceptacion, f.tasa_finalizacion]).filter((x): x is number => x !== null)
    const enFraccion = tasas.length > 0 && tasas.every(x => x <= 1)
    const tasa = (v: number | null) => (v === null ? null : enFraccion ? v * 100 : v)
    return base.map(f => {
      const c = f.conductor
      const nombreCompleto = c ? `${c.nombres || ''} ${c.apellidos || ''}`.trim() : ''
      const asig = c ? findAsignacionEnIndex(asignaciones, { dni: c.numero_dni, nombre: nombreCompleto }) ?? null : null
      const horas = f.horas_en_linea
      return {
        ...f,
        asig,
        nombreVista: nombreCompleto ? formatNombreCompleto(nombreCompleto) : f.nombre_didi,
        dni: c?.numero_dni || null,
        patente: asig?.patente || null,
        porHora: f.ganancia_total !== null && horas ? f.ganancia_total / horas : null,
        rechazados: f.viajes_asignados !== null && f.viajes_aceptados !== null
          ? Math.max(f.viajes_asignados - f.viajes_aceptados, 0) : null,
        cancelados: suma(f.cancelados_pasajero, f.cancelados_conductor),
        tasaAcept: tasa(f.tasa_aceptacion),
        tasaFinal: tasa(f.tasa_finalizacion),
        deducciones: suma(f.deduccion_plataforma, f.impuesto),
        // Trabajó en la semana: algún viaje, ganancia o se conectó (horas en línea)
        activo: (f.viajes_finalizados || 0) > 0 || (f.viajes_pagados || 0) > 0 ||
          (f.ganancia_total || 0) > 0 || (f.horas_en_linea || 0) > 0,
      }
    })
  }, [filas, asignaciones])

  // Solo los conductores que trabajaron en la semana (lunes 00:00 a domingo 23:59). El informe de
  // DiDi Fleet trae a toda la flota, también a los que no hicieron nada: esos no se muestran
  // (siguen guardados y aparecen en las semanas en que sí trabajen).
  const activos = useMemo(() => lista.filter(f => f.activo), [lista])

  // Indicadores: los mismos que Cabify, sobre los mismos conductores que la tabla
  const resumen = useMemo(() => {
    const total = activos.reduce((t, f) => t + (f.ganancia_total || 0), 0)
    const viajes = activos.reduce((t, f) => t + (f.viajes_finalizados ?? f.viajes_pagados ?? 0), 0)
    return {
      activos: activos.length,
      total,
      promedio: activos.length ? total / activos.length : 0,
      viajes,
      promedioViajes: activos.length ? viajes / activos.length : 0,
      sinVincular: activos.filter(f => !f.conductor_id).length,
    }
  }, [activos])

  const visibles = useMemo(
    () => (vista === 'sin_vincular' ? activos.filter(f => !f.conductor_id) : activos),
    [activos, vista],
  )

  const ultimaImportacion = useMemo(() => {
    const fechas = lista.flatMap(f => [f.ganancias_importado_en, f.viajes_importado_en]).filter(Boolean) as string[]
    if (!fechas.length) return null
    const ultima = fechas.sort().at(-1)!
    const quien = lista.find(f => f.ganancias_importado_en === ultima || f.viajes_importado_en === ultima)?.importado_por
    const fecha = new Date(ultima).toLocaleString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
    return { fecha, quien }
  }, [lista])

  const columnas = useMemo<ColumnDef<FilaVista, unknown>[]>(() => {
    const plata = (key: keyof FilaVista, header: string, clase?: string, size = 110): ColumnDef<FilaVista, unknown> => ({
      id: String(key),
      header,
      accessorFn: f => (f[key] as number | null) ?? -1,
      cell: ({ row }) => {
        const v = row.original[key] as number | null
        if (!v) return sinDato
        return <span className={clase}>{formatPlata(v)}</span>
      },
      size,
      minSize: size - 15,
    })
    const entero = (key: keyof FilaVista, header: string, clase: string, titulo?: (f: FilaVista) => string): ColumnDef<FilaVista, unknown> => ({
      id: String(key),
      header,
      accessorFn: f => (f[key] as number | null) ?? -1,
      cell: ({ row }) => {
        const v = row.original[key] as number | null
        if (!v) return sinDato
        return <span className={clase} title={titulo?.(row.original)}>{formatNumero(v)}</span>
      },
      size: 110,
      minSize: 90,
    })
    const tasa = (key: 'tasaAcept' | 'tasaFinal', header: string, alto: number, medio: number): ColumnDef<FilaVista, unknown> => ({
      id: key,
      header,
      accessorFn: f => f[key] ?? -1,
      cell: ({ row }) => {
        const v = row.original[key]
        if (v === null) return sinDato
        return <span className={`cabify-rate ${getRateLevel(v, alto, medio)}`}>{formatNumero(v, 2)}%</span>
      },
      size: 100,
      minSize: 85,
    })

    return [
      {
        id: 'conductor',
        header: 'Conductor',
        accessorFn: f => `${f.nombreVista} ${f.nombre_didi} ${f.dni || ''} ${f.patente || ''}`,
        cell: ({ row }) => {
          const f = row.original
          const turno = turnoDe(f.asig)
          return (
            <div className="cabify-driver-compact" title={`En DiDi: ${f.nombre_didi}`}>
              <div className="cabify-driver-compact-top">
                <span className="cabify-driver-compact-name">{f.nombreVista}</span>
              </div>
              {f.conductor_id ? (
                <div className="cabify-driver-compact-meta">
                  <span className="cabify-driver-compact-dni">{f.dni || '-'}</span>
                  <span className="dt-badge cabify-source-badge buenos-aires">{etiquetaFlota(f.asig)}</span>
                  {turno ? (
                    <span style={{ fontSize: '11px' }}><TurnoBadge turno={turno} /></span>
                  ) : (
                    <span className="dt-badge dt-badge-gray" style={{ fontSize: '10px', padding: '1px 5px' }}>
                      {f.asig ? 'TURNO' : 'S/A'}
                    </span>
                  )}
                </div>
              ) : (
                <div className="cabify-driver-compact-meta didi-sin-vincular">
                  Sin vincular
                  {puedeEditar && (
                    <button type="button" className="didi-link" onClick={e => { e.stopPropagation(); setVinculando(f) }}>
                      <Link2 size={12} /> Vincular
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        },
        size: 240,
        minSize: 200,
      },
      {
        id: 'patente',
        header: 'Patente',
        accessorFn: f => f.patente || '-',
        cell: ({ row }) => <PatenteBadge patente={row.original.patente} size="sm" />,
        size: 90,
        minSize: 80,
      },
      entero('viajes_finalizados', 'V. Finalizados', 'cabify-trips-completed'),
      plata('ganancia_total', 'Total', 'cabify-money total', 120),
      plata('porHora', '$/Hora', 'cabify-money per-hour', 120),
      entero('rechazados', 'V. Rechazados', 'cabify-trips-rejected', f =>
        `Asignados ${f.viajes_asignados ?? '-'} − aceptados ${f.viajes_aceptados ?? '-'}`),
      entero('cancelados', 'V. Cancelados', 'cabify-trips-lost', f =>
        `Por el pasajero ${f.cancelados_pasajero ?? '-'} · por el conductor ${f.cancelados_conductor ?? '-'}`),
      tasa('tasaAcept', 'Tasa Acept.', ACCEPTANCE_RATE_THRESHOLDS.HIGH, ACCEPTANCE_RATE_THRESHOLDS.MEDIUM),
      tasa('tasaFinal', 'Tasa Final.', FINALIZACION_THRESHOLDS.HIGH, FINALIZACION_THRESHOLDS.MEDIUM),
      {
        id: 'horas',
        header: 'Horas',
        accessorFn: f => f.horas_en_linea ?? -1,
        cell: ({ row }) => {
          const t = formatHoras(row.original.horas_en_linea)
          return t ? <span className="cabify-hours">{t}</span> : sinDato
        },
        size: 75,
        minSize: 65,
      },
      plata('ganancia_efectivo', 'Efectivo'),
      plata('ganancia_tarjeta', 'App'),
      plata('cargo_tag', 'Peajes', 'cabify-money tolls', 100),
      plata('recompensas', 'Promociones', 'cabify-money promos', 115),
      {
        id: 'deducciones',
        header: 'Deducciones',
        accessorFn: f => f.deducciones ?? -1,
        cell: ({ row }) => {
          const f = row.original
          if (!f.deducciones) return sinDato
          return (
            <span
              className="cabify-money deductions"
              style={{ color: '#dc2626' }}
              title={`Deducción de la plataforma ${formatPlata(f.deduccion_plataforma ?? 0)} · impuesto ${formatPlata(f.impuesto ?? 0)}`}
            >
              {formatPlata(-Math.abs(f.deducciones))}
            </span>
          )
        },
        size: 115,
        minSize: 95,
      },
      {
        id: 'email',
        header: 'Email',
        accessorFn: f => f.conductor?.email || '',
        cell: ({ row }) => row.original.conductor?.email || sinDato,
        size: 200,
        minSize: 150,
      },
    ]
  }, [puedeEditar])

  // Como en Cabify: la semana y "sin vincular" aparecen en Filtros activos cuando no son lo por defecto
  const filtrosExternos = useMemo(() => {
    const activos: { id: string; label: string; onClear: () => void }[] = []
    if (elegida.weeksAgo !== 0) {
      activos.push({ id: 'periodo', label: `Período: ${elegida.label}`, onClear: () => setElegida(semanas[0]) })
    }
    if (vista === 'sin_vincular') activos.push({ id: 'vista', label: 'Sin vincular', onClear: () => setVista('todos') })
    return activos
  }, [elegida, semanas, vista])

  const cambiarSemana = (w: WeekOption) => {
    const s = semanas.find(x => x.startDate.slice(0, 10) === w.startDate.slice(0, 10))
    if (s) { setElegida(s); setVista('todos') }
  }
  const indice = semanas.indexOf(elegida)
  const anterior = semanas[indice + 1]
  const siguiente = indice > 0 ? semanas[indice - 1] : undefined

  const opcionesConductor = useMemo(() => conductores.map(c => ({
    value: c.id,
    label: formatNombreCompleto(`${c.nombres || ''} ${c.apellidos || ''}`.trim()),
    subtitle: c.numero_dni ? `DNI ${c.numero_dni}` : undefined,
    searchText: c.numero_dni || '',
  })), [conductores])

  const tarjetas = [
    { label: 'Conductores Activos', valor: resumen.activos, icono: Users },
    { label: 'Total Recaudado', valor: formatPlata(resumen.total), icono: DollarSign },
    { label: 'Promedio por Conductor', valor: formatPlata(resumen.promedio), icono: TrendingUp },
    { label: 'Total Viajes', valor: resumen.viajes.toLocaleString('es-AR'), icono: Car },
    { label: 'Promedio Viajes/Conductor', valor: formatNumero(resumen.promedioViajes, 1), icono: BarChart3 },
  ]

  const encabezado = (
    <div className="cabify-header cabify-header-inline">
      <div className="cabify-controls">
        <div className="cabify-semana-nav" role="group" aria-label="Cambiar de semana">
          <button
            type="button"
            className="cabify-semana-flecha"
            onClick={() => anterior && cambiarSemana(anterior)}
            disabled={importando || !anterior}
            aria-label="Semana anterior"
            title={anterior ? `Semana anterior (${anterior.label})` : 'No hay semanas anteriores'}
          >
            <ChevronLeft size={18} />
          </button>
          <WeekCalendarSelector
            selectedWeek={elegida}
            availableWeeks={semanas}
            isDisabled={importando}
            onWeekChange={cambiarSemana}
            soloSemanas
          />
          <button
            type="button"
            className="cabify-semana-flecha"
            onClick={() => siguiente && cambiarSemana(siguiente)}
            disabled={importando || !siguiente}
            aria-label="Semana siguiente"
            title={siguiente ? `Semana siguiente (${siguiente.label})` : 'Es la semana más reciente'}
          >
            <ChevronRight size={18} />
          </button>
          <span className="cabify-semana-rango">
            {ddmm(elegida.startDate)} – {ddmm(elegida.endDate)}
            {elegida.weeksAgo === 0 ? ' · en curso' : ''}
          </span>
          {elegida.weeksAgo !== 0 && (
            <button type="button" className="cabify-semana-hoy" onClick={() => cambiarSemana(semanas[0])} disabled={importando}>
              Ir a la actual
            </button>
          )}
        </div>
        {puedeEditar && (
          <>
            <input
              ref={archivoRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) void importar(f) }}
            />
            <button
              type="button"
              className="btn-primary didi-importar"
              onClick={() => archivoRef.current?.click()}
              disabled={importando}
              title="Excel del Informe de ganancias o del Informe de viaje de DiDi Fleet, de la semana elegida"
            >
              <Upload size={15} /> {importando ? 'Importando...' : 'Importar informe'}
            </button>
          </>
        )}
      </div>
      {ultimaImportacion && (
        <span
          className="cabify-last-update-compact"
          title={`Última importación: ${ultimaImportacion.fecha}${ultimaImportacion.quien ? ` · ${ultimaImportacion.quien}` : ''}`}
        >
          Importado {ultimaImportacion.fecha}
        </span>
      )}
    </div>
  )

  return (
    <div className="cabify-module didi-module">
      <div className="cabify-stats">
        <StatsGrid className="cabify-stats-grid" storageKey="DidiModule">
          {tarjetas.map(t => {
            const Icono = t.icono
            return (
              <div key={t.label} className="stat-card">
                <Icono size={18} className="stat-icon" />
                <div className="stat-content">
                  <span className="stat-value">{t.valor}</span>
                  <span className="stat-label">{t.label}</span>
                </div>
              </div>
            )
          })}
          {resumen.sinVincular > 0 && (
            <div
              className={`stat-card ${vista === 'sin_vincular' ? 'active' : ''}`}
              onClick={() => setVista(vista === 'sin_vincular' ? 'todos' : 'sin_vincular')}
              style={{ cursor: 'pointer' }}
              title="Conductores de DiDi que no se reconocieron por nombre: vinculalos para ver su DNI, patente y turno"
            >
              <UserX size={18} className="stat-icon" />
              <div className="stat-content">
                <span className="stat-value">{resumen.sinVincular}</span>
                <span className="stat-label">Sin vincular</span>
              </div>
            </div>
          )}
        </StatsGrid>
      </div>

      {filas === null ? (
        <div className="didi-vacio">Falta crear las tablas en la base (sql/didi_integracion.sql).</div>
      ) : (
        <div className="cabify-table-container">
          <DataTable
            data={visibles}
            columns={columnas}
            loading={cargando}
            searchPlaceholder="Buscar conductor por nombre, DNI, patente..."
            emptyIcon={<Car size={48} />}
            emptyTitle={vista === 'sin_vincular' ? 'Todos los conductores están vinculados' : 'Sin datos de DiDi en esta semana'}
            emptyDescription={vista === 'todos'
              ? 'Importá el Informe de ganancias y el Informe de viaje de DiDi Fleet de esta semana (botón «Importar informe»).'
              : ''}
            pageSize={100}
            pageSizeOptions={[10, 20, 50, 100]}
            stickyLeftColumns={2}
            externalFilters={filtrosExternos}
            resetFiltersKey={`${anio}-${semana}-${vista}`}
            headerAction={encabezado}
          />
        </div>
      )}

      {vinculando && (
        <VincularModal
          fila={vinculando}
          opciones={opcionesConductor}
          onCerrar={() => setVinculando(null)}
          onGuardar={async conductorId => {
            await vincularConductorDidi({ nombreNorm: vinculando.nombre_norm, nombreDidi: vinculando.nombre_didi, conductorId, usuario })
            setVinculando(null)
            showSuccess('Conductor vinculado', 'Se aplicó a todas sus semanas de DiDi')
            await cargar()
          }}
        />
      )}
    </div>
  )
}

function VincularModal({ fila, opciones, onCerrar, onGuardar }: {
  fila: FilaDidi
  opciones: { value: string; label: string; subtitle?: string; searchText?: string }[]
  onCerrar: () => void
  onGuardar: (conductorId: string) => Promise<void>
}) {
  const [conductorId, setConductorId] = useState('')
  const [guardando, setGuardando] = useState(false)
  const guardar = async () => {
    if (!conductorId) return
    setGuardando(true)
    try {
      await onGuardar(conductorId)
    } catch (error) {
      console.error('Error vinculando conductor de DiDi:', error)
      showError('No se pudo vincular', (error as Error).message || 'Intente nuevamente')
      setGuardando(false)
    }
  }
  return (
    <div className="modal-overlay" onClick={() => !guardando && onCerrar()}>
      <div className="modal-content" style={{ maxWidth: '460px', overflow: 'visible' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Vincular conductor de DiDi</h2>
          <button className="modal-close" onClick={onCerrar} disabled={guardando}><X size={20} /></button>
        </div>
        <div className="modal-body" style={{ overflow: 'visible' }}>
          <p className="didi-sub" style={{ marginTop: 0 }}>
            En DiDi figura como <strong>{fila.nombre_didi}</strong>. Elegí a qué conductor de Toshify corresponde:
            queda guardado para esta y las próximas semanas.
          </p>
          <ConductorAutocomplete
            value={conductorId}
            onChange={setConductorId}
            options={opciones}
            placeholder="Buscar por nombre o DNI..."
            inputClassName="form-input"
          />
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onCerrar} disabled={guardando}>Cancelar</button>
          <button className="btn-primary" onClick={() => void guardar()} disabled={!conductorId || guardando}>
            {guardando ? 'Guardando...' : 'Vincular'}
          </button>
        </div>
      </div>
    </div>
  )
}
