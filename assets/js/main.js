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

  /* ---- Fondo de estrellas ---- */
  const canvas = $('#stars');
  if (canvas && canvas.getContext) {
    const ctx = canvas.getContext('2d');
    let w = 0, h = 0, stars = [], shooting = null, nextShot = 6000, last = 0, raf = 0;

    const build = () => {
      w = canvas.clientWidth; h = canvas.clientHeight;
      const small = w < 760;
      // En móviles: menos estrellas y menos resolución, para no gastar batería
      const dpr = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(small ? 140 : 320, Math.round((w * h) / (small ? 4200 : 5200)));
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.2 + 0.3,
        a: Math.random() * 0.5 + 0.3,
        phase: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.0014 + 0.0004,
        depth: Math.random() * 0.3 + 0.05,
        warm: Math.random() < 0.08,
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
        ctx.fillStyle = s.warm ? '#ffd970' : '#dfe8ff';
        ctx.beginPath();
        ctx.arc(s.x, y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (shooting) {
        const p = shooting;
        p.life += 1;
        const x2 = p.x - Math.cos(p.angle) * 110, y2 = p.y - Math.sin(p.angle) * 110;
        const grad = ctx.createLinearGradient(p.x, p.y, x2, y2);
        grad.addColorStop(0, 'rgba(255,236,170,.9)');
        grad.addColorStop(1, 'rgba(255,236,170,0)');
        ctx.globalAlpha = Math.max(0, 1 - p.life / 60);
        ctx.strokeStyle = grad; ctx.lineWidth = 1.3;
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
        nextShot = 10000 + Math.random() * 12000;
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

  /* ---- Desplegable ---- */
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

  /* ---- Aparición al hacer scroll ---- */
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

  /* ---- Luz que sigue al cursor en las tarjetas ---- */
  if (window.matchMedia('(hover: hover)').matches) {
    document.addEventListener('pointermove', (e) => {
      const card = e.target.closest && e.target.closest('.glass');
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    }, { passive: true });
  }

  /* ---- Año en el pie ---- */
  $$('[data-year]').forEach((el) => { el.textContent = String(new Date().getFullYear()); });

  /* ---- Disponibilidad del albergue (Hospederías do Camiño) ---- */
  const bf = $('#booking-form');
  if (bf) {
    const date = $('[name="llegada"]', bf);
    const err = $('.form-error', bf);
    date.min = todayISO();

    const read = () => ({
      llegada: date.value,
      noches: Number(bf.elements.noches.value),
      personas: Number(bf.elements.personas.value),
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
        '¡Hola! Quería consultar disponibilidad en el Albergue Urraca:',
        `• Llegada: ${fmtDate(d.llegada)}`,
        `• Noches: ${d.noches}`,
        `• Personas: ${d.personas}`,
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
