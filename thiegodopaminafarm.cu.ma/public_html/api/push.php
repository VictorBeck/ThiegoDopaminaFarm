<?php
/**
 * THIEGO DOPAMINA FARM — api/push.php
 * Gerenciamento de assinaturas Push Notification.
 * Rotas:
 *   POST ?route=subscribe   — salva assinatura do navegador
 *   POST ?route=unsubscribe — remove assinatura
 *   GET  ?route=list        — lista assinaturas (requer admin)
 *   POST ?route=send        — envia notificacao (requer admin)
 *
 * O envio REAL de push requer chaves VAPID (configuradas no .env):
 *   VAPID_PUBLIC_KEY=
 *   VAPID_PRIVATE_KEY=
 *   VAPID_SUBJECT=mailto:admin@exemplo.com
 *
 * Sem chaves, o subscribe salva as assinaturas mas o envio
 * fica desabilitado (documentação indica como gerar).
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/tdf_db.php';

$pdo = tdf_pdo();
$route = $_GET['route'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

/* ---------- bootstrap da tabela ---------- */
$pdo->exec("CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NULL,
    endpoint VARCHAR(500) NOT NULL UNIQUE,
    auth_key VARCHAR(100) NOT NULL DEFAULT '',
    p256dh_key VARCHAR(100) NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_push_user (user_id),
    CONSTRAINT fk_push_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

/* ---------- subscribe ---------- */
if ($method === 'POST' && $route === 'subscribe') {
    $body = tdf_body();
    $sub = $body['subscription'] ?? null;
    if (!$sub || empty($sub['endpoint'])) {
        tdf_err(422, 'subscription inválida');
    }

    $userId = tdf_current_user($pdo);
    $endpoint = substr($sub['endpoint'], 0, 500);
    $auth = $sub['keys']['auth'] ?? '';
    $p256dh = $sub['keys']['p256dh'] ?? '';

    $st = $pdo->prepare('SELECT id FROM push_subscriptions WHERE endpoint = :e');
    $st->execute([':e' => $endpoint]);
    $existing = $st->fetch();

    if ($existing) {
        $up = $pdo->prepare('UPDATE push_subscriptions SET user_id = :u, auth_key = :a, p256dh_key = :p WHERE id = :id');
        $up->execute([':u' => $userId, ':a' => $auth, ':p' => $p256dh, ':id' => $existing['id']]);
    } else {
        $ins = $pdo->prepare('INSERT INTO push_subscriptions (user_id, endpoint, auth_key, p256dh_key) VALUES (:u, :e, :a, :p)');
        $ins->execute([':u' => $userId, ':e' => $endpoint, ':a' => $auth, ':p' => $p256dh]);
    }

    tdf_json(['ok' => true]);
}

/* ---------- unsubscribe ---------- */
if ($method === 'POST' && $route === 'unsubscribe') {
    $body = tdf_body();
    $sub = $body['subscription'] ?? null;
    $endpoint = $sub['endpoint'] ?? '';

    if ($endpoint) {
        $del = $pdo->prepare('DELETE FROM push_subscriptions WHERE endpoint = :e');
        $del->execute([':e' => $endpoint]);
    } else {
        $userId = tdf_current_user($pdo);
        if ($userId) {
            $pdo->prepare('DELETE FROM push_subscriptions WHERE user_id = :u')->execute([':u' => $userId]);
        }
    }
    tdf_json(['ok' => true]);
}

/* ---------- list (admin) ---------- */
if ($method === 'GET' && $route === 'list') {
    $userId = tdf_current_user($pdo);
    if (!$userId) tdf_err(401, 'login necessário');
    $st = $pdo->prepare('SELECT is_admin FROM users WHERE id = :u');
    $st->execute([':u' => $userId]);
    $u = $st->fetch();
    if (!$u || !$u['is_admin']) tdf_err(403, 'admin necessário');

    $rows = $pdo->query('SELECT id, user_id, substring(endpoint,1,60) as endpoint_prefix, created_at FROM push_subscriptions ORDER BY id DESC')->fetchAll();
    tdf_json(['ok' => true, 'subscriptions' => $rows]);
}

/* ---------- send (admin) — prepara notificacao ---------- */
if ($method === 'POST' && $route === 'send') {
    $userId = tdf_current_user($pdo);
    if (!$userId) tdf_err(401, 'login necessário');
    $st = $pdo->prepare('SELECT is_admin FROM users WHERE id = :u');
    $st->execute([':u' => $userId]);
    $u = $st->fetch();
    if (!$u || !$u['is_admin']) tdf_err(403, 'admin necessário');

    $body = tdf_body();
    $title = $body['title'] ?? 'THIEGO DOPAMINA FARM';
    $msg = $body['message'] ?? '';

    $env = tdf_env();
    $vapidPrivate = $env['VAPID_PRIVATE_KEY'] ?? '';

    if (!$vapidPrivate) {
        tdf_json(['ok' => false, 'error' => 'VAPID_PRIVATE_KEY não configurada no .env. Gere com: npx web-push generate-vapid-keys']);
    }

    // Busca subscriptions
    $subs = $pdo->query('SELECT endpoint, auth_key, p256dh_key FROM push_subscriptions')->fetchAll();

    // Prepara notificações pendentes para envio externo (web-push)
    // O envio real requer web-push (Node.js) ou minishlink/web-push (PHP)
    $pdo->prepare("CREATE TABLE IF NOT EXISTS push_queue (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        endpoint VARCHAR(500) NOT NULL,
        auth_key VARCHAR(100) NOT NULL DEFAULT '',
        p256dh_key VARCHAR(100) NOT NULL DEFAULT '',
        payload TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4")->execute();

    $payload = json_encode(['title' => $title, 'body' => $msg, 'persistent' => true]);
    $ins = $pdo->prepare('INSERT INTO push_queue (endpoint, auth_key, p256dh_key, payload) VALUES (:e, :a, :p, :pl)');
    $count = 0;
    foreach ($subs as $sub) {
        $ins->execute([':e' => $sub['endpoint'], ':a' => $sub['auth_key'], ':p' => $sub['p256dh_key'], ':pl' => $payload]);
        $count++;
    }

    tdf_json(['ok' => true, 'queued' => $count, 'note' => 'Para enviar, use: node tools/push_send.js']);
}

/* ---------- status ---------- */
$env = tdf_env();
$vapidPublic = $env['VAPID_PUBLIC_KEY'] ?? '';
$userId = tdf_current_user($pdo);
$subCount = 0;
if ($userId) {
    $st = $pdo->prepare('SELECT COUNT(*) FROM push_subscriptions WHERE user_id = :u');
    $st->execute([':u' => $userId]);
    $subCount = (int) $st->fetchColumn();
}

tdf_json([
    'ok' => true,
    'vapid' => $vapidPublic ? $vapidPublic : null,
    'enabled' => $vapidPublic !== '',
    'my_subscriptions' => $subCount,
]);