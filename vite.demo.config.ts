import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ root: 'demo', plugins: [vue()], server: { fs: { allow: ['.'] } } });
