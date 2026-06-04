import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// base './' keeps asset URLs relative so the app works under a GitHub Pages
// project path (e.g. https://user.github.io/cjai/) with no repo-name coupling.
export default defineConfig({
  base: './',
  plugins: [react()],
})
