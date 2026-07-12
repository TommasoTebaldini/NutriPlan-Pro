// api/vapid-public-key.js — Restituisce la chiave pubblica VAPID (non
// segreta per definizione) usata dal client per iscriversi alle notifiche
// push (PushManager.subscribe). La chiave privata resta solo lato server,
// usata da api/cron-appointment-reminders.js per firmare gli invii.
// Nessuna autenticazione richiesta: è una chiave pubblica.

export default function handler(req, res) {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return res.status(500).json({ error: 'VAPID_PUBLIC_KEY non configurata.' });
  }
  res.status(200).json({ publicKey });
}
