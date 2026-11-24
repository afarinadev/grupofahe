/* ==========================================================================
   Panel de administración de Grupo FAHE — editor
   Construye los formularios a partir de esquema.json (los mismos campos y
   bloques que usan las plantillas) y guarda a través de api.php.
   ========================================================================== */
'use strict';

(() => {
  const lateral = document.getElementById('lateral');
  const editor = document.getElementById('editor');
  const notas = document.getElementById('notas');
  let CSRF = document.querySelector('meta[name="csrf"]').content;

  let esquema = null;      // esquema.json
  let estado = null;       // { usuario, paginas, ajustes }
  let actual = null;       // { tipo, id, datos, campos }
  let sucio = false;       // hay cambios sin guardar
  let guardando = false;
  let errores = [];        // errores de validación del último intento de guardar
  let hashActual = '';
  const abiertos = new Map(); // ruta → abierto/cerrado de cada bloque desplegable

  /* ------------------------------------------------------------ utilidades */

  function h(tag, attrs, ...hijos) {
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
  }
  const icono = (n) => h('i', { class: 'ti ' + n, 'aria-hidden': 'true' });
  const ayuda = (t) => h('p', { class: 'ayuda' }, t);
  const clonar = (o) => (o === undefined ? o : JSON.parse(JSON.stringify(o)));
  const nombreCorto = (p) => (p.titulo || p.slug).split(' · ')[0];
  const sinParentesis = (t) => t.replace(/\s*\(.*\)\s*$/, '');
  const rutaPublica = (v) => (/^(https?:)?\/\//.test(v) ? v : '../' + String(v).replace(/^\//, ''));

  function slugDe(texto) {
    return texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  }

  function singular(label) {
    return label.toLowerCase().replace(/^(\S+?)(es|s)\b/, (m, raiz, fin) => (fin === 'es' && /[lnrd]$/.test(raiz) ? raiz : raiz + (fin === 'es' ? 'e' : '')));
  }

  async function api(accion, { metodo = 'GET', params = {}, cuerpo, form, reintento = false } = {}) {
    const url = new URL('api.php', location.href);
    url.searchParams.set('accion', accion);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const init = { method: metodo, credentials: 'same-origin', headers: { 'X-CSRF-Token': CSRF } };
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
      if (!sucio) location.reload();
      throw new Error('La sesión ha caducado. Abre el panel en otra pestaña, entra y vuelve a pulsar Guardar aquí.');
    }
    if (r.status === 403 && !reintento) {
      // El token cambia al volver a entrar (p. ej. en otra pestaña): se renueva y se repite una vez
      const e = await api('estado');
      CSRF = e.csrf || CSRF;
      return api(accion, { metodo, params, cuerpo, form, reintento: true });
    }
    if (!r.ok || datos.error) {
      const err = new Error(datos.error || 'Error ' + r.status);
      err.detalle = datos.detalle;
      throw err;
    }
    if (datos.csrf) CSRF = datos.csrf;
    return datos;
  }

  function nota(texto, tipo = 'ok', extra) {
    const cerrar = () => el.remove();
    const el = h('div', { class: 'nota nota-' + tipo },
      icono(tipo === 'ok' ? 'ti-circle-check' : 'ti-alert-triangle'),
      h('div', { class: 'nota-texto' }, h('p', {}, texto),
        extra instanceof Node ? extra : extra ? h('details', {}, h('summary', {}, 'Ver detalle técnico'), h('pre', {}, extra)) : null),
      h('button', { type: 'button', class: 'btn-icono', 'aria-label': 'Cerrar aviso', onclick: cerrar }, icono('ti-x')));
    notas.append(el);
    if (tipo === 'ok') setTimeout(cerrar, 6000);
  }

  function marcarSucio() {
    if (!sucio) {
      sucio = true;
      actualizarBotonGuardar();
    }
  }

  function actualizarBotonGuardar() {
    const b = document.getElementById('guardar');
    if (!b) return;
    b.disabled = !sucio || guardando;
    b.replaceChildren(...(guardando ? [icono('ti-loader-2 girar'), ' Guardando…'] : [icono('ti-device-floppy'), sucio ? ' Guardar cambios' : ' Guardado']));
    document.body.classList.toggle('con-cambios', sucio);
  }

  /* ------------------------------------------- rutas de los desplegables */

  // Al mover, duplicar o quitar elementos de una lista, los índices cambian:
  // se recolocan las rutas guardadas para que lo abierto siga abierto.
  function recolocarRutas(base, cambio) {
    const prefijo = base + '.';
    const nuevo = new Map();
    for (const [k, v] of abiertos) {
      const m = k.startsWith(prefijo) ? k.slice(prefijo.length).match(/^(\d+)(.*)$/) : null;
      if (!m) { nuevo.set(k, v); continue; }
      const n = cambio(+m[1]);
      if (n !== null) nuevo.set(prefijo + n + m[2], v);
    }
    abiertos.clear();
    for (const [k, v] of nuevo) abiertos.set(k, v);
  }

  function abrirHasta(ruta) {
    const partes = ruta.split('.');
    for (let i = 1; i <= partes.length; i++) abiertos.set(partes.slice(0, i).join('.'), true);
  }

  function detalles(ruta, porDefecto, clase, ...cabecera) {
    const el = h('details', { class: 'bloque ' + clase, 'data-ruta': ruta, open: abiertos.has(ruta) ? abiertos.get(ruta) : porDefecto });
    el.addEventListener('toggle', () => abiertos.set(ruta, el.open));
    const cuerpo = h('div', { class: 'bloque-cuerpo' });
    el.append(h('summary', {}, icono('ti-chevron-right flecha'), ...cabecera), cuerpo);
    return { el, cuerpo };
  }

  /* ------------------------------------------------------------- campos */

  function poner(padre, clave, v, c) {
    if (Array.isArray(padre)) padre[clave] = v ?? '';
    else if (v === undefined || v === null || (v === '' && c.required === false) || (v === false && (c.widget === 'boolean') && !c.default)) delete padre[clave];
    else padre[clave] = v;
    marcarSucio();
  }

  function campo(c, padre, clave, ruta) {
    const w = c.widget || 'string';
    if (w === 'hidden') return null;
    if (w === 'object') return campoObjeto(c, padre, clave, ruta);
    if (w === 'list') return campoLista(c, padre, clave, ruta);

    const id = 'f-' + ruta.replace(/[^\w]+/g, '-');
    const cont = h('div', { class: 'campo campo-' + w, 'data-ruta': ruta });
    const valor = padre[clave];

    if (w === 'boolean') {
      const marcado = valor === undefined ? !!c.default : !!valor;
      cont.append(h('label', { class: 'interruptor' },
        h('input', { type: 'checkbox', id, checked: marcado, onchange: (e) => poner(padre, clave, e.target.checked, c) }),
        h('span', { class: 'interruptor-pista', 'aria-hidden': 'true' }),
        h('span', {}, c.label)));
      if (c.hint) cont.append(ayuda(c.hint));
      return cont;
    }

    const obligatorio = c.required !== false && !(w === 'select' && c.default !== undefined);
    cont.append(h('label', { for: id }, c.label, obligatorio ? h('span', { class: 'req', title: 'Obligatorio' }, ' *') : null));

    let control;
    if (w === 'text') {
      control = h('textarea', { id, rows: 2, value: valor ?? '', oninput: (e) => { poner(padre, clave, e.target.value, c); autoAlto(e.target); } });
    } else if (w === 'markdown') {
      control = h('textarea', { id, rows: 20, class: 'mono', value: valor ?? '', oninput: (e) => poner(padre, clave, e.target.value, c) });
      cont.append(ayuda('Formato: «## Título», «**negrita**», «- elemento de lista», «[texto](enlace)». Deja una línea en blanco entre párrafos.'));
    } else if (w === 'number') {
      control = h('input', {
        id, type: 'number', inputmode: c.value_type === 'float' ? 'decimal' : 'numeric', min: c.min, max: c.max,
        step: c.step ?? (c.value_type === 'float' ? 'any' : 1), value: valor ?? '',
        oninput: (e) => {
          const t = e.target.value;
          poner(padre, clave, t === '' ? undefined : (c.value_type === 'float' ? parseFloat(t) : parseInt(t, 10)), c);
        },
      });
    } else if (w === 'select') {
      control = selector(c, padre, clave, id);
    } else if (w === 'image') {
      control = imagen(c, padre, clave, id);
    } else {
      const soloLectura = actual.tipo === 'pagina' && ruta === 'slug';
      const entrada = h('input', {
        id, type: 'text', value: valor ?? '', readonly: soloLectura, spellcheck: /enlace|icono|slug|whatsapp|correo|url/.test(c.name) ? 'false' : null,
        oninput: (e) => { poner(padre, clave, e.target.value, c); if (vista) vista.className = 'ti ' + e.target.value.trim(); },
      });
      const esIcono = /^icono/.test(c.name);
      const vista = esIcono ? h('i', { class: 'ti ' + (valor || ''), 'aria-hidden': 'true' }) : null;
      control = esIcono ? h('div', { class: 'con-icono' }, h('span', { class: 'icono-vista' }, vista), entrada) : entrada;
    }
    cont.append(control);
    if (c.hint) cont.append(ayuda(c.hint));
    return cont;
  }

  function selector(c, padre, clave, id) {
    const ops = c.options.map((o) => (typeof o === 'object' ? o : { label: String(o), value: o }));
    let valor = padre[clave];
    if (valor === undefined && c.default !== undefined) valor = c.default;
    const desconocido = valor !== undefined && !ops.some((o) => o.value === valor);
    return h('select', {
      id,
      onchange: (e) => {
        const i = e.target.value;
        if (i === 'x') return;
        poner(padre, clave, i === '' ? undefined : ops[+i].value, c);
      },
    },
    valor === undefined || c.required === false ? h('option', { value: '' }, '—') : null,
    ops.map((o, i) => h('option', { value: String(i), selected: o.value === valor }, o.label)),
    desconocido ? h('option', { value: 'x', selected: true }, String(valor)) : null);
  }

  function imagen(c, padre, clave, id) {
    const vista = h('img', { class: 'imagen-vista', alt: '' });
    const actualizar = () => {
      const v = padre[clave];
      vista.hidden = !v;
      if (v) vista.src = rutaPublica(v);
    };
    vista.addEventListener('error', () => { vista.hidden = true; });
    const entrada = h('input', {
      id, type: 'text', value: padre[clave] ?? '', placeholder: 'assets/img/…', spellcheck: 'false',
      oninput: (e) => { poner(padre, clave, e.target.value.trim(), c); actualizar(); },
    });
    const boton = h('button', { type: 'button', class: 'btn btn-fino', onclick: () => archivo.click() }, icono('ti-upload'), ' Subir foto');
    const archivo = h('input', {
      type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif', hidden: true,
      onchange: async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        boton.disabled = true;
        boton.replaceChildren(icono('ti-loader-2 girar'), ' Subiendo…');
        try {
          const fd = new FormData();
          fd.append('archivo', f);
          const r = await api('subir', { metodo: 'POST', form: fd });
          entrada.value = r.ruta;
          poner(padre, clave, r.ruta, c);
          actualizar();
          nota('Foto subida. Pulsa «Guardar cambios» para usarla en la web.');
        } catch (err) {
          nota(err.message, 'error', err.detalle);
        } finally {
          boton.disabled = false;
          boton.replaceChildren(icono('ti-upload'), ' Subir foto');
          e.target.value = '';
        }
      },
    });
    actualizar();
    return h('div', { class: 'imagen' }, h('div', { class: 'imagen-marco' }, vista, icono('ti-photo')), h('div', { class: 'imagen-ctrl' }, entrada, boton, archivo));
  }

  function campoObjeto(c, padre, clave, ruta) {
    let valor = padre[clave];
    const opcional = c.required === false;
    if ((valor === undefined || valor === null) && !opcional) valor = padre[clave] = {};
    if (valor === undefined || valor === null) {
      return h('div', { class: 'campo campo-vacio', 'data-ruta': ruta },
        h('span', {}, c.label),
        h('button', {
          type: 'button', class: 'btn btn-fino',
          onclick: () => { padre[clave] = nuevoElemento(c.fields); abiertos.set(ruta, true); marcarSucio(); renderEditor(); },
        }, icono('ti-plus'), ' Añadir'));
    }
    const quitar = opcional ? h('button', {
      type: 'button', class: 'btn-icono peligro', title: 'Quitar', 'aria-label': 'Quitar ' + c.label,
      onclick: (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        if (!confirm('¿Quitar «' + c.label + '» y todo lo que contiene?')) return;
        delete padre[clave]; marcarSucio(); renderEditor();
      },
    }, icono('ti-trash')) : null;
    const d = detalles(ruta, !c.collapsed, 'objeto', h('span', { class: 'bloque-titulo' }, c.label), quitar ? h('span', { class: 'item-botones' }, quitar) : null);
    d.cuerpo.append(...c.fields.map((f) => campo(f, valor, f.name, ruta + '.' + f.name)).filter(Boolean));
    return d.el;
  }

  function nuevoElemento(campos, tipo) {
    const o = tipo ? { type: tipo } : {};
    for (const f of campos) {
      if (f.default !== undefined && f.widget !== 'boolean') o[f.name] = clonar(f.default);
      else if (f.widget === 'object' && f.required !== false) o[f.name] = nuevoElemento(f.fields);
      else if (f.widget === 'list' && f.required !== false) o[f.name] = [];
    }
    return o;
  }

  function textoResumen(plantilla, item) {
    if (!plantilla || !item || typeof item !== 'object') return '';
    const t = plantilla.replace(/\{\{fields\.(\w+)\}\}/g, (_, k) => (item[k] ?? '').toString())
      .replace(/\s+/g, ' ').replace(/^[\s·→]+|[\s·→]+$/g, '').replace(/·\s*·/g, '·').trim();
    return t.length > 70 ? t.slice(0, 68) + '…' : t;
  }

  function campoLista(c, padre, clave, ruta) {
    const items = Array.isArray(padre[clave]) ? padre[clave] : [];
    const asegurar = () => (Array.isArray(padre[clave]) ? padre[clave] : (padre[clave] = []));
    const cont = h('div', { class: 'campo campo-lista' + (c.types ? ' es-secciones' : ''), 'data-ruta': ruta });
    cont.append(h('div', { class: 'lista-cab' },
      h('span', { class: 'lista-titulo' }, c.label, c.required !== false ? h('span', { class: 'req' }, ' *') : null),
      items.length ? h('span', { class: 'contador' }, String(items.length)) : null));
    if (c.hint) cont.append(ayuda(c.hint));

    const ol = h('ol', { class: 'lista' });
    items.forEach((_, i) => ol.append(elementoLista(c, items, i, ruta)));
    cont.append(ol);

    const anadir = (nuevo) => {
      const arr = asegurar();
      arr.push(nuevo);
      abiertos.set(ruta + '.' + (arr.length - 1), true);
      marcarSucio();
      renderEditor();
      const el = editor.querySelector(`[data-ruta="${ruta}.${arr.length - 1}"]`);
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el.querySelector('input, textarea, select')?.focus({ preventScroll: true });
      }
    };
    if (c.types) {
      const sel = h('select', { 'aria-label': 'Tipo de sección a añadir' }, c.types.map((t, i) => h('option', { value: String(i) }, t.label)));
      cont.append(h('div', { class: 'lista-anadir' }, sel,
        h('button', { type: 'button', class: 'btn btn-fino', onclick: () => { const t = c.types[+sel.value]; anadir(nuevoElemento(t.fields, t.name)); } },
          icono('ti-plus'), ' Añadir sección')));
    } else {
      const nombre = c.label_singular || (c.field ? c.field.label.toLowerCase() : singular(c.label));
      cont.append(h('div', { class: 'lista-anadir' },
        h('button', { type: 'button', class: 'btn btn-fino', onclick: () => anadir(c.fields ? nuevoElemento(c.fields) : '') },
          icono('ti-plus'), ' Añadir ' + nombre)));
    }
    return cont;
  }

  function elementoLista(c, arr, i, base) {
    const ruta = base + '.' + i;
    const item = arr[i];
    const parar = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
    const mover = (d) => (ev) => {
      parar(ev);
      const j = i + d;
      if (j < 0 || j >= arr.length) return;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      recolocarRutas(base, (n) => (n === i ? j : n === j ? i : n));
      marcarSucio(); renderEditor();
    };
    const botones = h('span', { class: 'item-botones' },
      h('button', { type: 'button', class: 'btn-icono', title: 'Subir', 'aria-label': 'Subir', disabled: i === 0, onclick: mover(-1) }, icono('ti-arrow-up')),
      h('button', { type: 'button', class: 'btn-icono', title: 'Bajar', 'aria-label': 'Bajar', disabled: i === arr.length - 1, onclick: mover(1) }, icono('ti-arrow-down')),
      c.field ? null : h('button', {
        type: 'button', class: 'btn-icono', title: 'Duplicar', 'aria-label': 'Duplicar',
        onclick: (ev) => {
          parar(ev);
          arr.splice(i + 1, 0, clonar(item));
          recolocarRutas(base, (n) => (n > i ? n + 1 : n));
          abiertos.set(base + '.' + (i + 1), true);
          marcarSucio(); renderEditor();
        },
      }, icono('ti-copy')),
      h('button', {
        type: 'button', class: 'btn-icono peligro', title: 'Quitar', 'aria-label': 'Quitar',
        onclick: (ev) => {
          parar(ev);
          if (!confirm(c.types ? '¿Quitar esta sección de la página?' : '¿Quitar este elemento?')) return;
          arr.splice(i, 1);
          recolocarRutas(base, (n) => (n === i ? null : n > i ? n - 1 : n));
          marcarSucio(); renderEditor();
        },
      }, icono('ti-trash')));

    if (c.field) {
      const sub = { ...c.field, label: c.field.label + ' ' + (i + 1) };
      return h('li', { class: 'item-simple' }, campo(sub, arr, i, ruta), botones);
    }

    let campos = c.fields;
    let tipo = null;
    if (c.types) {
      tipo = c.types.find((t) => t.name === item?.type);
      if (!tipo) return h('li', {}, h('div', { class: 'bloque item' }, 'Bloque desconocido: ' + (item?.type ?? '?'), botones));
      campos = tipo.fields;
    }
    const resumen = textoResumen(tipo ? tipo.summary : c.summary, item);
    const d = detalles(ruta, false, 'item',
      h('span', { class: 'item-num' }, String(i + 1)),
      h('span', { class: 'item-texto' },
        tipo ? h('b', {}, sinParentesis(tipo.label)) : null,
        resumen ? h('span', {}, resumen) : (tipo ? null : h('span', { class: 'tenue' }, '(vacío)'))),
      botones);
    d.cuerpo.append(...campos.map((f) => campo(f, item, f.name, ruta + '.' + f.name)).filter(Boolean));
    return h('li', {}, d.el);
  }

  function autoAlto(t) {
    t.style.height = 'auto';
    t.style.height = Math.min(t.scrollHeight + 2, 480) + 'px';
  }

  /* ---------------------------------------------------------- validación */

  function validar(campos, datos, ruta, etiquetas, lista) {
    for (const c of campos) {
      const w = c.widget || 'string';
      const v = datos ? datos[c.name] : undefined;
      const r = ruta ? ruta + '.' + c.name : c.name;
      const et = [...etiquetas, c.label];
      const falta = (texto) => lista.push({ ruta: r, texto: et.join(' › ') + ': ' + texto });
      if (w === 'hidden' || w === 'boolean') continue;
      if (w === 'object') {
        if (v && typeof v === 'object') validar(c.fields, v, r, et, lista);
        else if (c.required !== false) falta('falta');
        continue;
      }
      if (w === 'list') {
        if (!Array.isArray(v)) { if (c.required !== false) falta('falta'); continue; }
        v.forEach((it, i) => {
          if (c.types) {
            const t = c.types.find((t) => t.name === it?.type);
            if (t) validar(t.fields, it, r + '.' + i, [...et, (i + 1) + '. ' + sinParentesis(t.label)], lista);
          } else if (c.fields) {
            validar(c.fields, it, r + '.' + i, [...et, String(i + 1)], lista);
          } else if (c.field && (it === '' || it === null || it === undefined)) {
            lista.push({ ruta: r + '.' + i, texto: [...et, String(i + 1)].join(' › ') + ': está vacío' });
          }
        });
        continue;
      }
      if (v === undefined || v === null || v === '') {
        if (c.required !== false && !(w === 'select' && c.default !== undefined)) falta('es obligatorio');
        continue;
      }
      if (c.pattern && typeof v === 'string' && !new RegExp(c.pattern[0]).test(v)) falta(c.pattern[1]);
      if (w === 'number' && typeof v === 'number' && ((c.min != null && v < c.min) || (c.max != null && v > c.max))) {
        falta(`tiene que estar entre ${c.min} y ${c.max}`);
      }
    }
  }

  function irAError(ruta) {
    abrirHasta(ruta);
    renderEditor();
    const el = editor.querySelector(`[data-ruta="${CSS.escape(ruta)}"]`);
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.querySelector('input, textarea, select')?.focus({ preventScroll: true });
    }
  }

  /* ------------------------------------------------------------- pantallas */

  function renderLateral() {
    const enlace = (tipo, id, ...contenido) => {
      const activo = actual && actual.tipo === tipo && actual.id === id;
      return h('li', {}, h('a', { href: '#' + tipo + '/' + id, class: activo ? 'activo' : null, 'aria-current': activo ? 'page' : null }, ...contenido));
    };
    lateral.replaceChildren(
      h('div', { class: 'lat-grupo' },
        h('div', { class: 'lat-titulo' }, h('span', {}, 'Páginas'),
          h('button', { type: 'button', class: 'btn-icono', title: 'Nueva página', 'aria-label': 'Nueva página', onclick: abrirNueva }, icono('ti-plus'))),
        h('ul', {}, estado.paginas.map((p) => enlace('pagina', p.slug,
          icono(p.slug === 'index' ? 'ti-home' : 'ti-file-text'),
          h('span', { class: 'lat-texto' }, h('span', {}, nombreCorto(p)), h('small', {}, p.slug + '.html')))))),
      h('div', { class: 'lat-grupo' },
        h('div', { class: 'lat-titulo' }, h('span', {}, 'Ajustes generales')),
        h('ul', {}, esquema.ajustes.map((a) => enlace('ajuste', a.id,
          icono(a.id === 'sitio' ? 'ti-address-book' : 'ti-building'),
          h('span', { class: 'lat-texto' }, h('span', {}, a.label)))))));
  }

  function renderEditor() {
    if (!actual) return;
    const y = window.scrollY;
    const { tipo, id, datos, campos } = actual;
    const pagina = tipo === 'pagina' ? estado.paginas.find((p) => p.slug === id) : null;
    const titulo = pagina ? nombreCorto(pagina) : esquema.ajustes.find((a) => a.id === id).label;

    const cab = h('div', { class: 'editor-cab' },
      h('div', { class: 'editor-titulos' },
        h('p', { class: 'editor-tipo' }, pagina ? 'Página · ' + id + '.html' : 'Ajustes generales'),
        h('h1', {}, titulo)),
      h('div', { class: 'editor-acciones' },
        pagina ? h('a', { class: 'btn btn-fino', href: '../' + id + '.html', target: '_blank', rel: 'noopener' }, icono('ti-eye'), h('span', {}, ' Ver')) : null,
        pagina && !pagina.protegida ? h('button', { type: 'button', class: 'btn btn-fino peligro', onclick: borrarPagina }, icono('ti-trash'), h('span', {}, ' Borrar')) : null,
        h('button', { type: 'button', class: 'btn btn-oro', id: 'guardar', onclick: guardar })));

    const caja = errores.length ? h('div', { class: 'aviso aviso-error errores', role: 'alert' },
      h('p', {}, icono('ti-alert-circle'), ' Revisa ' + (errores.length === 1 ? 'este campo' : 'estos campos') + ' antes de guardar:'),
      h('ul', {}, errores.slice(0, 10).map((e) => h('li', {}, h('button', { type: 'button', class: 'enlace', onclick: () => irAError(e.ruta) }, e.texto)))),
      errores.length > 10 ? h('p', {}, '…y ' + (errores.length - 10) + ' más.') : null) : null;

    const form = h('form', { class: 'formulario', novalidate: true, onsubmit: (e) => { e.preventDefault(); guardar(); } },
      campos.map((c) => campo(c, datos, c.name, c.name)).filter(Boolean));

    editor.replaceChildren(cab, caja || '', form);
    for (const e of errores) editor.querySelector(`[data-ruta="${CSS.escape(e.ruta)}"]`)?.classList.add('con-error');
    editor.querySelectorAll('textarea:not(.mono)').forEach(autoAlto);
    actualizarBotonGuardar();
    window.scrollTo(0, y);
  }

  async function abrir(tipo, id) {
    editor.replaceChildren(h('p', { class: 'cargando' }, icono('ti-loader-2 girar'), ' Cargando…'));
    try {
      const { datos } = await api('leer', { params: { tipo, id } });
      const campos = tipo === 'pagina' ? esquema.paginas.fields : esquema.ajustes.find((a) => a.id === id).fields;
      actual = { tipo, id, datos, campos };
    } catch (e) {
      editor.replaceChildren(h('p', { class: 'aviso aviso-error' }, e.message));
      return;
    }
    abiertos.clear();
    errores = [];
    sucio = false;
    hashActual = '#' + tipo + '/' + id;
    if (location.hash !== hashActual) history.replaceState(null, '', hashActual);
    document.body.classList.remove('lateral-abierto');
    renderLateral();
    renderEditor();
    window.scrollTo(0, 0);
  }

  async function cargarDesdeHash() {
    const [tipo, id] = decodeURIComponent(location.hash.slice(1)).split('/');
    if (tipo === 'pagina' && estado.paginas.some((p) => p.slug === id)) return abrir('pagina', id);
    if (tipo === 'ajuste' && esquema.ajustes.some((a) => a.id === id)) return abrir('ajuste', id);
    return abrir('pagina', estado.paginas[0]?.slug || 'index');
  }

  /* ------------------------------------------------------------- acciones */

  async function guardar() {
    if (!actual || guardando || !sucio) return;
    errores = [];
    validar(actual.campos, actual.datos, '', [], errores);
    if (errores.length) {
      irAError(errores[0].ruta);
      return;
    }
    guardando = true;
    actualizarBotonGuardar();
    try {
      const r = await api('guardar', { metodo: 'POST', cuerpo: { tipo: actual.tipo, id: actual.id, datos: actual.datos } });
      sucio = false;
      estado.paginas = r.paginas;
      renderLateral();
      renderEditor();
      nota(r.mensaje, 'ok', actual.tipo === 'pagina'
        ? h('a', { href: '../' + actual.id + '.html', target: '_blank', rel: 'noopener' }, 'Ver la página ', icono('ti-external-link'))
        : null);
    } catch (e) {
      nota(e.message, 'error', e.detalle);
    } finally {
      guardando = false;
      actualizarBotonGuardar();
    }
  }

  async function borrarPagina() {
    const p = estado.paginas.find((x) => x.slug === actual.id);
    if (!confirm(`¿Borrar la página «${nombreCorto(p)}» (${p.slug}.html)?\n\nDesaparecerá de la web. Revisa después si algún menú o botón enlazaba a ella.`)) return;
    try {
      const r = await api('borrar', { metodo: 'POST', cuerpo: { slug: p.slug } });
      estado.paginas = r.paginas;
      sucio = false;
      nota(r.mensaje);
      await abrir('pagina', 'index');
    } catch (e) {
      nota(e.message, 'error', e.detalle);
    }
  }

  const dlg = document.getElementById('dlg-nueva');
  const nTitulo = document.getElementById('nueva-titulo');
  const nSlug = document.getElementById('nueva-slug');
  const nError = document.getElementById('nueva-error');
  let slugTocado = false;

  function abrirNueva() {
    if (sucio && !confirm('Tienes cambios sin guardar en esta pantalla. ¿Descartarlos?')) return;
    nTitulo.value = '';
    nSlug.value = '';
    nError.hidden = true;
    slugTocado = false;
    dlg.showModal();
    nTitulo.focus();
  }
  nTitulo.addEventListener('input', () => { if (!slugTocado) nSlug.value = slugDe(nTitulo.value); });
  nSlug.addEventListener('input', () => { slugTocado = true; });
  dlg.querySelector('[data-cerrar]').addEventListener('click', () => dlg.close());
  document.getElementById('form-nueva').addEventListener('submit', async (e) => {
    e.preventDefault();
    const boton = e.submitter || dlg.querySelector('[type=submit]');
    boton.disabled = true;
    nError.hidden = true;
    try {
      const slug = nSlug.value.trim();
      const r = await api('crear', { metodo: 'POST', cuerpo: { slug, titulo: nTitulo.value.trim() } });
      estado.paginas = r.paginas;
      sucio = false;
      dlg.close();
      nota(r.mensaje + ' Añade y rellena sus secciones y guarda.');
      await abrir('pagina', slug);
    } catch (err) {
      nError.textContent = err.message;
      nError.hidden = false;
    } finally {
      boton.disabled = false;
    }
  });

  document.getElementById('salir').addEventListener('click', async () => {
    if (sucio && !confirm('Tienes cambios sin guardar. ¿Salir de todas formas?')) return;
    sucio = false;
    try { await api('salir', { metodo: 'POST' }); } catch { /* da igual: se recarga */ }
    location.reload();
  });

  document.querySelector('.menu-movil').addEventListener('click', (e) => {
    const abierto = document.body.classList.toggle('lateral-abierto');
    e.currentTarget.setAttribute('aria-expanded', String(abierto));
  });

  window.addEventListener('hashchange', () => {
    if (location.hash === hashActual) return;
    if (sucio && !confirm('Tienes cambios sin guardar. ¿Salir sin guardar?')) {
      history.replaceState(null, '', hashActual);
      return;
    }
    cargarDesdeHash();
  });

  window.addEventListener('beforeunload', (e) => {
    if (sucio) { e.preventDefault(); e.returnValue = ''; }
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      guardar();
    }
  });

  // Mantiene viva la sesión mientras el panel está abierto
  setInterval(() => { api('estado').catch(() => {}); }, 5 * 60 * 1000);

  /* --------------------------------------------------------------- inicio */

  (async () => {
    try {
      const [e, s] = await Promise.all([
        fetch('esquema.json', { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error('falta esquema.json'); return r.json(); }),
        api('estado'),
      ]);
      esquema = e;
      estado = s;
    } catch (err) {
      editor.replaceChildren(h('p', { class: 'aviso aviso-error' }, 'No se pudo cargar el panel: ' + err.message));
      return;
    }
    renderLateral();
    await cargarDesdeHash();
  })();
})();
