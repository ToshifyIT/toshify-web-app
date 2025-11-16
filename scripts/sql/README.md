# Scripts SQL - Reorganización de Menús

## Descripción

Este directorio contiene scripts SQL para actualizar el orden de los menús en la base de datos.

## Script: update_menu_order.sql

### Propósito
Reorganiza los menús principales de la aplicación según el nuevo orden establecido:

1. **Asignaciones** (order_index: 0)
2. **Conductores** (order_index: 1)
3. **Vehículos** (order_index: 2)
4. **Incidencias** (order_index: 3)
5. **Siniestros** (order_index: 4)
6. **Reportes** (order_index: 5)
7. **Integraciones** (order_index: 6)
8. **Administración** (order_index: 7)

### Cómo ejecutar el script

#### Opción 1: Desde Supabase Dashboard (Recomendado)

1. Accede a tu proyecto en [Supabase Dashboard](https://app.supabase.com)
2. Ve a la sección **SQL Editor** en el menú lateral
3. Haz clic en **New Query**
4. Copia y pega el contenido de `update_menu_order.sql`
5. Haz clic en **Run** para ejecutar el script
6. Verifica los resultados en la tabla que se muestra al final

#### Opción 2: Desde psql (Terminal)

Si tienes acceso directo a la base de datos:

```bash
# Conectarse a la base de datos
psql -h <host> -U <usuario> -d <base_de_datos>

# Ejecutar el script
\i scripts/sql/update_menu_order.sql
```

#### Opción 3: Usando Supabase CLI

```bash
# Asegúrate de tener Supabase CLI instalado y configurado
supabase db execute --file scripts/sql/update_menu_order.sql
```

### Cómo probar los cambios

#### 1. Verificación en Base de Datos

Ejecuta la siguiente consulta para verificar el orden:

```sql
SELECT name, label, order_index
FROM menus
ORDER BY order_index;
```

Deberías ver:

```
name           | label          | order_index
---------------|----------------|------------
asignaciones   | Asignaciones   | 0
conductores    | Conductores    | 1
vehiculos      | Vehículos      | 2
incidencias    | Incidencias    | 3
siniestros     | Siniestros     | 4
reportes       | Reportes       | 5
integraciones  | Integraciones  | 6
administracion | Administración | 7
```

#### 2. Verificación en la Aplicación

1. **Limpia la caché del navegador**:
   - Presiona `Ctrl + Shift + R` (Windows/Linux) o `Cmd + Shift + R` (Mac) para hacer un hard refresh
   - O abre las DevTools (F12) → Network → marca "Disable cache"

2. **Inicia sesión en la aplicación**:
   - Ve a `http://localhost:5173` (o tu URL de desarrollo)
   - Inicia sesión con tus credenciales

3. **Verifica el menú lateral**:
   - Revisa que los menús aparezcan en el siguiente orden:
     1. Asignaciones
     2. Conductores
     3. Vehículos
     4. Incidencias
     5. Siniestros
     6. Reportes
     7. Integraciones
     8. Administración

4. **Verifica que los submenús no cambiaron**:
   - Expande cada menú que tenga submenús
   - Confirma que los submenús mantienen su orden original

#### 3. Verificación en el Gestor de Menús

1. Navega a **Administración** → **Gestor de Menús**
2. Verifica que la columna "Orden" muestre los valores correctos
3. Los menús deben aparecer ordenados según el nuevo `order_index`

### Rollback

Si necesitas revertir los cambios, puedes ejecutar este script para restaurar un orden anterior:

```sql
-- Ejemplo: restaurar orden alfabético
UPDATE menus SET order_index = 0, updated_at = NOW() WHERE name = 'administracion';
UPDATE menus SET order_index = 1, updated_at = NOW() WHERE name = 'asignaciones';
UPDATE menus SET order_index = 2, updated_at = NOW() WHERE name = 'conductores';
UPDATE menus SET order_index = 3, updated_at = NOW() WHERE name = 'incidencias';
UPDATE menus SET order_index = 4, updated_at = NOW() WHERE name = 'integraciones';
UPDATE menus SET order_index = 5, updated_at = NOW() WHERE name = 'reportes';
UPDATE menus SET order_index = 6, updated_at = NOW() WHERE name = 'siniestros';
UPDATE menus SET order_index = 7, updated_at = NOW() WHERE name = 'vehiculos';
```

### Notas Importantes

- ✅ **Los submenús NO se ven afectados** por este script. Mantienen su orden original.
- ✅ El script actualiza automáticamente el campo `updated_at` para cada menú modificado.
- ✅ Los cambios son inmediatos una vez ejecutado el script.
- ⚠️ Asegúrate de tener un backup de la base de datos antes de ejecutar scripts SQL en producción.
- ⚠️ Si algún menú no existe en la base de datos, su UPDATE no afectará ningún registro (sin errores).

### Soporte

Si encuentras algún problema al ejecutar el script o verificar los cambios, por favor:

1. Verifica que los nombres de los menús en la base de datos coincidan exactamente con los del script
2. Asegúrate de tener permisos de escritura en la tabla `menus`
3. Revisa los logs de Supabase para ver si hay errores
