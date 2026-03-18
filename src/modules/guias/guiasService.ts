import { supabase } from '../../lib/supabase'
import { cabifyHistoricalService } from '../../services/cabifyHistoricalService'
import { normalizeDni } from '../../utils/normalizeDocuments'

export const getCurrentWeek = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  // Thursday in current week decides the year.
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  const week1 = new Date(date.getFullYear(), 0, 4);
  const weekNumber = 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
  return `${date.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`;
};

export interface Guia {
  id: string
  email: string
  full_name: string
  is_active: boolean
  created_at: string
  role_name: string
  role_description: string
}

export const fetchGuias = async (): Promise<Guia[]> => {
  try {
    // Usar RPC SECURITY DEFINER para bypasear RLS de user_profiles
    // (user_profiles solo permite leer el propio perfil para no-admin)
    const { data, error } = await supabase.rpc('get_guias')

    if (error) throw error

    return (data || []).map((item: any) => ({
      id: item.id,
      email: item.email,
      full_name: item.full_name,
      is_active: item.is_active,
      created_at: item.created_at,
      role_name: item.role_name,
      role_description: item.role_description
    }))
  } catch (_error) {
    return []
  }
}

/**
 * Consulta los datos financieros de Cabify para un conjunto de conductores y semanas.
 *
 * Delega TODA la lógica a cabifyHistoricalService.getDriversData() — el mismo
 * servicio singleton que usa el módulo Integración Cabify. Esto garantiza que
 * los datos sean idénticos al 100% (misma query, misma dedup, misma suma).
 *
 * @param conductorIds - UUIDs de conductores
 * @param semanas - Semanas ISO (ej: ['2026-W11', '2026-W10'])
 * @param conductorDnis - Mapa de UUID → DNI para matching
 * @param sedeId - ID de la sede actual
 *
 * Retorna: Map<semana, Map<id_conductor, { cobroApp, cobroEfectivo }>>
 */
export const getCabifyDatosPorSemanas = async (
  conductorIds: string[],
  semanas: string[],
  conductorDnis?: Map<string, string>,
  sedeId?: string | null,
  conductorNames?: Map<string, { nombres: string; apellidos: string }>
): Promise<Map<string, Map<string, { cobroApp: number; cobroEfectivo: number }>>> => {
  const result = new Map<string, Map<string, { cobroApp: number; cobroEfectivo: number }>>();

  if (conductorIds.length === 0 || semanas.length === 0) return result;
  if (!conductorDnis || conductorDnis.size === 0) return result;

  try {
    // Construir mapa inverso: DNI normalizado → conductor UUID
    const dniToConductorId = new Map<string, string>();
    for (const [conductorId, dni] of conductorDnis) {
      if (dni && dni.trim() !== '') {
        dniToConductorId.set(normalizeDni(dni), conductorId);
      }
    }

    // Helper: calcular lunes y domingo UTC para una semana ISO
    const getWeekRange = (semana: string): { startDate: string; endDate: string } => {
      const [yStr, wStr] = semana.split('-W');
      const y = parseInt(yStr);
      const w = parseInt(wStr);
      // Mismo cálculo que cabifyService.getWeekRange pero desde semana ISO
      const jan4 = new Date(Date.UTC(y, 0, 4));
      const dow = jan4.getUTCDay() || 7;
      const mondayW1 = new Date(jan4.getTime() - (dow - 1) * 86400000);
      const monday = new Date(mondayW1.getTime() + (w - 1) * 7 * 86400000);
      const sunday = new Date(monday.getTime() + 6 * 86400000);
      return {
        startDate: new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate(), 0, 0, 0, 0)).toISOString(),
        endDate: new Date(Date.UTC(sunday.getUTCFullYear(), sunday.getUTCMonth(), sunday.getUTCDate(), 23, 59, 59, 999)).toISOString(),
      };
    };

    // Llamar a cabifyHistoricalService para cada semana en paralelo
    // Es el MISMO servicio que usa el módulo Integración Cabify → datos idénticos
    const semanaPromises = semanas.map(async (semana) => {
      const { startDate, endDate } = getWeekRange(semana);
      const { drivers } = await cabifyHistoricalService.getDriversData(startDate, endDate, { sedeId });
      return { semana, drivers };
    });

    const semanaResults = await Promise.all(semanaPromises);

    // Mapear resultados: DNI del driver → UUID del conductor
    for (const { semana, drivers } of semanaResults) {
      if (drivers.length === 0) continue;

      const semanaMap = new Map<string, { cobroApp: number; cobroEfectivo: number }>();

      // Paso 1: Match por DNI normalizado
      const matchedConductorIds = new Set<string>();
      for (const driver of drivers) {
        const dniNorm = normalizeDni(driver.nationalIdNumber);
        if (!dniNorm) continue;

        const conductorId = dniToConductorId.get(dniNorm);
        if (conductorId && conductorIds.includes(conductorId)) {
          semanaMap.set(conductorId, {
            cobroApp: driver.cobroApp,
            cobroEfectivo: driver.cobroEfectivo,
          });
          matchedConductorIds.add(conductorId);
        }
      }

      // Paso 2: Fallback por nombre/apellido para conductores no encontrados por DNI
      if (conductorNames && conductorNames.size > 0) {
        const unmatchedIds = conductorIds.filter(id => !matchedConductorIds.has(id));
        for (const conductorId of unmatchedIds) {
          const nameInfo = conductorNames.get(conductorId);
          if (!nameInfo) continue;
          const nombresLower = nameInfo.nombres.trim().toLowerCase();
          const apellidosLower = nameInfo.apellidos.trim().toLowerCase();
          if (!nombresLower || !apellidosLower) continue;

          const matched = drivers.find(d => {
            const cabifyFull = `${(d.name || '')} ${(d.surname || '')}`.trim().toLowerCase();
            return cabifyFull.includes(nombresLower) && cabifyFull.includes(apellidosLower);
          });

          if (matched) {
            semanaMap.set(conductorId, {
              cobroApp: matched.cobroApp,
              cobroEfectivo: matched.cobroEfectivo,
            });
          }
        }
      }

      if (semanaMap.size > 0) {
        result.set(semana, semanaMap);
      }
    }
  } catch {
    // Silently return empty map on failure
  }

  return result;
};

export const distributeDriversService = async (guias: Guia[]) => {
  try {
    if (guias.length === 0) {
      return
    }

    const { data: assignedDrivers, error: assignedError } = await supabase
      .from('conductores')
      .select('id, id_guia')
      .eq('estado_id', '57e9de5f-e6fc-4ff7-8d14-cf8e13e9dbe2')
      .eq('guia_asignado', true)

    if (assignedError) {
      return
    }

    // Modificación estricta: Usamos !inner en todas las relaciones jerárquicas
    const { data: rawUnassignedDrivers, error: unassignedError } = await supabase
      .from('conductores')
      .select(`
        id,
        nombres,
        apellidos,
        asignaciones_conductores!inner (
          asignaciones!inner (
            estado,
            vehiculo_id,
            vehiculos!inner (
              id,
              patente
            )
          )
        )
      `)
      .eq('estado_id', '57e9de5f-e6fc-4ff7-8d14-cf8e13e9dbe2')
      .or('guia_asignado.is.null,guia_asignado.eq.false')
      .in('asignaciones_conductores.asignaciones.estado', ['activo', 'activa']);

    if (unassignedError) {
      return
    }

    // Filtrar en memoria para asegurar que tengan vehículo y eliminar duplicados
    const unassignedDriversMap = new Map();
    rawUnassignedDrivers?.forEach((d: any) => {
      // Validar estrictamente que el vehículo pertenezca a una asignación ACTIVA.
      const tieneVehiculoActivo = d.asignaciones_conductores?.some((ac: any) => {
         const asignacion = ac.asignaciones;
         if (!asignacion) return false;
         
         const estado = asignacion.estado?.toLowerCase();
         const esActivo = estado === 'activo' || estado === 'activa';
         // Verificamos ambas posibilidades de nombre de columna para el ID del vehículo
         const tieneIdVehiculo = !!asignacion.id_vehiculo || !!asignacion.vehiculo_id;
         const tieneObjetoVehiculo = !!asignacion.vehiculos;
         const tienePatente = !!asignacion.vehiculos?.patente;
         
         const isValid = esActivo && tieneIdVehiculo && tieneObjetoVehiculo && tienePatente;
         
         if (isValid) {
             d._debug_patente = asignacion.vehiculos.patente;
         }
         
         return isValid;
      });

      if (tieneVehiculoActivo) {
        unassignedDriversMap.set(d.id, d);
      }
    });
    
    const unassignedDrivers = Array.from(unassignedDriversMap.values());

    if (unassignedDrivers.length === 0) {
      // No unassigned drivers to distribute
    } else {
      const guideLoad = new Map<string, number>()
      guias.forEach(g => guideLoad.set(g.id, 0))

      assignedDrivers?.forEach((d: any) => {
        if (d.id_guia && guideLoad.has(d.id_guia)) {
          guideLoad.set(d.id_guia, guideLoad.get(d.id_guia)! + 1)
        }
      })
      
      const updates: any[] = []
      const guideIds = guias.map(g => g.id)
      
      for (const driver of unassignedDrivers) {
        let minLoad = Infinity
        guideIds.forEach(id => {
          const load = guideLoad.get(id) || 0
          if (load < minLoad) minLoad = load
        })

        const candidates = guideIds.filter(id => (guideLoad.get(id) || 0) === minLoad)
        
        if (candidates.length === 0) continue

        const selectedGuideId = candidates[Math.floor(Math.random() * candidates.length)]
        
        guideLoad.set(selectedGuideId, (guideLoad.get(selectedGuideId) || 0) + 1)
        
        updates.push({
          id: driver.id,
          guia_asignado: true,
          id_guia: selectedGuideId
        })
      }

      if (updates.length > 0) {
        // N+1 NOTE: Each driver gets a different id_guia value, so we can't batch
        // with .in('id', [...]) since the payload differs per row. Supabase JS client
        // doesn't support multi-row upsert with different values per row without RPC.
        // Promise.all parallelism is acceptable here for write operations (~20 concurrent).
        const updatePromises = updates.map(update => 
          supabase
            .from('conductores')
            .update({ 
              guia_asignado: update.guia_asignado, 
              id_guia: update.id_guia 
            })
            .eq('id', update.id)
        );

        const results = await Promise.all(updatePromises);
        
        const errors = results.filter(r => r.error).map(r => r.error);
        if (errors.length > 0) {
          throw errors[0];
        }

        const currentWeek = getCurrentWeek()
        
        // Verificar historial existente para esta semana para evitar duplicados
        const { data: existingHistory } = await supabase
          .from('guias_historial_semanal')
          .select('id_conductor')
          .eq('semana', currentWeek);
          
        const existingHistoryIds = new Set(existingHistory?.map((h: any) => h.id_conductor));
        const historyInserts: any[] = [];

        updates.forEach(u => {
          if (!existingHistoryIds.has(u.id)) {
            historyInserts.push({
              id_conductor: u.id,
              id_guia: u.id_guia,
              semana: currentWeek
            });
            existingHistoryIds.add(u.id);
          }
        });

        if (historyInserts.length > 0) {
          const { error: historyError } = await supabase
            .from('guias_historial_semanal')
            .insert(historyInserts)

          if (historyError) {
            // silently ignored
          }
        }
      }
    }

    // --- SAFETY NET SYNC (Rescate de conductores activos con guía pero sin historial) ---
    // Esta lógica busca conductores que:
    // 1. Están Activos y tienen Vehículo.
    // 2. YA tienen guía asignado (id_guia NOT NULL).
    // 3. NO tienen registro en guias_historial_semanal para la semana actual.

    const currentWeek = getCurrentWeek();

    // A. Obtener IDs que ya están en el historial de esta semana
    const { data: currentHistory, error: historyError } = await supabase
      .from('guias_historial_semanal')
      .select('id_conductor')
      .eq('semana', currentWeek);

    if (historyError) {
      // silently ignored
    } else {
      const existingHistoryIds = new Set(currentHistory?.map((h: any) => h.id_conductor));
      
      // B. Buscar candidatos a rescate
      const { data: rawRescueCandidates, error: rescueError } = await supabase
        .from('conductores')
        .select(`
          id,
          id_guia,
          asignaciones_conductores!inner (
            asignaciones!inner (
              estado,
              vehiculo_id,
              vehiculos!inner (
                id,
                patente
              )
            )
          )
        `)
        .eq('estado_id', '57e9de5f-e6fc-4ff7-8d14-cf8e13e9dbe2') // Activo
        .neq('id_guia', null) // Tienen guía
        .in('asignaciones_conductores.asignaciones.estado', ['activo', 'activa']);

      if (rescueError) {
         // silently ignored
      } else {
         // C. Filtrar candidatos válidos (con vehículo activo real) y que NO estén en historial
         const rescueInserts: any[] = [];
         
         rawRescueCandidates?.forEach((d: any) => {
             // 1. Verificar si ya está en historial
             if (existingHistoryIds.has(d.id)) return;

             // 2. Verificar vehículo activo (doble check similar al anterior)
             const tieneVehiculoActivo = d.asignaciones_conductores?.some((ac: any) => {
               const asignacion = ac.asignaciones;
               if (!asignacion) return false;
               const estado = asignacion.estado?.toLowerCase();
               const esActivo = estado === 'activo' || estado === 'activa';
               const tienePatente = !!asignacion.vehiculos?.patente;
               return esActivo && tienePatente;
             });

             if (tieneVehiculoActivo) {
               rescueInserts.push({
                 id_conductor: d.id,
                 id_guia: d.id_guia, // Usamos su guía existente
                 semana: currentWeek,
                 id_accion_imp: 1 // Default action
               });
             }
         });

         if (rescueInserts.length > 0) {
            const { error: insertRescueError } = await supabase
              .from('guias_historial_semanal')
              .insert(rescueInserts);
              
            if (insertRescueError) {
               // silently ignored
            }
         }
      }
    }

    return true; // Always return true to indicate process completed
  } catch (_error) {
    return false;
  }
}
