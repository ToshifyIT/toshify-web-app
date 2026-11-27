// mcp/lib/tablasFueraMcp.js
// Qué NO entra solo al MCP cuando aparece una pantalla nueva.
//
// El generador (mcp/generadores/generarPantallasDatos.mjs) suma como "dataset
// automático" cada tabla que consulta alguna pantalla y no está en el catálogo
// (lib/catalogoDatos.js). Así un módulo nuevo trae sus datos sin tocar el MCP. Quedan
// afuera:
//   - TABLAS_FUERA_MCP: las que ya usaban las pantallas y se dejaron afuera a propósito
//     al armar el catálogo (seguridad, parámetros, facturación interna, temporales...).
//   - Las que coinciden con PATRON_TABLAS_PROHIBIDAS (usuarios, permisos, keys, logs...).
// De cada dataset automático se sacan las columnas que coinciden con
// PATRON_COLUMNAS_SENSIBLES. Para exponer una tabla con más cuidado (descripción,
// columnas elegidas a mano) se la agrega al catálogo y deja de ser automática.

/** Tablas usadas por pantallas que quedan afuera del MCP (revisadas el 2026-11-27). */
export const TABLAS_FUERA_MCP = [
  'acciones_implementadas',
  'avatars',
  'bcra_umbrales',
  'cabify_cuentas',
  'cabify_dni_mapeo',
  'conductores_seguimiento_resumen',
  'cresium_pagadores_conductor',
  'documentos_generados',
  'garantias',
  'geotab_resync_solicitudes',
  'grupos_flota',
  'guias_seguimiento',
  'herramientas',
  'herramientas_baul',
  'herramientas_consumo',
  'herramientas_cotizaciones',
  'herramientas_drive_carpetas',
  'herramientas_pagos',
  'historial_conductores',
  'leads_rutas_procesadas',
  'siniestros_reparaciones',
  'twochat_conversaciones',
  'twochat_llamadas_toshibase',
  'twochat_mensajes',
];

/** Nombres de tabla que nunca entran solos, aunque aparezcan en una pantalla nueva. */
export const PATRON_TABLAS_PROHIBIDAS =
  /(^|_)(user|users|usuario|usuarios|role|roles|permiso|permisos|permission|permissions|menu|menus|submenu|submenus|tabs|api|key|keys|token|tokens|oauth|auth|sesion|sesiones|session|sessions|log|logs|audit|cron|sync|prompt|prompts|backup|respaldo|respaldos|temp|tmp|parametro|parametros|secret|secrets|credencial|credenciales|webhook|webhooks)(_|$)/;

/** Columnas que nunca se exponen en un dataset automático. */
export const PATRON_COLUMNAS_SENSIBLES =
  /(password|contrasen|hash|token|secret|api_?key|clave|cbu|cvu|alias|dni|cuit|cuil|documento|pasaporte|emergencia|nacimiento|direccion|domicilio|latitud|longitud|coordenada|telefono|celular|whatsapp|email|correo|url|link|drive|foto|archivo|adjunto|raw|antecedente|bcra|tarjeta|cuenta|poligono|ip_address|(^|_)(lat|lng|lon|ip)(_|$))/;
