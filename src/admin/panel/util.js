/* ==========================================================================
   Panel de Grupo FAHE — utilidades comunes (window.P)
   ========================================================================== */
'use strict';

window.P = (() => {
  const P = {};

  P.estado = {
    usuario: null,
    paginas: [],
    ajustes: [],
    roles: {},
    csrf: document.querySelector('meta[name="csrf"]')?.content || '',
    sucio: false,      // hay cambios sin guardar en la vista actual
    guardar: null,     // función de guardar de la vista actual (para Ctrl+S)
  };

  /* ------------------------------------------------------------- DOM */

  P.h = function h(tag, attrs, ...hijos) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'value') el.value = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
    for (const c of hijos.flat(Infinity)) {
      if (c === null || c === undefined || c === false || c === '') continue;
      el.append(c instanceof Node ? c : String(c));
    }
    return el;
  };
  const h = P.h;
  P.icono = (n) => h('i', { class: 'ti ' + n, 'aria-hidden': 'true' });
  const icono = P.icono;

  P.esAdmin = () => P.estado.usuario?.rol === 'admin';
  P.nombreCorto = (t) => String(t || '').split(' · ')[0];
  P.rutaPublica = (v) => (/^(https?:)?\/\//.test(v) ? v : '../' + String(v).replace(/^\//, ''));
  P.slugDe = (texto) => texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  P.iniciales = (nombre) => String(nombre || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

  /* ------------------------------------------------- fechas y tamaños */

  const aFecha = (s) => (s instanceof Date ? s : new Date(String(s).replace(' ', 'T')));
  P.fecha = (s) => {
    if (!s) return '—';
    const d = aFecha(s);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
      d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  };
  P.hace = (s) => {
    if (!s) return 'nunca';
    const d = aFecha(s);
    const seg = Math.round((Date.now() - d.getTime()) / 1000);
    if (seg < 60) return 'hace un momento';
    if (seg < 3600) return 'hace ' + Math.round(seg / 60) + ' min';
    if (seg < 86400) return 'hace ' + Math.round(seg / 3600) + ' h';
    const dias = Math.round(seg / 86400);
    if (dias === 1) return 'ayer';
    if (dias < 30) return 'hace ' + dias + ' días';
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  P.bytes = (n) => (n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1).replace('.', ',') + ' MB');

  /* ---------------------------------------------------------- API */

  P.api = async function api(accion, { metodo = 'GET', params = {}, cuerpo, form, reintento = false } = {}) {
    const url = new URL('api.php', location.href);
    url.searchParams.set('accion', accion);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    const init = { method: metodo, credentials: 'same-origin', headers: { 'X-CSRF-Token': P.estado.csrf } };
    if (cuerpo !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(cuerpo);
    }
    if (form) init.body = form;
    let r;
    try {
      r = await fetch(url, init);
    } catch {
      throw new Error('No hay conexión con el servidor. ¿Está Laragon en marcha?');
    }
    let datos;
    try { datos = await r.json(); } catch { datos = { error: 'Respuesta no válida del servidor (' + r.status + ').' }; }
    if (r.status === 401) {
      if (!P.estado.sucio) location.reload();
      throw new Error('La sesión ha caducado. Abre el panel en otra pestaña, entra y vuelve a pulsar Guardar aquí.');
    }
    if (r.status === 403 && !reintento && /Petición no válida/.test(datos.error || '')) {
      // El token cambia al volver a entrar (p. ej. en otra pestaña): se renueva y se repite una vez
      const e = await P.api('estado');
      P.estado.csrf = e.csrf || P.estado.csrf;
      return P.api(accion, { metodo, params, cuerpo, form, reintento: true });
    }
    if (!r.ok || datos.error) {
      const err = new Error(datos.error || 'Error ' + r.status);
      err.detalle = datos.detalle;
      throw err;
    }
    if (datos.csrf) P.estado.csrf = datos.csrf;
    if (Array.isArray(datos.paginas) && datos.paginas.length && 'protegida' in datos.paginas[0]) P.estado.paginas = datos.paginas;
    return datos;
  };

  /* ------------------------------------------------------- avisos */

  P.nota = function nota(texto, tipo = 'ok', extra) {
    const cerrar = () => el.remove();
    const el = h('div', { class: 'nota nota-' + tipo },
      icono(tipo === 'ok' ? 'ti-circle-check' : tipo === 'info' ? 'ti-info-circle' : 'ti-alert-triangle'),
      h('div', { class: 'nota-texto' }, h('p', {}, texto),
        extra instanceof Node ? extra : extra ? h('details', {}, h('summary', {}, 'Ver detalle técnico'), h('pre', {}, extra)) : null),
      h('button', { type: 'button', class: 'btn-icono', 'aria-label': 'Cerrar aviso', onclick: cerrar }, icono('ti-x')));
    document.getElementById('notas').append(el);
    if (tipo !== 'error') setTimeout(cerrar, 6000);
  };
  P.fallo = (e) => P.nota(e.message, 'error', e.detalle);

  /* ------------------------------------------------------ ventanas */

  /**
   * Ventana modal. botones: [{ texto, icono, clase, valor, accion }]
   * accion(form, dlg) puede devolver un texto de error (se queda abierta) o nada (se cierra).
   * Devuelve una promesa con el valor del botón pulsado (o null si se cierra).
   */
  P.modal = function modal({ titulo, contenido, botones = [], ancho = 'normal', alAbrir }) {
    return new Promise((resolver) => {
      const error = h('p', { class: 'aviso aviso-error', hidden: true, role: 'alert' });
      const form = h('form', { method: 'dialog', class: 'modal-form', novalidate: true });
      const pie = h('div', { class: 'modal-botones' });
      let valor = null;
      const dlg = h('dialog', { class: 'modal modal-' + ancho },
        h('div', { class: 'modal-cab' }, h('h2', {}, titulo),
          h('button', { type: 'button', class: 'btn-icono', 'aria-label': 'Cerrar', onclick: () => dlg.close() }, icono('ti-x'))),
        form);
      form.append(h('div', { class: 'modal-cuerpo' }, contenido), error, pie);
      for (const b of botones) {
        const boton = h('button', {
          type: b.enviar ? 'submit' : 'button',
          class: 'btn ' + (b.clase || 'btn-fino'),
          onclick: b.enviar ? null : async () => {
            if (b.accion) {
              const r = await b.accion(form, dlg);
              if (typeof r === 'string') { error.textContent = r; error.hidden = false; return; }
            }
            valor = b.valor ?? null;
            dlg.close();
          },
        }, b.icono ? icono(b.icono) : null, b.texto);
        if (b.enviar) {
          form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!form.reportValidity()) return;
            error.hidden = true;
            boton.disabled = true;
            try {
              const r = b.accion ? await b.accion(form, dlg) : undefined;
              if (typeof r === 'string') { error.textContent = r; error.hidden = false; return; }
              valor = r === undefined ? (b.valor ?? true) : r;
              dlg.close();
            } catch (err) {
              error.textContent = err.message;
              error.hidden = false;
            } finally {
              boton.disabled = false;
            }
          });
        }
        pie.append(boton);
      }
      dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
      dlg.addEventListener('close', () => { dlg.remove(); resolver(valor); });
      document.body.append(dlg);
      dlg.showModal();
      if (alAbrir) alAbrir(form, dlg);
      else form.querySelector('input:not([type=hidden]), select, textarea')?.focus();
    });
  };

  P.confirmar = (texto, { titulo = '¿Seguro?', boton = 'Sí', peligro = false } = {}) => P.modal({
    titulo,
    contenido: h('p', { class: 'modal-texto' }, texto),
    ancho: 'estrecho',
    botones: [
      { texto: 'Cancelar', valor: false },
      { texto: boton, clase: peligro ? 'btn-peligro' : 'btn-oro', valor: true, icono: peligro ? 'ti-trash' : 'ti-check' },
    ],
    alAbrir: (form) => form.querySelector('.modal-botones .btn:last-child')?.focus(),
  }).then((v) => v === true);

  /** Campo de formulario con etiqueta, para las ventanas. */
  P.campoForm = ({ name, label, type = 'text', value = '', required = false, hint, opciones, ...resto }) => {
    const id = 'm-' + name + '-' + Math.random().toString(36).slice(2, 7);
    let control;
    if (type === 'select') {
      control = h('select', { id, name, required }, opciones.map(([v, t]) => h('option', { value: v, selected: String(v) === String(value) }, t)));
    } else if (type === 'checkbox') {
      return h('label', { class: 'interruptor' }, h('input', { type: 'checkbox', name, checked: !!value }), h('span', { class: 'interruptor-pista', 'aria-hidden': 'true' }), h('span', {}, label));
    } else {
      control = h('input', { id, name, type, value, required, ...resto });
    }
    return h('div', { class: 'campo' }, h('label', { for: id }, label, required ? h('span', { class: 'req' }, ' *') : null), control, hint ? h('p', { class: 'ayuda' }, hint) : null);
  };

  /* ----------------------------------------------- piezas de vistas */

  /** Cabecera de cada pantalla: migas, título, subtítulo y botones. */
  P.cabecera = ({ migas = [], titulo, subtitulo, acciones = [] }) => h('header', { class: 'vista-cab' },
    h('div', { class: 'vista-titulos' },
      migas.length ? h('nav', { class: 'migas', 'aria-label': 'Estás en' }, migas.map((m, i) => [i ? icono('ti-chevron-right') : null, h('a', { href: m.href }, m.texto)])) : null,
      h('h1', {}, titulo),
      subtitulo ? h('p', { class: 'vista-sub' }, subtitulo) : null),
    acciones.length ? h('div', { class: 'vista-acciones' }, acciones) : null);

  P.tarjeta = (titulo, contenido, extra) => h('section', { class: 'tarjeta' },
    titulo ? h('div', { class: 'tarjeta-cab' }, h('h2', {}, titulo), extra || null) : null, contenido);

  P.vacio = (ic, texto, accion) => h('div', { class: 'vacio' }, icono(ic), h('p', {}, texto), accion || null);

  P.pill = (texto, tipo = 'neutro') => h('span', { class: 'pill pill-' + tipo }, texto);

  P.cargando = () => h('p', { class: 'cargando' }, icono('ti-loader-2 girar'), ' Cargando…');

  /** Botón de acción solo con icono (con título y etiqueta accesible). */
  P.botonIcono = (ic, titulo, onclick, clase = '') => h('button', { type: 'button', class: 'btn-icono ' + clase, title: titulo, 'aria-label': titulo, onclick }, icono(ic));
  P.enlaceIcono = (ic, titulo, href, nueva = false) => h('a', { class: 'btn-icono', href, title: titulo, 'aria-label': titulo, target: nueva ? '_blank' : null, rel: nueva ? 'noopener' : null }, icono(ic));

  const ACCIONES = {
    guardar: ['Guardar', 'azul'], crear: ['Crear', 'verde'], duplicar: ['Duplicar', 'verde'], borrar: ['Borrar', 'rojo'],
    restaurar: ['Restaurar', 'oro'], 'subir foto': ['Subir foto', 'verde'], 'borrar foto': ['Borrar foto', 'rojo'],
    'crear usuario': ['Nuevo usuario', 'verde'], 'editar usuario': ['Editar usuario', 'azul'], 'borrar usuario': ['Borrar usuario', 'rojo'],
    'cambiar contraseña': ['Contraseña', 'oro'], entrar: ['Entrada', 'neutro'], salir: ['Salida', 'neutro'], 'acceso fallido': ['Acceso fallido', 'rojo'],
  };
  P.pillAccion = (accion) => {
    const [t, c] = ACCIONES[accion] || [accion, 'neutro'];
    return P.pill(t, c);
  };

  return P;
})();
