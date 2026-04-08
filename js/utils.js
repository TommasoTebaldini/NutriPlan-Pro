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

let currentUser = null;
let isAdmin = false;
let currentProfile = null;

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
  const { data } = await sb.from('profiles').select('*').eq('id', currentUser.id).single();
  currentProfile = data;
  isAdmin = data?.is_admin || false;
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
    btn.textContent = '👤 Profilo Operatore';
    btn.onclick = openProfiloModal;
    sbBottom.insertBefore(btn, sbBottom.querySelector('.sb-logout'));
  }
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
          <div class="fg" style="margin-bottom:14px"><label>N° Iscrizione Albo</label><input type="text" id="profop-albo" placeholder="es. 12345 (Regione)" maxlength="80" style="width:100%;padding:8px 11px;border:1.5px solid var(--border-d);border-radius:var(--r-sm);font-size:13px;font-family:inherit;outline:none;box-sizing:border-box"></div>
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <button class="btn btn-ghost" onclick="closeM('modal-profilo-op')">Annulla</button>
            <button class="btn btn-primary" onclick="salvaProfiloOp()">💾 Salva</button>
          </div>
        </div>
      </div>
    </div>`;
    document.body.appendChild(div.firstChild);
  }
}

function openProfiloModal() {
  const p = getProfiloOperatore();
  const n = document.getElementById('profop-nome'); if (n) n.value = p.nome || '';
  const c = document.getElementById('profop-cognome'); if (c) c.value = p.cognome || '';
  const a = document.getElementById('profop-albo'); if (a) a.value = p.albo || '';
  openM('modal-profilo-op');
}
function salvaProfiloOp() {
  const d = {
    nome: (document.getElementById('profop-nome')?.value || '').trim(),
    cognome: (document.getElementById('profop-cognome')?.value || '').trim(),
    albo: (document.getElementById('profop-albo')?.value || '').trim()
  };
  saveProfiloOperatore(d);
  closeM('modal-profilo-op');
  toast('✅ Profilo salvato!', 'ok');
}

async function doLogout() {
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
function profiloFirmaHtml() {
  const p = getProfiloOperatore();
  const nome = [p.nome, p.cognome].filter(Boolean).join(' ');
  const albo = p.albo ? ' — N° Albo: ' + esc(p.albo) : '';
  if (!nome && !albo) return '';
  return '<div style="position:fixed;bottom:8mm;right:15mm;font-size:11px;color:#64748B;font-style:italic">' + esc(nome) + albo + '</div>';
}

// Global beforeprint: inject firma for pages that use window.print() directly
// (Pages with custom print areas already call profiloFirmaHtml() and set data-print-mode)
window.addEventListener('beforeprint', function() {
  if (document.body.dataset.printMode) return; // custom print area already has firma
  const p = getProfiloOperatore();
  const nome = [p.nome, p.cognome].filter(Boolean).join(' ');
  const albo = p.albo ? ' \u2014 N\u00b0 Albo: ' + p.albo : '';
  if (!nome && !albo) return;
  if (document.getElementById('_gprint_firma_')) return;
  const div = document.createElement('div');
  div.id = '_gprint_firma_';
  div.style.cssText = 'position:fixed;bottom:8mm;right:15mm;font-size:11px;color:#64748B;font-style:italic';
  div.textContent = nome + albo;
  document.body.appendChild(div);
});
window.addEventListener('afterprint', function() {
  const el = document.getElementById('_gprint_firma_');
  if (el) el.remove();
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
  const el = document.getElementById('loading-overlay');
  if (el) el.classList.toggle('active', v);
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
  try {
    const { data } = await sb.from('cartelle').select('id,nome').eq('user_id', currentUser.id).order('nome');
    window._cartelleCache = data || [];
  } catch(e) { window._cartelleCache = []; }
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
      ' onfocus="_cwShow(\'' + cid + '\')"' +
      ' onblur="setTimeout(()=>_cwHide(\'' + cid + '\'),200)">' +
      '<div id="' + cid + '-dd" style="display:none;position:absolute;top:100%;left:0;right:0;background:white;border:2px solid ' + border + ';border-radius:var(--r-sm);max-height:200px;overflow-y:auto;z-index:600;box-shadow:0 8px 24px rgba(0,0,0,.15);color:#1E293B"></div>' +
    '</div>' +
    '<input type="hidden" id="' + hiddenId + '" value="">' +
    '<span id="' + cid + '-lbl" style="font-size:11px;color:' + labelColor + ';font-weight:600;margin-top:3px;display:block;min-height:15px"></span>';
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

function _cwUpdateDisplay(cid, id, nome) {
  const container = document.getElementById(cid);
  const opts = (container || {})._cwOpts || {};
  const hiddenId = opts.hiddenInputId || (cid + '-val');
  const hidden = document.getElementById(hiddenId);
  if (hidden) hidden.value = id;
  const srch = document.getElementById(cid + '-srch');
  if (srch) srch.value = nome;
  const lbl = document.getElementById(cid + '-lbl');
  if (lbl) lbl.textContent = nome ? '✅ ' + nome : '';
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
  if (lbl) lbl.textContent = '';
}

function _cwNuovaCartella(cid) {
  _cwHide(cid);
  openNuovaCartellaModal(async function(id, nome) {
    window._cartelleCache = null;
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
