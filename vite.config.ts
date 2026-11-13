import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: 'src/test/setup.ts',
    // Stylesheets stay switched off in tests, except where a test asks for one as text (`?raw`).
    css: { include: /\.css\?raw$/ },
  },
})
