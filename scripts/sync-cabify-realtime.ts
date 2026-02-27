#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * Script Deno: Sincronización en Tiempo Real de Cabify
 * Sincroniza datos del día actual (00:00 UTC hasta ahora)
 * CORREGIDO: Usa campos directos de la API (rejected, dropOffs, connected)
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

function getWeekRange() {
  // La API de Cabify devuelve datos DISTINTOS para consulta semanal vs diaria.
  // La consulta semanal coincide con el portal web de Cabify.
  // Por eso consultamos LUNES-a-AHORA siempre.
  const ART = "-03:00";

  // Calcular "ahora" en Argentina (UTC-3)
  const now = new Date();
  const nowART = new Date(now.getTime() - 3 * 3600000);
  const todayStr = nowART.toISOString().split("T")[0];
  const nowTime = now.toISOString().split("T")[1].replace("Z", "");

  // Calcular lunes de esta semana en Argentina
  const dayOfWeek = nowART.getUTCDay(); // 0=dom, 1=lun, ...
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(nowART);
  monday.setUTCDate(monday.getUTCDate() - daysFromMonday);
  const mondayStr = monday.toISOString().split("T")[0];

  // Domingo de esta semana
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  const sundayStr = sunday.toISOString().split("T")[0];

  return {
    apiStart: mondayStr + "T00:00:00.000" + ART,
    apiEnd: todayStr + "T" + nowTime + ART,
    // DB: un registro por conductor por semana, fecha_inicio = lunes
    dbFechaInicio: mondayStr + "T00:00:00.000Z",
    dbFechaFin: sundayStr + "T23:59:59.999Z",
    // Rango para limpiar registros per-dia viejos
    cleanupStart: mondayStr + "T00:00:00.000Z",
    cleanupEnd: sundayStr + "T23:59:59.999Z",
    label: `Semana ${mondayStr} a ${todayStr}`,
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

async function fetchTollsForDriver(token: string, companyId: string, driverId: string, startAt: string, endAt: string): Promise<number> {
  try {
    const balancesRes = await fetch(CABIFY_GRAPHQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        query: `query ($companyId: String) { balances(companyId: $companyId) { id } }`,
        variables: { companyId },
      }),
    });
    const balancesData = await balancesRes.json();
    const balances = balancesData.data?.balances || [];
    if (balances.length === 0) return 0;

    let totalTolls = 0;
    for (const balance of balances.slice(0, 3)) {
      try {
        const movRes = await fetch(CABIFY_GRAPHQL_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            query: `query ($balanceId: String!, $companyId: String, $driverId: String, $startAt: DateTime!, $endAt: DateTime!) {
              paginatedBalanceMovements(balanceId: $balanceId, companyId: $companyId, driverId: $driverId, startAt: $startAt, endAt: $endAt, page: 1, perPage: 500) {
                movements { breakdown { name value } }
              }
            }`,
            variables: { balanceId: balance.id, companyId, driverId, startAt, endAt },
          }),
        });
        const movData = await movRes.json();
        for (const mov of (movData.data?.paginatedBalanceMovements?.movements || [])) {
          for (const b of (mov.breakdown || [])) {
            if (b.name === "supplement:toll") totalTolls += Math.abs(b.value || 0);
          }
        }
      } catch (_e) { /* skip */ }
    }
    return totalTolls / 100;
  } catch (_e) { return 0; }
}

async function getCabifyData(token: string, startDate: string, endDate: string) {
  const companiesQuery = `query { metafleetCompanies { companyIds } }`;
  const companiesRes = await fetch(CABIFY_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query: companiesQuery }),
  });

  const companiesJson = await companiesRes.json();
  const companyIds = companiesJson.data?.metafleetCompanies?.companyIds || [];

  if (companyIds.length === 0) {
    throw new Error("No companies found");
  }

  console.log(`Companias: ${companyIds.length}`);
  const allDriversData: any[] = [];

  let totalDriversFromAPI = 0;
  let failedDrivers = 0;

  for (const companyId of companyIds) {
    const drivers = await fetchAllDrivers(token, companyId);
    if (drivers.length > 0) {
      totalDriversFromAPI += drivers.length;
    }

    for (let i = 0; i < drivers.length; i += 10) {
      const batch = drivers.slice(i, i + 10);

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
                  preferences {
                    name
                    enabled
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

            const [journeys, peajesAmount] = await Promise.all([
              fetchAllJourneys(token, companyId, driver.id, startDate, endDate),
              fetchTollsForDriver(token, companyId, driver.id, startDate, endDate),
            ]);

            const effectiveDriver = driverInfo || driver;
            const stats = driverInfo?.stats || {};
            const preferences = driverInfo?.preferences || [];
            const cashPref = preferences.find((p: any) => p.name === 'payment_cash');
            const permisoEfectivo = cashPref?.enabled ? 'Activado' : 'Desactivado';

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

            return {
              cabify_driver_id: driver.id,
              cabify_company_id: companyId,
              nombre: effectiveDriver.name || "",
              apellido: effectiveDriver.surname || "",
              email: effectiveDriver.email || "",
              dni: effectiveDriver.nationalIdNumber || `CABIFY_${driver.id}`,
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
              peajes: peajesAmount,
              ganancia_total: Number((gananciaTotalViajesMinor / 100).toFixed(2)),
              ganancia_por_hora:
                horasConectadas > 0 ? Number(((gananciaTotalViajesMinor / 100) / horasConectadas).toFixed(2)) : 0,
              permiso_efectivo: permisoEfectivo,
              estado_conductor: "Activo",
            };
          } catch (error) {
            failedDrivers++;
            console.error(`❌ Falló conductor ${driver.id}:`, error instanceof Error ? error.message : error);
            return null;
          }
        })
      );

      allDriversData.push(...batchResults.filter((r) => r !== null));
    }
  }

  console.log(`📊 Drivers API: ${totalDriversFromAPI}, OK: ${allDriversData.length}, Fallidos: ${failedDrivers}`);
  return allDriversData;
}

// =====================================================
// MAIN
// =====================================================

async function main() {
  console.log("=== SYNC CABIFY SEMANAL REALTIME ===", new Date().toISOString());

  const startTime = Date.now();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { apiStart, apiEnd, dbFechaInicio, dbFechaFin, cleanupStart, cleanupEnd, label } = getWeekRange();
    console.log(`📅 Sincronizando: ${label}`);
    console.log(`   API rango: ${apiStart} → ${apiEnd}`);
    console.log(`   DB semana: ${dbFechaInicio} → ${dbFechaFin}`);

    // Autenticar
    console.log("🔐 Autenticando con Cabify...");
    const token = await authenticateCabify();
    console.log("✅ Token OK");

    // Consultar datos con hora Argentina (-03:00) para la SEMANA COMPLETA
    console.log("🔄 Consultando datos de Cabify (semana completa)...");
    const driversData = await getCabifyData(token, apiStart, apiEnd);
    console.log(`✅ ${driversData.length} conductores obtenidos`);

    // Sobrescribir fechas: un registro por conductor por semana
    for (const d of driversData) {
      d.fecha_inicio = dbFechaInicio;
      d.fecha_fin = dbFechaFin;
    }

    // PASO 1: Limpiar registros per-dia viejos de esta semana
    // (los que NO tienen fecha_inicio = lunes, o sea registros de sync viejo)
    const { data: oldRecords } = await supabase
      .from("cabify_historico")
      .select("id,fecha_inicio")
      .gte("fecha_inicio", cleanupStart)
      .lte("fecha_inicio", cleanupEnd)
      .neq("fecha_inicio", dbFechaInicio);

    if (oldRecords && oldRecords.length > 0) {
      const oldIds = oldRecords.map((r: any) => r.id);
      console.log(`🧹 Limpiando ${oldIds.length} registros per-dia viejos de esta semana...`);
      for (let i = 0; i < oldIds.length; i += 100) {
        const batch = oldIds.slice(i, i + 100);
        await supabase.from("cabify_historico").delete().in("id", batch);
      }
    }

    // PASO 2: Obtener registros semanales existentes (fecha_inicio = lunes)
    const { data: existing } = await supabase
      .from("cabify_historico")
      .select("id,cabify_driver_id")
      .eq("fecha_inicio", dbFechaInicio);

    const existingMap = new Map<string, string>();
    for (const r of (existing || [])) {
      existingMap.set(r.cabify_driver_id, r.id);
    }

    const toInsert: any[] = [];
    const toUpdate: any[] = [];

    for (const d of driversData) {
      const existingId = existingMap.get(d.cabify_driver_id);
      if (existingId) {
        toUpdate.push({ ...d, id: existingId });
      } else {
        toInsert.push(d);
      }
    }

    // UPDATE existentes (con datos frescos de la semana)
    if (toUpdate.length > 0) {
      for (let i = 0; i < toUpdate.length; i += 50) {
        const batch = toUpdate.slice(i, i + 50);
        for (const record of batch) {
          const { id, ...data } = record;
          await supabase.from("cabify_historico").update(data).eq("id", id);
        }
      }
    }

    // INSERT nuevos
    if (toInsert.length > 0) {
      for (let i = 0; i < toInsert.length; i += 100) {
        const batch = toInsert.slice(i, i + 100);
        const { error: insertError } = await supabase.from("cabify_historico").insert(batch);
        if (insertError) console.error(`❌ Error insert:`, insertError.message);
      }
    }

    // PASO 3: Limpiar registros stale del lunes (drivers que ya no están en la API)
    const syncedDriverIds = new Set(driversData.map((d: any) => d.cabify_driver_id));
    const staleRecords = (existing || []).filter((r: any) => !syncedDriverIds.has(r.cabify_driver_id));
    if (staleRecords.length > 0) {
      const staleIds = staleRecords.map((r: any) => r.id);
      console.log(`🧹 Eliminando ${staleIds.length} registros stale (drivers ya no en API)...`);
      for (let i = 0; i < staleIds.length; i += 100) {
        const batch = staleIds.slice(i, i + 100);
        await supabase.from("cabify_historico").delete().in("id", batch);
      }
    }

    const totalNow = toUpdate.length + toInsert.length;
    console.log(`✅ ${toUpdate.length} actualizados, ${toInsert.length} nuevos = ${totalNow} total`);
    if (oldRecords && oldRecords.length > 0) {
      console.log(`🧹 ${oldRecords.length} registros per-dia eliminados`);
    }
    if (staleRecords.length > 0) {
      console.log(`🧹 ${staleRecords.length} registros stale eliminados`);
    }

    const executionTimeMs = Date.now() - startTime;

    // Log de sync
    await supabase.from("cabify_sync_log").insert({
      sync_type: "realtime-weekly",
      period_start: apiStart,
      period_end: apiEnd,
      records_synced: driversData.length,
      status: "success",
      execution_time_ms: executionTimeMs,
    });

    console.log(`\n=== COMPLETADO en ${(executionTimeMs / 1000).toFixed(1)}s ===`);
  } catch (error) {
    console.error("❌ Error:", error);

    const { apiStart: s, apiEnd: e } = getWeekRange();
    await supabase.from("cabify_sync_log").insert({
      sync_type: "realtime-weekly",
      period_start: s,
      period_end: e,
      records_synced: 0,
      status: "failed",
      error_message: error instanceof Error ? error.message : "Unknown error",
      execution_time_ms: Date.now() - startTime,
    });
  }
}

main().catch(console.error);
