// src/components/admin/auditoriaDetalle.ts
// Convierte un registro de auditoría (JSON técnico) en algo que entiende cualquier
// usuario: una frase de resumen + una lista "Campo: valor" con nombres en castellano,
// montos en pesos, fechas legibles y los IDs reemplazados por nombres (conductor,
// vehículo, sede, usuario). Los campos internos (ids, fechas de sistema) se ocultan.
import { supabase } from '../../lib/supabase'

type Datos = Record<string, unknown>

// Campos técnicos que no aportan al usuario
const OCULTOS = new Set([
  'id', 'created_at', 'updated_at', 'created_by', 'updated_by', 'created_by_name',
  'updated_by_name', 'deleted_at', 'search_vector', 'metadata', 'raw', 'payload',
])

// Nombres de campos más comunes
const ETIQUETAS: Record<string, string> = {
  anio: 'Año', semana: 'Semana', tipo: 'Tipo', monto: 'Monto', concepto: 'Concepto',
  referencia: 'Referencia', fecha_abono: 'Fecha del abono', conductor_id: 'Conductor',
  vehiculo_id: 'Vehículo', sede_id: 'Sede', user_id: 'Usuario', usuario_id: 'Usuario',
  asignacion_id: 'Asignación', estado: 'Estado', estado_id: 'Estado', motivo: 'Motivo',
  motivo_baja: 'Motivo de baja', fecha_terminacion: 'Fecha de baja', observaciones: 'Observaciones',
  descripcion: 'Descripción', nombre: 'Nombre', nombres: 'Nombres', apellidos: 'Apellidos',
  numero_dni: 'DNI', dni: 'DNI', telefono: 'Teléfono', email: 'Email', patente: 'Patente',
  marca: 'Marca', modelo: 'Modelo', categoria: 'Categoría', kilometraje: 'Kilometraje',
  saldo_actual: 'Saldo', saldo: 'Saldo', importe: 'Importe', total: 'Total', fecha: 'Fecha',
  fecha_inicio: 'Desde', fecha_fin: 'Hasta', turno: 'Turno', modalidad: 'Modalidad',
  can_view: 'Puede ver', can_create: 'Puede crear', can_edit: 'Puede editar', can_delete: 'Puede eliminar',
  role_id: 'Rol', menu_id: 'Menú', submenu_id: 'Submenú', is_active: 'Activo', activo: 'Activo',
  monto_total: 'Monto total', cuotas: 'Cuotas', cuota: 'Cuota', periodo_id: 'Período',
}

const ES_MONTO = /(monto|importe|saldo|total|precio|deuda|garantia|abono|pago|cuota_valor)/i
const ES_FECHA = /(fecha|_at$|vencimiento|^desde$|^hasta$)/i

export function etiquetaCampo(campo: string): string {
  if (ETIQUETAS[campo]) return ETIQUETAS[campo]
  const limpio = campo.replace(/_id$/, '').replace(/_/g, ' ')
  return limpio.charAt(0).toUpperCase() + limpio.slice(1)
}

/** Busca los nombres de los IDs que aparecen (conductor, vehículo, sede, usuario, rol). */
async function resolverNombres(datos: Datos[]): Promise<Map<string, string>> {
  const ids = { conductores: new Set<string>(), vehiculos: new Set<string>(), sedes: new Set<string>(), usuarios: new Set<string>(), roles: new Set<string>() }
  for (const d of datos) {
    for (const [k, v] of Object.entries(d)) {
      if (typeof v !== 'string' || !v) continue
      if (k === 'conductor_id') ids.conductores.add(v)
      else if (k === 'vehiculo_id') ids.vehiculos.add(v)
      else if (k === 'sede_id') ids.sedes.add(v)
      else if (k === 'user_id' || k === 'usuario_id') ids.usuarios.add(v)
      else if (k === 'role_id') ids.roles.add(v)
    }
  }
  const nombres = new Map<string, string>()
  const consultas: Promise<void>[] = []
  const pedir = (tabla: string, campos: string, set: Set<string>, armar: (r: any) => string) => {
    if (!set.size) return
    consultas.push((async () => {
      const { data } = await (supabase.from(tabla) as any).select(campos).in('id', [...set])
      for (const r of (data || []) as any[]) nombres.set(r.id, armar(r))
    })())
  }
  pedir('conductores', 'id, nombres, apellidos', ids.conductores, r => `${r.nombres || ''} ${r.apellidos || ''}`.trim() || 'Conductor')
  pedir('vehiculos', 'id, patente', ids.vehiculos, r => r.patente || 'Vehículo')
  pedir('sedes', 'id, nombre', ids.sedes, r => r.nombre || 'Sede')
  pedir('user_profiles', 'id, full_name', ids.usuarios, r => r.full_name || 'Usuario')
  pedir('roles', 'id, name', ids.roles, r => r.name || 'Rol')
  await Promise.all(consultas.map(p => p.catch(() => undefined)))
  return nombres
}

function formatearValor(campo: string, valor: unknown, nombres: Map<string, string>): string {
  if (valor === null || valor === undefined || valor === '') return '—'
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No'
  if (typeof valor === 'string' && nombres.has(valor)) return nombres.get(valor)!
  if (typeof valor === 'number' && ES_MONTO.test(campo)) {
    return valor.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
  }
  if (typeof valor === 'string' && ES_FECHA.test(campo) && /^\d{4}-\d{2}-\d{2}/.test(valor)) {
    const tieneHora = valor.length > 10
    const d = new Date(tieneHora ? valor : `${valor}T12:00:00`)
    if (!isNaN(d.getTime())) {
      return tieneHora
        ? d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : d.toLocaleDateString('es-AR')
    }
  }
  if (typeof valor === 'object') {
    const txt = JSON.stringify(valor)
    return txt.length > 120 ? `${txt.slice(0, 120)}…` : txt
  }
  const txt = String(valor)
  // UUID que no pudimos traducir: no aporta
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(txt)) return '(registro interno)'
  return txt.length > 200 ? `${txt.slice(0, 200)}…` : txt
}

function escapar(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Arma el HTML del detalle (para SweetAlert). */
export async function detalleLegible(opts: {
  accion: 'INSERT' | 'UPDATE' | 'DELETE'
  modulo: string
  usuario: string
  fecha: string
  anteriores: Datos | null
  nuevos: Datos | null
  campos: string[] | null
}): Promise<string> {
  const { accion, modulo, usuario, fecha, anteriores, nuevos, campos } = opts
  const datos = (accion === 'DELETE' ? anteriores : nuevos) || {}
  const nombres = await resolverNombres([anteriores || {}, nuevos || {}])
  const fechaTxt = new Date(fecha).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  // Frase de resumen
  const verbo = accion === 'INSERT' ? 'creó' : accion === 'DELETE' ? 'eliminó' : 'modificó'
  const sobre = ['conductor_id', 'vehiculo_id'].map(k => datos[k]).find(v => typeof v === 'string' && nombres.has(v as string)) as string | undefined
  const monto = Object.entries(datos).find(([k, v]) => typeof v === 'number' && ES_MONTO.test(k))
  let frase = `<strong>${escapar(usuario)}</strong> ${verbo} un registro de <strong>${escapar(modulo)}</strong>`
  if (sobre) frase += ` de <strong>${escapar(nombres.get(sobre)!)}</strong>`
  if (monto && accion !== 'UPDATE') frase += ` por <strong>${escapar(formatearValor(monto[0], monto[1], nombres))}</strong>`
  frase += ` el ${fechaTxt}.`

  const fila = (a: string, b: string, c?: string) => c === undefined
    ? `<tr><td style="padding:6px 10px;color:#6b7280;width:38%;border-bottom:1px solid #f0f0f0;">${a}</td><td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;">${b}</td></tr>`
    : `<tr><td style="padding:6px 10px;color:#6b7280;border-bottom:1px solid #f0f0f0;">${a}</td><td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;color:#b91c1c;text-decoration:line-through;">${b}</td><td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;color:#047857;font-weight:600;">${c}</td></tr>`

  let tabla = ''
  if (accion === 'UPDATE') {
    const lista = (campos || []).filter(c => !OCULTOS.has(c))
    tabla = lista.length
      ? `<table style="width:100%;border-collapse:collapse;font-size:13px;"><tr><th style="text-align:left;padding:6px 10px;color:#9ca3af;font-weight:600;">Dato</th><th style="text-align:left;padding:6px 10px;color:#9ca3af;font-weight:600;">Antes</th><th style="text-align:left;padding:6px 10px;color:#9ca3af;font-weight:600;">Ahora</th></tr>${lista.map(c => fila(escapar(etiquetaCampo(c)), escapar(formatearValor(c, anteriores?.[c], nombres)), escapar(formatearValor(c, nuevos?.[c], nombres)))).join('')}</table>`
      : '<p style="color:#6b7280;font-size:13px;">Solo cambiaron datos internos del sistema.</p>'
  } else {
    const filas = Object.entries(datos)
      .filter(([k, v]) => !OCULTOS.has(k) && v !== null && v !== undefined && v !== '')
      .map(([k, v]) => fila(escapar(etiquetaCampo(k)), escapar(formatearValor(k, v, nombres))))
    tabla = filas.length
      ? `<table style="width:100%;border-collapse:collapse;font-size:13px;">${filas.join('')}</table>`
      : '<p style="color:#6b7280;font-size:13px;">Sin datos para mostrar.</p>'
  }

  return `
    <div style="text-align:left;font-size:14px;line-height:1.5;margin-bottom:14px;">${frase}</div>
    <div style="text-align:left;max-height:380px;overflow-y:auto;">${tabla}</div>
  `
}
