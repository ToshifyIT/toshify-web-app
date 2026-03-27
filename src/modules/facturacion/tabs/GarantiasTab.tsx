/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../../../lib/supabase'
import { useSede } from '../../../contexts/SedeContext'
import { usePermissions } from '../../../contexts/PermissionsContext'
import Swal from 'sweetalert2'
import { showSuccess } from '../../../utils/toast'
import * as XLSX from 'xlsx'
import {
  Shield,
  Users,
  CheckCircle,
  Clock,
  AlertTriangle,
  Eye,
  // Plus,
  DollarSign,
  Banknote,
  Filter,
  Edit3,
  UserPlus,
  Trash2,
  Receipt,
  ArrowUpCircle,
  RotateCcw,
  Download,
  Upload
} from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'
import { format, startOfWeek, endOfWeek, parseISO } from 'date-fns'
import { DataTable } from '../../../components/ui/DataTable'
import { VerLogsButton } from '../../../components/ui/VerLogsButton'
import { LoadingOverlay } from '../../../components/ui/LoadingOverlay'
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
  const { sedeActualId, aplicarFiltroSede } = useSede()
  const { isAdmin, isAdministrativo } = usePermissions()
  // Sub-tab activo (Movimientos removido - no se usa)
  const [activeSubTab] = useState<'garantias' | 'movimientos'>('garantias')
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [garantias, setGarantias] = useState<GarantiaConductor[]>([])
  const [todosLosPagos, setTodosLosPagos] = useState<PagoGarantiaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroEstado] = useState<string>('todos')

  // Estados para filtros Excel - Garantías
  const [openColumnFilter, setOpenColumnFilter] = useState<string | null>(null)
  const [conductorFilter, setConductorFilter] = useState<string[]>([])
  const [conductorSearch, setConductorSearch] = useState('')
  const [tipoFilter, setTipoFilter] = useState<string[]>([])
  const [estadoFilter, setEstadoFilter] = useState<string[]>([])
  const [estadoCondFilter, setEstadoCondFilter] = useState<'todos' | 'activo' | 'baja'>('todos')
  const [asignadoFilter, setAsignadoFilter] = useState<'todos' | 'asignado' | 'no_asignado'>('todos')
  const [conductoresAsignados, setConductoresAsignados] = useState<Set<string>>(new Set())

  // Estados para filtros Excel - Movimientos
  const [movConductorFilter, setMovConductorFilter] = useState<string[]>([])
  const [movConductorSearch, setMovConductorSearch] = useState('')

  useEffect(() => {
    cargarGarantias()
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
  const _toggleTipoFilter = (val: string) => setTipoFilter(prev =>
    prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
  )
  void _toggleTipoFilter
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
      const { data, error } = await aplicarFiltroSede(supabase
        .from('garantias_conductores')
        .select('*'))
        .order('conductor_nombre')

      if (error) throw error

      // Cargar estado y DNI de TODOS los conductores (evita .in() con 500+ UUIDs que puede fallar)
      const ESTADO_ACTIVO = '57e9de5f-e6fc-4ff7-8d14-cf8e13e9dbe2'
      const estadoConductorMap = new Map<string, string>()
      const dniConductorMap = new Map<string, string>()
      const fechaBajaMap = new Map<string, string>()
      const { data: conductoresData } = await supabase
        .from('conductores')
        .select('id, estado_id, numero_dni, fecha_terminacion, updated_at')
      ;(conductoresData || []).forEach((c: any) => {
        const esBaja = c.estado_id !== ESTADO_ACTIVO
        estadoConductorMap.set(c.id, esBaja ? 'BAJA' : 'ACTIVO')
        if (c.numero_dni) dniConductorMap.set(c.id, c.numero_dni)
        // Fecha de baja: usar fecha_terminacion, o updated_at como fallback para conductores de baja
        if (c.fecha_terminacion) {
          fechaBajaMap.set(c.id, c.fecha_terminacion.substring(0, 10))
        } else if (esBaja && c.updated_at) {
          fechaBajaMap.set(c.id, c.updated_at.substring(0, 10))
        }
      })

      // Marcar visualmente como en_devolucion si conductor es BAJA (solo in-memory, no se guarda en BD)
      const garantiasConEstado = (data || []).map((g: any) => {
        const estadoCond = estadoConductorMap.get(g.conductor_id) || 'ACTIVO'
        const necesitaDevolucion = estadoCond === 'BAJA' && g.monto_pagado > 0 && g.estado !== 'cancelada'
        return {
          ...g,
          conductor_dni: g.conductor_dni || dniConductorMap.get(g.conductor_id) || null,
          estado: necesitaDevolucion ? 'en_devolucion' : g.estado,
          estado_conductor: estadoCond,
          fecha_baja: fechaBajaMap.get(g.conductor_id) || null
        }
      })

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

      setGarantias(garantiasConEstado)

      // Cargar todos los pagos para el sub-tab "Movimientos"
      const { data: pagos, error: errorPagos } = await aplicarFiltroSede(supabase
        .from('garantias_pagos')
        .select('*'))
        .order('fecha_pago', { ascending: false })
        .limit(500)

      if (errorPagos) {
        // silently ignored
      }

      // Obtener nombres de conductores desde garantías ya cargadas
      const conductorNombres = new Map((data || []).map((g: GarantiaConductor) => [g.conductor_id, g.conductor_nombre]))

      const pagosConNombre = ((pagos || []) as PagoGarantiaRow[]).map((p) => ({
        ...p,
        conductor_nombre: conductorNombres.get(p.conductor_id) || 'N/A'
      }))
      setTodosLosPagos(pagosConNombre)
    } catch {
      // silently ignored
    } finally {
      setLoading(false)
    }
  }

  // ========== FUNCIONES PARA GARANTÍAS ==========

  async function agregarGarantia() {
    // Cargar todos los conductores
    const { data: conductores } = await aplicarFiltroSede(supabase
      .from('conductores')
      .select('id, nombres, apellidos'))
      .order('apellidos')

    // Set para O(1) lookup — evita .some() O(m) por cada uno de los n conductores
    const conductoresConGarantia = new Set((garantias as any[]).map((g: any) => g.conductor_id))
    const conductoresDisponibles = ((conductores || []) as ConductorBasico[]).filter((c) =>
      !conductoresConGarantia.has(c.id)
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
      confirmButtonColor: '#ff0033',
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
                <strong style="color: #ff0033;">${c.apellidos}, ${c.nombres}</strong>
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

      showSuccess('Garantía Agregada')

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
      confirmButtonColor: '#ff0033',
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
      if (formValues.montoPagado >= formValues.montoTotal) {
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

      showSuccess('Actualizado')

      cargarGarantias()
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo actualizar', 'error')
    }
  }

  async function eliminarGarantia(garantia: GarantiaConductor) {
    const result = await Swal.fire({
      title: 'Eliminar Garantía',
      html: `<p>¿Eliminar la garantía de <strong>${garantia.conductor_nombre}</strong>?</p>
             <p style="color: #ff0033; font-size: 12px;">Esto también eliminará el historial de pagos.</p>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#ff0033'
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

      showSuccess('Eliminado')

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

    const porcentajeRegistrar = Math.round((garantia.monto_pagado / garantia.monto_total) * 100)

    const { value: formValues } = await Swal.fire({
      title: `<span style="font-size: 16px; font-weight: 600;">Registrar Pago de Garantía</span>`,
      html: `
        <div style="text-align: left; font-size: 13px;">
          <div style="background: #F3F4F6; padding: 10px 12px; border-radius: 6px; margin-bottom: 12px;">
            <div style="font-weight: 600; color: #111827;">${garantia.conductor_nombre}</div>
            <div style="display: flex; gap: 12px; margin-top: 4px;">
              <span style="color: #6B7280; font-size: 12px;">Cuota: <strong style="color: #374151;">${siguienteCuota}/${garantia.cuotas_totales}</strong></span>
            </div>
            <div style="display: flex; gap: 12px; margin-top: 4px;">
              <span style="color: #16a34a; font-size: 12px;">Pagado: <strong>${formatCurrency(garantia.monto_pagado)}</strong></span>
              <span style="color: #ff0033; font-size: 12px;">Pendiente: <strong>${formatCurrency(pendiente)}</strong></span>
            </div>
            <div style="background: #E5E7EB; height: 6px; border-radius: 3px; margin-top: 8px; overflow: hidden;">
              <div style="background: #16a34a; height: 100%; width: ${porcentajeRegistrar}%;"></div>
            </div>
            <div style="text-align: center; font-size: 11px; color: #6B7280; margin-top: 2px;">${porcentajeRegistrar}%</div>
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
      confirmButtonColor: '#ff0033',
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

      showSuccess('Pago Registrado', completada ? '¡Garantía completada!' : `Cuota ${nuevasCuotasPagadas} registrada`)

      cargarGarantias()
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo registrar el pago', 'error')
    }
  }

  async function registrarDevolucion(garantia: GarantiaConductor) {
    const devuelto = (garantia as any).monto_devuelto || 0
    const pendienteDevolver = garantia.monto_pagado - devuelto
    const porcentajeDevuelto = garantia.monto_pagado > 0 ? Math.round((devuelto / garantia.monto_pagado) * 100) : 0

    const { value: formValues } = await Swal.fire({
      title: '<span style="font-size: 16px; font-weight: 600;">Registrar Devolución de Garantía</span>',
      html: `
        <div style="text-align: left; font-size: 13px;">
          <div style="background: #FEF2F2; padding: 12px; border-radius: 8px; margin-bottom: 14px; border: 1px solid #FECACA;">
            <div style="font-weight: 600; color: #111827; font-size: 14px;">${garantia.conductor_nombre}</div>
            <span style="background: #ff0033; color: white; padding: 1px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">BAJA</span>
          </div>
          <div style="background: #F9FAFB; padding: 12px; border-radius: 8px; margin-bottom: 14px; border: 1px solid #E5E7EB;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              <div>
                <div style="font-size: 11px; color: #6B7280;">Total pagado</div>
                <div style="font-weight: 600; color: #111827;">${formatCurrency(garantia.monto_pagado)}</div>
              </div>
              <div>
                <div style="font-size: 11px; color: #6B7280;">Ya devuelto</div>
                <div style="font-weight: 600; color: #16a34a;">${formatCurrency(devuelto)}</div>
              </div>
            </div>
            <div style="background: #E5E7EB; height: 6px; border-radius: 3px; margin-top: 10px; overflow: hidden;">
              <div style="background: #2563eb; height: 100%; width: ${porcentajeDevuelto}%;"></div>
            </div>
            <div style="text-align: center; font-size: 11px; color: #6B7280; margin-top: 2px;">Devuelto: ${porcentajeDevuelto}%</div>
          </div>
          <div style="background: #EFF6FF; padding: 10px 12px; border-radius: 8px; margin-bottom: 14px; border: 1px solid #BFDBFE;">
            <div style="font-size: 11px; color: #6B7280;">Pendiente de devolver</div>
            <div style="font-size: 18px; font-weight: 700; color: #2563eb;">${formatCurrency(pendienteDevolver)}</div>
          </div>
          <div style="margin-bottom: 12px;">
            <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px;">Monto a devolver:</label>
            <input id="swal-monto-dev" type="number" class="swal2-input" style="font-size: 14px; margin: 0; width: 100%;" value="${pendienteDevolver}">
          </div>
          <div>
            <label style="display: block; font-size: 12px; color: #374151; margin-bottom: 4px;">Referencia (opcional):</label>
            <input id="swal-ref-dev" type="text" class="swal2-input" style="font-size: 14px; margin: 0; width: 100%;" placeholder="Ej: Transferencia bancaria">
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Registrar Devolución',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#2563eb',
      width: 380,
      preConfirm: () => {
        const monto = (document.getElementById('swal-monto-dev') as HTMLInputElement).value
        const referencia = (document.getElementById('swal-ref-dev') as HTMLInputElement).value
        if (!monto || parseFloat(monto) <= 0) {
          Swal.showValidationMessage('Ingrese un monto válido')
          return false
        }
        if (parseFloat(monto) > pendienteDevolver) {
          Swal.showValidationMessage(`El monto no puede superar ${formatCurrency(pendienteDevolver)}`)
          return false
        }
        return { monto: parseFloat(monto), referencia }
      }
    })

    if (!formValues) return

    try {
      // 1. Insertar registro en garantias_devoluciones
      const { error: errorDev } = await (supabase.from('garantias_devoluciones') as any)
        .insert({
          garantia_id: garantia.id,
          conductor_id: garantia.conductor_id,
          monto: formValues.monto,
          referencia: formValues.referencia || null,
          created_by_name: null
        })
      if (errorDev) throw errorDev

      // 2. Actualizar monto_devuelto en garantias_conductores
      const nuevoDevuelto = devuelto + formValues.monto
      const { error: errorUpdate } = await (supabase.from('garantias_conductores') as any)
        .update({
          monto_devuelto: nuevoDevuelto,
          updated_at: new Date().toISOString()
        })
        .eq('id', garantia.id)
      if (errorUpdate) throw errorUpdate

      showSuccess('Devolución Registrada', `Se devolvieron ${formatCurrency(formValues.monto)} a ${garantia.conductor_nombre}`)
      cargarGarantias()
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo registrar la devolución', 'error')
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
                <span style="color: #ff0033; font-size: 12px;">Pendiente: <strong>${formatCurrency(garantia.monto_total - garantia.monto_pagado)}</strong></span>
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
    } catch {
      // silently ignored
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
      confirmButtonColor: '#ff0033',
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

      showSuccess('Actualizado')

      cargarGarantias()
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo actualizar', 'error')
    }
  }

  // ====== EXPORTAR GARANTÍAS A EXCEL ======
  function exportarGarantias() {
    if (garantias.length === 0) {
      Swal.fire('Sin datos', 'No hay garantías para exportar', 'info')
      return
    }

    const data = garantias.map((g) => ({
      'DNI': g.conductor_dni || '',
      'Conductor': g.conductor_nombre || '',
      'Monto Total': g.monto_total,
      'Monto Pagado': g.monto_pagado,
      'Cuotas Totales': g.cuotas_totales,
      'Cuotas Pagadas': g.cuotas_pagadas,
    }))

    const ws = XLSX.utils.json_to_sheet(data)

    ws['!cols'] = [
      { wch: 14 }, // DNI
      { wch: 35 }, // Conductor
      { wch: 14 }, // Monto Total
      { wch: 14 }, // Monto Pagado
      { wch: 14 }, // Cuotas Totales
      { wch: 14 }, // Cuotas Pagadas
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Garantias')

    const fecha = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `Garantias_Conductores_${fecha}.xlsx`)
    showSuccess('Exportado correctamente')
  }

  // ====== IMPORTAR GARANTÍAS DESDE EXCEL ======
  async function importarGarantias(file: File) {
    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })

      // Buscar la hoja correcta: primero "Garantias", sino la primera que tenga columna DNI
      let sheetName = ''
      if (wb.SheetNames.includes('Garantias')) {
        sheetName = 'Garantias'
      } else {
        for (const name of wb.SheetNames) {
          const testWs = wb.Sheets[name]
          const testRows: any[] = XLSX.utils.sheet_to_json(testWs, { raw: false })
          if (testRows.length > 0 && (testRows[0]['DNI'] !== undefined || testRows[0]['dni'] !== undefined || testRows[0]['Dni'] !== undefined)) {
            sheetName = name
            break
          }
        }
        if (!sheetName) sheetName = wb.SheetNames[0]
      }

      const ws = wb.Sheets[sheetName]
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { raw: false })

      if (rows.length === 0) {
        Swal.fire('Error', 'El archivo no contiene datos en la hoja "' + sheetName + '"', 'error')
        return
      }

      // Buscar columna DNI (case-insensitive)
      const firstRow = rows[0]
      const findCol = (names: string[]) => {
        for (const key of Object.keys(firstRow)) {
          if (names.includes(key.trim().toLowerCase())) return key
        }
        return null
      }
      const colDni = findCol(['dni'])
      const colMontoTotal = findCol(['monto total', 'montototal', 'total'])
      const colMontoPagado = findCol(['monto pagado', 'montopagado', 'pagado'])
      const colCuotasTotales = findCol(['cuotas totales', 'cuotastotales'])
      const colCuotasPagadas = findCol(['cuotas pagadas', 'cuotaspagadas'])
      const colCuotaSemanal = findCol(['cuota semanal', 'cuotasemanal'])
      const colEstado = findCol(['estado'])

      if (!colDni) {
        Swal.fire('Error', 'El archivo debe tener la columna "DNI".<br><br>Columnas encontradas: ' + Object.keys(firstRow).join(', '), 'error')
        return
      }

      // Crear mapa DNI -> garantia
      const dniMap = new Map<string, GarantiaConductor & { estado_conductor?: string }>()
      for (const g of garantias) {
        if (g.conductor_dni) {
          const dniNorm = String(g.conductor_dni).replace(/[.\s]/g, '').replace(/^0+/, '')
          dniMap.set(dniNorm, g)
        }
      }

      const estadosValidos = ['pendiente', 'en_curso', 'completada', 'cancelada', 'suspendida', 'en_devolucion']

      interface ImportRow {
        garantia_id: string
        dni: string
        nombre: string
        monto_total: number
        monto_pagado: number
        cuotas_totales: number
        cuotas_pagadas: number
        monto_cuota_semanal: number
        estado: string
      }

      const parsed: ImportRow[] = []
      const errores: string[] = []

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]
        const dniRaw = String(r[colDni] || '').trim()
        const dniNorm = dniRaw.replace(/[.\s]/g, '').replace(/^0+/, '')

        if (!dniNorm || dniNorm.length < 5) {
          errores.push(`Fila ${i + 2}: DNI invalido "${dniRaw}"`)
          continue
        }

        const match = dniMap.get(dniNorm)
        if (!match) {
          errores.push(`Fila ${i + 2}: DNI ${dniRaw} no encontrado en garantias`)
          continue
        }

        // Leer columnas del Excel, si falta usar valor de DB
        const montoTotal = colMontoTotal
          ? parseFloat(String(r[colMontoTotal] || '0').replace(/,/g, ''))
          : match.monto_total
        const montoPagado = colMontoPagado
          ? parseFloat(String(r[colMontoPagado] || '0').replace(/,/g, ''))
          : match.monto_pagado
        const cuotasTotales = colCuotasTotales
          ? (parseInt(String(r[colCuotasTotales] || '0')) || 0)
          : match.cuotas_totales
        const cuotasPagadas = colCuotasPagadas
          ? (parseInt(String(r[colCuotasPagadas] || '0')) || 0)
          : match.cuotas_pagadas

        // Cuota semanal: si viene en el Excel usarla, sino siempre 50000
        const cuotaSemanal = colCuotaSemanal
          ? parseFloat(String(r[colCuotaSemanal] || '0').replace(/,/g, ''))
          : 50000

        // Auto-calcular estado si no viene en el Excel
        let estado: string
        if (colEstado) {
          estado = String(r[colEstado]).trim().toLowerCase()
        } else {
          // Mantener en_devolucion si el conductor está de baja
          const esBaja = (match as any).estado_conductor === 'BAJA'
          if (esBaja && montoPagado > 0) {
            estado = 'en_devolucion'
          } else if (montoPagado >= montoTotal && montoTotal > 0) {
            estado = 'completada'
          } else if (montoPagado > 0 || cuotasPagadas > 0) {
            estado = 'en_curso'
          } else {
            estado = 'pendiente'
          }
        }

        if (isNaN(montoTotal) || isNaN(montoPagado) || isNaN(cuotaSemanal)) {
          errores.push(`Fila ${i + 2}: Valores numericos invalidos`)
          continue
        }

        if (!estadosValidos.includes(estado)) {
          errores.push(`Fila ${i + 2}: Estado "${estado}" no valido`)
          continue
        }

        parsed.push({
          garantia_id: match.id,
          dni: dniRaw,
          nombre: String(r['Conductor'] || r['conductor'] || match.conductor_nombre || ''),
          monto_total: Math.round(montoTotal * 100) / 100,
          monto_pagado: Math.round(montoPagado * 100) / 100,
          cuotas_totales: cuotasTotales,
          cuotas_pagadas: cuotasPagadas,
          monto_cuota_semanal: Math.round(cuotaSemanal * 100) / 100,
          estado: estado,
        })
      }

      if (parsed.length === 0) {
        Swal.fire('Error', `No se pudo procesar ninguna fila.${errores.length > 0 ? '<br><br>' + errores.slice(0, 10).join('<br>') : ''}`, 'error')
        return
      }

      // Detectar cambios
      const cambios = parsed.filter((p) => {
        const actual = garantias.find((g) => g.id === p.garantia_id)
        return !actual ||
          Math.abs(actual.monto_total - p.monto_total) > 0.01 ||
          Math.abs(actual.monto_pagado - p.monto_pagado) > 0.01 ||
          actual.cuotas_totales !== p.cuotas_totales ||
          actual.cuotas_pagadas !== p.cuotas_pagadas ||
          Math.abs(actual.monto_cuota_semanal - p.monto_cuota_semanal) > 0.01 ||
          actual.estado !== p.estado
      })

      if (cambios.length === 0) {
        Swal.fire('Sin cambios', 'Los valores del archivo son iguales a los actuales', 'info')
        return
      }

      // Preview HTML - mostrar todos los campos: anterior → nuevo
      const cellStyle = 'padding:3px 6px;border-bottom:1px solid #E5E7EB;font-size:10px;'
      const diffCell = (ant: string | number, nuevo: string | number, isNum = true) => {
        const changed = String(ant) !== String(nuevo)
        if (!changed) return `<td style="${cellStyle}text-align:right;color:#9CA3AF;">${isNum ? formatCurrency(Number(nuevo)) : nuevo}</td>`
        return `<td style="${cellStyle}text-align:right;">
          <span style="color:#9CA3AF;text-decoration:line-through;font-size:9px;">${isNum ? formatCurrency(Number(ant)) : ant}</span>
          <span style="color:#111;font-weight:600;margin-left:2px;">${isNum ? formatCurrency(Number(nuevo)) : nuevo}</span>
        </td>`
      }

      const previewRows = cambios.slice(0, 50).map((c) => {
        const a = garantias.find((g) => g.id === c.garantia_id)
        return `<tr>
          <td style="${cellStyle}white-space:nowrap;font-weight:500;">${c.nombre}</td>
          <td style="${cellStyle}text-align:center;color:#6B7280;">${c.dni}</td>
          ${diffCell(a?.monto_total ?? 0, c.monto_total)}
          ${diffCell(a?.monto_pagado ?? 0, c.monto_pagado)}
          ${diffCell(a?.cuotas_totales ?? 0, c.cuotas_totales)}
          ${diffCell(a?.cuotas_pagadas ?? 0, c.cuotas_pagadas)}
          ${diffCell(a?.monto_cuota_semanal ?? 0, c.monto_cuota_semanal)}
          ${diffCell(a?.estado ?? '', c.estado, false)}
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
            <div style="max-height:350px;overflow:auto;border:1px solid #E5E7EB;border-radius:6px;">
              <table style="width:100%;border-collapse:collapse;font-size:11px;">
                <thead>
                  <tr style="background:#F9FAFB;position:sticky;top:0;z-index:1;">
                    <th style="padding:5px 6px;text-align:left;font-weight:600;">Conductor</th>
                    <th style="padding:5px 6px;text-align:center;font-weight:600;">DNI</th>
                    <th style="padding:5px 6px;text-align:right;font-weight:600;font-size:9px;">Monto Total</th>
                    <th style="padding:5px 6px;text-align:right;font-weight:600;font-size:9px;">Monto Pagado</th>
                    <th style="padding:5px 6px;text-align:right;font-weight:600;font-size:9px;">Cuotas Tot.</th>
                    <th style="padding:5px 6px;text-align:right;font-weight:600;font-size:9px;">Cuotas Pag.</th>
                    <th style="padding:5px 6px;text-align:right;font-weight:600;font-size:9px;">Cuota Sem.</th>
                    <th style="padding:5px 6px;text-align:right;font-weight:600;font-size:9px;">Estado</th>
                  </tr>
                </thead>
                <tbody>${previewRows}
                ${cambios.length > 50 ? `<tr><td colspan="8" style="padding:6px;text-align:center;color:#9CA3AF;font-size:11px;">... y ${cambios.length - 50} cambios mas</td></tr>` : ''}
                </tbody>
              </table>
            </div>
            <div style="margin-top:8px;font-size:10px;color:#6B7280;">Los valores <span style="text-decoration:line-through;">tachados</span> son los actuales. Los valores en <strong>negrita</strong> son los nuevos.</div>
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: `Confirmar ${cambios.length} cambios`,
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#ff0033',
        width: 850,
        customClass: {
          popup: 'swal-compact',
          title: 'swal-title-compact',
          htmlContainer: 'swal-html-compact'
        }
      })

      if (!isConfirmed) return

      // Ejecutar updates
      setLoading(true)
      const now = new Date().toISOString()
      let updated = 0
      let errors = 0

      for (const c of cambios) {
         
        const { error } = await (supabase.from('garantias_conductores') as any)
          .update({
            monto_total: c.monto_total,
            monto_pagado: c.monto_pagado,
            cuotas_totales: c.cuotas_totales,
            cuotas_pagadas: c.cuotas_pagadas,
            monto_cuota_semanal: c.monto_cuota_semanal,
            estado: c.estado,
            updated_at: now,
          })
          .eq('id', c.garantia_id)

        if (error) {
          errors++
        } else {
          updated++
        }
      }

      if (errors > 0) {
        Swal.fire('Importacion parcial', `${updated} actualizados, ${errors} errores`, 'warning')
      } else {
        Swal.fire('Importacion exitosa', `${updated} garantias actualizadas`, 'success')
      }

      await cargarGarantias()
    } catch {
      setLoading(false)
      Swal.fire('Error', 'No se pudo procesar el archivo', 'error')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
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
            data-filter-id="conductor"
            onClick={(e) => { e.stopPropagation(); setOpenColumnFilter(openColumnFilter === 'conductor' ? null : 'conductor') }}
          >
            <Filter size={12} />
          </button>
          {openColumnFilter === 'conductor' && createPortal(
            <div className="dt-column-filter-dropdown dt-excel-filter dt-filter-portal" style={{ position: 'fixed', top: (document.querySelector('[data-filter-id="conductor"]')?.getBoundingClientRect().bottom ?? 0) + 4, left: Math.min(document.querySelector('[data-filter-id="conductor"]')?.getBoundingClientRect().left ?? 0, window.innerWidth - 268) }} onClick={(e) => e.stopPropagation()}>
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
            </div>,
            document.body
          )}
        </div>
      ),
      cell: ({ row }) => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="font-medium">{row.original.conductor_nombre}</span>
            <span className={`fact-badge ${row.original.tipo_alquiler === 'CARGO' ? 'fact-badge-blue' : 'fact-badge-purple'}`} style={{ fontSize: '9px', padding: '1px 5px' }}>
              {row.original.tipo_alquiler}
            </span>
          </div>
          <div className="text-xs text-gray-500">{row.original.conductor_cuit || row.original.conductor_dni}</div>
        </div>
      )
    },
    {
      id: 'estado_conductor',
      header: 'Estado Cond.',
      cell: ({ row }) => {
        const estado = (row.original as any).estado_conductor || 'ACTIVO'
        return (
          <span className={`fact-badge ${estado === 'ACTIVO' ? 'fact-badge-green' : 'fact-badge-red'}`} style={{ fontSize: '10px' }}>
            {estado}
          </span>
        )
      }
    },
    {
      id: 'dias_desde_baja',
      header: 'Días Baja',
      cell: ({ row }) => {
        const fechaBaja = (row.original as any).fecha_baja
        if (!fechaBaja) return <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>N/A</span>
        const dias = Math.floor((new Date().getTime() - new Date(fechaBaja).getTime()) / (1000 * 60 * 60 * 24))
        return (
          <span style={{ fontSize: '11px', fontWeight: 600, color: dias > 30 ? '#ef4444' : dias > 14 ? '#d97706' : 'var(--text-primary)' }}>
            {dias} días
          </span>
        )
      }
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
      id: 'progreso',
      header: 'Progreso',
      cell: ({ row }) => {
        const porcentaje = row.original.monto_total > 0
          ? (row.original.monto_pagado / row.original.monto_total) * 100
          : 0
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
            data-filter-id="estado"
            onClick={(e) => { e.stopPropagation(); setOpenColumnFilter(openColumnFilter === 'estado' ? null : 'estado') }}
          >
            <Filter size={12} />
          </button>
          {openColumnFilter === 'estado' && createPortal(
            <div className="dt-column-filter-dropdown dt-excel-filter dt-filter-portal" style={{ position: 'fixed', top: (document.querySelector('[data-filter-id="estado"]')?.getBoundingClientRect().bottom ?? 0) + 4, left: Math.min(document.querySelector('[data-filter-id="estado"]')?.getBoundingClientRect().left ?? 0, window.innerWidth - 268) }} onClick={(e) => e.stopPropagation()}>
              <div className="dt-excel-filter-list">
                {[
                  { value: 'completada', label: 'Completada' },
                  { value: 'en_curso', label: 'En Curso' },
                  { value: 'en_devolucion', label: 'En Devolución' },
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
            </div>,
            document.body
          )}
        </div>
      ),
      cell: ({ row }) => {
        const estado = row.original.estado
        const config: Record<string, { class: string; label: string }> = {
          completada: { class: 'fact-badge-green', label: 'Completada' },
          en_curso: { class: 'fact-badge-yellow', label: 'En Curso' },
          en_devolucion: { class: 'fact-badge-blue', label: 'En Devolución' },
          pendiente: { class: 'fact-badge-gray', label: 'Pendiente' }
        }
        const { class: badgeClass, label } = config[estado] || { class: 'fact-badge-gray', label: estado }
        if (estado === 'en_devolucion') {
          const devuelto = (row.original as any).monto_devuelto || 0
          const porDev = row.original.monto_pagado - devuelto
          return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
              <span className={`fact-badge ${badgeClass}`}>{label}</span>
              <span style={{ fontSize: '10px', color: porDev > 0 ? '#2563eb' : '#16a34a', fontWeight: 600 }}>
                {porDev > 0 ? `Pend: ${formatCurrency(porDev)}` : 'Devuelto'}
              </span>
            </div>
          )
        }
        return <span className={`fact-badge ${badgeClass}`}>{label}</span>
      }
    },
    {
      id: 'acciones',
      header: '',
      cell: ({ row }) => {
        const esBaja = (row.original as any).estado_conductor === 'BAJA'
        const esDevolucion = row.original.estado === 'en_devolucion'
        const pendienteDevolver = esDevolucion && row.original.monto_pagado > (row.original as any).monto_devuelto
        return (
          <div className="fact-table-actions">
            <button className="fact-table-btn fact-table-btn-view" onClick={() => verHistorial(row.original)} data-tooltip="Ver historial">
              <Eye size={14} />
            </button>
            {!esBaja && row.original.estado !== 'completada' && !esDevolucion && (
              <button className="fact-table-btn" onClick={() => registrarPago(row.original)} data-tooltip="Registrar pago" style={{ color: '#16a34a' }}>
                <Banknote size={14} />
              </button>
            )}
            {pendienteDevolver && (isAdmin() || isAdministrativo()) && (
              <button className="fact-table-btn" onClick={() => registrarDevolucion(row.original)} data-tooltip="Registrar devolución" style={{ color: '#2563eb' }}>
                <RotateCcw size={14} />
              </button>
            )}
            {(isAdmin() || isAdministrativo()) && (
              <button className="fact-table-btn fact-table-btn-edit" onClick={() => editarGarantia(row.original)} data-tooltip="Editar">
                <Edit3 size={14} />
              </button>
            )}
            {isAdmin() && (
              <button className="fact-table-btn fact-table-btn-danger" onClick={() => eliminarGarantia(row.original)} data-tooltip="Eliminar">
                <Trash2 size={14} />
              </button>
            )}
          </div>
        )
      }
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
            data-filter-id="mov-conductor"
            onClick={(e) => { e.stopPropagation(); setOpenColumnFilter(openColumnFilter === 'mov-conductor' ? null : 'mov-conductor') }}
          >
            <Filter size={12} />
          </button>
          {openColumnFilter === 'mov-conductor' && createPortal(
            <div className="dt-column-filter-dropdown dt-excel-filter dt-filter-portal" style={{ position: 'fixed', top: (document.querySelector('[data-filter-id="mov-conductor"]')?.getBoundingClientRect().bottom ?? 0) + 4, left: Math.min(document.querySelector('[data-filter-id="mov-conductor"]')?.getBoundingClientRect().left ?? 0, window.innerWidth - 268) }} onClick={(e) => e.stopPropagation()}>
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
            </div>,
            document.body
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
      // Filtro estado conductor
      if (estadoCondFilter !== 'todos') {
        const ec = ((g as any).estado_conductor || 'ACTIVO').toUpperCase()
        if (estadoCondFilter === 'activo' && ec !== 'ACTIVO') return false
        if (estadoCondFilter === 'baja' && ec !== 'BAJA') return false
      }
      // Filtro asignado
      if (asignadoFilter === 'asignado' && !conductoresAsignados.has(g.conductor_id)) return false
      if (asignadoFilter === 'no_asignado' && conductoresAsignados.has(g.conductor_id)) return false
      return true
    })
  }, [garantias, filtroEstado, conductorFilter, tipoFilter, estadoFilter, estadoCondFilter, asignadoFilter, conductoresAsignados])

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
    const enDevolucion = garantias.filter(g => g.estado === 'en_devolucion').length
    const totalRecaudado = garantias.reduce((sum, g) => sum + g.monto_pagado, 0)
    const totalPorRecaudar = garantias.reduce((sum, g) => sum + (g.monto_total - g.monto_pagado), 0)
    const totalADevolver = garantias.filter(g => g.estado === 'en_devolucion').reduce((sum, g) => sum + g.monto_pagado, 0)
    return { total, completadas, enCurso, enDevolucion, totalRecaudado, totalPorRecaudar, totalADevolver }
  }, [garantias])

  // ========== RENDER ==========

  return (
    <>
      {/* Loading Overlay - bloquea toda la pantalla */}
      <LoadingOverlay show={loading} message="Cargando garantias..." size="lg" />

      {/* Hidden file input for import */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".xlsx,.xls"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) importarGarantias(file)
        }}
      />

      {/* Contenido Garantías (sub-tab Movimientos removido - no se usa) */}
      {activeSubTab === 'garantias' && (
        <>
          {/* Header (filtro removido - se usan los filtros de columna) */}
          <div className="fact-header">
            <div className="fact-header-left">
              {(isAdmin() || isAdministrativo()) && (
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    className="fact-btn fact-btn-secondary"
                    onClick={exportarGarantias}
                    title="Exportar garantias a Excel"
                  >
                    <Download size={14} /> Exportar
                  </button>
                  <button
                    className="fact-btn fact-btn-primary"
                    onClick={() => fileInputRef.current?.click()}
                    title="Importar garantias desde Excel"
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
              <VerLogsButton tablas={['garantias_conductores', 'garantias_pagos']} label="Garantías" />
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
                <DollarSign size={18} className="fact-stat-icon" />
                <div className="fact-stat-content">
                  <span className="fact-stat-value">{formatCurrency(stats.totalRecaudado)}</span>
                  <span className="fact-stat-label">Recaudado</span>
                </div>
              </div>
              <div className="fact-stat-card">
                <AlertTriangle size={18} className="fact-stat-icon" />
                <div className="fact-stat-content">
                  <span className="fact-stat-value">{formatCurrency(stats.totalPorRecaudar)}</span>
                  <span className="fact-stat-label">Por Recaudar</span>
                </div>
              </div>
              {stats.enDevolucion > 0 && (
                <div className="fact-stat-card">
                  <RotateCcw size={18} className="fact-stat-icon" />
                  <div className="fact-stat-content">
                    <span className="fact-stat-value">{stats.enDevolucion}</span>
                    <span className="fact-stat-label">En Devolución</span>
                  </div>
                </div>
              )}
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
                <ArrowUpCircle size={18} className="fact-stat-icon" />
                <div className="fact-stat-content">
                  <span className="fact-stat-value">
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
