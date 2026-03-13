import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../../../lib/supabase'
import { useSede } from '../../../contexts/SedeContext'
import { useAuth } from '../../../contexts/AuthContext'
import { usePermissions } from '../../../contexts/PermissionsContext'
import Swal from 'sweetalert2'
import { showSuccess } from '../../../utils/toast'
import * as XLSX from 'xlsx'
import {
  Wallet,
  Users,
  AlertTriangle,
  Eye,
  // Plus,
  // DollarSign,
  Filter,
  Edit3,
  // UserPlus,
  Trash2,
  // Receipt,
  ArrowUpCircle,
  ArrowDownCircle,
  Banknote,
  Download,
  Upload,
  X
} from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../../../components/ui/DataTable'
import { format, startOfWeek, endOfWeek, parseISO } from 'date-fns'
import { VerLogsButton } from '../../../components/ui/VerLogsButton'
import { LoadingOverlay } from '../../../components/ui/LoadingOverlay'
import type { SaldoConductor } from '../../../types/facturacion.types'
import { insertControlSaldo } from '../../../services/controlSaldosService'

interface ConductorBasico {
  id: string
  nombres: string
  apellidos: string
}

interface CobroFraccionadoRow {
  id: string
  conductor_id: string
  monto_cuota: number
  numero_cuota: number
  total_cuotas: number
  semana: number
  anio: number
  aplicado: boolean
  conductor: { nombres: string; apellidos: string } | null
}

interface AbonoRow {
  id: string
  conductor_id: string
  fecha_abono: string
  tipo: string
  monto: number
  concepto: string
  referencia: string | null
  semana: number | null
  anio: number | null
  conductor_nombre?: string
}
import { formatCurrency, formatDate } from '../../../types/facturacion.types'

/** Calcula días calendario entre una fecha y hoy (sin considerar hora) */
function diasCalendario(desde: string | Date): number {
  const d = new Date(desde)
  d.setHours(0, 0, 0, 0)
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  return Math.max(0, Math.floor((hoy.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)))
}

export function SaldosAbonosTab() {
  const { sedeActualId, aplicarFiltroSede } = useSede()
  const { profile } = useAuth()
  const { isAdmin, isAdministrativo } = usePermissions()
  // Sub-tab activo
  // Sub-tabs removidos — solo se muestra Saldos
  // const [activeSubTab, setActiveSubTab] = useState<'saldos' | 'abonos'>('saldos')
  
  const [saldos, setSaldos] = useState<SaldoConductor[]>([])
  // @ts-expect-error todosLosAbonos se carga pero la UI de movimientos fue removida
  const [todosLosAbonos, setTodosLosAbonos] = useState<AbonoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroSaldo] = useState<'todos' | 'favor' | 'deuda' | 'mora' | 'fraccionado'>('todos')
  const [cobrosFraccionados, setCobrosFraccionados] = useState<{
    conductor_id: string
    conductor_nombre: string
    monto_cuota: number
    numero_cuota: number
    total_cuotas: number
    semana: number
    anio: number
  }[]>([])

  // Estado para modal Kardex (Control de Saldos)
  const [kardexModal, setKardexModal] = useState<{
    open: boolean
    saldo: SaldoConductor | null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rows: any[]
    loading: boolean
  }>({ open: false, saldo: null, rows: [], loading: false })

  // Estados para filtros Excel
  const [openColumnFilter, setOpenColumnFilter] = useState<string | null>(null)
  const [conductorFilter, setConductorFilter] = useState<string[]>([])
  const [conductorSearch, setConductorSearch] = useState('')
  const [estadoFilter, setEstadoFilter] = useState<string[]>([])
  const [estadoCondFilter, setEstadoCondFilter] = useState<'todos' | 'activo' | 'baja'>('todos')
  const [asignadoFilter, setAsignadoFilter] = useState<'todos' | 'asignado' | 'no_asignado'>('todos')
  const [conductoresAsignados, setConductoresAsignados] = useState<Set<string>>(new Set())
  const [tasaMoraPct, setTasaMoraPct] = useState(1) // default 1% diario desde P009
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    cargarSaldos()
    // Cargar tasa de mora desde P009
    ;(async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: p009 } = await (supabase.from('conceptos_nomina') as any)
          .select('precio_base')
          .eq('codigo', 'P009')
          .single()
        if (p009?.precio_base) setTasaMoraPct(parseFloat(p009.precio_base))
      } catch { /* usar default */ }
    })()
  }, [sedeActualId])

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    if (!openColumnFilter) return
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.dt-column-filter-dropdown') && !target.closest('.dt-column-filter-btn')) {
        setOpenColumnFilter(null)
      }
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [openColumnFilter])

  // Listas únicas para filtros
  const conductoresUnicos = useMemo(() =>
    [...new Set(saldos.map(s => s.conductor_nombre).filter(Boolean) as string[])].sort()
  , [saldos])

  const conductoresFiltrados = useMemo(() => {
    if (!conductorSearch) return conductoresUnicos
    return conductoresUnicos.filter(c => c.toLowerCase().includes(conductorSearch.toLowerCase()))
  }, [conductoresUnicos, conductorSearch])

  // Toggle functions
  const toggleConductorFilter = (val: string) => setConductorFilter(prev =>
    prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
  )
  const toggleEstadoFilter = (val: string) => setEstadoFilter(prev =>
    prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
  )

  async function cargarSaldos() {
    setLoading(true)
    try {
      // Cargar las 3 fuentes en paralelo (son independientes entre sí)
      const [saldosRes, fraccionadosRes, abonosRes] = await Promise.all([
        aplicarFiltroSede(supabase
          .from('saldos_conductores')
          .select(`
            *,
            conductor:conductores(
              estado:conductores_estados(codigo)
            )
          `))
          .order('conductor_nombre'),
        aplicarFiltroSede(supabase
          .from('cobros_fraccionados')
          .select(`
            id,
            conductor_id,
            monto_cuota,
            numero_cuota,
            total_cuotas,
            semana,
            anio,
            aplicado,
            conductor:conductores(nombres, apellidos)
          `))
          .eq('aplicado', false)
          .order('semana'),
        aplicarFiltroSede(supabase
          .from('abonos_conductores')
          .select('id, conductor_id, fecha_abono, tipo, monto, concepto, referencia, semana, anio'))
          .order('fecha_abono', { ascending: false })
          .limit(500),
      ])

      if (saldosRes.error) throw saldosRes.error
      if (fraccionadosRes.error) throw fraccionadosRes.error

      // Cargar conductores asignados en la semana actual (misma lógica que ReporteFacturacionTab)
      const ahora = new Date()
      const semInicio = startOfWeek(ahora, { weekStartsOn: 1 })
      const semFin = endOfWeek(ahora, { weekStartsOn: 1 })
      const fechaInicioSem = format(semInicio, 'yyyy-MM-dd')
      const fechaFinSem = format(semFin, 'yyyy-MM-dd')
      const semInicioDate = parseISO(fechaInicioSem)
      const semFinDate = parseISO(fechaFinSem)

      const ARG_TZ = 'America/Argentina/Buenos_Aires'
      const argDateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: ARG_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
      const toArgDateLocal = (ts: string | null | undefined): string => {
        if (!ts) return '-'
        return argDateFmt.format(new Date(ts))
      }

      const { data: asignacionesSemana } = await (supabase.from('asignaciones_conductores') as any)
        .select(`
          conductor_id, fecha_inicio, fecha_fin, estado,
          asignaciones!inner(estado, fecha_fin),
          conductores!inner(sede_id)
        `)
        .in('estado', ['asignado', 'activo', 'activa', 'finalizado', 'finalizada', 'completado', 'cancelado', 'cancelada'])

      const sedeParaFiltro = sedeActualId
      const idsAsignados = new Set<string>()
      for (const ac of (asignacionesSemana || []) as any[]) {
        const cond = ac.conductores
        const asig = ac.asignaciones
        if (!cond || !asig) continue
        if (sedeParaFiltro && cond.sede_id !== sedeParaFiltro) continue
        // Skip programados y huérfanos
        const estadoPadre = (asig.estado || '').toLowerCase()
        if (['programado', 'programada'].includes(estadoPadre)) continue
        if (['finalizada', 'cancelada', 'finalizado', 'cancelado'].includes(estadoPadre) && !asig.fecha_fin) continue
        // Solapamiento con la semana
        const acInicio = ac.fecha_inicio ? parseISO(toArgDateLocal(ac.fecha_inicio)) : new Date('2020-01-01')
        const acFin = ac.fecha_fin ? parseISO(toArgDateLocal(ac.fecha_fin))
          : (asig.fecha_fin ? parseISO(toArgDateLocal(asig.fecha_fin)) : new Date('2099-12-31'))
        if (acFin < semInicioDate || acInicio > semFinDate) continue
        idsAsignados.add(ac.conductor_id)
      }
      setConductoresAsignados(idsAsignados)

      // Procesar saldos
      const saldosConEstado = (saldosRes.data || []).map((s: {
        conductor?: { estado?: { codigo: string } | null } | null
      } & SaldoConductor) => ({
        ...s,
        conductor_estado: s.conductor?.estado?.codigo || null
      }))
      setSaldos(saldosConEstado)

      // Procesar fraccionados
      const fraccionadosConNombre = ((fraccionadosRes.data || []) as unknown as CobroFraccionadoRow[]).map((f) => ({
        conductor_id: f.conductor_id,
        conductor_nombre: f.conductor ? `${f.conductor.apellidos}, ${f.conductor.nombres}` : 'N/A',
        monto_cuota: f.monto_cuota,
        numero_cuota: f.numero_cuota,
        total_cuotas: f.total_cuotas,
        semana: f.semana,
        anio: f.anio
      }))
      setCobrosFraccionados(fraccionadosConNombre)

      // Procesar abonos (usa nombres de conductores ya cargados)
      if (abonosRes.error) {
        // silently ignored
      }
      const conductorNombres = new Map(saldosConEstado.map((s: SaldoConductor) => [s.conductor_id, s.conductor_nombre]))
      const abonosConNombre = ((abonosRes.data || []) as AbonoRow[]).map((a) => ({
        ...a,
        conductor_nombre: conductorNombres.get(a.conductor_id) || 'N/A'
      }))
      setTodosLosAbonos(abonosConNombre)
    } catch {
      // silently ignored
    } finally {
      setLoading(false)
    }
  }

  // Helper para obtener número de semana
  function getWeekNumber(dateStr: string): number {
    const date = new Date(dateStr + 'T12:00:00')
    const startOfYear = new Date(date.getFullYear(), 0, 1)
    const days = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000))
    return Math.ceil((days + startOfYear.getDay() + 1) / 7)
  }

  // Hidden: botón de agregar saldo removido de la UI
  async function _agregarSaldoInicial() {
    // Cargar conductores disponibles al momento de abrir el modal
    const { data: todosLosConductores } = await aplicarFiltroSede(supabase
      .from('conductores')
      .select('id, nombres, apellidos'))
      .order('apellidos')

    const conductoresParaModal = ((todosLosConductores || []) as ConductorBasico[])
      .map((c) => ({
        id: c.id,
        nombres: c.nombres || '',
        apellidos: c.apellidos || '',
        dni: ''
      }))

    if (conductoresParaModal.length === 0) {
      Swal.fire({
        icon: 'info',
        title: 'Sin conductores disponibles',
        text: 'No hay conductores registrados.',
        confirmButtonColor: '#6B7280'
      })
      return
    }

    // Fecha de hoy en formato YYYY-MM-DD
    const hoy = new Date()
    const hoyStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
    
    // Calcular semana actual y anterior
    const semanaActual = getWeekNumber(hoyStr)
    const anioActual = hoy.getFullYear()
    let semanaAnterior = semanaActual - 1
    let anioAnterior = anioActual
    if (semanaAnterior < 1) {
      semanaAnterior = 52
      anioAnterior = anioActual - 1
    }

    // Generar opciones de semanas (4 anteriores + actual + 20 siguientes)
    let semanaOptions = ''
    let sem = semanaActual - 4
    let anio = anioActual
    if (sem < 1) { sem = 52 + sem; anio = anioActual - 1 }
    for (let i = 0; i < 25; i++) {
      const selected = (sem === semanaAnterior && anio === anioAnterior) ? 'selected' : ''
      semanaOptions += `<option value="${sem}-${anio}" ${selected}>Semana ${sem} - ${anio}</option>`
      sem++
      if (sem > 52) { sem = 1; anio++ }
    }

    const { value: formValues } = await Swal.fire({
      title: `<span style="font-size: 16px; font-weight: 600;">Agregar Saldo Inicial</span>`,
      html: `
        <div style="text-align: left; font-size: 13px;">
          <div style="background: #FEF3C7; padding: 10px 12px; border-radius: 6px; margin-bottom: 12px; border-left: 3px solid #F59E0B;">
            <div style="font-weight: 600; color: #92400E; font-size: 12px;">Importante</div>
            <div style="color: #78350F; font-size: 11px; margin-top: 2px;">
              La fecha de referencia se usa para calcular días de mora. Indica desde cuándo se considera este saldo.
            </div>
          </div>
          
          <div style="margin-bottom: 12px; position: relative;">
            <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px; font-weight: 500;">Conductor:</label>
            <input id="swal-conductor-search" type="text" class="swal2-input" style="font-size: 14px; margin: 0; width: 100%;" placeholder="Buscar conductor..." autocomplete="off">
            <input type="hidden" id="swal-conductor" value="">
            <div id="swal-conductor-dropdown" style="display: none; position: absolute; top: 100%; left: 0; right: 0; max-height: 200px; overflow-y: auto; background: white; border: 1px solid #e5e5e5; border-top: none; border-radius: 0 0 6px 6px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); z-index: 9999;"></div>
          </div>
          
          <div style="margin-bottom: 12px;">
            <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px; font-weight: 500;">Saldo Inicial (Deuda):</label>
            <input id="swal-saldo" type="number" class="swal2-input" style="font-size: 14px; margin: 0; width: 100%;" placeholder="Ej: 50000 (se registrará como deuda)">
            <span style="font-size: 10px; color: #6B7280;">Ingrese el monto de la deuda (sin signo negativo)</span>
          </div>

          <div style="margin-bottom: 12px;">
            <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 8px; font-weight: 500;">¿Cómo desea aplicar el cobro?</label>
            <div style="display: flex; gap: 10px;">
              <label style="flex: 1; display: flex; align-items: center; gap: 8px; padding: 10px; border: 2px solid #e5e5e5; border-radius: 8px; cursor: pointer; transition: all 0.2s;" id="label-completo">
                <input type="radio" name="tipo-cobro" value="completo" id="swal-completo" checked style="accent-color: #ff0033;">
                <div>
                  <div style="font-weight: 600; font-size: 13px;">Completo</div>
                  <div style="font-size: 11px; color: #666;">Se cobra todo en una semana</div>
                </div>
              </label>
              <label style="flex: 1; display: flex; align-items: center; gap: 8px; padding: 10px; border: 2px solid #e5e5e5; border-radius: 8px; cursor: pointer; transition: all 0.2s;" id="label-fraccionado">
                <input type="radio" name="tipo-cobro" value="fraccionado" id="swal-fraccionado" style="accent-color: #ff0033;">
                <div>
                  <div style="font-weight: 600; font-size: 13px;">Fraccionado</div>
                  <div style="font-size: 11px; color: #666;">Dividir en cuotas semanales</div>
                </div>
              </label>
            </div>
          </div>

          <div id="seccion-cuotas" style="display: none; margin-bottom: 12px; padding: 12px; background: #F3F4F6; border-radius: 8px;">
            <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px; font-weight: 500;">Cantidad de cuotas:</label>
            <input id="swal-cuotas" type="number" min="2" max="52" class="swal2-input" style="font-size: 14px; margin: 0; width: 100%;" value="4" placeholder="Ej: 4">
            <div id="preview-cuotas" style="margin-top: 8px; font-size: 12px; color: #059669; font-weight: 500;"></div>
          </div>
          
          <div style="margin-bottom: 12px;">
            <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px; font-weight: 500;">Semana de inicio:</label>
            <select id="swal-semana" class="swal2-select" style="font-size: 14px; margin: 0; width: 100%; padding: 8px;">
              ${semanaOptions}
            </select>
          </div>
          
          <div style="margin-bottom: 12px;">
            <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px; font-weight: 500;">Fecha de Referencia:</label>
            <input id="swal-fecha" type="date" class="swal2-input" style="font-size: 14px; margin: 0; width: 100%;" value="${hoyStr}">
            <span style="font-size: 10px; color: #6B7280;">Fecha desde la cual se considera este saldo para cálculo de mora</span>
          </div>
          
          <div>
            <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px; font-weight: 500;">Concepto (opcional):</label>
            <input id="swal-concepto" type="text" class="swal2-input" style="font-size: 14px; margin: 0; width: 100%;" placeholder="Ej: Regularización de saldo" value="Saldo inicial - Regularización">
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Agregar Saldo',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#16a34a',
      cancelButtonColor: '#6B7280',
      width: 480,
      customClass: {
        popup: 'swal-compact',
        title: 'swal-title-compact',
        htmlContainer: 'swal-html-compact'
      },
      didOpen: () => {
        // Configurar búsqueda con dropdown custom
        const searchInput = document.getElementById('swal-conductor-search') as HTMLInputElement
        const hiddenInput = document.getElementById('swal-conductor') as HTMLInputElement
        const dropdown = document.getElementById('swal-conductor-dropdown') as HTMLDivElement
        
        const renderDropdown = (filter: string) => {
          const filterLower = filter.toLowerCase()
          const filtered = conductoresParaModal.filter(c => {
            const fullName = `${c.apellidos} ${c.nombres} ${c.dni || ''}`.toLowerCase()
            return fullName.includes(filterLower)
          }).slice(0, 50)
          
          if (filtered.length === 0) {
            dropdown.innerHTML = '<div style="padding: 12px; color: #999; text-align: center;">No se encontraron resultados</div>'
          } else {
            dropdown.innerHTML = filtered.map(c => `
              <div class="conductor-option" data-id="${c.id}" style="padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #f0f0f0; transition: background 0.15s;">
                <strong style="color: #ff0033;">${c.apellidos}, ${c.nombres}</strong>
              </div>
            `).join('')
            
            dropdown.querySelectorAll('.conductor-option').forEach(opt => {
              opt.addEventListener('mouseenter', () => (opt as HTMLElement).style.background = '#f5f5f5')
              opt.addEventListener('mouseleave', () => (opt as HTMLElement).style.background = 'white')
              opt.addEventListener('click', async () => {
                const id = (opt as HTMLElement).dataset.id || ''
                const c = conductoresParaModal.find(x => x.id === id)
                if (c) {
                  searchInput.value = `${c.apellidos}, ${c.nombres}`
                  hiddenInput.value = id
                  dropdown.style.display = 'none'
                  
                  // Verificar si tiene fraccionamiento pendiente
                  const radioFracc = document.getElementById('swal-fraccionado') as HTMLInputElement
                  const labelFracc = document.getElementById('label-fraccionado') as HTMLElement
                  const radioComp = document.getElementById('swal-completo') as HTMLInputElement
                  
                  const { data: pendientes } = await supabase
                    .from('cobros_fraccionados')
                    .select('id')
                    .eq('conductor_id', id)
                    .eq('aplicado', false)
                    .limit(1)
                  
                  if (pendientes && pendientes.length > 0) {
                    radioFracc.disabled = true
                    labelFracc.style.opacity = '0.5'
                    labelFracc.style.cursor = 'not-allowed'
                    labelFracc.title = 'Ya tiene un fraccionamiento pendiente'
                    radioComp.checked = true
                    radioComp.dispatchEvent(new Event('change'))
                  } else {
                    radioFracc.disabled = false
                    labelFracc.style.opacity = '1'
                    labelFracc.style.cursor = 'pointer'
                    labelFracc.title = ''
                  }
                }
              })
            })
          }
          dropdown.style.display = 'block'
        }
        
        searchInput.addEventListener('focus', () => renderDropdown(searchInput.value))
        searchInput.addEventListener('input', () => renderDropdown(searchInput.value))
        
        // Cerrar dropdown al hacer click fuera
        document.addEventListener('click', (e) => {
          if (!searchInput.contains(e.target as Node) && !dropdown.contains(e.target as Node)) {
            dropdown.style.display = 'none'
          }
        })
        
        // Configurar toggle completo/fraccionado
        const radioCompleto = document.getElementById('swal-completo') as HTMLInputElement
        const radioFraccionado = document.getElementById('swal-fraccionado') as HTMLInputElement
        const labelCompleto = document.getElementById('label-completo') as HTMLElement
        const labelFraccionado = document.getElementById('label-fraccionado') as HTMLElement
        const seccionCuotas = document.getElementById('seccion-cuotas') as HTMLElement
        const inputCuotas = document.getElementById('swal-cuotas') as HTMLInputElement
        const inputSaldo = document.getElementById('swal-saldo') as HTMLInputElement
        const previewCuotas = document.getElementById('preview-cuotas') as HTMLElement

        const updatePreview = () => {
          const monto = parseFloat(inputSaldo.value) || 0
          const cuotas = parseInt(inputCuotas.value) || 1
          if (monto > 0 && cuotas > 0) {
            const montoCuota = Math.ceil(monto / cuotas)
            previewCuotas.textContent = `${cuotas} cuotas de ${formatCurrency(montoCuota)}`
          } else {
            previewCuotas.textContent = ''
          }
        }

        const updateStyles = () => {
          if (radioCompleto.checked) {
            labelCompleto.style.borderColor = '#ff0033'
            labelCompleto.style.background = '#FEF2F2'
            labelFraccionado.style.borderColor = '#e5e5e5'
            labelFraccionado.style.background = 'white'
            seccionCuotas.style.display = 'none'
          } else {
            labelFraccionado.style.borderColor = '#ff0033'
            labelFraccionado.style.background = '#FEF2F2'
            labelCompleto.style.borderColor = '#e5e5e5'
            labelCompleto.style.background = 'white'
            seccionCuotas.style.display = 'block'
            updatePreview()
          }
        }

        radioCompleto.addEventListener('change', updateStyles)
        radioFraccionado.addEventListener('change', updateStyles)
        inputCuotas.addEventListener('input', updatePreview)
        inputSaldo.addEventListener('input', updatePreview)
        updateStyles()
        
        searchInput.focus()
      },
      preConfirm: async () => {
        const conductorId = (document.getElementById('swal-conductor') as HTMLInputElement).value
        const saldo = (document.getElementById('swal-saldo') as HTMLInputElement).value
        const fecha = (document.getElementById('swal-fecha') as HTMLInputElement).value
        const concepto = (document.getElementById('swal-concepto') as HTMLInputElement).value
        const fraccionado = (document.getElementById('swal-fraccionado') as HTMLInputElement).checked
        const cuotas = parseInt((document.getElementById('swal-cuotas') as HTMLInputElement).value) || 1
        const semanaValue = (document.getElementById('swal-semana') as HTMLSelectElement).value
        const [semana, anio] = semanaValue.split('-').map(Number)

        if (!conductorId) {
          Swal.showValidationMessage('Seleccione un conductor')
          return false
        }
        if (!saldo || parseFloat(saldo) <= 0) {
          Swal.showValidationMessage('Ingrese un monto de deuda válido (mayor a 0)')
          return false
        }
        if (!fecha) {
          Swal.showValidationMessage('Ingrese una fecha de referencia')
          return false
        }
        if (fraccionado && cuotas < 2) {
          Swal.showValidationMessage('El fraccionamiento debe tener al menos 2 cuotas')
          return false
        }

        // Validar si ya tiene fraccionamiento pendiente
        if (fraccionado) {
          const { data: pendientes } = await supabase
            .from('cobros_fraccionados')
            .select('id')
            .eq('conductor_id', conductorId)
            .eq('aplicado', false)
            .limit(1)
          
          if (pendientes && pendientes.length > 0) {
            Swal.showValidationMessage('Este conductor ya tiene un cobro fraccionado pendiente. Debe completarlo antes de crear otro.')
            return false
          }
        }

        return { 
          conductorId, 
          saldo: -Math.abs(parseFloat(saldo)), // Siempre negativo (deuda)
          fecha,
          concepto: concepto || 'Saldo inicial - Regularización',
          fraccionado,
          cuotas: fraccionado ? cuotas : 1,
          semanaInicio: semana,
          anioInicio: anio
        }
      }
    })

    if (!formValues) return

    try {
      // Obtener datos del conductor
      const conductor = conductoresParaModal.find(c => c.id === formValues.conductorId)
      if (!conductor) throw new Error('Conductor no encontrado')

      const conductorNombre = `${conductor.nombres} ${conductor.apellidos}`
      const fechaReferencia = new Date(formValues.fecha + 'T12:00:00').toISOString()

      // Verificar si ya existe saldo para este conductor
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: saldoExistente } = await (supabase.from('saldos_conductores') as any)
        .select('id, saldo_actual')
        .eq('conductor_id', formValues.conductorId)
        .single()

      if (saldoExistente) {
        // Actualizar saldo existente (sumar al saldo actual)
        const nuevoSaldo = (saldoExistente.saldo_actual || 0) + formValues.saldo
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: errorUpdate } = await (supabase.from('saldos_conductores') as any)
          .update({
            saldo_actual: nuevoSaldo,
            ultima_actualizacion: new Date().toISOString()
          })
          .eq('id', saldoExistente.id)
        if (errorUpdate) throw errorUpdate
      } else {
        // Crear nuevo registro
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: errorInsert } = await (supabase.from('saldos_conductores') as any)
          .insert({
            conductor_id: formValues.conductorId,
            conductor_nombre: conductorNombre,
            conductor_dni: conductor.dni,
            saldo_actual: formValues.saldo,
            dias_mora: 0,
            monto_mora_acumulada: 0,
            fecha_referencia: fechaReferencia,
            ultima_actualizacion: new Date().toISOString()
          })
        if (errorInsert) throw errorInsert
      }

      // Registrar en historial de abonos
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('abonos_conductores') as any).insert({
        conductor_id: formValues.conductorId,
        tipo: 'cargo',
        monto: Math.abs(formValues.saldo),
        concepto: formValues.concepto,
        referencia: `Fecha ref: ${formValues.fecha}`,
        fecha_abono: fechaReferencia
      })

      // Registrar movimiento en kardex (control_saldos)
      const saldoResultante = saldoExistente
        ? (saldoExistente.saldo_actual || 0) + formValues.saldo
        : formValues.saldo
      const semIni = formValues.fraccionado ? formValues.semanaInicio : getWeekNumber(new Date().toISOString().split('T')[0])
      const anioIni = formValues.fraccionado ? formValues.anioInicio : new Date().getFullYear()
      await insertControlSaldo({
        conductorId: formValues.conductorId,
        semana: semIni,
        anio: anioIni,
        tipoMovimiento: 'cargo',
        montoMovimiento: Math.abs(formValues.saldo),
        saldoPendiente: saldoResultante,
        referencia: formValues.concepto || 'Saldo inicial',
        userName: profile?.full_name,
      })

      // Si es fraccionado, crear los cobros fraccionados
      if (formValues.fraccionado && formValues.cuotas > 1) {
        const montoCuota = Math.ceil(Math.abs(formValues.saldo) / formValues.cuotas)
        let semActual = formValues.semanaInicio
        let anioActual = formValues.anioInicio

        for (let i = 1; i <= formValues.cuotas; i++) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from('cobros_fraccionados') as any).insert({
            conductor_id: formValues.conductorId,
            descripcion: `${formValues.concepto} - Cuota ${i}/${formValues.cuotas}`,
            monto_total: Math.abs(formValues.saldo),
            monto_cuota: montoCuota,
            numero_cuota: i,
            total_cuotas: formValues.cuotas,
            semana: semActual,
            anio: anioActual,
            aplicado: false
          })

          // Avanzar a siguiente semana
          semActual++
          if (semActual > 52) {
            semActual = 1
            anioActual++
          }
        }
      }

      showSuccess('Saldo Agregado', `${conductorNombre} - ${formatCurrency(formValues.saldo)}${formValues.fraccionado ? ` (${formValues.cuotas} cuotas)` : ''}`)

      // Recargar datos
      cargarSaldos()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo agregar el saldo', 'error')
    }
  }

  // Hidden: botón de registrar movimiento removido de la UI
  async function _registrarAbono(saldo: SaldoConductor) {
    const saldoColor = saldo.saldo_actual >= 0 ? '#16a34a' : '#dc2626'

    // Calcular semana actual
    const hoy = new Date()
    const hoyStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
    const semanaActual = getWeekNumber(hoyStr)
    const anioActual = hoy.getFullYear()

    // Generar opciones de semanas (4 anteriores + actual + 4 siguientes)
    let semanaOptions = ''
    let sem = semanaActual - 4
    let anio = anioActual
    if (sem < 1) { sem = 52 + sem; anio = anioActual - 1 }
    for (let i = 0; i < 9; i++) {
      const selected = (sem === semanaActual && anio === anioActual) ? 'selected' : ''
      const label = sem === semanaActual && anio === anioActual ? `Semana ${sem} - ${anio} (actual)` : `Semana ${sem} - ${anio}`
      semanaOptions += `<option value="${sem}-${anio}" ${selected}>${label}</option>`
      sem++
      if (sem > 52) { sem = 1; anio++ }
    }

    const { value: formValues } = await Swal.fire({
      title: `<span style="font-size: 16px; font-weight: 600;">Registrar Movimiento</span>`,
      html: `
        <div style="text-align: left; font-size: 13px;">
          <div style="background: #F3F4F6; padding: 10px 12px; border-radius: 6px; margin-bottom: 12px;">
            <div style="font-weight: 600; color: #111827;">${saldo.conductor_nombre}</div>
            <div style="color: ${saldoColor}; font-size: 12px; margin-top: 4px;">
              Saldo actual: <strong>${formatCurrency(saldo.saldo_actual)}</strong>
            </div>
          </div>
          <div style="margin-bottom: 10px;">
            <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px;">Tipo:</label>
            <select id="swal-tipo" class="swal2-select" style="font-size: 14px; margin: 0; width: 100%; padding: 8px;">
              <option value="abono">Abono (a favor del conductor)</option>
              <option value="cargo">Cargo (deuda del conductor)</option>
            </select>
          </div>
          <div style="margin-bottom: 10px;">
            <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px;">Semana:</label>
            <select id="swal-semana" class="swal2-select" style="font-size: 14px; margin: 0; width: 100%; padding: 8px;">
              ${semanaOptions}
            </select>
            <span style="font-size: 10px; color: #6B7280;">Semana a la que corresponde este movimiento</span>
          </div>
          <div style="margin-bottom: 10px;">
            <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px;">Monto:</label>
            <input id="swal-monto" type="number" class="swal2-input" style="font-size: 14px; margin: 0; width: 100%;" placeholder="Monto">
          </div>
          <div style="margin-bottom: 10px;">
            <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px;">Concepto:</label>
            <input id="swal-concepto" type="text" class="swal2-input" style="font-size: 14px; margin: 0; width: 100%;" placeholder="Ej: Pago en efectivo">
          </div>
          <div>
            <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px;">Referencia (opcional):</label>
            <input id="swal-ref" type="text" class="swal2-input" style="font-size: 14px; margin: 0; width: 100%;" placeholder="Ej: Recibo #123">
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Registrar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#ff0033',
      cancelButtonColor: '#6B7280',
      width: 380,
      customClass: {
        popup: 'swal-compact',
        title: 'swal-title-compact',
        htmlContainer: 'swal-html-compact'
      },
      preConfirm: () => {
        const tipo = (document.getElementById('swal-tipo') as HTMLSelectElement).value
        const semanaValue = (document.getElementById('swal-semana') as HTMLSelectElement).value
        const [semana, anioSel] = semanaValue.split('-').map(Number)
        const monto = (document.getElementById('swal-monto') as HTMLInputElement).value
        const concepto = (document.getElementById('swal-concepto') as HTMLInputElement).value
        const referencia = (document.getElementById('swal-ref') as HTMLInputElement).value

        if (!monto || parseFloat(monto) <= 0) {
          Swal.showValidationMessage('Ingrese un monto válido')
          return false
        }
        if (!concepto) {
          Swal.showValidationMessage('Ingrese un concepto')
          return false
        }

        return { 
          tipo, 
          monto: parseFloat(monto), 
          concepto, 
          referencia: referencia || null,
          semana,
          anio: anioSel
        }
      }
    })

    if (!formValues) return

    try {
      const montoFinal = formValues.tipo === 'abono' ? formValues.monto : -formValues.monto

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: errorAbono } = await (supabase.from('abonos_conductores') as any).insert({
          conductor_id: saldo.conductor_id,
          tipo: formValues.tipo,
          monto: formValues.monto,
          concepto: formValues.concepto,
          referencia: formValues.referencia,
          semana: formValues.semana,
          anio: formValues.anio,
          fecha_abono: new Date().toISOString()
        })

      if (errorAbono) throw errorAbono

      const nuevoSaldo = saldo.saldo_actual + montoFinal
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: errorUpdate } = await (supabase.from('saldos_conductores') as any)
        .update({ saldo_actual: nuevoSaldo, ultima_actualizacion: new Date().toISOString() })
        .eq('id', saldo.id)

      if (errorUpdate) throw errorUpdate

      // Registrar movimiento en kardex (control_saldos)
      await insertControlSaldo({
        conductorId: saldo.conductor_id,
        semana: formValues.semana,
        anio: formValues.anio,
        tipoMovimiento: formValues.tipo === 'abono' ? 'abono' : 'cargo',
        montoMovimiento: formValues.monto,
        saldoPendiente: nuevoSaldo,
        referencia: formValues.concepto || `${formValues.tipo === 'abono' ? 'Abono' : 'Cargo'} S${formValues.semana}/${formValues.anio}`,
        userName: profile?.full_name,
      })

      showSuccess(formValues.tipo === 'abono' ? 'Abono Registrado' : 'Cargo Registrado', `Nuevo saldo: ${formatCurrency(nuevoSaldo)}`)

      cargarSaldos()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo registrar', 'error')
    }
  }

  // Registrar pago — reduce la deuda del conductor (suma al saldo)
  async function registrarPago(saldo: SaldoConductor) {
    const saldoColor = saldo.saldo_actual < 0 ? '#DC2626' : saldo.saldo_actual > 0 ? '#16A34A' : '#6B7280'

    const { value: formValues } = await Swal.fire({
      title: '<span style="font-size: 16px; font-weight: 600;">Registrar Pago</span>',
      html: `
        <div style="text-align: left; font-size: 13px;">
          <div style="background: #F3F4F6; padding: 10px 12px; border-radius: 6px; margin-bottom: 12px;">
            <div style="font-weight: 600; color: #111827;">${saldo.conductor_nombre}</div>
            <div style="color: ${saldoColor}; font-size: 12px; margin-top: 4px;">
              Saldo actual: <strong>${formatCurrency(saldo.saldo_actual)}</strong>
              ${saldo.saldo_actual < 0 ? ' <span style="color: #DC2626;">(DEUDA)</span>' : ''}
            </div>
          </div>
          <div style="margin-bottom: 10px;">
            <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px;">Monto del pago:</label>
            <input id="swal-pago-monto" type="number" class="swal2-input" style="font-size: 14px; margin: 0; width: 100%;" placeholder="Monto" min="0" step="0.01">
          </div>
          <div style="margin-bottom: 10px;">
            <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px;">Concepto:</label>
            <input id="swal-pago-concepto" type="text" class="swal2-input" style="font-size: 14px; margin: 0; width: 100%;" placeholder="Ej: Pago en efectivo" value="Pago en efectivo">
          </div>
          <div>
            <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px;">Referencia (opcional):</label>
            <input id="swal-pago-ref" type="text" class="swal2-input" style="font-size: 14px; margin: 0; width: 100%;" placeholder="Ej: Recibo #123">
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Registrar Pago',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#16a34a',
      cancelButtonColor: '#6B7280',
      width: 380,
      customClass: {
        popup: 'swal-compact',
        title: 'swal-title-compact',
        htmlContainer: 'swal-html-compact'
      },
      preConfirm: () => {
        const monto = (document.getElementById('swal-pago-monto') as HTMLInputElement).value
        const concepto = (document.getElementById('swal-pago-concepto') as HTMLInputElement).value
        const referencia = (document.getElementById('swal-pago-ref') as HTMLInputElement).value

        if (!monto || parseFloat(monto) <= 0) {
          Swal.showValidationMessage('Ingrese un monto valido')
          return false
        }
        if (!concepto) {
          Swal.showValidationMessage('Ingrese un concepto')
          return false
        }

        return {
          monto: parseFloat(monto),
          concepto,
          referencia: referencia || null
        }
      }
    })

    if (!formValues) return

    try {
      // Pago = abono (suma al saldo, reduce deuda)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: errorAbono } = await (supabase.from('abonos_conductores') as any).insert({
        conductor_id: saldo.conductor_id,
        tipo: 'pago',
        monto: formValues.monto,
        concepto: formValues.concepto,
        referencia: formValues.referencia,
        semana: getWeekNumber(new Date().toISOString().split('T')[0]),
        anio: new Date().getFullYear(),
        fecha_abono: new Date().toISOString()
      })

      if (errorAbono) throw errorAbono

      const nuevoSaldo = saldo.saldo_actual + formValues.monto
      // Si el nuevo saldo >= 0 (sin deuda), resetear dias_mora a 0
      const updateData: Record<string, unknown> = { 
        saldo_actual: nuevoSaldo, 
        ultima_actualizacion: new Date().toISOString() 
      }
      if (nuevoSaldo >= 0) {
        updateData.dias_mora = 0
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: errorUpdate } = await (supabase.from('saldos_conductores') as any)
        .update(updateData)
        .eq('id', saldo.id)

      if (errorUpdate) throw errorUpdate

      // Registrar movimiento en kardex (control_saldos)
      const semPago = getWeekNumber(new Date().toISOString().split('T')[0])
      const anioPago = new Date().getFullYear()
      await insertControlSaldo({
        conductorId: saldo.conductor_id,
        semana: semPago,
        anio: anioPago,
        tipoMovimiento: 'pago_manual',
        montoMovimiento: formValues.monto,
        saldoPendiente: nuevoSaldo,
        referencia: formValues.concepto || `Pago manual S${semPago}/${anioPago}`,
        userName: profile?.full_name,
      })

      showSuccess('Pago Registrado', `Nuevo saldo: ${formatCurrency(nuevoSaldo)}`)
      cargarSaldos()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo registrar el pago', 'error')
    }
  }

  // Mantener referencia a funciones ocultas para evitar error TS6133
  void _registrarAbono; void _agregarSaldoInicial;

  async function eliminarSaldo(saldo: SaldoConductor) {
    const { value: formValues } = await Swal.fire({
      title: 'Eliminar Saldo',
      html: `
        <div style="text-align: left; font-size: 13px;">
          <p>¿Estás seguro de eliminar el saldo de <strong>${saldo.conductor_nombre}</strong>?</p>
          <p style="color: #ff0033; font-weight: 600; margin-top: 10px;">Saldo actual: ${formatCurrency(saldo.saldo_actual)}</p>
          <p style="font-size: 12px; color: #666; margin-top: 10px;">Esta acción eliminará el registro y sus cobros fraccionados asociados.</p>
          <div style="margin-top: 12px;">
            <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px;">Motivo: <span style="color:#dc2626;">*</span></label>
            <select id="swal-motivo-elim" class="swal2-input" style="font-size: 13px; margin: 0; width: 100%; padding: 6px 8px;">
              <option value="">-- Seleccionar --</option>
              <option value="Conductor dado de baja">Conductor dado de baja</option>
              <option value="Saldo liquidado">Saldo liquidado</option>
              <option value="Error de carga">Error de carga</option>
              <option value="Duplicado">Duplicado</option>
              <option value="Otro">Otro</option>
            </select>
          </div>
          <div style="margin-top: 8px;">
            <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px;">Detalle (opcional):</label>
            <input id="swal-detalle-elim" type="text" class="swal2-input" style="font-size: 13px; margin: 0; width: 100%;" placeholder="Detalle adicional...">
          </div>
        </div>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#ff0033',
      cancelButtonColor: '#6B7280',
      focusConfirm: false,
      preConfirm: () => {
        const motivo = (document.getElementById('swal-motivo-elim') as HTMLSelectElement).value
        if (!motivo) {
          Swal.showValidationMessage('Seleccione un motivo')
          return false
        }
        const detalle = (document.getElementById('swal-detalle-elim') as HTMLInputElement).value.trim()
        return { motivo, detalle }
      }
    })

    if (!formValues) return

    try {
      // Eliminar cobros fraccionados asociados
      await supabase
        .from('cobros_fraccionados')
        .delete()
        .eq('conductor_id', saldo.conductor_id)

      // Eliminar el saldo
      const { error } = await supabase
        .from('saldos_conductores')
        .delete()
        .eq('id', saldo.id)

      if (error) throw error

      // Registrar movimiento en kardex (control_saldos)
      const semElim = getWeekNumber(new Date().toISOString().split('T')[0])
      const anioElim = new Date().getFullYear()
      await insertControlSaldo({
        conductorId: saldo.conductor_id,
        semana: semElim,
        anio: anioElim,
        tipoMovimiento: 'eliminacion_saldo',
        montoMovimiento: Math.abs(saldo.saldo_actual),
        saldoPendiente: 0,
        referencia: `${formValues.motivo}${formValues.detalle ? ' - ' + formValues.detalle : ''} (era ${formatCurrency(saldo.saldo_actual)})`,
        userName: profile?.full_name,
      })

      showSuccess('Eliminado')

      cargarSaldos()
    } catch {
      Swal.fire('Error', 'No se pudo eliminar el saldo', 'error')
    }
  }

  // Editar saldo (solo admin)
  async function editarSaldo(saldo: SaldoConductor) {
    // Obtener tasa de mora desde P009
    let tasaMora = 1 // default 1%
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: p009 } = await (supabase.from('conceptos_nomina') as any)
        .select('precio_base')
        .eq('codigo', 'P009')
        .single()
      if (p009?.precio_base) tasaMora = parseFloat(p009.precio_base)
    } catch { /* usar default */ }

    const { value: formValues } = await Swal.fire({
      title: `<span style="font-size: 16px; font-weight: 600;">Editar Saldo</span>`,
      html: `
        <div style="text-align: left; font-size: 13px;">
          <div style="background: #F3F4F6; padding: 10px 12px; border-radius: 6px; margin-bottom: 12px;">
            <div style="font-weight: 600; color: #111827;">${saldo.conductor_nombre}</div>
          </div>
          <div style="margin-bottom: 10px;">
            <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px;">Saldo Actual:</label>
            <input id="swal-saldo" type="number" step="0.01" class="swal2-input" style="font-size: 14px; margin: 0; width: 100%;" value="${saldo.saldo_actual}">
            <span style="font-size: 10px; color: #6B7280;">Positivo = A Favor | Negativo = Deuda</span>
          </div>
          <div style="margin-bottom: 10px;">
            <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px;">Días de Mora:</label>
            <input id="swal-dias-mora" type="number" min="0" class="swal2-input" style="font-size: 14px; margin: 0; width: 100%;" value="${saldo.dias_mora || 0}">
          </div>
          <div style="margin-bottom: 10px;">
            <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px;">Mora Acumulada:</label>
            <input id="swal-mora-acum" type="number" step="0.01" min="0" class="swal2-input" style="font-size: 14px; margin: 0; width: 100%;" value="${saldo.monto_mora_acumulada || 0}">
          </div>
          <div style="margin-bottom: 10px;">
            <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px;">Motivo del ajuste: <span style="color:#dc2626;">*</span></label>
            <select id="swal-motivo" class="swal2-input" style="font-size: 13px; margin: 0; width: 100%; padding: 6px 8px;">
              <option value="">-- Seleccionar --</option>
              <option value="Correccion de error">Correcci\u00f3n de error</option>
              <option value="Ajuste por diferencia de calculo">Ajuste por diferencia de c\u00e1lculo</option>
              <option value="Regularizacion">Regularizaci\u00f3n</option>
              <option value="Acuerdo con conductor">Acuerdo con conductor</option>
              <option value="Otro">Otro</option>
            </select>
          </div>
          <div>
            <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px;">Detalle (opcional):</label>
            <input id="swal-detalle" type="text" class="swal2-input" style="font-size: 13px; margin: 0; width: 100%;" placeholder="Detalle adicional...">
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#ff0033',
      cancelButtonColor: '#6B7280',
      width: 380,
      customClass: {
        popup: 'swal-compact',
        title: 'swal-title-compact',
        htmlContainer: 'swal-html-compact'
      },
      didOpen: () => {
        const saldoInput = document.getElementById('swal-saldo') as HTMLInputElement
        const diasInput = document.getElementById('swal-dias-mora') as HTMLInputElement
        const moraInput = document.getElementById('swal-mora-acum') as HTMLInputElement
        const calcMora = () => {
          const s = parseFloat(saldoInput.value) || 0
          const d = parseInt(diasInput.value) || 0
          if (d > 0) {
            moraInput.value = (Math.round(Math.abs(s) * (tasaMora / 100) * d * 100) / 100).toFixed(2)
          } else {
            moraInput.value = '0'
          }
        }
        saldoInput.addEventListener('input', calcMora)
        diasInput.addEventListener('input', calcMora)
      },
      preConfirm: () => {
        const saldoActual = parseFloat((document.getElementById('swal-saldo') as HTMLInputElement).value)
        if (isNaN(saldoActual)) {
          Swal.showValidationMessage('Ingrese un saldo válido')
          return false
        }
        const motivo = (document.getElementById('swal-motivo') as HTMLSelectElement).value
        if (!motivo) {
          Swal.showValidationMessage('Seleccione un motivo')
          return false
        }
        const detalle = (document.getElementById('swal-detalle') as HTMLInputElement).value.trim()
        const diasMora = parseInt((document.getElementById('swal-dias-mora') as HTMLInputElement).value) || 0
        const moraAcum = parseFloat((document.getElementById('swal-mora-acum') as HTMLInputElement).value) || 0
        return { saldoActual, diasMora, moraAcum, motivo, detalle }
      }
    })

    if (!formValues) return

    try {
      // Guardar lo que el usuario ingresó (sin auto-resetear)
      const diasMora = formValues.diasMora
      const moraAcum = formValues.moraAcum

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('saldos_conductores') as any)
        .update({
          saldo_actual: formValues.saldoActual,
          dias_mora: diasMora,
          monto_mora_acumulada: moraAcum,
          ultima_actualizacion: new Date().toISOString()
        })
        .eq('id', saldo.id)

      if (error) throw error

      // Registrar movimiento en kardex (control_saldos)
      const semAdj = getWeekNumber(new Date().toISOString().split('T')[0])
      const anioAdj = new Date().getFullYear()
      await insertControlSaldo({
        conductorId: saldo.conductor_id,
        semana: semAdj,
        anio: anioAdj,
        tipoMovimiento: 'ajuste_manual',
        montoMovimiento: Math.abs(formValues.saldoActual - saldo.saldo_actual),
        saldoPendiente: formValues.saldoActual,
        referencia: `${formValues.motivo}${formValues.detalle ? ' - ' + formValues.detalle : ''} (${formatCurrency(saldo.saldo_actual)} -> ${formatCurrency(formValues.saldoActual)})`,
        userName: profile?.full_name,
      })

      showSuccess('Actualizado', 'El saldo ha sido actualizado correctamente')

      cargarSaldos()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo actualizar el saldo', 'error')
    }
  }

  // Editar mora acumulada inline (click en celda)
  async function editarMoraAcumulada(saldo: SaldoConductor) {
    const diasActual = (saldo.dias_mora && saldo.dias_mora > 0) ? saldo.dias_mora : (saldo.ultima_actualizacion ? diasCalendario(saldo.ultima_actualizacion) : 0)
    const moraActual = (saldo.monto_mora_acumulada && saldo.monto_mora_acumulada > 0) ? saldo.monto_mora_acumulada : Math.round(Math.abs(saldo.saldo_actual) * 0.01 * diasActual * 100) / 100

    const { value: formValues } = await Swal.fire({
      title: '<span style="font-size: 16px; font-weight: 600;">Editar Mora</span>',
      html: `
        <div style="text-align: left; font-size: 13px;">
          <div style="background: #F3F4F6; padding: 10px 12px; border-radius: 6px; margin-bottom: 12px;">
            <div style="font-weight: 600; color: #111827;">${saldo.conductor_nombre}</div>
            <div style="color: #DC2626; font-size: 12px; margin-top: 4px;">Saldo: <strong>${formatCurrency(saldo.saldo_actual)}</strong></div>
          </div>
          <div style="margin-bottom: 10px;">
            <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px; font-weight: 500;">Días de Mora:</label>
            <input id="swal-dias-mora" type="number" min="0" class="swal2-input" style="font-size: 14px; margin: 0; width: 100%;" value="${diasActual}">
          </div>
          <div>
            <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px; font-weight: 500;">Mora Acumulada:</label>
            <input id="swal-mora-acum" type="number" step="0.01" min="0" class="swal2-input" style="font-size: 14px; margin: 0; width: 100%;" value="${moraActual}">
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#ff0033',
      cancelButtonColor: '#6B7280',
      width: 340,
      customClass: {
        popup: 'swal-compact',
        title: 'swal-title-compact',
        htmlContainer: 'swal-html-compact'
      },
      preConfirm: () => {
        const diasMora = parseInt((document.getElementById('swal-dias-mora') as HTMLInputElement).value) || 0
        const moraAcum = parseFloat((document.getElementById('swal-mora-acum') as HTMLInputElement).value) || 0
        return { diasMora, moraAcum }
      }
    })

    if (!formValues) return

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('saldos_conductores') as any)
        .update({
          dias_mora: formValues.diasMora,
          monto_mora_acumulada: formValues.moraAcum,
          ultima_actualizacion: new Date().toISOString()
        })
        .eq('id', saldo.id)

      if (error) throw error

      showSuccess('Actualizado', 'Mora actualizada correctamente')
      cargarSaldos()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo actualizar la mora', 'error')
    }
  }

  // ====== EXPORTAR SALDOS A EXCEL ======
  function exportarSaldos() {
    if (saldos.length === 0) {
      Swal.fire('Sin datos', 'No hay saldos para exportar', 'info')
      return
    }

    const data = saldos.map((s) => ({
      'DNI': s.conductor_dni || '',
      'Conductor': s.conductor_nombre || '',
      'Estado': s.conductor_estado || '',
      'Saldo Actual': s.saldo_actual,
      'Dias Mora': s.dias_mora || 0,
      'Mora Acumulada': s.monto_mora_acumulada || 0,
    }))

    const ws = XLSX.utils.json_to_sheet(data)

    // Anchos de columna
    ws['!cols'] = [
      { wch: 14 }, // DNI
      { wch: 35 }, // Conductor
      { wch: 12 }, // Estado
      { wch: 16 }, // Saldo Actual
      { wch: 12 }, // Dias Mora
      { wch: 16 }, // Mora Acumulada
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Saldos')

    // Hoja de instrucciones
    const instrucciones = [
      ['INSTRUCCIONES PARA IMPORTAR'],
      [''],
      ['1. Edite los valores en la hoja "Saldos"'],
      ['2. Solo modifique las columnas: Saldo Actual, Dias Mora, Mora Acumulada'],
      ['3. NO modifique la columna DNI (es la clave para identificar al conductor)'],
      ['4. Guarde el archivo y use el boton Importar para subirlo'],
      [''],
      ['CONVENCIONES:'],
      ['  Saldo Actual negativo = DEUDA (ej: -500000)'],
      ['  Saldo Actual positivo = A FAVOR (ej: 30000)'],
      ['  Saldo Actual 0 = Sin saldo'],
    ]
    const wsInstr = XLSX.utils.aoa_to_sheet(instrucciones)
    wsInstr['!cols'] = [{ wch: 70 }]
    XLSX.utils.book_append_sheet(wb, wsInstr, 'Instrucciones')

    const fecha = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `Saldos_Conductores_${fecha}.xlsx`)
    showSuccess('Exportado correctamente')
  }

  // ====== IMPORTAR SALDOS DESDE EXCEL ======
  async function importarSaldos(file: File) {
    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })

      // Buscar hoja "Saldos" o usar la primera
      const sheetName = wb.SheetNames.includes('Saldos') ? 'Saldos' : wb.SheetNames[0]
      const ws = wb.Sheets[sheetName]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { raw: false })

      if (rows.length === 0) {
        Swal.fire('Error', 'El archivo no contiene datos', 'error')
        return
      }

      // Validar que tenga DNI
      const firstRow = rows[0]
      if (firstRow['DNI'] === undefined && firstRow['dni'] === undefined) {
        Swal.fire('Error', 'El archivo debe tener la columna "DNI"', 'error')
        return
      }

      // Crear mapa DNI -> saldo para buscar conductor_id
      const dniMap = new Map<string, SaldoConductor>()
      for (const s of saldos) {
        if (s.conductor_dni) {
          // Normalizar: quitar puntos, espacios, ceros a la izquierda
          const dniNorm = String(s.conductor_dni).replace(/[.\s]/g, '').replace(/^0+/, '')
          dniMap.set(dniNorm, s)
        }
      }

      // Parsear filas
      interface ImportRow {
        conductor_id: string
        dni: string
        nombre: string
        saldo_actual: number
        dias_mora: number
        monto_mora_acumulada: number
      }

      const parsed: ImportRow[] = []
      const errores: string[] = []

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]
        const dniRaw = String(r['DNI'] || r['dni'] || '').trim()
        const dniNorm = dniRaw.replace(/[.\s]/g, '').replace(/^0+/, '')

        if (!dniNorm || dniNorm.length < 5) {
          errores.push(`Fila ${i + 2}: DNI invalido "${dniRaw}"`)
          continue
        }

        const match = dniMap.get(dniNorm)
        if (!match) {
          errores.push(`Fila ${i + 2}: DNI ${dniRaw} no encontrado`)
          continue
        }

        const saldo = parseFloat(String(r['Saldo Actual'] || '0').replace(/,/g, ''))
        if (isNaN(saldo)) {
          errores.push(`Fila ${i + 2}: Saldo Actual no es un numero`)
          continue
        }

        parsed.push({
          conductor_id: match.conductor_id,
          dni: dniRaw,
          nombre: String(r['Conductor'] || match.conductor_nombre || ''),
          saldo_actual: Math.round(saldo * 100) / 100,
          dias_mora: parseInt(String(r['Dias Mora'] || '0')) || 0,
          monto_mora_acumulada: Math.round((parseFloat(String(r['Mora Acumulada'] || '0').replace(/,/g, '')) || 0) * 100) / 100,
        })
      }

      if (parsed.length === 0) {
        Swal.fire('Error', `No se pudo procesar ninguna fila.${errores.length > 0 ? '<br><br>' + errores.slice(0, 10).join('<br>') : ''}`, 'error')
        return
      }

      // Detectar cambios
      const cambios = parsed.filter((p) => {
        const actual = saldos.find((s) => s.conductor_id === p.conductor_id)
        return !actual ||
          Math.abs(actual.saldo_actual - p.saldo_actual) > 0.01 ||
          (actual.dias_mora || 0) !== p.dias_mora ||
          Math.abs((actual.monto_mora_acumulada || 0) - p.monto_mora_acumulada) > 0.01
      })

      if (cambios.length === 0) {
        Swal.fire('Sin cambios', 'Los valores del archivo son iguales a los actuales', 'info')
        return
      }

      // Generar HTML del preview
      const previewRows = cambios.slice(0, 50).map((c) => {
        const actual = saldos.find((s) => s.conductor_id === c.conductor_id)
        const saldoAnt = actual?.saldo_actual ?? 0
        const diff = c.saldo_actual - saldoAnt
        const diffColor = diff > 0 ? '#16a34a' : diff < 0 ? '#dc2626' : '#6B7280'
        const diffSign = diff > 0 ? '+' : ''
        return `<tr>
          <td style="padding:4px 8px;border-bottom:1px solid #E5E7EB;white-space:nowrap;">${c.nombre}</td>
          <td style="padding:4px 6px;border-bottom:1px solid #E5E7EB;text-align:center;color:#6B7280;font-size:10px;">${c.dni}</td>
          <td style="padding:4px 6px;border-bottom:1px solid #E5E7EB;text-align:right;color:#9CA3AF;text-decoration:line-through;font-size:10px;">${formatCurrency(saldoAnt)}</td>
          <td style="padding:4px 4px;border-bottom:1px solid #E5E7EB;text-align:center;color:#9CA3AF;font-size:10px;">→</td>
          <td style="padding:4px 6px;border-bottom:1px solid #E5E7EB;text-align:right;color:${c.saldo_actual < 0 ? '#dc2626' : c.saldo_actual > 0 ? '#16a34a' : '#6B7280'};font-weight:600;">${formatCurrency(c.saldo_actual)}</td>
          <td style="padding:4px 6px;border-bottom:1px solid #E5E7EB;text-align:right;color:${diffColor};font-size:10px;font-weight:500;">${diffSign}${formatCurrency(diff)}</td>
        </tr>`
      }).join('')

      const { isConfirmed } = await Swal.fire({
        title: '<span style="font-size:16px;font-weight:600;">Preview de Importacion</span>',
        html: `
          <div style="text-align:left;font-size:13px;">
            <div style="display:flex;gap:12px;margin-bottom:10px;">
              <div style="flex:1;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:6px;padding:8px 10px;text-align:center;">
                <div style="font-size:18px;font-weight:700;color:#16a34a;">${parsed.length}</div>
                <div style="font-size:10px;color:#6B7280;">Filas leidas</div>
              </div>
              <div style="flex:1;background:#FEF3C7;border:1px solid #FDE68A;border-radius:6px;padding:8px 10px;text-align:center;">
                <div style="font-size:18px;font-weight:700;color:#D97706;">${cambios.length}</div>
                <div style="font-size:10px;color:#6B7280;">Con cambios</div>
              </div>
              ${errores.length > 0 ? `<div style="flex:1;background:#FEF2F2;border:1px solid #FECACA;border-radius:6px;padding:8px 10px;text-align:center;">
                <div style="font-size:18px;font-weight:700;color:#dc2626;">${errores.length}</div>
                <div style="font-size:10px;color:#6B7280;">Errores</div>
              </div>` : `<div style="flex:1;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:6px;padding:8px 10px;text-align:center;">
                <div style="font-size:18px;font-weight:700;color:#16a34a;">0</div>
                <div style="font-size:10px;color:#6B7280;">Errores</div>
              </div>`}
            </div>
            ${errores.length > 0 ? `<details style="margin-bottom:8px;font-size:11px;">
              <summary style="cursor:pointer;color:#dc2626;font-weight:500;">Ver ${errores.length} errores</summary>
              <div style="max-height:80px;overflow-y:auto;background:#FEF2F2;padding:6px 8px;border-radius:4px;margin-top:4px;color:#991B1B;">
                ${errores.slice(0, 20).map(e => `<div>${e}</div>`).join('')}
                ${errores.length > 20 ? `<div>... y ${errores.length - 20} mas</div>` : ''}
              </div>
            </details>` : ''}
            <div style="max-height:300px;overflow-y:auto;border:1px solid #E5E7EB;border-radius:6px;">
              <table style="width:100%;border-collapse:collapse;font-size:11px;">
                <thead>
                  <tr style="background:#F9FAFB;position:sticky;top:0;">
                    <th style="padding:5px 8px;text-align:left;font-weight:600;">Conductor</th>
                    <th style="padding:5px 6px;text-align:center;font-weight:600;">DNI</th>
                    <th style="padding:5px 6px;text-align:right;font-weight:600;font-size:10px;">Antes</th>
                    <th style="padding:5px 2px;"></th>
                    <th style="padding:5px 6px;text-align:right;font-weight:600;font-size:10px;">Despues</th>
                    <th style="padding:5px 6px;text-align:right;font-weight:600;font-size:10px;">Dif.</th>
                  </tr>
                </thead>
                <tbody>${previewRows}
                ${cambios.length > 50 ? `<tr><td colspan="6" style="padding:6px;text-align:center;color:#9CA3AF;font-size:11px;">... y ${cambios.length - 50} cambios mas</td></tr>` : ''}
                </tbody>
              </table>
            </div>
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: `Confirmar ${cambios.length} cambios`,
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#ff0033',
        width: 640,
        customClass: {
          popup: 'swal-compact',
          title: 'swal-title-compact',
          htmlContainer: 'swal-html-compact'
        }
      })

      if (!isConfirmed) return

      // Ejecutar updates — ahora si mostramos loading
      setLoading(true)
      const now = new Date().toISOString()
      let updated = 0
      let errors = 0

      const semImp = getWeekNumber(new Date().toISOString().split('T')[0])
      const anioImp = new Date().getFullYear()

      for (const c of cambios) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.from('saldos_conductores') as any)
          .update({
            saldo_actual: c.saldo_actual,
            dias_mora: c.dias_mora,
            monto_mora_acumulada: c.monto_mora_acumulada,
            ultima_actualizacion: now,
          })
          .eq('conductor_id', c.conductor_id)

        if (error) {
          errors++
        } else {
          updated++
          // Registrar movimiento en kardex (control_saldos)
          await insertControlSaldo({
            conductorId: c.conductor_id,
            semana: semImp,
            anio: anioImp,
            tipoMovimiento: 'importacion',
            montoMovimiento: Math.abs(c.saldo_actual),
            saldoPendiente: c.saldo_actual,
            referencia: `Importacion Excel S${semImp}/${anioImp}`,
            userName: profile?.full_name,
          })
        }
      }

      if (errors > 0) {
        Swal.fire('Importacion parcial', `${updated} actualizados, ${errors} errores`, 'warning')
      } else {
        Swal.fire('Importacion exitosa', `${updated} saldos actualizados`, 'success')
      }

      await cargarSaldos()
    } catch {
      setLoading(false)
      Swal.fire('Error', 'No se pudo procesar el archivo', 'error')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function verHistorial(saldo: SaldoConductor) {
    setKardexModal({ open: true, saldo, rows: [], loading: true })
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rows, error } = await (supabase.from('control_saldos') as any)
        .select('semana, anio, tipo_movimiento, monto_movimiento, referencia, saldo_adeudado, saldo_a_favor, saldo_pendiente, dias_mora, interes_mora, created_at, created_by_name')
        .eq('conductor_id', saldo.conductor_id)
        .order('anio', { ascending: false })
        .order('semana', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      setKardexModal({ open: true, saldo, rows: rows || [], loading: false })
    } catch {
      Swal.fire('Error', 'No se pudo cargar el control de saldos', 'error')
      setKardexModal(prev => ({ ...prev, open: false, loading: false }))
    }
  }

  // Función para editar un movimiento (abono/cargo)
  async function editarMovimiento(movimiento: AbonoRow) {
    // Calcular semana actual
    const hoy = new Date()
    const hoyStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
    const semanaActual = getWeekNumber(hoyStr)
    const anioActual = hoy.getFullYear()

    // Generar opciones de semanas (8 anteriores + actual + 4 siguientes)
    let semanaOptions = ''
    let sem = semanaActual - 8
    let anio = anioActual
    if (sem < 1) { sem = 52 + sem; anio = anioActual - 1 }
    for (let i = 0; i < 13; i++) {
      const isSelected = movimiento.semana === sem && movimiento.anio === anio
      const label = sem === semanaActual && anio === anioActual ? `Semana ${sem} - ${anio} (actual)` : `Semana ${sem} - ${anio}`
      semanaOptions += `<option value="${sem}-${anio}" ${isSelected ? 'selected' : ''}>${label}</option>`
      sem++
      if (sem > 52) { sem = 1; anio++ }
    }

    const { value: formValues } = await Swal.fire({
      title: `<span style="font-size: 16px; font-weight: 600;">Editar Movimiento</span>`,
      html: `
        <div style="text-align: left; font-size: 13px;">
          <div style="background: #F3F4F6; padding: 10px 12px; border-radius: 6px; margin-bottom: 12px;">
            <div style="font-weight: 600; color: #111827;">${movimiento.conductor_nombre || 'N/A'}</div>
            <div style="color: ${movimiento.tipo === 'abono' ? '#16a34a' : '#dc2626'}; font-size: 12px; margin-top: 4px;">
              ${movimiento.tipo === 'abono' ? 'Abono' : 'Cargo'}: <strong>${formatCurrency(movimiento.monto)}</strong>
            </div>
            <div style="color: #6B7280; font-size: 11px; margin-top: 2px;">${movimiento.concepto}</div>
          </div>
          
          <div style="margin-bottom: 10px;">
            <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px; font-weight: 500;">Semana:</label>
            <select id="swal-semana" class="swal2-select" style="font-size: 14px; margin: 0; width: 100%; padding: 8px;">
              <option value="">Sin asignar</option>
              ${semanaOptions}
            </select>
          </div>
          
          <div style="margin-bottom: 10px;">
            <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px; font-weight: 500;">Concepto:</label>
            <input id="swal-concepto" type="text" class="swal2-input" style="font-size: 14px; margin: 0; width: 100%;" value="${movimiento.concepto || ''}">
          </div>
          
          <div>
            <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px; font-weight: 500;">Referencia:</label>
            <input id="swal-referencia" type="text" class="swal2-input" style="font-size: 14px; margin: 0; width: 100%;" value="${movimiento.referencia || ''}" placeholder="Opcional">
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#ff0033',
      cancelButtonColor: '#6B7280',
      width: 400,
      customClass: {
        popup: 'swal-compact',
        title: 'swal-title-compact',
        htmlContainer: 'swal-html-compact'
      },
      preConfirm: () => {
        const semanaValue = (document.getElementById('swal-semana') as HTMLSelectElement).value
        const concepto = (document.getElementById('swal-concepto') as HTMLInputElement).value
        const referencia = (document.getElementById('swal-referencia') as HTMLInputElement).value

        if (!concepto.trim()) {
          Swal.showValidationMessage('El concepto es requerido')
          return false
        }

        let semana: number | null = null
        let anioSel: number | null = null
        if (semanaValue) {
          const parts = semanaValue.split('-').map(Number)
          semana = parts[0]
          anioSel = parts[1]
        }

        return { semana, anio: anioSel, concepto, referencia: referencia || null }
      }
    })

    if (!formValues) return

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('abonos_conductores') as any)
        .update({
          semana: formValues.semana,
          anio: formValues.anio,
          concepto: formValues.concepto,
          referencia: formValues.referencia
        })
        .eq('id', movimiento.id)

      if (error) throw error

      showSuccess('Actualizado')

      // Recargar datos
      cargarSaldos()
    } catch {
      Swal.fire('Error', 'No se pudo actualizar el movimiento', 'error')
    }
  }

  const columns = useMemo<ColumnDef<SaldoConductor>[]>(() => [
    {
      accessorKey: 'conductor_nombre',
      header: () => (
        <div className="dt-column-filter">
          <span>Conductor {conductorFilter.length > 0 && `(${conductorFilter.length})`}</span>
          <button
            className={`dt-column-filter-btn ${conductorFilter.length > 0 ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setOpenColumnFilter(openColumnFilter === 'conductor' ? null : 'conductor') }}
          >
            <Filter size={12} />
          </button>
          {openColumnFilter === 'conductor' && (
            <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                placeholder="Buscar conductor..."
                value={conductorSearch}
                onChange={(e) => setConductorSearch(e.target.value)}
                className="dt-column-filter-input"
              />
              <div className="dt-excel-filter-list">
                {conductoresFiltrados.map(c => (
                  <label key={c} className={`dt-column-filter-checkbox ${conductorFilter.includes(c) ? 'selected' : ''}`}>
                    <input type="checkbox" checked={conductorFilter.includes(c)} onChange={() => toggleConductorFilter(c)} />
                    <span>{c}</span>
                  </label>
                ))}
              </div>
              {conductorFilter.length > 0 && (
                <button className="dt-column-filter-clear" onClick={() => { setConductorFilter([]); setConductorSearch('') }}>
                  Limpiar ({conductorFilter.length})
                </button>
              )}
            </div>
          )}
        </div>
      ),
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.conductor_nombre}</div>
          <div className="text-xs text-gray-500">{row.original.conductor_cuit || row.original.conductor_dni}</div>
        </div>
      )
    },
    {
      id: 'conductor_estado',
      header: 'Estado Cond.',
      cell: ({ row }) => {
        const estado = row.original.conductor_estado
        if (!estado) return <span className="text-gray-400">-</span>
        
        const esActivo = estado.toUpperCase() === 'ACTIVO'
        const esBaja = estado.toUpperCase() === 'BAJA' || estado.toUpperCase() === 'INACTIVO'
        
        return (
          <span 
            className="fact-badge" 
            style={{
              backgroundColor: esActivo ? '#DCFCE7' : esBaja ? '#FEE2E2' : '#FEF3C7',
              color: esActivo ? '#166534' : esBaja ? '#991B1B' : '#92400E',
              fontSize: '11px',
              padding: '3px 8px'
            }}
          >
            {estado}
          </span>
        )
      }
    },
    {
      accessorKey: 'saldo_actual',
      header: 'Saldo Actual',
      cell: ({ row }) => {
        const saldoVal = row.original.saldo_actual
        return <span className={`fact-precio ${saldoVal >= 0 ? '' : 'fact-precio-negative'}`} style={{ fontWeight: 700 }}>{formatCurrency(saldoVal)}</span>
      }
    },
    {
      id: 'estado_saldo',
      header: () => (
        <div className="dt-column-filter">
          <span>Estado {estadoFilter.length > 0 && `(${estadoFilter.length})`}</span>
          <button
            className={`dt-column-filter-btn ${estadoFilter.length > 0 ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setOpenColumnFilter(openColumnFilter === 'estado' ? null : 'estado') }}
          >
            <Filter size={12} />
          </button>
          {openColumnFilter === 'estado' && (
            <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
              <div className="dt-excel-filter-list">
                {[
                  { value: 'favor', label: 'A Favor' },
                  { value: 'deuda', label: 'Deuda' },
                  { value: 'sin_saldo', label: 'Sin Saldo' }
                ].map(e => (
                  <label key={e.value} className={`dt-column-filter-checkbox ${estadoFilter.includes(e.value) ? 'selected' : ''}`}>
                    <input type="checkbox" checked={estadoFilter.includes(e.value)} onChange={() => toggleEstadoFilter(e.value)} />
                    <span>{e.label}</span>
                  </label>
                ))}
              </div>
              {estadoFilter.length > 0 && (
                <button className="dt-column-filter-clear" onClick={() => setEstadoFilter([])}>
                  Limpiar ({estadoFilter.length})
                </button>
              )}
            </div>
          )}
        </div>
      ),
      cell: ({ row }) => {
        const saldoVal = row.original.saldo_actual
        if (saldoVal > 0) return <span className="fact-badge fact-badge-green">A Favor</span>
        if (saldoVal < 0) return <span className="fact-badge fact-badge-red">Deuda</span>
        return <span className="fact-badge fact-badge-gray">Sin Saldo</span>
      }
    },
    {
      accessorKey: 'dias_mora',
      header: 'Días Mora',
      cell: ({ row }) => {
        const s = row.original
        // Mostrar valor de BD si existe, sino calcular solo si hay deuda
        const diasBD = s.dias_mora && s.dias_mora > 0 ? s.dias_mora : 0
        const diasCalc = s.saldo_actual < 0 && s.ultima_actualizacion ? diasCalendario(s.ultima_actualizacion) : 0
        const dias = diasBD || diasCalc
        if (dias === 0) return <span className="text-gray-400">-</span>
        return <span className={`fact-badge ${dias > 7 ? 'fact-badge-red' : dias > 3 ? 'fact-badge-yellow' : 'fact-badge-gray'}`}>{dias} días</span>
      }
    },
    {
      accessorKey: 'monto_mora_acumulada',
      header: 'Mora Acum.',
      cell: ({ row }) => {
        const s = row.original
        // Mostrar valor de BD si existe, sino calcular solo si hay deuda
        const diasBD = s.dias_mora && s.dias_mora > 0 ? s.dias_mora : 0
        const diasCalc = s.saldo_actual < 0 && s.ultima_actualizacion ? diasCalendario(s.ultima_actualizacion) : 0
        const dias = diasBD || diasCalc
        const moraBD = s.monto_mora_acumulada && s.monto_mora_acumulada > 0 ? s.monto_mora_acumulada : 0
        const moraCalc = dias > 0 ? Math.round(Math.abs(s.saldo_actual) * (tasaMoraPct / 100) * dias * 100) / 100 : 0
        const mora = moraBD || moraCalc
        if (mora === 0) return <span className="text-gray-400">-</span>
        return (
          <span
            className="fact-precio fact-precio-negative"
            style={{ cursor: (isAdmin() || isAdministrativo()) ? 'pointer' : 'default', textDecoration: (isAdmin() || isAdministrativo()) ? 'underline dotted' : 'none' }}
            onClick={() => { if (isAdmin() || isAdministrativo()) editarMoraAcumulada(s) }}
            title={(isAdmin() || isAdministrativo()) ? 'Click para editar' : ''}
          >
            {formatCurrency(mora)}
          </span>
        )
      }
    },
    {
      accessorKey: 'ultima_actualizacion',
      header: 'Última Act.',
      cell: ({ row }) => (
        <span className="text-gray-500 text-sm">{row.original.ultima_actualizacion ? formatDate(row.original.ultima_actualizacion) : '-'}</span>
      )
    },
    {
      id: 'acciones',
      header: '',
      cell: ({ row }) => (
        <div className="fact-table-actions">
          <button className="fact-table-btn fact-table-btn-view" onClick={() => verHistorial(row.original)} data-tooltip="Ver historial">
            <Eye size={14} />
          </button>
          <button className="fact-table-btn" onClick={() => registrarPago(row.original)} data-tooltip="Registrar pago" style={{ color: '#16a34a' }}>
            <Banknote size={14} />
          </button>
          {(isAdmin() || isAdministrativo()) && (
            <button className="fact-table-btn fact-table-btn-edit" onClick={() => editarSaldo(row.original)} data-tooltip="Editar saldo">
              <Edit3 size={14} />
            </button>
          )}
          {isAdmin() && (
            <button className="fact-table-btn fact-table-btn-danger" onClick={() => eliminarSaldo(row.original)} data-tooltip="Eliminar">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      )
    }
  ], [conductorFilter, conductorSearch, conductoresFiltrados, estadoFilter, openColumnFilter])

  // IDs de conductores con cobros fraccionados pendientes
  const conductoresConFraccionado = useMemo(() => {
    return new Set(cobrosFraccionados.map(c => c.conductor_id))
  }, [cobrosFraccionados])

  const saldosFiltrados = useMemo(() => {
    return saldos.filter(s => {
      // Filtros de stats
      if (filtroSaldo === 'favor' && s.saldo_actual <= 0) return false
      if (filtroSaldo === 'deuda' && s.saldo_actual >= 0) return false
      if (filtroSaldo === 'mora') {
        if (s.saldo_actual >= 0 || !s.ultima_actualizacion) return false
        if (diasCalendario(s.ultima_actualizacion) <= 0) return false
      }
      if (filtroSaldo === 'fraccionado' && !conductoresConFraccionado.has(s.conductor_id)) return false
      // Filtros Excel
      if (conductorFilter.length > 0 && !conductorFilter.includes(s.conductor_nombre || '')) return false
      if (estadoFilter.length > 0) {
        const estado = s.saldo_actual > 0 ? 'favor' : s.saldo_actual < 0 ? 'deuda' : 'sin_saldo'
        if (!estadoFilter.includes(estado)) return false
      }
      // Filtro estado conductor
      if (estadoCondFilter !== 'todos') {
        const ec = ((s as any).conductor_estado || '').toUpperCase()
        if (estadoCondFilter === 'activo' && ec !== 'ACTIVO') return false
        if (estadoCondFilter === 'baja' && ec !== 'BAJA' && ec !== 'INACTIVO') return false
      }
      // Filtro asignado
      if (asignadoFilter === 'asignado' && !conductoresAsignados.has(s.conductor_id)) return false
      if (asignadoFilter === 'no_asignado' && conductoresAsignados.has(s.conductor_id)) return false
      return true
    })
  }, [saldos, filtroSaldo, conductorFilter, estadoFilter, estadoCondFilter, asignadoFilter, conductoresAsignados, conductoresConFraccionado])

  const stats = useMemo(() => {
    const total = saldos.length
    const conductoresFavor = saldos.filter(s => s.saldo_actual > 0)
    const conductoresDeuda = saldos.filter(s => s.saldo_actual < 0)
    const conductoresMora = saldos.filter(s => {
      if (s.saldo_actual >= 0 || !s.ultima_actualizacion) return false
      return diasCalendario(s.ultima_actualizacion) > 0
    })
    const conFavor = conductoresFavor.length
    const conDeuda = conductoresDeuda.length
    const enMora = conductoresMora.length
    const totalFavor = conductoresFavor.reduce((sum, s) => sum + s.saldo_actual, 0)
    const totalDeuda = conductoresDeuda.reduce((sum, s) => sum + Math.abs(s.saldo_actual), 0)
    
    // Stats de fraccionados
    const totalFraccionado = cobrosFraccionados.reduce((sum, c) => sum + c.monto_cuota, 0)
    const cuotasPendientes = cobrosFraccionados.length
    
    return { 
      total, conFavor, conDeuda, enMora, totalFavor, totalDeuda,
      conductoresFavor, conductoresDeuda, conductoresMora,
      totalFraccionado, cuotasPendientes
    }
  }, [saldos, cobrosFraccionados])

  // Columnas para la tabla de Abonos (UI de movimientos removida)
  // @ts-expect-error columnsAbonos preservado por si se reactiva la UI de movimientos
  const columnsAbonos = useMemo<ColumnDef<AbonoRow>[]>(() => [
    {
      accessorKey: 'fecha_abono',
      header: 'Fecha',
      cell: ({ row }) => (
        <span className="text-gray-700 text-sm">{formatDate(row.original.fecha_abono)}</span>
      )
    },
    {
      id: 'semana',
      header: 'Semana',
      cell: ({ row }) => {
        const { semana, anio } = row.original
        if (!semana || !anio) return <span className="text-gray-400">-</span>
        return <span className="text-gray-600 text-sm">S{semana}/{anio}</span>
      }
    },
    {
      accessorKey: 'conductor_nombre',
      header: 'Conductor',
      cell: ({ row }) => (
        <div className="font-medium">{row.original.conductor_nombre || 'N/A'}</div>
      )
    },
    {
      accessorKey: 'tipo',
      header: 'Tipo',
      cell: ({ row }) => {
        const tipo = row.original.tipo
        const esAbono = tipo === 'abono'
        return (
          <div className="flex items-center gap-1.5">
            {esAbono ? (
              <ArrowUpCircle size={14} className="text-green-600" />
            ) : (
              <ArrowDownCircle size={14} className="text-red-600" />
            )}
            <span 
              className="fact-badge" 
              style={{
                backgroundColor: esAbono ? '#DCFCE7' : '#FEE2E2',
                color: esAbono ? '#166534' : '#991B1B',
                fontSize: '11px',
                padding: '3px 8px'
              }}
            >
              {esAbono ? 'Abono' : 'Cargo'}
            </span>
          </div>
        )
      }
    },
    {
      accessorKey: 'monto',
      header: 'Monto',
      cell: ({ row }) => {
        const esAbono = row.original.tipo === 'abono'
        return (
          <span 
            className={`fact-precio ${esAbono ? '' : 'fact-precio-negative'}`} 
            style={{ fontWeight: 600 }}
          >
            {esAbono ? '+' : '-'}{formatCurrency(row.original.monto)}
          </span>
        )
      }
    },
    {
      accessorKey: 'concepto',
      header: 'Concepto',
      cell: ({ row }) => (
        <span className="text-gray-700 text-sm">{row.original.concepto}</span>
      )
    },
    {
      accessorKey: 'referencia',
      header: 'Referencia',
      cell: ({ row }) => (
        <span className="text-gray-500 text-sm">{row.original.referencia || '-'}</span>
      )
    },
    {
      id: 'acciones',
      header: '',
      cell: ({ row }) => (
        <div className="fact-table-actions">
          <button 
            className="fact-table-btn fact-table-btn-edit" 
            onClick={() => editarMovimiento(row.original)} 
            data-tooltip="Editar movimiento"
          >
            <Edit3 size={14} />
          </button>
        </div>
      )
    }
  ], [])

  // Stats para sub-tab Abonos (comentado - simplificado a solo total)
  /* const statsAbonos = useMemo(() => {
    const totalAbonos = todosLosAbonos.filter(a => a.tipo === 'abono')
    const totalCargos = todosLosAbonos.filter(a => a.tipo === 'cargo')
    return {
      cantidadAbonos: totalAbonos.length,
      cantidadCargos: totalCargos.length,
      montoAbonos: totalAbonos.reduce((sum, a) => sum + a.monto, 0),
      montoCargos: totalCargos.reduce((sum, a) => sum + a.monto, 0)
    }
  }, [todosLosAbonos]) */

  return (
    <>
      {/* Loading Overlay - bloquea toda la pantalla */}
      <LoadingOverlay show={loading} message="Cargando saldos..." size="lg" />

      {/* ===== SALDOS ===== */}
          {/* Input oculto para importar Excel */}
          <input
            type="file"
            ref={fileInputRef}
            accept=".xlsx,.xls"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) importarSaldos(file)
            }}
          />

          <div className="fact-header">
            <div className="fact-header-left">
              {(isAdmin() || isAdministrativo()) && (
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    className="fact-btn fact-btn-secondary"
                    onClick={exportarSaldos}
                    title="Exportar saldos a Excel"
                  >
                    <Download size={14} /> Exportar
                  </button>
                  <button
                    className="fact-btn fact-btn-primary"
                    onClick={() => fileInputRef.current?.click()}
                    title="Importar saldos desde Excel"
                  >
                    <Upload size={14} /> Importar
                  </button>
                </div>
              )}
            </div>
            <div className="fact-header-right" style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '2px', background: 'var(--bg-secondary)', borderRadius: '6px', padding: '2px' }}>
                {[
                  { value: 'todos' as const, label: 'Todos' },
                  { value: 'asignado' as const, label: 'Asignados' },
                  { value: 'no_asignado' as const, label: 'No asignados' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setAsignadoFilter(opt.value)}
                    style={{
                      padding: '4px 10px', fontSize: '11px', fontWeight: 600, borderRadius: '4px', border: 'none', cursor: 'pointer',
                      background: asignadoFilter === opt.value ? '#ff0033' : 'transparent',
                      color: asignadoFilter === opt.value ? 'white' : 'var(--text-secondary)',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '2px', background: 'var(--bg-secondary)', borderRadius: '6px', padding: '2px' }}>
                {[
                  { value: 'todos' as const, label: 'Todos' },
                  { value: 'activo' as const, label: 'Activos' },
                  { value: 'baja' as const, label: 'Baja' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setEstadoCondFilter(opt.value)}
                    style={{
                      padding: '4px 10px', fontSize: '11px', fontWeight: 600, borderRadius: '4px', border: 'none', cursor: 'pointer',
                      background: estadoCondFilter === opt.value ? '#ff0033' : 'transparent',
                      color: estadoCondFilter === opt.value ? 'white' : 'var(--text-secondary)',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <VerLogsButton tablas={['saldos_conductores', 'abonos_conductores', 'cobros_fraccionados']} label="Saldos" />
            </div>
          </div>

           {/* Stats */}
          <div className="fact-stats">
            <div className="fact-stats-grid">
              <div className="fact-stat-card">
                <Users size={18} className="fact-stat-icon" />
                <div className="fact-stat-content">
                  <span className="fact-stat-value">{stats.total}</span>
                  <span className="fact-stat-label">Conductores</span>
                </div>
              </div>
              <div className="fact-stat-card">
                <AlertTriangle size={18} className="fact-stat-icon" />
                <div className="fact-stat-content">
                  <span className="fact-stat-value">{formatCurrency(stats.totalDeuda)}</span>
                  <span className="fact-stat-label">Total Deuda</span>
                </div>
              </div>
            </div>
          </div>

          {/* Barra de filtros activos */}
          {(conductorFilter.length > 0 || estadoFilter.length > 0 || asignadoFilter !== 'todos') && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px',
              background: 'rgba(255, 0, 51, 0.04)', border: '1px solid rgba(255, 0, 51, 0.12)',
              borderRadius: '6px', marginBottom: '8px', flexWrap: 'wrap', fontSize: '12px'
            }}>
              <span style={{ color: '#ff0033', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Filter size={12} /> Filtros activos:
              </span>
              {conductorFilter.map(f => (
                <span key={f} style={{
                  background: '#ff0033', color: 'white', padding: '2px 8px', borderRadius: '10px',
                  fontSize: '11px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer'
                }} onClick={() => setConductorFilter(prev => prev.filter(v => v !== f))}>
                  {f} <span style={{ fontWeight: 700 }}>&times;</span>
                </span>
              ))}
              {estadoFilter.map(f => (
                <span key={f} style={{
                  background: '#ff0033', color: 'white', padding: '2px 8px', borderRadius: '10px',
                  fontSize: '11px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer'
                }} onClick={() => setEstadoFilter(prev => prev.filter(v => v !== f))}>
                  {f === 'favor' ? 'A Favor' : f === 'deuda' ? 'Deuda' : 'Sin Saldo'} <span style={{ fontWeight: 700 }}>&times;</span>
                </span>
              ))}
              {asignadoFilter !== 'todos' && (
                <span style={{
                  background: '#ff0033', color: 'white', padding: '2px 8px', borderRadius: '10px',
                  fontSize: '11px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer'
                }} onClick={() => setAsignadoFilter('todos')}>
                  {asignadoFilter === 'asignado' ? 'Asignados' : 'No asignados'} <span style={{ fontWeight: 700 }}>&times;</span>
                </span>
              )}
              <button
                onClick={() => { setConductorFilter([]); setEstadoFilter([]); setAsignadoFilter('todos'); setConductorSearch('') }}
                style={{
                  marginLeft: 'auto', background: 'transparent', border: '1px solid var(--border-primary)',
                  borderRadius: '4px', padding: '2px 8px', fontSize: '11px', cursor: 'pointer', color: 'var(--text-secondary)'
                }}
              >
                Limpiar todos
              </button>
            </div>
          )}

          {/* Tabla de Saldos */}
          <DataTable
            data={saldosFiltrados}
            columns={columns}
            loading={loading}
            searchPlaceholder="Buscar conductor..."
            emptyIcon={<Wallet size={48} />}
            emptyTitle="Sin saldos"
            emptyDescription="No hay saldos registrados"
            pageSize={100}
            pageSizeOptions={[10, 20, 50, 100]}
          />
      {/* Modal Kardex - Control de Saldos */}
      {kardexModal.open && kardexModal.saldo && (() => {
        const s = kardexModal.saldo
        const sColor = s.saldo_actual >= 0 ? '#16a34a' : '#dc2626'
        return (
          <div className="fact-modal-overlay" onClick={() => setKardexModal(prev => ({ ...prev, open: false }))}>
              <div className="fact-modal-content" style={{ maxWidth: '900px' }} onClick={(e) => e.stopPropagation()}>
              <div className="fact-modal-header">
                <h2>Control de Saldos</h2>
                <button className="fact-modal-close" onClick={() => setKardexModal(prev => ({ ...prev, open: false }))}>
                  <X size={20} />
                </button>
              </div>
              <div className="fact-modal-body" style={{ padding: '16px' }}>
                {/* Info conductor */}
                <div style={{
                  marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                  paddingBottom: '10px', borderBottom: '1px solid var(--border-primary)',
                }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{s.conductor_nombre}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      DNI: {s.conductor_dni || '-'} &middot; CUIT: {s.conductor_cuit || '-'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: sColor, lineHeight: 1 }}>
                      {formatCurrency(s.saldo_actual)}
                    </div>
                    <span style={{
                      display: 'inline-block', marginTop: '3px', padding: '1px 6px', borderRadius: '3px',
                      fontSize: '10px', fontWeight: 600,
                      background: s.saldo_actual >= 0 ? '#DCFCE7' : '#FEE2E2', color: sColor,
                    }}>
                      {s.saldo_actual >= 0 ? 'A Favor' : 'Deuda'}
                    </span>
                  </div>
                </div>

                {/* Tabla */}
                {kardexModal.loading ? (
                  <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '12px' }}>Cargando...</div>
                ) : kardexModal.rows.length === 0 ? (
                  <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '12px' }}>Sin registros</div>
                ) : (
                  <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid var(--border-primary)', borderRadius: '6px' }}>
                    <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg-secondary)', position: 'sticky', top: 0, zIndex: 1 }}>
                          {['Fecha', 'Semana', 'Tipo', 'Referencia', 'Monto', 'Saldo', 'Usuario'].map((h, hi) => (
                            <th key={hi} style={{
                              padding: '6px 8px', fontWeight: 600, color: 'var(--text-secondary)',
                              borderBottom: '1px solid var(--border-primary)',
                              textAlign: hi >= 4 ? 'right' : 'left',
                              ...(hi === 6 ? { textAlign: 'left' as const } : {}),
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {kardexModal.rows.map((r: any, i: number) => {
                          const pend = r.saldo_pendiente || 0
                          const tipo = r.tipo_movimiento || 'regularizado'
                          const tipoLabel: Record<string, string> = {
                            regularizado: 'Regularizado',
                            pago_cabify: 'Pago Cabify',
                            pago: 'Pago',
                            pago_manual: 'Pago Manual',
                            pago_cuota: 'Pago Cuota',
                            ajuste_manual: 'Ajuste',
                            eliminacion_pago: 'Elim. Pago',
                            edicion_pago: 'Edic. Pago',
                            cargo: 'Cargo',
                            abono: 'Abono',
                            eliminacion_saldo: 'Elim. Saldo',
                            importacion: 'Importacion',
                          }
                          const montoMov = r.monto_movimiento || 0
                          const fecha = r.created_at ? new Date(r.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '-'
                          return (
                            <tr key={i} style={{ borderBottom: '1px solid var(--border-primary)' }}>
                              <td style={{ padding: '5px 8px', color: 'var(--text-secondary)', fontSize: '10px', whiteSpace: 'nowrap' }}>
                                {fecha}
                              </td>
                              <td style={{ padding: '5px 8px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                                {r.anio} S{String(r.semana).padStart(2, '0')}
                              </td>
                              <td style={{ padding: '5px 8px', whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontSize: '10px' }}>
                                {tipoLabel[tipo] || tipo}
                              </td>
                              <td style={{ padding: '5px 8px', color: 'var(--text-secondary)', fontSize: '10px', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.referencia || ''}>
                                {r.referencia || '-'}
                              </td>
                              <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace', color: montoMov > 0 ? '#16a34a' : 'var(--text-tertiary)' }}>
                                {montoMov > 0 ? formatCurrency(montoMov) : '-'}
                              </td>
                              <td style={{
                                padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700,
                                color: pend < 0 ? '#dc2626' : pend > 0 ? '#16a34a' : 'var(--text-secondary)',
                              }}>
                                {formatCurrency(pend)}
                              </td>
                              <td style={{ padding: '5px 8px', color: 'var(--text-secondary)', fontSize: '10px', whiteSpace: 'nowrap' }}>
                                {r.created_by_name || 'Sistema'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}
    </>
  )
}
