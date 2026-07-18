// ═══════════════════════════════════════════════════════
// RENDERING & FILTERING
// ═══════════════════════════════════════════════════════
function _L(it,en){try{const l=typeof getLang==='function'?getLang():(localStorage.getItem('nlang')||'it');return l==='en'?en:it;}catch(e){return it;}}
let currentFilter = 'tutti';
let currentPage = 1;
const PAGE_SIZE = 30;
let _filterTimer;
let _lastFiltered = [];

function debouncedFilter() {
  clearTimeout(_filterTimer);
  _filterTimer = setTimeout(filterStudies, 200);
}

function setFilter(cat) {
  currentFilter = cat;
  currentPage = 1;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('f-' + cat);
  if (btn) btn.classList.add('active');
  filterStudies();
}

function goPage(n) {
  currentPage = n;
  renderPage();
  window.scrollTo({top: document.getElementById('study-grid').offsetTop - 80, behavior: 'smooth'});
}

function renderPage() {
  const container = document.getElementById('study-grid');
  const pag = document.getElementById('study-pagination');
  const filtered = _lastFiltered;
  const total = filtered.length;
  const pages = Math.ceil(total / PAGE_SIZE);
  const start = (currentPage - 1) * PAGE_SIZE;
  const slice = filtered.slice(start, start + PAGE_SIZE);

  const frag = document.createDocumentFragment();
  slice.forEach(s => {
    const tmp = document.createElement('div');
    tmp.innerHTML = renderStudy(s);
    frag.appendChild(tmp.firstElementChild);
  });
  container.innerHTML = '';
  container.appendChild(frag);

  if (pages <= 1) { pag.innerHTML = ''; return; }
  let html = '<div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;padding:16px 0">';
  html += `<button onclick="goPage(${currentPage-1})" ${currentPage===1?'disabled':''} style="padding:6px 12px;border-radius:6px;border:1px solid var(--border);background:var(--card-bg);cursor:pointer;font-size:13px">&#8592;</button>`;
  for (let i = 1; i <= pages; i++) {
    const active = i === currentPage;
    html += `<button onclick="goPage(${i})" style="padding:6px 12px;border-radius:6px;border:1px solid ${active?'var(--primary)':'var(--border)'};background:${active?'var(--primary)':'var(--card-bg)'};color:${active?'#fff':'inherit'};cursor:pointer;font-size:13px">${i}</button>`;
  }
  html += `<button onclick="goPage(${currentPage+1})" ${currentPage===pages?'disabled':''} style="padding:6px 12px;border-radius:6px;border:1px solid var(--border);background:var(--card-bg);cursor:pointer;font-size:13px">&#8594;</button>`;
  html += '</div>';
  pag.innerHTML = html;
}

function filterStudies() {
  currentPage = 1;
  const q = (document.getElementById('study-search').value || '').toLowerCase().trim();
  const countEl = document.getElementById('study-count');
  let filtered = STUDI;

  if (currentFilter !== 'tutti') {
    filtered = filtered.filter(s => s.categorie.includes(currentFilter));
  }
  if (q) {
    filtered = filtered.filter(s =>
      s.titolo.toLowerCase().includes(q) ||
      s.autori.toLowerCase().includes(q) ||
      s.rivista.toLowerCase().includes(q) ||
      s.obiettivo.toLowerCase().includes(q) ||
      (s.obiettivo_en||'').toLowerCase().includes(q) ||
      s.risultati.toLowerCase().includes(q) ||
      (s.risultati_en||'').toLowerCase().includes(q) ||
      s.categorie.some(c => c.includes(q))
    );
  }

  countEl.textContent = `${filtered.length} ${filtered.length === 1 ? _L('studio trovato','study found') : _L('studi trovati','studies found')}`;
  _lastFiltered = filtered;

  if (!filtered.length) {
    document.getElementById('study-grid').innerHTML = `<div style="text-align:center;padding:40px;color:var(--slate-l);font-size:14px">${_L('Nessuno studio trovato per i criteri selezionati.','No studies found for the selected criteria.')}</div>`;
    document.getElementById('study-pagination').innerHTML = '';
    return;
  }

  renderPage();
}

function efLabel(n) {
  const labels = _L(
    ['','⬜ Molto bassa','🟦 Bassa','🟨 Moderata','🟩 Alta','🟥 Molto alta (RCT/Meta-analisi)'],
    ['','⬜ Very low','🟦 Low','🟨 Moderate','🟩 High','🟥 Very high (RCT/Meta-analysis)']
  );
  const colors = ['','#94A3B8','#60A5FA','#FBBF24','#34D399','#F87171'];
  return `<span style="font-size:11px;font-weight:700;color:${colors[n]}">${labels[n]||''}</span>`;
}

const TIPO_EN = {'Meta-analisi':'Meta-analysis','Revisione sistematica':'Systematic Review','Revisione Sistematica':'Systematic Review','RCT':'RCT','Cochrane Review':'Cochrane Review','Umbrella review':'Umbrella Review','Studio di Coorte':'Cohort Study','Revisione Cochrane':'Cochrane Review','Review':'Review','Review di Revisioni':'Review of Reviews','Studio prospettico':'Prospective Study','Revisione Sistematica Cochrane':'Cochrane Systematic Review','Revisione Narrativa':'Narrative Review','RCT (Revisione/follow-up)':'RCT (Review/follow-up)','Meta-analisi Cochrane':'Cochrane Meta-analysis','Linee Guida':'Guidelines'};
function renderStudy(s) {
  const tipoLabel = _L(s.tipo, TIPO_EN[s.tipo] || s.tipo);
  const dbBadges = s.fonti.map(f => {
    const colors = {PubMed:'#3B82F6',Cochrane:'#059669',CINAHL:'#7C3AED',Embase:'#DC2626','Web of Science':'#D97706'};
    return `<span class="db-badge" style="background:${colors[f]||'#64748B'}20;color:${colors[f]||'#64748B'};border:1px solid ${colors[f]||'#64748B'}40">${f}</span>`;
  }).join('');

  const catBadges = s.categorie.map(c => {
    const catMap = _L(
      {diabete:'🩸 Diabete',obesita:'⚖️ Obesità',chetogenica:'🥑 Chetogenica',renale:'🫘 Renale',cardiovascolare:'❤️ Cardiovascolare',microbiota:'🦠 Microbiota',oncologia:'🎗️ Oncologia',infiammazione:'🔥 Infiammazione',sarcopenia:'💪 Sarcopenia',pediatria:'👶 Pediatria',sport:'🏃 Sportiva',dieta_med:'🫒 Dieta Med.',igf:'⏱️ Digiuno Int.',ibs:'🔄 IBS',celiachia:'🌾 Celiachia',ipertensione:'💊 Ipertensione',alzheimer:'🧩 Alzheimer',vegetariano:'🌱 Vegetariana',vegano:'🌱 Vegana',anziani:'🧓 Anziani',gravidanza:'🤰 Gravidanza',bpco:'🫁 BPCO',menopausa:'🌸 Menopausa',stipsi:'💩 Stipsi',gastroenterologia:'🫙 Gastroenterologia',nutrizione_clinica:'🏥 Nutrizione Clinica',micronutrienti:'💊 Micronutrienti',depressione:'🧠 Depressione',osteoporosi:'🦴 Osteoporosi'},
      {diabete:'🩸 Diabetes',obesita:'⚖️ Obesity',chetogenica:'🥑 Ketogenic',renale:'🫘 Renal',cardiovascolare:'❤️ Cardiovascular',microbiota:'🦠 Microbiota',oncologia:'🎗️ Oncology',infiammazione:'🔥 Inflammation',sarcopenia:'💪 Sarcopenia',pediatria:'👶 Paediatrics',sport:'🏃 Sports',dieta_med:'🫒 Med. Diet',igf:'⏱️ Int. Fasting',ibs:'🔄 IBS',celiachia:'🌾 Celiac',ipertensione:'💊 Hypertension',alzheimer:'🧩 Alzheimer',vegetariano:'🌱 Vegetarian',vegano:'🌱 Vegan',anziani:'🧓 Elderly',gravidanza:'🤰 Pregnancy',bpco:'🫁 COPD',menopausa:'🌸 Menopause',stipsi:'💩 Constipation',gastroenterologia:'🫙 Gastroenterology',nutrizione_clinica:'🏥 Clinical Nutrition',micronutrienti:'💊 Micronutrients',depressione:'🧠 Depression',osteoporosi:'🦴 Osteoporosis'}
    );
    return `<span class="study-badge" style="background:#F1F5F9;color:#475569">${catMap[c]||c}</span>`;
  }).join('');

  // Body rendered lazily on first open (see toggleStudy)
  return `<div class="study-card" id="sc-${s.id}">
    <div class="study-card-hdr" onclick="toggleStudy(${s.id})">
      <div style="flex:1">
        <div class="study-meta">
          <span class="study-type" style="background:${s.tipoBg};color:${s.tipoColor}">${tipoLabel}</span>
          <span class="study-year">${s.anno}</span>
          ${dbBadges}
          ${catBadges}
        </div>
        <div class="study-title">${s.titolo}</div>
        <div class="study-authors">${s.autori}</div>
        <div class="study-journal">${s.rivista} · DOI: ${s.doi}</div>
        <div style="margin-top:6px;font-size:11.5px;color:var(--slate-l)">
          👥 <b>${_L('Partecipanti','Participants')}:</b> ${s.partecipanti} &nbsp;·&nbsp; ⏱️ <b>${_L('Durata','Duration')}:</b> ${_L(s.durata,s.durata_en||s.durata)} &nbsp;·&nbsp; 📊 <b>${_L('Evidenza','Evidence')}:</b> ${efLabel(s.ef)}
        </div>
      </div>
      <div style="flex-shrink:0;margin-left:8px;font-size:18px;color:var(--slate-l);transition:transform .2s" id="arr-${s.id}">▼</div>
    </div>
    <div class="study-body" id="sb-${s.id}"></div>
  </div>`;
}

function _studyBodyHTML(s) {
  return `<div class="study-section"><h4>🎯 ${_L('Obiettivo dello Studio','Study Objective')}</h4><p>${_L(s.obiettivo,s.obiettivo_en||s.obiettivo)}</p></div>
      <div class="study-section"><h4>🔬 ${_L('Metodi','Methods')}</h4><p>${_L(s.metodi,s.metodi_en||s.metodi)}</p></div>
      <div class="study-section"><h4>📊 ${_L('Risultati Principali','Main Results')}</h4><p>${_L(s.risultati,s.risultati_en||s.risultati)}</p></div>
      <div class="study-section"><h4>🧠 ${_L('Analisi Critica dei Metodi e dei Risultati','Critical Analysis of Methods and Results')}</h4><p>${_L(s.analisi,s.analisi_en||s.analisi)}</p></div>
      <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <a class="study-link" href="${s.link}" target="_blank" rel="noopener noreferrer">📑 PubMed — PMID: ${s.pubmed}</a>
        <a class="study-link" href="${s.abstract_link}" target="_blank" rel="noopener noreferrer" style="background:#1E3A5F">📄 ${_L('Articolo completo','Full article')} →</a>
      </div>`;
}
function toggleStudy(id) {
  const body = document.getElementById('sb-' + id);
  const arr = document.getElementById('arr-' + id);
  // Populate body on first open
  if (!body._loaded) {
    const s = STUDI.find(x => x.id === id);
    if (s) { body.innerHTML = _studyBodyHTML(s); body._loaded = true; }
  }
  const isOpen = body.classList.contains('open');
  body.classList.toggle('open');
  if (arr) arr.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
}

// Init
document.addEventListener('DOMContentLoaded', () => {
  const srch = document.getElementById('study-search');
  if (srch) srch.placeholder = _L('🔍 Cerca per titolo, autori, argomento...','🔍 Search by title, authors, topic...');
  filterStudies();
  if (typeof initAuth === 'function') initAuth();

  if (typeof initPageTour === 'function') {
    initPageTour('studi', [
      { icon:'🔬', title:_L('Benvenuto in Studi Scientifici','Welcome to Scientific Studies'), text:_L('Una selezione di studi e meta-analisi rilevanti in nutrizione clinica, con sintesi di metodi e risultati, pronti da consultare senza dover cercare altrove.','A curated selection of relevant clinical nutrition studies and meta-analyses, with summarised methods and results, ready to consult without searching elsewhere.') },
      { selector:'.calc-box', title:_L('Accesso diretto alle banche dati','Direct access to databases'), text:_L('PubMed, Cochrane, NEJM, The Lancet e altre fonti scientifiche di riferimento, a un click di distanza.','PubMed, Cochrane, NEJM, The Lancet and other reference scientific sources, one click away.') },
      { selector:'.study-filters', title:_L('Cerca e filtra','Search and filter'), text:_L('Cerca per titolo o argomento, oppure filtra rapidamente per patologia con questi tasti.','Search by title or topic, or quickly filter by condition with these buttons.') }
    ], { badge:_L('Studi Scientifici','Scientific Studies') });
  }
});
