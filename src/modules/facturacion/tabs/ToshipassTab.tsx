// src/modules/facturacion/tabs/ToshipassTab.tsx
// Seguimiento de los cobros de Toshipass (concepto P027), el cargo semanal que reemplaza
// a la garantía en la tarifa nueva (ver utils/toshipass.ts).
//
// Por cada conductor en régimen Toshipass muestra, sobre todas sus semanas facturadas:
// lo facturado, lo cobrado, lo pendiente y lo que está en curso (período abierto).
// (2026-10-22: se quitó el selector de rango de semanas; no aportaba valor.)
//
// Cobrado: Toshipass no tiene pagos propios, se cobra junto con la facturación semanal.
// Se toma la proporción pagada de esa semana (pagos "facturacion_semanal" de la semana
// sobre el total a pagar) y se aplica al monto de Toshipass. Semana marcada como pagada,
// o sin nada que pagar, cuenta como cobrada completa.
//
// Las métricas se calculan sobre las filas que quedan después de TODOS los filtros
// (tipo, estado del conductor, filtros de columna y búsqueda). Las
// tarjetas, al hacer click, filtran la tabla por ese criterio.

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import Swal from 'sweetalert2'
import * as XLSX from 'xlsx'
import {
  Ticket,
  Users,
  UserPlus,
  ArrowRightLeft,
  UserCheck,
  UserX,
  CalendarDays,
  DollarSign,
  Eye,
  Download,
  RefreshCw,
} from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'
import { supabase } from '../../../lib/supabase'
import { useSede } from '../../../contexts/SedeContext'
import { DataTable } from '../../../components/ui/DataTable'
import { LoadingOverlay } from '../../../components/ui/LoadingOverlay'
import { formatCurrency } from '../../../types/facturacion.types'
import { formatNombreCompleto } from '../../../utils/conductorUtils'
import { analizarRegimenToshipass, CODIGO_TOSHIPASS, TOSHIPASS_VIGENCIA_DESDE } from '../utils/toshipass'

const LOTE_IDS = 200
const PAGINA = 1000

type EstadoSemana = 'Pagado' | 'Parcial' | 'Pendiente' | 'En curso'
type EstadoPago = 'Con deuda' | 'En curso' | 'Al día' | 'Sin cargos'
type FiltroKpi = 'nuevo' | 'cambio' | 'activo' | 'baja' | 'sin_cargos' | null

interface SemanaToshipass {
  clave: number // anio * 100 + semana
  semana: number
  anio: number
  periodoAbierto: boolean
  monto: number
  totalAPagar: number
  pagadoSemana: number
  cobrado: number
  estado: EstadoSemana
}

interface FilaToshipass {
  conductor_id: string
  conductor: string
  documento: string
  tipo: 'Nuevo' | 'Cambio de tarifa'
  desde: string
  estadoConductor: 'ACTIVO' | 'BAJA'
  /** Fecha de baja (conductores.fecha_terminacion, 'YYYY-MM-DD'); null si no está cargada o está activo. */
  fechaBaja: string | null
  semanasFacturadas: number
  facturado: number
  cobrado: number
  pendiente: number
  enCurso: number
  ultimaSemana: string
  ultimaSemanaClave: number
  saldoActual: number
  /** false = el conductor no tiene registro en saldos_conductores (no es lo mismo que saldo 0). */
  tieneSaldo: boolean
  estadoPago: EstadoPago
  semanas: SemanaToshipass[]
}

const LABELS_KPI: Record<Exclude<FiltroKpi, null>, string> = {
  nuevo: 'Conductores nuevos',
  cambio: 'Cambio de tarifa',
  activo: 'Conductores activos',
  baja: 'Conductores de baja',
  sin_cargos: 'Sin semanas facturadas',
}

const redondear = (n: number) => Math.round(n * 100) / 100

/**
 * Conductor de baja: saldo actual + Toshipass facturado. Es lo que queda si lo
 * facturado de Toshipass se toma a favor del conductor (negativo = sigue debiendo).
 */
const diferenciaBaja = (f: { saldoActual: number; facturado: number }) => redondear(f.saldoActual + f.facturado)

/** Mismo semáforo que Saldos y Garantías: rojo debe, verde a favor, gris en cero. */
function MontoConSigno({ valor }: { valor: number }) {
  const color = valor < 0 ? '#dc2626' : valor > 0 ? '#16a34a' : 'var(--text-secondary)'
  return <span className="fact-precio" style={{ color, fontWeight: valor === 0 ? 400 : 600 }}>{formatCurrency(valor)}</span>
}

/** Saldo Actual: conductores de baja y con cambio de tarifa (pedido 2026-10-22), si tienen saldo registrado. */
const muestraSaldo = (f: { estadoConductor: string; tipo: string; tieneSaldo: boolean }) =>
  f.tieneSaldo && (f.estadoConductor === 'BAJA' || f.tipo === 'Cambio de tarifa')

const SIN_DATO = <span style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>-</span>
const etiquetaSemana = (semana: number, anio: number) => `S${String(semana).padStart(2, '0')} ${anio}`
const fechaCorta = (iso: string) => iso.split('-').reverse().join('/')

/** Lee todas las filas de una consulta paginando de a 1000 (límite de PostgREST). */
async function leerTodo<T>(armarConsulta: () => any): Promise<T[]> {
  const filas: T[] = []
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await armarConsulta().range(desde, desde + PAGINA - 1)
    if (error) throw error
    filas.push(...((data || []) as T[]))
    if (!data || data.length < PAGINA) break
  }
  return filas
}

/** Ejecuta una consulta .in() por lotes de ids. */
async function leerPorLotes<T>(ids: string[], armarConsulta: (lote: string[]) => any): Promise<T[]> {
  const filas: T[] = []
  for (let i = 0; i < ids.length; i += LOTE_IDS) {
    const lote = ids.slice(i, i + LOTE_IDS)
    filas.push(...(await leerTodo<T>(() => armarConsulta(lote))))
  }
  return filas
}

function estadoDeSemana(periodoAbierto: boolean, ratio: number): EstadoSemana {
  if (ratio >= 0.9999) return 'Pagado'
  if (periodoAbierto) return 'En curso'
  return ratio > 0 ? 'Parcial' : 'Pendiente'
}

export function ToshipassTab() {
  const { sedeActualId, aplicarFiltroSede } = useSede()

  const [loading, setLoading] = useState(true)
  // Datos base: semanas facturadas por conductor
  const [base, setBase] = useState<Array<Omit<FilaToshipass, 'semanasFacturadas' | 'facturado' | 'cobrado' | 'pendiente' | 'enCurso' | 'ultimaSemana' | 'ultimaSemanaClave' | 'estadoPago'>>>([])

  // Filtros propios de la pestaña
  const [tipoFilter, setTipoFilter] = useState<'todos' | 'nuevo' | 'cambio'>('todos')
  const [estadoCondFilter, setEstadoCondFilter] = useState<'todos' | 'activo' | 'baja'>('todos')
  const [filtroKpi, setFiltroKpi] = useState<FiltroKpi>(null)
  const [busqueda, setBusqueda] = useState('')

  // Filas tras todos los filtros salvo la tarjeta (para las métricas) y las visibles (para exportar)
  const [filasMetricas, setFilasMetricas] = useState<FilaToshipass[] | null>(null)
  const filasVisiblesRef = useRef<FilaToshipass[]>([])

  const cargarDatos = useCallback(async () => {
    setLoading(true)
    try {
      // 1) Conductores con alguna asignación en tarifa nueva → régimen Toshipass
      const [acNueva, asigNueva] = await Promise.all([
        leerTodo<{ conductor_id: string }>(() => (supabase.from('asignaciones_conductores') as any)
          .select('conductor_id')
          .eq('tipo_tarifa', 'nueva')),
        leerTodo<{ asignaciones_conductores: { conductor_id: string }[] }>(() => (supabase.from('asignaciones') as any)
          .select('asignaciones_conductores(conductor_id)')
          .eq('tipo_tarifa', 'nueva')),
      ])
      const candidatos = new Set<string>()
      acNueva.forEach(a => a.conductor_id && candidatos.add(a.conductor_id))
      asigNueva.forEach(a => (a.asignaciones_conductores || []).forEach(ac => ac.conductor_id && candidatos.add(ac.conductor_id)))
      const regimen = await analizarRegimenToshipass([...candidatos])

      // 2) Cargos P027 de la sede y su facturación semanal
      const detalles = await leerTodo<{ facturacion_id: string; total: number }>(() => aplicarFiltroSede((supabase.from('facturacion_detalle') as any)
        .select('facturacion_id, total')
        .eq('concepto_codigo', CODIGO_TOSHIPASS)))
      const montoPorFacturacion = new Map<string, number>()
      for (const d of detalles) {
        montoPorFacturacion.set(d.facturacion_id, (montoPorFacturacion.get(d.facturacion_id) || 0) + (Number(d.total) || 0))
      }

      const facturaciones = await leerPorLotes<{
        id: string; periodo_id: string; conductor_id: string; conductor_nombre: string | null
        conductor_dni: string | null; conductor_cuit: string | null; total_a_pagar: number | null; estado: string | null
      }>([...montoPorFacturacion.keys()], lote => (supabase.from('facturacion_conductores') as any)
        .select('id, periodo_id, conductor_id, conductor_nombre, conductor_dni, conductor_cuit, total_a_pagar, estado')
        .in('id', lote))

      const periodos = await leerPorLotes<{ id: string; semana: number; anio: number; estado: string }>(
        [...new Set(facturaciones.map(f => f.periodo_id))],
        lote => (supabase.from('periodos_facturacion') as any).select('id, semana, anio, estado').in('id', lote),
      )
      const periodoPorId = new Map(periodos.map(p => [p.id, p]))

      // 3) Conductores: los del régimen de la sede + los que tienen cargos en la sede
      const idsConductores = [...new Set([...regimen.keys(), ...facturaciones.map(f => f.conductor_id)])]
      const conductores = await leerPorLotes<{
        id: string; nombres: string | null; apellidos: string | null; numero_dni: string | null
        numero_cuit: string | null; fecha_terminacion: string | null; conductores_estados: { codigo: string } | null
      }>(idsConductores, lote => aplicarFiltroSede((supabase.from('conductores') as any)
        .select('id, nombres, apellidos, numero_dni, numero_cuit, fecha_terminacion, conductores_estados(codigo)')
        .in('id', lote)))
      const conductorPorId = new Map(conductores.map(c => [c.id, c]))
      const conductoresConCargo = new Set(facturaciones.map(f => f.conductor_id))

      // 4) Pagos de facturación semanal (para saber cuánto de cada semana se pagó)
      const pagos = await leerPorLotes<{ conductor_id: string; semana: number | null; anio: number | null; monto: number }>(
        idsConductores,
        lote => (supabase.from('pagos_conductores') as any)
          .select('conductor_id, semana, anio, monto')
          .eq('tipo_cobro', 'facturacion_semanal')
          .in('conductor_id', lote),
      )
      const pagadoPorSemana = new Map<string, number>()
      for (const p of pagos) {
        if (!p.semana || !p.anio) continue
        const k = `${p.conductor_id}|${p.anio}|${p.semana}`
        pagadoPorSemana.set(k, (pagadoPorSemana.get(k) || 0) + (Number(p.monto) || 0))
      }

      // 5) Saldo actual (negativo = deuda)
      const saldos = await leerPorLotes<{ conductor_id: string; saldo_actual: number | null }>(
        idsConductores,
        lote => (supabase.from('saldos_conductores') as any).select('conductor_id, saldo_actual').in('conductor_id', lote),
      )
      const saldoPorConductor = new Map(saldos.map(s => [s.conductor_id, Number(s.saldo_actual) || 0]))

      // 6) Semanas por conductor
      const semanasPorConductor = new Map<string, SemanaToshipass[]>()
      for (const f of facturaciones) {
        const periodo = periodoPorId.get(f.periodo_id)
        if (!periodo) continue
        const monto = redondear(montoPorFacturacion.get(f.id) || 0)
        const totalAPagar = Number(f.total_a_pagar) || 0
        const pagadoSemana = redondear(pagadoPorSemana.get(`${f.conductor_id}|${periodo.anio}|${periodo.semana}`) || 0)
        const ratio = f.estado === 'pagado' || totalAPagar <= 0.01
          ? 1
          : Math.min(1, Math.max(0, pagadoSemana / totalAPagar))
        const periodoAbierto = periodo.estado !== 'cerrado'
        const clave = periodo.anio * 100 + periodo.semana
        const lista = semanasPorConductor.get(f.conductor_id) || []
        lista.push({
          clave,
          semana: periodo.semana,
          anio: periodo.anio,
          periodoAbierto,
          monto,
          totalAPagar,
          pagadoSemana,
          cobrado: redondear(monto * ratio),
          estado: estadoDeSemana(periodoAbierto, ratio),
        })
        semanasPorConductor.set(f.conductor_id, lista)
      }

      const facturacionPorConductor = new Map(facturaciones.map(f => [f.conductor_id, f]))
      const filas: typeof base = []
      for (const id of idsConductores) {
        const c = conductorPorId.get(id)
        if (!c) continue // de otra sede
        const r = regimen.get(id)
        if (!r && !conductoresConCargo.has(id)) continue
        const fact = facturacionPorConductor.get(id)
        const nombre = `${c.nombres || ''} ${c.apellidos || ''}`.trim() || fact?.conductor_nombre || '-'
        filas.push({
          conductor_id: id,
          conductor: formatNombreCompleto(nombre),
          documento: c.numero_dni || c.numero_cuit || fact?.conductor_dni || fact?.conductor_cuit || '-',
          tipo: r?.esCambioTarifa ? 'Cambio de tarifa' : 'Nuevo',
          desde: r?.desde || TOSHIPASS_VIGENCIA_DESDE,
          estadoConductor: (c.conductores_estados?.codigo || '').toUpperCase() === 'BAJA' ? 'BAJA' : 'ACTIVO',
          // Solo la fecha cargada: no se infiere de otra columna (si falta, se muestra "-").
          fechaBaja: (c.conductores_estados?.codigo || '').toUpperCase() === 'BAJA' && c.fecha_terminacion
            ? c.fecha_terminacion.substring(0, 10)
            : null,
          saldoActual: saldoPorConductor.get(id) || 0,
          tieneSaldo: saldoPorConductor.has(id),
          semanas: (semanasPorConductor.get(id) || []).sort((a, b) => a.clave - b.clave),
        })
      }

      setBase(filas)
    } catch (error) {
      console.error('Error cargando Toshipass:', error)
      Swal.fire('Error', 'No se pudo cargar el seguimiento de Toshipass', 'error')
    } finally {
      setLoading(false)
    }
  }, [aplicarFiltroSede])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos, sedeActualId])

  // Filas con sus montos y los filtros propios de la pestaña
  const filas = useMemo<FilaToshipass[]>(() => {
    return base
      .filter(b => {
        if (tipoFilter === 'nuevo' && b.tipo !== 'Nuevo') return false
        if (tipoFilter === 'cambio' && b.tipo !== 'Cambio de tarifa') return false
        if (estadoCondFilter === 'activo' && b.estadoConductor !== 'ACTIVO') return false
        if (estadoCondFilter === 'baja' && b.estadoConductor !== 'BAJA') return false
        return true
      })
      .map(b => {
        const semanas = b.semanas
        const facturado = redondear(semanas.reduce((sum, s) => sum + s.monto, 0))
        const cobrado = redondear(semanas.reduce((sum, s) => sum + s.cobrado, 0))
        const pendiente = redondear(semanas.filter(s => !s.periodoAbierto).reduce((sum, s) => sum + (s.monto - s.cobrado), 0))
        const enCurso = redondear(semanas.filter(s => s.periodoAbierto).reduce((sum, s) => sum + (s.monto - s.cobrado), 0))
        const ultima = semanas[semanas.length - 1]
        let estadoPago: EstadoPago = 'Sin cargos'
        if (pendiente > 0.01) estadoPago = 'Con deuda'
        else if (enCurso > 0.01) estadoPago = 'En curso'
        else if (facturado > 0) estadoPago = 'Al día'
        return {
          ...b,
          semanas,
          semanasFacturadas: semanas.length,
          facturado,
          cobrado,
          pendiente,
          enCurso,
          ultimaSemana: ultima ? etiquetaSemana(ultima.semana, ultima.anio) : '-',
          ultimaSemanaClave: ultima?.clave || 0,
          estadoPago,
        }
      })
  }, [base, tipoFilter, estadoCondFilter])

  // Filtro de las tarjetas (DataTable lo aplica después de sus filtros internos)
  const filtroTarjeta = useCallback((f: FilaToshipass) => {
    if (filtroKpi === 'nuevo') return f.tipo === 'Nuevo'
    if (filtroKpi === 'cambio') return f.tipo === 'Cambio de tarifa'
    if (filtroKpi === 'activo') return f.estadoConductor === 'ACTIVO'
    if (filtroKpi === 'baja') return f.estadoConductor === 'BAJA'
    if (filtroKpi === 'sin_cargos') return f.semanasFacturadas === 0
    return true
  }, [filtroKpi])

  // ========== MÉTRICAS (sobre las filas filtradas, sin el filtro de tarjeta) ==========
  const metricas = useMemo(() => {
    const filasBase = filasMetricas ?? filas
    const facturado = filasBase.reduce((s, f) => s + f.facturado, 0)
    const conCargos = filasBase.filter(f => f.semanasFacturadas > 0).length
    return {
      conductores: filasBase.length,
      nuevos: filasBase.filter(f => f.tipo === 'Nuevo').length,
      cambios: filasBase.filter(f => f.tipo === 'Cambio de tarifa').length,
      activos: filasBase.filter(f => f.estadoConductor === 'ACTIVO').length,
      bajas: filasBase.filter(f => f.estadoConductor === 'BAJA').length,
      semanas: filasBase.reduce((s, f) => s + f.semanasFacturadas, 0),
      sinCargos: filasBase.length - conCargos,
      facturado,
      // Promedio entre los conductores que tuvieron al menos una semana facturada
      promedio: conCargos > 0 ? facturado / conCargos : 0,
    }
  }, [filasMetricas, filas])

  // ========== DETALLE POR CONDUCTOR ==========
  function verDetalle(f: FilaToshipass) {
    const filasHtml = f.semanas.length === 0
      ? '<tr><td colspan="3" style="padding:10px;text-align:center;color:#9CA3AF;">Sin cargos de Toshipass</td></tr>'
      : [...f.semanas].reverse().map(s => `
        <tr>
          <td style="padding:5px 8px;border-bottom:1px solid #E5E7EB;font-family:monospace;">${etiquetaSemana(s.semana, s.anio)}</td>
          <td style="padding:5px 8px;border-bottom:1px solid #E5E7EB;">${s.periodoAbierto ? 'Abierto' : 'Cerrado'}</td>
          <td style="padding:5px 8px;border-bottom:1px solid #E5E7EB;text-align:right;">${formatCurrency(s.monto)}</td>
        </tr>`).join('')

    Swal.fire({
      title: `<span style="font-size:16px;">Toshipass · ${f.conductor}</span>`,
      html: `
        <div style="text-align:left;font-size:12px;padding-bottom:4px;">
          <div style="color:#6B7280;margin-bottom:10px;">
            ${f.documento} · ${f.tipo} desde ${fechaCorta(f.desde)} · ${f.estadoConductor}${f.fechaBaja ? ` desde ${fechaCorta(f.fechaBaja)}` : ''}
          </div>
          <div style="max-height:360px;overflow:auto;border:1px solid #E5E7EB;border-radius:6px;">
            <table style="display:table;width:100%;border-collapse:collapse;">
              <thead>
                <tr style="background:#F9FAFB;position:sticky;top:0;">
                  <th style="padding:6px 8px;text-align:left;">Semana</th>
                  <th style="padding:6px 8px;text-align:left;">Período</th>
                  <th style="padding:6px 8px;text-align:right;">Toshipass</th>
                </tr>
              </thead>
              <tbody>${filasHtml}</tbody>
            </table>
          </div>
        </div>`,
      width: 560,
      confirmButtonText: 'Cerrar',
      confirmButtonColor: '#ff0033',
    })
  }

  // ========== EXPORTAR ==========
  function exportarVisibles() {
    const filasExport = filasVisiblesRef.current
    if (filasExport.length === 0) {
      Swal.fire('Sin datos', 'No hay registros visibles para exportar', 'info')
      return
    }
    const hoja = XLSX.utils.json_to_sheet(filasExport.map(f => ({
      Conductor: f.conductor,
      Documento: f.documento,
      Tipo: f.tipo,
      Desde: fechaCorta(f.desde),
      'Estado Conductor': f.estadoConductor,
      'Fecha de Baja': f.fechaBaja ? fechaCorta(f.fechaBaja) : '',
      Semanas: f.semanasFacturadas,
      Facturado: f.facturado,
      Cobrado: f.cobrado,
      Pendiente: f.pendiente,
      'En Curso': f.enCurso,
      'Últ. Semana': f.ultimaSemana,
      'Saldo Actual': f.saldoActual,
      'Diferencia (saldo + facturado)': f.estadoConductor === 'BAJA' && f.tieneSaldo ? diferenciaBaja(f) : '',
      'Estado Pago': f.estadoPago,
    })))
    const libro = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(libro, hoja, 'Toshipass')
    XLSX.writeFile(libro, `toshipass_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // ========== COLUMNAS ==========
  const columnas = useMemo<ColumnDef<FilaToshipass>[]>(() => [
    {
      accessorKey: 'conductor',
      meta: { info: 'Conductor y su DNI o CUIT.' },
      header: 'Conductor',
      cell: ({ row }) => (
        <div style={{ padding: '4px 8px' }}>
          <div className="font-medium">{row.original.conductor}</div>
          <span className="text-xs text-gray-500">{row.original.documento}</span>
        </div>
      ),
    },
    {
      accessorKey: 'tipo',
      meta: { info: 'Nuevo: entró con la tarifa nueva. Cambio de tarifa: venía con la tarifa antigua y pasó a la nueva (deja de pagar garantía y paga Toshipass).' },
      header: 'Tipo',
      cell: ({ row }) => (
        <span className={`fact-badge ${row.original.tipo === 'Nuevo' ? 'fact-badge-purple' : 'fact-badge-blue'}`} style={{ fontSize: '10px', whiteSpace: 'nowrap' }}>
          {row.original.tipo}
        </span>
      ),
    },
    {
      accessorKey: 'desde',
      meta: { info: 'Fecha desde la que el conductor está en régimen Toshipass.' },
      header: 'Desde',
      cell: ({ row }) => <span style={{ fontSize: '11px' }}>{fechaCorta(row.original.desde)}</span>,
    },
    {
      accessorKey: 'estadoConductor',
      meta: { info: 'Estado actual del conductor: ACTIVO o BAJA.' },
      header: 'Estado Cond.',
      cell: ({ row }) => (
        <span className={`fact-badge ${row.original.estadoConductor === 'ACTIVO' ? 'fact-badge-green' : 'fact-badge-red'}`} style={{ fontSize: '10px' }}>
          {row.original.estadoConductor}
        </span>
      ),
    },
    {
      id: 'fechaBaja',
      meta: { info: 'Fecha de baja cargada en el conductor. - si está activo o no tiene la fecha cargada.' },
      header: 'Fecha de Baja',
      // 'YYYY-MM-DD' ordena bien como texto; sin fecha queda vacío.
      accessorFn: (row) => row.fechaBaja || '',
      cell: ({ row }) => row.original.fechaBaja
        ? <span style={{ fontSize: '11px' }}>{fechaCorta(row.original.fechaBaja)}</span>
        : <span style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>-</span>,
    },
    {
      accessorKey: 'semanasFacturadas',
      meta: { info: 'Cantidad de semanas en las que se le facturó Toshipass.' },
      header: 'Semanas',
      cell: ({ row }) => <span className="dt-badge dt-badge-blue" style={{ fontSize: '11px' }}>{row.original.semanasFacturadas}</span>,
    },
    {
      accessorKey: 'facturado',
      meta: { info: 'Total de Toshipass facturado en esas semanas.' },
      header: 'Facturado',
      cell: ({ row }) => <span className="fact-precio">{formatCurrency(row.original.facturado)}</span>,
    },
    {
      // Cuenta corriente del conductor (saldos_conductores), igual que en Garantías.
      // Solo para conductores de baja; los activos muestran "-".
      id: 'saldoActual',
      meta: { info: 'Conductores de baja y con cambio de tarifa: cuenta corriente del conductor (la misma de Saldos). Rojo: debe. Verde: a favor.' },
      header: 'Saldo Actual',
      accessorFn: (row) => (muestraSaldo(row) ? row.saldoActual : 0),
      cell: ({ row }) => (muestraSaldo(row.original)
        ? <MontoConSigno valor={row.original.saldoActual} />
        : SIN_DATO),
    },
    {
      id: 'diferencia',
      meta: { info: 'Solo conductores de baja: saldo actual + Toshipass facturado. Es lo que queda si lo facturado de Toshipass se toma a favor del conductor. Negativo: sigue debiendo.' },
      header: 'Diferencia',
      accessorFn: (row) => (row.estadoConductor === 'BAJA' && row.tieneSaldo ? diferenciaBaja(row) : 0),
      cell: ({ row }) => (row.original.estadoConductor === 'BAJA' && row.original.tieneSaldo
        ? (
          <span title="Saldo actual + Toshipass facturado">
            <MontoConSigno valor={diferenciaBaja(row.original)} />
          </span>
        )
        : SIN_DATO),
    },
    {
      id: 'acciones',
      header: 'Acciones',
      enableSorting: false,
      cell: ({ row }) => (
        <button className="dt-btn-action dt-btn-view" title="Ver semanas" onClick={() => verDetalle(row.original)}>
          <Eye size={14} />
        </button>
      ),
    },
  ], [])

  // ========== FILTROS ACTIVOS ==========
  const externalFilters = useMemo(() => {
    const chips: Array<{ id: string; label: string; onClear: () => void }> = []
    if (tipoFilter !== 'todos') {
      chips.push({ id: 'tp-tipo', label: tipoFilter === 'nuevo' ? 'Conductores nuevos' : 'Cambio de tarifa', onClear: () => setTipoFilter('todos') })
    }
    if (estadoCondFilter !== 'todos') {
      chips.push({ id: 'tp-estado-cond', label: estadoCondFilter === 'activo' ? 'Conductores activos' : 'Conductores de baja', onClear: () => setEstadoCondFilter('todos') })
    }
    if (filtroKpi) {
      chips.push({ id: 'tp-kpi', label: LABELS_KPI[filtroKpi], onClear: () => setFiltroKpi(null) })
    }
    return chips
  }, [tipoFilter, estadoCondFilter, filtroKpi])

  const limpiarFiltros = () => {
    setTipoFilter('todos')
    setEstadoCondFilter('todos')
    setFiltroKpi(null)
  }

  const kpiCard = (valor: Exclude<FiltroKpi, null>) => ({
    className: 'fact-stat-card',
    onClick: () => setFiltroKpi(prev => (prev === valor ? null : valor)),
    style: filtroKpi === valor
      ? { cursor: 'pointer', outline: '2px solid #ff0033', outlineOffset: '-2px' }
      : { cursor: 'pointer' },
  })

  const botonToggle = (activo: boolean) => ({
    padding: '4px 10px', fontSize: '11px', fontWeight: 600, borderRadius: '4px', border: 'none', cursor: 'pointer',
    background: activo ? '#ff0033' : 'transparent',
    color: activo ? 'white' : 'var(--text-secondary)',
  })

  // ========== RENDER ==========
  return (
    <>
      <LoadingOverlay show={loading} message="Cargando Toshipass..." size="lg" />

      <div className="fact-header">
        <div className="fact-header-left" style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="fact-btn fact-btn-secondary" onClick={exportarVisibles}
            title="Exportar a Excel los conductores visibles, respetando todos los filtros">
            <Download size={14} /> Exportar Registros
          </button>
        </div>
        <div className="fact-header-right" style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '2px', background: 'var(--bg-secondary)', borderRadius: '6px', padding: '2px' }}>
            {([
              { value: 'todos', label: 'Todos' },
              { value: 'nuevo', label: 'Nuevos' },
              { value: 'cambio', label: 'Cambio tarifa' },
            ] as const).map(opt => (
              <button key={opt.value} onClick={() => setTipoFilter(opt.value)} style={botonToggle(tipoFilter === opt.value)}>
                {opt.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '2px', background: 'var(--bg-secondary)', borderRadius: '6px', padding: '2px' }}>
            {([
              { value: 'todos', label: 'Todos' },
              { value: 'activo', label: 'Activos' },
              { value: 'baja', label: 'Baja' },
            ] as const).map(opt => (
              <button key={opt.value} onClick={() => setEstadoCondFilter(opt.value)} style={botonToggle(estadoCondFilter === opt.value)}>
                {opt.label}
              </button>
            ))}
          </div>
          <button className="fact-btn fact-btn-secondary" onClick={cargarDatos} title="Volver a cargar los datos">
            <RefreshCw size={14} /> Actualizar
          </button>
        </div>
      </div>

      {/* Métricas: se recalculan con cada filtro (tipo, estado, columnas y búsqueda) */}
      <div className="fact-stats">
        <div className="fact-stats-grid">
          <div className="fact-stat-card" style={{ cursor: 'pointer' }} onClick={limpiarFiltros} title="Ver todos (limpia los filtros)">
            <Users size={18} className="fact-stat-icon" />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{metricas.conductores}</span>
              <span className="fact-stat-label">Conductores</span>
            </div>
          </div>
          <div {...kpiCard('nuevo')} title="Filtrar conductores nuevos">
            <UserPlus size={18} className="fact-stat-icon" />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{metricas.nuevos}</span>
              <span className="fact-stat-label">Nuevos</span>
            </div>
          </div>
          <div {...kpiCard('cambio')} title="Filtrar conductores que pasaron por cambio de tarifa">
            <ArrowRightLeft size={18} className="fact-stat-icon" />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{metricas.cambios}</span>
              <span className="fact-stat-label">Cambio de Tarifa</span>
            </div>
          </div>
          <div {...kpiCard('activo')} title="Filtrar conductores activos">
            <UserCheck size={18} className="fact-stat-icon" style={{ color: '#16a34a' }} />
            <div className="fact-stat-content">
              <span className="fact-stat-value" style={{ color: '#16a34a' }}>{metricas.activos}</span>
              <span className="fact-stat-label">Activos</span>
            </div>
          </div>
          <div {...kpiCard('baja')} title="Filtrar conductores de baja">
            <UserX size={18} className="fact-stat-icon" style={{ color: '#dc2626' }} />
            <div className="fact-stat-content">
              <span className="fact-stat-value" style={{ color: '#dc2626' }}>{metricas.bajas}</span>
              <span className="fact-stat-label">Baja</span>
            </div>
          </div>
          <div {...kpiCard('sin_cargos')} title="Semanas facturadas. Click: conductores sin semanas facturadas">
            <CalendarDays size={18} className="fact-stat-icon" />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{metricas.semanas}</span>
              <span className="fact-stat-label">Semanas · {metricas.sinCargos} sin cargos</span>
            </div>
          </div>
          <div className="fact-stat-card" title="Toshipass facturado y promedio por conductor con cargos">
            <DollarSign size={18} className="fact-stat-icon" />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{formatCurrency(metricas.facturado)}</span>
              <span className="fact-stat-label">Facturado · prom. {formatCurrency(metricas.promedio)}</span>
            </div>
          </div>
        </div>
      </div>

      <DataTable
        data={filas}
        columns={columnas}
        loading={loading}
        searchPlaceholder="Buscar por conductor o documento..."
        globalFilter={busqueda}
        onGlobalFilterChange={setBusqueda}
        rowFilter={filtroTarjeta}
        onBaseDataChange={setFilasMetricas}
        onFilteredDataChange={(rows) => { filasVisiblesRef.current = rows }}
        externalFilters={externalFilters}
        onClearAllFilters={limpiarFiltros}
        emptyIcon={<Ticket size={48} />}
        emptyTitle="Sin conductores en Toshipass"
        emptyDescription="No hay conductores en régimen Toshipass para los filtros elegidos"
        pageSize={100}
        pageSizeOptions={[10, 20, 50, 100]}
      />
    </>
  )
}
