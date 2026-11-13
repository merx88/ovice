import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

/**
 * The vendor chunk a module of the production bundle belongs in; nothing for
 * the app's own code and the small libraries that stay with it.
 *
 * In one file the bundle is 1.4 MB, most of it the 3D libraries, which change
 * far less often than the app. Each group gets a file of its own, so that a
 * new version of the app leaves the others in the visitor's cache. three.js
 * goes in two, along the two files it is published as: together they are
 * larger than the size Vite warns about.
 *
 * A module that is given a chunk takes with it whatever it imports that has
 * not been given another.
 */
function vendorChunk(id: string): string | undefined {
  if (!id.includes('/node_modules/')) return undefined
  if (id.includes('/node_modules/three/build/three.core.')) return 'three-core'
  if (id.includes('/node_modules/three/')) return 'three'
  if (id.includes('/node_modules/@react-three/')) return 'react-three'
  if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react'
  return undefined
}

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: { output: { manualChunks: vendorChunk } },
  },
  test: {
    environment: 'jsdom',
    setupFiles: 'src/test/setup.ts',
    // Stylesheets stay switched off in tests, except where a test asks for one as text (`?raw`).
    css: { include: /\.css\?raw$/ },
  },
})
