import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
