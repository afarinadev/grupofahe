# Grupo FAHE · web

Web estática de Grupo FAHE (Caldas de Reis): la portada del grupo y una página para cada una de sus tres empresas.

| Página | Contenido |
| --- | --- |
| `index.html` | Grupo FAHE: las tres empresas, nosotros y contacto |
| `hospederias.html` | Hospederías do Camiño y su Albergue Urraca: disponibilidad, el albergue, la etapa, opiniones |
| `infaes.html` | Infaes: gestión y promoción de bienes inmuebles |
| `caldasgo.html` | Caldas GO: reparto de paquetería (GLS, Tipsa, DHL y Amazon) y zona de reparto |
| `politica-privacidad.html` | Política de privacidad y cookies (faltan NIF y domicilio de cada empresa) |
| `gracias.html` | Confirmación tras enviar un formulario |

Solo HTML, CSS y JavaScript, sin dependencias ni compilación.

## Contacto

- **Llamar** (`tel:`) y **WhatsApp** (`wa.me`) abren directamente la llamada o el chat.
- **Correo** y **Envíanos tu CV** abren un formulario dentro de la web que llega como correo a `hospederiasdocaminosl@gmail.com` a través de [FormSubmit](https://formsubmit.co) (la web no tiene servidor propio). El CV se adjunta en PDF, máximo 5 MB. Tras enviarse, se muestra `gracias.html`.
- **Activación (una sola vez):** el primer envío manda a ese correo un mensaje de FormSubmit para confirmar la dirección; hasta confirmarlo no llega nada. Después se puede cambiar el correo de `FORM_ACTION` en `assets/js/main.js` por el alias que da FormSubmit.

## Verla en local

```bash
php -S localhost:8090 -t .
```

## Pendiente

Los bloques marcados con `<!-- PENDIENTE -->` en el HTML: fotos reales, logos en alta calidad, servicios de Infaes, número REAT de la Xunta y páginas legales.
