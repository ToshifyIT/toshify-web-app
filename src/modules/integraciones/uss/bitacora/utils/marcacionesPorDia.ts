// src/modules/integraciones/uss/bitacora/utils/marcacionesPorDia.ts
//
// Marcaciones de GEOTAB: 1 fila por conductor por DIA calendario (hora AR).
//
// geotab_bitacora guarda las "cards" del reporte de Geotab: un bloque de manejo
// continuo, que puede ser varios por dia o cruzar la medianoche (ej: Maciel S40
// tenia 8 cards en una semana de 7 dias). Para que la grilla muestre un dia por
// fila se rearma todo desde los viajes crudos (geotab_historico):
//
//  - Un viaje que cruza la medianoche se parte en dos; los km se reparten en
//    proporcion al tiempo de cada parte.
//  - Entrada = inicio del primer viaje del dia, Salida = fin del ultimo,
//    Tiempo conducido = suma de los viajes, Km = suma de los viajes.
//  - Los dias del rango sin viajes salen igual, con estado 'Sin Actividad'.
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

const r2 = (n: number) => Math.round(n * 100) / 100;

export function esMarcacionPorDia(m: Pick<Marcacion, 'id'>): boolean {
  return m.id.startsWith(PREFIJO_ID_DIA);
}

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

function diasDelRango(desde: string, hasta: string): string[] {
  const dias: string[] = [];
  let ms = Date.parse(`${desde}T00:00:00Z`);
  const fin = Date.parse(`${hasta}T00:00:00Z`);
  while (ms <= fin && dias.length < MAX_DIAS) {
    dias.push(fechaDe(ms));
    ms += MS_DIA;
  }
  return dias;
}

interface TramoDia {
  inicio: number;
  fin: number;
  km: number;
  patente: string;
}

/** Parte el viaje en la medianoche AR y devuelve un tramo por cada dia que toca. */
function tramosPorDia(v: ViajeGeotab): Array<[string, TramoDia]> {
  const ini = msPared(v.fecha_hora_inicio_gmt3);
  const finRaw = msPared(v.fecha_hora_fin_gmt3);
  if (ini === null) return [];
  const fin = finRaw !== null && finRaw > ini ? finRaw : ini;
  const km = Number(v.kilometraje) || 0;
  const patente = (v.patente || '').replace(/[\s-]/g, '').toUpperCase();
  const total = fin - ini;

  const tramos: Array<[string, TramoDia]> = [];
  let desde = ini;
  do {
    const medianoche = Date.parse(`${fechaDe(desde)}T00:00:00Z`) + MS_DIA;
    const hasta = Math.min(fin, medianoche);
    const proporcion = total > 0 ? (hasta - desde) / total : 1;
    tramos.push([fechaDe(desde), { inicio: desde, fin: hasta, km: km * proporcion, patente }]);
    desde = hasta;
  } while (desde < fin);
  return tramos;
}

/**
 * Reemplaza las cards de GEOTAB por 1 fila por conductor por dia de [desde, hasta].
 * Si no hay viajes devuelve las marcaciones tal cual.
 */
export function agruparMarcacionesPorDia(
  marcaciones: Marcacion[],
  viajes: ViajeGeotab[],
  desde: string,
  hasta: string,
): Marcacion[] {
  if (viajes.length === 0) return marcaciones;

  // Viajes por conductor -> dia -> tramos
  const tramosPorConductor = new Map<string, Map<string, TramoDia[]>>();
  for (const v of viajes) {
    if (!esConductorIdentificado(v.conductor)) continue;
    const clave = normalizarNombre(v.conductor);
    let porDia = tramosPorConductor.get(clave);
    if (!porDia) {
      porDia = new Map();
      tramosPorConductor.set(clave, porDia);
    }
    for (const [dia, tramo] of tramosPorDia(v)) {
      const lista = porDia.get(dia);
      if (lista) lista.push(tramo);
      else porDia.set(dia, [tramo]);
    }
  }

  // Cards de GEOTAB agrupadas por conductor (solo los que tienen viajes)
  const cardsPorConductor = new Map<string, Marcacion[]>();
  const resto: Marcacion[] = [];
  for (const m of marcaciones) {
    const clave = normalizarNombre(m.conductor);
    if (m.gpsOrigen === 'GEOTAB' && esConductorIdentificado(m.conductor)
      && tramosPorConductor.has(clave)) {
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
    const porDia = tramosPorConductor.get(clave) ?? new Map<string, TramoDia[]>();
    // Base del dia: la card que EMPIEZA ese dia (horario/modalidad resueltos por el
    // sync para esa fecha); si no hay, la primera del conductor.
    const empiezaEl = (c: Marcacion, dia: string) =>
      (c.inicioGmt3 || c.periodoInicio || c.fecha || '').slice(0, 10) === dia;

    for (const dia of dias) {
      const cardsDelDia = cards.filter(c => empiezaEl(c, dia));
      const base = cardsDelDia[0] ?? cards[0];
      const tramos = (porDia.get(dia) || []).sort((a, b) => a.inicio - b.inicio);
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
      // Un viaje cortado en la medianoche termina a las 00:00 del dia siguiente:
      // se muestra como 23:59:59 del mismo dia para que la salida no salte de fecha.
      const finReal = Math.max(...tramos.map(t => t.fin));
      const fin = finReal % MS_DIA === 0 ? finReal - 1000 : finReal;
      const minutos = tramos.reduce((s, t) => s + (t.fin - t.inicio), 0) / 60000;
      const patentes = [...new Set(tramos.map(t => t.patente).filter(Boolean))];
      // 'En Curso' solo si una card que arranca ese dia sigue abierta.
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
