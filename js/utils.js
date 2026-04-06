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
}

async function doLogout() {
  await sb.auth.signOut();
  window.location.href = 'index.html';
}

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
function lookup(n) { if (!n) return null; return FOOD_MAP[n.toLowerCase()] || null; }
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

  html += `</div>`;

  container.innerHTML = html;
  document.body.dataset.printMode = 'compact';
  window.addEventListener('afterprint', () => { delete document.body.dataset.printMode; }, { once: true });
  setTimeout(() => window.print(), 300);
}
