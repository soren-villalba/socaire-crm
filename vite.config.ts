import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// `npm run build:archivo` genera dist-archivo/index.html: el CRM completo en un solo archivo
// que se abre con doble clic (modo local, sin instalar nada).
export default defineConfig(({ mode }) => ({
  plugins: mode === 'archivo' ? [react(), viteSingleFile()] : [react()],
  build: mode === 'archivo' ? { outDir: 'dist-archivo', assetsInlineLimit: 100000000 } : undefined,
  server: { port: 5173 },
}))
