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

import { CheckSquare, Search, Square, Users, UserPlus, X } from 'lucide-react'
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
  /** Cantidad de filtros apartados de su valor inicial (0 = nada que limpiar). */
  filtrosActivos: number
  onLimpiar: () => void
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
  filtrosActivos,
  onLimpiar,
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
        // El ancho lo fija el contenedor deslizable del módulo (ANCHO_SIDEBAR);
        // acá se llena el 100% para no tener dos números que mantener iguales.
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
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

        {/* Limpiar filtros: aparece sólo cuando hay algo apartado del inicial. */}
        {filtrosActivos > 0 && (
          <button
            type="button"
            onClick={onLimpiar}
            title="Vuelve todos los filtros a su valor inicial. Mantiene el segmento elegido."
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              width: '100%',
              padding: '7px 10px',
              border: '1px solid var(--color-primary, #ff0033)',
              borderRadius: 8,
              background: 'transparent',
              color: 'var(--color-primary, #ff0033)',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <X size={13} />
            Limpiar filtros ({filtrosActivos})
          </button>
        )}

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
              {/* Marcar / desmarcar los 14 de una: con 14 casillas, tildar una
                  por una para "quiero ver todo el pipeline" es un castigo. */}
              {(() => {
                const todos = estadosLeadDisponibles.length > 0 &&
                  estadosLeadDisponibles.every((e) => filtros.estadosLead.has(e))
                return (
                  <button
                    type="button"
                    onClick={() =>
                      onChange({ estadosLead: todos ? new Set() : new Set(estadosLeadDisponibles) })
                    }
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      marginBottom: 6,
                      padding: '4px 9px',
                      border: '1px solid var(--border-primary)',
                      borderRadius: 7,
                      background: 'var(--bg-secondary)',
                      color: 'var(--text-secondary)',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {todos ? <Square size={12} /> : <CheckSquare size={12} />}
                    {todos ? 'Quitar todos' : `Seleccionar todos (${estadosLeadDisponibles.length})`}
                  </button>
                )
              })()}
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
                Al abrir vienen marcados los dos estados de inducción; sin selección se
                muestran todos. Los leads descartados y los ubicados en zona restringida
                no entran al mapa.
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
              {/* "Fuera de zona restringida" no se ofrece para leads: los que
                  están en zona restringida ya no entran al módulo (ver
                  fetchLeadsMapa). Ofrecerlo sería un filtro que nunca cambia nada. */}
              {REQUISITOS.filter((r) => r.value !== 'fuera_zona_peligrosa').map((r) => (
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
