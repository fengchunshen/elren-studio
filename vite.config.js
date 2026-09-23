import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'
import { elrenBootSplashPlugin } from './scripts/elren-boot-splash.mjs'

// https://vitejs.dev/config/
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [react(), elrenBootSplashPlugin(), viteSingleFile(), {
    name: 'elren-brand-icon',
    transformIndexHtml() {
      const svg = readFileSync(new URL('./src/assets/brand/elren-mark.svg', import.meta.url), 'utf8')
      return [{ tag: 'link', attrs: { rel: 'icon', type: 'image/svg+xml', href: `data:image/svg+xml,${encodeURIComponent(svg)}` }, injectTo: 'head' }]
    },
  }],
  server: { proxy: { '/api': { target: process.env.ELREN_DEV_API_URL || 'http://127.0.0.1:8000', changeOrigin: false } } },
  build: {
    emptyOutDir: false,
    minify: true,
    cssCodeSplit: false, // Ensure CSS is inlined
    assetsInlineLimit: 100000000, // Large limit to ensure assets are inlined
  }
})
