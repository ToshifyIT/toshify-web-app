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
  if (mimeType.includes('image')) return <FileImage size={20} className="text-blue-500" />
  if (mimeType.includes('pdf')) return <FileText size={20} className="text-red-500" />
  if (mimeType.includes('document') || mimeType.includes('word')) return <FileText size={20} className="text-blue-600" />
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return <FileText size={20} className="text-green-600" />
  if (mimeType.includes('folder')) return <FolderOpen size={20} className="text-yellow-500" />
  return <File size={20} className="text-gray-500" />
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
            <FolderOpen size={24} />
            {title}
          </h2>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: '50vh', overflowY: 'auto' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
              <Loader2 size={32} className="animate-spin" style={{ color: '#E63946' }} />
            </div>
          ) : files.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>
              <FolderOpen size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
              <p>No hay archivos en esta carpeta</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {files.map(file => (
                <div
                  key={file.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '12px 16px',
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: '8px',
                    gap: '12px'
                  }}
                >
                  {getFileIcon(file.mimeType)}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {file.name}
                    </div>
                    <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                      {formatFileSize(file.size)}
                      {file.size && ' • '}
                      {formatDate(file.modifiedTime)}
                    </div>
                  </div>
                  {file.webViewLink && (
                    <a
                      href={file.webViewLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: '6px',
                        borderRadius: '4px',
                        color: '#9ca3af',
                        transition: 'color 0.2s'
                      }}
                      onMouseOver={e => (e.currentTarget.style.color = '#E63946')}
                      onMouseOut={e => (e.currentTarget.style.color = '#9ca3af')}
                      title="Abrir archivo"
                    >
                      <ExternalLink size={18} />
                    </a>
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
