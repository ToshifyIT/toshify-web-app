// src/pages/PermissionsDebugPage.tsx
// Página de depuración para verificar el sistema de permisos
// Acceso: /debug/permisos (solo para desarrollo)

import { usePermissions } from '../contexts/PermissionsContext'
import { useAuth } from '../contexts/AuthContext'

export default function PermissionsDebugPage() {
  const { user, profile } = useAuth()
  const { userPermissions, loading, isAdmin } = usePermissions()

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando permisos...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            🔍 Depuración de Permisos
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Esta página muestra todos los permisos del usuario autenticado
          </p>
        </div>

        {/* Usuario Autenticado */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            👤 Usuario Autenticado
          </h2>
          <div className="space-y-2">
            <div className="flex items-center">
              <span className="font-medium text-gray-700 w-32">ID:</span>
              <span className="text-gray-900 font-mono text-sm">{user?.id}</span>
            </div>
            <div className="flex items-center">
              <span className="font-medium text-gray-700 w-32">Email:</span>
              <span className="text-gray-900">{user?.email}</span>
            </div>
            <div className="flex items-center">
              <span className="font-medium text-gray-700 w-32">Nombre:</span>
              <span className="text-gray-900">{profile?.full_name || 'N/A'}</span>
            </div>
            <div className="flex items-center">
              <span className="font-medium text-gray-700 w-32">Es Admin:</span>
              <span className={`font-semibold ${isAdmin() ? 'text-green-600' : 'text-gray-500'}`}>
                {isAdmin() ? '✅ Sí' : '❌ No'}
              </span>
            </div>
          </div>
        </div>

        {/* Rol */}
        {userPermissions?.role && (
          <div className="bg-white shadow rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              🎭 Rol Asignado
            </h2>
            <div className="space-y-2">
              <div className="flex items-center">
                <span className="font-medium text-gray-700 w-32">ID:</span>
                <span className="text-gray-900 font-mono text-sm">
                  {userPermissions.role.id}
                </span>
              </div>
              <div className="flex items-center">
                <span className="font-medium text-gray-700 w-32">Nombre:</span>
                <span className="text-gray-900 font-semibold">
                  {userPermissions.role.name}
                </span>
              </div>
              <div className="flex items-center">
                <span className="font-medium text-gray-700 w-32">Descripción:</span>
                <span className="text-gray-900">
                  {userPermissions.role.description}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Permisos de Menús */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            📋 Permisos de Menús ({userPermissions?.menus?.length || 0})
          </h2>
          {!userPermissions?.menus || userPermissions.menus.length === 0 ? (
            <p className="text-gray-500 italic">No hay permisos de menús asignados</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Menú
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ruta
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ver
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Crear
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Editar
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Eliminar
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Fuente
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {userPermissions.menus.map((menu) => (
                    <tr key={menu.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-medium text-gray-900">{menu.label}</div>
                        <div className="text-sm text-gray-500">{menu.name}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                        {menu.route}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        {menu.permissions.can_view ? (
                          <span className="text-green-600 font-bold">✓</span>
                        ) : (
                          <span className="text-red-600 font-bold">✗</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        {menu.permissions.can_create ? (
                          <span className="text-green-600 font-bold">✓</span>
                        ) : (
                          <span className="text-red-600 font-bold">✗</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        {menu.permissions.can_edit ? (
                          <span className="text-green-600 font-bold">✓</span>
                        ) : (
                          <span className="text-red-600 font-bold">✗</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        {menu.permissions.can_delete ? (
                          <span className="text-green-600 font-bold">✓</span>
                        ) : (
                          <span className="text-red-600 font-bold">✗</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <span
                          className={`px-2 py-1 text-xs rounded ${
                            menu.permission_source === 'user_override'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {menu.permission_source === 'user_override'
                            ? 'Usuario'
                            : 'Rol'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Permisos de Submenús */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            📑 Permisos de Submenús ({userPermissions?.submenus?.length || 0})
          </h2>
          {!userPermissions?.submenus || userPermissions.submenus.length === 0 ? (
            <p className="text-gray-500 italic">No hay permisos de submenús asignados</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Submenú
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ruta
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ver
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Crear
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Editar
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Eliminar
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Fuente
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {userPermissions.submenus.map((submenu) => (
                    <tr key={submenu.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-medium text-gray-900">{submenu.label}</div>
                        <div className="text-sm text-gray-500">{submenu.name}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                        {submenu.route}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        {submenu.permissions.can_view ? (
                          <span className="text-green-600 font-bold">✓</span>
                        ) : (
                          <span className="text-red-600 font-bold">✗</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        {submenu.permissions.can_create ? (
                          <span className="text-green-600 font-bold">✓</span>
                        ) : (
                          <span className="text-red-600 font-bold">✗</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        {submenu.permissions.can_edit ? (
                          <span className="text-green-600 font-bold">✓</span>
                        ) : (
                          <span className="text-red-600 font-bold">✗</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        {submenu.permissions.can_delete ? (
                          <span className="text-green-600 font-bold">✓</span>
                        ) : (
                          <span className="text-red-600 font-bold">✗</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <span
                          className={`px-2 py-1 text-xs rounded ${
                            submenu.permission_source === 'user_override'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {submenu.permission_source === 'user_override'
                            ? 'Usuario'
                            : 'Rol'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* JSON Raw */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            💾 JSON Completo
          </h2>
          <pre className="bg-gray-900 text-green-400 p-4 rounded-lg overflow-x-auto text-sm">
            {JSON.stringify(userPermissions, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  )
}
