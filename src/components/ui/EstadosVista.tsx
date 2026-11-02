// src/components/ui/EstadosVista.tsx
// Estados de una vista, iguales en todo el sistema:
//   <Spinner>     cargando           (re-exportado de LoadingOverlay)
//   <EmptyState>  no hay datos       (mismo diseño que el vacío de las tablas)
//   <ErrorState>  algo falló         (mensaje + botón para reintentar)
import type { ReactNode } from 'react'
import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react'
import './DataTable/DataTable.css'
import './EstadosVista.css'

export { Spinner } from './LoadingOverlay'

interface EmptyStateProps {
  /** Título corto: "Sin conductores", "No hay movimientos"… */
  title: string
  /** Línea opcional con más detalle o qué hacer. */
  description?: ReactNode
  /** Ícono lucide; por defecto una bandeja vacía. */
  icon?: ReactNode
  /** Acción opcional (ej. botón "Crear"). */
  action?: ReactNode
  /** 'sm' para paneles, pestañas y listas chicas (ícono y relleno menores). */
  size?: 'md' | 'sm'
}

export function EmptyState({ title, description, icon, action, size = 'md' }: EmptyStateProps) {
  return (
    <div className={`dt-empty${size === 'sm' ? ' estado-vacio-sm' : ''}`}>
      <div className="dt-empty-icon">{icon ?? <Inbox size={size === 'sm' ? 24 : 48} />}</div>
      <h3 className="dt-empty-title">{title}</h3>
      {description && <p className="dt-empty-description">{description}</p>}
      {action && <div className="estado-accion">{action}</div>}
    </div>
  )
}

interface ErrorStateProps {
  /** Título; por defecto "No se pudieron cargar los datos". */
  title?: string
  /** Detalle del error (texto para el usuario). */
  message?: ReactNode
  /** Si se pasa, muestra el botón "Reintentar". */
  onRetry?: () => void
}

export function ErrorState({ title = 'No se pudieron cargar los datos', message, onRetry }: ErrorStateProps) {
  return (
    <div className="estado-error" role="alert">
      <AlertTriangle size={40} className="estado-error-icono" aria-hidden="true" />
      <h3 className="estado-error-titulo">{title}</h3>
      {message && <p className="estado-error-texto">{message}</p>}
      {onRetry && (
        <button type="button" className="btn-secondary estado-accion" onClick={onRetry}>
          <RefreshCw size={14} /> Reintentar
        </button>
      )}
    </div>
  )
}
