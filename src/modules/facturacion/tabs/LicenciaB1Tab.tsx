// src/modules/facturacion/tabs/LicenciaB1Tab.tsx
// Facturación > Licencia B1: conductores de la promoción de licencia B1 (PRM02) y sus pagos
// diarios de $15.000. Cada día se llena solo con los depósitos de Cresium (44 Dreams y
// Grupo CG) del CUIT/CUIL del conductor; lo que paga un tercero se agrega a mano desde el
// modal (carga manual o buscando el depósito en Cresium). Reglas en utils/pagosB1.ts.

import { useState, useEffect, useMemo, useCallback } from 'react'
import { getISOWeek } from 'date-fns'
import { AlertTriangle, CheckCircle, Edit2, Eye, Plus, RefreshCw, Search, Trash2, Users, Wallet, X } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { useAuth } from '../../../contexts/AuthContext'
import { usePermissions } from '../../../contexts/PermissionsContext'
import { useSede } from '../../../contexts/SedeContext'
import { confirmar } from '../../../components/ui/alertas'
import { showError, showSuccess, showWarning } from '../../../utils/toast'
import { formatCurrency } from '../../../types/facturacion.types'
import { formatFecha } from '../../../utils/format'
import { formatNombreCompleto } from '../../../utils/conductorUtils'
import { formatFechaHoraART, hoyART, sumarDiasISO } from '../../../utils/fechaArgentina'
import { cargarConductoresLicenciaB1, lunesDe } from '../utils/licenciaB1Service'
import type { FilaB1, PromoB1 } from '../utils/licenciaB1Service'
import {
  agregarPagoManualB1, asignarDepositoCresiumB1, buscarDepositosCresium, editarPagoB1, ETIQUETA_EMPRESA_CRESIUM,
  PROMO_B1_PAGO_DIARIO, quitarPagoB1,
} from '../utils/pagosB1'
import type { DepositoBuscado, DiaB1, EstadoDiaB1, PagoB1, ResumenB1 } from '../utils/pagosB1'
import { DataTable } from '../../../components/ui/DataTable'
import { StatsGrid } from '../../../components/ui/StatsGrid'
import { LicenciaBadge } from '../../../components/ui/LicenciaBadge'
import { Spinner } from '../../../components/ui/LoadingOverlay'
import '../../../styles/modules.css'
import './LicenciaB1Tab.css'

type Filtro = 'todos' | 'al_dia' | 'un_dia' | 'deuda'

const ETIQUETA_ESTADO_DIA: Record<EstadoDiaB1, string> = {
  pagado: 'Pagado',
  atrasado: 'Pagado tarde',
  parcial: 'Parcial',
  no_pago: 'No pagó',
  adelantado: 'Adelantado',
  proximo: 'Próximo',
  en_curso: 'Día en curso',
}

const ETIQUETA_ORIGEN: Record<PagoB1['origen'], string> = {
  auto: 'Cresium',
  cresium: 'Cresium (a mano)',
  manual: 'Manual',
}

/** Etiqueta corta para la lista de pagos del día (la cuenta va en otra línea). */
const ORIGEN_CORTO: Record<PagoB1['origen'], string> = {
  auto: 'Cresium',
  cresium: 'Cresium · a mano',
  manual: 'Manual',
}

/** Días que mira "Buscar en Cresium" (hoy incluido). */
const DIAS_BUSQUEDA_CRESIUM = 7

const FORM_VACIO = { modo: 'cresium' as 'manual' | 'cresium', fecha: '', monto: '', pagador: '', cuit: '', nota: '' }

function diaSemana(fecha: string): string {
  const texto = new Date(`${fecha}T12:00:00Z`).toLocaleDateString('es-AR', { weekday: 'short', timeZone: 'UTC' })
  return texto.charAt(0).toUpperCase() + texto.slice(1).replace('.', '')
}

type Semaforo = 'verde' | 'amarillo' | 'rojo'

/** Días que debe (un pago parcial cuenta como día adeudado). */
function diasAdeudados(r: ResumenB1): number {
  return Math.ceil(Math.round(r.deuda) / PROMO_B1_PAGO_DIARIO)
}

/** Semáforo: verde al día, amarillo debe 1 día, rojo debe 2 o más. */
function semaforo(r: ResumenB1): Semaforo {
  const dias = diasAdeudados(r)
  return dias === 0 ? 'verde' : dias === 1 ? 'amarillo' : 'rojo'
}

const TITULO_SEMAFORO: Record<Semaforo, string> = {
  verde: 'Al día: no debe ningún día',
  amarillo: 'Debe 1 día',
  rojo: 'Debe 2 días o más',
}

/** Monto escrito como "15000", "15.000" o "15.000,50". */
function leerMonto(texto: string): number {
  const t = texto.trim().replace(/[$\s]/g, '')
  return Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t)
}

function origenPago(p: PagoB1): string {
  const empresa = p.empresa ? ` ${ETIQUETA_EMPRESA_CRESIUM[p.empresa] || p.empresa}` : ''
  return `${ETIQUETA_ORIGEN[p.origen]}${p.origen === 'manual' ? '' : empresa}`
}

export function LicenciaB1Tab() {
  const { user, profile } = useAuth()
  const { canEditInTab } = usePermissions()
  const { sedeActualId, aplicarFiltroSede } = useSede()
  const puedeEditar = canEditInTab('facturacion:licencia_b1')
  const usuario = { id: user?.id ?? null, nombre: profile?.full_name || profile?.email || null }

  const [promo, setPromo] = useState<PromoB1 | null>(null)
  const [filas, setFilas] = useState<FilaB1[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [detalleId, setDetalleId] = useState<string | null>(null)
  /** Semana elegida en el modal (lunes yyyy-MM-dd) o 'actual'. */
  const [semanaSel, setSemanaSel] = useState<string>('actual')
  /** Día cuyo modal "Registros del día" está abierto (yyyy-MM-dd). */
  const [diaVer, setDiaVer] = useState<string | null>(null)

  // Modal "Agregar registro"
  const [agregando, setAgregando] = useState(false)
  const [form, setForm] = useState(FORM_VACIO)
  const [busqueda, setBusqueda] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [resultados, setResultados] = useState<DepositoBuscado[] | null>(null)
  const [elegido, setElegido] = useState<DepositoBuscado | null>(null)
  const [guardando, setGuardando] = useState(false)
  /** Recargando los datos después de una acción (se muestra en el modal del conductor). */
  const [actualizando, setActualizando] = useState(false)
  /** Cuándo se leyeron los datos por última vez (se muestra junto al botón Actualizar). */
  const [ultimaLectura, setUltimaLectura] = useState<string | null>(null)

  // Detalle / edición de un pago
  const [pagoVer, setPagoVer] = useState<PagoB1 | null>(null)
  const [editandoPago, setEditandoPago] = useState(false)
  const [formPago, setFormPago] = useState({ fecha: '', monto: '', pagador: '', cuit: '', nota: '' })

  const cargar = useCallback(async ({ silencioso = false }: { silencioso?: boolean } = {}) => {
    if (!silencioso) setLoading(true)
    setError(null)
    try {
      // Misma carga que usa Saldos para mostrar estos pagos (licenciaB1Service)
      const { promo: p, filas: lista } = await cargarConductoresLicenciaB1(aplicarFiltroSede)
      setPromo(p)
      setFilas(lista)
    } catch (err) {
      console.error('Error cargando Licencia B1:', err)
      setPromo(null)
      setFilas([])
      setError(err instanceof Error ? err.message : 'No se pudo cargar la pestaña')
    } finally {
      setUltimaLectura(new Date().toISOString())
      setLoading(false)
    }
  }, [aplicarFiltroSede])

  useEffect(() => {
    cargar()
  }, [cargar, sedeActualId])

  const stats = useMemo(() => ({
    total: filas.length,
    alDia: filas.filter(f => semaforo(f.resumen) === 'verde').length,
    unDia: filas.filter(f => semaforo(f.resumen) === 'amarillo').length,
    deuda: filas.filter(f => semaforo(f.resumen) === 'rojo').length,
    cobrado: filas.reduce((s, f) => s + f.resumen.totalPagado, 0),
  }), [filas])

  const filtradas = useMemo(() => {
    if (filtro === 'al_dia') return filas.filter(f => semaforo(f.resumen) === 'verde')
    if (filtro === 'un_dia') return filas.filter(f => semaforo(f.resumen) === 'amarillo')
    if (filtro === 'deuda') return filas.filter(f => semaforo(f.resumen) === 'rojo')
    return filas
  }, [filas, filtro])

  const detalle = filas.find(f => f.id === detalleId) || null

  // Mismo formato que la tabla de Saldos (textos, badges y botones fact-*)
  const columns = useMemo<ColumnDef<FilaB1, unknown>[]>(() => [
    {
      accessorKey: 'nombre',
      header: 'Conductor',
      // Barra de color del semáforo al inicio de la fila (CSS: td:has(> .lb1-celda-...))
      cell: ({ row }) => (
        <div className={`lb1-celda-${semaforo(row.original.resumen)}`} style={{ padding: '4px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: 'var(--text-primary)' }}>
            <span
              className={`lb1-semaforo lb1-semaforo-${semaforo(row.original.resumen)}`}
              title={TITULO_SEMAFORO[semaforo(row.original.resumen)]}
            />
            {formatNombreCompleto(row.original.nombre)}
            <LicenciaBadge categoria={row.original.categoria} otra={row.original.categoriaOtra} size="xs" />
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
            {row.original.cuit || row.original.dni || '-'}
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'ingreso',
      header: 'Desde',
      cell: ({ row }) => (
        <div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{formatFecha(row.original.ingreso)}</div>
          {row.original.esReingreso && <div style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>Reingreso</div>}
        </div>
      ),
    },
    {
      accessorKey: 'pagaHasta',
      header: 'Hasta',
      cell: ({ row }) => (
        <div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{formatFecha(row.original.pagaHasta)}</div>
          <div style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>{row.original.fechaD1 ? 'Obtuvo la D1' : 'Fin de la promoción'}</div>
        </div>
      ),
    },
    {
      id: 'dias',
      header: 'Días Pagados',
      accessorFn: f => f.resumen.diasPagados,
      cell: ({ row }) => {
        const r = row.original.resumen
        return <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{r.diasPagados} de {r.diasVencidos}</span>
      },
    },
    {
      id: 'pagado',
      header: 'Pagado',
      accessorFn: f => f.resumen.totalPagado,
      cell: ({ row }) => <span className="fact-precio" style={{ fontWeight: 700 }}>{formatCurrency(row.original.resumen.totalPagado)}</span>,
    },
    {
      id: 'deuda',
      header: 'Debe',
      accessorFn: f => f.resumen.deuda,
      cell: ({ row }) => {
        const r = row.original.resumen
        if (r.deuda > 0) return <span className="fact-precio fact-precio-negative" style={{ fontWeight: 700 }}>{formatCurrency(r.deuda)}</span>
        if (r.adelantado > 0) {
          return <span className="fact-precio" style={{ fontWeight: 700, color: '#16a34a' }} title="Pagó de más: cubre los días que vienen">+{formatCurrency(r.adelantado)}</span>
        }
        return <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>-</span>
      },
    },
    {
      id: 'estado',
      header: 'Estado',
      accessorFn: f => diasAdeudados(f.resumen),
      cell: ({ row }) => {
        const r = row.original.resumen
        const color = semaforo(r)
        const dias = diasAdeudados(r)
        const clase = color === 'verde' ? 'fact-badge-green' : color === 'amarillo' ? 'fact-badge-yellow' : 'fact-badge-red'
        return (
          <span className={`fact-badge ${clase}`} title={TITULO_SEMAFORO[color]} style={{ gap: '6px' }}>
            <span className={`lb1-semaforo lb1-semaforo-${color}`} />
            {r.diasVencidos === 0 ? 'Sin días aún' : dias === 0 ? 'Al día' : `Debe ${dias} ${dias === 1 ? 'día' : 'días'}`}
          </span>
        )
      },
    },
    {
      id: 'acciones',
      header: 'Acciones',
      cell: ({ row }) => (
        <div className="fact-table-actions">
          <button
            className="fact-table-btn fact-table-btn-view"
            onClick={() => { setSemanaSel('actual'); setDiaVer(null); setDetalleId(row.original.id) }}
            data-tooltip="Ver pagos por día"
          >
            <Eye size={14} />
          </button>
        </div>
      ),
      enableSorting: false,
    },
  ], [])

  // Semanas del modal: días que paga + días con pagos fuera de esos días
  const semanas = useMemo(() => {
    if (!detalle) return []
    const porFecha = new Map<string, DiaB1 | null>()
    for (const d of detalle.resumen.dias) porFecha.set(d.fecha, d)
    for (const p of detalle.pagos) if (!porFecha.has(p.fecha)) porFecha.set(p.fecha, null)
    const pagosPorFecha = new Map<string, PagoB1[]>()
    for (const p of detalle.pagos) pagosPorFecha.set(p.fecha, [...(pagosPorFecha.get(p.fecha) || []), p])

    const grupos = new Map<string, Array<{ fecha: string; dia: DiaB1 | null; pagos: PagoB1[] }>>()
    for (const fecha of [...porFecha.keys()].sort()) {
      const lunes = lunesDe(fecha)
      grupos.set(lunes, [...(grupos.get(lunes) || []), { fecha, dia: porFecha.get(fecha) ?? null, pagos: pagosPorFecha.get(fecha) || [] }])
    }
    return [...grupos.entries()].map(([lunes, filasDia]) => ({
      lunes,
      domingo: sumarDiasISO(lunes, 6),
      numero: getISOWeek(new Date(`${lunes}T12:00:00`)),
      filas: filasDia,
      saldoFavor: filasDia.reduce((s, f) => s + f.pagos.reduce((t, p) => t + p.monto, 0), 0),
      aPagar: filasDia.filter(f => f.dia).length * PROMO_B1_PAGO_DIARIO,
    })).reverse()
  }, [detalle])

  // Semana que se muestra (siempre una): la elegida; 'actual' = la de hoy (o la última con datos)
  const lunesHoy = lunesDe(hoyART())
  const semanaMostrada = semanaSel === 'actual' || !semanas.some(s => s.lunes === semanaSel)
    ? (semanas.find(s => s.lunes === lunesHoy)?.lunes ?? semanas[0]?.lunes ?? '')
    : semanaSel
  const semanasVisibles = semanas.filter(s => s.lunes === semanaMostrada)

  /**
   * Después de agregar, editar o quitar: recarga los datos con "Actualizando..." en el
   * modal y avisa recién cuando ya se ven los datos nuevos.
   */
  async function actualizarTrasAccion(mensaje?: string) {
    setActualizando(true)
    try {
      await cargar({ silencioso: true })
      if (mensaje) showSuccess(mensaje)
    } finally {
      setActualizando(false)
    }
  }

  /** Botón Actualizar: vuelve a leer los pagos (Cresium + registros) y los conductores. */
  const botonActualizar = (
    <button
      className="fact-btn fact-btn-secondary"
      onClick={() => (detalle ? actualizarTrasAccion() : cargar())}
      disabled={loading || actualizando}
      title={ultimaLectura ? `Datos leídos a las ${formatFechaHoraART(ultimaLectura).slice(-5)}` : 'Volver a leer los datos'}
    >
      <RefreshCw size={14} className={loading || actualizando ? 'lb1-girando' : undefined} />
      {loading || actualizando ? 'Actualizando...' : 'Actualizar'}
    </button>
  )

  function abrirAgregar() {
    if (!detalle) return
    // Siempre vacío: el usuario elige el día que corresponde (también desde el + de un día)
    setForm({ ...FORM_VACIO })
    setBusqueda('')
    setResultados(null)
    setElegido(null)
    setAgregando(true)
  }

  async function buscar() {
    if (busqueda.replace(/\D/g, '').length < 5) {
      showWarning('Escribí al menos 5 dígitos del CUIT/CUIL')
      return
    }
    setBuscando(true)
    setElegido(null)
    try {
      setResultados(await buscarDepositosCresium(busqueda, rangoBusqueda()))
    } catch (err) {
      showError(err instanceof Error ? err.message : 'No se pudo buscar en Cresium')
    } finally {
      setBuscando(false)
    }
  }

  /** La búsqueda en Cresium mira 7 días: hoy y los 6 anteriores (hora Argentina). */
  function rangoBusqueda(): { desde: string; hasta: string } {
    const hoy = hoyART()
    return { desde: sumarDiasISO(hoy, -(DIAS_BUSQUEDA_CRESIUM - 1)), hasta: hoy }
  }

  // No copia la fecha del depósito: el día al que corresponde se elige a mano
  function elegirDeposito(m: DepositoBuscado) {
    setElegido(m)
  }

  async function guardarRegistro() {
    if (!detalle) return
    if (!form.fecha) {
      showWarning('Elegí el día al que corresponde el pago')
      return
    }
    setGuardando(true)
    try {
      if (form.modo === 'manual') {
        const monto = leerMonto(form.monto)
        if (!monto || monto <= 0) {
          showWarning('Ingresá un monto mayor a 0')
          return
        }
        await agregarPagoManualB1(detalle.id, { fecha: form.fecha, monto, pagador: form.pagador, cuit: form.cuit, nota: form.nota }, usuario)
      } else {
        if (!elegido) {
          showWarning('Elegí un depósito de la lista')
          return
        }
        await asignarDepositoCresiumB1(detalle.id, elegido, { fecha: form.fecha, nota: form.nota }, usuario)
      }
      setAgregando(false)
      await actualizarTrasAccion('Pago agregado')
    } catch (err) {
      showError(err instanceof Error ? err.message : 'No se pudo guardar el pago')
    } finally {
      setGuardando(false)
    }
  }

  function abrirPago(p: PagoB1) {
    setPagoVer(p)
    setEditandoPago(false)
    setFormPago({
      fecha: p.fecha, monto: String(p.monto), pagador: p.pagador || '', cuit: p.cuit || '', nota: p.nota || '',
    })
  }

  async function guardarEdicionPago() {
    if (!detalle || !pagoVer) return
    if (!formPago.fecha) {
      showWarning('Elegí el día al que corresponde el pago')
      return
    }
    const monto = pagoVer.origen === 'manual'
      ? leerMonto(formPago.monto)
      : pagoVer.monto
    if (!monto || monto <= 0) {
      showWarning('Ingresá un monto mayor a 0')
      return
    }
    setGuardando(true)
    try {
      await editarPagoB1(detalle.id, pagoVer, { ...formPago, monto }, usuario)
      setPagoVer(null)
      await actualizarTrasAccion('Pago actualizado')
    } catch (err) {
      showError(err instanceof Error ? err.message : 'No se pudo editar el pago')
    } finally {
      setGuardando(false)
    }
  }

  async function quitar(pago: PagoB1) {
    if (!detalle) return
    const texto = pago.origen === 'auto'
      ? `El depósito de ${formatCurrency(pago.monto)} del ${formatFecha(pago.fecha)} deja de contar como pago diario de este conductor (queda registrado quién lo quitó).`
      : `Se anula el registro de ${formatCurrency(pago.monto)} del ${formatFecha(pago.fecha)} (queda registrado quién lo quitó).`
    if (!await confirmar({ titulo: 'Quitar pago', texto, peligro: true })) return
    try {
      await quitarPagoB1(detalle.id, pago, usuario)
      setPagoVer(null)
      await actualizarTrasAccion('Pago quitado')
    } catch (err) {
      showError(err instanceof Error ? err.message : 'No se pudo quitar el pago')
    }
  }

  // Depósitos que ya cuentan solos para este conductor (no se pueden volver a asignar)
  const movimientosDelConductor = useMemo(
    () => new Set((detalle?.pagos || []).map(p => p.movimientoId).filter(Boolean) as string[]),
    [detalle],
  )

  // Totales de la(s) semana(s) que se ven en el modal del conductor
  const totalesModal = semanasVisibles.reduce(
    (t, sem) => ({ aPagar: t.aPagar + sem.aPagar, pagado: t.pagado + sem.saldoFavor }),
    { aPagar: 0, pagado: 0 },
  )
  const filaDiaVer = diaVer ? semanas.flatMap(sem => sem.filas).find(f => f.fecha === diaVer) || null : null

  return (
    <div className="lb1">
      {promo && !promo.activa && (
        <div className="lb1-aviso">
          <AlertTriangle size={15} />
          La promoción {promo.codigo} está desactivada: estos pagos no restan en la facturación hasta activarla en Parámetros &gt; Promociones.
        </div>
      )}
      {promo && (
        <p className="lb1-ayuda">
          {promo.codigo} · {promo.nombre} ({formatFecha(promo.fecha_inicio)} al {formatFecha(promo.fecha_fin)}).
          Pagan {formatCurrency(PROMO_B1_PAGO_DIARIO)} por día, todos los días desde su primer turno hasta obtener la D1.
          Los depósitos de Cresium se toman solos por CUIT/CUIL; lo que paga otra persona se agrega en el detalle.
          Estos pagos restan en la facturación de la semana y se ven en Saldos como informativos (no cambian el saldo).
        </p>
      )}

      {/* Stats (mismo formato que Saldos; cada tarjeta filtra la tabla) */}
      <div className="fact-stats">
        <StatsGrid className="fact-stats-grid" storageKey="LicenciaB1Tab">
          <div className={`fact-stat-card lb1-stat ${filtro === 'todos' ? 'lb1-stat-activa' : ''}`} onClick={() => setFiltro('todos')}>
            <Users size={18} className="fact-stat-icon" />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{stats.total}</span>
              <span className="fact-stat-label">Conductores B1</span>
            </div>
          </div>
          <div className={`fact-stat-card lb1-stat ${filtro === 'al_dia' ? 'lb1-stat-activa' : ''}`} onClick={() => setFiltro('al_dia')}>
            <CheckCircle size={18} className="fact-stat-icon" style={{ color: '#16a34a' }} />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{stats.alDia}</span>
              <span className="fact-stat-label">Al día</span>
            </div>
          </div>
          <div className={`fact-stat-card lb1-stat ${filtro === 'un_dia' ? 'lb1-stat-activa' : ''}`} onClick={() => setFiltro('un_dia')}>
            <AlertTriangle size={18} className="fact-stat-icon" style={{ color: '#d97706' }} />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{stats.unDia}</span>
              <span className="fact-stat-label">Deben 1 día</span>
            </div>
          </div>
          <div className={`fact-stat-card lb1-stat ${filtro === 'deuda' ? 'lb1-stat-activa' : ''}`} onClick={() => setFiltro('deuda')}>
            <AlertTriangle size={18} className="fact-stat-icon" style={{ color: '#dc2626' }} />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{stats.deuda}</span>
              <span className="fact-stat-label">Deben 2+ días</span>
            </div>
          </div>
          <div className="fact-stat-card">
            <Wallet size={18} className="fact-stat-icon" />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{formatCurrency(stats.cobrado)}</span>
              <span className="fact-stat-label">Total Pagado</span>
            </div>
          </div>
        </StatsGrid>
      </div>

      <DataTable
        data={filtradas}
        columns={columns}
        loading={loading}
        error={error}
        pageSize={100}
        pageSizeOptions={[10, 20, 50, 100]}
        searchPlaceholder="Buscar conductor..."
        emptyIcon={<Wallet size={48} />}
        emptyTitle="Sin conductores en la promoción"
        emptyDescription="Aparecen los conductores con licencia B1 que ingresaron o reingresaron dentro del período de la promoción"
        headerAction={<div className="fact-header fact-header-inline">{botonActualizar}</div>}
      />

      {/* Modal del conductor: mismo diseño que "Control de Saldos" */}
      {detalle && (
        <div className="fact-modal-overlay" onClick={() => !agregando && !pagoVer && !diaVer && !actualizando && setDetalleId(null)}>
          <div className="fact-modal-content lb1-modal" style={{ maxWidth: '1100px' }} onClick={e => e.stopPropagation()}>
            {actualizando && (
              <div className="lb1-actualizando" aria-live="polite">
                <Spinner size="md" message="Actualizando datos..." />
              </div>
            )}
            <div className="fact-modal-header">
              <h2>Pagos Licencia B1</h2>
              <button className="fact-modal-close" onClick={() => setDetalleId(null)}><X size={20} /></button>
            </div>
            <div className="fact-modal-body" style={{ padding: '16px' }}>
              {/* Info del conductor */}
              <div className="lb1-hero">
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {formatNombreCompleto(detalle.nombre)}
                    <LicenciaBadge categoria={detalle.categoria} otra={detalle.categoriaOtra} size="sm" />
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '3px' }}>
                    DNI: {detalle.dni || '-'} &middot; CUIT: {detalle.cuit || 'sin cargar'}
                    {' '}&middot; Desde: <strong>{formatFecha(detalle.ingreso)}</strong>{detalle.esReingreso ? ' (reingreso)' : ''}
                    {' '}&middot; Hasta: <strong>{formatFecha(detalle.pagaHasta)}</strong>
                    {' '}&middot; Días pagados: <strong>{detalle.resumen.diasPagados} de {detalle.resumen.diasVencidos}</strong>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{
                    fontSize: '20px', fontWeight: 700, lineHeight: 1,
                    color: detalle.resumen.deuda > 0 ? '#dc2626' : '#16a34a',
                  }}>
                    {detalle.resumen.deuda > 0 ? `-${formatCurrency(detalle.resumen.deuda)}` : formatCurrency(detalle.resumen.adelantado)}
                  </div>
                  <span className={`fact-badge ${detalle.resumen.deuda > 0 ? (semaforo(detalle.resumen) === 'rojo' ? 'fact-badge-red' : 'fact-badge-yellow') : 'fact-badge-green'}`} style={{ marginTop: '4px', fontSize: '10px', padding: '2px 8px' }}>
                    {detalle.resumen.deuda > 0
                      ? `Debe ${diasAdeudados(detalle.resumen)} ${diasAdeudados(detalle.resumen) === 1 ? 'día' : 'días'}`
                      : detalle.resumen.adelantado > 0 ? 'Adelantado' : 'Al día'}
                  </span>
                  <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                    Total pagado: <strong style={{ color: '#16a34a' }}>{formatCurrency(detalle.resumen.totalPagado)}</strong>
                  </div>
                </div>
              </div>

              {/* Barra de filtros */}
              <div className="lb1-barra">
                <span className="lb1-barra-info">CUIT/CUIL para el cruce con Cresium: {detalle.cuit || 'sin cargar'} · DNI {detalle.dni || '-'}</span>
                {semanas.length > 0 && (
                  <select className="lb1-barra-select" value={semanaMostrada} onChange={e => setSemanaSel(e.target.value)} title="Semana a mostrar">
                    {semanas.map(sem => (
                      <option key={sem.lunes} value={sem.lunes}>
                        {sem.lunes.slice(0, 4)} S{String(sem.numero).padStart(2, '0')} · {formatFecha(sem.lunes).slice(0, 5)} al {formatFecha(sem.domingo).slice(0, 5)}
                        {sem.lunes === lunesHoy ? ' (actual)' : ''}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  className="lb1-barra-btn"
                  onClick={() => actualizarTrasAccion()}
                  disabled={actualizando}
                  title={ultimaLectura ? `Datos leídos a las ${formatFechaHoraART(ultimaLectura).slice(-5)}` : 'Volver a leer los datos'}
                >
                  <RefreshCw size={12} className={actualizando ? 'lb1-girando' : undefined} /> Actualizar
                </button>
                {puedeEditar && (
                  <button className="lb1-barra-btn lb1-barra-btn-primario" onClick={() => abrirAgregar()}>
                    <Plus size={12} /> Agregar registro
                  </button>
                )}
              </div>

              {/* Tabla por día (formato Control de Saldos) */}
              {semanasVisibles.length === 0 ? (
                <p style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Todavía no tiene días ni pagos.</p>
              ) : (
                <>
                  <div className="lb1-kardex">
                    <table>
                      <thead>
                        <tr>
                          <th>Día</th>
                          <th>Pagos del día</th>
                          <th className="lb1-der">Pagado</th>
                          <th className="lb1-der">Cubierto</th>
                          <th>Estado</th>
                          {puedeEditar && <th />}
                        </tr>
                      </thead>
                      <tbody>
                        {semanasVisibles.flatMap(sem => sem.filas).map(f => {
                          const totalDia = f.pagos.reduce((t, p) => t + p.monto, 0)
                          const esHoy = f.fecha === hoyART()
                          return (
                            <tr key={f.fecha} className={`lb1-kardex-fila-${f.dia?.estado || 'fuera'} ${esHoy ? 'lb1-kardex-hoy' : ''}`}>
                              <td className="lb1-kardex-dia">
                                {diaSemana(f.fecha)} {formatFecha(f.fecha)}
                                {esHoy && <span className="lb1-kardex-tag">Hoy</span>}
                              </td>
                              <td>
                                {f.pagos.length > 0 ? (
                                  <button className="lb1-kardex-link" onClick={() => setDiaVer(f.fecha)} title="Ver los registros de pago del día">
                                    {f.pagos.length} {f.pagos.length === 1 ? 'pago' : 'pagos'} · ver registros
                                  </button>
                                ) : f.dia?.cubiertoEl && f.dia.cubiertoEl !== f.fecha ? (
                                  <span className="lb1-kardex-cubierto">Cubierto con lo pagado el {formatFecha(f.dia.cubiertoEl).slice(0, 5)}</span>
                                ) : (
                                  <span className="lb1-kardex-tenue">Sin pagos</span>
                                )}
                              </td>
                              <td className="lb1-der lb1-kardex-monto" style={{ color: totalDia > 0 ? '#16a34a' : 'var(--text-tertiary)' }}>
                                {totalDia > 0 ? `+${formatCurrency(totalDia)}` : '-'}
                              </td>
                              <td className="lb1-der lb1-kardex-monto" style={{ fontWeight: 700 }}>
                                {f.dia ? formatCurrency(f.dia.cubierto) : '-'}
                              </td>
                              <td>
                                {f.dia ? (
                                  <span
                                    className={`lb1-kardex-estado lb1-kardex-estado-${f.dia.estado}`}
                                    title={f.dia.cubiertoEl && f.dia.cubiertoEl !== f.fecha ? `Cubierto con lo pagado el ${formatFecha(f.dia.cubiertoEl)}` : undefined}
                                  >
                                    {ETIQUETA_ESTADO_DIA[f.dia.estado]}
                                  </span>
                                ) : (
                                  <span className="lb1-kardex-tenue" title="Pago con fecha fuera de los días que paga">Fuera del período</span>
                                )}
                              </td>
                              {puedeEditar && (
                                <td style={{ textAlign: 'center' }}>
                                  <button className="lb1-kardex-icono" onClick={() => abrirAgregar()} title="Agregar registro"><Plus size={13} /></button>
                                </td>
                              )}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Totales de lo que se ve (como el pie de Control de Saldos) */}
                  <div className="lb1-totales">
                    <div>
                      <span>A pagar</span>
                      <strong>{formatCurrency(totalesModal.aPagar)}</strong>
                    </div>
                    <div>
                      <span>Pagado (saldo a favor)</span>
                      <strong style={{ color: '#16a34a' }}>+{formatCurrency(totalesModal.pagado)}</strong>
                    </div>
                    <div>
                      <span>Diferencia</span>
                      <strong style={{ color: totalesModal.pagado - totalesModal.aPagar < 0 ? '#dc2626' : '#16a34a' }}>
                        {formatCurrency(totalesModal.pagado - totalesModal.aPagar)}
                      </strong>
                    </div>
                    <div>
                      <span>{detalle.resumen.deuda > 0 ? 'Debe a hoy' : 'Adelantado a hoy'}</span>
                      <strong style={{ color: detalle.resumen.deuda > 0 ? '#dc2626' : '#16a34a' }}>
                        {formatCurrency(detalle.resumen.deuda > 0 ? detalle.resumen.deuda : detalle.resumen.adelantado)}
                      </strong>
                    </div>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '6px' }}>
                    Mostrando {semanasVisibles.reduce((n, sem) => n + sem.filas.length, 0)} días
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Registros del día: tabla con cada pago (se abre desde "ver registros") */}
      {detalle && filaDiaVer && filaDiaVer.pagos.length > 0 && (
        <div className="fact-modal-overlay" onClick={() => setDiaVer(null)}>
          <div className="fact-modal-content" style={{ maxWidth: '980px' }} onClick={e => e.stopPropagation()}>
            <div className="fact-modal-header">
              <h2>Registros del día</h2>
              <button className="fact-modal-close" onClick={() => setDiaVer(null)}><X size={20} /></button>
            </div>
            <div className="fact-modal-body" style={{ padding: '16px' }}>
              <div className="lb1-hero">
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>{formatNombreCompleto(detalle.nombre)}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '3px' }}>
                    {diaSemana(filaDiaVer.fecha)} {formatFecha(filaDiaVer.fecha)}
                    {filaDiaVer.dia && <> &middot; Cubierto: <strong>{formatCurrency(filaDiaVer.dia.cubierto)}</strong> de {formatCurrency(PROMO_B1_PAGO_DIARIO)}</>}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '20px', fontWeight: 700, lineHeight: 1, color: '#16a34a' }}>
                    {formatCurrency(filaDiaVer.pagos.reduce((t, p) => t + p.monto, 0))}
                  </div>
                  {filaDiaVer.dia && (
                    <span className={`lb1-kardex-estado lb1-kardex-estado-${filaDiaVer.dia.estado}`} style={{ marginTop: '4px', display: 'inline-block' }}>
                      {ETIQUETA_ESTADO_DIA[filaDiaVer.dia.estado]}
                    </span>
                  )}
                </div>
              </div>
              <div className="lb1-kardex">
                <table>
                  <thead>
                    <tr>
                      <th>Origen</th>
                      <th>Cuenta</th>
                      <th>Quién pagó</th>
                      <th>CUIT / CUIL</th>
                      <th>Nota</th>
                      <th className="lb1-der">Monto</th>
                      <th>Cargado por</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filaDiaVer.pagos.map(p => (
                      <tr key={p.key}>
                        <td><span className={`lb1-origen lb1-origen-${p.origen}`}>{ORIGEN_CORTO[p.origen]}</span></td>
                        <td className="lb1-kardex-tenue">{p.empresa ? ETIQUETA_EMPRESA_CRESIUM[p.empresa] || p.empresa : '-'}</td>
                        <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.pagador || '-'}</td>
                        <td className="lb1-kardex-tenue">{p.cuit || '-'}</td>
                        <td className="lb1-kardex-tenue lb1-kardex-corto" title={p.nota || ''}>{p.nota || '-'}</td>
                        <td className="lb1-der lb1-kardex-monto" style={{ color: '#16a34a', fontWeight: 700 }}>+{formatCurrency(p.monto)}</td>
                        <td className="lb1-kardex-tenue">{p.origen === 'auto' ? 'Automático' : p.cargadoPor || '-'}</td>
                        <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                          <button className="lb1-kardex-icono" onClick={() => abrirPago(p)} title="Ver detalle"><Eye size={13} /></button>
                          {puedeEditar && (
                            <>
                              <button className="lb1-kardex-icono" onClick={() => { abrirPago(p); setEditandoPago(true) }} title="Editar"><Edit2 size={13} /></button>
                              <button className="lb1-kardex-icono lb1-kardex-icono-quitar" onClick={() => quitar(p)} title="Quitar"><X size={13} /></button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '6px' }}>
                Mostrando {filaDiaVer.pagos.length} {filaDiaVer.pagos.length === 1 ? 'registro' : 'registros'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detalle / edición de un pago */}
      {pagoVer && detalle && (
        <div className="fact-modal-overlay" onClick={() => !guardando && setPagoVer(null)}>
          <div className="fact-modal-content" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
            <div className="fact-modal-header">
              <h2>{editandoPago ? 'Editar pago' : 'Detalle del pago'}</h2>
              <button className="fact-modal-close" onClick={() => !guardando && setPagoVer(null)}><X size={20} /></button>
            </div>
            <div className="fact-modal-body">
              <p className="lb1-tenue" style={{ marginTop: 0 }}>{detalle.nombre}</p>
              {!editandoPago ? (
                <div className="lb1-detalle-pago">
                  <span className="lb1-label">Monto</span>
                  <span className="lb1-monto lb1-verde">{formatCurrency(pagoVer.monto)}</span>
                  <span className="lb1-label">Día al que corresponde</span>
                  <span>{diaSemana(pagoVer.fecha)} {formatFecha(pagoVer.fecha)}</span>
                  <span className="lb1-label">Origen</span>
                  <span><span className={`lb1-origen lb1-origen-${pagoVer.origen}`}>{origenPago(pagoVer)}</span></span>
                  {pagoVer.fechaDeposito && (
                    <>
                      <span className="lb1-label">Fecha del depósito</span>
                      <span>{formatFecha(pagoVer.fechaDeposito)}</span>
                    </>
                  )}
                  <span className="lb1-label">{pagoVer.origen === 'manual' ? 'Quién pagó' : 'Envió'}</span>
                  <span>{pagoVer.pagador || '-'}</span>
                  <span className="lb1-label">CUIT / CUIL</span>
                  <span className="lb1-fecha">{pagoVer.cuit || '-'}</span>
                  <span className="lb1-label">Nota</span>
                  <span>{pagoVer.nota || '-'}</span>
                  <span className="lb1-label">Cargado por</span>
                  <span>
                    {pagoVer.origen === 'auto'
                      ? 'Automático (cruce por CUIT/CUIL con Cresium)'
                      : `${pagoVer.cargadoPor || '-'}${pagoVer.cargadoEn ? ` · ${formatFechaHoraART(pagoVer.cargadoEn)}` : ''}`}
                  </span>
                  {pagoVer.editadoEn && (
                    <>
                      <span className="lb1-label">Última edición</span>
                      <span>{pagoVer.editadoPor || '-'} · {formatFechaHoraART(pagoVer.editadoEn)}</span>
                    </>
                  )}
                </div>
              ) : (
                <>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Día al que corresponde <span className="required">*</span></label>
                      <input type="date" className="form-input" value={formPago.fecha} onChange={e => setFormPago(f => ({ ...f, fecha: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label>Monto {pagoVer.origen === 'manual' && <span className="required">*</span>}</label>
                      <input
                        className="form-input"
                        inputMode="decimal"
                        value={pagoVer.origen === 'manual' ? formPago.monto : formatCurrency(pagoVer.monto)}
                        disabled={pagoVer.origen !== 'manual'}
                        onChange={e => setFormPago(f => ({ ...f, monto: e.target.value }))}
                      />
                    </div>
                  </div>
                  {pagoVer.origen === 'manual' && (
                    <div className="form-row">
                      <div className="form-group">
                        <label>Quién pagó</label>
                        <input className="form-input" value={formPago.pagador} onChange={e => setFormPago(f => ({ ...f, pagador: e.target.value }))} />
                      </div>
                      <div className="form-group">
                        <label>CUIT / CUIL</label>
                        <input className="form-input" value={formPago.cuit} placeholder="Opcional" onChange={e => setFormPago(f => ({ ...f, cuit: e.target.value }))} />
                      </div>
                    </div>
                  )}
                  <div className="form-group">
                    <label>Nota</label>
                    <input className="form-input" value={formPago.nota} onChange={e => setFormPago(f => ({ ...f, nota: e.target.value }))} />
                  </div>
                  {pagoVer.origen !== 'manual' && (
                    <p className="lb1-tenue">
                      El monto y quién envió son los del depósito de Cresium: solo se cambia el día al que se imputa y la nota.
                    </p>
                  )}
                </>
              )}
            </div>
            <div className="fact-modal-footer">
              {!editandoPago ? (
                <>
                  {puedeEditar && (
                    <button className="btn-secondary lb1-btn-quitar" onClick={() => quitar(pagoVer)}>
                      <Trash2 size={14} /> Quitar
                    </button>
                  )}
                  <button className="btn-secondary" onClick={() => setPagoVer(null)}>Cerrar</button>
                  {puedeEditar && (
                    <button className="btn-primary lb1-btn-icono" onClick={() => setEditandoPago(true)}>
                      <Edit2 size={14} /> Editar
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button className="btn-secondary" onClick={() => setEditandoPago(false)} disabled={guardando}>Cancelar</button>
                  <button className="btn-primary" onClick={guardarEdicionPago} disabled={guardando}>
                    {guardando ? 'Guardando...' : 'Guardar'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Agregar registro: manual o buscando el depósito en Cresium */}
      {agregando && detalle && (
        <div className="fact-modal-overlay" onClick={() => !guardando && setAgregando(false)}>
          <div className="fact-modal-content" style={{ maxWidth: '680px' }} onClick={e => e.stopPropagation()}>
            <div className="fact-modal-header">
              <h2>Agregar registro</h2>
              <button className="fact-modal-close" onClick={() => !guardando && setAgregando(false)}><X size={20} /></button>
            </div>
            <div className="fact-modal-body">
              <p className="lb1-tenue" style={{ marginTop: 0 }}>{detalle.nombre}</p>
              <div className="lb1-modos">
                <button className={form.modo === 'cresium' ? 'lb1-modo lb1-modo-activo' : 'lb1-modo'} onClick={() => setForm(f => ({ ...f, modo: 'cresium' }))}>
                  <Search size={14} /> Buscar en Cresium
                </button>
                <button className={form.modo === 'manual' ? 'lb1-modo lb1-modo-activo' : 'lb1-modo'} onClick={() => setForm(f => ({ ...f, modo: 'manual' }))}>
                  <Plus size={14} /> Manual
                </button>
              </div>

              {form.modo === 'cresium' ? (
                <>
                  <div className="form-group">
                    <label>CUIT / CUIL de quien depositó</label>
                    <span className="lb1-tenue" style={{ display: 'block', marginBottom: '6px' }}>
                      Busca los depósitos de los últimos 7 días: del {formatFecha(rangoBusqueda().desde)} al {formatFecha(rangoBusqueda().hasta)}.
                    </span>
                    <div className="lb1-buscar">
                      <input
                        className="form-input"
                        value={busqueda}
                        placeholder="Ej. 27301234567"
                        onChange={e => setBusqueda(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && buscar()}
                      />
                      <button className="btn-secondary" onClick={buscar} disabled={buscando}>
                        {buscando ? 'Buscando...' : 'Buscar'}
                      </button>
                    </div>
                  </div>
                  {resultados && resultados.length === 0 && (
                    <p className="lb1-tenue">
                      No hay depósitos con ese CUIT/CUIL del {formatFecha(rangoBusqueda().desde)} al {formatFecha(rangoBusqueda().hasta)}.
                    </p>
                  )}
                  {resultados && resultados.length > 0 && (
                    <div className="lb1-resultados">
                      <table className="lb1-tabla">
                        <thead>
                          <tr><th /><th>Fecha</th><th>Cuenta</th><th>Envió</th><th>CUIT</th><th className="lb1-der">Importe</th></tr>
                        </thead>
                        <tbody>
                          {resultados.map(m => {
                            const yaCuenta = movimientosDelConductor.has(m.id)
                            const bloqueado = !!m.asignadoA || yaCuenta
                            return (
                              <tr
                                key={m.id}
                                className={`${elegido?.id === m.id ? 'lb1-fila-elegida' : ''} ${bloqueado ? 'lb1-fila-bloqueada' : ''}`}
                                onClick={() => !bloqueado && elegirDeposito(m)}
                                title={m.asignadoA ? `Ya está asignado a ${m.asignadoA}` : yaCuenta ? 'Ya cuenta para este conductor' : undefined}
                              >
                                <td><input type="radio" checked={elegido?.id === m.id} disabled={bloqueado} readOnly /></td>
                                <td className="lb1-fecha">{formatFecha(m.fecha)}</td>
                                <td>{ETIQUETA_EMPRESA_CRESIUM[m.empresa] || m.empresa}</td>
                                <td>
                                  {m.contraparte || '-'}
                                  {bloqueado && <div className="lb1-tenue">{m.asignadoA ? `Asignado a ${m.asignadoA}` : 'Ya cuenta para este conductor'}</div>}
                                </td>
                                <td className="lb1-fecha">{m.cuit || '-'}</td>
                                <td className="lb1-der lb1-monto">{formatCurrency(m.importe)}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {elegido && (
                    <div className="form-row">
                      <div className="form-group">
                        <label>Día al que corresponde <span className="required">*</span></label>
                        <input type="date" className="form-input" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
                      </div>
                      <div className="form-group">
                        <label>Nota</label>
                        <input className="form-input" value={form.nota} placeholder="Ej. lo pagó la esposa" onChange={e => setForm(f => ({ ...f, nota: e.target.value }))} />
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Día al que corresponde <span className="required">*</span></label>
                      <input type="date" className="form-input" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label>Monto <span className="required">*</span></label>
                      <input className="form-input" inputMode="decimal" value={form.monto} placeholder="15000" onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Quién pagó</label>
                      <input className="form-input" value={form.pagador} placeholder="Ej. María Pérez (hermana)" onChange={e => setForm(f => ({ ...f, pagador: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label>CUIT / CUIL</label>
                      <input className="form-input" value={form.cuit} placeholder="Opcional" onChange={e => setForm(f => ({ ...f, cuit: e.target.value }))} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Nota</label>
                    <input className="form-input" value={form.nota} placeholder="Ej. pagó en efectivo en la oficina" onChange={e => setForm(f => ({ ...f, nota: e.target.value }))} />
                  </div>
                </>
              )}
            </div>
            <div className="fact-modal-footer">
              <button className="btn-secondary" onClick={() => setAgregando(false)} disabled={guardando}>Cancelar</button>
              <button className="btn-primary" onClick={guardarRegistro} disabled={guardando || (form.modo === 'cresium' && !elegido)}>
                {guardando ? 'Guardando...' : 'Agregar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
