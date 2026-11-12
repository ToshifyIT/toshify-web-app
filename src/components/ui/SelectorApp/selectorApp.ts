// src/components/ui/SelectorApp/selectorApp.ts
// Lista de opciones con el diseño de la app para TODOS los <select> nativos
// (pedido 2026-11-12: la lista oscura de macOS no va con el resto).
//
// No reemplaza el <select>: lo deja en su lugar (valor, onChange de React, validación
// y formularios siguen igual) y solo cambia la lista que se abre. Al elegir, pone el
// valor en el select y dispara 'input' y 'change', como si se hubiera elegido a mano.
//
// - Solo en pantallas de más de 480 px: en celular queda la lista nativa (mejor al dedo).
// - No toca <select multiple>, con size > 1, deshabilitados ni con data-nativo.
// - Con más de 10 opciones trae buscador. Teclado: flechas, Enter, Esc, Tab.
import './selectorApp.css'

const MAX_SIN_BUSCADOR = 10
const MARGEN = 8

interface Abierto {
  select: HTMLSelectElement
  pop: HTMLDivElement
  lista: HTMLDivElement
  buscador: HTMLInputElement | null
  activo: number
  items: HTMLDivElement[]
}

let abierto: Abierto | null = null

const usaLista = (s: HTMLSelectElement) =>
  window.innerWidth > 480 && !s.multiple && s.size <= 1 && !s.disabled && !s.hasAttribute('data-nativo')

function normalizar(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function cerrar(devolverFoco = true) {
  if (!abierto) return
  const { select, pop } = abierto
  pop.remove()
  select.classList.remove('selector-app-abierto')
  abierto = null
  if (devolverFoco) select.focus({ preventScroll: true })
}

function elegir(select: HTMLSelectElement, valor: string) {
  if (select.value !== valor) {
    // Setter nativo: React escucha el evento y lee el valor nuevo
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
    if (setter) setter.call(select, valor)
    else select.value = valor
    select.dispatchEvent(new Event('input', { bubbles: true }))
    select.dispatchEvent(new Event('change', { bubbles: true }))
  }
  cerrar()
}

function marcarActivo(i: number) {
  if (!abierto) return
  const visibles = abierto.items.filter((it) => !it.hidden)
  if (!visibles.length) return
  const n = Math.max(0, Math.min(i, visibles.length - 1))
  abierto.items.forEach((it) => it.classList.remove('is-activo'))
  visibles[n].classList.add('is-activo')
  visibles[n].scrollIntoView({ block: 'nearest' })
  abierto.activo = n
}

function ubicar() {
  if (!abierto) return
  const { select, pop, lista } = abierto
  const r = select.getBoundingClientRect()
  const ancho = Math.max(r.width, 160)
  pop.style.minWidth = `${ancho}px`
  pop.style.maxWidth = `${Math.max(ancho, Math.min(420, window.innerWidth - MARGEN * 2))}px`
  const abajo = window.innerHeight - r.bottom - MARGEN * 2
  const arriba = r.top - MARGEN * 2
  const alto = pop.scrollHeight
  const haciaArriba = alto > abajo && arriba > abajo
  const disponible = Math.max(160, haciaArriba ? arriba : abajo)
  lista.style.maxHeight = `${Math.min(300, disponible - (abierto.buscador ? 44 : 8))}px`
  const altoFinal = Math.min(pop.scrollHeight, disponible)
  pop.style.top = `${haciaArriba ? Math.max(MARGEN, r.top - 4 - altoFinal) : r.bottom + 4}px`
  const anchoPop = pop.offsetWidth
  pop.style.left = `${Math.max(MARGEN, Math.min(r.left, window.innerWidth - anchoPop - MARGEN))}px`
}

function abrir(select: HTMLSelectElement) {
  cerrar(false)
  const pop = document.createElement('div')
  pop.className = 'selector-app'
  pop.setAttribute('role', 'listbox')
  const opciones = [...select.options]
  let buscador: HTMLInputElement | null = null
  if (opciones.length > MAX_SIN_BUSCADOR) {
    buscador = document.createElement('input')
    buscador.type = 'text'
    buscador.className = 'selector-app-buscar'
    buscador.placeholder = 'Buscar…'
    buscador.setAttribute('aria-label', 'Buscar opción')
    pop.appendChild(buscador)
  }
  const lista = document.createElement('div')
  lista.className = 'selector-app-lista'
  pop.appendChild(lista)

  const items: HTMLDivElement[] = []
  let grupoActual: HTMLOptGroupElement | null = null
  for (const op of opciones) {
    const grupo = op.parentElement instanceof HTMLOptGroupElement ? op.parentElement : null
    if (grupo && grupo !== grupoActual) {
      const g = document.createElement('div')
      g.className = 'selector-app-grupo'
      g.textContent = grupo.label
      lista.appendChild(g)
    }
    grupoActual = grupo
    if (op.hidden) continue
    const it = document.createElement('div')
    it.className = 'selector-app-opcion'
    it.setAttribute('role', 'option')
    it.textContent = op.textContent || ''
    it.dataset.valor = op.value
    if (op.value === select.value && op.selected) {
      it.classList.add('is-elegida')
      it.setAttribute('aria-selected', 'true')
    }
    if (op.disabled || grupo?.disabled) it.classList.add('is-deshabilitada')
    // Opción "vacía" del tipo "Seleccionar…": en gris
    if (op.value === '') it.classList.add('is-vacia')
    it.addEventListener('mousedown', (e) => e.preventDefault())
    it.addEventListener('click', () => {
      if (!it.classList.contains('is-deshabilitada')) elegir(select, op.value)
    })
    it.addEventListener('mousemove', () => {
      const visibles = items.filter((x) => !x.hidden)
      const i = visibles.indexOf(it)
      if (i >= 0 && abierto && abierto.activo !== i) marcarActivo(i)
    })
    lista.appendChild(it)
    items.push(it)
  }

  // Dentro de una ventana: al lado del select, para que herede el tema (claro/oscuro)
  document.body.appendChild(pop)
  select.classList.add('selector-app-abierto')
  abierto = { select, pop, lista, buscador, activo: 0, items }
  ubicar()
  const elegida = items.findIndex((it) => it.classList.contains('is-elegida'))
  marcarActivo(elegida >= 0 ? elegida : 0)

  if (buscador) {
    const b = buscador
    b.addEventListener('input', () => {
      const q = normalizar(b.value.trim())
      for (const it of items) it.hidden = !!q && !normalizar(it.textContent || '').includes(q)
      lista.querySelectorAll<HTMLElement>('.selector-app-grupo').forEach((g) => { g.hidden = !!q })
      marcarActivo(0)
    })
    b.addEventListener('keydown', teclado)
    requestAnimationFrame(() => b.focus({ preventScroll: true }))
  }
}

function teclado(e: KeyboardEvent) {
  if (!abierto) return
  const visibles = abierto.items.filter((it) => !it.hidden)
  if (e.key === 'ArrowDown') { e.preventDefault(); marcarActivo(abierto.activo + 1) }
  else if (e.key === 'ArrowUp') { e.preventDefault(); marcarActivo(abierto.activo - 1) }
  else if (e.key === 'Enter') {
    e.preventDefault()
    const it = visibles[abierto.activo]
    if (it && !it.classList.contains('is-deshabilitada')) elegir(abierto.select, it.dataset.valor ?? '')
  } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrar() }
  else if (e.key === 'Tab') cerrar(false)
}

let iniciado = false

/** Se llama una vez al arrancar la app (main.tsx). */
export function iniciarSelectorApp() {
  if (iniciado || typeof window === 'undefined') return
  iniciado = true

  // Abrir: el mousedown en el select abre la lista propia en vez de la nativa
  document.addEventListener('mousedown', (e) => {
    const t = e.target as Element | null
    if (abierto && t && abierto.pop.contains(t)) return
    const select = t?.closest?.('select') as HTMLSelectElement | null
    if (select && usaLista(select)) {
      e.preventDefault()
      if (abierto?.select === select) { cerrar(); return }
      select.focus({ preventScroll: true })
      abrir(select)
      return
    }
    if (abierto) cerrar(false)
  }, true)

  // Teclado sobre el select cerrado: Espacio, Enter o flechas abren la lista propia
  document.addEventListener('keydown', (e) => {
    if (abierto) {
      const { buscador } = abierto
      if (!buscador) teclado(e)
      // Con buscador: lo que se escriba va a él aunque el foco haya quedado en el select
      else if (e.target !== buscador) {
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) buscador.focus({ preventScroll: true })
        else teclado(e)
      }
      return
    }
    const select = e.target instanceof HTMLSelectElement ? e.target : null
    if (!select || !usaLista(select)) return
    if ([' ', 'Enter', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
      e.preventDefault()
      abrir(select)
    }
  }, true)

  // Scroll fuera de la lista o cambio de tamaño: se reubica o se cierra
  window.addEventListener('scroll', (e) => {
    if (!abierto) return
    if (e.target instanceof Node && abierto.pop.contains(e.target)) return
    if (!document.contains(abierto.select)) cerrar(false)
    else ubicar()
  }, true)
  window.addEventListener('resize', () => cerrar(false))
}
