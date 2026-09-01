<?php
/**
 * THIEGO DOPAMINA FARM — api/loot.php
 * Caixas de loot: listar, abrir (transação atômica + pity + duplicados
 * em fragmentos) e histórico. Cada abertura dá também um bônus de
 * dopamina proporcional à caixa.
 */

require_once __DIR__ . '/tdf_db.php';
require_once __DIR__ . '/progress.php';

$pdo = tdf_pdo();
tdf_bootstrap();

$route = $_GET['route'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];
$uid = tdf_current_user($pdo);
if (!$uid) tdf_err(401, 'Não autenticado.');

$tier = ['comum' => 1, 'incomum' => 2, 'raro' => 3, 'epico' => 4, 'lendario' => 5, 'mitico' => 6, 'divino' => 7, 'celestial' => 8, 'transcendente' => 9, 'infinito' => 10];
$boxDopamine = ['comum' => 0.5, 'raro' => 1.0, 'epico' => 1.5, 'lendario' => 2.0, 'divino' => 2.5, 'celestial' => 3.0, 'infinito' => 3.5];

if ($method === 'GET' && $route === 'boxes') {
    $prog = tdf_user_progress($pdo, $uid);
    $level = (int) $prog['level'];
    $boxes = $pdo->query('SELECT * FROM loot_boxes ORDER BY cost')->fetchAll();
    $pity = $pdo->prepare('SELECT box_id, counter FROM pity_state WHERE user_id = :u');
    $pity->execute([':u' => $uid]);
    $pityMap = [];
    foreach ($pity->fetchAll() as $p) $pityMap[(int) $p['box_id']] = (int) $p['counter'];

    $list = [];
    foreach ($boxes as $b) {
        $list[] = [
            'slug' => $b['slug'],
            'name' => $b['name'],
            'icon' => $b['icon'],
            'rarity' => $b['rarity'],
            'cost' => (int) $b['cost'],
            'cost_type' => $b['cost_type'],
            'pity_limit' => (int) $b['pity_limit'],
            'pity_guarantee' => $b['pity_guarantee'],
            'unlock_level' => (int) $b['unlock_level'],
            'description' => $b['description'],
            'pity_counter' => $pityMap[(int) $b['id']] ?? 0,
            'locked' => $level < (int) $b['unlock_level'],
        ];
    }
    tdf_json(['ok' => true, 'boxes' => $list, 'coins' => (int) $prog['battle_coins']]);
}

if ($method === 'POST' && $route === 'open') {
    $b = tdf_body();
    $csrf = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($b['csrf'] ?? ''));
    if (!tdf_check_csrf($pdo, $csrf)) tdf_err(403, 'Token CSRF inválido.');
    $slug = (string) ($b['slug'] ?? '');

    $st = $pdo->prepare('SELECT * FROM loot_boxes WHERE slug = :s');
    $st->execute([':s' => $slug]);
    $box = $st->fetch();
    if (!$box) tdf_err(404, 'Caixa não encontrada.');
    $level = tdf_user_progress($pdo, $uid)['level'];
    if ((int) $level < (int) $box['unlock_level']) tdf_err(409, 'Nível insuficiente (precisa ' . $box['unlock_level'] . ').');

    // tabela da caixa (1 linha por raridade)
    $rows = $pdo->prepare('SELECT * FROM loot_tables WHERE box_id = :id');
    $rows->execute([':id' => $box['id']]);
    $tables = $rows->fetchAll();
    if (!$tables) tdf_err(422, 'Caixa sem conteúdo.');

    $pdo->beginTransaction();
    try {
        // custo
        $q = $pdo->prepare('SELECT battle_coins FROM user_progress WHERE user_id = :u FOR UPDATE');
        $q->execute([':u' => $uid]);
        $coins = (int) $q->fetch()['battle_coins'];
        if ($coins < (int) $box['cost']) {
            $pdo->rollBack();
            tdf_err(409, 'Battle Coins insuficientes (precisa ' . $box['cost'] . ').');
        }
        $pdo->prepare('UPDATE user_progress SET battle_coins = battle_coins - :c WHERE user_id = :u')
            ->execute([':c' => (int) $box['cost'], ':u' => $uid]);

        // pity
        $pity = $pdo->prepare('SELECT counter FROM pity_state WHERE user_id = :u AND box_id = :b FOR UPDATE');
        $pity->execute([':u' => $uid, ':b' => $box['id']]);
        $counter = (int) ($pity->fetch()['counter'] ?? 0);

        // escolhe raridade
        $chosen = null;
        $forced = false;
        if ($counter >= (int) $box['pity_limit'] - 1) {
            $forced = true;
            foreach ($tables as $t) {
                if ($t['rarity'] === $box['pity_guarantee']) { $chosen = $t; break; }
            }
        }
        if (!$chosen) {
            $total = 0;
            foreach ($tables as $t) $total += (int) $t['weight'];
            $roll = $total > 0 ? random_int(1, $total) : 1;
            $acc = 0;
            foreach ($tables as $t) {
                $acc += (int) $t['weight'];
                if ($roll <= $acc) { $chosen = $t; break; }
            }
        }
        if (!$chosen) $chosen = $tables[0];

        // recompensa
        $qty = random_int((int) $chosen['qty_min'], max((int) $chosen['qty_min'], (int) $chosen['qty_max']));
        $reward = null;
        if ($chosen['reward_type'] === 'coins') {
            tdf_add_coins($pdo, $uid, $qty);
            $reward = ['type' => 'coins', 'qty' => $qty];
            tdf_mission_tick($pdo, $uid, 'coins_gain', $qty);
        } else {
            if ((int) $chosen['item_id'] > 0) {
                $r = $pdo->prepare('SELECT id, slug, name, icon, category, rarity FROM items WHERE id = :id');
                $r->execute([':id' => $chosen['item_id']]);
                $item = $r->fetch();
                tdf_grant_item($pdo, $uid, (int) $chosen['item_id'], $qty);
                $reward = ['type' => $chosen['reward_type'], 'item_id' => (int) $chosen['item_id'], 'slug' => $item['slug'] ?? null, 'name' => $item['name'] ?? null, 'icon' => $item['icon'] ?? '?', 'category' => $item['category'] ?? null, 'rarity' => $item['rarity'] ?? $chosen['rarity'], 'qty' => $qty];
            } else {
                tdf_add_coins($pdo, $uid, $qty);
                $reward = ['type' => 'coins', 'qty' => $qty];
            }
        }

        // bônus de dopamina pela caixa
        $bonus = $boxDopamine[$box['rarity']] ?? 0.5;
        if ($bonus > 0) tdf_add_dopamine_bonus($pdo, $uid, $bonus);

        // pity: reseta se atingiu a garantia OU rolou raridade >= garantia
        $newCounter = $counter + 1;
        if ($forced || ($tier[$chosen['rarity']] ?? 0) >= ($tier[$box['pity_guarantee']] ?? 0)) {
            $newCounter = 0;
        } else {
            $newCounter = $newCounter >= (int) $box['pity_limit'] ? 0 : $newCounter;
        }
        $pdo->prepare('INSERT INTO pity_state (user_id, box_id, counter) VALUES (:u, :b, :c)
                       ON DUPLICATE KEY UPDATE counter = :c2')
            ->execute([':u' => $uid, ':b' => $box['id'], ':c' => $newCounter, ':c2' => $newCounter]);

        $pdo->prepare('INSERT INTO loot_history (user_id, box_id, result, rarity) VALUES (:u, :b, :r, :rar)')
            ->execute([':u' => $uid, ':b' => $box['id'], ':r' => json_encode($reward, JSON_UNESCAPED_UNICODE), ':rar' => $chosen['rarity']]);
        $pdo->prepare('UPDATE user_stats SET boxes_opened = boxes_opened + 1 WHERE user_id = :u')->execute([':u' => $uid]);

        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }

    tdf_mission_tick($pdo, $uid, 'box_open', 1);
    tdf_achievement_check($pdo, $uid, 'box_open', tdf_metric_value($pdo, $uid, 'box_open'));
    tdf_achievement_sweep($pdo, $uid);
    tdf_log($pdo, $uid, 'loot_open', ['box' => $box['slug'], 'rarity' => $chosen['rarity'], 'forced' => $forced, 'reward' => $reward]);
    tdf_json([
        'ok' => true,
        'box' => $box['slug'],
        'rarity' => $chosen['rarity'],
        'forced' => $forced,
        'reward' => $reward,
        'pity_counter' => $newCounter,
        'pity_limit' => (int) $box['pity_limit'],
    ]);
}

if ($method === 'GET' && $route === 'history') {
    $st = $pdo->prepare(
        'SELECT lh.rarity, lh.result, lh.created_at, b.slug AS box, b.icon
         FROM loot_history lh JOIN loot_boxes b ON b.id = lh.box_id
         WHERE lh.user_id = :u ORDER BY lh.id DESC LIMIT 30'
    );
    $st->execute([':u' => $uid]);
    $rows = $st->fetchAll();
    foreach ($rows as &$r) $r['result'] = json_decode((string) $r['result'], true);
    tdf_json(['ok' => true, 'history' => $rows]);
}

tdf_err(404, 'Rota não encontrada.');