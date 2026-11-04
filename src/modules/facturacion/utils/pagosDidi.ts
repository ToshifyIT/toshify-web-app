// src/modules/facturacion/utils/pagosDidi.ts
// Pagos DiDi (Reporte de Facturación, semana cerrada): lee el Excel de retenciones
// de DiDi y lo cruza con los conductores facturados.
//
// El archivo trae driver_name, driver_phone y amount: no tiene DNI ni semana (se
// aplica a la semana abierta en pantalla). Se cruza por celular y, si no, por
// nombre. Las filas con monto 0 se ignoran.
//
// Ojo: el Excel que exporta DiDi declara mal su rango (dice A1:A32 aunque usa
// A:C), y con el rango declarado solo se leen los nombres. Se recalcula a partir
// de las celdas reales.

/** Una fila del Excel con monto a registrar. */
export interface FilaDidi {
  fila: number // número de fila en el Excel (para mostrar)
  nombre: string
  telefono: string
  monto: number
}

/** Conductor facturado contra el que se cruza. */
export interface CandidatoDidi {
  conductor_id: string
  nombre: string // nombre completo (facturación o ficha)
  telefonos: string[]
}

export type MetodoCruceDidi = 'celular y nombre' | 'celular' | 'nombre'

export interface CruceDidi {
  conductor_id: string
  metodo: MetodoCruceDidi
  filas: FilaDidi[] // más de una si el conductor aparece repetido en el Excel
  monto: number // suma de las filas
}

export interface NoCruzadoDidi {
  fila: FilaDidi
  motivo: string
}

const HEADER_DIDI = ['driver_name', 'driver_phone', 'amount']

const normalizarHeader = (s: unknown): string =>
  String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, '_').trim()

/**
 * Celular en formato comparable: solo dígitos, sin 54, sin el 9 de celular y sin el
 * 0 de larga distancia; se comparan los últimos 10 (característica + número).
 * "+54 9 11 3809-8630", "541138098630", "5491138098630" y "01138098630" → "1138098630".
 */
export function normalizarCelularDidi(valor: unknown): string {
  let d = String(valor ?? '').replace(/\D/g, '')
  if (d.startsWith('54')) d = d.slice(2)
  if (d.startsWith('9') && d.length === 11) d = d.slice(1)
  if (d.startsWith('0')) d = d.slice(1)
  return d.length >= 10 ? d.slice(-10) : d
}

/** Palabras del nombre: mayúsculas, sin tildes, sin puntos ni signos, sin espacios dobles. */
export function palabrasNombreDidi(nombre: unknown): string[] {
  return String(nombre ?? '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

/** Las palabras de uno están todas en el otro (con al menos nombre y apellido). */
function mismoNombre(a: string[], b: string[]): boolean {
  if (a.length < 2 || b.length < 2) return false
  const [corto, largo] = a.length <= b.length ? [a, b] : [b, a]
  const set = new Set(largo)
  return corto.every(p => set.has(p))
}

/**
 * Lee el Excel de DiDi. Devuelve las filas con monto > 0, cuántas se ignoraron por
 * monto 0, o un error si el archivo no tiene el formato esperado.
 */
export async function leerExcelDidi(
  archivo: ArrayBuffer,
): Promise<{ ok: true; filas: FilaDidi[]; ignoradasMontoCero: number } | { ok: false; error: string }> {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(archivo, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) return { ok: false, error: 'El archivo no tiene hojas.' }

  // Rango real a partir de las celdas (el que declara DiDi viene mal)
  const celdas = Object.keys(sheet).filter(k => !k.startsWith('!'))
  if (celdas.length === 0) return { ok: false, error: 'La hoja está vacía.' }
  let maxFila = 0
  let maxCol = 0
  for (const ref of celdas) {
    const { r, c } = XLSX.utils.decode_cell(ref)
    if (r > maxFila) maxFila = r
    if (c > maxCol) maxCol = c
  }
  sheet['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxFila, c: maxCol } })

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true })
  const header = (rows[0] || []).map(normalizarHeader)
  const idx = HEADER_DIDI.map(h => header.indexOf(h))
  if (idx.some(i => i < 0)) {
    const faltan = HEADER_DIDI.filter((_, i) => idx[i] < 0)
    return {
      ok: false,
      error: `No es el formato de DiDi: faltan las columnas ${faltan.join(', ')}. Se esperan driver_name, driver_phone y amount.`,
    }
  }
  const [iNombre, iTel, iMonto] = idx

  const filas: FilaDidi[] = []
  let ignoradasMontoCero = 0
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] || []
    const nombre = String(row[iNombre] ?? '').trim()
    const telefono = String(row[iTel] ?? '').trim()
    if (!nombre && !telefono) continue
    const monto = Math.round((Number(row[iMonto]) || 0) * 100) / 100
    if (monto <= 0) {
      ignoradasMontoCero++
      continue
    }
    filas.push({ fila: i + 1, nombre, telefono, monto })
  }
  return { ok: true, filas, ignoradasMontoCero }
}

/**
 * Cruza las filas con los conductores facturados. Primero por celular (si hay uno
 * solo con ese número); si no, por nombre (si hay uno solo con ese nombre). Si el
 * celular apunta a un conductor y el nombre a otro, no se asigna: queda para revisar.
 * Un conductor repetido en el Excel acumula sus montos en un solo pago.
 */
export function cruzarPagosDidi(
  filas: FilaDidi[],
  candidatos: CandidatoDidi[],
): { cruces: CruceDidi[]; noCruzados: NoCruzadoDidi[] } {
  const porCelular = new Map<string, Set<string>>()
  for (const c of candidatos) {
    for (const t of c.telefonos) {
      const n = normalizarCelularDidi(t)
      if (n.length < 8) continue
      if (!porCelular.has(n)) porCelular.set(n, new Set())
      porCelular.get(n)!.add(c.conductor_id)
    }
  }
  const palabrasCandidato = candidatos.map(c => ({ id: c.conductor_id, palabras: palabrasNombreDidi(c.nombre) }))

  const cruces = new Map<string, CruceDidi>()
  const noCruzados: NoCruzadoDidi[] = []

  for (const fila of filas) {
    const cel = normalizarCelularDidi(fila.telefono)
    const idsCel = cel.length >= 8 ? [...(porCelular.get(cel) || [])] : []
    const palabras = palabrasNombreDidi(fila.nombre)
    const idsNombre = [...new Set(palabrasCandidato.filter(c => mismoNombre(palabras, c.palabras)).map(c => c.id))]

    let id: string | null = null
    let metodo: MetodoCruceDidi = 'celular'
    if (idsCel.length === 1) {
      id = idsCel[0]
      if (idsNombre.length > 0 && !idsNombre.includes(id)) {
        noCruzados.push({ fila, motivo: 'El celular y el nombre corresponden a conductores distintos' })
        continue
      }
      metodo = idsNombre.includes(id) ? 'celular y nombre' : 'celular'
    } else if (idsCel.length > 1) {
      const enAmbos = idsCel.filter(x => idsNombre.includes(x))
      if (enAmbos.length !== 1) {
        noCruzados.push({ fila, motivo: 'El celular corresponde a más de un conductor' })
        continue
      }
      id = enAmbos[0]
      metodo = 'celular y nombre'
    } else if (idsNombre.length === 1) {
      id = idsNombre[0]
      metodo = 'nombre'
    } else if (idsNombre.length > 1) {
      noCruzados.push({ fila, motivo: 'El nombre coincide con más de un conductor' })
      continue
    } else {
      noCruzados.push({ fila, motivo: 'Sin conductor facturado en la semana con ese celular o nombre' })
      continue
    }

    const previo = cruces.get(id)
    if (previo) {
      previo.filas.push(fila)
      previo.monto = Math.round((previo.monto + fila.monto) * 100) / 100
    } else {
      cruces.set(id, { conductor_id: id, metodo, filas: [fila], monto: fila.monto })
    }
  }

  return { cruces: [...cruces.values()], noCruzados }
}
