// Configuración de Eleventy: genera la web estática en _site/ a partir de
// - src/_data/sitio.json        → ajustes generales (teléfonos, correo, WhatsApp…)
// - src/_data/empresas.json     → empresas del menú desplegable
// - src/_data/paginas/*.json    → una página por archivo, hecha de bloques (secciones)
// Todo eso se edita desde el panel /admin (Sveltia CMS).
import markdownIt from 'markdown-it';

const slugify = (text) => String(text)
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/^\s*\d+[.)]\s*/, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ 'src/assets': 'assets' });
  eleventyConfig.addPassthroughCopy({ 'src/admin': 'admin' });
  eleventyConfig.addWatchTarget('src/assets/');
  eleventyConfig.addGlobalData('anio', () => new Date().getFullYear());

  // Markdown para los textos largos (p. ej. la política de privacidad).
  // Los títulos ## reciben un id automático: "7. Cookies" → id="cookies".
  const md = markdownIt({ html: true, linkify: true, typographer: true });
  md.core.ruler.push('ids_titulos', (state) => {
    state.tokens.forEach((tok, i) => {
      if (tok.type === 'heading_open' && !tok.attrGet('id')) {
        const inline = state.tokens[i + 1];
        if (inline && inline.content) tok.attrSet('id', slugify(inline.content));
      }
    });
  });
  eleventyConfig.addFilter('md', (s) => md.render(s || ''));
  eleventyConfig.addFilter('mdLinea', (s) => md.renderInline(s || ''));

  // Utilidades para las plantillas
  eleventyConfig.addFilter('soloDigitos', (s) => String(s || '').replace(/[^\d+]/g, ''));
  eleventyConfig.addFilter('coma', (n) => String(n ?? '').replace('.', ','));
  eleventyConfig.addFilter('json', (v) => JSON.stringify(v ?? null).replace(/</g, '\\u003c'));
  eleventyConfig.addFilter('url', (slug) => `${slug || 'index'}.html`);
  eleventyConfig.addFilter('retraso', (i) => (i > 0 ? ` d${Math.min(i, 3)}` : ''));
  eleventyConfig.addFilter('color', (c) => ({ dorado: 'pc-gold', coral: 'pc-coral', turquesa: 'pc-teal', azul: 'pc-blue' }[c] || ''));
  eleventyConfig.addFilter('tema', (t) => ({ turquesa: 'theme-go', coral: 'theme-infaes' }[t] || ''));
  eleventyConfig.addFilter('rango', (n) => Array.from({ length: Number(n) || 0 }, (_, i) => i + 1));
  // Agrupa los campos de un formulario: los marcados "mitad" van de dos en dos en la misma fila
  eleventyConfig.addFilter('filas', (campos = []) => {
    const filas = [];
    for (let i = 0; i < campos.length; i += 1) {
      const c = campos[i];
      if (c.mitad && campos[i + 1] && campos[i + 1].mitad) { filas.push([c, campos[i + 1]]); i += 1; } else filas.push([c]);
    }
    return filas;
  });
  // Tema de cada página (para la página "gracias", que adopta el color de la página de origen)
  eleventyConfig.addFilter('temasPaginas', (paginas = {}) => Object.fromEntries(
    Object.values(paginas).map((p) => [`${p.slug}.html`, ({ turquesa: 'theme-go', coral: 'theme-infaes' }[p.tema] || '')]),
  ));

  return {
    dir: { input: 'src', includes: '_includes', data: '_data', output: '_site' },
    templateFormats: ['njk'],
    htmlTemplateEngine: 'njk',
  };
}
