import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/theme.css'
import './index.css'
import './styles/modules.css'
import { ThemeProvider } from './contexts/ThemeContext'
import App from './App.tsx'

// Prevent Chrome from discarding this tab when inactive
// Chrome doesn't discard tabs with active Web Locks
if (navigator.locks) {
  navigator.locks.request('toshify-keep-alive', { mode: 'shared' }, () => {
    // Hold the lock forever - prevents Chrome tab discarding
    return new Promise(() => {})
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
)
