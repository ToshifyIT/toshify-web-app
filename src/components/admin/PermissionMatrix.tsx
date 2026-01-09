// src/components/admin/PermissionMatrix.tsx
import { useState, useEffect } from 'react'
import { Lightbulb, Check, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { PermissionWithRole } from '../../types/database.types'
import './AdminStyles.css'

export function PermissionMatrix() {
  const [permissions, setPermissions] = useState<PermissionWithRole[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)

  useEffect(() => {
    loadPermissions()
  }, [])

  const loadPermissions = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('permissions')
        .select(`
          *,
          roles (*)
        `)
        .order('module')
        .order('role_id')

      if (error) throw error
      setPermissions(data as PermissionWithRole[])
    } catch (err) {
      console.error('Error cargando permisos:', err)
    } finally {
      setLoading(false)
    }
  }

  const togglePermission = async (
    permissionId: string,
    field: 'can_create' | 'can_read' | 'can_update' | 'can_delete',
    currentValue: boolean
  ) => {
    setUpdating(permissionId)
    try {
      const { error } = await supabase
        .from('permissions')
        // @ts-expect-error - Tipo generado incorrectamente por Supabase CLI
        .update({ [field]: !currentValue })
        .eq('id', permissionId)

      if (error) throw error

      // Actualizar estado local
      setPermissions(permissions.map(p =>
        p.id === permissionId ? { ...p, [field]: !currentValue } : p
      ))
    } catch (err: any) {
      console.error('Error actualizando permiso:', err)
      alert('Error al actualizar permiso: ' + err.message)
    } finally {
      setUpdating(null)
    }
  }

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '40px', color: '#6B7280' }}>Cargando permisos...</div>
  }

  return (
    <div className="admin-module">
      <style>{`
        .permission-matrix {
          overflow-x: auto;
          background: white;
          border-radius: 12px;
          border: 1px solid #E5E7EB;
          box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
        }

        .matrix-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 600px;
        }

        .matrix-table th {
          background: #F9FAFB;
          padding: 12px;
          text-align: left;
          font-size: 12px;
          font-weight: 600;
          color: #6B7280;
          text-transform: uppercase;
          border-bottom: 2px solid #E5E7EB;
        }

        .matrix-table td {
          padding: 16px 12px;
          border-bottom: 1px solid #E5E7EB;
          font-size: 14px;
        }

        .module-name {
          font-weight: 600;
          color: #1F2937;
          text-transform: capitalize;
        }

        .role-name-cell {
          text-transform: capitalize;
          font-weight: 600;
          color: #E63946;
          background: #FEE2E2;
          padding: 6px 12px !important;
          border-radius: 6px;
          display: inline-block;
        }

        .permission-icons {
          display: flex;
          gap: 8px;
        }

        .permission-icon {
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
          border: 2px solid transparent;
        }

        .permission-icon:hover {
          transform: scale(1.1);
          border-color: #E63946;
        }

        .permission-icon.granted {
          background: #D1FAE5;
          color: #065F46;
        }

        .permission-icon.denied {
          background: #F3F4F6;
          color: #D1D5DB;
        }

        .permission-icon.updating {
          opacity: 0.5;
          cursor: wait;
        }

        @media (max-width: 768px) {
          .matrix-table {
            min-width: 550px;
          }
          .matrix-table th,
          .matrix-table td {
            padding: 10px 8px;
            font-size: 12px;
          }
          .permission-icon {
            width: 24px;
            height: 24px;
            font-size: 12px;
          }
        }

        @media (max-width: 480px) {
          .matrix-table {
            min-width: 500px;
          }
          .matrix-table th,
          .matrix-table td {
            padding: 8px 6px;
            font-size: 11px;
          }
          .permission-icon {
            width: 22px;
            height: 22px;
            font-size: 11px;
          }
          .permission-icons {
            gap: 4px;
          }
        }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: '32px', textAlign: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '24px', fontWeight: '700', color: '#1F2937' }}>
          Matriz de Permisos
        </h3>
        <p style={{ margin: '8px 0 0 0', fontSize: '15px', color: '#6B7280' }}>
          Gestiona los permisos de cada rol por módulo
        </p>
      </div>

      <div style={{
        background: '#EFF6FF',
        border: '1px solid #BFDBFE',
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '24px',
        fontSize: '14px',
        color: '#1E40AF',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px'
      }}>
        <Lightbulb size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
        <div>
          <strong>Consejo:</strong> Haz clic en cualquier permiso para activarlo o desactivarlo en tiempo real.
        </div>
      </div>

      <div className="permission-matrix">
        <table className="matrix-table">
          <thead>
            <tr>
              <th>Módulo</th>
              <th>Rol</th>
              <th>Crear</th>
              <th>Leer</th>
              <th>Editar</th>
              <th>Eliminar</th>
            </tr>
          </thead>
          <tbody>
            {permissions.map((perm) => (
              <tr key={perm.id}>
                <td className="module-name">{perm.module}</td>
                <td>
                  <span className="role-name-cell">
                    {perm.roles.name}
                  </span>
                </td>
                <td>
                  <div
                    className={`permission-icon ${perm.can_create ? 'granted' : 'denied'} ${updating === perm.id ? 'updating' : ''}`}
                    onClick={() => togglePermission(perm.id, 'can_create', perm.can_create)}
                  >
                    {perm.can_create ? <Check size={14} /> : <X size={14} />}
                  </div>
                </td>
                <td>
                  <div
                    className={`permission-icon ${perm.can_read ? 'granted' : 'denied'} ${updating === perm.id ? 'updating' : ''}`}
                    onClick={() => togglePermission(perm.id, 'can_read', perm.can_read)}
                  >
                    {perm.can_read ? <Check size={14} /> : <X size={14} />}
                  </div>
                </td>
                <td>
                  <div
                    className={`permission-icon ${perm.can_update ? 'granted' : 'denied'} ${updating === perm.id ? 'updating' : ''}`}
                    onClick={() => togglePermission(perm.id, 'can_update', perm.can_update)}
                  >
                    {perm.can_update ? <Check size={14} /> : <X size={14} />}
                  </div>
                </td>
                <td>
                  <div
                    className={`permission-icon ${perm.can_delete ? 'granted' : 'denied'} ${updating === perm.id ? 'updating' : ''}`}
                    onClick={() => togglePermission(perm.id, 'can_delete', perm.can_delete)}
                  >
                    {perm.can_delete ? <Check size={14} /> : <X size={14} />}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
