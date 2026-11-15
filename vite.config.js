import { defineConfig } from 'vite'

export default defineConfig({
  // Capacitor 把 dist/ 当作 WebView 内容，相对路径才能在 file:// 下正常加载
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
})
