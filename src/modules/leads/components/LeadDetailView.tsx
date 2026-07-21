// src/modules/leads/components/LeadDetailView.tsx
import { useState, useEffect, useRef } from 'react'
import { MessageCircle, Video, UserPlus, Edit2, MapPin, AlertTriangle, ExternalLink, RefreshCw } from 'lucide-react'
import { GoogleMap, Marker, Polygon } from '@react-google-maps/api'
import type { Lead } from '../../../types/leads.types'
import { GOOGLE_MAPS_SCRIPT_URL } from '../../../lib/googleMaps'
import '../LeadsModule.css'

const detailMapStyle = {
  width: '100%',
  height: '220px',
  borderRadius: '8px',
}

function loadGoogleMapsAPI(): Promise<void> {
  return new Promise((resolve, reject) => {
    // Con loading=async, google.maps.Map NO está disponible inmediatamente
    // después del onload del script — hay que importar las libs explícitamente
    // vía google.maps.importLibrary(...). Esta función espera a que estén listas.
    const ensureMapLib = async () => {
      const g = (window as any).google
      // Path síncrono: la clase Map ya está disponible (loader viejo, o lib ya importada)
      if (g?.maps?.Map) {
        resolve()
        return
      }
      // Path async (URL con loading=async): importar las libs que usa el módulo
      if (g?.maps?.importLibrary) {
        try {
          await Promise.all([
            g.maps.importLibrary('maps'),
            g.maps.importLibrary('places'),
            g.maps.importLibrary('geocoding'),
          ])
          resolve()
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)))
        }
        return
      }
      // El script aún cargando — reintentar en 50ms
      setTimeout(ensureMapLib, 50)
    }

    if ((window as any).google?.maps) {
      ensureMapLib()
      return
    }
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]')
    if (existingScript) {
      existingScript.addEventListener('load', () => ensureMapLib())
      return
    }
    const script = document.createElement('script')
    script.src = GOOGLE_MAPS_SCRIPT_URL
    script.async = true
    script.onload = () => ensureMapLib()
    script.onerror = () => reject(new Error('Error cargando Google Maps'))
    document.head.appendChild(script)
  })
}

interface ZonaRestringida {
  id: string
  nombre: string
  poligono: { lat: number; lng: number }[]
}

function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '-'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return '-'
    const day = d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' })
    const time = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' })
    return `${day} ${time}`
  } catch { return '-' }
}

function getProcesoClass(proceso: string | undefined | null): string {
  if (!proceso) return 'lead-estado-pendiente'
  const p = proceso.toLowerCase()
  if (p.includes('ex conductor')) return 'lead-estado-ex-conductor'
  if (p.includes('descartado')) return 'lead-estado-descartado'
  if (p.includes('convertido')) return 'lead-estado-convertido'
  if (p.includes('proceso')) return 'lead-estado-proceso'
  return 'lead-estado-pendiente'
}

// Etiqueta visible del estado del lead. "No cumple edad" se muestra como "Descartado".
// Es SOLO visual: el valor real (estado_de_lead) no cambia, y los conteos/filtros
// siguen usando el estado real, no esta etiqueta.
function displayEstadoLead(estado: string | undefined | null): string {
  if (estado === 'No cumple edad') return 'Descartado'
  return estado || '-'
}

/** Clasifica causal_de_cierre en motivo legible (solo para "No le interesa") */
function clasificarMotivoDesinteres(causal: string | null | undefined): string {
  if (!causal) return 'Otro'
  const t = causal.toLowerCase()
  if (/price|precio|caro|costoso|plata|alcanza|expensive|cost|dinero|pagar|cobr|tarifa|alquiler/.test(t)) return 'Precio de alquiler'
  if (/disagreement|condicion|turno|conviene|oferta|acuerdo|horario|regla|requisito|policy|condition|schedule/.test(t)) return 'Desacuerdo con oferta'
  return 'Otro'
}

interface LeadDetailViewProps {
  lead: Lead
  onEdit?: () => void
  onConvert?: () => void
  zonasRestringidas?: ZonaRestringida[]
  enZonaRestringida?: string | null
  onRecalcularUbicacion?: (lead: Lead) => Promise<void>
}

export function LeadDetailView({ lead, onEdit, onConvert, zonasRestringidas = [], enZonaRestringida, onRecalcularUbicacion }: LeadDetailViewProps) {
  const mapRef = useRef<google.maps.Map | null>(null)
  const [recalculando, setRecalculando] = useState(false)

  const handleRecenter = () => {
    if (mapRef.current && lead.direccion_latitud != null && lead.direccion_longitud != null) {
      mapRef.current.panTo({ lat: lead.direccion_latitud, lng: lead.direccion_longitud })
      mapRef.current.setZoom(14)
    }
  }

  const handleRecalcular = async () => {
    if (!onRecalcularUbicacion || recalculando) return
    setRecalculando(true)
    try {
      await onRecalcularUbicacion(lead)
    } finally {
      setRecalculando(false)
    }
  }

  return (
    <div className="lead-detail">
      <div className="lead-detail-header">
        <div>
          <p className="lead-detail-id">ID: {lead.id.slice(0, 8)}...</p>
          <h3>{lead.nombre_completo || 'Sin nombre'}</h3>
          {lead.proceso && (
            <span className={`lead-estado-badge ${getProcesoClass(lead.proceso)}`} style={{ marginTop: '4px' }}>
              {lead.proceso}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className={`btn-sm ${lead.id_lead?.trim() ? 'btn-primary' : 'btn-secondary'}`}
            disabled={!lead.id_lead?.trim()}
            onClick={() => { if (lead.id_lead?.trim()) window.open(`https://app.intercom.com/a/apps/ogv74k5c/users/${lead.id_lead}`, '_blank') }}
            title={lead.id_lead?.trim() ? 'Abrir en Intercom' : 'Sin ID de Intercom'}
          >
            <MessageCircle size={14} /> Ver Perfil Intercom
          </button>
          {(() => {
            const guiaMap: Record<string, string> = { marina: '687169f1bda19bb1e7faa1bc', manuel: '6877eeff3042007628cd1ad7' }
            const entrevistador = (lead.entrevistador_asignado || '').trim().toLowerCase()
            const idGuia = guiaMap[entrevistador] || null
            const idHireflix = lead.id_hireflix?.trim() || null
            const faltantes: string[] = []
            if (!idGuia) faltantes.push('No tiene guia asignado')
            if (!idHireflix) faltantes.push('No tiene videocuestionario')
            const habilitado = !!idGuia && !!idHireflix
            const url = habilitado ? `https://admin.hireflix.com/es/jobs/${idGuia}/interview/${idHireflix}` : ''
            return (
              <span style={{ position: 'relative', display: 'inline-block' }} className="hireflix-btn-wrapper">
                <button
                  className={`btn-sm ${habilitado ? 'btn-primary' : 'btn-secondary'}`}
                  disabled={!habilitado}
                  onClick={() => { if (habilitado) window.open(url, '_blank') }}
                >
                  <Video size={14} /> Ver Videocuestionario
                </button>
                {!habilitado && (
                  <div className="hireflix-tooltip">
                    {faltantes.map((f, i) => <div key={i}>{f}</div>)}
                  </div>
                )}
              </span>
            )
          })()}
          {onConvert && (
            <button className="btn-primary btn-sm" onClick={onConvert}>
              <UserPlus size={14} /> Convertir a Conductor
            </button>
          )}
          {onEdit && (
            <button className="btn-secondary btn-sm" onClick={onEdit}>
              <Edit2 size={14} /> Editar
            </button>
          )}
        </div>
      </div>

      <div className="lead-detail-cards">
        {/* Datos Personales */}
        <div className="lead-detail-card">
          <div className="lead-detail-card-title">Datos Personales</div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">DNI</span>
            <span className="lead-detail-item-value">{lead.dni || '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">CUIT</span>
            <span className="lead-detail-item-value">{lead.cuit || '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Edad</span>
            <span className="lead-detail-item-value">{lead.edad ?? '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Fecha Nacimiento</span>
            <span className="lead-detail-item-value">{formatDate(lead.fecha_de_nacimiento)}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Nacionalidad</span>
            <span className="lead-detail-item-value">{lead.nacionalidad || '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Estado Civil</span>
            <span className="lead-detail-item-value">{lead.estado_civil || '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Antecedentes Penales</span>
            <span className="lead-detail-item-value">{lead.antecedentes_penales === true ? 'Si' : lead.antecedentes_penales === false ? 'No' : '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Experiencia Previa</span>
            <span className="lead-detail-item-value">{lead.experiencia_previa || '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Experiencia Manejo</span>
            <span className="lead-detail-item-value">{lead.experiencia_manejo || '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Disponibilidad</span>
            <span className="lead-detail-item-value">{lead.disponibilidad || '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">BCRA</span>
            <span className="lead-detail-item-value">{lead.bcra || '-'}</span>
          </div>
        </div>

        {/* Contacto */}
        <div className="lead-detail-card">
          <div className="lead-detail-card-title">Contacto y Dirección</div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Teléfono</span>
            <span className="lead-detail-item-value">{lead.phone || '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">WhatsApp</span>
            <span className="lead-detail-item-value">{lead.whatsapp_number || '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Email</span>
            <span className="lead-detail-item-value">{lead.email || '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Zona</span>
            <span className="lead-detail-item-value">{lead.zona || '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Dirección</span>
            <span className="lead-detail-item-value" style={{ fontSize: '12px' }}>
              {lead.direccion && lead.direccion_latitud != null && lead.direccion_longitud != null ? (
                <span
                  onClick={handleRecenter}
                  style={{ color: 'var(--color-primary)', cursor: 'pointer' }}
                >
                  {lead.direccion}
                </span>
              ) : (lead.direccion || '-')}
            </span>
          </div>
          {lead.direccion_latitud != null && lead.direccion_longitud != null && (
            <>
              <LeadDetailMap
                lat={lead.direccion_latitud}
                lng={lead.direccion_longitud}
                zonasRestringidas={zonasRestringidas}
                enZonaRestringida={!!enZonaRestringida}
                nombreZona={enZonaRestringida || undefined}
                mapRef={mapRef}
              />
              {lead.direccion && onRecalcularUbicacion && (
                <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={handleRecalcular}
                    disabled={recalculando}
                    style={{ fontSize: '11px', color: 'var(--color-primary)', background: 'none', border: '1px solid var(--color-primary)', borderRadius: '6px', padding: '3px 8px', cursor: recalculando ? 'default' : 'pointer', opacity: recalculando ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <RefreshCw size={12} /> {recalculando ? 'Recalculando...' : 'Recalcular ubicación'}
                  </button>
                  {lead.direccion_geocode_estado === 'aproximado' && (
                    <span style={{ fontSize: '11px', color: '#B45309' }}>Ubicación aproximada</span>
                  )}
                </div>
              )}
            </>
          )}
          {lead.direccion && lead.direccion_latitud == null && lead.direccion_geocode_estado !== 'sin_resultado' && (
            <div style={{ marginTop: '8px', padding: '8px 12px', background: '#FEF3C7', borderRadius: '6px', fontSize: '11px', color: '#92400E', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <MapPin size={12} /> Geocodificando dirección...
            </div>
          )}
          {lead.direccion && lead.direccion_latitud == null && lead.direccion_geocode_estado === 'sin_resultado' && (
            <div style={{ marginTop: '8px', padding: '8px 12px', background: '#FEF3C7', borderRadius: '6px', fontSize: '11px', color: '#92400E', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <MapPin size={12} /> No se pudo ubicar la dirección
              </span>
              {onRecalcularUbicacion && (
                <button
                  type="button"
                  onClick={handleRecalcular}
                  disabled={recalculando}
                  style={{ fontSize: '11px', color: '#92400E', background: 'none', border: '1px solid #92400E', borderRadius: '6px', padding: '3px 8px', cursor: recalculando ? 'default' : 'pointer', opacity: recalculando ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <RefreshCw size={12} /> {recalculando ? 'Recalculando...' : 'Reintentar'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Proceso */}
        <div className="lead-detail-card">
          <div className="lead-detail-card-title">Proceso y Evaluación</div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Estado de Lead</span>
            <span className="lead-detail-item-value">{displayEstadoLead(lead.estado_de_lead)}</span>
          </div>
          {lead.estado_de_lead === 'No le interesa' && (
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Motivo Desinterés</span>
            <span className="lead-detail-item-value">
              {clasificarMotivoDesinteres(lead.causal_de_cierre)}
              {lead.motivo_desinteres && (
                <span> - {lead.motivo_desinteres}</span>
              )}
              {lead.causal_de_cierre && lead.causal_de_cierre !== clasificarMotivoDesinteres(lead.causal_de_cierre) && (
                <span style={{ display: 'block', fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>({lead.causal_de_cierre})</span>
              )}
            </span>
          </div>
          )}
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Fuente</span>
            <span className="lead-detail-item-value">{lead.fuente_de_lead || '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Guia</span>
            <span className="lead-detail-item-value">{lead.entrevistador_asignado || '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Detalle Hireflix</span>
            <span className="lead-detail-item-value" style={{ whiteSpace: 'pre-wrap', maxWidth: '300px', textAlign: 'right' }}>{lead.resumen_hireflix || '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Observaciones</span>
            <span className="lead-detail-item-value" style={{ whiteSpace: 'pre-wrap', maxWidth: '300px', textAlign: 'right' }}>{lead.observaciones || '-'}</span>
          </div>
        </div>

        {/* Documentación */}
        <div className="lead-detail-card">
          <div className="lead-detail-card-title">Documentación</div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Licencia</span>
            <span className="lead-detail-item-value">{lead.licencia || '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Nro. Licencia</span>
            <span className="lead-detail-item-value">{lead.numero_licencia || '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Categorías</span>
            <span className="lead-detail-item-value">{lead.categorias_licencia?.length ? lead.categorias_licencia.join(', ') : '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Estado Licencia</span>
            <span className="lead-detail-item-value">{lead.estado_licencia || '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Tipo Licencia</span>
            <span className="lead-detail-item-value">{lead.tipo_licencia || '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Venc. Licencia</span>
            <span className="lead-detail-item-value">{formatDate(lead.vencimiento_licencia)}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">RNR</span>
            <span className="lead-detail-item-value">{lead.rnr || '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Monotributo</span>
            <span className="lead-detail-item-value">{lead.monotributo || '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">CBU</span>
            <span className="lead-detail-item-value" style={{ fontSize: '11px', fontFamily: 'monospace' }}>{lead.cbu || '-'}</span>
          </div>
          <div className="lead-detail-item">
            <span className="lead-detail-item-label">Cta. Cabify</span>
            <span className="lead-detail-item-value">{lead.cuenta_cabify || '-'}</span>
          </div>
        </div>
      </div>

      {/* Emergencia */}
      {(lead.datos_de_emergencia || lead.telefono_emergencia || lead.contacto_de_emergencia || lead.direccion_emergencia || lead.verificacion_emergencia != null) && (
        <div className="lead-detail-description">
          <div className="lead-detail-description-title">Contacto de Emergencia</div>
          <p>
            {lead.datos_de_emergencia || lead.contacto_de_emergencia || '-'}
            {lead.telefono_emergencia ? ` · Tel: ${lead.telefono_emergencia}` : ''}
            {lead.parentesco_emergencia ? ` · ${lead.parentesco_emergencia}` : ''}
            {lead.direccion_emergencia ? ` · Dir: ${lead.direccion_emergencia}` : ''}
          </p>
          <p style={{ marginTop: '4px', fontSize: '12px', color: lead.verificacion_emergencia ? '#16a34a' : '#dc2626' }}>
            Verificación de contacto de emergencia: {lead.verificacion_emergencia ? 'Sí' : 'No'}
          </p>
        </div>
      )}
    </div>
  )
}

// =====================================================
// LEAD DETAIL MAP (mapa interactivo con zonas restringidas)
// =====================================================

interface LeadDetailMapProps {
  lat: number
  lng: number
  zonasRestringidas: ZonaRestringida[]
  enZonaRestringida: boolean
  nombreZona?: string
  mapRef?: React.MutableRefObject<google.maps.Map | null>
}

function LeadDetailMap({ lat, lng, zonasRestringidas, enZonaRestringida, nombreZona, mapRef }: LeadDetailMapProps) {
  const [mapsReady, setMapsReady] = useState(false)

  useEffect(() => {
    if ((window as any).google?.maps) {
      setMapsReady(true)
      return
    }
    // Cargar el script si aún no está
    loadGoogleMapsAPI().then(() => setMapsReady(true)).catch(() => {})
  }, [])

  if (!mapsReady) {
    return (
      <div style={{ marginTop: '8px', height: '220px', borderRadius: '8px', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Cargando mapa...</span>
      </div>
    )
  }

  return (
    <div style={{ marginTop: '8px' }}>
      {enZonaRestringida && nombreZona && (
        <div style={{ marginBottom: '6px', padding: '6px 10px', background: 'var(--badge-red-bg)', borderRadius: '6px', border: '1px solid var(--badge-red-text)', fontSize: '12px', color: 'var(--badge-red-text)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <AlertTriangle size={14} /> Zona Restringida: {nombreZona}
        </div>
      )}
      <div style={{ borderRadius: '8px', overflow: 'hidden', border: `2px solid ${enZonaRestringida ? 'var(--color-primary)' : 'var(--badge-green-text)'}` }}>
        <GoogleMap
          mapContainerStyle={detailMapStyle}
          center={{ lat, lng }}
          zoom={14}
          onLoad={(map) => { if (mapRef) mapRef.current = map }}
          onUnmount={() => { if (mapRef) mapRef.current = null }}
          options={{
            disableDefaultUI: true,
            zoomControl: true,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
          }}
        >
          <Marker
            position={{ lat, lng }}
            icon={{
              path: 0, // google.maps.SymbolPath.CIRCLE
              scale: 10,
              fillColor: enZonaRestringida ? '#FF0033' : '#22C55E',
              fillOpacity: 1,
              strokeColor: '#FFFFFF',
              strokeWeight: 3,
            }}
            title={enZonaRestringida ? 'Zona Restringida' : 'Ubicación del lead'}
          />
          {zonasRestringidas.map(zona => (
            zona.poligono && (
              <Polygon
                key={zona.id}
                paths={zona.poligono.map(p => ({ lat: p.lat, lng: p.lng }))}
                options={{
                  fillColor: '#FF0033',
                  fillOpacity: 0.15,
                  strokeColor: '#FF0033',
                  strokeOpacity: 0.6,
                  strokeWeight: 2,
                }}
              />
            )
          ))}
        </GoogleMap>
      </div>
      <div style={{ marginTop: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {!enZonaRestringida ? (
          <span style={{ fontSize: '11px', color: '#16A34A', fontWeight: 500 }}>Zona Aprobada</span>
        ) : <span />}
        <a
          href={`https://www.google.com/maps?q=${lat},${lng}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: '11px', color: 'var(--color-primary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          <ExternalLink size={12} /> Abrir en Google Maps
        </a>
      </div>
    </div>
  )
}

export type { LeadDetailViewProps }
