// =====================================================================
// GALERÍA — Lienzo libre (diseño original del proyecto)
// - Las obras aparecen esparcidas en marcos dorados barrocos, cada una con su
//   lámpara de museo, y se pueden arrastrar
// - Botón "Linterna": apaga las lámparas y solo ilumina el cursor
// - Botones: "Esparcir" (desordena) y "Ordenar en grilla"
// - Al tocar una obra se abre el modal con lupa, audioguía y su historia
// Sin librerías externas y sin innerHTML con datos (más seguro).
// =====================================================================
(function () {
  const $ = (id) => document.getElementById(id);
  const data = window.__CMS__ || { content: {}, artworks: [] };
  const c = data.content;
  const ARTS = data.artworks || [];

  const viewport = $('galleryViewport');
  const container = $('artContainer');
  const topbar = $('topbar');
  const modal = $('artModal');
  const viewer = $('viewer');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches;

  // ---------- estado ----------
  let mode = 'scatter';       // 'scatter' (esparcidas) o 'grid' (ordenadas)
  let filter = 'all';
  let list = [];              // obras que se ven ahora (según el filtro)
  let current = 0;            // índice de la obra abierta en el modal
  let topZ = 10;              // la obra que agarras pasa al frente
  let pushedHash = false;

  // Obras ya vistas (se recuerdan en este navegador)
  let explored = new Set();
  try { explored = new Set(JSON.parse(localStorage.getItem('icca_explored') || '[]')); } catch {}
  const saveExplored = () => { try { localStorage.setItem('icca_explored', JSON.stringify([...explored])); } catch {} };

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  // ---------- medidas ----------
  const frameW = () => (innerWidth < 600 ? 136 : innerWidth < 1000 ? 165 : 195);
  const navLimit = () => (topbar ? topbar.offsetHeight : 76) + 34; // las obras (y su lámpara) no suben más que esto
  const toolbarSpace = 120; // espacio abajo para la barra flotante
  // alto aproximado de un marco según la forma de su obra (para acomodarlos sin encimarse)
  function frameH(a, fw) {
    const inner = fw - 16 - 8 - 2;
    const ratio = Math.min(a.image.h / a.image.w, 1.5); // obras muy altas se limitan (ver CSS)
    return inner * ratio + 8 + 12 + 8 + 44;
  }

  // =================================================================
  // 1. CREAR LOS MARCOS
  // =================================================================
  function makeFrame(a) {
    const f = el('div', 'g-frame');
    f.dataset.id = a.id;
    f.tabIndex = 0;
    f.setAttribute('role', 'button');
    f.setAttribute('aria-label', `${a.title}. Arrastra para mover o presiona Enter para ver la obra`);

    if (explored.has(a.id)) f.append(badge());
    const box = el('div', 'g-img-box');
    const img = el('img');
    img.alt = a.title; img.loading = 'lazy'; img.decoding = 'async'; img.draggable = false;
    img.width = a.image.w; img.height = a.image.h;
    img.src = a.image.thumb;
    if (a.image.lqip) img.style.backgroundImage = `url("${a.image.lqip}")`;
    box.append(img);
    const cap = el('div', 'g-caption');
    cap.append(el('div', 'g-caption-title', a.title));
    cap.append(el('div', 'g-caption-sub', [a.year, a.category].filter(Boolean).join(' · ') || c.artist_name || ''));
    const orn = el('span', 'g-orn'); // volutas doradas de las esquinas (solo decoración)
    orn.setAttribute('aria-hidden', 'true');
    f.append(box, cap, orn);

    makeDraggable(f);
    f.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(list.indexOf(a)); }
    });
    return f;
  }
  function badge() {
    const b = el('span', 'badge-explored', '✓ Visto');
    return b;
  }

  // =================================================================
  // 2. ACOMODO: ESPARCIDAS O EN GRILLA
  // =================================================================
  // Esparcir: para cada obra se prueban varios lugares al azar y se queda el que menos se encima
  function scatterLayout(items, fw, W) {
    const top0 = navLimit() + (innerWidth < 600 ? 34 : 44);
    const area = items.reduce((s, a) => s + fw * frameH(a, fw), 0);
    const H = Math.max(innerHeight, top0 + (area * 2.1) / Math.max(1, W - 40) + toolbarSpace + 120);
    const placed = [];
    const out = new Map();
    for (const a of items) {
      const h = frameH(a, fw);
      let best = null, bestOverlap = Infinity;
      for (let t = 0; t < 18; t++) {
        const x = 16 + Math.random() * Math.max(1, W - fw - 32);
        const y = top0 + Math.random() * Math.max(1, H - h - top0 - toolbarSpace);
        let ov = 0;
        for (const p of placed) {
          const ox = Math.max(0, Math.min(x + fw, p.x + p.w) - Math.max(x, p.x));
          const oy = Math.max(0, Math.min(y + h, p.y + p.h) - Math.max(y, p.y));
          ov += ox * oy;
        }
        if (ov < bestOverlap) { bestOverlap = ov; best = { x, y }; if (ov === 0) break; }
      }
      placed.push({ ...best, w: fw, h });
      out.set(a.id, { x: best.x, y: best.y, rot: (Math.random() * 14 - 7).toFixed(1) });
    }
    return { pos: out, H };
  }

  // Grilla: columnas centradas; cada obra va a la columna más corta
  function gridLayout(items, fw, W) {
    const gap = innerWidth < 600 ? 34 : 56; // espacio para las molduras doradas y la lámpara
    const cols = Math.max(2, Math.min(6, Math.floor((W - 32 + gap) / (fw + gap))));
    const startX = Math.max(16, (W - (cols * (fw + gap) - gap)) / 2);
    const top0 = navLimit() + (innerWidth < 600 ? 34 : 50);
    const heights = new Array(cols).fill(top0);
    const out = new Map();
    for (const a of items) {
      const k = heights.indexOf(Math.min(...heights));
      out.set(a.id, { x: startX + k * (fw + gap), y: heights[k], rot: 0 });
      heights[k] += frameH(a, fw) + gap;
    }
    return { pos: out, H: Math.max(innerHeight, Math.max(...heights) + toolbarSpace) };
  }

  function layout(animate) {
    const fw = frameW();
    const W = viewport.clientWidth;
    const { pos, H } = mode === 'grid' ? gridLayout(list, fw, W) : scatterLayout(list, fw, W);
    viewport.style.minHeight = `${Math.ceil(H)}px`;
    container.querySelectorAll('.g-frame').forEach((f) => {
      const p = pos.get(Number(f.dataset.id));
      if (!p) return;
      if (animate && !reduceMotion) {
        f.classList.add('moving');
        clearTimeout(f._mt);
        f._mt = setTimeout(() => f.classList.remove('moving'), 950);
      }
      f.style.setProperty('--fw', `${fw}px`);
      f.style.setProperty('--rot', `${p.rot}deg`);
      f.style.left = `${p.x}px`;
      f.style.top = `${p.y}px`;
    });
  }

  // Dibuja todas las obras (al entrar caen una por una sobre el lienzo)
  function render() {
    list = ARTS.filter((a) => filter === 'all' || a.category === filter);
    container.textContent = '';
    if (!list.length) {
      container.append(el('p', 'g-empty', 'PRÓXIMAMENTE'));
      viewport.style.minHeight = '';
      updateCounter();
      return;
    }
    list.forEach((a, i) => {
      const f = makeFrame(a);
      if (!reduceMotion) {
        f.classList.add('enter');
        f.style.setProperty('--delay', `${Math.min(i * 70, 1400)}ms`);
        f.addEventListener('animationend', () => f.classList.remove('enter'), { once: true });
      }
      container.append(f);
    });
    layout(false);
    updateCounter();
  }

  // =================================================================
  // 3. ARRASTRAR (mouse, dedo y lápiz con un solo código)
  // =================================================================
  function makeDraggable(f) {
    let start = null;

    f.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      start = { x: e.clientX, y: e.clientY, left: parseFloat(f.style.left) || 0, top: parseFloat(f.style.top) || 0, moved: false };
      f.setPointerCapture(e.pointerId);
      f.style.zIndex = ++topZ;
    });

    f.addEventListener('pointermove', (e) => {
      if (!start) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!start.moved && Math.abs(dx) + Math.abs(dy) < 6) return;
      if (!start.moved) { start.moved = true; f.classList.add('is-dragging'); f.classList.remove('moving', 'enter'); hideHint(); }

      // Límites: no pasar arriba de la barra ni salirse por los lados
      const maxLeft = viewport.clientWidth - f.offsetWidth;
      let left = Math.min(Math.max(0, start.left + dx), maxLeft);
      let top = Math.max(navLimit(), start.top + dy);
      // si la llevas hasta abajo, el lienzo crece
      const needed = top + f.offsetHeight + toolbarSpace;
      if (needed > viewport.offsetHeight) viewport.style.minHeight = `${needed}px`;
      f.style.left = `${left}px`;
      f.style.top = `${top}px`;

      // scroll automático si arrastras cerca del borde de la pantalla
      if (e.clientY > innerHeight - 70) { scrollBy(0, 14); start.top += 14; }
      else if (e.clientY < navLimit() + 30 && scrollY > 0) { scrollBy(0, -14); start.top -= 14; }
    });

    const end = () => {
      if (!start) return;
      const wasClick = !start.moved;
      start = null;
      f.classList.remove('is-dragging');
      if (wasClick) openModal(list.findIndex((a) => String(a.id) === f.dataset.id));
    };
    f.addEventListener('pointerup', end);
    f.addEventListener('pointercancel', () => { start = null; f.classList.remove('is-dragging'); });
  }

  // =================================================================
  // 4. BARRA DE HERRAMIENTAS
  // =================================================================
  const btnScatter = $('btnScatter'), btnGrid = $('btnGrid');
  function setMode(m) {
    mode = m;
    btnScatter.classList.toggle('active', m === 'scatter');
    btnGrid.classList.toggle('active', m === 'grid');
    btnScatter.setAttribute('aria-pressed', String(m === 'scatter'));
    btnGrid.setAttribute('aria-pressed', String(m === 'grid'));
    layout(true);
  }
  btnScatter.addEventListener('click', () => setMode('scatter')); // cada clic las vuelve a revolver
  btnGrid.addEventListener('click', () => setMode('grid'));

  // Filtro por técnica (solo aparece si hay más de una)
  const cats = [...new Set(ARTS.map((a) => a.category).filter(Boolean))];
  if (cats.length > 1) {
    $('filterWrap').hidden = false;
    const sel = $('filterSelect');
    cats.forEach((k) => { const o = el('option', null, k); o.value = k; sel.append(o); });
    sel.addEventListener('change', () => { filter = sel.value; render(); });
  }

  // Linterna: apaga las lámparas de la sala; la luz sigue al cursor (solo con mouse)
  const btnLamp = $('btnLamp');
  if (btnLamp && matchMedia('(hover: hover) and (pointer: fine)').matches && !reduceMotion) {
    btnLamp.hidden = false;
    btnLamp.addEventListener('click', () => {
      const on = !document.body.classList.contains('lights-off');
      document.body.classList.toggle('lights-off', on);
      btnLamp.classList.toggle('active', on);
      btnLamp.setAttribute('aria-pressed', String(on));
      document.querySelector('.room-light')?.classList.add('on');
    });
  }

  function updateCounter() {
    const seen = ARTS.filter((a) => explored.has(a.id)).length;
    $('exploredCounter').textContent = `✦ Exploradas: ${seen} / ${ARTS.length}`;
  }

  // Aviso de uso: se va solo
  const hint = $('hint');
  function hideHint() { hint?.classList.add('gone'); }
  setTimeout(hideHint, 6000);

  // Al cambiar el tamaño de la ventana se reacomodan
  let rt, lastW = innerWidth;
  addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => { if (Math.abs(innerWidth - lastW) > 40) { lastW = innerWidth; layout(true); } }, 200);
  });

  // =================================================================
  // 5. MODAL DE LA OBRA
  // =================================================================
  const mImg = $('modalImg'), lens = $('zoomLens'), wrap = $('imgWrapper');
  const TABS = { context: 'Contexto histórico', technique: 'Técnica pictórica', symbolism: 'Simbolismo oculto', secrets: 'Secretos curiosos' };
  let activeTab = 'context';
  let lastFocus = null;

  function openModal(i) {
    if (i < 0 || !list[i]) return;
    current = i;
    const a = list[i];
    const wasHidden = modal.hidden;

    // marcar como vista
    if (!explored.has(a.id)) {
      explored.add(a.id); saveExplored(); updateCounter();
      const f = container.querySelector(`.g-frame[data-id="${a.id}"]`);
      if (f && !f.querySelector('.badge-explored')) f.prepend(badge());
    }

    mImg.src = a.image.src;
    mImg.alt = a.title;
    $('modalTitle').textContent = a.title;
    $('modalArtist').textContent = c.artist_name || '';
    $('modalYear').textContent = [a.year, a.dimensions].filter(Boolean).join(' · ');
    $('modalMovement').textContent = a.category || '';
    $('modalLocation').textContent = a.location || '—';
    $('btnPrevArt').hidden = $('btnNextArt').hidden = list.length < 2;
    $('audioCard').hidden = !('speechSynthesis' in window);
    $('zoomHintText').textContent = coarse ? 'Toca “Pantalla completa” para acercarte' : 'Pasa el cursor sobre la obra para hacer zoom';
    showTab('context');
    stopAudio();

    if (wasHidden) {
      lastFocus = document.activeElement;
      modal.hidden = false;
      document.documentElement.classList.add('viewer-open');
      for (const n of document.querySelectorAll('body > header, body > main, .toolbar-container')) n.inert = true;
      $('btnCloseModal').focus();
    }
    // cada obra tiene su link (#obra-12)
    const h = '#obra-' + a.id;
    if (!location.hash.startsWith('#obra-')) { history.pushState({ g: 1 }, '', h); pushedHash = true; }
    else if (location.hash !== h) history.replaceState(history.state, '', h);
  }

  function closeModal(fromHistory) {
    if (modal.hidden) return;
    stopAudio();
    lens.style.display = 'none';
    modal.hidden = true;
    document.documentElement.classList.remove('viewer-open');
    for (const n of document.querySelectorAll('body > header, body > main, .toolbar-container')) n.inert = false;
    if (!fromHistory) {
      if (pushedHash) history.back();
      else history.replaceState(null, '', location.pathname);
    }
    pushedHash = false;
    const f = container.querySelector(`.g-frame[data-id="${list[current]?.id}"]`);
    (f || lastFocus)?.focus?.({ preventScroll: true });
  }

  function showTab(key) {
    activeTab = key;
    document.querySelectorAll('.g-tab').forEach((b) => {
      const on = b.dataset.tab === key;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
    });
    const box = $('tabContent');
    box.textContent = '';
    const text = list[current]?.[key];
    const strong = el('strong', null, TABS[key] + ': ');
    box.append(strong, document.createTextNode(text || 'Pronto habrá más información sobre esta obra.'));
  }
  document.querySelectorAll('.g-tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

  $('btnCloseModal').addEventListener('click', () => closeModal());
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  $('btnPrevArt').addEventListener('click', () => openModal((current - 1 + list.length) % list.length));
  $('btnNextArt').addEventListener('click', () => openModal((current + 1) % list.length));
  $('btnFull').addEventListener('click', () => { stopAudio(); window.ICCA_Viewer?.open(list, current); });

  // Teclado: se escucha antes que el visor para no cerrar los dos a la vez
  document.addEventListener('keydown', (e) => {
    if (modal.hidden || (viewer && !viewer.hidden)) return;
    if (e.key === 'Escape') closeModal();
    else if (e.key === 'ArrowRight' && list.length > 1) openModal((current + 1) % list.length);
    else if (e.key === 'ArrowLeft' && list.length > 1) openModal((current - 1 + list.length) % list.length);
  }, true);

  // Botón "atrás" del navegador/celular cierra el modal
  addEventListener('popstate', () => {
    if (!/^#obra-/.test(location.hash)) { pushedHash = false; closeModal(true); }
  });

  // ---------- lupa ----------
  const ZOOM = 2.6, R = 75; // R = radio de la lupa
  mImg.addEventListener('mousemove', (e) => {
    const r = mImg.getBoundingClientRect(), w = wrap.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    // la lupa usa la versión más grande de la imagen
    const big = list[current].image.full;
    if (lens.dataset.src !== big) { lens.style.backgroundImage = `url("${big}")`; lens.dataset.src = big; }
    lens.style.display = 'block';
    lens.style.left = `${e.clientX - w.left - R}px`;
    lens.style.top = `${e.clientY - w.top - R}px`;
    lens.style.backgroundSize = `${r.width * ZOOM}px ${r.height * ZOOM}px`;
    lens.style.backgroundPosition = `${-(x * ZOOM - R)}px ${-(y * ZOOM - R)}px`;
  });
  mImg.addEventListener('mouseleave', () => { lens.style.display = 'none'; });
  mImg.addEventListener('click', () => { if (coarse) window.ICCA_Viewer?.open(list, current); });

  // ---------- audioguía ----------
  const btnAudio = $('btnAudioPlay'), audioStatus = $('audioStatus'), eq = $('eqVisualizer');
  let speaking = false;
  function stopAudio() {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    speaking = false;
    audioStatus.textContent = 'Listo para reproducir';
    btnAudio.classList.remove('playing');
    btnAudio.setAttribute('aria-label', 'Reproducir audioguía');
    eq.classList.remove('playing');
  }
  btnAudio.addEventListener('click', () => {
    if (speaking) return stopAudio();
    const a = list[current];
    const u = new SpeechSynthesisUtterance(a.audioText || `${a.title}. ${a.context || ''}`);
    u.lang = 'es-MX'; u.rate = 0.95;
    u.onstart = () => {
      speaking = true;
      audioStatus.textContent = 'Reproduciendo…';
      btnAudio.classList.add('playing');
      btnAudio.setAttribute('aria-label', 'Pausar audioguía');
      eq.classList.add('playing');
    };
    u.onend = u.onerror = stopAudio;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  });

  // =================================================================
  // 6. INICIO
  // =================================================================
  render();
  // si el link trae una obra (#obra-12), se abre directo
  const m = location.hash.match(/^#obra-(\d+)$/);
  if (m) { const i = list.findIndex((a) => String(a.id) === m[1]); if (i >= 0) { openModal(i); pushedHash = false; } }
})();
