<?php
/**
 * Panel de administración de Grupo FAHE — funciones comunes.
 *
 * Este archivo vive en src/admin/inc/ y Eleventy lo copia a public/admin/inc/.
 * Desde cualquiera de los dos sitios, la raíz del proyecto está tres carpetas
 * más arriba.
 *
 *   storage/panel.sqlite  usuarios e historial de cambios (con cada versión)
 *   storage/sesiones/     sesiones del panel
 *   src/_data/            el contenido que edita el panel
 *   public/               la web generada (lo que sirve Laragon)
 */
declare(strict_types=1);

const RAIZ = __DIR__ . '/../../..';
const PAGINAS_PROTEGIDAS = ['index', 'gracias', 'politica-privacidad'];
const AJUSTES = [
    'sitio'    => ['archivo' => 'src/_data/sitio.json', 'titulo' => 'Contacto y datos generales'],
    'empresas' => ['archivo' => 'src/_data/empresas.json', 'titulo' => 'Empresas del menú'],
];
const ROLES = ['admin' => 'Administrador', 'editor' => 'Editor'];
const MAX_INTENTOS = 5;
const BLOQUEO_SEGUNDOS = 600;
const MAX_FOTO_MB = 8;
const CARPETA_SUBIDAS = 'assets/img/subidas';
const CARPETA_LOGOS = 'assets/img/logos';

date_default_timezone_set('Europe/Madrid');

// Los avisos de PHP no se muestran (estropearían las respuestas JSON): se guardan en storage/errores.log
ini_set('display_errors', '0');
ini_set('log_errors', '1');
ini_set('error_log', __DIR__ . '/../../../storage/errores.log');

function raiz(string $ruta = ''): string
{
    $base = realpath(RAIZ) ?: RAIZ;
    return $ruta === '' ? $base : $base . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $ruta);
}

function carpetaStorage(string $sub = ''): string
{
    $dir = raiz('storage' . ($sub !== '' ? '/' . $sub : ''));
    if (!is_dir($dir)) {
        mkdir($dir, 0775, true);
    }
    return $dir;
}

function ahora(): string
{
    return date('Y-m-d H:i:s');
}

/* ------------------------------------------------------- base de datos */

function db(): PDO
{
    static $pdo = null;
    if ($pdo) {
        return $pdo;
    }
    $pdo = new PDO('sqlite:' . carpetaStorage() . DIRECTORY_SEPARATOR . 'panel.sqlite', null, null, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $pdo->exec('PRAGMA busy_timeout = 5000');
    $pdo->exec('CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario TEXT NOT NULL UNIQUE COLLATE NOCASE,
        nombre TEXT NOT NULL,
        rol TEXT NOT NULL,
        hash TEXT NOT NULL,
        activo INTEGER NOT NULL DEFAULT 1,
        creado TEXT NOT NULL,
        ultimo_acceso TEXT
    )');
    $pdo->exec('CREATE TABLE IF NOT EXISTS historial (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha TEXT NOT NULL,
        usuario_id INTEGER,
        usuario TEXT,
        accion TEXT NOT NULL,
        tipo TEXT,
        entidad TEXT,
        titulo TEXT,
        antes TEXT,
        despues TEXT,
        ip TEXT
    )');
    $pdo->exec('CREATE INDEX IF NOT EXISTS historial_fecha ON historial (fecha)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS historial_entidad ON historial (tipo, entidad)');
    migrarUsuarioAntiguo($pdo);
    return $pdo;
}

/** La primera versión del panel guardaba un único usuario en config/admin.php: se pasa a la base de datos. */
function migrarUsuarioAntiguo(PDO $pdo): void
{
    $f = raiz('config/admin.php');
    if (!is_file($f) || (int) $pdo->query('SELECT COUNT(*) FROM usuarios')->fetchColumn() > 0) {
        return;
    }
    $c = require $f;
    if (is_array($c) && !empty($c['usuario']) && !empty($c['hash'])) {
        $st = $pdo->prepare('INSERT INTO usuarios (usuario, nombre, rol, hash, activo, creado) VALUES (?, ?, ?, ?, 1, ?)');
        $st->execute([$c['usuario'], $c['usuario'], 'admin', $c['hash'], ahora()]);
        @unlink($f);
        @rmdir(dirname($f));
    }
}

/* --------------------------------------------------------------- sesión */

function iniciarSesion(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    // Sesiones propias: así no las borra la limpieza de otras apps de Laragon
    ini_set('session.save_path', carpetaStorage('sesiones'));
    ini_set('session.gc_maxlifetime', (string) (8 * 3600));
    ini_set('session.use_strict_mode', '1');
    session_name('fahe_panel');
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'secure'   => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    session_start();
}

/** Usuario con sesión iniciada (y todavía activo), o null. */
function usuarioActual(): ?array
{
    static $cache = false;
    if ($cache !== false) {
        return $cache;
    }
    $id = $_SESSION['uid'] ?? null;
    if (!$id) {
        return $cache = null;
    }
    $st = db()->prepare('SELECT id, usuario, nombre, rol, ultimo_acceso FROM usuarios WHERE id = ? AND activo = 1');
    $st->execute([$id]);
    return $cache = ($st->fetch() ?: null);
}

function esAdmin(?array $u = null): bool
{
    $u ??= usuarioActual();
    return ($u['rol'] ?? '') === 'admin';
}

function csrf(): string
{
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}

function csrfValido(?string $token): bool
{
    return is_string($token) && !empty($_SESSION['csrf']) && hash_equals($_SESSION['csrf'], $token);
}

function esLocal(): bool
{
    return in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true);
}

/* ------------------------------------------------------------- usuarios */

function hayUsuarios(): bool
{
    return (int) db()->query('SELECT COUNT(*) FROM usuarios')->fetchColumn() > 0;
}

function usuarioValido(string $usuario): bool
{
    return (bool) preg_match('/^[A-Za-z0-9._@-]{3,40}$/', $usuario);
}

function crearUsuario(string $usuario, string $nombre, string $rol, string $contrasena): int
{
    $st = db()->prepare('INSERT INTO usuarios (usuario, nombre, rol, hash, activo, creado) VALUES (?, ?, ?, ?, 1, ?)');
    $st->execute([$usuario, $nombre, $rol, password_hash($contrasena, PASSWORD_DEFAULT), ahora()]);
    return (int) db()->lastInsertId();
}

function buscarUsuario(string $usuario): ?array
{
    $st = db()->prepare('SELECT * FROM usuarios WHERE usuario = ?');
    $st->execute([$usuario]);
    return $st->fetch() ?: null;
}

function adminsActivos(): int
{
    return (int) db()->query("SELECT COUNT(*) FROM usuarios WHERE rol = 'admin' AND activo = 1")->fetchColumn();
}

/* ------------------------------------------------- intentos de acceso */

function archivoIntentos(): string
{
    return carpetaStorage() . DIRECTORY_SEPARATOR . 'intentos.json';
}

function leerIntentos(): array
{
    $f = archivoIntentos();
    $d = is_file($f) ? json_decode((string) file_get_contents($f), true) : [];
    return is_array($d) ? $d : [];
}

function segundosBloqueado(): int
{
    $ip = $_SERVER['REMOTE_ADDR'] ?? '?';
    $r = leerIntentos()[$ip] ?? null;
    if (!$r || ($r['n'] ?? 0) < MAX_INTENTOS) {
        return 0;
    }
    return max(0, (int) $r['desde'] + BLOQUEO_SEGUNDOS - time());
}

function registrarIntento(bool $correcto): void
{
    $ip = $_SERVER['REMOTE_ADDR'] ?? '?';
    $todos = leerIntentos();
    if ($correcto) {
        unset($todos[$ip]);
    } else {
        $r = $todos[$ip] ?? ['n' => 0, 'desde' => time()];
        if (time() - (int) $r['desde'] > BLOQUEO_SEGUNDOS) {
            $r = ['n' => 0, 'desde' => time()];
        }
        $r['n']++;
        $todos[$ip] = $r;
    }
    file_put_contents(archivoIntentos(), json_encode($todos), LOCK_EX);
}

/* ------------------------------------------------------------ historial */

/** Apunta una acción en el historial. $antes/$despues: contenido completo del archivo (para poder restaurarlo). */
function registrar(string $accion, ?string $tipo = null, ?string $entidad = null, ?string $titulo = null, ?string $antes = null, ?string $despues = null, ?array $usuario = null): void
{
    $u = $usuario ?? usuarioActual();
    $st = db()->prepare('INSERT INTO historial (fecha, usuario_id, usuario, accion, tipo, entidad, titulo, antes, despues, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    $st->execute([ahora(), $u['id'] ?? null, $u['nombre'] ?? ($u['usuario'] ?? null), $accion, $tipo, $entidad, $titulo, $antes, $despues, $_SERVER['REMOTE_ADDR'] ?? null]);
}

/* ------------------------------------------------------------- contenido */

function slugValido(string $slug): bool
{
    return (bool) preg_match('/^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/', $slug);
}

/** Nombre de archivo limpio: «Fachada Año 2024» → «fachada-ano-2024». */
function slugArchivo(string $texto): string
{
    if (!mb_check_encoding($texto, 'UTF-8')) {
        $texto = mb_convert_encoding($texto, 'UTF-8', 'Windows-1252');
    }
    $texto = mb_strtolower($texto, 'UTF-8');
    if (class_exists('Normalizer')) {
        $texto = preg_replace('/\p{Mn}+/u', '', Normalizer::normalize($texto, Normalizer::FORM_D) ?: $texto);
    }
    $texto = strtr($texto, ['ñ' => 'n', 'ç' => 'c', 'ß' => 'ss', 'æ' => 'ae', 'ø' => 'o']);
    $texto = trim((string) preg_replace('/[^a-z0-9]+/', '-', $texto), '-');
    return substr($texto, 0, 50) ?: 'foto';
}

/** Ruta absoluta de un archivo de contenido, o null si no es válido. */
function rutaContenido(string $tipo, string $id): ?string
{
    if ($tipo === 'pagina' && slugValido($id)) {
        return raiz("src/_data/paginas/$id.json");
    }
    if ($tipo === 'ajuste' && isset(AJUSTES[$id])) {
        return raiz(AJUSTES[$id]['archivo']);
    }
    return null;
}

/** Nombre legible de un contenido para el historial. */
function tituloContenido(string $tipo, string $id, ?string $json = null): string
{
    if ($tipo === 'ajuste') {
        return AJUSTES[$id]['titulo'] ?? $id;
    }
    $d = $json !== null ? json_decode($json) : null;
    $t = is_object($d) && isset($d->titulo_seo) ? (string) $d->titulo_seo : $id;
    return explode(' · ', $t)[0];
}

/** JSON con sangría de 2 espacios, acentos y barras sin escapar (igual que los archivos originales). */
function codificarJson($datos): string
{
    $json = json_encode($datos, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    $json = preg_replace_callback('/^((?: {4})+)/m', fn ($m) => str_repeat(' ', intdiv(strlen($m[1]), 2)), $json);
    return $json . "\n";
}

function escribirArchivo(string $ruta, string $contenido): void
{
    $dir = dirname($ruta);
    if (!is_dir($dir)) {
        mkdir($dir, 0775, true);
    }
    $tmp = $ruta . '.tmp-' . bin2hex(random_bytes(4));
    if (file_put_contents($tmp, $contenido, LOCK_EX) === false || !rename($tmp, $ruta)) {
        @unlink($tmp);
        throw new RuntimeException('No se pudo escribir ' . basename($ruta));
    }
}

/** Datos de una página para las listas del panel. */
function resumenPagina(string $archivo): array
{
    $json = (string) file_get_contents($archivo);
    $d = json_decode($json);
    $slug = basename($archivo, '.json');
    $titulo = is_object($d) && isset($d->titulo_seo) ? (string) $d->titulo_seo : $slug;
    return [
        'slug'       => $slug,
        'titulo'     => $titulo,
        'nombre'     => explode(' · ', $titulo)[0],
        'secciones'  => is_object($d) && isset($d->secciones) && is_array($d->secciones) ? count($d->secciones) : 0,
        'protegida'  => in_array($slug, PAGINAS_PROTEGIDAS, true),
        'oculta'     => is_object($d) && !empty($d->noindex),
        'modificada' => date('Y-m-d H:i:s', (int) filemtime($archivo)),
    ];
}

function archivosPaginas(): array
{
    return glob(raiz('src/_data/paginas') . DIRECTORY_SEPARATOR . '*.json') ?: [];
}

function listarPaginas(bool $conUltimoCambio = false): array
{
    $paginas = array_map('resumenPagina', archivosPaginas());
    usort($paginas, fn ($a, $b) => [$a['slug'] !== 'index', $a['nombre']] <=> [$b['slug'] !== 'index', $b['nombre']]);
    if ($conUltimoCambio) {
        $st = db()->prepare("SELECT fecha, usuario FROM historial WHERE tipo = 'pagina' AND entidad = ? ORDER BY id DESC LIMIT 1");
        foreach ($paginas as &$p) {
            $st->execute([$p['slug']]);
            $p['ultimo_cambio'] = $st->fetch() ?: null;
        }
    }
    return $paginas;
}

/* ---------------------------------------------------------------- fotos */

function listarFotos(): array
{
    // Texto de todo el contenido, para saber dónde se usa cada foto
    $contenidos = [];
    foreach (archivosPaginas() as $f) {
        $slug = basename($f, '.json');
        $txt = (string) file_get_contents($f);
        $contenidos[] = ['tipo' => 'pagina', 'id' => $slug, 'titulo' => tituloContenido('pagina', $slug, $txt), 'texto' => $txt];
    }
    foreach (AJUSTES as $id => $a) {
        $contenidos[] = ['tipo' => 'ajuste', 'id' => $id, 'titulo' => $a['titulo'], 'texto' => (string) @file_get_contents(raiz($a['archivo']))];
    }
    $fotos = [];
    foreach ([CARPETA_SUBIDAS => 'subida', CARPETA_LOGOS => 'logo'] as $carpeta => $grupo) {
        $archivos = array_filter(glob(raiz('src/' . $carpeta) . DIRECTORY_SEPARATOR . '*') ?: [], fn ($f) => (bool) preg_match('/\.(jpe?g|png|webp|gif|svg)$/i', $f));
        foreach ($archivos as $f) {
            $ruta = $carpeta . '/' . basename($f);
            $usos = [];
            foreach ($contenidos as $c) {
                if (str_contains($c['texto'], $ruta)) {
                    $usos[] = ['tipo' => $c['tipo'], 'id' => $c['id'], 'titulo' => $c['titulo']];
                }
            }
            $dim = @getimagesize($f) ?: [null, null];
            $fotos[] = [
                'ruta'   => $ruta,
                'nombre' => basename($f),
                'grupo'  => $grupo,
                'bytes'  => (int) filesize($f),
                'ancho'  => $dim[0],
                'alto'   => $dim[1],
                'fecha'  => date('Y-m-d H:i:s', (int) filemtime($f)),
                'usos'   => $usos,
            ];
        }
    }
    usort($fotos, fn ($a, $b) => [$a['grupo'] !== 'subida', $b['fecha']] <=> [$b['grupo'] !== 'subida', $a['fecha']]);
    return $fotos;
}

/* -------------------------------------------------- regenerar la web */

function buscarNode(): string
{
    $candidatos = [];
    if ($n = getenv('NODE_BINARY')) {
        $candidatos[] = $n;
    }
    // Node de Laragon (C:\laragon\bin\nodejs\node-vXX\node.exe): la raíz de Laragon está dos niveles por encima del proyecto
    $laragon = glob(dirname(raiz(), 2) . '/bin/nodejs/*/node.exe') ?: [];
    natsort($laragon);
    array_push($candidatos, ...array_reverse($laragon));
    array_push($candidatos, 'C:/Program Files/nodejs/node.exe', '/usr/local/bin/node', '/usr/bin/node');
    foreach ($candidatos as $n) {
        if (is_file($n)) {
            return $n;
        }
    }
    return 'node';
}

/**
 * Ejecuta Eleventy para regenerar public/ a partir de src/.
 * @return array{0: bool, 1: string} [correcto, salida]
 */
function regenerarWeb(): array
{
    $eleventy = raiz('node_modules/@11ty/eleventy/cmd.cjs');
    if (!is_file($eleventy)) {
        return [false, 'Faltan las dependencias del proyecto: ejecuta «npm install» en ' . raiz() . '.'];
    }
    @set_time_limit(120);
    $dir = carpetaStorage('regeneracion');
    $cerrojo = fopen($dir . DIRECTORY_SEPARATOR . 'cerrojo', 'c');
    flock($cerrojo, LOCK_EX);
    try {
        $log = $dir . DIRECTORY_SEPARATOR . 'ultima.log';
        $proc = proc_open(
            [buscarNode(), $eleventy, '--quiet'],
            [0 => ['pipe', 'r'], 1 => ['file', $log, 'w'], 2 => ['file', $log, 'a']],
            $tuberias,
            raiz()
        );
        if (!is_resource($proc)) {
            return [false, 'No se pudo ejecutar Node.js para regenerar la web.'];
        }
        fclose($tuberias[0]);
        $codigo = proc_close($proc);
        $salida = trim((string) @file_get_contents($log));
        return [$codigo === 0, $salida];
    } finally {
        flock($cerrojo, LOCK_UN);
        fclose($cerrojo);
    }
}

/**
 * Escribe (o borra, con null) un archivo de contenido y regenera la web.
 * Si la web no se puede generar con el cambio, deja el archivo como estaba.
 * @return array{0: bool, 1: string, 2: ?string} [correcto, salida, contenido anterior]
 */
function guardarYRegenerar(string $ruta, ?string $contenido): array
{
    $anterior = is_file($ruta) ? (string) file_get_contents($ruta) : null;
    if ($contenido === null) {
        unlink($ruta);
    } else {
        escribirArchivo($ruta, $contenido);
    }
    [$ok, $salida] = regenerarWeb();
    if (!$ok) {
        if ($anterior === null) {
            @unlink($ruta);
        } else {
            escribirArchivo($ruta, $anterior);
        }
        regenerarWeb();
    }
    return [$ok, $salida, $anterior];
}

/* ---------------------------------------------------------- respuestas */

function responder(array $datos, int $codigo = 200): never
{
    http_response_code($codigo);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function e(?string $texto): string
{
    return htmlspecialchars((string) $texto, ENT_QUOTES, 'UTF-8');
}
