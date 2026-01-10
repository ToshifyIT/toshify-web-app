// src/components/ui/DataTable/DataTable.tsx
/**
 * @fileoverview Componente DataTable reutilizable basado en TanStack Table v8.
 * Proporciona búsqueda global, ordenamiento, paginación, diseño responsive
 * con filas expandibles y columna de acciones sticky.
 */

import { useState, useEffect, useRef, type ReactNode } from "react";
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
} from "@tanstack/react-table";
import { ChevronDown, ChevronRight, Columns3, Check } from "lucide-react";
import "./DataTable.css";

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
  maxVisibleColumns = 6,
}: DataTableProps<T>) {
  const [globalFilter, setGlobalFilter] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [visibleColumnCount, setVisibleColumnCount] = useState(maxVisibleColumns);
  const columnMenuRef = useRef<HTMLDivElement>(null);
  const columnBtnRef = useRef<HTMLButtonElement>(null);
  const tableWrapperRef = useRef<HTMLDivElement>(null);

  // Debounce search (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(globalFilter);
    }, 300);
    return () => clearTimeout(timer);
  }, [globalFilter]);

  // Close column menu on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        columnMenuRef.current &&
        !columnMenuRef.current.contains(event.target as Node) &&
        columnBtnRef.current &&
        !columnBtnRef.current.contains(event.target as Node)
      ) {
        setShowColumnMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Adjust visible columns based on container width
  useEffect(() => {
    function handleResize() {
      if (!tableWrapperRef.current) return;
      const width = tableWrapperRef.current.offsetWidth;

      // Calculate how many columns can fit
      // Assuming ~120px per column average
      const avgColWidth = 130;
      const actionsWidth = 100;
      const expandBtnWidth = 50;
      const availableWidth = width - actionsWidth - expandBtnWidth;
      const fittingColumns = Math.floor(availableWidth / avgColWidth);

      // Clamp between 2 and maxVisibleColumns
      const newCount = Math.max(2, Math.min(fittingColumns, maxVisibleColumns));
      setVisibleColumnCount(newCount);
    }

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [maxVisibleColumns]);

  // Separate columns into visible and hidden
  const regularColumns = columns.filter(col => {
    const colId = (col as { accessorKey?: string; id?: string }).accessorKey ||
                  (col as { id?: string }).id || "";
    return !alwaysVisibleColumns.includes(colId);
  });

  const actionsColumn = columns.filter(col => {
    const colId = (col as { accessorKey?: string; id?: string }).accessorKey ||
                  (col as { id?: string }).id || "";
    return alwaysVisibleColumns.includes(colId);
  });

  const visibleColumns = regularColumns.slice(0, visibleColumnCount);
  const hiddenColumns = regularColumns.slice(visibleColumnCount);
  const hasHiddenColumns = hiddenColumns.length > 0;

  // Build the expandable column if there are hidden columns
  const expandColumn: ColumnDef<T, unknown> = {
    id: "expand",
    header: "",
    cell: ({ row }) => {
      if (!hasHiddenColumns) return null;
      return (
        <button
          className="dt-expand-btn"
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
      );
    },
    size: 40,
    enableSorting: false,
  };

  // Final column order: expand (if needed) + visible + actions
  const finalColumns: ColumnDef<T, unknown>[] = [
    ...(hasHiddenColumns ? [expandColumn] : []),
    ...visibleColumns,
    ...actionsColumn,
  ];

  const table = useReactTable({
    data,
    columns: finalColumns,
    state: {
      sorting,
      globalFilter: debouncedSearch,
      expanded,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setDebouncedSearch,
    onExpandedChange: setExpanded,
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

  // Render expanded row content
  const renderExpandedContent = (row: ReturnType<typeof table.getRowModel>['rows'][0]) => {
    if (!hasHiddenColumns) return null;

    const rowData = row.original as Record<string, unknown>;

    return (
      <div className="dt-expanded-content">
        <div className="dt-expanded-grid">
          {hiddenColumns.map((col) => {
            const colId = (col as { accessorKey?: string; id?: string }).accessorKey ||
                          (col as { id?: string }).id || "";
            const header = typeof col.header === "string"
              ? col.header
              : colId.charAt(0).toUpperCase() + colId.slice(1).replace(/([A-Z])/g, ' $1');

            // Get the cell value
            let value: unknown = rowData[colId];

            // If there's a cell renderer, use it
            if (col.cell && typeof col.cell === 'function') {
              const cell = row.getAllCells().find(c => {
                const cId = (c.column.columnDef as { accessorKey?: string; id?: string }).accessorKey ||
                           (c.column.columnDef as { id?: string }).id;
                return cId === colId;
              });
              if (cell) {
                value = flexRender(col.cell, cell.getContext());
              }
            }

            return (
              <div key={colId} className="dt-expanded-item">
                <span className="dt-expanded-label">{header}</span>
                <span className="dt-expanded-value">
                  {value !== null && value !== undefined ? String(value) : "-"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Show all columns toggle
  const showAllColumns = () => {
    setVisibleColumnCount(regularColumns.length);
    setShowColumnMenu(false);
  };

  // Reset to auto columns
  const resetColumns = () => {
    setVisibleColumnCount(maxVisibleColumns);
    setShowColumnMenu(false);
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
      <div className="dt-empty">
        {emptyIcon && <div className="dt-empty-icon">{emptyIcon}</div>}
        <h3 className="dt-empty-title">{emptyTitle}</h3>
        {emptyDescription && (
          <p className="dt-empty-description">{emptyDescription}</p>
        )}
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
                onChange={(e) => setGlobalFilter(e.target.value)}
              />
            </div>
          )}

          {/* Column visibility toggle */}
          {regularColumns.length > maxVisibleColumns && (
            <div className="dt-column-toggle-wrapper">
              <button
                ref={columnBtnRef}
                className={`dt-column-toggle-btn ${hasHiddenColumns ? "has-hidden" : ""}`}
                onClick={() => setShowColumnMenu(!showColumnMenu)}
                title="Mostrar/ocultar columnas"
              >
                <Columns3 size={16} />
                <span className="dt-column-toggle-text">Columnas</span>
                {hasHiddenColumns && (
                  <span className="dt-column-hidden-badge">{hiddenColumns.length}</span>
                )}
                <ChevronDown size={14} className={showColumnMenu ? "rotated" : ""} />
              </button>

              {showColumnMenu && (
                <div ref={columnMenuRef} className="dt-column-menu">
                  <div className="dt-column-menu-header">
                    <span>Columnas ({visibleColumnCount} de {regularColumns.length})</span>
                  </div>
                  <div className="dt-column-menu-actions">
                    <button onClick={showAllColumns} className="dt-column-menu-btn">
                      <Check size={14} />
                      Mostrar todas
                    </button>
                    <button onClick={resetColumns} className="dt-column-menu-btn">
                      Ajustar auto
                    </button>
                  </div>
                  <div className="dt-column-menu-info">
                    {hasHiddenColumns && (
                      <p>Haz clic en ▶ en cada fila para ver las {hiddenColumns.length} columnas ocultas</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {headerAction && (
            <div className="dt-header-action">{headerAction}</div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="dt-container">
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
                        style={isExpandColumn ? { width: '40px' } : undefined}
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
                  <>
                    <tr key={row.id} className={row.getIsExpanded() ? "dt-row-expanded" : ""}>
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
                      <tr key={`${row.id}-expanded`} className="dt-expanded-row">
                        <td colSpan={finalColumns.length}>
                          {renderExpandedContent(row)}
                        </td>
                      </tr>
                    )}
                  </>
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
