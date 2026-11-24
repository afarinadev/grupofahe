/* ==========================================================================
   Panel de Grupo FAHE — editor de formularios
   Construye el formulario a partir de esquema.json (los mismos campos y
   bloques que usan las plantillas de la web).

   const ed = P.crearEditor({ tipo, datos, campos, alCambiar });
   contenedor.append(ed.el);  ed.validar() → [errores];  ed.irA(ruta)
   ========================================================================== */
'use strict';

(() => {
  const { h, icono } = P;
  const clonar = (o) => (o === undefined ? o : JSON.parse(JSON.stringify(o)));
  const sinParentesis = (t) => t.replace(/\s*\(.*\)\s*$/, '');

  function singular(label) {
    return label.toLowerCase().replace(/^(\S+?)(es|s)\b/, (m, raiz, fin) => (fin === 'es' && /[lnrd]$/.test(raiz) ? raiz : raiz + (fin === 'es' ? 'e' : '')));
  }

  function textoResumen(plantilla, item) {
    if (!plantilla || !item || typeof item !== 'object') return '';
    const t = plantilla.replace(/\{\{fields\.(\w+)\}\}/g, (_, k) => (item[k] ?? '').toString())
      .replace(/\s+/g, ' ').replace(/^[\s·→]+|[\s·→]+$/g, '').replace(/·\s*·/g, '·').trim();
    return t.length > 70 ? t.slice(0, 68) + '…' : t;
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

  function autoAlto(t) {
    t.style.height = 'auto';
    t.style.height = Math.min(t.scrollHeight + 2, 480) + 'px';
  }

  /* ------------------------------------------------- validación */

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

  /* ------------------------------------------------------- editor */

  P.crearEditor = function crearEditor({ tipo, datos, campos, alCambiar }) {
    const el = h('div', { class: 'editor' });
    const abiertos = new Map(); // ruta → abierto/cerrado de cada desplegable
    let errores = [];

    const cambio = () => alCambiar && alCambiar();

    function recolocarRutas(base, fn) {
      const prefijo = base + '.';
      const nuevo = new Map();
      for (const [k, v] of abiertos) {
        const m = k.startsWith(prefijo) ? k.slice(prefijo.length).match(/^(\d+)(.*)$/) : null;
        if (!m) { nuevo.set(k, v); continue; }
        const n = fn(+m[1]);
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
      const d = h('details', { class: 'bloque ' + clase, 'data-ruta': ruta, open: abiertos.has(ruta) ? abiertos.get(ruta) : porDefecto });
      d.addEventListener('toggle', () => abiertos.set(ruta, d.open));
      const cuerpo = h('div', { class: 'bloque-cuerpo' });
      d.append(h('summary', {}, icono('ti-chevron-right flecha'), ...cabecera), cuerpo);
      return { el: d, cuerpo };
    }

    function poner(padre, clave, v, c) {
      if (Array.isArray(padre)) padre[clave] = v ?? '';
      else if (v === undefined || v === null || (v === '' && c.required === false) || (v === false && c.widget === 'boolean' && !c.default)) delete padre[clave];
      else padre[clave] = v;
      cambio();
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
        if (c.hint) cont.append(h('p', { class: 'ayuda' }, c.hint));
        return cont;
      }

      const obligatorio = c.required !== false && !(w === 'select' && c.default !== undefined);
      cont.append(h('label', { for: id }, c.label, obligatorio ? h('span', { class: 'req', title: 'Obligatorio' }, ' *') : null));

      let control;
      if (w === 'text') {
        control = h('textarea', { id, rows: 2, value: valor ?? '', oninput: (e) => { poner(padre, clave, e.target.value, c); autoAlto(e.target); } });
      } else if (w === 'markdown') {
        control = h('textarea', { id, rows: 20, class: 'mono', value: valor ?? '', oninput: (e) => poner(padre, clave, e.target.value, c) });
        cont.append(h('p', { class: 'ayuda' }, 'Formato: «## Título», «**negrita**», «- elemento de lista», «[texto](enlace)». Deja una línea en blanco entre párrafos.'));
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
        const soloLectura = tipo === 'pagina' && ruta === 'slug';
        const esIcono = /^icono/.test(c.name);
        const vista = esIcono ? h('i', { class: 'ti ' + (valor || ''), 'aria-hidden': 'true' }) : null;
        const entrada = h('input', {
          id, type: 'text', value: valor ?? '', readonly: soloLectura,
          spellcheck: /enlace|icono|slug|whatsapp|correo|url/.test(c.name) ? 'false' : null,
          oninput: (e) => { poner(padre, clave, e.target.value, c); if (vista) vista.className = 'ti ' + e.target.value.trim(); },
        });
        control = esIcono ? h('div', { class: 'con-icono' }, h('span', { class: 'icono-vista' }, vista), entrada) : entrada;
      }
      cont.append(control);
      if (c.hint) cont.append(h('p', { class: 'ayuda' }, c.hint));
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
        if (v) vista.src = P.rutaPublica(v);
      };
      vista.addEventListener('error', () => { vista.hidden = true; });
      const entrada = h('input', {
        id, type: 'text', value: padre[clave] ?? '', placeholder: 'assets/img/…', spellcheck: 'false',
        oninput: (e) => { poner(padre, clave, e.target.value.trim(), c); actualizar(); },
      });
      const usar = (ruta) => { entrada.value = ruta; poner(padre, clave, ruta, c); actualizar(); };
      const subir = h('button', { type: 'button', class: 'btn btn-fino btn-peq', onclick: () => archivo.click() }, icono('ti-upload'), ' Subir');
      const elegir = h('button', {
        type: 'button', class: 'btn btn-fino btn-peq',
        onclick: async () => { const r = await P.elegirFoto(padre[clave]); if (r) usar(r); },
      }, icono('ti-photo-search'), ' Elegir de las fotos');
      const quitar = h('button', { type: 'button', class: 'btn btn-fino btn-peq', onclick: () => usar('') }, icono('ti-x'), ' Quitar');
      const archivo = h('input', {
        type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif', hidden: true,
        onchange: async (e) => {
          const f = e.target.files[0];
          if (!f) return;
          subir.disabled = true;
          subir.replaceChildren(icono('ti-loader-2 girar'), ' Subiendo…');
          try {
            const fd = new FormData();
            fd.append('archivo', f);
            const r = await P.api('subir', { metodo: 'POST', form: fd });
            usar(r.ruta);
            P.nota('Foto subida. Pulsa «Guardar» para usarla en la web.');
          } catch (err) {
            P.fallo(err);
          } finally {
            subir.disabled = false;
            subir.replaceChildren(icono('ti-upload'), ' Subir');
            e.target.value = '';
          }
        },
      });
      actualizar();
      return h('div', { class: 'imagen' },
        h('div', { class: 'imagen-marco' }, vista, icono('ti-photo')),
        h('div', { class: 'imagen-ctrl' }, entrada, h('div', { class: 'imagen-botones' }, subir, elegir, quitar), archivo));
    }

    function campoObjeto(c, padre, clave, ruta) {
      let valor = padre[clave];
      const opcional = c.required === false;
      if ((valor === undefined || valor === null) && !opcional) valor = padre[clave] = {};
      if (valor === undefined || valor === null) {
        return h('div', { class: 'campo campo-vacio', 'data-ruta': ruta },
          h('span', {}, c.label),
          h('button', {
            type: 'button', class: 'btn btn-fino btn-peq',
            onclick: () => { padre[clave] = nuevoElemento(c.fields); abiertos.set(ruta, true); cambio(); render(); },
          }, icono('ti-plus'), ' Añadir'));
      }
      const quitar = opcional ? h('button', {
        type: 'button', class: 'btn-icono peligro', title: 'Quitar', 'aria-label': 'Quitar ' + c.label,
        onclick: async (ev) => {
          ev.preventDefault(); ev.stopPropagation();
          if (!await P.confirmar(`Se quitará «${c.label}» y todo lo que contiene.`, { titulo: 'Quitar', boton: 'Quitar', peligro: true })) return;
          delete padre[clave]; cambio(); render();
        },
      }, icono('ti-trash')) : null;
      const d = detalles(ruta, !c.collapsed, 'objeto', h('span', { class: 'bloque-titulo' }, c.label), quitar ? h('span', { class: 'item-botones' }, quitar) : null);
      d.cuerpo.append(...c.fields.map((f) => campo(f, valor, f.name, ruta + '.' + f.name)).filter(Boolean));
      return d.el;
    }

    function campoLista(c, padre, clave, ruta) {
      const items = Array.isArray(padre[clave]) ? padre[clave] : [];
      const asegurar = () => (Array.isArray(padre[clave]) ? padre[clave] : (padre[clave] = []));
      const cont = h('div', { class: 'campo campo-lista' + (c.types ? ' es-secciones' : ''), 'data-ruta': ruta });
      cont.append(h('div', { class: 'lista-cab' },
        h('span', { class: 'lista-titulo' }, c.label, c.required !== false ? h('span', { class: 'req' }, ' *') : null),
        items.length ? h('span', { class: 'contador' }, String(items.length)) : null));
      if (c.hint) cont.append(h('p', { class: 'ayuda' }, c.hint));

      const ol = h('ol', { class: 'lista' });
      items.forEach((_, i) => ol.append(elementoLista(c, items, i, ruta)));
      cont.append(ol);

      const anadir = (nuevo) => {
        const arr = asegurar();
        arr.push(nuevo);
        abiertos.set(ruta + '.' + (arr.length - 1), true);
        cambio();
        render();
        const n = el.querySelector(`[data-ruta="${ruta}.${arr.length - 1}"]`);
        if (n) {
          n.scrollIntoView({ block: 'center', behavior: 'smooth' });
          n.querySelector('input, textarea, select')?.focus({ preventScroll: true });
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
          h('button', { type: 'button', class: 'btn btn-fino btn-peq', onclick: () => anadir(c.fields ? nuevoElemento(c.fields) : '') },
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
        cambio(); render();
      };
      const botones = h('span', { class: 'item-botones' },
        P.botonIcono('ti-arrow-up', 'Subir', mover(-1)),
        P.botonIcono('ti-arrow-down', 'Bajar', mover(1)),
        c.field ? null : P.botonIcono('ti-copy', 'Duplicar', (ev) => {
          parar(ev);
          arr.splice(i + 1, 0, clonar(item));
          recolocarRutas(base, (n) => (n > i ? n + 1 : n));
          abiertos.set(base + '.' + (i + 1), true);
          cambio(); render();
        }),
        P.botonIcono('ti-trash', 'Quitar', async (ev) => {
          parar(ev);
          const ok = await P.confirmar(c.types ? 'Se quitará esta sección de la página (no se guarda hasta que pulses «Guardar»).' : 'Se quitará este elemento.', { titulo: 'Quitar', boton: 'Quitar', peligro: true });
          if (!ok) return;
          arr.splice(i, 1);
          recolocarRutas(base, (n) => (n === i ? null : n > i ? n - 1 : n));
          cambio(); render();
        }, 'peligro'));
      botones.children[0].disabled = i === 0;
      botones.children[1].disabled = i === arr.length - 1;

      if (c.field) {
        const sub = { ...c.field, label: c.field.label + ' ' + (i + 1) };
        return h('li', { class: 'item-simple' }, campo(sub, arr, i, ruta), botones);
      }

      let campos = c.fields;
      let tipoBloque = null;
      if (c.types) {
        tipoBloque = c.types.find((t) => t.name === item?.type);
        if (!tipoBloque) return h('li', {}, h('div', { class: 'bloque item' }, 'Bloque desconocido: ' + (item?.type ?? '?'), botones));
        campos = tipoBloque.fields;
      }
      const resumen = textoResumen(tipoBloque ? tipoBloque.summary : c.summary, item);
      const d = detalles(ruta, false, 'item',
        h('span', { class: 'item-num' }, String(i + 1)),
        h('span', { class: 'item-texto' },
          tipoBloque ? h('b', {}, sinParentesis(tipoBloque.label)) : null,
          resumen ? h('span', {}, resumen) : (tipoBloque ? null : h('span', { class: 'tenue' }, '(vacío)'))),
        botones);
      d.cuerpo.append(...campos.map((f) => campo(f, item, f.name, ruta + '.' + f.name)).filter(Boolean));
      return h('li', {}, d.el);
    }

    function render() {
      const y = window.scrollY;
      const caja = errores.length ? h('div', { class: 'aviso aviso-error errores', role: 'alert' },
        h('p', {}, icono('ti-alert-circle'), ' Revisa ' + (errores.length === 1 ? 'este campo' : 'estos campos') + ' antes de guardar:'),
        h('ul', {}, errores.slice(0, 10).map((e) => h('li', {}, h('button', { type: 'button', class: 'enlace', onclick: () => irA(e.ruta) }, e.texto)))),
        errores.length > 10 ? h('p', {}, '…y ' + (errores.length - 10) + ' más.') : null) : null;
      const form = h('form', { class: 'formulario', novalidate: true, onsubmit: (e) => e.preventDefault() },
        campos.map((c) => campo(c, datos, c.name, c.name)).filter(Boolean));
      el.replaceChildren(caja || '', form);
      for (const e of errores) el.querySelector(`[data-ruta="${CSS.escape(e.ruta)}"]`)?.classList.add('con-error');
      el.querySelectorAll('textarea:not(.mono)').forEach(autoAlto);
      window.scrollTo(0, y);
    }

    function irA(ruta) {
      abrirHasta(ruta);
      render();
      const n = el.querySelector(`[data-ruta="${CSS.escape(ruta)}"]`);
      if (n) {
        n.scrollIntoView({ block: 'center', behavior: 'smooth' });
        n.querySelector('input, textarea, select, summary')?.focus({ preventScroll: true });
      }
    }

    render();
    return {
      el,
      render,
      irA,
      validar() {
        errores = [];
        validar(campos, datos, '', [], errores);
        if (errores.length) irA(errores[0].ruta); else render();
        return errores;
      },
      limpiarErrores() { errores = []; render(); },
    };
  };
})();
