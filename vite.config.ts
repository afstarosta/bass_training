/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// No GitHub Pages o site fica em https://<usuario>.github.io/<repositorio>/,
// então o `base` precisa ser "/<repositorio>/". O workflow de deploy define
// BASE_PATH a partir do nome do repositório; localmente o padrão é "/".
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
