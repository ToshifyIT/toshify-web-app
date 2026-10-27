// src/utils/excelCorporativo.ts
// Excel con formato corporativo para los reportes que se descargan:
// logo de Toshify, título, fecha de generación y una tabla sobria
// (encabezado gris, bordes finos, filtros y encabezado fijo al bajar).
//
// NO usar para archivos que otro sistema lee o que se vuelven a importar
// (RIT, Cabify, plantillas de importación): la cabecera les cambia el formato.
//
// ExcelJS se carga recién al descargar, para no sumar peso a la app.
import logoUrl from '../assets/logo-toshify-excel.png'

export type FormatoColumna = 'texto' | 'moneda' | 'entero' | 'decimal' | 'porcentaje'

export interface OpcionesColumna {
  /** Ancho en caracteres. Si falta, se calcula por el contenido. */
  ancho?: number
  formato?: FormatoColumna
}

export interface HojaExcel {
  nombre: string
  filas: Record<string, unknown>[]
  /** Opciones por título de columna (las claves de las filas). */
  columnas?: Record<string, OpcionesColumna>
}

export interface OpcionesExcel {
  /** Nombre del archivo, con o sin .xlsx */
  archivo: string
  titulo: string
  /** Línea gris debajo del título (filtros, sede, criterio…). */
  subtitulo?: string
  hojas: HojaExcel[]
}

const COLOR_TEXTO = 'FF111827'
const COLOR_SECUNDARIO = 'FF6B7280'
const COLOR_ENCABEZADO = 'FFF3F4F6'
const COLOR_BORDE = 'FFE5E7EB'
const COLOR_BORDE_ENCABEZADO = 'FF9CA3AF'
const FUENTE = 'Calibri'

const FORMATOS: Record<FormatoColumna, string | undefined> = {
  texto: '@',
  moneda: '"$" #,##0.00;-"$" #,##0.00',
  entero: '#,##0',
  decimal: '#,##0.00',
  porcentaje: '0.0%',
}

const FILA_ENCABEZADO = 5

let logoBase64: Promise<string> | null = null

function cargarLogo(): Promise<string> {
  if (!logoBase64) {
    logoBase64 = fetch(logoUrl)
      .then(r => r.blob())
      .then(blob => new Promise<string>((resolve, reject) => {
        const lector = new FileReader()
        lector.onload = () => resolve(String(lector.result))
        lector.onerror = () => reject(lector.error)
        lector.readAsDataURL(blob)
      }))
      .catch(() => {
        logoBase64 = null
        return ''
      })
  }
  return logoBase64
}

function fechaHoraAR(): string {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date())
}

function anchoPorContenido(titulo: string, filas: Record<string, unknown>[]): number {
  let max = titulo.length
  for (const f of filas.slice(0, 500)) {
    const v = f[titulo]
    const largo = v === null || v === undefined ? 0 : typeof v === 'number' ? 16 : String(v).length
    if (largo > max) max = largo
  }
  return Math.min(Math.max(max + 2, 10), 50)
}

/** Detecta columnas de montos por el nombre, para no tener que pasarlas todas. */
function formatoPorNombre(titulo: string, filas: Record<string, unknown>[]): FormatoColumna | undefined {
  const esNumero = filas.some(f => typeof f[titulo] === 'number')
  if (!esNumero) return undefined
  if (/monto|saldo|deuda|garant[ií]a|facturad|cobrad|cobrar|pendiente|pagado|total|importe|liquidaci|mora acumulada|diferencia|\$/i.test(titulo)) {
    return 'moneda'
  }
  return undefined
}

export async function descargarExcel({ archivo, titulo, subtitulo, hojas }: OpcionesExcel): Promise<void> {
  const [{ default: ExcelJS }, logo] = await Promise.all([import('exceljs'), cargarLogo()])
  const libro = new ExcelJS.Workbook()
  libro.creator = 'Toshify'
  libro.created = new Date()
  const idLogo = logo ? libro.addImage({ base64: logo, extension: 'png' }) : null
  const generado = `Generado el ${fechaHoraAR()}`

  for (const hoja of hojas) {
    const titulos = hoja.filas.length ? Object.keys(hoja.filas[0]) : Object.keys(hoja.columnas ?? {})
    const ws = libro.addWorksheet(hoja.nombre.slice(0, 31), {
      views: [{ state: 'frozen', ySplit: FILA_ENCABEZADO, showGridLines: false }],
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    })

    ws.columns = titulos.map(t => ({
      key: t,
      width: hoja.columnas?.[t]?.ancho ?? anchoPorContenido(t, hoja.filas),
    }))

    // Cabecera: logo, título y línea de generación
    ws.getRow(1).height = 34
    if (idLogo !== null) {
      ws.addImage(idLogo, { tl: { col: 0, row: 0.15 }, ext: { width: 104, height: 31 }, editAs: 'oneCell' })
    }
    const celdaTitulo = ws.getCell(2, 1)
    celdaTitulo.value = titulo
    celdaTitulo.font = { name: FUENTE, size: 14, bold: true, color: { argb: COLOR_TEXTO } }
    ws.getRow(2).height = 20
    const celdaSub = ws.getCell(3, 1)
    const totalTexto = `${hoja.filas.length} ${hoja.filas.length === 1 ? 'registro' : 'registros'}`
    celdaSub.value = [subtitulo, generado, totalTexto].filter(Boolean).join('  ·  ')
    celdaSub.font = { name: FUENTE, size: 9, color: { argb: COLOR_SECUNDARIO } }
    ws.getRow(4).height = 8

    const formatos = titulos.map(t => hoja.columnas?.[t]?.formato ?? formatoPorNombre(t, hoja.filas))
    const numerica = titulos.map((t, i) =>
      formatos[i] !== 'texto' && hoja.filas.some(f => typeof f[t] === 'number'))

    // Encabezado de la tabla
    const encabezado = ws.getRow(FILA_ENCABEZADO)
    titulos.forEach((t, i) => {
      const c = encabezado.getCell(i + 1)
      c.value = t
      c.font = { name: FUENTE, size: 10, bold: true, color: { argb: COLOR_TEXTO } }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_ENCABEZADO } }
      c.alignment = { vertical: 'middle', wrapText: true, horizontal: numerica[i] ? 'right' : 'left' }
      c.border = { bottom: { style: 'thin', color: { argb: COLOR_BORDE_ENCABEZADO } } }
    })
    encabezado.height = 22

    // Datos
    hoja.filas.forEach((fila, r) => {
      const row = ws.getRow(FILA_ENCABEZADO + 1 + r)
      titulos.forEach((t, i) => {
        const c = row.getCell(i + 1)
        const v = fila[t]
        c.value = v === undefined || v === null ? null : (v as string | number | boolean | Date)
        c.font = { name: FUENTE, size: 10, color: { argb: COLOR_TEXTO } }
        c.border = { bottom: { style: 'thin', color: { argb: COLOR_BORDE } } }
        c.alignment = { vertical: 'middle' }
        const f = formatos[i]
        if (f && f !== 'texto' && typeof v === 'number') c.numFmt = FORMATOS[f] as string
      })
    })

    if (titulos.length && hoja.filas.length) {
      ws.autoFilter = {
        from: { row: FILA_ENCABEZADO, column: 1 },
        to: { row: FILA_ENCABEZADO + hoja.filas.length, column: titulos.length },
      }
    }
  }

  const buffer = await libro.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = archivo.endsWith('.xlsx') ? archivo : `${archivo}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
