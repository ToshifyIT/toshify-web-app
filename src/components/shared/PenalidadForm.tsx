// src/components/shared/PenalidadForm.tsx
// Componente compartido para formulario de penalidades
// Usado en: IncidenciasModule y SiniestroSeguimiento

import { useState, useEffect } from 'react'
import { X, Link, Search } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type {
  PenalidadFormData,
  TipoPenalidad,
  VehiculoSimple,
  ConductorSimple
} from '../../types/incidencias.types'

interface ConductorAsignado {
  id: string
  nombre_completo: string
  horario: string
  turno: string
}

// Tipo para incidencias de cobro disponibles
interface IncidenciaCobro {
  id: string
  fecha: string
  descripcion: string
  conductor_id: string | null
  vehiculo_id: string | null
  conductor_display: string
  patente_display: string
  monto_penalidades: number
}

export interface PenalidadFormProps {
  formData: PenalidadFormData
  setFormData: React.Dispatch<React.SetStateAction<PenalidadFormData>>
  tiposPenalidad: TipoPenalidad[]
  vehiculos: VehiculoSimple[]
  conductores: ConductorSimple[]
  disabled?: boolean
}

export function PenalidadForm({ formData, setFormData, tiposPenalidad, vehiculos, conductores, disabled }: PenalidadFormProps) {
  const [conductorSearch, setConductorSearch] = useState('')
  const [showConductorDropdown, setShowConductorDropdown] = useState(false)
  const [vehiculoSearch, setVehiculoSearch] = useState('')
  const [showVehiculoDropdown, setShowVehiculoDropdown] = useState(false)

  // Estado para modal de seleccion de conductor
  const [showConductorSelectModal, setShowConductorSelectModal] = useState(false)
  const [conductoresAsignados, setConductoresAsignados] = useState<ConductorAsignado[]>([])
  const [loadingConductores, setLoadingConductores] = useState(false)

  // Estado para enlazar con incidencia de cobro
  const [enlazarIncidencia, setEnlazarIncidencia] = useState(false)
  const [incidenciasCobro, setIncidenciasCobro] = useState<IncidenciaCobro[]>([])
  const [incidenciaSearch, setIncidenciaSearch] = useState('')
  const [showIncidenciaDropdown, setShowIncidenciaDropdown] = useState(false)
  const [loadingIncidencias, setLoadingIncidencias] = useState(false)
  const [selectedIncidencia, setSelectedIncidencia] = useState<IncidenciaCobro | null>(null)

  // Cargar incidencias de cobro cuando se activa el enlace
  useEffect(() => {
    if (enlazarIncidencia && incidenciasCobro.length === 0) {
      cargarIncidenciasCobro()
    }
  }, [enlazarIncidencia])

  async function cargarIncidenciasCobro() {
    setLoadingIncidencias(true)
    try {
      // Obtener incidencias de tipo 'cobro' con sus datos
      const { data, error } = await (supabase
        .from('v_incidencias_completas') as any)
        .select('*')
        .order('fecha', { ascending: false })
        .limit(100)

      if (error) throw error

      // Filtrar por tipo cobro (obtenemos el tipo de la tabla incidencias)
      const { data: tiposData } = await (supabase
        .from('incidencias') as any)
        .select('id, tipo')

      const tipoMap = new Map((tiposData || []).map((i: any) => [i.id, i.tipo]))
      
      const incidenciasFiltradas = (data || [])
        .filter((inc: any) => tipoMap.get(inc.id) === 'cobro')
        .map((inc: any) => ({
          id: inc.id,
          fecha: inc.fecha,
          descripcion: inc.descripcion || '',
          conductor_id: inc.conductor_id,
          vehiculo_id: inc.vehiculo_id,
          conductor_display: inc.conductor_display || 'Sin conductor',
          patente_display: inc.patente_display || 'Sin patente',
          monto_penalidades: inc.monto_penalidades || 0
        }))

      setIncidenciasCobro(incidenciasFiltradas)
    } catch (error) {
      console.error('Error cargando incidencias de cobro:', error)
    } finally {
      setLoadingIncidencias(false)
    }
  }

  function handleSelectIncidencia(incidencia: IncidenciaCobro) {
    setSelectedIncidencia(incidencia)
    setIncidenciaSearch('')
    setShowIncidenciaDropdown(false)
    
    // Auto-completar datos del formulario
    setFormData(prev => ({
      ...prev,
      incidencia_id: incidencia.id,
      conductor_id: incidencia.conductor_id || undefined,
      vehiculo_id: incidencia.vehiculo_id || undefined,
      observaciones: incidencia.descripcion || prev.observaciones,
      monto: incidencia.monto_penalidades || prev.monto
    }))
  }

  function handleClearIncidencia() {
    setSelectedIncidencia(null)
    setFormData(prev => ({
      ...prev,
      incidencia_id: undefined
    }))
  }

  const filteredIncidencias = incidenciasCobro.filter(inc => {
    const term = incidenciaSearch.toLowerCase()
    return (
      inc.descripcion.toLowerCase().includes(term) ||
      inc.conductor_display.toLowerCase().includes(term) ||
      inc.patente_display.toLowerCase().includes(term)
    )
  }).slice(0, 10)

  const selectedConductor = conductores.find(c => c.id === formData.conductor_id)
  const selectedVehiculo = vehiculos.find(v => v.id === formData.vehiculo_id)

  // Buscar conductores asignados al vehiculo seleccionado
  async function buscarConductoresAsignados(vehiculoId: string) {
    setLoadingConductores(true)
    try {
      const { data, error } = await supabase
        .from('asignaciones')
        .select(`
          id,
          horario,
          asignaciones_conductores (
            horario,
            conductores (
              id,
              nombres,
              apellidos
            )
          )
        `)
        .eq('vehiculo_id', vehiculoId)
        .eq('estado', 'activa')

      if (error) throw error

      const conductoresData: ConductorAsignado[] = []
      for (const asig of (data || [])) {
        const asigConductores = (asig as any).asignaciones_conductores || []
        for (const ac of asigConductores) {
          if (ac.conductores) {
            let turnoDisplay = 'A cargo'
            if (ac.horario === 'diurno') turnoDisplay = 'Diurno'
            else if (ac.horario === 'nocturno') turnoDisplay = 'Nocturno'

            conductoresData.push({
              id: ac.conductores.id,
              nombre_completo: `${ac.conductores.nombres} ${ac.conductores.apellidos}`,
              horario: (asig as any).horario === 'TURNO' ? 'Turno' : 'A Cargo',
              turno: turnoDisplay
            })
          }
        }
      }

      if (conductoresData.length === 1) {
        setFormData(prev => ({
          ...prev,
          conductor_id: conductoresData[0].id,
          turno: conductoresData[0].turno
        }))
        setConductorSearch('')
      } else if (conductoresData.length > 1) {
        setConductoresAsignados(conductoresData)
        setShowConductorSelectModal(true)
      }
    } catch (error) {
      console.error('Error buscando conductores asignados:', error)
    } finally {
      setLoadingConductores(false)
    }
  }

  function handleSelectVehiculoPenalidad(vehiculo: VehiculoSimple) {
    setFormData(prev => ({ ...prev, vehiculo_id: vehiculo.id, vehiculo_patente: undefined }))
    setVehiculoSearch('')
    setShowVehiculoDropdown(false)
    buscarConductoresAsignados(vehiculo.id)
  }

  function handleSelectConductorFromModal(conductor: ConductorAsignado) {
    setFormData(prev => ({
      ...prev,
      conductor_id: conductor.id,
      turno: conductor.turno
    }))
    setConductorSearch('')
    setShowConductorSelectModal(false)
    setConductoresAsignados([])
  }

  const getWeekNumber = (dateStr: string): number => {
    if (!dateStr) return 0
    const [year, month, day] = dateStr.split('-').map(Number)
    const date = new Date(year, month - 1, day, 12, 0, 0)

    const thursday = new Date(date)
    thursday.setDate(date.getDate() - ((date.getDay() + 6) % 7) + 3)

    const firstThursday = new Date(thursday.getFullYear(), 0, 4)
    firstThursday.setDate(firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7) + 3)

    const weekNumber = Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1
    return weekNumber
  }

  const semanaCalculada = getWeekNumber(formData.fecha)

  const filteredConductores = conductores.filter(c => {
    return c.nombre_completo.toLowerCase().includes(conductorSearch.toLowerCase())
  }).slice(0, 10)

  const filteredVehiculos = vehiculos.filter(v => {
    const term = vehiculoSearch.toLowerCase()
    return v.patente.toLowerCase().includes(term) || v.marca.toLowerCase().includes(term)
  }).slice(0, 10)

  const tiposCobrosDescuentos = [
    'Entrega tardia del vehiculo',
    'Llegada tarde o inasistencia injustificada a revision tecnica',
    'Ingreso a zonas restringidas',
    'Falta de lavado',
    'Falta de restitucion de la unidad',
    'Perdida o dano de elementos de seguridad',
    'Falta restitucion de GNC',
    'Falta restitucion de Nafta',
    'Mora en canon',
    'Exceso de kilometraje',
    'Manipulacion no autorizada de GPS',
    'Abandono del vehiculo',
    'No disponer de lugar seguro para la guarda del vehiculo',
    'I button',
    'Multa de transito',
    'Reparacion Siniestro'
  ]

  return (
    <>
      {/* Sección para enlazar con incidencia de cobro */}
      <div className="form-section">
        <div className="form-section-title">
          <Link size={16} style={{ marginRight: '8px' }} />
          Enlazar con Incidencia
        </div>
        <div className="form-row">
          <div className="form-group">
            <div className="checkbox-group" style={{ marginBottom: '12px' }}>
              <input
                type="checkbox"
                id="enlazarIncidencia"
                checked={enlazarIncidencia}
                onChange={e => {
                  setEnlazarIncidencia(e.target.checked)
                  if (!e.target.checked) {
                    handleClearIncidencia()
                  }
                }}
                disabled={disabled}
              />
              <span>Enlazar con una Incidencia de Cobro existente</span>
            </div>
          </div>
        </div>

        {enlazarIncidencia && (
          <div className="form-row">
            <div className="form-group full-width">
              <label>Buscar Incidencia de Cobro</label>
              <div className="searchable-select">
                <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#666' }} />
                <input
                  type="text"
                  autoComplete="off"
                  style={{ paddingLeft: '36px' }}
                  value={selectedIncidencia 
                    ? `${selectedIncidencia.patente_display} - ${selectedIncidencia.conductor_display} - ${selectedIncidencia.descripcion.substring(0, 50)}...`
                    : incidenciaSearch
                  }
                  onChange={e => {
                    setIncidenciaSearch(e.target.value)
                    setShowIncidenciaDropdown(true)
                    if (selectedIncidencia) {
                      handleClearIncidencia()
                    }
                  }}
                  onFocus={() => setShowIncidenciaDropdown(true)}
                  onBlur={() => setTimeout(() => setShowIncidenciaDropdown(false), 200)}
                  placeholder="Buscar por patente, conductor o descripción..."
                  disabled={disabled || loadingIncidencias}
                />
                {loadingIncidencias && (
                  <div className="searchable-loading">Cargando incidencias...</div>
                )}
                {showIncidenciaDropdown && !loadingIncidencias && filteredIncidencias.length > 0 && (
                  <div className="searchable-dropdown" style={{ maxHeight: '300px' }}>
                    {filteredIncidencias.map(inc => (
                      <div 
                        key={inc.id} 
                        className="searchable-option" 
                        onClick={() => handleSelectIncidencia(inc)}
                        style={{ padding: '10px 12px', borderBottom: '1px solid #eee' }}
                      >
                        <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                          {inc.patente_display} - {inc.conductor_display}
                        </div>
                        <div style={{ fontSize: '12px', color: '#666' }}>
                          {new Date(inc.fecha).toLocaleDateString('es-AR')} - {inc.descripcion.substring(0, 60)}...
                        </div>
                        {inc.monto_penalidades > 0 && (
                          <div style={{ fontSize: '12px', color: '#F59E0B', fontWeight: 600, marginTop: '4px' }}>
                            Monto: ${inc.monto_penalidades.toLocaleString('es-AR')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {showIncidenciaDropdown && !loadingIncidencias && incidenciaSearch && filteredIncidencias.length === 0 && (
                  <div className="searchable-dropdown">
                    <div className="searchable-option" style={{ color: '#666', fontStyle: 'italic' }}>
                      No se encontraron incidencias de cobro
                    </div>
                  </div>
                )}
                {selectedIncidencia && (
                  <button type="button" className="clear-selection" onClick={handleClearIncidencia}>
                    <X size={14} />
                  </button>
                )}
              </div>
              {selectedIncidencia && (
                <div style={{ 
                  marginTop: '8px', 
                  padding: '10px', 
                  backgroundColor: '#f0fdf4', 
                  borderRadius: '6px',
                  border: '1px solid #86efac'
                }}>
                  <div style={{ fontSize: '12px', color: '#166534', fontWeight: 600 }}>
                    ✓ Incidencia enlazada - Los datos se han completado automáticamente
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="form-section">
        <div className="form-section-title">Datos del Cobro/Descuento</div>
        <div className="form-row">
          <div className="form-group">
            <label>Patente</label>
            <div className="searchable-select">
              <input
                type="text"
                autoComplete="off"
                value={selectedVehiculo ? `${selectedVehiculo.patente} - ${selectedVehiculo.marca} ${selectedVehiculo.modelo}` : vehiculoSearch}
                onChange={e => {
                  setVehiculoSearch(e.target.value)
                  setShowVehiculoDropdown(true)
                  if (formData.vehiculo_id) setFormData(prev => ({ ...prev, vehiculo_id: undefined }))
                }}
                onFocus={() => setShowVehiculoDropdown(true)}
                onBlur={() => setTimeout(() => setShowVehiculoDropdown(false), 200)}
                placeholder="Buscar patente..."
                disabled={disabled}
              />
              {showVehiculoDropdown && vehiculoSearch && filteredVehiculos.length > 0 && (
                <div className="searchable-dropdown">
                  {filteredVehiculos.map(v => (
                    <div key={v.id} className="searchable-option" onClick={() => handleSelectVehiculoPenalidad(v)}>
                      <strong>{v.patente}</strong> - {v.marca} {v.modelo}
                    </div>
                  ))}
                </div>
              )}
              {loadingConductores && (
                <div className="searchable-loading">Buscando conductores...</div>
              )}
              {selectedVehiculo && (
                <button type="button" className="clear-selection" onClick={() => {
                  setFormData(prev => ({ ...prev, vehiculo_id: undefined, conductor_id: undefined }))
                  setVehiculoSearch('')
                }}>
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
          <div className="form-group">
            <label>Conductor <span className="required">*</span></label>
            <div className="searchable-select">
              <input
                type="text"
                autoComplete="off"
                value={selectedConductor ? selectedConductor.nombre_completo : conductorSearch}
                onChange={e => {
                  setConductorSearch(e.target.value)
                  setShowConductorDropdown(true)
                  if (formData.conductor_id) setFormData(prev => ({ ...prev, conductor_id: undefined }))
                }}
                onFocus={() => setShowConductorDropdown(true)}
                onBlur={() => setTimeout(() => setShowConductorDropdown(false), 200)}
                placeholder="Buscar conductor..."
                disabled={disabled}
              />
              {showConductorDropdown && conductorSearch && filteredConductores.length > 0 && (
                <div className="searchable-dropdown">
                  {filteredConductores.map(c => (
                    <div key={c.id} className="searchable-option" onClick={() => {
                      setFormData(prev => ({ ...prev, conductor_id: c.id }))
                      setConductorSearch('')
                      setShowConductorDropdown(false)
                    }}>
                      {c.nombre_completo}
                    </div>
                  ))}
                </div>
              )}
              {selectedConductor && (
                <button type="button" className="clear-selection" onClick={() => {
                  setFormData(prev => ({ ...prev, conductor_id: undefined }))
                  setConductorSearch('')
                }}>
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="form-row three-cols">
          <div className="form-group">
            <label>Fecha <span className="required">*</span></label>
            <input
              type="date"
              value={formData.fecha}
              onChange={e => setFormData(prev => ({ ...prev, fecha: e.target.value }))}
              disabled={disabled}
            />
          </div>
          <div className="form-group">
            <label>Semana</label>
            <input
              type="text"
              value={semanaCalculada || '-'}
              readOnly
              className="form-input-readonly"
            />
          </div>
          <div className="form-group">
            <label>Modalidad</label>
            <select value={formData.turno || ''} onChange={e => setFormData(prev => ({ ...prev, turno: e.target.value }))} disabled={disabled}>
              <option value="">Seleccionar</option>
              <option value="Diurno">Diurno</option>
              <option value="Nocturno">Nocturno</option>
              <option value="A cargo">A cargo</option>
            </select>
          </div>
        </div>
        <div className="form-row three-cols">
          <div className="form-group">
            <label>Tipo</label>
            <select value={formData.tipo_penalidad_id || ''} onChange={e => setFormData(prev => ({ ...prev, tipo_penalidad_id: e.target.value || undefined }))} disabled={disabled}>
              <option value="">Seleccionar</option>
              {tiposPenalidad.length > 0 ? (
                tiposPenalidad.map(t => (
                  <option key={t.id} value={t.id}>{t.nombre}</option>
                ))
              ) : (
                tiposCobrosDescuentos.map(tipo => (
                  <option key={tipo} value={tipo}>{tipo}</option>
                ))
              )}
            </select>
          </div>
          <div className="form-group">
            <label>Accion a realizar</label>
            <select value={formData.detalle || ''} onChange={e => setFormData(prev => ({ ...prev, detalle: e.target.value }))} disabled={disabled}>
              <option value="">Seleccionar</option>
              <option value="Descuento">Descuento</option>
              <option value="Cobro">Cobro</option>
              <option value="A favor">A favor</option>
            </select>
          </div>
          <div className="form-group">
            <label>Monto (ARS)</label>
            <input
              type="number"
              value={formData.monto || ''}
              onChange={e => setFormData(prev => ({ ...prev, monto: Number(e.target.value) || undefined }))}
              placeholder="0"
              disabled={disabled}
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Area Responsable</label>
            <select value={formData.area_responsable || ''} onChange={e => setFormData(prev => ({ ...prev, area_responsable: e.target.value }))} disabled={disabled}>
              <option value="">Seleccionar</option>
              <option value="LOGISTICA">Logistica</option>
              <option value="DATA ENTRY">Data Entry</option>
              <option value="ADMINISTRACION">Administracion</option>
              <option value="SINIESTROS">Siniestros</option>
            </select>
          </div>
          <div className="form-group">
            <label>Patente</label>
            <input
              type="text"
              value={selectedVehiculo ? selectedVehiculo.patente : (formData.vehiculo_patente || '-')}
              readOnly
              className="form-input-readonly"
            />
          </div>
        </div>
      </div>

      <div className="form-section">
        <div className="form-section-title">Observaciones</div>
        <div className="form-row">
          <div className="form-group full-width">
            <textarea
              value={formData.observaciones || ''}
              onChange={e => setFormData(prev => ({ ...prev, observaciones: e.target.value }))}
              placeholder="Notas adicionales..."
              disabled={disabled}
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <div className="checkbox-group">
              <input
                type="checkbox"
                id="aplicado"
                checked={formData.aplicado}
                onChange={e => setFormData(prev => ({ ...prev, aplicado: e.target.checked }))}
                disabled={disabled}
              />
              <span>Marcar como aplicado</span>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de seleccion de conductor */}
      {showConductorSelectModal && (
        <div className="conductor-select-modal-overlay" onClick={() => setShowConductorSelectModal(false)}>
          <div className="conductor-select-modal" onClick={e => e.stopPropagation()}>
            <div className="conductor-select-modal-header">
              <h4>Seleccionar Conductor</h4>
              <p>Este vehiculo tiene multiples conductores asignados</p>
            </div>
            <div className="conductor-select-modal-list">
              {conductoresAsignados.map(c => (
                <button
                  key={c.id}
                  type="button"
                  className="conductor-select-option"
                  onClick={() => handleSelectConductorFromModal(c)}
                >
                  <span className="conductor-select-name">{c.nombre_completo}</span>
                  <span className={`conductor-select-turno ${c.turno.toLowerCase().replace(' ', '-')}`}>{c.turno}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="conductor-select-skip"
              onClick={() => setShowConductorSelectModal(false)}
            >
              Omitir seleccion
            </button>
          </div>
        </div>
      )}
    </>
  )
}

export default PenalidadForm
