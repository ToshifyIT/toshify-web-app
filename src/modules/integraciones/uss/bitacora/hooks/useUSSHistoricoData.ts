// src/modules/integraciones/uss/bitacora/hooks/useUSSHistoricoData.ts
/**
 * Hook para el módulo Bitácora
 * - Histórico: registros crudos de uss_historico
 * - Marcaciones: datos sumarizados de wialon_bitacora (1 fila/conductor/día)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
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
    const today = getToday();
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return {
      startDate: toArgentinaDateString(d),
      endDate: today,
      label: 'Esta semana',
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
      setMarcaciones(bitacoraResult.data.map(transformarMarcacion).filter(m => m.estado !== 'Sin Actividad'));
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
