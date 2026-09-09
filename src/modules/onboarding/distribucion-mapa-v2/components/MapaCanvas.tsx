// src/modules/onboarding/distribucion-mapa-v2/components/MapaCanvas.tsx
//
// Capa de mapa del v2:
//   - marcadores con pictograma propio por tipo de entidad
//   - polígonos de las zonas peligrosas activas (toggle desde el header)
//   - InfoWindow compacto con las señales de decisión
//   - línea del par seleccionado (modo emparejamiento, propuesta B)
//   - modo "Ver todos en mapa": líneas desde la persona seleccionada hacia las
//     más cercanas, con su tiempo real, para ver de un vistazo quién tiene cerca

import { useCallback, useEffect, useRef, useState } from 'react'
import { GoogleMap, InfoWindowF, MarkerF, PolygonF, PolylineF } from '@react-google-maps/api'
import { Pin, X } from 'lucide-react'
import { getLeadEstadoColor } from '../../../leads/leadEstadoColors'
import {
  getEstadoConductorDisplay,
  getEstadoConductorBadgeStyle,
} from '../../../../utils/conductorUtils'
import { IconoEntidad } from './iconos'
import { TAMANO_HALO, URL_HALO_ACTIVO, urlEtiquetaPill, urlIconoMarcador } from './marcadores'
import { colorEntidad } from './colores'
import { Badge, BotonPrimario, BotonSecundario } from './ui'
import type { EntidadMapa, ParSugerido, Radar } from '../types'
import type { ZonaPeligrosa } from '../distribucionMapaV2Service'
import { formatKm, formatMin, LABEL_TURNO } from '../utils'

const MAP_CENTER = { lat: -34.6037, lng: -58.3816 }

const COLOR_ZONA_PELIGROSA = '#DC2626'
const COLOR_CONEXION_CERCA = '#059669'
const COLOR_CONEXION_LEJOS = '#9CA3AF'

const ORIGEN_TURNO_LABEL: Record<string, string> = {
  asignacion: 'última asignación',
  preferencia: 'preferencia',
  lead: 'preferencia (lead)',
  ninguno: 'sin dato',
}

interface Props {
  entidades: EntidadMapa[]
  activo: string | null
  onSeleccionar: (id: string | null) => void
  entidadActiva: EntidadMapa | null
  /** Se incrementa con cada selección explícita: fuerza el re-centrado aunque sea la misma persona. */
  enfoqueTick: number
  /** Pares a dibujar como líneas rojas: uno solo, o todos con "Mostrar todos". */
  paresDibujados: ParSugerido[]
  /** El par elegido individualmente, que además se anuncia en la barra superior. */
  parDestacado: ParSugerido | null
  onLimpiarPar: () => void
  onVerFicha: (e: EntidadMapa) => void
  onSugerirDesde: (e: EntidadMapa) => void
  onVerTodosDesde: (e: EntidadMapa) => void
  zonasPeligrosas: ZonaPeligrosa[]
  mostrarZonas: boolean
  radar: Radar | null
  onLimpiarRadar: () => void
  /** Emparejamiento manual: persona fijada como base (null = sin base). */
  baseManual: EntidadMapa | null
  midiendoManual: boolean
  onFijarBase: (e: EntidadMapa) => void
  onSoltarBase: () => void
  onCopiarPar: (p: ParSugerido) => void
  onProgramarPar: (p: ParSugerido) => void
}

export function MapaCanvas({
  entidades,
  activo,
  onSeleccionar,
  entidadActiva,
  enfoqueTick,
  paresDibujados,
  parDestacado,
  onLimpiarPar,
  onVerFicha,
  onSugerirDesde,
  onVerTodosDesde,
  zonasPeligrosas,
  mostrarZonas,
  radar,
  onLimpiarRadar,
  baseManual,
  midiendoManual,
  onFijarBase,
  onSoltarBase,
  onCopiarPar,
  onProgramarPar,
}: Props) {
  const mapRef = useRef<google.maps.Map | null>(null)

  // La ficha flotante (InfoWindow) se puede cerrar SIN perder la selección: la
  // X sólo la oculta; el halo, la fila resaltada y el par en curso siguen. Cada
  // nueva intención de enfoque (clic en pin o en la lista) la vuelve a abrir.
  const [fichaVisible, setFichaVisible] = useState(true)
  useEffect(() => {
    setFichaVisible(true)
  }, [entidadActiva, enfoqueTick])

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map
  }, [])

  // Encuadre automático sobre lo visible.
  useEffect(() => {
    if (!mapRef.current || entidades.length === 0) return
    const bounds = new google.maps.LatLngBounds()
    entidades.forEach((e) => bounds.extend({ lat: e.lat, lng: e.lng }))
    mapRef.current.fitBounds(bounds, 60)
  }, [entidades])

  // Al seleccionar una entidad (desde el mapa o desde la lista lateral),
  // centrar el mapa en ella sin perder el nivel de detalle.
  //
  // Depende de `enfoqueTick` y no sólo de `entidadActiva`: si el operador se
  // fue paneando lejos y vuelve a tocar a la misma persona en la lista, la
  // entidad no cambió pero igual hay que traerla al centro. Con el tick cada
  // clic cuenta como una intención de enfoque.
  useEffect(() => {
    if (!mapRef.current || !entidadActiva) return
    mapRef.current.panTo({ lat: entidadActiva.lat, lng: entidadActiva.lng })
    if ((mapRef.current.getZoom() || 0) < 13) mapRef.current.setZoom(14)
  }, [entidadActiva, enfoqueTick])

  // Al dibujar pares, encuadrar sobre todos sus extremos.
  useEffect(() => {
    if (!mapRef.current || paresDibujados.length === 0) return
    const bounds = new google.maps.LatLngBounds()
    paresDibujados.forEach((p) => {
      bounds.extend({ lat: p.a.lat, lng: p.a.lng })
      bounds.extend({ lat: p.b.lat, lng: p.b.lng })
    })
    mapRef.current.fitBounds(bounds, paresDibujados.length === 1 ? 140 : 80)
  }, [paresDibujados])

  // Al activar "Ver todos en mapa", encuadrar sobre la base y sus conexiones.
  useEffect(() => {
    if (!mapRef.current || !radar || radar.conexiones.length === 0) return
    const bounds = new google.maps.LatLngBounds()
    bounds.extend({ lat: radar.base.lat, lng: radar.base.lng })
    radar.conexiones.forEach((c) => bounds.extend({ lat: c.entidad.lat, lng: c.entidad.lng }))
    mapRef.current.fitBounds(bounds, 90)
  }, [radar])

  const destacados = new Set<string>()
  for (const p of paresDibujados) {
    destacados.add(p.a.id)
    destacados.add(p.b.id)
  }
  if (radar) destacados.add(radar.base.id)

  // Con muchas líneas a la vez las etiquetas se pisan: sólo se rotulan cuando
  // son pocas, o la del par elegido.
  const rotularPares = paresDibujados.length <= 8

  return (
    <div style={{ flex: 1, position: 'relative' }}>
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
        {/* Zonas peligrosas activas */}
        {mostrarZonas &&
          zonasPeligrosas.map((z) => (
            <PolygonF
              key={`zona-${z.id}`}
              paths={z.poligono}
              options={{
                fillColor: COLOR_ZONA_PELIGROSA,
                fillOpacity: 0.14,
                strokeColor: COLOR_ZONA_PELIGROSA,
                strokeOpacity: 0.6,
                strokeWeight: 1.6,
                clickable: false,
                zIndex: 1,
              }}
            />
          ))}

        {/* Líneas del modo "Ver todos en mapa" */}
        {radar?.conexiones.map((c) => (
          <PolylineF
            key={`rad-${c.entidad.tipo}-${c.entidad.id}`}
            path={[
              { lat: radar.base.lat, lng: radar.base.lng },
              { lat: c.entidad.lat, lng: c.entidad.lng },
            ]}
            options={{
              strokeColor: c.dentroDelUmbral ? COLOR_CONEXION_CERCA : COLOR_CONEXION_LEJOS,
              strokeOpacity: c.dentroDelUmbral ? 0.85 : 0.45,
              strokeWeight: c.dentroDelUmbral ? 2.6 : 1.6,
              zIndex: 2,
            }}
          />
        ))}

        {/* Etiquetas de tiempo sobre cada línea del radar */}
        {radar?.conexiones.map((c) => (
          <MarkerF
            key={`radlbl-${c.entidad.tipo}-${c.entidad.id}`}
            position={{
              lat: (radar.base.lat + c.entidad.lat) / 2,
              lng: (radar.base.lng + c.entidad.lng) / 2,
            }}
            clickable={false}
            zIndex={3}
            icon={{
              url: urlEtiquetaPill(
                `${formatKm(c.distanciaKm)} · ${formatMin(c.tiempoMinutos)}`,
                c.dentroDelUmbral ? COLOR_CONEXION_CERCA : '#6B7280'
              ),
              anchor: new google.maps.Point(0, 10),
            }}
          />
        ))}

        {/* Líneas de los pares sugeridos (una, o todas con "Mostrar todos") */}
        {paresDibujados.map((p) => {
          const unico = paresDibujados.length === 1
          return (
            <PolylineF
              key={`par-${p.id}`}
              path={[
                { lat: p.a.lat, lng: p.a.lng },
                { lat: p.b.lat, lng: p.b.lng },
              ]}
              options={{
                strokeColor: '#ff0033',
                strokeOpacity: 0,
                zIndex: 4,
                icons: [
                  {
                    icon: {
                      path: 'M 0,-1 0,1',
                      strokeOpacity: unico ? 0.95 : 0.75,
                      strokeColor: '#ff0033',
                      strokeWeight: unico ? 3 : 2.2,
                      scale: unico ? 3 : 2.4,
                    },
                    offset: '0',
                    repeat: '14px',
                  },
                ],
              }}
            />
          )
        })}

        {/* Etiquetas de los pares dibujados */}
        {rotularPares &&
          paresDibujados.map((p) => (
            <MarkerF
              key={`parlbl-${p.id}`}
              position={{ lat: (p.a.lat + p.b.lat) / 2, lng: (p.a.lng + p.b.lng) / 2 }}
              clickable={false}
              zIndex={5}
              icon={{
                url: urlEtiquetaPill(
                  `${formatKm(p.distanciaKm)} · ${formatMin(p.tiempoMinutos)}`,
                  '#ff0033'
                ),
                anchor: new google.maps.Point(0, 10),
              }}
            />
          ))}

        {/* Halo bajo la persona seleccionada: el borde rojo del pin no alcanza
            para encontrarla entre 180 marcadores; el disco grande sí. */}
        {entidadActiva && (
          <MarkerF
            position={{ lat: entidadActiva.lat, lng: entidadActiva.lng }}
            clickable={false}
            zIndex={998}
            icon={{
              url: URL_HALO_ACTIVO,
              scaledSize: new google.maps.Size(TAMANO_HALO, TAMANO_HALO),
              // Centrado sobre la base del pin (donde apunta la punta del rombo).
              anchor: new google.maps.Point(TAMANO_HALO / 2, TAMANO_HALO / 2),
            }}
          />
        )}

        {entidades.map((e) => {
          // La base fijada queda siempre destacada (pin grande, borde rojo),
          // aunque el halo se mueva a la persona que se está midiendo.
          const destacado = activo === e.id || destacados.has(e.id) || baseManual?.id === e.id
          const atenuado = e.tipo === 'conductor' && e.esBaja
          return (
            <MarkerF
              key={`${e.tipo}-${e.id}`}
              position={{ lat: e.lat, lng: e.lng }}
              onClick={() => onSeleccionar(e.id)}
              zIndex={destacado ? 999 : 10}
              icon={{
                url: urlIconoMarcador(e.tipo, colorEntidad(e), destacado, atenuado),
                scaledSize: new google.maps.Size(destacado ? 34 : 28, destacado ? 44 : 36),
                anchor: new google.maps.Point(destacado ? 17 : 14, destacado ? 44 : 36),
              }}
            />
          )
        })}

        {entidadActiva && fichaVisible && (
          <InfoWindowF
            position={{ lat: entidadActiva.lat, lng: entidadActiva.lng }}
            onCloseClick={() => setFichaVisible(false)}
          >
            <InfoEntidad
              entidad={entidadActiva}
              onVerFicha={onVerFicha}
              onSugerirDesde={onSugerirDesde}
              onVerTodosDesde={onVerTodosDesde}
              baseManual={baseManual}
              onFijarBase={onFijarBase}
              onSoltarBase={onSoltarBase}
              // Resultado contra la base, sólo si el par dibujado toca a esta persona.
              parConBase={
                baseManual &&
                parDestacado &&
                (parDestacado.a.id === entidadActiva.id || parDestacado.b.id === entidadActiva.id) &&
                entidadActiva.id !== baseManual.id
                  ? parDestacado
                  : null
              }
              midiendo={midiendoManual && entidadActiva.id !== baseManual?.id}
              onCopiarPar={onCopiarPar}
              onProgramarPar={onProgramarPar}
            />
          </InfoWindowF>
        )}
      </GoogleMap>

      {/* Barra del par en curso */}
      {parDestacado && (
        <BarraFlotante onCerrar={onLimpiarPar}>
          {baseManual && (
            <button
              type="button"
              onClick={onSoltarBase}
              title="Soltar la base fijada"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                border: '1px solid #ff0033',
                background: 'rgba(255,0,51,.08)',
                color: '#ff0033',
                borderRadius: 999,
                padding: '2px 8px',
                fontSize: 10.5,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              <Pin size={11} /> Base
            </button>
          )}
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
            Emparejando:
          </span>
          <ExtremoPar entidad={parDestacado.a} />
          <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>↔</span>
          <ExtremoPar entidad={parDestacado.b} />
          <Pildora>
            {formatKm(parDestacado.distanciaKm)} · {formatMin(parDestacado.tiempoMinutos)}
          </Pildora>
        </BarraFlotante>
      )}

      {/* Barra del modo "Mostrar todos" */}
      {!parDestacado && paresDibujados.length > 1 && (
        <BarraFlotante onCerrar={onLimpiarPar}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
            Mostrando todas las sugerencias:
          </span>
          <Pildora>{paresDibujados.length} pares</Pildora>
          {!rotularPares && (
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              sin etiquetas por cantidad
            </span>
          )}
        </BarraFlotante>
      )}

      {/* Barra de base fijada (emparejamiento manual) */}
      {baseManual && !parDestacado && !(radar && paresDibujados.length === 0) && (
        <BarraFlotante onCerrar={onSoltarBase} etiquetaCerrar="Soltar base">
          <Pin size={13} color="#ff0033" />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>Base:</span>
          <ExtremoPar entidad={baseManual} />
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            {midiendoManual ? 'Midiendo…' : 'tocá a otra persona para medir'}
          </span>
        </BarraFlotante>
      )}

      {/* Barra del modo "Ver todos en mapa" */}
      {radar && paresDibujados.length === 0 && (
        <BarraFlotante onCerrar={onLimpiarRadar}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
            Cercanos a:
          </span>
          <ExtremoPar entidad={radar.base} />
          <Pildora fondo={COLOR_CONEXION_CERCA}>
            {radar.conexiones.filter((c) => c.dentroDelUmbral).length} dentro del umbral
          </Pildora>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            {radar.conexiones.length} medidos
          </span>
        </BarraFlotante>
      )}
    </div>
  )
}

// =====================================================
// Subcomponentes
// =====================================================

function BarraFlotante({
  children,
  onCerrar,
  etiquetaCerrar = 'Limpiar',
}: {
  children: React.ReactNode
  onCerrar: () => void
  etiquetaCerrar?: string
}) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 14,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'var(--bg-primary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 11,
        boxShadow: '0 6px 22px rgba(15,23,42,.18)',
        padding: '7px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        maxWidth: '90%',
        zIndex: 4,
      }}
    >
      {children}
      <button
        type="button"
        onClick={onCerrar}
        aria-label={etiquetaCerrar}
        title={etiquetaCerrar}
        style={{
          border: '1px solid var(--border-primary)',
          background: 'var(--bg-secondary)',
          borderRadius: 7,
          cursor: 'pointer',
          padding: '3px 6px',
          display: 'flex',
          alignItems: 'center',
          color: 'var(--text-secondary)',
        }}
      >
        <X size={13} />
      </button>
    </div>
  )
}

function Pildora({ children, fondo }: { children: React.ReactNode; fondo?: string }) {
  return (
    <span
      style={{
        fontSize: 11.5,
        fontWeight: 750,
        background: fondo || 'var(--color-primary, #ff0033)',
        color: '#fff',
        borderRadius: 999,
        padding: '3px 9px',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}

function ExtremoPar({ entidad }: { entidad: EntidadMapa }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
      <IconoEntidad tipo={entidad.tipo} color={colorEntidad(entidad)} size={15} />
      <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{entidad.nombre}</span>
    </span>
  )
}

/**
 * InfoWindow compacto: identidad + las señales que definen la decisión
 * (licencia, zona peligrosa, compañero). El resto de los datos vive en la
 * ficha completa, que se abre desde acá.
 */
function InfoEntidad({
  entidad: e,
  onVerFicha,
  onSugerirDesde,
  onVerTodosDesde,
  baseManual,
  onFijarBase,
  onSoltarBase,
  parConBase,
  midiendo,
  onCopiarPar,
  onProgramarPar,
}: {
  entidad: EntidadMapa
  onVerFicha: (e: EntidadMapa) => void
  onSugerirDesde: (e: EntidadMapa) => void
  onVerTodosDesde: (e: EntidadMapa) => void
  baseManual: EntidadMapa | null
  onFijarBase: (e: EntidadMapa) => void
  onSoltarBase: () => void
  /** Par medido entre la base fijada y esta persona (si lo hay). */
  parConBase: ParSugerido | null
  midiendo: boolean
  onCopiarPar: (p: ParSugerido) => void
  onProgramarPar: (p: ParSugerido) => void
}) {
  const esBase = !!baseManual && baseManual.id === e.id
  const badge =
    e.tipo === 'conductor'
      ? getEstadoConductorBadgeStyle({ codigo: e.estadoCodigo || undefined })
      : { bg: getLeadEstadoColor(e.estadoLead), color: 'white' }

  const d = e.datos

  return (
    <div style={{ padding: '4px 2px', minWidth: 214, maxWidth: 278 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <IconoEntidad tipo={e.tipo} color={colorEntidad(e)} size={17} />
        <p style={{ margin: 0, fontWeight: 700, fontSize: 13 }}>{e.nombre}</p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 5, margin: '6px 0 0', flexWrap: 'wrap' }}>
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
            ? getEstadoConductorDisplay({
                codigo: e.estadoCodigo || undefined,
                descripcion: e.estadoDescripcion,
              })
            : e.estadoLead || 'Lead'}
        </span>
        {e.tipo === 'conductor' && e.turnoEfectivo && (
          <Badge tono="info">
            {LABEL_TURNO[e.turnoEfectivo]} · {ORIGEN_TURNO_LABEL[e.turnoOrigen] || 'sin dato'}
          </Badge>
        )}
        {e.tipo === 'lead' && e.turnoLead && <Badge tono="info">{e.turnoLead}</Badge>}
        {e.estadoCompanero === 'sin_companero' && (
          <Badge tono="bad">
            Sin compañero{e.turnoLibreAsignacion ? ` · falta ${e.turnoLibreAsignacion}` : ''}
          </Badge>
        )}
        {e.estadoCompanero === 'con_companero' && <Badge tono="ok">Con compañero</Badge>}
      </div>

      <p style={{ margin: '6px 0 0', fontSize: 11, color: '#6B7280' }}>
        DNI: {e.documento || '-'}
        {d.edad != null && ` · ${d.edad} años`}
        {e.zona && ` · ${e.zona}`}
        {e.patenteAsignacion && ` · ${e.patenteAsignacion}`}
      </p>

      <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
        {d.licenciaEstado === 'vigente' && <Badge tono="ok">Licencia vigente</Badge>}
        {d.licenciaEstado === 'por_vencer' && (
          <Badge tono="warn">Licencia vence en {d.licenciaDiasRestantes} d</Badge>
        )}
        {d.licenciaEstado === 'vencida' && <Badge tono="bad">Licencia vencida</Badge>}
        {d.licenciaEstado === 'sin_dato' && <Badge tono="neutro">Licencia sin dato</Badge>}

        {d.zonaPeligrosa ? (
          <Badge tono="bad">{d.zonaPeligrosa}</Badge>
        ) : (
          <Badge tono="ok">Zona segura</Badge>
        )}

        {d.antecedentesPenales === true && <Badge tono="bad">Con antecedentes</Badge>}
        {d.antecedentesPenales === false && <Badge tono="ok">Sin antecedentes</Badge>}
        {d.experiencia && <Badge tono="neutro">Exp: {d.experiencia}</Badge>}
      </div>

      {e.direccion && (
        <p style={{ margin: '6px 0 0', fontSize: 10, color: '#9CA3AF' }}>{e.direccion}</p>
      )}

      {/* Resultado contra la base fijada (emparejamiento manual) */}
      {baseManual && !esBase && (midiendo || parConBase) && (
        <div
          style={{
            marginTop: 9,
            padding: '8px 10px',
            border: '1px solid #ff0033',
            borderRadius: 9,
            background: 'rgba(255,0,51,.05)',
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.4px', textTransform: 'uppercase', color: '#ff0033' }}>
            Desde {baseManual.nombre.split(',')[0]}
          </div>
          {midiendo && !parConBase ? (
            <div style={{ fontSize: 11.5, color: '#6B7280', marginTop: 4 }}>Midiendo…</div>
          ) : parConBase ? (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 3 }}>
                <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.3px' }}>
                  {formatKm(parConBase.distanciaKm)}
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: '#6B7280' }}>
                  {formatMin(parConBase.tiempoMinutos)}
                </span>
                <span style={{ marginLeft: 'auto' }}>
                  <Badge tono={parConBase.score >= 70 ? 'ok' : parConBase.score >= 45 ? 'warn' : 'bad'}>
                    score {parConBase.score}
                  </Badge>
                </span>
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                {parConBase.fuenteTiempo === 'estimado' && <Badge tono="warn">Tiempo estimado</Badge>}
                {parConBase.motivos.map((m, i) => (
                  <Badge key={`pm-${i}`} tono={m.tipo === 'ok' ? 'ok' : m.tipo === 'warn' ? 'warn' : 'bad'}>
                    {m.texto}
                  </Badge>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <BotonSecundario onClick={() => onCopiarPar(parConBase)}>Copiar</BotonSecundario>
                <BotonPrimario onClick={() => onProgramarPar(parConBase)}>Programar entrega</BotonPrimario>
              </div>
            </>
          ) : null}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginTop: 9, flexWrap: 'wrap' }}>
        {esBase ? (
          <BotonPrimario onClick={onSoltarBase}>
            <Pin size={12} /> Soltar base
          </BotonPrimario>
        ) : (
          <BotonSecundario onClick={() => onFijarBase(e)}>
            <Pin size={12} /> Fijar como base
          </BotonSecundario>
        )}
        <BotonPrimario onClick={() => onSugerirDesde(e)}>Sugerir compañero</BotonPrimario>
        <BotonSecundario onClick={() => onVerTodosDesde(e)}>Ver todos en mapa</BotonSecundario>
        <BotonSecundario onClick={() => onVerFicha(e)}>Ver ficha →</BotonSecundario>
      </div>
    </div>
  )
}
