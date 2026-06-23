export interface Titular {
  id: string
  tipo: 'persona' | 'empresa'

  // Campos comunes
  dni_cuit: string
  domicilio: string | null
  email: string | null
  telefono: string | null

  // Campos persona
  nombres: string | null
  apellidos: string | null
  conyugue: string | null
  dni_conyugue: string | null
  nombre_conyugue: string | null

  // Campos empresa
  razon_social: string | null
  representante_administrativo: string | null
  dni_representante: string | null
  email_representante: string | null
  domicilio_fiscal: string | null

  // Metadata
  estado: string
  sede_id: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  created_by_name: string | null
  updated_by: string | null
  updated_by_name: string | null
}

export interface VehiculoTitular {
  id: string
  vehiculo_id: string
  titular_id: string
  fecha_desde: string
  fecha_hasta: string | null
  activo: boolean
  created_at: string
  created_by: string | null
  created_by_name: string | null

  // Joins
  vehiculos?: {
    patente: string
    marca: string
    modelo: string
    estado_id?: string | null
    vehiculos_estados?: { descripcion: string } | null
  }
  titulares?: Titular
}

export interface TitularFormData {
  tipo: 'persona' | 'empresa'
  dni_cuit: string
  domicilio: string
  email: string
  telefono: string

  // Persona
  nombres: string
  apellidos: string
  conyugue: string
  dni_conyugue: string
  nombre_conyugue: string

  // Empresa
  razon_social: string
  representante_administrativo: string
  dni_representante: string
  email_representante: string
  domicilio_fiscal: string
}

export interface TitularStats {
  total: number
  personas: number
  empresas: number
  activos: number
  inactivos: number
}
