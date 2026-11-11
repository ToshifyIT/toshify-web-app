// src/modules/asignaciones/useAltasComoAgente.ts
// Agentes: indicadores "como agente" (rendimiento individual, por conductores.guia =
// quién cargó al conductor), con el mismo criterio que el Dashboard General:
//  - Altas: conductores NUEVOS del agente con su primer turno esta semana
//    (kpi_altas_conductores) y bajas de sus conductores (kpi_bajas).
//  - Retención: de los conductores nuevos del agente, cuántos seguían sin baja al cumplir
//    4 y 12 semanas desde su primer turno (hitos cumplidos en los últimos 12 meses, como
//    el Cohort Retention del Dashboard Directivo).
// Es distinto de las altas/bajas "en su flota" (useMovimientosFlota), que cuentan a
// cualquiera que entra o sale de un auto del que el agente es responsable.
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { FILTRO_SIN_INTERNOS } from '../../utils/conductorUtils'
import { useSede } from '../../contexts/SedeContext'
import { hoyART, sumarDiasISO } from '../../utils/fechaArgentina'
import { etiquetaGuia, leerTodo } from '../reportes/kpis-v2/indicadoresModulosService'
import { lunesDeEstaSemana } from './useMovimientosFlota'

export interface MovimientoAgente {
  tipo: 'alta' | 'baja'
  /** 'YYYY-MM-DD' */
  dia: string
  conductor: string
  /** Guía homologado del conductor (ej. «Ali Verenzuela») */
  guia: string
  motivo: string | null
}

/** Conductor nuevo que ya cumplió un hito (4 o 12 semanas) desde su primer turno. */
export interface HitoRetencion {
  semanas: 4 | 12
  conductor: string
  guia: string
  primerTurno: string
  /** Fecha de la baja, si se fue antes del hito */
  bajaAntes: string | null
  retenido: boolean
}

export const HITOS_RETENCION = [4, 12] as const
/** Ventana de hitos cumplidos que se miran (como el Dashboard Directivo). */
const DIAS_VENTANA_RETENCION = 365

export function useAltasComoAgente(activo: boolean): {
  movimientos: MovimientoAgente[]
  retencion: HitoRetencion[]
  cargando: boolean
} {
  const { sedeActualId, aplicarFiltroSede } = useSede()
  const [movimientos, setMovimientos] = useState<MovimientoAgente[]>([])
  const [retencion, setRetencion] = useState<HitoRetencion[]>([])
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    if (!activo) return
    let cancelado = false
    const lunes = lunesDeEstaSemana()
    const hoy = hoyART()
    // Primeros turnos desde hace 12 meses + 12 semanas: así entran todos los hitos de 12
    // semanas cumplidos en los últimos 12 meses.
    const desde = sumarDiasISO(hoy, -(DIAS_VENTANA_RETENCION + 12 * 7))
    const filtroSede = <T,>(q: T): T => aplicarFiltroSede(q)

    const cargar = async () => {
      setCargando(true)
      try {
        const [conductores, altas, bajas] = await Promise.all([
          leerTodo<{ id: string; nombres: string | null; apellidos: string | null; guia: string | null }>(
            (a, b) => filtroSede((supabase.from('conductores') as any)
              .select('id, nombres, apellidos, guia').not(...FILTRO_SIN_INTERNOS)
              .order('id'))
              .range(a, b),
          ),
          leerTodo<{ fecha: string; conductor_id: string }>(
            (a, b) => (supabase.rpc as any)('kpi_altas_conductores', {
              p_sede_id: sedeActualId ?? null, p_desde: desde, p_hasta: hoy,
            }).order('fecha').order('conductor_id').range(a, b),
          ).catch(err => {
            console.warn('[Agentes] Sin altas por conductor (falta sql/kpi_altas_conductores.sql?)', err)
            return [] as { fecha: string; conductor_id: string }[]
          }),
          leerTodo<{ fecha: string; conductor_id: string | null; motivo: string | null }>(
            (a, b) => filtroSede((supabase.from('kpi_bajas' as any) as any)
              .select('fecha, conductor_id, motivo')
              .gte('fecha', desde)
              .lte('fecha', hoy)
              .order('fecha')
              .order('conductor_id'))
              .range(a, b),
          ),
        ])
        const porId = new Map(conductores.map(c => [c.id, {
          nombre: `${c.nombres || ''} ${c.apellidos || ''}`.replace(/\s+/g, ' ').trim(),
          guia: etiquetaGuia(c.guia),
        }]))

        // Bajas por conductor (ordenadas), para ver si se fue antes de cada hito
        const bajasPorConductor = new Map<string, string[]>()
        for (const x of bajas) {
          if (!x.conductor_id) continue
          const lista = bajasPorConductor.get(x.conductor_id) ?? []
          lista.push(String(x.fecha).slice(0, 10))
          bajasPorConductor.set(x.conductor_id, lista)
        }
        for (const lista of bajasPorConductor.values()) lista.sort()

        const lista: MovimientoAgente[] = []
        const hitos: HitoRetencion[] = []
        const inicioVentana = sumarDiasISO(hoy, -DIAS_VENTANA_RETENCION)
        for (const x of altas) {
          const c = porId.get(x.conductor_id)
          if (!c) continue // de otra sede
          const primer = String(x.fecha).slice(0, 10)
          if (primer >= lunes) {
            lista.push({ tipo: 'alta', dia: primer, conductor: c.nombre, guia: c.guia, motivo: null })
          }
          for (const semanas of HITOS_RETENCION) {
            const hito = sumarDiasISO(primer, semanas * 7)
            if (hito > hoy || hito < inicioVentana) continue
            const bajaAntes = (bajasPorConductor.get(x.conductor_id) ?? [])
              .find(f => f >= primer && f < hito) ?? null
            hitos.push({
              semanas, conductor: c.nombre, guia: c.guia, primerTurno: primer, bajaAntes, retenido: !bajaAntes,
            })
          }
        }
        for (const x of bajas) {
          const dia = String(x.fecha).slice(0, 10)
          if (dia < lunes) continue
          const c = x.conductor_id ? porId.get(x.conductor_id) : undefined
          if (!c) continue
          lista.push({ tipo: 'baja', dia, conductor: c.nombre, guia: c.guia, motivo: x.motivo })
        }
        lista.sort((a, b) => b.dia.localeCompare(a.dia))
        hitos.sort((a, b) => b.primerTurno.localeCompare(a.primerTurno))
        if (!cancelado) {
          setMovimientos(lista)
          setRetencion(hitos)
        }
      } catch (err) {
        console.error('[Agentes] No se pudieron cargar los indicadores como agente:', err)
        if (!cancelado) {
          setMovimientos([])
          setRetencion([])
        }
      } finally {
        if (!cancelado) setCargando(false)
      }
    }
    cargar()
    return () => { cancelado = true }
  }, [activo, sedeActualId, aplicarFiltroSede])

  return { movimientos, retencion, cargando }
}
