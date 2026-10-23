// src/modules/integraciones/uss/bitacora/utils/marcacionesPorDia.ts
//
// Marcaciones de GEOTAB: 1 fila por conductor por JORNADA (hora AR).
//
// geotab_bitacora guarda las "cards" del reporte de Geotab: un bloque de manejo
// continuo, que puede ser varios por dia o cruzar la medianoche (ej: Maciel S40
// tenia 8 cards en una semana de 7 dias). Para que la grilla muestre una jornada
// por fila se rearma todo desde los viajes crudos (geotab_historico):
//
//  - Los viajes NO se parten: cada viaje entero va a la jornada en la que empieza.
//  - Diurno / A cargo: la jornada es el dia calendario del inicio del viaje.
//  - Nocturno: la jornada va de las 12:00 de un dia a las 12:00 del siguiente, asi
//    un turno de 21 hs a 6 hs queda en una sola fila (entrada y salida reales, como
//    en Geotab) en el dia en que empezo.
//  - Entrada = inicio del primer viaje de la jornada, Salida = fin del ultimo,
//    Tiempo conducido = suma de los viajes, Km = suma de los viajes.
//  - Los dias del rango sin viajes salen igual, con estado 'Sin Actividad' (salvo que el
//    conductor este de BAJA: ahi solo se muestran los dias con actividad).
//    Los dias que todavia no pasaron (despues de hoy, hora AR) no salen.
//
// Solo se tocan los conductores identificados de GEOTAB que tienen viajes. USS
// (ya viene 1 fila por dia), las filas "Sin conductor" y cualquier conductor cuyo
// nombre no aparezca en los viajes quedan como estaban.

import type { Marcacion } from '../hooks/useUSSHistoricoData';
import type { ViajeGeotab } from '../../../../../services/wialonBitacoraService';

/** Prefijo del id de las filas armadas aca: no existen en la base (checklist de solo lectura). */
export const PREFIJO_ID_DIA = 'dia-';

/** Tope de dias que se rellenan por conductor (un rango enorme no explota la grilla). */
const MAX_DIAS = 62;

const KM_MINIMO_ACTIVIDAD = 0.01;
const MS_DIA = 24 * 60 * 60 * 1000;
/** La jornada nocturna empieza a las 12:00: de 12:00 de un dia a 12:00 del siguiente. */
const CORTE_JORNADA_NOCTURNA_MS = 12 * 60 * 60 * 1000;

const r2 = (n: number) => Math.round(n * 100) / 100;

function normalizarNombre(nombre: string | null | undefined): string {
  return (nombre || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim().replace(/\s+/g, ' ').toUpperCase();
}

/** Conductor real: ni vacio, ni "Sin conductor", ni un id numerico suelto. */
function esConductorIdentificado(nombre: string | null | undefined): boolean {
  const n = normalizarNombre(nombre);
  return !!n && n !== 'SIN CONDUCTOR' && !/^\d+\s*-?\s*$/.test(n);
}

/**
 * Clave del checklist (tabla bitacora_checklist): conductor normalizado + jornada.
 * null si la fila no lleva checklist: sin conductor identificado o sin actividad.
 */
export function claveChecklist(
  m: Pick<Marcacion, 'conductor' | 'fecha' | 'estado'>,
): { conductor: string; fecha: string } | null {
  if (m.estado === 'Sin Actividad' || !esConductorIdentificado(m.conductor)) return null;
  const fecha = (m.fecha || '').slice(0, 10);
  if (!fecha) return null;
  return { conductor: normalizarNombre(m.conductor), fecha };
}

/**
 * Los timestamps de Geotab vienen en hora AR sin offset ("2026-09-28T23:10:05").
 * Se leen como UTC solo para hacer cuentas: la fecha/hora "de pared" queda intacta.
 */
function msPared(ts: string | null): number | null {
  if (!ts) return null;
  const limpio = ts.replace(' ', 'T').replace(/(Z|[+-]\d{2}:?\d{2})$/, '').slice(0, 19);
  const ms = Date.parse(`${limpio}Z`);
  return Number.isNaN(ms) ? null : ms;
}

const fechaDe = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const horaDe = (ms: number) => new Date(ms).toISOString().slice(11, 19);
const isoParedDe = (ms: number) => new Date(ms).toISOString().slice(0, 19);

/** Hoy (yyyy-MM-dd) en hora AR. */
function hoyAR(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
}

/** Dias del rango, sin pasar de hoy: los dias que todavia no ocurrieron no tienen fila. */
function diasDelRango(desde: string, hasta: string): string[] {
  const dias: string[] = [];
  const tope = hasta < hoyAR() ? hasta : hoyAR();
  let ms = Date.parse(`${desde}T00:00:00Z`);
  const fin = Date.parse(`${tope}T00:00:00Z`);
  while (ms <= fin && dias.length < MAX_DIAS) {
    dias.push(fechaDe(ms));
    ms += MS_DIA;
  }
  return dias;
}

interface ViajeJornada {
  inicio: number;
  fin: number;
  km: number;
  patente: string;
}

/** Viaje entero (sin partir en la medianoche) con inicio/fin en ms "de pared". */
function aViajeJornada(v: ViajeGeotab): ViajeJornada | null {
  const ini = msPared(v.fecha_hora_inicio_gmt3);
  const finRaw = msPared(v.fecha_hora_fin_gmt3);
  if (ini === null) return null;
  return {
    inicio: ini,
    fin: finRaw !== null && finRaw > ini ? finRaw : ini,
    km: Number(v.kilometraje) || 0,
    patente: (v.patente || '').replace(/[\s-]/g, '').toUpperCase(),
  };
}

/** Jornada (yyyy-MM-dd) a la que pertenece algo que empieza en `inicioMs`. */
function jornadaDe(inicioMs: number, esNocturno: boolean): string {
  return fechaDe(esNocturno ? inicioMs - CORTE_JORNADA_NOCTURNA_MS : inicioMs);
}

/** Nocturno si la mayoria de sus cards de la semana son de horario nocturno. */
function esConductorNocturno(cards: Marcacion[]): boolean {
  const nocturnas = cards.filter(c => c.horario === 'nocturno').length;
  return nocturnas > cards.length / 2;
}

/**
 * Reemplaza las cards de GEOTAB por 1 fila por conductor por jornada de [desde, hasta].
 * `viajes` debe incluir los que empiezan hasta el dia siguiente a `hasta` antes de
 * las 12:00 (cierre de la ultima jornada nocturna).
 * Si no hay viajes devuelve las marcaciones tal cual.
 */
export function agruparMarcacionesPorDia(
  marcaciones: Marcacion[],
  viajes: ViajeGeotab[],
  desde: string,
  hasta: string,
): Marcacion[] {
  if (viajes.length === 0) return marcaciones;

  // Viajes enteros por conductor
  const viajesPorConductor = new Map<string, ViajeJornada[]>();
  for (const v of viajes) {
    if (!esConductorIdentificado(v.conductor)) continue;
    const viaje = aViajeJornada(v);
    if (!viaje) continue;
    const clave = normalizarNombre(v.conductor);
    const lista = viajesPorConductor.get(clave);
    if (lista) lista.push(viaje);
    else viajesPorConductor.set(clave, [viaje]);
  }

  // Cards de GEOTAB agrupadas por conductor (solo los que tienen viajes)
  const cardsPorConductor = new Map<string, Marcacion[]>();
  const resto: Marcacion[] = [];
  for (const m of marcaciones) {
    const clave = normalizarNombre(m.conductor);
    if (m.gpsOrigen === 'GEOTAB' && esConductorIdentificado(m.conductor)
      && viajesPorConductor.has(clave)) {
      const lista = cardsPorConductor.get(clave);
      if (lista) lista.push(m);
      else cardsPorConductor.set(clave, [m]);
    } else {
      resto.push(m);
    }
  }

  const dias = diasDelRango(desde, hasta);
  const filas: Marcacion[] = [];

  for (const [clave, cards] of cardsPorConductor) {
    const esNocturno = esConductorNocturno(cards);
    const esBaja = cards.some(c => (c.conductorEstado || '').toUpperCase() === 'BAJA');
    const porJornada = new Map<string, ViajeJornada[]>();
    for (const v of viajesPorConductor.get(clave) ?? []) {
      const jornada = jornadaDe(v.inicio, esNocturno);
      const lista = porJornada.get(jornada);
      if (lista) lista.push(v);
      else porJornada.set(jornada, [v]);
    }
    // Base de la jornada: la card que EMPIEZA en ella (horario/modalidad resueltos por
    // el sync para esa fecha); si no hay, la primera del conductor.
    const empiezaEn = (c: Marcacion, dia: string) => {
      const ms = msPared(c.inicioGmt3 || c.periodoInicio);
      return ms !== null ? jornadaDe(ms, esNocturno) === dia : (c.fecha || '').slice(0, 10) === dia;
    };

    for (const dia of dias) {
      const cardsDelDia = cards.filter(c => empiezaEn(c, dia));
      const base = cardsDelDia[0] ?? cards[0];
      const tramos = (porJornada.get(dia) || []).sort((a, b) => a.inicio - b.inicio);
      const km = r2(tramos.reduce((s, t) => s + t.km, 0));
      const comun = {
        ...base,
        id: `${PREFIJO_ID_DIA}GEOTAB-${clave}-${dia}`,
        fecha: dia,
        // El checklist vive en cada card de la base; la fila del dia no lo persiste.
        gncCargado: false,
        lavadoRealizado: false,
        naftaCargada: false,
      };

      if (tramos.length === 0 || km < KM_MINIMO_ACTIVIDAD) {
        // Conductor dado de baja: sus dias sin actividad no aportan nada, no se arman.
        if (esBaja) continue;
        filas.push({
          ...comun,
          entrada: '-',
          salida: '-',
          periodoInicio: null,
          periodoFin: null,
          inicioGmt3: null,
          finGmt3: null,
          kmTotal: 0,
          duracionMinutos: 0,
          estado: 'Sin Actividad',
        });
        continue;
      }

      const inicio = tramos[0].inicio;
      // Salida real del ultimo viaje: en un nocturno puede ser del dia siguiente.
      const fin = Math.max(...tramos.map(t => t.fin));
      const minutos = tramos.reduce((s, t) => s + (t.fin - t.inicio), 0) / 60000;
      const patentes = [...new Set(tramos.map(t => t.patente).filter(Boolean))];
      // 'En Curso' solo si una card que arranca en la jornada sigue abierta.
      const estado = cardsDelDia.some(c => c.estado === 'En Curso') ? 'En Curso' : 'Turno Finalizado';

      filas.push({
        ...comun,
        patente: patentes.join(' / ') || base.patente,
        patenteNormalizada: patentes[0] || base.patenteNormalizada,
        entrada: horaDe(inicio),
        salida: horaDe(fin),
        periodoInicio: isoParedDe(inicio),
        periodoFin: isoParedDe(fin),
        inicioGmt3: isoParedDe(inicio),
        finGmt3: isoParedDe(fin),
        kmTotal: km,
        duracionMinutos: Math.round(minutos),
        estado,
      });
    }
  }

  // Mas reciente primero: fecha desc, despues entrada desc (Sin Actividad al final del dia)
  const clave = (m: Marcacion) => `${m.fecha || ''}T${m.inicioGmt3 || m.periodoInicio || ''}`;
  return [...filas, ...resto].sort((a, b) => clave(b).localeCompare(clave(a)));
}
