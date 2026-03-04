import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // React core — se carga siempre, cacheable a largo plazo
          'vendor-react': ['react', 'react-dom', 'react-router', 'react-router-dom'],
          // Supabase client — se carga siempre
          'vendor-supabase': ['@supabase/supabase-js'],
          // Charts (recharts + d3) — solo dashboards/reportes los necesitan
          'vendor-charts': ['recharts'],
          // PDF export — solo se usa al exportar
          'vendor-pdf': ['jspdf', 'html2canvas'],
          // Excel — solo se usa al exportar
          'vendor-xlsx': ['xlsx'],
          // SweetAlert2 — se usa en muchos módulos
          'vendor-swal': ['sweetalert2'],
          // TanStack Table — se usa en DataTable
          'vendor-table': ['@tanstack/react-table'],
          // Date utilities
          'vendor-date': ['date-fns'],
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
