import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves 404.html for any path it doesn't recognise. On a client-routed
// SPA every deep link (e.g. /migration-matrix) is such a path on a cold load, so we
// ship an identical 404.html — Pages serves it, the JS boots, and the router resolves
// the URL. Without this, reloading any page but the root gives a real 404.
function spaFallback(): Plugin {
  return {
    name: 'spa-404-fallback',
    apply: 'build',
    closeBundle() {
      const dist = resolve(__dirname, 'dist')
      copyFileSync(resolve(dist, 'index.html'), resolve(dist, '404.html'))
    },
  }
}

// Project pages deploy to https://baluraut.github.io/react-best-practices/, so every
// asset URL must carry that prefix. A wrong base is the #1 cause of a blank GitHub
// Pages deploy: the build succeeds and every asset 404s at runtime.
export default defineConfig({
  base: '/react-best-practices/',
  plugins: [react(), spaFallback()],
  build: {
    rollupOptions: {
      output: {
        // Keep the two heavy dependency trees out of the entry chunk. MUI is large
        // enough to cache on its own; react-markdown + highlight.js only load on a
        // doc page. Rolldown accepts the rollup-compatible manualChunks function.
        manualChunks(id) {
          if (id.includes('node_modules/@mui/') || id.includes('node_modules/@emotion/')) return 'mui'
          if (
            /node_modules\/(react-markdown|rehype|remark|micromark|hast|mdast|unified|unist|vfile|highlight\.js|property-information|character-entities|decode-named|mdast|devlop|trim-lines|bail|zwitch|estree)/.test(
              id,
            )
          ) {
            return 'markdown'
          }
          return undefined
        },
      },
    },
  },
})
