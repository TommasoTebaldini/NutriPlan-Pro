// ═══════════════════════════════════════════════════
// SUPABASE CONFIG
// ═══════════════════════════════════════════════════
const SUPABASE_URL = 'https://hvdwqowkhutfsdpiubxe.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2ZHdxb3draHV0ZnNkcGl1YnhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3OTU0ODMsImV4cCI6MjA5MDM3MTQ4M30.HenM_wKdcrSVmQ2NyHsg0r9HfQDgcLgb2q1EAIMVcfs';
let sb;
try {
  sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
} catch(e) {
  console.warn('Supabase non disponibile (modalità locale):', e.message);
  // Mock sb for local testing
  sb = {
    auth: { getSession: async()=>({data:{session:null}}), signOut: async()=>{}, signInWithPassword: async()=>({error:{message:'Login non disponibile in locale'}}), signUp: async()=>({error:{message:'Registrazione non disponibile in locale'}}) },
    from: ()=>({ select: ()=>({ eq: ()=>({ order: ()=>({ limit: ()=>Promise.resolve({data:[],error:null}), single: ()=>Promise.resolve({data:null,error:null}), maybeSingle: ()=>Promise.resolve({data:null,error:null}), then: (r)=>r({data:[],error:null}) }), single: ()=>Promise.resolve({data:null,error:null}), maybeSingle: ()=>Promise.resolve({data:null,error:null}), then: (r)=>r({data:[],error:null}) }), then: (r)=>r({data:[],error:null}) }), insert: ()=>({ select: ()=>({ single: ()=>Promise.resolve({data:null,error:null}) }), then: (r)=>r({data:null,error:null}) }), update: ()=>({ eq: ()=>Promise.resolve({data:null,error:null}) }), delete: ()=>({ eq: ()=>Promise.resolve({data:null,error:null}) }), upsert: ()=>Promise.resolve({data:null,error:null}) })
  };
}

// Add a preconnect hint for Supabase so the TLS handshake is resolved before
// the first query fires, saving ~100-200ms per cold page load.
(function() {
  try {
    if (!document.querySelector('link[rel="preconnect"][href*="supabase.co"]')) {
      var lnk = document.createElement('link');
      lnk.rel = 'preconnect';
      lnk.href = SUPABASE_URL;
      lnk.crossOrigin = 'anonymous';
      document.head.appendChild(lnk);
    }
  } catch(e) {}
})();

let currentUser = null;
let isAdmin = false;
let currentProfile = null;
let loadProfileError = null;

// ═══════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════
async function checkAuth(redirectIfNotLogged = true) {
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session?.user) {
      if (redirectIfNotLogged && window.location.protocol !== 'file:') {
        window.location.href = 'index.html';
      }
      return false;
    }
    currentUser = session.user;
    await loadProfile();
    return true;
  } catch(e) {
    console.warn('checkAuth error:', e.message);
    return false;
  }
}

async function loadProfile() {
  if (!currentUser) return;
  loadProfileError = null;
  let data = null;
  const _profKey = 'dpp_profile_' + currentUser.id;
  try { const c = sessionStorage.getItem(_profKey); if (c) data = JSON.parse(c); } catch(e) {}
  if (!data) {
    const { data: fetched, error } = await sb.from('profiles').select('*').eq('id', currentUser.id).maybeSingle();
    if (error) { console.warn('loadProfile error:', error.message); loadProfileError = error; }
    data = fetched;
    if (data) { try { sessionStorage.setItem(_profKey, JSON.stringify(data)); } catch(e) {} }
  }
  currentProfile = data;
  isAdmin = data?.is_admin === true;
  if (data && !data.approved && !data.is_admin) {
    window.location.href = 'index.html?waiting=1';
    return;
  }
  // Update UI
  const el = document.getElementById('sb-user-email');
  if (el) el.textContent = data?.username || currentUser.email;
  const adminNav = document.getElementById('nav-admin');
  if (adminNav) adminNav.style.display = isAdmin ? 'flex' : 'none';
  // Load cartelle dropdown if present
  if (document.getElementById('inp-cartella')) loadCartelleDropdown();
  // Add profile button to sidebar if not present
  const sbBottom = document.querySelector('.sb-bottom');
  if (sbBottom && !document.getElementById('btn-profilo-op')) {
    const btn = document.createElement('button');
    btn.id = 'btn-profilo-op';
    btn.className = 'sb-logout';
    btn.style.cssText = 'background:rgba(255,255,255,.08);margin-bottom:4px';
    btn.textContent = (typeof t === 'function') ? '👤 ' + t('nav.profilo') : '👤 Profilo Operatore';
    btn.onclick = openProfiloModal;
    sbBottom.insertBefore(btn, sbBottom.querySelector('.sb-logout'));
  }
  // i18n: re-apply after profile loads (profile button is now in DOM)
  if (typeof translateSidebarNav === 'function') translateSidebarNav();
  if (typeof initLangSwitcher === 'function') initLangSwitcher();
  // Ensure profilo modal exists
  if (!document.getElementById('modal-profilo-op')) {
    const div = document.createElement('div');
    div.innerHTML = `<div class="modal-bg" id="modal-profilo-op">
      <div class="modal" style="max-width:420px">
        <div class="mhdr"><span style="font-size:15px;font-weight:700;color:var(--slate)">👤 Profilo Operatore</span><button class="mclose" onclick="closeM('modal-profilo-op')">✕</button></div>
        <div class="mbody">
          <p style="font-size:12.5px;color:var(--slate-m);margin-bottom:14px">Questi dati appariranno in calce a tutte le stampe (piani alimentari, consigli, schede specialistiche).</p>
          <div class="fg" style="margin-bottom:10px"><label>Nome</label><input type="text" id="profop-nome" placeholder="es. Maria" maxlength="60" style="width:100%;padding:8px 11px;border:1.5px solid var(--border-d);border-radius:var(--r-sm);font-size:13px;font-family:inherit;outline:none;box-sizing:border-box"></div>
          <div class="fg" style="margin-bottom:10px"><label>Cognome</label><input type="text" id="profop-cognome" placeholder="es. Rossi" maxlength="60" style="width:100%;padding:8px 11px;border:1.5px solid var(--border-d);border-radius:var(--r-sm);font-size:13px;font-family:inherit;outline:none;box-sizing:border-box"></div>
          <div class="fg" style="margin-bottom:10px"><label>N° Iscrizione Albo</label><input type="text" id="profop-albo" placeholder="es. 12345 (Regione)" maxlength="80" style="width:100%;padding:8px 11px;border:1.5px solid var(--border-d);border-radius:var(--r-sm);font-size:13px;font-family:inherit;outline:none;box-sizing:border-box"></div>
          <div class="fg" style="margin-bottom:14px">
            <label for="profop-logo-file">Logo / Timbro (opzionale)</label>
            <div id="profop-logo-preview" style="display:none;margin-bottom:8px;text-align:center">
              <img id="profop-logo-img" src="" alt="Logo" style="max-height:72px;max-width:100%;border-radius:6px;border:1px solid var(--border-d)">
              <br><button type="button" onclick="rimuoviLogoOp()" style="margin-top:6px;font-size:11px;color:#EF4444;background:none;border:none;cursor:pointer;padding:2px 0">✕ Rimuovi logo</button>
            </div>
            <input type="file" id="profop-logo-file" accept="image/*" style="width:100%;font-size:12.5px;font-family:inherit;cursor:pointer">
            <p style="font-size:11px;color:var(--slate-m);margin-top:4px">Immagine PNG/JPG, max 200 KB. Apparirà in alto a sinistra su ogni stampa.</p>
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <button class="btn btn-ghost" onclick="closeM('modal-profilo-op')">Annulla</button>
            <button class="btn btn-primary" onclick="salvaProfiloOp()">💾 Salva</button>
          </div>
        </div>
      </div>
    </div>`;
    document.body.appendChild(div.firstChild);
    // Attach file-change handler after DOM insertion
    document.getElementById('profop-logo-file').addEventListener('change', function() { anteprimaLogoOp(this); });
  }
}

function openProfiloModal() {
  const p = getProfiloOperatore();
  // Prefer DB values from currentProfile if available
  const nome = (currentProfile?.nome || p.nome || '');
  const cognome = (currentProfile?.cognome || p.cognome || '');
  const albo = (currentProfile?.albo || p.albo || '');
  const n = document.getElementById('profop-nome'); if (n) n.value = nome;
  const c = document.getElementById('profop-cognome'); if (c) c.value = cognome;
  const a = document.getElementById('profop-albo'); if (a) a.value = albo;
  // Reset file input so re-selecting the same file triggers change event
  const f = document.getElementById('profop-logo-file'); if (f) f.value = '';
  _aggiornaAnteprimaLogo(p.logo || null);
  openM('modal-profilo-op');
}
function _aggiornaAnteprimaLogo(dataUrl) {
  const preview = document.getElementById('profop-logo-preview');
  const img = document.getElementById('profop-logo-img');
  if (!preview || !img) return;
  if (dataUrl && _isValidImageDataUrl(dataUrl)) {
    img.src = dataUrl;
    preview.style.display = 'block';
  } else {
    img.src = '';
    preview.style.display = 'none';
  }
}
function anteprimaLogoOp(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'].includes(file.type)) {
    toast('⚠️ Formato non supportato. Usa PNG, JPG, GIF o WebP.', 'warn');
    input.value = '';
    return;
  }
  if (file.size > 200 * 1024) {
    toast('⚠️ L\'immagine supera i 200 KB. Scegli un\'immagine più piccola.', 'warn');
    input.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = function(e) { _aggiornaAnteprimaLogo(e.target.result); };
  reader.readAsDataURL(file);
}
function rimuoviLogoOp() {
  _aggiornaAnteprimaLogo(null);
  const f = document.getElementById('profop-logo-file'); if (f) f.value = '';
}
async function salvaProfiloOp() {
  // Determine logo: keep existing if the preview is shown, clear if removed
  const preview = document.getElementById('profop-logo-preview');
  const img = document.getElementById('profop-logo-img');
  let logo = null;
  if (preview && img && preview.style.display !== 'none' && img.src && img.src.startsWith('data:')) {
    logo = img.src;
  }
  const d = {
    nome: (document.getElementById('profop-nome')?.value || '').trim(),
    cognome: (document.getElementById('profop-cognome')?.value || '').trim(),
    albo: (document.getElementById('profop-albo')?.value || '').trim(),
    logo: logo || null
  };
  saveProfiloOperatore(d);
  // Also save nome and cognome to Supabase profiles table for cross-user visibility
  if (currentUser) {
    const { error: dbErr } = await sb.from('profiles').update({ nome: d.nome || null, cognome: d.cognome || null, albo: d.albo || null }).eq('id', currentUser.id);
    if (dbErr) console.warn('Profile DB update failed:', dbErr.message);
  }
  try { if (currentUser) sessionStorage.removeItem('dpp_profile_' + currentUser.id); } catch(e) {}
  closeM('modal-profilo-op');
  toast('✅ Profilo salvato!', 'ok');
}

async function doLogout() {
  try {
    const uid = currentUser?.id || '';
    if (uid) { sessionStorage.removeItem('dpp_profile_' + uid); sessionStorage.removeItem('dpp_cartelle_' + uid); }
  } catch(e) {}
  await sb.auth.signOut();
  window.location.href = 'index.html';
}

/* ── Profilo Operatore ── */
function getProfiloOperatore() {
  try { return JSON.parse(localStorage.getItem('nutriplan_profilo_operatore') || '{}'); } catch(e) { return {}; }
}
function saveProfiloOperatore(d) {
  localStorage.setItem('nutriplan_profilo_operatore', JSON.stringify(d));
}
function _isValidImageDataUrl(s) {
  return typeof s === 'string' && /^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(s);
}
function profiloFirmaHtml() {
  const p = getProfiloOperatore();
  const nome = [p.nome, p.cognome].filter(Boolean).join(' ');
  const albo = p.albo ? ' — N° Albo: ' + esc(p.albo) : '';
  const hasText = nome || albo;
  const hasLogo = _isValidImageDataUrl(p.logo);
  if (!hasText && !hasLogo) return '';
  let html = '';
  if (hasLogo) {
    const img = document.createElement('img');
    img.src = p.logo;
    img.alt = 'Logo';
    img.style.cssText = 'max-height:20mm;max-width:45mm;object-fit:contain';
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:fixed;top:6mm;left:15mm';
    wrapper.appendChild(img);
    html += wrapper.outerHTML;
  }
  if (hasText) {
    html += '<div style="position:fixed;bottom:8mm;right:15mm;font-size:11px;color:#64748B;font-style:italic">' + esc(nome) + albo + '</div>';
  }
  return html;
}

// Global beforeprint: inject firma for pages that use window.print() directly
// (Pages with custom print areas already call profiloFirmaHtml() and set data-print-mode)
window.addEventListener('beforeprint', function() {
  if (document.body.dataset.printMode) return; // custom print area already has firma
  const p = getProfiloOperatore();
  const nome = [p.nome, p.cognome].filter(Boolean).join(' ');
  const albo = p.albo ? ' \u2014 N\u00b0 Albo: ' + p.albo : '';
  const hasLogo = _isValidImageDataUrl(p.logo);
  if (!nome && !albo && !hasLogo) return;
  if (!document.getElementById('_gprint_firma_')) {
    const div = document.createElement('div');
    div.id = '_gprint_firma_';
    div.style.cssText = 'position:fixed;bottom:8mm;right:15mm;font-size:11px;color:#64748B;font-style:italic';
    div.textContent = nome + albo;
    document.body.appendChild(div);
  }
  if (hasLogo && !document.getElementById('_gprint_logo_')) {
    const img = document.createElement('img');
    img.id = '_gprint_logo_';
    img.src = p.logo;
    img.alt = 'Logo';
    img.style.cssText = 'position:fixed;top:6mm;left:15mm;max-height:20mm;max-width:45mm;object-fit:contain';
    document.body.appendChild(img);
  }
});
window.addEventListener('afterprint', function() {
  const el = document.getElementById('_gprint_firma_');
  if (el) el.remove();
  const logo = document.getElementById('_gprint_logo_');
  if (logo) logo.remove();
});

// ═══════════════════════════════════════════════════
// CARTELLE DROPDOWN
// ═══════════════════════════════════════════════════
async function loadCartelleDropdown() {
  // Support both old select and new search input
  const sel = document.getElementById('inp-cartella');
  if (!currentUser) return;
  const { data } = await sb.from('cartelle').select('id,nome').eq('user_id', currentUser.id).order('nome');
  if (!data) return;
  if (sel && sel.tagName === 'SELECT') {
    sel.innerHTML = '<option value="">-- Nessuna cartella --</option>';
    data.forEach(c => {
      const o = document.createElement('option');
      o.value = c.id; o.textContent = '📁 ' + c.nome;
      sel.appendChild(o);
    });
  }
  // Also populate allCartelle for search
  if (typeof allCartelle !== 'undefined') {
    window.allCartelle = data;
  }
}

// ═══════════════════════════════════════════════════
// SIDEBAR & NAV
// ═══════════════════════════════════════════════════
function toggleSB() {
  const open = document.getElementById('sidebar').classList.toggle('open');
  const ov = document.getElementById('sb-overlay');
  if (ov) ov.classList.toggle('open', open);
}
function closeSB() {
  document.getElementById('sidebar').classList.remove('open');
  const ov = document.getElementById('sb-overlay');
  if (ov) ov.classList.remove('open');
}

function setActiveNav(page) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const el = document.getElementById('nav-' + page);
  if (el) el.classList.add('active');
}

// ═══════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════
function lookup(n) {
  if (!n) return null;
  const lower = n.toLowerCase().trim();

  // 1. Exact match
  if (FOOD_MAP[lower]) return FOOD_MAP[lower];

  // 2. Strip parenthetical content (e.g. "(media)", "(GI basso)", "(3 uova)") and try exact match
  const clean = lower.replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  if (clean !== lower && FOOD_MAP[clean]) return FOOD_MAP[clean];

  // 3. Progressive prefix: remove trailing words until a match is found
  // e.g. "Pane integrale a fette" → "Pane integrale a" → "Pane integrale"
  const base = clean || lower;
  const parts = base.split(/\s+/);
  for (let len = parts.length - 1; len >= 2; len--) {
    const sub = parts.slice(0, len).join(' ');
    if (FOOD_MAP[sub]) return FOOD_MAP[sub];
  }

  // 4. Fuzzy word-coverage: find the DB entry whose tokens are most covered by the query tokens.
  // Handles cases like "Yogurt greco magro" → "Yogurt greco 0% grassi",
  // "Marmellata senza zucchero" → "Marmellata / confettura", "Salmone al forno" → "Salmone atlantico".
  const qToks = base.split(/[\s,/\-+()[\]]+/).filter(t => t.length >= 3);
  if (!qToks.length) return null;

  const firstTok = qToks[0];
  let best = null, bestCov = 0, bestMatch = 0;

  for (const f of ALL_DB) {
    const fn = f.n.toLowerCase();
    if (!fn.includes(firstTok)) continue; // first query token must appear in the DB name

    const fnToks = fn.split(/[\s,/\-+()[\]]+/).filter(t => t.length >= 3);
    if (!fnToks.length) continue;

    let matched = 0, total = 0;
    for (const t of fnToks) {
      total += t.length;
      if (qToks.includes(t)) matched += t.length;
    }
    const cov = total ? matched / total : 0;
    if (cov > bestCov || (cov === bestCov && matched > bestMatch)) {
      best = f; bestCov = cov; bestMatch = matched;
    }
  }

  // Threshold scales with the number of query tokens to balance sensitivity vs. false positives
  const threshold = qToks.length === 1 ? 0.3 : qToks.length === 2 ? 0.38 : 0.45;
  return bestCov >= threshold ? best : null;
}
function cv(f, key, qt) { if (!f || f[key] == null) return null; return (f[key] / 100) * (parseFloat(qt) || 0); }
function r1(v) { return Math.round(v * 10) / 10; }
function r2(v) { return Math.round(v * 100) / 100; }
function fmtV(v, dec = 1) {
  if (v === null || v === undefined) return '<span class="vnd">n.d.</span>';
  const n = Math.round(v * Math.pow(10, dec)) / Math.pow(10, dec);
  return n === 0 ? '<span style="color:#CBD5E1">—</span>' : (n % 1 === 0 ? n.toFixed(0) : n.toFixed(dec));
}
function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function escJS(s) { return (s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
function todayISO() { return new Date().toISOString().split('T')[0]; }
function calcolaEta(ddn) {
  if (!ddn) return '';
  const oggi = new Date(); const nato = new Date(ddn);
  let eta = oggi.getFullYear() - nato.getFullYear();
  if (oggi < new Date(oggi.getFullYear(), nato.getMonth(), nato.getDate())) eta--;
  return eta;
}

// ═══════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════
let _tT = null;
function toast(msg, type = 'ok') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg; el.className = 'toast ' + type + ' show';
  clearTimeout(_tT); _tT = setTimeout(() => el.className = 'toast', 3000);
}

// ═══════════════════════════════════════════════════
// LOADING
// ═══════════════════════════════════════════════════
function showLoading(v) {
  // Quick saves (200-400ms) don't need a full-page overlay — the overlay covers
  // the topbar and paz-bar causing visible flicker. Use cursor:wait instead;
  // the capture bar in print-capture.js handles the longer PNG upload phase.
  document.body.style.cursor = v ? 'wait' : '';
}

// ═══════════════════════════════════════════════════
// MODAL
// ═══════════════════════════════════════════════════
function openM(id) { const el = document.getElementById(id); if (el) el.classList.add('open'); }
function closeM(id) { const el = document.getElementById(id); if (el) el.classList.remove('open'); }
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.modal-bg').forEach(mb => {
    mb.addEventListener('click', e => { if (e.target === mb) mb.classList.remove('open'); });
  });
});

// Global copyright footer on all DietPlan Pro pages using utils.js
function ensureGlobalCopyright() {
  if (document.getElementById('global-copyright')) return;
  const el = document.createElement('footer');
  el.id = 'global-copyright';
  el.className = 'global-copyright';
  el.textContent = `© ${new Date().getFullYear()} DietPlan Pro — Tutti i diritti riservati.`;
  document.body.appendChild(el);
}

document.addEventListener('DOMContentLoaded', ensureGlobalCopyright);

// ═══════════════════════════════════════════════════
// CUSTOM CONFIRM DIALOG (shared)
// ═══════════════════════════════════════════════════
var _customConfirmCallback = null;
function customConfirm(msg, onConfirm, opts) {
  opts = opts || {};
  if (!document.getElementById('modal-custom-confirm')) {
    var el = document.createElement('div');
    el.id = 'modal-custom-confirm';
    el.className = 'modal-bg';
    el.innerHTML =
      '<div class="modal" style="max-width:380px">' +
        '<div class="mhdr"><h2 id="modal-cc-title">⚠️ Conferma</h2><button class="mclose" onclick="closeM(\'modal-custom-confirm\')">✕</button></div>' +
        '<div class="mbody" style="padding:20px 22px"><p id="modal-cc-msg" style="margin:0;font-size:14px;color:var(--slate-m);line-height:1.5"></p></div>' +
        '<div class="mfoot">' +
          '<button class="btn btn-ghost btn-sm" onclick="closeM(\'modal-custom-confirm\');_customConfirmCallback=null;">Annulla</button>' +
          '<button class="btn btn-sm" id="modal-cc-ok" onclick="closeM(\'modal-custom-confirm\');if(_customConfirmCallback){_customConfirmCallback();_customConfirmCallback=null;}">Continua</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(el);
    el.addEventListener('click', function(e){ if (e.target === el) closeM('modal-custom-confirm'); });
  }
  _customConfirmCallback = onConfirm;
  document.getElementById('modal-cc-msg').textContent = msg;
  document.getElementById('modal-cc-title').textContent = opts.title || '⚠️ Conferma';
  var okBtn = document.getElementById('modal-cc-ok');
  okBtn.textContent = opts.okLabel || 'Continua';
  if (opts.danger) {
    okBtn.style.background = '#DC2626';
    okBtn.style.color = '#fff';
    okBtn.style.borderColor = '#DC2626';
  } else {
    okBtn.style.background = '';
    okBtn.style.color = '';
    okBtn.style.borderColor = '';
    okBtn.className = 'btn btn-primary btn-sm';
  }
  openM('modal-custom-confirm');
}

// ═══════════════════════════════════════════════════
// MICRO CONFIG (shared)
// ═══════════════════════════════════════════════════
const MICROS = [
  { k: 'ca', l: 'Calcio (mg)' }, { k: 'fe', l: 'Ferro (mg)' }, { k: 'mg', l: 'Magnesio (mg)' },
  { k: 'k2', l: 'Potassio (mg)' }, { k: 'na', l: 'Sodio (mg)' }, { k: 'zn', l: 'Zinco (mg)' },
  { k: 'fo', l: 'Fosforo (mg)' }, { k: 'se', l: 'Selenio (µg)' }, { k: 'col', l: 'Col. (mg)' }
];
const ALL_NUTRIENTS = [
  { k: 'k', l: 'Calorie' }, { k: 'p', l: 'Proteine' }, { k: 'g', l: 'Grassi Tot.' },
  { k: 'gs', l: 'Grassi Sat.' }, { k: 'ch', l: 'CHO' }, { k: 'z', l: 'Zuccheri' },
  { k: 'fi', l: 'Fibra' }, { k: 'ca', l: 'Calcio' }, { k: 'fe', l: 'Ferro' },
  { k: 'mg', l: 'Magnesio' }, { k: 'k2', l: 'Potassio' }, { k: 'na', l: 'Sodio' },
  { k: 'zn', l: 'Zinco' }, { k: 'fo', l: 'Fosforo' }, { k: 'se', l: 'Selenio' },
  { k: 'col', l: 'Colesterolo' }
];
let visM = new Set();

// ═══════════════════════════════════════════════════
// UNDO STACK
// ═══════════════════════════════════════════════════
let undoStack = [];
function pushUndo(state) {
  undoStack.push(JSON.stringify(state));
  if (undoStack.length > 30) undoStack.shift();
  const btn = document.getElementById('btn-undo');
  if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
}
function popUndo() {
  if (!undoStack.length) { toast('Nessuna azione da annullare', 'info'); return null; }
  const state = JSON.parse(undoStack.pop());
  if (!undoStack.length) { const btn2 = document.getElementById('btn-undo'); if (btn2) { btn2.disabled = true; btn2.style.opacity = '.5'; } }
  return state;
}
function showUndoBar() {
  const bar = document.getElementById('undo-bar');
  if (bar) bar.classList.add('show');
}
function hideUndoBar() {
  const bar = document.getElementById('undo-bar');
  if (bar) bar.classList.remove('show');
}

// ── Sidebar toggle ──
function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  const overlay = document.getElementById('sb-overlay');
  const btn = document.getElementById('sb-toggle-btn');
  if (!sb) return;
  const isCollapsed = sb.classList.contains('collapsed');
  sb.classList.toggle('collapsed', !isCollapsed);
  document.body.classList.toggle('sidebar-collapsed', !isCollapsed);
  if (btn) btn.innerHTML = isCollapsed ? '☰' : '✕';
  localStorage.setItem('sidebarCollapsed', !isCollapsed ? '1' : '0');
}

// Restore sidebar state on load
document.addEventListener('DOMContentLoaded', () => {
  if (localStorage.getItem('sidebarCollapsed') === '1') {
    const sb = document.getElementById('sidebar');
    const btn = document.getElementById('sb-toggle-btn');
    if (sb) sb.classList.add('collapsed');
    document.body.classList.add('sidebar-collapsed');
    if (btn) btn.innerHTML = '✕';
  }
  // Restore sidebar scroll position
  const sbEl = document.getElementById('sidebar');
  if (sbEl) {
    const savedScroll = localStorage.getItem('nutriplan_sidebar_scroll');
    if (savedScroll) sbEl.scrollTop = parseInt(savedScroll) || 0;
    sbEl.addEventListener('scroll', () => {
      localStorage.setItem('nutriplan_sidebar_scroll', sbEl.scrollTop);
    }, { passive: true });
  }
});

// ═══════════════════════════════════════════════════
// CARTELLA SEARCH WIDGET (shared across all pages)
// ═══════════════════════════════════════════════════
// Usage:
//   HTML: <div id="mypref-cartella-cw"></div>
//   JS:   initCartellaWidget('mypref-cartella-cw', { hiddenInputId:'mypref-cartella', accentColor:'#14B8A6', labelColor:'#0F766E' });
//   Read: document.getElementById('mypref-cartella').value  (same as before)
//   Set:  _cwSetById('mypref-cartella-cw', cartella_id)

window._cartelleCache = null;

async function _cwLoadCache() {
  if (window._cartelleCache) return window._cartelleCache;
  if (!currentUser) return [];
  const _cartKey = 'dpp_cartelle_' + currentUser.id;
  try { const c = sessionStorage.getItem(_cartKey); if (c) { window._cartelleCache = JSON.parse(c); return window._cartelleCache; } } catch(e) {}
  try {
    const { data } = await sb.from('cartelle').select('id,nome').eq('user_id', currentUser.id).order('nome');
    window._cartelleCache = data || [];
  } catch(e) { window._cartelleCache = []; }
  try { sessionStorage.setItem('dpp_cartelle_' + currentUser.id, JSON.stringify(window._cartelleCache)); } catch(e) {}
  return window._cartelleCache;
}

function initCartellaWidget(cid, opts) {
  const container = document.getElementById(cid);
  if (!container) return;
  opts = opts || {};
  container._cwOpts = opts;
  const border = opts.accentColor || '#6EE7B7';
  const labelColor = opts.labelColor || '#0F766E';
  const hiddenId = opts.hiddenInputId || (cid + '-val');
  const placeholder = opts.placeholder || '🔍 Cerca paziente...';
  container.innerHTML =
    '<div style="position:relative">' +
      '<input type="text" id="' + cid + '-srch" placeholder="' + placeholder + '" autocomplete="off"' +
      ' style="width:100%;padding:6px 10px;border:1.5px solid ' + border + ';border-radius:var(--r-sm);font-family:inherit;font-size:13px;outline:none;background:white;color:#1E293B;box-sizing:border-box"' +
      ' oninput="_cwFilter(\'' + cid + '\')"' +
      ' onfocus="_cwFocus(\'' + cid + '\')"' +
      ' onblur="setTimeout(()=>_cwBlur(\'' + cid + '\'),200)">' +
      '<div id="' + cid + '-dd" onmousedown="event.preventDefault()" style="display:none;position:absolute;top:100%;left:0;right:0;background:white;border:2px solid ' + border + ';border-radius:var(--r-sm);max-height:200px;overflow-y:auto;z-index:600;box-shadow:0 8px 24px rgba(0,0,0,.15);color:#1E293B"></div>' +
    '</div>' +
    '<input type="hidden" id="' + hiddenId + '" value="">' +
    '<span id="' + cid + '-lbl" style="display:none"></span>';
}

function _cwFilter(cid) {
  const q = (document.getElementById(cid + '-srch') || {}).value || '';
  _cwShow(cid, q.toLowerCase());
}

async function _cwShow(cid, q) {
  if (q === undefined) q = ((document.getElementById(cid + '-srch') || {}).value || '').toLowerCase();
  const dd = document.getElementById(cid + '-dd');
  if (!dd) return;
  const container = document.getElementById(cid);
  const opts = (container || {})._cwOpts || {};
  const border = opts.accentColor || '#6EE7B7';
  const hoverBg = opts.hoverBg || '#F0FDF4';
  const nuovaBg = opts.nuovaBg || '#F0FDF4';
  const cartelle = await _cwLoadCache();
  const filtered = q ? cartelle.filter(function(c){ return c.nome.toLowerCase().indexOf(q) !== -1; }) : cartelle;
  var html = '<div style="padding:5px 10px;font-size:10.5px;color:var(--slate-l);border-bottom:1px solid var(--border)">Seleziona cartella</div>';
  if (!filtered.length) {
    html += '<div style="padding:10px;color:var(--slate-l);font-size:12.5px">Nessuna cartella trovata</div>';
  } else {
    html += filtered.map(function(c){
      return '<div onclick="_cwSelect(\'' + cid + '\',\'' + escJS(c.id) + '\',\'' + escJS(c.nome) + '\')"' +
        ' style="padding:8px 12px;cursor:pointer;font-size:13px;font-weight:500;border-bottom:1px solid var(--border);color:#1E293B"' +
        ' onmouseover="this.style.background=\'' + hoverBg + '\'" onmouseout="this.style.background=\'\'">📁 ' + esc(c.nome) + '</div>';
    }).join('');
  }
  html += '<div onclick="_cwNuovaCartella(\'' + cid + '\')"' +
    ' style="padding:8px 12px;cursor:pointer;font-size:12.5px;font-weight:600;color:' + border + ';background:' + nuovaBg + ';border-top:2px solid var(--border)"' +
    ' onmouseover="this.style.opacity=\'.75\'" onmouseout="this.style.opacity=\'1\'">➕ Crea nuova cartella</div>';
  dd.innerHTML = html;
  dd.style.display = 'block';
}

function _cwHide(cid) {
  const dd = document.getElementById(cid + '-dd');
  if (dd) dd.style.display = 'none';
}

function _cwFocus(cid) {
  const srch = document.getElementById(cid + '-srch');
  if (srch && srch.getAttribute('data-cw-selected') === '1') {
    // User is editing — clear display so they can type to search
    srch.value = '';
    srch.style.color = '#1E293B';
    srch.style.fontWeight = '';
    srch.setAttribute('data-cw-selected', 'editing');
  }
  _cwShow(cid, '');
}

function _cwBlur(cid) {
  const srch = document.getElementById(cid + '-srch');
  if (srch && srch.getAttribute('data-cw-selected') === 'editing') {
    // User didn't pick a new cartella — restore previous selection display
    const nome = srch.getAttribute('data-cw-nome') || '';
    const opts = (document.getElementById(cid) || {})._cwOpts || {};
    srch.value = nome ? '✅ ' + nome : '';
    srch.setAttribute('data-cw-selected', nome ? '1' : '');
    srch.style.color = nome ? (opts.labelColor || '#0F766E') : '#1E293B';
    srch.style.fontWeight = nome ? '600' : '';
  }
  setTimeout(() => _cwHide(cid), 200);
}

function _cwUpdateDisplay(cid, id, nome) {
  const container = document.getElementById(cid);
  const opts = (container || {})._cwOpts || {};
  const hiddenId = opts.hiddenInputId || (cid + '-val');
  const hidden = document.getElementById(hiddenId);
  if (hidden) hidden.value = id || '';
  const srch = document.getElementById(cid + '-srch');
  if (srch) {
    srch.value = nome ? '✅ ' + nome : '';
    srch.setAttribute('data-cw-nome', nome || '');
    srch.setAttribute('data-cw-selected', nome ? '1' : '');
    const opts2 = (container || {})._cwOpts || {};
    srch.style.color = nome ? (opts2.labelColor || '#0F766E') : '#1E293B';
    srch.style.fontWeight = nome ? '600' : '';
  }
  _cwHide(cid);
}

function _cwSelect(cid, id, nome) {
  _cwUpdateDisplay(cid, id, nome);
  const container = document.getElementById(cid);
  const opts = (container || {})._cwOpts || {};
  if (opts.onSelect) opts.onSelect(id, nome);
}

async function _cwSetById(cid, cartellaId) {
  if (!cartellaId) return;
  const cartelle = await _cwLoadCache();
  const cart = cartelle.find(function(c){ return c.id === cartellaId; });
  if (cart) {
    _cwUpdateDisplay(cid, cart.id, cart.nome);
  } else {
    // Fallback: just set hidden value
    const container = document.getElementById(cid);
    const opts = (container || {})._cwOpts || {};
    const hiddenId = opts.hiddenInputId || (cid + '-val');
    const hidden = document.getElementById(hiddenId);
    if (hidden) hidden.value = cartellaId;
  }
}

function _cwClear(cid) {
  const container = document.getElementById(cid);
  const opts = (container || {})._cwOpts || {};
  const hiddenId = opts.hiddenInputId || (cid + '-val');
  const hidden = document.getElementById(hiddenId);
  if (hidden) hidden.value = '';
  const srch = document.getElementById(cid + '-srch');
  if (srch) srch.value = '';
  const lbl = document.getElementById(cid + '-lbl');
  if (lbl) { lbl.textContent = ''; lbl.style.display = 'none'; }
}

function _cwNuovaCartella(cid) {
  _cwHide(cid);
  openNuovaCartellaModal(async function(id, nome) {
    window._cartelleCache = null;
    try { if (currentUser) sessionStorage.removeItem('dpp_cartelle_' + currentUser.id); } catch(e) {}
    if (typeof allCartelle !== 'undefined') allCartelle = await _cwLoadCache();
    _cwSelect(cid, id, nome);
  });
}

// ── Global "Nuova Cartella" modal (injected once on demand) ──
var _gncCallback = null;

function openNuovaCartellaModal(callback) {
  _injectNuovaCartellaModal();
  _gncCallback = callback;
  var inp = document.getElementById('gnc-nome');
  if (inp) inp.value = '';
  openM('modal-nuova-cart-global');
  setTimeout(function(){ var i = document.getElementById('gnc-nome'); if(i) i.focus(); }, 100);
}

function _injectNuovaCartellaModal() {
  if (document.getElementById('modal-nuova-cart-global')) return;
  var el = document.createElement('div');
  el.id = 'modal-nuova-cart-global';
  el.className = 'modal-bg';
  el.innerHTML =
    '<div class="modal" style="max-width:380px">' +
      '<div class="mhdr"><h2>📁 Nuova Cartella Paziente</h2><button class="mclose" onclick="closeM(\'modal-nuova-cart-global\')">✕</button></div>' +
      '<div class="mbody">' +
        '<p style="font-size:12.5px;color:var(--slate-l);margin-bottom:12px">Inserisci il nome per la nuova cartella paziente.</p>' +
        '<div class="fg">' +
          '<label>Nome cartella *</label>' +
          '<input type="text" id="gnc-nome" placeholder="es. Rossi Mario"' +
          ' style="width:100%;padding:8px 10px;border:1.5px solid var(--border-d);border-radius:var(--r-sm);font-family:inherit;font-size:13px"' +
          ' onkeydown="if(event.key===\'Enter\')_gncCrea()">' +
        '</div>' +
      '</div>' +
      '<div class="mfoot">' +
        '<button class="btn btn-ghost btn-sm" onclick="closeM(\'modal-nuova-cart-global\')">Annulla</button>' +
        '<button class="btn btn-primary btn-sm" onclick="_gncCrea()">📁 Crea Cartella</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(el);
  el.addEventListener('click', function(e){ if (e.target === el) closeM('modal-nuova-cart-global'); });
}

async function _gncCrea() {
  var nome = (document.getElementById('gnc-nome') || {}).value || '';
  nome = nome.trim();
  if (!nome) { toast('Inserisci il nome della cartella', 'err'); return; }
  if (!currentUser) { toast('Sessione scaduta, ricarica la pagina', 'err'); return; }
  showLoading(true);
  var result = await sb.from('cartelle').insert({
    user_id: currentUser.id,
    nome: nome,
    created_at: new Date().toISOString()
  }).select().single();
  showLoading(false);
  var data = result.data, error = result.error;
  if (error || !data) {
    toast('Errore creazione cartella: ' + ((error && error.message) || 'risposta vuota'), 'err');
    return;
  }
  closeM('modal-nuova-cart-global');
  toast('📁 Cartella "' + nome + '" creata!', 'ok');
  if (_gncCallback) {
    await _gncCallback(data.id, data.nome);
    _gncCallback = null;
  }
}

/* ═══════════════════════════════════════════════════
   STAMPA COMPATTA SPECIALISTICA — Utility condivisa
   Genera HTML in formato "compatto paziente" da una
   lista strutturata di pasti e lo mette in un div
   nascosto, poi chiama window.print().

   pasti: [{nome, emoji, ora, kcal, alimenti, note}, ...]
   opts:  {titolo, sottotitolo, totKcal, totProt, totCho, totFat, containerId, footerNote}
═══════════════════════════════════════════════════ */
function stampaCompattaSpecialistica(pasti, opts) {
  opts = opts || {};
  const containerId = opts.containerId || 'spec-compact-print-area';
  const container = document.getElementById(containerId);
  if (!container) { console.error('Container non trovato:', containerId); return; }

  const totKcal = opts.totKcal || 0;
  const totProt = opts.totProt || 0;
  const totCho  = opts.totCho  || 0;
  const totFat  = opts.totFat  || 0;
  const nMeals  = pasti.filter(p => p.alimenti && p.alimenti.trim()).length || pasti.length;
  const avgKcal = totKcal && nMeals ? Math.round(totKcal / nMeals) : 0;

  function escH(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  let html = `<div style="font-family:'DM Sans',sans-serif;max-width:700px;margin:0 auto;color:#1E293B">`;

  // Title block
  html += `<div style="text-align:center;padding-bottom:12px;margin-bottom:14px;border-bottom:1.5px solid #E2E8F0">`;
  if (opts.titolo) html += `<div style="font-size:18px;font-weight:700;color:#0F766E">${escH(opts.titolo)}</div>`;
  if (opts.sottotitolo) html += `<div style="font-size:13px;color:#475569;margin-top:3px">${escH(opts.sottotitolo)}</div>`;
  html += `</div>`;

  // Stats header bar
  const stats = [
    { val: totKcal || '—', lbl: 'KCAL TOTALI' },
    { val: totProt  || '—', lbl: 'PROTEINE (G)' },
    { val: totCho   || '—', lbl: 'CARBOIDRATI (G)' },
    { val: totFat   || '—', lbl: 'GRASSI (G)' },
    { val: avgKcal  || '—', lbl: 'KCAL/PASTO' }
  ];
  html += `<div style="display:flex;border:1.5px solid #CBD5E1;border-radius:10px;overflow:hidden;margin-bottom:18px">`;
  stats.forEach((s, i) => {
    html += `<div style="flex:1;text-align:center;padding:12px 6px;${i < stats.length-1 ? 'border-right:1.5px solid #CBD5E1' : ''}">`;
    html += `<div style="font-size:20px;font-weight:700;color:#0EA5E9">${s.val}</div>`;
    html += `<div style="font-size:9px;font-weight:600;color:#64748B;letter-spacing:.5px;margin-top:2px">${s.lbl}</div>`;
    html += `</div>`;
  });
  html += `</div>`;

  // Meals
  pasti.forEach(pasto => {
    if (!pasto.nome && !pasto.alimenti) return;
    html += `<div style="margin-bottom:12px;border-radius:10px;overflow:hidden;border:1.5px solid #E2E8F0;break-inside:avoid">`;

    // Green meal header
    html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:linear-gradient(135deg,#0D9488,#10B981)">`;
    html += `<div style="display:flex;align-items:center;gap:10px">`;
    if (pasto.emoji) html += `<span style="font-size:18px">${escH(pasto.emoji)}</span>`;
    html += `<span style="font-size:14px;font-weight:700;color:white">${escH(pasto.nome||'Pasto')}</span>`;
    if (pasto.ora) html += `<span style="font-size:12px;color:rgba(255,255,255,.75)">${escH(pasto.ora)}</span>`;
    html += `</div>`;
    if (pasto.kcal) html += `<span style="font-size:12px;color:rgba(255,255,255,.9);font-weight:600">≈ ${escH(String(pasto.kcal))} kcal</span>`;
    html += `</div>`;

    // Food lines (from textarea text, one line per item)
    if (pasto.alimenti && pasto.alimenti.trim()) {
      const lines = pasto.alimenti.split('\n').map(l => l.trim()).filter(l => l);
      lines.forEach(line => {
        html += `<div style="padding:8px 16px;border-bottom:1px solid #F1F5F9;font-size:13px;color:#1E293B">${escH(line)}</div>`;
      });
    }

    if (pasto.note && pasto.note.trim()) {
      html += `<div style="padding:6px 16px;font-size:11.5px;color:#64748B;font-style:italic;background:#FFFBEB">📝 ${escH(pasto.note)}</div>`;
    }

    html += `</div>`;
  });

  if (opts.footerNote) {
    html += `<div style="margin-top:10px;padding:10px 14px;background:#FFF7ED;border-radius:8px;font-size:12px;color:#7C2D12">⚠️ ${escH(opts.footerNote)}</div>`;
  }

  html += profiloFirmaHtml();
  html += `</div>`;

  container.innerHTML = html;
  document.body.dataset.printMode = 'compact';
  window.addEventListener('afterprint', () => { delete document.body.dataset.printMode; }, { once: true });
  setTimeout(() => window.print(), 300);
}

/* ═══════════════════════════════════════════════════
   buildStampaCompattaHtml — identica a stampaCompattaSpecialistica
   ma RITORNA l'HTML come stringa documento completo invece di stampare.
   Usata dalle funzioni salva* per memorizzare stampa_html nel DB.
═══════════════════════════════════════════════════ */
function buildStampaCompattaHtml(pasti, opts) {
  opts = opts || {};
  const totKcal = opts.totKcal || 0;
  const totProt = opts.totProt || 0;
  const totCho  = opts.totCho  || 0;
  const totFat  = opts.totFat  || 0;
  const nMeals  = pasti.filter(p => p.alimenti && p.alimenti.trim()).length || pasti.length;
  const avgKcal = totKcal && nMeals ? Math.round(totKcal / nMeals) : 0;
  const escH = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  let html = `<div style="font-family:'DM Sans',sans-serif;max-width:700px;margin:0 auto;color:#1E293B">`;
  html += `<div style="text-align:center;padding-bottom:12px;margin-bottom:14px;border-bottom:1.5px solid #E2E8F0">`;
  if (opts.titolo) html += `<div style="font-size:18px;font-weight:700;color:#0F766E">${escH(opts.titolo)}</div>`;
  if (opts.sottotitolo) html += `<div style="font-size:13px;color:#475569;margin-top:3px">${escH(opts.sottotitolo)}</div>`;
  html += `</div>`;

  const stats = [
    { val: totKcal || '—', lbl: 'KCAL TOTALI' },
    { val: totProt  || '—', lbl: 'PROTEINE (G)' },
    { val: totCho   || '—', lbl: 'CARBOIDRATI (G)' },
    { val: totFat   || '—', lbl: 'GRASSI (G)' },
    { val: avgKcal  || '—', lbl: 'KCAL/PASTO' }
  ];
  html += `<div style="display:flex;border:1.5px solid #CBD5E1;border-radius:10px;overflow:hidden;margin-bottom:18px">`;
  stats.forEach((s, i) => {
    html += `<div style="flex:1;text-align:center;padding:12px 6px;${i < stats.length-1 ? 'border-right:1.5px solid #CBD5E1' : ''}">`;
    html += `<div style="font-size:20px;font-weight:700;color:#0EA5E9">${s.val}</div>`;
    html += `<div style="font-size:9px;font-weight:600;color:#64748B;letter-spacing:.5px;margin-top:2px">${s.lbl}</div>`;
    html += `</div>`;
  });
  html += `</div>`;

  pasti.forEach(pasto => {
    if (!pasto.nome && !pasto.alimenti) return;
    html += `<div style="margin-bottom:12px;border-radius:10px;overflow:hidden;border:1.5px solid #E2E8F0;break-inside:avoid">`;
    html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:linear-gradient(135deg,#0D9488,#10B981);-webkit-print-color-adjust:exact;print-color-adjust:exact">`;
    html += `<div style="display:flex;align-items:center;gap:10px">`;
    if (pasto.emoji) html += `<span style="font-size:18px">${escH(pasto.emoji)}</span>`;
    html += `<span style="font-size:14px;font-weight:700;color:white">${escH(pasto.nome||'Pasto')}</span>`;
    if (pasto.ora) html += `<span style="font-size:12px;color:rgba(255,255,255,.75)">${escH(pasto.ora)}</span>`;
    html += `</div>`;
    if (pasto.kcal) html += `<span style="font-size:12px;color:rgba(255,255,255,.9);font-weight:600">≈ ${escH(String(pasto.kcal))} kcal</span>`;
    html += `</div>`;
    if (pasto.alimenti && pasto.alimenti.trim()) {
      pasto.alimenti.split('\n').map(l => l.trim()).filter(l => l).forEach(line => {
        html += `<div style="padding:8px 16px;border-bottom:1px solid #F1F5F9;font-size:13px;color:#1E293B">${escH(line)}</div>`;
      });
    }
    if (pasto.note && pasto.note.trim()) {
      html += `<div style="padding:6px 16px;font-size:11.5px;color:#64748B;font-style:italic;background:#FFFBEB">📝 ${escH(pasto.note)}</div>`;
    }
    html += `</div>`;
  });

  if (opts.footerNote) {
    html += `<div style="margin-top:10px;padding:10px 14px;background:#FFF7ED;border-radius:8px;font-size:12px;color:#7C2D12">⚠️ ${escH(opts.footerNote)}</div>`;
  }
  html += profiloFirmaHtml();
  html += `</div>`;

  const title = escH(opts.titolo || 'Stampa');
  return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>${title}</title>
<style>*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:'DM Sans','Segoe UI',Arial,sans-serif;color:#1E293B;font-size:11pt;line-height:1.5;padding:1.5cm 2cm 2.5cm}
@media screen{body{padding:20px}}</style></head><body>${html}</body></html>`;
}

/* ═══════════════════════════════════════════════════
   buildStampaSpecialisticaHTML — genera HTML di stampa da dati JSON
   (usato dalle funzioni salva* per precalcolare stampa_html)
═══════════════════════════════════════════════════ */

// Dati IDDSI per disfagia (mirror di disfagia.html)
const _IDDSI_META = {
  1:{nome:'Leggermente Addensato',bg:'#9CA3AF'},2:{nome:'Moderatamente Addensato',bg:'#EC4899'},
  3:{nome:'Liquidizzato',bg:'#F59E0B'},4:{nome:'Frullato / Passato',bg:'#10B981'},
  5:{nome:'Tritato Umido',bg:'#EF4444'},6:{nome:'Morbido a Pezzi',bg:'#3B82F6'},
  7:{nome:'Facile da Masticare',bg:'#F97316'}
};
const _IDDSI_DIETE = {
  1:{kcal_base:1785,nota:'⚠️ Tutti i liquidi devono essere addensati con addensante certificato. ONS spesso necessari.',pasti:[
    {nome:'Colazione',emoji:'🌅',items:[{nome:'Latte intero + addensante',qt:300,unit:'mL',kcal:195},{nome:'Succo di arancia setacciato + addensante',qt:150,unit:'mL',kcal:60},{nome:'Maltodestrine in polvere',qt:40,unit:'g',kcal:155}]},
    {nome:'Spuntino Mattino',emoji:'🍊',items:[{nome:'ONS liquido addensato (es. Ensure Plus)',qt:200,unit:'mL',kcal:300}]},
    {nome:'Pranzo',emoji:'🍽️',items:[{nome:'Vellutata di verdure passata al setaccio fine',qt:350,unit:'mL',kcal:170},{nome:'Frullato di pollo passato al setaccio',qt:80,unit:'g',kcal:100},{nome:'Olio extra vergine di oliva',qt:15,unit:'g',kcal:135},{nome:'Succo di pesca + addensante',qt:100,unit:'mL',kcal:40}]},
    {nome:'Spuntino Pomeriggio',emoji:'☕',items:[{nome:'Yogurt bianco intero setacciato',qt:125,unit:'g',kcal:100}]},
    {nome:'Cena',emoji:'🌙',items:[{nome:'Crema di patate + brodo addensato',qt:350,unit:'mL',kcal:200},{nome:'Frullato di merluzzo passato al setaccio',qt:80,unit:'g',kcal:80},{nome:'Olio extra vergine di oliva',qt:15,unit:'g',kcal:135},{nome:'Budino / crema fluida dolce',qt:100,unit:'g',kcal:115}]}
  ]},
  2:{kcal_base:1807,nota:'⚠️ Consistenza "Nectare" — addensare tutte le bevande. Monitorare idratazione.',pasti:[
    {nome:'Colazione',emoji:'🌅',items:[{nome:'Latte intero + addensante',qt:300,unit:'mL',kcal:195},{nome:'Semolino cotto fluido addensato',qt:80,unit:'g',kcal:197},{nome:'Miele',qt:10,unit:'g',kcal:30}]},
    {nome:'Spuntino Mattino',emoji:'🍊',items:[{nome:'ONS denso addensato (es. Fortisip Compact)',qt:200,unit:'mL',kcal:300}]},
    {nome:'Pranzo',emoji:'🍽️',items:[{nome:'Vellutata di zucca passata finissima',qt:350,unit:'mL',kcal:175},{nome:'Carne (tacchino) frullata passata al setaccio',qt:80,unit:'g',kcal:100},{nome:'Olio extra vergine di oliva',qt:15,unit:'g',kcal:135},{nome:'Composta di frutta passata finissima',qt:100,unit:'g',kcal:50}]},
    {nome:'Spuntino Pomeriggio',emoji:'☕',items:[{nome:'Yogurt greco setacciato',qt:125,unit:'g',kcal:100}]},
    {nome:'Cena',emoji:'🌙',items:[{nome:'Crema di legumi passata (lenticchie/piselli)',qt:300,unit:'mL',kcal:200},{nome:'Pesce (sogliola) frullato passato al setaccio',qt:80,unit:'g',kcal:80},{nome:'Olio extra vergine di oliva',qt:15,unit:'g',kcal:135},{nome:'Crema dolce alla vaniglia',qt:100,unit:'g',kcal:110}]}
  ]},
  3:{kcal_base:1804,nota:'Consistenza "Miele" — frullare tutto finemente. Eliminare grumi, fibre dure, bucce.',pasti:[
    {nome:'Colazione',emoji:'🌅',items:[{nome:'Latte intero con cereali frullati setacciati',qt:300,unit:'mL',kcal:220},{nome:'Banana frullata fine (liquidizzata)',qt:100,unit:'g',kcal:89},{nome:'Miele',qt:15,unit:'g',kcal:45}]},
    {nome:'Spuntino Mattino',emoji:'🍊',items:[{nome:'ONS crema (es. Ensure Plus Crema)',qt:200,unit:'mL',kcal:300}]},
    {nome:'Pranzo',emoji:'🍽️',items:[{nome:'Minestrone liquidizzato passato (senza bucce)',qt:400,unit:'mL',kcal:210},{nome:'Carne frullata (consistenza liquidizzata)',qt:80,unit:'g',kcal:100},{nome:'Olio extra vergine di oliva',qt:15,unit:'g',kcal:135},{nome:'Composta di frutta frullata finissima',qt:120,unit:'g',kcal:60}]},
    {nome:'Spuntino Pomeriggio',emoji:'☕',items:[{nome:'Yogurt cremoso intero',qt:125,unit:'g',kcal:100}]},
    {nome:'Cena',emoji:'🌙',items:[{nome:'Passata di legumi densa (ceci/lenticchie)',qt:300,unit:'mL',kcal:200},{nome:'Pesce frullato (liquidizzato, senza lische)',qt:80,unit:'g',kcal:80},{nome:'Olio extra vergine di oliva',qt:15,unit:'g',kcal:135},{nome:'Crema / budino denso',qt:120,unit:'g',kcal:130}]}
  ]},
  4:{kcal_base:1806,nota:'Consistenza "Budino" — no grumi, no fibre, no pezzi. Preparare tutto in purè omogeneo.',pasti:[
    {nome:'Colazione',emoji:'🌅',items:[{nome:'Porridge di farina di riso (latte + farina riso)',qt:250,unit:'g',kcal:280},{nome:'Yogurt greco cremoso',qt:100,unit:'g',kcal:80},{nome:'Miele',qt:15,unit:'g',kcal:45}]},
    {nome:'Spuntino Mattino',emoji:'🍊',items:[{nome:'Crema di frutta cotta frullata densa',qt:150,unit:'g',kcal:90},{nome:'Biscotti ammollati e frullati (senza grumi)',qt:30,unit:'g',kcal:135}]},
    {nome:'Pranzo',emoji:'🍽️',items:[{nome:'Purè di verdure miste (zucca, patata, carota)',qt:300,unit:'g',kcal:180},{nome:'Purè di pollo con besciamella morbida',qt:100,unit:'g',kcal:155},{nome:'Olio extra vergine di oliva',qt:10,unit:'g',kcal:90},{nome:'Purè di frutta cotta (mela/pera)',qt:100,unit:'g',kcal:60}]},
    {nome:'Spuntino Pomeriggio',emoji:'☕',items:[{nome:'Yogurt cremoso con frutta frullata',qt:150,unit:'g',kcal:130}]},
    {nome:'Cena',emoji:'🌙',items:[{nome:'Purè di patate morbido (senza grumi)',qt:200,unit:'g',kcal:170},{nome:'Purè di merluzzo al latte (senza lische)',qt:100,unit:'g',kcal:135},{nome:'Olio extra vergine di oliva',qt:10,unit:'g',kcal:90},{nome:'Crema pasticcera densa',qt:100,unit:'g',kcal:130}]}
  ]},
  5:{kcal_base:1753,nota:'Pezzi ≤ 4mm × 15mm, morbidi e umidi. Carne tritata fine con sugo; pesce sminuzzato.',pasti:[
    {nome:'Colazione',emoji:'🌅',items:[{nome:'Latte intero',qt:250,unit:'mL',kcal:163},{nome:'Pane morbido bagnato nel latte (senza crosta)',qt:40,unit:'g',kcal:100},{nome:'Miele',qt:15,unit:'g',kcal:45},{nome:'Budino morbido',qt:100,unit:'g',kcal:115}]},
    {nome:'Spuntino Mattino',emoji:'🍊',items:[{nome:'Yogurt greco con frutta matura tritata fine',qt:150,unit:'g',kcal:130}]},
    {nome:'Pranzo',emoji:'🍽️',items:[{nome:'Pastina in brodo (ben cotta, grana fine)',qt:80,unit:'g',kcal:285},{nome:'Carne macinata tenera in umido con sugo',qt:80,unit:'g',kcal:155},{nome:'Verdure cotte tenere a piccoli pezzi (≤4mm)',qt:100,unit:'g',kcal:60},{nome:'Olio extra vergine di oliva',qt:10,unit:'g',kcal:90}]},
    {nome:'Spuntino Pomeriggio',emoji:'☕',items:[{nome:'Crema / mousse di frutta morbida',qt:150,unit:'g',kcal:90}]},
    {nome:'Cena',emoji:'🌙',items:[{nome:'Riso stracotto in brodo (ben tenero)',qt:80,unit:'g',kcal:270},{nome:'Pesce sminuzzato in umido con salsa (≤4mm)',qt:100,unit:'g',kcal:120},{nome:'Carote / zucchine cotte a pezzetti (≤4mm)',qt:100,unit:'g',kcal:40},{nome:'Olio extra vergine di oliva',qt:10,unit:'g',kcal:90}]}
  ]},
  6:{kcal_base:1823,nota:'Pezzi ≤ 15mm × 15mm, morbidi, facilmente masticabili. Evitare pane croccante, carni dure, noci, vegetali crudi.',pasti:[
    {nome:'Colazione',emoji:'🌅',items:[{nome:'Latte intero',qt:250,unit:'mL',kcal:163},{nome:'Pane morbido (senza crosta dura)',qt:60,unit:'g',kcal:150},{nome:'Marmellata / confettura',qt:20,unit:'g',kcal:52},{nome:'Burro morbido',qt:10,unit:'g',kcal:74}]},
    {nome:'Spuntino Mattino',emoji:'🍊',items:[{nome:'Yogurt greco con frutta morbida a pezzi',qt:150,unit:'g',kcal:130}]},
    {nome:'Pranzo',emoji:'🍽️',items:[{nome:'Pasta ben cotta con sugo morbido',qt:80,unit:'g',kcal:284},{nome:'Pesce al forno morbido (merluzzo / orata)',qt:120,unit:'g',kcal:132},{nome:'Verdure cotte morbide a pezzi (≤15mm)',qt:150,unit:'g',kcal:60},{nome:'Olio extra vergine di oliva',qt:15,unit:'g',kcal:135}]},
    {nome:'Spuntino Pomeriggio',emoji:'☕',items:[{nome:'Frutta morbida matura (pesca, pera, banana)',qt:200,unit:'g',kcal:100}]},
    {nome:'Cena',emoji:'🌙',items:[{nome:'Riso ben cotto (risotto morbido)',qt:80,unit:'g',kcal:268},{nome:'Uova strapazzate morbide (2 uova)',qt:100,unit:'g',kcal:145},{nome:'Formaggio molle (ricotta / stracchino)',qt:50,unit:'g',kcal:130}]}
  ]},
  7:{kcal_base:1845,nota:'Dieta normale ma con esclusione di alimenti duri, croccanti, appiccicosi o difficili da masticare.',pasti:[
    {nome:'Colazione',emoji:'🌅',items:[{nome:'Latte intero',qt:250,unit:'mL',kcal:163},{nome:'Pane morbido / panino soffice (senza crosta dura)',qt:60,unit:'g',kcal:150},{nome:'Marmellata / confettura',qt:20,unit:'g',kcal:52},{nome:'Olio extra vergine di oliva',qt:10,unit:'g',kcal:90}]},
    {nome:'Spuntino Mattino',emoji:'🍊',items:[{nome:'Yogurt intero con frutta morbida',qt:150,unit:'g',kcal:130}]},
    {nome:'Pranzo',emoji:'🍽️',items:[{nome:'Pasta (formati morbidi: rigatoni, penne) ben cotta',qt:80,unit:'g',kcal:284},{nome:'Pollo / tacchino arrosto morbido (senza cartilagini)',qt:120,unit:'g',kcal:166},{nome:'Insalata tenera o verdure cotte',qt:150,unit:'g',kcal:30},{nome:'Olio extra vergine di oliva',qt:15,unit:'g',kcal:135}]},
    {nome:'Spuntino Pomeriggio',emoji:'☕',items:[{nome:'Frutta matura morbida (pesca, pera, banana, kiwi)',qt:200,unit:'g',kcal:100}]},
    {nome:'Cena',emoji:'🌙',items:[{nome:'Riso / pasta ben cotta',qt:70,unit:'g',kcal:233},{nome:'Pesce al forno (merluzzo, sogliola, salmone)',qt:120,unit:'g',kcal:132},{nome:'Verdure cotte morbide (zucchine, carote, spinaci)',qt:150,unit:'g',kcal:60},{nome:'Olio extra vergine di oliva',qt:15,unit:'g',kcal:135}]}
  ]}
};

function buildStampaSpecialisticaHTML(dati, tipo, nota) {
  const esc = s => (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const LABELS = {
    diabete:'🩸 Diabete', pediatria:'👶 Pediatria', sport:'🏃 Nutrizione Sportiva',
    pancreas:'🫁 Pancreas', disfagia:'💧 Disfagia', dca:'🧠 Sessione DCA',
    ristorazione:'🍽️ Ristorazione', renale:'🫘 Nefropatia', chetogenica:'🥑 Chetogenica',
    paziente_sano:'🌿 Paziente Sano',
  };
  const COLORI = {
    diabete:'#3B82F6', pediatria:'#EC4899', sport:'#F97316', pancreas:'#8B5CF6',
    disfagia:'#06B6D4', dca:'#7C3AED', ristorazione:'#0F766E', renale:'#f97316', chetogenica:'#0891b2',
    paziente_sano:'#16A34A',
  };
  const label  = LABELS[tipo]  || tipo;
  const colore = COLORI[tipo]  || '#1a7f5a';
  const nome   = nota || label;
  const piano  = dati.piano || {};
  const WRAP = inner => `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>${esc(nome)}</title>
<style>*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:'DM Sans','Segoe UI',Arial,sans-serif;color:#1E293B;font-size:11pt;line-height:1.5;padding:1.5cm 2cm 2.5cm}
@media screen{body{padding:20px}}</style></head><body>${inner}</body></html>`;

  const infoGrid = (items, col) => {
    const vis = items.filter(i => i.val);
    if (!vis.length) return '';
    const c = col || colore;
    let h = `<div style="display:grid;grid-template-columns:repeat(${Math.min(vis.length,3)},1fr);gap:10px;margin-bottom:14px">`;
    vis.forEach(i => {
      h += `<div style="background:#F8FAFC;border-radius:8px;padding:10px 12px;border-left:3px solid ${c}">
        <div style="font-size:9pt;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">${i.label}</div>
        <div style="font-size:11pt;font-weight:700;color:#1E293B">${esc(String(i.val))}</div>
      </div>`;
    });
    return h + '</div>';
  };

  // ── Pasti-based types: exact stampaCompattaSpecialistica layout ───────────
  const PASTI_TIPI = ['diabete', 'pediatria', 'sport', 'pancreas', 'dca', 'renale'];
  if (PASTI_TIPI.includes(tipo)) {
    const totKcal = parseFloat(piano.kcal) || 0;
    const totCho  = parseFloat(piano.cho_tot) || 0;
    const totProt = parseFloat(piano.prot_tot) || (totKcal ? Math.round(totKcal * 0.15 / 4) : 0);
    const totFat  = parseFloat(piano.grassi_tot) || (totKcal ? Math.round(totKcal * 0.25 / 9) : 0);
    const pasti = (piano.pasti || dati.pasti || []).filter(p => p.alimenti?.trim());
    const avgKcal = totKcal && pasti.length ? Math.round(totKcal / pasti.length) : 0;

    let sub = '';
    if (tipo === 'diabete' && piano.tipo) sub = 'Tipo: ' + piano.tipo + (piano.insulina ? ' · Insulina: ' + piano.insulina : '');
    else if (tipo === 'sport' && (piano.sport || piano.obiettivo)) sub = piano.sport || piano.obiettivo;
    else if (tipo === 'pancreas' && piano.enzima) sub = 'Enzima: ' + piano.enzima;
    else if (tipo === 'renale') sub = 'Emodialisi — Giornata Senza Dialisi';

    const stats = [
      { val: totKcal || '—', lbl: 'KCAL TOTALI' },
      { val: totProt || '—', lbl: 'PROTEINE (G)' },
      { val: totCho  || '—', lbl: 'CARBOIDRATI (G)' },
      { val: totFat  || '—', lbl: 'GRASSI (G)' },
      { val: avgKcal || '—', lbl: 'KCAL/PASTO' },
    ];

    let body = `<div style="font-family:'DM Sans',sans-serif;max-width:700px;margin:0 auto;color:#1E293B">`;
    body += `<div style="text-align:center;padding-bottom:12px;margin-bottom:14px;border-bottom:1.5px solid #E2E8F0">`;
    body += `<div style="font-size:18px;font-weight:700;color:#0F766E">${esc(nome)}</div>`;
    if (sub) body += `<div style="font-size:13px;color:#475569;margin-top:3px">${esc(sub)}</div>`;
    body += `</div>`;

    body += `<div style="display:flex;border:1.5px solid #CBD5E1;border-radius:10px;overflow:hidden;margin-bottom:18px">`;
    stats.forEach((s, i) => {
      body += `<div style="flex:1;text-align:center;padding:12px 6px;${i < stats.length - 1 ? 'border-right:1.5px solid #CBD5E1' : ''}">`;
      body += `<div style="font-size:20px;font-weight:700;color:#0EA5E9">${s.val}</div>`;
      body += `<div style="font-size:9px;font-weight:600;color:#64748B;letter-spacing:.5px;margin-top:2px">${s.lbl}</div>`;
      body += `</div>`;
    });
    body += `</div>`;

    if (piano.note_cliniche?.trim()) {
      body += `<div style="background:#EFF6FF;border-left:4px solid #3B82F6;border-radius:6px;padding:10px 14px;margin-bottom:14px;font-size:10pt;color:#1E3A5F;white-space:pre-wrap">📋 ${esc(piano.note_cliniche)}</div>`;
    }

    pasti.forEach(pasto => {
      const energia = pasto.kcal ? `≈ ${pasto.kcal} kcal` : (pasto.cho ? `${pasto.cho} g CHO` : '');
      body += `<div style="margin-bottom:12px;border-radius:10px;overflow:hidden;border:1.5px solid #E2E8F0;break-inside:avoid">`;
      body += `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:linear-gradient(135deg,#0D9488,#10B981);-webkit-print-color-adjust:exact;print-color-adjust:exact">`;
      body += `<div style="display:flex;align-items:center;gap:10px">`;
      if (pasto.emoji) body += `<span style="font-size:18px">${esc(pasto.emoji)}</span>`;
      body += `<span style="font-size:14px;font-weight:700;color:white">${esc(pasto.nome || 'Pasto')}</span>`;
      if (pasto.ora) body += `<span style="font-size:12px;color:rgba(255,255,255,.75)">${esc(pasto.ora)}</span>`;
      body += `</div>`;
      if (energia) body += `<span style="font-size:12px;color:rgba(255,255,255,.9);font-weight:600">${esc(energia)}</span>`;
      body += `</div>`;
      pasto.alimenti.split('\n').map(l => l.trim()).filter(Boolean).forEach(line => {
        body += `<div style="padding:8px 16px;border-bottom:1px solid #F1F5F9;font-size:13px;color:#1E293B">${esc(line)}</div>`;
      });
      const noteText = (pasto.note?.trim()) || (pasto.cho && !pasto.kcal ? `CHO: ${pasto.cho} g` : '');
      if (noteText) body += `<div style="padding:6px 16px;font-size:11.5px;color:#64748B;font-style:italic;background:#FFFBEB">📝 ${esc(noteText)}</div>`;
      body += `</div>`;
    });

    if (piano.note_generali?.trim()) {
      body += `<div style="margin-top:10px;padding:10px 14px;background:#FFF7ED;border-radius:8px;font-size:12px;color:#7C2D12">⚠️ ${esc(piano.note_generali)}</div>`;
    }

    body += `<div style="margin-top:20px;padding-top:10px;border-top:1px solid #E2E8F0;font-size:9pt;color:#94A3B8;text-align:center">DietPlan Pro · ${esc(label)}</div></div>`;
    return WRAP(body);
  }

  // ── Ristorazione: portate layout ──────────────────────────────────────────
  if (tipo === 'ristorazione') {
    const portate = (piano.portate || []).filter(p => p.menu?.trim());
    let body = `<div style="background:${colore};color:white;padding:16px 20px;border-radius:10px;margin-bottom:16px;-webkit-print-color-adjust:exact;print-color-adjust:exact">
      <div style="font-size:18pt;font-weight:700">${esc(nome)}</div>
      <div style="font-size:10pt;opacity:.8;margin-top:4px">${esc(label)} · DietPlan Pro</div>
    </div>`;
    body += infoGrid([
      { label:'🏛️ Struttura', val: piano.tipo },
      { label:'👥 Coperti',   val: piano.coperti },
      { label:'🔥 Kcal/die',  val: piano.kcal },
      { label:'👤 Utenza',    val: piano.utenza },
    ]);
    if (piano.diete?.trim()) body += `<div style="background:#F0FDF4;border-left:4px solid #16A34A;border-radius:6px;padding:10px 14px;margin-bottom:14px;font-size:10pt;color:#14532D;white-space:pre-wrap">🥗 Diete speciali: ${esc(piano.diete)}</div>`;
    if (piano.allergeni?.trim()) body += `<div style="background:#FEF2F2;border-left:4px solid #EF4444;border-radius:6px;padding:10px 14px;margin-bottom:14px;font-size:10pt;color:#7F1D1D;white-space:pre-wrap">⚠️ Allergeni: ${esc(piano.allergeni)}</div>`;
    portate.forEach(portata => {
      body += `<div style="margin-bottom:12px;border-radius:10px;overflow:hidden;border:1.5px solid #E2E8F0;break-inside:avoid">
        <div style="padding:10px 16px;background:linear-gradient(135deg,#0D9488,#10B981);-webkit-print-color-adjust:exact;print-color-adjust:exact;display:flex;align-items:center;justify-content:space-between">
          <span style="font-size:14px;font-weight:700;color:white">${esc(portata.nome || 'Portata')}</span>
          ${portata.porzione ? `<span style="font-size:12px;color:rgba(255,255,255,.9)">${esc(portata.porzione)}</span>` : ''}
        </div>`;
      portata.menu.split('\n').map(l => l.trim()).filter(Boolean).forEach(line => {
        body += `<div style="padding:8px 16px;border-bottom:1px solid #F1F5F9;font-size:13px">${esc(line)}</div>`;
      });
      if (portata.note?.trim()) body += `<div style="padding:6px 16px;font-size:11.5px;color:#64748B;font-style:italic;background:#FFFBEB">📝 ${esc(portata.note)}</div>`;
      body += `</div>`;
    });
    if (piano.note_generali?.trim()) body += `<div style="background:#FFF7ED;border-left:4px solid #F59E0B;border-radius:6px;padding:10px 14px;margin-top:10px;font-size:10pt;color:#78350F;white-space:pre-wrap">📌 ${esc(piano.note_generali)}</div>`;
    body += `<div style="margin-top:20px;padding-top:10px;border-top:1px solid #E2E8F0;font-size:9pt;color:#94A3B8;text-align:center">DietPlan Pro · ${esc(label)}</div>`;
    return WRAP(body);
  }

  // ── Disfagia: IDDSI full meal plan ────────────────────────────────────────
  if (tipo === 'disfagia' && dati.iddsi && _IDDSI_DIETE[dati.iddsi]) {
    const meta  = _IDDSI_META[dati.iddsi]  || { nome: 'Livello ' + dati.iddsi, bg: '#06B6D4' };
    const dieta = _IDDSI_DIETE[dati.iddsi];
    const targetKcal = parseFloat(dati.kcal) || dieta.kcal_base;
    const scale = targetKcal / dieta.kcal_base;

    let totKcal = 0;
    dieta.pasti.forEach(p => { totKcal += p.items.reduce((s, it) => s + it.kcal, 0); });
    totKcal = Math.round(totKcal * scale);
    const avgKcal = dieta.pasti.length ? Math.round(totKcal / dieta.pasti.length) : 0;
    const totProt = Math.round(totKcal * 0.16 / 4);
    const totCho  = Math.round(totKcal * 0.50 / 4);
    const totFat  = Math.round(totKcal * 0.34 / 9);

    let body = `<div style="font-family:'DM Sans',sans-serif;max-width:700px;margin:0 auto;color:#1E293B">`;
    body += `<div style="text-align:center;padding-bottom:12px;margin-bottom:14px;border-bottom:1.5px solid #E2E8F0">`;
    body += `<div style="font-size:18px;font-weight:700;color:#0F766E">${esc(nome)}</div>`;
    body += `<div style="display:inline-flex;align-items:center;gap:8px;margin-top:6px;background:${meta.bg};color:white;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;-webkit-print-color-adjust:exact;print-color-adjust:exact">IDDSI ${esc(String(dati.iddsi))} · ${esc(meta.nome)}</div>`;
    body += `</div>`;

    const stats = [
      { val: totKcal || '—', lbl: 'KCAL TOTALI' },
      { val: totProt || '—', lbl: 'PROTEINE (G)' },
      { val: totCho  || '—', lbl: 'CARBOIDRATI (G)' },
      { val: totFat  || '—', lbl: 'GRASSI (G)' },
      { val: avgKcal || '—', lbl: 'KCAL/PASTO' },
    ];
    body += `<div style="display:flex;border:1.5px solid #CBD5E1;border-radius:10px;overflow:hidden;margin-bottom:18px">`;
    stats.forEach((s, i) => {
      body += `<div style="flex:1;text-align:center;padding:12px 6px;${i < stats.length - 1 ? 'border-right:1.5px solid #CBD5E1' : ''}">`;
      body += `<div style="font-size:20px;font-weight:700;color:#0EA5E9">${s.val}</div>`;
      body += `<div style="font-size:9px;font-weight:600;color:#64748B;letter-spacing:.5px;margin-top:2px">${s.lbl}</div>`;
      body += `</div>`;
    });
    body += `</div>`;

    dieta.pasti.forEach(pasto => {
      const pKcal = Math.round(pasto.items.reduce((s, it) => s + it.kcal, 0) * scale);
      body += `<div style="margin-bottom:12px;border-radius:10px;overflow:hidden;border:1.5px solid #E2E8F0;break-inside:avoid">`;
      body += `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:linear-gradient(135deg,#0D9488,#10B981);-webkit-print-color-adjust:exact;print-color-adjust:exact">`;
      body += `<div style="display:flex;align-items:center;gap:10px">`;
      if (pasto.emoji) body += `<span style="font-size:18px">${pasto.emoji}</span>`;
      body += `<span style="font-size:14px;font-weight:700;color:white">${esc(pasto.nome)}</span>`;
      body += `</div>`;
      body += `<span style="font-size:12px;color:rgba(255,255,255,.9);font-weight:600">≈ ${pKcal} kcal</span>`;
      body += `</div>`;
      pasto.items.forEach(item => {
        const qt = Math.round(item.qt * scale);
        body += `<div style="padding:8px 16px;border-bottom:1px solid #F1F5F9;font-size:13px;color:#1E293B">${esc(item.nome)} — ${qt} ${esc(item.unit)}</div>`;
      });
      body += `</div>`;
    });

    if (dieta.nota) {
      body += `<div style="margin-top:10px;padding:10px 14px;background:#FFF7ED;border-radius:8px;font-size:12px;color:#7C2D12">${esc(dieta.nota)}</div>`;
    }
    body += `<div style="margin-top:20px;padding-top:10px;border-top:1px solid #E2E8F0;font-size:9pt;color:#94A3B8;text-align:center">DietPlan Pro · ${esc(label)}</div></div>`;
    return WRAP(body);
  }

  // ── Chetogenica / Renale / altro: info grid layout ────────────────────────
  let body = `<div style="background:${colore};color:white;padding:16px 20px;border-radius:10px;margin-bottom:16px;-webkit-print-color-adjust:exact;print-color-adjust:exact">
    <div style="font-size:18pt;font-weight:700">${esc(nome)}</div>
    <div style="font-size:10pt;opacity:.8;margin-top:4px">${esc(label)} · DietPlan Pro</div>
  </div>`;

  if (tipo === 'chetogenica') {
    const c = dati.calcolo || {};
    body += infoGrid([
      { label:'⚖️ Peso',       val: c.peso    ? c.peso    + ' kg'   : '' },
      { label:'📏 Altezza',    val: c.altezza ? c.altezza + ' cm'   : '' },
      { label:'🎂 Età',        val: c.eta     ? c.eta     + ' anni' : '' },
      { label:'🚶 Attività',   val: c.attivita },
      { label:'🥑 Tipo dieta', val: c.tipo },
      { label:'🎯 Obiettivo',  val: c.obiettivo },
    ]);
    if (dati.gki?.glicemia || dati.gki?.chetoni) {
      body += infoGrid([
        { label:'🩸 Glicemia', val: dati.gki.glicemia ? dati.gki.glicemia + ' mg/dL'  : '' },
        { label:'🔬 Chetoni',  val: dati.gki.chetoni  ? dati.gki.chetoni  + ' mmol/L' : '' },
      ]);
    }
  }

  if (tipo === 'renale') {
    const c = dati.calcolo || {};
    body += infoGrid([
      { label:'⚖️ Peso',        val: c.peso        ? c.peso        + ' kg'   : '' },
      { label:'🏋️ Peso ideale', val: c.peso_ideale ? c.peso_ideale + ' kg'   : '' },
      { label:'📏 Altezza',     val: c.altezza     ? c.altezza     + ' cm'   : '' },
      { label:'🎂 Età',         val: c.eta         ? c.eta         + ' anni' : '' },
      { label:'🏥 Stadio IRC',  val: c.stadio },
      { label:'🚶 Attività',    val: c.attivita },
    ]);
  }

  if (piano.note_cliniche?.trim()) {
    body += `<div style="background:#EFF6FF;border-left:4px solid #3B82F6;border-radius:6px;padding:10px 14px;margin-bottom:14px;font-size:10pt;color:#1E3A5F;white-space:pre-wrap">📋 ${esc(piano.note_cliniche)}</div>`;
  }

  const pasti = piano.pasti || dati.pasti || [];
  pasti.filter(p => p.alimenti?.trim()).forEach(pasto => {
    const energia = pasto.kcal ? `≈ ${pasto.kcal} kcal` : (pasto.cho ? `${pasto.cho} g CHO` : '');
    body += `<div style="margin-bottom:12px;border-radius:10px;overflow:hidden;border:1.5px solid #E2E8F0;break-inside:avoid">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:linear-gradient(135deg,#0D9488,#10B981);-webkit-print-color-adjust:exact;print-color-adjust:exact">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:14px;font-weight:700;color:white">${esc(pasto.nome||'Pasto')}</span>
          ${pasto.ora ? `<span style="font-size:12px;color:rgba(255,255,255,.75)">${esc(pasto.ora)}</span>` : ''}
        </div>
        ${energia ? `<span style="font-size:12px;color:rgba(255,255,255,.9);font-weight:600">${esc(energia)}</span>` : ''}
      </div>`;
    pasto.alimenti.split('\n').map(l => l.trim()).filter(Boolean).forEach(line => {
      body += `<div style="padding:8px 16px;border-bottom:1px solid #F1F5F9;font-size:13px;color:#1E293B">${esc(line)}</div>`;
    });
    if (pasto.note?.trim()) body += `<div style="padding:6px 16px;font-size:11.5px;color:#64748B;font-style:italic;background:#FFFBEB">📝 ${esc(pasto.note)}</div>`;
    body += `</div>`;
  });

  if (piano.note_generali?.trim()) {
    body += `<div style="background:#FFF7ED;border-left:4px solid #F59E0B;border-radius:6px;padding:10px 14px;margin-top:10px;font-size:10pt;color:#78350F;white-space:pre-wrap">📌 ${esc(piano.note_generali)}</div>`;
  }

  body += `<div style="margin-top:20px;padding-top:10px;border-top:1px solid #E2E8F0;font-size:9pt;color:#94A3B8;text-align:center">DietPlan Pro · ${esc(label)}</div>`;
  return WRAP(body);
}

/* ═══════════════════════════════════════════════════
   PORZIONI — Snap al multiplo/sottomultiplo più vicino
   _snapPortion(std, scaled) → integer
═══════════════════════════════════════════════════ */
function _snapPortion(std, scaled) {
  if (!std || std <= 0 || !scaled || scaled <= 0) return Math.round(scaled);
  const maxK = Math.max(Math.ceil(scaled / std) + 2, 5);
  let best = std;
  let bestDiff = Math.abs(std - scaled);
  for (let k = 1; k <= maxK; k++) {
    const c = std * k;
    const d = Math.abs(c - scaled);
    if (d < bestDiff) { bestDiff = d; best = c; }
  }
  for (let k = 2; k <= 8; k++) {
    const c = std / k;
    const d = Math.abs(c - scaled);
    if (d < bestDiff) { bestDiff = d; best = c; }
  }
  return Math.round(best);
}

/* ═══════════════════════════════════════════════════
   PIANO ESEMPIO SPECIALISTICO — Utility condivisa
   initPianoEsempio(containerId, config)
═══════════════════════════════════════════════════ */
function initPianoEsempio(containerId, config) {
  const container = document.getElementById(containerId);
  if (!container) { console.warn('initPianoEsempio: container not found:', containerId); return; }

  const _id = config.id;
  const _tipi = config.tipi || [];
  const _kcals = config.kcals || [];
  const _piani = config.piani || {};
  let _selTipo = _tipi.length ? _tipi[0].id : null;
  let _selKcal = _kcals.length ? _kcals[Math.floor(_kcals.length / 2)] : null;

  function escH(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function _renderSelector() {
    let html = `<div class="pe-selector no-print" style="background:white;border-radius:var(--r);border:1.5px solid var(--border);padding:18px;margin-bottom:18px;box-shadow:var(--shadow)">`;
    html += `<h3 style="font-size:14px;font-weight:700;color:var(--slate);margin-bottom:14px">⚙️ Seleziona Tipo di Dieta${_kcals.length ? ' e Calorie Target' : ''}</h3>`;
    html += `<div style="display:grid;grid-template-columns:${_kcals.length ? '1fr 1fr' : '1fr'};gap:16px;flex-wrap:wrap">`;
    html += `<div><div style="font-size:11px;font-weight:700;color:var(--slate-m);text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Tipo di Dieta</div>`;
    html += `<div id="pe-tipo-btns-${_id}" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px">`;
    _tipi.forEach(t => {
      const active = t.id === _selTipo;
      html += `<button class="pe-tipo-btn${active?' active':''}" 
        data-tipo="${escH(t.id)}"
        data-col="${escH(t.colore)}"
        data-colt="${escH(t.coloreT||'#fff')}"
        style="padding:7px 14px;border-radius:8px;border:1.5px solid ${active?t.colore:'var(--border-d)'};background:${active?t.colore:'white'};color:${active?(t.coloreT||'#fff'):'var(--slate-m)'};font-size:12.5px;font-weight:600;cursor:pointer;transition:all .18s;font-family:inherit;line-height:1.3"
        onclick="_peSel('${_id}','tipo','${escH(t.id)}')">${escH(t.nome)}</button>`;
    });
    html += `</div></div>`;
    if (_kcals.length) {
      html += `<div><div style="font-size:11px;font-weight:700;color:var(--slate-m);text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Target Calorico</div>`;
      html += `<div id="pe-kcal-btns-${_id}" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px">`;
      _kcals.forEach(k => {
        const active = k === _selKcal;
        html += `<button class="pe-kcal-btn${active?' active':''}"
          style="padding:7px 16px;border-radius:8px;border:1.5px solid ${active?config.accentColor:'var(--border-d)'};background:${active?config.accentColor:'white'};color:${active?'white':'var(--slate-m)'};font-size:13px;font-weight:600;cursor:pointer;transition:all .18s;font-family:inherit"
          onclick="_peSel('${_id}','kcal',${k})">${k} kcal</button>`;
      });
      html += `</div></div>`;
    }
    html += `</div></div>`;
    return html;
  }

  function _renderPiano() {
    const piano = _piani[_selTipo];
    if (!piano) return '<div style="color:var(--slate-l);font-size:13px;padding:20px">Seleziona un tipo di dieta.</div>';
    const tipo = _tipi.find(t => t.id === _selTipo);
    const factor = (_selKcal && piano.kcal_base) ? _selKcal / piano.kcal_base : 1;
    let totKcal = 0;
    piano.pasti.forEach(p => p.items.forEach(i => totKcal += (i.kcal||0)));
    const scaledKcal = Math.round(totKcal * factor);
    const macros = piano.macros || {p:15, cho:50, g:35};

    let html = '';
    html += `<div style="background:${tipo?tipo.colore+'18':'#f0fdf4'};border:1.5px solid ${tipo?tipo.colore+'40':'#a7f3d0'};border-radius:14px;padding:14px 16px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:10px">`;
    html += `<div>`;
    html += `<div style="font-size:15px;font-weight:700;color:${tipo?tipo.colore:'var(--teal)'};margin-bottom:4px">${escH(tipo?tipo.nomeEsteso||tipo.nome:'')}</div>`;
    if (_selKcal) html += `<div style="font-size:12px;color:var(--slate-m)">Target: <b>${_selKcal} kcal/die</b>&nbsp;·&nbsp;Piano base: ${piano.kcal_base} kcal&nbsp;·&nbsp;Scala: <b>${factor.toFixed(2)}×</b></div>`;
    html += `</div>`;
    html += `<button class="no-print" onclick="_peApri_${_id}()" style="flex-shrink:0;padding:8px 16px;border-radius:8px;border:1.5px solid ${tipo?tipo.colore:'var(--teal)'};background:${tipo?tipo.colore:'var(--teal)'};color:white;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap;transition:all .15s" onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">📂 Apri in Piano Alimentare</button>`;
    html += `</div>`;

    html += `<div style="display:flex;flex-wrap:wrap;gap:10px;background:#F8FAFC;border-radius:10px;padding:12px 16px;margin-bottom:14px;border:1px solid var(--border)" class="no-print">`;
    const prot = Math.round(scaledKcal * (macros.p||15) / 100 / 4);
    const cho = Math.round(scaledKcal * (macros.cho||50) / 100 / 4);
    const fat = Math.round(scaledKcal * (macros.g||35) / 100 / 9);
    [{v:scaledKcal,l:'Kcal Totali',c:'#0EA5E9'},{v:prot+'g',l:'Proteine',c:'#22C55E'},{v:cho+'g',l:'CHO',c:'#F59E0B'},{v:fat+'g',l:'Grassi',c:'#EF4444'},{v:Math.round(scaledKcal/piano.pasti.length),l:'Kcal/Pasto',c:'#8B5CF6'}].forEach(m => {
      html += `<div style="text-align:center;min-width:70px;flex:1"><div style="font-size:18px;font-weight:700;color:${m.c}">${m.v}</div><div style="font-size:9.5px;font-weight:600;color:var(--slate-m);text-transform:uppercase;letter-spacing:.4px">${m.l}</div></div>`;
    });
    html += `</div>`;

    piano.pasti.forEach(pasto => {
      let pastoKcal = 0;
      pasto.items.forEach(i => pastoKcal += (i.kcal||0));
      const pastoKcalScaled = Math.round(pastoKcal * factor);
      html += `<div style="background:white;border-radius:12px;border:1.5px solid var(--border);margin-bottom:12px;overflow:hidden;box-shadow:var(--shadow)">`;
      html += `<div style="padding:12px 16px;display:flex;align-items:center;gap:10px;background:linear-gradient(135deg,${tipo?tipo.colore:'#0F766E'},${tipo?tipo.colore+'cc':'#0D9488'});color:white">`;
      html += `<span style="font-size:20px">${escH(pasto.emoji||'🍽️')}</span>`;
      html += `<span style="font-weight:700;font-size:14px;flex:1">${escH(pasto.nome)}</span>`;
      html += `<span style="font-size:12px;opacity:.88;font-weight:600">≈ ${pastoKcalScaled} kcal</span>`;
      html += `</div>`;
      pasto.items.forEach(item => {
        const qtS = _snapPortion(item.qt, item.qt * factor);
        const kcalS = item.qt > 0 ? Math.round((item.kcal||0) * qtS / item.qt) : 0;
        html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:9px 16px;border-bottom:1px solid var(--border);font-size:13px">`;
        html += `<span style="color:var(--slate);flex:1">${escH(item.nome)}</span>`;
        html += `<div style="display:flex;align-items:center;gap:10px;white-space:nowrap;margin-left:10px">`;
        html += `<span style="font-weight:700;color:${tipo?tipo.colore:'#0F766E'};font-size:12.5px">${qtS} ${escH(item.unit)}</span>`;
        html += `<span style="font-size:11px;color:var(--slate-l);background:#F8FAFC;border-radius:6px;padding:2px 7px">${kcalS} kcal</span>`;
        html += `</div></div>`;
      });
      if (pasto.nota) html += `<div style="padding:6px 16px;font-size:11.5px;color:#64748B;font-style:italic;background:#FFFBEB">📝 ${escH(pasto.nota)}</div>`;
      html += `</div>`;
    });

    if (piano.nota) html += `<div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:8px;padding:10px 14px;font-size:12px;color:#7C2D12;margin-top:6px;line-height:1.7">⚠️ <b>Nota clinica:</b> ${escH(piano.nota)}</div>`;

    return html;
  }

  function _render() {
    const outEl = document.getElementById('pe-output-' + _id);
    if (outEl) outEl.innerHTML = _renderPiano();
  }

  window._peSel = function(id, type, val) {
    if (id !== _id) return;
    if (type === 'tipo') {
      _selTipo = val;
      const btnGroup = document.getElementById('pe-tipo-btns-' + _id);
      if (btnGroup) btnGroup.querySelectorAll('.pe-tipo-btn').forEach(b => {
        const active = b.dataset.tipo === val;
        b.classList.toggle('active', active);
        b.style.background = active ? b.dataset.col : 'white';
        b.style.color = active ? (b.dataset.colt || '#fff') : 'var(--slate-m)';
        b.style.borderColor = active ? b.dataset.col : 'var(--border-d)';
      });
    } else if (type === 'kcal') {
      _selKcal = parseInt(val);
      const btnGroup = document.getElementById('pe-kcal-btns-' + _id);
      if (btnGroup) btnGroup.querySelectorAll('.pe-kcal-btn').forEach(b => {
        const active = parseInt(b.textContent) === _selKcal;
        b.classList.toggle('active', active);
        b.style.background = active ? config.accentColor : 'white';
        b.style.color = active ? 'white' : 'var(--slate-m)';
        b.style.borderColor = active ? config.accentColor : 'var(--border-d)';
      });
    }
    _render();
  };

  window['_pePrint_' + _id] = function() {
    const piano = _piani[_selTipo];
    const tipo = _tipi.find(t => t.id === _selTipo);
    if (!piano || !tipo) return;
    const factor = (_selKcal && piano.kcal_base) ? _selKcal / piano.kcal_base : 1;
    function escH2(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    let html = `<div style="font-family:'DM Sans',sans-serif;max-width:700px;margin:0 auto;color:#1E293B">`;
    html += `<div style="text-align:center;padding-bottom:12px;margin-bottom:14px;border-bottom:1.5px solid #E2E8F0">`;
    html += `<div style="font-size:18px;font-weight:700;color:${tipo.colore}">${escH2(tipo.nomeEsteso||tipo.nome)}</div>`;
    if (_selKcal) html += `<div style="font-size:13px;color:#475569;margin-top:3px">${_selKcal} kcal/die</div>`;
    html += `</div>`;
    const macros = piano.macros || {p:15, cho:50, g:35};
    const scaledKcal = Math.round(piano.pasti.reduce((s,p) => s + p.items.reduce((si,i) => si+(i.kcal||0), 0), 0) * factor);
    html += `<div style="display:flex;border:1.5px solid #CBD5E1;border-radius:10px;overflow:hidden;margin-bottom:18px">`;
    [{v:scaledKcal,l:'KCAL TOTALI'},{v:Math.round(scaledKcal*(macros.p||15)/100/4)+'g',l:'PROTEINE'},{v:Math.round(scaledKcal*(macros.cho||50)/100/4)+'g',l:'CARBOIDRATI'},{v:Math.round(scaledKcal*(macros.g||35)/100/9)+'g',l:'GRASSI'},{v:Math.round(scaledKcal/piano.pasti.length),l:'KCAL/PASTO'}].forEach((s,i,a) => {
      html += `<div style="flex:1;text-align:center;padding:12px 6px;${i<a.length-1?'border-right:1.5px solid #CBD5E1':''}"><div style="font-size:20px;font-weight:700;color:#0EA5E9">${s.v}</div><div style="font-size:9px;font-weight:600;color:#64748B;letter-spacing:.5px;margin-top:2px">${s.l}</div></div>`;
    });
    html += `</div>`;
    piano.pasti.forEach(pasto => {
      let pastoKcal = 0; pasto.items.forEach(i => pastoKcal += (i.kcal||0));
      html += `<div style="margin-bottom:12px;border-radius:10px;overflow:hidden;border:1.5px solid #E2E8F0;break-inside:avoid">`;
      html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:linear-gradient(135deg,${tipo.colore},${tipo.colore}cc)">`;
      html += `<div style="display:flex;align-items:center;gap:10px"><span style="font-size:18px">${escH2(pasto.emoji||'🍽️')}</span><span style="font-size:14px;font-weight:700;color:white">${escH2(pasto.nome)}</span></div>`;
      html += `<span style="font-size:12px;color:rgba(255,255,255,.9);font-weight:600">≈ ${Math.round(pastoKcal*factor)} kcal</span></div>`;
      pasto.items.forEach(item => {
        const qtS = _snapPortion(item.qt, item.qt * factor);
        html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 16px;border-bottom:1px solid #F1F5F9">`;
        html += `<span style="font-size:13px;color:#1E293B">${escH2(item.nome)}</span>`;
        html += `<span style="font-size:13px;font-weight:700;color:${tipo.colore};white-space:nowrap;padding-left:12px">${qtS} ${escH2(item.unit)}</span></div>`;
      });
      if (pasto.nota) html += `<div style="padding:6px 16px;font-size:11.5px;color:#64748B;font-style:italic;background:#FFFBEB">📝 ${escH2(pasto.nota)}</div>`;
      html += `</div>`;
    });
    if (piano.nota) html += `<div style="margin-top:10px;padding:10px 14px;background:#FFF7ED;border-radius:8px;font-size:12px;color:#7C2D12">⚠️ ${escH2(piano.nota)}</div>`;
    html += profiloFirmaHtml();
    html += `</div>`;
    let pa = document.getElementById('pe-print-' + _id);
    if (!pa) {
      pa = document.createElement('div');
      pa.id = 'pe-print-' + _id;
      pa.style.cssText = 'display:none';
      (document.querySelector('main') || document.body).appendChild(pa);
    }
    pa.innerHTML = html;
    document.body.dataset.printMode = 'compact';
    window.addEventListener('afterprint', () => { delete document.body.dataset.printMode; }, {once:true});
    setTimeout(() => window.print(), 300);
  };

  window['_peApri_' + _id] = function() {
    const piano = _piani[_selTipo];
    const tipo = _tipi.find(t => t.id === _selTipo);
    if (!piano || !tipo) return;
    const factor = (_selKcal && piano.kcal_base) ? _selKcal / piano.kcal_base : 1;
    const pasti = piano.pasti.map(pasto => ({
      id: 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2),
      nome: pasto.nome,
      emoji: pasto.emoji || '🍽️',
      items: pasto.items.map(item => ({
        nome: item.nome,
        qt: String(_snapPortion(item.qt, item.qt * factor)),
        altPrint: [],
        misura: item.unit || ''
      })),
      note: '',
      collapsed: false
    }));
    const d = { nome: (tipo.nomeEsteso||tipo.nome) + (_selKcal?' '+_selKcal+' kcal':''), pasti };
    sessionStorage.setItem('loadPatologia', JSON.stringify(d));
    window.location.href = 'app.html';
  };

  container.innerHTML = `
    ${_renderSelector()}
    <div id="pe-output-${_id}">${_renderPiano()}</div>
  `;
}

// ═══════════════════════════════════════════════════
// CUSTOM SELECT DROPDOWN
// ═══════════════════════════════════════════════════
(function() {
  const CSEL_MAX_H = 240;      // max-height of the dropdown panel (px) — must match CSS
  const CSEL_OPT_H = 35;       // estimated height per option (px), used for open-above logic
  const CSEL_MARGIN = 4;       // gap between trigger and panel (px)
  const CSEL_SCROLL_DELAY = 10; // ms to wait before scrolling selected option into view

  let _openWrap = null;

  function _closeAll() {
    if (_openWrap) { _closePanel(_openWrap); _openWrap = null; }
  }

  function _closePanel(wrap) {
    const trig = wrap._cselTrigger;
    const panel = wrap._cselPanel;
    if (trig) { trig.classList.remove('open'); trig.setAttribute('aria-expanded', 'false'); }
    if (panel) { panel.style.display = 'none'; }
  }

  function _buildOptions(panel, sel, wrap) {
    panel.innerHTML = '';
    const opts = sel.options;
    for (let i = 0; i < opts.length; i++) {
      const opt = opts[i];
      if (opt.disabled && opt.value === '' && i === 0 && opts.length > 1) {
        // skip empty placeholder disabled options
        continue;
      }
      const item = document.createElement('div');
      item.className = 'csel-option' + (i === sel.selectedIndex ? ' csel-selected' : '');
      item.textContent = opt.text;
      item.dataset.idx = i;
      item.addEventListener('mousedown', function(e) {
        e.preventDefault();
        const idx = parseInt(this.dataset.idx);
        sel.selectedIndex = idx;
        _updateTrigger(wrap, sel);
        _closePanel(wrap);
        _openWrap = null;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      });
      panel.appendChild(item);
    }
  }

  function _updateTrigger(wrap, sel) {
    const trig = wrap._cselTrigger;
    if (!trig) return;
    const span = trig.querySelector('.csel-val');
    const opt = sel.options[sel.selectedIndex];
    if (span) span.textContent = opt ? opt.text : '';
  }

  function _openPanel(wrap, sel) {
    _closeAll();
    const panel = wrap._cselPanel;
    const trig = wrap._cselTrigger;
    _buildOptions(panel, sel, wrap);
    trig.classList.add('open');
    trig.setAttribute('aria-expanded', 'true');
    // Position using fixed coords
    const rect = trig.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const panelH = Math.min(CSEL_MAX_H, sel.options.length * CSEL_OPT_H + 8);
    panel.style.width = rect.width + 'px';
    panel.style.left = rect.left + 'px';
    if (spaceBelow < panelH + CSEL_MARGIN && rect.top > panelH + CSEL_MARGIN) {
      panel.style.top = '';
      panel.style.bottom = (window.innerHeight - rect.top + CSEL_MARGIN) + 'px';
    } else {
      panel.style.bottom = '';
      panel.style.top = (rect.bottom + CSEL_MARGIN) + 'px';
    }
    panel.style.display = 'block';
    _openWrap = wrap;
    // Scroll selected option into view after the panel becomes visible
    const selEl = panel.querySelector('.csel-selected');
    if (selEl) setTimeout(() => selEl.scrollIntoView({ block: 'nearest' }), CSEL_SCROLL_DELAY);
  }

  function _initOne(sel) {
    if (sel._cselDone || sel.closest('.csel-wrap') || sel.dataset.cselSkip || sel.multiple) return;
    if (!sel.parentNode) return;
    sel._cselDone = true;
    sel.classList.add('csel-native');

    const wrap = document.createElement('div');
    wrap.className = 'csel-wrap';
    // Copy width/max-width/min-width from inline style
    if (sel.style.width) wrap.style.width = sel.style.width;
    if (sel.style.maxWidth) wrap.style.maxWidth = sel.style.maxWidth;
    if (sel.style.minWidth) wrap.style.minWidth = sel.style.minWidth;

    // Build trigger
    const trig = document.createElement('div');
    trig.className = 'csel-trigger';
    trig.setAttribute('tabindex', '0');
    trig.setAttribute('role', 'combobox');
    trig.setAttribute('aria-haspopup', 'listbox');
    trig.setAttribute('aria-expanded', 'false');

    const valSpan = document.createElement('span');
    valSpan.className = 'csel-val';
    const curOpt = sel.options[sel.selectedIndex];
    valSpan.textContent = curOpt ? curOpt.text : '';

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'csel-chevron');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2.5');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    poly.setAttribute('points', '6 9 12 15 18 9');
    svg.appendChild(poly);

    trig.appendChild(valSpan);
    trig.appendChild(svg);

    // Build panel (appended to body for z-index/overflow safety)
    const panel = document.createElement('div');
    panel.className = 'csel-panel';
    panel.style.display = 'none';
    panel.addEventListener('click', e => e.stopPropagation());
    document.body.appendChild(panel);

    wrap._cselTrigger = trig;
    wrap._cselPanel = panel;
    sel._cselPanel = panel; // stored on select for cleanup when select is removed

    trig.addEventListener('click', function(e) {
      e.stopPropagation();
      if (_openWrap === wrap) { _closePanel(wrap); _openWrap = null; }
      else { _openPanel(wrap, sel); }
    });

    trig.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (_openWrap === wrap) { _closePanel(wrap); _openWrap = null; }
        else { _openPanel(wrap, sel); }
      } else if (e.key === 'Escape') {
        _closePanel(wrap); _openWrap = null;
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const dir = e.key === 'ArrowDown' ? 1 : -1;
        const ni = Math.max(0, Math.min(sel.options.length - 1, sel.selectedIndex + dir));
        sel.selectedIndex = ni;
        _updateTrigger(wrap, sel);
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    // Insert wrapper before select, then move select into wrap
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(trig);
    wrap.appendChild(sel);

    // Override value/selectedIndex setters so external JS assignments update the trigger
    // Guard against re-defining if somehow called twice
    if (!sel._cselPropsOverridden) {
      sel._cselPropsOverridden = true;
      const proto = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
      const idxProto = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');
      Object.defineProperty(sel, 'value', {
        get() { return proto.get.call(this); },
        set(v) { proto.set.call(this, v); _updateTrigger(wrap, this); },
        configurable: true
      });
      Object.defineProperty(sel, 'selectedIndex', {
        get() { return idxProto.get.call(this); },
        set(v) { idxProto.set.call(this, v); _updateTrigger(wrap, this); },
        configurable: true
      });
    }

    // Watch for options being added/removed/changed
    new MutationObserver(() => _updateTrigger(wrap, sel))
      .observe(sel, { childList: true, subtree: true, characterData: true });
  }

  function _initAll() {
    document.querySelectorAll('select:not([data-csel-skip])').forEach(_initOne);
  }

  // Close on outside click
  document.addEventListener('click', _closeAll);
  // Close on scroll only when scrolling outside the open panel
  document.addEventListener('scroll', function(e) {
    if (_openWrap && _openWrap._cselPanel && _openWrap._cselPanel.contains(e.target)) return;
    _closeAll();
  }, true);
  // Close on resize
  window.addEventListener('resize', _closeAll);

  // Watch for new select elements added to DOM, and clean up panels for removed selects
  new MutationObserver(function(mutations) {
    mutations.forEach(function(m) {
      m.addedNodes.forEach(function(node) {
        if (!node || node.nodeType !== 1) return;
        if (node.tagName === 'SELECT') { _initOne(node); return; }
        if (node.querySelectorAll) node.querySelectorAll('select:not([data-csel-skip])').forEach(_initOne);
      });
      m.removedNodes.forEach(function(node) {
        if (!node || node.nodeType !== 1) return;
        // Remove orphaned panels for any removed select elements
        const selects = node.tagName === 'SELECT' ? [node]
          : (node.querySelectorAll ? Array.from(node.querySelectorAll('select')) : []);
        selects.forEach(function(s) {
          if (s._cselPanel && s._cselPanel.parentNode && !s.isConnected) s._cselPanel.remove();
        });
      });
    });
  }).observe(document.documentElement, { childList: true, subtree: true });

  // Initialize existing selects
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _initAll);
  } else {
    _initAll();
  }
})();
