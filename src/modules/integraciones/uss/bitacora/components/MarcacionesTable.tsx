// src/modules/integraciones/uss/bitacora/components/MarcacionesTable.tsx
/**
 * Vista de Marcaciones: datos sumarizados de wialon_bitacora
 * 1 fila por conductor por día con Entrada, Salida, Km, Estado, Checklist
 */

import { useMemo, useState, useRef, useEffect } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '../../../../../components/ui/DataTable/DataTable';
import { ExcelColumnFilter, useExcelFilters } from '../../../../../components/ui/DataTable/ExcelColumnFilter';
import { Search, ClipboardList, Download, ChevronDown, Fuel, Droplets, Sun, Moon, Clock, X, AlertTriangle } from 'lucide-react';
import type { Marcacion } from '../hooks/useUSSHistoricoData';
import { normalizePatente } from '../../../../../utils/normalizeDocuments';
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
  // Restar 3 horas para coincidir con hora real Argentina (UTC-3)
  const ar = new Date(d.getTime() - 3 * 60 * 60 * 1000);
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
  const [fechaFilter, setFechaFilter] = useState<string[]>([]);
  const [estadoFilter, setEstadoFilter] = useState<string[]>([]);
  const [horarioFilter, setHorarioFilter] = useState<string[]>([]);
  const [turnoFilter, setTurnoFilter] = useState<string[]>([]);
  // Quick filter por proveedor GPS
  const [gpsFilter, setGpsFilter] = useState<'USS' | 'GEOTAB' | null>(null);
  // Quick filter "Solo conductores que exceden limite km semanal"
  const [excedeFilter, setExcedeFilter] = useState<boolean>(false);
  // Modal de detalle al hacer click en km (cuando filtro exceso esta activo)
  const [detalleConductor, setDetalleConductor] = useState<Marcacion | null>(null);

  // Conteos por proveedor GPS (sobre el universo cargado, no afectado por otros filtros)
  const gpsCounts = useMemo(() => {
    let uss = 0, geotab = 0;
    for (const m of marcaciones) {
      if (m.gpsOrigen === 'GEOTAB') geotab++;
      else uss++;
    }
    return { uss, geotab };
  }, [marcaciones]);

  // Conteo de CONDUCTORES UNICOS que exceden el limite semanal (no de marcaciones)
  const excedeCount = useMemo(() => {
    const set = new Set<string>();
    for (const m of marcaciones) {
      if (m.excedeLimite) {
        const key = m.conductorId || m.conductor || '';
        if (key) set.add(key);
      }
    }
    return set.size;
  }, [marcaciones]);

  // Listas únicas
  const conductorPatenteUnicos = useMemo(() => {
    const set = new Set<string>();
    for (const m of marcaciones) {
      set.add(`${m.conductor} | ${normalizePatente(m.patente)}`);
    }
    return [...set].sort();
  }, [marcaciones]);
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
    if (mod === 'a_cargo') return 'A Cargo';
    return 'Sin turno';
  };
  const horariosUnicos = useMemo(() =>
    [...new Set(marcaciones.map(m => getHorarioLabel(m.horario, m.vehiculoModalidad)))].filter(Boolean).sort()
  , [marcaciones]);
  const turnosUnicos = useMemo(() =>
    [...new Set(marcaciones.map(m => m.vehiculoModalidad || 'Sin asignar'))].filter(Boolean).sort()
  , [marcaciones]);

  const hasActiveFilters = conductorFilter.length > 0 || fechaFilter.length > 0 || estadoFilter.length > 0 || horarioFilter.length > 0 || turnoFilter.length > 0 || gpsFilter !== null || excedeFilter || searchTerm.trim() !== '';

  const clearAllFilters = () => {
    setConductorFilter([]);
    setFechaFilter([]);
    setEstadoFilter([]);
    setHorarioFilter([]);
    setTurnoFilter([]);
    setGpsFilter(null);
    setExcedeFilter(false);
    onSearchChange('');
  };

   // Filtrado local + búsqueda
  const marcacionesFiltradas = useMemo(() => {
    let filtered = marcaciones;

    if (conductorFilter.length > 0) {
      filtered = filtered.filter(m => conductorFilter.includes(`${m.conductor} | ${normalizePatente(m.patente)}`));
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
    if (gpsFilter !== null) {
      filtered = filtered.filter(m => (m.gpsOrigen || 'USS') === gpsFilter);
    }
    if (excedeFilter) {
      // Filtrar solo los que exceden
      filtered = filtered.filter(m => m.excedeLimite === true);
      // Agrupar por conductor y construir 1 fila resumen semanal por cada uno
      const grupos = new Map<string, typeof filtered>();
      for (const m of filtered) {
        const key = m.conductorId || m.conductor || '';
        if (!key) continue;
        if (!grupos.has(key)) grupos.set(key, []);
        grupos.get(key)!.push(m);
      }
      const resumen: typeof filtered = [];
      for (const [, lista] of grupos) {
        const ordenadas = [...lista].sort((a, b) => {
          if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
          return (a.entrada || '').localeCompare(b.entrada || '');
        });
        const primera = ordenadas[0];
        const ultima = ordenadas[ordenadas.length - 1];
        const duracionTotal = ordenadas.reduce((s, m) => s + (m.duracionMinutos || 0), 0);
        const kmTotalSemana = ordenadas.reduce((s, m) => s + (m.kmTotal || 0), 0);
        const detalle = ordenadas.map(m => ({
          fecha: m.fecha,
          entrada: m.entrada,
          salida: m.salida,
          kmTotal: m.kmTotal,
          duracionMinutos: m.duracionMinutos,
          patente: m.patente,
          estado: m.estado,
          gpsOrigen: m.gpsOrigen,
        }));
        // Crear fila resumen basada en la última marcación pero con valores agregados
        resumen.push({
          ...ultima,
          duracionSemanaMinutos: duracionTotal,
          entradaSemana: { fecha: primera.fecha, hora: primera.entrada, periodoInicio: primera.periodoInicio },
          salidaSemana: { fecha: ultima.fecha, hora: ultima.salida, periodoFin: ultima.periodoFin },
          marcacionesDetalle: detalle,
          // sobreescribir kmTotal con el semanal para que la columna kmTotal sea coherente
          kmTotal: Math.round(kmTotalSemana * 100) / 100,
        });
      }
      filtered = resumen;
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const termPatente = normalizePatente(searchTerm).toLowerCase();
      filtered = filtered.filter(m =>
        m.conductor.toLowerCase().includes(term) ||
        normalizePatente(m.patente).toLowerCase().includes(termPatente)
      );
    }

    return filtered;
  }, [marcaciones, conductorFilter, fechaFilter, estadoFilter, horarioFilter, turnoFilter, gpsFilter, excedeFilter, searchTerm]);

  // Columnas
  const columns = useMemo<ColumnDef<Marcacion, unknown>[]>(() => [
    {
      id: 'gps_col',
      header: 'GPS',
      cell: ({ row }) => {
        const origen = row.original.gpsOrigen || 'USS'
        const isGeotab = origen === 'GEOTAB'
        return (
          <span style={{
            fontSize: '10px',
            fontWeight: 600,
            color: '#fff',
            background: isGeotab ? '#3b82f6' : '#10b981',
            padding: '2px 8px',
            borderRadius: '3px',
            whiteSpace: 'nowrap',
            letterSpacing: '0.5px'
          }}>
            {origen}
          </span>
        )
      },
      enableSorting: false,
      size: 70,
    },
    {
      id: 'patente_col',
      accessorFn: (row) => row.patenteNormalizada || row.patente.replace(/\s/g, ''),
      header: 'Patente',
      cell: ({ row }) => (
        <span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--color-primary)', fontWeight: 600, background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: '3px', whiteSpace: 'nowrap' }}>
          {row.original.patenteNormalizada || row.original.patente.replace(/\s/g, '')}
        </span>
      ),
      enableSorting: true,
    },
    {
      id: 'conductor_col',
      accessorKey: 'conductor',
      header: () => (
        <ExcelColumnFilter label="Conductor" options={conductorPatenteUnicos} selectedValues={conductorFilter}
          onSelectionChange={setConductorFilter} filterId="m-conductor" openFilterId={openFilterId} onOpenChange={setOpenFilterId} />
      ),
      cell: ({ row }) => {
        const m = row.original;
        const tooltipExcede = m.excedeLimite
          ? `EXCEDE LIMITE SEMANAL — Acumulado: ${(m.kmSemanaConductor || 0).toLocaleString('es-AR')} km / Limite: ${(m.limiteSemanal || 0).toLocaleString('es-AR')} km (${m.vehiculoModalidad === 'a_cargo' ? 'a cargo' : 'turno'})`
          : '';
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', lineHeight: 1.3 }}>
            <span style={{ fontWeight: 600, fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              {m.excedeLimite && (
                <span title={tooltipExcede} style={{ color: '#dc2626', display: 'inline-flex' }}>
                  <AlertTriangle size={13} />
                </span>
              )}
              {m.conductor}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {m.conductorDni && (
                <span style={{ color: 'var(--text-secondary)', fontSize: '10px' }}>{m.conductorDni}</span>
              )}
              {m.ibutton && (
                <span style={{ color: 'var(--text-tertiary)', fontSize: '10px', whiteSpace: 'nowrap' }}>#{m.ibutton}</span>
              )}
              {m.excedeLimite && (
                <span title={tooltipExcede} style={{ color: '#dc2626', fontSize: '10px', fontWeight: 600 }}>
                  {(m.kmSemanaConductor || 0).toLocaleString('es-AR')} / {(m.limiteSemanal || 0).toLocaleString('es-AR')} km sem
                </span>
              )}
            </div>
          </div>
        );
      },
      enableSorting: false,
    },

    {
      accessorKey: 'entrada',
      header: 'Entrada',
      cell: ({ row }) => {
        const m = row.original;
        // En modo exceso, usar la entrada de la SEMANA (primer trip de la semana del conductor)
        const fechaUsar = excedeFilter && m.entradaSemana ? m.entradaSemana.fecha : m.fecha;
        const horaUsar = excedeFilter && m.entradaSemana ? m.entradaSemana.hora : m.entrada;
        const periodoUsar = excedeFilter && m.entradaSemana ? m.entradaSemana.periodoInicio : m.periodoInicio;
        const texto = resolverFechaHora(periodoUsar, fechaUsar, horaUsar, m.horario);
        if (texto === '-') return <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>-</span>;
        const [fechaPart, horaPart] = texto.split(' ');
        return (
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3, color: '#16a34a' }}>
            <span style={{ fontWeight: 600, fontSize: '12px' }}>{fechaPart}</span>
            <span style={{ fontSize: '11px' }}>{horaPart}</span>
          </div>
        );
      },
      enableSorting: true,
      // Ordenar por timestamp ISO completo (fecha+hora), no solo por la hora
      sortingFn: (a, b) => {
        const av = a.original.periodoInicio || `${a.original.fecha}T${a.original.entrada}`;
        const bv = b.original.periodoInicio || `${b.original.fecha}T${b.original.entrada}`;
        return av.localeCompare(bv);
      },
    },
    {
      accessorKey: 'salida',
      header: 'Salida',
      cell: ({ row }) => {
        const m = row.original;
        // En modo exceso, usar la salida de la SEMANA (último trip de la semana del conductor)
        const fechaUsar = excedeFilter && m.salidaSemana ? m.salidaSemana.fecha : m.fecha;
        const horaUsar = excedeFilter && m.salidaSemana ? m.salidaSemana.hora : m.salida;
        const periodoUsar = excedeFilter && m.salidaSemana ? m.salidaSemana.periodoFin : m.periodoFin;
        if (m.estado === 'En Curso' && !excedeFilter) {
          const texto = resolverFechaHora(periodoUsar, fechaUsar, horaUsar, m.horario);
          if (texto !== '-') {
            const [fechaPart, horaPart] = texto.split(' ');
            return (
              <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3, color: '#2563eb' }}>
                <span style={{ fontWeight: 600, fontSize: '12px' }}>{fechaPart}</span>
                <span style={{ fontSize: '11px' }}>{horaPart} <i>(en curso)</i></span>
              </div>
            );
          }
          return <span style={{ fontSize: '12px', fontWeight: 600, fontStyle: 'italic', color: '#2563eb' }}>En curso</span>;
        }
        const texto = resolverFechaHora(periodoUsar, fechaUsar, horaUsar, m.horario);
        if (texto === '-') return <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>-</span>;
        const [fechaPart, horaPart] = texto.split(' ');
        return (
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3, color: '#dc2626' }}>
            <span style={{ fontWeight: 600, fontSize: '12px' }}>{fechaPart}</span>
            <span style={{ fontSize: '11px' }}>{horaPart}</span>
          </div>
        );
      },
      enableSorting: true,
      sortingFn: (a, b) => {
        const av = a.original.periodoFin || `${a.original.fecha}T${a.original.salida}`;
        const bv = b.original.periodoFin || `${b.original.fecha}T${b.original.salida}`;
        return av.localeCompare(bv);
      },
    },
    {
      accessorKey: 'duracionMinutos',
      header: 'Duración',
      cell: ({ row }) => {
        const m = row.original;
        // En modo exceso, mostrar la duracion ACUMULADA semanal
        if (excedeFilter && m.duracionSemanaMinutos != null) {
          return (
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
              <span style={{ fontWeight: 700, fontSize: '12px', color: 'var(--text-primary)' }}>
                {formatDuracion(m.duracionSemanaMinutos)}
              </span>
              <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: 500 }}>semana</span>
            </div>
          );
        }
        return (
          <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
            {formatDuracion(m.duracionMinutos)}
          </span>
        );
      },
      enableSorting: true,
    },
    {
      accessorKey: 'kmTotal',
      header: 'Km',
      cell: ({ row }) => {
        const m = row.original;
        // Si el filtro de exceso esta activo, mostrar el TOTAL SEMANAL clickable -> abre modal con detalle
        if (excedeFilter && m.kmSemanaConductor != null) {
          return (
            <button
              type="button"
              onClick={() => setDetalleConductor(m)}
              title="Ver detalle de marcaciones de la semana"
              style={{
                display: 'flex', flexDirection: 'column', lineHeight: 1.2,
                background: 'transparent', border: '1px solid transparent',
                borderRadius: '6px', padding: '4px 8px', cursor: 'pointer',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(220, 38, 38, 0.06)'; e.currentTarget.style.border = '1px solid rgba(220, 38, 38, 0.2)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.border = '1px solid transparent' }}
            >
              <span style={{ fontWeight: 700, fontSize: '13px', color: m.excedeLimite ? '#dc2626' : 'var(--text-primary)' }}>
                {m.kmSemanaConductor.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: 500 }}>
                semana · ver detalle
              </span>
            </button>
          );
        }
        return (
          <span style={{ fontWeight: 600 }}>
            {m.kmTotal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        );
      },
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
        if (!mod) return <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>-</span>;
        const color = mod === 'turno' ? '#7c3aed' : '#0891b2';
        return (
          <span style={{
            fontSize: '11px', fontWeight: 600, padding: '2px 8px',
            borderRadius: '10px', color: '#fff', background: color,
          }}>
            {mod === 'a_cargo' ? 'A Cargo' : 'Turno'}
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
        let icon, color, label;
        if (h === 'diurno') {
          icon = <Sun size={14} />; color = '#d97706'; label = 'Diurno';
        } else if (h === 'nocturno') {
          icon = <Moon size={14} />; color = '#4f46e5'; label = 'Nocturno';
        } else if (mod === 'a_cargo') {
          icon = <Clock size={14} />; color = '#0891b2'; label = 'A Cargo';
        } else {
          icon = <Clock size={14} />; color = '#6b7280'; label = '-';
        }
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600, color }}>
            {icon} {label}
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
      cell: ({ row }) => (
        <span style={{
          fontSize: '11px', fontWeight: 600, padding: '2px 8px',
          borderRadius: '10px', color: '#fff',
          background: getEstadoColor(row.original.estado),
        }}>
          {row.original.estado === 'Turno Finalizado' ? 'Finalizado' : row.original.estado}
        </span>
      ),
      enableSorting: false,
    },
    {
      id: 'checklist',
      header: 'Checklist',
      cell: ({ row }) => {
        const m = row.original;
        return (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              title="GNC cargado"
              onClick={() => onUpdateChecklist(m.id, { gnc_cargado: !m.gncCargado })}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px',
                background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
                color: m.gncCargado ? '#16a34a' : 'var(--text-tertiary)',
                opacity: m.gncCargado ? 1 : 0.4,
              }}
            >
              <Fuel size={14} />
              <span style={{ fontSize: '9px', fontWeight: 600, lineHeight: 1 }}>GNC</span>
            </button>
            <button
              title="Lavado realizado"
              onClick={() => onUpdateChecklist(m.id, { lavado_realizado: !m.lavadoRealizado })}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px',
                background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
                color: m.lavadoRealizado ? '#2563eb' : 'var(--text-tertiary)',
                opacity: m.lavadoRealizado ? 1 : 0.4,
              }}
            >
              <Droplets size={14} />
              <span style={{ fontSize: '9px', fontWeight: 600, lineHeight: 1 }}>Lav</span>
            </button>
            <button
              title="Nafta cargada"
              onClick={() => onUpdateChecklist(m.id, { nafta_cargada: !m.naftaCargada })}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px',
                background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
                color: m.naftaCargada ? '#d97706' : 'var(--text-tertiary)',
                opacity: m.naftaCargada ? 1 : 0.4,
              }}
            >
              <Fuel size={14} />
              <span style={{ fontSize: '9px', fontWeight: 600, lineHeight: 1 }}>Nafta</span>
            </button>
          </div>
        );
      },
      enableSorting: false,
    },
  ], [conductorPatenteUnicos, conductorFilter, fechasUnicas, fechaFilter,
      estadosUnicos, estadoFilter, horariosUnicos, horarioFilter, turnosUnicos, turnoFilter, openFilterId, onUpdateChecklist, excedeFilter]);

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
      'Turno': m.vehiculoModalidad === 'a_cargo' ? 'A Cargo' : m.vehiculoModalidad === 'turno' ? 'Turno' : '-',
      'Estado': m.estado,
      'Horario': getHorarioLabel(m.horario, m.vehiculoModalidad),
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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

      {/* Quick filters por proveedor GPS */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', padding: '0 0 12px 0', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px', marginRight: '4px' }}>
          GPS:
        </span>
        {[
          { key: null as null | 'USS' | 'GEOTAB', label: 'Todos', color: 'var(--color-primary)', count: marcaciones.length },
          { key: 'USS' as const, label: 'USS', color: '#10b981', count: gpsCounts.uss },
          { key: 'GEOTAB' as const, label: 'Geotab', color: '#3b82f6', count: gpsCounts.geotab },
        ].map(opt => {
          const active = gpsFilter === opt.key
          if (opt.key !== null && opt.count === 0) return null
          return (
            <button
              key={opt.label}
              onClick={() => setGpsFilter(opt.key)}
              style={{
                padding: '6px 12px',
                borderRadius: '999px',
                fontSize: '12px',
                fontWeight: 600,
                border: `1px solid ${active ? opt.color : 'var(--border-primary)'}`,
                background: active ? opt.color : 'transparent',
                color: active ? '#fff' : 'var(--text-secondary)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              {!active && opt.key !== null && (
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: opt.color, display: 'inline-block' }} />
              )}
              {opt.label}
              <span style={{ opacity: 0.85, fontWeight: 500 }}>({opt.count})</span>
            </button>
          )
        })}

        {/* Separador y chip de exceso de km semanal (siempre visible si hay marcaciones) */}
        {marcaciones.length > 0 && (
          <>
            <span style={{ width: '1px', height: '20px', background: 'var(--border-primary)', margin: '0 4px' }} />
            <button
              onClick={() => {
                setExcedeFilter(!excedeFilter)
              }}
              disabled={excedeCount === 0}
              title={excedeCount > 0
                ? "Filtrar conductores que superaron el limite de km semanal (turno: 1.800 / a cargo: 3.600) en la semana del rango de fecha visible."
                : "Sin conductores excedidos en la semana visible (lunes 00:00 a domingo 23:59 ART)"}
              style={{
                padding: '6px 12px',
                borderRadius: '999px',
                fontSize: '12px',
                fontWeight: 600,
                border: `1px solid ${excedeCount > 0 ? '#dc2626' : 'var(--border-primary)'}`,
                background: excedeFilter ? '#dc2626' : (excedeCount > 0 ? 'rgba(220, 38, 38, 0.08)' : 'transparent'),
                color: excedeFilter ? '#fff' : (excedeCount > 0 ? '#dc2626' : 'var(--text-tertiary)'),
                cursor: excedeCount === 0 ? 'default' : 'pointer',
                whiteSpace: 'nowrap',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                opacity: excedeCount === 0 ? 0.6 : 1,
              }}
            >
              <AlertTriangle size={13} />
              Exceden km semanal
              <span style={{ opacity: 0.9, fontWeight: 500 }}>({excedeCount})</span>
            </button>
          </>
        )}
      </div>

      {/* DataTable */}
      <DataTable
        data={marcacionesFiltradas}
        columns={columns}
        loading={isLoading}
        showSearch={false}
        emptyIcon={<ClipboardList size={48}
      />}
        emptyTitle="Sin marcaciones"
        emptyDescription="No hay marcaciones para mostrar en este rango de fechas"
        pageSize={50}
        pageSizeOptions={[25, 50, 100]}
        getRowStyle={(m) => m.excedeLimite ? { background: 'rgba(220, 38, 38, 0.06)', boxShadow: 'inset 3px 0 0 #dc2626' } : undefined}
      />

      {/* Panel lateral con detalle de marcaciones del conductor (modo exceso) */}
      {detalleConductor && (
        <>
          <div
            onClick={() => setDetalleConductor(null)}
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', zIndex: 999 }}
          />
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0,
            width: '560px', maxWidth: '95vw',
            background: 'var(--bg-primary, #fff)',
            zIndex: 1000,
            boxShadow: '-4px 0 20px rgba(0,0,0,0.15)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-primary, #e5e7eb)',
              background: 'var(--bg-secondary, #f9fafb)',
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <AlertTriangle size={14} color="#dc2626" />
                  {detalleConductor.conductor}
                </span>
                <span style={{ fontSize: '12px', color: '#dc2626', fontWeight: 600 }}>
                  {(detalleConductor.kmSemanaConductor || 0).toLocaleString('es-AR')} / {(detalleConductor.limiteSemanal || 0).toLocaleString('es-AR')} km · {detalleConductor.vehiculoModalidad === 'a_cargo' ? 'a cargo' : 'turno'}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  Duración acumulada: {formatDuracion(detalleConductor.duracionSemanaMinutos || 0)} · {detalleConductor.marcacionesDetalle?.length || 0} marcaciones
                </span>
              </div>
              <button
                onClick={() => setDetalleConductor(null)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: '32px', height: '32px',
                  border: '1px solid var(--border-primary, #e5e7eb)',
                  borderRadius: '8px', background: 'var(--bg-primary, #fff)',
                  color: 'var(--text-secondary)', cursor: 'pointer',
                }}
                title="Cerrar"
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
              {(detalleConductor.marcacionesDetalle || []).map((d, idx) => (
                <div key={idx} style={{
                  display: 'grid',
                  gridTemplateColumns: '70px 1fr 1fr 80px 80px',
                  gap: '8px',
                  padding: '10px 0',
                  borderBottom: '1px solid var(--border-primary, #e5e7eb)',
                  alignItems: 'center',
                  fontSize: '12px',
                }}>
                  <span style={{
                    fontSize: '9px', fontWeight: 600, color: '#fff',
                    background: d.gpsOrigen === 'GEOTAB' ? '#3b82f6' : '#10b981',
                    padding: '2px 6px', borderRadius: '3px', textAlign: 'center',
                  }}>{d.gpsOrigen}</span>
                  <div>
                    <div style={{ fontWeight: 600 }}>{formatFecha(d.fecha)}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{d.patente}</div>
                  </div>
                  <div>
                    <div style={{ color: '#16a34a', fontFamily: 'monospace' }}>{d.entrada}</div>
                    <div style={{ color: '#dc2626', fontFamily: 'monospace' }}>{d.salida}</div>
                  </div>
                  <span style={{ color: 'var(--text-secondary)', textAlign: 'right' }}>{formatDuracion(d.duracionMinutos)}</span>
                  <span style={{ fontWeight: 700, textAlign: 'right' }}>{d.kmTotal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
