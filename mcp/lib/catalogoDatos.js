// mcp/lib/catalogoDatos.js
// Catálogo de datos de solo lectura que expone el MCP (herramientas listar_datos,
// describir_datos, consultar_datos y contar_datos).
//
// Cada dataset pide un permiso: datos:read (operación) salvo los que tienen
// `permiso: 'administracion:read'` (facturación, usuarios, roles, procesos), que se
// agregaron el 2026-11-17 y solo los ve una key con ese permiso.
//
// Generado el 2026-11-06 a partir de la base y revisado a mano. Con datos:read quedan AFUERA:
//   - Facturación (facturación, saldos, pagos, abonos, garantías, cobros fraccionados,
//     períodos, tickets, excesos facturables): está en administracion:read.
//   - Contabilidad (Alegra, Cresium): afuera para todas las keys.
//   - Parámetros (conceptos de facturación, parámetros del sistema, grupos de flota,
//     rango de seguimiento de guías, cuentas de Cabify).
//   - Seguridad y sistema (usuarios, roles, permisos, API keys, logs, sincronizaciones,
//     prompts), respaldos y tablas temporales.
//   - Titulares de vehículos y ofertas de locación (datos personales de terceros).
// Columnas quitadas: contraseñas y tokens, CBU, antecedentes, contactos de emergencia,
// fecha de nacimiento, domicilio y coordenadas de personas, links a documentos y Drive,
// datos de terceros en siniestros, BCRA/antecedentes de leads y estado de facturación. Ver COLUMNAS_EXCLUIDAS abajo.
//
// Agregar una tabla o columna es una decisión deliberada, no un ajuste.

/** dataset -> { modulo, permiso?, descripcion, columnas: { nombre: tipo } } (sin permiso = datos:read) */
export const CATALOGO = {
  conductores: {
    modulo: 'Conductores',
    descripcion: 'Conductores: datos personales básicos, licencia, estado, fechas de alta y baja, sede. Fecha de ingreso: usar created_at (alta en el sistema); fecha_contratacion casi nunca está cargada. Baja: fecha_terminacion.',
    columnas: { id: 'id', numero_licencia: 'texto', nombres: 'texto', apellidos: 'texto', licencia_categoria_id: 'id', licencia_vencimiento: 'fecha', licencia_estado_id: 'id', licencia_tipo_id: 'id', zona: 'texto', numero_dni: 'texto', numero_cuit: 'texto', estado_civil_id: 'id', nacionalidad_id: 'id', email: 'texto', telefono_contacto: 'texto', cochera_propia: 'booleano', fecha_reincorpoaracion: 'fecha', fecha_contratacion: 'fecha', fecha_terminacion: 'fecha', estado_id: 'id', motivo_baja: 'texto', created_by: 'id', created_at: 'fecha', updated_at: 'fecha', monotributo: 'booleano', preferencia_turno: 'texto', updated_by: 'texto', created_by_name: 'texto', numero_ibutton: 'texto', guia_asignado: 'booleano', id_guia: 'texto', fecha_escuela: 'fecha', sede_id: 'id', intercom_id: 'texto', intercom_status: 'texto', geotab_user_id: 'texto', id_conversation: 'texto', observaciones: 'texto', experiencia_previa: 'texto', referido: 'booleano', embajador_id: 'id', fuente_pauta: 'texto', id_fuente: 'texto', lead_origen_id: 'id', telefono_secundario: 'texto', guia: 'texto', correo_personal: 'texto', motivo_sin_monotributo: 'texto' },
  },
  conductores_estados: {
    modulo: 'Conductores',
    descripcion: 'Estados posibles de un conductor (activo, baja).',
    columnas: { id: 'id', codigo: 'texto', descripcion: 'texto', activo: 'booleano', created_at: 'fecha', updated_at: 'fecha' },
  },
  conductores_historial_bajas: {
    modulo: 'Conductores',
    descripcion: 'Historial de bajas y reincorporaciones de conductores, con motivo y fecha.',
    columnas: { id: 'id', conductor_id: 'id', conductor_nombre: 'texto', conductor_dni: 'texto', tipo_evento: 'texto', estado_anterior: 'texto', estado_nuevo: 'texto', fecha_terminacion_anterior: 'fecha', fecha_terminacion_nueva: 'fecha', motivo_baja: 'texto', usuario_id: 'id', usuario_nombre: 'texto', sede_id: 'id', created_at: 'fecha' },
  },
  conductores_licencias_categorias: {
    modulo: 'Conductores',
    descripcion: 'Categorías de licencia de cada conductor.',
    columnas: { id: 'id', conductor_id: 'id', licencia_categoria_id: 'id', created_at: 'fecha', updated_at: 'fecha' },
  },
  conductores_licencias_tipos: {
    modulo: 'Conductores',
    descripcion: 'Tipos de licencia de cada conductor.',
    columnas: { id: 'id', conductor_id: 'id', licencia_tipo_id: 'id', created_at: 'fecha', updated_at: 'fecha' },
  },
  conductor_calificaciones: {
    modulo: 'Conductores',
    descripcion: 'Calificación semanal de cada conductor (estrellas y puntaje).',
    columnas: { semana_inicio: 'fecha', conductor_id: 'id', estrellas: 'numero', puntaje: 'numero', parcial: 'booleano', factores: 'json', calculado_por: 'id', calculado_en: 'fecha' },
  },
  conductor_emparajamientos: {
    modulo: 'Conductores',
    descripcion: 'Emparejamientos sugeridos entre conductores (distancia y tiempo entre domicilios).',
    columnas: { id: 'id', conductor_a_id: 'id', conductor_b_id: 'id', distancia_km: 'numero', tiempo_minutos: 'numero', trafico: 'texto', score: 'numero', calculado_en: 'fecha' },
  },
  licencias_categorias: {
    modulo: 'Conductores',
    descripcion: 'Catálogo de categorías de licencia.',
    columnas: { id: 'id', codigo: 'texto', descripcion: 'texto', activo: 'booleano', created_at: 'fecha', updated_at: 'fecha' },
  },
  licencias_estados: {
    modulo: 'Conductores',
    descripcion: 'Catálogo de estados de licencia.',
    columnas: { id: 'id', codigo: 'texto', descripcion: 'texto', activo: 'booleano', created_at: 'fecha', updated_at: 'fecha' },
  },
  licencias_tipos: {
    modulo: 'Conductores',
    descripcion: 'Catálogo de tipos de licencia.',
    columnas: { id: 'id', codigo: 'texto', descripcion: 'texto', activo: 'booleano', created_at: 'fecha', updated_at: 'fecha' },
  },
  estados_civiles: {
    modulo: 'Conductores',
    descripcion: 'Catálogo de estados civiles.',
    columnas: { id: 'id', codigo: 'texto', descripcion: 'texto', activo: 'booleano', created_at: 'fecha', updated_at: 'fecha' },
  },
  nacionalidades: {
    modulo: 'Conductores',
    descripcion: 'Catálogo de nacionalidades.',
    columnas: { id: 'id', codigo: 'texto', descripcion: 'texto', activo: 'booleano', created_at: 'fecha', updated_at: 'fecha' },
  },
  bonos_referidos: {
    modulo: 'Conductores',
    descripcion: 'Bonos por referidos: embajador, referido, hito alcanzado, estado y monto.',
    columnas: { id: 'id', referido_id: 'id', embajador_id: 'id', hito: 'numero', fecha_hito: 'fecha', racha_desde: 'fecha', estado: 'texto', motivo: 'texto', monto: 'numero', semana: 'numero', anio: 'numero', incidencia_id: 'id', penalidad_id: 'id', created_at: 'fecha' },
  },
  vehiculos: {
    modulo: 'Vehículos',
    descripcion: 'Flota: patente, marca, modelo, año, estado, kilometraje, GNC, telepase, vencimientos, sede.',
    columnas: { id: 'id', patente: 'texto', marca: 'texto', modelo: 'texto', anio: 'numero', color: 'texto', tipo_id: 'id', tipo_combustible_id: 'id', tipo_gps_id: 'id', gps_uss: 'texto', numero_motor: 'texto', numero_chasis: 'texto', provisoria: 'texto', estado_id: 'id', kilometraje_actual: 'numero', fecha_adquisicion: 'fecha', fecha_ulti_inspeccion: 'fecha', fecha_prox_inspeccion: 'fecha', seguro_numero: 'texto', seguro_vigencia: 'fecha', notas: 'texto', titular: 'texto', created_by: 'id', created_at: 'fecha', updated_at: 'fecha', tipo_combustible: 'texto', tipo_vehiculo: 'texto', tipo_gps: 'texto', traccar: 'booleano', updated_by: 'texto', created_by_name: 'texto', sede_id: 'id', deleted_at: 'fecha', gnc: 'booleano', telepase: 'booleano', cobertura: 'texto', kilometraje_geotab: 'numero', kilometraje_geotab_updated_at: 'fecha', kilometraje_uss_updated_at: 'fecha', grupo_flota: 'texto', cantidad_llaves: 'numero', lugar_radicacion: 'texto', vencimiento_seguro: 'fecha', vto_vtv_aplica: 'booleano', vto_vtv_fecha: 'fecha', vto_gnc_aplica: 'booleano', vto_gnc_fecha: 'fecha', vto_matafuego_aplica: 'booleano', vto_matafuego_fecha: 'fecha', categoria: 'texto', guia_responsable: 'texto', motivo_cambio_estado: 'texto' },
  },
  vehiculos_estados: {
    modulo: 'Vehículos',
    descripcion: 'Catálogo de estados de vehículo.',
    columnas: { id: 'id', codigo: 'texto', descripcion: 'texto', activo: 'booleano', created_at: 'fecha', updated_at: 'fecha' },
  },
  vehiculos_tipos: {
    modulo: 'Vehículos',
    descripcion: 'Catálogo de tipos de vehículo.',
    columnas: { id: 'id', codigo: 'texto', descripcion: 'texto', activo: 'booleano', created_at: 'fecha', updated_at: 'fecha' },
  },
  combustibles_tipos: {
    modulo: 'Vehículos',
    descripcion: 'Catálogo de tipos de combustible.',
    columnas: { id: 'id', codigo: 'texto', descripcion: 'texto', activo: 'booleano', created_at: 'fecha', updated_at: 'fecha' },
  },
  gps_tipos: {
    modulo: 'Vehículos',
    descripcion: 'Catálogo de tipos de GPS.',
    columnas: { id: 'id', codigo: 'texto', descripcion: 'texto', activo: 'booleano', created_at: 'fecha', updated_at: 'fecha' },
  },
  vehiculos_estado_historial: {
    modulo: 'Vehículos',
    descripcion: 'Historial de cambios de estado de cada vehículo (desde/hasta y motivo).',
    columnas: { id: 'numero', vehiculo_id: 'id', estado_id: 'id', estado_codigo: 'texto', desde: 'fecha', hasta: 'fecha', motivo: 'texto', origen: 'texto', cambiado_por: 'id', usuario_nombre: 'texto' },
  },
  vehiculos_gnc_historial: {
    modulo: 'Vehículos',
    descripcion: 'Historial de alta y baja de GNC por vehículo.',
    columnas: { id: 'id', vehiculo_id: 'id', accion: 'texto', fecha: 'fecha', created_by: 'id', created_by_name: 'texto', created_at: 'fecha' },
  },
  vehiculos_telepase_historial: {
    modulo: 'Vehículos',
    descripcion: 'Historial de alta y baja de telepase por vehículo.',
    columnas: { id: 'id', vehiculo_id: 'id', accion: 'texto', fecha: 'fecha', created_by: 'id', created_by_name: 'texto', created_at: 'fecha' },
  },
  vehiculos_guia_historial: {
    modulo: 'Vehículos',
    descripcion: 'Historial de guía asignado a cada vehículo.',
    columnas: { id: 'numero', vehiculo_id: 'id', guia: 'texto', desde: 'fecha', hasta: 'fecha', cambiado_por: 'id' },
  },
  vehiculos_notas: {
    modulo: 'Vehículos',
    descripcion: 'Notas registradas sobre vehículos.',
    columnas: { id: 'numero', vehiculo_id: 'id', nota: 'texto', created_at: 'fecha', created_by: 'id', usuario_nombre: 'texto', origen: 'texto' },
  },
  vehiculos_titulares: {
    modulo: 'Vehículos',
    descripcion: 'Relación vehículo - titular con vigencia.',
    columnas: { id: 'id', vehiculo_id: 'id', titular_id: 'id', fecha_desde: 'fecha', fecha_hasta: 'fecha', activo: 'booleano', created_at: 'fecha', created_by: 'texto', created_by_name: 'texto' },
  },
  vehiculos_turnos_ocupados: {
    modulo: 'Vehículos',
    descripcion: 'Turnos ocupados por vehículo y fecha.',
    columnas: { id: 'id', vehiculo_id: 'id', fecha: 'fecha', horario: 'texto', asignacion_conductor_id: 'id', estado: 'texto', created_at: 'fecha', updated_at: 'fecha' },
  },
  historial_vehiculos: {
    modulo: 'Vehículos',
    descripcion: 'Bitácora de eventos de vehículos (cambios de estado y datos).',
    columnas: { id: 'id', vehiculo_id: 'id', tipo_evento: 'texto', estado_anterior: 'texto', estado_nuevo: 'texto', detalles: 'json', usuario_id: 'id', usuario_nombre: 'texto', modulo: 'texto', created_at: 'fecha', sede_id: 'id' },
  },
  vencimientos: {
    modulo: 'Vehículos',
    descripcion: 'Vencimientos de documentación de vehículos y su gestión.',
    columnas: { created_at: 'fecha', titular: 'texto', patente: 'texto', fecha_entrega: 'fecha', fecha_vencimiento: 'fecha', fecha_iniciar_gestion: 'fecha', prioridad: 'texto', solicitado: 'booleano', observacion: 'texto', documento: 'texto', id: 'id', usuario_creacion: 'texto', fecha_edicion: 'fecha', usuario_edicion: 'texto' },
  },
  asignaciones: {
    modulo: 'Asignaciones',
    descripcion: 'Asignaciones de vehículo a conductor: estado, modalidad, horario, fechas, sede.',
    columnas: { id: 'id', vehiculo_id: 'id', conductor_id: 'id', fecha_inicio: 'fecha', fecha_fin: 'fecha', modalidad: 'texto', estado: 'texto', notas: 'texto', created_by: 'id', created_at: 'fecha', updated_at: 'fecha', codigo: 'texto', horario: 'texto', fecha_inicio_real: 'fecha', fecha_fin_real: 'fecha', observaciones: 'texto', motivo_cancelacion: 'texto', fecha_programada: 'fecha', updated_by: 'texto', created_by_name: 'texto', sede_id: 'id', control_completado: 'booleano', zona: 'texto', tipo_tarifa: 'texto' },
  },
  asignaciones_conductores: {
    modulo: 'Asignaciones',
    descripcion: 'Conductores de cada asignación (turno diurno/nocturno), con fechas y estado.',
    columnas: { id: 'id', asignacion_id: 'id', conductor_id: 'id', fecha_asignacion: 'fecha', fecha_inicio: 'fecha', fecha_fin: 'fecha', estado: 'texto', created_by: 'id', created_at: 'fecha', updated_at: 'fecha', distancia: 'numero', documento: 'texto', ubicacion: 'texto', observaciones: 'texto', horario: 'texto', confirmado: 'booleano', fecha_confirmacion: 'fecha', tipo_tarifa: 'texto' },
  },
  devoluciones: {
    modulo: 'Asignaciones',
    descripcion: 'Devoluciones de vehículos programadas y realizadas.',
    columnas: { id: 'id', vehiculo_id: 'id', conductor_id: 'id', conductor_nombre: 'texto', programacion_id: 'id', programado_por: 'texto', fecha_programada: 'fecha', fecha_devolucion: 'fecha', estado: 'texto', observaciones: 'texto', created_by: 'id', created_by_name: 'texto', created_at: 'fecha', updated_at: 'fecha', sede_id: 'id' },
  },
  horarios_conduccion: {
    modulo: 'Asignaciones',
    descripcion: 'Catálogo de horarios de conducción.',
    columnas: { id: 'id', nombre: 'texto', hora_inicio: 'texto', hora_fin: 'texto', duracion_horas: 'numero', descripcion: 'texto', activo: 'booleano', created_by: 'id', created_at: 'fecha', updated_at: 'fecha' },
  },
  leads: {
    modulo: 'Leads',
    descripcion: 'Leads (candidatos): datos de contacto, estado, sede, fuente y responsables.',
    columnas: { id: 'id', nombre_completo: 'texto', apellido: 'texto', email: 'texto', phone: 'texto', user_id: 'texto', fecha_creacion: 'fecha', last_seen: 'fecha', last_contacted: 'fecha', last_heard_from: 'fecha', country: 'texto', region: 'texto', city: 'texto', timezone: 'texto', sede: 'texto', utm_campaign: 'texto', utm_content: 'texto', utm_medium: 'texto', utm_source: 'texto', utm_term: 'texto', whatsapp_number: 'texto', estado_de_lead: 'texto', agente_asignado: 'texto', entrevistador_asignado: 'texto', patente: 'texto', turno: 'texto', companero: 'texto', tiempo_de_antiguedad: 'texto', tipo: 'texto', dni: 'texto', primer_nombre: 'texto', ultima_actividad: 'fecha', especialista_onboarding: 'texto', nombre_completo_2: 'texto', edad: 'numero', zona: 'texto', fuente_de_lead: 'texto', licencia: 'texto', monotributo: 'texto', experiencia_previa: 'texto', acepta_oferta: 'booleano', administrativo_asignado: 'texto', dataentry_asignado: 'texto', agente_logistico_asignado: 'texto', fecha_carga: 'fecha', fase_de_preguntas: 'texto', asistente_virtual: 'texto', documentos_pendientes: 'texto', cerrado_timeout_wpp: 'booleano', guia_asignado: 'texto', causal_de_cierre: 'texto', ayuda_entrevista: 'texto', codigo_referido: 'texto', anio_de_auto: 'texto', km_de_auto: 'texto', marca_y_modelo_de_vehiculo: 'texto', sede_vehiculo: 'texto', created_at: 'fecha', updated_at: 'fecha', experiencia_manejo: 'texto', id_lead: 'texto', estado_civil: 'texto', nacionalidad: 'texto', cuit: 'texto', proceso: 'texto', entrevista_ia: 'texto', induccion: 'texto', disponibilidad: 'fecha', estado_direccion: 'texto', clasificacion_domicilio: 'texto', d1: 'texto', vencimiento_licencia: 'fecha', cuenta_cabify: 'texto', cochera: 'texto', rueda: 'texto', fecha_de_inicio: 'fecha', mail_de_respaldo: 'texto', observaciones: 'texto', sede_id: 'id', fecha_convertido: 'fecha', usuario: 'texto', id_conversation: 'texto', resultado_hireflix: 'texto', resumen_hireflix: 'texto', id_hireflix: 'texto', numero_licencia: 'texto', categorias_licencia: 'json', estado_licencia: 'texto', tipo_licencia: 'texto', motivo_desinteres: 'texto', estado_manual_at: 'fecha', dispuesto_a_sacar_d1: 'texto', id_fuente: 'texto', fuente_pauta: 'texto', cuenta_didi: 'texto', referido: 'booleano', embajador_id: 'id', telefono_secundario: 'texto', motivo_sin_monotributo: 'texto' },
  },
  parejas_lead: {
    modulo: 'Leads',
    descripcion: 'Parejas sugeridas entre leads y otros candidatos o conductores (distancia y tiempo).',
    columnas: { lead_id: 'id', tipo: 'texto', otro_id: 'id', distancia_km: 'numero', tiempo_minutos: 'numero', creado_en: 'fecha' },
  },
  programaciones_onboarding: {
    modulo: 'Onboarding',
    descripcion: 'Programaciones de entrega de vehículos a candidatos y conductores.',
    columnas: { id: 'id', estado: 'texto', conductor_id: 'id', conductor_nombre: 'texto', conductor_dni: 'texto', tipo_candidato: 'texto', turno: 'texto', vehiculo_entregar_id: 'id', vehiculo_entregar_patente: 'texto', vehiculo_entregar_modelo: 'texto', vehiculo_entregar_color: 'texto', vehiculo_cambio_id: 'id', vehiculo_cambio_patente: 'texto', vehiculo_cambio_modelo: 'texto', tipo_asignacion: 'texto', modalidad: 'texto', fecha_cita: 'fecha', hora_cita: 'texto', zona: 'texto', distancia_minutos: 'numero', tipo_documento: 'texto', documento_listo: 'booleano', grupo_whatsapp: 'booleano', citado_ypf: 'booleano', confirmacion_asistencia: 'texto', estado_cabify: 'texto', especialista_id: 'id', especialista_nombre: 'texto', observaciones: 'texto', asignacion_id: 'id', fecha_asignacion_creada: 'fecha', created_by: 'id', created_by_name: 'texto', created_at: 'fecha', updated_at: 'fecha', pais_id: 'id', conductor_diurno_id: 'id', conductor_diurno_nombre: 'texto', conductor_diurno_dni: 'texto', conductor_nocturno_id: 'id', conductor_nocturno_nombre: 'texto', conductor_nocturno_dni: 'texto', documento_diurno: 'texto', documento_nocturno: 'texto', zona_diurno: 'texto', zona_nocturno: 'texto', tipo_candidato_diurno: 'texto', tipo_candidato_nocturno: 'texto', distancia_diurno: 'numero', distancia_nocturno: 'numero', tipo_asignacion_diurno: 'texto', tipo_asignacion_nocturno: 'texto', estado_cabify_diurno: 'texto', estado_cabify_nocturno: 'texto', confirmacion_diurno: 'texto', confirmacion_nocturno: 'texto', eliminado: 'booleano', motivo_eliminacion: 'texto', eliminado_at: 'fecha', eliminado_by: 'id', sede_id: 'id', devolucion_vehiculo: 'booleano', ultimo_dia_cobro: 'texto', cambio_vehiculo: 'booleano', propietario: 'texto', tipo_tarifa: 'texto', tipo_tarifa_diurno: 'texto', tipo_tarifa_nocturno: 'texto', lead_diurno_id: 'id', lead_nocturno_id: 'id', lead_cargo_id: 'id', estado_didi_diurno: 'texto', estado_didi_nocturno: 'texto' },
  },
  v_programaciones_onboarding: {
    modulo: 'Onboarding',
    descripcion: 'Programaciones de onboarding con datos completos de conductor y vehículo.',
    columnas: { id: 'id', estado: 'texto', conductor_id: 'id', conductor_nombre: 'texto', conductor_dni: 'texto', tipo_candidato: 'texto', turno: 'texto', vehiculo_entregar_id: 'id', vehiculo_entregar_patente: 'texto', vehiculo_entregar_modelo: 'texto', vehiculo_entregar_color: 'texto', vehiculo_cambio_id: 'id', vehiculo_cambio_patente: 'texto', vehiculo_cambio_modelo: 'texto', tipo_asignacion: 'texto', tipo_asignacion_diurno: 'texto', tipo_asignacion_nocturno: 'texto', modalidad: 'texto', fecha_cita: 'fecha', hora_cita: 'texto', zona: 'texto', distancia_minutos: 'numero', tipo_documento: 'texto', documento_listo: 'booleano', grupo_whatsapp: 'booleano', citado_ypf: 'booleano', confirmacion_asistencia: 'texto', confirmacion_diurno: 'texto', confirmacion_nocturno: 'texto', estado_cabify: 'texto', estado_cabify_diurno: 'texto', estado_cabify_nocturno: 'texto', especialista_id: 'id', especialista_nombre: 'texto', observaciones: 'texto', asignacion_id: 'id', fecha_asignacion_creada: 'fecha', created_by: 'id', created_by_name: 'texto', created_at: 'fecha', updated_at: 'fecha', pais_id: 'id', conductor_diurno_id: 'id', conductor_diurno_nombre: 'texto', conductor_diurno_dni: 'texto', tipo_candidato_diurno: 'texto', documento_diurno: 'texto', zona_diurno: 'texto', distancia_diurno: 'numero', conductor_nocturno_id: 'id', conductor_nocturno_nombre: 'texto', conductor_nocturno_dni: 'texto', tipo_candidato_nocturno: 'texto', documento_nocturno: 'texto', zona_nocturno: 'texto', distancia_nocturno: 'numero', eliminado: 'booleano', motivo_eliminacion: 'texto', eliminado_at: 'fecha', eliminado_by: 'id', sede_id: 'id', propietario: 'texto', conductor_nombres: 'texto', conductor_apellidos: 'texto', conductor_dni_sistema: 'texto', conductor_display: 'texto', conductor_diurno_nombres_sistema: 'texto', conductor_diurno_apellidos_sistema: 'texto', conductor_diurno_dni_sistema: 'texto', conductor_nocturno_nombres_sistema: 'texto', conductor_nocturno_apellidos_sistema: 'texto', conductor_nocturno_dni_sistema: 'texto', vehiculo_entregar_patente_sistema: 'texto', vehiculo_entregar_marca: 'texto', vehiculo_entregar_modelo_sistema: 'texto', vehiculo_cambio_patente_sistema: 'texto', vehiculo_cambio_marca: 'texto', vehiculo_cambio_modelo_sistema: 'texto', especialista_nombre_sistema: 'texto', asignacion_codigo: 'texto', asignacion_estado: 'texto' },
  },
  incidencias: {
    modulo: 'Incidencias',
    descripcion: 'Incidencias registradas sobre conductores y vehículos.',
    columnas: { id: 'id', vehiculo_id: 'id', conductor_id: 'id', estado_id: 'id', semana: 'numero', fecha: 'fecha', turno: 'texto', area: 'texto', estado_vehiculo: 'texto', descripcion: 'texto', accion_ejecutada: 'texto', registrado_por: 'texto', conductor_nombre: 'texto', vehiculo_patente: 'texto', created_by: 'id', created_at: 'fecha', updated_at: 'fecha', updated_by: 'texto', created_by_name: 'texto', siniestro_id: 'id', tipo: 'json', tipo_cobro_descuento_id: 'id', monto: 'numero', km_exceso: 'numero', sede_id: 'id', notas: 'texto', multa_id: 'numero', telepase_id: 'id' },
  },
  v_incidencias_completas: {
    modulo: 'Incidencias',
    descripcion: 'Incidencias con estado, vehículo y conductor ya resueltos.',
    columnas: { id: 'id', vehiculo_id: 'id', conductor_id: 'id', estado_id: 'id', semana: 'numero', fecha: 'fecha', turno: 'texto', area: 'texto', estado_vehiculo: 'texto', descripcion: 'texto', accion_ejecutada: 'texto', registrado_por: 'texto', conductor_nombre: 'texto', vehiculo_patente: 'texto', created_by: 'id', created_at: 'fecha', updated_at: 'fecha', updated_by: 'texto', created_by_name: 'texto', siniestro_id: 'id', tipo: 'json', tipo_cobro_descuento_id: 'id', monto: 'numero', sede_id: 'id', estado_codigo: 'texto', estado_nombre: 'texto', estado_color: 'texto', vehiculo_patente_sistema: 'texto', vehiculo_marca: 'texto', vehiculo_modelo: 'texto', conductor_nombres: 'texto', conductor_apellidos: 'texto', conductor_display: 'texto', patente_display: 'texto', tipo_cobro_codigo: 'texto', tipo_cobro_nombre: 'texto', tipo_cobro_categoria: 'texto', tipo_cobro_es_a_favor: 'booleano', total_penalidades: 'numero', monto_penalidades: 'numero' },
  },
  incidencias_estados: {
    modulo: 'Incidencias',
    descripcion: 'Catálogo de estados de incidencia.',
    columnas: { id: 'id', codigo: 'texto', nombre: 'texto', color: 'texto', orden: 'numero', is_active: 'booleano', created_at: 'fecha' },
  },
  penalidades: {
    modulo: 'Incidencias',
    descripcion: 'Penalidades y cargos a conductores (monto, tipo, semana de aplicación, rechazo).',
    columnas: { id: 'id', incidencia_id: 'id', vehiculo_id: 'id', conductor_id: 'id', tipo_penalidad_id: 'id', semana: 'numero', fecha: 'fecha', turno: 'texto', area_responsable: 'texto', detalle: 'texto', monto: 'numero', observaciones: 'texto', aplicado: 'booleano', fecha_aplicacion: 'fecha', nota_administrativa: 'texto', conductor_nombre: 'texto', vehiculo_patente: 'texto', created_by: 'id', created_at: 'fecha', updated_at: 'fecha', updated_by: 'texto', created_by_name: 'texto', tipo_cobro_descuento_id: 'id', fraccionado: 'booleano', cantidad_cuotas: 'numero', semana_aplicacion: 'numero', anio_aplicacion: 'numero', rechazado: 'booleano', fecha_rechazo: 'fecha', motivo_rechazo: 'texto', sede_id: 'id' },
  },
  v_penalidades_completas: {
    modulo: 'Incidencias',
    descripcion: 'Penalidades con tipo, categoría y vehículo ya resueltos.',
    columnas: { id: 'id', incidencia_id: 'id', vehiculo_id: 'id', conductor_id: 'id', tipo_penalidad_id: 'id', semana: 'numero', fecha: 'fecha', turno: 'texto', area_responsable: 'texto', detalle: 'texto', monto: 'numero', observaciones: 'texto', aplicado: 'booleano', fecha_aplicacion: 'fecha', nota_administrativa: 'texto', conductor_nombre: 'texto', vehiculo_patente: 'texto', created_by: 'id', created_at: 'fecha', updated_at: 'fecha', updated_by: 'texto', created_by_name: 'texto', tipo_cobro_descuento_id: 'id', sede_id: 'id', tipo_codigo: 'texto', tipo_nombre: 'texto', tipo_categoria: 'texto', tipo_es_a_favor: 'booleano', vehiculo_patente_sistema: 'texto', vehiculo_marca: 'texto', vehiculo_modelo: 'texto', conductor_nombres: 'texto', conductor_apellidos: 'texto', conductor_display: 'texto', patente_display: 'texto', incidencia_descripcion: 'texto', incidencia_estado: 'texto' },
  },
  penalidades_rechazos: {
    modulo: 'Incidencias',
    descripcion: 'Penalidades rechazadas, con motivo y quién las rechazó.',
    columnas: { id: 'id', penalidad_id: 'id', motivo: 'texto', rechazado_por: 'id', rechazado_por_nombre: 'texto', monto_al_rechazo: 'numero', detalle_al_rechazo: 'texto', observaciones_al_rechazo: 'texto', tipo_nombre_al_rechazo: 'texto', conductor_nombre: 'texto', vehiculo_patente: 'texto', semana_al_rechazo: 'numero', fecha_al_rechazo: 'fecha', created_at: 'fecha', created_by: 'id', created_by_name: 'texto', updated_at: 'fecha', updated_by: 'id', updated_by_name: 'texto', is_active: 'booleano', sede_id: 'id' },
  },
  tipos_cobro_descuento: {
    modulo: 'Incidencias',
    descripcion: 'Catálogo de tipos de cobro o descuento de penalidades.',
    columnas: { id: 'id', codigo: 'texto', nombre: 'texto', descripcion: 'texto', categoria: 'texto', es_a_favor: 'booleano', orden: 'numero', is_active: 'booleano', created_at: 'fecha' },
  },
  tipos_penalidad: {
    modulo: 'Incidencias',
    descripcion: 'Catálogo de tipos de penalidad.',
    columnas: { id: 'id', codigo: 'texto', nombre: 'texto', descripcion: 'texto', orden: 'numero', is_active: 'booleano', created_at: 'fecha' },
  },
  siniestros: {
    modulo: 'Siniestros',
    descripcion: 'Siniestros: fecha, vehículo, conductor, categoría, estado, seguro, responsable.',
    columnas: { id: 'id', pais_id: 'id', vehiculo_id: 'id', conductor_id: 'id', categoria_id: 'id', estado_id: 'id', seguro_id: 'id', fecha_siniestro: 'fecha', hora_siniestro: 'texto', ubicacion: 'texto', responsable: 'texto', hay_lesionados: 'booleano', descripcion_danos: 'texto', relato: 'texto', conductor_nombre: 'texto', tercero_nombre: 'texto', tercero_vehiculo: 'texto', tercero_seguro: 'texto', tercero_poliza: 'texto', enviado_abogada: 'booleano', enviado_alliance: 'booleano', fecha_enviado_abogada: 'fecha', fecha_enviado_alliance: 'fecha', nro_siniestro_seguro: 'texto', presupuesto_real: 'numero', presupuesto_enviado_seguro: 'numero', presupuesto_aprobado_seguro: 'numero', fecha_pago_estimada: 'fecha', total_pagado: 'numero', porcentaje_abogada: 'numero', observaciones: 'texto', created_by: 'id', created_at: 'fecha', updated_at: 'fecha', updated_by: 'texto', created_by_name: 'texto', sede_id: 'id' },
  },
  v_siniestros_completos: {
    modulo: 'Siniestros',
    descripcion: 'Siniestros con categoría, estado, vehículo y conductor ya resueltos.',
    columnas: { id: 'id', pais_id: 'id', vehiculo_id: 'id', conductor_id: 'id', categoria_id: 'id', estado_id: 'id', seguro_id: 'id', fecha_siniestro: 'fecha', hora_siniestro: 'texto', ubicacion: 'texto', responsable: 'texto', hay_lesionados: 'booleano', descripcion_danos: 'texto', relato: 'texto', conductor_nombre: 'texto', tercero_nombre: 'texto', tercero_vehiculo: 'texto', tercero_seguro: 'texto', tercero_poliza: 'texto', enviado_abogada: 'booleano', enviado_alliance: 'booleano', fecha_enviado_abogada: 'fecha', fecha_enviado_alliance: 'fecha', nro_siniestro_seguro: 'texto', presupuesto_real: 'numero', presupuesto_enviado_seguro: 'numero', presupuesto_aprobado_seguro: 'numero', fecha_pago_estimada: 'fecha', total_pagado: 'numero', porcentaje_abogada: 'numero', observaciones: 'texto', created_by: 'id', created_at: 'fecha', updated_at: 'fecha', sede_id: 'id', categoria_codigo: 'texto', categoria_nombre: 'texto', categoria_es_robo: 'booleano', estado_codigo: 'texto', estado_nombre: 'texto', estado_color: 'texto', seguro_nombre: 'texto', vehiculo_patente: 'texto', vehiculo_marca: 'texto', vehiculo_modelo: 'texto', conductor_nombre_sistema: 'texto', conductor_apellido_sistema: 'texto', conductor_display: 'texto' },
  },
  siniestros_categorias: {
    modulo: 'Siniestros',
    descripcion: 'Catálogo de categorías de siniestro.',
    columnas: { id: 'id', codigo: 'texto', nombre: 'texto', descripcion: 'texto', es_robo: 'booleano', orden: 'numero', is_active: 'booleano', created_at: 'fecha' },
  },
  siniestros_estados: {
    modulo: 'Siniestros',
    descripcion: 'Catálogo de estados de siniestro.',
    columnas: { id: 'id', codigo: 'texto', nombre: 'texto', color: 'texto', orden: 'numero', is_active: 'booleano', created_at: 'fecha' },
  },
  siniestros_seguimientos: {
    modulo: 'Siniestros',
    descripcion: 'Seguimiento de cada siniestro (eventos y montos).',
    columnas: { id: 'id', siniestro_id: 'id', tipo_evento: 'texto', descripcion: 'texto', monto: 'numero', cobrar_conductor: 'booleano', incidencia_id: 'id', penalidad_id: 'id', created_by: 'id', created_by_name: 'texto', created_at: 'fecha' },
  },
  seguros: {
    modulo: 'Siniestros',
    descripcion: 'Compañías de seguro.',
    columnas: { id: 'id', nombre: 'texto', telefono: 'texto', email: 'texto', contacto_nombre: 'texto', notas: 'texto', is_active: 'booleano', created_at: 'fecha', updated_at: 'fecha' },
  },
  multas_historico: {
    modulo: 'Multas y Telepase',
    descripcion: 'Multas de tránsito por patente: fecha, importe, lugar, conductor responsable, estado.',
    columnas: { id: 'numero', created_at: 'fecha', patente: 'texto', fecha_infraccion: 'fecha', importe: 'texto', lugar: 'texto', detalle: 'texto', fecha_anotacion: 'fecha', conductor_responsable: 'texto', observaciones: 'texto', infraccion: 'texto', lugar_detalle: 'texto', ibutton: 'texto', origen_actualizacion: 'texto', pagado: 'booleano', sede_id: 'id', deleted_at: 'fecha', deleted_reason: 'texto', deleted_by: 'texto', importe_descuento: 'texto', fecha_vencimiento_descuento: 'fecha', desestimada_at: 'fecha', desestimada_motivo: 'texto', desestimada_by: 'texto', updated_at: 'fecha', updated_by: 'texto', updated_by_name: 'texto', multa_origen_id: 'numero' },
  },
  telepase_historico: {
    modulo: 'Multas y Telepase',
    descripcion: 'Pasadas de telepase por patente: fecha, estación, tarifa, conductor.',
    columnas: { id: 'id', created_at: 'fecha', semana: 'texto', fecha: 'texto', hora: 'texto', estacion: 'texto', via: 'texto', dispositivo: 'texto', patente: 'texto', categoria: 'texto', tarifa: 'texto', documento_legal: 'texto', periodo: 'texto', concesionario: 'texto', conductor: 'texto', ibutton: 'texto', observaciones: 'texto', sede_id: 'id', desestimada_at: 'fecha', desestimada_by: 'texto', desestimada_motivo: 'texto', deleted_at: 'fecha', deleted_by: 'texto', updated_at: 'fecha', updated_by: 'texto', updated_by_name: 'texto' },
  },
  guias_historial_semanal: {
    modulo: 'Guías',
    descripcion: 'Seguimiento semanal de guías a conductores: meta, llamadas, acciones.',
    columnas: { id: 'numero', created_at: 'fecha', id_conductor: 'id', semana: 'texto', facturacion: 'texto', meta_sem_cumplida: 'booleano', fecha_llamada: 'fecha', incidencia: 'texto', accion_implementaria: 'texto', escuela_conductores: 'booleano', id_guia: 'texto', app: 'texto', efectivo: 'texto', total: 'texto', seguim_guia: 'texto', seguim_fecha: 'fecha', id_accion_imp: 'numero', anotaciones_extra: 'json', seguimiento: 'texto' },
  },
  guias_acciones_implementadas: {
    modulo: 'Guías',
    descripcion: 'Catálogo de acciones implementadas por guías.',
    columnas: { id: 'numero', created_at: 'fecha', nombre: 'texto' },
  },
  visitas: {
    modulo: 'Visitas',
    descripcion: 'Visitas a la sede: visitante, motivo, atendedor, fecha y estado.',
    columnas: { id: 'id', categoria_id: 'id', motivo_id: 'id', atendedor_id: 'id', sede_id: 'id', nombre_visitante: 'texto', dni_visitante: 'texto', patente: 'texto', fecha_hora: 'fecha', duracion_minutos: 'numero', nota: 'texto', estado: 'texto', citador_id: 'id', citador_nombre: 'texto', created_at: 'fecha', updated_at: 'fecha', hora_arribo: 'fecha', arribo_por_nombre: 'texto' },
  },
  visitas_atendedores: {
    modulo: 'Visitas',
    descripcion: 'Personas que atienden visitas.',
    columnas: { id: 'id', nombre: 'texto', user_id: 'id', sede_id: 'id', activo: 'booleano', created_at: 'fecha' },
  },
  visitas_categorias: {
    modulo: 'Visitas',
    descripcion: 'Catálogo de categorías de visita.',
    columnas: { id: 'id', nombre: 'texto', color: 'texto', duracion_default: 'numero', requiere_patente: 'booleano', orden: 'numero', activo: 'booleano', created_at: 'fecha', tipo_visita: 'texto', duracion_modificable: 'booleano', max_sesiones_dia: 'numero' },
  },
  visitas_motivos: {
    modulo: 'Visitas',
    descripcion: 'Catálogo de motivos de visita.',
    columnas: { id: 'id', categoria_id: 'id', nombre: 'texto', activo: 'booleano', created_at: 'fecha' },
  },
  visitas_horarios: {
    modulo: 'Visitas',
    descripcion: 'Horarios de atención de cada atendedor.',
    columnas: { id: 'id', atendedor_id: 'id', dia_semana: 'numero', hora_inicio: 'texto', hora_fin: 'texto', activo: 'booleano' },
  },
  visitas_motivo_atendedor: {
    modulo: 'Visitas',
    descripcion: 'Motivos que atiende cada atendedor.',
    columnas: { id: 'id', motivo_id: 'id', atendedor_id: 'id', sede_id: 'id', created_at: 'fecha' },
  },
  productos: {
    modulo: 'Inventario',
    descripcion: 'Productos de inventario.',
    columnas: { id: 'id', codigo: 'texto', nombre: 'texto', descripcion: 'texto', unidad_medida_id: 'id', estado_id: 'id', proveedor: 'texto', modelo: 'texto', observacion: 'texto', created_by: 'id', created_at: 'fecha', updated_at: 'fecha', categoria_id: 'id', es_retornable: 'booleano', tipo: 'texto', stock_minimo: 'numero', alerta_reposicion: 'numero' },
  },
  productos_estados: {
    modulo: 'Inventario',
    descripcion: 'Catálogo de estados de producto.',
    columnas: { id: 'id', codigo: 'texto', descripcion: 'texto', activo: 'booleano', created_at: 'fecha', updated_at: 'fecha' },
  },
  categorias: {
    modulo: 'Inventario',
    descripcion: 'Categorías de productos.',
    columnas: { id: 'id', codigo: 'texto', nombre: 'texto', descripcion: 'texto', activo: 'booleano', created_by: 'id', created_at: 'fecha', updated_at: 'fecha' },
  },
  unidades_medida: {
    modulo: 'Inventario',
    descripcion: 'Catálogo de unidades de medida.',
    columnas: { id: 'id', codigo: 'texto', descripcion: 'texto', activo: 'booleano', created_at: 'fecha', updated_at: 'fecha' },
  },
  inventario: {
    modulo: 'Inventario',
    descripcion: 'Stock por producto, estado y ubicación (asignado a conductor o vehículo).',
    columnas: { id: 'id', producto_id: 'id', estado: 'texto', cantidad: 'numero', ubicacion: 'texto', asignado_a_conductor_id: 'id', asignado_a_vehiculo_id: 'id', observaciones: 'texto', created_at: 'fecha', updated_at: 'fecha', proveedor_id: 'id' },
  },
  inventario_disponible_detallado: {
    modulo: 'Inventario',
    descripcion: 'Inventario disponible con producto y proveedor.',
    columnas: { id: 'id', producto_id: 'id', proveedor_id: 'id', producto_codigo: 'texto', producto_nombre: 'texto', producto_tipo: 'texto', proveedor_nombre: 'texto', cantidad: 'numero', estado: 'texto', ubicacion: 'texto', asignado_a_conductor_id: 'id', asignado_a_vehiculo_id: 'id', observaciones: 'texto', created_at: 'fecha', updated_at: 'fecha' },
  },
  inventario_total_por_producto: {
    modulo: 'Inventario',
    descripcion: 'Cantidad total por producto.',
    columnas: { producto_id: 'id', cantidad_total: 'numero', detalle_por_proveedor: 'json' },
  },
  movimientos: {
    modulo: 'Inventario',
    descripcion: 'Movimientos de inventario (entradas, salidas, asignaciones).',
    columnas: { id: 'id', producto_id: 'id', tipo_movimiento: 'texto', cantidad: 'numero', estado_origen: 'texto', estado_destino: 'texto', conductor_origen_id: 'id', conductor_destino_id: 'id', vehiculo_origen_id: 'id', vehiculo_destino_id: 'id', usuario_id: 'id', observaciones: 'texto', created_at: 'fecha', proveedor_id: 'id', motivo_salida: 'texto', servicio_id: 'id', pedido_id: 'id', estado_aprobacion: 'texto', usuario_aprobador_id: 'id', fecha_aprobacion: 'fecha', motivo_rechazo: 'texto', estado_retorno: 'texto', categoria_servicio: 'texto' },
  },
  pedidos_inventario: {
    modulo: 'Inventario',
    descripcion: 'Pedidos de inventario a proveedores.',
    columnas: { id: 'id', numero_pedido: 'texto', proveedor_id: 'id', fecha_pedido: 'fecha', fecha_estimada_llegada: 'fecha', estado: 'texto', observaciones: 'texto', usuario_registro_id: 'id', created_at: 'fecha', updated_at: 'fecha', estado_respuesta: 'texto', fecha_respuesta: 'fecha', fecha_comprometida: 'fecha' },
  },
  pedido_items: {
    modulo: 'Inventario',
    descripcion: 'Ítems de cada pedido de inventario.',
    columnas: { id: 'id', pedido_id: 'id', producto_id: 'id', cantidad_pedida: 'numero', cantidad_recibida: 'numero', estado: 'texto', created_at: 'fecha', updated_at: 'fecha', cantidad_confirmada: 'numero', precio_unitario: 'numero', fecha_estimada_item: 'fecha', estado_confirmacion: 'texto' },
  },
  pedido_seguimiento: {
    modulo: 'Inventario',
    descripcion: 'Seguimiento de pedidos de inventario.',
    columnas: { id: 'id', pedido_id: 'id', evento: 'texto', descripcion: 'texto', datos: 'json', usuario_id: 'id', created_at: 'fecha' },
  },
  proveedores: {
    modulo: 'Inventario',
    descripcion: 'Proveedores.',
    columnas: { id: 'id', razon_social: 'texto', tipo_documento: 'texto', numero_documento: 'texto', telefono: 'texto', email: 'texto', direccion: 'texto', activo: 'booleano', observaciones: 'texto', created_by: 'id', created_at: 'fecha', updated_at: 'fecha', categoria: 'texto' },
  },
  v_stock_productos: {
    modulo: 'Inventario',
    descripcion: 'Stock por producto: total, disponible, en uso, dañado, perdido.',
    columnas: { id: 'id', codigo: 'texto', nombre: 'texto', es_retornable: 'booleano', categoria: 'texto', stock_total: 'numero', disponible: 'numero', en_uso: 'numero', dañado: 'numero', perdido: 'numero' },
  },
  v_entradas_en_transito: {
    modulo: 'Inventario',
    descripcion: 'Entradas de inventario en tránsito.',
    columnas: { id: 'id', producto_id: 'id', producto_codigo: 'texto', producto_nombre: 'texto', producto_tipo: 'texto', cantidad: 'numero', proveedor_id: 'id', proveedor_nombre: 'texto', observaciones: 'texto', created_at: 'fecha', usuario_registro: 'texto', estado_aprobacion: 'texto', fecha_aprobacion: 'fecha', aprobador_nombre: 'texto' },
  },
  v_movimientos_pendientes: {
    modulo: 'Inventario',
    descripcion: 'Movimientos de inventario pendientes.',
    columnas: { id: 'id', tipo: 'texto', cantidad: 'numero', motivo_salida: 'texto', observaciones: 'texto', created_at: 'fecha', estado_retorno: 'texto', producto_id: 'id', producto_nombre: 'texto', producto_tipo: 'texto', proveedor_id: 'id', proveedor_nombre: 'texto', vehiculo_id: 'id', vehiculo_patente: 'texto', servicio_id: 'id', usuario_registrador_id: 'id', usuario_registrador_nombre: 'texto' },
  },
  v_pedidos_en_transito: {
    modulo: 'Inventario',
    descripcion: 'Pedidos en tránsito con sus ítems.',
    columnas: { pedido_id: 'id', numero_pedido: 'texto', fecha_pedido: 'fecha', fecha_estimada_llegada: 'fecha', estado_pedido: 'texto', observaciones: 'texto', proveedor_nombre: 'texto', item_id: 'id', producto_id: 'id', producto_codigo: 'texto', producto_nombre: 'texto', cantidad_pedida: 'numero', cantidad_recibida: 'numero', cantidad_pendiente: 'numero', estado_item: 'texto', usuario_registro: 'texto', estado_respuesta: 'texto', fecha_respuesta: 'fecha', fecha_comprometida: 'fecha', cantidad_confirmada: 'numero', estado_confirmacion: 'texto', fecha_estimada_item: 'fecha', precio_unitario: 'numero' },
  },
  v_herramientas_por_conductor: {
    modulo: 'Inventario',
    descripcion: 'Herramientas asignadas a cada conductor.',
    columnas: { conductor_id: 'id', conductor: 'texto', codigo: 'texto', producto: 'texto', cantidad: 'numero', ubicacion: 'texto', observaciones: 'texto', fecha_asignacion: 'fecha' },
  },
  kpi_diario: {
    modulo: 'Indicadores',
    descripcion: 'KPIs diarios por sede: vi = vehículos ingresados, cd = conductores en calle al cierre del día, al = altas (primer turno), ba = bajas.',
    columnas: { fecha: 'fecha', sede_id: 'id', vi: 'numero', cd: 'numero', al: 'numero', ba: 'numero', calculado_en: 'fecha' },
  },
  kpi_bajas: {
    modulo: 'Indicadores',
    descripcion: 'Bajas de conductores por día y sede, con motivo.',
    columnas: { fecha: 'fecha', sede_id: 'id', conductor_id: 'id', motivo: 'texto' },
  },
  kpi_flota_diaria: {
    modulo: 'Indicadores',
    descripcion: 'Foto diaria de la flota: total, en uso, asignados, turnos ocupados.',
    columnas: { id: 'id', fecha: 'fecha', sede_id: 'id', total_flota: 'numero', en_uso: 'numero', vehiculos_asignados: 'numero', pkg_on_libres: 'numero', turnos_totales: 'numero', turnos_ocupados: 'numero', origen: 'texto', capturado_en: 'fecha' },
  },
  kpi_foto_tarjetas: {
    modulo: 'Indicadores',
    descripcion: 'Valores diarios de las tarjetas de indicadores por módulo.',
    columnas: { fecha: 'fecha', sede_id: 'id', modulo: 'texto', metrica: 'texto', valor: 'numero', actualizado_en: 'fecha' },
  },
  cabify_historico: {
    modulo: 'Cabify',
    descripcion: 'Actividad semanal de conductores en Cabify (Buenos Aires): viajes, horas, score, ganancias.',
    columnas: { id: 'id', cabify_driver_id: 'texto', cabify_company_id: 'texto', nombre: 'texto', apellido: 'texto', email: 'texto', dni: 'texto', licencia: 'texto', telefono_codigo: 'texto', telefono_numero: 'texto', vehiculo_id: 'texto', vehiculo_patente: 'texto', vehiculo_marca: 'texto', vehiculo_modelo: 'texto', vehiculo_completo: 'texto', fecha_inicio: 'fecha', fecha_fin: 'fecha', viajes_finalizados: 'numero', viajes_rechazados: 'numero', viajes_perdidos: 'numero', viajes_aceptados: 'numero', viajes_ofrecidos: 'numero', score: 'numero', tasa_aceptacion: 'numero', tasa_ocupacion: 'numero', horas_conectadas: 'numero', horas_conectadas_formato: 'texto', cobro_efectivo: 'numero', cobro_app: 'numero', peajes: 'numero', ganancia_total: 'numero', ganancia_por_hora: 'numero', permiso_efectivo: 'texto', estado_conductor: 'texto', fecha_guardado: 'fecha', data_version: 'numero', last_updated_at: 'fecha', sede_id: 'id', promociones: 'numero', deducciones: 'numero', km_con_viaje: 'numero', km_sin_viaje: 'numero', km_conectado: 'numero', cuenta_cabify: 'texto' },
  },
  cabify_historico_bariloche: {
    modulo: 'Cabify',
    descripcion: 'Actividad semanal de conductores en Cabify (Bariloche).',
    columnas: { id: 'id', cabify_driver_id: 'texto', cabify_company_id: 'texto', nombre: 'texto', apellido: 'texto', email: 'texto', dni: 'texto', licencia: 'texto', telefono_codigo: 'texto', telefono_numero: 'texto', vehiculo_id: 'texto', vehiculo_patente: 'texto', vehiculo_marca: 'texto', vehiculo_modelo: 'texto', vehiculo_completo: 'texto', fecha_inicio: 'fecha', fecha_fin: 'fecha', viajes_finalizados: 'numero', viajes_rechazados: 'numero', viajes_perdidos: 'numero', viajes_aceptados: 'numero', viajes_ofrecidos: 'numero', score: 'numero', tasa_aceptacion: 'numero', tasa_ocupacion: 'numero', horas_conectadas: 'numero', horas_conectadas_formato: 'texto', cobro_efectivo: 'numero', cobro_app: 'numero', peajes: 'numero', ganancia_total: 'numero', ganancia_por_hora: 'numero', permiso_efectivo: 'texto', estado_conductor: 'texto', fecha_guardado: 'fecha', data_version: 'numero', last_updated_at: 'fecha', sede_id: 'id', promociones: 'numero', deducciones: 'numero', km_con_viaje: 'numero', km_sin_viaje: 'numero', km_conectado: 'numero', cuenta_cabify: 'texto' },
  },
  geotab_historico: {
    modulo: 'Telemetría',
    descripcion: 'Viajes registrados por GPS (Geotab): patente, conductor, km, velocidades.',
    columnas: { id: 'numero', patente: 'texto', conductor: 'texto', ibutton: 'texto', observaciones: 'texto', fecha_hora_inicio: 'fecha', fecha_hora_final: 'fecha', kilometraje: 'texto', created_at: 'fecha', fecha_hora_inicio_gmt3: 'fecha', fecha_hora_fin_gmt3: 'fecha', sede_id: 'id', geotab_trip_id: 'texto', geotab_device_id: 'texto', velocidad_maxima: 'numero', velocidad_promedio: 'numero', tiempo_ralenti_seg: 'numero', horas_motor_seg: 'numero', lat_stop: 'numero', lng_stop: 'numero', con_exceso: 'booleano', odometro_metros: 'numero', sin_cinturon: 'booleano', km_horario_laboral: 'numero', km_fuera_horario: 'numero' },
  },
  geotab_bitacora: {
    modulo: 'Telemetría',
    descripcion: 'Bitácora de turnos por GPS (Geotab): km, GNC, lavado, nafta.',
    columnas: { id: 'id', patente: 'texto', patente_normalizada: 'texto', vehiculo_id: 'id', ibutton: 'texto', conductor_wialon: 'texto', conductor_id: 'id', fecha_turno: 'fecha', hora_inicio: 'texto', hora_cierre: 'texto', kilometraje: 'numero', gnc_cargado: 'booleano', lavado_realizado: 'booleano', nafta_cargada: 'booleano', estado: 'texto', observaciones: 'texto', wialon_unit_id: 'numero', wialon_report_id: 'numero', periodo_inicio: 'fecha', periodo_fin: 'fecha', created_at: 'fecha', updated_at: 'fecha', synced_at: 'fecha', horario: 'texto', vehiculo_modalidad: 'texto', duracion_minutos: 'numero', sede_id: 'id', fecha_hora_inicio_gmt3: 'fecha', fecha_hora_fin_gmt3: 'fecha' },
  },
  geotab_excesos_velocidad: {
    modulo: 'Telemetría',
    descripcion: 'Excesos de velocidad registrados por GPS (Geotab).',
    columnas: { id: 'id', patente: 'texto', patente_normalizada: 'texto', vehiculo_id: 'id', fecha_evento: 'fecha', fecha_fin_evento: 'fecha', localizacion: 'texto', latitud: 'numero', longitud: 'numero', velocidad_maxima: 'numero', limite_velocidad: 'numero', exceso: 'numero', duracion_segundos: 'numero', conductor_wialon: 'texto', conductor_id: 'id', wialon_unit_id: 'numero', wialon_event_id: 'numero', periodo_inicio: 'fecha', periodo_fin: 'fecha', created_at: 'fecha', updated_at: 'fecha', ibutton: 'texto', sede_id: 'id' },
  },
  geotab_fault_data: {
    modulo: 'Telemetría',
    descripcion: 'Fallas mecánicas reportadas por GPS (Geotab).',
    columnas: { id: 'id', geotab_fault_id: 'texto', geotab_device_id: 'texto', vehiculo_id: 'id', patente: 'texto', fecha_evento: 'fecha', severidad: 'texto', diagnostic_code: 'texto', diagnostic_name: 'texto', failure_mode: 'texto', controller: 'texto', count: 'numero', lampara_red: 'booleano', lampara_amber: 'booleano', lampara_malfunction: 'booleano', lampara_protect: 'booleano', fault_description: 'texto', effect_on_component: 'texto', recommendation: 'texto', source_address: 'texto', estado: 'texto', dismiss_user: 'texto', dismiss_at: 'fecha', conductor_id: 'id', conductor_name: 'texto', sede_id: 'id', created_at: 'fecha', updated_at: 'fecha', synced_at: 'fecha' },
  },
  geotab_fillups: {
    modulo: 'Telemetría',
    descripcion: 'Cargas de combustible detectadas por GPS (Geotab).',
    columnas: { id: 'id', geotab_fillup_id: 'texto', vehiculo_id: 'id', patente: 'texto', geotab_device_id: 'texto', conductor_id: 'id', conductor_name: 'texto', fecha_evento: 'fecha', volume_litros: 'numero', derived_volume_litros: 'numero', tank_nivel_min_pct: 'numero', tank_nivel_max_pct: 'numero', subida_pct: 'numero', total_fuel_used_previo: 'numero', odometro_metros: 'numero', distance_previo_km: 'numero', cost: 'numero', currency_code: 'texto', product_type: 'texto', confidence: 'texto', location_lat: 'numero', location_lng: 'numero', location_direccion: 'texto', tank_capacity_litros: 'numero', sede_id: 'id', created_at: 'fecha', updated_at: 'fecha', synced_at: 'fecha' },
  },
  geotab_fuel_summary: {
    modulo: 'Telemetría',
    descripcion: 'Resumen de consumo de combustible por vehículo (Geotab).',
    columnas: { id: 'id', vehiculo_id: 'id', patente: 'texto', geotab_device_id: 'texto', periodo_dias: 'numero', fecha_desde: 'fecha', fecha_hasta: 'fecha', distancia_km: 'numero', combustible_litros: 'numero', ralenti_litros: 'numero', ralenti_pct: 'numero', rendimiento_km_litro: 'numero', energia_kwh: 'numero', llenados_count: 'numero', tiene_telemetria: 'booleano', sede_id: 'id', created_at: 'fecha', updated_at: 'fecha', synced_at: 'fecha', nivel_actual_pct: 'numero', nivel_actual_fecha: 'fecha' },
  },
  uss_historico: {
    modulo: 'Telemetría',
    descripcion: 'Viajes registrados por GPS (USS).',
    columnas: { id: 'numero', patente: 'texto', conductor: 'texto', ibutton: 'texto', observaciones: 'texto', fecha_hora_inicio: 'fecha', fecha_hora_final: 'fecha', kilometraje: 'texto', created_at: 'fecha', fecha_hora_inicio_gmt3: 'fecha', fecha_hora_fin_gmt3: 'fecha', sede_id: 'id', conductor_raw: 'texto' },
  },
  uss_excesos_velocidad: {
    modulo: 'Telemetría',
    descripcion: 'Excesos de velocidad registrados por GPS (USS).',
    columnas: { id: 'id', patente: 'texto', patente_normalizada: 'texto', vehiculo_id: 'id', fecha_evento: 'fecha', fecha_fin_evento: 'fecha', localizacion: 'texto', latitud: 'numero', longitud: 'numero', velocidad_maxima: 'numero', limite_velocidad: 'numero', exceso: 'numero', duracion_segundos: 'numero', conductor_wialon: 'texto', conductor_id: 'id', wialon_unit_id: 'numero', wialon_event_id: 'numero', periodo_inicio: 'fecha', periodo_fin: 'fecha', created_at: 'fecha', updated_at: 'fecha', ibutton: 'texto', sede_id: 'id' },
  },
  wialon_bitacora: {
    modulo: 'Telemetría',
    descripcion: 'Bitácora de turnos por GPS (Wialon).',
    columnas: { id: 'id', patente: 'texto', patente_normalizada: 'texto', vehiculo_id: 'id', ibutton: 'texto', conductor_wialon: 'texto', conductor_id: 'id', fecha_turno: 'fecha', hora_inicio: 'texto', hora_cierre: 'texto', kilometraje: 'numero', gnc_cargado: 'booleano', lavado_realizado: 'booleano', nafta_cargada: 'booleano', estado: 'texto', observaciones: 'texto', wialon_unit_id: 'numero', wialon_report_id: 'numero', periodo_inicio: 'fecha', periodo_fin: 'fecha', created_at: 'fecha', updated_at: 'fecha', synced_at: 'fecha', horario: 'texto', vehiculo_modalidad: 'texto', duracion_minutos: 'numero', sede_id: 'id' },
  },
  bitacora_checklist: {
    modulo: 'Telemetría',
    descripcion: 'Checklist de turno: GNC, lavado y nafta por patente.',
    columnas: { id: 'id', conductor: 'texto', fecha: 'fecha', patente: 'texto', gnc_cargado: 'booleano', lavado_realizado: 'booleano', nafta_cargada: 'booleano', created_at: 'fecha', updated_at: 'fecha', updated_by: 'id' },
  },
  mediciones_rutas: {
    modulo: 'Telemetría',
    descripcion: 'Mediciones de distancia y tiempo entre puntos.',
    columnas: { clave: 'texto', distancia_km: 'numero', tiempo_minutos: 'numero', creado_en: 'fecha' },
  },
  sedes: {
    modulo: 'General',
    descripcion: 'Sedes de la empresa.',
    columnas: { id: 'id', nombre: 'texto', codigo: 'texto', pais: 'texto', ciudad: 'texto', direccion: 'texto', telefono: 'texto', email: 'texto', es_principal: 'booleano', activa: 'booleano', created_at: 'fecha', updated_at: 'fecha', cabify_tabla: 'texto', solo_admin: 'booleano' },
  },
  zonas_peligrosas: {
    modulo: 'General',
    descripcion: 'Zonas peligrosas configuradas para asignaciones.',
    columnas: { id: 'id', nombre: 'texto', descripcion: 'texto', tipo_id: 'id', bloquear_asignaciones: 'booleano', mostrar_advertencia: 'booleano', mensaje_advertencia: 'texto', activo: 'booleano', created_by: 'id', created_at: 'fecha', updated_at: 'fecha' },
  },
  zonas_tipos: {
    modulo: 'General',
    descripcion: 'Catálogo de tipos de zona.',
    columnas: { id: 'id', codigo: 'texto', nombre: 'texto', color: 'texto', descripcion: 'texto', activo: 'booleano', created_at: 'fecha', updated_at: 'fecha' },
  },
  // ---------------------------------------------------------------------------
  // Administración (permiso administracion:read, aparte de datos:read).
  // Facturación, usuarios, roles y permisos de menú, procesos y prompts. Siguen afuera
  // las API keys, api_users y sesiones (credenciales) y los respaldos.
  // ---------------------------------------------------------------------------
  periodos_facturacion: {
    modulo: 'Facturación',
    permiso: 'administracion:read',
    descripcion: 'Períodos (semanas) de facturación: fechas, estado (abierto/cerrado), totales y quién lo cerró.',
    columnas: { id: 'id', semana: 'numero', anio: 'numero', fecha_inicio: 'fecha', fecha_fin: 'fecha', estado: 'texto', fecha_cierre: 'fecha', total_conductores: 'numero', total_cargos: 'numero', total_descuentos: 'numero', total_neto: 'numero', created_at: 'fecha', updated_at: 'fecha', created_by: 'id', created_by_name: 'texto', cerrado_por: 'id', cerrado_por_name: 'texto', sede_id: 'id' },
  },
  facturacion_conductores: {
    modulo: 'Facturación',
    permiso: 'administracion:read',
    descripcion: 'Facturación semanal de cada conductor: turnos, alquiler, garantía, cargos, descuentos, saldo anterior, mora y total a pagar. Cruza con periodos_facturacion por periodo_id.',
    columnas: { id: 'id', periodo_id: 'id', conductor_id: 'id', conductor_nombre: 'texto', conductor_dni: 'texto', conductor_cuit: 'texto', vehiculo_id: 'id', vehiculo_patente: 'texto', tipo_alquiler: 'texto', turnos_base: 'numero', turnos_cobrados: 'numero', factor_proporcional: 'numero', subtotal_alquiler: 'numero', subtotal_garantia: 'numero', subtotal_cargos: 'numero', subtotal_descuentos: 'numero', subtotal_neto: 'numero', saldo_anterior: 'numero', dias_mora: 'numero', monto_mora: 'numero', total_a_pagar: 'numero', estado: 'texto', created_at: 'fecha', updated_at: 'fecha', sede_id: 'id', saldo_aplicado: 'booleano', proyectado_alquiler: 'numero' },
  },
  facturacion_detalle: {
    modulo: 'Facturación',
    permiso: 'administracion:read',
    descripcion: 'Renglones (conceptos) de cada facturación de conductor: concepto, cantidad, precio, IVA y total. Cruza con facturacion_conductores por facturacion_id.',
    columnas: { id: 'id', facturacion_id: 'id', concepto_id: 'id', concepto_codigo: 'texto', concepto_descripcion: 'texto', cantidad: 'numero', precio_unitario: 'numero', subtotal: 'numero', iva_porcentaje: 'numero', iva_monto: 'numero', total: 'numero', es_descuento: 'booleano', descripcion: 'texto', referencia_id: 'id', referencia_tipo: 'texto', created_at: 'fecha', sede_id: 'id' },
  },
  facturacion_cabify: {
    modulo: 'Facturación',
    permiso: 'administracion:read',
    descripcion: 'Datos de Cabify usados en la facturación semanal (importe generado, horas de conexión, efectivo).',
    columnas: { id: 'id', periodo_id: 'id', conductor_id: 'id', conductor_nombre: 'texto', conductor_dni: 'texto', conductor_email: 'texto', vehiculo_patente: 'texto', importe_contrato: 'numero', excedentes: 'numero', horas_conexion: 'numero', importe_generado: 'numero', importe_generado_bonos: 'numero', generado_efectivo: 'numero', created_at: 'fecha', updated_at: 'fecha', sede_id: 'id' },
  },
  conductores_semana_facturacion: {
    modulo: 'Facturación',
    permiso: 'administracion:read',
    descripcion: 'Conductores incluidos en cada semana de facturación con patente, modalidad y valor de alquiler.',
    columnas: { id: 'id', numero_dni: 'texto', semana: 'numero', anio: 'numero', created_at: 'fecha', estado: 'texto', patente: 'texto', modalidad: 'texto', valor_alquiler: 'numero', sede_id: 'id' },
  },
  saldos_conductores: {
    modulo: 'Facturación',
    permiso: 'administracion:read',
    descripcion: 'Saldo actual de cada conductor (deuda o a favor) y mora acumulada.',
    columnas: { id: 'id', conductor_id: 'id', conductor_nombre: 'texto', conductor_dni: 'texto', conductor_cuit: 'texto', saldo_actual: 'numero', dias_mora: 'numero', monto_mora_acumulada: 'numero', ultima_actualizacion: 'fecha', created_at: 'fecha', updated_at: 'fecha', fecha_referencia: 'fecha', sede_id: 'id' },
  },
  v_ultimo_saldo_conductor: {
    modulo: 'Facturación',
    permiso: 'administracion:read',
    descripcion: 'Último saldo pendiente de cada conductor.',
    columnas: { conductor_id: 'id', saldo_pendiente: 'numero' },
  },
  control_saldos: {
    modulo: 'Facturación',
    permiso: 'administracion:read',
    descripcion: 'Movimientos del saldo de cada conductor por semana (adeudado, a favor, pendiente, mora).',
    columnas: { id: 'id', conductor_id: 'id', conductor_nombre: 'texto', conductor_dni: 'texto', conductor_cuit: 'texto', semana: 'numero', anio: 'numero', periodo_id: 'id', saldo_adeudado: 'numero', saldo_a_favor: 'numero', saldo_pendiente: 'numero', created_at: 'fecha', updated_at: 'fecha', dias_mora: 'numero', interes_mora: 'numero', tipo_movimiento: 'texto', monto_movimiento: 'numero', referencia: 'texto', created_by_name: 'texto', sede_id: 'id', saldo_previo: 'numero' },
  },
  pagos_conductores: {
    modulo: 'Facturación',
    permiso: 'administracion:read',
    descripcion: 'Pagos registrados de los conductores (tipo de cobro, monto, fecha, semana).',
    columnas: { id: 'id', conductor_id: 'id', tipo_cobro: 'texto', referencia_id: 'texto', referencia_tabla: 'texto', numero_cuota: 'numero', monto: 'numero', fecha_pago: 'fecha', referencia: 'texto', semana: 'numero', anio: 'numero', conductor_nombre: 'texto', created_at: 'fecha', sede_id: 'id', created_by_name: 'texto' },
  },
  abonos_conductores: {
    modulo: 'Facturación',
    permiso: 'administracion:read',
    descripcion: 'Abonos (pagos o ajustes) cargados a conductores, con concepto y semana.',
    columnas: { id: 'id', conductor_id: 'id', tipo: 'texto', monto: 'numero', concepto: 'texto', referencia: 'texto', fecha_abono: 'fecha', created_by: 'id', created_by_name: 'texto', created_at: 'fecha', anio: 'numero', semana: 'numero', sede_id: 'id' },
  },
  cobros_fraccionados: {
    modulo: 'Facturación',
    permiso: 'administracion:read',
    descripcion: 'Cobros en cuotas a conductores: monto total, cuota, semana de aplicación y estado.',
    columnas: { id: 'id', conductor_id: 'id', monto_total: 'numero', monto_cuota: 'numero', numero_cuota: 'numero', semana: 'numero', anio: 'numero', descripcion: 'texto', aplicado: 'booleano', fecha_aplicacion: 'fecha', total_cuotas: 'numero', created_at: 'fecha', updated_at: 'fecha', sede_id: 'id', estado: 'texto' },
  },
  penalidades_cuotas: {
    modulo: 'Facturación',
    permiso: 'administracion:read',
    descripcion: 'Cuotas de penalidades fraccionadas, con semana y si ya se aplicaron.',
    columnas: { id: 'id', penalidad_id: 'id', numero_cuota: 'numero', monto_cuota: 'numero', semana: 'numero', anio: 'numero', aplicado: 'booleano', fecha_aplicacion: 'fecha', created_at: 'fecha', sede_id: 'id', estado: 'texto' },
  },
  excesos_kilometraje: {
    modulo: 'Facturación',
    permiso: 'administracion:read',
    descripcion: 'Excesos de kilometraje facturados por conductor y período.',
    columnas: { id: 'id', conductor_id: 'id', vehiculo_id: 'id', periodo_id: 'id', km_recorridos: 'numero', km_base: 'numero', km_exceso: 'numero', rango: 'texto', porcentaje: 'numero', valor_alquiler: 'numero', monto_base: 'numero', iva_porcentaje: 'numero', iva_monto: 'numero', monto_total: 'numero', aplicado: 'booleano', fecha_aplicacion: 'fecha', created_at: 'fecha', sede_id: 'id' },
  },
  tickets_favor: {
    modulo: 'Facturación',
    permiso: 'administracion:read',
    descripcion: 'Tickets a favor del conductor (reintegros): tipo, monto, estado y período aplicado.',
    columnas: { id: 'id', conductor_id: 'id', conductor_nombre: 'texto', conductor_dni: 'texto', tipo: 'texto', descripcion: 'texto', monto: 'numero', estado: 'texto', fecha_solicitud: 'fecha', fecha_aprobacion: 'fecha', fecha_aplicacion: 'fecha', motivo_rechazo: 'texto', periodo_aplicado_id: 'id', created_by: 'id', created_by_name: 'texto', created_at: 'fecha', updated_at: 'fecha', sede_id: 'id' },
  },
  garantias_conductores: {
    modulo: 'Facturación',
    permiso: 'administracion:read',
    descripcion: 'Garantía de cada conductor: monto total, cuota semanal, cuotas pagadas, monto pagado y devuelto, estado.',
    columnas: { id: 'id', conductor_id: 'id', conductor_nombre: 'texto', conductor_dni: 'texto', conductor_cuit: 'texto', tipo_alquiler: 'texto', monto_total: 'numero', monto_cuota_semanal: 'numero', cuotas_totales: 'numero', cuotas_pagadas: 'numero', monto_pagado: 'numero', estado: 'texto', fecha_inicio: 'fecha', fecha_completada: 'fecha', created_at: 'fecha', updated_at: 'fecha', created_by: 'id', created_by_name: 'texto', semana_inicio: 'numero', anio_inicio: 'numero', sede_id: 'id', monto_devuelto: 'numero', monto_realmente_pagado: 'numero' },
  },
  garantias_pagos: {
    modulo: 'Facturación',
    permiso: 'administracion:read',
    descripcion: 'Pagos de cuotas de garantía.',
    columnas: { id: 'id', garantia_id: 'id', conductor_id: 'id', numero_cuota: 'numero', monto: 'numero', fecha_pago: 'fecha', referencia: 'texto', created_at: 'fecha', semana: 'numero', anio: 'numero', sede_id: 'id' },
  },
  garantias_devoluciones: {
    modulo: 'Facturación',
    permiso: 'administracion:read',
    descripcion: 'Devoluciones de garantía a conductores.',
    columnas: { id: 'id', garantia_id: 'id', conductor_id: 'id', monto: 'numero', fecha_devolucion: 'fecha', referencia: 'texto', created_at: 'fecha', created_by: 'id', created_by_name: 'texto', sede_id: 'id' },
  },
  garantias_ediciones_historial: {
    modulo: 'Facturación',
    permiso: 'administracion:read',
    descripcion: 'Historial de ediciones manuales de garantías (antes y después, motivo).',
    columnas: { id: 'id', garantia_id: 'id', conductor_id: 'id', monto_pagado_anterior: 'numero', monto_pagado_nuevo: 'numero', monto_total_anterior: 'numero', monto_total_nuevo: 'numero', estado_anterior: 'texto', estado_nuevo: 'texto', motivo: 'texto', created_by: 'id', created_by_name: 'texto', created_at: 'fecha' },
  },
  control_garantias: {
    modulo: 'Facturación',
    permiso: 'administracion:read',
    descripcion: 'Movimientos de garantía por semana (facturado, pagado real, deuda acumulada).',
    columnas: { id: 'id', garantia_id: 'id', conductor_id: 'id', conductor_nombre: 'texto', conductor_dni: 'texto', conductor_cuit: 'texto', semana: 'numero', anio: 'numero', periodo_id: 'id', tipo_movimiento: 'texto', monto_facturado: 'numero', monto_pagado_real: 'numero', delta_deuda: 'numero', facturado_acumulado: 'numero', pagado_real_acumulado: 'numero', cuotas_facturadas: 'numero', estado_garantia: 'texto', referencia: 'texto', observaciones: 'texto', created_at: 'fecha', created_by_name: 'texto', sede_id: 'id' },
  },
  promociones: {
    modulo: 'Facturación',
    permiso: 'administracion:read',
    descripcion: 'Promociones (por ejemplo licencia B1): código, período y si está activa.',
    columnas: { id: 'id', codigo: 'texto', nombre: 'texto', activa: 'booleano', fecha_inicio: 'fecha', fecha_fin: 'fecha', created_at: 'fecha', updated_at: 'fecha', updated_by: 'id', updated_by_name: 'texto', descripcion: 'texto', clave: 'texto' },
  },
  promociones_historial: {
    modulo: 'Facturación',
    permiso: 'administracion:read',
    descripcion: 'Historial de cambios de las promociones.',
    columnas: { id: 'numero', promocion_codigo: 'texto', activa: 'booleano', fecha_inicio: 'fecha', fecha_fin: 'fecha', registrado_at: 'fecha', cambiado_por: 'id', usuario_nombre: 'texto', cambio: 'texto', descripcion: 'texto', promocion_id: 'id' },
  },
  promocion_b1_pagos: {
    modulo: 'Facturación',
    permiso: 'administracion:read',
    descripcion: 'Pagos diarios de la promoción licencia B1 (adelantos de la facturación semanal).',
    columnas: { id: 'id', conductor_id: 'id', origen: 'texto', fecha: 'fecha', monto: 'numero', cresium_movimiento_id: 'id', pagador: 'texto', cuit: 'texto', nota: 'texto', created_by: 'id', created_by_name: 'texto', created_at: 'fecha', anulado_at: 'fecha', anulado_by: 'id', anulado_by_name: 'texto', editado_at: 'fecha', editado_by: 'id', editado_by_name: 'texto', abono_id: 'id' },
  },
  conceptos_nomina: {
    modulo: 'Facturación',
    permiso: 'administracion:read',
    descripcion: 'Conceptos de facturación con su precio base, IVA y precio final.',
    columnas: { id: 'id', codigo: 'texto', descripcion: 'texto', precio_base: 'numero', iva_porcentaje: 'numero', precio_final: 'numero', tipo: 'texto', es_variable: 'booleano', aplica_turno: 'booleano', aplica_cargo: 'booleano', activo: 'booleano', orden: 'numero', created_at: 'fecha', updated_at: 'fecha', created_by_name: 'texto', updated_by: 'texto', tipo_parametro: 'texto', precio_semanal: 'numero', es_semanal: 'booleano' },
  },
  conceptos_facturacion_historial: {
    modulo: 'Facturación',
    permiso: 'administracion:read',
    descripcion: 'Historial de precios de los conceptos de facturación con su vigencia.',
    columnas: { id: 'id', concepto_id: 'id', codigo: 'texto', descripcion: 'texto', precio_base: 'numero', iva_porcentaje: 'numero', precio_final: 'numero', fecha_vigencia_desde: 'fecha', fecha_vigencia_hasta: 'fecha', created_at: 'fecha' },
  },
  user_profiles: {
    modulo: 'Administración',
    permiso: 'administracion:read',
    descripcion: 'Usuarios del sistema: nombre, email, rol, sede y si está activo. Sin contraseñas.',
    columnas: { id: 'id', full_name: 'texto', role_id: 'id', is_active: 'booleano', created_at: 'fecha', updated_at: 'fecha', phone: 'texto', email: 'texto', sede_id: 'id', puede_cambiar_sede: 'booleano', ver_todas_sedes: 'booleano' },
  },
  roles: {
    modulo: 'Administración',
    permiso: 'administracion:read',
    descripcion: 'Roles de usuario.',
    columnas: { id: 'id', name: 'texto', description: 'texto', created_at: 'fecha' },
  },
  menus: {
    modulo: 'Administración',
    permiso: 'administracion:read',
    descripcion: 'Menús del sistema.',
    columnas: { id: 'id', name: 'texto', label: 'texto', icon: 'texto', route: 'texto', order_index: 'numero', is_active: 'booleano', created_at: 'fecha', updated_at: 'fecha' },
  },
  submenus: {
    modulo: 'Administración',
    permiso: 'administracion:read',
    descripcion: 'Submenús del sistema.',
    columnas: { id: 'id', menu_id: 'id', parent_id: 'id', name: 'texto', label: 'texto', icon: 'texto', route: 'texto', order_index: 'numero', level: 'numero', is_active: 'booleano', created_at: 'fecha', updated_at: 'fecha' },
  },
  role_menu_permissions: {
    modulo: 'Administración',
    permiso: 'administracion:read',
    descripcion: 'Permisos de cada rol por menú (ver, crear, editar, eliminar).',
    columnas: { id: 'id', role_id: 'id', menu_id: 'id', can_view: 'booleano', can_create: 'booleano', can_edit: 'booleano', can_delete: 'booleano', created_at: 'fecha', updated_at: 'fecha' },
  },
  role_submenu_permissions: {
    modulo: 'Administración',
    permiso: 'administracion:read',
    descripcion: 'Permisos de cada rol por submenú.',
    columnas: { id: 'id', role_id: 'id', submenu_id: 'id', can_view: 'booleano', can_create: 'booleano', can_edit: 'booleano', can_delete: 'booleano', created_at: 'fecha', updated_at: 'fecha' },
  },
  role_tab_permissions: {
    modulo: 'Administración',
    permiso: 'administracion:read',
    descripcion: 'Permisos de cada rol por pestaña.',
    columnas: { id: 'id', role_id: 'id', tab_id: 'id', can_view: 'booleano', can_create: 'booleano', can_edit: 'booleano', can_delete: 'booleano', created_at: 'fecha', updated_at: 'fecha' },
  },
  user_menu_permissions: {
    modulo: 'Administración',
    permiso: 'administracion:read',
    descripcion: 'Permisos individuales de usuarios por menú.',
    columnas: { id: 'id', user_id: 'id', menu_id: 'id', can_view: 'booleano', can_create: 'booleano', can_edit: 'booleano', can_delete: 'booleano', created_by: 'id', created_at: 'fecha', updated_at: 'fecha' },
  },
  user_submenu_permissions: {
    modulo: 'Administración',
    permiso: 'administracion:read',
    descripcion: 'Permisos individuales de usuarios por submenú.',
    columnas: { id: 'id', user_id: 'id', submenu_id: 'id', can_view: 'booleano', can_create: 'booleano', can_edit: 'booleano', can_delete: 'booleano', created_by: 'id', created_at: 'fecha', updated_at: 'fecha' },
  },
  user_tab_permissions: {
    modulo: 'Administración',
    permiso: 'administracion:read',
    descripcion: 'Permisos individuales de usuarios por pestaña.',
    columnas: { id: 'id', user_id: 'id', tab_id: 'id', can_view: 'booleano', can_create: 'booleano', can_edit: 'booleano', can_delete: 'booleano', created_at: 'fecha', updated_at: 'fecha' },
  },
  cron_jobs: {
    modulo: 'Administración',
    permiso: 'administracion:read',
    descripcion: 'Procesos automáticos (sincronizaciones): horario, si está activo y resultado de la última ejecución.',
    columnas: { id: 'id', nombre: 'texto', descripcion: 'texto', schedule: 'texto', tipo: 'texto', integracion: 'texto', activo: 'booleano', ultima_ejecucion: 'fecha', ultimo_estado: 'texto', ultimo_error: 'texto', created_at: 'fecha', updated_at: 'fecha' },
  },
  mynos_prompts: {
    modulo: 'Administración',
    permiso: 'administracion:read',
    descripcion: 'Prompts del chatbot.',
    columnas: { id: 'numero', created_at: 'fecha', updated_at: 'fecha', slug: 'texto', prompt: 'texto' },
  },
};

/** Columnas que existen en la base pero no se exponen (referencia para revisar). */
export const COLUMNAS_EXCLUIDAS = {
  conductores: ['fecha_nacimiento', 'direccion', 'contacto_emergencia', 'telefono_emergencia', 'antecedentes_penales', 'antecedentes_transito', 'foto_url', 'documentos_urls', 'cbu', 'drive_folder_url', 'url_documentacion', 'direccion_lat', 'direccion_lng', 'drive_contract_folder_url', 'parentesco_emergencia', 'direccion_emergencia', 'portal_password_hash', 'portal_must_change_password', 'direccion_pais', 'direccion_ciudad', 'direccion_geocode_fecha', 'estado_facturacion'],
  vehiculos: ['foto_url', 'documentos_urls', 'drive_folder_id', 'drive_folder_url', 'url_documentacion'],
  leads: ['direccion', 'antecedentes_penales', 'contacto_de_emergencia', 'link_facturacion', 'url_folder', 'fecha_de_nacimiento', 'direccion_complementaria', 'latitud', 'longitud', 'dni_archivo', 'certificado_direccion', 'cbu', 'datos_de_emergencia', 'telefono_emergencia', 'parentesco_emergencia', 'direccion_emergencia', 'verificacion_emergencia', 'direccion_latitud', 'direccion_longitud', 'direccion_geocode_estado', 'direccion_geocode_fecha', 'direccion_pais', 'direccion_ciudad', 'bcra', 'rnr', 'fecha_rnr'],
  programaciones_onboarding: ['direccion'],
  v_programaciones_onboarding: ['direccion'],
  siniestros: ['tercero_dni', 'tercero_telefono', 'carpeta_drive_url'],
  v_siniestros_completos: ['tercero_dni', 'tercero_telefono', 'carpeta_drive_url'],
  multas_historico: ['drive_url'],
  movimientos: ['documento_url'],
  proveedores: ['informacion_pago'],
  zonas_peligrosas: ['poligono'],
  periodos_facturacion: ['lock_token', 'procesando_desde', 'procesando_por', 'procesando_actual', 'procesando_total'], // control interno del cierre
  tickets_favor: ['comprobante_url'],
  user_profiles: ['avatar_url', 'bio', 'preferences', 'must_change_password'],
  cron_jobs: ['comando', 'metadata'],
  kpi_diario: ['fn', 'ac', 'co', 'cc', 'fa', 'fg', 'ft', 'pe'], // indicadores de facturación
};
