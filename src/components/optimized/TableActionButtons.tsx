/**
 * Componente de botones de acción para tablas - Optimizado
 * 
 * Implementa:
 * - React.memo para evitar re-renders innecesarios
 * - Callbacks estables con useCallback
 * - Props tipadas estrictamente
 * - SOLID: Single Responsibility - solo maneja acciones de tabla
 * 
 * @module components/optimized/TableActionButtons
 */

import { memo, useCallback } from 'react'
import { Eye, Edit2, Trash2, FolderOpen } from 'lucide-react'

// =====================================================
// TIPOS ESTRICTOS
// =====================================================

export interface TableActionButtonsProps<T> {
  /** Item sobre el cual se ejecutan las acciones */
  item: T
  /** Callback para ver detalles */
  onView?: (item: T) => void
  /** Callback para editar */
  onEdit?: (item: T) => void
  /** Callback para eliminar */
  onDelete?: (item: T) => void
  /** Callback para abrir carpeta/documentos */
  onOpenFolder?: (item: T) => void
  /** Permisos del usuario */
  permissions?: {
    canView?: boolean
    canEdit?: boolean
    canDelete?: boolean
  }
  /** Tamaño de los iconos */
  iconSize?: number
  /** Clase CSS adicional */
  className?: string
}

// =====================================================
// COMPONENTE DE BOTÓN INDIVIDUAL (Memoizado)
// =====================================================

interface ActionButtonProps {
  icon: React.ReactNode
  onClick: () => void
  title: string
  variant: 'view' | 'edit' | 'delete' | 'folder'
  disabled?: boolean
}

const ActionButton = memo(function ActionButton({
  icon,
  onClick,
  title,
  variant,
  disabled = false
}: ActionButtonProps) {
  // Estilos por variante
  const variantStyles: Record<string, string> = {
    view: 'text-blue-600 hover:text-blue-800 hover:bg-blue-50',
    edit: 'text-amber-600 hover:text-amber-800 hover:bg-amber-50',
    delete: 'text-red-600 hover:text-red-800 hover:bg-red-50',
    folder: 'text-green-600 hover:text-green-800 hover:bg-green-50'
  }

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (!disabled) {
      onClick()
    }
  }, [onClick, disabled])

  if (disabled) return null

  return (
    <button
      type="button"
      onClick={handleClick}
      title={title}
      className={`
        p-1.5 rounded-md transition-colors duration-150
        ${variantStyles[variant]}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
      disabled={disabled}
    >
      {icon}
    </button>
  )
})

// =====================================================
// COMPONENTE PRINCIPAL (Memoizado)
// =====================================================

/**
 * Botones de acción para filas de tabla
 * 
 * @example
 * // En las columnas de TanStack Table:
 * {
 *   id: 'actions',
 *   cell: ({ row }) => (
 *     <TableActionButtons
 *       item={row.original}
 *       onView={handleView}
 *       onEdit={handleEdit}
 *       onDelete={handleDelete}
 *       permissions={{ canView: true, canEdit, canDelete }}
 *     />
 *   )
 * }
 */
function TableActionButtonsComponent<T>({
  item,
  onView,
  onEdit,
  onDelete,
  onOpenFolder,
  permissions = {},
  iconSize = 16,
  className = ''
}: TableActionButtonsProps<T>) {
  // Default permissions: view siempre permitido si hay callback
  const { 
    canView = !!onView, 
    canEdit = false, 
    canDelete = false 
  } = permissions

  // Callbacks estables
  const handleView = useCallback(() => {
    onView?.(item)
  }, [onView, item])

  const handleEdit = useCallback(() => {
    onEdit?.(item)
  }, [onEdit, item])

  const handleDelete = useCallback(() => {
    onDelete?.(item)
  }, [onDelete, item])

  const handleOpenFolder = useCallback(() => {
    onOpenFolder?.(item)
  }, [onOpenFolder, item])

  // Early return si no hay acciones disponibles
  const hasAnyAction = onView || onEdit || onDelete || onOpenFolder
  if (!hasAnyAction) return null

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {onView && canView && (
        <ActionButton
          icon={<Eye size={iconSize} />}
          onClick={handleView}
          title="Ver detalles"
          variant="view"
        />
      )}
      
      {onEdit && canEdit && (
        <ActionButton
          icon={<Edit2 size={iconSize} />}
          onClick={handleEdit}
          title="Editar"
          variant="edit"
        />
      )}
      
      {onOpenFolder && (
        <ActionButton
          icon={<FolderOpen size={iconSize} />}
          onClick={handleOpenFolder}
          title="Abrir carpeta"
          variant="folder"
        />
      )}
      
      {onDelete && canDelete && (
        <ActionButton
          icon={<Trash2 size={iconSize} />}
          onClick={handleDelete}
          title="Eliminar"
          variant="delete"
        />
      )}
    </div>
  )
}

// Exportar con memo y tipo genérico
export const TableActionButtons = memo(TableActionButtonsComponent) as <T>(
  props: TableActionButtonsProps<T>
) => React.ReactElement
