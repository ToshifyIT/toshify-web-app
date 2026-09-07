// src/modules/onboarding/distribucion-mapa-v2/components/SugerenciasDrawer.tsx
//
// Panel derecho de la propuesta B: los pares candidatos ordenados por score y
// tiempo de viaje, con el umbral regulable y las señales de decisión visibles
// en cada tarjeta.
//
// El panel NO escribe nada: propone, permite ver el par en el mapa, copiar sus
// datos y saltar a Programación. Cualquier alta sigue haciéndose en el wizard
// de programación, que es donde vive esa lógica.

import { Loader2, Sparkles, X } from 'lucide-react'
import { Badge, BotonPrimario, BotonSecundario, Chip, GrupoTitulo, Hint } from './ui'
import { IconoEntidad } from './iconos'
import { colorEntidad } from './colores'
import type { CombinacionesPar, EntidadMapa, ParSugerido } from '../types'
import { formatKm, formatMin } from '../utils'
import { UMBRAL_MINUTOS_MAX, UMBRAL_MINUTOS_MIN } from '../emparejamientoService'

interface Props {
  base: EntidadMapa | null
  pares: ParSugerido[]
  cargando: boolean
  aviso: string | null
  umbral: number
  onUmbralChange: (v: number) => void
  combinaciones: CombinacionesPar
  onCombinacionesChange: (c: CombinacionesPar) => void
  parSeleccionado: ParSugerido | null
  onSeleccionarPar: (p: ParSugerido) => void
  onCopiarPar: (p: ParSugerido) => void
  onProgramar: (p: ParSugerido) => void
  onCerrar: () => void
  onRecalcular: () => void
}

export function SugerenciasDrawer({
  base,
  pares,
  cargando,
  aviso,
  umbral,
  onUmbralChange,
  combinaciones,
  onCombinacionesChange,
  parSeleccionado,
  onSeleccionarPar,
  onCopiarPar,
  onProgramar,
  onCerrar,
  onRecalcular,
}: Props) {
  return (
    <div
      style={{
        width: 384,
        flexShrink: 0,
        borderLeft: '1px solid var(--border-primary)',
        background: 'var(--bg-secondary)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Cabecera */}
      <div
        style={{
          padding: '12px 14px 11px',
          background: 'var(--bg-primary)',
          borderBottom: '1px solid var(--border-primary)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 14,
              fontWeight: 750,
              color: 'var(--text-primary)',
            }}
          >
            <Sparkles size={15} style={{ color: 'var(--color-primary, #ff0033)' }} />
            Compañeros sugeridos
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Badge tono="neutro">{pares.length} pares</Badge>
            <button
              type="button"
              onClick={onCerrar}
              aria-label="Cerrar sugerencias"
              style={{
                border: '1px solid var(--border-primary)',
                background: 'var(--bg-secondary)',
                borderRadius: 7,
                cursor: 'pointer',
                padding: '3px 6px',
                display: 'flex',
                color: 'var(--text-secondary)',
              }}
            >
              <X size={13} />
            </button>
          </div>
        </div>

        <Hint>
          {base
            ? `Base: ${base.nombre}${base.zona ? ` · ${base.zona}` : ''}`
            : 'Base: todos los conductores sin compañero visibles'}
        </Hint>

        {/* Umbral de tiempo */}
        <div
          style={{
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 9,
            padding: '9px 11px',
            marginTop: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-primary)' }}>
              Tiempo máximo de viaje
            </span>
            <Badge tono="bad">{umbral} min</Badge>
          </div>
          <input
            type="range"
            min={UMBRAL_MINUTOS_MIN}
            max={UMBRAL_MINUTOS_MAX}
            step={1}
            value={umbral}
            onChange={(e) => onUmbralChange(Number(e.target.value))}
            style={{ width: '100%', marginTop: 8, accentColor: 'var(--color-primary, #ff0033)' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Hint>{UMBRAL_MINUTOS_MIN} min</Hint>
            <Hint>{UMBRAL_MINUTOS_MAX} min</Hint>
          </div>
        </div>

        {/* Combinaciones habilitadas */}
        <div style={{ marginTop: 10 }}>
          <GrupoTitulo>Combinaciones</GrupoTitulo>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            <Chip
              activo={combinaciones.conductorConductor}
              onClick={() =>
                onCombinacionesChange({
                  ...combinaciones,
                  conductorConductor: !combinaciones.conductorConductor,
                })
              }
            >
              Conductor ↔ Conductor
            </Chip>
            <Chip
              activo={combinaciones.conductorLead}
              onClick={() =>
                onCombinacionesChange({ ...combinaciones, conductorLead: !combinaciones.conductorLead })
              }
            >
              Conductor ↔ Lead
            </Chip>
            <Chip
              activo={combinaciones.leadLead}
              onClick={() =>
                onCombinacionesChange({ ...combinaciones, leadLead: !combinaciones.leadLead })
              }
            >
              Lead ↔ Lead
            </Chip>
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <BotonPrimario onClick={onRecalcular} disabled={cargando} full>
            {cargando ? (
              <>
                <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Calculando...
              </>
            ) : (
              <>Recalcular sugerencias</>
            )}
          </BotonPrimario>
        </div>

        {aviso && (
          <div
            style={{
              marginTop: 9,
              background: '#fef3e2',
              color: '#b45309',
              borderRadius: 8,
              padding: '7px 9px',
              fontSize: 10.5,
              lineHeight: 1.4,
            }}
          >
            {aviso}
          </div>
        )}
      </div>

      {/* Lista de pares */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 13px' }}>
        {cargando && pares.length === 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: 24,
              color: 'var(--text-tertiary)',
              fontSize: 12.5,
            }}
          >
            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
            Midiendo distancias reales...
          </div>
        )}

        {!cargando && pares.length === 0 && (
          <div
            style={{
              padding: 22,
              textAlign: 'center',
              color: 'var(--text-tertiary)',
              fontSize: 12.5,
              lineHeight: 1.5,
            }}
          >
            No hay pares dentro de {umbral} minutos con los filtros actuales.
            <br />
            Probá subir el umbral o habilitar más combinaciones.
          </div>
        )}

        {pares.map((par) => (
          <TarjetaPar
            key={par.id}
            par={par}
            seleccionado={parSeleccionado?.id === par.id}
            onSeleccionar={() => onSeleccionarPar(par)}
            onCopiar={() => onCopiarPar(par)}
            onProgramar={() => onProgramar(par)}
          />
        ))}
      </div>
    </div>
  )
}

function TarjetaPar({
  par,
  seleccionado,
  onSeleccionar,
  onCopiar,
  onProgramar,
}: {
  par: ParSugerido
  seleccionado: boolean
  onSeleccionar: () => void
  onCopiar: () => void
  onProgramar: () => void
}) {
  return (
    <div
      style={{
        background: 'var(--bg-primary)',
        border: `1px solid ${seleccionado ? 'var(--color-primary, #ff0033)' : 'var(--border-primary)'}`,
        boxShadow: seleccionado ? '0 0 0 3px rgba(255,0,51,.10)' : undefined,
        borderRadius: 11,
        padding: '11px 12px',
        marginBottom: 10,
      }}
    >
      <ExtremoTarjeta entidad={par.a} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 0 6px 22px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 7 }}>
          <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.3px', color: 'var(--text-primary)' }}>
            {formatKm(par.distanciaKm)}
          </span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-secondary)' }}>
            {formatMin(par.tiempoMinutos)}
          </span>
        </span>
        <span style={{ flex: 1, borderTop: '2px dashed var(--border-primary)' }} />
        <Badge tono={par.score >= 70 ? 'ok' : par.score >= 45 ? 'warn' : 'bad'}>
          score {par.score}
        </Badge>
      </div>

      <ExtremoTarjeta entidad={par.b} />

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
        {par.fuenteTiempo === 'estimado' && <Badge tono="warn">Tiempo estimado</Badge>}
        {par.motivos.map((m, i) => (
          <Badge key={`${par.id}-m${i}`} tono={m.tipo === 'ok' ? 'ok' : m.tipo === 'warn' ? 'warn' : 'bad'}>
            {m.texto}
          </Badge>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <BotonSecundario onClick={onSeleccionar}>Ver en mapa</BotonSecundario>
        <BotonSecundario onClick={onCopiar}>Copiar</BotonSecundario>
        <BotonPrimario onClick={onProgramar}>Programar entrega</BotonPrimario>
      </div>
    </div>
  )
}

function ExtremoTarjeta({ entidad }: { entidad: EntidadMapa }) {
  const meta = [
    entidad.tipo === 'lead' ? `Lead · ${entidad.estadoLead || 'sin estado'}` : 'Conductor',
    entidad.documento ? `DNI ${entidad.documento}` : null,
    entidad.zona,
    entidad.patenteAsignacion,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
      <span style={{ marginTop: 2 }}>
        <IconoEntidad tipo={entidad.tipo} color={colorEntidad(entidad)} size={15} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 750, letterSpacing: '-.1px', color: 'var(--text-primary)' }}>
          {entidad.nombre}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 1 }}>{meta}</div>
      </div>
    </div>
  )
}
