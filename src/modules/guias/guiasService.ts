import { supabase } from '../../lib/supabase'

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
  } catch (error) {
    console.error('Error loading guias:', error)
    return []
  }
}

export const distributeDriversService = async (guias: Guia[]) => {
  console.log('GuiasService: Starting distributeDrivers execution - STRICT MODE (Synced with GuiasModule)');
  try {
    if (guias.length === 0) {
      console.log('GuiasService: No guias found, aborting distribution');
      return
    }

    console.log('GuiasService: Fetching currently assigned drivers...');
    const { data: assignedDrivers, error: assignedError } = await supabase
      .from('conductores')
      .select('id, id_guia')
      .eq('estado_id', '57e9de5f-e6fc-4ff7-8d14-cf8e13e9dbe2')
      .eq('guia_asignado', true)

    if (assignedError) {
      console.error('Error fetching assigned drivers:', assignedError)
      return
    }
    console.log('GuiasService: Assigned drivers found:', assignedDrivers?.length || 0);

    console.log('GuiasService: Fetching unassigned drivers...');
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
      console.error('Error fetching unassigned drivers:', unassignedError)
      return
    }
    
    console.log(`GuiasService: Total candidatos crudos recuperados de DB: ${rawUnassignedDrivers?.length || 0}`);

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
    console.log(`GuiasService: Unassigned drivers filtered found: ${unassignedDrivers.length}`);

    if (unassignedDrivers.length === 0) {
      console.log('GuiasService: No unassigned drivers to distribute.');
    } else {
      const guideLoad = new Map<string, number>()
      guias.forEach(g => guideLoad.set(g.id, 0))

      assignedDrivers?.forEach((d: any) => {
        if (d.id_guia && guideLoad.has(d.id_guia)) {
          guideLoad.set(d.id_guia, guideLoad.get(d.id_guia)! + 1)
        }
      })
      
      console.log('GuiasService: Current guide loads:', Object.fromEntries(guideLoad));

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

      console.log('GuiasService: Updates prepared:', updates.length);

      if (updates.length > 0) {
        console.log('GuiasService: Performing updates to conductores...');
        
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
          console.error('Errores actualizando conductores:', errors);
          throw errors[0];
        }

        console.log(`Asignados ${updates.length} conductores a guías.`);

        const currentWeek = getCurrentWeek()
        console.log('GuiasService: Preparing history inserts for week:', currentWeek);
        
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
          console.log('GuiasService: Performing bulk insert to guias_historial_semanal...');
          const { error: historyError } = await supabase
            .from('guias_historial_semanal')
            .insert(historyInserts)

          if (historyError) {
            console.error('Error creando historial semanal:', historyError)
          } else {
            console.log(`Creados ${historyInserts.length} registros en historial semanal.`)
          }
        } else {
           console.log('GuiasService: No new history records needed.');
        }
      }
    }

    // --- SAFETY NET SYNC (Rescate de conductores activos con guía pero sin historial) ---
    // Esta lógica busca conductores que:
    // 1. Están Activos y tienen Vehículo.
    // 2. YA tienen guía asignado (id_guia NOT NULL).
    // 3. NO tienen registro en guias_historial_semanal para la semana actual.
    
    console.log('GuiasService: Executing Safety Net Sync...');
    const currentWeek = getCurrentWeek();

    // A. Obtener IDs que ya están en el historial de esta semana
    const { data: currentHistory, error: historyError } = await supabase
      .from('guias_historial_semanal')
      .select('id_conductor')
      .eq('semana', currentWeek);

    if (historyError) {
      console.error('GuiasService: Error fetching current history for safety net:', historyError);
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
         console.error('GuiasService: Error fetching rescue candidates:', rescueError);
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
            console.log(`GuiasService: SAFETY NET ACTIVATED. Rescuing ${rescueInserts.length} drivers...`);
            const { error: insertRescueError } = await supabase
              .from('guias_historial_semanal')
              .insert(rescueInserts);
              
            if (insertRescueError) {
               console.error('GuiasService: Error inserting rescue records:', insertRescueError);
            } else {
               console.log(`GuiasService: Successfully rescued ${rescueInserts.length} drivers into current week.`);
            }
         } else {
            console.log('GuiasService: Safety net found no missing drivers.');
         }
      }
    }

    return true; // Always return true to indicate process completed
  } catch (error) {
    console.error('Error distribuyendo conductores:', error)
    return false;
  }
}
