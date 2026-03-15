import { useState, useEffect, useRef } from "react";
import { supabase } from "../../../lib/supabase";
import { format, startOfISOWeek } from "date-fns";
import Swal from "sweetalert2";
import { useSede } from '../../../contexts/SedeContext';
import { Search, FileEdit } from 'lucide-react';
import { normalizeDni } from '../../../utils/normalizeDocuments';
import "./GestionConductores.css";

// Interfaces
interface RawDriver {
  id: string;
  nombres: string;
  apellidos: string;
  numero_dni: string | null;
  preferencia_turno: string | null;
  fecha_escuela: string | null;
  id_guia: string | null;
  conductores_estados: { codigo: string; descripcion: string } | null;
  asignaciones_conductores: {
    asignaciones: {
      vehiculos: { patente: string; marca: string; modelo: string } | null;
    } | null;
  }[];
}

interface SearchableDriver {
  id: string;
  nombre: string;
  dni: string;
  guia_nombre: string;
  // Current data for context
  turno?: string;
  estado?: string;
  asignacion?: string;
  asignacionDetalle?: string;
  escuela?: boolean;
}

interface RawHistory {
  semana: string;
  efectivo: number | null;
  app: number | null;
  total: number | null;
  fecha_llamada: string | null;
  id_accion_imp: number | null;
  anotaciones_extra: any[] | null;
}

interface WeekAssignment {
  patente: string;
  detalle: string;
  turno: string;
  estadoAsignacion: string;
}

interface HistoryRow {
  semana: string;
  efectivo: number;
  app: number;
  total: number;
  llamada: "REALIZADA" | "PENDIENTES";
  fecha_llamada: string | null;
  accion_nombre: string;
  notas: any[]; // anotaciones_extra
  turno: string;
  estado: string;
  asignacion: string;
  asignacionDetalle: string;
  escuela: string;
}

interface Props { 
  isOpen: boolean; 
  onClose: () => void; 
  onRefresh?: () => void; 
}

const fmt = (n: number) => `$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`;

const GestionConductores = ({ isOpen, onClose, onRefresh }: Props) => {
  const { aplicarFiltroSede, sedeActualId } = useSede();

  // State for search
  const [allDrivers, setAllDrivers] = useState<SearchableDriver[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchableDriver[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<SearchableDriver | null>(null);
  
  // State for data
  const [historyData, setHistoryData] = useState<HistoryRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [accionesMap, setAccionesMap] = useState<Record<number, string>>({});

  // Refs
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 1. Auto-focus on open
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // 1. Fetch all searchable drivers (with assigned guide) + Actions map
  useEffect(() => {
    if (isOpen) {
      loadInitialData();
    }
  }, [isOpen, sedeActualId]);

  // Re-filtrar cuando allDrivers se carga y ya hay texto en el buscador
  useEffect(() => {
    if (allDrivers.length > 0 && searchQuery && !selectedDriver) {
      setSuggestions(filterDrivers(searchQuery).slice(0, 20));
    }
  }, [allDrivers]);

  const handleRefresh = () => {
    loadInitialData();
    onRefresh?.();
  };

  const loadInitialData = async () => {
    try {
      // Fetch Acciones
      const { data: acciones } = await supabase.from('acciones_implementadas').select('id, nombre');
      const accMap: Record<number, string> = {};
      acciones?.forEach(a => accMap[a.id] = a.nombre);
      setAccionesMap(accMap);

      // Fetch Guides for name mapping using user_profiles table (consistent with GuiasModule)
      const guidesMap: Record<string, string> = {};
      try {
        const { data: guiasData } = await supabase
          .from('user_profiles')
          .select(`
            id,
            full_name,
            roles!inner ( name )
          `)
          .eq('roles.name', 'guia');

        if (guiasData) {
          guiasData.forEach((g: any) => guidesMap[g.id] = g.full_name);
        }
      } catch (_e) {
        // silently ignored
      }

      // Fetch Drivers with Guide
      const { data: drivers, error } = await aplicarFiltroSede(supabase
        .from('conductores')
        .select(`
          id, 
          nombres, 
          apellidos, 
          numero_dni, 
          preferencia_turno,
          fecha_escuela,
          id_guia,
          conductores_estados ( codigo, descripcion ),
          asignaciones_conductores (
            asignaciones (
              vehiculos ( patente, marca, modelo )
            )
          )
        `)
        .not('id_guia', 'is', null))
        .order('apellidos');

      if (error) throw error;

      const formattedDrivers: SearchableDriver[] = (drivers as unknown as RawDriver[]).map((d) => {
        // Get active vehicle assignment
        const activeAsignacion = d.asignaciones_conductores?.[0]?.asignaciones?.vehiculos;
        
        return {
          id: d.id,
          nombre: `${d.apellidos} ${d.nombres}`.trim(),
          dni: d.numero_dni || '',
          guia_nombre: (d.id_guia ? guidesMap[d.id_guia] : undefined) || 'Desconocido',
          turno: d.preferencia_turno || 'N/A',
          estado: d.conductores_estados?.codigo || 'N/A',
          asignacion: activeAsignacion ? activeAsignacion.patente : 'SIN ASIGNACIÓN',
          asignacionDetalle: activeAsignacion ? `${activeAsignacion.marca} ${activeAsignacion.modelo}` : '',
          escuela: !!d.fecha_escuela
        };
      });

      setAllDrivers(formattedDrivers);
    } catch (_err) {
      // silently ignored
    }
  };

  // Indexar todos los campos de un conductor en un solo string para búsqueda
  const buildSearchText = (d: SearchableDriver): string => {
    return [d.nombre, d.dni, d.guia_nombre, d.turno, d.estado, d.asignacion, d.asignacionDetalle]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  };

  // Filtrar conductores usando búsqueda multi-palabra (misma lógica que DataTable)
  const filterDrivers = (query: string): SearchableDriver[] => {
    if (!query.trim()) return allDrivers;
    const words = query.toLowerCase().trim().split(/\s+/).filter(w => w.length > 0);
    return allDrivers.filter(d => {
      const text = buildSearchText(d);
      return words.every(word => text.includes(word));
    });
  };

  // 2. Handle Search Input
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);

    // Si el usuario escribe, limpiamos la selección actual para permitir nueva búsqueda
    if (selectedDriver) {
      setSelectedDriver(null);
      setHistoryData([]);
    }

    setSuggestions(filterDrivers(query).slice(0, 20));
  };

  // 3. Handle Driver Selection
  const handleSelectDriver = async (driver: SearchableDriver) => {
    setSelectedDriver(driver);
    setSearchQuery(driver.nombre); // Set input to name
    setSuggestions([]); // Hide dropdown
    await loadDriverHistory(driver);
  };

  // Helper: calcular lunes y domingo de una semana ISO
  const getWeekRange = (semana: string): { monday: Date; sunday: Date } => {
    const [yStr, wStr] = semana.split('-W');
    const y = parseInt(yStr);
    const w = parseInt(wStr);
    const jan4 = new Date(Date.UTC(y, 0, 4));
    const dow = jan4.getUTCDay() || 7;
    const mondayW1 = new Date(jan4.getTime() - (dow - 1) * 86400000);
    const monday = new Date(mondayW1.getTime() + (w - 1) * 7 * 86400000);
    const sunday = new Date(monday.getTime() + 6 * 86400000);
    return { monday, sunday };
  };

  // Helper: construir filas del historial (con o sin datos Cabify)
  const buildHistoryRows = (
    rawHistory: RawHistory[],
    driver: SearchableDriver,
    cabifyDataMap?: Map<string, Map<string, { cobroApp: number; cobroEfectivo: number }>>,
    weekAssignments?: Map<string, WeekAssignment>
  ): HistoryRow[] => {
    return rawHistory.map((h) => {
      const cabifyEntry = cabifyDataMap?.get(h.semana)?.get(driver.id);
      const app = cabifyEntry ? Number(cabifyEntry.cobroApp.toFixed(2)) : 0;
      const efectivo = cabifyEntry ? Number(cabifyEntry.cobroEfectivo.toFixed(2)) : 0;
      const total = Number((app + efectivo).toFixed(2));

      const weekAsig = weekAssignments?.get(h.semana);

      return {
        semana: h.semana,
        efectivo,
        app,
        total,
        llamada: h.fecha_llamada ? "REALIZADA" : "PENDIENTES",
        fecha_llamada: h.fecha_llamada ? format(new Date(h.fecha_llamada), 'dd/MM/yyyy') : null,
        accion_nombre: (h.id_accion_imp ? accionesMap[h.id_accion_imp] : undefined) || (h.id_accion_imp === 1 ? 'CAPACITACION CABIFY' : '-'),
        notas: h.anotaciones_extra || [],
        turno: weekAsig?.turno || driver.turno || 'N/A',
        estado: weekAsig?.estadoAsignacion || '-',
        asignacion: weekAsig?.patente || driver.asignacion || 'N/A',
        asignacionDetalle: weekAsig?.detalle || driver.asignacionDetalle || '',
        escuela: driver.escuela ? 'SI' : 'NO'
      };
    });
  };

  // 4. Load History (historial + Cabify en paralelo, muestra todo de una vez)
  const loadDriverHistory = async (driver: SearchableDriver) => {
    try {
      setLoadingHistory(true);

      const { data: history, error } = await supabase
        .from('guias_historial_semanal')
        .select('*')
        .eq('id_conductor', driver.id)
        .order('semana', { ascending: false });

      if (error) throw error;

      const rawHistory = history as unknown as RawHistory[];
      if (!rawHistory || rawHistory.length === 0) {
        setHistoryData([]);
        return;
      }

      const semanas = rawHistory.map(h => h.semana);

      // Calcular rango de fechas que cubra todas las semanas (min → max)
      const weekDates = semanas.map(s => {
        const { monday, sunday } = getWeekRange(s);
        return { semana: s, monday, sunday };
      });
      const minDate = new Date(Math.min(...weekDates.map(w => w.monday.getTime())));
      const maxDate = new Date(Math.max(...weekDates.map(w => w.sunday.getTime())));
      const startDateStr = minDate.toISOString();
      const endDateStr = new Date(Date.UTC(maxDate.getUTCFullYear(), maxDate.getUTCMonth(), maxDate.getUTCDate(), 23, 59, 59, 999)).toISOString();

      // Ejecutar 3 consultas en paralelo: Cabify + Asignaciones + fecha_terminacion
      const cabifyPromise = (async () => {
        if (!driver.dni) return undefined;
        try {
          const dniNorm = normalizeDni(driver.dni);
          const { data: cabifyRows } = await supabase
            .from('cabify_historico')
            .select('dni, cobro_efectivo, cobro_app, fecha_inicio')
            .eq('dni', dniNorm)
            .gte('fecha_inicio', startDateStr)
            .lte('fecha_inicio', endDateStr);

          if (!cabifyRows || cabifyRows.length === 0) return undefined;

          const cabifyMap = new Map<string, Map<string, { cobroApp: number; cobroEfectivo: number }>>();
          for (const row of cabifyRows) {
            const fechaDate = new Date(row.fecha_inicio);
            const monday = startOfISOWeek(fechaDate);
            const semanaKey = format(monday, "R-'W'II");
            let semanaMap = cabifyMap.get(semanaKey);
            if (!semanaMap) { semanaMap = new Map(); cabifyMap.set(semanaKey, semanaMap); }
            const existing = semanaMap.get(driver.id) || { cobroApp: 0, cobroEfectivo: 0 };
            existing.cobroApp += Number(row.cobro_app) || 0;
            existing.cobroEfectivo += Number(row.cobro_efectivo) || 0;
            semanaMap.set(driver.id, existing);
          }
          return cabifyMap;
        } catch {
          return undefined;
        }
      })();

      const assignmentsPromise = (async () => {
        try {
          const { data: asigRows } = await supabase
            .from('asignaciones_conductores')
            .select('horario, estado, fecha_inicio, fecha_fin, asignaciones!inner(estado, horario, fecha_inicio, fecha_fin, vehiculos(patente, marca, modelo))')
            .eq('conductor_id', driver.id)
            .order('fecha_inicio', { ascending: false });

          if (!asigRows || asigRows.length === 0) return new Map<string, WeekAssignment>();

          // Prioridad de estados: asignado/activo > cancelada > finalizada/completada > programado
          const estadoPrioridad: Record<string, number> = {
            asignado: 1, activo: 1, activa: 1,
            cancelado: 2, cancelada: 2,
            finalizado: 3, finalizada: 3, completado: 3, completada: 3,
            programado: 4, programada: 4,
          };

          // Para cada semana, recolectar todas las asignaciones vigentes y elegir la mejor
          const weekMap = new Map<string, WeekAssignment>();
          for (const wd of weekDates) {
            const mondayMs = wd.monday.getTime();
            const sundayMs = wd.sunday.getTime();

            let bestMatch: WeekAssignment | null = null;
            let bestPriority = Infinity;

            for (const ac of asigRows as any[]) {
              const asig = ac.asignaciones;
              if (!asig || !asig.vehiculos) continue;

              const acInicio = ac.fecha_inicio ? new Date(ac.fecha_inicio).getTime() : 0;
              const acFin = ac.fecha_fin ? new Date(ac.fecha_fin).getTime() : Infinity;
              const asigInicio = asig.fecha_inicio ? new Date(asig.fecha_inicio).getTime() : 0;
              const asigFin = asig.fecha_fin ? new Date(asig.fecha_fin).getTime() : Infinity;

              const inicio = Math.max(acInicio, asigInicio);
              const fin = Math.min(acFin, asigFin);
              if (inicio <= sundayMs && fin >= mondayMs) {
                const rawEstado = (ac.estado || asig.estado || '').toLowerCase();
                const priority = estadoPrioridad[rawEstado] ?? 5;

                if (priority < bestPriority) {
                  const modalidadAsig = (asig.horario || '').toUpperCase();
                  const horarioCond = (ac.horario || '').toUpperCase();
                  let turno = 'N/A';
                  if (modalidadAsig === 'CARGO' || horarioCond === 'TODO_DIA') {
                    turno = 'A Cargo';
                  } else if (horarioCond === 'DIURNO' || horarioCond === 'D') {
                    turno = 'Diurno';
                  } else if (horarioCond === 'NOCTURNO' || horarioCond === 'N') {
                    turno = 'Nocturno';
                  }

                  const estadoDisplay = rawEstado.charAt(0).toUpperCase() + rawEstado.slice(1);
                  bestMatch = {
                    patente: asig.vehiculos.patente,
                    detalle: `${asig.vehiculos.marca} ${asig.vehiculos.modelo}`.trim(),
                    turno,
                    estadoAsignacion: estadoDisplay,
                  };
                  bestPriority = priority;
                  if (priority === 1) break; // No hay mejor que activo/asignado
                }
              }
            }

            if (bestMatch) weekMap.set(wd.semana, bestMatch);
          }
          return weekMap;
        } catch {
          return new Map<string, WeekAssignment>();
        }
      })();

      const [cabifyDataMap, weekAssignments] = await Promise.all([
        cabifyPromise, assignmentsPromise
      ]);

      setHistoryData(buildHistoryRows(rawHistory, driver, cabifyDataMap, weekAssignments));

    } catch (_err) {
      Swal.fire({
        title: 'Error',
        text: 'No se pudo cargar el historial del conductor',
        icon: 'error',
        didOpen: () => { const c = Swal.getContainer(); if (c) c.style.zIndex = '1100'; }
      });
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleViewNotes = (notes: any[]) => {
    if (!notes || notes.length === 0) {
      Swal.fire({ title: 'Sin notas', text: 'No hay notas registradas para esta semana.', icon: 'info', didOpen: () => { const container = Swal.getContainer(); if (container) container.style.zIndex = '1100'; } });
      return;
    }

    const notesHtml = notes.map(n => `
      <div style="text-align: left; margin-bottom: 10px; border-bottom: 1px solid var(--border-primary, #eee); padding-bottom: 5px;">
        <div style="font-size: 12px; color: var(--text-tertiary, #666);">${n.fecha ? format(new Date(n.fecha), 'dd/MM/yyyy HH:mm') : '-'} - <strong>${n.usuario || 'Sistema'}</strong></div>
        <div style="font-size: 14px; color: var(--text-primary, #333);">${n.texto}</div>
      </div>
    `).join('');

    Swal.fire({
      title: 'Notas de la Semana',
      html: `<div style="max-height: 300px; overflow-y: auto;">${notesHtml}</div>`,
      confirmButtonText: 'Cerrar',
      width: 600,
      didOpen: () => {
        const container = Swal.getContainer();
        if (container) container.style.zIndex = '1100';
      }
    });
  };

  const clearSelection = () => {
    setSearchQuery("");
    setSelectedDriver(null);
    setHistoryData([]);
    setLoadingHistory(false);
    setSuggestions([]);
  };

  if (!isOpen) return null;

  return (
    <div className="gc-overlay">
      <div className="gc-modal">
        <div className="gc-header">
          <div>
            <h2 className="gc-title">Gestión de Conductores</h2>
            <p className="gc-subtitle">Historial y seguimiento por conductor</p>
          </div>
          <div className="gc-header-actions">
            <button className="gc-btn-icon" onClick={handleRefresh}>↻</button>
            <button className="gc-btn-icon" onClick={onClose}>✕</button>
          </div>
        </div>
        
        <div className="gc-toolbar">
          <div className="gc-search-wrap" style={{ position: 'relative' }}>
            <span className="gc-search-icon"><Search size={14} /></span>
            <input
              ref={inputRef}
              className="gc-search"
              placeholder="Buscar conductor por nombre o DNI..."
              value={searchQuery}
              onChange={handleSearchChange}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData('text');
                if (!pasted) return;
                e.preventDefault();
                const start = inputRef.current?.selectionStart ?? searchQuery.length;
                const end = inputRef.current?.selectionEnd ?? searchQuery.length;
                const combined = searchQuery.substring(0, start) + pasted + searchQuery.substring(end);
                setSearchQuery(combined);
                if (selectedDriver) {
                  setSelectedDriver(null);
                  setHistoryData([]);
                }
                setSuggestions(filterDrivers(combined).slice(0, 20));
              }}
              onFocus={() => {
                setSuggestions(filterDrivers(searchQuery).slice(0, 20));
              }}
            />
            {selectedDriver && (
              <button 
                className="gc-clear-search" 
                onClick={clearSelection}
                title="Limpiar selección"
              >
                ✕
              </button>
            )}
            
            {/* Dropdown Suggestions */}
            {suggestions.length > 0 && (
              <div className="gc-suggestions" ref={dropdownRef}>
                {suggestions.map(s => (
                  <div 
                    key={s.id} 
                    className="gc-suggestion-item"
                    onClick={() => handleSelectDriver(s)}
                  >
                    <div className="gc-suggestion-name">{s.nombre}</div>
                    <div className="gc-suggestion-info">DNI: {s.dni} | Guía: {s.guia_nombre}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="gc-table-wrap">
          {selectedDriver && loadingHistory ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '300px', color: 'var(--text-tertiary)' }}>
              <div style={{ width: '32px', height: '32px', border: '3px solid var(--border-primary)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: '16px' }} />
              <p>Cargando historial...</p>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : selectedDriver ? (
            <table className="gc-table">
              <thead>
                <tr>
                  <th>SEMANA</th>
                  <th>ASIGNACIÓN</th>
                  <th>ESTADO</th>
                  <th>TURNO</th>
                  <th>ESCUELA</th>
                  <th>EFECTIVO</th>
                  <th>APP</th>
                  <th>TOTAL</th>
                  <th>LLAMADA</th>
                  <th>FECHA</th>
                  <th>ACCIONES</th>
                  <th>NOTAS</th>
                </tr>
              </thead>
              <tbody>
                {historyData.length > 0 ? (
                  historyData.map((row, i) => (
                    <tr key={i}>
                      <td className="td-nombre" style={{ fontWeight: 'bold' }}>{row.semana}</td>
                      <td>
                        <div className="td-asignacion">
                          <strong>{row.asignacion}</strong>
                          <span>{row.asignacionDetalle}</span>
                        </div>
                      </td>
                      <td className="td-center">
                        {row.estado !== '-' ? (
                          <span className={`badge-estado ${row.estado.toLowerCase()}`}>
                            {row.estado}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                        )}
                      </td>
                      <td className="td-center">{row.turno}</td>
                      <td className="td-center">{row.escuela}</td>
                      <td className="td-money">{fmt(row.efectivo)}</td>
                      <td className="td-money">{fmt(row.app)}</td>
                      <td className="td-money td-total">{fmt(row.total)}</td>
                      <td>
                        <span className={`badge-llamada ${row.llamada === "REALIZADA" ? "realizada" : "pendiente"}`}>
                          {row.llamada}
                        </span>
                      </td>
                      <td>{row.fecha_llamada || "—"}</td>
                      <td className="td-acciones">{row.accion_nombre}</td>
                      <td style={{ textAlign: 'center' }}>
                        {row.notas && row.notas.length > 0 ? (
                          <button 
                            className="gc-btn-notes" 
                            onClick={() => handleViewNotes(row.notas)}
                            title="Ver notas"
                          >
                            <FileEdit size={14} /> <span className="gc-notes-badge">{row.notas.length}</span>
                          </button>
                        ) : (
                          <span style={{ color: '#ccc' }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={12} style={{ textAlign: 'center', padding: '20px', color: 'var(--text-tertiary)' }}>
                      No hay historial registrado para este conductor.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '300px', color: '#999' }}>
              <Search size={48} style={{ marginBottom: '16px', color: '#ccc' }} />
              <p>Busque y seleccione un conductor para ver su historial.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GestionConductores;
