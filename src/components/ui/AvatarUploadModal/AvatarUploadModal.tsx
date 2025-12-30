// src/components/ui/AvatarUploadModal/AvatarUploadModal.tsx
/**
 * Modal para subir y recortar foto de perfil
 * Incluye drag & drop, preview y recorte circular
 */

import { useState, useCallback, useRef } from 'react'
import Cropper from 'react-easy-crop'
import type { Area, Point } from 'react-easy-crop'
import { X, Upload, ZoomIn, ZoomOut, RotateCcw, Check, ImageIcon, Loader2 } from 'lucide-react'
import './AvatarUploadModal.css'

interface AvatarUploadModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (croppedImage: Blob) => Promise<void>
  currentAvatarUrl?: string | null
}

export function AvatarUploadModal({ isOpen, onClose, onSave, currentAvatarUrl }: AvatarUploadModalProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels)
  }, [])

  const handleFileSelect = (file: File) => {
    setError(null)

    // Validar tipo
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!validTypes.includes(file.type)) {
      setError('Solo se permiten imágenes JPG, PNG, WebP o GIF')
      return
    }

    // Validar tamaño (max 5MB para el original)
    if (file.size > 5 * 1024 * 1024) {
      setError('La imagen no debe superar los 5MB')
      return
    }

    const reader = new FileReader()
    reader.addEventListener('load', () => {
      setImageSrc(reader.result as string)
    })
    reader.readAsDataURL(file)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const file = e.dataTransfer.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const createCroppedImage = async (): Promise<Blob> => {
    if (!imageSrc || !croppedAreaPixels) {
      throw new Error('No hay imagen para recortar')
    }

    const image = await createImage(imageSrc)
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    if (!ctx) {
      throw new Error('No se pudo crear el contexto del canvas')
    }

    // Tamaño final del avatar (cuadrado)
    const size = 256
    canvas.width = size
    canvas.height = size

    // Aplicar rotación
    ctx.translate(size / 2, size / 2)
    ctx.rotate((rotation * Math.PI) / 180)
    ctx.translate(-size / 2, -size / 2)

    // Dibujar la imagen recortada
    ctx.drawImage(
      image,
      croppedAreaPixels.x,
      croppedAreaPixels.y,
      croppedAreaPixels.width,
      croppedAreaPixels.height,
      0,
      0,
      size,
      size
    )

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob)
          } else {
            reject(new Error('Error al crear la imagen'))
          }
        },
        'image/jpeg',
        0.9
      )
    })
  }

  const handleSave = async () => {
    if (!imageSrc || !croppedAreaPixels) return

    setSaving(true)
    setError(null)

    try {
      const croppedBlob = await createCroppedImage()
      await onSave(croppedBlob)
      handleClose()
    } catch (err: any) {
      setError(err.message || 'Error al guardar la imagen')
    } finally {
      setSaving(false)
    }
  }

  const handleClose = () => {
    setImageSrc(null)
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setRotation(0)
    setCroppedAreaPixels(null)
    setError(null)
    onClose()
  }

  const handleReset = () => {
    setImageSrc(null)
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setRotation(0)
    setError(null)
  }

  if (!isOpen) return null

  return (
    <div className="avatar-modal-overlay" onClick={handleClose}>
      <div className="avatar-modal" onClick={(e) => e.stopPropagation()}>
        <div className="avatar-modal-header">
          <h3>Foto de perfil</h3>
          <button className="avatar-modal-close" onClick={handleClose}>
            <X size={20} />
          </button>
        </div>

        <div className="avatar-modal-content">
          {!imageSrc ? (
            // Zona de drag & drop
            <div
              className={`avatar-dropzone ${isDragging ? 'dragging' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleInputChange}
                style={{ display: 'none' }}
              />

              <div className="avatar-dropzone-content">
                {currentAvatarUrl && (
                  <div className="avatar-dropzone-preview">
                    <img src={currentAvatarUrl} alt="Avatar actual" />
                  </div>
                )}

                <div className="avatar-dropzone-icon">
                  <ImageIcon size={48} />
                </div>

                <div className="avatar-dropzone-text">
                  <p className="avatar-dropzone-title">
                    Arrastra una imagen aquí
                  </p>
                  <p className="avatar-dropzone-subtitle">
                    o haz clic para seleccionar
                  </p>
                </div>

                <button type="button" className="avatar-dropzone-btn">
                  <Upload size={16} />
                  Seleccionar archivo
                </button>

                <p className="avatar-dropzone-hint">
                  JPG, PNG, WebP o GIF. Máximo 5MB.
                </p>
              </div>
            </div>
          ) : (
            // Editor de recorte
            <div className="avatar-editor">
              <div className="avatar-crop-container">
                <Cropper
                  image={imageSrc}
                  crop={crop}
                  zoom={zoom}
                  rotation={rotation}
                  aspect={1}
                  cropShape="round"
                  showGrid={false}
                  onCropChange={setCrop}
                  onCropComplete={onCropComplete}
                  onZoomChange={setZoom}
                />
              </div>

              <div className="avatar-controls">
                <div className="avatar-control-group">
                  <label>
                    <ZoomOut size={16} />
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={3}
                    step={0.1}
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="avatar-slider"
                  />
                  <label>
                    <ZoomIn size={16} />
                  </label>
                </div>

                <div className="avatar-control-buttons">
                  <button
                    type="button"
                    className="avatar-control-btn"
                    onClick={() => setRotation((r) => r - 90)}
                    title="Rotar izquierda"
                  >
                    <RotateCcw size={16} />
                  </button>
                  <button
                    type="button"
                    className="avatar-control-btn"
                    onClick={handleReset}
                    title="Cambiar imagen"
                  >
                    Cambiar imagen
                  </button>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="avatar-error">
              {error}
            </div>
          )}
        </div>

        <div className="avatar-modal-footer">
          <button
            type="button"
            className="avatar-btn-cancel"
            onClick={handleClose}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="avatar-btn-save"
            onClick={handleSave}
            disabled={!imageSrc || saving}
          >
            {saving ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Check size={16} />
                Guardar foto
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// Utility function to create image from URL
function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', (error) => reject(error))
    image.crossOrigin = 'anonymous'
    image.src = url
  })
}
