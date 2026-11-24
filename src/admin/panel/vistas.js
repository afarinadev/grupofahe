/* ==========================================================================
   Panel de Grupo FAHE — pantallas
   Resumen, Páginas (+ editor), Fotos, Ajustes, Usuarios, Historial, Mi cuenta
   ========================================================================== */
'use strict';

(() => {
  const { h, icono } = P;
  const V = (P.vistas = {});

  const sinPermiso = (cont) => cont.replaceChildren(P.vacio('ti-lock', 'Esta sección es solo para administradores.'));

  async function copiar(texto) {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      const t = h('textarea', { value: texto, style: 'position:fixed;opacity:0' });
      document.body.append(t);
      t.select();
      document.execCommand('copy');
      t.remove();
    }
    P.nota('Copiado: ' + texto, 'info');
  }

  /* ================================================= acciones de páginas */

  async function descartarSiHaceFalta() {
    if (!P.estado.sucio) return true;
    const ok = await P.confirmar('Tienes cambios sin guardar en esta pantalla. Si sigues, se perderán.', { titulo: 'Cambios sin guardar', boton: 'Descartar cambios', peligro: true });
    if (ok) P.estado.sucio = false;
    return ok;
  }

  function camposTituloSlug(tituloInicial = '', slugInicial = '') {
    let tocado = !!slugInicial;
    const titulo = P.campoForm({ name: 'titulo', label: 'Título', required: true, maxlength: 80, value: tituloInicial, placeholder: 'Ej.: Ofertas de temporada' });
    const slug = P.campoForm({
      name: 'slug', label: 'Dirección', required: true, maxlength: 60, value: slugInicial, placeholder: 'ofertas', spellcheck: 'false',
      pattern: '[a-z0-9](?:[a-z0-9\\-]{0,58}[a-z0-9])?',
      hint: 'Solo minúsculas, números y guiones. La página será «dirección.html» y no se podrá cambiar después.',
    });
    titulo.querySelector('input').addEventListener('input', (e) => { if (!tocado) slug.querySelector('input').value = P.slugDe(e.target.value); });
    slug.querySelector('input').addEventListener('input', () => { tocado = true; });
    return [titulo, slug];
  }

  P.nuevaPagina = async () => {
    if (!await descartarSiHaceFalta()) return;
    const r = await P.modal({
      titulo: 'Nueva página',
      contenido: [...camposTituloSlug(), h('p', { class: 'ayuda' }, 'Se crea con la cabecera y el pie de la portada y una primera sección con el título. Después le añades las secciones que quieras.')],
      botones: [
        { texto: 'Cancelar' },
        {
          texto: 'Crear página', icono: 'ti-plus', clase: 'btn-oro', enviar: true,
          accion: (form) => P.api('crear', { metodo: 'POST', cuerpo: { slug: form.elements.slug.value.trim(), titulo: form.elements.titulo.value.trim() } }),
        },
      ],
    });
    if (r && r.slug) {
      P.nota(r.mensaje + ' Añade sus secciones y guarda.');
      location.hash = '#pagina/' + r.slug;
    }
  };

  async function duplicarPagina(p) {
    if (!await descartarSiHaceFalta()) return;
    const r = await P.modal({
      titulo: 'Duplicar «' + p.nombre + '»',
      contenido: [...camposTituloSlug(p.nombre + ' (copia)', p.slug + '-copia'), h('p', { class: 'ayuda' }, 'Se copia la página tal como está guardada, con todas sus secciones.')],
      botones: [
        { texto: 'Cancelar' },
        {
          texto: 'Duplicar', icono: 'ti-copy', clase: 'btn-oro', enviar: true,
          accion: (form) => P.api('duplicar', { metodo: 'POST', cuerpo: { origen: p.slug, slug: form.elements.slug.value.trim(), titulo: form.elements.titulo.value.trim() } }),
        },
      ],
    });
    if (r && r.slug) {
      P.nota(r.mensaje);
      location.hash = '#pagina/' + r.slug;
    }
  }

  async function borrarPagina(p) {
    const ok = await P.confirmar(`Se borrará «${p.nombre}» (${p.slug}.html) de la web. Podrás recuperarla desde el historial. Revisa después si algún menú o botón enlazaba a ella.`, { titulo: 'Borrar página', boton: 'Borrar página', peligro: true });
    if (!ok) return false;
    try {
      const r = await P.api('borrar', { metodo: 'POST', cuerpo: { slug: p.slug } });
      P.estado.sucio = false;
      P.nota(r.mensaje);
      P.app.pintarMenu();
      return true;
    } catch (e) {
      P.fallo(e);
      return false;
    }
  }

  /* ===================================================== tabla de cambios */

  function tablaCambios(filas, { conDetalle = P.esAdmin() } = {}) {
    return h('div', { class: 'tabla-wrap' }, h('table', { class: 'tabla tabla-cambios' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Cuándo'), h('th', {}, 'Quién'), h('th', {}, 'Acción'), h('th', {}, 'Qué'), conDetalle ? h('th', { class: 'acciones' }, h('span', { class: 'sr' }, 'Detalle')) : null)),
      h('tbody', {}, filas.map((f) => h('tr', {},
        h('td', { title: P.fecha(f.fecha) }, h('span', { class: 'nowrap' }, P.hace(f.fecha))),
        h('td', {}, f.usuario || h('span', { class: 'tenue' }, '—')),
        h('td', {}, P.pillAccion(f.accion)),
        h('td', { class: 'celda-que' }, f.titulo || f.entidad || ''),
        conDetalle ? h('td', { class: 'acciones' }, P.botonIcono('ti-eye', 'Ver el detalle', async () => { if (await P.verCambio(f.id)) P.app.recargar(); })) : null)))));
  }

  /* -------------------------------------------- detalle de un cambio */

  function aplanar(o, pre = '', out = {}) {
    if (o && typeof o === 'object') {
      const claves = Array.isArray(o) ? o.map((_, i) => i) : Object.keys(o);
      if (!claves.length) out[pre] = Array.isArray(o) ? '[]' : '{}';
      for (const k of claves) aplanar(o[k], pre === '' ? String(k) : pre + '.' + k, out);
    } else {
      out[pre] = o;
    }
    return out;
  }

  function diferencias(antesTxt, despuesTxt) {
    let a, d;
    try { a = aplanar(JSON.parse(antesTxt)); d = aplanar(JSON.parse(despuesTxt)); } catch { return []; }
    const rutas = [...new Set([...Object.keys(a), ...Object.keys(d)])];
    const legible = (r) => r.split('.').map((p) => (/^\d+$/.test(p) ? String(+p + 1) : p)).join(' › ');
    return rutas.filter((r) => a[r] !== d[r]).map((r) => ({ ruta: legible(r), antes: a[r], despues: d[r] }));
  }

  const corto = (v) => {
    const t = typeof v === 'string' ? v : JSON.stringify(v);
    return t.length > 160 ? t.slice(0, 158) + '…' : t;
  };

  /** Ventana con el detalle de un cambio del historial. Devuelve true si se restauró algo. */
  P.verCambio = async (id) => {
    let e;
    try {
      ({ entrada: e } = await P.api('historial_ver', { params: { id } }));
    } catch (err) {
      P.fallo(err);
      return false;
    }
    const info = h('dl', { class: 'datos' }, [
      ['Cuándo', P.fecha(e.fecha) + ' (' + P.hace(e.fecha) + ')'],
      ['Quién', e.usuario || '—'],
      ['Acción', P.pillAccion(e.accion)],
      ['Qué', e.titulo || e.entidad || '—'],
      ['Desde', e.ip || '—'],
    ].map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));

    let cambios = null;
    if (e.antes || e.despues) {
      const lista = e.antes && e.despues ? diferencias(e.antes, e.despues) : [];
      cambios = h('div', { class: 'cambios' }, h('h3', {}, 'Qué cambió'),
        lista.length
          ? h('ul', { class: 'lista-cambios' }, lista.slice(0, 80).map((c) => h('li', {},
            h('code', {}, c.ruta),
            h('div', { class: 'cambio-valores' },
              c.antes !== undefined ? h('del', {}, corto(c.antes)) : h('span', { class: 'tenue' }, '(no existía)'),
              icono('ti-arrow-right'),
              c.despues !== undefined ? h('ins', {}, corto(c.despues)) : h('span', { class: 'tenue' }, '(se quitó)')))))
          : h('p', { class: 'tenue' }, !e.antes ? 'Se creó con este contenido.' : !e.despues ? 'Se borró. Puedes recuperarla tal como estaba.' : 'Sin diferencias de contenido.'),
        lista.length > 80 ? h('p', { class: 'tenue' }, '…y ' + (lista.length - 80) + ' cambios más.') : null);
    }

    const botones = [{ texto: 'Cerrar' }];
    if (e.restaurable && e.antes) botones.push({ texto: e.accion === 'borrar' ? 'Recuperar la página' : 'Deshacer este cambio', icono: 'ti-arrow-back-up', clase: e.despues ? 'btn-fino' : 'btn-oro', valor: 'antes' });
    if (e.restaurable && e.despues) botones.push({ texto: 'Restaurar esta versión', icono: 'ti-restore', clase: 'btn-oro', valor: 'despues' });
    const v = await P.modal({ titulo: 'Cambio n.º ' + e.id, ancho: 'ancho', contenido: [info, cambios], botones });
    if (v !== 'antes' && v !== 'despues') return false;
    if (!await descartarSiHaceFalta()) return false;
    const texto = v === 'antes'
      ? `«${e.titulo}» volverá a quedar como estaba justo antes de este cambio.`
      : `«${e.titulo}» volverá a quedar como quedó con este cambio.`;
    if (!await P.confirmar(texto + ' Lo que tenga ahora se guarda en el historial, por si quieres volver.', { titulo: 'Restaurar versión', boton: 'Restaurar' })) return false;
    try {
      const r = await P.api('restaurar', { metodo: 'POST', cuerpo: { id: e.id, version: v } });
      P.nota(r.mensaje);
      P.app.pintarMenu();
      return true;
    } catch (err) {
      P.fallo(err);
      return false;
    }
  };

  /* ============================================================ RESUMEN */

  V.resumen = async (cont) => {
    cont.replaceChildren(P.cargando());
    const r = await P.api('resumen');
    const u = P.estado.usuario;
    const cifra = (ic, n, texto, href, color) => h('a', { class: 'cifra cifra-' + color, href },
      h('span', { class: 'cifra-icono' }, icono(ic)),
      h('span', { class: 'cifra-num' }, String(n)),
      h('span', { class: 'cifra-txt' }, texto));
    const hora = new Date().getHours();
    const saludo = hora >= 6 && hora < 14 ? 'Buenos días' : hora >= 14 && hora < 21 ? 'Buenas tardes' : 'Buenas noches';

    const avisos = r.avisos.length
      ? h('ul', { class: 'avisos' }, r.avisos.map((a) => h('li', { class: 'aviso-' + a.nivel },
        icono(a.nivel === 'error' ? 'ti-alert-octagon' : a.nivel === 'aviso' ? 'ti-alert-triangle' : 'ti-info-circle'),
        a.enlace ? h('a', { href: a.enlace }, a.texto, icono('ti-chevron-right')) : h('span', {}, a.texto))))
      : P.vacio('ti-circle-check', 'Todo en orden.');

    const paginas = h('ul', { class: 'lista-paginas' }, r.paginas.map((p) => h('li', {}, h('a', { href: '#pagina/' + p.slug },
      h('span', { class: 'lp-icono' }, icono(p.slug === 'index' ? 'ti-home' : 'ti-file-text')),
      h('span', { class: 'lp-texto' }, h('b', {}, p.nombre),
        h('small', {}, p.slug + '.html · ' + (p.ultimo_cambio ? P.hace(p.ultimo_cambio.fecha) + ' por ' + p.ultimo_cambio.usuario : 'sin cambios desde el panel'))),
      icono('ti-chevron-right')))));

    cont.replaceChildren(
      P.cabecera({
        titulo: `${saludo}, ${u.nombre.split(' ')[0]}`,
        subtitulo: 'Resumen de la web de Grupo FAHE',
        acciones: [
          h('a', { class: 'btn btn-fino', href: '../index.html', target: '_blank', rel: 'noopener' }, icono('ti-world'), h('span', {}, ' Ver la web')),
          h('button', { type: 'button', class: 'btn btn-oro', onclick: P.nuevaPagina }, icono('ti-plus'), ' Nueva página'),
        ],
      }),
      h('div', { class: 'cifras' },
        cifra('ti-files', r.cifras.paginas, 'Páginas', '#paginas', 'oro'),
        cifra('ti-layout-rows', r.cifras.secciones, 'Secciones', '#paginas', 'azul'),
        cifra('ti-photo', r.cifras.fotos, 'Fotos subidas', '#fotos', 'verde'),
        r.cifras.usuarios !== null ? cifra('ti-users', r.cifras.usuarios, 'Usuarios', '#usuarios', 'coral') : null,
        cifra('ti-history', r.cifras.cambios7, 'Cambios esta semana', P.esAdmin() ? '#historial' : '#resumen', 'turquesa')),
      h('div', { class: 'rejilla-2' },
        h('div', { class: 'columna' },
          P.tarjeta('Avisos', avisos),
          P.tarjeta('Últimos cambios', r.ultimos.length ? tablaCambios(r.ultimos) : P.vacio('ti-history', 'Todavía no hay cambios.'),
            P.esAdmin() ? h('a', { href: '#historial', class: 'enlace-peq' }, 'Ver todo ', icono('ti-arrow-right')) : null)),
        h('div', { class: 'columna' },
          P.tarjeta('Páginas', paginas, h('a', { href: '#paginas', class: 'enlace-peq' }, 'Gestionar ', icono('ti-arrow-right'))))));
  };

  /* ============================================================ PÁGINAS */

  V.paginas = async (cont) => {
    cont.replaceChildren(P.cargando());
    const { paginas } = await P.api('paginas');
    const buscador = h('input', { type: 'search', class: 'buscador', placeholder: 'Buscar página…', 'aria-label': 'Buscar página', oninput: () => pintar() });
    const tbody = h('tbody');
    const pintar = () => {
      const q = P.slugDe(buscador.value);
      const filas = paginas.filter((p) => !q || P.slugDe(p.nombre).includes(q) || p.slug.includes(q));
      tbody.replaceChildren(...filas.map((p) => {
        const borrar = P.botonIcono('ti-trash', p.protegida ? 'Esta página no se puede borrar' : 'Borrar', async () => { if (await borrarPagina(p)) V.paginas(cont); }, 'peligro');
        borrar.disabled = p.protegida;
        return h('tr', {},
          h('td', {}, h('a', { class: 'celda-principal', href: '#pagina/' + p.slug },
            h('span', { class: 'lp-icono' }, icono(p.slug === 'index' ? 'ti-home' : 'ti-file-text')),
            h('span', {}, h('b', {}, p.nombre), h('small', {}, p.slug + '.html')))),
          h('td', { class: 'num' }, String(p.secciones)),
          h('td', {}, p.ultimo_cambio
            ? h('span', { title: P.fecha(p.ultimo_cambio.fecha) }, P.hace(p.ultimo_cambio.fecha), h('small', { class: 'linea' }, 'por ' + p.ultimo_cambio.usuario))
            : h('span', { class: 'tenue', title: P.fecha(p.modificada) }, P.hace(p.modificada))),
          h('td', {}, h('span', { class: 'pills' }, p.oculta ? P.pill('Oculta a Google', 'oro') : P.pill('Publicada', 'verde'), p.protegida ? P.pill('Fija', 'neutro') : null)),
          h('td', { class: 'acciones' }, h('span', { class: 'item-botones' },
            P.enlaceIcono('ti-pencil', 'Editar', '#pagina/' + p.slug),
            P.enlaceIcono('ti-eye', 'Ver en la web', '../' + p.slug + '.html', true),
            P.botonIcono('ti-copy', 'Duplicar', () => duplicarPagina(p)),
            P.esAdmin() ? P.enlaceIcono('ti-history', 'Historial', '#historial/pagina:' + p.slug) : null,
            borrar)));
      }));
      if (!filas.length) tbody.append(h('tr', {}, h('td', { colspan: 5, class: 'tenue centro' }, 'No hay ninguna página que coincida.')));
    };
    pintar();
    cont.replaceChildren(
      P.cabecera({
        titulo: 'Páginas',
        subtitulo: paginas.length + ' páginas en la web. Pulsa en una para editarla.',
        acciones: [h('button', { type: 'button', class: 'btn btn-oro', onclick: P.nuevaPagina }, icono('ti-plus'), ' Nueva página')],
      }),
      h('div', { class: 'barra-filtros' }, h('label', { class: 'buscador-caja' }, icono('ti-search'), buscador)),
      h('div', { class: 'tarjeta tarjeta-tabla' }, h('div', { class: 'tabla-wrap' }, h('table', { class: 'tabla' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Página'), h('th', { class: 'num' }, 'Secciones'), h('th', {}, 'Último cambio'), h('th', {}, 'Estado'), h('th', { class: 'acciones' }, h('span', { class: 'sr' }, 'Acciones')))),
        tbody))));
  };

  /* ===================================================== EDITOR (común) */

  async function vistaEditor(cont, { tipo, id, cabecera, encima, seccion }) {
    cont.replaceChildren(P.cargando());
    const { datos } = await P.api('leer', { params: { tipo, id } });
    const campos = tipo === 'pagina' ? P.esquema.paginas.fields : P.esquema.ajustes.find((a) => a.id === id).fields;
    let guardando = false;
    const boton = h('button', { type: 'button', class: 'btn btn-oro btn-guardar', onclick: () => guardar() });
    const pintarBoton = () => {
      boton.disabled = !P.estado.sucio || guardando;
      boton.replaceChildren(...(guardando ? [icono('ti-loader-2 girar'), ' Guardando…'] : [icono('ti-device-floppy'), P.estado.sucio ? ' Guardar cambios' : ' Guardado']));
      document.body.classList.toggle('con-cambios', P.estado.sucio);
    };
    P.estado.sucio = false;
    const editor = P.crearEditor({ tipo, datos, campos, alCambiar: () => { if (!P.estado.sucio) { P.estado.sucio = true; pintarBoton(); } } });
    const cab = h('div', { class: 'cab-fija' });
    const pintarCab = () => cab.replaceChildren(cabecera(boton));

    async function guardar() {
      if (guardando || !P.estado.sucio) return;
      if (editor.validar().length) return;
      guardando = true;
      pintarBoton();
      try {
        const r = await P.api('guardar', { metodo: 'POST', cuerpo: { tipo, id, datos } });
        P.estado.sucio = false;
        P.nota(r.mensaje, 'ok', tipo === 'pagina' ? h('a', { href: '../' + id + '.html', target: '_blank', rel: 'noopener' }, 'Ver la página ', icono('ti-external-link')) : null);
        pintarCab();
        P.app.pintarMenu();
      } catch (e) {
        P.fallo(e);
      } finally {
        guardando = false;
        pintarBoton();
      }
    }
    P.estado.guardar = guardar;
    pintarCab();
    pintarBoton();
    cont.replaceChildren(cab, encima || '', editor.el);
    if (seccion !== undefined && seccion !== '') editor.irA('secciones.' + seccion);
  }

  V.pagina = async (cont, { slug, seccion }) => {
    if (!P.estado.paginas.some((p) => p.slug === slug)) {
      cont.replaceChildren(P.vacio('ti-file-off', 'Esa página no existe.', h('a', { class: 'btn btn-fino', href: '#paginas' }, 'Ver las páginas')));
      return;
    }
    await vistaEditor(cont, {
      tipo: 'pagina', id: slug, seccion,
      cabecera: (boton) => {
        const p = P.estado.paginas.find((x) => x.slug === slug) || { slug, nombre: slug, secciones: 0 };
        const borrar = !p.protegida ? P.botonIcono('ti-trash', 'Borrar página', async () => { if (await borrarPagina(p)) location.hash = '#paginas'; }, 'peligro') : null;
        return P.cabecera({
          migas: [{ texto: 'Páginas', href: '#paginas' }],
          titulo: p.nombre,
          subtitulo: `${slug}.html · ${p.secciones} ${p.secciones === 1 ? 'sección' : 'secciones'}`,
          acciones: [
            P.enlaceIcono('ti-eye', 'Ver la página', '../' + slug + '.html', true),
            P.esAdmin() ? P.enlaceIcono('ti-history', 'Historial de esta página', '#historial/pagina:' + slug) : null,
            P.botonIcono('ti-copy', 'Duplicar página', () => duplicarPagina(p)),
            borrar,
            boton,
          ],
        });
      },
    });
  };

  /* ============================================================ AJUSTES */

  V.ajustes = async (cont, { id }) => {
    if (!P.esAdmin()) return sinPermiso(cont);
    const lista = P.estado.ajustes;
    const actual = lista.some((a) => a.id === id) ? id : lista[0].id;
    const pestanas = h('nav', { class: 'pestanas', 'aria-label': 'Ajustes' },
      lista.map((a) => h('a', { href: '#ajustes/' + a.id, class: a.id === actual ? 'activa' : null, 'aria-current': a.id === actual ? 'page' : null }, a.titulo)));
    await vistaEditor(cont, {
      tipo: 'ajuste', id: actual, encima: pestanas,
      cabecera: (boton) => P.cabecera({
        titulo: 'Ajustes',
        subtitulo: 'Datos que se usan en toda la web: teléfonos, WhatsApp, correo, Booking y empresas del menú.',
        acciones: [P.enlaceIcono('ti-history', 'Historial de estos ajustes', '#historial/ajuste:' + actual), boton],
      }),
    });
  };

  /* ============================================================== FOTOS */

  /** Ventana para elegir una foto ya subida. Devuelve la ruta o null. */
  P.elegirFoto = async (actual) => {
    const rejilla = h('div', { class: 'galeria galeria-elegir' }, P.cargando());
    let elegida = null;
    const ventana = P.modal({ titulo: 'Elegir foto', ancho: 'ancho', contenido: rejilla, botones: [{ texto: 'Cancelar' }] });
    try {
      const { fotos } = await P.api('fotos');
      rejilla.replaceChildren(...(fotos.length
        ? fotos.map((f) => h('button', {
          type: 'button', class: 'foto-elegir' + (f.ruta === actual ? ' actual' : ''), title: f.nombre,
          onclick: (e) => { elegida = f.ruta; e.currentTarget.closest('dialog').close(); },
        }, h('span', { class: 'foto-marco' }, h('img', { src: P.rutaPublica(f.ruta), alt: '', loading: 'lazy' })), h('span', { class: 'foto-nombre' }, f.nombre)))
        : [P.vacio('ti-photo-off', 'Todavía no hay fotos. Súbelas con el botón «Subir» o desde la sección Fotos.')]));
    } catch (e) {
      rejilla.replaceChildren(h('p', { class: 'aviso aviso-error' }, e.message));
    }
    await ventana;
    return elegida;
  };

  V.fotos = async (cont, filtroInicial = 'todas') => {
    cont.replaceChildren(P.cargando());
    const { fotos, max_mb } = await P.api('fotos');
    let filtro = filtroInicial;
    const galeria = h('div', { class: 'galeria' });
    const pestanas = h('nav', { class: 'pestanas', 'aria-label': 'Filtrar fotos' });
    const entrada = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif', multiple: true, hidden: true, onchange: (e) => subir([...e.target.files]) });
    const textoZona = h('p', {}, h('b', {}, 'Arrastra fotos aquí'), ' o pulsa para elegirlas');
    const zona = h('div', {
      class: 'zona-subida', tabindex: '0', role: 'button', 'aria-label': 'Subir fotos',
      onclick: () => entrada.click(),
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); entrada.click(); } },
    }, icono('ti-cloud-upload'), textoZona, h('small', {}, `JPG, PNG, WebP o GIF · hasta ${max_mb} MB cada una`), entrada);
    ['dragenter', 'dragover'].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.add('encima'); }));
    ['dragleave', 'drop'].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.remove('encima'); }));
    zona.addEventListener('drop', (e) => subir([...e.dataTransfer.files]));

    async function subir(archivos) {
      archivos = archivos.filter((f) => /^image\/(jpeg|png|webp|gif)$/.test(f.type));
      if (!archivos.length) return P.nota('Elige fotos JPG, PNG, WebP o GIF.', 'error');
      zona.classList.add('subiendo');
      let bien = 0;
      for (const [i, f] of archivos.entries()) {
        textoZona.textContent = `Subiendo ${i + 1} de ${archivos.length}…`;
        try {
          const fd = new FormData();
          fd.append('archivo', f);
          await P.api('subir', { metodo: 'POST', form: fd });
          bien++;
        } catch (e) {
          P.nota(f.name + ': ' + e.message, 'error');
        }
      }
      if (bien) P.nota(bien === 1 ? 'Foto subida.' : bien + ' fotos subidas.');
      V.fotos(cont, 'subidas');
    }

    const grupos = {
      todas: ['Todas', () => true],
      subidas: ['Subidas', (f) => f.grupo === 'subida'],
      logos: ['Logos', (f) => f.grupo === 'logo'],
      sinusar: ['Sin usar', (f) => f.grupo === 'subida' && !f.usos.length],
    };
    const pintar = () => {
      pestanas.replaceChildren(...Object.entries(grupos).map(([k, [t, fn]]) => h('button', {
        type: 'button', class: k === filtro ? 'activa' : null, 'aria-pressed': String(k === filtro),
        onclick: () => { filtro = k; pintar(); },
      }, t, h('span', { class: 'menu-contador' }, String(fotos.filter(fn).length)))));
      const lista = fotos.filter(grupos[filtro][1]);
      galeria.replaceChildren(...(lista.length ? lista.map((f) => {
        const borrar = f.grupo === 'subida' ? P.botonIcono('ti-trash', f.usos.length ? 'Se está usando: quítala antes de las páginas' : 'Borrar', async () => {
          if (!await P.confirmar(`Se borrará «${f.nombre}». No se usa en ninguna página.`, { titulo: 'Borrar foto', boton: 'Borrar', peligro: true })) return;
          try {
            const r = await P.api('borrar_foto', { metodo: 'POST', cuerpo: { ruta: f.ruta } });
            P.nota(r.mensaje);
            V.fotos(cont, filtro);
          } catch (e) { P.fallo(e); }
        }, 'peligro') : null;
        if (borrar) borrar.disabled = f.usos.length > 0;
        return h('figure', { class: 'foto' },
          h('a', { class: 'foto-marco', href: P.rutaPublica(f.ruta), target: '_blank', rel: 'noopener', title: 'Abrir a tamaño completo' },
            h('img', { src: P.rutaPublica(f.ruta), alt: '', loading: 'lazy' })),
          h('figcaption', {},
            h('b', { class: 'foto-nombre', title: f.nombre }, f.nombre),
            h('small', {}, [f.ancho && f.alto ? f.ancho + ' × ' + f.alto : null, P.bytes(f.bytes)].filter(Boolean).join(' · ')),
            h('div', { class: 'foto-usos' }, f.usos.length
              ? f.usos.map((u) => h('a', { class: 'pill pill-verde', href: u.tipo === 'pagina' ? '#pagina/' + u.id : '#ajustes/' + u.id }, u.titulo))
              : P.pill(f.grupo === 'logo' ? 'Logo' : 'Sin usar', f.grupo === 'logo' ? 'neutro' : 'oro')),
            h('div', { class: 'foto-acciones' },
              P.botonIcono('ti-clipboard', 'Copiar la ruta', () => copiar(f.ruta)),
              P.enlaceIcono('ti-external-link', 'Abrir', P.rutaPublica(f.ruta), true),
              borrar)));
      }) : [P.vacio('ti-photo-off', filtro === 'sinusar' ? 'Todas las fotos subidas se están usando.' : 'No hay fotos aquí todavía.')]));
    };
    pintar();
    const subidas = fotos.filter((f) => f.grupo === 'subida').length;
    cont.replaceChildren(
      P.cabecera({
        titulo: 'Fotos',
        subtitulo: `${subidas} ${subidas === 1 ? 'foto subida' : 'fotos subidas'} y ${fotos.length - subidas} logos. Para usar una foto, elígela desde el campo de foto de una sección.`,
        acciones: [h('button', { type: 'button', class: 'btn btn-oro', onclick: () => entrada.click() }, icono('ti-upload'), ' Subir fotos')],
      }),
      zona, pestanas, galeria);
  };

  /* =========================================================== USUARIOS */

  async function editarUsuario(u, recargar) {
    const nuevo = !u;
    const yo = u && u.id === P.estado.usuario.id;
    const contenido = [
      P.campoForm({ name: 'nombre', label: 'Nombre', required: true, value: u?.nombre || '', maxlength: 60, autocomplete: 'off' }),
      P.campoForm({ name: 'usuario', label: 'Usuario (para entrar)', required: true, value: u?.usuario || '', pattern: '[A-Za-z0-9._@\\-]{3,40}', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', hint: 'De 3 a 40 caracteres: letras, números, punto, guion o @.' }),
      P.campoForm({ name: 'rol', label: 'Rol', type: 'select', value: u?.rol || 'editor', opciones: Object.entries(P.estado.roles), hint: 'Administrador: todo. Editor: páginas y fotos (no ajustes, usuarios ni historial).' }),
      nuevo
        ? P.campoForm({ name: 'contrasena', label: 'Contraseña', type: 'password', required: true, minlength: 8, autocomplete: 'new-password', hint: 'Mínimo 8 caracteres. Dásela a la persona: luego puede cambiarla en «Mi cuenta».' })
        : P.campoForm({ name: 'activo', label: 'Activo (puede entrar al panel)', type: 'checkbox', value: u.activo }),
    ];
    if (yo) {
      contenido[2].querySelector('select').disabled = true;
      contenido[3].querySelector('input').disabled = true;
      contenido.push(h('p', { class: 'ayuda' }, 'Es tu propio usuario: no puedes quitarte el rol de administrador ni desactivarte.'));
    }
    const r = await P.modal({
      titulo: nuevo ? 'Nuevo usuario' : 'Editar usuario',
      contenido,
      botones: [
        { texto: 'Cancelar' },
        {
          texto: nuevo ? 'Crear usuario' : 'Guardar', icono: 'ti-check', clase: 'btn-oro', enviar: true,
          accion: (form) => {
            const f = form.elements;
            return P.api('usuario_guardar', {
              metodo: 'POST',
              cuerpo: {
                id: u?.id || 0, nombre: f.nombre.value.trim(), usuario: f.usuario.value.trim(),
                rol: yo ? 'admin' : f.rol.value, activo: nuevo || yo ? true : f.activo.checked,
                contrasena: nuevo ? f.contrasena.value : undefined,
              },
            });
          },
        },
      ],
    });
    if (r) {
      P.nota(r.mensaje);
      recargar();
    }
  }

  async function contrasenaUsuario(u) {
    const r = await P.modal({
      titulo: 'Nueva contraseña para ' + u.nombre,
      contenido: [
        P.campoForm({ name: 'c1', label: 'Contraseña nueva', type: 'password', required: true, minlength: 8, autocomplete: 'new-password' }),
        P.campoForm({ name: 'c2', label: 'Repítela', type: 'password', required: true, minlength: 8, autocomplete: 'new-password' }),
      ],
      botones: [
        { texto: 'Cancelar' },
        {
          texto: 'Cambiar contraseña', icono: 'ti-key', clase: 'btn-oro', enviar: true,
          accion: (form) => {
            const f = form.elements;
            if (f.c1.value !== f.c2.value) return 'Las dos contraseñas no coinciden.';
            return P.api('usuario_contrasena', { metodo: 'POST', cuerpo: { id: u.id, contrasena: f.c1.value } });
          },
        },
      ],
    });
    if (r) P.nota(r.mensaje);
  }

  V.usuarios = async (cont) => {
    if (!P.esAdmin()) return sinPermiso(cont);
    cont.replaceChildren(P.cargando());
    const { usuarios } = await P.api('usuarios');
    const recargar = () => V.usuarios(cont);
    const filas = usuarios.map((u) => {
      const yo = u.id === P.estado.usuario.id;
      const borrar = P.botonIcono('ti-trash', yo ? 'No puedes borrar tu propio usuario' : 'Borrar', async () => {
        if (!await P.confirmar(`Se borrará el usuario «${u.usuario}» (${u.nombre}). Lo que hizo seguirá en el historial.`, { titulo: 'Borrar usuario', boton: 'Borrar', peligro: true })) return;
        try {
          const r = await P.api('usuario_borrar', { metodo: 'POST', cuerpo: { id: u.id } });
          P.nota(r.mensaje);
          recargar();
        } catch (e) { P.fallo(e); }
      }, 'peligro');
      borrar.disabled = yo;
      return h('tr', { class: u.activo ? null : 'apagada' },
        h('td', {}, h('span', { class: 'celda-principal' }, h('span', { class: 'avatar' }, P.iniciales(u.nombre)),
          h('span', {}, h('b', {}, u.nombre, yo ? h('span', { class: 'tu' }, ' (tú)') : null), h('small', {}, '@' + u.usuario)))),
        h('td', {}, P.pill(P.estado.roles[u.rol] || u.rol, u.rol === 'admin' ? 'oro' : 'azul')),
        h('td', {}, u.activo ? P.pill('Activo', 'verde') : P.pill('Desactivado', 'rojo')),
        h('td', { title: P.fecha(u.ultimo_acceso) }, P.hace(u.ultimo_acceso)),
        h('td', { class: 'acciones' }, h('span', { class: 'item-botones' },
          P.botonIcono('ti-pencil', 'Editar', () => editarUsuario(u, recargar)),
          P.botonIcono('ti-key', 'Cambiar contraseña', () => contrasenaUsuario(u)),
          borrar)));
    });
    cont.replaceChildren(
      P.cabecera({
        titulo: 'Usuarios',
        subtitulo: 'Quién puede entrar al panel y qué puede hacer.',
        acciones: [h('button', { type: 'button', class: 'btn btn-oro', onclick: () => editarUsuario(null, recargar) }, icono('ti-user-plus'), ' Nuevo usuario')],
      }),
      h('div', { class: 'tarjeta tarjeta-tabla' }, h('div', { class: 'tabla-wrap' }, h('table', { class: 'tabla' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Usuario'), h('th', {}, 'Rol'), h('th', {}, 'Estado'), h('th', {}, 'Último acceso'), h('th', { class: 'acciones' }, h('span', { class: 'sr' }, 'Acciones')))),
        h('tbody', {}, filas)))),
      h('div', { class: 'roles' },
        h('div', { class: 'rol' }, P.pill('Administrador', 'oro'), h('p', {}, 'Todo: páginas, fotos, ajustes generales, usuarios e historial (incluido restaurar versiones).')),
        h('div', { class: 'rol' }, P.pill('Editor', 'azul'), h('p', {}, 'Páginas y fotos: editar, crear, duplicar y borrar páginas, y subir fotos.'))));
  };

  /* ========================================================== HISTORIAL */

  V.historial = async (cont, { entidad } = {}) => {
    if (!P.esAdmin()) return sinPermiso(cont);
    const filtros = { usuario: '', accion_filtro: '', entidad: entidad || '', pagina: 1 };
    const cuerpo = h('div');
    const cab = P.cabecera({ titulo: 'Historial', subtitulo: 'Todo lo que se ha hecho en el panel. Abre un cambio para ver qué cambió y deshacerlo si hace falta.' });

    async function cargar() {
      cuerpo.replaceChildren(P.cargando());
      let r;
      try {
        r = await P.api('historial', { params: filtros });
      } catch (e) {
        cuerpo.replaceChildren(h('p', { class: 'aviso aviso-error' }, e.message));
        return;
      }
      const sel = (name, todos, opciones, valor) => h('select', { name, 'aria-label': todos, onchange: (e) => { filtros[name] = e.target.value; filtros.pagina = 1; cargar(); } },
        h('option', { value: '' }, todos), opciones.map(([v, t]) => h('option', { value: v, selected: v === valor }, t)));
      const hayFiltro = filtros.usuario || filtros.accion_filtro || filtros.entidad;
      const barra = h('div', { class: 'barra-filtros' },
        sel('usuario', 'Todas las personas', r.usuarios.map((u) => [u, u]), filtros.usuario),
        sel('accion_filtro', 'Todas las acciones', r.acciones.map((a) => [a, a.charAt(0).toUpperCase() + a.slice(1)]), filtros.accion_filtro),
        sel('entidad', 'Todas las páginas y ajustes', r.entidades.map((e) => [e.tipo + ':' + e.entidad, (e.tipo === 'ajuste' ? 'Ajustes · ' : '') + e.titulo.replace(/ \(versión del .*\)$/, '')]), filtros.entidad),
        hayFiltro ? h('button', { type: 'button', class: 'btn btn-fino', onclick: () => { Object.assign(filtros, { usuario: '', accion_filtro: '', entidad: '', pagina: 1 }); history.replaceState(null, '', '#historial'); cargar(); } }, icono('ti-x'), ' Quitar filtros') : null);
      const paginacion = h('div', { class: 'paginacion' },
        h('span', { class: 'tenue' }, `${r.total} ${r.total === 1 ? 'entrada' : 'entradas'} · página ${r.pagina} de ${r.paginas}`),
        h('span', { class: 'item-botones' },
          h('button', { type: 'button', class: 'btn btn-fino btn-peq', disabled: r.pagina <= 1, onclick: () => { filtros.pagina--; cargar(); } }, icono('ti-chevron-left'), ' Anterior'),
          h('button', { type: 'button', class: 'btn btn-fino btn-peq', disabled: r.pagina >= r.paginas, onclick: () => { filtros.pagina++; cargar(); } }, 'Siguiente ', icono('ti-chevron-right'))));
      const tabla = r.filas.length ? h('div', { class: 'tabla-wrap' }, h('table', { class: 'tabla tabla-cambios' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Cuándo'), h('th', {}, 'Quién'), h('th', {}, 'Acción'), h('th', {}, 'Qué'), h('th', { class: 'acciones' }, h('span', { class: 'sr' }, 'Detalle')))),
        h('tbody', {}, r.filas.map((f) => h('tr', {},
          h('td', {}, h('span', { class: 'nowrap' }, P.fecha(f.fecha)), h('small', { class: 'linea' }, P.hace(f.fecha))),
          h('td', {}, f.usuario || h('span', { class: 'tenue' }, '—')),
          h('td', {}, P.pillAccion(f.accion)),
          h('td', { class: 'celda-que' }, f.titulo || f.entidad || '', +f.hay_antes || +f.hay_despues ? h('small', { class: 'linea tenue' }, icono('ti-restore'), ' se puede restaurar') : null),
          h('td', { class: 'acciones' }, P.botonIcono('ti-eye', 'Ver el detalle', async () => { if (await P.verCambio(f.id)) cargar(); }))))))) : P.vacio('ti-history', 'No hay nada con estos filtros.');
      cuerpo.replaceChildren(barra, h('div', { class: 'tarjeta tarjeta-tabla' }, tabla, r.total > 25 ? paginacion : null));
    }
    cont.replaceChildren(cab, cuerpo);
    await cargar();
  };

  /* ========================================================== MI CUENTA */

  V.cuenta = async (cont) => {
    const u = P.estado.usuario;
    const form = h('form', { class: 'formulario form-cuenta', novalidate: true },
      P.campoForm({ name: 'nombre', label: 'Tu nombre', required: true, value: u.nombre, maxlength: 60, autocomplete: 'name' }),
      h('input', { type: 'text', name: 'username', value: u.usuario, autocomplete: 'username', hidden: true }),
      h('h2', { class: 'subtitulo-form' }, 'Cambiar la contraseña'),
      h('p', { class: 'ayuda' }, 'Déjalas en blanco si solo quieres cambiar tu nombre.'),
      P.campoForm({ name: 'nueva', label: 'Contraseña nueva', type: 'password', minlength: 8, autocomplete: 'new-password' }),
      P.campoForm({ name: 'nueva2', label: 'Repite la contraseña nueva', type: 'password', minlength: 8, autocomplete: 'new-password' }),
      h('h2', { class: 'subtitulo-form' }, 'Confirma que eres tú'),
      P.campoForm({ name: 'actual', label: 'Contraseña actual', type: 'password', required: true, autocomplete: 'current-password' }),
      h('div', { class: 'form-botones' }, h('button', { type: 'submit', class: 'btn btn-oro' }, icono('ti-device-floppy'), ' Guardar')));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const f = form.elements;
      if (f.nueva.value !== f.nueva2.value) return P.nota('Las dos contraseñas nuevas no coinciden.', 'error');
      const boton = form.querySelector('[type=submit]');
      boton.disabled = true;
      try {
        const r = await P.api('cuenta', { metodo: 'POST', cuerpo: { nombre: f.nombre.value.trim(), actual: f.actual.value, nueva: f.nueva.value } });
        P.estado.usuario = r.usuario;
        P.app.pintarMenu();
        P.nota(r.mensaje);
        f.actual.value = f.nueva.value = f.nueva2.value = '';
      } catch (err) {
        P.fallo(err);
      } finally {
        boton.disabled = false;
      }
    });
    cont.replaceChildren(
      P.cabecera({ titulo: 'Mi cuenta', subtitulo: 'Tu nombre y tu contraseña para entrar al panel.' }),
      h('div', { class: 'rejilla-cuenta' },
        h('section', { class: 'tarjeta ficha' },
          h('span', { class: 'avatar avatar-grande' }, P.iniciales(u.nombre)),
          h('b', {}, u.nombre), h('small', {}, '@' + u.usuario),
          P.pill(P.estado.roles[u.rol] || u.rol, u.rol === 'admin' ? 'oro' : 'azul'),
          h('p', { class: 'tenue' }, 'Último acceso: ' + P.fecha(u.ultimo_acceso))),
        h('section', { class: 'tarjeta' }, form)));
  };
})();
