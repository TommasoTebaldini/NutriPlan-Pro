import express from 'express';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 5000;
const HOST = '0.0.0.0';

app.disable('x-powered-by');

app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: false, limit: '64kb' }));

// Header di sicurezza letti direttamente da vercel.json invece di essere
// riscritti a mano qui — prima le due copie (questa e quella in vercel.json,
// l'unica realmente usata in produzione) erano già andate fuori sync senza
// che nessuno se ne accorgesse: server.js includeva https://api.groq.com in
// connect-src (non presente in vercel.json) e mancava upgrade-insecure-
// requests. Ora vercel.json resta l'unica fonte di verità: un cambio alla
// CSP/security header lì si riflette automaticamente anche qui, non serve
// più ricordarsi di aggiornare due file.
const vercelConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'vercel.json'), 'utf8'));
const catchAllHeaders = vercelConfig.headers?.find(h => h.source === '/(.*)')?.headers || [];

app.use((req, res, next) => {
  const isProd = process.env.NODE_ENV === 'production';
  for (const { key, value } of catchAllHeaders) {
    // 'Link' (preconnect hints) è specifico del CDN/hosting di produzione.
    // 'Strict-Transport-Security' fuori produzione forzerebbe il browser a
    // ricordare "solo HTTPS" anche per questo host di sviluppo locale —
    // stesso comportamento (solo in prod) del codice precedente.
    if (key === 'Link') continue;
    if (key === 'Strict-Transport-Security' && !isProd) continue;
    res.setHeader(key, value);
  }
  if (!isProd) {
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
});

const apiDir = path.join(__dirname, 'api');
const handlerCache = new Map();

async function loadHandler(name) {
  if (handlerCache.has(name)) return handlerCache.get(name);
  const file = path.join(apiDir, `${name}.js`);
  if (!fs.existsSync(file)) return null;
  const mod = await import(pathToFileURL(file).href);
  const handler = mod.default || mod.handler || mod;
  handlerCache.set(name, handler);
  return handler;
}

app.all('/api/:name', async (req, res) => {
  try {
    const name = req.params.name.replace(/[^a-zA-Z0-9_-]/g, '');
    // File prefissati con `_` (es. _anthropic.js, _rateLimit.js) sono moduli
    // interni importati da altri handler, non route pubbliche: su Vercel
    // questa esclusione è automatica (il prefisso `_` li esime dal diventare
    // Serverless Function a sé, vedi i commenti in testa a quei file). Questo
    // router Express non replica quella convenzione di default — senza
    // questo controllo, /api/_ragSearch (ecc.) importerebbe ed eseguirebbe
    // moduli pensati per restare privati.
    if (name.startsWith('_')) return res.status(404).json({ error: 'Not found' });
    const handler = await loadHandler(name);
    if (!handler) return res.status(404).json({ error: 'Not found' });
    await handler(req, res);
  } catch (err) {
    console.error(`API /${req.params.name} error:`, err);
    if (!res.headersSent) res.status(500).json({ error: 'Server error' });
  }
});

app.use(
  express.static(__dirname, {
    extensions: ['html'],
    setHeaders: (res, filePath) => {
      if (process.env.NODE_ENV !== 'production') {
        res.setHeader('Cache-Control', 'no-store');
      }
    },
  })
);

app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'landing.html')));

app.listen(PORT, HOST, () => {
  console.log(`NutriPlan Pro running on http://${HOST}:${PORT}`);
});
