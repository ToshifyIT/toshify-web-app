// src/modules/administracion/cresium-conductores/CresiumConductoresModule.tsx
/**
 * Administración > Cresium conductores
 *
 * Cobros de Cresium (44 Dreams y Grupo CG) que son de conductores de la sede, mes por
 * mes. Solo cobros y solo de personas: los pagos y las empresas (CUIT 30, 33, 34) no se ven. El cruce es por CUIT/CUIL, por el DNI que va dentro del CUIL, por el
 * CBU cargado del conductor o porque se asignó a mano quién paga por él (a veces paga
 * la pareja, una hermana, una tía...). Ver cruceCresium.ts.
 *
 * - «Cobros sin asignar»: cobros del mes que no se cruzan con ningún conductor.
 * - Consulta por CBU/CVU, CUIT/CUIL, DNI o nombre en los últimos 7 días: muestra
 *   también lo que no es de un conductor.
 * En esos casos se puede elegir a qué conductor corresponde quien pagó.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  ArrowDownLeft, Users, Landmark, Search, X, UserPlus, HelpCircle,
} from 'lucide-react'
import type { ColumnDef, FilterFn } from '@tanstack/react-table'
import type { EmpresaCresium } from '../../../services/cresiumService'
import type { ConductorCruce, FilaCruce, MovimientoCruce, PagadorConductor, TipoConsulta } from './cruceCresium'
import {
  asignarPagador,
  conductorDeConsulta,
  cruzar,
  indexarConductores,
  nombreConductor,
  obtenerConductores,
  obtenerMovimientosConsulta,
  obtenerMovimientosMes,
  obtenerPagadores,
  quitarPagador,
  soloDigitos,
  tipoDeConsulta,
  DIAS_CONSULTA,
  ETIQUETA_CRITERIO,
  VINCULOS,
} from './cruceCresium'
import { useAuth } from '../../../contexts/AuthContext'
import { usePermissions } from '../../../contexts/PermissionsContext'
import { useSede } from '../../../contexts/SedeContext'
import { haceDiasART, mesActualART } from '../../../utils/fechaArgentina'
import { formatFechaHora, formatMoneda } from '../../../utils/format'
import { nombreMes } from '../../../utils/meses'
import { showError, showSuccess } from '../../../utils/toast'
import { confirmar } from '../../../components/ui/alertas'
import { ConductorAutocomplete } from '../../../components/ui/ConductorAutocomplete'
import { DataTable } from '../../../components/ui/DataTable'
import { MesSelector } from '../../../components/ui/MesSelector'
import { StatsGrid } from '../../../components/ui/StatsGrid'
import './CresiumConductoresModule.css'

type FiltroEmpresa = 'todas' | EmpresaCresium
type FiltroVista = 'todos' | 'sin_asignar'

const SUBMENU = 'cresium-conductores'

const ETIQUETA_EMPRESA: Record<EmpresaCresium, string> = {
  '44dreams': '44 Dreams',
  grupocg: 'Grupo CG',
}

const pesos = (n: number) => formatMoneda(n || 0, 'ARS', { decimales: 2 })

/** 'AAAA-MM-DD' -> 'DD/MM/AAAA' */
function formatDia(dia: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dia || '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '-'
}

/** Fecha y hora (HH:MM) del cobro; si no hay hora, solo el día. */
function fechaMovimiento(m: { fecha: string | null; procesado_en: string | null }): string {
  return m.procesado_en ? formatFechaHora(m.procesado_en, { segundos: false }) : formatDia(m.fecha)
}

/** CUIT con guiones: 20-12345678-9 */
function formatCuit(cuit: string | null | undefined): string {
  const d = soloDigitos(cuit)
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : (cuit || '-')
}

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Mismo nombre salvo mayúsculas, acentos y orden de las palabras */
function mismoNombre(a: string | null | undefined, b: string | null | undefined): boolean {
  const palabras = (s: string | null | undefined) => sinAcentos(s || '').split(/[\s,]+/).filter(Boolean).sort().join(' ')
  return palabras(a) === palabras(b)
}

/** Búsqueda: texto en nombres y nota; números en DNI, CUIT y CBU (sin importar guiones) */
const buscarEnFila: FilterFn<FilaCruce> = (row, _columnId, valor) => {
  const q = String(valor || '').trim().toLowerCase()
  if (!q) return true
  const f = row.original
  const texto = sinAcentos([f.nombre_conductor, f.contraparte, f.nota, f.banco_contraparte, f.asignacion?.vinculo].join(' '))
  if (texto.includes(sinAcentos(q))) return true
  const digitos = soloDigitos(q)
  if (digitos.length < 3) return false
  return [f.dni, f.cuit, f.conductor?.numero_cuit, f.cuenta_contraparte, f.conductor?.cbu]
    .some((v) => soloDigitos(v).includes(digitos))
}

interface Consulta {
  tipo: TipoConsulta
  valor: string
  desde: string
  movimientos: MovimientoCruce[]
  /** Conductor al que corresponde el dato según su ficha */
  conductorFicha: ConductorCruce | null
}

export function CresiumConductoresModule() {
  const { sedeActualId, verTodas, aplicarFiltroSede } = useSede()
  const { user } = useAuth()
  const { canEditInSubmenu } = usePermissions()
  const puedeAsignar = canEditInSubmenu(SUBMENU)

  const [mes, setMes] = useState(mesActualART)
  const [empresa, setEmpresa] = useState<FiltroEmpresa>('todas')
  const [vista, setVista] = useState<FiltroVista>('todos')

  const [conductores, setConductores] = useState<ConductorCruce[] | null>(null)
  /** null: la tabla de asignaciones todavía no existe en la base */
  const [pagadores, setPagadores] = useState<PagadorConductor[] | null>([])
  const [movimientos, setMovimientos] = useState<MovimientoCruce[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [consultaTexto, setConsultaTexto] = useState('')
  const [consulta, setConsulta] = useState<Consulta | null>(null)
  const [consultando, setConsultando] = useState(false)

  const [asignando, setAsignando] = useState<FilaCruce | null>(null)

  // Conductores de la sede (se recargan al cambiar de sede)
  useEffect(() => {
    let cancelado = false
    setConductores(null)
    obtenerConductores((q) => aplicarFiltroSede(q))
      .then((c) => { if (!cancelado) setConductores(c) })
      .catch((e: unknown) => {
        console.error('Error cargando conductores:', e)
        if (!cancelado) setError('No se pudieron leer los conductores')
      })
    return () => { cancelado = true }
  }, [sedeActualId, verTodas, aplicarFiltroSede])

  const cargarPagadores = useCallback(async () => {
    try {
      setPagadores(await obtenerPagadores())
    } catch (e) {
      console.error('Error cargando asignaciones de pagos:', e)
      showError('No se pudieron leer las asignaciones de pagos')
    }
  }, [])

  useEffect(() => { void cargarPagadores() }, [cargarPagadores])

  // Movimientos del mes
  useEffect(() => {
    let cancelado = false
    setLoading(true)
    setError(null)
    obtenerMovimientosMes(mes, (q) => aplicarFiltroSede(q))
      .then((m) => { if (!cancelado) setMovimientos(m) })
      .catch((e: unknown) => {
        console.error('Error cargando movimientos de Cresium:', e)
        if (!cancelado) setError('No se pudieron leer los movimientos de Cresium')
      })
      .finally(() => { if (!cancelado) setLoading(false) })
    return () => { cancelado = true }
  }, [mes, aplicarFiltroSede])

  const indice = useMemo(
    () => (conductores ? indexarConductores(conductores, pagadores || []) : null),
    [conductores, pagadores],
  )

  // Todo cruzado (con y sin conductor); se recalcula al cambiar sede o asignaciones
  const filasMes = useMemo(() => (indice ? cruzar(movimientos, indice, true) : []), [movimientos, indice])
  const filasConsulta = useMemo(
    () => (consulta && indice ? cruzar(consulta.movimientos, indice, true) : []),
    [consulta, indice],
  )

  const base = useMemo(() => {
    const filas = consulta ? filasConsulta : filasMes
    return empresa === 'todas' ? filas : filas.filter((f) => f.empresa === empresa)
  }, [consulta, filasConsulta, filasMes, empresa])

  /** Cobros de personas (no empresas) que no se cruzan con ningún conductor: puede pagar un familiar */
  const sinAsignar = useMemo(() => base.filter((f) => !f.conductor), [base])
  /** Lo que se cuenta y se muestra por defecto: en el mes, solo de conductores; en la consulta, todo */
  const principales = useMemo(() => (consulta ? base : base.filter((f) => f.conductor)), [consulta, base])

  const visibles = useMemo(() => {
    return vista === 'sin_asignar' ? sinAsignar : principales
  }, [vista, principales, sinAsignar])

  const resumen = useMemo(() => {
    const ids = new Set<string>()
    let cobros = 0
    for (const f of principales) {
      if (f.conductor) ids.add(f.conductor.id)
      cobros += f.importe
    }
    const montoSinAsignar = sinAsignar.reduce((s, f) => s + f.importe, 0)
    return { cobros, nCobros: principales.length, conductores: ids.size, montoSinAsignar }
  }, [principales, sinAsignar])

  const consultar = useCallback(async (e?: FormEvent) => {
    e?.preventDefault()
    const tipo = tipoDeConsulta(consultaTexto)
    if (!tipo) {
      showError('Ingresá un CBU/CVU (22 números), un CUIT/CUIL (11), un DNI (7 u 8) o un nombre')
      return
    }
    const valor = tipo === 'nombre' ? consultaTexto.trim() : soloDigitos(consultaTexto)
    const desde = haceDiasART(DIAS_CONSULTA)
    setConsultando(true)
    try {
      const conductorFicha = conductorDeConsulta(tipo, valor, conductores || [])
      const movs = await obtenerMovimientosConsulta(tipo, valor, conductorFicha?.cbu ?? null, desde, (q) => aplicarFiltroSede(q))
      setConsulta({ tipo, valor, desde, movimientos: movs, conductorFicha })
      setVista('todos')
    } catch (err) {
      console.error('Error en la consulta:', err)
      showError('No se pudo hacer la consulta')
    } finally {
      setConsultando(false)
    }
  }, [consultaTexto, conductores])

  const cerrarConsulta = () => {
    setConsulta(null)
    setConsultaTexto('')
  }

  const quitarAsignacion = useCallback(async (f: FilaCruce) => {
    if (!f.asignacion) return
    const ok = await confirmar({
      titulo: 'Quitar asignación',
      texto: `Los pagos de ${f.contraparte || 'esta persona'} dejan de figurar a nombre de ${f.nombre_conductor}. `
        + 'Las transferencias que ya entraron en su saldo siguen enlazadas: esto solo cambia las próximas.',
      peligro: true,
    })
    if (!ok) return
    try {
      await quitarPagador(f.asignacion.id)
      await cargarPagadores()
      showSuccess('Asignación quitada')
    } catch (e) {
      console.error('Error quitando asignación:', e)
      showError('No se pudo quitar la asignación')
    }
  }, [cargarPagadores])

  const columnas = useMemo<ColumnDef<FilaCruce, unknown>[]>(() => [
    {
      id: 'fecha',
      header: 'Fecha',
      accessorFn: (f) => f.procesado_en || f.fecha || '',
      cell: ({ row }) => <span style={{ whiteSpace: 'nowrap' }}>{fechaMovimiento(row.original)}</span>,
    },
    {
      id: 'pago',
      header: 'Pagó',
      accessorFn: (f) => f.contraparte || '',
      cell: ({ row }) => {
        const f = row.original
        return (
          <div className="crc-celda">
            <span className="crc-nombre">{f.contraparte || '(sin nombre)'}</span>
            <span className="crc-muted">{f.cuit ? `CUIT ${formatCuit(f.cuit)}` : 'Sin CUIT'}</span>
            {f.asignacion?.vinculo && <span className="crc-muted">{f.asignacion.vinculo}</span>}
          </div>
        )
      },
    },
    {
      id: 'cuenta',
      header: 'CBU/CVU',
      accessorFn: (f) => f.cuenta_contraparte || '',
      cell: ({ row }) => {
        const f = row.original
        return (
          <div className="crc-celda">
            <span className="crc-mono">{f.cuenta_contraparte || '-'}</span>
            {f.banco_contraparte && <span className="crc-muted">{f.banco_contraparte}</span>}
          </div>
        )
      },
    },
    {
      id: 'conductor',
      header: 'Corresponde a',
      accessorFn: (f) => (f.conductor ? f.nombre_conductor : 'Sin asignar'),
      cell: ({ row }) => {
        const f = row.original
        if (!f.conductor) {
          return (
            <div className="crc-celda">
              <span className="crc-muted">Sin asignar</span>
              {puedeAsignar && pagadores !== null && (
                <button type="button" className="crc-link" onClick={() => setAsignando(f)}>
                  <UserPlus size={14} />
                  Asignar conductor
                </button>
              )}
            </div>
          )
        }
        const otroNombre = f.criterio !== 'asignado' && f.contraparte
          && !mismoNombre(f.contraparte, nombreConductor(f.conductor))
        return (
          <div className="crc-celda">
            <span className="crc-nombre">{f.nombre_conductor}</span>
            <span className="crc-muted">
              {[f.dni ? `DNI ${f.dni}` : null, f.conductor.estado].filter(Boolean).join(' · ')}
            </span>
            {otroNombre && <span className="crc-muted">Con otro nombre en Cresium</span>}
            {f.asignacion && puedeAsignar && (
              <span className="crc-acciones-celda">
                <button type="button" className="crc-link" onClick={() => setAsignando(f)}>Cambiar</button>
                <button type="button" className="crc-link" onClick={() => void quitarAsignacion(f)}>Quitar</button>
              </span>
            )}
          </div>
        )
      },
    },
    {
      id: 'criterio',
      header: 'Cruce por',
      accessorFn: (f) => (f.criterio ? ETIQUETA_CRITERIO[f.criterio] : '-'),
    },
    {
      id: 'empresa',
      header: 'Empresa',
      accessorFn: (f) => ETIQUETA_EMPRESA[f.empresa] || f.empresa,
    },
    {
      id: 'importe',
      header: 'Importe',
      accessorFn: (f) => f.importe,
      cell: ({ row }) => (
        <span className="crc-importe crc-entrada">{pesos(row.original.importe)}</span>
      ),
    },
    {
      id: 'nota',
      header: 'Nota',
      accessorFn: (f) => f.nota || '',
      cell: ({ row }) => <span className="crc-muted">{row.original.nota || ''}</span>,
    },
  ], [puedeAsignar, pagadores, quitarAsignacion])

  const tarjetas: Array<{ id: FiltroVista | null; label: string; valor: string | number; icono: typeof Users }> = [
    {
      id: 'todos',
      label: consulta ? `Cobros (${resumen.nCobros})` : `Cobros de conductores (${resumen.nCobros})`,
      valor: pesos(resumen.cobros),
      icono: ArrowDownLeft,
    },
    { id: null, label: 'Conductores', valor: resumen.conductores, icono: Users },
    {
      id: 'sin_asignar',
      label: `Cobros sin asignar (${sinAsignar.length})`,
      valor: pesos(resumen.montoSinAsignar),
      icono: HelpCircle,
    },
  ]

  const cargando = loading || conductores === null

  return (
    <div className="crc-module">
      <div className="crc-stats">
        <StatsGrid className="stats-grid" storageKey="CresiumConductoresModule">
          {tarjetas.map((t) => {
            const Icono = t.icono
            const clickeable = t.id !== null
            return (
              <div
                key={t.id || t.label}
                className={`stat-card ${clickeable && vista === t.id && t.id !== 'todos' ? 'active' : ''}`}
                onClick={clickeable ? () => setVista(vista === t.id ? 'todos' : (t.id as FiltroVista)) : undefined}
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
        </StatsGrid>
      </div>

      <div className="crc-filtros">
        <label className="crc-campo">
          <span>Mes</span>
          <MesSelector value={mes} max={mesActualART()} onChange={setMes} disabled={!!consulta} />
        </label>
        <label className="crc-campo">
          <span>Empresa</span>
          <select className="form-input" value={empresa} onChange={(e) => setEmpresa(e.target.value as FiltroEmpresa)}>
            <option value="todas">Todas</option>
            <option value="44dreams">44 Dreams</option>
            <option value="grupocg">Grupo CG</option>
          </select>
        </label>
        <form className="crc-campo crc-cbu" onSubmit={(e) => void consultar(e)}>
          <span>Consultar CBU/CVU, CUIT/CUIL, DNI o nombre (últimos {DIAS_CONSULTA} días)</span>
          <div className="crc-cbu-fila">
            <input
              className="form-input"
              placeholder="CBU, CUIT, DNI o nombre"
              value={consultaTexto}
              onChange={(e) => setConsultaTexto(e.target.value)}
              maxLength={60}
            />
            <button type="submit" className="btn-primary" disabled={consultando || conductores === null}>
              <Search size={16} />
              {consultando ? 'Consultando...' : 'Consultar'}
            </button>
            {consulta && (
              <button type="button" className="btn-secondary" onClick={cerrarConsulta}>
                <X size={16} />
                Volver al mes
              </button>
            )}
          </div>
        </form>
      </div>

      <DataTable
        data={visibles}
        columns={columnas}
        loading={cargando || consultando}
        error={error}
        pageSize={50}
        pageSizeOptions={[20, 50, 100]}
        searchPlaceholder="Buscar nombre, DNI, CUIT/CUIL o CBU..."
        globalFilterFn={buscarEnFila}
        emptyIcon={<Landmark size={48} />}
        emptyTitle={consulta
          ? `Sin cobros en los últimos ${DIAS_CONSULTA} días`
          : vista === 'sin_asignar'
            ? `No hay cobros sin asignar en ${nombreMes(mes)}`
            : `No hay cobros de conductores en ${nombreMes(mes)}`}
        emptyDescription={consulta || vista === 'sin_asignar'
          ? ''
          : 'Solo se muestran los cobros de Cresium que coinciden con un conductor de la sede.'}
        resetFiltersKey={consulta ? `${consulta.tipo}-${consulta.valor}` : `${mes}-${vista}`}
      />

      {asignando && conductores && (
        <AsignarConductorModal
          fila={asignando}
          conductores={conductores}
          onClose={() => setAsignando(null)}
          onGuardar={async (conductorId, vinculo) => {
            await asignarPagador(asignando, conductorId, vinculo, user?.id ?? null)
            await cargarPagadores()
            setAsignando(null)
            showSuccess('Pago asignado')
          }}
        />
      )}
    </div>
  )
}

interface AsignarConductorModalProps {
  fila: FilaCruce
  conductores: ConductorCruce[]
  onClose: () => void
  onGuardar: (conductorId: string, vinculo: string | null) => Promise<void>
}

/** Elegir a qué conductor corresponde la persona que hizo el pago */
function AsignarConductorModal({ fila, conductores, onClose, onGuardar }: AsignarConductorModalProps) {
  const [conductorId, setConductorId] = useState(fila.conductor?.id || '')
  const [vinculo, setVinculo] = useState(fila.asignacion?.vinculo || '')
  const [guardando, setGuardando] = useState(false)

  const opciones = useMemo(() => conductores
    .map((c) => ({
      value: c.id,
      label: nombreConductor(c),
      subtitle: [c.numero_dni ? `DNI ${c.numero_dni}` : null, c.estado].filter(Boolean).join(' · '),
      searchText: [c.numero_dni, c.numero_cuit].filter(Boolean).join(' '),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es')), [conductores])

  const porCuit = soloDigitos(fila.cuit).length === 11

  const guardar = async () => {
    if (!conductorId) {
      showError('Elegí el conductor')
      return
    }
    setGuardando(true)
    try {
      await onGuardar(conductorId, vinculo || null)
    } catch (e) {
      console.error('Error asignando pago:', e)
      showError('No se pudo guardar la asignación')
      setGuardando(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content crc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">¿A qué conductor corresponde?</h2>
          <button type="button" className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="modal-body crc-modal-body">
          <div className="crc-modal-pago">
            <span className="crc-muted">Pagó</span>
            <span className="crc-nombre">{fila.contraparte || '(sin nombre)'}</span>
            <span className="crc-muted">
              {porCuit ? `CUIT ${formatCuit(fila.cuit)}` : `CBU/CVU ${fila.cuenta_contraparte || '-'}`}
              {' · '}{fechaMovimiento(fila)} · {pesos(fila.importe)}
            </span>
          </div>

          <label className="crc-campo">
            <span>Conductor</span>
            <ConductorAutocomplete
              value={conductorId}
              onChange={setConductorId}
              options={opciones}
              placeholder="Buscar por nombre o DNI"
              inputClassName="form-input"
            />
          </label>

          <label className="crc-campo">
            <span>Vínculo (opcional)</span>
            <select className="form-input" value={vinculo} onChange={(e) => setVinculo(e.target.value)}>
              <option value="">Sin especificar</option>
              {VINCULOS.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>

          <p className="crc-muted crc-modal-nota">
            Se guarda la persona que pagó (por {porCuit ? 'su CUIT' : 'su CBU/CVU'}): sus pagos anteriores y
            los que vengan van a figurar a nombre de este conductor.
          </p>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={guardando}>Cancelar</button>
          <button type="button" className="btn-primary" onClick={() => void guardar()} disabled={guardando || !conductorId}>
            {guardando ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
