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
      // Consulta optimizada: obtener todas las asignaciones activas de los DNIs en una sola query
      const { data, error } = await supabase
        .from('asignaciones')
        .select(`
          id,
          horario,
          estado,
          modalidad,
          conductores!inner (
            numero_dni,
            nombres,
            apellidos
          )
        `)
        .in('conductores.numero_dni', dnis)
        .in('estado', ['activa', 'programado'])

      if (error) {
        console.error('❌ Error consultando asignaciones:', error)
        return new Map()
      }

      // Mapear resultados por DNI
      const asignacionesMap = new Map<string, AsignacionActiva>()

      if (data && data.length > 0) {
        for (const record of (data as any[])) {
          const conductor = record.conductores

          if (conductor && conductor.numero_dni) {
            asignacionesMap.set(conductor.numero_dni, {
              dni: conductor.numero_dni,
              horario: record.horario as 'TURNO' | 'CARGO' | null,
              estado: record.estado as 'activa' | 'programado' | null,
              modalidad: record.modalidad,
              nombreConductor: `${conductor.nombres} ${conductor.apellidos}`,
              asignacionId: record.id
            })
          }
        }
      }

      console.log(`✅ ${asignacionesMap.size} asignaciones activas encontradas de ${dnis.length} DNIs`)
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
