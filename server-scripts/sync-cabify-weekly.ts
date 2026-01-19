#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * Script Deno: Sincronización Semanal de Cabify
 * Sincroniza datos de la semana pasada completa (Domingo a Sábado)
 * CORREGIDO: Usa campos directos de la API y semana Dom-Sab como Cabify
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// =====================================================
// CONFIGURACIÓN
// =====================================================

const CABIFY_AUTH_URL = "https://cabify.com/auth/api/authorization";
const CABIFY_GRAPHQL_URL = "https://partners.cabify.com/api/graphql";

// CORREGIDO: IP correcta de Supabase
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

function formatDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}

// CORREGIDO: Semana Domingo-Sábado (como Cabify)
function getLastWeekDays() {
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0=Domingo, 6=Sábado

  // Encontrar el domingo de ESTA semana
  const thisSunday = new Date(now);
  thisSunday.setUTCDate(now.getUTCDate() - dayOfWeek);
  thisSunday.setUTCHours(0, 0, 0, 0);

  // Semana pasada: domingo anterior al thisSunday
  const lastSunday = new Date(thisSunday);
  lastSunday.setUTCDate(thisSunday.getUTCDate() - 7);

  // Sábado de semana pasada
  const lastSaturday = new Date(thisSunday);
  lastSaturday.setUTCDate(thisSunday.getUTCDate() - 1);
  lastSaturday.setUTCHours(23, 59, 59, 999);

  // Generar array de días
  const days: { start: string; end: string; label: string }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(lastSunday);
    d.setUTCDate(lastSunday.getUTCDate() + i);

    const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
    const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));

    days.push({
      start: start.toISOString(),
      end: end.toISOString(),
      label: formatDate(d),
    });
  }

  return {
    days,
    weekLabel: `${formatDate(lastSunday)} - ${formatDate(lastSaturday)}`,
  };
}

async function authenticateCabify(): Promise<string> {
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

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Auth failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.access_token;
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

    const driversRes = await fetch(CABIFY_GRAPHQL_URL, {
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

    const journeysRes = await fetch(CABIFY_GRAPHQL_URL, {
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

async function syncOneDay(supabase: any, token: string, companyIds: string[], startDate: string, endDate: string, label: string) {
  console.log(`\n--- Día: ${label} ---`);

  // Verificar si ya existe
  const { data: existing } = await supabase
    .from("cabify_historico")
    .select("id")
    .eq("fecha_inicio", startDate)
    .limit(1);

  if (existing && existing.length > 0) {
    console.log("  ⏭️ Ya existe, saltando...");
    return 0;
  }

  const dayRecords: any[] = [];

  for (const companyId of companyIds) {
    const drivers = await fetchAllDrivers(token, companyId);

    for (let i = 0; i < drivers.length; i += 50) {
      const batch = drivers.slice(i, i + 50);

      const batchResults = await Promise.all(
        batch.map(async (driver: any) => {
          try {
            // CORREGIDO: Query incluye rejected, dropOffs, connected
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

            const driverRes = await fetch(CABIFY_GRAPHQL_URL, {
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

            // CORREGIDO: Usar stats.connected directamente de la API
            const assignedSeconds = Number(stats.assigned || 0);
            const connectedSeconds = Number(stats.connected || 0);
            const horasConectadas = connectedSeconds / 3600;
            const tasaOcupacion = connectedSeconds > 0 ? (assignedSeconds / connectedSeconds) * 100 : 0;

            const accepted = Number(stats.accepted || 0);
            const missed = Number(stats.missed || 0);
            const offered = Number(stats.offered || 0);
            // CORREGIDO: Usar stats.rejected directamente de la API
            const rejected = Number(stats.rejected || 0);
            // CORREGIDO: Usar stats.dropOffs directamente de la API
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
            console.error(`Error procesando conductor ${driver.id}:`, error);
            return null;
          }
        })
      );

      dayRecords.push(...batchResults.filter((r) => r !== null));
    }
  }

  if (dayRecords.length > 0) {
    const { error: insertError } = await supabase.from("cabify_historico").insert(dayRecords);
    if (insertError) {
      console.error(`  ❌ Error guardando: ${insertError.message}`);
      return 0;
    }
    console.log(`  ✅ ${dayRecords.length} registros guardados`);
    return dayRecords.length;
  }

  console.log("  ⚠️ Sin registros para guardar");
  return 0;
}

// =====================================================
// MAIN
// =====================================================

async function main() {
  console.log("=== SYNC CABIFY WEEKLY ===", new Date().toISOString());

  const startTime = Date.now();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { days, weekLabel } = getLastWeekDays();
    console.log(`📅 Sincronizando semana: ${weekLabel}`);

    // Autenticar
    console.log("🔐 Autenticando con Cabify...");
    const token = await authenticateCabify();
    console.log("✅ Token OK");

    // Obtener compañías
    const companiesRes = await fetch(CABIFY_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query: `query { metafleetCompanies { companyIds } }` }),
    });
    const companiesJson = await companiesRes.json();
    const companyIds = companiesJson.data?.metafleetCompanies?.companyIds || [];
    console.log(`📊 Companias: ${companyIds.length}`);

    let totalRecords = 0;

    // Sincronizar día por día
    for (const day of days) {
      const count = await syncOneDay(supabase, token, companyIds, day.start, day.end, day.label);
      totalRecords += count;
    }

    const executionTimeMs = Date.now() - startTime;

    // Log de sync
    await supabase.from("cabify_sync_log").insert({
      sync_type: "weekly",
      period_start: days[0].start,
      period_end: days[days.length - 1].end,
      records_synced: totalRecords,
      status: "success",
      execution_time_ms: executionTimeMs,
    });

    console.log(`\n=== COMPLETADO: ${totalRecords} registros en ${(executionTimeMs / 1000).toFixed(1)}s ===`);
  } catch (error) {
    console.error("❌ Error:", error);

    const { days } = getLastWeekDays();
    await supabase.from("cabify_sync_log").insert({
      sync_type: "weekly",
      period_start: days[0].start,
      period_end: days[days.length - 1].end,
      records_synced: 0,
      status: "failed",
      error_message: error instanceof Error ? error.message : "Unknown error",
      execution_time_ms: Date.now() - startTime,
    });
  }
}

main().catch(console.error);
