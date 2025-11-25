import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
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
