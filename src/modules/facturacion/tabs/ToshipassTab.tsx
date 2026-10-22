// src/modules/facturacion/tabs/ToshipassTab.tsx
// Seguimiento de los cobros de Toshipass (concepto P027), el cargo semanal que reemplaza
// a la garantía en la tarifa nueva (ver utils/toshipass.ts).
//
// Por cada conductor en régimen Toshipass muestra, dentro del rango de semanas elegido:
// lo facturado, lo cobrado, lo pendiente y lo que está en curso (período abierto).
//
// Cobrado: Toshipass no tiene pagos propios, se cobra junto con la facturación semanal.
// Se toma la proporción pagada de esa semana (pagos "facturacion_semanal" de la semana
// sobre el total a pagar) y se aplica al monto de Toshipass. Semana marcada como pagada,
// o sin nada que pagar, cuenta como cobrada completa.
//
// Las métricas se calculan sobre las filas que quedan después de TODOS los filtros
// (rango de semanas, tipo, estado del conductor, filtros de columna y búsqueda). Las
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
  semanasFacturadas: number
  facturado: number
  cobrado: number
  pendiente: number
  enCurso: number
  ultimaSemana: string
  ultimaSemanaClave: number
  saldoActual: number
  estadoPago: EstadoPago
  semanas: SemanaToshipass[]
}

interface OpcionSemana {
  clave: number
  label: string
}

const LABELS_KPI: Record<Exclude<FiltroKpi, null>, string> = {
  nuevo: 'Conductores nuevos',
  cambio: 'Cambio de tarifa',
  activo: 'Conductores activos',
  baja: 'Conductores de baja',
  sin_cargos: 'Sin semanas facturadas',
}

const redondear = (n: number) => Math.round(n * 100) / 100
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
  // Datos base: semanas facturadas por conductor (sin filtrar por rango)
  const [base, setBase] = useState<Array<Omit<FilaToshipass, 'semanasFacturadas' | 'facturado' | 'cobrado' | 'pendiente' | 'enCurso' | 'ultimaSemana' | 'ultimaSemanaClave' | 'estadoPago'>>>([])
  const [opcionesSemana, setOpcionesSemana] = useState<OpcionSemana[]>([])

  // Filtros propios de la pestaña
  const [semanaDesde, setSemanaDesde] = useState<number | null>(null)
  const [semanaHasta, setSemanaHasta] = useState<number | null>(null)
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
        numero_cuit: string | null; conductores_estados: { codigo: string } | null
      }>(idsConductores, lote => aplicarFiltroSede((supabase.from('conductores') as any)
        .select('id, nombres, apellidos, numero_dni, numero_cuit, conductores_estados(codigo)')
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
      const semanasDisponibles = new Map<number, string>()
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
        semanasDisponibles.set(clave, etiquetaSemana(periodo.semana, periodo.anio))
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
          saldoActual: saldoPorConductor.get(id) || 0,
          semanas: (semanasPorConductor.get(id) || []).sort((a, b) => a.clave - b.clave),
        })
      }

      const opciones = [...semanasDisponibles.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([clave, label]) => ({ clave, label }))
      setOpcionesSemana(opciones)
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

  // Rango de semanas: si el elegido ya no existe (cambio de sede), se usa todo
  const rangoDesde = semanaDesde !== null && opcionesSemana.some(o => o.clave === semanaDesde) ? semanaDesde : null
  const rangoHasta = semanaHasta !== null && opcionesSemana.some(o => o.clave === semanaHasta) ? semanaHasta : null

  // Filas con los montos del rango y los filtros propios de la pestaña
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
        const semanas = b.semanas.filter(s =>
          (rangoDesde === null || s.clave >= rangoDesde) && (rangoHasta === null || s.clave <= rangoHasta))
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
  }, [base, tipoFilter, estadoCondFilter, rangoDesde, rangoHasta])

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
      ? '<tr><td colspan="3" style="padding:10px;text-align:center;color:#9CA3AF;">Sin cargos de Toshipass en el rango elegido</td></tr>'
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
            ${f.documento} · ${f.tipo} desde ${fechaCorta(f.desde)} · ${f.estadoConductor}
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
      Semanas: f.semanasFacturadas,
      Facturado: f.facturado,
      Cobrado: f.cobrado,
      Pendiente: f.pendiente,
      'En Curso': f.enCurso,
      'Últ. Semana': f.ultimaSemana,
      'Saldo Actual': f.saldoActual,
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
      header: 'Tipo',
      cell: ({ row }) => (
        <span className={`fact-badge ${row.original.tipo === 'Nuevo' ? 'fact-badge-purple' : 'fact-badge-blue'}`} style={{ fontSize: '10px', whiteSpace: 'nowrap' }}>
          {row.original.tipo}
        </span>
      ),
    },
    {
      accessorKey: 'desde',
      header: 'Desde',
      cell: ({ row }) => <span style={{ fontSize: '11px' }}>{fechaCorta(row.original.desde)}</span>,
    },
    {
      accessorKey: 'estadoConductor',
      header: 'Estado Cond.',
      cell: ({ row }) => (
        <span className={`fact-badge ${row.original.estadoConductor === 'ACTIVO' ? 'fact-badge-green' : 'fact-badge-red'}`} style={{ fontSize: '10px' }}>
          {row.original.estadoConductor}
        </span>
      ),
    },
    {
      accessorKey: 'semanasFacturadas',
      header: 'Semanas',
      cell: ({ row }) => <span className="dt-badge dt-badge-blue" style={{ fontSize: '11px' }}>{row.original.semanasFacturadas}</span>,
    },
    {
      accessorKey: 'facturado',
      header: 'Facturado',
      cell: ({ row }) => <span className="fact-precio">{formatCurrency(row.original.facturado)}</span>,
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
    if (rangoDesde !== null || rangoHasta !== null) {
      const desde = opcionesSemana.find(o => o.clave === rangoDesde)?.label || 'inicio'
      const hasta = opcionesSemana.find(o => o.clave === rangoHasta)?.label || 'hoy'
      chips.push({ id: 'tp-rango', label: `Semanas: ${desde} → ${hasta}`, onClear: () => { setSemanaDesde(null); setSemanaHasta(null) } })
    }
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
  }, [rangoDesde, rangoHasta, opcionesSemana, tipoFilter, estadoCondFilter, filtroKpi])

  const limpiarFiltros = () => {
    setSemanaDesde(null)
    setSemanaHasta(null)
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

  const selectSemanaStyle = {
    padding: '4px 8px', fontSize: '12px', borderRadius: '6px',
    border: '1px solid var(--border-primary)', background: 'var(--bg-primary)', color: 'var(--text-primary)',
  }

  // ========== RENDER ==========
  return (
    <>
      <LoadingOverlay show={loading} message="Cargando Toshipass..." size="lg" />

      <div className="fact-header">
        <div className="fact-header-left" style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Semanas</span>
          <select
            value={rangoDesde ?? ''}
            onChange={e => setSemanaDesde(e.target.value ? Number(e.target.value) : null)}
            style={selectSemanaStyle}
            title="Primera semana del rango"
          >
            <option value="">Desde el inicio</option>
            {opcionesSemana
              .filter(o => rangoHasta === null || o.clave <= rangoHasta)
              .map(o => <option key={o.clave} value={o.clave}>{o.label}</option>)}
          </select>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>→</span>
          <select
            value={rangoHasta ?? ''}
            onChange={e => setSemanaHasta(e.target.value ? Number(e.target.value) : null)}
            style={selectSemanaStyle}
            title="Última semana del rango"
          >
            <option value="">Hasta hoy</option>
            {opcionesSemana
              .filter(o => rangoDesde === null || o.clave >= rangoDesde)
              .map(o => <option key={o.clave} value={o.clave}>{o.label}</option>)}
          </select>
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

      {/* Métricas: se recalculan con cada filtro (rango, tipo, estado, columnas y búsqueda) */}
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
          <div {...kpiCard('sin_cargos')} title="Semanas facturadas en el rango. Click: conductores sin semanas facturadas">
            <CalendarDays size={18} className="fact-stat-icon" />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{metricas.semanas}</span>
              <span className="fact-stat-label">Semanas · {metricas.sinCargos} sin cargos</span>
            </div>
          </div>
          <div className="fact-stat-card" title="Toshipass facturado en las semanas del rango y promedio por conductor con cargos">
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
