import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
  // Use base path unconditionally to match testing and production path structure
  const base = '/3dcal/';
  
  return {
    plugins: [react()],
    base,
    server: {
      host: '0.0.0.0', // Allow access from network
      port: 5173,
    },
  build: {
    // Use esbuild for fast minification (built-in, no extra dependencies)
    minify: 'esbuild',
    // Disable source maps for smaller build size
    sourcemap: false,
    // Optimize assets - inline small assets as base64
    assetsInlineLimit: 4096,
  },
  };
});
