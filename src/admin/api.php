<?php
/**
 * API del panel: leer y guardar contenido, crear/borrar páginas y subir fotos.
 * Requiere sesión iniciada y, en las peticiones POST, la cabecera X-CSRF-Token.
 */
declare(strict_types=1);
require __DIR__ . '/inc/comun.php';

iniciarSesion();
if (!usuarioActual()) {
    responder(['error' => 'La sesión ha caducado. Vuelve a entrar.'], 401);
}

$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$accion = (string) ($_GET['accion'] ?? '');

if ($metodo === 'POST' && !csrfValido($_SERVER['HTTP_X_CSRF_TOKEN'] ?? null)) {
    responder(['error' => 'Petición no válida. Recarga el panel.'], 403);
}

/** Cuerpo JSON de la petición (objetos como stdClass para conservar {} y []). */
function entrada(): object
{
    $crudo = file_get_contents('php://input', false, null, 0, 4 * 1024 * 1024);
    try {
        $d = json_decode((string) $crudo, false, 512, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        responder(['error' => 'Datos no válidos.'], 400);
    }
    if (!is_object($d)) {
        responder(['error' => 'Datos no válidos.'], 400);
    }
    return $d;
}

function resultado(array $r, string $mensaje): never
{
    [$ok, $salida] = $r;
    if (!$ok) {
        responder([
            'error'   => 'No se ha podido generar la web con este cambio, así que no se ha guardado.',
            'detalle' => mb_substr($salida, -3000),
        ], 422);
    }
    responder(['ok' => true, 'mensaje' => $mensaje, 'paginas' => listarPaginas()]);
}

try {
    switch ("$metodo $accion") {
        case 'GET estado':
            responder([
                'usuario' => usuarioActual(),
                'csrf'    => csrf(),
                'paginas' => listarPaginas(),
                'ajustes' => array_keys(AJUSTES),
            ]);

        case 'GET leer':
            $ruta = rutaContenido((string) ($_GET['tipo'] ?? ''), (string) ($_GET['id'] ?? ''));
            if (!$ruta || !is_file($ruta)) {
                responder(['error' => 'No existe.'], 404);
            }
            header('Content-Type: application/json; charset=utf-8');
            header('Cache-Control: no-store');
            echo '{"datos":' . file_get_contents($ruta) . '}';
            exit;

        case 'POST guardar':
            $in = entrada();
            $tipo = (string) ($in->tipo ?? '');
            $id = (string) ($in->id ?? '');
            $ruta = rutaContenido($tipo, $id);
            if (!$ruta || !is_file($ruta) || !isset($in->datos) || !is_object($in->datos)) {
                responder(['error' => 'No se puede guardar aquí.'], 400);
            }
            if ($tipo === 'pagina') {
                $in->datos->slug = $id; // la dirección de una página existente no cambia
            }
            resultado(guardarYRegenerar($ruta, codificarJson($in->datos)), 'Guardado. La web ya está actualizada.');

        case 'POST crear':
            $in = entrada();
            $slug = (string) ($in->slug ?? '');
            $titulo = trim((string) ($in->titulo ?? ''));
            if (!slugValido($slug)) {
                responder(['error' => 'La dirección solo puede tener minúsculas, números y guiones.'], 400);
            }
            if ($titulo === '') {
                responder(['error' => 'Pon un título a la página.'], 400);
            }
            $ruta = rutaContenido('pagina', $slug);
            if (is_file($ruta)) {
                responder(['error' => "Ya existe una página «{$slug}»."], 409);
            }
            // Cabecera y pie como la portada; el contenido empieza con una cabecera sencilla
            $portada = json_decode((string) @file_get_contents(rutaContenido('pagina', 'index')));
            $nueva = (object) [
                'slug'       => $slug,
                'titulo_seo' => $titulo . ' · Grupo FAHE',
                'tema'       => 'dorado',
                'marca'      => (object) array_merge((array) ($portada->marca ?? []), ['enlace' => 'index.html']),
                'desplegable'=> $portada->desplegable ?? (object) ['etiqueta' => 'Empresas', 'posicion' => 'inicio'],
                'boton_menu' => (object) ['texto' => 'Contacto', 'enlace' => 'index.html#contacto', 'icono' => 'ti-message-circle', 'estilo' => 'dorado'],
                'pie'        => $portada->pie ?? (object) [],
                'secciones'  => [
                    (object) ['type' => 'cabecera_pagina', 'titulo' => $titulo],
                ],
            ];
            resultado(guardarYRegenerar($ruta, codificarJson($nueva)), 'Página creada.');

        case 'POST borrar':
            $in = entrada();
            $slug = (string) ($in->slug ?? '');
            $ruta = rutaContenido('pagina', $slug);
            if (!$ruta || !is_file($ruta)) {
                responder(['error' => 'No existe.'], 404);
            }
            if (in_array($slug, PAGINAS_PROTEGIDAS, true)) {
                responder(['error' => 'Esta página no se puede borrar: la web la necesita.'], 400);
            }
            $r = guardarYRegenerar($ruta, null);
            if ($r[0]) {
                @unlink(raiz("public/$slug.html")); // Eleventy no borra las páginas que ya no existen
            }
            resultado($r, 'Página borrada.');

        case 'POST subir':
            $f = $_FILES['archivo'] ?? null;
            if (!$f || ($f['error'] ?? 1) !== UPLOAD_ERR_OK) {
                $limite = ($f['error'] ?? 0) === UPLOAD_ERR_INI_SIZE || ($f['error'] ?? 0) === UPLOAD_ERR_FORM_SIZE;
                responder(['error' => $limite ? 'La foto pesa demasiado.' : 'No ha llegado ninguna foto.'], 400);
            }
            if ($f['size'] > MAX_FOTO_MB * 1024 * 1024) {
                responder(['error' => 'La foto pesa más de ' . MAX_FOTO_MB . ' MB.'], 400);
            }
            $tipos = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif'];
            $mime = (new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']) ?: '';
            if (!isset($tipos[$mime]) || !@getimagesize($f['tmp_name'])) {
                responder(['error' => 'Solo se admiten fotos JPG, PNG, WebP o GIF.'], 400);
            }
            $nombre = slugArchivo(pathinfo((string) $f['name'], PATHINFO_FILENAME)) . '-' . bin2hex(random_bytes(3)) . '.' . $tipos[$mime];
            $destino = raiz('src/assets/img/subidas/' . $nombre);
            if (!is_dir(dirname($destino))) {
                mkdir(dirname($destino), 0775, true);
            }
            if (!move_uploaded_file($f['tmp_name'], $destino)) {
                responder(['error' => 'No se pudo guardar la foto.'], 500);
            }
            [$ok, $salida] = regenerarWeb(); // copia la foto a public/
            responder(['ok' => true, 'ruta' => 'assets/img/subidas/' . $nombre, 'aviso' => $ok ? null : $salida]);

        case 'POST salir':
            $_SESSION = [];
            session_destroy();
            responder(['ok' => true]);

        default:
            responder(['error' => 'Acción desconocida.'], 404);
    }
} catch (Throwable $e) {
    responder(['error' => 'Error del servidor: ' . $e->getMessage()], 500);
}
