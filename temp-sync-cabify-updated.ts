const SUPABASE_URL = "http://172.19.0.13:8000";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NjY5NDA4MzIsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.g7NAISyvIB_TE0nljVcALtC27BKfLBtMRrknqV3DWyU";
const CABIFY_AUTH_URL = "https://cabify.com/auth/api/authorization";
const CABIFY_GRAPHQL_URL = "https://partners.cabify.com/api/graphql";
const CABIFY_CONFIG = {
  clientId: "d14cdae660ad4817a6b20542a61cf5b1",
  clientSecret: "ebZ45Oj3ln9W5tFC",
  username: "admin.log2@toshify.com.ar",
  password: "dios.empresa25",
};

async function auth(): Promise<string> {
  const r = await fetch(CABIFY_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "password", client_id: CABIFY_CONFIG.clientId, client_secret: CABIFY_CONFIG.clientSecret, username: CABIFY_CONFIG.username, password: CABIFY_CONFIG.password }),
  });
  return (await r.json()).access_token;
}

async function supabaseRequest(path: string, method: string, body?: any) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { "Content-Type": "application/json", "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Prefer": method === "POST" ? "return=minimal" : "" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok && method !== "DELETE") console.error(`Supabase error: ${r.status} ${await r.text()}`);
  return r;
}

async function fetchAllDrivers(token: string, companyId: string) {
  const drivers: any[] = [];
  let page = 1;
  while (true) {
    const q = `query($c:String!,$p:Int!,$pp:Int!){paginatedDrivers(page:$p,perPage:$pp,companyId:$c,disabled:false){pages drivers{id name surname email nationalIdNumber driverLicense mobileNum mobileCc}}}`;
    const r = await fetch(CABIFY_GRAPHQL_URL, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify({ query: q, variables: { c: companyId, p: page, pp: 200 } }) });
    const d = (await r.json()).data?.paginatedDrivers;
    if (!d?.drivers) break;
    drivers.push(...d.drivers);
    if (page >= (d.pages || 0)) break;
    page++;
  }
  return drivers;
}

async function fetchJourneys(token: string, companyId: string, driverId: string, start: string, end: string) {
  const journeys: any[] = [];
  let page = 1;
  while (true) {
    const q = `query($c:String,$d:String!,$p:Int,$pp:Int,$s:String!,$e:String!){paginatedJourneys(companyId:$c,driverId:$d,page:$p,perPage:$pp,startAt:$s,endAt:$e){pages journeys{id assetId finishReason paymentMethod totals{earningsTotal{amount}}}}}`;
    const r = await fetch(CABIFY_GRAPHQL_URL, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify({ query: q, variables: { c: companyId, d: driverId, p: page, pp: 100, s: start, e: end } }) });
    const data = (await r.json()).data?.paginatedJourneys;
    if (!data?.journeys) break;
    journeys.push(...data.journeys);
    if (page >= (data.pages || 0)) break;
    page++;
  }
  return journeys;
}

// CAMBIADO: Semana Domingo-Sábado (como Cabify) en lugar de Lunes-Domingo
function getWeekDays() {
  const now = new Date();
  const dow = now.getDay(); // 0=Domingo, 1=Lunes, ..., 6=Sábado
  // Para semana Dom-Sab: el domingo es día 0, así que diff = dow
  const diff = dow;
  const sun = new Date(now); sun.setDate(now.getDate() - diff); sun.setHours(0,0,0,0);
  const days: any[] = [];
  for (let i = 0; i <= diff; i++) {
    const d = new Date(sun); d.setDate(sun.getDate() + i);
    // Usar UTC para las fechas
    const start = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0));
    const isToday = i === diff;
    const end = isToday ? new Date() : new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999));
    days.push({ start: start.toISOString(), end: end.toISOString(), isToday, label: d.toLocaleDateString() });
  }
  return days;
}

async function main() {
  console.log("=== SYNC CABIFY ===", new Date().toISOString());
  const token = await auth();
  console.log("Token OK");

  const compRes = await fetch(CABIFY_GRAPHQL_URL, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify({ query: `{metafleetCompanies{companyIds}}` }) });
  const companies = (await compRes.json()).data?.metafleetCompanies?.companyIds || [];
  console.log(`Companias: ${companies.length}`);

  const days = getWeekDays();
  let total = 0;

  for (const day of days) {
    console.log(`\n--- ${day.label} ---`);

    const check = await fetch(`${SUPABASE_URL}/rest/v1/cabify_historico?fecha_inicio=eq.${encodeURIComponent(day.start)}&limit=1`, { headers: { "apikey": SUPABASE_KEY } });
    const exists = (await check.json()).length > 0;

    if (exists && !day.isToday) { console.log("Ya existe, skip"); continue; }
    if (day.isToday) await supabaseRequest(`cabify_historico?fecha_inicio=eq.${encodeURIComponent(day.start)}`, "DELETE");

    const records: any[] = [];
    for (const companyId of companies) {
      const drivers = await fetchAllDrivers(token, companyId);
      for (const driver of drivers) {
        try {
          // Usando campos directos de la API: rejected, dropOffs, connected
          const sq = `query($c:String,$d:String!,$s:DateTime!,$e:DateTime!){driver(id:$d,companyId:$c){stats(startAt:$s,endAt:$e){accepted missed offered assigned available score rejected dropOffs connected}}}`;
          const sr = await fetch(CABIFY_GRAPHQL_URL, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify({ query: sq, variables: { c: companyId, d: driver.id, s: day.start, e: day.end } }) });
          const stats = (await sr.json()).data?.driver?.stats || {};
          const journeys = await fetchJourneys(token, companyId, driver.id, day.start, day.end);

          const assigned = Number(stats.assigned || 0);
          const connected = Number(stats.connected || 0);
          const hours = connected / 3600;
          const accepted = Number(stats.accepted || 0), missed = Number(stats.missed || 0), offered = Number(stats.offered || 0);
          const rejected = Number(stats.rejected || 0);
          const trips = Number(stats.dropOffs || 0);

          let cash = 0, app = 0;
          journeys.forEach((j: any) => {
            if (j.totals?.earningsTotal?.amount > 0) {
              const a = Number(j.totals.earningsTotal.amount);
              if (j.paymentMethod === "cash") cash += a; else app += a;
            }
          });

          if (driver.nationalIdNumber) {
            records.push({
              cabify_driver_id: driver.id, cabify_company_id: companyId,
              nombre: driver.name || "", apellido: driver.surname || "", email: driver.email || "",
              dni: driver.nationalIdNumber, licencia: driver.driverLicense || "",
              telefono_codigo: driver.mobileCc || "", telefono_numero: driver.mobileNum || "",
              fecha_inicio: day.start, fecha_fin: day.end,
              viajes_finalizados: trips, viajes_rechazados: rejected, viajes_perdidos: missed,
              viajes_aceptados: accepted, viajes_ofrecidos: offered, score: stats.score || 0,
              tasa_aceptacion: (accepted + rejected + missed) > 0 ? Number(((accepted / (accepted + rejected + missed)) * 100).toFixed(2)) : 0,
              tasa_ocupacion: connected > 0 ? Number(((assigned / connected) * 100).toFixed(2)) : 0,
              horas_conectadas: Number(hours.toFixed(1)),
              horas_conectadas_formato: `${Math.floor(hours)}h ${Math.floor((hours % 1) * 60)}m`,
              cobro_efectivo: Number((cash / 100).toFixed(2)), cobro_app: Number((app / 100).toFixed(2)),
              ganancia_total: Number(((cash + app) / 100).toFixed(2)),
              ganancia_por_hora: hours > 0 ? Number((((cash + app) / 100) / hours).toFixed(2)) : 0,
              estado_conductor: "Activo"
            });
          }
        } catch (e) { console.error(`Error driver ${driver.id}:`, e); }
      }
    }

    if (records.length > 0) {
      for (let i = 0; i < records.length; i += 100) {
        await supabaseRequest("cabify_historico", "POST", records.slice(i, i + 100));
      }
      console.log(`Guardados: ${records.length}`);
      total += records.length;
    }
  }

  await supabaseRequest("cabify_sync_log", "POST", { sync_type: "cron", period_start: days[0].start, period_end: days[days.length-1].end, records_synced: total, status: "success" });
  console.log(`\n=== COMPLETADO: ${total} registros ===`);
}

main().catch(console.error);
