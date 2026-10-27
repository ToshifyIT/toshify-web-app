// src/modules/integraciones/twochat/TwoChatModule.tsx
/**
 * Integraciones > 2Chat
 *
 * - Contactos: conductores de Toshibase y si ya están cargados en 2Chat.
 *   "Sincronizar nuevos" crea en 2Chat solo los pendientes (y reintenta errores).
 * - Llamadas: historial de llamadas de 2Chat con reporte por agente y export a Excel.
 *
 * Toda la comunicación con 2Chat pasa por /api/2chat (server-2chat.js).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Users, CheckCircle2, Clock, PhoneOff, AlertTriangle, RefreshCw, UploadCloud,
  Phone, PhoneCall, Timer, DollarSign, Download, MessageCircle, UserPlus, ExternalLink, History,
} from 'lucide-react'
import Swal from 'sweetalert2'
import type { ColumnDef } from '@tanstack/react-table'
import {
  obtenerContactosTwoChat,
  sincronizarContactosTwoChat,
  obtenerLlamadasTwoChat,
  crearLeadDesdeLlamada,
  abrirLeadEnPestana,
  LOTE_SINCRONIZACION,
} from '../../../services/twoChatService'
import type {
  ContactoTwoChat,
  EstadoSync2Chat,
  LlamadaTwoChat,
  ResultadoLlamada,
} from '../../../services/twoChatService'
import { useSede } from '../../../contexts/SedeContext'
import { formatFechaHoraART, fechaISOART } from '../../../utils/fechaArgentina'
import { showSuccess, showError } from '../../../utils/toast'
import { DataTable } from '../../../components/ui/DataTable'
import './TwoChatModule.css'

type TabContactos = 'contactos' | 'registro'
type FiltroSync = 'todos' | EstadoSync2Chat
type FiltroEstadoConductor = 'activo' | 'todos' | 'baja'
type Direccion = 'outbound' | 'inbound' | 'todas'
type FiltroTipo = 'todos' | 'lead' | 'conductor' | 'ninguno'

const ETIQUETA_TIPO: Record<FiltroTipo, string> = {
  todos: 'Todos',
  lead: 'Leads',
  conductor: 'Conductores',
  ninguno: 'Sin coincidencia',
}

const ETIQUETA_SYNC: Record<EstadoSync2Chat, string> = {
  sincronizado: 'En 2Chat',
  pendiente: 'Pendiente',
  sin_telefono: 'Sin teléfono',
  error: 'Error',
  telefono_duplicado: 'Teléfono duplicado',
}

const ETIQUETA_RESULTADO: Record<ResultadoLlamada, string> = {
  atendida: 'Atendida',
  no_atendida: 'No atendida',
  ocupado: 'Ocupado',
  cancelada: 'Cancelada',
  fallida: 'Fallida',
}

/** Una llamada de pocos segundos suele ser buzón o corte: conversación = 30 seg o más */
const SEGUNDOS_CONVERSACION = 30

function hoyART(): string {
  return fechaISOART(new Date().toISOString()) ?? new Date().toISOString().slice(0, 10)
}

function haceDiasART(dias: number): string {
  const d = new Date(Date.now() - dias * 24 * 60 * 60 * 1000)
  return fechaISOART(d.toISOString()) ?? d.toISOString().slice(0, 10)
}

function escaparHtml(txt: string): string {
  return txt.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}

function mmss(segundos: number): string {
  const s = Math.round(segundos || 0)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

function nombreCompleto(c: { nombres: string; apellidos: string }): string {
  return `${c.nombres || ''} ${c.apellidos || ''}`.replace(/\s+/g, ' ').trim()
}

interface ResumenAgente {
  agente: string
  llamadas: number
  atendidas: number
  noAtendidas: number
  conversaciones: number
  segundos: number
  promedioAtendidas: number
  /** Números distintos llamados (conductores, leads y sin identificar). */
  conductores: number
  /** Conductores distintos llamados. */
  conductoresDistintos: number
  /** Leads distintos llamados. */
  leadsDistintos: number
  /** Llamadas (no números) a conductores y a leads. */
  aConductores: number
  aLeads: number
  costo: number
  pctAtendidas: number
}

function resumirPorAgente(llamadas: LlamadaTwoChat[]): ResumenAgente[] {
  const grupos = new Map<string, LlamadaTwoChat[]>()
  for (const l of llamadas) {
    const lista = grupos.get(l.agente) ?? []
    lista.push(l)
    grupos.set(l.agente, lista)
  }
  return Array.from(grupos.entries())
    .map(([agente, lista]) => {
      const atendidas = lista.filter((l) => l.resultado === 'atendida')
      const segundos = lista.reduce((acc, l) => acc + l.duracion, 0)
      const conDuracion = lista.filter((l) => l.duracion > 0)
      return {
        agente,
        llamadas: lista.length,
        atendidas: atendidas.length,
        noAtendidas: lista.length - atendidas.length,
        conversaciones: lista.filter((l) => l.duracion >= SEGUNDOS_CONVERSACION).length,
        segundos,
        promedioAtendidas: conDuracion.length ? segundos / conDuracion.length : 0,
        conductores: new Set(lista.map((l) => l.numero).filter(Boolean)).size,
        conductoresDistintos: new Set(lista.filter((l) => l.tipo_contacto === 'conductor').map((l) => l.numero).filter(Boolean)).size,
        leadsDistintos: new Set(lista.filter((l) => l.tipo_contacto === 'lead').map((l) => l.numero).filter(Boolean)).size,
        aConductores: lista.filter((l) => l.tipo_contacto === 'conductor').length,
        aLeads: lista.filter((l) => l.tipo_contacto === 'lead').length,
        costo: lista.reduce((acc, l) => acc + l.costo_usd, 0),
        pctAtendidas: lista.length ? atendidas.length / lista.length : 0,
      }
    })
    .sort((a, b) => b.llamadas - a.llamadas)
}

// =====================================================
// PESTAÑA CONTACTOS
// =====================================================

function ContactosTab({ pestanas }: { pestanas: ReactNode }) {
  const { sedeActualId, sedeActual } = useSede()
  const [filas, setFilas] = useState<ContactoTwoChat[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [puedeSincronizar, setPuedeSincronizar] = useState(false)
  const [canalWhatsapp, setCanalWhatsapp] = useState(false)
  const [filtroSync, setFiltroSync] = useState<FiltroSync>('todos')
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstadoConductor>('activo')

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await obtenerContactosTwoChat(sedeActualId)
      setFilas(r.filas)
      setPuedeSincronizar(r.puede_sincronizar)
      setCanalWhatsapp(r.canal_whatsapp)
    } catch (err) {
      console.error('Error cargando contactos 2Chat:', err)
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los contactos')
    } finally {
      setLoading(false)
    }
  }, [sedeActualId])

  useEffect(() => { void cargar() }, [cargar])

  const porEstadoConductor = useMemo(() => {
    if (filtroEstado === 'todos') return filas
    return filas.filter((f) => (f.estado_conductor || '').toLowerCase() === filtroEstado)
  }, [filas, filtroEstado])

  const conteo = useMemo(() => {
    const c: Record<EstadoSync2Chat, number> = {
      sincronizado: 0, pendiente: 0, sin_telefono: 0, error: 0, telefono_duplicado: 0,
    }
    for (const f of porEstadoConductor) c[f.estado_sync] += 1
    return c
  }, [porEstadoConductor])

  const visibles = useMemo(
    () => (filtroSync === 'todos' ? porEstadoConductor : porEstadoConductor.filter((f) => f.estado_sync === filtroSync)),
    [porEstadoConductor, filtroSync],
  )

  const aSincronizar = useMemo(
    () => porEstadoConductor.filter((f) => f.estado_sync === 'pendiente' || f.estado_sync === 'error'),
    [porEstadoConductor],
  )

  const sincronizar = async () => {
    if (aSincronizar.length === 0) return
    const alcance = filtroEstado === 'todos' ? 'conductores' : `conductores (${filtroEstado === 'activo' ? 'activos' : 'de baja'})`
    const total = aSincronizar.length
    const confirmacion = await Swal.fire({
      title: 'Sincronizar con 2Chat',
      html: `Hay <b>${total}</b> ${alcance}` +
        (sedeActual ? ` de <b>${sedeActual.nombre}</b>` : '') +
        ' para crear como contactos en 2Chat' +
        (canalWhatsapp ? ' y en el WhatsApp conectado.' : '.') +
        '<br/><span style="font-size:12px;color:var(--text-tertiary)">Los que ya están en 2Chat no se vuelven a crear. ' +
        'Para probar, poné una cantidad menor (se toman en el orden de la tabla).</span>',
      input: 'number',
      inputLabel: 'Cantidad a sincronizar',
      inputValue: String(total),
      inputAttributes: { min: '1', max: String(total), step: '1' },
      inputValidator: (valor) => {
        const n = Number(valor)
        return Number.isInteger(n) && n >= 1 && n <= total ? null : `Ingresá un número entre 1 y ${total}`
      },
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sincronizar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#ff0033',
    })
    if (!confirmacion.isConfirmed) return

    const cantidad = Math.min(Number(confirmacion.value) || total, total)
    const ids = aSincronizar.slice(0, cantidad).map((f) => f.conductor_id)
    let creados = 0
    let vinculados = 0
    let errores = 0
    Swal.fire({
      title: 'Sincronizando…',
      html: `<span id="tc-progreso">0 de ${ids.length}</span>`,
      allowOutsideClick: false,
      allowEscapeKey: false,
      didOpen: () => Swal.showLoading(),
    })
    try {
      for (let i = 0; i < ids.length; i += LOTE_SINCRONIZACION) {
        const lote = ids.slice(i, i + LOTE_SINCRONIZACION)
        const r = await sincronizarContactosTwoChat(lote, sedeActualId)
        creados += r.creados
        vinculados += r.vinculados ?? 0
        errores += r.errores
        const el = document.getElementById('tc-progreso')
        if (el) el.textContent = `${Math.min(i + lote.length, ids.length)} de ${ids.length}`
      }
      Swal.close()
      const yaExistian = vinculados > 0 ? `, ${vinculados} ya existían y se vincularon` : ''
      if (errores > 0) {
        showError('Sincronización con errores', `${creados} creados${yaExistian}, ${errores} con error`)
      } else {
        showSuccess('Contactos sincronizados', `${creados} creados en 2Chat${yaExistian}`)
      }
    } catch (err) {
      Swal.close()
      console.error('Error sincronizando 2Chat:', err)
      Swal.fire('Error', err instanceof Error ? err.message : 'No se pudo sincronizar', 'error')
    } finally {
      await cargar()
    }
  }

  const columnas = useMemo<ColumnDef<ContactoTwoChat, unknown>[]>(() => [
    {
      id: 'conductor',
      header: 'Conductor',
      accessorFn: (r) => nombreCompleto(r),
      cell: ({ row }) => <span className="tc-nombre">{nombreCompleto(row.original)}</span>,
    },
    { accessorKey: 'dni', header: 'DNI', cell: ({ getValue }) => (getValue() as string) || '-' },
    {
      accessorKey: 'telefono',
      header: 'Teléfono',
      cell: ({ row }) => {
        const f = row.original
        if (f.telefono) return f.telefono
        return <span className="tc-muted" title="Valor cargado en el conductor">{f.telefono_original || '-'}</span>
      },
    },
    {
      accessorKey: 'estado_conductor_label',
      header: 'Estado conductor',
      cell: ({ getValue }) => (getValue() as string) || '-',
    },
    {
      accessorKey: 'estado_sync',
      header: '2Chat',
      accessorFn: (r) => ETIQUETA_SYNC[r.estado_sync],
      cell: ({ row }) => {
        const f = row.original
        return (
          <span className={`tc-badge tc-badge--${f.estado_sync}`} title={f.detalle || undefined}>
            {ETIQUETA_SYNC[f.estado_sync]}
          </span>
        )
      },
    },
    {
      id: 'detalle',
      header: 'Detalle',
      accessorFn: (r) => r.detalle || (r.telefono_cambio ? 'El teléfono cambió desde que se cargó en 2Chat' : ''),
      cell: ({ getValue }) => <span className="tc-detalle">{(getValue() as string) || '-'}</span>,
    },
    {
      accessorKey: 'sincronizado_en',
      header: 'Sincronizado',
      cell: ({ getValue }) => {
        const v = getValue() as string | null
        return v ? formatFechaHoraART(v) : '-'
      },
    },
  ], [])

  const tarjetas: Array<{ id: FiltroSync; label: string; valor: number; icono: typeof Users }> = [
    { id: 'todos', label: 'Conductores', valor: porEstadoConductor.length, icono: Users },
    { id: 'sincronizado', label: 'En 2Chat', valor: conteo.sincronizado, icono: CheckCircle2 },
    { id: 'pendiente', label: 'Pendientes', valor: conteo.pendiente, icono: Clock },
    { id: 'sin_telefono', label: 'Sin teléfono', valor: conteo.sin_telefono, icono: PhoneOff },
    { id: 'error', label: 'Con error', valor: conteo.error + conteo.telefono_duplicado, icono: AlertTriangle },
  ]

  return (
    <>
      <div className="tc-stats">
        <div className="stats-grid">
          {tarjetas.map((t) => {
            const Icono = t.icono
            const activo = filtroSync === t.id || (t.id === 'error' && filtroSync === 'telefono_duplicado')
            return (
              <div
                key={t.id}
                className={`stat-card ${activo ? 'active' : ''}`}
                onClick={() => setFiltroSync(filtroSync === t.id ? 'todos' : t.id)}
                style={{ cursor: 'pointer' }}
              >
                <Icono size={20} className="stat-icon" />
                <div className="stat-content">
                  <span className="stat-value">{t.valor}</span>
                  <span className="stat-label">{t.label}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {pestanas}

      <DataTable
        data={visibles}
        columns={columnas}
        loading={loading}
        error={error}
        pageSize={20}
        searchPlaceholder="Buscar conductor, DNI o teléfono..."
        emptyIcon={<Users size={48} />}
        emptyTitle="No hay conductores"
        emptyDescription="Probá cambiar los filtros"
        headerAction={
          <div className="tc-acciones">
            <select
              className="tc-select"
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value as FiltroEstadoConductor)}
              aria-label="Estado del conductor"
            >
              <option value="activo">Activos</option>
              <option value="baja">De baja</option>
              <option value="todos">Todos</option>
            </select>
            <button className="btn-secondary" onClick={() => void cargar()} disabled={loading} title="Recargar">
              <RefreshCw size={16} />
            </button>
            {puedeSincronizar && (
              <button
                className="btn-primary"
                onClick={() => void sincronizar()}
                disabled={loading || aSincronizar.length === 0}
                title={aSincronizar.length === 0 ? 'No hay conductores nuevos para cargar' : undefined}
              >
                <UploadCloud size={16} />
                Sincronizar nuevos ({aSincronizar.length})
              </button>
            )}
          </div>
        }
      />
    </>
  )
}

// =====================================================
// PESTAÑA LLAMADAS
// =====================================================

function LlamadasTab() {
  const [desde, setDesde] = useState(hoyART)
  const [hasta, setHasta] = useState(hoyART)
  const [direccion, setDireccion] = useState<Direccion>('todas')
  const [llamadas, setLlamadas] = useState<LlamadaTwoChat[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [agente, setAgente] = useState<string>('todos')
  const [tipo, setTipo] = useState<FiltroTipo>('todos')
  const [actualizadoEn, setActualizadoEn] = useState<string | null>(null)
  const [errorSync, setErrorSync] = useState<string | null>(null)

  const consultar = useCallback(async (actualizar = false) => {
    if (desde > hasta) {
      showError('Rango inválido', 'La fecha desde no puede ser posterior a hasta')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const r = await obtenerLlamadasTwoChat({ desde, hasta, direccion, actualizar })
      setLlamadas(r.llamadas)
      setActualizadoEn(r.actualizado_en)
      setErrorSync(r.error_sync)
      setAgente('todos')
    } catch (err) {
      console.error('Error cargando llamadas 2Chat:', err)
      setError(err instanceof Error ? err.message : 'No se pudo cargar el historial')
    } finally {
      setLoading(false)
    }
  }, [desde, hasta, direccion])

  useEffect(() => { void consultar() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // El filtro de tipo (lead / conductor / sin coincidencia) aplica a todo: tarjetas,
  // reporte por agente, por día, detalle y Excel
  const porTipo = useMemo(() => {
    if (tipo === 'todos') return llamadas
    if (tipo === 'ninguno') return llamadas.filter((l) => !l.tipo_contacto)
    return llamadas.filter((l) => l.tipo_contacto === tipo)
  }, [llamadas, tipo])

  const conteoTipo = useMemo(() => ({
    todos: llamadas.length,
    lead: llamadas.filter((l) => l.tipo_contacto === 'lead').length,
    conductor: llamadas.filter((l) => l.tipo_contacto === 'conductor').length,
    ninguno: llamadas.filter((l) => !l.tipo_contacto).length,
  }), [llamadas])

  const resumen = useMemo(() => resumirPorAgente(porTipo), [porTipo])
  const agentes = useMemo(() => resumen.map((r) => r.agente), [resumen])
  const detalle = useMemo(
    () => (agente === 'todos' ? porTipo : porTipo.filter((l) => l.agente === agente)),
    [porTipo, agente],
  )

  const totales = useMemo(() => {
    const segundos = detalle.reduce((acc, l) => acc + l.duracion, 0)
    return {
      llamadas: detalle.length,
      atendidas: detalle.filter((l) => l.resultado === 'atendida').length,
      conversaciones: detalle.filter((l) => l.duracion >= SEGUNDOS_CONVERSACION).length,
      minutos: segundos / 60,
      costo: detalle.reduce((acc, l) => acc + l.costo_usd, 0),
    }
  }, [detalle])

  const porDia = useMemo(() => {
    const dias = new Map<string, Map<string, number>>()
    for (const l of porTipo) {
      const dia = fechaISOART(l.fecha) ?? '-'
      const fila = dias.get(dia) ?? new Map<string, number>()
      fila.set(l.agente, (fila.get(l.agente) ?? 0) + 1)
      dias.set(dia, fila)
    }
    return Array.from(dias.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [porTipo])

  const exportar = async () => {
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.utils.book_new()
      const hojaResumen = resumen.map((r) => ({
        Agente: r.agente,
        Llamadas: r.llamadas,
        Atendidas: r.atendidas,
        'No atendidas': r.noAtendidas,
        [`Conversaciones (+${SEGUNDOS_CONVERSACION} seg)`]: r.conversaciones,
        'Minutos totales': Number((r.segundos / 60).toFixed(1)),
        'Duración promedio': mmss(r.promedioAtendidas),
        'Números distintos': r.conductores,
        'Conductores distintos': r.conductoresDistintos,
        'Leads distintos': r.leadsDistintos,
        'Llamadas a conductores': r.aConductores,
        'Llamadas a leads': r.aLeads,
        'Costo USD': Number(r.costo.toFixed(2)),
        '% atendidas': Number((r.pctAtendidas * 100).toFixed(1)),
      }))
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hojaResumen), 'Resumen por agente')
      const hojaDia = porDia.map(([dia, fila]) => {
        const out: Record<string, string | number> = { Día: dia }
        for (const a of agentes) out[a] = fila.get(a) ?? 0
        out.Total = Array.from(fila.values()).reduce((x, y) => x + y, 0)
        return out
      })
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hojaDia), 'Por día')
      const hojaDetalle = porTipo.map((l) => ({
        Fecha: formatFechaHoraART(l.fecha),
        Agente: l.agente,
        Dirección: l.direccion === 'saliente' ? 'Saliente' : 'Entrante',
        Número: l.numero ?? '',
        Tipo: l.tipo_contacto === 'conductor' ? 'Conductor' : l.tipo_contacto === 'lead' ? 'Lead' : 'Sin coincidencia',
        Conductor: l.conductor ?? '',
        Lead: l.lead ?? '',
        'Estado lead': l.estado_lead ?? '',
        Resultado: ETIQUETA_RESULTADO[l.resultado],
        'Estado 2Chat': l.status_2chat ?? '',
        'Duración (seg)': l.duracion,
        Duración: mmss(l.duracion),
        WhatsApp: l.por_whatsapp ? 'Sí' : 'No',
        'Costo USD': l.costo_usd,
        Grabación: l.grabacion ?? '',
      }))
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hojaDetalle), 'Detalle')
      XLSX.writeFile(wb, `llamadas_2chat_${desde}_a_${hasta}${tipo === 'todos' ? '' : `_${tipo}`}.xlsx`)
    } catch (err) {
      console.error('Error exportando llamadas:', err)
      Swal.fire('Error', 'No se pudo exportar el reporte', 'error')
    }
  }

  const columnasResumen = useMemo<ColumnDef<ResumenAgente, unknown>[]>(() => [
    { accessorKey: 'agente', header: 'Agente', cell: ({ getValue }) => <span className="tc-nombre">{getValue() as string}</span> },
    { accessorKey: 'llamadas', header: 'Llamadas' },
    { accessorKey: 'atendidas', header: 'Atendidas' },
    { accessorKey: 'noAtendidas', header: 'No atendidas' },
    { accessorKey: 'conversaciones', header: `+${SEGUNDOS_CONVERSACION} seg` },
    { accessorKey: 'segundos', header: 'Minutos', cell: ({ getValue }) => ((getValue() as number) / 60).toFixed(1) },
    { accessorKey: 'promedioAtendidas', header: 'Promedio', cell: ({ getValue }) => mmss(getValue() as number) },
    // Todo en números distintos, para que se pueda comparar: conductores + leads
    // + sin identificar = números distintos. Las llamadas a cada uno van en el Excel.
    { accessorKey: 'conductores', header: 'Números distintos' },
    { accessorKey: 'conductoresDistintos', header: 'Conductores' },
    { accessorKey: 'leadsDistintos', header: 'Leads' },
    { accessorKey: 'pctAtendidas', header: '% atendidas', cell: ({ getValue }) => `${((getValue() as number) * 100).toFixed(0)}%` },
    { accessorKey: 'costo', header: 'Costo USD', cell: ({ getValue }) => (getValue() as number).toFixed(2) },
  ], [])

  const columnasDetalle = useMemo<ColumnDef<LlamadaTwoChat, unknown>[]>(() => [
    { accessorKey: 'fecha', header: 'Fecha', cell: ({ getValue }) => formatFechaHoraART(getValue() as string) },
    { accessorKey: 'agente', header: 'Agente' },
    {
      id: 'contacto',
      header: 'Contacto',
      accessorFn: (r) => `${r.conductor ?? ''} ${r.lead ?? ''} ${r.numero ?? ''}`,
      cell: ({ row }) => {
        const l = row.original
        const nombre = l.conductor || l.lead
        return (
          <div className="tc-contacto">
            <span className="tc-nombre">
              {nombre || 'Sin coincidencia'}
              {l.tipo_contacto && (
                <span className={`tc-tipo tc-tipo--${l.tipo_contacto}`}>
                  {l.tipo_contacto === 'conductor' ? 'Conductor' : 'Lead'}
                </span>
              )}
            </span>
            <span className="tc-muted">
              {l.numero || '-'}
              {l.tipo_contacto === 'lead' && l.estado_lead ? ` · ${l.estado_lead}` : ''}
            </span>
          </div>
        )
      },
    },
    {
      id: 'tipo',
      header: 'Tipo',
      accessorFn: (r) => (r.tipo_contacto === 'conductor' ? 'Conductor' : r.tipo_contacto === 'lead' ? 'Lead' : 'Sin coincidencia'),
    },
    {
      accessorKey: 'direccion',
      header: 'Dirección',
      cell: ({ getValue }) => ((getValue() as string) === 'saliente' ? 'Saliente' : 'Entrante'),
    },
    {
      accessorKey: 'resultado',
      header: 'Resultado',
      accessorFn: (r) => ETIQUETA_RESULTADO[r.resultado],
      cell: ({ row }) => (
        <span className={`tc-badge tc-badge--${row.original.resultado}`}>
          {ETIQUETA_RESULTADO[row.original.resultado]}
        </span>
      ),
    },
    { accessorKey: 'duracion', header: 'Duración', cell: ({ getValue }) => mmss(getValue() as number) },
    { accessorKey: 'por_whatsapp', header: 'Vía', cell: ({ getValue }) => ((getValue() as boolean) ? 'WhatsApp' : 'Teléfono') },
    {
      accessorKey: 'grabacion',
      header: 'Grabación',
      enableSorting: false,
      cell: ({ getValue }) => {
        const url = getValue() as string | null
        return url ? <a href={url} target="_blank" rel="noreferrer" className="tc-link">Escuchar</a> : '-'
      },
    },
  ], [])

  return (
    <>
      <div className="tc-stats">
        <div className="stats-grid">
          <div className="stat-card">
            <Phone size={20} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{totales.llamadas}</span>
              <span className="stat-label">Llamadas</span>
            </div>
          </div>
          <div className="stat-card">
            <PhoneCall size={20} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">
                {totales.atendidas}
                {totales.llamadas > 0 && (
                  <small className="tc-pct"> {Math.round((totales.atendidas / totales.llamadas) * 100)}%</small>
                )}
              </span>
              <span className="stat-label">Atendidas</span>
            </div>
          </div>
          <div className="stat-card">
            <MessageCircle size={20} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{totales.conversaciones}</span>
              <span className="stat-label">Conversaciones +{SEGUNDOS_CONVERSACION} seg</span>
            </div>
          </div>
          <div className="stat-card">
            <Timer size={20} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{totales.minutos.toFixed(1)}</span>
              <span className="stat-label">Minutos</span>
            </div>
          </div>
          <div className="stat-card">
            <DollarSign size={20} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{totales.costo.toFixed(2)}</span>
              <span className="stat-label">Costo USD</span>
            </div>
          </div>
        </div>
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
          <span>Dirección</span>
          <select className="form-input" value={direccion} onChange={(e) => setDireccion(e.target.value as Direccion)}>
            <option value="todas">Todas</option>
            <option value="outbound">Salientes</option>
            <option value="inbound">Entrantes</option>
          </select>
        </label>
        <label className="tc-campo">
          <span>Contacto</span>
          <select className="form-input" value={tipo} onChange={(e) => setTipo(e.target.value as FiltroTipo)}>
            {(Object.keys(ETIQUETA_TIPO) as FiltroTipo[]).map((t) => (
              <option key={t} value={t}>{ETIQUETA_TIPO[t]} ({conteoTipo[t]})</option>
            ))}
          </select>
        </label>
        <button
          className="btn-primary"
          onClick={() => void consultar(true)}
          disabled={loading}
          title={actualizadoEn
            ? `Trae de 2Chat las llamadas nuevas. Última actualización: ${formatFechaHoraART(actualizadoEn)}`
            : 'Trae de 2Chat las llamadas nuevas y muestra el rango'}
        >
          <RefreshCw size={16} className={loading ? 'tc-girando' : undefined} />
          Consultar
        </button>
        <button className="btn-secondary" onClick={() => void exportar()} disabled={loading || porTipo.length === 0}>
          <Download size={16} />
          Exportar Excel
        </button>
      </div>

      {errorSync && (
        <div className="aviso aviso--warning">
          <AlertTriangle size={14} />
          <span>No se pudo traer lo nuevo de 2Chat ({errorSync}). Se muestran las llamadas ya guardadas.</span>
        </div>
      )}

      <section className="tc-seccion">
        <h3 className="tc-seccion-titulo">Reporte por agente</h3>
        <DataTable
          data={resumen}
          columns={columnasResumen}
          loading={loading}
          error={error}
          showSearch={false}
          showPagination={resumen.length > 10}
          disableAutoFilters
          emptyIcon={<Users size={40} />}
          emptyTitle="Sin llamadas en el rango"
        />
      </section>

      <section className="tc-seccion">
        <h3 className="tc-seccion-titulo">Detalle de llamadas</h3>
        <DataTable
          data={detalle}
          columns={columnasDetalle}
          loading={loading}
          error={error}
          pageSize={20}
          searchPlaceholder="Buscar conductor, lead o número..."
          emptyIcon={<Phone size={40} />}
          emptyTitle="Sin llamadas"
          headerAction={
            agentes.length > 1 ? (
              <select className="tc-select" value={agente} onChange={(e) => setAgente(e.target.value)} aria-label="Agente">
                <option value="todos">Todos los agentes</option>
                {agentes.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            ) : undefined
          }
        />
      </section>
    </>
  )
}

// =====================================================
// MÓDULO
// =====================================================

// =====================================================
// REGISTRO DE LLAMADAS (por número)
// =====================================================

interface NumeroRegistro {
  numero: string
  tipo: LlamadaTwoChat['tipo_contacto']
  nombre: string | null
  estado: string | null
  lead_id: string | null
  conductor_id: string | null
  llamadas: number
  entrantesSinResponder: number
  ultimaFecha: string
  ultimoAgente: string
  ultimoResultado: ResultadoLlamada
  ultimaDireccion: LlamadaTwoChat['direccion']
}

function agruparPorNumero(llamadas: LlamadaTwoChat[]): NumeroRegistro[] {
  const porNumero = new Map<string, NumeroRegistro>()
  // Vienen ordenadas de la más nueva a la más vieja: la primera de cada número es la última
  for (const l of llamadas) {
    if (!l.numero) continue
    const clave = l.numero.replace(/\D/g, '').slice(-10)
    const actual = porNumero.get(clave)
    const sinResponder = l.direccion === 'entrante' && l.resultado !== 'atendida' ? 1 : 0
    if (actual) {
      actual.llamadas += 1
      actual.entrantesSinResponder += sinResponder
      continue
    }
    porNumero.set(clave, {
      numero: l.numero,
      tipo: l.tipo_contacto,
      nombre: l.conductor || l.lead,
      estado: l.tipo_contacto === 'lead' ? l.estado_lead : l.estado_conductor,
      lead_id: l.lead_id,
      conductor_id: l.conductor_id,
      llamadas: 1,
      entrantesSinResponder: sinResponder,
      ultimaFecha: l.fecha,
      ultimoAgente: l.agente,
      ultimoResultado: l.resultado,
      ultimaDireccion: l.direccion,
    })
  }
  return Array.from(porNumero.values())
}

function RegistroLlamadasTab({ pestanas }: { pestanas: ReactNode }) {
  const { sedeActualId, sedeActual } = useSede()
  const [desde, setDesde] = useState(() => haceDiasART(30))
  const [hasta, setHasta] = useState(hoyART)
  const [tipo, setTipo] = useState<FiltroTipo>('todos')
  const [llamadas, setLlamadas] = useState<LlamadaTwoChat[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const consultar = useCallback(async (actualizar = false) => {
    if (desde > hasta) {
      showError('Rango inválido', 'La fecha desde no puede ser posterior a hasta')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const r = await obtenerLlamadasTwoChat({ desde, hasta, direccion: 'todas', actualizar })
      setLlamadas(r.llamadas)
    } catch (err) {
      console.error('Error cargando registro de llamadas 2Chat:', err)
      setError(err instanceof Error ? err.message : 'No se pudo cargar el registro')
    } finally {
      setLoading(false)
    }
  }, [desde, hasta])

  useEffect(() => { void consultar() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const numeros = useMemo(() => agruparPorNumero(llamadas), [llamadas])
  const conteoTipo = useMemo(() => ({
    todos: numeros.length,
    lead: numeros.filter((n) => n.tipo === 'lead').length,
    conductor: numeros.filter((n) => n.tipo === 'conductor').length,
    ninguno: numeros.filter((n) => !n.tipo).length,
  }), [numeros])
  const visibles = useMemo(() => {
    if (tipo === 'todos') return numeros
    if (tipo === 'ninguno') return numeros.filter((n) => !n.tipo)
    return numeros.filter((n) => n.tipo === tipo)
  }, [numeros, tipo])

  const crearLead = useCallback(async (fila: NumeroRegistro) => {
    const r = await Swal.fire({
      title: 'Crear lead',
      html:
        `<div style="text-align:left;font-size:13px;color:var(--text-secondary)">` +
        `Teléfono: <b>${escaparHtml(fila.numero)}</b>` +
        (sedeActual ? ` · Sede: <b>${escaparHtml(sedeActual.nombre)}</b>` : '') +
        `<br/>Fuente: <b>2Chat</b></div>`,
      input: 'text',
      inputLabel: 'Nombre y apellido',
      inputPlaceholder: 'Ej.: Juan Pérez',
      inputAttributes: { maxlength: '120', autocomplete: 'off' },
      inputValidator: (v) => (v && v.trim().length >= 3 ? null : 'Ingresá el nombre (mínimo 3 letras)'),
      showCancelButton: true,
      confirmButtonText: 'Crear lead',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#ff0033',
      showLoaderOnConfirm: true,
      allowOutsideClick: () => !Swal.isLoading(),
      preConfirm: async (nombre: string) => {
        try {
          return await crearLeadDesdeLlamada({ nombre, telefono: fila.numero, sedeId: sedeActualId })
        } catch (err) {
          Swal.showValidationMessage(err instanceof Error ? err.message : 'No se pudo crear el lead')
          return false
        }
      },
    })
    if (!r.isConfirmed || !r.value) return
    const { lead_id: leadId, existente } = r.value as { lead_id: string; existente: boolean }
    const abrir = await Swal.fire({
      icon: 'success',
      title: existente ? 'Ese número ya era un lead' : 'Lead creado',
      text: existente
        ? 'Se vincularon las llamadas al lead que ya existía.'
        : 'Se creó el lead y se vincularon sus llamadas.',
      showCancelButton: true,
      confirmButtonText: 'Ver lead',
      cancelButtonText: 'Cerrar',
      confirmButtonColor: '#ff0033',
    })
    if (abrir.isConfirmed) abrirLeadEnPestana(leadId)
    await consultar()
  }, [consultar, sedeActual, sedeActualId])

  const columnas = useMemo<ColumnDef<NumeroRegistro, unknown>[]>(() => [
    {
      id: 'contacto',
      header: 'Contacto',
      accessorFn: (r) => `${r.nombre ?? ''} ${r.numero}`,
      cell: ({ row }) => {
        const n = row.original
        return (
          <div className="tc-contacto">
            <span className="tc-nombre">
              {n.nombre || 'Sin coincidencia'}
              {n.tipo && (
                <span className={`tc-tipo tc-tipo--${n.tipo}`}>{n.tipo === 'conductor' ? 'Conductor' : 'Lead'}</span>
              )}
            </span>
            <span className="tc-muted">
              {n.numero}
              {n.tipo === 'lead' && n.estado ? ` · ${n.estado}` : ''}
            </span>
          </div>
        )
      },
    },
    { accessorKey: 'llamadas', header: 'Llamadas' },
    {
      accessorKey: 'entrantesSinResponder',
      header: 'Entrantes sin responder',
      cell: ({ getValue }) => {
        const v = getValue() as number
        return v > 0 ? <span className="tc-badge tc-badge--no_atendida">{v}</span> : '-'
      },
    },
    { accessorKey: 'ultimaFecha', header: 'Última llamada', cell: ({ getValue }) => formatFechaHoraART(getValue() as string) },
    {
      id: 'ultima',
      header: 'Último resultado',
      accessorFn: (r) => ETIQUETA_RESULTADO[r.ultimoResultado],
      cell: ({ row }) => (
        <div className="tc-contacto">
          <span className={`tc-badge tc-badge--${row.original.ultimoResultado}`}>
            {ETIQUETA_RESULTADO[row.original.ultimoResultado]}
          </span>
          <span className="tc-muted">
            {row.original.ultimaDireccion === 'saliente' ? 'Saliente' : 'Entrante'} · {row.original.ultimoAgente}
          </span>
        </div>
      ),
    },
    {
      id: 'accion',
      header: 'Acción',
      enableSorting: false,
      cell: ({ row }) => {
        const n = row.original
        if (n.tipo === 'lead' && n.lead_id) {
          return (
            <button className="btn-secondary tc-btn-accion" onClick={() => abrirLeadEnPestana(n.lead_id as string)}>
              <ExternalLink size={14} />
              Ver lead
            </button>
          )
        }
        if (n.tipo === 'conductor') return <span className="tc-muted">Conductor</span>
        return (
          <button className="btn-primary tc-btn-accion" onClick={() => void crearLead(n)}>
            <UserPlus size={14} />
            Crear lead
          </button>
        )
      },
    },
  ], [crearLead])

  const metricas: Array<{ id: FiltroTipo; label: string; valor: number; icono: typeof Users }> = [
    { id: 'todos', label: 'Números', valor: conteoTipo.todos, icono: Phone },
    { id: 'lead', label: 'Leads', valor: conteoTipo.lead, icono: UserPlus },
    { id: 'conductor', label: 'Conductores', valor: conteoTipo.conductor, icono: Users },
    { id: 'ninguno', label: 'Sin coincidencia', valor: conteoTipo.ninguno, icono: AlertTriangle },
  ]
  const entrantesSinResponder = numeros.reduce((acc, n) => acc + n.entrantesSinResponder, 0)

  return (
    <>
      <div className="tc-stats">
        <div className="stats-grid">
          {metricas.map((m) => {
            const Icono = m.icono
            return (
              <div
                key={m.id}
                className={`stat-card ${tipo === m.id ? 'active' : ''}`}
                onClick={() => setTipo(tipo === m.id ? 'todos' : m.id)}
                style={{ cursor: 'pointer' }}
              >
                <Icono size={20} className="stat-icon" />
                <div className="stat-content">
                  <span className="stat-value">{m.valor}</span>
                  <span className="stat-label">{m.label}</span>
                </div>
              </div>
            )
          })}
          <div className="stat-card">
            <PhoneOff size={20} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{entrantesSinResponder}</span>
              <span className="stat-label">Entrantes sin responder</span>
            </div>
          </div>
        </div>
      </div>

      {pestanas}

      <div className="tc-filtros tc-filtros--registro">
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
        <button className="btn-primary" onClick={() => void consultar(true)} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'tc-girando' : undefined} />
          Consultar
        </button>
      </div>

      <DataTable
        data={visibles}
        columns={columnas}
        loading={loading}
        error={error}
        pageSize={20}
        searchPlaceholder="Buscar nombre o número..."
        emptyIcon={<History size={48} />}
        emptyTitle="Sin llamadas en el rango"
        emptyDescription="Probá ampliar las fechas"
      />
    </>
  )
}

// =====================================================
// MÓDULOS (Integraciones > 2Chat)
// =====================================================

/** Integraciones > 2Chat > Control de llamadas */
export function TwoChatLlamadasModule() {
  return (
    <div className="tc-module">
      <LlamadasTab />
    </div>
  )
}

/** Integraciones > 2Chat > Contactos: conductores en 2Chat + registro de llamadas por número */
export function TwoChatContactosModule() {
  const [tab, setTab] = useState<TabContactos>('contactos')

  // Orden de Toshibase: métricas arriba, debajo las pestañas, después filtros y tabla
  const pestanas = (
    <div className="tc-tabs" role="tablist">
      <button
        role="tab"
        aria-selected={tab === 'contactos'}
        className={`tc-tab ${tab === 'contactos' ? 'active' : ''}`}
        onClick={() => setTab('contactos')}
      >
        <Users size={16} />
        Contactos
      </button>
      <button
        role="tab"
        aria-selected={tab === 'registro'}
        className={`tc-tab ${tab === 'registro' ? 'active' : ''}`}
        onClick={() => setTab('registro')}
      >
        <History size={16} />
        Registro de llamadas
      </button>
    </div>
  )

  return (
    <div className="tc-module">
      {tab === 'contactos'
        ? <ContactosTab pestanas={pestanas} />
        : <RegistroLlamadasTab pestanas={pestanas} />}
    </div>
  )
}
