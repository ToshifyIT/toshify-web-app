// src/modules/integraciones/uss/bitacora/components/MarcacionesTable.tsx
/**
 * Vista de Marcaciones: datos sumarizados de wialon_bitacora
 * 1 fila por conductor por día con Entrada, Salida, Km, Estado, Checklist
 */

import { useMemo, useState, useRef, useEffect } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '../../../../../components/ui/DataTable/DataTable';
import { ExcelColumnFilter, useExcelFilters } from '../../../../../components/ui/DataTable/ExcelColumnFilter';
import { Search, ClipboardList, Download, ChevronDown, Fuel, SprayCan, Flame, Sun, Moon, Clock, X } from 'lucide-react';
import type { Marcacion } from '../hooks/useUSSHistoricoData';
import * as XLSX from 'xlsx';

interface MarcacionesTableProps {
  marcaciones: Marcacion[];
  isLoading: boolean;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  headerControls?: React.ReactNode;
  onUpdateChecklist: (id: string, updates: {
    gnc_cargado?: boolean;
    lavado_realizado?: boolean;
    nafta_cargada?: boolean;
  }) => Promise<void>;
}

function formatFecha(fecha: string): string {
  if (!fecha) return '-';
  const [y, m, d] = fecha.split('-');
  return `${d}/${m}/${y.slice(2)}`;
}

/**
 * Formatea un ISO timestamp (periodo_inicio/periodo_fin) a DD/MM/YY HH:MM:SS
 * Los periodos vienen en UTC (+00), se les resta 3 horas para mostrar hora Argentina.
 */
function formatPeriodo(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  // Restar 6 horas para coincidir con hora real Argentina
  const ar = new Date(d.getTime() - 6 * 60 * 60 * 1000);
  const dd = String(ar.getUTCDate()).padStart(2, '0');
  const mm = String(ar.getUTCMonth() + 1).padStart(2, '0');
  const yy = String(ar.getUTCFullYear()).slice(2);
  const hh = String(ar.getUTCHours()).padStart(2, '0');
  const mi = String(ar.getUTCMinutes()).padStart(2, '0');
  const ss = String(ar.getUTCSeconds()).padStart(2, '0');
  return `${dd}/${mm}/${yy} ${hh}:${mi}:${ss}`;
}

/**
 * Resuelve la fecha+hora para Entrada o Salida.
 * Prioridad: periodo (ISO timestamp real) > reconstrucción desde fecha_turno + hora + horario.
 *
 * Lógica de turnos para reconstrucción:
 *   - Diurno: fecha real = fecha_turno (horas 06:00-17:59)
 *   - Nocturno inicio 18:00-23:59: fecha real = fecha_turno
 *   - Nocturno madrugada 00:00-05:59: fecha real = fecha_turno + 1 día
 */
function resolverFechaHora(periodo: string | null, fechaTurno: string, hora: string, horario: string): string {
  // Si tenemos el timestamp completo del periodo, usarlo directamente
  if (periodo) {
    const formatted = formatPeriodo(periodo);
    if (formatted !== '-') return formatted;
  }
  // Fallback: reconstruir desde fecha_turno + hora + horario
  if (!hora || hora === '-') return '-';
  const horaNum = parseInt(hora.split(':')[0], 10);
  // Nocturno con hora de madrugada → la fecha real es fecha_turno + 1
  if (horario === 'nocturno' && horaNum >= 0 && horaNum < 6) {
    const d = new Date(fechaTurno + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    const yr = String(d.getFullYear()).slice(2);
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${da}/${mo}/${yr} ${hora}`;
  }
  // Diurno o nocturno con hora nocturna (18-23): fecha real = fecha_turno
  const [y, m, dd] = fechaTurno.split('-');
  return `${dd}/${m}/${y.slice(2)} ${hora}`;
}

function formatDuracion(minutos: number | null): string {
  if (minutos === null || minutos === undefined) return '-';
  const h = Math.floor(minutos / 60);
  const m = Math.round(minutos % 60);
  if (h === 0) return `${m}min`;
  return `${h}h ${m}min`;
}

function getEstadoColor(estado: string): string {
  switch (estado) {
    case 'Turno Finalizado': return '#16a34a';
    case 'En Curso': return '#2563eb';
    case 'Poco Km': return '#d97706';
    case 'Sin Actividad': return '#9ca3af';
    default: return 'var(--text-secondary)';
  }
}

export function MarcacionesTable({
  marcaciones,
  isLoading,
  searchTerm,
  onSearchChange,
  headerControls,
  onUpdateChecklist,
}: MarcacionesTableProps) {
  const { openFilterId, setOpenFilterId } = useExcelFilters();

  // Filtros Excel
  const [conductorFilter, setConductorFilter] = useState<string[]>([]);
  const [patenteFilter, setPatenteFilter] = useState<string[]>([]);
  const [fechaFilter, setFechaFilter] = useState<string[]>([]);
  const [estadoFilter, setEstadoFilter] = useState<string[]>([]);
  const [horarioFilter, setHorarioFilter] = useState<string[]>([]);
  const [turnoFilter, setTurnoFilter] = useState<string[]>([]);

  // Listas únicas
  const conductoresUnicos = useMemo(() =>
    [...new Set(marcaciones.map(m => m.conductor))].filter(Boolean).sort()
  , [marcaciones]);
  const patentesUnicas = useMemo(() =>
    [...new Set(marcaciones.map(m => m.patente))].filter(Boolean).sort()
  , [marcaciones]);
  const fechasUnicas = useMemo(() =>
    [...new Set(marcaciones.map(m => formatFecha(m.fecha)))].sort((a, b) => {
      const [da, ma, ya] = a.split('/');
      const [db, mb, yb] = b.split('/');
      return `${yb}${mb}${db}`.localeCompare(`${ya}${ma}${da}`);
    })
  , [marcaciones]);
  const estadosUnicos = useMemo(() =>
    [...new Set(marcaciones.map(m => m.estado))].filter(Boolean).sort()
  , [marcaciones]);
  const getHorarioLabel = (h: string, mod: string | null): string => {
    if (h === 'diurno') return 'Diurno';
    if (h === 'nocturno') return 'Nocturno';
    if (mod === 'CARGO' || mod === 'A_CARGO') return 'A Cargo';
    return 'Sin turno';
  };
  const horariosUnicos = useMemo(() =>
    [...new Set(marcaciones.map(m => getHorarioLabel(m.horario, m.vehiculoModalidad)))].filter(Boolean).sort()
  , [marcaciones]);
  const turnosUnicos = useMemo(() =>
    [...new Set(marcaciones.map(m => m.vehiculoModalidad || 'Sin asignar'))].filter(Boolean).sort()
  , [marcaciones]);

  const hasActiveFilters = conductorFilter.length > 0 || patenteFilter.length > 0 || fechaFilter.length > 0 || estadoFilter.length > 0 || horarioFilter.length > 0 || turnoFilter.length > 0 || searchTerm.trim() !== '';

  const clearAllFilters = () => {
    setConductorFilter([]);
    setPatenteFilter([]);
    setFechaFilter([]);
    setEstadoFilter([]);
    setHorarioFilter([]);
    setTurnoFilter([]);
    onSearchChange('');
  };

   // Filtrado local + búsqueda
  const marcacionesFiltradas = useMemo(() => {
    let filtered = marcaciones;

    if (conductorFilter.length > 0) {
      filtered = filtered.filter(m => conductorFilter.includes(m.conductor));
    }
    if (patenteFilter.length > 0) {
      filtered = filtered.filter(m => patenteFilter.includes(m.patente));
    }
    if (fechaFilter.length > 0) {
      filtered = filtered.filter(m => fechaFilter.includes(formatFecha(m.fecha)));
    }
    if (estadoFilter.length > 0) {
      filtered = filtered.filter(m => estadoFilter.includes(m.estado));
    }
    if (horarioFilter.length > 0) {
      filtered = filtered.filter(m => horarioFilter.includes(getHorarioLabel(m.horario, m.vehiculoModalidad)));
    }
    if (turnoFilter.length > 0) {
      filtered = filtered.filter(m => turnoFilter.includes(m.vehiculoModalidad || 'Sin asignar'));
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(m =>
        m.conductor.toLowerCase().includes(term) ||
        m.patente.toLowerCase().includes(term)
      );
    }

    return filtered;
  }, [marcaciones, conductorFilter, patenteFilter, fechaFilter, estadoFilter, horarioFilter, turnoFilter, searchTerm]);

  // Columnas
  const columns = useMemo<ColumnDef<Marcacion, unknown>[]>(() => [
    {
      accessorKey: 'conductor',
      header: () => (
        <ExcelColumnFilter label="Conductor" options={conductoresUnicos} selectedValues={conductorFilter}
          onSelectionChange={setConductorFilter} filterId="m-conductor" openFilterId={openFilterId} onOpenChange={setOpenFilterId} />
      ),
      cell: ({ row }) => (
        <span style={{ fontWeight: 600 }}>{row.original.conductor}</span>
      ),
      enableSorting: false,
    },
    {
      accessorKey: 'patente',
      header: () => (
        <ExcelColumnFilter label="Patente" options={patentesUnicas} selectedValues={patenteFilter}
          onSelectionChange={setPatenteFilter} filterId="m-patente" openFilterId={openFilterId} onOpenChange={setOpenFilterId} />
      ),
      cell: ({ row }) => (
        <span style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--color-primary)', fontWeight: 600 }}>
          {row.original.patente}
        </span>
      ),
      enableSorting: false,
    },
    {
      accessorKey: 'ibutton',
      header: 'iButton',
      cell: ({ row }) => (
        <span style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>{row.original.ibutton || '-'}</span>
      ),
      enableSorting: false,
    },
    {
      accessorKey: 'fecha',
      header: () => (
        <ExcelColumnFilter label="Fecha Turno" options={fechasUnicas} selectedValues={fechaFilter}
          onSelectionChange={setFechaFilter} filterId="m-fecha" openFilterId={openFilterId} onOpenChange={setOpenFilterId} />
      ),
      cell: ({ row }) => (
        <span style={{ fontSize: '12px' }}>{formatFecha(row.original.fecha)}</span>
      ),
      enableSorting: false,
    },
    {
      accessorKey: 'entrada',
      header: 'Entrada',
      cell: ({ row }) => {
        const m = row.original;
        const texto = resolverFechaHora(m.periodoInicio, m.fecha, m.entrada, m.horario);
        return (
          <span style={{ fontWeight: 600, fontSize: '12px', color: texto === '-' ? 'var(--text-tertiary)' : '#16a34a' }}>
            {texto}
          </span>
        );
      },
      enableSorting: true,
    },
    {
      accessorKey: 'salida',
      header: 'Salida',
      cell: ({ row }) => {
        const m = row.original;
        if (m.estado === 'En Curso') {
          const texto = resolverFechaHora(m.periodoFin, m.fecha, m.salida, m.horario);
          if (texto !== '-') {
            return (
              <span style={{ fontSize: '12px' }}>
                <span style={{ fontWeight: 600, color: '#2563eb' }}>{texto}</span>
                <span style={{ color: '#2563eb', fontStyle: 'italic', marginLeft: '4px' }}>(en curso)</span>
              </span>
            );
          }
          return <span style={{ fontSize: '12px', fontWeight: 600, fontStyle: 'italic', color: '#2563eb' }}>En curso</span>;
        }
        const texto = resolverFechaHora(m.periodoFin, m.fecha, m.salida, m.horario);
        return (
          <span style={{ fontWeight: 600, fontSize: '12px', color: texto === '-' ? 'var(--text-tertiary)' : '#dc2626' }}>
            {texto}
          </span>
        );
      },
      enableSorting: true,
    },
    {
      accessorKey: 'duracionMinutos',
      header: 'Duración',
      cell: ({ row }) => (
        <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
          {formatDuracion(row.original.duracionMinutos)}
        </span>
      ),
      enableSorting: true,
    },
    {
      accessorKey: 'kmTotal',
      header: 'Km Total',
      cell: ({ row }) => (
        <span style={{ fontWeight: 600 }}>
          {row.original.kmTotal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      ),
      enableSorting: true,
    },
    {
      accessorKey: 'vehiculoModalidad',
      header: () => (
        <ExcelColumnFilter label="Modalidad" options={turnosUnicos} selectedValues={turnoFilter}
          onSelectionChange={setTurnoFilter} filterId="m-turno" openFilterId={openFilterId} onOpenChange={setOpenFilterId} />
      ),
      cell: ({ row }) => {
        const mod = row.original.vehiculoModalidad;
        if (!mod) return <span title="Sin modalidad de turno asignada" style={{ fontSize: '12px', color: 'var(--text-tertiary)', cursor: 'default' }}>-</span>;
        const isCargo = mod === 'CARGO' || mod === 'A_CARGO';
        const color = mod === 'TURNO' ? '#7c3aed' : '#0891b2';
        const tooltip = isCargo
          ? 'A Cargo: El vehiculo esta asignado permanentemente al conductor'
          : 'Turno: El vehiculo se comparte entre conductores por turnos';
        return (
          <span title={tooltip} style={{
            fontSize: '11px', fontWeight: 600, padding: '2px 8px',
            borderRadius: '10px', color: '#fff', background: color, cursor: 'default',
          }}>
            {isCargo ? 'A Cargo' : 'Turno'}
          </span>
        );
      },
      enableSorting: false,
    },
    {
      accessorKey: 'estado',
      header: () => (
        <ExcelColumnFilter label="Estado" options={estadosUnicos} selectedValues={estadoFilter}
          onSelectionChange={setEstadoFilter} filterId="m-estado" openFilterId={openFilterId} onOpenChange={setOpenFilterId} />
      ),
      cell: ({ row }) => {
        const estado = row.original.estado;
        const tooltips: Record<string, string> = {
          'Turno Finalizado': 'Turno Finalizado: El conductor completo su turno correctamente',
          'En Curso': 'En Curso: El conductor esta actualmente en servicio',
          'Poco Km': 'Poco Km: El conductor registro menos de 100 km en su turno',
          'Sin Actividad': 'Sin Actividad: No se registro actividad para este conductor',
        };
        const shortLabels: Record<string, string> = {
          'Turno Finalizado': 'Finalizado',
        };
        return (
          <span title={tooltips[estado] || estado} style={{
            fontSize: '11px', fontWeight: 600, padding: '2px 8px',
            borderRadius: '10px', color: '#fff', whiteSpace: 'nowrap',
            background: getEstadoColor(estado), cursor: 'default',
          }}>
            {shortLabels[estado] || estado}
          </span>
        );
      },
      enableSorting: false,
    },
    {
      accessorKey: 'horario',
      header: () => (
        <ExcelColumnFilter label="Turno" options={horariosUnicos} selectedValues={horarioFilter}
          onSelectionChange={setHorarioFilter} filterId="m-horario" openFilterId={openFilterId} onOpenChange={setOpenFilterId} />
      ),
      cell: ({ row }) => {
        const h = row.original.horario;
        const mod = row.original.vehiculoModalidad;
        let icon, color, label, tooltip;
        if (h === 'diurno') {
          icon = <Sun size={14} />; color = '#d97706'; label = 'Diurno';
          tooltip = 'Turno diurno (06:00 - 18:00)';
        } else if (h === 'nocturno') {
          icon = <Moon size={14} />; color = '#4f46e5'; label = 'Nocturno';
          tooltip = 'Turno nocturno (18:00 - 06:00)';
        } else if (mod === 'CARGO' || mod === 'A_CARGO') {
          icon = <Clock size={14} />; color = '#0891b2'; label = 'A Cargo';
          tooltip = 'Vehiculo a cargo del conductor (sin turno fijo)';
        } else {
          icon = <Clock size={14} />; color = '#6b7280'; label = '-';
          tooltip = 'Sin horario asignado';
        }
        return (
          <span title={tooltip} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600, color, cursor: 'default' }}>
            {icon} {label}
          </span>
        );
      },
      enableSorting: false,
    },
    {
      id: 'checklist',
      header: () => (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
          <span>Checklist</span>
          <div style={{ display: 'flex', gap: '6px', fontSize: '9px', color: 'var(--text-tertiary)', fontWeight: 400 }}>
            <span title="Carga de GNC" style={{ display: 'flex', alignItems: 'center', gap: '1px' }}><Flame size={10} />GNC</span>
            <span title="Lavado del vehiculo" style={{ display: 'flex', alignItems: 'center', gap: '1px' }}><SprayCan size={10} />Lav</span>
            <span title="Carga de Nafta" style={{ display: 'flex', alignItems: 'center', gap: '1px' }}><Fuel size={10} />Naf</span>
          </div>
        </div>
      ),
      cell: ({ row }) => {
        const m = row.original;
        return (
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button
              title={m.gncCargado ? 'GNC: Cargado - Click para desmarcar' : 'GNC: No cargado - Click para marcar como cargado'}
              onClick={() => onUpdateChecklist(m.id, { gnc_cargado: !m.gncCargado })}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
                color: m.gncCargado ? '#16a34a' : 'var(--text-tertiary)',
                opacity: m.gncCargado ? 1 : 0.4,
              }}
            >
              <Flame size={15} />
            </button>
            <button
              title={m.lavadoRealizado ? 'Lavado: Realizado - Click para desmarcar' : 'Lavado: No realizado - Click para marcar como realizado'}
              onClick={() => onUpdateChecklist(m.id, { lavado_realizado: !m.lavadoRealizado })}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
                color: m.lavadoRealizado ? '#2563eb' : 'var(--text-tertiary)',
                opacity: m.lavadoRealizado ? 1 : 0.4,
              }}
            >
              <SprayCan size={15} />
            </button>
            <button
              title={m.naftaCargada ? 'Nafta: Cargada - Click para desmarcar' : 'Nafta: No cargada - Click para marcar como cargada'}
              onClick={() => onUpdateChecklist(m.id, { nafta_cargada: !m.naftaCargada })}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
                color: m.naftaCargada ? '#d97706' : 'var(--text-tertiary)',
                opacity: m.naftaCargada ? 1 : 0.4,
              }}
            >
              <Fuel size={15} />
            </button>
          </div>
        );
      },
      enableSorting: false,
    },
  ], [conductoresUnicos, conductorFilter, patentesUnicas, patenteFilter, fechasUnicas, fechaFilter,
      estadosUnicos, estadoFilter, horariosUnicos, horarioFilter, turnosUnicos, turnoFilter, openFilterId, onUpdateChecklist]);

  // Exportar
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showExportMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setShowExportMenu(false);
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [showExportMenu]);

  function getExportData() {
    return marcacionesFiltradas.map(m => ({
      'Conductor': m.conductor,
      'Patente': m.patente,
      'iButton': m.ibutton || '',
      'Fecha Turno': formatFecha(m.fecha),
      'Entrada': resolverFechaHora(m.periodoInicio, m.fecha, m.entrada, m.horario),
      'Salida': m.estado === 'En Curso'
        ? (() => { const s = resolverFechaHora(m.periodoFin, m.fecha, m.salida, m.horario); return s !== '-' ? `${s} (en curso)` : 'En curso'; })()
        : resolverFechaHora(m.periodoFin, m.fecha, m.salida, m.horario),
      'Duración': formatDuracion(m.duracionMinutos),
      'Km Total': m.kmTotal,
      'Modalidad': m.vehiculoModalidad === 'CARGO' ? 'A Cargo' : m.vehiculoModalidad === 'TURNO' ? 'Turno' : '-',
      'Estado': m.estado,
      'Turno': getHorarioLabel(m.horario, m.vehiculoModalidad),
      'GNC': m.gncCargado ? 'Sí' : 'No',
      'Lavado': m.lavadoRealizado ? 'Sí' : 'No',
      'Nafta': m.naftaCargada ? 'Sí' : 'No',
    }));
  }

  function exportarExcel() {
    const data = getExportData();
    if (data.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [
      { wch: 35 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 8 },
      { wch: 10 }, { wch: 10 }, { wch: 16 }, { wch: 10 },
      { wch: 6 }, { wch: 6 }, { wch: 6 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Marcaciones');
    XLSX.writeFile(wb, `Marcaciones_${new Date().toISOString().slice(0, 10)}.xlsx`);
    setShowExportMenu(false);
  }

  function exportarCSV() {
    const data = getExportData();
    if (data.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(data);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Marcaciones_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  }

  // Stats calculados desde datos filtrados
  const filteredStats = useMemo(() => {
    if (marcacionesFiltradas.length === 0) return null;
    const conductores = new Set(marcacionesFiltradas.map(m => m.conductor)).size;
    const kmTotal = marcacionesFiltradas.reduce((sum, m) => sum + m.kmTotal, 0);
    const activos = marcacionesFiltradas.filter(m => m.estado !== 'Sin Actividad').length;
    return { conductores, kmTotal: Math.round(kmTotal * 100) / 100, activos };
  }, [marcacionesFiltradas]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Stats from filtered data */}
      {filteredStats && (
        <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
          <span><strong>{filteredStats.conductores}</strong> conductores</span>
          <span><strong>{filteredStats.kmTotal.toLocaleString('es-AR')}</strong> km</span>
          <span><strong>{filteredStats.activos}</strong> activos</span>
        </div>
      )}

      {/* Toolbar */}
      <div className="dt-header-bar">
        <div className="dt-search-wrapper">
          <Search size={18} className="dt-search-icon" />
          <input type="text" placeholder="Buscar por conductor o patente..." value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)} className="dt-search-input" />
        </div>
        {headerControls}

        {hasActiveFilters && (
          <button onClick={clearAllFilters}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '6px 10px', fontSize: '13px', fontWeight: 500,
              border: '1px solid var(--color-danger)', borderRadius: '6px',
              background: 'var(--bg-primary)', color: 'var(--color-danger)',
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
            <X size={14} /> Quitar filtros
          </button>
        )}

        {/* Exportar dropdown */}
        <div ref={exportRef} style={{ position: 'relative' }}>
          <button onClick={() => setShowExportMenu(!showExportMenu)} disabled={marcacionesFiltradas.length === 0}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '6px 10px', fontSize: '13px', fontWeight: 500,
              border: '1px solid var(--border-color)', borderRadius: '6px',
              background: 'var(--bg-primary)', color: 'var(--text-secondary)',
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
            <Download size={14} /> Exportar <ChevronDown size={12} />
          </button>
          {showExportMenu && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, marginTop: '4px',
              background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
              borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              zIndex: 50, minWidth: '140px', overflow: 'hidden',
            }}>
              {[
                { fn: exportarExcel, label: 'Excel (.xlsx)' },
                { fn: exportarCSV, label: 'CSV (.csv)' },
              ].map(({ fn, label }) => (
                <button key={label} onClick={fn} style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 12px', fontSize: '13px', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-primary)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <span style={{ color: 'var(--text-secondary)', fontSize: '13px', whiteSpace: 'nowrap' }}>
          {marcacionesFiltradas.length} registros
        </span>
      </div>

      {/* DataTable */}
      <div className="marcaciones-sticky">
        <DataTable
          data={marcacionesFiltradas}
          columns={columns}
          loading={isLoading}
          showSearch={false}
          showPagination={false}
          emptyIcon={<ClipboardList size={48} />}
          emptyTitle="Sin marcaciones"
          emptyDescription="No hay marcaciones para mostrar en este rango de fechas"
          pageSize={999}
        />
      </div>
    </div>
  );
}
