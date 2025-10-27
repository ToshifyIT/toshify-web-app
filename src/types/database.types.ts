export interface Database {
  public: {
    Tables: {
      roles: {
        Row: {
          id: string
          name: string
          description: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          created_at?: string
        }
      }
      user_profiles: {
        Row: {
          id: string
          full_name: string | null
          role_id: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          full_name?: string | null
          role_id?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          full_name?: string | null
          role_id?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      permissions: {
        Row: {
          id: string
          role_id: string
          module: string
          can_create: boolean
          can_read: boolean
          can_update: boolean
          can_delete: boolean
          created_at: string
        }
        Insert: {
          id?: string
          role_id: string
          module: string
          can_create?: boolean
          can_read?: boolean
          can_update?: boolean
          can_delete?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          role_id?: string
          module?: string
          can_create?: boolean
          can_read?: boolean
          can_update?: boolean
          can_delete?: boolean
          created_at?: string
        }
      }
      vehiculos: {
        Row: {
          id: string
          patente: string
          marca: string
          modelo: string
          anio: number | null
          kilometraje: number
          estado: string
          foto_url: string | null
          documentos_urls: any
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          patente: string
          marca: string
          modelo: string
          anio?: number | null
          kilometraje?: number
          estado?: string
          foto_url?: string | null
          documentos_urls?: any
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          patente?: string
          marca?: string
          modelo?: string
          anio?: number | null
          kilometraje?: number
          estado?: string
          foto_url?: string | null
          documentos_urls?: any
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      conductores: {
        Row: {
          id: string
          nombre_completo: string
          dni: string
          licencia_numero: string
          licencia_categoria: string
          licencia_vencimiento: string
          telefono: string | null
          email: string | null
          foto_url: string | null
          licencia_url: string | null
          estado: string
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          nombre_completo: string
          dni: string
          licencia_numero: string
          licencia_categoria: string
          licencia_vencimiento: string
          telefono?: string | null
          email?: string | null
          foto_url?: string | null
          licencia_url?: string | null
          estado?: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          nombre_completo?: string
          dni?: string
          licencia_numero?: string
          licencia_categoria?: string
          licencia_vencimiento?: string
          telefono?: string | null
          email?: string | null
          foto_url?: string | null
          licencia_url?: string | null
          estado?: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {}
    Functions: {}
    Enums: {}
  }
}

// Tipos auxiliares para usar en componentes
export type Role = Database['public']['Tables']['roles']['Row']
export type UserProfile = Database['public']['Tables']['user_profiles']['Row']
export type Permission = Database['public']['Tables']['permissions']['Row']
export type Vehiculo = Database['public']['Tables']['vehiculos']['Row']
export type Conductor = Database['public']['Tables']['conductores']['Row']

// Tipo para usuario con rol y permisos
export interface UserWithRole extends UserProfile {
  roles: Role | null
}

export interface PermissionWithRole extends Permission {
  roles: Role
}