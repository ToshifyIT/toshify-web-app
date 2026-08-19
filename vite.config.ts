import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { stat } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

/**
 * Monta la API de Dropbox Sign (/api/hellosign/*) DENTRO del dev server de Vite.
 *
 * Motivo: la vista /hellosign hacia fetch a /api/hellosign, que el proxy mandaba
 * a localhost:3001 (server.js). Si ese proceso no estaba levantado, el proxy
 * devolvia 502 Bad Gateway. Con este plugin alcanza con `npm run dev`.
 *
 * - Solo aplica en `serve` (dev). En produccion las rutas las sirve server.js.
 * - El import es dinamico y esta envuelto en try/catch: si algo falla, el dev
 *   server arranca igual y solo se pierde /api/hellosign.
 * - Se registra antes que el proxy interno de Vite, asi que gana sobre '/api'.
 * - Node cachea los modulos ESM por URL, asi que el import lleva la mtime del
 *   archivo como cache-buster y el watcher reinicia el dev server al editarlo.
 *   Sin esto habria que matar y relevantar `npm run dev` a mano en cada cambio
 *   del backend, y se trabaja contra codigo viejo sin darse cuenta.
 */
function hellosignDevApi(): Plugin {
  return {
    name: 'toshify-hellosign-dev-api',
    apply: 'serve',
    async configureServer(server) {
      try {
        const rutaModulo = path.resolve(server.config.root, 'server-hellosign.js')
        const { mtimeMs } = await stat(rutaModulo)
        const modulo = `${pathToFileURL(rutaModulo).href}?v=${mtimeMs}`

        const { hellosignRouter } = await import(/* @vite-ignore */ modulo)
        server.middlewares.use('/api/hellosign', hellosignRouter)

        // Reinicia el dev server cuando cambia el backend de Dropbox Sign.
        server.watcher.add(rutaModulo)
        server.watcher.on('change', (archivo) => {
          if (path.resolve(archivo) !== rutaModulo) return
          server.config.logger.info(
            '  \x1b[33m\u21bb\x1b[0m server-hellosign.js cambio, reiniciando dev server...',
          )
          void server.restart()
        })

        server.config.logger.info(
          '  \x1b[32m\u2713\x1b[0m API Dropbox Sign montada en /api/hellosign',
        )
      } catch (err) {
        server.config.logger.warn(
          '  [hellosign] No se pudo montar /api/hellosign: ' +
            (err instanceof Error ? err.message : String(err)),
        )
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), hellosignDevApi()],
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
