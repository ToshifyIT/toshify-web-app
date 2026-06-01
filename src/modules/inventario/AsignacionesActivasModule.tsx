import { useEffect, useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useSede } from '../../contexts/SedeContext'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../../components/ui/DataTable/DataTable'
import { ExcelColumnFilter, useExcelFilters } from '../../components/ui/DataTable/ExcelColumnFilter'
import { Truck, Package, Calendar, Wrench, RotateCcw, AlertTriangle, Clock, MapPin } from 'lucide-react'

interface AsignacionActiva {
  id: string
  producto_id: string
  vehiculo_id: string
  sede_id: string | null
  vehiculo_patente: string
  vehiculo_marca: string
  vehiculo_modelo: string
  codigo: string
  producto: string
  cantidad: number
  fecha_asignacion: string
  dias_asignada: number
}

export function AsignacionesActivasModule() {
  const navigate = useNavigate()
  const { sedeActual, sedeActualId, verTodas } = useSede()
  const [asignaciones, setAsignaciones] = useState<AsignacionActiva[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Estados para filtros Excel con Portal
  const { openFilterId, setOpenFilterId } = useExcelFilters()
  const [patenteFilter, setPatenteFilter] = useState<string[]>([])
  const [productoFilter, setProductoFilter] = useState<string[]>([])

  // Listas únicas para filtros
  const patentesUnicas = useMemo(() =>
    [...new Set(asignaciones.map(a => a.vehiculo_patente).filter(Boolean))].sort()
  , [asignaciones])

  const productosUnicos = useMemo(() =>
    [...new Set(asignaciones.map(a => a.producto).filter(Boolean))].sort()
  , [asignaciones])

  // Datos filtrados
  const asignacionesFiltradas = useMemo(() => {
    return asignaciones.filter(a => {
      if (patenteFilter.length > 0 && !patenteFilter.includes(a.vehiculo_patente)) return false
      if (productoFilter.length > 0 && !productoFilter.includes(a.producto)) return false
      return true
    })
  }, [asignaciones, patenteFilter, productoFilter])

  // Filtros externos para mostrar en la barra de filtros del DataTable
  const externalFilters = useMemo(() => {
    const filters: Array<{ id: string; label: string; onClear: () => void }> = []
    if (patenteFilter.length > 0) {
      filters.push({
        id: 'patente',
        label: `Patente: ${patenteFilter.length === 1 ? patenteFilter[0] : `${patenteFilter.length} seleccionados`}`,
        onClear: () => setPatenteFilter([])
      })
    }
    if (productoFilter.length > 0) {
      filters.push({
        id: 'producto',
        label: `Producto: ${productoFilter.length === 1 ? productoFilter[0] : `${productoFilter.length} seleccionados`}`,
        onClear: () => setProductoFilter([])
      })
    }
    return filters
  }, [patenteFilter, productoFilter])

  const handleClearAllFilters = () => {
    setPatenteFilter([])
    setProductoFilter([])
  }

  const loadAsignaciones = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const { data, error: fetchError } = await supabase
        .from('inventario')
        .select(`
          id,
          cantidad,
          created_at,
          producto_id,
          asignado_a_vehiculo_id,
          vehiculos:asignado_a_vehiculo_id (
            id,
            sede_id,
            patente,
            marca,
            modelo
          ),
          productos (
            id,
            codigo,
            nombre
          )
        `)
        .eq('estado', 'en_uso')
        .not('asignado_a_vehiculo_id', 'is', null)
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError

      const transformed = (data || []).map((item: any) => {
        const diasAsignada = Math.max(
          0,
          Math.floor((Date.now() - new Date(item.created_at).getTime()) / 86400000)
        )

        return {
          id: item.id,
          producto_id: item.producto_id || item.productos?.id || '',
          vehiculo_id: item.vehiculos?.id || '',
          sede_id: item.vehiculos?.sede_id || null,
          vehiculo_patente: item.vehiculos?.patente || '',
          vehiculo_marca: item.vehiculos?.marca || '',
          vehiculo_modelo: item.vehiculos?.modelo || '',
          codigo: item.productos?.codigo || '',
          producto: item.productos?.nombre || '',
          cantidad: item.cantidad,
          fecha_asignacion: item.created_at,
          dias_asignada: diasAsignada
        }
      }).filter((item: AsignacionActiva) => verTodas || !sedeActualId || item.sede_id === sedeActualId)

      setAsignaciones(transformed)
    } catch (err: any) {
      setError(err.message || 'Error al cargar asignaciones')
    } finally {
      setLoading(false)
    }
  }, [sedeActualId, verTodas])

  useEffect(() => {
    loadAsignaciones()
  }, [loadAsignaciones])

  // Stats
  const stats = useMemo(() => {
    const vehiculosUnicos = new Set(asignaciones.map(a => a.vehiculo_id)).size
    const totalHerramientas = asignaciones.reduce((sum, a) => sum + a.cantidad, 0)
    const asignacionesRetenidas = asignaciones.filter(a => a.dias_asignada >= 14).length
    const asignacionesPorRevisar = asignaciones.filter(a => a.dias_asignada >= 7 && a.dias_asignada < 14).length
    return { vehiculosUnicos, totalHerramientas, asignacionesRetenidas, asignacionesPorRevisar }
  }, [asignaciones])

  const irAMovimientos = useCallback((asignacion: AsignacionActiva, tipo: 'devolucion' | 'dano') => {
    const params = new URLSearchParams({
      tipo: tipo === 'devolucion' ? 'devolucion' : 'salida',
      producto: asignacion.producto_id,
      vehiculo: asignacion.vehiculo_id,
    })

    if (tipo === 'dano') {
      params.set('motivo', 'danado')
    }

    navigate(`/logistica/inventario/movimientos?${params.toString()}`)
  }, [navigate])

  // Columnas
  const columns = useMemo<ColumnDef<AsignacionActiva, any>[]>(() => [
    {
      accessorKey: 'vehiculo_patente',
      header: () => (
        <ExcelColumnFilter
          label="Vehiculo"
          options={patentesUnicas}
          selectedValues={patenteFilter}
          onSelectionChange={setPatenteFilter}
          filterId="asig_patente"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            background: 'var(--color-primary)',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white'
          }}>
            <Truck size={16} />
          </div>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              {row.original.vehiculo_patente}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {row.original.vehiculo_marca} {row.original.vehiculo_modelo}
            </div>
          </div>
        </div>
      )
    },
    {
      accessorKey: 'codigo',
      header: 'Codigo',
      cell: ({ row }) => (
        <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
          {row.original.codigo}
        </span>
      )
    },
    {
      accessorKey: 'producto',
      header: () => (
        <ExcelColumnFilter
          label="Herramienta"
          options={productosUnicos}
          selectedValues={productoFilter}
          onSelectionChange={setProductoFilter}
          filterId="asig_producto"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Wrench size={14} style={{ color: 'var(--text-tertiary)' }} />
          <span style={{ color: 'var(--text-primary)' }}>{row.original.producto}</span>
        </div>
      )
    },
    {
      accessorKey: 'cantidad',
      header: 'Cantidad',
      cell: ({ row }) => (
        <div style={{ textAlign: 'center' }}>
          <span style={{
            fontWeight: 700,
            fontSize: '14px',
            color: 'var(--text-primary)',
            background: 'var(--badge-blue-bg)',
            padding: '4px 12px',
            borderRadius: '6px'
          }}>
            {row.original.cantidad}
          </span>
        </div>
      )
    },
    {
      accessorKey: 'fecha_asignacion',
      header: 'Fecha Asignacion',
      cell: ({ row }) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '13px' }}>
          <Calendar size={14} />
          {new Date(row.original.fecha_asignacion).toLocaleDateString('es-CL')}
        </div>
      )
    },
    {
      accessorKey: 'dias_asignada',
      header: 'Dias en uso',
      cell: ({ row }) => {
        const dias = row.original.dias_asignada
        const color = dias >= 14
          ? 'var(--badge-red-text)'
          : dias >= 7
            ? 'var(--badge-yellow-text)'
            : 'var(--badge-green-text)'
        const bg = dias >= 14
          ? 'var(--badge-red-bg)'
          : dias >= 7
            ? 'var(--badge-yellow-bg)'
            : 'var(--badge-green-bg)'

        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 10px',
            borderRadius: '12px',
            background: bg,
            color,
            fontSize: '12px',
            fontWeight: 700
          }}>
            <Clock size={13} />
            {dias} dias
          </span>
        )
      }
    },
    {
      id: 'acciones',
      header: 'Acciones',
      cell: ({ row }) => (
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => irAMovimientos(row.original, 'devolucion')}
            style={{
              border: '1px solid var(--border-primary)',
              borderRadius: '6px',
              background: 'var(--card-bg)',
              color: 'var(--text-primary)',
              padding: '6px 10px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px'
            }}
          >
            <RotateCcw size={14} />
            Devolver
          </button>
          <button
            type="button"
            onClick={() => irAMovimientos(row.original, 'dano')}
            style={{
              border: '1px solid var(--border-primary)',
              borderRadius: '6px',
              background: 'var(--badge-red-bg)',
              color: 'var(--badge-red-text)',
              padding: '6px 10px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px'
            }}
          >
            <AlertTriangle size={14} />
            Reportar
          </button>
        </div>
      )
    }
  ], [
    patentesUnicas,
    patenteFilter,
    productosUnicos,
    productoFilter,
    openFilterId,
    setOpenFilterId,
    irAMovimientos,
  ])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        <div style={{
          background: 'var(--card-bg)',
          borderRadius: '10px',
          padding: '16px 20px',
          border: '1px solid var(--border-primary)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{
            width: '44px',
            height: '44px',
            background: 'var(--badge-blue-bg)',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <MapPin size={22} style={{ color: 'var(--badge-blue-text)' }} />
          </div>
          <div>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, margin: 0 }}>
              Sede operativa
            </p>
            <p style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              {verTodas ? 'Todas las sedes' : (sedeActual?.nombre || 'Sede actual')}
            </p>
          </div>
        </div>

        <div style={{
          background: 'var(--card-bg)',
          borderRadius: '10px',
          padding: '16px 20px',
          border: '1px solid var(--border-primary)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{
            width: '44px',
            height: '44px',
            background: 'var(--badge-blue-bg)',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Truck size={22} style={{ color: 'var(--badge-blue-text)' }} />
          </div>
          <div>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, margin: 0 }}>
              Vehiculos con asignaciones
            </p>
            <p style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              {stats.vehiculosUnicos}
            </p>
          </div>
        </div>

        <div style={{
          background: 'var(--card-bg)',
          borderRadius: '10px',
          padding: '16px 20px',
          border: '1px solid var(--border-primary)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{
            width: '44px',
            height: '44px',
            background: 'var(--badge-yellow-bg)',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Clock size={22} style={{ color: 'var(--badge-yellow-text)' }} />
          </div>
          <div>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, margin: 0 }}>
              Por revisar
            </p>
            <p style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              {stats.asignacionesPorRevisar}
            </p>
          </div>
        </div>

        <div style={{
          background: 'var(--card-bg)',
          borderRadius: '10px',
          padding: '16px 20px',
          border: '1px solid var(--border-primary)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{
            width: '44px',
            height: '44px',
            background: 'var(--badge-red-bg)',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <AlertTriangle size={22} style={{ color: 'var(--badge-red-text)' }} />
          </div>
          <div>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, margin: 0 }}>
              Retenidas 14+ dias
            </p>
            <p style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              {stats.asignacionesRetenidas}
            </p>
          </div>
        </div>

        <div style={{
          background: 'var(--card-bg)',
          borderRadius: '10px',
          padding: '16px 20px',
          border: '1px solid var(--border-primary)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{
            width: '44px',
            height: '44px',
            background: 'var(--badge-yellow-bg)',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Package size={22} style={{ color: 'var(--badge-yellow-text)' }} />
          </div>
          <div>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, margin: 0 }}>
              Total herramientas asignadas
            </p>
            <p style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              {stats.totalHerramientas}
            </p>
          </div>
        </div>
      </div>

      {/* DataTable */}
      <DataTable
        data={asignacionesFiltradas}
        columns={columns}
        loading={loading}
        error={error}
        searchPlaceholder="Buscar por patente, codigo o herramienta..."
        emptyIcon={<Package size={48}
      />}
        emptyTitle="No hay herramientas asignadas"
        emptyDescription="Las herramientas asignadas a vehiculos apareceran aqui"
        pageSize={100}
        pageSizeOptions={[10, 20, 50, 100]}
        externalFilters={externalFilters}
        onClearAllFilters={handleClearAllFilters}
      />
    </div>
  )
}
