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
        // Vite 8 (Rolldown) ya no admite manualChunks como objeto; se usa
        // la forma de función, que mapea cada módulo de node_modules a su
        // chunk por nombre de paquete. Reproduce la agrupación previa.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined

          // React core — se carga siempre, cacheable a largo plazo
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return 'vendor-react'
          // Supabase client — se carga siempre
          if (id.includes('/node_modules/@supabase/')) return 'vendor-supabase'
          // Charts (recharts + d3) — solo dashboards/reportes los necesitan
          if (id.includes('/node_modules/recharts/') || id.includes('/node_modules/d3-')) return 'vendor-charts'
          // PDF export — solo se usa al exportar
          if (id.includes('/node_modules/jspdf/') || id.includes('/node_modules/html2canvas/')) return 'vendor-pdf'
          // Excel — solo se usa al exportar
          if (id.includes('/node_modules/xlsx/') || id.includes('/vendor/xlsx')) return 'vendor-xlsx'
          // SweetAlert2 — se usa en muchos módulos
          if (id.includes('/node_modules/sweetalert2/')) return 'vendor-swal'
          // TanStack Table — se usa en DataTable
          if (id.includes('/node_modules/@tanstack/')) return 'vendor-table'
          // Lucide icons — SVGs cacheables por separado
          if (id.includes('/node_modules/lucide-react/')) return 'vendor-icons'
          // Date utilities
          if (id.includes('/node_modules/date-fns/')) return 'vendor-date'
          // Calendar — solo módulo visitas
          if (id.includes('/node_modules/react-big-calendar/')) return 'vendor-calendar'

          return undefined
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
