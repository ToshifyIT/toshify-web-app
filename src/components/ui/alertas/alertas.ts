/**
 * ALERTAS PROPIAS DE TOSHIFY
 * ==========================
 * Reemplaza a SweetAlert2. Todo el sistema usa esto para avisos, confirmaciones,
 * formularios cortos y toasts, con el estilo del sistema (styles/tokens.css).
 *
 * Formas de uso (de la más simple a la más completa):
 *
 *   toast.ok('Guardado')                    // toast arriba, se va solo
 *   toast.error('No se pudo guardar', 'detalle opcional')
 *   await avisar('Listo', 'Se enviaron 3 mensajes', 'success')
 *   if (await confirmar({ titulo: '¿Eliminar?', texto: 'No se puede deshacer', peligro: true })) { ... }
 *
 *   // Ventana con formulario en HTML (mismas opciones que usaba SweetAlert):
 *   const r = await Alerta.fire({ title, html, showCancelButton: true, preConfirm: () => {...} })
 *   if (r.isConfirmed) usar(r.value)
 *
 * `Alerta.fire` acepta las opciones de SweetAlert que usa el sistema (title, text,
 * html, icon, botones, input, preConfirm, inputValidator, didOpen, timer, width…)
 * y devuelve el mismo resultado ({ isConfirmed, isDenied, isDismissed, value,
 * dismiss }), para que el código existente funcione igual. Los colores de botón que
 * se pasen se ignoran: los botones siempre son los del sistema.
 */
import './alertas.css'

export type AlertaIcono = 'success' | 'error' | 'warning' | 'info' | 'question'
export type AlertaDismiss = 'cancel' | 'backdrop' | 'close' | 'esc' | 'timer'

export interface AlertaResultado<T = any> {
  isConfirmed: boolean
  isDenied: boolean
  isDismissed: boolean
  value?: T
  dismiss?: AlertaDismiss
}

type Valor<T> = T | Promise<T>

export interface AlertaOpciones {
  title?: string
  titleText?: string
  text?: string
  html?: string | HTMLElement
  icon?: AlertaIcono
  iconHtml?: string
  iconColor?: string
  width?: number | string
  showConfirmButton?: boolean
  showCancelButton?: boolean
  showDenyButton?: boolean
  confirmButtonText?: string
  cancelButtonText?: string
  denyButtonText?: string
  confirmButtonColor?: string
  cancelButtonColor?: string
  denyButtonColor?: string
  reverseButtons?: boolean
  focusConfirm?: boolean
  focusCancel?: boolean
  allowOutsideClick?: boolean | (() => boolean)
  allowEscapeKey?: boolean
  showLoaderOnConfirm?: boolean
  input?: 'text' | 'textarea' | 'number' | 'date' | 'email' | 'password' | 'select'
  inputLabel?: string
  inputPlaceholder?: string
  inputValue?: string | number
  inputAttributes?: Record<string, string>
  inputOptions?: Record<string, string>
  inputValidator?: (valor: any) => Valor<string | null | undefined | void>
  preConfirm?: (valor: any) => any
  preDeny?: (valor: any) => any
  didOpen?: (popup: HTMLElement) => void
  didClose?: () => void
  willClose?: (popup: HTMLElement) => void
  timer?: number
  timerProgressBar?: boolean
  toast?: boolean
  position?: string
  customClass?: Partial<Record<'container' | 'popup' | 'title' | 'htmlContainer' | 'confirmButton' | 'cancelButton' | 'denyButton' | 'icon' | 'actions' | 'input', string>>
  [otra: string]: unknown
}

/* ------------------------------------------------------------------ */
/* Íconos (mismos trazos que lucide)                                   */
/* ------------------------------------------------------------------ */
const SVG = (cuerpo: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${cuerpo}</svg>`
const ICONOS: Record<AlertaIcono, string> = {
  success: SVG('<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'),
  error: SVG('<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>'),
  warning: SVG('<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'),
  info: SVG('<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>'),
  question: SVG('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>'),
}
const ICONO_CERRAR = SVG('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>')

function escapar(valor: unknown): string {
  return String(valor ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, clase?: string, html?: string) {
  const e = document.createElement(tag)
  if (clase) e.className = clase
  if (html !== undefined) e.innerHTML = html
  return e
}

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */
const DURACION: Record<AlertaIcono, number> = { success: 2500, info: 4000, question: 4000, warning: 5000, error: 6000 }
let pilaToasts: HTMLElement | null = null

function mostrarToast(tipo: AlertaIcono, tituloHtml: string, textoHtml = '', duracion?: number): Promise<AlertaResultado> {
  if (!pilaToasts || !document.body.contains(pilaToasts)) {
    pilaToasts = el('div', 'tsh-toasts')
    pilaToasts.setAttribute('role', 'status')
    pilaToasts.setAttribute('aria-live', 'polite')
    document.body.appendChild(pilaToasts)
  }
  const t = el('div', `tsh-toast tsh-toast--${tipo}`)
  t.innerHTML = `<span class="tsh-toast-icono">${ICONOS[tipo]}</span>
    <div class="tsh-toast-cuerpo"><div class="tsh-toast-titulo">${tituloHtml}</div>${textoHtml ? `<div class="tsh-toast-texto">${textoHtml}</div>` : ''}</div>
    <button type="button" class="tsh-toast-cerrar" aria-label="Cerrar">${ICONO_CERRAR}</button>`
  pilaToasts.appendChild(t)
  return new Promise(resolve => {
    let restante = duracion ?? DURACION[tipo]
    let inicio = Date.now()
    let id = window.setTimeout(() => quitar('timer'), restante)
    const quitar = (dismiss: AlertaDismiss) => {
      window.clearTimeout(id)
      t.classList.add('tsh-toast--saliendo')
      window.setTimeout(() => t.remove(), 180)
      resolve({ isConfirmed: false, isDenied: false, isDismissed: true, dismiss })
    }
    t.addEventListener('mouseenter', () => { window.clearTimeout(id); restante -= Date.now() - inicio })
    t.addEventListener('mouseleave', () => { inicio = Date.now(); id = window.setTimeout(() => quitar('timer'), Math.max(restante, 800)) })
    t.querySelector('.tsh-toast-cerrar')?.addEventListener('click', () => quitar('close'))
  })
}

/** Toasts: el título y el texto se muestran como texto, nunca como HTML. */
export const toast = {
  ok: (titulo: string, texto?: string) => mostrarToast('success', escapar(titulo), escapar(texto)),
  error: (titulo: string, texto?: string) => mostrarToast('error', escapar(titulo), escapar(texto)),
  aviso: (titulo: string, texto?: string) => mostrarToast('warning', escapar(titulo), escapar(texto)),
  info: (titulo: string, texto?: string) => mostrarToast('info', escapar(titulo), escapar(texto)),
}

/* ------------------------------------------------------------------ */
/* Ventana (una a la vez, como SweetAlert)                             */
/* ------------------------------------------------------------------ */
interface Activa {
  opciones: AlertaOpciones
  overlay: HTMLElement
  popup: HTMLElement
  acciones: HTMLElement
  mensaje: HTMLElement
  resolver: (r: AlertaResultado) => void
  cargando: boolean
  timer?: number
  timerRestante?: number
  timerInicio?: number
  barra?: HTMLElement
  anteriorFoco: Element | null
}
let activa: Activa | null = null

const inputDe = (a: Activa) =>
  a.popup.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('.tsh-alerta-input')

function cerrar(resultado: AlertaResultado) {
  const a = activa
  if (!a) return
  activa = null
  window.clearTimeout(a.timer)
  a.opciones.willClose?.(a.popup)
  document.removeEventListener('keydown', teclas, true)
  a.overlay.classList.add('tsh-alerta-overlay--saliendo')
  window.setTimeout(() => a.overlay.remove(), 150)
  if (a.anteriorFoco instanceof HTMLElement) a.anteriorFoco.focus({ preventScroll: true })
  a.resolver(resultado)
  a.opciones.didClose?.()
}
const descartar = (dismiss: AlertaDismiss) =>
  cerrar({ isConfirmed: false, isDenied: false, isDismissed: true, dismiss })

function teclas(e: KeyboardEvent) {
  const a = activa
  if (!a) return
  if (e.key === 'Escape' && a.opciones.allowEscapeKey !== false && !a.cargando) {
    e.preventDefault(); e.stopPropagation(); descartar('esc')
  } else if (e.key === 'Enter' && !a.cargando) {
    const destino = e.target as HTMLElement
    if (destino?.classList?.contains('tsh-alerta-input') && destino.tagName === 'INPUT') {
      e.preventDefault(); void confirmarActiva()
    }
  }
}

function mostrarMensaje(texto: string) {
  if (!activa) return
  activa.mensaje.innerHTML = texto
  activa.mensaje.hidden = false
}
function limpiarMensaje() {
  if (!activa) return
  activa.mensaje.hidden = true
  activa.mensaje.innerHTML = ''
}

function ponerCargando(valor: boolean) {
  const a = activa
  if (!a) return
  a.cargando = valor
  a.popup.classList.toggle('tsh-alerta--cargando', valor)
  a.acciones.querySelectorAll('button').forEach(b => { (b as HTMLButtonElement).disabled = valor })
}

async function confirmarActiva() {
  const a = activa
  if (!a || a.cargando) return
  const o = a.opciones
  const inp = inputDe(a)
  let valor: any = true
  if (o.input && inp) {
    valor = o.input === 'number' ? (inp.value === '' ? '' : inp.value) : inp.value
    if (o.inputValidator) {
      const error = await o.inputValidator(valor)
      if (error) { mostrarMensaje(escapar(error)); return }
    }
  }
  if (!o.preConfirm) {
    cerrar({ isConfirmed: true, isDenied: false, isDismissed: false, value: valor })
    return
  }
  limpiarMensaje()
  if (o.showLoaderOnConfirm) ponerCargando(true)
  try {
    const r = await o.preConfirm(valor)
    if (activa !== a) return
    if (!a.mensaje.hidden || r === false) { ponerCargando(false); return }
    cerrar({ isConfirmed: true, isDenied: false, isDismissed: false, value: r === undefined ? valor : r })
  } catch (err) {
    ponerCargando(false)
    mostrarMensaje(escapar(err instanceof Error ? err.message : String(err)))
  }
}

async function negarActiva() {
  const a = activa
  if (!a || a.cargando) return
  const inp = inputDe(a)
  const valor = a.opciones.input && inp ? inp.value : false
  if (a.opciones.preDeny) {
    const r = await a.opciones.preDeny(valor)
    if (r === false || activa !== a) return
    cerrar({ isConfirmed: false, isDenied: true, isDismissed: false, value: r === undefined ? valor : r })
    return
  }
  cerrar({ isConfirmed: false, isDenied: true, isDismissed: false, value: valor })
}

function crearInput(o: AlertaOpciones): HTMLElement {
  const caja = el('div', 'tsh-alerta-campo')
  if (o.inputLabel) caja.appendChild(el('label', 'tsh-alerta-label', escapar(o.inputLabel)))
  let campo: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  if (o.input === 'textarea') campo = el('textarea')
  else if (o.input === 'select') {
    campo = el('select')
    if (o.inputPlaceholder) campo.appendChild(new Option(o.inputPlaceholder, ''))
    for (const [v, t] of Object.entries(o.inputOptions || {})) campo.appendChild(new Option(t, v))
  } else {
    campo = el('input')
    ;(campo as HTMLInputElement).type = o.input || 'text'
  }
  campo.className = `tsh-alerta-input ${o.customClass?.input || ''}`.trim()
  if (o.inputPlaceholder && !(campo instanceof HTMLSelectElement)) campo.placeholder = o.inputPlaceholder
  if (o.inputValue !== undefined) campo.value = String(o.inputValue)
  for (const [k, v] of Object.entries(o.inputAttributes || {})) campo.setAttribute(k, v)
  caja.appendChild(campo)
  return caja
}

function arrancarTimer(a: Activa, ms: number) {
  a.timerRestante = ms
  a.timerInicio = Date.now()
  a.timer = window.setTimeout(() => { if (activa === a) descartar('timer') }, ms)
  if (a.barra) {
    a.barra.style.transition = 'none'
    a.barra.style.width = '100%'
    requestAnimationFrame(() => {
      if (!a.barra) return
      a.barra.style.transition = `width ${ms}ms linear`
      a.barra.style.width = '0%'
    })
  }
}

function abrir(o: AlertaOpciones): Promise<AlertaResultado> {
  // Toast pedido con la API de SweetAlert
  if (o.toast) {
    const tipo = o.icon || 'success'
    return mostrarToast(tipo, o.title ?? escapar(o.titleText), o.html ? String(o.html) : escapar(o.text), o.timer)
  }
  if (activa) descartar('close')

  const overlay = el('div', `tsh-alerta-overlay ${o.customClass?.container || ''}`.trim())
  // Las clases propias de cada módulo no se aplican a la ventana (todas se ven
  // igual); solo se respeta el pedido de ventana ancha para tablas de detalle.
  const ancha = /ancho|wide/.test(o.customClass?.popup || '')
  const popup = el('div', `tsh-alerta${ancha ? ' tsh-alerta--ancha' : ''}`)
  popup.setAttribute('role', 'dialog')
  popup.setAttribute('aria-modal', 'true')
  if (o.width !== undefined) popup.style.width = typeof o.width === 'number' ? `${o.width}px` : o.width

  if (o.iconHtml || o.icon) {
    const ic = el('div', `tsh-alerta-icono tsh-alerta-icono--${o.icon || 'info'} ${o.customClass?.icon || ''}`.trim(), o.iconHtml || ICONOS[o.icon!])
    if (o.iconColor) ic.style.color = o.iconColor
    popup.appendChild(ic)
  }
  const titulo = o.title ?? (o.titleText ? escapar(o.titleText) : '')
  if (titulo) {
    const h = el('h2', 'tsh-alerta-titulo', titulo)
    h.id = 'tsh-alerta-titulo'
    popup.setAttribute('aria-labelledby', h.id)
    popup.appendChild(h)
  }
  const cuerpo = el('div', 'tsh-alerta-cuerpo')
  if (o.html instanceof HTMLElement) cuerpo.appendChild(o.html)
  else if (o.html) cuerpo.innerHTML = o.html
  else if (o.text) cuerpo.textContent = o.text
  if (cuerpo.childNodes.length) popup.appendChild(cuerpo)
  if (o.input) popup.appendChild(crearInput(o))

  const mensaje = el('div', 'tsh-alerta-mensaje')
  mensaje.hidden = true
  popup.appendChild(mensaje)

  const acciones = el('div', `tsh-alerta-acciones ${o.customClass?.actions || ''}`.trim())
  const boton = (texto: string, clase: string, extra?: string) => {
    const b = el('button', `${clase} ${extra || ''}`.trim(), texto)
    b.type = 'button'
    return b
  }
  const botones: HTMLButtonElement[] = []
  const bConfirmar = o.showConfirmButton === false ? null : boton(o.confirmButtonText || 'Aceptar', 'btn-primary tsh-alerta-confirmar', o.customClass?.confirmButton)
  const bNegar = o.showDenyButton ? boton(o.denyButtonText || 'No', 'btn-secondary tsh-alerta-negar', o.customClass?.denyButton) : null
  const bCancelar = o.showCancelButton ? boton(o.cancelButtonText || 'Cancelar', 'btn-secondary tsh-alerta-cancelar', o.customClass?.cancelButton) : null
  // Orden del sistema: Cancelar a la izquierda, acción principal a la derecha
  for (const b of [bCancelar, bNegar, bConfirmar]) if (b) botones.push(b)
  if (o.reverseButtons) botones.reverse()
  botones.forEach(b => acciones.appendChild(b))
  acciones.appendChild(el('span', 'tsh-alerta-spinner'))
  if (botones.length) popup.appendChild(acciones)
  else popup.appendChild(acciones).classList.add('tsh-alerta-acciones--solo-carga')

  let barra: HTMLElement | undefined
  if (o.timer && o.timerProgressBar) {
    barra = el('div', 'tsh-alerta-barra')
    popup.appendChild(barra)
  }

  overlay.appendChild(popup)
  document.body.appendChild(overlay)

  return new Promise(resolve => {
    const a: Activa = { opciones: o, overlay, popup, acciones, mensaje, resolver: resolve, cargando: false, barra, anteriorFoco: document.activeElement }
    activa = a
    bConfirmar?.addEventListener('click', () => void confirmarActiva())
    bNegar?.addEventListener('click', () => void negarActiva())
    bCancelar?.addEventListener('click', () => { if (!a.cargando) descartar('cancel') })
    overlay.addEventListener('mousedown', e => {
      if (e.target !== overlay || a.cargando) return
      const permitir = typeof o.allowOutsideClick === 'function' ? o.allowOutsideClick() : o.allowOutsideClick !== false
      if (permitir) descartar('backdrop')
      else { popup.classList.remove('tsh-alerta--sacudir'); void popup.offsetWidth; popup.classList.add('tsh-alerta--sacudir') }
    })
    document.addEventListener('keydown', teclas, true)
    if (o.timer) arrancarTimer(a, o.timer)

    const inp = inputDe(a)
    if (inp) inp.focus()
    else if (o.focusCancel && bCancelar) bCancelar.focus()
    else if (o.focusConfirm !== false && bConfirmar) bConfirmar.focus({ preventScroll: true })
    o.didOpen?.(popup)
  })
}

/* ------------------------------------------------------------------ */
/* API compatible con SweetAlert                                       */
/* ------------------------------------------------------------------ */
function fire(opciones: AlertaOpciones): Promise<AlertaResultado>
function fire(titulo?: string, texto?: string, icono?: AlertaIcono): Promise<AlertaResultado>
function fire(a?: AlertaOpciones | string, texto?: string, icono?: AlertaIcono): Promise<AlertaResultado> {
  if (typeof a === 'object' && a !== null) return abrir(a)
  return abrir({ title: a ? escapar(a) : '', text: texto, icon: icono })
}

export const Alerta = {
  fire,
  /** Opciones por defecto reutilizables: Alerta.mixin({ toast: true }).fire({...}) */
  mixin: (base: AlertaOpciones) => ({
    fire: (o: AlertaOpciones | string = {}, t?: string, i?: AlertaIcono) =>
      abrir(typeof o === 'string' ? { ...base, title: escapar(o), text: t, icon: i } : { ...base, ...o }),
  }),
  close: () => { if (activa) descartar('close') },
  update: (o: Partial<AlertaOpciones>) => {
    const a = activa
    if (!a) return
    a.opciones = { ...a.opciones, ...o }
    if (o.title !== undefined) { const h = a.popup.querySelector('.tsh-alerta-titulo'); if (h) h.innerHTML = o.title }
    if (o.html !== undefined || o.text !== undefined) {
      let c = a.popup.querySelector<HTMLElement>('.tsh-alerta-cuerpo')
      if (!c) { c = el('div', 'tsh-alerta-cuerpo'); a.popup.insertBefore(c, a.mensaje) }
      if (o.html instanceof HTMLElement) { c.innerHTML = ''; c.appendChild(o.html) }
      else if (o.html !== undefined) c.innerHTML = o.html
      else c.textContent = o.text || ''
    }
  },
  showLoading: () => {
    if (!activa) void abrir({ showConfirmButton: false, allowOutsideClick: false, allowEscapeKey: false })
    ponerCargando(true)
  },
  hideLoading: () => ponerCargando(false),
  isLoading: () => !!activa?.cargando,
  showValidationMessage: (texto: string) => mostrarMensaje(texto),
  resetValidationMessage: () => limpiarMensaje(),
  isVisible: () => !!activa,
  getPopup: () => activa?.popup ?? null,
  getContainer: () => activa?.overlay ?? null,
  getHtmlContainer: () => activa?.popup.querySelector<HTMLElement>('.tsh-alerta-cuerpo') ?? null,
  getConfirmButton: () => activa?.popup.querySelector<HTMLButtonElement>('.tsh-alerta-confirmar') ?? null,
  getInput: () => (activa ? inputDe(activa) : null),
  clickConfirm: () => void confirmarActiva(),
  stopTimer: () => {
    const a = activa
    if (!a?.timer) return
    window.clearTimeout(a.timer)
    a.timerRestante = (a.timerRestante ?? 0) - (Date.now() - (a.timerInicio ?? Date.now()))
  },
  resumeTimer: () => {
    const a = activa
    if (a?.timerRestante) arrancarTimer(a, a.timerRestante)
  },
  DismissReason: { cancel: 'cancel', backdrop: 'backdrop', close: 'close', esc: 'esc', timer: 'timer' } as const,
}

/* ------------------------------------------------------------------ */
/* Atajos recomendados para código nuevo                               */
/* ------------------------------------------------------------------ */
export interface ConfirmarOpciones {
  titulo: string
  texto?: string
  /** HTML propio en lugar de texto (se muestra tal cual: no pasar datos de usuarios sin escapar) */
  html?: string
  confirmar?: string
  cancelar?: string
  /** Acción destructiva (eliminar, dar de baja): ícono de advertencia */
  peligro?: boolean
  icono?: AlertaIcono
}

/** Pregunta sí/no. Devuelve true si la persona confirmó. */
export async function confirmar(o: ConfirmarOpciones): Promise<boolean> {
  const r = await abrir({
    title: escapar(o.titulo),
    text: o.html ? undefined : o.texto,
    html: o.html,
    icon: o.icono ?? (o.peligro ? 'warning' : 'question'),
    showCancelButton: true,
    confirmButtonText: o.confirmar ?? (o.peligro ? 'Sí, eliminar' : 'Confirmar'),
    cancelButtonText: o.cancelar ?? 'Cancelar',
    focusCancel: !!o.peligro,
  })
  return r.isConfirmed
}

/** Aviso con un solo botón. */
export async function avisar(titulo: string, texto?: string, icono: AlertaIcono = 'info'): Promise<void> {
  await abrir({ title: escapar(titulo), text: texto, icon: icono, confirmButtonText: 'Entendido' })
}

export default Alerta
