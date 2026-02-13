import { useState, useEffect, useRef } from "react";
import { supabase } from "../../../lib/supabase";
import { format } from "date-fns";
import Swal from "sweetalert2";
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

interface HistoryRow {
  semana: string;
  efectivo: number;
  app: number;
  total: number;
  llamada: "REALIZADA" | "PENDIENTES";
  fecha_llamada: string | null;
  accion_nombre: string;
  notas: any[]; // anotaciones_extra
  // Context from current driver (repeated)
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
  // State for search
  const [allDrivers, setAllDrivers] = useState<SearchableDriver[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchableDriver[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<SearchableDriver | null>(null);
  
  // State for data
  const [historyData, setHistoryData] = useState<HistoryRow[]>([]);
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
  }, [isOpen]);

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
      let guidesMap: Record<string, string> = {};
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
      } catch (e) {
        console.warn('Could not fetch guides list', e);
      }

      // Fetch Drivers with Guide
      const { data: drivers, error } = await supabase
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
        .not('id_guia', 'is', null) // Only those with guide
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
    } catch (err) {
      console.error("Error loading drivers:", err);
    }
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

    const lowerQ = query.toLowerCase();
    const filtered = allDrivers.filter(d => 
      d.nombre.toLowerCase().includes(lowerQ) || 
      d.dni.includes(lowerQ)
    );
    setSuggestions(filtered.slice(0, 20));
  };

  // 3. Handle Driver Selection
  const handleSelectDriver = async (driver: SearchableDriver) => {
    setSelectedDriver(driver);
    setSearchQuery(driver.nombre); // Set input to name
    setSuggestions([]); // Hide dropdown
    await loadDriverHistory(driver);
  };

  // 4. Load History
  const loadDriverHistory = async (driver: SearchableDriver) => {
    try {
      const { data: history, error } = await supabase
        .from('guias_historial_semanal')
        .select('*')
        .eq('id_conductor', driver.id)
        .order('semana', { ascending: false });

      if (error) throw error;

      const rows: HistoryRow[] = (history as unknown as RawHistory[]).map((h) => ({
        semana: h.semana,
        efectivo: Number(h.efectivo || 0),
        app: Number(h.app || 0),
        total: Number(h.total || 0),
        llamada: h.fecha_llamada ? "REALIZADA" : "PENDIENTES",
        fecha_llamada: h.fecha_llamada ? format(new Date(h.fecha_llamada), 'dd/MM/yyyy') : null,
        accion_nombre: (h.id_accion_imp ? accionesMap[h.id_accion_imp] : undefined) || (h.id_accion_imp === 1 ? 'CAPACITACION CABIFY' : '-'),
        notas: h.anotaciones_extra || [],
        // Repeat current driver context (as history doesn't track these changes yet)
        turno: driver.turno || 'N/A',
        estado: driver.estado || 'N/A',
        asignacion: driver.asignacion || 'N/A',
        asignacionDetalle: driver.asignacionDetalle || '',
        escuela: driver.escuela ? 'SI' : 'NO'
      }));

      setHistoryData(rows);

    } catch (err) {
      console.error("Error loading history:", err);
      Swal.fire('Error', 'No se pudo cargar el historial del conductor', 'error');
    }
  };

  const handleViewNotes = (notes: any[]) => {
    if (!notes || notes.length === 0) {
      Swal.fire('Sin notas', 'No hay notas registradas para esta semana.', 'info');
      return;
    }

    const notesHtml = notes.map(n => `
      <div style="text-align: left; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 5px;">
        <div style="font-size: 12px; color: #666;">${n.fecha ? format(new Date(n.fecha), 'dd/MM/yyyy HH:mm') : '-'} - <strong>${n.usuario || 'Sistema'}</strong></div>
        <div style="font-size: 14px;">${n.texto}</div>
      </div>
    `).join('');

    Swal.fire({
      title: 'Notas de la Semana',
      html: `<div style="max-height: 300px; overflow-y: auto;">${notesHtml}</div>`,
      confirmButtonText: 'Cerrar',
      width: 600
    });
  };

  const clearSelection = () => {
    setSearchQuery("");
    setSelectedDriver(null);
    setHistoryData([]);
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
            <span className="gc-search-icon">🔍</span>
            <input
              ref={inputRef}
              className="gc-search"
              placeholder="Buscar conductor por nombre o DNI..."
              value={searchQuery}
              onChange={handleSearchChange}
              onFocus={() => {
                if (!searchQuery) {
                   setSuggestions(allDrivers.slice(0, 20));
                } else {
                   const lowerQ = searchQuery.toLowerCase();
                   setSuggestions(allDrivers.filter(d => d.nombre.toLowerCase().includes(lowerQ) || d.dni.includes(lowerQ)).slice(0, 20));
                }
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
          {selectedDriver ? (
            <table className="gc-table">
              <thead>
                <tr>
                  <th>SEMANA</th>
                  <th>ASIGNACIÓN</th>
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
                            📝 <span className="gc-notes-badge">{row.notas.length}</span>
                          </button>
                        ) : (
                          <span style={{ color: '#ccc' }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                      No hay historial registrado para este conductor.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '300px', color: '#999' }}>
              <span style={{ fontSize: '48px', marginBottom: '16px' }}>🔍</span>
              <p>Busque y seleccione un conductor para ver su historial.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GestionConductores;
