// update-vehiculos.ts
// Script para actualizar vehículos desde datos del Excel
// Uso: deno run --allow-net --allow-env --allow-read update-vehiculos.ts

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// Mapeo de Estado Excel → estado_id en BD
const ESTADO_MAP: Record<string, string> = {
  "Jubilado": "5f309f21-da43-4d2c-98a9-d8e7ff908d33",
  "En Uso": "e3c572f5-b016-4cc3-9a53-9e2d79527108",
  "Taller Chapa": "ac16d1d9-a083-446b-9410-69d9601f1df6",
  "Robo": "a077307b-7e04-40d8-9334-fc52b3eb020b",
  "Destruccion": "d3df709d-76e0-48c1-83e8-8b182622bd35",
  "Pkg Off": "5522183a-49e6-4ed4-b7fe-c72f14451d50",
  "Pkg On": "f3dc8cca-45cd-4d46-aa28-72bde0ead8a8",
  "Taller Mecanico": "92f01dcb-416b-4216-9ac7-aeb845c52886",
  "Retenido": "2ebaca82-e503-4627-96a4-22cfffa54a86",
  "Corporativo": "368fca9e-3ba2-43eb-8cf2-6ceffb453901",
};

// Default para estados vacíos
const DEFAULT_ESTADO_ID = "e3c572f5-b016-4cc3-9a53-9e2d79527108"; // EN_USO

interface VehiculoExcel {
  Patente: string;
  Marca: string;
  Modelo: string;
  "Año": number;
  Color: string;
  "Tipo Vehículo": string;
  "Tipo GPS": string;
  "GPS USS": string;
  Traccar: string;
  Combustible: string;
  Motor: string | null;
  Chasis: string | null;
  Provisoria: string | null;
  Estado: string | null;
  "Seguro Número": string | null;
  Documentos: string | null;
}

async function updateVehiculo(v: VehiculoExcel): Promise<{ patente: string; success: boolean; error?: string }> {
  const estado = v.Estado?.trim() || "";
  const estadoId = ESTADO_MAP[estado] || DEFAULT_ESTADO_ID;

  const updateData: Record<string, unknown> = {
    marca: v.Marca?.trim() || null,
    modelo: v.Modelo?.trim() || null,
    anio: v["Año"] || null,
    color: v.Color?.trim() || null,
    tipo_vehiculo: v["Tipo Vehículo"]?.trim() || null,
    tipo_gps: v["Tipo GPS"]?.trim() || null,
    gps_uss: v["GPS USS"]?.toLowerCase() === "si",
    traccar: v.Traccar?.toLowerCase() === "si",
    tipo_combustible: v.Combustible?.trim() || null,
    numero_motor: v.Motor?.toString().trim() || null,
    numero_chasis: v.Chasis?.trim() || null,
    provisoria: v.Provisoria?.trim() || null,
    estado_id: estadoId,
    seguro_numero: v["Seguro Número"]?.trim() || null,
    documentos_urls: v.Documentos?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  // Remover valores null/undefined/empty excepto booleanos y estado_id
  const cleanData: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(updateData)) {
    if (key === "gps_uss" || key === "traccar" || key === "estado_id" || key === "updated_at") {
      cleanData[key] = val;
    } else if (val !== null && val !== undefined && val !== "") {
      cleanData[key] = val;
    }
  }

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/vehiculos?patente=eq.${encodeURIComponent(v.Patente)}`,
      {
        method: "PATCH",
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          "Prefer": "return=minimal",
        },
        body: JSON.stringify(cleanData),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      return { patente: v.Patente, success: false, error };
    }

    return { patente: v.Patente, success: true };
  } catch (err) {
    return { patente: v.Patente, success: false, error: String(err) };
  }
}

async function main() {
  console.log("🚗 Actualizando vehículos desde Excel...\n");
  console.log(`SUPABASE_URL: ${SUPABASE_URL}`);

  // Leer datos del JSON
  const jsonData = await Deno.readTextFile("./vehiculos_clean.json");
  const vehiculosData: VehiculoExcel[] = JSON.parse(jsonData);

  console.log(`Total vehículos a procesar: ${vehiculosData.length}\n`);

  let updated = 0;
  let failed = 0;
  const errors: { patente: string; error: string }[] = [];

  for (const v of vehiculosData) {
    const result = await updateVehiculo(v);
    if (result.success) {
      updated++;
      console.log(`✅ ${v.Patente} - ${v.Marca} ${v.Modelo} (${v.Estado || 'En Uso'})`);
    } else {
      failed++;
      errors.push({ patente: v.Patente, error: result.error || "Unknown error" });
      console.log(`❌ ${v.Patente} falló: ${result.error}`);
    }

    // Pequeña pausa para no saturar
    await new Promise(r => setTimeout(r, 50));
  }

  console.log("\n========================================");
  console.log(`✅ Actualizados: ${updated}`);
  console.log(`❌ Fallidos: ${failed}`);

  if (errors.length > 0) {
    console.log("\nErrores:");
    errors.forEach(e => console.log(`  - ${e.patente}: ${e.error}`));
  }
}

main();
