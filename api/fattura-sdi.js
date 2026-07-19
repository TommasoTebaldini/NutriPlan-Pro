// api/fattura-sdi.js — Invio fattura elettronica allo SDI tramite l'API di
// Fatture in Cloud (l'intermediario accreditato: è FIC a trasmettere allo SDI,
// non noi). Il dietista collega il proprio account inserendo API token e
// Company ID in Impostazioni → Dati fiscali (colonne fic_api_token /
// fic_company_id su profiles, SEZIONE 32 di supabase_setup.sql).
//
// Flusso: verifica JWT Supabase → legge token FIC dal profilo del chiamante
// (service role, mai esposto ad altri utenti) → crea il documento su FIC
// (prezzi lordi, IVA da regime) → POST e_invoice/send = trasmissione SDI.
// La numerazione la assegna FIC (evita conflitti con la numerazione locale:
// il numero interno viene riportato nell'oggetto del documento).

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hvdwqowkhutfsdpiubxe.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FIC_BASE = 'https://api-v2.fattureincloud.it';

async function verifySupabaseToken(token) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !token) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user?.id ? user : null;
}

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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const user = await verifySupabaseToken(token);
    if (!user) return res.status(401).json({ error: 'Non autorizzato' });
    if (!SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Configurazione server incompleta (SUPABASE_SERVICE_ROLE_KEY)' });

    const f = req.body?.fattura;
    if (!f || !f.data_fattura || !(parseFloat(f.importo) > 0) || !f.patient_name) {
      return res.status(400).json({ error: 'Dati fattura incompleti' });
    }

    // Profilo del dietista: regime fiscale + credenziali Fatture in Cloud
    const profRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=fiscal_regime,fic_api_token,fic_company_id`,
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

    // Aliquota IVA: 22% per il regime ordinario; per il forfettario serve
    // l'aliquota 0 con natura N2.2 — cercata tra i vat_types dell'azienda FIC.
    const vt = await ficFetch(ficToken, `/c/${cid}/info/vat_types`);
    if (!vt.ok) {
      return res.status(vt.status === 401 ? 400 : 502).json({
        error: vt.status === 401
          ? 'Token Fatture in Cloud non valido o scaduto'
          : 'Errore Fatture in Cloud (vat_types): ' + (vt.body?.error?.message || vt.status),
      });
    }
    const vatTypes = vt.body?.data || [];
    let vat = null;
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
    // Marca da bollo virtuale: obbligatoria in regime forfettario sopra 77,47€
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
      // Documento creato ma invio SDI fallito (es. dati e-invoice incompleti
      // sull'account FIC): riportare entrambe le cose, il dietista può
      // completare/inviare direttamente da Fatture in Cloud.
      return res.status(502).json({
        error: 'Documento creato su Fatture in Cloud (id ' + docId + ') ma invio SDI fallito: ' + (sent.body?.error?.message || sent.status) + '. Completa l\'invio dal portale FIC.',
        fic_document_id: docId,
      });
    }

    return res.status(200).json({ ok: true, fic_document_id: docId, ei_status: sent.body?.data || null });
  } catch (e) {
    return res.status(500).json({ error: 'Errore interno: ' + e.message });
  }
}
