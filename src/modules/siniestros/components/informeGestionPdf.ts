// src/modules/siniestros/components/informeGestionPdf.ts
// Informe Ejecutivo de Gestión de Siniestros en PDF, con el mismo orden que el informe que
// arma Eugenia a mano: indicadores, responsabilidad, recomendaciones, casos en trámite
// (administrativos y legales), cerrados y nuevos ingresos.
import logoToshifyUrl from '../../../assets/logo-toshify-wordmark.png'

export interface CasoInforme {
  patente: string
  /** Situación del caso, por ejemplo "Reclamo activo" o "Cerrado (Desistido)" */
  titulo: string
  /** Monto destacado a la derecha del título, por ejemplo "Reclamo activo: $8.940.000" */
  monto?: string
  /** Datos cortos en la línea de abajo: Fecha, Gestión, Cía. tercero, Evento */
  datos: { label: string; valor: string }[]
  detalle?: string
  /** "Próximo paso" en trámite, "Resolución" en cerrados */
  cierre?: { label: string; texto: string }
}

export interface NuevoIngresoInforme {
  patente: string
  fecha: string
  mes: string
  estado: string
}

export interface DatosInforme {
  fecha: string
  periodo: string
  aclaracion?: string
  kpis: { total: number; enTramite: number; cerrados: number; enReclamo: string }
  responsabilidad: { label: string; cantidad: number; detalle: string; color: [number, number, number] }[]
  recomendaciones?: string
  administrativos: CasoInforme[]
  legales: CasoInforme[]
  cerrados: CasoInforme[]
  nuevos: NuevoIngresoInforme[]
}

const ROJO: [number, number, number] = [220, 38, 38]
const TEXTO: [number, number, number] = [31, 41, 55]
const GRIS: [number, number, number] = [107, 114, 128]
const BORDE: [number, number, number] = [229, 231, 235]
const FONDO: [number, number, number] = [249, 250, 251]

async function cargarLogo(): Promise<{ data: string; ratio: number } | null> {
  try {
    const img = new Image()
    img.src = logoToshifyUrl
    await img.decode()
    const c = document.createElement('canvas')
    // Achicado: el original es enorme y engorda el PDF
    const ancho = 600
    c.width = ancho
    c.height = Math.round(ancho * img.naturalHeight / img.naturalWidth)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    return { data: c.toDataURL('image/png'), ratio: c.width / c.height }
  } catch {
    return null
  }
}

export async function generarInformeGestionPdf(datos: DatosInforme): Promise<Blob> {
  const { default: jsPDF } = await import('jspdf')
  const pdf = new jsPDF('p', 'mm', 'a4')
  const anchoPagina = pdf.internal.pageSize.getWidth()
  const altoPagina = pdf.internal.pageSize.getHeight()
  const margen = 15
  const ancho = anchoPagina - margen * 2
  const limite = altoPagina - 18 // deja lugar al pie
  let y = margen

  const color = (c: [number, number, number]) => pdf.setTextColor(c[0], c[1], c[2])
  const nuevaPagina = () => { pdf.addPage(); y = margen }
  const asegurar = (alto: number) => { if (y + alto > limite) nuevaPagina() }
  // Se mide con la misma fuente con la que se escribe (normal), si no corta distinto
  const lineas = (texto: string, w: number, tam: number) => {
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(tam)
    return pdf.splitTextToSize(texto, w) as string[]
  }

  const tituloSeccion = (texto: string) => {
    asegurar(16)
    y += 4
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(13)
    color(TEXTO)
    pdf.text(texto, margen, y)
    y += 2
    pdf.setDrawColor(ROJO[0], ROJO[1], ROJO[2])
    pdf.setLineWidth(0.6)
    pdf.line(margen, y, margen + 30, y)
    y += 6
  }

  // ── Encabezado ──
  const logo = await cargarLogo()
  if (logo) {
    const h = 9
    pdf.addImage(logo.data, 'PNG', anchoPagina - margen - h * logo.ratio, y - 2, h * logo.ratio, h)
  }
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10)
  color(ROJO)
  pdf.text('ESTADO DE SINIESTROS', margen, y + 2)
  pdf.setFontSize(18)
  color(TEXTO)
  pdf.text('INFORME EJECUTIVO DE GESTIÓN', margen, y + 10)
  y += 17
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  color(GRIS)
  pdf.text(`Área: Siniestros   ·   Fecha: ${datos.fecha}   ·   Período: ${datos.periodo}`, margen, y)
  y += 5
  if (datos.aclaracion) {
    pdf.text(`Aclaración: ${datos.aclaracion}`, margen, y)
    y += 5
  }
  y += 3

  // ── Indicadores ──
  const kpis = [
    { valor: String(datos.kpis.total), label: 'CASOS TOTALES' },
    { valor: String(datos.kpis.enTramite), label: 'EN TRÁMITE / CARGA' },
    { valor: String(datos.kpis.cerrados), label: 'CERRADOS' },
    { valor: datos.kpis.enReclamo, label: 'PRESUPUESTO EN RECLAMO' },
  ]
  const gap = 4
  const anchoKpi = (ancho - gap * 3) / 4
  kpis.forEach((k, i) => {
    const x = margen + i * (anchoKpi + gap)
    pdf.setFillColor(FONDO[0], FONDO[1], FONDO[2])
    pdf.setDrawColor(BORDE[0], BORDE[1], BORDE[2])
    pdf.setLineWidth(0.3)
    pdf.roundedRect(x, y, anchoKpi, 22, 2, 2, 'FD')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(i === 3 ? 14 : 18)
    color(i === 3 ? ROJO : TEXTO)
    pdf.text(k.valor, x + anchoKpi / 2, y + 11, { align: 'center' })
    pdf.setFontSize(7.5)
    color(GRIS)
    pdf.text(k.label, x + anchoKpi / 2, y + 17.5, { align: 'center' })
  })
  y += 30

  // ── Responsabilidad ──
  tituloSeccion('Análisis de Responsabilidad (Siniestralidad)')
  const totalResp = datos.responsabilidad.reduce((a, r) => a + r.cantidad, 0)
  for (const r of datos.responsabilidad) {
    if (!r.cantidad) continue
    const pct = totalResp ? Math.round((r.cantidad / totalResp) * 100) : 0
    const det = lineas(r.detalle, ancho - 50, 9)
    asegurar(8 + det.length * 4)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(16)
    pdf.setTextColor(r.color[0], r.color[1], r.color[2])
    pdf.text(`${pct}%`, margen, y + 1)
    pdf.setFontSize(10)
    color(TEXTO)
    pdf.text(`${r.label} (${r.cantidad} ${r.cantidad === 1 ? 'caso' : 'casos'})`, margen + 22, y)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    color(GRIS)
    pdf.text(det, margen + 22, y + 4.5)
    // Barra de proporción
    pdf.setFillColor(BORDE[0], BORDE[1], BORDE[2])
    pdf.rect(anchoPagina - margen - 40, y - 2.5, 40, 2.5, 'F')
    pdf.setFillColor(r.color[0], r.color[1], r.color[2])
    pdf.rect(anchoPagina - margen - 40, y - 2.5, 40 * (pct / 100), 2.5, 'F')
    y += 7 + det.length * 4
  }

  // ── Recomendaciones (texto libre que se escribe al generar) ──
  if (datos.recomendaciones?.trim()) {
    tituloSeccion('Recomendaciones Estratégicas y Puntos de Atención')
    pdf.setFont('helvetica', 'normal')
    color(TEXTO)
    for (const parrafo of datos.recomendaciones.trim().split(/\n+/)) {
      const ls = lineas(parrafo, ancho, 10)
      asegurar(ls.length * 4.6 + 2)
      pdf.text(ls, margen, y)
      y += ls.length * 4.6 + 2.5
    }
  }

  // ── Casos ──
  const caso = (c: CasoInforme) => {
    const anchoTexto = ancho - 8
    const detalle = c.detalle ? lineas(c.detalle, anchoTexto - 24, 9) : []
    const cierre = c.cierre ? lineas(c.cierre.texto, anchoTexto - 24, 9) : []
    const alto = 16 + (detalle.length + cierre.length) * 4 + (detalle.length ? 2 : 0) + (cierre.length ? 2 : 0)
    asegurar(alto + 3)
    const y0 = y
    pdf.setDrawColor(BORDE[0], BORDE[1], BORDE[2])
    pdf.setLineWidth(0.3)
    pdf.roundedRect(margen, y0, ancho, alto, 1.5, 1.5, 'S')
    pdf.setFillColor(ROJO[0], ROJO[1], ROJO[2])
    pdf.rect(margen, y0, 1.2, alto, 'F')

    let yy = y0 + 6
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(11)
    color(TEXTO)
    pdf.text(c.patente, margen + 5, yy)
    const xTitulo = margen + 5 + pdf.getTextWidth(c.patente) + 4
    pdf.setFontSize(10)
    color(ROJO)
    pdf.text(c.titulo, xTitulo, yy)
    if (c.monto) {
      color(TEXTO)
      pdf.text(c.monto, anchoPagina - margen - 4, yy, { align: 'right' })
    }
    yy += 5
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8.5)
    color(GRIS)
    pdf.text(c.datos.filter(d => d.valor).map(d => `${d.label}: ${d.valor}`).join('     '), margen + 5, yy)
    yy += 5
    const bloque = (label: string, ls: string[]) => {
      if (!ls.length) return
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(9)
      color(TEXTO)
      pdf.text(`${label}:`, margen + 5, yy)
      pdf.setFont('helvetica', 'normal')
      pdf.text(ls, margen + 29, yy)
      yy += ls.length * 4 + 2
    }
    bloque('Detalle', detalle)
    if (c.cierre) bloque(c.cierre.label, cierre)
    y = y0 + alto + 3
  }

  const seccionCasos = (titulo: string, casos: CasoInforme[]) => {
    if (!casos.length) return
    tituloSeccion(titulo)
    casos.forEach(caso)
  }
  seccionCasos('Siniestros en Trámite (Gestión Administrativa)', datos.administrativos)
  seccionCasos('Siniestros en Trámite (Gestión Legal)', datos.legales)
  seccionCasos('Siniestros Cerrados (Historial Reciente)', datos.cerrados)

  // ── Nuevos ingresos ──
  if (datos.nuevos.length) {
    tituloSeccion('Nuevos Ingresos (Reporte Consolidado)')
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9.5)
    color(GRIS)
    const intro = lineas(
      `Los siguientes ${datos.nuevos.length} ${datos.nuevos.length === 1 ? 'siniestro se encuentra' : 'siniestros se encuentran'} en etapa de evaluación inicial, carga de denuncia o recopilación de presupuestos.`,
      ancho, 9.5)
    pdf.text(intro, margen, y)
    y += intro.length * 4.4 + 3
    const cols = [
      { label: 'Dominio', x: margen + 3 },
      { label: 'Fecha', x: margen + 35 },
      { label: 'Mes', x: margen + 65 },
      { label: 'Estado preliminar', x: margen + 100 },
    ]
    const encabezado = () => {
      pdf.setFillColor(FONDO[0], FONDO[1], FONDO[2])
      pdf.rect(margen, y - 4.5, ancho, 7, 'F')
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(9)
      color(TEXTO)
      cols.forEach(c => pdf.text(c.label, c.x, y))
      y += 6
    }
    asegurar(14)
    encabezado()
    pdf.setFont('helvetica', 'normal')
    for (const n of datos.nuevos) {
      if (y + 6 > limite) { nuevaPagina(); encabezado(); pdf.setFont('helvetica', 'normal') }
      color(TEXTO)
      pdf.text(n.patente, cols[0].x, y)
      pdf.text(n.fecha, cols[1].x, y)
      pdf.text(n.mes, cols[2].x, y)
      pdf.text(n.estado, cols[3].x, y)
      pdf.setDrawColor(BORDE[0], BORDE[1], BORDE[2])
      pdf.line(margen, y + 2, margen + ancho, y + 2)
      y += 6
    }
  }

  // ── Pie con número de página ──
  const paginas = pdf.getNumberOfPages()
  for (let i = 1; i <= paginas; i++) {
    pdf.setPage(i)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    color(GRIS)
    pdf.text('Informe Ejecutivo de Siniestros', margen, altoPagina - 8)
    pdf.text(`Página ${i} de ${paginas}`, anchoPagina - margen, altoPagina - 8, { align: 'right' })
  }

  return pdf.output('blob')
}
