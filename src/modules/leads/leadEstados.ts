// src/modules/leads/leadEstados.ts
//
// Catálogo de estados de lead. Fuente única para el módulo de Leads (tabla,
// filtros, formulario) y para Distribución en mapa v2, así los dos muestran
// siempre los mismos estados.

/** Estado que marca a un lead como listo para emparejar con un compañero. */
export const ESTADO_LISTO_EMPAREJAR = 'Listo Emparejar'

/** Todos los estados conocidos ("Conductor" se asigna solo, automáticamente). */
export const ESTADOS_LEAD = [
  'Inicio conversación', 'Contactado Sellium', 'Edad aprobada', 'Zona aprobada', 'Propuesta enviada', 'Acepta oferta',
  'Video recibido', 'Pendiente - Hireflix', 'Apto - Hireflix', 'No Apto - Hireflix', 'Ayuda - Hireflix',
  'Documentos enviados', 'Documentos pendientes', 'Auto del pueblo', 'No le interesa', 'No cumple edad',
  'Convocatoria Inducción', 'Apto Inducción', ESTADO_LISTO_EMPAREJAR, 'Descartado',
] as const

// Estados que ya no se usan en el proceso actual (Hireflix ya no existe; la carga
// de Sellium asigna "Inicio conversación" y no informa "Acepta oferta").
// Se ocultan del filtro de la columna Estado y de los desplegables para cambiar
// el estado (tabla y formulario): los leads que ya los tienen conservan su
// estado como dato histórico y siguen visibles en la tabla.
// "Zona aprobada" tampoco se filtra como estado: la zona la determina el sistema
// por coordenadas (tag "Zona Aprobada" / "Zona Restringida" y su tarjeta).
export const ESTADOS_OCULTOS_FILTRO: ReadonlySet<string> = new Set<string>([
  'Contactado Sellium', 'Acepta oferta',
  'Pendiente - Hireflix', 'Apto - Hireflix', 'No Apto - Hireflix', 'Ayuda - Hireflix',
  'Zona aprobada',
  // Se muestra como "Descartado" (ver displayEstadoLead): para elegirlo a mano se usa Descartado.
  'No cumple edad',
])

/** Estados vigentes: los que se ofrecen en filtros y desplegables. */
export const ESTADOS_LEAD_FILTRO: readonly string[] = ESTADOS_LEAD.filter(
  (e) => !ESTADOS_OCULTOS_FILTRO.has(e)
)
