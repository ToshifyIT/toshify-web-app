// src/modules/asignaciones/useMovimientosFlota.ts
// Para Agentes: altas y bajas en los autos, desde cuándo está vacante cada turno
// (historialFlota.ts) y lo programado para cada turno (programaciones de onboarding y
// asignaciones programadas), para marcar los vacantes que ya tienen a alguien en camino.
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useSede } from '../../contexts/SedeContext'
import { haceDiasART, hoyART, sumarDiasISO } from '../../utils/fechaArgentina'
import { cargarHistorialFlota, turnoDe } from './historialFlota'
import type { DisponibleDesde, FiltroSede, MovimientoConductor, Turno } from './historialFlota'

export { turnoDe } from './historialFlota'
export type { DisponibleDesde, MovimientoConductor, Turno } from './historialFlota'

/** Días hacia atrás que se miran para saber desde cuándo está vacante un turno. */
export const DIAS_HISTORIAL_VACANTES = 180

export interface TurnoProgramado {
  /** Fecha de la cita o de la entrega programada (ISO), si la tiene */
  fecha: string | null
  /** Conductor o lead programado */
  nombre: string
}

export interface MovimientosFlota {
  movimientos: MovimientoConductor[]
  /** Última salida (ISO) por `vehiculoId|turno` y por `vehiculoId|*` (cualquier turno) */
  ultimaSalida: Map<string, string>
  /** Última vez que cada auto volvió a estar asignable (desde taller, robo, etc.) */
  disponibleDesde: Map<string, DisponibleDesde>
  /** Lo programado por `vehiculoId|turno`; si hay varios, el más próximo */
  programados: Map<string, TurnoProgramado>
  /** Conductor -> desde cuándo tiene asignación sin cortes (en cualquier auto) */
  conAsignacionDesde: Map<string, string>
}

/** Lunes de la semana actual, 'YYYY-MM-DD' en hora argentina. */
export function lunesDeEstaSemana(): string {
  const hoy = hoyART()
  const diaSemana = new Date(`${hoy}T00:00:00Z`).getUTCDay() // 0 = domingo
  return sumarDiasISO(hoy, -((diaSemana + 6) % 7))
}

const cancelada = (estado: string | null | undefined) => /^cancel/i.test(estado || '')

const VACIO: MovimientosFlota = { movimientos: [], ultimaSalida: new Map(), disponibleDesde: new Map(), programados: new Map(), conAsignacionDesde: new Map() }

/** Turnos que ya tienen a alguien programado. Si falla, no se marca nada. */
async function cargarProgramados(filtroSede: FiltroSede): Promise<Map<string, TurnoProgramado>> {
  const programados = new Map<string, TurnoProgramado>()
  const guardarProgramado = (vehiculoId: string | null, turno: Turno, nombre: string | null, fecha: string | null) => {
    if (!vehiculoId || !nombre?.trim()) return
    const clave = `${vehiculoId}|${turno}`
    const actual = programados.get(clave)
    // Se queda con el más próximo; uno sin fecha solo si no hay otro
    if (!actual || (fecha && (!actual.fecha || fecha < actual.fecha))) {
      programados.set(clave, { fecha, nombre: nombre.trim() })
    }
  }
  try {
    const [onboarding, asignadas] = await Promise.all([
      filtroSede(supabase
        .from('v_programaciones_onboarding')
        .select('vehiculo_entregar_id, modalidad, turno, fecha_cita, conductor_nombre, conductor_diurno_nombre, conductor_nocturno_nombre')
        .in('estado', ['por_agendar', 'agendado', 'en_curso'])
        .or('eliminado.is.null,eliminado.eq.false')),
      filtroSede(supabase
        .from('asignaciones')
        .select('vehiculo_id, fecha_programada, asignaciones_conductores (horario, estado, conductores (nombres, apellidos))')
        .eq('estado', 'programado')),
    ])
    if (onboarding.error) throw onboarding.error
    if (asignadas.error) throw asignadas.error
    for (const p of (onboarding.data || []) as any[]) {
      if (p.modalidad === 'a_cargo') {
        guardarProgramado(p.vehiculo_entregar_id, 'C', p.conductor_nombre, p.fecha_cita)
        continue
      }
      guardarProgramado(p.vehiculo_entregar_id, 'D', p.conductor_diurno_nombre, p.fecha_cita)
      guardarProgramado(p.vehiculo_entregar_id, 'N', p.conductor_nocturno_nombre, p.fecha_cita)
      // Programaciones viejas: un solo conductor con su turno
      if (p.turno && p.conductor_nombre) guardarProgramado(p.vehiculo_entregar_id, turnoDe(p.turno), p.conductor_nombre, p.fecha_cita)
    }
    for (const a of (asignadas.data || []) as any[]) {
      for (const ac of a.asignaciones_conductores || []) {
        const c = ac.conductores
        if (!c || cancelada(ac.estado)) continue
        guardarProgramado(a.vehiculo_id, turnoDe(ac.horario), `${c.nombres || ''} ${c.apellidos || ''}`, a.fecha_programada)
      }
    }
  } catch (error) {
    console.error('No se pudieron leer las programaciones:', error)
  }
  return programados
}

export function useMovimientosFlota(habilitado: boolean): MovimientosFlota {
  const { sedeActualId, aplicarFiltroSede } = useSede()
  const [datos, setDatos] = useState<MovimientosFlota>(VACIO)

  useEffect(() => {
    if (!habilitado) return
    let cancelado = false
    const filtroSede = aplicarFiltroSede as FiltroSede
    const desde = `${haceDiasART(DIAS_HISTORIAL_VACANTES)}T00:00:00-03:00`

    Promise.all([cargarHistorialFlota(filtroSede, desde), cargarProgramados(filtroSede)])
      .then(([h, programados]) => {
        if (!cancelado) {
          setDatos({ movimientos: h.movimientos, ultimaSalida: h.ultimaSalida, disponibleDesde: h.disponibleDesde, programados, conAsignacionDesde: h.conAsignacionDesde })
        }
      })
      .catch(error => {
        console.error('No se pudieron cargar los movimientos de la flota:', error)
        if (!cancelado) setDatos(VACIO)
      })
    return () => { cancelado = true }
  }, [habilitado, sedeActualId])

  return datos
}
