import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Raccoglie tutti i file .html presenti nella radice del progetto per la build Multi-Page (MPA)
const htmlFiles = fs.readdirSync(__dirname)
  .filter(file => file.endsWith('.html'))
  .reduce((inputs, file) => {
    const name = file.replace(/\.html$/, '');
    inputs[name] = resolve(__dirname, file);
    return inputs;
  }, {});

// Tutti gli script del progetto sono script classici (non type="module"), caricati
// via <script src="js/...">. Vite non li bundlerizza (non può, senza type="module") e
// di default non li copia nemmeno in dist/, lasciando l'app senza JS. Li copiamo quindi
// verbatim: sono già minificati a monte da scripts/build-minify.js (npm run build:minify).
function copyClassicScriptsPlugin() {
  return {
    name: 'copy-classic-scripts',
    closeBundle() {
      fs.cpSync(resolve(__dirname, 'js'), resolve(__dirname, 'dist/js'), { recursive: true });
    },
  };
}

export default defineConfig({
  root: '.',
  plugins: [copyClassicScriptsPlugin()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false, // mantiene i log utili per l'app clinica
        drop_debugger: true,
      },
    },
    rollupOptions: {
      input: htmlFiles,
      output: {
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: 'assets/[ext]/[name]-[hash].[ext]',
      },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
});
