import glsl from 'vite-plugin-glsl';
import { resolve } from 'path';
import { defineConfig } from 'vite';

const root = resolve(__dirname, 'src');

export default defineConfig({
  root,
  publicDir: '../static/',
  server: {
    host: true,
    open: !('SANDBOX_URL' in process.env || 'CODESANDBOX_HOST' in process.env),
  },
  plugins: [glsl()],
});
