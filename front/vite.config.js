import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    host: true,
    sourcemapIgnoreList: () => true,  // Suppress source map warnings in dev
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:3000',  // Use env var or default to 3000
        changeOrigin: false,  // Changed to false to preserve headers
        secure: false,
        // Don't strip /api prefix - backend routes expect it
        ws: true,
        followRedirects: true
      }
    }
  },
  preview: {
    port: 5174,
    host: true
  },
  build: {
    sourcemap: false,  // Disable source maps in production
  },
  optimizeDeps: {
    exclude: ['react-devtools'],  // Exclude dev tools from optimization
    include: ['react-grid-layout', 'react-resizable'],  // Explicitly include these deps
  }
})
