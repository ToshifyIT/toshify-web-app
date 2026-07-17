// src/modules/onboarding/distribucion-mapa/DistribucionMapaModule.tsx
//
// Submódulo "Distribución en mapa" (solo visualización).
// Muestra la distribución geográfica de conductores y leads con filtros por
// entidad, turno y zona. "Ver ficha" abre la ficha completa (reusa el modal del
// Panel de Conductores y LeadDetailView del módulo de Leads). NO empareja ni
// escribe asignaciones.
//
// Reusa la infraestructura de Google Maps de la app (src/lib/googleMaps.ts) y las
// utilidades de conductor. No toca el modal de emparejamiento de programación.

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { GoogleMap, useJsApiLoader, MarkerF, InfoWindowF } from '@react-google-maps/api'
import { Loader2, Map as MapIcon, Users, UserPlus, X } from 'lucide-react'
import { useSede } from '../../../contexts/SedeContext'
import { supabase } from '../../../lib/supabase'
import type { Lead } from '../../../types/leads.types'
import { ConductorDetalleModal } from '../../conductores/panel/ConductorDetalleModal'
import { cargarPanelConductores, type ConductorPanelRow } from '../../conductores/panel/conductoresPanelService'
import { LeadDetailView } from '../../leads/components/LeadDetailView'
import {
  GOOGLE_MAPS_API_KEY,
  GOOGLE_MAPS_LIBRARIES,
  GOOGLE_MAPS_LANGUAGE,
  GOOGLE_MAPS_REGION,
} from '../../../lib/googleMaps'
import {
  formatPreferencia,
  getEstadoConductorDisplay,
  getEstadoConductorBadgeStyle,
} from '../../../utils/conductorUtils'
import {
  fetchConductoresMapa,
  fetchLeadsMapa,
  geocodificarFaltantes,
  coordsValidas,
  type EntidadMapa,
} from './distribucionMapaService'

// Cache perezoso del panel de conductores (consulta pesada). Se carga la primera
// vez que se abre una ficha y se reusa; se invalida al cambiar de sede.
let _panelCache: { sedeId: string | null; rows: ConductorPanelRow[] } | null = null
async function cargarPanelConductoresCache(sedeId: string | null): Promise<ConductorPanelRow[]> {
  if (_panelCache && _panelCache.sedeId === sedeId) return _panelCache.rows
  const rows = await cargarPanelConductores(sedeId)
  _panelCache = { sedeId, rows }
  return rows
}

const MAP_CENTER = { lat: -34.6037, lng: -58.3816 }

// Color por entidad + turno (conductor) / entidad (lead).
const COLOR_LEAD = '#8B5CF6' // violeta: leads (distinto a cualquier color de conductor)
const COLOR_TURNO_DIURNO = '#F59E0B'
const COLOR_TURNO_NOCTURNO = '#3B82F6'
const COLOR_TURNO_SINPREF = '#10B981'

const TURNOS = [
  { value: 'DIURNO', label: 'Diurno' },
  { value: 'NOCTURNO', label: 'Nocturno' },
  { value: 'SIN_PREFERENCIA', label: 'Sin preferencia' },
]

const ZONAS = ['CABA', 'Norte', 'Sur', 'Oeste', 'GBA']

// Color según turno efectivo del conductor (última asignación → preferencia).
function getMarkerColor(e: EntidadMapa): string {
  if (e.tipo === 'lead') return COLOR_LEAD
  switch (e.turnoEfectivo) {
    case 'DIURNO':
      return COLOR_TURNO_DIURNO
    case 'NOCTURNO':
      return COLOR_TURNO_NOCTURNO
    default:
      return COLOR_TURNO_SINPREF
  }
}

// Categoría de turno para el filtro (usa el turno efectivo ya normalizado).
function turnoCategoria(e: EntidadMapa): string {
  return e.turnoEfectivo || 'SIN_PREFERENCIA'
}

// Etiqueta legible del origen del turno, para el InfoWindow.
const ORIGEN_TURNO_LABEL: Record<string, string> = {
  asignacion: 'última asignación',
  preferencia: 'preferencia',
  ninguno: 'sin dato',
}

export function DistribucionMapaModule() {
  const { sedeActualId, aplicarFiltroSede } = useSede()

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: GOOGLE_MAPS_LIBRARIES,
    language: GOOGLE_MAPS_LANGUAGE,
    region: GOOGLE_MAPS_REGION,
  })
  const [mapTimeout, setMapTimeout] = useState(false)

  const [conductores, setConductores] = useState<EntidadMapa[]>([])
  const [leads, setLeads] = useState<EntidadMapa[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filtros
  const [verConductores, setVerConductores] = useState(true)
  const [verBaja, setVerBaja] = useState(false) // de baja: oculto por defecto
  const [verLeads, setVerLeads] = useState(false)
  const [turnosSel, setTurnosSel] = useState<Set<string>>(new Set()) // vacío = todos
  const [zonasSel, setZonasSel] = useState<Set<string>>(new Set(['CABA'])) // CABA por defecto
  const [search, setSearch] = useState('')

  const [activeMarker, setActiveMarker] = useState<string | null>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const geocodDoneRef = useRef(false)

  // Ficha (modal) del conductor / lead seleccionado.
  const [fichaConductor, setFichaConductor] = useState<ConductorPanelRow | null>(null)
  const [fichaLead, setFichaLead] = useState<Lead | null>(null)
  const [fichaLoading, setFichaLoading] = useState(false)

  // Abre la ficha completa de la entidad. Para conductor carga (y cachea) el panel
  // y busca su fila; para lead trae el registro completo por id.
  const abrirFicha = useCallback(async (e: EntidadMapa) => {
    setActiveMarker(null)
    setFichaLoading(true)
    try {
      if (e.tipo === 'conductor') {
        const rows = await cargarPanelConductoresCache(sedeActualId)
        const row = rows.find((r) => r.id === e.id) || null
        if (row) setFichaConductor(row)
      } else {
        const { data } = await supabase.from('leads').select('*').eq('id', e.id).single()
        if (data) setFichaLead(data as Lead)
      }
    } catch (err) {
      console.error('[DistribucionMapa] Error abriendo ficha:', err)
    } finally {
      setFichaLoading(false)
    }
  }, [sedeActualId])

  // Timeout de carga del mapa (patrón del modal existente).
  useEffect(() => {
    if (isLoaded) return
    const t = setTimeout(() => setMapTimeout(true), 10000)
    return () => clearTimeout(t)
  }, [isLoaded])

  // Carga de datos (conductores + leads). Se recarga al cambiar de sede.
  const cargar = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [cond, lds] = await Promise.all([
        fetchConductoresMapa(aplicarFiltroSede),
        fetchLeadsMapa(aplicarFiltroSede),
      ])
      setConductores(cond)
      setLeads(lds)

      // Geocodificar faltantes una sola vez por carga (best-effort).
      if (!geocodDoneRef.current) {
        geocodDoneRef.current = true
        const faltantes = [
          ...cond.map((c) => ({ id: c.id, tipo: c.tipo, direccion: c.direccion, lat: c.lat ?? null, lng: c.lng ?? null })),
          ...lds.map((l) => ({ id: l.id, tipo: l.tipo, direccion: l.direccion, lat: l.lat ?? null, lng: l.lng ?? null })),
        ].filter((f) => f.direccion && (f.lat == null || f.lng == null))

        if (faltantes.length > 0) {
          const actualizado = await geocodificarFaltantes(faltantes)
          if (actualizado) {
            const [cond2, lds2] = await Promise.all([
              fetchConductoresMapa(aplicarFiltroSede),
              fetchLeadsMapa(aplicarFiltroSede),
            ])
            setConductores(cond2)
            setLeads(lds2)
          }
        }
      }
    } catch (err: any) {
      console.error('[DistribucionMapa] Error cargando datos:', err)
      setError(err?.message || 'Error cargando datos')
    } finally {
      setLoading(false)
    }
  }, [aplicarFiltroSede])

  useEffect(() => {
    geocodDoneRef.current = false
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sedeActualId])

  // Solo entidades con coordenadas válidas (dentro de Argentina). Descarta
  // geocodificaciones basura (lat/lng fuera de rango) que romperían el fitBounds.
  const conUbicacion = useMemo(() => {
    const conds = conductores.filter((c) => coordsValidas(c.lat, c.lng))
    const lds = leads.filter((l) => coordsValidas(l.lat, l.lng))
    return { conds, lds }
  }, [conductores, leads])

  // Lista filtrada (lo que se pinta en el mapa y en la barra lateral).
  const filtradas = useMemo(() => {
    const term = search.trim().toLowerCase()
    const matchSearch = (e: EntidadMapa) =>
      !term ||
      e.nombre.toLowerCase().includes(term) ||
      (e.documento || '').toLowerCase().includes(term) ||
      (e.zona || '').toLowerCase().includes(term)

    const matchZona = (e: EntidadMapa) => zonasSel.size === 0 || (e.zona ? zonasSel.has(e.zona) : false)

    const result: EntidadMapa[] = []

    if (verConductores) {
      for (const c of conUbicacion.conds) {
        if (c.esBaja && !verBaja) continue // de baja solo si el filtro está activo
        if (turnosSel.size > 0 && !turnosSel.has(turnoCategoria(c))) continue
        if (!matchZona(c)) continue
        if (!matchSearch(c)) continue
        result.push(c)
      }
    }

    if (verLeads) {
      for (const l of conUbicacion.lds) {
        // Los filtros de estado/turno de conductor no aplican a leads.
        if (!matchZona(l)) continue
        if (!matchSearch(l)) continue
        result.push(l)
      }
    }

    return result
  }, [conUbicacion, verConductores, verBaja, verLeads, turnosSel, zonasSel, search])

  const conteos = useMemo(() => {
    const c = filtradas.filter((e) => e.tipo === 'conductor').length
    const l = filtradas.filter((e) => e.tipo === 'lead').length
    return { c, l }
  }, [filtradas])

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map
  }, [])

  // Ajustar el encuadre cuando cambian las entidades visibles.
  useEffect(() => {
    if (!mapRef.current || filtradas.length === 0) return
    const bounds = new google.maps.LatLngBounds()
    filtradas.forEach((e) => bounds.extend({ lat: e.lat, lng: e.lng }))
    mapRef.current.fitBounds(bounds, 60)
  }, [filtradas])

  const toggleSet = (set: Set<string>, value: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    setter(next)
  }

  const handleListClick = (e: EntidadMapa) => {
    setActiveMarker(e.id)
    if (mapRef.current) {
      mapRef.current.panTo({ lat: e.lat, lng: e.lng })
      mapRef.current.setZoom(14)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)', minHeight: 480 }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 20px',
          borderBottom: '1px solid var(--border-primary)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <MapIcon size={20} style={{ color: 'var(--color-primary, #ff0033)' }} />
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>
              Distribución en mapa
            </h2>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              {conteos.c} conductores{verLeads ? ` · ${conteos.l} leads` : ''} con ubicación
            </span>
          </div>
        </div>
        {/* Leyenda */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '6px 12px',
            background: 'var(--bg-secondary)',
            borderRadius: 8,
            flexWrap: 'wrap',
          }}
        >
          <LegendDot color={COLOR_TURNO_DIURNO} label="Cond. Diurno" />
          <LegendDot color={COLOR_TURNO_NOCTURNO} label="Cond. Nocturno" />
          <LegendDot color={COLOR_TURNO_SINPREF} label="Cond. Sin pref." />
          <LegendDot color={COLOR_LEAD} label="Lead (para inducción)" square />
        </div>
      </div>

      {/* Body: filtros + mapa */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Sidebar de filtros */}
        <div
          style={{
            width: 280,
            flexShrink: 0,
            borderRight: '1px solid var(--border-primary)',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--bg-primary)',
            overflowY: 'auto',
          }}
        >
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Buscador */}
            <input
              type="text"
              placeholder="Buscar nombre, DNI, zona..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid var(--border-primary)',
                borderRadius: 8,
                fontSize: 13,
                outline: 'none',
                boxSizing: 'border-box',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
              }}
            />

            {/* Tipo de entidad */}
            <FilterGroup title="Mostrar">
              <CheckRow
                icon={<Users size={14} />}
                label="Conductores"
                checked={verConductores}
                onChange={() => setVerConductores((v) => !v)}
              />
              {verConductores && (
                <div style={{ marginLeft: 22 }}>
                  <CheckRow
                    label="Incluir de baja"
                    checked={verBaja}
                    onChange={() => setVerBaja((v) => !v)}
                  />
                </div>
              )}
              <CheckRow
                icon={<UserPlus size={14} />}
                label="Leads (para inducción)"
                checked={verLeads}
                onChange={() => setVerLeads((v) => !v)}
              />
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 22, marginTop: -2 }}>
                Apto Inducción + Convocatoria Inducción
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
                Los de baja se muestran atenuados. El turno sale de su última asignación.
              </div>
            </FilterGroup>

            {/* Turno (conductores) */}
            {verConductores && (
              <FilterGroup title="Turno (conductor)">
                {TURNOS.map((t) => (
                  <CheckRow
                    key={t.value}
                    label={t.label}
                    checked={turnosSel.has(t.value)}
                    onChange={() => toggleSet(turnosSel, t.value, setTurnosSel)}
                  />
                ))}
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
                  Sin selección = todos los turnos.
                </div>
              </FilterGroup>
            )}

            {/* Zona */}
            <FilterGroup title="Zona">
              {ZONAS.map((z) => (
                <CheckRow
                  key={z}
                  label={z}
                  checked={zonasSel.has(z)}
                  onChange={() => toggleSet(zonasSel, z, setZonasSel)}
                />
              ))}
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
                Sin selección = todas las zonas.
              </div>
            </FilterGroup>
          </div>
        </div>

        {/* Mapa */}
        <div style={{ flex: 1, position: 'relative' }}>
          {error ? (
            <CenterMsg>
              <span style={{ color: 'var(--text-secondary)' }}>{error}</span>
              <RetryButton onClick={cargar} label="Reintentar" />
            </CenterMsg>
          ) : loadError || (!isLoaded && mapTimeout) ? (
            <CenterMsg>
              <span style={{ color: 'var(--text-secondary)' }}>No se pudo cargar Google Maps</span>
              <RetryButton onClick={() => window.location.reload()} label="Reintentar" />
            </CenterMsg>
          ) : !isLoaded || loading ? (
            <CenterMsg>
              <span style={{ display: 'flex', alignItems: 'center', color: 'var(--text-tertiary)' }}>
                <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', marginRight: 8 }} />
                {!isLoaded ? 'Cargando mapa...' : 'Cargando datos...'}
              </span>
            </CenterMsg>
          ) : (
            <GoogleMap
              mapContainerStyle={{ width: '100%', height: '100%' }}
              center={MAP_CENTER}
              zoom={11}
              onLoad={onMapLoad}
              options={{
                streetViewControl: false,
                mapTypeControl: false,
                fullscreenControl: false,
                zoomControl: true,
                zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_TOP },
              }}
            >
              {filtradas.map((e) => {
                const color = getMarkerColor(e)
                const isActive = activeMarker === e.id
                const isLead = e.tipo === 'lead'
                const esBaja = e.tipo === 'conductor' && e.esBaja
                return (
                  <MarkerF
                    key={`${e.tipo}-${e.id}`}
                    position={{ lat: e.lat, lng: e.lng }}
                    onClick={() => setActiveMarker(e.id)}
                    icon={{
                      // Lead: rombo (distinta forma). Conductor: círculo.
                      path: isLead
                        ? 'M 0,-8 L 8,0 L 0,8 L -8,0 Z'
                        : google.maps.SymbolPath.CIRCLE,
                      fillColor: color,
                      // De baja: atenuado y con borde gris para diferenciarlo.
                      fillOpacity: esBaja ? 0.4 : 0.9,
                      strokeColor: isActive ? '#ff0033' : esBaja ? '#6B7280' : '#fff',
                      strokeWeight: isActive ? 3 : 1.5,
                      scale: isLead ? (isActive ? 1.6 : 1.2) : isActive ? 10 : 7,
                    }}
                  >
                    {isActive && (
                      <InfoWindowF
                        position={{ lat: e.lat, lng: e.lng }}
                        onCloseClick={() => setActiveMarker(null)}
                      >
                        <InfoContent entidad={e} onVerFicha={abrirFicha} />
                      </InfoWindowF>
                    )}
                  </MarkerF>
                )
              })}
            </GoogleMap>
          )}

          {/* Lista flotante de resultados */}
          {isLoaded && !loading && !error && (
            <div
              style={{
                position: 'absolute',
                top: 12,
                left: 12,
                width: 240,
                maxHeight: 'calc(100% - 24px)',
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 10,
                boxShadow: '0 6px 20px rgba(0,0,0,0.12)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  padding: '8px 12px',
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  borderBottom: '1px solid var(--border-primary)',
                }}
              >
                {filtradas.length} resultado{filtradas.length === 1 ? '' : 's'}
              </div>
              <div style={{ overflowY: 'auto' }}>
                {filtradas.map((e) => (
                  <div
                    key={`li-${e.tipo}-${e.id}`}
                    onClick={() => handleListClick(e)}
                    style={{
                      padding: '7px 12px',
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--border-primary)',
                      background: activeMarker === e.id ? 'var(--bg-secondary)' : 'transparent',
                      opacity: e.tipo === 'conductor' && e.esBaja ? 0.55 : 1,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: e.tipo === 'lead' ? 2 : '50%',
                          transform: e.tipo === 'lead' ? 'rotate(45deg)' : undefined,
                          background: getMarkerColor(e),
                          display: 'inline-block',
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                        {e.nombre}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 2, marginLeft: 14 }}>
                      <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                        {e.tipo === 'lead' ? 'Lead' : e.esBaja ? 'Conductor · Baja' : 'Conductor'}
                      </span>
                      {e.documento && (
                        <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{e.documento}</span>
                      )}
                      {e.zona && <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{e.zona}</span>}
                    </div>
                  </div>
                ))}
                {filtradas.length === 0 && (
                  <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>
                    Sin resultados
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Indicador de carga de ficha */}
      {fichaLoading && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 12000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.35)',
          }}
        >
          <div
            style={{
              background: 'var(--bg-primary)',
              padding: '14px 20px',
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: 'var(--text-secondary)',
              fontSize: 13,
            }}
          >
            <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Cargando ficha...
          </div>
        </div>
      )}

      {/* Ficha completa del conductor (reusa el modal del Panel de Conductores) */}
      {fichaConductor && (
        <ConductorDetalleModal conductor={fichaConductor} onClose={() => setFichaConductor(null)} />
      )}

      {/* Ficha completa del lead (reusa LeadDetailView del módulo de Leads) */}
      {fichaLead && (
        <LeadDetalleModal lead={fichaLead} onClose={() => setFichaLead(null)} />
      )}
    </div>
  )
}

// Envuelve LeadDetailView en un overlay modal centrado (LeadDetailView no trae overlay propio).
function LeadDetalleModal({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 12000,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
        padding: '3vh 16px',
        overflowY: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-primary)',
          borderRadius: 12,
          width: '100%',
          maxWidth: 1000,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          position: 'relative',
          padding: 20,
        }}
      >
        <button
          onClick={onClose}
          aria-label="Cerrar"
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            zIndex: 1,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 8,
            cursor: 'pointer',
            padding: '6px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 12,
            color: 'var(--text-secondary)',
          }}
        >
          <X size={14} /> Cerrar
        </button>
        <LeadDetailView lead={lead} />
      </div>
    </div>
  )
}

// ---------- Subcomponentes de UI ----------

function LegendDot({ color, label, square }: { color: string; label: string; square?: boolean }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-secondary)' }}>
      <span
        style={{
          width: 9,
          height: 9,
          borderRadius: square ? 2 : '50%',
          transform: square ? 'rotate(45deg)' : undefined,
          background: color,
          display: 'inline-block',
        }}
      />
      {label}
    </span>
  )
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{children}</div>
    </div>
  )
}

function CheckRow({
  label,
  checked,
  onChange,
  icon,
}: {
  label: string
  checked: boolean
  onChange: () => void
  icon?: React.ReactNode
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 13,
        color: 'var(--text-primary)',
        cursor: 'pointer',
        padding: '2px 0',
      }}
    >
      <input type="checkbox" checked={checked} onChange={onChange} style={{ cursor: 'pointer' }} />
      {icon}
      {label}
    </label>
  )
}

function InfoContent({ entidad: e, onVerFicha }: { entidad: EntidadMapa; onVerFicha: (e: EntidadMapa) => void }) {
  const badge =
    e.tipo === 'conductor'
      ? getEstadoConductorBadgeStyle({ codigo: e.estadoCodigo || undefined })
      : { bg: COLOR_LEAD, color: 'white' }
  return (
    <div style={{ padding: '4px 2px', minWidth: 180 }}>
      <p style={{ margin: 0, fontWeight: 700, fontSize: 13 }}>{e.nombre}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '4px 0 0' }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: '1px 6px',
            borderRadius: 4,
            background: badge.bg,
            color: badge.color,
          }}
        >
          {e.tipo === 'conductor'
            ? getEstadoConductorDisplay({ codigo: e.estadoCodigo || undefined, descripcion: e.estadoDescripcion })
            : e.estadoLead || 'Lead'}
        </span>
        <span style={{ fontSize: 10, color: '#6B7280' }}>{e.tipo === 'lead' ? 'Lead' : 'Conductor'}</span>
      </div>
      <p style={{ margin: '5px 0 0', fontSize: 11, color: '#6B7280' }}>
        DNI: {e.documento || '-'}
        {e.tipo === 'lead' && e.turnoLead && ` · ${e.turnoLead}`}
      </p>
      {e.tipo === 'conductor' && (
        <p style={{ margin: '2px 0 0', fontSize: 11, color: '#6B7280' }}>
          Turno: {formatPreferencia(e.turnoEfectivo || undefined)}
          <span style={{ color: '#9CA3AF' }}>
            {' '}
            ({ORIGEN_TURNO_LABEL[e.turnoOrigen] || 'sin dato'})
          </span>
        </p>
      )}
      {e.zona && <p style={{ margin: '2px 0 0', fontSize: 11, color: '#6B7280' }}>Zona: {e.zona}</p>}
      {e.direccion && <p style={{ margin: '2px 0 0', fontSize: 10, color: '#9CA3AF' }}>{e.direccion}</p>}
      <button
        onClick={() => onVerFicha(e)}
        style={{
          marginTop: 8,
          padding: '5px 12px',
          border: 'none',
          borderRadius: 6,
          background: '#ff0033',
          color: '#fff',
          fontSize: 11,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Ver ficha →
      </button>
    </div>
  )
}

function CenterMsg({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 12,
      }}
    >
      {children}
    </div>
  )
}

function RetryButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 20px',
        background: '#ff0033',
        color: '#fff',
        border: 'none',
        borderRadius: 8,
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      {label}
    </button>
  )
}

export default DistribucionMapaModule
