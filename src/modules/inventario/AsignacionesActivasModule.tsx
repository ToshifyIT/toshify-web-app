import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { User, Package, Calendar } from 'lucide-react'

interface AsignacionActiva {
  conductor_id: string
  conductor: string
  codigo: string
  producto: string
  cantidad: number
  ubicacion: string | null
  observaciones: string | null
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
      const { data, error } = await supabase
        .from('v_herramientas_por_conductor')
        .select('*')
        .order('conductor')

      if (error) throw error
      setAsignaciones(data || [])
    } catch (err: any) {
      console.error('Error cargando asignaciones:', err)
    } finally {
      setLoading(false)
    }
  }

  const filteredData = asignaciones.filter((item) =>
    item.conductor.toLowerCase().includes(filter.toLowerCase()) ||
    item.producto.toLowerCase().includes(filter.toLowerCase()) ||
    item.codigo.toLowerCase().includes(filter.toLowerCase())
  )

  // Agrupar por conductor
  const porConductor = filteredData.reduce((acc, item) => {
    if (!acc[item.conductor_id]) {
      acc[item.conductor_id] = {
        conductor: item.conductor,
        herramientas: []
      }
    }
    acc[item.conductor_id].herramientas.push(item)
    return acc
  }, {} as Record<string, { conductor: string, herramientas: AsignacionActiva[] }>)

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
          Herramientas asignadas a conductores y vehículos
        </p>
      </div>

      {/* Búsqueda */}
      <div style={{ marginBottom: '24px' }}>
        <input
          type="text"
          placeholder="Buscar por conductor o producto..."
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
              <User size={24} style={{ color: '#1E40AF' }} />
            </div>
            <div>
              <p style={{ fontSize: '12px', color: '#6B7280', fontWeight: 600 }}>Conductores con asignaciones</p>
              <p style={{ fontSize: '24px', fontWeight: 700, color: '#1F2937' }}>
                {Object.keys(porConductor).length}
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

      {/* Lista por Conductor */}
      <div style={{ display: 'grid', gap: '20px' }}>
        {Object.entries(porConductor).map(([conductorId, data]) => (
          <div
            key={conductorId}
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              border: '1px solid #E5E7EB'
            }}
          >
            {/* Header del Conductor */}
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
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: 700,
                fontSize: '16px'
              }}>
                {data.conductor.charAt(0)}
              </div>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#1F2937', margin: 0 }}>
                  {data.conductor}
                </h3>
                <p style={{ fontSize: '13px', color: '#6B7280', margin: '4px 0 0 0' }}>
                  {data.herramientas.length} herramientas asignadas
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
                      Ubicación
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
                        {item.ubicacion || '-'}
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
              {data.herramientas.some(h => h.observaciones) && (
                <div style={{ marginTop: '12px', padding: '12px', background: '#FEF3C7', borderRadius: '8px' }}>
                  <p style={{ fontSize: '12px', fontWeight: 600, color: '#92400E', marginBottom: '8px' }}>
                    Observaciones:
                  </p>
                  {data.herramientas.filter(h => h.observaciones).map((item, idx) => (
                    <p key={idx} style={{ fontSize: '13px', color: '#78350F', margin: '4px 0' }}>
                      <strong>{item.producto}:</strong> {item.observaciones}
                    </p>
                  ))}
                </div>
              )}
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
