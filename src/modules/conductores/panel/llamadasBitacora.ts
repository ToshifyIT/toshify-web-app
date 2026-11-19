// src/modules/conductores/panel/llamadasBitacora.ts
// Llamadas de 2Chat de un conductor para la Bitácora de seguimiento (pestaña Seguimiento
// del detalle). Solo desde que tiene asignación: antes era lead y esas llamadas son de ventas.
// Quién llamó: la persona de Toshibase si salió del botón «Llamar» (importa con la cuenta
// compartida «Info Toshify»), cruzando con twochat_llamadas_toshibase como Control de llamadas.
import { supabase } from '../../../lib/supabase'

export interface LlamadaBitacora {
  id: string
  fecha: string
  direccion: 'saliente' | 'entrante'
  numero: string | null
  duracion: number
  resultado: string
  /** Persona que llamó; null si salió de la app de 2Chat con una cuenta compartida (no se sabe quién) */
  quien: string | null
  /** Cuenta de 2Chat por la que salió, si no es la de esa persona */
  via: string | null
  resumen: string | null
  transcripcion: string | null
}

export const ETIQUETA_RESULTADO_LLAMADA: Record<string, string> = {
  atendida: 'Atendida',
  buzon_voz: 'Buzón de voz',
  sin_conversacion: 'Sin contacto',
  no_atendida: 'No atendida',
  ocupado: 'Ocupado',
  cancelada: 'Cancelada',
  fallida: 'Fallida',
}

/** Inicio de la primera asignación del conductor (null si nunca tuvo) */
async function inicioPrimeraAsignacion(conductorId: string): Promise<string | null> {
  const { data, error } = await (supabase.from('asignaciones_conductores') as any)
    .select('fecha_inicio, asignaciones!inner(estado, fecha_inicio)')
    .eq('conductor_id', conductorId)
    .not('asignaciones.estado', 'eq', 'cancelada')
  if (error) throw error
  const fechas = ((data || []) as Array<any>)
    // Solo asignaciones que arrancaron (una programada todavía no tiene fecha de inicio)
    .map((r) => r.fecha_inicio || r.asignaciones?.fecha_inicio)
    .filter(Boolean)
    .map((f: string) => new Date(f).getTime())
    .filter((t: number) => !Number.isNaN(t))
  return fechas.length ? new Date(Math.min(...fechas)).toISOString() : null
}

export async function cargarLlamadasBitacora(conductorId: string): Promise<LlamadaBitacora[]> {
  const desde = await inicioPrimeraAsignacion(conductorId)
  if (!desde) return []

  const { data, error } = await (supabase.from('twochat_llamadas') as any)
    .select('uuid, fecha, direccion, agente, agente_id, numero, numero_clave, duracion, resultado, resumen, transcripcion')
    .eq('conductor_id', conductorId)
    .gte('fecha', desde)
    .order('fecha', { ascending: false })
  if (error) throw error
  const filas = (data || []) as Array<any>
  if (!filas.length) return []

  // Registros del botón «Llamar» de Toshibase (sin la tabla, queda la cuenta de 2Chat)
  let registros: Array<{ usuario: string | null; twochat_user_uuid: string | null; numero_clave: string | null; iniciada_en: string }> = []
  try {
    const { data: regs } = await (supabase.from('twochat_llamadas_toshibase') as any)
      .select('usuario, twochat_user_uuid, numero_clave, iniciada_en')
      .eq('conductor_id', conductorId)
      .gte('iniciada_en', new Date(new Date(desde).getTime() - 10 * 60 * 1000).toISOString())
    registros = regs || []
  } catch {
    registros = []
  }
  // Cuentas de 2Chat compartidas (twochat_usuarios, p. ej. «Info Toshify»): si la llamada
  // no salió del botón de Toshibase, no se sabe quién fue y se muestra solo «vía la cuenta»
  let compartidas = new Set<string>()
  try {
    const { data: vinc } = await (supabase.from('twochat_usuarios') as any).select('twochat_user_uuid')
    compartidas = new Set(((vinc || []) as Array<{ twochat_user_uuid: string }>).map(v => v.twochat_user_uuid))
  } catch {
    compartidas = new Set()
  }

  return filas.map((f) => {
    let quien: string | null = null
    if (f.direccion === 'saliente') {
      const t = new Date(f.fecha).getTime()
      let mejor = Infinity
      for (const r of registros) {
        if (r.numero_clave !== f.numero_clave || (f.agente_id && r.twochat_user_uuid !== f.agente_id)) continue
        const dif = Math.abs(new Date(r.iniciada_en).getTime() - t)
        if (dif <= 3 * 60 * 1000 && dif < mejor) {
          mejor = dif
          quien = r.usuario
        }
      }
    }
    const cuenta: string | null = f.agente || null
    const esCompartida = !!f.agente_id && compartidas.has(f.agente_id)
    return {
      id: String(f.uuid),
      fecha: f.fecha,
      direccion: f.direccion === 'entrante' ? 'entrante' : 'saliente',
      numero: f.numero,
      duracion: Number(f.duracion) || 0,
      resultado: f.resultado,
      quien: quien || (esCompartida ? null : cuenta || 'Sin agente'),
      via: cuenta && cuenta !== quien && (quien || esCompartida) ? cuenta : null,
      resumen: f.resumen || null,
      transcripcion: f.transcripcion || null,
    }
  })
}
