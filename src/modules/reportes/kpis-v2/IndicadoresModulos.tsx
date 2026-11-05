// src/modules/reportes/kpis-v2/IndicadoresModulos.tsx
// Vista general por módulo, sin entrar a cada módulo. Cada pestaña muestra
// pocos números y el enlace al módulo. Lo que depende del tiempo se compara
// contra el período anterior (semana o mes, según lo elegido arriba).
// - Conductores: altas, bajas, neto, licencias, deuda y multas; motivos de baja por
//   tema y conductores con más multas.
// - Ventas: embudo del período (get_dashboard_marketing, como Dashboard Marketing).
// - Conductores (título «Agentes») también muestra los turnos que quedaron libres (por bajas
//   y autos nuevos) y los autos por llenar de cada agente (hoy).
// - Vehículos: estado de la flota hoy (misma clasificación que el módulo Vehículos).
// (2026-10-28: se quitaron por ahora Multas y km, Siniestros y Garantías y deuda.)
// Todo se pide una vez al abrir la pantalla y queda en memoria unos minutos.
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Eye } from 'lucide-react'
import type { Diferencia, Motivo, Periodo } from './kpisV2Types'
import type { MarketingRaw } from '../marketing/marketingTypes'
import type {
  AltasBajasGuia, GuiasConductores, IndicadoresConductores, IndicadoresMultas, IndicadoresTurnos, IndicadoresVehiculos,
  Llenado, MovimientoConductor, Rango, Ranking, VehiculosPorLlenar,
} from './indicadoresModulosService'
import { supabase } from '../../../lib/supabase'
import { useSede } from '../../../contexts/SedeContext'
import { GUIAS_ACTIVOS } from '../../leads/guias'
import { embudoDe } from '../marketing/marketingTypes'
import { DetalleBajasModal } from './DetalleBajasModal'
import { DetalleHabilitadosModal } from './DetalleHabilitadosModal'
import {
  armarFiltroGuia, cargarAltasBajasGuia, cargarConductores, cargarGuiasConductores, cargarMultas, cargarTurnosGenerados,
  cargarLlenados, cargarVehiculos, cargarVehiculosPorLlenar,
} from './indicadoresModulosService'
import {
  INICIO_DATOS, difPuntos, difRelativa, difUnidades, fechaCorta, fmtInt, fmtMonedaCorta, fmtPct, resumenMotivos, sumarDias,
} from './kpisV2Types'

type Pestana = 'conductores' | 'ventas' | 'vehiculos'

const PESTANAS: { id: Pestana; label: string }[] = [
  { id: 'conductores', label: 'Agentes' },
  { id: 'ventas', label: 'Ventas' },
  { id: 'vehiculos', label: 'Vehículos' },
]

interface Dato {
  label: string
  value: string
  detalle?: string
  dif?: Diferencia | null
  /** Si viene, muestra "Ver detalle" en la tarjeta. */
  onVerDetalle?: () => void
}

/** Para indicadores donde subir es malo (bajas, multas, deuda…). */
function alReves(d: Diferencia | null): Diferencia | null {
  if (!d || d.tono === 'neutro') return d
  return { ...d, tono: d.tono === 'bueno' ? 'malo' : 'bueno' }
}

const LUGARES = 5

/** Mismo alto en todas las pestañas (y mientras carga). */
function Cuerpo({ children }: { children: ReactNode }) {
  return <div className="dkv2-mod-cuerpo">{children}</div>
}

function Tarjetas({ datos }: { datos: Dato[] }) {
  return (
    <div className="dkv2-mod-grid">
      {datos.map(d => (
        <div key={d.label} className="dkv2-mod-dato">
          <span className="dkv2-kpi-label">{d.label}</span>
          <span className="dkv2-mod-fila">
            <span className="dkv2-mod-valor">{d.value}</span>
            {d.dif ? <span className={`dkv2-dif dkv2-dif--${d.dif.tono}`}>{d.dif.texto} vs anterior</span> : null}
          </span>
          {d.detalle ? <span className="dkv2-mod-detalle">{d.detalle}</span> : null}
          {d.onVerDetalle ? (
            <button type="button" className="dkv2-ver-detalle dkv2-mod-ver-detalle" onClick={d.onVerDetalle}>
              <Eye size={14} /> Ver detalle
            </button>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function Pie({ nota, ruta }: { nota: string; ruta: string }) {
  return (
    <div className="dkv2-mod-pie">
      <span className="dkv2-muted">{nota}</span>
      <Link to={ruta} className="dkv2-link dkv2-mod-ir">
        Ir al módulo <ArrowRight size={13} />
      </Link>
    </div>
  )
}

function Datos({ datos, ruta, nota }: { datos: Dato[]; ruta: string; nota: string }) {
  return (
    <Cuerpo>
      <Tarjetas datos={datos} />
      <Pie nota={nota} ruta={ruta} />
    </Cuerpo>
  )
}

function Cargando() {
  return (
    <Cuerpo>
      <div className="dkv2-mod-grid">
        {Array.from({ length: LUGARES }, (_, i) => (
          <div key={i} className="dkv2-mod-dato dkv2-mod-dato--cargando" aria-hidden="true">
            <span className="dkv2-mod-skel dkv2-mod-skel--label" />
            <span className="dkv2-mod-skel dkv2-mod-skel--valor" />
          </div>
        ))}
      </div>
      <div className="dkv2-mod-pie"><span className="dkv2-muted">Cargando…</span></div>
    </Cuerpo>
  )
}

function Aviso({ texto }: { texto: string }) {
  return (
    <Cuerpo>
      <p className="dkv2-mod-aviso">{texto}</p>
    </Cuerpo>
  )
}

// ───────────── Carga con memoria ─────────────
// Guarda lo ya consultado (por sede y fechas) para no volver a pedirlo al
// cambiar de pestaña o volver a un período ya visto.

const TTL = 10 * 60 * 1000
const cache = new Map<string, { data: unknown; t: number }>()

interface Carga<T> { data: T | null; error: string | null; cargando: boolean }

function useCarga<T>(clave: string, cargar: () => Promise<T>, mensajeError: string): Carga<T> {
  const enCache = cache.get(clave)
  const vigente = enCache && Date.now() - enCache.t < TTL ? (enCache.data as T) : null
  const [estado, setEstado] = useState<{ clave: string; data: T | null; error: string | null }>({
    clave: vigente ? clave : '', data: vigente, error: null,
  })

  useEffect(() => {
    if (vigente) return
    let activo = true
    cargar()
      .then(data => {
        cache.set(clave, { data, t: Date.now() })
        if (activo) setEstado({ clave, data, error: null })
      })
      .catch(err => {
        console.error(`[DashboardKpisV2] ${mensajeError}`, err)
        if (activo) setEstado({ clave, data: null, error: mensajeError })
      })
    return () => {
      activo = false
    }
    // `cargar` cambia en cada render; la clave ya identifica la consulta
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, vigente])

  if (vigente) return { data: vigente, error: null, cargando: false }
  const listo = estado.clave === clave
  return { data: listo ? estado.data : null, error: listo ? estado.error : null, cargando: !listo }
}

function usarCarga<T>(carga: Carga<T>, render: (data: T) => ReactNode): ReactNode {
  if (carga.cargando) return <Cargando />
  if (carga.error || carga.data === null) return <Aviso texto={carga.error ?? 'Sin datos.'} />
  return render(carga.data)
}

// ───────────── Conductores ─────────────

function ListaMotivos({ titulo, subtitulo, motivos, onVerDetalle }: {
  titulo: string
  subtitulo: string
  motivos: Motivo[]
  /** Si viene, muestra el ojito para ver quiénes se fueron y su motivo. */
  onVerDetalle?: () => void
}) {
  const max = Math.max(1, ...motivos.map(m => m.cantidad))
  const total = motivos.reduce((s, m) => s + m.cantidad, 0)
  return (
    <div className="dkv2-motivos-panel">
      <h3 className="dkv2-motivos-titulo">
        {titulo} <span className="dkv2-muted">· {subtitulo} · {total} {total === 1 ? 'baja' : 'bajas'}</span>
        {onVerDetalle && total > 0 ? (
          <button type="button" className="dkv2-ver-detalle" onClick={onVerDetalle} title="Ver quiénes se fueron y el motivo">
            <Eye size={14} /> Ver detalle
          </button>
        ) : null}
      </h3>
      {motivos.length ? (
        <ul className="dkv2-motivos">
          {motivos.map(m => (
            <li key={m.motivo}>
              <span className="dkv2-motivo-texto" title={m.motivo}>{m.motivo}</span>
              <span className="dkv2-motivo-barra" aria-hidden="true">
                <span style={{ width: `${(m.cantidad / max) * 100}%` }} />
              </span>
              <span className="dkv2-motivo-n">
                {m.cantidad}
                <span className="dkv2-muted"> · {Math.round((m.cantidad / total) * 100)}%</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="dkv2-card-subtitle">No hubo bajas.</p>
      )}
    </div>
  )
}

function ListaRanking({ titulo, unidad, filas }: { titulo: string; unidad: string; filas: Ranking[] }) {
  const max = Math.max(1, ...filas.map(f => f.cantidad))
  return (
    <div className="dkv2-motivos-panel">
      <h3 className="dkv2-motivos-titulo">{titulo}</h3>
      {filas.length ? (
        <ul className="dkv2-motivos dkv2-ranking">
          {filas.map(f => (
            <li key={f.nombre}>
              <span className="dkv2-motivo-texto" title={f.nombre}>{f.nombre}</span>
              <span className="dkv2-motivo-barra" aria-hidden="true">
                <span style={{ width: `${(f.cantidad / max) * 100}%` }} />
              </span>
              <span className="dkv2-motivo-n">
                {fmtInt(f.cantidad)} {unidad}
                <span className="dkv2-muted"> · {f.detalle}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="dkv2-card-subtitle">Sin registros en el período.</p>
      )}
    </div>
  )
}

/** Selector del guía (agente de ventas) que onboardeó a los conductores. */
function SelectorGuia({ guia, opciones, onChange }: { guia: string; opciones: string[] | null; onChange: (g: string) => void }) {
  return (
    <select
      className="dkv2-periodo-select"
      value={guia}
      onChange={e => onChange(e.target.value)}
      disabled={!opciones}
      aria-label="Filtrar por agente"
      title="Agente (guía) que onboardeó a los conductores y responsable de llenar los autos"
    >
      <option value="">Todos los agentes</option>
      {(opciones ?? []).map(g => <option key={g} value={g}>{g}</option>)}
    </select>
  )
}

/** Altas, bajas y motivos de un período contados solo con los conductores del guía. */
function conductoresDeGuia(datos: AltasBajasGuia, p: Periodo) {
  const enPeriodo = (x: MovimientoConductor) => x.f >= p.inicio && x.f <= p.fin
  const bajas = datos.bajas.filter(enPeriodo)
  return {
    altas: datos.altas.filter(enPeriodo).length,
    bajas: bajas.length,
    motivos: resumenMotivos(bajas.map(b => ({ f: b.f, m: b.m }))),
  }
}

/** "Ali 5 · Carla 4 · Eunice 6": autos por llenar de cada agente, por primer nombre. */
function porLlenarPorAgente(v: VehiculosPorLlenar): string {
  return [...v.porAgente.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'es'))
    .map(([agente, x]) => `${agente.trim().split(/\s+/)[0]} ${fmtInt(x.vehiculos)}`)
    .join(' · ')
}

const nfDias = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** Promedio de días para llenar los turnos de un período (y de un agente, si viene). */
function promedioLlenado(llenados: Llenado[], p: { inicio: string; fin: string }, agente?: string): { dias: number; n: number } | null {
  const lista = llenados.filter(l => l.dia >= p.inicio && l.dia <= p.fin && (!agente || l.guiaResponsable === agente))
  if (lista.length === 0) return null
  return { dias: lista.reduce((s, l) => s + l.dias, 0) / lista.length, n: lista.length }
}

/** Diferencia en días donde bajar es bueno: "−1,2 días". */
function difDias(real: number | null, ref: number | null): Diferencia | null {
  if (real === null || ref === null) return null
  const dif = real - ref
  if (Math.abs(dif) < 0.05) return { texto: '0,0 días', tono: 'neutro' }
  return { texto: `${dif > 0 ? '+' : '−'}${nfDias.format(Math.abs(dif))} días`, tono: dif < 0 ? 'bueno' : 'malo' }
}

function Conductores({ periodo, anterior, general, carga, multas, turnos, guia, altasBajas, porLlenar, llenados }: {
  periodo: Periodo
  anterior: Periodo | null
  general: Motivo[]
  carga: Carga<IndicadoresConductores>
  multas: Carga<IndicadoresMultas>
  turnos: Carga<IndicadoresTurnos>
  /** Guía elegido ('' = todos) y sus altas/bajas una por una. */
  guia: string
  altasBajas: Carga<AltasBajasGuia | null>
  /** Autos con turnos sin conductor hoy, por agente responsable */
  porLlenar: Carga<VehiculosPorLlenar>
  /** Turnos que se llenaron y cuántos días estuvieron libres antes */
  llenados: Carga<Llenado[]>
}) {
  const ll = llenados.data
  const llActual = ll ? promedioLlenado(ll, periodo, guia || undefined) : null
  const llAnterior = ll && anterior ? promedioLlenado(ll, anterior, guia || undefined) : null
  const llPorAgente = ll && !guia
    ? GUIAS_ACTIVOS
      .map(a => ({ a, r: promedioLlenado(ll, periodo, a) }))
      .filter(x => x.r)
      .map(x => `${x.a.split(/\s+/)[0]} ${nfDias.format(x.r!.dias)}`)
      .join(' · ')
    : ''
  const pl = porLlenar.data
  const plAgente = pl ? (guia ? pl.porAgente.get(guia) ?? { vehiculos: 0, turnosD: 0, turnosN: 0 } : pl.total) : null
  const m = multas.data
  const t = turnos.data
  const sinDato = turnos.error ? '—' : '…'
  const detalleBajas = t
    ? [
        t.actual.bajasDiurno ? `${fmtInt(t.actual.bajasDiurno)} D` : '',
        t.actual.bajasNocturno ? `${fmtInt(t.actual.bajasNocturno)} N` : '',
        t.actual.bajasACargo ? `${fmtInt(t.actual.bajasACargo)} ${t.actual.bajasACargo === 1 ? 'auto' : 'autos'} a cargo (2 c/u)` : '',
      ].filter(Boolean).join(' · ') || 'Sin bajas con auto en el período'
    : undefined
  const [verBajas, setVerBajas] = useState(false)
  const [verHabilitados, setVerHabilitados] = useState(false)
  // Con guía elegido, altas/bajas/motivos salen de sus conductores; si no, del dashboard
  const ab = guia ? altasBajas.data : null
  const pendienteGuia = !!guia && !ab
  // Si falló (p. ej. falta correr sql/kpi_altas_conductores.sql) se muestra "—", no "…" eterno
  const errorGuia = pendienteGuia && !!altasBajas.error
  const sinValor = errorGuia ? '—' : '…'
  const c = ab ? conductoresDeGuia(ab, periodo) : periodo.conductores
  const a = ab ? (anterior ? conductoresDeGuia(ab, anterior) : null) : anterior?.conductores ?? null
  const motivosGeneral = ab ? resumenMotivos(ab.bajas.map(b => ({ f: b.f, m: b.m }))) : general
  const neto = c.altas - c.bajas
  const extra = carga.data
  const datos: Dato[] = [
    {
      label: 'ALTAS',
      value: pendienteGuia ? sinValor : fmtInt(c.altas),
      dif: pendienteGuia ? null : difUnidades(c.altas, a?.altas ?? null),
      detalle: errorGuia ? 'No se pudieron cargar las altas del guía' : 'Primer turno en el período',
    },
    { label: 'BAJAS', value: pendienteGuia ? sinValor : fmtInt(c.bajas), dif: pendienteGuia ? null : alReves(difUnidades(c.bajas, a?.bajas ?? null)) },
    {
      label: 'CRECIMIENTO NETO',
      value: pendienteGuia ? sinValor : `${neto > 0 ? '+' : ''}${fmtInt(neto)}`,
      dif: a ? difUnidades(neto, a.altas - a.bajas) : null,
    },
    {
      label: 'LICENCIAS',
      value: extra ? fmtInt(extra.licenciasVencidas) : '…',
      detalle: extra ? `vencidas · ${fmtInt(extra.licenciasPorVencer)} vencen en 30 días` : 'Conductores activos',
    },
    {
      label: 'MULTAS',
      value: m ? fmtInt(m.actual.cantidad) : multas.error ? '—' : '…',
      dif: m ? alReves(difUnidades(m.actual.cantidad, m.anterior.cantidad)) : null,
      detalle: m ? `${fmtMonedaCorta(m.actual.monto)} · cargadas en el período` : undefined,
    },
    {
      label: 'CONDUCTORES CON MULTAS',
      value: m ? fmtInt(m.actual.conductores) : multas.error ? '—' : '…',
      detalle: m && m.actual.conductores
        ? `${(m.actual.cantidad / m.actual.conductores).toLocaleString('es-AR', { maximumFractionDigits: 1 })} multas por conductor`
        : undefined,
    },
    {
      label: 'TURNOS LIBERADOS POR BAJAS',
      value: t ? fmtInt(t.actual.porBajas) : sinDato,
      dif: t ? alReves(difUnidades(t.actual.porBajas, t.anterior.porBajas)) : null,
      detalle: detalleBajas,
    },
    {
      // Autos que se sumaron a la flota operativa: nuevos o que volvieron (taller,
      // robo, PKG OFF... -> PKG ON / En uso). 2 turnos cada uno.
      label: 'TURNOS POR VEHÍCULOS HABILITADOS',
      value: t ? fmtInt(t.actual.porVehiculosNuevos) : sinDato,
      dif: t ? difUnidades(t.actual.porVehiculosNuevos, t.anterior.porVehiculosNuevos) : null,
      detalle: t && guia
        ? 'Toda la flota: no depende del guía'
        : t
        ? [
            `${fmtInt(t.actual.vehiculosNuevos)} ${t.actual.vehiculosNuevos === 1 ? 'nuevo' : 'nuevos'}`,
            t.conReincorporados
              ? `${fmtInt(t.actual.vehiculosReincorporados)} ${t.actual.vehiculosReincorporados === 1 ? 'volvió' : 'volvieron'} a operar`
              : '',
            `${fmtInt(t.actual.nuevosYaAsignados)} ya asignados`,
          ].filter(Boolean).join(' · ')
        : undefined,
      onVerDetalle: t && t.actual.vehiculosNuevos + t.actual.vehiculosReincorporados > 0
        ? () => setVerHabilitados(true)
        : undefined,
    },
    {
      // Promedio de días que estuvo libre cada turno que se llenó en el período
      label: 'DÍAS PARA LLENAR UN TURNO',
      value: llActual ? nfDias.format(llActual.dias) : ll ? '-' : llenados.error ? '—' : '…',
      dif: llActual ? difDias(llActual.dias, llAnterior?.dias ?? null) : null,
      detalle: ll
        ? llActual
          ? [`promedio de ${fmtInt(llActual.n)} ${llActual.n === 1 ? 'turno llenado' : 'turnos llenados'}`, llPorAgente].filter(Boolean).join(' · ')
          : 'No se llenaron turnos en el período'
        : undefined,
    },
    {
      // Hoy: autos con al menos un turno sin conductor, del agente responsable de llenarlos
      label: 'VEHÍCULOS POR LLENAR',
      value: plAgente ? fmtInt(plAgente.vehiculos) : porLlenar.error ? '—' : '…',
      detalle: pl && plAgente
        ? [
            `${fmtInt(plAgente.turnosD + plAgente.turnosN)} turnos libres (${fmtInt(plAgente.turnosD)} D · ${fmtInt(plAgente.turnosN)} N)`,
            guia ? 'hoy' : porLlenarPorAgente(pl),
          ].filter(Boolean).join(' · ')
        : undefined,
    },
  ]
  return (
    <Cuerpo>
      <Tarjetas datos={datos} />
      <div className="dkv2-motivos-grid dkv2-mod-motivos">
        <ListaMotivos
          titulo="Motivos de baja"
          subtitulo={periodo.labelLargo}
          motivos={c.motivos}
          onVerDetalle={() => setVerBajas(true)}
        />
        <ListaMotivos
          titulo="General"
          subtitulo={`desde ${fechaCorta(INICIO_DATOS)}/${INICIO_DATOS.slice(2, 4)}`}
          motivos={motivosGeneral}
        />
      </div>
      <div className="dkv2-motivos-grid dkv2-mod-motivos">
        <ListaRanking titulo={`Conductores con más multas · ${periodo.labelLargo}`} unidad="" filas={m?.topMultas ?? []} />
      </div>
      <Pie
        nota={`${guia ? `Conductores y autos de ${guia}. ` : ''}Altas, bajas, multas y turnos: ${periodo.labelLargo} contra el período anterior. Licencias y vehículos por llenar: hoy.`}
        ruta="/conductores"
      />
      {verHabilitados && t ? (
        <DetalleHabilitadosModal
          periodo={periodo}
          filas={t.habilitados.filter(h => h.fecha >= periodo.inicio && h.fecha <= periodo.fin)}
          conReincorporados={t.conReincorporados}
          onClose={() => setVerHabilitados(false)}
        />
      ) : null}
      {verBajas ? <DetalleBajasModal periodo={periodo} guia={guia || null} onClose={() => setVerBajas(false)} /> : null}
    </Cuerpo>
  )
}

// ───────────── Ventas ─────────────

function Ventas({ periodo, data }: { periodo: Periodo; data: MarketingRaw }) {
  const a = embudoDe(data, 'actual', 'Todos')
  const b = embudoDe(data, 'anterior', 'Todos')
  const conv = a.leads > 0 ? a.nuevos / a.leads : null
  const convAnt = b.leads > 0 ? b.nuevos / b.leads : null
  return (
    <Datos
      ruta="/reportes/dashboard-marketing"
      nota={`${periodo.labelLargo} · comparado con el período anterior`}
      datos={[
        { label: 'LEADS', value: fmtInt(a.leads), dif: difRelativa(a.leads, b.leads) },
        { label: 'PASAN LOS FILTROS', value: fmtInt(a.filtros), detalle: a.leads ? `${fmtPct(a.filtros / a.leads)} de los leads` : undefined },
        { label: 'ACEPTAN OFERTA', value: fmtInt(a.acepta), dif: difRelativa(a.acepta, b.acepta) },
        { label: 'CONDUCTORES NUEVOS', value: fmtInt(a.nuevos), detalle: 'Leads del período que ya recibieron auto', dif: difRelativa(a.nuevos, b.nuevos) },
        { label: 'CONVERSIÓN', value: fmtPct(conv), detalle: 'Meta: 3% a 5%', dif: difPuntos(conv, convAnt) },
      ]}
    />
  )
}

// ───────────── Vehículos ─────────────

function Vehiculos({ v, turnosLibres }: { v: IndicadoresVehiculos; turnosLibres: string | null }) {
  return (
    <Datos
      ruta="/vehiculos"
      nota="Estado de la flota hoy"
      datos={[
        { label: 'TOTAL FLOTA', value: fmtInt(v.total), detalle: 'Sin robados, destruidos ni devueltos' },
        { label: 'EN USO', value: fmtInt(v.enUso), detalle: v.total ? `${fmtPct(v.enUso / v.total)} de la flota` : undefined },
        { label: 'DISPONIBLES', value: fmtInt(v.disponibles), detalle: turnosLibres !== null ? `PKG ON · ${turnosLibres} turnos libres en la flota` : 'PKG ON' },
        { label: 'TALLER MECÁNICO', value: fmtInt(v.tallerMecanico) },
        { label: 'CHAPA Y PINTURA', value: fmtInt(v.chapaPintura) },
        { label: 'PKG OFF', value: fmtInt(v.pkgOff) },
        { label: 'RETENIDOS', value: fmtInt(v.retenidos), detalle: 'En comisaría' },
        { label: 'CORPORATIVOS', value: fmtInt(v.corporativos) },
        { label: 'ROBO', value: fmtInt(v.robo) },
        { label: 'DESTRUCCIÓN TOTAL', value: fmtInt(v.destruccion) },
      ]}
    />
  )
}

// ───────────── Multas y km ─────────────

/** Subtítulo de cada módulo en la vista completa (Dashboard General). */
const DESCRIPCION: Record<Pestana, string> = {
  conductores: 'Altas, bajas, licencias, multas, turnos libres, autos por llenar y por qué se van los conductores.',
  ventas: 'Embudo de leads del período, como en Dashboard Marketing.',
  vehiculos: 'Estado de la flota hoy.',
}

/**
 * `completo`: todos los módulos uno debajo del otro, cada uno en su tarjeta y sin
 * alto fijo (Dashboard General). Sin `completo`: una tarjeta con pestañas.
 */
export function IndicadoresModulos({ periodo, anterior, hoy, motivosGeneral, completo = false }: {
  periodo: Periodo
  anterior: Periodo | null
  hoy: string
  motivosGeneral: Motivo[]
  completo?: boolean
}) {
  const [pestana, setPestana] = useState<Pestana>('conductores')
  const [guia, setGuia] = useState('')
  const { sedeActualId, aplicarFiltroSede } = useSede()
  const filtroSede = aplicarFiltroSede as <T>(q: T) => T
  const sede = sedeActualId ?? 'todas'

  // Filtro por guía (agente de ventas que onboardeó al conductor: conductores.guia)
  // La tabla de conductores se lee solo al elegir un guía (las opciones son fijas)
  const guias = useCarga<GuiasConductores | null>(
    `guias|${sede}|${guia ? 'con' : 'sin'}`,
    async () => (guia ? cargarGuiasConductores(filtroSede) : null),
    'No se pudieron cargar los guías.',
  )
  useEffect(() => {
    setGuia('')
  }, [sedeActualId])
  const filtroGuia = useMemo(
    () => (guia && guias.data ? armarFiltroGuia(guias.data, guia) : null),
    [guia, guias.data],
  )
  const g = filtroGuia?.guia ?? ''

  // Período actual (hasta hoy si está en curso) y el anterior con la misma cantidad de días
  const actual: Rango = { desde: periodo.inicio, hasta: periodo.fin < hoy ? periodo.fin : hoy }
  const previo: Rango = anterior
    ? { desde: anterior.inicio, hasta: anterior.fin }
    : { desde: sumarDias(periodo.inicio, -7), hasta: sumarDias(periodo.inicio, -1) }

  // Todas las cargas arrancan juntas al abrir la pantalla
  const ventas = useCarga<MarketingRaw>(
    `ventas|${sede}|${actual.desde}|${actual.hasta}`,
    async () => {
      const { data, error } = await supabase.rpc('get_dashboard_marketing', { p_sede_id: sedeActualId ?? null, p_desde: actual.desde, p_hasta: actual.hasta })
      if (error) throw error
      return data as MarketingRaw
    },
    'No se pudieron cargar los datos de Ventas.',
  )
  const conductores = useCarga(`conductores|${sede}|${hoy}|${g}`, () => cargarConductores(filtroSede, hoy, filtroGuia), 'No se pudieron cargar los datos de conductores.')
  const vehiculos = useCarga(`vehiculos|${sede}`, () => cargarVehiculos(filtroSede), 'No se pudieron cargar los vehículos.')
  const porLlenar = useCarga(`porllenar|${sede}`, () => cargarVehiculosPorLlenar(filtroSede), 'No se pudieron cargar los vehículos por llenar.')
  const llenados = useCarga(`llenados|${sede}|${previo.desde}|${hoy}`, () => cargarLlenados(filtroSede, previo.desde), 'No se pudo calcular el tiempo para llenar turnos.')
  const multas = useCarga(`multas|${sede}|${actual.desde}|${actual.hasta}|${previo.desde}|${g}`, () => cargarMultas(filtroSede, actual, previo, filtroGuia), 'No se pudieron cargar las multas.')
  const turnos = useCarga(`turnos|${sede}|${actual.desde}|${actual.hasta}|${previo.desde}|${g}`, () => cargarTurnosGenerados(filtroSede, actual, previo, filtroGuia, sedeActualId ?? null), 'No se pudieron calcular los turnos generados.')
  // Altas y bajas una por una desde el inicio de los datos (también para "General")
  const altasBajas = useCarga<AltasBajasGuia | null>(
    `altasbajas|${sede}|${hoy}|${g}`,
    async () => (filtroGuia ? cargarAltasBajasGuia(filtroSede, sedeActualId ?? null, filtroGuia, INICIO_DATOS, hoy) : null),
    'No se pudieron cargar las altas y bajas del guía.',
  )
  const selectorGuia = <SelectorGuia guia={guia} opciones={[...GUIAS_ACTIVOS]} onChange={setGuia} />
  // Turnos libres de toda la flota (como "Turnos Disponibles" de Estado de Flota): salen
  // de porLlenar, que ya se carga. Antes se pedía useDashboardStats entero solo por este número.
  const turnosLibres = porLlenar.data
    ? String(porLlenar.data.total.turnosD + porLlenar.data.total.turnosN)
    : null

  const contenidoDe = (pestana: Pestana): ReactNode => {
    if (pestana === 'conductores') {
      // Guía elegido pero sus conductores todavía cargando: no mostrar los números de
      // toda la empresa como si fueran del guía
      if (guia && !filtroGuia) return guias.error ? <Aviso texto={guias.error} /> : <Cargando />
      return (
        <Conductores
          periodo={periodo} anterior={anterior} general={motivosGeneral} carga={conductores} multas={multas} turnos={turnos}
          guia={g} altasBajas={altasBajas} porLlenar={porLlenar} llenados={llenados}
        />
      )
    }
    if (pestana === 'ventas') return usarCarga(ventas, d => <Ventas periodo={periodo} data={d} />)
    return usarCarga(vehiculos, v => <Vehiculos v={v} turnosLibres={turnosLibres} />)
  }

  if (completo) {
    return (
      <div className="dkv2-gen">
        {PESTANAS.map(p => (
          <section key={p.id} className="dkv2-card">
            <header className="dkv2-card-header">
              <div>
                <h2 className="dkv2-card-title">{p.label}</h2>
                <p className="dkv2-card-subtitle">{DESCRIPCION[p.id]}</p>
              </div>
              {p.id === 'conductores' ? selectorGuia : null}
            </header>
            {contenidoDe(p.id)}
          </section>
        ))}
      </div>
    )
  }

  return (
    <section className="dkv2-card">
      <header className="dkv2-card-header">
        <div>
          <h2 className="dkv2-card-title">Indicadores por módulo</h2>
          <p className="dkv2-card-subtitle">Un vistazo a cada área sin entrar al módulo.</p>
        </div>
        {pestana === 'conductores' ? selectorGuia : null}
        <div className="dkv2-seg" role="tablist" aria-label="Módulo">
          {PESTANAS.map(p => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={pestana === p.id}
              className={`dkv2-seg-btn${pestana === p.id ? ' is-active' : ''}`}
              onClick={() => setPestana(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </header>
      {contenidoDe(pestana)}
    </section>
  )
}
