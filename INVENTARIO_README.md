# Sistema de Inventario - Toshify

## Resumen del Sistema

Este sistema de inventario maneja dos tipos de productos:
- **HERRAMIENTAS (retornables)**: Se asignan a conductores/vehículos y deben devolverse
- **REPUESTOS (consumibles)**: Se usan y desaparecen del inventario

## Módulos Implementados

### 1. Dashboard de Inventario
- **Archivo**: `src/modules/inventario/InventarioDashboardModule.tsx`
- **Ruta sugerida**: `/inventario/dashboard`
- **Funcionalidad**:
  - Vista general con totales por estado (disponible, en uso, en tránsito, dañado, perdido)
  - Filtros por tipo (herramientas/repuestos)
  - Tabla detallada de stock por producto

### 2. Gestión de Movimientos
- **Archivo**: `src/modules/inventario/MovimientosModule.tsx`
- **Ruta sugerida**: `/inventario/movimientos`
- **Funcionalidad**:
  - **Entrada**: Registrar compras/recepciones de productos
  - **Salida**: Consumo de repuestos
  - **Asignación**: Dar herramientas a conductores/vehículos
  - **Devolución**: Retorno de herramientas (con opción de marcar estado)
  - **Daño/Pérdida**: Cambiar estado de productos

### 3. Asignaciones Activas
- **Archivo**: `src/modules/inventario/AsignacionesActivasModule.tsx`
- **Ruta sugerida**: `/inventario/asignaciones-activas`
- **Funcionalidad**:
  - Ver todas las herramientas asignadas
  - Agrupadas por conductor
  - Información de fecha de asignación y ubicación

## Pasos para Implementar

### Paso 1: Ejecutar la Función SQL en Supabase

La función `procesar_movimiento_inventario` se encuentra en:
```
supabase/migrations/20251117130159_procesar_movimiento_inventario.sql
```

**Opciones para ejecutarla:**

#### Opción A: Usando la interfaz de Supabase
1. Ve a tu proyecto en https://supabase.com
2. Navega a SQL Editor
3. Copia y pega el contenido del archivo `supabase/migrations/20251117130159_procesar_movimiento_inventario.sql`
4. Ejecuta el script

#### Opción B: Usando Supabase CLI (si está configurado)
```bash
npx supabase db push
```

### Paso 2: Actualizar el Módulo de Productos

El módulo de productos actual necesita actualizarse para incluir:
- Campo `es_retornable` (checkbox)
- Campo `categoria_id` (select)

**Archivo a modificar**: `src/modules/productos/ProductosModule.tsx`

Cambios necesarios en el formulario de crear/editar:

```typescript
// Agregar al estado del formulario
const [formData, setFormData] = useState({
  // ... campos existentes
  es_retornable: false,
  categoria_id: ''
})

// Agregar en el formulario (después del campo estado_id):
<div>
  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
    <input
      type="checkbox"
      checked={formData.es_retornable}
      onChange={(e) => setFormData({ ...formData, es_retornable: e.target.checked })}
    />
    <span style={{ fontSize: '14px', fontWeight: 600 }}>
      Es retornable (herramienta)
    </span>
  </label>
  <p style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px' }}>
    Marcar si el producto se puede asignar a conductores y debe devolverse
  </p>
</div>

<div>
  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>
    Categoría *
  </label>
  <select
    value={formData.categoria_id}
    onChange={(e) => setFormData({ ...formData, categoria_id: e.target.value })}
    style={{
      width: '100%',
      padding: '10px',
      border: '1px solid #D1D5DB',
      borderRadius: '8px',
      fontSize: '14px'
    }}
  >
    <option value="">Seleccionar categoría...</option>
    {categorias.map((cat) => (
      <option key={cat.id} value={cat.id}>
        {cat.nombre}
      </option>
    ))}
  </select>
</div>
```

**Cargar categorías en useEffect**:
```typescript
const [categorias, setCategorias] = useState<Categoria[]>([])

useEffect(() => {
  loadCategorias()
}, [])

const loadCategorias = async () => {
  const { data } = await supabase
    .from('categorias')
    .select('*')
    .eq('activo', true)
    .order('nombre')
  if (data) setCategorias(data)
}
```

**Actualizar las funciones de crear/editar**:
```typescript
// En handleCreate y handleEdit, agregar a los datos:
es_retornable: formData.es_retornable,
categoria_id: formData.categoria_id
```

### Paso 3: Agregar Rutas en HomePage

**Archivo**: `src/pages/HomePage.tsx`

Agregar imports:
```typescript
import { InventarioDashboardPage } from './inventario/InventarioDashboardPage'
import { MovimientosPage } from './inventario/MovimientosPage'
import { AsignacionesActivasPage } from './inventario/AsignacionesActivasPage'
```

Agregar rutas (dentro de `<Routes>`):
```typescript
{/* Inventario */}
<Route path="/inventario/dashboard" element={
  <ProtectedRoute submenuName="inventario-dashboard" action="view">
    <InventarioDashboardPage />
  </ProtectedRoute>
} />
<Route path="/inventario/movimientos" element={
  <ProtectedRoute submenuName="inventario-movimientos" action="view">
    <MovimientosPage />
  </ProtectedRoute>
} />
<Route path="/inventario/asignaciones-activas" element={
  <ProtectedRoute submenuName="inventario-asignaciones" action="view">
    <AsignacionesActivasPage />
  </ProtectedRoute>
} />
```

### Paso 4: Configurar Menús en la Base de Datos

Necesitas crear los menús y submenús en Supabase:

```sql
-- 1. Crear menú principal (si no existe)
INSERT INTO menus (name, label, route, order_index, is_active)
VALUES ('gestion', 'Logística', '', 6, true)
ON CONFLICT (name) DO NOTHING;

-- 2. Obtener el ID del menú (reemplaza con el ID real de tu base de datos)
-- Asumiendo que el menú 'gestion' ya existe con el ID que mostraste en los logs:
-- '2f8cf81a-77c2-4e1e-b476-69b43de95abe'

-- 3. Crear submenús
INSERT INTO submenus (name, label, route, menu_id, order_index, is_active)
VALUES
  ('inventario-dashboard', 'Dashboard Inventario', '/inventario/dashboard', '2f8cf81a-77c2-4e1e-b476-69b43de95abe', 1, true),
  ('inventario-movimientos', 'Movimientos', '/inventario/movimientos', '2f8cf81a-77c2-4e1e-b476-69b43de95abe', 2, true),
  ('inventario-asignaciones', 'Asignaciones Activas', '/inventario/asignaciones-activas', '2f8cf81a-77c2-4e1e-b476-69b43de95abe', 3, true);

-- 4. Asignar permisos al rol admin (reemplaza con tu role_id)
-- Role admin ID: '0eea6ce8-cf07-47c9-82c0-8f0672446b27'
INSERT INTO role_submenu_permissions (role_id, submenu_id, can_view, can_create, can_edit, can_delete)
SELECT
  '0eea6ce8-cf07-47c9-82c0-8f0672446b27',
  id,
  true,
  true,
  true,
  true
FROM submenus
WHERE name IN ('inventario-dashboard', 'inventario-movimientos', 'inventario-asignaciones');
```

### Paso 5: Insertar Datos de Prueba (Opcional)

```sql
-- Insertar categorías
INSERT INTO categorias (codigo, nombre, descripcion, activo)
VALUES
  ('HERRAMIENTAS', 'Herramientas', 'Productos retornables asignables', true),
  ('REPUESTOS', 'Repuestos', 'Productos consumibles no retornables', true);

-- Insertar estados de productos
INSERT INTO productos_estados (codigo, descripcion, activo)
VALUES
  ('STOCK', 'En Stock', true),
  ('USO', 'En Uso', true),
  ('TRANSITO', 'En Tránsito', true);

-- Insertar unidades de medida
INSERT INTO unidades_medida (codigo, descripcion, activo)
VALUES
  ('UNI', 'Unidad', true),
  ('KG', 'Kilogramo', true),
  ('LT', 'Litro', true);

-- Insertar productos de ejemplo
INSERT INTO productos (
  codigo, nombre, descripcion, unidad_medida_id, estado_id,
  categoria_id, es_retornable, proveedor
)
SELECT
  'MART-001',
  'Martillo de Goma',
  'Martillo profesional de goma',
  (SELECT id FROM unidades_medida WHERE codigo = 'UNI' LIMIT 1),
  (SELECT id FROM productos_estados WHERE codigo = 'STOCK' LIMIT 1),
  (SELECT id FROM categorias WHERE codigo = 'HERRAMIENTAS' LIMIT 1),
  true,
  'Ferretería ABC'
WHERE NOT EXISTS (SELECT 1 FROM productos WHERE codigo = 'MART-001');

INSERT INTO productos (
  codigo, nombre, descripcion, unidad_medida_id, estado_id,
  categoria_id, es_retornable, proveedor
)
SELECT
  'FILT-001',
  'Filtro de Aceite',
  'Filtro de aceite universal',
  (SELECT id FROM unidades_medida WHERE codigo = 'UNI' LIMIT 1),
  (SELECT id FROM productos_estados WHERE codigo = 'STOCK' LIMIT 1),
  (SELECT id FROM categorias WHERE codigo = 'REPUESTOS' LIMIT 1),
  false,
  'Repuestos XYZ'
WHERE NOT EXISTS (SELECT 1 FROM productos WHERE codigo = 'FILT-001');
```

## Flujo de Uso del Sistema

### 1. Entrada de Stock
1. Ir a "Movimientos"
2. Seleccionar "Entrada"
3. Elegir producto y cantidad
4. Registrar (incrementa stock disponible)

### 2. Asignar Herramienta a Conductor
1. Ir a "Movimientos"
2. Seleccionar "Asignación"
3. Elegir herramienta (debe ser retornable)
4. Seleccionar conductor o vehículo
5. Registrar (mueve de disponible a en_uso)

### 3. Devolución de Herramienta
1. Ir a "Movimientos"
2. Seleccionar "Devolución"
3. Elegir herramienta
4. Seleccionar conductor que devuelve
5. Indicar estado (disponible, dañado, perdido)
6. Registrar (mueve de en_uso a estado seleccionado)

### 4. Consumo de Repuesto
1. Ir a "Movimientos"
2. Seleccionar "Salida"
3. Elegir repuesto
4. Indicar cantidad consumida
5. Registrar (reduce stock disponible permanentemente)

### 5. Ver Asignaciones Activas
1. Ir a "Asignaciones Activas"
2. Ver todas las herramientas asignadas por conductor
3. Filtrar por conductor o producto

### 6. Dashboard
1. Ir a "Dashboard Inventario"
2. Ver totales por estado
3. Filtrar por tipo (herramientas/repuestos)
4. Ver stock detallado de cada producto

## Reglas de Negocio Implementadas

1. ✅ Solo herramientas (`es_retornable=true`) pueden asignarse a conductores/vehículos
2. ✅ Los repuestos solo se pueden usar con movimientos de entrada/salida
3. ✅ Stock en tránsito NO cuenta en el total real
4. ✅ Todos los movimientos se registran en la tabla `movimientos`
5. ✅ Las cantidades en inventario nunca pueden ser negativas (validado en SQL)
6. ✅ Las transacciones son atómicas (todo-o-nada)

## Archivos Creados

```
src/
├── modules/
│   └── inventario/
│       ├── InventarioDashboardModule.tsx
│       ├── MovimientosModule.tsx
│       └── AsignacionesActivasModule.tsx
├── pages/
│   └── inventario/
│       ├── InventarioDashboardPage.tsx
│       ├── MovimientosPage.tsx
│       └── AsignacionesActivasPage.tsx

supabase/
├── migrations/
│   └── 20251117130159_procesar_movimiento_inventario.sql
└── functions/
    └── procesar_movimiento_inventario.sql
```

## Próximos Pasos (Opcional)

1. **Historial de Movimientos**: Crear una vista para ver todos los movimientos con filtros por fecha, producto, conductor, tipo, etc.

2. **Reportes**: Crear reportes de:
   - Consumo de repuestos por período
   - Herramientas más asignadas
   - Conductores con más herramientas
   - Productos con más pérdidas/daños

3. **Alertas**: Implementar alertas cuando:
   - Stock disponible bajo
   - Herramientas asignadas por mucho tiempo
   - Productos dañados acumulados

4. **Códigos de Barras/QR**: Agregar lectura de códigos para agilizar operaciones

5. **Firmas Digitales**: Capturar firma del conductor al asignar/devolver

## Solución de Problemas

### Error: "Cannot find project ref"
Esto significa que Supabase CLI no está vinculado al proyecto. Ejecuta la función SQL manualmente en el SQL Editor de Supabase.

### Error: "Stock insuficiente"
Verifica que hay stock disponible antes de hacer una salida/asignación. Revisa en el Dashboard.

### Error: "Solo las herramientas pueden ser asignadas"
Asegúrate de que el producto tiene `es_retornable=true` en la base de datos.

### No aparecen los menús en el sidebar
Verifica que:
1. Los submenús están creados en la tabla `submenus`
2. El usuario/rol tiene permisos en `role_submenu_permissions`
3. Los submenús están activos (`is_active=true`)

## Soporte

Para más información sobre el sistema, revisa:
- Código de la función SQL: `supabase/migrations/20251117130159_procesar_movimiento_inventario.sql`
- Estructura de tablas definida en las instrucciones originales
- Logs de consola del navegador (F12) para debugging

---

**Desarrollado para Toshify** 🚚
