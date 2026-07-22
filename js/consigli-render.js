const CONSIGLI_PAGE_SIZE = 30;
let currentConsigliPage = 1;

function renderConsigli(filter = '', resetPage = true) {
  if (resetPage) currentConsigliPage = 1;
  const list = document.getElementById('consigli-list');
  list.innerHTML = '';
  const q = filter.toLowerCase();
  // Custom entries override base entries with the same ID
  const customIds = new Set(consigliPersonalizzati.map(c => c.id));
  const all = [...CONSIGLI_BASE.filter(c => !customIds.has(c.id)), ...consigliPersonalizzati];
  const filtered = q ? all.filter(c => c.nome.toLowerCase().includes(q) || (c.id||'').includes(q)) : all;
  const total = filtered.length;
  const totalPages = Math.ceil(total / CONSIGLI_PAGE_SIZE);
  if (currentConsigliPage > totalPages) currentConsigliPage = Math.max(1, totalPages);
  const pageItems = filtered.slice((currentConsigliPage - 1) * CONSIGLI_PAGE_SIZE, currentConsigliPage * CONSIGLI_PAGE_SIZE);
  document.getElementById('cs-count').textContent = total + ' ' + _L('patologie','conditions');
  const frag = document.createDocumentFragment();
  pageItems.forEach(c => {
    const isCustom = consigliPersonalizzati.some(p => p.id === c.id);
    frag.appendChild(buildConsiglio(c, isCustom));
  });
  list.appendChild(frag);
  renderConsigliPagination(total, totalPages, filter);
}

function renderConsigliPagination(total, totalPages, filter) {
  const pag = document.getElementById('consigli-pagination');
  if (!pag) return;
  if (totalPages <= 1) { pag.innerHTML = ''; return; }
  const p = currentConsigliPage;
  let btns = '';
  if (p > 1) btns += `<button class="filter-btn" onclick="goConsigliPage(${p-1})">&#8592;</button>`;
  const start = Math.max(1, p - 2);
  const end = Math.min(totalPages, p + 2);
  if (start > 1) btns += `<button class="filter-btn" onclick="goConsigliPage(1)">1</button>${start > 2 ? '<span style="padding:4px 6px;color:var(--slate-l)">…</span>' : ''}`;
  for (let i = start; i <= end; i++) {
    btns += `<button class="filter-btn${i===p?' active':''}" onclick="goConsigliPage(${i})">${i}</button>`;
  }
  if (end < totalPages) btns += `${end < totalPages-1 ? '<span style="padding:4px 6px;color:var(--slate-l)">…</span>' : ''}<button class="filter-btn" onclick="goConsigliPage(${totalPages})">${totalPages}</button>`;
  if (p < totalPages) btns += `<button class="filter-btn" onclick="goConsigliPage(${p+1})">&#8594;</button>`;
  pag.innerHTML = `<div style="display:flex;gap:8px;justify-content:center;align-items:center;margin-top:20px;flex-wrap:wrap">${btns}<span style="font-size:12px;color:var(--slate-l)">${_L('Pagina','Page')} ${p}/${totalPages}</span></div>`;
}

function goConsigliPage(n) {
  currentConsigliPage = n;
  renderConsigli(document.getElementById('cs-search').value || '', false);
  document.getElementById('consigli-list').scrollIntoView({behavior:'smooth', block:'start'});
}

function filterConsigli() { renderConsigli(document.getElementById('cs-search').value); }
function toggleAll(open) {
  document.querySelectorAll('.cc-body').forEach(b => b.classList.toggle('open', open));
  document.querySelectorAll('.cc-toggle-btn').forEach(t => t.textContent = open ? '▲' : '▼');
}

// ═══════════════════════════════
// NUOVO CONSIGLIO
// ═══════════════════════════════
function openNuovoConsiglio(prefill = null) {
  editingId = prefill?.id || null;
  document.getElementById('nc-title').textContent = editingId ? '✏️ ' + _L('Modifica Consiglio','Edit Advice') : '➕ ' + _L('Nuovo Consiglio Personalizzato','New Custom Advice');
  const f = id => document.getElementById(id);
  if (prefill) {
    f('nc-nome').value = prefill.nome || '';
    f('nc-emoji').value = prefill.emoji || '🏥';
    f('nc-colore').value = prefill.colore || '#0F766E';
    f('nc-pasti').value = prefill.pasti || '';
    f('nc-porzioni').value = prefill.porzioni || '';
    f('nc-idratazione').value = prefill.idratazione || '';
    f('nc-nota').value = prefill.nota || '';
    f('nc-ok').value = (prefill.ok||[]).join('\n');
    f('nc-no').value = (prefill.no||[]).join('\n');
    f('nc-mod').value = (prefill.mod||[]).join('\n');
    f('nc-pratici').value = (prefill.pratici||[]).join('\n');
    f('nc-avvisi').value = (prefill.avvisi||[]).join('\n');
  } else {
    ['nc-nome','nc-pasti','nc-porzioni','nc-idratazione','nc-nota','nc-ok','nc-no','nc-mod','nc-pratici','nc-avvisi'].forEach(id => f(id).value = '');
    f('nc-emoji').value = '🏥';
    f('nc-colore').value = '#0F766E';
    _asConsiglio.restore();
  }
  openM('modal-nc');
}

async function salvaConsiglio() {
  const nome = document.getElementById('nc-nome').value.trim();
  if (!nome) { toast(_L('Inserisci nome patologia','Enter condition name'), 'err'); return; }
  const g = id => document.getElementById(id).value;
  const splitLines = v => v.split('\n').map(s=>s.trim()).filter(Boolean);
  const data = {
    id: editingId || ('custom_' + Date.now()),
    nome, emoji: g('nc-emoji') || '🏥', colore: g('nc-colore') || '#0F766E',
    pasti: g('nc-pasti'), porzioni: g('nc-porzioni'), idratazione: g('nc-idratazione'),
    nota: g('nc-nota'), ok: splitLines(g('nc-ok')), no: splitLines(g('nc-no')),
    mod: splitLines(g('nc-mod')), pratici: splitLines(g('nc-pratici')), avvisi: splitLines(g('nc-avvisi'))
  };
  showLoading(true);
  const payload = { user_id: currentUser.id, data_id: data.id, contenuto: JSON.stringify(data), updated_at: new Date().toISOString() };
  let result;
  if (editingId) {
    const existsCustom = consigliPersonalizzati.some(c => c.id === editingId);
    if (existsCustom) {
      // Update existing custom entry
      result = await sb.from('consigli_custom').update(payload).eq('data_id', editingId).eq('user_id', currentUser.id);
      if (!result.error) {
        const idx = consigliPersonalizzati.findIndex(c => c.id === editingId);
        if (idx >= 0) consigliPersonalizzati[idx] = data;
        else consigliPersonalizzati.push(data);
      }
    } else {
      // Creating a personalised version of a pre-made (base) consiglio
      payload.created_at = new Date().toISOString();
      result = await sb.from('consigli_custom').insert(payload);
      if (!result.error) consigliPersonalizzati.push(data);
    }
  } else {
    payload.created_at = new Date().toISOString();
    result = await sb.from('consigli_custom').insert(payload);
    if (!result.error) consigliPersonalizzati.push(data);
  }
  showLoading(false);
  if (result.error) {
    if (result.error.code === '42P01') {
      toast('Tabella "consigli_custom" mancante — esegui SQL', 'err');
      console.error('create table consigli_custom(id uuid default gen_random_uuid() primary key,user_id uuid references auth.users not null,data_id text,contenuto text,created_at timestamptz default now(),updated_at timestamptz default now());\nalter table consigli_custom enable row level security;\ncreate policy "Propri consigli" on consigli_custom for all using(auth.uid()=user_id);');
    } else { toast('❌ ' + result.error.message, 'err'); }
    return;
  }
  _asConsiglio.clear();
  closeM('modal-nc');
  toast('✅ ' + _L('Consiglio salvato!','Advice saved!'), 'ok');
  renderConsigli();
}

function editConsiglio(id) {
  const c = consigliPersonalizzati.find(x => x.id === id) || CONSIGLI_BASE.find(x => x.id === id);
  if (c) openNuovoConsiglio(c);
}

async function delConsiglio(id) {
  if (!confirm(_L('Eliminare questo consiglio personalizzato?','Delete this custom advice?'))) return;
  showLoading(true);
  const { error } = await sb.from('consigli_custom').delete().eq('data_id', id).eq('user_id', currentUser.id);
  showLoading(false);
  if (error) { toast(_L('❌ Errore durante l\'eliminazione','❌ Error while deleting'), 'err'); return; }
  consigliPersonalizzati = consigliPersonalizzati.filter(c => c.id !== id);
  toast('🗑️ ' + _L('Eliminato','Deleted'), 'info');
  renderConsigli();
}

async function loadConsigliCustom() {
  const { data } = await sb.from('consigli_custom').select('*').eq('user_id', currentUser.id);
  consigliPersonalizzati = (data || []).map(r => { try { return JSON.parse(r.contenuto); } catch { return null; } }).filter(Boolean);
}

// ═══════════════════════════════
// NOTE PAZIENTE PER CONSIGLIO
// ═══════════════════════════════
let noteConsigli = {}; // { consiglio_id: { id (supabase row id), testo } }

async function _buildAndCaptureCons(c, testo, savedId, cartella_id) {
  if (!window.capturePrintAndSave || !savedId || !c) return;
  const _e = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const hex = c.colore || '#0F766E';
  const pill = (f, bg, col) => `<span style="display:inline-block;padding:3px 10px;border-radius:10px;font-size:11.5px;font-weight:500;margin:3px;background:${bg};color:${col}">${_e(f)}</span>`;
  const _enT2 = CONSIGLI_EN[c.id] || {};
  const _tN = (it, k) => _L(it, _enT2[k] || it);
  const _nome = _tN(c.nome, 'nome');
  const _pasti = _tN(c.pasti, 'pasti');
  const _porzioni = _tN(c.porzioni, 'porzioni');
  const _idratazione = _tN(c.idratazione, 'idratazione');
  const _nota = c.nota ? _tN(c.nota, 'nota') : null;
  const _ok = _L(c.ok, _enT2.ok || c.ok) || [];
  const _no = _L(c.no, _enT2.no || c.no) || [];
  const _mod = _L(c.mod, _enT2.mod || c.mod) || [];
  const _pratici = _L(c.pratici, _enT2.pratici || c.pratici) || [];
  const _avvisi = _L(c.avvisi, _enT2.avvisi || c.avvisi) || [];

  const okPills = _ok.map(f => pill(f,'#D1FAE5','#065F46')).join('');
  const noPills = _no.map(f => pill(f,'#FEE2E2','#991B1B')).join('');
  const modPills = _mod.map(f => pill(f,'#FEF3C7','#92400E')).join('');
  const noteHtml = testo ? `<div style="background:#FFF7ED;border-left:4px solid #F59E0B;border-radius:6px;padding:10px 14px;font-size:13px;color:#78350F;margin-bottom:14px;line-height:1.6;white-space:pre-wrap"><b>✏️ ${_L('Note per il paziente','Patient notes')}:</b><br>${_e(testo)}</div>` : '';
  const secTitle = label => `<div style="font-size:11pt;font-weight:700;color:#334155;text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px;padding-bottom:4px;border-bottom:2px solid #E2E8F0">${label}</div>`;
  const html = `<div style="font-family:'DM Sans',Arial,sans-serif;color:#1E293B;font-size:14px;line-height:1.5;padding:24px">
    <div style="background:${hex};color:white;padding:16px 20px;border-radius:10px;margin-bottom:16px;display:flex;align-items:center;gap:14px">
      <span style="font-size:32px">${c.emoji||'🥗'}</span>
      <div><div style="font-size:18px;font-weight:700">${_e(_nome)}</div><div style="font-size:11px;opacity:.8;margin-top:4px">${_L('Consigli Nutrizionali','Nutritional Advice')} · DietPlan Pro</div></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px">
      <div style="background:#F8FAFC;border-radius:8px;padding:10px 12px;border-left:3px solid ${hex}"><div style="font-size:9pt;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">🍽️ ${_L('Pasti/die','Meals/day')}</div><div style="font-size:11pt;font-weight:700">${_e(_pasti||'—')}</div></div>
      <div style="background:#F8FAFC;border-radius:8px;padding:10px 12px;border-left:3px solid ${hex}"><div style="font-size:9pt;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">🥣 ${_L('Porzioni','Portions')}</div><div style="font-size:11pt;font-weight:700">${_e(_porzioni||'—')}</div></div>
      <div style="background:#F8FAFC;border-radius:8px;padding:10px 12px;border-left:3px solid ${hex}"><div style="font-size:9pt;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">💧 ${_L('Idratazione','Hydration')}</div><div style="font-size:11pt;font-weight:700">${_e(_idratazione||'—')}</div></div>
    </div>
    ${_nota ? `<div style="background:#EFF6FF;border-left:4px solid #3B82F6;border-radius:6px;padding:10px 14px;font-size:13px;color:#1E3A5F;margin-bottom:14px;line-height:1.6">📚 ${_e(_nota)}</div>` : ''}
    ${noteHtml}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
      <div>${secTitle('✅ ' + _L('Alimenti Consigliati','Recommended Foods'))}<div>${okPills}</div></div>
      <div>${secTitle('❌ ' + _L('Da Evitare / Limitare','Avoid / Limit'))}<div>${noPills}</div></div>
    </div>
    ${modPills ? `<div style="margin-bottom:14px">${secTitle('⚠️ ' + _L('Con Moderazione','In Moderation'))}<div>${modPills}</div></div>` : ''}
    ${_pratici.length ? `<div style="margin-bottom:14px">${secTitle('💡 ' + _L('Consigli Pratici','Practical Tips'))}<ul style="list-style:none;padding:0">${_pratici.map(p=>`<li style="padding:5px 0;border-bottom:1px solid #E2E8F0;font-size:13px;color:#334155">→ ${_e(p)}</li>`).join('')}</ul></div>` : ''}
    ${_avvisi.length ? `<div style="background:#FEF2F2;border-radius:8px;padding:12px;border:1.5px solid #FEE2E2;margin-bottom:14px">${secTitle('🚨 ' + _L('Avvertenze','Warnings'))}<div>${_avvisi.map(a=>`<div style="padding:5px 8px;border-bottom:1px solid #FEE2E2;font-size:12px;color:#991B1B">⚠️ ${_e(a)}</div>`).join('')}</div></div>` : ''}
    <div style="margin-top:20px;padding-top:10px;border-top:1px solid #E2E8F0;font-size:11px;color:#94A3B8">DietPlan Pro · ${_L('Consigli Nutrizionali','Nutritional Advice')}</div>
  </div>`;
  let printDiv = document.getElementById('cons-print-area');
  if (!printDiv) { printDiv = document.createElement('div'); printDiv.id = 'cons-print-area'; document.body.appendChild(printDiv); }
  printDiv.innerHTML = html;
  printDiv.style.cssText = 'display:block;position:absolute;left:-9999px;top:0;width:794px;background:white;z-index:-1';
  await new Promise(r => setTimeout(r, 200));
  try {
    await capturePrintAndSave({ table: 'note_specialistiche', recordId: savedId, cartellaId: cartella_id, container: printDiv, windowWidth: 850, silent: true });
  } catch (_) {}
  printDiv.innerHTML = ''; printDiv.style.cssText = 'display:none';
}

function toggleNotePaziente(id) {
  const box = document.getElementById('note-box-' + id);
  if (!box) return;
  const visible = box.classList.toggle('visible');
  const btn = document.getElementById('note-btn-' + id);
  if (btn) btn.textContent = visible ? ('✖ ' + _L('Chiudi note','Close notes')) : ('✏️ ' + _L('Note paziente','Patient notes'));
}

async function loadCSCartelle() {
  if (!currentUser) return;
  const sel = document.getElementById('cs-cartella');
  if (!sel || sel.dataset.loaded) return;
  const { data } = await sb.from('cartelle').select('id,nome').eq('user_id', currentUser.id).order('nome');
  if (!data) return;
  sel.innerHTML = `<option value="">-- ${_L('Nessuna cartella selezionata','No folder selected')} --</option>`;
  data.forEach(c => {
    const o = document.createElement('option');
    o.value = c.id; o.textContent = '📁 ' + c.nome;
    sel.appendChild(o);
  });
  sel.dataset.loaded = '1';
}

async function onCartellaChange() {
  const cartella_id = document.getElementById('cs-cartella')?.value;
  if (!cartella_id || !currentUser) { noteConsigli = {}; aggiornaCountSelezione(); return; }
  await caricaNoteConsigli(cartella_id);
  aggiornaCountSelezione();
}

async function caricaNoteConsigli(cartella_id) {
  const { data } = await sb.from('note_specialistiche').select('id,dati').eq('cartella_id', cartella_id).eq('user_id', currentUser.id).eq('tipo', 'consiglio');
  noteConsigli = {};
  (data || []).forEach(row => {
    try {
      const d = JSON.parse(row.dati || '{}');
      if (d.consiglio_id) noteConsigli[d.consiglio_id] = { id: row.id, testo: d.note_paziente || '' };
    } catch(e) {}
  });
  // Populate textareas
  Object.entries(noteConsigli).forEach(([cid, n]) => {
    const ta = document.getElementById('note-text-' + cid);
    if (ta) ta.value = n.testo;
    const box = document.getElementById('note-box-' + cid);
    if (box && n.testo) box.classList.add('visible');
    const btn = document.getElementById('note-btn-' + cid);
    if (btn && n.testo) btn.textContent = '✖ ' + _L('Chiudi note','Close notes');
    const stato = document.getElementById('note-stato-' + cid);
    if (stato && n.testo) stato.textContent = '✅ ' + _L('Nota salvata in cartella','Note saved to folder');
  });
}

async function salvaNotePaziente(consiglioId) {
  if (!currentUser) { toast(_L('Effettua il login per salvare','Please log in to save'), 'err'); return; }
  const cartella_id = document.getElementById('cs-cartella')?.value;
  if (!cartella_id) { toast(_L('Seleziona una cartella paziente nella barra in alto','Select a patient folder in the top bar'), 'err'); return; }
  const testo = document.getElementById('note-text-' + consiglioId)?.value || '';
  const c = getAllConsigli().find(x => x.id === consiglioId);
  const dati = {
    consiglio_id: consiglioId, consiglio_nome: c?.nome || consiglioId, note_paziente: testo,
    ok: c?.ok || [], no: c?.no || [], mod: c?.mod || [],
    pratici: c?.pratici || [], avvisi: c?.avvisi || [],
    pasti: c?.pasti || '', porzioni: c?.porzioni || '', idratazione: c?.idratazione || '',
    stampa_html: c ? buildStampaHTML(c, testo) : '',
  };
  const payload = { cartella_id, user_id: currentUser.id, tipo: 'consiglio', nota: c?.nome || consiglioId, dati: JSON.stringify(dati) };
  showLoading(true);
  let result;
  const existing = noteConsigli[consiglioId];
  if (existing?.id) {
    result = await sb.from('note_specialistiche').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', existing.id).select().single();
  } else {
    result = await sb.from('note_specialistiche').insert({ ...payload, created_at: new Date().toISOString(), visible_to_patient: false }).select().single();
  }
  showLoading(false);
  if (result.error) {
    if (result.error.code === '42P01' || result.error.message?.includes('schema cache')) {
      mostraModalSetupSQL();
    } else {
      toast('❌ ' + result.error.message, 'err');
    }
    return;
  }
  const savedId = result.data?.id || existing?.id;
  // Reload notes to get the new ID
  await caricaNoteConsigli(cartella_id);
  const stato = document.getElementById('note-stato-' + consiglioId);
  if (stato) stato.textContent = '✅ ' + _L('Nota salvata in cartella','Note saved to folder');
  toast('✅ ' + _L('Nota salvata!','Note saved!'), 'ok');
  _buildAndCaptureCons(c, testo, savedId, cartella_id);
}

function aggiornaCountSelezione() {
  const selected = document.querySelectorAll('.cc-sel-cb:checked');
  const count = selected.length;
  const countEl = document.getElementById('cs-sel-count');
  const btn = document.getElementById('cs-salva-sel-btn');
  const hint = document.getElementById('cs-paz-hint');
  const cartella_id = document.getElementById('cs-cartella')?.value;
  if (countEl) {
    if (count > 0) {
      countEl.textContent = count + ' selezionat' + (count === 1 ? 'o' : 'i');
      countEl.style.display = 'inline-block';
    } else {
      countEl.style.display = 'none';
    }
  }
  if (btn) btn.style.display = (count > 0 && cartella_id) ? 'inline-flex' : 'none';
  if (hint) hint.style.display = count > 0 ? 'none' : '';
}

async function salvaSelezioneInCartella() {
  if (!currentUser) { toast(_L('Effettua il login per salvare','Please log in to save'), 'err'); return; }
  const cartella_id = document.getElementById('cs-cartella')?.value;
  if (!cartella_id) { toast(_L('Seleziona una cartella paziente nella barra in alto','Select a patient folder in the top bar'), 'err'); return; }
  const selected = [...document.querySelectorAll('.cc-sel-cb:checked')];
  if (!selected.length) { toast(_L('Nessun consiglio selezionato','No advice selected'), 'err'); return; }
  showLoading(true);
  let saved = 0, errors = 0;
  const tuttiConsigli = getAllConsigli();
  const captureItems = [];
  for (const cb of selected) {
    const consiglioId = cb.dataset.id;
    const c = tuttiConsigli.find(x => x.id === consiglioId);
    const testo = document.getElementById('note-text-' + consiglioId)?.value || '';
    const dati = {
      consiglio_id: consiglioId, consiglio_nome: c?.nome || consiglioId, note_paziente: testo,
      ok: c?.ok || [], no: c?.no || [], mod: c?.mod || [],
      pratici: c?.pratici || [], avvisi: c?.avvisi || [],
      pasti: c?.pasti || '', porzioni: c?.porzioni || '', idratazione: c?.idratazione || '',
      stampa_html: c ? buildStampaHTML(c, testo) : '',
    };
    const payload = { cartella_id, user_id: currentUser.id, tipo: 'consiglio', nota: c?.nome || consiglioId, dati: JSON.stringify(dati) };
    const existing = noteConsigli[consiglioId];
    let result;
    if (existing?.id) {
      result = await sb.from('note_specialistiche').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', existing.id);
    } else {
      result = await sb.from('note_specialistiche').insert({ ...payload, created_at: new Date().toISOString(), visible_to_patient: false }).select('id').single();
    }
    if (result.error) {
      if (result.error.code === '42P01' || result.error.message?.includes('schema cache')) {
        showLoading(false); mostraModalSetupSQL(); return;
      }
      errors++;
    } else {
      saved++;
      const savedId = result.data?.id || existing?.id;
      if (c && savedId) captureItems.push({ c, testo, savedId });
    }
  }
  showLoading(false);
  await caricaNoteConsigli(cartella_id);
  if (errors) {
    toast(`⚠️ ${saved} ${_L('salvati','saved')}, ${errors} ${_L('errori','errors')}`, 'err');
  } else {
    toast(`✅ ${saved} ${_L(saved !== 1 ? 'consigli salvati in cartella' : 'consiglio salvato in cartella', saved !== 1 ? 'advice items saved to folder' : 'advice saved to folder')}!`, 'ok');
  }
  if (captureItems.length) {
    (async () => {
      for (const item of captureItems) {
        await _buildAndCaptureCons(item.c, item.testo, item.savedId, cartella_id);
      }
    })();
  }
}


function mostraModalSetupSQL() {
  const sql = `-- Esegui questo SQL nel tuo pannello Supabase (SQL Editor):
CREATE TABLE IF NOT EXISTS note_specialistiche (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cartella_id uuid REFERENCES cartelle(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users NOT NULL,
  tipo text NOT NULL,
  nota text,
  dati jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  visible_to_patient boolean NOT NULL DEFAULT FALSE
);
ALTER TABLE note_specialistiche ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own note" ON note_specialistiche;
CREATE POLICY "Own note" ON note_specialistiche FOR ALL USING (auth.uid() = user_id);

-- Se la tabella esiste già ma manca la colonna updated_at, esegui:
ALTER TABLE note_specialistiche ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();`;
  console.error(sql);
  const modal = document.getElementById('modal-sql-setup');
  if (modal) {
    document.getElementById('sql-setup-text').value = sql;
    openM('modal-sql-setup');
  } else {
    toast('⚠️ Tabella DB mancante — SQL copiato in console (F12)', 'err');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  _asConsiglio = autoSaveFields('nutriplan_draft_consiglio', ['nc-nome','nc-emoji','nc-colore','nc-pasti','nc-porzioni','nc-idratazione','nc-nota','nc-ok','nc-no','nc-mod','nc-pratici','nc-avvisi']);
  _asConsiglio.register();
  document.body.dataset.printTab = 'patologie';
  initCartellaWidget('cs-cartella-cw', { hiddenInputId:'cs-cartella', accentColor:'#16A34A', labelColor:'#15803D', hoverBg:'#F0FDF4', nuovaBg:'#F0FDF4', onSelect:()=>onCartellaChange() });
  renderConsigli();
  renderAtlas();
  renderECM();
  // Then try auth for custom consigli (async, non-blocking)
  (async () => {
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (session?.user) {
        currentUser = session.user;
        await loadProfile().catch(()=>{});
        await loadConsigliCustom();
        if (consigliPersonalizzati.length) renderConsigli();
        // Handle noteId from patient folder
        const noteId = new URLSearchParams(window.location.search).get('noteId');
        if (noteId) {
          const {data} = await sb.from('note_specialistiche').select('*').eq('id', noteId).single();
          if (data) {
            await _cwSetById('cs-cartella-cw', data.cartella_id);
            const hiddenEl = document.getElementById('cs-cartella');
            if (hiddenEl) hiddenEl.value = data.cartella_id;
            await caricaNoteConsigli(data.cartella_id);
            try {
              const d = JSON.parse(data.dati || '{}');
              const cid = d.consiglio_id;
              if (cid) {
                const noteBox = document.getElementById('note-box-' + cid);
                if (noteBox) {
                  const ccBody = noteBox.closest('.cc-body');
                  if (ccBody) {
                    ccBody.classList.add('open');
                    const tog = ccBody.previousElementSibling?.querySelector('.cc-toggle-btn');
                    if (tog) tog.textContent = '▲';
                  }
                  noteBox.classList.add('visible');
                  const btn = document.getElementById('note-btn-' + cid);
                  if (btn) btn.textContent = '✖ Chiudi note';
                  const card = noteBox.closest('.consiglio-card');
                  if (card) setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
                }
              }
            } catch(e) {}
          }
        }
      }
    } catch(e) {}
  })();

  if (typeof initPageTour === 'function') {
    initPageTour('consigli', [
      { icon:'💡', title:_L('Benvenuto in Consigli Nutrizionali','Welcome to Nutritional Tips'), text:_L('Una libreria di consigli pratici per patologia, pronti da condividere con i pazienti o personalizzare con note tue.','A library of practical advice by condition, ready to share with patients or personalise with your own notes.') },
      { selector:'.cs-tabs', title:_L('Tre modalità','Three modes'), text:_L('"Consigli per Patologia" per schede pronte all\'uso, "Educazione Alimentare" per materiale divulgativo, "Atlante Porzioni" per stime visive delle porzioni.','"Advice by Condition" for ready-to-use sheets, "Nutrition Education" for educational material, "Portion Atlas" for visual portion estimates.') },
      { selector:'#cs-cartella-cw', title:_L('Personalizza per un paziente','Personalise for a patient'), text:_L('Seleziona la cartella di un paziente per aggiungere note tue ai consigli, salvate direttamente nella sua scheda clinica.','Select a patient\'s file to add your own notes to the advice, saved directly to their clinical record.') },
      { selector:'#cs-search', title:_L('Cerca per patologia','Search by condition'), text:_L('Filtra rapidamente i consigli digitando il nome della patologia o della parola chiave che ti interessa.','Quickly filter advice by typing the condition name or a keyword you\'re after.') }
    ], { badge:_L('Consigli Nutrizionali','Nutritional Tips') });
  }
});
