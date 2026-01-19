#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * Script para sincronizar datos de Supabase Cloud a Self-Hosted
 */

// Configuración Cloud (origen)
const CLOUD_URL = "https://bvnqxfprojsjgpgomqmt.supabase.co";
const CLOUD_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2bnF4ZnByb2pzamdwZ29tcW10Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyOTkwMDE5MCwiZXhwIjoyMDQ1NDc2MTkwfQ.UwsG0w5mJjj10hILvLRsLOLZgHOJWVMFLRYiQCl9XyM";

// Configuración Self-Hosted (destino)
const SELF_URL = "https://supabase.toshify.com.ar";
const SELF_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const TABLES_TO_SYNC = [
  "conductores",
  "asignaciones",
  "asignaciones_conductores",
  "productos",
  "inventario",
  "movimientos",
  "pedidos_inventario",
  "pedido_items",
];

async function fetchFromCloud(table: string) {
  const response = await fetch(`${CLOUD_URL}/rest/v1/${table}?select=*`, {
    headers: {
      "apikey": CLOUD_SERVICE_KEY,
      "Authorization": `Bearer ${CLOUD_SERVICE_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Error fetching ${table}: ${response.status}`);
  }

  return response.json();
}

async function insertToSelfHosted(table: string, data: any[]) {
  if (data.length === 0) {
    console.log(`  No hay datos para ${table}`);
    return 0;
  }

  // Insertar en lotes de 100
  const batchSize = 100;
  let inserted = 0;

  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);

    const response = await fetch(`${SELF_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        "apikey": SELF_SERVICE_KEY,
        "Authorization": `Bearer ${SELF_SERVICE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "resolution=ignore-duplicates",
      },
      body: JSON.stringify(batch),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`  Error insertando lote en ${table}: ${error}`);
    } else {
      inserted += batch.length;
      console.log(`  Insertados ${inserted}/${data.length} registros`);
    }
  }

  return inserted;
}

async function syncTable(table: string) {
  console.log(`\nSincronizando ${table}...`);

  try {
    const data = await fetchFromCloud(table);
    console.log(`  Obtenidos ${data.length} registros de Cloud`);

    const inserted = await insertToSelfHosted(table, data);
    console.log(`  Completado: ${inserted} registros sincronizados`);

    return { table, success: true, count: inserted };
  } catch (error) {
    console.error(`  Error: ${error.message}`);
    return { table, success: false, error: error.message };
  }
}

async function main() {
  console.log("=== SINCRONIZACION DE DATOS ===");
  console.log(`Cloud: ${CLOUD_URL}`);
  console.log(`Self-Hosted: ${SELF_URL}`);

  if (!SELF_SERVICE_KEY) {
    console.error("ERROR: Falta SUPABASE_SERVICE_ROLE_KEY");
    Deno.exit(1);
  }

  const results = [];

  for (const table of TABLES_TO_SYNC) {
    const result = await syncTable(table);
    results.push(result);
  }

  console.log("\n=== RESUMEN ===");
  for (const r of results) {
    if (r.success) {
      console.log(`✅ ${r.table}: ${r.count} registros`);
    } else {
      console.log(`❌ ${r.table}: ${r.error}`);
    }
  }
}

main();
