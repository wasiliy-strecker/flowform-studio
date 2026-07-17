import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@flowform/api-client': workspaceSource('api-client'),
      '@flowform/api-contracts': workspaceSource('api-contracts'),
      '@flowform/form-schema': workspaceSource('form-schema'),
      '@flowform/realtime-contracts': workspaceSource('realtime-contracts'),
      '@flowform/workflow-schema': workspaceSource('workflow-schema'),
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['flowform-icon.svg'],
      manifest: {
        name: 'FlowForm Studio PRO',
        short_name: 'FlowForm',
        description: 'Visual forms and approval workflows',
        theme_color: '#5b5bd6',
        background_color: '#0b0c16',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/flowform-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        runtimeCaching: [],
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
      },
    },
  },
  preview: {
    port: 4173,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['./test/**/*.test.{ts,tsx}'],
    css: true,
  },
})

function workspaceSource(packageName: string): string {
  return fileURLToPath(new URL(`../../packages/${packageName}/src/index.ts`, import.meta.url))
}
