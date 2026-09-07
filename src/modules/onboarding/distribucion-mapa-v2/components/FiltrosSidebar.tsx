// src/modules/onboarding/distribucion-mapa-v2/components/FiltrosSidebar.tsx
//
// Panel de filtros del v2.
//
// Cambio central respecto del v1: los filtros están SEGMENTADOS. Un selector
// Conductores / Leads / Ambos decide qué se ve en el mapa y, a la vez, qué
// bloque de filtros se muestra, de modo que nunca convivan controles que no
// aplican al segmento activo:
//   - Turno       -> aplica a AMBOS, con semántica distinta (asignación actual
//                    o preferencia en conductores; preferencia declarada en leads).
//   - Asignación  -> sólo conductores.
//   - Compañero   -> sólo conductores (filtro nuevo).
//   - Estado      -> "estado del conductor" vs "estado de lead" (los 14).
//   - Zona        -> GLOBAL: se aplica a conductores y leads por igual.

import { Search, Users, UserPlus } from 'lucide-react'
import { Acordeon, CheckRow, Chip, GrupoTitulo, Hint } from './ui'
import { IconoEntidad } from './iconos'
import { getLeadEstadoColor } from '../../../leads/leadEstadoColors'
import {
  ASIGNACION_OPCIONES,
  COMPANERO_OPCIONES,
  REQUISITOS,
  TURNOS,
  ZONAS,
  type FiltrosV2,
  type SegmentoV2,
} from './filtrosOpciones'

interface Props {
  filtros: FiltrosV2
  onChange: (patch: Partial<FiltrosV2>) => void
  /** Estados de lead disponibles (derivados de los datos cargados). */
  estadosLeadDisponibles: string[]
  conteoConductores: number
  conteoLeads: number
  conteoSinCompanero: number
}

function alternar(set: Set<string>, valor: string): Set<string> {
  const next = new Set(set)
  if (next.has(valor)) next.delete(valor)
  else next.add(valor)
  return next
}

function resumen(set: Set<string>, vacio = 'Todos'): string {
  return set.size === 0 ? vacio : `${set.size} activo${set.size === 1 ? '' : 's'}`
}

export function FiltrosSidebar({
  filtros,
  onChange,
  estadosLeadDisponibles,
  conteoConductores,
  conteoLeads,
  conteoSinCompanero,
}: Props) {
  const verConductores = filtros.segmento !== 'leads'
  const verLeads = filtros.segmento !== 'conductores'

  const segmentos: Array<{ value: SegmentoV2; label: string; n?: number }> = [
    { value: 'conductores', label: 'Conductores', n: conteoConductores },
    { value: 'leads', label: 'Leads', n: conteoLeads },
    { value: 'ambos', label: 'Ambos' },
  ]

  return (
    <div
      style={{
        width: 250,
        flexShrink: 0,
        borderRight: '1px solid var(--border-primary)',
        background: 'var(--bg-primary)',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
      }}
    >
      <div style={{ padding: 13, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Buscador global */}
        <div style={{ position: 'relative' }}>
          <Search
            size={14}
            style={{
              position: 'absolute',
              left: 9,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-tertiary)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            placeholder="Buscar nombre, apellido o DNI..."
            value={filtros.busqueda}
            onChange={(e) => onChange({ busqueda: e.target.value })}
            style={{
              width: '100%',
              padding: '8px 10px 8px 27px',
              border: '1px solid var(--border-primary)',
              borderRadius: 8,
              fontSize: 12.5,
              outline: 'none',
              boxSizing: 'border-box',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
        <Hint>
          Busca por palabras sueltas y en cualquier orden: “matias albarado”,
          “albarado matias” y el DNI devuelven lo mismo.
        </Hint>

        {/* Selector de segmento */}
        <div
          style={{
            display: 'flex',
            gap: 2,
            background: 'var(--bg-secondary)',
            borderRadius: 9,
            padding: 3,
          }}
        >
          {segmentos.map((s) => {
            const activo = filtros.segmento === s.value
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => onChange({ segmento: s.value })}
                style={{
                  flex: 1,
                  border: 'none',
                  borderRadius: 7,
                  padding: '6px 2px',
                  fontSize: 11.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: activo ? 'var(--bg-primary)' : 'transparent',
                  color: activo ? 'var(--text-primary)' : 'var(--text-secondary)',
                  boxShadow: activo ? '0 1px 3px rgba(0,0,0,.14)' : undefined,
                }}
              >
                {s.label}
                {s.n !== undefined && (
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}> {s.n}</span>
                )}
              </button>
            )
          })}
        </div>

        {/* ---------- Bloque CONDUCTORES ---------- */}
        {verConductores && (
          <div>
            <GrupoTitulo>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Users size={12} /> Filtros de conductores
              </span>
            </GrupoTitulo>

            <Acordeon titulo="Estado" resumen={filtros.verBaja ? 'Incluye baja' : 'Sin baja'}>
              <CheckRow
                label="Incluir de baja"
                checked={filtros.verBaja}
                onChange={() => onChange({ verBaja: !filtros.verBaja })}
              />
              <Hint>Los de baja se muestran atenuados en el mapa.</Hint>
            </Acordeon>

            <Acordeon titulo="Turno" resumen={resumen(filtros.turnosConductor)}>
              {TURNOS.map((t) => (
                <CheckRow
                  key={t.value}
                  label={t.label}
                  checked={filtros.turnosConductor.has(t.value)}
                  onChange={() =>
                    onChange({ turnosConductor: alternar(filtros.turnosConductor, t.value) })
                  }
                />
              ))}
              <Hint>Sale de la asignación actual; si no tiene, de su preferencia.</Hint>
            </Acordeon>

            <Acordeon titulo="Asignación" resumen={resumen(filtros.asignacion)}>
              {ASIGNACION_OPCIONES.map((a) => (
                <CheckRow
                  key={a.value}
                  label={a.label}
                  checked={filtros.asignacion.has(a.value)}
                  onChange={() => onChange({ asignacion: alternar(filtros.asignacion, a.value) })}
                />
              ))}
              <Hint>Con asignación = asignación activa vigente con vehículo.</Hint>
            </Acordeon>

            <Acordeon
              titulo="Compañero"
              resumen={resumen(filtros.companero)}
              destacado
              defaultAbierto
            >
              {COMPANERO_OPCIONES.map((c) => (
                <CheckRow
                  key={c.value}
                  label={
                    c.value === 'sin' ? `${c.label} (${conteoSinCompanero})` : c.label
                  }
                  checked={filtros.companero.has(c.value)}
                  onChange={() => onChange({ companero: alternar(filtros.companero, c.value) })}
                />
              ))}
              <Hint>
                Sin compañero = tiene asignación activa por turno y el turno
                complementario de ese vehículo está vacío.
              </Hint>
            </Acordeon>

            <Acordeon titulo="Requisitos" resumen={resumen(filtros.requisitosConductor, 'Ninguno')}>
              {REQUISITOS.map((r) => (
                <CheckRow
                  key={r.value}
                  label={r.label}
                  checked={filtros.requisitosConductor.has(r.value)}
                  onChange={() =>
                    onChange({ requisitosConductor: alternar(filtros.requisitosConductor, r.value) })
                  }
                />
              ))}
            </Acordeon>
          </div>
        )}

        {/* ---------- Bloque LEADS ---------- */}
        {verLeads && (
          <div>
            <GrupoTitulo>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <UserPlus size={12} /> Filtros de leads
              </span>
            </GrupoTitulo>

            <Acordeon
              titulo="Estado de lead"
              resumen={resumen(filtros.estadosLead)}
              defaultAbierto
            >
              {estadosLeadDisponibles.map((estado) => (
                <CheckRow
                  key={estado}
                  icon={<IconoEntidad tipo="lead" color={getLeadEstadoColor(estado)} size={11} />}
                  label={estado}
                  checked={filtros.estadosLead.has(estado)}
                  onChange={() => onChange({ estadosLead: alternar(filtros.estadosLead, estado) })}
                />
              ))}
              <Hint>
                Están los 14 estados del pipeline. Al abrir vienen marcados los dos
                de inducción; sin selección se muestran todos.
              </Hint>
            </Acordeon>

            <Acordeon titulo="Turno (preferencia)" resumen={resumen(filtros.turnosLead)}>
              {TURNOS.map((t) => (
                <CheckRow
                  key={t.value}
                  label={t.label}
                  checked={filtros.turnosLead.has(t.value)}
                  onChange={() => onChange({ turnosLead: alternar(filtros.turnosLead, t.value) })}
                />
              ))}
              <Hint>Turno que el lead declaró como preferencia.</Hint>
            </Acordeon>

            <Acordeon titulo="Requisitos" resumen={resumen(filtros.requisitosLead, 'Ninguno')}>
              {REQUISITOS.map((r) => (
                <CheckRow
                  key={r.value}
                  label={r.label}
                  checked={filtros.requisitosLead.has(r.value)}
                  onChange={() =>
                    onChange({ requisitosLead: alternar(filtros.requisitosLead, r.value) })
                  }
                />
              ))}
            </Acordeon>
          </div>
        )}

        {/* ---------- ZONA (global) ---------- */}
        <div
          style={{
            borderTop: '2px solid var(--border-primary)',
            paddingTop: 11,
            marginTop: 2,
          }}
        >
          <GrupoTitulo>Zona · aplica a conductores y leads</GrupoTitulo>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {ZONAS.map((z) => (
              <Chip
                key={z}
                activo={filtros.zonas.has(z)}
                onClick={() => onChange({ zonas: alternar(filtros.zonas, z) })}
              >
                {z}
              </Chip>
            ))}
          </div>
          <Hint>Sin selección = todas las zonas.</Hint>
        </div>
      </div>
    </div>
  )
}
