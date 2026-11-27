// Lógica de la landing y de la página de colección.
// Sin librerías externas: todo es JavaScript normal (más rápido y más seguro).
(function () {
  const $ = (id) => document.getElementById(id);
  const data = window.__CMS__ || { content: {}, artworks: [] };
  const c = data.content;
  const ARTS = data.artworks || [];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const fx = { burst() {} }; // efectos visuales (se activan en la sección 11)
  const notice = () => window.ICCA_toast && window.ICCA_toast(c.protect_notice || 'Obra protegida por derechos de autor.');

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const meta = (a) => [a.year, a.category].filter(Boolean).join(' · ');
  // Número de catálogo: el orden de la obra en la colección (el mismo del dashboard)
  const num = (a) => String(ARTS.indexOf(a) + 1).padStart(2, '0');

  // ==========================================================
  // 1. INTRO TIPO CINE (solo la primera vez en la sesión)
  // ==========================================================
  const intro = $('intro');
  function start() {
    document.body.classList.add('is-ready');
    // el foco de la obra principal se enciende cuando la obra termina de "colgarse"
    setTimeout(() => $('heroCard')?.classList.add('lit'), reduceMotion ? 0 : 1100);
  }
  let seen = false;
  try { seen = sessionStorage.getItem('icca_intro') === '1'; } catch {}
  if (intro && c.intro_on !== false && !seen && !reduceMotion && !location.hash) {
    intro.hidden = false;
    document.documentElement.classList.add('intro-open');
    const end = () => {
      if (intro.classList.contains('out')) return;
      intro.classList.add('out');
      document.documentElement.classList.remove('intro-open');
      start();
      setTimeout(() => { intro.hidden = true; }, 900);
      try { sessionStorage.setItem('icca_intro', '1'); } catch {}
    };
    intro.addEventListener('click', end);
    setTimeout(end, 2300);
  } else {
    start();
  }

  // ==========================================================
  // 2. BARRA DE NAVEGACIÓN
  // ==========================================================
  const topbar = $('topbar'), menuBtn = $('menuBtn'), menu = $('menu'), progress = $('progress');
  const onScroll = () => {
    topbar?.classList.toggle('is-scrolled', scrollY > 30);
    // el fondo se oscurece poco a poco al bajar (para que las obras resalten)
    document.documentElement.style.setProperty('--dim', Math.min(1, scrollY / (innerHeight * 0.9)).toFixed(3));
    // barra roja de progreso: qué tanto de la página llevas
    if (progress) {
      const max = document.documentElement.scrollHeight - innerHeight;
      progress.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
    }
  };
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  menuBtn?.addEventListener('click', () => {
    const open = menuBtn.getAttribute('aria-expanded') !== 'true';
    menuBtn.setAttribute('aria-expanded', String(open));
    menu.classList.toggle('open', open);
  });
  menu?.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') { menuBtn.setAttribute('aria-expanded', 'false'); menu.classList.remove('open'); }
  });

  // El link del menú se marca solo según la sección que estás viendo
  const links = [...document.querySelectorAll('.menu a[href^="#"]')];
  if (links.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        links.forEach((l) => l.classList.toggle('active', l.getAttribute('href') === '#' + en.target.id));
      }
    }, { rootMargin: '-45% 0px -50% 0px' });
    links.forEach((l) => { const s = document.querySelector(l.getAttribute('href')); if (s) io.observe(s); });
  }

  // Letras del logo: se encienden en rojo al pasar el mouse (como en tu diseño original)
  document.querySelectorAll('.brand').forEach((b) => {
    const text = b.textContent.trim();
    b.textContent = '';
    b.setAttribute('aria-label', text);
    [...text].forEach((ch) => {
      const s = el('span', 'letter', ch === ' ' ? ' ' : ch);
      s.setAttribute('aria-hidden', 'true');
      s.addEventListener('mouseenter', () => {
        s.classList.add('lit');
        clearTimeout(s._t);
        s._t = setTimeout(() => s.classList.remove('lit'), 2500);
      });
      b.append(s);
    });
  });

  // ==========================================================
  // 3. APARECER AL HACER SCROLL (desenfoque → nítido)
  // ==========================================================
  const revealIO = 'IntersectionObserver' in window && !reduceMotion
    ? new IntersectionObserver((entries) => {
      for (const en of entries) if (en.isIntersecting) { en.target.classList.add('in'); revealIO.unobserve(en.target); }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 })
    : null;
  // Focos de museo: la lámpara de cada obra se enciende cuando la obra entra en la vista
  const lampIO = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => {
      for (const en of entries) if (en.isIntersecting) { en.target.classList.add('lit'); lampIO.unobserve(en.target); }
    }, { rootMargin: '0px 0px -15% 0px', threshold: 0.2 })
    : null;
  function lamps(root) {
    (root || document).querySelectorAll('.work:not(.lit), .feature .art-card:not(.lit), .glow-frame:not(.lit)').forEach((n) => {
      if (lampIO) lampIO.observe(n); else n.classList.add('lit');
    });
  }
  function reveal(root) {
    (root || document).querySelectorAll('.reveal-up:not(.in)').forEach((n, i) => {
      if (!revealIO) { n.classList.add('in'); return; }
      n.style.transitionDelay = `${Math.min(i % 4, 3) * 90}ms`; // efecto cascada
      revealIO.observe(n);
    });
    lamps(root);
  }

  // ==========================================================
  // 4. TARJETAS 3D (se inclinan siguiendo el mouse, con reflejo)
  // ==========================================================
  function tilt(card, max) {
    if (!finePointer || reduceMotion || !card) return;
    const glare = card.querySelector('.glare');
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      card.style.transform = `perspective(1100px) rotateX(${(0.5 - y) * max}deg) rotateY(${(x - 0.5) * max}deg) scale(1.02)`;
      if (glare) { glare.style.opacity = '1'; glare.style.background = `radial-gradient(circle at ${x * 100}% ${y * 100}%, rgba(255,255,255,.22), transparent 55%)`; }
    });
    card.addEventListener('pointerleave', () => {
      card.style.transform = '';
      if (glare) glare.style.opacity = '0';
    });
  }
  tilt($('heroCard'), 9); // la obra principal responde al cursor en 3D

  // Luz roja que sigue al mouse en la portada
  const hero = document.querySelector('.hero');
  if (hero && finePointer && !reduceMotion) {
    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      hero.style.setProperty('--mx', `${e.clientX - r.left}px`);
      hero.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  }

  // Borde que se ilumina donde está el mouse (tarjetas de vidrio)
  function spotlight(node) {
    if (!finePointer) return;
    node.addEventListener('pointermove', (e) => {
      const r = node.getBoundingClientRect();
      node.style.setProperty('--mx', `${e.clientX - r.left}px`);
      node.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  }
  document.querySelectorAll('.note, .contact-form, .channel').forEach(spotlight);
  document.querySelectorAll('.note').forEach((n) => tilt(n, 6));

  // ==========================================================
  // 5. UNA OBRA (marco de vidrio + título)
  // ==========================================================
  function workFigure(a, list, sizes) {
    const fig = el('figure', 'work reveal-up');
    const btn = el('button', 'work-frame');
    btn.type = 'button';
    btn.dataset.artId = a.id;
    btn.setAttribute('aria-label', `Ver “${a.title}” en pantalla completa`);
    const img = el('img');
    img.loading = 'lazy';
    img.draggable = false;
    img.dataset.sizes = sizes;
    window.ICCA_applyImg(img, a.image, a.title);
    const hover = el('span', 'work-hover');
    hover.append(el('span', 'work-hover-text', 'Ver obra'));
    btn.append(img, hover);
    btn.addEventListener('click', () => window.ICCA_Viewer.open(list(), list().indexOf(a)));
    spotlight(btn);
    tilt(btn, 7); // cada obra se inclina hacia el cursor
    const cap = el('figcaption', 'work-caption');
    cap.dataset.n = num(a); // se muestra como "N.º 01" en la cédula (CSS)
    cap.append(el('span', 'work-title', a.title));
    if (meta(a)) cap.append(el('span', 'work-meta', meta(a)));
    fig.append(btn, cap);
    return fig;
  }

  // ==========================================================
  // 6. OBRAS DESTACADAS (grandes, con brillo rojo)
  // ==========================================================
  const featuredList = $('featuredList');
  if (featuredList) {
    const feats = ARTS.filter((a) => a.featured);
    if (feats.length) {
      featuredList.closest('section').hidden = false;
      feats.forEach((a, i) => {
        const row = el('article', 'feature reveal-up' + (i % 2 ? ' alt' : ''));
        const media = el('div', 'feature-media');
        const card = el('div', 'art-card');
        card.append(el('div', 'art-glow'));
        const frame = el('button', 'art-frame');
        frame.type = 'button';
        frame.dataset.artId = a.id;
        frame.setAttribute('aria-label', `Ver “${a.title}” en pantalla completa`);
        const img = el('img');
        img.loading = 'lazy'; img.draggable = false;
        img.dataset.sizes = '(max-width: 900px) 90vw, 58vw';
        window.ICCA_applyImg(img, a.image, a.title);
        frame.append(img, el('span', 'glare'));
        frame.addEventListener('click', () => window.ICCA_Viewer.open(feats, i));
        card.append(frame);
        media.append(card);
        tilt(card, 7);

        const text = el('div', 'feature-text');
        text.append(el('span', 'feature-num', 'N.º ' + num(a)));
        if (a.category) text.append(el('span', 'tag', a.category));
        text.append(el('h3', null, a.title));
        const m = [c.artist_name, a.year, a.dimensions].filter(Boolean).join(' · ');
        if (m) text.append(el('p', 'feature-meta', m));
        if (a.context) text.append(el('p', 'feature-excerpt', a.context.length > 260 ? a.context.slice(0, 250).trim() + '…' : a.context));
        const more = el('button', 'btn-ghost', 'Ver de cerca y leer su historia');
        more.type = 'button';
        more.addEventListener('click', () => window.ICCA_Viewer.open(feats, i));
        text.append(more);
        row.append(media, text);
        featuredList.append(row);
      });
    }
  }

  // ==========================================================
  // 7. COLECCIÓN (mosaico que respeta la forma de cada obra)
  // ==========================================================
  const masonry = $('masonry');
  if (masonry) {
    const limit = Number(masonry.dataset.limit) || Infinity;
    const filters = $('filters');
    let active = 'all';
    const filtered = () => ARTS.filter((a) => active === 'all' || a.category === active);
    const visible = () => filtered().slice(0, limit);

    const cats = [...new Set(ARTS.map((a) => a.category).filter(Boolean))];
    if (cats.length > 1 && filters) {
      filters.hidden = false;
      const mk = (val, label) => {
        const b = el('button', 'chip', label);
        b.type = 'button';
        b.setAttribute('aria-pressed', String(val === active));
        b.addEventListener('click', () => {
          active = val;
          filters.querySelectorAll('.chip').forEach((x) => x.setAttribute('aria-pressed', 'false'));
          b.setAttribute('aria-pressed', 'true');
          render(true);
        });
        filters.append(b);
      };
      mk('all', 'Todas');
      cats.forEach((k) => mk(k, k));
    }

    const colCount = () => {
      const w = masonry.clientWidth;
      return w >= 1300 ? 4 : w >= 900 ? 3 : w >= 540 ? 2 : 1;
    };
    let lastCols = 0;

    function render(instant) {
      const items = visible();
      const n = colCount();
      lastCols = n;
      masonry.textContent = '';
      masonry.style.setProperty('--cols', n);
      if (!items.length) {
        masonry.append(el('p', 'empty', 'Muy pronto habrá obras aquí.'));
      } else {
        // Cada obra va a la columna más corta, en orden de lectura (izquierda a derecha)
        const cols = Array.from({ length: n }, () => el('div', 'masonry-col'));
        const heights = new Array(n).fill(0);
        const sizes = `(max-width: 540px) 90vw, ${Math.round(94 / n)}vw`;
        for (const a of items) {
          const k = heights.indexOf(Math.min(...heights));
          const fig = workFigure(a, visible, sizes);
          if (instant) fig.classList.add('in');
          cols[k].append(fig);
          heights[k] += a.image.h / a.image.w + 0.2;
        }
        masonry.append(...cols);
        reveal(masonry);
      }
      const total = filtered().length;
      const more = $('collectionMore');
      if (more) {
        // el botón siempre se ve; si hay más obras de las que caben aquí, dice cuántas son
        $('collectionMoreLink').textContent = total > items.length
          ? `Ver las ${total} obras en la galería interactiva ✦`
          : 'Abrir la galería interactiva ✦';
      }
      const count = $('count');
      if (count) count.textContent = total === 1 ? '1 obra' : `${total} obras`;
    }
    render();
    let t;
    addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => { if (colCount() !== lastCols) render(true); }, 150); });
  }

  // ==========================================================
  // 8. PORTADA: tocar la obra la abre en grande
  // ==========================================================
  $('heroOpen')?.addEventListener('click', () => {
    if (!c.hero_image) return;
    const match = ARTS.findIndex((a) => a.image.id === c.hero_image.id);
    if (match >= 0) return window.ICCA_Viewer.open(ARTS, match);
    window.ICCA_Viewer.open([{ id: 'portada', title: c.hero_caption_title || '', image: c.hero_image, audioText: '' }], 0);
  });

  // Si el enlace trae una obra (#obra-12), se abre directo
  if (window.ICCA_Viewer && !document.body.classList.contains('page-gallery')) window.ICCA_Viewer.openFromHash(ARTS);

  // ==========================================================
  // 9. LIENZO OCULTO (rasca y descubre)
  // ==========================================================
  const scratch = $('scratch'), canvas = $('scratchCanvas');
  if (scratch && canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let revealed = false, last = null, strokes = 0;
    const brush = () => Math.max(44, scratch.clientWidth * 0.09);

    function cover() {
      if (revealed) return;
      const r = scratch.getBoundingClientRect();
      canvas.width = Math.round(r.width); canvas.height = Math.round(r.height);
      ctx.globalCompositeOperation = 'source-over';
      const g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      g.addColorStop(0, '#3a322b'); g.addColorStop(1, '#241f1a'); // velo café carbón
      ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);
      // textura de pinceladas secas, color arena
      ctx.strokeStyle = 'rgba(179,154,130,0.14)'; ctx.lineWidth = 2;
      for (let i = 0; i < 80; i++) {
        const x = Math.random() * canvas.width, y = Math.random() * canvas.height;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 40 + Math.random() * 80, y - 20 - Math.random() * 40); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(201, 183, 163, 0.9)';
      ctx.font = `600 ${Math.max(13, canvas.width / 34)}px Manrope, sans-serif`;
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0.25em';
      ctx.textAlign = 'center';
      ctx.fillText('✦  DESLIZA AQUÍ  ✦', canvas.width / 2, canvas.height / 2);
    }

    function point(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    function erase(p) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = '#000'; // color sólido = borra al 100 %
      ctx.lineWidth = brush(); ctx.lineCap = ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo((last || p).x, (last || p).y); ctx.lineTo(p.x, p.y); ctx.stroke();
      last = p;
      if (++strokes % 25 === 0) checkProgress();
    }
    // Revisa qué tanto se ha descubierto (muestreando pocos puntos para no trabar el navegador)
    function checkProgress() {
      const { data: px } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let clear = 0, total = 0;
      for (let i = 3; i < px.length; i += 4 * 97) { total++; if (px[i] === 0) clear++; }
      if (clear / total > 0.5) revealAll();
    }
    function revealAll() {
      if (revealed) return;
      revealed = true;
      canvas.classList.add('gone');
      scratch.classList.add('is-revealed');
      $('revealAll').hidden = true;
    }

    canvas.addEventListener('pointerenter', (e) => { last = point(e); });
    canvas.addEventListener('pointerdown', (e) => { last = point(e); erase(last); });
    canvas.addEventListener('pointermove', (e) => {
      // con mouse basta pasar el cursor; con el dedo hay que arrastrar
      if (e.pointerType === 'mouse' || e.buttons) {
        erase(point(e));
        if (strokes % 4 === 0) fx.burst(e.clientX, e.clientY, 3); // chispas al quitar el velo
      }
    });
    canvas.addEventListener('pointerleave', () => { last = null; });
    $('revealAll')?.addEventListener('click', revealAll);
    scratch.addEventListener('click', () => {
      if (!revealed || !c.exp_image) return;
      window.ICCA_Viewer.open([{ id: 'lienzo', title: c.exp_title || '', category: c.exp_technique, dimensions: c.exp_dimensions, image: c.exp_image, audioText: '' }], 0);
    });

    const img = scratch.querySelector('img');
    if (img.complete) cover(); else img.addEventListener('load', cover, { once: true });
    cover();
    let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(cover, 200); });
    if (document.fonts) document.fonts.ready.then(cover);
  }

  // ==========================================================
  // 10. CONTACTO
  // ==========================================================
  const wa = $('waText');
  if (wa && !wa.textContent.trim() && c.whatsapp_number) wa.textContent = '+' + c.whatsapp_number;
  // El formulario manda el mensaje a nuestro servidor; aparece en el dashboard de la artista
  const form = $('contactForm');
  if (form) {
    const shownAt = Date.now(); // los bots llenan el formulario en milisegundos
    const btn = $('submitBtn'), err = $('formError'), done = $('formDone');
    const showError = (msg) => { err.textContent = msg; err.hidden = false; };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.hidden = true;
      // Revisión rápida antes de mandar (el servidor vuelve a revisar todo)
      const f = form.elements;
      if (!f.name.value.trim()) return showError('Escribe tu nombre.'), f.name.focus();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.value.trim())) return showError('Escribe un correo válido.'), f.email.focus();
      if (f.message.value.trim().length < 2) return showError('Escribe tu mensaje.'), f.message.focus();

      btn.disabled = true; btn.textContent = 'Enviando…';
      try {
        const r = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRF': '1' },
          body: JSON.stringify({
            name: f.name.value, email: f.email.value, subject: f.subject.value, message: f.message.value,
            website: f.website.value, elapsed: Date.now() - shownAt,
          }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'No se pudo enviar. Intenta de nuevo.');
        form.reset();
        form.classList.add('is-sent');
        done.hidden = false;
      } catch (ex) {
        showError(ex.message === 'Failed to fetch' ? 'Sin conexión. Revisa tu internet e intenta de nuevo.' : ex.message);
      } finally {
        btn.disabled = false; btn.textContent = 'Enviar mensaje ✦';
      }
    });
    $('formAgain')?.addEventListener('click', () => { form.classList.remove('is-sent'); done.hidden = true; form.elements.name.focus(); });
  }

  if (reduceMotion) document.querySelectorAll('.marquee-track').forEach((t) => t.classList.add('still'));
  reveal(document);

  // ==========================================================
  // 11. AMBIENTE DE MUSEO NOCTURNO (portada y galería)
  //     Linterna que sigue al cursor, motas de polvo en la luz, chispas al
  //     hacer clic, cursor de museo, paralaje del fondo y de la portada,
  //     franjas que aceleran con el scroll y botones "magnéticos".
  // ==========================================================
  const isHome = document.body.classList.contains('page-home');
  if ((isHome || document.body.classList.contains('page-gallery')) && !reduceMotion) {
    const bg = document.querySelector('.bg-animated');
    const anchor = document.querySelector('.grain') || bg;
    const insert = (node) => { node.setAttribute('aria-hidden', 'true'); if (anchor) anchor.after(node); else document.body.prepend(node); };

    const light = finePointer ? el('div', 'room-light') : null;
    const motas = el('canvas', 'motas');
    insert(motas);
    if (light) insert(light);

    // --- Motas de polvo ---
    const ctx = motas.getContext('2d');
    let W = 0, H = 0;
    function size() {
      const dpr = Math.min(devicePixelRatio || 1, 1.5);
      W = innerWidth; H = innerHeight;
      motas.width = Math.round(W * dpr); motas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size();
    addEventListener('resize', size);
    const rnd = (a, b) => a + Math.random() * (b - a);
    const P = Array.from({ length: matchMedia('(max-width: 760px)').matches ? 24 : 56 }, () => ({
      x: rnd(0, W), y: rnd(0, H), r: rnd(0.5, 1.8), vy: rnd(-0.1, -0.32), ph: rnd(0, 6.28), sw: rnd(0.1, 0.4), a: rnd(0.12, 0.45),
    }));

    // --- Chispas doradas (al hacer clic en la sala o al rascar el lienzo) ---
    const B = [];
    fx.burst = (x, y, n = 28) => {
      for (let i = 0; i < n && B.length < 320; i++) {
        const ang = rnd(0, 6.2832), sp = rnd(0.6, 3.4), life = rnd(40, 90);
        B.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 0.6, r: rnd(1, 2.8), life, max: life });
      }
    };
    const NOT_SPARK = 'a, button, input, textarea, select, label, canvas, .work-frame, .art-frame, .g-frame, .viewer, .g-modal, .toolbar-container';
    addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest(NOT_SPARK)) return;
      fx.burst(e.clientX, e.clientY);
    });

    // --- Cursor de museo (anillo que sigue al mouse) ---
    const ring = finePointer ? el('div', 'cursor-ring') : null;
    let ringLabel = null;
    if (ring) {
      ring.setAttribute('aria-hidden', 'true');
      ringLabel = el('span');
      ring.append(ringLabel);
      document.body.append(ring);
      addEventListener('pointerover', (e) => {
        const t = e.target;
        ring.classList.remove('is-art', 'is-link');
        if (t.closest('.g-frame')) { ring.classList.add('is-art'); ringLabel.textContent = 'Arrastra'; }
        else if (t.closest('.scratch:not(.is-revealed)')) { ring.classList.add('is-art'); ringLabel.textContent = 'Desliza'; }
        else if (t.closest('.work-frame, .art-frame, .scratch')) { ring.classList.add('is-art'); ringLabel.textContent = 'Ver'; }
        else if (t.closest('a, button, .chip, input, textarea, select, label')) ring.classList.add('is-link');
      });
      addEventListener('pointerdown', () => ring.classList.add('is-down'));
      addEventListener('pointerup', () => ring.classList.remove('is-down'));
    }

    // --- Cursor (suavizado) ---
    let mx = W * 0.6, my = H * 0.4, cx = mx, cy = my, rx = mx, ry = my;
    if (finePointer) {
      addEventListener('pointermove', (e) => {
        if (e.pointerType !== 'mouse') return;
        mx = e.clientX; my = e.clientY;
        light.classList.add('on'); ring.classList.add('on');
      }, { passive: true });
      document.documentElement.addEventListener('mouseleave', () => {
        if (!document.body.classList.contains('lights-off')) light.classList.remove('on');
        ring.classList.remove('on');
      });
    }

    // --- Elementos que reaccionan al scroll y al mouse ---
    const zone = document.querySelector('.marquee-zone');
    const tracks = [...document.querySelectorAll('.marquee-track')];
    const feats = [...document.querySelectorAll('.feature')].map((f) => ({ f, media: f.querySelector('.feature-media'), text: f.querySelector('.feature-text') }));
    const heads = [...document.querySelectorAll('.page-home .section-head')];
    const heroContent = document.querySelector('.hero-content'), heroVisual = document.querySelector('.hero-visual');
    let lastY = scrollY, vel = 0, lastRate = 1, lastSkew = 0, lastParallaxY = null;

    function frame(t) {
      // cursor, linterna y paralaje del fondo
      cx += (mx - cx) * 0.08; cy += (my - cy) * 0.08;
      rx += (mx - rx) * 0.25; ry += (my - ry) * 0.25;
      if (light) { light.style.setProperty('--lx', cx.toFixed(1) + 'px'); light.style.setProperty('--ly', cy.toFixed(1) + 'px'); }
      if (ring) ring.style.translate = `${rx.toFixed(1)}px ${ry.toFixed(1)}px`;
      if (finePointer) {
        const nx = cx / W - 0.5, ny = cy / H - 0.5;
        if (bg) { bg.style.setProperty('--bx', (nx * -28).toFixed(2)); bg.style.setProperty('--by', (ny * -20).toFixed(2)); }
        // portada en capas: el texto y la obra se mueven en direcciones opuestas
        if (scrollY < H) {
          if (heroContent) heroContent.style.translate = `${(nx * -16).toFixed(1)}px ${(ny * -10).toFixed(1)}px`;
          if (heroVisual) heroVisual.style.translate = `${(nx * 26).toFixed(1)}px ${(ny * 18).toFixed(1)}px`;
        }
      }

      // motas: suben despacio, se apartan del cursor y brillan más cerca de la luz
      ctx.clearRect(0, 0, W, H);
      for (const p of P) {
        p.y += p.vy; p.x += Math.sin(t * 0.0005 + p.ph) * p.sw * 0.35;
        if (p.y < -10) { p.y = H + 10; p.x = rnd(0, W); }
        if (p.x < -10) p.x = W + 10; else if (p.x > W + 10) p.x = -10;
        const d = finePointer ? Math.hypot(p.x - cx, p.y - cy) : 999;
        if (d < 120 && d > 0) { p.x += ((p.x - cx) / d) * 0.6; p.y += ((p.y - cy) / d) * 0.6; }
        const near = finePointer ? Math.max(0, 1 - d / 300) : 0;
        const alpha = p.a * (0.55 + 0.45 * Math.sin(t * 0.0014 + p.ph)) + near * 0.5;
        ctx.fillStyle = `rgba(255, 226, 182, ${alpha.toFixed(3)})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r + near * 1.2, 0, 6.2832); ctx.fill();
      }
      // chispas
      for (let i = B.length - 1; i >= 0; i--) {
        const s = B[i];
        s.x += s.vx; s.y += s.vy; s.vx *= 0.96; s.vy = s.vy * 0.96 - 0.012;
        if (--s.life <= 0) { B.splice(i, 1); continue; }
        const k = s.life / s.max;
        ctx.fillStyle = `rgba(244, 210, 140, ${(k * 0.95).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r * (0.5 + k), 0, 6.2832); ctx.fill();
      }

      // franjas: aceleran y se inclinan con la velocidad del scroll
      const dy = scrollY - lastY; lastY = scrollY;
      vel += (dy - vel) * 0.12;
      const rate = 1 + Math.min(4, Math.abs(vel) * 0.35);
      if (Math.abs(rate - lastRate) > 0.03) { lastRate = rate; tracks.forEach((tr) => tr.getAnimations().forEach((a) => { a.playbackRate = rate; })); }
      const skew = Math.max(-8, Math.min(8, vel * -0.4));
      if (zone && Math.abs(skew - lastSkew) > 0.1) { lastSkew = skew; zone.style.setProperty('--skew', skew.toFixed(2) + 'deg'); }

      if (scrollY !== lastParallaxY) {
        lastParallaxY = scrollY;
        // obras destacadas: la obra y su texto se desplazan a distinta velocidad
        for (const { f, media, text } of feats) {
          const r = f.getBoundingClientRect();
          if (r.bottom < -200 || r.top > H + 200) continue;
          const k = (r.top + r.height / 2 - H / 2) / H;
          if (media) media.style.translate = `0 ${(k * -46).toFixed(1)}px`;
          if (text) text.style.translate = `0 ${(k * 30).toFixed(1)}px`;
        }
        // números de sala gigantes: flotan a otra velocidad que el título
        for (const h of heads) {
          const r = h.getBoundingClientRect();
          if (r.bottom < -300 || r.top > H + 300) continue;
          h.style.setProperty('--py', ((r.top - H / 2) * 0.1).toFixed(1));
        }
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    // Botones magnéticos: se acercan levemente al cursor
    if (finePointer) {
      document.querySelectorAll('.btn-primary, .btn-ghost, .nav-cta, .to-top, .tool-btn').forEach((b) => {
        b.addEventListener('pointermove', (e) => {
          const r = b.getBoundingClientRect();
          b.style.translate = `${((e.clientX - r.left - r.width / 2) * 0.18).toFixed(1)}px ${((e.clientY - r.top - r.height / 2) * 0.3).toFixed(1)}px`;
        });
        b.addEventListener('pointerleave', () => { b.style.translate = ''; });
      });
    }
  }

  // ==========================================================
  // 12. PROTECCIÓN DE IMÁGENES
  // ==========================================================
  // No impide una captura de pantalla (nada lo hace), pero evita "Guardar imagen como..." y arrastrar.
  document.addEventListener('contextmenu', (e) => {
    if (e.target.closest('img, .work-frame, .art-frame, .viewer-stage, .scratch, .g-frame, .g-modal-media')) { e.preventDefault(); notice(); }
  });
  document.addEventListener('dragstart', (e) => { if (e.target.tagName === 'IMG') e.preventDefault(); });
})();
