import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../../lib/supabase'
import Swal from 'sweetalert2'
import { showSuccess } from '../../../utils/toast'
import {
  Wallet,
  Users,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Eye,
  Plus,
  DollarSign,
  Clock,
  Filter,
  Edit3,
  UserPlus,
  Trash2,
  Layers,
  Receipt,
  ArrowUpCircle,
  ArrowDownCircle
} from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../../../components/ui/DataTable'
import { LoadingOverlay } from '../../../components/ui/LoadingOverlay'
import type { SaldoConductor } from '../../../types/facturacion.types'

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

export function SaldosAbonosTab() {
  // Sub-tab activo
  const [activeSubTab, setActiveSubTab] = useState<'saldos' | 'abonos'>('saldos')
  
  const [saldos, setSaldos] = useState<SaldoConductor[]>([])
  const [todosLosAbonos, setTodosLosAbonos] = useState<AbonoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroSaldo, setFiltroSaldo] = useState<'todos' | 'favor' | 'deuda' | 'mora' | 'fraccionado'>('todos')
  const [cobrosFraccionados, setCobrosFraccionados] = useState<{
    conductor_id: string
    conductor_nombre: string
    monto_cuota: number
    numero_cuota: number
    total_cuotas: number
    semana: number
    anio: number
  }[]>([])

  // Estados para filtros Excel
  const [openColumnFilter, setOpenColumnFilter] = useState<string | null>(null)
  const [conductorFilter, setConductorFilter] = useState<string[]>([])
  const [conductorSearch, setConductorSearch] = useState('')
  const [estadoFilter, setEstadoFilter] = useState<string[]>([])

  useEffect(() => {
    cargarSaldos()
  }, [])

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
      // Cargar saldos con estado del conductor
      const { data, error } = await supabase
        .from('saldos_conductores')
        .select(`
          *,
          conductor:conductores(
            estado:conductores_estados(codigo)
          )
        `)
        .order('conductor_nombre')

      if (error) throw error
      
      // Mapear para incluir el estado del conductor
      const saldosConEstado = (data || []).map((s: {
        conductor?: { estado?: { codigo: string } | null } | null
      } & SaldoConductor) => ({
        ...s,
        conductor_estado: s.conductor?.estado?.codigo || null
      }))
      setSaldos(saldosConEstado)

      // Cargar cobros fraccionados pendientes (solo de saldos iniciales)
      const { data: fraccionados, error: errorFrac } = await supabase
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
        `)
        .eq('aplicado', false)
        .order('semana')

      if (errorFrac) throw errorFrac
      
      const fraccionadosConNombre = ((fraccionados || []) as CobroFraccionadoRow[]).map((f) => ({
        conductor_id: f.conductor_id,
        conductor_nombre: f.conductor ? `${f.conductor.apellidos}, ${f.conductor.nombres}` : 'N/A',
        monto_cuota: f.monto_cuota,
        numero_cuota: f.numero_cuota,
        total_cuotas: f.total_cuotas,
        semana: f.semana,
        anio: f.anio
      }))
      setCobrosFraccionados(fraccionadosConNombre)

      // Cargar todos los abonos para el sub-tab "Abonos"
      const { data: abonos, error: errorAbonos } = await supabase
        .from('abonos_conductores')
        .select('*')
        .order('fecha_abono', { ascending: false })
        .limit(500)

      if (errorAbonos) {
        console.error('Error cargando abonos:', errorAbonos)
      } else {
        console.log('Abonos cargados:', abonos?.length || 0, abonos)
      }

      // Obtener nombres de conductores desde saldos ya cargados
      const conductorNombres = new Map(saldosConEstado.map((s: SaldoConductor) => [s.conductor_id, s.conductor_nombre]))

      const abonosConNombre = ((abonos || []) as AbonoRow[]).map((a) => ({
        ...a,
        conductor_nombre: conductorNombres.get(a.conductor_id) || 'N/A'
      }))
      setTodosLosAbonos(abonosConNombre)
    } catch (error) {
      console.error('Error cargando saldos:', error)
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

  // Función para agregar saldo inicial a un conductor
  async function agregarSaldoInicial() {
    // Cargar conductores disponibles al momento de abrir el modal
    const { data: todosLosConductores } = await supabase
      .from('conductores')
      .select('id, nombres, apellidos')
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

  async function registrarAbono(saldo: SaldoConductor) {
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

      showSuccess(formValues.tipo === 'abono' ? 'Abono Registrado' : 'Cargo Registrado', `Nuevo saldo: ${formatCurrency(nuevoSaldo)}`)

      cargarSaldos()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo registrar', 'error')
    }
  }

  async function eliminarSaldo(saldo: SaldoConductor) {
    const result = await Swal.fire({
      title: 'Eliminar Saldo',
      html: `
        <p>¿Estás seguro de eliminar el saldo de <strong>${saldo.conductor_nombre}</strong>?</p>
        <p style="color: #ff0033; font-weight: 600; margin-top: 10px;">Saldo actual: ${formatCurrency(saldo.saldo_actual)}</p>
        <p style="font-size: 12px; color: #666; margin-top: 10px;">Esta acción eliminará el registro y sus cobros fraccionados asociados.</p>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#ff0033',
      cancelButtonColor: '#6B7280'
    })

    if (!result.isConfirmed) return

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

      showSuccess('Eliminado')

      cargarSaldos()
    } catch {
      Swal.fire('Error', 'No se pudo eliminar el saldo', 'error')
    }
  }

  async function editarSaldo(saldo: SaldoConductor) {
    const { value: formValues } = await Swal.fire({
      title: `<span style="font-size: 16px; font-weight: 600;">Editar Saldo</span>`,
      html: `
        <div style="text-align: left; font-size: 13px;">
          <div style="background: #F3F4F6; padding: 10px 12px; border-radius: 6px; margin-bottom: 12px;">
            <div style="font-weight: 600; color: #111827;">${saldo.conductor_nombre}</div>
          </div>
          <div style="margin-bottom: 12px;">
            <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px;">Saldo Actual:</label>
            <input id="swal-saldo" type="number" class="swal2-input" style="font-size: 14px; margin: 0; width: 100%;" value="${saldo.saldo_actual}">
            <span style="font-size: 10px; color: #6B7280;">Positivo = A Favor | Negativo = Deuda</span>
          </div>
          <div style="margin-bottom: 12px;">
            <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px;">Días en Mora:</label>
            <input id="swal-dias-mora" type="number" min="0" class="swal2-input" style="font-size: 14px; margin: 0; width: 100%;" value="${saldo.dias_mora || 0}">
          </div>
          <div>
            <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px;">Mora Acumulada:</label>
            <input id="swal-mora-acum" type="number" min="0" class="swal2-input" style="font-size: 14px; margin: 0; width: 100%;" value="${saldo.monto_mora_acumulada || 0}">
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
        const saldoActual = parseFloat((document.getElementById('swal-saldo') as HTMLInputElement).value)
        const diasMora = parseInt((document.getElementById('swal-dias-mora') as HTMLInputElement).value) || 0
        const moraAcumulada = parseFloat((document.getElementById('swal-mora-acum') as HTMLInputElement).value) || 0

        if (isNaN(saldoActual)) {
          Swal.showValidationMessage('Ingrese un saldo válido')
          return false
        }
        if (diasMora < 0) {
          Swal.showValidationMessage('Los días de mora no pueden ser negativos')
          return false
        }
        if (moraAcumulada < 0) {
          Swal.showValidationMessage('La mora acumulada no puede ser negativa')
          return false
        }

        return { saldoActual, diasMora, moraAcumulada }
      }
    })

    if (!formValues) return

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('saldos_conductores') as any)
        .update({
          saldo_actual: formValues.saldoActual,
          dias_mora: formValues.diasMora,
          monto_mora_acumulada: formValues.moraAcumulada,
          ultima_actualizacion: new Date().toISOString()
        })
        .eq('id', saldo.id)

      if (error) throw error

      showSuccess('Actualizado', 'El saldo ha sido actualizado correctamente')

      cargarSaldos()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo actualizar el saldo', 'error')
    }
  }

  async function verHistorial(saldo: SaldoConductor) {
    try {
      const { data: abonos, error } = await supabase
        .from('abonos_conductores')
        .select('*')
        .eq('conductor_id', saldo.conductor_id)
        .order('fecha_abono', { ascending: false })
        .limit(20)

      if (error) throw error

      const historialHtml = abonos && abonos.length > 0
        ? (abonos as AbonoRow[]).map((a) => `
            <tr>
              <td style="padding: 6px 8px; border-bottom: 1px solid #E5E7EB;">${formatDate(a.fecha_abono)}</td>
              <td style="padding: 6px 8px; border-bottom: 1px solid #E5E7EB; text-align: center; color: #6B7280; font-size: 11px;">
                ${a.semana && a.anio ? `S${a.semana}/${a.anio}` : '-'}
              </td>
              <td style="padding: 6px 8px; border-bottom: 1px solid #E5E7EB; text-align: right;">
                <span style="color: ${a.tipo === 'abono' ? '#16a34a' : '#dc2626'}; font-weight: 600;">${a.tipo === 'abono' ? '+' : '-'}${formatCurrency(a.monto)}</span>
              </td>
              <td style="padding: 6px 8px; border-bottom: 1px solid #E5E7EB;">${a.concepto}</td>
              <td style="padding: 6px 8px; border-bottom: 1px solid #E5E7EB; color: #6B7280;">${a.referencia || '-'}</td>
            </tr>
          `).join('')
        : '<tr><td colspan="5" style="padding: 16px; text-align: center; color: #9CA3AF;">Sin movimientos</td></tr>'

      const saldoColor = saldo.saldo_actual >= 0 ? '#16a34a' : '#dc2626'
      const saldoLabel = saldo.saldo_actual >= 0 ? 'A Favor' : 'Deuda'

      Swal.fire({
        title: `<span style="font-size: 16px; font-weight: 600;">Historial de Movimientos</span>`,
        html: `
          <div style="text-align: left; font-size: 13px;">
            <div style="background: #F3F4F6; padding: 10px 12px; border-radius: 6px; margin-bottom: 12px;">
              <div style="font-weight: 600; color: #111827;">${saldo.conductor_nombre}</div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px;">
                <span style="color: ${saldoColor}; font-size: 14px; font-weight: 700;">${formatCurrency(saldo.saldo_actual)}</span>
                <span style="background: ${saldo.saldo_actual >= 0 ? '#DCFCE7' : '#FEE2E2'}; color: ${saldoColor}; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">${saldoLabel}</span>
              </div>
              ${saldo.dias_mora && saldo.dias_mora > 0 ? `<div style="color: #ff0033; font-size: 11px; margin-top: 4px;">En mora: ${saldo.dias_mora} días</div>` : ''}
            </div>
            <div style="max-height: 220px; overflow-y: auto; border: 1px solid #E5E7EB; border-radius: 6px;">
              <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                <thead>
                  <tr style="background: #F9FAFB;">
                    <th style="padding: 6px 8px; text-align: left; font-weight: 600;">Fecha</th>
                    <th style="padding: 6px 8px; text-align: center; font-weight: 600;">Sem.</th>
                    <th style="padding: 6px 8px; text-align: right; font-weight: 600;">Monto</th>
                    <th style="padding: 6px 8px; text-align: left; font-weight: 600;">Concepto</th>
                    <th style="padding: 6px 8px; text-align: left; font-weight: 600;">Ref.</th>
                  </tr>
                </thead>
                <tbody>${historialHtml}</tbody>
              </table>
            </div>
          </div>
        `,
        width: 420,
        confirmButtonText: 'Cerrar',
        confirmButtonColor: '#6B7280',
        customClass: {
          popup: 'swal-compact',
          title: 'swal-title-compact',
          htmlContainer: 'swal-html-compact'
        }
      })
    } catch (error) {
      console.error('Error cargando historial:', error)
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
    } catch (error) {
      console.error('Error actualizando movimiento:', error)
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
        const dias = row.original.dias_mora || 0
        if (dias === 0) return <span className="text-gray-400">-</span>
        return <span className={`fact-badge ${dias > 3 ? 'fact-badge-red' : 'fact-badge-yellow'}`}>{dias} días</span>
      }
    },
    {
      accessorKey: 'monto_mora_acumulada',
      header: 'Mora Acum.',
      cell: ({ row }) => {
        const mora = row.original.monto_mora_acumulada || 0
        if (mora === 0) return <span className="text-gray-400">-</span>
        return <span className="fact-precio fact-precio-negative">{formatCurrency(mora)}</span>
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
          <button className="fact-table-btn fact-table-btn-edit" onClick={() => editarSaldo(row.original)} data-tooltip="Editar">
            <Edit3 size={14} />
          </button>
          <button className="fact-table-btn fact-table-btn-success" onClick={() => registrarAbono(row.original)} data-tooltip="Registrar movimiento">
            <Plus size={14} />
          </button>
          <button className="fact-table-btn fact-table-btn-danger" onClick={() => eliminarSaldo(row.original)} data-tooltip="Eliminar">
            <Trash2 size={14} />
          </button>
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
      if (filtroSaldo === 'mora' && (s.dias_mora || 0) === 0) return false
      if (filtroSaldo === 'fraccionado' && !conductoresConFraccionado.has(s.conductor_id)) return false
      // Filtros Excel
      if (conductorFilter.length > 0 && !conductorFilter.includes(s.conductor_nombre || '')) return false
      if (estadoFilter.length > 0) {
        const estado = s.saldo_actual > 0 ? 'favor' : s.saldo_actual < 0 ? 'deuda' : 'sin_saldo'
        if (!estadoFilter.includes(estado)) return false
      }
      return true
    })
  }, [saldos, filtroSaldo, conductorFilter, estadoFilter, conductoresConFraccionado])

  const stats = useMemo(() => {
    const total = saldos.length
    const conductoresFavor = saldos.filter(s => s.saldo_actual > 0)
    const conductoresDeuda = saldos.filter(s => s.saldo_actual < 0)
    const conductoresMora = saldos.filter(s => (s.dias_mora || 0) > 0)
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

  // Columnas para la tabla de Abonos
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

  // Stats para sub-tab Abonos
  const statsAbonos = useMemo(() => {
    const totalAbonos = todosLosAbonos.filter(a => a.tipo === 'abono')
    const totalCargos = todosLosAbonos.filter(a => a.tipo === 'cargo')
    return {
      cantidadAbonos: totalAbonos.length,
      cantidadCargos: totalCargos.length,
      montoAbonos: totalAbonos.reduce((sum, a) => sum + a.monto, 0),
      montoCargos: totalCargos.reduce((sum, a) => sum + a.monto, 0)
    }
  }, [todosLosAbonos])

  return (
    <>
      {/* Loading Overlay - bloquea toda la pantalla */}
      <LoadingOverlay show={loading} message="Cargando saldos..." size="lg" />

      {/* Sub-tabs de navegación */}
      <div className="fact-subtabs" style={{ 
        display: 'flex', 
        gap: '4px', 
        marginBottom: '16px',
        borderBottom: '1px solid #E5E7EB',
        paddingBottom: '0'
      }}>
        <button
          className={`fact-subtab ${activeSubTab === 'saldos' ? 'fact-subtab-active' : ''}`}
          onClick={() => setActiveSubTab('saldos')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '10px 16px',
            border: 'none',
            background: activeSubTab === 'saldos' ? '#ff0033' : 'transparent',
            color: activeSubTab === 'saldos' ? 'white' : '#6B7280',
            borderRadius: '6px 6px 0 0',
            cursor: 'pointer',
            fontWeight: 500,
            fontSize: '13px',
            transition: 'all 0.15s',
            flex: 1
          }}
        >
          <Wallet size={16} />
          Saldos
          <span style={{
            background: activeSubTab === 'saldos' ? 'rgba(255,255,255,0.2)' : '#E5E7EB',
            padding: '2px 6px',
            borderRadius: '10px',
            fontSize: '11px'
          }}>
            {stats.total}
          </span>
        </button>
        <button
          className={`fact-subtab ${activeSubTab === 'abonos' ? 'fact-subtab-active' : ''}`}
          onClick={() => setActiveSubTab('abonos')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '10px 16px',
            border: 'none',
            background: activeSubTab === 'abonos' ? '#ff0033' : 'transparent',
            color: activeSubTab === 'abonos' ? 'white' : '#6B7280',
            borderRadius: '6px 6px 0 0',
            cursor: 'pointer',
            fontWeight: 500,
            fontSize: '13px',
            transition: 'all 0.15s',
            flex: 1
          }}
        >
          <Receipt size={16} />
          Movimientos
          <span style={{
            background: activeSubTab === 'abonos' ? 'rgba(255,255,255,0.2)' : '#E5E7EB',
            padding: '2px 6px',
            borderRadius: '10px',
            fontSize: '11px'
          }}>
            {todosLosAbonos.length}
          </span>
        </button>
      </div>

      {/* ===== SUB-TAB: SALDOS ===== */}
      {activeSubTab === 'saldos' && (
        <>
          {/* Header con filtro y botón agregar */}
          <div className="fact-header">
            <div className="fact-header-left">
              <span className="fact-label">Filtrar:</span>
              <select className="fact-select" value={filtroSaldo} onChange={(e) => setFiltroSaldo(e.target.value as typeof filtroSaldo)}>
                <option value="todos">Todos</option>
                <option value="favor">Con saldo a favor</option>
                <option value="deuda">Con deuda</option>
                <option value="mora">En mora</option>
                <option value="fraccionado">Fraccionado</option>
              </select>
            </div>
            <div className="fact-header-right">
              <button 
                className="fact-btn fact-btn-primary"
                onClick={agregarSaldoInicial}
                title="Agregar saldo inicial a un conductor"
              >
                <UserPlus size={16} />
                <span>Agregar Saldo</span>
              </button>
            </div>
          </div>

          {/* Stats - Clickeables como filtros */}
          <div className="fact-stats">
            <div className="fact-stats-grid">
              <div 
                className={`fact-stat-card ${filtroSaldo === 'todos' ? 'fact-stat-card-active' : ''}`}
                onClick={() => setFiltroSaldo('todos')}
                style={{ cursor: 'pointer' }}
                title="Ver todos"
              >
                <Users size={18} className="fact-stat-icon" />
                <div className="fact-stat-content">
                  <span className="fact-stat-value">{stats.total}</span>
                  <span className="fact-stat-label">Conductores</span>
                </div>
              </div>
              <div 
                className={`fact-stat-card ${filtroSaldo === 'favor' ? 'fact-stat-card-active' : ''}`}
                onClick={() => setFiltroSaldo('favor')}
                style={{ cursor: 'pointer' }}
                title="Filtrar por saldo a favor"
              >
                <TrendingUp size={18} className="fact-stat-icon" />
                <div className="fact-stat-content">
                  <span className="fact-stat-value">{stats.conFavor}</span>
                  <span className="fact-stat-label">Con Saldo a Favor</span>
                </div>
              </div>
              <div 
                className={`fact-stat-card ${filtroSaldo === 'deuda' ? 'fact-stat-card-active' : ''}`}
                onClick={() => setFiltroSaldo('deuda')}
                style={{ cursor: 'pointer' }}
                title="Filtrar por deuda"
              >
                <TrendingDown size={18} className="fact-stat-icon" />
                <div className="fact-stat-content">
                  <span className="fact-stat-value">{stats.conDeuda}</span>
                  <span className="fact-stat-label">Con Deuda</span>
                </div>
              </div>
              <div 
                className={`fact-stat-card ${filtroSaldo === 'mora' ? 'fact-stat-card-active' : ''}`}
                onClick={() => setFiltroSaldo('mora')}
                style={{ cursor: 'pointer' }}
                title="Filtrar por mora"
              >
                <Clock size={18} className="fact-stat-icon" />
                <div className="fact-stat-content">
                  <span className="fact-stat-value">{stats.enMora}</span>
                  <span className="fact-stat-label">En Mora</span>
                </div>
              </div>
              <div 
                className={`fact-stat-card ${filtroSaldo === 'favor' ? 'fact-stat-card-active' : ''}`}
                onClick={() => setFiltroSaldo('favor')}
                style={{ cursor: 'pointer' }}
                title="Filtrar por saldo a favor"
              >
                <DollarSign size={18} className="fact-stat-icon" />
                <div className="fact-stat-content">
                  <span className="fact-stat-value">{formatCurrency(stats.totalFavor)}</span>
                  <span className="fact-stat-label">Total a Favor</span>
                </div>
              </div>
              <div 
                className={`fact-stat-card ${filtroSaldo === 'deuda' ? 'fact-stat-card-active' : ''}`}
                onClick={() => setFiltroSaldo('deuda')}
                style={{ cursor: 'pointer' }}
                title="Filtrar por deuda"
              >
                <AlertTriangle size={18} className="fact-stat-icon" />
                <div className="fact-stat-content">
                  <span className="fact-stat-value">{formatCurrency(stats.totalDeuda)}</span>
                  <span className="fact-stat-label">Total Deuda</span>
                </div>
              </div>
              <div 
                className={`fact-stat-card ${filtroSaldo === 'fraccionado' ? 'fact-stat-card-active' : ''}`}
                onClick={() => setFiltroSaldo('fraccionado')}
                style={{ cursor: 'pointer', borderLeft: '3px solid #8B5CF6' }}
                title="Filtrar por fraccionado"
              >
                <Layers size={18} className="fact-stat-icon" style={{ color: '#8B5CF6' }} />
                <div className="fact-stat-content">
                  <span className="fact-stat-value" style={{ color: '#8B5CF6' }}>{formatCurrency(stats.totalFraccionado)}</span>
                  <span className="fact-stat-label">Fraccionado ({stats.cuotasPendientes} cuotas)</span>
                </div>
              </div>
            </div>
          </div>

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
        </>
      )}

      {/* ===== SUB-TAB: MOVIMIENTOS/ABONOS ===== */}
      {activeSubTab === 'abonos' && (
        <>
          {/* Stats de Movimientos */}
          <div className="fact-stats" style={{ marginBottom: '16px' }}>
            <div className="fact-stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              <div className="fact-stat-card">
                <Receipt size={18} className="fact-stat-icon" />
                <div className="fact-stat-content">
                  <span className="fact-stat-value">{todosLosAbonos.length}</span>
                  <span className="fact-stat-label">Total Movimientos</span>
                </div>
              </div>
              <div className="fact-stat-card" style={{ borderLeft: '3px solid #16a34a' }}>
                <ArrowUpCircle size={18} className="fact-stat-icon" style={{ color: '#16a34a' }} />
                <div className="fact-stat-content">
                  <span className="fact-stat-value" style={{ color: '#16a34a' }}>{statsAbonos.cantidadAbonos}</span>
                  <span className="fact-stat-label">Abonos</span>
                </div>
              </div>
              <div className="fact-stat-card" style={{ borderLeft: '3px solid #dc2626' }}>
                <ArrowDownCircle size={18} className="fact-stat-icon" style={{ color: '#dc2626' }} />
                <div className="fact-stat-content">
                  <span className="fact-stat-value" style={{ color: '#dc2626' }}>{statsAbonos.cantidadCargos}</span>
                  <span className="fact-stat-label">Cargos</span>
                </div>
              </div>
              <div className="fact-stat-card">
                <DollarSign size={18} className="fact-stat-icon" />
                <div className="fact-stat-content">
                  <span className="fact-stat-value">
                    <span style={{ color: '#16a34a' }}>+{formatCurrency(statsAbonos.montoAbonos)}</span>
                    {' / '}
                    <span style={{ color: '#dc2626' }}>-{formatCurrency(statsAbonos.montoCargos)}</span>
                  </span>
                  <span className="fact-stat-label">Abonos / Cargos</span>
                </div>
              </div>
            </div>
          </div>

          {/* Tabla de Movimientos */}
          <DataTable
            data={todosLosAbonos}
            columns={columnsAbonos}
            loading={loading}
            searchPlaceholder="Buscar por conductor, concepto..."
            emptyIcon={<Receipt size={48} />}
            emptyTitle="Sin movimientos"
            emptyDescription="No hay abonos ni cargos registrados"
            pageSize={50}
            pageSizeOptions={[20, 50, 100, 200]}
          />
        </>
      )}
    </>
  )
}
