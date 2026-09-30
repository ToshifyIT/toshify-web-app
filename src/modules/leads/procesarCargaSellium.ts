// src/modules/leads/procesarCargaSellium.ts
/**
 * Orquestación de la carga masiva formato Sellium: lee los leads existentes,
 * arma el plan (cargaMasivaSellium.ts), muestra el resumen para confirmar y
 * escribe (crea / actualiza) en Supabase.
 *
 * El resumen es navegable: cada conteo se puede clickear para ver el detalle
 * (qué se crea, qué campo cambia de qué valor a cuál, conflictos, etc.) y todo
 * el detalle se puede descargar en Excel antes de confirmar.
 */
import Swal from 'sweetalert2'
import { supabase } from '../../lib/supabase'
import type { SedeRef } from '../../utils/sedeMatch'
import {
  COLUMNAS_INDICE,
  construirIndice,
  escaparHtml,
  mapearFilasSellium,
  planificarCarga,
  type FilaSellium,
  type LeadExistente,
  type PlanCarga,
} from './cargaMasivaSellium'

interface OpcionesCargaSellium {
  filas: Record<string, unknown>[]
  headers: string[]
  sedes: SedeRef[]
}

const PAGINA = 1000
const LOTE_INSERT = 200
const CONCURRENCIA_UPDATE = 8

/** Devuelve true si se escribió algo en la base (para recargar la grilla). */
export async function procesarCargaSellium({ filas, headers, sedes }: OpcionesCargaSellium): Promise<boolean> {
  Swal.fire({
    title: 'Analizando archivo Sellium...',
    html: '<p>Cruzando teléfonos y correos con los leads existentes</p>',
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading(),
  })

  const filasSellium = mapearFilasSellium(filas, headers)
    .filter(f => f.telefono || f.email || f.nombreCompleto)

  // Todos los leads (sin filtro de sede): el cruce tiene que ver toda la base para no duplicar.
  const existentes: LeadExistente[] = []
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await supabase
      .from('leads')
      .select(COLUMNAS_INDICE)
      .order('id')
      .range(desde, desde + PAGINA - 1)
    if (error) throw new Error(`No se pudieron leer los leads existentes: ${error.message}`)
    if (!data?.length) break
    existentes.push(...(data as unknown as LeadExistente[]))
  }

  const plan = planificarCarga(filasSellium, construirIndice(existentes), sedes)
  const secciones = armarSecciones(plan)
  const ctx: ContextoDetalle = { secciones, headers }
  Swal.close()

  if (plan.crear.length + plan.actualizar.length === 0) {
    await Swal.fire({
      title: 'Nada para cargar',
      html: htmlResumen(plan, filasSellium.length, secciones),
      icon: 'info',
      width: 960,
      didOpen: popup => activarDetalle(popup, ctx),
    })
    return false
  }

  const confirmacion = await Swal.fire({
    title: 'Formato Sellium — revisar antes de subir',
    html: htmlResumen(plan, filasSellium.length, secciones),
    icon: 'question',
    width: 960,
    showCancelButton: true,
    confirmButtonColor: '#10B981',
    confirmButtonText: `Sí, crear ${plan.crear.length} y actualizar ${plan.actualizar.length}`,
    cancelButtonText: 'Cancelar',
    didOpen: popup => activarDetalle(popup, ctx),
  })
  if (!confirmacion.isConfirmed) return false

  // ─── Escritura ───
  const total = plan.crear.length + plan.actualizar.length
  let creados = 0
  let actualizados = 0
  const errores: string[] = []
  const progreso = () => Swal.update({ html: `<p>Procesando ${creados + actualizados + errores.length} de ${total} registros</p>` })

  Swal.fire({
    title: 'Cargando datos...',
    html: `<p>Procesando 0 de ${total} registros</p>`,
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading(),
  })

  for (let i = 0; i < plan.crear.length; i += LOTE_INSERT) {
    const lote = plan.crear.slice(i, i + LOTE_INSERT)
    const { error } = await supabase.from('leads').insert(lote.map(a => a.payload))
    if (!error) {
      creados += lote.length
    } else {
      // El lote falló: fila por fila para aislar las que tienen problema.
      for (const a of lote) {
        const { error: e } = await supabase.from('leads').insert(a.payload)
        if (e) errores.push(`Fila ${a.fila.numero} (${escaparHtml(nombreFila(a.fila))}): ${escaparHtml(e.message)}`)
        else creados++
      }
    }
    progreso()
  }

  const ahora = new Date().toISOString()
  for (let i = 0; i < plan.actualizar.length; i += CONCURRENCIA_UPDATE) {
    const lote = plan.actualizar.slice(i, i + CONCURRENCIA_UPDATE)
    const resultados = await Promise.all(lote.map(a =>
      supabase.from('leads').update({ ...a.payload, updated_at: ahora }).eq('id', a.lead.id),
    ))
    resultados.forEach(({ error }, j) => {
      if (error) errores.push(`Fila ${lote[j].fila.numero} (${escaparHtml(nombreFila(lote[j].fila))}): ${escaparHtml(error.message)}`)
      else actualizados++
    })
    progreso()
  }

  Swal.close()

  const noProcesados = plan.conflictos.length + plan.conductores.length + plan.invalidas.length
  await Swal.fire({
    title: errores.length ? (creados + actualizados ? 'Carga parcial' : 'Error en la carga') : 'Carga exitosa',
    icon: errores.length ? 'warning' : 'success',
    width: 600,
    html: `
      <div style="font-size:14px;text-align:left;">
        <p>Creados: <strong>${creados}</strong></p>
        <p>Actualizados: <strong>${actualizados}</strong></p>
        ${plan.sinCambios.length ? `<p>Sin cambios: <strong>${plan.sinCambios.length}</strong></p>` : ''}
        ${noProcesados ? `<p style="color:#D97706;">No procesados (conflictos / conductores / inválidos): <strong>${noProcesados}</strong></p>` : ''}
        ${errores.length ? `<p style="color:#EF4444;">Errores: <strong>${errores.length}</strong></p>${listaHtml(errores.slice(0, 10), errores.length)}` : ''}
      </div>`,
  })
  return creados + actualizados > 0
}

// ───────────────────────── Detalle por sección ─────────────────────────

type ClaveSeccion = 'crear' | 'actualizar' | 'parciales' | 'sin_cambios' | 'conductores' | 'conflictos' | 'bloqueados' | 'invalidas'

interface Seccion {
  titulo: string
  columnas: string[]
  filas: string[][]
  /** Filas del archivo que componen la sección (para re-exportarlas en formato Sellium). */
  origen: FilaSellium[]
}

type Secciones = Record<ClaveSeccion, Seccion>

interface ContextoDetalle {
  secciones: Secciones
  /** Encabezados del archivo subido, en su orden original. */
  headers: string[]
}

/** Secciones que se pueden bajar en el formato original para corregir y volver a subir. */
const REEXPORTABLES: Partial<Record<ClaveSeccion, string>> = {
  sin_cambios: 'sin_cambios',
  conductores: 'conductores',
  conflictos: 'conflictos',
  bloqueados: 'estado_no_aplicado',
  invalidas: 'invalidos',
}

/** Nombre legible de cada columna de `leads` que la carga puede escribir. */
const ETIQUETAS: Record<string, string> = {
  estado_de_lead: 'Estado',
  nombre_completo: 'Nombre completo',
  primer_nombre: 'Nombre',
  apellido: 'Apellido',
  email: 'Correo',
  phone: 'Teléfono',
  zona: 'Zona',
  turno: 'Turno',
  edad: 'Edad',
  direccion: 'Dirección',
  sede: 'Sede',
  experiencia_manejo: 'Experiencia manejo',
  experiencia_previa: 'Experiencia previa',
  acepta_oferta: 'Acepta oferta',
  d1: 'D1',
  monotributo: 'Monotributo',
  marca_y_modelo_de_vehiculo: 'Vehículo',
  anio_de_auto: 'Año auto',
  km_de_auto: 'Km auto',
  patente: 'Patente',
  fuente_pauta: 'Fuente pauta',
  id_fuente: 'Id fuente',
  observaciones: 'Observaciones',
  fuente_de_lead: 'Fuente',
  fecha_carga: 'Fecha carga',
  created_at: 'Fecha de creación',
}

/** Columnas técnicas que no se muestran en el detalle. */
const OCULTAS = new Set(['sede_id', 'direccion_latitud', 'direccion_longitud', 'direccion_geocode_estado', 'direccion_geocode_fecha', 'updated_at'])

function valorLegible(v: unknown): string {
  if (v === true) return 'Sí'
  if (v === false) return 'No'
  if (v == null || String(v).trim() === '') return '(vacío)'
  return String(v)
}

function nombreFila(f: FilaSellium): string {
  return f.nombreCompleto || 'Sin nombre'
}

function telFila(f: FilaSellium): string {
  return f.telefono ? `+${f.telefono.digitos}` : ''
}

function telLead(l: LeadExistente): string {
  return l.phone || l.whatsapp_number || ''
}

/** Fecha/hora en hora Argentina, como la muestra la tabla de leads. */
function fechaLegible(v: unknown): string {
  if (v == null || v === '') return '(vacío)'
  const d = new Date(String(v))
  if (isNaN(d.getTime())) return String(v)
  const opciones: Intl.DateTimeFormatOptions = { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }
  return d.toLocaleString('es-AR', opciones)
}

function cambios(payload: Record<string, unknown>, lead: LeadExistente): string {
  return Object.keys(payload)
    .filter(k => !OCULTAS.has(k))
    .map(k => {
      const fmt = k === 'created_at' ? fechaLegible : valorLegible
      return `${ETIQUETAS[k] ?? k}: ${fmt(lead[k])} → ${fmt(payload[k])}`
    })
    .join('\n')
}

const CRUCE: Record<string, string> = { telefono: 'Teléfono', telefono_parcial: 'Teléfono incompleto', email: 'Correo' }

function armarSecciones(plan: PlanCarga): Secciones {
  const conCruce = [...plan.actualizar, ...plan.sinCambios]
  return {
    crear: {
      titulo: 'Leads nuevos a crear',
      columnas: ['Fila', 'Fecha de creación', 'Nombre', 'Teléfono', 'Correo', 'Estado', 'Zona', 'Dirección', 'Id fuente', 'Observaciones'],
      origen: plan.crear.map(a => a.fila),
      filas: plan.crear.map(a => [
        String(a.fila.numero), a.fila.fechaCreacion ? fechaLegible(a.payload.created_at) : '(hoy)',
        String(a.payload.nombre_completo ?? ''), String(a.payload.phone ?? ''),
        String(a.payload.email ?? ''), String(a.payload.estado_de_lead ?? '(vacío)'), String(a.payload.zona ?? ''),
        String(a.payload.direccion ?? ''), String(a.payload.id_fuente ?? ''), String(a.payload.observaciones ?? ''),
      ]),
    },
    actualizar: {
      titulo: 'Leads a actualizar — solo campos vacíos + fecha de creación (campo: valor actual → valor nuevo)',
      columnas: ['Fila', 'Lead en Toshify', 'Teléfono en Toshify', 'Cruce', 'Cambios'],
      origen: plan.actualizar.map(a => a.fila),
      filas: plan.actualizar.map(a => [
        String(a.fila.numero), a.lead.nombre_completo || '(sin nombre)', telLead(a.lead), CRUCE[a.cruce] ?? a.cruce,
        cambios(a.payload, a.lead),
      ]),
    },
    parciales: {
      titulo: 'Cruces por teléfono incompleto en la base — revisar que sea la misma persona',
      columnas: ['Fila', 'Nombre en Excel', 'Teléfono Excel', 'Lead en Toshify', 'Teléfono en Toshify'],
      origen: conCruce.filter(a => a.cruce === 'telefono_parcial').map(a => a.fila),
      filas: conCruce.filter(a => a.cruce === 'telefono_parcial').map(a => [
        String(a.fila.numero), nombreFila(a.fila), telFila(a.fila), a.lead.nombre_completo || '(sin nombre)', telLead(a.lead),
      ]),
    },
    sin_cambios: {
      titulo: 'Ya existen y no tienen cambios',
      columnas: ['Fila', 'Nombre en Excel', 'Lead en Toshify', 'Teléfono en Toshify', 'Estado actual'],
      origen: plan.sinCambios.map(a => a.fila),
      filas: plan.sinCambios.map(a => [
        String(a.fila.numero), nombreFila(a.fila), a.lead.nombre_completo || '(sin nombre)', telLead(a.lead), valorLegible(a.lead.estado_de_lead),
      ]),
    },
    conductores: {
      titulo: 'Omitidos: ya son Conductor',
      columnas: ['Fila', 'Nombre en Excel', 'Lead en Toshify', 'Teléfono en Toshify'],
      origen: plan.conductores.map(a => a.fila),
      filas: plan.conductores.map(a => [
        String(a.fila.numero), nombreFila(a.fila), a.lead.nombre_completo || '(sin nombre)', telLead(a.lead),
      ]),
    },
    conflictos: {
      titulo: 'Conflictos — no se tocan',
      columnas: ['Fila', 'Nombre en Excel', 'Teléfono Excel', 'Correo Excel', 'Motivo'],
      origen: plan.conflictos.map(a => a.fila),
      filas: plan.conflictos.map(a => [
        String(a.fila.numero), nombreFila(a.fila), telFila(a.fila), a.fila.email ?? '', a.motivo,
      ]),
    },
    bloqueados: {
      titulo: 'Estado no aplicado: el lead ya tiene estado (en existentes solo se completan campos vacíos)',
      columnas: ['Fila', 'Lead en Toshify', 'Teléfono en Toshify', 'Estado actual', 'Estado según Excel'],
      origen: conCruce.filter(a => a.estadoBloqueado).map(a => a.fila),
      filas: conCruce.filter(a => a.estadoBloqueado).map(a => [
        String(a.fila.numero), a.lead.nombre_completo || '(sin nombre)', telLead(a.lead),
        valorLegible(a.lead.estado_de_lead), valorLegible(a.fila.estado.estado),
      ]),
    },
    invalidas: {
      titulo: 'Inválidos: sin teléfono ni correo',
      columnas: ['Fila', 'Nombre en Excel', 'Motivo'],
      origen: plan.invalidas.map(a => a.fila),
      filas: plan.invalidas.map(a => [String(a.fila.numero), nombreFila(a.fila), a.motivo]),
    },
  }
}

function tablaHtml(s: Seccion): string {
  const th = s.columnas
    .map(c => `<th style="position:sticky;top:0;background:#F3F4F6;padding:6px 8px;text-align:left;font-weight:600;border-bottom:1px solid #E5E7EB;white-space:nowrap;">${escaparHtml(c)}</th>`)
    .join('')
  const trs = s.filas.map(f => `<tr>${f.map((v, i) => {
    const largo = v.length > 160 && s.columnas[i] !== 'Cambios' ? `${v.slice(0, 160)}…` : v
    return `<td style="padding:5px 8px;border-bottom:1px solid #F3F4F6;vertical-align:top;${i === 0 ? 'color:#9CA3AF;' : ''}">${escaparHtml(largo).replace(/\n/g, '<br>')}</td>`
  }).join('')}</tr>`).join('')
  return `
    <p style="font-weight:600;margin:0 0 6px;">${escaparHtml(s.titulo)} <span style="color:#6B7280;font-weight:400;">(${s.filas.length})</span></p>
    <div style="max-height:340px;overflow:auto;border:1px solid #E5E7EB;border-radius:6px;">
      <table style="width:100%;border-collapse:collapse;font-size:12px;">${th ? `<thead><tr>${th}</tr></thead>` : ''}<tbody>${trs}</tbody></table>
    </div>`
}

/** Engancha los clicks del resumen: cada fila con data-seccion abre su tabla debajo. */
function activarDetalle(popup: HTMLElement, { secciones, headers }: ContextoDetalle) {
  const panel = popup.querySelector<HTMLElement>('#sellium-detalle')
  if (!panel) return
  let abierta: string | null = null

  popup.querySelectorAll<HTMLElement>('[data-reexportar]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation() // no abrir/cerrar el detalle de la fila
      void descargarFormatoOriginal(btn.dataset.reexportar as ClaveSeccion, secciones, headers)
    })
  })

  popup.querySelectorAll<HTMLElement>('[data-seccion]').forEach(fila => {
    fila.addEventListener('click', () => {
      const clave = fila.dataset.seccion as ClaveSeccion
      popup.querySelectorAll<HTMLElement>('[data-seccion]').forEach(f => { f.style.background = '' })
      if (abierta === clave) {
        abierta = null
        panel.innerHTML = ''
        return
      }
      abierta = clave
      fila.style.background = '#EFF6FF'
      panel.innerHTML = tablaHtml(secciones[clave])
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  })

  popup.querySelector<HTMLElement>('#sellium-descargar')?.addEventListener('click', () => { void descargarDetalle(secciones) })
}

/**
 * Baja las filas de una sección con las mismas columnas y en el mismo orden que el
 * archivo de Sellium, para corregirlas y volver a subirlas por Carga Masiva.
 */
async function descargarFormatoOriginal(clave: ClaveSeccion, secciones: Secciones, headers: string[]) {
  const filas = secciones[clave].origen
  if (!filas.length) return
  const XLSX = await import('xlsx')
  const aoa = [headers, ...filas.map(f => headers.map(h => f.original[h] ?? ''))]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Todos los leads')
  XLSX.writeFile(wb, `sellium_${REEXPORTABLES[clave] ?? clave}_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

async function descargarDetalle(secciones: Secciones) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const hojas: [ClaveSeccion, string][] = [
    ['crear', 'Crear'], ['actualizar', 'Actualizar'], ['parciales', 'Tel incompleto'], ['bloqueados', 'Estado no aplicado'],
    ['sin_cambios', 'Sin cambios'], ['conductores', 'Conductores'], ['conflictos', 'Conflictos'], ['invalidas', 'Invalidos'],
  ]
  for (const [clave, nombre] of hojas) {
    const s = secciones[clave]
    if (!s.filas.length) continue
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([s.columnas, ...s.filas]), nombre)
  }
  if (!wb.SheetNames.length) return
  XLSX.writeFile(wb, `preview_carga_sellium_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

// ───────────────────────── HTML del resumen ─────────────────────────

function listaHtml(items: string[], total: number): string {
  const extra = total > items.length ? `<li style="color:#9CA3AF;">... y ${total - items.length} más</li>` : ''
  return `<ul style="margin:4px 0 12px;padding-left:20px;list-style:disc;max-height:160px;overflow-y:auto;">${items.map(i => `<li>${i}</li>`).join('')}${extra}</ul>`
}

function conteoEstados(plan: PlanCarga): string {
  const conteo = new Map<string, number>()
  const sumar = (e: unknown) => {
    const k = typeof e === 'string' && e ? e : '(sin cambio de estado)'
    conteo.set(k, (conteo.get(k) ?? 0) + 1)
  }
  plan.crear.forEach(a => sumar(a.payload.estado_de_lead))
  plan.actualizar.forEach(a => sumar(a.payload.estado_de_lead))
  return [...conteo.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([e, n]) => `<tr><td style="padding:2px 8px;">${escaparHtml(e)}</td><td style="padding:2px 8px;text-align:right;">${n}</td></tr>`)
    .join('')
}

function htmlResumen(plan: PlanCarga, totalFilas: number, secciones: Secciones): string {
  const porCruce = (t: string) => plan.actualizar.filter(a => a.cruce === t).length + plan.sinCambios.filter(a => a.cruce === t).length
  const noReconocidos = [...new Set(plan.acciones
    .filter(a => a.fila.estado.regla === 'no_reconocido')
    .map(a => a.fila.estado.valorOriginal || ''))]

  /** Fila del resumen; si tiene sección y datos, es clickeable. */
  const fila = (label: string, n: number, color = 'inherit', seccion?: ClaveSeccion) => {
    const clic = seccion && n > 0 && secciones[seccion].filas.length > 0
    const ver = clic ? ' <span style="font-size:11px;color:#6B7280;text-decoration:underline;">ver detalle</span>' : ''
    const bajar = clic && seccion && REEXPORTABLES[seccion]
      ? ` <button type="button" data-reexportar="${seccion}" title="Descargar estas filas en el formato original de Sellium para volver a subirlas" style="margin-left:6px;border:1px solid #D1D5DB;background:#fff;border-radius:4px;padding:1px 6px;font-size:11px;cursor:pointer;color:#374151;">⬇ Excel</button>`
      : ''
    return `<tr${clic ? ` data-seccion="${seccion}" style="cursor:pointer;" title="Click para ver el detalle"` : ''}>
      <td style="padding:3px 8px;color:${color};">${label}${ver}${bajar}</td>
      <td style="padding:3px 8px;text-align:right;color:${color};"><strong>${n}</strong></td></tr>`
  }

  return `
    <div style="text-align:left;font-size:13px;max-height:62vh;overflow-y:auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:12px;">
        <span style="color:#6B7280;">Filas en el archivo: <strong>${totalFilas}</strong> · Click en un conteo para ver el detalle</span>
        <button type="button" id="sellium-descargar" style="border:1px solid #D1D5DB;background:#fff;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer;white-space:nowrap;">⬇ Descargar detalle (Excel)</button>
      </div>
      <table style="width:100%;max-width:640px;border-collapse:collapse;margin-bottom:12px;">
        ${fila('Leads nuevos a crear', plan.crear.length, '#059669', 'crear')}
        ${fila('Leads a actualizar', plan.actualizar.length, '#2563EB', 'actualizar')}
        ${fila('&nbsp;&nbsp;· cruce por teléfono', porCruce('telefono'))}
        ${fila('&nbsp;&nbsp;· cruce por teléfono incompleto en la base', porCruce('telefono_parcial'), 'inherit', 'parciales')}
        ${fila('&nbsp;&nbsp;· cruce por correo', porCruce('email'))}
        ${plan.sinCambios.length ? fila('Ya existen y no tienen cambios', plan.sinCambios.length, 'inherit', 'sin_cambios') : ''}
        ${plan.conductores.length ? fila('Omitidos: ya son Conductor', plan.conductores.length, '#6B7280', 'conductores') : ''}
        ${plan.conflictos.length ? fila('Conflictos (no se tocan)', plan.conflictos.length, '#DC2626', 'conflictos') : ''}
        ${plan.invalidas.length ? fila('Inválidos (sin teléfono ni correo)', plan.invalidas.length, '#DC2626', 'invalidas') : ''}
        ${secciones.bloqueados.filas.length ? fila('Estado no aplicado (el lead ya tiene estado)', secciones.bloqueados.filas.length, '#D97706', 'bloqueados') : ''}
      </table>
      <div id="sellium-detalle" style="margin-bottom:12px;"></div>
      <p style="font-weight:600;margin:0 0 4px;">Estado resultante (nuevos + actualizados)</p>
      <table style="border-collapse:collapse;margin-bottom:12px;">${conteoEstados(plan)}</table>
      ${noReconocidos.length ? `<p style="font-weight:600;color:#D97706;margin:0;">Estados de postulación no reconocidos (no cambian el estado):</p>${listaHtml(noReconocidos.map(escaparHtml), noReconocidos.length)}` : ''}
    </div>`
}
