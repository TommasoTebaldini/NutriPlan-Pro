// api/my-ip.js — Restituisce l'IP pubblico del chiamante (letto dagli header
// che Vercel imposta in automatico su ogni richiesta). Nessuna autenticazione
// richiesta: rivela solo l'IP del chiamante a se stesso, esattamente come un
// qualunque servizio pubblico "what's my ip" — usato da js/firma.js per
// arricchire l'audit trail della firma elettronica avanzata (vedi
// supabase_setup.sql SEZIONE 23) senza dipendere da un servizio terzo
// esterno (evita anche di dover aprire la CSP a un host aggiuntivo).

export default function handler(req, res) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = (forwarded ? forwarded.split(',')[0].trim() : null)
    || req.socket?.remoteAddress
    || null;
  res.status(200).json({ ip });
}
