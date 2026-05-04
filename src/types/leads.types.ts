// src/types/leads.types.ts
// Interface alineada con el esquema real de la tabla `leads` en Supabase
// (todas las columnas en snake_case tras la normalización).

export interface Lead {
  id: string

  // Identificación / datos personales
  nombre_completo?: string | null
  nombre_completo_2?: string | null
  primer_nombre?: string | null
  apellido?: string | null
  dni?: string | null
  cuit?: string | null
  edad?: number | null
  fecha_de_nacimiento?: string | null
  estado_civil?: string | null
  nacionalidad?: string | null

  // Contacto
  email?: string | null
  phone?: string | null
  whatsapp_number?: string | null
  contacto_de_emergencia?: string | null
  datos_de_emergencia?: string | null
  telefono_emergencia?: string | null
  parentesco_emergencia?: string | null
  direccion_emergencia?: string | null
  verificacion_emergencia?: boolean | null

  // Dirección / geolocalización
  direccion?: string | null
  direccion_complementaria?: string | null
  zona?: string | null
  sede?: string | null
  sede_id?: string | null
  sede_vehiculo?: string | null
  latitud?: number | null
  longitud?: number | null
  estado_direccion?: string | null
  clasificacion_domicilio?: string | null
  country?: string | null
  region?: string | null
  city?: string | null
  timezone?: string | null

  // Documentación
  licencia?: string | null
  vencimiento_licencia?: string | null
  rnr?: string | null
  fecha_rnr?: string | null
  dni_archivo?: string | null
  d1?: string | null
  certificado_direccion?: string | null

  // Datos operativos
  turno?: string | null
  cuenta_cabify?: string | null
  cochera?: string | null
  rueda?: string | null
  monotributo?: string | null
  bcra?: string | null
  experiencia_previa?: string | null
  experiencia_manejo?: string | null
  antecedentes_penales?: boolean | null
  disponibilidad?: string | null

  // Datos bancarios / laborales
  cbu?: string | null
  fecha_de_inicio?: string | null
  mail_de_respaldo?: string | null

  // Vehículo
  patente?: string | null
  anio_de_auto?: string | null
  km_de_auto?: string | null
  marca_y_modelo_de_vehiculo?: string | null

  // Proceso / evaluación
  proceso?: string | null
  entrevista_ia?: string | null
  induccion?: string | null
  estado_de_lead?: string | null
  fase_de_preguntas?: string | null
  causal_de_cierre?: string | null

  // Asignaciones
  agente_asignado?: string | null
  entrevistador_asignado?: string | null
  especialista_onboarding?: string | null
  administrativo_asignado?: string | null
  dataentry_asignado?: string | null
  agente_logistico_asignado?: string | null
  guia_asignado?: string | null
  asistente_virtual?: string | null
  companero?: string | null

  // Observaciones y documentos
  observaciones?: string | null
  documentos_pendientes?: string | null
  link_facturacion?: string | null
  codigo_referido?: string | null
  ayuda_entrevista?: string | null
  url_folder?: string | null

  // UTM / fuente
  utm_campaign?: string | null
  utm_content?: string | null
  utm_medium?: string | null
  utm_source?: string | null
  utm_term?: string | null
  fuente_de_lead?: string | null

  // Flags
  acepta_oferta?: boolean | null
  cerrado_timeout_wpp?: boolean | null

  // Actividad
  fecha_creacion?: string | null
  fecha_carga?: string | null
  last_seen?: string | null
  last_contacted?: string | null
  last_heard_from?: string | null
  ultima_actividad?: string | null
  user_id?: string | null
  id_lead?: string | null
  tipo?: string | null
  tiempo_de_antiguedad?: string | null

  // Intercom
  id_conversation?: string | null

  // Licencia detallada
  numero_licencia?: string | null
  categorias_licencia?: string[] | null
  estado_licencia?: string | null
  tipo_licencia?: string | null

  // Hireflix
  resultado_hireflix?: string | null
  resumen_hireflix?: string | null
  id_hireflix?: string | null

  // Sistema
  created_at: string
  updated_at?: string | null
}

// Formulario (mismas keys que Lead para evitar mapeos, salvo nombre_completo requerido)
export interface LeadFormData {
  nombre_completo: string
  primer_nombre?: string
  apellido?: string
  email?: string
  phone?: string
  whatsapp_number?: string
  dni?: string
  cuit?: string
  edad?: number
  fecha_de_nacimiento?: string
  estado_civil?: string
  nacionalidad?: string
  proceso?: string
  entrevista_ia?: string
  induccion?: string
  disponibilidad?: string
  estado_de_lead?: string
  direccion?: string
  direccion_complementaria?: string
  zona?: string
  sede?: string
  sede_id?: string
  latitud?: number
  longitud?: number
  estado_direccion?: string
  clasificacion_domicilio?: string
  licencia?: string
  vencimiento_licencia?: string
  numero_licencia?: string
  categorias_licencia?: string[]
  estado_licencia?: string
  tipo_licencia?: string
  rnr?: string
  fecha_rnr?: string
  dni_archivo?: string
  d1?: string
  certificado_direccion?: string
  turno?: string
  cuenta_cabify?: string
  cochera?: string
  rueda?: string
  monotributo?: string
  bcra?: string
  experiencia_previa?: string
  cbu?: string
  fecha_de_inicio?: string
  mail_de_respaldo?: string
  agente_asignado?: string
  entrevistador_asignado?: string
  datos_de_emergencia?: string
  telefono_emergencia?: string
  parentesco_emergencia?: string
  direccion_emergencia?: string
  verificacion_emergencia?: boolean
  observaciones?: string
  fuente_de_lead?: string
  codigo_referido?: string
}

export interface LeadStats {
  total: number
  aptos: number
  enProceso: number
  descartados: number
  disponibilidadInmediata: number
  exConductores: number
  sinEntrevistar: number
}
