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
    const allPanels = Array.from(document.querySelectorAll(panelSelector));
    if (!allPanels.length) return null;

    // Filter out panels that are descendants of other panels in the list
    // (e.g. sport.html has .sport-panel children inside a .sport-panel parent).
    const panels = allPanels.filter(p => !allPanels.some(other => other !== p && other.contains(p)));

    const areaId = opts.areaId || 'spec-print-area';
    let pd = document.getElementById(areaId);
    if (!pd) { pd = document.createElement('div'); pd.id = areaId; document.body.appendChild(pd); }
    pd.innerHTML = '';
    // position:absolute;left:-9999px;top:0 keeps the element off-screen horizontally
    // (body{overflow-x:hidden} clips it visually) while the browser computes the full
    // intrinsic height at top:0. onclone moves it to left:0 and sets body visibility:hidden
    // so html2canvas renders only this area cleanly. Matches the approach used in questionari.html.
    pd.style.cssText = 'display:block;position:absolute;left:-9999px;top:0;width:794px;background:white;padding:20px;box-sizing:border-box;pointer-events:none;z-index:-1';
    // Mark so onclone knows this is a panel-based print area and must NOT apply
    // data-print-mode="compact" (which would hide all panels via !important CSS).
    pd.dataset.panelPrintArea = '1';

    if (opts.titleHtml) {
      const hdr = document.createElement('div');
      hdr.innerHTML = opts.titleHtml;
      pd.appendChild(hdr);
    }

    const extraRemove = opts.removeSelectors || [];

    // Force each panel visible in the LIVE DOM before cloning.
    // When a panel is display:none the browser skips layout for it; cloning a
    // never-laid-out element produces clones with zero intrinsic height even
    // after we set display:block on them. By showing the panel first, the
    // browser computes full layout for all descendants, and the clone captures
    // that computed state.
    const savedDisplays = panels.map(function(p) {
      return { el: p, val: p.style.getPropertyValue('display'), pri: p.style.getPropertyPriority('display') };
    });
    panels.forEach(function(p) { p.style.setProperty('display', 'block', 'important'); });
    // Synchronous reflow: reading offsetHeight forces the browser to flush
    // pending style/layout changes for all panels before we clone them.
    void panels.reduce(function(acc, p) { return acc + p.offsetHeight; }, 0);

    panels.forEach(function (panel, pi) {
      const pc = panel.cloneNode(true);
      // display:block!important is already on the clone (inherited from the live
      // panel). Set visibility explicitly so html2canvas renders the element even
      // when body visibility:hidden is applied in the onclone callback.
      pc.style.setProperty('visibility', 'visible', 'important');
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

    // Restore each live panel's original display state.
    savedDisplays.forEach(function(saved) {
      saved.el.style.removeProperty('display');
      if (saved.val) saved.el.style.setProperty('display', saved.val, saved.pri || '');
    });

    // Diagnostic: log panel count and container height so we can diagnose 1-page issues.
    console.log('[buildAllPanelsPrintArea] selector=' + panelSelector +
      ' panels=' + panels.length + ' pd.scrollHeight=' + pd.scrollHeight +
      ' pd.bcr.height=' + Math.round(pd.getBoundingClientRect().height));
    return pd;
  }

  window.staticifyFormElements = staticifyFormElements;
  window.buildAllPanelsPrintArea = buildAllPanelsPrintArea;

  // Render the target into ONE big canvas, then slice into A4-portrait
  // pages. Returns an array of PNG blobs (one per page).
  async function renderToPagedBlobs(container, opts = {}) {
    const html2canvas = await loadHtml2Canvas();
    const target = container || document.body;

    const bcr = target.getBoundingClientRect();
    console.log('[print-capture] renderToPagedBlobs: id=' + (target.id || '(body)') +
      ' bcr=' + Math.round(bcr.left) + ',' + Math.round(bcr.top) +
      ' ' + Math.round(bcr.width) + 'x' + Math.round(bcr.height));

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
        // Remove overflow-x:hidden so the off-screen print area (left:-9999px) is reachable.
        doc.body.style.overflow = 'visible';
        doc.body.style.overflowX = 'visible';
        // Hide the rest of the page so only the print area is rendered.
        doc.body.style.visibility = 'hidden';
        if (target !== document.body && target.id) {
          const cloneEl = doc.getElementById(target.id);
          if (cloneEl) {
            // Make print area visible and move it to origin so html2canvas crops correctly.
            cloneEl.style.visibility = 'visible';
            cloneEl.style.position = 'absolute';
            cloneEl.style.top = '0';
            cloneEl.style.left = '0';
            cloneEl.style.zIndex = 'auto';
          }
        }
        // Belt-and-suspenders: hide specific chrome elements.
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
        // Only apply compact-print-mode when capturing the compact area directly
        // (NOT when capturing a panel print area built by buildAllPanelsPrintArea,
        // because compact CSS uses !important which overrides inline display:block).
        const cloneTarget = (target !== document.body && target.id)
          ? doc.getElementById(target.id) : null;
        if (!cloneTarget?.dataset?.panelPrintArea) {
          if (doc.querySelector('[data-print-mode], #ped-compact-print-area, #pan-compact-print-area')) {
            doc.body.setAttribute('data-print-mode', 'compact');
          }
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
    console.log('[print-capture] canvas=' + pageWidth + 'x' + totalH + ' pageH=' + pageHeight + ' numPages=' + numPages);

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
      cacheControl: '31536000',
    });
    if (error) throw error;
    // Public bucket → use permanent public URL (no token, no expiry)
    const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
    if (!data?.publicUrl) throw new Error('URL pubblico non disponibile');
    return data.publicUrl;
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
      console.log('[print-capture] uploading ' + numPages + ' page(s) to folder=' + folderId);
      for (let i = 0; i < numPages; i++) {
        const path = `${folderId}/${table}_${recordId}_p${i + 1}.png`;
        const url = await uploadPage(blobs[i], path);
        if (!url) throw new Error(`URL pagina ${i + 1} non disponibile`);
        console.log('[print-capture] uploaded p' + (i + 1) + ':', path);
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
        // Show error toast even if silent so the dietitian knows something went wrong.
        if (window.toast) toast('⚠️ Immagine caricata ma update DB fallito: ' + error.message, 'err');
        if (autoPrintArea) { autoPrintArea.innerHTML = ''; autoPrintArea.style.cssText = 'display:none'; }
        return value;
      }

      // Verify the update actually took effect (silent RLS failures return error=null with 0 rows changed)
      const { data: verif, error: verifErr } = await sb
        .from(table)
        .select('id, print_image_url')
        .eq('id', recordId)
        .maybeSingle();
      if (verifErr) {
        console.warn('[print-capture] Verify SELECT failed:', verifErr.message);
      } else if (!verif) {
        console.warn('[print-capture] RECORD NOT FOUND in DB! recordId:', recordId,
          '— the capture saved files to storage but the DB row does not exist or is invisible to this user. ' +
          'Make sure you load an existing record before saving, or that the record was already saved first.');
        if (window.toast) toast('⚠️ Record non trovato nel DB — ricarica la pagina e salva di nuovo', 'err');
      } else if (!verif.print_image_url) {
        console.warn('[print-capture] DB update silently blocked (RLS or wrong user)! print_image_url is still null for', recordId);
        if (window.toast) toast('⚠️ Aggiornamento DB bloccato (RLS). Controlla le policy.', 'err');
      } else {
        console.log('[print-capture] DB verified ok:', table, recordId, numPages + ' page(s)');
      }

      console.log('[print-capture] DB updated ok:', table, recordId);
      if (window.toast && opts.silent !== true) {
        toast(numPages > 1
          ? `🖼️ Documento salvato (${numPages} pagine)`
          : '🖼️ Immagine documento salvata', 'ok');
      }
      if (autoPrintArea) { autoPrintArea.innerHTML = ''; autoPrintArea.style.cssText = 'display:none'; }
      return value;
    } catch (e) {
      console.error('print-capture failed:', e);
      // Always show error toast so dietitian knows something went wrong.
      if (window.toast) toast('❌ Salvataggio immagine fallito: ' + (e.message || e), 'err');
      if (autoPrintArea) { autoPrintArea.innerHTML = ''; autoPrintArea.style.cssText = 'display:none'; }
      return null;
    }
  }

  window.capturePrintAndSave = capturePrintAndSave;
  window.getPatientIdForCartella = getPatientIdForCartella;
})();
