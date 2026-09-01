<?php
/**
 * THIEGO DOPAMINA FARM — api/pvp.php
 * PvP ranqueado por temporada: GET status, POST match (matchmaking
 * síncrono por faixa de rating + ELO K=32). Requer nível 5.
 */

require_once __DIR__ . '/tdf_db.php';
require_once __DIR__ . '/progress.php';
require_once __DIR__ . '/battle_engine.php';
require_once __DIR__ . '/thiego_lib.php';

$pdo = tdf_pdo();
tdf_bootstrap();

$route = $_GET['route'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];
$uid = tdf_current_user($pdo);
if (!$uid) tdf_err(401, 'Não autenticado.');

function tdf_pvp_require_csrf(PDO $pdo, int $uid): void
{
    $b = tdf_body();
    $csrf = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($b['csrf'] ?? ''));
    if (!tdf_check_csrf($pdo, $csrf)) tdf_err(403, 'Token CSRF inválido.');
}

function tdf_active_season(PDO $pdo): array
{
    $st = $pdo->query('SELECT * FROM seasons WHERE active = 1 ORDER BY id DESC LIMIT 1');
    $s = $st->fetch();
    if ($s) return $s;
    $st = $pdo->query('SELECT * FROM seasons ORDER BY id DESC LIMIT 1');
    return $st->fetch() ?: [];
}

function tdf_rating_of(PDO $pdo, int $userId, int $seasonId): array
{
    $st = $pdo->prepare('SELECT rating, wins, losses, streak, best_rating FROM battle_rating WHERE user_id = :u AND season_id = :s');
    $st->execute([':u' => $userId, ':s' => $seasonId]);
    $r = $st->fetch();
    return $r ? $r : ['rating' => 1000, 'wins' => 0, 'losses' => 0, 'streak' => 0, 'best_rating' => 1000];
}

function tdf_elo_new(int $ra, int $rb, float $score): int
{
    $expected = 1 / (1 + pow(10, ($rb - $ra) / 400));
    return (int) round($ra + 32 * ($score - $expected));
}

/** Divisão PvP pelo rating (faixas cumulativas) */
function tdf_pvp_division(int $rating): array
{
    $tiers = [
        ['name' => 'Lenda', 'icon' => '🌟', 'min' => 2300],
        ['name' => 'Grão-Mestre', 'icon' => '👑', 'min' => 2000],
        ['name' => 'Mestre', 'icon' => '🧠', 'min' => 1800],
        ['name' => 'Diamante', 'icon' => '💎', 'min' => 1600],
        ['name' => 'Platina', 'icon' => '🥇', 'min' => 1400],
        ['name' => 'Ouro', 'icon' => '🪙', 'min' => 1200],
        ['name' => 'Prata', 'icon' => '🥈', 'min' => 1000],
        ['name' => 'Bronze', 'icon' => '🥉', 'min' => 0],
    ];
    foreach ($tiers as $t) {
        if ($rating >= $t['min']) return ['name' => $t['name'], 'icon' => $t['icon']];
    }
    return ['name' => 'Bronze', 'icon' => '🥉'];
}

/** Time de batalha de um usuário (top por nível, até 3) */
function tdf_user_battle_team(PDO $pdo, int $userId, int $max): array
{
    $st = $pdo->prepare('SELECT id FROM user_thiegos WHERE user_id = :u ORDER BY level DESC, id LIMIT :m');
    $st->bindValue(':u', $userId, PDO::PARAM_INT);
    $st->bindValue(':m', $max, PDO::PARAM_INT);
    $st->execute();
    $team = [];
    foreach ($st->fetchAll() as $ut) {
        $bd = tdf_thiego_build($pdo, $userId, (int) $ut['id']);
        if ($bd) $team[] = $bd;
    }
    return $team;
}

if ($method === 'GET' && $route === 'status') {
    $season = tdf_active_season($pdo);
    $prog = tdf_user_progress($pdo, $uid);
    $my = $season ? tdf_rating_of($pdo, $uid, (int) $season['id']) : null;
    $rank = 0;
    if ($season && $my) {
        $q = $pdo->prepare('SELECT COUNT(*) + 1 FROM battle_rating WHERE season_id = :s AND rating > :r');
        $q->execute([':s' => (int) $season['id'], ':r' => (int) $my['rating']]);
        $rank = (int) $q->fetchColumn();
    }
    tdf_json([
        'ok' => true,
        'unlocked' => (int) $prog['level'] >= 5,
        'level' => (int) $prog['level'],
        'energy' => (int) $prog['energy'],
        'season' => $season ? ['id' => (int) $season['id'], 'name' => $season['name']] : null,
        'rating' => $my ? (int) $my['rating'] : 1000,
        'division' => tdf_pvp_division($my ? (int) $my['rating'] : 1000),
        'rank' => $rank,
        'wins' => $my ? (int) $my['wins'] : 0,
        'losses' => $my ? (int) $my['losses'] : 0,
        'streak' => $my ? (int) $my['streak'] : 0,
    ]);
}

if ($method === 'POST' && $route === 'match') {
    tdf_pvp_require_csrf($pdo, $uid);
    $b = tdf_body();
    $utIds = array_values(array_unique(array_filter(array_map('intval', (array) ($b['thiego_ids'] ?? [])))));
    if (count($utIds) < 1 || count($utIds) > 3) tdf_err(422, 'Selecione 1 a 3 Thiegos.');

    $prog = tdf_user_progress($pdo, $uid);
    if ((int) $prog['level'] < 5) tdf_err(409, 'PvP desbloqueia no nível 5.');

    $season = tdf_active_season($pdo);
    if (!$season) tdf_err(422, 'Nenhuma temporada ativa.');

    $myTeam = [];
    foreach ($utIds as $utId) {
        $bd = tdf_thiego_build($pdo, $uid, $utId);
        if ($bd) $myTeam[] = $bd;
    }
    if (!$myTeam) tdf_err(422, 'Thiego não encontrado.');

    $myRating = (int) (tdf_rating_of($pdo, $uid, (int) $season['id'])['rating'] ?? 1000);

    // procura adversário por faixa de rating; fallback: qualquer um com thiegos
    $opponentId = null;
    $q = $pdo->prepare(
        'SELECT br.user_id, br.rating FROM battle_rating br
         JOIN user_thiegos ut ON ut.user_id = br.user_id
         WHERE br.season_id = :s AND br.user_id != :me AND ABS(br.rating - :r) <= :band
         GROUP BY br.user_id ORDER BY RAND() LIMIT 1'
    );
    foreach ([150, 500, 100000] as $band) {
        $q->execute([':s' => (int) $season['id'], ':me' => $uid, ':r' => $myRating, ':band' => $band]);
        $opp = $q->fetch();
        if ($opp) { $opponentId = (int) $opp['user_id']; break; }
    }
    if (!$opponentId) {
        $q = $pdo->prepare('SELECT user_id FROM user_thiegos WHERE user_id != :me GROUP BY user_id ORDER BY RAND() LIMIT 1');
        $q->execute([':me' => $uid]);
        $opp = $q->fetch();
        if ($opp) $opponentId = (int) $opp['user_id'];
    }
    if (!$opponentId) tdf_err(409, 'Nenhum adversário disponível agora.');

    $maxN = count($myTeam);
    $enemyTeam = tdf_user_battle_team($pdo, $opponentId, $maxN);
    if (!$enemyTeam) tdf_err(409, 'Adversário sem Thiegos disponíveis.');

    // só gasta energia depois de confirmar adversário e time
    if (!tdf_spend_energy($pdo, $uid, 2)) tdf_err(409, 'Energia insuficiente.');

    // batalha
    $state = tdf_battle_state($pdo, $myTeam, $enemyTeam);
    $state['items_used'] = [];
    foreach ($state['combatants']['player'] as &$pc) tdf_attach_consumables($pdo, $uid, $pc);
    unset($pc);
    // adversário também usa itens (pool próprio)
    foreach ($state['combatants']['enemy'] as &$ec) tdf_attach_consumables($pdo, $opponentId, $ec);
    unset($ec);

    $state = tdf_battle_resolve($pdo, $state, $uid);
    $winner = $state['status'];

    $oppRating = (int) (tdf_rating_of($pdo, $opponentId, (int) $season['id'])['rating'] ?? 1000);
    $score = $winner === 'player' ? 1.0 : ($winner === 'draw' ? 0.5 : 0.0);
    $myNew = tdf_elo_new($myRating, $oppRating, $score);
    $oppNew = tdf_elo_new($oppRating, $myRating, 1.0 - $score);

    // recompensas (multiplicadores de genealogia por jogador)
    $win = $winner === 'player';
    $draw = $winner === 'draw';
    $oppWin = $winner === 'enemy';
    $geneA = tdf_genealogy_multipliers($pdo, $uid);
    $geneB = tdf_genealogy_multipliers($pdo, $opponentId);
    $myCoins = (int) round(($win ? (60 + (int) round($myRating * 0.02)) : ($draw ? 10 : 0)) * $geneA['coin_pct']);
    $myXp = (int) round(($win ? 20 : 5) * $geneA['xp_pct']);
    $myDop = ($win ? 1.5 : 0.0) * $geneA['farm_pct'];
    $oppCoins = (int) round(($oppWin ? (40 + (int) round($oppRating * 0.02)) : ($draw ? 10 : 0)) * $geneB['coin_pct']);
    $oppXp = (int) round(($oppWin ? 20 : 5) * $geneB['xp_pct']);
    $oppDop = ($oppWin ? 1.5 : 0.0) * $geneB['farm_pct'];

    $pdo->beginTransaction();
    try {
        $ins = $pdo->prepare('INSERT INTO battles (user_id, mode, enemy_id, enemy_level, status, winner, state, energy_cost, season_id)
                              VALUES (:u, \'pvp\', :e, 1, \'finished\', :w, :st, 2, :se)');
        $ins->execute([':u' => $uid, ':e' => $enemyTeam[0]['thiego_id'], ':w' => $winner, ':st' => json_encode($state, JSON_UNESCAPED_UNICODE), ':se' => (int) $season['id']]);
        $battleId = (int) $pdo->lastInsertId();
        $par = $pdo->prepare('INSERT INTO battle_participants (battle_id, user_id, thiego_id, side, snapshot) VALUES (:bid, :u, :t, :s, :snap)');
        foreach ($myTeam as $pb) $par->execute([':bid' => $battleId, ':u' => $uid, ':t' => $pb['thiego_id'], ':s' => 'player', ':snap' => json_encode($pb, JSON_UNESCAPED_UNICODE)]);
        foreach ($enemyTeam as $eb) $par->execute([':bid' => $battleId, ':u' => $opponentId, ':t' => $eb['thiego_id'], ':s' => 'enemy', ':snap' => json_encode($eb, JSON_UNESCAPED_UNICODE)]);

        // ELO e status dos dois
        $aW = ($winner === 'player') ? 1 : 0;
        $aL = ($winner === 'enemy') ? 1 : 0;
        $aD = ($winner === 'draw') ? 1 : 0;
        $bW = ($winner === 'enemy') ? 1 : 0;
        $bL = ($winner === 'player') ? 1 : 0;
        $bD = ($winner === 'draw') ? 1 : 0;
        $upsert = $pdo->prepare('INSERT INTO battle_rating (user_id, season_id, rating, wins, losses, streak, best_rating)
                                 VALUES (:u, :s, :r, :w, :l, :st, :br)
                                 ON DUPLICATE KEY UPDATE rating = :r2, wins = wins + :w2, losses = losses + :l2,
                                     streak = IF(:sw = 1, streak + 1, IF(:sd = 1, streak, 0)),
                                     best_rating = GREATEST(best_rating, :r3)');
        $upsert->execute([':u' => $uid, ':s' => (int) $season['id'], ':r' => $myNew, ':w' => $aW, ':l' => $aL, ':st' => $aW ? 1 : 0, ':br' => $myNew, ':r2' => $myNew, ':w2' => $aW, ':l2' => $aL, ':sw' => $aW, ':sd' => $aD, ':r3' => $myNew]);
        $upsert->execute([':u' => $opponentId, ':s' => (int) $season['id'], ':r' => $oppNew, ':w' => $bW, ':l' => $bL, ':st' => $bW ? 1 : 0, ':br' => $oppNew, ':r2' => $oppNew, ':w2' => $bW, ':l2' => $bL, ':sw' => $bW, ':sd' => $bD, ':r3' => $oppNew]);

        $pdo->prepare('UPDATE user_progress SET battle_coins = battle_coins + :c WHERE user_id = :u')
            ->execute([':c' => $myCoins, ':u' => $uid]);
        if ($myDop > 0) tdf_add_dopamine_bonus($pdo, $uid, $myDop);
        $pdo->prepare('UPDATE user_stats SET battles = battles + 1, wins = wins + :w, losses = losses + :l, draws = draws + :d, best_rating = GREATEST(best_rating, :br) WHERE user_id = :u')
            ->execute([':w' => $win ? 1 : 0, ':l' => ($win || $draw) ? 0 : 1, ':d' => $draw ? 1 : 0, ':br' => $myNew, ':u' => $uid]);
        // recompensas do adversário
        $pdo->prepare('UPDATE user_progress SET battle_coins = battle_coins + :c WHERE user_id = :u')
            ->execute([':c' => $oppCoins, ':u' => $opponentId]);
        if ($oppDop > 0) tdf_add_dopamine_bonus($pdo, $opponentId, $oppDop);
        $pdo->prepare('UPDATE user_stats SET battles = battles + 1, wins = wins + :w, losses = losses + :l, draws = draws + :d, best_rating = GREATEST(best_rating, :br) WHERE user_id = :u')
            ->execute([':w' => $oppWin ? 1 : 0, ':l' => ($oppWin || $draw) ? 0 : 1, ':d' => $draw ? 1 : 0, ':br' => $oppNew, ':u' => $opponentId]);

        // consumíveis usados de ambos os lados
        foreach ($state['items_used'] ?? [] as $u) {
            $side = (string) ($u['side'] ?? 'player');
            $targetId = $side === 'enemy' ? $opponentId : $uid;
            tdf_take_item($pdo, $targetId, (int) $u['item_id'], (int) $u['qty']);
        }

        $summary = ['winner' => $winner, 'turns' => (int) $state['turn'], 'coins' => $myCoins, 'rating' => $myNew, 'opponent_rating' => $oppNew];
        $pdo->prepare('UPDATE battles SET status = \'finished\', winner = :w, result = :r, finished_at = NOW() WHERE id = :id')
            ->execute([':w' => $winner, ':r' => json_encode($summary, JSON_UNESCAPED_UNICODE), ':id' => $battleId]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }

    // XP + missões + conquistas (jogador)
    $xpRes = tdf_apply_xp($pdo, $uid, $myXp);
    if ($xpRes['leveled'] > 0) tdf_mission_tick($pdo, $uid, 'account_level', $xpRes['level']);
    if ($win) {
        tdf_mission_tick($pdo, $uid, 'pvp_win', 1);
        tdf_mission_tick($pdo, $uid, 'coins_gain', $myCoins);
        tdf_achievement_check($pdo, $uid, 'pvp_win', tdf_metric_value($pdo, $uid, 'pvp_win'));
    }
    tdf_achievement_check($pdo, $uid, 'rating', $myNew);
    tdf_achievement_sweep($pdo, $uid);
    tdf_log($pdo, $uid, 'pvp_match', ['battle' => $battleId, 'opponent' => $opponentId, 'winner' => $winner, 'rating' => $myRating . '->' . $myNew, 'coins' => $myCoins]);

    // XP + missões + conquistas (adversário)
    $oppXpRes = tdf_apply_xp($pdo, $opponentId, $oppXp);
    if ($oppXpRes['leveled'] > 0) tdf_mission_tick($pdo, $opponentId, 'account_level', $oppXpRes['level']);
    if ($oppWin) {
        tdf_mission_tick($pdo, $opponentId, 'pvp_win', 1);
        tdf_mission_tick($pdo, $opponentId, 'coins_gain', $oppCoins);
        tdf_achievement_check($pdo, $opponentId, 'pvp_win', tdf_metric_value($pdo, $opponentId, 'pvp_win'));
    }
    tdf_achievement_check($pdo, $opponentId, 'rating', $oppNew);
    tdf_achievement_sweep($pdo, $opponentId);

    // XP de combate dos Thiegos (ambos os lados)
    foreach ($myTeam as $pb) tdf_thiego_gain_xp($pdo, $uid, (int) $pb['thiego_id'], max(1, (int) round($myXp * 0.5)));
    foreach ($enemyTeam as $eb) tdf_thiego_gain_xp($pdo, $opponentId, (int) $eb['thiego_id'], max(1, (int) round($oppXp * 0.5)));

    tdf_json([
        'ok' => true,
        'battle_id' => $battleId,
        'winner' => $winner,
        'rating' => $myNew,
        'rating_change' => $myNew - $myRating,
        'division' => tdf_pvp_division($myNew),
        'opponent' => ['user_id' => $opponentId, 'thiego' => $enemyTeam[0]['name'], 'image' => $enemyTeam[0]['image'], 'rating' => $oppNew],
        'coins' => $myCoins,
        'xp' => $myXp,
        'state' => $state,
    ]);
}

if ($method === 'POST' && $route === 'match_manual') {
    tdf_pvp_require_csrf($pdo, $uid);
    $b = tdf_body();
    $utIds = array_values(array_unique(array_filter(array_map('intval', (array) ($b['thiego_ids'] ?? [])))));
    if (count($utIds) < 1 || count($utIds) > 3) tdf_err(422, 'Selecione 1 a 3 Thiegos.');

    $prog = tdf_user_progress($pdo, $uid);
    if ((int) $prog['level'] < 5) tdf_err(409, 'PvP desbloqueia no nível 5.');

    $season = tdf_active_season($pdo);
    if (!$season) tdf_err(422, 'Nenhuma temporada ativa.');

    $myTeam = [];
    foreach ($utIds as $utId) {
        $bd = tdf_thiego_build($pdo, $uid, $utId);
        if ($bd) $myTeam[] = $bd;
    }
    if (!$myTeam) tdf_err(422, 'Thiego não encontrado.');

    $myRating = (int) (tdf_rating_of($pdo, $uid, (int) $season['id'])['rating'] ?? 1000);

    // matchmaking igual ao auto
    $opponentId = null;
    $q = $pdo->prepare(
        'SELECT br.user_id, br.rating FROM battle_rating br
         JOIN user_thiegos ut ON ut.user_id = br.user_id
         WHERE br.season_id = :s AND br.user_id != :me AND ABS(br.rating - :r) <= :band
         GROUP BY br.user_id ORDER BY RAND() LIMIT 1'
    );
    foreach ([150, 500, 100000] as $band) {
        $q->execute([':s' => (int) $season['id'], ':me' => $uid, ':r' => $myRating, ':band' => $band]);
        $opp = $q->fetch();
        if ($opp) { $opponentId = (int) $opp['user_id']; break; }
    }
    if (!$opponentId) {
        $q = $pdo->prepare('SELECT user_id FROM user_thiegos WHERE user_id != :me GROUP BY user_id ORDER BY RAND() LIMIT 1');
        $q->execute([':me' => $uid]);
        $opp = $q->fetch();
        if ($opp) $opponentId = (int) $opp['user_id'];
    }
    if (!$opponentId) tdf_err(409, 'Nenhum adversário disponível agora.');

    $maxN = count($myTeam);
    $enemyTeam = tdf_user_battle_team($pdo, $opponentId, $maxN);
    if (!$enemyTeam) tdf_err(409, 'Adversário sem Thiegos disponíveis.');

    if (!tdf_spend_energy($pdo, $uid, 2)) tdf_err(409, 'Energia insuficiente.');

    $state = tdf_battle_state($pdo, $myTeam, $enemyTeam);
    $state['manual'] = true;
    $state['items_used'] = [];
    foreach ($state['combatants']['player'] as &$pc) tdf_attach_consumables($pdo, $uid, $pc);
    unset($pc);
    foreach ($state['combatants']['enemy'] as &$ec) tdf_attach_consumables($pdo, $opponentId, $ec);
    unset($ec);

    $pdo->beginTransaction();
    try {
        $ins = $pdo->prepare('INSERT INTO battles (user_id, mode, enemy_id, enemy_level, status, state, energy_cost, season_id)
                              VALUES (:u, \'pvp\', :e, 1, \'active\', :st, 2, :se)');
        $ins->execute([':u' => $uid, ':e' => $enemyTeam[0]['thiego_id'], ':st' => json_encode($state, JSON_UNESCAPED_UNICODE), ':se' => (int) $season['id']]);
        $battleId = (int) $pdo->lastInsertId();
        $par = $pdo->prepare('INSERT INTO battle_participants (battle_id, user_id, thiego_id, side, snapshot) VALUES (:bid, :u, :t, :s, :snap)');
        foreach ($myTeam as $pb) $par->execute([':bid' => $battleId, ':u' => $uid, ':t' => $pb['thiego_id'], ':s' => 'player', ':snap' => json_encode($pb, JSON_UNESCAPED_UNICODE)]);
        foreach ($enemyTeam as $eb) $par->execute([':bid' => $battleId, ':u' => $opponentId, ':t' => $eb['thiego_id'], ':s' => 'enemy', ':snap' => json_encode($eb, JSON_UNESCAPED_UNICODE)]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }

    tdf_log($pdo, $uid, 'pvp_manual_match', ['battle' => $battleId, 'opponent' => $opponentId]);
    tdf_json([
        'ok' => true,
        'battle_id' => $battleId,
        'mode' => 'pvp',
        'manual' => true,
        'opponent' => ['user_id' => $opponentId, 'thiego' => $enemyTeam[0]['name'], 'image' => $enemyTeam[0]['image'], 'rating' => $myRating],
        'state' => $state,
    ]);
}

/* ----------------------------------------------------------------- MATCHMAKING SÍNCRONO (fila + active) */
/** Entra na fila de matchmaking. Se encontrar oponente compatível na fila,
 *  cria a batalha PvP ativa e retorna battle_id. */
if ($method === 'POST' && $route === 'matchmake') {
    tdf_pvp_require_csrf($pdo, $uid);
    $b = tdf_body();
    $utIds = array_values(array_unique(array_filter(array_map('intval', (array) ($b['thiego_ids'] ?? [])))));
    if (count($utIds) < 1 || count($utIds) > 3) tdf_err(422, 'Selecione 1 a 3 Thiegos.');

    $prog = tdf_user_progress($pdo, $uid);
    if ((int) $prog['level'] < 5) tdf_err(409, 'PvP desbloqueia no nível 5.');
    $season = tdf_active_season($pdo);
    if (!$season) tdf_err(422, 'Nenhuma temporada ativa.');

    $myTeam = [];
    foreach ($utIds as $utId) {
        $bd = tdf_thiego_build($pdo, $uid, $utId);
        if ($bd) $myTeam[] = $bd;
    }
    if (!$myTeam) tdf_err(422, 'Thiego não encontrado.');

    $myRating = (int) (tdf_rating_of($pdo, $uid, (int) $season['id'])['rating'] ?? 1000);

    // procura oponente na fila (battles mode='pvp' status='queued')
    $opp = null;
    $q = $pdo->prepare(
        'SELECT b.id AS queue_id, b.user_id, u.username
         FROM battles b JOIN users u ON u.id = b.user_id
         WHERE b.mode = \'pvp\' AND b.status = \'queued\' AND b.user_id != :me
           AND b.created_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE)
         ORDER BY b.created_at ASC LIMIT 1'
    );
    $q->execute([':me' => $uid]);
    $oppRow = $q->fetch();
    if ($oppRow) {
        $opponentId = (int) $oppRow['user_id'];
        $queueBattleId = (int) $oppRow['queue_id'];

        // time do oponente (top thiegos)
        $maxN = count($myTeam);
        $enemyTeam = tdf_user_battle_team($pdo, $opponentId, $maxN);
        if (!$enemyTeam) {
            // oponente perdeu thiegos; remove da fila e tenta de novo
            $pdo->prepare('DELETE FROM battles WHERE id = :id')->execute([':id' => $queueBattleId]);
            tdf_json(['ok' => false, 'error' => 'Oponente sem Thiegos.', 'retry' => true]);
        }

        if (!tdf_spend_energy($pdo, $uid, 2)) {
            tdf_err(409, 'Energia insuficiente.');
        }

        // cria batalha active
        $state = tdf_battle_state($pdo, $myTeam, $enemyTeam);
        $state['pvp'] = ['p1_uid' => $uid, 'p2_uid' => $opponentId, 'turn_owner' => $uid];
        $state['items_used'] = [];
        foreach ($state['combatants']['player'] as &$pc) tdf_attach_consumables($pdo, $uid, $pc);
        unset($pc);
        foreach ($state['combatants']['enemy'] as &$ec) tdf_attach_consumables($pdo, $opponentId, $ec);
        unset($ec);

        $pdo->beginTransaction();
        try {
            $ins = $pdo->prepare('INSERT INTO battles (user_id, mode, enemy_id, enemy_level, status, state, energy_cost, season_id)
                                  VALUES (:u, \'pvp\', :e, 1, \'active\', :st, 2, :se)');
            $ins->execute([':u' => $uid, ':e' => $enemyTeam[0]['thiego_id'], ':st' => json_encode($state, JSON_UNESCAPED_UNICODE), ':se' => (int) $season['id']]);
            $battleId = (int) $pdo->lastInsertId();
            $par = $pdo->prepare('INSERT INTO battle_participants (battle_id, user_id, thiego_id, side, snapshot) VALUES (:bid, :u, :t, :s, :snap)');
            foreach ($myTeam as $pb) $par->execute([':bid' => $battleId, ':u' => $uid, ':t' => $pb['thiego_id'], ':s' => 'player', ':snap' => json_encode($pb, JSON_UNESCAPED_UNICODE)]);
            foreach ($enemyTeam as $eb) $par->execute([':bid' => $battleId, ':u' => $opponentId, ':t' => $eb['thiego_id'], ':s' => 'enemy', ':snap' => json_encode($eb, JSON_UNESCAPED_UNICODE)]);
            // remove a batalha queued do oponente
            $pdo->prepare('DELETE FROM battles WHERE id = :id')->execute([':id' => $queueBattleId]);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }

        tdf_log($pdo, $uid, 'pvp_matchmake_matched', ['battle' => $battleId, 'opponent' => $opponentId]);
        tdf_json([
            'ok' => true,
            'status' => 'matched',
            'battle_id' => $battleId,
            'opponent' => ['user_id' => $opponentId, 'username' => $oppRow['username']],
            'state' => $state,
            'my_turn' => true,
        ]);
    }

    // sem oponente: entra na fila
    if (!tdf_spend_energy($pdo, $uid, 2)) tdf_err(409, 'Energia insuficiente.');
    $pdo->beginTransaction();
    try {
        $state = tdf_battle_state($pdo, $myTeam, []); // inimigo vazio, vai ser preenchido no match
        $state['pvp'] = ['p1_uid' => $uid, 'p2_uid' => 0, 'turn_owner' => $uid, 'team' => $myTeam];
        $ins = $pdo->prepare('INSERT INTO battles (user_id, mode, status, state, energy_cost, season_id)
                              VALUES (:u, \'pvp\', \'queued\', :st, 2, :se)');
        $ins->execute([':u' => $uid, ':st' => json_encode($state, JSON_UNESCAPED_UNICODE), ':se' => (int) $season['id']]);
        $battleId = (int) $pdo->lastInsertId();
        $par = $pdo->prepare('INSERT INTO battle_participants (battle_id, user_id, thiego_id, side, snapshot) VALUES (:bid, :u, :t, :s, :snap)');
        foreach ($myTeam as $pb) $par->execute([':bid' => $battleId, ':u' => $uid, ':t' => $pb['thiego_id'], ':s' => 'player', ':snap' => json_encode($pb, JSON_UNESCAPED_UNICODE)]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    tdf_log($pdo, $uid, 'pvp_matchmake_queue', ['battle' => $battleId]);
    tdf_json(['ok' => true, 'status' => 'queue', 'battle_id' => $battleId]);
}

/** Verifica status da fila: se foi matched, retorna a batalha ativa. */
if ($method === 'GET' && $route === 'queue_status') {
    // procura batalha queued minha
    $q = $pdo->prepare("SELECT id, state FROM battles WHERE user_id = :u AND mode = 'pvp' AND status = 'queued' LIMIT 1");
    $q->execute([':u' => $uid]);
    $queued = $q->fetch();
    $inQueue = !!$queued;

    // procura batalha active onde sou participante como player ou enemy (match recente)
    $active = null;
    $a = $pdo->prepare(
        "SELECT b.id, b.state, b.user_id AS p1_uid
         FROM battles b JOIN battle_participants bp ON bp.battle_id = b.id
         WHERE b.mode = 'pvp' AND b.status = 'active' AND bp.user_id = :u
         ORDER BY b.id DESC LIMIT 1"
    );
    $a->execute([':u' => $uid]);
    $row = $a->fetch();
    if ($row) {
        $state = json_decode((string) $row['state'], true) ?: [];
        $pvp = $state['pvp'] ?? [];
        $p1 = (int) ($pvp['p1_uid'] ?? 0);
        $p2 = (int) ($pvp['p2_uid'] ?? 0);
        // se estou na fila matched, remover da fila
        if ($inQueue && $p2 > 0) {
            $pdo->prepare("DELETE FROM battles WHERE id = :id")->execute([':id' => $queued['id']]);
            $inQueue = false;
        }
        $active = [
            'battle_id' => (int) $row['id'],
            'my_turn' => ($pvp['turn_owner'] ?? $p1) === $uid,
            'p1_uid' => $p1,
            'p2_uid' => $p2,
        ];
    }
    tdf_json(['ok' => true, 'in_queue' => $inQueue, 'active' => $active]);
}

/** Sair da fila. */
if ($method === 'POST' && $route === 'leave_queue') {
    tdf_pvp_require_csrf($pdo, $uid);
    $pdo->prepare("DELETE FROM battles WHERE user_id = :u AND mode = 'pvp' AND status = 'queued'")
        ->execute([':u' => $uid]);
    tdf_json(['ok' => true]);
}

/** Batalha PvP ativa do jogador, com estado montado para o time dele. */
if ($method === 'GET' && $route === 'active') {
    $a = $pdo->prepare(
        "SELECT b.id, b.state, b.user_id AS p1_uid
         FROM battles b JOIN battle_participants bp ON bp.battle_id = b.id
         WHERE b.mode = 'pvp' AND b.status = 'active' AND bp.user_id = :u
         ORDER BY b.id DESC LIMIT 1"
    );
    $a->execute([':u' => $uid]);
    $row = $a->fetch();
    if (!$row) tdf_json(['ok' => true, 'battle' => null]);
    $state = json_decode((string) $row['state'], true) ?: [];
    $pvp = $state['pvp'] ?? [];
    $p1 = (int) ($pvp['p1_uid'] ?? 0);
    $p2 = (int) ($pvp['p2_uid'] ?? 0);
    $mySide = $uid === $p1 ? 'player' : 'enemy';
    $myTurn = ($pvp['turn_owner'] ?? $p1) === $uid;
    // se o estado já terminou, retorna sem batalha
    if ($state['status'] !== 'active') {
        tdf_json(['ok' => true, 'battle' => ['battle_id' => (int) $row['id'], 'finished' => true, 'winner' => $state['status']]]);
    }
    // monta resposta com estado completo
    tdf_json([
        'ok' => true,
        'battle' => [
            'battle_id' => (int) $row['id'],
            'my_side' => $mySide,
            'my_turn' => $myTurn,
            'state' => $state,
        ],
    ]);
}

/* Finaliza uma batalha PvP manual já resolvida (estado com status != active):
 * aplica ELO, recompensas, missões e conquistas dos dois lados. */
if ($method === 'POST' && $route === 'finish_manual') {
    tdf_pvp_require_csrf($pdo, $uid);
    $b = tdf_body();
    $battleId = (int) ($b['battle_id'] ?? 0);

    $st = $pdo->prepare(
        'SELECT b.* FROM battles b
         JOIN battle_participants bp ON bp.battle_id = b.id AND bp.user_id = :u
         WHERE b.id = :id AND b.mode = \'pvp\' LIMIT 1'
    );
    $st->execute([':id' => $battleId, ':u' => $uid]);
    $battle = $st->fetch();
    if (!$battle) tdf_err(404, 'Batalha PvP não encontrada.');

    // proteção contra dupla aplicação de recompensas
    if ($battle['result'] !== null && $battle['result'] !== '') {
        $prev = json_decode((string) $battle['result'], true) ?: [];
        tdf_json(['ok' => true, 'already_finished' => true] + $prev);
    }

    $state = json_decode((string) $battle['state'], true) ?: [];
    $winner = (string) ($state['status'] ?? 'draw');
    if ($winner === 'active') $winner = 'draw';

    // oponente = participante do lado enemy
    $opponentId = 0;
    $st = $pdo->prepare('SELECT user_id FROM battle_participants WHERE battle_id = :id AND side = \'enemy\' LIMIT 1');
    $st->execute([':id' => $battleId]);
    $opponentId = (int) ($st->fetch()['user_id'] ?? 0);
    if (!$opponentId) tdf_err(500, 'Oponente não encontrado.');

    $season = tdf_active_season($pdo);
    $sid = (int) ($season['id'] ?? 0);
    $myRating = (int) (tdf_rating_of($pdo, $uid, $sid)['rating'] ?? 1000);
    $oppRating = (int) (tdf_rating_of($pdo, $opponentId, $sid)['rating'] ?? 1000);
    $score = $winner === 'player' ? 1.0 : ($winner === 'draw' ? 0.5 : 0.0);
    $myNew = tdf_elo_new($myRating, $oppRating, $score);
    $oppNew = tdf_elo_new($oppRating, $myRating, 1.0 - $score);

    $win = $winner === 'player';
    $draw = $winner === 'draw';
    $oppWin = $winner === 'enemy';
    $geneA = tdf_genealogy_multipliers($pdo, $uid);
    $geneB = tdf_genealogy_multipliers($pdo, $opponentId);
    $myCoins = (int) round(($win ? (60 + (int) round($myRating * 0.02)) : ($draw ? 10 : 0)) * $geneA['coin_pct']);
    $myXp = (int) round(($win ? 20 : 5) * $geneA['xp_pct']);
    $myDop = ($win ? 1.5 : 0.0) * $geneA['farm_pct'];
    $oppCoins = (int) round(($oppWin ? (40 + (int) round($oppRating * 0.02)) : ($draw ? 10 : 0)) * $geneB['coin_pct']);
    $oppXp = (int) round(($oppWin ? 20 : 5) * $geneB['xp_pct']);
    $oppDop = ($oppWin ? 1.5 : 0.0) * $geneB['farm_pct'];

    // carrega os times para XP dos Thiegos
    $myTeam = [];
    $st = $pdo->prepare('SELECT thiego_id FROM battle_participants WHERE battle_id = :id AND side = \'player\'');
    $st->execute([':id' => $battleId]);
    foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $tid) {
        $bd = tdf_thiego_build($pdo, $uid, (int) $tid);
        if ($bd) $myTeam[] = $bd;
    }
    $enemyTeam = [];
    $st = $pdo->prepare('SELECT thiego_id FROM battle_participants WHERE battle_id = :id AND side = \'enemy\'');
    $st->execute([':id' => $battleId]);
    foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $tid) {
        $bd = tdf_thiego_build($pdo, $opponentId, (int) $tid);
        if ($bd) $enemyTeam[] = $bd;
    }

    $pdo->beginTransaction();
    try {
        // ELO e status dos dois
        $aW = ($winner === 'player') ? 1 : 0;
        $aL = ($winner === 'enemy') ? 1 : 0;
        $aD = ($winner === 'draw') ? 1 : 0;
        $bW = ($winner === 'enemy') ? 1 : 0;
        $bL = ($winner === 'player') ? 1 : 0;
        $bD = ($winner === 'draw') ? 1 : 0;
        $upsert = $pdo->prepare('INSERT INTO battle_rating (user_id, season_id, rating, wins, losses, streak, best_rating)
                                 VALUES (:u, :s, :r, :w, :l, :st, :br)
                                 ON DUPLICATE KEY UPDATE rating = :r2, wins = wins + :w2, losses = losses + :l2,
                                     streak = IF(:sw = 1, streak + 1, IF(:sd = 1, streak, 0)),
                                     best_rating = GREATEST(best_rating, :r3)');
        $upsert->execute([':u' => $uid, ':s' => $sid, ':r' => $myNew, ':w' => $aW, ':l' => $aL, ':st' => $aW ? 1 : 0, ':br' => $myNew, ':r2' => $myNew, ':w2' => $aW, ':l2' => $aL, ':sw' => $aW, ':sd' => $aD, ':r3' => $myNew]);
        $upsert->execute([':u' => $opponentId, ':s' => $sid, ':r' => $oppNew, ':w' => $bW, ':l' => $bL, ':st' => $bW ? 1 : 0, ':br' => $oppNew, ':r2' => $oppNew, ':w2' => $bW, ':l2' => $bL, ':sw' => $bW, ':sd' => $bD, ':r3' => $oppNew]);

        $pdo->prepare('UPDATE user_progress SET battle_coins = battle_coins + :c WHERE user_id = :u')->execute([':c' => $myCoins, ':u' => $uid]);
        if ($myDop > 0) tdf_add_dopamine_bonus($pdo, $uid, $myDop);
        $pdo->prepare('UPDATE user_stats SET battles = battles + 1, wins = wins + :w, losses = losses + :l, draws = draws + :d, best_rating = GREATEST(best_rating, :br) WHERE user_id = :u')
            ->execute([':w' => $win ? 1 : 0, ':l' => ($win || $draw) ? 0 : 1, ':d' => $draw ? 1 : 0, ':br' => $myNew, ':u' => $uid]);
        $pdo->prepare('UPDATE user_progress SET battle_coins = battle_coins + :c WHERE user_id = :u')->execute([':c' => $oppCoins, ':u' => $opponentId]);
        if ($oppDop > 0) tdf_add_dopamine_bonus($pdo, $opponentId, $oppDop);
        $pdo->prepare('UPDATE user_stats SET battles = battles + 1, wins = wins + :w, losses = losses + :l, draws = draws + :d, best_rating = GREATEST(best_rating, :br) WHERE user_id = :u')
            ->execute([':w' => $oppWin ? 1 : 0, ':l' => ($oppWin || $draw) ? 0 : 1, ':d' => $draw ? 1 : 0, ':br' => $oppNew, ':u' => $opponentId]);

        foreach ($state['items_used'] ?? [] as $u) {
            $side = (string) ($u['side'] ?? 'player');
            $targetId = $side === 'enemy' ? $opponentId : $uid;
            tdf_take_item($pdo, $targetId, (int) $u['item_id'], (int) $u['qty']);
        }

        $summary = ['winner' => $winner, 'turns' => (int) $state['turn'], 'coins' => $myCoins, 'rating' => $myNew, 'opponent_rating' => $oppNew];
        $pdo->prepare('UPDATE battles SET status = \'finished\', winner = :w, result = :r, finished_at = NOW() WHERE id = :id')
            ->execute([':w' => $winner, ':r' => json_encode($summary, JSON_UNESCAPED_UNICODE), ':id' => $battleId]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }

    $xpRes = tdf_apply_xp($pdo, $uid, $myXp);
    if ($xpRes['leveled'] > 0) tdf_mission_tick($pdo, $uid, 'account_level', $xpRes['level']);
    if ($win) {
        tdf_mission_tick($pdo, $uid, 'pvp_win', 1);
        tdf_mission_tick($pdo, $uid, 'coins_gain', $myCoins);
        tdf_achievement_check($pdo, $uid, 'pvp_win', tdf_metric_value($pdo, $uid, 'pvp_win'));
    }
    tdf_achievement_check($pdo, $uid, 'rating', $myNew);
    tdf_achievement_sweep($pdo, $uid);
    tdf_log($pdo, $uid, 'pvp_finish_manual', ['battle' => $battleId, 'opponent' => $opponentId, 'winner' => $winner, 'rating' => $myRating . '->' . $myNew, 'coins' => $myCoins]);

    $oppXpRes = tdf_apply_xp($pdo, $opponentId, $oppXp);
    if ($oppXpRes['leveled'] > 0) tdf_mission_tick($pdo, $opponentId, 'account_level', $oppXpRes['level']);
    if ($oppWin) {
        tdf_mission_tick($pdo, $opponentId, 'pvp_win', 1);
        tdf_mission_tick($pdo, $opponentId, 'coins_gain', $oppCoins);
        tdf_achievement_check($pdo, $opponentId, 'pvp_win', tdf_metric_value($pdo, $opponentId, 'pvp_win'));
    }
    tdf_achievement_check($pdo, $opponentId, 'rating', $oppNew);
    tdf_achievement_sweep($pdo, $opponentId);

    foreach ($myTeam as $pb) tdf_thiego_gain_xp($pdo, $uid, (int) $pb['thiego_id'], max(1, (int) round($myXp * 0.5)));
    foreach ($enemyTeam as $eb) tdf_thiego_gain_xp($pdo, $opponentId, (int) $eb['thiego_id'], max(1, (int) round($oppXp * 0.5)));

    tdf_json([
        'ok' => true,
        'battle_id' => $battleId,
        'winner' => $winner,
        'rating' => $myNew,
        'rating_change' => $myNew - $myRating,
        'division' => tdf_pvp_division($myNew),
        'coins' => $myCoins,
        'xp' => $myXp,
        'state' => $state,
    ]);
}

tdf_err(404, 'Rota não encontrada.');