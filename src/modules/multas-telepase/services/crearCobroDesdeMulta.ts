// src/modules/multas-telepase/services/crearCobroDesdeMulta.ts
// Crea una incidencia de cobro + penalidad a partir de una multa, sin UI.
// Sigue exactamente el mismo flujo que IncidenciasModule.handleGuardarIncidencia
// para que la incidencia aparezca en "Por Aplicar".

import { supabase } from '../../../lib/supabase'

export interface MultaInput {
  id: number
  patente: string
  fecha_infraccion: string | null
  importe: string
  infraccion: string
  lugar: string
  detalle: string
  conductor_responsable: string
}

export interface CrearCobroContext {
  userId?: string
  userName?: string
  sedeId?: string
  areaResponsable?: string
}

export type CrearCobroResult =
  | { ok: true; incidenciaId: string; penalidadId: string }
  | { ok: false; needsManualInput: true; reason: string; prefilled?: PrefilledFromMulta }
  | { ok: false; error: string }

export interface PrefilledFromMulta {
  vehiculoId: string | null
  conductorId: string | null
  fecha: string
  monto: number
  tipoCobroDescuentoId: string | null
  estadoId: string | null
  turno: string | null
  descripcion: string
  sedeId: string
}

function normalizePatente(value: string | null | undefined): string {
  if (!value) return ''
  return value.trim().replace(/[\s-]/g, '').toUpperCase()
}

function normalizeName(value: string | null | undefined): string {
  if (!value) return ''
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function getLocalDateString(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getWeekNumber(dateStr: string): number {
  if (!dateStr) return 0
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(year, month - 1, day, 12, 0, 0)
  const thursday = new Date(date)
  thursday.setDate(date.getDate() - ((date.getDay() + 6) % 7) + 3)
  const firstThursday = new Date(thursday.getFullYear(), 0, 4)
  firstThursday.setDate(firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7) + 3)
  return Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1
}

function parseImporteToNumber(s: string | number | null | undefined): number {
  if (s == null || s === '') return 0
  if (typeof s === 'number') return s
  let str = s.replace(/[^\d,.-]/g, '')
  const lastComma = str.lastIndexOf(',')
  const lastDot = str.lastIndexOf('.')
  if (lastComma > lastDot) str = str.replace(/\./g, '').replace(',', '.')
  else if (lastDot !== -1 && lastComma !== -1) str = str.replace(/,/g, '')
  const n = parseFloat(str)
  return isNaN(n) ? 0 : n
}

export async function crearCobroDesdeMulta(multa: MultaInput, ctx: CrearCobroContext): Promise<CrearCobroResult> {
  const sedeId = ctx.sedeId
  if (!sedeId) return { ok: false, error: 'No hay sede seleccionada' }

  // 1. Periodo abierto de la sede para tomar la fecha y semana
  const { data: periodos } = await (supabase.from('periodos_facturacion' as any) as any)
    .select('fecha_inicio')
    .eq('sede_id', sedeId)
    .eq('estado', 'abierto')
    .order('fecha_inicio', { ascending: false })
    .limit(1)
  const fecha: string = (periodos && periodos[0]?.fecha_inicio) || getLocalDateString()
  const semana = getWeekNumber(fecha)

  // 2. Tipo de cobro "Multa de tránsito"
  const { data: tipos } = await (supabase.from('tipos_cobro_descuento' as any) as any)
    .select('id,nombre')
    .eq('is_active', true)
  const tipoMulta = (tipos || []).find((t: any) =>
    t.nombre?.toLowerCase().includes('multa') && t.nombre?.toLowerCase().includes('tr')
  )
  if (!tipoMulta) return { ok: false, error: 'No se encontró el tipo "Multa de tránsito" en tipos_cobro_descuento' }

  // 3. Estado PENDIENTE
  const { data: estados } = await (supabase.from('incidencias_estados' as any) as any)
    .select('id,codigo')
    .eq('is_active', true)
  const estadoPendiente = (estados || []).find((e: any) => e.codigo === 'PENDIENTE') || (estados || [])[0]
  if (!estadoPendiente) return { ok: false, error: 'No se encontró el estado PENDIENTE de incidencias' }

  // 4. Vehículo por patente
  const patNorm = normalizePatente(multa.patente)
  const { data: vehiculos } = await supabase.from('vehiculos').select('id,patente').is('deleted_at', null)
  const vehiculo = (vehiculos || []).find((v: any) => normalizePatente(v.patente) === patNorm)
  if (!vehiculo) {
    return {
      ok: false,
      needsManualInput: true,
      reason: `No se encontró el vehículo con patente ${multa.patente}`,
      prefilled: {
        vehiculoId: null, conductorId: null, fecha, monto: parseImporteToNumber(multa.importe),
        tipoCobroDescuentoId: tipoMulta.id, estadoId: estadoPendiente.id, turno: null,
        descripcion: buildDescripcion(multa), sedeId
      }
    }
  }

  // 5. Conductor por nombre (matching tolerante)
  const { data: conductoresRaw } = await supabase.from('conductores').select('id,nombres,apellidos')
  const conductores = (conductoresRaw || []).map((c: any) => ({
    id: c.id, nombre_completo: `${c.nombres || ''} ${c.apellidos || ''}`.trim()
  }))
  const conductor = findConductorByName(conductores, multa.conductor_responsable)
  if (!conductor) {
    return {
      ok: false,
      needsManualInput: true,
      reason: multa.conductor_responsable
        ? `No se encontró el conductor "${multa.conductor_responsable}" en la base. Cargá manualmente.`
        : 'La multa no tiene conductor cargado. Cargá manualmente.',
      prefilled: {
        vehiculoId: vehiculo.id, conductorId: null, fecha, monto: parseImporteToNumber(multa.importe),
        tipoCobroDescuentoId: tipoMulta.id, estadoId: estadoPendiente.id, turno: null,
        descripcion: buildDescripcion(multa), sedeId
      }
    }
  }

  // 6. Modalidad (turno) desde asignaciones
  let turno: string | null = null
  const { data: asignaciones } = await (supabase
    .from('asignaciones')
    .select('horario, asignaciones_conductores(horario, conductor_id)')
    .eq('vehiculo_id', vehiculo.id) as any)
  for (const asig of (asignaciones || [])) {
    const ac = (asig.asignaciones_conductores || []).find((x: any) => x.conductor_id === conductor.id)
    if (!ac) continue
    if (asig.horario !== 'turno') { turno = 'A cargo'; break }
    if (ac.horario === 'diurno') { turno = 'Diurno'; break }
    if (ac.horario === 'nocturno') { turno = 'Nocturno'; break }
    turno = 'A cargo'; break
  }

  const monto = parseImporteToNumber(multa.importe)
  const descripcion = buildDescripcion(multa)

  // 7. INSERT en incidencias
  const { data: incidenciaCreada, error: incError } = await (supabase.from('incidencias' as any) as any)
    .insert({
      vehiculo_id: vehiculo.id,
      conductor_id: conductor.id,
      estado_id: estadoPendiente.id,
      sede_id: sedeId,
      semana,
      fecha,
      turno,
      area: 'Multas',
      descripcion,
      conductor_nombre: conductor.nombre_completo,
      vehiculo_patente: vehiculo.patente,
      tipo: 'cobro',
      tipo_cobro_descuento_id: tipoMulta.id,
      monto,
      multa_id: multa.id,
      created_by: ctx.userId || null,
      created_by_name: ctx.userName || 'Sistema'
    })
    .select('id')
    .single()
  if (incError || !incidenciaCreada) return { ok: false, error: incError?.message || 'Error al crear la incidencia' }

  // 8. INSERT en penalidades — esto hace que aparezca en "Por Aplicar"
  const { data: penalidadCreada, error: penError } = await (supabase.from('penalidades' as any) as any)
    .insert({
      incidencia_id: incidenciaCreada.id,
      vehiculo_id: vehiculo.id,
      conductor_id: conductor.id,
      tipo_cobro_descuento_id: tipoMulta.id,
      semana,
      fecha,
      turno,
      area_responsable: ctx.areaResponsable || 'ADMINISTRACION',
      detalle: 'Cobro por multa',
      monto,
      observaciones: descripcion,
      aplicado: false,
      rechazado: false,
      conductor_nombre: conductor.nombre_completo,
      vehiculo_patente: vehiculo.patente,
      created_by: ctx.userId || null,
      created_by_name: ctx.userName || 'Sistema',
      sede_id: sedeId
    })
    .select('id')
    .single()
  if (penError || !penalidadCreada) return { ok: false, error: penError?.message || 'Error al crear la penalidad' }

  return { ok: true, incidenciaId: incidenciaCreada.id, penalidadId: penalidadCreada.id }
}

function buildDescripcion(multa: MultaInput): string {
  return `Multa ${multa.infraccion ? `(${multa.infraccion})` : ''} — ${multa.lugar || 's/lugar'}${multa.detalle ? ` — ${multa.detalle}` : ''}`.trim()
}

function findConductorByName(
  conductores: Array<{ id: string; nombre_completo: string }>,
  rawName: string | null | undefined
): { id: string; nombre_completo: string } | null {
  const n = normalizeName(rawName)
  if (!n) return null
  let c = conductores.find(x => normalizeName(x.nombre_completo) === n)
  if (c) return c
  const tokens = n.split(' ').filter(t => t.length >= 3)
  if (tokens.length === 0) return null
  c = conductores.find(x => {
    const candidate = normalizeName(x.nombre_completo)
    return tokens.every(t => candidate.includes(t))
  })
  return c || null
}
