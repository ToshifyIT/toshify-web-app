import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useSede } from '../contexts/SedeContext'

const ESTADOS_EXCLUIDOS = ['ROBO', 'DESTRUCCION_TOTAL', 'JUBILADO', 'DEVUELTO_PROVEEDOR']

interface DashboardCardValue {
  value: string
  subtitle: string
  extra?: any
}

interface DashboardStats {
  totalFlota: DashboardCardValue
  vehiculosActivos: DashboardCardValue
  disponibles: DashboardCardValue
  turnosDisponibles: DashboardCardValue
  porcentajeOcupacion: DashboardCardValue
  porcentajeOperatividad: DashboardCardValue
  fondoGarantia: DashboardCardValue
  pendienteDevolucion: DashboardCardValue
  reintegroReciente: DashboardCardValue
  reintegroAntiguo: DashboardCardValue
  cobroPendiente: DashboardCardValue
  diasSinSiniestro: DashboardCardValue
  diasSinRobo: DashboardCardValue
  totalSaldo: DashboardCardValue
  totalSaldoPendiente: DashboardCardValue
  totalSaldoMora: DashboardCardValue
  vueltasMundo: DashboardCardValue
}

function parseFechaSiniestro(fechaStr: string | undefined | null) {
  if (!fechaStr) return null
  const raw = fechaStr.split('T')[0]
  if (raw.includes('-')) {
    const parts = raw.split('-')
    if (parts.length !== 3) return null
    const [yearStr, monthStr, dayStr] = parts
    const year = Number(yearStr)
    const month = Number(monthStr)
    const day = Number(dayStr)
    if (!year || !month || !day) return null
    return new Date(year, month - 1, day)
  }
  if (raw.includes('/')) {
    const parts = raw.split('/')
    if (parts.length !== 3) return null
    const [dayStr, monthStr, yearStr] = parts
    const year = Number(yearStr)
    const month = Number(monthStr)
    const day = Number(dayStr)
    if (!year || !month || !day) return null
    return new Date(year, month - 1, day)
  }
  return null
}

function esCategoriaRobo(nombre: string | undefined | null) {
  if (!nombre) return false
  const normalized = nombre.toLowerCase().trim()
  return normalized === 'robo' || normalized === 'robo parcial'
}

function diffDias(from: Date, to: Date) {
  const fromDate = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const toDate = new Date(to.getFullYear(), to.getMonth(), to.getDate())
  const diffMs = fromDate.getTime() - toDate.getTime()
  const dias = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  return dias < 0 ? 0 : dias
}

export function useDashboardStats() {
  const { aplicarFiltroSede, sedeActualId } = useSede()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<DashboardStats | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const [asignacionesRes, vehiculosRes, siniestrosRes, garantiasRes, saldosRes, conductoresRes, wialonRes] = await Promise.all([
          aplicarFiltroSede(
            supabase
              .from('asignaciones')
              .select(`
                id,
                vehiculo_id,
                horario,
                estado,
                created_at,
                asignaciones_conductores (
                  conductor_id,
                  estado,
                  horario
                )
              `)
          )
            .in('estado', ['activo', 'activa'])
            .order('created_at', { ascending: false }),
          aplicarFiltroSede(
            supabase
              .from('vehiculos')
              .select(
                'id, patente, marca, modelo, anio, estado_id, vehiculos_estados(codigo, descripcion), vehiculos_tipos(descripcion)'
              )
              .is('deleted_at', null)
          ),
          aplicarFiltroSede(
            supabase.from('v_siniestros_completos' as any).select('fecha_siniestro, categoria_nombre')
          ).order('fecha_siniestro', { ascending: false }).limit(2000),
          aplicarFiltroSede(
            supabase
              .from('garantias_conductores')
              .select('conductor_id, monto_pagado, monto_devuelto, estado, monto_cuota_semanal, cuotas_pagadas, cuotas_totales')
          ),
          aplicarFiltroSede(
            supabase
              .from('saldos_conductores')
              .select('saldo_actual, monto_mora_acumulada, ultima_actualizacion')
          ),
          aplicarFiltroSede(
            supabase
              .from('conductores')
              .select('id, estado_id, fecha_terminacion')
          ),
          supabase.rpc('sum_kilometraje_total', {
            p_sede_id: sedeActualId || null
          })
        ])

        if (asignacionesRes.error) throw asignacionesRes.error
        if (vehiculosRes.error) throw vehiculosRes.error
        if (siniestrosRes.error) throw siniestrosRes.error
        if (garantiasRes.error) throw garantiasRes.error
        if (saldosRes.error) throw saldosRes.error
        if (conductoresRes.error) throw conductoresRes.error
        if (wialonRes.error) throw wialonRes.error

        const asignaciones = (asignacionesRes.data || []) as any[]
        const vehiculos = (vehiculosRes.data || []) as any[]
        const siniestros = (siniestrosRes.data || []) as any[]
        const garantias = (garantiasRes.data || []) as any[]
        const saldos = (saldosRes.data || []) as any[]
        const conductores = (conductoresRes.data || []) as any[]
        // RPC returns a single number directly
        const totalKmHistorico = Number(wialonRes.data) || 0
        const vueltasMundoVal = totalKmHistorico / 40000

        const vehiculosConAsignacion = new Set(asignaciones.map(a => a.vehiculo_id))
        let totalFlota = 0
        let operativos = 0
        let pkgOn = 0
        let enUso = 0
        let tallerCount = 0
        let dispCount = 0
        const pkgOnSinAsignacion: any[] = []

        for (const v of vehiculos) {
          const estadoCodigo = v.vehiculos_estados?.codigo || ''
          const estadoDescripcion = v.vehiculos_estados?.descripcion || ''
          
          if (!ESTADOS_EXCLUIDOS.includes(estadoCodigo)) totalFlota++
          
          if (estadoCodigo === 'PKG_ON_BASE') {
            pkgOn++
            if (!vehiculosConAsignacion.has(v.id)) pkgOnSinAsignacion.push(v)
            operativos++
          } else if (estadoCodigo === 'EN_USO') {
            enUso++
            operativos++
          }

          // Lógica solicitada para Taller: descripción contiene "Taller"
          if (estadoDescripcion.toLowerCase().includes('taller')) {
            tallerCount++
          }

          // Lógica solicitada para Disp: ID específico
          if (v.estado_id === 'f3dc8cca-45cd-4d46-aa28-72bde0ead8a8') {
            dispCount++
          }
        }

        let turnoCount = 0
        let cargoCount = 0
        let cuposOcupados = 0
        let vacantesD = 0
        let vacantesN = 0
        for (const a of asignaciones) {
          const conductores = a.asignaciones_conductores || []
          if (a.horario === 'turno') {
            turnoCount++
            const conductorD = conductores.find(
              (ac: any) =>
                (ac.horario === 'diurno' || ac.horario === 'DIURNO' || ac.horario === 'D') &&
                ac.estado !== 'cancelado'
            )
            const conductorN = conductores.find(
              (ac: any) =>
                (ac.horario === 'nocturno' || ac.horario === 'NOCTURNO' || ac.horario === 'N') &&
                ac.estado !== 'cancelado'
            )
            if (conductorD?.conductor_id) cuposOcupados++
            else vacantesD++
            if (conductorN?.conductor_id) cuposOcupados++
            else vacantesN++
          } else {
            cargoCount++
            const tieneConductor = conductores.some((ac: any) => ac.conductor_id && ac.estado !== 'cancelado')
            if (tieneConductor) cuposOcupados++
          }
        }

        const cuposTotales = turnoCount * 2 + cargoCount
        const totalidadTurnos = (vehiculosConAsignacion.size + pkgOnSinAsignacion.length) * 2
        const turnosDisp = vacantesD + vacantesN + pkgOnSinAsignacion.length * 2
        const cuposDisponibles = cuposTotales - cuposOcupados
        const porcentajeOcupacionGeneral =
          totalidadTurnos > 0
            ? Number((((totalidadTurnos - turnosDisp) / totalidadTurnos) * 100).toFixed(1))
            : 0

        // UNIFICACIÓN DE CRITERIO: % Operatividad debe coincidir con Dashboard Flota
        // Solo contamos vehículos EN_USO (efectivamente trabajando), ignorando PKG_ON_BASE
        const porcentajeOperatividad =
          totalFlota > 0 ? Number(((enUso / totalFlota) * 100).toFixed(1)) : 0

        const today = new Date()
        const robosFechas = siniestros
          .filter(s => esCategoriaRobo(s.categoria_nombre))
          .map(s => parseFechaSiniestro(s.fecha_siniestro))
          .filter((d): d is Date => d !== null)
          .sort((a, b) => b.getTime() - a.getTime())
        const siniestrosFechas = siniestros
          .filter(s => !esCategoriaRobo(s.categoria_nombre))
          .map(s => parseFechaSiniestro(s.fecha_siniestro))
          .filter((d): d is Date => d !== null)
          .sort((a, b) => b.getTime() - a.getTime())

        const ultimoRobo = robosFechas[0]
        const ultimoSiniestro = siniestrosFechas[0]
        const diasDesdeUltimoRobo = ultimoRobo ? diffDias(today, ultimoRobo) : null
        const diasDesdeUltimoSiniestro = ultimoSiniestro ? diffDias(today, ultimoSiniestro) : null

        const formatDateEs = (d: Date | undefined) => (d ? d.toLocaleDateString('es-AR') : '-')

        const formatCurrencyArs = (value: number) =>
          new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }).format(value)

        const totalPagadoGarantias = garantias.reduce((sum: number, g: any) => sum + (g.monto_pagado || 0), 0)
        const conductoresGarantiaActiva = garantias.filter(
          (g: any) => g.estado === 'en_curso'
        ).length

        // Calcular Reintegro de Garantía (Pendiente de Devolución)
        const conductoresMap = new Map(conductores.map((c: any) => [c.id, { estado_id: c.estado_id, fecha_terminacion: c.fecha_terminacion }]))
        const ESTADO_ACTIVO = '57e9de5f-e6fc-4ff7-8d14-cf8e13e9dbe2'

        const garantiasEnDevolucion = garantias.filter((g: any) => {
          // Si ya está marcado como en_devolucion en BD
          if (g.estado === 'en_devolucion') return true

          // Si está cancelada, ignorar
          if (g.estado === 'cancelada') return false

          // Verificar lógica: Conductor BAJA + Saldo pagado > 0
          const conductor = conductoresMap.get(g.conductor_id)
          const esBaja = conductor && conductor.estado_id !== ESTADO_ACTIVO
          const montoPagado = g.monto_pagado || 0

          return esBaja && montoPagado > 0
        })

        const totalReintegroPendiente = garantiasEnDevolucion.reduce((sum: number, g: any) => {
          const pagado = g.monto_pagado || 0
          const devuelto = g.monto_devuelto || 0
          const pendiente = pagado - devuelto
          return sum + (pendiente > 0 ? pendiente : 0)
        }, 0)

        // Reintegros segmentados por antigüedad de baja (120 días)
        const hoy = new Date()
        const LIMITE_DIAS = 120

        let reintegroReciente = 0
        let reintegroAntiguo = 0
        let countReciente = 0
        let countAntiguo = 0

        for (const g of garantiasEnDevolucion) {
          const pagado = g.monto_pagado || 0
          const devuelto = g.monto_devuelto || 0
          const pendiente = pagado - devuelto
          if (pendiente <= 0) continue

          const conductor = conductoresMap.get(g.conductor_id)
          const fechaTermStr = conductor?.fecha_terminacion

          if (fechaTermStr) {
            const fechaTerm = new Date(fechaTermStr)
            const diffMs = hoy.getTime() - fechaTerm.getTime()
            const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24))

            if (diffDias <= LIMITE_DIAS) {
              reintegroReciente += pendiente
              countReciente++
            } else {
              reintegroAntiguo += pendiente
              countAntiguo++
            }
          } else {
            // Sin fecha de terminación → se suma al acumulado antiguo
            reintegroAntiguo += pendiente
            countAntiguo++
          }
        }

        // Calcular Total Saldo (solo saldos negativos = deuda)
        const totalSaldoActual = saldos
          .filter((item: any) => (item.saldo_actual || 0) < 0)
          .reduce((sum: number, item: any) => sum + Math.abs(item.saldo_actual), 0)
        const totalMora = saldos.reduce((sum, item) => sum + (item.monto_mora_acumulada || 0), 0)
        const totalSaldoFinal = totalSaldoActual + totalMora

        // Calcular Deuda Actual y Deuda Semana Pasada
        const totalDeudaActual = saldos.reduce((sum: number, item: any) => {
          const saldo = item.saldo_actual || 0
          // Sumamos solo saldos negativos (deuda)
          return sum + (saldo < 0 ? Math.abs(saldo) : 0)
        }, 0)

        const oneWeekAgo = new Date()
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

        const deudaSemanaPasada = saldos.reduce((sum: number, item: any) => {
          const saldo = item.saldo_actual || 0
          const ultimaAct = item.ultima_actualizacion ? new Date(item.ultima_actualizacion) : null
          
          // Sumamos deuda actualizada en la última semana
          if (saldo < 0 && ultimaAct && ultimaAct >= oneWeekAgo) {
            return sum + Math.abs(saldo)
          }
          return sum
        }, 0)

        const porcentajeDeudaSemanaPasada = totalDeudaActual > 0 
          ? ((deudaSemanaPasada / totalDeudaActual) * 100).toFixed(1)
          : '0.0'

        setStats({
          totalFlota: {
            value: String(totalFlota),
            subtitle: `${enUso} activos · ${tallerCount} taller · ${dispCount} disp.`,
          },
          vehiculosActivos: {
            value: String(vehiculosConAsignacion.size),
            subtitle: '',
          },
          disponibles: {
            value: String(pkgOnSinAsignacion.length),
            subtitle: '',
          },
          turnosDisponibles: {
            value: String(cuposDisponibles),
            subtitle: '',
          },
          porcentajeOcupacion: {
            value: `${porcentajeOcupacionGeneral}%`,
            subtitle: `${cuposOcupados} de ${cuposTotales} turnos`,
          },
          porcentajeOperatividad: {
            value: `${porcentajeOperatividad}%`,
            subtitle: `${operativos} de ${totalFlota} vehículos`,
          },
          fondoGarantia: {
            value: formatCurrencyArs(totalPagadoGarantias),
            subtitle: `${conductoresGarantiaActiva} conductores activos`,
          },
          pendienteDevolucion: {
            value: formatCurrencyArs(totalReintegroPendiente),
            subtitle: `${garantiasEnDevolucion.length} en devolución`,
          },
          reintegroReciente: {
            value: formatCurrencyArs(reintegroReciente),
            subtitle: `${countReciente} conductores (≤ 120 días)`,
          },
          reintegroAntiguo: {
            value: formatCurrencyArs(reintegroAntiguo),
            subtitle: `${countAntiguo} conductores (> 120 días)`,
          },
          cobroPendiente: {
            value: formatCurrencyArs(totalDeudaActual),
            subtitle: `${formatCurrencyArs(deudaSemanaPasada)} (${porcentajeDeudaSemanaPasada}%)`,
            extra: {
              deudaSemanaPasada: formatCurrencyArs(deudaSemanaPasada),
              porcentaje: porcentajeDeudaSemanaPasada,
              tooltip: 'Porcentaje de la deuda total que corresponde a saldos actualizados en los últimos 7 días'
            }
          },
          diasSinSiniestro: {
            value: diasDesdeUltimoSiniestro !== null ? String(diasDesdeUltimoSiniestro) : '-',
            subtitle: `Último: ${formatDateEs(ultimoSiniestro)}`,
          },
          diasSinRobo: {
            value: diasDesdeUltimoRobo !== null ? String(diasDesdeUltimoRobo) : '-',
            subtitle: `Último: ${formatDateEs(ultimoRobo)}`,
          },
          totalSaldo: {
            value: formatCurrencyArs(totalSaldoFinal),
            subtitle: 'Saldo Actual + Mora'
          },
          totalSaldoPendiente: {
            value: formatCurrencyArs(totalSaldoActual),
            subtitle: `${saldos.filter(s => (s.saldo_actual || 0) < 0).length} conductores con deuda`
          },
          totalSaldoMora: {
            value: formatCurrencyArs(totalMora),
            subtitle: `${saldos.filter(s => (s.monto_mora_acumulada || 0) > 0).length} conductores con mora`
          },
          vueltasMundo: {
            value: vueltasMundoVal.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
            subtitle: 'Histórico global'
          }
        })
      } catch {
        setStats(null)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [sedeActualId, aplicarFiltroSede])

  const memoized = useMemo(() => ({ stats, loading }), [stats, loading])
  return memoized
}

