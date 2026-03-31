import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/theme.css'
import './index.css'
import './styles/modules.css'
import { ThemeProvider } from './contexts/ThemeContext'
import App from './App.tsx'

// Fix oficial de Vite para ChunkLoadError post-deploy:
// Cuando un chunk lazy ya no existe en el servidor (nuevo deploy con nuevos hashes),
// Vite dispara este evento. Recargamos automáticamente para obtener el nuevo index.html
// con los hashes actualizados — invisible para el usuario.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  const chunkKey = 'vite_preload_reload'
  const now = Date.now()
  const last = parseInt(localStorage.getItem(chunkKey) || '0')
  // Solo recargar si no se recargó en los últimos 10 segundos (evitar loops)
  if (now - last > 10000) {
    localStorage.setItem(chunkKey, now.toString())
    window.location.reload()
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
)
