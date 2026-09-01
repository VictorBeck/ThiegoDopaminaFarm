<?php
/**
 * THIEGO DOPAMINA FARM — api/suggest.php
 * Sugestões dos jogadores. Cada sugestão expira (é apagada) após 7 dias.
 * Sistema de likes: sugerir é bom, mas o que o povo CURTE sobe para o topo.
 * GET  list   → sugestões ativas (ordena por likes desc, depois data)
 * POST add    → criar sugestão {text}
 * POST like   → dar like {suggestion_id}
 * POST unlike → remover like {suggestion_id}
 */

require_once __DIR__ . '/tdf_db.php';

$pdo = tdf_pdo();
tdf_bootstrap();

$route = $_GET['route'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];
$uid = tdf_current_user($pdo);
if (!$uid) tdf_err(401, 'Não autenticado.');

function tdf_sug_require_csrf(PDO $pdo, int $uid): void
{
    $b = tdf_body();
    $csrf = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($b['csrf'] ?? ''));
    if (!tdf_check_csrf($pdo, $csrf)) tdf_err(403, 'Token CSRF inválido.');
}

/** Remove sugestões com mais de 7 dias (expiração). */
function tdf_suggest_expire(PDO $pdo): void
{
    try {
        $pdo->exec("DELETE FROM suggestions WHERE created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)");
    } catch (Throwable $e) {
        // nunca derruba
    }
}

if ($method === 'GET' && $route === 'list') {
    tdf_suggest_expire($pdo);
    $st = $pdo->query(
        'SELECT s.id, s.user_id, s.text, s.likes, s.created_at, u.username,
                (SELECT 1 FROM suggestion_likes sl WHERE sl.suggestion_id = s.id AND sl.user_id = ' . (int) $uid . ') AS liked
         FROM suggestions s JOIN users u ON u.id = s.user_id
         ORDER BY s.likes DESC, s.created_at DESC
         LIMIT 100'
    );
    $rows = [];
    foreach ($st->fetchAll() as $r) {
        $rows[] = [
            'id' => (int) $r['id'],
            'user_id' => (int) $r['user_id'],
            'username' => $r['username'],
            'text' => $r['text'],
            'likes' => (int) $r['likes'],
            'created_at' => $r['created_at'],
            'liked' => $r['liked'] ? true : false,
            'mine' => (int) $r['user_id'] === $uid,
        ];
    }
    tdf_json(['ok' => true, 'suggestions' => $rows]);
}

if ($method === 'POST' && $route === 'add') {
    tdf_sug_require_csrf($pdo, $uid);
    if (!tdf_rate_limit($pdo, 'sug:' . $uid, 5, 300)) {
        tdf_err(429, 'Muitas sugestões. Aguarde alguns minutos.');
    }
    $b = tdf_body();
    $text = trim(mb_substr((string) ($b['text'] ?? ''), 0, 500));
    if ($text === '') tdf_err(422, 'Sugestão vazia.');
    $ins = $pdo->prepare('INSERT INTO suggestions (user_id, text) VALUES (:u, :t)');
    $ins->execute([':u' => $uid, ':t' => $text]);
    $newId = (int) $pdo->lastInsertId();
    tdf_log($pdo, $uid, 'suggest_add', ['id' => $newId]);
    tdf_json(['ok' => true, 'id' => $newId]);
}

if ($method === 'POST' && $route === 'like') {
    tdf_sug_require_csrf($pdo, $uid);
    $b = tdf_body();
    $sid = (int) ($b['suggestion_id'] ?? 0);
    $st = $pdo->prepare('SELECT id FROM suggestions WHERE id = :id');
    $st->execute([':id' => $sid]);
    if (!$st->fetch()) tdf_err(404, 'Sugestão não encontrada.');
    $ins = $pdo->prepare('INSERT IGNORE INTO suggestion_likes (user_id, suggestion_id) VALUES (:u, :s)');
    $ins->execute([':u' => $uid, ':s' => $sid]);
    if ($ins->rowCount() > 0) {
        $pdo->prepare('UPDATE suggestions SET likes = likes + 1 WHERE id = :id')->execute([':id' => $sid]);
    }
    $cnt = $pdo->prepare('SELECT likes FROM suggestions WHERE id = :id');
    $cnt->execute([':id' => $sid]);
    tdf_json(['ok' => true, 'likes' => (int) $cnt->fetchColumn()]);
}

if ($method === 'POST' && $route === 'unlike') {
    tdf_sug_require_csrf($pdo, $uid);
    $b = tdf_body();
    $sid = (int) ($b['suggestion_id'] ?? 0);
    $del = $pdo->prepare('DELETE FROM suggestion_likes WHERE user_id = :u AND suggestion_id = :s');
    $del->execute([':u' => $uid, ':s' => $sid]);
    if ($del->rowCount() > 0) {
        $pdo->prepare('UPDATE suggestions SET likes = GREATEST(0, likes - 1) WHERE id = :id')->execute([':id' => $sid]);
    }
    $cnt = $pdo->prepare('SELECT likes FROM suggestions WHERE id = :id');
    $cnt->execute([':id' => $sid]);
    tdf_json(['ok' => true, 'likes' => (int) $cnt->fetchColumn()]);
}

tdf_err(404, 'Rota não encontrada.');