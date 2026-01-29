// src/components/DriveFilesModal.tsx
// Modal reutilizable para mostrar archivos de Google Drive

import { X, FileText, FileImage, File, FolderOpen, ExternalLink, Loader2 } from 'lucide-react'

interface DriveFile {
  id: string
  name: string
  mimeType: string
  size?: string
  modifiedTime: string
  webViewLink?: string
  thumbnailLink?: string
  iconLink?: string
}

interface DriveFilesModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  driveUrl: string
  files: DriveFile[]
  loading: boolean
}

// Helper para obtener icono según tipo de archivo
function getFileIcon(mimeType: string) {
  if (mimeType.includes('image')) return <FileImage size={20} style={{ color: '#60a5fa' }} />
  if (mimeType.includes('pdf')) return <FileText size={20} style={{ color: '#f87171' }} />
  if (mimeType.includes('document') || mimeType.includes('word')) return <FileText size={20} style={{ color: '#3b82f6' }} />
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return <FileText size={20} style={{ color: '#22c55e' }} />
  if (mimeType.includes('folder')) return <FolderOpen size={20} style={{ color: '#facc15' }} />
  return <File size={20} style={{ color: '#6b7280' }} />
}

// Helper para formatear tamaño de archivo
function formatFileSize(bytes?: string) {
  if (!bytes) return ''
  const size = parseInt(bytes)
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

// Helper para formatear fecha
function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric'
  })
}

export function DriveFilesModal({ isOpen, onClose, title, driveUrl, files, loading }: DriveFilesModalProps) {
  if (!isOpen) return null

  // Detectar tema oscuro - usar data-theme del HTML que es lo que usa la app
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'

  const styles = {
    overlay: {
      position: 'fixed' as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '20px'
    },
    modal: {
      backgroundColor: isDark ? '#1a1a2e' : '#ffffff',
      borderRadius: '16px',
      width: '100%',
      maxWidth: '500px',
      maxHeight: '80vh',
      display: 'flex',
      flexDirection: 'column' as const,
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
      border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #e5e7eb',
      overflow: 'hidden'
    },
    header: {
      padding: '24px 24px 16px',
      textAlign: 'center' as const,
      position: 'relative' as const,
      borderBottom: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #e5e7eb'
    },
    closeBtn: {
      position: 'absolute' as const,
      top: '16px',
      right: '16px',
      background: 'transparent',
      border: 'none',
      cursor: 'pointer',
      padding: '4px',
      color: isDark ? '#9ca3af' : '#6b7280',
      borderRadius: '4px'
    },
    iconContainer: {
      width: '56px',
      height: '56px',
      borderRadius: '50%',
      border: '2px solid #16a34a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      margin: '0 auto 16px'
    },
    title: {
      fontSize: '18px',
      fontWeight: 600,
      color: isDark ? '#ffffff' : '#1f2937',
      margin: 0
    },
    body: {
      padding: '16px 24px',
      overflowY: 'auto' as const,
      flex: 1
    },
    fileItem: {
      display: 'flex',
      alignItems: 'center',
      padding: '12px',
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#f9fafb',
      borderRadius: '8px',
      gap: '12px',
      marginBottom: '8px',
      cursor: 'pointer',
      border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e5e7eb',
      transition: 'all 0.15s ease'
    },
    fileItemHover: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#f3f4f6',
      borderColor: isDark ? 'rgba(255,255,255,0.15)' : '#d1d5db'
    },
    fileName: {
      fontWeight: 500,
      color: isDark ? '#ffffff' : '#1f2937',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap' as const,
      fontSize: '14px'
    },
    fileMeta: {
      fontSize: '12px',
      color: isDark ? '#9ca3af' : '#6b7280',
      marginTop: '2px'
    },
    footer: {
      padding: '16px 24px',
      display: 'flex',
      gap: '12px',
      justifyContent: 'center',
      borderTop: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #e5e7eb'
    },
    primaryBtn: {
      backgroundColor: '#ff0033',
      color: '#ffffff',
      border: 'none',
      borderRadius: '8px',
      padding: '10px 20px',
      fontSize: '14px',
      fontWeight: 500,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    },
    secondaryBtn: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#f3f4f6',
      color: isDark ? '#ffffff' : '#374151',
      border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #d1d5db',
      borderRadius: '8px',
      padding: '10px 20px',
      fontSize: '14px',
      fontWeight: 500,
      cursor: 'pointer'
    },
    emptyState: {
      textAlign: 'center' as const,
      padding: '40px 20px',
      color: isDark ? '#9ca3af' : '#6b7280'
    },
    loadingState: {
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '40px',
      gap: '12px',
      color: isDark ? '#9ca3af' : '#6b7280'
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <button style={styles.closeBtn} onClick={onClose}>
            <X size={20} />
          </button>
          <div style={styles.iconContainer}>
            <FolderOpen size={28} style={{ color: '#16a34a' }} />
          </div>
          <h2 style={styles.title}>{title}</h2>
        </div>

        {/* Body */}
        <div style={styles.body}>
          {loading ? (
            <div style={styles.loadingState}>
              <Loader2 size={24} className="animate-spin" style={{ color: '#ff0033' }} />
              <span>Cargando archivos...</span>
            </div>
          ) : files.length === 0 ? (
            <div style={styles.emptyState}>
              <FolderOpen size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
              <p style={{ margin: 0 }}>No hay archivos en esta carpeta</p>
            </div>
          ) : (
            <>
              {files.map(file => (
                <div
                  key={file.id}
                  style={styles.fileItem}
                  onClick={() => file.webViewLink && window.open(file.webViewLink, '_blank')}
                  onMouseEnter={e => {
                    Object.assign(e.currentTarget.style, styles.fileItemHover)
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.backgroundColor = styles.fileItem.backgroundColor
                    e.currentTarget.style.borderColor = styles.fileItem.border.split(' ')[2]
                  }}
                >
                  {getFileIcon(file.mimeType)}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={styles.fileName}>{file.name}</div>
                    <div style={styles.fileMeta}>
                      {formatFileSize(file.size)}
                      {file.size && ' • '}
                      {formatDate(file.modifiedTime)}
                    </div>
                  </div>
                  {file.webViewLink && (
                    <ExternalLink size={16} style={{ color: isDark ? '#9ca3af' : '#6b7280', flexShrink: 0 }} />
                  )}
                </div>
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <button
            style={styles.primaryBtn}
            onClick={() => window.open(driveUrl, '_blank')}
          >
            <ExternalLink size={16} />
            Abrir en Drive
          </button>
          <button style={styles.secondaryBtn} onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

export type { DriveFile, DriveFilesModalProps }
