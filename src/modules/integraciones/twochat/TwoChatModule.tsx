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
  Phone, PhoneCall, Timer, DollarSign, Download, MessageCircle, Headphones, FileText, Star,
} from 'lucide-react'
import { Alerta } from '../../../components/ui/alertas'
import type { ColumnDef } from '@tanstack/react-table'
import {
  obtenerContactosTwoChat,
  sincronizarContactosTwoChat,
  obtenerLlamadasTwoChat,
  LOTE_SINCRONIZACION,
} from '../../../services/twoChatService'
import type {
  ContactoTwoChat,
  EstadoSync2Chat,
  LlamadaTwoChat,
  ResultadoLlamada,
} from '../../../services/twoChatService'
import { useSede } from '../../../contexts/SedeContext'
import { formatFechaHoraART, fechaISOART, hoyART } from '../../../utils/fechaArgentina'
import { showError, showSuccess } from '../../../utils/toast'
import { DataTable } from '../../../components/ui/DataTable'
import { StatsGrid } from '../../../components/ui/StatsGrid'
import './TwoChatModule.css'
import { formatMoneda, formatNumero } from '../../../utils/format'
import { ActionsMenu } from '../../../components/ui/ActionsMenu'
import { LlamadaAnalisisModal, NotaCalidad } from './LlamadaAnalisisModal'
import { TipoContactoIcono } from './TipoContactoIcono'

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
  buzon_voz: 'Buzón de voz',
  sin_conversacion: 'Sin conversación',
  no_atendida: 'No atendida',
  ocupado: 'Ocupado',
  cancelada: 'Cancelada',
  fallida: 'Fallida',
}

/** Una llamada de pocos segundos suele ser buzón o corte: conversación = 30 seg o más */
const SEGUNDOS_CONVERSACION = 30

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
  /** Conversaciones reales: atendidas que Gemini confirmó (o de 30 seg o más si todavía no se analizaron) */
  conversaciones: number
  buzon: number
  /** Nota de calidad promedio (1 a 5) de las conversaciones analizadas */
  calidad: number | null
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

/** Atendida con conversación: Gemini lo confirma; si todavía no se analizó, 30 seg o más */
const esConversacion = (l: LlamadaTwoChat) =>
  l.resultado === 'atendida' && (l.analizada || l.duracion >= SEGUNDOS_CONVERSACION)

function promedioCalidad(lista: LlamadaTwoChat[]): number | null {
  const notas = lista.map((l) => l.calificacion).filter((n): n is number => n != null)
  return notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : null
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
        conversaciones: lista.filter(esConversacion).length,
        buzon: lista.filter((l) => l.resultado === 'buzon_voz').length,
        calidad: promedioCalidad(lista),
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
    const confirmacion = await Alerta.fire({
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
    Alerta.fire({
      title: 'Sincronizando…',
      html: `<span id="tc-progreso">0 de ${ids.length}</span>`,
      allowOutsideClick: false,
      allowEscapeKey: false,
      didOpen: () => Alerta.showLoading(),
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
      Alerta.close()
      const yaExistian = vinculados > 0 ? `, ${vinculados} ya existían y se vincularon` : ''
      if (errores > 0) {
        showError('Sincronización con errores', `${creados} creados${yaExistian}, ${errores} con error`)
      } else {
        showSuccess('Contactos sincronizados', `${creados} creados en 2Chat${yaExistian}`)
      }
    } catch (err) {
      Alerta.close()
      console.error('Error sincronizando 2Chat:', err)
      showError('Error', err instanceof Error ? err.message : 'No se pudo sincronizar')
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
        <StatsGrid className="stats-grid" storageKey="TwoChatModule">
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
        </StatsGrid>
      </div>

      {pestanas}

      <DataTable
        data={visibles}
        columns={columnas}
        loading={loading}
        error={error}
        pageSize={100}
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
  const [analisis, setAnalisis] = useState<LlamadaTwoChat | null>(null)

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
  // El servidor trae lo nuevo de 2Chat cada hora; la pantalla abierta relee la base cada 15 min
  useEffect(() => {
    const id = setInterval(() => { void consultar() }, 15 * 60 * 1000)
    return () => clearInterval(id)
  }, [consultar])

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
      conversaciones: detalle.filter(esConversacion).length,
      buzon: detalle.filter((l) => l.resultado === 'buzon_voz').length,
      calidad: promedioCalidad(detalle),
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
        Conversaciones: r.conversaciones,
        'Buzón de voz': r.buzon,
        'Calidad promedio (1 a 5)': r.calidad == null ? '' : Number(r.calidad.toFixed(1)),
        'Minutos totales': Number((r.segundos / 60).toFixed(1)),
        'Duración promedio': mmss(r.promedioAtendidas),
        'Contactos distintos': r.conductores,
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
        'Costo USD': l.costo_usd,
        Grabación: l.grabacion ?? '',
      }))
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hojaDetalle), 'Detalle')
      XLSX.writeFile(wb, `llamadas_2chat_${desde}_a_${hasta}${tipo === 'todos' ? '' : `_${tipo}`}.xlsx`)
    } catch (err) {
      console.error('Error exportando llamadas:', err)
      showError('Error', 'No se pudo exportar el reporte')
    }
  }

  const columnasResumen = useMemo<ColumnDef<ResumenAgente, unknown>[]>(() => [
    { accessorKey: 'agente', header: 'Agente', cell: ({ getValue }) => <span className="tc-nombre">{getValue() as string}</span> },
    { accessorKey: 'llamadas', header: 'Llamadas' },
    { accessorKey: 'atendidas', header: 'Atendidas' },
    { accessorKey: 'noAtendidas', header: 'No atendidas' },
    { accessorKey: 'buzon', header: 'Buzón de voz' },
    { accessorKey: 'conversaciones', header: 'Conversaciones' },
    {
      accessorKey: 'calidad',
      header: 'Calidad prom.',
      sortingFn: (a, b) => (a.original.calidad ?? -1) - (b.original.calidad ?? -1),
      cell: ({ getValue }) => <NotaCalidad nota={getValue() as number | null} />,
    },
    { accessorKey: 'segundos', header: 'Minutos', cell: ({ getValue }) => formatNumero((getValue() as number) / 60, 1) },
    { accessorKey: 'promedioAtendidas', header: 'Duración prom.', cell: ({ getValue }) => mmss(getValue() as number) },
    // Todo en contactos (números) distintos, para que se pueda comparar: conductores + leads
    // + sin identificar = contactos distintos. Las llamadas a cada uno van en el Excel.
    { accessorKey: 'conductores', header: 'Contactos distintos' },
    { accessorKey: 'conductoresDistintos', header: 'Conductores' },
    { accessorKey: 'leadsDistintos', header: 'Leads' },
    { accessorKey: 'pctAtendidas', header: '% atendidas', cell: ({ getValue }) => `${formatNumero((getValue() as number) * 100)}%` },
    { accessorKey: 'costo', header: 'Costo USD', cell: ({ getValue }) => formatMoneda(getValue() as number, 'USD') },
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
                <TipoContactoIcono tipo={l.tipo_contacto} />
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
    {
      id: 'calificacion',
      header: 'Calidad',
      accessorFn: (r) => r.calificacion ?? -1,
      cell: ({ row }) => {
        const l = row.original
        if (!l.analizada) return <span className="tc-analisis-pend" title="Se analiza en la próxima actualización">-</span>
        return l.calificacion != null ? <NotaCalidad nota={l.calificacion} /> : '-'
      },
    },
    {
      // Acciones fija a la derecha (id 'acciones', como en el resto de la app)
      id: 'acciones',
      header: 'Acciones',
      enableSorting: false,
      cell: ({ row }) => {
        const l = row.original
        return (
          <ActionsMenu
            actions={[
              {
                icon: <Headphones size={15} />,
                label: l.grabacion ? 'Escuchar grabación' : 'Sin grabación',
                onClick: () => { if (l.grabacion) window.open(l.grabacion, '_blank', 'noopener') },
                disabled: !l.grabacion,
              },
              {
                icon: <FileText size={15} />,
                label: l.analizada ? 'Ver resumen, calidad y transcripción' : 'Se analiza en la próxima actualización',
                onClick: () => setAnalisis(l),
                disabled: !l.analizada,
              },
            ]}
          />
        )
      },
    },
  ], [])

  return (
    <>
      <div className="tc-stats">
        <StatsGrid className="stats-grid" storageKey="TwoChatModule-1">
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
          <div className="stat-card" title="Atendidas en las que se habló con una persona (sin buzón de voz ni cortes). Lo confirma Gemini al escuchar la grabación.">
            <MessageCircle size={20} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{totales.conversaciones}</span>
              <span className="stat-label">Conversaciones{totales.buzon > 0 ? ` · ${totales.buzon} buzón` : ''}</span>
            </div>
          </div>
          <div className="stat-card" title="Nota promedio de 1 a 5 de las conversaciones: presentación, indagación, claridad, objeciones y cierre">
            <Star size={20} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{totales.calidad == null ? '-' : formatNumero(totales.calidad, 1)}</span>
              <span className="stat-label">Calidad promedio</span>
            </div>
          </div>
          <div className="stat-card">
            <Timer size={20} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{formatNumero(totales.minutos, 1)}</span>
              <span className="stat-label">Minutos</span>
            </div>
          </div>
          <div className="stat-card">
            <DollarSign size={20} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{formatMoneda(totales.costo, 'USD')}</span>
              <span className="stat-label">Costo USD</span>
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
        {/* La hora de la última actualización queda en el tooltip de «Consultar» */}
        <button className="btn-secondary" onClick={() => void exportar()} disabled={loading || porTipo.length === 0}>
          <Download size={16} />
          Exportar
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
          sinScrollInterno
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
          pageSize={100}
          sinScrollInterno
          searchPlaceholder="Buscar conductor, lead o número..."
          emptyIcon={<Phone size={40} />}
          emptyTitle="Sin llamadas"
        />
      </section>
      {analisis && <LlamadaAnalisisModal llamada={analisis} onClose={() => setAnalisis(null)} />}
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

/**
 * Integraciones > 2Chat > Contactos: conductores cargados en 2Chat.
 * (La pestaña «Registro de llamadas» por número se sacó el 2026-11-18: repetía Control de llamadas.)
 */
export function TwoChatContactosModule() {
  return (
    <div className="tc-module">
      <ContactosTab pestanas={null} />
    </div>
  )
}
