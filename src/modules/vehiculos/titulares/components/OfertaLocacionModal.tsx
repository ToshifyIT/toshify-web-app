import { useState, useEffect, useCallback } from 'react'
import { X, Save, AlertTriangle, Check } from 'lucide-react'
import { supabase } from '../../../../lib/supabase'
import Swal from 'sweetalert2'
import { showSuccess } from '../../../../utils/toast'
import type { Titular, VehiculoTitular } from '../types/titulares.types'
import type { OfertaLocacion, OfertaLocacionFormData } from '../types/ofertaLocacion.types'
import { useGruposFlota } from '../../../../hooks/useGruposFlota'

interface Props {
  vehiculoTitular: VehiculoTitular
  titular: Titular
  sedeId: string | null
  userId: string
  userName: string
  onClose: () => void
}

const EMPTY_FORM: OfertaLocacionFormData = {
  titular_nombre: '',
  titular_dni_cuit: '',
  titular_domicilio: '',
  titular_email: '',
  titular_cuit: '',
  titular_conyugue: '',
  patente: '',
  marca: '',
  modelo: '',
  anio: '',
  color: '',
  numero_motor: '',
  numero_chasis: '',
  kilometraje: null,
  fecha_ingreso: '',
  fecha_inicio_alquiler: '',
  canon_mensual: null,
  socio: '',
  nivel_nafta: '',
  titulo_automotor: '',
  tipo_cedula: '',
  cantidad_llaves: null,
  vencimiento_seguro: '',
  vto_vtv: '',
  vto_gnc: '',
  vto_matafuego: '',
  criquet: '',
  mariposa: '',
  llave_tuercas: '',
  rueda_auxilio: '',
  balizas: '',
  chaleco_reflectivo: '',
  guantes: '',
  botiquin: '',
  limpieza_interior: '',
  limpieza_exterior: '',
  detalle_parte_frontal: '',
  detalle_parte_trasera: '',
  detalle_lateral_derecho: '',
  detalle_lateral_izquierdo: '',
  detalle_capot_techo: '',
  detalle_interior: '',
  detalle_otros: '',
  informe_dominio: '',
  informe_multas: '',
  gravamenes: '',
  costo_multas: null,
  costo_patente: null,
  costo_mantenimiento_reparacion: null,
  otros_costos: null,
}

function getNombreTitular(t: Titular): string {
  if (t.tipo === 'persona') return `${t.nombres || ''} ${t.apellidos || ''}`.trim()
  return t.razon_social || ''
}

export function OfertaLocacionModal({ vehiculoTitular, titular, sedeId, userId, userName, onClose }: Props) {
  const { grupos: gruposFlota } = useGruposFlota()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [existingRecord, setExistingRecord] = useState<OfertaLocacion | null>(null)
  const [formData, setFormData] = useState<OfertaLocacionFormData>({ ...EMPTY_FORM })
  const [activeTab, setActiveTab] = useState<'titular' | 'vehiculo' | 'contrato' | 'estado' | 'danios' | 'costos'>('titular')

  const vt = vehiculoTitular

  // Cargar datos del vehículo completo y verificar si existe registro
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      // 1. Verificar si ya existe un registro
      const { data: existente } = await supabase
        .from('ofertas_locacion')
        .select('*')
        .eq('vehiculo_titular_id', vt.id)
        .maybeSingle()

      if (existente) {
        setExistingRecord(existente as OfertaLocacion)
        // Cargar los datos del registro existente en el form
        const rec = existente as OfertaLocacion
        setFormData({
          titular_nombre: rec.titular_nombre || '',
          titular_dni_cuit: rec.titular_dni_cuit || '',
          titular_domicilio: rec.titular_domicilio || '',
          titular_email: rec.titular_email || '',
          titular_cuit: rec.titular_cuit || '',
          titular_conyugue: rec.titular_conyugue || '',
          patente: rec.patente || '',
          marca: rec.marca || '',
          modelo: rec.modelo || '',
          anio: rec.anio || '',
          color: rec.color || '',
          numero_motor: rec.numero_motor || '',
          numero_chasis: rec.numero_chasis || '',
          kilometraje: rec.kilometraje,
          fecha_ingreso: rec.fecha_ingreso || '',
          fecha_inicio_alquiler: rec.fecha_inicio_alquiler || '',
          canon_mensual: rec.canon_mensual,
          socio: rec.socio || '',
          nivel_nafta: rec.nivel_nafta || '',
          titulo_automotor: rec.titulo_automotor || '',
          tipo_cedula: rec.tipo_cedula || '',
          cantidad_llaves: rec.cantidad_llaves,
          vencimiento_seguro: rec.vencimiento_seguro || '',
          vto_vtv: rec.vto_vtv || '',
          vto_gnc: rec.vto_gnc || '',
          vto_matafuego: rec.vto_matafuego || '',
          criquet: rec.criquet === true ? 'Entregado' : rec.criquet === false ? 'Pendiente' : (rec.criquet || ''),
          mariposa: rec.mariposa === true ? 'Entregado' : rec.mariposa === false ? 'Pendiente' : (rec.mariposa || ''),
          llave_tuercas: rec.llave_tuercas === true ? 'Entregado' : rec.llave_tuercas === false ? 'Pendiente' : (rec.llave_tuercas || ''),
          rueda_auxilio: rec.rueda_auxilio === true ? 'Entregado' : rec.rueda_auxilio === false ? 'Pendiente' : (rec.rueda_auxilio || ''),
          balizas: rec.balizas === true ? 'Entregado' : rec.balizas === false ? 'Pendiente' : (rec.balizas || ''),
          chaleco_reflectivo: rec.chaleco_reflectivo === true ? 'Entregado' : rec.chaleco_reflectivo === false ? 'Pendiente' : (rec.chaleco_reflectivo || ''),
          guantes: rec.guantes === true ? 'Entregado' : rec.guantes === false ? 'Pendiente' : (rec.guantes || ''),
          botiquin: rec.botiquin === true ? 'Entregado' : rec.botiquin === false ? 'Pendiente' : (rec.botiquin || ''),
          limpieza_interior: rec.limpieza_interior || '',
          limpieza_exterior: rec.limpieza_exterior || '',
          detalle_parte_frontal: rec.detalle_parte_frontal || '',
          detalle_parte_trasera: rec.detalle_parte_trasera || '',
          detalle_lateral_derecho: rec.detalle_lateral_derecho || '',
          detalle_lateral_izquierdo: rec.detalle_lateral_izquierdo || '',
          detalle_capot_techo: rec.detalle_capot_techo || '',
          detalle_interior: rec.detalle_interior || '',
          detalle_otros: rec.detalle_otros || '',
          informe_dominio: rec.informe_dominio || '',
          informe_multas: rec.informe_multas || '',
          gravamenes: rec.gravamenes || '',
          costo_multas: rec.costo_multas,
          costo_patente: rec.costo_patente,
          costo_mantenimiento_reparacion: rec.costo_mantenimiento_reparacion,
          otros_costos: rec.otros_costos,
        })
      } else {
        // 2. Traer datos completos del vehículo para pre-cargar
        const { data: vehiculo } = await supabase
          .from('vehiculos')
          .select('patente, marca, modelo, anio, color, numero_motor, numero_chasis, kilometraje_actual, cantidad_llaves, vencimiento_seguro, vto_vtv_aplica, vto_vtv_fecha, vto_gnc_aplica, vto_gnc_fecha, vto_matafuego_aplica, vto_matafuego_fecha, gnc')
          .eq('id', vt.vehiculo_id)
          .maybeSingle()

        setFormData({
          ...EMPTY_FORM,
          titular_nombre: getNombreTitular(titular),
          titular_dni_cuit: titular.dni_cuit || '',
          titular_domicilio: titular.domicilio || '',
          titular_email: titular.email || '',
          titular_cuit: titular.dni_cuit || '',
          titular_conyugue: titular.tipo === 'persona' ? (titular.nombre_conyugue || titular.conyugue || '') : '',
          patente: vehiculo?.patente || vt.vehiculos?.patente || '',
          marca: vehiculo?.marca || vt.vehiculos?.marca || '',
          modelo: vehiculo?.modelo || vt.vehiculos?.modelo || '',
          anio: vehiculo?.anio || '',
          color: vehiculo?.color || '',
          numero_motor: vehiculo?.numero_motor || '',
          numero_chasis: vehiculo?.numero_chasis || '',
          kilometraje: vehiculo?.kilometraje_actual ?? null,
          cantidad_llaves: vehiculo?.cantidad_llaves ?? null,
          vencimiento_seguro: vehiculo?.vencimiento_seguro || '',
          vto_vtv: vehiculo?.vto_vtv_fecha || '',
          vto_gnc: vehiculo?.vto_gnc_aplica ? (vehiculo?.vto_gnc_fecha || '') : '',
          vto_matafuego: vehiculo?.vto_matafuego_aplica ? (vehiculo?.vto_matafuego_fecha || '') : '',
        })
      }
    } catch (err) {
      console.error('Error cargando oferta locacion:', err)
    } finally {
      setLoading(false)
    }
  }, [vt, titular])

  useEffect(() => { loadData() }, [loadData])

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = {
        vehiculo_titular_id: vt.id,
        vehiculo_id: vt.vehiculo_id,
        titular_id: vt.titular_id,
        titular_nombre: formData.titular_nombre || null,
        titular_dni_cuit: formData.titular_dni_cuit || null,
        titular_domicilio: formData.titular_domicilio || null,
        titular_email: formData.titular_email || null,
        titular_cuit: formData.titular_cuit || null,
        titular_conyugue: formData.titular_conyugue || null,
        patente: formData.patente || null,
        marca: formData.marca || null,
        modelo: formData.modelo || null,
        anio: formData.anio || null,
        color: formData.color || null,
        numero_motor: formData.numero_motor || null,
        numero_chasis: formData.numero_chasis || null,
        kilometraje: formData.kilometraje,
        fecha_ingreso: formData.fecha_ingreso || null,
        fecha_inicio_alquiler: formData.fecha_inicio_alquiler || null,
        canon_mensual: formData.canon_mensual,
        socio: formData.socio || null,
        nivel_nafta: formData.nivel_nafta || null,
        titulo_automotor: formData.titulo_automotor || null,
        tipo_cedula: formData.tipo_cedula || null,
        cantidad_llaves: formData.cantidad_llaves,
        vencimiento_seguro: formData.vencimiento_seguro || null,
        vto_vtv: formData.vto_vtv || null,
        vto_gnc: formData.vto_gnc || null,
        vto_matafuego: formData.vto_matafuego || null,
        criquet: formData.criquet,
        mariposa: formData.mariposa,
        llave_tuercas: formData.llave_tuercas,
        rueda_auxilio: formData.rueda_auxilio,
        balizas: formData.balizas,
        chaleco_reflectivo: formData.chaleco_reflectivo,
        guantes: formData.guantes,
        botiquin: formData.botiquin,
        limpieza_interior: formData.limpieza_interior || null,
        limpieza_exterior: formData.limpieza_exterior || null,
        detalle_parte_frontal: formData.detalle_parte_frontal || null,
        detalle_parte_trasera: formData.detalle_parte_trasera || null,
        detalle_lateral_derecho: formData.detalle_lateral_derecho || null,
        detalle_lateral_izquierdo: formData.detalle_lateral_izquierdo || null,
        detalle_capot_techo: formData.detalle_capot_techo || null,
        detalle_interior: formData.detalle_interior || null,
        detalle_otros: formData.detalle_otros || null,
        informe_dominio: formData.informe_dominio || null,
        informe_multas: formData.informe_multas || null,
        gravamenes: formData.gravamenes || null,
        costo_multas: formData.costo_multas,
        costo_patente: formData.costo_patente,
        costo_mantenimiento_reparacion: formData.costo_mantenimiento_reparacion,
        otros_costos: formData.otros_costos,
        sede_id: sedeId,
        updated_at: new Date().toISOString(),
      }

      if (existingRecord) {
        // Update
        const { error } = await supabase
          .from('ofertas_locacion')
          .update(payload)
          .eq('id', existingRecord.id)
        if (error) throw error
        showSuccess('Oferta de locacion actualizada')
      } else {
        // Insert
        const { error } = await supabase
          .from('ofertas_locacion')
          .insert({
            ...payload,
            estado: 'borrador',
            created_by: userId,
            created_by_name: userName,
          })
        if (error) {
          if (error.code === '23505') {
            Swal.fire('Ya existe', 'Ya existe un registro de oferta de locacion para este vehiculo y titular.', 'warning')
            return
          }
          throw error
        }
        showSuccess('Oferta de locacion creada')
      }
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido'
      Swal.fire('Error', msg, 'error')
    } finally {
      setSaving(false)
    }
  }

  const updateField = (field: keyof OfertaLocacionFormData, value: unknown) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '9px 12px',
    border: '1px solid var(--border-primary)',
    borderRadius: '6px',
    fontSize: '13px',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
  }
  const readonlyStyle: React.CSSProperties = {
    ...inputStyle,
    background: 'var(--bg-secondary)',
    color: 'var(--text-secondary)',
    cursor: 'default',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--text-tertiary)',
    marginBottom: '5px',
    textTransform: 'uppercase',
  }

  const fieldGroup: React.CSSProperties = {
    marginBottom: '16px',
  }

  // Grid classes defined in VehicleManagement.css (.ol-grid-2, .ol-grid-3)
  // with responsive breakpoints for mobile

  // checkboxRow removido - elementos de seguridad ahora usan selects

  const sectionTitle: React.CSSProperties = {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    marginBottom: '14px',
    paddingBottom: '8px',
    borderBottom: '1px solid var(--border-primary)',
  }

  const tabs = [
    { key: 'titular' as const, label: 'Titular' },
    { key: 'vehiculo' as const, label: 'Vehiculo' },
    { key: 'contrato' as const, label: 'Contrato' },
    { key: 'estado' as const, label: 'Estado y Seguridad' },
    { key: 'danios' as const, label: 'Relevamiento' },
    { key: 'costos' as const, label: 'Costos' },
  ]

  if (loading) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '750px' }}>
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
            Cargando...
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '750px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header" style={{ flexShrink: 0 }}>
          <div>
            <h3 style={{ margin: 0 }}>
              {existingRecord ? 'Editar' : 'Nueva'} Oferta de Locacion
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-tertiary)' }}>
              {formData.patente} - {formData.titular_nombre}
            </p>
          </div>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          gap: '0',
          borderBottom: '1px solid var(--border-primary)',
          padding: '0 16px',
          flexShrink: 0,
          overflowX: 'auto',
        }}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '10px 14px',
                fontSize: '12px',
                fontWeight: activeTab === tab.key ? 600 : 400,
                color: activeTab === tab.key ? 'var(--color-primary)' : 'var(--text-tertiary)',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab.key ? '2px solid var(--color-primary)' : '2px solid transparent',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                transition: 'all 0.15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="modal-body" style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
          {/* Tab: Titular */}
          {activeTab === 'titular' && (
            <div>
              <div className="ol-grid-2">
                <div style={fieldGroup}>
                  <label style={labelStyle}>Nombre / Razon Social</label>
                  <input style={readonlyStyle} value={formData.titular_nombre} readOnly />
                </div>
                <div style={fieldGroup}>
                  <label style={labelStyle}>DNI</label>
                  <input style={readonlyStyle} value={formData.titular_dni_cuit} readOnly />
                </div>
              </div>
              <div className="ol-grid-2">
                <div style={fieldGroup}>
                  <label style={labelStyle}>CUIT</label>
                  <input style={readonlyStyle} value={formData.titular_cuit} readOnly />
                </div>
                <div style={fieldGroup}>
                  <label style={labelStyle}>Email</label>
                  <input style={readonlyStyle} value={formData.titular_email} readOnly />
                </div>
              </div>
              <div style={fieldGroup}>
                <label style={labelStyle}>Domicilio</label>
                <input style={readonlyStyle} value={formData.titular_domicilio} readOnly />
              </div>
              <div style={fieldGroup}>
                <label style={labelStyle}>Conyugue</label>
                <input style={readonlyStyle} value={formData.titular_conyugue} readOnly />
              </div>
            </div>
          )}

          {/* Tab: Vehiculo */}
          {activeTab === 'vehiculo' && (
            <div>
              <div className="ol-grid-3">
                <div style={fieldGroup}>
                  <label style={labelStyle}>Patente</label>
                  <input style={{ ...readonlyStyle, fontWeight: 600 }} value={formData.patente} readOnly />
                </div>
                <div style={fieldGroup}>
                  <label style={labelStyle}>Marca</label>
                  <input style={readonlyStyle} value={formData.marca} readOnly />
                </div>
                <div style={fieldGroup}>
                  <label style={labelStyle}>Modelo</label>
                  <input style={readonlyStyle} value={formData.modelo} readOnly />
                </div>
              </div>
              <div className="ol-grid-3">
                <div style={fieldGroup}>
                  <label style={labelStyle}>Anio</label>
                  <input style={readonlyStyle} value={formData.anio} readOnly />
                </div>
                <div style={fieldGroup}>
                  <label style={labelStyle}>Color</label>
                  <input style={readonlyStyle} value={formData.color} readOnly />
                </div>
                <div style={fieldGroup}>
                  <label style={labelStyle}>Kilometraje</label>
                  <input style={readonlyStyle} value={formData.kilometraje ?? ''} readOnly />
                </div>
              </div>
              <div className="ol-grid-2">
                <div style={fieldGroup}>
                  <label style={labelStyle}>Numero Motor</label>
                  <input style={readonlyStyle} value={formData.numero_motor} readOnly />
                </div>
                <div style={fieldGroup}>
                  <label style={labelStyle}>Numero Chasis</label>
                  <input style={readonlyStyle} value={formData.numero_chasis} readOnly />
                </div>
              </div>
            </div>
          )}

          {/* Tab: Contrato */}
          {activeTab === 'contrato' && (
            <div>
              <div className="ol-grid-2">
                <div style={fieldGroup}>
                  <label style={labelStyle}>Fecha Ingreso</label>
                  <input style={inputStyle} type="date" value={formData.fecha_ingreso} onChange={e => updateField('fecha_ingreso', e.target.value)} />
                </div>
                <div style={fieldGroup}>
                  <label style={labelStyle}>Fecha Inicio Alquiler</label>
                  <input style={inputStyle} type="date" value={formData.fecha_inicio_alquiler} onChange={e => updateField('fecha_inicio_alquiler', e.target.value)} />
                </div>
              </div>
              <div className="ol-grid-2">
                <div style={fieldGroup}>
                  <label style={labelStyle}>Canon Mensual ($)</label>
                  <input style={inputStyle} type="number" step="0.01" value={formData.canon_mensual ?? ''} onChange={e => updateField('canon_mensual', e.target.value ? Number(e.target.value) : null)} />
                </div>
                <div style={fieldGroup}>
                  <label style={labelStyle}>Socio</label>
                  <select style={inputStyle} value={formData.socio} onChange={e => updateField('socio', e.target.value)}>
                    <option value="">Seleccionar...</option>
                    {gruposFlota.map(g => (
                      <option key={g.codigo} value={g.valor_socio || g.codigo}>{g.nombre_comercial}</option>
                    ))}
                    {gruposFlota.length === 0 && (
                      <>
                        <option value="grupocg">Grupo CG</option>
                        <option value="44dreams">44 Dreams</option>
                      </>
                    )}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Tab: Estado y Seguridad */}
          {activeTab === 'estado' && (
            <div>
              <div style={sectionTitle}>Estado del Vehiculo</div>
              <div className="ol-grid-3">
                <div style={fieldGroup}>
                  <label style={labelStyle}>Nivel Nafta</label>
                  <select style={inputStyle} value={formData.nivel_nafta} onChange={e => updateField('nivel_nafta', e.target.value)}>
                    <option value="">Seleccionar...</option>
                    <option value="Vacio">Vacio</option>
                    <option value="1/4">1/4</option>
                    <option value="1/2">1/2</option>
                    <option value="3/4">3/4</option>
                    <option value="Lleno">Lleno</option>
                  </select>
                </div>
                <div style={fieldGroup}>
                  <label style={labelStyle}>Titulo Automotor</label>
                  <select style={inputStyle} value={formData.titulo_automotor} onChange={e => updateField('titulo_automotor', e.target.value)}>
                    <option value="">Seleccionar...</option>
                    <option value="Entregado">Entregado</option>
                    <option value="Pendiente">Pendiente</option>
                  </select>
                </div>
                <div style={fieldGroup}>
                  <label style={labelStyle}>Tipo Cedula</label>
                  <select style={inputStyle} value={formData.tipo_cedula} onChange={e => updateField('tipo_cedula', e.target.value)}>
                    <option value="">Seleccionar...</option>
                    <option value="Original">Original</option>
                    <option value="Constancia Vigente">Constancia Vigente</option>
                    <option value="Constancia Vencida">Constancia Vencida</option>
                  </select>
                </div>
              </div>
              <div style={fieldGroup}>
                <label style={labelStyle}>Cantidad de Llaves</label>
                <input style={{ ...readonlyStyle, maxWidth: '120px' }} value={formData.cantidad_llaves ?? ''} readOnly />
              </div>

              <div style={{ ...sectionTitle, marginTop: '24px' }}>Vencimientos</div>
              <div className="ol-grid-2">
                <div style={fieldGroup}>
                  <label style={labelStyle}>Vencimiento Seguro</label>
                  <input style={readonlyStyle} value={formData.vencimiento_seguro || 'No definido'} readOnly />
                </div>
                <div style={fieldGroup}>
                  <label style={labelStyle}>Vto. VTV</label>
                  <input style={readonlyStyle} value={formData.vto_vtv || 'No definido'} readOnly />
                </div>
              </div>
              <div className="ol-grid-2">
                <div style={fieldGroup}>
                  <label style={labelStyle}>Vto. GNC</label>
                  <input style={readonlyStyle} value={formData.vto_gnc || 'No definido'} readOnly />
                </div>
                <div style={fieldGroup}>
                  <label style={labelStyle}>Vto. Matafuego</label>
                  <input style={readonlyStyle} value={formData.vto_matafuego || 'No definido'} readOnly />
                </div>
              </div>

              <div style={{ ...sectionTitle, marginTop: '24px' }}>Elementos de Seguridad</div>
              <div className="ol-grid-2">
                {([
                  ['criquet', 'Criquet'],
                  ['mariposa', 'Mariposa'],
                  ['llave_tuercas', 'Llave para Tuercas'],
                  ['rueda_auxilio', 'Rueda de Auxilio'],
                  ['balizas', 'Balizas'],
                  ['chaleco_reflectivo', 'Chaleco Reflectivo'],
                  ['guantes', 'Guantes'],
                  ['botiquin', 'Botiquin'],
                ] as [keyof OfertaLocacionFormData, string][]).map(([field, label]) => (
                  <div key={field} style={fieldGroup}>
                    <label style={labelStyle}>{label}</label>
                    <select style={inputStyle} value={formData[field] as string} onChange={e => updateField(field, e.target.value)}>
                      <option value="">Seleccionar...</option>
                      <option value="Entregado">Entregado</option>
                      <option value="Pendiente">Pendiente</option>
                    </select>
                  </div>
                ))}
              </div>

              <div style={{ ...sectionTitle, marginTop: '24px' }}>Limpieza</div>
              <div className="ol-grid-2">
                <div style={fieldGroup}>
                  <label style={labelStyle}>Interior</label>
                  <select style={inputStyle} value={formData.limpieza_interior} onChange={e => updateField('limpieza_interior', e.target.value)}>
                    <option value="">Seleccionar...</option>
                    <option value="Limpio">Limpio</option>
                    <option value="Sucio">Sucio</option>
                    <option value="Muy sucio">Muy sucio</option>
                  </select>
                </div>
                <div style={fieldGroup}>
                  <label style={labelStyle}>Exterior</label>
                  <select style={inputStyle} value={formData.limpieza_exterior} onChange={e => updateField('limpieza_exterior', e.target.value)}>
                    <option value="">Seleccionar...</option>
                    <option value="Limpio">Limpio</option>
                    <option value="Sucio">Sucio</option>
                    <option value="Muy sucio">Muy sucio</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Tab: Relevamiento de danios */}
          {activeTab === 'danios' && (
            <div>
              <div style={sectionTitle}>Relevamiento de Danios</div>
              {([
                ['detalle_parte_frontal', 'Parte Frontal (paragolpe delantero)'],
                ['detalle_parte_trasera', 'Parte Trasera (paragolpe trasero)'],
                ['detalle_lateral_derecho', 'Lateral Derecho'],
                ['detalle_lateral_izquierdo', 'Lateral Izquierdo'],
                ['detalle_capot_techo', 'Capot / Techo'],
                ['detalle_interior', 'Interior'],
                ['detalle_otros', 'Otros'],
              ] as [keyof OfertaLocacionFormData, string][]).map(([field, label]) => (
                <div key={field} style={fieldGroup}>
                  <label style={labelStyle}>{label}</label>
                  <textarea
                    style={{ ...inputStyle, minHeight: '50px', resize: 'vertical' }}
                    value={formData[field] as string}
                    onChange={e => updateField(field, e.target.value)}
                    placeholder="Describir danios si los hubiera..."
                  />
                </div>
              ))}
            </div>
          )}

          {/* Tab: Costos */}
          {activeTab === 'costos' && (
            <div>
              <div style={sectionTitle}>Informes</div>
              <div className="ol-grid-2">
                <div style={fieldGroup}>
                  <label style={labelStyle}>Informe de Dominio</label>
                  <select style={inputStyle} value={formData.informe_dominio} onChange={e => updateField('informe_dominio', e.target.value)}>
                    <option value="">Seleccionar...</option>
                    <option value="Entregado">Entregado</option>
                    <option value="Pendiente">Pendiente</option>
                  </select>
                </div>
                <div style={fieldGroup}>
                  <label style={labelStyle}>Informe de Multas</label>
                  <select style={inputStyle} value={formData.informe_multas} onChange={e => updateField('informe_multas', e.target.value)}>
                    <option value="">Seleccionar...</option>
                    <option value="Entregado">Entregado</option>
                    <option value="Pendiente">Pendiente</option>
                  </select>
                </div>
              </div>
              <div style={fieldGroup}>
                <label style={labelStyle}>Gravamenes</label>
                <textarea style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }} value={formData.gravamenes} onChange={e => updateField('gravamenes', e.target.value)} />
              </div>

              <div style={{ ...sectionTitle, marginTop: '24px' }}>Costos</div>
              <div className="ol-grid-2">
                <div style={fieldGroup}>
                  <label style={labelStyle}>Costo Multas ($)</label>
                  <input style={inputStyle} type="number" step="0.01" value={formData.costo_multas ?? ''} onChange={e => updateField('costo_multas', e.target.value ? Number(e.target.value) : null)} />
                </div>
                <div style={fieldGroup}>
                  <label style={labelStyle}>Costo Patente ($)</label>
                  <input style={inputStyle} type="number" step="0.01" value={formData.costo_patente ?? ''} onChange={e => updateField('costo_patente', e.target.value ? Number(e.target.value) : null)} />
                </div>
              </div>
              <div className="ol-grid-2">
                <div style={fieldGroup}>
                  <label style={labelStyle}>Costo Mantenimiento / Reparacion ($)</label>
                  <input style={inputStyle} type="number" step="0.01" value={formData.costo_mantenimiento_reparacion ?? ''} onChange={e => updateField('costo_mantenimiento_reparacion', e.target.value ? Number(e.target.value) : null)} />
                </div>
                <div style={fieldGroup}>
                  <label style={labelStyle}>Otros Costos ($)</label>
                  <input style={inputStyle} type="number" step="0.01" value={formData.otros_costos ?? ''} onChange={e => updateField('otros_costos', e.target.value ? Number(e.target.value) : null)} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer ol-modal-footer" style={{ flexShrink: 0 }}>
          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
            {existingRecord ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <AlertTriangle size={12} />
                Registro existente, editando
              </span>
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Check size={12} />
                Nuevo registro
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Save size={14} />
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
