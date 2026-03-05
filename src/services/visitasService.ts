// ============================================================
// Service layer para el módulo de Visitas
// Responsabilidad única: acceso a datos + lógica de negocio
// ============================================================

import { supabase } from '../lib/supabase';
import type {
  VisitaCategoria,
  VisitaMotivo,
  VisitaMotivoConCategoria,
  VisitaArea,
  VisitaAtendedor,
  VisitaHorario,
  VisitaCompleta,
  VisitaEstado,
  VisitaFormData,
  VisitaCalendarEvent,
  CalendarResource,
  VisitaAtendedorConArea,
} from '../types/visitas.types';

// --- Catálogos ---

export async function fetchCategorias(): Promise<VisitaCategoria[]> {
  const { data, error } = await supabase
    .from('visitas_categorias')
    .select('*')
    .eq('activo', true)
    .order('orden');
  if (error) throw error;
  return data ?? [];
}

export async function fetchMotivos(): Promise<VisitaMotivo[]> {
  const { data, error } = await supabase
    .from('visitas_motivos')
    .select('*')
    .eq('activo', true)
    .order('nombre');
  if (error) throw error;
  return data ?? [];
}

export async function fetchAreas(sedeId: string | null): Promise<VisitaArea[]> {
  let query = supabase
    .from('visitas_areas')
    .select('*')
    .eq('activo', true)
    .order('orden');
  if (sedeId) query = query.eq('sede_id', sedeId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function fetchAtendedores(sedeId: string | null): Promise<VisitaAtendedorConArea[]> {
  let query = supabase
    .from('visitas_atendedores')
    .select('*, area:visitas_areas!inner(nombre)')
    .eq('activo', true)
    .order('nombre');
  if (sedeId) query = query.eq('sede_id', sedeId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((a: Record<string, unknown>) => ({
    ...(a as unknown as VisitaAtendedor),
    area_nombre: (a.area as { nombre: string })?.nombre ?? '',
  }));
}

export async function fetchHorarios(atendedorIds: string[]): Promise<VisitaHorario[]> {
  if (atendedorIds.length === 0) return [];
  const { data, error } = await supabase
    .from('visitas_horarios')
    .select('*')
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
      atendedor:visitas_atendedores!inner(nombre, area:visitas_areas!inner(nombre))
    `)
    .gte('fecha_hora', rangeStart)
    .lte('fecha_hora', rangeEnd)
    .order('fecha_hora');

  if (sedeId) query = query.eq('sede_id', sedeId);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((v: Record<string, unknown>) => {
    const cat = v.categoria as { nombre: string; color: string } | null;
    const mot = v.motivo as { nombre: string } | null;
    const ate = v.atendedor as { nombre: string; area: { nombre: string } } | null;
    return {
      ...(v as unknown as VisitaCompleta),
      categoria_nombre: cat?.nombre ?? '',
      categoria_color: cat?.color ?? '#3b82f6',
      motivo_nombre: mot?.nombre ?? null,
      atendedor_nombre: ate?.nombre ?? '',
      area_nombre: ate?.area?.nombre ?? '',
    };
  });
}

export async function createVisita(
  formData: VisitaFormData,
  sedeId: string,
  citadorId: string,
  citadorNombre: string
): Promise<void> {
  const fechaHora = `${formData.fecha}T${formData.hora}:00`;

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
  const fechaHora = `${formData.fecha}T${formData.hora}:00`;

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

export async function deleteVisita(id: string): Promise<void> {
  const { error } = await supabase
    .from('visitas')
    .delete()
    .eq('id', id);
  if (error) throw error;
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

export function toCalendarEvents(visitas: VisitaCompleta[]): VisitaCalendarEvent[] {
  return visitas.map((v) => {
    const start = new Date(v.fecha_hora);
    const end = new Date(start.getTime() + v.duracion_minutos * 60_000);
    return {
      id: v.id,
      title: `${v.nombre_visitante} - ${v.categoria_nombre}`,
      start,
      end,
      resourceId: v.atendedor_id,
      visita: v,
    };
  });
}

export function toCalendarResources(atendedores: VisitaAtendedorConArea[]): CalendarResource[] {
  return atendedores.map((a) => ({
    id: a.id,
    title: a.nombre,
    area: a.area_nombre,
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
    .select('*')
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

// --- ABM Parámetros: Áreas ---

export async function fetchAllAreas(sedeId: string | null): Promise<VisitaArea[]> {
  let query = supabase
    .from('visitas_areas')
    .select('*')
    .order('orden');
  if (sedeId) query = query.eq('sede_id', sedeId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function createArea(
  payload: Omit<VisitaArea, 'id' | 'created_at'>
): Promise<void> {
  const { error } = await supabase.from('visitas_areas').insert(payload);
  if (error) throw error;
}

export async function updateArea(
  id: string,
  payload: Partial<Omit<VisitaArea, 'id' | 'created_at'>>
): Promise<void> {
  const { error } = await supabase.from('visitas_areas').update(payload).eq('id', id);
  if (error) throw error;
}

export async function deleteArea(id: string): Promise<void> {
  const { error } = await supabase.from('visitas_areas').delete().eq('id', id);
  if (error) throw error;
}

// --- ABM Parámetros: Atendedores ---

export async function fetchAllAtendedores(sedeId: string | null): Promise<VisitaAtendedorConArea[]> {
  let query = supabase
    .from('visitas_atendedores')
    .select('*, area:visitas_areas!inner(nombre)')
    .order('nombre');
  if (sedeId) query = query.eq('sede_id', sedeId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((a: Record<string, unknown>) => ({
    ...(a as unknown as VisitaAtendedor),
    area_nombre: (a.area as { nombre: string })?.nombre ?? '',
  }));
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
  const { error } = await supabase.from('visitas_atendedores').delete().eq('id', id);
  if (error) throw error;
}

// --- ABM Parámetros: Horarios ---

export async function fetchHorariosByAtendedor(atendedorId: string): Promise<VisitaHorario[]> {
  const { data, error } = await supabase
    .from('visitas_horarios')
    .select('*')
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
