// src/modules/onboarding/distribucion-mapa-v2/components/MapaCanvas.tsx
//
// Capa de mapa del v2:
//   - marcadores con pictograma propio por tipo de entidad
//   - polígonos de las zonas peligrosas activas (toggle desde el header)
//   - InfoWindow compacto con las señales de decisión
//   - línea del par seleccionado (modo emparejamiento, propuesta B)
//   - modo "Ver todos en mapa": líneas desde la persona seleccionada hacia las
//     más cercanas, con su tiempo real, para ver de un vistazo quién tiene cerca

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GoogleMap, MarkerF, OverlayViewF, PolygonF, PolylineF } from '@react-google-maps/api'
import { Network, Pin, PinOff, X } from 'lucide-react'
import { getLeadEstadoColor } from '../../../leads/leadEstadoColors'
import {
  getEstadoConductorDisplay,
  getEstadoConductorBadgeStyle,
} from '../../../../utils/conductorUtils'
import { IconoEntidad } from './iconos'
import { HALO_SOBRE_PUNTA, TAMANO_HALO, URL_HALO_ACTIVO, urlEtiquetaPill, urlIconoMarcador } from './marcadores'
import { colorEntidad } from './colores'
import { Badge, BotonPrimario, BotonSecundario } from './ui'
import type { EntidadMapa, ParSugerido, Radar } from '../types'
import type { ZonaPeligrosa } from '../distribucionMapaV2Service'
import { formatKm, formatMin, LABEL_TURNO, LABEL_TURNO_CONDUCTOR, turnoConductor } from '../utils'

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
  /** Pares a dibujar como líneas rojas: uno solo, o todos con "Dibujar todos los pares". */
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
  /** Persona seleccionada ↔ su compañero actual (asignación activa), ya medido. */
  parActual?: ParSugerido | null
  /** El compañero actual, para dibujarlo aunque un filtro lo oculte. */
  companeroActual?: EntidadMapa | null
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
  parActual = null,
  companeroActual = null,
}: Props) {
  const mapRef = useRef<google.maps.Map | null>(null)

  // La ficha flotante (InfoWindow) se puede cerrar SIN perder la selección: la
  // X sólo la oculta; el halo, la fila resaltada y el par en curso siguen. Cada
  // nueva intención de enfoque (clic en pin o en la lista) la vuelve a abrir.
  const [fichaVisible, setFichaVisible] = useState(true)
  useEffect(() => {
    setFichaVisible(true)
  }, [entidadActiva, enfoqueTick])

  // Lado de la ficha flotante (2026-10-22): al costado del pin, del lado CONTRARIO a
  // hacia donde van sus líneas (par, compañero actual, base o "ver todos"), para no
  // tapar a las personas que se están comparando. Sin líneas, hacia el centro del mapa.
  const ladoFicha = useMemo<'izquierda' | 'derecha'>(() => {
    if (!entidadActiva) return 'derecha'
    const id = entidadActiva.id
    const otros: Array<{ lng: number }> = []
    if (parDestacado && (parDestacado.a.id === id || parDestacado.b.id === id)) {
      otros.push(parDestacado.a.id === id ? parDestacado.b : parDestacado.a)
    }
    if (parActual && (parActual.a.id === id || parActual.b.id === id)) {
      otros.push(parActual.a.id === id ? parActual.b : parActual.a)
    }
    if (baseManual && baseManual.id !== id) otros.push(baseManual)
    if (radar && radar.base.id === id) radar.conexiones.forEach((c) => otros.push(c.entidad))
    if (otros.length > 0) {
      const alEste = otros.filter((o) => o.lng > entidadActiva.lng).length
      return alEste > otros.length - alEste ? 'izquierda' : 'derecha'
    }
    const centro = mapRef.current?.getCenter()
    return centro && entidadActiva.lng > centro.lng() ? 'izquierda' : 'derecha'
  }, [entidadActiva, parDestacado, parActual, baseManual, radar])

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

  // Si el compañero actual queda fuera de la vista, se encuadra a los dos. Sólo
  // cuando está afuera: si ya se ve, se respeta el zoom que eligió el operador.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !parActual) return
    const bounds = map.getBounds()
    const puntos = [parActual.a, parActual.b]
    if (bounds && puntos.every((p) => bounds.contains({ lat: p.lat, lng: p.lng }))) return
    const nuevo = new google.maps.LatLngBounds()
    puntos.forEach((p) => nuevo.extend({ lat: p.lat, lng: p.lng }))
    map.fitBounds(nuevo, 140)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parActual?.id])

  // La línea del compañero actual se dibuja salvo que ese mismo par ya esté
  // dibujado como sugerencia, o que esté activo el modo "Ver todos en mapa".
  const dibujarParActual =
    !!parActual && !radar && !paresDibujados.some((p) => p.id === parActual.id)

  // Si un filtro oculta al compañero, igual se pinta su marcador: si no, la
  // línea terminaría en un punto vacío.
  const companeroOculto =
    !!companeroActual && !entidades.some((e) => e.id === companeroActual.id)

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

        {/* Líneas de los pares sugeridos (una, o todas con "Dibujar todos los pares") */}
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

        {/* Línea del compañero actual: mismo trazo que un par, con su etiqueta. */}
        {dibujarParActual && parActual && (
          <PolylineF
            key={`actual-${parActual.id}`}
            path={[
              { lat: parActual.a.lat, lng: parActual.a.lng },
              { lat: parActual.b.lat, lng: parActual.b.lng },
            ]}
            options={{
              strokeColor: '#ff0033',
              strokeOpacity: 0,
              zIndex: 4,
              icons: [
                {
                  icon: {
                    path: 'M 0,-1 0,1',
                    strokeOpacity: 0.95,
                    strokeColor: '#ff0033',
                    strokeWeight: 3,
                    scale: 3,
                  },
                  offset: '0',
                  repeat: '14px',
                },
              ],
            }}
          />
        )}
        {dibujarParActual && parActual && (
          <MarkerF
            key={`actuallbl-${parActual.id}`}
            position={{
              lat: (parActual.a.lat + parActual.b.lat) / 2,
              lng: (parActual.a.lng + parActual.b.lng) / 2,
            }}
            clickable={false}
            zIndex={5}
            icon={{
              url: urlEtiquetaPill(
                `Compañero actual · ${formatKm(parActual.distanciaKm)} · ${formatMin(parActual.tiempoMinutos)}`,
                '#ff0033'
              ),
              anchor: new google.maps.Point(0, 10),
            }}
          />
        )}
        {companeroOculto && companeroActual && (
          <MarkerF
            key={`companero-${companeroActual.id}`}
            position={{ lat: companeroActual.lat, lng: companeroActual.lng }}
            clickable={false}
            title={`${companeroActual.nombre} (compañero actual, fuera del filtro)`}
            zIndex={20}
            icon={{
              url: urlIconoMarcador(companeroActual.tipo, colorEntidad(companeroActual), false, false),
              scaledSize: new google.maps.Size(28, 36),
              anchor: new google.maps.Point(14, 36),
            }}
          />
        )}

        {/* Aro bajo la persona seleccionada: el borde rojo del pin no alcanza
            para encontrarla entre 180 marcadores. Rodea la cabeza del pin. */}
        {entidadActiva && (
          <MarkerF
            // La key por persona fuerza a recrear el aro al cambiar la selección:
            // reusar el mismo marcador dejaba a veces un aro "fantasma" en la anterior.
            key={`halo-${entidadActiva.tipo}-${entidadActiva.id}`}
            position={{ lat: entidadActiva.lat, lng: entidadActiva.lng }}
            clickable={false}
            zIndex={998}
            icon={{
              url: URL_HALO_ACTIVO,
              scaledSize: new google.maps.Size(TAMANO_HALO, TAMANO_HALO),
              // Centrado sobre la cabeza del pin (HALO_SOBRE_PUNTA px arriba de la punta).
              anchor: new google.maps.Point(TAMANO_HALO / 2, TAMANO_HALO / 2 + HALO_SOBRE_PUNTA),
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
          // Ficha propia en lugar del InfoWindow de Google: el InfoWindow siempre se
          // abre ARRIBA del punto y tapaba a los conductores cercanos. Esta va al
          // costado (ver ladoFicha), centrada en la cabeza del pin, con ancho fijo.
          <OverlayViewF
            position={{ lat: entidadActiva.lat, lng: entidadActiva.lng }}
            mapPaneName="floatPane"
            getPixelPositionOffset={(ancho, alto) => ({
              x: ladoFicha === 'derecha' ? SEPARACION_FICHA : -ancho - SEPARACION_FICHA,
              y: -alto / 2 - HALO_SOBRE_PUNTA,
            })}
          >
            <FichaFlotante lado={ladoFicha}>
            <InfoEntidad
              entidad={entidadActiva}
              onCerrar={() => setFichaVisible(false)}
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
              parActual={
                parActual &&
                (parActual.a.id === entidadActiva.id || parActual.b.id === entidadActiva.id)
                  ? parActual
                  : null
              }
              parEnCurso={
                parDestacado &&
                (parDestacado.a.id === entidadActiva.id || parDestacado.b.id === entidadActiva.id)
                  ? parDestacado
                  : null
              }
              onLimpiarPar={onLimpiarPar}
            />
            </FichaFlotante>
          </OverlayViewF>
        )}
      </GoogleMap>

      {/* La barra "Emparejando" de abajo se quitó (2026-10-22): el par ya se ve en
          el mapa (línea + etiqueta km/min) y se quita desde la ficha ("Quitar"). */}

      {/* Barra del modo "Dibujar todos los pares" */}
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

      {/* La base fijada NO se anuncia con una barra sobre el mapa: ya se ve en
          la lista (fijada arriba con el chip BASE) y en su propia ficha, que es
          además desde donde se suelta. */}

      {/* Barra del modo "Ver todos en mapa" */}
      {radar && paresDibujados.length === 0 && (
        <BarraFlotante onCerrar={onLimpiarRadar} posicion="abajo">
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
  posicion = 'arriba',
}: {
  children: React.ReactNode
  onCerrar: () => void
  etiquetaCerrar?: string
  /** 'abajo' deja libre el borde superior (donde vive la barra de base). */
  posicion?: 'arriba' | 'abajo'
}) {
  return (
    <div
      style={{
        position: 'absolute',
        // Abajo se deja lugar para la atribución de Google.
        ...(posicion === 'arriba' ? { top: 14 } : { bottom: 30 }),
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
  onCerrar,
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
  parActual,
  parEnCurso,
  onLimpiarPar,
}: {
  entidad: EntidadMapa
  onCerrar: () => void
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
  /** Medición con el compañero actual (null mientras se mide o si no tiene). */
  parActual: ParSugerido | null
  /** Par dibujado en el mapa que incluye a esta persona (si lo hay). */
  parEnCurso: ParSugerido | null
  onLimpiarPar: () => void
}) {
  const esBase = !!baseManual && baseManual.id === e.id
  const badge =
    e.tipo === 'conductor'
      ? getEstadoConductorBadgeStyle({ codigo: e.estadoCodigo || undefined })
      : { bg: getLeadEstadoColor(e.estadoLead), color: 'white' }

  const d = e.datos

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <IconoEntidad tipo={e.tipo} color={colorEntidad(e)} size={17} />
        <p style={{ margin: 0, fontWeight: 700, fontSize: 13, flex: 1, minWidth: 0 }}>{e.nombre}</p>
        <button
          type="button"
          onClick={onCerrar}
          title="Cerrar"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 22, height: 22, marginRight: -2, border: 'none', borderRadius: 6,
            background: 'transparent', color: '#6B7280', cursor: 'pointer', flexShrink: 0,
          }}
        >
          <X size={15} />
        </button>
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
        {/* Turno + asignación en una sola etiqueta: antes "Nocturno · última
            asignación" y "Sin asignación" iban separadas y se leían como contradicción. */}
        {e.tipo === 'conductor' && !e.tieneAsignacionActiva && !e.esBaja ? (
          <Badge tono="neutro">
            Sin asignación
            {e.turnoEfectivo &&
              ` · ${e.turnoOrigen === 'asignacion' ? 'último turno' : e.turnoOrigen === 'preferencia' ? 'prefiere' : 'turno'} ${
                turnoConductor(e) === 'A_CARGO' ? LABEL_TURNO_CONDUCTOR.A_CARGO : LABEL_TURNO[e.turnoEfectivo]
              }`}
          </Badge>
        ) : e.tipo === 'conductor' && e.turnoEfectivo ? (
          <Badge tono="info">
            {turnoConductor(e) === 'A_CARGO' ? LABEL_TURNO_CONDUCTOR.A_CARGO : LABEL_TURNO[e.turnoEfectivo]} ·{' '}
            {ORIGEN_TURNO_LABEL[e.turnoOrigen] || 'sin dato'}
          </Badge>
        ) : null}
        {e.tipo === 'lead' && e.turnoLead && <Badge tono="info">{e.turnoLead}</Badge>}
        {e.estadoCompanero === 'sin_companero' && (
          <Badge tono="info">
            Sin compañero{e.turnoLibreAsignacion ? ` · falta ${e.turnoLibreAsignacion}` : ''}
          </Badge>
        )}
        {e.estadoCompanero === 'con_companero' && <Badge tono="info">Con compañero</Badge>}
      </div>

      <p style={{ margin: '6px 0 0', fontSize: 11, color: '#6B7280' }}>
        DNI: {e.documento || '-'}
        {d.edad != null && ` · ${d.edad} años`}
        {e.zona && ` · ${e.zona}`}
        {e.patenteAsignacion && ` · ${e.patenteAsignacion}`}
      </p>

      {e.tipo === 'lead' && e.guia && (
        <p style={{ margin: '4px 0 0', fontSize: 11, color: '#374151' }}>
          <span style={{ color: '#6B7280' }}>Guía: </span>
          <b>{e.guia}</b>
        </p>
      )}

      {e.companeroNombre && (
        <p style={{ margin: '4px 0 0', fontSize: 11, color: '#374151' }}>
          <span style={{ color: '#6B7280' }}>Compañero actual: </span>
          <b>{e.companeroNombre}</b>
          {parActual && (
            <span style={{ color: '#6B7280' }}>
              {' · '}
              {formatKm(parActual.distanciaKm)} · {formatMin(parActual.tiempoMinutos)}
              {parActual.fuenteTiempo === 'estimado' && ' (estimado)'}
            </span>
          )}
        </p>
      )}

      {/* Los badges descriptivos de la ficha van todos en azul (info): describen
          la situación de la persona, no la califican. El juicio bueno/malo lo
          hacen los motivos del score en las tarjetas de pares, no la ficha. */}
      <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
        {d.licenciaEstado === 'vigente' && <Badge tono="info">Licencia vigente</Badge>}
        {d.licenciaEstado === 'por_vencer' && (
          <Badge tono="info">Licencia vence en {d.licenciaDiasRestantes} d</Badge>
        )}
        {d.licenciaEstado === 'vencida' && <Badge tono="info">Licencia vencida</Badge>}
        {d.licenciaEstado === 'sin_dato' && <Badge tono="info">Licencia sin dato</Badge>}

        {d.zonaPeligrosa ? (
          <Badge tono="info">{d.zonaPeligrosa}</Badge>
        ) : (
          <Badge tono="info">Zona segura</Badge>
        )}

        {d.antecedentesPenales === true && <Badge tono="info">Con antecedentes</Badge>}
        {d.antecedentesPenales === false && <Badge tono="info">Sin antecedentes</Badge>}
        {d.experiencia && <Badge tono="info">Exp: {d.experiencia}</Badge>}
      </div>

      {e.direccion && (
        <p
          title={e.direccion}
          style={{ margin: '6px 0 0', fontSize: 10, color: '#9CA3AF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {e.direccion}
        </p>
      )}

      {/* Par dibujado (desde sugerencias) que incluye a esta persona: reemplaza a la
          barra "Emparejando" que había abajo del mapa. */}
      {parEnCurso && !(baseManual && !esBase && (midiendo || parConBase)) && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, padding: '6px 8px',
            borderRadius: 8, background: 'rgba(255,0,51,.05)', border: '1px solid rgba(255,0,51,.35)',
            fontSize: 11, color: '#374151',
          }}
        >
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Emparejando con <b>{(parEnCurso.a.id === e.id ? parEnCurso.b : parEnCurso.a).nombre}</b>
            {' · '}{formatKm(parEnCurso.distanciaKm)} · {formatMin(parEnCurso.tiempoMinutos)}
          </span>
          <BotonQuitar onClick={onLimpiarPar} />
        </div>
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.4px', textTransform: 'uppercase', color: '#ff0033' }}>
              Desde {baseManual.nombre.split(',')[0]}
            </span>
            {parConBase && <BotonQuitar onClick={onLimpiarPar} />}
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

      {/* Acciones en una fila: la principal destacada, la ficha como secundaria y
          las de mapa (base / ver todos) como íconos con su texto al pasar el mouse. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 9, flexWrap: 'wrap' }}>
        <BotonPrimario onClick={() => onSugerirDesde(e)}>Sugerir compañero</BotonPrimario>
        <BotonSecundario onClick={() => onVerFicha(e)}>Ver ficha →</BotonSecundario>
        <span style={{ flex: 1 }} />
        {esBase ? (
          <BotonSoltarBase onClick={onSoltarBase} />
        ) : (
          <BotonIcono title="Fijar como base (medir distancias desde esta persona)" onClick={() => onFijarBase(e)}>
            <Pin size={14} />
          </BotonIcono>
        )}
        <BotonIcono title="Ver todos en mapa (líneas hacia los candidatos)" onClick={() => onVerTodosDesde(e)}>
          <Network size={14} />
        </BotonIcono>
      </div>
    </div>
  )
}

/** En la ficha de la base: texto explícito en rojo en lugar del ícono suelto. */
function BotonSoltarBase({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Soltar base y limpiar el mapa"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        height: 26,
        padding: '0 10px',
        flexShrink: 0,
        border: '1px solid var(--color-primary, #ff0033)',
        borderRadius: 8,
        background: '#fff1f3',
        color: 'var(--color-primary, #ff0033)',
        fontSize: 12,
        fontWeight: 700,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      <PinOff size={13} /> Soltar base
    </button>
  )
}

/** Botón cuadrado solo con ícono (acciones secundarias de la ficha del mapa). */
function BotonIcono({
  onClick,
  title,
  activo,
  children,
}: {
  onClick: () => void
  title: string
  activo?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 26,
        height: 26,
        flexShrink: 0,
        border: `1px solid ${activo ? 'var(--color-primary, #ff0033)' : 'var(--border-primary)'}`,
        borderRadius: 8,
        background: activo ? '#fff1f3' : 'var(--bg-primary)',
        color: activo ? 'var(--color-primary, #ff0033)' : 'var(--text-secondary)',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

/** Separación (px) entre el pin y el costado de la ficha flotante. */
const SEPARACION_FICHA = 22

/**
 * Contenedor de la ficha flotante del mapa: tarjeta blanca de ancho fijo con una
 * flecha hacia el pin. Bloquea los clics/arrastres/rueda del mapa sobre la ficha
 * (sin esto, hacer clic en un botón también movía o seleccionaba en el mapa).
 */
function FichaFlotante({ lado, children }: { lado: 'izquierda' | 'derecha'; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (ref.current) google.maps.OverlayView.preventMapHitsAndGesturesFrom(ref.current)
  }, [])
  const flecha: React.CSSProperties = {
    position: 'absolute',
    top: '50%',
    width: 12,
    height: 12,
    background: '#fff',
    transform: 'translateY(-50%) rotate(45deg)',
    ...(lado === 'derecha'
      ? { left: -6, borderLeft: '1px solid #E5E7EB', borderBottom: '1px solid #E5E7EB' }
      : { right: -6, borderRight: '1px solid #E5E7EB', borderTop: '1px solid #E5E7EB' }),
  }
  return (
    <div
      ref={ref}
      style={{
        position: 'relative',
        width: 344,
        boxSizing: 'border-box',
        padding: '10px 12px 12px',
        background: '#fff',
        border: '1px solid #E5E7EB',
        borderRadius: 12,
        boxShadow: '0 8px 24px rgba(0,0,0,.18)',
        cursor: 'default',
      }}
    >
      <span style={flecha} />
      <div style={{ position: 'relative' }}>{children}</div>
    </div>
  )
}

/** "Quitar" chico para limpiar el par dibujado desde la ficha. */
function BotonQuitar({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Quitar la línea del mapa"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0,
        padding: '2px 6px', border: 'none', borderRadius: 6, background: 'transparent',
        color: '#6B7280', fontSize: 10.5, fontWeight: 600, cursor: 'pointer',
      }}
    >
      <X size={11} /> Quitar
    </button>
  )
}
