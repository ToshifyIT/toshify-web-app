// src/modules/integraciones/cresium/CresiumModule.tsx
/**
 * Integraciones > Cresium (44 Dreams / Grupo CG)
 *
 * Movimientos de la cuenta Cresium de cada empresa, mes por mes, y su carga en
 * Alegra. Los movimientos están guardados en la base (cresium_movimientos): la
 * pantalla lee de ahí y "Traer nuevos" solo pide a Cresium lo posterior al último
 * movimiento guardado ("Re-sincronizar mes" vuelve a traer el mes elegido). Cada movimiento muestra cómo
 * se cargaría en Alegra (contacto por CUIT + cuenta contable o factura) y se
 * puede cambiar antes de cargar. Lo cargado queda marcado con el link al pago.
 *
 * Toda la comunicación con Cresium y Alegra pasa por /api/cresium (server-cresium.js).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowDownLeft, ArrowUpRight, Receipt, Clock, CheckCircle2, AlertTriangle, List,
  RefreshCw, DownloadCloud, UploadCloud, ExternalLink, Landmark, EyeOff, Undo2, Link2, Scale, UserPlus,
} from 'lucide-react'
import Swal from 'sweetalert2'
import type { ColumnDef } from '@tanstack/react-table'
import {
  obtenerMovimientosCresium,
  obtenerPropuestasAlegra,
  actualizarDesdeCresium,
  cargarEnAlegra,
  marcarMovimiento,
  conciliarEnAlegra,
  crearContactoAlegra,
  urlPagoAlegra,
  LOTE_CARGA_ALEGRA,
} from '../../../services/cresiumService'
import type {
  EmpresaCresium,
  EstadoAlegra,
  CondicionIva,
  ItemCarga,
  MovimientoCresium,
  MovimientosCresiumResponse,
  PropuestasAlegraResponse,
} from '../../../services/cresiumService'
import { formatFechaHoraART, fechaISOART } from '../../../utils/fechaArgentina'
import { showSuccess, showError } from '../../../utils/toast'
import { DataTable } from '../../../components/ui/DataTable'
import './CresiumModule.css'

type FiltroEstado = 'todos' | EstadoAlegra

const ETIQUETA_ESTADO: Record<EstadoAlegra, string> = {
  pendiente: 'Pendiente',
  cargado: 'En Alegra',
  error: 'Error',
  ignorado: 'Ignorado',
}

const ETIQUETA_TIPO: Record<string, string> = {
  DEPOSIT: 'Cobro',
  WITHDRAWAL: 'Pago',
  YIELD: 'Rendimiento',
  REFUND: 'Devolución',
  BILL_PAYMENT: 'Pago de servicio',
  ECHEQ_WITHDRAWAL: 'eCheq',
  DEPOSIT_INVESTMENT: 'Inversión',
  WITHDRAWAL_INVESTMENT: 'Rescate inversión',
}

/** 'AAAA-MM-DD' (día ya en hora argentina) -> 'DD/MM/AA' */
function formatDia(dia: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dia || '')
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : '-'
}

/** Tipos del plan de cuentas de Alegra -> nombre del grupo en el desplegable */
const GRUPO_CUENTA: Record<string, string> = {
  expense: 'Gastos',
  cost: 'Costos',
  income: 'Ingresos',
  asset: 'Activos',
  liability: 'Pasivos',
  equity: 'Patrimonio',
}
/** Orden de los grupos según el movimiento: lo más probable primero */
const ORDEN_GRUPOS: Record<'entrada' | 'salida', string[]> = {
  salida: ['expense', 'cost', 'asset', 'liability', 'equity', 'income'],
  entrada: ['income', 'liability', 'asset', 'equity', 'expense', 'cost'],
}

const PESOS = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })
const pesos = (n: number) => PESOS.format(n || 0)

function mesActualART(): string {
  const hoy = fechaISOART(new Date().toISOString()) ?? new Date().toISOString().slice(0, 10)
  return hoy.slice(0, 7)
}

function escaparHtml(txt: string): string {
  return txt
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Valor del selector "En Alegra": 'cat:ID' o 'fac:ID' */
function valorPropuesta(m: MovimientoCresium): string {
  const d = m.propuesta?.destino
  if (!d) return ''
  return `${d.tipo === 'factura' ? 'fac' : 'cat'}:${d.id}`
}

function esCargable(m: MovimientoCresium): boolean {
  return m.estado === 'SUCCESS'
    && (m.alegra_estado === 'pendiente' || m.alegra_estado === 'error')
    && !!m.propuesta
    && !m.posible_duplicado
}

interface CresiumModuleProps {
  empresa: EmpresaCresium
}

export function CresiumModule({ empresa }: CresiumModuleProps) {
  const [mes, setMes] = useState(mesActualART)
  const [datos, setDatos] = useState<MovimientosCresiumResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<FiltroEstado>('todos')
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set())
  // Cambios del usuario a la propuesta: cresium_id -> 'cat:ID' | 'fac:ID'
  const [elecciones, setElecciones] = useState<Record<number, string>>({})

  // Propuesta de Alegra: llega aparte para que la tabla se vea al instante
  const [propuestas, setPropuestas] = useState<PropuestasAlegraResponse | null>(null)
  const [cargandoPropuestas, setCargandoPropuestas] = useState(false)

  const leerPropuestas = useCallback(async (refrescar = false) => {
    setCargandoPropuestas(true)
    try {
      const r = await obtenerPropuestasAlegra(empresa, mes, refrescar)
      setPropuestas(r)
      // Había movimientos ya cargados a mano en Alegra: se vincularon, se relee la base
      if (r.vinculados_auto > 0 || (r.revertidos ?? 0) > 0) {
        setDatos(await obtenerMovimientosCresium(empresa, mes))
        if (r.vinculados_auto > 0) {
          showSuccess('Ya estaban en Alegra', `${r.vinculados_auto} movimientos se marcaron como cargados`)
        }
        if ((r.revertidos ?? 0) > 0) {
          showSuccess('Eliminados en Alegra', `${r.revertidos} movimientos volvieron a pendiente`)
        }
      }
    } catch (err) {
      setPropuestas({
        propuestas: {}, conciliacion: {}, vinculados_auto: 0, categorias: [],
        error_alegra: err instanceof Error ? err.message : 'No se pudo leer Alegra',
      })
    } finally {
      setCargandoPropuestas(false)
    }
  }, [empresa, mes])

  /** Lee la base (rápido) y después pide la propuesta de Alegra. refrescar = releer Alegra sin caché */
  const cargar = useCallback(async (refrescar = false) => {
    setLoading(true)
    setError(null)
    let r: MovimientosCresiumResponse | null = null
    try {
      r = await obtenerMovimientosCresium(empresa, mes)
      setDatos(r)
      setSeleccion(new Set())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los movimientos')
    } finally {
      setLoading(false)
    }
    if (r?.alegra_configurado) void leerPropuestas(refrescar)
    else setPropuestas(null)
  }, [empresa, mes, leerPropuestas])

  // Al abrir la pantalla y al cambiar de mes o empresa
  useEffect(() => {
    void cargar()
  }, [cargar])

  useEffect(() => {
    setElecciones({})
    setFiltro('todos')
  }, [empresa, mes])

  const filas = useMemo<MovimientoCresium[]>(() => (datos?.filas ?? []).map((f) => {
    const p = propuestas?.propuestas[String(f.cresium_id)]
    const c = propuestas?.conciliacion?.[String(f.cresium_id)]
    const conciliado = c ? c.conciliado : f.alegra_conciliado ? true : null
    return p ? { ...f, propuesta: p.propuesta, posible_duplicado: p.posible_duplicado, conciliado } : { ...f, conciliado }
  }), [datos, propuestas])
  /** Plan de cuentas agrupado por tipo y en orden alfabético, para cada dirección */
  const cuentasAgrupadas = useMemo(() => {
    const cats = propuestas?.categorias ?? []
    const armar = (dir: 'entrada' | 'salida') => ORDEN_GRUPOS[dir]
      .map((tipo) => ({
        tipo,
        label: GRUPO_CUENTA[tipo],
        cuentas: cats
          .filter((c) => c.tipo === tipo)
          .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })),
      }))
      .filter((g) => g.cuentas.length > 0)
    return { entrada: armar('entrada'), salida: armar('salida') }
  }, [propuestas])

  const puedeCargar = !!datos?.puede_cargar && !!propuestas && !propuestas.error_alegra

  const resumen = useMemo(() => {
    const ok = filas.filter((f) => f.estado === 'SUCCESS')
    return {
      total: ok.length,
      ingresos: ok.filter((f) => f.direccion === 'entrada').reduce((s, f) => s + f.importe, 0),
      egresos: ok.filter((f) => f.direccion === 'salida').reduce((s, f) => s + f.importe, 0),
      impuestos: ok.reduce((s, f) => s + f.impuesto, 0),
      pendiente: ok.filter((f) => f.alegra_estado === 'pendiente').length,
      cargado: ok.filter((f) => f.alegra_estado === 'cargado').length,
      error: ok.filter((f) => f.alegra_estado === 'error').length,
      ignorado: ok.filter((f) => f.alegra_estado === 'ignorado').length,
      conciliado: ok.filter((f) => f.conciliado === true).length,
    }
  }, [filas])

  /** Todo cargado (sin pendientes) y todo lo cargado conciliado en Alegra */
  const mesConciliado = resumen.cargado > 0 && resumen.pendiente === 0 && resumen.error === 0 &&
    resumen.conciliado === resumen.cargado

  const visibles = useMemo(
    () => (filtro === 'todos' ? filas : filas.filter((f) => f.alegra_estado === filtro)),
    [filas, filtro],
  )

  const cargables = useMemo(() => visibles.filter(esCargable), [visibles])

  const eleccionDe = useCallback(
    (m: MovimientoCresium) => elecciones[m.cresium_id] ?? valorPropuesta(m),
    [elecciones],
  )

  const toggle = (id: number) => {
    setSeleccion((prev) => {
      const nuevo = new Set(prev)
      if (nuevo.has(id)) nuevo.delete(id)
      else nuevo.add(id)
      return nuevo
    })
  }

  const actualizar = async (mesCompleto = false) => {
    if (mesCompleto) {
      const ok = await Swal.fire({
        title: `Re-sincronizar ${mes}`,
        text: 'Vuelve a traer de Cresium todos los movimientos del mes (actualiza estados). Lo ya cargado en Alegra no se toca.',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Re-sincronizar',
        cancelButtonText: 'Cancelar',
      })
      if (!ok.isConfirmed) return
    }
    Swal.fire({
      title: mesCompleto ? 'Trayendo el mes de Cresium...' : 'Buscando movimientos nuevos en Cresium...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    })
    try {
      const r = await actualizarDesdeCresium(empresa, mesCompleto ? mes : undefined)
      Swal.close()
      showSuccess(
        r.nuevos > 0 ? `${r.nuevos} movimientos nuevos` : 'No hay movimientos nuevos',
        mesCompleto ? `${r.traidos} movimientos revisados del mes` : undefined,
      )
      await cargar()
    } catch (err) {
      Swal.close()
      Swal.fire('Error', err instanceof Error ? err.message : 'No se pudo actualizar', 'error')
    }
  }

  const cargarSeleccionados = async () => {
    const elegidos = filas.filter((f) => seleccion.has(f.cresium_id) && esCargable(f))
    if (elegidos.length === 0) return
    const sinDestino = elegidos.filter((f) => !eleccionDe(f))
    if (sinDestino.length > 0) {
      showError('Falta la cuenta contable', `Elegí a dónde va en Alegra: ${sinDestino.map((f) => f.contraparte).join(', ')}`)
      return
    }

    const cobros = elegidos.filter((f) => f.direccion === 'entrada').reduce((s, f) => s + f.importe, 0)
    const pagos = elegidos.filter((f) => f.direccion === 'salida').reduce((s, f) => s + f.importe, 0)
    const impuesto = elegidos.reduce((s, f) => s + f.impuesto, 0)
    const nuevos = [...new Set(elegidos.filter((f) => f.propuesta?.crear_contacto).map((f) => `${f.contraparte} (${f.cuit})`))]
    const confirmacion = await Swal.fire({
      title: `Cargar ${elegidos.length} movimientos en Alegra`,
      html: `
        <div class="cr-swal">
          <p><b>${escaparHtml(datos?.empresa_label ?? '')}</b> · cuenta bancaria Cresium</p>
          <p>Cobros: <b>${pesos(cobros)}</b><br/>Pagos: <b>${pesos(pagos)}</b><br/>Impuesto ley 25.413: <b>${pesos(impuesto)}</b> (un pago aparte por movimiento)</p>
          ${nuevos.length > 0
            ? `<p>Se crean estos contactos en Alegra:<br/>${nuevos.map((n) => `• ${escaparHtml(n)}`).join('<br/>')}</p>`
            : ''}
        </div>`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Cargar en Alegra',
      cancelButtonText: 'Cancelar',
    })
    if (!confirmacion.isConfirmed) return

    const items: ItemCarga[] = elegidos.map((f) => {
      const [tipo, id] = eleccionDe(f).split(':')
      return tipo === 'fac' ? { cresium_id: f.cresium_id, factura_id: id } : { cresium_id: f.cresium_id, categoria_id: id }
    })

    let cargados = 0
    const errores: string[] = []
    Swal.fire({
      title: 'Cargando en Alegra...',
      html: `0 de ${items.length}`,
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    })
    try {
      for (let i = 0; i < items.length; i += LOTE_CARGA_ALEGRA) {
        const r = await cargarEnAlegra(empresa, items.slice(i, i + LOTE_CARGA_ALEGRA))
        cargados += r.cargados
        r.resultados.filter((x) => !x.ok).forEach((x) => {
          const f = filas.find((y) => y.cresium_id === x.cresium_id)
          errores.push(`${f?.contraparte ?? x.cresium_id}: ${x.error}`)
        })
        Swal.update({ html: `${Math.min(i + LOTE_CARGA_ALEGRA, items.length)} de ${items.length}` })
        Swal.showLoading()
      }
      Swal.close()
      if (errores.length === 0) {
        showSuccess('Cargado en Alegra', `${cargados} movimientos`)
      } else {
        await Swal.fire({
          title: `${cargados} cargados, ${errores.length} con error`,
          html: errores.map((e) => `• ${escaparHtml(e)}`).join('<br/>'),
          icon: 'warning',
        })
      }
    } catch (err) {
      Swal.close()
      Swal.fire('Error', err instanceof Error ? err.message : 'No se pudo cargar en Alegra', 'error')
    }
    setElecciones({})
    await cargar(true)
  }

  const conciliar = async () => {
    // Fecha de corte por defecto: último día del mes (u hoy si es el mes en curso)
    const [a, m] = mes.split('-').map(Number)
    const ultimoDia = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10)
    const hoy = fechaISOART(new Date().toISOString()) ?? ultimoDia
    const pedido = await Swal.fire({
      title: 'Conciliar en Alegra',
      html: `<div class="cr-swal">Se concilian los movimientos cargados desde el <b>${formatDia(`${mes}-01`)}</b> hasta la fecha de corte.<br/>No tiene que quedar ninguno pendiente en ese rango.</div>`,
      input: 'date',
      inputValue: ultimoDia < hoy ? ultimoDia : hoy,
      inputAttributes: { min: `${mes}-01`, max: ultimoDia < hoy ? ultimoDia : hoy },
      showCancelButton: true,
      confirmButtonText: 'Ver resumen',
      cancelButtonText: 'Cancelar',
    })
    if (!pedido.isConfirmed || !pedido.value) return
    const hasta = String(pedido.value)

    Swal.fire({ title: 'Calculando saldo en Cresium...', allowOutsideClick: false, didOpen: () => Swal.showLoading() })
    try {
      const r = await conciliarEnAlegra(empresa, hasta, false)
      Swal.close()
      const ok = await Swal.fire({
        title: `Conciliación al ${formatDia(hasta)}`,
        html: `
          <div class="cr-swal">
            <p>Saldo bancario (extracto Cresium): <b>${pesos(r.saldo_bancario)}</b></p>
            <p>${r.movimientos} movimientos (${r.transacciones} registros en Alegra)<br/>
              Ingresos: ${pesos(r.ingresos)} · Egresos: ${pesos(r.egresos)} · Impuesto: ${pesos(r.impuestos)}</p>
            <p class="cr-muted">Se crea como <b>borrador</b> en Alegra. Revisá ahí que la diferencia sea $0 y confirmala.</p>
          </div>`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Crear borrador en Alegra',
        cancelButtonText: 'Cancelar',
      })
      if (!ok.isConfirmed) return
      Swal.fire({ title: 'Creando conciliación...', allowOutsideClick: false, didOpen: () => Swal.showLoading() })
      const creada = await conciliarEnAlegra(empresa, hasta, true)
      Swal.close()
      const otraFecha = creada.fecha_conciliacion && creada.fecha_conciliacion !== hasta
      await Swal.fire({
        title: 'Borrador creado en Alegra',
        html: (otraFecha
          ? `Como en Alegra ya hay una conciliación posterior, el documento quedó con fecha <b>${formatDia(creada.fecha_conciliacion)}</b>. Incluye los movimientos y el saldo al ${formatDia(hasta)}.<br/><br/>`
          : '') + 'Abrí <b>Bancos → Conciliaciones bancarias</b> en Alegra, revisá que la diferencia sea $0 y confirmala.',
        icon: 'success',
      })
      await cargar()
    } catch (err) {
      Swal.close()
      Swal.fire('No se pudo conciliar', err instanceof Error ? err.message : 'Error', 'error')
    }
  }

  const crearContacto = async (m: MovimientoCresium) => {
    const esCliente = m.direccion === 'entrada'
    const juridica = /^3[034]/.test(m.cuit ?? '')
    const r = await Swal.fire({
      title: esCliente ? 'Crear cliente en Alegra' : 'Crear proveedor en Alegra',
      html: `
        <div class="cr-swal cr-form">
          <label>Nombre o razón social
            <input id="cr-nombre" class="swal2-input" value="${escaparHtml(m.contraparte ?? '')}" />
          </label>
          <label>CUIT
            <input class="swal2-input" value="${escaparHtml(m.cuit ?? '')}" disabled />
          </label>
          <label>Condición de IVA
            <select id="cr-iva" class="swal2-select">
              <option value="IVA_RESPONSABLE" ${juridica ? 'selected' : ''}>Responsable Inscripto</option>
              <option value="UNIQUE_TRIBUTE_RESPONSABLE" ${juridica ? '' : 'selected'}>Monotributo</option>
            </select>
          </label>
          <label>Tipo de contacto
            <select id="cr-tipo" class="swal2-select">
              <option value="provider" ${esCliente ? '' : 'selected'}>Proveedor</option>
              <option value="client" ${esCliente ? 'selected' : ''}>Cliente</option>
            </select>
          </label>
          <p class="cr-muted">El CBU (${escaparHtml(m.cuenta_contraparte ?? '-')}) queda en las observaciones. El domicilio se completa después en Alegra.</p>
        </div>`,
      showCancelButton: true,
      confirmButtonText: 'Crear en Alegra',
      cancelButtonText: 'Cancelar',
      focusConfirm: false,
      preConfirm: () => {
        const nombre = (document.getElementById('cr-nombre') as HTMLInputElement | null)?.value.trim() ?? ''
        if (nombre.length < 3) {
          Swal.showValidationMessage('Ingresá el nombre')
          return false
        }
        return {
          nombre,
          iva: (document.getElementById('cr-iva') as HTMLSelectElement | null)?.value as CondicionIva,
          tipo: (document.getElementById('cr-tipo') as HTMLSelectElement | null)?.value as 'provider' | 'client',
        }
      },
    })
    if (!r.isConfirmed || !r.value) return
    try {
      const res = await crearContactoAlegra(empresa, {
        cresium_id: m.cresium_id, nombre: r.value.nombre, iva_condicion: r.value.iva, tipo: r.value.tipo,
      })
      showSuccess(res.existente ? 'Ya existía en Alegra' : 'Contacto creado', res.contacto.nombre)
      void leerPropuestas()
    } catch (err) {
      showError('No se pudo crear', err instanceof Error ? err.message : 'Error')
    }
  }

  const marcar = async (m: MovimientoCresium, accion: 'ignorar' | 'pendiente' | 'vincular') => {
    if (accion === 'vincular') {
      const ok = await Swal.fire({
        title: '¿Ya está cargado en Alegra?',
        html: `En la cuenta Cresium de Alegra hay un pago del ${formatDia(m.posible_duplicado?.fecha)} por <b>${pesos(m.posible_duplicado?.monto ?? 0)}</b>. Si es este movimiento, se marca como cargado y no se vuelve a crear (tampoco su impuesto).`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Sí, es este',
        cancelButtonText: 'Cancelar',
      })
      if (!ok.isConfirmed) return
    }
    try {
      await marcarMovimiento(empresa, m.cresium_id, accion, m.posible_duplicado?.id)
      await cargar()
    } catch (err) {
      showError('Error', err instanceof Error ? err.message : 'No se pudo actualizar')
    }
  }

  const columnas = useMemo<ColumnDef<MovimientoCresium, unknown>[]>(() => [
    {
      id: 'sel',
      header: '',
      enableSorting: false,
      cell: ({ row }) => {
        const m = row.original
        const habilitado = puedeCargar && esCargable(m)
        return (
          <input
            type="checkbox"
            className="cr-check"
            checked={seleccion.has(m.cresium_id)}
            disabled={!habilitado}
            onChange={() => toggle(m.cresium_id)}
            aria-label="Seleccionar movimiento"
          />
        )
      },
    },
    {
      accessorKey: 'fecha',
      header: 'Fecha',
      cell: ({ row }) => (
        <span title={formatFechaHoraART(row.original.procesado_en)}>{formatDia(row.original.fecha)}</span>
      ),
    },
    {
      accessorKey: 'tipo',
      header: 'Movimiento',
      cell: ({ row }) => {
        const m = row.original
        const Icono = m.direccion === 'entrada' ? ArrowDownLeft : ArrowUpRight
        return (
          <span className={`cr-tipo cr-tipo--${m.direccion}`}>
            <Icono size={14} />
            {ETIQUETA_TIPO[m.tipo ?? ''] ?? m.tipo}
            {m.estado !== 'SUCCESS' && <small className="cr-muted"> ({m.estado})</small>}
          </span>
        )
      },
    },
    {
      accessorKey: 'contraparte',
      header: 'Contraparte',
      cell: ({ row }) => {
        const m = row.original
        return (
          <div className="cr-contraparte">
            <span className="cr-nombre">{m.contraparte || '-'}</span>
            <span className="cr-muted">
              {m.cuit ? `CUIT ${m.cuit}` : 'Sin CUIT'}
              {m.banco_contraparte ? ` · ${m.banco_contraparte}` : ''}
            </span>
            {m.nota && <span className="cr-muted cr-nota">{m.nota}</span>}
          </div>
        )
      },
    },
    {
      accessorKey: 'importe',
      header: 'Importe',
      cell: ({ row }) => {
        const m = row.original
        return (
          <span className={`cr-importe cr-importe--${m.direccion}`}>
            {m.direccion === 'salida' ? '-' : ''}{pesos(m.importe)}
          </span>
        )
      },
    },
    {
      accessorKey: 'impuesto',
      header: 'Imp. 25.413',
      cell: ({ getValue }) => <span className="cr-muted">{pesos(getValue() as number)}</span>,
    },
    {
      id: 'alegra',
      header: 'En Alegra',
      enableSorting: false,
      cell: ({ row }) => {
        const m = row.original
        if (m.alegra_estado === 'cargado') {
          return (
            <div className="cr-alegra">
              <span>{m.alegra_detalle || 'Cargado'}</span>
              {m.alegra_conciliacion_id && <span className="cr-muted">En conciliación</span>}
              {m.alegra_pago_id && (
                <a className="cr-link" href={urlPagoAlegra(m.alegra_pago_id)} target="_blank" rel="noreferrer">
                  Ver pago <ExternalLink size={12} />
                </a>
              )}
            </div>
          )
        }
        if (m.alegra_estado === 'ignorado') return <span className="cr-muted">No se carga</span>
        const p = m.propuesta
        if (!p) {
          if (m.estado !== 'SUCCESS') return <span className="cr-muted">No acreditado</span>
          return <span className="cr-muted">{cargandoPropuestas ? 'Consultando Alegra…' : '-'}</span>
        }
        const valor = eleccionDe(m)
        return (
          <div className="cr-alegra">
            {puedeCargar ? (
              <select
                className={`cr-select ${valor ? '' : 'cr-select--falta'}`}
                value={valor}
                onChange={(e) => setElecciones((prev) => ({ ...prev, [m.cresium_id]: e.target.value }))}
                aria-label="Cuenta contable o factura"
              >
                <option value="">Elegir cuenta contable…</option>
                {p.opciones_factura.length > 0 && (
                  <optgroup label="Facturas de proveedor abiertas">
                    {p.opciones_factura.map((f) => (
                      <option key={`fac-${f.id}`} value={`fac:${f.id}`}>{f.nombre}</option>
                    ))}
                  </optgroup>
                )}
                {cuentasAgrupadas[m.direccion].map((g) => (
                  <optgroup key={g.tipo} label={g.label}>
                    {g.cuentas.map((c) => (
                      <option key={`cat-${c.id}`} value={`cat:${c.id}`}>{c.nombre}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            ) : (
              <span>{p.destino?.nombre ?? 'Sin definir'}</span>
            )}
            {!p.contacto && p.crear_contacto && puedeCargar && (
              <button type="button" className="cr-link cr-link-btn" onClick={() => void crearContacto(m)}>
                <UserPlus size={12} /> {m.direccion === 'entrada' ? 'Crear cliente' : 'Crear proveedor'}
              </button>
            )}
            <span className="cr-muted">
              {p.contacto ? `Contacto: ${p.contacto.nombre}` : p.crear_contacto ? 'No existe en Alegra (se crea al cargar)' : 'Sin contacto'}
              {p.ajuste > 0 && valor === valorPropuesta(m) ? ` · ajuste ${pesos(p.ajuste)}` : ''}
            </span>
          </div>
        )
      },
    },
    {
      accessorKey: 'alegra_estado',
      header: 'Estado',
      cell: ({ row }) => {
        const m = row.original
        return (
          <div className="cr-estado-celda">
            <span className={`cr-badge cr-badge--${m.alegra_estado}`} title={m.alegra_error ?? undefined}>
              {ETIQUETA_ESTADO[m.alegra_estado]}
            </span>
            {m.conciliado === true && <span className="cr-badge cr-badge--conciliado">Conciliado</span>}
            {m.conciliado === false && <span className="cr-muted">Sin conciliar</span>}
            {m.alegra_estado === 'error' && m.alegra_error && (
              <span className="cr-error" title={m.alegra_error}>{m.alegra_error}</span>
            )}
            {m.posible_duplicado && (
              <span className="cr-aviso" title="Hay un pago en la cuenta Cresium de Alegra con la misma fecha e importe">
                <AlertTriangle size={12} /> Posible ya cargado
              </span>
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
        const m = row.original
        if (!puedeCargar) return null
        return (
          <div className="cr-acciones-fila">
            {m.posible_duplicado && (m.alegra_estado === 'pendiente' || m.alegra_estado === 'error') && (
              <button className="btn-secondary cr-btn-mini" onClick={() => void marcar(m, 'vincular')} title="Marcar como ya cargado en Alegra">
                <Link2 size={14} />
              </button>
            )}
            {(m.alegra_estado === 'pendiente' || m.alegra_estado === 'error') && (
              <button className="btn-secondary cr-btn-mini" onClick={() => void marcar(m, 'ignorar')} title="No cargar en Alegra">
                <EyeOff size={14} />
              </button>
            )}
            {m.alegra_estado === 'ignorado' && (
              <button className="btn-secondary cr-btn-mini" onClick={() => void marcar(m, 'pendiente')} title="Volver a pendiente">
                <Undo2 size={14} />
              </button>
            )}
          </div>
        )
      },
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [seleccion, puedeCargar, propuestas, cargandoPropuestas, eleccionDe, cuentasAgrupadas])

  const tarjetas: Array<{ id: FiltroEstado | null; label: string; valor: string | number; icono: typeof List }> = [
    { id: 'todos', label: 'Movimientos', valor: resumen.total, icono: List },
    { id: null, label: 'Ingresos', valor: pesos(resumen.ingresos), icono: ArrowDownLeft },
    { id: null, label: 'Egresos', valor: pesos(resumen.egresos), icono: ArrowUpRight },
    { id: null, label: 'Impuesto 25.413', valor: pesos(resumen.impuestos), icono: Receipt },
    { id: 'pendiente', label: 'Pendientes', valor: resumen.pendiente, icono: Clock },
    { id: 'cargado', label: 'En Alegra', valor: resumen.cargado, icono: CheckCircle2 },
    { id: 'error', label: 'Con error', valor: resumen.error, icono: AlertTriangle },
    {
      id: null,
      label: mesConciliado
        ? 'Mes conciliado'
        : 'Conciliados en Alegra',
      valor: `${resumen.conciliado} de ${resumen.cargado}`,
      icono: Scale,
    },
  ]

  const seleccionables = cargables.filter((f) => !seleccion.has(f.cresium_id))

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
                onClick={clickeable ? () => setFiltro(filtro === t.id ? 'todos' : (t.id as FiltroEstado)) : undefined}
                style={{ cursor: clickeable ? 'pointer' : 'default' }}
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
          <input type="month" className="form-input" value={mes} max={mesActualART()} onChange={(e) => e.target.value && setMes(e.target.value)} />
        </label>
        <button className="btn-primary" onClick={() => void actualizar()} disabled={loading || !datos?.cresium_configurado}>
          <DownloadCloud size={16} />
          Traer nuevos de Cresium
        </button>
        <button className="btn-secondary" onClick={() => void actualizar(true)} disabled={loading || !datos?.cresium_configurado} title="Vuelve a traer el mes completo">
          <RefreshCw size={16} />
          Re-sincronizar mes
        </button>
        {puedeCargar && (mesConciliado ? (
          <span className="cr-mes-conciliado" title="Todo lo cargado de este mes ya está conciliado en Alegra">
            <CheckCircle2 size={16} />
            Mes conciliado
          </span>
        ) : (
          <button
            className="btn-secondary"
            onClick={() => void conciliar()}
            disabled={loading || cargandoPropuestas || resumen.cargado === resumen.conciliado}
            title={resumen.cargado === resumen.conciliado
              ? 'No hay movimientos cargados sin conciliar'
              : 'Crea la conciliación del mes en Alegra (borrador)'}
          >
            <Scale size={16} />
            Conciliar en Alegra
          </button>
        ))}
        <span className="cr-muted cr-actualizado">
          <Landmark size={14} />
          {datos?.ultimo_movimiento
            ? `Guardado hasta: ${formatFechaHoraART(datos.ultimo_movimiento)}`
            : 'Todavía no se trajo nada de Cresium'}
          {datos?.ultima_sync ? ` · consultado ${formatFechaHoraART(datos.ultima_sync)}` : ''}
        </span>
      </div>

      {datos && !datos.cresium_configurado && (
        <div className="aviso aviso--warning">Faltan las claves de Cresium de {datos.empresa_label} en el .env del servidor.</div>
      )}
      {datos && !datos.alegra_configurado && (
        <div className="aviso aviso--warning">Falta el token de Alegra de {datos.empresa_label} en el .env del servidor: se pueden ver los movimientos pero no cargarlos.</div>
      )}
      {propuestas?.error_alegra && (
        <div className="aviso aviso--warning">No se pudo leer Alegra: {propuestas.error_alegra}</div>
      )}

      <DataTable
        data={visibles}
        columns={columnas}
        loading={loading}
        error={error}
        pageSize={50}
        pageSizeOptions={[20, 50, 100]}
        searchPlaceholder="Buscar contraparte, CUIT o nota..."
        emptyIcon={<Landmark size={48} />}
        emptyTitle="No hay movimientos"
        emptyDescription="Tocá «Traer nuevos de Cresium» o elegí otro mes"
        disableAutoFilters
        alwaysVisibleColumns={['sel', 'alegra', 'acciones']}
        getRowClassName={(m) => (seleccion.has(m.cresium_id) ? 'cr-fila-seleccionada' : undefined)}
        headerAction={
          <div className="cr-acciones">
            <button
              className="btn-secondary"
              onClick={() => void cargar(true)}
              disabled={loading || cargandoPropuestas}
              title="Vuelve a revisar en Alegra conciliaciones, contactos, facturas y lo cargado a mano"
            >
              <RefreshCw size={16} className={cargandoPropuestas ? 'cr-girando' : undefined} />
              Actualizar Alegra
            </button>
            {puedeCargar && (
              <>
                <button
                  className="btn-secondary"
                  onClick={() => setSeleccion(seleccionables.length > 0
                    ? new Set([...seleccion, ...seleccionables.map((f) => f.cresium_id)])
                    : new Set())}
                  disabled={loading || cargables.length === 0}
                >
                  {seleccionables.length > 0 ? `Seleccionar pendientes (${cargables.length})` : 'Quitar selección'}
                </button>
                <button
                  className="btn-primary"
                  onClick={() => void cargarSeleccionados()}
                  disabled={loading || seleccion.size === 0}
                >
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
