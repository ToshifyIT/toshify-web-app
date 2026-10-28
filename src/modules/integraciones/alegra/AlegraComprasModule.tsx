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
  CheckCircle2, AlertTriangle, Clock, List, Receipt, FileMinus, CircleDollarSign, Ban,
} from 'lucide-react'
import Swal from 'sweetalert2'
import type { ColumnDef } from '@tanstack/react-table'
import {
  obtenerImportaciones,
  obtenerComprobantes,
  obtenerCuentasAlegra,
  importarExcelArca,
  revisarEnAlegra,
  elegirCuenta,
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
import { formatFechaHoraART } from '../../../utils/fechaArgentina'
import { showSuccess, showError } from '../../../utils/toast'
import { DataTable } from '../../../components/ui/DataTable'
import '../cresium/CresiumModule.css'
import './AlegraComprasModule.css'

/** Estado que se ve en la tabla */
type EstadoVista = 'listo' | 'revisar' | 'cargado' | 'error' | 'ignorado'
type Filtro = 'todos' | EstadoVista | 'nc'

const ETIQUETA_ESTADO: Record<EstadoVista, string> = {
  listo: 'Lista para cargar',
  revisar: 'Revisar',
  cargado: 'En Alegra',
  error: 'Error',
  ignorado: 'No se carga',
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

function formatDia(dia: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dia || '')
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : '-'
}

function escaparHtml(txt: string): string {
  return txt.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function estadoVista(c: ComprobanteArca): EstadoVista {
  if (c.estado === 'cargado' || c.estado === 'ignorado' || c.estado === 'error') return c.estado
  return c.revisar ? 'revisar' : 'listo'
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

/** Se puede cargar: pendiente o con error, y sin nada para revisar */
function esCargable(c: ComprobanteArca): boolean {
  return (c.estado === 'pendiente' || c.estado === 'error') && !c.revisar
}

function textoImportacion(i: { archivo: string | null; comprobantes: number; desde: string | null; hasta: string | null; created_at: string }) {
  const rango = i.desde ? ` · ${formatDia(i.desde)} al ${formatDia(i.hasta)}` : ''
  return `${i.archivo || 'Excel ARCA'} · ${i.comprobantes} comp.${rango} · subido ${formatFechaHoraART(i.created_at)}`
}

function resumenRevision(r: RevisionResponse): string {
  return [
    `${r.listos} listos para cargar`,
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
  const [importacionId, setImportacionId] = useState<string>('')
  const [filas, setFilas] = useState<ComprobanteArca[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [cuentas, setCuentas] = useState<CuentaAlegra[]>([])
  const [revisando, setRevisando] = useState(false)
  const inputArchivo = useRef<HTMLInputElement>(null)

  const puedeEditar = !!info?.puede_editar && !!info?.alegra_configurado

  /** Importaciones de la empresa; elige la indicada o la última */
  const leerImportaciones = useCallback(async (elegir?: string) => {
    const r = await obtenerImportaciones(empresa)
    setInfo(r)
    const id = elegir ?? (r.importaciones[0]?.id || '')
    setImportacionId(id)
    return id
  }, [empresa])

  const leerFilas = useCallback(async (id: string) => {
    if (!id) {
      setFilas([])
      return
    }
    const r = await obtenerComprobantes(empresa, id)
    setFilas(r.filas)
  }, [empresa])

  // Al abrir: importaciones -> comprobantes de la última
  useEffect(() => {
    let vigente = true
    setLoading(true)
    setError(null)
    setFilas([])
    setSeleccion(new Set())
    setFiltro('todos')
    void (async () => {
      try {
        const id = await leerImportaciones()
        if (vigente) await leerFilas(id)
      } catch (err) {
        if (vigente) setError(err instanceof Error ? err.message : 'No se pudo leer la información')
      } finally {
        if (vigente) setLoading(false)
      }
    })()
    return () => { vigente = false }
  }, [leerImportaciones, leerFilas])

  // Plan de cuentas de Alegra (para elegir a mano), solo si puede editar
  useEffect(() => {
    if (!puedeEditar) return
    obtenerCuentasAlegra(empresa)
      .then((r) => setCuentas(r.categorias))
      .catch(() => setCuentas([]))
  }, [empresa, puedeEditar])

  const cambiarImportacion = async (id: string) => {
    setImportacionId(id)
    setSeleccion(new Set())
    setFiltro('todos')
    setLoading(true)
    try {
      await leerFilas(id)
    } catch (err) {
      showError('Error', err instanceof Error ? err.message : 'No se pudo leer')
    } finally {
      setLoading(false)
    }
  }

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
    return {
      total: filas.length,
      importe: filas.reduce((s, c) => s + (esNc(c) ? -c.total : c.total), 0),
      listo: cuenta('listo'),
      revisar: cuenta('revisar'),
      cargado: cuenta('cargado'),
      error: cuenta('error'),
      ignorado: cuenta('ignorado'),
      nc: filas.filter(esNc).length,
      importeCargado: filas
        .filter((c) => c.estado === 'cargado')
        .reduce((s, c) => s + (esNc(c) ? -c.total : c.total), 0),
    }
  }, [filas])

  const visibles = useMemo(() => {
    if (filtro === 'todos') return filas
    if (filtro === 'nc') return filas.filter(esNc)
    return filas.filter((c) => estadoVista(c) === filtro)
  }, [filas, filtro])

  const cargables = useMemo(() => visibles.filter(esCargable), [visibles])

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
      await leerImportaciones(r.importacion_id)
      await leerFilas(r.importacion_id)
      setSeleccion(new Set())
      setFiltro('todos')
      await Swal.fire({
        title: `${r.comprobantes} comprobantes`,
        icon: r.error_alegra ? 'warning' : 'success',
        html: `
          <div class="cr-swal">
            <p>${r.nuevos} nuevos${r.comprobantes - r.nuevos > 0 ? ` · ${r.comprobantes - r.nuevos} ya estaban de un Excel anterior` : ''}</p>
            <p>Cuenta contable: ${r.columna_cuenta
              ? `columna <b>${escaparHtml(r.columna_cuenta)}</b>`
              : '<b>no encontré la columna</b> (agregala a la derecha con el nombre de la cuenta; mientras tanto se usa la de la última vez o se elige a mano)'}</p>
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
    if (!importacionId) return
    setRevisando(true)
    try {
      const r = await revisarEnAlegra(empresa, importacionId)
      await leerFilas(importacionId)
      showSuccess('Revisado en Alegra', resumenRevision(r))
    } catch (err) {
      showError('No se pudo revisar en Alegra', err instanceof Error ? err.message : 'Error')
    } finally {
      setRevisando(false)
    }
  }

  /* ------------------------------- Cargar -------------------------------- */

  const cargarSeleccionados = async () => {
    const elegidos = filas.filter((c) => seleccion.has(c.id) && esCargable(c))
    if (elegidos.length === 0) return
    const facturas = elegidos.filter((c) => !esNc(c))
    const notas = elegidos.filter(esNc)
    const sinProveedor = [...new Set(elegidos.filter((c) => !c.alegra_proveedor_id).map((c) => `${c.proveedor} (${c.cuit})`))]
    const confirmacion = await Swal.fire({
      title: `Cargar ${elegidos.length} comprobantes en Alegra`,
      html: `
        <div class="cr-swal">
          <p><b>${escaparHtml(info?.empresa_label ?? '')}</b></p>
          ${facturas.length ? `<p>${facturas.length} facturas de proveedor: <b>${pesos(facturas.reduce((s, c) => s + c.total, 0))}</b></p>` : ''}
          ${notas.length ? `<p>${notas.length} notas de crédito → notas débito asociadas a la factura: <b>${pesos(notas.reduce((s, c) => s + c.total, 0))}</b></p>` : ''}
          ${sinProveedor.length ? `<p>Se crean estos proveedores (domicilio «[POR CONFIRMAR]»):<br/>${sinProveedor.map((n) => `• ${escaparHtml(n)}`).join('<br/>')}</p>` : ''}
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
    await leerFilas(importacionId)
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
    try {
      await marcarComprobante(empresa, c.id, accion)
      setSeleccion((prev) => {
        const nuevo = new Set(prev)
        nuevo.delete(c.id)
        return nuevo
      })
      await leerFilas(importacionId)
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
              {c.estado !== 'cargado' && !c.alegra_proveedor_id ? ' · no existe en Alegra (se crea)' : ''}
              {c.proveedor_creado ? ' · creado al cargar' : ''}
            </span>
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
            <span className="cr-importe">{esNc(c) ? '-' : ''}{pesos(c.total)}</span>
            {c.moneda && !['$', 'PES', 'ARS'].includes(c.moneda.toUpperCase()) && <span className="cr-aviso">{c.moneda}</span>}
            {neto.length > 0 && (
              <span className="cr-muted">
                {neto.map(([p, n]) => `IVA ${String(p).replace('.', ',')}%: ${pesos(n)}`).join(' · ')}
              </span>
            )}
          </div>
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
        if (c.estado === 'cargado' || c.estado === 'ignorado' || !puedeEditar || cuentas.length === 0) {
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
              <option value="">{c.cuenta_excel ? `«${c.cuenta_excel}» no existe: elegir…` : 'Elegir cuenta contable…'}</option>
              {cuentasAgrupadas.map((g) => (
                <optgroup key={g.tipo} label={g.label}>
                  {g.cuentas.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                </optgroup>
              ))}
            </select>
            {distintaDelExcel && <span className="cr-muted">Excel: {c.cuenta_excel}</span>}
            {!c.cuenta_excel && c.alegra_categoria_nombre && <span className="cr-muted">Sin cuenta en el Excel</span>}
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
            {(c.estado === 'pendiente' || c.estado === 'error') && (
              <button className="btn-secondary cr-btn-mini" onClick={() => void marcar(c, 'ignorar')} title="No cargar (lo cargo a mano o no va)">
                <EyeOff size={14} />
              </button>
            )}
            {c.estado === 'ignorado' && (
              <button className="btn-secondary cr-btn-mini" onClick={() => void marcar(c, 'pendiente')} title="Volver a pendiente">
                <Undo2 size={14} />
              </button>
            )}
          </div>
        )
      },
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [seleccion, puedeEditar, cuentas, cuentasAgrupadas, importacionId])

  const tarjetas: Array<{ id: Filtro | null; label: string; valor: string | number; icono: typeof List }> = [
    { id: 'todos', label: 'Comprobantes', valor: resumen.total, icono: List },
    { id: null, label: 'Total del Excel', valor: pesos(resumen.importe), icono: CircleDollarSign },
    { id: 'listo', label: 'Listos para cargar', valor: resumen.listo, icono: Clock },
    { id: 'revisar', label: 'A revisar', valor: resumen.revisar, icono: AlertTriangle },
    { id: 'cargado', label: `En Alegra · ${pesos(resumen.importeCargado)}`, valor: resumen.cargado, icono: CheckCircle2 },
    { id: 'error', label: 'Con error', valor: resumen.error, icono: AlertTriangle },
    { id: 'ignorado', label: 'No se cargan', valor: resumen.ignorado, icono: Ban },
    { id: 'nc', label: 'Notas de crédito', valor: resumen.nc, icono: FileMinus },
  ]

  const seleccionables = cargables.filter((c) => !seleccion.has(c.id))
  const importaciones = info?.importaciones ?? []

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
        <label className="cr-campo ac-campo-importacion">
          <span>Excel de ARCA</span>
          <select
            className="form-input"
            value={importacionId}
            onChange={(e) => void cambiarImportacion(e.target.value)}
            disabled={loading || importaciones.length === 0}
          >
            {importaciones.length === 0 && <option value="">Todavía no se subió ningún Excel</option>}
            {importaciones.map((i) => <option key={i.id} value={i.id}>{textoImportacion(i)}</option>)}
          </select>
        </label>
        {info?.puede_editar && (
          <>
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
        emptyTitle={importaciones.length === 0 ? 'Todavía no se subió ningún Excel' : 'No hay comprobantes'}
        emptyDescription={importaciones.length === 0 ? 'Tocá «Subir Excel de ARCA»' : 'Probá con otro filtro'}
        disableAutoFilters
        alwaysVisibleColumns={['sel', 'cuenta', 'estado', 'acciones']}
        getRowClassName={(c) => (seleccion.has(c.id) ? 'cr-fila-seleccionada' : undefined)}
        headerAction={
          <div className="cr-acciones">
            <button
              className="btn-secondary"
              onClick={() => void revisar()}
              disabled={loading || revisando || !importacionId || !info?.alegra_configurado}
              title="Vuelve a comparar con Alegra: lo que ya está cargado, lo que se borró y lo que falta"
            >
              <RefreshCw size={16} className={revisando ? 'cr-girando' : undefined} />
              Revisar en Alegra
            </button>
            {puedeEditar && (
              <>
                {cargables.length > 0 && (
                  <button
                    className="btn-secondary"
                    onClick={() => setSeleccion(seleccionables.length > 0
                      ? new Set([...seleccion, ...seleccionables.map((c) => c.id)])
                      : new Set())}
                    disabled={loading}
                  >
                    {seleccionables.length > 0 ? `Seleccionar listos (${cargables.length})` : 'Quitar selección'}
                  </button>
                )}
                <button className="btn-primary" onClick={() => void cargarSeleccionados()} disabled={loading || seleccion.size === 0}>
                  <UploadCloud size={16} />
                  Cargar en Alegra ({seleccion.size})
                </button>
              </>
            )}
          </div>
        }
      />
    </div>
  )
}
