// src/modules/integraciones/alegra/AlegraComprasModule.tsx
/**
 * Integraciones > Alegra (44 Dreams / Grupo CG)
 *
 * Se sube el Excel de ARCA "Mis Comprobantes Recibidos" tal cual, con una columna
 * más a la derecha con el NOMBRE de la cuenta contable de Alegra. Cada comprobante
 * queda guardado con su estado en Alegra: listo para cargar, qué hay que revisar,
 * o cómo quedó cargado (número, cuenta, total y link). Desde acá se crean las
 * facturas de proveedor y, por las notas de crédito, las notas débito asociadas a
 * la factura (mismo criterio que la carga masiva de octubre). Nunca modifica lo que
 * ya existe en Alegra: si un comprobante ya estaba, solo se vincula.
 *
 * Toda la comunicación con Alegra pasa por /api/alegra (server-alegra.js).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  FileSpreadsheet, FileUp, RefreshCw, UploadCloud, ExternalLink, EyeOff, Undo2,
  CheckCircle2, AlertTriangle, Clock, List, Receipt, FileMinus, Inbox, Ban, FolderSearch, FileText, Paperclip, UserPlus,
} from 'lucide-react'
import Swal from 'sweetalert2'
import type { ColumnDef } from '@tanstack/react-table'
import {
  obtenerImportaciones,
  obtenerComprobantes,
  obtenerCuentasAlegra,
  importarExcelArca,
  revisarEnAlegra,
  buscarEnDrive,
  obtenerCarpetaSugerida,
  adjuntarFactura,
  MAX_ADJUNTO_MB,
  elegirCuenta,
  guardarProveedor,
  marcarComprobante,
  cargarComprobantes,
  urlComprobanteAlegra,
  leerExcelArca,
  LOTE_CARGA_COMPROBANTES,
} from '../../../services/alegraComprasService'
import type {
  EmpresaAlegra,
  ComprobanteArca,
  CuentaAlegra,
  ImportacionesResponse,
  RevisionResponse,
} from '../../../services/alegraComprasService'
import { formatFechaHoraART, fechaISOART } from '../../../utils/fechaArgentina'
import { showSuccess, showError } from '../../../utils/toast'
import { DataTable } from '../../../components/ui/DataTable'
import '../cresium/CresiumModule.css'
import './AlegraComprasModule.css'
import { abrirFormularioProveedor } from './proveedorForm'

/** Estado que se ve en la tabla */
type EstadoVista = 'esperando' | 'listo' | 'revisar' | 'cargado' | 'error' | 'ignorado'
type Filtro = 'todos' | EstadoVista | 'nc'

const ETIQUETA_ESTADO: Record<EstadoVista, string> = {
  esperando: 'Esperando factura',
  listo: 'Lista para cargar',
  revisar: 'Revisar',
  cargado: 'En Alegra',
  error: 'Error',
  ignorado: 'Desestimada',
}

const CLASE_TIPO: Record<string, { letra: string; nc: boolean }> = {
  1: { letra: 'A', nc: false },
  11: { letra: 'C', nc: false },
  3: { letra: 'A', nc: true },
  13: { letra: 'C', nc: true },
}

const GRUPO_CUENTA: Record<string, string> = {
  expense: 'Gastos',
  cost: 'Costos',
  asset: 'Activos',
  liability: 'Pasivos',
  equity: 'Patrimonio',
  income: 'Ingresos',
}
const ORDEN_GRUPOS = ['expense', 'cost', 'asset', 'liability', 'equity', 'income']

const PESOS = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })
const pesos = (n: number | null | undefined) => PESOS.format(n || 0)
const NUM = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Moneda del comprobante: 'ARS' (ARCA la informa como "$" o "PES") o el código que venga */
function codigoMoneda(m: string | null | undefined): string {
  const x = String(m ?? '').trim().toUpperCase()
  if (!x || x === '$' || x === 'PES' || x === 'ARS') return 'ARS'
  if (x === 'DOL' || x === 'U$S' || x === 'US$') return 'USD'
  return x
}

/** Importe en la moneda del comprobante: "$ 1.234,00" / "USD 2.857,50" */
function importe(n: number, moneda: string): string {
  return moneda === 'ARS' ? pesos(n) : `${moneda} ${NUM.format(n || 0)}`
}

function formatDia(dia: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dia || '')
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : '-'
}

function escaparHtml(txt: string): string {
  return txt.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function estadoVista(c: ComprobanteArca): EstadoVista {
  if (c.estado === 'cargado' || c.estado === 'ignorado' || c.estado === 'error') return c.estado
  if (c.revisar) return 'revisar'
  return c.confirmado ? 'listo' : 'esperando'
}

const esNc = (c: ComprobanteArca) => !!CLASE_TIPO[c.tipo_cod]?.nc

/** "Factura A" / "NC C" / el texto de ARCA si no es un tipo que se carga */
function nombreTipo(c: ComprobanteArca): string {
  const t = CLASE_TIPO[c.tipo_cod]
  if (!t) return c.tipo || `Tipo ${c.tipo_cod}`
  return `${t.nc ? 'Nota de crédito' : 'Factura'} ${t.letra}`
}

const numeroArca = (c: ComprobanteArca) =>
  `${String(c.punto_venta).padStart(5, '0')}-${String(c.numero).padStart(8, '0')}`

/** Pendiente o con error y sin nada para revisar: se puede confirmar y cargar */
function esSeleccionable(c: ComprobanteArca): boolean {
  return (c.estado === 'pendiente' || c.estado === 'error') && !c.revisar
}

/** Se puede cargar: además, se confirmó que la factura se recibió y el proveedor existe en Alegra */
function esCargable(c: ComprobanteArca): boolean {
  return esSeleccionable(c) && c.confirmado && !!c.alegra_proveedor_id
}

function mesActualART(): string {
  return (fechaISOART(new Date().toISOString()) ?? new Date().toISOString().slice(0, 10)).slice(0, 7)
}

function resumenRevision(r: RevisionResponse): string {
  return [
    `${r.listos} sin observaciones`,
    r.a_revisar ? `${r.a_revisar} para revisar` : '',
    r.ya_estaban ? `${r.ya_estaban} ya estaban en Alegra` : '',
    r.revertidos ? `${r.revertidos} se borraron en Alegra (vuelven a pendiente)` : '',
  ].filter(Boolean).join(' · ')
}

interface AlegraComprasModuleProps {
  empresa: EmpresaAlegra
}

export function AlegraComprasModule({ empresa }: AlegraComprasModuleProps) {
  const [info, setInfo] = useState<ImportacionesResponse | null>(null)
  const [mes, setMes] = useState<string>('')
  const [filas, setFilas] = useState<ComprobanteArca[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [cuentas, setCuentas] = useState<CuentaAlegra[]>([])
  const [revisando, setRevisando] = useState(false)
  const [buscandoDrive, setBuscandoDrive] = useState(false)
  const inputArchivo = useRef<HTMLInputElement>(null)
  const inputAdjunto = useRef<HTMLInputElement>(null)
  const [adjuntandoA, setAdjuntandoA] = useState<ComprobanteArca | null>(null)

  const puedeEditar = !!info?.puede_editar && !!info?.alegra_configurado

  const leerFilas = useCallback(async (m: string) => {
    if (!m) return
    const r = await obtenerComprobantes(empresa, m)
    setFilas(r.filas)
  }, [empresa])

  // Al abrir: mes del comprobante más reciente guardado (o el actual)
  useEffect(() => {
    setInfo(null)
    setMes('')
    setError(null)
    obtenerImportaciones(empresa)
      .then((r) => {
        setInfo(r)
        setMes(r.ultimo_mes ?? mesActualART())
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'No se pudo leer la información')
        setLoading(false)
      })
  }, [empresa])

  // Comprobantes del mes elegido (de todos los Excel subidos)
  useEffect(() => {
    if (!mes) return
    let vigente = true
    setLoading(true)
    setSeleccion(new Set())
    setFiltro('todos')
    leerFilas(mes)
      .catch((err) => { if (vigente) setError(err instanceof Error ? err.message : 'No se pudo leer') })
      .finally(() => { if (vigente) setLoading(false) })
    return () => { vigente = false }
  }, [mes, leerFilas])

  // Plan de cuentas de Alegra (para elegir a mano), solo si puede editar
  useEffect(() => {
    if (!puedeEditar) return
    obtenerCuentasAlegra(empresa)
      .then((r) => setCuentas(r.categorias))
      .catch(() => setCuentas([]))
  }, [empresa, puedeEditar])

  const cuentasAgrupadas = useMemo(() => ORDEN_GRUPOS
    .map((tipo) => ({
      tipo,
      label: GRUPO_CUENTA[tipo],
      cuentas: cuentas
        .filter((c) => c.tipo === tipo)
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })),
    }))
    .filter((g) => g.cuentas.length > 0), [cuentas])

  const resumen = useMemo(() => {
    const cuenta = (e: EstadoVista) => filas.filter((c) => estadoVista(c) === e).length
    const activas = filas.filter((c) => c.estado !== 'ignorado')
    return {
      total: activas.length,
      esperando: cuenta('esperando'),
      listo: cuenta('listo'),
      revisar: cuenta('revisar'),
      cargado: cuenta('cargado'),
      error: cuenta('error'),
      ignorado: cuenta('ignorado'),
      nc: activas.filter(esNc).length,
      importeCargado: filas
        .filter((c) => c.estado === 'cargado')
        .reduce((s, c) => s + (esNc(c) ? -c.total : c.total), 0),
    }
  }, [filas])

  const visibles = useMemo(() => {
    // Las desestimadas solo se ven tocando su tarjeta
    if (filtro === 'todos') return filas.filter((c) => c.estado !== 'ignorado')
    if (filtro === 'nc') return filas.filter((c) => esNc(c) && c.estado !== 'ignorado')
    return filas.filter((c) => estadoVista(c) === filtro)
  }, [filas, filtro])

  const seleccionablesVisibles = useMemo(() => visibles.filter(esCargable), [visibles])
  const elegidos = useMemo(() => filas.filter((c) => seleccion.has(c.id) && esSeleccionable(c)), [filas, seleccion])
  const elegidosCargables = elegidos.filter(esCargable)

  const toggle = (id: string) => {
    setSeleccion((prev) => {
      const nuevo = new Set(prev)
      if (nuevo.has(id)) nuevo.delete(id)
      else nuevo.add(id)
      return nuevo
    })
  }

  /* ----------------------------- Subir Excel ----------------------------- */

  const subirExcel = async (archivo: File) => {
    let datos: Awaited<ReturnType<typeof leerExcelArca>>
    try {
      datos = await leerExcelArca(archivo)
    } catch (err) {
      Swal.fire('No se pudo leer el Excel', err instanceof Error ? err.message : 'Error', 'error')
      return
    }
    Swal.fire({
      title: 'Subiendo el Excel...',
      html: `${datos.filas.length} filas · después se revisa cada comprobante en Alegra`,
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    })
    try {
      const r = await importarExcelArca(empresa, { archivo: archivo.name, ...datos })
      Swal.close()
      const ultimoMes = [...r.meses].sort().pop()
      if (ultimoMes && ultimoMes !== mes) setMes(ultimoMes)
      else await leerFilas(mes)
      await Swal.fire({
        title: `${r.comprobantes} comprobantes`,
        icon: r.error_alegra ? 'warning' : 'success',
        html: `
          <div class="cr-swal">
            <p>${r.nuevos} nuevos${r.comprobantes - r.nuevos > 0 ? ` · ${r.comprobantes - r.nuevos} ya estaban guardados (no se duplican)` : ''}</p>
            <p>Nada se cargó en Alegra. Tocá «Buscar en Drive» o adjuntá la factura con el clip; las que tienen factura se pueden cargar.</p>
            ${r.revision ? `<p>${escaparHtml(resumenRevision(r.revision))}</p>` : ''}
            ${r.error_alegra ? `<p class="cr-error" style="white-space:normal;max-width:none">No se pudo revisar en Alegra: ${escaparHtml(r.error_alegra)}</p>` : ''}
            ${r.filas_omitidas ? `<p class="cr-muted">${r.filas_omitidas} filas sin CUIT o número se omitieron.</p>` : ''}
          </div>`,
      })
    } catch (err) {
      Swal.close()
      Swal.fire('No se pudo subir', err instanceof Error ? err.message : 'Error', 'error')
    }
  }

  /* ------------------------------ Revisar -------------------------------- */

  const revisar = async () => {
    if (!mes) return
    setRevisando(true)
    try {
      const r = await revisarEnAlegra(empresa, mes)
      await leerFilas(mes)
      showSuccess('Revisado en Alegra', resumenRevision(r))
    } catch (err) {
      showError('No se pudo revisar en Alegra', err instanceof Error ? err.message : 'Error')
    } finally {
      setRevisando(false)
    }
  }

  /* ------------------------------- Cargar -------------------------------- */

  const cargarSeleccionados = async () => {
    const aCargar = filas.filter((c) => seleccion.has(c.id) && esCargable(c))
    if (aCargar.length === 0) return
    const facturas = aCargar.filter((c) => !esNc(c))
    const notas = aCargar.filter(esNc)
    const confirmacion = await Swal.fire({
      title: `Cargar ${aCargar.length} comprobantes en Alegra`,
      html: `
        <div class="cr-swal">
          <p><b>${escaparHtml(info?.empresa_label ?? '')}</b></p>
          ${facturas.length ? `<p>${facturas.length} facturas de proveedor: <b>${pesos(facturas.reduce((s, c) => s + c.total, 0))}</b></p>` : ''}
          ${notas.length ? `<p>${notas.length} notas de crédito → notas débito asociadas a la factura: <b>${pesos(notas.reduce((s, c) => s + c.total, 0))}</b></p>` : ''}
          <p class="cr-muted">Si alguno ya existe en Alegra no se crea de nuevo: solo se vincula.</p>
        </div>`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Cargar en Alegra',
      cancelButtonText: 'Cancelar',
    })
    if (!confirmacion.isConfirmed) return

    // Facturas primero, así las notas encuentran su factura
    const ids = [...facturas, ...notas].map((c) => c.id)
    let cargados = 0
    const errores: string[] = []
    Swal.fire({ title: 'Cargando en Alegra...', html: `0 de ${ids.length}`, allowOutsideClick: false, didOpen: () => Swal.showLoading() })
    try {
      for (let i = 0; i < ids.length; i += LOTE_CARGA_COMPROBANTES) {
        const r = await cargarComprobantes(empresa, ids.slice(i, i + LOTE_CARGA_COMPROBANTES))
        cargados += r.cargados
        r.resultados.filter((x) => !x.ok).forEach((x) => {
          const c = filas.find((y) => y.id === x.id)
          errores.push(`${c ? `${c.proveedor} ${numeroArca(c)}` : x.id}: ${x.error}`)
        })
        Swal.update({ html: `${Math.min(i + LOTE_CARGA_COMPROBANTES, ids.length)} de ${ids.length}` })
        Swal.showLoading()
      }
      Swal.close()
      if (errores.length === 0) showSuccess('Cargado en Alegra', `${cargados} comprobantes`)
      else {
        await Swal.fire({
          title: `${cargados} cargados, ${errores.length} sin cargar`,
          html: `<div class="cr-swal">${errores.map((e) => `• ${escaparHtml(e)}`).join('<br/>')}</div>`,
          icon: 'warning',
        })
      }
    } catch (err) {
      Swal.close()
      Swal.fire('Error', err instanceof Error ? err.message : 'No se pudo cargar en Alegra', 'error')
    }
    setSeleccion(new Set())
    await leerFilas(mes)
  }

  const buscarDrive = async () => {
    if (!mes) return
    setBuscandoDrive(true)
    try {
      const r = await buscarEnDrive(empresa, mes)
      await leerFilas(mes)
      showSuccess(
        `${r.encontrados} de ${r.comprobantes} facturas en el Drive`,
        `${r.nuevos > 0 ? `${r.nuevos} nuevas marcadas como recibidas · ` : ''}${r.sin_archivo} sin archivo`,
      )
    } catch (err) {
      showError('No se pudo buscar en Drive', err instanceof Error ? err.message : 'Error')
    } finally {
      setBuscandoDrive(false)
    }
  }

  /** Crea en Alegra el proveedor del comprobante con los datos mínimos */
  const crearProveedor = async (c: ComprobanteArca) => {
    const datos = await abrirFormularioProveedor({
      alegra_id: null,
      cuit: c.cuit,
      nombre: c.proveedor ?? '',
      nombre_comercial: null,
      // Factura A la emite un responsable inscripto; C, un monotributista
      iva_condicion: CLASE_TIPO[c.tipo_cod]?.letra === 'C' ? 'UNIQUE_TRIBUTE_RESPONSABLE' : 'IVA_RESPONSABLE',
      email: null, telefono: null, celular: null, provincia: null, ciudad: null, domicilio: null,
      codigo_postal: null, dias_pago: null, observaciones: null,
    }, { titulo: 'Crear proveedor en Alegra', completo: false, confirmar: 'Crear en Alegra' })
    if (!datos) return
    try {
      const r = await guardarProveedor(empresa, datos, true)
      const id = r.proveedor.alegra_id
      setFilas((prev) => prev.map((x) => (x.cuit === c.cuit && x.estado !== 'cargado' ? { ...x, alegra_proveedor_id: id } : x)))
      showSuccess(r.creado ? 'Proveedor creado en Alegra' : 'Ya existía en Alegra (datos actualizados)', r.proveedor.nombre)
    } catch (err) {
      showError('No se pudo crear el proveedor', err instanceof Error ? err.message : 'Error')
    }
  }

  const elegirAdjunto = (c: ComprobanteArca) => {
    setAdjuntandoA(c)
    inputAdjunto.current?.click()
  }

  /** Sube la factura a la carpeta del proveedor en Drive (se puede cambiar la carpeta antes) */
  const adjuntar = async (c: ComprobanteArca, archivo: File) => {
    if (archivo.size > MAX_ADJUNTO_MB * 1024 * 1024) {
      showError('Archivo muy grande', `Máximo ${MAX_ADJUNTO_MB} MB`)
      return
    }
    Swal.fire({ title: 'Buscando la carpeta del proveedor...', allowOutsideClick: false, didOpen: () => Swal.showLoading() })
    let sug
    try {
      sug = await obtenerCarpetaSugerida(empresa, c.id)
    } catch (err) {
      Swal.close()
      Swal.fire('No se pudo leer el Drive', err instanceof Error ? err.message : 'Error', 'error')
      return
    }
    Swal.close()
    const ext = (/\.[a-z0-9]{2,5}$/i.exec(archivo.name)?.[0] ?? '.pdf').toLowerCase()
    const nombre = sug.nombre.replace(/\.pdf$/, ext)
    const opciones = [...new Set([sug.sugerida, ...sug.carpetas])]
    const r = await Swal.fire({
      title: 'Adjuntar factura',
      html: `
        <div class="cr-swal cr-form">
          <p><b>${escaparHtml(c.proveedor ?? '')}</b> · ${escaparHtml(nombreTipo(c))} ${numeroArca(c)}</p>
          <label>Carpeta en Drive
            <select id="ac-carpeta" class="swal2-select">
              ${opciones.map((o) => `<option value="${escaparHtml(o)}" ${o === sug.sugerida ? 'selected' : ''}>${escaparHtml(o)}${o === sug.sugerida && !sug.existe ? ' (se crea)' : ''}</option>`).join('')}
            </select>
          </label>
          <p class="cr-muted">${sug.origen === 'anterior'
            ? 'Donde están las facturas anteriores de este proveedor.'
            : sug.origen === 'nombre' ? 'Carpeta con el nombre del proveedor.' : 'No encontré una carpeta del proveedor: se crea una nueva.'}</p>
          <p>Se guarda como:<br/><b>${escaparHtml(nombre)}</b></p>
          <p class="cr-muted">Archivo elegido: ${escaparHtml(archivo.name)}</p>
        </div>`,
      showCancelButton: true,
      confirmButtonText: 'Subir al Drive',
      cancelButtonText: 'Cancelar',
      focusConfirm: false,
      preConfirm: () => (document.getElementById('ac-carpeta') as HTMLSelectElement | null)?.value ?? sug.sugerida,
    })
    if (!r.isConfirmed || !r.value) return
    Swal.fire({ title: 'Subiendo la factura...', allowOutsideClick: false, didOpen: () => Swal.showLoading() })
    try {
      const res = await adjuntarFactura(empresa, c.id, archivo, String(r.value))
      Swal.close()
      setFilas((prev) => prev.map((x) => (x.id === c.id
        ? {
          ...x,
          drive_link: res.drive_link,
          drive_nombre: res.drive_nombre,
          drive_ruta: res.drive_ruta,
          confirmado: x.estado === 'pendiente' || x.estado === 'error' ? true : x.confirmado,
        }
        : x)))
      showSuccess('Factura guardada en el Drive', `${res.drive_ruta}/${res.drive_nombre}`)
    } catch (err) {
      Swal.close()
      Swal.fire('No se pudo subir', err instanceof Error ? err.message : 'Error', 'error')
    }
  }

  const cambiarCuenta = async (c: ComprobanteArca, categoriaId: string) => {
    if (!categoriaId) return
    try {
      const r = await elegirCuenta(empresa, c.id, categoriaId)
      setFilas((prev) => prev.map((x) => (x.id === c.id
        ? { ...x, alegra_categoria_id: r.cuenta.id, alegra_categoria_nombre: r.cuenta.nombre, revisar: r.revisar }
        : x)))
    } catch (err) {
      showError('No se pudo cambiar la cuenta', err instanceof Error ? err.message : 'Error')
    }
  }

  const marcar = async (c: ComprobanteArca, accion: 'ignorar' | 'pendiente') => {
    if (accion === 'ignorar') {
      const ok = await Swal.fire({
        title: 'Desestimar comprobante',
        html: `<div class="cr-swal"><b>${escaparHtml(c.proveedor ?? '')}</b> · ${escaparHtml(nombreTipo(c))} ${numeroArca(c)}<br/>No se carga en Alegra y se oculta de la lista. Se ve en la tarjeta «Desestimadas» y se puede restaurar.</div>`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Desestimar',
        cancelButtonText: 'Cancelar',
      })
      if (!ok.isConfirmed) return
    }
    try {
      await marcarComprobante(empresa, c.id, accion)
      setSeleccion((prev) => {
        const nuevo = new Set(prev)
        nuevo.delete(c.id)
        return nuevo
      })
      await leerFilas(mes)
    } catch (err) {
      showError('Error', err instanceof Error ? err.message : 'No se pudo actualizar')
    }
  }

  /* ------------------------------ Columnas ------------------------------- */

  const columnas = useMemo<ColumnDef<ComprobanteArca, unknown>[]>(() => [
    {
      id: 'sel',
      header: '',
      enableSorting: false,
      cell: ({ row }) => {
        const c = row.original
        return (
          <input
            type="checkbox"
            className="cr-check"
            checked={seleccion.has(c.id)}
            disabled={!puedeEditar || !esCargable(c)}
            onChange={() => toggle(c.id)}
            aria-label="Seleccionar comprobante"
          />
        )
      },
    },
    {
      accessorKey: 'fecha',
      header: 'Fecha',
      cell: ({ row }) => formatDia(row.original.fecha),
    },
    {
      id: 'comprobante',
      header: 'Comprobante',
      accessorFn: (c) => `${nombreTipo(c)} ${numeroArca(c)}`,
      // El filtro agrupa por tipo (Factura A, Nota de crédito C, ...), no por número
      meta: { filterValue: ((c: ComprobanteArca) => nombreTipo(c)) as (row: never) => unknown },
      cell: ({ row }) => {
        const c = row.original
        return (
          <div className="cr-contraparte">
            <span className={`ac-tipo ${esNc(c) ? 'ac-tipo--nc' : ''}`}>
              {esNc(c) ? <FileMinus size={13} /> : <Receipt size={13} />}
              {nombreTipo(c)}
            </span>
            <span className="cr-muted">{numeroArca(c)}{c.fila ? ` · fila ${c.fila}` : ''}</span>
          </div>
        )
      },
    },
    {
      accessorKey: 'proveedor',
      header: 'Proveedor',
      cell: ({ row }) => {
        const c = row.original
        return (
          <div className="cr-contraparte">
            <span className="cr-nombre">{c.proveedor || '-'}</span>
            <span className="cr-muted">
              CUIT {c.cuit}
              {c.proveedor_creado ? ' · creado al cargar' : ''}
            </span>
            {c.estado !== 'cargado' && c.estado !== 'ignorado' && !c.alegra_proveedor_id && (
              puedeEditar ? (
                <button type="button" className="ac-crear-prov" onClick={() => void crearProveedor(c)} title="No existe en Alegra">
                  <UserPlus size={12} /> Crear proveedor
                </button>
              ) : <span className="cr-aviso">No existe en Alegra</span>
            )}
          </div>
        )
      },
    },
    {
      accessorKey: 'total',
      header: 'Total',
      meta: { cellAlign: 'right', headerAlign: 'right' },
      cell: ({ row }) => {
        const c = row.original
        const neto = Object.entries(c.netos || {})
        return (
          <div className="cr-contraparte ac-derecha">
            <span className="cr-importe">{esNc(c) ? '-' : ''}{importe(c.total, codigoMoneda(c.moneda))}</span>
            {neto.length > 0 && (
              <span className="cr-muted">
                {neto.map(([p, n]) => `IVA ${String(p).replace('.', ',')}%: ${importe(n, codigoMoneda(c.moneda))}`).join(' · ')}
              </span>
            )}
          </div>
        )
      },
    },
    {
      id: 'moneda',
      header: 'Moneda',
      accessorFn: (c) => codigoMoneda(c.moneda),
      meta: { cellAlign: 'center', headerAlign: 'center' },
      cell: ({ row }) => {
        const c = row.original
        const m = codigoMoneda(c.moneda)
        const tc = Number(c.tipo_cambio) || 1
        return (
          <div className="cr-contraparte ac-moneda">
            <span className={`cr-badge ${m === 'ARS' ? 'ac-moneda--ars' : 'ac-moneda--ext'}`}>{m}</span>
            {m !== 'ARS' && tc > 1 && (
              <span className="cr-muted" title="Tipo de cambio informado en ARCA">
                TC {NUM.format(tc)} · ≈ {pesos(c.total * tc)}
              </span>
            )}
          </div>
        )
      },
    },
    {
      id: 'recibida',
      header: 'Factura',
      // Recibida = el archivo está en el Drive (encontrado con «Buscar en Drive» o adjuntado con el clip)
      accessorFn: (c) => (c.drive_link ? 'Recibida' : 'Falta'),
      meta: { cellAlign: 'center', headerAlign: 'center' },
      cell: ({ row }) => {
        const c = row.original
        if (!c.drive_link) return <span className="cr-muted">{c.estado === 'cargado' || c.estado === 'ignorado' ? '-' : 'Falta'}</span>
        return (
          <a
            className="cr-link ac-archivo"
            href={c.drive_link}
            target="_blank"
            rel="noreferrer"
            title={`${c.drive_ruta ? `${c.drive_ruta}/` : ''}${c.drive_nombre ?? ''}`}
          >
            <FileText size={12} /> Ver factura
          </a>
        )
      },
    },
    {
      id: 'cuenta',
      header: 'Cuenta contable',
      enableSorting: false,
      accessorFn: (c) => c.alegra_categoria_nombre ?? c.cuenta_excel ?? '',
      cell: ({ row }) => {
        const c = row.original
        const distintaDelExcel = c.cuenta_excel && c.alegra_categoria_nombre &&
          c.cuenta_excel.toLowerCase() !== c.alegra_categoria_nombre.toLowerCase()
        if (c.estado === 'cargado' || c.estado === 'ignorado' || !puedeEditar) {
          return (
            <div className="cr-alegra">
              <span>{c.alegra_categoria_nombre ?? c.cuenta_excel ?? '-'}</span>
              {distintaDelExcel && <span className="cr-muted">Excel: {c.cuenta_excel}</span>}
            </div>
          )
        }
        return (
          <div className="cr-alegra">
            <select
              className={`cr-select ${c.alegra_categoria_id ? '' : 'cr-select--falta'}`}
              value={c.alegra_categoria_id ?? ''}
              onChange={(e) => void cambiarCuenta(c, e.target.value)}
              aria-label="Cuenta contable de Alegra"
            >
              <option value="">{cuentas.length === 0 ? 'Cargando cuentas…' : 'Elegir cuenta contable…'}</option>
              {/* Mientras llega el plan de cuentas se ve la cuenta actual */}
              {cuentas.length === 0 && c.alegra_categoria_id && (
                <option value={c.alegra_categoria_id}>{c.alegra_categoria_nombre}</option>
              )}
              {cuentasAgrupadas.map((g) => (
                <optgroup key={g.tipo} label={g.label}>
                  {g.cuentas.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                </optgroup>
              ))}
            </select>
            {distintaDelExcel && <span className="cr-muted">Excel: {c.cuenta_excel}</span>}
          </div>
        )
      },
    },
    {
      id: 'estado',
      header: 'Estado en Alegra',
      accessorFn: (c) => ETIQUETA_ESTADO[estadoVista(c)],
      cell: ({ row }) => {
        const c = row.original
        const e = estadoVista(c)
        return (
          <div className="cr-estado-celda ac-estado">
            <span className={`cr-badge ac-badge--${e}`}>{ETIQUETA_ESTADO[e]}</span>
            {e === 'cargado' && (
              <>
                {c.alegra_detalle && <span className="ac-detalle">{c.alegra_detalle}</span>}
                {c.cargado_en && <span className="cr-muted">{formatFechaHoraART(c.cargado_en)}</span>}
                {c.alegra_id && c.alegra_tipo && (
                  <a className="cr-link" href={urlComprobanteAlegra(c.alegra_tipo, c.alegra_id)} target="_blank" rel="noreferrer">
                    Ver en Alegra <ExternalLink size={12} />
                  </a>
                )}
              </>
            )}
            {e === 'revisar' && <span className="ac-motivo">{c.revisar}</span>}
            {e === 'listo' && esNc(c) && <span className="cr-muted">Se carga como nota débito asociada a la factura</span>}
            {(e === 'error' || (c.alegra_error && e !== 'cargado')) && c.alegra_error && (
              <span className="cr-error ac-motivo" title={c.alegra_error}>{c.alegra_error}</span>
            )}
          </div>
        )
      },
    },
    {
      id: 'acciones',
      header: '',
      enableSorting: false,
      cell: ({ row }) => {
        const c = row.original
        if (!puedeEditar) return null
        return (
          <div className="cr-acciones-fila">
            {c.estado !== 'ignorado' && !c.drive_link && (
              <button
                className="btn-secondary cr-btn-mini"
                onClick={() => elegirAdjunto(c)}
                title="Adjuntar la factura (se guarda en la carpeta del proveedor en Drive)"
              >
                <Paperclip size={14} />
              </button>
            )}
            {(c.estado === 'pendiente' || c.estado === 'error') && (
              <button className="btn-secondary cr-btn-mini" onClick={() => void marcar(c, 'ignorar')} title="Desestimar (no se carga en Alegra)">
                <EyeOff size={14} />
              </button>
            )}
            {c.estado === 'ignorado' && (
              <button className="btn-secondary cr-btn-mini" onClick={() => void marcar(c, 'pendiente')} title="Restaurar (deja de estar desestimada)">
                <Undo2 size={14} />
              </button>
            )}
          </div>
        )
      },
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [seleccion, puedeEditar, cuentas, cuentasAgrupadas, mes])

  const tarjetas: Array<{ id: Filtro | null; label: string; valor: string | number; icono: typeof List }> = [
    { id: 'todos', label: 'Comprobantes', valor: resumen.total, icono: List },
    { id: 'esperando', label: 'Esperando factura', valor: resumen.esperando, icono: Inbox },
    { id: 'listo', label: 'Listos para cargar', valor: resumen.listo, icono: Clock },
    { id: 'revisar', label: 'A revisar', valor: resumen.revisar, icono: AlertTriangle },
    { id: 'cargado', label: `En Alegra · ${pesos(resumen.importeCargado)}`, valor: resumen.cargado, icono: CheckCircle2 },
    { id: 'error', label: 'Con error', valor: resumen.error, icono: AlertTriangle },
    { id: 'ignorado', label: 'Desestimadas', valor: resumen.ignorado, icono: Ban },
    { id: 'nc', label: 'Notas de crédito', valor: resumen.nc, icono: FileMinus },
  ]

  const faltanSeleccionar = seleccionablesVisibles.filter((c) => !seleccion.has(c.id))

  return (
    <div className="cr-module">
      <div className="cr-stats">
        <div className="stats-grid">
          {tarjetas.map((t) => {
            const Icono = t.icono
            const clickeable = t.id !== null
            return (
              <div
                key={t.label}
                className={`stat-card ${clickeable && filtro === t.id && t.id !== 'todos' ? 'active' : ''}`}
                onClick={clickeable ? () => setFiltro(filtro === t.id ? 'todos' : (t.id as Filtro)) : undefined}
                style={{ cursor: clickeable ? 'pointer' : 'default' }}
                title={t.label}
              >
                <Icono size={20} className="stat-icon" />
                <div className="stat-content">
                  <span className="stat-value">{t.valor}</span>
                  <span className="stat-label">{t.label}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="cr-filtros">
        <label className="cr-campo">
          <span>Mes</span>
          <input
            type="month"
            className="form-input"
            value={mes}
            onChange={(e) => e.target.value && setMes(e.target.value)}
            disabled={!mes}
          />
        </label>
        {info?.puede_editar && (
          <>
            <input
              ref={inputAdjunto}
              type="file"
              accept=".pdf,image/*"
              className="ac-input-archivo"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                const c = adjuntandoA
                setAdjuntandoA(null)
                if (f && c) void adjuntar(c, f)
              }}
            />
            <input
              ref={inputArchivo}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="ac-input-archivo"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) void subirExcel(f)
              }}
            />
            <button className="btn-primary" onClick={() => inputArchivo.current?.click()} disabled={loading}>
              <FileUp size={16} />
              Subir Excel de ARCA
            </button>
          </>
        )}
      </div>

      {info && !info.alegra_configurado && (
        <div className="aviso aviso--warning">Falta el token de Alegra de {info.empresa_label} en el .env del servidor: se puede ver lo subido pero no cargarlo.</div>
      )}

      <DataTable
        data={visibles}
        columns={columnas}
        loading={loading}
        error={error}
        pageSize={50}
        pageSizeOptions={[20, 50, 100, 200]}
        searchPlaceholder="Buscar proveedor, CUIT, número o cuenta..."
        emptyIcon={<FileSpreadsheet size={48} />}
        emptyTitle="No hay comprobantes en este mes"
        emptyDescription={(info?.importaciones.length ?? 0) === 0 ? 'Tocá «Subir Excel de ARCA»' : 'Elegí otro mes o subí el Excel de ARCA'}
        alwaysVisibleColumns={['acciones']}
        // Fijas al desplazar: selección, fecha, comprobante, proveedor y total
        stickyLeftColumns={5}
        getRowClassName={(c) => (seleccion.has(c.id) ? 'cr-fila-seleccionada' : undefined)}
        headerAction={
          <div className="cr-acciones">
            <button
              className="btn-secondary"
              onClick={() => void revisar()}
              disabled={loading || revisando || !mes || !info?.alegra_configurado}
              title="Vuelve a comparar con Alegra: lo que ya está cargado, lo que se borró y lo que falta"
            >
              <RefreshCw size={16} className={revisando ? 'cr-girando' : undefined} />
              Revisar en Alegra
            </button>
            {puedeEditar && (
              <>
                <button
                  className="btn-secondary"
                  onClick={() => void buscarDrive()}
                  disabled={loading || buscandoDrive || !mes}
                  title="Busca la factura de cada comprobante del mes en la carpeta de Drive y marca las que encuentra"
                >
                  <FolderSearch size={16} className={buscandoDrive ? 'cr-girando' : undefined} />
                  Buscar en Drive
                </button>
                {seleccionablesVisibles.length > 0 && (
                  <button
                    className="btn-secondary"
                    onClick={() => setSeleccion(faltanSeleccionar.length > 0
                      ? new Set([...seleccion, ...faltanSeleccionar.map((c) => c.id)])
                      : new Set())}
                    disabled={loading}
                  >
                    {faltanSeleccionar.length > 0 ? `Seleccionar (${seleccionablesVisibles.length})` : 'Quitar selección'}
                  </button>
                )}
                <button className="btn-primary" onClick={() => void cargarSeleccionados()} disabled={loading || elegidosCargables.length === 0}>
                  <UploadCloud size={16} />
                  Cargar en Alegra ({elegidosCargables.length})
                </button>
              </>
            )}
          </div>
        }
      />
    </div>
  )
}
