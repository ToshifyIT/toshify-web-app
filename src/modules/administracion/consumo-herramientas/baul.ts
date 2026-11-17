// src/modules/administracion/consumo-herramientas/baul.ts
// Cifrado de credenciales en el navegador (Web Crypto): AES-GCM 256 con una clave
// derivada por PBKDF2-SHA256 del "PIN del baúl" (4 dígitos). La base solo recibe texto
// cifrado; el PIN nunca sale del navegador ni se guarda.
// La clave derivada vive solo en memoria y se olvida sola tras un rato sin uso.

// PIN corto: se compensa con muchas vueltas de PBKDF2 (abrir tarda ~1 s)
const ITERACIONES = 1_000_000
const VERIFICADOR = 'toshibase-baul-v1'
const OLVIDAR_TRAS_MS = 10 * 60 * 1000

export interface ConfigBaul {
  sal: string
  iteraciones: number
  verificador: string
  verificador_iv: string
}

export interface Cifrado {
  cifrado: string
  iv: string
}

const enc = new TextEncoder()
const dec = new TextDecoder()

function aBase64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  arr.forEach(b => { s += String.fromCharCode(b) })
  return btoa(s)
}

function deBase64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64)
  const arr = new Uint8Array(new ArrayBuffer(s.length))
  for (let i = 0; i < s.length; i++) arr[i] = s.charCodeAt(i)
  return arr
}

function bytesAzar(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(new ArrayBuffer(n)))
}

async function derivarClave(claveBaul: string, sal: string, iteraciones: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(claveBaul), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: deBase64(sal), iterations: iteraciones, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function cifrarCon(clave: CryptoKey, texto: string): Promise<Cifrado> {
  const iv = bytesAzar(12)
  const datos = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, clave, enc.encode(texto))
  return { cifrado: aBase64(datos), iv: aBase64(iv) }
}

async function descifrarCon(clave: CryptoKey, c: Cifrado): Promise<string> {
  const datos = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deBase64(c.iv) }, clave, deBase64(c.cifrado))
  return dec.decode(datos)
}

// ── Clave abierta en memoria (se olvida sola) ───────────────────────

let claveAbierta: CryptoKey | null = null

// ── Freno de intentos (por navegador): 5 PIN equivocados → esperar 1 minuto ──
const MAX_INTENTOS = 5
const ESPERA_MS = 60_000
const CLAVE_INTENTOS = 'toshibase.baul.intentos'

function leerIntentos(): { fallos: number; hasta: number } {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE_INTENTOS) || '{}')
    return { fallos: Number(v.fallos) || 0, hasta: Number(v.hasta) || 0 }
  } catch {
    return { fallos: 0, hasta: 0 }
  }
}

function guardarIntentos(v: { fallos: number; hasta: number }) {
  try { localStorage.setItem(CLAVE_INTENTOS, JSON.stringify(v)) } catch { /* sin almacenamiento */ }
}

/** Segundos que faltan para poder volver a intentar (0 = se puede) */
export function esperaRestante(): number {
  const { hasta } = leerIntentos()
  return Math.max(0, Math.ceil((hasta - Date.now()) / 1000))
}
let temporizador: ReturnType<typeof setTimeout> | null = null

function programarOlvido() {
  if (temporizador) clearTimeout(temporizador)
  temporizador = setTimeout(cerrarBaul, OLVIDAR_TRAS_MS)
}

export function baulAbierto(): boolean {
  return claveAbierta !== null
}

export function cerrarBaul() {
  claveAbierta = null
  if (temporizador) clearTimeout(temporizador)
  temporizador = null
}

/** Crea la configuración de un baúl nuevo con esta clave (y lo deja abierto) */
export async function crearBaul(claveBaul: string): Promise<ConfigBaul> {
  const sal = aBase64(bytesAzar(16))
  const clave = await derivarClave(claveBaul, sal, ITERACIONES)
  const v = await cifrarCon(clave, VERIFICADOR)
  claveAbierta = clave
  programarOlvido()
  return { sal, iteraciones: ITERACIONES, verificador: v.cifrado, verificador_iv: v.iv }
}

/** Abre el baúl: devuelve false si la clave no es la correcta */
export async function abrirBaul(claveBaul: string, config: ConfigBaul): Promise<boolean> {
  if (esperaRestante() > 0) return false
  const clave = await derivarClave(claveBaul, config.sal, config.iteraciones)
  let ok = false
  try {
    ok = (await descifrarCon(clave, { cifrado: config.verificador, iv: config.verificador_iv })) === VERIFICADOR
  } catch {
    ok = false
  }
  if (!ok) {
    const fallos = leerIntentos().fallos + 1
    guardarIntentos(fallos >= MAX_INTENTOS ? { fallos: 0, hasta: Date.now() + ESPERA_MS } : { fallos, hasta: 0 })
    return false
  }
  guardarIntentos({ fallos: 0, hasta: 0 })
  claveAbierta = clave
  programarOlvido()
  return true
}

export async function cifrar(texto: string): Promise<Cifrado> {
  if (!claveAbierta) throw new Error('El baúl está cerrado')
  programarOlvido()
  return cifrarCon(claveAbierta, texto)
}

export async function descifrar(c: Cifrado): Promise<string> {
  if (!claveAbierta) throw new Error('El baúl está cerrado')
  programarOlvido()
  return descifrarCon(claveAbierta, c)
}
