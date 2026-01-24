import './LoadingOverlay.css'

interface LoadingOverlayProps {
  /** Mostrar el overlay */
  show: boolean
  /** Texto a mostrar debajo del spinner */
  message?: string
  /** Tamaño del spinner: 'sm' | 'md' | 'lg' */
  size?: 'sm' | 'md' | 'lg'
  /** Si es true, bloquea toda la pantalla. Si es false, solo el contenedor padre */
  fullScreen?: boolean
  /** Mostrar barra de progreso con porcentaje */
  progress?: number
}

export function LoadingOverlay({ 
  show, 
  message = 'Cargando...', 
  size = 'md',
  fullScreen = true,
  progress
}: LoadingOverlayProps) {
  if (!show) return null

  return (
    <div className={`loading-overlay ${fullScreen ? 'fullscreen' : 'contained'}`}>
      <div className="loading-content">
        <div className={`spinner-toshify ${size}`}>
          <svg viewBox="0 0 50 50">
            <circle
              className="spinner-track"
              cx="25"
              cy="25"
              r="20"
              fill="none"
              strokeWidth="4"
            />
            <circle
              className="spinner-progress"
              cx="25"
              cy="25"
              r="20"
              fill="none"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </svg>
        </div>
        
        {message && <p className="loading-message">{message}</p>}
        
        {progress !== undefined && (
          <div className="progress-container">
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
            <span className="progress-text">{Math.round(progress)}%</span>
          </div>
        )}
      </div>
    </div>
  )
}

/** Spinner simple sin overlay - para usar inline */
export function Spinner({ 
  size = 'md', 
  message 
}: { 
  size?: 'sm' | 'md' | 'lg'
  message?: string 
}) {
  return (
    <div className="spinner-inline">
      <div className={`spinner-toshify ${size}`}>
        <svg viewBox="0 0 50 50">
          <circle
            className="spinner-track"
            cx="25"
            cy="25"
            r="20"
            fill="none"
            strokeWidth="4"
          />
          <circle
            className="spinner-progress"
            cx="25"
            cy="25"
            r="20"
            fill="none"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </svg>
      </div>
      {message && <p className="spinner-message">{message}</p>}
    </div>
  )
}

/** Barra de progreso lineal */
export function LinearProgress({ 
  progress, 
  message,
  showPercent = true
}: { 
  progress: number
  message?: string
  showPercent?: boolean
}) {
  return (
    <div className="linear-progress-container">
      {message && <p className="linear-progress-message">{message}</p>}
      <div className="linear-progress-wrapper">
        <div className="linear-progress-bar">
          <div 
            className="linear-progress-fill" 
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
        {showPercent && <span className="linear-progress-text">{Math.round(progress)}%</span>}
      </div>
    </div>
  )
}
