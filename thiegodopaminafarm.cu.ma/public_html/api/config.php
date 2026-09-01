<?php
/**
 * THIEGO DOPAMINA FARM — api/config.php
 * Carregamento seguro do .env, helpers de resposta JSON, sessão própria
 * (cookie HttpOnly + token em tabela), CSRF e rate limit.
 * Nunca expõe credenciais ao cliente.
 */

if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}

/* ---------- timezone do app (padrão do público pt-BR; override via .env) ----------
   Sem isso, o relógio do PHP depende do php.ini do servidor (ex.: Europe/Berlin
   no XAMPP) e dessincroniza com o NOW() do MySQL — quebra chaves de missões
   diárias e janelas de rate limit. */
$tdf_tz = tdf_env()['APP_TIMEZONE'] ?? 'America/Sao_Paulo';
if (in_array($tdf_tz, DateTimeZone::listIdentifiers(), true)) {
    date_default_timezone_set($tdf_tz);
}

/* ---------- carregamento do .env (sem libs externas) ---------- */
function tdf_env(): array
{
    static $env = null;
    if ($env !== null) {
        return $env;
    }
    $env = [
        'DB_HOST' => 'localhost',
        'DB_NAME' => 'gwncsbql_thiego',
        'DB_USER' => 'gwncsbql_thiego',
        'DB_PASS' => '',
        'SESSION_TTL' => 2592000, // 30 dias
    ];
    $file = __DIR__ . '/.env';
    if (is_file($file)) {
        $lines = file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || $line[0] === '#') continue;
            $pos = strpos($line, '=');
            if ($pos === false) continue;
            $k = trim(substr($line, 0, $pos));
            $v = trim(substr($line, $pos + 1));
            $env[$k] = $v;
        }
    }
    return $env;
}

/* ---------- resposta JSON padrão ---------- */
function tdf_json($data, int $code = 200): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function tdf_err(int $code, string $msg): void
{
    tdf_json(['ok' => false, 'error' => $msg], $code);
}

function tdf_body(): array
{
    $raw = file_get_contents('php://input');
    $body = json_decode($raw ?: '', true);
    return is_array($body) ? $body : [];
}

/* ---------- sessão própria (cookie HttpOnly + tabela sessions) ---------- */
function tdf_cookie_name(): string
{
    return 'tdf_session';
}

function tdf_issue_token(): string
{
    return bin2hex(random_bytes(32));
}

function tdf_set_session_cookie(string $token): void
{
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
    setcookie(tdf_cookie_name(), $token, [
        'expires' => time() + 2592000,
        'path' => '/',
        'domain' => '',
        'secure' => $https,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function tdf_clear_cookie(): void
{
    setcookie(tdf_cookie_name(), '', [
        'expires' => time() - 3600,
        'path' => '/',
        'domain' => '',
        'secure' => false,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

/* ---------- CSRF ---------- */
function tdf_check_csrf(PDO $pdo, string $token): bool
{
    $uid = tdf_current_user($pdo);
    if (!$uid) return false;
    $cookie = $_COOKIE[tdf_cookie_name()] ?? '';
    if ($cookie === '' || strlen($cookie) !== 64) return false;
    $st = $pdo->prepare(
        'SELECT csrf_token FROM sessions
         WHERE token_hash = :h AND user_id = :uid AND expires_at > :now LIMIT 1'
    );
    $st->execute([':h' => hash('sha256', $cookie), ':uid' => $uid, ':now' => time()]);
    $row = $st->fetch();
    return $row && hash_equals((string) $row['csrf_token'], $token);
}

/* ---------- usuário atual ---------- */
function tdf_current_user(PDO $pdo): ?int
{
    static $uid = false;
    if ($uid !== false) return $uid ?: null;
    $token = $_COOKIE[tdf_cookie_name()] ?? '';
    if ($token === '' || strlen($token) !== 64) {
        $uid = 0;
        return null;
    }
    $hash = hash('sha256', $token);
    $st = $pdo->prepare(
        'SELECT user_id, expires_at FROM sessions WHERE token_hash = :h LIMIT 1'
    );
    $st->execute([':h' => $hash]);
    $row = $st->fetch();
    if (!$row) {
        $uid = 0;
        return null;
    }
    if ((int) $row['expires_at'] < time()) {
        $del = $pdo->prepare('DELETE FROM sessions WHERE token_hash = :h');
        $del->execute([':h' => $hash]);
        $uid = 0;
        return null;
    }
    $uid = (int) $row['user_id'];
    return $uid;
}

/* ---------- rate limit por bucket (janela fixa em memória do banco) ---------- */
function tdf_rate_limit(PDO $pdo, string $bucket, int $max, int $windowSec): bool
{
    $now = time();
    $st = $pdo->prepare('SELECT hits, window_start FROM rate_limits WHERE bucket = :b');
    $st->execute([':b' => $bucket]);
    $row = $st->fetch();
    if (!$row) {
        $ins = $pdo->prepare('INSERT INTO rate_limits (bucket, hits, window_start) VALUES (:b, 1, :t)');
        $ins->execute([':b' => $bucket, ':t' => $now]);
        return true;
    }
    if ($now - (int) $row['window_start'] >= $windowSec) {
        $up = $pdo->prepare('UPDATE rate_limits SET hits = 1, window_start = :t WHERE bucket = :b');
        $up->execute([':b' => $bucket, ':t' => $now]);
        return true;
    }
    if ((int) $row['hits'] >= $max) return false;
    $up = $pdo->prepare('UPDATE rate_limits SET hits = hits + 1 WHERE bucket = :b');
    $up->execute([':b' => $bucket]);
    return true;
}

function tdf_ip(): string
{
    return substr((string) ($_SERVER['REMOTE_ADDR'] ?? ''), 0, 64);
}

/* ---------- log de auditoria ---------- */
function tdf_log(PDO $pdo, ?int $userId, string $action, array $detail = []): void
{
    try {
        $st = $pdo->prepare(
            'INSERT INTO game_logs (user_id, action, detail, ip) VALUES (:u, :a, :d, :i)'
        );
        $st->execute([
            ':u' => $userId,
            ':a' => $action,
            ':d' => json_encode($detail, JSON_UNESCAPED_UNICODE),
            ':i' => tdf_ip(),
        ]);
    } catch (Throwable $e) {
        // log nunca derruba a requisição
    }
}

/* ---------- D7: webhook de alerta (Discord/Telegram) ---------- */
function tdf_webhook(string $message, string $level = 'info'): void
{
    $url = (string) (tdf_env()['WEBHOOK_URL'] ?? '');
    if ($url === '') return;
    try {
        $payload = ['content' => mb_substr("[TDF] ({$level}) " . $message, 0, 1800)];
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE),
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 5,
            CURLOPT_CONNECTTIMEOUT => 3,
        ]);
        curl_exec($ch);
        curl_close($ch);
    } catch (Throwable $e) {
        // webhook nunca derruba a requisição
    }
}

/* ---------- D3: estado de moderação do usuário ----------
   Retorna ['blocked' => bool, 'reason' => string, 'until' => int|null].
   ban  → bloqueia tudo (login e sessão atual).
   mute → bloqueia chat/social (mas permite jogar).
   freeze → login permite, mas submits de ranking/save/sync são rejeitados. */
function tdf_mod_status(PDO $pdo, int $uid): array
{
    try {
        $st = $pdo->prepare('SELECT banned_until, muted_until, frozen FROM users WHERE id = :u');
        $st->execute([':u' => $uid]);
        $row = $st->fetch();
    } catch (Throwable $e) {
        return ['blocked' => false, 'reason' => '', 'until' => null, 'frozen' => false, 'muted' => false];
    }
    if (!$row) return ['blocked' => false, 'reason' => '', 'until' => null, 'frozen' => false, 'muted' => false];
    $now = time();
    $bannedUntil = (int) ($row['banned_until'] ?? 0);
    $mutedUntil = (int) ($row['muted_until'] ?? 0);
    if ($bannedUntil > $now) {
        return ['blocked' => true, 'reason' => 'ban', 'until' => $bannedUntil, 'frozen' => false, 'muted' => false];
    }
    return [
        'blocked' => false,
        'reason' => '',
        'until' => null,
        'frozen' => (int) ($row['frozen'] ?? 0) === 1,
        'muted' => $mutedUntil > $now,
    ];
}

/** Requer que o usuário NÃO esteja banido (para login e sessão). */
function tdf_require_not_banned(PDO $pdo, int $uid): void
{
    $mod = tdf_mod_status($pdo, $uid);
    if ($mod['blocked']) {
        tdf_err(403, 'Conta suspensa até ' . date('d/m/Y H:i', (int) $mod['until']));
    }
}

/** Requer que o usuário não esteja congelado (para submits de ranking/save). */
function tdf_require_not_frozen(PDO $pdo, int $uid): void
{
    $mod = tdf_mod_status($pdo, $uid);
    if ($mod['frozen']) {
        tdf_err(403, 'Conta em investigação — submits temporariamente suspensos.');
    }
}