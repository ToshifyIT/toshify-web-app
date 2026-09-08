// src/modules/onboarding/distribucion-mapa-v2/types.ts
//
// Tipos del submódulo "Distribución en mapa v2".
// Superset de los tipos del v1 (distribucionMapaService.ts) más los datos
// adicionales de ficha (licencia, edad, experiencia, antecedentes, zona
// peligrosa) y el modelo de emparejamiento.
//
// El v1 NO se modifica: este módulo es una copia evolucionada e independiente.

export type TipoEntidadMapa = 'conductor' | 'lead'

/** Turno normalizado. 'todo_dia' se trata como sin preferencia. */
export type TurnoEfectivo = 'DIURNO' | 'NOCTURNO' | 'SIN_PREFERENCIA'

/** De dónde salió el turno efectivo (se muestra en el InfoWindow). */
export type OrigenTurno = 'asignacion' | 'preferencia' | 'lead' | 'ninguno'

/**
 * Estado de compañero de un conductor.
 * - sin_companero: tiene asignación activa por TURNO y el turno complementario
 *   de esa misma asignación está vacío.
 * - con_companero: el turno complementario está cubierto por otro conductor.
 * - no_aplica: no tiene asignación activa, o la asignación es 'todo_dia'
 *   (modalidad a cargo), donde el concepto de compañero no existe.
 */
export type EstadoCompanero = 'sin_companero' | 'con_companero' | 'no_aplica'

/** Vigencia de la licencia calculada a partir de la fecha de vencimiento. */
export type EstadoLicencia = 'vigente' | 'por_vencer' | 'vencida' | 'sin_dato'

/** Datos adicionales de ficha, comunes a conductor y lead. */
export interface DatosPersona {
  edad: number | null
  licenciaNumero: string | null
  licenciaVencimiento: string | null
  licenciaEstado: EstadoLicencia
  /** Días hasta el vencimiento (negativo si ya venció). null si no hay fecha. */
  licenciaDiasRestantes: number | null
  experiencia: string | null
  antecedentesPenales: boolean | null
  telefono: string | null
  /** Nombre de la zona peligrosa que contiene el domicilio, o null. */
  zonaPeligrosa: string | null
  /** Texto libre de antigüedad (lead) o fecha de contratación (conductor). */
  antiguedad: string | null
}

/** Shape normalizado para el mapa: conductores y leads comparten estas claves. */
export interface EntidadMapa {
  id: string
  tipo: TipoEntidadMapa
  nombre: string
  documento: string | null
  lat: number
  lng: number
  zona: string | null
  direccion: string | null

  // --- Conductor ---
  preferenciaTurno: string | null
  estadoCodigo: string | null
  estadoDescripcion: string | null
  esBaja: boolean
  tieneAsignacionActiva: boolean
  turnoEfectivo: TurnoEfectivo | null
  turnoOrigen: OrigenTurno
  horarioUltimaAsignacion: string | null
  /** Compañero: sólo tiene sentido para conductores. */
  estadoCompanero: EstadoCompanero
  /** Patente del vehículo de la asignación activa, si hay. */
  patenteAsignacion: string | null
  /** Turno que queda libre en la asignación activa ('diurno' | 'nocturno'). */
  turnoLibreAsignacion: 'diurno' | 'nocturno' | null

  // --- Lead ---
  estadoLead: string | null
  turnoLead: string | null

  // --- Común ---
  datos: DatosPersona
}

/** Motivo mostrado como chip en la tarjeta de par. */
export interface MotivoPar {
  tipo: 'ok' | 'warn' | 'bad'
  texto: string
}

/** Un par candidato entre dos entidades del mapa. */
export interface ParSugerido {
  id: string
  a: EntidadMapa
  b: EntidadMapa
  distanciaKm: number
  tiempoMinutos: number
  /** 'matrix' = Distance Matrix real; 'estimado' = fallback por Haversine. */
  fuenteTiempo: 'matrix' | 'estimado'
  turnosComplementarios: boolean
  score: number
  motivos: MotivoPar[]
}

/** Combinaciones habilitadas para sugerir pares. */
export interface CombinacionesPar {
  conductorConductor: boolean
  conductorLead: boolean
  leadLead: boolean
}

/** Opciones de cálculo de ruta (hora de salida, tráfico, peajes). */
export interface OpcionesRuta {
  /** 'YYYY-MM-DD' */
  fecha: string
  /** 'HH:mm' */
  hora: string
  conTrafico: boolean
  evitarPeajes: boolean
}

/** Resultado de una corrida de sugerencias. */
export interface ResultadoSugerencias {
  pares: ParSugerido[]
  /** Bases evaluadas (conductores/leads usados como origen). */
  basesEvaluadas: number
  /** true si se recortó por el tope de seguridad de llamadas a la API. */
  truncado: boolean
  /** Aviso a mostrar en la UI (p. ej. hora de salida desplazada al futuro). */
  aviso: string | null
}

/**
 * Conexión del modo "Ver todos en mapa": una línea desde la persona
 * seleccionada hacia otra entidad, con su distancia y tiempo reales.
 */
export interface ConexionRadar {
  entidad: EntidadMapa
  distanciaKm: number
  tiempoMinutos: number
  fuenteTiempo: 'matrix' | 'estimado'
  /** true si el tiempo entra dentro del umbral configurado. */
  dentroDelUmbral: boolean
}

/** Resultado del modo "Ver todos en mapa". */
export interface Radar {
  base: EntidadMapa
  conexiones: ConexionRadar[]
  aviso: string | null
}
