/* Grupo FAHE — comportamiento común (sin dependencias) */
(() => {
  'use strict';

  // Teléfono que recibe los mensajes de WhatsApp de la web (formato internacional, sin "+")
  const WA_NUMBER = '34683605335';
  const BOOKING_URL = 'https://www.booking.com/hotel/es/la-torre-hostel.es.html';

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const waLink = (text) => `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`;
  const openTab = (url) => window.open(url, '_blank', 'noopener');
  const todayISO = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  };
  const addDaysISO = (iso, n) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
  };
  const fmtDate = (iso) => iso.split('-').reverse().join('/');

  /* ---- Cielo de estrellas (Compostela: «campo de estrellas») ---- */
  const canvas = $('#stars');
  if (canvas && canvas.getContext) {
    const ctx = canvas.getContext('2d');
    let w = 0, h = 0, stars = [], shooting = null, nextShot = 4000, last = 0, raf = 0;

    const build = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(420, Math.round((w * h) / 4200));
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.3 + 0.35,
        a: Math.random() * 0.55 + 0.4,
        phase: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.0016 + 0.0005,
        depth: Math.random() * 0.35 + 0.05,
        gold: Math.random() < 0.09,
      }));
    };

    const draw = (t) => {
      ctx.clearRect(0, 0, w, h);
      const scroll = window.scrollY;
      for (const s of stars) {
        const twinkle = reduceMotion ? 1 : 0.55 + 0.45 * Math.sin(s.phase + t * s.speed);
        let y = (s.y - scroll * s.depth) % h;
        if (y < 0) y += h;
        ctx.globalAlpha = s.a * twinkle;
        ctx.fillStyle = s.gold ? '#ffd970' : '#dfe8ff';
        ctx.beginPath();
        ctx.arc(s.x, y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (shooting) {
        const p = shooting;
        p.life += 1;
        const len = 110;
        const x2 = p.x - Math.cos(p.angle) * len, y2 = p.y - Math.sin(p.angle) * len;
        const grad = ctx.createLinearGradient(p.x, p.y, x2, y2);
        grad.addColorStop(0, 'rgba(255,236,170,.95)');
        grad.addColorStop(1, 'rgba(255,236,170,0)');
        ctx.globalAlpha = Math.max(0, 1 - p.life / 60);
        ctx.strokeStyle = grad; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(x2, y2); ctx.stroke();
        p.x += Math.cos(p.angle) * 9; p.y += Math.sin(p.angle) * 9;
        if (p.life > 60) shooting = null;
      }
      ctx.globalAlpha = 1;
    };

    const loop = (t) => {
      const dt = t - last; last = t;
      nextShot -= dt;
      if (!shooting && nextShot <= 0) {
        shooting = { x: Math.random() * w * 0.7 + w * 0.2, y: Math.random() * h * 0.35, angle: Math.PI * (0.78 + Math.random() * 0.1), life: 0 };
        nextShot = 7000 + Math.random() * 9000;
      }
      draw(t);
      raf = requestAnimationFrame(loop);
    };

    build();
    if (reduceMotion) {
      draw(0);
      window.addEventListener('scroll', () => draw(0), { passive: true });
    } else {
      raf = requestAnimationFrame(loop);
      document.addEventListener('visibilitychange', () => {
        cancelAnimationFrame(raf);
        if (!document.hidden) { last = performance.now(); raf = requestAnimationFrame(loop); }
      });
    }
    let rt;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { build(); if (reduceMotion) draw(0); }, 150); });
  }

  /* ---- Cabecera ---- */
  const header = $('.site-header');
  if (header) {
    const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ---- Desplegable de empresas ---- */
  $$('.dd').forEach((dd) => {
    const btn = $('.dd-btn', dd);
    const set = (open) => { dd.classList.toggle('open', open); btn.setAttribute('aria-expanded', String(open)); };
    btn.addEventListener('click', (e) => { e.stopPropagation(); set(!dd.classList.contains('open')); });
    document.addEventListener('click', (e) => { if (!dd.contains(e.target)) set(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
  });

  /* ---- Menú móvil ---- */
  const toggle = $('.nav-toggle');
  const nav = $('#site-nav');
  if (toggle && nav) {
    const icon = $('i', toggle);
    const setOpen = (open) => {
      nav.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
      if (icon) icon.className = open ? 'ti ti-x' : 'ti ti-menu-2';
    };
    toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
    nav.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
    window.matchMedia('(min-width: 961px)').addEventListener('change', (e) => { if (e.matches) setOpen(false); });
  }

  /* ---- Aparición con desenfoque ---- */
  const revealEls = $$('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) { entry.target.classList.add('in'); io.unobserve(entry.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('in'));
  }

  /* ---- Luz que sigue al cursor en las tarjetas de cristal ---- */
  if (window.matchMedia('(hover: hover)').matches) {
    document.addEventListener('pointermove', (e) => {
      const card = e.target.closest && e.target.closest('.glass');
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    }, { passive: true });
  }

  /* ---- Carrusel 3D de tarjetas ---- */
  $$('[data-coverflow]').forEach((root) => {
    const items = $$('.cf-item', root);
    const counter = $('[data-cf-count]', root.parentElement);
    const prev = $('[data-cf-prev]', root.parentElement);
    const next = $('[data-cf-next]', root.parentElement);
    let active = Math.min(1, items.length - 1);

    const render = () => {
      const narrow = window.innerWidth < 640;
      const gap = narrow ? 150 : 270;
      items.forEach((el, i) => {
        const off = i - active;
        const abs = Math.abs(off);
        const x = off * gap * (abs > 1 ? 0.92 : 1);
        const z = -abs * 160;
        const rot = off === 0 ? 0 : (off > 0 ? -32 : 32);
        el.style.transform = `translateX(${x}px) translateZ(${z}px) rotateY(${rot}deg)`;
        el.style.opacity = abs > 2 ? '0' : String(1 - abs * 0.22);
        el.style.filter = abs === 0 ? 'none' : `brightness(${1 - abs * 0.18}) blur(${abs > 1 ? 1.5 : 0}px)`;
        el.style.zIndex = String(100 - abs);
        el.style.pointerEvents = abs > 2 ? 'none' : 'auto';
        el.classList.toggle('is-active', off === 0);
        el.setAttribute('aria-hidden', String(off !== 0));
        el.tabIndex = off === 0 ? 0 : -1;
      });
      if (counter) counter.textContent = `${active + 1} / ${items.length}`;
    };
    const go = (i) => { active = (i + items.length) % items.length; render(); };

    let swiped = false;
    items.forEach((el, i) => el.addEventListener('click', () => {
      if (swiped) { swiped = false; return; }
      if (i !== active) { go(i); return; }
      const link = el.dataset.href;
      if (link) window.location.href = link;
    }));
    prev && prev.addEventListener('click', () => go(active - 1));
    next && next.addEventListener('click', () => go(active + 1));
    root.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') go(active - 1);
      if (e.key === 'ArrowRight') go(active + 1);
    });
    let startX = null;
    root.addEventListener('pointerdown', (e) => { startX = e.clientX; });
    root.addEventListener('pointerup', (e) => {
      if (startX === null) return;
      const dx = e.clientX - startX; startX = null;
      if (Math.abs(dx) > 40) { swiped = true; go(active + (dx < 0 ? 1 : -1)); setTimeout(() => { swiped = false; }, 0); }
    });
    window.addEventListener('resize', render);
    render();
  });

  /* ---- Año en el pie ---- */
  $$('[data-year]').forEach((el) => { el.textContent = String(new Date().getFullYear()); });

  /* ---- Buscador de disponibilidad (página del peregrino) ---- */
  const bf = $('#booking-form');
  if (bf) {
    const date = $('[name="llegada"]', bf);
    const err = $('.form-error', bf);
    date.min = todayISO();

    const read = () => ({
      llegada: date.value,
      noches: Number(bf.elements.noches.value),
      personas: Number(bf.elements.personas.value),
      tipo: ($('[name="tipo"]:checked', bf) || {}).value || 'Albergue Urraca – litera',
    });
    const fail = (msg) => { err.textContent = msg; err.classList.add('show'); date.focus(); return false; };
    const validate = (d) => {
      if (!d.llegada) return fail('Elige tu fecha de llegada.');
      if (d.llegada < todayISO()) return fail('La fecha de llegada no puede ser anterior a hoy.');
      err.classList.remove('show');
      return true;
    };
    date.addEventListener('input', () => err.classList.remove('show'));

    bf.addEventListener('submit', (e) => {
      e.preventDefault();
      const d = read();
      if (!validate(d)) return;
      openTab(waLink([
        '¡Hola! Os escribo desde la web. Quería consultar disponibilidad:',
        `• Alojamiento: ${d.tipo}`,
        `• Llegada: ${fmtDate(d.llegada)}`,
        `• Noches: ${d.noches}`,
        `• Peregrinos: ${d.personas}`,
        '',
        '¡Gracias!',
      ].join('\n')));
    });

    const bookingBtn = $('[data-booking]', bf);
    if (bookingBtn) {
      bookingBtn.addEventListener('click', () => {
        const d = read();
        let url = BOOKING_URL;
        if (d.llegada && d.llegada >= todayISO()) {
          url += `?${new URLSearchParams({
            checkin: d.llegada,
            checkout: addDaysISO(d.llegada, d.noches),
            group_adults: String(d.personas),
            group_children: '0',
            no_rooms: '1',
          })}`;
        }
        openTab(url);
      });
    }
  }

  /* ---- Formularios que se envían por WhatsApp ---- */
  $$('form[data-wa-form]').forEach((form) => {
    const err = $('.form-error', form);
    form.addEventListener('input', () => { if (err) err.classList.remove('show'); });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const missing = $$('[required]', form).find((f) => !f.value.trim());
      if (missing) {
        if (err) { err.textContent = `Completa el campo «${missing.dataset.label || missing.name}».`; err.classList.add('show'); }
        missing.focus();
        return;
      }
      const lines = $$('[data-label]', form).filter((f) => f.value.trim()).map((f) => `• ${f.dataset.label}: ${f.value.trim()}`);
      openTab(waLink(`${form.dataset.waForm}\n\n${lines.join('\n')}`));
    });
  });

  /* ---- Enlaces directos a WhatsApp con mensaje predefinido ---- */
  $$('[data-wa]').forEach((a) => {
    a.setAttribute('href', waLink(a.dataset.wa));
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener');
  });
})();
