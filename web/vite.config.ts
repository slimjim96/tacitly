import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// `npm run build` writes straight into the API's wwwroot so one container serves both.
export default defineConfig({
  plugins: [react()],
  build: { outDir: '../src/InsideOut.Api/wwwroot', emptyOutDir: true },
  server: { proxy: { '/api': 'http://localhost:5080' } },
})
