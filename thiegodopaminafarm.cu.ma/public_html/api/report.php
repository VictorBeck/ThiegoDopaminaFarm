<?php
/**
 * THIEGO DOPAMINA FARM — api/report.php
 * D6: Denúncias de jogadores. Qualquer jogador logado pode denunciar.
 * Máx 5 denúncias/dia para evitar flood.
 * ROTAS:
 *   POST report  → criar denúncia {target_id, reason, detail}
 */

require_once __DIR__ . '/tdf_db.php';

$pdo = tdf_pdo();
tdf_bootstrap();

$route = $_GET['route'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];
$uid = tdf_current_user($pdo);
if (!$uid) tdf_err(401, 'Não autenticado.');
tdf_require_not_banned($pdo, $uid);

if ($method === 'POST' && $route === 'report') {
    $b = tdf_body();
    $csrf = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($b['csrf'] ?? ''));
    if (!tdf_check_csrf($pdo, $csrf)) tdf_err(403, 'Token CSRF inválido.');

    if (!tdf_rate_limit($pdo, 'report:' . $uid, 5, 86400)) {
        tdf_err(429, 'Máximo de 5 denúncias por dia.');
    }

    // Alvo por id OU por username (a UI do Hub aceita "username ou ID")
    $targetId = (int) ($b['target_id'] ?? 0);
    $targetName = trim((string) ($b['target_name'] ?? ''));
    if ($targetId <= 0 && $targetName !== '') {
        $q = $pdo->prepare('SELECT id FROM users WHERE username = :n LIMIT 1');
        $q->execute([':n' => mb_substr($targetName, 0, 40)]);
        $found = $q->fetchColumn();
        if ($found) {
            $targetId = (int) $found;
        }
    }
    if ($targetId <= 0) tdf_err(422, 'Informe um ID ou nome de jogador válido.');
    if ($targetId === $uid) tdf_err(422, 'Não pode denunciar a si mesmo.');

    $st = $pdo->prepare('SELECT id FROM users WHERE id = :u');
    $st->execute([':u' => $targetId]);
    if (!$st->fetch()) tdf_err(404, 'Usuário não encontrado.');

    $reason = (string) ($b['reason'] ?? 'other');
    if (!in_array($reason, ['cheating', 'harassment', 'spam', 'other'], true)) {
        tdf_err(422, 'Motivo inválido. Use: cheating, harassment, spam, other.');
    }
    $detail = mb_substr(trim((string) ($b['detail'] ?? '')), 0, 500);

    $ins = $pdo->prepare('INSERT INTO reports (reporter_id, target_id, reason, detail) VALUES (:r, :t, :re, :d)');
    $ins->execute([':r' => $uid, ':t' => $targetId, ':re' => $reason, ':d' => $detail]);
    tdf_log($pdo, $uid, 'report', ['target' => $targetId, 'reason' => $reason]);
    tdf_json(['ok' => true, 'report_id' => (int) $pdo->lastInsertId()]);
}

tdf_err(404, 'Rota não encontrada.');