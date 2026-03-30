/**
 * Servicio para consultar asignaciones de conductores
 * Permite cruzar datos de Cabify con el sistema interno por DNI
 */

import { supabase } from '../lib/supabase'
import { normalizeDni } from '../utils/normalizeDocuments'

export interface AsignacionActiva {
  dni: string
  horario: 'turno' | 'todo_dia' | null
  estado: 'activa' | 'programado' | null
  modalidad: string | null
  nombreConductor: string
  asignacionId: string
  patente: string | null
  turnoEspecifico: string | null // diurno, nocturno, etc.
}

class AsignacionesService {
  /**
   * Obtener asignaciones activas de múltiples conductores por DNI
   * Optimizado para consultar varios DNIs a la vez
   */
  async getAsignacionesByDNIs(dnis: string[]): Promise<Map<string, AsignacionActiva>> {
    if (dnis.length === 0) {
      return new Map()
    }

    try {
      // Consulta optimizada: obtener asignaciones con vehículo y conductores
      // Fetch only assignments that have conductors matching requested DNIs
      // Filter via inner join on conductores.numero_dni
      const { data, error } = await supabase
        .from('asignaciones')
        .select(`
          id,
          horario,
          estado,
          modalidad,
          vehiculos (
            patente
          ),
          asignaciones_conductores!inner (
            horario,
            conductores!inner (
              numero_dni,
              nombres,
              apellidos
            )
          )
        `)
        .in('estado', ['activa', 'programado'])
        .in('asignaciones_conductores.conductores.numero_dni', dnis)

      if (error) {
        return new Map()
      }

      // Mapear resultados por DNI
      const asignacionesMap = new Map<string, AsignacionActiva>()

      if (data && data.length > 0) {
        for (const record of (data as any[])) {
          const patente = record.vehiculos?.patente || null

          // Iterar por cada conductor asignado
          if (record.asignaciones_conductores) {
            for (const ac of record.asignaciones_conductores) {
              const conductor = ac.conductores

              if (conductor && conductor.numero_dni && dnis.includes(normalizeDni(conductor.numero_dni))) {
                asignacionesMap.set(normalizeDni(conductor.numero_dni), {
                  dni: conductor.numero_dni,
                  horario: record.horario as 'turno' | 'todo_dia' | null,
                  estado: record.estado as 'activa' | 'programado' | null,
                  modalidad: record.modalidad,
                  nombreConductor: `${conductor.nombres} ${conductor.apellidos}`,
                  asignacionId: record.id,
                  patente: patente,
                  turnoEspecifico: ac.horario || null
                })
              }
            }
          }
        }
      }

      return asignacionesMap

    } catch {
      return new Map()
    }
  }

  /**
   * Obtener asignación activa de un conductor por DNI
   */
  async getAsignacionByDNI(dni: string): Promise<AsignacionActiva | null> {
    const result = await this.getAsignacionesByDNIs([dni])
    return result.get(normalizeDni(dni)) || null
  }
}

// Exportar instancia singleton
export const asignacionesService = new AsignacionesService()
