import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const SPA_ROUTES = new Set([
  '/pricing',
  '/platform',
  '/visa-operations',
  '/ai-control-security',
  '/solutions',
  '/corporate-sponsorship',
  '/practice-growth',
  '/how-it-works',
  '/resources',
  '/support',
  '/book-demo',
  '/privacy',
  '/terms',
])

function spaRoutes() {
  return {
    name: 'spa-routes',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = req.url?.split('?')[0] || ''
        const path = url.replace(/\.html$/, '')
        if (SPA_ROUTES.has(path)) req.url = '/index.html'
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [spaRoutes(), react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
})
