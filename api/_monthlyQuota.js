// api/_monthlyQuota.js — quota mensile DURATURA per utente (vedi
// supabase_setup.sql, SEZIONE 38 "usage_counters"). Il prefisso `_` fa sì che
// Vercel non tratti questo file come una serverless function a sé.
//
// api/_rateLimit.js protegge dagli abusi al minuto ma non da un uso sostenuto
// tutto il mese: qui il contatore vive in Postgres (usage_counters),
// incrementato atomicamente via la RPC increment_usage_and_check() con il
// JWT dell'utente stesso (già verificato dal chiamante prima di arrivare
// qui) — mai la service role key, per restare a privilegio minimo.
//
// Fail-open per design: se Supabase non risponde, non blocchiamo un utente
// pagante per un problema nostro (stessa filosofia di _rateLimit.js).

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hvdwqowkhutfsdpiubxe.supabase.co';

/**
 * @param {string} userToken  JWT dell'utente già verificato dal chiamante
 * @param {string} userId     user.id corrispondente al token
 * @param {string} scope      es. 'ai_calls_claude'
 * @param {number} max        tetto mensile
 * @returns {Promise<boolean>} true se entro quota, false se superata
 */
export async function checkMonthlyQuota(userToken, userId, scope, max) {
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!anonKey) return true; // non configurato: non bloccare (vedi nota fail-open sopra)
  const period = new Date().toISOString().slice(0, 7); // 'YYYY-MM', UTC
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/increment_usage_and_check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ p_user_id: userId, p_scope: scope, p_period: period, p_max: max }),
    });
    if (!res.ok) return true; // RPC non ancora deployata (SEZIONE 38 non eseguita) o errore infra: fail-open
    return await res.json();
  } catch {
    return true;
  }
}
