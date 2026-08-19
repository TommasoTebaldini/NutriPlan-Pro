import { defineConfig } from 'vite';
import { resolve, relative } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Cartelle da non attraversare cercando .html: output/tooling/dipendenze, e le
// cartelle di asset statici (contengono solo script/css/immagini, mai pagine).
const HTML_SCAN_EXCLUDE = new Set([
  'node_modules', 'dist', '.git', '.vercel', '.claude', '.bolt', 'api',
  'scripts', 'css', 'js', 'icons', 'vendor', 'attached_assets', 'supabase',
]);

// Raccoglie ricorsivamente tutti i file .html del progetto (radice + sottocartelle,
// es. legal/) per la build Multi-Page (MPA). Prima leggeva solo la radice: i 6
// documenti legali sotto legal/ (DPA, registro trattamenti, policy ISO27001...)
// non venivano mai inclusi come pagine da buildare — 404 in produzione, pur
// essendo linkati da privacy.html/termini.html.
function findHtmlFiles(dir) {
  let out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (HTML_SCAN_EXCLUDE.has(entry.name)) continue;
      out = out.concat(findHtmlFiles(resolve(dir, entry.name)));
    } else if (entry.name.endsWith('.html')) {
      out.push(resolve(dir, entry.name));
    }
  }
  return out;
}

const htmlFiles = findHtmlFiles(__dirname).reduce((inputs, filePath) => {
  const name = relative(__dirname, filePath).replace(/\.html$/, '').replace(/\\/g, '/');
  inputs[name] = filePath;
  return inputs;
}, {});

// Tutti gli script del progetto sono script classici (non type="module"), caricati
// via <script src="js/...">. Vite non li bundlerizza (non può, senza type="module") e
// di default non li copia nemmeno in dist/, lasciando l'app senza JS. Li copiamo quindi
// verbatim: sono già minificati a monte da scripts/build-minify.js (npm run build:minify).
//
// Stesso identico problema per qualunque altro file referenziato SOLO come stringa
// (mai in un tag HTML/CSS/JS che Vite possa analizzare staticamente) — Vite non lo
// individua e lo lascia fuori da dist/, 404 in produzione. Riscontrato per:
// icons/ (dentro manifest.webmanifest), sw.js (registrato via stringa JS
// 'sw.js' in serviceWorker.register(), non un <script> reale — service worker
// invariato: importScripts() verso un CDN esterno, nessun bundling necessario),
// favicon.svg (referenziato ma Vite processa solo <link rel="icon"> se punta a
// un asset che sa hashare — qui copiato verbatim per restare un percorso fisso
// e stabile, coerente con come questo file gestiva già icons/manifest),
// robots.txt, template_pazienti.csv (bottone "Scarica template CSV" in
// pazienti.html, download diretto).
//
// manifest.webmanifest stesso NON è in questa lista: viene già rilevato da Vite
// tramite <link rel="manifest">, hashato e spostato sotto assets/webmanifest/ —
// i percorsi delle icone al suo interno sono per questo assoluti ("/icons/..."),
// per risolvere correttamente indipendentemente da dove finisce il manifest.
function copyClassicScriptsPlugin() {
  return {
    name: 'copy-classic-scripts',
    closeBundle() {
      fs.cpSync(resolve(__dirname, 'js'), resolve(__dirname, 'dist/js'), { recursive: true });
      fs.cpSync(resolve(__dirname, 'icons'), resolve(__dirname, 'dist/icons'), { recursive: true });
      for (const file of ['sw.js', 'favicon.svg', 'robots.txt', 'template_pazienti.csv']) {
        fs.copyFileSync(resolve(__dirname, file), resolve(__dirname, 'dist', file));
      }
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
