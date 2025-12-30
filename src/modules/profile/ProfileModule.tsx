// src/modules/profile/ProfileModule.tsx
/**
 * Módulo de Perfil de Usuario
 * Permite ver y editar información del perfil, cambiar contraseña
 */

import { useState, useEffect } from 'react'
import { User, Mail, Phone, FileText, Lock, Save, X, Camera, Check, AlertCircle } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { AvatarUploadModal } from '../../components/ui/AvatarUploadModal'
import Swal from 'sweetalert2'
import './ProfileModule.css'

interface ProfileFormData {
  full_name: string
  phone: string
  bio: string
}

interface PasswordFormData {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

// Extended profile type with new fields
interface ExtendedProfile {
  id: string
  full_name: string | null
  role_id: string | null
  is_active: boolean
  phone?: string | null
  bio?: string | null
  avatar_url?: string | null
  created_at: string
  updated_at: string
  roles?: { id: string; name: string; description: string | null } | null
}

export function ProfileModule() {
  const { user, profile: authProfile, refreshProfile } = useAuth()
  const profile = authProfile as ExtendedProfile | null

  // Estado del formulario de perfil
  const [formData, setFormData] = useState<ProfileFormData>({
    full_name: '',
    phone: '',
    bio: '',
  })
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  // Estado del formulario de contraseña
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [passwordData, setPasswordData] = useState<PasswordFormData>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [changingPassword, setChangingPassword] = useState(false)

  // Estado para modal de avatar
  const [showAvatarModal, setShowAvatarModal] = useState(false)

  // Cargar datos del perfil
  useEffect(() => {
    if (profile) {
      setFormData({
        full_name: profile.full_name || '',
        phone: profile.phone || '',
        bio: profile.bio || '',
      })
    }
  }, [profile])

  // Guardar cambios del perfil
  const handleSaveProfile = async () => {
    if (!user) return

    setSaving(true)
    try {
      const updateData = {
        full_name: formData.full_name || null,
        phone: formData.phone || null,
        bio: formData.bio || null,
        updated_at: new Date().toISOString(),
      }

      const { error } = await (supabase
        .from('user_profiles') as any)
        .update(updateData)
        .eq('id', user.id)

      if (error) throw error

      await refreshProfile()
      setIsEditing(false)

      Swal.fire({
        icon: 'success',
        title: 'Perfil actualizado',
        text: 'Los cambios han sido guardados correctamente',
        timer: 2000,
        showConfirmButton: false,
      })
    } catch (error: any) {
      console.error('Error actualizando perfil:', error)
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.message || 'No se pudo actualizar el perfil',
      })
    } finally {
      setSaving(false)
    }
  }

  // Cancelar edición
  const handleCancelEdit = () => {
    setFormData({
      full_name: profile?.full_name || '',
      phone: profile?.phone || '',
      bio: profile?.bio || '',
    })
    setIsEditing(false)
  }

  // Cambiar contraseña
  const handleChangePassword = async () => {
    // Validaciones
    if (!passwordData.currentPassword) {
      Swal.fire({
        icon: 'warning',
        title: 'Campo requerido',
        text: 'Ingresa tu contraseña actual',
      })
      return
    }

    if (passwordData.newPassword.length < 6) {
      Swal.fire({
        icon: 'warning',
        title: 'Contraseña muy corta',
        text: 'La nueva contraseña debe tener al menos 6 caracteres',
      })
      return
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      Swal.fire({
        icon: 'warning',
        title: 'Las contraseñas no coinciden',
        text: 'La nueva contraseña y su confirmación deben ser iguales',
      })
      return
    }

    setChangingPassword(true)
    try {
      // Verificar contraseña actual intentando re-autenticar
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email || '',
        password: passwordData.currentPassword,
      })

      if (signInError) {
        throw new Error('La contraseña actual es incorrecta')
      }

      // Cambiar contraseña
      const { error } = await supabase.auth.updateUser({
        password: passwordData.newPassword,
      })

      if (error) throw error

      // Limpiar formulario
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      })
      setShowPasswordForm(false)

      Swal.fire({
        icon: 'success',
        title: 'Contraseña actualizada',
        text: 'Tu contraseña ha sido cambiada correctamente',
        timer: 2000,
        showConfirmButton: false,
      })
    } catch (error: any) {
      console.error('Error cambiando contraseña:', error)
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.message || 'No se pudo cambiar la contraseña',
      })
    } finally {
      setChangingPassword(false)
    }
  }

  // Obtener iniciales del usuario
  const getInitials = () => {
    const name = profile?.full_name || user?.email || 'U'
    return name.charAt(0).toUpperCase()
  }

  // Guardar foto de perfil (recibe blob del modal de recorte)
  const handleAvatarSave = async (croppedBlob: Blob) => {
    if (!user) throw new Error('Usuario no autenticado')

    // Generar nombre único para el archivo
    const fileName = `${user.id}-${Date.now()}.jpg`
    const filePath = `avatars/${fileName}`

    // Eliminar avatar anterior si existe
    if (profile?.avatar_url) {
      const oldPath = profile.avatar_url.split('/').pop()
      if (oldPath) {
        await supabase.storage.from('avatars').remove([`avatars/${oldPath}`])
      }
    }

    // Subir nuevo avatar
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, croppedBlob, {
        cacheControl: '3600',
        upsert: true,
        contentType: 'image/jpeg',
      })

    if (uploadError) throw uploadError

    // Obtener URL pública
    const { data: urlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath)

    // Actualizar perfil con nueva URL
    const { error: updateError } = await (supabase
      .from('user_profiles') as any)
      .update({
        avatar_url: urlData.publicUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (updateError) throw updateError

    await refreshProfile()

    Swal.fire({
      icon: 'success',
      title: 'Foto actualizada',
      text: 'Tu foto de perfil ha sido actualizada',
      timer: 2000,
      showConfirmButton: false,
    })
  }

  return (
    <div className="profile-module">
      <div className="profile-content">
        {/* Card de Perfil */}
        <div className="profile-card">
          {/* Avatar Section */}
          <div className="profile-avatar-section">
            <div className="profile-avatar-wrapper">
              <div
                className={`profile-avatar ${profile?.avatar_url ? 'has-image' : ''}`}
                onClick={() => setShowAvatarModal(true)}
              >
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt="Avatar"
                    className="profile-avatar-image"
                  />
                ) : (
                  getInitials()
                )}
              </div>
              <button
                className="profile-avatar-edit"
                title="Cambiar foto de perfil"
                onClick={() => setShowAvatarModal(true)}
              >
                <Camera size={14} />
              </button>
            </div>
            <div className="profile-avatar-info">
              <h2>{profile?.full_name || 'Usuario'}</h2>
              <p className="profile-role">{profile?.roles?.name || 'Sin rol'}</p>
              <p className="profile-email">{user?.email}</p>
            </div>
          </div>

          {/* Modal de Avatar */}
          <AvatarUploadModal
            isOpen={showAvatarModal}
            onClose={() => setShowAvatarModal(false)}
            onSave={handleAvatarSave}
            currentAvatarUrl={profile?.avatar_url}
          />

          <div className="profile-divider" />

          {/* Información Personal */}
          <div className="profile-section">
            <div className="profile-section-header">
              <div className="profile-section-title">
                <User size={18} />
                <h3>Información Personal</h3>
              </div>
              {!isEditing ? (
                <button
                  className="profile-btn-edit"
                  onClick={() => setIsEditing(true)}
                >
                  Editar
                </button>
              ) : (
                <div className="profile-edit-actions">
                  <button
                    className="profile-btn-cancel"
                    onClick={handleCancelEdit}
                    disabled={saving}
                  >
                    <X size={14} />
                    Cancelar
                  </button>
                  <button
                    className="profile-btn-save"
                    onClick={handleSaveProfile}
                    disabled={saving}
                  >
                    <Save size={14} />
                    {saving ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
              )}
            </div>

            <div className="profile-form">
              <div className="profile-form-group">
                <label>
                  <User size={14} />
                  Nombre completo
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    placeholder="Tu nombre completo"
                    disabled={saving}
                  />
                ) : (
                  <span className="profile-field-value">
                    {profile?.full_name || <em>No especificado</em>}
                  </span>
                )}
              </div>

              <div className="profile-form-group">
                <label>
                  <Mail size={14} />
                  Email
                </label>
                <span className="profile-field-value profile-field-readonly">
                  {user?.email}
                  <span className="profile-field-badge">
                    <Check size={10} /> Verificado
                  </span>
                </span>
              </div>

              <div className="profile-form-group">
                <label>
                  <Phone size={14} />
                  Teléfono
                </label>
                {isEditing ? (
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+54 11 1234-5678"
                    disabled={saving}
                  />
                ) : (
                  <span className="profile-field-value">
                    {profile?.phone || <em>No especificado</em>}
                  </span>
                )}
              </div>

              <div className="profile-form-group profile-form-group-full">
                <label>
                  <FileText size={14} />
                  Bio / Descripción
                </label>
                {isEditing ? (
                  <textarea
                    value={formData.bio}
                    onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                    placeholder="Cuéntanos un poco sobre ti..."
                    rows={3}
                    disabled={saving}
                  />
                ) : (
                  <span className="profile-field-value">
                    {profile?.bio || <em>No especificado</em>}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="profile-divider" />

          {/* Seguridad */}
          <div className="profile-section">
            <div className="profile-section-header">
              <div className="profile-section-title">
                <Lock size={18} />
                <h3>Seguridad</h3>
              </div>
            </div>

            {!showPasswordForm ? (
              <div className="profile-security-info">
                <div className="profile-security-item">
                  <div className="profile-security-icon">
                    <Lock size={16} />
                  </div>
                  <div className="profile-security-content">
                    <span className="profile-security-label">Contraseña</span>
                    <span className="profile-security-value">••••••••</span>
                  </div>
                  <button
                    className="profile-btn-change"
                    onClick={() => setShowPasswordForm(true)}
                  >
                    Cambiar
                  </button>
                </div>

                <div className="profile-security-item">
                  <div className="profile-security-icon success">
                    <Check size={16} />
                  </div>
                  <div className="profile-security-content">
                    <span className="profile-security-label">Estado de la cuenta</span>
                    <span className="profile-security-value success">Activa</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="profile-password-form">
                <div className="profile-password-header">
                  <AlertCircle size={16} />
                  <span>Ingresa tu contraseña actual y la nueva contraseña</span>
                </div>

                <div className="profile-form-group">
                  <label>Contraseña actual</label>
                  <input
                    type="password"
                    value={passwordData.currentPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                    placeholder="Tu contraseña actual"
                    disabled={changingPassword}
                  />
                </div>

                <div className="profile-form-group">
                  <label>Nueva contraseña</label>
                  <input
                    type="password"
                    value={passwordData.newPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                    placeholder="Mínimo 6 caracteres"
                    disabled={changingPassword}
                  />
                </div>

                <div className="profile-form-group">
                  <label>Confirmar nueva contraseña</label>
                  <input
                    type="password"
                    value={passwordData.confirmPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                    placeholder="Repite la nueva contraseña"
                    disabled={changingPassword}
                  />
                </div>

                <div className="profile-password-actions">
                  <button
                    className="profile-btn-cancel"
                    onClick={() => {
                      setShowPasswordForm(false)
                      setPasswordData({
                        currentPassword: '',
                        newPassword: '',
                        confirmPassword: '',
                      })
                    }}
                    disabled={changingPassword}
                  >
                    Cancelar
                  </button>
                  <button
                    className="profile-btn-save"
                    onClick={handleChangePassword}
                    disabled={changingPassword}
                  >
                    {changingPassword ? 'Cambiando...' : 'Cambiar contraseña'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Info de cuenta */}
          <div className="profile-footer">
            <span>Miembro desde: {profile?.created_at ? new Date(profile.created_at).toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' }) : '-'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
