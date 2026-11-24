# Grupo FAHE · web

Web de Grupo FAHE (Caldas de Reis): la portada del grupo y una página para cada una de sus tres empresas. Se edita desde un **panel de administración**. De momento funciona en local con **Laragon**, igual que appdecaldas (repositorio privado, sin publicar en internet).

| Página | Contenido |
| --- | --- |
| `index.html` | Grupo FAHE: las tres empresas, nosotros y contacto |
| `hospederias.html` | Hospederías do Camiño y su Albergue Urraca: disponibilidad, el albergue, la etapa, opiniones |
| `infaes.html` | Infaes: gestión y promoción de bienes inmuebles |
| `caldasgo.html` | Caldas GO: reparto de paquetería (GLS, Tipsa, DHL y Amazon) y zona de reparto |
| `politica-privacidad.html` | Política de privacidad y cookies (faltan NIF y domicilio de cada empresa) |
| `gracias.html` | Confirmación tras enviar un formulario |

## En local con Laragon

| Qué | Dirección |
| --- | --- |
| Web | http://grupofahe.test (o http://localhost/grupofahe/) |
| Panel | http://grupofahe.test/admin/ (o el botón «Panel» de la esquina inferior izquierda de la portada) |

- Laragon sirve la carpeta del proyecto y el `.htaccess` de la raíz lo manda todo a `public/`, la web generada. El código, el contenido y el usuario del panel no son accesibles desde el navegador.
- Primera vez (o en otro PC): `npm install` en la carpeta del proyecto y `npm run build`.

## Panel de administración

Inspirado en los paneles de LocalNode: barra lateral con secciones, cifras, tablas, ventanas y avisos. Se entra con **usuario y contraseña**; la primera vez (sin usuarios) pide crear el administrador, y eso solo se puede hacer desde el propio ordenador.

| Sección | Qué hay |
| --- | --- |
| Resumen | Cifras (páginas, secciones, fotos, usuarios, cambios de la semana), avisos de cosas pendientes (fotos que faltan, datos sin completar, fotos sin usar…), últimos cambios y acceso rápido a las páginas |
| Páginas | Tabla con buscador; editar, ver, duplicar, historial y borrar. Editor con los 17 tipos de sección: añadir, duplicar, reordenar y quitar |
| Fotos | Subir (arrastrando o eligiendo, varias a la vez), ver en qué páginas se usa cada una y borrar las que no se usan (van a `storage/papelera`) |
| Ajustes | Contacto y datos generales, y empresas del menú |
| Usuarios | Crear, editar, desactivar, cambiar la contraseña y borrar. Roles: **Administrador** (todo) y **Editor** (páginas y fotos) |
| Historial | Quién hizo qué y cuándo, con filtros. Cada cambio guarda la versión anterior y la nueva: se ve qué cambió y se puede **deshacer o restaurar** (también recuperar una página borrada) |
| Mi cuenta | Cambiar tu nombre y tu contraseña |

Al guardar, el panel escribe el JSON en `src/_data/` y regenera la web con Eleventy (≈1 s). Si un cambio impidiera generar la web, no se guarda y el archivo queda como estaba. Usuarios e historial están en `storage/panel.sqlite` (SQLite, no va a git). Seguridad: contraseñas con hash, bloqueo de 10 min tras 5 intentos fallidos (y se apuntan en el historial), protección CSRF y sesiones propias. Los cambios de contenido quedan en tu copia local: para llevarlos a GitHub, commit y push como siempre.

**Publicación en internet (pendiente):** el panel necesita PHP, así que donde se publique tendrá que haber PHP y Node (o generar la web en local y subir `public/`). `.github/workflows/deploy.yml` (GitHub Pages) está desactivado desde que el repositorio es privado.

## Cómo está hecha

Web estática generada con [Eleventy](https://www.11ty.dev): plantillas Nunjucks + contenido en JSON. El panel es PHP + JavaScript sin dependencias.

```
src/
  _data/sitio.json        datos generales (teléfonos, WhatsApp, correo, Booking…)
  _data/empresas.json     empresas del menú desplegable
  _data/paginas/*.json    una página por archivo: cabecera, menú, pie y lista de secciones
  _includes/bloques/      el diseño de cada tipo de sección
  _includes/              plantilla base, cabecera, pie y macros
  assets/                 CSS, JS, logos y fotos subidas desde el panel (img/subidas)
  admin/                  panel: acceso (index.php), API (api.php), pantallas (panel/*.js), estilos y campos (esquema.json)
public/                   la web generada (no va a git)
storage/                  usuarios e historial (panel.sqlite), sesiones y papelera de fotos (no va a git)
```

```bash
npm install
npm run build   # genera public/
npm run watch   # regenera public/ con cada cambio al tocar plantillas o CSS a mano
npm run dev     # vista previa aparte en http://localhost:8090 (genera en _dev/)
```

Un tipo de bloque nuevo = una plantilla en `src/_includes/bloques/<tipo>.njk` + su entrada en `src/admin/esquema.json`.

## Contacto

- **Llamar** (`tel:`) y **WhatsApp** (`wa.me`) abren directamente la llamada o el chat.
- **Correo** y **Envíanos tu CV** abren un formulario dentro de la web que llega como correo a la dirección de *Ajustes generales* a través de [FormSubmit](https://formsubmit.co) (la web no tiene servidor propio). El CV se adjunta en PDF (máximo configurable, 5 MB por defecto). Tras enviarse, se muestra `gracias.html`.
- **Activación (una sola vez):** el primer envío manda a ese correo un mensaje de FormSubmit para confirmar la dirección; hasta confirmarlo no llega nada. Después se puede poner en *Ajustes generales → Alias de FormSubmit* el alias que da FormSubmit para no mostrar el correo en el código.

## Pendiente

Fotos reales, logos en alta calidad, NIF y domicilio en la política de privacidad y número REAT de la Xunta.
