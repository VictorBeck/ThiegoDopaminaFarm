<?php
/**
 * THIEGO DOPAMINA FARM — api/auth.php
 * Rotas: register, login, logout, me
 * Sessão própria (cookie HttpOnly + token em tabela) + CSRF por sessão.
 */

require_once __DIR__ . '/tdf_db.php';

$pdo = tdf_pdo();
tdf_bootstrap();

$route = $_GET['route'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

/* ---------- helpers ---------- */

/** Cria uma sessão nova (token + CSRF), grava na tabela e seta o cookie. */
function tdf_create_session(PDO $pdo, int $userId): array
{
    $env = tdf_env();
    $ttl = (int) ($env['SESSION_TTL'] ?? 2592000);
    $token = tdf_issue_token();
    $csrf = bin2hex(random_bytes(32));
    $st = $pdo->prepare(
        'INSERT INTO sessions (user_id, token_hash, csrf_token, expires_at, ip, user_agent)
         VALUES (:u, :h, :c, :e, :i, :a)'
    );
    $st->execute([
        ':u' => $userId,
        ':h' => hash('sha256', $token),
        ':c' => $csrf,
        ':e' => time() + $ttl,
        ':i' => tdf_ip(),
        ':a' => substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255),
    ]);
    // limita a 10 sessões ativas por usuário (mais antigas primeiro)
    $pdo->prepare('DELETE FROM sessions WHERE user_id = :u1 AND id NOT IN (
        SELECT id FROM (SELECT id FROM sessions WHERE user_id = :u2 ORDER BY id DESC LIMIT 10) t
    )')->execute([':u1' => $userId, ':u2' => $userId]);
    tdf_set_session_cookie($token);
    return ['token' => $token, 'csrf' => $csrf];
}

/* ---------- rotas ---------- */

if ($method === 'POST' && $route === 'register') {
    if (!tdf_rate_limit($pdo, 'reg:' . tdf_ip(), 10, 600)) {
        tdf_err(429, 'Muitas tentativas. Aguarde alguns minutos.');
    }
    $b = tdf_body();
    $username = trim((string) ($b['username'] ?? ''));
    $email = strtolower(trim((string) ($b['email'] ?? '')));
    $pass = (string) ($b['password'] ?? '');

    if (!preg_match('/^[A-Za-z0-9_]{3,20}$/', $username)) {
        tdf_err(422, 'Usuário inválido: use 3 a 20 caracteres (letras, números, _).');
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 190) {
        tdf_err(422, 'E-mail inválido.');
    }
    if (strlen($pass) < 6) {
        tdf_err(422, 'Senha muito curta (mínimo 6 caracteres).');
    }

    $st = $pdo->prepare('SELECT id FROM users WHERE username = :u OR email = :e LIMIT 1');
    $st->execute([':u' => $username, ':e' => $email]);
    if ($st->fetch()) {
        tdf_err(409, 'Usuário ou e-mail já cadastrado.');
    }

    $ins = $pdo->prepare('INSERT INTO users (username, email, pass_hash) VALUES (:u, :e, :p)');
    $ins->execute([':u' => $username, ':e' => $email, ':p' => password_hash($pass, PASSWORD_DEFAULT)]);
    $userId = (int) $pdo->lastInsertId();
    $now = time();
    $pdo->prepare('INSERT INTO user_progress (user_id, energy, energy_updated_at, last_sync_at) VALUES (:u, 10, :t1, :t2)')
        ->execute([':u' => $userId, ':t1' => $now, ':t2' => $now]);
    $pdo->prepare('INSERT INTO user_stats (user_id) VALUES (:u)')->execute([':u' => $userId]);

    $sess = tdf_create_session($pdo, $userId);
    tdf_log($pdo, $userId, 'register', ['username' => $username]);
    tdf_json(['ok' => true] + tdf_user_shape($pdo, $userId) + ['csrf' => $sess['csrf']], 201);
}

if ($method === 'POST' && $route === 'login') {
    if (!tdf_rate_limit($pdo, 'log:' . tdf_ip(), 20, 600)) {
        tdf_err(429, 'Muitas tentativas. Aguarde alguns minutos.');
    }
    $b = tdf_body();
    $identifier = trim((string) ($b['identifier'] ?? ''));
    $pass = (string) ($b['password'] ?? '');
    if ($identifier === '' || $pass === '') {
        tdf_err(422, 'Informe usuário/e-mail e senha.');
    }
    $bucketId = substr(hash('sha256', strtolower($identifier)), 0, 24);
    if (!tdf_rate_limit($pdo, 'logu:' . $bucketId, 5, 300)) {
        tdf_err(429, 'Muitas tentativas para esta conta. Aguarde 5 minutos.');
    }
    $st = $pdo->prepare('SELECT id, pass_hash FROM users WHERE username = :i1 OR email = :i2 LIMIT 1');
    $st->execute([':i1' => $identifier, ':i2' => $identifier]);
    $row = $st->fetch();
    if (!$row || !password_verify($pass, $row['pass_hash'])) {
        tdf_log($pdo, null, 'login_fail', ['identifier' => $identifier]);
        tdf_err(401, 'Credenciais inválidas.');
    }
    $userId = (int) $row['id'];
    tdf_require_not_banned($pdo, $userId);
    $pdo->prepare('UPDATE users SET last_login_at = NOW(), last_ip = :i WHERE id = :u')
        ->execute([':i' => tdf_ip(), ':u' => $userId]);
    $sess = tdf_create_session($pdo, $userId);
    tdf_log($pdo, $userId, 'login');
    tdf_json(['ok' => true] + tdf_user_shape($pdo, $userId) + ['csrf' => $sess['csrf']]);
}

if ($method === 'POST' && $route === 'logout') {
    $uid = tdf_current_user($pdo);
    if (!$uid) tdf_err(401, 'Não autenticado.');
    $b = tdf_body();
    $csrf = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($b['csrf'] ?? ''));
    if (!tdf_check_csrf($pdo, $csrf)) {
        tdf_err(403, 'Token CSRF inválido.');
    }
    $token = $_COOKIE[tdf_cookie_name()] ?? '';
    $pdo->prepare('DELETE FROM sessions WHERE token_hash = :h')
        ->execute([':h' => hash('sha256', $token)]);
    tdf_clear_cookie();
    tdf_log($pdo, $uid, 'logout');
    tdf_json(['ok' => true]);
}

if ($method === 'GET' && $route === 'me') {
    $uid = tdf_current_user($pdo);
    if (!$uid) tdf_err(401, 'Não autenticado.');
    tdf_require_not_banned($pdo, $uid);
    $csrf = null;
    $token = $_COOKIE[tdf_cookie_name()] ?? '';
    if ($token !== '') {
        $st = $pdo->prepare('SELECT csrf_token FROM sessions WHERE token_hash = :h LIMIT 1');
        $st->execute([':h' => hash('sha256', $token)]);
        $row = $st->fetch();
        $csrf = $row ? $row['csrf_token'] : null;
    }
    $unread = (int) $pdo->prepare('SELECT COUNT(*) FROM notifications WHERE user_id = :u AND is_read = 0')
        ->execute([':u' => $uid]) ?: 0;
    $st = $pdo->prepare('SELECT COUNT(*) FROM notifications WHERE user_id = :u AND is_read = 0');
    $st->execute([':u' => $uid]);
    $unread = (int) $st->fetchColumn();
    tdf_json(['ok' => true] + tdf_user_shape($pdo, $uid) + ['csrf' => $csrf, 'unread_notifications' => $unread]);
}

tdf_err(404, 'Rota não encontrada.');