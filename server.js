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

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  } else {
    res.setHeader('Cache-Control', 'no-store');
  }
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://accounts.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://*.supabase.co; connect-src 'self' https://*.supabase.co https://www.googleapis.com https://api.groq.com https://cdn.jsdelivr.net; frame-ancestors 'self'; base-uri 'self'; form-action 'self'"
  );
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

app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, HOST, () => {
  console.log(`NutriPlan Pro running on http://${HOST}:${PORT}`);
});
