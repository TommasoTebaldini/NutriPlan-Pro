// api/meta.js — endpoint unico per due micro-utility GET che prima erano due
// serverless function separate (api/my-ip.js e api/vapid-public-key.js),
// accorpate perché il piano Hobby di Vercel consente max 12 function per
// deployment. Nessuna delle due richiede autenticazione:
//
//   GET /api/meta?what=ip     → IP pubblico del chiamante (usato da
//     js/firma.js per l'audit trail della firma elettronica avanzata,
//     SEZIONE 23 — rivela solo l'IP del chiamante a se stesso)
//   GET /api/meta?what=vapid  → chiave pubblica VAPID (non segreta per
//     definizione) usata dal client per PushManager.subscribe; la privata
//     resta solo server-side nei cron push

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

  return res.status(400).json({ error: 'Parametro what non valido (ip|vapid)' });
}
