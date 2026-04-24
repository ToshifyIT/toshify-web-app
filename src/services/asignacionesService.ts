/**
 * Servicio para consultar asignaciones de conductores
 * Permite cruzar datos de Cabify con el sistema interno por DNI
 */

import { supabase } from '../lib/supabase'
import { normalizeDni, normalizeLicencia, normalizeNombre } from '../utils/normalizeDocuments'

export interface AsignacionActiva {
  dni: string
  licencia?: string | null
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

  /**
   * Obtener TODAS las asignaciones activas e indexarlas por DNI, licencia y nombre.
   * Útil cuando el match con la fuente externa (ej. Cabify) puede fallar por DNI
   * (formato distinto) pero tiene licencia o nombre que coincide.
   *
   * El Map resultante tiene 3 claves por asignación (todas apuntan al mismo objeto):
   *   - "dni:<normalized>"
   *   - "lic:<normalized>"
   *   - "nom:<normalized>"
   *
   * Para buscar, usar las funciones helper `keyForDni`, `keyForLicencia`, `keyForNombre`.
   */
  async getAllAsignacionesActivasIndex(): Promise<Map<string, AsignacionActiva>> {
    try {
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
              numero_licencia,
              nombres,
              apellidos
            )
          )
        `)
        .in('estado', ['activa', 'programado'])

      if (error) return new Map()

      const index = new Map<string, AsignacionActiva>()
      if (data && data.length > 0) {
        for (const record of (data as any[])) {
          const patente = record.vehiculos?.patente || null
          if (!record.asignaciones_conductores) continue
          for (const ac of record.asignaciones_conductores) {
            const conductor = ac.conductores
            if (!conductor) continue
            const asig: AsignacionActiva = {
              dni: conductor.numero_dni || '',
              licencia: conductor.numero_licencia || null,
              horario: record.horario as 'turno' | 'todo_dia' | null,
              estado: record.estado as 'activa' | 'programado' | null,
              modalidad: record.modalidad,
              nombreConductor: `${conductor.nombres || ''} ${conductor.apellidos || ''}`.trim(),
              asignacionId: record.id,
              patente,
              turnoEspecifico: ac.horario || null,
            }

            const dniKey = normalizeDni(conductor.numero_dni)
            if (dniKey) index.set(`dni:${dniKey}`, asig)

            const licKey = normalizeLicencia(conductor.numero_licencia)
            if (licKey) index.set(`lic:${licKey}`, asig)

            const nomKey = normalizeNombre(`${conductor.nombres || ''} ${conductor.apellidos || ''}`)
            if (nomKey) index.set(`nom:${nomKey}`, asig)
          }
        }
      }
      return index
    } catch {
      return new Map()
    }
  }
}

/** Helpers de búsqueda en el índice multi-clave */
export function findAsignacionEnIndex(
  index: Map<string, AsignacionActiva>,
  opts: { dni?: string | null; licencia?: string | null; nombre?: string | null },
): AsignacionActiva | undefined {
  const dniKey = normalizeDni(opts.dni)
  if (dniKey) {
    const hit = index.get(`dni:${dniKey}`)
    if (hit) return hit
  }
  const licKey = normalizeLicencia(opts.licencia)
  if (licKey) {
    const hit = index.get(`lic:${licKey}`)
    if (hit) return hit
  }
  const nomKey = normalizeNombre(opts.nombre)
  if (nomKey) {
    const hit = index.get(`nom:${nomKey}`)
    if (hit) return hit
  }
  return undefined
}

// Exportar instancia singleton
export const asignacionesService = new AsignacionesService()
