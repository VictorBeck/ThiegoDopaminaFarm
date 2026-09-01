<?php
/**
 * THIEGO DOPAMINA FARM — api/admin.php
 * Endpoints exclusivos para admins. Só aceita requisições de usuários
 * com is_admin = 1. ROTAS:
 *   POST admin_mode          → alterna ou define admin_mode (0/1)
 *   POST update              → edita conta de OUTRO jogador (D1: nunca a própria)
 *   GET  audit                → log de ações admin (D2)
 *   POST ban                 → banir jogador (D3)
 *   POST mute                → mutar jogador (D3)
 *   POST warn                → advertir jogador (D3)
 *   POST freeze              → congelar conta (D3)
 *   POST unfreeze            → descongelar (D3)
 *   GET  reports             → fila de denúncias (D6)
 *   POST resolve_report      → resolve denúncia (D6)
 */

require_once __DIR__ . '/tdf_db.php';

$pdo = tdf_pdo();
tdf_bootstrap();

$route = $_GET['route'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];
$uid = tdf_current_user($pdo);
if (!$uid) tdf_err(401, 'Não autenticado.');

// Verifica se é admin
$st = $pdo->prepare('SELECT is_admin, admin_mode FROM users WHERE id = :u');
$st->execute([':u' => $uid]);
$row = $st->fetch();
if (!$row || !(int) $row['is_admin']) tdf_err(403, 'Apenas admins.');

$isAdmin = true;
$adminMode = (int) ($row['admin_mode'] ?? 0);

function tdf_admin_require_csrf(PDO $pdo, int $uid): void
{
    $b = tdf_body();
    $csrf = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($b['csrf'] ?? ''));
    if (!tdf_check_csrf($pdo, $csrf)) tdf_err(403, 'Token CSRF inválido.');
}

/* ---------- admin_mode ---------- */
if ($method === 'POST' && $route === 'admin_mode') {
    $b = tdf_body();
    $mode = isset($b['mode']) ? (int) $b['mode'] : null;
    if ($mode !== null && $mode !== 0 && $mode !== 1) {
        tdf_err(422, 'mode deve ser 0 ou 1.');
    }
    if ($mode === null) {
        $mode = $adminMode ? 0 : 1;
    }
    $up = $pdo->prepare('UPDATE users SET admin_mode = :m WHERE id = :u');
    $up->execute([':m' => $mode, ':u' => $uid]);
    tdf_log($pdo, $uid, 'admin_mode', ['mode' => $mode]);
    tdf_json(['ok' => true, 'admin_mode' => $mode]);
}

/* ---------- D1: update de conta (NUNCA a própria) ---------- */
if ($method === 'POST' && $route === 'update') {
    tdf_admin_require_csrf($pdo, $uid);
    $b = tdf_body();
    $targetId = (int) ($b['user_id'] ?? 0);
    if ($targetId <= 0) tdf_err(422, 'user_id é obrigatório.');
    if ($targetId === $uid) tdf_err(403, 'Admin não pode editar a própria conta.');

    $st = $pdo->prepare('SELECT id FROM users WHERE id = :u');
    $st->execute([':u' => $targetId]);
    if (!$st->fetch()) tdf_err(404, 'Usuário não encontrado.');

    $fields = [];
    $params = [':u' => $targetId];
    $before = $pdo->prepare('SELECT * FROM user_progress WHERE user_id = :u');
    $before->execute([':u' => $targetId]);
    $beforeRow = $before->fetch();

    if (isset($b['total_dopamine_log10'])) {
        $v = (float) $b['total_dopamine_log10'];
        if ($v < 0 || $v > 1200 || !is_finite($v)) tdf_err(422, 'dopamine inválido.');
        $fields[] = 'total_dopamine_log10 = :dop';
        $params[':dop'] = $v;
    }
    if (isset($b['prestige'])) {
        $v = (int) $b['prestige'];
        if ($v < 0 || $v > 1000000) tdf_err(422, 'prestige inválido.');
        $fields[] = 'prestige = :p';
        $params[':p'] = $v;
    }
    if (isset($b['prestige_points'])) {
        $v = (int) $b['prestige_points'];
        if ($v < 0 || $v > 10000000) tdf_err(422, 'prestige_points inválido.');
        $fields[] = 'prestige_points = :pp';
        $params[':pp'] = $v;
    }
    if (isset($b['level'])) {
        $v = (int) $b['level'];
        if ($v < 1 || $v > 999) tdf_err(422, 'level inválido.');
        $fields[] = 'level = :lvl';
        $params[':lvl'] = $v;
    }
    if (isset($b['evolution_tier'])) {
        $v = (int) $b['evolution_tier'];
        if ($v < 0 || $v > 100) tdf_err(422, 'evolution_tier inválido.');
        $fields[] = 'evolution_tier = :et';
        $params[':et'] = $v;
    }
    if (isset($b['battle_coins'])) {
        $v = (int) $b['battle_coins'];
        if ($v < 0 || $v > 1000000000) tdf_err(422, 'battle_coins inválido.');
        $fields[] = 'battle_coins = :bc';
        $params[':bc'] = $v;
    }

    if (empty($fields)) {
        tdf_err(422, 'Nenhum campo para atualizar.');
    }
    $sql = 'UPDATE user_progress SET ' . implode(', ', $fields) . ' WHERE user_id = :u';
    $up = $pdo->prepare($sql);
    $up->execute($params);

    $after = $pdo->prepare('SELECT * FROM user_progress WHERE user_id = :u');
    $after->execute([':u' => $targetId]);
    $afterRow = $after->fetch();
    tdf_log($pdo, $uid, 'admin_update_user', [
        'target' => $targetId,
        'fields' => array_keys($b),
        'before' => $beforeRow,
        'after' => $afterRow,
    ]);
    tdf_json(['ok' => true, 'updated' => count($fields)]);
}

/* ---------- D2: auditoria ---------- */
if ($method === 'GET' && $route === 'audit') {
    $limit = min(200, max(1, (int) ($_GET['limit'] ?? 50)));
    $offset = max(0, (int) ($_GET['offset'] ?? 0));
    $target = (int) ($_GET['target'] ?? 0);

    $where = '1=1';
    $params = [];
    if ($target > 0) {
        $where = 'user_id = :t';
        $params[':t'] = $target;
    }
    $q = $pdo->prepare(
        "SELECT * FROM game_logs WHERE {$where} ORDER BY id DESC LIMIT {$limit} OFFSET {$offset}"
    );
    $q->execute($params);
    $rows = $q->fetchAll();
    foreach ($rows as &$r) {
        $r['detail'] = $r['detail'] ? json_decode($r['detail'], true) : null;
    }
    tdf_json(['ok' => true, 'logs' => $rows, 'limit' => $limit, 'offset' => $offset]);
}

/* ---------- D3: ban/mute/warn/freeze/unfreeze ---------- */
function tdf_admin_mod_action(PDO $pdo, int $adminId, string $action, array $b): void
{
    $targetId = (int) ($b['user_id'] ?? 0);
    if ($targetId <= 0) tdf_err(422, 'user_id é obrigatório.');
    if ($targetId === $adminId) tdf_err(403, 'Não pode aplicar ação a si mesmo.');

    $st = $pdo->prepare('SELECT id, username FROM users WHERE id = :u');
    $st->execute([':u' => $targetId]);
    $target = $st->fetch();
    if (!$target) tdf_err(404, 'Usuário não encontrado.');

    $reason = mb_substr(trim((string) ($b['reason'] ?? '')), 0, 500);
    $duration = isset($b['duration_hours']) ? max(1, (int) $b['duration_hours']) : null;
    $durationSec = $duration !== null ? $duration * 3600 : null;
    $expiresAt = $durationSec !== null ? time() + $durationSec : null;

    $pdo->beginTransaction();
    try {
        switch ($action) {
            case 'ban':
                $pdo->prepare('UPDATE users SET banned_until = :e WHERE id = :u')
                    ->execute([':e' => $expiresAt ?? (time() + 365*86400*100), ':u' => $targetId]);
                // limpa sessões ativas
                $pdo->prepare('DELETE FROM sessions WHERE user_id = :u')->execute([':u' => $targetId]);
                break;
            case 'mute':
                $pdo->prepare('UPDATE users SET muted_until = :e WHERE id = :u')
                    ->execute([':e' => $expiresAt ?? (time() + 86400), ':u' => $targetId]);
                break;
            case 'warn':
                // não altera colunas, só registra
                tdf_notify($pdo, $targetId, '⚠️ Advertência', $reason ?: 'Você recebeu uma advertência.');
                break;
            case 'freeze':
                $pdo->prepare('UPDATE users SET frozen = 1 WHERE id = :u')
                    ->execute([':u' => $targetId]);
                break;
            case 'unfreeze':
                $pdo->prepare('UPDATE users SET frozen = 0 WHERE id = :u')
                    ->execute([':u' => $targetId]);
                break;
        }
        $ins = $pdo->prepare(
            'INSERT INTO moderation_actions (user_id, admin_id, action, reason, duration_sec, expires_at) VALUES (:u, :a, :act, :r, :d, :e)'
        );
        $ins->execute([':u' => $targetId, ':a' => $adminId, ':act' => $action, ':r' => $reason, ':d' => $durationSec, ':e' => $expiresAt]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }

    tdf_log($pdo, $adminId, 'admin_' . $action, [
        'target' => $targetId,
        'target_username' => $target['username'],
        'reason' => $reason,
        'duration_hours' => $duration,
    ]);
    tdf_webhook("Admin action: {$action} on {$target['username']}" . ($reason ? " ({$reason})" : ''), 'warning');
    tdf_json(['ok' => true, 'action' => $action, 'target' => $target['username']]);
}

if ($method === 'POST' && $route === 'ban') {
    tdf_admin_require_csrf($pdo, $uid);
    tdf_admin_mod_action($pdo, $uid, 'ban', tdf_body());
}
if ($method === 'POST' && $route === 'mute') {
    tdf_admin_require_csrf($pdo, $uid);
    tdf_admin_mod_action($pdo, $uid, 'mute', tdf_body());
}
if ($method === 'POST' && $route === 'warn') {
    tdf_admin_require_csrf($pdo, $uid);
    tdf_admin_mod_action($pdo, $uid, 'warn', tdf_body());
}
if ($method === 'POST' && $route === 'freeze') {
    tdf_admin_require_csrf($pdo, $uid);
    tdf_admin_mod_action($pdo, $uid, 'freeze', tdf_body());
}
if ($method === 'POST' && $route === 'unfreeze') {
    tdf_admin_require_csrf($pdo, $uid);
    tdf_admin_mod_action($pdo, $uid, 'unfreeze', tdf_body());
}

/* ---------- D6: denúncias (reports) ---------- */
if ($method === 'GET' && $route === 'reports') {
    $status = $_GET['status'] ?? 'open';
    $limit = min(100, max(1, (int) ($_GET['limit'] ?? 50)));
    $offset = max(0, (int) ($_GET['offset'] ?? 0));
    $st = $pdo->prepare(
        "SELECT r.*, ru.username AS reporter_name, tu.username AS target_name
         FROM reports r
         LEFT JOIN users ru ON ru.id = r.reporter_id
         LEFT JOIN users tu ON tu.id = r.target_id
         WHERE r.status = :s ORDER BY r.id DESC LIMIT {$limit} OFFSET {$offset}"
    );
    $st->execute([':s' => $status]);
    tdf_json(['ok' => true, 'reports' => $st->fetchAll()]);
}

if ($method === 'POST' && $route === 'resolve_report') {
    tdf_admin_require_csrf($pdo, $uid);
    $b = tdf_body();
    $reportId = (int) ($b['report_id'] ?? 0);
    $newStatus = ($b['action'] ?? 'dismissed') === 'actioned' ? 'actioned' : 'dismissed';
    if ($reportId <= 0) tdf_err(422, 'report_id é obrigatório.');
    $st = $pdo->prepare('SELECT id, target_id, reason FROM reports WHERE id = :r AND status = \'open\'');
    $st->execute([':r' => $reportId]);
    $report = $st->fetch();
    if (!$report) tdf_err(404, 'Denúncia não encontrada ou já resolvida.');
    $pdo->prepare('UPDATE reports SET status = :s WHERE id = :r')
        ->execute([':s' => $newStatus, ':r' => $reportId]);
    tdf_log($pdo, $uid, 'resolve_report', ['report_id' => $reportId, 'action' => $newStatus, 'target' => $report['target_id']]);
    tdf_json(['ok' => true, 'report_id' => $reportId, 'status' => $newStatus]);
}

tdf_err(404, 'Rota não encontrada.');