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
//     modes,       // optional — array of print modes to capture (default: ['compact'])
//                       // options: 'compact', 'simple', 'alldays'
//   })
//
// Storage path: <patient_id>/<table>_<recordId>_<mode>.png
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
    const printMode = opts.printMode || 'compact';
    
    // Set flag to prevent print dialog from opening (functions check this flag)
    window._capturingPrint = true;
    
    // Populate the appropriate print area before capturing
    if (typeof window.stampaCompatta === 'function' && printMode === 'compact') {
      window.stampaCompatta();
    } else if (typeof window.stampaSemplice === 'function' && printMode === 'simple') {
      window.stampaSemplice();
    } else if (typeof window.stampaPDF === 'function' && printMode === 'alldays') {
      window.stampaPDF();
    }
    
    // Wait longer than the setTimeout(400) in stampa functions
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Clear flag
    window._capturingPrint = false;
    
    // Get the appropriate print area element
    let target;
    if (printMode === 'compact') {
      target = document.getElementById('compact-print-area') || container || document.body;
    } else if (printMode === 'simple') {
      target = document.getElementById('simple-print-area') || container || document.body;
    } else if (printMode === 'alldays') {
      target = document.getElementById('pdf-alldays-print-area') || container || document.body;
    } else {
      target = container || document.body;
    }
    
    // Make sure the print area is visible for capture
    const originalDisplay = target.style.display;
    target.style.display = 'block';
    
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
        // Set the print mode for the captured image
        doc.body.setAttribute('data-print-mode', printMode);
        // Ensure print area is visible in cloned document
        const printAreaId = printMode === 'compact' ? 'compact-print-area' : 
                           printMode === 'simple' ? 'simple-print-area' : 'pdf-alldays-print-area';
        const printArea = doc.getElementById(printAreaId);
        if (printArea) printArea.style.display = 'block';
        if (typeof opts.onclone === 'function') opts.onclone(doc);
      },
    });
    
    // Restore original display
    target.style.display = originalDisplay;
    
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
    const modes = opts.modes || ['compact']; // Default to compact mode

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

    try {
      const urls = {};
      for (const mode of modes) {
        const path = `${patientId}/${table}_${recordId}_${mode}.png`;
        const blob = await renderToBlob(opts.container, { ...opts, printMode: mode });
        const url = await uploadBlob(blob, path);
        if (!url) throw new Error(`URL non disponibile per mode: ${mode}`);
        urls[mode] = url;
      }

      // Update database with all URLs
      const updateData = {};
      if (urls.compact) updateData.print_image_url_compact = urls.compact;
      if (urls.simple) updateData.print_image_url_simple = urls.simple;
      if (urls.alldays) updateData.print_image_url_alldays = urls.alldays;
      // Set default to compact if not specified
      if (!updateData.print_image_url) updateData.print_image_url = urls.compact;

      const { error } = await sb
        .from(table)
        .update(updateData)
        .eq('id', recordId);
      if (error) {
        console.warn(`print-capture: ${table}.update failed`, error.message);
        if (window.toast && opts.silent !== true) toast('⚠️ Immagini caricate ma update fallito: ' + error.message, 'err');
        return urls.compact;
      }

      if (window.toast && opts.silent !== true) toast('🖼️ Immagini documento salvate', 'ok');
      return urls.compact;
    } catch (e) {
      console.error('print-capture failed:', e);
      if (window.toast && opts.silent !== true) toast('❌ Salvataggio immagini fallito: ' + (e.message || e), 'err');
      return null;
    }
  }

  window.capturePrintAndSave = capturePrintAndSave;
  window.getPatientIdForCartella = getPatientIdForCartella;
})();
