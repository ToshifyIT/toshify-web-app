import * as fs from 'fs';
import * as path from 'path';

const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
  });
}

const URL = process.env.VITE_SUPABASE_URL || "";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function toTitleCase(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function isAllCaps(str: string): boolean {
  return str === str.toUpperCase() && str !== str.toLowerCase();
}

async function main() {
  // Cargar todos los conductores
  const res = await fetch(
    URL + "/rest/v1/conductores?select=id,nombres,apellidos",
    { headers: { "apikey": KEY, "Authorization": "Bearer " + KEY } }
  );
  const conductores = await res.json() as any[];

  console.log("🔍 Buscando conductores con nombres en MAYÚSCULAS...\n");

  const toFix = conductores.filter(c => 
    isAllCaps(c.nombres || "") || isAllCaps(c.apellidos || "")
  );

  console.log("Conductores a corregir: " + toFix.length + "\n");

  if (toFix.length === 0) {
    console.log("✅ Todos los nombres ya están bien formateados");
    return;
  }

  // Mostrar primeros 10
  console.log("Ejemplos:");
  for (const c of toFix.slice(0, 10)) {
    const newNombres = toTitleCase(c.nombres || "");
    const newApellidos = toTitleCase(c.apellidos || "");
    console.log("  " + c.nombres + " " + c.apellidos + " → " + newNombres + " " + newApellidos);
  }

  console.log("\n🔄 Actualizando...\n");

  let ok = 0, fail = 0;
  for (const c of toFix) {
    const newNombres = toTitleCase(c.nombres || "");
    const newApellidos = toTitleCase(c.apellidos || "");

    const patchRes = await fetch(
      URL + "/rest/v1/conductores?id=eq." + c.id,
      {
        method: "PATCH",
        headers: {
          "apikey": KEY,
          "Authorization": "Bearer " + KEY,
          "Content-Type": "application/json",
          "Prefer": "return=minimal"
        },
        body: JSON.stringify({
          nombres: newNombres,
          apellidos: newApellidos
        })
      }
    );

    if (patchRes.ok) {
      ok++;
    } else {
      fail++;
      console.log("❌ Error: " + c.nombres + " " + c.apellidos);
    }
  }

  console.log("\n✅ Corregidos: " + ok);
  console.log("❌ Fallidos: " + fail);
}

main();
