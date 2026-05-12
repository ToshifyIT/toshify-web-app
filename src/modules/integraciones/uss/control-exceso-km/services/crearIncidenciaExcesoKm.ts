// Service: crea una incidencia + penalidad por exceso de KM en estado PENDIENTE (Por Aplicar).
// Recibe un resumen semanal de un conductor (proveniente de la tabla de Control de Exceso KM).
// Sigue el mismo flujo que IncidenciasModule.handleGuardarIncidencia para que la incidencia
// aparezca en la pestaña "Por Aplicar" de Penalidades.

import { supabase } from '../../../../../lib/supabase'

export interface ResumenExcesoInput {
  conductorId: string | null
  conductorNombre: string
  patente: string | null              // patente principal de la semana
  modalidad: 'turno' | 'a_cargo' | null
  kmRecorridos: number                // suma semanal
  kmExcedidos: number                 // > 0
  limite: number                      // 1800 o 3600
  semana: number                      // ISO week
  anio: number                        // ISO year
  semanaInicio: string                // YYYY-MM-DD lunes
  semanaFin: string                   // YYYY-MM-DD domingo
  sedeId: string | null
}

export interface CrearIncidenciaCtx {
  userId?: string
  userName?: string
}

export type CrearIncidenciaResult =
  | { ok: true; incidenciaId: string; penalidadId: string; monto: number; porcentaje: number }
  | { ok: false; error: string }

// Defaults — pueden venir sobreescritos por parametros_sistema en el hook si hace falta
const ALQUILER_TURNO_DEFAULT = 245000
const ALQUILER_A_CARGO_DEFAULT = 360000

function porcentajePorKm(km: number): number {
  if (km <= 0) return 0
  if (km > 150) return 35
  if (km > 100) return 25
  if (km > 50) return 20
  return 15
}

function getLocalDateString(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function normalizePatente(value: string | null | undefined): string {
  if (!value) return ''
  return value.trim().replace(/[\s-]/g, '').toUpperCase()
}

export async function crearIncidenciaExcesoKm(
  input: ResumenExcesoInput,
  ctx: CrearIncidenciaCtx,
): Promise<CrearIncidenciaResult> {
  if (!input.conductorId) {
    return { ok: false, error: 'El conductor no está vinculado a la base. Cargá la incidencia manualmente.' }
  }
  if (!input.sedeId) {
    return { ok: false, error: 'No hay sede asociada al registro' }
  }
  if (input.kmExcedidos <= 0) {
    return { ok: false, error: 'No hay exceso de km que cobrar' }
  }

  // 1) Parámetros: traer alquileres actuales (si están configurados)
  let alquilerTurno = ALQUILER_TURNO_DEFAULT
  let alquilerACargo = ALQUILER_A_CARGO_DEFAULT
  {
    const { data: params } = await supabase
      .from('parametros_sistema')
      .select('clave, valor')
      .in('clave', ['alquiler_turno', 'alquiler_a_cargo'])
    for (const p of (params || []) as any[]) {
      const v = parseFloat(p.valor)
      if (isNaN(v) || v <= 0) continue
      if (p.clave === 'alquiler_turno') alquilerTurno = v
      else if (p.clave === 'alquiler_a_cargo') alquilerACargo = v
    }
  }
  const modalidadEfectiva: 'turno' | 'a_cargo' = input.modalidad === 'a_cargo' ? 'a_cargo' : 'turno'
  const valorAlquiler = modalidadEfectiva === 'a_cargo' ? alquilerACargo : alquilerTurno
  const porcentaje = porcentajePorKm(input.kmExcedidos)
  const montoBase = valorAlquiler * (porcentaje / 100)
  const monto = Math.round(montoBase * 1.21)

  // 2) Tipo de cobro EXCESO_KM
  const { data: tipos } = await (supabase.from('tipos_cobro_descuento' as any) as any)
    .select('id, codigo, nombre')
    .eq('is_active', true)
  const tipoExceso = (tipos || []).find((t: any) => t.codigo === 'EXCESO_KM') ||
    (tipos || []).find((t: any) => (t.nombre || '').toLowerCase().includes('exceso'))
  if (!tipoExceso) {
    return { ok: false, error: 'No se encontró el tipo "Exceso de kilometraje" en tipos_cobro_descuento' }
  }

  // 3) Estado PENDIENTE
  const { data: estados } = await (supabase.from('incidencias_estados' as any) as any)
    .select('id, codigo')
    .eq('is_active', true)
  const estadoPendiente = (estados || []).find((e: any) => e.codigo === 'PENDIENTE') || (estados || [])[0]
  if (!estadoPendiente) {
    return { ok: false, error: 'No se encontró el estado PENDIENTE' }
  }

  // 4) Vehículo por patente principal
  let vehiculoId: string | null = null
  let vehiculoPatente: string | null = input.patente
  if (input.patente) {
    const patNorm = normalizePatente(input.patente)
    const { data: vehiculos } = await supabase
      .from('vehiculos')
      .select('id, patente')
      .is('deleted_at', null)
    const veh = (vehiculos || []).find((v: any) => normalizePatente(v.patente) === patNorm)
    if (veh) {
      vehiculoId = veh.id
      vehiculoPatente = veh.patente
    }
  }

  // 5) Turno label
  const turno = modalidadEfectiva === 'a_cargo' ? 'A cargo' : 'Turno'

  // 6) Descripción
  const descripcion = `Exceso de KM semanal (Sem ${input.semana}/${input.anio}) — ${input.kmRecorridos.toLocaleString('es-AR')} km recorridos, límite ${input.limite.toLocaleString('es-AR')} km, exceso ${input.kmExcedidos.toLocaleString('es-AR')} km (${porcentaje}%)`

  const fecha = getLocalDateString()

  // 7) INSERT incidencia
  const { data: incidenciaCreada, error: incError } = await (supabase.from('incidencias' as any) as any)
    .insert({
      vehiculo_id: vehiculoId,
      conductor_id: input.conductorId,
      estado_id: estadoPendiente.id,
      sede_id: input.sedeId,
      semana: input.semana,
      fecha,
      turno,
      area: 'GPS',
      descripcion,
      conductor_nombre: input.conductorNombre,
      vehiculo_patente: vehiculoPatente,
      tipo: 'cobro',
      tipo_cobro_descuento_id: tipoExceso.id,
      monto,
      km_exceso: Math.round(input.kmExcedidos),
      created_by: ctx.userId || null,
      created_by_name: ctx.userName || 'Sistema',
    })
    .select('id')
    .single()
  if (incError || !incidenciaCreada) {
    return { ok: false, error: incError?.message || 'Error al crear la incidencia' }
  }

  // 8) INSERT penalidad (esto la hace aparecer en "Por Aplicar")
  const { data: penalidadCreada, error: penError } = await (supabase.from('penalidades' as any) as any)
    .insert({
      incidencia_id: incidenciaCreada.id,
      vehiculo_id: vehiculoId,
      conductor_id: input.conductorId,
      tipo_cobro_descuento_id: tipoExceso.id,
      semana: input.semana,
      fecha,
      turno,
      area_responsable: 'GPS',
      detalle: 'Cobro por exceso de KM semanal',
      monto,
      observaciones: descripcion,
      aplicado: false,
      rechazado: false,
      conductor_nombre: input.conductorNombre,
      vehiculo_patente: vehiculoPatente,
      created_by: ctx.userId || null,
      created_by_name: ctx.userName || 'Sistema',
      sede_id: input.sedeId,
    })
    .select('id')
    .single()
  if (penError || !penalidadCreada) {
    return { ok: false, error: penError?.message || 'Error al crear la penalidad' }
  }

  return { ok: true, incidenciaId: incidenciaCreada.id, penalidadId: penalidadCreada.id, monto, porcentaje }
}
