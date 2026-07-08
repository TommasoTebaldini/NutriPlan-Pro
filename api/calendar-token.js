// api/calendar-token.js
// Returns a signed HMAC token for the authenticated user's calendar feed URL.
// The token is used by api/calendar.js to verify that the caller is authorised
// to subscribe to a given user's calendar, without requiring interactive login.
//
// Usage: GET /api/calendar-token
//   Authorization: Bearer <supabase-jwt>
// Response: { token: "<hex>", url: "webcal://..." }

import crypto from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hvdwqowkhutfsdpiubxe.supabase.co';
// No hardcoded fallback for the anon key: verifySupabaseToken() below already
// returns null (→ 401) if this is unset, instead of silently using a fixed key.
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// If CALENDAR_SECRET is not set, the calendar feed falls back to uid-only auth
// (legacy behaviour). Set this env var in Vercel to enable token verification.
const CALENDAR_SECRET = process.env.CALENDAR_SECRET || '';

async function verifySupabaseToken(token) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
    },
  });
  if (!res.ok) return null;
  return await res.json();
}

// Derive a deterministic but secret token for a given user ID.
// The token is HMAC-SHA256(uid, CALENDAR_SECRET), hex-encoded.
function deriveCalendarToken(uid) {
  if (!CALENDAR_SECRET) return null;
  return crypto.createHmac('sha256', CALENDAR_SECRET).update(uid).digest('hex');
}

export default async function handler(req, res) {
  // CORS — only used from our own origin
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Require authentication
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Non autorizzato: token mancante.' });
  }
  const bearerToken = authHeader.slice(7);
  const user = await verifySupabaseToken(bearerToken);
  if (!user?.id) {
    return res.status(401).json({ error: 'Non autorizzato: sessione non valida.' });
  }

  const uid = user.id;
  const calToken = deriveCalendarToken(uid);

  // Build calendar URL
  const origin = (req.headers['x-forwarded-proto'] || 'https') + '://' + (req.headers['x-forwarded-host'] || req.headers.host || 'nutriplan-pro.vercel.app');
  let subscribeUrl;
  if (calToken) {
    subscribeUrl = `${origin}/api/calendar?uid=${uid}&token=${calToken}`;
  } else {
    // CALENDAR_SECRET not configured — fall back to uid-only (legacy)
    subscribeUrl = `${origin}/api/calendar?uid=${uid}`;
  }

  return res.status(200).json({
    token: calToken,
    uid,
    url: subscribeUrl,
    webcal: subscribeUrl.replace(/^https?:\/\//, 'webcal://'),
    secured: !!calToken,
  });
};
