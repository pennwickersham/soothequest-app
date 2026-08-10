import { defineConfig } from 'vite';
import { resolve } from 'path';
import { renameSync } from 'fs';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'www',
    emptyOutDir: false,
    rollupOptions: {
      input: resolve(__dirname, 'soothe-quest.html'),
    },
  },
  plugins: [{
    name: 'rename-to-index',
    writeBundle() {
      try {
        renameSync('www/soothe-quest.html', 'www/index.html');
      } catch {}
    },
  }],
});
