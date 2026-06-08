import { X, Check, Minus, ExternalLink } from 'lucide-react'
import type { OfertaLocacion } from '../../titulares/types/ofertaLocacion.types'

interface Props {
  oferta: OfertaLocacion
  onClose: () => void
}

export function OfertaLocacionDetailModal({ oferta, onClose }: Props) {
  const o = oferta

  const labelStyle: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--text-tertiary)',
    textTransform: 'uppercase',
    marginBottom: '2px',
  }

  const valueStyle: React.CSSProperties = {
    fontSize: '13px',
    color: 'var(--text-primary)',
    marginBottom: '12px',
  }

  // Grid class defined in VehicleManagement.css (.ol-grid-2) with responsive breakpoints

  const sectionTitle: React.CSSProperties = {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    marginBottom: '10px',
    marginTop: '16px',
    paddingBottom: '6px',
    borderBottom: '1px solid var(--border-primary)',
  }

  const boolIcon = (val: boolean) => val
    ? <Check size={14} style={{ color: '#059669' }} />
    : <Minus size={14} style={{ color: '#9ca3af' }} />

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('es-AR') : '-'
  const formatMoney = (v: number | null) => v != null ? `$${Number(v).toLocaleString('es-AR')}` : '-'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header" style={{ flexShrink: 0, flexDirection: 'column', gap: '6px', position: 'relative' }}>
          <h3 style={{ margin: 0, textAlign: 'center', width: '100%' }}>Detalle Oferta de Locacion</h3>
          <button className="modal-close" onClick={onClose} style={{ position: 'absolute', top: '12px', right: '12px' }}><X size={18} /></button>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '6px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
              {o.patente} - {o.titular_nombre}
            </span>
            {o.drive_folder_url && (
              <a
                href={o.drive_folder_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '5px 14px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#fff',
                  backgroundColor: '#dc2626',
                  borderRadius: '6px',
                  textDecoration: 'none',
                }}
              >
                <ExternalLink size={14} />
                Ver documentos
              </a>
            )}
          </div>
        </div>

        <div className="modal-body" style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
          <div style={sectionTitle}>Titular</div>
          <div className="ol-grid-2">
            <div><div style={labelStyle}>Nombre</div><div style={valueStyle}>{o.titular_nombre || '-'}</div></div>
            <div><div style={labelStyle}>DNI</div><div style={valueStyle}>{o.titular_dni_cuit || '-'}</div></div>
            <div><div style={labelStyle}>CUIT</div><div style={valueStyle}>{o.titular_cuit || '-'}</div></div>
            <div><div style={labelStyle}>Email</div><div style={valueStyle}>{o.titular_email || '-'}</div></div>
            <div><div style={labelStyle}>Domicilio</div><div style={valueStyle}>{o.titular_domicilio || '-'}</div></div>
            <div><div style={labelStyle}>Conyugue</div><div style={valueStyle}>{o.titular_conyugue || '-'}</div></div>
          </div>

          <div style={sectionTitle}>Vehiculo</div>
          <div className="ol-grid-2">
            <div><div style={labelStyle}>Patente</div><div style={valueStyle}>{o.patente || '-'}</div></div>
            <div><div style={labelStyle}>Marca / Modelo</div><div style={valueStyle}>{`${o.marca || ''} ${o.modelo || ''}`.trim() || '-'}</div></div>
            <div><div style={labelStyle}>Anio</div><div style={valueStyle}>{o.anio || '-'}</div></div>
            <div><div style={labelStyle}>Color</div><div style={valueStyle}>{o.color || '-'}</div></div>
            <div><div style={labelStyle}>Motor</div><div style={valueStyle}>{o.numero_motor || '-'}</div></div>
            <div><div style={labelStyle}>Chasis</div><div style={valueStyle}>{o.numero_chasis || '-'}</div></div>
            <div><div style={labelStyle}>Kilometraje</div><div style={valueStyle}>{o.kilometraje != null ? o.kilometraje.toLocaleString('es-AR') : '-'}</div></div>
          </div>

          <div style={sectionTitle}>Contrato</div>
          <div className="ol-grid-2">
            <div><div style={labelStyle}>Fecha Ingreso</div><div style={valueStyle}>{formatDate(o.fecha_ingreso)}</div></div>
            <div><div style={labelStyle}>Inicio Alquiler</div><div style={valueStyle}>{formatDate(o.fecha_inicio_alquiler)}</div></div>
            <div><div style={labelStyle}>Canon Mensual</div><div style={valueStyle}>{formatMoney(o.canon_mensual)}</div></div>
            <div><div style={labelStyle}>Socio</div><div style={valueStyle}>{o.socio || '-'}</div></div>
          </div>

          <div style={sectionTitle}>Estado del Vehiculo</div>
          <div className="ol-grid-2">
            <div><div style={labelStyle}>Nivel Nafta</div><div style={valueStyle}>{o.nivel_nafta || '-'}</div></div>
            <div><div style={labelStyle}>Titulo Automotor</div><div style={valueStyle}>{o.titulo_automotor || '-'}</div></div>
            <div><div style={labelStyle}>Tipo Cedula</div><div style={valueStyle}>{o.tipo_cedula || '-'}</div></div>
            <div><div style={labelStyle}>Llaves</div><div style={valueStyle}>{o.cantidad_llaves ?? '-'}</div></div>
          </div>

          <div style={sectionTitle}>Vencimientos</div>
          <div className="ol-grid-2">
            <div><div style={labelStyle}>Seguro</div><div style={valueStyle}>{formatDate(o.vencimiento_seguro)}</div></div>
            <div><div style={labelStyle}>VTV</div><div style={valueStyle}>{formatDate(o.vto_vtv)}</div></div>
            <div><div style={labelStyle}>GNC</div><div style={valueStyle}>{formatDate(o.vto_gnc)}</div></div>
            <div><div style={labelStyle}>Matafuego</div><div style={valueStyle}>{formatDate(o.vto_matafuego)}</div></div>
          </div>

          <div style={sectionTitle}>Elementos de Seguridad</div>
          <div className="ol-grid-2">
            {([
              ['criquet', 'Criquet'], ['mariposa', 'Mariposa'], ['llave_tuercas', 'Llave Tuercas'],
              ['rueda_auxilio', 'Rueda Auxilio'], ['balizas', 'Balizas'], ['chaleco_reflectivo', 'Chaleco'],
              ['guantes', 'Guantes'], ['botiquin', 'Botiquin'],
            ] as [keyof OfertaLocacion, string][]).map(([field, label]) => (
              <div key={field} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                {boolIcon(o[field] as boolean)}
                <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{label}</span>
              </div>
            ))}
          </div>

          <div style={sectionTitle}>Limpieza</div>
          <div className="ol-grid-2">
            <div><div style={labelStyle}>Interior</div><div style={valueStyle}>{o.limpieza_interior || '-'}</div></div>
            <div><div style={labelStyle}>Exterior</div><div style={valueStyle}>{o.limpieza_exterior || '-'}</div></div>
          </div>

          <div style={sectionTitle}>Relevamiento de Danios</div>
          {([
            ['detalle_parte_frontal', 'Parte Frontal'], ['detalle_parte_trasera', 'Parte Trasera'],
            ['detalle_lateral_derecho', 'Lateral Derecho'], ['detalle_lateral_izquierdo', 'Lateral Izquierdo'],
            ['detalle_capot_techo', 'Capot / Techo'], ['detalle_interior', 'Interior'], ['detalle_otros', 'Otros'],
          ] as [keyof OfertaLocacion, string][]).map(([field, label]) => {
            const val = o[field] as string | null
            if (!val) return null
            return (
              <div key={field} style={{ marginBottom: '8px' }}>
                <div style={labelStyle}>{label}</div>
                <div style={{ ...valueStyle, whiteSpace: 'pre-wrap' }}>{val}</div>
              </div>
            )
          })}

          <div style={sectionTitle}>Informes y Costos</div>
          <div className="ol-grid-2">
            <div><div style={labelStyle}>Informe Dominio</div><div style={{ ...valueStyle, whiteSpace: 'pre-wrap' }}>{o.informe_dominio || '-'}</div></div>
            <div><div style={labelStyle}>Informe Multas</div><div style={{ ...valueStyle, whiteSpace: 'pre-wrap' }}>{o.informe_multas || '-'}</div></div>
          </div>
          <div><div style={labelStyle}>Gravamenes</div><div style={{ ...valueStyle, whiteSpace: 'pre-wrap' }}>{o.gravamenes || '-'}</div></div>
          <div className="ol-grid-2">
            <div><div style={labelStyle}>Costo Multas</div><div style={valueStyle}>{formatMoney(o.costo_multas)}</div></div>
            <div><div style={labelStyle}>Costo Patente</div><div style={valueStyle}>{formatMoney(o.costo_patente)}</div></div>
            <div><div style={labelStyle}>Mantenimiento</div><div style={valueStyle}>{formatMoney(o.costo_mantenimiento_reparacion)}</div></div>
            <div><div style={labelStyle}>Otros</div><div style={valueStyle}>{formatMoney(o.otros_costos)}</div></div>
          </div>
        </div>

        <div className="modal-footer" style={{ flexShrink: 0 }}>
          <button className="btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}
