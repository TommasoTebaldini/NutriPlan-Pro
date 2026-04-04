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

async function _cwLoadCache(force) {
  if (!force && window._cartelleCache) return window._cartelleCache;
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
  container.style.position = 'relative';
  container.innerHTML =
    '<input type="text" id="' + cid + '-srch" placeholder="' + placeholder + '" autocomplete="off"' +
    ' style="width:100%;padding:6px 10px;border:1.5px solid ' + border + ';border-radius:var(--r-sm);font-family:inherit;font-size:13px;outline:none;background:white;box-sizing:border-box"' +
    ' oninput="_cwFilter(\'' + cid + '\')"' +
    ' onfocus="_cwShow(\'' + cid + '\')"' +
    ' onblur="setTimeout(()=>_cwHide(\'' + cid + '\'),200)">' +
    '<div id="' + cid + '-dd" style="display:none;position:absolute;top:100%;left:0;right:0;background:white;border:2px solid ' + border + ';border-radius:var(--r-sm);max-height:200px;overflow-y:auto;z-index:600;box-shadow:0 8px 24px rgba(0,0,0,.15)"></div>' +
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
        ' style="padding:8px 12px;cursor:pointer;font-size:13px;font-weight:500;border-bottom:1px solid var(--border)"' +
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

function _cwSelect(cid, id, nome) {
  const container = document.getElementById(cid);
  const opts = (container || {})._cwOpts || {};
  const hiddenId = opts.hiddenInputId || (cid + '-val');
  const hidden = document.getElementById(hiddenId);
  if (hidden) hidden.value = id;
  const srch = document.getElementById(cid + '-srch');
  if (srch) srch.value = nome;
  const lbl = document.getElementById(cid + '-lbl');
  if (lbl) lbl.textContent = '✅ ' + nome;
  _cwHide(cid);
  if (opts.onSelect) opts.onSelect(id, nome);
}

async function _cwSetById(cid, cartellaId) {
  if (!cartellaId) return;
  const cartelle = await _cwLoadCache();
  const cart = cartelle.find(function(c){ return c.id === cartellaId; });
  if (cart) {
    _cwSelect(cid, cart.id, cart.nome);
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
