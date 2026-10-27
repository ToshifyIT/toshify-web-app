// src/modules/reportes/kpis-v2/IndicadoresModulos.tsx
// Vista general por módulo, sin entrar a cada módulo. Cada pestaña muestra
// pocos números y el enlace al módulo. Lo que depende del tiempo se compara
// contra el período anterior (semana o mes, según lo elegido arriba).
// - Conductores: altas, bajas, neto, licencias y deuda; motivos de baja por tema.
// - Ventas: embudo del período (get_dashboard_marketing, como Dashboard Marketing).
// - Vehículos: estado de la flota hoy (misma clasificación que el módulo Vehículos).
// - Multas y km: multas y excesos de km del período.
// - Siniestros: siniestros y robos del período, días sin siniestro.
// - Garantías y deuda: foto de hoy (useDashboardStats).
// Todo se pide una vez al abrir la pantalla y queda en memoria unos minutos.
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import type { Diferencia, Motivo, Periodo } from './kpisV2Types'
import type { MarketingRaw } from '../marketing/marketingTypes'
import type { IndicadoresConductores, IndicadoresMultas, IndicadoresSiniestros, IndicadoresVehiculos, Rango, Ranking } from './indicadoresModulosService'
import { supabase } from '../../../lib/supabase'
import { useSede } from '../../../contexts/SedeContext'
import { useDashboardStats } from '../../../hooks/useDashboardStats'
import { embudoDe } from '../marketing/marketingTypes'
import { cargarConductores, cargarMultas, cargarSiniestros, cargarVehiculos } from './indicadoresModulosService'
import {
  INICIO_DATOS, difPuntos, difRelativa, difUnidades, fechaCorta, fmtInt, fmtMonedaCorta, fmtPct, sumarDias,
} from './kpisV2Types'

type Pestana = 'conductores' | 'ventas' | 'vehiculos' | 'multas' | 'siniestros' | 'garantias'

const PESTANAS: { id: Pestana; label: string }[] = [
  { id: 'conductores', label: 'Conductores' },
  { id: 'ventas', label: 'Ventas' },
  { id: 'vehiculos', label: 'Vehículos' },
  { id: 'multas', label: 'Multas y km' },
  { id: 'siniestros', label: 'Siniestros' },
  { id: 'garantias', label: 'Garantías y deuda' },
]

interface Dato {
  label: string
  value: string
  detalle?: string
  dif?: Diferencia | null
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

function ListaMotivos({ titulo, subtitulo, motivos }: { titulo: string; subtitulo: string; motivos: Motivo[] }) {
  const max = Math.max(1, ...motivos.map(m => m.cantidad))
  const total = motivos.reduce((s, m) => s + m.cantidad, 0)
  return (
    <div className="dkv2-motivos-panel">
      <h3 className="dkv2-motivos-titulo">
        {titulo} <span className="dkv2-muted">· {subtitulo} · {total} {total === 1 ? 'baja' : 'bajas'}</span>
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

function Conductores({ periodo, anterior, general, carga }: {
  periodo: Periodo
  anterior: Periodo | null
  general: Motivo[]
  carga: Carga<IndicadoresConductores>
}) {
  const c = periodo.conductores
  const a = anterior?.conductores ?? null
  const neto = c.altas - c.bajas
  const extra = carga.data
  const datos: Dato[] = [
    { label: 'ALTAS', value: fmtInt(c.altas), dif: difUnidades(c.altas, a?.altas ?? null), detalle: 'Primer turno en el período' },
    { label: 'BAJAS', value: fmtInt(c.bajas), dif: alReves(difUnidades(c.bajas, a?.bajas ?? null)) },
    {
      label: 'CRECIMIENTO NETO',
      value: `${neto > 0 ? '+' : ''}${fmtInt(neto)}`,
      dif: a ? difUnidades(neto, a.altas - a.bajas) : null,
    },
    {
      label: 'LICENCIAS',
      value: extra ? fmtInt(extra.licenciasVencidas) : '…',
      detalle: extra ? `vencidas · ${fmtInt(extra.licenciasPorVencer)} vencen en 30 días` : 'Conductores activos',
    },
    {
      label: 'ACTIVOS CON DEUDA',
      value: extra ? fmtInt(extra.activosConDeuda) : '…',
      detalle: extra ? `${fmtMonedaCorta(extra.deudaActivos)} adeudados` : undefined,
    },
  ]
  return (
    <Cuerpo>
      <Tarjetas datos={datos} />
      <div className="dkv2-motivos-grid dkv2-mod-motivos">
        <ListaMotivos titulo="Motivos de baja" subtitulo={periodo.labelLargo} motivos={c.motivos} />
        <ListaMotivos
          titulo="General"
          subtitulo={`desde ${fechaCorta(INICIO_DATOS)}/${INICIO_DATOS.slice(2, 4)}`}
          motivos={general}
        />
      </div>
      <Pie nota={`Altas y bajas: ${periodo.labelLargo} contra el período anterior. Licencias y deuda: hoy.`} ruta="/conductores" />
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
        { label: 'DISPONIBLES', value: fmtInt(v.disponibles), detalle: turnosLibres !== null ? `PKG ON · ${turnosLibres} turnos libres` : 'PKG ON' },
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

function Multas({ periodo, m, cobradas }: { periodo: Periodo; m: IndicadoresMultas; cobradas: string | null }) {
  const a = m.actual
  const b = m.anterior
  return (
    <Cuerpo>
      <Tarjetas
        datos={[
          { label: 'MULTAS', value: fmtInt(a.cantidad), dif: alReves(difUnidades(a.cantidad, b.cantidad)), detalle: fmtMonedaCorta(a.monto) },
          {
            label: 'CONDUCTORES CON MULTAS',
            value: fmtInt(a.conductores),
            detalle: a.conductores ? `${(a.cantidad / a.conductores).toLocaleString('es-AR', { maximumFractionDigits: 1 })} multas por conductor` : undefined,
          },
          { label: 'KM EXCEDIDOS', value: fmtInt(Math.round(a.kmExcedidos)), dif: alReves(difRelativa(a.kmExcedidos, b.kmExcedidos)), detalle: `${fmtMonedaCorta(a.montoExcesos)} facturados` },
          { label: 'CONDUCTORES CON EXCESO', value: fmtInt(a.conductoresConExceso) },
          { label: 'MULTAS COBRADAS', value: cobradas ?? '…', detalle: 'Acumulado enviado a facturación' },
        ]}
      />
      <div className="dkv2-motivos-grid dkv2-mod-motivos">
        <ListaRanking titulo="Más multas en el período" unidad="" filas={m.topMultas} />
        <ListaRanking titulo="Más km excedidos en el período" unidad="km" filas={m.topExcesos} />
      </div>
      <Pie
        nota={`${periodo.labelLargo} contra el período anterior. Multas por fecha de infracción; km por semana facturada.`}
        ruta="/multas-telepase/multas"
      />
    </Cuerpo>
  )
}

// ───────────── Siniestros ─────────────

function Siniestros({ periodo, s, diasSinSiniestro, diasSinRobo }: {
  periodo: Periodo
  s: IndicadoresSiniestros
  diasSinSiniestro: string | null
  diasSinRobo: string | null
}) {
  return (
    <Datos
      ruta="/siniestros"
      nota={`${periodo.labelLargo} · comparado con el período anterior`}
      datos={[
        { label: 'SINIESTROS', value: fmtInt(s.actual.total), dif: alReves(difUnidades(s.actual.total, s.anterior.total)) },
        { label: 'CON CULPA DEL CONDUCTOR', value: fmtInt(s.actual.culpaConductor), dif: alReves(difUnidades(s.actual.culpaConductor, s.anterior.culpaConductor)) },
        { label: 'ROBOS', value: fmtInt(s.actual.robos), dif: alReves(difUnidades(s.actual.robos, s.anterior.robos)) },
        { label: 'DÍAS SIN SINIESTRO', value: diasSinSiniestro ?? '…', detalle: 'Hoy' },
        { label: 'DÍAS SIN ROBO', value: diasSinRobo ?? '…', detalle: 'Hoy' },
      ]}
    />
  )
}

// ───────────── Pantalla ─────────────

export function IndicadoresModulos({ periodo, anterior, hoy, motivosGeneral }: {
  periodo: Periodo
  anterior: Periodo | null
  hoy: string
  motivosGeneral: Motivo[]
}) {
  const [pestana, setPestana] = useState<Pestana>('conductores')
  const { sedeActualId, aplicarFiltroSede } = useSede()
  const filtroSede = aplicarFiltroSede as <T>(q: T) => T
  const sede = sedeActualId ?? 'todas'

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
  const conductores = useCarga(`conductores|${sede}|${hoy}`, () => cargarConductores(filtroSede, hoy), 'No se pudieron cargar los datos de conductores.')
  const vehiculos = useCarga(`vehiculos|${sede}`, () => cargarVehiculos(filtroSede), 'No se pudieron cargar los vehículos.')
  const multas = useCarga(`multas|${sede}|${actual.desde}|${actual.hasta}|${previo.desde}`, () => cargarMultas(filtroSede, actual, previo), 'No se pudieron cargar las multas.')
  const siniestros = useCarga(`siniestros|${sede}|${actual.desde}|${actual.hasta}|${previo.desde}`, () => cargarSiniestros(filtroSede, actual, previo), 'No se pudieron cargar los siniestros.')
  const foto = useDashboardStats()
  const stats = foto.stats

  let contenido: ReactNode
  if (pestana === 'conductores') {
    contenido = <Conductores periodo={periodo} anterior={anterior} general={motivosGeneral} carga={conductores} />
  } else if (pestana === 'ventas') {
    contenido = usarCarga(ventas, d => <Ventas periodo={periodo} data={d} />)
  } else if (pestana === 'vehiculos') {
    contenido = usarCarga(vehiculos, v => <Vehiculos v={v} turnosLibres={stats?.turnosDisponibles.value ?? null} />)
  } else if (pestana === 'multas') {
    contenido = usarCarga(multas, m => <Multas periodo={periodo} m={m} cobradas={stats?.cobroMultas.value ?? null} />)
  } else if (pestana === 'siniestros') {
    contenido = usarCarga(siniestros, s => (
      <Siniestros periodo={periodo} s={s} diasSinSiniestro={stats?.diasSinSiniestro.value ?? null} diasSinRobo={stats?.diasSinRobo.value ?? null} />
    ))
  } else if (foto.loading) {
    contenido = <Cargando />
  } else if (!stats) {
    contenido = <Aviso texto="No se pudieron cargar los datos." />
  } else {
    contenido = (
      <Datos
        ruta="/reportes/facturacion"
        nota="Foto de hoy"
        datos={[
          { label: 'FONDO DE GARANTÍA', value: stats.fondoGarantia.value, detalle: stats.fondoGarantia.subtitle },
          { label: 'REINTEGROS A DEVOLVER', value: stats.reintegroReciente.value, detalle: stats.reintegroReciente.subtitle },
          { label: 'REINTEGROS VENCIDOS', value: stats.reintegroAntiguo.value, detalle: stats.reintegroAntiguo.subtitle },
          { label: 'DEUDA DE CONDUCTORES', value: stats.totalSaldoPendiente.value, detalle: stats.totalSaldoPendiente.subtitle },
          { label: 'DEUDA SIN GARANTÍA QUE LA CUBRA', value: stats.deudaNoCubierta.value, detalle: stats.deudaNoCubierta.subtitle },
        ]}
      />
    )
  }

  return (
    <section className="dkv2-card">
      <header className="dkv2-card-header">
        <div>
          <h2 className="dkv2-card-title">Indicadores por módulo</h2>
          <p className="dkv2-card-subtitle">Un vistazo a cada área sin entrar al módulo.</p>
        </div>
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
      {contenido}
    </section>
  )
}
