import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Truck, Package, Calendar } from 'lucide-react'

interface AsignacionActiva {
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
  const [filter, setFilter] = useState('')

  useEffect(() => {
    loadAsignaciones()
  }, [])

  const loadAsignaciones = async () => {
    try {
      setLoading(true)
      // Query inventario table for items in_uso assigned to vehicles
      const { data, error } = await supabase
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

      if (error) throw error

      // Transform data to match AsignacionActiva interface
      const transformed = (data || []).map((item: any) => ({
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
    } finally {
      setLoading(false)
    }
  }

  const filteredData = asignaciones.filter((item) =>
    item.vehiculo_patente.toLowerCase().includes(filter.toLowerCase()) ||
    item.vehiculo_marca.toLowerCase().includes(filter.toLowerCase()) ||
    item.vehiculo_modelo.toLowerCase().includes(filter.toLowerCase()) ||
    item.producto.toLowerCase().includes(filter.toLowerCase()) ||
    item.codigo.toLowerCase().includes(filter.toLowerCase())
  )

  // Agrupar por vehículo
  const porVehiculo = filteredData.reduce((acc, item) => {
    if (!acc[item.vehiculo_id]) {
      acc[item.vehiculo_id] = {
        vehiculo_patente: item.vehiculo_patente,
        vehiculo_marca: item.vehiculo_marca,
        vehiculo_modelo: item.vehiculo_modelo,
        herramientas: []
      }
    }
    acc[item.vehiculo_id].herramientas.push(item)
    return acc
  }, {} as Record<string, { vehiculo_patente: string, vehiculo_marca: string, vehiculo_modelo: string, herramientas: AsignacionActiva[] }>)

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <p>Cargando asignaciones...</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#1F2937', marginBottom: '8px' }}>
          Asignaciones Activas
        </h1>
        <p style={{ color: '#6B7280', fontSize: '14px' }}>
          Herramientas asignadas a vehículos
        </p>
      </div>

      {/* Búsqueda */}
      <div style={{ marginBottom: '24px' }}>
        <input
          type="text"
          placeholder="Buscar por vehículo o producto..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{
            width: '100%',
            maxWidth: '400px',
            padding: '10px 16px',
            border: '1px solid #D1D5DB',
            borderRadius: '8px',
            fontSize: '14px'
          }}
        />
      </div>

      {/* Resumen */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '32px' }}>
        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: '20px',
          border: '1px solid #E5E7EB',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '48px',
              height: '48px',
              background: '#DBEAFE',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Truck size={24} style={{ color: '#1E40AF' }} />
            </div>
            <div>
              <p style={{ fontSize: '12px', color: '#6B7280', fontWeight: 600 }}>Vehículos con asignaciones</p>
              <p style={{ fontSize: '24px', fontWeight: 700, color: '#1F2937' }}>
                {Object.keys(porVehiculo).length}
              </p>
            </div>
          </div>
        </div>

        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: '20px',
          border: '1px solid #E5E7EB',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '48px',
              height: '48px',
              background: '#FEF3C7',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Package size={24} style={{ color: '#D97706' }} />
            </div>
            <div>
              <p style={{ fontSize: '12px', color: '#6B7280', fontWeight: 600 }}>Total herramientas asignadas</p>
              <p style={{ fontSize: '24px', fontWeight: 700, color: '#1F2937' }}>
                {filteredData.reduce((sum, item) => sum + item.cantidad, 0)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Lista por Vehículo */}
      <div style={{ display: 'grid', gap: '20px' }}>
        {Object.entries(porVehiculo).map(([vehiculoId, data]) => (
          <div
            key={vehiculoId}
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              border: '1px solid #E5E7EB'
            }}
          >
            {/* Header del Vehículo */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '16px',
              paddingBottom: '16px',
              borderBottom: '2px solid #E5E7EB'
            }}>
              <div style={{
                width: '40px',
                height: '40px',
                background: '#DC2626',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white'
              }}>
                <Truck size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#1F2937', margin: 0 }}>
                  {data.vehiculo_patente}
                </h3>
                <p style={{ fontSize: '13px', color: '#6B7280', margin: '4px 0 0 0' }}>
                  {data.vehiculo_marca} {data.vehiculo_modelo} • {data.herramientas.length} herramientas asignadas
                </p>
              </div>
            </div>

            {/* Tabla de Herramientas */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F9FAFB' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: '#374151', textTransform: 'uppercase' }}>
                      Código
                    </th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: '#374151', textTransform: 'uppercase' }}>
                      Producto
                    </th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: '12px', fontWeight: 700, color: '#374151', textTransform: 'uppercase' }}>
                      Cantidad
                    </th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: '#374151', textTransform: 'uppercase' }}>
                      Fecha Asignación
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.herramientas.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #E5E7EB' }}>
                      <td style={{ padding: '12px', fontSize: '14px', fontWeight: 600, color: '#DC2626' }}>
                        {item.codigo}
                      </td>
                      <td style={{ padding: '12px', fontSize: '14px', fontWeight: 500 }}>
                        {item.producto}
                      </td>
                      <td style={{ padding: '12px', fontSize: '16px', fontWeight: 700, textAlign: 'center' }}>
                        {item.cantidad}
                      </td>
                      <td style={{ padding: '12px', fontSize: '14px', color: '#6B7280' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Calendar size={14} />
                          {new Date(item.fecha_asignacion).toLocaleDateString('es-CL')}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {filteredData.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          background: 'white',
          borderRadius: '12px',
          border: '1px solid #E5E7EB'
        }}>
          <Package size={48} style={{ color: '#D1D5DB', margin: '0 auto 16px' }} />
          <p style={{ fontSize: '16px', fontWeight: 600, color: '#6B7280' }}>
            No hay herramientas asignadas actualmente
          </p>
        </div>
      )}
    </div>
  )
}
