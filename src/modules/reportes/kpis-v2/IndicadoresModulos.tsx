// src/modules/reportes/kpis-v2/IndicadoresModulos.tsx
// Vista general por módulo, sin entrar a cada módulo. Cada pestaña muestra
// pocos números y el enlace al módulo.
// - Conductores: motivos de baja por tema (top 5 + Otros), período elegido y general.
// - Ventas: embudo del período elegido (get_dashboard_marketing, como Dashboard Marketing).
// - Resto: foto de hoy, con los mismos cálculos que Dashboard KPI's (useDashboardStats).
// Los datos se piden una sola vez al abrir la pantalla y quedan en memoria.
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import type { Motivo, Periodo } from './kpisV2Types'
import type { MarketingRaw } from '../marketing/marketingTypes'
import { supabase } from '../../../lib/supabase'
import { useSede } from '../../../contexts/SedeContext'
import { useDashboardStats } from '../../../hooks/useDashboardStats'
import { embudoDe } from '../marketing/marketingTypes'
import { INICIO_DATOS, difPuntos, difRelativa, fechaCorta, fmtInt, fmtPct } from './kpisV2Types'

type Pestana = 'conductores' | 'ventas' | 'logistica' | 'siniestros' | 'multas' | 'garantias'

const PESTANAS: { id: Pestana; label: string }[] = [
  { id: 'conductores', label: 'Conductores' },
  { id: 'ventas', label: 'Ventas' },
  { id: 'logistica', label: 'Logística' },
  { id: 'siniestros', label: 'Siniestros' },
  { id: 'multas', label: 'Multas' },
  { id: 'garantias', label: 'Garantías y deuda' },
]

interface Dato {
  label: string
  value: string
  detalle?: string
  dif?: { texto: string; tono: 'bueno' | 'malo' | 'neutro' } | null
}

function Datos({ datos, ruta, nota }: { datos: Dato[]; ruta: string; nota: string }) {
  return (
    <Cuerpo>
      <div className="dkv2-mod-grid">
        {datos.map(d => (
          <div key={d.label} className="dkv2-mod-dato">
            <span className="dkv2-kpi-label">{d.label}</span>
            <span className="dkv2-mod-valor">{d.value}</span>
            {d.dif ? <span className={`dkv2-dif dkv2-dif--${d.dif.tono}`}>{d.dif.texto}</span> : null}
            {d.detalle ? <span className="dkv2-mod-detalle">{d.detalle}</span> : null}
          </div>
        ))}
      </div>
      <div className="dkv2-mod-pie">
        <span className="dkv2-muted">{nota}</span>
        <Link to={ruta} className="dkv2-link dkv2-mod-ir">
          Ir al módulo <ArrowRight size={13} />
        </Link>
      </div>
    </Cuerpo>
  )
}

const LUGARES = 5

/** Mismo alto en todas las pestañas (y mientras carga): 5 lugares por fila. */
function Cuerpo({ children }: { children: ReactNode }) {
  return <div className="dkv2-mod-cuerpo">{children}</div>
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

// Ventas: guarda en memoria lo ya consultado (por sede y fechas) para no
// volver a pedirlo al cambiar de pestaña o volver a un período ya visto.
const TTL_VENTAS = 10 * 60 * 1000
const cacheVentas = new Map<string, { data: MarketingRaw; t: number }>()

function useVentas(desde: string, hasta: string) {
  const { sedeActualId } = useSede()
  const clave = `${sedeActualId ?? 'todas'}|${desde}|${hasta}`
  const enCache = cacheVentas.get(clave)
  const vigente = enCache && Date.now() - enCache.t < TTL_VENTAS ? enCache.data : null
  const [estado, setEstado] = useState<{ clave: string; data: MarketingRaw | null; error: string | null }>({
    clave: vigente ? clave : '',
    data: vigente,
    error: null,
  })

  useEffect(() => {
    if (vigente) return
    let activo = true
    supabase
      .rpc('get_dashboard_marketing', { p_sede_id: sedeActualId ?? null, p_desde: desde, p_hasta: hasta })
      .then(({ data, error }) => {
        if (!activo) return
        if (error) {
          console.error('[DashboardKpisV2] Error cargando Ventas', error)
          setEstado({ clave, data: null, error: 'No se pudieron cargar los datos de Ventas.' })
          return
        }
        cacheVentas.set(clave, { data: data as MarketingRaw, t: Date.now() })
        setEstado({ clave, data: data as MarketingRaw, error: null })
      })
    return () => {
      activo = false
    }
  }, [clave, vigente, sedeActualId, desde, hasta])

  if (vigente) return { data: vigente, error: null, cargando: false }
  const listo = estado.clave === clave
  return { data: listo ? estado.data : null, error: listo ? estado.error : null, cargando: !listo }
}

function Ventas({ periodo, ventas }: { periodo: Periodo; ventas: ReturnType<typeof useVentas> }) {
  const { data, error, cargando } = ventas
  if (cargando) return <Cargando />
  if (error || !data) return <Aviso texto={error ?? 'Sin datos.'} />
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

// ───────────── Conductores: motivos de baja ─────────────

function ListaMotivos({ titulo, subtitulo, motivos }: { titulo: string; subtitulo: string; motivos: Motivo[] }) {
  const max = Math.max(1, ...motivos.map(m => m.cantidad))
  const total = motivos.reduce((s, m) => s + m.cantidad, 0)
  return (
    <div className="dkv2-motivos-panel">
      <h3 className="dkv2-motivos-titulo">{titulo}</h3>
      <p className="dkv2-card-subtitle">
        {subtitulo} · {total} {total === 1 ? 'baja' : 'bajas'}
      </p>
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

function Conductores({ periodo, general }: { periodo: Periodo; general: Motivo[] }) {
  const c = periodo.conductores
  const neto = c.altas - c.bajas
  return (
    <Cuerpo>
      <p className="dkv2-mod-resumen">
        Motivos de baja: los 5 temas principales y el resto en "Otros".{' '}
        <span className="dkv2-muted">
          {periodo.labelLargo}: {fmtInt(c.altas)} {c.altas === 1 ? 'alta' : 'altas'}, {fmtInt(c.bajas)}{' '}
          {c.bajas === 1 ? 'baja' : 'bajas'}, neto {neto > 0 ? '+' : ''}{fmtInt(neto)}.
        </span>
      </p>
      <div className="dkv2-motivos-grid">
        <ListaMotivos titulo={periodo.labelLargo} subtitulo="Período elegido" motivos={c.motivos} />
        <ListaMotivos
          titulo="General"
          subtitulo={`Desde ${fechaCorta(INICIO_DATOS)}/${INICIO_DATOS.slice(2, 4)}`}
          motivos={general}
        />
      </div>
      <div className="dkv2-mod-pie">
        <span className="dkv2-muted">El ranking se recalcula con cada actualización de datos</span>
        <Link to="/conductores" className="dkv2-link dkv2-mod-ir">
          Ir al módulo <ArrowRight size={13} />
        </Link>
      </div>
    </Cuerpo>
  )
}

type Stats = ReturnType<typeof useDashboardStats>

function FotoHoy({ pestana, foto }: { pestana: Exclude<Pestana, 'ventas'>; foto: Stats }) {
  const { stats, loading } = foto
  if (loading) return <Cargando />
  if (!stats) return <Aviso texto="No se pudieron cargar los datos." />
  const nota = 'Foto de hoy'
  if (pestana === 'logistica') {
    return (
      <Datos
        ruta="/estado-de-flota"
        nota={nota}
        datos={[
          { label: 'TOTAL FLOTA', value: stats.totalFlota.value, detalle: stats.totalFlota.subtitle },
          { label: 'VEHÍCULOS SIN CONDUCTOR', value: stats.disponibles.value, detalle: 'Listos para entregar' },
          { label: 'TURNOS LIBRES', value: stats.turnosDisponibles.value, detalle: 'Turnos de vehículos asignados sin conductor' },
        ]}
      />
    )
  }
  if (pestana === 'siniestros') {
    return (
      <Datos
        ruta="/siniestros"
        nota={nota}
        datos={[
          { label: 'DÍAS SIN SINIESTRO', value: stats.diasSinSiniestro.value, detalle: stats.diasSinSiniestro.subtitle },
          { label: 'DÍAS SIN ROBO', value: stats.diasSinRobo.value, detalle: stats.diasSinRobo.subtitle },
        ]}
      />
    )
  }
  if (pestana === 'multas') {
    return (
      <Datos
        ruta="/multas-telepase/multas"
        nota="Acumulado"
        datos={[{ label: 'MULTAS COBRADAS', value: stats.cobroMultas.value, detalle: stats.cobroMultas.subtitle }]}
      />
    )
  }
  return (
    <Datos
      ruta="/reportes/facturacion"
      nota={nota}
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

export function IndicadoresModulos({ periodo, hoy, motivosGeneral }: {
  periodo: Periodo
  hoy: string
  motivosGeneral: Motivo[]
}) {
  const [pestana, setPestana] = useState<Pestana>('conductores')
  // Las dos cargas arrancan juntas al abrir la pantalla, así al cambiar de pestaña ya están.
  const hasta = periodo.fin < hoy ? periodo.fin : hoy
  const ventas = useVentas(periodo.inicio, hasta)
  const foto = useDashboardStats()
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
      {pestana === 'conductores' ? (
        <Conductores periodo={periodo} general={motivosGeneral} />
      ) : pestana === 'ventas' ? (
        <Ventas periodo={periodo} ventas={ventas} />
      ) : (
        <FotoHoy pestana={pestana} foto={foto} />
      )}
    </section>
  )
}
