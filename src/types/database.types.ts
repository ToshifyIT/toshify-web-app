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
          phone: string | null
          avatar_url: string | null
          bio: string | null
          preferences: Record<string, unknown> | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          full_name?: string | null
          role_id?: string | null
          is_active?: boolean
          phone?: string | null
          avatar_url?: string | null
          bio?: string | null
          preferences?: Record<string, unknown> | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          full_name?: string | null
          role_id?: string | null
          is_active?: boolean
          phone?: string | null
          avatar_url?: string | null
          bio?: string | null
          preferences?: Record<string, unknown> | null
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
      menus: {
        Row: {
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
        Insert: {
          id?: string
          name: string
          label: string
          icon?: string | null
          route?: string | null
          order_index?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          label?: string
          icon?: string | null
          route?: string | null
          order_index?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      submenus: {
        Row: {
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
        Insert: {
          id?: string
          menu_id: string
          parent_id?: string | null
          name: string
          label: string
          icon?: string | null
          route?: string | null
          order_index?: number
          level?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          menu_id?: string
          parent_id?: string | null
          name?: string
          label?: string
          icon?: string | null
          route?: string | null
          order_index?: number
          level?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      role_menu_permissions: {
        Row: {
          id: string
          role_id: string
          menu_id: string
          can_view: boolean
          can_create: boolean
          can_edit: boolean
          can_delete: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          role_id: string
          menu_id: string
          can_view?: boolean
          can_create?: boolean
          can_edit?: boolean
          can_delete?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          role_id?: string
          menu_id?: string
          can_view?: boolean
          can_create?: boolean
          can_edit?: boolean
          can_delete?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      role_submenu_permissions: {
        Row: {
          id: string
          role_id: string
          submenu_id: string
          can_view: boolean
          can_create: boolean
          can_edit: boolean
          can_delete: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          role_id: string
          submenu_id: string
          can_view?: boolean
          can_create?: boolean
          can_edit?: boolean
          can_delete?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          role_id?: string
          submenu_id?: string
          can_view?: boolean
          can_create?: boolean
          can_edit?: boolean
          can_delete?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      user_menu_permissions: {
        Row: {
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
        Insert: {
          id?: string
          user_id: string
          menu_id: string
          can_view?: boolean
          can_create?: boolean
          can_edit?: boolean
          can_delete?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          menu_id?: string
          can_view?: boolean
          can_create?: boolean
          can_edit?: boolean
          can_delete?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      user_submenu_permissions: {
        Row: {
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
        Insert: {
          id?: string
          user_id: string
          submenu_id: string
          can_view?: boolean
          can_create?: boolean
          can_edit?: boolean
          can_delete?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          submenu_id?: string
          can_view?: boolean
          can_create?: boolean
          can_edit?: boolean
          can_delete?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      estados_civiles: {
        Row: {
          id: string
          codigo: string
          descripcion: string | null
          activo: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          codigo: string
          descripcion?: string | null
          activo?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          codigo?: string
          descripcion?: string | null
          activo?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      nacionalidades: {
        Row: {
          id: string
          codigo: string
          descripcion: string | null
          activo: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          codigo: string
          descripcion?: string | null
          activo?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          codigo?: string
          descripcion?: string | null
          activo?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      licencias_categorias: {
        Row: {
          id: string
          codigo: string
          descripcion: string | null
          activo: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          codigo: string
          descripcion?: string | null
          activo?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          codigo?: string
          descripcion?: string | null
          activo?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      licencias_estados: {
        Row: {
          id: string
          codigo: string
          descripcion: string | null
          activo: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          codigo: string
          descripcion?: string | null
          activo?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          codigo?: string
          descripcion?: string | null
          activo?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      licencias_tipos: {
        Row: {
          id: string
          codigo: string
          descripcion: string | null
          activo: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          codigo: string
          descripcion?: string | null
          activo?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          codigo?: string
          descripcion?: string | null
          activo?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      conductores_estados: {
        Row: {
          id: string
          codigo: string
          descripcion: string | null
          activo: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          codigo: string
          descripcion?: string | null
          activo?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          codigo?: string
          descripcion?: string | null
          activo?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      conductores: {
        Row: {
          id: string
          numero_licencia: string
          nombres: string
          apellidos: string
          licencia_categoria_id: string | null
          licencia_vencimiento: string
          licencia_estado_id: string | null
          licencia_tipo_id: string | null
          fecha_nacimiento: string
          zona: string | null
          numero_dni: string | null
          numero_cuit: string | null
          estado_civil_id: string | null
          nacionalidad_id: string | null
          direccion: string | null
          email: string | null
          telefono_contacto: string | null
          contacto_emergencia: string | null
          telefono_emergencia: string | null
          antecedentes_penales: boolean
          antecedentes_transito: boolean
          cochera_propia: boolean
          fecha_reincorpoaracion: string | null
          fecha_contratacion: string | null
          fecha_terminacion: string | null
          estado_id: string | null
          motivo_baja: string | null
          foto_url: string | null
          documentos_urls: any
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          numero_licencia: string
          nombres: string
          apellidos: string
          licencia_categoria_id?: string | null
          licencia_vencimiento: string
          licencia_estado_id?: string | null
          licencia_tipo_id?: string | null
          fecha_nacimiento: string
          zona?: string | null
          numero_dni?: string | null
          numero_cuit?: string | null
          estado_civil_id?: string | null
          nacionalidad_id?: string | null
          direccion?: string | null
          email?: string | null
          telefono_contacto?: string | null
          contacto_emergencia?: string | null
          telefono_emergencia?: string | null
          antecedentes_penales?: boolean
          antecedentes_transito?: boolean
          cochera_propia?: boolean
          fecha_reincorpoaracion?: string | null
          fecha_contratacion?: string | null
          fecha_terminacion?: string | null
          estado_id?: string | null
          motivo_baja?: string | null
          foto_url?: string | null
          documentos_urls?: any
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          numero_licencia?: string
          nombres?: string
          apellidos?: string
          licencia_categoria_id?: string | null
          licencia_vencimiento?: string
          licencia_estado_id?: string | null
          licencia_tipo_id?: string | null
          fecha_nacimiento?: string
          zona?: string | null
          numero_dni?: string | null
          numero_cuit?: string | null
          estado_civil_id?: string | null
          nacionalidad_id?: string | null
          direccion?: string | null
          email?: string | null
          telefono_contacto?: string | null
          contacto_emergencia?: string | null
          telefono_emergencia?: string | null
          antecedentes_penales?: boolean
          antecedentes_transito?: boolean
          cochera_propia?: boolean
          fecha_reincorpoaracion?: string | null
          fecha_contratacion?: string | null
          fecha_terminacion?: string | null
          estado_id?: string | null
          motivo_baja?: string | null
          foto_url?: string | null
          documentos_urls?: any
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      vehiculos_tipos: {
        Row: {
          id: string
          codigo: string
          descripcion: string | null
          activo: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          codigo: string
          descripcion?: string | null
          activo?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          codigo?: string
          descripcion?: string | null
          activo?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      vehiculos_estados: {
        Row: {
          id: string
          codigo: string
          descripcion: string | null
          activo: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          codigo: string
          descripcion?: string | null
          activo?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          codigo?: string
          descripcion?: string | null
          activo?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      combustibles_tipos: {
        Row: {
          id: string
          codigo: string
          descripcion: string | null
          activo: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          codigo: string
          descripcion?: string | null
          activo?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          codigo?: string
          descripcion?: string | null
          activo?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      gps_tipos: {
        Row: {
          id: string
          codigo: string
          descripcion: string | null
          activo: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          codigo: string
          descripcion?: string | null
          activo?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          codigo?: string
          descripcion?: string | null
          activo?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      vehiculos: {
        Row: {
          id: string
          patente: string
          marca: string | null
          modelo: string | null
          anio: number | null
          color: string | null
          tipo_id: string | null
          tipo_combustible_id: string | null
          tipo_gps_id: string | null
          gps_uss: boolean
          numero_motor: string | null
          numero_chasis: string | null
          provisoria: string | null
          estado_id: string | null
          kilometraje_actual: number
          fecha_adquisicion: string | null
          fecha_ulti_inspeccion: string | null
          fecha_prox_inspeccion: string | null
          seguro_numero: string | null
          seguro_vigencia: string | null
          foto_url: string | null
          documentos_urls: any
          notas: string | null
          titular: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          patente: string
          marca?: string | null
          modelo?: string | null
          anio?: number | null
          color?: string | null
          tipo_id?: string | null
          tipo_combustible_id?: string | null
          tipo_gps_id?: string | null
          gps_uss?: boolean
          numero_motor?: string | null
          numero_chasis?: string | null
          provisoria?: string | null
          estado_id?: string | null
          kilometraje_actual?: number
          fecha_adquisicion?: string | null
          fecha_ulti_inspeccion?: string | null
          fecha_prox_inspeccion?: string | null
          seguro_numero?: string | null
          seguro_vigencia?: string | null
          foto_url?: string | null
          documentos_urls?: any
          notas?: string | null
          titular?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          patente?: string
          marca?: string | null
          modelo?: string | null
          anio?: number | null
          color?: string | null
          tipo_id?: string | null
          tipo_combustible_id?: string | null
          tipo_gps_id?: string | null
          gps_uss?: boolean
          numero_motor?: string | null
          numero_chasis?: string | null
          provisoria?: string | null
          estado_id?: string | null
          kilometraje_actual?: number
          fecha_adquisicion?: string | null
          fecha_ulti_inspeccion?: string | null
          fecha_prox_inspeccion?: string | null
          seguro_numero?: string | null
          seguro_vigencia?: string | null
          foto_url?: string | null
          documentos_urls?: any
          notas?: string | null
          titular?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      asignaciones: {
        Row: {
          id: string
          vehiculo_id: string | null
          conductor_id: string | null
          fecha_inicio: string
          fecha_fin: string | null
          modalidad: string
          estado: string
          notas: string | null
          created_by: string | null
          created_at: string
          updated_at: string
          codigo: string | null
          horario: string | null
          fecha_inicio_real: string | null
          fecha_fin_real: string | null
          observaciones: string | null
          motivo_cancelacion: string | null
        }
        Insert: {
          id?: string
          vehiculo_id?: string | null
          conductor_id?: string | null
          fecha_inicio: string
          fecha_fin?: string | null
          modalidad: string
          estado?: string
          notas?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
          codigo?: string | null
          horario?: string | null
          fecha_inicio_real?: string | null
          fecha_fin_real?: string | null
          observaciones?: string | null
          motivo_cancelacion?: string | null
        }
        Update: {
          id?: string
          vehiculo_id?: string | null
          conductor_id?: string | null
          fecha_inicio?: string
          fecha_fin?: string | null
          modalidad?: string
          estado?: string
          notas?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
          codigo?: string | null
          horario?: string | null
          fecha_inicio_real?: string | null
          fecha_fin_real?: string | null
          observaciones?: string | null
          motivo_cancelacion?: string | null
        }
      }
      asignaciones_conductores: {
        Row: {
          id: string
          asignacion_id: string
          conductor_id: string
          fecha_asignacion: string
          fecha_inicio: string | null
          fecha_fin: string | null
          estado: string
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          asignacion_id: string
          conductor_id: string
          fecha_asignacion?: string
          fecha_inicio?: string | null
          fecha_fin?: string | null
          estado?: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          asignacion_id?: string
          conductor_id?: string
          fecha_asignacion?: string
          fecha_inicio?: string | null
          fecha_fin?: string | null
          estado?: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      horarios_conduccion: {
        Row: {
          id: string
          nombre: string
          hora_inicio: string
          hora_fin: string
          duracion_horas: number | null
          descripcion: string | null
          activo: boolean
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          nombre: string
          hora_inicio: string
          hora_fin: string
          duracion_horas?: number | null
          descripcion?: string | null
          activo?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          nombre?: string
          hora_inicio?: string
          hora_fin?: string
          duracion_horas?: number | null
          descripcion?: string | null
          activo?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      vehiculo_control: {
        Row: {
          id: string
          vehiculo_id: string
          tipo_servicio: string | null
          fecha_programada: string | null
          completado: boolean
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          vehiculo_id: string
          tipo_servicio?: string | null
          fecha_programada?: string | null
          completado?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          vehiculo_id?: string
          tipo_servicio?: string | null
          fecha_programada?: string | null
          completado?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      categorias: {
        Row: {
          id: string
          codigo: string
          nombre: string
          descripcion: string | null
          activo: boolean
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          codigo: string
          nombre: string
          descripcion?: string | null
          activo?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          codigo?: string
          nombre?: string
          descripcion?: string | null
          activo?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      unidades_medida: {
        Row: {
          id: string
          codigo: string
          descripcion: string
          activo: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          codigo: string
          descripcion: string
          activo?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          codigo?: string
          descripcion?: string
          activo?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      productos_estados: {
        Row: {
          id: string
          codigo: string
          descripcion: string | null
          activo: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          codigo: string
          descripcion?: string | null
          activo?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          codigo?: string
          descripcion?: string | null
          activo?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      productos: {
        Row: {
          id: string
          codigo: string
          nombre: string
          descripcion: string | null
          unidad_medida_id: string
          stock_actual: number
          stock_en_uso: number
          estado_id: string
          proveedor: string | null
          modelo: string | null
          observacion: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          codigo: string
          nombre: string
          descripcion?: string | null
          unidad_medida_id: string
          stock_actual?: number
          stock_en_uso?: number
          estado_id: string
          proveedor?: string | null
          modelo?: string | null
          observacion?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          codigo?: string
          nombre?: string
          descripcion?: string | null
          unidad_medida_id?: string
          stock_actual?: number
          stock_en_uso?: number
          estado_id?: string
          proveedor?: string | null
          modelo?: string | null
          observacion?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      productos_categorias: {
        Row: {
          id: string
          producto_id: string
          categoria_id: string
          created_at: string
        }
        Insert: {
          id?: string
          producto_id: string
          categoria_id: string
          created_at?: string
        }
        Update: {
          id?: string
          producto_id?: string
          categoria_id?: string
          created_at?: string
        }
      }
      user_sessions: {
        Row: {
          id: string
          user_id: string
          session_token: string
          device_info: string | null
          ip_address: string | null
          created_at: string
          last_activity: string
        }
        Insert: {
          id?: string
          user_id: string
          session_token: string
          device_info?: string | null
          ip_address?: string | null
          created_at?: string
          last_activity?: string
        }
        Update: {
          id?: string
          user_id?: string
          session_token?: string
          device_info?: string | null
          ip_address?: string | null
          created_at?: string
          last_activity?: string
        }
      }
    }
    Views: {}
    Functions: {}
    Enums: {}
  }
}

// Export types for each table
export type Role = Database['public']['Tables']['roles']['Row']
export type UserProfile = Database['public']['Tables']['user_profiles']['Row']
export type Permission = Database['public']['Tables']['permissions']['Row']
export type Menu = Database['public']['Tables']['menus']['Row']
export type Submenu = Database['public']['Tables']['submenus']['Row']
export type RoleMenuPermission = Database['public']['Tables']['role_menu_permissions']['Row']
export type RoleSubmenuPermission = Database['public']['Tables']['role_submenu_permissions']['Row']
export type UserMenuPermission = Database['public']['Tables']['user_menu_permissions']['Row']
export type UserSubmenuPermission = Database['public']['Tables']['user_submenu_permissions']['Row']
export type EstadoCivil = Database['public']['Tables']['estados_civiles']['Row']
export type Nacionalidad = Database['public']['Tables']['nacionalidades']['Row']
export type LicenciaCategoria = Database['public']['Tables']['licencias_categorias']['Row']
export type LicenciaEstado = Database['public']['Tables']['licencias_estados']['Row']
export type LicenciaTipo = Database['public']['Tables']['licencias_tipos']['Row']
export type ConductorEstado = Database['public']['Tables']['conductores_estados']['Row']
export type Conductor = Database['public']['Tables']['conductores']['Row']
export type VehiculoTipo = Database['public']['Tables']['vehiculos_tipos']['Row']
export type VehiculoEstado = Database['public']['Tables']['vehiculos_estados']['Row']
export type CombustibleTipo = Database['public']['Tables']['combustibles_tipos']['Row']
export type GpsTipo = Database['public']['Tables']['gps_tipos']['Row']
export type Vehiculo = Database['public']['Tables']['vehiculos']['Row']
export type Asignacion = Database['public']['Tables']['asignaciones']['Row']
export type AsignacionConductor = Database['public']['Tables']['asignaciones_conductores']['Row']
export type HorarioConduccion = Database['public']['Tables']['horarios_conduccion']['Row']
export type VehiculoControl = Database['public']['Tables']['vehiculo_control']['Row']
export type Categoria = Database['public']['Tables']['categorias']['Row']
export type UnidadMedida = Database['public']['Tables']['unidades_medida']['Row']
export type ProductoEstado = Database['public']['Tables']['productos_estados']['Row']
export type Producto = Database['public']['Tables']['productos']['Row']
export type ProductoCategoria = Database['public']['Tables']['productos_categorias']['Row']
export type UserSession = Database['public']['Tables']['user_sessions']['Row']

// Tipo para usuario con rol y permisos
export interface UserWithRole extends UserProfile {
  roles: Role | null
}

export interface PermissionWithRole extends Permission {
  roles: Role
}

export interface SubMenuWithPermissions extends Submenu {
  permissions?: UserSubmenuPermission
  menu?: Menu
}

export interface AsignacionWithRelations extends Asignacion {
  vehiculos?: Vehiculo
  conductores?: Conductor
  horarios_conduccion?: HorarioConduccion
}

export interface ConductorWithRelations extends Conductor {
  estados_civiles?: EstadoCivil
  nacionalidades?: Nacionalidad
  licencias_categorias?: LicenciaCategoria
  conductores_estados?: ConductorEstado
  licencias_estados?: LicenciaEstado
  licencias_tipos?: LicenciaTipo
}

export interface VehiculoWithRelations extends Vehiculo {
  vehiculos_tipos?: VehiculoTipo
  vehiculos_estados?: VehiculoEstado
  combustibles_tipos?: CombustibleTipo
  gps_tipos?: GpsTipo
}
