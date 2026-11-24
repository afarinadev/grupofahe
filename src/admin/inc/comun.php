<?php
/**
 * Panel de administración de Grupo FAHE — funciones comunes.
 *
 * Este archivo vive en src/admin/inc/ y Eleventy lo copia a public/admin/inc/.
 * Desde cualquiera de los dos sitios, la raíz del proyecto está tres carpetas
 * más arriba.
 *
 *   config/admin.php   usuario y contraseña (hash) — NO va a git
 *   storage/           sesiones, intentos de acceso, registros de la regeneración
 *   src/_data/         el contenido que edita el panel
 *   public/            la web generada (lo que sirve Laragon)
 */
declare(strict_types=1);

const RAIZ = __DIR__ . '/../../..';
const PAGINAS_PROTEGIDAS = ['index', 'gracias', 'politica-privacidad'];
const AJUSTES = [
    'sitio'    => 'src/_data/sitio.json',
    'empresas' => 'src/_data/empresas.json',
];
const MAX_INTENTOS = 5;
const BLOQUEO_SEGUNDOS = 600;
const MAX_FOTO_MB = 8;

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

/* ---------------------------------------------------------------- sesión */

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

function usuarioActual(): ?string
{
    return $_SESSION['usuario'] ?? null;
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

/* ---------------------------------------------------------- credenciales */

function rutaCredenciales(): string
{
    return raiz('config/admin.php');
}

/** @return array{usuario: string, hash: string, node?: string}|null */
function credenciales(): ?array
{
    $f = rutaCredenciales();
    if (!is_file($f)) {
        return null;
    }
    $c = require $f;
    return is_array($c) && isset($c['usuario'], $c['hash']) ? $c : null;
}

function guardarCredenciales(string $usuario, string $contrasena): void
{
    $dir = dirname(rutaCredenciales());
    if (!is_dir($dir)) {
        mkdir($dir, 0775, true);
    }
    $datos = credenciales() ?? [];
    $datos['usuario'] = $usuario;
    $datos['hash'] = password_hash($contrasena, PASSWORD_DEFAULT);
    $php = "<?php\n// Acceso al panel de administración. Generado por el panel: no subir a git.\n"
         . "// Para cambiar la contraseña, borra este archivo y vuelve a entrar en /admin/ desde este ordenador.\n"
         . 'return ' . var_export($datos, true) . ";\n";
    file_put_contents(rutaCredenciales(), $php, LOCK_EX);
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
        return raiz(AJUSTES[$id]);
    }
    return null;
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

function listarPaginas(): array
{
    $paginas = [];
    foreach (glob(raiz('src/_data/paginas') . DIRECTORY_SEPARATOR . '*.json') ?: [] as $f) {
        $d = json_decode((string) file_get_contents($f));
        $slug = basename($f, '.json');
        $paginas[] = [
            'slug'      => $slug,
            'titulo'    => is_object($d) && isset($d->titulo_seo) ? (string) $d->titulo_seo : $slug,
            'protegida' => in_array($slug, PAGINAS_PROTEGIDAS, true),
        ];
    }
    usort($paginas, fn ($a, $b) => [$a['slug'] !== 'index', $a['titulo']] <=> [$b['slug'] !== 'index', $b['titulo']]);
    return $paginas;
}

/* -------------------------------------------------- regenerar la web */

function buscarNode(): string
{
    $c = credenciales();
    $candidatos = [];
    if (!empty($c['node'])) {
        $candidatos[] = $c['node'];
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
 * Escribe un archivo de contenido y regenera la web. Si la web no se puede
 * generar con el cambio, deja el archivo como estaba.
 * @return array{0: bool, 1: string}
 */
function guardarYRegenerar(string $ruta, ?string $contenido): array
{
    $anterior = is_file($ruta) ? file_get_contents($ruta) : null;
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
    return [$ok, $salida];
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
