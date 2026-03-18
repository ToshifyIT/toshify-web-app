import { useEffect, useMemo, useState } from 'react'
import { Eye, Edit2, Trash2, FileText, AlertTriangle, Plus, Shield } from 'lucide-react'
import Swal from 'sweetalert2'
import { supabase } from '../../lib/supabase'
import { useSede } from '../../contexts/SedeContext'
import { useAuth } from '../../contexts/AuthContext'
import { showSuccess } from '../../utils/toast'
import { DataTable } from '../../components/ui/DataTable'
import { LoadingOverlay } from '../../components/ui/LoadingOverlay'
import type { ColumnDef } from '@tanstack/react-table'
import { normalizePatente } from '../../utils/normalizeDocuments'
import './VencimientosModule.css'

interface Vencimiento {
  id: string
  titular: string
  patente: string
  documento?: string | null
  fecha_entrega?: string | null
  fecha_vencimiento: string
  fecha_iniciar_gestion?: string | null
  prioridad: 'ALTO' | 'MEDIO' | 'BAJO' | 'N/A'
  solicitado: boolean
  observacion?: string | null
  created_at: string
  usuario_creacion?: string | null
  fecha_edicion?: string | null
  usuario_edicion?: string | null
}

type ModalMode = 'create' | 'edit' | 'view'

interface VencimientoFormData {
  titular: string
  patente: string
  documento?: string
  fecha_entrega?: string
  fecha_vencimiento: string
  fecha_iniciar_gestion?: string
  solicitado: boolean
  observacion?: string
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const str = String(value)
  const iso = str.slice(0, 10)
  const parts = iso.split('-')
  if (parts.length === 3) {
    const [y, m, d] = parts.map(Number)
    if (!Number.isNaN(y) && !Number.isNaN(m) && !Number.isNaN(d)) {
      return new Date(y, m - 1, d)
    }
  }
  const fallback = new Date(value)
  if (Number.isNaN(fallback.getTime())) return null
  return fallback
}

function formatDate(value: string | null | undefined): string {
  const date = parseDate(value)
  if (!date) return '-'
  const day = `${date.getDate()}`.padStart(2, '0')
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  })
}

function formatDateInput(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeToday(): Date {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today
}

/**
 * Determina si un registro está vencido (fecha_vencimiento <= hoy).
 * El día del vencimiento ya se considera vencido.
 * Se usa para el KPI "Vencidos", su filtro, y para excluir de "Próximas a vencer".
 */
function isVencido(fechaVencimiento: string | null | undefined): boolean {
  const d = parseDate(fechaVencimiento)
  if (!d) return false
  const today = normalizeToday()
  const target = new Date(d)
  target.setHours(0, 0, 0, 0)
  return target.getTime() <= today.getTime()
}

/**
 * Calcula la prioridad visual del registro según el tipo de documento y días restantes.
 * NO retorna 'VENCIDO' — los registros vencidos conservan su última prioridad aplicable.
 * Para saber si un registro está vencido, usar isVencido().
 */
function calculateDisplayPriority(fechaVencimiento: string | null | undefined, documento: string | null | undefined): 'ALTO' | 'MEDIO' | 'BAJO' | 'N/A' {
  const d = parseDate(fechaVencimiento)
  if (!d) return 'BAJO'

  const today = normalizeToday()
  const target = new Date(d)
  target.setHours(0, 0, 0, 0)

  const diffDays = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  // Para registros vencidos (diffDays < 0), usamos el valor absoluto
  // para evaluar qué tan lejos están del vencimiento con las mismas reglas
  const absDays = Math.abs(diffDays)

  // N/A: más de 6 meses en el futuro (no aplica a vencidos)
  if (diffDays > 180) return 'N/A'

  const doc = (documento || '').toLowerCase().trim()

  // Reglas por documento (aplican tanto a vencidos como no vencidos)
  if (doc === 'matafuegos') {
    // Vencido o <= 15 días → MEDIO, sino BAJO
    if (diffDays < 0 || diffDays <= 15) return 'MEDIO'
    return 'BAJO'
  }

  // Grupo 1: Umbral 15 días — Constancia de cédula, GNC, Patente provisoria
  if (
    doc === 'constancia de cédula' ||
    doc === 'gnc' ||
    doc === 'tarjeta gnc' ||
    doc === 'patente provisoria'
  ) {
    if (diffDays < 0 || diffDays <= 15) return 'ALTO'
    return 'BAJO'
  }

  // Grupo 2: Umbral 30 días — VTV, Habilitacion remis, Seguro
  if (
    doc === 'vtv' ||
    doc === 'habilitacion remis' ||
    doc === 'seguro'
  ) {
    if (diffDays < 0 || diffDays <= 30) return 'ALTO'
    return 'BAJO'
  }

  // Default para otros documentos
  if (diffDays < 0 || diffDays <= 30) return 'ALTO'
  return 'BAJO'
}

function isProximoAVencer(item: Vencimiento): boolean {
  if (isVencido(item.fecha_vencimiento)) return false
  const p = calculateDisplayPriority(item.fecha_vencimiento, item.documento)
  return p === 'ALTO' || p === 'MEDIO'
}

export function VencimientosModule() {
  const { sedeActual } = useSede()
  const { user, profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<Vencimiento[]>([])
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<'all' | 'proximos' | 'vencidos' | 'alta' | 'media' | 'baja'>('all')

  const [vehiculos, setVehiculos] = useState<Array<{ id: string; patente: string; marca: string; modelo: string; titular: string }>>([])
  const [patenteSedeMap, setPatenteSedeMap] = useState<Map<string, string>>(new Map())
  const [vehiculoSearch, setVehiculoSearch] = useState('')
  const [showVehiculoDropdown, setShowVehiculoDropdown] = useState(false)

  const [showModal, setShowModal] = useState(false)

  function getFilterLabel(filter: string): string {
    switch (filter) {
      case 'proximos': return 'Próximas a vencer'
      case 'vencidos': return 'Vencidos'
      case 'alta': return 'Prioridad alta'
      case 'media': return 'Prioridad media'
      case 'baja': return 'Prioridad baja'
      default: return filter
    }
  }

  const activeFiltersList = useMemo(() => {
    if (activeFilter === 'all') return []
    return [{
      id: 'kpi-filter',
      label: getFilterLabel(activeFilter),
      onClear: () => setActiveFilter('all')
    }]
  }, [activeFilter])
  const [modalMode, setModalMode] = useState<ModalMode>('create')
  const [selectedItem, setSelectedItem] = useState<Vencimiento | null>(null)
  const [formData, setFormData] = useState<VencimientoFormData>({
    titular: '',
    patente: '',
    documento: '',
    fecha_entrega: '',
    fecha_vencimiento: '',
    fecha_iniciar_gestion: '',
    solicitado: false,
    observacion: ''
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadData()
    loadVehiculos()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('vencimientos' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(3000)

      if (error) throw error

      const mapped: Vencimiento[] = (data || []).map((row: any) => ({
        id: row.id,
        titular: row.titular || '',
        patente: row.patente || '',
        documento: row.documento ?? null,
        fecha_entrega: row.fecha_entrega ?? null,
        fecha_vencimiento: row.fecha_vencimiento,
        fecha_iniciar_gestion: row.fecha_iniciar_gestion ?? null,
        prioridad: calculateDisplayPriority(row.fecha_vencimiento, row.documento),
        solicitado: !!row.solicitado,
        observacion: row.observacion ?? null,
        created_at: row.created_at,
        usuario_creacion: row.usuario_creacion ?? null,
        fecha_edicion: row.fecha_edicion ?? null,
        usuario_edicion: row.usuario_edicion ?? null
      }))

      setItems(mapped)
    } catch (error) {
      console.error('Error cargando vencimientos:', error)
      Swal.fire('Error', 'No se pudieron cargar los vencimientos', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function loadVehiculos() {
    try {
      const { data, error } = await supabase
        .from('vehiculos' as any)
        .select('id, patente, marca, modelo, titular, sede_id, sedes(nombre)')
        .order('patente', { ascending: true })

      if (error) throw error

      const mapped = (data || []).map((v: any) => ({
        id: v.id as string,
        patente: (v.patente || '') as string,
        marca: (v.marca || '') as string,
        modelo: (v.modelo || '') as string,
        titular: (v.titular || '') as string,
        sedeNombre: v.sedes?.nombre as string
      }))

      setVehiculos(mapped)

      // Crear mapa patente -> sede (normalizado)
      const map = new Map<string, string>()
      mapped.forEach((v: any) => {
        if (v.patente && v.sedeNombre) {
          map.set(normalizePatente(v.patente), v.sedeNombre)
        }
      })
      setPatenteSedeMap(map)
    } catch (error) {
      console.error('Error cargando vehiculos para vencimientos:', error)
    }
  }

  const filteredVehiculos = useMemo(() => {
    const term = vehiculoSearch.toLowerCase().trim()
    if (!term) return []
    return vehiculos.filter(v =>
      v.patente.toLowerCase().includes(term) ||
      v.marca.toLowerCase().includes(term) ||
      v.modelo.toLowerCase().includes(term)
    ).slice(0, 10)
  }, [vehiculos, vehiculoSearch])

  // Dataset filtrado por sede (base para KPIs y tabla)
  const sedeFilteredItems = useMemo(() => {
    if (!sedeActual || !sedeActual.id) return items
    return items.filter(item => {
      const sedeNombre = patenteSedeMap.get(normalizePatente(item.patente))
      return sedeNombre === sedeActual.nombre
    })
  }, [items, sedeActual, patenteSedeMap])

  const totalRegistros = useMemo(() => sedeFilteredItems.length, [sedeFilteredItems])

  const totalProximosAVencer = useMemo(() => {
    return sedeFilteredItems.filter(i => isProximoAVencer(i)).length
  }, [sedeFilteredItems])

  const totalPrioridadAlta = useMemo(() => {
    return sedeFilteredItems.filter(i => calculateDisplayPriority(i.fecha_vencimiento, i.documento) === 'ALTO').length
  }, [sedeFilteredItems])

  const totalPrioridadMedia = useMemo(() => {
    return sedeFilteredItems.filter(i => calculateDisplayPriority(i.fecha_vencimiento, i.documento) === 'MEDIO').length
  }, [sedeFilteredItems])

  const totalPrioridadBaja = useMemo(() => {
    return sedeFilteredItems.filter(i => calculateDisplayPriority(i.fecha_vencimiento, i.documento) === 'BAJO').length
  }, [sedeFilteredItems])

  const totalVencidos = useMemo(
    () => sedeFilteredItems.filter(i => isVencido(i.fecha_vencimiento)).length,
    [sedeFilteredItems]
  )

  const filteredItems = useMemo(() => {
    // Partimos del dataset ya filtrado por sede
    let res = [...sedeFilteredItems]

    // 1. Aplicar filtro por KPI
    if (activeFilter === 'proximos') {
      res = res.filter(i => isProximoAVencer(i))
    } else if (activeFilter === 'vencidos') {
      res = res.filter(i => isVencido(i.fecha_vencimiento))
    } else if (activeFilter === 'alta') {
      res = res.filter(i => calculateDisplayPriority(i.fecha_vencimiento, i.documento) === 'ALTO')
    } else if (activeFilter === 'media') {
      res = res.filter(i => calculateDisplayPriority(i.fecha_vencimiento, i.documento) === 'MEDIO')
    } else if (activeFilter === 'baja') {
      res = res.filter(i => calculateDisplayPriority(i.fecha_vencimiento, i.documento) === 'BAJO')
    }

    // 2. Aplicar filtro de búsqueda
    if (!search.trim()) return res
    const searchLower = search.toLowerCase().trim()
    return res.filter(item => {
      const text = [
        item.titular,
        item.patente,
        item.documento || ''
      ].join(' ').toLowerCase()
      return text.includes(searchLower)
    })
  }, [sedeFilteredItems, search, activeFilter])

  function openCreateModal() {
    setModalMode('create')
    setSelectedItem(null)
    setFormData({
      titular: '',
      patente: '',
      documento: '',
      fecha_entrega: formatDateInput(new Date()),
      fecha_vencimiento: '',
      fecha_iniciar_gestion: '',
      solicitado: false,
      observacion: ''
    })
    setShowModal(true)
  }

  function openViewModal(item: Vencimiento) {
    setModalMode('view')
    setSelectedItem(item)
    setFormData({
      titular: item.titular,
      patente: item.patente,
      documento: item.documento || '',
      fecha_entrega: item.fecha_entrega || '',
      fecha_vencimiento: item.fecha_vencimiento,
      fecha_iniciar_gestion: item.fecha_iniciar_gestion || '',
      solicitado: item.solicitado,
      observacion: item.observacion || ''
    })
    setShowModal(true)
  }

  function openEditModal(item: Vencimiento) {
    setModalMode('edit')
    setSelectedItem(item)
    setFormData({
      titular: item.titular,
      patente: item.patente,
      documento: item.documento || '',
      fecha_entrega: item.fecha_entrega || '',
      fecha_vencimiento: item.fecha_vencimiento,
      fecha_iniciar_gestion: item.fecha_iniciar_gestion || '',
      solicitado: item.solicitado,
      observacion: item.observacion || ''
    })
    setShowModal(true)
  }

  async function handleDelete(item: Vencimiento) {
    const result = await Swal.fire({
      title: 'Eliminar registro',
      text: '¿Estás seguro de que deseas eliminar este vencimiento?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626'
    })
    if (!result.isConfirmed) return

    try {
      const { error } = await supabase
        .from('vencimientos' as any)
        .delete()
        .eq('id', item.id)

      if (error) throw error

      setItems(prev => prev.filter(x => x.id !== item.id))
      showSuccess('Registro eliminado correctamente')
    } catch (error) {
      console.error('Error eliminando vencimiento:', error)
      Swal.fire('Error', 'No se pudo eliminar el registro', 'error')
    }
  }

  async function handleToggleSolicitado(item: Vencimiento) {
    const nuevoValor = !item.solicitado
    try {
      const { error } = await supabase
        .from('vencimientos' as any)
        .update({ solicitado: nuevoValor })
        .eq('id', item.id)

      if (error) throw error

      setItems(prev =>
        prev.map(x => (x.id === item.id ? { ...x, solicitado: nuevoValor } : x))
      )
      showSuccess('Estado actualizado correctamente')
    } catch (error) {
      console.error('Error actualizando solicitado:', error)
      Swal.fire('Error', 'No se pudo actualizar el estado', 'error')
    }
  }

  async function handleSubmit() {
    if (!formData.titular.trim() || !formData.patente.trim() || !formData.fecha_vencimiento || !formData.documento?.trim()) {
      Swal.fire('Campos incompletos', 'Completa los campos obligatorios', 'warning')
      return
    }

    setSaving(true)
    try {
      if (modalMode === 'create') {
        const usuarioActual = profile?.full_name || user?.email || 'desconocido'
        const payload = {
          titular: formData.titular.trim(),
          patente: formData.patente.trim(),
          documento: formData.documento?.trim() || null,
          fecha_entrega: formData.fecha_entrega || null,
          fecha_vencimiento: formData.fecha_vencimiento,
          fecha_iniciar_gestion: formData.fecha_iniciar_gestion || null,
          solicitado: formData.solicitado,
          observacion: formData.observacion?.trim() || null,
          usuario_creacion: usuarioActual
        }

        const { data, error } = await supabase
          .from('vencimientos' as any)
          .insert(payload)
          .select()
          .single()

        if (error) throw error

        const row = data as any
        const mapped: Vencimiento = {
          id: row.id,
          titular: row.titular || '',
          patente: row.patente || '',
          documento: row.documento ?? null,
          fecha_entrega: row.fecha_entrega ?? null,
          fecha_vencimiento: row.fecha_vencimiento,
          fecha_iniciar_gestion: row.fecha_iniciar_gestion ?? null,
          prioridad: calculateDisplayPriority(row.fecha_vencimiento, row.documento),
          solicitado: !!row.solicitado,
          observacion: row.observacion ?? null,
          created_at: row.created_at,
          usuario_creacion: row.usuario_creacion ?? null,
          fecha_edicion: row.fecha_edicion ?? null,
          usuario_edicion: row.usuario_edicion ?? null
        }

        setItems(prev => [mapped, ...prev])
        showSuccess('Registro creado correctamente')
      } else if (modalMode === 'edit' && selectedItem) {
        const usuarioActual = profile?.full_name || user?.email || 'desconocido'
        const payload = {
          titular: formData.titular.trim(),
          patente: formData.patente.trim(),
          documento: formData.documento?.trim() || null,
          fecha_entrega: formData.fecha_entrega || null,
          fecha_vencimiento: formData.fecha_vencimiento,
          fecha_iniciar_gestion: formData.fecha_iniciar_gestion || null,
          solicitado: formData.solicitado,
          observacion: formData.observacion?.trim() || null,
          fecha_edicion: new Date().toISOString(),
          usuario_edicion: usuarioActual
        }

        const { error } = await supabase
          .from('vencimientos' as any)
          .update(payload)
          .eq('id', selectedItem.id)

        if (error) throw error

        setItems(prev =>
          prev.map(x =>
            x.id === selectedItem.id
              ? {
                  ...x,
                  titular: payload.titular,
                  patente: payload.patente,
                  documento: payload.documento,
                  fecha_entrega: payload.fecha_entrega,
                  fecha_vencimiento: payload.fecha_vencimiento,
                  fecha_iniciar_gestion: payload.fecha_iniciar_gestion,
                  solicitado: payload.solicitado,
                  observacion: payload.observacion,
                  fecha_edicion: payload.fecha_edicion,
                  usuario_edicion: payload.usuario_edicion
                }
              : x
          )
        )
        showSuccess('Registro actualizado correctamente')
      }
      setShowModal(false)
    } catch (error) {
      console.error('Error guardando vencimiento:', error)
      Swal.fire('Error', 'No se pudo guardar el registro', 'error')
    } finally {
      setSaving(false)
    }
  }

  const columns = useMemo<ColumnDef<Vencimiento>[]>(() => [
    {
      accessorKey: 'titular',
      header: 'Titular / Patente',
      cell: ({ row }) => (
        <div>
          <div style={{ fontSize: '12px' }}>{row.original.titular}</div>
          <span className="venc-patente" style={{ fontSize: '11px' }}>{row.original.patente || '-'}</span>
        </div>
      ),
      enableSorting: true
    },
    {
      accessorKey: 'documento',
      header: 'Doc.',
      cell: ({ getValue }) => (getValue() as string) || '-',
      enableSorting: false
    },
    {
      accessorKey: 'fecha_entrega',
      header: 'Entrega',
      cell: ({ getValue }) => formatDate(getValue() as string | null | undefined),
      enableSorting: true
    },
    {
      accessorKey: 'fecha_vencimiento',
      header: 'Vence',
      cell: ({ row, getValue }) => {
        const raw = getValue() as string | null | undefined
        const label = formatDate(raw)
        const isProximo = isProximoAVencer(row.original)
        const cls = isProximo ? 'venc-fecha-vencimiento-proxima' : ''
        return <span className={cls}>{label}</span>
      },
      enableSorting: true
    },
    {
      accessorKey: 'fecha_iniciar_gestion',
      header: 'Gestión',
      cell: ({ getValue }) => formatDate(getValue() as string | null | undefined),
      enableSorting: true
    },
    {
      accessorKey: 'prioridad',
      header: 'Prioridad',
      cell: ({ row }) => {
        const pr = calculateDisplayPriority(row.original.fecha_vencimiento, row.original.documento)
        const upper = pr.toUpperCase()
        let cls = 'prioridad-badge prioridad-baja'
        if (upper === 'ALTO') cls = 'prioridad-badge prioridad-alta'
        else if (upper === 'MEDIO') cls = 'prioridad-badge prioridad-media'
        else if (upper === 'N/A') cls = 'prioridad-badge prioridad-na'
        return <span className={cls}>{upper}</span>
      },
      enableSorting: true
    },
    {
      id: 'solicitado',
      accessorFn: (row) => (row.solicitado ? 'Sí' : 'No'),
      header: 'Solicitado',
      cell: ({ row, getValue }) => {
        const value = getValue() as string
        const isSolicitado = value === 'Sí'
        const cls = isSolicitado ? 'solicitado-badge solicitado-si' : 'solicitado-badge solicitado-no'
        return (
          <button
            type="button"
            className={cls}
            onClick={() => handleToggleSolicitado(row.original)}
            title="Cambiar estado"
          >
            {value}
          </button>
        )
      },
      enableSorting: false
    },
    {
      id: 'acciones',
      header: '',
      cell: ({ row }) => (
        <div className="table-actions">
          <button
            type="button"
            className="btn-icon"
            onClick={() => openViewModal(row.original)}
            title="Ver"
          >
            <Eye size={16} />
          </button>
          <button
            type="button"
            className="btn-icon"
            onClick={() => openEditModal(row.original)}
            title="Editar"
          >
            <Edit2 size={16} />
          </button>
          <button
            type="button"
            className="btn-icon"
            onClick={() => handleDelete(row.original)}
            title="Eliminar"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ),
      enableSorting: false
    }
  ], [patenteSedeMap])

  const exportToExcel = async () => {
    try {
      const XLSX = await import('xlsx')
      const rows = filteredItems.map(item => ({
        Titular: item.titular,
        Patente: item.patente,
        Documento: item.documento || '',
        Fecha_entrega: formatDate(item.fecha_entrega),
        Fecha_vencimiento: formatDate(item.fecha_vencimiento),
        Fecha_iniciar_gestion: formatDate(item.fecha_iniciar_gestion),
        Prioridad: calculateDisplayPriority(item.fecha_vencimiento, item.documento),
        Solicitado: item.solicitado ? 'Sí' : 'No',
        Observaciones: item.observacion || ''
      }))

      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Vencimientos')
      const fecha = new Date().toISOString().split('T')[0]
      XLSX.writeFile(wb, `Vencimientos_${fecha}.xlsx`)
    } catch (error) {
      console.error('Error exportando a Excel:', error)
      Swal.fire('Error', 'No se pudo exportar a Excel', 'error')
    }
  }

  if (loading) {
    return (
      <div className="vencimientos-module">
        <LoadingOverlay show message="Cargando vencimientos..." size="lg" />
      </div>
    )
  }



  return (
    <div className="vencimientos-module">
      <div className="vencimientos-stats">
        <div className="stats-grid">
          <div
            className={`stat-card ${activeFilter === 'all' ? 'active' : ''}`}
            onClick={() => setActiveFilter('all')}
            style={{ cursor: 'pointer' }}
          >
            <FileText size={20} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{totalRegistros}</span>
              <span className="stat-label">Total registros</span>
            </div>
          </div>
          <div
            className={`stat-card ${activeFilter === 'proximos' ? 'active' : ''}`}
            onClick={() => setActiveFilter('proximos')}
            style={{ cursor: 'pointer' }}
          >
            <AlertTriangle size={20} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{totalProximosAVencer}</span>
              <span className="stat-label">Próximas a vencer</span>
            </div>
          </div>
          <div
            className={`stat-card ${activeFilter === 'vencidos' ? 'active' : ''}`}
            onClick={() => setActiveFilter('vencidos')}
            style={{ cursor: 'pointer' }}
          >
            <AlertTriangle size={20} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{totalVencidos}</span>
              <span className="stat-label">Vencidos</span>
            </div>
          </div>
          <div
            className={`stat-card ${activeFilter === 'alta' ? 'active' : ''}`}
            onClick={() => setActiveFilter('alta')}
            style={{ cursor: 'pointer' }}
          >
            <AlertTriangle size={20} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{totalPrioridadAlta}</span>
              <span className="stat-label">Prioridad alta</span>
            </div>
          </div>
          <div
            className={`stat-card ${activeFilter === 'media' ? 'active' : ''}`}
            onClick={() => setActiveFilter('media')}
            style={{ cursor: 'pointer' }}
          >
            <AlertTriangle size={20} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{totalPrioridadMedia}</span>
              <span className="stat-label">Prioridad media</span>
            </div>
          </div>
          <div
            className={`stat-card ${activeFilter === 'baja' ? 'active' : ''}`}
            onClick={() => setActiveFilter('baja')}
            style={{ cursor: 'pointer' }}
          >
            <Shield size={20} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{totalPrioridadBaja}</span>
              <span className="stat-label">Prioridad baja</span>
            </div>
          </div>
        </div>
      </div>

      <div className="vencimientos-header-row">
        <div className="vencimientos-header-left">
          <div className="vencimientos-tabs">
            <button
              type="button"
              className="vencimientos-tab active"
            >
              <FileText size={16} />
              Listado
              <span className="tab-badge">{filteredItems.length}</span>
            </button>
          </div>
        </div>
        <div className="tabs-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={exportToExcel}
          >
            <FileText size={16} />
            Exportar
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={openCreateModal}
          >
            <Plus size={16} />
            Nuevo Registro
          </button>
        </div>
      </div>

      {totalProximosAVencer > 0 && (
        <div className="vencimientos-alert">
          <div className="vencimientos-alert-item">
            <AlertTriangle size={16} />
            <span>
              <strong>Atención:</strong> hay {totalProximosAVencer} operación(es) que están próximas a vencer
            </span>
          </div>
        </div>
      )}

      <div className="vencimientos-search-row">
        <div className="vencimientos-search">
          <div className="vencimientos-search-wrapper">
            <svg
              className="vencimientos-search-icon"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              className="vencimientos-search-input"
              placeholder="Buscar por patente o titular..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="vencimientos-table">
        <DataTable
          data={filteredItems}
          columns={columns}
          loading={false}
          showSearch={false}
          pageSize={100}
          emptyIcon={<Shield size={40} />}
          emptyTitle="No hay vencimientos para mostrar"
          emptyDescription="Los vencimientos aparecerán aquí cuando se registren."
          externalFilters={activeFiltersList}
          onClearAllFilters={() => setActiveFilter('all')}
        />
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => !saving && setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                {modalMode === 'create'
                  ? 'Nuevo Registro'
                  : modalMode === 'edit'
                  ? 'Editar Registro'
                  : 'Detalle del Registro'}
              </h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => !saving && setShowModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-section">
                <div className="form-row">
                  <div className="form-group">
                    <label>
                      Patente
                      <span className="required">*</span>
                    </label>
                    <div className="searchable-select">
                      <input
                        type="text"
                        autoComplete="off"
                        value={formData.patente || vehiculoSearch}
                        onChange={e => {
                          const value = e.target.value
                          setVehiculoSearch(value)
                          setFormData(prev => ({ ...prev, patente: value }))
                          setShowVehiculoDropdown(true)
                        }}
                        onBlur={() => setTimeout(() => setShowVehiculoDropdown(false), 200)}
                        placeholder="Buscar por patente..."
                        disabled={modalMode === 'view' || saving}
                      />
                      {showVehiculoDropdown && vehiculoSearch && (
                        <div className="search-results">
                          {filteredVehiculos.length > 0 ? (
                            filteredVehiculos.map(v => (
                              <div
                                key={v.id}
                                className="search-result-item"
                                onClick={() => {
                                  setFormData(prev => ({ ...prev, patente: v.patente, titular: v.titular }))
                                  setVehiculoSearch('')
                                  setShowVehiculoDropdown(false)
                                }}
                              >
                                <strong>{v.patente}</strong> - {v.marca} {v.modelo}
                              </div>
                            ))
                          ) : (
                            <div className="search-result-item" style={{ cursor: 'default', color: '#64748b' }}>
                              Sin resultados
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="form-group">
                    <label>
                      Titular
                      <span className="required">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.titular}
                      disabled
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>
                      Documento
                      <span className="required">*</span>
                    </label>
                    <select
                      value={formData.documento || ''}
                      onChange={e => setFormData(prev => ({ ...prev, documento: e.target.value || undefined }))}
                      disabled={modalMode === 'view' || saving}
                    >
                      <option value="">Seleccionar</option>
                      <option value="Patente provisoria">Patente provisoria</option>
                      <option value="Constancia de cédula">Constancia de cédula</option>
                      <option value="VTV">VTV</option>
                      <option value="GNC">GNC</option>
                      <option value="Habilitacion remis">Habilitacion remis</option>
                      <option value="Matafuegos">Matafuegos</option>
                      <option value="Seguro">Seguro</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Solicitado</label>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={formData.solicitado}
                        onChange={e => setFormData(prev => ({ ...prev, solicitado: e.target.checked }))}
                        disabled={modalMode === 'view' || saving}
                      />
                      <span className="slider round">
                        <span className="on-text">Si</span>
                        <span className="off-text">NO</span>
                      </span>
                    </label>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Fecha de Entrega</label>
                    <input
                      type="date"
                      value={formData.fecha_entrega || ''}
                      onChange={e => setFormData(prev => ({ ...prev, fecha_entrega: e.target.value }))}
                      disabled={modalMode === 'view' || saving}
                    />
                  </div>
                  <div className="form-group">
                    <label>
                      Fecha de Vencimiento
                      <span className="required">*</span>
                    </label>
                    <input
                      type="date"
                      value={formData.fecha_vencimiento}
                      onChange={e => {
                        const newVal = e.target.value
                        setFormData(prev => {
                          const next = { ...prev, fecha_vencimiento: newVal }
                          // Si estamos editando, limpiar fecha_iniciar_gestion al cambiar fecha_vencimiento
                          if (modalMode === 'edit') {
                            next.fecha_iniciar_gestion = ''
                          }
                          return next
                        })
                      }}
                      disabled={modalMode === 'view' || saving}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Fecha para Iniciar Gestión</label>
                    <input
                      type="date"
                      value={formData.fecha_iniciar_gestion || ''}
                      onChange={e => setFormData(prev => ({ ...prev, fecha_iniciar_gestion: e.target.value }))}
                      disabled={modalMode === 'view' || saving}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group full-width">
                    <label>Observaciones</label>
                    <textarea
                      value={formData.observacion || ''}
                      onChange={e => setFormData(prev => ({ ...prev, observacion: e.target.value }))}
                      disabled={modalMode === 'view' || saving}
                    />
                  </div>
                </div>
              </div>
              {modalMode === 'view' && selectedItem && (
                <div className="venc-registro-section">
                  <span className="venc-registro-title">REGISTRO</span>
                  <div className="venc-registro-row">
                    <div className="venc-registro-item">
                      <span className="venc-registro-label">CREADO</span>
                      <span className="venc-registro-value">{formatDateTime(selectedItem.created_at)}</span>
                    </div>
                    <div className="venc-registro-item">
                      <span className="venc-registro-label">ÚLTIMA ACTUALIZACIÓN</span>
                      <span className="venc-registro-value">{selectedItem.fecha_edicion ? formatDateTime(selectedItem.fecha_edicion) : '---'}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            {modalMode !== 'view' && (
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => !saving && setShowModal(false)}
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleSubmit}
                  disabled={saving}
                >
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
