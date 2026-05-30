export interface OfertaLocacion {
  id: string
  vehiculo_titular_id: string
  vehiculo_id: string
  titular_id: string

  // Datos copiados del titular (editables)
  titular_nombre: string | null
  titular_dni_cuit: string | null
  titular_domicilio: string | null
  titular_email: string | null
  titular_cuit: string | null
  titular_conyugue: string | null

  // Datos copiados del vehículo (editables)
  patente: string | null
  marca: string | null
  modelo: string | null
  anio: string | null
  color: string | null
  numero_motor: string | null
  numero_chasis: string | null
  kilometraje: number | null

  // Datos del contrato
  fecha_ingreso: string | null
  fecha_inicio_alquiler: string | null
  canon_mensual: number | null
  socio: '44dreams' | 'grupocg' | null

  // Estado del vehículo
  nivel_nafta: string | null
  titulo_automotor: string | null
  tipo_cedula: string | null
  cantidad_llaves: number | null

  // Vencimientos
  vencimiento_seguro: string | null
  vto_vtv: string | null
  vto_gnc: string | null
  vto_matafuego: string | null

  // Elementos de seguridad
  criquet: boolean
  mariposa: boolean
  llave_tuercas: boolean
  rueda_auxilio: boolean
  balizas: boolean
  chaleco_reflectivo: boolean
  guantes: boolean
  botiquin: boolean

  // Limpieza
  limpieza_interior: string | null
  limpieza_exterior: string | null

  // Relevamiento de daños
  detalle_parte_frontal: string | null
  detalle_parte_trasera: string | null
  detalle_lateral_derecho: string | null
  detalle_lateral_izquierdo: string | null
  detalle_capot_techo: string | null
  detalle_interior: string | null
  detalle_otros: string | null

  // Informes y costos
  informe_dominio: string | null
  informe_multas: string | null
  gravamenes: string | null
  costo_multas: number | null
  costo_patente: number | null
  costo_mantenimiento_reparacion: number | null
  otros_costos: number | null

  // Estado del registro
  estado: 'borrador' | 'completado' | 'documento_generado'

  // Drive
  drive_folder_url: string | null

  // Metadata
  sede_id: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  created_by_name: string | null
}

export interface OfertaLocacionFormData {
  // Datos del titular
  titular_nombre: string
  titular_dni_cuit: string
  titular_domicilio: string
  titular_email: string
  titular_cuit: string
  titular_conyugue: string

  // Datos del vehículo
  patente: string
  marca: string
  modelo: string
  anio: string
  color: string
  numero_motor: string
  numero_chasis: string
  kilometraje: number | null

  // Contrato
  fecha_ingreso: string
  fecha_inicio_alquiler: string
  canon_mensual: number | null
  socio: '44dreams' | 'grupocg' | ''

  // Estado del vehículo
  nivel_nafta: string
  titulo_automotor: string
  tipo_cedula: string
  cantidad_llaves: number | null

  // Vencimientos
  vencimiento_seguro: string
  vto_vtv: string
  vto_gnc: string
  vto_matafuego: string

  // Elementos de seguridad
  criquet: boolean
  mariposa: boolean
  llave_tuercas: boolean
  rueda_auxilio: boolean
  balizas: boolean
  chaleco_reflectivo: boolean
  guantes: boolean
  botiquin: boolean

  // Limpieza
  limpieza_interior: string
  limpieza_exterior: string

  // Relevamiento de daños
  detalle_parte_frontal: string
  detalle_parte_trasera: string
  detalle_lateral_derecho: string
  detalle_lateral_izquierdo: string
  detalle_capot_techo: string
  detalle_interior: string
  detalle_otros: string

  // Informes y costos
  informe_dominio: string
  informe_multas: string
  gravamenes: string
  costo_multas: number | null
  costo_patente: number | null
  costo_mantenimiento_reparacion: number | null
  otros_costos: number | null
}
