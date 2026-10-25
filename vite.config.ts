import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the site at /<repo>/, so every asset URL must be prefixed.
export default defineConfig({
  base: '/headliners/',
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
