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
import { normalizePatente } from '../../../../../utils/normalizeDocuments';

// Zona horaria Argentina
const TIMEZONE_ARGENTINA = 'America/Argentina/Buenos_Aires';

function toArgentinaDateString(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: TIMEZONE_ARGENTINA });
}

function getToday(): string {
  return toArgentinaDateString(new Date());
}

function getWeekRange(): { startDate: string; endDate: string } {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now);
  monday.setDate(diff);
  return {
    startDate: toArgentinaDateString(monday),
    endDate: toArgentinaDateString(now),
  };
}

// Marcación: 1 fila por conductor por día (de wialon_bitacora)
export interface Marcacion {
  id: string;
  conductor: string;
  conductorId: string | null;
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
  vehiculoModalidad: string | null; // TURNO, CARGO
  gncCargado: boolean;
  lavadoRealizado: boolean;
  naftaCargada: boolean;
}

export interface USSHistoricoDateRange {
  startDate: string;
  endDate: string;
  label: string;
}

// Tipos para enriquecimiento desde asignaciones
interface ConductorTurno {
  conductor_nombre: string;
  conductor_completo: string;
  turno: string | null; // diurno, nocturno, todo_dia
}

interface AsignacionActiva {
  patente: string;
  patente_normalizada: string;
  modalidad: string | null; // TURNO, CARGO
  conductores: ConductorTurno[];
}

function transformarMarcacion(reg: BitacoraRegistroTransformado): Marcacion {
  return {
    id: reg.id,
    conductor: reg.conductor_wialon || 'Sin conductor',
    conductorId: reg.conductor_id,
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
  };
}

export function useUSSHistoricoData(sedeId?: string | null) {
  const [dateRange, setDateRange] = useState<USSHistoricoDateRange>(() => {
    const week = getWeekRange();
    return {
      startDate: week.startDate,
      endDate: week.endDate,
      label: 'Esta semana',
    };
  });

  // Registros crudos para tabla Histórico
  const [registros, setRegistros] = useState<USSHistoricoRegistro[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  // Marcaciones de wialon_bitacora
  const [marcaciones, setMarcaciones] = useState<Marcacion[]>([]);

  // Ref para asignaciones activas (no necesita re-render)
  const asignacionesRef = useRef<Map<string, AsignacionActiva>>(new Map());

  // Paginación (solo para Histórico)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);

  // Búsqueda
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPatente, setFilterPatente] = useState('');

  // Estado
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Vista activa (marcaciones por defecto)
  const [vista, setVista] = useState<'historico' | 'marcaciones'>('marcaciones');

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

  // Cargar asignaciones activas con conductores y sus turnos
  const loadAsignaciones = useCallback(async () => {
    try {
      const { data: asignacionesData } = await (supabase
        .from('asignaciones')
        .select('id, vehiculo_id, horario, vehiculos!inner(patente)')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .eq('estado', 'activa') as any);

      if (!asignacionesData || asignacionesData.length === 0) {
        asignacionesRef.current = new Map();
        return new Map<string, AsignacionActiva>();
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const asignacionIds = asignacionesData.map((a: any) => a.id);
      const { data: conductoresData } = await (supabase
        .from('asignaciones_conductores')
        .select('asignacion_id, horario, conductor_id, conductores(nombres, apellidos)')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .in('asignacion_id', asignacionIds) as any);

      const conductoresPorAsignacion = new Map<string, ConductorTurno[]>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const ac of (conductoresData || []) as any[]) {
        const conductor = ac.conductores;
        if (conductor) {
          const asigId = ac.asignacion_id as string;
          if (!conductoresPorAsignacion.has(asigId)) {
            conductoresPorAsignacion.set(asigId, []);
          }
          conductoresPorAsignacion.get(asigId)!.push({
            conductor_nombre: conductor.nombres,
            conductor_completo: `${conductor.nombres} ${conductor.apellidos}`,
            turno: ac.horario,
          });
        }
      }

      const map = new Map<string, AsignacionActiva>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const asig of asignacionesData as any[]) {
        const vehiculo = asig.vehiculos;
        if (vehiculo) {
          const patenteNorm = normalizePatente(vehiculo.patente);
          const conductores = conductoresPorAsignacion.get(asig.id) || [];
          map.set(patenteNorm, {
            patente: vehiculo.patente,
            patente_normalizada: patenteNorm,
            modalidad: asig.horario,
            conductores,
          });
        }
      }
      asignacionesRef.current = map;
      return map;
    } catch {
      asignacionesRef.current = new Map();
      return new Map<string, AsignacionActiva>();
    }
  }, []);

  // Cargar asignaciones al montar
  useEffect(() => {
    loadAsignaciones();
  }, [loadAsignaciones]);

  // Enriquecer registros de bitácora con datos de asignaciones
  function enriquecerConAsignaciones(
    registros: BitacoraRegistroTransformado[],
    asigMap: Map<string, AsignacionActiva>,
  ): BitacoraRegistroTransformado[] {
    return registros.map((r) => {
      const asignacion = asigMap.get(r.patente_normalizada);
      if (!asignacion) return r;

      // Buscar conductor en la asignación
      let conductorMatch: ConductorTurno | undefined;
      const conductorWialon = r.conductor_wialon?.toLowerCase() || '';
      conductorMatch = asignacion.conductores.find(c =>
        conductorWialon && conductorWialon.includes(c.conductor_nombre.toLowerCase())
      );
      if (!conductorMatch && asignacion.conductores.length > 0) {
        conductorMatch = asignacion.conductores[0];
      }

      // Siempre usar asignación como fuente de verdad para turno/horario
      let turnoIndicador: string | null = null;
      if (asignacion.modalidad === 'TURNO' && conductorMatch?.turno) {
        if (conductorMatch.turno === 'diurno') turnoIndicador = 'diurno';
        else if (conductorMatch.turno === 'nocturno') turnoIndicador = 'nocturno';
      } else if (asignacion.modalidad === 'CARGO') {
        turnoIndicador = 'todo_dia';
      }

      return {
        ...r,
        tipo_turno: asignacion.modalidad === 'CARGO' ? 'CARGO' : asignacion.modalidad,
        turno_indicador: turnoIndicador,
      };
    });
  }

  // Cargar datos
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const offset = (page - 1) * pageSize;

      // Cargar Histórico + Marcaciones + Asignaciones en paralelo
      const [paginatedResult, bitacoraResult, asigMap] = await Promise.all([
        ussHistoricoService.getRegistros(dateRange.startDate, dateRange.endDate, {
          limit: pageSize,
          offset,
          patente: filterPatente || undefined,
          sedeId,
        }),
        wialonBitacoraService.getBitacora(dateRange.startDate, dateRange.endDate, { sedeId }),
        loadAsignaciones(),
      ]);

      // Enriquecer bitácora con asignaciones antes de transformar
      const registrosEnriquecidos = enriquecerConAsignaciones(bitacoraResult.data, asigMap);

      setRegistros(paginatedResult.data);
      setTotalCount(paginatedResult.count);
      setMarcaciones(registrosEnriquecidos.map(transformarMarcacion).filter(m => m.estado !== 'Sin Actividad'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [dateRange, page, pageSize, filterPatente, sedeId, loadAsignaciones]);

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
        const d = new Date();
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        d.setDate(diff);
        setDateRange({ startDate: toArgentinaDateString(d), endDate: today, label: 'Esta semana' });
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
