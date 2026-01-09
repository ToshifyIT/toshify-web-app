// Edge Function: Sincronización de Kilometraje desde USS/Wialon
// Obtiene el kilometraje de todos los vehículos desde la API de Wialon

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// =====================================================
// CONFIGURACIÓN
// =====================================================

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const WIALON_HOST = 'https://hst-api.wialon.us'
const WIALON_TOKEN = Deno.env.get('WIALON_TOKEN') || 'a5037540c77813d4b143f616fded9809FC25D83DFA6E5276C7D597A5250DDAC94BB59BA8'

const BATCH_SIZE = 50

// =====================================================
// TIPOS
// =====================================================

interface WialonUnit {
  id: number
  nm: string
  cnm?: number
  flds?: Record<string, { n: string; v: string }>
}

interface WialonResponse {
  eid?: string
  error?: number
  items?: WialonUnit[]
  user?: { nm: string }
}

// =====================================================
// CLIENTE WIALON
// =====================================================

class WialonClient {
  private host: string
  private token: string
  private sid: string | null = null

  constructor(host: string, token: string) {
    this.host = host
    this.token = token
  }

  private async request(svc: string, params: Record<string, unknown>): Promise<WialonResponse> {
    const url = `${this.host}/wialon/ajax.html`
    const body = new URLSearchParams()
    body.append('svc', svc)
    body.append('params', JSON.stringify(params))
    if (this.sid) {
      body.append('sid', this.sid)
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })

    const result = await response.json() as WialonResponse

    if (result.error && result.error !== 0) {
      const errorMsgs: Record<number, string> = {
        1: 'Sesión inválida',
        2: 'Servicio inválido',
        4: 'Parámetros inválidos',
        5: 'Acceso denegado',
      }
      throw new Error(`Wialon Error: ${errorMsgs[result.error] || `Código ${result.error}`}`)
    }

    return result
  }

  async login(): Promise<void> {
    const result = await this.request('token/login', { token: this.token })
    if (result.eid) {
      this.sid = result.eid
      console.log(`✅ Login Wialon exitoso`)
    } else {
      throw new Error('Login fallido: no se recibió session ID')
    }
  }

  async logout(): Promise<void> {
    if (this.sid) {
      await this.request('core/logout', {})
      this.sid = null
    }
  }

  async searchUnits(): Promise<WialonUnit[]> {
    const params = {
      spec: {
        itemsType: 'avl_unit',
        propName: 'sys_name',
        propValueMask: '*',
        sortType: 'sys_name',
        propType: 'property',
      },
      force: 1,
      flags: 8201,
      from: 0,
      to: 0,
    }

    const result = await this.request('core/search_items', params)
    return result.items || []
  }
}

// =====================================================
// HELPERS
// =====================================================

function normalizarPatente(patente: string): string {
  return patente.toUpperCase().replace(/[\s\-\.]/g, '').trim()
}

function extraerPatente(unit: WialonUnit): string {
  if (unit.flds) {
    for (const [, field] of Object.entries(unit.flds)) {
      const fieldName = field.n.toLowerCase()
      if (fieldName.includes('patente') || fieldName.includes('plate') || fieldName.includes('placa')) {
        return field.v
      }
    }
  }
  return unit.nm
}

// =====================================================
// EDGE FUNCTION HANDLER
// =====================================================

serve(async (req) => {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  const startTime = Date.now()

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const client = new WialonClient(WIALON_HOST, WIALON_TOKEN)

    console.log('🚗 Iniciando sincronización de kilometraje...')

    // 1. Login a Wialon
    await client.login()

    // 2. Obtener vehículos de Wialon
    console.log('📡 Obteniendo vehículos desde Wialon...')
    const units = await client.searchUnits()
    console.log(`   Encontrados: ${units.length} vehículos en Wialon`)

    // 3. Procesar datos
    const kilometrajeData = units.map(unit => {
      const patente = extraerPatente(unit)
      let kilometraje = 0

      if (unit.cnm !== undefined && unit.cnm !== null) {
        kilometraje = unit.cnm
        if (kilometraje > 10000000) {
          kilometraje = kilometraje / 1000
        }
      }

      return {
        wialonId: unit.id,
        nombre: unit.nm,
        patente,
        patenteNormalizada: normalizarPatente(patente),
        kilometraje: Math.round(kilometraje),
      }
    })

    // 4. Obtener vehículos de Supabase
    console.log('📊 Obteniendo vehículos de Supabase...')
    const { data: vehiculos, error: vehiculosError } = await supabase
      .from('vehiculos')
      .select('id, patente, kilometraje_actual')

    if (vehiculosError) {
      throw new Error(`Error obteniendo vehículos: ${vehiculosError.message}`)
    }

    console.log(`   Encontrados: ${vehiculos?.length || 0} vehículos en Supabase`)

    // 5. Crear mapa de patentes
    const vehiculosMap = new Map<string, { id: string; patente: string }>()
    for (const v of vehiculos || []) {
      const patenteNorm = normalizarPatente(v.patente)
      vehiculosMap.set(patenteNorm, v)
    }

    // 6. Preparar actualizaciones
    const vehiculosParaActualizar: Array<{ id: string; kilometraje: number }> = []

    for (const data of kilometrajeData) {
      const vehiculo = vehiculosMap.get(data.patenteNormalizada)
      if (vehiculo) {
        vehiculosParaActualizar.push({
          id: vehiculo.id,
          kilometraje: data.kilometraje,
        })
      }
    }

    console.log(`🔄 Actualizando ${vehiculosParaActualizar.length} vehículos...`)

    // 7. Batch update
    const timestamp = new Date().toISOString()
    let actualizados = 0
    let errores = 0

    for (let i = 0; i < vehiculosParaActualizar.length; i += BATCH_SIZE) {
      const lote = vehiculosParaActualizar.slice(i, i + BATCH_SIZE)

      const updates = lote.map(v =>
        supabase
          .from('vehiculos')
          .update({ kilometraje_actual: v.kilometraje, updated_at: timestamp })
          .eq('id', v.id)
      )

      const results = await Promise.all(updates)
      const loteErrores = results.filter(r => r.error).length

      errores += loteErrores
      actualizados += lote.length - loteErrores

      console.log(`   Lote ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(vehiculosParaActualizar.length / BATCH_SIZE)} completado`)
    }

    // 8. Logout
    await client.logout()

    const executionTimeMs = Date.now() - startTime

    console.log(`✅ Sincronización completada en ${(executionTimeMs / 1000).toFixed(1)}s`)

    return new Response(JSON.stringify({
      status: 'success',
      vehiculosWialon: units.length,
      vehiculosSupabase: vehiculos?.length || 0,
      actualizados,
      errores,
      noEncontrados: kilometrajeData.length - vehiculosParaActualizar.length,
      executionTimeMs,
    }), {
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('❌ Error en sync:', error)

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    return new Response(JSON.stringify({
      status: 'error',
      message: errorMessage,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
