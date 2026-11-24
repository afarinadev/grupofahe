/* ==========================================================================
   Panel de Grupo FAHE — arranque, menú y navegación
   Rutas: #resumen #paginas #pagina/<slug>[/<sección>] #fotos #ajustes/<id>
          #usuarios #historial[/<tipo:id>] #cuenta
   ========================================================================== */
'use strict';

(() => {
  const { h, icono } = P;
  const cont = document.getElementById('contenido');
  const menu = document.getElementById('menu');
  let rutaActual = '';

  const SECCIONES = [
    { id: 'resumen', texto: 'Resumen', icono: 'ti-layout-dashboard' },
    { id: 'paginas', texto: 'Páginas', icono: 'ti-files', contador: () => P.estado.paginas.length },
    { id: 'fotos', texto: 'Fotos', icono: 'ti-photo' },
    { id: 'ajustes', texto: 'Ajustes', icono: 'ti-adjustments-horizontal', admin: true },
    { id: 'usuarios', texto: 'Usuarios', icono: 'ti-users', admin: true },
    { id: 'historial', texto: 'Historial', icono: 'ti-history', admin: true },
  ];
  const seccionDe = (ruta) => {
    const s = ruta.split('/')[0];
    return s === 'pagina' ? 'paginas' : s;
  };

  function pintarMenu() {
    const actual = seccionDe(rutaActual);
    menu.replaceChildren(...SECCIONES.filter((s) => !s.admin || P.esAdmin()).map((s) => h('a', {
      href: '#' + s.id, class: 'menu-enlace' + (actual === s.id ? ' activo' : ''), 'aria-current': actual === s.id ? 'page' : null,
    }, icono(s.icono), h('span', {}, s.texto), s.contador ? h('span', { class: 'menu-contador' }, String(s.contador())) : null)));
    const u = P.estado.usuario;
    const yo = document.getElementById('yo');
    yo.replaceChildren(
      h('span', { class: 'avatar' }, P.iniciales(u.nombre)),
      h('span', { class: 'yo-texto' }, h('b', {}, u.nombre), h('small', {}, P.estado.roles[u.rol] || u.rol)),
      icono('ti-settings'));
    yo.classList.toggle('activo', actual === 'cuenta');
    yo.title = 'Mi cuenta';
  }

  function cerrarMenu() {
    document.body.classList.remove('menu-abierto');
    document.querySelector('.menu-movil')?.setAttribute('aria-expanded', 'false');
  }

  async function ir() {
    const ruta = decodeURIComponent(location.hash.slice(1)) || 'resumen';
    const [sec, a, b] = ruta.split('/');
    rutaActual = ruta;
    P.estado.sucio = false;
    P.estado.guardar = null;
    document.body.classList.remove('con-cambios');
    cerrarMenu();
    pintarMenu();
    window.scrollTo(0, 0);
    try {
      switch (sec) {
        case 'resumen': await P.vistas.resumen(cont); break;
        case 'paginas': await P.vistas.paginas(cont); break;
        case 'pagina': await P.vistas.pagina(cont, { slug: a, seccion: b }); break;
        case 'fotos': await P.vistas.fotos(cont); break;
        case 'ajustes': await P.vistas.ajustes(cont, { id: a }); break;
        case 'usuarios': await P.vistas.usuarios(cont); break;
        case 'historial': await P.vistas.historial(cont, { entidad: a }); break;
        case 'cuenta': await P.vistas.cuenta(cont); break;
        default: location.replace('#resumen'); return;
      }
    } catch (e) {
      cont.replaceChildren(h('p', { class: 'aviso aviso-error' }, icono('ti-alert-circle'), ' ', e.message));
    }
    const titulo = cont.querySelector('h1')?.textContent;
    document.title = (titulo ? titulo + ' · ' : '') + 'Panel · Grupo FAHE';
  }

  P.app = { pintarMenu, recargar: ir };

  window.addEventListener('hashchange', async () => {
    const nueva = location.hash;
    if (P.estado.sucio) {
      history.replaceState(null, '', '#' + rutaActual); // se vuelve atrás mientras se pregunta
      const ok = await P.confirmar('Tienes cambios sin guardar. Si sales de esta pantalla, se perderán.', { titulo: 'Cambios sin guardar', boton: 'Salir sin guardar', peligro: true });
      if (!ok) return;
      P.estado.sucio = false;
      history.replaceState(null, '', nueva);
    }
    ir();
  });

  window.addEventListener('beforeunload', (e) => {
    if (P.estado.sucio) { e.preventDefault(); e.returnValue = ''; }
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      P.estado.guardar?.();
    }
    if (e.key === 'Escape') cerrarMenu();
  });

  document.querySelector('.menu-movil').addEventListener('click', (e) => {
    const abierto = document.body.classList.toggle('menu-abierto');
    e.currentTarget.setAttribute('aria-expanded', String(abierto));
  });
  document.querySelector('[data-cerrar-menu]').addEventListener('click', cerrarMenu);
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) cerrarMenu(); });

  document.getElementById('salir').addEventListener('click', async () => {
    if (P.estado.sucio && !await P.confirmar('Tienes cambios sin guardar. ¿Salir de todas formas?', { titulo: 'Salir', boton: 'Salir', peligro: true })) return;
    P.estado.sucio = false;
    try { await P.api('salir', { metodo: 'POST' }); } catch { /* da igual: se recarga */ }
    location.href = './';
  });

  // Mantiene viva la sesión mientras el panel está abierto
  setInterval(() => { P.api('estado').catch(() => {}); }, 5 * 60 * 1000);

  (async () => {
    try {
      const [esquema, estado] = await Promise.all([
        fetch('esquema.json', { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error('falta esquema.json'); return r.json(); }),
        P.api('estado'),
      ]);
      P.esquema = esquema;
      Object.assign(P.estado, { usuario: estado.usuario, paginas: estado.paginas, ajustes: estado.ajustes, roles: estado.roles });
    } catch (e) {
      cont.replaceChildren(h('p', { class: 'aviso aviso-error' }, 'No se pudo cargar el panel: ' + e.message));
      return;
    }
    ir();
  })();
})();
