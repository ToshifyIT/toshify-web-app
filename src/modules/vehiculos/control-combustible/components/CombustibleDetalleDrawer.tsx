import { useEffect, useState } from 'react'
import { X, Gauge, Fuel, Clock, TrendingUp, MapPin, Calendar, Droplet } from 'lucide-react'
import { GoogleMap, useJsApiLoader, MarkerF } from '@react-google-maps/api'
import { fetchFillups } from '../../../../services/combustibleService'
import type { FuelSummary, FuelFillup } from '../types/combustible.types'
import {
  GOOGLE_MAPS_API_KEY,
  GOOGLE_MAPS_LIBRARIES,
  GOOGLE_MAPS_LANGUAGE,
  GOOGLE_MAPS_REGION,
} from '../../../../lib/googleMaps'

interface Props {
  vehiculo: FuelSummary | null
  onClose: () => void
}

interface MapaModalProps {
  fillup: FuelFillup
  onClose: () => void
}

function MapaLlenadoModal({ fillup, onClose }: MapaModalProps) {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: GOOGLE_MAPS_LIBRARIES,
    language: GOOGLE_MAPS_LANGUAGE,
    region: GOOGLE_MAPS_REGION,
  })

  if (fillup.location_lat == null || fillup.location_lng == null) return null

  const center = { lat: Number(fillup.location_lat), lng: Number(fillup.location_lng) }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.6)', zIndex: 1100,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-primary)', borderRadius: 12, width: '100%', maxWidth: 900,
          maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.3)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--border-secondary)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12,
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
              Llenado detectado · {fillup.patente}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              {new Date(fillup.fecha_evento).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              {fillup.location_direccion ? ` · ${fillup.location_direccion}` : ''}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer', padding: 4,
              color: 'var(--text-secondary)', borderRadius: 6, display: 'inline-flex',
            }}
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        {/* Mapa */}
        <div style={{ flex: 1, minHeight: 480, position: 'relative' }}>
          {loadError && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>
              Error al cargar Google Maps
            </div>
          )}
          {!isLoaded && !loadError && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>
              Cargando mapa…
            </div>
          )}
          {isLoaded && (
            <GoogleMap
              center={center}
              zoom={16}
              mapContainerStyle={{ width: '100%', height: '100%', minHeight: 480 }}
              options={{
                disableDefaultUI: false,
                streetViewControl: false,
                mapTypeControl: false,
                fullscreenControl: true,
              }}
            >
              <MarkerF position={center} />
            </GoogleMap>
          )}
        </div>

        {/* Footer con coordenadas y link externo */}
        <div style={{
          padding: '10px 20px', borderTop: '1px solid var(--border-secondary)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: 11, color: 'var(--text-tertiary)',
        }}>
          <span>
            <MapPin size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
            {center.lat.toFixed(5)}, {center.lng.toFixed(5)}
          </span>
          <a
            href={`https://www.google.com/maps?q=${center.lat},${center.lng}`}
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--blue, #2563eb)', textDecoration: 'none', fontSize: 11 }}
          >
            Abrir en Google Maps ↗
          </a>
        </div>
      </div>
    </div>
  )
}

function formatFechaLarga(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function CombustibleDetalleDrawer({ vehiculo, onClose }: Props) {
  const [fillups, setFillups] = useState<FuelFillup[]>([])
  const [loading, setLoading] = useState(false)
  const [mapaFillup, setMapaFillup] = useState<FuelFillup | null>(null)

  useEffect(() => {
    if (!vehiculo?.vehiculo_id) {
      setFillups([])
      return
    }
    setLoading(true)
    fetchFillups({ vehiculoId: vehiculo.vehiculo_id })
      .then(setFillups)
      .finally(() => setLoading(false))
  }, [vehiculo?.vehiculo_id])

  if (!vehiculo) return null

  const v = vehiculo.vehiculo
  const modelo = v ? `${v.marca || ''} ${v.modelo || ''}`.trim() : ''
  const rendimiento = Number(vehiculo.rendimiento_km_litro) || 0
  const ralentiPct = Number(vehiculo.ralenti_pct) || 0
  const rendimientoColor = rendimiento >= 10 ? '#16a34a' : rendimiento >= 7 ? '#ea580c' : '#dc2626'
  const ralentiColor = ralentiPct > 20 ? '#dc2626' : ralentiPct > 10 ? '#ea580c' : '#16a34a'

  return (
    <>
      <div className="alerta-drawer-overlay" onClick={onClose} />
      <aside className="alerta-drawer alerta-drawer-wide">
        {/* HEADER */}
        <div className="alerta-drawer-header">
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: 2 }}>
            <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
              {vehiculo.patente}
            </span>
            {modelo && (
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                {modelo}{v?.gnc ? ' · GNC' : ''}
              </span>
            )}
          </div>
          <button className="alerta-drawer-close" onClick={onClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <div className="alerta-drawer-body">

          {/* Período */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-tertiary)' }}>
            <Calendar size={12} />
            Últimos {vehiculo.periodo_dias} días · {formatFechaLarga(vehiculo.fecha_desde)} → {formatFechaLarga(vehiculo.fecha_hasta)}
          </div>

          {/* MÉTRICAS DEL PERÍODO */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
              Resumen del período
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {/* Distancia */}
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <Gauge size={14} style={{ color: 'var(--text-tertiary)' }} />
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.3 }}>Distancia</span>
                </div>
                <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {Number(vehiculo.distancia_km).toLocaleString('es-AR')} km
                </div>
              </div>

              {/* Combustible */}
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <Fuel size={14} style={{ color: 'var(--text-tertiary)' }} />
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.3 }}>Combustible</span>
                </div>
                {vehiculo.tiene_telemetria ? (
                  <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {Number(vehiculo.combustible_litros).toFixed(2)} L
                  </div>
                ) : (
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Sin telemetría OBD</span>
                )}
              </div>

              {/* Rendimiento */}
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <TrendingUp size={14} style={{ color: 'var(--text-tertiary)' }} />
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.3 }}>Rendimiento</span>
                </div>
                {rendimiento > 0 && rendimiento <= 100 ? (
                  <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 18, fontWeight: 700, color: rendimientoColor }}>
                    {rendimiento.toFixed(2)} km/L
                  </div>
                ) : (
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Datos insuficientes</span>
                )}
              </div>

              {/* Ralentí */}
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <Clock size={14} style={{ color: 'var(--text-tertiary)' }} />
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.3 }}>Ralentí</span>
                </div>
                {vehiculo.tiene_telemetria && Number(vehiculo.ralenti_litros) > 0 ? (
                  <>
                    <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 16, fontWeight: 700, color: ralentiColor }}>
                      {Number(vehiculo.ralenti_litros).toFixed(2)} L
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                      {ralentiPct.toFixed(0)}% del consumo total
                    </div>
                  </>
                ) : (
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>—</span>
                )}
              </div>
            </div>

            {/* Nivel actual del tanque (KPI ancho completo) */}
            {(() => {
              const pct = vehiculo.nivel_actual_pct
              if (pct == null) return null
              const nivelColor = pct < 20 ? '#dc2626' : pct < 40 ? '#ea580c' : '#16a34a'
              return (
                <div style={{
                  marginTop: 10,
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-secondary)',
                  borderRadius: 8,
                  padding: 14,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <Droplet size={14} style={{ color: 'var(--text-tertiary)' }} />
                    <span style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                      Nivel actual del tanque
                    </span>
                    {vehiculo.nivel_actual_fecha && (
                      <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
                        {formatFechaLarga(vehiculo.nivel_actual_fecha)}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 24, fontWeight: 700, color: nivelColor }}>
                      {pct.toFixed(1)}%
                    </span>
                    <div style={{ flex: 1, height: 10, background: 'var(--bg-primary)', borderRadius: 5, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: nivelColor, borderRadius: 5 }} />
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>

          {/* LLENADOS DETECTADOS */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
              Llenados detectados ({fillups.length})
            </div>
            {loading ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>Cargando...</div>
            ) : fillups.length === 0 ? (
              <div style={{
                padding: 20, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12,
                background: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)', borderRadius: 8,
              }}>
                No se detectaron llenados en este vehículo.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {fillups.map(f => {
                  const subida = f.subida_pct
                  const vol = f.volume_litros || f.derived_volume_litros
                  return (
                    <div
                      key={f.id}
                      style={{
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-secondary)',
                        borderRadius: 8,
                        padding: 12,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 6 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                          {formatFechaLarga(f.fecha_evento)}
                        </div>
                        {subida != null && (
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#16a34a', fontFamily: 'ui-monospace, monospace' }}>
                            +{subida.toFixed(1)}%
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                        {f.tank_nivel_min_pct != null && f.tank_nivel_max_pct != null && (
                          <div>
                            <span style={{ color: 'var(--text-tertiary)' }}>Tanque:</span>{' '}
                            <strong>{f.tank_nivel_min_pct.toFixed(1)}% → {f.tank_nivel_max_pct.toFixed(1)}%</strong>
                          </div>
                        )}
                        {vol != null && vol > 0 && (
                          <div>
                            <span style={{ color: 'var(--text-tertiary)' }}>Volumen:</span>{' '}
                            <strong>{vol.toFixed(2)} L</strong>
                          </div>
                        )}
                        {f.odometro_metros != null && (
                          <div>
                            <span style={{ color: 'var(--text-tertiary)' }}>Odómetro:</span>{' '}
                            <strong>{Math.round(f.odometro_metros / 1000).toLocaleString('es-AR')} km</strong>
                          </div>
                        )}
                      </div>
                      {(f.location_lat != null && f.location_lng != null) && (
                        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-tertiary)' }}>
                          <MapPin size={11} />
                          {f.location_direccion || `${f.location_lat.toFixed(5)}, ${f.location_lng.toFixed(5)}`}
                          <button
                            onClick={() => setMapaFillup(f)}
                            style={{
                              background: 'transparent', border: 'none', cursor: 'pointer',
                              color: 'var(--blue, #2563eb)', fontSize: 11, padding: 0,
                              marginLeft: 4, textDecoration: 'underline',
                            }}
                          >
                            ver en mapa →
                          </button>
                        </div>
                      )}
                      {f.confidence && (
                        <div style={{ marginTop: 6 }}>
                          <span className="dt-badge dt-badge-gray" style={{ fontSize: 9 }}>
                            Confianza: {f.confidence}
                          </span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Última sincronización */}
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textAlign: 'center', paddingTop: 8 }}>
            Última sincronización: {formatFechaLarga(vehiculo.synced_at)}
          </div>
        </div>
      </aside>

      {/* Modal con mapa interno cuando se hace click en "ver en mapa" */}
      {mapaFillup && (
        <MapaLlenadoModal fillup={mapaFillup} onClose={() => setMapaFillup(null)} />
      )}
    </>
  )
}
