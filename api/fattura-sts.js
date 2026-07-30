// api/fattura-sts.js — Invio di una fattura al Sistema Tessera Sanitaria (STS)
// tramite l'intermediario accreditato (sistema-ts-api.it / A-Cube — vedi
// SEZIONE 35 di supabase_setup.sql per il contesto completo). Stessa
// struttura di api/fattura-sdi.js: verifica JWT → legge credenziali dal
// profilo del chiamante (service role) → chiama l'API esterna → aggiorna
// lo stato sulla riga fattura.
//
// tipoSpesa "SP": prestazioni delle professioni sanitarie diverse da medici
// e odontoiatri (dietisti, biologi nutrizionisti, fisioterapisti, ecc. — la
// codifica "SR" è riservata a medici/odontoiatri).

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

    const fatturaId = req.body?.fattura_id;
    if (!fatturaId) return res.status(400).json({ error: 'fattura_id mancante' });

    const sbHeaders = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };

    const [profRes, fatRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=fiscal_partita_iva,sts_api_username,sts_api_password,sts_erogatore_registrato`, { headers: sbHeaders }),
      fetch(`${SUPABASE_URL}/rest/v1/fatture?id=eq.${fatturaId}&dietitian_id=eq.${user.id}&select=*`, { headers: sbHeaders }),
    ]);
    const profiles = profRes.ok ? await profRes.json() : [];
    const fatture = fatRes.ok ? await fatRes.json() : [];
    const prof = profiles[0];
    const f = fatture[0];

    if (!f) return res.status(404).json({ error: 'Fattura non trovata' });
    if (!prof?.sts_api_username || !prof?.sts_api_password) {
      return res.status(400).json({ error: 'Collega un intermediario Sistema TS in Impostazioni → Dati fiscali.' });
    }
    if (!prof?.sts_erogatore_registrato) {
      return res.status(400).json({ error: 'Registrati prima come erogatore Sistema TS (pulsante in Impostazioni → Dati fiscali).' });
    }
    if (!f.codice_fiscale_paziente) {
      return res.status(400).json({ error: 'Codice fiscale del paziente mancante su questa fattura — necessario per l\'invio al Sistema TS.' });
    }
    if (!f.numero_fattura || !f.data_fattura || !(parseFloat(f.importo) > 0)) {
      return res.status(400).json({ error: 'Dati fattura incompleti (numero, data o importo)' });
    }

    const basicAuth = Buffer.from(`${prof.sts_api_username}:${prof.sts_api_password}`).toString('base64');
    const importo = Math.round(parseFloat(f.importo) * 100) / 100;
    const voceSpesa = { tipoSpesa: 'SP', importo };
    if (f.natura_iva) voceSpesa.naturaIVA = f.natura_iva;
    else voceSpesa.aliquotaIVA = Number(f.aliquota_iva) || 0;

    const body = {
      operazione: 'INS',
      partitaIvaErogatore: String(prof.fiscal_partita_iva || '').replace(/\D/g, ''),
      tipoDocumento: 'F',
      numeroDocumento: String(f.numero_fattura),
      dataDocumento: f.data_fattura,
      codiceFiscaleCittadino: String(f.codice_fiscale_paziente).toUpperCase(),
      vociSpesa: [voceSpesa],
    };

    const stsRes = await fetch(`${STS_API_BASE}/documenti-spesa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${basicAuth}` },
      body: JSON.stringify(body),
    });
    let stsBody = null;
    try { stsBody = await stsRes.json(); } catch { /* risposta non JSON */ }

    if (!stsRes.ok) {
      if (stsRes.status === 401) return res.status(400).json({ error: 'Credenziali intermediario Sistema TS non valide.' });
      return res.status(502).json({ error: 'Invio Sistema TS fallito: ' + (stsBody?.message || stsBody?.error || stsRes.status) });
    }

    const stato = stsBody?.statoSts || 'ERRO';
    await fetch(`${SUPABASE_URL}/rest/v1/fatture?id=eq.${fatturaId}`, {
      method: 'PATCH',
      headers: { ...sbHeaders, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        sts_stato: stato,
        sts_protocollo: stsBody?.protocolloSts || null,
        sts_messaggio: stsBody?.messaggioSts || null,
        sts_inviato_at: new Date().toISOString(),
      }),
    });

    if (stato === 'ERRO') {
      return res.status(502).json({ error: 'Sistema TS ha rifiutato l\'invio: ' + (stsBody?.messaggioSts || 'errore non specificato') });
    }

    return res.status(200).json({ ok: true, stato, protocollo: stsBody?.protocolloSts || null });
  } catch (e) {
    return res.status(500).json({ error: 'Errore interno: ' + e.message });
  }
}
