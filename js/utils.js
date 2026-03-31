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
    from: ()=>({ select: ()=>({ eq: ()=>({ order: ()=>({ limit: ()=>Promise.resolve({data:[],error:null}), single: ()=>Promise.resolve({data:null,error:null}), then: (r)=>r({data:[],error:null}) }), single: ()=>Promise.resolve({data:null,error:null}), then: (r)=>r({data:[],error:null}) }), then: (r)=>r({data:[],error:null}) }), insert: ()=>({ select: ()=>({ single: ()=>Promise.resolve({data:null,error:null}) }), then: (r)=>r({data:null,error:null}) }), update: ()=>({ eq: ()=>Promise.resolve({data:null,error:null}) }), delete: ()=>({ eq: ()=>Promise.resolve({data:null,error:null}) }), upsert: ()=>Promise.resolve({data:null,error:null}) })
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
function toggleSB() { document.getElementById('sidebar').classList.toggle('open'); }
function closeSB() { document.getElementById('sidebar').classList.remove('open'); }

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
