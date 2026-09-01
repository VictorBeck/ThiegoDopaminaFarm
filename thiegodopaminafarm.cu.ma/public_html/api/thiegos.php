<?php
/**
 * THIEGO DOPAMINA FARM — api/thiegos.php
 * Catálogo de Thiegos, concessão por marcos (unlock), level up e
 * cálculo de build efetiva (stats + equipamentos) — também usado
 * pelo motor de batalha.
 */

require_once __DIR__ . '/thiego_lib.php';
require_once __DIR__ . '/progress.php';

$pdo = tdf_pdo();
tdf_bootstrap();

$route = $_GET['route'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];
$uid = tdf_current_user($pdo);
if (!$uid) tdf_err(401, 'Não autenticado.');

/* ---------- rotas ---------- */

if ($method === 'GET' && $route === 'catalog') {
    $prog = tdf_user_progress($pdo, $uid);
    $thiegos = $pdo->query('SELECT * FROM thiegos ORDER BY tier_order, id')->fetchAll();
    $owned = $pdo->prepare('SELECT thiego_id, id, level, xp FROM user_thiegos WHERE user_id = :u');
    $owned->execute([':u' => $uid]);
    $ownedMap = [];
    foreach ($owned->fetchAll() as $o) $ownedMap[(int) $o['thiego_id']] = $o;

    $list = [];
    $abSt = $pdo->query('SELECT thiego_id, slot, name, description, power, cooldown, energy_cost, effect_type, effect_value, effect_target, animation FROM abilities ORDER BY thiego_id, id');
    $abMap = [];
    foreach ($abSt->fetchAll() as $ab) {
        $abMap[(int) $ab['thiego_id']][] = [
            'slot' => $ab['slot'],
            'name' => $ab['name'],
            'description' => $ab['description'],
            'power' => (float) $ab['power'],
            'cooldown' => (int) $ab['cooldown'],
            'energy_cost' => (int) $ab['energy_cost'],
            'effect_type' => $ab['effect_type'],
            'effect_value' => (float) $ab['effect_value'],
            'effect_target' => $ab['effect_target'],
            'animation' => $ab['animation'],
        ];
    }
    foreach ($thiegos as $t) {
        $ob = $ownedMap[(int) $t['id']] ?? null;
        $item = [
            'id' => (int) $t['id'],
            'slug' => $t['slug'],
            'name' => $t['name'],
            'image' => $t['image'],
            'type' => $t['type'],
            'rarity' => $t['rarity'],
            'role' => $t['role'],
            'tier' => (int) $t['tier_order'],
            'description' => $t['description'],
            'quote' => $t['quote'],
            'is_boss' => (int) $t['is_boss'],
            'abilities' => $abMap[(int) $t['id']] ?? [],
            'unlock' => ['metric' => $t['unlock_metric'], 'value' => (float) $t['unlock_value'], 'level' => (int) $t['unlock_level']],
            'owned' => $ob !== null,
        ];
        if ($ob) {
            $item['ut_id'] = (int) $ob['id'];
            $item['level'] = (int) $ob['level'];
            $item['stats'] = tdf_thiego_stats($pdo, (int) $t['id'], (int) $ob['level']);
        }
        // requisito atendido?
        $metric = $t['unlock_metric'];
        $need = (float) $t['unlock_value'];
        $have = match ($metric) {
            'level' => (float) $prog['level'],
            'dopamine' => (float) $prog['total_dopamine_log10'],
            'prestige' => (float) $prog['prestige'],
            'ng' => (float) $prog['ng_cycle'],
            'evolution' => (float) $prog['evolution_tier'],
            'secret' => PHP_FLOAT_MIN, // segredos nunca desbloqueiam por métrica
            default => PHP_FLOAT_MIN,
        };
        $item['unlock_ready'] = !(int) $t['is_boss'] && (int) $t['unlock_level'] <= (int) $prog['level'] && $have >= $need;
        $list[] = $item;
    }
    tdf_json(['ok' => true, 'thiegos' => $list]);
}

if ($method === 'POST' && $route === 'refresh_unlocks') {
    $csrf = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? (tdf_body()['csrf'] ?? ''));
    if (!tdf_check_csrf($pdo, $csrf)) tdf_err(403, 'Token CSRF inválido.');

    $prog = tdf_user_progress($pdo, $uid);
    $st = $pdo->prepare('SELECT id, slug, unlock_metric, unlock_value, unlock_level, is_boss FROM thiegos');
    $st->execute();
    $have = $pdo->prepare('SELECT thiego_id FROM user_thiegos WHERE user_id = :u');
    $have->execute([':u' => $uid]);
    $owned = array_fill_keys(array_map('intval', $have->fetchAll(PDO::FETCH_COLUMN)), true);

    $newOnes = [];
    $ins = $pdo->prepare('INSERT IGNORE INTO user_thiegos (user_id, thiego_id) VALUES (:u, :t)');
    foreach ($st->fetchAll() as $t) {
        if ((int) $t['is_boss']) continue;
        if (isset($owned[(int) $t['id']])) continue;
        if ((int) $t['unlock_level'] > (int) $prog['level']) continue;
        $metric = $t['unlock_metric'];
        $need = (float) $t['unlock_value'];
        $haveVal = match ($metric) {
            'level' => (float) $prog['level'],
            'dopamine' => (float) $prog['total_dopamine_log10'],
            'prestige' => (float) $prog['prestige'],
            'ng' => (float) $prog['ng_cycle'],
            'evolution' => (float) $prog['evolution_tier'],
            default => PHP_FLOAT_MIN, // secret/desconhecidos nunca desbloqueiam por métrica
        };
        if ($haveVal >= $need) {
            $ins->execute([':u' => $uid, ':t' => $t['id']]);
            $newOnes[] = $t['slug'];
            tdf_notify($pdo, $uid, 'Novo Thiego!', 'Você desbloqueou ' . $t['slug'] . '!');
        }
    }
    if ($newOnes) {
        tdf_mission_tick($pdo, $uid, 'thiego_unlock', count($newOnes));
        tdf_achievement_check($pdo, $uid, 'thiego_unlock', tdf_metric_value($pdo, $uid, 'thiego_unlock'));
    }
    tdf_json(['ok' => true, 'new' => $newOnes]);
}

if ($method === 'POST' && $route === 'level_up') {
    $b = tdf_body();
    $csrf = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($b['csrf'] ?? ''));
    if (!tdf_check_csrf($pdo, $csrf)) tdf_err(403, 'Token CSRF inválido.');
    $utId = (int) ($b['ut_id'] ?? 0);

    $st = $pdo->prepare('SELECT ut.id, ut.thiego_id, ut.level, t.name FROM user_thiegos ut JOIN thiegos t ON t.id = ut.thiego_id WHERE ut.id = :id AND ut.user_id = :u FOR UPDATE');
    $st->execute([':id' => $utId, ':u' => $uid]);
    $row = $st->fetch();
    if (!$row) tdf_err(404, 'Thiego não encontrado.');
    if ((int) $row['level'] >= 100) tdf_err(409, 'Nível máximo (100).');

    $cost = 25 + (int) $row['level'] * 25;
    $q = $pdo->prepare('SELECT battle_coins FROM user_progress WHERE user_id = :u FOR UPDATE');
    $q->execute([':u' => $uid]);
    $cur = (int) $q->fetch()['battle_coins'];
    if ($cur < $cost) tdf_err(409, 'Battle Coins insuficientes (precisa ' . $cost . ').');

    $pdo->beginTransaction();
    try {
        $pdo->prepare('UPDATE user_progress SET battle_coins = battle_coins - :c WHERE user_id = :u')->execute([':c' => $cost, ':u' => $uid]);
        $pdo->prepare('UPDATE user_thiegos SET level = level + 1, xp = 0 WHERE id = :id')->execute([':id' => $utId]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    tdf_apply_xp($pdo, $uid, 5);
    tdf_log($pdo, $uid, 'thiego_level_up', ['thiego' => $row['name'], 'level' => (int) $row['level'] + 1, 'cost' => $cost]);
    tdf_json(['ok' => true, 'level' => (int) $row['level'] + 1, 'cost' => $cost]);
}

/* ---------- rotas em comum (chamadas dentro do buy_all) ---------- */

/** Desbloqueia todos os thiegos elegíveis (mesma lógica do refresh_unlocks). Retorna slugs novos. */
function tdf_unlock_eligible(PDO $pdo, int $uid): array
{
    $prog = tdf_user_progress($pdo, $uid);
    $st = $pdo->prepare('SELECT id, slug, unlock_metric, unlock_value, unlock_level, is_boss FROM thiegos');
    $st->execute();
    $have = $pdo->prepare('SELECT thiego_id FROM user_thiegos WHERE user_id = :u');
    $have->execute([':u' => $uid]);
    $owned = array_fill_keys(array_map('intval', $have->fetchAll(PDO::FETCH_COLUMN)), true);

    $newOnes = [];
    $ins = $pdo->prepare('INSERT IGNORE INTO user_thiegos (user_id, thiego_id) VALUES (:u, :t)');
    foreach ($st->fetchAll() as $t) {
        if ((int) $t['is_boss']) continue;
        if (isset($owned[(int) $t['id']])) continue;
        if ((int) $t['unlock_level'] > (int) $prog['level']) continue;
        $metric = $t['unlock_metric'];
        $need = (float) $t['unlock_value'];
        $haveVal = match ($metric) {
            'level' => (float) $prog['level'],
            'dopamine' => (float) $prog['total_dopamine_log10'],
            'prestige' => (float) $prog['prestige'],
            'ng' => (float) $prog['ng_cycle'],
            'evolution' => (float) $prog['evolution_tier'],
            default => PHP_FLOAT_MIN,
        };
        if ($haveVal >= $need) {
            $ins->execute([':u' => $uid, ':t' => $t['id']]);
            $newOnes[] = $t['slug'];
            tdf_notify($pdo, $uid, 'Novo Thiego!', 'Você desbloqueou ' . $t['slug'] . '!');
        }
    }
    if ($newOnes) {
        tdf_mission_tick($pdo, $uid, 'thiego_unlock', count($newOnes));
        tdf_achievement_check($pdo, $uid, 'thiego_unlock', tdf_metric_value($pdo, $uid, 'thiego_unlock'));
    }
    return $newOnes;
}

if ($method === 'POST' && $route === 'buy_all') {
    $csrf = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? (tdf_body()['csrf'] ?? ''));
    if (!tdf_check_csrf($pdo, $csrf)) tdf_err(403, 'Token CSRF inválido.');

    // 1) desbloqueia todos os thiegos elegíveis (não-boss)
    $newOnes = tdf_unlock_eligible($pdo, $uid);

    // 2) sobe de nível cada thiego possuído enquanto houver battle_coins
    $st = $pdo->prepare('SELECT id, level FROM user_thiegos WHERE user_id = :u AND level < 100');
    $st->execute([':u' => $uid]);
    $rows = $st->fetchAll();

    $pdo->beginTransaction();
    try {
        $coinSt = $pdo->prepare('SELECT battle_coins FROM user_progress WHERE user_id = :u FOR UPDATE');
        $coinSt->execute([':u' => $uid]);
        $coins = (int) $coinSt->fetch()['battle_coins'];
        $spent = 0;
        $upgrades = []; // ut_id => [before, after, cost]
        foreach ($rows as $r) {
            $utId = (int) $r['id'];
            $lvl = (int) $r['level'];
            $start = $lvl;
            $costSum = 0;
            while ($lvl < 100) {
                $cost = 25 + $lvl * 25;
                if ($coins < $cost) break;
                $coins -= $cost;
                $costSum += $cost;
                $lvl++;
            }
            if ($lvl > $start) {
                $pdo->prepare('UPDATE user_thiegos SET level = :l WHERE id = :id AND user_id = :u')
                    ->execute([':l' => $lvl, ':id' => $utId, ':u' => $uid]);
                $upgrades[] = ['ut_id' => $utId, 'before' => $start, 'after' => $lvl, 'cost' => $costSum];
                $spent += $costSum;
            }
        }
        if ($spent > 0) {
            $pdo->prepare('UPDATE user_progress SET battle_coins = battle_coins - :c WHERE user_id = :u')
                ->execute([':c' => $spent, ':u' => $uid]);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }

    if ($newOnes) tdf_apply_xp($pdo, $uid, count($newOnes) * 5);
    tdf_log($pdo, $uid, 'thiego_buy_all', ['new' => count($newOnes), 'upgraded' => count($upgrades), 'spent' => $spent]);
    tdf_json([
        'ok' => true,
        'new' => $newOnes,
        'upgraded' => count($upgrades),
        'levels' => $upgrades,
        'spent' => $spent,
    ]);
}

tdf_err(404, 'Rota não encontrada.');