/**
 * Servicio para consultas directas a la tabla uss_historico
 * Datos crudos de viajes sincronizados desde Wialon/USS
 */

import { supabase } from '../lib/supabase';

/** Normaliza patente: quita espacios, guiones y pasa a mayúsculas */
function normalizarPatente(p: string): string {
  return p.replace(/[\s\-]/g, '').toUpperCase();
}

export interface USSHistoricoRegistro {
  id: number;
  patente: string;
  conductor: string | null;
  ibutton: string | null;
  observaciones: string | null;
  fecha_hora_inicio: string | null;
  fecha_hora_final: string | null;
  kilometraje: string | null;
}

export interface USSHistoricoQueryOptions {
  limit?: number;
  offset?: number;
  patente?: string;
  conductor?: string;
  sedeId?: string | null;
}

export const ussHistoricoService = {
  /**
   * Obtiene registros crudos de uss_historico en un rango de fechas
   */
  async getRegistros(
    startDate: string,
    endDate: string,
    options?: USSHistoricoQueryOptions
  ): Promise<{ data: USSHistoricoRegistro[]; count: number }> {
    // Las fechas en uss_historico ya vienen en hora Argentina (sin offset)
    const endDatePlusOne = new Date(endDate + 'T00:00:00');
    endDatePlusOne.setDate(endDatePlusOne.getDate() + 1);
    const endStr = endDatePlusOne.toISOString().slice(0, 10);

    let query = supabase
      .from('uss_historico')
      .select('*', { count: 'exact' })
      .gte('fecha_hora_inicio', `${startDate}T00:00:00`)
      .lt('fecha_hora_inicio', `${endStr}T00:00:00`)
      .order('fecha_hora_inicio', { ascending: false });

    // uss_historico no tiene sede_id: filtrar por patentes de vehículos de la sede
    if (options?.sedeId) {
      const { data: vehiculos } = await supabase
        .from('vehiculos')
        .select('patente')
        .eq('sede_id', options.sedeId)
        .is('deleted_at', null);

      if (vehiculos && vehiculos.length > 0) {
        const patentes = vehiculos.map((v: { patente: string }) => v.patente);
        query = query.in('patente', patentes);
      } else {
        // No hay vehículos en esta sede, retornar vacío
        return { data: [], count: 0 };
      }
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

    if (options?.offset !== undefined && options?.limit !== undefined) {
      query = query.range(options.offset, options.offset + options.limit - 1);
    } else if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Error obteniendo uss_historico: ${error.message}`);
    }

    return {
      data: (data || []) as USSHistoricoRegistro[],
      count: count || 0,
    };
  },


};
