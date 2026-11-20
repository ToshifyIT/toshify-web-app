// src/modules/integraciones/twochat/TwoChatMensajes.tsx
// Integraciones > 2Chat > Control de mensajes: actividad del WhatsApp «Toshify Clientes»
// por agente y por conversación (como Control de llamadas). Los datos los trae y guarda
// el servidor (server-2chat.js, /api/2chat/mensajes); el texto de los mensajes no se guarda.
//
// 2Chat no dice qué agente escribió cada mensaje: el agente es al que está asignada
// la conversación en 2Chat.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Clock, Download, ExternalLink, Inbox, MessageCircle, RefreshCw, Send, Users } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { obtenerMensajesTwoChat } from '../../../services/twoChatService'
import type { MensajeTwoChat } from '../../../services/twoChatService'
import { formatFechaHoraART, hoyART, lunesSemanaART } from '../../../utils/fechaArgentina'
import { showError } from '../../../utils/toast'
import { DataTable } from '../../../components/ui/DataTable'
import { StatsGrid } from '../../../components/ui/StatsGrid'
import { ActionsMenu } from '../../../components/ui/ActionsMenu'
import { TipoContactoIcono } from './TipoContactoIcono'
import './TwoChatModule.css'

type FiltroTipo = 'todos' | 'lead' | 'conductor' | 'ninguno'

const ETIQUETA_TIPO: Record<FiltroTipo, string> = {
  todos: 'Todos',
  lead: 'Leads',
  conductor: 'Conductores',
  ninguno: 'Sin coincidencia',
}

const SIN_ASIGNAR = 'Sin asignar'

// Los tiempos de respuesta se miden solo en horario de atención (Argentina, sin horario
// de verano): quien escribe a las 18:30 y recibe respuesta a las 9:05 esperó 5 min, no 15 h.
const HORA_INICIO_ATENCION = 9
const HORA_FIN_ATENCION = 18
const DIAS_ATENCION = [1, 2, 3, 4, 5, 6] // lunes a sábado (0 = domingo)
const OFFSET_ART_MS = 3 * 60 * 60 * 1000
const DIA_MS = 24 * 60 * 60 * 1000

/** Segundos entre dos instantes que caen dentro del horario de atención */
function segundosHabiles(desdeMs: number, hastaMs: number): number {
  if (hastaMs <= desdeMs) return 0
  let total = 0
  // Se recorre día por día en hora argentina (corrida a UTC para usar getUTC*)
  let dia = Math.floor((desdeMs - OFFSET_ART_MS) / DIA_MS) * DIA_MS
  const fin = hastaMs - OFFSET_ART_MS
  const ini = desdeMs - OFFSET_ART_MS
  while (dia < fin) {
    if (DIAS_ATENCION.includes(new Date(dia).getUTCDay())) {
      const abre = Math.max(dia + HORA_INICIO_ATENCION * 3600000, ini)
      const cierra = Math.min(dia + HORA_FIN_ATENCION * 3600000, fin)
      if (cierra > abre) total += cierra - abre
    }
    dia += DIA_MS
  }
  return total / 1000
}
const esAutomatico = (m: MensajeTwoChat) => m.enviado_por === 'api' || m.enviado_por === 'flujo'

interface Conversacion {
  session_key: string
  agente: string
  contacto: string | null
  tipo: 'conductor' | 'lead' | null
  numero: string | null
  estado_lead: string | null
  link: string
  recibidos: number
  enviados: number
  automaticos: number
  ultima: string
  /** Último mensaje del cliente sin respuesta todavía (fecha desde la que espera) */
  esperandoDesde: string | null
  /** Segundos hábiles que tardó cada respuesta (cliente → siguiente mensaje del agente) */
  respuestas: number[]
  /** Segundos hábiles que lleva esperando, si el último mensaje es del cliente */
  espera: number | null
  /** Respuestas + la espera actual: lo que entra en el promedio */
  tiempos: number[]
}

interface ResumenAgente {
  agente: string
  conversaciones: number
  recibidos: number
  enviados: number
  automaticos: number
  sinResponder: number
  promedioRespuesta: number | null
  /** La respuesta más lenta o la espera más larga que sigue abierta */
  esperaMaxima: number | null
  leads: number
  conductores: number
}

/** «3 min», «1 h 20 min», «2 d 4 h» */
function duracion(segundos: number | null): string {
  if (segundos == null) return '-'
  const min = Math.round(segundos / 60)
  if (min < 1) return '< 1 min'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h${min % 60 ? ` ${min % 60} min` : ''}`
  return `${Math.floor(h / 24)} d${h % 24 ? ` ${h % 24} h` : ''}`
}

const promedio = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

function agruparConversaciones(mensajes: MensajeTwoChat[], ahora: number): Conversacion[] {
  const mapa = new Map<string, Conversacion & { pendienteDesde: string | null }>()
  // Vienen ordenados por fecha ascendente
  for (const m of mensajes) {
    let c = mapa.get(m.session_key)
    if (!c) {
      c = {
        session_key: m.session_key,
        agente: m.agente || SIN_ASIGNAR,
        contacto: m.conductor || m.lead,
        tipo: m.tipo_contacto,
        numero: m.numero,
        estado_lead: m.estado_lead,
        link: m.link,
        recibidos: 0,
        enviados: 0,
        automaticos: 0,
        ultima: m.fecha,
        esperandoDesde: null,
        respuestas: [],
        espera: null,
        tiempos: [],
        pendienteDesde: null,
      }
      mapa.set(m.session_key, c)
    }
    c.ultima = m.fecha
    if (m.enviado_por === 'cliente') {
      c.recibidos += 1
      if (!c.pendienteDesde) c.pendienteDesde = m.fecha
    } else if (esAutomatico(m)) {
      c.automaticos += 1
    } else {
      c.enviados += 1
      if (c.pendienteDesde) {
        c.respuestas.push(segundosHabiles(new Date(c.pendienteDesde).getTime(), new Date(m.fecha).getTime()))
        c.pendienteDesde = null
      }
    }
  }
  return [...mapa.values()]
    .map(({ pendienteDesde, ...c }) => {
      // Las que siguen sin respuesta entran al promedio con lo que llevan esperando
      const espera = pendienteDesde ? segundosHabiles(new Date(pendienteDesde).getTime(), ahora) : null
      return { ...c, esperandoDesde: pendienteDesde, espera, tiempos: espera == null ? c.respuestas : [...c.respuestas, espera] }
    })
    .sort((a, b) => b.ultima.localeCompare(a.ultima))
}

function resumirPorAgente(convs: Conversacion[], todos: string[]): ResumenAgente[] {
  const mapa = new Map<string, ResumenAgente & { tiempos: number[] }>()
  // Los agentes sin conversaciones también aparecen, en 0
  for (const a of todos) {
    mapa.set(a, { agente: a, conversaciones: 0, recibidos: 0, enviados: 0, automaticos: 0, sinResponder: 0, promedioRespuesta: null, esperaMaxima: null, leads: 0, conductores: 0, tiempos: [] })
  }
  for (const c of convs) {
    const r = mapa.get(c.agente) ?? {
      agente: c.agente, conversaciones: 0, recibidos: 0, enviados: 0, automaticos: 0,
      sinResponder: 0, promedioRespuesta: null, esperaMaxima: null, leads: 0, conductores: 0, tiempos: [],
    }
    r.conversaciones += 1
    r.recibidos += c.recibidos
    r.enviados += c.enviados
    r.automaticos += c.automaticos
    if (c.esperandoDesde) r.sinResponder += 1
    if (c.tipo === 'lead') r.leads += 1
    if (c.tipo === 'conductor') r.conductores += 1
    r.tiempos.push(...c.tiempos)
    mapa.set(c.agente, r)
  }
  return [...mapa.values()]
    .map(({ tiempos, ...r }) => ({ ...r, promedioRespuesta: promedio(tiempos), esperaMaxima: tiempos.length ? Math.max(...tiempos) : null }))
    .sort((a, b) => b.conversaciones - a.conversaciones)
}

export function TwoChatMensajesModule() {
  const [desde, setDesde] = useState(lunesSemanaART)
  const [hasta, setHasta] = useState(hoyART)
  const [mensajes, setMensajes] = useState<MensajeTwoChat[]>([])
  const [todosAgentes, setTodosAgentes] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tipo, setTipo] = useState<FiltroTipo>('todos')
  const [agente, setAgente] = useState('todos')
  const [soloSinResponder, setSoloSinResponder] = useState(false)
  const [actualizadoEn, setActualizadoEn] = useState<string | null>(null)
  const [errorSync, setErrorSync] = useState<string | null>(null)
  // Referencia para las esperas abiertas: se mueve con cada consulta y cada minuto
  const [ahora, setAhora] = useState(() => Date.now())

  const consultar = useCallback(async (actualizar = false) => {
    if (desde > hasta) {
      showError('Rango inválido', 'La fecha desde no puede ser posterior a hasta')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const r = await obtenerMensajesTwoChat({ desde, hasta, actualizar })
      setMensajes(r.mensajes)
      setTodosAgentes(r.agentes || [])
      setActualizadoEn(r.actualizado_en)
      setErrorSync(r.error_sync)
    } catch (err) {
      console.error('Error cargando mensajes 2Chat:', err)
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los mensajes')
    } finally {
      setAhora(Date.now())
      setLoading(false)
    }
  }, [desde, hasta])

  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 60 * 1000)
    return () => clearInterval(id)
  }, [])

  // Al abrir trae lo nuevo de 2Chat (es liviano); después relee cada 15 min
  useEffect(() => { void consultar(true) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const id = setInterval(() => { void consultar() }, 15 * 60 * 1000)
    return () => clearInterval(id)
  }, [consultar])

  const porTipo = useMemo(() => {
    if (tipo === 'todos') return mensajes
    if (tipo === 'ninguno') return mensajes.filter(m => !m.tipo_contacto)
    return mensajes.filter(m => m.tipo_contacto === tipo)
  }, [mensajes, tipo])

  const conteoTipo = useMemo(() => {
    const convs = (f: (m: MensajeTwoChat) => boolean) => new Set(mensajes.filter(f).map(m => m.session_key)).size
    return {
      todos: convs(() => true),
      lead: convs(m => m.tipo_contacto === 'lead'),
      conductor: convs(m => m.tipo_contacto === 'conductor'),
      ninguno: convs(m => !m.tipo_contacto),
    }
  }, [mensajes])

  const conversaciones = useMemo(() => agruparConversaciones(porTipo, ahora), [porTipo, ahora])
  const resumen = useMemo(() => resumirPorAgente(conversaciones, todosAgentes), [conversaciones, todosAgentes])
  const agentes = useMemo(() => resumen.map(r => r.agente), [resumen])
  const detalle = useMemo(() => conversaciones.filter(c =>
    (agente === 'todos' || c.agente === agente) && (!soloSinResponder || !!c.esperandoDesde),
  ), [conversaciones, agente, soloSinResponder])

  const totales = useMemo(() => {
    const base = agente === 'todos' ? conversaciones : conversaciones.filter(c => c.agente === agente)
    return {
      recibidos: base.reduce((a, c) => a + c.recibidos, 0),
      enviados: base.reduce((a, c) => a + c.enviados, 0),
      automaticos: base.reduce((a, c) => a + c.automaticos, 0),
      conversaciones: base.length,
      sinResponder: base.filter(c => c.esperandoDesde).length,
      promedioRespuesta: promedio(base.flatMap(c => c.tiempos)),
    }
  }, [conversaciones, agente])

  const exportar = async () => {
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen.map(r => ({
        Agente: r.agente,
        Conversaciones: r.conversaciones,
        'Mensajes recibidos': r.recibidos,
        'Mensajes enviados': r.enviados,
        'Automáticos (API / flujos)': r.automaticos,
        'Sin responder': r.sinResponder,
        'Respuesta promedio (min hábiles)': r.promedioRespuesta == null ? '' : Number((r.promedioRespuesta / 60).toFixed(1)),
        'Espera máxima (min hábiles)': r.esperaMaxima == null ? '' : Number((r.esperaMaxima / 60).toFixed(1)),
        Leads: r.leads,
        Conductores: r.conductores,
      }))), 'Resumen por agente')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(conversaciones.map(c => ({
        Agente: c.agente,
        Contacto: c.contacto || 'Sin coincidencia',
        Tipo: c.tipo === 'conductor' ? 'Conductor' : c.tipo === 'lead' ? 'Lead' : '',
        Número: c.numero || '',
        'Estado lead': c.estado_lead || '',
        Recibidos: c.recibidos,
        Enviados: c.enviados,
        Automáticos: c.automaticos,
        'Última actividad': formatFechaHoraART(c.ultima),
        'Esperando respuesta desde': c.esperandoDesde ? formatFechaHoraART(c.esperandoDesde) : '',
        'Respuesta promedio (min hábiles)': c.tiempos.length ? Number(((promedio(c.tiempos) ?? 0) / 60).toFixed(1)) : '',
        'Link 2Chat': c.link,
      }))), 'Conversaciones')
      XLSX.writeFile(wb, `mensajes_2chat_${desde}_a_${hasta}.xlsx`)
    } catch (err) {
      console.error('Error exportando mensajes:', err)
      showError('Error', 'No se pudo exportar el reporte')
    }
  }

  const columnasResumen = useMemo<ColumnDef<ResumenAgente, unknown>[]>(() => [
    { accessorKey: 'agente', header: 'Agente', cell: ({ getValue }) => <span className="tc-nombre">{getValue() as string}</span> },
    { accessorKey: 'conversaciones', header: 'Conversaciones' },
    { accessorKey: 'recibidos', header: 'Recibidos' },
    { accessorKey: 'enviados', header: 'Enviados' },
    { accessorKey: 'automaticos', header: 'Automáticos' },
    {
      accessorKey: 'sinResponder',
      header: 'Sin responder',
      cell: ({ getValue }) => {
        const v = getValue() as number
        return v > 0 ? <span className="tc-badge tc-badge--no_atendida">{v}</span> : '0'
      },
    },
    { accessorKey: 'promedioRespuesta', header: 'Respuesta prom.', cell: ({ getValue }) => duracion(getValue() as number | null) },
    { accessorKey: 'esperaMaxima', header: 'Espera máx.', cell: ({ getValue }) => duracion(getValue() as number | null) },
    { accessorKey: 'leads', header: 'Leads' },
    { accessorKey: 'conductores', header: 'Conductores' },
  ], [])

  const columnasDetalle = useMemo<ColumnDef<Conversacion, unknown>[]>(() => [
    {
      id: 'contacto',
      header: 'Contacto',
      accessorFn: (c) => `${c.contacto ?? ''} ${c.numero ?? ''}`,
      cell: ({ row }) => {
        const c = row.original
        return (
          <div className="tc-contacto">
            <span className="tc-nombre">
              {c.contacto || 'Sin coincidencia'}
              {c.tipo && <TipoContactoIcono tipo={c.tipo} />}
            </span>
            <span className="tc-muted">{c.numero || '-'}{c.tipo === 'lead' && c.estado_lead ? ` · ${c.estado_lead}` : ''}</span>
          </div>
        )
      },
    },
    { accessorKey: 'agente', header: 'Agente' },
    { accessorKey: 'recibidos', header: 'Recibidos' },
    { accessorKey: 'enviados', header: 'Enviados' },
    { accessorKey: 'ultima', header: 'Última actividad', cell: ({ getValue }) => formatFechaHoraART(getValue() as string) },
    {
      id: 'estado',
      header: 'Estado',
      accessorFn: (c) => (c.esperandoDesde ? 'Sin responder' : 'Respondida'),
      cell: ({ row }) => {
        const desdeFecha = row.original.esperandoDesde
        if (!desdeFecha) return <span className="tc-badge tc-badge--atendida">Respondida</span>
        return (
          <span className="tc-badge tc-badge--no_atendida" title={`Esperando desde ${formatFechaHoraART(desdeFecha)} (cuenta solo de ${HORA_INICIO_ATENCION} a ${HORA_FIN_ATENCION} h)`}>
            Sin responder · {duracion(row.original.espera)}
          </span>
        )
      },
    },
    {
      id: 'respuesta',
      header: 'Respuesta prom.',
      accessorFn: (c) => promedio(c.tiempos) ?? -1,
      cell: ({ row }) => duracion(promedio(row.original.tiempos)),
    },
    {
      // Acciones fija a la derecha (id 'acciones', como en el resto de la app)
      id: 'acciones',
      header: 'Acciones',
      enableSorting: false,
      cell: ({ row }) => (
        <ActionsMenu
          actions={[{
            icon: <ExternalLink size={15} />,
            label: 'Abrir la conversación en 2Chat',
            onClick: () => window.open(row.original.link, '_blank', 'noopener'),
          }]}
        />
      ),
    },
  ], [])

  return (
    <div className="tc-module">
      <div className="tc-stats">
        <StatsGrid className="stats-grid" storageKey="TwoChatMensajes-1">
          <div className="stat-card">
            <Inbox size={20} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{totales.recibidos}</span>
              <span className="stat-label">Recibidos</span>
            </div>
          </div>
          <div className="stat-card" title={totales.automaticos ? `Además, ${totales.automaticos} automáticos (API / flujos)` : undefined}>
            <Send size={20} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{totales.enviados}</span>
              <span className="stat-label">Enviados por agentes</span>
            </div>
          </div>
          <div className="stat-card">
            <MessageCircle size={20} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{totales.conversaciones}</span>
              <span className="stat-label">Conversaciones</span>
            </div>
          </div>
          <div
            className={`stat-card stat-card-clickable ${soloSinResponder ? 'active' : ''}`}
            onClick={() => setSoloSinResponder(v => !v)}
            title="Conversaciones cuyo último mensaje es del cliente. Clic para ver solo esas."
          >
            <AlertTriangle size={20} className="stat-icon" style={{ color: totales.sinResponder ? 'var(--color-primary)' : undefined }} />
            <div className="stat-content">
              <span className="stat-value">{totales.sinResponder}</span>
              <span className="stat-label">Sin responder</span>
            </div>
          </div>
          <div className="stat-card" title={`Tiempo entre que el cliente escribe y el agente contesta, de ${HORA_INICIO_ATENCION} a ${HORA_FIN_ATENCION} h de lunes a sábado. Incluye lo que llevan esperando las conversaciones sin responder.`}>
            <Clock size={20} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{duracion(totales.promedioRespuesta)}</span>
              <span className="stat-label">Respuesta promedio</span>
            </div>
          </div>
        </StatsGrid>
      </div>

      <div className="tc-filtros">
        <label className="tc-campo">
          <span>Desde</span>
          <input type="date" className="form-input" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label className="tc-campo">
          <span>Hasta</span>
          <input type="date" className="form-input" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} />
        </label>
        <label className="tc-campo">
          <span>Contacto</span>
          <select className="form-input" value={tipo} onChange={(e) => setTipo(e.target.value as FiltroTipo)}>
            {(Object.keys(ETIQUETA_TIPO) as FiltroTipo[]).map((t) => (
              <option key={t} value={t}>{ETIQUETA_TIPO[t]} ({conteoTipo[t]})</option>
            ))}
          </select>
        </label>
        <label className="tc-campo">
          <span>Agente</span>
          <select className="form-input" value={agente} onChange={(e) => setAgente(e.target.value)}>
            <option value="todos">Todos</option>
            {agentes.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <button
          className="btn-primary"
          onClick={() => void consultar(true)}
          disabled={loading}
          title={`Trae de 2Chat los mensajes nuevos. ${actualizadoEn ? `Última actualización: ${formatFechaHoraART(actualizadoEn)}` : 'Sin actualizar aún'} (se actualiza solo cada hora)`}
        >
          <RefreshCw size={16} className={loading ? 'tc-girando' : undefined} />
          Consultar
        </button>
        <button className="btn-secondary" onClick={() => void exportar()} disabled={loading || conversaciones.length === 0}>
          <Download size={16} />
          Exportar
        </button>
      </div>

      {errorSync && (
        <div className="aviso aviso--warning">
          <AlertTriangle size={14} />
          <span>No se pudo traer lo nuevo de 2Chat ({errorSync}). Se muestran los mensajes ya guardados.</span>
        </div>
      )}

      <section className="tc-seccion">
        <h3 className="tc-seccion-titulo">Reporte por agente</h3>
        <p className="tc-muted" style={{ margin: '0 0 8px' }}>
          El agente de cada conversación es al que está asignada en 2Chat (2Chat no indica quién escribió cada mensaje).
        </p>
        <DataTable
          data={resumen}
          columns={columnasResumen}
          loading={loading}
          error={error}
          showSearch={false}
          showPagination={resumen.length > 10}
          disableAutoFilters
          sinScrollInterno
          emptyIcon={<Users size={40} />}
          emptyTitle="Sin mensajes en el rango"
        />
      </section>

      <section className="tc-seccion">
        <h3 className="tc-seccion-titulo">Conversaciones{soloSinResponder ? ' sin responder' : ''}</h3>
        <DataTable
          data={detalle}
          columns={columnasDetalle}
          loading={loading}
          error={error}
          pageSize={100}
          sinScrollInterno
          stickyLeftColumns={2}
          searchPlaceholder="Buscar conductor, lead o número..."
          emptyIcon={<MessageCircle size={40} />}
          emptyTitle={soloSinResponder ? 'No hay conversaciones sin responder' : 'Sin conversaciones'}
        />
      </section>
    </div>
  )
}
