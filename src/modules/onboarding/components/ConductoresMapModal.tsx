// src/modules/onboarding/components/ConductoresMapModal.tsx
// Separado del wizard para que falle de forma aislada si Google Maps no carga
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { GoogleMap, useJsApiLoader, MarkerF, InfoWindowF, PolylineF } from '@react-google-maps/api'
import { X, Sun, Moon, Check, Loader2, Map as MapIcon } from 'lucide-react'

const LIBRARIES: ('places')[] = ['places']
const MAP_CENTER = { lat: -34.6037, lng: -58.3816 }

interface Conductor {
  id: string
  numero_licencia: string
  numero_dni: string
  nombres: string
  apellidos: string
  licencia_vencimiento: string
  estado_id: string
  preferencia_turno?: string
  zona?: string | null
  direccion?: string | null
  direccion_lat?: number | null
  direccion_lng?: number | null
  conductores_estados?: {
    codigo: string
    descripcion: string
  }
  tieneAsignacionActiva?: boolean
  tieneAsignacionProgramada?: boolean
  tieneAsignacionDiurna?: boolean
  tieneAsignacionNocturna?: boolean
  distanciaCalculada?: number | null
}

interface Props {
  conductores: Conductor[]
  onConfirmPair: (diurno: Conductor, nocturno: Conductor) => void
  onClose: () => void
  apiKey: string
}

const getMarkerColor = (c: Conductor): string => {
  switch (c.preferencia_turno) {
    case 'DIURNO': return '#F59E0B'
    case 'NOCTURNO': return '#3B82F6'
    default: return '#10B981'
  }
}

const formatPreferencia = (preferencia?: string): string => {
  switch (preferencia) {
    case 'DIURNO': return 'Diurno'
    case 'NOCTURNO': return 'Nocturno'
    case 'A_CARGO': return 'A Cargo'
    case 'SIN_PREFERENCIA': return 'Ambos'
    default: return 'Ambos'
  }
}

export default function ConductoresMapModal({ conductores, onConfirmPair, onClose, apiKey }: Props) {
  const { isLoaded, loadError } = useJsApiLoader({ googleMapsApiKey: apiKey, libraries: LIBRARIES })
  const [mapTimeout, setMapTimeout] = useState(false)
  const [activeMarker, setActiveMarker] = useState<string | null>(null)

  // Si Google Maps no carga en 10s, mostrar error con opción de reintentar
  useEffect(() => {
    if (isLoaded) return
    const t = setTimeout(() => setMapTimeout(true), 10000)
    return () => clearTimeout(t)
  }, [isLoaded])
  const [searchMap, setSearchMap] = useState('')
  const [selectedDiurno, setSelectedDiurno] = useState<Conductor | null>(null)
  const [selectedNocturno, setSelectedNocturno] = useState<Conductor | null>(null)
  const [routePath, setRoutePath] = useState<google.maps.LatLngLiteral[]>([])
  const [routeInfo, setRouteInfo] = useState<{ distancia: string; duracion: string } | null>(null)
  const mapRef = useRef<google.maps.Map | null>(null)

  const conductoresConUbicacion = useMemo(() =>
    conductores.filter(c => c.direccion_lat && c.direccion_lng),
    [conductores]
  )

  useEffect(() => {
    if (!selectedDiurno?.direccion_lat || !selectedNocturno?.direccion_lat) {
      setRoutePath([])
      setRouteInfo(null)
      return
    }
    const ds = new google.maps.DirectionsService()
    ds.route({
      origin: { lat: selectedDiurno.direccion_lat!, lng: selectedDiurno.direccion_lng! },
      destination: { lat: selectedNocturno.direccion_lat!, lng: selectedNocturno.direccion_lng! },
      travelMode: google.maps.TravelMode.DRIVING,
    }, (result, status) => {
      if (status === 'OK' && result?.routes?.[0]) {
        const leg = result.routes[0].legs?.[0]
        const path = result.routes[0].overview_path.map(p => ({ lat: p.lat(), lng: p.lng() }))
        setRoutePath(path)
        setRouteInfo(leg ? {
          distancia: leg.distance?.text || '',
          duracion: leg.duration?.text || '',
        } : null)
        if (mapRef.current) {
          const bounds = new google.maps.LatLngBounds()
          bounds.extend({ lat: selectedDiurno.direccion_lat!, lng: selectedDiurno.direccion_lng! })
          bounds.extend({ lat: selectedNocturno.direccion_lat!, lng: selectedNocturno.direccion_lng! })
          mapRef.current.fitBounds(bounds, 80)
        }
      } else {
        setRoutePath([])
        setRouteInfo(null)
      }
    })
  }, [selectedDiurno?.id, selectedNocturno?.id])

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map
    if (conductoresConUbicacion.length > 0) {
      const bounds = new google.maps.LatLngBounds()
      conductoresConUbicacion.forEach(c => {
        bounds.extend({ lat: c.direccion_lat!, lng: c.direccion_lng! })
      })
      map.fitBounds(bounds, 50)
    }
  }, [conductoresConUbicacion])

  const filteredList = useMemo(() => {
    if (!searchMap) return conductoresConUbicacion
    const term = searchMap.toLowerCase()
    return conductoresConUbicacion.filter(c =>
      `${c.nombres} ${c.apellidos}`.toLowerCase().includes(term)
      || `${c.apellidos} ${c.nombres}`.toLowerCase().includes(term)
      || (c.numero_dni || '').includes(term)
      || (c.zona || '').toLowerCase().includes(term)
    )
  }, [conductoresConUbicacion, searchMap])

  const handleListClick = (c: Conductor) => {
    setActiveMarker(c.id)
    if (mapRef.current && c.direccion_lat && c.direccion_lng) {
      mapRef.current.panTo({ lat: c.direccion_lat, lng: c.direccion_lng })
      mapRef.current.setZoom(14)
    }
  }

  const handleSelectAs = (c: Conductor, role: 'diurno' | 'nocturno') => {
    if (role === 'diurno') {
      if (selectedNocturno?.id === c.id) setSelectedNocturno(null)
      setSelectedDiurno(c)
    } else {
      if (selectedDiurno?.id === c.id) setSelectedDiurno(null)
      setSelectedNocturno(c)
    }
    setActiveMarker(null)
  }

  const getSelectionRole = (id: string) => {
    if (selectedDiurno?.id === id) return 'diurno'
    if (selectedNocturno?.id === id) return 'nocturno'
    return null
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--bg-primary)', borderRadius: 16, width: '94vw', maxWidth: 1300,
        height: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 20px', borderBottom: '1px solid var(--border-primary)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <MapIcon size={18} style={{ color: 'var(--color-primary, #ff0033)' }} />
            <div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Conductores Disponibles</h3>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                {conductoresConUbicacion.length} con ubicacion · Selecciona diurno y nocturno
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 10px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-secondary)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#F59E0B', display: 'inline-block' }} /> Diurno
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-secondary)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3B82F6', display: 'inline-block' }} /> Nocturno
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-secondary)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981', display: 'inline-block' }} /> Sin pref.
              </span>
            </div>
            <button onClick={onClose} style={{
              background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 8,
              cursor: 'pointer', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)',
            }}>
              <X size={14} /> Cerrar
            </button>
          </div>
        </div>

        {/* Body: Sidebar + Mapa */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Sidebar */}
          <div style={{
            width: 260, flexShrink: 0, borderRight: '1px solid var(--border-primary)',
            display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)',
          }}>
            <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-primary)' }}>
              <input
                type="text"
                placeholder="Buscar nombre, DNI, zona..."
                value={searchMap}
                onChange={e => setSearchMap(e.target.value)}
                style={{
                  width: '100%', padding: '7px 10px', border: '1px solid var(--border-primary)',
                  borderRadius: 8, fontSize: 12, outline: 'none', boxSizing: 'border-box',
                  background: 'var(--bg-secondary)', color: 'var(--text-primary)',
                }}
              />
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>
                {filteredList.length} resultados
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {filteredList.map(c => {
                const color = getMarkerColor(c)
                const isActive = activeMarker === c.id
                const role = getSelectionRole(c.id)
                return (
                  <div
                    key={c.id}
                    onClick={() => handleListClick(c)}
                    style={{
                      padding: '6px 10px', cursor: 'pointer',
                      borderBottom: '1px solid var(--border-primary)',
                      background: role ? (role === 'diurno' ? 'rgba(245,158,11,0.08)' : 'rgba(59,130,246,0.08)')
                        : isActive ? 'var(--color-primary-light, rgba(255,0,51,0.05))' : 'transparent',
                      borderLeft: role ? `3px solid ${role === 'diurno' ? '#F59E0B' : '#3B82F6'}`
                        : isActive ? '3px solid var(--color-primary, #ff0033)' : '3px solid transparent',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{
                        width: 7, height: 7, borderRadius: '50%', background: color,
                        display: 'inline-block', flexShrink: 0,
                      }} />
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                        {c.apellidos}, {c.nombres}
                      </span>
                      {role && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, marginLeft: 'auto',
                          color: role === 'diurno' ? '#92400E' : '#1E40AF',
                          background: role === 'diurno' ? '#FEF3C7' : '#DBEAFE',
                          padding: '1px 5px', borderRadius: 4,
                        }}>
                          {role === 'diurno' ? 'DIURNO' : 'NOCTURNO'}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 1, marginLeft: 12 }}>
                      <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>{c.numero_dni || '-'}</span>
                      {c.zona && <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>{c.zona}</span>}
                    </div>
                    {isActive && !role && (
                      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleSelectAs(c, 'diurno') }}
                          style={{
                            flex: 1, padding: '4px', borderRadius: 5, cursor: 'pointer',
                            fontSize: 10, fontWeight: 600,
                            background: 'transparent', color: '#B45309',
                            border: '1px solid #F59E0B',
                          }}
                        >
                          Diurno
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleSelectAs(c, 'nocturno') }}
                          style={{
                            flex: 1, padding: '4px', borderRadius: 5, cursor: 'pointer',
                            fontSize: 10, fontWeight: 600,
                            background: 'transparent', color: '#1D4ED8',
                            border: '1px solid #3B82F6',
                          }}
                        >
                          Nocturno
                        </button>
                      </div>
                    )}
                    {role && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (role === 'diurno') setSelectedDiurno(null)
                          else setSelectedNocturno(null)
                        }}
                        style={{
                          marginTop: 3, padding: '2px 6px', border: '1px solid var(--border-primary)',
                          borderRadius: 4, fontSize: 9, cursor: 'pointer',
                          background: 'var(--bg-secondary)', color: 'var(--text-tertiary)',
                        }}
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                )
              })}
              {filteredList.length === 0 && (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>
                  Sin resultados
                </div>
              )}
            </div>
          </div>

          {/* Mapa */}
          <div style={{ flex: 1, position: 'relative', borderRadius: '0 0 16px 0', overflow: 'hidden' }}>
            {(loadError || (!isLoaded && mapTimeout)) ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No se pudo cargar Google Maps</span>
                <button
                  onClick={() => window.location.reload()}
                  style={{ padding: '8px 20px', background: '#ff0033', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                >
                  Reintentar
                </button>
              </div>
            ) : !isLoaded ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-tertiary)' }}>
                <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', marginRight: 8 }} /> Cargando mapa...
              </div>
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
                {conductoresConUbicacion.map(c => {
                  if (!c.direccion_lat || !c.direccion_lng) return null
                  const role = getSelectionRole(c.id)
                  const color = role === 'diurno' ? '#F59E0B' : role === 'nocturno' ? '#3B82F6' : getMarkerColor(c)
                  const isActive = activeMarker === c.id
                  return (
                    <MarkerF
                      key={c.id}
                      position={{ lat: c.direccion_lat, lng: c.direccion_lng }}
                      onClick={() => setActiveMarker(c.id)}
                      icon={{
                        path: google.maps.SymbolPath.CIRCLE,
                        fillColor: color,
                        fillOpacity: 0.9,
                        strokeColor: role ? (role === 'diurno' ? '#B45309' : '#1D4ED8') : isActive ? '#ff0033' : '#fff',
                        strokeWeight: role ? 3 : isActive ? 3 : 1.5,
                        scale: role ? 12 : isActive ? 10 : 7,
                      }}
                    >
                      {isActive && (
                        <InfoWindowF
                          position={{ lat: c.direccion_lat, lng: c.direccion_lng }}
                          onCloseClick={() => setActiveMarker(null)}
                        >
                          <div style={{ padding: '4px 2px', minWidth: 170 }}>
                            <p style={{ margin: 0, fontWeight: 700, fontSize: 13 }}>
                              {c.apellidos}, {c.nombres}
                            </p>
                            <p style={{ margin: '3px 0 0', fontSize: 11, color: '#6B7280' }}>
                              DNI: {c.numero_dni || '-'} · {formatPreferencia(c.preferencia_turno)}
                            </p>
                            {c.zona && (
                              <p style={{ margin: '2px 0 0', fontSize: 11, color: '#6B7280' }}>Zona: {c.zona}</p>
                            )}
                            {c.direccion && (
                              <p style={{ margin: '2px 0 0', fontSize: 10, color: '#9CA3AF' }}>{c.direccion}</p>
                            )}
                            {role ? (
                              <div style={{
                                marginTop: 6, padding: '5px 0', textAlign: 'center',
                                fontSize: 11, fontWeight: 600,
                                color: role === 'diurno' ? '#92400E' : '#1E40AF',
                              }}>
                                Seleccionado como {role === 'diurno' ? 'Diurno' : 'Nocturno'}
                              </div>
                            ) : (
                              <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                                <button
                                  onClick={() => handleSelectAs(c, 'diurno')}
                                  style={{
                                    flex: 1, padding: '5px', borderRadius: 6, cursor: 'pointer',
                                    fontSize: 11, fontWeight: 600,
                                    background: 'transparent', color: '#B45309',
                                    border: '1.5px solid #F59E0B',
                                  }}
                                >
                                  Diurno
                                </button>
                                <button
                                  onClick={() => handleSelectAs(c, 'nocturno')}
                                  style={{
                                    flex: 1, padding: '5px', borderRadius: 6, cursor: 'pointer',
                                    fontSize: 11, fontWeight: 600,
                                    background: 'transparent', color: '#1D4ED8',
                                    border: '1.5px solid #3B82F6',
                                  }}
                                >
                                  Nocturno
                                </button>
                              </div>
                            )}
                          </div>
                        </InfoWindowF>
                      )}
                    </MarkerF>
                  )
                })}
                {routePath.length > 0 && (
                  <PolylineF
                    path={routePath}
                    options={{
                      strokeColor: '#ff0033',
                      strokeOpacity: 0.8,
                      strokeWeight: 4,
                    }}
                  />
                )}
              </GoogleMap>
            )}

            {/* Bottom bar */}
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)',
              borderTop: '1px solid #E5E7EB', padding: '10px 16px',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              {/* Diurno slot */}
              <div style={{
                flex: 1, padding: '6px 10px', borderRadius: 8,
                border: selectedDiurno ? '2px solid #F59E0B' : '2px dashed #D1D5DB',
                background: selectedDiurno ? '#FFFBEB' : '#F9FAFB',
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#92400E', marginBottom: 2 }}>
                  <Sun size={10} style={{ verticalAlign: -1, marginRight: 3 }} />DIURNO
                </div>
                {selectedDiurno ? (
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#1F2937' }}>
                    {selectedDiurno.apellidos}, {selectedDiurno.nombres}
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: '#9CA3AF' }}>Sin seleccionar</div>
                )}
              </div>
              {/* Nocturno slot */}
              <div style={{
                flex: 1, padding: '6px 10px', borderRadius: 8,
                border: selectedNocturno ? '2px solid #3B82F6' : '2px dashed #D1D5DB',
                background: selectedNocturno ? '#EFF6FF' : '#F9FAFB',
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#1E40AF', marginBottom: 2 }}>
                  <Moon size={10} style={{ verticalAlign: -1, marginRight: 3 }} />NOCTURNO
                </div>
                {selectedNocturno ? (
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#1F2937' }}>
                    {selectedNocturno.apellidos}, {selectedNocturno.nombres}
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: '#9CA3AF' }}>Sin seleccionar</div>
                )}
              </div>
              {routeInfo && (
                <div style={{
                  padding: '6px 10px', borderRadius: 8, background: '#FEF2F2',
                  border: '1px solid #FECACA', textAlign: 'center', minWidth: 80,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#991B1B' }}>{routeInfo.distancia}</div>
                  <div style={{ fontSize: 10, color: '#B91C1C' }}>{routeInfo.duracion}</div>
                </div>
              )}
              <button
                disabled={!selectedDiurno || !selectedNocturno}
                onClick={() => {
                  if (selectedDiurno && selectedNocturno) onConfirmPair(selectedDiurno, selectedNocturno)
                }}
                style={{
                  padding: '10px 20px', border: 'none', borderRadius: 8,
                  fontSize: 12, fontWeight: 700, cursor: selectedDiurno && selectedNocturno ? 'pointer' : 'not-allowed',
                  background: selectedDiurno && selectedNocturno ? '#ff0033' : '#D1D5DB',
                  color: '#fff', whiteSpace: 'nowrap',
                }}
              >
                <Check size={14} style={{ verticalAlign: -2, marginRight: 4 }} />
                Confirmar par
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
