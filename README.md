# Grupo FAHE · web

Web de Grupo FAHE (Caldas de Reis): la portada del grupo y una página para cada una de sus tres empresas. Se edita desde un **panel de administración** y se publica sola en GitHub Pages.

| Página | Contenido |
| --- | --- |
| `index.html` | Grupo FAHE: las tres empresas, nosotros y contacto |
| `hospederias.html` | Hospederías do Camiño y su Albergue Urraca: disponibilidad, el albergue, la etapa, opiniones |
| `infaes.html` | Infaes: gestión y promoción de bienes inmuebles |
| `caldasgo.html` | Caldas GO: reparto de paquetería (GLS, Tipsa, DHL y Amazon) y zona de reparto |
| `politica-privacidad.html` | Política de privacidad y cookies (faltan NIF y domicilio de cada empresa) |
| `gracias.html` | Confirmación tras enviar un formulario |

## Panel de administración

Está en **`/admin/`** (https://afarinadev.github.io/grupofahe/admin/). Desde ahí se puede:

- Editar cualquier texto, botón, enlace, foto o dato de contacto de cualquier página.
- Añadir, quitar y reordenar secciones de una página (17 tipos de bloque: portada, tarjetas, pasos, opiniones, contacto, texto largo…).
- **Crear páginas nuevas** combinando esos bloques.
- Cambiar los datos generales (teléfonos, WhatsApp, correo, enlace de Booking) y las empresas del menú.

Cada vez que se guarda, el panel hace un commit en este repositorio y GitHub Actions vuelve a generar y publicar la web (1–2 minutos).

**Entrar:** en la pantalla del panel, «Iniciar sesión con un token de acceso» (el botón «Iniciar sesión con GitHub» no funciona en GitHub Pages) y pegar un *fine-grained personal access token* de GitHub (Settings → Developer settings → Personal access tokens → Fine-grained) con acceso solo a este repositorio y permiso **Contents: Read and write**. El token se guarda solo en ese navegador.

**En local, sin GitHub:** con `npm run dev` abierto, ir a http://localhost:8090/admin/ en Chrome o Edge y elegir «Trabajar con un repositorio local» → carpeta del proyecto. Los cambios se guardan en los archivos y se ven al momento en http://localhost:8090.

## Cómo está hecha

Web estática generada con [Eleventy](https://www.11ty.dev): plantillas Nunjucks + contenido en JSON.

```
src/
  _data/sitio.json        datos generales (teléfonos, WhatsApp, correo, Booking…)
  _data/empresas.json     empresas del menú desplegable
  _data/paginas/*.json    una página por archivo: cabecera, menú, pie y lista de secciones
  _includes/bloques/      el diseño de cada tipo de sección
  _includes/              plantilla base, cabecera, pie y macros
  assets/                 CSS, JS, logos y fotos subidas desde el panel (img/subidas)
  admin/                  panel (Sveltia CMS) y su configuración (config.yml)
```

```bash
npm install
npm run dev     # http://localhost:8090 con recarga automática
npm run build   # genera _site/
```

Un tipo de bloque nuevo = una plantilla en `src/_includes/bloques/<tipo>.njk` + su entrada en `src/admin/config.yml`.

## Contacto

- **Llamar** (`tel:`) y **WhatsApp** (`wa.me`) abren directamente la llamada o el chat.
- **Correo** y **Envíanos tu CV** abren un formulario dentro de la web que llega como correo a la dirección de *Ajustes generales* a través de [FormSubmit](https://formsubmit.co) (la web no tiene servidor propio). El CV se adjunta en PDF (máximo configurable, 5 MB por defecto). Tras enviarse, se muestra `gracias.html`.
- **Activación (una sola vez):** el primer envío manda a ese correo un mensaje de FormSubmit para confirmar la dirección; hasta confirmarlo no llega nada. Después se puede poner en *Ajustes generales → Alias de FormSubmit* el alias que da FormSubmit para no mostrar el correo en el código.

## Pendiente

Fotos reales, logos en alta calidad, NIF y domicilio en la política de privacidad y número REAT de la Xunta.
