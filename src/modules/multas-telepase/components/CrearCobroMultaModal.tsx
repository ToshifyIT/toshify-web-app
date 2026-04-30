// src/modules/multas-telepase/components/CrearCobroMultaModal.tsx
// Modal para crear una incidencia tipo "cobro" desde una multa.
// Sigue la misma estructura/estilos que IncidenciaForm en IncidenciasModule.

import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import Swal from 'sweetalert2'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import { useSede } from '../../../contexts/SedeContext'
import { useCategorizedTipos } from '../../../hooks/useCategorizedTipos'
import '../../incidencias/IncidenciasModule.css'

interface MultaInput {
  id: number
  patente: string
  fecha_infraccion: string | null
  importe: string
  infraccion: string
  lugar: string
  detalle: string
  conductor_responsable: string
}

interface Props {
  isOpen: boolean
  multa: MultaInput | null
  onClose: () => void
  onSaved?: () => void
}

interface TipoCobroDescuento {
  id: string
  codigo: string
  nombre: string
  categoria?: string
  es_a_favor?: boolean
}
interface IncidenciaEstado { id: string; codigo: string; nombre: string }
interface VehiculoSimple { id: string; patente: string; marca: string; modelo: string }
interface ConductorSimple { id: string; nombres: string; apellidos: string; nombre_completo: string }
interface SedeSimple { id: string; nombre: string }

function getLocalDateString(fromIso?: string | null): string {
  const d = fromIso ? new Date(fromIso) : new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getWeekNumber(dateStr: string): number {
  if (!dateStr) return 0
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(year, month - 1, day, 12, 0, 0)
  const thursday = new Date(date)
  thursday.setDate(date.getDate() - ((date.getDay() + 6) % 7) + 3)
  const firstThursday = new Date(thursday.getFullYear(), 0, 4)
  firstThursday.setDate(firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7) + 3)
  return Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1
}

function parseImporteToNumber(s: string | number | null | undefined): number {
  if (s == null || s === '') return 0
  if (typeof s === 'number') return s
  let str = s.replace(/[^\d,.-]/g, '')
  const lastComma = str.lastIndexOf(',')
  const lastDot = str.lastIndexOf('.')
  if (lastComma > lastDot) str = str.replace(/\./g, '').replace(',', '.')
  else if (lastDot !== -1 && lastComma !== -1) str = str.replace(/,/g, '')
  const n = parseFloat(str)
  return isNaN(n) ? 0 : n
}

function normalizePatente(value: string | null | undefined): string {
  if (!value) return ''
  return value.trim().replace(/[\s-]/g, '').toUpperCase()
}

// Normaliza nombres: quita acentos, mayúsculas, espacios colapsados
function normalizeName(value: string | null | undefined): string {
  if (!value) return ''
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function findConductorByName(conductores: ConductorSimple[], rawName: string): ConductorSimple | null {
  const n = normalizeName(rawName)
  if (!n) return null
  // 1. Match exacto del nombre completo
  let c = conductores.find(x => normalizeName(x.nombre_completo) === n)
  if (c) return c
  // 2. Match por contención (multa contiene apellidos+nombres en cualquier orden)
  const tokens = n.split(' ').filter(t => t.length >= 3)
  if (tokens.length === 0) return null
  c = conductores.find(x => {
    const candidate = normalizeName(x.nombre_completo)
    return tokens.every(t => candidate.includes(t))
  })
  return c || null
}

export function CrearCobroMultaModal({ isOpen, multa, onClose, onSaved }: Props) {
  const { user, profile } = useAuth()
  const { sedeActualId, sedeUsuario } = useSede()

  const [tiposCobro, setTiposCobro] = useState<TipoCobroDescuento[]>([])
  const [estados, setEstados] = useState<IncidenciaEstado[]>([])
  const [vehiculos, setVehiculos] = useState<VehiculoSimple[]>([])
  const [conductores, setConductores] = useState<ConductorSimple[]>([])
  const [sedes, setSedes] = useState<SedeSimple[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [vehiculoId, setVehiculoId] = useState<string>('')
  const [conductorId, setConductorId] = useState<string>('')
  const [conductorSearch, setConductorSearch] = useState<string>('')
  const [showConductorDropdown, setShowConductorDropdown] = useState(false)
  const [estadoId, setEstadoId] = useState<string>('')
  const [tipoCobroId, setTipoCobroId] = useState<string>('')
  const [fecha, setFecha] = useState<string>('')
  const [turno, setTurno] = useState<string>('')
  const [area, setArea] = useState<string>('Multas')
  const [sedeId, setSedeId] = useState<string>('')
  const [monto, setMonto] = useState<number | undefined>(undefined)
  const [descripcion, setDescripcion] = useState<string>('')
  const [notas, setNotas] = useState<string>('')

  const { tiposP006, tiposP004, tiposP007, tiposSinCategoria } = useCategorizedTipos(tiposCobro as any)

  // Cargar catálogos
  useEffect(() => {
    if (!isOpen || !multa) return
    setLoading(true)
    Promise.all([
      (supabase.from('tipos_cobro_descuento' as any) as any).select('id,codigo,nombre,categoria,es_a_favor,orden,is_active').eq('is_active', true).order('orden'),
      (supabase.from('incidencias_estados' as any) as any).select('id,codigo,nombre').eq('is_active', true).order('orden'),
      supabase.from('vehiculos').select('id,patente,marca,modelo').is('deleted_at', null),
      supabase.from('conductores').select('id,nombres,apellidos').order('apellidos'),
      supabase.from('sedes').select('id,nombre').order('nombre')
    ]).then(([tRes, eRes, vRes, cRes, sRes]: any[]) => {
      setTiposCobro((tRes.data || []) as TipoCobroDescuento[])
      setEstados((eRes.data || []) as IncidenciaEstado[])
      setVehiculos((vRes.data || []) as VehiculoSimple[])
      const conds = (cRes.data || []).map((c: any) => ({
        id: c.id,
        nombres: c.nombres || '',
        apellidos: c.apellidos || '',
        nombre_completo: `${c.nombres || ''} ${c.apellidos || ''}`.trim()
      }))
      setConductores(conds)
      setSedes((sRes.data || []) as SedeSimple[])
    }).finally(() => setLoading(false))
  }, [isOpen, multa])

  // Pre-llenar form cuando hay multa
  useEffect(() => {
    if (!isOpen || !multa) return
    setMonto(parseImporteToNumber(multa.importe))
    setDescripcion(`Multa ${multa.infraccion ? `(${multa.infraccion})` : ''} — ${multa.lugar || 's/lugar'}${multa.detalle ? ` — ${multa.detalle}` : ''}`.trim())
    setNotas('')
    setArea('Multas')
    setSedeId(sedeActualId || sedeUsuario?.id || '')
  }, [isOpen, multa, sedeActualId, sedeUsuario])

  // La fecha de la incidencia es la de la semana de facturación abierta de la sede.
  // Si no hay periodo abierto, fallback a la fecha de hoy.
  useEffect(() => {
    if (!isOpen) return
    const sede = sedeActualId || sedeUsuario?.id
    if (!sede) {
      setFecha(getLocalDateString())
      return
    }
    ;(supabase.from('periodos_facturacion' as any) as any)
      .select('fecha_inicio,fecha_fin,estado')
      .eq('sede_id', sede)
      .eq('estado', 'abierto')
      .order('fecha_inicio', { ascending: false })
      .limit(1)
      .then(({ data }: any) => {
        const periodo = data && data[0]
        setFecha(periodo?.fecha_inicio || getLocalDateString())
      })
  }, [isOpen, sedeActualId, sedeUsuario])

  // Resolver vehículo por patente
  useEffect(() => {
    if (!multa || vehiculos.length === 0) return
    const patNorm = normalizePatente(multa.patente)
    const v = vehiculos.find(x => normalizePatente(x.patente) === patNorm)
    if (v) setVehiculoId(v.id)
  }, [vehiculos, multa])

  // Resolver conductor por nombre (matching tolerante: acentos, orden, espacios)
  useEffect(() => {
    if (!multa || conductores.length === 0) return
    const c = findConductorByName(conductores, multa.conductor_responsable || '')
    if (c) setConductorId(c.id)
  }, [conductores, multa])

  // Auto-seleccionar estado "PENDIENTE" (igual que IncidenciasModule en flujo de cobro)
  useEffect(() => {
    if (estados.length === 0 || estadoId) return
    const pendiente = estados.find(e => e.codigo === 'PENDIENTE') || estados[0]
    if (pendiente) setEstadoId(pendiente.id)
  }, [estados, estadoId])

  // Auto-resolver modalidad (turno) buscando la asignación que matche vehículo + conductor
  useEffect(() => {
    if (!vehiculoId || !conductorId || turno) return
    ;(supabase
      .from('asignaciones')
      .select('horario, asignaciones_conductores(horario, conductor_id)')
      .eq('vehiculo_id', vehiculoId) as any)
      .then(({ data }: any) => {
        for (const asig of (data || [])) {
          const ac = (asig.asignaciones_conductores || []).find((x: any) => x.conductor_id === conductorId)
          if (!ac) continue
          const esTurno = asig.horario === 'turno'
          if (!esTurno) { setTurno('A cargo'); return }
          if (ac.horario === 'diurno') { setTurno('Diurno'); return }
          if (ac.horario === 'nocturno') { setTurno('Nocturno'); return }
          setTurno('A cargo')
          return
        }
      })
  }, [vehiculoId, conductorId, turno])

  // Pre-seleccionar tipo "Multa de tránsito"
  useEffect(() => {
    if (tiposCobro.length === 0 || tipoCobroId) return
    const t = tiposCobro.find(x => x.nombre.toLowerCase().includes('multa') && x.nombre.toLowerCase().includes('tr'))
    if (t) setTipoCobroId(t.id)
  }, [tiposCobro, tipoCobroId])

  const semanaCalc = useMemo(() => fecha ? getWeekNumber(fecha) : 0, [fecha])
  const selectedVehiculo = vehiculos.find(v => v.id === vehiculoId)
  const selectedConductor = conductores.find(c => c.id === conductorId)

  function reset() {
    setVehiculoId(''); setConductorId(''); setEstadoId(''); setTipoCobroId('')
    setFecha(''); setTurno(''); setArea('Multas'); setSedeId('')
    setMonto(undefined); setDescripcion(''); setNotas('')
  }

  function handleClose() {
    if (saving) return
    reset()
    onClose()
  }

  async function handleGuardar() {
    if (!multa) return
    if (!vehiculoId) { Swal.fire('Error', 'Debe seleccionar la patente', 'error'); return }
    if (!conductorId) { Swal.fire('Error', 'Debe seleccionar un conductor', 'error'); return }
    if (!fecha) { Swal.fire('Error', 'La fecha es requerida', 'error'); return }
    if (!estadoId) { Swal.fire('Error', 'Debe seleccionar un estado', 'error'); return }
    if (!tipoCobroId) { Swal.fire('Error', 'Debe seleccionar un tipo de incidencia', 'error'); return }
    if (!monto || monto <= 0) { Swal.fire('Error', 'El monto debe ser mayor a 0', 'error'); return }

    setSaving(true)
    try {
      const conductor = conductores.find(c => c.id === conductorId)
      const vehiculo = vehiculos.find(v => v.id === vehiculoId)

      const { error } = await (supabase.from('incidencias' as any) as any).insert({
        vehiculo_id: vehiculoId,
        conductor_id: conductorId,
        estado_id: estadoId,
        sede_id: sedeId || null,
        semana: semanaCalc,
        fecha,
        turno: turno || null,
        area: area || 'Multas',
        descripcion: descripcion || null,
        notas: notas?.trim() || null,
        conductor_nombre: conductor?.nombre_completo || null,
        vehiculo_patente: vehiculo?.patente || multa.patente,
        tipo: 'cobro',
        tipo_cobro_descuento_id: tipoCobroId,
        monto: monto || null,
        multa_id: multa.id,
        created_by: user?.id,
        created_by_name: profile?.full_name || 'Sistema'
      })
      if (error) throw error

      Swal.fire({ icon: 'success', title: 'Incidencia creada', text: 'El cobro fue registrado correctamente', timer: 2000, showConfirmButton: false })
      onSaved?.()
      handleClose()
    } catch (err: any) {
      Swal.fire('Error', err?.message || 'No se pudo crear la incidencia', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen || !multa) return null

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Nueva Incidencia (Cobro por Multa)</h2>
          <button className="modal-close" onClick={handleClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {loading ? (
            <p style={{ padding: '24px' }}>Cargando catálogos...</p>
          ) : (
            <>
              <div className="form-section">
                <div className="form-section-title">Datos de la Incidencia</div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Patente <span className="required">*</span></label>
                    <input
                      type="text"
                      value={selectedVehiculo ? `${selectedVehiculo.patente} - ${selectedVehiculo.marca} ${selectedVehiculo.modelo}` : multa.patente}
                      readOnly
                      className="form-input-readonly"
                    />
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
                          if (conductorId) setConductorId('')
                        }}
                        onFocus={() => setShowConductorDropdown(true)}
                        onBlur={() => setTimeout(() => setShowConductorDropdown(false), 200)}
                        placeholder="Buscar conductor..."
                        disabled={saving}
                      />
                      {showConductorDropdown && conductorSearch && (() => {
                        const term = normalizeName(conductorSearch)
                        const matches = conductores.filter(c =>
                          term.split(' ').filter(t => t.length >= 2).every(t =>
                            normalizeName(c.nombre_completo).includes(t)
                          )
                        ).slice(0, 12)
                        if (matches.length === 0) return null
                        return (
                          <div className="searchable-dropdown">
                            {matches.map(c => (
                              <div
                                key={c.id}
                                className="searchable-option"
                                onClick={() => {
                                  setConductorId(c.id)
                                  setConductorSearch('')
                                  setShowConductorDropdown(false)
                                }}
                              >
                                {c.nombre_completo}
                              </div>
                            ))}
                          </div>
                        )
                      })()}
                      {selectedConductor && (
                        <button
                          type="button"
                          className="clear-selection"
                          onClick={() => { setConductorId(''); setConductorSearch('') }}
                        >
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
                      value={fecha}
                      onChange={e => setFecha(e.target.value)}
                      disabled={saving}
                    />
                  </div>
                  <div className="form-group">
                    <label>Semana</label>
                    <input type="text" value={semanaCalc || '-'} readOnly className="form-input-readonly" />
                  </div>
                  <div className="form-group">
                    <label>Modalidad</label>
                    <select value={turno} onChange={e => setTurno(e.target.value)} disabled={saving}>
                      <option value="">Seleccionar</option>
                      <option value="Diurno">Diurno</option>
                      <option value="Nocturno">Nocturno</option>
                      <option value="A cargo">A cargo</option>
                    </select>
                  </div>
                </div>

                <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="form-group">
                    <label>Tipo de Incidencia <span className="required">*</span></label>
                    <select value={tipoCobroId} onChange={e => setTipoCobroId(e.target.value)} disabled={saving}>
                      <option value="">Seleccionar</option>
                      {tiposP006.length > 0 && (
                        <optgroup label="P006 - Exceso KM">
                          {tiposP006.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                        </optgroup>
                      )}
                      {tiposP004.length > 0 && (
                        <optgroup label="P004 - Tickets a Favor">
                          {tiposP004.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                        </optgroup>
                      )}
                      {tiposP007.length > 0 && (
                        <optgroup label="P007 - Multas/Penalidades">
                          {tiposP007.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                        </optgroup>
                      )}
                      {tiposSinCategoria.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Área <span className="required">*</span></label>
                    <select value={area} onChange={e => setArea(e.target.value)} disabled={saving}>
                      <option value="">Seleccionar</option>
                      <option value="Logística">Logística</option>
                      <option value="Data Entry">Data Entry</option>
                      <option value="Administración">Administración</option>
                      <option value="Siniestros">Siniestros</option>
                      <option value="Marketing">Marketing</option>
                      <option value="Multas">Multas</option>
                    </select>
                  </div>
                </div>

                <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div className="form-group">
                    <label>Sede</label>
                    <select value={sedeId} onChange={e => setSedeId(e.target.value)} disabled={saving}>
                      <option value="">Seleccionar</option>
                      {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Monto <span className="required">*</span></label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={monto ?? ''}
                      onChange={e => setMonto(e.target.value ? parseFloat(e.target.value) : undefined)}
                      disabled={saving}
                    />
                  </div>
                </div>

                <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div className="form-group">
                    <label>Registrado por</label>
                    <input
                      type="text"
                      value={profile?.full_name || 'Sistema'}
                      readOnly
                      className="form-input-readonly"
                    />
                  </div>
                  <div className="form-group">{/* spacer */}</div>
                </div>
              </div>

              <div className="form-section">
                <div className="form-row">
                  <div className="form-group full-width">
                    <label>Descripción</label>
                    <textarea
                      value={descripcion}
                      onChange={e => setDescripcion(e.target.value)}
                      placeholder="Describa la incidencia..."
                      disabled={saving}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group full-width">
                    <label>Notas</label>
                    <textarea
                      value={notas}
                      onChange={e => setNotas(e.target.value)}
                      placeholder="Notas internas, aclaraciones, referencias..."
                      disabled={saving}
                    />
                  </div>
                </div>
              </div>

              {/* Origen: link a la multa */}
              <div className="form-section">
                <div className="form-section-title">Multa de Origen</div>
                <div style={{ padding: '12px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  <strong>{multa.patente}</strong>
                  {multa.fecha_infraccion ? ` · ${new Date(multa.fecha_infraccion).toLocaleString('es-AR')}` : ''}
                  {multa.infraccion ? ` · ${multa.infraccion}` : ''}
                  {multa.lugar ? ` · ${multa.lugar}` : ''}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={handleClose} disabled={saving}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={handleGuardar} disabled={saving || loading}>
            {saving ? 'Guardando...' : 'Registrar'}
          </button>
        </div>
      </div>
    </div>
  )
}
