import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { stat } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

/**
 * Monta la API del análisis con IA del Dashboard Directivo (/api/insights-directivo)
 * DENTRO del dev server de Vite, para que `npm run dev` funcione sin levantar
 * server.js. Solo aplica en `serve` (dev); en producción la sirve server.js.
 * Si algo falla, el dev server arranca igual y la pantalla usa las lecturas por reglas.
 */
function insightsDirectivoDevApi(): Plugin {
  return {
    name: 'toshify-insights-directivo-dev-api',
    apply: 'serve',
    async configureServer(server) {
      try {
        const rutaModulo = path.resolve(server.config.root, 'server-insights-directivo.js')
        const { mtimeMs } = await stat(rutaModulo)
        const modulo = `${pathToFileURL(rutaModulo).href}?v=${mtimeMs}`
        const { insightsDirectivoRouter } = await import(/* @vite-ignore */ modulo)
        server.middlewares.use('/api/insights-directivo', insightsDirectivoRouter)
        server.watcher.add(rutaModulo)
        server.watcher.on('change', (archivo) => {
          if (path.resolve(archivo) !== rutaModulo) return
          void server.restart()
        })
      } catch (err) {
        server.config.logger.warn(
          '  [insights-directivo] No se pudo montar /api/insights-directivo: ' +
            (err instanceof Error ? err.message : String(err)),
        )
      }
    },
  }
}

/**
 * Monta las rutas de Administración > Integraciones & Tokens (/api/admin/tokens,
 * /api/admin/function-health, /api/admin/toggle-function) dentro del dev server,
 * para que Credenciales y Monitor funcionen con `npm run dev` sin levantar dev:api.
 * Las demás rutas /api/admin/* siguen yendo al proxy. En producción las sirve server.js.
 */
function adminIntegracionesDevApi(): Plugin {
  return {
    name: 'toshify-admin-integraciones-dev-api',
    apply: 'serve',
    async configureServer(server) {
      try {
        const rutaModulo = path.resolve(server.config.root, 'server-admin-integraciones.js')
        const { mtimeMs } = await stat(rutaModulo)
        const modulo = `${pathToFileURL(rutaModulo).href}?v=${mtimeMs}`
        const { adminIntegracionesRouter } = await import(/* @vite-ignore */ modulo)
        server.middlewares.use('/api/admin', adminIntegracionesRouter)
        server.watcher.add(rutaModulo)
        server.watcher.on('change', (archivo) => {
          if (path.resolve(archivo) !== rutaModulo) return
          void server.restart()
        })
      } catch (err) {
        server.config.logger.warn(
          '  [admin-integraciones] No se pudo montar /api/admin: ' +
            (err instanceof Error ? err.message : String(err)),
        )
      }
    },
  }
}

/**
 * Monta la API de la integración 2Chat (/api/2chat) dentro del dev server de
 * Vite, igual que insightsDirectivoDevApi. En producción la sirve server.js.
 */
function twoChatDevApi(): Plugin {
  return {
    name: 'toshify-2chat-dev-api',
    apply: 'serve',
    async configureServer(server) {
      try {
        const rutaModulo = path.resolve(server.config.root, 'server-2chat.js')
        const { mtimeMs } = await stat(rutaModulo)
        const modulo = `${pathToFileURL(rutaModulo).href}?v=${mtimeMs}`
        const { twoChatRouter } = await import(/* @vite-ignore */ modulo)
        server.middlewares.use('/api/2chat', twoChatRouter)
        server.watcher.add(rutaModulo)
        server.watcher.on('change', (archivo) => {
          if (path.resolve(archivo) !== rutaModulo) return
          void server.restart()
        })
      } catch (err) {
        server.config.logger.warn(
          '  [2chat] No se pudo montar /api/2chat: ' +
            (err instanceof Error ? err.message : String(err)),
        )
      }
    },
  }
}

/**
 * Monta la API de la integración Cresium -> Alegra (/api/cresium) dentro del dev
 * server de Vite, igual que twoChatDevApi. En producción la sirve server.js.
 */
function cresiumDevApi(): Plugin {
  return {
    name: 'toshify-cresium-dev-api',
    apply: 'serve',
    async configureServer(server) {
      try {
        const rutaModulo = path.resolve(server.config.root, 'server-cresium.js')
        const { mtimeMs } = await stat(rutaModulo)
        const modulo = `${pathToFileURL(rutaModulo).href}?v=${mtimeMs}`
        const { cresiumRouter } = await import(/* @vite-ignore */ modulo)
        server.middlewares.use('/api/cresium', cresiumRouter)
        server.watcher.add(rutaModulo)
        server.watcher.on('change', (archivo) => {
          if (path.resolve(archivo) !== rutaModulo) return
          void server.restart()
        })
      } catch (err) {
        server.config.logger.warn(
          '  [cresium] No se pudo montar /api/cresium: ' +
            (err instanceof Error ? err.message : String(err)),
        )
      }
    },
  }
}

/**
 * Monta la API de la integración Alegra: Excel de ARCA (/api/alegra) dentro del dev
 * server de Vite, igual que twoChatDevApi. En producción la sirve server.js.
 */
function alegraDevApi(): Plugin {
  return {
    name: 'toshify-alegra-dev-api',
    apply: 'serve',
    async configureServer(server) {
      try {
        const rutaModulo = path.resolve(server.config.root, 'server-alegra.js')
        const { mtimeMs } = await stat(rutaModulo)
        const modulo = `${pathToFileURL(rutaModulo).href}?v=${mtimeMs}`
        const { alegraRouter } = await import(/* @vite-ignore */ modulo)
        server.middlewares.use('/api/alegra', alegraRouter)
        server.watcher.add(rutaModulo)
        server.watcher.on('change', (archivo) => {
          if (path.resolve(archivo) !== rutaModulo) return
          void server.restart()
        })
      } catch (err) {
        server.config.logger.warn(
          '  [alegra] No se pudo montar /api/alegra: ' +
            (err instanceof Error ? err.message : String(err)),
        )
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), insightsDirectivoDevApi(), twoChatDevApi(), cresiumDevApi(), alegraDevApi(), adminIntegracionesDevApi()],
  esbuild: {
    drop: ['console', 'debugger'],
  },
  build: {
    rollupOptions: {
      output: {
        // advancedChunks es la API nativa de Rolldown (Vite 8). A diferencia
        // de la emulación de manualChunks, respeta los límites eager/lazy:
        // un grupo que solo importan páginas lazy (jspdf, calendar, xlsx)
        // NO entra al grafo estático del entry / login.
        advancedChunks: {
          groups: [
            // React core — se carga siempre, cacheable a largo plazo
            { name: 'vendor-react', test: /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/ },
            // Supabase client — se carga siempre
            { name: 'vendor-supabase', test: /[\\/]node_modules[\\/]@supabase[\\/]/ },
            // Charts (recharts + d3) — solo dashboards/reportes los necesitan
            { name: 'vendor-charts', test: /[\\/]node_modules[\\/](recharts|d3-)/ },
            // PDF export — solo se usa al exportar
            { name: 'vendor-pdf', test: /[\\/]node_modules[\\/](jspdf|html2canvas)[\\/]/ },
            // Excel — solo se usa al exportar
            { name: 'vendor-xlsx', test: /[\\/](node_modules[\\/]xlsx|vendor[\\/]xlsx)/ },
            // SweetAlert2 — se usa en muchos módulos
            { name: 'vendor-swal', test: /[\\/]node_modules[\\/]sweetalert2[\\/]/ },
            // TanStack Table — se usa en DataTable
            { name: 'vendor-table', test: /[\\/]node_modules[\\/]@tanstack[\\/]/ },
            // Lucide icons — SVGs cacheables por separado
            { name: 'vendor-icons', test: /[\\/]node_modules[\\/]lucide-react[\\/]/ },
            // Date utilities
            { name: 'vendor-date', test: /[\\/]node_modules[\\/]date-fns[\\/]/ },
            // Calendar — solo módulo visitas
            { name: 'vendor-calendar', test: /[\\/]node_modules[\\/]react-big-calendar[\\/]/ },
          ],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/cabify-auth': {
        target: 'https://cabify.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/cabify-auth/, '/auth/api/authorization'),
      },
      '/cabify-graphql': {
        target: 'https://partners.cabify.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/cabify-graphql/, '/api/graphql'),
      }
    }
  }
})
