// ── TOUR GUIDATO PER SEZIONE ──────────────────────────────────────────────
// Mostra un giro guidato "spotlight" la prima volta che il dietista apre una
// sezione: evidenzia in sequenza gli elementi chiave della pagina con un
// buco ritagliato nell'overlay scuro + una card con titolo/spiegazione.
// Uso: initPageTour('pageKey', [
//   { title:'...', text:'...', icon:'📋' },                 // step 1: intro centrata (senza selector)
//   { selector:'#foo', title:'...', text:'...' },            // step successivi: spotlight su un elemento
// ]);
// Il tour si mostra una sola volta per pagina (localStorage 'tour_<pageKey>').
//
// ⚠️ TEST TEMPORANEO — RIMUOVERE PRIMA DEL PROSSIMO RILASCIO ⚠️
// _TOUR_ALWAYS_SHOW forza il tour a comparire ad OGNI apertura di sezione,
// ignorando il flag "già visto", per poter rivedere e verificare tutti i
// giri guidati senza dover resettare il localStorage a mano ogni volta.
// Per tornare al comportamento normale (una sola volta a vita per pagina):
// impostare _TOUR_ALWAYS_SHOW a false (o eliminare questa costante e il suo
// utilizzo qui sotto).
var _TOUR_ALWAYS_SHOW = true;
function initPageTour(pageKey, steps, opts) {
  opts = opts || {};
  if (!steps || !steps.length) return;
  var seenKey = 'tour_' + pageKey;
  if (!_TOUR_ALWAYS_SHOW && localStorage.getItem(seenKey)) { if (opts.onSkip) opts.onSkip(); return; }
  if (window.matchMedia && window.matchMedia('(max-width:640px)').matches && opts.skipOnMobile) return;

  var idx = 0;
  var overlay, svg, hole, ring, card;
  var started = false;

  function qEl(sel) {
    if (!sel) return null;
    try { return document.querySelector(sel); } catch (e) { return null; }
  }

  function build() {
    overlay = document.createElement('div');
    overlay.className = 'tour-overlay';
    overlay.innerHTML =
      '<svg class="tour-svg"><defs><mask id="tour-mask-' + pageKey + '">' +
      '<rect width="100%" height="100%" fill="white"/>' +
      '<rect class="tour-hole" rx="12" fill="black"/>' +
      '</mask></defs>' +
      '<rect width="100%" height="100%" fill="rgba(15,23,42,.6)" mask="url(#tour-mask-' + pageKey + ')"/>' +
      '</svg>' +
      '<div class="tour-ring"></div>' +
      '<div class="tour-card"></div>';
    document.body.appendChild(overlay);
    svg = overlay.querySelector('.tour-svg');
    hole = overlay.querySelector('.tour-hole');
    ring = overlay.querySelector('.tour-ring');
    card = overlay.querySelector('.tour-card');
    svg.addEventListener('click', skip);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', reposition);
    // Niente requestAnimationFrame qui: i browser mettono in pausa rAF per i
    // tab non visibili (document.hidden), quindi se la pagina finisce in
    // background nell'istante esatto in cui il tour parte, questa callback
    // non scatta MAI — l'overlay resta bloccato a opacity:0 (invisibile ma
    // comunque presente sopra la pagina) finché il tour non viene completato
    // per intero. Il reflow forzato sotto innesca la transizione in modo
    // sincrono, indipendente da rAF (stesso trucco già usato per la card).
    void overlay.offsetWidth;
    overlay.classList.add('tour-in');
  }

  function onKey(e) { if (e.key === 'Escape') skip(); }

  // Own rAF-driven smooth scroll with a completion callback, instead of
  // native scrollIntoView({behavior:'smooth'}): browsers throttle/batch
  // 'scroll' events during a native smooth scroll, so trying to reposition
  // the spotlight by listening for them can freeze it at a stale in-flight
  // position for long scroll distances. This way the target's final rect is
  // only read once the scroll animation has truly finished.
  function animateScrollTo(targetY, duration, done) {
    var startY = window.pageYOffset || document.documentElement.scrollTop;
    var delta = targetY - startY;
    if (Math.abs(delta) < 2) { done(); return; }
    var startTime = null;
    function step(ts) {
      if (!startTime) startTime = ts;
      var p = Math.min(1, (ts - startTime) / duration);
      var eased = 1 - Math.pow(1 - p, 3);
      window.scrollTo(0, startY + delta * eased);
      if (p < 1) requestAnimationFrame(step); else done();
    }
    requestAnimationFrame(step);
  }

  function render() {
    var step = steps[idx];
    var target = qEl(step.selector);
    if (!target) { position(step, null); return; }
    var r = target.getBoundingClientRect();
    var curScrollY = window.pageYOffset || document.documentElement.scrollTop;
    var desiredY = Math.max(0, curScrollY + r.top + r.height / 2 - window.innerHeight / 2);
    if (Math.abs(desiredY - curScrollY) < 40) { position(step, target); return; }
    animateScrollTo(desiredY, 380, function () { position(step, target); });
  }

  function position(step, target) {
    var rect = target ? target.getBoundingClientRect() : null;

    if (rect) {
      var pad = 7;
      hole.setAttribute('x', Math.max(0, rect.left - pad));
      hole.setAttribute('y', Math.max(0, rect.top - pad));
      hole.setAttribute('width', rect.width + pad * 2);
      hole.setAttribute('height', rect.height + pad * 2);
      ring.style.top = (rect.top - pad) + 'px';
      ring.style.left = (rect.left - pad) + 'px';
      ring.style.width = (rect.width + pad * 2) + 'px';
      ring.style.height = (rect.height + pad * 2) + 'px';
      ring.classList.add('tour-visible');
    } else {
      hole.setAttribute('x', -9999); hole.setAttribute('y', -9999);
      hole.setAttribute('width', 0); hole.setAttribute('height', 0);
      ring.classList.remove('tour-visible');
    }

    buildCard(step, rect);
  }

  function buildCard(step, rect) {
    var isModal = !rect;
    card.className = 'tour-card' + (isModal ? ' tour-modal' : '');

    var dots = steps.map(function (_, i) {
      var cls = 'tour-dot' + (i === idx ? ' tour-dot-active' : (i < idx ? ' tour-dot-done' : ''));
      return '<span class="' + cls + '"></span>';
    }).join('');

    var isLast = idx === steps.length - 1;
    var iconHtml = step.icon ? '<div class="tour-icon">' + step.icon + '</div>' : '';
    var badgeHtml = (!isModal && opts.badge) ? '<div class="tour-badge">' + esc(opts.badge) + '</div>' : '';

    card.innerHTML =
      '<button class="tour-close" aria-label="Chiudi" type="button">✕</button>' +
      iconHtml + badgeHtml +
      '<div class="tour-title">' + step.title + '</div>' +
      '<div class="tour-text">' + step.text + '</div>' +
      '<div class="tour-footer">' +
      '<div class="tour-dots">' + dots + '</div>' +
      '<button class="tour-next" type="button">' + (isLast ? (opts.finishLabel || 'Fatto') : 'Avanti') + '</button>' +
      '</div>' +
      (steps.length > 1 && idx === 0 ? '<button class="tour-skip-link" type="button">Salta il giro guidato</button>' : '');

    card.querySelector('.tour-close').addEventListener('click', skip);
    card.querySelector('.tour-next').addEventListener('click', next);
    var skipLink = card.querySelector('.tour-skip-link');
    if (skipLink) skipLink.addEventListener('click', skip);

    if (isModal) {
      card.classList.remove('tour-card-in');
      void card.offsetWidth;
      card.classList.add('tour-card-in');
      return;
    }

    var margin = 14;
    var top, left;
    // Measure the card's REAL rendered size (opacity:0 doesn't affect layout,
    // so this is accurate) instead of guessing a fixed height — content length
    // varies per step (badge/icon/skip-link presence, title/text length), so a
    // hardcoded estimate can be wrong and let the card spill past the viewport.
    var cardW = card.offsetWidth;
    var cardH = card.offsetHeight;
    var spaceBelow = window.innerHeight - rect.bottom;

    if (spaceBelow > cardH + margin) {
      top = rect.bottom + margin;
    } else if (rect.top > cardH + margin) {
      top = rect.top - cardH - margin;
    } else {
      top = rect.bottom + margin;
    }
    // Unconditional final clamp so the card can never extend past any edge,
    // regardless of which branch above was taken.
    top = Math.max(margin, Math.min(top, window.innerHeight - cardH - margin));
    left = rect.left + rect.width / 2 - cardW / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - cardW - margin));

    card.style.top = top + 'px';
    card.style.left = left + 'px';
    card.classList.remove('tour-card-in');
    void card.offsetWidth;
    card.classList.add('tour-card-in');
  }

  function reposition() {
    if (!overlay) return;
    var step = steps[idx];
    var target = qEl(step.selector);
    position(step, target);
  }

  function next() {
    if (idx < steps.length - 1) { idx++; render(); }
    else done();
  }

  function skip() { done(); }

  function done() {
    localStorage.setItem(seenKey, '1');
    teardown();
    if (opts.onDone) opts.onDone();
  }

  function teardown() {
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', reposition);
    if (overlay) {
      overlay.classList.remove('tour-in');
      setTimeout(function () { if (overlay && overlay.parentNode) overlay.remove(); }, 220);
    }
  }

  function esc(s) {
    var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML;
  }

  function start() {
    if (started) return;
    started = true;
    build();
    render();
  }

  // Se la pagina ha un proprio overlay "prima cosa che vedi" (es. il saluto
  // giornaliero di app.html), aspetta che sparisca prima di far partire il
  // tour — mai due overlay a schermo intero in competizione tra loro.
  function tryStart() {
    if (opts.waitForGone && document.querySelector(opts.waitForGone)) {
      setTimeout(tryStart, 300);
      return;
    }
    start();
  }

  setTimeout(tryStart, opts.delay != null ? opts.delay : 500);
}
