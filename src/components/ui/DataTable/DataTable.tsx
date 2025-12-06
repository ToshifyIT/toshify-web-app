// src/components/ui/DataTable/DataTable.tsx
/**
 * @fileoverview Componente DataTable reutilizable basado en TanStack Table v8.
 * Proporciona búsqueda global, ordenamiento, paginación y diseño responsive.
 *
 * @module components/ui/DataTable
 * @author Toshify Team
 * @version 1.0.0
 * @see {@link https://tanstack.com/table/v8} TanStack Table Documentation
 */

import { useState, useEffect, type ReactNode } from "react";
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
} from "@tanstack/react-table";
import "./DataTable.css";

/**
 * Props para el componente DataTable.
 *
 * @template T - Tipo de datos de cada fila de la tabla
 *
 * @example
 * ```tsx
 * interface User {
 *   id: string;
 *   name: string;
 * }
 *
 * const props: DataTableProps<User> = {
 *   data: users,
 *   columns: userColumns,
 *   searchPlaceholder: "Buscar usuarios...",
 *   pageSize: 20,
 * };
 * ```
 */
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
}

/**
 * Componente de tabla de datos reutilizable con búsqueda, ordenamiento y paginación.
 *
 * @template T - Tipo de datos de cada fila
 *
 * @param {DataTableProps<T>} props - Props del componente
 * @returns {JSX.Element} Tabla renderizada con controles
 *
 * @example
 * ```tsx
 * // Uso básico
 * <DataTable
 *   data={users}
 *   columns={columns}
 *   searchPlaceholder="Buscar usuarios..."
 * />
 * ```
 *
 * @example
 * ```tsx
 * // Con estados de carga y error
 * <DataTable
 *   data={products}
 *   columns={productColumns}
 *   loading={isLoading}
 *   error={errorMessage}
 *   emptyIcon={<PackageIcon />}
 *   emptyTitle="Sin productos"
 * />
 * ```
 *
 * @example
 * ```tsx
 * // Acceso a la instancia de tabla
 * const [table, setTable] = useState<Table<User> | null>(null);
 *
 * <DataTable
 *   data={users}
 *   columns={columns}
 *   onTableReady={setTable}
 * />
 *
 * // Luego usar table.getFilteredRowModel() para exportar, etc.
 * ```
 *
 * @throws {Error} Si columns está vacío y hay datos
 *
 * @see {@link DataTableProps} Para la definición completa de props
 * @see {@link https://tanstack.com/table/v8/docs/guide/column-defs} Para definir columnas
 */
export function DataTable<T>({
  data,
  columns,
  searchPlaceholder = "Buscar...",
  emptyIcon,
  emptyTitle = "No hay datos",
  emptyDescription = "",
  loading = false,
  error = null,
  pageSize = 10,
  pageSizeOptions = [10, 20, 30, 50],
  showSearch = true,
  showPagination = true,
  onTableReady,
  headerAction,
}: DataTableProps<T>) {
  const [globalFilter, setGlobalFilter] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);

  // Debounce search (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(globalFilter);
    }, 300);
    return () => clearTimeout(timer);
  }, [globalFilter]);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      globalFilter: debouncedSearch,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setDebouncedSearch,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
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
      {/* Header with Search and Action */}
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
          {headerAction && (
            <div className="dt-header-action">{headerAction}</div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="dt-container">
        <div className="dt-table-wrapper">
          <table className="dt-table">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      onClick={header.column.getToggleSortingHandler()}
                      className={header.column.getCanSort() ? "dt-sortable" : ""}
                    >
                      <div
                        className={`dt-header-content ${
                          header.id === "acciones" ? "dt-header-center" : ""
                        }`}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        {header.column.getCanSort() && (
                          <span className="dt-sort-indicator">
                            {{
                              asc: " \u2191",
                              desc: " \u2193",
                            }[header.column.getIsSorted() as string] ?? " \u2195"}
                          </span>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="dt-no-results">
                    No se encontraron resultados
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </td>
                    ))}
                  </tr>
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
