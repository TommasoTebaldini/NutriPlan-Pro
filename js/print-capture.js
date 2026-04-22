// ═══════════════════════════════════════════════════════════════════
// PRINT CAPTURE — render the on-screen "print sheet" to PNG, upload it
// to the Supabase Storage bucket `document-prints` and store the public
// URL in print_image_url on the source-table row (piani / ncpt /
// bia_records / schede_valutazione / note_specialistiche).
//
// Public API:
//   await capturePrintAndSave({
//     table,       // required — source table name
//     recordId,    // required — uuid of the row to update
//     cartellaId,  // required — used to look up patient_id
//     container,   // optional DOM element to capture (default: body)
//     silent,      // optional — suppress success toast
//     onclone,     // optional html2canvas onclone hook
//   })
//
// Storage path: <patient_id>/<table>_<record_id>.png
//
// Requires `sb` (Supabase client) from js/utils.js.
// ═══════════════════════════════════════════════════════════════════
(function () {
  const HTML2CANVAS_SRC = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
  const BUCKET = 'document-prints';
  let html2canvasPromise = null;

  function loadHtml2Canvas() {
    if (window.html2canvas) return Promise.resolve(window.html2canvas);
    if (html2canvasPromise) return html2canvasPromise;
    html2canvasPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = HTML2CANVAS_SRC;
      s.async = true;
      s.onload = () => resolve(window.html2canvas);
      s.onerror = () => reject(new Error('Impossibile caricare html2canvas'));
      document.head.appendChild(s);
    });
    return html2canvasPromise;
  }

  function isUuid(s) {
    return typeof s === 'string'
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
  }

  // Resolve the patient_id linked to the given cartella.
  async function getPatientIdForCartella(cartellaId) {
    if (!cartellaId || typeof sb === 'undefined') return null;
    try {
      const { data, error } = await sb
        .from('patient_dietitian')
        .select('patient_id')
        .eq('cartella_id', cartellaId)
        .limit(1)
        .maybeSingle();
      if (error) {
        console.warn('print-capture: patient_dietitian lookup failed', error.message);
        return null;
      }
      return data?.patient_id || null;
    } catch (e) {
      console.warn('print-capture: patient_dietitian lookup threw', e);
      return null;
    }
  }

  async function renderToBlob(container, opts = {}) {
    const html2canvas = await loadHtml2Canvas();
    const target = container || document.body;
    const canvas = await html2canvas(target, {
      backgroundColor: '#ffffff',
      scale: opts.scale || 1.5,
      useCORS: true,
      logging: false,
      windowWidth: opts.windowWidth || Math.max(1200, target.scrollWidth || 1200),
      onclone: (doc) => {
        ['sidebar', 'sb-overlay', 'topbar'].forEach((id) => {
          const el = doc.getElementById(id);
          if (el) el.style.display = 'none';
        });
        doc.querySelectorAll('.no-print').forEach((el) => { el.style.display = 'none'; });
        if (doc.querySelector('[data-print-mode], #ped-compact-print-area, #pan-compact-print-area')) {
          doc.body.setAttribute('data-print-mode', 'compact');
        }
        if (typeof opts.onclone === 'function') opts.onclone(doc);
      },
    });
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Canvas vuoto'))),
        'image/png'
      );
    });
  }

  async function uploadBlob(blob, path) {
    const { error } = await sb.storage.from(BUCKET).upload(path, blob, {
      contentType: 'image/png',
      upsert: true,
      cacheControl: '3600',
    });
    if (error) throw error;
    const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
    return data?.publicUrl || null;
  }

  async function capturePrintAndSave(opts = {}) {
    if (typeof sb === 'undefined') return null;

    const table = opts.table;
    const recordId = opts.recordId;
    const cartellaId = opts.cartellaId || window.currentCartellaId || null;

    if (!table || !isUuid(recordId)) {
      console.warn('print-capture: missing table or recordId', { table, recordId });
      return null;
    }
    if (!cartellaId) {
      if (window.toast && opts.silent !== true) toast('⚠️ Cartella mancante — immagine non salvata', 'err');
      return null;
    }
    const patientId = await getPatientIdForCartella(cartellaId);
    if (!patientId) {
      if (window.toast && opts.silent !== true) toast('⚠️ Nessun paziente collegato a questa cartella', 'err');
      return null;
    }

    const path = `${patientId}/${table}_${recordId}.png`;
    try {
      const blob = await renderToBlob(opts.container, opts);
      const url = await uploadBlob(blob, path);
      if (!url) throw new Error('URL non disponibile');

      const { error } = await sb
        .from(table)
        .update({ print_image_url: url })
        .eq('id', recordId);
      if (error) {
        console.warn(`print-capture: ${table}.update failed`, error.message);
        if (window.toast && opts.silent !== true) toast('⚠️ Immagine caricata ma update fallito: ' + error.message, 'err');
        return url;
      }

      if (window.toast && opts.silent !== true) toast('🖼️ Immagine documento salvata', 'ok');
      return url;
    } catch (e) {
      console.error('print-capture failed:', e);
      if (window.toast && opts.silent !== true) toast('❌ Salvataggio immagine fallito: ' + (e.message || e), 'err');
      return null;
    }
  }

  window.capturePrintAndSave = capturePrintAndSave;
  window.getPatientIdForCartella = getPatientIdForCartella;
})();
