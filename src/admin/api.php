<?php
/**
 * API del panel de Grupo FAHE.
 * Requiere sesión iniciada y, en las peticiones POST, la cabecera X-CSRF-Token.
 * Roles: «admin» puede todo; «editor» edita páginas y fotos.
 */
declare(strict_types=1);
require __DIR__ . '/inc/comun.php';

iniciarSesion();
$yo = usuarioActual();
if (!$yo) {
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

function soloAdmin(): void
{
    if (!esAdmin()) {
        responder(['error' => 'Solo un administrador puede hacer esto.'], 403);
    }
}

function fallo(string $salida): never
{
    responder([
        'error'   => 'No se ha podido generar la web con este cambio, así que no se ha guardado.',
        'detalle' => mb_substr($salida, -3000),
    ], 422);
}

/** Datos de usuario que se pueden enseñar (nunca el hash). */
function usuarioPublico(array $u): array
{
    return [
        'id'            => (int) $u['id'],
        'usuario'       => $u['usuario'],
        'nombre'        => $u['nombre'],
        'rol'           => $u['rol'],
        'activo'        => (bool) ($u['activo'] ?? true),
        'creado'        => $u['creado'] ?? null,
        'ultimo_acceso' => $u['ultimo_acceso'] ?? null,
    ];
}

function avisos(array $paginas, array $fotos): array
{
    $avisos = [];
    if (!is_file(raiz('node_modules/@11ty/eleventy/cmd.cjs'))) {
        $avisos[] = ['nivel' => 'error', 'texto' => 'Faltan las dependencias: ejecuta «npm install» en la carpeta del proyecto o el panel no podrá actualizar la web.'];
    }
    foreach (archivosPaginas() as $f) {
        $slug = basename($f, '.json');
        $txt = (string) file_get_contents($f);
        $d = json_decode($txt);
        $nombre = tituloContenido('pagina', $slug, $txt);
        if (str_contains($txt, "class='pending'") || str_contains($txt, 'class=\"pending\"')) {
            $avisos[] = ['nivel' => 'aviso', 'texto' => "«{$nombre}» tiene datos pendientes de completar.", 'enlace' => "#pagina/$slug"];
        }
        foreach ((is_object($d) && is_array($d->secciones ?? null)) ? $d->secciones : [] as $i => $s) {
            if (($s->type ?? '') === 'foto_lista' && empty($s->foto)) {
                $sec = trim(($s->titulo ?? '') . ' ' . ($s->destacado ?? '')) ?: 'Foto + lista';
                $avisos[] = ['nivel' => 'aviso', 'texto' => "«{$nombre}»: la sección «{$sec}» todavía no tiene foto.", 'enlace' => "#pagina/$slug/" . $i];
            }
        }
        if (is_object($d) && !empty($d->noindex) && $slug !== 'gracias') {
            $avisos[] = ['nivel' => 'info', 'texto' => "«{$nombre}» está oculta a Google.", 'enlace' => "#pagina/$slug"];
        }
    }
    $sinUsar = count(array_filter($fotos, fn ($f) => $f['grupo'] === 'subida' && !$f['usos']));
    if ($sinUsar) {
        $avisos[] = ['nivel' => 'info', 'texto' => $sinUsar === 1 ? 'Hay 1 foto subida que no se usa en ninguna página.' : "Hay {$sinUsar} fotos subidas que no se usan en ninguna página.", 'enlace' => '#fotos'];
    }
    if (esAdmin() && adminsActivos() < 2) {
        $avisos[] = ['nivel' => 'info', 'texto' => 'Solo hay un administrador. Crea otro por si alguna vez se pierde la contraseña.', 'enlace' => '#usuarios'];
    }
    return $avisos;
}

try {
    switch ("$metodo $accion") {

        /* ------------------------------------------------------ general */

        case 'GET estado':
            responder([
                'usuario' => usuarioPublico($yo),
                'csrf'    => csrf(),
                'paginas' => listarPaginas(),
                'ajustes' => esAdmin() ? array_map(fn ($id, $a) => ['id' => $id, 'titulo' => $a['titulo']], array_keys(AJUSTES), AJUSTES) : [],
                'roles'   => ROLES,
            ]);

        case 'GET resumen':
            $paginas = listarPaginas(true);
            $fotos = listarFotos();
            $cambios = "accion NOT IN ('entrar', 'salir', 'acceso fallido')";
            $semana = db()->prepare("SELECT COUNT(*) FROM historial WHERE $cambios AND fecha >= ?");
            $semana->execute([date('Y-m-d H:i:s', strtotime('-7 days'))]);
            $ultimos = db()->query("SELECT id, fecha, usuario, accion, tipo, entidad, titulo FROM historial WHERE $cambios ORDER BY id DESC LIMIT 8")->fetchAll();
            responder([
                'cifras' => [
                    'paginas'   => count($paginas),
                    'secciones' => array_sum(array_column($paginas, 'secciones')),
                    'fotos'     => count(array_filter($fotos, fn ($f) => $f['grupo'] === 'subida')),
                    'usuarios'  => esAdmin() ? (int) db()->query('SELECT COUNT(*) FROM usuarios WHERE activo = 1')->fetchColumn() : null,
                    'cambios7'  => (int) $semana->fetchColumn(),
                ],
                'avisos'  => avisos($paginas, $fotos),
                'ultimos' => $ultimos,
                'paginas' => $paginas,
            ]);

        /* ------------------------------------------------------ páginas */

        case 'GET paginas':
            responder(['paginas' => listarPaginas(true)]);

        case 'GET leer':
            $tipo = (string) ($_GET['tipo'] ?? '');
            if ($tipo === 'ajuste') {
                soloAdmin();
            }
            $ruta = rutaContenido($tipo, (string) ($_GET['id'] ?? ''));
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
            if ($tipo === 'ajuste') {
                soloAdmin();
            }
            $ruta = rutaContenido($tipo, $id);
            if (!$ruta || !is_file($ruta) || !isset($in->datos) || !is_object($in->datos)) {
                responder(['error' => 'No se puede guardar aquí.'], 400);
            }
            if ($tipo === 'pagina') {
                $in->datos->slug = $id; // la dirección de una página existente no cambia
            }
            $nuevo = codificarJson($in->datos);
            [$ok, $salida, $antes] = guardarYRegenerar($ruta, $nuevo);
            if (!$ok) {
                fallo($salida);
            }
            if ($antes !== $nuevo) {
                registrar('guardar', $tipo, $id, tituloContenido($tipo, $id, $nuevo), $antes, $nuevo);
            }
            responder(['ok' => true, 'mensaje' => 'Guardado. La web ya está actualizada.', 'paginas' => listarPaginas()]);

        case 'POST crear':
        case 'POST duplicar':
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
            if ($accion === 'duplicar') {
                $origen = rutaContenido('pagina', (string) ($in->origen ?? ''));
                if (!$origen || !is_file($origen)) {
                    responder(['error' => 'La página que quieres copiar no existe.'], 404);
                }
                $nueva = json_decode((string) file_get_contents($origen));
                $nueva->slug = $slug;
                $nueva->titulo_seo = $titulo . ' · Grupo FAHE';
            } else {
                // Cabecera y pie como la portada; el contenido empieza con una cabecera sencilla
                $portada = json_decode((string) @file_get_contents(rutaContenido('pagina', 'index')));
                $nueva = (object) [
                    'slug'        => $slug,
                    'titulo_seo'  => $titulo . ' · Grupo FAHE',
                    'tema'        => 'dorado',
                    'marca'       => (object) array_merge((array) ($portada->marca ?? []), ['enlace' => 'index.html']),
                    'desplegable' => $portada->desplegable ?? (object) ['etiqueta' => 'Empresas', 'posicion' => 'inicio'],
                    'boton_menu'  => (object) ['texto' => 'Contacto', 'enlace' => 'index.html#contacto', 'icono' => 'ti-message-circle', 'estilo' => 'dorado'],
                    'pie'         => $portada->pie ?? (object) [],
                    'secciones'   => [(object) ['type' => 'cabecera_pagina', 'titulo' => $titulo]],
                ];
            }
            $contenido = codificarJson($nueva);
            [$ok, $salida] = guardarYRegenerar($ruta, $contenido);
            if (!$ok) {
                fallo($salida);
            }
            registrar($accion === 'duplicar' ? 'duplicar' : 'crear', 'pagina', $slug, $titulo, null, $contenido);
            responder(['ok' => true, 'slug' => $slug, 'mensaje' => $accion === 'duplicar' ? 'Página duplicada.' : 'Página creada.', 'paginas' => listarPaginas()]);

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
            [$ok, $salida, $antes] = guardarYRegenerar($ruta, null);
            if (!$ok) {
                fallo($salida);
            }
            @unlink(raiz("public/$slug.html")); // Eleventy no borra las páginas que ya no existen
            registrar('borrar', 'pagina', $slug, tituloContenido('pagina', $slug, $antes), $antes, null);
            responder(['ok' => true, 'mensaje' => 'Página borrada. Puedes recuperarla desde el historial.', 'paginas' => listarPaginas()]);

        /* -------------------------------------------------------- fotos */

        case 'GET fotos':
            responder(['fotos' => listarFotos(), 'max_mb' => MAX_FOTO_MB]);

        case 'POST subir':
            $f = $_FILES['archivo'] ?? null;
            if (!$f || ($f['error'] ?? 1) !== UPLOAD_ERR_OK) {
                $limite = in_array($f['error'] ?? 0, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true);
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
            $destino = raiz('src/' . CARPETA_SUBIDAS . '/' . $nombre);
            if (!is_dir(dirname($destino))) {
                mkdir(dirname($destino), 0775, true);
            }
            if (!move_uploaded_file($f['tmp_name'], $destino)) {
                responder(['error' => 'No se pudo guardar la foto.'], 500);
            }
            [$ok, $salida] = regenerarWeb(); // copia la foto a public/
            registrar('subir foto', 'foto', CARPETA_SUBIDAS . '/' . $nombre, $nombre);
            responder(['ok' => true, 'ruta' => CARPETA_SUBIDAS . '/' . $nombre, 'aviso' => $ok ? null : $salida]);

        case 'POST borrar_foto':
            $in = entrada();
            $ruta = (string) ($in->ruta ?? '');
            if (!preg_match('#^' . preg_quote(CARPETA_SUBIDAS, '#') . '/[a-z0-9-]+\.(jpg|png|webp|gif)$#', $ruta) || !is_file(raiz('src/' . $ruta))) {
                responder(['error' => 'Solo se pueden borrar las fotos subidas desde el panel.'], 400);
            }
            foreach (listarFotos() as $foto) {
                if ($foto['ruta'] === $ruta && $foto['usos']) {
                    $donde = implode(', ', array_map(fn ($u) => '«' . $u['titulo'] . '»', $foto['usos']));
                    responder(['error' => "No se puede borrar: se usa en $donde."], 409);
                }
            }
            // No se borra del todo: va a storage/papelera por si hiciera falta recuperarla
            $papelera = carpetaStorage('papelera');
            rename(raiz('src/' . $ruta), $papelera . DIRECTORY_SEPARATOR . date('Ymd-His-') . basename($ruta));
            @unlink(raiz('public/' . $ruta));
            registrar('borrar foto', 'foto', $ruta, basename($ruta));
            responder(['ok' => true, 'mensaje' => 'Foto borrada.']);

        /* ----------------------------------------------------- usuarios */

        case 'GET usuarios':
            soloAdmin();
            $filas = db()->query('SELECT * FROM usuarios ORDER BY activo DESC, rol, nombre COLLATE NOCASE')->fetchAll();
            responder(['usuarios' => array_map('usuarioPublico', $filas), 'roles' => ROLES]);

        case 'POST usuario_guardar':
            soloAdmin();
            $in = entrada();
            $id = (int) ($in->id ?? 0);
            $usuario = trim((string) ($in->usuario ?? ''));
            $nombre = trim((string) ($in->nombre ?? ''));
            $rol = (string) ($in->rol ?? '');
            $activo = !empty($in->activo);
            if (!usuarioValido($usuario)) {
                responder(['error' => 'El usuario debe tener entre 3 y 40 caracteres (letras, números, punto, guion o @).'], 400);
            }
            if ($nombre === '' || mb_strlen($nombre) > 60) {
                responder(['error' => 'Escribe el nombre (máximo 60 caracteres).'], 400);
            }
            if (!isset(ROLES[$rol])) {
                responder(['error' => 'Rol no válido.'], 400);
            }
            $otro = buscarUsuario($usuario);
            if ($otro && (int) $otro['id'] !== $id) {
                responder(['error' => "Ya existe el usuario «{$usuario}»."], 409);
            }
            if ($id === 0) {
                $contrasena = (string) ($in->contrasena ?? '');
                if (mb_strlen($contrasena) < 8) {
                    responder(['error' => 'La contraseña debe tener al menos 8 caracteres.'], 400);
                }
                crearUsuario($usuario, $nombre, $rol, $contrasena);
                registrar('crear usuario', 'usuario', $usuario, "$nombre ($usuario, " . ROLES[$rol] . ')');
                responder(['ok' => true, 'mensaje' => 'Usuario creado.']);
            }
            $actual = db()->prepare('SELECT * FROM usuarios WHERE id = ?');
            $actual->execute([$id]);
            $actual = $actual->fetch();
            if (!$actual) {
                responder(['error' => 'Ese usuario ya no existe.'], 404);
            }
            if ($id === (int) $yo['id'] && (!$activo || $rol !== 'admin')) {
                responder(['error' => 'No puedes quitarte a ti mismo el acceso de administrador.'], 400);
            }
            if ($actual['rol'] === 'admin' && (int) $actual['activo'] === 1 && ($rol !== 'admin' || !$activo) && adminsActivos() < 2) {
                responder(['error' => 'Tiene que quedar al menos un administrador activo.'], 400);
            }
            db()->prepare('UPDATE usuarios SET usuario = ?, nombre = ?, rol = ?, activo = ? WHERE id = ?')->execute([$usuario, $nombre, $rol, $activo ? 1 : 0, $id]);
            $cambios = [];
            foreach (['usuario' => $usuario, 'nombre' => $nombre, 'rol' => $rol] as $k => $v) {
                if ($actual[$k] !== $v) {
                    $cambios[] = "$k: {$actual[$k]} → $v";
                }
            }
            if ((bool) $actual['activo'] !== $activo) {
                $cambios[] = $activo ? 'reactivado' : 'desactivado';
            }
            registrar('editar usuario', 'usuario', $usuario, "$nombre ($usuario)" . ($cambios ? ' · ' . implode(', ', $cambios) : ''));
            responder(['ok' => true, 'mensaje' => 'Usuario guardado.']);

        case 'POST usuario_contrasena':
            soloAdmin();
            $in = entrada();
            $id = (int) ($in->id ?? 0);
            $contrasena = (string) ($in->contrasena ?? '');
            if (mb_strlen($contrasena) < 8) {
                responder(['error' => 'La contraseña debe tener al menos 8 caracteres.'], 400);
            }
            $st = db()->prepare('SELECT * FROM usuarios WHERE id = ?');
            $st->execute([$id]);
            $u = $st->fetch();
            if (!$u) {
                responder(['error' => 'Ese usuario ya no existe.'], 404);
            }
            db()->prepare('UPDATE usuarios SET hash = ? WHERE id = ?')->execute([password_hash($contrasena, PASSWORD_DEFAULT), $id]);
            registrar('cambiar contraseña', 'usuario', $u['usuario'], "{$u['nombre']} ({$u['usuario']})");
            responder(['ok' => true, 'mensaje' => "Contraseña de {$u['nombre']} cambiada."]);

        case 'POST usuario_borrar':
            soloAdmin();
            $in = entrada();
            $id = (int) ($in->id ?? 0);
            if ($id === (int) $yo['id']) {
                responder(['error' => 'No puedes borrar tu propio usuario.'], 400);
            }
            $st = db()->prepare('SELECT * FROM usuarios WHERE id = ?');
            $st->execute([$id]);
            $u = $st->fetch();
            if (!$u) {
                responder(['error' => 'Ese usuario ya no existe.'], 404);
            }
            if ($u['rol'] === 'admin' && (int) $u['activo'] === 1 && adminsActivos() < 2) {
                responder(['error' => 'Tiene que quedar al menos un administrador activo.'], 400);
            }
            db()->prepare('DELETE FROM usuarios WHERE id = ?')->execute([$id]);
            registrar('borrar usuario', 'usuario', $u['usuario'], "{$u['nombre']} ({$u['usuario']})");
            responder(['ok' => true, 'mensaje' => 'Usuario borrado.']);

        /* ---------------------------------------------------- historial */

        case 'GET historial':
            soloAdmin();
            $donde = [];
            $params = [];
            if (($u = (string) ($_GET['usuario'] ?? '')) !== '') {
                $donde[] = 'usuario = ?';
                $params[] = $u;
            }
            if (($a = (string) ($_GET['accion_filtro'] ?? '')) !== '') {
                $donde[] = 'accion = ?';
                $params[] = $a;
            }
            if (($ent = (string) ($_GET['entidad'] ?? '')) !== '' && str_contains($ent, ':')) {
                [$t, $e] = explode(':', $ent, 2);
                $donde[] = 'tipo = ? AND entidad = ?';
                array_push($params, $t, $e);
            }
            $where = $donde ? 'WHERE ' . implode(' AND ', $donde) : '';
            $porPagina = 25;
            $pagina = max(1, (int) ($_GET['pagina'] ?? 1));
            $total = db()->prepare("SELECT COUNT(*) FROM historial $where");
            $total->execute($params);
            $total = (int) $total->fetchColumn();
            $st = db()->prepare("SELECT id, fecha, usuario, accion, tipo, entidad, titulo, antes IS NOT NULL AS hay_antes, despues IS NOT NULL AS hay_despues FROM historial $where ORDER BY id DESC LIMIT $porPagina OFFSET " . (($pagina - 1) * $porPagina));
            $st->execute($params);
            $entidades = db()->query("SELECT tipo, entidad, MAX(id) AS ult FROM historial WHERE tipo IN ('pagina', 'ajuste') GROUP BY tipo, entidad ORDER BY tipo, entidad")->fetchAll();
            $tituloDe = db()->prepare('SELECT titulo FROM historial WHERE id = ?');
            foreach ($entidades as &$en) {
                $tituloDe->execute([$en['ult']]);
                $en['titulo'] = $tituloDe->fetchColumn() ?: $en['entidad'];
                unset($en['ult']);
            }
            responder([
                'filas'     => $st->fetchAll(),
                'total'     => $total,
                'pagina'    => $pagina,
                'paginas'   => max(1, (int) ceil($total / $porPagina)),
                'usuarios'  => db()->query('SELECT DISTINCT usuario FROM historial WHERE usuario IS NOT NULL ORDER BY usuario')->fetchAll(PDO::FETCH_COLUMN),
                'acciones'  => db()->query('SELECT DISTINCT accion FROM historial ORDER BY accion')->fetchAll(PDO::FETCH_COLUMN),
                'entidades' => $entidades,
            ]);

        case 'GET historial_ver':
            soloAdmin();
            $st = db()->prepare('SELECT * FROM historial WHERE id = ?');
            $st->execute([(int) ($_GET['id'] ?? 0)]);
            $h = $st->fetch();
            if (!$h) {
                responder(['error' => 'No existe.'], 404);
            }
            $h['restaurable'] = in_array($h['tipo'], ['pagina', 'ajuste'], true);
            responder(['entrada' => $h]);

        case 'POST restaurar':
            soloAdmin();
            $in = entrada();
            $version = ($in->version ?? '') === 'despues' ? 'despues' : 'antes';
            $st = db()->prepare('SELECT * FROM historial WHERE id = ?');
            $st->execute([(int) ($in->id ?? 0)]);
            $h = $st->fetch();
            if (!$h || !in_array($h['tipo'], ['pagina', 'ajuste'], true) || $h[$version] === null) {
                responder(['error' => 'Esa versión no se puede restaurar.'], 400);
            }
            $datos = json_decode($h[$version]);
            $ruta = rutaContenido($h['tipo'], (string) $h['entidad']);
            if (!is_object($datos) || !$ruta) {
                responder(['error' => 'La versión guardada no es válida.'], 400);
            }
            if ($h['tipo'] === 'pagina') {
                $datos->slug = $h['entidad'];
            }
            $contenido = codificarJson($datos);
            [$ok, $salida, $antes] = guardarYRegenerar($ruta, $contenido);
            if (!$ok) {
                fallo($salida);
            }
            $cuando = date('d/m/Y H:i', strtotime($h['fecha']));
            registrar('restaurar', $h['tipo'], $h['entidad'], tituloContenido($h['tipo'], $h['entidad'], $contenido) . " (versión del $cuando)", $antes, $contenido);
            responder(['ok' => true, 'mensaje' => 'Versión restaurada. La web ya está actualizada.', 'paginas' => listarPaginas()]);

        /* ---------------------------------------------------- mi cuenta */

        case 'POST cuenta':
            $in = entrada();
            $nombre = trim((string) ($in->nombre ?? ''));
            $actual = (string) ($in->actual ?? '');
            $nueva = (string) ($in->nueva ?? '');
            if ($nombre === '' || mb_strlen($nombre) > 60) {
                responder(['error' => 'Escribe tu nombre (máximo 60 caracteres).'], 400);
            }
            $st = db()->prepare('SELECT hash FROM usuarios WHERE id = ?');
            $st->execute([$yo['id']]);
            if (!password_verify($actual, (string) $st->fetchColumn())) {
                responder(['error' => 'La contraseña actual no es correcta.'], 400);
            }
            if ($nueva !== '' && mb_strlen($nueva) < 8) {
                responder(['error' => 'La contraseña nueva debe tener al menos 8 caracteres.'], 400);
            }
            db()->prepare('UPDATE usuarios SET nombre = ? WHERE id = ?')->execute([$nombre, $yo['id']]);
            if ($nueva !== '') {
                db()->prepare('UPDATE usuarios SET hash = ? WHERE id = ?')->execute([password_hash($nueva, PASSWORD_DEFAULT), $yo['id']]);
                registrar('cambiar contraseña', 'usuario', $yo['usuario'], "$nombre ({$yo['usuario']}) · su propia contraseña");
            }
            responder(['ok' => true, 'mensaje' => $nueva !== '' ? 'Datos y contraseña actualizados.' : 'Datos actualizados.', 'usuario' => usuarioPublico(array_merge($yo, ['nombre' => $nombre]))]);

        case 'POST salir':
            registrar('salir', 'sesion', $yo['usuario'], $yo['nombre']);
            $_SESSION = [];
            session_destroy();
            responder(['ok' => true]);

        default:
            responder(['error' => 'Acción desconocida.'], 404);
    }
} catch (Throwable $e) {
    error_log($e);
    responder(['error' => 'Error del servidor: ' . $e->getMessage()], 500);
}
