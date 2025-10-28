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

// Tipos para sistema de menús
export interface Menu {
  id: string
  name: string
  label: string
  icon: string | null
  route: string | null
  order_index: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Submenu {
  id: string
  menu_id: string
  parent_id: string | null
  name: string
  label: string
  icon: string | null
  route: string | null
  order_index: number
  level: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface UserMenuPermission {
  id: string
  user_id: string
  menu_id: string
  can_view: boolean
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
  created_at: string
  updated_at: string
}

export interface UserSubmenuPermission {
  id: string
  user_id: string
  submenu_id: string
  can_view: boolean
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
  created_at: string
  updated_at: string
}

// Tipos extendidos con relaciones
export interface MenuWithSubmenus extends Menu {
  submenus?: Submenu[]
}

export interface MenuWithPermissions extends Menu {
  permissions?: UserMenuPermission
}

export interface SubmenuWithPermissions extends Submenu {
  permissions?: UserSubmenuPermission
  menu?: Menu
}