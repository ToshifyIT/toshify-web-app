// src/components/shared/PenalidadForm.tsx
// Componente compartido para formulario de penalidades
// Usado en: IncidenciasModule y SiniestroSeguimiento

import { useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useCategorizedTipos } from '../../hooks/useCategorizedTipos'
import type {
  PenalidadFormData,
  TipoPenalidad,
  TipoCobroDescuento,
  VehiculoSimple,
  ConductorSimple
} from '../../types/incidencias.types'

interface ConductorAsignado {
  id: string
  nombre_completo: string
  horario: string
  turno: string
}

export interface PenalidadFormProps {
  formData: PenalidadFormData
  setFormData: React.Dispatch<React.SetStateAction<PenalidadFormData>>
  tiposPenalidad: TipoPenalidad[]
  tiposCobroDescuento?: TipoCobroDescuento[]  // Nueva tabla unificada
  vehiculos: VehiculoSimple[]
  conductores: ConductorSimple[]
  disabled?: boolean
}

export function PenalidadForm({ formData, setFormData, tiposPenalidad, tiposCobroDescuento = [], vehiculos, conductores, disabled }: PenalidadFormProps) {
  const [conductorSearch, setConductorSearch] = useState('')
  const [showConductorDropdown, setShowConductorDropdown] = useState(false)
  const [vehiculoSearch, setVehiculoSearch] = useState('')
  const [showVehiculoDropdown, setShowVehiculoDropdown] = useState(false)

  // Estado para modal de seleccion de conductor
  const [showConductorSelectModal, setShowConductorSelectModal] = useState(false)
  const [conductoresAsignados, setConductoresAsignados] = useState<ConductorAsignado[]>([])
  const [loadingConductores, setLoadingConductores] = useState(false)

  const selectedConductor = conductores.find(c => c.id === formData.conductor_id)
  const selectedVehiculo = vehiculos.find(v => v.id === formData.vehiculo_id)

  // Tipos categorizados memoizados
  const { tiposP006, tiposP004, tiposP007, tiposSinCategoria } = useCategorizedTipos(tiposCobroDescuento)

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

  // Si ya viene con incidencia_id, está enlazado automáticamente (desde botón $ de la tabla)
  const yaEnlazado = !!formData.incidencia_id

  return (
    <>
      {/* Mostrar indicador si ya viene enlazado desde incidencia */}
      {yaEnlazado && (
        <div style={{ 
          marginBottom: '16px', 
          padding: '12px', 
          backgroundColor: '#f0fdf4', 
          borderRadius: '6px',
          border: '1px solid #86efac'
        }}>
          <div style={{ fontSize: '13px', color: '#166534', fontWeight: 600 }}>
            Generando cobro/descuento desde incidencia
          </div>
        </div>
      )}

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
            <select 
              value={formData.tipo_cobro_descuento_id || formData.tipo_penalidad_id || ''} 
              onChange={e => setFormData(prev => ({ 
                ...prev, 
                tipo_cobro_descuento_id: e.target.value || undefined,
                tipo_penalidad_id: undefined // Limpiar el legacy
              }))} 
              disabled={disabled}
            >
              <option value="">Seleccionar</option>
              {tiposCobroDescuento.length > 0 ? (
                // Usar la nueva tabla unificada, agrupada por categoría
                <>
                  {/* P006 - Exceso KM */}
                  {tiposP006.length > 0 && (
                    <optgroup label="P006 - Exceso KM">
                      {tiposP006.map(tipo => (
                        <option key={tipo.id} value={tipo.id}>{tipo.nombre}</option>
                      ))}
                    </optgroup>
                  )}
                  {/* P004 - Tickets a Favor */}
                  {tiposP004.length > 0 && (
                    <optgroup label="P004 - Tickets a Favor">
                      {tiposP004.map(tipo => (
                        <option key={tipo.id} value={tipo.id}>{tipo.nombre}</option>
                      ))}
                    </optgroup>
                  )}
                  {/* P007 - Multas/Penalidades */}
                  {tiposP007.length > 0 && (
                    <optgroup label="P007 - Multas/Penalidades">
                      {tiposP007.map(tipo => (
                        <option key={tipo.id} value={tipo.id}>{tipo.nombre}</option>
                      ))}
                    </optgroup>
                  )}
                  {/* Sin categoría */}
                  {tiposSinCategoria.map(tipo => (
                    <option key={tipo.id} value={tipo.id}>{tipo.nombre}</option>
                  ))}
                </>
              ) : tiposPenalidad.length > 0 ? (
                // Fallback a la tabla legacy
                tiposPenalidad.map(t => (
                  <option key={t.id} value={t.id}>{t.nombre}</option>
                ))
              ) : (
                // Fallback a lista hardcodeada
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
