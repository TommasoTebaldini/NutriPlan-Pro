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
//                               container, silent, onclone,
//                               panelSelector, titleHtml, removeSelectors })
//
//   panelSelector — CSS selector for tab/panel elements to combine into
//                   a single off-screen container (auto-builds when set
//                   and no container is provided).
//   titleHtml     — optional header HTML prepended to the combined area.
//   removeSelectors — extra CSS selectors to remove from each panel clone
//                     (e.g. ['.ncpt-nav']).
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

  // ─── staticifyFormElements ─────────────────────────────────────────────────
  // Replace form inputs/textareas/selects in cloneEl with static text elements,
  // reading the live values from matching elements in origEl.
  // This is necessary because cloneNode(true) copies DOM attributes but NOT
  // the JavaScript .value property set by user interaction.
  function staticifyFormElements(cloneEl, origEl) {
    const origArr = Array.from(origEl.querySelectorAll('input, textarea, select'));
    const cloneArr = Array.from(cloneEl.querySelectorAll('input, textarea, select'));
    cloneArr.forEach(function (cl, idx) {
      const orig = origArr[idx];
      if (!orig || !cl.parentNode) return;
      const val = orig.value || '';
      if (orig.type === 'checkbox' || orig.type === 'radio') {
        cl.checked = orig.checked;
        return;
      }
      if (orig.tagName === 'TEXTAREA') {
        const div = document.createElement('div');
        div.style.cssText = 'font-family:inherit;font-size:13px;line-height:1.6;color:#1E293B;white-space:pre-wrap;padding:6px 0;min-height:18px;word-break:break-word';
        div.textContent = val;
        cl.parentNode.replaceChild(div, cl);
      } else if (orig.tagName === 'SELECT') {
        const span = document.createElement('span');
        span.style.cssText = 'font-family:inherit;font-size:13px;font-weight:600;color:#1E293B;display:inline-block';
        const selOpt = orig.options[orig.selectedIndex];
        span.textContent = (selOpt ? selOpt.text : null) || val || '—';
        cl.parentNode.replaceChild(span, cl);
      } else {
        const span = document.createElement('span');
        span.style.cssText = 'font-family:inherit;font-size:13px;font-weight:600;color:#1E293B;display:inline-block';
        span.textContent = val || '—';
        cl.parentNode.replaceChild(span, cl);
      }
    });
  }

  // ─── buildAllPanelsPrintArea ───────────────────────────────────────────────
  // Build an off-screen combined print div from all elements matching
  // panelSelector. Each panel is cloned, forced visible, and staticified
  // (form elements replaced with static text). Returns the div, or null.
  // Options:
  //   areaId         — id for the off-screen wrapper element
  //   titleHtml      — HTML string prepended as a header
  //   removeSelectors — array of additional CSS selectors to remove from clones
  function buildAllPanelsPrintArea(panelSelector, opts) {
    opts = opts || {};
    const panels = Array.from(document.querySelectorAll(panelSelector));
    if (!panels.length) return null;

    const areaId = opts.areaId || 'spec-print-area';
    let pd = document.getElementById(areaId);
    if (!pd) { pd = document.createElement('div'); pd.id = areaId; document.body.appendChild(pd); }
    pd.innerHTML = '';
    // position:fixed;top:0 keeps the element out of document flow (no page doubling) but
    // within the viewport origin so the browser computes the full intrinsic height.
    // visibility:hidden prevents the user from seeing it; onclone will flip it visible
    // and hide the rest of the page so html2canvas captures only this print area.
    pd.style.cssText = 'display:block;position:fixed;top:0;left:0;visibility:hidden;width:794px;background:white;padding:20px;box-sizing:border-box;pointer-events:none;z-index:-1';

    if (opts.titleHtml) {
      const hdr = document.createElement('div');
      hdr.innerHTML = opts.titleHtml;
      pd.appendChild(hdr);
    }

    const extraRemove = opts.removeSelectors || [];

    panels.forEach(function (panel, pi) {
      const pc = panel.cloneNode(true);
      pc.style.display = 'block';
      const removeList = ['.no-print'].concat(extraRemove);
      pc.querySelectorAll(removeList.join(', ')).forEach(function (el) { el.remove(); });
      staticifyFormElements(pc, panel);
      pd.appendChild(pc);
      if (pi < panels.length - 1) {
        const hr = document.createElement('hr');
        hr.style.cssText = 'border:none;border-top:1px solid #E2E8F0;margin:16px 0';
        pd.appendChild(hr);
      }
    });

    return pd;
  }

  window.staticifyFormElements = staticifyFormElements;
  window.buildAllPanelsPrintArea = buildAllPanelsPrintArea;

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
        doc.body.style.overflow = 'visible';
        // Hide the entire cloned page so only the print area is rendered cleanly.
        // The print area is at position:fixed;top:0 in the live DOM with visibility:hidden.
        // We flip it visible here and keep everything else hidden so html2canvas captures
        // the full content height without any page chrome bleeding through.
        doc.body.style.visibility = 'hidden';
        if (target !== document.body && target.id) {
          const cloneEl = doc.getElementById(target.id);
          if (cloneEl) {
            cloneEl.style.visibility = 'visible';
            // Switch to absolute so the clone document can scroll past it if needed.
            cloneEl.style.position = 'absolute';
            cloneEl.style.top = '0';
            cloneEl.style.left = '0';
            cloneEl.style.zIndex = 'auto';
          }
        }
        // Belt-and-suspenders: also hide specific chrome elements.
        ['sidebar', 'sb-overlay', 'topbar', 'toast'].forEach((id) => {
          const el = doc.getElementById(id);
          if (el) el.style.display = 'none';
        });
        doc.querySelectorAll(
          '.toast, .notification, [role="status"], [role="alert"], .no-print'
        ).forEach((el) => { el.style.display = 'none'; });
        const mainEl = doc.getElementById('main');
        if (mainEl) {
          mainEl.style.marginLeft = '0';
          mainEl.style.paddingLeft = '16px';
          mainEl.style.paddingRight = '16px';
        }
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

    // Auto-build combined print area when panelSelector is given and no container
    let autoPrintArea = null;
    if (opts.panelSelector && !opts.container) {
      autoPrintArea = buildAllPanelsPrintArea(opts.panelSelector, {
        areaId: (table || 'spec') + '-print-area',
        titleHtml: opts.titleHtml,
        removeSelectors: opts.removeSelectors,
      });
      if (autoPrintArea) {
        opts = Object.assign({}, opts, { container: autoPrintArea });
      }
    }

    // Always wait two animation frames so the browser computes the full intrinsic
    // height of the print area (position:fixed;top:0;visibility:hidden) before
    // html2canvas measures its getBoundingClientRect().
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));

    // Resolve the folder: patient_id if cartella is linked, otherwise current user
    let folderId = null;
    if (cartellaId) {
      folderId = await getPatientIdForCartella(cartellaId);
    }
    if (!folderId) {
      // Fallback: store in the dietitian's own folder so the upload never fails
      // due to a missing patient link. The signed URL will still be readable
      // by the patient app via print_image_url.
      if (typeof currentUser !== 'undefined' && currentUser?.id) {
        folderId = currentUser.id;
      } else {
        try {
          const { data: { user } } = await sb.auth.getUser();
          folderId = user?.id || null;
        } catch (_) {}
      }
    }
    if (!folderId) {
      if (window.toast && opts.silent !== true) toast('⚠️ Utente non autenticato — immagine non salvata', 'err');
      if (autoPrintArea) { autoPrintArea.innerHTML = ''; autoPrintArea.style.cssText = 'display:none'; }
      return null;
    }

    try {
      const blobs = await renderToPagedBlobs(opts.container, opts);
      const numPages = blobs.length;

      // Upload all pages → collect signed URLs
      const urls = [];
      for (let i = 0; i < numPages; i++) {
        const path = `${folderId}/${table}_${recordId}_p${i + 1}.png`;
        const url = await uploadPage(blobs[i], path);
        if (!url) throw new Error(`URL pagina ${i + 1} non disponibile`);
        urls.push(url);
      }

      // Remove stale pages from a previous (longer) save
      await cleanupOldPages(folderId, table, recordId, numPages + 1);

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
        if (autoPrintArea) { autoPrintArea.innerHTML = ''; autoPrintArea.style.cssText = 'display:none'; }
        return value;
      }

      if (window.toast && opts.silent !== true) {
        toast(numPages > 1
          ? `🖼️ Documento salvato (${numPages} pagine)`
          : '🖼️ Immagine documento salvata', 'ok');
      }
      if (autoPrintArea) { autoPrintArea.innerHTML = ''; autoPrintArea.style.cssText = 'display:none'; }
      return value;
    } catch (e) {
      console.error('print-capture failed:', e);
      if (window.toast && opts.silent !== true) toast('❌ Salvataggio immagine fallito: ' + (e.message || e), 'err');
      if (autoPrintArea) { autoPrintArea.innerHTML = ''; autoPrintArea.style.cssText = 'display:none'; }
      return null;
    }
  }

  window.capturePrintAndSave = capturePrintAndSave;
  window.getPatientIdForCartella = getPatientIdForCartella;
})();
