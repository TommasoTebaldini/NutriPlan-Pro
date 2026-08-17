// api/fatture.js — endpoint fiscali del dietista, consolidati in un solo
// file (erano 3 file separati: fattura-sdi.js, fattura-sts.js,
// sts-registra-erogatore.js) per restare entro il limite di 12 Serverless
// Function per deployment del piano Vercel Hobby. Instradamento via
// ?action=sdi|sts|registra-erogatore — nessuna logica interna modificata
// rispetto ai file originali, solo spostata da "export default handler" a
// una funzione dedicata per azione.

import { withErrorLogging, logServerError } from './_errorLog.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hvdwqowkhutfsdpiubxe.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FIC_BASE = 'https://api-v2.fattureincloud.it';
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

// ═══════════════════════════════════════════════════════════════════════════
// action=sdi — Invio fattura elettronica allo SDI tramite l'API di Fatture in
// Cloud (l'intermediario accreditato: è FIC a trasmettere allo SDI, non noi).
// Il dietista collega il proprio account inserendo API token e Company ID in
// Impostazioni → Dati fiscali (colonne fic_api_token/fic_company_id su
// profiles, SEZIONE 32 di supabase_setup.sql).
// ═══════════════════════════════════════════════════════════════════════════
async function ficFetch(ficToken, path, options = {}) {
  const res = await fetch(`${FIC_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${ficToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  let body = null;
  try { body = await res.json(); } catch { /* risposta non JSON */ }
  return { ok: res.ok, status: res.status, body };
}

async function handleSdi(req, res, user) {
  const f = req.body?.fattura;
  if (!f || !f.data_fattura || !(parseFloat(f.importo) > 0) || !f.patient_name) {
    return res.status(400).json({ error: 'Dati fattura incompleti' });
  }

  const profRes = await fetch(
    `${SUPABASE_URL}/rest/v1/dietitian_credentials?id=eq.${user.id}&select=fiscal_regime,fic_api_token,fic_company_id`,
    { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
  );
  const profiles = profRes.ok ? await profRes.json() : [];
  const prof = profiles[0];
  if (!prof?.fic_api_token || !prof?.fic_company_id) {
    return res.status(400).json({ error: 'Collega Fatture in Cloud in Impostazioni → Dati fiscali (API token e Company ID)' });
  }
  const cid = encodeURIComponent(String(prof.fic_company_id).trim());
  const ficToken = String(prof.fic_api_token).trim();
  const regime = prof.fiscal_regime === 'RF01' ? 'RF01' : 'RF19';

  const vt = await ficFetch(ficToken, `/c/${cid}/info/vat_types`);
  if (!vt.ok) {
    return res.status(vt.status === 401 ? 400 : 502).json({
      error: vt.status === 401
        ? 'Token Fatture in Cloud non valido o scaduto'
        : 'Errore Fatture in Cloud (vat_types): ' + (vt.body?.error?.message || vt.status),
    });
  }
  const vatTypes = vt.body?.data || [];
  let vat;
  if (regime === 'RF01') {
    vat = vatTypes.find(v => Number(v.value) === 22 && !v.is_disabled) || vatTypes.find(v => Number(v.value) === 22);
  } else {
    const zero = vatTypes.filter(v => Number(v.value) === 0);
    vat = zero.find(v => /N2\.2/i.test(`${v.ei_type || ''} ${v.ei_description || ''} ${v.description || ''} ${v.notes || ''}`)) || zero[0];
  }
  if (!vat) {
    return res.status(400).json({ error: regime === 'RF01' ? 'Nessuna aliquota IVA 22% trovata sul tuo account FIC' : 'Nessuna aliquota 0% (natura N2.2) trovata sul tuo account FIC: creala in Impostazioni FIC → Aliquote IVA' });
  }

  const importo = Math.round(parseFloat(f.importo) * 100) / 100;
  const docData = {
    type: 'invoice',
    entity: {
      name: String(f.patient_name).slice(0, 120),
      tax_code: f.codice_fiscale_paziente || undefined,
      address_street: f.indirizzo_paziente || undefined,
      address_postal_code: f.cap_paziente || undefined,
      address_city: f.comune_paziente || undefined,
      address_province: f.provincia_paziente || undefined,
      country: 'Italia',
    },
    date: f.data_fattura,
    subject: `Rif. interno ${f.numero_fattura || ''}`.trim(),
    use_gross_prices: true,
    items_list: [{
      name: f.tipo_visita || 'Prestazione dietistica',
      qty: 1,
      gross_price: importo,
      vat: { id: vat.id },
    }],
    e_invoice: true,
    ei_data: { payment_method: 'MP05' },
  };
  if (regime === 'RF19' && importo > 77.47) docData.stamp_duty = 2;

  const created = await ficFetch(ficToken, `/c/${cid}/issued_documents`, {
    method: 'POST',
    body: JSON.stringify({ data: docData }),
  });
  if (!created.ok) {
    return res.status(502).json({ error: 'Creazione documento su FIC fallita: ' + (created.body?.error?.message || JSON.stringify(created.body?.error?.validation_result || created.status)) });
  }
  const docId = created.body?.data?.id;
  if (!docId) return res.status(502).json({ error: 'FIC non ha restituito l\'id del documento' });

  const sent = await ficFetch(ficToken, `/c/${cid}/issued_documents/${docId}/e_invoice/send`, {
    method: 'POST',
    body: JSON.stringify({ data: {} }),
  });
  if (!sent.ok) {
    return res.status(502).json({
      error: 'Documento creato su Fatture in Cloud (id ' + docId + ') ma invio SDI fallito: ' + (sent.body?.error?.message || sent.status) + '. Completa l\'invio dal portale FIC.',
      fic_document_id: docId,
    });
  }

  return res.status(200).json({ ok: true, fic_document_id: docId, ei_status: sent.body?.data || null });
}

// ═══════════════════════════════════════════════════════════════════════════
// action=sts — Invio di una fattura al Sistema Tessera Sanitaria (STS)
// tramite l'intermediario accreditato (sistema-ts-api.it / A-Cube).
// tipoSpesa "SP": prestazioni delle professioni sanitarie diverse da medici
// e odontoiatri.
// ═══════════════════════════════════════════════════════════════════════════
async function handleSts(req, res, user) {
  const fatturaId = req.body?.fattura_id;
  if (!fatturaId) return res.status(400).json({ error: 'fattura_id mancante' });

  const sbHeaders = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };

  const [profRes, fatRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/dietitian_credentials?id=eq.${user.id}&select=fiscal_partita_iva,sts_api_username,sts_api_password,sts_erogatore_registrato`, { headers: sbHeaders }),
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
}

// ═══════════════════════════════════════════════════════════════════════════
// action=registra-erogatore — Registrazione una tantum come erogatore
// sanitario presso l'intermediario accreditato per il Sistema TS.
// ═══════════════════════════════════════════════════════════════════════════
async function handleRegistraErogatore(req, res, user) {
  const profRes = await fetch(
    `${SUPABASE_URL}/rest/v1/dietitian_credentials?id=eq.${user.id}&select=fiscal_ragione_sociale,fiscal_codice_fiscale,fiscal_partita_iva,sts_api_username,sts_api_password,sts_username,sts_password,sts_pincode`,
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

  await fetch(`${SUPABASE_URL}/rest/v1/dietitian_credentials?id=eq.${user.id}`, {
    method: 'PATCH',
    headers: {
      apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify({ sts_erogatore_registrato: true }),
  });

  return res.status(200).json({ ok: true });
}

// ═══════════════════════════════════════════════════════════════════════════
async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const user = await verifySupabaseToken(token);
    if (!user) return res.status(401).json({ error: 'Non autorizzato' });
    if (!SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Configurazione server incompleta (SUPABASE_SERVICE_ROLE_KEY)' });

    const action = req.query.action;
    if (action === 'sdi') return await handleSdi(req, res, user);
    if (action === 'sts') return await handleSts(req, res, user);
    if (action === 'registra-erogatore') return await handleRegistraErogatore(req, res, user);
    return res.status(400).json({ error: 'Parametro ?action mancante o sconosciuto (attesi: sdi, sts, registra-erogatore)' });
  } catch (e) {
    await logServerError('fatture', e, req).catch(() => {});
    return res.status(500).json({ error: 'Errore interno: ' + e.message });
  }
}

export default withErrorLogging('fatture', handler);
