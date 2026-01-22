/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../../lib/supabase'
import Swal from 'sweetalert2'
import {
  Shield,
  Users,
  CheckCircle,
  Clock,
  AlertTriangle,
  Eye,
  Plus,
  DollarSign,
  Filter,
  Edit3,
  UserPlus,
  Trash2,
  Receipt,
  ArrowUpCircle
} from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../../../components/ui/DataTable'
import type { GarantiaConductor } from '../../../types/facturacion.types'
import { formatCurrency, formatDate, FACTURACION_CONFIG } from '../../../types/facturacion.types'

interface ConductorBasico {
  id: string
  nombres: string
  apellidos: string
}

interface PagoGarantiaRow {
  id: string
  garantia_id: string
  conductor_id: string
  numero_cuota: number
  monto: number
  fecha_pago: string
  referencia: string | null
  semana: number | null
  anio: number | null
  conductor_nombre?: string
}

export function GarantiasTab() {
  // Sub-tab activo
  const [activeSubTab, setActiveSubTab] = useState<'garantias' | 'movimientos'>('garantias')
  
  const [garantias, setGarantias] = useState<GarantiaConductor[]>([])
  const [todosLosPagos, setTodosLosPagos] = useState<PagoGarantiaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroEstado, setFiltroEstado] = useState<string>('todos')

  // Estados para filtros Excel - Garantías
  const [openColumnFilter, setOpenColumnFilter] = useState<string | null>(null)
  const [conductorFilter, setConductorFilter] = useState<string[]>([])
  const [conductorSearch, setConductorSearch] = useState('')
  const [tipoFilter, setTipoFilter] = useState<string[]>([])
  const [estadoFilter, setEstadoFilter] = useState<string[]>([])

  // Estados para filtros Excel - Movimientos
  const [movConductorFilter, setMovConductorFilter] = useState<string[]>([])
  const [movConductorSearch, setMovConductorSearch] = useState('')

  useEffect(() => {
    cargarGarantias()
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
    [...new Set(garantias.map(g => g.conductor_nombre).filter(Boolean) as string[])].sort()
  , [garantias])

  const conductoresFiltrados = useMemo(() => {
    if (!conductorSearch) return conductoresUnicos
    return conductoresUnicos.filter(c => c.toLowerCase().includes(conductorSearch.toLowerCase()))
  }, [conductoresUnicos, conductorSearch])

  // Para movimientos
  const movConductoresUnicos = useMemo(() =>
    [...new Set(todosLosPagos.map(p => p.conductor_nombre).filter(Boolean) as string[])].sort()
  , [todosLosPagos])

  const movConductoresFiltrados = useMemo(() => {
    if (!movConductorSearch) return movConductoresUnicos
    return movConductoresUnicos.filter(c => c.toLowerCase().includes(movConductorSearch.toLowerCase()))
  }, [movConductoresUnicos, movConductorSearch])

  // Toggle functions
  const toggleConductorFilter = (val: string) => setConductorFilter(prev =>
    prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
  )
  const toggleTipoFilter = (val: string) => setTipoFilter(prev =>
    prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
  )
  const toggleEstadoFilter = (val: string) => setEstadoFilter(prev =>
    prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
  )
  const toggleMovConductorFilter = (val: string) => setMovConductorFilter(prev =>
    prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
  )

  async function cargarGarantias() {
    setLoading(true)
    try {
      // Cargar garantías
      const { data, error } = await supabase
        .from('garantias_conductores')
        .select('*')
        .order('conductor_nombre')

      if (error) throw error
      setGarantias(data || [])

      // Cargar todos los pagos para el sub-tab "Movimientos"
      const { data: pagos, error: errorPagos } = await supabase
        .from('garantias_pagos')
        .select('*')
        .order('fecha_pago', { ascending: false })
        .limit(500)

      if (errorPagos) {
        console.error('Error cargando pagos:', errorPagos)
      }

      // Obtener nombres de conductores desde garantías ya cargadas
      const conductorNombres = new Map((data || []).map((g: GarantiaConductor) => [g.conductor_id, g.conductor_nombre]))

      const pagosConNombre = ((pagos || []) as PagoGarantiaRow[]).map((p) => ({
        ...p,
        conductor_nombre: conductorNombres.get(p.conductor_id) || 'N/A'
      }))
      setTodosLosPagos(pagosConNombre)
    } catch (error) {
      console.error('Error cargando garantías:', error)
    } finally {
      setLoading(false)
    }
  }

  // ========== FUNCIONES PARA GARANTÍAS ==========

  async function agregarGarantia() {
    // Cargar todos los conductores
    const { data: conductores } = await supabase
      .from('conductores')
      .select('id, nombres, apellidos')
      .order('apellidos')

    const conductoresDisponibles = ((conductores || []) as ConductorBasico[]).filter((c) => 
      !garantias.some(g => g.conductor_id === c.id)
    )

    if (conductoresDisponibles.length === 0) {
      if (!conductores || conductores.length === 0) {
        Swal.fire('Info', 'No se encontraron conductores en el sistema', 'info')
      } else {
        Swal.fire('Info', 'Todos los conductores ya tienen garantía registrada', 'info')
      }
      return
    }

    // Generar opciones de semana
    const hoy = new Date()
    const semanaActual = Math.ceil((hoy.getTime() - new Date(hoy.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000))
    const anioActual = hoy.getFullYear()
    
    // Generar opciones de año y semana por separado
    const anioOptions = `<option value="2025">2025</option><option value="${anioActual}" selected>${anioActual}</option>`
    let semanaOptionsHtml = ''
    for (let s = 1; s <= 52; s++) {
      const selected = s === semanaActual ? 'selected' : ''
      semanaOptionsHtml += `<option value="${s}" ${selected}>${s}</option>`
    }

    const { value: formValues } = await Swal.fire({
      title: '<span style="font-size: 16px; font-weight: 600;">Agregar Garantía</span>',
      html: `
        <div style="text-align: left; font-size: 13px;">
          <div style="margin-bottom: 12px; position: relative;">
            <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px; font-weight: 500;">Conductor:</label>
            <input id="swal-conductor-search" type="text" class="swal2-input" style="font-size: 14px; margin: 0; width: 100%;" placeholder="Buscar conductor..." autocomplete="off">
            <input type="hidden" id="swal-conductor" value="">
            <div id="swal-conductor-dropdown" style="display: none; position: absolute; top: 100%; left: 0; right: 0; max-height: 200px; overflow-y: auto; background: white; border: 1px solid #e5e5e5; border-top: none; border-radius: 0 0 6px 6px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); z-index: 9999;"></div>
          </div>
          <div style="margin-bottom: 12px;">
            <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px; font-weight: 500;">Tipo de Alquiler:</label>
            <select id="swal-tipo" class="swal2-select" style="width: 100%; font-size: 14px; padding: 8px;">
              <option value="CARGO">A CARGO</option>
              <option value="TURNO">TURNO</option>
            </select>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
            <div>
              <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px; font-weight: 500;">Semana:</label>
              <select id="swal-semana" class="swal2-select" style="width: 100%; font-size: 14px; padding: 8px;">
                ${semanaOptionsHtml}
              </select>
            </div>
            <div>
              <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px; font-weight: 500;">Año:</label>
              <select id="swal-anio" class="swal2-select" style="width: 100%; font-size: 14px; padding: 8px;">
                ${anioOptions}
              </select>
            </div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
            <div>
              <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px; font-weight: 500;">Monto Total:</label>
              <input id="swal-monto" type="number" class="swal2-input" style="font-size: 14px; margin: 0; width: 100%;" value="${FACTURACION_CONFIG.GARANTIA_TOTAL_CARGO}">
            </div>
            <div>
              <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px; font-weight: 500;">Cuotas:</label>
              <input id="swal-cuotas" type="number" class="swal2-input" style="font-size: 14px; margin: 0; width: 100%;" value="${FACTURACION_CONFIG.GARANTIA_CUOTAS_CARGO}">
            </div>
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Agregar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#DC2626',
      width: 400,
      didOpen: () => {
        // Configurar búsqueda con dropdown custom
        const searchInput = document.getElementById('swal-conductor-search') as HTMLInputElement
        const hiddenInput = document.getElementById('swal-conductor') as HTMLInputElement
        const dropdown = document.getElementById('swal-conductor-dropdown') as HTMLDivElement
        
        const renderDropdown = (filter: string) => {
          const filterLower = filter.toLowerCase()
          const filtered = conductoresDisponibles.filter(c => {
            const fullName = `${c.apellidos} ${c.nombres}`.toLowerCase()
            return fullName.includes(filterLower)
          }).slice(0, 50)
          
          if (filtered.length === 0) {
            dropdown.innerHTML = '<div style="padding: 12px; color: #999; text-align: center;">No se encontraron resultados</div>'
          } else {
            dropdown.innerHTML = filtered.map(c => `
              <div class="conductor-option" data-id="${c.id}" style="padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #f0f0f0; transition: background 0.15s;">
                <strong style="color: #DC2626;">${c.apellidos}, ${c.nombres}</strong>
              </div>
            `).join('')
            
            dropdown.querySelectorAll('.conductor-option').forEach(opt => {
              opt.addEventListener('mouseenter', () => (opt as HTMLElement).style.background = '#f5f5f5')
              opt.addEventListener('mouseleave', () => (opt as HTMLElement).style.background = 'white')
              opt.addEventListener('click', () => {
                const id = (opt as HTMLElement).dataset.id || ''
                const c = conductoresDisponibles.find(x => x.id === id)
                if (c) {
                  searchInput.value = `${c.apellidos}, ${c.nombres}`
                  hiddenInput.value = id
                  dropdown.style.display = 'none'
                }
              })
            })
          }
        }
        
        searchInput.addEventListener('focus', () => {
          renderDropdown(searchInput.value)
          dropdown.style.display = 'block'
        })
        
        searchInput.addEventListener('input', () => {
          renderDropdown(searchInput.value)
          dropdown.style.display = 'block'
          hiddenInput.value = '' // Reset selection when typing
        })
        
        // Cerrar dropdown al hacer click fuera
        document.addEventListener('click', (e) => {
          if (!searchInput.contains(e.target as Node) && !dropdown.contains(e.target as Node)) {
            dropdown.style.display = 'none'
          }
        })
      },
      preConfirm: () => {
        const conductorId = (document.getElementById('swal-conductor') as HTMLInputElement).value
        const tipo = (document.getElementById('swal-tipo') as HTMLSelectElement).value
        const semanaInicio = parseInt((document.getElementById('swal-semana') as HTMLSelectElement).value)
        const anioInicio = parseInt((document.getElementById('swal-anio') as HTMLSelectElement).value)
        const monto = parseFloat((document.getElementById('swal-monto') as HTMLInputElement).value)
        const cuotas = parseInt((document.getElementById('swal-cuotas') as HTMLInputElement).value)

        if (!conductorId) {
          Swal.showValidationMessage('Seleccione un conductor')
          return false
        }
        if (!monto || monto <= 0) {
          Swal.showValidationMessage('Ingrese un monto válido')
          return false
        }
        if (!cuotas || cuotas < 1) {
          Swal.showValidationMessage('Ingrese número de cuotas válido')
          return false
        }

        const conductor = conductoresDisponibles.find((c) => c.id === conductorId)
        return { 
          conductorId, 
          conductorNombre: conductor ? `${conductor.apellidos}, ${conductor.nombres}` : '',
          tipo,
          monto,
          cuotas,
          semanaInicio,
          anioInicio
        }
      }
    })

    if (!formValues) return

    try {
      const { error } = await (supabase.from('garantias_conductores') as any).insert({
        conductor_id: formValues.conductorId,
        conductor_nombre: formValues.conductorNombre,
        tipo_alquiler: formValues.tipo,
        monto_total: formValues.monto,
        monto_pagado: 0,
        cuotas_totales: formValues.cuotas,
        cuotas_pagadas: 0,
        estado: 'pendiente',
        semana_inicio: formValues.semanaInicio,
        anio_inicio: formValues.anioInicio
      })

      if (error) throw error

      Swal.fire({
        icon: 'success',
        title: 'Garantía Agregada',
        timer: 1500,
        showConfirmButton: false
      })

      cargarGarantias()
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo agregar la garantía', 'error')
    }
  }

  async function editarGarantia(garantia: GarantiaConductor) {
    const { value: formValues } = await Swal.fire({
      title: `<span style="font-size: 16px; font-weight: 600;">Editar Garantía</span>`,
      html: `
        <div style="text-align: left; font-size: 13px;">
          <div style="background: #F3F4F6; padding: 10px 12px; border-radius: 6px; margin-bottom: 12px;">
            <div style="font-weight: 600; color: #111827;">${garantia.conductor_nombre}</div>
          </div>
          <div style="margin-bottom: 12px;">
            <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px;">Cuotas Pagadas:</label>
            <input id="swal-cuotas-pagadas" type="number" min="0" class="swal2-input" style="font-size: 14px; margin: 0; width: 100%;" value="${garantia.cuotas_pagadas}">
          </div>
          <div style="margin-bottom: 12px;">
            <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px;">Cuotas Totales:</label>
            <input id="swal-cuotas-totales" type="number" min="1" class="swal2-input" style="font-size: 14px; margin: 0; width: 100%;" value="${garantia.cuotas_totales}">
          </div>
          <div style="margin-bottom: 12px;">
            <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px;">Monto Pagado:</label>
            <input id="swal-monto-pagado" type="number" min="0" class="swal2-input" style="font-size: 14px; margin: 0; width: 100%;" value="${garantia.monto_pagado}">
          </div>
          <div>
            <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px;">Monto Total:</label>
            <input id="swal-monto-total" type="number" min="0" class="swal2-input" style="font-size: 14px; margin: 0; width: 100%;" value="${garantia.monto_total}">
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#DC2626',
      width: 340,
      preConfirm: () => {
        const cuotasPagadas = parseInt((document.getElementById('swal-cuotas-pagadas') as HTMLInputElement).value)
        const cuotasTotales = parseInt((document.getElementById('swal-cuotas-totales') as HTMLInputElement).value)
        const montoPagado = parseFloat((document.getElementById('swal-monto-pagado') as HTMLInputElement).value)
        const montoTotal = parseFloat((document.getElementById('swal-monto-total') as HTMLInputElement).value)

        if (isNaN(cuotasPagadas) || cuotasPagadas < 0) {
          Swal.showValidationMessage('Cuotas pagadas debe ser un número válido')
          return false
        }
        if (isNaN(cuotasTotales) || cuotasTotales < 1) {
          Swal.showValidationMessage('Cuotas totales debe ser al menos 1')
          return false
        }
        if (cuotasPagadas > cuotasTotales) {
          Swal.showValidationMessage('Cuotas pagadas no puede ser mayor que cuotas totales')
          return false
        }

        return { cuotasPagadas, cuotasTotales, montoPagado, montoTotal }
      }
    })

    if (!formValues) return

    try {
      let nuevoEstado = garantia.estado
      if (formValues.montoPagado >= formValues.montoTotal || formValues.cuotasPagadas >= formValues.cuotasTotales) {
        nuevoEstado = 'completada'
      } else if (formValues.montoPagado > 0 || formValues.cuotasPagadas > 0) {
        nuevoEstado = 'en_curso'
      } else {
        nuevoEstado = 'pendiente'
      }

      const { error } = await (supabase.from('garantias_conductores') as any)
        .update({
          cuotas_pagadas: formValues.cuotasPagadas,
          cuotas_totales: formValues.cuotasTotales,
          monto_pagado: formValues.montoPagado,
          monto_total: formValues.montoTotal,
          estado: nuevoEstado
        })
        .eq('id', garantia.id)

      if (error) throw error

      Swal.fire({
        icon: 'success',
        title: 'Actualizado',
        timer: 1500,
        showConfirmButton: false
      })

      cargarGarantias()
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo actualizar', 'error')
    }
  }

  async function eliminarGarantia(garantia: GarantiaConductor) {
    const result = await Swal.fire({
      title: 'Eliminar Garantía',
      html: `<p>¿Eliminar la garantía de <strong>${garantia.conductor_nombre}</strong>?</p>
             <p style="color: #DC2626; font-size: 12px;">Esto también eliminará el historial de pagos.</p>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#DC2626'
    })

    if (!result.isConfirmed) return

    try {
      // Primero eliminar pagos
      await (supabase.from('garantias_pagos') as any)
        .delete()
        .eq('garantia_id', garantia.id)

      // Luego eliminar garantía
      const { error } = await (supabase.from('garantias_conductores') as any)
        .delete()
        .eq('id', garantia.id)

      if (error) throw error

      Swal.fire({
        icon: 'success',
        title: 'Eliminado',
        timer: 1500,
        showConfirmButton: false
      })

      cargarGarantias()
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo eliminar', 'error')
    }
  }

  async function registrarPago(garantia: GarantiaConductor) {
    const pendiente = garantia.monto_total - garantia.monto_pagado
    const siguienteCuota = garantia.cuotas_pagadas + 1

    // Generar opciones de semana
    const hoy = new Date()
    const semanaActual = Math.ceil((hoy.getTime() - new Date(hoy.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000))
    const anioActual = hoy.getFullYear()
    
    // Generar opciones de año y semana por separado
    const anioOptions = `<option value="2025">2025</option><option value="${anioActual}" selected>${anioActual}</option>`
    let semanaOptionsHtml = ''
    for (let s = 1; s <= 52; s++) {
      const selected = s === semanaActual ? 'selected' : ''
      semanaOptionsHtml += `<option value="${s}" ${selected}>${s}</option>`
    }

    const { value: formValues } = await Swal.fire({
      title: `<span style="font-size: 16px; font-weight: 600;">Registrar Pago de Garantía</span>`,
      html: `
        <div style="text-align: left; font-size: 13px;">
          <div style="background: #F3F4F6; padding: 10px 12px; border-radius: 6px; margin-bottom: 12px;">
            <div style="font-weight: 600; color: #111827;">${garantia.conductor_nombre}</div>
            <div style="display: flex; gap: 12px; margin-top: 4px;">
              <span style="color: #6B7280; font-size: 12px;">Cuota: <strong style="color: #374151;">${siguienteCuota}/${garantia.cuotas_totales}</strong></span>
            </div>
            <div style="color: #DC2626; font-size: 12px; margin-top: 4px;">
              Pendiente: <strong>${formatCurrency(pendiente)}</strong>
            </div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
            <div>
              <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px;">Semana:</label>
              <select id="swal-semana" class="swal2-select" style="width: 100%; font-size: 14px;">
                ${semanaOptionsHtml}
              </select>
            </div>
            <div>
              <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px;">Año:</label>
              <select id="swal-anio" class="swal2-select" style="width: 100%; font-size: 14px;">
                ${anioOptions}
              </select>
            </div>
          </div>
          <div style="margin-bottom: 12px;">
            <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px;">Monto a pagar:</label>
            <input id="swal-monto" type="number" class="swal2-input" style="font-size: 14px; margin: 0; width: 100%;" value="${FACTURACION_CONFIG.GARANTIA_CUOTA_SEMANAL}">
          </div>
          <div>
            <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px;">Referencia (opcional):</label>
            <input id="swal-ref" type="text" class="swal2-input" style="font-size: 14px; margin: 0; width: 100%;" placeholder="Ej: Facturación S2">
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Registrar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#DC2626',
      width: 340,
      preConfirm: () => {
        const semana = parseInt((document.getElementById('swal-semana') as HTMLSelectElement).value)
        const anio = parseInt((document.getElementById('swal-anio') as HTMLSelectElement).value)
        const monto = (document.getElementById('swal-monto') as HTMLInputElement).value
        const referencia = (document.getElementById('swal-ref') as HTMLInputElement).value
        if (!monto || parseFloat(monto) <= 0) {
          Swal.showValidationMessage('Ingrese un monto válido')
          return false
        }
        return { monto: parseFloat(monto), referencia, semana, anio }
      }
    })

    if (!formValues) return

    try {
      const { error: errorPago } = await (supabase.from('garantias_pagos') as any)
        .insert({
          garantia_id: garantia.id,
          conductor_id: garantia.conductor_id,
          numero_cuota: garantia.cuotas_pagadas + 1,
          monto: formValues.monto,
          fecha_pago: new Date().toISOString(),
          referencia: formValues.referencia || null,
          semana: formValues.semana,
          anio: formValues.anio
        })

      if (errorPago) throw errorPago

      const nuevoMontoPagado = garantia.monto_pagado + formValues.monto
      const nuevasCuotasPagadas = garantia.cuotas_pagadas + 1
      const completada = nuevoMontoPagado >= garantia.monto_total

      const { error: errorUpdate } = await (supabase.from('garantias_conductores') as any)
        .update({
          monto_pagado: nuevoMontoPagado,
          cuotas_pagadas: nuevasCuotasPagadas,
          estado: completada ? 'completada' : 'en_curso'
        })
        .eq('id', garantia.id)

      if (errorUpdate) throw errorUpdate

      Swal.fire({
        icon: 'success',
        title: 'Pago Registrado',
        text: completada ? '¡Garantía completada!' : `Cuota ${nuevasCuotasPagadas} registrada`,
        timer: 2000,
        showConfirmButton: false
      })

      cargarGarantias()
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo registrar el pago', 'error')
    }
  }

  async function verHistorial(garantia: GarantiaConductor) {
    try {
      const { data: pagos, error } = await supabase
        .from('garantias_pagos')
        .select('*')
        .eq('garantia_id', garantia.id)
        .order('numero_cuota', { ascending: true })

      if (error) throw error

      const pagosHtml = pagos && pagos.length > 0
        ? (pagos as any[]).map((p: any) => `
            <tr>
              <td style="padding: 6px 8px; border-bottom: 1px solid #E5E7EB;">${p.numero_cuota}</td>
              <td style="padding: 6px 8px; border-bottom: 1px solid #E5E7EB;">${p.semana && p.anio ? `S${p.semana}/${p.anio}` : '-'}</td>
              <td style="padding: 6px 8px; border-bottom: 1px solid #E5E7EB;">${formatDate(p.fecha_pago)}</td>
              <td style="padding: 6px 8px; border-bottom: 1px solid #E5E7EB; text-align: right; color: #16a34a;">${formatCurrency(p.monto)}</td>
              <td style="padding: 6px 8px; border-bottom: 1px solid #E5E7EB; color: #6B7280;">${p.referencia || '-'}</td>
            </tr>
          `).join('')
        : '<tr><td colspan="5" style="padding: 16px; text-align: center; color: #9CA3AF;">Sin pagos registrados</td></tr>'

      const porcentaje = Math.round((garantia.monto_pagado / garantia.monto_total) * 100)

      Swal.fire({
        title: `<span style="font-size: 16px; font-weight: 600;">Historial de Garantía</span>`,
        html: `
          <div style="text-align: left; font-size: 13px;">
            <div style="background: #F3F4F6; padding: 10px 12px; border-radius: 6px; margin-bottom: 12px;">
              <div style="font-weight: 600; color: #111827;">${garantia.conductor_nombre}</div>
              <div style="display: flex; gap: 12px; margin-top: 4px;">
                <span style="color: #16a34a; font-size: 12px;">Pagado: <strong>${formatCurrency(garantia.monto_pagado)}</strong></span>
                <span style="color: #DC2626; font-size: 12px;">Pendiente: <strong>${formatCurrency(garantia.monto_total - garantia.monto_pagado)}</strong></span>
              </div>
              <div style="background: #E5E7EB; height: 6px; border-radius: 3px; margin-top: 8px; overflow: hidden;">
                <div style="background: #16a34a; height: 100%; width: ${porcentaje}%;"></div>
              </div>
              <div style="text-align: center; font-size: 11px; color: #6B7280; margin-top: 2px;">${porcentaje}%</div>
            </div>
            <div style="max-height: 200px; overflow-y: auto; border: 1px solid #E5E7EB; border-radius: 6px;">
              <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                <thead>
                  <tr style="background: #F9FAFB;">
                    <th style="padding: 6px 8px; text-align: left; font-weight: 600;">Cuota</th>
                    <th style="padding: 6px 8px; text-align: left; font-weight: 600;">Semana</th>
                    <th style="padding: 6px 8px; text-align: left; font-weight: 600;">Fecha</th>
                    <th style="padding: 6px 8px; text-align: right; font-weight: 600;">Monto</th>
                    <th style="padding: 6px 8px; text-align: left; font-weight: 600;">Ref.</th>
                  </tr>
                </thead>
                <tbody>${pagosHtml}</tbody>
              </table>
            </div>
          </div>
        `,
        width: 450,
        confirmButtonText: 'Cerrar',
        confirmButtonColor: '#6B7280'
      })
    } catch (error) {
      console.error('Error cargando historial:', error)
    }
  }

  // ========== FUNCIONES PARA MOVIMIENTOS ==========

  async function editarMovimiento(pago: PagoGarantiaRow) {
    // Generar opciones de semana
    const anioActual = new Date().getFullYear()
    
    // Generar opciones de año y semana por separado
    const anioOptions = `<option value="">-</option><option value="2025" ${pago.anio === 2025 ? 'selected' : ''}>2025</option><option value="${anioActual}" ${pago.anio === anioActual ? 'selected' : ''}>${anioActual}</option>`
    let semanaOptionsHtml = '<option value="">-</option>'
    for (let s = 1; s <= 52; s++) {
      const selected = s === pago.semana ? 'selected' : ''
      semanaOptionsHtml += `<option value="${s}" ${selected}>${s}</option>`
    }

    const { value: formValues } = await Swal.fire({
      title: '<span style="font-size: 16px; font-weight: 600;">Editar Movimiento</span>',
      html: `
        <div style="text-align: left; font-size: 13px;">
          <div style="background: #F3F4F6; padding: 10px 12px; border-radius: 6px; margin-bottom: 12px;">
            <div style="font-weight: 600; color: #111827;">${pago.conductor_nombre}</div>
            <div style="color: #16a34a; font-size: 12px; margin-top: 4px;">
              Monto: <strong>${formatCurrency(pago.monto)}</strong>
            </div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
            <div>
              <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px;">Semana:</label>
              <select id="swal-semana" class="swal2-select" style="width: 100%; font-size: 14px;">
                ${semanaOptionsHtml}
              </select>
            </div>
            <div>
              <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px;">Año:</label>
              <select id="swal-anio" class="swal2-select" style="width: 100%; font-size: 14px;">
                ${anioOptions}
              </select>
            </div>
          </div>
          <div>
            <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px;">Referencia:</label>
            <input id="swal-ref" type="text" class="swal2-input" style="font-size: 14px; margin: 0; width: 100%;" value="${pago.referencia || ''}">
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#DC2626',
      width: 360,
      preConfirm: () => {
        const semanaValue = (document.getElementById('swal-semana') as HTMLSelectElement).value
        const anioValue = (document.getElementById('swal-anio') as HTMLSelectElement).value
        const referencia = (document.getElementById('swal-ref') as HTMLInputElement).value
        
        const semana = semanaValue ? parseInt(semanaValue) : null
        const anioSel = anioValue ? parseInt(anioValue) : null
        return { semana, anio: anioSel, referencia: referencia || null }
      }
    })

    if (!formValues) return

    try {
      const { error } = await (supabase.from('garantias_pagos') as any)
        .update({
          semana: formValues.semana,
          anio: formValues.anio,
          referencia: formValues.referencia
        })
        .eq('id', pago.id)

      if (error) throw error

      Swal.fire({
        icon: 'success',
        title: 'Actualizado',
        timer: 1500,
        showConfirmButton: false
      })

      cargarGarantias()
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo actualizar', 'error')
    }
  }

  // ========== COLUMNAS TABLA GARANTÍAS ==========

  const columnsGarantias = useMemo<ColumnDef<GarantiaConductor>[]>(() => [
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
      accessorKey: 'tipo_alquiler',
      header: () => (
        <div className="dt-column-filter">
          <span>Tipo {tipoFilter.length > 0 && `(${tipoFilter.length})`}</span>
          <button
            className={`dt-column-filter-btn ${tipoFilter.length > 0 ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setOpenColumnFilter(openColumnFilter === 'tipo' ? null : 'tipo') }}
          >
            <Filter size={12} />
          </button>
          {openColumnFilter === 'tipo' && (
            <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
              <div className="dt-excel-filter-list">
                {['CARGO', 'TURNO'].map(t => (
                  <label key={t} className={`dt-column-filter-checkbox ${tipoFilter.includes(t) ? 'selected' : ''}`}>
                    <input type="checkbox" checked={tipoFilter.includes(t)} onChange={() => toggleTipoFilter(t)} />
                    <span>{t}</span>
                  </label>
                ))}
              </div>
              {tipoFilter.length > 0 && (
                <button className="dt-column-filter-clear" onClick={() => setTipoFilter([])}>
                  Limpiar ({tipoFilter.length})
                </button>
              )}
            </div>
          )}
        </div>
      ),
      cell: ({ row }) => (
        <span className={`fact-badge ${row.original.tipo_alquiler === 'CARGO' ? 'fact-badge-blue' : 'fact-badge-purple'}`}>
          {row.original.tipo_alquiler}
        </span>
      )
    },
    {
      accessorKey: 'monto_total',
      header: 'Total',
      cell: ({ row }) => <span className="fact-precio">{formatCurrency(row.original.monto_total)}</span>
    },
    {
      accessorKey: 'monto_pagado',
      header: 'Pagado',
      cell: ({ row }) => <span className="fact-precio" style={{ color: '#16a34a' }}>{formatCurrency(row.original.monto_pagado)}</span>
    },
    {
      id: 'pendiente',
      header: 'Pendiente',
      cell: ({ row }) => {
        const pendiente = row.original.monto_total - row.original.monto_pagado
        return <span className={`fact-precio ${pendiente > 0 ? 'fact-precio-negative' : ''}`}>{formatCurrency(pendiente)}</span>
      }
    },
    {
      accessorKey: 'cuotas_pagadas',
      header: 'Cuotas',
      cell: ({ row }) => `${row.original.cuotas_pagadas}/${row.original.cuotas_totales}`
    },
    {
      id: 'progreso',
      header: 'Progreso',
      cell: ({ row }) => {
        const porcentaje = (row.original.monto_pagado / row.original.monto_total) * 100
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="fact-progress-bar">
              <div className="fact-progress-fill" style={{ width: `${Math.min(porcentaje, 100)}%` }} />
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{porcentaje.toFixed(0)}%</span>
          </div>
        )
      }
    },
    {
      accessorKey: 'estado',
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
                  { value: 'completada', label: 'Completada' },
                  { value: 'en_curso', label: 'En Curso' },
                  { value: 'pendiente', label: 'Pendiente' }
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
        const estado = row.original.estado
        const config: Record<string, { class: string; label: string }> = {
          completada: { class: 'fact-badge-green', label: 'Completada' },
          en_curso: { class: 'fact-badge-yellow', label: 'En Curso' },
          pendiente: { class: 'fact-badge-gray', label: 'Pendiente' }
        }
        const { class: badgeClass, label } = config[estado] || { class: 'fact-badge-gray', label: estado }
        return <span className={`fact-badge ${badgeClass}`}>{label}</span>
      }
    },
    {
      id: 'acciones',
      header: '',
      cell: ({ row }) => (
        <div className="fact-table-actions">
          <button className="fact-table-btn fact-table-btn-view" onClick={() => verHistorial(row.original)} data-tooltip="Ver historial">
            <Eye size={14} />
          </button>
          <button className="fact-table-btn fact-table-btn-edit" onClick={() => editarGarantia(row.original)} data-tooltip="Editar">
            <Edit3 size={14} />
          </button>
          {row.original.estado !== 'completada' && (
            <button className="fact-table-btn fact-table-btn-success" onClick={() => registrarPago(row.original)} data-tooltip="Registrar pago">
              <Plus size={14} />
            </button>
          )}
          <button className="fact-table-btn fact-table-btn-danger" onClick={() => eliminarGarantia(row.original)} data-tooltip="Eliminar">
            <Trash2 size={14} />
          </button>
        </div>
      )
    }
  ], [conductorFilter, conductorSearch, conductoresFiltrados, tipoFilter, estadoFilter, openColumnFilter])

  // ========== COLUMNAS TABLA MOVIMIENTOS ==========

  const columnsMovimientos = useMemo<ColumnDef<PagoGarantiaRow>[]>(() => [
    {
      accessorKey: 'fecha_pago',
      header: 'Fecha',
      cell: ({ row }) => formatDate(row.original.fecha_pago)
    },
    {
      accessorKey: 'conductor_nombre',
      header: () => (
        <div className="dt-column-filter">
          <span>Conductor {movConductorFilter.length > 0 && `(${movConductorFilter.length})`}</span>
          <button
            className={`dt-column-filter-btn ${movConductorFilter.length > 0 ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setOpenColumnFilter(openColumnFilter === 'mov-conductor' ? null : 'mov-conductor') }}
          >
            <Filter size={12} />
          </button>
          {openColumnFilter === 'mov-conductor' && (
            <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                placeholder="Buscar conductor..."
                value={movConductorSearch}
                onChange={(e) => setMovConductorSearch(e.target.value)}
                className="dt-column-filter-input"
              />
              <div className="dt-excel-filter-list">
                {movConductoresFiltrados.map(c => (
                  <label key={c} className={`dt-column-filter-checkbox ${movConductorFilter.includes(c) ? 'selected' : ''}`}>
                    <input type="checkbox" checked={movConductorFilter.includes(c)} onChange={() => toggleMovConductorFilter(c)} />
                    <span>{c}</span>
                  </label>
                ))}
              </div>
              {movConductorFilter.length > 0 && (
                <button className="dt-column-filter-clear" onClick={() => { setMovConductorFilter([]); setMovConductorSearch('') }}>
                  Limpiar ({movConductorFilter.length})
                </button>
              )}
            </div>
          )}
        </div>
      ),
      cell: ({ row }) => <span className="font-medium">{row.original.conductor_nombre}</span>
    },
    {
      accessorKey: 'numero_cuota',
      header: 'Cuota #',
      cell: ({ row }) => <span className="text-gray-600">#{row.original.numero_cuota}</span>
    },
    {
      accessorKey: 'monto',
      header: 'Monto',
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <ArrowUpCircle size={14} className="text-green-500" />
          <span className="fact-precio" style={{ color: '#16a34a' }}>{formatCurrency(row.original.monto)}</span>
        </div>
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
          <button className="fact-table-btn fact-table-btn-edit" onClick={() => editarMovimiento(row.original)} data-tooltip="Editar">
            <Edit3 size={14} />
          </button>
        </div>
      )
    }
  ], [movConductorFilter, movConductorSearch, movConductoresFiltrados, openColumnFilter])

  // ========== DATOS FILTRADOS ==========

  const garantiasFiltradas = useMemo(() => {
    return garantias.filter(g => {
      if (filtroEstado !== 'todos' && g.estado !== filtroEstado) return false
      if (conductorFilter.length > 0 && !conductorFilter.includes(g.conductor_nombre || '')) return false
      if (tipoFilter.length > 0 && !tipoFilter.includes(g.tipo_alquiler)) return false
      if (estadoFilter.length > 0 && !estadoFilter.includes(g.estado)) return false
      return true
    })
  }, [garantias, filtroEstado, conductorFilter, tipoFilter, estadoFilter])

  const movimientosFiltrados = useMemo(() => {
    return todosLosPagos.filter(p => {
      if (movConductorFilter.length > 0 && !movConductorFilter.includes(p.conductor_nombre || '')) return false
      return true
    })
  }, [todosLosPagos, movConductorFilter])

  // ========== STATS ==========

  const stats = useMemo(() => {
    const total = garantias.length
    const completadas = garantias.filter(g => g.estado === 'completada').length
    const enCurso = garantias.filter(g => g.estado === 'en_curso').length
    const totalRecaudado = garantias.reduce((sum, g) => sum + g.monto_pagado, 0)
    const totalPorRecaudar = garantias.reduce((sum, g) => sum + (g.monto_total - g.monto_pagado), 0)
    return { total, completadas, enCurso, totalRecaudado, totalPorRecaudar }
  }, [garantias])

  // ========== RENDER ==========

  return (
    <>
      {/* Sub-tabs de navegación */}
      <div className="fact-subtabs" style={{ 
        display: 'flex', 
        gap: '4px', 
        marginBottom: '16px',
        borderBottom: '1px solid #E5E7EB',
        paddingBottom: '0'
      }}>
        <button
          className={`fact-subtab ${activeSubTab === 'garantias' ? 'fact-subtab-active' : ''}`}
          onClick={() => setActiveSubTab('garantias')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '10px 16px',
            border: 'none',
            background: activeSubTab === 'garantias' ? '#DC2626' : 'transparent',
            color: activeSubTab === 'garantias' ? 'white' : '#6B7280',
            borderRadius: '6px 6px 0 0',
            cursor: 'pointer',
            fontWeight: 500,
            fontSize: '13px',
            transition: 'all 0.15s'
          }}
        >
          <Shield size={16} />
          Garantías
          <span style={{
            background: activeSubTab === 'garantias' ? 'rgba(255,255,255,0.2)' : '#E5E7EB',
            padding: '2px 6px',
            borderRadius: '10px',
            fontSize: '11px'
          }}>
            {garantias.length}
          </span>
        </button>
        <button
          className={`fact-subtab ${activeSubTab === 'movimientos' ? 'fact-subtab-active' : ''}`}
          onClick={() => setActiveSubTab('movimientos')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '10px 16px',
            border: 'none',
            background: activeSubTab === 'movimientos' ? '#DC2626' : 'transparent',
            color: activeSubTab === 'movimientos' ? 'white' : '#6B7280',
            borderRadius: '6px 6px 0 0',
            cursor: 'pointer',
            fontWeight: 500,
            fontSize: '13px',
            transition: 'all 0.15s'
          }}
        >
          <Receipt size={16} />
          Movimientos
          <span style={{
            background: activeSubTab === 'movimientos' ? 'rgba(255,255,255,0.2)' : '#E5E7EB',
            padding: '2px 6px',
            borderRadius: '10px',
            fontSize: '11px'
          }}>
            {todosLosPagos.length}
          </span>
        </button>
      </div>

      {activeSubTab === 'garantias' && (
        <>
          {/* Header con filtro y botón agregar */}
          <div className="fact-header">
            <div className="fact-header-left">
              <span className="fact-label">Filtrar:</span>
              <select className="fact-select" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
                <option value="todos">Todos</option>
                <option value="en_curso">En Curso</option>
                <option value="completada">Completadas</option>
                <option value="pendiente">Pendientes</option>
              </select>
            </div>
            <div className="fact-header-right">
              <button className="fact-btn fact-btn-primary" onClick={agregarGarantia}>
                <UserPlus size={16} />
                Agregar Garantía
              </button>
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
                <Clock size={18} className="fact-stat-icon" />
                <div className="fact-stat-content">
                  <span className="fact-stat-value">{stats.enCurso}</span>
                  <span className="fact-stat-label">En Curso</span>
                </div>
              </div>
              <div className="fact-stat-card">
                <CheckCircle size={18} className="fact-stat-icon" />
                <div className="fact-stat-content">
                  <span className="fact-stat-value">{stats.completadas}</span>
                  <span className="fact-stat-label">Completadas</span>
                </div>
              </div>
              <div className="fact-stat-card">
                <DollarSign size={18} className="fact-stat-icon" style={{ color: '#16a34a' }} />
                <div className="fact-stat-content">
                  <span className="fact-stat-value" style={{ color: '#16a34a' }}>{formatCurrency(stats.totalRecaudado)}</span>
                  <span className="fact-stat-label">Recaudado</span>
                </div>
              </div>
              <div className="fact-stat-card">
                <AlertTriangle size={18} className="fact-stat-icon" style={{ color: '#DC2626' }} />
                <div className="fact-stat-content">
                  <span className="fact-stat-value" style={{ color: '#DC2626' }}>{formatCurrency(stats.totalPorRecaudar)}</span>
                  <span className="fact-stat-label">Por Recaudar</span>
                </div>
              </div>
            </div>
          </div>

          {/* Tabla Garantías */}
          <DataTable
            data={garantiasFiltradas}
            columns={columnsGarantias}
            loading={loading}
            searchPlaceholder="Buscar conductor..."
            emptyIcon={<Shield size={48} />}
            emptyTitle="Sin garantías"
            emptyDescription="No hay garantías registradas"
            pageSize={100}
            pageSizeOptions={[10, 20, 50, 100]}
          />
        </>
      )}

      {activeSubTab === 'movimientos' && (
        <>
          {/* Header movimientos */}
          <div className="fact-header">
            <div className="fact-header-left">
              <span className="fact-label" style={{ fontSize: '13px', color: '#6B7280' }}>
                Historial de pagos de garantía
              </span>
            </div>
          </div>

          {/* Stats movimientos */}
          <div className="fact-stats">
            <div className="fact-stats-grid">
              <div className="fact-stat-card">
                <Receipt size={18} className="fact-stat-icon" />
                <div className="fact-stat-content">
                  <span className="fact-stat-value">{todosLosPagos.length}</span>
                  <span className="fact-stat-label">Total Movimientos</span>
                </div>
              </div>
              <div className="fact-stat-card">
                <ArrowUpCircle size={18} className="fact-stat-icon" style={{ color: '#16a34a' }} />
                <div className="fact-stat-content">
                  <span className="fact-stat-value" style={{ color: '#16a34a' }}>
                    {formatCurrency(todosLosPagos.reduce((sum, p) => sum + p.monto, 0))}
                  </span>
                  <span className="fact-stat-label">Total Pagado</span>
                </div>
              </div>
            </div>
          </div>

          {/* Tabla Movimientos */}
          <DataTable
            data={movimientosFiltrados}
            columns={columnsMovimientos}
            loading={loading}
            searchPlaceholder="Buscar movimiento..."
            emptyIcon={<Receipt size={48} />}
            emptyTitle="Sin movimientos"
            emptyDescription="No hay pagos de garantía registrados"
            pageSize={50}
            pageSizeOptions={[20, 50, 100]}
          />
        </>
      )}
    </>
  )
}
