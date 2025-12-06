# DataTable Component

Componente de tabla reutilizable basado en TanStack Table v8 con búsqueda global, ordenamiento, paginación y diseño responsive.

## Tabla de Contenidos

- [Instalación](#instalación)
- [Uso Básico](#uso-básico)
- [API Reference](#api-reference)
- [Ejemplos](#ejemplos)
- [Diagrama de Flujo](#diagrama-de-flujo)
- [Edge Cases](#edge-cases)
- [Análisis de Código](#análisis-de-código)

---

## Instalación

```tsx
import { DataTable } from "@/components/ui/DataTable";
import { type ColumnDef } from "@tanstack/react-table";
```

---

## Uso Básico

```tsx
interface User {
  id: string;
  name: string;
  email: string;
}

const columns: ColumnDef<User>[] = [
  { accessorKey: "name", header: "Nombre" },
  { accessorKey: "email", header: "Email" },
];

function MyComponent() {
  const [users, setUsers] = useState<User[]>([]);

  return (
    <DataTable
      data={users}
      columns={columns}
      searchPlaceholder="Buscar usuarios..."
    />
  );
}
```

---

## API Reference

### Props

| Prop | Tipo | Default | Descripción |
|------|------|---------|-------------|
| `data` | `T[]` | **required** | Array de datos a mostrar |
| `columns` | `ColumnDef<T>[]` | **required** | Definición de columnas TanStack |
| `searchPlaceholder` | `string` | `"Buscar..."` | Placeholder del input de búsqueda |
| `emptyIcon` | `ReactNode` | `undefined` | Icono para estado vacío |
| `emptyTitle` | `string` | `"No hay datos"` | Título para estado vacío |
| `emptyDescription` | `string` | `""` | Descripción para estado vacío |
| `loading` | `boolean` | `false` | Muestra spinner de carga |
| `error` | `string \| null` | `null` | Muestra mensaje de error |
| `pageSize` | `number` | `10` | Registros por página inicial |
| `pageSizeOptions` | `number[]` | `[10, 20, 30, 50]` | Opciones de tamaño de página |
| `showSearch` | `boolean` | `true` | Muestra barra de búsqueda |
| `showPagination` | `boolean` | `true` | Muestra controles de paginación |
| `onTableReady` | `(table: Table<T>) => void` | `undefined` | Callback cuando la tabla está lista |

---

## Ejemplos

### Con Estados de Carga y Error

```tsx
function ProductsTable() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProducts()
      .then(setProducts)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <DataTable
      data={products}
      columns={productColumns}
      loading={loading}
      error={error}
      emptyIcon={<PackageIcon size={48} />}
      emptyTitle="No hay productos"
      emptyDescription="Agregue un producto para comenzar"
    />
  );
}
```

### Con Columna de Acciones

```tsx
const columns: ColumnDef<User>[] = [
  { accessorKey: "name", header: "Nombre" },
  { accessorKey: "email", header: "Email" },
  {
    id: "acciones",
    header: "Acciones",
    enableSorting: false,
    cell: ({ row }) => (
      <div className="dt-actions">
        <button
          className="dt-btn-action dt-btn-view"
          onClick={() => handleView(row.original)}
        >
          <Eye size={16} />
        </button>
        <button
          className="dt-btn-action dt-btn-edit"
          onClick={() => handleEdit(row.original)}
        >
          <Edit2 size={16} />
        </button>
        <button
          className="dt-btn-action dt-btn-delete"
          onClick={() => handleDelete(row.original)}
        >
          <Trash2 size={16} />
        </button>
      </div>
    ),
  },
];
```

### Acceso a la Instancia de Tabla

```tsx
function AdvancedTable() {
  const [tableInstance, setTableInstance] = useState<Table<User> | null>(null);

  const exportToCSV = () => {
    if (!tableInstance) return;
    const filteredData = tableInstance.getFilteredRowModel().rows;
    // Export logic...
  };

  return (
    <>
      <button onClick={exportToCSV}>Exportar CSV</button>
      <DataTable
        data={users}
        columns={columns}
        onTableReady={setTableInstance}
      />
    </>
  );
}
```

### Personalización de Paginación

```tsx
<DataTable
  data={largeDataset}
  columns={columns}
  pageSize={25}
  pageSizeOptions={[25, 50, 100, 200]}
  showSearch={true}
  showPagination={true}
/>
```

---

## Diagrama de Flujo

```mermaid
flowchart TD
    A[DataTable Render] --> B{loading?}
    B -->|true| C[Mostrar Spinner]
    B -->|false| D{error?}
    D -->|true| E[Mostrar Error]
    D -->|false| F{data.length === 0?}
    F -->|true| G[Mostrar Estado Vacío]
    F -->|false| H[Renderizar Tabla]

    H --> I[Inicializar useReactTable]
    I --> J[Configurar Estados]
    J --> K{showSearch?}
    K -->|true| L[Renderizar Búsqueda]
    K -->|false| M[Omitir Búsqueda]

    L --> N[Input con Debounce 300ms]
    N --> O[Actualizar globalFilter]
    O --> P[Filtrar Datos]

    M --> Q[Renderizar Headers]
    P --> Q
    Q --> R{columna.getCanSort?}
    R -->|true| S[Agregar Indicador Sort]
    R -->|false| T[Header Simple]

    S --> U[Renderizar Filas]
    T --> U
    U --> V{rows.length > 0?}
    V -->|false| W[Mostrar "No results"]
    V -->|true| X[Map Rows → Cells]

    X --> Y{showPagination?}
    Y -->|true| Z[Renderizar Paginación]
    Y -->|false| AA[Fin]
    Z --> AA

    subgraph Pagination
        Z --> AB[Info: "Mostrando X de Y"]
        Z --> AC[Botones: << < > >>]
        Z --> AD[Select: Tamaño página]
    end

    subgraph Sorting
        Q --> AE[onClick Header]
        AE --> AF[Toggle Sort Direction]
        AF --> AG[Re-ordenar datos]
    end
```

---

## Edge Cases

### Cubiertos

| Edge Case | Manejo | Línea |
|-----------|--------|-------|
| Data vacía | Muestra estado empty con icono/título personalizables | L103-113 |
| Loading state | Muestra spinner animado | L86-93 |
| Error state | Muestra mensaje de error | L95-101 |
| Búsqueda sin resultados | Muestra "No se encontraron resultados" en tbody | L181-186 |
| Debounce búsqueda | 300ms delay para evitar re-renders excesivos | L52-57 |
| Columnas no ordenables | Verifica `getCanSort()` antes de mostrar indicador | L166 |
| Paginación deshabilitada | Botones disabled cuando no hay más páginas | L224, L231 |

### No Cubiertos (Recomendaciones)

| Edge Case | Riesgo | Solución Sugerida |
|-----------|--------|-------------------|
| `pageSizeOptions` vacío | Error runtime | Validar array no vacío |
| `pageIndex` fuera de rango | Mostrar página inexistente | Reset a página 0 cuando data cambia |
| Datasets muy grandes (>10k) | Performance degradada | Implementar virtualización |
| Columnas dinámicas | Re-render innecesario | Memoizar `columns` |
| Cambio de `data` reference | Re-render completo | Usar key o memoización |
| Accesibilidad | No cumple WCAG | Agregar aria-labels |

---

## Análisis de Código

### Memory Leaks y Performance

#### Problemas Identificados

1. **useEffect con `table` como dependencia** (L80-84)
   ```tsx
   useEffect(() => {
     if (onTableReady) {
       onTableReady(table);
     }
   }, [table, onTableReady]); // ⚠️ table cambia en cada render
   ```
   **Impacto**: `table` es una nueva instancia en cada render, causando llamadas innecesarias a `onTableReady`.

   **Solución**:
   ```tsx
   const tableRef = useRef(table);
   tableRef.current = table;

   useEffect(() => {
     if (onTableReady) {
       onTableReady(tableRef.current);
     }
   }, [onTableReady]);
   ```

2. **Debounce sin cancelación en unmount edge case**
   El timer se limpia correctamente, pero si el componente se desmonta durante la búsqueda, no hay cleanup del estado.

#### Performance Optimizations Recomendadas

```tsx
// Memoizar columnas en el componente padre
const columns = useMemo(() => [...], [dependencies]);

// Memoizar data si viene de transformaciones
const processedData = useMemo(() =>
  rawData.map(transform),
  [rawData]
);
```

### Violaciones SOLID

| Principio | Violación | Severidad | Recomendación |
|-----------|-----------|-----------|---------------|
| **S** - Single Responsibility | Componente maneja search, sort, pagination, render, states | Media | Extraer hooks: `useTableSearch`, `useTablePagination` |
| **O** - Open/Closed | Hard-coded check `header.id === "acciones"` (L159) | Baja | Usar prop `centerColumns?: string[]` |
| **L** - Liskov Substitution | N/A | - | - |
| **I** - Interface Segregation | Props interface es cohesiva | OK | - |
| **D** - Dependency Inversion | Import directo de CSS | Baja | Considerar CSS-in-JS o CSS modules |

### Inconsistencias de Estilo

| Issue | Ubicación | Estándar del Repo |
|-------|-----------|-------------------|
| Export default + named | L273 | Preferir solo named exports |
| `any` en ColumnDef | L18 | Usar generic `TValue` |
| Console logs en prod | N/A en DataTable | OK |
| Strings hardcodeados | L90, L98, etc. | Usar constantes/i18n |

---

## Clases CSS Disponibles

### Contenedores
- `.dt-wrapper` - Wrapper principal
- `.dt-container` - Contenedor de tabla
- `.dt-table-wrapper` - Wrapper con scroll horizontal

### Búsqueda
- `.dt-search-container` - Contenedor búsqueda
- `.dt-search-input` - Input de búsqueda
- `.dt-search-icon` - Icono lupa

### Tabla
- `.dt-table` - Tabla principal
- `.dt-sortable` - Header ordenable
- `.dt-header-content` - Contenido header
- `.dt-sort-indicator` - Indicador de orden

### Paginación
- `.dt-pagination` - Contenedor paginación
- `.dt-pagination-info` - Info "Mostrando X de Y"
- `.dt-pagination-controls` - Botones de control
- `.dt-pagination-btn` - Botón individual
- `.dt-pagination-select` - Select tamaño página

### Estados
- `.dt-loading` - Estado cargando
- `.dt-error` - Estado error
- `.dt-empty` - Estado vacío
- `.dt-no-results` - Sin resultados de búsqueda

### Acciones
- `.dt-actions` - Contenedor acciones
- `.dt-btn-action` - Botón acción base
- `.dt-btn-view` - Botón ver (purple)
- `.dt-btn-edit` - Botón editar (blue)
- `.dt-btn-delete` - Botón eliminar (red)

### Badges
- `.dt-badge` - Badge base
- `.dt-badge-green` / `.dt-badge-solid-green`
- `.dt-badge-blue` / `.dt-badge-solid-blue`
- `.dt-badge-yellow` / `.dt-badge-solid-yellow`
- `.dt-badge-red` / `.dt-badge-solid-red`
- `.dt-badge-gray` / `.dt-badge-solid-gray`

---

## Breakpoints Responsive

| Breakpoint | Dispositivo | Cambios |
|------------|-------------|---------|
| `1440px` | Laptop grande | Padding reducido |
| `1024px` | Tablet horizontal | Font-size menor |
| `768px` | Tablet vertical | Paginación vertical, min-width 600px |
| `480px` | Móvil | Touch targets 36px, font-size 11px |
| `360px` | Móvil pequeño | min-width 450px, font-size 10px |

---

## Changelog

### v1.0.0
- Implementación inicial con TanStack Table v8
- Búsqueda global con debounce
- Ordenamiento por columnas
- Paginación configurable
- Estados loading/error/empty
- Diseño responsive multi-resolución
