// cron-scheduler.js — sostituto in-process di Vercel Cron per il runtime
// reale (Express su Replit, vedi replit.md: "vercel.json is kept for
// reference but is not used at runtime"). vercel.json programma
// /api/cron?job=daily-all e /api/cron?job=fhir-sync tramite Vercel Cron, che
// su Replit non esiste: senza questo scheduler quei due job — promemoria
// appuntamenti, pagamenti scaduti, pazienti inattivi, check-in percorsi,
// sincronizzazione FHIR — non partono MAI da soli in produzione.
//
// Non reimplementa la logica dei job: importa lo stesso handler di
// api/cron.js e lo invoca con una richiesta sintetica identica a quella che
// manderebbe Vercel Cron (stesso header Authorization: Bearer CRON_SECRET),
// così il comportamento resta a prova di divergenza tra i due path.
//
// Orari identici a vercel.json (entrambi in UTC, come Vercel Cron):
//   daily-all -> 08:00 UTC, fhir-sync -> 09:00 UTC.
//
// Disattivabile con ENABLE_CRON=false (utile per dev/test locali dove non si
// vuole che questi job girino da soli). Se CRON_SECRET non è configurata, lo
// scheduler resta spento invece di girare senza autenticazione: i job
// toccano dati di pagamento/clinici, meglio non eseguirli affatto che
// eseguirli con un handler che dipende da un secret assente.
import cron from 'node-cron';

async function runJob(jobName) {
  const cronHandler = (await import('./api/cron.js')).default;
  const req = {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    query: { job: jobName },
  };
  let statusCode = 200;
  const res = {
    status(code) { statusCode = code; return this; },
    json(body) {
      if (statusCode >= 400) {
        console.error(`[cron-scheduler] job=${jobName} HTTP ${statusCode}:`, body);
      } else {
        console.log(`[cron-scheduler] job=${jobName} ok:`, JSON.stringify(body));
      }
    },
  };
  try {
    await cronHandler(req, res);
  } catch (err) {
    // withErrorLogging in api/_errorLog.js già cattura/logga a monte: questo
    // try/catch è solo per non far morire il processo se qualcosa sfugge.
    console.error(`[cron-scheduler] job=${jobName} threw:`, err);
  }
}

export function startCronScheduler() {
  if (process.env.ENABLE_CRON === 'false') {
    console.log('[cron-scheduler] disabilitato (ENABLE_CRON=false)');
    return;
  }
  if (!process.env.CRON_SECRET) {
    console.warn('[cron-scheduler] CRON_SECRET non configurata: scheduler NON avviato (promemoria appuntamenti/pagamenti/pazienti inattivi/FHIR non partiranno automaticamente finché non la imposti).');
    return;
  }
  cron.schedule('0 8 * * *', () => runJob('daily-all'), { timezone: 'UTC' });
  cron.schedule('0 9 * * *', () => runJob('fhir-sync'), { timezone: 'UTC' });
  console.log('[cron-scheduler] avviato: daily-all alle 08:00 UTC, fhir-sync alle 09:00 UTC');
}
