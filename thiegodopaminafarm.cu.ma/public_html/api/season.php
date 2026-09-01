<?php
/**
 * THIEGO DOPAMINA FARM — api/season.php
 * B3: Season pass. A temporada ativa (seasons.active=1) tem um passe com
 * 20 tiers de recompensa. O jogador ganha XP de temporada ao jogar
 * (add_xp chamado pelo sync/farm) e reivindica recompensas tier a tier.
 * ROTAS:
 *   GET  info        → temporada ativa + tiers + progresso do jogador
 *   POST add_xp      → {xp} adicionar XP de temporada
 *   POST claim       → {tier, mode:'free'|'premium'} reivindicar recompensa
 *   POST buy_premium → {cost=5000} comprar premium do passe
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

define('TDF_PASS_MAX_TIER', 20);

/** Tiers fixos do passe (1..20). */
function tdf_pass_tiers(): array
{
    $tiers = [];
    for ($t = 1; $t <= TDF_PASS_MAX_TIER; $t++) {
        $free = ['battle_coins' => 50 + ($t - 1) * 50, 'xp' => 100 + ($t - 1) * 100];
        $premium = ['battle_coins' => 150 + ($t - 1) * 150, 'xp' => 300 + ($t - 1) * 250];
        if ($t % 5 === 0) {
            $free['dopamine_log10'] = (int) ($t / 5);
            $premium['dopamine_log10'] = (int) ($t / 5) * 3;
            $premium['genealogy_points'] = 50 * (int) ($t / 5);
        }
        $tiers[] = ['tier' => $t, 'xp_required' => $t * 100, 'free' => $free, 'premium' => $premium];
    }
    return $tiers;
}

/** Temporada ativa (ou null). */
function tdf_active_season(PDO $pdo): ?array
{
    $now = time();
    $st = $pdo->prepare('SELECT id, slug, name, starts_at, ends_at FROM seasons WHERE active = 1 AND starts_at <= :n1 AND ends_at >= :n2 LIMIT 1');
    $st->execute([':n1' => $now, ':n2' => $now]);
    $s = $st->fetch();
    return $s ?: null;
}

/** Pass do jogador na temporada (ou null). */
function tdf_pass_get(PDO $pdo, int $uid, int $seasonId): ?array
{
    $st = $pdo->prepare('SELECT * FROM season_passes WHERE user_id = :u AND season_id = :s');
    $st->execute([':u' => $uid, ':s' => $seasonId]);
    $row = $st->fetch();
    if (!$row) return null;
    $claimed = json_decode((string) ($row['claimed_rewards'] ?? '[]'), true);
    if (!is_array($claimed)) $claimed = [];
    return [
        'xp' => (int) $row['xp'],
        'tier' => (int) $row['tier'],
        'premium' => (int) $row['premium'] === 1,
        'claimed_rewards' => $claimed,
        'next_xp' => ((int) $row['tier'] + 1) * 100,
    ];
}

if ($method === 'GET' && $route === 'info') {
    $season = tdf_active_season($pdo);
    if (!$season) {
        tdf_json(['ok' => true, 'season' => null, 'tiers' => tdf_pass_tiers(), 'pass' => null, 'max_tier' => TDF_PASS_MAX_TIER]);
    }
    tdf_json([
        'ok' => true,
        'season' => [
            'id' => (int) $season['id'],
            'slug' => $season['slug'],
            'name' => $season['name'],
            'starts_at' => (int) $season['starts_at'],
            'ends_at' => (int) $season['ends_at'],
        ],
        'tiers' => tdf_pass_tiers(),
        'pass' => tdf_pass_get($pdo, $uid, (int) $season['id']),
        'max_tier' => TDF_PASS_MAX_TIER,
    ]);
}

if ($method === 'POST' && $route === 'add_xp') {
    $b = tdf_body();
    $csrf = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($b['csrf'] ?? ''));
    if (!tdf_check_csrf($pdo, $csrf)) tdf_err(403, 'Token CSRF inválido.');
    if (!tdf_rate_limit($pdo, 'season_xp:' . $uid, 120, 3600)) tdf_err(429, 'Rápido demais.');

    $xp = (int) ($b['xp'] ?? 0);
    if ($xp < 1 || $xp > 10000) tdf_err(422, 'xp inválido (1-10000).');

    $season = tdf_active_season($pdo);
    if (!$season) tdf_json(['ok' => true, 'pass' => null]);

    $sid = (int) $season['id'];
    $cur = tdf_pass_get($pdo, $uid, $sid);
    $newXp = ($cur ? $cur['xp'] : 0) + $xp;
    $newTier = min(TDF_PASS_MAX_TIER, (int) floor($newXp / 100));

    $pdo->beginTransaction();
    try {
        $up = $pdo->prepare(
            'INSERT INTO season_passes (user_id, season_id, xp, tier, premium, claimed_rewards)
             VALUES (:u, :s, :x, :t, 0, :c)
             ON DUPLICATE KEY UPDATE xp = xp + :x2, tier = :t2'
        );
        $up->execute([':u' => $uid, ':s' => $sid, ':x' => $xp, ':t' => $newTier, ':c' => '[]', ':x2' => $xp, ':t2' => $newTier]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }

    $newPass = tdf_pass_get($pdo, $uid, $sid);
    $tierUps = $cur ? ($newPass['tier'] - $cur['tier']) : $newPass['tier'];
    if ($tierUps > 0) {
        tdf_notify($pdo, $uid, '🎖️ Season Pass', 'Você subiu ' . $tierUps . ' tier(s) no passe da temporada! Reivindique suas recompensas.');
    }
    tdf_log($pdo, $uid, 'season_xp', ['xp' => $xp, 'tier' => $newPass['tier']]);
    tdf_json(['ok' => true, 'pass' => $newPass]);
}

if ($method === 'POST' && $route === 'claim') {
    $b = tdf_body();
    $csrf = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($b['csrf'] ?? ''));
    if (!tdf_check_csrf($pdo, $csrf)) tdf_err(403, 'Token CSRF inválido.');

    $tier = (int) ($b['tier'] ?? 0);
    $mode = ($b['mode'] ?? 'free') === 'premium' ? 'premium' : 'free';
    if ($tier < 1 || $tier > TDF_PASS_MAX_TIER) tdf_err(422, 'tier inválido.');

    $season = tdf_active_season($pdo);
    if (!$season) tdf_err(404, 'Sem temporada ativa.');

    $pass = tdf_pass_get($pdo, $uid, (int) $season['id']);
    if (!$pass) tdf_err(409, 'Você não tem progresso neste passe.');
    if ($pass['tier'] < $tier) tdf_err(409, 'Tier ainda bloqueado.');
    if ($mode === 'premium' && !$pass['premium']) tdf_err(403, 'Premium não adquirido.');

    $key = $tier . ':' . $mode;
    if (in_array($key, $pass['claimed_rewards'], true)) tdf_err(409, 'Recompensa já reivindicada.');

    $tiers = tdf_pass_tiers();
    $reward = $mode === 'premium' ? $tiers[$tier - 1]['premium'] : $tiers[$tier - 1]['free'];

    $pdo->beginTransaction();
    try {
        $granted = tdf_grant_reward($pdo, $uid, $reward);
        $pass['claimed_rewards'][] = $key;
        $up = $pdo->prepare('UPDATE season_passes SET claimed_rewards = :c WHERE user_id = :u AND season_id = :s');
        $up->execute([':c' => json_encode($pass['claimed_rewards'], JSON_UNESCAPED_UNICODE), ':u' => $uid, ':s' => (int) $season['id']]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }

    tdf_log($pdo, $uid, 'season_claim', ['tier' => $tier, 'mode' => $mode, 'reward' => $granted]);
    tdf_json(['ok' => true, 'tier' => $tier, 'mode' => $mode, 'granted' => $granted]);
}

if ($method === 'POST' && $route === 'buy_premium') {
    $b = tdf_body();
    $csrf = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($b['csrf'] ?? ''));
    if (!tdf_check_csrf($pdo, $csrf)) tdf_err(403, 'Token CSRF inválido.');

    $cost = max(1000, (int) ($b['cost'] ?? 5000));
    $season = tdf_active_season($pdo);
    if (!$season) tdf_err(404, 'Sem temporada ativa.');

    $cur = tdf_pass_get($pdo, $uid, (int) $season['id']);
    if ($cur && $cur['premium']) tdf_err(409, 'Premium já adquirido.');

    $st = $pdo->prepare('SELECT battle_coins FROM user_progress WHERE user_id = :u');
    $st->execute([':u' => $uid]);
    $coins = (int) ($st->fetch()['battle_coins'] ?? 0);
    if ($coins < $cost) tdf_err(409, 'Sem coins suficientes.');

    $pdo->beginTransaction();
    try {
        tdf_add_coins($pdo, $uid, -$cost);
        $up = $pdo->prepare(
            'INSERT INTO season_passes (user_id, season_id, xp, tier, premium, claimed_rewards)
             VALUES (:u, :s, 0, 0, 1, :c)
             ON DUPLICATE KEY UPDATE premium = 1'
        );
        $up->execute([':u' => $uid, ':s' => (int) $season['id'], ':c' => '[]']);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }

    tdf_log($pdo, $uid, 'season_buy_premium', ['cost' => $cost]);
    tdf_json(['ok' => true, 'pass' => tdf_pass_get($pdo, $uid, (int) $season['id'])]);
}

tdf_err(404, 'Rota não encontrada.');