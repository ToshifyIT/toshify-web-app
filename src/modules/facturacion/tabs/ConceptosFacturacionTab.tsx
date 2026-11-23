import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../../lib/supabase'
import { Alerta } from '../../../components/ui/alertas'
import { showError, showSuccess } from '../../../utils/toast'
import { Plus, Edit2, Trash2 } from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../../../components/ui/DataTable'
import type { ConceptoFacturacion } from '../../../types/facturacion.types'
import { formatCurrency, TIPOS_CONCEPTO, TIPOS_PARAMETRO } from '../../../types/facturacion.types'

import { hoyART, fechaLocalISO } from '../../../utils/fechaArgentina'
import { ActionsMenu } from '../../../components/ui/ActionsMenu'
import { ExcelColumnFilter } from '../../../components/ui/DataTable/ExcelColumnFilter'
import { TurnoBadge } from '../../../components/ui/TurnoBadge'

/** Alquileres por turno (mismos códigos que onboarding/tarifaConceptos.ts), con y sin GNC. */
const CODIGOS_DIURNO = new Set(['P001', 'P014', 'P021', 'P024'])
const CODIGOS_NOCTURNO = new Set(['P013', 'P015', 'P023', 'P025'])

/**
 * Modalidades de un concepto. Turno se abre en DIURNO / NOCTURNO: el alquiler de cada turno
 * dice cuál es (código o descripción); un concepto de turno que no es de uno solo vale para los dos.
 */
function modalidadesConcepto(c: ConceptoFacturacion): string[] {
  const desc = (c.descripcion || '').toUpperCase()
  const turnos = !c.aplica_turno ? []
    : CODIGOS_NOCTURNO.has(c.codigo) || desc.includes('NOCTURNO') ? ['NOCTURNO']
      : CODIGOS_DIURNO.has(c.codigo) || desc.includes('DIURNO') ? ['DIURNO']
        : ['DIURNO', 'NOCTURNO']
  return c.aplica_cargo ? [...turnos, 'CARGO'] : turnos
}
const HTML_CAMPO_PRECIO_BASE = `
          <div class="fact-form-row" id="swal-base-group">
            <div class="fact-form-group">
              <label class="fact-form-label">Precio Base Diario (Sin IVA)</label>
              <input id="swal-precio-base" type="number" class="fact-form-input" value="0" step="0.01">
            </div>
            <div class="fact-form-group">
              <label class="fact-form-label">Precio Base Diario (Con IVA)</label>
              <input id="swal-base-con-iva" type="number" class="fact-form-input" value="0" step="0.01">
            </div>
          </div>`

// ---------------------------------------------------------------------------
// Vigencia de conceptos (alquileres, garantía: lo que se firma en el contrato).
// Varias versiones conviven; cada una lleva su período ("ENE-26"). En los
// conceptos nuevos el período sale del mes de "Vigente desde" y se agrega al
// final del nombre, porque varias pantallas (facturación, garantías, exceso de
// km) todavía lo leen de ahí.
// ---------------------------------------------------------------------------

const MESES_PERIODO = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC']
const RE_SUFIJO_PERIODO = /\s+[A-Za-zÁÉÍÓÚÑ]{3}-\d{2}$/

/** "2026-01-05" -> "ENE-26". Vacío si la fecha no es válida. */
function periodoDeFecha(fecha: string): string {
  const [anio, mes] = (fecha || '').split('-')
  const nombreMes = MESES_PERIODO[Number(mes) - 1]
  return nombreMes && anio?.length === 4 ? `${nombreMes}-${anio.slice(2)}` : ''
}

/** "2026-01-05" -> "05/01/26". */
function fechaCorta(fecha: string | null | undefined): string {
  if (!fecha) return ''
  const [a, m, d] = fecha.slice(0, 10).split('-')
  return `${d}/${m}/${a.slice(2)}`
}

function htmlVigencia(opts: { tiene: boolean; desde: string; hasta: string; periodo: string }) {
  return `
          <div class="fact-form-checkboxes">
            <label class="fact-checkbox-label">
              <input id="swal-tiene-vig" type="checkbox" class="fact-checkbox" ${opts.tiene ? 'checked' : ''}> Tiene vigencia (se firma en el contrato)
            </label>
          </div>
          <div id="swal-vig-group" style="${opts.tiene ? '' : 'display:none;'}">
            <div class="fact-form-row">
              <div class="fact-form-group">
                <label class="fact-form-label">Vigente desde</label>
                <input id="swal-vig-desde" type="date" class="fact-form-input" value="${opts.desde}">
              </div>
              <div class="fact-form-group">
                <label class="fact-form-label">Vigente hasta</label>
                <input id="swal-vig-hasta" type="date" class="fact-form-input" value="${opts.hasta}">
              </div>
            </div>
            <small style="color: var(--text-tertiary); font-size: 11px; display: block;">
              Período: <strong id="swal-vig-periodo" style="color: var(--text-primary);">${opts.periodo || '—'}</strong>.
              Sin fecha "hasta" = sin vencimiento.
            </small>
          </div>`
}

/** Lee el bloque de vigencia. Devuelve un mensaje de error o los valores. */
function leerVigencia(periodoActual: string): string | { tiene: boolean; desde: string | null; hasta: string | null; periodo: string | null } {
  const tiene = (document.getElementById('swal-tiene-vig') as HTMLInputElement | null)?.checked || false
  if (!tiene) return { tiene: false, desde: null, hasta: null, periodo: null }
  const desde = (document.getElementById('swal-vig-desde') as HTMLInputElement).value
  const hasta = (document.getElementById('swal-vig-hasta') as HTMLInputElement).value
  if (!desde) return 'Cargá "Vigente desde"'
  if (hasta && hasta < desde) return '"Vigente hasta" no puede ser anterior a "Vigente desde"'
  const periodo = periodoActual || periodoDeFecha(desde)
  if (!periodo) return 'No se pudo calcular el período de "Vigente desde"'
  return { tiene: true, desde, hasta: hasta || null, periodo }
}

/**
 * Mantiene el bloque de vigencia: muestra/oculta las fechas con el check y
 * recalcula el período al cambiar "desde". `periodoFijo` (edición) se respeta
 * mientras no se toque la fecha original (ej. OCT-26 arrancó el 04/09).
 * Devuelve una función que da el período vigente en pantalla.
 */
function instalarVigencia(opts: { desdeOriginal?: string; periodoFijo?: string; onToggle?: () => void }) {
  const check = document.getElementById('swal-tiene-vig') as HTMLInputElement
  const grupo = document.getElementById('swal-vig-group') as HTMLDivElement
  const desde = document.getElementById('swal-vig-desde') as HTMLInputElement
  const etiqueta = document.getElementById('swal-vig-periodo') as HTMLElement
  const periodo = () => {
    if (opts.periodoFijo && desde.value === (opts.desdeOriginal || '')) return opts.periodoFijo
    return periodoDeFecha(desde.value)
  }
  const pintar = () => {
    grupo.style.display = check.checked ? '' : 'none'
    etiqueta.textContent = periodo() || '—'
    opts.onToggle?.()
  }
  check.addEventListener('change', pintar)
  desde.addEventListener('input', pintar)
  desde.addEventListener('change', pintar)
  pintar()
  return periodo
}

/**
 * Mantiene sincronizados los cuatro importes del modal de concepto.
 *
 * Todo se deriva de UN solo numero: N = total por semana NETO (precio_semanal),
 * y del IVA. Con f = 1 + IVA/100:
 *
 *   Total por semana (Sin IVA) = N
 *   Total por semana (Con IVA) = N x f
 *   Precio Base Diario (Sin IVA) = N / 7
 *   Precio Base Diario (Con IVA) = N x f / 7
 *
 * Editar cualquiera de los cuatro despeja N y repinta los otros tres. Al tocar
 * el IVA manda N: se mantiene y se recalculan los dos campos "con IVA".
 *
 * N se despeja SIN redondear (solo se redondea a 2 decimales al pintar cada
 * campo). Es lo que hace que el valor tipeado sobreviva el ida y vuelta: si N
 * se redondeara al peso, escribir 299000 en el semanal con IVA volveria como
 * 298999.47 al releerlo desde precio_semanal.
 *
 * OJO con el guardado: en BD precio_final es DIARIO con IVA y precio_base es
 * DIARIO neto (asi los consume la facturacion, ver ReporteFacturacionTab:
 * "precio_unitario = precio DIARIO"). Cada preConfirm persiste esos dos campos
 * leyendo directamente sus inputs (#swal-base-con-iva y #swal-precio-base), no
 * recalculandolos desde #swal-precio: asi lo que se guarda es exactamente lo
 * que el usuario ve en pantalla.
 *
 * Notas de implementacion:
 * - Al abrir el modal solo se pintan los dos campos base; nunca se tocan los
 *   semanales, para no "corregir" conceptos historicos fuera de esta relacion.
 * - No aplica a Porcentaje ni Valor (el campo no es un importe) ni a los
 *   conceptos variables: ahi los campos base se ocultan.
 * - onPrecioChange se invoca tras cada recalculo porque asignar .value por JS no
 *   dispara el evento 'input': sin eso el selector de vigencia no aparece y el
 *   precio se guardaria sin escribir el historial.
 */
function instalarCalculoTarifa(onPrecioChange: () => void) {
  const byId = (id: string) => document.getElementById(id) as HTMLInputElement | null
  const semanaConIva = byId('swal-precio')
  const semanaSinIva = byId('swal-precio-semanal')
  const baseSinIva = byId('swal-precio-base')
  const baseConIva = byId('swal-base-con-iva')
  const iva = byId('swal-iva')
  const baseGroup = document.getElementById('swal-base-group') as HTMLDivElement | null
  const tipoParam = document.getElementById('swal-tipo-param') as HTMLSelectElement | null
  const variable = byId('swal-variable')
  if (!semanaConIva || !semanaSinIva || !iva) return

  const num = (el: HTMLInputElement | null) => (el ? parseFloat(el.value) || 0 : 0)
  const r2 = (n: number) => Number(n.toFixed(2))
  const factorIva = () => 1 + num(iva) / 100
  // Porcentaje y Valor no representan importes: mismo criterio que la etiqueta.
  const esImporte = () => tipoParam?.value !== 'porcentaje' && tipoParam?.value !== 'valor'
  const aplica = () => esImporte() && !variable?.checked

  const mostrarBases = () => {
    if (baseGroup) baseGroup.style.display = aplica() ? '' : 'none'
  }

  // Neto semanal actual. Si el concepto no tiene semanal cargado se despeja del
  // campo con IVA, para que los base no queden en cero.
  const netoSemanal = () => {
    const n = num(semanaSinIva)
    return n > 0 ? n : num(semanaConIva) / factorIva()
  }

  const pintarBases = () => {
    const f = factorIva()
    if (aplica()) {
      const n = netoSemanal()
      if (baseSinIva) baseSinIva.value = r2(n / 7).toString()
      if (baseConIva) baseConIva.value = r2((n * f) / 7).toString()
    } else if (baseSinIva) {
      baseSinIva.value = r2(num(semanaConIva) / f).toString()
    }
  }

  type Origen = 'baseSin' | 'baseCon' | 'semanaCon' | 'semanaSin' | 'iva'

  const sincronizar = (origen: Origen) => {
    mostrarBases()
    if (aplica()) {
      const f = factorIva()
      // N = total semanal neto, SIN redondear: se conserva toda la precision
      // para que al re-derivar los otros campos no se pierdan centavos.
      let n: number
      if (origen === 'baseSin') n = num(baseSinIva) * 7
      else if (origen === 'baseCon') n = (num(baseConIva) * 7) / f
      else if (origen === 'semanaCon') n = num(semanaConIva) / f
      else n = num(semanaSinIva)

      // El campo que el usuario esta escribiendo no se toca. Los otros tres se
      // pintan a 2 decimales, que es la precision con la que se persisten.
      if (origen !== 'semanaSin') semanaSinIva.value = r2(n).toString()
      if (origen !== 'semanaCon') semanaConIva.value = r2(n * f).toString()
      if (baseSinIva && origen !== 'baseSin') baseSinIva.value = r2(n / 7).toString()
      if (baseConIva && origen !== 'baseCon') baseConIva.value = r2((n * f) / 7).toString()
    } else {
      pintarBases()
    }
    onPrecioChange()
  }

  baseSinIva?.addEventListener('input', () => sincronizar('baseSin'))
  baseConIva?.addEventListener('input', () => sincronizar('baseCon'))
  semanaConIva.addEventListener('input', () => sincronizar('semanaCon'))
  semanaSinIva.addEventListener('input', () => sincronizar('semanaSin'))
  iva.addEventListener('input', () => sincronizar('iva'))
  tipoParam?.addEventListener('change', mostrarBases)
  variable?.addEventListener('change', mostrarBases)

  mostrarBases()
  pintarBases()
}

export function ConceptosFacturacionTab() {
  const [conceptos, setConceptos] = useState<ConceptoFacturacion[]>([])
  const [loading, setLoading] = useState(true)

  // Estados para filtros Excel
  const [openColumnFilter, setOpenColumnFilter] = useState<string | null>(null)
  const [tipoFilter, setTipoFilter] = useState<string[]>([])
  const [activoFilter, setActivoFilter] = useState<string[]>([])
  const [modalidadFilter, setModalidadFilter] = useState<string[]>([])

  useEffect(() => {
    cargarConceptos()
  }, [])

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    if (!openColumnFilter) return
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.dt-column-filter-dropdown') && !target.closest('.dt-column-filter-btn') && !target.closest('.dt-filter-dropdown') && !target.closest('.dt-filter-btn')) {
        setOpenColumnFilter(null)
      }
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [openColumnFilter])

  // Datos filtrados
  const conceptosFiltrados = useMemo(() => {
    return conceptos.filter(c => {
      if (tipoFilter.length > 0 && !tipoFilter.includes(c.tipo)) return false
      if (activoFilter.length > 0) {
        const estado = c.activo ? 'activo' : 'inactivo'
        if (!activoFilter.includes(estado)) return false
      }
      // Entra si tiene alguna de las modalidades elegidas (un concepto de las tres aparece en todas)
      if (modalidadFilter.length > 0 && !modalidadesConcepto(c).some(m => modalidadFilter.includes(m))) return false
      return true
    })
  }, [conceptos, tipoFilter, activoFilter, modalidadFilter])

  async function cargarConceptos(silent = false) {
    if (!silent) setLoading(true)
    try {
      const { data, error } = await supabase
        .from('conceptos_nomina')
        .select('*')
        .order('orden', { ascending: true })

      if (error) throw error
      setConceptos(data || [])
    } catch {
      // silently ignored
    } finally {
      setLoading(false)
    }
  }

  async function crearConcepto() {
    const tiposOptions = TIPOS_CONCEPTO.map(t =>
      `<option value="${t.value}">${t.label}</option>`
    ).join('')
    const tiposParamOptions = TIPOS_PARAMETRO.map(t =>
      `<option value="${t.value}">${t.label}</option>`
    ).join('')
    let periodoEnPantalla: () => string = () => ''

    const { value: formValues } = await Alerta.fire({
      title: 'Nuevo Concepto',
      html: `
        <div class="fact-modal-form">
          <div class="fact-form-group">
            <label class="fact-form-label">Código</label>
            <input id="swal-codigo" type="text" class="fact-form-input" placeholder="Ej: P013">
          </div>
          <div class="fact-form-group">
            <label class="fact-form-label">Descripción</label>
            <input id="swal-desc" type="text" class="fact-form-input" placeholder="Descripción del concepto">
          </div>
          <div class="fact-form-row">
            <div class="fact-form-group">
              <label class="fact-form-label">Tipo</label>
              <select id="swal-tipo" class="fact-form-select">
                ${tiposOptions}
              </select>
            </div>
            <div class="fact-form-group">
              <label class="fact-form-label">Tipo Parámetro</label>
              <select id="swal-tipo-param" class="fact-form-select">
                ${tiposParamOptions}
              </select>
            </div>
          </div>
          ${HTML_CAMPO_PRECIO_BASE}
          <div class="fact-form-row">
            <div class="fact-form-group">
              <label id="swal-precio-label" class="fact-form-label">Total por semana (Con IVA)</label>
              <input id="swal-precio" type="number" class="fact-form-input" placeholder="0" step="0.01">
            </div>
            <div class="fact-form-group">
              <label class="fact-form-label">IVA (%)</label>
              <input id="swal-iva" type="number" class="fact-form-input" value="0" step="0.01">
            </div>
          </div>
          <div class="fact-form-group" id="swal-semanal-group">
            <label class="fact-form-label">Total por semana (Sin IVA)</label>
            <input id="swal-precio-semanal" type="number" class="fact-form-input" placeholder="Ej: 299000" step="0.01">
            <small style="color: var(--text-tertiary); font-size: 11px; margin-top: 4px; display: block;">Monto que se factura por semana completa (7 días). Si queda en 0 se usa Precio × 7.</small>
          </div>
          <div class="fact-form-checkboxes">
            <label class="fact-checkbox-label">
              <input id="swal-variable" type="checkbox" class="fact-checkbox"> Es monto variable
            </label>
            <label class="fact-checkbox-label">
              <input id="swal-turno" type="checkbox" class="fact-checkbox" checked> Aplica a TURNO
            </label>
            <label class="fact-checkbox-label">
              <input id="swal-cargo" type="checkbox" class="fact-checkbox" checked> Aplica a CARGO
            </label>
          </div>
          ${htmlVigencia({ tiene: true, desde: hoyART(), hasta: '', periodo: periodoDeFecha(hoyART()) })}
          <small style="color: var(--text-tertiary); font-size: 11px; margin-top: 8px; display: block;">Si tiene vigencia, el período se agrega solo al final de la descripción.</small>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Crear',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#ff0033',
      cancelButtonColor: '#6B7280',
      width: 400,
      customClass: {
        popup: 'fact-modal',
        title: 'fact-modal-title',
        htmlContainer: 'fact-modal-content',
        confirmButton: 'fact-btn-confirm',
        cancelButton: 'fact-btn-cancel'
      },
      didOpen: () => {
        const tipoParamSelect = document.getElementById('swal-tipo-param') as HTMLSelectElement
        const precioLabel = document.getElementById('swal-precio-label') as HTMLLabelElement
        const updatePrecioLabel = () => {
          const val = tipoParamSelect.value
          const esVar = (document.getElementById('swal-variable') as HTMLInputElement | null)?.checked
          precioLabel.textContent = val === 'porcentaje' ? 'Valor (%)'
            : val === 'valor' ? 'Valor'
            : esVar ? 'Precio Final (Con IVA)'
            : 'Total por semana (Con IVA)'
        }
        updatePrecioLabel()
        tipoParamSelect.addEventListener('change', updatePrecioLabel)

        // Mostrar/ocultar "Precio Semanal" según "Es monto variable"
        const variableCheck = document.getElementById('swal-variable') as HTMLInputElement
        const semanalGroup = document.getElementById('swal-semanal-group') as HTMLDivElement
        const toggleSemanal = () => {
          semanalGroup.style.display = variableCheck.checked ? 'none' : 'block'
          updatePrecioLabel()
        }
        toggleSemanal()
        variableCheck.addEventListener('change', toggleSemanal)

        // Precio <-> Precio Semanal <-> Precio base
        instalarCalculoTarifa(() => { /* el alta no tiene selector de vigencia */ })

        // Vigencia: marcada por defecto solo en alquileres.
        const tipoSelect = document.getElementById('swal-tipo') as HTMLSelectElement
        const tieneVig = document.getElementById('swal-tiene-vig') as HTMLInputElement
        tieneVig.checked = tipoSelect.value === 'alquiler'
        periodoEnPantalla = instalarVigencia({})
        tipoSelect.addEventListener('change', () => {
          tieneVig.checked = tipoSelect.value === 'alquiler'
          tieneVig.dispatchEvent(new Event('change'))
        })
      },
      preConfirm: () => {
        const codigo = (document.getElementById('swal-codigo') as HTMLInputElement).value
        const descripcion = (document.getElementById('swal-desc') as HTMLInputElement).value
        const tipo = (document.getElementById('swal-tipo') as HTMLSelectElement).value
        const tipoParametro = (document.getElementById('swal-tipo-param') as HTMLSelectElement).value
        const valorCampoPrecio = parseFloat((document.getElementById('swal-precio') as HTMLInputElement).value) || 0
        const ivaPorcentaje = parseFloat((document.getElementById('swal-iva') as HTMLInputElement).value) || 0
        const precioSemanal = parseFloat((document.getElementById('swal-precio-semanal') as HTMLInputElement).value) || 0
        const esVariable = (document.getElementById('swal-variable') as HTMLInputElement).checked
        const aplicaTurno = (document.getElementById('swal-turno') as HTMLInputElement).checked
        const aplicaCargo = (document.getElementById('swal-cargo') as HTMLInputElement).checked

        if (!codigo || !descripcion) {
          Alerta.showValidationMessage('Código y descripción son requeridos')
          return false
        }

        // es_semanal (oculto): true cuando no es variable y tiene precio semanal > 0
        const esSemanal = !esVariable && precioSemanal > 0

        // Los campos diarios se persisten TAL CUAL estan en pantalla: el que el
        // usuario edito quedo literal y los otros ya los derivo (sin redondeo)
        // instalarCalculoTarifa. Porcentaje / Valor / variables no usan los
        // campos base: ahi precio_final es el valor tal cual y precio_base se
        // despeja del IVA, igual que antes.
        const usaSemanal = tipoParametro !== 'porcentaje' && tipoParametro !== 'valor' && !esVariable
        const baseSinIvaInput = parseFloat((document.getElementById('swal-precio-base') as HTMLInputElement).value) || 0
        const baseConIvaInput = parseFloat((document.getElementById('swal-base-con-iva') as HTMLInputElement).value) || 0
        const newFinal = usaSemanal ? baseConIvaInput : valorCampoPrecio
        const newBase = usaSemanal
          ? baseSinIvaInput
          : (ivaPorcentaje === 0 ? newFinal : Number((newFinal / (1 + ivaPorcentaje / 100)).toFixed(2)))

        const codigoFinal = codigo.trim().toUpperCase()
        const codigosExistentes = new Set(conceptos.map(c => c.codigo.toUpperCase()))
        if (codigosExistentes.has(codigoFinal)) {
          Alerta.showValidationMessage(`El código ${codigoFinal} ya existe`)
          return false
        }

        const vig = leerVigencia(periodoEnPantalla())
        if (typeof vig === 'string') {
          Alerta.showValidationMessage(vig)
          return false
        }
        // El período va al final del nombre: otras pantallas lo leen de ahí.
        const nombreBase = descripcion.trim().replace(RE_SUFIJO_PERIODO, '')
        const conPeriodo = (nombre: string) => vig.periodo ? `${nombre} ${vig.periodo}` : nombre

        const principal = {
          codigo: codigoFinal,
          descripcion: conPeriodo(nombreBase),
          tipo,
          tipo_parametro: tipoParametro,
          precio_base: newBase,
          iva_porcentaje: ivaPorcentaje,
          precio_final: newFinal,
          precio_semanal: esVariable ? 0 : precioSemanal,
          es_semanal: esSemanal,
          es_variable: esVariable,
          aplica_turno: aplicaTurno,
          aplica_cargo: aplicaCargo,
          activo: true,
          orden: conceptos.length + 1,
          tiene_vigencia: vig.tiene,
          vigente_desde: vig.desde,
          vigente_hasta: vig.hasta,
          periodo: vig.periodo,
        }

        return principal
      }
    })

    if (!formValues) return

    try {
      const { error } = await (supabase.from('conceptos_nomina') as any).insert(formValues)
      if (error) throw error
      showSuccess('Concepto creado')
      cargarConceptos(true)
    } catch (error: any) {
      showError('Error', error.message || 'No se pudo crear el concepto')
    }
  }

  async function editarConcepto(concepto: ConceptoFacturacion) {
    const tiposOptions = TIPOS_CONCEPTO.map(t =>
      `<option value="${t.value}" ${concepto.tipo === t.value ? 'selected' : ''}>${t.label}</option>`
    ).join('')
    // El campo de precio muestra el TOTAL POR SEMANA con IVA. Se prefiere
    // precio_semanal x (1+IVA) sobre precio_final x 7 para no arrastrar el
    // redondeo del diario. Los variables / porcentaje / valor siguen mostrando
    // precio_final tal cual.
    const ivaConcepto = concepto.iva_porcentaje || 0
    const esImporteConcepto = concepto.tipo_parametro !== 'porcentaje' && concepto.tipo_parametro !== 'valor'
    const valorInicialCampoPrecio = (esImporteConcepto && !concepto.es_variable)
      ? Number((((concepto.precio_semanal || 0) > 0
          ? (concepto.precio_semanal || 0) * (1 + ivaConcepto / 100)
          : (concepto.precio_final || 0) * 7)).toFixed(2))
      : (concepto.precio_final || 0)

    const tiposParamOptions = TIPOS_PARAMETRO.map(t =>
      `<option value="${t.value}" ${concepto.tipo_parametro === t.value ? 'selected' : ''}>${t.label}</option>`
    ).join('')

    // Fecha por defecto para vigencia: hoy
    const hoyStr = hoyART()
    let periodoEnPantalla: () => string = () => concepto.periodo || ''

    const { value: formValues } = await Alerta.fire({
      title: 'Editar Concepto',
      html: `
        <div class="fact-modal-form">
          <div class="fact-form-group">
            <label class="fact-form-label">Código</label>
            <input id="swal-codigo" type="text" class="fact-form-input fact-input-disabled" value="${concepto.codigo}" disabled>
          </div>
          <div class="fact-form-group">
            <label class="fact-form-label">Descripción</label>
            <input id="swal-desc" type="text" class="fact-form-input" value="${concepto.descripcion}">
          </div>
          <div class="fact-form-row">
            <div class="fact-form-group">
              <label class="fact-form-label">Tipo</label>
              <select id="swal-tipo" class="fact-form-select">
                ${tiposOptions}
              </select>
            </div>
            <div class="fact-form-group">
              <label class="fact-form-label">Tipo Parámetro</label>
              <select id="swal-tipo-param" class="fact-form-select">
                ${tiposParamOptions}
              </select>
            </div>
          </div>
          ${HTML_CAMPO_PRECIO_BASE}
          <div class="fact-form-row">
            <div class="fact-form-group">
              <label id="swal-precio-label" class="fact-form-label">Total por semana (Con IVA)</label>
              <input id="swal-precio" type="number" class="fact-form-input" value="${valorInicialCampoPrecio}" step="0.01">
            </div>
            <div class="fact-form-group">
              <label class="fact-form-label">IVA (%)</label>
              <input id="swal-iva" type="number" class="fact-form-input" value="${concepto.iva_porcentaje || 0}" step="0.01">
            </div>
          </div>
          <div class="fact-form-group" id="swal-semanal-group" style="${concepto.es_variable ? 'display:none;' : ''}">
            <label class="fact-form-label">Total por semana (Sin IVA)</label>
            <input id="swal-precio-semanal" type="number" class="fact-form-input" value="${concepto.precio_semanal || 0}" step="0.01" placeholder="Ej: 299000">
            <small style="color: var(--text-tertiary); font-size: 11px; margin-top: 4px; display: block;">Monto que se factura por semana completa (7 días). Si queda en 0 se usa Precio × 7.</small>
          </div>
          <div class="fact-form-group" id="swal-vigencia-group" style="display:none; margin-top: 8px; padding: 10px; background: var(--bg-tertiary); border-radius: 6px; border: 1px solid var(--border-primary);">
            <label class="fact-form-label" style="color: var(--color-primary); font-weight: 600;">El nuevo precio se cobra desde:</label>
            <input id="swal-vigencia" type="date" class="fact-form-input" value="${hoyStr}">
            <small style="color: var(--text-tertiary); font-size: 11px; margin-top: 4px; display: block;">El precio anterior se guardará en el historial hasta el día anterior a la fecha seleccionada.</small>
          </div>
          <div class="fact-form-checkboxes">
            <label class="fact-checkbox-label">
              <input id="swal-variable" type="checkbox" class="fact-checkbox" ${concepto.es_variable ? 'checked' : ''}> Es monto variable
            </label>
            <label class="fact-checkbox-label">
              <input id="swal-turno" type="checkbox" class="fact-checkbox" ${concepto.aplica_turno ? 'checked' : ''}> Aplica a TURNO
            </label>
            <label class="fact-checkbox-label">
              <input id="swal-cargo" type="checkbox" class="fact-checkbox" ${concepto.aplica_cargo ? 'checked' : ''}> Aplica a CARGO
            </label>
            <label class="fact-checkbox-label">
              <input id="swal-activo" type="checkbox" class="fact-checkbox" ${concepto.activo ? 'checked' : ''}> Activo
            </label>
          </div>
          ${htmlVigencia({
            tiene: !!concepto.tiene_vigencia,
            desde: concepto.vigente_desde || hoyStr,
            hasta: concepto.vigente_hasta || '',
            periodo: concepto.periodo || periodoDeFecha(concepto.vigente_desde || hoyStr),
          })}
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#ff0033',
      cancelButtonColor: '#6B7280',
      width: 450,
      customClass: {
        popup: 'fact-modal',
        title: 'fact-modal-title',
        htmlContainer: 'fact-modal-content',
        confirmButton: 'fact-btn-confirm',
        cancelButton: 'fact-btn-cancel'
      },
      didOpen: () => {
        // Mostrar selector de vigencia solo cuando el precio cambia
        const precioInput = document.getElementById('swal-precio') as HTMLInputElement
        const ivaInput = document.getElementById('swal-iva') as HTMLInputElement
        const vigenciaGroup = document.getElementById('swal-vigencia-group') as HTMLDivElement
        const checkPriceChange = () => {
          // Se compara contra el valor con el que abrio el modal: asi el chequeo
          // es correcto sin importar si el campo esta en semanal o en diario.
          const newPrice = parseFloat(precioInput.value) || 0
          vigenciaGroup.style.display = Math.abs(newPrice - valorInicialCampoPrecio) > 0.01 ? 'block' : 'none'
        }
        precioInput.addEventListener('input', checkPriceChange)
        ivaInput.addEventListener('input', checkPriceChange)

        // Dynamic label: Precio vs Valor based on tipo_parametro
        const tipoParamSelect = document.getElementById('swal-tipo-param') as HTMLSelectElement
        const precioLabel = document.getElementById('swal-precio-label') as HTMLLabelElement
        const updatePrecioLabel = () => {
          const val = tipoParamSelect.value
          const esVar = (document.getElementById('swal-variable') as HTMLInputElement | null)?.checked
          precioLabel.textContent = val === 'porcentaje' ? 'Valor (%)'
            : val === 'valor' ? 'Valor'
            : esVar ? 'Precio Final (Con IVA)'
            : 'Total por semana (Con IVA)'
        }
        updatePrecioLabel()
        tipoParamSelect.addEventListener('change', updatePrecioLabel)

        // Mostrar/ocultar "Precio Semanal" según "Es monto variable" (los variables no tienen semanal)
        const variableCheck = document.getElementById('swal-variable') as HTMLInputElement
        const semanalGroup = document.getElementById('swal-semanal-group') as HTMLDivElement
        const toggleSemanal = () => {
          semanalGroup.style.display = variableCheck.checked ? 'none' : 'block'
          updatePrecioLabel()
        }
        toggleSemanal()
        variableCheck.addEventListener('change', toggleSemanal)

        // Precio <-> Precio Semanal <-> Precio base. checkPriceChange se pasa
        // adrede: sin el, un precio recalculado no mostraria el selector de
        // vigencia y se guardaria sin escribir el historial de precios.
        instalarCalculoTarifa(checkPriceChange)

        // Vigencia: el período guardado se respeta mientras no se cambie "desde".
        periodoEnPantalla = instalarVigencia({
          desdeOriginal: concepto.vigente_desde || hoyStr,
          periodoFijo: concepto.periodo || '',
        })
      },
      preConfirm: () => {
        const descripcionEnPantalla = (document.getElementById('swal-desc') as HTMLInputElement).value.trim()
        const vig = leerVigencia(periodoEnPantalla())
        if (typeof vig === 'string') {
          Alerta.showValidationMessage(vig)
          return false
        }
        // Si cambió el período y el nombre terminaba con el anterior, se actualiza el sufijo.
        const periodoAnterior = concepto.periodo || ''
        const descripcion = vig.periodo && periodoAnterior && vig.periodo !== periodoAnterior
          && descripcionEnPantalla.toUpperCase().endsWith(` ${periodoAnterior}`)
          ? descripcionEnPantalla.replace(RE_SUFIJO_PERIODO, ` ${vig.periodo}`)
          : descripcionEnPantalla
        const tipo = (document.getElementById('swal-tipo') as HTMLSelectElement).value
        const tipoParametro = (document.getElementById('swal-tipo-param') as HTMLSelectElement).value
        const valorCampoPrecio = parseFloat((document.getElementById('swal-precio') as HTMLInputElement).value) || 0
        const ivaPorcentaje = parseFloat((document.getElementById('swal-iva') as HTMLInputElement).value) || 0
        const precioSemanal = parseFloat((document.getElementById('swal-precio-semanal') as HTMLInputElement).value) || 0
        const esVariable = (document.getElementById('swal-variable') as HTMLInputElement).checked
        const aplicaTurno = (document.getElementById('swal-turno') as HTMLInputElement).checked
        const aplicaCargo = (document.getElementById('swal-cargo') as HTMLInputElement).checked
        const activo = (document.getElementById('swal-activo') as HTMLInputElement).checked
        const vigenciaInput = document.getElementById('swal-vigencia') as HTMLInputElement
        const vigenciaValue = vigenciaInput?.value || ''

        if (!descripcion) {
          Alerta.showValidationMessage('La descripción es requerida')
          return false
        }

        // Los campos diarios se persisten TAL CUAL estan en pantalla: el que el
        // usuario edito quedo literal y los otros ya los derivo (sin redondeo)
        // instalarCalculoTarifa. precio_final sigue siendo el DIARIO con IVA que
        // consume el motor de facturacion. Porcentaje / Valor / variables no
        // usan los campos base: ahi precio_final es el valor tal cual y
        // precio_base se despeja del IVA, igual que antes.
        const usaSemanal = tipoParametro !== 'porcentaje' && tipoParametro !== 'valor' && !esVariable
        const baseSinIvaInput = parseFloat((document.getElementById('swal-precio-base') as HTMLInputElement).value) || 0
        const baseConIvaInput = parseFloat((document.getElementById('swal-base-con-iva') as HTMLInputElement).value) || 0
        const newFinal = usaSemanal ? baseConIvaInput : valorCampoPrecio
        const newBase = usaSemanal
          ? baseSinIvaInput
          : (ivaPorcentaje === 0 ? newFinal : Number((newFinal / (1 + ivaPorcentaje / 100)).toFixed(2)))
        const priceChanged = Math.abs(newFinal - (concepto.precio_final || 0)) > 0.01

        if (priceChanged && !vigenciaValue) {
          Alerta.showValidationMessage('Seleccioná desde qué fecha aplica el nuevo precio')
          return false
        }

        // es_semanal (oculto): true cuando el concepto no es variable y tiene precio semanal > 0
        const esSemanal = !esVariable && precioSemanal > 0

        return {
          descripcion,
          tipo,
          tipo_parametro: tipoParametro,
          precio_base: newBase,
          iva_porcentaje: ivaPorcentaje,
          precio_final: newFinal,
          precio_semanal: esVariable ? 0 : precioSemanal,
          es_semanal: esSemanal,
          es_variable: esVariable,
          aplica_turno: aplicaTurno,
          aplica_cargo: aplicaCargo,
          activo,
          tiene_vigencia: vig.tiene,
          vigente_desde: vig.desde,
          vigente_hasta: vig.hasta,
          periodo: vig.periodo,
          _priceChanged: priceChanged,
          _vigencia: vigenciaValue,
        }
      }
    })

    if (!formValues) return

    try {
      const priceChanged = formValues._priceChanged as boolean
      const vigencia = formValues._vigencia as string
      // Remove internal fields before sending to DB
      delete (formValues as any)._priceChanged
      delete (formValues as any)._vigencia

      // If price changed, save old price to historial first
      if (priceChanged && vigencia) {
        // vigencia = fecha exacta desde la que aplica el nuevo precio (YYYY-MM-DD)
        const hastaDate = new Date(vigencia + 'T00:00:00')
        hastaDate.setDate(hastaDate.getDate() - 1)
        const hasta = fechaLocalISO(hastaDate)

        const desde = concepto.updated_at
          ? concepto.updated_at.split('T')[0]
          : concepto.created_at?.split('T')[0] || vigencia

        // Ensure desde <= hasta
        const desdeDate = new Date(desde + 'T00:00:00')
        const finalDesde = desdeDate <= hastaDate ? desde : hasta

        const { error: histError } = await (supabase.from('conceptos_facturacion_historial') as any).insert({
          concepto_id: concepto.id,
          codigo: concepto.codigo,
          descripcion: concepto.descripcion,
          precio_base: concepto.precio_base,
          iva_porcentaje: concepto.iva_porcentaje,
          precio_final: concepto.precio_final,
          fecha_vigencia_desde: finalDesde,
          fecha_vigencia_hasta: hasta,
        })
        if (histError) throw histError
      }

      const { error } = await (supabase.from('conceptos_nomina') as any).update(formValues).eq('id', concepto.id)
      if (error) throw error
      showSuccess('Concepto actualizado')
      cargarConceptos(true)
    } catch (error: any) {
      showError('Error', error.message || 'No se pudo actualizar')
    }
  }

  async function eliminarConcepto(concepto: ConceptoFacturacion) {
    const result = await Alerta.fire({
      title: '¿Eliminar concepto?',
      text: `Se eliminará "${concepto.descripcion}"`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626'
    })

    if (!result.isConfirmed) return

    try {
      const { error } = await supabase.from('conceptos_nomina').delete().eq('id', concepto.id)
      if (error) throw error
      showSuccess('Eliminado')
      cargarConceptos(true)
    } catch (error: any) {
      showError('Error', error.message || 'No se pudo eliminar')
    }
  }

  const getTipoStyle = (tipo: string) => {
    const styles: Record<string, { bg: string; color: string }> = {
      'alquiler': { bg: '#3B82F6', color: 'white' },
      'cargo': { bg: '#EF4444', color: 'white' },
      'descuento': { bg: '#10B981', color: 'white' },
      'penalidad': { bg: '#F59E0B', color: 'white' },
      'ingreso': { bg: '#8B5CF6', color: 'white' }
    }
    return styles[tipo] || { bg: '#6B7280', color: 'white' }
  }

  const columns = useMemo<ColumnDef<ConceptoFacturacion>[]>(() => [
    {
      accessorKey: 'codigo',
      header: 'Código',
      cell: ({ row }) => (
        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }}>{row.original.codigo}</span>
      )
    },
    {
      accessorKey: 'descripcion',
      header: 'Descripción',
      // Sin "expand": estiraba esta columna y dejaba un hueco vacío antes de Tipo
      size: 320,
      cell: ({ row }) => <span style={{ whiteSpace: 'normal', fontWeight: 500 }}>{row.original.descripcion}</span>
    },
    {
      accessorKey: 'tipo',
      header: () => (
        <ExcelColumnFilter
          label="Tipo"
          options={TIPOS_CONCEPTO.map(t => ({ value: t.value, label: t.label }))}
          selectedValues={tipoFilter}
          onSelectionChange={setTipoFilter}
          filterId="tipo"
          openFilterId={openColumnFilter}
          onOpenChange={setOpenColumnFilter}
        />
      ),
      cell: ({ row }) => {
        const tipo = row.original.tipo
        const style = getTipoStyle(tipo)
        const label = TIPOS_CONCEPTO.find(t => t.value === tipo)?.label || tipo
        const tp = row.original.tipo_parametro || 'monto'
        const infoParam = TIPOS_PARAMETRO.find(t => t.value === tp)
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
            <span style={{
              padding: '2px 8px',
              borderRadius: 'var(--radius-xs)',
              fontSize: '11px',
              fontWeight: 600,
              backgroundColor: style.bg,
              color: style.color
            }}>
              {label}
            </span>
            <span style={{ fontSize: '10px', color: infoParam?.color || 'var(--text-tertiary)' }}>
              {infoParam?.label || tp}
            </span>
          </div>
        )
      }
    },
    {
      // precio_base = diario sin IVA; precio_final = diario con IVA (así lo usa la facturación)
      accessorKey: 'precio_base',
      header: 'Diario',
      cell: ({ row }) => row.original.es_variable
        ? <span style={{ color: '#6B7280', fontStyle: 'italic' }}>Variable</span>
        : (
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
            <span style={{ fontWeight: 600 }}>{formatCurrency(row.original.precio_base || 0)}</span>
            <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>{formatCurrency(row.original.precio_final || 0)} con IVA</span>
          </div>
        )
    },
    {
      id: 'total_semana',
      header: 'Semanal',
      // Sin IVA: precio_semanal de la BD (monto redondo), respaldo precio_final×7.
      // Con IVA: precio_semanal × (1 + IVA). Porcentaje / Valor no son importes semanales.
      accessorFn: (row) => row.es_variable ? null : (row.precio_semanal || Math.round((row.precio_final || 0) * 7)),
      cell: ({ row }) => {
        const c = row.original
        if (c.es_variable) return <span style={{ color: '#6B7280' }}>—</span>
        const esImporte = c.tipo_parametro !== 'porcentaje' && c.tipo_parametro !== 'valor'
        if (!esImporte) return <span style={{ color: '#6B7280' }}>—</span>
        const sinIva = c.precio_semanal || Math.round((c.precio_final || 0) * 7)
        const factor = 1 + (c.iva_porcentaje || 0) / 100
        const conIva = (c.precio_semanal || 0) > 0
          ? Number(((c.precio_semanal || 0) * factor).toFixed(2))
          : Number(((c.precio_final || 0) * 7).toFixed(2))
        return (
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
            <span style={{ fontWeight: 600 }}>{formatCurrency(sinIva)}</span>
            <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>{formatCurrency(conIva)} con IVA</span>
          </div>
        )
      }
    },
    {
      // Antes leía un campo "modalidad" que no existe: en el celular la tarjeta la ocultaba
      id: 'modalidad',
      accessorFn: (c) => modalidadesConcepto(c).join(' '),
      // Tres opciones fijas: el filtro automático armaba una por combinación ("DIURNO NOCTURNO CARGO")
      header: () => (
        <ExcelColumnFilter
          label="Modalidad"
          options={[
            { value: 'DIURNO', label: 'Diurno' },
            { value: 'NOCTURNO', label: 'Nocturno' },
            { value: 'CARGO', label: 'A cargo' },
          ]}
          selectedValues={modalidadFilter}
          onSelectionChange={setModalidadFilter}
          filterId="modalidad"
          openFilterId={openColumnFilter}
          onOpenChange={setOpenColumnFilter}
        />
      ),
      cell: ({ row }) => {
        const c = row.original
        const turnos = modalidadesConcepto(c)
        return (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {turnos.includes('DIURNO') && <TurnoBadge turno="diurno" size={16} />}
            {turnos.includes('NOCTURNO') && <TurnoBadge turno="nocturno" size={16} />}
            {c.aplica_cargo && <TurnoBadge turno="a_cargo" size={16} />}
          </div>
        )
      }
    },
    {
      // Solo los conceptos versionados (alquileres, garantía): período + desde/hasta.
      id: 'vigencia',
      header: 'Vigencia',
      accessorFn: (c) => c.tiene_vigencia ? `${c.periodo || ''} ${c.vigente_desde || ''}` : '',
      cell: ({ row }) => {
        const c = row.original
        if (!c.tiene_vigencia) return <span style={{ color: '#6B7280' }}>—</span>
        const vencida = !!c.vigente_hasta && c.vigente_hasta < hoyART()
        return (
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
            <span style={{ fontWeight: 600 }}>{c.periodo || '—'}</span>
            <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
              desde {fechaCorta(c.vigente_desde)}
            </span>
            <span style={{ fontSize: '10px', color: vencida ? '#DC2626' : 'var(--text-tertiary)' }}>
              {c.vigente_hasta ? `hasta ${fechaCorta(c.vigente_hasta)}` : 'sin vencimiento'}
            </span>
          </div>
        )
      }
    },
    {
      accessorKey: 'activo',
      header: () => (
        <ExcelColumnFilter
          label="Estado"
          options={[
            { value: 'activo', label: 'Activo' },
            { value: 'inactivo', label: 'Inactivo' }
          ]}
          selectedValues={activoFilter}
          onSelectionChange={setActivoFilter}
          filterId="activo"
          openFilterId={openColumnFilter}
          onOpenChange={setOpenColumnFilter}
        />
      ),
      cell: ({ row }) => (
        <span style={{
          padding: '2px 8px',
          borderRadius: 'var(--radius-full)',
          fontSize: '11px',
          fontWeight: 600,
          backgroundColor: row.original.activo ? '#DCFCE7' : '#FEE2E2',
          color: row.original.activo ? '#166534' : '#991B1B'
        }}>
          {row.original.activo ? 'Activo' : 'Inactivo'}
        </span>
      )
    },
    {
      id: 'acciones',
      header: 'Acciones',
      cell: ({ row }) => (
        <ActionsMenu
          actions={[
            { icon: <Edit2 size={15} />, label: 'Editar', onClick: () => editarConcepto(row.original), variant: 'info' },
            { icon: <Trash2 size={15} />, label: 'Eliminar', onClick: () => eliminarConcepto(row.original), variant: 'danger' },
          ]}
        />
      )
    }
  ], [tipoFilter, activoFilter, modalidadFilter, openColumnFilter])

  return (
    <DataTable
      data={conceptosFiltrados}
      columns={columns}
      loading={loading}
      searchPlaceholder="Buscar concepto..."
      emptyTitle="Sin conceptos"
      emptyDescription="No hay conceptos registrados"
      stickyLeftColumns={2}
      pageSize={100}
      pageSizeOptions={[10, 20, 50, 100]}
      headerAction={
        <button
          onClick={crearConcepto}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            background: '#ff0033',
            color: 'white',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer'
          }}
        >
          <Plus size={16}
        />
          Nuevo Concepto
        </button>
      }
    />
  )
}
