#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * Script Deno: Backfill histórico de Cabify
 * Sincroniza datos desde una fecha específica hasta hoy, día por día
 * CORREGIDO: Usa campos directos de la API (rejected, dropOffs, connected)
 *
 * Uso: deno run --allow-net --allow-env sync-cabify-backfill.ts [fecha_inicio]
 * Ejemplo: deno run --allow-net --allow-env sync-cabify-backfill.ts 2025-10-01
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// =====================================================
// CONFIGURACIÓN
// =====================================================

const CABIFY_AUTH_URL = "https://cabify.com/auth/api/authorization";
const CABIFY_GRAPHQL_URL = "https://partners.cabify.com/api/graphql";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "http://172.19.0.13:8000";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cabifyConfig = {
  clientId: Deno.env.get("CABIFY_CLIENT_ID")!,
  clientSecret: Deno.env.get("CABIFY_CLIENT_SECRET")!,
  username: Deno.env.get("CABIFY_USERNAME")!,
  password: Deno.env.get("CABIFY_PASSWORD")!,
};

// =====================================================
// HELPERS
// =====================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function generateDaysRange(startDateStr: string, endDate: Date): { start: string; end: string; label: string }[] {
  const days: { start: string; end: string; label: string }[] = [];
  const startDate = new Date(startDateStr + "T00:00:00.000Z");

  const current = new Date(startDate);
  while (current <= endDate) {
    const start = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate(), 0, 0, 0, 0));
    const end = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate(), 23, 59, 59, 999));

    days.push({
      start: start.toISOString(),
      end: end.toISOString(),
      label: formatDate(current),
    });

    current.setUTCDate(current.getUTCDate() + 1);
  }

  return days;
}

async function authenticateCabify(): Promise<string> {
  for (let attempt = 0; attempt <= 3; attempt++) {
    try {
      if (attempt > 0) {
        const delay = 2000 * Math.pow(2, attempt - 1);
        console.log(`  🔄 Reintento auth ${attempt}/3 - esperando ${delay / 1000}s...`);
        await sleep(delay);
      }

      const response = await fetch(CABIFY_AUTH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "password",
          client_id: cabifyConfig.clientId,
          client_secret: cabifyConfig.clientSecret,
          username: cabifyConfig.username,
          password: cabifyConfig.password,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return data.access_token;
      }

      if (response.status === 401 || response.status === 403) {
        throw new Error(`Auth failed: ${response.status}`);
      }
    } catch (error) {
      if (error instanceof Error && (error.message.includes("401") || error.message.includes("403"))) {
        throw error;
      }
    }
  }
  throw new Error("Auth failed after max retries");
}

async function fetchWithRetry(url: string, options: RequestInit): Promise<Response> {
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      if (attempt > 0) await sleep(1000 * Math.pow(2, attempt));
      const response = await fetch(url, options);
      if (response.status === 429) {
        await sleep(3000);
        continue;
      }
      return response;
    } catch {
      // retry
    }
  }
  throw new Error("Request failed after retries");
}

async function fetchAllDrivers(token: string, companyId: string): Promise<any[]> {
  const allDrivers: any[] = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const driversQuery = `
      query ($companyId: String!, $page: Int!, $perPage: Int!) {
        paginatedDrivers(page: $page, perPage: $perPage, companyId: $companyId, disabled: false) {
          page pages
          drivers { id name surname email nationalIdNumber driverLicense mobileNum mobileCc }
        }
      }
    `;

    const driversRes = await fetchWithRetry(CABIFY_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        query: driversQuery,
        variables: { companyId, page, perPage },
      }),
    });

    const driversJson = await driversRes.json();
    const paginatedDrivers = driversJson.data?.paginatedDrivers;

    if (!paginatedDrivers || !paginatedDrivers.drivers) break;

    allDrivers.push(...paginatedDrivers.drivers);

    if (page >= (paginatedDrivers.pages || 0) || paginatedDrivers.pages === 0) break;
    page++;
  }

  return allDrivers;
}

async function fetchAllJourneys(token: string, companyId: string, driverId: string, startDate: string, endDate: string): Promise<any[]> {
  const allJourneys: any[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const journeysQuery = `
      query ($companyId: String, $driverId: String!, $page: Int, $perPage: Int, $startAt: String!, $endAt: String!) {
        paginatedJourneys(companyId: $companyId, driverId: $driverId, page: $page, perPage: $perPage, startAt: $startAt, endAt: $endAt) {
          page pages
          journeys {
            id assetId finishReason paymentMethod
            totals { earningsTotal { amount currency } }
          }
        }
      }
    `;

    const journeysRes = await fetchWithRetry(CABIFY_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        query: journeysQuery,
        variables: { companyId, driverId, page, perPage, startAt: startDate, endAt: endDate },
      }),
    });

    const journeysJson = await journeysRes.json();
    const paginatedJourneys = journeysJson.data?.paginatedJourneys;

    if (!paginatedJourneys || !paginatedJourneys.journeys) break;

    allJourneys.push(...paginatedJourneys.journeys);

    if (page >= (paginatedJourneys.pages || 0) || paginatedJourneys.pages === 0) break;
    page++;
  }

  return allJourneys;
}

async function syncOneDay(
  supabase: any,
  token: string,
  companyIds: string[],
  startDate: string,
  endDate: string,
  label: string,
  dayIndex: number,
  totalDays: number
): Promise<{ records: number; skipped: boolean; error?: string }> {
  console.log(`\n[${dayIndex + 1}/${totalDays}] 📅 ${label}`);

  // Verificar si ya existe
  const { data: existing } = await supabase
    .from("cabify_historico")
    .select("id")
    .eq("fecha_inicio", startDate)
    .limit(1);

  if (existing && existing.length > 0) {
    console.log("  ⏭️ Ya existe, saltando...");
    return { records: 0, skipped: true };
  }

  const dayRecords: any[] = [];

  try {
    for (const companyId of companyIds) {
      const drivers = await fetchAllDrivers(token, companyId);

      for (let i = 0; i < drivers.length; i += 75) {
        const batch = drivers.slice(i, i + 75);

        const batchResults = await Promise.all(
          batch.map(async (driver: any) => {
            try {
              // Query con campos directos de la API
              const driverQuery = `
                query ($companyId: String, $driverId: String!, $startAt: DateTime!, $endAt: DateTime!) {
                  driver(id: $driverId, companyId: $companyId) {
                    name surname email nationalIdNumber mobileNum driverLicense
                    stats(startAt: $startAt, endAt: $endAt) {
                      accepted missed offered assigned available score
                      rejected dropOffs connected
                    }
                  }
                }
              `;

              const driverRes = await fetchWithRetry(CABIFY_GRAPHQL_URL, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                  query: driverQuery,
                  variables: { companyId, driverId: driver.id, startAt: startDate, endAt: endDate },
                }),
              });

              const driverData = await driverRes.json();
              const driverInfo = driverData.data?.driver;

              const journeys = await fetchAllJourneys(token, companyId, driver.id, startDate, endDate);

              const effectiveDriver = driverInfo || driver;
              const stats = driverInfo?.stats || {};

              // Usar campos directos de la API
              const assignedSeconds = Number(stats.assigned || 0);
              const connectedSeconds = Number(stats.connected || 0);
              const horasConectadas = connectedSeconds / 3600;
              const tasaOcupacion = connectedSeconds > 0 ? (assignedSeconds / connectedSeconds) * 100 : 0;

              const accepted = Number(stats.accepted || 0);
              const missed = Number(stats.missed || 0);
              const offered = Number(stats.offered || 0);
              const rejected = Number(stats.rejected || 0);
              const viajesFinalizados = Number(stats.dropOffs || 0);

              const totalConsidered = accepted + rejected + missed;
              const tasaAceptacion = totalConsidered > 0 ? (accepted / totalConsidered) * 100 : 0;

              let cobroEfectivoMinor = 0;
              let cobroAppMinor = 0;
              let gananciaTotalViajesMinor = 0;

              journeys.forEach((j: any) => {
                const hasEarnings = j.totals?.earningsTotal?.amount > 0;
                if (hasEarnings) {
                  const amt = Number(j.totals.earningsTotal.amount);
                  gananciaTotalViajesMinor += amt;
                  if (j.paymentMethod === "cash") cobroEfectivoMinor += amt;
                  else cobroAppMinor += amt;
                }
              });

              const hoursFormatted = Math.floor(horasConectadas);
              const minutesFormatted = Math.floor((horasConectadas - hoursFormatted) * 60);

              // Solo guardar si tiene DNI
              if (!effectiveDriver.nationalIdNumber) return null;

              return {
                cabify_driver_id: driver.id,
                cabify_company_id: companyId,
                nombre: effectiveDriver.name || "",
                apellido: effectiveDriver.surname || "",
                email: effectiveDriver.email || "",
                dni: effectiveDriver.nationalIdNumber || "",
                licencia: effectiveDriver.driverLicense || "",
                telefono_codigo: effectiveDriver.mobileCc || "",
                telefono_numero: effectiveDriver.mobileNum || "",
                vehiculo_id: "",
                vehiculo_patente: "",
                vehiculo_marca: "",
                vehiculo_modelo: "",
                vehiculo_completo: "",
                fecha_inicio: startDate,
                fecha_fin: endDate,
                viajes_finalizados: viajesFinalizados,
                viajes_rechazados: rejected,
                viajes_perdidos: missed,
                viajes_aceptados: accepted,
                viajes_ofrecidos: offered,
                score: stats.score || 0,
                tasa_aceptacion: Number(tasaAceptacion.toFixed(2)),
                tasa_ocupacion: Number(tasaOcupacion.toFixed(2)),
                horas_conectadas: Number(horasConectadas.toFixed(1)),
                horas_conectadas_formato: `${hoursFormatted}h ${minutesFormatted}m`,
                cobro_efectivo: Number((cobroEfectivoMinor / 100).toFixed(2)),
                cobro_app: Number((cobroAppMinor / 100).toFixed(2)),
                peajes: 0,
                ganancia_total: Number((gananciaTotalViajesMinor / 100).toFixed(2)),
                ganancia_por_hora:
                  horasConectadas > 0 ? Number(((gananciaTotalViajesMinor / 100) / horasConectadas).toFixed(2)) : 0,
                permiso_efectivo: "Desactivado",
                estado_conductor: "Activo",
              };
            } catch (error) {
              return null;
            }
          })
        );

        dayRecords.push(...batchResults.filter((r) => r !== null));
      }
    }

    if (dayRecords.length > 0) {
      // Insertar en batches de 100
      for (let i = 0; i < dayRecords.length; i += 100) {
        const batch = dayRecords.slice(i, i + 100);
        const { error: insertError } = await supabase.from("cabify_historico").insert(batch);
        if (insertError) {
          console.error(`  ❌ Error guardando batch: ${insertError.message}`);
        }
      }
      console.log(`  ✅ ${dayRecords.length} registros guardados`);
      return { records: dayRecords.length, skipped: false };
    }

    console.log("  ⚠️ Sin registros para este día");
    return { records: 0, skipped: false };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error(`  ❌ Error: ${msg}`);
    return { records: 0, skipped: false, error: msg };
  }
}

// =====================================================
// MAIN
// =====================================================

async function main() {
  // Fecha de inicio por defecto: 01-10-2025
  const startDateArg = Deno.args[0] || "2025-10-01";
  const endDate = new Date();
  endDate.setUTCDate(endDate.getUTCDate() - 1); // Hasta ayer

  console.log("=== SYNC CABIFY BACKFILL ===", new Date().toISOString());
  console.log(`📅 Desde: ${startDateArg}`);
  console.log(`📅 Hasta: ${formatDate(endDate)}`);

  const startTime = Date.now();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Generar rango de días
    const days = generateDaysRange(startDateArg, endDate);
    console.log(`📊 Total días a sincronizar: ${days.length}`);

    // Autenticar
    console.log("\n🔐 Autenticando con Cabify...");
    const token = await authenticateCabify();
    console.log("✅ Token OK");

    // Obtener compañías
    const companiesRes = await fetchWithRetry(CABIFY_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query: `query { metafleetCompanies { companyIds } }` }),
    });
    const companiesJson = await companiesRes.json();
    const companyIds = companiesJson.data?.metafleetCompanies?.companyIds || [];
    console.log(`📊 Compañías: ${companyIds.length}`);

    let totalRecords = 0;
    let skippedDays = 0;
    let errorDays = 0;

    // Sincronizar día por día
    for (let i = 0; i < days.length; i++) {
      const day = days[i];
      const result = await syncOneDay(supabase, token, companyIds, day.start, day.end, day.label, i, days.length);

      totalRecords += result.records;
      if (result.skipped) skippedDays++;
      if (result.error) errorDays++;

      // Pequeña pausa entre días para no sobrecargar la API
      if (i < days.length - 1 && !result.skipped) {
        await sleep(500);
      }
    }

    const executionTimeMs = Date.now() - startTime;
    const executionMins = (executionTimeMs / 60000).toFixed(1);

    // Log de sync
    await supabase.from("cabify_sync_log").insert({
      sync_type: "backfill",
      period_start: days[0].start,
      period_end: days[days.length - 1].end,
      records_synced: totalRecords,
      status: errorDays > 0 ? "partial" : "success",
      execution_time_ms: executionTimeMs,
    });

    console.log(`\n${"=".repeat(50)}`);
    console.log(`=== BACKFILL COMPLETADO ===`);
    console.log(`📊 Total registros: ${totalRecords}`);
    console.log(`📅 Días procesados: ${days.length - skippedDays}`);
    console.log(`⏭️ Días saltados: ${skippedDays}`);
    console.log(`❌ Días con error: ${errorDays}`);
    console.log(`⏱️ Tiempo: ${executionMins} minutos`);
    console.log(`${"=".repeat(50)}`);
  } catch (error) {
    console.error("❌ Error fatal:", error);
    Deno.exit(1);
  }
}

main().catch(console.error);
