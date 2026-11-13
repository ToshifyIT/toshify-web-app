// Etiqueta del estado de un vehículo: la misma en Vehículos y en Registro de vencimientos.

// Etiquetas cortas para el badge
const ETIQUETAS_CORTAS: Record<string, string> = {
  DISPONIBLE: 'Disponible',
  EN_USO: 'En Uso',
  CORPORATIVO: 'Corporativo',
  PKG_ON_BASE: 'PKG ON',
  PKG_OFF_BASE: 'PKG OFF',
  PKG_OFF_FRANCIA: 'PKG Francia',
  TALLER_AXIS: 'Taller Axis',
  TALLER_CHAPA_PINTURA: 'Chapa&Pintura',
  TALLER_ALLIANCE: 'Taller Alliance',
  TALLER_KALZALO: 'Taller Kalzalo',
  TALLER_BASE_VALIENTE: 'Base Valiente',
  TALLER_MJ: 'Taller MJ',
  TALLER_AUTODOC: 'Taller Autodoc',
  TALLER_CP_PAINT_CARS: 'C&P Paint Cars',
  TALLER_CP_ANDRADA: 'C&P Andrada',
  DEPOSITO_RDA: 'Depósito RDA',
  INSTALACION_GNC: 'Inst. GNC',
  RETENIDO_COMISARIA: 'Retenido',
  ROBO: 'Robo',
  DESTRUCCION_TOTAL: 'Destrucción',
  JUBILADO: 'Jubilado',
  PROGRAMADO: 'Programado',
  DEVUELTO_PROVEEDOR: 'Dev. Proveedor',
};

function colorDeEstado(codigo: string): string {
  switch (codigo) {
    case 'EN_USO':
      return 'green';
    case 'DISPONIBLE':
      return 'amber';
    case 'CORPORATIVO':
      return 'blue';
    case 'PKG_ON_BASE':
      return 'yellow';
    case 'TALLER_CHAPA_PINTURA':
    case 'TALLER_CP_PAINT_CARS':
    case 'TALLER_CP_ANDRADA':
      return 'purple';
    case 'TALLER_AXIS':
    case 'TALLER_ALLIANCE':
    case 'TALLER_KALZALO':
    case 'TALLER_BASE_VALIENTE':
    case 'TALLER_MJ':
    case 'TALLER_AUTODOC':
    case 'INSTALACION_GNC':
      return 'orange';
    case 'DEVUELTO_PROVEEDOR':
    case 'ROBO':
    case 'DESTRUCCION_TOTAL':
    case 'RETENIDO_COMISARIA':
    case 'JUBILADO':
      return 'red';
    default:
      return 'gray';
  }
}

/** Texto corto del estado (el que se ve en el badge) */
function etiquetaEstadoVehiculo(codigo: string): string {
  return ETIQUETAS_CORTAS[codigo] || codigo;
}

interface EstadoVehiculoBadgeProps {
  codigo: string;
  /** Nombre completo del estado, para el tooltip */
  descripcion?: string | null;
}

export function EstadoVehiculoBadge({ codigo, descripcion }: EstadoVehiculoBadgeProps) {
  return (
    <span className={`dt-badge dt-badge-solid-${colorDeEstado(codigo)}`} title={descripcion || codigo}>
      {etiquetaEstadoVehiculo(codigo)}
    </span>
  );
}
