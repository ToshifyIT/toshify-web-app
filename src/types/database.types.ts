export type Json = any

export interface Database {
  public: {
    Tables: {
      [key: string]: {
        Row: { [key: string]: any }
        Insert: { [key: string]: any }
        Update: { [key: string]: any }
        Relationships: any[]
      }
    }
    Views: { [key: string]: { Row: { [key: string]: any } } }
    Functions: { [key: string]: { Args: { [key: string]: any }; Returns: any } }
    Enums: { [key: string]: any }
  }
}

export type VehiculoEstado = any;
export type VehiculoWithRelations = any;
export type ConductorWithRelations = any;
export type UserWithRole = any;
export type Role = any;
export type Menu = any;
export type Submenu = any;
export type PermissionWithRole = any;
export type EstadoCivil = any;
export type Nacionalidad = any;
export type LicenciaCategoria = any;
export type ConductorEstado = any;
export type LicenciaEstado = any;
export type LicenciaTipo = any;
