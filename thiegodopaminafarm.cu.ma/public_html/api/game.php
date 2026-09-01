<?php
/**
 * THIEGO DOPAMINA FARM — api/game.php
 * Rotas: GET state (poll), POST sync (farm -> conta), POST claim (bônus de
 * dopamina), GET/POST notifications. Valida crescimento (anti-cheat) e
 * converte progresso do farm em XP/conta.
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
tdf_require_not_frozen($pdo, $uid);

/** Requer CSRF válido para POSTs */
function tdf_game_require_csrf(PDO $pdo, int $uid): void
{
    $b = tdf_body();
    $csrf = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($b['csrf'] ?? ''));
    if (!tdf_check_csrf($pdo, $csrf)) {
        tdf_err(403, 'Token CSRF inválido.');
    }
}

/** Estado completo para a UI (poll periódico) */
function tdf_game_state(PDO $pdo, int $uid): array
{
    $shape = tdf_user_shape($pdo, $uid);
    // missões com progresso do período atual
    $st = $pdo->prepare(
        'SELECT m.id, m.slug, m.name, m.description, m.type, m.metric, m.target, m.reward, m.unlock_level,
                COALESCE(um.progress,0) AS progress, COALESCE(um.claimed,0) AS claimed
         FROM missions m
         LEFT JOIN user_missions um ON um.mission_id = m.id AND um.user_id = :u
              AND um.period_key = IF(m.type = \'weekly\', :wk, :dy)
         WHERE m.unlock_level <= :lvl
         ORDER BY m.type, m.id'
    );
    $st->execute([':u' => $uid, ':wk' => tdf_period_key('weekly'), ':dy' => tdf_period_key('daily'), ':lvl' => $shape['progress']['level']]);
    $missions = [];
    foreach ($st->fetchAll() as $m) {
        $missions[] = [
            'id' => (int) $m['id'],
            'slug' => $m['slug'],
            'name' => $m['name'],
            'description' => $m['description'],
            'type' => $m['type'],
            'metric' => $m['metric'],
            'target' => (int) $m['target'],
            'reward' => $m['reward'],
            'progress' => (int) $m['progress'],
            'claimed' => (int) $m['claimed'],
            'complete' => (int) $m['progress'] >= (int) $m['target'],
        ];
    }
    // conquistas desbloqueadas
    $q = $pdo->prepare(
        'SELECT a.slug, a.name, a.description, a.secret, ua.unlocked_at
         FROM user_achievements ua JOIN achievements a ON a.id = ua.achievement_id
         WHERE ua.user_id = :u ORDER BY ua.unlocked_at DESC'
    );
    $q->execute([':u' => $uid]);
    $achievements = $q->fetchAll();
    $n = $pdo->prepare('SELECT COUNT(*) FROM achievements');
    $n->execute();
    $shape['achievements_total'] = (int) $n->fetchColumn();
    return $shape + ['missions' => $missions, 'achievements' => $achievements];
}

if ($method === 'GET' && $route === 'state') {
    tdf_json(['ok' => true] + tdf_game_state($pdo, $uid));
}

if ($method === 'POST' && $route === 'sync') {
    tdf_game_require_csrf($pdo, $uid);
    if (!tdf_rate_limit($pdo, 'sync:' . $uid, 90, 60)) {
        tdf_err(429, 'Sincronizando rápido demais.');
    }
    $b = tdf_body();
    $now = time();
    $newDop = isset($b['dopamine_log10']) ? (float) $b['dopamine_log10'] : null;
    $newPrestige = isset($b['prestige']) ? (int) $b['prestige'] : null;
    $newTier = isset($b['evolution_tier']) ? (int) $b['evolution_tier'] : null;
    $newPlay = isset($b['playtime_sec']) ? (int) $b['playtime_sec'] : null;
    $newNg = isset($b['ng_cycle']) ? (int) $b['ng_cycle'] : null;
    $newSave = isset($b['save']) ? (string) $b['save'] : null;
    // Revisão base que o cliente carregou (concurrência entre dispositivos/
    // abas): se o servidor avancou além dela, tdf_save_put recusa o overwrite
    // cego e devolve conflito — o save antigo nunca ganha do novo.
    $newBaseRev = isset($b['base_revision']) && is_numeric($b['base_revision'])
        ? (int) $b['base_revision'] : null;

    if ($newDop !== null && (!is_finite($newDop) || $newDop < 0 || $newDop > 1200)) tdf_err(422, 'dopamine_log10 inválido.');
    if ($newPrestige !== null && $newPrestige < 0) tdf_err(422, 'prestige inválido.');
    if ($newTier !== null && $newTier < 0) tdf_err(422, 'evolution_tier inválido.');
    if ($newPlay !== null && $newPlay < 0) tdf_err(422, 'playtime_sec inválido.');
    if ($newNg !== null && $newNg < 0) tdf_err(422, 'ng_cycle inválido.');

    $pdo->beginTransaction();
    try {
        $st = $pdo->prepare('SELECT * FROM user_progress WHERE user_id = :u FOR UPDATE');
        $st->execute([':u' => $uid]);
        $prog = $st->fetch();
        $oldDop = (float) ($prog['total_dopamine_log10'] ?? 0);
        $oldPrestige = (int) ($prog['prestige'] ?? 0);
        $oldPlay = (int) ($prog['playtime_sec'] ?? 0);
        $oldNg = (int) ($prog['ng_cycle'] ?? 0);

        // validar monotonicidade
        if ($newDop !== null && $newDop + 1e-9 < $oldDop) tdf_err(422, 'Dopamina total não pode diminuir.');
        if ($newPrestige !== null && $newPrestige < $oldPrestige) tdf_err(422, 'Prestige não pode diminuir.');
        if ($newTier !== null && $newTier < (int) ($prog['evolution_tier'] ?? 0)) tdf_err(422, 'Tier de evolução não pode diminuir.');
        if ($newPlay !== null && $newPlay < $oldPlay) tdf_err(422, 'Tempo de jogo não pode diminuir.');
        if ($newNg !== null && $newNg < $oldNg) tdf_err(422, 'NG cycle não pode diminuir.');

        $dop = $newDop !== null ? $newDop : $oldDop;
        $prestige = $newPrestige !== null ? $newPrestige : $oldPrestige;
        $tier = $newTier !== null ? $newTier : (int) ($prog['evolution_tier'] ?? 0);
        $play = $newPlay !== null ? $newPlay : $oldPlay;
        $ng = $newNg !== null ? $newNg : $oldNg;

        // XP: marcos de dopamina (cada potência de 10 = +25xp) + tempo (1xp/min, máx 60/sync)
        $xpGain = 0;
        $floorDelta = (int) floor($dop) - (int) floor($oldDop);
        if ($floorDelta > 0) $xpGain += $floorDelta * 50;
        $playDelta = min(3600, max(0, $play - $oldPlay));
        $xpGain += (int) floor($playDelta / 60);
        $xpGain = (int) round($xpGain * tdf_genealogy_multipliers($pdo, $uid)['xp_pct']);
        $xpGain = min($xpGain, 5000);

        $up = $pdo->prepare(
            'UPDATE user_progress
             SET total_dopamine_log10 = :dop, prestige = :p, prestige_points = prestige_points + :pp,
                 evolution_tier = :t, playtime_sec = :play, ng_cycle = :ng, last_sync_at = :now
             WHERE user_id = :u'
        );
        $up->execute([
            ':dop' => $dop, ':p' => $prestige, ':pp' => max(0, $prestige - $oldPrestige),
            ':t' => $tier, ':play' => $play, ':ng' => $ng, ':now' => $now, ':u' => $uid,
        ]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }

    $xp = tdf_apply_xp($pdo, $uid, $xpGain);
    // missões: level/ng absolutos + prestige/evolution (B2 — rotativas)
    $completed = [];
    if ($xp['leveled'] > 0) {
        $completed = tdf_mission_tick($pdo, $uid, 'account_level', $xp['level']);
    }
    if ($ng > 0) {
        $completed = array_merge($completed, tdf_mission_tick($pdo, $uid, 'ng_cycle', $ng));
    }
    if ($prestige > 0) {
        $completed = array_merge($completed, tdf_mission_tick($pdo, $uid, 'prestige', $prestige));
    }
    if ($tier > 0) {
        $completed = array_merge($completed, tdf_mission_tick($pdo, $uid, 'evolution_tier', $tier));
    }
    $achievements = tdf_achievement_sweep($pdo, $uid);
    tdf_log($pdo, $uid, 'sync', ['dop' => round($dop, 2), 'xp' => $xpGain, 'prestige' => $prestige]);

    // Season Pass (M5): a rota season.php/add_xp existia mas NENHUM código
    // do cliente a chamava — o XP da temporada nunca acumulava. Agora o
    // servidor concede o XP no sync, derivado do $xpGain já calculado
    // (autoritativo: o cliente não manda valor nenhum). Máx. 20 tiers,
    // 100 XP/tier — mesma fórmula da rota add_xp.
    $seasonTiersUp = 0;
    try {
        $sq = $pdo->prepare('SELECT id FROM seasons WHERE active = 1 AND starts_at <= :n1 AND ends_at >= :n2 LIMIT 1');
        $sq->execute([':n1' => $now, ':n2' => $now]);
        $seasonId = $sq->fetchColumn();
        if ($seasonId) {
            $seasonId = (int) $seasonId;
            $pdo->beginTransaction();
            try {
                $sp = $pdo->prepare('SELECT xp, tier FROM season_passes WHERE user_id = :u AND season_id = :s FOR UPDATE');
                $sp->execute([':u' => $uid, ':s' => $seasonId]);
                $prow = $sp->fetch();
                $oldPassXp = $prow ? (int) $prow['xp'] : 0;
                $oldPassTier = $prow ? (int) $prow['tier'] : 0;
                $newPassXp = $oldPassXp + $xpGain;
                $newPassTier = min(20, (int) floor($newPassXp / 100));
                if ($prow) {
                    $spu = $pdo->prepare('UPDATE season_passes SET xp = :x, tier = :t WHERE user_id = :u AND season_id = :s');
                    $spu->execute([':x' => $newPassXp, ':t' => $newPassTier, ':u' => $uid, ':s' => $seasonId]);
                } elseif ($xpGain > 0) {
                    $spi = $pdo->prepare("INSERT INTO season_passes (user_id, season_id, xp, tier, premium, claimed_rewards) VALUES (:u, :s, :x, :t, 0, '[]')");
                    $spi->execute([':u' => $uid, ':s' => $seasonId, ':x' => $newPassXp, ':t' => $newPassTier]);
                }
                $pdo->commit();
                $seasonTiersUp = max(0, $newPassTier - $oldPassTier);
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                // falha do passe nunca deve derrubar o sync do save
            }
        }
    } catch (Throwable $e) {
        // idem — segue sem XP de temporada
    }

    // Backup completo do save (opcional, via writer único com revisão):
    // mesmo payload que o ranking.php recebe no beacon, agora via sync
    // periódico da expansão. O writer valida em profundidade e nunca
    // sobrescreve um save mais novo (revisão/monotônico).
    $saveStored = false;
    $saveRevision = 0;
    $saveConflict = false;
    $saveConflictRev = 0;
    if ($newSave !== null) {
        $res = tdf_save_put($pdo, $uid, $newSave, $newBaseRev, false);
        $saveStored = ($res['ok'] ?? false) && ($res['saved'] ?? false);
        $saveRevision = $res['revision'] ?? 0;
        $saveConflict = (($res['error'] ?? null) === 'conflict');
        // devolve a revisão ATUAL do servidor em conflito: sem isso o
        // cliente fica preso em loop de conflito com base_revision velha
        if ($saveConflict) {
            $saveConflictRev = (int) ($res['server_revision'] ?? 0);
        }
    }

    tdf_json([
        'ok' => true,
        'xp_gained' => $xpGain,
        'leveled' => $xp['leveled'],
        'level' => $xp['level'],
        'completed_missions' => array_map(fn($m) => $m['slug'], $completed),
        'achievements' => $achievements,
        'save_stored' => $saveStored,
        'save_revision' => $saveRevision,
        'save_conflict' => $saveConflict,
        'save_conflict_revision' => $saveConflictRev,
        'season_tiers_up' => $seasonTiersUp,
    ]);
}

if ($method === 'POST' && $route === 'claim') {
    tdf_game_require_csrf($pdo, $uid);
    $st = $pdo->prepare('SELECT dopamine_bonus_log10 FROM user_progress WHERE user_id = :u FOR UPDATE');
    $st->execute([':u' => $uid]);
    $bonus = (float) ($st->fetch()['dopamine_bonus_log10'] ?? 0);
    if ($bonus <= 0) tdf_err(409, 'Nenhum bônus pendente.');

    // converte: entra no total (log-sum) + vira XP
    $pdo->beginTransaction();
    try {
        $st = $pdo->prepare('SELECT total_dopamine_log10 FROM user_progress WHERE user_id = :u FOR UPDATE');
        $st->execute([':u' => $uid]);
        $total = (float) ($st->fetch()['total_dopamine_log10'] ?? 0);
        $newTotal = tdf_logadd($total, $bonus);
        $xpGain = (int) floor($bonus * 50);
        $xpGain = (int) round($xpGain * tdf_genealogy_multipliers($pdo, $uid)['xp_pct']);
        $pdo->prepare('UPDATE user_progress SET total_dopamine_log10 = :t, dopamine_bonus_log10 = 0 WHERE user_id = :u')
            ->execute([':t' => $newTotal, ':u' => $uid]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    $xp = tdf_apply_xp($pdo, $uid, $xpGain);
    if ($xp['leveled'] > 0) tdf_mission_tick($pdo, $uid, 'account_level', $xp['level']);
    $achievements = tdf_achievement_sweep($pdo, $uid);
    tdf_log($pdo, $uid, 'claim_bonus', ['bonus' => round($bonus, 4), 'xp' => $xpGain]);
    tdf_json([
        'ok' => true,
        'claimed_log10' => round($bonus, 4),
        'xp_gained' => $xpGain,
        'leveled' => $xp['leveled'],
        'level' => $xp['level'],
        'achievements' => $achievements,
    ]);
}

if ($route === 'claim_mission') {
    tdf_game_require_csrf($pdo, $uid);
    $b = tdf_body();
    $mid = (int) ($b['mission_id'] ?? 0);
    $res = tdf_claim_mission($pdo, $uid, $mid);
    tdf_achievement_sweep($pdo, $uid);
    tdf_json(['ok' => true] + $res);
}

if ($route === 'notifications') {
    if ($method === 'GET') {
        $st = $pdo->prepare('SELECT id, title, body, is_read, created_at FROM notifications WHERE user_id = :u ORDER BY id DESC LIMIT 40');
        $st->execute([':u' => $uid]);
        tdf_json(['ok' => true, 'notifications' => $st->fetchAll()]);
    }
    if ($method === 'POST') {
        tdf_game_require_csrf($pdo, $uid);
        $b = tdf_body();
        $ids = array_values(array_filter(array_map('intval', (array) ($b['ids'] ?? [])), fn($i) => $i > 0));
        if (!empty($ids)) {
            $in = implode(',', array_fill(0, count($ids), '?'));
            $upd = $pdo->prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ? AND id IN ({$in})");
            $args = array_merge([$uid], $ids);
            $upd->execute($args);
        } elseif (!empty($b['mark_all'])) {
            $pdo->prepare('UPDATE notifications SET is_read = 1 WHERE user_id = :u')->execute([':u' => $uid]);
        } elseif (!empty($b['id'])) {
            $pdo->prepare('UPDATE notifications SET is_read = 1 WHERE id = :id AND user_id = :u')
                ->execute([':id' => (int) $b['id'], ':u' => $uid]);
        }
        tdf_json(['ok' => true]);
    }
}

/* ---------- B1: check-in diário ---------- */
if ($method === 'POST' && $route === 'checkin') {
    tdf_game_require_csrf($pdo, $uid);
    $st = $pdo->prepare('SELECT daily_streak, last_checkin_date, last_checkin_streak FROM user_progress WHERE user_id = :u');
    $st->execute([':u' => $uid]);
    $row = $st->fetch();
    $today = date('Y-m-d');
    $last = (string) ($row['last_checkin_date'] ?? '');
    $streak = (int) ($row['daily_streak'] ?? 0);
    $lastStreak = (int) ($row['last_checkin_streak'] ?? 0);

    if ($last === $today) {
        tdf_json(['ok' => true, 'streak' => $streak, 'daily' => true, 'already_claimed' => true]);
    }

    // Calcula streak: ontem → +1, hoje já foi tratado, outro → reseta
    $yesterday = date('Y-m-d', strtotime('-1 day'));
    $reward = [];

    if ($last === $yesterday) {
        $streak = min(365, $streak + 1);
    } else {
        $streak = 1;
    }

    // Recompensa baseada na streak
    $baseCoins = 50 + ($streak - 1) * 10;
    $baseXp = 100 + ($streak - 1) * 20;
    $bonusDopamine = 0;
    if ($streak === 7) { $bonusDopamine = 2; $baseCoins += 200; }
    if ($streak === 30) { $bonusDopamine = 5; $baseCoins += 1000; }
    if ($streak === 100) { $bonusDopamine = 10; $baseCoins += 5000; }
    if ($streak === 365) { $bonusDopamine = 20; $baseCoins += 20000; }

    $reward = ['battle_coins' => $baseCoins, 'xp' => $baseXp];
    if ($bonusDopamine > 0) $reward['dopamine_log10'] = $bonusDopamine;

    $pdo->beginTransaction();
    try {
        $up = $pdo->prepare('UPDATE user_progress SET daily_streak = :s, last_checkin_date = :d, last_checkin_streak = :ls WHERE user_id = :u');
        $up->execute([':s' => $streak, ':d' => $today, ':ls' => $lastStreak, ':u' => $uid]);
        $granted = tdf_grant_reward($pdo, $uid, $reward);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }

    $xp = tdf_apply_xp($pdo, $uid, $baseXp);
    tdf_log($pdo, $uid, 'checkin', ['streak' => $streak, 'reward' => $reward]);
    tdf_json([
        'ok' => true,
        'streak' => $streak,
        'daily' => true,
        'reward' => $granted,
        'leveled' => $xp['leveled'],
        'level' => $xp['level'],
    ]);
}

tdf_err(404, 'Rota não encontrada.');