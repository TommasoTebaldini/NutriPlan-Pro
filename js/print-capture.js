// ═══════════════════════════════════════════════════════════════════
// PRINT CAPTURE — render the on-screen "print sheet" to PNG(s), upload
// to the Supabase Storage bucket `document-prints` and store the signed
// URL(s) in print_image_url on the source-table row.
//
// Long documents are sliced into A4-portrait pages. Each page is a
// centered, white A4 sheet. Pages are uploaded as
//   <patient_id>/<table>_<recordId>_p<N>.png
// and a JSON array of signed URLs is saved when there are >1 pages.
// Single-page documents keep the legacy plain-string URL for
// backwards-compatibility with existing patient viewers.
//
// Public API:
//   await capturePrintAndSave({ table, recordId, cartellaId,
//                               container, silent, onclone })
//
// Requires `sb` (Supabase client) from js/utils.js.
// ═══════════════════════════════════════════════════════════════════
(function () {
  const HTML2CANVAS_SRC = '/vendor/html2canvas.min.js';
  const BUCKET = 'document-prints';
  // A4 portrait at ~96 DPI: 794 × 1123 px (ratio 1 : 1.4142)
  const A4_RATIO = 297 / 210;            // height / width
  const A4_RENDER_WIDTH = 850;           // px — html2canvas windowWidth
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

  // Hide toasts/notifications on the LIVE DOM while html2canvas works.
  // Returns a restore() callback to undo the changes.
  function hideTransientUI() {
    const selectors = [
      '#toast', '.toast',
      '.notification',
      '[role="status"]', '[role="alert"]',
      '.no-print',
    ];
    const restored = [];
    selectors.forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => {
        restored.push([el, el.style.visibility, el.style.opacity]);
        el.style.visibility = 'hidden';
        el.style.opacity = '0';
      });
    });
    return function restore() {
      restored.forEach(([el, vis, op]) => {
        el.style.visibility = vis || '';
        el.style.opacity = op || '';
      });
    };
  }

  // Render the target into ONE big canvas, then slice into A4-portrait
  // pages. Returns an array of PNG blobs (one per page).
  async function renderToPagedBlobs(container, opts = {}) {
    const html2canvas = await loadHtml2Canvas();
    const target = container || document.body;

    // Hide toast/etc on the live DOM so html2canvas never sees them.
    const restoreUI = hideTransientUI();

    let fullCanvas;
    try {
    fullCanvas = await html2canvas(target, {
      backgroundColor: '#ffffff',
      scale: opts.scale || 1.5,
      useCORS: true,
      logging: false,
      windowWidth: opts.windowWidth || A4_RENDER_WIDTH,
      onclone: (doc) => {
        // Hide app chrome that should never appear in the printed sheet.
        ['sidebar', 'sb-overlay', 'topbar', 'toast'].forEach((id) => {
          const el = doc.getElementById(id);
          if (el) el.style.display = 'none';
        });
        // Hide any toast / notification element regardless of id.
        doc.querySelectorAll(
          '.toast, .notification, [role="status"], [role="alert"], .no-print'
        ).forEach((el) => { el.style.display = 'none'; });
        if (doc.querySelector('[data-print-mode], #ped-compact-print-area, #pan-compact-print-area')) {
          doc.body.setAttribute('data-print-mode', 'compact');
        }
        if (typeof opts.onclone === 'function') opts.onclone(doc);
      },
    });

    // Compute page height that preserves A4 portrait ratio for the
    // captured width.
    const pageWidth  = fullCanvas.width;
    const pageHeight = Math.round(pageWidth * A4_RATIO);
    const totalH    = fullCanvas.height;
    const numPages  = Math.max(1, Math.ceil(totalH / pageHeight));

    const blobs = [];
    for (let i = 0; i < numPages; i++) {
      const sliceY      = i * pageHeight;
      const sliceHeight = Math.min(pageHeight, totalH - sliceY);

      // Build a fresh A4 page with white background.
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width  = pageWidth;
      pageCanvas.height = pageHeight;
      const ctx = pageCanvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, pageWidth, pageHeight);

      // For the LAST page, vertically-center any leftover content so it
      // doesn't sit at the very top with empty space below.
      const offsetY = (i === numPages - 1 && sliceHeight < pageHeight)
        ? Math.round((pageHeight - sliceHeight) / 2)
        : 0;

      ctx.drawImage(
        fullCanvas,
        0, sliceY, pageWidth, sliceHeight,   // src
        0, offsetY, pageWidth, sliceHeight   // dst
      );

      const blob = await new Promise((res, rej) => {
        pageCanvas.toBlob(
          (b) => (b ? res(b) : rej(new Error('Canvas vuoto'))),
          'image/png'
        );
      });
      blobs.push(blob);
    }
    return blobs;
    } finally {
      restoreUI();
    }
  }

  async function uploadPage(blob, path) {
    const { error } = await sb.storage.from(BUCKET).upload(path, blob, {
      contentType: 'image/png',
      upsert: true,
      cacheControl: '3600',
    });
    if (error) throw error;
    const TEN_YEARS = 60 * 60 * 24 * 365 * 10;
    const { data, error: signErr } = await sb.storage
      .from(BUCKET)
      .createSignedUrl(path, TEN_YEARS);
    if (signErr) throw signErr;
    return data?.signedUrl || null;
  }

  // Best-effort cleanup of stale pages from a previous save with more
  // pages (e.g. content shrank). Ignores errors (file may not exist).
  async function cleanupOldPages(folder, table, recordId, fromPageNum) {
    try {
      const { data: list } = await sb.storage.from(BUCKET).list(folder, {
        limit: 100,
        search: `${table}_${recordId}_p`,
      });
      if (!Array.isArray(list)) return;
      const toRemove = list
        .map((f) => f.name)
        .filter((name) => {
          const m = name.match(new RegExp(`^${table}_${recordId}_p(\\d+)\\.png$`));
          return m && parseInt(m[1], 10) >= fromPageNum;
        })
        .map((name) => `${folder}/${name}`);
      if (toRemove.length) await sb.storage.from(BUCKET).remove(toRemove);
    } catch (_) { /* non-fatal */ }
  }

  // Diagnostic helper — call from browser console: testStorage()
  window.testStorage = async function () {
    console.log('=== STORAGE TEST ===');
    if (typeof sb === 'undefined') { console.error('sb not defined'); return; }
    if (!currentUser) { console.error('Not logged in'); return; }
    console.log('User:', currentUser.id);
    try {
      const { data: buckets, error: lbErr } = await sb.storage.listBuckets();
      if (lbErr) console.error('listBuckets error:', lbErr);
      else console.log('Buckets visible:', buckets.map(b => b.name));
    } catch (e) { console.error('listBuckets threw:', e); }
    try {
      const tinyBlob = new Blob([new Uint8Array([137,80,78,71,13,10,26,10])], { type: 'image/png' });
      const path = `${currentUser.id}/__test_${Date.now()}.png`;
      const { data, error } = await sb.storage.from(BUCKET).upload(path, tinyBlob, { upsert: true, contentType: 'image/png' });
      if (error) console.error('Upload FAILED:', error);
      else console.log('Upload OK:', data);
    } catch (e) { console.error('Upload threw:', e); }
  };

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

    try {
      const blobs = await renderToPagedBlobs(opts.container, opts);
      const numPages = blobs.length;

      // Upload all pages → collect signed URLs
      const urls = [];
      for (let i = 0; i < numPages; i++) {
        const path = `${patientId}/${table}_${recordId}_p${i + 1}.png`;
        const url = await uploadPage(blobs[i], path);
        if (!url) throw new Error(`URL pagina ${i + 1} non disponibile`);
        urls.push(url);
      }

      // Remove stale pages from a previous (longer) save
      await cleanupOldPages(patientId, table, recordId, numPages + 1);

      // Backwards-compatible storage:
      //   1 page  → plain URL string
      //   N pages → JSON array string
      const value = numPages === 1 ? urls[0] : JSON.stringify(urls);

      const { error } = await sb
        .from(table)
        .update({ print_image_url: value })
        .eq('id', recordId);
      if (error) {
        console.warn(`print-capture: ${table}.update failed`, error.message);
        if (window.toast && opts.silent !== true) toast('⚠️ Immagine caricata ma update fallito: ' + error.message, 'err');
        return value;
      }

      if (window.toast && opts.silent !== true) {
        toast(numPages > 1
          ? `🖼️ Documento salvato (${numPages} pagine)`
          : '🖼️ Immagine documento salvata', 'ok');
      }
      return value;
    } catch (e) {
      console.error('print-capture failed:', e);
      if (window.toast && opts.silent !== true) toast('❌ Salvataggio immagine fallito: ' + (e.message || e), 'err');
      return null;
    }
  }

  window.capturePrintAndSave = capturePrintAndSave;
  window.getPatientIdForCartella = getPatientIdForCartella;
})();
