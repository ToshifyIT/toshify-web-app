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
