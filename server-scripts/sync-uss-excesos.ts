#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * Script Deno: Sincronización de Excesos de Velocidad desde Wialon
 * Ejecutar con: deno run --allow-net --allow-env sync-uss-excesos.ts
 *
 * Variables de entorno requeridas:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - WIALON_TOKEN
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// =====================================================
// CONFIGURACIÓN
// =====================================================

const WIALON_HOST = "https://hst-api.wialon.us";
const WIALON_TOKEN = Deno.env.get("WIALON_TOKEN") || "a5037540c77813d4b143f616fded9809FC25D83DFA6E5276C7D597A5250DDAC94BB59BA8";

// IDs del reporte de Excesos de Velocidad
const WIALON_CONFIG = {
  reportResourceId: 401831897,
  reportTemplateId: 6,
  reportObjectId: 401831899,
};

// Usar Kong en Docker (172.19.0.14:8000) o localhost si está disponible
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "http://172.19.0.14:8000";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// =====================================================
// TIPOS
// =====================================================

interface ExcesoVelocidad {
  patente: string;
  patenteNormalizada: string;
  fechaEvento: Date;
  localizacion: string;
  latitud?: number;
  longitud?: number;
  velocidadMaxima: number;
  limiteVelocidad: number;
  duracionSegundos: number;
  conductorWialon?: string;
  ibutton?: string;
  wialonUnitId?: number;
}

interface SyncResult {
  success: boolean;
  periodStart: string;
  periodEnd: string;
  excesosEncontrados: number;
  excesosGuardados: number;
  vehiculosProcesados: number;
  errores: number;
  executionTimeMs: number;
}

interface ParsedConductor {
  ibutton: string;
  conductor: string;
}

// =====================================================
// CLIENTE WIALON
// =====================================================

class WialonClient {
  private host: string;
  private token: string;
  private sid: string | null = null;

  constructor(host: string, token: string) {
    this.host = host;
    this.token = token;
  }

  private async request(svc: string, params: Record<string, unknown>): Promise<any> {
    const url = `${this.host}/wialon/ajax.html`;
    const body = new URLSearchParams();
    body.append("svc", svc);
    body.append("params", JSON.stringify(params));
    if (this.sid) {
      body.append("sid", this.sid);
    }

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    return await response.json();
  }

  async login(): Promise<string> {
    const result = await this.request("token/login", { token: this.token });
    if (result.eid) {
      this.sid = result.eid;
      return result.user?.nm || "N/A";
    }
    throw new Error("Login fallido");
  }

  async logout(): Promise<void> {
    if (this.sid) {
      await this.request("core/logout", {});
      this.sid = null;
    }
  }

  async cleanupReport(): Promise<void> {
    await this.request("report/cleanup_result", {});
  }

  async execReport(from: number, to: number): Promise<any> {
    const params = {
      reportResourceId: WIALON_CONFIG.reportResourceId,
      reportTemplateId: WIALON_CONFIG.reportTemplateId,
      reportObjectId: WIALON_CONFIG.reportObjectId,
      reportObjectSecId: 0,
      interval: {
        flags: 0,
        from: from,
        to: to,
      },
    };
    return await this.request("report/exec_report", params);
  }

  async selectReportRows(tableIndex: number, from: number, to: number, level: number = 1): Promise<any> {
    const params = {
      tableIndex: tableIndex,
      config: {
        type: "range",
        data: {
          from: from,
          to: to,
          level: level
        }
      }
    };
    return await this.request("report/select_result_rows", params);
  }
}

// =====================================================
// FUNCIONES DE NORMALIZACIÓN
// =====================================================

function normalizarPatente(patente: string): string {
  return patente
    .toUpperCase()
    .replace(/[\s\-\.%]/g, "")
    .trim();
}

function parseDuracion(duracion: string): number {
  if (!duracion || duracion === "-----" || duracion === "") return 0;
  const parts = duracion.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function parseVelocidad(velocidad: any): number {
  if (!velocidad) return 0;
  const str = typeof velocidad === "string" ? velocidad : (velocidad?.t || String(velocidad?.v || ""));
  if (!str || str === "-----") return 0;
  const match = str.match(/([\d.]+)/);
  return match ? parseFloat(match[1]) : 0;
}

function extractText(cell: any): string {
  if (!cell) return "";
  if (typeof cell === "string") return cell;
  if (cell.t) return cell.t;
  return String(cell.v || "");
}

function extractTimestamp(cell: any): number | null {
  if (!cell) return null;
  if (typeof cell === "object" && cell.v) return cell.v;
  return null;
}

function extractCoords(cell: any): { lat: number; lon: number } | null {
  if (!cell || typeof cell !== "object") return null;
  if (cell.y !== undefined && cell.x !== undefined) {
    return { lat: cell.y, lon: cell.x };
  }
  return null;
}

/**
 * Parsea el campo conductor de Wialon para separar iButton del nombre.
 */
function parseConductor(valor: string | null | undefined): ParsedConductor {
  if (!valor || valor.trim() === "" || valor === "-----" || valor === "---") {
    return { ibutton: "", conductor: "" };
  }

  const trimmed = valor.trim();
  const ibuttons: string[] = [];
  const nombres: string[] = [];

  const partes = trimmed.split(/[,;]/);

  for (let parte of partes) {
    parte = parte.trim();
    if (!parte) continue;

    // Caso 1: número-nombre o número - nombre
    const matchSeparador = parte.match(/^(\d+)\s*[-–]\s*(.*)$/);
    if (matchSeparador) {
      const ibutton = matchSeparador[1].trim();
      const nombre = matchSeparador[2].trim();
      if (ibutton) ibuttons.push(ibutton);
      if (nombre) nombres.push(nombre);
      continue;
    }

    // Caso 2: número pegado al nombre
    const matchPegado = parte.match(/^(\d+)([A-Za-z].*)$/);
    if (matchPegado) {
      ibuttons.push(matchPegado[1].trim());
      nombres.push(matchPegado[2].trim());
      continue;
    }

    // Caso 3: solo número
    if (/^\d+$/.test(parte)) {
      ibuttons.push(parte);
      continue;
    }

    // Caso 4: solo texto
    nombres.push(parte);
  }

  return {
    ibutton: ibuttons.join(", "),
    conductor: nombres.join(", ")
  };
}

// =====================================================
// SINCRONIZACIÓN
// =====================================================

async function syncExcesosVelocidad(dateStr: string): Promise<SyncResult> {
  const startTime = Date.now();
  const result: SyncResult = {
    success: false,
    periodStart: dateStr,
    periodEnd: dateStr,
    excesosEncontrados: 0,
    excesosGuardados: 0,
    vehiculosProcesados: 0,
    errores: 0,
    executionTimeMs: 0,
  };

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const client = new WialonClient(WIALON_HOST, WIALON_TOKEN);

  // Calcular timestamps Unix para el día (hora Argentina UTC-3)
  const date = new Date(dateStr + "T00:00:00-03:00");
  const fromTimestamp = Math.floor(date.getTime() / 1000);
  const toTimestamp = fromTimestamp + 86399;

  console.log(`📅 Fecha: ${dateStr}, From: ${fromTimestamp}, To: ${toTimestamp}`);

  try {
    // Registrar inicio de sync
    await supabase.from("uss_sync_status").upsert({
      fecha: dateStr,
      estado: "sincronizando",
      fecha_inicio_sync: new Date().toISOString(),
      intentos: 1,
      updated_at: new Date().toISOString(),
    }, { onConflict: "fecha" });

    // Login a Wialon
    const userName = await client.login();
    console.log(`✅ Login Wialon exitoso: ${userName}`);

    // Limpiar reportes anteriores
    await client.cleanupReport();

    // Ejecutar reporte
    console.log(`📊 Ejecutando reporte de excesos...`);
    const execResult = await client.execReport(fromTimestamp, toTimestamp);

    if (execResult.error) {
      throw new Error(`Error ejecutando reporte: ${JSON.stringify(execResult)}`);
    }

    // Obtener info de tablas del reporte
    const reportResult = execResult.reportResult || execResult;
    const tables = reportResult.tables || [];

    console.log(`📝 Tablas encontradas: ${tables.length}`);

    const excesos: ExcesoVelocidad[] = [];
    const patentesSet = new Set<string>();

    // Procesar cada tabla del reporte
    for (let tableIndex = 0; tableIndex < tables.length; tableIndex++) {
      const table = tables[tableIndex];
      const rowCount = table.rows || 0;

      console.log(`📋 Tabla ${tableIndex}: "${table.label || table.name}" con ${rowCount} filas`);

      if (rowCount === 0) continue;

      // Obtener filas con subfilas (level 1)
      const rows = await client.selectReportRows(tableIndex, 0, rowCount, 1);

      if (!rows || !Array.isArray(rows)) {
        console.log(`⚠️ No hay filas para tabla ${tableIndex}`);
        continue;
      }

      // Procesar cada fila y sus subfilas
      for (const row of rows) {
        const subrows = row.r || [];

        for (const subrow of subrows) {
          const cells = subrow.c || [];

          const patente = extractText(cells[1]);
          if (!patente || patente === "-----") continue;

          const patenteNorm = normalizarPatente(patente);
          patentesSet.add(patenteNorm);

          const timestamp = extractTimestamp(cells[2]);
          if (!timestamp) continue;

          const fechaEvento = new Date(timestamp * 1000);
          const velocidadMaxima = parseVelocidad(cells[5]);
          const limiteVelocidad = parseVelocidad(cells[6]) || 40;

          // Solo guardar si hay velocidad máxima válida y es un exceso real
          if (velocidadMaxima > 0 && velocidadMaxima > limiteVelocidad) {
            const coords = extractCoords(cells[5]) || extractCoords(cells[2]);
            const unitId = cells[2]?.u || cells[5]?.u;

            const conductorRaw = extractText(cells[7]);
            const { ibutton, conductor } = parseConductor(conductorRaw);

            excesos.push({
              patente: patente,
              patenteNormalizada: patenteNorm,
              fechaEvento: fechaEvento,
              localizacion: extractText(cells[3]),
              latitud: coords?.lat,
              longitud: coords?.lon,
              duracionSegundos: parseDuracion(extractText(cells[4])),
              velocidadMaxima: velocidadMaxima,
              limiteVelocidad: limiteVelocidad,
              conductorWialon: conductor || conductorRaw || undefined,
              ibutton: ibutton || undefined,
              wialonUnitId: unitId,
            });
          }
        }
      }
    }

    result.excesosEncontrados = excesos.length;
    result.vehiculosProcesados = patentesSet.size;

    console.log(`🚨 Excesos encontrados: ${excesos.length} en ${patentesSet.size} vehículos`);

    // Obtener mapa de vehículos de Supabase
    const { data: vehiculos } = await supabase
      .from("vehiculos")
      .select("id, patente");

    const vehiculosMap = new Map<string, string>();
    for (const v of vehiculos || []) {
      vehiculosMap.set(normalizarPatente(v.patente), v.id);
    }

    // Insertar/Actualizar excesos en la BD (en batches de 500)
    if (excesos.length > 0) {
      const batchSize = 500;
      let totalInserted = 0;

      for (let i = 0; i < excesos.length; i += batchSize) {
        const batch = excesos.slice(i, i + batchSize);
        const registros = batch.map(e => ({
          patente: e.patente,
          patente_normalizada: e.patenteNormalizada,
          vehiculo_id: vehiculosMap.get(e.patenteNormalizada) || null,
          fecha_evento: e.fechaEvento.toISOString(),
          localizacion: e.localizacion,
          latitud: e.latitud,
          longitud: e.longitud,
          velocidad_maxima: e.velocidadMaxima,
          limite_velocidad: e.limiteVelocidad,
          duracion_segundos: e.duracionSegundos,
          conductor_wialon: e.conductorWialon || null,
          ibutton: e.ibutton || null,
          wialon_unit_id: e.wialonUnitId || null,
          periodo_inicio: dateStr,
          periodo_fin: dateStr,
        }));

        const { error: insertError, data: inserted } = await supabase
          .from("uss_excesos_velocidad")
          .upsert(registros, {
            onConflict: "patente_normalizada,fecha_evento,velocidad_maxima",
            ignoreDuplicates: false,
          })
          .select();

        if (insertError) {
          console.error(`❌ Error insertando batch ${i}:`, insertError);
          result.errores++;
        } else {
          totalInserted += inserted?.length || batch.length;
        }
      }

      result.excesosGuardados = totalInserted;
    }

    // Actualizar estado de sync
    await supabase.from("uss_sync_status").upsert({
      fecha: dateStr,
      estado: "completado",
      registros_sincronizados: result.excesosGuardados,
      excesos_encontrados: result.excesosEncontrados,
      fecha_fin_sync: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "fecha" });

    // Registrar en log
    await supabase.from("uss_sync_log").insert({
      sync_type: "daily",
      period_start: new Date(fromTimestamp * 1000).toISOString(),
      period_end: new Date(toTimestamp * 1000).toISOString(),
      records_synced: result.excesosGuardados,
      excesos_encontrados: result.excesosEncontrados,
      vehiculos_procesados: result.vehiculosProcesados,
      status: "success",
      execution_time_ms: Date.now() - startTime,
      completed_at: new Date().toISOString(),
    });

    result.success = true;

  } catch (error) {
    console.error("❌ Error en sincronización:", error);
    result.errores++;

    await supabase.from("uss_sync_status").upsert({
      fecha: dateStr,
      estado: "error",
      mensaje_error: error instanceof Error ? error.message : "Error desconocido",
      updated_at: new Date().toISOString(),
    }, { onConflict: "fecha" });

    await supabase.from("uss_sync_log").insert({
      sync_type: "daily",
      period_start: dateStr,
      period_end: dateStr,
      status: "failed",
      error_message: error instanceof Error ? error.message : "Error desconocido",
      execution_time_ms: Date.now() - startTime,
      completed_at: new Date().toISOString(),
    });

  } finally {
    await client.logout();
  }

  result.executionTimeMs = Date.now() - startTime;
  return result;
}

// =====================================================
// MAIN - Sincronizar semana actual
// =====================================================

async function main() {
  console.log("=== SYNC USS EXCESOS VELOCIDAD ===", new Date().toISOString());

  // Obtener la fecha de hoy en Argentina (UTC-3)
  const now = new Date();
  const argTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));

  // Calcular días de la semana actual (Lunes a Hoy)
  const dayOfWeek = argTime.getDay(); // 0=Dom, 1=Lun...
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const monday = new Date(argTime);
  monday.setDate(argTime.getDate() - daysFromMonday);

  const dates: string[] = [];
  for (let i = 0; i <= daysFromMonday; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    dates.push(dateStr);
  }

  console.log(`📅 Fechas a sincronizar: ${dates.join(', ')}`);

  let totalExcesos = 0;

  for (const dateStr of dates) {
    console.log(`\n--- ${dateStr} ---`);
    const result = await syncExcesosVelocidad(dateStr);

    if (result.success) {
      console.log(`✅ Guardados: ${result.excesosGuardados} excesos`);
      totalExcesos += result.excesosGuardados;
    } else {
      console.log(`❌ Error en sync`);
    }
  }

  console.log(`\n=== COMPLETADO: ${totalExcesos} excesos totales ===`);
}

main().catch(console.error);