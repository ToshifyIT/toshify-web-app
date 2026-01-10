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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-container"
        style={{ maxWidth: '700px', maxHeight: '80vh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FolderOpen size={24} style={{ color: '#16a34a' }} />
            {title}
          </h2>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: '50vh', overflowY: 'auto' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '40px', gap: '12px' }}>
              <Loader2 size={32} className="animate-spin" style={{ color: '#E63946' }} />
              <span style={{ color: 'var(--text-secondary, #9ca3af)' }}>Cargando archivos...</span>
            </div>
          ) : files.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary, #9ca3af)' }}>
              <FolderOpen size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
              <p>No hay archivos en esta carpeta</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {files.map(file => (
                <div
                  key={file.id}
                  className="drive-file-item"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '12px 16px',
                    background: 'var(--bg-tertiary, rgba(255,255,255,0.05))',
                    borderRadius: '8px',
                    gap: '12px',
                    border: '1px solid var(--border-color, rgba(255,255,255,0.1))',
                    transition: 'background 0.2s, border-color 0.2s',
                    cursor: 'pointer'
                  }}
                  onClick={() => file.webViewLink && window.open(file.webViewLink, '_blank')}
                  onMouseOver={e => {
                    e.currentTarget.style.background = 'var(--bg-hover, rgba(255,255,255,0.08))'
                    e.currentTarget.style.borderColor = 'var(--border-hover, rgba(255,255,255,0.2))'
                  }}
                  onMouseOut={e => {
                    e.currentTarget.style.background = 'var(--bg-tertiary, rgba(255,255,255,0.05))'
                    e.currentTarget.style.borderColor = 'var(--border-color, rgba(255,255,255,0.1))'
                  }}
                >
                  {getFileIcon(file.mimeType)}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: 'var(--text-primary, #fff)'
                    }}>
                      {file.name}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary, #9ca3af)' }}>
                      {formatFileSize(file.size)}
                      {file.size && ' • '}
                      {formatDate(file.modifiedTime)}
                    </div>
                  </div>
                  {file.webViewLink && (
                    <ExternalLink size={18} style={{ color: 'var(--text-secondary, #9ca3af)', flexShrink: 0 }} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-footer" style={{ display: 'flex', gap: '12px', justifyContent: 'space-between' }}>
          <button
            className="btn-primary"
            onClick={() => window.open(driveUrl, '_blank')}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <ExternalLink size={16} />
            Abrir en Drive
          </button>
          <button className="btn-secondary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

export type { DriveFile, DriveFilesModalProps }
