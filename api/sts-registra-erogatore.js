// api/sts-registra-erogatore.js — Registrazione una tantum come erogatore
// sanitario presso l'intermediario accreditato per il Sistema Tessera
// Sanitaria (STS). Vedi supabase_setup.sql SEZIONE 35 per il contesto
// completo: il Sistema TS non espone un'API diretta per i professionisti,
// quindi si passa da un intermediario REST (es. sistema-ts-api.it, prodotto
// A-Cube) — stesso principio già usato per l'invio SDI via Fatture in Cloud
// in api/fattura-sdi.js.
//
// Il dietista deve aver già inserito in Impostazioni → Dati fiscali:
//   - le credenziali dell'intermediario (sts_api_username/password)
//   - le proprie credenziali del portale Sistema TS (sts_username/password/pincode)
// prima di poter chiamare questo endpoint.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hvdwqowkhutfsdpiubxe.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STS_API_BASE = process.env.STS_API_BASE || 'https://sistema-ts-api.it/api/v1/prod';

async function verifySupabaseToken(token) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !token) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user?.id ? user : null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const user = await verifySupabaseToken(token);
    if (!user) return res.status(401).json({ error: 'Non autorizzato' });
    if (!SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Configurazione server incompleta (SUPABASE_SERVICE_ROLE_KEY)' });

    const profRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=fiscal_ragione_sociale,fiscal_codice_fiscale,fiscal_partita_iva,sts_api_username,sts_api_password,sts_username,sts_password,sts_pincode`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
    );
    const profiles = profRes.ok ? await profRes.json() : [];
    const prof = profiles[0];
    if (!prof?.sts_api_username || !prof?.sts_api_password) {
      return res.status(400).json({ error: 'Inserisci prima le credenziali dell\'intermediario (Username/Password API) in Impostazioni → Dati fiscali.' });
    }
    if (!prof?.fiscal_partita_iva || !prof?.fiscal_codice_fiscale) {
      return res.status(400).json({ error: 'Completa Partita IVA e Codice Fiscale in Impostazioni → Dati fiscali.' });
    }
    if (!prof?.sts_username || !prof?.sts_password || !prof?.sts_pincode) {
      return res.status(400).json({ error: 'Inserisci le tue credenziali del portale Sistema TS (Username/Password/PIN) in Impostazioni → Dati fiscali.' });
    }

    const basicAuth = Buffer.from(`${prof.sts_api_username}:${prof.sts_api_password}`).toString('base64');
    const body = {
      partitaIva: String(prof.fiscal_partita_iva).replace(/\D/g, ''),
      codiceFiscale: String(prof.fiscal_codice_fiscale).toUpperCase(),
      denominazione: prof.fiscal_ragione_sociale || undefined,
      usernameSts: prof.sts_username,
      passwordSts: prof.sts_password,
      pincodeSts: prof.sts_pincode,
    };

    const erRes = await fetch(`${STS_API_BASE}/erogatori`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${basicAuth}` },
      body: JSON.stringify(body),
    });
    let erBody = null;
    try { erBody = await erRes.json(); } catch { /* risposta non JSON */ }

    if (!erRes.ok) {
      if (erRes.status === 401) {
        return res.status(400).json({ error: 'Credenziali intermediario (Username/Password API) non valide.' });
      }
      return res.status(502).json({ error: 'Registrazione erogatore fallita: ' + (erBody?.message || erBody?.error || erRes.status) });
    }

    await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`, {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json', Prefer: 'return=minimal',
      },
      body: JSON.stringify({ sts_erogatore_registrato: true }),
    });

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Errore interno: ' + e.message });
  }
}
