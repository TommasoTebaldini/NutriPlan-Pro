// api/meta.js — endpoint unico per tre micro-utility GET che prima erano
// serverless function separate (api/my-ip.js, api/vapid-public-key.js,
// api/config.js), accorpate perché il piano Hobby di Vercel consente max 12
// function per deployment. Nessuna richiede autenticazione:
//
//   GET /api/meta?what=ip      → IP pubblico del chiamante (usato da
//     js/firma.js per l'audit trail della firma elettronica avanzata,
//     SEZIONE 23 — rivela solo l'IP del chiamante a se stesso)
//   GET /api/meta?what=vapid   → chiave pubblica VAPID (non segreta per
//     definizione) usata dal client per PushManager.subscribe; la privata
//     resta solo server-side nei cron push
//   GET /api/meta?what=config  → configurazione pubblica lato client (es.
//     Google Client ID per Calendar sync in agenda.html)

export default function handler(req, res) {
  const what = req.query?.what;

  if (what === 'ip') {
    const forwarded = req.headers['x-forwarded-for'];
    const ip = (forwarded ? forwarded.split(',')[0].trim() : null)
      || req.socket?.remoteAddress
      || null;
    return res.status(200).json({ ip });
  }

  if (what === 'vapid') {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    if (!publicKey) {
      return res.status(500).json({ error: 'VAPID_PUBLIC_KEY non configurata.' });
    }
    return res.status(200).json({ publicKey });
  }

  if (what === 'config') {
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).json({
      googleClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || ''
    });
  }

  return res.status(400).json({ error: 'Parametro what non valido (ip|vapid|config)' });
}
