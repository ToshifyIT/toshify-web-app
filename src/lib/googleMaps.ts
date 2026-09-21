// src/lib/googleMaps.ts
// Configuración compartida del Google Maps JS SDK.
//
// Por qué existe este archivo:
// `useJsApiLoader` (de @react-google-maps/api) es un singleton global.
// La PRIMERA llamada en la sesión "congela" las opciones (libraries, language,
// region, id, etc.). Cualquier llamada posterior con OPCIONES DISTINTAS
// dispara: "Loader must not be called again with different options".
//
// Para evitarlo, todos los componentes que cargan Google Maps deben importar
// estas constantes y pasarlas tal cual al loader.
//
// `libraries` usa el superset de todo lo que la app necesita en cualquier
// pantalla, así no importa quién monte primero.

/**
 * ===========================================================================
 * INTERRUPTOR DE DISTANCE MATRIX  —  poner en `true` para volver a activarlo
 * ===========================================================================
 *
 * `false` = la app NO llama a la API de Distance Matrix. Ni una sola vez, ni
 * en producción ni en desarrollo. Se apagó el 21/09/2026 porque el consumo
 * disparó la facturación (ver el módulo distribucion-mapa-v2).
 *
 * Qué pasa mientras está apagado — nada se rompe, los dos módulos que la usan
 * ya tenían su camino alternativo:
 *
 *  - distribucion-mapa-v2: los tiempos se estiman por distancia en línea recta
 *    (28 km/h) y cada par se muestra con el badge "Tiempo estimado".
 *  - ProgramacionAssignmentWizard: el campo de distancia deja de autocompletarse
 *    (se carga a mano) y los pares cercanos se ordenan por distancia en línea
 *    recta en vez de por tiempo en auto.
 *
 * OJO: esto apaga el consumo desde el código, pero sólo para quien tenga esta
 * versión cargada. El freno de verdad es la cuota en Google Cloud Console
 * (Distance Matrix API → Cuotas → Requests per day = 0).
 *
 * El tipo es `boolean` a propósito y no el literal `false`: así TypeScript no
 * marca como inalcanzable el código que viene después de los guards.
 */
export const DISTANCE_MATRIX_HABILITADO: boolean = false

export const GOOGLE_MAPS_API_KEY =
  (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY ||
  'AIzaSyCCiqk9jWZghUq5rBtSyo6ZjLuMORblY-w'

// Superset de librerías usado por toda la app (Address, Zonas, Map de conductores).
// Si algún módulo nuevo necesita otra librería, agregarla acá.
export const GOOGLE_MAPS_LIBRARIES: ('places' | 'drawing')[] = ['places', 'drawing']

export const GOOGLE_MAPS_LANGUAGE = 'es'
export const GOOGLE_MAPS_REGION = 'AR'

// URL canónica para los lugares que cargan el script con <script> tag directo
// (LeadsModule, ProgramacionAssignmentWizard). Debe coincidir con lo que
// useJsApiLoader generaría, para que ambos mecanismos sean compatibles.
export const GOOGLE_MAPS_SCRIPT_URL =
  `https://maps.googleapis.com/maps/api/js` +
  `?key=${GOOGLE_MAPS_API_KEY}` +
  `&libraries=${GOOGLE_MAPS_LIBRARIES.join(',')}` +
  `&language=${GOOGLE_MAPS_LANGUAGE}` +
  `&region=${GOOGLE_MAPS_REGION}` +
  `&loading=async`
