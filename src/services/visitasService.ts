// ============================================================
// Service layer para el módulo de Visitas
// Responsabilidad única: acceso a datos + lógica de negocio
// ============================================================

import { supabase } from '../lib/supabase';
import type {
  VisitaCategoria,
  VisitaMotivo,
  VisitaMotivoConCategoria,
  VisitaAtendedor,
  VisitaHorario,
  VisitaCompleta,
  VisitaEstado,
  VisitaFormData,
  VisitaCalendarEvent,
  CalendarResource,
} from '../types/visitas.types';

// --- Catálogos ---

export async function fetchCategorias(): Promise<VisitaCategoria[]> {
  const { data, error } = await supabase
    .from('visitas_categorias')
    .select('id, nombre, color, duracion_default, requiere_patente, tipo_visita, duracion_modificable, max_sesiones_dia, orden, activo, created_at')
    .eq('activo', true)
    .order('orden');
  if (error) throw error;
  return data ?? [];
}

export async function fetchMotivos(): Promise<VisitaMotivo[]> {
  const { data, error } = await supabase
    .from('visitas_motivos')
    .select('id, categoria_id, nombre, activo, created_at')
    .eq('activo', true)
    .order('nombre');
  if (error) throw error;
  return data ?? [];
}

export async function fetchAtendedores(sedeId: string | null): Promise<VisitaAtendedor[]> {
  let query = supabase
    .from('visitas_atendedores')
    .select('id, nombre, user_id, sede_id, activo, created_at')
    .eq('activo', true)
    .order('nombre');
  if (sedeId) query = query.eq('sede_id', sedeId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function fetchHorarios(atendedorIds: string[]): Promise<VisitaHorario[]> {
  if (atendedorIds.length === 0) return [];
  const { data, error } = await supabase
    .from('visitas_horarios')
    .select('id, atendedor_id, dia_semana, hora_inicio, hora_fin, activo')
    .in('atendedor_id', atendedorIds)
    .eq('activo', true);
  if (error) throw error;
  return data ?? [];
}

// --- Visitas CRUD ---

export async function fetchVisitas(
  sedeId: string | null,
  rangeStart: string,
  rangeEnd: string
): Promise<VisitaCompleta[]> {
  let query = supabase
    .from('visitas')
    .select(`
      *,
      categoria:visitas_categorias!inner(nombre, color),
      motivo:visitas_motivos(nombre),
      atendedor:visitas_atendedores!inner(nombre)
    `)
    .gte('fecha_hora', rangeStart)
    .lte('fecha_hora', rangeEnd)
    .order('fecha_hora');

  if (sedeId) query = query.eq('sede_id', sedeId);

  const { data, error } = await query;
  if (error) throw error;

  // Obtener nombres de citadores desde user_profiles
  const citadorIds = [...new Set((data ?? []).map((v: any) => v.citador_id).filter(Boolean))]
  const citadorNombres: Record<string, string> = {}
  if (citadorIds.length > 0) {
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, full_name')
      .in('id', citadorIds)
    for (const p of profiles ?? []) {
      if ((p as any).full_name) citadorNombres[(p as any).id] = (p as any).full_name
    }
  }

  return (data ?? []).map((v: Record<string, unknown>) => {
    const cat = v.categoria as { nombre: string; color: string } | null;
    const mot = v.motivo as { nombre: string } | null;
    const ate = v.atendedor as { nombre: string } | null;
    const citId = (v as any).citador_id
    return {
      ...(v as unknown as VisitaCompleta),
      categoria_nombre: cat?.nombre ?? '',
      categoria_color: cat?.color ?? '#3b82f6',
      motivo_nombre: mot?.nombre ?? null,
      atendedor_nombre: ate?.nombre ?? '',
      citador_nombre: (citId && citadorNombres[citId]) || (v as any).citador_nombre || '',
    };
  });
}

/**
 * Construye un ISO timestamp con el offset del browser local.
 * Ej: "2026-03-09" + "10:00" en Argentina (UTC-3) → "2026-03-09T10:00:00-03:00"
 * Así Supabase (timestamptz) lo interpreta correctamente sin importar la TZ del server.
 */
export function buildLocalTimestamp(fecha: string, hora: string): string {
  // Siempre usar timezone Argentina (UTC-3) independiente del navegador
  return `${fecha}T${hora}:00-03:00`;
}

export async function createVisita(
  formData: VisitaFormData,
  sedeId: string,
  citadorId: string,
  citadorNombre: string
): Promise<void> {
  const fechaHora = buildLocalTimestamp(formData.fecha, formData.hora);

  const { error } = await supabase.from('visitas').insert({
    categoria_id: formData.categoria_id,
    motivo_id: formData.motivo_id || null,
    atendedor_id: formData.atendedor_id,
    sede_id: sedeId,
    nombre_visitante: formData.nombre_visitante.trim(),
    dni_visitante: formData.dni_visitante.trim() || null,
    patente: formData.patente.trim() || null,
    fecha_hora: fechaHora,
    duracion_minutos: formData.duracion_minutos,
    nota: formData.nota.trim() || null,
    estado: 'pendiente',
    citador_id: citadorId,
    citador_nombre: citadorNombre,
  });
  if (error) throw error;
}

export async function updateVisita(
  id: string,
  formData: VisitaFormData
): Promise<void> {
  const fechaHora = buildLocalTimestamp(formData.fecha, formData.hora);

  const { error } = await supabase.from('visitas').update({
    categoria_id: formData.categoria_id,
    motivo_id: formData.motivo_id || null,
    atendedor_id: formData.atendedor_id,
    nombre_visitante: formData.nombre_visitante.trim(),
    dni_visitante: formData.dni_visitante.trim() || null,
    patente: formData.patente.trim() || null,
    fecha_hora: fechaHora,
    duracion_minutos: formData.duracion_minutos,
    nota: formData.nota.trim() || null,
  }).eq('id', id);
  if (error) throw error;
}

export async function updateVisitaEstado(id: string, estado: VisitaEstado): Promise<void> {
  const { error } = await supabase
    .from('visitas')
    .update({ estado })
    .eq('id', id);
  if (error) throw error;
}

export async function cancelarVisitaConMotivo(id: string, motivo: string, notaActual: string | null): Promise<void> {
  const nuevaNota = notaActual
    ? `${notaActual}\n[Cancelada: ${motivo}]`
    : `[Cancelada: ${motivo}]`;
  const { error } = await supabase
    .from('visitas')
    .update({ estado: 'cancelada' as VisitaEstado, nota: nuevaNota })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteVisita(id: string): Promise<void> {
  const { error } = await supabase
    .from('visitas')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

/**
 * Auto-actualiza estados de visitas según la hora actual:
 * - pendiente + hora_inicio ya pasó → en_curso
 * - pendiente/en_curso + hora_fin ya pasó → completada
 * No toca las canceladas (estado terminal manual).
 * Retorna las visitas con el estado ya corregido.
 */
export async function autoUpdateEstados(visitas: VisitaCompleta[]): Promise<VisitaCompleta[]> {
  const now = new Date();
  const updates: { id: string; estado: VisitaEstado }[] = [];

  const result = visitas.map(v => {
    // Solo auto-transicionar pendiente y en_curso
    if (v.estado !== 'pendiente' && v.estado !== 'en_curso') return v;

    const inicio = new Date(v.fecha_hora);
    const fin = new Date(inicio.getTime() + v.duracion_minutos * 60_000);

    let nuevoEstado: VisitaEstado = v.estado as VisitaEstado;

    if (now >= fin) {
      // Ya pasó la hora de fin → completada
      nuevoEstado = 'completada';
    } else if (now >= inicio && v.estado === 'pendiente') {
      // Ya empezó pero no terminó → en_curso
      nuevoEstado = 'en_curso';
    }

    if (nuevoEstado !== v.estado) {
      updates.push({ id: v.id, estado: nuevoEstado });
      return { ...v, estado: nuevoEstado };
    }
    return v;
  });

  // Actualizar en DB en paralelo (fire & forget, no bloquea UI)
  if (updates.length > 0) {
    for (const u of updates) {
      supabase
        .from('visitas')
        .update({ estado: u.estado })
        .eq('id', u.id)
        .then();
    }
  }

  return result;
}

// --- Lógica de negocio ---

export async function checkConflict(
  atendedorId: string,
  fechaHora: string,
  duracionMinutos: number,
  excludeVisitaId?: string
): Promise<boolean> {
  const { data, error } = await supabase.rpc('check_visita_conflict', {
    p_atendedor_id: atendedorId,
    p_fecha_hora: fechaHora,
    p_duracion_minutos: duracionMinutos,
    p_exclude_visita_id: excludeVisitaId ?? null,
  });
  if (error) throw error;
  return data as boolean;
}

// --- Transformaciones (puro, sin side effects) ---

/**
 * Convierte un timestamp a hora Argentina para react-big-calendar.
 * Extrae año/mes/día/hora/minuto en zona Argentina y crea un Date "local"
 * con esos valores, así el calendario los muestra correctamente.
 */
function toArgentinaDate(isoString: string): Date {
  const d = new Date(isoString);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value || '0');
  return new Date(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
}

export function toCalendarEvents(visitas: VisitaCompleta[]): VisitaCalendarEvent[] {
  return visitas.map((v) => {
    const start = toArgentinaDate(v.fecha_hora);
    const end = new Date(start.getTime() + v.duracion_minutos * 60_000);
    const masked = (v as VisitaCompleta & { _masked?: boolean })._masked;
    return {
      id: v.id,
      title: masked ? 'Reservado' : `${v.nombre_visitante} - ${v.categoria_nombre}`,
      start,
      end,
      resourceId: v.atendedor_id,
      visita: v,
    };
  });
}

export function toCalendarResources(atendedores: VisitaAtendedor[]): CalendarResource[] {
  return atendedores.map((a) => ({
    id: a.id,
    title: a.nombre,
  }));
}

export function getMotivosByCategoria(
  motivos: VisitaMotivo[],
  categoriaId: string
): VisitaMotivo[] {
  return motivos.filter((m) => m.categoria_id === categoriaId);
}

// --- ABM Parámetros: Categorías ---

export async function fetchAllCategorias(): Promise<VisitaCategoria[]> {
  const { data, error } = await supabase
    .from('visitas_categorias')
    .select('id, nombre, color, duracion_default, requiere_patente, orden, activo, created_at, tipo_visita, duracion_modificable, max_sesiones_dia')
    .order('orden');
  if (error) throw error;
  return data ?? [];
}

export async function createCategoria(
  payload: Omit<VisitaCategoria, 'id' | 'created_at'>
): Promise<void> {
  const { error } = await supabase.from('visitas_categorias').insert(payload);
  if (error) throw error;
}

export async function updateCategoria(
  id: string,
  payload: Partial<Omit<VisitaCategoria, 'id' | 'created_at'>>
): Promise<void> {
  const { error } = await supabase.from('visitas_categorias').update(payload).eq('id', id);
  if (error) throw error;
}

export async function deleteCategoria(id: string): Promise<void> {
  const { error } = await supabase.from('visitas_categorias').delete().eq('id', id);
  if (error) throw error;
}

// --- ABM Parámetros: Motivos ---

export async function fetchAllMotivos(): Promise<VisitaMotivoConCategoria[]> {
  const { data, error } = await supabase
    .from('visitas_motivos')
    .select('*, categoria:visitas_categorias!inner(nombre)')
    .order('nombre');
  if (error) throw error;
  return (data ?? []).map((m: Record<string, unknown>) => ({
    ...(m as unknown as VisitaMotivo),
    categoria_nombre: (m.categoria as { nombre: string })?.nombre ?? '',
  }));
}

export async function createMotivo(
  payload: Omit<VisitaMotivo, 'id' | 'created_at'>
): Promise<void> {
  const { error } = await supabase.from('visitas_motivos').insert(payload);
  if (error) throw error;
}

export async function updateMotivo(
  id: string,
  payload: Partial<Omit<VisitaMotivo, 'id' | 'created_at'>>
): Promise<void> {
  const { error } = await supabase.from('visitas_motivos').update(payload).eq('id', id);
  if (error) throw error;
}

export async function deleteMotivo(id: string): Promise<void> {
  const { error } = await supabase.from('visitas_motivos').delete().eq('id', id);
  if (error) throw error;
}

// --- ABM Parámetros: Anfitriones ---

export async function fetchAllAtendedores(sedeId: string | null): Promise<VisitaAtendedor[]> {
  let query = supabase
    .from('visitas_atendedores')
    .select('id, nombre, user_id, sede_id, activo, created_at')
    .order('nombre');
  if (sedeId) query = query.eq('sede_id', sedeId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function createAtendedor(
  payload: Omit<VisitaAtendedor, 'id' | 'created_at'>
): Promise<void> {
  const { error } = await supabase.from('visitas_atendedores').insert(payload);
  if (error) throw error;
}

export async function updateAtendedor(
  id: string,
  payload: Partial<Omit<VisitaAtendedor, 'id' | 'created_at'>>
): Promise<void> {
  const { error } = await supabase.from('visitas_atendedores').update(payload).eq('id', id);
  if (error) throw error;
}

export async function deleteAtendedor(id: string): Promise<void> {
  const { error } = await supabase.from('visitas_atendedores').update({ activo: false }).eq('id', id);
  if (error) throw error;
}

// --- ABM Parámetros: Horarios ---

export async function fetchHorariosByAtendedor(atendedorId: string): Promise<VisitaHorario[]> {
  const { data, error } = await supabase
    .from('visitas_horarios')
    .select('id, atendedor_id, dia_semana, hora_inicio, hora_fin, activo')
    .eq('atendedor_id', atendedorId)
    .order('dia_semana');
  if (error) throw error;
  return data ?? [];
}

export async function upsertHorarios(
  atendedorId: string,
  horarios: Array<{ dia_semana: number; hora_inicio: string; hora_fin: string; activo: boolean }>
): Promise<void> {
  // Eliminar horarios existentes y recrear
  const { error: delError } = await supabase
    .from('visitas_horarios')
    .delete()
    .eq('atendedor_id', atendedorId);
  if (delError) throw delError;

  if (horarios.length === 0) return;

  const rows = horarios.map((h) => ({
    atendedor_id: atendedorId,
    dia_semana: h.dia_semana,
    hora_inicio: h.hora_inicio,
    hora_fin: h.hora_fin,
    activo: h.activo,
  }));

  const { error: insError } = await supabase.from('visitas_horarios').insert(rows);
  if (insError) throw insError;
}

// --- ABM: Motivo → Atendedor (auto-asignación) ---

/** Devuelve mapa motivo_id → atendedor_id para una sede */
export async function fetchMotivoAtendedores(sedeId: string | null): Promise<Map<string, string>> {
  let query = (supabase as any)
    .from('visitas_motivo_atendedor')
    .select('motivo_id, atendedor_id');
  if (sedeId) query = query.eq('sede_id', sedeId);
  const { data, error } = await query;
  if (error) throw error;
  return new Map((data ?? []).map((r: any) => [r.motivo_id, r.atendedor_id]));
}

/** Devuelve los motivo_ids asignados a un atendedor */
export async function fetchMotivosDeAtendedor(atendedorId: string): Promise<string[]> {
  const { data, error } = await (supabase as any)
    .from('visitas_motivo_atendedor')
    .select('motivo_id')
    .eq('atendedor_id', atendedorId);
  if (error) throw error;
  return (data ?? []).map((r: any) => r.motivo_id);
}

/** Reemplaza los motivos del atendedor: borra los anteriores e inserta los nuevos */
export async function saveMotivoAtendedores(
  atendedorId: string,
  motivoIds: string[],
  sedeId: string
): Promise<void> {
  const { error: delErr } = await (supabase as any)
    .from('visitas_motivo_atendedor')
    .delete()
    .eq('atendedor_id', atendedorId);
  if (delErr) throw delErr;

  if (motivoIds.length === 0) return;

  const rows = motivoIds.map((motivo_id) => ({ atendedor_id: atendedorId, motivo_id, sede_id: sedeId }));
  const { error: insErr } = await (supabase as any).from('visitas_motivo_atendedor').insert(rows);
  if (insErr) throw insErr;
}
