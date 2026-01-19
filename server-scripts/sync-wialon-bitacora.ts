/**
 * Sincronización de Bitácora Wialon para Deno
 * Obtiene turnos desde la API de Wialon y los guarda en wialon_bitacora
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Configuración
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const WIALON_HOST = 'https://hst-api.wialon.us'
const WIALON_TOKEN = Deno.env.get('WIALON_TOKEN')!

const WIALON_CONFIG = {
  reportResourceId: 401831897,
  reportTemplateId: 17,
  reportObjectId: 401831899,
}

const POCO_KM_THRESHOLD = 100

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// Cliente Wialon
class WialonClient {
  private host: string
  private token: string
  private sid: string | null = null

  constructor(host: string, token: string) {
    this.host = host
    this.token = token
  }

  private async request(svc: string, params: Record<string, unknown>): Promise<any> {
    const url = `${this.host}/wialon/ajax.html`
    const body = new URLSearchParams()
    body.append('svc', svc)
    body.append('params', JSON.stringify(params))
    if (this.sid) body.append('sid', this.sid)

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    return await response.json()
  }

  async login(): Promise<string> {
    const result = await this.request('token/login', { token: this.token })
    if (result.eid) {
      this.sid = result.eid
      return result.user?.nm || 'N/A'
    }
    throw new Error('Login fallido: ' + JSON.stringify(result))
  }

  async logout(): Promise<void> {
    if (this.sid) {
      await this.request('core/logout', {})
      this.sid = null
    }
  }

  async cleanupReport(): Promise<void> {
    await this.request('report/cleanup_result', {})
  }

  async execReport(from: number, to: number): Promise<any> {
    return await this.request('report/exec_report', {
      reportResourceId: WIALON_CONFIG.reportResourceId,
      reportTemplateId: WIALON_CONFIG.reportTemplateId,
      reportObjectId: WIALON_CONFIG.reportObjectId,
      reportObjectSecId: 0,
      interval: { flags: 0, from, to },
    })
  }

  async selectRows(tableIndex: number, from: number, to: number, level: number = 0): Promise<any> {
    return await this.request('report/select_result_rows', {
      tableIndex,
      config: { type: 'range', data: { from, to, level } },
    })
  }
}

// Helpers
function normalizarPatente(patente: string): string {
  return (patente || '').replace(/\s/g, '').toUpperCase()
}

function parseWialonTime(text: string): { hora: string; fecha: string } | null {
  const match = text.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})/)
  if (!match) return null
  return {
    fecha: `${match[3]}-${match[2]}-${match[1]}`,
    hora: `${match[4]}:${match[5]}`,
  }
}

function calcularEstado(horaCierre: string | null, km: number): string {
  if (!horaCierre) return 'En Curso'
  if (km < POCO_KM_THRESHOLD) return 'Poco Km'
  return 'Turno Finalizado'
}

function getTodayRange(): { startDate: string; fromTs: number; toTs: number } {
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const startOfDay = new Date(today + 'T00:00:00-03:00')
  const fromTs = Math.floor(startOfDay.getTime() / 1000)
  const toTs = Math.floor(now.getTime() / 1000)
  return { startDate: today, fromTs, toTs }
}

// Sincronización
async function syncBitacora(): Promise<{ success: boolean; turnos: number; error?: string }> {
  const startTime = Date.now()
  const client = new WialonClient(WIALON_HOST, WIALON_TOKEN)
  const { startDate, fromTs, toTs } = getTodayRange()

  let syncLogId: string | null = null

  try {
    const { data: logData } = await supabase
      .from('wialon_bitacora_sync_log')
      .insert({
        tipo: 'realtime',
        fecha_inicio: startDate,
        fecha_fin: startDate,
        status: 'running',
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    syncLogId = logData?.id

    await client.login()
    await client.cleanupReport()

    const reportResult = await client.execReport(fromTs, toTs)
    const tables = reportResult.reportResult?.tables || []

    const turnos: any[] = []

    for (let tableIdx = 0; tableIdx < tables.length; tableIdx++) {
      const table = tables[tableIdx]
      if (!table.rows || table.rows === 0) continue

      const rows = await client.selectRows(tableIdx, 0, table.rows, 1)

      for (const row of rows || []) {
        const cells = row.c || []
        let patente = ''
        let conductor = ''
        let horaInicio = ''
        let horaCierre = ''
        let km = 0

        if (cells[0]) {
          patente = typeof cells[0] === 'string' ? cells[0] : cells[0]?.t || ''
        }

        if (row.r && Array.isArray(row.r)) {
          for (const subrow of row.r) {
            const subCells = subrow.c || []

            if (subCells[1]) {
              const val = typeof subCells[1] === 'string' ? subCells[1] : subCells[1]?.t || ''
              if (val && val !== '-') conductor = val
            }

            if (subCells[2]) {
              const val = typeof subCells[2] === 'string' ? subCells[2] : subCells[2]?.t || ''
              const parsed = parseWialonTime(val)
              if (parsed) horaInicio = parsed.hora
            }

            if (subCells[3]) {
              const val = typeof subCells[3] === 'string' ? subCells[3] : subCells[3]?.t || ''
              const parsed = parseWialonTime(val)
              if (parsed) horaCierre = parsed.hora
            }

            if (subCells[4]) {
              const val = typeof subCells[4] === 'string' ? subCells[4] : subCells[4]?.t || ''
              km = parseFloat(val.replace(/[^\d.]/g, '')) || 0
            }
          }
        }

        if (patente) {
          turnos.push({
            patente,
            patente_normalizada: normalizarPatente(patente),
            conductor_wialon: conductor || null,
            fecha_turno: startDate,
            hora_inicio: horaInicio || null,
            hora_cierre: horaCierre || null,
            kilometraje: Math.round(km * 100) / 100,
            estado: calcularEstado(horaCierre, km),
            synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
        }
      }
    }

    let guardados = 0
    if (turnos.length > 0) {
      await supabase.from('wialon_bitacora').delete().eq('fecha_turno', startDate)

      for (let i = 0; i < turnos.length; i += 100) {
        const batch = turnos.slice(i, i + 100)
        const { error } = await supabase.from('wialon_bitacora').insert(batch)
        if (!error) guardados += batch.length
      }
    }

    if (syncLogId) {
      await supabase
        .from('wialon_bitacora_sync_log')
        .update({
          status: 'success',
          registros_procesados: turnos.length,
          registros_nuevos: guardados,
          completed_at: new Date().toISOString(),
          execution_time_ms: Date.now() - startTime,
        })
        .eq('id', syncLogId)
    }

    return { success: true, turnos: guardados }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    if (syncLogId) {
      await supabase
        .from('wialon_bitacora_sync_log')
        .update({
          status: 'failed',
          error_message: errorMessage,
          completed_at: new Date().toISOString(),
          execution_time_ms: Date.now() - startTime,
        })
        .eq('id', syncLogId)
    }

    return { success: false, turnos: 0, error: errorMessage }

  } finally {
    await client.logout()
  }
}

// Main
const now = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })
console.log(`[${now}] Sincronizando bitácora Wialon...`)

const result = await syncBitacora()

if (result.success) {
  console.log(`✅ ${result.turnos} turnos sincronizados`)
} else {
  console.error(`❌ Error: ${result.error}`)
  Deno.exit(1)
}
