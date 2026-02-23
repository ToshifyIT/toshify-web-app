import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useSede } from '../contexts/SedeContext'

const ESTADOS_EXCLUIDOS = ['ROBO', 'DESTRUCCION_TOTAL', 'JUBILADO', 'DEVUELTO_PROVEEDOR']

interface DashboardCardValue {
  value: string
  subtitle: string
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
  diasSinSiniestro: DashboardCardValue
  diasSinRobo: DashboardCardValue
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
        const [asignacionesRes, vehiculosRes, siniestrosRes, garantiasRes] = await Promise.all([
          aplicarFiltroSede(
            supabase
              .from('asignaciones')
              .select(`
                id,
                codigo,
                vehiculo_id,
                fecha_programada,
                fecha_inicio,
                modalidad,
                horario,
                estado,
                created_at,
                vehiculos (
                  patente,
                  marca,
                  modelo,
                  anio,
                  estado_id,
                  vehiculos_tipos (
                    descripcion
                  ),
                  vehiculos_estados (
                    codigo,
                    descripcion
                  )
                ),
                asignaciones_conductores (
                  id,
                  conductor_id,
                  estado,
                  horario,
                  confirmado,
                  fecha_confirmacion,
                  conductores (
                    id,
                    nombres,
                    apellidos,
                    numero_licencia,
                    telefono_contacto
                  )
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
            supabase.from('v_siniestros_completos' as any).select('*')
          ).order('fecha_siniestro', { ascending: false }),
          aplicarFiltroSede(
            supabase
              .from('garantias_conductores')
              .select('*')
          ).order('conductor_nombre')
        ])

        if (asignacionesRes.error) throw asignacionesRes.error
        if (vehiculosRes.error) throw vehiculosRes.error
        if (siniestrosRes.error) throw siniestrosRes.error
        if (garantiasRes.error) throw garantiasRes.error

        const asignaciones = (asignacionesRes.data || []) as any[]
        const vehiculos = (vehiculosRes.data || []) as any[]
        const siniestros = (siniestrosRes.data || []) as any[]
        const garantias = (garantiasRes.data || []) as any[]

        const vehiculosConAsignacion = new Set(asignaciones.map(a => a.vehiculo_id))
        let totalFlota = 0
        let operativos = 0
        let pkgOn = 0
        let enUso = 0
        let enTaller = 0
        const pkgOnSinAsignacion: any[] = []

        for (const v of vehiculos) {
          const estadoCodigo = v.vehiculos_estados?.codigo || ''
          if (!ESTADOS_EXCLUIDOS.includes(estadoCodigo)) totalFlota++
          if (estadoCodigo === 'PKG_ON_BASE') {
            pkgOn++
            if (!vehiculosConAsignacion.has(v.id)) pkgOnSinAsignacion.push(v)
            operativos++
          } else if (estadoCodigo === 'EN_USO') {
            enUso++
            operativos++
          } else if (estadoCodigo === 'REPARACION' || estadoCodigo === 'MANTENIMIENTO') {
            enTaller++
          }
        }

        let turnoCount = 0
        let cargoCount = 0
        let cuposOcupados = 0
        let vacantesD = 0
        let vacantesN = 0
        for (const a of asignaciones) {
          const conductores = a.asignaciones_conductores || []
          if (a.horario === 'TURNO') {
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
          totalidadTurnos > 0 ? (((totalidadTurnos - turnosDisp) / totalidadTurnos) * 100).toFixed(1) : '0'
        const porcentajeOperatividad =
          totalFlota > 0 ? ((operativos / totalFlota) * 100).toFixed(1) : '0'

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

        setStats({
          totalFlota: {
            value: String(totalFlota),
            subtitle: `${enUso} activos · ${enTaller} taller · ${pkgOnSinAsignacion.length} disp.`,
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
            value: '$600K',
            subtitle: '2 en proceso de baja',
          },
          diasSinSiniestro: {
            value: diasDesdeUltimoSiniestro !== null ? String(diasDesdeUltimoSiniestro) : '-',
            subtitle: `Último: ${formatDateEs(ultimoSiniestro)}`,
          },
          diasSinRobo: {
            value: diasDesdeUltimoRobo !== null ? String(diasDesdeUltimoRobo) : '-',
            subtitle: `Último: ${formatDateEs(ultimoRobo)}`,
          },
        })
      } catch (error) {
        console.error('Error cargando estadísticas del dashboard:', error)
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

