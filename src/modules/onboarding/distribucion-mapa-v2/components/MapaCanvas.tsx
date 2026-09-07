// src/modules/onboarding/distribucion-mapa-v2/components/MapaCanvas.tsx
//
// Capa de mapa del v2: marcadores con pictograma propio por tipo de entidad,
// InfoWindow compacto con las señales de decisión, y la línea que une el par
// seleccionado en el modo emparejamiento (propuesta B).

import { useCallback, useEffect, useRef } from 'react'
import { GoogleMap, InfoWindowF, MarkerF, PolylineF } from '@react-google-maps/api'
import { X } from 'lucide-react'
import { getLeadEstadoColor } from '../../../leads/leadEstadoColors'
import {
  getEstadoConductorDisplay,
  getEstadoConductorBadgeStyle,
} from '../../../../utils/conductorUtils'
import { IconoEntidad } from './iconos'
import { urlIconoMarcador } from './marcadores'
import { colorEntidad } from './colores'
import { Badge, BotonPrimario, BotonSecundario } from './ui'
import type { EntidadMapa, ParSugerido } from '../types'
import { formatKm, formatMin, LABEL_TURNO } from '../utils'

const MAP_CENTER = { lat: -34.6037, lng: -58.3816 }

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
  parSeleccionado: ParSugerido | null
  onLimpiarPar: () => void
  onVerFicha: (e: EntidadMapa) => void
  onSugerirDesde: (e: EntidadMapa) => void
}

export function MapaCanvas({
  entidades,
  activo,
  onSeleccionar,
  entidadActiva,
  parSeleccionado,
  onLimpiarPar,
  onVerFicha,
  onSugerirDesde,
}: Props) {
  const mapRef = useRef<google.maps.Map | null>(null)

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
  useEffect(() => {
    if (!mapRef.current || !entidadActiva) return
    mapRef.current.panTo({ lat: entidadActiva.lat, lng: entidadActiva.lng })
    if ((mapRef.current.getZoom() || 0) < 13) mapRef.current.setZoom(14)
  }, [entidadActiva])

  // Al elegir un par, encuadrar sobre sus dos extremos.
  useEffect(() => {
    if (!mapRef.current || !parSeleccionado) return
    const bounds = new google.maps.LatLngBounds()
    bounds.extend({ lat: parSeleccionado.a.lat, lng: parSeleccionado.a.lng })
    bounds.extend({ lat: parSeleccionado.b.lat, lng: parSeleccionado.b.lng })
    mapRef.current.fitBounds(bounds, 140)
  }, [parSeleccionado])

  const idsDelPar = new Set(
    parSeleccionado ? [parSeleccionado.a.id, parSeleccionado.b.id] : []
  )

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
        {entidades.map((e) => {
          const destacado = activo === e.id || idsDelPar.has(e.id)
          const atenuado = e.tipo === 'conductor' && e.esBaja
          return (
            <MarkerF
              key={`${e.tipo}-${e.id}`}
              position={{ lat: e.lat, lng: e.lng }}
              onClick={() => onSeleccionar(e.id)}
              zIndex={destacado ? 999 : undefined}
              icon={{
                url: urlIconoMarcador(e.tipo, colorEntidad(e), destacado, atenuado),
                scaledSize: new google.maps.Size(destacado ? 34 : 28, destacado ? 44 : 36),
                anchor: new google.maps.Point(destacado ? 17 : 14, destacado ? 44 : 36),
              }}
            />
          )
        })}

        {/* Línea del par seleccionado (modo emparejamiento) */}
        {parSeleccionado && (
          <PolylineF
            path={[
              { lat: parSeleccionado.a.lat, lng: parSeleccionado.a.lng },
              { lat: parSeleccionado.b.lat, lng: parSeleccionado.b.lng },
            ]}
            options={{
              strokeColor: '#ff0033',
              strokeOpacity: 0,
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

        {entidadActiva && (
          <InfoWindowF
            position={{ lat: entidadActiva.lat, lng: entidadActiva.lng }}
            onCloseClick={() => onSeleccionar(null)}
          >
            <InfoEntidad
              entidad={entidadActiva}
              onVerFicha={onVerFicha}
              onSugerirDesde={onSugerirDesde}
            />
          </InfoWindowF>
        )}
      </GoogleMap>

      {/* Barra del par en curso */}
      {parSeleccionado && (
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
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
            Emparejando:
          </span>
          <ExtremoPar entidad={parSeleccionado.a} />
          <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>↔</span>
          <ExtremoPar entidad={parSeleccionado.b} />
          <span
            style={{
              fontSize: 11.5,
              fontWeight: 750,
              background: 'var(--color-primary, #ff0033)',
              color: '#fff',
              borderRadius: 999,
              padding: '3px 9px',
              whiteSpace: 'nowrap',
            }}
          >
            {formatKm(parSeleccionado.distanciaKm)} · {formatMin(parSeleccionado.tiempoMinutos)}
          </span>
          <button
            type="button"
            onClick={onLimpiarPar}
            aria-label="Limpiar par"
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
      )}
    </div>
  )
}

function ExtremoPar({ entidad }: { entidad: EntidadMapa }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
      <IconoEntidad tipo={entidad.tipo} color={colorEntidad(entidad)} size={14} />
      <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{entidad.nombre}</span>
    </span>
  )
}

/**
 * InfoWindow compacto: identidad + las 3 señales que definen la decisión
 * (licencia, zona peligrosa, compañero). El resto de los datos vive en la
 * ficha completa, que se abre desde acá.
 */
function InfoEntidad({
  entidad: e,
  onVerFicha,
  onSugerirDesde,
}: {
  entidad: EntidadMapa
  onVerFicha: (e: EntidadMapa) => void
  onSugerirDesde: (e: EntidadMapa) => void
}) {
  const badge =
    e.tipo === 'conductor'
      ? getEstadoConductorBadgeStyle({ codigo: e.estadoCodigo || undefined })
      : { bg: getLeadEstadoColor(e.estadoLead), color: 'white' }

  const d = e.datos

  return (
    <div style={{ padding: '4px 2px', minWidth: 214, maxWidth: 274 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <IconoEntidad tipo={e.tipo} color={colorEntidad(e)} size={15} />
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
          <Badge tono="bad">Sin compañero{e.turnoLibreAsignacion ? ` · falta ${e.turnoLibreAsignacion}` : ''}</Badge>
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

      <div style={{ display: 'flex', gap: 6, marginTop: 9 }}>
        <BotonPrimario onClick={() => onSugerirDesde(e)}>Sugerir compañero</BotonPrimario>
        <BotonSecundario onClick={() => onVerFicha(e)}>Ver ficha →</BotonSecundario>
      </div>
    </div>
  )
}
