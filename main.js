(() => {
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (reduce) root.classList.add('rm');
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';   // the tour must start at the hero
  if (!location.hash) scrollTo(0, 0);
  setTimeout(() => root.classList.add('ready'), 3200);   // never keep the veil if WebGL is slow or missing

  /* ---------- measurement queue (no analytics loaded in the demo) ---------- */
  window.dataLayer = window.dataLayer || [];
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-track]');
    if (a) window.dataLayer.push({ event: a.dataset.track, page: location.pathname });
  });

  /* ---------- split headlines into masked words ---------- */
  document.querySelectorAll('.split').forEach(h => {
    let k = 0;
    const wrap = node => [...node.childNodes].forEach(n => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach(part => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.append(part); return; }
          const w = document.createElement('span'); w.className = 'w';
          const i = document.createElement('span'); i.textContent = part; i.style.setProperty('--k', k++);
          w.append(i); frag.append(w);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1) wrap(n);
    });
    h.setAttribute('aria-label', h.textContent.trim());
    wrap(h);
    h.querySelectorAll('.w').forEach(w => w.setAttribute('aria-hidden', 'true'));
  });
  document.querySelectorAll('main section :is(.lede-s, .note, .board, .card, .g-wrap, address, .facts, .acts, .ig-link, .eyebrow), .stop :is(.txt, .lede, .chips, .acts, .num, .eyebrow)').forEach((el, i) => {
    el.classList.add('rv'); el.style.setProperty('--d', (i % 4) * 90 + 'ms');
  });
  const io = new IntersectionObserver(es => es.forEach(e => {
    e.target.classList.toggle('in', e.isIntersecting || e.target.classList.contains('in') && !e.target.closest('.stop'));
  }), { rootMargin: '0px 0px -10% 0px' });
  document.querySelectorAll('.split, .rv').forEach(el => io.observe(el));

  /* ---------- bar ---------- */
  const bar = document.getElementById('bar');
  const onScroll = () => bar.classList.toggle('solid', scrollY > innerHeight * .6);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  /* ---------- live gold board ---------- */
  const ROWS = [['GRA', 'Gram altın'], ['CEYREKALTIN', 'Çeyrek altın'], ['YARIMALTIN', 'Yarım altın'], ['TAMALTIN', 'Tam altın'],
    ['CUMHURIYETALTINI', 'Cumhuriyet altını'], ['YIA', '22 ayar bilezik (gr)'], ['18AYARALTIN', '18 ayar (gr)'], ['14AYARALTIN', '14 ayar (gr)']];
  const board = document.getElementById('board'), stamp = document.getElementById('goldTime');
  const fmt = n => n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';
  const prev = {};
  const count = (el, to) => {
    const from = prev[el.dataset.k] ?? to * .96, t0 = performance.now();
    prev[el.dataset.k] = to;
    if (reduce) { el.textContent = fmt(to); return; }
    const step = now => { const p = Math.min(1, (now - t0) / 1200), v = from + (to - from) * (1 - Math.pow(1 - p, 3)); el.textContent = fmt(v); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  };
  ROWS.forEach(([k, name]) => {
    const r = document.createElement('div'); r.className = 'row'; r.setAttribute('role', 'row'); r.dataset.k = k;
    r.innerHTML = `<span class="nm" role="cell">${name}</span><span class="v" role="cell" data-k="${k}b">–</span><span class="v" role="cell" data-k="${k}s">–</span><span class="ch" role="cell"></span>`;
    board.append(r);
  });
  async function loadGold() {
    try {
      const res = await fetch('https://finans.truncgil.com/v4/today.json', { cache: 'no-store' });
      if (!res.ok) throw 0;
      const d = await res.json();
      ROWS.forEach(([k]) => {
        const x = d[k], r = board.querySelector(`[data-k="${k}"]`);
        if (!x || !r) { r?.remove(); return; }
        const [b, s] = r.querySelectorAll('.v');
        count(b, +x.Buying); count(s, +x.Selling);
        const ch = r.querySelector('.ch'), c = +x.Change;
        ch.textContent = (c > 0 ? '▲ ' : c < 0 ? '▼ ' : '') + '%' + Math.abs(c).toLocaleString('tr-TR', { minimumFractionDigits: 2 });
        ch.className = 'ch ' + (c > 0 ? 'up' : c < 0 ? 'dn' : '');
        r.classList.remove('flash'); void r.offsetWidth; r.classList.add('flash');
      });
      if (d.Update_Date) stamp.textContent = 'Son güncelleme: ' + d.Update_Date.slice(11, 16);
    } catch {
      if (!board.querySelector('.err')) board.insertAdjacentHTML('beforeend', '<p class="err">Fiyatlara şu an ulaşılamıyor. Güncel fiyat için 0252 317 19 08.</p>');
    }
  }
  let goldTimer;
  new IntersectionObserver(([e]) => {
    clearInterval(goldTimer);
    if (e.isIntersecting) { loadGold(); goldTimer = setInterval(loadGold, 60000); }
  }).observe(board);

  /* ---------- moments: vertical scroll drives a horizontal track ---------- */
  const mSec = document.querySelector('.moments'), mTrack = document.getElementById('mTrack');
  const mFrame = () => {
    if (reduce || !mSec) return;
    const r = mSec.getBoundingClientRect(), span = mSec.offsetHeight - innerHeight;
    const p = Math.min(1, Math.max(0, -r.top / span));
    const max = mTrack.scrollWidth - innerWidth;
    mTrack.style.transform = `translate3d(${-p * Math.max(0, max)}px,0,0)`;
    [...mTrack.children].forEach((li, i) => {
      const c = li.getBoundingClientRect(), q = (c.left + c.width / 2) / innerWidth - .5;
      li.style.opacity = String(1 - Math.min(.55, Math.abs(q) * .7));
    });
  };

  /* ---------- chain guide tabs ---------- */
  const tabs = [...document.querySelectorAll('.g-tabs [role=tab]')];
  const select = (t, focus) => {
    tabs.forEach(b => {
      const on = b === t, p = document.getElementById(b.getAttribute('aria-controls'));
      b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1;
      p.classList.toggle('on', on); p.toggleAttribute('inert', !on);
    });
    if (focus) t.focus();
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(t));
    t.addEventListener('keydown', e => {
      const k = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
      if (k) { e.preventDefault(); select(tabs[(i + k + tabs.length) % tabs.length], true); }
    });
  });

  /* ---------- map loads when near ---------- */
  const map = document.getElementById('map');
  new IntersectionObserver(([e], o) => {
    if (!e.isIntersecting) return; o.disconnect();
    map.innerHTML = `<iframe src="${map.dataset.src}" title="Ata Kuyumculuk Oasis haritada" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
  }, { rootMargin: '400px' }).observe(map);

  /* ---------- pointer: cursor ring, magnetic buttons, card glow ---------- */
  if (fine && !reduce) {
    const cur = document.getElementById('cursor');
    let x = innerWidth / 2, y = innerHeight / 2, cx = x, cy = y;
    addEventListener('pointermove', e => { x = e.clientX; y = e.clientY; cur.classList.add('on'); });
    document.addEventListener('pointerleave', () => cur.classList.remove('on'));
    const tick = () => { cx += (x - cx) * .2; cy += (y - cy) * .2; cur.style.transform = `translate(${cx}px,${cy}px)`; requestAnimationFrame(tick); };
    tick();
    document.querySelectorAll('a, button').forEach(el => {
      el.addEventListener('pointerenter', () => cur.classList.add('big'));
      el.addEventListener('pointerleave', () => cur.classList.remove('big'));
    });
    document.querySelectorAll('.magnet').forEach(el => {
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * .25}px, ${(e.clientY - r.top - r.height / 2) * .35}px)`;
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
    document.querySelectorAll('.card').forEach(c => c.addEventListener('pointermove', e => {
      const r = c.getBoundingClientRect();
      c.style.setProperty('--mx', e.clientX - r.left + 'px'); c.style.setProperty('--my', e.clientY - r.top + 'px');
    }));
  }

  /* ---------- smooth scroll ---------- */
  const loop = t => { window.lenis?.raf(t); mFrame(); requestAnimationFrame(loop); };
  if (!reduce && window.Lenis) {
    window.lenis = new Lenis({ lerp: .08, smoothWheel: true });
    document.querySelectorAll('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
      const t = document.querySelector(a.getAttribute('href'));
      if (t) { e.preventDefault(); window.lenis.scrollTo(t, { offset: a.getAttribute('href') === '#ust' ? 0 : -60, duration: 1.6 }); }
    }));
  }
  requestAnimationFrame(loop);
})();
