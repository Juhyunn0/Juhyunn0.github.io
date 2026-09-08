/* ============================================================
   Juhyun Jung — shared site JS (vanilla, multi-page)
   Feature-detects per page: nothing here assumes a given page
   has a cursor target, a marquee, a canvas, or a form.
   ============================================================ */
(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var motion = !reduce;
  var ACCENT = '#008442';
  var accentColor = function () {
    // read off <body> so page-scoped themes (body.theme-green) are honored
    var v = getComputedStyle(document.body).getPropertyValue('--accent').trim();
    return v || ACCENT;
  };

  // Pause every animation loop while the tab is backgrounded (battery), and
  // optionally while a loop's element is scrolled off-screen.
  var pageVisible = !document.hidden;
  var kickers = [];
  document.addEventListener('visibilitychange', function () {
    pageVisible = !document.hidden;
    if (pageVisible) kickers.forEach(function (k) { k(); });
  });

  // Run `step` on rAF. If gateEl is given, pause when it leaves the viewport.
  function animate(step, gateEl) {
    var onScreen = true, running = false;
    function frame(t) {
      if (!pageVisible || !onScreen) { running = false; return; }
      step(t);
      requestAnimationFrame(frame);
    }
    function kick() { if (running) return; running = true; requestAnimationFrame(frame); }
    kickers.push(kick);
    if (gateEl && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) { onScreen = e.isIntersecting; if (onScreen) kick(); });
      }, { threshold: 0 }).observe(gateEl);
    }
    kick();
  }

  function init() {
    hideDecorative();
    setupMobileNav();
    setupReveal();
    setupMotifs();
    setupAccordion();
    setupApplyForm();
    setupLightbox();
    setupInlineVideo();
    setupSectionRail();
    setupRevealPair();
    markCurrentNav();
    if (motion) {
      setupStarfield();
      setupMarquee();
      setupCursor();
    } else {
      drawStaticStars();
    }
  }

  /* ---- hide purely-decorative nodes from assistive tech ---- */
  function hideDecorative() {
    document.querySelectorAll('[data-motif],#cosmic,.marquee,.arr,.star,.hero-card .thesis-link span,.acc-btn .sign,.brand .mark,.fbrand .mark,.hero-card-head .dot')
      .forEach(function (el) { el.setAttribute('aria-hidden', 'true'); });
  }

  /* ---- mobile nav: open/close, focus trap, inert, scroll lock ---- */
  function setupMobileNav() {
    var toggle = document.querySelector('.nav-toggle');
    var drawer = document.getElementById('mobileNav');
    if (!toggle || !drawer) return;
    var main = document.querySelector('main');
    var footer = document.querySelector('footer');
    var lockY = 0;
    var setInert = function (on) {
      [main, footer].forEach(function (el) { if (!el) return; if (on) { el.setAttribute('inert', ''); } else { el.removeAttribute('inert'); } });
    };
    var open = function () {
      lockY = window.scrollY || window.pageYOffset || 0;
      toggle.setAttribute('aria-expanded', 'true');
      drawer.classList.add('open');
      document.body.classList.add('nav-open');
      document.body.style.top = -lockY + 'px';
      setInert(true);
      // defer one frame: the drawer is visibility:hidden until .open settles,
      // and focus() is a no-op on a not-yet-visible element.
      requestAnimationFrame(function () { var first = drawer.querySelector('a'); if (first) first.focus(); });
    };
    var close = function (restoreFocus) {
      toggle.setAttribute('aria-expanded', 'false');
      drawer.classList.remove('open');
      document.body.classList.remove('nav-open');
      document.body.style.top = '';
      window.scrollTo(0, lockY);
      setInert(false);
      if (restoreFocus) toggle.focus();
    };
    toggle.addEventListener('click', function () {
      if (toggle.getAttribute('aria-expanded') === 'true') close(true); else open();
    });
    drawer.addEventListener('click', function (e) { if (e.target.closest('a')) close(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && drawer.classList.contains('open')) { close(true); return; }
      if (e.key === 'Tab' && drawer.classList.contains('open')) {
        var f = drawer.querySelectorAll('a,button');
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    window.addEventListener('resize', function () { if (window.innerWidth > 860 && drawer.classList.contains('open')) close(false); });
  }

  /* ---- scroll reveal ---- */
  function setupReveal() {
    var els = Array.prototype.slice.call(document.querySelectorAll('[data-reveal]'));
    if (!els.length) return;
    var show = function (e) { e.style.opacity = '1'; e.style.transform = 'none'; };
    if (reduce) { els.forEach(show); return; }
    var vh = window.innerHeight;
    var aboveFold = function (e) { var r = e.getBoundingClientRect(); return r.top < vh * 0.92 && r.bottom > 0; };
    var pending = [];
    els.forEach(function (e) {
      if (aboveFold(e)) { show(e); return; }
      e.style.opacity = '0';
      e.style.transform = 'translateY(' + (e.getAttribute('data-ry') || '46') + 'px)';
      e.style.transition = 'opacity .7s ease-in-out, transform .85s cubic-bezier(.2,0,0,1)';
      e.style.transitionDelay = (e.getAttribute('data-d') || '0') + 'ms';
      pending.push(e);
    });
    if (!pending.length) return;
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (ents) {
        ents.forEach(function (en) { if (en.isIntersecting) { show(en.target); io.unobserve(en.target); } });
      }, { threshold: 0.08, rootMargin: '0px 0px -7% 0px' });
      pending.forEach(function (e) { io.observe(e); });
    } else {
      pending.forEach(show);
    }
  }

  /* ---- accordion (fellowship) ---- */
  function setupAccordion() {
    var btns = Array.prototype.slice.call(document.querySelectorAll('.acc-btn'));
    if (!btns.length) return;
    var sync = function (btn) { var p = btn.nextElementSibling; if (btn.getAttribute('aria-expanded') === 'true') { p.style.maxHeight = p.scrollHeight + 'px'; p.style.opacity = '1'; } };
    btns.forEach(function (btn, i) {
      var panel = btn.nextElementSibling;
      if (!panel.id) panel.id = 'acc-panel-' + i;
      btn.setAttribute('aria-controls', panel.id);
      btn.addEventListener('click', function () {
        var open = btn.getAttribute('aria-expanded') === 'true';
        btns.forEach(function (o) {
          if (o !== btn) { o.setAttribute('aria-expanded', 'false'); var p = o.nextElementSibling; p.style.maxHeight = '0'; p.style.opacity = '0'; }
        });
        if (open) { btn.setAttribute('aria-expanded', 'false'); panel.style.maxHeight = '0'; panel.style.opacity = '0'; }
        else { btn.setAttribute('aria-expanded', 'true'); panel.style.maxHeight = panel.scrollHeight + 'px'; panel.style.opacity = '1'; }
      });
    });
    // open the first by default
    var first = btns[0];
    first.setAttribute('aria-expanded', 'true');
    sync(first);
    // recompute open-panel height on resize / orientation change so text never clips
    var t;
    var recompute = function () { clearTimeout(t); t = setTimeout(function () { btns.forEach(sync); }, 120); };
    window.addEventListener('resize', recompute);
    window.addEventListener('orientationchange', recompute);
  }

  /* ---- contact form ----
     A static site has no server, so the form composes a mail draft
     in the visitor's own client instead of posting anywhere. The
     honeypot still silently drops bot submissions. */
  function setupApplyForm() {
    var form = document.getElementById('contactForm');
    if (!form) return;
    var TO = form.getAttribute('data-to') || 'jj0523@stanford.edu';
    var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    var btn = document.getElementById('contactBtn');
    var msg = document.getElementById('contactMsg');
    var el = function (id) { return document.getElementById(id); };
    var val = function (id) { var e = el(id); return e ? e.value.trim() : ''; };
    var fail = function (text, focusId) {
      if (msg) msg.textContent = text;
      var f = el(focusId);
      if (f) { f.setAttribute('aria-invalid', 'true'); f.focus(); }
    };

    ['c_name', 'c_email', 'c_message'].forEach(function (id) {
      var f = el(id);
      if (f) f.addEventListener('input', function () { f.removeAttribute('aria-invalid'); });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!val('c_name')) return fail('Name, email, and a message are required.', 'c_name');
      if (!val('c_email')) return fail('Name, email, and a message are required.', 'c_email');
      if (!EMAIL_RE.test(val('c_email'))) return fail('Please enter a valid email address.', 'c_email');
      if (!val('c_message')) return fail('Name, email, and a message are required.', 'c_message');
      // honeypot: humans never fill this. Fake success, send nothing.
      if (val('c_hp') !== '') {
        form.reset();
        if (msg) msg.textContent = 'Thanks — your message is on its way.';
        return;
      }

      var subject = val('c_subject') || ('Hello from ' + val('c_name'));
      var body =
        val('c_message') + '\n\n' +
        '\u2014\n' +
        'From: ' + val('c_name') + '\n' +
        'Email: ' + val('c_email') +
        (val('c_affil') ? '\nAffiliation: ' + val('c_affil') : '');

      var href = 'mailto:' + TO +
        '?subject=' + encodeURIComponent(subject) +
        '&body=' + encodeURIComponent(body);

      if (msg) msg.textContent = 'Opening your mail app\u2026 if nothing happens, write to ' + TO + ' directly.';
      if (btn) btn.textContent = 'Draft opened';
      window.location.href = href;
    });
  }

  /* ---- mark the current page in the nav ---- */
  function markCurrentNav() {
    var here = location.pathname.replace(/index\.html$/, '').replace(/\/$/, '') || '/';
    // A page with no nav entry of its own (a project detail page) can point at
    // its parent with <body data-nav="work.html"> so the section still reads as active.
    var parent = document.body.getAttribute('data-nav');
    var marked = false;
    document.querySelectorAll('.nav-links a, .mobile-nav a').forEach(function (a) {
      var raw = a.getAttribute('href') || '';
      var href = raw.replace(/index\.html$/, '').replace(/(.)\/$/, '$1');
      if (href && href === here) { a.setAttribute('aria-current', 'page'); marked = true; }
    });
    if (marked || !parent) return;
    document.querySelectorAll('.nav-links a, .mobile-nav a').forEach(function (a) {
      if (a.getAttribute('href') === parent) a.setAttribute('aria-current', 'true');
    });
  }

  /* ---- gallery lightbox ----
     Any [data-gallery] container turns its .gal buttons into a
     keyboard-navigable lightbox. Focus returns to the opener on close. */
  function setupLightbox() {
    var groups = Array.prototype.slice.call(document.querySelectorAll('[data-gallery]'));
    if (!groups.length) return;

    var box = document.getElementById('lightbox');
    if (!box) {
      box = document.createElement('div');
      box.id = 'lightbox';
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.setAttribute('aria-label', 'Image viewer');
      box.innerHTML =
        '<button class="lb-close" aria-label="Close viewer">\u00d7</button>' +
        '<button class="lb-nav lb-prev" aria-label="Previous image">\u2190</button>' +
        '<img alt="">' +
        '<button class="lb-nav lb-next" aria-label="Next image">\u2192</button>' +
        '<div class="lb-count" aria-live="polite"></div>';
      document.body.appendChild(box);
    }
    var img = box.querySelector('img');
    var count = box.querySelector('.lb-count');
    var items = [], idx = 0, opener = null;

    function show(i) {
      if (!items.length) return;
      idx = (i + items.length) % items.length;
      var b = items[idx];
      var full = b.getAttribute('data-full') || (b.querySelector('img') || {}).src;
      img.src = full;
      img.alt = b.getAttribute('data-alt') || (b.querySelector('img') || {}).alt || '';
      count.textContent = (idx + 1) + ' / ' + items.length;
      box.querySelectorAll('.lb-nav').forEach(function (n) { n.hidden = items.length < 2; });
    }
    function open(group, i, from) {
      items = Array.prototype.slice.call(group.querySelectorAll('.gal'));
      opener = from;
      show(i);
      box.classList.add('open');
      document.body.style.overflow = 'hidden';
      box.querySelector('.lb-close').focus();
    }
    function close() {
      box.classList.remove('open');
      document.body.style.overflow = '';
      img.src = '';
      if (opener) { opener.focus(); opener = null; }
    }

    groups.forEach(function (g) {
      g.addEventListener('click', function (e) {
        var b = e.target.closest('.gal');
        if (!b || !g.contains(b)) return;
        open(g, Array.prototype.indexOf.call(g.querySelectorAll('.gal'), b), b);
      });
    });
    box.addEventListener('click', function (e) {
      if (e.target.closest('.lb-close')) return close();
      if (e.target.closest('.lb-next')) return show(idx + 1);
      if (e.target.closest('.lb-prev')) return show(idx - 1);
      if (e.target === box) close();
    });
    document.addEventListener('keydown', function (e) {
      if (!box.classList.contains('open')) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') show(idx + 1);
      else if (e.key === 'ArrowLeft') show(idx - 1);
      else if (e.key === 'Tab') {
        // trap focus inside the viewer
        var f = Array.prototype.slice.call(box.querySelectorAll('button')).filter(function (b) { return !b.hidden; });
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  /* ---- magnetic cursor ---- */
  function setupCursor() {
    if (window.matchMedia('(hover:none)').matches) return;
    var c = document.getElementById('mcursor');
    if (!c) return;
    var mx = window.innerWidth / 2, my = window.innerHeight / 2, cx = mx, cy = my, cs = 1, ts = 1;
    window.addEventListener('mousemove', function (e) { mx = e.clientX; my = e.clientY; });
    document.addEventListener('mouseover', function (e) {
      var hit = e.target.closest && e.target.closest('a,button,[data-magnetic]');
      ts = hit ? 2.1 : 1;
    });
    animate(function () {
      cx += (mx - cx) * 0.2; cy += (my - cy) * 0.2; cs += (ts - cs) * 0.18;
      c.style.transform = 'translate3d(' + cx + 'px,' + cy + 'px,0) translate(-50%,-50%) scale(' + cs + ')';
    });
  }

  /* ---- marquee ---- */
  function setupMarquee() {
    var track = document.getElementById('marquee-track');
    if (!track) return;
    var x = 0, half = track.scrollWidth / 2, speed = 0.55, paused = false;
    track.addEventListener('mouseenter', function () { paused = true; });
    track.addEventListener('mouseleave', function () { paused = false; });
    window.addEventListener('resize', function () { half = track.scrollWidth / 2; });
    animate(function () {
      if (paused) return;
      x -= speed; if (half > 0 && Math.abs(x) >= half) x += half;
      track.style.transform = 'translate3d(' + x + 'px,0,0)';
    }, track.closest('.marquee') || track);
  }

  /* ============================================================
     COSMIC STARFIELD
     ============================================================ */
  function hexToRgba(hex, a) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(function (x) { return x + x; }).join('');
    var n = parseInt(h, 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }
  function initCanvas() {
    var canvas = document.getElementById('cosmic');
    if (!canvas) return null;
    var ctx = canvas.getContext('2d');
    var resize = function () {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var r = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, r.width * dpr);
      canvas.height = Math.max(1, r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    return { canvas: canvas, ctx: ctx };
  }
  function makeStars() {
    var stars = [];
    for (var i = 0; i < 150; i++) stars.push({ x: Math.random(), y: Math.random() * 0.82, r: Math.random() * 1.4 + 0.3, a: Math.random() * 0.7 + 0.3, tw: Math.random() * 0.004 + 0.001, ph: Math.random() * 6.28, sp: Math.random() * 0.00004 + 0.00001 });
    return stars;
  }
  function drawScene(ctx, w, h, stars, twinkle) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
    var accent = accentColor();
    var g = ctx.createRadialGradient(w / 2, h * 1.06, 0, w / 2, h * 1.06, h * 0.95);
    g.addColorStop(0, hexToRgba(accent, 0.5));
    g.addColorStop(0.35, hexToRgba(accent, 0.13));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath(); ctx.arc(w / 2, h * 1.62, w * 0.92, Math.PI, 2 * Math.PI); ctx.closePath();
    ctx.fillStyle = '#050506'; ctx.fill();
    ctx.lineWidth = 1.4; ctx.strokeStyle = hexToRgba(accent, 0.55); ctx.stroke();
    ctx.restore();
    stars.forEach(function (s) {
      var a = s.a * (0.55 + 0.45 * Math.sin(twinkle * s.tw + s.ph));
      ctx.globalAlpha = Math.max(0, a); ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;
  }
  function setupStarfield() {
    var init = initCanvas(); if (!init) return;
    var canvas = init.canvas, ctx = init.ctx, stars = makeStars();
    var r0 = canvas.getBoundingClientRect(); drawScene(ctx, r0.width, r0.height, stars, 0);
    animate(function () {
      var r = canvas.getBoundingClientRect(), t = performance.now();
      stars.forEach(function (s) { s.y -= s.sp * 16; if (s.y < -0.02) s.y = 0.84; });
      drawScene(ctx, r.width, r.height, stars, t);
    }, canvas);
  }
  function drawStaticStars() {
    var init = initCanvas(); if (!init) return;
    var r = init.canvas.getBoundingClientRect();
    drawScene(init.ctx, r.width, r.height, makeStars(), 0);
  }

  /* ============================================================
     GENERATIVE MOTIFS (mesh / grid / loop / stack / flow)
     ============================================================ */
  var motifs = [];
  function setupMotifs() {
    var list = Array.prototype.slice.call(document.querySelectorAll('[data-motif]'));
    if (!list.length) return;
    motifs = list.map(function (canvas) {
      var ctx = canvas.getContext('2d');
      var type = canvas.getAttribute('data-motif') || 'mesh';
      var tone = canvas.getAttribute('data-tone') || 'ink';
      var animated = canvas.getAttribute('data-animated') !== '0' && motion;
      // opt-in per-instance flags — read once, carried on the motif object (never global)
      // so canvases without these attributes (index/companies) are untouched.
      var nodesAttr = canvas.getAttribute('data-nodes');
      var nodeCount = nodesAttr ? (parseInt(nodesAttr, 10) || 0) : 0;
      var room = canvas.hasAttribute('data-room');
      var m = { canvas: canvas, ctx: ctx, type: type, tone: tone, animated: animated, nodeCount: nodeCount, room: room, data: type === 'mesh' ? { nodes: [], packets: [] } : {}, w: 1, h: 1 };
      sizeMotif(m);
      if (m.type === 'mesh') m.data = makeMesh(m.w, m.h, m.nodeCount, m.room);
      else if (m.type === 'trace') m.data = makeTrace();
      else if (m.type === 'gather') m.data = makeGather();
      drawMotif(m, 0);
      return m;
    });
    window.addEventListener('resize', function () { motifs.forEach(function (m) { sizeMotif(m); if (m.type === 'mesh') m.data = makeMesh(m.w, m.h, m.nodeCount, m.room); drawMotif(m, performance.now()); }); });
    if (motion && motifs.some(function (m) { return m.animated; })) {
      animate(function () {
        var t = performance.now();
        motifs.forEach(function (m) { if (m.animated) drawMotif(m, t); });
      });
    }
  }
  // `forceCount` and `room` are optional opt-ins (fellowship's "20 founders, one
  // room" canvas). Omitted (falsy), this reproduces the original mesh exactly —
  // same default count formula, same random draw order — for index/companies.
  function makeMesh(w, h, forceCount, room) {
    var area = Math.max(1, w * h), n = forceCount || Math.max(9, Math.min(24, Math.round(area / 3200))), nodes = [];
    // room mode: keep node base positions + drift amplitude clamped inside a
    // hairline rect inset ~6% from the canvas edges, with a buffer for the
    // node radius + hot pulse radius (~11px at full pulse).
    var inset = 0.06, bufPx = 11, bufX = bufPx / w, bufY = bufPx / h;
    for (var i = 0; i < n; i++) {
      if (room) {
        var amp = 0.022 + Math.random() * 0.032;
        var halfX = (1 - inset * 2) / 2 - bufX, halfY = (1 - inset * 2) / 2 - bufY;
        amp = Math.max(0.006, Math.min(amp, halfX, halfY));
        var loX = inset + bufX + amp, hiX = 1 - inset - bufX - amp;
        var loY = inset + bufY + amp, hiY = 1 - inset - bufY - amp;
        var bx = loX + Math.random() * Math.max(0, hiX - loX);
        var by = loY + Math.random() * Math.max(0, hiY - loY);
        nodes.push({ bx: bx, by: by, ph: Math.random() * 6.28, sp: 0.6 + Math.random() * 1.0, amp: amp, hot: false, x: 0, y: 0 });
      } else {
        nodes.push({ bx: 0.08 + Math.random() * 0.84, by: 0.12 + Math.random() * 0.76, ph: Math.random() * 6.28, sp: 0.6 + Math.random() * 1.0, amp: 0.022 + Math.random() * 0.032, hot: false, x: 0, y: 0 });
      }
    }
    var hotN = Math.max(2, Math.round(n * 0.25));
    for (var k = 0; k < hotN; k++) nodes[(k * 3) % n].hot = true;
    // ~4-6 packets read as introductions between two distinct founders/nodes.
    var packets = [], pc = Math.max(2, Math.min(6, Math.round(n / 3)));
    for (var j = 0; j < pc; j++) { var a = Math.floor(Math.random() * n), b = Math.floor(Math.random() * n); if (b === a) b = (a + 1) % n; packets.push({ a: a, b: b, off: Math.random(), sp: 0.18 + Math.random() * 0.22 }); }
    return { nodes: nodes, packets: packets };
  }
  function makeTrace() {
    var n = 7, pts = [];
    for (var i = 0; i < n; i++) pts.push({ x: 0.08 + (i / (n - 1)) * 0.84 + (Math.random() - 0.5) * 0.05, y: 0.22 + Math.random() * 0.56 });
    return { pts: pts };
  }
  function makeGather() {
    var n = 14, pts = [];
    for (var i = 0; i < n; i++) {
      var ang = (i / n) * 6.2832;
      pts.push({ sx: 0.05 + Math.random() * 0.9, sy: 0.12 + Math.random() * 0.76, tx: 0.5 + Math.cos(ang) * 0.12, ty: 0.5 + Math.sin(ang) * 0.34, hot: i % 4 === 0 });
    }
    return { pts: pts };
  }
  function sizeMotif(m) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2), r = m.canvas.getBoundingClientRect();
    m.canvas.width = Math.max(1, Math.round(r.width * dpr));
    m.canvas.height = Math.max(1, Math.round(r.height * dpr));
    m.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    m.w = r.width; m.h = r.height;
  }
  function palette(tone) {
    var accent = accentColor();
    if (tone === 'light') return { line: 'rgba(255,255,255,0.16)', node: 'rgba(255,255,255,0.72)', emph: accent };
    return { line: 'rgba(0,0,0,0.22)', node: 'rgba(0,0,0,0.82)', emph: '#000' };
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function drawMotif(m, t) {
    var ctx = m.ctx, w = m.w || 1, h = m.h || 1;
    ctx.clearRect(0, 0, w, h);
    var P = palette(m.tone);
    if (m.type === 'mesh') {
      var N = m.data.nodes || [], light = m.tone === 'light';
      var lineRGB = light ? '255,255,255' : '0,0,0';
      var nodeCol = light ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.9)';
      if (m.room) {
        // hairline room, inset ~6% from the edges — same rgb as the mesh
        // lines, at low alpha, with small corner ticks (blueprint-style).
        var rIns = 0.06, rx = w * rIns, ry = h * rIns, rw = w * (1 - rIns * 2), rh = h * (1 - rIns * 2);
        var rA = light ? 0.3 : 0.35, tick = 7;
        ctx.save();
        ctx.strokeStyle = 'rgba(' + lineRGB + ',' + rA + ')'; ctx.lineWidth = 1;
        ctx.strokeRect(Math.round(rx) + 0.5, Math.round(ry) + 0.5, Math.round(rw) - 1, Math.round(rh) - 1);
        ctx.strokeStyle = 'rgba(' + lineRGB + ',' + Math.min(0.6, rA * 1.7).toFixed(3) + ')';
        ctx.beginPath();
        ctx.moveTo(rx, ry + tick); ctx.lineTo(rx, ry); ctx.lineTo(rx + tick, ry);
        ctx.moveTo(rx + rw - tick, ry); ctx.lineTo(rx + rw, ry); ctx.lineTo(rx + rw, ry + tick);
        ctx.moveTo(rx + rw, ry + rh - tick); ctx.lineTo(rx + rw, ry + rh); ctx.lineTo(rx + rw - tick, ry + rh);
        ctx.moveTo(rx + tick, ry + rh); ctx.lineTo(rx, ry + rh); ctx.lineTo(rx, ry + rh - tick);
        ctx.stroke();
        ctx.restore();
      }
      N.forEach(function (nd) {
        nd.x = (nd.bx + Math.cos(t * 0.00024 * nd.sp + nd.ph) * nd.amp) * w;
        nd.y = (nd.by + Math.sin(t * 0.00028 * nd.sp + nd.ph) * nd.amp) * h;
      });
      var maxD = Math.hypot(w, h) * 0.34; ctx.lineWidth = 1;
      for (var i = 0; i < N.length; i++) for (var j = i + 1; j < N.length; j++) {
        var dx = N[i].x - N[j].x, dy = N[i].y - N[j].y, d = Math.hypot(dx, dy);
        if (d < maxD) { ctx.strokeStyle = 'rgba(' + lineRGB + ',' + (Math.pow(1 - d / maxD, 1.4) * (light ? 0.5 : 0.42)).toFixed(3) + ')'; ctx.beginPath(); ctx.moveTo(N[i].x, N[i].y); ctx.lineTo(N[j].x, N[j].y); ctx.stroke(); }
      }
      (m.data.packets || []).forEach(function (pk) {
        var A = N[pk.a], B = N[pk.b]; if (!A || !B) return;
        ctx.strokeStyle = 'rgba(' + lineRGB + ',' + (light ? 0.18 : 0.16) + ')'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
        var prog = ((t * 0.00045 * (0.6 + pk.sp)) + pk.off) % 1;
        var tx = A.x + (B.x - A.x) * prog, ty = A.y + (B.y - A.y) * prog;
        ctx.globalAlpha = light ? 0.95 : 0.9; ctx.fillStyle = P.emph;
        ctx.beginPath(); ctx.arc(tx, ty, 3, 0, 6.2832); ctx.fill(); ctx.globalAlpha = 1;
      });
      N.forEach(function (nd) {
        if (nd.hot) {
          var pulse = 0.5 + 0.5 * Math.sin(t * 0.0018 + nd.ph);
          ctx.globalAlpha = (light ? 0.2 : 0.14) * (0.5 + pulse); ctx.fillStyle = P.emph;
          ctx.beginPath(); ctx.arc(nd.x, nd.y, 7 + 4 * pulse, 0, 6.2832); ctx.fill(); ctx.globalAlpha = 1;
          ctx.fillStyle = P.emph; ctx.beginPath(); ctx.arc(nd.x, nd.y, 3.3, 0, 6.2832); ctx.fill();
        } else { ctx.fillStyle = nodeCol; ctx.beginPath(); ctx.arc(nd.x, nd.y, 2.1, 0, 6.2832); ctx.fill(); }
      });
    } else if (m.type === 'grid') {
      var cols = 7, rows = 4, cw = w / cols, ch = h / rows, s = Math.min(cw, ch) * 0.44, phase = t * 0.0016;
      for (var gi = 0; gi < cols; gi++) for (var gj = 0; gj < rows; gj++) {
        var cx = (gi + 0.5) * cw, cy = (gj + 0.5) * ch, wave = Math.sin((gi + gj) * 0.7 - phase);
        if (wave > 0.25) {
          var hot = Math.sin((gi - gj) * 0.9 - phase * 1.3) > 0.8;
          ctx.globalAlpha = 0.55 + 0.45 * wave; ctx.fillStyle = hot ? P.emph : P.node;
          ctx.fillRect(cx - s / 2, cy - s / 2, s, s); ctx.globalAlpha = 1;
        } else { ctx.strokeStyle = P.line; ctx.lineWidth = 1; ctx.strokeRect(cx - s / 2, cy - s / 2, s, s); }
      }
    } else if (m.type === 'loop') {
      var lcx = w / 2, lcy = h / 2, R = Math.min(w, h) * 0.34;
      ctx.strokeStyle = P.line; ctx.lineWidth = 1;
      [0.5, 0.78, 1].forEach(function (k) { ctx.beginPath(); ctx.arc(lcx, lcy, R * k, 0, 6.2832); ctx.stroke(); });
      var a0 = (t * 0.0012) % 6.2832;
      ctx.strokeStyle = P.emph; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(lcx, lcy, R, a0, a0 + 1.6); ctx.stroke();
      var px = lcx + Math.cos(a0 + 1.6) * R, py = lcy + Math.sin(a0 + 1.6) * R;
      ctx.fillStyle = P.emph; ctx.beginPath(); ctx.arc(px, py, 3.4, 0, 6.2832); ctx.fill();
      ctx.fillStyle = P.node; ctx.beginPath(); ctx.arc(lcx, lcy, 2.2, 0, 6.2832); ctx.fill();
    } else if (m.type === 'stack') {
      var n = 4, gap = Math.min(w, h) * 0.11, bw = w * 0.5, bh = h * 0.3;
      var ox = (w - bw) / 2 - gap * 0.6, oy = (h - bh) / 2 + gap * 0.9;
      for (var sk = n - 1; sk >= 0; sk--) { var x = ox + sk * gap, y = oy - sk * gap; ctx.strokeStyle = sk === 0 ? P.emph : P.line; ctx.lineWidth = sk === 0 ? 1.6 : 1; roundRect(ctx, x, y, bw, bh, 6); ctx.stroke(); }
    } else if (m.type === 'flow') {
      [0.28, 0.5, 0.72].forEach(function (ly, li) {
        var y = ly * h; ctx.strokeStyle = P.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(w * 0.06, y); ctx.lineTo(w * 0.94, y); ctx.stroke();
        for (var dd = 0; dd < 3; dd++) { var prog = ((t * 0.00007 * (1 + li * 0.3)) + dd / 3 + li * 0.13) % 1; var fx = w * 0.06 + prog * w * 0.88; ctx.fillStyle = dd === 0 ? P.emph : P.node; ctx.beginPath(); ctx.arc(fx, y, dd === 0 ? 3.2 : 2, 0, 6.2832); ctx.fill(); }
      });
    } else if (m.type === 'trace') {
      var tp = m.data.pts || [];
      if (tp.length) {
        var cyc = (t * 0.00018) % 1.3, tprog = Math.min(1, cyc) * (tp.length - 1);
        var seg = Math.floor(tprog), fr = tprog - seg, hx, hy;
        ctx.strokeStyle = P.line; ctx.lineWidth = 1; ctx.beginPath();
        tp.forEach(function (p, i) { var X = p.x * w, Y = p.y * h; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); ctx.stroke();
        ctx.strokeStyle = P.emph; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(tp[0].x * w, tp[0].y * h);
        for (var ti = 1; ti <= seg && ti < tp.length; ti++) ctx.lineTo(tp[ti].x * w, tp[ti].y * h);
        if (seg < tp.length - 1) { var a = tp[seg], b = tp[seg + 1]; hx = (a.x + (b.x - a.x) * fr) * w; hy = (a.y + (b.y - a.y) * fr) * h; ctx.lineTo(hx, hy); } else { hx = tp[tp.length - 1].x * w; hy = tp[tp.length - 1].y * h; }
        ctx.stroke();
        tp.forEach(function (p, i) { var X = p.x * w, Y = p.y * h; ctx.fillStyle = i <= seg ? P.node : P.line; ctx.beginPath(); ctx.arc(X, Y, i <= seg ? 2.4 : 1.8, 0, 6.2832); ctx.fill(); });
        ctx.fillStyle = P.emph; ctx.beginPath(); ctx.arc(hx, hy, 3.4, 0, 6.2832); ctx.fill();
      }
    } else if (m.type === 'bars') {
      var nb = 12, span = w * 0.88, x0 = w * 0.06, bw2 = (span / nb) * 0.5, base = h * 0.84;
      for (var bi = 0; bi < nb; bi++) {
        var cx2 = x0 + (bi + 0.5) * (span / nb);
        var hgt = h * (0.16 + 0.56 * (0.5 + 0.5 * Math.sin(t * 0.0017 + bi * 0.55)));
        var hotb = bi % 4 === 1;
        ctx.fillStyle = hotb ? P.emph : P.node; ctx.globalAlpha = hotb ? 0.9 : 0.58;
        ctx.fillRect(cx2 - bw2 / 2, base - hgt, bw2, hgt); ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = P.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, base + 1.5); ctx.lineTo(x0 + span, base + 1.5); ctx.stroke();
    } else if (m.type === 'gather') {
      var gp = m.data.pts || [], gcyc = (t * 0.00014) % 1, gg;
      if (gcyc < 0.4) gg = gcyc / 0.4; else if (gcyc < 0.72) gg = 1; else gg = 1 - (gcyc - 0.72) / 0.28;
      gg = gg < 0 ? 0 : gg > 1 ? 1 : gg; var ge = gg * gg * (3 - 2 * gg);
      if (ge > 0.5) { var gRGB = m.tone === 'light' ? '255,255,255' : '0,0,0'; ctx.strokeStyle = 'rgba(' + gRGB + ',' + (0.14 * (ge - 0.5) * 2).toFixed(3) + ')'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(w * 0.5, h * 0.5, Math.min(w, h) * 0.4 * ge, 0, 6.2832); ctx.stroke(); }
      gp.forEach(function (p) { var X = (p.sx + (p.tx - p.sx) * ge) * w, Y = (p.sy + (p.ty - p.sy) * ge) * h; ctx.fillStyle = p.hot ? P.emph : P.node; ctx.globalAlpha = p.hot ? 0.92 : 0.6; ctx.beginPath(); ctx.arc(X, Y, p.hot ? 2.8 : 2, 0, 6.2832); ctx.fill(); ctx.globalAlpha = 1; });
    }
  }


  /* ---- inline looping video: play only while on screen ----------------
     Marked-up as <video data-inline muted loop playsinline preload="none">.
     Nothing autoplays off-screen, so a page can carry a dozen short loops
     without paying for a dozen simultaneous decodes. Reduced-motion
     viewers get a still poster and a real control bar instead. ---------- */
  function setupInlineVideo() {
    var vids = Array.prototype.slice.call(document.querySelectorAll('video[data-inline]'));
    if (!vids.length) return;

    // data-inline="always" marks a clip that IS the content: it loops on its own
    // and must never degrade to a play button, because a poster with a play
    // triangle reads as broken next to the clip it is being compared against.
    var always = function (v) { return v.getAttribute('data-inline') === 'always'; };

    function keepPlaying(v) {
      if (v.preload === 'none') v.preload = 'auto';
      var p = v.play();
      if (!p || !p.catch) return;
      p.catch(function () {
        // Safari rejects play() when nothing is buffered yet, so force a load
        // and try once more before falling back to handing over controls.
        try { v.load(); } catch (e) { /* nothing more to try */ }
        var retry = v.play();
        if (retry && retry.catch) retry.catch(function () {
          if (!always(v)) v.controls = true;
        });
      });
    }

    if (reduce) {
      vids.forEach(function (v) {
        // an "always" clip is muted and looping by the author's explicit choice,
        // so it keeps running; everything else defers to the motion preference
        if (always(v)) { v.muted = true; keepPlaying(v); return; }
        v.controls = true; v.autoplay = false; v.removeAttribute('loop');
      });
      return;
    }
    if (!('IntersectionObserver' in window)) {
      vids.forEach(function (v) { if (always(v)) keepPlaying(v); else v.controls = true; });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var v = e.target;
        if (e.isIntersecting) keepPlaying(v);
        else if (!v.paused) v.pause();
      });
    }, { threshold: 0.25 });

    vids.forEach(function (v) {
      v.muted = true;                 // required for programmatic play()
      v.setAttribute('playsinline', '');
      io.observe(v);
      if (always(v)) return;          // no click-to-controls: this one just loops
      // a click anywhere on the loop hands control back to the viewer
      v.addEventListener('click', function () {
        if (v.controls) return;
        v.controls = true;
        io.unobserve(v);
      });
    });

    // Last resort for a browser that refuses muted autoplay outright (Safari in
    // Low Power Mode, or with auto-play switched off for the site): the first
    // real interaction anywhere on the page counts as a gesture, so use it to
    // start every always-loop clip. One shot, then the listeners are dropped.
    var loops = vids.filter(always);
    if (!loops.length) return;
    var unlock = function () {
      loops.forEach(function (v) { if (v.paused) keepPlaying(v); });
      ['pointerdown', 'touchend', 'keydown', 'wheel'].forEach(function (ev) {
        document.removeEventListener(ev, unlock, true);
      });
    };
    ['pointerdown', 'touchend', 'keydown', 'wheel'].forEach(function (ev) {
      document.addEventListener(ev, unlock, true);
    });
  }

  /* ---- held-back clip: stays blurred until the reader asks for it ----
     Progressive enhancement: the markup ships visible, and this adds the
     cover. If the script never runs, both clips are simply on show. ---- */
  function setupRevealPair() {
    var holds = Array.prototype.slice.call(document.querySelectorAll('.rp-hold[data-reveal-cover]'));
    if (!holds.length) return;
    holds.forEach(function (hold) {
      hold.classList.add('is-hidden');
      var cover = document.createElement('button');
      cover.type = 'button';
      cover.className = 'rp-cover';
      cover.innerHTML = '<span class="rp-q"></span><span class="rp-go">' +
        (hold.getAttribute('data-reveal-label') || 'Show me') + ' <span class="arr">\u2192</span></span>';
      cover.querySelector('.rp-q').textContent = hold.getAttribute('data-reveal-cover');
      cover.setAttribute('aria-expanded', 'false');
      cover.addEventListener('click', function () {
        hold.classList.remove('is-hidden');
        cover.setAttribute('aria-expanded', 'true');
        var v = hold.querySelector('video');
        if (v) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
      });
      hold.insertBefore(cover, hold.firstChild);
    });
  }

  /* ---- sticky section rail: highlight the section in view ---- */
  function setupSectionRail() {
    var rail = document.querySelector('.pnav');
    if (!rail) return;
    var links = Array.prototype.slice.call(rail.querySelectorAll('a[href^="#"]'));
    if (!links.length) return;

    var byId = {};
    var targets = [];
    links.forEach(function (a) {
      var el = document.getElementById(a.getAttribute('href').slice(1));
      if (!el) return;
      byId[el.id] = a;
      targets.push(el);
    });
    if (!targets.length || !('IntersectionObserver' in window)) return;

    var visible = {};
    function paint() {
      var best = null;
      targets.forEach(function (el) { if (visible[el.id] && !best) best = el; });
      links.forEach(function (a) { a.classList.remove('on'); });
      if (best && byId[best.id]) byId[best.id].classList.add('on');
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { visible[e.target.id] = e.isIntersecting; });
      paint();
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
    targets.forEach(function (el) { io.observe(el); });

    // keep the active chip scrolled into view on narrow screens
    rail.addEventListener('click', function (e) {
      var a = e.target.closest('a');
      if (a) links.forEach(function (l) { l.classList.toggle('on', l === a); });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
