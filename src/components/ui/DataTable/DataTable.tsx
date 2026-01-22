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
import { ChevronDown, ChevronRight, Check, Filter, Calendar } from "lucide-react";
import { ExcelColumnFilter } from './ExcelColumnFilter';
import { DateRangeColumnFilter } from './filters/DateRangeColumnFilter';
import { NumericRangeColumnFilter } from './filters/NumericRangeColumnFilter';
import "./DataTable.css";

// Tipo para filtros de columna
type ColumnFilters = Record<string, string[]>;
type DateFilters = Record<string, { from?: string; to?: string }>;
type NumericFilters = Record<string, { min: string | null; max: string | null }>;

// Helper to parse date from various formats (dd/mm/yyyy, yyyy-mm-dd, ISO)
const parseDate = (dateStr: string): Date | null => {
  if (!dateStr) return null;
  const str = String(dateStr).trim();
  
  // Try dd/mm/yyyy
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
    const [day, month, year] = str.split('/').map(Number);
    return new Date(year, month - 1, day);
  }
  
  // Try yyyy-mm-dd (treat as local date to avoid timezone issues)
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [year, month, day] = str.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  
  // Try ISO or other formats
  const date = new Date(str);
  if (!isNaN(date.getTime())) return date;
  
  return null;
};

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
  /** Habilita el redimensionamiento de columnas @default false */
  enableColumnResizing?: boolean;
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
  enableColumnResizing = true,
}: DataTableProps<T>) {
  const [globalFilter, setGlobalFilter] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [visibleColumnCount, setVisibleColumnCount] = useState(100); // Start high, resize will adjust
  const tableWrapperRef = useRef<HTMLDivElement>(null);

  // Column filter state
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({});
  const [dateFilters, setDateFilters] = useState<DateFilters>({});
  const [numericFilters, setNumericFilters] = useState<NumericFilters>({});
  const [openFilterId, setOpenFilterId] = useState<string | null>(null);

  // Helper: Check if column is date type based on accessor key or data
  const isDateColumn = useCallback((colId: string): boolean => {
    const lowerColId = colId.toLowerCase();
    const dateKeywords = ['fecha', 'date', 'created', 'updated', 'vencimiento', 'inicio', 'fin'];
    const hasDateKeyword = dateKeywords.some(keyword => lowerColId.includes(keyword));
    
    // Excluir columnas que son SOLO hora (tienen "hora" pero no palabras clave de fecha)
    if (lowerColId.includes('hora') && !hasDateKeyword) return false;
    
    return hasDateKeyword;
  }, []);

  // Helper: Check if column is numeric type based on accessor key or data
  const isNumericColumn = useCallback((colId: string): boolean => {
    const lowerColId = colId.toLowerCase();
    const numericKeywords = ['importe', 'monto', 'precio', 'total', 'saldo', 'cantidad', 'km', 'litros'];
    return numericKeywords.some(keyword => lowerColId.includes(keyword));
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
      setNumericFilters({});
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

          const dateValue = parseDate(String(value));
          if (!dateValue) return false;

          if (range.from) {
            const fromDate = parseDate(range.from);
            if (fromDate && dateValue < fromDate) return false;
          }
          if (range.to) {
            const toDate = parseDate(range.to);
            if (toDate) {
              toDate.setHours(23, 59, 59, 999);
              if (dateValue > toDate) return false;
            }
          }
          return true;
        });
      }
    });

    // Apply numeric filters except the excluded column
    Object.entries(numericFilters).forEach(([colId, range]) => {
      if (colId !== excludeColId && (range.min || range.max)) {
        result = result.filter((row) => {
          const value = getNestedValueForFilter(row as Record<string, unknown>, colId);
          if (value === null || value === undefined) return false;
          
          let numValue: number;
          if (typeof value === 'number') {
            numValue = value;
          } else {
             const str = String(value);
             // Remove currency symbols, thousand separators (.), and handle decimal (,)
             const cleanStr = str.replace(/[^0-9.,-]/g, '');
             // Assuming es-PY format: 1.000.000,00 -> 1000000.00
             const normalized = cleanStr.replace(/\./g, '').replace(',', '.');
             numValue = parseFloat(normalized);
          }
          
          if (isNaN(numValue)) return false;

          if (range.min) {
            const min = parseFloat(range.min);
            if (!isNaN(min) && numValue < min) return false;
          }
          if (range.max) {
            const max = parseFloat(range.max);
            if (!isNaN(max) && numValue > max) return false;
          }
          return true;
        });
      }
    });

    return result;
  }, [data, columnFilters, dateFilters, numericFilters, getNestedValueForFilter]);

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

          const dateValue = parseDate(String(value));
          if (!dateValue) return false;

          if (range.from) {
            const fromDate = parseDate(range.from);
            if (fromDate && dateValue < fromDate) return false;
          }
          if (range.to) {
            const toDate = parseDate(range.to);
            if (toDate) {
              toDate.setHours(23, 59, 59, 999);
              if (dateValue > toDate) return false;
            }
          }
          return true;
        });
      }
    });

    // Apply numeric filters
    Object.entries(numericFilters).forEach(([colId, range]) => {
      if (range.min || range.max) {
        result = result.filter((row) => {
          const value = getNestedValueForFilter(row as Record<string, unknown>, colId);
          if (value === null || value === undefined) return false;
          
          let numValue: number;
          if (typeof value === 'number') {
            numValue = value;
          } else {
             const str = String(value);
             const cleanStr = str.replace(/[^0-9.,-]/g, '');
             const normalized = cleanStr.replace(/\./g, '').replace(',', '.');
             numValue = parseFloat(normalized);
          }
          
          if (isNaN(numValue)) return false;

          if (range.min) {
            const min = parseFloat(range.min);
            if (!isNaN(min) && numValue < min) return false;
          }
          if (range.max) {
            const max = parseFloat(range.max);
            if (!isNaN(max) && numValue > max) return false;
          }
          return true;
        });
      }
    });

    return result;
  }, [data, columnFilters, dateFilters, numericFilters, getNestedValueForFilter]);

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
  }, [maxVisibleColumns, columns, alwaysVisibleColumns]);

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

  // Filter Header Component - renders inline in header
  const FilterHeader = useCallback(({ colId, label }: { colId: string; label: string }) => {
    const isDate = isDateColumn(colId);
    const isNumeric = isNumericColumn(colId);

    if (isDate) {
      return (
        <DateRangeColumnFilter
          label={label}
          value={{
            from: dateFilters[colId]?.from || null,
            to: dateFilters[colId]?.to || null
          }}
          onChange={(value) => {
             if (!value.from && !value.to) {
               const newFilters = { ...dateFilters };
               delete newFilters[colId];
               setDateFilters(newFilters);
             } else {
               setDateFilters({
                 ...dateFilters,
                 [colId]: { from: value.from || undefined, to: value.to || undefined }
               });
             }
          }}
          filterId={colId}
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      );
    }

    if (isNumeric) {
      return (
        <NumericRangeColumnFilter
          label={label}
          value={{
            min: numericFilters[colId]?.min || null,
            max: numericFilters[colId]?.max || null
          }}
          onChange={(value) => {
             if (!value.min && !value.max) {
               const newFilters = { ...numericFilters };
               delete newFilters[colId];
               setNumericFilters(newFilters);
             } else {
               setNumericFilters({
                 ...numericFilters,
                 [colId]: value
               });
             }
          }}
          filterId={colId}
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
          prefix={colId.toLowerCase().includes('importe') || colId.toLowerCase().includes('monto') || colId.toLowerCase().includes('saldo') || colId.toLowerCase().includes('precio') ? 'Gs' : undefined}
        />
      );
    }

    // Default to Excel-style text filter
    return (
      <ExcelColumnFilter
        label={label}
        options={getUniqueValues(colId)}
        selectedValues={columnFilters[colId] || []}
        onSelectionChange={(values) => {
          if (values.length === 0) {
            const newFilters = { ...columnFilters };
            delete newFilters[colId];
            setColumnFilters(newFilters);
          } else {
            setColumnFilters({
              ...columnFilters,
              [colId]: values
            });
          }
        }}
        filterId={colId}
        openFilterId={openFilterId}
        onOpenChange={setOpenFilterId}
      />
    );
  }, [columnFilters, dateFilters, numericFilters, openFilterId, getUniqueValues, isDateColumn, isNumericColumn]);

  // Wrap columns with auto-filters (if enabled)
  const columnsWithFilters = useMemo(() => {
    // If auto-filters are disabled, return columns as-is
    if (disableAutoFilters) {
      return visibleColumns;
    }

    return visibleColumns.map(col => {
      const colDef = col as { accessorKey?: string; id?: string; header?: unknown };
      const colId = colDef.accessorKey || colDef.id || "";

      // Skip if no accessorKey (custom columns like expand)
      if (!colId) return col;

      // Skip if header is already a custom function (module has its own filter)
      if (typeof colDef.header === 'function') {
        return col;
      }

      // Get original header label
      let headerLabel = colId.split('.').pop() || colId;
      headerLabel = headerLabel.charAt(0).toUpperCase() + headerLabel.slice(1).replace(/_/g, ' ');
      if (typeof colDef.header === 'string') {
        headerLabel = colDef.header;
      }

      return {
        ...col,
        header: () => <FilterHeader colId={colId} label={headerLabel} />,
      } as ColumnDef<T, unknown>;
    });
  }, [visibleColumns, FilterHeader, disableAutoFilters]);

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
      minSize: 40,
      maxSize: 40,
      enableResizing: false,
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
    enableColumnResizing,
    columnResizeMode: "onChange",
    defaultColumn: {
      minSize: 60,
      maxSize: 800,
    },
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
                    displayValue = rawValue.length > 0 ? rawValue.map(item =>
                      typeof item === 'object' ? (item as any).nombre || (item as any).descripcion || JSON.stringify(item) : String(item)
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

    Object.entries(columnFilters).forEach(([colId, values]) => {
      if (values.length > 0) {
        const col = columns.find(c => (c as any).accessorKey === colId || c.id === colId);
        const label = col ? (typeof col.header === 'string' ? col.header : colId) : colId;
        filters.push({ colId, label: String(label), type: 'column', values });
      }
    });

    Object.entries(dateFilters).forEach(([colId, range]) => {
      if (range.from || range.to) {
        const col = columns.find(c => (c as any).accessorKey === colId || c.id === colId);
        const label = col ? (typeof col.header === 'string' ? col.header : colId) : colId;
        filters.push({ colId, label: String(label), type: 'date', dateRange: range });
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
        <div className="dt-loading-spinner"></div>
        <span>Cargando...</span>
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
        {/* Active Filters Bar - mostrar incluso cuando no hay datos */}
        {hasActiveFilters && (
          <div className="dt-active-filters">
            <div className="dt-active-filters-label">
              <Filter size={14} />
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
            <Filter size={14} />
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

      {/* Table */}
      <div className="dt-container">
        <div className="dt-table-wrapper" ref={tableWrapperRef}>
          <table 
            className="dt-table dt-table-responsive" 
            style={{ 
              width: enableColumnResizing ? table.getTotalSize() : '100%',
              minWidth: '100%',
              tableLayout: enableColumnResizing ? 'fixed' : 'auto' 
            }}
          >
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const isActionsColumn = alwaysVisibleColumns.includes(header.id);
                    const isExpandColumn = header.id === "expand";
                    return (
                      <th
                        key={header.id}
                        colSpan={header.colSpan}
                        onClick={header.column.getCanSort() ? header.column.getToggleSortingHandler() : undefined}
                        className={`
                          ${header.column.getCanSort() ? "dt-sortable" : ""}
                          ${isActionsColumn ? "dt-sticky-col" : ""}
                          ${isExpandColumn ? "dt-expand-col" : ""}
                        `}
                        style={{
                          width: enableColumnResizing ? header.getSize() : undefined,
                          ...(isExpandColumn ? { width: '40px' } : undefined)
                        }}
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
                        {header.column.getCanResize() && (
                          <div
                            onMouseDown={header.getResizeHandler()}
                            onTouchStart={header.getResizeHandler()}
                            className={`dt-resizer ${
                              header.column.getIsResizing() ? "isResizing" : ""
                            }`}
                          />
                        )}
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
