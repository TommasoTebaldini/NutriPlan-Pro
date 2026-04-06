// api/calendar.js — NutriPlan Pro
// Serves a live iCalendar (ICS) feed for a user's agenda events stored in Supabase.
// Subscribe in any calendar app via: webcal://YOUR_DOMAIN/api/calendar?uid=USER_UUID
// The calendar app will auto-refresh this feed, keeping all devices in sync.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hvdwqowkhutfsdpiubxe.supabase.co';
// Use SUPABASE_SERVICE_KEY (server-side, bypasses RLS) — required for this endpoint.
// SUPABASE_ANON_KEY will not work here because RLS restricts reads to authenticated
// users only; set SUPABASE_SERVICE_KEY in your Vercel project settings.
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

const TIPO_LABELS = {
  visita: 'Prima Visita',
  controllo: 'Controllo/Follow-up',
  reminder: 'Promemoria',
  urgente: 'URGENTE',
};

// Validate UUID v4 format
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = async (req, res) => {
  if (!SUPABASE_KEY) {
    res.status(500).send('Server configuration error: SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY must be set');
    return;
  }

  const { uid } = req.query;

  if (!uid || !UUID_RE.test(uid)) {
    res.status(400).send('Missing or invalid uid parameter');
    return;
  }

  try {
    const apiRes = await fetch(
      `${SUPABASE_URL}/rest/v1/agenda_events?user_id=eq.${encodeURIComponent(uid)}&select=*&order=data.asc,ora.asc`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!apiRes.ok) {
      res.status(502).send('Error fetching calendar data');
      return;
    }

    const events = await apiRes.json();
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
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H\r\n',
    'X-PUBLISHED-TTL:PT1H\r\n',
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

    parts.push('BEGIN:VEVENT\r\n');
    parts.push(foldLine('UID:' + (ev.id || `ev_${ev.created || Date.now()}`) + '@nutriplan-pro') + '\r\n');
    parts.push('DTSTAMP:' + dtstamp + '\r\n');
    parts.push('DTSTART;TZID=Europe/Rome:' + dtstart + '\r\n');
    parts.push('DTEND;TZID=Europe/Rome:' + dtend + '\r\n');
    parts.push(foldLine('SUMMARY:' + summary) + '\r\n');
    if (desc) parts.push(foldLine('DESCRIPTION:' + desc) + '\r\n');
    if (ev.tipo === 'urgente') parts.push('PRIORITY:1\r\n');
    parts.push('END:VEVENT\r\n');
  });

  parts.push('END:VCALENDAR');
  return parts.join('');
}
