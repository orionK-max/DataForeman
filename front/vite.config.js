import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Vite does NOT expose .env file values to `process.env` inside this config file by
  // default (only to client code via `import.meta.env`) — loadEnv() + merging into
  // process.env is the documented way to make a local front/.env override the dev port
  // and API proxy target (e.g. on a machine where 5174/3000 collide with another app).
  const env = { ...process.env, ...loadEnv(mode, process.cwd(), '') };
  const devPort = Number(env.FRONT_DEV_PORT) || 5174;

  return {
    plugins: [react()],
    server: {
      port: devPort,
      host: true,
      sourcemapIgnoreList: () => true,  // Suppress source map warnings in dev
      proxy: {
        '/api': {
          target: env.VITE_API_URL || 'http://localhost:3000',  // Use env var or default to 3000
          changeOrigin: false,  // Changed to false to preserve headers
          secure: false,
          // Don't strip /api prefix - backend routes expect it
          ws: true,
          followRedirects: true
        }
      }
    },
    preview: {
      port: devPort,
      host: true
    },
    build: {
      sourcemap: false,  // Disable source maps in production
    },
    optimizeDeps: {
      exclude: ['react-devtools'],  // Exclude dev tools from optimization
      include: ['react-grid-layout', 'react-resizable'],  // Explicitly include these deps
    }
  }
})
