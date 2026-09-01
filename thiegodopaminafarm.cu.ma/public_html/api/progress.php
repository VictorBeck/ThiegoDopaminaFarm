<?php
/**
 * THIEGO DOPAMINA FARM — api/progress.php
 * Motor de missões e conquistas. Missões têm progresso por período
 * (daily = Ymd, weekly = ano-semana ISO) e são incrementais ou absolutas.
 * Conquistas são globais e checadas pelo valor atual da métrica.
 */

require_once __DIR__ . '/tdf_db.php';

/** Período atual (chave) dado o tipo de missão */
function tdf_period_key(string $type): string
{
    return $type === 'weekly' ? date('oW') : date('Ymd');
}

/** Valor atual de uma métrica (para missões absolutas e conquistas) */
function tdf_metric_value(PDO $pdo, int $userId, string $metric): int
{
    switch ($metric) {
        case 'account_level':
            $st = $pdo->prepare('SELECT level FROM user_progress WHERE user_id = :u');
            $st->execute([':u' => $userId]);
            return (int) ($st->fetch()['level'] ?? 0);
        case 'ng_cycle':
            $st = $pdo->prepare('SELECT ng_cycle FROM user_progress WHERE user_id = :u');
            $st->execute([':u' => $userId]);
            return (int) ($st->fetch()['ng_cycle'] ?? 0);
        case 'battle_win':
        case 'boss_win':
        case 'box_open':
            $col = $metric === 'battle_win' ? 'wins' : ($metric === 'boss_win' ? 'bosses_killed' : 'boxes_opened');
            $st = $pdo->prepare("SELECT {$col} FROM user_stats WHERE user_id = :u");
            $st->execute([':u' => $userId]);
            return (int) ($st->fetch()[$col] ?? 0);
        case 'pvp_win':
            $st = $pdo->prepare('SELECT COALESCE(SUM(wins),0) FROM battle_rating WHERE user_id = :u');
            $st->execute([':u' => $userId]);
            return (int) $st->fetchColumn();
        case 'rating':
            $st = $pdo->prepare(
                'SELECT br.rating FROM battle_rating br
                 JOIN seasons s ON s.id = br.season_id
                 WHERE br.user_id = :u AND s.active = 1 ORDER BY br.updated_at DESC LIMIT 1'
            );
            $st->execute([':u' => $userId]);
            return (int) ($st->fetch()['rating'] ?? 0);
        case 'genealogy_node':
            $st = $pdo->prepare('SELECT COALESCE(SUM(level),0) FROM user_genealogy WHERE user_id = :u');
            $st->execute([':u' => $userId]);
            return (int) $st->fetchColumn();
        case 'thiego_unlock':
            $st = $pdo->prepare('SELECT COUNT(*) FROM user_thiegos WHERE user_id = :u');
            $st->execute([':u' => $userId]);
            return (int) $st->fetchColumn();
        case 'prestige':
            $st = $pdo->prepare('SELECT prestige FROM user_progress WHERE user_id = :u');
            $st->execute([':u' => $userId]);
            return (int) ($st->fetch()['prestige'] ?? 0);
        case 'evolution_tier':
            $st = $pdo->prepare('SELECT evolution_tier FROM user_progress WHERE user_id = :u');
            $st->execute([':u' => $userId]);
            return (int) ($st->fetch()['evolution_tier'] ?? 0);
    }
    return 0;
}

/** Concede recompensa em JSON {battle_coins, genealogy_points, dopamine_log10, xp} */
function tdf_grant_reward(PDO $pdo, int $userId, array $reward): array
{
    $granted = ['battle_coins' => 0, 'genealogy_points' => 0, 'dopamine_log10' => 0, 'xp' => 0];
    if (!empty($reward['battle_coins'])) {
        tdf_add_coins($pdo, $userId, (int) $reward['battle_coins']);
        $granted['battle_coins'] = (int) $reward['battle_coins'];
    }
    if (!empty($reward['genealogy_points'])) {
        $pdo->prepare('UPDATE user_progress SET genealogy_points = genealogy_points + :g WHERE user_id = :u')
            ->execute([':g' => (int) $reward['genealogy_points'], ':u' => $userId]);
        $granted['genealogy_points'] = (int) $reward['genealogy_points'];
    }
    if (!empty($reward['dopamine_log10'])) {
        tdf_add_dopamine_bonus($pdo, $userId, (float) $reward['dopamine_log10']);
        $granted['dopamine_log10'] = round((float) $reward['dopamine_log10'], 4);
    }
    if (!empty($reward['xp'])) {
        tdf_apply_xp($pdo, $userId, (int) $reward['xp']);
        $granted['xp'] = (int) $reward['xp'];
    }
    return $granted;
}

/**
 * Atualiza o progresso das missões de uma métrica.
 * $delta: incremento para métricas de contagem; valor absoluto para account_level/rating.
 * Retorna lista de missões que acabaram de completar.
 */
function tdf_mission_tick(PDO $pdo, int $userId, string $metric, int $delta): array
{
    if ($delta <= 0) return [];
    $level = tdf_metric_value($pdo, $userId, 'account_level');
    $st = $pdo->prepare('SELECT id, slug, type, metric, target, reward, unlock_level FROM missions WHERE metric = :m');
    $st->execute([':m' => $metric]);
    $missions = $st->fetchAll();
    $completed = [];

    foreach ($missions as $m) {
        if ((int) $m['unlock_level'] > $level) continue;
        $abs = in_array($metric, ['account_level', 'rating', 'ng_cycle', 'prestige', 'evolution_tier'], true);
        $pk = tdf_period_key($m['type']);
        $row = null;
        $q = $pdo->prepare('SELECT progress, claimed FROM user_missions WHERE user_id = :u AND mission_id = :mid AND period_key = :pk');
        $q->execute([':u' => $userId, ':mid' => $m['id'], ':pk' => $pk]);
        $row = $q->fetch();
        if (!$row) {
            $pdo->prepare('INSERT INTO user_missions (user_id, mission_id, progress, period_key) VALUES (:u, :mid, 0, :pk)')
                ->execute([':u' => $userId, ':mid' => $m['id'], ':pk' => $pk]);
            $row = ['progress' => 0, 'claimed' => 0];
        }
        $progress = $abs ? $delta : (int) $row['progress'] + $delta;
        $progress = min((int) $m['target'], max(0, $progress));
        $pdo->prepare('UPDATE user_missions SET progress = :p WHERE user_id = :u AND mission_id = :mid AND period_key = :pk')
            ->execute([':p' => $progress, ':u' => $userId, ':mid' => $m['id'], ':pk' => $pk]);
        if ($progress >= (int) $m['target'] && !(int) $row['claimed']) {
            $completed[] = $m;
        }
    }
    return $completed;
}

/** Lista missões pendentes (completas não reclamadas) para o usuário */
function tdf_claimable_missions(PDO $pdo, int $userId): array
{
    $level = tdf_metric_value($pdo, $userId, 'account_level');
    $st = $pdo->prepare('SELECT m.id, m.slug, m.name, m.description, m.type, m.metric, m.target, m.reward, m.unlock_level,
                                um.progress, um.claimed
                         FROM missions m
                         LEFT JOIN user_missions um ON um.mission_id = m.id AND um.user_id = :u AND um.period_key = :pk
                         WHERE m.unlock_level <= :lvl
                         ORDER BY m.type, m.id');
    $st->execute([':u' => $userId, ':pk' => '', ':lvl' => $level]);
    return $st->fetchAll();
}

/** Reivindica recompensa de uma missão completa */
function tdf_claim_mission(PDO $pdo, int $userId, int $missionId): array
{
    $st = $pdo->prepare('SELECT id, slug, name, type, target, reward FROM missions WHERE id = :id');
    $st->execute([':id' => $missionId]);
    $m = $st->fetch();
    if (!$m) tdf_err(404, 'Missão não encontrada.');
    $pk = tdf_period_key($m['type']);
    $q = $pdo->prepare('SELECT progress, claimed FROM user_missions WHERE user_id = :u AND mission_id = :mid AND period_key = :pk');
    $q->execute([':u' => $userId, ':mid' => $missionId, ':pk' => $pk]);
    $row = $q->fetch();
    if (!$row || (int) $row['progress'] < (int) $m['target']) tdf_err(409, 'Missão ainda não concluída.');
    if ((int) $row['claimed']) tdf_err(409, 'Recompensa já reclamada.');

    $reward = json_decode($m['reward'], true) ?: [];
    $granted = tdf_grant_reward($pdo, $userId, $reward);
    $pdo->prepare('UPDATE user_missions SET claimed = 1 WHERE user_id = :u AND mission_id = :mid AND period_key = :pk')
        ->execute([':u' => $userId, ':mid' => $missionId, ':pk' => $pk]);
    tdf_log($pdo, $userId, 'mission_claim', ['mission' => $m['slug'], 'reward' => $granted]);
    return ['mission' => $m['name'], 'granted' => $granted];
}

/** Checa conquistas pela métrica e valor atual; desbloqueia e premia */
function tdf_achievement_check(PDO $pdo, int $userId, string $metric, int $value): array
{
    $st = $pdo->prepare(
        'SELECT a.id, a.slug, a.name, a.metric, a.target, a.reward, a.secret
         FROM achievements a
         WHERE a.metric = :m AND a.target <= :v
           AND NOT EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = :u AND ua.achievement_id = a.id)'
    );
    $st->execute([':m' => $metric, ':v' => $value, ':u' => $userId]);
    $unlocked = [];
    $ins = $pdo->prepare('INSERT INTO user_achievements (user_id, achievement_id) VALUES (:u, :a)');
    foreach ($st->fetchAll() as $a) {
        $ins->execute([':u' => $userId, ':a' => $a['id']]);
        $reward = json_decode((string) $a['reward'], true) ?: [];
        $granted = tdf_grant_reward($pdo, $userId, $reward);
        tdf_notify($pdo, $userId, 'Conquista: ' . $a['name'], 'Você desbloqueou uma conquista!');
        tdf_log($pdo, $userId, 'achievement', ['slug' => $a['slug'], 'reward' => $granted]);
        $unlocked[] = ['slug' => $a['slug'], 'name' => $a['name'], 'granted' => $granted];
    }
    return $unlocked;
}

/** Dispara checagem de conquistas para todos os "counters" atuais (chamado no sync) */
function tdf_achievement_sweep(PDO $pdo, int $userId): array
{
    $out = [];
    foreach (['account_level', 'ng_cycle', 'battle_win', 'boss_win', 'box_open', 'pvp_win', 'rating', 'genealogy_node', 'thiego_unlock'] as $m) {
        $out = array_merge($out, tdf_achievement_check($pdo, $userId, $m, tdf_metric_value($pdo, $userId, $m)));
    }
    return $out;
}