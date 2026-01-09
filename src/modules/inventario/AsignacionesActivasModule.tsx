import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../../components/ui/DataTable/DataTable'
import { ExcelColumnFilter, useExcelFilters } from '../../components/ui/DataTable/ExcelColumnFilter'
import { Truck, Package, Calendar, Wrench } from 'lucide-react'

interface AsignacionActiva {
  id: string
  vehiculo_id: string
  vehiculo_patente: string
  vehiculo_marca: string
  vehiculo_modelo: string
  codigo: string
  producto: string
  cantidad: number
  fecha_asignacion: string
}

export function AsignacionesActivasModule() {
  const [asignaciones, setAsignaciones] = useState<AsignacionActiva[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Estados para filtros Excel con Portal
  const { openFilterId, setOpenFilterId } = useExcelFilters()
  const [patenteFilter, setPatenteFilter] = useState<string[]>([])
  const [productoFilter, setProductoFilter] = useState<string[]>([])

  useEffect(() => {
    loadAsignaciones()
  }, [])

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

  const loadAsignaciones = async () => {
    try {
      setLoading(true)
      setError(null)
      const { data, error: fetchError } = await supabase
        .from('inventario')
        .select(`
          id,
          cantidad,
          created_at,
          asignado_a_vehiculo_id,
          vehiculos:asignado_a_vehiculo_id (
            id,
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

      const transformed = (data || []).map((item: any) => ({
        id: item.id,
        vehiculo_id: item.vehiculos?.id || '',
        vehiculo_patente: item.vehiculos?.patente || '',
        vehiculo_marca: item.vehiculos?.marca || '',
        vehiculo_modelo: item.vehiculos?.modelo || '',
        codigo: item.productos?.codigo || '',
        producto: item.productos?.nombre || '',
        cantidad: item.cantidad,
        fecha_asignacion: item.created_at
      }))

      setAsignaciones(transformed)
    } catch (err: any) {
      console.error('Error cargando asignaciones:', err)
      setError(err.message || 'Error al cargar asignaciones')
    } finally {
      setLoading(false)
    }
  }

  // Stats
  const stats = useMemo(() => {
    const vehiculosUnicos = new Set(asignaciones.map(a => a.vehiculo_id)).size
    const totalHerramientas = asignaciones.reduce((sum, a) => sum + a.cantidad, 0)
    return { vehiculosUnicos, totalHerramientas }
  }, [asignaciones])

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
    }
  ], [patentesUnicas, patenteFilter, productosUnicos, productoFilter, openFilterId])

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
        emptyIcon={<Package size={48} />}
        emptyTitle="No hay herramientas asignadas"
        emptyDescription="Las herramientas asignadas a vehiculos apareceran aqui"
        pageSize={20}
        pageSizeOptions={[10, 20, 50]}
      />
    </div>
  )
}
