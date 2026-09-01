<?php
/**
 * THIEGO DOPAMINA FARM — api/battle.php
 * Rotas PvE: POST start (pve | boss | challenge), POST auto (resolve),
 * POST cancel. Recompensas autoritativas + missões/conquistas.
 */

require_once __DIR__ . '/tdf_db.php';
require_once __DIR__ . '/progress.php';
require_once __DIR__ . '/battle_engine.php';
require_once __DIR__ . '/thiego_lib.php';

$pdo = tdf_pdo();
tdf_bootstrap();
tdf_seed_battle_abilities($pdo);
tdf_seed_type_advantages($pdo);

$route = $_GET['route'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];
$uid = tdf_current_user($pdo);
if (!$uid) tdf_err(401, 'Não autenticado.');

/** Cria build de inimigo (thiego + nível) */
function tdf_enemy_build(PDO $pdo, array $thiego, int $level): array
{
    $stats = tdf_thiego_stats($pdo, (int) $thiego['id'], $level);
    $q = $pdo->prepare('SELECT slot, name, description, power, cooldown, energy_cost, effect_type, effect_value, effect_target, animation FROM abilities WHERE thiego_id = :t ORDER BY id');
    $q->execute([':t' => $thiego['id']]);
    return [
        'ut_id' => null,
        'thiego_id' => (int) $thiego['id'],
        'slug' => $thiego['slug'],
        'name' => $thiego['name'],
        'image' => $thiego['image'],
        'type' => $thiego['type'],
        'rarity' => $thiego['rarity'],
        'level' => $level,
        'stats' => $stats,
        'abilities' => $q->fetchAll(),
        'equipment' => [],
    ];
}

/** Drops exclusivos por boss (slug do boss => [slug do item => peso relativo]) */
$BOSS_DROPS = [
    'thiego-malvado'   => ['coroa-malvado' => 3, 'meia-dopamina' => 2, 'pocao-dopamina' => 2],
    'thiego-drag'      => ['escama-drag' => 3, 'garrafa-energetico' => 2, 'fragmento-raro' => 2],
    'thiego-ameacador' => ['colar-ameacador' => 3, 'corrente-ganster' => 2, 'fragmento-epico' => 2],
    'thiego-celestial' => ['aureola-celestial' => 3, 'asas-angelicais' => 2, 'fragmento-lendario' => 2],
    'thiego-price'     => ['cetro-price' => 3, 'anel-bilionario' => 2, 'fragmento-divino' => 2],
    'thiego-mitosis'   => ['celula-mitose' => 2, 'halo-infinito' => 2, 'singularidade' => 2],
    'thiego-juizo-final' => ['celula-mitose' => 2, 'cetro-price' => 2, 'nucleo-infinito' => 2],
];

/** Multiplicador de HP do boss por quantidade de thiegos no time (slug => [1, 2, 3]) */
$BOSS_HP_MULT = [
    'thiego-malvado'   => [1 => 1.0, 2 => 2.6, 3 => 4.4],
    'thiego-drag'      => [1 => 1.0, 2 => 1.5, 3 => 2.2],
    'thiego-ameacador' => [1 => 1.0, 2 => 1.6, 3 => 2.3],
    'thiego-celestial' => [1 => 1.0, 2 => 1.5, 3 => 1.8],
    'thiego-price'     => [1 => 1.0, 2 => 1.4, 3 => 1.8],
    'thiego-mitosis'   => [1 => 1.0, 2 => 1.2, 3 => 1.4],
    'thiego-juizo-final' => [1 => 1.0, 2 => 1.2, 3 => 1.3],
];

/** Sorteia e concede drop de boss; retorna info do item ou null */
function tdf_boss_drop(PDO $pdo, int $userId, int $enemyId, int $ng): ?array
{
    global $BOSS_DROPS;
    $st = $pdo->prepare('SELECT slug FROM thiegos WHERE id = :id');
    $st->execute([':id' => $enemyId]);
    $slug = (string) ($st->fetch()['slug'] ?? '');
    if (!isset($BOSS_DROPS[$slug])) return null;
    $table = $BOSS_DROPS[$slug];
    $chance = min(0.8, 0.35 + 0.05 * max(0, $ng));
    if ((mt_rand(1, 100) / 100) > $chance) return null;
    $pick = null;
    $total = (int) array_sum($table);
    $r = mt_rand(1, max(1, $total));
    foreach ($table as $is => $w) {
        $r -= (int) $w;
        if ($r <= 0) { $pick = $is; break; }
    }
    if (!$pick) return null;
    $item = $pdo->prepare('SELECT id, slug, name, rarity FROM items WHERE slug = :s');
    $item->execute([':s' => $pick]);
    $row = $item->fetch();
    if (!$row) return null;
    tdf_grant_item($pdo, $userId, (int) $row['id'], 1);
    return ['item_id' => (int) $row['id'], 'slug' => $row['slug'], 'name' => $row['name'], 'rarity' => $row['rarity']];
}

/** Recompensas e fechamento da batalha (idempotente) */
function tdf_battle_finish(PDO $pdo, int $userId, array $battle, array $state): array
{
    if ($battle['status'] !== 'active') {
        return ['already' => true];
    }
    $winner = $state['status'] ?? 'draw';
    $mode = $battle['mode'];
    $enemyLevel = (int) $battle['enemy_level'];
    $isBoss = $mode === 'boss';
    $isChallenge = $mode === 'challenge';
    $isDaily = $mode === 'daily';
    $isSurvival = $mode === 'survival';
    $phase = max(1, (int) ($state['challenge_phase'] ?? 1));
    $ng = (int) ($state['ng_cycle'] ?? 0);
    $ngMult = min(3.0, 1 + $ng * 0.25);          // NG+ aumenta recompensas (até 3×)
    $chMult = 1 + 0.5 * ($phase - 1);             // desafio: recompensas crescem por fase
    $coins = 0; $xp = 0; $dop = 0.0; $ngGain = 0;

    if ($winner === 'player') {
        if ($isDaily) {
            // daily boss: recompensa diária generosa
            $coins = (int) round(300 + $enemyLevel * 30);
            $xp = (int) round(200 + $enemyLevel * 25);
            $dop = 5.0 + min(2.0, $ng * 0.1);
        } elseif ($isSurvival) {
            // survival: recompensas vêm do acumulado das ondas (state['survival']['rewards'])
            $surv = $state['survival'] ?? [];
            $coins = (int) ($surv['rewards']['coins'] ?? 0);
            $xp = (int) ($surv['rewards']['xp'] ?? 0);
            $dop = (float) ($surv['rewards']['dop'] ?? 0);
        } else {
            $coins = (int) round(($isBoss ? 100 : 20) + $enemyLevel * ($isBoss ? 12 : 4) * $chMult);
            $xp = (int) round(($isBoss ? 80 : 25) + $enemyLevel * ($isBoss ? 15 : 6) * $chMult);
            $dop = ($isBoss ? 2.5 : 1.0) + 0.25 * ($phase - 1) + min(2.0, $ng * 0.1);
            if ($isBoss) $ngGain = 1;
        }
        $coins = (int) round($coins * $ngMult);
        $xp = (int) round($xp * $ngMult);
    } elseif ($winner === 'draw') {
        $coins = $isSurvival ? (int) ($state['survival']['rewards']['coins'] ?? 0) : 5;
        $xp = $isSurvival ? (int) ($state['survival']['rewards']['xp'] ?? 0) : 10;
        $dop = $isSurvival ? (float) ($state['survival']['rewards']['dop'] ?? 0) : 0.0;
    } else {
        $xp = $isSurvival ? (int) ($state['survival']['rewards']['xp'] ?? 0) : 10;
        $coins = $isSurvival ? (int) ($state['survival']['rewards']['coins'] ?? 0) : 0;
        $dop = $isSurvival ? (float) ($state['survival']['rewards']['dop'] ?? 0) : 0.0;
    }

    // multiplicadores globais da genealogia (xp_pct, coin_pct, farm_pct)
    $gene = tdf_genealogy_multipliers($pdo, $userId);
    $coins = (int) round($coins * $gene['coin_pct']);
    $xp = (int) round($xp * $gene['xp_pct']);
    $dop = $dop * $gene['farm_pct'];

    // drop exclusivo de boss (35% + 5%/NG+, máx 80%) — boss, daily boss e challenge final
    $drop = null;
    $dropBoss = $isBoss || $isDaily || ($isChallenge && $phase >= 5);
    if ($dropBoss && $winner === 'player') {
        $drop = tdf_boss_drop($pdo, $userId, (int) $battle['enemy_id'], $ng);
    }

    // deduz consumíveis usados (só do lado do jogador)
    $used = $state['items_used'] ?? [];
    foreach ($used as $u) {
        if (($u['side'] ?? 'player') !== 'player') continue;
        tdf_take_item($pdo, $userId, (int) $u['item_id'], (int) $u['qty']);
    }

    $pdo->beginTransaction();
    try {
        // lock de linha + rechecagem de status dentro da transação (anti race)
        $chk = $pdo->prepare('SELECT status FROM battles WHERE id = :id FOR UPDATE');
        $chk->execute([':id' => $battle['id']]);
        if (($chk->fetch()['status'] ?? 'finished') !== 'active') {
            $pdo->rollBack();
            return ['already' => true];
        }
        $up = $pdo->prepare('UPDATE user_progress SET battle_coins = battle_coins + :c, ng_cycle = ng_cycle + :ng WHERE user_id = :u');
        $up->execute([':c' => $coins, ':ng' => $ngGain, ':u' => $userId]);
        if ($dop > 0) tdf_add_dopamine_bonus($pdo, $userId, $dop);
        $pdo->prepare('UPDATE user_stats SET battles = battles + 1,
            wins = wins + :w, losses = losses + :l, draws = draws + :d,
            bosses_killed = bosses_killed + :bk
            WHERE user_id = :u')
            ->execute([
                ':w' => $winner === 'player' ? 1 : 0,
                ':l' => $winner === 'enemy' ? 1 : 0,
                ':d' => $winner === 'draw' ? 1 : 0,
                ':bk' => ($dropBoss && $winner === 'player') ? 1 : 0,
                ':u' => $userId,
            ]);
        $ins = $pdo->prepare('INSERT INTO battle_rewards (battle_id, user_id, type, qty, value) VALUES (:bid, :u, :t, :q, :v)');
        if ($coins > 0) $ins->execute([':bid' => $battle['id'], ':u' => $userId, ':t' => 'battle_coins', ':q' => $coins, ':v' => $coins]);
        if ($dop > 0) $ins->execute([':bid' => $battle['id'], ':u' => $userId, ':t' => 'dopamine_log10', ':q' => 0, ':v' => $dop]);
        if ($ngGain > 0) $ins->execute([':bid' => $battle['id'], ':u' => $userId, ':t' => 'ng_cycle', ':q' => $ngGain, ':v' => 0]);
        if ($drop) {
            $pdo->prepare('INSERT INTO battle_rewards (battle_id, user_id, type, item_id, qty, value) VALUES (:bid, :u, \'item\', :iid, 1, 0)')
                ->execute([':bid' => $battle['id'], ':u' => $userId, ':iid' => $drop['item_id']]);
        }

        $summary = [
            'winner' => $winner,
            'turns' => (int) $state['turn'],
            'coins' => $coins,
            'xp' => $xp,
            'dopamine_log10' => $dop,
            'ng_cycle' => $ngGain,
            'drop' => $drop ? ['slug' => $drop['slug'], 'name' => $drop['name'], 'rarity' => $drop['rarity']] : null,
            'player_hp' => $state['combatants']['player'][0]['hp'] ?? 0,
            'enemy_hp' => $state['combatants']['enemy'][0]['hp'] ?? 0,
        ];
        $pdo->prepare('UPDATE battles SET status = :s, winner = :w, result = :r, finished_at = NOW() WHERE id = :id')
            ->execute([':s' => 'finished', ':w' => $winner, ':r' => json_encode($summary, JSON_UNESCAPED_UNICODE), ':id' => $battle['id']]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }

    // XP e progresso fora da transação (funções já gerenciam a própria)
    $xpRes = tdf_apply_xp($pdo, $userId, $xp);
    if ($xpRes['leveled'] > 0) tdf_mission_tick($pdo, $userId, 'account_level', $xpRes['level']);

    if ($drop) {
        tdf_notify($pdo, $userId, 'DROP DE BOSS!', 'Você obteve ' . $drop['name'] . ' (' . $drop['rarity'] . ')!');
    }
    if ($winner === 'player') {
        $par = $pdo->prepare('SELECT thiego_id FROM battle_participants WHERE battle_id = :bid AND side = \'player\'');
        $par->execute([':bid' => $battle['id']]);
        foreach ($par->fetchAll(PDO::FETCH_COLUMN) as $tid) {
            tdf_thiego_gain_xp($pdo, $userId, (int) $tid, max(1, (int) round($xp * 0.75)));
        }
    }

    if ($winner === 'player') {
        tdf_mission_tick($pdo, $userId, 'battle_win', 1);
        tdf_mission_tick($pdo, $userId, 'coins_gain', $coins);
        if ($isBoss) tdf_mission_tick($pdo, $userId, 'boss_win', 1);
        tdf_achievement_check($pdo, $userId, 'battle_win', tdf_metric_value($pdo, $userId, 'battle_win'));
        if ($isBoss) tdf_achievement_check($pdo, $userId, 'boss_win', tdf_metric_value($pdo, $userId, 'boss_win'));
    }
    if ($ngGain > 0) {
        tdf_mission_tick($pdo, $userId, 'ng_cycle', tdf_metric_value($pdo, $userId, 'ng_cycle'));
        tdf_achievement_check($pdo, $userId, 'ng_cycle', tdf_metric_value($pdo, $userId, 'ng_cycle'));
    }
    tdf_achievement_sweep($pdo, $userId);
    tdf_log($pdo, $userId, 'battle_finish', ['battle' => $battle['id'], 'mode' => $mode, 'winner' => $winner, 'coins' => $coins]);

    return ['winner' => $winner, 'coins' => $coins, 'xp' => $xp, 'dopamine_log10' => $dop, 'ng_cycle' => $ngGain,
        'drop' => $drop ? ['slug' => $drop['slug'], 'name' => $drop['name'], 'rarity' => $drop['rarity']] : null];
}

if ($method === 'POST' && $route === 'start') {
    $b = tdf_body();
    $csrf = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($b['csrf'] ?? ''));
    if (!tdf_check_csrf($pdo, $csrf)) tdf_err(403, 'Token CSRF inválido.');
    $mode = (string) ($b['mode'] ?? 'pve');
    if (!in_array($mode, ['pve', 'boss', 'challenge'], true)) tdf_err(422, 'Modo inválido.');
    $utIds = array_values(array_unique(array_filter(array_map('intval', (array) ($b['thiego_ids'] ?? [])))));
    if (count($utIds) < 1) tdf_err(422, 'Escolha ao menos 1 Thiego.');
    if (count($utIds) > 3) tdf_err(422, 'Máximo de 3 Thiegos.');

    $cost = $mode === 'pve' ? 1 : 2;

    $prog = tdf_user_progress($pdo, $uid);
    $lvl = (int) $prog['level'];
    $ng = (int) $prog['ng_cycle'];
    $gate = ['pve' => 1, 'boss' => 3, 'challenge' => 7];
    if ($lvl < $gate[$mode]) tdf_err(409, 'Batalhas ' . $mode . ' desbloqueiam no nível ' . $gate[$mode] . '.');

    // time do jogador
    $playerBuilds = [];
    foreach ($utIds as $utId) {
        $bd = tdf_thiego_build($pdo, $uid, $utId);
        if ($bd) $playerBuilds[] = $bd;
    }
    if (!$playerBuilds) tdf_err(422, 'Thiego não encontrado.');
    if (!tdf_spend_energy($pdo, $uid, $cost)) tdf_err(409, 'Energia insuficiente.');
    $avgLvl = (int) round(array_sum(array_column($playerBuilds, 'level')) / count($playerBuilds));
    $maxLvl = (int) max(array_column($playerBuilds, 'level'));

    // NG+: dificuldade aumenta com cada ciclo
    $ngLvl = min(30, $ng * 2);

    // inimigo
    if ($mode === 'boss') {
        $slug = (string) ($b['boss_slug'] ?? '');
        $st = $pdo->prepare('SELECT * FROM thiegos WHERE is_boss = 1 AND slug = :s');
        $st->execute([':s' => $slug]);
        $enemy = $st->fetch();
        if (!$enemy) tdf_err(404, 'Boss não encontrado.');
        $enemyLvl = max(1, min(100, $avgLvl + 3 + $ngLvl));
        $phase = 1;
    } elseif ($mode === 'challenge') {
        $phase = max(1, min(5, (int) ($prog['challenge_phase'] ?? 1)));
        if ($phase >= 5) {
            // fase final: um boss
            $st = $pdo->query('SELECT * FROM thiegos WHERE is_boss = 1 ORDER BY RAND() LIMIT 1');
            $enemy = $st->fetch();
            $enemyLvl = max(1, min(100, $maxLvl + 3 + $ngLvl));
        } else {
            // fases 1-2: pool geral; fases 3-4: elenco forte
            $pool = $phase >= 3
                ? "is_boss = 0 AND rarity IN ('epico','lendario','mitico','divino','celestial','infinito')"
                : 'is_boss = 0';
            $st = $pdo->query('SELECT * FROM thiegos WHERE ' . $pool . ' ORDER BY RAND() LIMIT 1');
            $enemy = $st->fetch();
            $enemyLvl = max(1, min(100, $maxLvl + 1 + $phase * 3 + $ngLvl));
        }
        if (!$enemy) tdf_err(404, 'Inimigo de desafio não encontrado.');
    } else {
        $st = $pdo->query('SELECT * FROM thiegos WHERE is_boss = 0 ORDER BY RAND() LIMIT 1');
        $enemy = $st->fetch();
        $enemyLvl = max(1, min(100, (int) round($avgLvl * 0.9) + $ngLvl));
        $phase = 1;
    }
    $enemyBuilds = [tdf_enemy_build($pdo, $enemy, $enemyLvl)];

    $state = tdf_battle_state($pdo, $playerBuilds, $enemyBuilds);
    if ($enemy['is_boss']) {
        global $BOSS_HP_MULT;
        $m = $BOSS_HP_MULT[$enemy['slug']][count($playerBuilds)] ?? 1.0;
        foreach ($state['combatants']['enemy'] as &$ec) {
            $ec['maxhp'] = (int) round($ec['maxhp'] * $m);
            $ec['hp'] = $ec['maxhp'];
        }
        unset($ec);
        if (!empty($state['hp_trail'][0]['hp']['enemy'])) {
            foreach ($state['hp_trail'][0]['hp']['enemy'] as &$ec) {
                $ec['maxhp'] = (int) round($ec['maxhp'] * $m);
                $ec['hp'] = $ec['maxhp'];
            }
            unset($ec);
        }
    }
    $state['challenge_phase'] = $phase;
    $state['ng_cycle'] = $ng;
    $state['items_used'] = [];
    foreach ($state['combatants']['player'] as &$pc) tdf_attach_consumables($pdo, $uid, $pc);
    unset($pc);

    $pdo->beginTransaction();
    try {
        $ins = $pdo->prepare('INSERT INTO battles (user_id, mode, enemy_id, enemy_level, status, state, energy_cost, season_id)
                              VALUES (:u, :m, :e, :el, \'active\', :s, :c, NULL)');
        $ins->execute([':u' => $uid, ':m' => $mode, ':e' => (int) $enemy['id'], ':el' => $enemyLvl, ':s' => json_encode($state, JSON_UNESCAPED_UNICODE), ':c' => $cost]);
        $battleId = (int) $pdo->lastInsertId();
        $par = $pdo->prepare('INSERT INTO battle_participants (battle_id, user_id, thiego_id, side, snapshot) VALUES (:bid, :u, :t, :s, :snap)');
        foreach ($playerBuilds as $pb) {
            $par->execute([':bid' => $battleId, ':u' => $uid, ':t' => $pb['thiego_id'], ':s' => 'player', ':snap' => json_encode($pb, JSON_UNESCAPED_UNICODE)]);
        }
        $par->execute([':bid' => $battleId, ':u' => $uid, ':t' => (int) $enemy['id'], ':s' => 'enemy', ':snap' => json_encode($enemyBuilds[0], JSON_UNESCAPED_UNICODE)]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }

    tdf_log($pdo, $uid, 'battle_start', ['battle' => $battleId, 'mode' => $mode, 'enemy' => $enemy['slug'], 'enemy_level' => $enemyLvl]);
    tdf_json(['ok' => true, 'battle_id' => $battleId, 'mode' => $mode, 'enemy' => ['slug' => $enemy['slug'], 'name' => $enemy['name'], 'image' => $enemy['image'], 'level' => $enemyLvl], 'state' => $state]);
}

if ($method === 'POST' && $route === 'auto') {
    $b = tdf_body();
    $csrf = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($b['csrf'] ?? ''));
    if (!tdf_check_csrf($pdo, $csrf)) tdf_err(403, 'Token CSRF inválido.');
    $battleId = (int) ($b['battle_id'] ?? 0);
    $st = $pdo->prepare('SELECT * FROM battles WHERE id = :id AND user_id = :u');
    $st->execute([':id' => $battleId, ':u' => $uid]);
    $battle = $st->fetch();
    if (!$battle) tdf_err(404, 'Batalha não encontrada.');

    $state = json_decode((string) $battle['state'], true) ?: [];
    if (!is_array($state) || empty($state['combatants'])) tdf_err(500, 'Estado inválido.');

    if ($battle['status'] === 'active') {
        $state = tdf_battle_resolve($pdo, $state, $uid);
        $pdo->prepare('UPDATE battles SET state = :s WHERE id = :id')->execute([':s' => json_encode($state, JSON_UNESCAPED_UNICODE), ':id' => $battleId]);
        $finish = tdf_battle_finish($pdo, $uid, $battle, $state);
        // desafio: avança de fase ao vencer
        if ($battle['mode'] === 'challenge' && ($finish['winner'] ?? '') === 'player') {
            $phase = max(1, (int) ($state['challenge_phase'] ?? 1));
            if ($phase < 5) {
                $pdo->prepare('UPDATE user_progress SET challenge_phase = challenge_phase + 1 WHERE user_id = :u')->execute([':u' => $uid]);
                $finish['challenge_phase'] = $phase + 1;
            } else {
                // venceu a fase final: novo ciclo NG+ + bônus
                $pdo->prepare('UPDATE user_progress SET challenge_phase = 1, ng_cycle = ng_cycle + 1 WHERE user_id = :u')->execute([':u' => $uid]);
                tdf_add_dopamine_bonus($pdo, $uid, 1.0);
                tdf_notify($pdo, $uid, 'DESAFIO CONCLUÍDO', 'Você derrotou o boss final do Desafio! Novo NG+ iniciado. +1 NG CYCLE.');
                $finish['ng_cycle'] = ($finish['ng_cycle'] ?? 0) + 1;
                $finish['dopamine_log10'] = ($finish['dopamine_log10'] ?? 0) + 1.0;
                $finish['challenge_complete'] = true;
            }
        }
    } else {
        $finish = ['already' => true, 'winner' => $battle['winner']];
    }
    tdf_json(['ok' => true, 'battle_id' => $battleId, 'state' => $state, 'result' => $finish]);
}

if ($method === 'POST' && $route === 'cancel') {
    $b = tdf_body();
    $csrf = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($b['csrf'] ?? ''));
    if (!tdf_check_csrf($pdo, $csrf)) tdf_err(403, 'Token CSRF inválido.');
    $battleId = (int) ($b['battle_id'] ?? 0);

    $pdo->beginTransaction();
    try {
        $st = $pdo->prepare('SELECT energy_cost FROM battles WHERE id = :id AND user_id = :u AND status = \'active\' FOR UPDATE');
        $st->execute([':id' => $battleId, ':u' => $uid]);
        $battle = $st->fetch();
        if ($battle) {
            $pdo->prepare('UPDATE battles SET status = \'cancelled\', finished_at = NOW() WHERE id = :id')->execute([':id' => $battleId]);
            $refund = max(0, (int) ($battle['energy_cost'] ?? 1));
            if ($refund > 0) {
                $pdo->prepare('UPDATE user_progress SET energy = LEAST(energy + :e, 10) WHERE user_id = :u')
                    ->execute([':e' => $refund, ':u' => $uid]);
            }
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    tdf_json(['ok' => true, 'refunded' => (int) ($battle['energy_cost'] ?? 0)]);
}

/* ----------------------------------------------------------------- MANUAL */
/** Cria uma batalha MANUAL (turno a turno). O estado é guardado sem resolver;
 *  o jogador envia uma ação por vez via manual_turn. */
if ($method === 'POST' && $route === 'manual_start') {
    $b = tdf_body();
    $csrf = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($b['csrf'] ?? ''));
    if (!tdf_check_csrf($pdo, $csrf)) tdf_err(403, 'Token CSRF inválido.');
    $mode = (string) ($b['mode'] ?? 'pve');
    if (!in_array($mode, ['pve', 'boss', 'challenge'], true)) tdf_err(422, 'Modo inválido.');
    $utIds = array_values(array_unique(array_filter(array_map('intval', (array) ($b['thiego_ids'] ?? [])))));
    if (count($utIds) < 1) tdf_err(422, 'Escolha ao menos 1 Thiego.');
    if (count($utIds) > 3) tdf_err(422, 'Máximo de 3 Thiegos.');

    $cost = $mode === 'pve' ? 1 : 2;

    $prog = tdf_user_progress($pdo, $uid);
    $lvl = (int) $prog['level'];
    $ng = (int) $prog['ng_cycle'];
    $gate = ['pve' => 1, 'boss' => 3, 'challenge' => 7];
    if ($lvl < $gate[$mode]) tdf_err(409, 'Batalhas ' . $mode . ' desbloqueiam no nível ' . $gate[$mode] . '.');

    $playerBuilds = [];
    foreach ($utIds as $utId) {
        $bd = tdf_thiego_build($pdo, $uid, $utId);
        if ($bd) $playerBuilds[] = $bd;
    }
    if (!$playerBuilds) tdf_err(422, 'Thiego não encontrado.');
    if (!tdf_spend_energy($pdo, $uid, $cost)) tdf_err(409, 'Energia insuficiente.');
    $avgLvl = (int) round(array_sum(array_column($playerBuilds, 'level')) / count($playerBuilds));
    $maxLvl = (int) max(array_column($playerBuilds, 'level'));

    $ngLvl = min(30, $ng * 2);

    if ($mode === 'boss') {
        $slug = (string) ($b['boss_slug'] ?? '');
        $st = $pdo->prepare('SELECT * FROM thiegos WHERE is_boss = 1 AND slug = :s');
        $st->execute([':s' => $slug]);
        $enemy = $st->fetch();
        if (!$enemy) tdf_err(404, 'Boss não encontrado.');
        $enemyLvl = max(1, min(100, $avgLvl + 3 + $ngLvl));
        $phase = 1;
    } elseif ($mode === 'challenge') {
        $phase = max(1, min(5, (int) ($prog['challenge_phase'] ?? 1)));
        if ($phase >= 5) {
            $st = $pdo->query('SELECT * FROM thiegos WHERE is_boss = 1 ORDER BY RAND() LIMIT 1');
            $enemy = $st->fetch();
            $enemyLvl = max(1, min(100, $maxLvl + 3 + $ngLvl));
        } else {
            $pool = $phase >= 3
                ? "is_boss = 0 AND rarity IN ('epico','lendario','mitico','divino','celestial','infinito')"
                : 'is_boss = 0';
            $st = $pdo->query('SELECT * FROM thiegos WHERE ' . $pool . ' ORDER BY RAND() LIMIT 1');
            $enemy = $st->fetch();
            $enemyLvl = max(1, min(100, $maxLvl + 1 + $phase * 3 + $ngLvl));
        }
        if (!$enemy) tdf_err(404, 'Inimigo de desafio não encontrado.');
    } else {
        $st = $pdo->query('SELECT * FROM thiegos WHERE is_boss = 0 ORDER BY RAND() LIMIT 1');
        $enemy = $st->fetch();
        $enemyLvl = max(1, min(100, (int) round($avgLvl * 0.9) + $ngLvl));
        $phase = 1;
    }
    $enemyBuilds = [tdf_enemy_build($pdo, $enemy, $enemyLvl)];

    $state = tdf_battle_state($pdo, $playerBuilds, $enemyBuilds);
    $state['manual'] = true;
    if ($enemy['is_boss']) {
        global $BOSS_HP_MULT;
        $m = $BOSS_HP_MULT[$enemy['slug']][count($playerBuilds)] ?? 1.0;
        foreach ($state['combatants']['enemy'] as &$ec) {
            $ec['maxhp'] = (int) round($ec['maxhp'] * $m);
            $ec['hp'] = $ec['maxhp'];
        }
        unset($ec);
        if (!empty($state['hp_trail'][0]['hp']['enemy'])) {
            foreach ($state['hp_trail'][0]['hp']['enemy'] as &$ec) {
                $ec['maxhp'] = (int) round($ec['maxhp'] * $m);
                $ec['hp'] = $ec['maxhp'];
            }
            unset($ec);
        }
    }
    $state['challenge_phase'] = $phase;
    $state['ng_cycle'] = $ng;
    $state['items_used'] = [];
    foreach ($state['combatants']['player'] as &$pc) tdf_attach_consumables($pdo, $uid, $pc);
    unset($pc);

    $pdo->beginTransaction();
    try {
        $ins = $pdo->prepare('INSERT INTO battles (user_id, mode, enemy_id, enemy_level, status, state, energy_cost, season_id)
                              VALUES (:u, :m, :e, :el, \'active\', :s, :c, NULL)');
        $ins->execute([':u' => $uid, ':m' => $mode, ':e' => (int) $enemy['id'], ':el' => $enemyLvl, ':s' => json_encode($state, JSON_UNESCAPED_UNICODE), ':c' => $cost]);
        $battleId = (int) $pdo->lastInsertId();
        $par = $pdo->prepare('INSERT INTO battle_participants (battle_id, user_id, thiego_id, side, snapshot) VALUES (:bid, :u, :t, :s, :snap)');
        foreach ($playerBuilds as $pb) {
            $par->execute([':bid' => $battleId, ':u' => $uid, ':t' => $pb['thiego_id'], ':s' => 'player', ':snap' => json_encode($pb, JSON_UNESCAPED_UNICODE)]);
        }
        $par->execute([':bid' => $battleId, ':u' => $uid, ':t' => (int) $enemy['id'], ':s' => 'enemy', ':snap' => json_encode($enemyBuilds[0], JSON_UNESCAPED_UNICODE)]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }

    tdf_log($pdo, $uid, 'battle_manual_start', ['battle' => $battleId, 'mode' => $mode, 'enemy' => $enemy['slug']]);
    tdf_json(['ok' => true, 'battle_id' => $battleId, 'mode' => $mode, 'manual' => true,
        'enemy' => ['slug' => $enemy['slug'], 'name' => $enemy['name'], 'image' => $enemy['image'], 'level' => $enemyLvl],
        'state' => $state]);
}

/** Processa uma ação do jogador numa batalha manual. */
if ($method === 'POST' && $route === 'manual_turn') {
    $b = tdf_body();
    $csrf = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($b['csrf'] ?? ''));
    if (!tdf_check_csrf($pdo, $csrf)) tdf_err(403, 'Token CSRF inválido.');
    $battleId = (int) ($b['battle_id'] ?? 0);
    $action = isset($b['action']) && is_array($b['action']) ? $b['action'] : null;
    if (!$action) tdf_err(422, 'Ação inválida.');

    $st = $pdo->prepare('SELECT * FROM battles WHERE id = :id AND user_id = :u');
    $st->execute([':id' => $battleId, ':u' => $uid]);
    $battle = $st->fetch();
    if (!$battle) tdf_err(404, 'Batalha não encontrada.');

    $state = json_decode((string) $battle['state'], true) ?: [];
    if (!is_array($state) || empty($state['combatants'])) tdf_err(500, 'Estado inválido.');
    if ($battle['status'] !== 'active') {
        tdf_json(['ok' => true, 'finished' => true, 'winner' => $battle['winner'], 'state' => $state, 'result' => ['winner' => $battle['winner']]]);
    }

    $state = tdf_manual_turn($pdo, $state, $action, $uid);
    $pdo->prepare('UPDATE battles SET state = :s WHERE id = :id')->execute([':s' => json_encode($state, JSON_UNESCAPED_UNICODE), ':id' => $battleId]);

    // fim da batalha? concede recompensas (PvE); PvP finaliza via pvp_finish_manual
    $finish = null;
    if ($state['status'] !== 'active') {
        if ($battle['mode'] === 'pvp') {
            $finish = ['winner' => $state['status'], 'pvp_pending' => true];
            $pdo->prepare('UPDATE battles SET status = :s, winner = :w WHERE id = :id')
                ->execute([':s' => 'finished', ':w' => $state['status'], ':id' => $battleId]);
        } else {
            $finish = tdf_battle_finish($pdo, $uid, $battle, $state);
            if ($battle['mode'] === 'challenge' && ($finish['winner'] ?? '') === 'player') {
                $phase = max(1, (int) ($state['challenge_phase'] ?? 1));
                if ($phase < 5) {
                    $pdo->prepare('UPDATE user_progress SET challenge_phase = challenge_phase + 1 WHERE user_id = :u')->execute([':u' => $uid]);
                    $finish['challenge_phase'] = $phase + 1;
                } else {
                    $pdo->prepare('UPDATE user_progress SET challenge_phase = 1, ng_cycle = ng_cycle + 1 WHERE user_id = :u')->execute([':u' => $uid]);
                    tdf_add_dopamine_bonus($pdo, $uid, 1.0);
                    tdf_notify($pdo, $uid, 'DESAFIO CONCLUÍDO', 'Você derrotou o boss final do Desafio! Novo NG+ iniciado. +1 NG CYCLE.');
                    $finish['ng_cycle'] = ($finish['ng_cycle'] ?? 0) + 1;
                    $finish['dopamine_log10'] = ($finish['dopamine_log10'] ?? 0) + 1.0;
                    $finish['challenge_complete'] = true;
                }
            }
        }
    }

    tdf_json(['ok' => true, 'battle_id' => $battleId, 'state' => $state, 'result' => $finish]);
}

/* ----------------------------------------------------------------- PvP TURN */
/** Processa a ação do jogador na vez dele em batalha PvP assíncrona. */
if ($method === 'POST' && $route === 'pvp_turn') {
    $b = tdf_body();
    $csrf = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($b['csrf'] ?? ''));
    if (!tdf_check_csrf($pdo, $csrf)) tdf_err(403, 'Token CSRF inválido.');
    $battleId = (int) ($b['battle_id'] ?? 0);
    $action = isset($b['action']) && is_array($b['action']) ? $b['action'] : null;
    if (!$action) tdf_err(422, 'Ação inválida.');

    $st = $pdo->prepare('SELECT * FROM battles WHERE id = :id AND mode = \'pvp\'');
    $st->execute([':id' => $battleId]);
    $battle = $st->fetch();
    if (!$battle) tdf_err(404, 'Batalha não encontrada.');
    if ($battle['status'] !== 'active') tdf_err(409, 'Batalha já finalizada.');

    $state = json_decode((string) $battle['state'], true) ?: [];
    $pvp = $state['pvp'] ?? [];
    $turnOwner = (int) ($pvp['turn_owner'] ?? 0);
    if ($turnOwner !== $uid) tdf_err(403, 'Não é sua vez.');

    $state = tdf_pvp_turn($pdo, $state, $uid, $action);
    $pdo->prepare('UPDATE battles SET state = :s WHERE id = :id')->execute([':s' => json_encode($state, JSON_UNESCAPED_UNICODE), ':id' => $battleId]);

    // fim da batalha? aplica recompensas PvP
    $finish = null;
    if ($state['status'] !== 'active') {
        $pdo->prepare('UPDATE battles SET status = :s, winner = :w WHERE id = :id')
            ->execute([':s' => 'finished', ':w' => $state['status'], ':id' => $battleId]);
        $finish = ['winner' => $state['status'], 'pvp_pending' => true];
    }

    tdf_json([
        'ok' => true,
        'battle_id' => $battleId,
        'state' => $state,
        'my_turn' => ($pvp['turn_owner'] ?? 0) === $uid ? false : true,
        'result' => $finish,
    ]);
}

/** GET do gráfico completo de tipos (matriz + rótulos para a UI). */
if ($method === 'GET' && $route === 'type_chart') {
    $st = $pdo->query('SELECT attacker, defender, mult FROM type_advantages ORDER BY attacker, defender');
    $rows = $st->fetchAll();
    $matrix = [];
    foreach ($rows as $r) {
        $matrix[$r['attacker']][$r['defender']] = (float) $r['mult'];
    }
    tdf_json(['ok' => true, 'matrix' => $matrix]);
}

/** GET do estado atual de uma batalha PvP (para o oponente polling). */
if ($method === 'GET' && $route === 'pvp_state') {
    $battleId = (int) ($_GET['battle_id'] ?? 0);
    $st = $pdo->prepare('SELECT id, status, state, winner FROM battles WHERE id = :id AND mode = \'pvp\'');
    $st->execute([':id' => $battleId]);
    $battle = $st->fetch();
    if (!$battle) tdf_err(404, 'Batalha não encontrada.');
    $state = json_decode((string) $battle['state'], true) ?: [];
    $pvp = $state['pvp'] ?? [];
    $turnOwner = (int) ($pvp['turn_owner'] ?? 0);
    tdf_json([
        'ok' => true,
        'battle_id' => $battleId,
        'status' => $battle['status'],
        'winner' => $battle['winner'],
        'state' => $state,
        'my_turn' => $turnOwner === $uid,
    ]);
}

/* ============================================================
   SURVIVAL MODE — ondas infinitas de inimigos cada vez mais fortes.
   O time NÃO cura entre ondas (fica o HP restante); recompensas
   acumulam por onda vencida. Morrer = fim da run.
   ============================================================ */

/** Gera o inimigo da wave N. */
function tdf_survival_enemy(PDO $pdo, int $wave, int $playerMaxLvl, int $ng): array
{
    // wave 3, 6, 9... = boss; demais = inimigo normal mais forte
    $isBoss = $wave % 3 === 0;
    if ($isBoss) {
        $st = $pdo->query('SELECT * FROM thiegos WHERE is_boss = 1 ORDER BY RAND() LIMIT 1');
    } else {
        $st = $pdo->query('SELECT * FROM thiegos WHERE is_boss = 0 ORDER BY RAND() LIMIT 1');
    }
    $enemy = $st->fetch();
    if (!$enemy) {
        $st = $pdo->query('SELECT * FROM thiegos ORDER BY RAND() LIMIT 1');
        $enemy = $st->fetch();
    }
    $ngLvl = min(30, $ng * 2);
    $lvl = max(1, min(100, $playerMaxLvl + (int) floor($wave / 2) + $ngLvl));
    $build = tdf_enemy_build($pdo, $enemy, $lvl);
    $build['survival_wave'] = $wave;
    if ($isBoss) {
        // bosses da survival têm HP multiplicado pela wave
        $build['stats']['hp'] = (int) round($build['stats']['hp'] * (1 + $wave * 0.4));
        $build['stats']['atk'] = (int) round($build['stats']['atk'] * (1 + $wave * 0.1));
    }
    return $build;
}

/** Inicia uma run de Survival. */
if ($method === 'POST' && $route === 'survival_start') {
    $b = tdf_body();
    $csrf = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($b['csrf'] ?? ''));
    if (!tdf_check_csrf($pdo, $csrf)) tdf_err(403, 'Token CSRF inválido.');
    $utIds = array_values(array_unique(array_filter(array_map('intval', (array) ($b['thiego_ids'] ?? [])))));
    if (count($utIds) < 1 || count($utIds) > 3) tdf_err(422, 'Escolha de 1 a 3 Thiegos.');

    $prog = tdf_user_progress($pdo, $uid);
    $lvl = (int) $prog['level'];
    $ng = (int) $prog['ng_cycle'];
    if ($lvl < 5) tdf_err(409, 'Survival desbloqueia no nível 5.');

    $playerBuilds = [];
    foreach ($utIds as $utId) {
        $bd = tdf_thiego_build($pdo, $uid, $utId);
        if ($bd) $playerBuilds[] = $bd;
    }
    if (!$playerBuilds) tdf_err(422, 'Thiego não encontrado.');
    if (!tdf_spend_energy($pdo, $uid, 2)) tdf_err(409, 'Energia insuficiente.');

    $maxLvl = (int) max(array_column($playerBuilds, 'level'));
    $enemyBuild = tdf_survival_enemy($pdo, 1, $maxLvl, $ng);

    $state = tdf_battle_state($pdo, $playerBuilds, [$enemyBuild]);
    $state['survival'] = [
        'wave' => 1,
        'wins' => 0,
        'best_wave' => (int) ($prog['challenge_phase'] ?? 1),
        'rewards' => ['coins' => 0, 'xp' => 0, 'dop' => 0.0],
    ];
    $state['items_used'] = [];
    foreach ($state['combatants']['player'] as &$pc) tdf_attach_consumables($pdo, $uid, $pc);
    unset($pc);

    $pdo->beginTransaction();
    try {
        $ins = $pdo->prepare('INSERT INTO battles (user_id, mode, enemy_id, enemy_level, status, state, energy_cost, season_id)
                              VALUES (:u, \'survival\', :e, :el, \'active\', :s, 2, NULL)');
        $ins->execute([':u' => $uid, ':e' => (int) $enemyBuild['thiego_id'], ':el' => (int) $enemyBuild['level'], ':s' => json_encode($state, JSON_UNESCAPED_UNICODE)]);
        $battleId = (int) $pdo->lastInsertId();
        $par = $pdo->prepare('INSERT INTO battle_participants (battle_id, user_id, thiego_id, side, snapshot) VALUES (:bid, :u, :t, :s, :snap)');
        foreach ($playerBuilds as $pb) $par->execute([':bid' => $battleId, ':u' => $uid, ':t' => $pb['thiego_id'], ':s' => 'player', ':snap' => json_encode($pb, JSON_UNESCAPED_UNICODE)]);
        $par->execute([':bid' => $battleId, ':u' => $uid, ':t' => (int) $enemyBuild['thiego_id'], ':s' => 'enemy', ':snap' => json_encode($enemyBuild, JSON_UNESCAPED_UNICODE)]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    tdf_json(['ok' => true, 'battle_id' => $battleId, 'mode' => 'survival', 'wave' => 1,
        'enemy' => ['slug' => $enemyBuild['slug'], 'name' => $enemyBuild['name'], 'image' => $enemyBuild['image'], 'level' => $enemyBuild['level'], 'is_boss' => (int) ($enemyBuild['is_boss'] ?? 0)],
        'state' => $state]);
}

/** Resolve a wave atual e avança (ou encerra se perder). */
if ($method === 'POST' && $route === 'survival_next') {
    $b = tdf_body();
    $csrf = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($b['csrf'] ?? ''));
    if (!tdf_check_csrf($pdo, $csrf)) tdf_err(403, 'Token CSRF inválido.');
    $battleId = (int) ($b['battle_id'] ?? 0);
    $st = $pdo->prepare('SELECT * FROM battles WHERE id = :id AND user_id = :u AND mode = \'survival\'');
    $st->execute([':id' => $battleId, ':u' => $uid]);
    $battle = $st->fetch();
    if (!$battle) tdf_err(404, 'Run de survival não encontrada.');
    if ($battle['status'] !== 'active') tdf_err(409, 'Run já finalizada.');

    $state = json_decode((string) $battle['state'], true) ?: [];
    if (!is_array($state) || empty($state['combatants'])) tdf_err(500, 'Estado inválido.');

    // resolve a wave atual
    $state = tdf_battle_resolve($pdo, $state, $uid);
    $surv = $state['survival'] ?? ['wave' => 1, 'wins' => 0, 'rewards' => ['coins' => 0, 'xp' => 0, 'dop' => 0.0]];
    $wave = (int) ($surv['wave'] ?? 1);
    $won = ($state['status'] ?? 'draw') === 'player';

    if ($won) {
        // recompensas da wave
        $surv['wins'] = (int) ($surv['wins'] ?? 0) + 1;
        $coins = (int) round(15 * $wave * (1 + $wave * 0.5));
        $xp = (int) round(10 * $wave);
        $dop = round(0.05 * $wave, 2);
        $surv['rewards']['coins'] += $coins;
        $surv['rewards']['xp'] += $xp;
        $surv['rewards']['dop'] += $dop;
        // cada 5 ondas = bônus
        if ($wave % 5 === 0) $surv['rewards']['coins'] += (int) round(50 * $wave);

        // próxima wave: NOVO inimigo, time mantém HP restante (sem cura entre ondas, exceto 20% a cada 5)
        $waveNext = $wave + 1;
        $maxLvl = 0;
        foreach ($state['combatants']['player'] as $pc) $maxLvl = max($maxLvl, (int) $pc['level']);
        $enemyBuild = tdf_survival_enemy($pdo, $waveNext, $maxLvl, (int) ($state['ng_cycle'] ?? 0));

        $newState = tdf_battle_state($pdo, [], [$enemyBuild]);
        // preserva o HP atual do time (e buffs/ult/consumables)
        $newState['combatants']['player'] = $state['combatants']['player'];
        if ($waveNext % 5 === 0) {
            // cura 25% a cada 5 ondas (checkpoint)
            foreach ($newState['combatants']['player'] as &$pc) {
                $pc['hp'] = min($pc['maxhp'], $pc['hp'] + (int) round($pc['maxhp'] * 0.25));
            }
            unset($pc);
        }
        $newState['survival'] = $surv;
        $newState['survival']['wave'] = $waveNext;
        $newState['items_used'] = $state['items_used'] ?? [];
        $newState['seed'] = random_int(1, 999999999);
        $newState['hp_trail'][] = tdf_hp_snapshot($newState, 0, 'sys', '🌊 ONDA ' . $waveNext . ' — novos inimigos se aproximam!');

        // registra onda vencida na tabela de batalhas
        $pdo->prepare('UPDATE battles SET state = :s, enemy_id = :e, enemy_level = :el WHERE id = :id')
            ->execute([':s' => json_encode($newState, JSON_UNESCAPED_UNICODE), ':e' => (int) $enemyBuild['thiego_id'], ':el' => (int) $enemyBuild['level'], ':id' => $battleId]);
        $state = $newState;

        tdf_json(['ok' => true, 'won' => true, 'wave' => $waveNext,
            'wave_rewards' => ['coins' => $coins, 'xp' => $xp, 'dop' => $dop],
            'total_rewards' => $surv['rewards'],
            'enemy' => ['slug' => $enemyBuild['slug'], 'name' => $enemyBuild['name'], 'image' => $enemyBuild['image'], 'level' => $enemyBuild['level'], 'is_boss' => (int) ($enemyBuild['is_boss'] ?? 0)],
            'state' => $state]);
    } else {
        // perdeu: paga o que acumulou
        $finish = tdf_battle_finish($pdo, $uid, $battle, $state);
        $pdo->prepare('UPDATE battles SET status = \'finished\', winner = :w, result = :r, finished_at = NOW() WHERE id = :id')
            ->execute([':w' => $state['status'] ?? 'enemy', ':r' => json_encode(['survival' => $surv], JSON_UNESCAPED_UNICODE), ':id' => $battleId]);
        tdf_json(['ok' => true, 'won' => false, 'wave' => $wave, 'wins' => (int) ($surv['wins'] ?? 0),
            'total_rewards' => $surv['rewards'], 'result' => $finish, 'state' => $state]);
    }
}

/** Abandona a run e recebe o acumulado. */
if ($method === 'POST' && $route === 'survival_retire') {
    $b = tdf_body();
    $csrf = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($b['csrf'] ?? ''));
    if (!tdf_check_csrf($pdo, $csrf)) tdf_err(403, 'Token CSRF inválido.');
    $battleId = (int) ($b['battle_id'] ?? 0);
    $st = $pdo->prepare('SELECT * FROM battles WHERE id = :id AND user_id = :u AND mode = \'survival\'');
    $st->execute([':id' => $battleId, ':u' => $uid]);
    $battle = $st->fetch();
    if (!$battle || $battle['status'] !== 'active') tdf_err(409, 'Run não está ativa.');

    $state = json_decode((string) $battle['state'], true) ?: [];
    $surv = $state['survival'] ?? ['wave' => 1, 'wins' => 0, 'rewards' => ['coins' => 0, 'xp' => 0, 'dop' => 0.0]];
    $finish = tdf_battle_finish($pdo, $uid, $battle, $state);
    $pdo->prepare('UPDATE battles SET status = \'finished\', winner = \'retire\', result = :r, finished_at = NOW() WHERE id = :id')
        ->execute([':r' => json_encode(['survival' => $surv], JSON_UNESCAPED_UNICODE), ':id' => $battleId]);
    tdf_json(['ok' => true, 'retired' => true, 'wins' => (int) ($surv['wins'] ?? 0), 'wave' => (int) ($surv['wave'] ?? 1),
        'total_rewards' => $surv['rewards'], 'result' => $finish]);
}

/* ============================================================
   DAILY BOSS — um boss especial muda todo dia (determinístico).
   Luta grátis 1x/dia. Dano causado vira recompensa.
   ============================================================ */

/** Boss do dia: escolhido por data (hash determinístico). */
function tdf_daily_boss(PDO $pdo): array
{
    $st = $pdo->query('SELECT id FROM thiegos WHERE is_boss = 1 ORDER BY id');
    $ids = $st->fetchAll(PDO::FETCH_COLUMN);
    if (!$ids) {
        $st = $pdo->query('SELECT id FROM thiegos ORDER BY id');
        $ids = $st->fetchAll(PDO::FETCH_COLUMN);
    }
    $dayNum = (int) date('z'); // 0-365
    $idx = $dayNum % count($ids);
    $q = $pdo->prepare('SELECT * FROM thiegos WHERE id = :id');
    $q->execute([':id' => $ids[$idx]]);
    return $q->fetch() ?: [];
}

/** Já lutou hoje? */
function tdf_daily_done(PDO $pdo, int $userId): bool
{
    $today = date('Y-m-d');
    $st = $pdo->prepare("SELECT COUNT(*) FROM battles WHERE user_id = :u AND mode = 'daily' AND DATE(finished_at) = :d");
    $st->execute([':u' => $userId, ':d' => $today]);
    return (int) $st->fetchColumn() > 0;
}

/** GET: info do boss do dia. */
if ($method === 'GET' && $route === 'daily_info') {
    $boss = tdf_daily_boss($pdo);
    $done = tdf_daily_done($pdo, $uid);
    tdf_json(['ok' => true, 'boss' => [
        'slug' => $boss['slug'], 'name' => $boss['name'], 'image' => $boss['image'], 'rarity' => $boss['rarity'], 'quote' => $boss['quote'] ?? '',
    ], 'done' => $done]);
}

/** POST: luta contra o boss do dia (1x/dia, grátis). */
if ($method === 'POST' && $route === 'daily_start') {
    $b = tdf_body();
    $csrf = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($b['csrf'] ?? ''));
    if (!tdf_check_csrf($pdo, $csrf)) tdf_err(403, 'Token CSRF inválido.');
    if (tdf_daily_done($pdo, $uid)) tdf_err(409, 'Você já lutou contra o boss de hoje. Volte amanhã!');

    $utIds = array_values(array_unique(array_filter(array_map('intval', (array) ($b['thiego_ids'] ?? [])))));
    if (count($utIds) < 1 || count($utIds) > 3) tdf_err(422, 'Escolha de 1 a 3 Thiegos.');
    $playerBuilds = [];
    foreach ($utIds as $utId) {
        $bd = tdf_thiego_build($pdo, $uid, $utId);
        if ($bd) $playerBuilds[] = $bd;
    }
    if (!$playerBuilds) tdf_err(422, 'Thiego não encontrado.');

    $boss = tdf_daily_boss($pdo);
    $maxLvl = (int) max(array_column($playerBuilds, 'level'));
    $prog = tdf_user_progress($pdo, $uid);
    $ng = (int) $prog['ng_cycle'];
    $enemyLvl = max(1, min(100, $maxLvl + 5 + min(30, $ng * 2)));
    $enemyBuild = tdf_enemy_build($pdo, $boss, $enemyLvl);

    $state = tdf_battle_state($pdo, $playerBuilds, [$enemyBuild]);
    $state['daily'] = true;
    $state['items_used'] = [];
    foreach ($state['combatants']['player'] as &$pc) tdf_attach_consumables($pdo, $uid, $pc);
    unset($pc);

    $pdo->beginTransaction();
    try {
        $ins = $pdo->prepare('INSERT INTO battles (user_id, mode, enemy_id, enemy_level, status, state, energy_cost, season_id)
                              VALUES (:u, \'daily\', :e, :el, \'active\', :s, 0, NULL)');
        $ins->execute([':u' => $uid, ':e' => (int) $boss['id'], ':el' => $enemyLvl, ':s' => json_encode($state, JSON_UNESCAPED_UNICODE)]);
        $battleId = (int) $pdo->lastInsertId();
        $par = $pdo->prepare('INSERT INTO battle_participants (battle_id, user_id, thiego_id, side, snapshot) VALUES (:bid, :u, :t, :s, :snap)');
        foreach ($playerBuilds as $pb) $par->execute([':bid' => $battleId, ':u' => $uid, ':t' => $pb['thiego_id'], ':s' => 'player', ':snap' => json_encode($pb, JSON_UNESCAPED_UNICODE)]);
        $par->execute([':bid' => $battleId, ':u' => $uid, ':t' => (int) $boss['id'], ':s' => 'enemy', ':snap' => json_encode($enemyBuild, JSON_UNESCAPED_UNICODE)]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    tdf_json(['ok' => true, 'battle_id' => $battleId, 'mode' => 'daily',
        'enemy' => ['slug' => $boss['slug'], 'name' => $boss['name'], 'image' => $boss['image'], 'level' => $enemyLvl],
        'state' => $state]);
}

/** POST: resolve a luta do daily boss (chamada via route=auto normal). */

tdf_err(404, 'Rota não encontrada.');