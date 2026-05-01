/**
 * Servicio para consultas directas a la tabla uss_historico
 * Datos crudos de viajes sincronizados desde Wialon/USS
 */

import { supabase } from '../lib/supabase';

/** Normaliza patente: quita espacios, guiones y pasa a mayúsculas */
function normalizarPatente(p: string): string {
  return p.replace(/[\s\-]/g, '').toUpperCase();
}

export type GpsOrigen = 'USS' | 'GEOTAB';

export interface USSHistoricoRegistro {
  id: number;
  patente: string;
  conductor: string | null;
  ibutton: string | null;
  observaciones: string | null;
  fecha_hora_inicio: string | null;
  fecha_hora_final: string | null;
  kilometraje: string | null;
  gps_origen: GpsOrigen;
}

export interface USSHistoricoQueryOptions {
  limit?: number;
  offset?: number;
  patente?: string;
  conductor?: string;
  sedeId?: string | null;
}

function buildHistoricoQuery(
  table: 'uss_historico' | 'geotab_historico',
  startDate: string,
  endStr: string,
  sedePatentes: string[] | null,
  options?: USSHistoricoQueryOptions
) {
  let query = supabase
    .from(table)
    .select('id, patente, conductor, ibutton, observaciones, fecha_hora_inicio, fecha_hora_final, kilometraje', { count: 'exact' })
    .gte('fecha_hora_inicio', `${startDate}T00:00:00`)
    .lt('fecha_hora_inicio', `${endStr}T00:00:00`);

  if (sedePatentes !== null && sedePatentes.length > 0) {
    query = query.in('patente', sedePatentes);
  }

  if (options?.patente) {
    const term = options.patente.trim();
    query = query.or(
      `patente.ilike.%${term}%,conductor.ilike.%${term}%,ibutton.ilike.%${term}%`
    );
  }

  if (options?.conductor) {
    query = query.ilike('conductor', `%${options.conductor}%`);
  }

  return query;
}

export const ussHistoricoService = {
  /**
   * Obtiene registros crudos combinando uss_historico + geotab_historico,
   * taggeando el origen (gps_origen) de cada fila.
   */
  async getRegistros(
    startDate: string,
    endDate: string,
    options?: USSHistoricoQueryOptions
  ): Promise<{ data: USSHistoricoRegistro[]; count: number }> {
    // Las fechas en estas tablas ya vienen en hora Argentina (sin offset)
    const endDatePlusOne = new Date(endDate + 'T00:00:00');
    endDatePlusOne.setDate(endDatePlusOne.getDate() + 1);
    const endStr = endDatePlusOne.toISOString().slice(0, 10);

    // Resolver patentes de la sede una sola vez
    let sedePatentes: string[] | null = null;
    if (options?.sedeId) {
      const { data: vehiculos } = await supabase
        .from('vehiculos')
        .select('patente')
        .eq('sede_id', options.sedeId)
        .is('deleted_at', null);

      if (vehiculos && vehiculos.length > 0) {
        sedePatentes = vehiculos.map((v: { patente: string }) => normalizarPatente(v.patente));
      } else {
        return { data: [], count: 0 };
      }
    }

    // Consultar ambas tablas en paralelo
    const [ussRes, geotabRes] = await Promise.all([
      buildHistoricoQuery('uss_historico', startDate, endStr, sedePatentes, options),
      buildHistoricoQuery('geotab_historico', startDate, endStr, sedePatentes, options),
    ]);

    if (ussRes.error) throw new Error(`Error obteniendo uss_historico: ${ussRes.error.message}`);
    if (geotabRes.error) throw new Error(`Error obteniendo geotab_historico: ${geotabRes.error.message}`);

    // Mergear y taggear origen
    const ussRows: USSHistoricoRegistro[] = (ussRes.data || []).map((r: any) => ({ ...r, gps_origen: 'USS' as GpsOrigen }));
    const geotabRows: USSHistoricoRegistro[] = (geotabRes.data || []).map((r: any) => ({ ...r, gps_origen: 'GEOTAB' as GpsOrigen }));

    const combined = [...ussRows, ...geotabRows].sort((a, b) => {
      const av = a.fecha_hora_inicio || '';
      const bv = b.fecha_hora_inicio || '';
      return bv.localeCompare(av);
    });

    const totalCount = (ussRes.count || 0) + (geotabRes.count || 0);

    // Paginación en memoria
    let paginated = combined;
    if (options?.offset !== undefined && options?.limit !== undefined) {
      paginated = combined.slice(options.offset, options.offset + options.limit);
    } else if (options?.limit) {
      paginated = combined.slice(0, options.limit);
    }

    return { data: paginated, count: totalCount };
  },
};
