// src/components/ui/DataTable/DataTable.tsx
/**
 * @fileoverview Componente DataTable reutilizable basado en TanStack Table v8.
 * Proporciona búsqueda global, ordenamiento, paginación, diseño responsive
 * con filas expandibles, columna de acciones sticky y filtros automáticos por columna.
 */

import React, { useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type Table,
  type FilterFn,
} from "@tanstack/react-table";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";

// Icono de filtro estilo Excel - dropdown arrow pequeño y sutil
const FilterIcon = ({ size = 8 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 8 6"
    fill="currentColor"
  >
    <path d="M0.5 0.5L4 5L7.5 0.5H0.5Z" />
  </svg>
);
import { Spinner } from "../LoadingOverlay";
import "./DataTable.css";
import "../DateRangeSelector/DateRangeSelector.css";

// Tipo para filtros de columna
type ColumnFilters = Record<string, string[]>;
type DateFilters = Record<string, { from?: string; to?: string }>;

// Calendar helper functions
const DAYS_SHORT = ['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'];
const MONTH_NAMES_SHORT = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                           'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const toISODate = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

const getMondayOf = (y: number, m: number, d: number) => {
  const date = new Date(y, m, d);
  const dow = date.getDay();
  const diff = dow === 0 ? 6 : dow - 1;
  const mon = new Date(y, m, d - diff);
  return { y: mon.getFullYear(), m: mon.getMonth(), d: mon.getDate() };
};

const getSundayOf = (y: number, m: number, d: number) => {
  const mon = getMondayOf(y, m, d);
  const sun = new Date(mon.y, mon.m, mon.d + 6);
  return { y: sun.getFullYear(), m: sun.getMonth(), d: sun.getDate() };
};

const getWeekNum = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m, d));
  const dayNum = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  return Math.ceil((((dt.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};

// Filter Header Component - extracted to avoid hooks in callbacks
interface FilterHeaderProps {
  colId: string;
  label: string;
  isOpen: boolean;
  hasFilter: boolean;
  isDate: boolean;
  uniqueValues: string[];
  selectedValues: string[];
  dateFilter: { from?: string; to?: string } | undefined;
  onToggle: (colId: string) => void;
  onSelectValue: (colId: string, value: string) => void;
  onDateChange: (colId: string, field: 'from' | 'to', value: string) => void;
  onClearFilter: (colId: string) => void;
}

function FilterHeader({
  colId,
  label,
  isOpen,
  hasFilter,
  isDate,
  uniqueValues,
  selectedValues,
  dateFilter,
  onToggle,
  onSelectValue,
  onDateChange,
  onClearFilter,
}: FilterHeaderProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [searchTerm, setSearchTerm] = useState('');

  // Calendar state for date filters (local to this component)
  const [viewDate, setViewDate] = useState(() => new Date());
  const [selectionMode, setSelectionMode] = useState<'day' | 'week'>('day');

  // Track previous isOpen to detect open transitions
  const prevIsOpenRef = useRef(isOpen);
  useEffect(() => {
    // Only reset calendar view when transitioning from closed to open
    if (isOpen && !prevIsOpenRef.current && isDate) {
      if (dateFilter?.from) {
        const [y, m] = dateFilter.from.split('-').map(Number);
        setViewDate(new Date(y, m - 1, 1));
      } else {
        setViewDate(new Date());
      }
    }
    prevIsOpenRef.current = isOpen;
  });

  const filteredOptions = searchTerm
    ? uniqueValues.filter(opt => opt.toLowerCase().includes(searchTerm.toLowerCase()))
    : uniqueValues;

  // Calendar days computation
  const calendarDays = useMemo(() => {
    if (!isDate) return [];
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days: Array<{ y: number; m: number; d: number; cur: boolean; ts: number }> = [];

    const startDow = firstDay.getDay();
    const prevDays = startDow === 0 ? 6 : startDow - 1;
    for (let i = prevDays; i > 0; i--) {
      const dt = new Date(year, month, 1 - i);
      days.push({ y: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate(), cur: false, ts: dt.getTime() });
    }
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push({ y: year, m: month, d: i, cur: true, ts: new Date(year, month, i).getTime() });
    }
    const rem = 7 - (days.length % 7);
    if (rem < 7) {
      for (let i = 1; i <= rem; i++) {
        const dt = new Date(year, month + 1, i);
        days.push({ y: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate(), cur: false, ts: dt.getTime() });
      }
    }
    return days;
  }, [isDate, viewDate]);

  const todayTs = useMemo(() => {
    const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
  }, []);

  // Parse current filter range
  const filterRange = useMemo(() => {
    if (!dateFilter?.from && !dateFilter?.to) return null;
    const from = dateFilter.from ? new Date(dateFilter.from + 'T00:00:00').getTime() : -Infinity;
    const to = dateFilter.to ? new Date(dateFilter.to + 'T00:00:00').getTime() : Infinity;
    return { from, to };
  }, [dateFilter]);

  // Handle day click in calendar
  const handleCalendarDayClick = useCallback((day: { y: number; m: number; d: number }, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (selectionMode === 'day') {
      const iso = toISODate(day.y, day.m, day.d);
      if (!dateFilter?.from || !dateFilter?.to || dateFilter.from !== dateFilter.to) {
        // No selection or a range is set: start fresh single-day selection
        onDateChange(colId, 'from', iso);
        onDateChange(colId, 'to', iso);
      } else {
        // A single day is selected (from === to): extend to a range
        const fromTs = new Date(dateFilter.from + 'T00:00:00').getTime();
        const clickTs = new Date(iso + 'T00:00:00').getTime();
        if (clickTs === fromTs) {
          return; // Clicked same day again
        } else if (clickTs > fromTs) {
          onDateChange(colId, 'to', iso);
        } else {
          onDateChange(colId, 'from', iso);
          onDateChange(colId, 'to', dateFilter.from);
        }
      }
    } else {
      // Week mode
      const mon = getMondayOf(day.y, day.m, day.d);
      const sun = getSundayOf(day.y, day.m, day.d);
      onDateChange(colId, 'from', toISODate(mon.y, mon.m, mon.d));
      onDateChange(colId, 'to', toISODate(sun.y, sun.m, sun.d));
    }
  }, [selectionMode, dateFilter, colId, onDateChange]);

  // Shortcuts
  const dateShortcuts = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
    const mon = getMondayOf(y, m, d);
    const sun = getSundayOf(y, m, d);
    const wn = getWeekNum(mon.y, mon.m, mon.d);
    const prevMon = getMondayOf(mon.y, mon.m, mon.d - 7);
    const prevSun = getSundayOf(prevMon.y, prevMon.m, prevMon.d);
    const pwn = getWeekNum(prevMon.y, prevMon.m, prevMon.d);
    const yesterday = new Date(y, m, d - 1);

    return [
      { id: 'today', label: 'Hoy', from: toISODate(y, m, d), to: toISODate(y, m, d) },
      { id: 'yesterday', label: 'Ayer', from: toISODate(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate()), to: toISODate(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate()) },
      { id: 'this-week', label: `Esta semana (S${wn})`, from: toISODate(mon.y, mon.m, mon.d), to: toISODate(sun.y, sun.m, sun.d) },
      { id: 'last-week', label: `Semana pasada (S${pwn})`, from: toISODate(prevMon.y, prevMon.m, prevMon.d), to: toISODate(prevSun.y, prevSun.m, prevSun.d) },
      { id: 'this-year', label: `Este año (${y})`, from: toISODate(y, 0, 1), to: toISODate(y, 11, 31) },
    ];
  }, []);

  // Calculate position when opening
  useLayoutEffect(() => {
    if (!isOpen || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const dropdownWidth = dropdownRef.current?.getBoundingClientRect().width || 220;
    const viewportWidth = window.innerWidth;
    let left = rect.left;
    let top = rect.bottom + 4;

    // Adjust if goes off right edge of viewport
    if (left + dropdownWidth > viewportWidth - 8) {
      left = Math.max(8, viewportWidth - dropdownWidth - 8);
    }
    if (left < 8) left = 8;
    if (top + 300 > window.innerHeight) {
      top = rect.top - 304;
    }
    setPosition({ top, left });
  }, [isOpen]);

  // Re-adjust after render if dropdown overflows viewport
  useLayoutEffect(() => {
    if (!isOpen || !dropdownRef.current) return;
    const dropdownRect = dropdownRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    if (dropdownRect.right > viewportWidth - 8) {
      setPosition(prev => ({
        ...prev,
        left: Math.max(8, viewportWidth - dropdownRect.width - 8)
      }));
    }
  }, [isOpen]);

  // Clear search when closing
  useEffect(() => {
    if (!isOpen) setSearchTerm('');
  }, [isOpen]);

  // Close on outside click + reposition on scroll/resize
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        dropdownRef.current && !dropdownRef.current.contains(target) &&
        buttonRef.current && !buttonRef.current.contains(target)
      ) {
        onToggle(colId);
      }
    };
    const handleReposition = () => {
      if (!buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      const dropdownWidth = dropdownRef.current?.getBoundingClientRect().width || 220;
      const viewportWidth = window.innerWidth;
      let left = rect.left;
      let top = rect.bottom + 4;
      if (left + dropdownWidth > viewportWidth - 8) {
        left = Math.max(8, viewportWidth - dropdownWidth - 8);
      }
      if (left < 8) left = 8;
      if (top + 300 > window.innerHeight) {
        top = rect.top - 304;
      }
      setPosition({ top, left });
    };
    document.addEventListener('mousedown', handleClick);
    window.addEventListener('scroll', handleReposition, { capture: true, passive: true });
    window.addEventListener('resize', handleReposition, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleClick);
      window.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('resize', handleReposition);
    };
  }, [isOpen, colId, onToggle]);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle(colId);
  };

  return (
    <div className="dt-filter-header">
      <span className="dt-filter-label">{label}</span>
      <button
        ref={buttonRef}
        type="button"
        className={`dt-filter-btn ${hasFilter ? 'active' : ''}`}
        onClick={handleToggle}
        title={`Filtrar por ${label}`}
      >
        {isDate ? <Calendar size={12} /> : <FilterIcon size={12} />}
      </button>
      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          className={`dt-filter-dropdown ${isDate ? 'dt-filter-dropdown-calendar' : ''}`}
          style={{ position: 'fixed', top: position.top, left: position.left }}
          onClick={e => e.stopPropagation()}
        >
          {isDate ? (
            <div className="dt-filter-calendar">
              {/* Tabs Día/Semana */}
              <div className="date-range-tabs">
                <button type="button" className={`date-range-tab ${selectionMode === 'day' ? 'active' : ''}`} onClick={() => setSelectionMode('day')}>Día</button>
                <button type="button" className={`date-range-tab ${selectionMode === 'week' ? 'active' : ''}`} onClick={() => setSelectionMode('week')}>Semana</button>
              </div>
              {/* Month navigation */}
              <div className="date-range-header">
                <button type="button" className="date-range-nav" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}>
                  <ChevronLeft size={16} />
                </button>
                <div className="date-range-month-year">
                  <span className="date-range-month">{MONTH_NAMES_SHORT[viewDate.getMonth()]}</span>
                  <select
                    className="date-range-year-select"
                    value={viewDate.getFullYear()}
                    onChange={e => setViewDate(new Date(parseInt(e.target.value), viewDate.getMonth(), 1))}
                  >
                    {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i).map(yr => (
                      <option key={yr} value={yr}>{yr}</option>
                    ))}
                  </select>
                </div>
                <button type="button" className="date-range-nav" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))}>
                  <ChevronRight size={16} />
                </button>
              </div>
              {/* Day names */}
              <div className="date-range-days-header">
                {DAYS_SHORT.map(d => <div key={d} className="date-range-day-name">{d}</div>)}
              </div>
              {/* Day grid */}
              <div className="date-range-grid">
                {calendarDays.map((day, idx) => {
                  const iso = toISODate(day.y, day.m, day.d);
                  const isToday = day.ts === todayTs;
                  const inRange = filterRange && day.ts >= filterRange.from && day.ts <= filterRange.to;
                  const isStart = dateFilter?.from === iso;
                  const isEnd = dateFilter?.to === iso;
                  const dow = new Date(day.y, day.m, day.d).getDay();
                  const gridPos = dow === 0 ? 6 : dow - 1;
                  const isRowStart = gridPos === 0;
                  const isRowEnd = gridPos === 6;

                  const cls = [
                    'date-range-day',
                    !day.cur && 'other-month',
                    inRange && 'selected',
                    isStart && 'range-start',
                    isEnd && 'range-end',
                    isStart && !dateFilter?.to && 'day-selected',
                    isToday && !inRange && !isStart && 'today',
                    inRange && isRowStart && 'row-start',
                    inRange && isRowEnd && 'row-end',
                  ].filter(Boolean).join(' ');

                  return (
                    <div key={idx} className={cls} onClick={e => handleCalendarDayClick(day, e)} role="button" tabIndex={0}>
                      <span>{day.d}</span>
                    </div>
                  );
                })}
              </div>
              {/* Range display */}
              {(dateFilter?.from || dateFilter?.to) && (
                <div className="dt-filter-range-display">
                  {dateFilter.from && <span>{dateFilter.from.split('-').reverse().join('/')}</span>}
                  {dateFilter.from && dateFilter.to && <span> → </span>}
                  {dateFilter.to && <span>{dateFilter.to.split('-').reverse().join('/')}</span>}
                  {dateFilter.from && !dateFilter.to && <span className="dt-filter-range-hint"> (selecciona fin)</span>}
                </div>
              )}
              {/* Shortcuts */}
              <div className="date-range-shortcuts">
                {dateShortcuts.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    className={`date-range-shortcut ${dateFilter?.from === s.from && dateFilter?.to === s.to ? 'active' : ''}`}
                    onClick={() => { onDateChange(colId, 'from', s.from); onDateChange(colId, 'to', s.to); }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <input
                type="text"
                placeholder="Buscar..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="dt-filter-search"
                autoFocus
              />
              <div className="dt-filter-options">
                {filteredOptions.length === 0 ? (
                  <div className="dt-filter-empty">Sin resultados</div>
                ) : (
                  filteredOptions.slice(0, 50).map(option => (
                    <label key={option} className="dt-filter-option">
                      <input
                        type="checkbox"
                        checked={selectedValues.includes(option)}
                        onChange={() => onSelectValue(colId, option)}
                      />
                      <span>{option}</span>
                    </label>
                  ))
                )}
              </div>
            </>
          )}
          {hasFilter && (
            <button type="button" className="dt-filter-clear" onClick={() => onClearFilter(colId)}>
              Limpiar filtro
            </button>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

export interface DataTableProps<T> {
  /** Array de datos a mostrar en la tabla */
  data: T[];
  /** Definición de columnas según TanStack Table */
  columns: ColumnDef<T, unknown>[];
  /** Placeholder del input de búsqueda @default "Buscar..." */
  searchPlaceholder?: string;
  /** Icono a mostrar cuando no hay datos */
  emptyIcon?: ReactNode;
  /** Título del estado vacío @default "No hay datos" */
  emptyTitle?: string;
  /** Descripción del estado vacío @default "" */
  emptyDescription?: string;
  /** Indica si está cargando datos @default false */
  loading?: boolean;
  /** Mensaje de error a mostrar @default null */
  error?: string | null;
  /** Cantidad de registros por página inicial @default 10 */
  pageSize?: number;
  /** Opciones de tamaño de página disponibles @default [10, 20, 30, 50] */
  pageSizeOptions?: number[];
  /** Muestra/oculta la barra de búsqueda @default true */
  showSearch?: boolean;
  /** Muestra/oculta los controles de paginación @default true */
  showPagination?: boolean;
  /** Callback ejecutado cuando la tabla está inicializada */
  onTableReady?: (table: Table<T>) => void;
  /** Acción a mostrar en el header junto al buscador (ej: botón de crear) */
  headerAction?: ReactNode;
  /** IDs de columnas que siempre deben estar visibles (ej: ['acciones']) */
  alwaysVisibleColumns?: string[];
  /** Key para resetear filtros internos - cuando cambia, se limpian todos los filtros */
  resetFiltersKey?: number | string;
  /** Desactiva los filtros automáticos de columna (para módulos con filtros personalizados) */
  disableAutoFilters?: boolean;
  /** Fija la primera columna a la izquierda durante scroll horizontal */
  stickyFirstColumn?: boolean;
  /** Filtros externos (ej: desde stat cards) para mostrar en la barra de filtros activos */
  externalFilters?: Array<{ id: string; label: string; onClear: () => void }>;
  /** Callback para limpiar todos los filtros (internos y externos) */
  onClearAllFilters?: () => void;
  /** Función de filtrado global personalizada */
  globalFilterFn?: FilterFn<T>;
  /** Valor del filtro global (modo controlado) */
  globalFilter?: string;
  /** Callback al cambiar el filtro global (modo controlado) */
  onGlobalFilterChange?: (value: string) => void;
  /** Habilita paginación del lado del servidor */
  manualPagination?: boolean;
  /** Total de registros en el servidor (requerido si manualPagination=true) */
  rowCount?: number;
  /** Índice de página actual controlado (para paginación servidor) */
  pageIndex?: number;
  /** Callback al cambiar de página o tamaño (para paginación servidor) */
  onPaginationChange?: (pageIndex: number, pageSize: number) => void;
}

export function DataTable<T>({
  data,
  columns,
  searchPlaceholder = "Buscar...",
  emptyIcon,
  emptyTitle = "No hay datos",
  emptyDescription = "",
  loading = false,
  error = null,
  pageSize = 100,
  pageSizeOptions = [10, 20, 50, 100],
  showSearch = true,
  showPagination = true,
  onTableReady,
  headerAction,
  alwaysVisibleColumns = ["acciones", "actions"],
  stickyFirstColumn = false,
  resetFiltersKey,
  disableAutoFilters = false,
  externalFilters = [],
  onClearAllFilters,
  globalFilterFn: customGlobalFilterFn,
  globalFilter: controlledGlobalFilter,
  onGlobalFilterChange: setControlledGlobalFilter,
  manualPagination = false,
  rowCount,
  pageIndex: controlledPageIndex,
  onPaginationChange,
}: DataTableProps<T>) {
  const [internalGlobalFilter, setInternalGlobalFilter] = useState("");
  const isControlled = controlledGlobalFilter !== undefined;
  const globalFilter = isControlled ? controlledGlobalFilter : internalGlobalFilter;
  const setGlobalFilter = isControlled ? (setControlledGlobalFilter || (() => {})) : setInternalGlobalFilter;

  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const tableWrapperRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);

  // Max-height set via CSS (.dt-table-wrapper max-height: calc(100vh - 340px))

  // Detectar mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Column filter state
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({});
  const [dateFilters, setDateFilters] = useState<DateFilters>({});
  const [openFilterId, setOpenFilterId] = useState<string | null>(null);

  // Refs that mirror filter state - used inside header callbacks to avoid
  // triggering useMemo recalculation (which would unmount/remount FilterHeader)
  const columnFiltersRef = useRef(columnFilters);
  columnFiltersRef.current = columnFilters;
  const dateFiltersRef = useRef(dateFilters);
  dateFiltersRef.current = dateFilters;

  // Helper: Check if column is date type based on accessor key or data
  const isDateColumn = useCallback((colId: string): boolean => {
    const lowerColId = colId.toLowerCase();
    // Excluir columnas que son SOLO hora (ej: hora_inicio, hora_cierre),
    // pero NO excluir fecha_hora que es un timestamp completo
    if (lowerColId.includes('hora') && !lowerColId.includes('fecha')) return false;
    const dateKeywords = ['fecha', 'date', 'created', 'updated', 'vencimiento', 'inicio', 'fin', 'cita', 'entrega'];
    return dateKeywords.some(keyword => lowerColId.includes(keyword));
  }, []);

  // Build a map of colId -> accessorFn for columns that use accessorFn
  const accessorFnMap = useMemo(() => {
    const map = new Map<string, (row: T) => unknown>();
    columns.forEach(col => {
      const colDef = col as { accessorKey?: string; id?: string; accessorFn?: (row: T) => unknown };
      const colId = colDef.accessorKey || colDef.id || "";
      if (colId && colDef.accessorFn) {
        map.set(colId, colDef.accessorFn);
      }
    });
    return map;
  }, [columns]);

  // Helper: Get value for filtering - uses accessorFn if available, otherwise nested path
  const getNestedValueForFilter = useCallback((obj: Record<string, unknown>, path: string): unknown => {
    // First check if there's an accessorFn for this column
    const accessorFn = accessorFnMap.get(path);
    if (accessorFn) {
      return accessorFn(obj as T);
    }

    // Fallback to nested path access
    const keys = path.split('.');
    let value: unknown = obj;
    for (const key of keys) {
      if (value && typeof value === 'object' && key in (value as Record<string, unknown>)) {
        value = (value as Record<string, unknown>)[key];
      } else {
        return undefined;
      }
    }
    return value;
  }, [accessorFnMap]);

  // Reset filters when resetFiltersKey changes
  useEffect(() => {
    if (resetFiltersKey !== undefined) {
      setColumnFilters({});
      setDateFilters({});
      setOpenFilterId(null);
    }
  }, [resetFiltersKey]);

  // Get data filtered by all columns EXCEPT the specified one (Excel behavior)
  const getDataFilteredExcluding = useCallback((excludeColId: string): T[] => {
    let result = [...data];

    // Apply column filters except the excluded column - case-insensitive matching
    Object.entries(columnFilters).forEach(([colId, selectedValues]) => {
      if (colId !== excludeColId && selectedValues.length > 0) {
        const normalizedSelected = new Set(selectedValues.map(v => v.toUpperCase().trim().replace(/\s+/g, ' ')));
        result = result.filter((row) => {
          const value = getNestedValueForFilter(row as Record<string, unknown>, colId);
          const strValue = value !== null && value !== undefined
            ? String(value).trim().replace(/\s+/g, ' ').toUpperCase()
            : '';
          return normalizedSelected.has(strValue);
        });
      }
    });

    // Apply date filters except the excluded column
    Object.entries(dateFilters).forEach(([colId, range]) => {
      if (colId !== excludeColId && (range.from || range.to)) {
        result = result.filter((row) => {
          const value = getNestedValueForFilter(row as Record<string, unknown>, colId);
          if (!value) return false;

          const dateStr = String(value);
          let dateValue: Date | null = null;
          if (dateStr.includes('/')) {
            const parts = dateStr.split('/');
            if (parts.length === 3) {
              dateValue = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
            }
          } else {
            dateValue = new Date(dateStr);
          }

          if (!dateValue || isNaN(dateValue.getTime())) return false;

          if (range.from) {
            const fromDate = new Date(range.from);
            if (dateValue < fromDate) return false;
          }
          if (range.to) {
            const toDate = new Date(range.to);
            toDate.setHours(23, 59, 59, 999);
            if (dateValue > toDate) return false;
          }
          return true;
        });
      }
    });

    return result;
  }, [data, columnFilters, dateFilters, getNestedValueForFilter]);

  // Get unique values for a column from data filtered by OTHER columns (Excel behavior)
  const getUniqueValues = useCallback((colId: string): string[] => {
    const filteredByOthers = getDataFilteredExcluding(colId);
    // Map: normalizedKey -> originalValue (keep first occurrence)
    const uniqueMap = new Map<string, string>();
    filteredByOthers.forEach((row) => {
      const value = getNestedValueForFilter(row as Record<string, unknown>, colId);
      if (value !== null && value !== undefined && value !== '') {
        // Normalize: trim, collapse multiple spaces, and use uppercase for comparison
        const trimmedValue = String(value).trim().replace(/\s+/g, ' ');
        const normalizedKey = trimmedValue.toUpperCase();
        // Keep the first occurrence (to preserve original casing)
        if (trimmedValue && !uniqueMap.has(normalizedKey)) {
          uniqueMap.set(normalizedKey, trimmedValue);
        }
      }
    });
    // Return original values sorted
    return Array.from(uniqueMap.values()).sort((a, b) =>
      a.toUpperCase().localeCompare(b.toUpperCase())
    );
  }, [getDataFilteredExcluding, getNestedValueForFilter]);

  // Filter data based on column filters and date filters
  const filteredData = useMemo(() => {
    let result = [...data];

    // Apply column filters (text/select) - case-insensitive matching
    Object.entries(columnFilters).forEach(([colId, selectedValues]) => {
      if (selectedValues.length > 0) {
        // Normalize selected values UNA vez en un Set para O(1) lookup
        const normalizedSelected = new Set(selectedValues.map(v => v.toUpperCase().trim().replace(/\s+/g, ' ')));
        result = result.filter((row) => {
          const value = getNestedValueForFilter(row as Record<string, unknown>, colId);
          const strValue = value !== null && value !== undefined
            ? String(value).trim().replace(/\s+/g, ' ').toUpperCase()
            : '';
          return normalizedSelected.has(strValue);
        });
      }
    });

    // Apply date filters
    Object.entries(dateFilters).forEach(([colId, range]) => {
      if (range.from || range.to) {
        result = result.filter((row) => {
          const value = getNestedValueForFilter(row as Record<string, unknown>, colId);
          if (!value) return false;

          const dateStr = String(value);
          // Try to parse the date - handle multiple formats
          let dateValue: Date | null = null;
          if (dateStr.includes('/')) {
            // Format: DD/MM/YYYY
            const parts = dateStr.split('/');
            if (parts.length === 3) {
              dateValue = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
            }
          } else {
            dateValue = new Date(dateStr);
          }

          if (!dateValue || isNaN(dateValue.getTime())) return false;

          if (range.from) {
            const fromDate = new Date(range.from);
            if (dateValue < fromDate) return false;
          }
          if (range.to) {
            const toDate = new Date(range.to);
            toDate.setHours(23, 59, 59, 999);
            if (dateValue > toDate) return false;
          }
          return true;
        });
      }
    });

    return result;
  }, [data, columnFilters, dateFilters, getNestedValueForFilter]);

  // Close filter on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenFilterId(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Debounce search (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(globalFilter);
    }, 300);
    return () => clearTimeout(timer);
  }, [globalFilter]);

  // Separate columns into regular and actions - memoized to prevent unnecessary re-renders
  const { regularColumns, actionsColumn } = useMemo(() => {
    const regular = columns.filter(col => {
      const colId = (col as { accessorKey?: string; id?: string }).accessorKey ||
                    (col as { id?: string }).id || "";
      return !alwaysVisibleColumns.includes(colId);
    });

    const actions = columns.filter(col => {
      const colId = (col as { accessorKey?: string; id?: string }).accessorKey ||
                    (col as { id?: string }).id || "";
      return alwaysVisibleColumns.includes(colId);
    });

    return { regularColumns: regular, actionsColumn: actions };
  }, [columns, alwaysVisibleColumns]);

  // Filter header callbacks - stable references for FilterHeader component
  const handleFilterToggle = useCallback((colId: string) => {
    setOpenFilterId(prev => prev === colId ? null : colId);
  }, []);

  const handleSelectValue = useCallback((colId: string, value: string) => {
    setColumnFilters(prev => {
      const current = prev[colId] || [];
      if (current.includes(value)) {
        return { ...prev, [colId]: current.filter(v => v !== value) };
      } else {
        return { ...prev, [colId]: [...current, value] };
      }
    });
  }, []);

  const handleDateChange = useCallback((colId: string, field: 'from' | 'to', value: string) => {
    setDateFilters(prev => ({
      ...prev,
      [colId]: { ...prev[colId], [field]: value }
    }));
  }, []);

  const handleClearFilter = useCallback((colId: string) => {
    if (isDateColumn(colId)) {
      setDateFilters(prev => {
        const newFilters = { ...prev };
        delete newFilters[colId];
        return newFilters;
      });
    } else {
      setColumnFilters(prev => {
        const newFilters = { ...prev };
        delete newFilters[colId];
        return newFilters;
      });
    }
  }, [isDateColumn]);

  // Wrap columns with auto-filters (if enabled)
  // IMPORTANT: This memo intentionally uses refs for dateFilters/columnFilters instead of state.
  // This prevents the memo from recalculating when filter values change, which would cause
  // FilterHeader components to unmount/remount and lose their local state (viewDate, selectionMode).
  // The header callbacks read current values from refs at render time.
  const columnsWithFilters = useMemo(() => {
    // If auto-filters are disabled, return columns as-is
    if (disableAutoFilters) {
      return regularColumns;
    }

    return regularColumns.map(col => {
      const colDef = col as { accessorKey?: string; id?: string; header?: unknown; enableSorting?: boolean; accessorFn?: unknown };
      const colId = colDef.accessorKey || colDef.id || "";

      // Skip columns without accessorKey AND without accessorFn (computed columns like 'fraccionado', 'incidencia')
      // Only add auto-filters to columns that have real data to filter on
      if (!colDef.accessorKey && !colDef.accessorFn) return col;

      // Force enableSorting on all data columns
      const sortingOverride = colDef.enableSorting === false ? { enableSorting: true } : {};

      // Skip filter wrapping if header is already a custom function (module has its own filter)
      if (typeof colDef.header === 'function') {
        return { ...col, ...sortingOverride } as ColumnDef<T, unknown>;
      }

      // Get original header label
      let headerLabel = colId.split('.').pop() || colId;
      headerLabel = headerLabel.charAt(0).toUpperCase() + headerLabel.slice(1).replace(/_/g, ' ');
      if (typeof colDef.header === 'string') {
        headerLabel = colDef.header;
      }

      const isDate = isDateColumn(colId);

      return {
        ...col,
        ...sortingOverride,
        header: () => {
          // Read current values from refs (not state) to avoid triggering memo recalculation
          const currentDateFilters = dateFiltersRef.current;
          const currentColumnFilters = columnFiltersRef.current;
          const isOpen = openFilterId === colId;
          const hasFilter = isDate
            ? !!(currentDateFilters[colId]?.from || currentDateFilters[colId]?.to)
            : (currentColumnFilters[colId]?.length || 0) > 0;

          return (
            <FilterHeader
              colId={colId}
              label={headerLabel}
              isOpen={isOpen}
              hasFilter={hasFilter}
              isDate={isDate}
              uniqueValues={isDate ? [] : (isOpen ? getUniqueValues(colId) : [])}
              selectedValues={currentColumnFilters[colId] || []}
              dateFilter={currentDateFilters[colId]}
              onToggle={handleFilterToggle}
              onSelectValue={handleSelectValue}
              onDateChange={handleDateChange}
              onClearFilter={handleClearFilter}
            />
          );
        },
      } as ColumnDef<T, unknown>;
    });
  }, [regularColumns, disableAutoFilters, isDateColumn, openFilterId, getUniqueValues, handleFilterToggle, handleSelectValue, handleDateChange, handleClearFilter]);

  // Memoize final columns — all regular columns with filters + actions
  const finalColumns = useMemo<ColumnDef<T, unknown>[]>(() => {
    return [
      ...columnsWithFilters,
      ...actionsColumn,
    ];
  }, [columnsWithFilters, actionsColumn]);

  // Pre-computar índice de búsqueda: extrae todos los strings de cada fila UNA sola vez
  // cuando cambian los datos, en vez de recorrer recursivamente por cada keystroke
  const searchIndex = useMemo(() => {
    const collectStrings = (obj: unknown, depth = 0): string => {
      if (depth > 3) return ''
      if (obj === null || obj === undefined) return ''
      if (typeof obj === 'string') return obj + ' '
      if (typeof obj === 'number') return String(obj) + ' '
      if (Array.isArray(obj)) return obj.map(item => collectStrings(item, depth + 1)).join(' ')
      if (typeof obj === 'object') {
        return Object.values(obj as Record<string, unknown>)
          .map(val => collectStrings(val, depth + 1))
          .join(' ')
      }
      return ''
    }

    const index = new WeakMap<object, string>()
    for (const row of filteredData) {
      index.set(row as object, collectStrings(row).toLowerCase())
    }
    return index
  }, [filteredData])

  // Función de filtro global - usa el índice pre-computado (O(1) lookup por fila)
  const defaultGlobalFilterFn = useCallback((row: { original: T }, _columnId: string, filterValue: unknown) => {
    if (!filterValue || typeof filterValue !== 'string' || filterValue.trim() === '') return true
    
    const searchLower = filterValue.toLowerCase().trim()
    const allText = searchIndex.get(row.original as object) || ''

    if (allText.includes(searchLower)) return true

    const words = searchLower.split(/\s+/).filter(w => w.length > 0)
    if (words.length > 1) {
      return words.every(word => allText.includes(word))
    }

    return false
  }, [searchIndex])

  // Server-side pagination state
  const [internalPageIndex, setInternalPageIndex] = useState(0);
  const [internalPageSize, setInternalPageSize] = useState(pageSize);
  const currentPageIndex = manualPagination && controlledPageIndex !== undefined ? controlledPageIndex : internalPageIndex;

  const table = useReactTable({
    data: filteredData,
    columns: finalColumns,
    state: {
      sorting,
      globalFilter: debouncedSearch,
      ...(manualPagination ? { pagination: { pageIndex: currentPageIndex, pageSize: internalPageSize } } : {}),
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setDebouncedSearch,
    globalFilterFn: customGlobalFilterFn || defaultGlobalFilterFn,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    ...(manualPagination ? {
      manualPagination: true,
      rowCount: rowCount ?? 0,
      onPaginationChange: (updater) => {
        const prev = { pageIndex: currentPageIndex, pageSize: internalPageSize };
        const next = typeof updater === 'function' ? updater(prev) : updater;
        setInternalPageIndex(next.pageIndex);
        setInternalPageSize(next.pageSize);
        onPaginationChange?.(next.pageIndex, next.pageSize);
      },
    } : {}),
    initialState: {
      pagination: {
        pageSize,
      },
    },
  });

  // Callback when table is ready
  useEffect(() => {
    if (onTableReady) {
      onTableReady(table);
    }
  }, [table, onTableReady]);

  // Map de columnas con size REAL (definido por el usuario, no el default 150 de TanStack)
  const userColumnSizes = useMemo(() => {
    const map = new Map<string, number>();
    columns.forEach(col => {
      const def = col as { accessorKey?: string; id?: string; size?: number };
      const colId = def.accessorKey || def.id || '';
      if (colId && def.size !== undefined) {
        map.set(colId, def.size);
      }
    });
    return map;
  }, [columns]);
  const columnsWithUserSize = userColumnSizes;

  // Get active filters info for display
  const activeFiltersInfo = useMemo(() => {
    const filters: Array<{ colId: string; label: string; type: 'column' | 'date'; values?: string[]; dateRange?: { from?: string; to?: string } }> = [];

    // Column filters
    Object.entries(columnFilters).forEach(([colId, values]) => {
      if (values.length > 0) {
        // Get column label
        const col = columns.find(c => {
          const def = c as { accessorKey?: string; id?: string };
          return def.accessorKey === colId || def.id === colId;
        });
        const colDef = col as { header?: string | unknown };
        let label = typeof colDef?.header === 'string' ? colDef.header : colId;
        label = label.charAt(0).toUpperCase() + label.slice(1).replace(/_/g, ' ');
        filters.push({ colId, label, type: 'column', values });
      }
    });

    // Date filters
    Object.entries(dateFilters).forEach(([colId, range]) => {
      if (range.from || range.to) {
        const col = columns.find(c => {
          const def = c as { accessorKey?: string; id?: string };
          return def.accessorKey === colId || def.id === colId;
        });
        const colDef = col as { header?: string | unknown };
        let label = typeof colDef?.header === 'string' ? colDef.header : colId;
        label = label.charAt(0).toUpperCase() + label.slice(1).replace(/_/g, ' ');
        filters.push({ colId, label, type: 'date', dateRange: range });
      }
    });

    return filters;
  }, [columnFilters, dateFilters, columns]);

  // Check if there are any active filters (internal or external)
  const hasActiveFilters = activeFiltersInfo.length > 0 || externalFilters.length > 0;

  // Clear all filters (internal and external)
  const clearAllFilters = () => {
    setColumnFilters({});
    setDateFilters({});
    setOpenFilterId(null);
    // Also clear external filters
    externalFilters.forEach(f => f.onClear());
    // Call parent's onClearAllFilters if provided
    onClearAllFilters?.();
  };

  // Clear a specific filter
  const clearFilter = (colId: string, type: 'column' | 'date') => {
    if (type === 'column') {
      const newFilters = { ...columnFilters };
      delete newFilters[colId];
      setColumnFilters(newFilters);
    } else {
      const newDateFilters = { ...dateFilters };
      delete newDateFilters[colId];
      setDateFilters(newDateFilters);
    }
  };

  if (loading) {
    return (
      <div className="dt-loading">
        <Spinner size="md" message="Cargando..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="dt-error">
        <span>Error: {error}</span>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="dt-wrapper">
        {/* Header with Search and Action - mostrar incluso cuando no hay datos */}
        {(showSearch || headerAction) && (
          <div className="dt-header-bar">
            {showSearch && (
              <div className="dt-search-wrapper">
                <svg
                  className="dt-search-icon"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
                <input
                  type="text"
                  className="dt-search-input"
                  placeholder={searchPlaceholder}
                  value={globalFilter}
                  onChange={(e) => {
                    setGlobalFilter(e.target.value);
                  }}
                />
              </div>
            )}
            {headerAction && (
              <div className="dt-header-action">{headerAction}</div>
            )}
          </div>
        )}
        {/* Active Filters Bar - mostrar incluso cuando no hay datos */}
        {hasActiveFilters && (
          <div className="dt-active-filters">
            <div className="dt-active-filters-label">
              <FilterIcon size={14} />
              <span>Filtros activos:</span>
            </div>
            <div className="dt-active-filters-list">
              {/* External filters (from stat cards) */}
              {externalFilters.map(filter => (
                <div key={filter.id} className="dt-active-filter-chip">
                  <span className="dt-chip-value">{filter.label}</span>
                  <button
                    type="button"
                    className="dt-chip-remove"
                    onClick={filter.onClear}
                    title="Quitar filtro"
                  >
                    ×
                  </button>
                </div>
              ))}
              {/* Internal column filters */}
              {activeFiltersInfo.map(filter => (
                <div key={filter.colId} className="dt-active-filter-chip">
                  <span className="dt-chip-label">{filter.label}</span>
                  {filter.type === 'column' && filter.values && (
                    <span className="dt-chip-value">
                      {filter.values.length === 1 ? filter.values[0] : `${filter.values.length} seleccionados`}
                    </span>
                  )}
                  {filter.type === 'date' && filter.dateRange && (
                    <span className="dt-chip-value">
                      {filter.dateRange.from && filter.dateRange.to
                        ? `${filter.dateRange.from} - ${filter.dateRange.to}`
                        : filter.dateRange.from
                          ? `Desde ${filter.dateRange.from}`
                          : `Hasta ${filter.dateRange.to}`}
                    </span>
                  )}
                  <button
                    type="button"
                    className="dt-chip-remove"
                    onClick={() => clearFilter(filter.colId, filter.type)}
                    title="Quitar filtro"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button className="dt-clear-all-filters" onClick={clearAllFilters}>
              Limpiar todo
            </button>
          </div>
        )}
        <div className="dt-empty">
          {emptyIcon && <div className="dt-empty-icon">{emptyIcon}</div>}
          <h3 className="dt-empty-title">{emptyTitle}</h3>
          {emptyDescription && (
            <p className="dt-empty-description">{emptyDescription}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="dt-wrapper">
      {/* Header with Search, Column Toggle and Action */}
      {(showSearch || headerAction) && (
        <div className="dt-header-bar">
          {showSearch && (
            <div className="dt-search-wrapper">
              <svg
                className="dt-search-icon"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="text"
                className="dt-search-input"
                placeholder={searchPlaceholder}
                value={globalFilter}
                onChange={(e) => {
                  setGlobalFilter(e.target.value);
                }}
              />
            </div>
          )}

          {headerAction && (
            <div className="dt-header-action">{headerAction}</div>
          )}
        </div>
      )}

      {/* Active Filters Bar */}
      {hasActiveFilters && (
        <div className="dt-active-filters">
          <div className="dt-active-filters-label">
            <FilterIcon size={14} />
            <span>Filtros activos:</span>
          </div>
          <div className="dt-active-filters-list">
            {/* External filters (from stat cards) */}
            {externalFilters.map(filter => (
              <div key={filter.id} className="dt-active-filter-chip">
                <span className="dt-chip-value">{filter.label}</span>
                <button
                  type="button"
                  className="dt-chip-remove"
                  onClick={filter.onClear}
                  title="Quitar filtro"
                >
                  ×
                </button>
              </div>
            ))}
            {/* Internal column filters */}
            {activeFiltersInfo.map(filter => (
              <div key={filter.colId} className="dt-active-filter-chip">
                <span className="dt-chip-label">{filter.label}</span>
                {filter.type === 'column' && filter.values && (
                  <span className="dt-chip-value">
                    {filter.values.length === 1 ? filter.values[0] : `${filter.values.length} seleccionados`}
                  </span>
                )}
                {filter.type === 'date' && filter.dateRange && (
                  <span className="dt-chip-value">
                    {filter.dateRange.from && filter.dateRange.to
                      ? `${filter.dateRange.from} - ${filter.dateRange.to}`
                      : filter.dateRange.from
                        ? `Desde ${filter.dateRange.from}`
                        : `Hasta ${filter.dateRange.to}`}
                  </span>
                )}
                <button
                  type="button"
                  className="dt-chip-remove"
                  onClick={() => clearFilter(filter.colId, filter.type)}
                  title="Quitar filtro"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="dt-clear-all-filters" onClick={clearAllFilters}>
            Limpiar todos
          </button>
        </div>
      )}

      {/* Table or Cards (mobile) */}
      <div className="dt-container">
        {/* Mobile Cards View */}
        {isMobile ? (
          <div className="dt-cards-container">
            {table.getRowModel().rows.length === 0 ? (
              <div className="dt-no-results-card">No se encontraron resultados</div>
            ) : (
              table.getRowModel().rows.map((row) => {
                // Separar celdas: acciones van al final, el resto se filtra
                const actionsCells: typeof row.getVisibleCells extends () => infer R ? R : never = [];
                const contentCells: typeof row.getVisibleCells extends () => infer R ? R : never = [];
                
                row.getVisibleCells().forEach((cell) => {
                  const isActionsColumn = alwaysVisibleColumns.includes(cell.column.id);
                  
                  if (isActionsColumn) {
                    actionsCells.push(cell);
                  } else {
                    contentCells.push(cell);
                  }
                });

                return (
                  <div key={row.id} className="dt-card">
                    <div className="dt-card-content">
                      {contentCells.map((cell) => {
                        // Get header label
                        const header = cell.column.columnDef.header;
                        let headerLabel = cell.column.id;
                        if (typeof header === 'string') {
                          headerLabel = header;
                        } else if (typeof header === 'function') {
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          const rendered = header({ column: cell.column, header: cell.column.columnDef, table } as any);
                          if (typeof rendered === 'string') headerLabel = rendered;
                          // Para FilterHeader, extraer el label
                          if (rendered && typeof rendered === 'object' && 'props' in rendered) {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const props = (rendered as any).props;
                            if (props?.label) headerLabel = props.label;
                          }
                        }
                        
                        // Renderizar valor
                        const renderedValue = flexRender(cell.column.columnDef.cell, cell.getContext());
                        
                        // Obtener valor raw para determinar si está vacío
                        const rawValue = cell.getValue();
                        
                        // Determinar si el valor está vacío o es un placeholder
                        const isEmptyValue = (val: unknown, rendered: React.ReactNode): boolean => {
                          // Valores nulos/undefined
                          if (val === null || val === undefined || val === '') return true;
                          // Strings vacíos o solo guiones
                          if (typeof val === 'string' && (val.trim() === '' || val.trim() === '-' || val === 'N/A')) return true;
                          // Verificar el contenido renderizado
                          if (typeof rendered === 'string' && (rendered.trim() === '-' || rendered.trim() === '' || rendered === 'N/A')) return true;
                          return false;
                        };
                        
                        // Ocultar campos vacíos en mobile para cards más limpias
                        if (isEmptyValue(rawValue, renderedValue)) {
                          return null;
                        }
                        
                        return (
                          <div key={cell.id} className="dt-card-field">
                            <span className="dt-card-label">{headerLabel}</span>
                            <span className="dt-card-value">
                              {renderedValue}
                            </span>
                          </div>
                        );
                      })}
                      
                      {/* Acciones siempre al final */}
                      {actionsCells.length > 0 && (
                        <div className="dt-card-actions">
                          {actionsCells.map((cell) => (
                            <React.Fragment key={cell.id}>
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </React.Fragment>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          /* Desktop Table View */
          <div className="dt-table-wrapper" ref={tableWrapperRef}>
            <table className="dt-table">
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header, headerIndex) => {
                      const isActionsColumn = alwaysVisibleColumns.includes(header.id);
                      const isFirstColumn = stickyFirstColumn && headerIndex === 0;
                      const hasExplicitSize = columnsWithUserSize.has(header.id);
                      const isExpandColumn = !!(header.column.columnDef.meta as Record<string, unknown>)?.expand;
                      const shouldShrink = !hasExplicitSize && !isExpandColumn;
                      const shouldExpand = isExpandColumn;
                      return (
                        <th
                          key={header.id}
                          onClick={header.column.getCanSort() ? header.column.getToggleSortingHandler() : undefined}
                          className={`
                            ${header.column.getCanSort() ? "dt-sortable" : ""}
                            ${isActionsColumn ? "dt-sticky-col" : ""}
                            ${isFirstColumn ? "dt-sticky-col-left" : ""}
                            ${shouldShrink ? "dt-col-shrink" : ""}
                            ${shouldExpand ? "dt-col-expand" : ""}
                          `}
                        >
                          <div
                            className={`dt-header-content ${
                              isActionsColumn ? "dt-header-center" : ""
                            }`}
                          >
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                            {header.column.getCanSort() && (
                              <span className="dt-sort-indicator">
                                {{
                                  asc: " ↑",
                                  desc: " ↓",
                                }[header.column.getIsSorted() as string] ?? " ↕"}
                              </span>
                            )}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.length === 0 ? (
                  <tr>
                    <td colSpan={finalColumns.length} className="dt-no-results">
                      No se encontraron resultados
                    </td>
                  </tr>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <tr key={row.id}>
                      {row.getVisibleCells().map((cell, cellIndex) => {
                        const isActionsColumn = alwaysVisibleColumns.includes(cell.column.id);
                        const isFirstColumn = stickyFirstColumn && cellIndex === 0;
                        const hasExplicitSize = columnsWithUserSize.has(cell.column.id);
                        const isExpandColumn = !!(cell.column.columnDef.meta as Record<string, unknown>)?.expand;
                        const shouldShrink = !hasExplicitSize && !isExpandColumn;
                        const shouldExpand = isExpandColumn;
                        return (
                          <td
                            key={cell.id}
                            className={`${isActionsColumn ? "dt-sticky-col" : ""} ${isFirstColumn ? "dt-sticky-col-left" : ""} ${shouldShrink ? "dt-col-shrink" : ""} ${shouldExpand ? "dt-col-expand" : ""}`}
                          >
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext()
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {showPagination && table.getRowModel().rows.length > 0 && (
          <div className="dt-pagination">
            <div className="dt-pagination-info">
              Mostrando{" "}
              {table.getState().pagination.pageIndex *
                table.getState().pagination.pageSize +
                1}{" "}
              a{" "}
              {Math.min(
                (table.getState().pagination.pageIndex + 1) *
                  table.getState().pagination.pageSize,
                manualPagination ? (rowCount ?? 0) : table.getFilteredRowModel().rows.length
              )}{" "}
              de {manualPagination ? (rowCount ?? 0) : table.getFilteredRowModel().rows.length} registros
            </div>
            <div className="dt-pagination-controls">
              <button
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
                className="dt-pagination-btn"
              >
                {"<<"}
              </button>
              <button
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="dt-pagination-btn"
              >
                {"<"}
              </button>
              <span className="dt-pagination-text">
                Pagina {table.getState().pagination.pageIndex + 1} de{" "}
                {table.getPageCount()}
              </span>
              <button
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="dt-pagination-btn"
              >
                {">"}
              </button>
              <button
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
                className="dt-pagination-btn"
              >
                {">>"}
              </button>
              <select
                value={table.getState().pagination.pageSize}
                onChange={(e) => table.setPageSize(Number(e.target.value))}
                className="dt-pagination-select"
              >
                {pageSizeOptions.map((size) => (
                  <option key={size} value={size}>
                    {size} por pagina
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default DataTable;
