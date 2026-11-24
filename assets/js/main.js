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

  /* ---- Formularios de correo y de currículum ----
     La web es estática (GitHub Pages), así que los formularios se envían con FormSubmit
     (https://formsubmit.co): convierte el formulario en un correo, con adjuntos, sin servidor propio.
     El primer envío manda a CONTACT_EMAIL un correo de activación que hay que confirmar una vez.
     Tras confirmarlo, FormSubmit da un alias (una cadena aleatoria) que puede sustituir al correo
     en FORM_ACTION para que la dirección no aparezca en el código. */
  const CONTACT_EMAIL = 'hospederiasdocaminosl@gmail.com';
  const FORM_ACTION = `https://formsubmit.co/${CONTACT_EMAIL}`;
  const MAX_CV_MB = 5;

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const company = document.body.dataset.company || 'Grupo FAHE';
  const thisPage = location.pathname.split('/').pop() || 'index.html';
  const thanksURL = new URL(`gracias.html?volver=${encodeURIComponent(thisPage)}`, location.href).href;

  const hidden = (subject) => `
    <input type="hidden" name="_subject" value="${esc(subject)}">
    <input type="hidden" name="_template" value="table">
    <input type="hidden" name="_captcha" value="false">
    <input type="hidden" name="_next" value="${esc(thanksURL)}">
    <input type="hidden" name="Empresa" value="${esc(company)}">
    <input type="text" name="_honey" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">`;
  const consent = `
    <label class="check"><input type="checkbox" name="Privacidad" value="Aceptada" required data-label="privacidad">
      <span>He leído y acepto la <a href="politica-privacidad.html" target="_blank" rel="noopener">política de privacidad</a>. ${esc(company)} solo usará estos datos para atender mi solicitud.</span></label>`;
  const head = (kind, eyebrow, title, sub) => `
    <div class="modal-head">
      <div><span class="eyebrow">${eyebrow}</span><h2 id="dlg-${kind}-t">${title}</h2></div>
      <button class="modal-close" type="button" data-close aria-label="Cerrar"><i class="ti ti-x" aria-hidden="true"></i></button>
    </div>
    <p class="sub">${sub}</p>`;

  const templates = {
    email: () => `
      <dialog class="modal" id="dlg-email" aria-labelledby="dlg-email-t">
        <form class="modal-card form-card" method="post" action="${FORM_ACTION}" novalidate data-mail-form>
          ${head('email', 'Correo', 'Escríbenos', 'Te contestaremos a tu correo lo antes posible.')}
          ${hidden(`Nuevo mensaje desde la web · ${company}`)}
          <div class="field"><label for="m-nombre">Nombre</label><input id="m-nombre" name="Nombre" autocomplete="name" required data-label="Nombre"></div>
          <div class="field"><label for="m-email">Tu correo</label><input id="m-email" name="email" type="email" inputmode="email" autocomplete="email" required data-label="Tu correo"></div>
          <div class="field"><label for="m-msg">Mensaje</label><textarea id="m-msg" name="Mensaje" required data-label="Mensaje"></textarea></div>
          ${consent}
          <p class="form-error" role="alert"></p>
          <button class="btn btn-accent btn-lg btn-block" type="submit"><i class="ti ti-send" aria-hidden="true"></i> Enviar correo</button>
        </form>
      </dialog>`,
    cv: () => `
      <dialog class="modal" id="dlg-cv" aria-labelledby="dlg-cv-t">
        <form class="modal-card form-card" method="post" action="${FORM_ACTION}" enctype="multipart/form-data" novalidate data-mail-form>
          ${head('cv', 'Trabaja con nosotros', 'Envíanos tu CV', `Adjunta tu currículum en PDF (máximo ${MAX_CV_MB} MB).`)}
          ${hidden('Nuevo currículum desde la web')}
          <input type="hidden" name="Puesto" value="Candidatura espontánea">
          <div class="field"><label for="c-nombre">Nombre y apellidos</label><input id="c-nombre" name="Nombre" autocomplete="name" required data-label="Nombre y apellidos"></div>
          <div class="field-row">
            <div class="field"><label for="c-email">Correo</label><input id="c-email" name="email" type="email" inputmode="email" autocomplete="email" required data-label="Correo"></div>
            <div class="field"><label for="c-tel">Teléfono</label><input id="c-tel" name="Telefono" type="tel" inputmode="tel" autocomplete="tel" data-label="Teléfono"></div>
          </div>
          <div class="field">
            <label for="c-file">Currículum</label>
            <div class="file-drop">
              <i class="ti ti-file-type-pdf" aria-hidden="true"></i>
              <div><strong data-file-name>Elige tu CV en PDF</strong><span data-file-hint>Toca aquí para buscarlo en tu móvil u ordenador</span></div>
              <input id="c-file" name="Curriculum" type="file" accept="application/pdf,.pdf" required data-label="Currículum">
            </div>
          </div>
          <div class="field"><label for="c-msg">Mensaje (opcional)</label><textarea id="c-msg" name="Mensaje" data-label="Mensaje" placeholder="Cuéntanos algo sobre ti, disponibilidad…"></textarea></div>
          ${consent}
          <p class="form-error" role="alert"></p>
          <button class="btn btn-accent btn-lg btn-block" type="submit"><i class="ti ti-send" aria-hidden="true"></i> Enviar CV</button>
        </form>
      </dialog>`,
  };

  const dialogs = {};
  const getDialog = (kind) => {
    if (dialogs[kind]) return dialogs[kind];
    document.body.insertAdjacentHTML('beforeend', templates[kind]());
    const dlg = document.getElementById(`dlg-${kind}`);
    const form = $('form', dlg);
    const err = $('.form-error', form);
    const fail = (msg, field) => { err.textContent = msg; err.classList.add('show'); if (field) field.focus(); };

    $('[data-close]', dlg).addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    form.addEventListener('input', () => err.classList.remove('show'));

    const fileInput = $('input[type="file"]', form);
    if (fileInput) {
      fileInput.addEventListener('change', () => {
        const f = fileInput.files[0];
        $('[data-file-name]', form).textContent = f ? f.name : 'Elige tu CV en PDF';
        $('[data-file-hint]', form).textContent = f ? `${(f.size / 1048576).toFixed(1)} MB` : 'Toca aquí para buscarlo en tu móvil u ordenador';
        fileInput.closest('.file-drop').classList.toggle('has-file', !!f);
      });
    }

    form.addEventListener('submit', (e) => {
      const missing = $$('[required]', form).find((f) => (f.type === 'checkbox' ? !f.checked : f.type === 'file' ? !f.files.length : !f.value.trim()));
      if (missing) {
        e.preventDefault();
        if (missing.type === 'checkbox') return fail('Marca la casilla de privacidad para poder enviarlo.', missing);
        if (missing.type === 'file') return fail('Adjunta tu currículum en PDF.', missing);
        return fail(`Completa el campo «${missing.dataset.label}».`, missing);
      }
      const email = form.elements.email;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) { e.preventDefault(); return fail('Revisa tu correo: parece que no está bien escrito.', email); }
      if (fileInput) {
        const f = fileInput.files[0];
        if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') { e.preventDefault(); return fail('El currículum tiene que estar en PDF.', fileInput); }
        if (f.size > MAX_CV_MB * 1048576) { e.preventDefault(); return fail(`El PDF ocupa demasiado: el máximo son ${MAX_CV_MB} MB.`, fileInput); }
      }
      const btn = $('button[type="submit"]', form);
      btn.disabled = true;
      btn.innerHTML = '<i class="ti ti-loader-2" aria-hidden="true"></i> Enviando…';
      return true;
    });

    dialogs[kind] = dlg;
    return dlg;
  };

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-open]');
    if (!trigger || typeof HTMLDialogElement === 'undefined') return; // sin soporte: se usa el enlace mailto de siempre
    const kind = trigger.dataset.open;
    if (!templates[kind]) return;
    e.preventDefault();
    const dlg = getDialog(kind);
    if (kind === 'cv') {
      const puesto = trigger.dataset.position || 'Candidatura espontánea';
      dlg.querySelector('[name="Puesto"]').value = puesto;
      dlg.querySelector('[name="_subject"]').value = `Nuevo currículum · ${puesto}`;
    }
    dlg.showModal();
  });

  /* ---- Enlaces directos a WhatsApp con mensaje predefinido ---- */
  $$('[data-wa]').forEach((a) => {
    a.setAttribute('href', waLink(a.dataset.wa));
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener');
  });
})();
