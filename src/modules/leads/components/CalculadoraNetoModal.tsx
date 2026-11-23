// src/modules/leads/components/CalculadoraNetoModal.tsx
//
// Calculadora de neto del conductor para la entrevista (ver calculadoraNeto.ts).
// El capitán carga días y horas con el candidato; el resto sale de ToshiBase.
// No guarda nada del candidato. Los supuestos se pueden ajustar para la cuenta del
// momento; solo un admin puede guardarlos como valores de referencia compartidos.

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { X, Calculator, RotateCcw, Info } from 'lucide-react'
import type { ModalidadTarifa } from '../../onboarding/tarifaConceptos'
import { useSede } from '../../../contexts/SedeContext'
import { usePermissions } from '../../../contexts/PermissionsContext'
import { useAuth } from '../../../contexts/AuthContext'
import {
  calcular,
  obtenerDatosCalculadora,
  descuentosIngreso,
  guardarParametro,
  type ClaveParametro,
  type DatosCalculadora,
  type ResultadoSemana,
  type Supuestos,
} from '../calculadoraNeto'
import { showError, showSuccess } from '../../../utils/toast'
import { confirmar } from '../../../components/ui/alertas'
import { formatFecha, formatNumero, formatPlata } from '../../../utils/format'
import { Spinner } from '../../../components/ui/LoadingOverlay'
import './CalculadoraNetoModal.css'

const MODALIDADES: Array<{ valor: ModalidadTarifa; etiqueta: string }> = [
  { valor: 'diurno', etiqueta: 'Turno diurno' },
  { valor: 'nocturno', etiqueta: 'Turno nocturno' },
  { valor: 'cargo', etiqueta: 'Auto a cargo' },
]

/** Supuesto editable en pantalla, con la clave del parámetro compartido si la tiene. */
interface CampoSupuesto {
  campo: keyof Supuestos
  etiqueta: string
  unidad: string
  parametro?: ClaveParametro
}

const CAMPOS: CampoSupuesto[] = [
  { campo: 'factHora', etiqueta: 'Genera en Cabify por hora (app + efectivo)', unidad: '$ por hora' },
  { campo: 'kmHora', etiqueta: 'Km por hora conectada', unidad: 'km' },
  { campo: 'costoGncKm', etiqueta: 'Costo de GNC por km', unidad: '$ por km', parametro: 'costo_gnc_km' },
  { campo: 'peajesSemana', etiqueta: 'Peajes', unidad: '$ por semana' },
  { campo: 'naftaSemana', etiqueta: 'Nafta para la bomba', unidad: '$ por semana', parametro: 'nafta_bomba_semana' },
  { campo: 'alquilerSemana', etiqueta: 'Alquiler', unidad: '$ por semana' },
  { campo: 'toshipassSemana', etiqueta: 'ToshiPass', unidad: '$ por semana' },
  { campo: 'monotributoMes', etiqueta: 'Monotributo', unidad: '$ por mes', parametro: 'monotributo_mes' },
  { campo: 'lavadoSemana', etiqueta: 'Lavado', unidad: '$ por semana', parametro: 'lavado_semana' },
  { campo: 'otrosSemana', etiqueta: 'Otros gastos', unidad: '$ por semana', parametro: 'otros_semana' },
  { campo: 'pctFloja', etiqueta: 'Semana floja', unidad: '% de lo generado', parametro: 'pct_semana_floja' },
  { campo: 'pctBuena', etiqueta: 'Semana buena', unidad: '% de lo generado', parametro: 'pct_semana_buena' },
  { campo: 'metaMes', etiqueta: 'Meta de neto', unidad: '$ por mes', parametro: 'meta_neto_mes' },
  { campo: 'horasMaxTurno', etiqueta: 'Horas máximas del turno', unidad: 'h por día', parametro: 'horas_max_turno' },
  { campo: 'topeDeuda', etiqueta: 'Tope de deuda', unidad: '$', parametro: 'tope_deuda' },
  { campo: 'cuotaMaxPlan', etiqueta: 'Cuota máxima de un plan de pago', unidad: '$', parametro: 'cuota_max_plan' },
]

/** Alquiler y ToshiPass siempre a tarifa completa: los descuentos de ingreso van aparte. */
function supuestosIniciales(d: DatosCalculadora, modalidad: ModalidadTarifa): Supuestos {
  const p = d.parametros
  return {
    factHora: d.cabify.factHora ?? p.fact_hora_referencia,
    kmHora: d.cabify.kmHora ?? p.km_hora_referencia,
    costoGncKm: p.costo_gnc_km,
    peajesSemana: d.cabify.peajesSemana ?? p.peajes_semana_referencia,
    naftaSemana: p.nafta_bomba_semana,
    alquilerSemana: Math.round(d.tarifas[modalidad]?.alquiler ?? 0),
    toshipassSemana: Math.round(d.toshipass),
    monotributoMes: p.monotributo_mes,
    lavadoSemana: p.lavado_semana,
    otrosSemana: p.otros_semana,
    pctFloja: p.pct_semana_floja,
    pctBuena: p.pct_semana_buena,
    metaMes: p.meta_neto_mes,
    horasMaxTurno: p.horas_max_turno,
    topeDeuda: p.tope_deuda,
    cuotaMaxPlan: p.cuota_max_plan,
  }
}

const plata = (n: number) => formatPlata(Math.round(n))
const fmtHoras = (n: number | null) => (n === null ? 'No se cubre' : `${formatNumero(n, 1)} h`)

/** Fila de un gasto (resta, en rojo) o de un descuento (suma, en verde). */
function FilaCosto({ etiqueta, valor, signo = '-' }: { etiqueta: string; valor: number; signo?: '-' | '+' }) {
  const clase = valor > 0 ? (signo === '-' ? 'calc-negativo' : 'calc-positivo') : ''
  return (
    <div className="calc-fila">
      <span>{etiqueta}</span>
      <span className={clase}>
        {valor > 0 ? `${signo} ` : ''}{plata(valor)}
      </span>
    </div>
  )
}

/** Título de bloque con un ícono "i" que abre/cierra la explicación (sirve con el dedo en el celular). */
function TituloConAyuda({ titulo, nivel = 'h3', children }: { titulo: string; nivel?: 'h3' | 'h4'; children: ReactNode }) {
  const [abierta, setAbierta] = useState(false)
  const Tag = nivel
  return (
    <>
      <Tag className="calc-titulo-ayuda">
        {titulo}
        <button
          type="button"
          className="calc-info"
          onClick={() => setAbierta(a => !a)}
          aria-expanded={abierta}
          aria-label={`Qué significa: ${titulo}`}
          title="Qué significa"
        >
          <Info size={14} />
        </button>
      </Tag>
      {abierta && <p className="calc-fuente calc-ayuda">{children}</p>}
    </>
  )
}

function Escenario({ titulo, r }: { titulo: string; r: ResultadoSemana }) {
  return (
    <div className="calc-escenario">
      <div className="calc-escenario-cab">
        <div className="calc-escenario-titulo">{titulo}</div>
        <div className="calc-escenario-pct">
          Genera {plata(r.facturacion)}
          {r.pct !== 1 && <> ({formatNumero(Math.abs(r.pct - 1) * 100)}% {r.pct < 1 ? 'menos' : 'más'})</>}
        </div>
      </div>
      <div className="calc-escenario-res">
        <div className={`calc-escenario-neto ${r.netoSemana < 0 ? 'calc-negativo' : 'calc-positivo'}`}>
          {plata(r.netoSemana)} <span className="calc-escenario-sub">por semana</span>
        </div>
        <div className="calc-escenario-sub">{plata(r.netoMes)} por mes</div>
      </div>
    </div>
  )
}

export function CalculadoraNetoModal({ onClose }: { onClose: () => void }) {
  const { sedeActualId, sedeActual } = useSede()
  const { isAdmin } = usePermissions()
  const { user } = useAuth()
  const esAdmin = isAdmin()
  const [datos, setDatos] = useState<DatosCalculadora | null>(null)
  const [error, setError] = useState('')
  // Texto tal cual se escribe (puede quedar vacío mientras se edita); la cuenta usa el número.
  const [diasTxt, setDiasTxt] = useState('6')
  const [horasTxt, setHorasTxt] = useState('11')
  const dias = Math.min(7, Math.max(0, Number(diasTxt.replace(',', '.')) || 0))
  const horas = Math.min(24, Math.max(0, Number(horasTxt.replace(',', '.')) || 0))
  const [modalidad, setModalidad] = useState<ModalidadTarifa>('diurno')
  const [conPromo, setConPromo] = useState(false)
  const [esReferido, setEsReferido] = useState(false)
  const [supuestos, setSupuestos] = useState<Supuestos | null>(null)
  const [verSupuestos, setVerSupuestos] = useState(false)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    let cancelado = false
    setDatos(null)
    setError('')
    obtenerDatosCalculadora(sedeActualId)
      .then(d => {
        if (cancelado) return
        setDatos(d)
        setConPromo(!!d.promo)
        setSupuestos(supuestosIniciales(d, 'diurno'))
      })
      .catch(err => {
        console.error('Calculadora de neto:', err)
        if (!cancelado) setError('No se pudieron cargar los datos de la calculadora')
      })
    return () => { cancelado = true }
  }, [sedeActualId])

  useEffect(() => {
    const cerrarConEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', cerrarConEsc)
    return () => window.removeEventListener('keydown', cerrarConEsc)
  }, [onClose])

  /** Al cambiar la modalidad se vuelve a tomar el alquiler de esa tarifa. */
  function cambiarModalidad(nuevaModalidad: ModalidadTarifa) {
    setModalidad(nuevaModalidad)
    if (!datos) return
    const base = supuestosIniciales(datos, nuevaModalidad)
    setSupuestos(s => (s ? { ...s, alquilerSemana: base.alquilerSemana, toshipassSemana: base.toshipassSemana } : base))
  }

  const resultado = useMemo(
    () => (supuestos ? calcular(supuestos, dias, horas) : null),
    [supuestos, dias, horas],
  )

  const descuentos = supuestos && datos ? descuentosIngreso(supuestos, datos.promo, conPromo, esReferido) : null

  const iniciales = datos ? supuestosIniciales(datos, modalidad) : null
  const modificados = supuestos && iniciales
    ? CAMPOS.filter(c => supuestos[c.campo] !== iniciales[c.campo])
    : []
  const guardables = modificados.filter(c => c.parametro)

  async function guardarSupuestos() {
    if (!supuestos || guardables.length === 0) return
    const ok = await confirmar({
      titulo: 'Guardar valores de referencia',
      texto: `Se guardan ${guardables.length === 1 ? 'el valor' : `los ${guardables.length} valores`} (${guardables.map(c => c.etiqueta).join(', ')}) para todos los capitanes y todas las sedes.`,
    })
    if (!ok) return
    setGuardando(true)
    try {
      for (const c of guardables) await guardarParametro(c.parametro!, supuestos[c.campo], user?.id)
      const d = await obtenerDatosCalculadora(sedeActualId, true)
      setDatos(d)
      showSuccess('Valores de referencia guardados')
    } catch (err) {
      console.error('Guardar parámetros de la calculadora:', err)
      showError('No se pudieron guardar los valores')
    } finally {
      setGuardando(false)
    }
  }

  const tarifa = datos?.tarifas[modalidad]
  const sinTarifa = datos && !tarifa
  const turnoAplica = modalidad !== 'cargo'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content calc-neto-modal" onClick={e => e.stopPropagation()} role="dialog" aria-label="Calculadora de neto del conductor">
        <div className="modal-header">
          <h2><Calculator size={18} /> ¿Cuánto le queda al conductor?</h2>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>

        <div className="modal-body">
          {error && <div className="calc-error">{error}</div>}
          {!error && (!datos || !supuestos || !resultado) && (
            <div className="calc-cargando"><Spinner /> Cargando tarifas y datos de Cabify...</div>
          )}

          {datos && supuestos && resultado && (
            <>
              <p className="calc-intro">
                Hagan la cuenta juntos: cuántos días y cuántas horas piensa manejar. Es una estimación con promedios.
              </p>

              <div className="calc-entradas">
                <label className="calc-campo">
                  <span>Días por semana</span>
                  <input
                    type="number" inputMode="numeric" min={1} max={7} value={diasTxt}
                    onChange={e => setDiasTxt(e.target.value)}
                  />
                </label>
                <label className="calc-campo">
                  <span>Horas conectado por día</span>
                  <input
                    type="number" inputMode="decimal" min={1} max={24} step={0.5} value={horasTxt}
                    onChange={e => setHorasTxt(e.target.value)}
                  />
                </label>
                <label className="calc-campo">
                  <span>Modalidad</span>
                  <select value={modalidad} onChange={e => cambiarModalidad(e.target.value as ModalidadTarifa)}>
                    {MODALIDADES.map(m => <option key={m.valor} value={m.valor}>{m.etiqueta}</option>)}
                  </select>
                </label>
              </div>

              <div className="calc-checks">
                {datos.promo && (
                  <label className="calc-check">
                    <input type="checkbox" checked={conPromo} onChange={e => setConPromo(e.target.checked)} />
                    <span>
                      Entra con la promo {datos.promo.codigo}: 10% en alquiler y ToshiPass por los días hasta
                      el {formatFecha(datos.promo.fechaFin)} (conductor nuevo, licencia B1 o D1)
                    </span>
                  </label>
                )}
                <label className="calc-check">
                  <input type="checkbox" checked={esReferido} onChange={e => setEsReferido(e.target.checked)} />
                  <span>Viene referido por un conductor: 5% del alquiler en su primera semana</span>
                </label>
                {esReferido && (
                  <p className="calc-fuente calc-check-nota">
                    El conductor que lo refirió cobra $35.000 cuando el referido cumple 7 días seguidos de
                    trabajo y otros $35.000 a los 35 días. Ese bono no cambia lo que paga el referido.
                  </p>
                )}
              </div>
              {sinTarifa && (
                <div className="calc-aviso">
                  No hay una tarifa nueva activa para esta modalidad en Conceptos de facturación. Cargá el alquiler en Supuestos.
                </div>
              )}

              <div className="calc-cols">
                <section className="calc-bloque">
                  <h3>Semana normal</h3>
                  <div className="calc-fila calc-fila-fuerte">
                    <span>Genera en Cabify, app + efectivo ({formatNumero(dias * horas, 1)} h)</span>
                    <span>{plata(resultado.normal.facturacion)}</span>
                  </div>
                  <FilaCosto etiqueta="Combustible GNC" valor={resultado.normal.combustible} />
                  <FilaCosto etiqueta="Peajes" valor={resultado.normal.peajes} />
                  <FilaCosto etiqueta="Nafta para la bomba" valor={resultado.normal.nafta} />
                  <FilaCosto etiqueta={`Alquiler${tarifa?.periodo ? ` (tarifa ${tarifa.periodo})` : ''}`} valor={supuestos.alquilerSemana} />
                  <FilaCosto etiqueta="ToshiPass" valor={supuestos.toshipassSemana} />
                  <FilaCosto etiqueta="Monotributo (parte semanal)" valor={resultado.normal.monotributo} />
                  {resultado.normal.lavado > 0 && <FilaCosto etiqueta="Lavado" valor={resultado.normal.lavado} />}
                  {resultado.normal.otros > 0 && <FilaCosto etiqueta="Otros gastos" valor={resultado.normal.otros} />}
                  <div className="calc-fila calc-total">
                    <span>Le queda por semana</span>
                    <span className={resultado.normal.netoSemana < 0 ? 'calc-negativo' : 'calc-positivo'}>{plata(resultado.normal.netoSemana)}</span>
                  </div>
                  <div className="calc-fila calc-total">
                    <span>Le queda por mes</span>
                    <span className={resultado.normal.netoMes < 0 ? 'calc-negativo' : 'calc-positivo'}>{plata(resultado.normal.netoMes)}</span>
                  </div>

                  {descuentos && descuentos.total > 0 && (
                    <div className="calc-primera">
                      <TituloConAyuda titulo="Primera semana, con descuentos" nivel="h4">
                        Los descuentos de ingreso valen solo al empezar. Desde la segunda semana paga la tarifa
                        completa, por eso el mes y las semanas flojas o buenas se calculan sin descuentos.
                      </TituloConAyuda>
                      {descuentos.promoAlquiler > 0 && (
                        <FilaCosto
                          signo="+"
                          etiqueta={`Promo ${datos.promo?.codigo}: 10% del alquiler (${descuentos.diasPromo} ${descuentos.diasPromo === 1 ? 'día' : 'días'})`}
                          valor={descuentos.promoAlquiler}
                        />
                      )}
                      {descuentos.promoToshipass > 0 && (
                        <FilaCosto signo="+" etiqueta={`Promo ${datos.promo?.codigo}: 10% del ToshiPass`} valor={descuentos.promoToshipass} />
                      )}
                      {descuentos.referido > 0 && (
                        <FilaCosto signo="+" etiqueta="Referido: 5% del alquiler" valor={descuentos.referido} />
                      )}
                      <div className="calc-fila calc-total">
                        <span>Le queda la primera semana</span>
                        <span className={resultado.normal.netoSemana + descuentos.total < 0 ? 'calc-negativo' : 'calc-positivo'}>
                          {plata(resultado.normal.netoSemana + descuentos.total)}
                        </span>
                      </div>
                    </div>
                  )}
                </section>

                <div className="calc-col">
                <section className="calc-bloque">
                  <h3>Lo que tiene que saber</h3>
                  <div className="calc-fila">
                    <span>Horas por día para cubrir los costos fijos</span>
                    <strong>{fmtHoras(resultado.normal.horasCubrirFijos)}</strong>
                  </div>
                  <div className="calc-fila">
                    <span>Horas por día para llegar a {plata(supuestos.metaMes)} por mes</span>
                    <strong>{fmtHoras(resultado.horasMeta)}</strong>
                  </div>
                  {turnoAplica && (
                    <div className="calc-fila">
                      <span>¿La meta entra en el turno de {formatNumero(supuestos.horasMaxTurno)} h?</span>
                      <strong className={resultado.metaEntraEnTurno ? 'calc-positivo' : 'calc-negativo'}>
                        {resultado.metaEntraEnTurno ? 'Sí' : 'No'}
                      </strong>
                    </div>
                  )}
                  {datos.cabify.horasSemana !== null && datos.cabify.generadoSemana !== null && (
                    <p className="calc-fuente calc-realidad">
                      Hoy, con el auto toda la semana, los conductores se conectan en promedio{' '}
                      <strong>{formatNumero(datos.cabify.horasSemana)} h por semana</strong> y generan{' '}
                      <strong>{plata(datos.cabify.generadoSemana)}</strong>.
                    </p>
                  )}
                  <div className={`calc-diagnostico calc-diag-${resultado.diagnostico}`}>
                    {resultado.diagnostico === 'deuda' && (
                      <>
                        No cubre los costos: genera {plata(resultado.deudaSemanal)} de deuda por semana y llega al tope
                        de {plata(supuestos.topeDeuda)} en {formatNumero(resultado.semanasHastaTope ?? 0, 1)} semanas.
                        La cuota máxima de un plan de pago es {plata(supuestos.cuotaMaxPlan)}.
                      </>
                    )}
                    {resultado.diagnostico === 'justo' && 'Cubre con poco margen: una semana floja genera deuda.'}
                    {resultado.diagnostico === 'ok' && 'Cubre los costos con un margen razonable.'}
                  </div>
                </section>

                <section className="calc-bloque">
                  <TituloConAyuda titulo="Hay semanas flojas">
                    Cada semana genera distinto según los viajes que haya. Normal: el promedio por hora
                    ({plata(supuestos.factHora)}). Floja: {formatNumero(100 - supuestos.pctFloja)}% menos. Buena: {formatNumero(supuestos.pctBuena - 100)}% más.
                    Con las mismas horas; los gastos fijos se pagan igual.
                  </TituloConAyuda>
                  <div className="calc-escenarios">
                    <Escenario titulo="Floja" r={resultado.floja} />
                    <Escenario titulo="Normal" r={resultado.normal} />
                    <Escenario titulo="Buena" r={resultado.buena} />
                  </div>
                </section>
                </div>
              </div>

              <div className="calc-decir">
                <div>
                  <strong>Decir:</strong> "Para cubrir los costos fijos necesitás unas {fmtHoras(resultado.normal.horasCubrirFijos)} por día;
                  lo que manejes por encima de eso es tu ganancia."
                </div>
                <div>
                  <strong>No decir:</strong> lo que genera en Cabify como si fuera lo que le queda, "hasta {plata(supuestos.metaMes)} por mes" sin
                  las horas que hacen falta, ni que puede cobrar en la cuenta de otra persona.
                </div>
              </div>

              <button type="button" className="calc-toggle" onClick={() => setVerSupuestos(v => !v)} aria-expanded={verSupuestos}>
                {verSupuestos ? 'Ocultar supuestos' : 'Ver supuestos de la cuenta'}
                {modificados.length > 0 && <span className="calc-modificados"> ({modificados.length} ajustados)</span>}
              </button>

              {verSupuestos && (
                <section className="calc-bloque calc-supuestos">
                  <p className="calc-fuente">
                    Lo que genera por hora trabajada (app + efectivo), km por hora y peajes:{' '}
                    {datos.cabify.semanas > 0
                      ? <>promedio de {datos.cabify.semanas} semanas completas (auto asignado los 7 días) de {datos.cabify.conductores} conductores
                        en Cabify{datos.cabify.tabla === 'cabify_historico_bariloche' ? ' Bariloche' : ''}, del {formatFecha(datos.cabify.desde)} al {formatFecha(datos.cabify.hasta)}.
                        Por hora = todo lo generado ÷ todas las horas conectadas.</>
                      : <>no hay semanas de Cabify para {sedeActual?.nombre || 'esta sede'}; se usan los valores de referencia.</>}
                    {' '}Alquiler y ToshiPass: Conceptos de facturación{tarifa?.periodo ? `, tarifa ${tarifa.periodo}` : ''}, con IVA.
                  </p>
                  <div className="calc-supuestos-grid">
                    {CAMPOS.map(c => (
                      <label key={c.campo} className="calc-campo">
                        <span>{c.etiqueta} <em>{c.unidad}</em></span>
                        <input
                          type="number" inputMode="decimal" min={0}
                          value={supuestos[c.campo]}
                          onChange={e => {
                            const n = Number(e.target.value)
                            setSupuestos(s => (s ? { ...s, [c.campo]: Number.isFinite(n) ? n : 0 } : s))
                          }}
                        />
                      </label>
                    ))}
                  </div>
                  <div className="calc-supuestos-acciones">
                    <button
                      type="button" className="btn-secondary btn-sm"
                      disabled={modificados.length === 0}
                      onClick={() => iniciales && setSupuestos(iniciales)}
                    >
                      <RotateCcw size={14} /> Volver a los valores de ToshiBase
                    </button>
                    {esAdmin && (
                      <button
                        type="button" className="btn-primary btn-sm"
                        disabled={guardables.length === 0 || guardando}
                        onClick={guardarSupuestos}
                        title="Alquiler, ToshiPass y los datos de Cabify no se guardan acá: salen de Conceptos de facturación y de Cabify"
                      >
                        {guardando ? 'Guardando...' : 'Guardar como referencia'}
                      </button>
                    )}
                  </div>
                  <p className="calc-fuente">
                    Los cambios valen solo para esta cuenta.{esAdmin ? ' "Guardar como referencia" los deja para todos (no aplica a alquiler, ToshiPass ni a los datos de Cabify).' : ''}
                  </p>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
