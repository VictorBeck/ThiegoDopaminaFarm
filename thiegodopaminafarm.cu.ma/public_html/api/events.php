<?php
/**
 * THIEGO DOPAMINA FARM — api/events.php
 * B4: Eventos globais da comunidade. Metas coletivas com barra de progresso
 * e recompensa para todos que contribuíram.
 * ROTAS:
 *   GET  current  → evento global ativo (com progresso próprio)
 *   POST contribute → {log10} submeter contribuição do farm do jogador
 *   POST claim    → reivindicar recompensa do evento finalizado
 */

require_once __DIR__ . '/tdf_db.php';
require_once __DIR__ . '/progress.php';

$pdo = tdf_pdo();
tdf_bootstrap();

$route = $_GET['route'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];
$uid = tdf_current_user($pdo);
if (!$uid) tdf_err(401, 'Não autenticado.');
tdf_require_not_banned($pdo, $uid);

/* ---------- evento ativo (ou próximo) ---------- */
if ($method === 'GET' && $route === 'current') {
    $now = time();
    $st = $pdo->prepare(
        "SELECT id, slug, title, description, goal_log10, reward_json, starts_at, ends_at, status
         FROM global_events
         WHERE (status = 'active' OR (status = 'upcoming' AND starts_at <= :n1))
            OR (status = 'finished' AND ends_at >= :n2 - 2592000)
         ORDER BY starts_at DESC LIMIT 5"
    );
    $st->execute([':n1' => $now, ':n2' => $now]);
    $events = $st->fetchAll();
    $out = [];
    foreach ($events as $ev) {
        $evId = (int) $ev['id'];
        // soma das contribuições
        $q = $pdo->prepare('SELECT COALESCE(SUM(log10), 0) AS total FROM global_event_contributions WHERE event_id = :e');
        $q->execute([':e' => $evId]);
        $total = (float) $q->fetch()['total'];
        // contribuição do jogador
        $my = $pdo->prepare('SELECT log10, claimed FROM global_event_contributions WHERE event_id = :e AND user_id = :u');
        $my->execute([':e' => $evId, ':u' => $uid]);
        $myRow = $my->fetch();
        // elegibilidade de resgate: contribuiu + meta atingida (ou encerrado) + não reclamado
        $canClaim = $myRow
            && (float) $myRow['log10'] > 0
            && !(int) $myRow['claimed']
            && ($ev['status'] === 'finished' || $total >= (float) $ev['goal_log10']);
        $out[] = [
            'id' => $evId,
            'slug' => $ev['slug'],
            'title' => $ev['title'],
            'description' => $ev['description'],
            'goal_log10' => (float) $ev['goal_log10'],
            'progress_log10' => round($total, 2),
            'progress_pct' => $ev['goal_log10'] > 0 ? min(100, round($total / (float) $ev['goal_log10'] * 100, 1)) : 0,
            'reward' => json_decode($ev['reward_json'], true) ?: null,
            'starts_at' => (int) $ev['starts_at'],
            'ends_at' => (int) $ev['ends_at'],
            'status' => $ev['status'],
            'my_contribution' => $myRow ? round((float) $myRow['log10'], 2) : 0,
            'my_claimed' => $myRow ? (int) $myRow['claimed'] : 0,
            'can_claim' => $canClaim,
        ];
    }
    tdf_json(['ok' => true, 'events' => $out]);
}

/* ---------- contribuir ---------- */
if ($method === 'POST' && $route === 'contribute') {
    $b = tdf_body();
    $csrf = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($b['csrf'] ?? ''));
    if (!tdf_check_csrf($pdo, $csrf)) tdf_err(403, 'Token CSRF inválido.');

    if (!tdf_rate_limit($pdo, 'evt_contrib:' . $uid, 60, 3600)) {
        tdf_err(429, 'Contribuindo rápido demais.');
    }

    $eventId = (int) ($b['event_id'] ?? 0);
    $log10 = (float) ($b['log10'] ?? 0);

    if ($eventId <= 0 || !is_finite($log10) || $log10 < 0) {
        tdf_err(422, 'event_id e log10 são obrigatórios.');
    }

    $st = $pdo->prepare("SELECT id, status FROM global_events WHERE id = :e AND status = 'active'");
    $st->execute([':e' => $eventId]);
    $ev = $st->fetch();
    if (!$ev) tdf_err(404, 'Evento não encontrado ou não está ativo.');

    $pdo->beginTransaction();
    try {
        $uq = $pdo->prepare(
            'INSERT INTO global_event_contributions (event_id, user_id, log10, claimed)
             VALUES (:e, :u, :l, 0)
             ON DUPLICATE KEY UPDATE log10 = log10 + :l2'
        );
        $uq->execute([':e' => $eventId, ':u' => $uid, ':l' => $log10, ':l2' => $log10]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    tdf_log($pdo, $uid, 'event_contribute', ['event_id' => $eventId, 'log10' => $log10]);
    tdf_json(['ok' => true, 'contributed_log10' => round($log10, 2)]);
}

/* ---------- reivindicar recompensa ---------- */
if ($method === 'POST' && $route === 'claim') {
    $b = tdf_body();
    $csrf = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($b['csrf'] ?? ''));
    if (!tdf_check_csrf($pdo, $csrf)) tdf_err(403, 'Token CSRF inválido.');

    $eventId = (int) ($b['event_id'] ?? 0);
    if ($eventId <= 0) tdf_err(422, 'event_id é obrigatório.');

    $st = $pdo->prepare("SELECT id, status, reward_json, goal_log10 FROM global_events WHERE id = :e");
    $st->execute([':e' => $eventId]);
    $ev = $st->fetch();
    if (!$ev) tdf_err(404, 'Evento não encontrado.');

    // Verifica contribuição
    $my = $pdo->prepare('SELECT log10, claimed FROM global_event_contributions WHERE event_id = :e AND user_id = :u');
    $my->execute([':e' => $eventId, ':u' => $uid]);
    $myRow = $my->fetch();
    if (!$myRow || (float) $myRow['log10'] <= 0) tdf_err(409, 'Você não contribuiu para este evento.');
    if ((int) $myRow['claimed']) tdf_err(409, 'Recompensa já reivindicada.');

    // Verifica se a meta foi atingida (ou status finished)
    $q = $pdo->prepare('SELECT COALESCE(SUM(log10), 0) AS total FROM global_event_contributions WHERE event_id = :e');
    $q->execute([':e' => $eventId]);
    $total = (float) $q->fetch()['total'];
    $goal = (float) $ev['goal_log10'];
    if ($total < $goal && $ev['status'] !== 'finished') {
        tdf_err(409, 'Meta do evento ainda não foi atingida.');
    }

    $reward = json_decode($ev['reward_json'], true) ?: ['battle_coins' => 200, 'xp' => 500];
    $granted = tdf_grant_reward($pdo, $uid, $reward);
    $pdo->prepare('UPDATE global_event_contributions SET claimed = 1 WHERE event_id = :e AND user_id = :u')
        ->execute([':e' => $eventId, ':u' => $uid]);

    tdf_log($pdo, $uid, 'event_claim', ['event_id' => $eventId, 'reward' => $granted]);
    tdf_json(['ok' => true, 'event' => $ev['title'], 'granted' => $granted]);
}

tdf_err(404, 'Rota não encontrada.');