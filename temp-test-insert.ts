import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL") || "http://172.19.0.13:8000";
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

console.log("URL:", url);
console.log("Key defined:", key ? "YES" : "NO");
console.log("Key starts with:", key?.substring(0, 30));

if (!key) {
  console.error("No key!");
  Deno.exit(1);
}

const supabase = createClient(url, key);

const testData = {
  cabify_driver_id: "test_" + Date.now(),
  cabify_company_id: "test_company",
  nombre: "Test",
  apellido: "User",
  email: "test@test.com",
  dni: "12345678",
  fecha_inicio: "2025-10-01T00:00:00.000Z",
  fecha_fin: "2025-10-01T23:59:59.999Z",
  viajes_finalizados: 5,
  viajes_rechazados: 1,
  viajes_perdidos: 2,
  viajes_aceptados: 3,
  viajes_ofrecidos: 10,
  score: 4.5,
  tasa_aceptacion: 50.0,
  tasa_ocupacion: 60.0,
  horas_conectadas: 8.5,
  horas_conectadas_formato: "8h 30m",
  cobro_efectivo: 100.0,
  cobro_app: 200.0,
  peajes: 0,
  ganancia_total: 300.0,
  ganancia_por_hora: 35.29,
  permiso_efectivo: "Desactivado",
  estado_conductor: "Activo"
};

console.log("\nInserting test data...");
const { data, error } = await supabase.from("cabify_historico").insert([testData]).select();

console.log("Insert result - Data:", JSON.stringify(data, null, 2));
console.log("Insert result - Error:", JSON.stringify(error, null, 2));

const { count } = await supabase.from("cabify_historico").select("*", { count: "exact", head: true });
console.log("\nTotal count in table:", count);
