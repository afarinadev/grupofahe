<?php
/**
 * Panel de administración de Grupo FAHE.
 * - Sin usuarios: pantalla para crear el primer administrador (solo desde este ordenador).
 * - Sin sesión: acceso con usuario y contraseña.
 * - Con sesión: el panel (panel/*.js).
 */
declare(strict_types=1);
require __DIR__ . '/inc/comun.php';

iniciarSesion();
header('X-Frame-Options: SAMEORIGIN');
header("Content-Security-Policy: frame-ancestors 'self'");
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header('Cache-Control: no-store');

$modo = hayUsuarios() ? 'entrar' : 'crear';
$error = '';
$usuarioEscrito = '';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $usuarioEscrito = trim((string) ($_POST['usuario'] ?? ''));
    $contrasena = (string) ($_POST['contrasena'] ?? '');

    if (!csrfValido($_POST['csrf'] ?? null)) {
        $error = 'La página había caducado. Vuelve a intentarlo.';
    } elseif ($modo === 'crear') {
        $nombre = trim((string) ($_POST['nombre'] ?? '')) ?: $usuarioEscrito;
        if (!esLocal()) {
            $error = 'El primer administrador solo se puede crear desde el propio ordenador (localhost).';
        } elseif (!usuarioValido($usuarioEscrito)) {
            $error = 'El usuario debe tener entre 3 y 40 caracteres (letras, números, punto, guion o @).';
        } elseif (mb_strlen($contrasena) < 8) {
            $error = 'La contraseña debe tener al menos 8 caracteres.';
        } elseif ($contrasena !== (string) ($_POST['contrasena2'] ?? '')) {
            $error = 'Las dos contraseñas no coinciden.';
        } else {
            $id = crearUsuario($usuarioEscrito, mb_substr($nombre, 0, 60), 'admin', $contrasena);
            session_regenerate_id(true);
            $_SESSION = ['uid' => $id];
            $u = ['id' => $id, 'usuario' => $usuarioEscrito, 'nombre' => $nombre];
            db()->prepare('UPDATE usuarios SET ultimo_acceso = ? WHERE id = ?')->execute([ahora(), $id]);
            registrar('crear usuario', 'usuario', $usuarioEscrito, "$nombre ($usuarioEscrito, Administrador) · primer acceso", null, null, $u);
            header('Location: ./', true, 303);
            exit;
        }
    } else {
        $espera = segundosBloqueado();
        $u = $espera > 0 ? null : buscarUsuario($usuarioEscrito);
        if ($espera > 0) {
            $error = 'Demasiados intentos fallidos. Prueba otra vez en ' . max(1, (int) ceil($espera / 60)) . ' min.';
        } elseif ($u && (int) $u['activo'] === 1 && password_verify($contrasena, $u['hash'])) {
            registrarIntento(true);
            if (password_needs_rehash($u['hash'], PASSWORD_DEFAULT)) {
                db()->prepare('UPDATE usuarios SET hash = ? WHERE id = ?')->execute([password_hash($contrasena, PASSWORD_DEFAULT), $u['id']]);
            }
            db()->prepare('UPDATE usuarios SET ultimo_acceso = ? WHERE id = ?')->execute([ahora(), $u['id']]);
            session_regenerate_id(true);
            $_SESSION = ['uid' => (int) $u['id']];
            registrar('entrar', 'sesion', $u['usuario'], $u['nombre'], null, null, $u);
            header('Location: ./', true, 303);
            exit;
        } else {
            registrarIntento(false);
            registrar('acceso fallido', 'sesion', mb_substr($usuarioEscrito, 0, 40), 'Usuario o contraseña incorrectos', null, null, ['id' => null, 'usuario' => null, 'nombre' => null]);
            usleep(700000);
            $error = $u && (int) $u['activo'] !== 1 ? 'Este usuario está desactivado.' : 'Usuario o contraseña incorrectos.';
        }
    }
}

$yo = usuarioActual();
$token = csrf();
$v = fn (string $f) => $f . '?v=' . @filemtime(__DIR__ . '/' . $f);
?>
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <meta name="csrf" content="<?= e($token) ?>">
  <title><?= $yo ? 'Panel' : ($modo === 'crear' ? 'Crear acceso' : 'Acceso') ?> · Grupo FAHE</title>
  <link rel="icon" href="../assets/img/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.19.0/dist/tabler-icons.min.css">
  <link rel="stylesheet" href="<?= $v('panel.css') ?>">
</head>
<?php if (!$yo): ?>
<body class="acceso">
  <main class="acceso-caja">
    <a class="acceso-marca" href="../index.html" aria-label="Volver a la web">
      <img src="../assets/img/favicon.svg" alt="" width="44" height="44">
      <span>Grupo <b>FAHE</b><small>Panel de administración</small></span>
    </a>
    <form method="post" class="acceso-form" autocomplete="on">
      <h1><?= $modo === 'crear' ? 'Crea tu acceso' : 'Entrar' ?></h1>
      <?php if ($modo === 'crear'): ?>
        <p class="acceso-nota">Es la primera vez que se abre el panel. Crea el usuario administrador con el que entrarás a partir de ahora.</p>
      <?php endif; ?>
      <?php if ($error): ?>
        <p class="aviso aviso-error" role="alert"><i class="ti ti-alert-circle" aria-hidden="true"></i> <?= e($error) ?></p>
      <?php endif; ?>
      <input type="hidden" name="csrf" value="<?= e($token) ?>">
      <?php if ($modo === 'crear'): ?>
        <label for="nombre">Tu nombre</label>
        <input id="nombre" name="nombre" type="text" maxlength="60" autocomplete="name" value="<?= e($_POST['nombre'] ?? '') ?>">
      <?php endif; ?>
      <label for="usuario">Usuario</label>
      <input id="usuario" name="usuario" type="text" required autocomplete="username" autocapitalize="none" spellcheck="false" value="<?= e($usuarioEscrito) ?>"<?= $modo === 'entrar' ? ' autofocus' : '' ?>>
      <label for="contrasena">Contraseña</label>
      <input id="contrasena" name="contrasena" type="password" required autocomplete="<?= $modo === 'crear' ? 'new-password' : 'current-password' ?>"<?= $modo === 'crear' ? ' minlength="8"' : '' ?>>
      <?php if ($modo === 'crear'): ?>
        <label for="contrasena2">Repite la contraseña</label>
        <input id="contrasena2" name="contrasena2" type="password" required autocomplete="new-password" minlength="8">
      <?php endif; ?>
      <button class="btn btn-oro" type="submit"><i class="ti ti-<?= $modo === 'crear' ? 'user-plus' : 'login-2' ?>" aria-hidden="true"></i> <?= $modo === 'crear' ? 'Crear y entrar' : 'Entrar' ?></button>
    </form>
    <a class="acceso-volver" href="../index.html"><i class="ti ti-arrow-left" aria-hidden="true"></i> Volver a la web</a>
  </main>
</body>
<?php else: ?>
<body class="panel">
  <header class="barra-movil">
    <button class="btn-icono menu-movil" type="button" aria-label="Abrir el menú" aria-expanded="false" aria-controls="lateral"><i class="ti ti-menu-2" aria-hidden="true"></i></button>
    <a class="marca" href="#resumen"><img src="../assets/img/favicon.svg" alt="" width="28" height="28"><span>Grupo <b>FAHE</b></span></a>
    <a class="btn-icono" href="../index.html" target="_blank" rel="noopener" aria-label="Ver la web"><i class="ti ti-external-link" aria-hidden="true"></i></a>
  </header>
  <div class="disposicion">
    <aside class="lateral" id="lateral">
      <a class="marca lateral-marca" href="#resumen">
        <img src="../assets/img/favicon.svg" alt="" width="36" height="36">
        <span>Grupo <b>FAHE</b><small>Panel</small></span>
      </a>
      <nav class="menu" id="menu" aria-label="Secciones del panel"></nav>
      <div class="lateral-pie">
        <a class="yo" href="#cuenta" id="yo"></a>
        <a class="btn btn-fino btn-bloque" href="../index.html" target="_blank" rel="noopener"><i class="ti ti-world" aria-hidden="true"></i> Ver la web</a>
        <button class="btn btn-fino btn-bloque" type="button" id="salir"><i class="ti ti-logout" aria-hidden="true"></i> Salir</button>
      </div>
    </aside>
    <div class="velo" data-cerrar-menu></div>
    <main class="contenido" id="contenido" tabindex="-1">
      <p class="cargando"><i class="ti ti-loader-2 girar" aria-hidden="true"></i> Cargando…</p>
    </main>
  </div>
  <div class="notas" id="notas" role="status" aria-live="polite"></div>
  <script src="<?= $v('panel/util.js') ?>" defer></script>
  <script src="<?= $v('panel/editor.js') ?>" defer></script>
  <script src="<?= $v('panel/vistas.js') ?>" defer></script>
  <script src="<?= $v('panel/app.js') ?>" defer></script>
</body>
<?php endif; ?>
</html>
