// src/modules/onboarding/distribucion-mapa-v2/apisGoogle.ts
//
// ===========================================================================
// INTERRUPTORES DE LAS APIs DE GOOGLE PARA ESTE MÓDULO
// ===========================================================================
//
// Un único lugar donde se decide qué puede llamar a Google desde
// distribucion-mapa-v2. Poner en `true` para volver a habilitar.
//
// Apagado el 24/09/2026 tras la facturación de septiembre. Cada interruptor
// dice qué se deja de gastar y qué se pierde a cambio.
//
// IMPORTANTE: esto sólo cubre ESTE módulo. Otras pantallas (LeadWizard,
// ConductorWizard, ConductoresModule, multas, visitas, zonas, USS) siguen
// usando Google por su cuenta. El único freno que cubre todo, sin depender del
// código, es la cuota en Google Cloud Console.

/**
 * Distance Matrix: distancias y tiempos de viaje reales.
 *
 * Apagado => los tiempos se estiman por distancia en línea recta a 28 km/h y
 * cada par aparece con el badge "Tiempo estimado". El emparejamiento sigue
 * funcionando, con números aproximados.
 *
 * Se cobra POR ELEMENTO medido. Fue lo que generó los S/ 204 de septiembre.
 */
export const API_DISTANCE_MATRIX = false

/**
 * Geocoding: convertir direcciones en coordenadas y viceversa.
 *
 * Apagado =>
 *  - Ya NO se geocodifican automáticamente al abrir el módulo las direcciones
 *    sin coordenadas (eran hasta 25 llamadas por cada carga de la pantalla,
 *    sin avisar). Quien no tenga coordenadas cargadas no aparece en el mapa,
 *    igual que antes de tenerlas.
 *  - Desaparece el botón "Completar ubicaciones": los filtros de País y Ciudad
 *    quedan con lo que ya esté cacheado en `celdas_geograficas` más lo que se
 *    pueda deducir del texto de la dirección.
 *
 * Se cobra POR LLAMADA.
 */
export const API_GEOCODING = false

/**
 * Maps JavaScript: el mapa en sí.
 *
 * Apagado => NO se dibuja el mapa. La pantalla queda con los filtros, la lista
 * de resultados y las fichas, que siguen siendo utilizables, pero se pierde lo
 * que le da sentido al módulo.
 *
 * Se cobra POR CARGA DEL MAPA (una por cada vez que se entra a la pantalla).
 * Es el único consumo que queda vivo con los otros dos apagados.
 */
export const API_MAPA = true
