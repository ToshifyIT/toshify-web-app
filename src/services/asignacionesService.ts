/**
 * Servicio para consultar asignaciones de conductores
 * Permite cruzar datos de Cabify con el sistema interno por DNI
 */

import { supabase } from '../lib/supabase'

export interface AsignacionActiva {
  dni: string
  horario: 'TURNO' | 'CARGO' | null
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
          asignaciones_conductores (
            horario,
            conductores (
              numero_dni,
              nombres,
              apellidos
            )
          )
        `)
        .in('estado', ['activa', 'programado'])

      if (error) {
        console.error('❌ Error consultando asignaciones:', error)
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

              if (conductor && conductor.numero_dni && dnis.includes(conductor.numero_dni)) {
                asignacionesMap.set(conductor.numero_dni, {
                  dni: conductor.numero_dni,
                  horario: record.horario as 'TURNO' | 'CARGO' | null,
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

    } catch (error) {
      console.error('❌ Error en getAsignacionesByDNIs:', error)
      return new Map()
    }
  }

  /**
   * Obtener asignación activa de un conductor por DNI
   */
  async getAsignacionByDNI(dni: string): Promise<AsignacionActiva | null> {
    const result = await this.getAsignacionesByDNIs([dni])
    return result.get(dni) || null
  }
}

// Exportar instancia singleton
export const asignacionesService = new AsignacionesService()
