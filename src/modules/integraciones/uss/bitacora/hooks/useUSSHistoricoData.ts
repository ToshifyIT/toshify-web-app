// src/modules/integraciones/uss/bitacora/hooks/useUSSHistoricoData.ts
/**
 * Hook para el módulo Bitácora
 * - Histórico: registros crudos de uss_historico
 * - Marcaciones: datos sumarizados de wialon_bitacora (1 fila/conductor/día)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../../../../lib/supabase';
import {
  ussHistoricoService,
  type USSHistoricoRegistro,
} from '../../../../../services/ussHistoricoService';
import {
  wialonBitacoraService,
  type BitacoraRegistroTransformado,
} from '../../../../../services/wialonBitacoraService';

// Zona horaria Argentina
const TIMEZONE_ARGENTINA = 'America/Argentina/Buenos_Aires';

function toArgentinaDateString(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: TIMEZONE_ARGENTINA });
}

function getToday(): string {
  return toArgentinaDateString(new Date());
}

// Marcación: 1 fila por conductor por día (de wialon_bitacora)
export interface Marcacion {
  id: string;
  conductor: string;
  conductorId: string | null;
  conductorDni?: string | null;
  ibutton: string | null;
  fecha: string; // YYYY-MM-DD (fecha_turno)
  patente: string;
  patenteNormalizada: string;
  entrada: string; // HH:MM - primer viaje
  salida: string; // HH:MM - último viaje
  periodoInicio: string | null; // ISO timestamp completo
  periodoFin: string | null; // ISO timestamp completo
  kmTotal: number;
  duracionMinutos: number | null;
  estado: string;
  horario: string; // diurno, nocturno, todo_dia
  vehiculoModalidad: string | null; // turno, a_cargo
  gncCargado: boolean;
  lavadoRealizado: boolean;
  naftaCargada: boolean;
  gpsOrigen: 'USS' | 'GEOTAB';
  // Acumulado semanal del conductor (para alerta de limite km)
  kmSemanaConductor?: number;
  limiteSemanal?: number;
  excedeLimite?: boolean;
  // Metadata semanal usada por Control de Exceso KM cuando el rango visible
  // incluye varias semanas.
  excesoKmSemana?: number;
  excesoKmAnio?: number;
  excesoKmSemanaInicio?: string;
  excesoKmSemanaFin?: string;
  excesoKmSemanaKey?: string;
  // Resumen semanal: cuando se filtra por exceso, esta marcacion se transforma en 1 fila
  // resumen con entrada/salida/duracion/km agregados de toda la semana del conductor.
  duracionSemanaMinutos?: number;
  entradaSemana?: { fecha: string; hora: string; periodoInicio: string | null }; // primer trip de la semana
  salidaSemana?: { fecha: string; hora: string; periodoFin: string | null }; // ultimo trip de la semana
  marcacionesDetalle?: Array<{ fecha: string; entrada: string; salida: string; kmTotal: number; duracionMinutos: number | null; patente: string; estado: string; gpsOrigen: 'USS' | 'GEOTAB' }>;
}

export interface USSHistoricoDateRange {
  startDate: string;
  endDate: string;
  label: string;
}

function transformarMarcacion(reg: BitacoraRegistroTransformado): Marcacion {
  return {
    id: reg.id,
    conductor: reg.conductor_wialon || 'Sin conductor',
    conductorId: reg.conductor_id,
    conductorDni: (reg as any).conductor_dni || null,
    ibutton: reg.ibutton,
    fecha: reg.fecha_turno,
    patente: reg.patente,
    patenteNormalizada: reg.patente_normalizada,
    entrada: reg.hora_inicio || '-',
    salida: reg.hora_cierre || '-',
    periodoInicio: reg.periodo_inicio,
    periodoFin: reg.periodo_fin,
    kmTotal: reg.kilometraje,
    duracionMinutos: reg.duracion_minutos,
    estado: reg.estado,
    horario: reg.turno_indicador || 'todo_dia',
    vehiculoModalidad: reg.tipo_turno || null,
    gncCargado: reg.gnc_cargado,
    lavadoRealizado: reg.lavado_realizado,
    naftaCargada: reg.nafta_cargada,
    gpsOrigen: reg.gps_origen || 'USS',
  };
}

export function useUSSHistoricoData(sedeId?: string | null) {
  const [dateRange, setDateRange] = useState<USSHistoricoDateRange>(() => {
    // Default: Semana actual completa (lunes a domingo) en zona ART.
    // Antes calculaba con getDay() en hora LOCAL del browser, lo cual descalibraba
    // si el browser estaba en otra TZ o cerca de medianoche.
    const todayStr = getToday(); // YYYY-MM-DD en ART
    const [y, m, d] = todayStr.split('-').map(Number);
    const hoy = new Date(y, m - 1, d, 12, 0, 0);
    const dow = hoy.getDay() === 0 ? 7 : hoy.getDay(); // ISO: domingo = 7
    const lunes = new Date(hoy); lunes.setDate(hoy.getDate() - (dow - 1));
    const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6);
    const fmt = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    // Numero de semana ISO para el label
    const ref = new Date(lunes);
    ref.setDate(ref.getDate() + 4 - (ref.getDay() || 7));
    const yearStart = new Date(ref.getFullYear(), 0, 1);
    const semana = Math.ceil(((ref.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return {
      startDate: fmt(lunes),
      endDate: fmt(domingo),
      label: `Semana ${semana}`,
    };
  });

  // Registros crudos para tabla Histórico
  const [registros, setRegistros] = useState<USSHistoricoRegistro[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  // Marcaciones de wialon_bitacora
  const [marcaciones, setMarcaciones] = useState<Marcacion[]>([]);

  // Paginación (solo para Histórico)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);

  // Búsqueda
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPatente, setFilterPatente] = useState('');

  // Estado
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Vista activa (marcaciones por defecto). Persistida en localStorage para sobrevivir refresh.
  const VISTA_STORAGE_KEY = 'bitacora.vista';
  const [vista, setVistaInner] = useState<'historico' | 'marcaciones'>(() => {
    try {
      const saved = localStorage.getItem(VISTA_STORAGE_KEY);
      if (saved === 'historico' || saved === 'marcaciones') return saved;
    } catch { /* SSR o localStorage bloqueado: usar default */ }
    return 'marcaciones';
  });
  const setVista = useCallback((v: 'historico' | 'marcaciones') => {
    try { localStorage.setItem(VISTA_STORAGE_KEY, v); } catch { /* ignore */ }
    setVistaInner(v);
  }, []);

  // Debounce para búsqueda
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFilterPatente(value.trim());
      setPage(1);
    }, 400);
  }, []);

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  // Cargar datos
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const offset = (page - 1) * pageSize;

      // Cargar Histórico (uss_historico) + Marcaciones (wialon_bitacora) en paralelo
      const [paginatedResult, bitacoraResult] = await Promise.all([
        ussHistoricoService.getRegistros(dateRange.startDate, dateRange.endDate, {
          limit: pageSize,
          offset,
          patente: filterPatente || undefined,
          sedeId,
        }),
        wialonBitacoraService.getBitacora(dateRange.startDate, dateRange.endDate, { sedeId }),
      ]);

      setRegistros(paginatedResult.data);
      setTotalCount(paginatedResult.count);
      const marcacionesTransformadas = bitacoraResult.data.map(transformarMarcacion).filter(m => m.estado !== 'Sin Actividad');

      // ===== ALERTA LIMITE KM SEMANAL =====
      // 1) Cargar limites configurables (parametros_sistema)
      const { data: limiteParams } = await supabase
        .from('parametros_sistema')
        .select('clave, valor')
        .in('clave', ['limite_km_semanal_turno', 'limite_km_semanal_a_cargo']);
      let limiteTurno = 1800;
      let limiteACargo = 3600;
      for (const p of (limiteParams || []) as any[]) {
        const v = parseFloat(p.valor);
        if (!isNaN(v) && v > 0) {
          if (p.clave === 'limite_km_semanal_turno') limiteTurno = v;
          if (p.clave === 'limite_km_semanal_a_cargo') limiteACargo = v;
        }
      }

      // 2) Calcular semana de referencia (lunes 00:00 ART -> lunes siguiente 00:00 ART).
      // La ventana se aplica sobre PERIODO_INICIO del turno, NO sobre fecha_turno.
      // Asi un nocturno entrado domingo 23:00 cuenta en la semana del domingo
      // (donde fue su ENTRADA), no en la siguiente semana.
      // Usar el endDate del filtro visible para anclarse a la semana del ultimo dia visible.
      const refDate = new Date((dateRange.endDate || new Date().toISOString().slice(0, 10)) + 'T12:00:00-03:00');
      const dow = refDate.getDay() === 0 ? 7 : refDate.getDay(); // domingo=7
      const lunes = new Date(refDate); lunes.setDate(refDate.getDate() - (dow - 1)); lunes.setHours(0, 0, 0, 0);
      // Inicio de la semana en ART como ISO timestamp: lunes 00:00:00-03:00
      const fmtIsoArt = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
      const lunesIso = fmtIsoArt(lunes) + 'T00:00:00-03:00';
      // Fin exclusivo: lunes siguiente 00:00 ART
      const lunesSig = new Date(lunes); lunesSig.setDate(lunes.getDate() + 7);
      const lunesSigIso = fmtIsoArt(lunesSig) + 'T00:00:00-03:00';

      // 3) Traer SUMA de km semanales por conductor desde wialon_bitacora + geotab_bitacora
      // Filtrar por periodo_inicio (entrada real del turno), no por fecha_turno.
      const sumKmPorConductor = new Map<string, { km: number; modalidad: string }>(); // key = conductor_id || conductor_wialon
      const fetchSemanaTabla = async (tabla: 'wialon_bitacora' | 'geotab_bitacora') => {
        const { data } = await supabase
          .from(tabla)
          .select('conductor_id, conductor_wialon, kilometraje, vehiculo_modalidad, periodo_inicio')
          .gte('periodo_inicio', lunesIso)
          .lt('periodo_inicio', lunesSigIso)
          .neq('estado', 'Sin Actividad');
        for (const r of (data || []) as any[]) {
          const key = r.conductor_id || r.conductor_wialon || '';
          if (!key) continue;
          const prev = sumKmPorConductor.get(key) || { km: 0, modalidad: r.vehiculo_modalidad || 'turno' };
          prev.km += Number(r.kilometraje) || 0;
          // Si la modalidad varía, gana 'a_cargo' (limite mas alto)
          if (r.vehiculo_modalidad === 'a_cargo') prev.modalidad = 'a_cargo';
          sumKmPorConductor.set(key, prev);
        }
      };
      await Promise.all([fetchSemanaTabla('wialon_bitacora'), fetchSemanaTabla('geotab_bitacora')]);

      // 4) Aplicar a cada marcación
      for (const m of marcacionesTransformadas) {
        const key = m.conductorId || m.conductor || '';
        const acc = sumKmPorConductor.get(key);
        if (acc) {
          const limite = acc.modalidad === 'a_cargo' ? limiteACargo : limiteTurno;
          m.kmSemanaConductor = Math.round(acc.km * 100) / 100;
          m.limiteSemanal = limite;
          m.excedeLimite = acc.km > limite;
        } else {
          m.limiteSemanal = (m.vehiculoModalidad === 'a_cargo') ? limiteACargo : limiteTurno;
          m.kmSemanaConductor = 0;
          m.excedeLimite = false;
        }
      }
      // ===== FIN ALERTA LIMITE KM =====

      // Lookup DNIs + horario asignado en batch
      const conductorIds = [...new Set(marcacionesTransformadas.map(m => m.conductorId).filter(Boolean))] as string[];
      if (conductorIds.length > 0) {
        // DNIs
        const { data: conductoresData } = await supabase
          .from('conductores')
          .select('id, numero_dni')
          .in('id', conductorIds);
        const dniMap = new Map((conductoresData || []).map((c: any) => [c.id, c.numero_dni]));
        marcacionesTransformadas.forEach(m => {
          if (m.conductorId) m.conductorDni = dniMap.get(m.conductorId) ?? null;
        });

        // No filtrar por asignación: bitácora muestra TODO lo que hay en wialon_bitacora.
        // El horario de cada marcación ya viene resuelto por el sync según la asignación
        // vigente en la fecha procesada.
        setMarcaciones(marcacionesTransformadas);
      } else {
        setMarcaciones(marcacionesTransformadas);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [dateRange, page, pageSize, filterPatente, sedeId]);

  // Cargar al montar y cuando cambian parámetros
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      loadData();
      return;
    }
    loadData();
  }, [loadData]);

  // Cambiar rango de fecha
  const setDateRangePreset = useCallback((preset: string) => {
    const today = getToday();
    switch (preset) {
      case 'today':
        setDateRange({ startDate: today, endDate: today, label: 'Hoy' });
        break;
      case 'yesterday': {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        const yd = toArgentinaDateString(d);
        setDateRange({ startDate: yd, endDate: yd, label: 'Ayer' });
        break;
      }
      case 'week': {
        // Calcular lunes y domingo de la semana actual en zona Argentina
        const ahoraArt = new Date(new Date().toLocaleString('en-US', { timeZone: TIMEZONE_ARGENTINA }));
        const dow = ahoraArt.getDay() === 0 ? 7 : ahoraArt.getDay(); // domingo=7 (ISO)
        const lunes = new Date(ahoraArt);
        lunes.setDate(ahoraArt.getDate() - (dow - 1));
        lunes.setHours(0, 0, 0, 0);
        const domingo = new Date(lunes);
        domingo.setDate(lunes.getDate() + 6);
        domingo.setHours(23, 59, 59, 999);
        // Numero de semana ISO
        const ref = new Date(lunes);
        ref.setDate(ref.getDate() + 4 - (ref.getDay() || 7));
        const yearStart = new Date(ref.getFullYear(), 0, 1);
        const nroSemana = Math.ceil(((ref.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
        setDateRange({
          startDate: toArgentinaDateString(lunes),
          endDate: toArgentinaDateString(domingo),
          label: `Semana ${nroSemana}`,
        });
        break;
      }
      case 'month': {
        const d = new Date();
        d.setDate(1);
        setDateRange({ startDate: toArgentinaDateString(d), endDate: today, label: 'Este mes' });
        break;
      }
    }
    setPage(1);
  }, []);

  const setCustomDateRange = useCallback((startDate: string, endDate: string, label?: string) => {
    setDateRange({ startDate, endDate, label: label || 'Personalizado' });
    setPage(1);
  }, []);

  // Actualizar checklist de una marcación
  const updateChecklist = useCallback(async (
    id: string,
    updates: { gnc_cargado?: boolean; lavado_realizado?: boolean; nafta_cargada?: boolean }
  ) => {
    await wialonBitacoraService.updateChecklist(id, updates);
    // Actualizar localmente
    setMarcaciones(prev => prev.map(m => {
      if (m.id !== id) return m;
      return {
        ...m,
        gncCargado: updates.gnc_cargado ?? m.gncCargado,
        lavadoRealizado: updates.lavado_realizado ?? m.lavadoRealizado,
        naftaCargada: updates.nafta_cargada ?? m.naftaCargada,
      };
    }));
  }, []);

  return {
    // Vista
    vista,
    setVista,

    // Datos Histórico
    registros,
    totalCount,

    // Datos Marcaciones
    marcaciones,

    // Estado
    loading,
    error,

    // Fechas
    dateRange,
    setDateRangePreset,
    setCustomDateRange,

    // Paginación
    page,
    setPage,
    pageSize,
    setPageSize,

    // Búsqueda
    searchTerm,
    handleSearchChange,

    // Acciones
    refresh: loadData,
    updateChecklist,
  };
}
