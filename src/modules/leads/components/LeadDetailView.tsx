// src/modules/leads/components/LeadDetailView.tsx
import { useState, useEffect, useRef, type ReactNode } from 'react'
import { Video, UserPlus, Edit2, MapPin, AlertTriangle, ExternalLink, RefreshCw } from 'lucide-react'
import { GoogleMap, Marker, Polygon } from '@react-google-maps/api'
import type { Lead } from '../../../types/leads.types'
import { TabsBar, type TabsBarItem } from '../../../components/ui/TabsBar'
import { GOOGLE_MAPS_SCRIPT_URL } from '../../../lib/googleMaps'
import { useConductoresEmbajador } from '../../../hooks/useConductoresEmbajador'
import { clasificarMotivoDesinteres } from '../leadMotivos'
import { estadoMonotributo } from '../monotributo'
import '../LeadsModule.css'

const detailMapStyle = {
  width: '100%',
  height: '170px',
  borderRadius: 'var(--radius-md)',
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

// `fecha_de_nacimiento` y `vencimiento_licencia` son columnas date-only ("YYYY-MM-DD").
// Antes se formateaban con new Date(...) + timeZone de AR: eso interpreta el valor como
// medianoche UTC y al pasarlo a UTC-3 cae el DIA ANTERIOR a las 21:00 (por eso se veia
// "11/01/1994 21:00" para un nacimiento del 12/01/1994). Se leen los componentes del
// texto, sin construir un Date, que es el mismo criterio que usa formatDateOnly en
// LeadsModule.
function parseDateOnly(dateStr: string | undefined | null): { y: number; m: number; d: number } | null {
  if (!dateStr) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr))
  if (!match) return null
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) }
}

function formatDateOnly(dateStr: string | undefined | null): string {
  const p = parseDateOnly(dateStr)
  if (!p) return '-'
  return `${String(p.d).padStart(2, '0')}/${String(p.m).padStart(2, '0')}/${p.y}`
}

/** Edad en años cumplidos a partir de la fecha de nacimiento. null si no se puede calcular. */
function calcularEdad(dateStr: string | undefined | null): number | null {
  const p = parseDateOnly(dateStr)
  if (!p) return null
  const hoy = new Date()
  let edad = hoy.getFullYear() - p.y
  const difMes = hoy.getMonth() + 1 - p.m
  if (difMes < 0 || (difMes === 0 && hoy.getDate() < p.d)) edad--
  return edad >= 0 && edad < 120 ? edad : null
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

type PestanaFicha = 'personal' | 'contacto' | 'documentos' | 'operativo' | 'proceso'

/** Mismas partes y orden que el formulario de carga (LeadWizard). */
const PESTANAS_FICHA: TabsBarItem<PestanaFicha>[] = [
  { id: 'personal', label: 'Personal' },
  { id: 'contacto', label: 'Contacto' },
  { id: 'documentos', label: 'Documentos' },
  { id: 'operativo', label: 'Operativo' },
  { id: 'proceso', label: 'Proceso' },
]

const siNo = (v: boolean | null | undefined) => (v === true ? 'Sí' : v === false ? 'No' : null)

function Tarjeta({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="lead-detail-card">
      <div className="lead-detail-card-title">{titulo}</div>
      {children}
    </div>
  )
}

/** Fila etiqueta / valor. `largo`: textos de varias líneas. Vacío = guion. */
function Item({ label, valor, largo, mono }: {
  label: string
  valor: ReactNode | null | undefined
  largo?: boolean
  mono?: boolean
}) {
  const vacio = valor === null || valor === undefined || valor === '' || valor === '-'
  return (
    <div className={`lead-detail-item${largo ? ' lead-detail-item--largo' : ''}`}>
      <span className="lead-detail-item-label">{label}</span>
      <span
        className={`lead-detail-item-value${vacio ? ' lead-detail-item-value--vacio' : ''}`}
        style={mono ? { fontSize: '11px', fontFamily: 'var(--font-mono)' } : undefined}
      >
        {vacio ? '-' : valor}
      </span>
    </div>
  )
}

/** Dato del resumen de arriba. */
function Dato({ label, valor, tono }: { label: string; valor: ReactNode; tono?: 'bien' | 'mal' }) {
  return (
    <div className={`lead-detail-dato${tono ? ` lead-detail-dato--${tono}` : ''}`}>
      <span className="lead-detail-dato-label">{label}</span>
      <span className="lead-detail-dato-valor" title={typeof valor === 'string' ? valor : undefined}>{valor}</span>
    </div>
  )
}

interface LeadDetailViewProps {
  lead: Lead
  onEdit?: () => void
  onConvert?: () => void
  zonasRestringidas?: ZonaRestringida[]
  enZonaRestringida?: string | null
  onRecalcularUbicacion?: (lead: Lead) => Promise<void>
  /** Botón "Ver Videocuestionario" (Hireflix). Distribución en mapa lo oculta. */
  mostrarVideocuestionario?: boolean
}

export function LeadDetailView({ lead, onEdit, onConvert, zonasRestringidas = [], enZonaRestringida, onRecalcularUbicacion, mostrarVideocuestionario = true }: LeadDetailViewProps) {
  const mapRef = useRef<google.maps.Map | null>(null)
  const [recalculando, setRecalculando] = useState(false)
  const { nombrePorId: embajadorPorId } = useConductoresEmbajador()
  const [pestana, setPestana] = useState<PestanaFicha>('personal')

  const handleRecenter = () => {
    if (mapRef.current && lead.latitud != null && lead.longitud != null) {
      mapRef.current.panTo({ lat: lead.latitud, lng: lead.longitud })
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

  const mapaYUbicacion = (
    <>
      {lead.latitud != null && lead.longitud != null && (
        <>
          <LeadDetailMap
            lat={lead.latitud}
            lng={lead.longitud}
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
                style={{ fontSize: '11px', color: 'var(--color-primary)', background: 'none', border: '1px solid var(--color-primary)', borderRadius: 'var(--radius-sm)', padding: '3px 8px', cursor: recalculando ? 'default' : 'pointer', opacity: recalculando ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '4px' }}
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
      {lead.direccion && lead.latitud == null && lead.direccion_geocode_estado !== 'sin_resultado' && (
        <div style={{ marginTop: '8px', padding: '8px 12px', background: '#FEF3C7', borderRadius: 'var(--radius-sm)', fontSize: '11px', color: '#92400E', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <MapPin size={12} /> Geocodificando dirección...
        </div>
      )}
      {lead.direccion && lead.latitud == null && lead.direccion_geocode_estado === 'sin_resultado' && (
        <div style={{ marginTop: '8px', padding: '8px 12px', background: '#FEF3C7', borderRadius: 'var(--radius-sm)', fontSize: '11px', color: '#92400E', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <MapPin size={12} /> No se pudo ubicar la dirección
          </span>
          {onRecalcularUbicacion && (
            <button
              type="button"
              onClick={handleRecalcular}
              disabled={recalculando}
              style={{ fontSize: '11px', color: '#92400E', background: 'none', border: '1px solid #92400E', borderRadius: 'var(--radius-sm)', padding: '3px 8px', cursor: recalculando ? 'default' : 'pointer', opacity: recalculando ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <RefreshCw size={12} /> {recalculando ? 'Recalculando...' : 'Reintentar'}
            </button>
          )}
        </div>
      )}
    </>
  )

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
          {mostrarVideocuestionario && (() => {
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

      {/* Resumen: lo que más se mira, visible en todas las pestañas */}
      <div className="lead-detail-resumen">
        <Dato label="Estado" valor={displayEstadoLead(lead.estado_de_lead)} />
        <Dato
          label="Zona"
          valor={lead.latitud != null && lead.longitud != null
            ? (enZonaRestringida ? `Restringida · ${lead.zona || '-'}` : `Aprobada · ${lead.zona || '-'}`)
            : (lead.zona || '-')}
          tono={lead.latitud != null && lead.longitud != null ? (enZonaRestringida ? 'mal' : 'bien') : undefined}
        />
        <Dato label="Turno" valor={lead.turno || '-'} />
        <Dato label="Licencia" valor={lead.licencia || '-'} />
        <Dato label="Teléfono" valor={lead.phone || lead.whatsapp_number || '-'} />
        <Dato label="Guía" valor={lead.entrevistador_asignado || '-'} />
      </div>

      {/* Mismas partes que el formulario de carga (LeadWizard) */}
      <TabsBar tabs={PESTANAS_FICHA} active={pestana} onChange={setPestana} className="tabs-bar--modal" ariaLabel="Secciones del lead" />

      <div className="lead-detail-cards">
        {pestana === 'personal' && (
          <>
            <Tarjeta titulo="Identidad">
              <Item label="DNI" valor={lead.dni} />
              <Item label="CUIT" valor={lead.cuit} />
              <Item label="Fecha de nacimiento" valor={formatDateOnly(lead.fecha_de_nacimiento)} />
              <Item label="Edad" valor={calcularEdad(lead.fecha_de_nacimiento) ?? lead.edad} />
              <Item label="Nacionalidad" valor={lead.nacionalidad} />
              <Item label="Estado civil" valor={lead.estado_civil} />
              <Item label="Sede" valor={lead.sede} />
            </Tarjeta>
            <Tarjeta titulo="Perfil">
              <Item label="Antecedentes penales" valor={siNo(lead.antecedentes_penales)} />
              <Item label="Experiencia previa" valor={lead.experiencia_previa} />
              <Item label="Experiencia de manejo" valor={lead.experiencia_manejo} largo />
              <Item label="Disponibilidad" valor={lead.disponibilidad} />
              <Item label="BCRA" valor={lead.bcra} />
              <Item label="Monotributo" valor={lead.monotributo} />
              {estadoMonotributo(lead.monotributo) === 'no' && (
                <Item label="Motivo sin monotributo" valor={lead.motivo_sin_monotributo} largo />
              )}
            </Tarjeta>
          </>
        )}

        {pestana === 'contacto' && (
          <>
            <Tarjeta titulo="Contacto">
              <Item label="Teléfono (WhatsApp)" valor={lead.phone || lead.whatsapp_number} />
              <Item label="Teléfono secundario" valor={lead.telefono_secundario} />
              <Item label="Email app (Cabify)" valor={lead.email} />
              <Item label="Mail de respaldo" valor={lead.mail_de_respaldo} />
              <div className="lead-detail-subtitulo">Contacto de emergencia</div>
              <Item label="Nombre" valor={lead.contacto_de_emergencia || lead.datos_de_emergencia} />
              <Item label="Teléfono" valor={lead.telefono_emergencia} />
              <Item label="Parentesco" valor={lead.parentesco_emergencia} />
              <Item label="Dirección" valor={lead.direccion_emergencia} largo />
              <Item
                label="Verificado"
                valor={lead.verificacion_emergencia == null ? null : lead.verificacion_emergencia ? 'Sí' : 'No'}
              />
            </Tarjeta>
            <Tarjeta titulo="Dirección">
              <Item label="Zona" valor={lead.zona} />
              <div className="lead-detail-item">
                <span className="lead-detail-item-label">Dirección</span>
                <span className="lead-detail-item-value">
                  {lead.direccion && lead.latitud != null && lead.longitud != null ? (
                    <span onClick={handleRecenter} style={{ color: 'var(--color-primary)', cursor: 'pointer' }}>
                      {lead.direccion}
                    </span>
                  ) : (lead.direccion || '-')}
                </span>
              </div>
              <Item label="Complemento" valor={lead.direccion_complementaria} />
              {mapaYUbicacion}
            </Tarjeta>
          </>
        )}

        {pestana === 'documentos' && (
          <>
            <Tarjeta titulo="Licencia">
              <Item label="Licencia" valor={lead.licencia} />
              <Item label="Nro. licencia" valor={lead.numero_licencia} />
              <Item label="Categorías" valor={lead.categorias_licencia?.length ? lead.categorias_licencia.join(', ') : null} />
              <Item label="Estado" valor={lead.estado_licencia} />
              <Item label="Tipo" valor={lead.tipo_licencia} />
              <Item label="Vencimiento" valor={formatDateOnly(lead.vencimiento_licencia)} />
            </Tarjeta>
            <Tarjeta titulo="Otros documentos">
              <Item label="RNR" valor={lead.rnr} />
              <Item label="Fecha RNR" valor={formatDateOnly(lead.fecha_rnr)} />
              <Item label="Certificado de dirección" valor={lead.certificado_direccion} />
              <Item label="CBU" valor={lead.cbu} mono />
            </Tarjeta>
          </>
        )}

        {pestana === 'operativo' && (
          <Tarjeta titulo="Datos operativos">
            <Item label="Turno" valor={lead.turno} />
            <Item label="Cuenta Cabify" valor={lead.cuenta_cabify} />
            <Item label="Cuenta DiDi" valor={lead.cuenta_didi} />
            <Item label="Cochera" valor={lead.cochera} />
          </Tarjeta>
        )}

        {pestana === 'proceso' && (
          <>
            <Tarjeta titulo="Proceso">
              <Item label="Estado de lead" valor={displayEstadoLead(lead.estado_de_lead)} />
              {lead.estado_de_lead === 'No le interesa' && (
                <div className="lead-detail-item">
                  <span className="lead-detail-item-label">Motivo desinterés</span>
                  <span className="lead-detail-item-value">
                    {clasificarMotivoDesinteres(lead.causal_de_cierre)}
                    {lead.motivo_desinteres && <span> - {lead.motivo_desinteres}</span>}
                    {lead.causal_de_cierre && lead.causal_de_cierre !== clasificarMotivoDesinteres(lead.causal_de_cierre) && (
                      <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>({lead.causal_de_cierre})</span>
                    )}
                  </span>
                </div>
              )}
              <Item label="Guía" valor={lead.entrevistador_asignado} />
              <Item label="Fuente" valor={lead.fuente_de_lead} />
              <Item label="Fuente pauta" valor={lead.fuente_pauta} />
              <div className="lead-detail-item">
                <span className="lead-detail-item-label">Id fuente</span>
                <span className="lead-detail-item-value" style={{ maxWidth: '300px', textAlign: 'right', wordBreak: 'break-all' }}>
                  {lead.id_fuente
                    ? <a href={lead.id_fuente} target="_blank" rel="noopener noreferrer">{lead.id_fuente}</a>
                    : '-'}
                </span>
              </div>
              <Item label="Referido" valor={siNo(lead.referido)} />
              <Item label="Embajador" valor={lead.embajador_id ? embajadorPorId.get(lead.embajador_id) : null} />
            </Tarjeta>
            <Tarjeta titulo="Notas">
              <Item label="Detalle Hireflix" valor={lead.resumen_hireflix} largo />
              <Item label="Observaciones" valor={lead.observaciones} largo />
            </Tarjeta>
          </>
        )}
      </div>
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
      <div style={{ marginTop: '8px', height: '170px', borderRadius: 'var(--radius-md)', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Cargando mapa...</span>
      </div>
    )
  }

  return (
    <div style={{ marginTop: '8px' }}>
      {enZonaRestringida && nombreZona && (
        <div style={{ marginBottom: '6px', padding: '6px 10px', background: 'var(--badge-red-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--badge-red-text)', fontSize: '12px', color: 'var(--badge-red-text)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <AlertTriangle size={14} /> Zona Restringida: {nombreZona}
        </div>
      )}
      <div style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden', border: `2px solid ${enZonaRestringida ? 'var(--color-primary)' : 'var(--badge-green-text)'}` }}>
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
