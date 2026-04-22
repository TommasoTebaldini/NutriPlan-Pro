// api/calendar.js — NutriPlan Pro
// Serves a live iCalendar (ICS) feed for a user's agenda events stored in Supabase.
// Subscribe in any calendar app via: webcal://YOUR_DOMAIN/api/calendar?uid=USER_UUID&token=HMAC_TOKEN
// The token is obtained from /api/calendar-token (requires login).
// The calendar app will auto-refresh this feed, keeping all devices in sync.

import crypto from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hvdwqowkhutfsdpiubxe.supabase.co';
// Prefer SUPABASE_SERVICE_KEY (bypasses RLS) for direct table access.
// When it is not configured, fall back to SUPABASE_ANON_KEY and call the
// get_user_agenda_events() SECURITY DEFINER RPC function instead, which
// enforces the user_id filter server-side and is safe to invoke with the
// public anon key.
// The anon key is public (also hardcoded in js/utils.js) so it is safe to
// embed here as a fallback when the Vercel environment variable is not set.
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2ZHdxb3draHV0ZnNkcGl1YnhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3OTU0ODMsImV4cCI6MjA5MDM3MTQ4M30.HenM_wKdcrSVmQ2NyHsg0r9HfQDgcLgb2q1EAIMVcfs';

// When set, calendar URLs must include ?token=HMAC-SHA256(uid, CALENDAR_SECRET).
// Without this env var the feed accepts the bare uid (legacy / backward compat).
// Set CALENDAR_SECRET in the Vercel dashboard to enable token verification.
const CALENDAR_SECRET = process.env.CALENDAR_SECRET || '';

function deriveCalendarToken(uid) {
  return crypto.createHmac('sha256', CALENDAR_SECRET).update(uid).digest('hex');
}

function verifyCalendarToken(uid, token) {
  if (!CALENDAR_SECRET) return true; // secret not configured — skip verification
  if (!token) return false;
  const expected = deriveCalendarToken(uid);
  // Use timingSafeEqual to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

const TIPO_LABELS = {
  visita: 'Prima Visita',
  controllo: 'Controllo/Follow-up',
  reminder: 'Promemoria',
  urgente: 'URGENTE',
};

// Validate UUID v4 format
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (!SUPABASE_SERVICE_KEY && !SUPABASE_ANON_KEY) {
    console.error('calendar.js: SUPABASE_ANON_KEY is empty. Check the Vercel environment variables and ensure the get_user_agenda_events SQL migration has been applied.');
    res.status(500).send('Server configuration error: Supabase key not configured');
    return;
  }

  const { uid, token } = req.query;

  if (!uid || !UUID_RE.test(uid)) {
    res.status(400).send('Missing or invalid uid parameter');
    return;
  }

  // Token verification: when CALENDAR_SECRET is configured, the ?token=HMAC
  // parameter is required. Without it anyone knowing a user UUID could read
  // their full appointment calendar (including patient names).
  if (!verifyCalendarToken(uid, token)) {
    res.status(401).send('Invalid or missing calendar token. Regenerate your calendar link from the Agenda page.');
    return;
  }

  try {
    let events;
    if (SUPABASE_SERVICE_KEY) {
      // Service key available — query the table directly (bypasses RLS).
      const apiRes = await fetch(
        `${SUPABASE_URL}/rest/v1/agenda_events?user_id=eq.${encodeURIComponent(uid)}&select=*&order=data.asc,ora.asc`,
        {
          headers: {
            apikey: SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );
      if (!apiRes.ok) {
        res.status(502).send('Error fetching calendar data');
        return;
      }
      events = await apiRes.json();
    } else {
      // No service key — call the SECURITY DEFINER RPC function with the
      // anon key.  The function enforces the user_id filter internally.
      const rpcRes = await fetch(
        `${SUPABASE_URL}/rest/v1/rpc/get_user_agenda_events`,
        {
          method: 'POST',
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ p_user_id: uid }),
        }
      );
      if (!rpcRes.ok) {
        res.status(502).send('Error fetching calendar data');
        return;
      }
      events = await rpcRes.json();
    }
    const ics = generateICS(events);

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="nutriplan-agenda.ics"');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(ics);
  } catch (e) {
    console.error('calendar.js error:', e);
    res.status(500).send('Internal server error');
  }
};

function generateICS(events) {
  const pad = (n) => String(n).padStart(2, '0');
  const now = new Date();
  const dtstamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(
    now.getUTCDate()
  )}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

  function escIcal(s) {
    return (s || '')
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n');
  }

  function toLocalICalDate(dateStr, timeStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const [h, min] = (timeStr || '09:00').split(':').map(Number);
    return `${y}${pad(m)}${pad(d)}T${pad(h)}${pad(min)}00`;
  }

  function foldLine(line) {
    let result = '';
    let current = '';
    let currentBytes = 0;
    for (const ch of line) {
      const cp = ch.codePointAt(0);
      const chBytes = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
      if (currentBytes + chBytes > 75) {
        result += current + '\r\n ';
        current = ch;
        currentBytes = 1 + chBytes;
      } else {
        current += ch;
        currentBytes += chBytes;
      }
    }
    return result + current;
  }

  const parts = [
    'BEGIN:VCALENDAR\r\n',
    'VERSION:2.0\r\n',
    'PRODID:-//NutriPlan Pro//Agenda//IT\r\n',
    'CALSCALE:GREGORIAN\r\n',
    'METHOD:PUBLISH\r\n',
    'X-WR-CALNAME:NutriPlan Pro Agenda\r\n',
    'X-WR-TIMEZONE:Europe/Rome\r\n',
    'REFRESH-INTERVAL;VALUE=DURATION:PT5M\r\n',
    'X-PUBLISHED-TTL:PT5M\r\n',
    // VTIMEZONE component required by RFC 5545 when TZID is referenced in events.
    // Without it, some calendar clients (Apple Calendar, Outlook) may display wrong
    // times or silently discard events.
    'BEGIN:VTIMEZONE\r\n',
    'TZID:Europe/Rome\r\n',
    'BEGIN:DAYLIGHT\r\n',
    'TZOFFSETFROM:+0100\r\n',
    'TZOFFSETTO:+0200\r\n',
    'TZNAME:CEST\r\n',
    'DTSTART:19700329T020000\r\n',
    'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3\r\n',
    'END:DAYLIGHT\r\n',
    'BEGIN:STANDARD\r\n',
    'TZOFFSETFROM:+0200\r\n',
    'TZOFFSETTO:+0100\r\n',
    'TZNAME:CET\r\n',
    'DTSTART:19701025T030000\r\n',
    'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10\r\n',
    'END:STANDARD\r\n',
    'END:VTIMEZONE\r\n',
  ];

  (events || []).forEach((ev) => {
    if (!ev.data) return;

    const dtstart = toLocalICalDate(ev.data, ev.ora);
    const durata = parseInt(ev.durata) || 60;
    const [y, m, d] = ev.data.split('-').map(Number);
    const [h, min] = (ev.ora || '09:00').split(':').map(Number);
    const endDate = new Date(y, m - 1, d, h, min + durata);
    const dtend = `${endDate.getFullYear()}${pad(endDate.getMonth() + 1)}${pad(
      endDate.getDate()
    )}T${pad(endDate.getHours())}${pad(endDate.getMinutes())}00`;

    const summary = escIcal(ev.paziente || ev.titolo || 'Appuntamento');
    const desc = escIcal(
      [TIPO_LABELS[ev.tipo] || ev.tipo, ev.note].filter(Boolean).join(' - ')
    );

    // LAST-MODIFIED: use the event's created/updated timestamp so that
    // external calendar clients (Apple Calendar, Outlook, Google) can detect
    // when an event has changed and refresh their local copy.
    const lastMod = ev.updated_at || ev.created;
    let lastModStr = dtstamp; // fallback to feed generation time
    if (lastMod) {
      const lm = new Date(lastMod);
      if (!isNaN(lm)) {
        lastModStr = `${lm.getUTCFullYear()}${pad(lm.getUTCMonth() + 1)}${pad(lm.getUTCDate())}T${pad(lm.getUTCHours())}${pad(lm.getUTCMinutes())}${pad(lm.getUTCSeconds())}Z`;
      }
    }

    parts.push('BEGIN:VEVENT\r\n');
    parts.push(foldLine('UID:' + (ev.id || `ev_${ev.created || Date.now()}`) + '@nutriplan-pro') + '\r\n');
    parts.push('DTSTAMP:' + dtstamp + '\r\n');
    parts.push('LAST-MODIFIED:' + lastModStr + '\r\n');
    parts.push('SEQUENCE:0\r\n');
    parts.push('DTSTART;TZID=Europe/Rome:' + dtstart + '\r\n');
    parts.push('DTEND;TZID=Europe/Rome:' + dtend + '\r\n');
    parts.push(foldLine('SUMMARY:' + summary) + '\r\n');
    if (desc) parts.push(foldLine('DESCRIPTION:' + desc) + '\r\n');
    if (ev.tipo === 'urgente') parts.push('PRIORITY:1\r\n');
    parts.push('END:VEVENT\r\n');
  });

  parts.push('END:VCALENDAR\r\n');
  return parts.join('');
}
