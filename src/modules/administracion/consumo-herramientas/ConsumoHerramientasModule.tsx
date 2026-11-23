// src/modules/administracion/consumo-herramientas/ConsumoHerramientasModule.tsx
// Administración › Consumo herramientas (2026-11-17): suscripciones pagas de IT.
// Reemplaza la planilla "Consumo Herramientas" (una pestaña por mes).
//
// Pagos mes a mes. El inventario de herramientas (plan, licencias, facturación,
// credenciales) está en Configuración › Integraciones & Tokens › Accesos herramientas.
// Los pagos mensuales y anuales los genera la base (herramientas_generar_pagos):
// también se piden al abrir cada mes, así ningún mes queda sin generar.
// Las monedas nunca se suman entre sí: USD, ARS (y EUR si hay) por separado.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeftRight, CalendarClock, CheckCircle2, Clock, DollarSign, Edit2, ExternalLink, Eye, FileText, Plus, XCircle } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { supabase } from '../../../lib/supabase'
import { usePermissions } from '../../../contexts/PermissionsContext'
import { DataTable } from '../../../components/ui/DataTable'
import { ActionsMenu } from '../../../components/ui/ActionsMenu'
import { MesSelector } from '../../../components/ui/MesSelector'
import { showError } from '../../../utils/toast'
import { formatFecha, formatMoneda } from '../../../utils/format'
import { hoyART } from '../../../utils/fechaArgentina'
import { nombreMes } from '../../../utils/meses'
import type { ConsumoDia, Cotizacion, EstadoPago, Herramienta, Moneda, PagoHerramienta } from './types'
import { BUCKET_FACTURAS, MONEDAS, PERIODICIDADES, aUsd } from './types'
import { CotizacionesModal, PagoDetalleModal, PagoModal } from './Modales'
import { ConsumoPorUso } from './ConsumoPorUso'
import '../../vehiculos/VehicleManagement.css'

const SUBMENU = 'consumo-herramientas'
/** Días hacia adelante para "vencen pronto" */
const DIAS_AVISO = 5
/** Días de consumo real que se traen (mes elegido, el anterior y el saldo prepago) */
const DIAS_CONSUMO = 120

/** Estado que se muestra: un pago "Pendiente" que todavía no venció (ej. Contabo se cobra
 *  el 28) se ve como "Programado"; "Pendiente" queda para los que vencen hoy. */
type EstadoVisible = EstadoPago | 'Programado'
const estadoVisible = (p: PagoHerramienta, hoy: string): EstadoVisible =>
  (p.estado === 'Pendiente' && !!p.fecha_vencimiento && p.fecha_vencimiento > hoy ? 'Programado' : p.estado)

const COLOR_ESTADO_PAGO: Record<EstadoVisible, string> = {
  Programado: 'blue', Pendiente: 'yellow', Pagado: 'green', Vencido: 'red', 'N/A': 'gray',
}

const sumarDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

/** ¿El pago corresponde al mes 'YYYY-MM'? (mensual por período; anual por su vencimiento) */
const pagoDelMes = (p: PagoHerramienta, mes: string) =>
  p.periodo === mes || (p.periodo.length === 4 && (p.fecha_vencimiento || '').startsWith(mes))

/** Gasto mensual equivalente de una herramienta activa (anual / 12; por uso = último monto) */
const gastoMensual = (h: Herramienta): number => {
  if (h.estado !== 'Activa' || !h.monto) return 0
  if (h.periodicidad === 'Anual') return h.monto / 12
  if (h.periodicidad === 'Mensual' || h.periodicidad === 'Por uso') return h.monto
  return 0
}

export function ConsumoHerramientasModule() {
  const { canEditInSubmenu, canCreateInSubmenu } = usePermissions()
  const puedeEditar = canEditInSubmenu(SUBMENU)
  const puedeCrear = canCreateInSubmenu(SUBMENU) || puedeEditar

  const hoy = hoyART()
  const mesActual = hoy.slice(0, 7)
  /** Se puede mirar hasta 2 meses adelante (proyección) */
  const mesProyeccion = (() => {
    const [y, m] = mesActual.split('-').map(Number)
    const d = new Date(Date.UTC(y, m + 1, 1))
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  })()

  const [mes, setMes] = useState(mesActual)
  const [herramientas, setHerramientas] = useState<Herramienta[]>([])
  const [pagos, setPagos] = useState<PagoHerramienta[]>([])
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([])
  const [consumo, setConsumo] = useState<ConsumoDia[]>([])
  const [modalCotizaciones, setModalCotizaciones] = useState(false)
  const [detallePago, setDetallePago] = useState<PagoHerramienta | null>(null)
  const [cargando, setCargando] = useState(true)

  // Filtros en la línea del buscador
  const [filtroMoneda, setFiltroMoneda] = useState('')
  const [filtroPeriodicidad, setFiltroPeriodicidad] = useState('')
  const [filtroEstadoPago, setFiltroEstadoPago] = useState('')
  // Tarjeta de indicador activa (filtra la pestaña de pagos)
  const [filtroIndicador, setFiltroIndicador] = useState<'pendientes' | 'pronto' | 'vencidos' | null>(null)

  const [modalPago, setModalPago] = useState<{ pago: PagoHerramienta | null; marcarPagado?: boolean } | null>(null)

  const cargar = useCallback(async (mesGenerar: string) => {
    setCargando(true)
    try {
      // Genera (si faltan) los pagos del mes elegido y del siguiente, y marca vencidos
      const { error: errGen } = await supabase.rpc('herramientas_generar_pagos', { p_mes: `${mesGenerar}-01` })
      if (errGen) console.error('No se pudieron generar los pagos del mes:', errGen)
      // Consumo real: suma las llamadas de 2Chat por día (Google Cloud lo carga el servidor).
      // Sin sql/consumo_herramientas_consumo.sql la función no existe y el panel no se muestra.
      const { error: errCons } = await supabase.rpc('herramientas_actualizar_consumo_2chat')
      if (errCons) console.warn('Consumo de 2Chat sin actualizar:', errCons.message)
      const [rh, rp, rc, rk] = await Promise.all([
        supabase.from('herramientas').select('*').order('nombre'),
        supabase.from('herramientas_pagos').select('*').order('fecha_vencimiento', { ascending: true, nullsFirst: false }),
        supabase.from('herramientas_cotizaciones').select('*'),
        supabase.from('herramientas_consumo').select('*')
          .gte('fecha', sumarDias(`${mesGenerar < mesActual ? mesGenerar : mesActual}-01`, -DIAS_CONSUMO)),
      ])
      setConsumo(rk.error ? [] : ((rk.data || []) as ConsumoDia[]))
      // Sin la tabla de cotizaciones (SQL de monedas sin correr) se muestra sin equivalente
      setCotizaciones(rc.error ? [] : ((rc.data || []) as Cotizacion[]))
      if (rh.error) throw rh.error
      if (rp.error) throw rp.error
      setHerramientas((rh.data || []) as Herramienta[])
      setPagos((rp.data || []) as PagoHerramienta[])
    } catch (e) {
      console.error('No se pudo cargar Consumo herramientas:', e)
      showError('No se pudieron cargar las herramientas')
    } finally {
      setCargando(false)
    }
  }, [mesActual])

  useEffect(() => { cargar(mes) }, [cargar, mes])

  const porId = useMemo(() => new Map(herramientas.map(h => [h.id, h])), [herramientas])
  const tasas = useMemo(() => new Map(cotizaciones.map(c => [c.moneda, Number(c.unidades_por_usd)])), [cotizaciones])
  /** "≈ US$ 12,34" debajo de los montos que no están en dólares */
  const equivalenteUsd = useCallback((monto: number | null, moneda: Moneda | null) => {
    if (!moneda || moneda === 'USD' || monto === null) return null
    const usd = aUsd(monto, moneda, tasas)
    return usd === null ? null : <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>≈ {formatMoneda(usd, 'USD')}</span>
  }, [tasas])
  const activas = useMemo(() => herramientas.filter(h => h.estado === 'Activa'), [herramientas])

  // ── Indicadores (sobre el mes en curso, no el elegido)
  const indicadores = useMemo(() => {
    const gasto: Record<string, number> = { USD: 0, ARS: 0, EUR: 0, PEN: 0 }
    activas.forEach(h => { if (h.moneda) gasto[h.moneda] += gastoMensual(h) })
    // Total estándar en USD (cada moneda convertida con su cotización)
    const totalUsd = Object.entries(gasto).reduce((t, [m, v]) => t + (aUsd(v, m as Moneda, tasas) ?? 0), 0)
    const limite = sumarDias(hoy, DIAS_AVISO)
    const pendientes = pagos.filter(p => pagoDelMes(p, mesActual) && p.estado === 'Pendiente')
    const pronto = pagos.filter(p => p.estado === 'Pendiente' && p.fecha_vencimiento && p.fecha_vencimiento >= hoy && p.fecha_vencimiento <= limite)
    const vencidos = pagos.filter(p => p.estado === 'Vencido' || (p.estado === 'Pendiente' && !!p.fecha_vencimiento && p.fecha_vencimiento < hoy))
    return { gasto, totalUsd, pendientes, pronto, vencidos }
  }, [activas, pagos, hoy, mesActual, tasas])

  const pasaFiltrosHerramienta = useCallback((h: Herramienta | undefined) => {
    if (!h) return false
    if (filtroMoneda && h.moneda !== filtroMoneda) return false
    if (filtroPeriodicidad && h.periodicidad !== filtroPeriodicidad) return false
    return true
  }, [filtroMoneda, filtroPeriodicidad])


  /** Pagos vencidos de meses anteriores: se arrastran al mes en curso para que se vea
   *  que ese mes hay que pagar más de un período (ej. Workspace oct + nov). */
  const atrasados = useMemo(
    () => (mes >= mesActual
      ? pagos.filter(p => !pagoDelMes(p, mes) && p.estado === 'Vencido'
          // Mensual: período anterior; anual: vencimiento antes de este mes
          && (p.periodo.length === 7 ? p.periodo < mes : (p.fecha_vencimiento || '') < `${mes}-01`))
      : []),
    [pagos, mes, mesActual],
  )
  const idsAtrasados = useMemo(() => new Set(atrasados.map(p => p.id)), [atrasados])

  /** Mes futuro: herramientas activas sin pago generado ese mes se muestran como "Estimado"
   *  con el monto y día de cobro cargados (proyección). No se guardan en la base. */
  const estimadosDe = useCallback((mes: string): PagoHerramienta[] => {
    if (mes <= mesActual) return []
    const [y, m] = mes.split('-').map(Number)
    const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate()
    return activas
      .filter(h => h.monto !== null && h.moneda
        && (h.periodicidad === 'Mensual' || h.periodicidad === 'Por uso'
          || (h.periodicidad === 'Anual' && (h.fecha_vencimiento || '').slice(5, 7) === mes.slice(5, 7)))
        && !pagos.some(p => p.herramienta_id === h.id && pagoDelMes(p, mes)))
      .map(h => {
        const dia = h.periodicidad === 'Anual' ? Number((h.fecha_vencimiento || '').slice(8, 10)) : h.dia_cobro
        return {
          id: `estimado-${h.id}`,
          herramienta_id: h.id,
          periodo: h.periodicidad === 'Anual' ? mes.slice(0, 4) : mes,
          fecha_vencimiento: dia ? `${mes}-${String(Math.min(dia, ultimo)).padStart(2, '0')}` : null,
          monto: h.monto,
          moneda: h.moneda,
          estado: 'Pendiente' as EstadoPago,
          fecha_pago: null, factura_path: null, factura_nombre: null,
          observaciones: 'Estimado con el monto cargado en la herramienta',
          pagado_en: null, created_at: '',
        }
      })
  }, [mesActual, activas, pagos])
  const estimados = useMemo(() => estimadosDe(mes), [estimadosDe, mes])
  const esEstimado = (p: PagoHerramienta) => p.id.startsWith('estimado-')

  /** Mes próximo al de HOY ("YYYY-MM"): la proyección no cambia con el mes elegido */
  const mesSiguiente = useMemo(() => {
    const [y, m] = mesActual.split('-').map(Number)
    const d = new Date(Date.UTC(y, m, 1))
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  }, [mesActual])
  /** Métricas que cambian con el mes elegido: pagado, pendiente (con atrasados) y
   *  proyección del mes siguiente, todo en ≈ USD */
  const metricasMes = useMemo(() => {
    const enUsd = (lista: PagoHerramienta[]) =>
      lista.reduce((t, p) => t + (p.monto !== null && p.moneda ? (aUsd(Number(p.monto), p.moneda, tasas) ?? 0) : 0), 0)
    const delMes = [...atrasados, ...pagos.filter(p => pagoDelMes(p, mes)), ...estimados].filter(p => p.estado !== 'N/A')
    const pagado = delMes.filter(p => p.estado === 'Pagado')
    const pendiente = delMes.filter(p => p.estado !== 'Pagado')
    const proximo = [...pagos.filter(p => pagoDelMes(p, mesSiguiente)), ...estimadosDe(mesSiguiente)].filter(p => p.estado !== 'N/A')
    return {
      pagadoUsd: enUsd(pagado), pagadoN: pagado.length,
      pendienteUsd: enUsd(pendiente), pendiente,
      proyectadoUsd: enUsd(proximo), proyectadoN: proximo.length,
    }
  }, [atrasados, pagos, mes, estimados, mesSiguiente, estimadosDe, tasas])

  const listaPagos = useMemo(() => {
    let base: PagoHerramienta[]
    if (filtroIndicador === 'pronto') base = indicadores.pronto
    else if (filtroIndicador === 'vencidos') base = indicadores.vencidos
    else if (filtroIndicador === 'pendientes') base = metricasMes.pendiente
    else base = [...atrasados, ...pagos.filter(p => pagoDelMes(p, mes)), ...estimados]
    return base.filter(p => pasaFiltrosHerramienta(porId.get(p.herramienta_id)) && (!filtroEstadoPago || estadoVisible(p, hoy) === filtroEstadoPago))
  }, [pagos, mes, filtroIndicador, indicadores, pasaFiltrosHerramienta, porId, filtroEstadoPago, atrasados, estimados, metricasMes, hoy])


  const irAFacturacion = (url: string | null) => {
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
  }

  const verFactura = async (p: PagoHerramienta) => {
    if (!p.factura_path) return
    const { data, error } = await supabase.storage.from(BUCKET_FACTURAS).createSignedUrl(p.factura_path, 300)
    if (error || !data) { showError('No se pudo abrir la factura'); return }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const clicIndicador = (cual: 'pendientes' | 'pronto' | 'vencidos') => {
    setFiltroIndicador(prev => (prev === cual ? null : cual))
  }

  // ── Columnas: pagos
  const columnasPagos = useMemo<ColumnDef<PagoHerramienta>[]>(() => [
    {
      id: 'herramienta',
      header: 'Herramienta',
      accessorFn: r => porId.get(r.herramienta_id)?.nombre || '',
      cell: ({ row }) => {
        const h = porId.get(row.original.herramienta_id)
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <strong style={{ whiteSpace: 'nowrap' }}>{h?.nombre || '-'}</strong>
            {(h?.periodicidad || h?.licencias != null) && (
              <span style={{ color: 'var(--text-tertiary)' }}>
                {[h.periodicidad, h.licencias != null ? `${h.licencias} ${h.licencias === 1 ? 'licencia' : 'licencias'}` : null]
                  .filter(Boolean).join(' · ')}
              </span>
            )}
            {(() => {
              // Cuántos períodos de esta herramienta hay que pagar este mes (atrasados + el actual)
              const abiertos = listaPagos
                .filter(x => x.herramienta_id === row.original.herramienta_id && x.estado !== 'Pagado' && x.estado !== 'N/A')
                .map(x => x.periodo)
                .sort()
              if (abiertos.length < 2) return null
              const meses = abiertos.map(p => (p.length === 7 ? nombreMes(p).split(' ')[0].slice(0, 3).toLowerCase() : p)).join(' + ')
              return (
                <span style={{ color: 'var(--color-danger)', fontWeight: 600 }} title={abiertos.join(', ')}>
                  {abiertos.length} períodos a pagar ({meses})
                </span>
              )
            })()}
          </div>
        )
      },
    },
    {
      accessorKey: 'periodo',
      header: 'Período',
      cell: ({ row }) => {
        const p = row.original
        if (!idsAtrasados.has(p.id)) return p.periodo
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span>{p.periodo}</span>
            <span className="dt-badge dt-badge-red" title="Período anterior sin pagar: este mes hay que pagarlo junto con el actual">Atrasado</span>
          </div>
        )
      },
    },
    {
      accessorKey: 'fecha_vencimiento',
      header: 'Vence',
      cell: ({ row }) => {
        const f = row.original.fecha_vencimiento
        if (!f) return <span style={{ color: 'var(--text-tertiary)' }}>A confirmar</span>
        const pendiente = row.original.estado === 'Pendiente' || row.original.estado === 'Vencido'
        const atrasado = pendiente && f < hoy
        return <span style={{ color: atrasado ? 'var(--color-danger)' : undefined, fontWeight: atrasado ? 600 : undefined }}>{formatFecha(f)}</span>
      },
    },
    {
      id: 'monto',
      header: 'Monto',
      accessorFn: r => r.monto ?? 0,
      cell: ({ row }) => {
        const p = row.original
        if (p.monto === null) return '-'
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, whiteSpace: 'nowrap' }}>
            <strong>{formatMoneda(p.monto, p.moneda, { decimales: p.moneda === 'ARS' ? 0 : 2 })}</strong>
            {equivalenteUsd(p.monto, p.moneda)}
          </div>
        )
      },
    },
    {
      id: 'estado',
      header: 'Estado',
      accessorFn: r => estadoVisible(r, hoy),
      cell: ({ row }) => {
        if (esEstimado(row.original)) {
          return <span className="dt-badge dt-badge-gray" title="Proyección: todavía no hay pago generado para este mes">Estimado</span>
        }
        const v = estadoVisible(row.original, hoy)
        return (
          <span className={`dt-badge dt-badge-${COLOR_ESTADO_PAGO[v]}`}
            title={v === 'Programado' ? `Se cobra el ${formatFecha(row.original.fecha_vencimiento)}; todavía no se puede pagar` : undefined}>
            {v}
          </span>
        )
      },
    },
    { accessorKey: 'fecha_pago', header: 'Pagado el', cell: ({ getValue }) => (getValue() ? formatFecha(getValue() as string) : '-') },
    {
      id: 'factura',
      header: 'Factura',
      accessorFn: r => (r.factura_path ? 'si' : 'no'),
      cell: ({ row }) => row.original.factura_path ? (
        <button type="button" className="dt-btn-action" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 6px' }}
          onClick={() => verFactura(row.original)} title={row.original.factura_nombre || 'Ver factura'}>
          <FileText size={13} /> Ver
        </button>
      ) : <span style={{ color: 'var(--text-tertiary)' }}>-</span>,
    },
    {
      accessorKey: 'observaciones',
      header: 'Observaciones',
      cell: ({ getValue }) => {
        const v = getValue() as string | null
        return v ? <span title={v} style={{ display: 'inline-block', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span> : '-'
      },
    },
    {
      id: 'acciones',
      header: 'Acciones',
      cell: ({ row }) => {
        const p = row.original
        const h = porId.get(p.herramienta_id)
        return (
          <ActionsMenu
            maxVisible={4}
            actions={[
              { icon: <Eye size={15} />, label: 'Ver detalle', onClick: () => setDetallePago(p) },
              { icon: <Edit2 size={15} />, label: 'Editar pago', onClick: () => setModalPago({ pago: p }), hidden: !puedeEditar || esEstimado(p) },
              {
                icon: <CheckCircle2 size={15} />,
                label: 'Marcar pagado',
                onClick: () => setModalPago({ pago: p, marcarPagado: true }),
                hidden: !puedeEditar || esEstimado(p) || p.estado === 'Pagado' || p.estado === 'N/A',
                variant: 'success',
              },
              {
                icon: <ExternalLink size={15} />,
                label: h?.url_facturacion ? 'Ir a facturación' : 'Sin URL de facturación',
                onClick: () => irAFacturacion(h?.url_facturacion ?? null),
                disabled: !h?.url_facturacion,
              },
            ]}
          />
        )
      },
    },
  ], [porId, hoy, puedeEditar, equivalenteUsd, idsAtrasados, listaPagos])
  // esEstimado es una función pura sobre el id: no hace falta como dependencia

  const sel = { height: 32, fontSize: 12, padding: '0 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)', background: 'var(--bg-primary)', color: 'var(--text-primary)' } as const

  const filtros = (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
      <MesSelector value={mes} onChange={(m) => { setFiltroIndicador(null); setMes(m) }} max={mesProyeccion} actual={mesActual} />
      <select style={sel} value={filtroMoneda} onChange={e => setFiltroMoneda(e.target.value)} aria-label="Moneda">
        <option value="">Moneda</option>
        {MONEDAS.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <select style={sel} value={filtroPeriodicidad} onChange={e => setFiltroPeriodicidad(e.target.value)} aria-label="Periodicidad">
        <option value="">Periodicidad</option>
        {PERIODICIDADES.map(p => <option key={p} value={p}>{p}</option>)}
      </select>
      <select style={sel} value={filtroEstadoPago} onChange={e => setFiltroEstadoPago(e.target.value)} aria-label="Estado del pago">
        <option value="">Estado</option>
        {(['Programado', 'Pendiente', 'Vencido', 'Pagado', 'N/A'] as EstadoVisible[]).map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <button className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 10px' }} onClick={() => setModalCotizaciones(true)}
        title="Tipo de cambio usado para el equivalente en USD">
        <ArrowLeftRight size={14} /> Tipo de cambio
      </button>
      {puedeCrear && (
        <button className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', whiteSpace: 'nowrap' }} onClick={() => setModalPago({ pago: null })}>
          <Plus size={15} /> Cargar pago
        </button>
      )}
    </div>
  )

  const externalFilters = filtroIndicador ? [{
    id: 'indicador',
    label: filtroIndicador === 'pronto' ? `Vencen en ${DIAS_AVISO} días` : filtroIndicador === 'vencidos' ? 'Vencidos' : `Por pagar · ${nombreMes(mes)}`,
    onClear: () => setFiltroIndicador(null),
  }] : []

  const tarjeta = (activa: boolean) => ({ cursor: 'pointer', outline: activa ? '1px solid var(--color-primary)' : undefined })

  return (
    <div className="veh-module">
      <div className="veh-stats">
        <div className="veh-stats-grid" style={{ gridTemplateColumns: window.innerWidth < 768 ? undefined : 'repeat(6, 1fr)' }}>
          {/* Un solo total en USD (cada monto sigue en su moneda en la tabla) */}
          <div className="stat-card" title="Gasto mensual de las herramientas activas: todas las monedas convertidas a dólares con las cotizaciones del día">
            <ArrowLeftRight size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{tasas.size > 0 ? `≈ ${formatMoneda(indicadores.totalUsd, 'USD')}` : '-'}</span>
              <span className="stat-label">Total mensual en USD</span>
            </div>
          </div>
          {/* Estas tres cambian con el mes elegido en Pagos */}
          <div className="stat-card" title={`${metricasMes.pagadoN} pagos ya pagados de ${nombreMes(mes)}`}>
            <CheckCircle2 size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">≈ {formatMoneda(metricasMes.pagadoUsd, 'USD')}</span>
              <span className="stat-label">Pagado · {nombreMes(mes)}</span>
            </div>
          </div>
          <div className="stat-card" style={tarjeta(filtroIndicador === 'pendientes')} onClick={() => clicIndicador('pendientes')}
            title={`${metricasMes.pendiente.length} pagos por pagar (incluye atrasados y estimados)`}>
            <Clock size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value" style={{ color: metricasMes.pendienteUsd > 0 ? 'var(--color-danger)' : undefined }}>≈ {formatMoneda(metricasMes.pendienteUsd, 'USD')}</span>
              <span className="stat-label">Por pagar · {nombreMes(mes)} ({metricasMes.pendiente.length})</span>
            </div>
          </div>
          <div className="stat-card" title={`${metricasMes.proyectadoN} cobros previstos para ${nombreMes(mesSiguiente)} (generados + estimados)`}>
            <CalendarClock size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">≈ {formatMoneda(metricasMes.proyectadoUsd, 'USD')}</span>
              <span className="stat-label">Proyectado · {nombreMes(mesSiguiente)}</span>
            </div>
          </div>
          <div className="stat-card" style={tarjeta(filtroIndicador === 'pronto')} onClick={() => clicIndicador('pronto')}>
            <CalendarClock size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{indicadores.pronto.length}</span>
              <span className="stat-label">Vencen en {DIAS_AVISO} días</span>
            </div>
          </div>
          <div className="stat-card" style={tarjeta(filtroIndicador === 'vencidos')} onClick={() => clicIndicador('vencidos')}>
            {indicadores.vencidos.length > 0 ? <AlertTriangle size={18} className="stat-icon" /> : <XCircle size={18} className="stat-icon" />}
            <div className="stat-content">
              <span className="stat-value" style={{ color: indicadores.vencidos.length > 0 ? 'var(--color-danger)' : undefined }}>{indicadores.vencidos.length}</span>
              <span className="stat-label">Pagos vencidos</span>
            </div>
          </div>
        </div>
      </div>

      <ConsumoPorUso herramientas={herramientas} consumo={consumo} mes={mes} tasas={tasas}
        puedeEditar={puedeEditar} onGuardado={() => cargar(mes)} />

      <DataTable
        data={listaPagos}
        columns={columnasPagos}
        loading={cargando}
        searchPlaceholder="Buscar herramienta, período, observación..."
        emptyIcon={<DollarSign size={48} />}
        emptyTitle="Sin pagos"
        emptyDescription="No hay pagos para este mes con los filtros elegidos."
        headerAction={filtros}
        externalFilters={externalFilters}
        onClearAllFilters={() => { setFiltroIndicador(null); setFiltroMoneda(''); setFiltroPeriodicidad(''); setFiltroEstadoPago('') }}
        stickyLeftColumns={1}
      />

      {detallePago && (
        <PagoDetalleModal
          pago={detallePago}
          herramienta={porId.get(detallePago.herramienta_id)}
          equivalenteUsd={detallePago.moneda && detallePago.moneda !== 'USD' && detallePago.monto !== null
            ? aUsd(Number(detallePago.monto), detallePago.moneda, tasas) : null}
          onVerFactura={() => verFactura(detallePago)}
          onClose={() => setDetallePago(null)}
        />
      )}
      {modalCotizaciones && (
        <CotizacionesModal
          cotizaciones={cotizaciones}
          puedeEditar={puedeEditar}
          onClose={() => setModalCotizaciones(false)}
          onGuardado={() => { setModalCotizaciones(false); cargar(mes) }}
        />
      )}
      {modalPago && (
        <PagoModal
          pago={modalPago.pago}
          marcarPagado={modalPago.marcarPagado}
          herramientas={herramientas}
          nombreHerramienta={modalPago.pago ? porId.get(modalPago.pago.herramienta_id)?.nombre : undefined}
          mes={mes}
          onClose={() => setModalPago(null)}
          onGuardado={() => { setModalPago(null); cargar(mes) }}
        />
      )}
    </div>
  )
}
