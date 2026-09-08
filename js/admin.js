/* ============================================================
   Admin editor — a small in-page CMS for a static site.

   Sign in (see the hashes below) and you can rewrite any text,
   swap or add photos and videos, drag blocks anywhere, and
   resize them. Edits live in this browser: text and layout in
   localStorage, uploaded media in IndexedDB. Nothing reaches
   the published site until you press Export, which hands back
   a zip of the finished HTML plus every file you added — drop
   that into the repo and commit.

   NOTE: this is a convenience lock, not real security. The page
   is static, so the check runs client-side. Nothing sensitive
   should live behind it.
   ============================================================ */
(function () {
  'use strict';

  var ID_HASH = '56707353998140b088ee30affb65505788cc8e3af470d32818bf8a66d145f1c8';
  var PW_HASH = '72ab994fa2eb426c051ef59cad617750bfe06d7cf6311285ff79c19c32afd236';
  var GA_URL  = 'https://analytics.google.com/analytics/web/';

  var PAGE = (location.pathname.split('/').pop() || 'index.html');
  var LS_HTML = 'jjedit:html:' + PAGE;
  var LS_BUILD = 'jjedit:build:' + PAGE;
  var LS_STASH = 'jjedit:stash:' + PAGE;   // edits set aside after a rebuild
  var UPLOAD_DIR = 'assets/media/uploads/';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function sha256(text) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (h) {
      return Array.prototype.map.call(new Uint8Array(h), function (b) {
        return b.toString(16).padStart(2, '0');
      }).join('');
    });
  }

  /* ==========================================================
     IndexedDB — uploaded photos and videos, keyed by filename
     ========================================================== */
  var DB = null;
  function db() {
    if (DB) return Promise.resolve(DB);
    return new Promise(function (res, rej) {
      var r = indexedDB.open('jj-media', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('files'); };
      r.onsuccess = function () { DB = r.result; res(DB); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function dbTx(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var tx = d.transaction('files', mode), st = tx.objectStore('files'), out;
        out = fn(st);
        tx.oncomplete = function () {
          res(out && typeof out === 'object' && 'result' in out ? out.result : out);
        };
        tx.onerror = function () { rej(tx.error); };
      });
    });
  }
  var mediaPut = function (k, blob) { return dbTx('readwrite', function (s) { s.put(blob, k); }); };
  var mediaGet = function (k) { return dbTx('readonly', function (s) { return s.get(k); }); };
  var mediaKeys = function () { return dbTx('readonly', function (s) { return s.getAllKeys(); }); };
  var mediaClear = function () { return dbTx('readwrite', function (s) { s.clear(); }); };

  /* ==========================================================
     Restore — runs on every page load, signed in or not
     ========================================================== */
  function mainEl() { return document.getElementById('main'); }

  function restore() {
    var saved = null, build = null;
    try {
      saved = localStorage.getItem(LS_HTML);
      build = localStorage.getItem(LS_BUILD);
    } catch (e) { /* private mode */ }
    var m = mainEl();
    if (!m) return rehydrateMedia();

    // escape hatch: ?fresh=1 shows the published page and touches nothing
    if (/[?&]fresh=1\b/.test(location.search)) return rehydrateMedia();

    if (!saved) return rehydrateMedia();

    // If the published page was rewritten underneath a saved copy, the two have
    // diverged and there is no safe automatic merge. Showing the saved copy
    // would silently hide the new content -- which looks exactly like the edit
    // never landed -- so the source wins. The edits are set aside under their
    // own key and offered back through a banner instead of being dropped.
    var cur = m.getAttribute('data-build');
    if (cur && build && cur !== build) {
      try {
        localStorage.setItem(LS_STASH, saved);
        localStorage.removeItem(LS_HTML);
        localStorage.removeItem(LS_BUILD);
      } catch (e) { /* nothing to do; the published page is already correct */ }
      staleBanner();
      return rehydrateMedia();
    }

    m.innerHTML = saved;
    if (dropEmptyPlaceholders(m)) save(true);
    return rehydrateMedia();
  }

  // Offered on load when a saved copy was set aside. This has to work without
  // signing in, because being signed out is the state you land in after a
  // rebuild, and the edits are otherwise invisible and unreachable.
  function staleBanner() {
    if ($('#edStale')) return;
    var b = document.createElement('div');
    b.id = 'edStale';
    b.setAttribute('data-admin-ui', '');

    var msg = document.createElement('p');
    msg.textContent = '이 페이지의 원본이 새로 바뀌어서, 지금은 최신 원본을 보고 있습니다. 예전에 저장해 둔 편집본은 따로 보관해 두었습니다.';

    var acts = document.createElement('div');
    acts.className = 'acts';

    var use = document.createElement('button');
    use.type = 'button';
    use.textContent = '내 편집본 보기';
    use.addEventListener('click', applyStash);

    var drop = document.createElement('button');
    drop.type = 'button';
    drop.className = 'ghost';
    drop.textContent = '편집본 버리기';
    drop.addEventListener('click', function () {
      if (!confirm('보관해 둔 편집본을 지울까요? 되돌릴 수 없습니다.')) return;
      try { localStorage.removeItem(LS_STASH); } catch (e) {}
      b.remove();
    });

    acts.appendChild(use);
    acts.appendChild(drop);
    b.appendChild(msg);
    b.appendChild(acts);
    document.body.appendChild(b);
  }

  // Promote the stash back to the live copy, then reload rather than swapping
  // innerHTML here: a reload lets js/site.js wire the restored markup normally.
  function applyStash() {
    var stash = null;
    try { stash = localStorage.getItem(LS_STASH); } catch (e) {}
    if (!stash) return;
    var m = mainEl();
    try {
      localStorage.setItem(LS_HTML, stash);
      if (m && m.getAttribute('data-build')) localStorage.setItem(LS_BUILD, m.getAttribute('data-build'));
      localStorage.removeItem(LS_STASH);
    } catch (e) { return; }
    location.reload();
  }

  function hasStash() {
    try { return !!localStorage.getItem(LS_STASH); } catch (e) { return false; }
  }

  // An "add photo" block that was never filled in is just clutter on the live
  // page, so drop any placeholder that still has no media in it. Runs on load
  // as well as on save, so blocks abandoned in an earlier session disappear.
  function dropEmptyPlaceholders(root) {
    var gone = 0;
    (root || document).querySelectorAll('.ed-ph').forEach(function (ph) {
      var block = ph.closest('[data-blk]') || ph.parentElement;
      if (block && !block.querySelector('img,video')) { block.remove(); gone++; }
      else ph.remove();
    });
    return gone;
  }

  // Uploaded files are referenced by [data-upload]; swap in a live object URL.
  function rehydrateMedia() {
    var nodes = $$('[data-upload]');
    if (!nodes.length) return Promise.resolve();
    return Promise.all(nodes.map(function (el) {
      return mediaGet(el.getAttribute('data-upload')).then(function (blob) {
        if (!blob || typeof blob.arrayBuffer !== 'function') return;
        var url = URL.createObjectURL(blob);
        if (el.tagName === 'VIDEO') {
          var src = el.querySelector('source');
          if (src) src.src = url; else el.src = url;
          el.load();
        } else {
          el.src = url;
        }
      }).catch(function () {});
    }));
  }

  /* ==========================================================
     Save — serialise <main> with all editor chrome stripped
     ========================================================== */
  var saveTimer = null;
  function cleanClone() {
    var m = mainEl();
    if (!m) return null;
    var c = m.cloneNode(true);
    dropEmptyPlaceholders(c);
    $$('[data-admin-ui]', c).forEach(function (n) { n.remove(); });
    $$('[contenteditable]', c).forEach(function (n) { n.removeAttribute('contenteditable'); });
    $$('.ed-sel', c).forEach(function (n) { n.classList.remove('ed-sel'); });
    // js/site.js parks not-yet-revealed blocks at opacity:0 with an inline
    // transform. Serialising that state would bake "invisible" into the saved
    // copy, so clear just those properties and leave layout styles alone.
    $$('[data-reveal]', c).forEach(function (n) {
      ['opacity', 'transform', 'transition', 'transition-delay'].forEach(function (prop) {
        n.style.removeProperty(prop);
      });
      if (!n.getAttribute('style')) n.removeAttribute('style');
    });
    // an object URL is meaningless outside this session; the data-upload key is the truth
    $$('[data-upload]', c).forEach(function (n) {
      var path = UPLOAD_DIR + n.getAttribute('data-upload');
      if (n.tagName === 'VIDEO') {
        var s = n.querySelector('source'); if (s) s.setAttribute('src', path);
        n.removeAttribute('src');
      } else {
        n.setAttribute('src', path);
      }
    });
    return c;
  }
  function save(quiet) {
    var c = cleanClone();
    if (!c) return;
    try {
      localStorage.setItem(LS_HTML, c.innerHTML);
      var m = mainEl();
      if (m && m.getAttribute('data-build')) localStorage.setItem(LS_BUILD, m.getAttribute('data-build'));
      status('Saved', true);
    } catch (e) {
      status('Storage full — export and reset', false);
      if (!quiet) toast('Browser storage is full. Export your work, then Reset this page.');
    }
  }
  function saveSoon() {
    clearTimeout(saveTimer);
    status('Editing…', false);
    saveTimer = setTimeout(save, 600);
  }

  /* ==========================================================
     Small UI helpers
     ========================================================== */
  function toast(msg, ms) {
    var t = $('#edToast');
    if (!t) { t = document.createElement('div'); t.id = 'edToast'; t.setAttribute('data-admin-ui',''); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('show'); }, ms || 2600);
  }
  function status(txt, ok) {
    var s = $('#edStatus');
    if (s) { s.textContent = txt; s.classList.toggle('saved', !!ok); }
  }

  // ids must stay unique as blocks are added or duplicated
  function nextId(prefix, attr) {
    var max = 0;
    $$('[' + attr + ']').forEach(function (n) {
      var v = parseInt((n.getAttribute(attr) || '').slice(1), 10);
      if (v > max) max = v;
    });
    return prefix + (max + 1);
  }
  function stampNew(root) {
    if (root.matches && root.matches('[data-blk]')) root.setAttribute('data-blk', nextId('b', 'data-blk'));
    $$('[data-blk]', root).forEach(function (n) { n.setAttribute('data-blk', nextId('b', 'data-blk')); });
    if (root.matches && root.matches('[data-ed]')) root.setAttribute('data-ed', nextId('t', 'data-ed'));
    $$('[data-ed]', root).forEach(function (n) { n.setAttribute('data-ed', nextId('t', 'data-ed')); });
    return root;
  }

  /* ==========================================================
     Sizing — width as a % of the container, height as an aspect
     ratio on the media. Both are relative, so a resized photo
     still shrinks on a phone instead of overflowing it.
     ========================================================== */
  function mediaOf(el) {
    if (!el) return null;
    if (/^(IMG|VIDEO)$/.test(el.tagName)) return el;
    return el.querySelector(':scope > img, :scope > video, :scope > figure > img, ' +
                            ':scope > figure > video, :scope > picture > img');
  }
  function widthPct(el) {
    return parseFloat(el.style.width) || 100;
  }
  function setWidth(el, pct) {
    pct = Math.max(5, Math.min(100, pct));
    el.classList.add('ed-sized');
    el.style.width = pct.toFixed(2) + '%';
    return pct;
  }
  function setRatio(el, ar) {
    if (!ar || !isFinite(ar) || ar <= 0) {
      el.classList.remove('ed-ar');
      el.style.removeProperty('--ed-ar');
      return null;
    }
    ar = Math.max(0.2, Math.min(6, ar));
    el.classList.add('ed-ar');
    el.style.setProperty('--ed-ar', ar.toFixed(4));
    return ar;
  }
  function resetSize(el) {
    el.classList.remove('ed-sized', 'ed-ar');
    el.style.width = '';
    el.style.gridColumn = '';
    el.style.removeProperty('--ed-ar');
    saveSoon();
    toast('원래 크기로 되돌렸습니다');
  }

  // Inside a grid, 100% only ever means "one column". To actually make a tile
  // bigger you have to give it more columns, so the +/- buttons step the span
  // once the width is already maxed out.
  function gridCols(el) {
    var p = el.parentElement;
    if (!p) return 0;
    var cs = getComputedStyle(p);
    if (cs.display.indexOf('grid') === -1) return 0;
    return (cs.gridTemplateColumns || '').split(' ').filter(Boolean).length;
  }
  function spanOf(el) {
    var m = /span\s+(\d+)/.exec(el.style.gridColumn || '');
    return m ? parseInt(m[1], 10) : 1;
  }
  function setSpan(el, nSpan, maxCols) {
    nSpan = Math.max(1, Math.min(maxCols, nSpan));
    el.style.gridColumn = nSpan > 1 ? 'span ' + nSpan : '';
    return nSpan;
  }
  function stepWidth(el, delta) {
    var cols = gridCols(el), span = spanOf(el), pct = widthPct(el);
    if (cols > 1) {
      if (delta > 0 && pct >= 99.5 && span < cols) {
        var s1 = setSpan(el, span + 1, cols);
        saveSoon(); badge(el, s1 + '칸 / ' + cols);
        return;
      }
      if (delta < 0 && span > 1 && pct >= 99.5) {
        var s2 = setSpan(el, span - 1, cols);
        saveSoon(); badge(el, s2 + '칸 / ' + cols);
        return;
      }
    }
    var np = setWidth(el, pct + delta);
    saveSoon();
    badge(el, Math.round(np) + '%' + (span > 1 ? '  ·  ' + span + '칸' : ''));
  }

  // a transient read-out pinned to the block being resized
  var badgeEl = null, badgeTimer = null;
  function badge(el, txt, sticky) {
    if (!badgeEl) {
      badgeEl = document.createElement('div');
      badgeEl.id = 'edSize';
      badgeEl.setAttribute('data-admin-ui', '');
      document.body.appendChild(badgeEl);
    }
    var r = el.getBoundingClientRect();
    badgeEl.textContent = txt;
    badgeEl.style.left = (r.left + window.scrollX + 8) + 'px';
    badgeEl.style.top = (r.top + window.scrollY + 8) + 'px';
    badgeEl.classList.add('show');
    clearTimeout(badgeTimer);
    if (!sticky) badgeTimer = setTimeout(function () { badgeEl.classList.remove('show'); }, 1100);
  }
  function badgeHide() { if (badgeEl) badgeEl.classList.remove('show'); }

  /* ==========================================================
     Selection + per-block toolbar
     ========================================================== */
  var sel = null, tools = null, resizer = null;

  function clearSel() {
    badgeHide();
    if (sel) sel.classList.remove('ed-sel');
    sel = null;
    if (tools) { tools.remove(); tools = null; }
    if (resizer) { resizer.remove(); resizer = null; }
  }

  function btn(label, cls, fn) {
    var b = document.createElement('button');
    b.type = 'button'; b.textContent = label;
    if (cls) b.className = cls;
    b.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); fn(e); });
    return b;
  }

  function selectBlock(el) {
    if (sel === el) return;
    clearSel();
    sel = el;
    el.classList.add('ed-sel');

    tools = document.createElement('div');
    tools.className = 'ed-tools';
    tools.setAttribute('data-admin-ui', '');
    tools.style.left = '0px';
    tools.style.top = '-40px';

    var free = el.parentElement && el.parentElement.getAttribute('data-free') === '1';
    var up = el.parentElement && el.parentElement.closest('#main [data-blk]');
    if (up) tools.appendChild(btn('⇱ 바깥', '', function () { selectBlock(up); }));
    var drag = btn('✥ move', 'drag', function () {});
    drag.addEventListener('mousedown', startDrag);
    drag.addEventListener('touchstart', startDrag, { passive: false });
    tools.appendChild(drag);

    if (!free) {
      tools.appendChild(btn('↑', '', function () { moveInFlow(el, -1); }));
      tools.appendChild(btn('↓', '', function () { moveInFlow(el, 1); }));
    }
    if (el.querySelector('img,video') || el.matches('img,video')) {
      tools.appendChild(btn('⇄ replace', '', function () { pickMedia(el); }));
    }
    var media = mediaOf(el);
    tools.appendChild(btn('−', '', function () { stepWidth(el, -10); }));
    tools.appendChild(btn('+', '', function () { stepWidth(el, 10); }));
    if (media) {
      tools.appendChild(btn('↕ 비율', '', function () {
        var r = media.getBoundingClientRect();
        var cur = r.height ? r.width / r.height : 1.5;
        var next = prompt('가로:세로 비율 (예: 16:9, 4:3, 1:1). 비우면 원래 비율.',
                          cur.toFixed(2));
        if (next === null) return;
        next = next.trim();
        if (!next) { setRatio(el, null); saveSoon(); toast('원래 비율로 되돌렸습니다'); return; }
        var m = next.split(/[:\/]/);
        var ar = m.length === 2 ? parseFloat(m[0]) / parseFloat(m[1]) : parseFloat(next);
        if (!isFinite(ar) || ar <= 0) { toast('비율을 알아듣지 못했습니다'); return; }
        setRatio(el, ar); saveSoon(); toast('비율 적용됨');
      }));
    }
    tools.appendChild(btn('↺ 크기', '', function () { resetSize(el); }));
    tools.appendChild(btn('⧉ copy', '', function () {
      var c = stampNew(el.cloneNode(true));
      c.classList.remove('ed-sel');
      el.parentNode.insertBefore(c, el.nextSibling);
      saveSoon(); selectBlock(c);
    }));
    tools.appendChild(btn('✕ delete', 'danger', function () {
      if (!confirm('이 블록을 삭제할까요?')) return;
      var p = el.parentNode; clearSel(); el.remove(); saveSoon();
      if (p) toast('삭제했습니다');
    }));
    el.appendChild(tools);

    resizer = document.createElement('div');
    resizer.className = 'ed-resize' + (mediaOf(el) ? '' : ' w-only');
    resizer.title = mediaOf(el) ? '끌어서 크기 조절 (가로·세로)' : '끌어서 폭 조절';
    resizer.setAttribute('data-admin-ui', '');
    resizer.addEventListener('mousedown', startResize);
    resizer.addEventListener('touchstart', startResize, { passive: false });
    el.appendChild(resizer);
  }

  function moveInFlow(el, dir) {
    var p = el.parentNode;
    var sibs = $$(':scope > [data-blk]', p);
    var i = sibs.indexOf(el);
    var j = i + dir;
    if (j < 0 || j >= sibs.length) return;
    if (dir < 0) p.insertBefore(el, sibs[j]);
    else p.insertBefore(sibs[j], el);
    saveSoon();
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  /* ==========================================================
     Free layout — absolute coordinates as % of the canvas
     ========================================================== */
  function canvasOf(el) {
    var p = el.parentElement;
    return (p && p.getAttribute('data-free') === '1') ? p : null;
  }

  function enableFree(wrap) {
    var kids = $$(':scope > [data-blk]', wrap);
    if (!kids.length) { toast('이 구역에는 옮길 블록이 없습니다'); return; }
    var wr = wrap.getBoundingClientRect();
    var h = wrap.offsetHeight || 600;
    // freeze the current stacked positions so nothing jumps on switch-over
    var boxes = kids.map(function (k) {
      var r = k.getBoundingClientRect();
      return { el: k, x: (r.left - wr.left) / wr.width, y: (r.top - wr.top) / h, w: r.width / wr.width };
    });
    wrap.setAttribute('data-free', '1');
    wrap.style.aspectRatio = wr.width + ' / ' + h;
    boxes.forEach(function (b) {
      b.el.style.left = (b.x * 100).toFixed(3) + '%';
      b.el.style.top = (b.y * 100).toFixed(3) + '%';
      b.el.style.width = (b.w * 100).toFixed(3) + '%';
    });
    addCanvasHandle(wrap);
    saveSoon();
    toast('자유 배치 켜짐 — 블록을 아무 데나 끌어다 놓으세요');
  }

  function disableFree(wrap) {
    wrap.removeAttribute('data-free');
    wrap.style.aspectRatio = '';
    $$(':scope > [data-blk]', wrap).forEach(function (k) {
      k.style.left = k.style.top = k.style.width = '';
    });
    var h = $('.ed-canvas-h', wrap); if (h) h.remove();
    saveSoon();
    toast('자유 배치 꺼짐 — 원래 흐름으로 돌아갑니다');
  }

  function addCanvasHandle(wrap) {
    if ($(':scope > .ed-canvas-h', wrap)) return;
    var h = document.createElement('div');
    h.className = 'ed-canvas-h';
    h.setAttribute('data-admin-ui', '');
    h.title = '구역 높이 조절';
    var down = function (e) {
      e.preventDefault(); e.stopPropagation();
      var startY = (e.touches ? e.touches[0] : e).clientY;
      var r = wrap.getBoundingClientRect();
      var startH = r.height, w = r.width;
      var move = function (ev) {
        var y = (ev.touches ? ev.touches[0] : ev).clientY;
        var nh = Math.max(160, startH + (y - startY));
        wrap.style.aspectRatio = w + ' / ' + nh;
      };
      var up = function () {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        document.removeEventListener('touchmove', move);
        document.removeEventListener('touchend', up);
        saveSoon();
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
      document.addEventListener('touchmove', move, { passive: false });
      document.addEventListener('touchend', up);
    };
    h.addEventListener('mousedown', down);
    h.addEventListener('touchstart', down, { passive: false });
    wrap.appendChild(h);
  }

  /* ---- drag ---- */
  function startDrag(e) {
    if (!sel) return;
    e.preventDefault(); e.stopPropagation();
    var canvas = canvasOf(sel);
    if (!canvas) { toast('먼저 이 구역에서 “자유 배치”를 켜세요'); return; }
    var pt = e.touches ? e.touches[0] : e;
    var cr = canvas.getBoundingClientRect();
    var br = sel.getBoundingClientRect();
    var offX = pt.clientX - br.left, offY = pt.clientY - br.top;

    var move = function (ev) {
      var p = ev.touches ? ev.touches[0] : ev;
      var x = (p.clientX - offX - cr.left) / cr.width;
      var y = (p.clientY - offY - cr.top) / cr.height;
      x = Math.max(-0.02, Math.min(0.98, x));
      y = Math.max(-0.02, Math.min(0.99, y));
      sel.style.left = (x * 100).toFixed(3) + '%';
      sel.style.top = (y * 100).toFixed(3) + '%';
    };
    var up = function () {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', up);
      saveSoon();
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', up);
  }

  /* ---- resize: horizontal drag sets width, vertical drag sets the
         media's aspect ratio, so photos and videos grow and shrink
         in both directions ---- */
  function startResize(e) {
    if (!sel) return;
    e.preventDefault(); e.stopPropagation();
    var pt = e.touches ? e.touches[0] : e;
    var br = sel.getBoundingClientRect();
    var media = mediaOf(sel);
    var mr = media ? media.getBoundingClientRect() : null;
    var startX = pt.clientX, startY = pt.clientY;
    var startW = Math.max(1, br.width);
    var startPct = widthPct(sel);
    var startMW = mr ? Math.max(1, mr.width) : startW;
    var startMH = mr ? Math.max(1, mr.height) : Math.max(1, br.height);

    var move = function (ev) {
      var p = ev.touches ? ev.touches[0] : ev;
      var dx = p.clientX - startX, dy = p.clientY - startY;
      var factor = Math.max(0.05, (startW + dx) / startW);
      var pct = setWidth(sel, startPct * factor);
      var label = Math.round(pct) + '%';
      if (media) {
        // the media width follows the block, so grow the height by the same
        // factor first and only then fold in the vertical drag
        var w = startMW * factor;
        var h = Math.max(30, startMH * factor + dy);
        var ar = setRatio(sel, w / h);
        if (ar) label += '  ·  ' + ar.toFixed(2) + ':1';
      }
      badge(sel, label, true);
    };
    var up = function () {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', up);
      badgeHide();
      saveSoon();
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', up);
  }

  /* ==========================================================
     Media
     ========================================================== */
  function safeName(name) {
    return name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'file';
  }

  function pickMedia(block, mode) {
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = mode === 'video' ? 'video/*' : (mode === 'image' ? 'image/*' : 'image/*,video/*');
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0];
      if (!f) return;
      var isVid = /^video\//.test(f.type);
      var key = safeName(f.name);
      mediaPut(key, f).then(function () {
        var url = URL.createObjectURL(f);
        var target = block.querySelector('img,video') || block;
        var fresh;
        if (isVid) {
          fresh = document.createElement('video');
          fresh.controls = true; fresh.setAttribute('preload', 'metadata');
          fresh.setAttribute('playsinline', '');
          var s = document.createElement('source');
          s.src = url; s.type = f.type || 'video/mp4';
          fresh.appendChild(s);
        } else {
          fresh = document.createElement('img');
          fresh.src = url;
          fresh.setAttribute('loading', 'lazy');
          fresh.setAttribute('decoding', 'async');
          fresh.alt = (target.getAttribute && target.getAttribute('alt')) || f.name.replace(/\.[^.]+$/, '');
        }
        fresh.setAttribute('data-upload', key);
        if (target === block) {
          var ph = block.querySelector('.ed-ph');
          if (ph) ph.replaceWith(fresh); else block.insertBefore(fresh, block.firstChild);
        } else {
          target.replaceWith(fresh);
        }
        saveSoon();
        toast((isVid ? '영상' : '사진') + ' 넣었습니다 — ' + key);
      }).catch(function () { toast('파일을 저장하지 못했습니다'); });
    });
    inp.click();
  }

  /* ==========================================================
     Inserting blocks
     ========================================================== */
  function insertionPoint() {
    if (sel) return { parent: sel.parentNode, before: sel.nextSibling };
    var wraps = $$('#main .wrap[data-wrap]');
    var w = wraps[wraps.length - 1];
    return w ? { parent: w, before: null } : null;
  }

  function addBlock(kind) {
    var at = insertionPoint();
    if (!at) { toast('넣을 자리를 찾지 못했습니다'); return; }
    var el = document.createElement(kind === 'text' ? 'div' : 'figure');
    if (kind === 'text') {
      el.className = 'prose';
      el.innerHTML = '<p>새 문단입니다. 두 번 눌러 고쳐 쓰세요.</p>';
    } else {
      el.className = 'fig';
      el.innerHTML = '<div class="ed-ph">' + (kind === 'video' ? '영상 올리기' : '사진 올리기') +
                     '</div><figcaption>설명을 적으세요.</figcaption>';
    }
    el.setAttribute('data-blk', 'b0');
    stampNew(el);
    at.parent.insertBefore(el, at.before);

    if (at.parent.getAttribute('data-free') === '1') {
      el.style.left = '5%'; el.style.top = '5%'; el.style.width = '40%';
    }
    if (kind !== 'text') {
      var ph = el.querySelector('.ed-ph');
      ph.addEventListener('click', function () { pickMedia(el, kind); });
      pickMedia(el, kind);
    }
    saveSoon();
    selectBlock(el);
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  /* ==========================================================
     Export — a zip of the finished page and every upload
     ========================================================== */
  var CRC = (function () {
    var t = new Uint32Array(256);
    for (var i = 0; i < 256; i++) {
      var c = i;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c >>> 0;
    }
    return t;
  })();
  function crc32(u8) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  // Minimal STORE-method zip. No compression, which keeps this to a few lines
  // and costs nothing here: the payload is already-compressed jpg/mp4.
  function makeZip(files) {
    var enc = new TextEncoder(), parts = [], central = [], offset = 0;
    function u16(n) { return [n & 255, (n >> 8) & 255]; }
    function u32(n) { return [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255]; }
    files.forEach(function (f) {
      var name = enc.encode(f.name), data = f.data, c = crc32(data);
      var local = [].concat([80, 75, 3, 4], u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(c), u32(data.length), u32(data.length), u16(name.length), u16(0));
      parts.push(new Uint8Array(local), name, data);
      central.push([].concat([80, 75, 1, 2], u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(c), u32(data.length), u32(data.length), u16(name.length),
        u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset)));
      central.push(name);
      offset += local.length + name.length + data.length;
    });
    var cdir = [], cdirLen = 0;
    for (var i = 0; i < central.length; i++) {
      var b = central[i] instanceof Uint8Array ? central[i] : new Uint8Array(central[i]);
      cdir.push(b); cdirLen += b.length;
    }
    var end = new Uint8Array([].concat([80, 75, 5, 6], u16(0), u16(0),
      u16(files.length), u16(files.length), u32(cdirLen), u32(offset), u16(0)));
    return new Blob(parts.concat(cdir, [end]), { type: 'application/zip' });
  }

  function exportZip() {
    toast('내보내는 중…', 8000);
    var doc = document.documentElement.cloneNode(true);
    ['#adminBar', '#edToast', '#edHelp', '#loginModal'].forEach(function (s) {
      var n = doc.querySelector(s); if (n) n.remove();
    });
    $$('[data-admin-ui]', doc).forEach(function (n) { n.remove(); });
    $$('[contenteditable]', doc).forEach(function (n) { n.removeAttribute('contenteditable'); });
    $$('.ed-sel', doc).forEach(function (n) { n.classList.remove('ed-sel'); });
    var b = doc.querySelector('body');
    if (b) b.classList.remove('admin-mode', 'editing');
    // rewrite object URLs to the paths the committed site will use
    $$('[data-upload]', doc).forEach(function (n) {
      var path = UPLOAD_DIR + n.getAttribute('data-upload');
      if (n.tagName === 'VIDEO') {
        var s = n.querySelector('source'); if (s) s.setAttribute('src', path);
        n.removeAttribute('src');
      } else { n.setAttribute('src', path); }
    });
    // put the login sheet and admin bar back as empty markup so the page still boots
    var html = '<!DOCTYPE html>\n' + doc.outerHTML;

    var used = {};
    $$('[data-upload]').forEach(function (n) { used[n.getAttribute('data-upload')] = 1; });
    var names = Object.keys(used);
    var enc = new TextEncoder();
    var files = [{ name: PAGE, data: enc.encode(html) }];

    Promise.all(names.map(function (k) {
      return mediaGet(k).then(function (blob) {
        return blob ? blob.arrayBuffer().then(function (ab) {
          return { name: UPLOAD_DIR + k, data: new Uint8Array(ab) };
        }) : null;
      });
    })).then(function (media) {
      media.filter(Boolean).forEach(function (f) { files.push(f); });
      var zip = makeZip(files);
      var a = document.createElement('a');
      a.href = URL.createObjectURL(zip);
      a.download = PAGE.replace(/\.html$/, '') + '-export.zip';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      toast('내보냈습니다 — 파일 ' + files.length + '개. 압축을 풀어 저장소에 덮어쓰고 커밋하세요.', 6000);
    });
  }

  /* ==========================================================
     Admin mode wiring
     ========================================================== */
  function setEditing(on) {
    document.body.classList.toggle('editing', on);
    $$('#main [data-ed]').forEach(function (el) {
      if (on) el.setAttribute('contenteditable', 'true');
      else el.removeAttribute('contenteditable');
    });
    var b = $('#abEdit');
    if (b) { b.classList.toggle('on', on); b.textContent = on ? '✓ 편집 중' : '편집'; }
    if (!on) { clearSel(); save(); }
    var fb = $('#abFree'); if (fb) fb.disabled = !on;
  }

  function enterAdmin() {
    document.body.classList.add('admin-mode');
    buildBar();
    if (hasStash()) staleBanner();
    $$('#main .wrap[data-free="1"]').forEach(addCanvasHandle);
  }
  function exitAdmin() {
    setEditing(false);
    sessionStorage.removeItem('admin');
    document.body.classList.remove('admin-mode');
    var bar = $('#adminBar'); if (bar) bar.innerHTML = '';
    if (document.body.classList.contains('study-private')) location.href = 'index.html';
  }

  function buildBar() {
    var bar = $('#adminBar');
    if (!bar || bar.dataset.built) return;
    bar.dataset.built = '1';
    bar.innerHTML = '';
    var add = function (n) { bar.appendChild(n); };
    var who = document.createElement('span'); who.className = 'who'; who.textContent = 'ADMIN';
    add(who);

    var edit = btn('편집', '', function () { setEditing(!document.body.classList.contains('editing')); });
    edit.id = 'abEdit'; add(edit);

    var sep = function () { var s = document.createElement('span'); s.className = 'sep'; add(s); };
    sep();
    add(btn('+ 글', '', function () { addBlock('text'); }));
    add(btn('+ 사진', '', function () { addBlock('image'); }));
    add(btn('+ 영상', '', function () { addBlock('video'); }));
    sep();

    var freeBtn = btn('자유 배치', '', function () {
      var wrap = null;
      if (sel && sel.parentElement && sel.parentElement.closest('#main')) {
        wrap = sel.parentElement;                       // the container of the selection
      } else {
        wrap = $$('#main .wrap[data-wrap]')[0];
      }
      if (!wrap) { toast('구역을 먼저 고르세요 (블록을 한 번 클릭)'); return; }
      if (wrap.getAttribute('data-free') === '1') { disableFree(wrap); freeBtn.classList.remove('on'); }
      else { enableFree(wrap); freeBtn.classList.add('on'); }
    });
    freeBtn.id = 'abFree'; freeBtn.disabled = true; add(freeBtn);

    sep();
    add(btn('도움말', '', openHelp));
    var st = document.createElement('span'); st.id = 'edStatus'; st.className = 'status'; add(st);
    var g = document.createElement('span'); g.className = 'grow'; add(g);

    add(btn('내보내기 ⬇', '', exportZip));
    add(btn('분석', '', function () { window.open(GA_URL, '_blank', 'noopener'); }));
    add(btn('이 페이지 초기화', 'warn', function () {
      if (!confirm('이 페이지의 편집 내용을 모두 버리고 원래대로 돌릴까요?\n(올린 파일은 남습니다)')) return;
      [LS_HTML, LS_BUILD, LS_STASH].forEach(function (k) {
        try { localStorage.removeItem(k); } catch (e) {}
      });
      location.reload();
    }));
    add(btn('올린 파일 비우기', 'warn', function () {
      if (!confirm('이 브라우저에 저장된 사진·영상을 모두 지울까요?')) return;
      mediaClear().then(function () { toast('올린 파일을 모두 지웠습니다'); });
    }));
    add(btn('로그아웃', '', exitAdmin));
    status('Ready', false);
  }

  function openHelp() {
    var h = $('#edHelp');
    if (!h) {
      h = document.createElement('div');
      h.id = 'edHelp'; h.setAttribute('data-admin-ui', '');
      h.innerHTML =
        '<div class="box">' +
        '<h2>편집하는 법</h2>' +
        '<p>먼저 <b>편집</b>을 켜세요. 켜져 있는 동안에만 글이 고쳐지고 블록이 움직입니다.</p>' +
        '<dl>' +
        '<dt>글 고치기</dt><dd>글자 위를 클릭하고 그냥 타이핑하세요. 자동으로 저장됩니다.</dd>' +
        '<dt>블록 고르기</dt><dd>사진·영상·문단을 한 번 클릭하면 위에 작은 도구 막대가 뜹니다.</dd>' +
        '<dt>사진·영상 넣기</dt><dd>아래 <b>+ 사진</b> / <b>+ 영상</b>을 누르면 고른 블록 바로 뒤에 들어갑니다. 이미 있는 것은 <b>⇄ replace</b>로 바꾸세요.</dd>' +
        '<dt>크기 바꾸기</dt><dd>블록 오른쪽 아래 <b>초록 동그라미</b>를 끄세요. <b>옆으로</b> 끌면 가로 폭이, <b>아래위로</b> 끌면 사진·영상의 세로 높이가 바뀝니다. 끄는 동안 현재 크기가 숫자로 뜹니다.</dd>' +
        '<dt>조금씩 조절</dt><dd>도구 막대의 <b>−</b> <b>+</b> 로 10%씩 줄이고 늘립니다. 사진이 여러 칸으로 나뉜 구역(갤러리·2단 그리드)에서는 100%를 넘기면 <b>차지하는 칸 수</b>가 늘어나 더 크게 만들 수 있습니다.</dd>' +
        '<dt>비율 지정</dt><dd><b>↕ 비율</b>에 <code>16:9</code>, <code>4:3</code>, <code>1:1</code> 처럼 적으면 그 비율로 잘립니다. 비우고 확인하면 원래 비율로 돌아갑니다.</dd>' +
        '<dt>크기 되돌리기</dt><dd><b>↺ 크기</b>를 누르면 그 블록만 원래 크기·비율로 돌아갑니다.</dd>' +
        '<dt>자유 배치</dt><dd>블록을 하나 고르고 <b>자유 배치</b>를 누르면 그 구역이 캔버스가 됩니다. 그다음 <b>✥ move</b>를 잡고 아무 데나 끌어다 놓으세요. 구역 아래쪽 초록 막대로 높이를 조절합니다. 위치는 비율로 저장되므로 화면이 좁아지면 전체가 같이 작아집니다.</dd>' +
        '<dt>순서 바꾸기</dt><dd>자유 배치를 켜지 않은 구역에서는 <b>↑ ↓</b>로 위아래 순서를 바꿉니다.</dd>' +
        '<dt>저장</dt><dd>이 브라우저에 자동 저장됩니다. 다른 사람에게도 보이게 하려면 <b>내보내기</b>로 zip을 받아 저장소에 덮어쓰고 커밋하세요.</dd>' +
        '</dl>' +
        '<p><b>내보내기</b>가 중요합니다. 편집 내용은 이 브라우저에만 있습니다. zip 안에는 이 페이지의 HTML과 올린 파일이 들어 있고, 압축을 풀어 저장소 최상위에 덮어쓰면 그대로 반영됩니다.</p>' +
        '<button class="btn accent close" type="button">닫기</button></div>';
      document.body.appendChild(h);
      h.addEventListener('click', function (e) {
        if (e.target === h || e.target.classList.contains('close')) h.classList.remove('open');
      });
    }
    h.classList.add('open');
  }

  /* ---- global interactions while editing ---- */
  function wireCanvasEvents() {
    document.addEventListener('click', function (e) {
      if (!document.body.classList.contains('editing')) return;
      if (e.target.closest('#adminBar,.ed-tools,.ed-resize,.ed-canvas-h,#edHelp,#loginModal')) return;
      // Blocks that are themselves links (the home project rows, the work
      // cards) would navigate away the moment you clicked to select them,
      // losing the selection and any unsaved text. Hold them while editing.
      var link = e.target.closest('#main a[href]');
      if (link) e.preventDefault();
      var blk = e.target.closest('#main [data-blk]');
      if (blk) { selectBlock(blk); } else { clearSel(); }
    });
    document.addEventListener('input', function (e) {
      if (e.target.closest && e.target.closest('#main [data-ed]')) saveSoon();
    });
    document.addEventListener('keydown', function (e) {
      if (!document.body.classList.contains('admin-mode')) return;
      if (e.key === 'Escape') clearSel();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); toast('저장했습니다'); }
    });
    // keep object URLs alive across reloads by re-fetching on pageshow
    window.addEventListener('pageshow', function (e) { if (e.persisted) rehydrateMedia(); });
  }

  /* ==========================================================
     Login
     ========================================================== */
  function setupLogin() {
    var modal = $('#loginModal');
    if (!modal) return;
    var form = $('#loginForm'), err = $('#loginError');
    var open = function () {
      err.textContent = ''; form.reset();
      modal.classList.add('open');
      setTimeout(function () { $('#loginId').focus(); }, 120);
    };
    var close = function () { modal.classList.remove('open'); };
    $$('[data-login]').forEach(function (b) { b.addEventListener('click', open); });
    var cancel = $('#loginCancel'); if (cancel) cancel.addEventListener('click', close);
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('open')) close();
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      Promise.all([sha256($('#loginId').value.trim()), sha256($('#loginPw').value)]).then(function (h) {
        if (h[0] === ID_HASH && h[1] === PW_HASH) {
          sessionStorage.setItem('admin', '1');
          close(); enterAdmin();
          toast('로그인했습니다 — “편집”을 켜고 시작하세요', 4000);
        } else {
          err.textContent = 'ID 또는 비밀번호가 다릅니다.';
        }
      });
    });
    if (/[?&]admin=1\b/.test(location.search) && sessionStorage.getItem('admin') !== '1') open();
  }

  function init() {
    restore().then(function () {
      setupLogin();
      wireCanvasEvents();
      if (sessionStorage.getItem('admin') === '1') enterAdmin();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
