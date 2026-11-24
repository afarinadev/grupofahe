<?php
/**
 * Panel de administración de Grupo FAHE.
 * - Sin usuario creado: pantalla para crearlo (solo desde este ordenador).
 * - Sin sesión: pantalla de acceso con usuario y contraseña.
 * - Con sesión: el editor (panel.js).
 */
declare(strict_types=1);
require __DIR__ . '/inc/comun.php';

iniciarSesion();
header('X-Frame-Options: DENY');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header('Cache-Control: no-store');

$cred = credenciales();
$modo = $cred ? 'entrar' : 'crear';
$error = '';
$usuarioEscrito = '';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $usuarioEscrito = trim((string) ($_POST['usuario'] ?? ''));
    $contrasena = (string) ($_POST['contrasena'] ?? '');

    if (!csrfValido($_POST['csrf'] ?? null)) {
        $error = 'La página había caducado. Vuelve a intentarlo.';
    } elseif ($modo === 'crear') {
        if (!esLocal()) {
            $error = 'El usuario administrador solo se puede crear desde el propio ordenador (localhost).';
        } elseif (!preg_match('/^[A-Za-z0-9._@-]{3,40}$/', $usuarioEscrito)) {
            $error = 'El usuario debe tener entre 3 y 40 caracteres (letras, números, punto, guion o @).';
        } elseif (mb_strlen($contrasena) < 8) {
            $error = 'La contraseña debe tener al menos 8 caracteres.';
        } elseif ($contrasena !== (string) ($_POST['contrasena2'] ?? '')) {
            $error = 'Las dos contraseñas no coinciden.';
        } else {
            guardarCredenciales($usuarioEscrito, $contrasena);
            session_regenerate_id(true);
            $_SESSION = ['usuario' => $usuarioEscrito];
            header('Location: ./', true, 303);
            exit;
        }
    } else {
        $espera = segundosBloqueado();
        if ($espera > 0) {
            $error = 'Demasiados intentos fallidos. Prueba otra vez en ' . max(1, (int) ceil($espera / 60)) . ' min.';
        } elseif (hash_equals($cred['usuario'], $usuarioEscrito) && password_verify($contrasena, $cred['hash'])) {
            registrarIntento(true);
            if (password_needs_rehash($cred['hash'], PASSWORD_DEFAULT)) {
                guardarCredenciales($cred['usuario'], $contrasena);
            }
            session_regenerate_id(true);
            $_SESSION = ['usuario' => $cred['usuario']];
            header('Location: ./', true, 303);
            exit;
        } else {
            registrarIntento(false);
            usleep(700000);
            $error = 'Usuario o contraseña incorrectos.';
        }
    }
}

$usuario = usuarioActual();
$token = csrf();
?>
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <meta name="csrf" content="<?= e($token) ?>">
  <title><?= $usuario ? 'Panel' : ($modo === 'crear' ? 'Crear acceso' : 'Acceso') ?> · Grupo FAHE</title>
  <link rel="icon" href="../assets/img/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.19.0/dist/tabler-icons.min.css">
  <link rel="stylesheet" href="panel.css?v=<?= filemtime(__DIR__ . '/panel.css') ?>">
</head>
<?php if (!$usuario): ?>
<body class="acceso">
  <main class="acceso-caja">
    <a class="acceso-marca" href="../index.html" aria-label="Volver a la web">
      <img src="../assets/img/favicon.svg" alt="" width="44" height="44">
      <span>Grupo <b>FAHE</b><small>Panel de administración</small></span>
    </a>
    <form method="post" class="acceso-form" autocomplete="on">
      <h1><?= $modo === 'crear' ? 'Crea tu acceso' : 'Entrar' ?></h1>
      <?php if ($modo === 'crear'): ?>
        <p class="acceso-nota">Es la primera vez que se abre el panel. Elige el usuario y la contraseña con los que entrarás a partir de ahora.</p>
      <?php endif; ?>
      <?php if ($error): ?>
        <p class="aviso aviso-error" role="alert"><i class="ti ti-alert-circle" aria-hidden="true"></i> <?= e($error) ?></p>
      <?php endif; ?>
      <input type="hidden" name="csrf" value="<?= e($token) ?>">
      <label for="usuario">Usuario</label>
      <input id="usuario" name="usuario" type="text" required autocomplete="username" autocapitalize="none" spellcheck="false" value="<?= e($usuarioEscrito) ?>" autofocus>
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
  <header class="barra">
    <button class="btn-icono menu-movil" type="button" aria-label="Mostrar u ocultar la lista" aria-expanded="false" aria-controls="lateral"><i class="ti ti-menu-2" aria-hidden="true"></i></button>
    <a class="barra-marca" href="./"><img src="../assets/img/favicon.svg" alt="" width="30" height="30"><span>Grupo <b>FAHE</b> <small>Panel</small></span></a>
    <div class="barra-der">
      <a class="btn btn-fino" href="../index.html" target="_blank" rel="noopener"><i class="ti ti-external-link" aria-hidden="true"></i><span> Ver la web</span></a>
      <span class="barra-usuario"><i class="ti ti-user-circle" aria-hidden="true"></i> <?= e($usuario) ?></span>
      <button class="btn btn-fino" type="button" id="salir"><i class="ti ti-logout" aria-hidden="true"></i><span> Salir</span></button>
    </div>
  </header>
  <div class="cuerpo">
    <nav class="lateral" id="lateral" aria-label="Contenido"></nav>
    <main class="editor" id="editor" tabindex="-1">
      <p class="cargando"><i class="ti ti-loader-2 girar" aria-hidden="true"></i> Cargando…</p>
    </main>
  </div>
  <div class="notas" id="notas" role="status" aria-live="polite"></div>
  <dialog id="dlg-nueva" class="dialogo">
    <form method="dialog" id="form-nueva">
      <h2>Nueva página</h2>
      <label for="nueva-titulo">Título</label>
      <input id="nueva-titulo" required maxlength="80" placeholder="Ej.: Ofertas de temporada">
      <label for="nueva-slug">Dirección</label>
      <div class="con-sufijo"><input id="nueva-slug" required pattern="[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?" maxlength="60" placeholder="ofertas"><span>.html</span></div>
      <p class="ayuda">Solo minúsculas, números y guiones. No se puede cambiar después.</p>
      <p class="aviso aviso-error" id="nueva-error" hidden></p>
      <div class="dialogo-botones">
        <button class="btn btn-fino" type="button" value="cancelar" data-cerrar>Cancelar</button>
        <button class="btn btn-oro" type="submit"><i class="ti ti-plus" aria-hidden="true"></i> Crear página</button>
      </div>
    </form>
  </dialog>
  <script src="panel.js?v=<?= filemtime(__DIR__ . '/panel.js') ?>" defer></script>
</body>
<?php endif; ?>
</html>
