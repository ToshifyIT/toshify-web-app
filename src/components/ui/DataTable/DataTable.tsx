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
  getExpandedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type Table,
  type ExpandedState,
  type FilterFn,
} from "@tanstack/react-table";
import { ChevronDown, ChevronRight, Check, Calendar } from "lucide-react";

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

// Tipo para filtros de columna
type ColumnFilters = Record<string, string[]>;
type DateFilters = Record<string, { from?: string; to?: string }>;

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

  const filteredOptions = searchTerm
    ? uniqueValues.filter(opt => opt.toLowerCase().includes(searchTerm.toLowerCase()))
    : uniqueValues;

  // Calculate position when opening
  useLayoutEffect(() => {
    if (!isOpen || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    let left = rect.left;
    let top = rect.bottom + 4;

    // Adjust if goes off screen
    if (left + 220 > window.innerWidth) {
      left = window.innerWidth - 230;
    }
    if (top + 300 > window.innerHeight) {
      top = rect.top - 304;
    }
    setPosition({ top, left });
  }, [isOpen]);

  // Clear search when closing
  useEffect(() => {
    if (!isOpen) setSearchTerm('');
  }, [isOpen]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        onToggle(colId);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
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
          className="dt-filter-dropdown"
          style={{ position: 'fixed', top: position.top, left: position.left }}
          onClick={e => e.stopPropagation()}
        >
          {isDate ? (
            <div className="dt-filter-date">
              <label>
                <span>Desde:</span>
                <input
                  type="date"
                  value={dateFilter?.from || ''}
                  onChange={e => onDateChange(colId, 'from', e.target.value)}
                />
              </label>
              <label>
                <span>Hasta:</span>
                <input
                  type="date"
                  value={dateFilter?.to || ''}
                  onChange={e => onDateChange(colId, 'to', e.target.value)}
                />
              </label>
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
  /** Número máximo de columnas a mostrar antes de colapsar (sin contar acciones) @default 6 */
  maxVisibleColumns?: number;
  /** Key para resetear filtros internos - cuando cambia, se limpian todos los filtros */
  resetFiltersKey?: number | string;
  /** Desactiva los filtros automáticos de columna (para módulos con filtros personalizados) */
  disableAutoFilters?: boolean;
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
  /** Habilita el scroll horizontal en lugar de ocultar columnas @default false */
  enableHorizontalScroll?: boolean;
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
  maxVisibleColumns = 0, // 0 = show all columns that fit
  resetFiltersKey,
  disableAutoFilters = false,
  externalFilters = [],
  onClearAllFilters,
  globalFilterFn: customGlobalFilterFn,
  globalFilter: controlledGlobalFilter,
  onGlobalFilterChange: setControlledGlobalFilter,
  enableHorizontalScroll = true,
}: DataTableProps<T>) {
  const [internalGlobalFilter, setInternalGlobalFilter] = useState("");
  const isControlled = controlledGlobalFilter !== undefined;
  const globalFilter = isControlled ? controlledGlobalFilter : internalGlobalFilter;
  const setGlobalFilter = isControlled ? (setControlledGlobalFilter || (() => {})) : setInternalGlobalFilter;

  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [visibleColumnCount, setVisibleColumnCount] = useState(100); // Start high, resize will adjust
  const tableWrapperRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);

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

  // Helper: Check if column is date type based on accessor key or data
  const isDateColumn = useCallback((colId: string): boolean => {
    const lowerColId = colId.toLowerCase();
    // Excluir columnas de hora (tienen "hora" en el nombre pero no son fechas)
    if (lowerColId.includes('hora')) return false;
    const dateKeywords = ['fecha', 'date', 'created', 'updated', 'vencimiento', 'inicio', 'fin'];
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
        // Normalize selected values for comparison
        const normalizedSelected = selectedValues.map(v => v.toUpperCase().trim().replace(/\s+/g, ' '));
        result = result.filter((row) => {
          const value = getNestedValueForFilter(row as Record<string, unknown>, colId);
          // Normalize: trim, collapse multiple spaces, uppercase for comparison
          const strValue = value !== null && value !== undefined
            ? String(value).trim().replace(/\s+/g, ' ').toUpperCase()
            : '';
          return normalizedSelected.includes(strValue);
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
        // Normalize selected values for comparison
        const normalizedSelected = selectedValues.map(v => v.toUpperCase().trim().replace(/\s+/g, ' '));
        result = result.filter((row) => {
          const value = getNestedValueForFilter(row as Record<string, unknown>, colId);
          // Normalize: trim, collapse multiple spaces, uppercase for comparison
          const strValue = value !== null && value !== undefined
            ? String(value).trim().replace(/\s+/g, ' ').toUpperCase()
            : '';
          return normalizedSelected.includes(strValue);
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

  // Adjust visible columns based on container width
  useEffect(() => {
    function handleResize() {
      // If horizontal scroll is enabled, show all columns
      if (enableHorizontalScroll) {
        setVisibleColumnCount(1000); // Large enough number to show all
        return;
      }

      if (!tableWrapperRef.current) return;
      const width = tableWrapperRef.current.offsetWidth;

      // Calculate how many columns can fit
      // Use conservative width estimate (100px) to show more columns
      const avgColWidth = 100;
      const actionsWidth = 140;
      const expandBtnWidth = 50;
      const availableWidth = width - actionsWidth - expandBtnWidth;
      const fittingColumns = Math.floor(availableWidth / avgColWidth);

      // Show all columns that fit, minimum 2, maximum is total columns or maxVisibleColumns
      const totalRegularCols = columns.filter(col => {
        const colId = (col as { accessorKey?: string; id?: string }).accessorKey ||
                      (col as { id?: string }).id || "";
        return !alwaysVisibleColumns.includes(colId);
      }).length;

      // maxVisibleColumns = 0 means show all that fit, otherwise use as limit
      const maxToShow = maxVisibleColumns > 0 ? maxVisibleColumns : totalRegularCols;
      const newCount = Math.max(2, Math.min(fittingColumns, maxToShow, totalRegularCols));
      setVisibleColumnCount(newCount);
    }

    // Run on mount and after a small delay to ensure container is sized
    handleResize();
    const timer = setTimeout(handleResize, 100);
    window.addEventListener("resize", handleResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", handleResize);
    };
  }, [maxVisibleColumns, columns, alwaysVisibleColumns, enableHorizontalScroll]);

  // Separate columns into visible and hidden - memoized to prevent unnecessary re-renders
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

  const visibleColumns = useMemo(() => regularColumns.slice(0, visibleColumnCount), [regularColumns, visibleColumnCount]);
  const hiddenColumns = useMemo(() => regularColumns.slice(visibleColumnCount), [regularColumns, visibleColumnCount]);
  const hasHiddenColumns = hiddenColumns.length > 0;

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
  const columnsWithFilters = useMemo(() => {
    // If auto-filters are disabled, return columns as-is
    if (disableAutoFilters) {
      return visibleColumns;
    }

    return visibleColumns.map(col => {
      const colDef = col as { accessorKey?: string; id?: string; header?: unknown; enableSorting?: boolean };
      const colId = colDef.accessorKey || colDef.id || "";

      // Skip if no accessorKey (custom columns like expand)
      if (!colId) return col;

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
      const isOpen = openFilterId === colId;
      const hasFilter = isDate
        ? !!(dateFilters[colId]?.from || dateFilters[colId]?.to)
        : (columnFilters[colId]?.length || 0) > 0;

      return {
        ...col,
        ...sortingOverride,
        header: () => (
          <FilterHeader
            colId={colId}
            label={headerLabel}
            isOpen={isOpen}
            hasFilter={hasFilter}
            isDate={isDate}
            uniqueValues={isDate ? [] : getUniqueValues(colId)}
            selectedValues={columnFilters[colId] || []}
            dateFilter={dateFilters[colId]}
            onToggle={handleFilterToggle}
            onSelectValue={handleSelectValue}
            onDateChange={handleDateChange}
            onClearFilter={handleClearFilter}
          />
        ),
      } as ColumnDef<T, unknown>;
    });
  }, [visibleColumns, disableAutoFilters, isDateColumn, openFilterId, dateFilters, columnFilters, getUniqueValues, handleFilterToggle, handleSelectValue, handleDateChange, handleClearFilter]);

  // Memoize final columns to prevent unnecessary re-renders that reset expand state
  const finalColumns = useMemo<ColumnDef<T, unknown>[]>(() => {
    // Build the expandable column if there are hidden columns
    const expandColumn: ColumnDef<T, unknown> = {
      id: "expand",
      header: "",
      cell: ({ row }) => (
        <button
          className={`dt-expand-btn ${row.getIsExpanded() ? 'expanded' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            row.toggleExpanded();
          }}
          title={row.getIsExpanded() ? "Ocultar detalles" : "Ver más"}
        >
          {row.getIsExpanded() ? (
            <ChevronDown size={16} />
          ) : (
            <ChevronRight size={16} />
          )}
        </button>
      ),
      size: 40,
      enableSorting: false,
    };

    // Final column order: expand (if needed) + visible with filters + actions
    return [
      ...(hasHiddenColumns ? [expandColumn] : []),
      ...columnsWithFilters,
      ...actionsColumn,
    ];
  }, [hasHiddenColumns, columnsWithFilters, actionsColumn]);

  // Función de filtro global que busca en TODOS los valores string del objeto
  // Optimizada: concatena todo en un string y busca
  const defaultGlobalFilterFn = useCallback((row: { original: T }, _columnId: string, filterValue: unknown) => {
    // Si no hay valor de filtro, mostrar todas las filas
    if (!filterValue || typeof filterValue !== 'string' || filterValue.trim() === '') return true
    
    const searchLower = filterValue.toLowerCase().trim()
    const original = row.original as Record<string, unknown>

    // Recolectar todos los valores string en un solo texto (rápido, sin recursión profunda)
    const collectStrings = (obj: unknown, depth = 0): string => {
      if (depth > 3) return '' // Limitar profundidad para performance
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

    const allText = collectStrings(original).toLowerCase()

    // Buscar el término completo O todas las palabras individuales
    if (allText.includes(searchLower)) return true

    // Si no encuentra el término completo, buscar cada palabra
    const words = searchLower.split(/\s+/).filter(w => w.length > 0)
    if (words.length > 1) {
      return words.every(word => allText.includes(word))
    }

    return false
  }, [])

  const table = useReactTable({
    data: filteredData,
    columns: finalColumns,
    state: {
      sorting,
      globalFilter: debouncedSearch,
      expanded,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setDebouncedSearch,
    onExpandedChange: setExpanded,
    globalFilterFn: customGlobalFilterFn || defaultGlobalFilterFn,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
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

  // Helper to get nested value from object using dot notation (e.g., "vehiculos_estados.codigo")
  const getNestedValue = (obj: Record<string, unknown>, path: string): unknown => {
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
  };

  // Render expanded row content - use original columns to access data
  // For columns with custom cell renderers (like checkboxes), use flexRender
  const renderExpandedContent = (rowData: T, rowIndex: number) => {
    if (!hasHiddenColumns) return null;

    const data = rowData as Record<string, unknown>;

    // Create a mock row object for flexRender - matches TanStack Table row structure
    const mockRow = {
      original: rowData,
      index: rowIndex,
      id: String(rowIndex),
      depth: 0,
      getIsExpanded: () => true,
      getCanExpand: () => false,
      toggleExpanded: () => {},
      getVisibleCells: () => [],
      getAllCells: () => [],
      getValue: (columnId: string) => {
        const colDef = hiddenColumns.find(col => {
          const def = col as { accessorKey?: string; id?: string };
          return def.accessorKey === columnId || def.id === columnId;
        });
        if (colDef) {
          const def = colDef as { accessorKey?: string; id?: string; accessorFn?: (row: T) => unknown };
          if (def.accessorFn) {
            return def.accessorFn(rowData);
          }
          const key = def.accessorKey || def.id || "";
          return key.includes('.') ? getNestedValue(data, key) : data[key];
        }
        return undefined;
      },
    };

    return (
      <div className="dt-expanded-content">
        <div className="dt-expanded-grid">
          {hiddenColumns.map((col) => {
            const colDef = col as { accessorKey?: string; id?: string; header?: unknown; cell?: unknown };
            const colId = colDef.accessorKey || colDef.id || "";

            // Get header text - try to extract from header function/string
            let headerText = colId.split('.').pop() || colId;
            headerText = headerText.charAt(0).toUpperCase() + headerText.slice(1).replace(/_/g, ' ').replace(/([A-Z])/g, ' $1');
            if (typeof colDef.header === "string") {
              headerText = colDef.header;
            }

            // If column has a custom cell renderer, use it (for checkboxes, custom badges, etc.)
            let displayValue: React.ReactNode;
            if (typeof colDef.cell === 'function') {
              // Use flexRender with the column's cell definition
              // Wrap in try-catch to prevent crashes from incompatible cell renderers
              try {
                // Create a getValue function specific to THIS column
                // Cell renderers call getValue() without arguments, expecting the value for their column
                const cellGetValue = () => mockRow.getValue(colId);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                displayValue = flexRender(colDef.cell as ColumnDef<T>['cell'], { row: mockRow, getValue: cellGetValue } as any);
              } catch (e) {
                console.warn('Error rendering expanded cell:', colId, e);
                // Fallback to raw value
                const rawValue = colId.includes('.') ? getNestedValue(data, colId) : data[colId];
                displayValue = rawValue !== null && rawValue !== undefined ? String(rawValue) : '-';
              }
            } else {
              // Fallback to generic value formatting
              const rawValue = colId.includes('.') ? getNestedValue(data, colId) : data[colId];

              displayValue = "-";
              if (rawValue !== null && rawValue !== undefined) {
                if (typeof rawValue === 'boolean') {
                  displayValue = (
                    <span className={`dt-boolean-indicator ${rawValue ? 'dt-boolean-true' : 'dt-boolean-false'}`}>
                      {rawValue ? <Check size={14} /> : <span className="dt-boolean-x">×</span>}
                      <span>{rawValue ? 'Sí' : 'No'}</span>
                    </span>
                  );
                } else if (rawValue instanceof Date) {
                  displayValue = rawValue.toLocaleDateString('es-AR');
                } else if (typeof rawValue === 'object') {
                  // Format objects in a user-friendly way
                  const obj = rawValue as Record<string, unknown>;
                  // Vehicle-like objects (have patente, marca, modelo)
                  if (obj.patente && obj.marca && obj.modelo) {
                    displayValue = (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{String(obj.patente)}</span>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{String(obj.marca)} {String(obj.modelo)}</span>
                      </div>
                    );
                  // Person-like objects (have nombre or full_name)
                  } else if (obj.nombre || obj.full_name) {
                    displayValue = String(obj.nombre || obj.full_name);
                  // Array of items
                  } else if (Array.isArray(rawValue)) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    displayValue = rawValue.length > 0 ? rawValue.map((item: any) =>
                      typeof item === 'object' ? item.nombre || item.descripcion || JSON.stringify(item) : String(item)
                    ).join(', ') : '-';
                  // Generic object - show values in a readable format
                  } else {
                    const values = Object.entries(obj)
                      .filter(([key, val]) => val !== null && val !== undefined && key !== 'id')
                      .map(([, val]) => String(val));
                    displayValue = values.length > 0 ? values.join(' - ') : '-';
                  }
                } else {
                  displayValue = String(rawValue);
                }
              }
            }

            return (
              <div key={colId} className="dt-expanded-item">
                <span className="dt-expanded-label">{headerText}</span>
                <span className="dt-expanded-value">{displayValue}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

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
                  const isExpandColumn = cell.column.id === "expand";
                  
                  if (isExpandColumn) return;
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
            <table className="dt-table dt-table-responsive">
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => {
                      const isActionsColumn = alwaysVisibleColumns.includes(header.id);
                      const isExpandColumn = header.id === "expand";
                      return (
                        <th
                          key={header.id}
                          onClick={header.column.getCanSort() ? header.column.getToggleSortingHandler() : undefined}
                          className={`
                            ${header.column.getCanSort() ? "dt-sortable" : ""}
                            ${isActionsColumn ? "dt-sticky-col" : ""}
                            ${isExpandColumn ? "dt-expand-col" : ""}
                          `}
                          style={isExpandColumn ? { width: '40px' } : header.column.columnDef.size ? { width: `${header.column.columnDef.size}px`, maxWidth: `${header.column.columnDef.size}px` } : undefined}
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
                    <React.Fragment key={row.id}>
                      <tr className={row.getIsExpanded() ? "dt-row-expanded" : ""}>
                        {row.getVisibleCells().map((cell) => {
                          const isActionsColumn = alwaysVisibleColumns.includes(cell.column.id);
                          const isExpandColumn = cell.column.id === "expand";
                          return (
                            <td
                              key={cell.id}
                              className={`
                                ${isActionsColumn ? "dt-sticky-col" : ""}
                                ${isExpandColumn ? "dt-expand-col" : ""}
                              `}
                              style={cell.column.columnDef.size ? { width: `${cell.column.columnDef.size}px`, maxWidth: `${cell.column.columnDef.size}px` } : undefined}
                            >
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext()
                              )}
                            </td>
                          );
                        })}
                      </tr>
                      {row.getIsExpanded() && hasHiddenColumns && (
                        <tr className="dt-expanded-row">
                          <td colSpan={finalColumns.length}>
                            {renderExpandedContent(row.original, row.index)}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
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
                table.getFilteredRowModel().rows.length
              )}{" "}
              de {table.getFilteredRowModel().rows.length} registros
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
