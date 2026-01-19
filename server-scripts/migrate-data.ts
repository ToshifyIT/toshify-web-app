#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * Script para migrar datos de Supabase Cloud a Self-Hosted
 */

// Configuración Cloud (origen)
const CLOUD_URL = "https://beuuxepwljaljkprypey.supabase.co";
const CLOUD_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJldXV4ZXB3bGphbGprcHJ5cGV5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczMDc1OTM2MSwiZXhwIjoyMDQ2MzM1MzYxfQ.TbSOouL6zuLsmjJBrKAdGU8IuPrus2lCW5-wQaVIT_k";

// Configuración Self-Hosted (destino)
const SELF_URL = Deno.env.get("SUPABASE_URL") || "https://supabase.toshify.com.ar";
const SELF_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// Tablas a migrar en orden (respetando foreign keys)
const TABLES_TO_MIGRATE = [
  // Tablas de referencia primero
  "roles",
  "menus",
  "submenus",
  "nacionalidades",
  "estados_civiles",
  "licencias_tipos",
  "licencias_estados",
  "licencias_categorias",
  "conductores_estados",
  "combustibles_tipos",
  "gps_tipos",
  "horarios_conduccion",
  "vehiculos_tipos",
  "vehiculos_estados",
  "categorias",
  "unidades_medida",
  "productos_estados",
  "proveedores",
  // Tablas principales
  "user_profiles",
  "conductores",
  "vehiculos",
  "productos",
  // Tablas de relación
  "role_menu_permissions",
  "role_submenu_permissions",
  "user_menu_permissions",
  "user_submenu_permissions",
  "conductores_licencias_categorias",
  "conductores_licencias_tipos",
  "productos_proveedores",
  // Tablas de operación
  "asignaciones",
  "asignaciones_conductores",
  "inventario",
  "movimientos",
  "pedidos_inventario",
  "pedido_items",
  "vehiculo_control",
  "vehiculos_turnos_ocupados",
  // Tablas de sync (Cabify, USS, Wialon)
  "cabify_historico",
  "cabify_sync_log",
  "cabify_sync_status",
  "uss_historico",
  "uss_excesos_velocidad",
  "uss_sync_log",
  "uss_sync_status",
  "wialon_bitacora",
  "wialon_bitacora_sync_log",
];

async function fetchFromCloud(table: string): Promise<any[]> {
  const response = await fetch(`${CLOUD_URL}/rest/v1/${table}?select=*`, {
    headers: {
      "apikey": CLOUD_SERVICE_KEY,
      "Authorization": `Bearer ${CLOUD_SERVICE_KEY}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Error fetching ${table}: ${response.status} - ${error}`);
  }

  return response.json();
}

async function insertToSelfHosted(table: string, data: any[]): Promise<number> {
  if (data.length === 0) {
    return 0;
  }

  // Insertar en lotes de 50
  const batchSize = 50;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);

    const response = await fetch(`${SELF_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        "apikey": SELF_SERVICE_KEY,
        "Authorization": `Bearer ${SELF_SERVICE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "resolution=ignore-duplicates,return=minimal",
      },
      body: JSON.stringify(batch),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`  Error en lote ${i}-${i+batch.length}: ${error}`);
      errors++;
    } else {
      inserted += batch.length;
    }
  }

  return inserted;
}

async function migrateTable(table: string): Promise<{ table: string; success: boolean; count: number; error?: string }> {
  console.log(`\n📦 Migrando ${table}...`);

  try {
    const data = await fetchFromCloud(table);
    console.log(`  📥 ${data.length} registros obtenidos de Cloud`);

    if (data.length === 0) {
      return { table, success: true, count: 0 };
    }

    const inserted = await insertToSelfHosted(table, data);
    console.log(`  📤 ${inserted} registros insertados en Self-Hosted`);

    return { table, success: true, count: inserted };
  } catch (error) {
    console.error(`  ❌ Error: ${error.message}`);
    return { table, success: false, count: 0, error: error.message };
  }
}

async function main() {
  console.log("===========================================");
  console.log("🚀 MIGRACIÓN DE DATOS CLOUD → SELF-HOSTED");
  console.log("===========================================");
  console.log(`Cloud: ${CLOUD_URL}`);
  console.log(`Self-Hosted: ${SELF_URL}`);
  console.log("");

  if (!SELF_SERVICE_KEY) {
    console.error("❌ ERROR: Falta SUPABASE_SERVICE_ROLE_KEY");
    console.log("Ejecuta con: SUPABASE_SERVICE_ROLE_KEY=<key> deno run --allow-net --allow-env migrate-data.ts");
    Deno.exit(1);
  }

  const startTime = Date.now();
  const results: { table: string; success: boolean; count: number; error?: string }[] = [];

  for (const table of TABLES_TO_MIGRATE) {
    const result = await migrateTable(table);
    results.push(result);
  }

  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(1);

  console.log("\n===========================================");
  console.log("📊 RESUMEN DE MIGRACIÓN");
  console.log("===========================================");

  let totalSuccess = 0;
  let totalRecords = 0;
  let totalErrors = 0;

  for (const r of results) {
    if (r.success) {
      if (r.count > 0) {
        console.log(`✅ ${r.table}: ${r.count} registros`);
        totalRecords += r.count;
      }
      totalSuccess++;
    } else {
      console.log(`❌ ${r.table}: ${r.error}`);
      totalErrors++;
    }
  }

  console.log("");
  console.log(`⏱️  Tiempo total: ${duration}s`);
  console.log(`📊 Tablas: ${totalSuccess} exitosas, ${totalErrors} con errores`);
  console.log(`📝 Total registros: ${totalRecords}`);
  console.log("===========================================");
}

main().catch(console.error);