// firma.js — Electronic Signature Component
// Usage: firmaInit() to inject modal HTML into body, then firmaOpen(options) to show it
// options = { title, patientId, docId, onSave(dataUrl, signedAt) }

(function(global) {
  let firmaCanvas, firmaCtx, isDrawing = false, lastX = 0, lastY = 0;
  let pendingCallback = null;
  let pendingOptions = {};

  function firmaInit() {
    if (document.getElementById('firma-modal')) return; // already injected
    const html = `
<style>
#firma-modal{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9990;display:none;align-items:center;justify-content:center;padding:16px}
#firma-modal.open{display:flex}
.firma-box{background:white;border-radius:18px;max-width:520px;width:100%;box-shadow:0 24px 64px rgba(0,0,0,.3);overflow:hidden}
.firma-hdr{padding:16px 20px;border-bottom:1px solid #E2E8F0;display:flex;align-items:center;justify-content:space-between;background:#FAFBFC}
.firma-title{font-size:15px;font-weight:700;color:#1E293B}
.firma-close{background:none;border:none;font-size:20px;cursor:pointer;color:#64748B;padding:2px 6px;border-radius:6px;min-width:36px;min-height:36px;display:flex;align-items:center;justify-content:center}
.firma-close:hover{background:#F1F5F9}
.firma-body{padding:16px 20px}
.firma-info{font-size:12px;color:#64748B;margin-bottom:12px;line-height:1.6;background:#F0FDF4;border-radius:8px;padding:8px 12px;border-left:3px solid #0F766E}
.firma-canvas-wrap{border:2px dashed #CBD5E1;border-radius:12px;overflow:hidden;background:#FAFBFC;cursor:crosshair;position:relative}
.firma-canvas-wrap:hover{border-color:#14B8A6}
#firma-canvas{display:block;width:100%;touch-action:none}
.firma-hint{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:13px;color:#94A3B8;pointer-events:none;font-style:italic;transition:opacity .15s}
.firma-hint.hidden{opacity:0}
.firma-tools{display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap}
.firma-tool-btn{background:white;border:1.5px solid #E2E8F0;border-radius:8px;padding:5px 12px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;color:#64748B;transition:all .15s}
.firma-tool-btn:hover{border-color:#14B8A6;color:#0F766E}
.firma-pen-size{display:flex;align-items:center;gap:5px}
.firma-pen-dot{border-radius:50%;background:#1E293B;cursor:pointer;transition:box-shadow .12s;flex-shrink:0}
.firma-pen-dot.active{box-shadow:0 0 0 2px #0F766E}
.firma-footer{padding:12px 20px;border-top:1px solid #E2E8F0;display:flex;gap:8px;justify-content:flex-end;align-items:center}
.firma-status{font-size:12px;color:#64748B;flex:1}
.firma-saved-badge{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;background:#DCFCE7;color:#16A34A}
</style>
<div id="firma-modal">
  <div class="firma-box">
    <div class="firma-hdr">
      <div class="firma-title" id="firma-title">✍️ Firma Elettronica</div>
      <button class="firma-close" onclick="firmaClose()">✕</button>
    </div>
    <div class="firma-body">
      <div class="firma-info" id="firma-info">
        Firma nel riquadro sottostante con il mouse o con il dito (touchscreen). La firma verrà salvata con data e ora.
      </div>
      <div class="firma-canvas-wrap">
        <canvas id="firma-canvas" height="180"></canvas>
        <div class="firma-hint" id="firma-hint">Inizia a firmare qui...</div>
      </div>
      <div class="firma-tools">
        <button class="firma-tool-btn" onclick="firmaClear()">🗑 Cancella</button>
        <div class="firma-pen-size" title="Spessore penna">
          <div class="firma-pen-dot active" style="width:6px;height:6px" onclick="firmaPenSize(1.5,this)" data-size="1.5"></div>
          <div class="firma-pen-dot" style="width:9px;height:9px" onclick="firmaPenSize(2.5,this)" data-size="2.5"></div>
          <div class="firma-pen-dot" style="width:13px;height:13px" onclick="firmaPenSize(4,this)" data-size="4"></div>
        </div>
        <span style="font-size:11px;color:#94A3B8;margin-left:4px">Spessore</span>
      </div>
    </div>
    <div class="firma-footer">
      <div class="firma-status" id="firma-status"></div>
      <button class="firma-tool-btn" onclick="firmaClose()">Annulla</button>
      <button id="btn-firma-save" style="background:#0F766E;color:white;border:none;border-radius:8px;padding:8px 18px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;transition:background .15s" onclick="firmaSave()">
        💾 Salva Firma
      </button>
    </div>
  </div>
</div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    firmaCanvas = document.getElementById('firma-canvas');
    firmaCtx = firmaCanvas.getContext('2d');
    setupCanvas();
    bindEvents();
  }

  function setupCanvas() {
    const wrap = firmaCanvas.parentElement;
    const w = wrap.clientWidth || 480;
    firmaCanvas.width = w;
    firmaCtx.strokeStyle = '#1E293B';
    firmaCtx.lineWidth = 1.5;
    firmaCtx.lineCap = 'round';
    firmaCtx.lineJoin = 'round';
  }

  function bindEvents() {
    firmaCanvas.addEventListener('mousedown', e => { isDrawing = true; const p = getPos(e); lastX = p.x; lastY = p.y; firmaCtx.beginPath(); firmaCtx.moveTo(p.x, p.y); hideHint(); });
    firmaCanvas.addEventListener('mousemove', e => { if (!isDrawing) return; const p = getPos(e); firmaCtx.lineTo(p.x, p.y); firmaCtx.stroke(); lastX = p.x; lastY = p.y; });
    firmaCanvas.addEventListener('mouseup', () => { isDrawing = false; });
    firmaCanvas.addEventListener('mouseleave', () => { isDrawing = false; });
    firmaCanvas.addEventListener('touchstart', e => { e.preventDefault(); isDrawing = true; const p = getPos(e.touches[0]); lastX = p.x; lastY = p.y; firmaCtx.beginPath(); firmaCtx.moveTo(p.x, p.y); hideHint(); }, { passive: false });
    firmaCanvas.addEventListener('touchmove', e => { e.preventDefault(); if (!isDrawing) return; const p = getPos(e.touches[0]); firmaCtx.lineTo(p.x, p.y); firmaCtx.stroke(); lastX = p.x; lastY = p.y; }, { passive: false });
    firmaCanvas.addEventListener('touchend', () => { isDrawing = false; });
  }

  function getPos(e) {
    const rect = firmaCanvas.getBoundingClientRect();
    const scaleX = firmaCanvas.width / rect.width;
    const scaleY = firmaCanvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function hideHint() {
    document.getElementById('firma-hint').classList.add('hidden');
  }

  function isEmpty() {
    const data = firmaCtx.getImageData(0, 0, firmaCanvas.width, firmaCanvas.height).data;
    for (let i = 3; i < data.length; i += 4) { if (data[i] > 0) return false; }
    return true;
  }

  global.firmaInit = firmaInit;

  global.firmaOpen = function(options) {
    firmaInit();
    pendingOptions = options || {};
    pendingCallback = options.onSave || null;
    document.getElementById('firma-title').textContent = options.title || '✍️ Firma Elettronica';
    if (options.subtitle) document.getElementById('firma-info').textContent = options.subtitle;
    firmaClear();
    document.getElementById('firma-modal').classList.add('open');
    setTimeout(setupCanvas, 50);
  };

  global.firmaClose = function() {
    document.getElementById('firma-modal').classList.remove('open');
    firmaClear();
    pendingCallback = null;
    pendingOptions = {};
  };

  global.firmaClear = function() {
    if (!firmaCtx) return;
    firmaCtx.clearRect(0, 0, firmaCanvas.width, firmaCanvas.height);
    document.getElementById('firma-hint')?.classList.remove('hidden');
    document.getElementById('firma-status').textContent = '';
  };

  global.firmaPenSize = function(size, el) {
    if (firmaCtx) firmaCtx.lineWidth = size;
    document.querySelectorAll('.firma-pen-dot').forEach(d => d.classList.remove('active'));
    el.classList.add('active');
  };

  global.firmaSave = async function() {
    if (isEmpty()) { firmaSetStatus('⚠️ Disegna la firma prima di salvare', '#DC2626'); return; }
    const dataUrl = firmaCanvas.toDataURL('image/png');
    const signedAt = new Date().toISOString();
    firmaSetStatus('💾 Salvataggio...', '#64748B');
    try {
      // Try to upload to Supabase Storage if sb is available
      if (typeof sb !== 'undefined' && pendingOptions.patientId) {
        const fileName = `firma_${pendingOptions.patientId}_${Date.now()}.png`;
        const blob = await (await fetch(dataUrl)).blob();
        const { data: up } = await sb.storage.from('patient-signatures').upload(fileName, blob, { contentType: 'image/png', upsert: false });
        if (up) {
          const { data: urlData } = sb.storage.from('patient-signatures').getPublicUrl(fileName);
          // Save to patient_signatures table if exists
          await sb.from('patient_signatures').insert({
            patient_id: pendingOptions.patientId,
            doc_id: pendingOptions.docId || null,
            signature_url: urlData?.publicUrl || null,
            signed_at: signedAt,
            context: pendingOptions.context || 'documento'
          }).then(() => {});
        }
      }
      firmaSetStatus('✅ Firma salvata!', '#16A34A');
      if (typeof pendingCallback === 'function') pendingCallback(dataUrl, signedAt);
      setTimeout(global.firmaClose, 900);
    } catch(e) {
      // Fallback: return data URL even if storage fails
      firmaSetStatus('✅ Firma acquisita', '#16A34A');
      if (typeof pendingCallback === 'function') pendingCallback(dataUrl, signedAt);
      setTimeout(global.firmaClose, 900);
    }
  };

  function firmaSetStatus(msg, color) {
    const el = document.getElementById('firma-status');
    if (el) { el.textContent = msg; el.style.color = color; }
  }

})(window);
